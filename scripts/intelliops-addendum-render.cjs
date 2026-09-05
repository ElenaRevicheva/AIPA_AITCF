#!/usr/bin/env node
/**
 * Render the IntelliOps addendum .docx so it can be read. Cursor cannot
 * preview Word; a text extract cannot show a clipped signature line.
 *
 * Requires: libreoffice-writer, poppler-utils.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs/selling/intelliops');
const PREVIEW = path.join(DIR, 'preview');
const DOCX = 'ADDENDUM_No1_IntelliOps_BD.docx';

function have(bin) {
  try {
    execFileSync('which', [bin], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

for (const bin of ['soffice', 'pdftoppm', 'pdfinfo']) {
  if (!have(bin)) {
    console.error(`missing ${bin}. sudo apt-get install -y libreoffice-writer poppler-utils`);
    process.exit(1);
  }
}

const src = path.join(DIR, DOCX);
if (!fs.existsSync(src)) {
  console.error(`missing ${DOCX} — run python3 scripts/intelliops-addendum-build.py`);
  process.exit(1);
}

fs.mkdirSync(PREVIEW, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'intelliops-addendum-'));
execFileSync(
  'soffice',
  ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', work, src],
  { stdio: 'pipe', timeout: 180000 },
);
const produced = path.join(work, DOCX.replace(/\.docx$/, '.pdf'));
if (!fs.existsSync(produced)) {
  console.error('LibreOffice produced no PDF');
  process.exit(1);
}
const pdfDest = path.join(DIR, DOCX.replace(/\.docx$/, '.pdf'));
fs.copyFileSync(produced, pdfDest);

execFileSync('pdftoppm', ['-png', '-r', '140', produced, path.join(PREVIEW, 'page')], {
  stdio: 'pipe',
});
const pages = fs.readdirSync(PREVIEW).filter((f) => /^page-\d+\.png$/.test(f)).sort();
console.log(`pdf ${pdfDest}  pages ${pages.join(', ')}`);
