#!/usr/bin/env node
/**
 * Gate tests for outreach email attachments (src/go-wa.ts).
 *
 * This is the choke point that decides which bytes leave the box attached to a
 * letter, so it gets tests rather than a manual look. `.docx` support was added
 * for the Datastar NDA — a contract the counterparty still has to sign cannot be
 * flattened to PDF — and widening an allowlist is exactly when the rejections
 * need proving, not just the acceptances.
 *
 * Run: node scripts/test-outreach-attachments.cjs   (needs `npx tsc` first)
 *
 * Importing dist/go-wa.js pulls in the app's module graph, which tries to open an
 * Oracle DB pool. Those NJS-125 / DPI-1047 warnings on stderr are expected off-box
 * noise and do not affect these checks — read the PASS/FAIL line, not the warnings.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist/go-wa.js');
if (!fs.existsSync(DIST)) {
  console.error('dist/go-wa.js missing — run `npx tsc` first');
  process.exit(1);
}

const {
  parseOutreachAttachmentSpec,
  resolveOutreachAttachments,
  outreachAttachmentContentType,
} = require(DIST);

const ATTACH_DIR = path.join(ROOT, 'docs/selling/attachments');
const failures = [];
let passed = 0;

function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failures.push(name);
  }
}

// ---- path/extension gate -------------------------------------------------
const okPdf = parseOutreachAttachmentSpec({ path: 'docs/selling/attachments/a.pdf' });
check('accepts a .pdf in the attachments dir', okPdf && okPdf.filename === 'a.pdf');

const okDocx = parseOutreachAttachmentSpec({ path: 'docs/selling/attachments/nda.docx' });
check('accepts a .docx in the attachments dir', okDocx && okDocx.filename === 'nda.docx');

const okRenamed = parseOutreachAttachmentSpec({
  path: 'docs/selling/attachments/nda.docx',
  filename: 'NDA Datastar firmado.docx',
});
check('allows a friendly display filename', okRenamed && okRenamed.filename === 'NDA Datastar firmado.docx');

for (const [label, spec] of [
  ['rejects a path outside the attachments dir', { path: 'docs/selling/drafts/x.pdf' }],
  ['rejects an absolute path', { path: '/etc/passwd' }],
  ['rejects traversal', { path: 'docs/selling/attachments/../../../etc/passwd' }],
  ['rejects a traversal that also ends in .pdf', { path: 'docs/selling/attachments/../secrets.pdf' }],
  ['rejects an executable', { path: 'docs/selling/attachments/payload.exe' }],
  ['rejects a .zip', { path: 'docs/selling/attachments/bundle.zip' }],
  ['rejects an extensionless file', { path: 'docs/selling/attachments/README' }],
  ['rejects a leading underscore', { path: 'docs/selling/attachments/_hidden.pdf' }],
  ['rejects a NUL byte', { path: 'docs/selling/attachments/a\0.pdf' }],
  ['rejects a non-object spec', 'docs/selling/attachments/a.pdf'],
  [
    'rejects a display name claiming a different type than the file',
    { path: 'docs/selling/attachments/nda.docx', filename: 'nda.pdf' },
  ],
]) {
  check(label, parseOutreachAttachmentSpec(spec) === null);
}

// ---- content type follows the extension ----------------------------------
check('pdf content type', outreachAttachmentContentType('a.pdf') === 'application/pdf');
check(
  'docx content type',
  outreachAttachmentContentType('a.docx') ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);

// ---- magic bytes ---------------------------------------------------------
// A real attachment must BE what its extension says. Written into the live
// attachments dir because resolve() reads from disk, then removed.
const tmpNames = [];
function writeTmp(name, bytes) {
  const p = path.join(ATTACH_DIR, name);
  fs.writeFileSync(p, bytes);
  tmpNames.push(p);
  return `docs/selling/attachments/${name}`;
}

(async () => {
  try {
    fs.mkdirSync(ATTACH_DIR, { recursive: true });

    // Names must start alphanumeric — the allowlist rejects a leading underscore,
    // which is worth knowing before naming a real attachment.
    const goodPdf = writeTmp('zz-test-good.pdf', Buffer.from('%PDF-1.7\n% test\n'));
    const badPdf = writeTmp('zz-test-bad.pdf', Buffer.from('not a pdf at all'));
    const goodDocx = writeTmp('zz-test-good.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]));
    const badDocx = writeTmp('zz-test-bad.docx', Buffer.from('%PDF- pretending to be a docx'));

    const rPdf = await resolveOutreachAttachments([{ path: goodPdf }]);
    check('resolves a real pdf', Array.isArray(rPdf) && rPdf.length === 1);

    const rDocx = await resolveOutreachAttachments([{ path: goodDocx }]);
    check('resolves a real docx', Array.isArray(rDocx) && rDocx.length === 1);

    check('refuses a .pdf that is not a PDF', (await resolveOutreachAttachments([{ path: badPdf }])) === null);
    check('refuses a .docx that is not a zip', (await resolveOutreachAttachments([{ path: badDocx }])) === null);
    check(
      'one bad file refuses the whole list',
      (await resolveOutreachAttachments([{ path: goodPdf }, { path: badPdf }])) === null,
    );
    check('empty list resolves to empty', (await resolveOutreachAttachments([])).length === 0);
    check('missing file refuses', (await resolveOutreachAttachments([{ path: 'docs/selling/attachments/_nope.pdf' }])) === null);

    // ---- the real NDA, if it is staged --------------------------------------
    const ndaRel = 'docs/selling/attachments/04.09.2026_NDA_Datastar_Elena_Revicheva.docx';
    if (fs.existsSync(path.join(ROOT, ndaRel))) {
      const nda = await resolveOutreachAttachments([{ path: ndaRel }]);
      check('resolves the staged Datastar NDA', Array.isArray(nda) && nda.length === 1 && nda[0].bytes > 0);
    } else {
      failures.push(`the Datastar NDA is not staged at ${ndaRel}`);
    }
  } finally {
    for (const p of tmpNames) fs.rmSync(p, { force: true });
  }

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${failures.length + passed}`);
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
  console.log(`PASS: outreach attachment gate — ${passed} checks`);
  console.log('  accepts .pdf and .docx, magic-byte verified');
  console.log('  refuses traversal, absolute paths, .exe/.zip, type-mismatched display names');
})();
