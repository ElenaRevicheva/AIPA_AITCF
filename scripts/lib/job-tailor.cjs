/**
 * job-tailor.cjs — tailor Elena's CV and technical-defense note to ONE posting, by SELECTION.
 *
 * WHY (28 Sep 2026, Elena): every new "🔥 I Act TODAY" HIRING deal should carry a CV tailored to
 * that posting and a short technical-defense note for the interview. Until now only hand-built
 * kits (KIRA, Niuro) had them; the other deals carried the generic lane CV.
 *
 * THE RULE (same as scripts/build_tailored_cv.py and build-lane-cv.cjs): NO model writes any
 * sentence. Tailoring = which VERIFIED project blocks appear and in what order, the posting's own
 * title as the headline, and which VERIFIED answers from docs/interview/defense-bank.json go in the
 * note. Nothing here can put a claim on a deal that Elena cannot defend.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BANK = path.join(ROOT, 'docs', 'interview', 'defense-bank.json');

// Keywords that make a VERIFIED project block (scripts/build-lane-cv.cjs PROJECTS) relevant.
// Deliberately absent: `espaluz` (its "paying / PayPal / 19 countries" line is still unconfirmed by
// Elena) and `judge` (its 14/20 + 8/18 sample reads as ~55% to an employer — `evalloop` tells the
// same system as a method).
const PROJECT_TAGS = {
  evalloop: ['eval', 'evaluation', 'testing', 'quality', 'accuracy', 'feedback loop', 'feedback', 'llm', 'ai agent',
    'agents', 'agentic', 'rag', 'memory', 'human-in-the-loop', 'human in the loop', 'experiment', 'metrics', 'judg'],
  loop: ['crm', 'hubspot', 'salesforce', 'sales', 'outreach', 'lead', 'pipeline', 'revops', 'marketing automation',
    'email', 'growth', 'account', 'client', 'customer', 'gtm', 'go-to-market', 'acquisition'],
  chain: ['reliab', 'uptime', 'production', 'fallback', 'failover', 'incident', 'on-call', 'monitoring', 'observability',
    'infrastructure', 'devops', 'scal', 'openai', 'anthropic', 'llm provider', 'integration', 'api'],
  api: ['seo', 'geo', 'aeo', 'search', 'visibility', 'content', 'marketing', 'website', 'web', 'analytics', 'audit',
    'public api', 'saas', 'product'],
  film: ['video', 'film', 'filmmak', 'content production', 'motion', 'image generation', 'storytelling', 'media production', 'creative technologist', 'creative ai'],
  studio: ['video', 'image', 'generative', 'creative', 'model', 'pipeline', 'production', 'automation', 'budget'],
};
const CREATIVE_ONLY = new Set(['film', 'studio']);

// Tie-break order per lane (mirrors build-lane-cv.cjs ORDER, minus the two blocks excluded above).
const LANE_ORDER = {
  creative: ['film', 'studio', 'api', 'chain'],
  crm: ['loop', 'api', 'chain', 'evalloop'],
  automation: ['loop', 'chain', 'evalloop', 'api'],
  exec_support: ['loop', 'chain', 'evalloop', 'api'],
  geo: ['api', 'loop', 'chain', 'evalloop'],
  evaluation: ['evalloop', 'chain', 'api', 'loop'],
  default: ['api', 'loop', 'evalloop', 'chain'],
};

const low = (s) => String(s || '').toLowerCase();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * A tag must start a word: "search" must not fire on "research", nor "api" on "rapid" or "capital"
 * (the first dry run on 20 real postings picked the SEO answer for a coaching role that way). Short
 * tags (≤ 4 letters: api, sla, kpi, rag, crm, seo, geo…) must be the whole word, plural allowed;
 * longer ones are stems ("reliab" → reliability).
 */
function hasTag(text, tag) {
  const t = tag.trim();
  const body = reEsc(t);
  const re = t.length <= 4 && /^[a-z]+$/.test(t)
    ? new RegExp(`(^|[^a-z0-9])${body}s?([^a-z0-9]|$)`)
    : new RegExp(`(^|[^a-z0-9])${body}`);
  return re.test(text);
}
const hits = (text, tags) => tags.filter((t) => hasTag(text, t)).length;

