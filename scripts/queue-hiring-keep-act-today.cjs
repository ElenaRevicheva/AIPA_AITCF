#!/usr/bin/env node
/**
 * Keep the hiring lane of Elena's own queue EQUAL to "I Act TODAY" — hourly cron.
 *
 * 29 Oct 2026. The hiring lane held 740 `new` rows: everything mirrored before
 * the 18 Oct parked-job filter, plus every job the VJH sweep later moved out of
 * I Act TODAY (the sweep updates HubSpot only, so the queue copy stayed `new`).
 *
 * 29 Oct (later, Elena: "hand-added jobs always appear in my CRM … never refilled with dead
 * jobs, daily automatic"): it also ADDS any I Act TODAY deal the queue lacks — [HIRING-MANUAL]
 * deals were never mirrored — with the apply kit's ✅ letter when it exists. Her own Skip in the
 * CRM wins: an existing row is never revived (upsertQueueItem only refreshes rows still `new`).
 *
 * HubSpot is READ ONLY here — the same search filter as VJH's scripts/sweep_i_act_today.py,
 * plus reading the deal's notes. Nothing is written to HubSpot. In daily_queue, rows not in
 * I Act TODAY become `skipped` (never deleted); an undo file lists every id so
 * `--undo=<file>` puts them back to `new`.
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
const HS = 'https://api.hubapi.com';
const H = () => ({ Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' });

async function hsGet(p) {
  const r = await fetch(HS + p, { headers: H() });
  if (!r.ok) throw new Error(`HubSpot GET ${r.status}`);
  return r.json();
}
const text = (h) => String(h || '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

/** Posting URL + the kit's ✅ letter, from the deal's own notes (read only). */
async function dealPacket(dealId) {
  const a = await hsGet(`/crm/v4/objects/deals/${dealId}/associations/notes?limit=100`);
  let url = '', letter = '';
  for (const { toObjectId } of a.results || []) {
    const n = await hsGet(`/crm/v3/objects/notes/${toObjectId}?properties=hs_note_body`);
    const body = n.properties?.hs_note_body || '';
    url = url || (body.match(/JOB POSTING:\s*<code>([^<]+)<\/code>/)
      || body.match(/href="(https?:[^"]+)"[^>]*>(?:\s*<[^>]+>)*\s*👉\s*APPLY/) || [])[1] || '';
    if (!letter && body.includes('✅ READY TO SEND — cover letter')) letter = text(body);
  }
  return { url: url.replace(/&amp;/g, '&'), letter };
}

/** id → dealname of every hiring deal in I Act TODAY. */
async function actTodayDeals() {
  if (!process.env.HUBSPOT_API_KEY) throw new Error('HUBSPOT_API_KEY missing');
  const deals = new Map();
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [
        { propertyName: 'dealstage', operator: 'EQ', value: 'qualifiedtobuy' },
        { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'HIRING' },
      ] }],
      properties: ['dealname'], limit: 100, ...(after ? { after } : {}),
    };
    const r = await fetch(`${HS}/crm/v3/objects/deals/search`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HubSpot search ${r.status}`);
    const page = await r.json();
    for (const d of page.results || []) deals.set(String(d.id), d.properties.dealname || '');
    after = page.paging?.next?.after;
  } while (after);
  return deals;
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
    const keep = await actTodayDeals();
    const rows = (await c.execute(
      `SELECT RAWTOHEX(id) AS id, hubspot_deal_id FROM daily_queue WHERE lane = 'hiring' AND status = 'new'`,
      {}, { outFormat: 4002 })).rows || [];
    const go = rows.filter(r => !(r.HUBSPOT_DEAL_ID && keep.has(String(r.HUBSPOT_DEAL_ID))));
    const linked = new Set(((await c.execute(
      `SELECT DISTINCT hubspot_deal_id FROM daily_queue WHERE lane = 'hiring' AND hubspot_deal_id IS NOT NULL`,
      {}, { outFormat: 4002 })).rows || []).map(r => String(r.HUBSPOT_DEAL_ID)));
    const missing = [...keep].filter(([id]) => !linked.has(id));
    console.log(`${new Date().toISOString()} I Act TODAY: ${keep.size} hiring deals (HubSpot read only) · ` +
      `queue hiring/new: ${rows.length} · to skip: ${go.length} · to add: ${missing.length}`);
    if (!APPLY) { console.log('dry run — nothing changed. Re-run with --apply.'); return; }

    const { upsertQueueItem } = require('../dist/daily-queue');
    for (const [id, name] of missing) {
      const [title, company = ''] = name.replace(/^\[[^\]]+\]\s*/, '').split(' @ ');
      const { url, letter } = await dealPacket(id);
      // Same job already queued under an older deal and skipped by a MACHINE (acted_at empty)
      // → revive it. Her own Skip stamps acted_at and is never undone.
      await c.execute(
        `UPDATE daily_queue SET status = 'new', hubspot_deal_id = :deal_id, updated_at = CURRENT_TIMESTAMP
          WHERE lane = 'hiring' AND external_key = :ext_key AND status = 'skipped' AND acted_at IS NULL`,
        { deal_id: id, ext_key: url || name }, { autoCommit: true });
      await upsertQueueItem({
        lane: 'hiring', externalKey: url || name, title: title.trim(), company: company.trim(),
        actionUrl: url || undefined, draft: letter, draftTailored: Boolean(letter),
        draftProvider: letter ? 'apply-kit' : undefined, hubspotDealId: id,
      });
      console.log(`added: ${name.slice(0, 90)}${letter ? ' (with ✅ letter)' : ' (letter not ready yet)'}`);
    }
    if (!go.length) return;
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
