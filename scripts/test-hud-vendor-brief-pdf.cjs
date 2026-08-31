#!/usr/bin/env node
/**
 * Assert the HUD listing memo is a real PDF and money-safe copy.
 * Rebuilds first. Fail-closed: job-hunt / Nine Systems / confession-box language.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { PDFDocument, PDFName } = require('pdf-lib');

const ROOT = path.join(__dirname, '..');
const PDF = path.join(
  ROOT,
  'docs/selling/attachments/HUD_Vendor_NonExclusive_Licence_Brief.pdf'
);
const SHOT = path.join(
  ROOT,
  'docs/selling/attachments/sources/hud-datavendor-estimate-2026-08-31.png'
);
const BUILD = path.join(__dirname, 'build-hud-vendor-brief-pdf.cjs');

function extractText(buf) {
  const s = buf.toString('latin1');
  const chunks = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(s))) {
    const raw = Buffer.from(m[1], 'latin1');
    let decoded = raw;
    try {
      decoded = zlib.inflateSync(raw);
    } catch {
      try {
        decoded = zlib.unzipSync(raw);
      } catch {
        /* leave raw */
      }
    }
    const t = decoded.toString('latin1');
    const hex = [...t.matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) =>
      Buffer.from(x[1], 'hex').toString('latin1')
    );
    const paren = [...t.matchAll(/\(([^)\\]*)\)/g)].map((x) => x[1]);
    chunks.push([...hex, ...paren].join(' '));
  }
  return chunks.join('\n').replace(/\s+/g, ' ');
}

function mustInclude(text, needles) {
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length) throw new Error('missing required copy:\n  ' + missing.join('\n  '));
}

function mustNotInclude(text, needles) {
  const hits = needles.filter((n) => text.toLowerCase().includes(n.toLowerCase()));
  if (hits.length) throw new Error('forbidden copy:\n  ' + hits.join('\n  '));
}

if (!fs.existsSync(SHOT)) throw new Error('missing estimate screenshot: ' + SHOT);

const built = spawnSync(process.execPath, [BUILD], { cwd: ROOT, encoding: 'utf8' });
if (built.status !== 0) {
  process.stderr.write(built.stdout + built.stderr);
  process.exit(built.status || 1);
}
process.stdout.write(built.stdout);

const buf = fs.readFileSync(PDF);
if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
if (buf.length < 80000) throw new Error('PDF too thin to contain the screenshot: ' + buf.length);
if (buf.length > 5 * 1024 * 1024) throw new Error('PDF too large for outreach attach');

const text = extractText(buf);
mustInclude(text, [
  'Non-exclusive',
  '$89,481',
  '$61,067',
  '$350,557',
  '44%',
  'I do not sign exclusive',
  'https://aideazz.xyz/portfolio',
  'https://aideazz.xyz/api',
  'VibeJobHunterAIPA_AIMCF',
  'EspaLuzWhatsApp',
  'atlas-captures',
  'aipa@aideazz.xyz',
  'Lazarus',
  'WHY IT WAS BUILT',
  'HOW IT RUNS NOW',
  'pgvector',
  '131-test',
  'paper trading',
]);
mustNotInclude(text, [
  'Nine Systems',
  'nine-systems',
  'Hire me',
  'job-hunt',
  'I am looking for a job',
  'would fit',
  'code is on GitHub',
  'Elena_Revicheva_Resume',
  'DO NOT HIDE THIS',
  'were public GitHub until',
  'never-public',
  'GitHub Archive',
  'I flipped them to private',
  'Would fit',
  'whiteboard',
]);

(async () => {
  const pdf = await PDFDocument.load(buf);
  if (pdf.getPageCount() < 2) throw new Error('expected at least 2 pages');
  const uris = [];
  for (const page of pdf.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!annots || !annots.asArray) continue;
    for (const ref of annots.asArray()) {
      const dict = page.doc.context.lookup(ref);
      const action = dict.lookup(PDFName.of('A'));
      const uriObj = action && action.lookup(PDFName.of('URI'));
      const uri = uriObj && (uriObj.decodeText ? uriObj.decodeText() : String(uriObj));
      if (uri) uris.push(uri.replace(/^\(|\)$/g, ''));
    }
  }
  if (uris.some((u) => u.includes('/codebases/result'))) {
    throw new Error('dead session URL must not be a clickable link: ' + uris.join(', '));
  }
  const requiredUris = [
    'https://aideazz.xyz/portfolio',
    'https://aideazz.xyz/api',
    'https://webhook.aideazz.xyz/whitespace/atlas.html',
    'https://aideazz.xyz/portfolio#portfolio-inquiry-form',
    'https://aideazz.xyz/sop-ai-ops.html',
    'https://aideazz.xyz/blog',
    'https://podcast.aideazz.xyz/',
    'mailto:aipa@aideazz.xyz',
    'https://cal.com/team/hud/talk-to-us-data-vendor-platform',
  ];
  const missingUris = requiredUris.filter((u) => !uris.includes(u));
  if (missingUris.length) {
    throw new Error('missing clickable URIs:\n  ' + missingUris.join('\n  ') + '\nfound: ' + uris.join(', '));
  }
  console.log('ok', PDF, buf.length, 'bytes; pages', pdf.getPageCount(), '; links', uris.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
