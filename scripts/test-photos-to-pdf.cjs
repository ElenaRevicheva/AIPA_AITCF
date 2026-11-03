#!/usr/bin/env node
/**
 * test-photos-to-pdf.cjs — proves scripts/photos-to-pdf.cjs keeps every photo, in order (3 Nov 2026).
 *
 *   NODE_PATH=<folder with pdf-lib> node scripts/test-photos-to-pdf.cjs
 *
 * 45 photos (PNG, each a different width so its place can be checked, plus JPEGs at fixed places): 45 A4 pages in the
 * same order; a landscape photo still lands on a portrait page; a tight size limit splits into parts that together hold
 * all 45 in order; one broken photo stops the run and names its number, with no PDF written.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const deps = path.join(os.homedir(), 'cv-build-deps', 'node_modules');
if (fs.existsSync(deps) && !module.paths.includes(deps)) module.paths.push(deps);
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');

const SCRIPT = path.join(__dirname, 'photos-to-pdf.cjs');
// 16×12 baseline JPEG.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDCooorzj7E/9k=', 'base64');
const JPEG_AT = new Set([5, 17, 33, 45]); // 1-based places that get the JPEG (16 wide)

let failed = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
}

/** A plain RGB PNG of w×h with random-looking noise (so its size grows with the area). */
function png(w, h, seed) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); let s = seed;
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) { s = (s * 1103515245 + 12345) & 0x7fffffff; raw[y * (w * 3 + 1) + 1 + x] = s >>> 23; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

function run(dir, out, extra = []) {
  try { return JSON.parse(execFileSync(process.execPath, [SCRIPT, dir, out, ...extra], { encoding: 'utf8' }).trim().split('\n').pop()); }
  catch (e) { return JSON.parse(String(e.stdout || '').trim().split('\n').pop() || '{}'); }
}

/** Widths of the image drawn on each page, in page order (one image per page). */
async function pageImageWidths(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file));
  return doc.getPages().map((p) => {
    const xo = p.node.Resources().lookup(PDFName.of('XObject'));
    const [ref] = xo.values();
    const stream = doc.context.lookup(ref, PDFRawStream);
    return { w: stream.dict.lookup(PDFName.of('Width')).asNumber(), size: p.getSize() };
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2p-test-'));
  try {
    const dir = path.join(tmp, 'in');
    fs.mkdirSync(dir);
    const want = [];
    for (let i = 1; i <= 45; i++) {
      const name = String(i).padStart(4, '0');
      if (JPEG_AT.has(i)) { fs.writeFileSync(path.join(dir, `${name}.jpg`), JPEG); want.push(16); }
      else if (i === 2) { fs.writeFileSync(path.join(dir, `${name}.png`), png(300, 120, i)); want.push(300); } // landscape
      else { fs.writeFileSync(path.join(dir, `${name}.png`), png(100 + i, 140, i)); want.push(100 + i); }
    }

    const out = path.join(tmp, 'all.pdf');
    const r = run(dir, out);
    check('45 photos → ok', r.ok === true, JSON.stringify(r).slice(0, 160));
    check('one file, 45 pages', r.files && r.files.length === 1 && r.pages === 45, `pages=${r.pages}`);
    const got = await pageImageWidths(out);
    check('pages in the order sent', JSON.stringify(got.map((g) => g.w)) === JSON.stringify(want));
    check('every page A4 portrait', got.every((g) => Math.round(g.size.width) === 595 && Math.round(g.size.height) === 842));

    // A tight limit: the same 45 photos split into parts, nothing dropped, order kept across parts.
    const big = path.join(tmp, 'split.pdf');
    const s = run(dir, big, ['--max-bytes=1000000']);
    const total = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
    check('split run ok', s.ok === true, JSON.stringify(s).slice(0, 160));
    check('split into 2+ parts (photos total ' + total + ' bytes)', s.files && s.files.length >= 2, `parts=${s.files && s.files.length}`);
    const across = [];
    for (const f of s.files || []) across.push(...(await pageImageWidths(f.file)).map((g) => g.w));
    check('parts together: 45 pages, same order', JSON.stringify(across) === JSON.stringify(want));
    check('every part under the limit', (s.files || []).every((f) => f.bytes <= 1_000_000));

    // One broken photo (#23): stop, name it, write nothing.
    const bad = path.join(tmp, 'bad');
    fs.mkdirSync(bad);
    for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(bad, f));
    fs.writeFileSync(path.join(bad, '0023.png'), Buffer.from('this is not an image'));
    const badOut = path.join(tmp, 'bad.pdf');
    const b = run(bad, badOut);
    check('broken photo → refused', b.ok === false && b.photo === 23, JSON.stringify(b).slice(0, 160));
    check('no PDF left behind', !fs.existsSync(badOut));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
