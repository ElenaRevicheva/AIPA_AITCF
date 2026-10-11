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
// ── Posting-shaped CV (11 Oct 2026, Elena: "fix the kit so every deal gets CVs like this") ──────────────
// The CV is now built the way the 5–6 Oct hand-made CVs were: the posting's own duties as headings, and under
// them only lines that already passed a fact-trace / recruiter / skeptic review (docs/applications/cv-bank.json).
// A model only chooses; code checks every heading against the posting and every line against the bank; a gpt-5
// reviewer drops any line that does not show its duty. If any of that fails, the old job-tailor CV is built.
const { composeCv } = require(path.join(__dirname, 'lib', 'cv-compose.cjs'));
const { CV_MARK } = tailor;
// --backfill-cv: rebuild the CV of deals that already have a 🛡️ note but no posting-shaped CV. Run by hand,
// never from cron: a deal whose posting cannot be shaped would otherwise be retried (and paid for) every 10 min.
const BACKFILL_CV = process.argv.includes('--backfill-cv');
// --recompose (with --only=<dealId> only): build that deal's shaped CV again even though it has one — e.g. after
// the composer changed. Additive like everything else: the new CV and its "use this one" line go on top.
const RECOMPOSE = process.argv.includes('--recompose') && process.argv.some((a) => a.startsWith('--only='));
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

async function postingText(jobUrl) {
  let jd = '';
  try { jd = await fetchJobDescription(jobUrl); } catch { jd = ''; }
  if (jd.length < 200) jd = (await renderPosting(jobUrl)) || jd;
  return jd;
}

function runBuilder(jobPath, spec, extra) {
  fs.writeFileSync(jobPath, JSON.stringify({ ...spec, ...extra }, null, 2));
  return execFileSync(process.execPath, [BUILDER, `--job=${jobPath}`], {
    env: { ...process.env, NODE_PATH: CV_NODE_PATH, CV_FONT_DIR: CV_FONTS },
    timeout: 120_000, stdio: 'pipe',
  }).toString().trim();
}

/**
 * The CV for one deal: posting-shaped first (cv-compose), the job-tailor CV if that cannot be done — unless
 * `shapedOnly` (backfill), where a deal that cannot be shaped keeps what it has. Returns
 * { cvPath, name, shaped, why, info }.
 */
async function buildCv({ d, title, company, jd, summary, shapedOnly = false }) {
  const { lane, headline } = laneFor(title);
  fs.mkdirSync(AUTO_DIR, { recursive: true });
  const head = tailor.cleanTitle(title);
  // Title first, company second: a NEW file name, so HubSpot never silently re-serves an older CV of the
  // same name (uploadOutreachFile reuses by name), and it reads cleanly to a recruiter.
  const shapedName = `CV_Elena_Revicheva_${tailor.slugOf(head, company).replace(/^_+/, '')}.pdf`;
  let why = '';
  // Already built for THIS deal (a dry run, or a run whose HubSpot write failed): reuse it — the model is paid once.
  const cachedJson = path.join(AUTO_DIR, shapedName.replace(/\.pdf$/, '.json'));
  try {
    const prev = JSON.parse(fs.readFileSync(cachedJson, 'utf8'));
    if (!RECOMPOSE && String(prev._deal) === String(d.id) && prev.sections && fs.existsSync(path.join(AUTO_DIR, shapedName))) {
      return { cvPath: path.join(AUTO_DIR, shapedName), name: shapedName, shaped: true, info: 'reused this deal\'s built CV' };
    }
  } catch { /* not built yet */ }
  // A crash here must still end in a CV and a 🛡️ note — otherwise cron would pay for the composer again every
  // 10 minutes for the same deal (code review, 11 Oct 2026).
  let c;
  try {
    c = await composeCv({ title: head, company, jd, lane, pitch: summary, cvName: shapedName, log: (m) => console.log(m) });
  } catch (e) {
    c = { spec: null, reason: `compose crashed: ${String(e.message || e).slice(0, 120)}` };
  }
  if (c.spec) {
    const jobPath = path.join(AUTO_DIR, shapedName.replace(/\.pdf$/, '.json'));
    try {
      const out = runBuilder(jobPath, c.spec, { _deal: d.id, _jd_chars: jd.length });
      const cvPath = path.join(AUTO_DIR, shapedName);
      if (fs.existsSync(cvPath)) return { cvPath, name: shapedName, shaped: true, info: `${c.provider} · ${out.split('sections')[1] || ''}`.trim() };
      why = 'builder wrote no file';
    } catch (e) {
      why = String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').pop().slice(0, 120);
    }
  } else {
    why = c.reason;
  }
  if (shapedOnly) return { cvPath: null, name: '', shaped: false, why };

  let job = tailor.tailorJob({ title, company, jd, lane, laneHeadline: headline, summary });
  const jobPath = path.join(AUTO_DIR, job.cv.replace(/\.pdf$/, '.json'));
  try {
    try { runBuilder(jobPath, job, { _deal: d.id, _jd_chars: jd.length }); }
    catch (e) {
      // A longer per-job summary must never cost the CV (the builder refuses a 3rd page): fall back to the lane's.
      if (!job.summary_source) throw e;
      console.log(`  ↺ ${company.slice(0, 22)} per-job summary did not fit — lane summary instead`);
      job = tailor.tailorJob({ title, company, jd, lane, laneHeadline: headline });
      runBuilder(jobPath, job, { _deal: d.id, _jd_chars: jd.length });
    }
    const cvPath = path.join(AUTO_DIR, job.cv);
    if (fs.existsSync(cvPath)) return { cvPath, name: job.cv, shaped: false, why, info: job.order.join('/') };
    return { cvPath: null, name: '', shaped: false, why: `${why}; builder wrote no file` };
  } catch (e) {
    return { cvPath: null, name: '', shaped: false, why: `${why}; ${String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').pop().slice(0, 100)}` };
  }
}

