#!/usr/bin/env node
/**
 * build-lane-cv.cjs — one CV per lane, on the Toptal design Elena approved (24 Sep 2026).
 *
 *   node scripts/build-lane-cv.cjs               → every lane into docs/applications/cv-by-lane/
 *   node scripts/build-lane-cv.cjs --lane=crm    → one lane
 *
 * WHY. The reportlab lane CVs read as empty: every bullet printed as "■" (Helvetica has no ▪),
 * no product names or links, and no employer or dates for the current work, so the page said
 * "last job ended 2018". The Toptal CV (scripts/build-toptal-cv.cjs) had the named products,
 * numbers and Proof Hub. This renders THAT content under each lane's headline and profile.
 *
 * SOURCES — nothing here is generated:
 *   · headline, profile, language facts → docs/applications/cv-by-lane/lanes.json, emitted by
 *     scripts/build_tailored_cv.py --emit-rules (the single source of truth for lanes).
 *   · project blocks, Proof Hub, How I work, Stack, Earlier → the 13 Sep Toptal CV, verbatim.
 *   · AIdeazz 2025–Present, OmniBazaar 2024–2025, MGIMO, How-To-DAO, Anthropic Academy → the
 *     17 Sep resume (docs/selling/attachments/17.09.26_EN_Resume_Elena_Revicheva.pdf).
 *
 * Fonts: Noto Sans. CV_FONT_DIR overrides the Linux default (/usr/share/fonts/truetype/noto).
 * Needs pdf-lib + @pdf-lib/fontkit (NODE_PATH works if they are not in this repo).
 *
 * TEXT MODE (18 Oct 2026) — any document a bot is asked for (quote, proposal, letter, answer…) as PDF, Word or HTML:
 *   node scripts/build-lane-cv.cjs --text=<spec.json> [--format=pdf|docx|html] [--out=<file>]
 *   node scripts/build-lane-cv.cjs --text=- …        (spec JSON on stdin)
 * See "Text mode" below for the spec. The CV paths (--job / --lane) never enter it.
 * Bots (CTO AIPA, VJH, OpenClaw): always call THIS file in place (~/cto-aipa/scripts/build-lane-cv.cjs), never a
 * copy; always pass --text=<path> (never the space form) and --out=<file> inside the bot's own output folder,
 * and drop any "out" a model put in the spec. An existing file is never replaced unless --overwrite is passed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
// "--text", "--text=" and "--text=<path>" all mean text mode, so a missing path is refused, never a CV rebuild.
const TEXT_MODE = process.argv.slice(2).some((a) => a === '--text' || a.startsWith('--text='));
// Text mode is run by the bots, which may not pass NODE_PATH: let it find the kit's own deps folder too.
if (TEXT_MODE) {
  const deps = path.join(require('os').homedir(), 'cv-build-deps', 'node_modules');
  if (fs.existsSync(deps) && !module.paths.includes(deps)) module.paths.push(deps);
}
const { PDFDocument, rgb, PDFString } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = path.join(__dirname, '..');
const CV_DIR = path.join(ROOT, 'docs', 'applications', 'cv-by-lane');
const FONT_DIR = process.env.CV_FONT_DIR || '/usr/share/fonts/truetype/noto';
const LANES_JSON = TEXT_MODE ? null : JSON.parse(fs.readFileSync(path.join(CV_DIR, 'lanes.json'), 'utf8')); // text mode never reads lanes

const NAVY = rgb(0.118, 0.184, 0.322);
const INK = rgb(0.125, 0.141, 0.173);
const MUTED = rgb(0.353, 0.384, 0.439);
const RULE = rgb(0.75, 0.78, 0.82);
const WHITE = rgb(1, 1, 1);
const LINK = rgb(0.145, 0.322, 0.545);
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 50;
const MARGIN_BOTTOM = 42;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

/** lanes.json carries reportlab markup (<b>, &amp;, &nbsp;). Plain text here. */
const plain = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8209;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

// ── content shared by every lane (Toptal CV, 13 Sep, verbatim) ─────────────────
const PROJECTS = {
  api: {
    title: 'AI Visibility Audit API — public product',
    url: 'https://aideazz.xyz/api',
    show: 'aideazz.xyz/api',
    // 11 Oct 2026: "14,000+ signals" removed — the 6 Oct Puente review found it only in the Toptal draft, never re-verified.
    // 12 Oct 2026: "420+ audits, 210+ sites, median 85" and the self-scored "100/100" retired — log rotation deleted the
    // history behind them; the October figure is what the server logs still show (same sentence as cv-bank and the Outlook).
    body: 'Live scoring for how discoverable a site is to ChatGPT, Perplexity and Claude, not only Google. In the server logs for 1–10 October alone: 39 audits of 18 websites, 18 of them run by people on the public page. Each check returns the fix and why it matters (34 why / 4 fix on a live stripe.com run).',
  },
  loop: {
    title: 'Approved-send growth loop — HubSpot + Resend',
    // 29 Sep 2026: counts from the live HubSpot API that day (2,870 deals · 1,371 contacts · 2,127
    // companies), rounded down like the API block. Audit sentence: docs/interview/
    // MICRO1_AI_WORKFLOW_SPECIALIST_PREP.md + the 16 Jul log-verified audit.
    body: 'The acquisition loop I run in production: research, qualify, draft, one human tap, send, then delivery and open written back to the CRM. 3,000+ CRM records written by the agents: 1,800+ job leads from my own job search and 800+ business prospects. Send is fail-closed: if a PDF or signed .docx fails to load, the email is refused so it cannot claim an attachment it did not carry. I audit the CRM from the receiving end, not the sender\'s log: that found a trial-signup → HubSpot integration silently broken since launch — 28 real users never recorded; root-caused, fixed, backfilled all 28.',
  },
  espaluz: {
    title: 'EspaLuz — paying WhatsApp / Telegram tutor',
    url: 'https://wa.me/50766623757',
    show: 'wa.me/50766623757',
    body: 'Bilingual relocation and language tutor on WhatsApp and Telegram. Persistent per-student memory (RAG + pgvector). PayPal subscriptions. Early users in 19 countries. I am the architect and the on-call.',
  },
  // 29 Sep 2026 review: "every model call" overclaimed (two features bypassed the chain until 28 Sep) and
  // listed a wrong order; "130-test ... $0 API cost" was unverified (649 passing 29 Sep, live provider
  // checks cost cents); "76% vs ~21%" was on CLAUDE.md's unverified list — job_monitor.py records 72.4% vs ~5.6%.
  chain: {
    title: 'Fail-closed publishing and a five-provider LLM chain',
    url: 'https://aideazz.xyz/ai-ops-wiki.html',
    show: 'aideazz.xyz/ai-ops-wiki.html',
    body: 'My agents\' model calls go through an ordered five-provider fallback (OpenAI, Gemini, Groq, Grok, Claude): a live probe on 28 Sep 2026 had four answering while Claude had no credits. When Groq deprecated the models I used, the fleet kept serving — a config change, not an outage. The daily publisher will not print a number it cannot trace; if the model decorated the facts, the day stayed silent. A 600+ test eval suite (unit, integration, golden-set) runs in under a minute.',
  },
  // 28 Sep 2026 — verified on Oracle the same day: replay of the judge on 38 of her real decisions
  // WITH the posting each was made on (14/20 rejections, 8/18 applications agree); the RAG variant
  // scored 6-7/18 and ships OFF; location/pay/AI-ban guards are code, not prompt (VJH d2b9aa7..45f6411).
  judge: {
    title: 'AI screening judge — measured on real decisions before it ships',
    url: 'https://aideazz.xyz/ai-ops-wiki.html',
    show: 'aideazz.xyz/ai-ops-wiki.html',
    body: 'An LLM judge screens the jobs my search agent finds; what the model may not decide is enforced in code — a location or pay it misreads is overruled from the posting itself. Each of my own decisions is stored with the posting it was made on, and the judge is measured against them: 14 of 20 rejections and 8 of 18 applications agree. A retrieval (RAG) upgrade scored lower on that test, so it ships switched off.',
  },
  // 28 Sep 2026 — the same system told as a METHOD, no small-sample numbers (ChatGPT review for Niuro:
  // 14/20 + 8/18 reads as ~55% to an employer and distracts from the loop itself). Verified: evidence
  // memory (job_listings + LangGraph checkpoints), replay_learning.py, fit_gate/llm_judge code guards
  // for location, pay and AI bans, RAG A/B 6-7/18 vs 8-9/18 → shipped OFF (VJH 5782f3d..45f6411).
  evalloop: {
    title: 'AI evaluation & feedback loop — changes tested before release',
    url: 'https://aideazz.xyz/ai-ops-wiki.html',
    show: 'aideazz.xyz/ai-ops-wiki.html',
    body: 'My job-search agent learns every hour from the decisions I record in the CRM. Each decision is stored with the posting it was made on and replayed as an offline evaluation set before a judge change ships. Hard constraints such as location and pay are enforced by deterministic rules, not left to the model. A proposed RAG upgrade scored lower on that evaluation set, so I kept it disabled rather than ship a more complex, less accurate system.',
  },
  // 28 Sep 2026 — creative lane. Verified: 8 films on the live gallery (films.json); film #8
  // record docs/atuona/FILM8_2026-09-22.md (3:36, 16 shots, −15.7 LUFS); 99 poems in atuona
  // content/poems.json; bot engines + the price-cap incident in NOW.md 22 Sep and the AI Ops Wiki.
  film: {
    title: 'ATUONA AI Film Studio — 8 published films',
    url: 'https://atuona.xyz/aifilmstudio/',
    show: 'atuona.xyz/aifilmstudio',
    body: 'Each film is made end to end by a pipeline I built: poems from my own ATUONA universe (99 published, in Russian and English) become shots generated per type after a model bake-off; narration is locked to each clip, music is ducked under the voice and the mix is normalised to broadcast loudness; every render is verified before release. The latest, Crimson Escape, runs 3:36 from 16 newly generated shots at −15.7 LUFS.',
  },
  studio: {
    title: 'Generative production bot — a dozen models, one director',
    url: 'https://aideazz.xyz/ai-ops-wiki.html',
    show: 'aideazz.xyz/ai-ops-wiki.html',
    body: 'A Telegram production bot that drives a dozen video and a dozen image models, with an LLM acting as director and a pre-render budget guard. When that guard could never fire — it read a price field the vendor never sends — I found it, fixed it, and published the postmortem.',
  },
};

