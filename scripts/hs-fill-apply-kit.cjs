#!/usr/bin/env node
/**
 * hs-fill-apply-kit.cjs — give every "🔥 I Act TODAY" HIRING deal a REAL cover letter + its CV.
 *
 *   node scripts/hs-fill-apply-kit.cjs            → dry run: say what it would write
 *   node scripts/hs-fill-apply-kit.cjs --apply    → write
 *
 * WHY (23 Sep 2026). An audit read back from HubSpot found 11 of 23 ACT TODAY job deals carrying
 * a STUB ("[Edit this stub …]" / "⚠️ Boilerplate — not tailored") instead of a letter. Two
 * causes: backfill-cover-letters.cjs only looks at the 100 NEWEST open hiring deals, so older
 * ACT TODAY deals were never revisited; and JS-rendered boards return 4–24 chars to a plain
 * fetch, so the generator correctly refused to tailor against nothing.
 *
 * WHAT IT DOES, per ACT-TODAY hiring deal with no real letter:
 *   1. generateCoverLetter() — the same generator, same verified-facts block, same refusal rules.
 *   2. If the posting was unreadable, render it once through the Bright Data Web Unlocker (the
 *      same zone ingest already uses) and hand that text to the generator as its context.
 *   3. ADD a new note "✅ READY TO SEND — cover letter" on the deal, with the lane CV attached.
 *
 * RULES IT WILL NOT BREAK:
 *   · Additive. It never rewrites or deletes an existing note — the stub stays underneath.
 *   · It never invents. No readable posting → no letter, and the audit alerts. A letter written
 *     from a job title alone is the stub with better grammar.
 *   · Idempotent. A deal that already has a real letter is skipped.
 *   · HIRING-VJH deals in qualifiedtobuy only — never a client prospect.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* env already in the process (cron) */ }

const { uploadOutreachFile, addNoteAttachments } = require(path.join(__dirname, 'hs-files.cjs'));
const { generateCoverLetter } = require(path.join(ROOT, 'dist/cover-letter.js'));

const APPLY = process.argv.includes('--apply');
const STAGE = 'qualifiedtobuy';
const HS = process.env.HUBSPOT_API_KEY;
const CV_DIR = path.join(ROOT, 'docs', 'applications', 'cv-by-lane');
const READY_MARK = '✅ READY TO SEND — cover letter';

// A real letter: VJH's tailored heading, a hand-written one, or ours. A stub carries a marker.
const STUB_RE = /Edit this stub|Boilerplate — not tailored/i;
const LETTER_RE = /COVER LETTER/i;

async function hs(method, endpoint, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.hubapi.com${endpoint}`, {
      method,
      headers: { authorization: `Bearer ${HS}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status === 429 && attempt < 4) {
      await r.text();
      await new Promise((res) => setTimeout(res, Number(r.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`${method} ${endpoint.split('?')[0]} -> ${r.status} ${(await r.text()).slice(0, 140)}`);
    return r.json();
  }
}

const text = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "[HIRING-VJH-SERP-LEAD] Apply to Remote AI Engineer at HireLATAM @ HireLATAM" → {title, company} */
function parseDeal(dealname) {
  const s = String(dealname || '').replace(/^\[[^\]]*\]\s*/, '');
  const parts = s.split(/\s+@\s+/);
  let title = parts[0].replace(/^(Apply to|Job Application for)\s+/i, '');
  const company = decodeURIComponent((parts[parts.length - 1] || '').trim());
  const at = title.toLowerCase().lastIndexOf(' at ');
  if (at > 0) title = title.slice(0, at);
  return { title: title.trim(), company };
}

function jobUrlOf(html) {
  const m = String(html).match(/<code>(https?:\/\/[^<\s]+)<\/code>/) || String(html).match(/href="(https?:\/\/[^"]+)"/);
  return m ? m[1].replace(/&amp;/g, '&') : undefined;
}