/** The 🛡️ note's CV line: the shaped one carries CV_MARK (the audit's ✓CV and hs-attach-cv read it). */
function cvLineHtml(cv) {
  if (!cv.cvPath) return '';
  if (!cv.shaped) return `<p>📎 <strong>Tailored CV attached to this note — use this one:</strong> ${esc(cv.name)}</p>`;
  return `<p>${CV_MARK}: <strong>${esc(cv.name)}</strong> — use this one. `
    + 'Its headings are this posting\'s own duties; every line under them comes from your reviewed CVs. Earlier CVs stay attached for the record.</p>';
}

/**
 * Upload a CV this run built. uploadOutreachFile re-serves ANY HubSpot file of the same name, so a taken name
 * (another deal's CV, or a hand-built one) gets this deal's id appended instead of silently re-serving that file.
 */
async function uploadCv(cvPath, name, dealId) {
  const up = await uploadOutreachFile(cvPath, name);
  if (!up.reused) return { id: up.id, name };
  const alt = name.replace(/\.pdf$/, `_${String(dealId).slice(-4)}.pdf`);
  return { id: (await uploadOutreachFile(cvPath, alt)).id, name: alt };
}

/**
 * A CV attachment that is neither a lane CV nor one this kit built (cv-by-job/auto) was made by hand — the 5–6 Oct
 * recipe. The backfill never composes over it: her best CV must not get a machine CV marked "use this one" above it.
 */
const LANE_CV_NAMES = new Set(Object.values(JSON.parse(fs.readFileSync(path.join(CV_DIR, 'lanes.json'), 'utf8')).lanes)
  .map((l) => String(l.cv).toLowerCase()));
function kitCvNames() {
  try { return new Set(fs.readdirSync(AUTO_DIR).filter((f) => f.endsWith('.pdf')).map((f) => f.toLowerCase())); }
  catch { return new Set(); }
}
async function handBuiltCv(notes) {
  const kit = kitCvNames();
  for (const n of notes) {
    for (const id of (await cvIdsOn(n)).cv) {
      const name = String(fileNames.get(id) || '').toLowerCase();
      // uploadCv may have added "_<last 4 of the deal id>" to a kit CV's name — still the kit's.
      const base = name.replace(/_\d{4}\.pdf$/, '.pdf');
      if (name && !LANE_CV_NAMES.has(name) && !kit.has(name) && !kit.has(base)) return fileNames.get(id);
    }
  }
  return '';
}

/** File ids on a note that are CVs (CV_*.pdf) — read from HubSpot Files, never guessed from the note text. */
const fileNames = new Map();
async function cvIdsOn(note) {
  const ids = String(note.properties.hs_attachment_ids || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    if (!fileNames.has(id)) {
      try { const f = await hs('GET', `/files/v3/files/${id}`); fileNames.set(id, `${f.name}.${String(f.extension || '').toLowerCase()}`); }
      catch { fileNames.set(id, ''); }
    }
    if (/^CV_.*\.pdf$/i.test(fileNames.get(id))) out.push(id);
  }
  return { all: ids, cv: out };
}

// Golden rule (Elena, 11 Oct 2026): nothing is wiped. Before the kit changes a note it did not create in this
// run, the note's exact body and attachment ids are appended here — OUTSIDE the repo, which is public.
const NOTE_BACKUP = path.join(os.homedir(), '_session-backups', 'apply-kit-cv', `notes-before-${new Date().toISOString().slice(0, 10)}.jsonl`);
function backupNote(n) {
  fs.mkdirSync(path.dirname(NOTE_BACKUP), { recursive: true });
  fs.appendFileSync(NOTE_BACKUP, JSON.stringify({ at: new Date().toISOString(), id: n.id,
    hs_attachment_ids: n.properties.hs_attachment_ids || '', hs_note_body: n.properties.hs_note_body || '' }) + '\n');
}

