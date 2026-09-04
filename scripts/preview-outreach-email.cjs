#!/usr/bin/env node
/**
 * Show exactly what /go/outreach-email/<slug> would send. Sends nothing.
 *
 *   node scripts/preview-outreach-email.cjs datastar-nda
 *
 * Resolves through the real code path, so recipient, Cc and attachment list are
 * the ones the button will use — not a re-derivation that can disagree with it.
 * A slug whose draft or attachment fails to load resolves to null, which is the
 * same refusal the button makes rather than sending a letter that claims an
 * attachment it does not have.
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

const slug = process.argv[2];
if (!slug) {
  console.error('usage: node scripts/preview-outreach-email.cjs <slug>');
  process.exit(1);
}

const { loadOutreachEmailBySlug } = require(DIST);

(async () => {
  const p = await loadOutreachEmailBySlug(slug);
  if (!p) {
    console.error(`REFUSED: ${slug} does not resolve to a sendable email.`);
    console.error('  Check the registry entry, the draft file, and that every');
    console.error('  listed attachment exists under docs/selling/attachments/.');
    process.exit(1);
  }
  console.log(`--- /go/outreach-email/${slug} ---`);
  console.log(`From    : aipa@aideazz.xyz`);
  console.log(`To      : ${p.to}`);
  console.log(`Cc      : ${p.cc?.length ? p.cc.join(', ') : '(none)'}`);
  console.log(`Subject : ${p.subject}`);
  console.log(`Deal    : ${p.dealId || '(none — no HubSpot stamp, no follow-up task)'}`);
  console.log(
    `Adjunto : ${
      p.attachments?.length
        ? p.attachments.map((a) => `${a.filename} (${a.bytes} bytes)`).join(', ')
        : '(none)'
    }`,
  );
  console.log(`--- body (${p.body.length} chars) ---`);
  console.log(p.body);
})().catch((e) => {
  console.error('preview failed:', e.message);
  process.exit(1);
});
