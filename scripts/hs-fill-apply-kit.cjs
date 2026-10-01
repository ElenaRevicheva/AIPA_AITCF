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
 *   Also, on EVERY ACT-TODAY hiring deal (28 Sep 2026): a "🔎 COMPANY BRIEF" note (Perplexity, cited,
 *   cached — scripts/lib/company-research.cjs) and, on new deals, the tailored CV + 🛡️ defense note.
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

const os = require('os');
const { execFileSync } = require('child_process');
const { uploadOutreachFile, addNoteAttachments } = require(path.join(__dirname, 'hs-files.cjs'));
const { generateCoverLetter, fetchJobDescription, generateRoleDefense } = require(path.join(ROOT, 'dist/cover-letter.js'));
const tailor = require(path.join(__dirname, 'lib', 'job-tailor.cjs'));
// ── Company brief (28 Sep 2026, Elena: "the HubSpot deal stays the source of truth, always fresh") ──
// The Perplexity brief used to live only inside the morning HTML page. Now every ACT-TODAY hiring deal
// gets it as a "🔎 COMPANY BRIEF" note — same research, same cache, so a company is paid for once.
const { BRIEF_MARK, createResearcher, renderBriefHtml } = require(path.join(__dirname, 'lib', 'company-research.cjs'));
const researcher = createResearcher(process.env.PERPLEXITY_API_KEY);
// ONE definition of a job deal for the kit, the morning page and the audit (1 Oct 2026: the kit kept its own
// two-prefix list, so a [HIRING-MICRO1] deal sat in I Act TODAY for a week with only a letter).
const { jobDealFilterGroups, isJobDeal } = require(path.join(__dirname, 'lib', 'hiring-deals.cjs'));
// ── 📋 Comet prompt on the deal (1 Oct 2026, Elena: "usable on the go — laptop or cell"; "we encoded
// Perplexity - Comet as well"). The same prompt the morning page offers, built by the same code.
const { COMET_MARK, parseNote, cometPrompt } = require(path.join(__dirname, 'lib', 'comet-prompt.cjs'));

const APPLY = process.argv.includes('--apply');
// ── Tailored CV + technical-defense note (28 Sep 2026, Elena) ────────────────────────────────
// Every NEW ACT-TODAY hiring deal gets a CV tailored to its posting and a short defense note, both
// assembled by SELECTION from verified material (scripts/lib/job-tailor.cjs). 1 Oct 2026: no date gate any
// more — every deal IN I Act TODAY gets it, however old. --backfill is kept as a harmless no-op.
const DEFENSE_MARK = '🛡️ TECHNICAL DEFENSE';
// Opt-in for a hand-staged [HIRING-MANUAL] job deal: a note line "📌 JOB POSTING: <code>url</code>".
const JOB_MARK = '📌 JOB POSTING';
const DEFENSE_SINCE = new Date('2026-09-28T00:00:00Z');
const BACKFILL = process.argv.includes('--backfill');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const AUTO_DIR = path.join(ROOT, 'docs', 'applications', 'cv-by-job', 'auto');
const BUILDER = path.join(__dirname, 'build-lane-cv.cjs');
const CV_NODE_PATH = process.env.CV_BUILD_NODE_PATH || path.join(os.homedir(), 'cv-build-deps', 'node_modules');
const CV_FONTS = process.env.CV_FONT_DIR || path.join(os.homedir(), 'cv-build-fonts');
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
  return { lane, cv: rules.lanes[lane].cv, headline: rules.lanes[lane].headline };
}

/**
 * Tailored CV + defense note for one deal. Returns a short status word for the log. Never throws
 * past its own try: a failure here must not stop the letter pass below.
 */