/** Which project leads is the only tailoring — the text never changes. */
const ORDER = {
  creative: ['film', 'studio', 'api', 'chain'],
  crm: ['loop', 'api', 'chain', 'espaluz'],
  automation: ['loop', 'chain', 'api', 'espaluz'],
  exec_support: ['loop', 'chain', 'espaluz', 'api'],
  geo: ['api', 'loop', 'chain', 'espaluz'],
  evaluation: ['chain', 'api', 'loop', 'espaluz'],
  default: ['api', 'loop', 'espaluz', 'chain'],
};

const AVAILABLE = {
  crm: [
    'HubSpot administration: pipelines, stages, properties, associations, tasks and reporting',
    'Sales-ops automation through the HubSpot API — records, notes, files and follow-ups',
    'CRM data quality: audits from live records, deduplication, source attribution',
    'Documented, repeatable workflows that a second person can run',
  ],
  language: [
    'Russian–English evaluation of AI speech and text: naturalness, stress, register',
    'Written rationales and rubrics another reviewer can check',
    'Bilingual content and localisation where register matters',
  ],
  creative: [
    'Generative video and image production: concept, shot design, model choice, iteration',
    'Automated edit, narration, mix and publishing pipelines',
    'Creative world-building and writing in English and Russian',
    'Multi-model production on a budget, with cost guards and fallbacks',
  ],
  default: [
    'Production LLM systems with fallback, evals and on-call ownership',
    'CRM and approved-send outreach (HubSpot, Resend, human-in-the-loop)',
    'AI-search visibility (GEO/AEO) audits and engines — ChatGPT, Perplexity, Claude',
    'Fail-closed publishing and internal AI operations for a founder-led team',
  ],
};

const STACK = {
  creative: 'Video: Wan, Grok Imagine, Kling, Runway, Luma  ·  Image: Flux, Seedream, Ideogram  ·  Audio: TTS narration, mixing, loudness (LUFS)  ·  FFmpeg  ·  LLM direction (DeepSeek, GPT)  ·  TypeScript  ·  Python  ·  Telegram bot orchestration  ·  Oracle Cloud (OCI)',
  crm: 'HubSpot (CRM, pipelines, associations, tasks, files, API)  ·  Make  ·  Resend  ·  Python  ·  TypeScript  ·  Node.js  ·  PostgreSQL  ·  Playwright  ·  Oracle Cloud (OCI)',
  default: 'Python  ·  TypeScript  ·  Node.js  ·  FastAPI  ·  LangGraph  ·  RAG (pgvector)  ·  HubSpot  ·  Make  ·  Resend  ·  Playwright  ·  PostgreSQL  ·  Docker  ·  Oracle Cloud (OCI)',
};

const PROOFS = [
  { label: 'Portfolio', url: 'https://aideazz.xyz/portfolio', show: 'aideazz.xyz/portfolio' },
  { label: 'Atlas', url: 'https://aideazz.xyz/atlas', show: 'aideazz.xyz/atlas' },
  { label: 'Wiki', url: 'https://aideazz.xyz/ai-ops-wiki.html', show: 'ai-ops-wiki.html' },
  { label: 'Ops SOP', url: 'https://aideazz.xyz/sop-ai-ops.html', show: 'sop-ai-ops.html' },
  { label: 'Blog', url: 'https://aideazz.xyz/blog', show: 'aideazz.xyz/blog' },
  { label: 'Podcast', url: 'https://podcast.aideazz.xyz/', show: 'podcast.aideazz.xyz' },
  { label: 'EspaLuz WA', url: 'https://wa.me/50766623757', show: 'wa.me/50766623757' },
  { label: 'Atuona Studio', url: 'https://atuona.xyz/aifilmstudio/', show: 'atuona.xyz/aifilmstudio' },
];

const LANGUAGES_LINE = {
  language: 'Russian — native  ·  English — fluent (professional)  ·  Spanish — working (resident in Panama)  ·  French — elementary',
  default: 'English — fluent (professional)  ·  Spanish — intermediate  ·  Russian — native  ·  French — elementary',
};

// Noto Sans has no arrows and no true minus sign: "trial-signup → HubSpot" printed as "trial-signup  HubSpot"
// (read back from a kit CV, 11 Oct 2026). Say it in words instead of printing an empty glyph.
const glyphSafe = (s) => String(s).replace(/\s*→\s*/g, ' to ').replace(/[−‑]/g, '-');

