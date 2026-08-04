#!/usr/bin/env node
/**
 * community-listen.cjs — find community threads worth answering, draft replies,
 * and hand them to Elena on Telegram + HubSpot.
 *
 * It never posts anything. Reddit bans domains for automated self-promotion, and
 * Reddit is one of the most-cited sources in AI answers — auto-posting is the one
 * action that could make aideazz.xyz un-citable in the place that matters most.
 *
 * Usage:
 *   node scripts/community-listen.cjs --dry-run     # show the shortlist, spend no tokens
 *   node scripts/community-listen.cjs               # draft + deliver to TG and HubSpot
 *   node scripts/community-listen.cjs --json        # machine-readable result
 *   node scripts/community-listen.cjs --stats       # what has been posted so far
 *
 * Keys: ANTHROPIC_API_KEY (drafting), TELEGRAM_BOT_TOKEN + COMMUNITY_TG_CHAT,
 *       HUBSPOT_API_KEY, and REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET for Reddit
 *       (the VM is a datacenter IP and Reddit blocks anonymous reads from those).
 */
'use strict';

const path = require('path');

// Only needed for standalone runs; inside the app dotenv has already loaded.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv absent is fine */
}

const dryRun = process.argv.includes('--dry-run');
const asJson = process.argv.includes('--json');
const wantStats = process.argv.includes('--stats');

function printScan(scan) {
  console.log(`=== community listener ${scan.listenerVersion} — ${scan.scannedAt} ===\n`);
  for (const o of scan.outcomes) {
    const detail =
      o.status === 'ok'
        ? `${o.found} match${o.found === 1 ? '' : 'es'}`
        : `UNAVAILABLE — ${o.reason}`;
    console.log(`  ${o.source.padEnd(14)} ${detail}`);
  }
  if (scan.skippedAsSeen) console.log(`\n  ${scan.skippedAsSeen} already seen, not re-offered`);
  console.log(`\n--- shortlist (${scan.candidates.length}) ---\n`);
  for (const c of scan.candidates) {
    console.log(`[${String(c.score).padStart(2)}] ${c.latam ? 'LATAM ' : ''}${c.channel}`);
    console.log(`     ${c.title.slice(0, 110)}`);
    console.log(`     ${c.url}`);
    console.log(`     matched: "${c.matchedQuery}"\n`);
  }
}

(async () => {
  if (wantStats) {
    const { stats } = require('../dist/community-store.js');
    const s = await stats();
    if (asJson) {
      console.log(JSON.stringify(s, null, 2));
      return;
    }
    console.log('=== community listener — results so far ===\n');
    console.log(`  posted   ${s.posted}`);
    console.log(`  queued   ${s.queued}`);
    console.log(`  skipped  ${s.skipped}`);
    console.log(`  LatAm    ${s.latam}`);
    if (s.bySource.length) {
      console.log('\n  by source:');
      for (const b of s.bySource) console.log(`    ${b.source.padEnd(14)} ${b.posted}/${b.total} posted`);
    }
    return;
  }

  if (dryRun) {
    // No store import: a dry run must work on a laptop with no Oracle wallet.
    const { scanCommunities } = require('../dist/community-listener.js');
    const scan = await scanCommunities({ seen: new Set() });
    if (asJson) console.log(JSON.stringify(scan, null, 2));
    else printScan(scan);
    const reachable = scan.outcomes.filter((o) => o.status === 'ok').length;
    if (reachable === 0) {
      console.error('\nNo source was reachable — this is "could not look", not "nothing to answer".');
      process.exit(1);
    }
    return;
  }

  const { runCommunityCycle } = require('../dist/community-notify.js');
  const result = await runCommunityCycle();
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`=== community cycle — ${result.scannedAt} ===\n`);
  for (const o of result.outcomes) {
    console.log(
      `  ${o.source.padEnd(14)} ${o.status === 'ok' ? `${o.found} matches` : `UNAVAILABLE — ${o.reason}`}`,
    );
  }
  console.log(
    `\n  ${result.candidates} candidate(s) · ${result.drafted} drafted · ` +
      `${result.declined} declined by the model · ${result.delivered} delivered`,
  );
  if (result.drafted === 0 && result.candidates > 0) {
    console.log('\n  The model declined every candidate. That is the filter working, not a failure.');
  }
})().catch((e) => {
  console.error('community-listen failed:', e.message);
  process.exit(1);
});