async function defensePass(d, bodies, title, company, jobUrl) {
  if (bodies.some((b) => text(b).includes(DEFENSE_MARK))) return 'had';
  let jd = '';
  try { jd = await fetchJobDescription(jobUrl); } catch { jd = ''; }
  if (jd.length < 200) jd = (await renderPosting(jobUrl)) || jd;
  const { lane, headline } = laneFor(title);
  // Per-job CV summary (1 Oct 2026): the 🎯 pitch written this run, or the one already on the deal.
  const summary = PITCH.get(String(d.id)) || pitchFromNotes(bodies);
  let job = tailor.tailorJob({ title, company, jd, lane, laneHeadline: headline, summary });
  fs.mkdirSync(AUTO_DIR, { recursive: true });
  const jobPath = path.join(AUTO_DIR, job.cv.replace(/\.pdf$/, '.json'));
  let cvPath = null, cvWhy = '';
  const build = (spec) => {
    fs.writeFileSync(jobPath, JSON.stringify({ ...spec, _deal: d.id, _jd_chars: jd.length }, null, 2));
    execFileSync(process.execPath, [BUILDER, `--job=${jobPath}`], {
      env: { ...process.env, NODE_PATH: CV_NODE_PATH, CV_FONT_DIR: CV_FONTS },
      timeout: 120_000, stdio: 'pipe',
    });
  };
  try {
    try { build(job); }
    catch (e) {
      // A longer per-job summary must never cost the CV (the builder refuses a 3rd page): fall back to the lane's.
      if (!job.summary_source) throw e;
      console.log(`  ↺ ${company.slice(0, 22)} per-job summary did not fit — lane summary instead`);
      job = tailor.tailorJob({ title, company, jd, lane, laneHeadline: headline });
      build(job);
    }
    cvPath = path.join(AUTO_DIR, job.cv);
    if (!fs.existsSync(cvPath)) { cvPath = null; cvWhy = 'builder wrote no file'; }
  } catch (e) {
    cvWhy = String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').pop().slice(0, 120);
  }
  const bank = tailor.loadBank();
  const entries = tailor.pickDefense({ title, jd }, bank);
  const html = tailor.renderDefenseHtml({
    title, company, entries, frame: bank.frame, cvName: cvPath ? job.cv : '', mark: DEFENSE_MARK,
  }) + (cvPath ? '' : `<p><em>Tailored CV not built (${esc(cvWhy)}); the lane CV on the letter note applies.</em></p>`);
  if (APPLY) {
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
    if (cvPath) await addNoteAttachments(note.id, [(await uploadOutreachFile(cvPath, job.cv)).id]);
  }
  console.log(`  ${APPLY ? '🛡️ added' : '· would add'} ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)}`
    + ` jd=${jd.length} cv=${cvPath ? job.order.join('/') : 'NONE ' + cvWhy} qa=${entries.map((e) => e.id).join(',')}`);
  return cvPath ? 'added' : 'added-no-cv';
}

// ── 🎯 ROLE DEFENSE (29 Sep 2026, Elena: "profound, not generic, tech savvy but still clear for me … on the go,
// no matter laptop or cell"). The 🛡️ note is keyword-picked from a fixed bank; this one is written for THIS posting
// from verified facts only (generateRoleDefense rejects any number not in the evidence). It is also the phone card:
// it opens with the clickable apply link and says where the letter and the tailored CV are. Every job deal, no date gate.
const ROLE_MARK = '🎯 ROLE DEFENSE';
// The checked pitch of each deal, handed from rolePass to defensePass in the same run (the CV summary).
const PITCH = new Map();
/** The pitch on an EXISTING 🎯 note ("<em>Why you, in one line:</em> …</p>") — '' if none. */
function pitchFromNotes(bodies) {
  for (const b of bodies) {
    if (!String(b).includes(ROLE_MARK)) continue;
    const m = String(b).match(/Why you, in one line:<\/em>\s*([\s\S]*?)<\/p>/);
    if (m) return text(m[1]);
  }
  return '';
}
async function rolePass(d, bodies, title, company, jobUrl) {
  if (bodies.some((b) => text(b).includes(ROLE_MARK))) return 'had';
  if (!jobUrl) return 'nolink';
  let jd = '';
  try { jd = await fetchJobDescription(jobUrl); } catch { jd = ''; }
  if (jd.length < 200) jd = (await renderPosting(jobUrl)) || jd;
  const bank = tailor.loadBank().entries
    .map((e) => `Q: ${e.q}\nA: ${e.a}${e.push ? `\nIf pushed: ${e.push}` : ''}`).join('\n\n');
  const r = await generateRoleDefense({ jobTitle: title, company, jd, bank });
  if (!r.defense) { console.log(`  ✖ role ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40)} — ${r.reason}`); return 'failed'; }
  const { pitch, questions, gaps } = r.defense;
  if (pitch) PITCH.set(String(d.id), pitch);
  const html = [
    `<strong>${ROLE_MARK} — ${esc(title)} @ ${esc(company)}</strong>`,
    `<p>📱 <a href="${esc(jobUrl)}"><strong>👉 APPLY HERE</strong></a> · letter: the ✅ READY TO SEND note · tailored CV: attached to the 🛡️ note</p>`,
    pitch ? `<p><em>Why you, in one line:</em> ${esc(pitch)}</p>` : '',
    '<p><strong>Questions THIS posting will raise</strong></p>',
    ...questions.map((x, i) => `<p><strong>${i + 1}. ${esc(x.q)}</strong>${x.why ? `<br><em>(because: ${esc(x.why)})</em>` : ''}<br>${esc(x.a)}</p>`),
    gaps.length ? '<p><strong>Honest gaps — say it before they find it</strong></p>' : '',
    ...gaps.map((g) => `<p>⚠️ <strong>They ask: ${esc(g.posting_line)}</strong><br>${esc(g.say)}</p>`),
    `<p><em>Written for this posting from verified facts only (${esc(r.provider || 'llm')}); any number not in the facts is rejected in code.</em></p>`,
  ].filter(Boolean).join('');
  if (APPLY) {
    await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
  } else {
    console.log(html.replace(/<\/p>/g, '\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').slice(0, 12000));
  }
  console.log(`  ${APPLY ? '🎯 added' : '· would add'} role ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)} q=${questions.length} gaps=${gaps.length}`);
  return 'added';
}

