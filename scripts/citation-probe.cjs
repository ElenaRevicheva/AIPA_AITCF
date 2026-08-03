#!/usr/bin/env node
/**
 * citation-probe.cjs — ask real AI answer engines a real buyer question and report
 * whether aideazz.xyz was cited in the answer.
 *
 * This is the other half of the visibility story. `visibility-self-audit.cjs` proves
 * our pages are citABLE; this proves whether they are actually CITED. Selling the
 * first while implying the second is the gap this closes.
 *
 * Usage:
 *   node scripts/citation-probe.cjs                    # all configured engines, default prompts
 *   node scripts/citation-probe.cjs --engine gemini-grounded
 *   node scripts/citation-probe.cjs --prompt "Elena Revicheva AI portfolio"
 *   node scripts/citation-probe.cjs --json             # machine-readable, for storage
 *   node scripts/citation-probe.cjs --save             # also persist the run to Oracle
 *
 * Exits 0 even at 0% citations: zero is a real, reportable measurement. It exits 1
 * only when nothing could be measured at all, so a silently keyless cron is loud.
 */
try {
  require('dotenv').config();
} catch {
  // dotenv is optional — CI passes real env vars directly.
}

const { runCitationProbes, summarize, TRACKER_VERSION } = require('../dist/citation-tracker.js');

function parseArgs(argv) {
  const out = { engines: [], prompts: [], json: false, save: false, notify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--save') out.save = true;
    else if (arg === '--notify') out.notify = true;
    else if (arg === '--engine') out.engines.push(argv[++i]);
    else if (arg === '--prompt') out.prompts.push(argv[++i]);
  }
  return out;
}

/** Same channel the Lead Concierge already uses, so the number lands where Elena looks. */
async function notifyTelegram(run) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CONCIERGE_TG_CHAT?.trim();
  if (!token || !chatId) {
    console.warn('[citation-probe] TELEGRAM_BOT_TOKEN or CONCIERGE_TG_CHAT not set — skipping notify');
    return;
  }
  const { summary } = run;
  const wins = run.probes
    .filter((p) => p.ok && p.cited)
    .map((p) => `• ${p.engine}: "${p.prompt.slice(0, 60)}"`)
    .join('\n');
  const text =
    `🔎 AI citation probe — ${run.domain}\n` +
    `${summarize(run)}\n` +
    (wins ? `\nCited on:\n${wins}\n` : '\nNo answer engine cited us this run.\n') +
    `\nDetail: https://webhook.aideazz.xyz/cto/v1/citations`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4090), disable_web_page_preview: true }),
    });
    if (!res.ok) console.error('[citation-probe] TG send failed:', (await res.text()).slice(0, 200));
  } catch (err) {
    console.error('[citation-probe] TG send error:', err.message);
  }
}

function printHuman(run) {
  console.log(`=== AIdeazz AI citation probe — tracker ${TRACKER_VERSION} — ${run.ranAt} ===`);
  console.log(`tracking ${run.domain} (primary ${run.primaryPath})\n`);

  for (const { engine, reason } of run.skipped) {
    console.log(`SKIPPED ${engine} — ${reason}`);
  }
  if (run.skipped.length > 0) console.log();

  for (const probe of run.probes) {
    if (!probe.ok) {
      console.log(`ERR  ${probe.engine}  "${probe.prompt}"`);
      console.log(`     ${probe.error}\n`);
      continue;
    }
    const verdict = probe.citedPortfolio
      ? `CITED ${run.primaryPath}`
      : probe.cited
        ? 'CITED'
        : probe.mentioned
          ? 'named, no link'
          : 'absent';
    console.log(`${verdict.padEnd(20)} ${probe.engine}  "${probe.prompt}"`);
    console.log(`     ${probe.sources.length} sources${probe.position ? `, ours at #${probe.position}` : ''}`);
    for (const url of probe.citedUrls) console.log(`     -> ${url}`);
    console.log();
  }

  console.log('--- by engine ---');
  for (const row of run.summary.byEngine) {
    console.log(`${row.engine.padEnd(20)} ${row.cited}/${row.probes} cited (${row.citationRate}%)`);
  }
  console.log(`\n${summarize(run)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const run = await runCitationProbes({
    ...(args.engines.length > 0 ? { engines: args.engines } : {}),
    ...(args.prompts.length > 0 ? { prompts: args.prompts } : {}),
  });

  if (args.json) console.log(JSON.stringify(run, null, 2));
  else printHuman(run);

  if (args.save) {
    try {
      const { saveCitationRun } = require('../dist/citation-store.js');
      const id = await saveCitationRun(run);
      console.log(id ? `\nSaved run ${id}` : '\nNot saved (database unavailable)');
    } catch (err) {
      console.error(`\nSave failed: ${err.message}`);
    }
  }

  if (args.notify && run.summary.measured > 0) await notifyTelegram(run);

  if (run.summary.measured === 0) {
    console.log('\n=== CITATION PROBE FAILED: nothing measured (no engine key configured or all probes errored) ===');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('citation-probe crashed:', err);
  process.exit(1);
});
