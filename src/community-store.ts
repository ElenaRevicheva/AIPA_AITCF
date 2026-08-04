/**
 * community-store.ts — memory for the community listener.
 *
 * The listener's whole value is that it surfaces a thread once, while answering
 * it still matters, and then never mentions it again. Without persistence it
 * would re-draft the same Reddit post every ten minutes until Elena muted the
 * bot, which is the failure mode that kills every alerting system.
 *
 * Kept separate from community-listener.ts for the same reason citation-store is
 * separate from citation-tracker: the listener must stay runnable on a machine
 * with no Oracle wallet (a laptop, a CI runner) so drafts can be reviewed dry.
 */

import oracledb from 'oracledb';
import { getPoolConnection } from './database';

export type SourceId = 'reddit' | 'indiehackers' | 'hackernews';
export type OpportunityStatus = 'queued' | 'posted' | 'skipped';

export interface Opportunity {
  id: string;
  source: SourceId;
  externalId: string;
  url: string;
  title: string;
  author: string;
  score: number;
  matchedQuery: string;
  latam: boolean;
  excerpt: string;
  draft: string;
  status: OpportunityStatus;
  hsTaskId: string | null;
  tgMessageId: number | null;
  foundAt: string;
}

let tableReady = false;

/**
 * ORA-955 (name already used) is the expected steady state, not an error — same
 * create-if-absent idiom the rest of the schema uses. The unique index on
 * (source, external_id) is what actually enforces "offer it once"; the in-memory
 * seen-set is only a cheap first pass.
 */
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE community_opportunities (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          source VARCHAR2(32) NOT NULL,
          external_id VARCHAR2(200) NOT NULL,
          url VARCHAR2(1000),
          title VARCHAR2(1000),
          author VARCHAR2(200),
          score NUMBER DEFAULT 0,
          matched_query VARCHAR2(400),
          latam NUMBER(1) DEFAULT 0,
          excerpt CLOB,
          draft CLOB,
          status VARCHAR2(16) DEFAULT ''queued'',
          hs_task_id VARCHAR2(64),
          tg_message_id NUMBER,
          found_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          decided_at TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX community_opp_src_ext
          ON community_opportunities (source, external_id)';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 AND SQLCODE != -1408 THEN RAISE; END IF;
      END;
    `);
    await connection.commit();
    tableReady = true;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/**
 * Every external id already seen for a source, regardless of status. Skipped
 * threads must stay skipped — re-offering something Elena already rejected is
 * the fastest way to make her stop reading the alerts.
 */
export async function seenExternalIds(source: SourceId): Promise<Set<string>> {
  let connection;
  try {
    await ensureTable();
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `SELECT external_id FROM community_opportunities WHERE source = :source`,
      { source },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return new Set((result?.rows ?? []).map((r: any) => String(r.EXTERNAL_ID)));
  } catch (err: any) {
    console.error('[community-store] seen read failed:', err?.message ?? err);
    return new Set();
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** Returns the new row id, or null when the row already exists or the DB is down. */
export async function saveOpportunity(
  opp: Omit<Opportunity, 'id' | 'status' | 'hsTaskId' | 'tgMessageId' | 'foundAt'>,
): Promise<string | null> {
  let connection;
  try {
    await ensureTable();
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `INSERT INTO community_opportunities (
         source, external_id, url, title, author, score, matched_query, latam, excerpt, draft
       ) VALUES (
         :source, :externalId, :url, :title, :author, :score, :matchedQuery, :latam, :excerpt, :draft
       ) RETURNING RAWTOHEX(id) INTO :id`,
      {
        source: opp.source,
        externalId: opp.externalId.slice(0, 200),
        url: opp.url.slice(0, 1000),
        title: opp.title.slice(0, 1000),
        author: opp.author.slice(0, 200),
        score: opp.score,
        matchedQuery: opp.matchedQuery.slice(0, 400),
        latam: opp.latam ? 1 : 0,
        excerpt: opp.excerpt,
        draft: opp.draft,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      },
      { autoCommit: true },
    );
    return result?.outBinds?.id?.[0] ?? null;
  } catch (err: any) {
    // ORA-00001 is the unique index doing its job on a race — not worth logging loudly.
    if (String(err?.message ?? '').includes('ORA-00001')) return null;
    console.error('[community-store] save failed:', err?.message ?? err);
    return null;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** Records where the draft was delivered so the callback can find it again. */
export async function attachDelivery(
  id: string,
  hsTaskId: string | null,
  tgMessageId: number | null,
): Promise<void> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(
      `UPDATE community_opportunities
          SET hs_task_id = :hsTaskId, tg_message_id = :tgMessageId
        WHERE id = HEXTORAW(:id)`,
      { hsTaskId, tgMessageId, id },
      { autoCommit: true },
    );
  } catch (err: any) {
    console.error('[community-store] attach failed:', err?.message ?? err);
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export async function setStatus(id: string, status: OpportunityStatus): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `UPDATE community_opportunities
          SET status = :status, decided_at = CURRENT_TIMESTAMP
        WHERE id = HEXTORAW(:id)`,
      { status, id },
      { autoCommit: true },
    );
    return (result?.rowsAffected ?? 0) > 0;
  } catch (err: any) {
    console.error('[community-store] status update failed:', err?.message ?? err);
    return false;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `SELECT RAWTOHEX(id) AS ID, source, external_id, url, title, author, score,
              matched_query, latam, excerpt, draft, status, hs_task_id, tg_message_id, found_at
         FROM community_opportunities
        WHERE id = HEXTORAW(:id)`,
      { id },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { EXCERPT: { type: oracledb.STRING }, DRAFT: { type: oracledb.STRING } },
      },
    );
    const r = (result?.rows ?? [])[0];
    if (!r) return null;
    return {
      id: String(r.ID),
      source: String(r.SOURCE) as SourceId,
      externalId: String(r.EXTERNAL_ID),
      url: String(r.URL ?? ''),
      title: String(r.TITLE ?? ''),
      author: String(r.AUTHOR ?? ''),
      score: Number(r.SCORE ?? 0),
      matchedQuery: String(r.MATCHED_QUERY ?? ''),
      latam: Number(r.LATAM ?? 0) === 1,
      excerpt: String(r.EXCERPT ?? ''),
      draft: String(r.DRAFT ?? ''),
      status: String(r.STATUS ?? 'queued') as OpportunityStatus,
      hsTaskId: r.HS_TASK_ID ? String(r.HS_TASK_ID) : null,
      tgMessageId: r.TG_MESSAGE_ID != null ? Number(r.TG_MESSAGE_ID) : null,
      foundAt: r.FOUND_AT instanceof Date ? r.FOUND_AT.toISOString() : String(r.FOUND_AT ?? ''),
    };
  } catch (err: any) {
    console.error('[community-store] read failed:', err?.message ?? err);
    return null;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export interface CommunityStats {
  queued: number;
  posted: number;
  skipped: number;
  latam: number;
  bySource: Array<{ source: string; total: number; posted: number }>;
}

/** Answers the only question that matters after a month: is this producing replies? */
export async function stats(): Promise<CommunityStats> {
  let connection;
  const empty: CommunityStats = { queued: 0, posted: 0, skipped: 0, latam: 0, bySource: [] };
  try {
    await ensureTable();
    connection = await getPoolConnection();
    const totals: any = await connection.execute(
      `SELECT status, COUNT(*) AS N, SUM(latam) AS LATAM
         FROM community_opportunities GROUP BY status`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const out = { ...empty, bySource: [] as CommunityStats['bySource'] };
    for (const r of totals?.rows ?? []) {
      const n = Number(r.N ?? 0);
      out.latam += Number(r.LATAM ?? 0);
      if (r.STATUS === 'queued') out.queued = n;
      else if (r.STATUS === 'posted') out.posted = n;
      else if (r.STATUS === 'skipped') out.skipped = n;
    }
    const perSource: any = await connection.execute(
      `SELECT source,
              COUNT(*) AS TOTAL,
              SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) AS POSTED
         FROM community_opportunities GROUP BY source ORDER BY source`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    out.bySource = (perSource?.rows ?? []).map((r: any) => ({
      source: String(r.SOURCE),
      total: Number(r.TOTAL ?? 0),
      posted: Number(r.POSTED ?? 0),
    }));
    return out;
  } catch (err: any) {
    console.error('[community-store] stats failed:', err?.message ?? err);
    return empty;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}