/**
 * 📋 COMET PROMPT note — the morning page's per-job prompt, written onto the deal so it is there wherever
 * HubSpot is open. Built from the same letter + link the page would use (newest note first, never the brief),
 * and the cached Perplexity brief, so it costs $0. A deal whose letter is written this run gets it next run.
 */
async function cometPass(d, notes, title, company, jobUrl, hadComet) {
  if (hadComet) return 'had';
  const parsed = notes
    .filter((n) => { const t = text(n.properties.hs_note_body); return !t.includes(BRIEF_MARK) && !t.includes(COMET_MARK); })
    .sort((a, b) => String(b.properties.hs_timestamp || '').localeCompare(String(a.properties.hs_timestamp || '')))
    .map((n) => parseNote(n.properties.hs_note_body));
  const withLetter = parsed.find((p) => p.letter && !p.boilerplate);
  if (!withLetter) return 'wait';
  const url = jobUrl || (parsed.find((p) => p.url) || {}).url || '';
  const research = await researcher.research(company, title);
  const prompt = cometPrompt({ url, title, company, research, letter: withLetter.letter, boilerplate: false });
  const html = [
    `<strong>${COMET_MARK} — ${esc(title)} @ ${esc(company)}</strong>`,
    '<p><em>Laptop: copy everything under the line into the <b>Comet</b> browser’s assistant. It opens the job and fills the form with your details and letter, then STOPS. Attach the tailored CV (📎 on the 🛡️ note), read every field, click Submit yourself.</em></p>',
    '<p>──────────</p>',
    `<p>${esc(prompt).split('\n').join('<br>')}</p>`,
  ].join('');
  if (APPLY) {
    await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
  }
  console.log(`  ${APPLY ? '📋 added' : '· would add'} comet ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40)}`);
  return 'added';
}

/** 🔎 COMPANY BRIEF note for one deal. No date gate: briefs are cached and cost ~$0.005 per new company. */
async function briefPass(d, bodies, title, company) {
  if (bodies.some((b) => text(b).includes(BRIEF_MARK))) return 'had';
  const r = await researcher.research(company, title);
  const html = renderBriefHtml({ company, research: r });
  if (!html) return 'none';
  if (APPLY) {
    await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
  }
  console.log(`  ${APPLY ? '🔎 added' : '· would add'} brief ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40)}`);
  return 'added';
}

