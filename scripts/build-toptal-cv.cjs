#!/usr/bin/env node
/**
 * Two-page Toptal CV. Source of truth: docs/applications/2026-09-13_toptal_cv.md
 * Rebuild: node scripts/build-toptal-cv.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, PDFString } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/applications/13.09.26_EN_Resume_Elena_Revicheva_Toptal.pdf');
const FONT_REG = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf';
const FONT_ITAL = '/usr/share/fonts/truetype/noto/NotoSans-Italic.ttf';

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

async function main() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync(FONT_REG), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync(FONT_BOLD), { subset: true });
  const italic = await pdf.embedFont(fs.readFileSync(FONT_ITAL), { subset: true });

  const pages = [];
  const addPage = () => {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(p);
    return p;
  };

  let page = addPage();
  let y = PAGE_H;

  const newPage = () => {
    footer(page, pages.length);
    page = addPage();
    y = drawHeaderBand(false);
  };

  const ensure = (need) => {
    if (y - need < MARGIN_BOTTOM + 16) newPage();
  };

  const drawText = (text, opts) => {
    page.drawText(text, {
      x: opts.x ?? MARGIN_X,
      y: opts.y,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? INK,
    });
  };

  const linkAnnot = (x, y0, w, h, uri) => {
    const annot = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [x, y0, x + w, y0 + h],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) },
      })
    );
    page.node.addAnnot(annot);
  };

  const linkText = (label, uri, x, y0, size, font, color) => {
    drawText(label, { x, y: y0, size, font, color: color ?? LINK });
    const w = font.widthOfTextAtSize(label, size);
    linkAnnot(x, y0 - 2, w, size + 4, uri);
    return w;
  };

  const drawHeaderBand = (isFirst) => {
    const h = isFirst ? 126 : 36;
    page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: NAVY });
    if (!isFirst) {
      drawText('ELENA REVICHEVA  ·  Applied AI Engineer', {
        x: MARGIN_X,
        y: PAGE_H - 23,
        size: 9,
        font: bold,
        color: WHITE,
      });
      return PAGE_H - 56;
    }
    drawText('ELENA REVICHEVA', { x: MARGIN_X, y: PAGE_H - 38, size: 20, font: bold, color: WHITE });
    drawText('Applied AI Engineer', {
      x: MARGIN_X,
      y: PAGE_H - 58,
      size: 11,
      font: regular,
      color: rgb(0.82, 0.86, 0.92),
    });
    drawText('Production LLM systems for CRM, approved outreach, and AI-search visibility', {
      x: MARGIN_X,
      y: PAGE_H - 76,
      size: 8.5,
      font: italic,
      color: rgb(0.72, 0.78, 0.86),
    });
    const contactY = PAGE_H - 96;
    const contactSize = 7.5;
    let cx = MARGIN_X;
    const bits = [
      { t: 'aipa@aideazz.xyz', u: 'mailto:aipa@aideazz.xyz' },
      { t: '+507 616 66 716' },
      { t: 'LinkedIn', u: 'https://linkedin.com/in/elenarevicheva' },
      { t: 'GitHub', u: 'https://github.com/ElenaRevicheva' },
      { t: 'aideazz.xyz/portfolio', u: 'https://aideazz.xyz/portfolio' },
    ];
    bits.forEach((b, i) => {
      if (i) {
        drawText('  ·  ', { x: cx, y: contactY, size: contactSize, font: regular, color: rgb(0.65, 0.72, 0.8) });
        cx += regular.widthOfTextAtSize('  ·  ', contactSize);
      }
      if (b.u) cx += linkText(b.t, b.u, cx, contactY, contactSize, regular, rgb(0.85, 0.9, 0.96));
      else {
        drawText(b.t, { x: cx, y: contactY, size: contactSize, font: regular, color: rgb(0.85, 0.9, 0.96) });
        cx += regular.widthOfTextAtSize(b.t, contactSize);
      }
    });
    drawText('Contract  ·  20–30 hours/week  ·  Panama (UTC-5)  ·  daily overlap 09:00–13:00 ET', {
      x: MARGIN_X,
      y: PAGE_H - 114,
      size: 7.5,
      font: regular,
      color: rgb(0.7, 0.76, 0.84),
    });
    return PAGE_H - 148;
  };

  y = drawHeaderBand(true);

  const section = (title) => {
    ensure(28);
    drawText(title.toUpperCase(), { y, size: 8.5, font: bold, color: NAVY });
    y -= 6;
    page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 0.8, color: RULE });
    y -= 14;
  };

  const para = (text, font, size, color, leading) => {
    const lines = wrap(font, text, size, CONTENT_W);
    for (const line of lines) {
      ensure(leading + 2);
      drawText(line, { y, size, font, color: color ?? INK });
      y -= leading;
    }
  };

  const project = (title, url, urlLabel, body) => {
    ensure(52);
    drawText(title, { y, size: 10, font: bold, color: INK });
    y -= 13;
    if (url) {
      linkText(urlLabel, url, MARGIN_X, y, 8, regular, LINK);
      y -= 12;
    }
    para(body, regular, 8.6, INK, 11.4);
    y -= 8;
  };

  section('Summary');
  para(
    'I design, deploy, and stay on call for the automation that runs a business when nobody is watching: find the customer, draft the reply, write the CRM, report what happened. Twelve production systems on one Oracle Cloud VM for eighteen months. Before that, seven years as Deputy CEO running regulated digital-transformation programs at board level, so I can hold the same conversation with the engineer and the person signing.',
    regular,
    9,
    INK,
    12
  );
  y -= 6;

  section('Selected work');

  project(
    'AI Visibility Audit API — public product',
    'https://aideazz.xyz/api',
    'aideazz.xyz/api',
    'Live scoring for how discoverable a site is to ChatGPT, Perplexity and Claude, not only Google. Same GEO/AEO engine that scores my own hub 100/100. Production floor from Oracle logs, rounded down: 420+ audits, 14,000+ signals, 210+ sites, median 85. Each check returns the fix and why it matters (34 why / 4 fix on a live stripe.com run).'
  );

  project(
    'Approved-send growth loop — HubSpot + Resend',
    null,
    null,
    'The acquisition loop I run in production: research, qualify, draft, one human tap, send, then delivery and open written back to the CRM. 1,900+ deals, 989 contacts, 1,411 companies attributed by the agents. Send is fail-closed: if a PDF or signed .docx fails to load, the email is refused so it cannot claim an attachment it did not carry.'
  );

  project(
    'EspaLuz — paying WhatsApp / Telegram tutor',
    'https://wa.me/50766623757',
    'wa.me/50766623757',
    'Bilingual relocation and language tutor on WhatsApp and Telegram. Persistent per-student memory (RAG + pgvector). PayPal subscriptions. Early users in 19 countries. I am the architect and the on-call.'
  );

  project(
    'Fail-closed publishing and a five-provider LLM chain',
    'https://aideazz.xyz/ai-ops-wiki.html',
    'aideazz.xyz/ai-ops-wiki.html',
    'Every model call in the fleet has an ordered fallback (Anthropic, OpenAI, Gemini, Grok, Groq). When Groq deprecated the models I used, the fleet kept serving — a config change, not an outage. The daily publisher will not print a number it cannot trace; if the model decorated the facts, the day stayed silent. A 130-test eval harness (unit, integration, golden-set) runs in under a minute at $0 API cost.'
  );

  newPage();

  section('Proof Hub');
  const proofs = [
    { label: 'Portfolio', url: 'https://aideazz.xyz/portfolio', show: 'aideazz.xyz/portfolio' },
    { label: 'Atlas', url: 'https://webhook.aideazz.xyz/whitespace/atlas.html', show: 'atlas.html' },
    { label: 'Wiki', url: 'https://aideazz.xyz/ai-ops-wiki.html', show: 'ai-ops-wiki.html' },
    { label: 'Ops SOP', url: 'https://aideazz.xyz/sop-ai-ops.html', show: 'sop-ai-ops.html' },
    { label: 'Blog', url: 'https://aideazz.xyz/blog', show: 'aideazz.xyz/blog' },
    { label: 'Podcast', url: 'https://podcast.aideazz.xyz/', show: 'podcast.aideazz.xyz' },
    { label: 'EspaLuz WA', url: 'https://wa.me/50766623757', show: 'wa.me/50766623757' },
    { label: 'Atuona Studio', url: 'https://atuona.xyz/aifilmstudio/', show: 'atuona.xyz/aifilmstudio' },
  ];
  const colW = CONTENT_W / 2;
  const labelW = 92;
  proofs.forEach((p, i) => {
    if (i % 2 === 0) ensure(16);
    const col = i % 2;
    const x = MARGIN_X + col * colW;
    const rowY = y;
    drawText(p.label, { x, y: rowY, size: 7.5, font: bold, color: INK });
    linkText(p.show, p.url, x + labelW, rowY, 7.2, regular, LINK);
    if (col === 1 || i === proofs.length - 1) y -= 13;
  });
  y -= 8;

  section('How I work');
  para(
    'I am the architect, the reviewer and the on-call. I judge a new data source by running it through the live gate before integrating it: the source added in August cleared 76% against ~21% for the rest of the fleet. I write the failure down and name it — clients can read how I debug before they hire me.',
    regular,
    8.6,
    INK,
    11.4
  );
  y -= 10;

  section('Available for');
  const avail = [
    'Production LLM systems with fallback, evals and on-call ownership',
    'CRM and approved-send outreach (HubSpot, Resend, human-in-the-loop)',
    'AI-search visibility (GEO/AEO) audits and engines — ChatGPT, Perplexity, Claude',
    'Fail-closed publishing and internal AI operations for a founder-led team',
  ];
  for (const line of avail) {
    ensure(16);
    drawText('–  ' + line, { y, size: 8.8, font: regular, color: INK });
    y -= 14;
  }
  y -= 10;

  section('Stack');
  para(
    'Python  ·  TypeScript  ·  Node.js  ·  FastAPI  ·  LangGraph  ·  RAG (pgvector)  ·  HubSpot  ·  Make  ·  Resend  ·  Playwright  ·  PostgreSQL  ·  Docker  ·  Oracle Cloud (OCI)',
    regular,
    8.6,
    INK,
    11.4
  );
  y -= 8;

  section('Earlier');
  drawText('Deputy CEO & Chief Legal Officer — JSC “E-GOV OPERATOR”  ·  2011–2018', {
    y,
    size: 9,
    font: bold,
    color: INK,
  });
  y -= 12;
  para(
    'Seven years at board level on large-scale public-sector digital transformation: IT, legal and compliance in a heavily regulated environment.',
    regular,
    8.6,
    INK,
    11.4
  );
  y -= 8;

  section('Education');
  para(
    'MA Social Psychology — Penza State University · 2018. Presidential Program for Executive Management — RANEPA · 2015. Internship — Nyskapingsparken Innovation Park, Bergen, Norway.',
    regular,
    8.6,
    INK,
    11.4
  );
  y -= 8;

  section('Languages');
  para(
    'English — fluent (professional)  ·  Spanish — intermediate  ·  Russian — native  ·  French — elementary',
    regular,
    8.6,
    INK,
    11.4
  );

  footer(page, pages.length);

  function footer(p, n) {
    p.drawText('aideazz.xyz/portfolio', {
      x: MARGIN_X,
      y: 22,
      size: 7,
      font: regular,
      color: MUTED,
    });
    const label = `${n} / 2`;
    const w = regular.widthOfTextAtSize(label, 7);
    p.drawText(label, {
      x: PAGE_W - MARGIN_X - w,
      y: 22,
      size: 7,
      font: regular,
      color: MUTED,
    });
  }

  if (pages.length !== 2) {
    throw new Error(`Toptal CV must be exactly 2 pages, got ${pages.length}`);
  }

  pdf.setTitle('Elena Revicheva — Applied AI Engineer');
  pdf.setAuthor('Elena Revicheva');
  pdf.setSubject('Toptal curriculum vitae');
  pdf.setCreator('scripts/build-toptal-cv.cjs');
  pdf.setKeywords(['Toptal', 'Applied AI', 'automation']);

  const bytes = await pdf.save();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
  console.log(`wrote ${OUT} (${bytes.length} bytes, ${pages.length} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
