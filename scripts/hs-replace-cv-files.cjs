#!/usr/bin/env node
/**
 * hs-replace-cv-files.cjs — push rebuilt lane CVs into HubSpot IN PLACE (same file id).
 *
 *   node scripts/hs-replace-cv-files.cjs            → dry run: show which HubSpot file each CV would replace
 *   node scripts/hs-replace-cv-files.cjs --apply    → replace the contents
 *
 * WHY (23 Sep 2026). uploadOutreachFile() reuses an existing file of the same name, which is right
 * for idempotent attaching and wrong after a CV is CORRECTED: the rebuilt PDF never reaches HubSpot
 * and every deal keeps showing the old claim. Here the lane CVs said "live 18 months" and "two years
 * building"; git dates the job pipeline to Nov 2025 and the first AI repo to May 2025.
 *
 * Replacing by id means every note that already carries the CV now carries the corrected one —
 * no note is touched, no attachment list changes, nothing is duplicated. Access stays PRIVATE.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require(path.join(__dirname, 'hs-env.cjs'));

const APPLY = process.argv.includes('--apply');
const CV_DIR = path.join(__dirname, '..', 'docs', 'applications', 'cv-by-lane');
const FOLDER = '/outreach-attachments';

async function api(method, urlPath, body, isForm) {
  const r = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${hubspotKey()}`, ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* keep text */ }
  return { ok: r.ok, status: r.status, json, text };
}

(async () => {
  const lanes = JSON.parse(fs.readFileSync(path.join(CV_DIR, 'lanes.json'), 'utf8')).lanes;
  let replaced = 0, missing = 0, failed = 0;
  for (const [lane, meta] of Object.entries(lanes)) {
    const name = meta.cv;
    const local = path.join(CV_DIR, name);
    const base = name.replace(/\.pdf$/i, '');
    // HubSpot 400s on a search name at 20+ chars (19 works) — search the prefix, match the exact name.
    const found = await api('GET', `/files/v3/files/search?name=${encodeURIComponent(base.slice(0, 19))}&limit=50`);
    if (!found.ok) { console.log(`  ✖ ${lane.padEnd(12)} search ${found.status} ${found.text.slice(0, 120)}`); failed++; continue; }
    const hit = (found.json?.results || []).find((f) => `${f.name}.${f.extension}` === name && String(f.path || '').startsWith(FOLDER));
    if (!hit) { console.log(`  · ${lane.padEnd(12)} ${name} — not in HubSpot yet (nothing to replace)`); missing++; continue; }
    if (!APPLY) { console.log(`  · ${lane.padEnd(12)} would replace file ${hit.id} (${hit.size} B → ${fs.statSync(local).size} B)`); continue; }

    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(local)], { type: 'application/pdf' }), name);
    form.append('options', JSON.stringify({ access: 'PRIVATE' }));
    const r = await api('PUT', `/files/v3/files/${hit.id}`, form, true);
    if (!r.ok) { console.log(`  ✖ ${lane.padEnd(12)} ${r.status} ${r.text.slice(0, 140)}`); failed++; continue; }
    const back = await api('GET', `/files/v3/files/${hit.id}`);
    const ok = back.json?.size === fs.statSync(local).size && back.json?.access === 'PRIVATE';
    console.log(`  ${ok ? '✓' : '?'} ${lane.padEnd(12)} file ${hit.id} now ${back.json?.size} B, ${back.json?.access}`);
    if (ok) replaced++; else failed++;
  }
  console.log(`replaced ${replaced} · not in HubSpot ${missing} · failed ${failed}${APPLY ? '' : '  (DRY RUN)'}`);
  if (failed) process.exitCode = 1;
})();
