#!/usr/bin/env node
/**
 * Replace stub cover letters with real ones — in HubSpot AND in the queue.
 *
 * Why (1 Sep 2026): the tailored-letter fix went live at 17:52 UTC on 31 Aug and
 * only affects deals created after it. Every earlier hiring Note still carries
 * the three-sentence stub with "[Edit this stub …]" in the body. Elena asked for
 * no stubs anywhere, so this goes back over the existing ones.
 *
 * Rules it will not break:
 *
 * 1. **Never touch a decided deal.** Anything VJH's judge feedback marks as a
 *    positive (she applied) or negative (she rejected) is skipped. Rewriting the
 *    letter on a job she already turned down is work nobody wanted.
 * 2. **Never downgrade.** If the posting cannot be read, the existing note is
 *    left exactly as it is. A stub that stays a stub is the floor.
 * 3. **Never duplicate.** It PATCHes the existing note rather than adding a
 *    second one, so the deal timeline does not grow a copy per run.
 * 4. **Idempotent.** Notes already carrying a tailored letter are skipped, so
 *    re-running costs nothing.
 *
 * Usage:
 *   node scripts/backfill-cover-letters.cjs --dry     (default: change nothing)
 *   node scripts/backfill-cover-letters.cjs --apply
 *   node scripts/backfill-cover-letters.cjs --apply --limit 25
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? parseInt(process.argv[i + 1], 10) || 40 : 40;
})();
const HS = process.env.HUBSPOT_API_KEY;
const FEEDBACK = process.env.VJH_JUDGE_FEEDBACK
  || '/home/ubuntu/VibeJobHunterAIPA_AIMCF/autonomous_data/judge_feedback.json';

async function hs(method, endpoint, body) {
  const r = await fetch(`https://api.hubapi.com${endpoint}`, {
    method,
    headers: { authorization: `Bearer ${HS}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${method} ${endpoint} -> ${r.status} ${(await r.text()).slice(0, 140)}`);
  return r.json();
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Titles she has already decided on — do not touch those deals. */
function decidedSubjects() {
  try {
    const j = JSON.parse(fs.readFileSync(FEEDBACK, 'utf8'));
    return [...(j.positives || []), ...(j.negatives || [])]
      .map(x => norm(String(x).split('— her reason:')[0]))
      .filter(Boolean);
  } catch {
    return [];
  }
}

(async () => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (!HS) { console.log('ABORT — HUBSPOT_API_KEY missing'); process.exit(1); }

  const { generateCoverLetter } = require(path.join(ROOT, 'dist/cover-letter.js'));
  const { buildHiringActionPackage } = require(path.join(ROOT, 'dist/hubspot-client.js'));
  const decided = decidedSubjects();

  // Open hiring deals, newest first. closedlost is excluded: those are over.
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'HIRING' },
      { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
    ] }],
    properties: ['dealname', 'dealstage'],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 100,
  });

  let examined = 0, rewritten = 0, skippedDecided = 0, skippedOk = 0, keptStub = 0, failed = 0;
  const lines = [];

  for (const deal of (search.results || [])) {
    if (rewritten >= LIMIT) break;
    const dealName = deal.properties.dealname || '';
    const m = dealName.match(/^\[[^\]]+\]\s*(.+?)\s+@\s+(.+)$/);
    if (!m) continue;
    const jobTitle = m[1].trim();
    const company = m[2].trim();

    const subj = norm(`${jobTitle} ${company}`);
    if (decided.some(d => d.includes(norm(jobTitle).slice(0, 30)))) {
      skippedDecided++; continue;
    }

    // Its VJH action note.
    const assoc = await hs('GET', `/crm/v4/objects/deals/${deal.id}/associations/notes?limit=20`);
    const noteIds = (assoc.results || []).map(a => a.toObjectId);
    if (!noteIds.length) continue;
    const batch = await hs('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body'],
      inputs: noteIds.map(id => ({ id: String(id) })),
    });
    const note = (batch.results || []).find(n => /MANUAL APPLY REQUIRED/.test(n.properties.hs_note_body || ''));
    if (!note) continue;
    examined++;

    const body = note.properties.hs_note_body || '';
    if (!/Edit this stub/i.test(body)) { skippedOk++; continue; }

    const urlMatch = body.match(/<code>(https?:\/\/[^<]+)<\/code>/);
    const jobUrl = urlMatch ? urlMatch[1] : undefined;
    const scoreMatch = body.match(/Score:\s*<\/strong>\s*(\d+)/) || body.match(/Score:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;

    const drafted = await generateCoverLetter({ jobTitle, company, jobUrl, score });
    if (!drafted.letter) {
      keptStub++;
      lines.push(`stub   ${company.slice(0, 22).padEnd(24)} ${drafted.reason || ''}`.slice(0, 118));
      continue;
    }

    const rebuilt = buildHiringActionPackage({
      jobTitle, company, jobUrl, score,
      coverLetter: drafted.letter,
      letterMeta: { tailored: true, provider: drafted.provider },
      source: 'backfill',
    });

    if (APPLY) {
      try {
        await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, { properties: { hs_note_body: rebuilt } });
      } catch (e) { failed++; lines.push(`FAIL   ${company.slice(0, 22)} ${String(e.message).slice(0, 60)}`); continue; }
    }
    rewritten++;
    lines.push(`${APPLY ? 'wrote ' : 'would '} ${company.slice(0, 22).padEnd(24)} jd=${String(drafted.jdChars).padStart(5)}  ${jobTitle.slice(0, 40)}`);
  }

  console.log(`[${stamp}] backfill ${APPLY ? 'APPLY' : 'DRY RUN'} — examined ${examined} stubbed notes`);
  console.log(`  rewritten ${rewritten} | already tailored ${skippedOk} | already decided ${skippedDecided} | unreadable posting, stub kept ${keptStub} | failed ${failed}`);
  lines.slice(0, 40).forEach(l => console.log('    ' + l));
  if (!APPLY) console.log('\n  DRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
})().catch(e => { console.log('FAILED — ' + String(e && e.message || e).slice(0, 220)); process.exit(1); });
