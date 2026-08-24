#!/usr/bin/env node
/**
 * Wrap the "Nine Systems and Why They Exist" artifact fragment into a standalone
 * page fit for a phone browser, then report what it contains.
 *
 * The artifact version (docs/strategy/aideazz-provenance.html) is the source of
 * truth and is what gets republished as a Claude Code artifact. The artifact
 * renderer supplies its own <head>, so that file is a fragment: no doctype, no
 * viewport. Serving the fragment directly makes phones render it desktop-width.
 *
 *   node scripts/build-provenance-page.cjs
 *   scp docs/strategy/aideazz-provenance.standalone.html \
 *       oracle-cto-aipa:/var/www/aideazz-docs/nine-systems.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs/strategy/aideazz-provenance.html');
const OUT = path.join(ROOT, 'docs/strategy/aideazz-provenance.standalone.html');

const DESC =
  'Nine production AI systems built solo in Panama - the need behind each, ' +
  'how it was designed, its repo, live link, and what it does in production.';

let src = fs.readFileSync(SRC, 'utf8');

if (!src.trimStart().startsWith('<title>')) {
  console.error('ABORT: source no longer starts with <title> — head shape changed');
  process.exit(1);
}

const WRAP = '<div class="wrap">';
if (src.split(WRAP).length - 1 !== 1) {
  console.error('ABORT: <div class="wrap"> is not unique — cannot place </head>');
  process.exit(1);
}

const head =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<meta name="robots" content="noindex, nofollow, noarchive">\n' +
  `<meta name="description" content="${DESC}">\n` +
  '<meta property="og:type" content="article">\n' +
  '<meta property="og:title" content="Nine Systems and Why They Exist">\n' +
  `<meta property="og:description" content="${DESC}">\n`;

let out = head + src;
out = out.replace(WRAP, '</head>\n<body>\n' + WRAP);
out = out.trimEnd() + '\n</body>\n</html>\n';

fs.writeFileSync(OUT, out);

// A link with no target="_blank" is a link that does nothing inside a sandboxed
// artifact iframe, and a bare URL is not a link at all. Both fail silently, so
// they are counted on every build rather than eyeballed.
const anchors = out.match(/<a [^>]*>/g) || [];
const withHref = anchors.filter((a) => /href=/.test(a));
const missingTarget = withHref.filter((a) => !/target=/.test(a));
const stripped = out
  .replace(/<a [^>]*>[\s\S]*?<\/a>/g, '@')
  .replace(/<head[\s\S]*?<\/head>/g, '');
const bare = [...stripped.matchAll(/\b[a-z0-9-]+\.(?:xyz|com|app|io|net|org)\b(?:\/[A-Za-z0-9._~:/?#-]*)?/g)]
  .map((m) => m[0]);

console.log(`wrote ${OUT}`);
console.log(`  bytes           : ${Buffer.byteLength(out)}`);
console.log(`  links           : ${withHref.length}`);
console.log(`  missing target  : ${missingTarget.length}`);
console.log(`  bare URLs left  : ${bare.length ? bare.join(', ') : 'none'}`);
console.log(`  open/close <a>  : ${anchors.length}/${(out.match(/<\/a>/g) || []).length}`);

if (missingTarget.length || bare.length) {
  console.error('FAIL: unclickable links present');
  process.exit(1);
}
