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
    if (!isAnthropicCreditExhaustion(e)) throw e;
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) throw e;
    console.warn(`[${label}] Anthropic credit exhausted — falling back to Groq ${GROQ_FALLBACK_MODEL}`);
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
  }
}