function wrap(font, text, size, maxW) {
  const words = glyphSafe(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function buildLane(lane, job = null) {
  // --job=<file.json> (28 Sep 2026): ONE application's CV = a lane CV with its own headline, summary
  // and project order. Everything else — design, project blocks, proof hub — is the lane's, unchanged.
  const base = LANES_JSON.lanes[lane];
  if (!base) throw new Error(`unknown lane: ${lane}`);
  const cfg = job ? { ...base, ...job } : base;
  const headline = plain(cfg.headline);
  const [title, ...rest] = headline.split(' — ');
  const tagline = rest.join(' — ');

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = (f) => pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, f)), { subset: true });
  const regular = await font('NotoSans-Regular.ttf');
  const bold = await font('NotoSans-Bold.ttf');
  const italic = await font('NotoSans-Italic.ttf');

  const pages = [];
  let page;
  let y;
  const drawText = (text, o) =>
    page.drawText(glyphSafe(text), { x: o.x ?? MARGIN_X, y: o.y, size: o.size, font: o.font, color: o.color ?? INK });
  const linkText = (label, uri, x, y0, size, f, color) => {
    drawText(label, { x, y: y0, size, font: f, color: color ?? LINK });
    const w = f.widthOfTextAtSize(label, size);
    const annot = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [x, y0 - 2, x + w, y0 + size + 2],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) },
      }),
    );
    page.node.addAnnot(annot);
    return w;
  };
  const footer = (p, n) => {
    p.drawText('aideazz.xyz/portfolio', { x: MARGIN_X, y: 22, size: 7, font: regular, color: MUTED });
  };
  const headerBand = (first) => {
    const h = first ? 126 : 36;
    page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: NAVY });
    if (!first) {
      drawText(`ELENA REVICHEVA  ·  ${title}`, { y: PAGE_H - 23, size: 9, font: bold, color: WHITE });
      return PAGE_H - 56;
    }
    drawText('ELENA REVICHEVA', { y: PAGE_H - 38, size: 20, font: bold, color: WHITE });
    drawText(title, { y: PAGE_H - 58, size: 11, font: regular, color: rgb(0.82, 0.86, 0.92) });
    if (tagline) {
      // A posting-shaped tagline is a list ("a · b · c"): drop whole items from the end until it fits one line.
      let tl = glyphSafe(tagline);
      while (italic.widthOfTextAtSize(tl, 8.5) > CONTENT_W && tl.includes(' · ')) tl = tl.slice(0, tl.lastIndexOf(' · '));
      drawText(tl, { y: PAGE_H - 76, size: 8.5, font: italic, color: rgb(0.72, 0.78, 0.86) });
    }
    let cx = MARGIN_X;
    const cy = PAGE_H - 96;
    const bits = [
      { t: 'aipa@aideazz.xyz', u: 'mailto:aipa@aideazz.xyz' },
      { t: '+507 616 66 716' },
      { t: 'LinkedIn', u: 'https://linkedin.com/in/elenarevicheva' },
      { t: 'GitHub', u: 'https://github.com/ElenaRevicheva' },
      { t: 'aideazz.xyz/portfolio', u: 'https://aideazz.xyz/portfolio' },
    ];
    bits.forEach((b, i) => {
      if (i) {
        drawText('  ·  ', { x: cx, y: cy, size: 7.5, font: regular, color: rgb(0.65, 0.72, 0.8) });
        cx += regular.widthOfTextAtSize('  ·  ', 7.5);
      }
      if (b.u) cx += linkText(b.t, b.u, cx, cy, 7.5, regular, rgb(0.85, 0.9, 0.96));
      else {
        drawText(b.t, { x: cx, y: cy, size: 7.5, font: regular, color: rgb(0.85, 0.9, 0.96) });
        cx += regular.widthOfTextAtSize(b.t, 7.5);
      }
    });
    drawText('Full-time or contract  ·  Remote worldwide or on-site in Panama City  ·  UTC-5', {
      y: PAGE_H - 114,
      size: 7.5,
      font: regular,
      color: rgb(0.7, 0.76, 0.84),
    });
    return PAGE_H - 148;
  };
  const addPage = (first) => {
    if (page) footer(page, pages.length);
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = headerBand(first);
  };
  const ensure = (need) => {
    if (y - need < MARGIN_BOTTOM + 16) addPage(false);
  };
  const section = (t) => {
    ensure(40);
    drawText(t.toUpperCase(), { y, size: 8.5, font: bold, color: NAVY });
    y -= 6;
    page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 0.8, color: RULE });
    y -= 14;
  };
  const para = (text, f = regular, size = 8.6, leading = 11.4, color = INK) => {
    for (const line of wrap(f, text, size, CONTENT_W)) {
      ensure(leading + 2);
      drawText(line, { y, size, font: f, color });
      y -= leading;
    }
  };
  const project = (p) => {
    ensure(52);
    drawText(p.title, { y, size: 10, font: bold });
    y -= 13;
    if (p.url) {
      linkText(p.show, p.url, MARGIN_X, y, 8, regular);
      y -= 12;
    }
    para(p.body);
    y -= 8;
  };
  const roleLine = (text, detail) => {
    ensure(30);
    // Wraps: her full E-GOV title (11 Oct 2026) ran past the right margin on one line.
    for (const line of wrap(bold, text, 9, CONTENT_W)) {
      ensure(14);
      drawText(line, { y, size: 9, font: bold });
      y -= 12;
    }
    if (detail) para(detail);
    y -= 6;
  };

  const executiveRoles = () => {
    // 11 Oct 2026: her exact title and the sentence the 6 Oct Puente reviewers checked against her own words
    // (user profile). The old "IT, legal and compliance" line is held until she confirms it.
    roleLine(
      'Deputy CEO for Corporate Governance & Chief Legal Officer — JSC “E-GOV OPERATOR”  ·  2011–2018',
      'A ~60-person company moving the delivery of public services into electronic form for the regional government. I owned the board process and drove the board\'s decisions through to implementation.',
    );
    roleLine('Deputy CEO, Business Development — Fundery LLC (fintech)  ·  2017–2018');
  };

  const laneBody = () => {
    section('Summary');
    // 28 Sep 2026 — the through-line opened every lane. 11 Oct 2026, Elena: film CVs only — the 6 Oct
    // reviewers cut "…the films they make" from an operations CV as off-target.
    if (lane === 'creative') {
      para(plain(LANES_JSON.through_line), bold, 9.2, 12);
      y -= 2;
    }
    para(plain(cfg.profile), regular, 9, 12);
    y -= 6;

    section('Experience');
    roleLine(
      'Founder & AI Product and Solutions Lead — AIdeazz.xyz  ·  Panama / Remote  ·  2025–Present',
      'Founder-led AI lab. I design, build and operate its production AI systems end to end — the architect, the reviewer and the on-call.',
    );
    if (lane === 'language') {
      for (const f of LANES_JSON.facts.filter((x) => x.tags.includes('language'))) {
        project({ title: plain(f.lead), body: plain(f.body) });
      }
    } else {
      for (const k of (job && job.order) || ORDER[lane] || ORDER.default) project(PROJECTS[k]);
    }
    roleLine('Operational Co-Founder — OmniBazaar, decentralised e-commerce  ·  2024–2025');
    // 1 Oct 2026, Elena: "put my CLO on the 1st page". For legal / compliance / contracts postings
    // (job-tailor sets executive_first) the executive roles are Experience, not a footnote on page 2.
    if (cfg.executive_first) executiveRoles();

    section('Proof Hub');
    const colW = CONTENT_W / 2;
    PROOFS.forEach((p, i) => {
      if (i % 2 === 0) ensure(16);
      const x = MARGIN_X + (i % 2) * colW;
      drawText(p.label, { x, y, size: 7.5, font: bold });
      linkText(p.show, p.url, x + 92, y, 7.2, regular);
      if (i % 2 === 1 || i === PROOFS.length - 1) y -= 13;
    });
    y -= 8;

    section('How I work');
    // 11 Oct 2026: no baseline next to the 72% — NOW.md 5 Oct, VJH's own comments disagree (~5.6% vs ~21%).
    para(
      plain(LANES_JSON.operating_model) + ' I judge a new data source by running it through the live gate before integrating it: a job source added in August cleared my live filter 72% of the time, across all 345 of its postings, so it stayed. I write the failure down and name it — clients can read how I debug before they hire me.',
    );
    y -= 8;

    section('Available for');
    for (const line of (job && job.available) || AVAILABLE[lane] || AVAILABLE.default) {
      ensure(16);
      drawText('–  ' + line, { y, size: 8.8, font: regular });
      y -= 14;
    }
    y -= 6;

    section(lane === 'language' ? 'Language & audio toolkit' : 'Stack');
    para(lane === 'language' && cfg.foundation ? plain(cfg.foundation) : STACK[lane] || STACK.default);
    y -= 8;

    if (!cfg.executive_first) {
      section('Earlier');
      executiveRoles();
    }

    section('Education');
    para(
      'MA Social Psychology — Penza State University · 2018. Blockchain Regulation — MGIMO, Moscow · 2017. Presidential Program for Executive Management — RANEPA · 2015. Polkadot Blockchain Academy, PBA-X Wave 3 · 2025. How-To-DAO Cohort · 2025. Anthropic Academy — Claude Certification Program · 2026, in progress. Internship — Nyskapingsparken Innovation Park, Bergen, Norway.',
    );
    y -= 8;

    section('Languages');
    para(LANGUAGES_LINE[lane] || LANGUAGES_LINE.default);
  };

  // ── Posting-shaped CV (11 Oct 2026, Elena: "fix the kit so every deal gets CVs like this") ──────────
  // The 5–6 Oct hand-built CVs (Supabase v3, Puente Founder's Associate / AI Ops Lead / PM) put checked
  // bullets under the POSTING's own headings. scripts/lib/cv-compose.cjs chooses the headings (verbatim from
  // the posting) and the lines (verbatim from docs/applications/cv-bank.json); this only lays them out.
  const space = (size) => regular.widthOfTextAtSize(' ', size);
  /** "**Lead.** rest" → a bold lead-in, as on the hand-built CVs. */
  const runs = (s) => {
    const m = String(s).match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
    return m ? [{ t: m[1], f: bold }, { t: m[2], f: regular }] : [{ t: String(s), f: regular }];
  };
  /** Wrap mixed bold/regular text; consecutive same-font words are drawn as one string so ATS parsers read words, not letters. Returns where the last line ended. */
  const richPara = (segs, x0, maxW, size = 8.5, leading = 11) => {
    const words = segs.flatMap((sg) => glyphSafe(sg.t).split(/\s+/).filter(Boolean).map((w) => ({ w, f: sg.f })));
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const wd of words) {
      const ww = wd.f.widthOfTextAtSize(wd.w, size);
      if (cur.length && curW + space(size) + ww > maxW) { lines.push(cur); cur = []; curW = 0; }
      curW += (cur.length ? space(size) : 0) + ww;
      cur.push(wd);
    }
    if (cur.length) lines.push(cur);
    let endX = x0;
    for (const ln of lines) {
      ensure(leading + 2);
      let x = x0;
      const groups = [];
      for (const wd of ln) {
        const g = groups[groups.length - 1];
        if (g && g.f === wd.f) g.t += ` ${wd.w}`;
        else groups.push({ t: wd.w, f: wd.f });
      }
      groups.forEach((g, i) => {
        if (i) x += space(size);
        page.drawText(g.t, { x, y, size, font: g.f, color: INK });
        x += g.f.widthOfTextAtSize(g.t, size);
      });
      endX = x;
      y -= leading;
    }
    return { endX, lastY: y + leading };
  };
  const bullet = (s, size = 8.5) => {
    ensure(26);
    drawText('–', { x: MARGIN_X + 2, y, size, font: regular });
    const r = richPara(runs(s), MARGIN_X + 12, CONTENT_W - 12, size);
    y -= 1.5;
    return r;
  };
  const subhead = (t) => {
    ensure(36);
    drawText(t, { y, size: 9, font: bold, color: NAVY });
    y -= 12;
  };
  const chips = (list) => {
    const size = 7.8;
    const padX = 5;
    const h = 13;
    let x = MARGIN_X;
    ensure(h + 8);
    for (const c of list.map(glyphSafe)) {
      const w = bold.widthOfTextAtSize(c, size) + padX * 2;
      if (x + w > MARGIN_X + CONTENT_W) { x = MARGIN_X; y -= h + 4; ensure(h + 8); }
      page.drawRectangle({ x, y: y - 3.5, width: w, height: h, borderColor: RULE, borderWidth: 0.8 });
      drawText(c, { x: x + padX, y, size, font: bold, color: NAVY });
      x += w + 5;
    }
    y -= h + 6;
  };
  const sectionedBody = () => {
    const R = job.roles;
    section('Summary');
    for (const line of job.summary) { richPara(runs(line), MARGIN_X, CONTENT_W, 9, 12); y -= 3; }
    if (job.chips && job.chips.length) chips(job.chips);
    y -= 2;

    section('Experience');
    roleLine(R.aideazz.line, R.aideazz.intro);
    for (const s of job.sections) {
      subhead(s.heading);
      for (const b of s.bullets) bullet(b);
      y -= 3;
    }
    if (R.omnibazaar) { roleLine(R.omnibazaar.line); for (const b of R.omnibazaar.bullets || []) bullet(b); y -= 3; }
    if (R.egov) { roleLine(R.egov.line, R.egov.intro); for (const b of R.egov.bullets || []) bullet(b); y -= 3; }
    if (R.fundery) roleLine(R.fundery.line);

    if (job.steps && job.steps.items.length) {
      section(job.steps.title);
      job.steps.items.forEach((s, i) => {
        ensure(26);
        drawText(`${i + 1}.`, { x: MARGIN_X + 2, y, size: 8.5, font: bold });
        richPara(runs(s), MARGIN_X + 14, CONTENT_W - 14);
        y -= 1;
      });
      y -= 5;
    }

    if (job.live && job.live.length) {
      section('Live work — links');
      for (const item of job.live) {
        const end = bullet(item.text);
        // Links ride on the item's last line when they fit, else on a line of their own.
        const links = item.links || [];
        const sep = '  ·  ';
        const linksW = links.reduce((w, l, i) => w + (i ? regular.widthOfTextAtSize(sep, 7.8) : 0) + regular.widthOfTextAtSize(l.label, 7.8), 0)
          + regular.widthOfTextAtSize(sep, 7.8);
        let lx = end.endX + regular.widthOfTextAtSize(sep, 7.8);
        let ly = end.lastY;
        if (links.length && end.endX + linksW > MARGIN_X + CONTENT_W) { ensure(13); lx = MARGIN_X + 12; ly = y; y -= 11; }
        links.forEach((l, i) => {
          if (i) { drawText(sep, { x: lx, y: ly, size: 7.8, font: regular, color: MUTED }); lx += regular.widthOfTextAtSize(sep, 7.8); }
          lx += linkText(l.label, l.url, lx, ly, 7.8, regular);
        });
      }
      y -= 5;
    }

    for (const [title, body] of [['Tools', job.tools], ['Education & professional development', job.education], ['Languages', job.languages]]) {
      if (!body) continue;
      section(title);
      para(body, regular, 8.5, 11);
      y -= 6;
    }
    if (job.note) para(job.note, italic, 7.6, 10, MUTED);
  };

  addPage(true);
  if (job && job.sections) sectionedBody();
  else laneBody();

  footer(page, pages.length);
  const n = pages.length;
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${n}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(label, 7),
      y: 22,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });
  if (n > 2) throw new Error(`${lane}: ${n} pages — a CV is at most 2`);

  pdf.setTitle(`Elena Revicheva — ${title}`);
  pdf.setAuthor('Elena Revicheva');
  pdf.setCreator('scripts/build-lane-cv.cjs');
  const out = job ? path.join(path.dirname(job._path), job.cv) : path.join(CV_DIR, cfg.cv);
  const bytes = await pdf.save();
  fs.writeFileSync(out, bytes);
  return { lane, file: cfg.cv, pages: n, bytes: bytes.length };
}

