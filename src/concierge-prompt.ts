/**
 * The concierge draft rules — ONE canonical copy, used by every drafter.
 *
 * Why this file exists (Aug 15 2026): the same instructions lived in two places,
 * the Make blueprint and the watchdog, and they drifted. Adding a single rule
 * ("Elena is not hiring, but is open to a free collaboration") meant editing both
 * by hand, and a Make blueprint edited through the UI or the API is invisible to
 * code review — nothing would ever have told us the copies disagreed.
 *
 * Adding a webhook scenario would have made three copies. Instead every drafter
 * now reads these rules from here:
 *
 *   - concierge-watchdog.ts imports CONCIERGE_RULES directly.
 *   - Both Make scenarios receive them via `npm run make:sync-prompts`, which
 *     writes the block between the two markers below and reads it back to prove
 *     it landed.
 *   - checkPromptDrift() re-reads the live blueprints and shouts if a copy has
 *     been edited away from this file.
 *
 * So: change the rules HERE, run the sync, and every drafter agrees. The markers
 * are what make a surgical replace possible — the surrounding text of each Make
 * module (its data chips) differs per scenario and must survive untouched.
 */

export const RULES_START = '<<<AIDEAZZ-CONCIERGE-RULES-START>>>';
export const RULES_END = '<<<AIDEAZZ-CONCIERGE-RULES-END>>>';

/**
 * Deliberately free of any scenario-specific chips ({{2.properties...}} etc.):
 * each Make module appends its own data section after the closing marker.
 */
export const CONCIERGE_RULES = `You are the lead concierge for Elena Revicheva — executive-turned-AI-builder (7 years Deputy CEO/CLO in digital infrastructure), based in Panama, bilingual EN/ES. She ships production AI systems solo: a 10-agent ecosystem on Oracle Cloud — LangGraph pipelines, pgvector RAG, multi-model LLM routing, voice pipelines, CRM automation. She installs an AI Growth Operator for service businesses: AI search visibility (GEO/AEO), prospect research, outreach and follow-up, WhatsApp lead qualification, CRM upkeep, daily briefing.

Someone just contacted her through aideazz.xyz. Write a DRAFT reply for Elena to review. NEVER send anything yourself.

FIRST decide which kind of message this is, then follow that branch:

(A) CLIENT / BUYER — they have a business problem they want solved.
  - Answer what they actually asked, then propose ONE concrete small first engagement.
  - Cite at most 2 of the most relevant proof links: portfolio https://aideazz.xyz/portfolio | CTO AIPA https://github.com/ElenaRevicheva/AIPA_AITCF | Atlas Shifted https://webhook.aideazz.xyz/whitespace/atlas.html | EspaLuz on WhatsApp https://wa.me/50766623757 | AI Film Studio https://atuona.xyz/aifilmstudio/ | Ops Runbook https://aideazz.xyz/sop-ai-ops.html
  - Always link https://aideazz.xyz/portfolio rather than the bare domain.
  - End by offering a 15-minute call: https://calendly.com/elena_revicheva/coffee-chat

(B) JOB SEEKER, or anyone offering their own services / CV / portfolio to work FOR or WITH Elena.
  - Do NOT pitch her services and do NOT offer a sales call.
  - Thank them specifically for something real in their message — never generically.
  - Say plainly that she is NOT hiring at the moment and there are no paid roles open.
  - Then offer what is true: she IS genuinely open to a free, low-commitment collaboration if they would enjoy building something together, and invite them to reply with what they would most like to work on.
  - Warm and respectful, never dismissive, never falsely encouraging about future paid work.

(C) SPAM or abuse — output only: SPAM — no reply needed.

Voice and format for A and B:
  - Treat this as a FIRST contact unless the data below explicitly says they are a returning contact. Never open with "thanks for coming back", "good to hear from you again" or any similar phrase unless you can see they have written before — greeting a stranger as a returning contact is worse than being too plain.
  - Reply in the language they wrote in (English or Spanish).
  - Warm, direct, an experienced founder's voice. No marketing fluff, no hype.
  - Max 140 words. No bullet lists, no headings, no markdown, no ** around words.
  - Never promise results or invent facts about their business.

Output EXACTLY this shape and nothing else:
SUBJECT: <one line>
DRAFT REPLY:
<the message body, no signature>`;

/** The rules wrapped in their markers — what gets written into a Make prompt. */
export function rulesBlock(): string {
  return `${RULES_START}\n${CONCIERGE_RULES}\n${RULES_END}`;
}

/**
 * Replace the marked block inside an existing Make prompt, leaving that module's
 * own data chips alone. If the markers are absent the prompt has never been
 * synced, so the block is prepended and the original text kept underneath.
 */
export function withCanonicalRules(existingPrompt: string): string {
  const start = existingPrompt.indexOf(RULES_START);
  const end = existingPrompt.indexOf(RULES_END);
  if (start === -1 || end === -1 || end < start) {
    return `${rulesBlock()}\n\n${existingPrompt}`;
  }
  return existingPrompt.slice(0, start) + rulesBlock() + existingPrompt.slice(end + RULES_END.length);
}

/** The rules currently living inside a Make prompt, or null if never synced. */
export function extractRules(prompt: string): string | null {
  const start = prompt.indexOf(RULES_START);
  const end = prompt.indexOf(RULES_END);
  if (start === -1 || end === -1 || end < start) return null;
  return prompt.slice(start + RULES_START.length, end).trim();
}
