/**
 * citation-store.ts — persist AI citation runs so the number becomes a trend.
 *
 * A single "we were cited in 2 of 18 answers" is an anecdote. The same probe every
 * week, stored, is the only thing that can show whether the GEO/AEO work moved
 * anything — which is the one result a buyer can feel.
 *
 * Kept out of citation-tracker.ts on purpose: the tracker must stay runnable on a
 * GitHub runner with no Oracle wallet. Import this only when persistence is wanted.
 */

import oracledb from 'oracledb';
import { getPoolConnection } from './database';
import type { CitationRun } from './citation-tracker';

let tableReady = false;

/**
 * ORA-955 (name already used) is the expected steady state, not an error — same
 * create-if-absent idiom the rest of the schema uses.
 */
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE ai_citation_runs (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          domain VARCHAR2(200) NOT NULL,
          primary_path VARCHAR2(200),
          tracker_version VARCHAR2(20),
          engines VARCHAR2(400),
          measured NUMBER DEFAULT 0,
          attempted NUMBER DEFAULT 0,
          cited NUMBER DEFAULT 0,
          cited_primary NUMBER DEFAULT 0,
          mentioned NUMBER DEFAULT 0,
          citation_rate NUMBER DEFAULT 0,
          primary_citation_rate NUMBER DEFAULT 0,
          mention_rate NUMBER DEFAULT 0,
          probes CLOB,
          ran_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await connection.commit();
    tableReady = true;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** Returns the new row id, or null when the database is unreachable. */
export async function saveCitationRun(run: CitationRun): Promise<string | null> {
  let connection;
  try {
    await ensureTable();
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `INSERT INTO ai_citation_runs (
         domain, primary_path, tracker_version, engines,
         measured, attempted, cited, cited_primary, mentioned,
         citation_rate, primary_citation_rate, mention_rate,
         probes, ran_at
       ) VALUES (
         :domain, :primaryPath, :trackerVersion, :engines,
         :measured, :attempted, :cited, :citedPrimary, :mentioned,
         :citationRate, :primaryCitationRate, :mentionRate,
         :probes, TO_TIMESTAMP(:ranAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')
       ) RETURNING RAWTOHEX(id) INTO :id`,
      {
        domain: run.domain,
        primaryPath: run.primaryPath,
        trackerVersion: run.trackerVersion,
        engines: run.engines.join(','),
        measured: run.summary.measured,
        attempted: run.summary.attempted,
        cited: run.summary.cited,
        citedPrimary: run.summary.citedPortfolio,
        mentioned: run.summary.mentioned,
        citationRate: run.summary.citationRate,
        primaryCitationRate: run.summary.portfolioCitationRate,
        mentionRate: run.summary.mentionRate,
        probes: JSON.stringify(run.probes),
        ranAt: run.ranAt.replace('Z', 'Z'),
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      },
      { autoCommit: true },
    );
    return result?.outBinds?.id?.[0] ?? null;
  } catch (err: any) {
    console.error('[citation-store] save failed:', err?.message ?? err);
    return null;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export interface CitationTrendRow {
  ranAt: string;
  citationRate: number;
  primaryCitationRate: number;
  mentionRate: number;
  cited: number;
  measured: number;
  engines: string;
}

/** Most recent runs, newest first — the trend the portfolio and the API report. */
export async function getCitationTrend(limit = 12): Promise<CitationTrendRow[]> {
  let connection;
  try {
    await ensureTable();
    connection = await getPoolConnection();
    const result: any = await connection.execute(
      `SELECT ran_at, citation_rate, primary_citation_rate, mention_rate, cited, measured, engines
         FROM ai_citation_runs
        ORDER BY ran_at DESC
        FETCH FIRST :lim ROWS ONLY`,
      { lim: limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result?.rows ?? []).map((r: any) => ({
      ranAt: r.RAN_AT instanceof Date ? r.RAN_AT.toISOString() : String(r.RAN_AT ?? ''),
      citationRate: Number(r.CITATION_RATE ?? 0),
      primaryCitationRate: Number(r.PRIMARY_CITATION_RATE ?? 0),
      mentionRate: Number(r.MENTION_RATE ?? 0),
      cited: Number(r.CITED ?? 0),
      measured: Number(r.MEASURED ?? 0),
      engines: String(r.ENGINES ?? ''),
    }));
  } catch (err: any) {
    console.error('[citation-store] trend read failed:', err?.message ?? err);
    return [];
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}
