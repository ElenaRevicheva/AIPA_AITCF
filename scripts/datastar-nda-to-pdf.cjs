#!/usr/bin/env node
/**
 * Render the filled Datastar NDA to a readable PDF.
 *
 * The .docx is what Datastar gets (they may edit and sign it). Cursor and most
 * previewers cannot display .docx at all, so this PDF exists to be read and
 * checked before sending.
 *
 * Text comes from the .txt extract, which is generated FROM the .docx — so the
 * PDF cannot drift from the document that actually gets attached.
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const DIR = path.join(__dirname, "..", "docs/selling/datastar");
const SRC = path.join(DIR, "NDA_Datastar_Elena_Revicheva_DRAFT.txt");
const OUT = path.join(DIR, "NDA_Datastar_Elena_Revicheva_DRAFT.pdf");

const PAGE = { w: 595.28, h: 841.89 }; // A4
const MARGIN = { x: 64, top: 64, bottom: 64 };
const SIZE = 9.5;
const LEAD = 13.5;

// Values filled from the cédula and the published RUC. Highlighted so a reader
// can check them at a glance instead of re-reading the whole party clause.
const FILLED = [
  "Elena Revicheva",
  "de nacionalidad rusa",
  "persona natural extranjera",
  "ocupación 21320 - Programadores Informáticos",
  "E-8-245573",
  "ELENA REVICHEVA",
  "8-NT-2-781965 DV 90",
  "AIdeazz",
  "Costa del Este",
  "Calle Principal",
  "Juan Díaz",
  "4 días del mes de septiembre de 2026",
];

/** pdf-lib's WinAnsi encoder throws on anything outside cp1252. */
function toWinAnsi(s) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ");
}

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const attempt = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(attempt, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The .docx puts the two signature boxes side by side; the .txt cannot. */
const SIGNATURE_BLOCK = [
  "Datastar Panamá S.A.",
  "Conrado José Quiroga Granillo",
  "Representante Legal",
  "ELENA REVICHEVA",
  "Elena Revicheva",
  "Representante Legal",
];

async function main() {
  const raw = toWinAnsi(fs.readFileSync(SRC, "utf8"));
  const all = raw.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);

  const tail = all.slice(-SIGNATURE_BLOCK.length);
  const expected = SIGNATURE_BLOCK.map(toWinAnsi);
  if (tail.join("|") !== expected.join("|")) {
    throw new Error(
      `signature block changed shape, refusing to render:\n  got: ${tail.join(" | ")}`
    );
  }
  const blocks = all.slice(0, -SIGNATURE_BLOCK.length);

  const pdf = await PDFDocument.create();
  pdf.setTitle("Acuerdo de Confidencialidad - Datastar Panama S.A. / Elena Revicheva");
  pdf.setAuthor("Elena Revicheva");
  pdf.setSubject("NDA draft filled from cedula E-8-245573 and RUC 8-NT-2-781965 DV 90");

  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE.w - MARGIN.x * 2;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN.top;

  function newPage() {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - MARGIN.top;
  }

  function ensure(space) {
    if (y - space < MARGIN.bottom) newPage();
  }

  /** Draw a line, yellow-highlighting any filled value inside it. */
  function drawHighlighted(line, font, size, x, yy) {
    const hits = [];
    for (const value of FILLED) {
      const v = toWinAnsi(value);
      let from = 0;
      for (;;) {
        const i = line.indexOf(v, from);
        if (i === -1) break;
        hits.push([i, i + v.length]);
        from = i + v.length;
      }
    }
    for (const [start, end] of hits) {
      const before = font.widthOfTextAtSize(line.slice(0, start), size);
      const width = font.widthOfTextAtSize(line.slice(start, end), size);
      page.drawRectangle({
        x: x + before,
        y: yy - 2.5,
        width,
        height: size + 1.5,
        color: rgb(1, 0.95, 0.55),
      });
    }
    page.drawText(line, { x, y: yy, size, font, color: rgb(0.07, 0.07, 0.07) });
  }

  for (const block of blocks) {
    const isTitle = block === "ACUERDO CONFIDENCIALIDAD";
    const font = isTitle ? bold : body;
    const size = isTitle ? 13 : SIZE;

    if (isTitle) {
      ensure(LEAD * 3);
      const w = font.widthOfTextAtSize(block, size);
      page.drawText(block, {
        x: (PAGE.w - w) / 2,
        y,
        size,
        font,
        color: rgb(0.07, 0.07, 0.07),
      });
      y -= LEAD * 2;
      continue;
    }

    for (const line of wrap(block, font, size, maxWidth)) {
      ensure(LEAD);
      drawHighlighted(line, font, size, MARGIN.x, y);
      y -= LEAD;
    }
    y -= LEAD * 0.6;
  }

  // Two signature boxes, side by side, as in the .docx.
  const boxW = (maxWidth - 28) / 2;
  const boxH = 96;
  ensure(boxH + LEAD * 2);
  y -= LEAD * 2;
  const boxTop = y;
  [
    { title: expected[0], name: expected[1], role: expected[2] },
    { title: expected[3], name: expected[4], role: expected[5] },
  ].forEach((box, i) => {
    const x = MARGIN.x + i * (boxW + 28);
    page.drawRectangle({
      x,
      y: boxTop - boxH,
      width: boxW,
      height: boxH,
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.75,
    });
    // signature rule
    page.drawLine({
      start: { x: x + 18, y: boxTop - 38 },
      end: { x: x + boxW - 18, y: boxTop - 38 },
      thickness: 0.75,
      color: rgb(0.6, 0.6, 0.6),
    });
    const rows = [
      { text: box.title, font: bold, size: SIZE },
      { text: box.name, font: body, size: SIZE },
      { text: box.role, font: body, size: SIZE },
    ];
    let ry = boxTop - 54;
    for (const row of rows) {
      const w = row.font.widthOfTextAtSize(row.text, row.size);
      drawHighlighted(row.text, row.font, row.size, x + (boxW - w) / 2, ry);
      ry -= LEAD;
    }
  });
  y = boxTop - boxH - LEAD;

  // Footer note on every page: this is a draft for reading, not the attachment.
  const note =
    "Borrador para revision. Se envia el .docx. Cedula E-8-245573 (frente del carne). RUC 8-NT-2-781965 DV 90.";
  for (const p of pdf.getPages()) {
    p.drawText(toWinAnsi(note), {
      x: MARGIN.x,
      y: 34,
      size: 7,
      font: body,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  fs.writeFileSync(OUT, await pdf.save());
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${pdf.getPageCount()} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