/**
 * Every note of the deal that carries a CV also carries THIS one (feedback 29 Sep: one current CV wherever she
 * looks). ADDITIVE ONLY (Elena, 11 Oct 2026: "do not wipe anything already existing — just make additive
 * changes"): nothing already attached is removed; the 🛡️ line names the file to use. Each note is backed up first.
 */
async function addCvToNotes(notes, fileId, alsoNoteId) {
  let changed = 0;
  for (const n of notes) {
    const { all, cv } = await cvIdsOn(n);
    const must = String(n.id) === String(alsoNoteId);
    if (!cv.length && !must) continue;
    if (all.includes(String(fileId))) continue;
    backupNote(n);
    await hs('PATCH', `/crm/v3/objects/notes/${n.id}`, { properties: { hs_attachment_ids: [...all, String(fileId)].join(';') } });
    changed++;
  }
  return changed;
}

// The CV each deal carries after this run — the letter pass attaches the same file (11 Oct 2026).
const DEAL_CV = new Map();

/**
 * Tailored CV + defense note for one deal. Returns a short status word for the log. Never throws
 * past its own try: a failure here must not stop the letter pass below.
 */
async function defensePass(d, notes, bodies, title, company, jobUrl) {
  if (bodies.some((b) => text(b).includes(DEFENSE_MARK))) return 'had';
  const jd = await postingText(jobUrl);
  // Per-job CV summary (1 Oct 2026): the 🎯 pitch written this run, or the one already on the deal.
  const summary = PITCH.get(String(d.id)) || pitchFromNotes(bodies);
  const cv = await buildCv({ d, title, company, jd, summary });
  const bank = tailor.loadBank();
  const entries = tailor.pickDefense({ title, jd }, bank);
  // The file goes up FIRST and the note is created already carrying it: the "📎 CV FOR THIS POSTING" line must
  // never exist without its file (code review, 11 Oct 2026). A failed upload writes the "not built" line instead.
  let fileId = '';
  if (APPLY && cv.cvPath) {
    try { const up = await uploadCv(cv.cvPath, cv.name, d.id); fileId = up.id; cv.name = up.name; }
    catch (e) { cv.why = `upload failed: ${String(e.message).split('\n')[0].slice(0, 100)}`; cv.cvPath = null; }
  }
  let html = tailor.renderDefenseHtml({
    title, company, entries, frame: bank.frame, cvName: '', mark: DEFENSE_MARK,
  }) + (cv.cvPath ? '' : `<p><em>Tailored CV not built (${esc(cv.why)}); the lane CV on the letter note applies.</em></p>`);
  // The CV line goes right under the title, where the old one sat.
  html = html.replace('</strong>', () => `</strong>${cvLineHtml(cv)}`);
  if (APPLY) {
    await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString(), ...(fileId ? { hs_attachment_ids: String(fileId) } : {}) },
      associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
    if (fileId) {
      if (cv.shaped) await addCvToNotes(notes, fileId);
      DEAL_CV.set(String(d.id), fileId);
    }
  }
  console.log(`  ${APPLY ? '🛡️ added' : '· would add'} ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)}`
    + ` jd=${jd.length} cv=${cv.cvPath ? `${cv.shaped ? 'SHAPED ' : 'tailor '}${cv.info}` : 'NONE ' + cv.why}`
    + `${cv.cvPath && !cv.shaped ? ` (not shaped: ${cv.why})` : ''} qa=${entries.map((e) => e.id).join(',')}`);
  return cv.cvPath ? 'added' : 'added-no-cv';
}

/**
 * --backfill-cv: a deal that already has its 🛡️ note but no posting-shaped CV gets one — ADDED to the 🛡️ note
 * (a new CV line goes above the old one, which stays) and to every other note that carries a CV. Nothing is
 * removed. A deal that cannot be shaped keeps exactly what it has.
 */
