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
 *   --propose-rules (weekly, and from --factcheck after 6+ new flags, max every 6 h)  repeated MISTAKE TYPES among the fact-check flags → at most 3 proposed rules, sent to
 *                Elena; she approves with "/rules approve R1" (hs-study-pack.cjs --rules) and the rule joins every future
 *                pack. 25 Oct: corrections lived only in Claude Code sessions — OpenClaw caught its mistakes but never
 *                learned from them. A model never adds a rule to itself: a wrong self-written rule would poison every prep.
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

// 25 Oct (Elena: "no daily garbage about my credits"): a billing alert ("credits ran out", "key rejected") goes ONCE per
// outage and per provider — the 12 h re-alert sent "OpenAI credits ran out" every morning. It can fire again only after
// the daily probe saw that provider answer (clearBilling). Other alerts keep the 12 h rhythm.
function alertOnce(state, key, text) {
  const [, provider, why] = key.split(':');
  if (why === 'credits ran out' || why === 'key rejected') {
    const b = `billing:${provider}`;
    const old = state.alerted[`probe:${provider}:${why}`] || state.alerted[`scan:${provider}:${why}`];
    if (state.alerted[b] || old) { state.alerted[b] = state.alerted[b] || old; return; }
    send(text);
    state.alerted[b] = Date.now();
    return;
  }
  const last = state.alerted[key] || 0;
  if (Date.now() - last < REALERT_MS) return;
  send(text);
  state.alerted[key] = Date.now();
}
function clearBilling(state, provider) {
  for (const k of Object.keys(state.alerted)) {
    if (k === `billing:${provider}` || new RegExp(`^(probe|scan):${provider}:(credits ran out|key rejected)$`).test(k)) delete state.alerted[k];
  }
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
      // 25 Oct 22:05: Claude's credit ran out mid-prep and no backup answered. Heal at once instead of waiting for the
      // daily billing-mail check: put the models in free mode (Gemini first); model-tier.cjs messages her the switch.
      if (caught.startsWith('No backup') && m.provider === 'anthropic' && why === 'credits ran out' && !DRY && !QUIET) {
        try {
          const tier = JSON.parse(fs.readFileSync(path.join(OC, 'private', 'model-tier.json'), 'utf8')).tier;
          if (tier !== 'free') execFileSync(process.execPath, [path.join(__dirname, 'model-tier.cjs'), '--tier=free'], { stdio: 'ignore', timeout: 60000 });
        } catch { try { execFileSync(process.execPath, [path.join(__dirname, 'model-tier.cjs'), '--tier=free'], { stdio: 'ignore', timeout: 60000 }); } catch {} }
      }
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
    if (ok) clearBilling(state, provider);   // it works again — a future outage may alert once more
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

/** Claude (Sonnet 5.5, SOURCE cached) — on any failure the fleet's waterfall, as everywhere else. */
async function askClaude(source, content, maxTokens = 3000, tool = null) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const key = process.env.ANTHROPIC_API_KEY;
  // MODEL_TIER=free (set by scripts/model-tier.cjs when no Claude credit came this month): free providers first.
  const free = (process.env.MODEL_TIER || '') === 'free';
  try {
    if (free) throw new Error('MODEL_TIER=free — Gemini/Groq first');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(150000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.FACTCHECK_MODEL || 'claude-opus-5-5', max_tokens: maxTokens,   // Opus while the promo credit lasts (Elena, 25 Oct)
        system: [{ type: 'text', text: `SOURCE:\n${source}`, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        // 25 Oct: a long reply (8 error codes) made the judge write broken JSON twice → "could not verify". A forced
        // tool call returns arguments the API has already parsed — no hand-written JSON to break.
        // tool_choice "tool"/"any" is rejected by claude-sonnet-5-5 (400, found 25 Oct 16:40 — every check from 15:30 had
        // silently fallen to the waterfall). "auto" + the instruction to call it; a text answer is still parsed.
        ...(tool ? { tools: [tool], tool_choice: { type: 'auto' } } : {}),
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`);
    const used = (j.content || []).find((c) => c.type === 'tool_use');
    if (tool && used) return JSON.stringify(used.input);
    return (j.content || []).map((c) => c.text || '').join('');
  } catch (e) {
    if (!free) console.log(`askClaude: Claude failed (${String(e.message).slice(0, 140)}) — fleet waterfall answers`);   // never silent again
    const { completeWithProfileDetailed } = require('../dist/llm-resilience.js');
    return (await completeWithProfileDetailed(free ? 'bulk' : 'quality', `SOURCE:\n${source.slice(0, 120000)}`, content, maxTokens, 'factcheck')).text;
  }
}

// 24 Oct 2026: the judge failed SILENTLY on long replies (answer cut at 1,200 tokens; double quotes inside claims broke
// JSON) and the reply counted as clean. Now: 3,000 tokens, one retry told what broke, and a throw the caller reports.
async function judge(source, reply) {
  const prompt = `REPLY is what an AI coach just told Elena while preparing her to defend her case study in an interview.
SOURCE has two parts: DOCUMENT (her submitted document and the case task — block TEXT with 📍 lines) and COACHING
(notes written for her — NOT her document).
FLAG what REPLY ADDS that DOCUMENT does not state:
- a fact, number, name, goal, or a link between two things;
- a REASON or PURPOSE ("Why: …", "so that…", "because…", "this protects against…") that DOCUMENT does not give;
- an example with invented details (prices, minutes, names, situations) not labelled as an example;
- words presented as a quote, or as what "your document" says, calls or includes, that DOCUMENT does not contain.
COACHING may support a general explanation, but never something attributed to her document.
DO NOT FLAG: a statement DOCUMENT makes, exactly or as a faithful paraphrase — a correct statement is never wrong just
because DOCUMENT gives no reason for it (flag only a reason REPLY adds); a plain-word explanation of a term; questions,
encouragement, block ids, "Next?"; sentences starting "My opinion:", "Outside your document:", "For example (not in
your document):" or "📖 Illustrative story"; saying the document doesn't say. Before you flag a statement, search
DOCUMENT for it — if it is there, do not flag it.
Write every finding FOR ELENA in plain English. Never use the words SOURCE, TEXT, DOCUMENT or COACHING in what you
write — say "your document" or "the coaching notes". If something is partly right, start "why" with "Partly true:".
Answer by calling report_unsupported. Without tools, return ONLY JSON {"unsupported":[{"claim":"…","why":"…","source_says":"…"}]},
single quotes inside strings.

REPLY:
${reply.slice(0, 6000)}`;
  const REPORT = { name: 'report_unsupported', description: 'Report every unsupported claim in REPLY (empty list if none).',
    input_schema: { type: 'object', required: ['unsupported'], properties: { unsupported: { type: 'array', items: {
      type: 'object', required: ['claim', 'why'], properties: {
        claim: { type: 'string', description: "the coach's words, copied exactly, at most 25 words" },
        why: { type: 'string', description: 'ONE short plain-English sentence, at most 20 words: what is wrong' },
        source_says: { type: 'string', description: 'what her document says on this, copied exactly, at most 30 words; empty if it says nothing' },
      } } } } } };
  const ask = (content) => askClaude(source, content, 4000, REPORT);
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
  const pack = sheets.replace(/^# ⚠️ FACT-CHECK FLAGS[\s\S]*?\n\n/m, '');     // never judge a reply against our own flags
  // 25 Oct: the judge quoted a coaching "YOU SAY" back to her as "Your document". Her words and ours are now apart.
  const isDoc = (l) => /^(# =====|[PDS]\d+ — |[PDS]\d+\. TEXT|📍|TEXT)/.test(l);
  const lines = pack.split('\n');
  const source = `=== DOCUMENT (her submitted document + the case) ===\n${lines.filter(isDoc).join('\n')}\n\n`
    + `=== COACHING (notes written for her — not her document) ===\n${lines.filter((l) => !isDoc(l)).join('\n')}`;
  const srcNorm = norm(source);
  const docNorm = norm(lines.filter(isDoc).join('\n'));
  const since = state.factScannedTo || Date.now() - 1800 * 1000;
  let newest = since, checked = 0;
  const flags = readJson(FLAGS, []);
  const company = readJson(path.join(OC, 'private', 'active-pack.json'), {}).company || '';   // traps are per company (25 Oct)
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
      // 25 Oct 16:30: three flags were true statements ("no order or payment" IS in both samples). Code beats the
      // model: a finding whose quoted claim is in her document word for word, or whose own "why" says it matches, is dropped.
      try {
        problems.push(...(await judge(source, reply)).filter((p) => {
          const c = norm(String(p.claim).replace(/^.*?["“']|["”']$/g, ''));
          const labelled = /^\W*(my opinion:|outside your document:|for example \(not in your document\)|📖)/i.test(String(p.claim));
          return !labelled && !(c.length >= 20 && docNorm.includes(c)) && !/\b(matches|is supported|is correct|wording matches)\b/i.test(String(p.why));
        }));
      } catch (e) {
        console.log(`factcheck judge failed: ${String(e.message).slice(0, 120)}`);
        // Never a silent pass (24 Oct): she learns this reply was NOT verified.
        send(`⚠️ Fact-check could not verify OpenClaw's reply at ${new Date(ts).toISOString().slice(11, 16)} UTC ("${reply.slice(0, 60).replace(/\s+/g, ' ')}…"). Check it against your document's 📍 lines before you repeat it.`);
      }
      if (!problems.length) continue;
      const at = new Date(ts).toISOString().slice(11, 16);
      for (const p of problems) flags.push({ at: new Date(ts).toISOString(), company, claim: p.claim, why: p.why, source_says: p.source_says || '' });
      // 25 Oct: cut at a word, never mid-word ("…the COACHIN"), one finding per short block.
      const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n))}…`; };
      const items = problems.slice(0, 4).map((p, i) => `${i + 1}. "${clip(p.claim, 180)}"\n   ❌ ${clip(p.why, 200)}`
        + (p.source_says ? `\n   📄 Your document: "${clip(String(p.source_says).replace(/^["“']|["”']$/g, ''), 220)}"` : ''));
      const more = problems.length > 4 ? `\n\n…and ${problems.length - 4} more of the same kind (all on its trap list).` : '';
      send(`🔎 Fact-check — PrepClaw's reply at ${at} UTC:\n\n${items.join('\n\n')}${more}\n\nDon't repeat these in the interview.`);
    }
  }
  state.factScannedTo = newest;
  if (!DRY) fs.writeFileSync(FLAGS, JSON.stringify(flags.slice(-300), null, 2), { mode: 0o600 });   // the pack shows its company's last 30
  // New flags reach the coach now, not at the next 30-min refresh.
  if (!DRY && flags.length !== readJson(FLAGS + '.count', 0)) {
    fs.writeFileSync(FLAGS + '.count', String(flags.length));
    try { execFileSync(process.execPath, [path.join(__dirname, 'hs-study-pack.cjs'), '--refresh'], { stdio: 'ignore', timeout: 120000 }); } catch {}
  }
  console.log(`factcheck ${new Date().toISOString()}: ${checked} reply(s) checked`);
  // 25 Oct (Elena: "how to stop circling back to Claude to fix each response?"): a weekly proposal is too slow while
  // she is prepping daily. Enough new flags → propose now (at most every 6 h); Sunday's cron still catches the rest.
  const pending = flags.filter((f) => Date.parse(f.at) > (state.rulesProposedTo || 0)).length;
  if (!DRY && pending >= 6 && Date.now() - (state.rulesProposedAt || 0) > 6 * 3600 * 1000) await proposeRules(state);
}

