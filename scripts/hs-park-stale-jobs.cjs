#!/usr/bin/env node
/**
 * hs-park-stale-jobs.cjs — move aged-out job leads out of "🔥 I Act TODAY".
 *
 *   node scripts/hs-park-stale-jobs.cjs --dry-run          (default cutoff 60 days)
 *   node scripts/hs-park-stale-jobs.cjs --days 60
 *   node scripts/hs-park-stale-jobs.cjs --rollback <file>  (put them all back)
 *
 * WHY. On 21 Sep the ACT-TODAY stage held 36 job deals, and 19 of them were created in
 * June/July — 2 to 3 months old. A queue called TODAY that is half full of expired postings
 * stops being a queue. Elena asked for the stale ones moved.
 *
 * ── THE TRAP THIS SCRIPT EXISTS TO AVOID ────────────────────────────────────────────────
 * The obvious destination is `closedlost` ("❌ No fit / Rejected / ghosted"). DO NOT USE IT.
 * VJH learns from HubSpot outcomes, and in scripts/judge_feedback_sync.py:
 *
 *     NEGATIVE_STAGES = {"closedlost"}
 *
 * Moving 19 deals Elena never looked at into closedlost would feed the judge 19 FALSE
 * NEGATIVES — teaching it she rejects roles she never saw, including a Technical AI Product
 * Manager that scored 97. That is worse than a cluttered queue: it corrupts her targeting.
 *
 * So they go to `appointmentscheduled` — "🤖 AI working — ignore (not triaged yet)" — which
 * is neither a POSITIVE nor a NEGATIVE stage, and which VJH already uses as the parked
 * bucket (see VJH scripts/sweep_parked_borderline.py: PARKED_STAGE). Nothing promotes deals
 * back out of it automatically, so parking is stable.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────────────────
 *   · HIRING STREAM ONLY (`*HIRING-VJH*`). The ACT-TODAY stage is shared with
 *     [CLIENT-ATLAS] / [CLIENT-CTO-INGEST] sales prospects, which must never be touched.
 *   · Nothing is deleted. Notes, letters, attachments and the deal itself are untouched —
 *     the only property written is `dealstage`.
 *   · Every move is recorded to a rollback JSON BEFORE it happens, with the deal's original
 *     stage. `--rollback <file>` restores every deal in that file to exactly where it was.
 *   · --dry-run changes nothing and is the default posture for a first look.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require(path.join(__dirname, 'hs-env.cjs'));

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = args.includes('--dry-run');
const DAYS = parseInt(argOf('--days', '60'), 10);
const ROLLBACK_IN = argOf('--rollback', null);

const FROM_STAGE = 'qualifiedtobuy';            // 🔥 I Act TODAY
const PARK_STAGE = 'appointmentscheduled';      // 🤖 AI working — ignore (NOT a training signal)
const ROLLBACK_DIR = path.join(__dirname, '..', 'docs', 'oracle', 'rollback');

async function hs(method, urlPath, body) {
  const res = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function setStage(dealId, stage) {
  return hs('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: stage } });
}

(async () => {
  // ── rollback mode ─────────────────────────────────────────────────────────
  if (ROLLBACK_IN) {
    const rec = JSON.parse(fs.readFileSync(ROLLBACK_IN, 'utf8'));
    console.log(`rollback: restoring ${rec.moved.length} deals from ${path.basename(ROLLBACK_IN)}`);
    let ok = 0, bad = 0;
    for (const m of rec.moved) {
      const r = await setStage(m.id, m.fromStage);
      if (r.ok) { ok++; console.log(`  ✓ ${m.name.slice(0, 58)} → ${m.fromStage}`); }
      else { bad++; console.log(`  ✖ ${m.id}: ${r.text.slice(0, 120)}`); }
    }
    console.log(`restored ${ok} · failed ${bad}`);
    if (bad) process.exitCode = 1;
    return;
  }

  const cutoff = Date.now() - DAYS * 86400000;
  const cutoffISO = new Date(cutoff).toISOString().slice(0, 10);

  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: FROM_STAGE },
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING-VJH*' },
    ] }],
    properties: ['dealname', 'createdate', 'dealstage'],
    limit: 100,
  });
  if (!search.ok) { console.error(`deal search failed ${search.status}: ${search.text.slice(0, 200)}`); process.exit(1); }

  const deals = search.json?.results || [];
  const stale = deals.filter((d) => {
    const c = Date.parse(d.properties?.createdate || '');
    return Number.isFinite(c) && c < cutoff;
  });

  console.log(`${deals.length} HIRING deals in "${FROM_STAGE}"`);
  console.log(`cutoff: older than ${DAYS} days (created before ${cutoffISO}) → ${stale.length} stale`);
  console.log(`destination: ${PARK_STAGE}  (🤖 AI working — ignore; NOT closedlost, which VJH reads as a rejection)\n`);

  if (!stale.length) { console.log('nothing to park.'); return; }

  const ages = stale.map((d) => Math.round((Date.now() - Date.parse(d.properties.createdate)) / 86400000));
  for (const [i, d] of stale.entries()) {
    console.log(`  ${String(ages[i]).padStart(3)}d  ${String(d.properties.dealname).slice(0, 72)}`);
  }

  if (DRY) {
    console.log(`\nDRY RUN — nothing written. ${deals.length - stale.length} deals would remain in ACT TODAY.`);
    return;
  }

  fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rbPath = path.join(ROLLBACK_DIR, `park-stale-jobs-${stamp}.json`);
  const record = {
    ranAt: new Date().toISOString(),
    cutoffDays: DAYS,
    fromStage: FROM_STAGE,
    toStage: PARK_STAGE,
    moved: stale.map((d) => ({
      id: d.id,
      name: d.properties.dealname,
      created: d.properties.createdate,
      fromStage: d.properties.dealstage || FROM_STAGE,
    })),
  };
  // written BEFORE any change, so a crash mid-run still leaves a complete undo list
  fs.writeFileSync(rbPath, JSON.stringify(record, null, 2));
  console.log(`\nrollback file written first: ${rbPath}`);

  let moved = 0, failed = 0;
  for (const d of stale) {
    const r = await setStage(d.id, PARK_STAGE);
    if (r.ok) { moved++; }
    else { failed++; console.log(`  ✖ ${d.properties.dealname.slice(0, 50)}: ${r.text.slice(0, 120)}`); }
  }
  console.log(`\nparked ${moved} · failed ${failed} · ${deals.length - stale.length} left in ACT TODAY`);
  console.log('Only dealstage was written. No note, letter, attachment or deal was deleted.');
  console.log(`Undo: node scripts/hs-park-stale-jobs.cjs --rollback "${rbPath}"`);
  if (failed) process.exitCode = 1;
})();