// ── Text mode (18 Oct 2026) ──────────────────────────────────────────────────────────────────────────────
// Elena: "make bots recognise and create pdfs and word out of the task I send by voice or text in eng or esp".
// One renderer for every bot. The bot writes the spec; this draws it word for word. No model is called here,
// so nothing in the file can be invented by the renderer.
//
// spec: { kind: letter|answer|quote|proposal|evaluation|report|prep|other, lang: es|en|ru (or es-PA, en-US…),
//         title, subtitle?, meta?: [lines], text: light Markdown, out: file (relative = to the spec file),
//         date?: footer date (default: today in Panama), footer?: string | false }
// Markdown: # / ## / ### headings · "- " "* " "• " bullets · "1." / "1)" items · **bold** · "> " quote (">50"
//   stays literal) · --- rule · ``` fence lines dropped · `ticks` dropped · [label](url) → "label (url)" ·
//   one line = one line · blank = paragraph. No tables: a "|---|---|" row is refused — the spec-writing prompt
//   must ask for numbered price lines ("1. Diagnóstico — $100"). A line break inside title / subtitle / footer /
//   date becomes a space; inside a meta string it starts a new meta line.
// The title is drawn for every kind except a letter (a letter opens with its salutation). Every kind except a
// letter carries the footer "Elena Revicheva · AIdeazz · <date>".
// Fail closed — no file rather than a wrong file:
//   · every character must be in the font (Liberation: Spanish accents, ñ ¿ ¡, Cyrillic, → € –). Decorative
//     emoji are dropped and counted; anything else (CJK…) stops it. ₽ → "RUB", ‑ and − → "-".
//   · a pass/fail mark the font cannot draw (✅ ❌ ✓ ✗ ☑ 👍 🔴 🟢…) stops it: erasing it would turn
//     "Implementación ❌" into an included item. The verdict must be written in words (Sí/No, Incluido/No incluido);
//     it is never substituted automatically.
//   · words in == words drawn (PDF) / words written and read back by python-docx (DOCX).
//   · at most 20 pages, measured on the PDF layout for both formats (Word paginates a DOCX itself).
//   · an existing output file is never replaced unless --overwrite is passed; files are written as .part, then renamed.
// Unlike the CV, "→" is printed as is, so the text is never re-worded.
// stdout: one JSON line {ok, file, format, pages, bytes, words, emoji_dropped, placeholders}. Bracketed
// placeholders like [precio] / [fecha] are listed so the bot can tell her what is left to fill in; the bot's reply
// must also say how many emoji were dropped whenever emoji_dropped > 0.
// DOCX: python-docx in VJH's venv (VJH_PYTHON overrides), run isolated with -I.
// HTML (19 Oct 2026): the same parsed spec as one self-contained page — inline CSS, no script, no external request
//   (a CSP meta forbids both), every text node escaped, lang + UTF-8, a section per top-level heading, the footer.
//   A browser can draw emoji and pass/fail marks, so HTML keeps them (emoji_dropped is 0) instead of refusing; it
//   refuses invisible direction / C1 control characters instead (they can reorder what a reader sees, e.g. a price).
//   The written file is read back and refused unless every tag is on the allowlist, the only links are the two
//   contact links, and the words in <main> equal the words in. Placeholders ([precio], [plazo]…) are highlighted.
//   The PDF layout still runs in memory for the 20-page cap.
const TEXT_KINDS = ['letter', 'answer', 'quote', 'proposal', 'evaluation', 'report', 'prep', 'other'];
const TEXT_LANGS = { es: 'es-PA', en: 'en-US', ru: 'ru-RU' };
const TEXT_PAGE_CAP = 20;
const TEXT_MD = {
  fence: /^\s*```/,
  rule: /^\s*([-*_])(\s*\1){2,}\s*$/,
  heading: /^\s{0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/,
  numbered: /^\s*(\d{1,3}[.)])\s+(.*)$/,
  bullet: /^\s*[-*•]\s+(.*)$/,
  quote: /^\s*>(?:\s+(.*))?$/,
  tableSep: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/,
};
const TEXT_PICTO = /[\p{Extended_Pictographic}\p{Emoji_Component}\p{Regional_Indicator}\u2600-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u;
const TEXT_MODIFIER = /[\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
/** Marks that carry a verdict (yes/no, included/excluded, pass/fail). Dropping one would change what the document says. */
const TEXT_MARK = /[\u2610-\u2612\u2705\u2713-\u2718\u274C\u274E\u26D4\u2B55\u2605\u2606\u2B50\u2795\u2796\u2B06\u2B07\u2B1B\u2B1C\u{1F44D}\u{1F44E}\u{1F534}\u{1F535}\u{1F53A}\u{1F53B}\u{1F4C8}\u{1F4C9}\u{1F5F4}-\u{1F5F8}\u{1F6AB}\u{1F7E0}-\u{1F7EB}]/u; // 18 Oct proof: stars, \u2795\u2796, \u2B06\u2B07, coloured squares, light ticks carry a verdict too
const TEXT_BREAK = /\r\n|\r|\n|\u2028|\u2029/;
const TEXT_SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;

const textInline = (s) =>
  String(s)
    .normalize('NFC')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/`/g, '')
    .replace(/[\u2011\u2212]/g, '-')
    .replace(/[\t\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u00AD\u200B\u2060\uFEFF]/g, '')
    .replace(/\u20BD/g, 'RUB')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

/**
 * Keep what the font can draw. Emoji are dropped whole (a keycap emoji keeps its digit) and counted, together with
 * their joiners / variation selectors even when the font has those. A dropped pass/fail mark is recorded in
 * stats.marks and any other missing character in stats.missing; the caller refuses both.
 */
function textGlyphs(s, has, stats) {
  const clusters = TEXT_SEGMENTER ? Array.from(TEXT_SEGMENTER.segment(s), (x) => x.segment) : Array.from(s);
  let out = '';
  for (const cl of clusters) {
    const cps = Array.from(cl);
    if (cps.every(has)) { out += cl; continue; }
    const lost = cps.some((c) => !has(c) && TEXT_PICTO.test(c) && !TEXT_MODIFIER.test(c));
    let visible = false;
    for (const c of cps) {
      if (lost && TEXT_MODIFIER.test(c)) continue;
      if (has(c)) out += c;
      else if (TEXT_PICTO.test(c) || TEXT_MODIFIER.test(c)) {
        if (!TEXT_MODIFIER.test(c)) visible = true;
        if (TEXT_MARK.test(c)) stats.marks.add(c);
      } else stats.missing.add(c);
    }
    if (visible) stats.dropped++;
  }
  return out;
}

/** Emoji that read as a digit, a letter or a word (➊ 🄋 🅲 🆓 🔟 💯): a browser draws them, docGate cannot read them. */
const TEXT_HTML_READS = /[\p{N}\u{1F100}-\u{1F1E5}\u{1F4AF}\u{1F51F}]/u;
/** The only tag-character sequences kept: England, Scotland and Wales. Tag characters elsewhere are invisible text. */
const TEXT_HTML_FLAG = /^\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}$/u;

