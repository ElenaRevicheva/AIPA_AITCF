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

const DEFAULT_TARGETS = [
  'https://aideazz.xyz',
  'https://atuona.xyz',
  'https://webhook.aideazz.xyz/cto/v1/visibility',
];

const PASS_SCORE = 70; // grade B — our own properties must not slip below this

async function main() {
  const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;
  console.log(`=== AIdeazz visibility self-audit — engine ${ENGINE_VERSION} — ${new Date().toISOString()} ===\n`);

  let worst = 100;
  for (const url of targets) {
    try {
      const r = await runVisibilityAudit(url);
      worst = Math.min(worst, r.score);
      const cats = r.categories.map((c) => `${c.id}:${c.score}`).join(' ');
      const blocked = r.aiEngines.filter((e) => e.crawlable === 'blocked').map((e) => e.crawler);
      console.log(`${r.grade.padEnd(2)} ${String(r.score).padStart(3)}/100  ${url}`);
      console.log(`   ${cats}`);
      console.log(`   ${r.verdict}`);
      if (blocked.length > 0) console.log(`   BLOCKED CRAWLERS: ${blocked.join(', ')}`);
      for (const fix of r.topFixes.slice(0, 3)) console.log(`   fix: ${fix}`);
      const failing = r.checks.filter((c) => c.status !== 'pass');
      console.log(`   non-passing checks (${failing.length}): ${failing.map((c) => `${c.id}[${c.status}]`).join(', ')}`);
      console.log();
    } catch (err) {
      worst = 0;
      console.log(`F    0/100  ${url}`);
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
