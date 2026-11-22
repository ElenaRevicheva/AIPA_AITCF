/**
 * espaluz-groups-listener.ts — ONE Facebook-group reply a weekday for EspaLuz (22 Nov 2026).
 *
 * Elena: "encode the same approach as Reddit for Facebook groups ... send me the text to paste. But do not flood ...
 * once a day, all the weekdays. I will paste manually."
 *
 * Facebook removed the Groups API in April 2024 - no app can read or post in groups. What still works: public group
 * posts that Google indexes, found through Bright Data SERP (`site:facebook.com/groups`, past week; tested 22 Nov:
 * real Panama / Costa Rica family posts with direct post URLs). Nothing here touches Facebook or her account; she
 * pastes by hand, exactly like the Reddit lane.
 *
 * Reused, not rebuilt: community-store (dedupe: a thread is offered once), community-notify
 * offerAndDeliverCommunityReply (Telegram card + plain paste + .txt + "I've posted it" button + HubSpot [COMMUNITY]
 * task and board), claudeWithGroqFallback (cost-aware waterfall). New here: EspaLuz queries, filter and draft prompt.
 *
 * Bound: at most ESPALUZ_GROUPS_PER_DAY (default 1) delivered per run; cron weekdays only.
 */

import { bdSerpSearch } from './brightdata-enrich';
import type { ScoredThread } from './community-listener';

export const GROUPS_SOURCE = 'fbgroups' as const;
/** Same code format the bots, the film report and HubSpot already read: f<date><4 hex>-g<n> = Facebook group n. */
export const GROUPS_CODE = 'f20261122fb0c';

interface GroupQuery { q: string; weight: number }

/** English / Spanish / Russian - the three languages of EspaLuz families (USER_CATEGORIES_2026-11-18 Table 1). */
export const GROUP_QUERIES: GroupQuery[] = [
  { q: 'moving to Panama with kids school', weight: 9 },
  { q: 'expat family Costa Rica kids school Spanish', weight: 9 },
  { q: 'moving to Mexico with family kids learn Spanish', weight: 8 },
  { q: 'relocating to Colombia with children school', weight: 8 },
  { q: 'expat kids Spanish school struggling', weight: 8 },
  { q: 'learn Spanish as a family Latin America', weight: 7 },
  { q: 'переезд в Панаму с детьми школа', weight: 8 },
  { q: 'русские в Мексике дети испанский', weight: 7 },
  { q: 'familia extranjera Panamá niños inglés', weight: 6 },
  { q: 'relocating with daughter school Spanish expat', weight: 8 },
  { q: 'schools for expat families Costa Rica', weight: 8 },
  { q: 'moving to Spain with kids learn Spanish school', weight: 7 },
  { q: 'expat family Ecuador kids school', weight: 7 },
];

const FAMILY = /\b(kid|kids|child|children|son|daughter|famil\w*|school|colegio|escuela|niñ\w+|hij\w+|дет\w*|ребен\w*|ребён\w*|сын\w*|доч\w*|школ\w*|семь\w*)\b/i;
const LANGUAGE_OR_MOVE = /\b(spanish|español|espanol|english|inglés|ingles|испанск\w*|английск\w*|move|moving|moved|relocat\w*|expat\w*|mudanza|mudarnos|nos mudamos|переезд\w*|переех\w*|adapt\w*|settl\w*)\b/i;
/** Sales posts, services, rentals, jobs - never a family asking for help. */
const NOISE = /(for sale|se vende|vendo|alquil|for rent|rent\b|servicio de|transporte|acarreo|mudanzas? (económica|baratas)|hiring|vacante|empleo|job offer|tutor available|clases? de español (desde|a solo)|promo|descuento|discount|whatsapp \+?\d|teacher (for|available)|private pod|we are hiring|buscamos (profesor|maestr)|te encanta trabajar|inscripciones|matr[ií]cula abierta|enroll now)/i;

export function groupTag(groupId: string): string {
  let h = 0;
  for (const ch of groupId) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `g${h + 1}`;
}

