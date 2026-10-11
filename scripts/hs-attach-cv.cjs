#!/usr/bin/env node
/**
 * hs-attach-cv.cjs — put the right tailored CV on every "🔥 YOU act TODAY" deal.
 *
 *   node scripts/hs-attach-cv.cjs --dry-run     → show what WOULD be attached, change nothing
 *   node scripts/hs-attach-cv.cjs               → upload + attach
 *
 * WHY. VJH already writes a tailored cover letter onto each deal as a note — that half was
 * never missing. What was missing is the RESUME: the same static PDF went to every role, and
 * an ATS reads the resume, not the letter. So the deal showed a letter arguing she is a
 * product manager next to a CV headed "AI Automation Architect".
 *
 * WHAT IT DOES. For each deal in the ACT-TODAY stage: infer the lane from the job title, then
 * attach that lane's CV to the deal's existing note.
 *
 * SAFETY — this is ADDITIVE and cannot destroy anything:
 *   · The only write is a PATCH of `hs_attachment_ids` on a NOTE, and addNoteAttachments()
 *     writes the UNION of what is already there with the new id. It can add, never remove.
 *   · No deal property is touched. No stage is moved. No note body is rewritten. Nothing is
 *     submitted to any employer.
 *   · Files upload with access: PRIVATE — a CV must not become a public URL.
 *   · Idempotent: re-running attaches nothing new, because the id is already in the union and
 *     uploadOutreachFile() reuses an existing file of the same name rather than duplicating.
 *
 * LANE RULES ARE NOT DUPLICATED HERE. They are read from cv-by-lane/lanes.json, which
 * build_tailored_cv.py emits. Re-implementing the regexes in JS would create a second source
 * of truth, and a second source of truth is how targeting silently stopped matching yesterday.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require(path.join(__dirname, 'hs-env.cjs'));
const { uploadOutreachFile, addNoteAttachments, findOutreachNoteId, filesScopeOk } =
  require(path.join(__dirname, 'hs-files.cjs'));
const { CV_MARK, OLD_CV_LINE } = require(path.join(__dirname, 'lib', 'job-tailor.cjs'));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const STAGE = 'qualifiedtobuy';
const LIMIT = 100;

const CV_DIR = path.join(__dirname, '..', 'docs', 'applications', 'cv-by-lane');
const RULES_PATH = path.join(CV_DIR, 'lanes.json');

async function hs(method, urlPath, body) {
  // hs-env exports these as FUNCTIONS, not values — interpolating them directly puts the
  // function source into the URL and fetch fails with an unhelpful "Invalid URL".
  const res = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json error body */ }
  return { ok: res.ok, status: res.status, json, text };
}

/** Same rules the CV builder uses — read, never re-implemented. */
function loadRules() {
  if (!fs.existsSync(RULES_PATH)) {
    throw new Error(`missing ${RULES_PATH} — run: python scripts/build_tailored_cv.py --build-all-lanes`);
  }
  const r = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  return {
    def: r.default,
    lanes: r.lanes,
    rules: r.rules.map((x) => ({ lane: x.lane, re: new RegExp(x.pattern, 'i') })),
  };
}

/**
 * 11 Oct 2026: a deal whose 🛡️ note already carries a tailored CV keeps ONLY that CV. Stapling the generic
 * lane CV onto its letter note every 10 minutes is how the Puente PM deal showed two different CVs — and the
 * stale one on the first note is the one Elena picks (feedback, 29 Sep).
 */
