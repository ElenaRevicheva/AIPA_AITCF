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
// /portfolio and /api are the two money pages that prerender-routes.mjs gives a
// standalone static identity (aideazz `scripts/prerender-routes.mjs`). Auditing the
// apex alone proved nothing about them: 4everland serves one index.html for every
// route, so a prerender regression would ship homepage identity on /portfolio and
// the apex score would stay A+. Audit the URLs we actually ask assistants to cite.
const DEFAULT_TARGETS = [
  { url: 'https://aideazz.xyz', enforce: true },
  { url: 'https://aideazz.xyz/portfolio', enforce: true },
  { url: 'https://aideazz.xyz/api', enforce: true },
  { url: 'https://webhook.aideazz.xyz/cto/v1/visibility', enforce: true },
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

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args.map((url) => ({ url, enforce: true })) : DEFAULT_TARGETS;
  console.log(`=== AIdeazz visibility self-audit — engine ${ENGINE_VERSION} — ${new Date().toISOString()} ===\n`);

  let worst = 100;
  for (const { url, enforce } of targets) {
    try {
      const r = await runVisibilityAudit(url);
      if (enforce) worst = Math.min(worst, r.score);
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

  if (worst < PASS_SCORE) {
    console.log(`=== SELF-AUDIT FAILED: worst score ${worst} < ${PASS_SCORE} (grade B floor) ===`);
    process.exit(1);
  }
  console.log(`=== Self-audit passed: all properties at or above ${PASS_SCORE} ===`);
}

main();
