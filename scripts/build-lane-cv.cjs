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
    body: 'Live scoring for how discoverable a site is to ChatGPT, Perplexity and Claude, not only Google. Same GEO/AEO engine that scores my own hub 100/100. Production floor from Oracle logs, rounded down: 420+ audits, 14,000+ signals, 210+ sites, median 85. Each check returns the fix and why it matters (34 why / 4 fix on a live stripe.com run).',
  },
  loop: {
    title: 'Approved-send growth loop — HubSpot + Resend',
    body: 'The acquisition loop I run in production: research, qualify, draft, one human tap, send, then delivery and open written back to the CRM. 1,900+ deals, 989 contacts, 1,411 companies attributed by the agents. Send is fail-closed: if a PDF or signed .docx fails to load, the email is refused so it cannot claim an attachment it did not carry.',
  },
  espaluz: {
    title: 'EspaLuz — paying WhatsApp / Telegram tutor',
    url: 'https://wa.me/50766623757',
    show: 'wa.me/50766623757',
    body: 'Bilingual relocation and language tutor on WhatsApp and Telegram. Persistent per-student memory (RAG + pgvector). PayPal subscriptions. Early users in 19 countries. I am the architect and the on-call.',
  },
  chain: {
    title: 'Fail-closed publishing and a five-provider LLM chain',
    url: 'https://aideazz.xyz/ai-ops-wiki.html',
    show: 'aideazz.xyz/ai-ops-wiki.html',
    body: 'Every model call in the fleet has an ordered fallback (Anthropic, OpenAI, Gemini, Grok, Groq). When Groq deprecated the models I used, the fleet kept serving — a config change, not an outage. The daily publisher will not print a number it cannot trace; if the model decorated the facts, the day stayed silent. A 130-test eval harness (unit, integration, golden-set) runs in under a minute at $0 API cost.',
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

function wrap(font, text, size, maxW) {
  const words = text.split(/\s+/);
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

async function buildLane(lane) {
  const cfg = LANES_JSON.lanes[lane];
  if (!cfg) throw new Error(`unknown lane: ${lane}`);
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
    page.drawText(text, { x: o.x ?? MARGIN_X, y: o.y, size: o.size, font: o.font, color: o.color ?? INK });
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
    if (tagline) drawText(tagline, { y: PAGE_H - 76, size: 8.5, font: italic, color: rgb(0.72, 0.78, 0.86) });
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
    drawText(text, { y, size: 9, font: bold });
    y -= 12;
    if (detail) para(detail);
    y -= 6;
  };

  addPage(true);

  section('Summary');
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
    for (const k of ORDER[lane] || ORDER.default) project(PROJECTS[k]);
  }
  roleLine('Operational Co-Founder — OmniBazaar, decentralised e-commerce  ·  2024–2025');

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
  para(
    'I am the architect, the reviewer and the on-call. I judge a new data source by running it through the live gate before integrating it: the source added in August cleared 76% against ~21% for the rest of the fleet. I write the failure down and name it — clients can read how I debug before they hire me.',
  );
  y -= 8;

  section('Available for');
  for (const line of AVAILABLE[lane] || AVAILABLE.default) {
    ensure(16);
    drawText('–  ' + line, { y, size: 8.8, font: regular });
    y -= 14;
  }
  y -= 6;

  section(lane === 'language' ? 'Language & audio toolkit' : 'Stack');
  para(lane === 'language' && cfg.foundation ? plain(cfg.foundation) : STACK[lane] || STACK.default);
  y -= 8;

  section('Earlier');
  roleLine(
    'Deputy CEO & Chief Legal Officer — JSC “E-GOV OPERATOR”  ·  2011–2018',
    'Seven years at board level on large-scale public-sector digital transformation: IT, legal and compliance in a heavily regulated environment.',
  );
  roleLine('Deputy CEO, Business Development — Fundery LLC (fintech)  ·  2017–2018');

  section('Education');
  para(
    'MA Social Psychology — Penza State University · 2018. Blockchain Regulation — MGIMO, Moscow · 2017. Presidential Program for Executive Management — RANEPA · 2015. Polkadot Blockchain Academy, PBA-X Wave 3 · 2025. How-To-DAO Cohort · 2025. Anthropic Academy — Claude Certification Program · 2026, in progress. Internship — Nyskapingsparken Innovation Park, Bergen, Norway.',
  );
  y -= 8;

  section('Languages');
  para(LANGUAGES_LINE[lane] || LANGUAGES_LINE.default);

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
  const out = path.join(CV_DIR, cfg.cv);
  const bytes = await pdf.save();
  fs.writeFileSync(out, bytes);
  return { lane, file: cfg.cv, pages: n, bytes: bytes.length };
}

(async () => {
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