/**
 * Weekly (25 Oct): the fact-check flags since the last proposal → mistake TYPES that repeat (≥2) and no current rule
 * covers → at most 3 generic rules, proposed to Elena. Approval is hers ("/rules approve R1"); this only proposes.
 */
async function proposeRules(state) {
  const PROPOSALS = path.join(OC, 'private', 'rule-proposals.json');
  const LEARNED = path.join(OC, 'private', 'learned-rules.json');
  const since = state.rulesProposedTo || 0;
  const fresh = readJson(FLAGS, []).filter((f) => Date.parse(f.at) > since);
  if (fresh.length < 3) return console.log(`rules: ${fresh.length} new flag(s) — too few to see a pattern`);
  const props = readJson(PROPOSALS, []);
  const rules = (fs.readFileSync(path.join(__dirname, 'hs-study-pack.cjs'), 'utf8').match(/const RULES = [\s\S]*?`;\r?\n/) || [''])[0];
  const known = [...readJson(LEARNED, []).map((r) => r.rule), ...props.filter((p) => p.status !== 'approved').map((p) => `${p.rule} (${p.status})`)];
  const content = `MISTAKES are what an AI interview coach told Elena that a fact-checker found unsupported by her own documents.
Group them by the TYPE of mistake (how it went wrong — e.g. a quote cut without '…', a reason the document never gives,
an unlabelled opinion), never by topic. For each TYPE seen at least 2 times that the CURRENT RULES and KNOWN RULES do not
already cover, write ONE rule for the coach: generic for ANY company and ANY document, imperative, at most 2 sentences,
no company names, no content from these documents. Add one short example of the mistake (may quote a flag) and how
many flags show it. At most 3, best first; [] if nothing new. Use single quotes inside strings.
Return ONLY a JSON array: [{"rule":"…","example":"…","count":N}]

CURRENT RULES:
${rules}

KNOWN RULES (approved, pending or rejected — do not propose again):
${known.join('\n') || '(none)'}

MISTAKES:
${fresh.map((f) => `- [${f.company || '?'}] "${String(f.claim).slice(0, 220)}" — ${String(f.why).slice(0, 220)}`).join('\n')}`;
  let found = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const s = await askClaude('(see the message)', content, 3000); found = JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1)); break; }
    catch (e) { console.log(`rules: unreadable answer (${String(e.message).slice(0, 80)})`); if (attempt) return; }  // state not advanced → retried next run
  }
  found = found.filter((r) => r && r.rule && Number(r.count) >= 2).slice(0, 3);
  let n = props.reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0);
  const added = found.map((r) => ({ id: `R${++n}`, rule: String(r.rule).trim(), example: String(r.example || '').slice(0, 240), count: Number(r.count), status: 'pending', at: new Date().toISOString() }));
  state.rulesProposedTo = Math.max(...fresh.map((f) => Date.parse(f.at)));
  state.rulesProposedAt = Date.now();
  if (!added.length) return console.log(`rules: ${fresh.length} flags, no new repeated mistake type`);
  if (!DRY) fs.writeFileSync(PROPOSALS, JSON.stringify([...props, ...added], null, 2), { mode: 0o600 });
  send(`📚 OpenClaw learned from its last ${fresh.length} fact-check flags. Proposed rules — nothing changes until you approve:\n${added
    .map((r) => `${r.id}: ${r.rule}\n   seen ${r.count}× — e.g. ${r.example}`).join('\n')}\nReply /rules approve ${added[0].id} · /rules reject ${added[0].id} · /rules to see all.`);
}

(async () => {
  const state = readJson(STATE, { alerted: {} });
  if (process.argv.includes('--scan')) scan(state);
  if (process.argv.includes('--probe')) await probe(state);
  if (process.argv.includes('--factcheck')) await factcheck(state);
  if (process.argv.includes('--propose-rules')) await proposeRules(state);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  if (!DRY) fs.writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
})().catch((e) => { console.log(`⚠️ ${e.message}`); process.exitCode = 1; });
