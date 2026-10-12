/**
 * cv-compose.cjs — a CV shaped like ONE posting, assembled from lines that already passed review.
 *
 * WHY (11 Oct 2026, Elena: "fix the kit so every deal gets CVs like this"). The 28 Sep kit only re-ordered six
 * engineering paragraphs and swapped the headline, so a Product Manager posting got the AI-builder CV with
 * "Product Manager" on top. The CVs she calls profound — Supabase v3, Puente Founder's Associate, AI Operations
 * Lead and Product Manager (5–11 Oct) — were built by hand the same way every time: the POSTING's own duties as
 * the section headings, and under them only lines that a fact-trace / recruiter / skeptic review had passed.
 *
 * THE RULE (unchanged from job-tailor.cjs): no model writes a CV sentence. A model only CHOOSES:
 *   · headings — each a verbatim piece of a posting line that describes the WORK (checked as a substring in code);
 *   · lines — ids from docs/applications/cv-bank.json, each placed under the duty it shows (ids checked in code).
 * Then an independent reviewer (gpt-5, as for the 🎯 note) removes any line that does not show the duty above it
 * and any heading that is a requirement she has not met. Anything that fails returns null, and the kit falls back
 * to the job-tailor CV — a deal never gets a broken or invented CV.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BANK = path.join(ROOT, 'docs', 'applications', 'cv-bank.json');
const { norm, describesHerAlone } = require(path.join(ROOT, 'dist', 'cover-letter.js'));

const MIN_JD = 200;
// Professional Outlook text — it lives in the Outlook, never in a role's CV (Elena, 11 Oct 2026).
const OUTLOOK_ONLY = new Set(['s-ai-native-daily-tools']);
// The shape a cached CV must have to be reused: a CV built before a composer change is built again.
const SHAPE = 'one-role-2026-10-11';
// A heading is a claim that she did that work, so a requirement she may lack can never be one.
// Language words count only as a LEVEL ("English C1", "native speaker"): "AI-native operations" is a duty.
const REQUIREMENT_RE = /\b\d+\s*\+?\s*years?\b|\byears? of\b|\bexperience (in|with)\b|\bdegree\b|\bbachelor|\bmaster'?s\b|\bcertif|\bproficien|\bbackground in\b|\bfamiliar(ity)? with\b|\bnative (speaker|english|spanish|portuguese|level)\b|\b(english|spanish|portuguese)\s+(fluen|proficien|level|native|[abc][12])/i;

/** A broken bank must fall back before any model is paid (code review, 11 Oct 2026). */
function bankProblem(bank) {
  const has = (x) => Array.isArray(x) && x.length > 0;
  const r = bank && bank.roles;
  if (!bank || !has(bank.bullets) || !has(bank.summary) || !has(bank.chips) || !has(bank.tagline) || !has(bank.steps)
    || !has(bank.live) || !r || !r.aideazz || !has(r.aideazz.intros) || !r.egov || !has(r.egov.bullets) || !r.omnibazaar || !r.fundery) {
    return 'cv-bank.json is missing a part';
  }
  return '';
}

