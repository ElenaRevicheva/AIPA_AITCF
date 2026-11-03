#!/usr/bin/env node
/**
 * photos-to-pdf.cjs — many photos → ONE PDF, one photo per page, in file-name order (3 Nov 2026).
 *
 *   node scripts/photos-to-pdf.cjs <inputDir> <out.pdf> [--max-bytes=49000000]
 *
 * Elena photographs a stack of paper (30, 40, more) and sends it to CTO AIPA; the bot saves the photos as 0001.jpg,
 * 0002.png … in the order she sent them and calls this. Each page is A4 portrait and the photo is fitted inside it with
 * its own proportions (a landscape photo is turned 90° rather than shrunk to a strip), so the file prints as it reads.
 * JPEG is embedded as is (no recompression, no quality loss); PNG through embedPng.
 *
 * Fail closed: one photo that cannot be read stops the whole run and names its number — never a PDF that silently
 * lacks a page. Over --max-bytes (Telegram's bot upload limit is 50 MB) the output is split into <out>-part1.pdf,
 * -part2.pdf … in the same order; nothing is dropped. Every written file is read back and its pages counted.
 *
 * stdout: one JSON line {ok, pages, bytes, files:[{file, pages, bytes}]} or {ok:false, error, photo?}.
 * Needs pdf-lib (NODE_PATH, or the kit's ~/cv-build-deps like build-lane-cv.cjs). Prints no file names or contents
 * beyond its JSON line.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const deps = path.join(os.homedir(), 'cv-build-deps', 'node_modules');
if (fs.existsSync(deps) && !module.paths.includes(deps)) module.paths.push(deps);
const { PDFDocument } = require('pdf-lib');

const A4 = [595.28, 841.89];
const MARGIN = 18;
const PHOTO_RE = /\.(jpe?g|png)$/i;

function fail(error, photo) {
  process.stdout.write(JSON.stringify(photo ? { ok: false, error, photo } : { ok: false, error }) + '\n');
  process.exit(1);
}

/** The first bytes decide the type, not the name (a .jpg that is really a PNG is still embedded). */
function kindOf(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

async function addPhoto(doc, buf, n) {
  const kind = kindOf(buf);
  if (!kind) fail('not a JPEG or PNG image', n);
  // A copy: pdf-lib reads the Buffer's whole ArrayBuffer from offset 0, and a small file's Buffer sits inside Node's
  // shared pool at another offset ("SOI not found in JPEG").
  const bytes = new Uint8Array(buf);
  let img;
  try { img = kind === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes); }
  catch (e) { fail(`could not read the image (${String(e && e.message || e).slice(0, 80)})`, n); }
  const page = doc.addPage(A4);
  const boxW = A4[0] - 2 * MARGIN, boxH = A4[1] - 2 * MARGIN;
  const turn = img.width > img.height; // landscape photo → rotate onto the portrait page
  const w = turn ? img.height : img.width, h = turn ? img.width : img.height;
  const s = Math.min(boxW / w, boxH / h);
  const dw = w * s, dh = h * s;
  const x = (A4[0] - dw) / 2, y = (A4[1] - dh) / 2;
  if (turn) {
    // Rotating 90° about the image's lower-left corner swings it left; shift right by the drawn width.
    page.drawImage(img, { x: x + dw, y, width: dh, height: dw, rotate: { type: 'degrees', angle: 90 } });
  } else {
    page.drawImage(img, { x, y, width: dw, height: dh });
  }
}

async function writeDoc(photos, file) {
  const doc = await PDFDocument.create();
  doc.setTitle('Photos');
  doc.setProducer('AIdeazz photos-to-pdf');
  for (const p of photos) await addPhoto(doc, p.buf, p.n);
  const bytes = await doc.save();
  fs.writeFileSync(file + '.part', bytes);
  fs.renameSync(file + '.part', file);
  const back = await PDFDocument.load(fs.readFileSync(file));
  if (back.getPageCount() !== photos.length) fail(`read back ${back.getPageCount()} pages, expected ${photos.length}`);
  return { file, pages: photos.length, bytes: bytes.length };
}

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const maxArg = process.argv.find((a) => a.startsWith('--max-bytes='));
  const maxBytes = maxArg ? Number(maxArg.split('=')[1]) : 49_000_000;
  const [dir, out] = args;
  if (!dir || !out) fail('usage: photos-to-pdf.cjs <inputDir> <out.pdf> [--max-bytes=N]');
  if (!fs.existsSync(dir)) fail('input folder not found');
  if (!Number.isFinite(maxBytes) || maxBytes < 1_000_000) fail('--max-bytes must be at least 1000000');

  const names = fs.readdirSync(dir).filter((f) => PHOTO_RE.test(f)).sort();
  if (!names.length) fail('no JPEG or PNG photos in the folder');
  const photos = names.map((f, i) => ({ n: i + 1, buf: fs.readFileSync(path.join(dir, f)) }));

  // Plan the parts from the photos' own sizes (embedded JPEG = its bytes; PNG is re-deflated, close to its bytes), with
  // room for page overhead. Then each part is checked after writing; a part still over the limit is a failure, not a
  // silent oversize send.
  const budget = maxBytes * 0.95;
  const parts = [];
  let cur = [], size = 0;
  for (const p of photos) {
    if (p.buf.length > budget) fail('this one photo is bigger than the size limit by itself', p.n);
    if (cur.length && size + p.buf.length > budget) { parts.push(cur); cur = []; size = 0; }
    cur.push(p); size += p.buf.length + 2048;
  }
  parts.push(cur);

  const base = out.replace(/\.pdf$/i, '');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const file = parts.length === 1 ? out : `${base}-part${i + 1}.pdf`;
    const r = await writeDoc(parts[i], file);
    if (r.bytes > maxBytes) fail(`part ${i + 1} came out at ${r.bytes} bytes, over the ${maxBytes} limit`);
    files.push(r);
  }
  const pages = files.reduce((a, f) => a + f.pages, 0);
  if (pages !== photos.length) fail(`wrote ${pages} pages for ${photos.length} photos`);
  process.stdout.write(JSON.stringify({ ok: true, pages, bytes: files.reduce((a, f) => a + f.bytes, 0), files }) + '\n');
})().catch((e) => fail(String(e && e.message || e).slice(0, 200)));
