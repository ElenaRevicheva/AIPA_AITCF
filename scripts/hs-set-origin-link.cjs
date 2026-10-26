#!/usr/bin/env node
/**
 * hs-set-origin-link.cjs — point a hiring deal at the ORIGIN posting instead of an aggregator copy.
 *
 * Earned 24 Oct 2026 (CI&T job 32354): VJH's Bright Data door built a full apply kit on deal
 * 66619289430 from a dailyremote.com copy — a paid aggregator whose every Apply button is its own
 * $14.95 checkout — while the origin on jobs.lever.co/ciandt was parked as a second deal. The door
 * now resolves the origin itself (VJH src/search/serpapi_jobs_ingest.py, ORIGIN_HOSTS); this script
 * repairs the deals made before that, one at a time, by name, and merges the twin so one deal is the
 * one source of truth (Elena's iron rule, 23 Oct).
 *
 * What it does on --apply (dry run prints the plan and changes nothing):
 *   1. description: "Job URL: <copy>" becomes "Job URL: <origin>" + "Aggregator copy (do not pay): <copy>"
 *   2. every note that carries the copy's URL gets the origin URL instead (📋 Comet, ✅ letter, 🎯, ⚠️)
 *   3. --rename="<new deal name>"  optional
 *   4. a 🔗 ORIGIN POSTING note on top, with --facts="…" (what the origin says that the copy did not)
 *   5. --merge=<dupDealId>  merges the twin INTO --deal (HubSpot keeps the primary's properties,
 *      moves the twin's notes/tasks over). Irreversible — the dry run names it.
 *
 * Usage:
 *   node scripts/hs-set-origin-link.cjs --deal=66619289430 --origin=https://jobs.lever.co/ciandt/… \
 *        [--merge=66678401330] [--rename="…"] [--facts="…"] [--apply]
 */
'use strict';

const { hubspotKey } = require('./hs-env.cjs');

const HS = hubspotKey();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const DEAL = String(args.deal || '');
const ORIGIN = String(args.origin || '');
const MERGE = args.merge ? String(args.merge) : '';
const RENAME = args.rename ? String(args.rename) : '';
const FACTS = args.facts ? String(args.facts) : '';
const APPLY = !!args.apply;
const MERGE_ONLY = !!args['merge-only'];

if (!HS) { console.log('ABORT — HUBSPOT_API_KEY missing'); process.exit(1); }
if (!/^\d+$/.test(DEAL) || !/^https:\/\//.test(ORIGIN)) {
  console.log('usage: --deal=<id> --origin=https://… [--merge=<id>] [--rename="…"] [--facts="…"] [--apply]');
  process.exit(1);
}

