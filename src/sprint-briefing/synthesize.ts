import Groq from 'groq-sdk';
import type { Anthropic } from '@anthropic-ai/sdk';

const GROQ_MODEL = process.env.SPRINT_BRIEFING_GROQ_MODEL || 'llama-3.3-70b-versatile';
const CLAUDE_MODEL = process.env.SPRINT_BRIEFING_CLAUDE_MODEL || 'claude-sonnet-4-6';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Free-tier Gemini fallback (REST, no SDK). Keeps the 8AM briefing alive when both the
 *  paid Anthropic credits AND Groq's daily cap are exhausted — exactly the failure that
 *  drops the Sprinter on heavy days. Returns '' on any failure so callers can degrade. */
async function geminiText(prompt: string, maxTokens = 4096): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return '';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: Math.min(maxTokens, 8192), temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!res.ok) { console.warn(`[sprint] Gemini ${res.status}: ${(await res.text()).slice(0, 120)}`); return ''; }
    const d = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const t = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (t) console.log(`[sprint] Gemini (${GEMINI_MODEL}) returned ${t.length} chars`);
    return t;
  } catch (e) {
    console.warn('[sprint] Gemini failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

/** Fast clustering / deltas — Groq, then free-Gemini fallback so a Groq-dry morning can't kill it. */
export async function clusterSignalsWithGroq(groq: Groq, rawDigest: string): Promise<string> {
  const prompt = `You are a delivery lead extracting STRUCTURED FACTS from raw sprint signals.

Return markdown sections:
1) Themes (3-7 bullets)
2) Blockers / risks
3) What changed since "yesterday" (infer from timestamps if present)
4) Stale items (no movement implied)
5) CI / merge highlights

RAW SIGNALS:
---
${rawDigest.slice(0, 120000)}
---

Keep under 1200 words. Be factual — no invention.`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
    });
    const text = completion.choices[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return text;
  } catch (err) {
    console.warn(`[sprint] Groq clustering failed (${(err as { status?: number })?.status ?? (err instanceof Error ? err.message : '')}) — trying Gemini`);
  }
  // Free-Gemini fallback; empty result is acceptable (narrative still works from RAW).
  return await geminiText(prompt, 4096);
}

/** Narrative briefing script — Claude Sonnet with Groq fallback on credit exhaustion (400). */
export async function writeBriefingNarrative(
  anthropic: Anthropic,
  clusterMarkdown: string,
  rawDigest: string,
): Promise<string> {
  const prompt = `Write a SPOKEN morning briefing for Elena Revicheva — a solo technical founder (3-5 minutes when read aloud).

HARD RULES — violating any of these is a critical failure:
1. ONLY reference facts that appear in the CLUSTER or RAW below. Zero invention. Zero filler.
2. If commits are present — name them specifically (repo name + commit message). This is the primary freshness signal.
3. If voice notes / diary / tasks are present — surface them explicitly at the start. These are Elena's own words from yesterday. They come first.
4. If Trello cards are present (section "📋 Trello — active today") — mention them after voice notes, before GitHub. Say "Your Trello board shows X items active today: [names]."
5. If a section has NO data (e.g. no commits, no tasks) — say so briefly and move on. Do NOT pad with generalities.
6. Start with voice notes and personal context if present, then Trello active cards, then GitHub activity, then focus suggestion.
6. End with ONE concrete action she can take in the next 2 hours based on what actually happened.

FORMAT:
- Conversational, direct. Spoken out loud. No markdown in output — plain sentences only.
- Start: "Good morning Elena. Here's what actually happened while you were offline."
- Sections: personal notes first → repo activity (commits, PRs) → one focus action.

CLUSTER (Groq-structured facts):
${clusterMarkdown}

RAW SIGNALS (live data — use these):
${rawDigest.slice(0, 60000)}
`;

  // Try Claude first
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = msg.content[0];
    return block && block.type === 'text' ? block.text : '';
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status !== 400 && status !== 529 && status !== 503) throw err;
    console.warn(`[sprint] Claude narrative failed (${status}) — falling back to Groq`);
  }

  // Groq fallback — llama-3.3-70b-versatile, same model as clustering
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const { default: Groq } = await import('groq-sdk');
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt.slice(0, 28000) }],
        temperature: 0.3,
        max_tokens: 4096,
      });
      const text = completion.choices[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) {
        console.log('[sprint] Groq narrative fallback succeeded');
        return text;
      }
    } catch (err) {
      console.warn(`[sprint] Groq narrative failed (${(err as { status?: number })?.status ?? (err instanceof Error ? err.message : '')}) — trying Gemini`);
    }
  }

  // Final free-tier fallback — Gemini — so the briefing survives a fully Groq-dry morning.
  const gem = await geminiText(prompt.slice(0, 120000), 4096);
  if (gem) {
    console.log('[sprint] Gemini narrative fallback succeeded');
    return gem;
  }
  throw new Error('All narrative providers failed (Claude credit-dead, Groq capped, Gemini empty/capped)');
}