/**
 * HTML keeps the PDF's characters plus emoji and marks — nothing else (review, 19 Oct 2026). docGate (telegram-bot.ts)
 * sees only ASCII digits and words, so 𝟓𝟎𝟎𝟎, ５００, ٣٠٠, 五千 and ①⓪⓪ — which the font cannot draw and the PDF refuses —
 * are refused here too, and so is an emoji that reads as a digit or letter (TEXT_HTML_READS), a lone regional letter,
 * and a joiner / variation selector / skin tone / tag character outside an emoji. All go to stats.missing.
 */
function textHtmlGlyphs(s, has, stats) {
  const clusters = TEXT_SEGMENTER ? Array.from(TEXT_SEGMENTER.segment(s), (x) => x.segment) : Array.from(s);
  for (const cl of clusters) {
    const cps = Array.from(cl);
    const pic = (c) => TEXT_PICTO.test(c) && !TEXT_MODIFIER.test(c) && !TEXT_HTML_READS.test(c);
    const emoji = cps.some(pic) && !(cps.length === 1 && /\p{Regional_Indicator}/u.test(cl));
    for (const c of cps) {
      const ok = TEXT_MODIFIER.test(c) ? emoji && (!/[\u{E0000}-\u{E007F}]/u.test(c) || TEXT_HTML_FLAG.test(cl)) : has(c) || (emoji && pic(c));
      if (!ok) stats.missing.add(c);
    }
  }
}

/** "a **b** c" → [{t:'a ',b:false},{t:'b',b:true},{t:' c',b:false}]; an unbalanced ** is just removed. */
const textSegs = (s) => {
  const parts = String(s).split('**');
  if (parts.length % 2 === 0) return [{ t: parts.join(''), b: false }];
  return parts.map((t, i) => ({ t, b: i % 2 === 1 })).filter((x) => x.t);
};

function textParse(raw, clean) {
  const items = [];
  let fence = false;
  for (const line of String(raw).split(TEXT_BREAK)) {
    if (TEXT_MD.fence.test(line)) { fence = !fence; continue; }
    if (TEXT_MD.tableSep.test(line) && line.includes('|')) throw new Error('text: tables are not supported — write numbered lines instead (1. Concepto — [precio])');
    if (!line.trim()) {
      if (items.length && items[items.length - 1].type !== 'gap') items.push({ type: 'gap' });
      continue;
    }
    let m;
    if (fence) items.push({ type: 'p', segs: [{ t: clean(line.trim()), b: false }] });
    else if (TEXT_MD.rule.test(line)) items.push({ type: 'hr' });
    else if ((m = line.match(TEXT_MD.heading))) items.push({ type: `h${Math.min(m[1].length, 3)}`, segs: [{ t: clean(m[2]).replace(/\*\*/g, ''), b: true }] });
    else if ((m = line.match(TEXT_MD.numbered))) items.push({ type: 'ol', marker: m[1], segs: textSegs(clean(m[2])) });
    else if ((m = line.match(TEXT_MD.bullet))) items.push({ type: 'li', segs: textSegs(clean(m[1])) });
    else if ((m = line.match(TEXT_MD.quote))) items.push({ type: 'quote', segs: textSegs(clean(m[1] || '')) });
    else items.push({ type: 'p', segs: textSegs(clean(line.trim())) });
  }
  const words = (it) => (it.segs || []).map((x) => x.t).join('').trim();
  const kept = items.filter((it) => ['gap', 'hr', 'ol'].includes(it.type) || words(it));
  while (kept.length && kept[0].type === 'gap') kept.shift();
  while (kept.length && kept[kept.length - 1].type === 'gap') kept.pop();
  return kept;
}

const TEXT_DOCX_PY = `import sys, os, json
def out_json(o, code=0):
    sys.stdout.write(json.dumps(o))
    sys.stdout.flush()
    sys.exit(code)
d = json.loads(sys.stdin.buffer.read().decode('utf-8'))
part = d['out'] + '.part'
try:
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
except Exception as e:
    out_json({'ok': False, 'error': 'python-docx is not available here: %s' % e}, 5)
try:
    NAVY = RGBColor(0x1E, 0x2F, 0x52)
    MUTED = RGBColor(0x5A, 0x62, 0x70)
    doc = Document()
    normal = doc.styles['Normal']
    normal.font.name = 'Arial'
    normal.font.size = Pt(10.5)
    rpr = normal.element.get_or_add_rPr()
    lang = rpr.find(qn('w:lang'))
    if lang is None:
        lang = OxmlElement('w:lang')
        rpr.append(lang)
    lang.set(qn('w:val'), d['lang'])
    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(0.8)
        s.top_margin = s.bottom_margin = Inches(0.7)
    sec = doc.sections[0]
    hp = sec.header.paragraphs[0]
    r = hp.add_run(d['header_name'])
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = NAVY
    r = hp.add_run('    ' + d['header_line'])
    r.font.size = Pt(8)
    r.font.color.rgb = MUTED
    if d.get('footer'):
        r = sec.footer.paragraphs[0].add_run(d['footer'])
        r.font.size = Pt(8)
        r.font.color.rgb = MUTED
    def para(style=None):
        if style:
            try:
                return doc.add_paragraph(style=style)
            except KeyError:
                pass
        return doc.add_paragraph()
    def runs(p, segs, size=None, color=None, italic=False):
        for sg in segs:
            r = p.add_run(sg['t'])
            if sg.get('b'):
                r.bold = True
            if italic:
                r.italic = True
            if size:
                r.font.size = Pt(size)
            if color is not None:
                r.font.color.rgb = color
    if d.get('title'):
        runs(para('Title'), [{'t': d['title']}])
    if d.get('subtitle'):
        runs(para('Subtitle'), [{'t': d['subtitle']}])
    for m in d.get('meta') or []:
        runs(para(), m, size=9, color=MUTED)
    cur = None
    for it in d['items']:
        t = it['type']
        if t != 'p':
            cur = None
        if t == 'gap':
            continue
        if t == 'hr':
            ppr = para()._p.get_or_add_pPr()
            bdr = OxmlElement('w:pBdr')
            b = OxmlElement('w:bottom')
            for k, v in (('w:val', 'single'), ('w:sz', '4'), ('w:space', '1'), ('w:color', 'BFC7D1')):
                b.set(qn(k), v)
            bdr.append(b)
            ppr.append(bdr)
        elif t == 'p':
            if cur is None:
                cur = para()
            else:
                cur.add_run().add_break()
            runs(cur, it['segs'])
        elif t in ('h1', 'h2', 'h3'):
            runs(para('Heading ' + t[1]), it['segs'])
        elif t == 'li':
            runs(para('List Bullet'), it['segs'])
        elif t == 'ol':
            p = para()
            p.paragraph_format.left_indent = Inches(0.3)
            p.paragraph_format.first_line_indent = Inches(-0.3)
            p.add_run(it['marker'] + ' ')
            runs(p, it['segs'])
        elif t == 'quote':
            runs(para('Quote'), it['segs'], italic=True)
    cp = doc.core_properties
    cp.title = d['meta_title']
    cp.author = 'Elena Revicheva'
    cp.subject = d['kind']
    cp.language = d['lang']
    doc.save(part)
    got = ' '.join(p.text for p in Document(part).paragraphs).split()
    want = d['tokens']
    if got != want:
        i = 0
        while i < min(len(got), len(want)) and got[i] == want[i]:
            i += 1
        os.remove(part)
        out_json({'ok': False, 'error': 'words in (%d) != words written (%d), first difference at word %d' % (len(want), len(got), i)}, 3)
    os.replace(part, d['out'])
    out_json({'ok': True, 'words': len(got), 'bytes': os.path.getsize(d['out'])})
except SystemExit:
    raise
except Exception as e:
    if os.path.exists(part):
        os.remove(part)
    out_json({'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}, 4)
`;

function textSameWords(want, got, what) {
  if (want.length === got.length && want.every((w, i) => w === got[i])) return;
  let i = 0;
  while (i < Math.min(want.length, got.length) && want[i] === got[i]) i++;
  throw new Error(`text: words in (${want.length}) != ${what} (${got.length}); first difference at word ${i}: ${JSON.stringify(want[i])} vs ${JSON.stringify(got[i])}`);
}

/** "[precio]" / "[fecha]" are placeholders; "[ ]" / "[x]" (checkboxes) and "[1]" / "[2,3]" (citations) are not. */
const TEXT_PLACEHOLDER = /\[[^[\]\n]{1,300}\]/g;
const textIsPlaceholder = (p) => !/^\[\s*[xX]?\s*\]$/.test(p) && !/^\[\d+([,–-]\d+)*\]$/.test(p);

// ── HTML (19 Oct 2026) ── Elena: "make a promotion or presentation like you do here in Claude code, creating htmls".
const TEXT_HTML_LINKS = ['mailto:aipa@aideazz.xyz', 'https://aideazz.xyz/portfolio'];
const TEXT_HTML_TAGS = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'header', 'div', 'a', 'main', 'section',
  'h1', 'h2', 'h3', 'h4', 'p', 'br', 'ul', 'ol', 'li', 'span', 'strong', 'mark', 'blockquote', 'hr', 'footer']);
