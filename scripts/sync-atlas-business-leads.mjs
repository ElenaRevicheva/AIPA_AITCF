#!/usr/bin/env node
/**
 * Sync business_leads with utm_campaign=atlas_* → atlas_performance_events.
 * Run on Oracle: node scripts/sync-atlas-business-leads.mjs
 *
 * Counts each lead as metrics.leads=1 (deduped by lead id per day).
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

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionString: process.env.DB_SERVICE_NAME,
  });
  const r = await conn.execute(
    `SELECT id, utm_campaign, utm_content, utm_source, created_at
     FROM business_leads
     WHERE utm_campaign LIKE 'atlas_%'
     ORDER BY created_at DESC FETCH FIRST 200 ROWS ONLY`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  await conn.close();

  const rows = (r.rows || []) as Array<{
    ID: string;
    UTM_CAMPAIGN: string;
    UTM_CONTENT: string | null;
    UTM_SOURCE: string | null;
    CREATED_AT: Date;
  }>;

  let ok = 0;
  for (const row of rows) {
    const vertical = row.UTM_CAMPAIGN.replace(/^atlas_/, '');
    const day = row.CREATED_AT instanceof Date ? row.CREATED_AT.toISOString().slice(0, 10) : String(row.CREATED_AT).slice(0, 10);
    const concept_id = `${vertical}_${day}`;
    const body = {
      source: 'aideazz_leads',
      concept_id,
      vertical,
      angle_id: row.UTM_CONTENT || undefined,
      metrics: { leads: 1 },
      period_start: day,
      period_end: day,
      notes: `business_leads id ${row.ID}`,
    };
    const res = await fetch(`${HUB}/api/performance-event`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) ok++;
    else console.warn('skip', concept_id, await res.text());
  }
  console.log(`synced ${ok}/${rows.length} atlas lead events`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