(async () => {
  if (!HS) { console.log('ABORT — HUBSPOT_API_KEY missing'); process.exit(1); }
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: jobDealFilterGroups(STAGE),
    properties: ['dealname', 'createdate'],
    limit: 100,
  });
  const deals = search.results || [];
  console.log(`[${new Date().toISOString().slice(0, 16)}] fill ${APPLY ? 'APPLY' : 'DRY RUN'} — ${deals.length} ACT TODAY hiring deals`);

  let ok = 0, wrote = 0, unreadable = 0, failed = 0;
  const defense = { added: 0, 'added-no-cv': 0, had: 0, old: 0, failed: 0 };
  const brief = { added: 0, had: 0, none: 0, failed: 0 };
  const role = { added: 0, had: 0, nolink: 0, failed: 0 };
  const comet = { added: 0, had: 0, wait: 0, failed: 0 };
  const cvIds = new Map();
  for (const d of deals) {
    if (ONLY && String(d.id) !== ONLY) continue;
    const { title, company } = parseDeal(d.properties.dealname);
    try {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes?limit=50`);
      const ids = (assoc.results || []).map((a) => String(a.toObjectId));
      const notes = ids.length
        ? (await hs('POST', '/crm/v3/objects/notes/batch/read', { properties: ['hs_note_body', 'hs_timestamp'], inputs: ids.map((id) => ({ id })) })).results || []
        : [];
      // The 📋 Comet note quotes the letter and lists links — no pass below may read it as the letter or the posting.
      const bodies = notes.map((n) => n.properties.hs_note_body || '').filter((b) => !text(b).includes(COMET_MARK));
      const hadComet = notes.some((n) => text(n.properties.hs_note_body).includes(COMET_MARK));
      // A hand-staged job (29 Sep 2026: Allied Revenue was staged by hand and got no CV or defense) joins
      // only when a note carries JOB_MARK. [HIRING-MANUAL] also names recruiter-outreach deals, and a CV
      // headed with a recruiter's name is worse than none. From then on a hand-staged job gets exactly what
      // an automatic one gets — brief, tailored CV, defense AND the letter (Elena, 29 Sep 2026).
      if (!isJobDeal(d.properties.dealname, bodies)) continue;
      // The brief carries no link by design; skipping it here too means a future edit to it can never
      // hand a source page to the letter generator as "the posting".
      const jobUrl = bodies.filter((b) => !text(b).includes(BRIEF_MARK)).map(jobUrlOf).find(Boolean);
      try { brief[await briefPass(d, bodies, title, company)]++; }
      catch (e) { brief.failed++; console.log(`  ✖ brief ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
      // Role defense BEFORE the CV (1 Oct 2026): its checked one-sentence pitch is the CV's per-job summary.
      // Both run before the letter skip: new deals arrive WITH a letter.
      try { role[await rolePass(d, bodies, title, company, jobUrl)]++; }
      catch (e) { role.failed++; console.log(`  ✖ role ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
      try { defense[await defensePass(d, bodies, title, company, jobUrl)]++; }
      catch (e) { defense.failed++; console.log(`  ✖ defense ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
      if (bodies.some((b) => LETTER_RE.test(text(b)) && !STUB_RE.test(b))) {
        ok++;
        try { comet[await cometPass(d, notes, title, company, jobUrl, hadComet)]++; }
        catch (e) { comet.failed++; console.log(`  ✖ comet ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
        continue;
      }

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
  console.log(`  defense: ${APPLY ? 'added' : 'would add'} ${defense.added} (+${defense['added-no-cv']} without a CV) · already had ${defense.had}`
    + ` · older than ${DEFENSE_SINCE.toISOString().slice(0, 10)} ${defense.old} · failed ${defense.failed}`);
  console.log(`  role defense: ${APPLY ? 'added' : 'would add'} ${role.added} · already had ${role.had} · no apply link ${role.nolink} · failed ${role.failed}`);
  console.log(`  comet prompt: ${APPLY ? 'added' : 'would add'} ${comet.added} · already had ${comet.had} · waiting for a letter ${comet.wait} · failed ${comet.failed}`);
  researcher.save();
  const rs = researcher.stats;
  console.log(`  brief: ${APPLY ? 'added' : 'would add'} ${brief.added} · already had ${brief.had} · nothing found ${brief.none}`
    + ` · failed ${brief.failed} · research ${rs.researched} new / ${rs.cached} cached / ${rs.failed} failed · $${rs.spent.toFixed(4)}`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.log('FAILED — ' + String(e.message).slice(0, 200)); process.exit(1); });