const TEXT_HTML_ATTRS = new Set(['lang', 'charset', 'name', 'content', 'http-equiv', 'class', 'href', 'rel']);
/** Direction overrides / isolates, C1 controls and lone surrogates: invisible, and able to reorder what a reader sees. */
const TEXT_HTML_HIDDEN = /[\u0080-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const TEXT_HTML_CSS = `:root{--navy:#1e2f52;--ink:#20242c;--muted:#5a6270;--rule:#bfc7d1;--line:#e1e6ee;--soft:#eef1f6;--bg:#f3f5f9;--ph:#fff1bf;color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Noto Sans","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
.wrap{max-width:860px;margin:0 auto}
.band{background:var(--navy);color:#fff;padding:22px 0}
.band .wrap{padding:0 16px}
.band .name{font-weight:700;font-size:18px;letter-spacing:.14em}
.band .contact{margin-top:4px;font-size:13px;color:#d9e3f0}
.band a{color:#d9e3f0;text-decoration:none;border-bottom:1px solid rgba(217,227,240,.45)}
main{padding:28px 16px 8px}
.titleblock{margin:0 0 22px;padding-bottom:18px;border-bottom:1px solid var(--rule)}
h1{margin:0;color:var(--navy);font-size:clamp(26px,4.6vw,36px);line-height:1.2;letter-spacing:-.01em}
.subtitle{margin:8px 0 0;color:var(--muted);font-size:18px;font-style:italic}
.meta{margin:6px 0 0;color:var(--muted);font-size:14px}
section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px 26px 10px;margin:0 0 18px;box-shadow:0 1px 3px rgba(30,47,82,.07)}
h2{margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--soft);color:var(--navy);font-size:22px;line-height:1.3}
h3{margin:18px 0 8px;color:var(--navy);font-size:18px;line-height:1.35}
h4{margin:16px 0 6px;font-size:16px}
section h2:first-child,section h3:first-child,section h4:first-child{margin-top:0}
p{margin:0 0 12px}
ul,ol{margin:0 0 12px;padding:0;list-style:none}
li{position:relative;margin:0 0 8px}
ul li{padding-left:22px}
ul li::before{content:"";position:absolute;left:6px;top:.66em;width:6px;height:6px;border-radius:50%;background:var(--navy)}
ol li{padding-left:2.4em}
.mk{position:absolute;left:0;font-weight:700;color:var(--navy)}
blockquote{margin:0 0 12px;padding:2px 0 2px 16px;border-left:3px solid var(--rule);color:var(--muted);font-style:italic}
blockquote p{margin:0 0 6px}
hr{border:0;border-top:1px solid var(--rule);margin:18px 0}
section>hr:last-child{display:none}
mark.ph{background:var(--ph);color:inherit;padding:0 3px;border-radius:3px}
footer{max-width:860px;margin:0 auto;padding:6px 16px 32px;color:var(--muted);font-size:12px;text-align:center}
@media (max-width:600px){.band{padding:18px 0}section{padding:18px 16px 8px;border-radius:10px}}
@media print{body{background:#fff}.band{-webkit-print-color-adjust:exact;print-color-adjust:exact}section{box-shadow:none;break-inside:avoid-page}h2,h3,h4{break-after:avoid}}`;

const textEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const textUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** One escaped text run; placeholders are wrapped in <mark class="ph"> so the blanks to fill in stand out. */
const textHtmlRun = (t) => {
  let html = '';
  let last = 0;
  for (const m of String(t).matchAll(TEXT_PLACEHOLDER)) {
    if (!textIsPlaceholder(m[0])) continue;
    html += `${textEsc(t.slice(last, m.index))}<mark class="ph">${textEsc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return html + textEsc(String(t).slice(last));
};

/**
 * The parsed spec as one page. Text reaches the file ONLY through textEsc / textHtmlRun, so model-written markup is
 * shown as text. A new <section> opens at each top-level heading (the smallest level used twice or more, else the
 * smallest used); that level becomes <h2> (deeper ones <h3>, <h4>), so the title stays the only <h1>. The numbered marker is
 * written as text ("2)" stays "2)"), never left to the browser's own numbering.
 */
function textHtml({ lang, kind, title, showTitle, subtitle, meta, items, footer }) {
  const run = (segs) => (segs || []).map((sg) => (sg.b ? `<strong>${textHtmlRun(sg.t)}</strong>` : textHtmlRun(sg.t))).join('');
  const lv = items.filter((it) => /^h[1-3]$/.test(it.type)).map((it) => Number(it.type[1]));
  const top = [1, 2, 3].find((l) => lv.filter((x) => x === l).length > 1) || (lv.length ? Math.min(...lv) : 0);
  const out = [];
  let open = null; // { tag, lines } — the paragraph, list or quote being filled
  let inSection = false;
  const close = () => {
    if (!open) return;
    if (open.tag === 'p') out.push(`<p>${open.lines.join('<br>\n')}</p>`);
    else out.push(`<${open.tag}>\n${open.lines.join('\n')}\n</${open.tag}>`);
    open = null;
  };
  const block = (tag) => {
    if (open && open.tag === tag) return open;
    close();
    open = { tag, lines: [] };
    return open;
  };
  for (const it of items) {
    const t = it.type;
    if ((t[0] === 'h' && Number(t[1]) === top) || (!inSection && t !== 'gap')) {
      close();
      if (inSection) out.push('</section>');
      out.push('<section>');
      inSection = true;
    }
    if (t === 'gap') close();
    else if (t === 'hr') { close(); out.push('<hr>'); }
    else if (t[0] === 'h') {
      close();
      const n = 2 + Math.max(0, Number(t[1]) - top); // the section heading is <h2>, one level below <h3>, then <h4>
      out.push(`<h${n}>${it.segs.map((sg) => textHtmlRun(sg.t)).join('')}</h${n}>`);
    }
    else if (t === 'p') block('p').lines.push(run(it.segs));
    else if (t === 'li') block('ul').lines.push(`<li>${run(it.segs)}</li>`);
    else if (t === 'ol') block('ol').lines.push(`<li><span class="mk">${textEsc(it.marker)}</span> ${run(it.segs)}</li>`);
    else if (t === 'quote') block('blockquote').lines.push(`<p>${run(it.segs)}</p>`);
  }
  close();
  if (inSection) out.push('</section>');
  const head = [
    showTitle ? `<h1>${textHtmlRun(title)}</h1>` : '',
    subtitle ? `<p class="subtitle">${textHtmlRun(subtitle)}</p>` : '',
    ...meta.map((sg) => `<p class="meta">${run(sg)}</p>`),
  ].filter(Boolean);
  return `<!doctype html>
<html lang="${textEsc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="author" content="Elena Revicheva">
<meta name="generator" content="scripts/build-lane-cv.cjs --text">
<title>${textEsc(title)}</title>
<style>
${TEXT_HTML_CSS}
</style>
</head>
<body class="kind-${textEsc(kind)}">
<header class="band"><div class="wrap"><div class="name">ELENA REVICHEVA</div><div class="contact">AIdeazz · <a href="${TEXT_HTML_LINKS[0]}">aipa@aideazz.xyz</a> · +507 616 66 716 · <a href="${TEXT_HTML_LINKS[1]}" rel="noopener">aideazz.xyz/portfolio</a></div></div></header>
<main class="wrap">
${head.length ? `<div class="titleblock">\n${head.join('\n')}\n</div>\n` : ''}${out.join('\n')}
</main>
${footer ? `<footer>${textEsc(footer)}</footer>\n` : ''}</body>
</html>
`;
}

/**
 * Read back what was written. Refuses unless: it is valid UTF-8; every "<" opens an allowlisted tag with allowlisted
 * attributes; the only links are the two contact links; <title> and <footer> equal what was asked; and the words in
 * <main> (inline tags removed, block tags as spaces, entities decoded) equal the words in.
 */
function textHtmlCheck(bytes, { tokens, title, footer }) {
  let html;
  try { html = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { throw new Error('text: the HTML is not valid UTF-8'); }
  if (!html.startsWith('<!doctype html>\n')) throw new Error('text: the HTML does not start with its doctype');
  const rest = html.slice('<!doctype html>\n'.length);
  let tags = 0;
  for (const m of rest.matchAll(/<\/?([a-z][a-z0-9]*)((?:\s+[a-z-]+(?:="[^"<>]*")?)*)\s*>/g)) {
    if (!TEXT_HTML_TAGS.has(m[1])) throw new Error(`text: the HTML has a <${m[1]}> tag — refusing`);
    for (const a of m[2].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) {
      if (!TEXT_HTML_ATTRS.has(a[1])) throw new Error(`text: the HTML has a ${a[1]}= attribute — refusing`);
      if (a[1] === 'href' && !TEXT_HTML_LINKS.includes(a[2])) throw new Error('text: the HTML links somewhere other than the contact links — refusing');
    }
    tags++;
  }
  if ((rest.match(/</g) || []).length !== tags || /<script/i.test(html)) throw new Error('text: the HTML has markup outside the allowed tags — refusing');
  const one = (re) => { const m = html.match(re); return m ? textUnesc(m[1]) : null; };
  if (one(/<title>([^<]*)<\/title>/) !== title) throw new Error('text: the HTML <title> differs from the title');
  if (footer && one(/<footer>([^<]*)<\/footer>/) !== footer) throw new Error('text: the HTML footer differs from the footer');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const words = textUnesc(main.replace(/<\/?(?:strong|mark|span)\b[^>]*>/g, '').replace(/<[^>]*>/g, ' ')).split(/\s+/).filter(Boolean);
  textSameWords(tokens, words, 'words in the HTML');
  return words.length;
}

async function buildText(spec, { format, out }) {
  const os = require('os');
  const kitFonts = path.join(os.homedir(), 'cv-build-fonts');
  const fontDir = process.env.CV_FONT_DIR || (fs.existsSync(kitFonts) ? kitFonts : FONT_DIR);
  const kind = spec.kind || 'other';
  if (!TEXT_KINDS.includes(kind)) throw new Error(`text: kind must be one of ${TEXT_KINDS.join('|')}, got ${JSON.stringify(kind)}`);
  const lang2 = String(spec.lang || '').slice(0, 2).toLowerCase();
  if (!TEXT_LANGS[lang2]) throw new Error('text: lang must be es, en or ru');
  const langTag = /^[a-z]{2}-[A-Z]{2}$/.test(String(spec.lang)) ? spec.lang : TEXT_LANGS[lang2];
  if (!String(spec.title || '').trim()) throw new Error('text: title is required');
  if (!String(spec.text || '').trim()) throw new Error('text: no text to render');

  const bufs = {
    regular: fs.readFileSync(path.join(fontDir, 'NotoSans-Regular.ttf')),
    bold: fs.readFileSync(path.join(fontDir, 'NotoSans-Bold.ttf')),
    italic: fs.readFileSync(path.join(fontDir, 'NotoSans-Italic.ttf')),
  };
  const faces = Object.values(bufs).map((b) => fontkit.create(b));
  const has = (c) => faces.every((f) => f.hasGlyphForCodePoint(c.codePointAt(0)));
  const stats = { dropped: 0, missing: new Set(), marks: new Set(), hidden: new Set() };
  // HTML: a browser draws emoji and marks, so none is dropped; invisible controls and anything else the font cannot draw
  // are collected here and refused below (textHtmlGlyphs). PDF / DOCX: only what the font can draw (textGlyphs).
  const clean = format === 'html'
    ? (s) => { const t = textInline(s); for (const c of t.match(TEXT_HTML_HIDDEN) || []) stats.hidden.add(c); textHtmlGlyphs(t, has, stats); return t; }
    : (s) => textGlyphs(textInline(s), has, stats);
  // Header strings are one line: a line break becomes a space (textInline would otherwise keep "\n" as a missing glyph).
  const flat = (s) => clean(String(s).split(TEXT_BREAK).join(' ')).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  const title = flat(spec.title);
  const subtitle = spec.subtitle ? flat(spec.subtitle) : '';
  const meta = (Array.isArray(spec.meta) ? spec.meta : spec.meta ? [spec.meta] : [])
    .flatMap((m) => String(m).split(TEXT_BREAK)) // "Cliente: …\nFecha: …" is two meta lines
    .map((m) => textSegs(clean(m).replace(/\s+/g, ' ').trim()))
    .filter((sg) => sg.length && sg.map((x) => x.t).join('').trim());
  const items = textParse(spec.text, clean);
  const date = spec.date ? flat(spec.date) : new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // Panama, UTC-5, no DST
  const footerText = spec.footer === false ? '' : typeof spec.footer === 'string' ? flat(spec.footer) : kind === 'letter' ? '' : `Elena Revicheva · AIdeazz · ${date}`;
  // HTML only (empty for PDF / DOCX); first, so an invisible control is named as one, not as a missing glyph.
  if (stats.hidden.size) {
    const list = [...stats.hidden].map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    throw new Error(`text: invisible control characters (${list.join(', ')}) could change what a reader sees — refusing; remove them`);
  }
  if (stats.marks.size) {
    throw new Error(`text: pass/fail marks the font cannot draw (${[...stats.marks].join(' ')}) — refusing rather than erasing a verdict;`
      + ' write it in words (Sí/No, Incluido/No incluido, Yes/No, Included/Not included)');
  }
  if (stats.missing.size) {
    const list = [...stats.missing].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(c)}`);
    throw new Error(`text: the font has no glyph for ${list.join(', ')} — refusing rather than printing blanks`);
  }

  const showTitle = kind !== 'letter';
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const segText = (segs) => (segs || []).map((x) => x.t).join('');
  const tokensIn = [
    ...(showTitle ? words(title) : []),
    ...words(subtitle),
    ...meta.flatMap((sg) => words(segText(sg))),
    ...items.flatMap((it) => (it.marker ? [it.marker] : []).concat(words(segText(it.segs)))),
  ];
  if (!tokensIn.length) throw new Error('text: nothing printable is left after cleaning');
  // Everything that ends up in the file, footer included. A letter's title is not drawn, but it IS the PDF /Title and
  // the DOCX core title (a browser's PDF viewer shows it in the tab), so its placeholders are listed too.
  // "[ ]" / "[x]" (checkboxes) and "[1]" (citations) are not placeholders.
  const allText = [title, subtitle, ...meta.map(segText), ...items.map((it) => segText(it.segs)), footerText].join('\n');
  const placeholders = [...new Set(allText.match(TEXT_PLACEHOLDER) || [])].filter(textIsPlaceholder);
  const result = { kind, lang: langTag, words: tokensIn.length, emoji_dropped: stats.dropped, placeholders };

  // The PDF layout always runs, in memory: it is also the page cap and the word check for a DOCX or an HTML page.
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(bufs.regular, { subset: true });
  const bold = await pdf.embedFont(bufs.bold, { subset: true });
  const italic = await pdf.embedFont(bufs.italic, { subset: true });
  const DOT = has('·') ? '·' : '-';
  const BULLET = has('•') ? '•' : '-';
  const pages = [];
  const drawn = [];
  let page;
  let y;
  const put = (t, x, yy, size, f, color) => page.drawText(t, { x, y: yy, size, font: f, color: color || INK });
  const fit = (t, f, size, maxW) => {
    const cs = Array.from(t);
    while (cs.length && f.widthOfTextAtSize(cs.join(''), size) > maxW) cs.pop();
    return cs.join('');
  };
  const link = (x, y0, w, size, uri) => {
    const annot = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, y0 - 2, x + w, y0 + size + 2], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) },
    }));
    page.node.addAnnot(annot);
  };
  const band = (first) => {
    const h = first ? 62 : 30;
    page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: NAVY });
    if (!first) {
      // A letter never shows its title (page 1 opens with the salutation), so its running header is the name alone.
      put(showTitle ? fit(`ELENA REVICHEVA  ${DOT}  ${title}`, bold, 8.5, CONTENT_W) : 'ELENA REVICHEVA', MARGIN_X, PAGE_H - 19, 8.5, bold, WHITE);
      return PAGE_H - h - 26;
    }
    put('ELENA REVICHEVA', MARGIN_X, PAGE_H - 30, 16, bold, WHITE);
    const bits = [
      { t: 'AIdeazz' },
      { t: 'aipa@aideazz.xyz', u: 'mailto:aipa@aideazz.xyz' },
      { t: '+507 616 66 716' },
      { t: 'aideazz.xyz/portfolio', u: 'https://aideazz.xyz/portfolio' },
    ];
    let cx = MARGIN_X;
    const cy = PAGE_H - 48;
    bits.forEach((b, i) => {
      if (i) {
        put(`  ${DOT}  `, cx, cy, 8, regular, rgb(0.65, 0.72, 0.8));
        cx += regular.widthOfTextAtSize(`  ${DOT}  `, 8);
      }
      put(b.t, cx, cy, 8, regular, rgb(0.85, 0.9, 0.96));
      const w = regular.widthOfTextAtSize(b.t, 8);
      if (b.u) link(cx, cy, w, 8, b.u);
      cx += w;
    });
    return PAGE_H - h - 32;
  };
  const addPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = band(pages.length === 1);
  };
  const ensure = (need) => {
    if (y - need < MARGIN_BOTTOM + 16) addPage();
  };
  /** Whitespace splits words; a word may span a bold/regular boundary ("**Total:**$100" stays one word). */
  const toWords = (segs, base) => {
    const out = [];
    let cur = null;
    for (const sg of segs) {
      const f = sg.b ? bold : base;
      for (const part of sg.t.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { cur = null; continue; }
        if (!cur) { cur = { pieces: [] }; out.push(cur); }
        cur.pieces.push({ t: part, f });
      }
    }
    return out;
  };
  const wordW = (wd, size) => wd.pieces.reduce((a, p) => a + p.f.widthOfTextAtSize(p.t, size), 0);
  /** A word wider than the line (a long URL) is cut into line-wide chunks; the chunks still count as one word. */
  const breakLong = (wd, size, maxW) => {
    if (wordW(wd, size) <= maxW) return [wd];
    const chunks = [];
    let cur = [];
    let w = 0;
    for (const p of wd.pieces) {
      for (const c of Array.from(p.t)) {
        const cw = p.f.widthOfTextAtSize(c, size);
        if (cur.length && w + cw > maxW) { chunks.push(cur); cur = []; w = 0; }
        cur.push({ c, f: p.f });
        w += cw;
      }
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((cs, i) => ({
      cont: i > 0,
      pieces: cs.reduce((ps, ch) => {
        const l = ps[ps.length - 1];
        if (l && l.f === ch.f) l.t += ch.c;
        else ps.push({ t: ch.c, f: ch.f });
        return ps;
      }, []),
    }));
  };
  const rich = (segs, o = {}) => {
    const { x0 = MARGIN_X, maxW = CONTENT_W, size = 10, leading = 14, base = regular, color = INK, first = null, bar = false } = o;
    const sp = regular.widthOfTextAtSize(' ', size);
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const wd of toWords(segs, base).flatMap((w) => breakLong(w, size, maxW))) {
      const ww = wordW(wd, size);
      if (cur.length && (wd.cont || curW + sp + ww > maxW)) { lines.push(cur); cur = []; curW = 0; }
      curW += (cur.length ? sp : 0) + ww;
      cur.push(wd);
    }
    if (cur.length) lines.push(cur);
    if (!lines.length && first) { ensure(leading + 2); first(); y -= leading; return; }
    lines.forEach((ln, li) => {
      ensure(leading + 2);
      if (li === 0 && first) first();
      if (bar) page.drawRectangle({ x: MARGIN_X + 3, y: y - 3, width: 1.6, height: leading, color: RULE });
      // Consecutive same-font words are drawn as one string, so text extraction (ATS, PyPDF2) reads words with spaces.
      const groups = [];
      ln.forEach((wd, wi) => {
        wd.pieces.forEach((p, pi) => {
          const sep = wi && pi === 0 ? ' ' : '';
          const g = groups[groups.length - 1];
          if (g && g.f === p.f) g.t += sep + p.t;
          else groups.push({ t: sep + p.t, f: p.f });
        });
      });
      let x = x0;
      for (const g of groups) {
        put(g.t, x, y, size, g.f, color);
        x += g.f.widthOfTextAtSize(g.t, size);
      }
      for (const wd of ln) {
        const t = wd.pieces.map((p) => p.t).join('');
        if (wd.cont && drawn.length) drawn[drawn.length - 1] += t;
        else drawn.push(t);
      }
      y -= leading;
    });
  };

  addPage();
  if (showTitle) { rich([{ t: title, b: true }], { size: 16, leading: 20, color: NAVY }); y -= 2; }
  if (subtitle) rich([{ t: subtitle, b: false }], { size: 11, leading: 15, base: italic, color: MUTED });
  for (const sg of meta) rich(sg, { size: 9, leading: 12.5, color: MUTED });
  if (showTitle || subtitle || meta.length) {
    ensure(20);
    y -= 2;
    page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 0.8, color: RULE });
    y -= 18;
  }
  let prev = null;
  for (const it of items) {
    if (it.type === 'gap') { y -= 6; prev = 'gap'; continue; }
    if (it.type === 'hr') {
      ensure(16);
      page.drawRectangle({ x: MARGIN_X, y: y + 2, width: CONTENT_W, height: 0.6, color: RULE });
      y -= 12;
      prev = 'hr';
      continue;
    }
    if (it.type[0] === 'h') {
      const lvl = Number(it.type[1]);
      const size = [0, 14, 12, 10.5][lvl];
      if (prev && prev !== 'gap') y -= 6;
      ensure(size + 4 + 16); // keep a heading with the line after it
      rich(it.segs, { size, leading: size + 5, color: lvl < 3 ? NAVY : INK });
      y -= 1;
    } else if (it.type === 'li' || it.type === 'ol') {
      const size = 10;
      const tx = MARGIN_X + (it.type === 'ol' ? Math.max(16, regular.widthOfTextAtSize(it.marker, size) + 7) : 16);
      rich(it.segs, {
        x0: tx, maxW: CONTENT_W - (tx - MARGIN_X), size, leading: 14,
        first: () => {
          if (it.type === 'li') put(BULLET, MARGIN_X + 4, y, size, regular);
          else { put(it.marker, MARGIN_X + 2, y, size, regular); drawn.push(it.marker); }
        },
      });
      y -= 2;
    } else if (it.type === 'quote') {
      rich(it.segs, { x0: MARGIN_X + 14, maxW: CONTENT_W - 14, size: 10, leading: 14, base: italic, color: MUTED, bar: true });
    } else {
      rich(it.segs, { size: 10, leading: 14 });
    }
    prev = it.type;
  }

  const n = pages.length;
  if (n > TEXT_PAGE_CAP) throw new Error(`text: ${n} pages — over the ${TEXT_PAGE_CAP}-page cap`);
  const footLine = footerText ? fit(footerText, regular, 7, CONTENT_W - 60) : '';
  if (format === 'pdf' && footLine !== footerText) throw new Error('text: footer is longer than one footer line — shorten it rather than cut it');
  pages.forEach((p, i) => {
    if (footLine) p.drawText(footLine, { x: MARGIN_X, y: 22, size: 7, font: regular, color: MUTED });
    if (n > 1 || footerText) {
      const label = `${i + 1} / ${n}`;
      p.drawText(label, { x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(label, 7), y: 22, size: 7, font: regular, color: MUTED });
    }
  });
  textSameWords(tokensIn, drawn, 'words drawn');

  if (format === 'html') {
    const bytes = Buffer.from(textHtml({ lang: langTag, kind, title, showTitle, subtitle, meta, items, footer: footerText }), 'utf8');
    const part = `${out}.part`;
    try {
      fs.writeFileSync(part, bytes);
      textHtmlCheck(fs.readFileSync(part), { tokens: tokensIn, title, footer: footerText });
      fs.renameSync(part, out);
    } catch (e) {
      try { fs.unlinkSync(part); } catch (_) { /* already gone */ }
      throw e;
    }
    return { ...result, pages: null, bytes: bytes.length };
  }

  if (format === 'docx') {
    const vjhPy = path.join(os.homedir(), 'VibeJobHunterAIPA_AIMCF', 'venv', 'bin', 'python');
    const py = process.env.VJH_PYTHON || (fs.existsSync(vjhPy) ? vjhPy : 'python3');
    const payload = {
      out, lang: langTag, kind, meta_title: title, title: showTitle ? title : '', subtitle, meta, items,
      footer: footerText, header_name: 'Elena Revicheva',
      header_line: 'AIdeazz · aipa@aideazz.xyz · +507 616 66 716 · aideazz.xyz/portfolio', tokens: tokensIn,
    };
    const r = require('child_process').spawnSync(py, ['-I', '-c', TEXT_DOCX_PY], { input: JSON.stringify(payload), timeout: 60000, maxBuffer: 4 << 20 });
    if (r.error) throw new Error(`text: could not run python-docx (${py}): ${r.error.message}`);
    let res = null;
    try { res = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) { /* reported below */ }
    if (r.status !== 0 || !res || !res.ok) {
      throw new Error(`text: docx ${res && res.error ? res.error : `python exit ${r.status}: ${String(r.stderr || '').trim().split('\n').pop()}`}`);
    }
    return { ...result, pages: null, bytes: res.bytes };
  }

  pdf.setTitle(title);
  pdf.setAuthor('Elena Revicheva');
  pdf.setSubject(kind);
  pdf.setCreator('scripts/build-lane-cv.cjs --text');
  pdf.setLanguage(langTag);
  const bytes = await pdf.save();
  const part = `${out}.part`;
  try {
    fs.writeFileSync(part, bytes);
    fs.renameSync(part, out);
  } catch (e) {
    try { fs.unlinkSync(part); } catch (_) { /* already gone */ }
    throw e;
  }
  return { ...result, pages: n, bytes: bytes.length };
}

