/**
 * llm-resilience.ts — canonical Groq fallback wrapper
 *
 * When Anthropic credits exhaust (HTTP 400 + "credit"/"balance"/"billing" in body),
 * these helpers route to Groq llama-3.3-70b-versatile instead of dying silently.
 * Non-credit errors re-throw so retry logic and error boundaries upstream still work.
 *
 * Pattern originated in lead-triage.ts and daily-blog-publisher.ts; generalised here
 * after the 2026-05-28 resilience audit that found 12 unprotected Anthropic call sites.
 */

import Groq from 'groq-sdk';
import type Anthropic from '@anthropic-ai/sdk';

export const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 8000;

// Tier 3 (June 11 2026): xAI Grok — the rhino-sneezing-lemon team credits, already
// proven live in Algom. Fires only when Anthropic is credit-dead AND Groq failed
// (e.g. free-tier 100k tokens-per-DAY exhausted — waiting doesn't help within a day).
const XAI_MODEL = () => (process.env.XAI_MODEL || 'grok-4.20-0309-non-reasoning').trim();
const XAI_KEY = () => process.env.XAI_API_KEY?.trim() || '';

/** OpenAI-compatible xAI chat call via fetch — no new dependency. Exported so other
 *  fallback wrappers (daily-blog-publisher) can use the same tier-3 engine. */
export async function grokComplete(
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const messages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
    : [{ role: 'user', content: userPrompt }];
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${XAI_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: XAI_MODEL(), messages, max_tokens: Math.min(maxTokens, 8000), temperature: 0.7 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  if (text) console.warn(`[${label}] Grok (xAI) fallback returned ${text.length} chars`);
  return text;
}

const GEMINI_MODEL = () => (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const GEMINI_KEY = () => process.env.GEMINI_API_KEY?.trim() || '';

/** Free-tier Gemini via REST (no SDK). Its generous free quota (~1500 req/day) makes it
 *  the durable $0 tier for high-volume-but-not-latency-critical work like blog translation —
 *  so coverage never depends on keeping paid Anthropic credits topped up. Throws on any
 *  failure so callers can fall through to the paid/limited Anthropic→Groq→Grok chain. */
export async function geminiComplete(
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const model = GEMINI_MODEL();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 8192),
          temperature: 0.3,
          // Disable "thinking" so the whole token budget goes to output, not reasoning.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (text) console.warn(`[${label}] Gemini (${model}) returned ${text.length} chars`);
  return text;
}

/** True when the Anthropic error is credit/balance exhaustion (400), not a transient failure. */
export function isAnthropicCreditExhaustion(e: unknown): boolean {
  const msg = String(
    (e as any)?.error?.error?.message ||
    (e as any)?.message ||
    e ||
    ''
  ).toLowerCase();
  const status = (e as any)?.status ?? (e as any)?.statusCode ?? null;
  return (
    (status === 400 || msg.includes('400')) &&
    (msg.includes('credit') || msg.includes('balance') || msg.includes('billing'))
  );
}

/** True when the Anthropic error is a decommissioned/unknown model (404 not_found), not a transient failure.
 *  Historically these were mislabeled as "credit exhausted" — they need the model id updated, not a top-up. */
export function isAnthropicModelNotFound(e: unknown): boolean {
  const msg = String(
    (e as any)?.error?.error?.message ||
    (e as any)?.message ||
    e ||
    ''
  ).toLowerCase();
  const status = (e as any)?.status ?? (e as any)?.statusCode ?? null;
  return (status === 404 || msg.includes('404')) && (msg.includes('not_found') || msg.includes('model:'));
}

/**
 * Drop-in replacement for a single anthropic.messages.create() call.
 * Returns the text content string (empty string if model returned no text).
 * On credit exhaustion routes to Groq llama-3.3-70b-versatile.
 * On all other errors re-throws so upstream retry / error handling still works.
 */
export async function claudeWithGroqFallback(
  anthropic: Anthropic,
  model: string,
  maxTokens: number,
  systemPrompt: string | null,
  userPrompt: string,
  label: string,
): Promise<string> {
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = resp.content[0];
    return block && block.type === 'text' ? block.text : '';
  } catch (e: unknown) {
    const deadModel = isAnthropicModelNotFound(e);
    if (!isAnthropicCreditExhaustion(e) && !deadModel) throw e;
    // Accurate reason — a decommissioned model id (404) was historically mislabeled as "credit exhausted".
    const reason = deadModel
      ? `Anthropic model not found (${model} — decommissioned? update the id)`
      : 'Anthropic credit exhausted';
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey && !XAI_KEY()) throw e;

    // Tier 2: Groq (free) — primary fallback.
    if (groqKey) {
      try {
        console.warn(`[${label}] ${reason} — falling back to Groq ${GROQ_FALLBACK_MODEL}`);
        const groq = new Groq({ apiKey: groqKey });
        const messages: Array<{ role: 'system' | 'user'; content: string }> = systemPrompt
          ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
          : [{ role: 'user', content: userPrompt }];
        const groqResp = await groq.chat.completions.create({
          model: GROQ_FALLBACK_MODEL,
          messages,
          max_tokens: Math.min(maxTokens, GROQ_MAX_TOKENS),
          temperature: 0.7,
        });
        const text = groqResp.choices[0]?.message?.content?.trim() || '';
        if (text) console.warn(`[${label}] Groq fallback returned ${text.length} chars`);
        return text;
      } catch (ge: unknown) {
        // Tier 3: Grok (xAI team credits). Groq's daily token cap (TPD) or any other
        // Groq failure lands here — the engine keeps producing instead of dying.
        if (!XAI_KEY()) throw ge;
        const gmsg = ge instanceof Error ? ge.message : String(ge);
        console.warn(`[${label}] Groq failed (${gmsg.slice(0, 100)}) — falling back to Grok ${XAI_MODEL()}`);
        return grokComplete(systemPrompt, userPrompt, maxTokens, label);
      }
    }
    // No Groq key configured — go straight to Grok.
    console.warn(`[${label}] ${reason} — falling back to Grok ${XAI_MODEL()}`);
    return grokComplete(systemPrompt, userPrompt, maxTokens, label);
  }
}
