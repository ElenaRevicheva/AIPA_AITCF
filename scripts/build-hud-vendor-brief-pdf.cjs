#!/usr/bin/env node
/**
 * HUD / DataVendor listing memorandum.
 *
 * Buyer-facing. Not a resume. Not Nine Systems. Not a confession letter.
 * HUD's quote is the embedded screenshot — /codebases/result is session-bound.
 *
 * Output: docs/selling/attachments/HUD_Vendor_NonExclusive_Licence_Brief.pdf
 * Rebuild: npm install pdf-lib --no-save && node scripts/build-hud-vendor-brief-pdf.cjs
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, PDFString } = require('pdf-lib');

const OUT = path.join(
  __dirname,
  '..',
  'docs/selling/attachments/HUD_Vendor_NonExclusive_Licence_Brief.pdf'
);
const SHOT = path.join(
  __dirname,
  '..',
  'docs/selling/attachments/sources/hud-datavendor-estimate-2026-08-31.png'
);

function toAscii(s) {
  return String(s)
    .replace(/→/g, '->')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/×/g, 'x')
    .replace(/≈/g, '~')
    .replace(/·/g, ' | ')
    .replace(/[^\x00-\x7F]/g, '');
}

async function main() {
  const doc = await PDFDocument.create();
  doc.setTitle('AIdeazz AI Lab - Non-exclusive training licence - eight private repos');
  doc.setAuthor('Elena Revicheva, AIdeazz AI Lab');
  doc.setSubject('HUD / DataVendor listing memorandum. Licence of a copy. Lab stays up.');
  doc.setKeywords(['non-exclusive', 'training licence', 'HUD', 'DataVendor', 'AIdeazz']);
  doc.setCreator('AIdeazz AI Lab');
  doc.setProducer('scripts/build-hud-vendor-brief-pdf.cjs');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const shot = await doc.embedPng(fs.readFileSync(SHOT));

  const ink = rgb(0.07, 0.09, 0.12);
  const muted = rgb(0.38, 0.4, 0.44);
  const rule = rgb(0.82, 0.84, 0.86);
  const navy = rgb(0.05, 0.12, 0.24);
  const navyMid = rgb(0.09, 0.2, 0.36);
  const gold = rgb(0.78, 0.58, 0.16);
  const goldFill = rgb(0.99, 0.95, 0.82);
  const cream = rgb(0.99, 0.98, 0.96);
  const white = rgb(1, 1, 1);
  const teal = rgb(0.12, 0.4, 0.38);
  const tealFill = rgb(0.9, 0.96, 0.94);
  const linkBlue = rgb(0.08, 0.32, 0.62);
  const w = 612;
  const h = 792;
  const left = 40;
  const right = w - 40;
  const maxW = right - left;
  const bottom = 50;

  const pages = [];
  let page;
  let y;

  const footer = (p, n, total) => {
    p.drawRectangle({ x: 0, y: 0, width: w, height: 36, color: navy });
    p.drawRectangle({ x: 0, y: 36, width: w, height: 3, color: gold });
    p.drawText('CONFIDENTIAL  |  HUD / DataVendor match only  |  Not a sale of the Lab', {
      x: left,
      y: 14,
      size: 7,
      font,
      color: rgb(0.85, 0.88, 0.92),
    });
    p.drawText(String(n) + ' / ' + String(total), {
      x: right - 22,
      y: 14,
      size: 7,
      font: fontB,
      color: gold,
    });
  };

  const paintHeader = (p) => {
    p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: cream });
    p.drawRectangle({ x: 0, y: 0, width: 8, height: h, color: gold });
    p.drawRectangle({ x: 0, y: h - 46, width: w, height: 46, color: navy });
    p.drawRectangle({ x: 0, y: h - 50, width: w, height: 4, color: gold });
    p.drawText('AIDEAZZ AI LAB', {
      x: left,
      y: h - 22,
      size: 9,
      font: fontB,
      color: gold,
    });
    p.drawText('LISTING MEMORANDUM   |   31 AUGUST 2026', {
      x: left + 118,
      y: h - 22,
      size: 9,
      font,
      color: white,
    });
    p.drawText('NON-EXCLUSIVE TRAINING LICENCE', {
      x: left,
      y: h - 38,
      size: 8,
      font: fontB,
      color: rgb(0.75, 0.8, 0.88),
    });
  };

  const startPage = () => {
    page = doc.addPage([w, h]);
    pages.push(page);
    paintHeader(page);
    y = h - 64;
  };
  startPage();
  const newPage = () => startPage();
  const ensure = (need) => {
    if (y - need < bottom) newPage();
  };

  const wrapTo = (text, size, fnt, width) => {
    const words = toAscii(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word;
      if (fnt.widthOfTextAtSize(trial, size) <= width) cur = trial;
      else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const fit = (str, size, fnt, width) => {
    const s = toAscii(str);
    if (fnt.widthOfTextAtSize(s, size) <= width) return s;
    let out = s;
    while (out.length > 1 && fnt.widthOfTextAtSize(out + '...', size) > width) {
      out = out.slice(0, -1);
    }
    return out + '...';
  };

  const LINK_RE =
    /https:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|cal\.com\/[^\s]+/g;

  const hrefFor = (token) => {
    const cleaned = token.replace(/[.,);]+$/, '');
    if (cleaned.includes('/codebases/result')) return null;
    if (cleaned.startsWith('https://')) return cleaned;
    if (cleaned.includes('@')) return 'mailto:' + cleaned;
    return 'https://' + cleaned;
  };

  const addUriAnnot = (pg, x, baseline, width, size, uri) => {
    if (!uri) return;
    const annot = pg.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x - 1, baseline - 2, x + width + 1, baseline + size],
      Border: [0, 0, 0],
      C: [0.08, 0.32, 0.62],
      H: 'I',
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) },
    });
    pg.node.addAnnot(pg.doc.context.register(annot));
  };

  const drawLinkedLine = (pg, line, x, baseline, size, fnt, defaultColor) => {
    LINK_RE.lastIndex = 0;
    let last = 0;
    let cursor = x;
    let m;
    while ((m = LINK_RE.exec(line))) {
      const before = line.slice(last, m.index);
      if (before) {
        pg.drawText(before, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
        cursor += fnt.widthOfTextAtSize(before, size);
      }
      const tokRaw = m[0];
      const punct = (tokRaw.match(/[.,);]+$/) || [''])[0];
      const tok = tokRaw.slice(0, tokRaw.length - punct.length);
      const tw = fnt.widthOfTextAtSize(tok, size);
      const href = hrefFor(tok);
      if (href) {
        pg.drawText(tok, { x: cursor, y: baseline, size, font: fnt, color: linkBlue });
        pg.drawLine({
          start: { x: cursor, y: baseline - 1.4 },
          end: { x: cursor + tw, y: baseline - 1.4 },
          thickness: 0.6,
          color: gold,
        });
        addUriAnnot(pg, cursor, baseline, tw, size, href);
      } else {
        pg.drawText(tok, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
      }
      cursor += tw;
      if (punct) {
        pg.drawText(punct, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
        cursor += fnt.widthOfTextAtSize(punct, size);
      }
      last = m.index + tokRaw.length;
    }
    const rest = line.slice(last);
    if (rest) pg.drawText(rest, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
  };

  const text = (str, size, fnt, color, width) => {
    const lines = wrapTo(str, size, fnt, width || maxW);
    for (const line of lines) {
      ensure(size + 4);
      drawLinkedLine(page, line, left, y, size, fnt, color);
      y -= size + 3;
    }
  };

  const gap = (n) => {
    y -= n;
  };

  const label = (str) => {
    ensure(18);
    page.drawRectangle({ x: left, y: y - 2, width: 18, height: 3, color: gold });
    page.drawText(toAscii(str), { x: left + 24, y, size: 8, font: fontB, color: navy });
    y -= 14;
  };

  // Hero
  page.drawText('Eight private production repositories. I keep the Lab.', {
    x: left,
    y,
    size: 11,
    font,
    color: muted,
  });
  y -= 28;
  page.drawText('$89,481', { x: left, y, size: 36, font: fontB, color: gold });
  y -= 16;
  page.drawText('HUD point estimate', {
    x: left,
    y,
    size: 9,
    font: fontB,
    color: navy,
  });
  page.drawText('Non-exclusive  ·  products stay up  ·  I retain copyright', {
    x: left + 130,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 18;

  const kpis = [
    { k: '44%', s: 'PROMISING' },
    { k: '$61k-$351k', s: 'THEIR RANGE' },
    { k: '8 REPOS', s: 'PRIVATE BUNDLE' },
    { k: '2,546', s: 'COMMITS' },
  ];
  const kpiW = (maxW - 18) / 4;
  ensure(52);
  kpis.forEach((kpi, i) => {
    const x = left + i * (kpiW + 6);
    page.drawRectangle({
      x,
      y: y - 34,
      width: kpiW,
      height: 46,
      color: navy,
    });
    page.drawRectangle({ x, y: y + 10, width: kpiW, height: 3, color: gold });
    page.drawText(kpi.k, { x: x + 8, y: y - 8, size: 12, font: fontB, color: gold });
    page.drawText(kpi.s, { x: x + 8, y: y - 22, size: 6, font: fontB, color: rgb(0.75, 0.8, 0.88) });
  });
  y -= 50;

  label("HUD'S OWN SCREEN  -  captured 31 AUG 2026");
  const shotW = maxW;
  const shotH = (shot.height / shot.width) * shotW;
  ensure(shotH + 20);
  page.drawRectangle({
    x: left - 2,
    y: y - shotH - 2,
    width: shotW + 4,
    height: shotH + 4,
    color: gold,
  });
  page.drawImage(shot, { x: left, y: y - shotH, width: shotW, height: shotH });
  y -= shotH + 8;
  text(
    'Point $89,481  |  Score 44% Promising  |  Range $61,067-$350,557  |  Discoverability: not public. HUD imputes missing measurements; $350,557 is not cash I will cite. This screen transfers no rights. A payout exists only after a signed licence and money in the bank.',
    8,
    font,
    muted
  );

  newPage();

  // Three term cards
  const cards = [
    {
      t: 'THE GRANT',
      b: 'Non-exclusive licence to a copy of the eight private repositories, for model-training and related evaluation by a matched lab through HUD / DataVendor. Same corpus may be licensed again. Each licence is a separate payment.',
    },
    {
      t: 'I RETAIN',
      b: 'Copyright. The AIdeazz AI Lab brand. Domains. The right to operate, improve, and sell every product. The running systems. Future commits after the licensed snapshot.',
    },
    {
      t: 'OUT OF SCOPE',
      b: 'Runtime and secrets (.env, keys, tokens). HubSpot CRM. Telegram and WhatsApp chat logs. Customer PII. Third-party or client material. Hostnames and internal ids. aideazz stays public: it deploys https://aideazz.xyz/portfolio',
    },
  ];
  const cardW = (maxW - 16) / 3;
  const cardPad = 8;
  const cardLines = cards.map((c) => wrapTo(c.b, 7.5, font, cardW - cardPad * 2));
  const cardH = 18 + Math.max(...cardLines.map((l) => l.length)) * 10 + 16;
  ensure(cardH + 8);
  cards.forEach((c, i) => {
    const x = left + i * (cardW + 8);
    page.drawRectangle({
      x,
      y: y - cardH + 12,
      width: cardW,
      height: cardH,
      color: i === 1 ? tealFill : white,
      borderColor: i === 1 ? teal : rule,
      borderWidth: 1,
    });
    page.drawRectangle({ x, y: y + 8, width: cardW, height: 4, color: gold });
    page.drawText(c.t, { x: x + cardPad, y: y - 6, size: 8, font: fontB, color: navy });
    let ty = y - 20;
    for (const line of cardLines[i]) {
      page.drawText(line, { x: x + cardPad, y: ty, size: 7.5, font, color: ink });
      ty -= 10;
    }
  });
  y -= cardH + 8;

  page.drawRectangle({
    x: left,
    y: y - 28,
    width: maxW,
    height: 40,
    color: tealFill,
    borderColor: teal,
    borderWidth: 0.8,
  });
  page.drawText('THE DEAL', {
    x: left + 10,
    y: y - 4,
    size: 7,
    font: fontB,
    color: teal,
  });
  page.drawText('A matched lab gets a copy. I keep the Lab. Lazarus / Turing already has this shape.', {
    x: left + 10,
    y: y - 18,
    size: 8,
    font,
    color: ink,
  });
  y -= 48;

  label("THE EIGHT REPOS  -  HUD'S POINT ESTIMATE");
  const rows = [
    ['Repository', 'Score', 'Point', 'Range', 'Training signal'],
    ['VibeJobHunterAIPA_AIMCF', '58%', '$17,020', '$12.7k-$50.6k', 'LangGraph hunter; 556 commits; 54k LOC; 131-test eval'],
    ['EspaLuzWhatsApp', '57%', '$16,735', '$12.4k-$49.7k', 'WhatsApp advisor; 388 commits; bilingual tool-use'],
    ['EspaLuz_Influencer', '57%', '$16,662', '$12.9k-$45.2k', 'Publishing agent; 126 commits; 100% CI'],
    ['EspaLuzFamilybot', '52%', '$13,303', '$10.8k-$32.0k', 'Telegram advisor; 207 commits; 100% CI'],
    ['AIPA_AITCF', '47%', '$10,910', '$5.5k-$64.5k', 'Ops brain; 1,052 commits; five-provider LLM chain'],
    ['dragontrade-agent', '35%', '$6,450', '$3.0k-$47.2k', 'Human-on-last-click paper trading'],
    ['AILA', '25%', '$4,264', '$2.0k-$31.2k', 'Personal AI (paused)'],
    ['atlas-captures', '24%', '$4,137', '$1.9k-$30.2k', 'Ad-angle time-series data'],
    ['EIGHT TOGETHER', '44%', '$89,481', '$61.1k-$350.6k', '2,546 commits; 88 PRs (67 merged); 247.7 MB'],
  ];
  const colW = [128, 38, 54, 78, 226];
  const rowH = 16;
  ensure(rowH * rows.length + 8);
  rows.forEach((r, i) => {
    const f = i === 0 || i === rows.length - 1 ? fontB : font;
    const size = 6.5;
    const bg =
      i === 0 ? navy : i === rows.length - 1 ? goldFill : i % 2 === 0 ? white : rgb(0.96, 0.97, 0.98);
    const color = i === 0 ? white : ink;
    page.drawRectangle({
      x: left,
      y: y - 5,
      width: maxW,
      height: rowH - 1,
      color: bg,
    });
    let x = left + 4;
    r.forEach((cell, c) => {
      page.drawText(fit(cell, size, f, colW[c] - 6), {
        x,
        y: y + 1,
        size,
        font: f,
        color: i === rows.length - 1 && c === 2 ? rgb(0.55, 0.38, 0.05) : color,
      });
      x += colW[c];
    });
    y -= rowH;
  });
  y -= 6;
  text(
    'Almost every repo has test coverage imputed. I do not ask you to treat imputed-perfect ($350k) as an offer.',
    7.5,
    font,
    muted
  );
  gap(8);

  label('LIVE PROOF  (not in the licensed copy)');
  const proofs = [
    'https://aideazz.xyz/portfolio  (primary hub)',
    'https://aideazz.xyz/api  (audit API + free tool)',
    'https://webhook.aideazz.xyz/whitespace/atlas.html  (Atlas board)',
    'https://aideazz.xyz/portfolio#portfolio-inquiry-form',
    'https://aideazz.xyz/sop-ai-ops.html  (ops SOP)',
    'https://aideazz.xyz/blog  (daily grounded publisher)',
    'https://aideazz.xyz/ai-ops-wiki.html  (AI Ops Wiki  -  named failure modes)',
    'https://podcast.aideazz.xyz/  (podcast)',
  ];
  for (const p of proofs) {
    ensure(11);
    page.drawRectangle({ x: left, y: y + 1, width: 5, height: 5, color: gold });
    drawLinkedLine(page, toAscii(p), left + 12, y, 8, font, navy);
    y -= 11;
  }
  gap(8);

  label('WHAT I WILL NOT SIGN');
  text(
    'Exclusive grant. Copyright assignment. Any term that requires taking a product down, transferring a domain, or including CRM / chat logs / keys / client data. An exclusive HUD paper would poison the Lazarus / Turing cheque.',
    9,
    font,
    ink
  );
  gap(6);

  ensure(70);
  page.drawRectangle({
    x: left,
    y: y - 52,
    width: maxW,
    height: 64,
    color: navy,
  });
  page.drawRectangle({ x: left, y: y + 10, width: maxW, height: 3, color: gold });
  page.drawText('ASK', {
    x: left + 12,
    y: y - 6,
    size: 8,
    font: fontB,
    color: gold,
  });
  const ask =
    'Match a lab to this bundle. Tell me the actual payout. Licence is non-exclusive. The Lab stays up. I attend the DataVendor call. I sign a marketplace NDA that keeps ownership. I do not sign exclusive.';
  let ay = y - 20;
  for (const line of wrapTo(ask, 9, font, maxW - 24)) {
    page.drawText(line, { x: left + 12, y: ay, size: 9, font, color: white });
    ay -= 12;
  }
  y -= 70;

  text('Elena Revicheva  |  AIdeazz AI Lab  |  Panama City  |  UTC-5', 10, fontB, navy);
  text('aipa@aideazz.xyz  |  https://aideazz.xyz/portfolio', 10, font, ink);
  text(
    'Call: 31 Aug 2026, 09:40 America/Panama  |  cal.com/team/hud/talk-to-us-data-vendor-platform',
    8,
    font,
    muted
  );
  text(
    'This brief is not source code. The licensed copy is the private GitHub snapshot HUD already archived for the estimate.',
    8,
    font,
    muted
  );

  newPage();
  label('WHO BUILT THIS');
  const who = [
    'Two of the seats below were in Russia. Seven years as Deputy CEO and Chief Legal Officer of JSC E-GOV OPERATOR, Russia (2011-2018): board-level public-sector digital transformation, holding IT, legal and compliance in a regulated environment. Second Russia seat: Deputy CEO, Business Development at Fundery (fintech, 2017-2018). Then an operational co-founder seat at OmniBazaar.',
    'This Lab is a deliberate pivot into applied AI engineering, not a hobby stack. Same standard I used to impose on vendors: measure at the edge, fail closed, write the failure down. The 131-test eval harness, five-provider LLM chain, fail-closed publisher, and public AI Ops Wiki are that executive bar in code. I am architect, reviewer, and on-call for the fleet.',
  ];
  const whoInner = maxW - 24;
  const whoLines = [];
  who.forEach((para, i) => {
    wrapTo(para, 8, font, whoInner).forEach((ln) => whoLines.push(ln));
    if (i !== who.length - 1) whoLines.push('');
  });
  const whoBoxH = 22 + whoLines.length * 10 + 12;
  ensure(whoBoxH + 8);
  page.drawRectangle({
    x: left,
    y: y - whoBoxH + 12,
    width: maxW,
    height: whoBoxH,
    color: navy,
  });
  page.drawRectangle({ x: left, y: y + 8, width: maxW, height: 3, color: gold });
  page.drawText('ELENA REVICHEVA  |  AIDEAZZ AI LAB  |  PANAMA', {
    x: left + 12,
    y: y - 4,
    size: 8,
    font: fontB,
    color: gold,
  });
  let wy = y - 18;
  for (const line of whoLines) {
    if (line) page.drawText(line, { x: left + 12, y: wy, size: 8, font, color: white });
    wy -= 10;
  }
  y -= whoBoxH + 6;

  label('WHY EACH SYSTEM EXISTS  -  AND HOW IT RUNS NOW');
  text(
    'Each of these eight started as a real operating constraint, then was engineered to production standard. Live products stay up. This packet licences a copy of source.',
    9,
    font,
    ink
  );
  gap(6);
  text(
    'Shared spine: one Oracle Cloud box, Telegram as the control room, HubSpot as the ledger, TypeScript where money/CRM state lives, Python where the ML stack lives, and a five-provider LLM chain so a zero-balance outage cannot stop the fleet. On 19 Aug Anthropic hit zero; the chain fell through to OpenAI in 2.4 seconds and nothing dropped.',
    8,
    font,
    muted
  );
  gap(10);

  const products = [
    {
      repo: 'EspaLuzFamilybot',
      title: 'Bilingual expat advisor  -  Telegram',
      why: 'Four people arrived in Panama at once without Spanish: a child, two retirees, one adult solving all of it. Language apps teach vocabulary on a schedule. The need was the sentence in front of you, plus which form, which queue, what you are actually agreeing to. Every arriving household has that first month.',
      how: 'Live on Telegram. Per-family memory, not per-user: LangChain for the current conversation, pgvector RAG on Oracle Autonomous DB for everything durable ("which queue did I use last time?"). Voice in and out, image understanding for forms, payments wired for trials. Emotional intelligence before grammar. Designed for 21 Spanish-speaking countries, not Panama-only. Engineering is finished; families use it.',
    },
    {
      repo: 'EspaLuzWhatsApp',
      title: 'The same advisor  -  WhatsApp',
      why: 'In Latin America WhatsApp is the internet. Telegram is where early adopters are. One advisor, two front ends, or the product only reaches half the household.',
      how: 'Live on WhatsApp. Shared logic with the Telegram twin. Same memory, voice, and image path. Two clients over one brain so a family is one record, not two bots that forget each other.',
    },
    {
      repo: 'EspaLuz_Influencer',
      title: 'Publishing agent  -  blog, social, cadence',
      why: 'One operator cannot also post to LinkedIn, Instagram, X and a blog every day. The Lab needed a public face without performing on social media. Only things that actually happened, or it is noise.',
      how: 'Daily article at 14:30 Panama, cross-posted with canonical URLs. Bilingual social atoms on a schedule. Grounded generation: production evidence is collected before the model writes (uptimes, commits, CRM counts) and a number that cannot be traced is refused. Every link carries UTM and Atlas IDs.',
    },
    {
      repo: 'VibeJobHunterAIPA_AIMCF',
      title: 'Scored discovery with a human on the last click',
      why: 'Mechanical search is volume. Judgment is not. The product problem is scored routing that a human can interrupt, plus a judge that can be audited instead of trusted.',
      how: 'LangGraph state machine: gate, score, route, notify. SQLite checkpointing so a crash resumes. Auto-apply was removed after it produced volume and zero outcomes. Scoring is an LLM judge with two counterweights: a 131-test 4-layer eval harness (keyword, bias, golden-set, LLM-as-judge), and a feedback loop from real accept/reject reasons. Fails closed on an LLM outage. 11 sources, hourly.',
    },
    {
      repo: 'AIPA_AITCF',
      title: 'Ops brain  -  sales operation + fleet control',
      why: 'No sales team, no Panama network, no budget, and eight systems that can break overnight. Customers and uptime both had to be software.',
      how: 'Telegram is the control plane (82 commands, 08:00 briefing). HubSpot is the ledger. A webhook API is the front door. Form submission becomes a CRM record, a drafted reply, and a one-tap approval card. A synthetic lead hits the real pipeline daily at 07:45: silent on pass, alerting on failure. /code and /fix open real GitHub PRs; a human is on the last click. This repo also holds the Atuona automated film pipeline (clips in, mixed film out, nobody on a timeline) and the Atlas radar (detect, not predict).',
    },
    {
      repo: 'dragontrade-agent',
      title: 'Human-on-last-click paper trading',
      why: 'An agent that can take an irreversible action needs a different design than a chatbot. Built to learn that constraint: trading education and paper trading only. Never live money.',
      how: 'The agent proposes; a human disposes. Own dashboard. Paper trading only. Same last-click rule as the rest of the fleet.',
    },
    {
      repo: 'atlas-captures',
      title: 'Ad-angle time-series data',
      why: 'Cold outreach with nothing to say fails. Public ad libraries are open data almost nobody reads systematically. A business will read a letter about their market, not a letter about the sender.',
      how: 'Stored captures of which creative angle is observably running, and for how long. Detect, not predict: the system refuses to forecast. Weekly across seven service lanes. The live board is at https://webhook.aideazz.xyz/whitespace/atlas.html. This repo is the data HUD grades, not only the code.',
    },
    {
      repo: 'AILA',
      title: 'Personal AI  -  paused',
      why: 'A life-scale assistant is a different product from the ops bots: governed longitudinal memory, safety, and continuity across months, not another Telegram command surface.',
      how: 'Paused. Blueprint and inheritance notes exist (emotional/associative layers from Atuona; routing and persistence craft from AIPA). Thin in the HUD bundle because it is not the production control room. Included because it is a distinct private codebase.',
    },
  ];

  const drawProduct = (p) => {
    const whyLines = wrapTo(p.why, 8, font, maxW - 8);
    const howLines = wrapTo(p.how, 8, font, maxW - 8);
    const blockH = 22 + 12 + whyLines.length * 10.5 + 12 + howLines.length * 10.5 + 10;
    ensure(blockH);
    page.drawRectangle({
      x: left,
      y: y - blockH + 14,
      width: maxW,
      height: blockH,
      color: white,
      borderColor: rule,
      borderWidth: 0.7,
    });
    page.drawRectangle({ x: left, y: y + 8, width: maxW, height: 3, color: gold });
    page.drawText(toAscii(p.repo), { x: left + 8, y: y - 4, size: 8, font: fontB, color: gold });
    page.drawText(toAscii(p.title), { x: left + 8, y: y - 16, size: 8, font: fontB, color: navy });
    let ty = y - 30;
    page.drawText('WHY IT WAS BUILT', { x: left + 8, y: ty, size: 6.5, font: fontB, color: teal });
    ty -= 11;
    for (const line of whyLines) {
      page.drawText(line, { x: left + 8, y: ty, size: 8, font, color: ink });
      ty -= 10.5;
    }
    ty -= 4;
    page.drawText('HOW IT RUNS NOW', { x: left + 8, y: ty, size: 6.5, font: fontB, color: teal });
    ty -= 11;
    for (const line of howLines) {
      drawLinkedLine(page, line, left + 8, ty, 8, font, ink);
      ty -= 10.5;
    }
    y -= blockH + 8;
  };

  for (const p of products) drawProduct(p);

  const total = pages.length;
  pages.forEach((p, i) => footer(p, i + 1, total));

  const bytes = await doc.save();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
  const magic = Buffer.from(bytes.slice(0, 5)).toString();
  if (magic !== '%PDF-') throw new Error('not a PDF: ' + magic);
  console.log('wrote', OUT, bytes.length, 'bytes', magic, 'pages', total);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
