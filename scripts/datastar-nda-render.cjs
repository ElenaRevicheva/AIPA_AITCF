#!/usr/bin/env node
/**
 * Render the Datastar NDA .docx to a PDF and page images.
 *
 * The .docx is the deliverable — Datastar needs to sign it, so it stays a Word
 * file. But nothing previews .docx (Cursor says "Binary file is not supported"),
 * which makes the document that actually gets sent the one nobody reviews.
 *
 * So this renders the real .docx through LibreOffice rather than rebuilding the
 * text into a lookalike PDF. A reconstruction can be correct about the words and
 * still hide a layout fault — the clipped "Representante Legal" in Datastar's own
 * signature box is invisible in a text extract and obvious in a true render.
 *
 * Requires: libreoffice-writer, poppler-utils.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = path.join(__dirname, "..", "docs/selling/datastar");
const PREVIEW = path.join(DIR, "preview");

const TARGETS = [
  // The deliverable: every page, plus a shipped PDF so it can be read.
  { docx: "NDA_Datastar_Elena_Revicheva_DRAFT.docx", prefix: "page", pdf: true },
  // Their template: only the signature page, which is the evidence that the
  // clipped "Representante Legal" is theirs and not something the fill did.
  { docx: "NDA_Datastar_modelo_recibido.docx", prefix: "original-page", lastPageOnly: true },
];

function have(bin) {
  try {
    execFileSync("which", [bin], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

for (const bin of ["soffice", "pdftoppm", "pdfinfo"]) {
  if (!have(bin)) {
    console.error(`missing ${bin}.`);
    console.error("  sudo apt-get install -y libreoffice-writer poppler-utils");
    process.exit(1);
  }
}

fs.mkdirSync(PREVIEW, { recursive: true });

function pageCount(pdfPath) {
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = info.match(/^Pages:\s+(\d+)$/m);
  if (!m) throw new Error(`pdfinfo gave no page count for ${pdfPath}`);
  return Number(m[1]);
}

for (const { docx, prefix, pdf: shipPdf, lastPageOnly } of TARGETS) {
  const src = path.join(DIR, docx);
  if (!fs.existsSync(src)) {
    console.error(`missing ${docx}`);
    process.exit(1);
  }

  // LibreOffice writes next to --outdir using the source basename.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nda-render-"));
  execFileSync(
    "soffice",
    ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", work, src],
    { stdio: "pipe", timeout: 180000 }
  );
  const producedPdf = path.join(work, docx.replace(/\.docx$/, ".pdf"));
  if (!fs.existsSync(producedPdf)) {
    console.error(`LibreOffice produced no PDF for ${docx}`);
    process.exit(1);
  }

  if (shipPdf) {
    fs.copyFileSync(producedPdf, path.join(DIR, docx.replace(/\.docx$/, ".pdf")));
  }

  // Clear stale pages first: a shorter document would otherwise leave an old
  // trailing page behind and the previews would disagree with the document.
  for (const f of fs.readdirSync(PREVIEW)) {
    if (new RegExp(`^${prefix}-?\\d+\\.png$`).test(f)) fs.unlinkSync(path.join(PREVIEW, f));
  }

  const range = lastPageOnly ? ["-f", String(pageCount(producedPdf)), "-l", String(pageCount(producedPdf))] : [];
  execFileSync(
    "pdftoppm",
    ["-png", "-r", "130", ...range, producedPdf, path.join(PREVIEW, prefix)],
    { stdio: "pipe", timeout: 180000 }
  );

  // pdftoppm zero-pads (page-01.png); normalise so links stay predictable.
  for (const f of fs.readdirSync(PREVIEW)) {
    const m = f.match(new RegExp(`^${prefix}-0*(\\d+)\\.png$`));
    if (m) fs.renameSync(path.join(PREVIEW, f), path.join(PREVIEW, `${prefix}${m[1]}.png`));
  }

  const pages = fs
    .readdirSync(PREVIEW)
    .filter((f) => new RegExp(`^${prefix}\\d+\\.png$`).test(f))
    .sort();
  console.log(`${docx} -> ${pages.length} page(s): ${pages.join(", ")}`);
  fs.rmSync(work, { recursive: true, force: true });
}
