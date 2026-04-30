import Groq from 'groq-sdk';
import type { Anthropic } from '@anthropic-ai/sdk';

const GROQ_MODEL = process.env.SPRINT_BRIEFING_GROQ_MODEL || 'llama-3.3-70b-versatile';
const CLAUDE_MODEL = process.env.SPRINT_BRIEFING_CLAUDE_MODEL || 'claude-sonnet-4-20250514';

/** Fast clustering / deltas — same Groq tier family as CTO triage + reviews. */
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

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 4096,
  });
  const text = completion.choices[0]?.message?.content;
  return typeof text === 'string' ? text : '';
}

/** Narrative briefing script — Claude Sonnet (same family as CMO/VJH narrative quality path). */
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
4. If a section has NO data (e.g. no commits, no tasks) — say so briefly and move on. Do NOT pad with generalities.
5. Start with voice notes and personal context if present, then GitHub activity, then focus suggestion.
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

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  return block && block.type === 'text' ? block.text : '';
}
