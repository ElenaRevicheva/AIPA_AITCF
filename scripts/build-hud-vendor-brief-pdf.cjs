#!/usr/bin/env node
/**
 * HUD / DataVendor listing memorandum.
 *
 * Buyer-facing commercial packet for Work samples. Not a resume. Not the
 * Nine Systems job-hunt dossier. Numbers are HUD's own 30 Aug 2026 estimate
 * plus production facts already verified in this repo / Elena's result screen.
 *
 * Output: docs/selling/attachments/HUD_Vendor_NonExclusive_Licence_Brief.pdf
 *
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
  const ink = rgb(0.07, 0.09, 0.12);
  const muted = rgb(0.32, 0.36, 0.4);
  const rule = rgb(0.78, 0.82, 0.86);
  const navy = rgb(0.08, 0.18, 0.32);
  const navySoft = rgb(0.93, 0.95, 0.97);
  const gold = rgb(0.55, 0.4, 0.08);
  const goldFill = rgb(0.98, 0.95, 0.86);
  const amberFill = rgb(0.99, 0.96, 0.88);
  const amberRule = rgb(0.72, 0.52, 0.12);
  const greenFill = rgb(0.91, 0.95, 0.92);
  const greenRule = rgb(0.18, 0.42, 0.32);
  const paper = rgb(1, 1, 1);
  const w = 612;
  const h = 792;
  const left = 44;
  const right = w - 44;
  const maxW = right - left;
  const bottom = 52;

  let page = doc.addPage([w, h]);
  let y = h - 36;
  let pageNo = 1;

  const footer = (p, n) => {
    p.drawLine({
      start: { x: left, y: 38 },
      end: { x: right, y: 38 },
      thickness: 0.5,
      color: rule,
    });
    p.drawText('CONFIDENTIAL  |  HUD / DataVendor match only  |  Not a sale of the Lab', {
      x: left,
      y: 24,
      size: 7,
      font,
      color: muted,
    });
    p.drawText(String(n) + ' / 2', {
      x: right - 18,
      y: 24,
      size: 7,
      font,
      color: muted,
    });
  };

  const paintHeader = (p) => {
    p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: paper });
    p.drawRectangle({ x: 0, y: h - 28, width: w, height: 28, color: navy });
    p.drawText('AIDEAZZ AI LAB   |   LISTING MEMORANDUM   |   31 AUGUST 2026', {
      x: left,
      y: h - 18,
      size: 8,
      font: fontB,
      color: rgb(1, 1, 1),
    });
  };

  paintHeader(page);
  footer(page, 1);
  y = h - 44;

  const newPage = () => {
    footer(page, pageNo);
    pageNo += 1;
    page = doc.addPage([w, h]);
    paintHeader(page);
    footer(page, pageNo);
    y = h - 44;
  };

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

  const linkBlue = rgb(0.08, 0.28, 0.62);
  const LINK_RE =
    /https:\/\/[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|datavendor\.ai\/[^\s]+|cal\.com\/[^\s]+/g;

  const hrefFor = (token) => {
    const cleaned = token.replace(/[.,);]+$/, '');
    if (cleaned.startsWith('https://')) return cleaned;
    if (cleaned.includes('@')) return 'mailto:' + cleaned;
    return 'https://' + cleaned;
  };

  const addUriAnnot = (pg, x, baseline, width, size, uri) => {
    const annot = pg.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x - 1, baseline - 2, x + width + 1, baseline + size],
      Border: [0, 0, 0],
      C: [0.08, 0.28, 0.62],
      H: 'I',
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(uri),
      },
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
      pg.drawText(tok, { x: cursor, y: baseline, size, font: fnt, color: linkBlue });
      pg.drawLine({
        start: { x: cursor, y: baseline - 1.4 },
        end: { x: cursor + tw, y: baseline - 1.4 },
        thickness: 0.5,
        color: linkBlue,
      });
      addUriAnnot(pg, cursor, baseline, tw, size, hrefFor(tok));
      cursor += tw;
      if (punct) {
        pg.drawText(punct, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
        cursor += fnt.widthOfTextAtSize(punct, size);
      }
      last = m.index + tokRaw.length;
    }
    const rest = line.slice(last);
    if (rest) {
      pg.drawText(rest, { x: cursor, y: baseline, size, font: fnt, color: defaultColor });
    }
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
    ensure(16);
    page.drawText(toAscii(str), { x: left, y, size: 8, font: fontB, color: navy });
    y -= 13;
  };

  const callout = (title, body, fill, border, titleColor) => {
    const pad = 10;
    const inner = maxW - pad * 2;
    const bodyLines = wrapTo(body, 9, font, inner);
    const boxH = pad + 12 + bodyLines.length * 12 + pad;
    ensure(boxH + 4);
    page.drawRectangle({
      x: left,
      y: y - boxH + 10,
      width: maxW,
      height: boxH,
      color: fill,
      borderColor: border,
      borderWidth: 0.8,
    });
    drawLinkedLine(page, toAscii(title), left + pad, y - 2, 8, fontB, titleColor);
    let ty = y - 16;
    for (const line of bodyLines) {
      drawLinkedLine(page, line, left + pad, ty, 9, font, ink);
      ty -= 12;
    }
    y -= boxH + 6;
  };

  page.drawText('Non-exclusive training licence', {
    x: left,
    y,
    size: 18,
    font: fontB,
    color: ink,
  });
  y -= 18;
  page.drawText('Eight private production repositories. I keep the Lab.', {
    x: left,
    y,
    size: 12,
    font,
    color: muted,
  });
  y -= 16;

  text(
    'This is a licence of a copy of source I solely own, for model-training and related evaluation by a matched lab through HUD / DataVendor. It is not a sale of AIdeazz AI Lab, not a transfer of copyright, and not an exclusive grant. Every product stays in production on my server, under my brand, on my domains.',
    10,
    font,
    ink
  );
  gap(8);

  callout(
    'THE DEAL IN ONE LINE',
    'A matched lab gets a copy of the eight private repos listed below. I keep copyright, the brand, the domains, the running systems, and the right to licence the same corpus again. Lazarus / Turing already has this same non-exclusive shape on the table. An exclusive HUD paper would poison that second cheque. I will not sign exclusive.',
    greenFill,
    greenRule,
    greenRule
  );

  callout(
    "HUD'S OWN ESTIMATE  -  30 AUG 2026  -  datavendor.ai/codebases/result",
    'Eight private repos. Public discoverability: not public. Bundle score 44% Promising. Point estimate $89,481. Range $61,067-$350,557. HUD: a measurement they could not take is imputed, not zeroed; the range is imputed-empty vs imputed-perfect. I treat $61,067 as the cautious reading of their model. $350,557 is not cash I will cite. This screen transfers no rights. A payout exists only after a signed licence and money in the bank.',
    goldFill,
    gold,
    gold
  );

  callout(
    'DISCLOSURE  -  DO NOT HIDE THIS',
    'These eight repositories were public GitHub until 30 August 2026. I built in public. I flipped them to private the same day as the DataVendor estimate so the tool could grade private code. Making them private does not un-publish GitHub Archive or prior clones. If that fact zeros or cuts the price, say so on the call. I will not represent this corpus as never-public.',
    amberFill,
    amberRule,
    amberRule
  );

  label('THE GRANT');
  text(
    'Non-exclusive licence to a copy of the eight private repositories, for model-training and related evaluation use by a matched lab through HUD / DataVendor. Same corpus may be licensed to more than one buyer. Each licence is a separate payment.',
    10,
    font,
    ink
  );
  gap(6);

  label('I RETAIN');
  text(
    'Copyright. The AIdeazz AI Lab brand. Domains. The right to operate, improve, and sell every product. The running systems. Future commits after the licensed snapshot.',
    10,
    font,
    ink
  );
  gap(6);

  label('OUT OF SCOPE');
  text(
    'Production runtime and secrets (.env, keys, tokens). HubSpot CRM. Telegram and WhatsApp chat logs. Customer PII. Third-party or client material. Hostnames and internal record identifiers. The public website repo (aideazz) stays public because it deploys https://aideazz.xyz/portfolio.',
    10,
    font,
    ink
  );

  newPage();

  label('WHY A TRAINING LAB PAYS FOR THIS CORPUS');
  text(
    'This is not a resume and not an invitation to clone GitHub. It is a private snapshot of production agent systems that ran in the world, with evals, incident write-ups, bilingual commercial messaging, and a time-series data repo. Public tutorial repos are already in every scrape. This bundle is the operating history of one founder shipping daily.',
    10,
    font,
    ink
  );
  gap(6);

  const bullets = [
    'Production multi-agent systems with eval gates, not notebooks: LangGraph job hunter, WhatsApp + Telegram advisors, publishing agent, ops brain, paper-trading agent.',
    'Bilingual ES/EN commercial messaging on WhatsApp and Telegram - the kind of tool-use trace labs cannot cheaply synthesise.',
    'Ops brain with a published incident wiki of real production failures (named failure modes, verified from logs). Grounding and duplicate-publish incidents are in the public wiki; the source that produced them is in this bundle.',
    'atlas-captures is ad-angle time-series data, not only code. HUD buys data.',
    '2,546 commits, 88 PRs (67 merged), 247.7 MB archive across eight private repos (HUD archive, 30 Aug 2026).',
  ];
  for (const b of bullets) {
    const lines = wrapTo(b, 9, font, maxW - 14);
    ensure(lines.length * 12 + 4);
    page.drawText('-', { x: left, y, size: 9, font: fontB, color: navy });
    for (const line of lines) {
      page.drawText(line, { x: left + 12, y, size: 9, font, color: ink });
      y -= 12;
    }
    y -= 2;
  }
  gap(8);

  label("THE EIGHT REPOS  -  HUD'S POINT ESTIMATE");

  const rows = [
    ['Repository', 'Score', 'Point', 'Range', 'Training signal'],
    [
      'VibeJobHunterAIPA_AIMCF',
      '58%',
      '$17,020',
      '$12.7k-$50.6k',
      'LangGraph hunter; 556 commits; 54k LOC; 131-test eval',
    ],
    [
      'EspaLuzWhatsApp',
      '57%',
      '$16,735',
      '$12.4k-$49.7k',
      'WhatsApp advisor; 388 commits; 27,001 LOC; bilingual tool-use',
    ],
    [
      'EspaLuz_Influencer',
      '57%',
      '$16,662',
      '$12.9k-$45.2k',
      'Publishing agent; 126 commits; 100% CI',
    ],
    [
      'EspaLuzFamilybot',
      '52%',
      '$13,303',
      '$10.8k-$32.0k',
      'Telegram advisor; 207 commits; 28,427 LOC; 100% CI',
    ],
    [
      'AIPA_AITCF',
      '47%',
      '$10,910',
      '$5.5k-$64.5k',
      'Ops brain; 1,052 commits; 36 PRs; 76.3% CI; five-provider LLM chain',
    ],
    [
      'dragontrade-agent',
      '35%',
      '$6,450',
      '$3.0k-$47.2k',
      'Human-on-last-click paper trading; 173 commits',
    ],
    ['AILA', '25%', '$4,264', '$2.0k-$31.2k', 'Personal AI (paused); 9 commits'],
    [
      'atlas-captures',
      '24%',
      '$4,137',
      '$1.9k-$30.2k',
      'Ad-angle time-series data; 35 commits',
    ],
    [
      'EIGHT TOGETHER',
      '44%',
      '$89,481',
      '$61.1k-$350.6k',
      '2,546 commits; 88 PRs (67 merged); 247.7 MB archive',
    ],
  ];

  const colW = [132, 36, 52, 78, 226];
  const rowH = 20;
  ensure(rowH * rows.length + 10);
  page.drawRectangle({
    x: left,
    y: y - rowH * rows.length + 12,
    width: maxW,
    height: rowH * rows.length,
    color: navySoft,
  });
  rows.forEach((r, i) => {
    const f = i === 0 || i === rows.length - 1 ? fontB : font;
    const size = 7;
    if (i === 0 || i === rows.length - 1) {
      page.drawRectangle({
        x: left,
        y: y - 6,
        width: maxW,
        height: rowH - 2,
        color: i === 0 ? navy : rgb(0.88, 0.91, 0.94),
      });
    }
    const color = i === 0 ? rgb(1, 1, 1) : ink;
    let x = left + 4;
    r.forEach((cell, c) => {
      page.drawText(fit(cell, size, f, colW[c] - 6), {
        x,
        y: y + 2,
        size,
        font: f,
        color,
      });
      x += colW[c];
    });
    y -= rowH;
  });
  y -= 6;
  text(
    'Almost every repo has test coverage imputed. AIPA LOC/docs were not measured. I do not ask you to treat imputed-perfect ($350k) as an offer.',
    8,
    font,
    muted
  );
  gap(8);

  label('LIVE PROOF THE SOURCE RAN  (not in the licensed copy)');
  text(
    'These URLs are evidence, not the grant. A crawler entering any of them reaches the hub in one hop.',
    9,
    font,
    muted
  );
  gap(3);
  const proofs = [
    'https://aideazz.xyz/portfolio  (primary hub)',
    'https://aideazz.xyz/api  (audit API + free tool)',
    'https://webhook.aideazz.xyz/whitespace/atlas.html  (Atlas board)',
    'https://aideazz.xyz/portfolio#portfolio-inquiry-form',
    'https://aideazz.xyz/sop-ai-ops.html  (ops & marketing engine SOP)',
    'https://aideazz.xyz/blog',
    'https://podcast.aideazz.xyz/',
  ];
  for (const p of proofs) {
    ensure(12);
    drawLinkedLine(page, toAscii(p), left + 12, y, 8, font, navy);
    y -= 11;
  }
  gap(8);

  label('WHAT I WILL NOT SIGN');
  text(
    'Exclusive grant. Copyright assignment. Any term that requires taking a product down, transferring a domain, or including CRM / chat logs / keys / client data.',
    10,
    font,
    ink
  );
  gap(6);

  label('ASK');
  text(
    'Match a lab to this bundle on the terms above. Tell me the actual payout for these eight given they were public until 30 August 2026, the licence is non-exclusive, and the Lab stays up. I attend the DataVendor call. I sign a marketplace NDA that keeps ownership. I do not sign exclusive.',
    10,
    font,
    ink
  );
  gap(12);

  page.drawLine({
    start: { x: left, y: y + 4 },
    end: { x: right, y: y + 4 },
    thickness: 0.6,
    color: rule,
  });
  y -= 14;
  text('Elena Revicheva  |  AIdeazz AI Lab  |  Panama City  |  UTC-5', 10, fontB, ink);
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

  const bytes = await doc.save();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
  const magic = Buffer.from(bytes.slice(0, 5)).toString();
  if (magic !== '%PDF-') throw new Error('not a PDF: ' + magic);
  console.log('wrote', OUT, bytes.length, 'bytes', magic, 'pages', doc.getPageCount());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