/** Render a JS-built posting once through the Web Unlocker. '' on any failure. */
async function renderPosting(url) {
  const token = process.env.BRIGHTDATA_API_TOKEN, zone = process.env.BRIGHTDATA_ZONE;
  if (!token || !zone || !url) return '';
  try {
    const r = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ zone, url, format: 'raw', render: true }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) return '';
    return text(await r.text()).slice(0, 6000);
  } catch { return ''; }
}

function laneFor(title) {
  const rules = JSON.parse(fs.readFileSync(path.join(CV_DIR, 'lanes.json'), 'utf8'));
  const hit = rules.rules.find((x) => new RegExp(x.pattern, 'i').test(title));
  const lane = hit ? hit.lane : rules.default;
  return { lane, cv: rules.lanes[lane].cv };
}

(async () => {
  if (!HS) { console.log('ABORT — HUBSPOT_API_KEY missing'); process.exit(1); }
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: STAGE },
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING-VJH*' },
    ] }],
    properties: ['dealname'],
    limit: 100,
  });
  const deals = search.results || [];
  console.log(`[${new Date().toISOString().slice(0, 16)}] fill ${APPLY ? 'APPLY' : 'DRY RUN'} — ${deals.length} ACT TODAY hiring deals`);

  let ok = 0, wrote = 0, unreadable = 0, failed = 0;
  const cvIds = new Map();
  for (const d of deals) {
    const { title, company } = parseDeal(d.properties.dealname);
    try {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes?limit=50`);
      const ids = (assoc.results || []).map((a) => String(a.toObjectId));
      const notes = ids.length
        ? (await hs('POST', '/crm/v3/objects/notes/batch/read', { properties: ['hs_note_body'], inputs: ids.map((id) => ({ id })) })).results || []
        : [];
      const bodies = notes.map((n) => n.properties.hs_note_body || '');
      if (bodies.some((b) => LETTER_RE.test(text(b)) && !STUB_RE.test(b))) { ok++; continue; }

      const jobUrl = bodies.map(jobUrlOf).find(Boolean);
      let drafted = await generateCoverLetter({ jobTitle: title, company, jobUrl });
      let via = 'direct';
      if (!drafted.letter && drafted.jdChars < 200) {
        const rendered = await renderPosting(jobUrl);
        if (rendered.length >= 200) {
          drafted = await generateCoverLetter({ jobTitle: title, company, notes: rendered });
          via = 'rendered';
        }
      }
      if (!drafted.letter) {
        unreadable++;
        console.log(`  ✖ ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)} ${drafted.reason || ''}`.slice(0, 160));
        continue;
      }

      if (APPLY) {
        const body = [
          `<strong>${READY_MARK} — drafted against this posting (${esc(drafted.provider || 'llm')}, ${via}). Read it, then paste. ---</strong>`,
          jobUrl ? `<p>Apply: <a href="${esc(jobUrl)}">${esc(jobUrl)}</a></p>` : '',
          `<p>${esc(drafted.letter).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
          '<p><em>CV for this lane is attached to this note. The older stub note below is superseded.</em></p>',
        ].join('');
        const note = await hs('POST', '/crm/v3/objects/notes', {
          properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
        });
        const { cv } = laneFor(title);
        if (!cvIds.has(cv)) cvIds.set(cv, (await uploadOutreachFile(path.join(CV_DIR, cv), cv)).id);
        await addNoteAttachments(note.id, [cvIds.get(cv)]);
      }
      wrote++;
      console.log(`  ${APPLY ? '✓ wrote' : '· would'} ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)} jd=${drafted.jdChars} ${via}`);
    } catch (e) {
      failed++;
      console.log(`  ✖ ${company.slice(0, 22).padEnd(24)} ERROR ${String(e.message).slice(0, 110)}`);
    }
  }
  console.log(`  already had a letter ${ok} · ${APPLY ? 'wrote' : 'would write'} ${wrote} · posting unreadable ${unreadable} · failed ${failed}`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.log('FAILED — ' + String(e.message).slice(0, 200)); process.exit(1); });
