#!/usr/bin/env node
/**
 * model-tier.cjs — which models PrepClaw (OpenClaw), its fact-checker and study-pack coaching use, by what money
 * exists this month (25 Oct 2026).
 *
 * Why: Elena has no budget to top up API credits. Her Max plan put $100 of Claude API credit in on 20 Oct "expiring
 * November 8, 2026" — the only such email in 4 months, so nobody knows yet whether it renews. Opus on an expired
 * credit would drain whatever she later pays for. So on the 8th/9th of each month this looks for Anthropic's "$… in API
 * credits was added" email (read-only, the existing reply-radar mail search) and picks:
 *   opus   — the grant is fresh and large (set by hand; today's state until 8 Nov)
 *   claude — a new grant arrived: Sonnet (covered by the Max plan she already pays)
 *   free   — no grant: Gemini first (free tier), Claude only if Gemini fails
 * and tells her in Telegram which one, and why.
 *
 *   node scripts/model-tier.cjs --auto          (cron, 8th + 9th of the month)
 *   node scripts/model-tier.cjs --tier=free|claude|opus [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = process.env.HOME || '/home/ubuntu';
const ENV = path.join(__dirname, '..', '.env');
const OCJSON = path.join(HOME, '.openclaw', 'openclaw.json');
const DRY = process.argv.includes('--dry');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);

const TIERS = {
  opus: { env: { MODEL_TIER: 'claude', STUDY_PACK_MODEL: 'claude-opus-5-5', FACTCHECK_MODEL: 'claude-opus-5-5' },
    openclaw: { primary: 'anthropic/claude-opus-4-6', fallbacks: ['anthropic/claude-sonnet-4-5', 'google/gemini-2.5-flash', 'xai/grok-3', 'openai/gpt-4.1'] } },
  claude: { env: { MODEL_TIER: 'claude', STUDY_PACK_MODEL: 'claude-sonnet-5-5', FACTCHECK_MODEL: 'claude-sonnet-5-5' },
    openclaw: { primary: 'anthropic/claude-sonnet-4-5', fallbacks: ['google/gemini-2.5-flash', 'xai/grok-3', 'openai/gpt-4.1'] } },
  free: { env: { MODEL_TIER: 'free', STUDY_PACK_MODEL: 'claude-sonnet-5-5', FACTCHECK_MODEL: 'claude-sonnet-5-5' },
    openclaw: { primary: 'google/gemini-2.5-flash', fallbacks: ['anthropic/claude-sonnet-4-5', 'xai/grok-3', 'openai/gpt-4.1'] } },
};

function notify(text) {
  if (DRY) return console.log(`[dry] ${text}`);
  try {
    const main = JSON.parse(fs.readFileSync(path.join(HOME, '.openclaw', 'agents', 'main', 'sessions', 'sessions.json'), 'utf8'))['agent:main:main'] || {};
    const to = String(main.lastTo || '').replace(/^telegram:/, '');
    if (to) execFileSync('openclaw', ['message', 'send', '--channel', main.lastChannel || 'telegram', '--target', to, '--message', text], { stdio: 'ignore', timeout: 60000 });
  } catch (e) { console.log(`notify failed: ${String(e.message).slice(0, 120)}`); }
}

/** Anthropic's "$… in API credits was added" email in the last 3 days — read-only search of her mailboxes. */
function creditEmail() {
  const out = execFileSync('python3', [path.join(__dirname, 'reply-radar.py'), '--search', 'API credits was added', '--days', arg('days') || '3'],
    { timeout: 180000, maxBuffer: 32 * 1024 * 1024 }).toString();
  const i = out.indexOf('[');
  const hits = i < 0 ? [] : JSON.parse(out.slice(i));
  return hits.find((h) => /anthropic\.com/i.test(h.from || '') && /API credits was added/i.test(h.subject || '')) || null;
}

function apply(tier) {
  const t = TIERS[tier];
  if (!t) throw new Error(`unknown tier ${tier}`);
  const stamp = new Date().toISOString().slice(0, 10);
  // .env: replace each key in place, or append it — never touch any other line.
  let env = fs.readFileSync(ENV, 'utf8');
  for (const [k, v] of Object.entries(t.env)) {
    env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${env.replace(/\n?$/, '\n')}${k}=${v}\n`;
  }
  const oc = JSON.parse(fs.readFileSync(OCJSON, 'utf8'));
  const before = JSON.stringify(oc.agents.defaults.model);
  oc.agents.defaults.model = { ...oc.agents.defaults.model, ...t.openclaw };
  if (DRY) return console.log(`[dry] ${tier}: .env ${JSON.stringify(t.env)} · openclaw ${before} → ${JSON.stringify(oc.agents.defaults.model)}`);
  fs.copyFileSync(ENV, `${ENV}.bak-model-tier-${stamp}`);
  fs.copyFileSync(OCJSON, `${OCJSON}.bak-model-tier-${stamp}`);
  fs.writeFileSync(ENV, env);
  fs.writeFileSync(OCJSON, `${JSON.stringify(oc, null, 2)}\n`);   // OpenClaw hot-reloads its model config
  console.log(`tier ${tier} applied (${stamp})`);
}

(async () => {
  let tier = arg('tier'), why = 'set by hand';
  if (process.argv.includes('--auto')) {
    const hit = creditEmail();
    tier = hit ? 'claude' : 'free';
    why = hit ? `Anthropic added API credit (${String(hit.date).slice(0, 10)}): "${hit.subject}"` : 'no new Anthropic API credit email in the last 3 days';
  }
  if (!tier) throw new Error('use --auto or --tier=free|claude|opus');
  apply(tier);
  const say = {
    opus: 'Opus (strongest) for PrepClaw, its fact-checker and study packs.',
    claude: 'Claude Sonnet for PrepClaw, its fact-checker and study packs — paid from your Max-plan credit, no top-up needed.',
    free: 'FREE mode: Gemini first for PrepClaw, its fact-checker and study packs (Claude only if Gemini fails and credit is left). Expect a few more 🔎 corrections.',
  }[tier];
  notify(`💳 Model mode: ${say}\nWhy: ${why}.`);
})().catch((e) => { console.log(`⚠️ model-tier: ${e.message}`); process.exitCode = 1; });
