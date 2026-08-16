#!/usr/bin/env node
/**
 * LLM chain eval — can every provider actually do the job we give it?
 *
 * The VJH equivalent is evals/test_provider_chain.py (pytest). cto-aipa has no
 * test framework, so this follows the repo's own convention: a standalone script
 * under scripts/, run via `npm run eval:llm`.
 *
 * Why it exists (2026-08-16): Groq retired llama-3.3-70b and every free-tier
 * replacement is a REASONING model — it spends a small max_tokens budget
 * thinking privately and returns "" or a reply truncated mid-sentence. Callers
 * read that as a valid answer. This script asks each provider the two shapes
 * this repo really uses, at the budgets it really sends:
 *
 *   SHORT  (30 tokens)  — telegram voice-intent classifier
 *   NORMAL (300 tokens) — drafts, triage, summaries
 *
 * A provider that cannot answer SHORT must not be used for classification, no
 * matter how capable it is on long work. That distinction is the whole point.
 *
 *   node scripts/eval-llm-chain.cjs           # all providers, both shapes
 *   node scripts/eval-llm-chain.cjs --short   # only the 30-token shape
 *
 * Exit code 1 if any configured provider fails its own shape, so this can gate a
 * deploy. Providers with no key are SKIPPED, never failed.
 */
require('dotenv').config();

const SHORT_TOKENS = 30;
const NORMAL_TOKENS = 300;

const CLASSIFY_PROMPT =
  'Classify this message intent in ONE word: question, complaint, or spam.\n' +
  'Message: "How much does your WhatsApp AI assistant cost for a small clinic?"';
const DRAFT_PROMPT =
  'Reply warmly in two sentences to a clinic owner who loses WhatsApp enquiries overnight.';

const PROVIDERS = {
  openai: {
    key: 'OPENAI_API_KEY',
    model: () => process.env.OPENAI_FALLBACK_MODEL?.trim() || 'gpt-4o-mini',
    call: openaiStyle('https://api.openai.com/v1/chat/completions'),
  },
  gemini: {
    key: 'GEMINI_API_KEY',
    model: () => process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    call: gemini,
  },
  groq: {
    key: 'GROQ_API_KEY',
    model: () => process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    call: openaiStyle('https://api.groq.com/openai/v1/chat/completions', {
      'User-Agent': 'Mozilla/5.0 (cto-aipa eval)',
    }),
  },
  grok: {
    key: 'XAI_API_KEY',
    model: () => process.env.XAI_MODEL?.trim() || 'grok-4.20-0309-non-reasoning',
    call: openaiStyle('https://api.x.ai/v1/chat/completions'),
  },
  claude: {
    key: 'ANTHROPIC_API_KEY',
    model: () => process.env.CLAUDE_EVAL_MODEL?.trim() || 'claude-haiku-4-5-20251001',
    call: anthropic,
  },
};

function openaiStyle(url, extraHeaders) {
  return async (key, model, prompt, maxTokens) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 90)}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content || '';
  };
}

async function gemini(key, model, prompt, maxTokens) {
  // No thinkingConfig: gemini-3.5-flash-lite is a PLAIN model and rejects
  // thinkingBudget with a 400. That rejection is why it was chosen.
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
      }),
    },
  );
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 90)}`);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function anthropic(key, model, prompt, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 90)}`);
  const j = await r.json();
  return (j.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

const SHAPES = [
  { name: 'SHORT  (30t, voice-intent classifier)', tokens: SHORT_TOKENS, prompt: CLASSIFY_PROMPT },
  { name: 'NORMAL (300t, drafts & triage)', tokens: NORMAL_TOKENS, prompt: DRAFT_PROMPT },
];

(async () => {
  const onlyShort = process.argv.includes('--short');
  const shapes = onlyShort ? SHAPES.slice(0, 1) : SHAPES;
  let failures = 0;

  for (const shape of shapes) {
    console.log(`\n=== ${shape.name} ===`);
    for (const [name, p] of Object.entries(PROVIDERS)) {
      const key = process.env[p.key]?.trim();
      if (!key) {
        console.log(`  ${name.padEnd(8)} SKIP   no ${p.key}`);
        continue;
      }
      const t0 = Date.now();
      try {
        const text = (await p.call(key, p.model(), shape.prompt, shape.tokens)).trim();
        const ms = Date.now() - t0;
        if (!text) {
          failures++;
          console.log(
            `  ${name.padEnd(8)} FAIL   EMPTY at ${shape.tokens} tokens (${p.model()}) — ` +
              `would fail callers OPEN`,
          );
        } else {
          console.log(`  ${name.padEnd(8)} ok     ${String(ms).padStart(5)}ms  ${JSON.stringify(text.slice(0, 46))}`);
        }
      } catch (e) {
        failures++;
        console.log(`  ${name.padEnd(8)} FAIL   ${String(e.message).slice(0, 80)}`);
      }
    }
  }

  console.log(
    failures === 0
      ? '\n✅ every configured provider answered at every shape'
      : `\n❌ ${failures} provider/shape combination(s) failed — do not ship a chain that depends on them`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