export function groupLink(groupId: string): string {
  return `https://app.espaluz.lat/?utm_source=facebook&utm_medium=group&utm_campaign=${GROUPS_CODE}&utm_content=${groupTag(groupId)}`;
}

export function parseGroupUrl(url: string): { groupId: string; postId: string } | null {
  const m = /^https?:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([^/?#]+)\/(?:posts|permalink)\/(\d+)/i.exec(url || '');
  return m ? { groupId: m[1]!, postId: m[2]! } : null;
}

export function scoreGroupPost(title: string, body: string, weight: number): number {
  const text = `${title}\n${body}`;
  let score = weight;
  if (/\?|¿/.test(text)) score += 3;
  if (FAMILY.test(text)) score += 3;
  if (LANGUAGE_OR_MOVE.test(text)) score += 2;
  if (body.length < 60) score -= 2;
  return score;
}

export function isFamilyQuestion(title: string, body: string): boolean {
  const text = `${title}\n${body}`;
  return FAMILY.test(text) && LANGUAGE_OR_MOVE.test(text) && !NOISE.test(text);
}

/** Search all queries, keep real group posts about a family settling in, best first. */
export async function findGroupPosts(seen: Set<string>): Promise<ScoredThread[]> {
  const best = new Map<string, ScoredThread>();
  for (const spec of GROUP_QUERIES) {
    // Past week first, then past month: Google returns only ~2 real group posts per query (22 Nov probe), and a
    // three-week-old family question is still worth a helpful answer. Redirect links (google.com/goto) are blogs - dropped.
    let results: Awaited<ReturnType<typeof bdSerpSearch>> = [];
    for (const tbs of ['qdr:w', 'qdr:m']) {
      try {
        results = results.concat(await bdSerpSearch(spec.q, { site: 'site:facebook.com/groups', tbs, num: 10, retries: 1 }));
      } catch (e: any) {
        console.warn('[espaluz-groups] search failed:', spec.q, tbs, e?.message ?? e);
      }
      await new Promise((res) => setTimeout(res, 1600));
    }
    for (const r of results) {
      const ids = parseGroupUrl(r.link);
      if (!ids) continue;                                    // Google redirect / non-post links: no stable thread
      const externalId = `${ids.groupId}:${ids.postId}`;
      if (seen.has(`${GROUPS_SOURCE}:${externalId}`)) continue;
      const title = (r.title || '').trim();
      const body = (r.description || '').trim();
      if (!isFamilyQuestion(title, body)) continue;
      const score = scoreGroupPost(title, body, spec.weight);
      const prev = best.get(externalId);
      if (prev && prev.score >= score) continue;
      best.set(externalId, {
        source: GROUPS_SOURCE as any,
        externalId,
        url: `https://www.facebook.com/groups/${ids.groupId}/posts/${ids.postId}/`,
        title: title || body.slice(0, 120),
        body,
        author: '',
        createdAt: Date.now(),
        channel: `EspaLuz · Facebook group ${groupTag(ids.groupId)}`,
        score,
        matchedQuery: spec.q,
        latam: true,
      } as ScoredThread);
    }
    await new Promise((res) => setTimeout(res, 1600));       // Bright Data refuses a re-try inside 15 s; stay gentle
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** True today (checked against the bots and the Influencer's FEATURE_CARDS, 21-22 Nov 2026). Nothing else may be claimed. */
const DRAFT_SYSTEM = `You draft ONE Facebook-group comment for Elena Revicheva, a mother who moved to Panama with her daughter and built EspaLuz - an AI companion that helps families settle into life in a Spanish-speaking country.

What EspaLuz really does today (the ONLY product facts you may use):
- Works on WhatsApp, Telegram and the web (app.espaluz.lat); one family memory across all three.
- Send a photo of a school letter or official paper: it explains it in English and Spanish and helps write the answer.
- Voice translation mode for the doctor, the bank, a public office.
- Ten-minute lessons for children 5-8 with two characters, Pere and Titi; parents get a short report.
- Pro English: work English for Spanish speakers, real work scenes and a pronunciation score.
- Knows the local words and ways of 21 Spanish-speaking countries. Russian-speaking families get Russian support.
- 14 days free, then $11/month.

Rules, in priority order:
1. Be genuinely useful even if nobody clicks: answer the person's actual situation first, with practical, general, true advice a parent who has done this move would give.
2. NEVER invent facts: no statistics, no user counts, no results, no stories about other families, no claims about schools or laws you are not sure of. Elena's own true story is only: she moved to Panama with her daughter.
3. Mention EspaLuz only if it genuinely helps with what was asked, in ONE sentence, with plain disclosure in her voice ("I built..." / "lo hice yo" / "я сделала"), and include this exact link once: {LINK}
4. Warm, human, short: under 110 words, no hashtags, no emoji except at most one, no "Great question", no sign-off.
5. Reply in the language of the post (English, Spanish or Russian).
6. If the post is not a family asking for help with settling, school, language or adaptation - or it is an ad, a sale, or already answered - output exactly: SKIP

Output only the comment text, or SKIP.`;

export async function draftGroupReply(thread: ScoredThread, groupId: string): Promise<string | null> {
  const mod: any = await import('@anthropic-ai/sdk');
  const Anthropic = mod?.default ?? mod?.Anthropic ?? mod;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });
  const { claudeWithGroqFallback } = await import('./llm-resilience.js');
  const link = groupLink(groupId);
  const system = DRAFT_SYSTEM.replace('{LINK}', link);
  const user = [`Facebook group post (search snippet, may be partial):`, `Title: ${thread.title}`, `Text: ${thread.body || '(none)'}`, '', 'Draft her comment, or SKIP.'].join('\n');
  const text = String(
    (await claudeWithGroqFallback(anthropic, process.env.COMMUNITY_DRAFT_MODEL?.trim() || 'claude-sonnet-5', 1536, system, user, 'espaluz-groups/draft')) ?? '',
  ).trim();
  if (!text || /^SKIP\b/i.test(text)) return null;
  // A plug must carry the tracked link, or the arrival can never be counted.
  if (/espaluz/i.test(text) && !text.includes('app.espaluz.lat')) return `${text}\n${link}`;
  return text;
}

export interface GroupsCycleResult { candidates: number; declined: number; delivered: number; titles: string[] }

/** One weekday run: find, draft until ONE good reply is delivered. Unused candidates stay unseen for tomorrow. */
export async function runEspaluzGroupsCycle(options: { dryRun?: boolean } = {}): Promise<GroupsCycleResult> {
  const store = await import('./community-store');
  const seen = new Set<string>();
  for (const id of await store.seenExternalIds(GROUPS_SOURCE as any)) seen.add(`${GROUPS_SOURCE}:${id}`);
  const candidates = await findGroupPosts(seen);
  const perDay = Math.max(1, Number(process.env.ESPALUZ_GROUPS_PER_DAY ?? 1) || 1);
  const result: GroupsCycleResult = { candidates: candidates.length, declined: 0, delivered: 0, titles: candidates.slice(0, 5).map((c) => c.title) };
  if (options.dryRun) return result;

  const { offerAndDeliverCommunityReply } = await import('./community-notify');
  for (const thread of candidates.slice(0, 6)) {
    if (result.delivered >= perDay) break;
    const groupId = thread.externalId.split(':')[0]!;
    let draft: string | null = null;
    try { draft = await draftGroupReply(thread, groupId); } catch (e: any) { console.warn('[espaluz-groups] draft failed:', e?.message ?? e); continue; }
    if (!draft) {
      result.declined++;
      await store.saveOpportunity({ source: GROUPS_SOURCE as any, externalId: thread.externalId, url: thread.url, title: thread.title,
        author: '', score: thread.score, matchedQuery: thread.matchedQuery, latam: true, excerpt: thread.body.slice(0, 2000), draft: '' });
      continue;
    }
    const offered = await offerAndDeliverCommunityReply(thread, draft);
    if (offered.ok) result.delivered++;
  }
  return result;
}
