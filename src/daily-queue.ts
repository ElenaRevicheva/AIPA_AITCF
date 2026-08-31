/**
 * The daily queue — the data layer for Elena's own CRM.
 *
 * Why this exists (31 Aug 2026): the ops dashboard read HubSpot, which has no
 * urgency property and no vocabulary for VJH's real states, so the workflow was
 * being stuffed into sales stages that mean something else — `lead_parked`
 * written as `appointmentscheduled`, 25 items all reading "qualifiedtobuy" and
 * all reading NEEDS ACTION, which is the same as none of them reading it.
 *
 * This table holds the states that are actually hers. HubSpot stays the system
 * of record — deals, contacts, email history, the audit trail — and is **never
 * written to from here**. `hubspot_deal_id` is a link so a card can deep-link to
 * the record, exactly as `crm_event_log` already does. Nothing in this module
 * issues a HubSpot write of any kind.
 *
 * Two lanes, because that is what a day actually looks like:
 *   hiring — an employer to apply to, with the cover letter already drafted
 *   client — a prospect to contact, with the outreach already drafted
 *
 * The draft is stored HERE rather than only in a HubSpot Note so the page can
 * render without depending on HubSpot being up, being paid for, or being fast.
 */
import oracledb from 'oracledb';
import { getPoolConnection } from './database';

export type QueueLane = 'hiring' | 'client';
/** Her states, not HubSpot's. */
export type QueueStatus = 'new' | 'working' | 'done' | 'skipped';

export interface QueueItem {
  id: string;
  lane: QueueLane;
  /** The dedupe key (job URL, or outreach slug). Used to match against the send ledger. */
  externalKey: string;
  title: string;
  company: string;
  actionUrl: string;
  draft: string;
  draftTailored: boolean;
  draftProvider?: string | undefined;
  draftReason?: string | undefined;
  score?: number | undefined;
  status: QueueStatus;
  hubspotDealId?: string | undefined;
  createdAt?: string | undefined;
}

let initialised = false;

