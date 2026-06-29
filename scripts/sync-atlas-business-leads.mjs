#!/usr/bin/env node
/**
 * Sync business_leads with utm_campaign=atlas_* → atlas_performance_events.
 * Run on Oracle: node scripts/sync-atlas-business-leads.mjs
 *
 * Prefer utm_term (concept_id) when present; dedupes by business_leads id in notes.
 */
import 'dotenv/config';
import oracledb from 'oracledb';

process.env.TNS_ADMIN = process.env.TNS_ADMIN || '/home/ubuntu/cto-aipa/wallet';
try {
  oracledb.initOracleClient({ libDir: '/opt/instantclient_23_4' });
} catch (e) {
  if (!(e instanceof Error) || !e.message?.includes('already been initialized')) throw e;
}
oracledb.fetchAsString = [oracledb.CLOB];

const HUB = (process.env.CTO_AIPA_PUBLIC_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SECRET = process.env.OUTREACH_SECRET?.trim();
if (!SECRET) {
  console.error('OUTREACH_SECRET required');
  process.exit(1);
}

function conceptFromUtm(campaign, utmTerm, utmContent, createdAt) {
  const vertical = campaign.replace(/^atlas_/, '');
  let concept_id = (utmTerm || '').trim();
  if (!/^[a-z0-9_]+_\d{4}-\d{2}-\d{2}$/.test(concept_id)) {
    const day =
      createdAt instanceof Date
        ? createdAt.toISOString().slice(0, 10)
        : String(createdAt).slice(0, 10);
    concept_id = `${vertical}_${day}`;
  }
  return { concept_id, vertical, angle_id: utmContent || undefined };
}

async function alreadySynced(conn, leadId) {
  const r = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM atlas_performance_events
     WHERE source = 'aideazz_leads' AND notes = :notes`,
    { notes: `business_leads id ${leadId}` },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = r.rows?.[0] || {};
  return Number(row.CNT ?? row.cnt ?? 0) > 0;
}

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionString: process.env.DB_SERVICE_NAME,
  });
  const r = await conn.execute(
    `SELECT RAWTOHEX(id) AS id, utm_campaign, utm_term, utm_content, utm_source, created_at
     FROM business_leads
     WHERE utm_campaign LIKE 'atlas_%'
     ORDER BY created_at DESC FETCH FIRST 200 ROWS ONLY`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const rows = r.rows || [];
  let ok = 0;
  for (const row of rows) {
    const leadId = String(row.ID ?? row.id);
    if (await alreadySynced(conn, leadId)) continue;

    const { concept_id, vertical, angle_id } = conceptFromUtm(
      row.UTM_CAMPAIGN,
      row.UTM_TERM,
      row.UTM_CONTENT,
      row.CREATED_AT,
    );
    const day =
      row.CREATED_AT instanceof Date
        ? row.CREATED_AT.toISOString().slice(0, 10)
        : String(row.CREATED_AT).slice(0, 10);
    const body = {
      source: 'aideazz_leads',
      concept_id,
      vertical,
      angle_id,
      metrics: { leads: 1 },
      period_start: day,
      period_end: day,
      notes: `business_leads id ${leadId}`,
    };
    const res = await fetch(`${HUB}/api/performance-event`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) ok++;
    else console.warn('skip', concept_id, await res.text());
  }
  await conn.close();
  console.log(`synced ${ok}/${rows.length} atlas lead events (${rows.length - ok} skipped or failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
