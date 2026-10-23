#!/usr/bin/env node
/**
 * openclaw-fallback-alert.cjs — tell Elena when OpenClaw's model waterfall is in use, and when a key's credits ran out
 * (23 Oct 2026).
 *
 * Why: OpenClaw's chain (openai/gpt-4.1 → gemini-2.5-flash → grok-3 → claude-sonnet-4-5) works — proven 23 Oct with a
 * fake OpenAI key: 401, then Gemini answered in 1.4 s — but it fails over SILENTLY. In 40 sessions every reply came from
 * gpt-4.1, so a dead key would only surface as slightly different answers. Elena: "when credits run out, OpenClaw should
 * remind me and fall back". OpenClaw cannot do the first part itself; this does, by reading what OpenClaw already
 * writes (its session files) and probing the keys it already holds (~/.openclaw/.env). No new channel: it sends through
 * `openclaw message send`, the same way the study-pack script says "ready".
 *
 *   --scan    (cron every 10 min)  new failed model turns in real sessions → one alert per provider + reason per 12 h
 *   --probe   (cron daily)         a 1-token call to every model in the chain → alert on billing / auth failure
 *   --dry     print instead of sending
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = process.env.HOME || '/home/ubuntu';
const OC = path.join(HOME, '.openclaw');
const SESS = path.join(OC, 'agents', 'main', 'sessions');
const STATE = path.join(OC, 'private', 'fallback-alert.json');
const REALERT_MS = 12 * 3600 * 1000;
const DRY = process.argv.includes('--dry');

const TOPUP = {
  openai: 'platform.openai.com/settings/organization/billing',
  google: 'aistudio.google.com (billing)',
  xai: 'console.x.ai (billing)',
  anthropic: 'platform.claude.com/settings/billing',
  groq: 'console.groq.com/settings/billing',
};
const NAME = { openai: 'OpenAI', google: 'Gemini', xai: 'Grok', anthropic: 'Claude', groq: 'Groq' };

/** Same words OpenClaw's own failover uses to call an error "billing" (pi-embedded-helpers, + the 12 Oct patch). */
function reason(msg) {
  const m = String(msg || '').toLowerCase();
  if (/\b402\b|payment required|insufficient credits|credit balance|plans & billing|insufficient balance|no credits remaining|insufficient_quota|exceeded your current quota/.test(m)) return 'credits ran out';
  if (/invalid[_ ]?api[_ ]?key|incorrect api key|\b401\b|\b403\b|unauthorized|authentication/.test(m)) return 'key rejected';
  if (/\b429\b|rate limit|too many requests/.test(m)) return 'rate limited';
  if (/timeout|timed out|econn|overloaded|\b5\d\d\b/.test(m)) return 'provider down';
  return 'error';
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

function send(text) {
  if (DRY) return console.log(`[dry] ${text}`);
  const main = readJson(path.join(SESS, 'sessions.json'), {})['agent:main:main'] || {};
  const to = String(main.lastTo || '').replace(/^telegram:/, '');
  if (!to) return console.log('no target');
  execFileSync('openclaw', ['message', 'send', '--channel', main.lastChannel || 'telegram', '--target', to, '--message', text],
    { stdio: 'ignore', timeout: 60000 });
  console.log(`sent: ${text.slice(0, 120)}`);
}

function alertOnce(state, key, text) {
  const last = state.alerted[key] || 0;
  if (Date.now() - last < REALERT_MS) return;
  send(text);
  state.alerted[key] = Date.now();
}

function scan(state) {
  const since = state.scannedTo || Date.now() - 3600 * 1000;
  let newest = since;
  for (const f of fs.readdirSync(SESS).filter((n) => n.endsWith('.jsonl') && !n.startsWith('test-'))) {
    const full = path.join(SESS, f);
    if (fs.statSync(full).mtimeMs < since) continue;
    const rows = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    rows.forEach((d, i) => {
      const m = d.message || {};
      const ts = Date.parse(d.timestamp || '') || m.timestamp || 0;
      if (m.role !== 'assistant' || ts <= since) return;
      newest = Math.max(newest, ts);
      if (m.stopReason !== 'error' || !m.provider) return;
      // Did a later reply in the same turn come from another provider? Then the waterfall caught it.
      const next = rows.slice(i + 1).map((r) => r.message || {}).find((x) => x.role === 'assistant' && x.stopReason !== 'error');
      const why = reason(m.errorMessage);
      const caught = next && next.provider && next.provider !== m.provider
        ? `${NAME[next.provider] || next.provider} answered instead — your coach still works.` : 'No backup answered that message.';
      alertOnce(state, `scan:${m.provider}:${why}`,
        `⚠️ OpenClaw: ${NAME[m.provider] || m.provider} (${m.model}) failed — ${why}. ${caught}`
        + (why === 'credits ran out' || why === 'key rejected' ? ` Top up / check: ${TOPUP[m.provider] || m.provider}` : ''));
    });
  }
  state.scannedTo = newest;
}

async function probe(state) {
  const env = {};
  for (const line of fs.readFileSync(path.join(OC, '.env'), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  const cfg = readJson(path.join(OC, 'openclaw.json'), {});
  const chain = [cfg.agents.defaults.model.primary, ...cfg.agents.defaults.model.fallbacks];
  const results = [];
  for (const ref of chain) {
    const [provider, ...rest] = ref.split('/');
    const model = rest.join('/');
    let url, headers = { 'content-type': 'application/json', 'user-agent': 'openclaw-fallback-alert/1' }, body;
    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { ...headers, 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
      body = { model, max_tokens: 5, messages: [{ role: 'user', content: 'OK' }] };
    } else if (provider === 'google') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      body = { contents: [{ parts: [{ text: 'OK' }] }] };
    } else {
      const base = { openai: 'https://api.openai.com/v1', xai: 'https://api.x.ai/v1', groq: 'https://api.groq.com/openai/v1' }[provider];
      const key = { openai: env.OPENAI_API_KEY, xai: env.XAI_API_KEY, groq: env.GROQ_API_KEY }[provider];
      if (!base) continue;
      url = `${base}/chat/completions`;
      headers = { ...headers, authorization: `Bearer ${key}` };
      body = { model, max_tokens: 20, messages: [{ role: 'user', content: 'OK' }] };
    }
    let status, text;
    try {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      status = r.status; text = await r.text();
    } catch (e) { status = 'ERR'; text = String(e.message); }
    const ok = status === 200;
    results.push(`${NAME[provider] || provider} ${ok ? '✅' : `❌ ${status}`}`);
    if (!ok) {
      const why = reason(`${status} ${text}`);
      alertOnce(state, `probe:${provider}:${why}`,
        `⚠️ OpenClaw daily check: ${NAME[provider] || provider} (${model}) — ${why}. The waterfall skips it until fixed.`
        + (why === 'credits ran out' || why === 'key rejected' ? ` Top up / check: ${TOPUP[provider] || provider}` : ''));
    }
  }
  console.log(`probe ${new Date().toISOString()}: ${results.join(' · ')}`);
}

(async () => {
  const state = readJson(STATE, { alerted: {} });
  if (process.argv.includes('--scan')) scan(state);
  if (process.argv.includes('--probe')) await probe(state);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  if (!DRY) fs.writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
})().catch((e) => { console.log(`⚠️ ${e.message}`); process.exitCode = 1; });
