import Groq from 'groq-sdk';
import type { Anthropic } from '@anthropic-ai/sdk';

// Follows the fleet-wide GROQ_MODEL switch (see llm-resilience.ts groqModel()); the
// SPRINT_BRIEFING_* var still wins for Lambda-specific tuning. Not imported from
// llm-resilience on purpose — this module ships in the separate AWS Lambda bundle.
const GROQ_MODEL =
  process.env.SPRINT_BRIEFING_GROQ_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CLAUDE_MODEL = process.env.SPRINT_BRIEFING_CLAUDE_MODEL || 'claude-sonnet-4-6';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_MODEL = process.env.SPRINT_BRIEFING_OPENAI_MODEL || 'gpt-4o-mini';

/** Final cheap-but-RELIABLE fallback — OpenAI gpt-4o-mini. As of June 2026 the Anthropic
 *  AND Gemini keys are credit-dead and Groq's free tier rate-caps, so on a heavy morning ALL
 *  three failed and the 8AM briefing didn't fire. OpenAI (key already in the Lambda env) is the
 *  backstop. Returns '' on any failure so callers can degrade. */
async function openaiText(prompt: string, maxTokens = 4096): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return '';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: Math.min(maxTokens, 8192),
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) { console.warn(`[sprint] OpenAI ${res.status}: ${(await res.text()).slice(0, 120)}`); return ''; }
    const d = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const t = (d.choices?.[0]?.message?.content || '').trim();
    if (t) console.log(`[sprint] OpenAI (${OPENAI_MODEL}) returned ${t.length} chars`);
    return t;
  } catch (e) {
    console.warn('[sprint] OpenAI failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

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
  // Working-providers-first: OpenAI (reliable) then Gemini (auto-rejoins when topped up).
  const oai = await openaiText(prompt, 4096);
  if (oai) return oai;
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
3. If voice notes / diary / tasks are present — surface them explicitly at the start. These are Elena's own words from the last two days. They come first. The personal section carries its own window ("last 48h"); if it reports nothing in the window, SAY there were no new voice notes and move on. Never reach back for older ones.
4. If Trello cards are present (section "📋 Trello — <board> (current month board...)") — mention them after voice notes, before GitHub. These come from THIS MONTH's board, lists "Just for Today" and "To Dos" only. Say "On your <board name> board: [names]", and keep "Just for Today" separate from "To Dos".
5. If a section has NO data (e.g. no commits, no tasks) — say so briefly and move on. Do NOT pad with generalities.
6. Start with voice notes and personal context if present, then Trello active cards, then her BUILDING WORK, then focus suggestion.
7. HER BUILDING WORK IS THE HEART OF THIS BRIEFING. She is an AI product builder: report what actually moved in the code — repo by repo, named commits, what shipped, what is open, what broke. Then call out anything urgent in that work: a failing deploy, a stale credential, an unmerged branch, an agent that stopped reporting. Engineering reality outranks admin chores.
8. End with ONE concrete action she can take in the next 2 hours based on what actually happened — and prefer a building or shipping action over an errand, unless something is genuinely broken in production. If nothing in the signals needs action, SAY "nothing is urgent this morning" — never invent a reason to act.
9. LINKS MUST BE IN THE DATA (25 Oct 2026: a September quota issue was called the blocker of that week's new work, and she was told to merge pull requests to "unblock" commits that were already live). Never say one item blocks, unblocks, stalls or depends on another unless the signals state that link. A commit listed under a repo is already pushed — never tell her to merge it. An open PR or issue is just open: name it, do not guess what it holds up.
10. A COMMIT MESSAGE DESCRIBES WORK SHE FINISHED (26 Oct 2026: a commit adding a test that breaks providers ON PURPOSE was reported as a "failing failover test" risk, and she was told to build credit monitoring that already existed). Never turn a commit into a new problem or a to-do; a test, fix, guard or monitor named in a commit EXISTS.

FORMAT:
- Conversational, direct. Spoken out loud. No markdown in output — plain sentences only.
- Start: "Good morning Elena. Here's what actually happened while you were offline."
- Sections: personal notes first → repo activity (commits, PRs) → one focus action.

CLUSTER (Groq-structured facts):
${clusterMarkdown}

RAW SIGNALS (live data — use these):
${rawDigest.slice(0, 60000)}
`;

  // 25 Oct 2026 ORDER RULE (Elena: no regular money to top up): free first, then Claude, then OpenAI. Every provider
  // stays wired; a paid one without credit fails fast and rejoins by itself when topped up.
  // 26 Oct: Gemini before Groq — Groq sees only the first 28k chars of the signals and misread a deliberate failover
  // TEST in a commit message as a "failing test" risk; Gemini reads 120k and is the stronger free reader.

  // 1) Gemini (free)
  const gem = await geminiText(prompt.slice(0, 120000), 4096);
  if (gem) {
    console.log('[sprint] Gemini narrative succeeded');
    return gem;
  }

  // 2) Groq (free)
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
        console.log('[sprint] Groq narrative succeeded');
        return text;
      }
    } catch (err) {
      console.warn(`[sprint] Groq narrative failed (${(err as { status?: number })?.status ?? (err instanceof Error ? err.message : '')}) — trying Claude`);
    }
  }

  // 3) Claude (premium — used while there is Anthropic credit)
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = msg.content[0];
    if (block && block.type === 'text' && block.text.trim()) {
      console.log('[sprint] Claude narrative succeeded');
      return block.text;
    }
  } catch (err: unknown) {
    console.warn(`[sprint] Claude narrative failed (${(err as { status?: number })?.status})`);
  }

  // 4) OpenAI (wired backstop — serves whenever it has credit)
  const oai = await openaiText(prompt.slice(0, 120000), 4096);
  if (oai) {
    console.log('[sprint] OpenAI narrative succeeded');
    return oai;
  }

  throw new Error('All narrative providers failed (Groq, Gemini, Claude, OpenAI)');
}