/** Idempotent DDL. ORA-955 = "already exists", which is success here. */
export async function initDailyQueueTable(): Promise<void> {
  if (initialised) return;
  const connection = await getPoolConnection();
  try {
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE daily_queue (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          lane VARCHAR2(16) NOT NULL,
          external_key VARCHAR2(200) NOT NULL,
          title VARCHAR2(500),
          company VARCHAR2(300),
          action_url VARCHAR2(2000),
          draft CLOB,
          draft_tailored NUMBER(1) DEFAULT 0,
          draft_provider VARCHAR2(40),
          draft_reason VARCHAR2(300),
          score NUMBER(3),
          status VARCHAR2(20) DEFAULT ''new'',
          hubspot_deal_id VARCHAR2(32),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          acted_at TIMESTAMP
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    // The dedupe key. VJH re-notes the same job when it reappears in a feed, and
    // a queue that shows the same role twice is a queue she stops trusting.
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX daily_queue_key ON daily_queue (lane, external_key)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 AND SQLCODE != -1408 THEN RAISE; END IF;
      END;
    `);
    await connection.commit();
    initialised = true;
  } finally {
    await connection.close();
  }
}

/**
 * Insert, or refresh an item she has not acted on yet.
 *
 * Deliberately does NOT overwrite `status`: if she has already marked something
 * done or skipped, a later re-ingest of the same job must not resurrect it into
 * her queue. That is the difference between a queue and a list.
 */
export async function upsertQueueItem(item: {
  lane: QueueLane;
  externalKey: string;
  title: string;
  company: string;
  actionUrl?: string | undefined;
  draft: string;
  draftTailored: boolean;
  draftProvider?: string | undefined;
  draftReason?: string | undefined;
  score?: number | undefined;
  hubspotDealId?: string | undefined;
}): Promise<void> {
  await initDailyQueueTable();
  const connection = await getPoolConnection();
  try {
    await connection.execute(
      `MERGE INTO daily_queue d
         USING (SELECT :lane AS lane, :key AS external_key FROM dual) s
         ON (d.lane = s.lane AND d.external_key = s.external_key)
       WHEN MATCHED THEN UPDATE SET
         title = :title, company = :company, action_url = :url,
         draft = :draft, draft_tailored = :tailored, draft_provider = :provider,
         draft_reason = :reason, score = :score, hubspot_deal_id = :deal,
         updated_at = CURRENT_TIMESTAMP
         WHERE d.status = 'new'
       WHEN NOT MATCHED THEN INSERT
         (lane, external_key, title, company, action_url, draft, draft_tailored,
          draft_provider, draft_reason, score, hubspot_deal_id)
       VALUES
         (:lane, :key, :title, :company, :url, :draft, :tailored,
          :provider, :reason, :score, :deal)`,
      {
        lane: item.lane,
        key: item.externalKey.slice(0, 200),
        title: item.title.slice(0, 500),
        company: item.company.slice(0, 300),
        url: (item.actionUrl || '').slice(0, 2000),
        draft: item.draft,
        tailored: item.draftTailored ? 1 : 0,
        provider: (item.draftProvider || '').slice(0, 40) || null,
        reason: (item.draftReason || '').slice(0, 300) || null,
        score: item.score ?? null,
        deal: (item.hubspotDealId || '').slice(0, 32) || null,
      },
    );
    await connection.commit();
  } finally {
    await connection.close();
  }
}

const FETCH_DRAFT = { DRAFT: { type: oracledb.STRING } };

/**
 * The open queue, best first.
 *
 * Ranked by tailored-first, then score: a job whose letter is boilerplate is
 * worth less of her morning than one she can send, because the boilerplate one
 * still costs her the writing.
 */
export async function getQueue(lane: QueueLane, limit = 5): Promise<QueueItem[]> {
  await initDailyQueueTable();
  const connection = await getPoolConnection();
  try {
    const res = await connection.execute(
      `SELECT * FROM (
         SELECT RAWTOHEX(id) AS id, lane, external_key, title, company, action_url, draft,
                draft_tailored, draft_provider, draft_reason, score, status,
                hubspot_deal_id, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
           FROM daily_queue
          WHERE lane = :lane AND status = 'new'
          ORDER BY draft_tailored DESC, NVL(score, 0) DESC, created_at DESC
       ) WHERE ROWNUM <= :lim`,
      { lane, lim: limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: FETCH_DRAFT },
    );
    return ((res.rows as Record<string, unknown>[]) || []).map(r => ({
      id: String(r.ID),
      lane: String(r.LANE) as QueueLane,
      externalKey: String(r.EXTERNAL_KEY ?? ''),
      title: String(r.TITLE ?? ''),
      company: String(r.COMPANY ?? ''),
      actionUrl: String(r.ACTION_URL ?? ''),
      draft: String(r.DRAFT ?? ''),
      draftTailored: Number(r.DRAFT_TAILORED) === 1,
      draftProvider: r.DRAFT_PROVIDER ? String(r.DRAFT_PROVIDER) : undefined,
      draftReason: r.DRAFT_REASON ? String(r.DRAFT_REASON) : undefined,
      score: r.SCORE == null ? undefined : Number(r.SCORE),
      status: String(r.STATUS) as QueueStatus,
      hubspotDealId: r.HUBSPOT_DEAL_ID ? String(r.HUBSPOT_DEAL_ID) : undefined,
      createdAt: r.CREATED_AT ? String(r.CREATED_AT) : undefined,
    }));
  } finally {
    await connection.close();
  }
}

/** One record by id, for the record page. Returns null when it does not exist. */
export async function getQueueItemById(id: string): Promise<QueueItem | null> {
  await initDailyQueueTable();
  const connection = await getPoolConnection();
  try {
    const res = await connection.execute(
      `SELECT RAWTOHEX(id) AS id, lane, external_key, title, company, action_url, draft,
              draft_tailored, draft_provider, draft_reason, score, status,
              hubspot_deal_id, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM daily_queue WHERE id = HEXTORAW(:id)`,
      { id: id.replace(/-/g, '') },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: FETCH_DRAFT },
    );
    const r = ((res.rows as Record<string, unknown>[]) || [])[0];
    if (!r) return null;
    return {
      id: String(r.ID),
      lane: String(r.LANE) as QueueLane,
      externalKey: String(r.EXTERNAL_KEY ?? ''),
      title: String(r.TITLE ?? ''),
      company: String(r.COMPANY ?? ''),
      actionUrl: String(r.ACTION_URL ?? ''),
      draft: String(r.DRAFT ?? ''),
      draftTailored: Number(r.DRAFT_TAILORED) === 1,
      draftProvider: r.DRAFT_PROVIDER ? String(r.DRAFT_PROVIDER) : undefined,
      draftReason: r.DRAFT_REASON ? String(r.DRAFT_REASON) : undefined,
      score: r.SCORE == null ? undefined : Number(r.SCORE),
      status: String(r.STATUS) as QueueStatus,
      hubspotDealId: r.HUBSPOT_DEAL_ID ? String(r.HUBSPOT_DEAL_ID) : undefined,
      createdAt: r.CREATED_AT ? String(r.CREATED_AT) : undefined,
    };
  } finally {
    await connection.close();
  }
}

/** Move an item into one of HER states. Writes nothing to HubSpot. */
export async function setQueueStatus(id: string, status: QueueStatus): Promise<boolean> {
  await initDailyQueueTable();
  const connection = await getPoolConnection();
  try {
    const res = await connection.execute(
      `UPDATE daily_queue
          SET status = :status,
              acted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = HEXTORAW(:id)`,
      { status, id: id.replace(/-/g, '') },
    );
    await connection.commit();
    return (res.rowsAffected || 0) > 0;
  } finally {
    await connection.close();
  }
}

/** Counts per status, for the header. */
export async function getQueueCounts(): Promise<Record<string, number>> {
  await initDailyQueueTable();
  const connection = await getPoolConnection();
  try {
    const res = await connection.execute(
      `SELECT lane, status, COUNT(*) AS n FROM daily_queue GROUP BY lane, status`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const out: Record<string, number> = {};
    for (const r of (res.rows as Record<string, unknown>[]) || []) {
      out[`${String(r.LANE)}_${String(r.STATUS)}`] = Number(r.N);
    }
    return out;
  } finally {
    await connection.close();
  }
}
