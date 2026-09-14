#!/usr/bin/env node
/**
 * Gate: Atlas lexical fallback must travel as LF.
 *
 * Git stores LF. Oracle scp / Windows autocrlf write CRLF. Identical
 * classify.ts then hashes differently, and a checkout looks like it dropped
 * v1-lexical. This proves the normalizer and that the parked patches are LF.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NORM = path.join(__dirname, 'oracle-resilience/lib/lf-normalize.py');
const PATCH_DIR = path.join(__dirname, 'atlas-patches');
const ATTR = path.join(ROOT, '.gitattributes');

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`ok  ${name}`);
  else {
    console.error(`NOT OK  ${name}`);
    failed++;
  }
}

function runNorm(args, extra = {}) {
  return execFileSync('python3', [NORM, ...args], {
    encoding: 'utf8',
    ...extra,
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-eol-'));
try {
  const crlfPath = path.join(tmp, 'crlf.ts');
  const lfPath = path.join(tmp, 'lf.ts');
  const bomPath = path.join(tmp, 'bom.ts');
  const body = 'export const ANGLE_VERSION = "v1-lexical";\n';
  fs.writeFileSync(crlfPath, body.replace(/\n/g, '\r\n'));
  fs.writeFileSync(lfPath, body);
  fs.writeFileSync(bomPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)]));

  const before = runNorm([crlfPath, lfPath, bomPath]);
  check('reports CRLF as NEEDS_NORM', /NEEDS_NORM .*crlf\.ts/.test(before) && /crlf=1/.test(before));
  const lfLine = before.split('\n').find((l) => /\/lf\.ts /.test(l)) || '';
  check('reports LF as LF', /^LF /.test(lfLine));
  check('reports BOM as NEEDS_NORM', /NEEDS_NORM .*bom\.ts/.test(before) && /bom=1/.test(before));

  let checkRc = 0;
  try {
    runNorm(['--check', crlfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    checkRc = e.status;
  }
  check('--check fails on CRLF', checkRc === 1);

  runNorm(['--strip', crlfPath, bomPath]);
  const stripped = fs.readFileSync(crlfPath);
  const strippedBom = fs.readFileSync(bomPath);
  const want = Buffer.from(body);
  check('strip CRLF → exact LF bytes', Buffer.compare(stripped, want) === 0);
  check('strip BOM → exact LF bytes', Buffer.compare(strippedBom, want) === 0);
  check('strip is idempotent', runNorm(['--check', crlfPath, bomPath, lfPath]).includes('LF '));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const patches = fs
  .readdirSync(PATCH_DIR)
  .filter((n) => n.endsWith('.patch'))
  .map((n) => path.join(PATCH_DIR, n));
check('parked at least the two classify patches', patches.length >= 2);

for (const p of patches) {
  const buf = fs.readFileSync(p);
  check(`${path.basename(p)} has zero CR`, !buf.includes(0x0d));
  check(`${path.basename(p)} is UTF-8 LF via normalizer`, runNorm(['--check', p]).startsWith('LF '));
}

const p1 = fs.readFileSync(path.join(PATCH_DIR, '0001-classify-embed-failover.patch'), 'utf8');
const p2 = fs.readFileSync(path.join(PATCH_DIR, '0002-gemini-embedding-001.patch'), 'utf8');
check('0001 carries v1-lexical', p1.includes('v1-lexical'));
check('0001 carries isEmbedQuotaError', p1.includes('isEmbedQuotaError'));
check('0002 carries gemini-embedding-001', p2.includes('gemini-embedding-001'));

const attr = fs.readFileSync(ATTR, 'utf8');
check('AIPA .gitattributes pins atlas-patches to LF', /scripts\/atlas-patches\/\*\.patch\s+text\s+eol=lf/.test(attr));
check('AIPA .gitattributes pins oracle-resilience shells to LF', /scripts\/oracle-resilience\/\*\.sh\s+text\s+eol=lf/.test(attr));

const push = fs.readFileSync(path.join(__dirname, 'oracle-resilience/push-atlas-patch.sh'), 'utf8');
check('push-atlas-patch strips CR before apply', push.includes('lf-normalize.py'));
check('push-atlas-patch still greps v1-lexical in dist', push.includes("grep -q 'v1-lexical' dist/classify.js"));

const sync = fs.readFileSync(path.join(__dirname, 'oracle-resilience/sync-atlas-encoding.sh'), 'utf8');
check('encoding-sync does not re-run classify', !/node dist\/classify\.js/.test(sync));
check('encoding-sync does not restart PM2', !/pm2 restart/.test(sync));
check('encoding-sync checks out origin/main src when CR-only', sync.includes('checkout origin/main --'));
check('encoding-sync rebuilds dist if lexical vanished', sync.includes('dist missing lexical failover'));

const conf = fs.readFileSync(path.join(__dirname, 'oracle-resilience/oracle-products.conf'), 'utf8');
check('atlas deploy BUILD calls post-pull dist guard', /PRODUCT_atlas_BUILD=/.test(conf) && /atlas-post-pull-dist\.sh/.test(conf));
const postPull = fs.readFileSync(path.join(__dirname, 'oracle-resilience/atlas-post-pull-dist.sh'), 'utf8');
check('post-pull greps v1-lexical', postPull.includes('v1-lexical'));
check('post-pull rebuilds dist if markers missing', postPull.includes('lost lexical failover'));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