/** The posting's title, safe to use as a CV headline: no location noise, no ' — ' (the builder splits on it). */
function cleanTitle(title) {
  let t = String(title || '').replace(/\s+—\s+/g, ' - ');
  t = t.replace(/\((?:[^)]*\b(remote|latam|americas|worldwide|anywhere|hybrid|on-?site|contract|full[- ]time)\b[^)]*)\)/gi, ' ');
  t = t.split(/\s[|•]\s/)[0];
  t = t.replace(/\s+-\s+(remote|latam|americas|worldwide|anywhere|contract|full[- ]time)\b.*$/i, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, '') : t;
}

function slugOf(company, title) {
  const s = `${company}_${cleanTitle(title)}`.normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/[\s-]+/g, '_');
  return s.slice(0, 60).replace(/_+$/, '') || 'job';
}

/**
 * Job spec for build-lane-cv.cjs --job: the lane CV with the posting's title as headline and the
 * three most relevant verified project blocks first. Profile and "available for" stay the lane's.
 */
function tailorJob({ title, company, jd, lane, laneHeadline }) {
  const text = low(`${title}\n${jd}`);
  const base = LANE_ORDER[lane] || LANE_ORDER.default;
  const candidates = Object.keys(PROJECT_TAGS).filter((k) => lane === 'creative' || !CREATIVE_ONLY.has(k));
  const scored = candidates.map((k) => ({
    k, score: hits(text, PROJECT_TAGS[k]), rank: base.includes(k) ? base.indexOf(k) : 99,
  }));
  scored.sort((a, b) => b.score - a.score || a.rank - b.rank);
  let order = scored.slice(0, 3).map((x) => x.k);
  // A creative-lane job is judged on the portfolio, so the films always lead (29 Sep 2026: an "AI Video
  // Producer" posting scored film 1 on narrow tags and the CV shipped without the eight films).
  if (lane === 'creative') order = ['film', ...scored.map((x) => x.k).filter((k) => k !== 'film')].slice(0, 3);
  const tagline = String(laneHeadline || '').split(' — ').slice(1).join(' — ');
  const head = cleanTitle(title) || String(laneHeadline || '').split(' — ')[0];
  return {
    _note: 'Auto-tailored by scripts/lib/job-tailor.cjs (selection only; no generated text).',
    base_lane: lane,
    cv: `CV_Elena_Revicheva_${slugOf(company, title)}.pdf`,
    headline: tagline ? `${head} — ${tagline}` : head,
    order,
    _scores: Object.fromEntries(scored.map((x) => [x.k, x.score])),
  };
}

function loadBank(file = BANK) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Verified answers for this posting: the always-on ones + the best matches (max 5 in total). */
function pickDefense({ title, jd }, bank = loadBank(), max = 5) {
  const text = low(`${title}\n${jd}`);
  const byId = Object.fromEntries(bank.entries.map((e) => [e.id, e]));
  const chosen = (bank.always || []).filter((id) => byId[id]);
  const ranked = bank.entries
    .filter((e) => !chosen.includes(e.id))
    .map((e, i) => ({ id: e.id, score: hits(text, e.tags || []), i }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  for (const r of ranked) if (chosen.length < max) chosen.push(r.id);
  for (const id of bank.fill || []) if (chosen.length < max && byId[id] && !chosen.includes(id)) chosen.push(id);
  return chosen.map((id) => byId[id]);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The HubSpot note: short, one screen, her voice — every sentence straight from the bank. */
function renderDefenseHtml({ title, company, entries, frame, cvName, mark }) {
  const parts = [
    `<strong>${esc(mark)} — ${esc(title)} @ ${esc(company)}</strong>`,
    cvName ? `<p>📎 <strong>Tailored CV attached to this note — use this one:</strong> ${esc(cvName)}</p>` : '',
    `<p><em>Say this early:</em> "${esc(frame)}"</p>`,
  ];
  for (const e of entries) {
    parts.push(`<p><strong>Q: ${esc(e.q)}</strong><br>${esc(e.a)}${e.push ? `<br><em>If they push:</em> ${esc(e.push)}` : ''}</p>`);
  }
  parts.push('<p><em>Picked for this posting from docs/interview/defense-bank.json — every answer verified, none generated. Full prep example: docs/interview/NIURO_TECHNICAL_DEFENSE.md</em></p>');
  return parts.filter(Boolean).join('');
}

module.exports = { tailorJob, pickDefense, renderDefenseHtml, cleanTitle, slugOf, loadBank, PROJECT_TAGS };