async function hasTailoredCv(dealId) {
  // A HubSpot error (429/5xx) must not read as "no tailored CV" — that would staple the lane CV next to it.
  const a = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes?limit=100`);
  if (!a.ok) throw new Error(`notes of deal ${dealId}: ${a.status}`);
  const ids = (a.json?.results || []).map((x) => ({ id: String(x.toObjectId) }));
  if (!ids.length) return false;
  const r = await hs('POST', '/crm/v3/objects/notes/batch/read', { inputs: ids, properties: ['hs_note_body'] });
  if (!r.ok) throw new Error(`note bodies of deal ${dealId}: ${r.status}`);
  return (r.json?.results || []).some((n) => {
    const body = String(n.properties?.hs_note_body || '');
    return body.includes(CV_MARK) || body.includes(OLD_CV_LINE);
  });
}

function inferLane(title, rules) {
  const t = String(title || '');
  for (const r of rules.rules) if (r.re.test(t)) return r.lane;
  return rules.def;
}

/** "[HIRING-VJH-LEAD] Apply to Senior PM at Acme" → "Senior PM" */
function titleOf(dealname) {
  let s = String(dealname || '').replace(/^\[[^\]]*\]\s*/, '').replace(/^Apply to\s+/i, '');
  const at = s.lastIndexOf(' at ');
  return (at > 0 ? s.slice(0, at) : s).trim();
}

(async () => {
  const scope = await filesScopeOk();
  if (!scope.ok) {
    console.error(`  ! HubSpot files scope unavailable: ${JSON.stringify(scope).slice(0, 200)}`);
    process.exit(1);
  }
  // filesScopeOk() only proves READ. Reading and writing files are SEPARATE HubSpot grants, so
  // the preflight returns ok:true and every upload then 403s — the first real run failed 36
  // times with the same message. Probe the write path once, up front, and fail with one
  // actionable line instead of once per deal.
  if (!DRY) {
    const probeLane = Object.keys(loadRules().lanes)[0];
    const probe = path.join(CV_DIR, loadRules().lanes[probeLane].cv);
    try {
      await uploadOutreachFile(probe, loadRules().lanes[probeLane].cv);
    } catch (e) {
      if (e.code === 'FILES_SCOPE') {
        console.error('\n' + e.message + '\n');
        console.error('  Nothing was changed. Re-run this script after ticking the scope.');
        process.exit(2);
      }
      throw e;
    }
  }

  const rules = loadRules();
  // HIRING STREAM ONLY. The ACT-TODAY stage is shared: of 61 deals there on 21 Sep, only 36
  // were jobs — the rest were [CLIENT-ATLAS] / [CLIENT-CTO-INGEST] sales prospects (dental
  // clinics, medical tourism, yacht charters). Without this filter the first dry run wanted to
  // staple Elena's resume onto a dental clinic's prospect record. Same filter apply-queue uses.
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: STAGE },
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING-VJH*' },
    ] }],
    properties: ['dealname', 'createdate'],
    limit: LIMIT,
  });
  if (!search.ok) {
    console.error(`  ! deal search failed ${search.status}: ${search.text.slice(0, 200)}`);
    process.exit(1);
  }
  const deals = search.json?.results || [];
  console.log(`read ${deals.length} deals in "${STAGE}"${DRY ? '  (DRY RUN — nothing will change)' : ''}`);

  const uploaded = new Map();   // lane -> fileId, so each CV uploads at most once per run
  let attached = 0, already = 0, noNote = 0, failed = 0, tailored = 0;
  const spread = {};

  for (const d of deals) {
    const title = titleOf(d.properties?.dealname);
    const lane = inferLane(title, rules);
    spread[lane] = (spread[lane] || 0) + 1;
    const meta = rules.lanes[lane];
    const cvPath = path.join(CV_DIR, meta.cv);
    if (!fs.existsSync(cvPath)) { console.log(`  ✖ ${title.slice(0, 44)} — missing ${meta.cv}`); failed++; continue; }

    if (DRY) { console.log(`  · ${lane.padEnd(12)} ${title.slice(0, 52).padEnd(54)} ${meta.cv}`); continue; }

    try {
      if (await hasTailoredCv(d.id)) { tailored++; continue; }
      const noteId = await findOutreachNoteId(d.id);
      if (!noteId) { console.log(`  · ${title.slice(0, 48)} — no note on the deal, skipped`); noNote++; continue; }

      if (!uploaded.has(lane)) {
        const up = await uploadOutreachFile(cvPath, meta.cv);
        uploaded.set(lane, up.id);
        console.log(`  ${up.reused ? '↺ reused' : '↑ uploaded'} ${meta.cv}`);
      }
      const r = await addNoteAttachments(noteId, [uploaded.get(lane)]);
      if (r.added.length) { attached++; console.log(`  ✓ ${lane.padEnd(12)} ${title.slice(0, 50)}`); }
      else { already++; }
    } catch (e) {
      failed++;
      console.log(`  ✖ ${title.slice(0, 44)} — ${String(e.message).split('\n')[0].slice(0, 120)}`);
    }
  }

  console.log(`\nlane spread: ${JSON.stringify(spread)}`);
  if (DRY) { console.log('DRY RUN — HubSpot was only read.'); return; }
  console.log(`attached ${attached} · already had it ${already} · has a tailored CV (left alone) ${tailored} · no note ${noNote} · failed ${failed}`);
  console.log('Only note attachments were added (union). No deal, stage or letter was modified.');
  if (failed) process.exitCode = 1;
})();