(async () => {
  const textArg = (process.argv.find((a) => a.startsWith('--text=')) || '').slice('--text='.length);
  if (TEXT_MODE) {
    if (!textArg) throw new Error('text: --text= needs a spec path or - (use --text=<path>, not --text <path>)');
    const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
    const spec = JSON.parse(fs.readFileSync(textArg === '-' ? 0 : textArg, 'utf8'));
    const specDir = textArg === '-' ? process.cwd() : path.dirname(path.resolve(textArg));
    let out = arg('out') ? path.resolve(arg('out')) : spec.out ? path.resolve(specDir, String(spec.out)) : '';
    if (!out) throw new Error('text: no output path (spec.out or --out=)');
    const format = (arg('format') || (/\.(docx|html)$/i.exec(out) || [0, 'pdf'])[1]).toLowerCase();
    if (!['pdf', 'docx', 'html'].includes(format)) throw new Error('text: --format must be pdf, docx or html');
    out = `${out.replace(/\.(pdf|docx|html)$/i, '')}.${format}`;
    if (!fs.existsSync(path.dirname(out))) throw new Error(`text: output folder does not exist: ${path.dirname(out)}`);
    // Never wipe: a bot-written spec could name the outreach resume, the NDA or a kit CV.
    if (fs.existsSync(out) && !process.argv.includes('--overwrite')) throw new Error(`text: ${out} already exists — refusing to replace it (pass --overwrite to replace)`);
    const r = await buildText(spec, { format, out });
    console.log(JSON.stringify({ ok: true, file: out, format, ...r }));
    return;
  }
  const jobArg = (process.argv.find((a) => a.startsWith('--job=')) || '').split('=')[1];
  if (jobArg) {
    const job = { ...JSON.parse(fs.readFileSync(jobArg, 'utf8')), _path: path.resolve(jobArg) };
    // A posting-shaped CV must fit 2 pages: drop the lowest-ranked line of the longest section and render
    // again (cv-compose lists each section's lines best first). Never below one line per section.
    for (let trimmed = 0; ; trimmed++) {
      try {
        const r = await buildLane(job.base_lane, job);
        console.log(`  job ${job.cv}  ${r.pages} page(s)  ${r.bytes} bytes  (base lane ${job.base_lane})`
          + (job.sections ? `  sections ${job.sections.length}  trimmed ${trimmed}` : ''));
        return;
      } catch (e) {
        if (!job.sections || !/a CV is at most 2/.test(e.message)) throw e;
        // Below 7 posting lines it is no longer the shaped CV: give up, and the kit builds the job-tailor CV instead.
        const total = job.sections.reduce((n, s) => n + s.bullets.length, 0);
        const longest = job.sections.reduce((a, b) => (b.bullets.length > a.bullets.length ? b : a));
        if (total <= 7 || longest.bullets.length <= 1) throw e;
        longest.bullets.pop();
      }
    }
  }
  const one = (process.argv.find((a) => a.startsWith('--lane=')) || '').split('=')[1];
  const lanes = one ? [one] : Object.keys(LANES_JSON.lanes);
  for (const l of lanes) {
    const r = await buildLane(l);
    console.log(`  ${r.lane.padEnd(13)} ${r.pages} page(s)  ${r.bytes} bytes  ${r.file}`);
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
