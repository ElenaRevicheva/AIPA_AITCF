#!/usr/bin/env node
/**
 * Assert the HUD listing memo is a real PDF and money-safe copy.
 * Rebuilds first. Fail-closed: job-hunt / Nine Systems language is a hard fail.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PDF = path.join(
  ROOT,
  'docs/selling/attachments/HUD_Vendor_NonExclusive_Licence_Brief.pdf'
);
const BUILD = path.join(__dirname, 'build-hud-vendor-brief-pdf.cjs');

const { PDFDocument, PDFName } = require('pdf-lib');

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
  if (missing.length) {
    throw new Error('missing required copy:\n  ' + missing.join('\n  '));
  }
}

function mustNotInclude(text, needles) {
  const hits = needles.filter((n) => text.toLowerCase().includes(n.toLowerCase()));
  if (hits.length) {
    throw new Error('forbidden copy (job-hunt / poison):\n  ' + hits.join('\n  '));
  }
}

const built = spawnSync(process.execPath, [BUILD], { cwd: ROOT, encoding: 'utf8' });
if (built.status !== 0) {
  process.stderr.write(built.stdout + built.stderr);
  process.exit(built.status || 1);
}
process.stdout.write(built.stdout);

const buf = fs.readFileSync(PDF);
if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
if (buf.length < 8000) throw new Error('PDF too thin: ' + buf.length + ' bytes');
if (buf.length > 5 * 1024 * 1024) throw new Error('PDF too large for outreach attach');

const text = extractText(buf);
mustInclude(text, [
  'Non-exclusive training licence',
  'Eight private production repositories',
  '$89,481',
  '$61,067',
  '$350,557',
  '44% Promising',
  '30 August 2026',
  'I will not sign exclusive',
  'https://aideazz.xyz/portfolio',
  'https://aideazz.xyz/api',
  'VibeJobHunterAIPA_AIMCF',
  'EspaLuzWhatsApp',
  'atlas-captures',
  'aipa@aideazz.xyz',
  'Lazarus',
]);
mustNotInclude(text, [
  'Nine Systems',
  'nine-systems',
  'Hire me',
  'job-hunt',
  'job search',
  'I am looking for a job',
  'would fit',
  'code is on GitHub',
  'Elena_Revicheva_Resume',
]);

(async () => {
  const pdf = await PDFDocument.load(buf);
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
  const requiredUris = [
    'https://datavendor.ai/codebases/result',
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
    throw new Error(
      'missing clickable URIs:\n  ' + missingUris.join('\n  ') + '\nfound: ' + uris.join(', ')
    );
  }
  if (uris.length < 11) {
    throw new Error('too few clickable links: ' + uris.length + ' ' + JSON.stringify(uris));
  }
  console.log('ok', PDF, buf.length, 'bytes; extracted', text.length, 'chars; links', uris.length);
  console.log(uris.join('\n'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
