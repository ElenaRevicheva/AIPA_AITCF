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
const oracledb = require('oracledb');

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

/** Which kit note this is — the same markers hs-audit-apply-kit.cjs counts. */
function kindOf(body) {
  if (body.includes('📋 COMET PROMPT')) return 'comet';
  if (body.includes('TECHNICAL DEFENSE')) return 'defense';
  if (body.includes('🎯 ROLE DEFENSE')) return 'role';
  if (body.includes('COMPANY BRIEF')) return 'brief';
  if (/COVER LETTER/i.test(body)) return 'letter';
  if (body.includes('JOB POSTING:')) return 'posting';
  return 'note';
}

const FILE_NAMES = new Map();
/** "CV_….pdf" for a HubSpot file id (one GET per file per run). */
async function fileName(id) {
  if (!FILE_NAMES.has(id)) {
    let name = `file ${id}`;
    try {
      const f = await hsGet(`/files/v3/files/${id}`);
      name = f.extension ? `${f.name}.${f.extension}` : String(f.name || name);
    } catch { /* keep the id-based name: a download still works by id */ }
    FILE_NAMES.set(id, name);
  }
  return FILE_NAMES.get(id);
}

/** Posting URL, the kit's ✅ letter, and Elena's own copy of EVERY note on the deal (read only). */
async function dealPacket(dealId) {
  const a = await hsGet(`/crm/v4/objects/deals/${dealId}/associations/notes?limit=100`);
  const ids = (a.results || []).map((r) => String(r.toObjectId));
  const notes = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${HS}/crm/v3/objects/notes/batch/read`, { method: 'POST', headers: H(), body: JSON.stringify({
      properties: ['hs_note_body', 'hs_timestamp', 'hs_attachment_ids'], inputs: ids.slice(i, i + 100).map((id) => ({ id })) }) });
    if (!r.ok) throw new Error(`HubSpot notes batch ${r.status}`);
    notes.push(...((await r.json()).results || []));
  }
  notes.sort((x, y) => String(x.properties?.hs_timestamp || '').localeCompare(String(y.properties?.hs_timestamp || '')));
  let url = '', letter = '';
  const kit = [];
  for (const n of notes) {
    const body = n.properties?.hs_note_body || '';
    url = url || (body.match(/JOB POSTING:\s*<code>([^<]+)<\/code>/)
      || body.match(/href="(https?:[^"]+)"[^>]*>(?:\s*<[^>]+>)*\s*👉\s*APPLY/) || [])[1] || '';
    if (!letter && body.includes('✅ READY TO SEND — cover letter')) letter = text(body);
    // 31 Oct 2026: the note's files (the CV) by id + name only — the PDF itself stays in HubSpot
    // (her rule: CVs live on the deal note). The CRM fetches a 5-minute link when she clicks.
    const files = [];
    for (const fid of String(n.properties?.hs_attachment_ids || '').split(';').filter(Boolean)) {
      files.push({ id: fid, name: await fileName(fid) });
    }
    kit.push({ kind: kindOf(body), at: String(n.properties?.hs_timestamp || ''), text: text(body), ...(files.length ? { files } : {}) });
  }
  return { url: url.replace(/&amp;/g, '&'), letter, kit };
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
  // Adds kit_notes / kit_synced_at if missing (idempotent DDL, same as the server).
  await require('../dist/daily-queue').initDailyQueueTable();
  const c = await db.getPoolConnection();
  try {
    if (UNDO) {
      const ids = JSON.parse(fs.readFileSync(UNDO, 'utf8')).skipped_ids;
      console.log(`undo: ${await setStatus(c, ids, 'skipped', 'new')} of ${ids.length} rows back to new`);
      return;
    }
    const keep = await actTodayDeals();
    // A job back in I Act TODAY that a MACHINE skipped earlier (sweep, or this sync) returns.
    // Her own Skip stamps acted_at and is never undone.
    let revived = 0;
    if (APPLY) {
      for (const id of keep.keys()) {
        const r = await c.execute(
          `UPDATE daily_queue SET status = 'new', updated_at = CURRENT_TIMESTAMP
            WHERE lane = 'hiring' AND hubspot_deal_id = :deal_id AND status = 'skipped' AND acted_at IS NULL`,
          { deal_id: id }, { autoCommit: true });
        revived += r.rowsAffected || 0;
      }
    }
    const rows = (await c.execute(
      `SELECT RAWTOHEX(id) AS id, hubspot_deal_id FROM daily_queue WHERE lane = 'hiring' AND status = 'new'`,
      {}, { outFormat: 4002 })).rows || [];
    const go = rows.filter(r => !(r.HUBSPOT_DEAL_ID && keep.has(String(r.HUBSPOT_DEAL_ID))));
    const linked = new Set(((await c.execute(
      `SELECT DISTINCT hubspot_deal_id FROM daily_queue WHERE lane = 'hiring' AND hubspot_deal_id IS NOT NULL`,
      {}, { outFormat: 4002 })).rows || []).map(r => String(r.HUBSPOT_DEAL_ID)));
    const missing = [...keep].filter(([id]) => !linked.has(id));
    console.log(`${new Date().toISOString()} I Act TODAY: ${keep.size} hiring deals (HubSpot read only) · ` +
      `queue hiring/new: ${rows.length} · to skip: ${go.length} · to add: ${missing.length} · revived: ${revived}`);
    if (!APPLY) { console.log('dry run — nothing changed. Re-run with --apply.'); return; }

    const { upsertQueueItem } = require('../dist/daily-queue');
    const packets = new Map();
    for (const id of keep.keys()) packets.set(id, await dealPacket(id));
    for (const [id, name] of missing) {
      const [title, company = ''] = name.replace(/^\[[^\]]+\]\s*/, '').split(' @ ');
      const { url, letter } = packets.get(id);
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
    // 30 Oct 2026 — her own copy of the kit: every note on every live deal, refreshed hourly.
    // The result line is the reconciliation: copied N of N live deals, and how many carry the full kit.
    // The posting LINK counts, wherever it sits: hand-staged deals carry a 📌 note, VJH deals put
    // the link inside their own note (the audit's ✓LINK reads it the same way).
    const FULL = ['brief', 'role', 'defense', 'letter', 'comet'];
    let copied = 0, notes = 0, full = 0;
    for (const [id, p] of packets) {
      const r = await c.execute(
        `UPDATE daily_queue SET kit_notes = :kit, kit_synced_at = CURRENT_TIMESTAMP
          WHERE lane = 'hiring' AND hubspot_deal_id = :deal_id AND status IN ('new', 'working')`,
        { kit: { val: JSON.stringify(p.kit), type: oracledb.DB_TYPE_CLOB }, deal_id: id }, { autoCommit: true });
      if (r.rowsAffected) {
        copied++; notes += p.kit.length;
        const kinds = new Set(p.kit.map((n) => n.kind));
        if (p.url && FULL.every((k) => kinds.has(k))) full++;
      }
    }
    console.log(`kit copied: ${copied}/${keep.size} live deals · ${notes} notes · full kit (link🔎🎯🛡️✅📋) on ${full}`);
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
