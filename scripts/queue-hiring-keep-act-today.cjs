#!/usr/bin/env node
/**
 * Keep only "I Act TODAY" jobs in the hiring lane of Elena's own queue.
 *
 * 29 Oct 2026. The hiring lane held 740 `new` rows: everything mirrored before
 * the 18 Oct parked-job filter, plus every job the VJH sweep later moved out of
 * I Act TODAY (the sweep updates HubSpot only, so the queue copy stayed `new`).
 *
 * HubSpot is READ ONLY here — one search, the same filter as VJH's
 * scripts/sweep_i_act_today.py. Nothing is written to HubSpot. In daily_queue,
 * rows not in I Act TODAY become `skipped` (never deleted); an undo file lists
 * every id so `--undo=<file>` puts them back to `new`.
 *
 * Run on Oracle from ~/cto-aipa:
 *   node scripts/queue-hiring-keep-act-today.cjs            # dry run
 *   node scripts/queue-hiring-keep-act-today.cjs --apply
 *   node scripts/queue-hiring-keep-act-today.cjs --undo=<file>
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../dist/database');

const APPLY = process.argv.includes('--apply');
const UNDO = (process.argv.find(a => a.startsWith('--undo=')) || '').slice(7);

async function actTodayDealIds() {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error('HUBSPOT_API_KEY missing');
  const ids = new Set();
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [
        { propertyName: 'dealstage', operator: 'EQ', value: 'qualifiedtobuy' },
        { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'HIRING' },
      ] }],
      properties: ['dealname'], limit: 100, ...(after ? { after } : {}),
    };
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HubSpot search ${r.status}`);
    const page = await r.json();
    for (const d of page.results || []) ids.add(String(d.id));
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}

async function setStatus(c, ids, from, to) {
  let n = 0;
  for (const id of ids) {
    const r = await c.execute(
      `UPDATE daily_queue SET status = :new_status, updated_at = CURRENT_TIMESTAMP
        WHERE id = HEXTORAW(:row_id) AND lane = 'hiring' AND status = :old_status`,
      { new_status: to, row_id: id, old_status: from }, { autoCommit: false });
    n += r.rowsAffected || 0;
  }
  await c.commit();
  return n;
}

(async () => {
  const c = await db.getPoolConnection();
  try {
    if (UNDO) {
      const ids = JSON.parse(fs.readFileSync(UNDO, 'utf8')).skipped_ids;
      console.log(`undo: ${await setStatus(c, ids, 'skipped', 'new')} of ${ids.length} rows back to new`);
      return;
    }
    const keep = await actTodayDealIds();
    const res = await c.execute(
      `SELECT RAWTOHEX(id) AS id, hubspot_deal_id FROM daily_queue WHERE lane = 'hiring' AND status = 'new'`,
      {}, { outFormat: 4002 });
    const rows = res.rows || [];
    const stay = rows.filter(r => r.HUBSPOT_DEAL_ID && keep.has(String(r.HUBSPOT_DEAL_ID)));
    const go = rows.filter(r => !stay.includes(r));
    const noLink = go.filter(r => !r.HUBSPOT_DEAL_ID).length;
    console.log(`I Act TODAY in HubSpot: ${keep.size} hiring deals (read only)`);
    console.log(`queue hiring/new: ${rows.length} · stays: ${stay.length} · to skip: ${go.length} (${noLink} with no deal link)`);
    if (!APPLY) { console.log('dry run — nothing changed. Re-run with --apply.'); return; }
    const dir = path.join(process.env.HOME || '.', '_session-backups');
    fs.mkdirSync(dir, { recursive: true });
    const undo = path.join(dir, `queue-hiring-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(undo, JSON.stringify({ at: new Date().toISOString(), skipped_ids: go.map(r => r.ID) }, null, 1));
    console.log(`undo file → ${undo}`);
    console.log(`skipped: ${await setStatus(c, go.map(r => r.ID), 'new', 'skipped')}`);
  } finally {
    await c.close();
  }
})().then(() => process.exit(0), e => { console.error('✗', e.message); process.exit(1); });