async function hs(method, endpoint, body) {
  const r = await fetch('https://api.hubapi.com' + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + HS, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${endpoint} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  return data;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function notesOf(dealId) {
  const a = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes?limit=100`);
  const ids = (a.results || []).map((r) => r.toObjectId);
  if (!ids.length) return [];
  const b = await hs('POST', '/crm/v3/objects/notes/batch/read', {
    properties: ['hs_note_body', 'hs_timestamp'], inputs: ids.map((id) => ({ id: String(id) })),
  });
  return (b.results || []).sort((x, y) => String(y.properties.hs_timestamp).localeCompare(String(x.properties.hs_timestamp)));
}

(async () => {
  const deal = await hs('GET', `/crm/v3/objects/deals/${DEAL}?properties=dealname,description,dealstage`);
  const p = deal.properties;
  const copyUrl = (p.description || '').match(/^Job URL:\s*(\S+)/m)?.[1] || '';
  console.log(`deal ${DEAL}: ${p.dealname}\n  stage: ${p.dealstage}\n  Job URL now: ${copyUrl || '(none)'}\n  origin:      ${ORIGIN}`);
  if (!copyUrl) { console.log('ABORT — no "Job URL:" line in the description'); process.exit(1); }
  if (copyUrl === ORIGIN) console.log('  description already carries the origin');

  const notes = await notesOf(DEAL);
  const carrying = notes.filter((n) => String(n.properties.hs_note_body || '').includes(copyUrl));
  console.log(`  notes: ${notes.length}, carrying the copy URL: ${carrying.length}`);

  let dup = null;
  if (MERGE) {
    dup = await hs('GET', `/crm/v3/objects/deals/${MERGE}?properties=dealname,description,dealstage`);
    console.log(`  merge twin ${MERGE}: ${dup.properties.dealname} (stage ${dup.properties.dealstage}) INTO ${DEAL} — irreversible`);
  }
  if (RENAME) console.log(`  rename → ${RENAME}`);

  if (!APPLY) { console.log('\nDRY RUN — nothing changed. Add --apply.'); return; }

  // --merge-only: the link work was already done (24 Oct it went through the HubSpot connector
  // while this script's Bash run was refused); only the twin is left to merge.
  if (MERGE_ONLY || copyUrl === ORIGIN) {
    if (!MERGE) { console.log('nothing to do: the description already carries the origin and no --merge given'); return; }
    await mergeAndReadBack();
    return;
  }

  // 1. description
  const desc = (p.description || '')
    .replace(/^Job URL:.*$/m, `Job URL: ${ORIGIN}\nAggregator copy (do not pay): ${copyUrl}`);
  const props = { description: desc };
  if (RENAME) props.dealname = RENAME;
  await hs('PATCH', `/crm/v3/objects/deals/${DEAL}`, { properties: props });
  console.log('  ✓ description' + (RENAME ? ' + name' : ''));

  // 2. notes that carry the copy's URL
  for (const n of carrying) {
    const body = String(n.properties.hs_note_body).replace(new RegExp(escRe(copyUrl), 'g'), ORIGIN);
    await hs('PATCH', `/crm/v3/objects/notes/${n.id}`, { properties: { hs_note_body: body } });
  }
  console.log(`  ✓ ${carrying.length} note(s) now link the origin`);

  // 4. the origin note
  const html = `<strong>🔗 ORIGIN POSTING — apply here, never through the aggregator</strong>`
    + `<p>📱 <a href="${esc(ORIGIN)}"><strong>👉 ${esc(ORIGIN)}</strong></a></p>`
    + (FACTS ? `<p><strong>What the origin says:</strong> ${esc(FACTS)}</p>` : '')
    + `<p>This deal was first built from a copy on <code>${esc(new URL(copyUrl).hostname)}</code>, a paid aggregator `
    + `whose Apply buttons lead to its own checkout. The copy's URL is kept in the description for the record. `
    + `Every note on this deal now links the origin; the 📋 Comet prompt opens the origin.</p>`
    + `<p><em>Repaired ${new Date().toISOString().slice(0, 10)} by scripts/hs-set-origin-link.cjs. `
    + `VJH resolves the origin itself since 24 Oct 2026 (ORIGIN_HOSTS in serpapi_jobs_ingest.py).</em></p>`;
  await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
    associations: [{ to: { id: DEAL }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
  });
  console.log('  ✓ 🔗 ORIGIN POSTING note');

  // 5. merge the twin
  if (MERGE) await mergeAndReadBack();
  else {
    const after = await hs('GET', `/crm/v3/objects/deals/${DEAL}?properties=dealname,description,num_notes`);
    console.log(`\nREAD BACK deal ${DEAL}: ${after.properties.dealname}\n${after.properties.description}\n  notes: ${after.properties.num_notes}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

/**
 * A HubSpot merge makes a NEW deal id and redirects both old ids to it (Scale Army, 26 Oct 2026: 65888440491 +
 * 66542482950 → 66727328882). So "GET the twin" answers 200 with the merged deal and is no proof of anything;
 * the proof is `hs_merged_object_ids` on the merged deal naming both. The deal id changes — tell the user.
 */
async function mergeAndReadBack() {
  const merged = await hs('POST', '/crm/v3/objects/deals/merge', { primaryObjectId: DEAL, objectIdToMerge: MERGE });
  const newId = String(merged.id || DEAL);
  const after = await hs('GET', `/crm/v3/objects/deals/${newId}?properties=dealname,description,num_notes,hs_merged_object_ids`);
  const absorbed = String(after.properties.hs_merged_object_ids || '').split(';').filter(Boolean);
  console.log(`  ✓ merged ${MERGE} into ${DEAL} → merged deal id ${newId}${newId !== DEAL ? ' (NEW id — the old ids redirect to it)' : ''}`);
  console.log(`\nREAD BACK deal ${newId}: ${after.properties.dealname}\n${after.properties.description}\n  notes: ${after.properties.num_notes}`);
  console.log(absorbed.includes(String(MERGE)) ? `  ✓ hs_merged_object_ids names the twin: ${absorbed.join(', ')}`
    : `  ✖ hs_merged_object_ids does NOT name ${MERGE} (${absorbed.join(', ') || 'empty'}) — merge did not take`);
}