async function cvPass(d, notes, bodies, title, company, jobUrl) {
  if (!RECOMPOSE && bodies.some((b) => text(b).includes(CV_MARK))) return 'had';
  const shield = notes.find((n) => text(n.properties.hs_note_body).includes(DEFENSE_MARK));
  if (!shield) return 'nodefense';
  const mine = await handBuiltCv(notes);
  if (mine) { console.log(`  · cv ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)} hand-built CV kept: ${mine}`); return 'handbuilt'; }
  const jd = await postingText(jobUrl);
  const cv = await buildCv({ d, title, company, jd, summary: pitchFromNotes(bodies), shapedOnly: true });
  if (!cv.cvPath) { console.log(`  ✖ cv ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40)} — kept as is: ${cv.why}`); return 'kept'; }
  let changed = 0;
  if (APPLY) {
    const up = await uploadCv(cv.cvPath, cv.name, d.id);
    cv.name = up.name;
    // File FIRST (on the 🛡️ note and every note that carries a CV), the "use this one" line LAST — the line must
    // never name a file that is not attached (code review, 11 Oct 2026). Each note is backed up before its PATCH.
    changed = await addCvToNotes(notes, up.id, shield.id);
    const body = String(shield.properties.hs_note_body || '');
    // Additive: the new line goes ABOVE the old "📎 Tailored CV attached…" paragraph, which stays as it was;
    // a 🛡️ note without one gets the line under its title.
    const old = body.match(/<p[^>]*>\s*📎[\s\S]*?<\/p>/);
    const next = old ? body.replace(old[0], () => cvLineHtml(cv) + old[0]) : body.replace('</strong>', () => `</strong>${cvLineHtml(cv)}`);
    backupNote(shield);
    await hs('PATCH', `/crm/v3/objects/notes/${shield.id}`, { properties: { hs_note_body: next } });
    DEAL_CV.set(String(d.id), up.id);
  }
  console.log(`  ${APPLY ? '📄 rebuilt' : '· would rebuild'} cv ${company.slice(0, 22).padEnd(24)} ${title.slice(0, 40).padEnd(42)} ${cv.info}${APPLY ? ` · ${changed} note(s) now carry it` : ''}`);
  return 'rebuilt';
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
  const cvRun = { rebuilt: 0, had: 0, kept: 0, nodefense: 0, handbuilt: 0, failed: 0 };
  const cvIds = new Map();
  for (const d of deals) {
    if (ONLY && String(d.id) !== ONLY) continue;
    const { title, company } = parseDeal(d.properties.dealname);
    try {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes?limit=50`);
      const ids = (assoc.results || []).map((a) => String(a.toObjectId));
      const notes = ids.length
        ? (await hs('POST', '/crm/v3/objects/notes/batch/read', { properties: ['hs_note_body', 'hs_timestamp', 'hs_attachment_ids'], inputs: ids.map((id) => ({ id })) })).results || []
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
      try { defense[await defensePass(d, notes, bodies, title, company, jobUrl)]++; }
      catch (e) { defense.failed++; console.log(`  ✖ defense ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
      if (BACKFILL_CV) {
        try { cvRun[await cvPass(d, notes, bodies, title, company, jobUrl)]++; }
        catch (e) { cvRun.failed++; console.log(`  ✖ cv ${company.slice(0, 22)} ${String(e.message).slice(0, 110)}`); }
      }
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
          DEAL_CV.has(String(d.id))
            ? '<p><em>The CV for this posting (same file as on the 🛡️ note) is attached to this note. The older stub note below is superseded.</em></p>'
            : '<p><em>CV for this lane is attached to this note. The older stub note below is superseded.</em></p>',
        ].join('');
        const note = await hs('POST', '/crm/v3/objects/notes', {
          properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
        });
        // 11 Oct 2026: the deal's own CV when this run built one — never a second, generic CV next to it.
        if (DEAL_CV.has(String(d.id))) await addNoteAttachments(note.id, [DEAL_CV.get(String(d.id))]);
        else {
          const { cv } = laneFor(title);
          if (!cvIds.has(cv)) cvIds.set(cv, (await uploadOutreachFile(path.join(CV_DIR, cv), cv)).id);
          await addNoteAttachments(note.id, [cvIds.get(cv)]);
        }
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
  if (BACKFILL_CV) console.log(`  cv backfill: ${APPLY ? 'rebuilt' : 'would rebuild'} ${cvRun.rebuilt} · already shaped ${cvRun.had}`
    + ` · kept as is ${cvRun.kept} · hand-built kept ${cvRun.handbuilt} · no 🛡️ yet ${cvRun.nodefense} · failed ${cvRun.failed}`);
  console.log(`  role defense: ${APPLY ? 'added' : 'would add'} ${role.added} · already had ${role.had} · no apply link ${role.nolink} · failed ${role.failed}`);
  console.log(`  comet prompt: ${APPLY ? 'added' : 'would add'} ${comet.added} · already had ${comet.had} · waiting for a letter ${comet.wait} · failed ${comet.failed}`);
  researcher.save();
  const rs = researcher.stats;
  console.log(`  brief: ${APPLY ? 'added' : 'would add'} ${brief.added} · already had ${brief.had} · nothing found ${brief.none}`
    + ` · failed ${brief.failed} · research ${rs.researched} new / ${rs.cached} cached / ${rs.failed} failed · $${rs.spent.toFixed(4)}`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.log('FAILED — ' + String(e.message).slice(0, 200)); process.exit(1); });
