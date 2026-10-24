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
 *   --scan       (cron every 10 min)  new failed model turns in real sessions → one alert per provider + reason per 12 h
 *   --probe      (cron daily)         a 1-token call to every model in the chain → alert on billing / auth failure
 *   --factcheck  (cron every 10 min)  OpenClaw's replies about the ACTIVE STUDY PACK, checked against the pack (24 Oct):
 *                every quoted TEXT "…" must be in the pack word for word (code), and every claim must be stated in it
 *                (Claude as judge — it only FLAGS, Elena decides). A flag goes to her Telegram and into
 *                private/factcheck-flags.json, which hs-study-pack.cjs prints at the top of the pack so the coach
 *                does not repeat it. Why: 23 Oct OpenClaw told her "the goal is to reduce the 29%" and tied H2 to
 *                bail-outs — neither is in her document; rules reduce that, nothing CHECKED it.
 *   --dry        print instead of sending
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
const QUIET = process.argv.includes('--quiet');   // record flags + refresh the pack, but send nothing (a backlog re-check)

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
  if (DRY || QUIET) return console.log(`[${DRY ? 'dry' : 'quiet'}] ${text.slice(0, 120)}`);
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

// ───────────────────────────── --factcheck ─────────────────────────────
const FLAGS = path.join(OC, 'private', 'factcheck-flags.json');
const MAX_CHECKS = 8;                       // per run — a burst of replies is checked over the next runs
// Quote marks are dropped before comparing (24 Oct false alarm: her "Prices" quoted inside TEXT "…" as 'Prices').
const norm = (s) => String(s).replace(/["“”'‘’`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const textOf = (m) => (m.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');

/** Replies that coach from the pack: they carry a block id, a pack field, or answer a pack request. */
function aboutPack(reply, ask) {
  // 24 Oct: a free explanation ("Your solution in the deliverables…") after "explain H1" was skipped — widened.
  const PACKISH = /deliverable|your document|my document|my slides|your slides|\bthe case\b|the task|pitz|chal[aá]n|\b[DSPHA]\d{1,2}\b|quiz|practi[cs]e|\bnext\b/i;
  return /THEY MAY ASK|YOU SAY|IN SIMPLE WORDS|TEXT:|📍 WHERE/.test(reply) || PACKISH.test(reply) || PACKISH.test(ask);
}

async function judge(source, reply) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const key = process.env.ANTHROPIC_API_KEY;
  const prompt = `REPLY is what an AI coach just told Elena while preparing her to defend her case study in an interview.
SOURCE is her study pack: her submitted document, the case task, and coaching notes written for her.
List every claim in REPLY that SOURCE does not state or directly support: an invented number, goal, target, reason,
feature, quote, date, or a link between two things SOURCE does not link. A faithful paraphrase is supported.
IGNORE: questions to her, encouragement, formatting, block ids (D26, S3, P12), "Next?", and any sentence starting
"My opinion:" or saying "the document doesn't say". Be strict but fair — flag only what a careful reader of SOURCE would
call wrong or unsupported. Read the WHOLE relevant block (and blocks it depends on) before flagging; if a claim
is PARTLY supported, start "why" with "Partly true:" and say exactly what SOURCE does support. Inside the JSON strings use
single quotes ' — never a double quote. Return ONLY JSON: {"unsupported":[{"claim":"…","why":"…","source_says":"…"}]} (empty list if none).

REPLY:
${reply.slice(0, 6000)}`;
  // 24 Oct 2026: the judge failed SILENTLY on long replies (answer cut at 1,200 tokens; double quotes inside claims broke
  // JSON) and the reply counted as clean. Now: 3,000 tokens, one retry told what broke, and a throw the caller reports.
  const ask = async (content) => {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(150000),
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.FACTCHECK_MODEL || 'claude-sonnet-5-5', max_tokens: 3000,
          system: [{ type: 'text', text: `SOURCE:\n${source}`, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content }],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`);
      return (j.content || []).map((c) => c.text || '').join('');
    } catch (e) {                             // the fleet's waterfall, as everywhere else
      const { completeWithProfileDetailed } = require('../dist/llm-resilience.js');
      return (await completeWithProfileDetailed('quality', `SOURCE:\n${source.slice(0, 120000)}`, content, 3000, 'factcheck')).text;
    }
  };
  const parse = (text) => { const s = text.indexOf('{'), e2 = text.lastIndexOf('}'); return JSON.parse(text.slice(s, e2 + 1)).unsupported || []; };
  let text = await ask(prompt);
  try { return parse(text); } catch (e) {
    text = await ask(`${prompt}\n\nYOUR LAST ANSWER WAS NOT VALID JSON (${String(e.message).slice(0, 80)}). Return the same findings as valid JSON only, no double quotes inside strings.`);
    return parse(text);                       // a second failure throws — factcheck() reports it, never a silent pass
  }
}

async function factcheck(state) {
  const sheets = ['pack', 'pack2', 'pack3', 'pack4'].map((n) => { try { return fs.readFileSync(path.join(OC, 'workspace', n, 'TOOLS.md'), 'utf8'); } catch { return ''; } }).join('\n');
  if (!/ACTIVE STUDY PACK —/.test(sheets)) return console.log('factcheck: no active pack');
  const source = sheets.replace(/^# ⚠️ FACT-CHECK FLAGS[\s\S]*?\n\n/m, '');     // never judge a reply against our own flags
  const srcNorm = norm(source);
  const since = state.factScannedTo || Date.now() - 1800 * 1000;
  let newest = since, checked = 0;
  const flags = readJson(FLAGS, []);
  for (const f of fs.readdirSync(SESS).filter((n) => n.endsWith('.jsonl') && !n.startsWith('test-'))) {
    const full = path.join(SESS, f);
    if (fs.statSync(full).mtimeMs < since) continue;
    const rows = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let lastAsk = '';
    for (const d of rows) {
      const m = d.message || {};
      const ts = Date.parse(d.timestamp || '') || 0;
      if (m.role === 'user') { lastAsk = textOf(m); continue; }
      if (m.role !== 'assistant' || m.stopReason === 'error' || ts <= since) continue;
      if (checked >= MAX_CHECKS) break;
      newest = Math.max(newest, ts);
      const reply = textOf(m).replace(/\[\[tts:text\]\][\s\S]*?\[\[\/tts:text\]\]/g, '').trim();
      if (!reply || !aboutPack(reply, lastAsk)) continue;
      checked++;
      const problems = [];
      // 1) Code: every quoted TEXT must exist in the pack word for word.
      for (const q of reply.matchAll(/TEXT(?: ON THE SLIDE)?:\**\s*[*_]*["“]([^"”]{25,})["”]/g)) {
        if (!srcNorm.includes(norm(q[1]).slice(0, 160))) problems.push({ claim: `TEXT "${q[1].slice(0, 90)}…"`, why: 'quoted as your text, but it is not in your document word for word' });
      }
      // 2) Claude: every claim must be stated in the pack.
      try { problems.push(...await judge(source, reply)); } catch (e) {
        console.log(`factcheck judge failed: ${String(e.message).slice(0, 120)}`);
        // Never a silent pass (24 Oct): she learns this reply was NOT verified.
        send(`⚠️ Fact-check could not verify OpenClaw's reply at ${new Date(ts).toISOString().slice(11, 16)} UTC ("${reply.slice(0, 60).replace(/\s+/g, ' ')}…"). Check it against your document's 📍 lines before you repeat it.`);
      }
      if (!problems.length) continue;
      const at = new Date(ts).toISOString().slice(11, 16);
      for (const p of problems) flags.push({ at: new Date(ts).toISOString(), claim: p.claim, why: p.why, source_says: p.source_says || '' });
      const lines = problems.slice(0, 4).map((p, i) => `${i + 1}) "${String(p.claim).slice(0, 160)}" — ${String(p.why).slice(0, 160)}${p.source_says ? ` Your document: ${String(p.source_says).slice(0, 160)}` : ''}`);
      send(`🔎 Fact-check on OpenClaw's reply at ${at} UTC — not in your document:\n${lines.join('\n')}\nDon't repeat these in the interview; OpenClaw now has them on its trap list.`);
    }
  }
  state.factScannedTo = newest;
  if (!DRY) fs.writeFileSync(FLAGS, JSON.stringify(flags.slice(-40), null, 2), { mode: 0o600 });
  // New flags reach the coach now, not at the next 30-min refresh.
  if (!DRY && flags.length !== readJson(FLAGS + '.count', 0)) {
    fs.writeFileSync(FLAGS + '.count', String(flags.length));
    try { execFileSync(process.execPath, [path.join(__dirname, 'hs-study-pack.cjs'), '--refresh'], { stdio: 'ignore', timeout: 120000 }); } catch {}
  }
  console.log(`factcheck ${new Date().toISOString()}: ${checked} reply(s) checked`);
}

(async () => {
  const state = readJson(STATE, { alerted: {} });
  if (process.argv.includes('--scan')) scan(state);
  if (process.argv.includes('--probe')) await probe(state);
  if (process.argv.includes('--factcheck')) await factcheck(state);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  if (!DRY) fs.writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
})().catch((e) => { console.log(`⚠️ ${e.message}`); process.exitCode = 1; });
