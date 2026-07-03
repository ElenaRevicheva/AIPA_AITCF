#!/usr/bin/env node
/**
 * Nightly GA4 → Atlas performance ledger sync.
 * Pulls yesterday's sessions/keyEvents for utm_campaign=atlas_* and POSTs to /api/performance-event.
 *
 * Run on Oracle:
 *   node scripts/sync-atlas-ga4.mjs --dry-run
 *   node scripts/sync-atlas-ga4.mjs
 *
 * Cron (after Elena confirms dry-run): 15 6 * * * cd /home/ubuntu/cto-aipa && node scripts/sync-atlas-ga4.mjs >> /home/ubuntu/logs/atlas-ga4-sync.log 2>&1
 */
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { GA4_READONLY_SCOPE, getGoogleAccessToken } from './google-analytics-auth.mjs';

dotenv.config({ override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const dateArgIdx = process.argv.indexOf('--date');
const TARGET_DATE =
  dateArgIdx >= 0 && process.argv[dateArgIdx + 1]
    ? process.argv[dateArgIdx + 1]
    : null;

const HUB = (process.env.CTO_AIPA_PUBLIC_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SECRET = process.env.OUTREACH_SECRET?.trim();
const GA4_PROPERTY_ID = (process.env.GA4_PROPERTY_ID || '515154124').trim();

if (!DRY_RUN && !SECRET) {
  console.error('OUTREACH_SECRET required (use --dry-run to skip posts)');
  process.exit(1);
}

function resolveSyncDate() {
  if (TARGET_DATE) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
      console.error('--date must be YYYY-MM-DD');
      process.exit(1);
    }
    return TARGET_DATE;
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function ga4SyncNotes(vertical, angleId, date) {
  return `ga4_sync|${vertical}|${angleId || 'unknown'}|${date}`;
}

function parseRow(campaign, adContent, sessionsRaw, keyEventsRaw, syncDate) {
  if (!campaign?.startsWith('atlas_')) return null;
  const vertical = campaign.replace(/^atlas_/, '');
  const angle_id = (adContent || '').trim() || 'unknown';
  const ga4_sessions = Math.max(0, parseInt(String(sessionsRaw), 10) || 0);
  const ga4_key_events = Math.max(0, parseInt(String(keyEventsRaw), 10) || 0);
  if (ga4_sessions === 0 && ga4_key_events === 0) return null;
  return {
    vertical,
    angle_id,
    concept_id: `${vertical}_${syncDate}`,
    metrics: { ga4_sessions, ga4_key_events },
    period_start: syncDate,
    period_end: syncDate,
    notes: ga4SyncNotes(vertical, angle_id, syncDate),
  };
}

async function initOracleIfNeeded() {
  if (DRY_RUN) return null;
  process.env.TNS_ADMIN = process.env.TNS_ADMIN || '/home/ubuntu/cto-aipa/wallet';
  try {
    oracledb.initOracleClient({ libDir: '/opt/instantclient_23_4' });
  } catch (e) {
    if (!(e instanceof Error) || !e.message?.includes('already been initialized')) throw e;
  }
  oracledb.fetchAsString = [oracledb.CLOB];
  return oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionString: process.env.DB_SERVICE_NAME,
  });
}

async function alreadySynced(conn, notes) {
  const r = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM atlas_performance_events
     WHERE source = 'ga4_sync' AND notes = :notes`,
    { notes },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = r.rows?.[0] || {};
  return Number(row.CNT ?? row.cnt ?? 0) > 0;
}

async function fetchGa4AtlasRows(syncDate) {
  const token = await getGoogleAccessToken(GA4_READONLY_SCOPE);
  if (!token) {
    throw new Error('GA4 auth failed — check GOOGLE_ANALYTICS_CREDENTIALS');
  }

  const body = {
    dateRanges: [{ startDate: syncDate, endDate: syncDate }],
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }],
    metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
    dimensionFilter: {
      filter: {
        fieldName: 'sessionCampaignName',
        stringFilter: { matchType: 'BEGINS_WITH', value: 'atlas_' },
      },
    },
  };

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GA4 runReport ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const rows = [];
  for (const row of data.rows || []) {
    const dims = row.dimensionValues || [];
    const metrics = row.metricValues || [];
    const parsed = parseRow(
      dims[0]?.value,
      dims[1]?.value,
      metrics[0]?.value,
      metrics[1]?.value,
      syncDate,
    );
    if (parsed) rows.push(parsed);
  }
  return rows;
}

async function postPerformanceEvent(payload) {
  const body = {
    source: 'ga4_sync',
    concept_id: payload.concept_id,
    vertical: payload.vertical,
    angle_id: payload.angle_id,
    metrics: payload.metrics,
    period_start: payload.period_start,
    period_end: payload.period_end,
    notes: payload.notes,
  };

  if (DRY_RUN) {
    console.log('[dry-run] would POST:', JSON.stringify(body, null, 2));
    return true;
  }

  const res = await fetch(`${HUB}/api/performance-event`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn('post failed', payload.concept_id, await res.text());
    return false;
  }
  if (VERBOSE) console.log('posted', payload.concept_id, payload.angle_id);
  return true;
}

async function main() {
  const syncDate = resolveSyncDate();
  console.log(`GA4 atlas sync for ${syncDate}${DRY_RUN ? ' (dry-run)' : ''}`);

  const ga4Rows = await fetchGa4AtlasRows(syncDate);
  if (!ga4Rows.length) {
    console.log(`GA4 sync: 0 atlas_ rows for ${syncDate}`);
    process.exit(0);
  }

  console.log(`GA4: ${ga4Rows.length} atlas_ row(s) for ${syncDate}`);

  let conn = null;
  try {
    conn = await initOracleIfNeeded();
  } catch (e) {
    if (!DRY_RUN) {
      console.error('Oracle connect failed (needed for idempotency):', e);
      process.exit(1);
    }
  }

  let posted = 0;
  let skipped = 0;
  for (const row of ga4Rows) {
    if (conn && (await alreadySynced(conn, row.notes))) {
      skipped++;
      if (VERBOSE) console.log('skip (already synced)', row.notes);
      continue;
    }
    const ok = await postPerformanceEvent(row);
    if (ok) posted++;
  }

  if (conn) await conn.close();
  console.log(`GA4 sync done: posted=${posted} skipped=${skipped} total=${ga4Rows.length}`);
  process.exit(posted > 0 || skipped > 0 || ga4Rows.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('GA4 sync fatal:', e);
  process.exit(1);
});
