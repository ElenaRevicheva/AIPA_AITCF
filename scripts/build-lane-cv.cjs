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
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, PDFString } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = path.join(__dirname, '..');
const CV_DIR = path.join(ROOT, 'docs', 'applications', 'cv-by-lane');
const FONT_DIR = process.env.CV_FONT_DIR || '/usr/share/fonts/truetype/noto';
const LANES_JSON = JSON.parse(fs.readFileSync(path.join(CV_DIR, 'lanes.json'), 'utf8'));

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
    body: 'Live scoring for how discoverable a site is to ChatGPT, Perplexity and Claude, not only Google. Same GEO/AEO engine that scores my own hub 100/100. Production floor from Oracle logs, rounded down: 420+ audits, 210+ sites, median 85. Each check returns the fix and why it matters (34 why / 4 fix on a live stripe.com run).',
  },
  loop: {
    title: 'Approved-send growth loop — HubSpot + Resend',
    // 29 Sep 2026: counts from the live HubSpot API that day (2,870 deals · 1,371 contacts · 2,127
    // companies), rounded down like the API block. Audit sentence: docs/interview/
    // MICRO1_AI_WORKFLOW_SPECIALIST_PREP.md + the 16 Jul log-verified audit.
    body: 'The acquisition loop I run in production: research, qualify, draft, one human tap, send, then delivery and open written back to the CRM. 2,800+ deals, 1,300+ contacts, 2,100+ companies attributed by the agents. Send is fail-closed: if a PDF or signed .docx fails to load, the email is refused so it cannot claim an attachment it did not carry. I audit the CRM from the receiving end, not the sender\'s log: that found a trial-signup → HubSpot integration silently broken since launch — 28 real users never recorded; root-caused, fixed, backfilled all 28.',
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
  { label: 'Atlas', url: 'https://webhook.aideazz.xyz/whitespace/atlas.html', show: 'atlas.html' },
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

(async () => {
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
