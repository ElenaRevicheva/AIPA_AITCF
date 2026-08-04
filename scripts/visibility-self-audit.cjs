#!/usr/bin/env node
/**
 * visibility-self-audit.cjs — run the AEO/GEO/Tech-SEO engine against OUR OWN properties.
 *
 * "First, for our own AIdeazz AI Lab visibility": the engine that sells visibility
 * audits must keep its own house in order. Runs in CI (see
 * .github/workflows/visibility-self-audit.yml) where the runner has open egress.
 *
 * Usage: node scripts/visibility-self-audit.cjs [url ...]
 * With no args, audits the default AIdeazz property list.
 * Exit code 1 if any property grades below B (70) — so the scheduled run fails loudly.
 */
const { runVisibilityAudit, ENGINE_VERSION } = require('../dist/visibility-audit.js');

// enforce: fail the CI run if this property drops below the floor.
// atuona.xyz is deployed from a different repo — report it, don't gate on it here.
//
// /portfolio leads the list: it is the hub buyers land on and the page we want
// assistants to cite (see .cursor/rules/portfolio-first.mdc). The apex is the vision
// site and supports it.
//
// These routes get a standalone static identity from the aideazz repo's
// `scripts/prerender-routes.mjs`. Auditing the apex alone proved nothing about them:
// 4everland serves one index.html for every route, so a prerender regression ships
// homepage identity on a money page while the apex keeps scoring A+.
const DEFAULT_TARGETS = [
  { url: 'https://aideazz.xyz/portfolio', enforce: true },
  { url: 'https://aideazz.xyz', enforce: true },
  { url: 'https://aideazz.xyz/api', enforce: true },
  { url: 'https://aideazz.xyz/blog', enforce: true },
  // The three proof surfaces the portfolio links to. They were unaudited until
  // Aug 4 2026 and had drifted — a proof link that scores worse than the page
  // citing it is worse than no proof link, so they are enforced like the rest.
  { url: 'https://aideazz.xyz/sop-ai-ops.html', enforce: true },
  { url: 'https://podcast.aideazz.xyz/', enforce: true },
  { url: 'https://webhook.aideazz.xyz/cto/v1/visibility', enforce: true },
  // Report-only: Atlas is a static board in the whitespace repo and atuona is
  // out of scope by request. Both are tracked so the numbers stay visible.
  { url: 'https://webhook.aideazz.xyz/whitespace/atlas.html', enforce: false },
  { url: 'https://atuona.xyz', enforce: false },
];

const PASS_SCORE = 70; // grade B — our own properties must not slip below this

// Checks whose `detail` IS the crawler-visible identity of the page. A route that
// silently falls back to the homepage template still scores A+, so print the
// evidence: a wrong title or a homepage word-count on /portfolio is the regression.
const IDENTITY_CHECKS = ['title', 'meta-description', 'json-ld', 'ssr-content'];

function printIdentity(result) {
  for (const id of IDENTITY_CHECKS) {
    const check = result.checks.find((c) => c.id === id);
    if (check) console.log(`   ${id}: ${check.detail}`);
  }
}

/**
 * The score floor cannot catch the failure it was built to catch. A route missing
 * from prerender-routes.mjs inherits the homepage template and scores A+ — because it
 * IS the A+ homepage. Identical crawler-visible identity is the only signal that
 * exposes it: two routes with the same <title> are one page to an AI engine.
 */
function findIdentityCollisions(audited) {
  const byTitle = new Map();
  for (const row of audited) {
    const title = (row.identity?.title ?? '').trim().toLowerCase();
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(row);
  }
  return [...byTitle.values()].filter((rows) => rows.length > 1);
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args.map((url) => ({ url, enforce: true })) : DEFAULT_TARGETS;
  console.log(`=== AIdeazz visibility self-audit — engine ${ENGINE_VERSION} — ${new Date().toISOString()} ===\n`);

  let worst = 100;
  const audited = [];
  for (const { url, enforce } of targets) {
    try {
      const r = await runVisibilityAudit(url);
      if (enforce) worst = Math.min(worst, r.score);
      audited.push({ url, enforce, identity: r.identity });
      const cats = r.categories.map((c) => `${c.id}:${c.score}`).join(' ');
      const blocked = r.aiEngines.filter((e) => e.crawlable === 'blocked').map((e) => e.crawler);
      console.log(`${r.grade.padEnd(2)} ${String(r.score).padStart(3)}/100  ${url}${enforce ? '' : '  (report-only)'}`);
      console.log(`   ${cats}`);
      console.log(`   ${r.verdict}`);
      printIdentity(r);
      if (blocked.length > 0) console.log(`   BLOCKED CRAWLERS: ${blocked.join(', ')}`);
      for (const fix of r.topFixes.slice(0, 3)) console.log(`   fix: ${fix}`);
      const failing = r.checks.filter((c) => c.status !== 'pass');
      console.log(`   non-passing checks (${failing.length}): ${failing.map((c) => `${c.id}[${c.status}]`).join(', ')}`);
      console.log();
    } catch (err) {
      if (enforce) worst = 0;
      console.log(`F    0/100  ${url}${enforce ? '' : '  (report-only)'}`);
      console.log(`   UNAUDITABLE: ${err.message}\n`);
    }
  }

  const collisions = findIdentityCollisions(audited);
  let identityFailed = false;
  for (const rows of collisions) {
    const urls = rows.map((r) => r.url);
    const enforced = rows.filter((r) => r.enforce);
    const label = enforced.length > 1 ? 'IDENTICAL IDENTITY' : 'identical identity (report-only)';
    console.log(`${label}: ${urls.join('  ==  ')}`);
    console.log(`   title: "${rows[0].identity.title}"`);
    console.log(`   These routes are one page to an AI engine. A route missing from`);
    console.log(`   prerender-routes.mjs inherits the homepage template and still scores A+.\n`);
    if (enforced.length > 1) identityFailed = true;
  }

  if (worst < PASS_SCORE) {
    console.log(`=== SELF-AUDIT FAILED: worst score ${worst} < ${PASS_SCORE} (grade B floor) ===`);
    process.exit(1);
  }
  if (identityFailed) {
    console.log('=== SELF-AUDIT FAILED: enforced routes share crawler-visible identity ===');
    process.exit(1);
  }
  console.log(`=== Self-audit passed: all properties at or above ${PASS_SCORE} ===`);
}

main();
