#!/usr/bin/env node
/**
 * competitor-probe.cjs — whose brands come back when an AI engine answers OUR
 * buyer's question.
 *
 * `citation-probe.cjs` measures whether aideazz.xyz is cited. It has been 0%.
 * A zero is not actionable on its own: it does not say whether the category is
 * empty, or crowded by eight names we have never looked at. This runs the SAME
 * buyer questions (DEFAULT_PROMPTS, shared deliberately so the two datasets are
 * comparable) through the Perplexity Agent API with the web_search tool and a
 * JSON schema, and returns the named competitive set.
 *
 * Usage:
 *   node scripts/competitor-probe.cjs --dry-run     # print the request, spend nothing
 *   node scripts/competitor-probe.cjs               # real run
 *   node scripts/competitor-probe.cjs --json        # machine-readable
 *   node scripts/competitor-probe.cjs --prompt "..." # single question
 *
 * Exits 1 when NOTHING could be measured, so a keyless cron is loud rather than
 * quietly reporting "no competitors". Zero competitors and zero measurements
 * are different facts.
 */
try {
  require('dotenv').config();
} catch {
  // dotenv optional — CI passes real env vars directly.
}

const {
  probeCompetitors,
  summarizeCompetitors,
  buildAgentRequest,
} = require('../dist/ai-answer-competitors.js');
const { DEFAULT_PROMPTS } = require('../dist/citation-tracker.js');

function parseArgs(argv) {
  const out = { json: false, dryRun: false, prompts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--prompt') out.prompts.push(argv[++i]);
  }
  return out;
}

function trackedDomain() {
  return (process.env.CITATION_DOMAIN || 'aideazz.xyz').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompts = args.prompts.length ? args.prompts : DEFAULT_PROMPTS;
  const domain = trackedDomain();

  if (args.dryRun) {
    // Prove the request shape without spending a call or needing a key.
    const body = buildAgentRequest(prompts[0], domain);
    console.log('POST https://api.perplexity.ai/v1/agent');
    console.log('Authorization: Bearer <PERPLEXITY_API_KEY>   (never printed)');
    console.log(JSON.stringify(body, null, 2));
    console.log(`\n[dry-run] ${prompts.length} prompt(s) would be sent. No key read, no spend.`);
    return;
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    console.error(
      'PERPLEXITY_API_KEY not set. Add it to .env on the box; do not paste keys into a chat.\n' +
        'Create/rotate at https://console.perplexity.ai',
    );
    process.exit(1);
  }

  console.log(`=== AI answer competitors — ${domain} — ${new Date().toISOString()} ===\n`);
  const run = await probeCompetitors(prompts, domain);

  if (args.json) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    for (const p of run.probes) {
      if (!p.ok) {
        console.log(`ERR   "${p.prompt.slice(0, 68)}"\n      ${p.error}\n`);
        continue;
      }
      const mark = p.trackedDomainPresent ? 'PRESENT ' : 'absent  ';
      console.log(`${mark} "${p.prompt.slice(0, 68)}"`);
      for (const b of p.brands.slice(0, 6)) {
        console.log(`         ${String(b.domain).padEnd(28)} ${String(b.why_cited).slice(0, 70)}`);
      }
      console.log('');
    }
    console.log('--- who owns our questions ---');
    for (const l of run.leaderboard.slice(0, 10)) {
      console.log(`  ${String(l.appearances).padStart(2)}×  ${l.domain}`);
    }
    console.log('');
    console.log(summarizeCompetitors(run));
  }

  if (run.measured === 0) process.exit(1);
}

main().catch((err) => {
  console.error('competitor-probe failed:', err.message);
  process.exit(1);
});