function loadBank(file = BANK) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** "the roadmap for your product area: what gets built and in what order" → "What gets built and in what order" */
function headingOf(s) {
  const t = String(s).replace(/^[\s*•\-–—:;,.]+|[\s:;,.]+$/g, '').replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * A posting duty line is often longer than a heading should be. The first clause of a verbatim quote is still a
 * verbatim quote, so cut at the first clause break that leaves 12-70 characters — never add a word.
 * (First Oracle dry run, 11 Oct 2026: all four of a Chief of Staff posting's duty headings were whole sentences.)
 */
function fitHeading(h) {
  const t = String(h || '').trim();
  if (t.length <= 70) return t;
  const head = t.slice(0, 71);
  // A cut inside brackets leaves "(adoption, accuracy/quality" with no ")" (SIPEngines, 11 Oct): never break
  // after an unclosed "(" — cut before it instead.
  const open = head.indexOf('(');
  const breaks = [...head.matchAll(/[,:;(—–]|\s-\s/g)].map((m) => m.index)
    .filter((i) => i >= 12 && (open < 0 || i <= open));
  if (breaks.length) return t.slice(0, breaks[breaks.length - 1]).trim();
  const words = head.slice(0, head.lastIndexOf(' ')).trim().split(' ');
  while (words.length && /^(the|a|an|and|or|to|of|for|with|that|in|on|by|from|as|so|your|our)$/i.test(words[words.length - 1])) words.pop();
  return words.join(' ');
}

/** Share of a's words that already appear in b — a pitch that repeats a chosen summary line is dropped. */
function overlap(a, b) {
  const wa = norm(a).split(' ').filter((w) => w.length > 3);
  const wb = new Set(norm(b).split(' '));
  return wa.length ? wa.filter((w) => wb.has(w)).length / wa.length : 0;
}

async function openaiJson(system, user, model) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('no OPENAI_API_KEY');
  const reasoning = /^(gpt-5|o\d)/.test(model); // reasoning models reject `temperature`
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, ...(reasoning ? {} : { temperature: 0.2 }), response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(reasoning ? 240_000 : 90_000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`openai ${r.status}: ${(j.error && j.error.message) || ''}`.slice(0, 160));
  return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', provider: `openai:${model}` };
}

/** OpenAI first (same models as the 🎯 note); the quality chain when OpenAI is out of credits — logged, never silent. */
async function ask(system, user, model, label) {
  try { return await openaiJson(system, user, model); }
  catch (e) {
    console.warn(`[${label}] ${String(e.message || e).slice(0, 160)} — falling back to the quality chain`);
    const { completeWithProfileDetailed } = require(path.join(ROOT, 'dist', 'llm-resilience.js'));
    const out = await completeWithProfileDetailed('quality', system, user, 8000, label);
    return { text: out.text, provider: out.provider };
  }
}
const parseJson = (raw) => JSON.parse(String(raw).slice(String(raw).indexOf('{'), String(raw).lastIndexOf('}') + 1));

/**
 * Choose and check. Returns { spec, provider } or { spec: null, reason }.
 * `pitch` is the 🎯 role-defense one-liner (already fact-checked); Elena's 1 Oct rule keeps it as the opening line.
 */
async function composeCv({ title, company, jd, lane, pitch = '', cvName, bank, log = () => {} }) {
  const posting = String(jd || '').slice(0, 9000);
  if (posting.length < MIN_JD) return { spec: null, reason: `posting too short (${posting.length} chars)` };
  try { bank = bank || loadBank(); } catch (e) { return { spec: null, reason: `cv-bank.json unreadable: ${String(e.message).slice(0, 80)}` }; }
  if (bankProblem(bank)) return { spec: null, reason: bankProblem(bank) };
  const byId = Object.fromEntries(bank.bullets.map((b) => [b.id, b]));
  const pool = (list) => Object.fromEntries((list || []).map((x) => [x.id, x]));
  const P = {
    summary: pool(bank.summary), chips: pool(bank.chips), tagline: pool(bank.tagline), live: pool(bank.live),
    omnibazaar: pool(bank.roles.omnibazaar.bullets), egov: pool(bank.roles.egov.bullets), steps: pool(bank.steps),
    intro: pool(bank.roles.aideazz.intros),
  };
  const list = (o) => Object.values(o).map((x) => `${x.id}: ${x.text || x.title}`).join('\n');
  const catalog = [
    'BULLETS (for the sections):', bank.bullets.map((b) => `${b.id}: ${b.text}`).join('\n'),
    '', 'SUMMARY:', list(Object.fromEntries(Object.entries(P.summary).filter(([id]) => !OUTLOOK_ONLY.has(id)))), '', 'CHIPS:', list(P.chips),
    '', 'AIDEAZZ INTRO (pick one):', list(P.intro),
    '', 'LIVE WORK:', list(P.live), '', 'OMNIBAZAAR:', list(P.omnibazaar), '', 'E-GOV:', list(P.egov),
  ].join('\n');

  const system = [
    'You arrange a CV for ONE job from a BANK of checked lines. You never write CV text: you only choose ids and headings.',
    'HEADINGS: choose 3-5 headings for her current role. Copy each WORD FOR WORD from one line of the POSTING that describes the WORK of the job (what the person will do, own or deliver) — a contiguous piece of that line, 12-70 characters.',
    'Never use a requirement as a heading (years of experience, a degree, a language level, a certificate, a tool she must already know): every line under a heading claims she has done that work.',
    'The headings sit under her CURRENT role (AIdeazz AI Lab), so their ids come ONLY from BULLETS (ids starting with "b-"); E-GOV ("eg-") and OmniBazaar ("om-") ids go only in their own lists.',
    'Under each heading put 2-4 BULLET ids that SHOW her doing exactly that work, the strongest first. Each id at most once; 7-14 bullets in total. If no bullet shows a duty, leave the duty out — never stretch a line to fit.',
    'Also choose, for THIS role only: summary 1-2 ids (most relevant first); chips 3-5 ids; intro 1 id; live 3-4 ids; omnibazaar 0-2 ids; egov 1-3 ids.',
    'SUMMARY: at most ONE of the two AIdeazz lab summaries (s-products-end-to-end, s-automation-owner). When the posting names stakeholders, clients, compliance, governance, regulated environments or executive leadership, also pick s-cofounder-and-board or s-regulated-constraints, choose ALL the E-GOV lines and both OmniBazaar lines, and prefer bullets that show guardrails, approvals, fail-closed behaviour or cost control.',
    'CHIPS: scale figures only (products, services, tests, postings screened, executive years); never a chip that reads as a loss or a small count on its own (lost sign-ups, a ten-day audit count) — those belong in their bullets.',
    'Return one JSON object only.',
  ].join('\n');
  const user = [
    `JOB: ${title} at ${company}`, '', 'POSTING:', posting, '', 'BANK:', catalog, '',
    'Return {"sections":[{"heading":"verbatim piece of a posting duty line","ids":["b-…"]}],"summary":[],"chips":[],"intro":"","live":[],"omnibazaar":[],"egov":[]}',
  ].join('\n');

  let lastReason = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    let pick, provider;
    try {
      const out = await ask(system, attempt ? `${user}\n\nYour previous choice was rejected: ${lastReason}. Fix exactly that.` : user,
        (process.env.CV_COMPOSE_MODEL || process.env.ROLE_DEFENSE_MODEL || 'gpt-4.1').trim(), 'cv-compose');
      provider = out.provider;
      pick = parseJson(out.text);
    } catch (e) { lastReason = String(e.message || e).slice(0, 160); continue; }

    // ── gates in code: a prompt is a request, the check is the guarantee ──
    const problems = [];
    const used = new Set();
    const sections = [];
    for (const s of Array.isArray(pick && pick.sections) ? pick.sections : []) {
      const heading = fitHeading((s && s.heading) || '');
      if (heading.length < 12 || heading.length > 70) { problems.push(`heading "${heading.slice(0, 40)}" must be 12-70 characters`); continue; }
      // STRICT substring, not quotedIn(): quotedIn forgives a model-written "label:" in front of a real quote, and that
      // label would print on the CV (code review, 11 Oct 2026). Case, dashes and quote styles still do not matter.
      if (!norm(posting).includes(norm(heading))) { problems.push(`heading "${heading.slice(0, 50)}" is not copied word for word from the posting`); continue; }
      if (REQUIREMENT_RE.test(heading)) { problems.push(`heading "${heading.slice(0, 50)}" is a requirement, not a duty`); continue; }
      const sIds = Array.isArray(s.ids) ? s.ids.map(String) : [];
      const ids = sIds.filter((id) => byId[id] && !used.has(id));
      const unknown = sIds.filter((id) => !byId[id]);
      if (unknown.length) problems.push(`unknown bullet ids: ${unknown.slice(0, 3).join(', ')}`);
      ids.forEach((id) => used.add(id));
      if (ids.length) sections.push({ heading: headingOf(heading), ids });
    }
    const total = sections.reduce((n, s) => n + s.ids.length, 0);
    if (sections.length < 3 || total < 7) problems.push(`only ${sections.length} usable sections / ${total} bullets — need 3-5 sections and 7-14 bullets`);
    if (problems.length) { lastReason = problems.slice(0, 4).join('; '); log(`  ↺ compose attempt ${attempt + 1}: ${lastReason}`); continue; }

    // ── independent review (the 6 Oct recruiter + skeptic lenses; fact-trace is guaranteed by the bank) ──
    let kept = sections;
    let reviewer = '';
    let fitNote = '';
    try {
      const revSys = [
        'You review a CV assembled for one job. Every line under a heading claims the candidate did that heading\'s work.',
        'For EACH line: supported=true only if the line itself shows her doing the work its heading names. A related skill, or the same tool used for something else, is NOT support.',
        'For EACH heading: ok=false if it is a requirement (years, degree, language level, credential) rather than a duty of the job, or if it names a way of working that its lines do not show — e.g. "with engineering and design", "with customers", "cross-functional" teams, "stakeholders", or team rituals such as "standups" and "sprint/release planning" when no line shows her doing that WITH OTHER PEOPLE. Her lines describe work with AI agents, not with a human team: a heading that implies a human team is ok=false unless a line shows one.',
        `Finally: does the whole CV read as a CV for "${title}"? Answer reads_as true/false with one short reason. This is a note for the candidate, not a verdict on her: gaps in her experience are covered by her honest-gap answers elsewhere.`,
        'Return JSON only.',
      ].join('\n');
      const revUser = [
        'POSTING:', posting, '', 'CV SECTIONS:',
        sections.map((s, i) => `${i}. ${s.heading}\n${s.ids.map((id) => `   ${id}: ${byId[id].text}`).join('\n')}`).join('\n'),
        '', 'Return {"headings":[{"i":0,"ok":true,"why":""}],"lines":[{"id":"b-…","supported":true,"why":""}],"reads_as":true,"reads_as_why":""}',
      ].join('\n');
      const rv = await ask(revSys, revUser, (process.env.ROLE_REVIEW_MODEL || 'gpt-5').trim(), 'cv-review');
      reviewer = rv.provider;
      const rj = parseJson(rv.text);
      // The review must COVER everything — every heading, every line, and an explicit yes on the whole CV.
      // A partial or empty answer is not a pass (code review, 11 Oct 2026).
      const heads = Array.isArray(rj.headings) ? rj.headings.filter(Boolean) : [];
      const lines = Array.isArray(rj.lines) ? rj.lines.filter(Boolean) : [];
      const allHeads = sections.every((_, i) => heads.some((h) => Number(h.i) === i && typeof h.ok === 'boolean'));
      const allLines = sections.every((s) => s.ids.every((id) => lines.some((l) => String(l.id) === id && typeof l.supported === 'boolean')));
      if (!allHeads || !allLines || typeof rj.reads_as !== 'boolean') {
        lastReason = 'the independent review did not judge every heading and line';
        log(`  ↺ compose attempt ${attempt + 1}: ${lastReason}`);
        continue;
      }
      const badHead = new Set(heads.filter((h) => h.ok === false).map((h) => Number(h.i)));
      const badLine = new Set(lines.filter((l) => l.supported === false).map((l) => String(l.id)));
      kept = sections.filter((_, i) => !badHead.has(i))
        .map((s) => ({ ...s, ids: s.ids.filter((id) => !badLine.has(id)) })).filter((s) => s.ids.length);
      const left = kept.reduce((n, s) => n + s.ids.length, 0);
      const dropped = [...badLine].map((id) => `${id} (${(lines.find((l) => String(l.id) === id) || {}).why || ''})`.slice(0, 90));
      if (dropped.length || badHead.size) log(`  ✂ review dropped ${badHead.size} heading(s), ${dropped.length} line(s): ${dropped.slice(0, 3).join('; ')}`);
      // reads_as is the recruiter lens of the 6 Oct recipe: it informs, it does not veto. Those reviewers fixed lines
      // and still shipped a "borderline" PM CV with its gaps written down; the first Oracle dry run (11 Oct) showed a
      // veto here refusing every role she is not a perfect fit for. What gates is honesty: the lines that survive.
      if (rj.reads_as === false) log(`  ⓘ reviewer fit note: ${String(rj.reads_as_why || '').slice(0, 160)}`);
      fitNote = rj.reads_as === false ? String(rj.reads_as_why || '').slice(0, 300) : '';
      if (kept.length < 3 || left < 7) {
        lastReason = `too few lines survived the review: ${dropped.slice(0, 3).join('; ')}. Choose lines that show each duty`;
        log(`  ↺ compose attempt ${attempt + 1}: ${lastReason.slice(0, 200)}`);
        continue;
      }
    } catch (e) {
      // No silent pass: without the independent review this CV is not the 6 Oct standard — fall back.
      return { spec: null, reason: `review unavailable: ${String(e.message || e).slice(0, 120)}` };
    }

    // ── assemble from bank text only ──
    const take = (pool2, ids, n, min = 0) => {
      const out = [...new Set(ids || [])].filter((id) => pool2[id]).slice(0, n).map((id) => pool2[id]);
      return out.length >= min ? out : Object.values(pool2).slice(0, Math.max(min, n));
    };
    // ── ONE ROLE, not the Professional Outlook (Elena, 11 Oct 2026: "a tailored CV is a tailored CV — it should fit
    // each role, not repeat the professional outlook"). So: the tagline is this posting's own duties (the headings),
    // the summary opens with the pitch written for THIS posting, the Outlook's operating-model paragraph and the
    // "How I …" method block stay in the Outlook, and the figure boxes are the few this role cares about.
    const roleSummaries = Object.fromEntries(Object.entries(P.summary).filter(([id]) => !OUTLOOK_ONLY.has(id)));
    // 12 Oct 2026 (CodeRoad v1): the model picked BOTH lab-era summaries and the CV said "Since 2025 …" twice. At most one
    // of them; a second paragraph, if any, is the one about the other eras (OmniBazaar / E-GOV / regulated constraints).
    const LAB_SUMMARIES = new Set(['s-products-end-to-end', 's-automation-owner']);
    const chosenIds = [...new Set(Array.isArray(pick.summary) ? pick.summary.map(String) : [])].filter((id) => roleSummaries[id]);
    const firstLab = chosenIds.find((id) => LAB_SUMMARIES.has(id));
    const summaryIds = chosenIds.filter((id) => !LAB_SUMMARIES.has(id) || id === firstLab).slice(0, 2);
    const summary = (summaryIds.length ? summaryIds.map((id) => roleSummaries[id]) : take(roleSummaries, pick.summary, 1, 1)).map((x) => x.text);
    const lead = String(pitch || '').replace(/\s+/g, ' ').trim();
    // 0.4: the SIPEngines CV printed "requirements, architecture, orchestration…" in the pitch AND in a chosen
    // summary paragraph (11 Oct) — half the pitch's words repeated is already a repeat.
    if (lead && !describesHerAlone(lead) && overlap(lead, summary.join(' ')) < 0.4) summary.unshift(lead);
    const egov = take(P.egov, pick.egov, 3, 1);
    const spec = {
      _note: 'Posting-shaped CV by scripts/lib/cv-compose.cjs: headings verbatim from the posting, every line verbatim from docs/applications/cv-bank.json.',
      base_lane: lane,
      cv: cvName,
      headline: `${title} — ${kept.map((s) => s.heading).join(' · ')}`,
      summary,
      chips: take(P.chips, pick.chips, 5, 3).map((x) => x.text),
      roles: {
        aideazz: { line: bank.roles.aideazz.line, intro: (P.intro[pick.intro] || Object.values(P.intro)[0]).text },
        omnibazaar: { line: bank.roles.omnibazaar.line, bullets: take(P.omnibazaar, pick.omnibazaar, 2).map((x) => x.text) },
        egov: { line: bank.roles.egov.line, intro: bank.roles.egov.intro, bullets: egov.map((x) => x.text) },
        fundery: bank.roles.fundery,
      },
      sections: kept.map((s) => ({ heading: s.heading, bullets: s.ids.map((id) => byId[id].text) })),
      live: take(P.live, pick.live, 4, 3).map((x) => ({ text: x.text, links: x.links || [] })),
      tools: bank.tools,
      education: bank.education,
      languages: bank.languages,
      note: bank.figures_note,
      _composed: { shape: SHAPE, provider, reviewer, ids: kept.map((s) => s.ids), fit_note: fitNote },
    };
    return { spec, provider: `${provider} + review ${reviewer}` };
  }
  return { spec: null, reason: lastReason || 'no usable choice' };
}

module.exports = { composeCv, loadBank, bankProblem, fitHeading, headingOf, overlap, REQUIREMENT_RE, BANK, SHAPE };
