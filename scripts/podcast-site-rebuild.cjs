#!/usr/bin/env node
/**
 * podcast-site-rebuild.cjs — regenerate every page of podcast.aideazz.xyz into a LOCAL clone of the
 * aideazz-podcast repo, from the same generators the Voice Growth Engine uses (dist/podcast-feed.js +
 * dist/podcast-publish.js). Pure files in, files out; nothing is pushed — review, commit named files, push.
 *
 *   node scripts/podcast-site-rebuild.cjs --repo=D:/aideazz/aideazz-podcast \
 *        [--hero=<16:9 jpg>] [--square=<1:1 jpg>]
 *
 * --hero   → hero.jpg (1920 wide, q82) — the Atuona still behind the landing hero
 * --square → cover-source.jpg (1500², q86) + cover.png (the lockup composited over it)
 * Without --square the cover is rebuilt from the repo's existing cover-source.jpg (if any).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const repo = arg('repo', 'D:/aideazz/aideazz-podcast');
const heroSrc = arg('hero', '');
const squareSrc = arg('square', '');

const feed = require('../dist/podcast-feed.js');
const pub = require('../dist/podcast-publish.js');

(async () => {
  const sharp = require('sharp');
  const meta = pub.podcastMeta();
  const manifestPath = path.join(repo, 'episodes.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const out = (f, data) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), data); console.log('wrote', f, Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data)); };

  if (heroSrc) {
    out('hero.jpg', await sharp(heroSrc).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  }
  let square = null;
  if (squareSrc) {
    square = await sharp(squareSrc).resize(1500, 1500, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    out('cover-source.jpg', square);
  } else if (fs.existsSync(path.join(repo, 'cover-source.jpg'))) {
    square = fs.readFileSync(path.join(repo, 'cover-source.jpg'));
  }
  out('cover.png', await pub.generateCoverPng(meta, square));

  out('index.html', feed.generateIndexHtml(meta, manifest));
  out('feed.xml', feed.generateFeedXml(meta, manifest));
  out('robots.txt', feed.generateRobotsTxt(meta));
  out('sitemap.xml', feed.generateSitemapXml(meta, manifest));
  out('llms.txt', feed.generateLlmsTxt(meta, manifest));
  for (const e of manifest) out(`episodes/${e.id}.html`, pub.episodePageHtml(meta, e));
  console.log(`done: ${manifest.length} episodes, hero=${!!heroSrc}, cover=${square ? 'atuona' : 'fallback card'}`);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
