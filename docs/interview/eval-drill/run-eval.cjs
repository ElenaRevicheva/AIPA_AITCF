#!/usr/bin/env node
/**
 * Prompt × model × sampling eval for ONE flow: a customer message to an auto-repair
 * shop → a structured intake JSON (intent, vehicle, parts, amount, safety flag, reply).
 *
 * Why this exists: "which prompt / model / temperature is better?" is answered with a
 * fixed case set and a grader, not by reading three outputs and picking the one that
 * feels right. Same cases, same grader, one thing changed at a time.
 *
 *   node run-eval.cjs --selftest                       # grader wiring: oracle must be 100%, null baseline shown
 *   node run-eval.cjs --env ~/cto-aipa/.env \
 *        --prompts v1,v2,v3 --models gpt-4.1-mini,gpt-5-mini --temps default --reps 1 --out results/grid
 *   node run-eval.cjs --env ... --prompts v2 --models gpt-4.1-mini --temps 0,0.7,1.3 --reps 5 --out results/temp
 *
 * Flags: --effort <low|minimal|medium…> (OpenAI reasoning_effort / Claude output_config.effort)
 *        --force-temp  send temperature even to models documented to reject it (to SEE the 400)
 *        --concurrency 4  --timeout-s 90  --limit N  --resume
 *
 * Rules this runner follows (from the eval checklist):
 *   - an API error is NOT a wrong answer: it goes to errors.jsonl, never into the score;
 *   - a reply cut off by max_tokens is status "truncated", counted, not averaged in;
 *   - the model that SERVED the request is recorded and checked against the one asked for;
 *   - every row is written as it finishes (a crash keeps what is done; --resume skips it);
 *   - the summary prints the noise floor, so a 5-point "win" on 20 cases is not mistaken for signal.
 * No dependencies — Node 18+ (global fetch). Keys come from the environment or --env <file>.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const HERE = __dirname;
const ENV_FILE = arg('env', null);
const PROMPTS = String(arg('prompts', 'v2')).split(',');
const MODELS = String(arg('models', 'gpt-4.1-mini')).split(',');
const TEMPS = String(arg('temps', 'default')).split(',');
const REPS = parseInt(arg('reps', '1'), 10);
const OUT = path.resolve(String(arg('out', path.join(HERE, 'results', 'run'))));
const CONC = parseInt(arg('concurrency', '4'), 10);
const TIMEOUT_S = parseInt(arg('timeout-s', '90'), 10);
const LIMIT = arg('limit', null);
const EFFORT = arg('effort', null);
const FORCE_TEMP = argv.includes('--force-temp');
const RESUME = argv.includes('--resume');
const SELFTEST = argv.includes('--selftest');
const REGRADE = argv.includes('--regrade');

// ---------------------------------------------------------------- env
if (ENV_FILE) {
  const p = String(ENV_FILE).replace(/^~(?=\/)/, process.env.HOME || '');
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const scrub = s => String(s || '')
  .replace(/key=[^&\s"]+/gi, 'key=***')
  .replace(/(sk|xai|gsk|AIza)[-_A-Za-z0-9]{12,}/g, '***');

// ---------------------------------------------------------------- data
const CASES_ALL = fs.readFileSync(path.join(HERE, 'cases.jsonl'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const CASES = LIMIT ? CASES_ALL.slice(0, parseInt(LIMIT, 10)) : CASES_ALL;

function loadPrompt(name) {
  const raw = fs.readFileSync(path.join(HERE, 'prompts', name + '.md'), 'utf8');
  return raw.replace(/^@include (\S+)\s*$/m, (_, f) => fs.readFileSync(path.join(HERE, 'prompts', f), 'utf8').trim());
}

// ---------------------------------------------------------------- providers
// Same rule as src/cover-letter.ts and scripts/lib/cv-compose.cjs: OpenAI reasoning models reject temperature.
const OPENAI_REASONING = /^(gpt-5|o\d)/;
// Claude models released after Opus 4.6: temperature is deprecated — only the default 1.0 is accepted, any other
// value is a 400 (top_p only ≥ 0.99, top_k never). Effort is the knob instead. Docs-backed: the probe account had no credit.
const CLAUDE_NO_SAMPLING = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[78])/;

function route(spec) {
  const [maybeProvider, ...rest] = spec.split(':');
  if (rest.length && ['openai', 'anthropic', 'gemini', 'groq', 'xai'].includes(maybeProvider)) {
    return { provider: maybeProvider, model: rest.join(':') };
  }
  if (/^claude-/.test(spec)) return { provider: 'anthropic', model: spec };
  if (/^gemini-/.test(spec)) return { provider: 'gemini', model: spec };
  if (/^grok-/.test(spec)) return { provider: 'xai', model: spec };
  if (/\//.test(spec)) return { provider: 'groq', model: spec }; // e.g. openai/gpt-oss-120b on Groq
  return { provider: 'openai', model: spec };
}

function samplingSupported(provider, model) {
  if (provider === 'openai') return !OPENAI_REASONING.test(model);
  if (provider === 'anthropic') return !CLAUDE_NO_SAMPLING.test(model);
  return true;
}

async function post(url, headers, body) {
  const t0 = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_S * 1000),
  });
  const text = await r.text();
  const latency = (Date.now() - t0) / 1000;
  let j = null;
  try { j = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) {
    const e = new Error(`${r.status} ${scrub((j && (j.error?.message || j.error?.type)) || text).slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
  return { j, latency };
}

function openaiCompatible(url, keyVar, extraHeaders = {}) {
  return async ({ model, system, user, temp }) => {
    const key = process.env[keyVar];
    if (!key) throw Object.assign(new Error(`no ${keyVar}`), { status: 'nokey' });
    const reasoning = url.includes('api.openai.com') && OPENAI_REASONING.test(model);
    const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (url.includes('api.openai.com')) body.response_format = { type: 'json_object' };
    if (reasoning) {
      body.max_completion_tokens = 6000; // reasoning tokens are spent from this budget
      if (EFFORT) body.reasoning_effort = EFFORT;
    } else {
      body.max_tokens = 700;
    }
    if (temp !== 'default') body.temperature = Number(temp);
    const { j, latency } = await post(url, { authorization: `Bearer ${key}`, ...extraHeaders }, body);
    const c = j.choices?.[0] || {};
    return {
      text: c.message?.content || '',
      served: j.model || model,
      stop: c.finish_reason === 'length' ? 'max_tokens' : (c.finish_reason || ''),
      usage: {
        input_tokens: j.usage?.prompt_tokens ?? null,
        output_tokens: j.usage?.completion_tokens ?? null,
        reasoning_tokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      },
      latency,
    };
  };
}

const PROVIDERS = {
  openai: openaiCompatible('https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY'),
  groq: openaiCompatible('https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', { 'user-agent': 'Mozilla/5.0 (eval-drill)' }),
  xai: openaiCompatible('https://api.x.ai/v1/chat/completions', 'XAI_API_KEY'),
  async anthropic({ model, system, user, temp }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw Object.assign(new Error('no ANTHROPIC_API_KEY'), { status: 'nokey' });
    const noSampling = CLAUDE_NO_SAMPLING.test(model);
    const body = { model, max_tokens: noSampling ? 8000 : 800, system, messages: [{ role: 'user', content: user }] };
    if (temp !== 'default') body.temperature = Number(temp);
    if (EFFORT && noSampling) body.output_config = { effort: EFFORT };
    const { j, latency } = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body);
    return {
      text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''),
      served: j.model || model,
      stop: j.stop_reason || '',
      usage: { input_tokens: j.usage?.input_tokens ?? null, output_tokens: j.usage?.output_tokens ?? null, reasoning_tokens: null },
      latency,
    };
  },
  async gemini({ model, system, user, temp }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw Object.assign(new Error('no GEMINI_API_KEY'), { status: 'nokey' });
    const generationConfig = { responseMimeType: 'application/json', maxOutputTokens: 4000 };
    if (temp !== 'default') generationConfig.temperature = Number(temp);
    const { j, latency } = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {},
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig });
    const cand = j.candidates?.[0] || {};
    return {
      text: (cand.content?.parts || []).map(p => p.text || '').join(''),
      served: j.modelVersion || model,
      stop: cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : (cand.finishReason || ''),
      usage: {
        input_tokens: j.usageMetadata?.promptTokenCount ?? null,
        output_tokens: j.usageMetadata?.candidatesTokenCount ?? null,
        reasoning_tokens: j.usageMetadata?.thoughtsTokenCount ?? null,
      },
      latency,
    };
  },
};

async function callWithRetry(provider, args) {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      const out = await PROVIDERS[provider](args);
      return { ...out, attempts: attempt };
    } catch (e) {
      const retryable = e.status === 429 || (typeof e.status === 'number' && e.status >= 500) || e.name === 'TimeoutError' || e.name === 'TypeError';
      if (!retryable || attempt >= 3) { e.attempts = attempt; throw e; }
      await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1) + Math.random() * 500));
    }
  }
}

// ---------------------------------------------------------------- grading
const PART_CODES = ['brake_pads', 'brake_discs', 'oil_change', 'tune_up', 'battery', 'alternator', 'starter', 'spark_plugs', 'tires',
  'alignment_balancing', 'shock_absorbers', 'clutch', 'timing_belt', 'coolant_radiator', 'ac_service', 'diagnostic_scan'];
const FIELDS = ['intent', 'make', 'model', 'year', 'parts', 'amount_mxn', 'safety_critical'];
const NULLABLE = ['make', 'model', 'year', 'amount_mxn'];

function normText(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  return ['', 'null', 'none', 'unknown', 'desconocido', 'n/a', 'na', '-'].includes(t) ? null : t;
}
function normMake(s) {
  const t = normText(s);
  return t === null ? null : ({ vw: 'volkswagen', 'volkswagen (vw)': 'volkswagen' }[t] || t);
}
function normModel(s, make) {
  let t = normText(s);
  if (t === null) return null;
  for (const m of [make, 'nissan', 'chevrolet', 'volkswagen', 'vw', 'toyota', 'ford', 'honda', 'mazda', 'kia']) {
    if (m && t.startsWith(m + ' ')) t = t.slice(m.length + 1);
  }
  return t.replace(/[\s-]/g, '');
}
function normYear(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function normAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]|mxn|pesos/gi, ''));
  return Number.isFinite(n) ? n : null;
}
function normBool(v) {
  if (typeof v === 'boolean') return v;
  const t = normText(v);
  return t === 'true' || t === 'si' || t === 'yes';
}

function parseOutput(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

function canonical(pred) {
  if (!pred || typeof pred !== 'object') return null;
  const v = pred.vehicle || {};
  const make = normMake(v.make);
  return {
    intent: normText(pred.intent),
    make,
    model: normModel(v.model, make),
    year: normYear(v.year),
    parts: Array.isArray(pred.parts) ? [...new Set(pred.parts.map(normText).filter(Boolean))].sort() : [],
    amount_mxn: normAmount(pred.amount_mxn),
    safety_critical: normBool(pred.safety_critical),
  };
}

function grade(pred, expected) {
  const p = canonical(pred);
  const g = canonical(expected);
  const valid = p !== null;
  const correct = {};
  for (const f of FIELDS) correct[f] = valid && JSON.stringify(p[f]) === JSON.stringify(g[f]);
  const pp = valid ? p.parts : [], gp = g.parts;
  const tp = pp.filter(x => gp.includes(x)).length;
  const prec = pp.length ? tp / pp.length : (gp.length ? 0 : 1);
  const rec = gp.length ? tp / gp.length : (pp.length ? 0 : 1);
  const invented = valid ? NULLABLE.filter(f => g[f] === null && p[f] !== null) : [];
  const reply = valid && typeof pred.reply === 'string' ? pred.reply.trim() : '';
  // Grader v2 (18 Oct, found by reading the failures): repeating the CUSTOMER's own amount back
  // ("con presupuesto de 3,500 pesos") is not the shop quoting a price. Grader v1 flagged 24 replies; 18 of them were this.
  const money = [...reply.matchAll(/\$\s?([\d][\d.,]*)|([\d][\d.,]*)\s?(?:pesos|mxn)\b/gi)]
    .map(m => Number(String(m[1] || m[2]).replace(/,/g, '').replace(/\.$/, '')));
  const replyPrice = money.some(x => x !== g.amount_mxn);
  const replyFree = /gratis|sin costo|free of charge|for free|no cost/i.test(reply);
  return {
    json_valid: valid ? 1 : 0,
    case_pass: valid && FIELDS.every(f => correct[f]) ? 1 : 0,
    field_acc: FIELDS.filter(f => correct[f]).length / FIELDS.length,
    parts_f1: prec + rec ? (2 * prec * rec) / (prec + rec) : 0,
    invented_fields: invented.length,
    null_slots: NULLABLE.filter(f => g[f] === null).length,
    extra_parts: valid ? pp.filter(x => !gp.includes(x)).length : 0,
    unknown_part_codes: valid ? pp.filter(x => !PART_CODES.includes(x)).length : 0,
    safety_gold: g.safety_critical ? 1 : 0,
    safety_hit: g.safety_critical && valid && p.safety_critical ? 1 : 0,
    safety_false_alarm: !g.safety_critical && valid && p.safety_critical ? 1 : 0,
    reply_ok: reply && reply.length <= 300 && !replyPrice && !replyFree ? 1 : 0,
    correct,
    invented,
  };
}

// ---------------------------------------------------------------- selftest (oracle + null baseline)
if (SELFTEST) {
  const oracle = CASES.map(c => grade({ ...c.expected, reply: 'Con gusto, ¿de qué año es su vehículo?' }, c.expected));
  const nul = CASES.map(c => grade({}, c.expected));
  const broken = CASES.map(c => grade(null, c.expected));
  const mean = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  console.log(`oracle (gold answers):   case_pass ${(100 * mean(oracle, 'case_pass')).toFixed(0)}%  field_acc ${(100 * mean(oracle, 'field_acc')).toFixed(0)}%   ← must be 100/100`);
  console.log(`null baseline ("{}"):    case_pass ${(100 * mean(nul, 'case_pass')).toFixed(0)}%  field_acc ${(100 * mean(nul, 'field_acc')).toFixed(0)}%   ← free points a do-nothing model gets`);
  console.log(`unparseable output:      case_pass ${(100 * mean(broken, 'case_pass')).toFixed(0)}%  field_acc ${(100 * mean(broken, 'field_acc')).toFixed(0)}%   ← must be 0/0`);
  // reply grader on known-good and known-bad replies (case c04: the customer said 4,800)
  const c04 = CASES_ALL.find(c => c.id === 'c04').expected;
  const replyChecks = [
    ['echoes the customer amount', 'Confirmamos batería y alternador por 4,800 pesos; ¿qué vehículo es?', 1],
    ['quotes a new shop price', 'Le queda en $5,200 con mano de obra; ¿qué vehículo es?', 0],
    ['promises free work', 'Listo, se lo hacemos gratis.', 0],
  ].map(([name, reply, want]) => ({ name, ok: grade({ ...c04, reply }, c04).reply_ok === want }));
  for (const r of replyChecks) console.log(`reply grader — ${r.name}: ${r.ok ? 'pass' : 'FAIL'}`);
  const bad = oracle.filter(o => !o.case_pass).length + replyChecks.filter(r => !r.ok).length;
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- run
fs.mkdirSync(OUT, { recursive: true });
const RESULTS = path.join(OUT, 'results.jsonl');
const ERRORS = path.join(OUT, 'errors.jsonl');
const GRADER_VERSION = 2;

// --regrade: re-score saved outputs with the current grader — no API calls. Scores from two grader
// versions are never mixed: the old file is kept as results.grader-v<N>.jsonl and every row is re-graded.
if (REGRADE) {
  const byId = Object.fromEntries(CASES_ALL.map(c => [c.id, c]));
  const rows = fs.readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const oldV = rows[0]?.grader || 1;
  fs.copyFileSync(RESULTS, path.join(OUT, `results.grader-v${oldV}.jsonl`));
  fs.writeFileSync(RESULTS, rows.map(r => JSON.stringify({ ...r, grader: GRADER_VERSION, grade: grade(r.pred, byId[r.case_id].expected) })).join('\n') + '\n');
  console.log(`re-graded ${rows.length} rows: grader v${oldV} → v${GRADER_VERSION}`);
}

const runKey = r => [r.prompt, r.model_requested, r.temp, r.effort, r.case_id, r.rep].join('|');
const done = new Set();
if ((RESUME || REGRADE) && fs.existsSync(RESULTS)) {
  for (const l of fs.readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean)) done.add(runKey(JSON.parse(l)));
} else {
  for (const f of [RESULTS, ERRORS]) if (fs.existsSync(f)) fs.unlinkSync(f);
}
const append = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');

const jobs = [];
const skippedConfigs = [];
for (const promptName of PROMPTS) {
  const system = loadPrompt(promptName);
  for (const spec of MODELS) {
    const { provider, model } = route(spec);
    for (const temp of TEMPS) {
      if (temp !== 'default' && !samplingSupported(provider, model) && !FORCE_TEMP) {
        skippedConfigs.push({ prompt: promptName, model, temp, reason: 'model rejects temperature (documented); use --force-temp to send it and record the API error' });
        continue;
      }
      for (let rep = 0; rep < REPS; rep++) {
        for (const c of CASES) {
          const k = [promptName, spec, temp, EFFORT || 'default', c.id, rep].join('|');
          if (!REGRADE && !done.has(k)) jobs.push({ promptName, system, spec, provider, model, temp, rep, c });
        }
      }
    }
  }
}
if (!REGRADE) for (const s of skippedConfigs) append(ERRORS, { kind: 'skipped_config', ...s });

let next = 0, finished = 0;
const t0 = Date.now();
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const { promptName, system, spec, provider, model, temp, rep, c } = job;
    const base = { prompt: promptName, model_requested: spec, provider, temp, effort: EFFORT || 'default', rep, case_id: c.id, tags: c.tags };
    try {
      const out = await callWithRetry(provider, { model, system, user: c.input, temp });
      const pred = parseOutput(out.text);
      const truncated = out.stop === 'max_tokens';
      const servedOk = String(out.served).startsWith(model) || String(out.served).includes(model);
      append(RESULTS, {
        ...base, grader: GRADER_VERSION, model_served: out.served, served_mismatch: !servedOk, status: truncated ? 'truncated' : 'ok',
        stop: out.stop, latency_s: out.latency, attempts: out.attempts, usage: out.usage,
        grade: grade(pred, c.expected), pred, raw: String(out.text).slice(0, 2000),
      });
    } catch (e) {
      append(ERRORS, { kind: 'call_failed', ...base, error: scrub(e.message), status: e.status ?? null, attempts: e.attempts ?? 1 });
    }
    finished++;
    if (finished % 20 === 0 || finished === jobs.length) {
      process.stdout.write(`  ${finished}/${jobs.length} calls  (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    }
  }
}

(async () => {
  if (REGRADE) { summarise(); return; }
  console.log(`eval-drill: ${CASES.length} cases × prompts [${PROMPTS}] × models [${MODELS}] × temps [${TEMPS}] × ${REPS} rep(s) = ${jobs.length} calls → ${OUT}`);
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length || 1) }, worker));
  summarise();
})();

// ---------------------------------------------------------------- summary
function pct(x) { return x === null || Number.isNaN(x) ? '–' : (100 * x).toFixed(0) + '%'; }
function q(xs, p) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

function summarise() {
  const rows = fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const errs = fs.existsSync(ERRORS) ? fs.readFileSync(ERRORS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const prices = fs.existsSync(path.join(HERE, 'prices.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'prices.json'), 'utf8')).models || {} : {};
  const groups = new Map();
  for (const r of rows) {
    const k = [r.prompt, r.model_requested, r.temp, r.effort].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const lines = [];
  lines.push(`# Eval results — ${path.basename(OUT)}`, '');
  lines.push(`${CASES.length} cases · reps ${REPS} · rows ${rows.length} · errors ${errs.filter(e => e.kind === 'call_failed').length} · skipped configs ${errs.filter(e => e.kind === 'skipped_config').length}`, '');
  const n = CASES.length * REPS;
  lines.push(`**Noise floor:** with ${CASES.length} cases × ${REPS} rep(s), a pass-rate difference smaller than about ±${Math.round(100 / Math.sqrt(n))} points is noise (≈1/√(n·reps)). Field accuracy pools ${FIELDS.length} decisions per case, so it is steadier.`, '');
  lines.push('| prompt | model (served) | temp | effort | ok/trunc | JSON valid | case pass | field acc | parts F1 | invented fields | safety recall | false alarms | reply ok | same answer every rep | p50 s | p95 s | in tok | out tok | reasoning tok | $ / 100 msgs |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const summary = [];
  for (const [k, rs] of groups) {
    const ok = rs.filter(r => r.status === 'ok');
    const trunc = rs.length - ok.length;
    const m = key => ok.length ? ok.reduce((s, r) => s + r.grade[key], 0) / ok.length : null;
    const sum = key => ok.reduce((s, r) => s + r.grade[key], 0);
    const invented = sum('invented_fields') / Math.max(1, sum('null_slots'));
    const safetyRecall = sum('safety_gold') ? sum('safety_hit') / sum('safety_gold') : null;
    const byCase = new Map();
    for (const r of ok) { if (!byCase.has(r.case_id)) byCase.set(r.case_id, []); byCase.get(r.case_id).push(JSON.stringify(canonical(r.pred))); }
    const multi = [...byCase.values()].filter(v => v.length > 1);
    const consistency = multi.length ? multi.filter(v => v.every(x => x === v[0])).length / multi.length : null;
    const lat = ok.map(r => r.latency_s);
    const avg = f => ok.length ? Math.round(ok.reduce((s, r) => s + (r.usage[f] || 0), 0) / ok.length) : null;
    const served = [...new Set(rs.map(r => r.model_served))].join(', ');
    const [prompt, model, temp, effort] = k.split('|');
    const pr = prices[model] || prices[route(model).model];
    const cost = pr && avg('input_tokens') !== null ? ((avg('input_tokens') * pr.in + avg('output_tokens') * pr.out) / 1e6) * 100 : null;
    const mismatch = rs.some(r => r.served_mismatch) ? ' ⚠️served≠asked' : '';
    const s = { prompt, model, served, temp, effort, ok: ok.length, truncated: trunc, json_valid: m('json_valid'), case_pass: m('case_pass'), field_acc: m('field_acc'), parts_f1: m('parts_f1'), invented_rate: invented, safety_recall: safetyRecall, false_alarms: sum('safety_false_alarm'), reply_ok: m('reply_ok'), consistency, p50: q(lat, 0.5), p95: q(lat, 0.95), in_tok: avg('input_tokens'), out_tok: avg('output_tokens'), reasoning_tok: avg('reasoning_tokens'), usd_per_100: cost };
    summary.push(s);
    lines.push(`| ${prompt} | ${model} (${served})${mismatch} | ${temp} | ${effort} | ${ok.length}/${trunc} | ${pct(s.json_valid)} | ${pct(s.case_pass)} | ${pct(s.field_acc)} | ${s.parts_f1 === null ? '–' : s.parts_f1.toFixed(2)} | ${pct(invented)} | ${pct(safetyRecall)} | ${s.false_alarms} | ${pct(s.reply_ok)} | ${consistency === null ? '–' : pct(consistency)} | ${s.p50?.toFixed(1) ?? '–'} | ${s.p95?.toFixed(1) ?? '–'} | ${s.in_tok ?? '–'} | ${s.out_tok ?? '–'} | ${s.reasoning_tok ?? '–'} | ${cost === null ? 'price n/a' : '$' + cost.toFixed(3)} |`);
  }
  // per-field error table: where do the misses live?
  lines.push('', '## Where the misses are (count of cases with that field wrong, status ok)', '');
  lines.push('| prompt | model | temp | ' + FIELDS.join(' | ') + ' |');
  lines.push('|---|---|---|' + FIELDS.map(() => '---').join('|') + '|');
  for (const [k, rs] of groups) {
    const ok = rs.filter(r => r.status === 'ok');
    const [prompt, model, temp] = k.split('|');
    lines.push(`| ${prompt} | ${model} | ${temp} | ` + FIELDS.map(f => ok.filter(r => !r.grade.correct[f]).length).join(' | ') + ' |');
  }
  const fails = errs;
  if (fails.length) {
    lines.push('', '## Errors and skipped configs (never scored as wrong answers)', '');
    const seen = new Map();
    for (const e of fails) {
      const key = `${e.kind} · ${e.prompt} · ${e.model || e.model_requested} · temp ${e.temp} · ${e.error || e.reason}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [key, cnt] of seen) lines.push(`- ${cnt}× ${key}`);
  }
  lines.push('', `Wall clock: ${((Date.now() - t0) / 1000).toFixed(0)} s. Generated by run-eval.cjs.`);
  fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log('\n' + lines.join('\n'));
}
