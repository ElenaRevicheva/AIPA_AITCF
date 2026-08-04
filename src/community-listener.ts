/**
 * community-listener.ts — find the questions Elena can actually answer, draft a
 * reply, and hand it to a human to post.
 *
 * Why it does not post anything itself: Reddit removes automated self-promotion
 * aggressively, and repeat offenders get the *domain* banned sitewide. Reddit is
 * also one of the most heavily cited sources in AI-generated answers, so an
 * auto-poster is the single action that could take aideazz.xyz from "0% cited"
 * to structurally un-citable in the one place that would have helped most.
 *
 * So this automates the half machines are good at — watching feeds all day and
 * drafting — and leaves the posting to Elena, exactly like the manual prospect
 * play that already works. Same shape, same reason.
 *
 * Ordering is deliberate: Panama/LatAm queries carry the highest weight because
 * "best AEO audit tool" is contested by funded companies while "AI agents for a
 * business in Panama" is nearly empty, and Elena is actually there.
 */

import type { SourceId } from './community-store';

export const LISTENER_VERSION = '1.0.0';

const USER_AGENT =
  process.env.COMMUNITY_USER_AGENT?.trim() ||
  'aideazz-community-listener/1.0 (by /u/aideazz; contact aipa@aideazz.xyz)';

const FETCH_TIMEOUT_MS = 20_000;

export interface QuerySpec {
  /** Search string sent to the source. */
  q: string;
  /** Base relevance before boosts — higher means "this is our lane". */
  weight: number;
  /** LatAm-targeted queries lead, per the low-competition-pond strategy. */
  latam?: boolean;
}

/**
 * The wedge is the free audit API: narrow, genuinely useful, and something we
 * actually have. The LatAm block leads because that is where we can win.
 */
export const DEFAULT_QUERIES: QuerySpec[] = [
  { q: 'AI agents for business Panama', weight: 9, latam: true },
  { q: 'AI automation small business Latin America', weight: 9, latam: true },
  { q: 'WhatsApp automation business Latam', weight: 8, latam: true },
  { q: 'agentes de IA para negocios', weight: 8, latam: true },
  { q: 'automatizar WhatsApp negocio IA', weight: 8, latam: true },
  { q: 'does ChatGPT cite my website', weight: 8 },
  { q: 'AI search visibility audit', weight: 8 },
  { q: 'AEO answer engine optimization', weight: 7 },
  { q: 'GEO generative engine optimization SEO', weight: 7 },
  { q: 'llms.txt', weight: 6 },
  { q: 'get recommended by ChatGPT Perplexity', weight: 7 },
  { q: 'fractional CTO AI automation startup', weight: 6 },
];

const LATAM_TERMS =
  /\b(panama|panamá|latam|latin america|latinoam|colombia|mexico|méxico|costa rica|peru|perú|chile|argentina|ecuador|guatemala|spanish[- ]speaking|hispano)\b/i;

/**
 * Recurring community furniture that matches our keywords but can never be
 * usefully answered. The first dry run surfaced "Ask HN: Who wants to be hired?"
 * twice — technically a question, technically about AI automation, and entirely
 * worthless. One of those per day teaches Elena to ignore the channel.
 */
const NOISE =
  /\b(who('s| is)? hiring|who wants to be hired|freelancer\?|seeking freelancer|\[hiring\]|\[for hire\]|hiring thread|launch hn|show hn|monthly thread|weekly thread|job board|we're hiring|remote jobs?)\b/i;

const QUESTION_START =
  /^\s*(how|what|why|where|when|which|who|does|do|did|can|could|is|are|should|would|any(one|body)|has anyone|looking for|need help|advice|recomend|recomiend|cómo|como|qué|que|cuál|cual|alguien)\b/i;

export interface RawThread {
  source: SourceId;
  externalId: string;
  url: string;
  title: string;
  body: string;
  author: string;
  createdAt: number;
  /** Community/board name, used only for context in the Telegram card. */
  channel: string;
}

export interface ScoredThread extends RawThread {
  score: number;
  matchedQuery: string;
  latam: boolean;
}

export interface SourceOutcome {
  source: SourceId;
  /** Deliberately distinguishes "nothing matched" from "we could not look". */
  status: 'ok' | 'unavailable';
  reason?: string;
  found: number;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Reddit ────────────────────────────────────────────────────────────────────

let redditToken: { value: string; expiresAt: number } | null = null;

/**
 * Reddit blocks unauthenticated reads from datacenter IPs, and the Oracle VM is
 * one. OAuth via a script app is the only reliable path from the box; the public
 * JSON endpoint is kept as a fallback so a laptop dry-run still works.
 */
async function redditAccessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  if (redditToken && Date.now() < redditToken.expiresAt) return redditToken.value;

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetchWithTimeout('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`reddit token ${res.status}`);
  const j: any = await res.json();
  if (!j?.access_token) throw new Error('reddit token missing in response');
  redditToken = {
    value: j.access_token,
    expiresAt: Date.now() + Math.max(60, Number(j.expires_in ?? 3600) - 60) * 1000,
  };
  return redditToken.value;
}

function redditPostsFrom(json: any, query: string): RawThread[] {
  const children = json?.data?.children ?? [];
  return children
    .map((c: any) => c?.data)
    .filter((d: any) => d && !d.over_18 && d.author !== '[deleted]')
    .map((d: any) => ({
      source: 'reddit' as SourceId,
      externalId: String(d.id),
      url: `https://www.reddit.com${d.permalink}`,
      title: String(d.title ?? ''),
      body: String(d.selftext ?? '').slice(0, 4000),
      author: String(d.author ?? ''),
      createdAt: Number(d.created_utc ?? 0) * 1000,
      channel: `r/${d.subreddit ?? '?'}`,
    }))
    .filter((t: RawThread) => t.title && t.externalId)
    .map((t: RawThread) => ({ ...t, matchedQuery: query })) as RawThread[];
}

async function searchReddit(spec: QuerySpec): Promise<RawThread[]> {
  const params = new URLSearchParams({
    q: spec.q,
    sort: 'new',
    limit: '25',
    t: 'week',
    type: 'link',
  });
  const token = await redditAccessToken();
  if (token) {
    const res = await fetchWithTimeout(`https://oauth.reddit.com/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`reddit search ${res.status}`);
    return redditPostsFrom(await res.json(), spec.q);
  }
  const res = await fetchWithTimeout(`https://www.reddit.com/search.json?${params}`);
  if (!res.ok) throw new Error(`reddit public search ${res.status} (set REDDIT_CLIENT_ID/SECRET)`);
  return redditPostsFrom(await res.json(), spec.q);
}

// ─── Hacker News (Algolia) ─────────────────────────────────────────────────────

/**
 * Not requested, but free, keyless, and reliable — and HN threads are cited by
 * answer engines constantly. It is the cheapest off-site surface we can reach.
 */
async function searchHackerNews(spec: QuerySpec): Promise<RawThread[]> {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  const params = new URLSearchParams({
    query: spec.q,
    tags: '(story,comment)',
    numericFilters: `created_at_i>${since}`,
    hitsPerPage: '20',
  });
  const res = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
  if (!res.ok) throw new Error(`hn search ${res.status}`);
  const j: any = await res.json();
  return (j?.hits ?? [])
    .map((h: any) => ({
      source: 'hackernews' as SourceId,
      externalId: String(h.objectID),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: String(h.title ?? h.story_title ?? '').slice(0, 500),
      body: String(h.comment_text ?? h.story_text ?? '').replace(/<[^>]+>/g, ' ').slice(0, 4000),
      author: String(h.author ?? ''),
      createdAt: Number(h.created_at_i ?? 0) * 1000,
      channel: 'Hacker News',
    }))
    .filter((t: RawThread) => (t.title || t.body) && t.externalId);
}

// ─── Indie Hackers ─────────────────────────────────────────────────────────────

/**
 * IH is a fully client-rendered app with no API and no RSS — fetching the HTML
 * returns an empty shell for every path, including /feed.xml. Its own search box
 * is backed by Algolia, and the app id and search-only key below are the ones
 * IH serves to every browser that loads the page. We issue the same read-only
 * queries a visitor's browser issues.
 *
 * They can rotate at any time, hence the env override and the explicit
 * `unavailable` path: a source that quietly returns nothing is indistinguishable
 * from a quiet market, and that distinction is the whole point of measuring.
 */
const IH_APP_ID = process.env.IH_ALGOLIA_APP_ID?.trim() || 'N86T1R3OWZ';
const IH_API_KEY = process.env.IH_ALGOLIA_KEY?.trim() || '5140dac5e87f47346abbda1a34ee70c3';

async function searchIndieHackers(spec: QuerySpec): Promise<RawThread[]> {
  const since = Date.now() - 30 * 24 * 3600 * 1000; // ms — IH stores epoch millis
  const res = await fetchWithTimeout(
    `https://${IH_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/discussions/query`,
    {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': IH_APP_ID,
        'X-Algolia-API-Key': IH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: spec.q,
        hitsPerPage: 20,
        numericFilters: [`createdTimestamp>${since}`],
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`indiehackers algolia ${res.status} (key may have rotated — set IH_ALGOLIA_KEY)`);
  }
  const j: any = await res.json();
  if (!Array.isArray(j?.hits)) throw new Error('indiehackers response shape changed');
  return j.hits
    .filter((h: any) => h?.itemId && h?.title)
    .map((h: any) => ({
      source: 'indiehackers' as SourceId,
      externalId: String(h.itemId),
      url: `https://www.indiehackers.com/post/${h.itemId}`,
      title: String(h.title).slice(0, 500),
      body: String(h.body ?? '').replace(/<[^>]+>/g, ' ').slice(0, 4000),
      author: String(h.username ?? ''),
      createdAt: Number(h.createdTimestamp ?? Date.now()),
      channel: 'Indie Hackers',
    }));
}

const SOURCES: Record<SourceId, (spec: QuerySpec) => Promise<RawThread[]>> = {
  reddit: searchReddit,
  hackernews: searchHackerNews,
  indiehackers: searchIndieHackers,
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Cheap, explainable, and tuned to be stingy. Every thread that clears the bar
 * costs an LLM call and a Telegram ping, and an alert channel that cries wolf
 * gets muted within a week.
 */
export function scoreThread(thread: RawThread, spec: QuerySpec): ScoredThread {
  const haystack = `${thread.title}\n${thread.body}`;
  let score = spec.weight;

  if (thread.title.includes('?') || QUESTION_START.test(thread.title)) score += 3;
  const latam = spec.latam === true || LATAM_TERMS.test(haystack);
  if (latam) score += 4;

  const ageHours = (Date.now() - thread.createdAt) / 3_600_000;
  if (ageHours <= 6) score += 3;
  else if (ageHours <= 24) score += 2;
  else if (ageHours <= 72) score += 1;
  else if (ageHours > 168) score -= 3;

  // A one-line post rarely has enough context to answer usefully.
  if (thread.body.length < 80) score -= 2;

  return { ...thread, score, matchedQuery: spec.q, latam };
}

// ─── Drafting ──────────────────────────────────────────────────────────────────

const DRAFT_SYSTEM = `You draft community replies for Elena Revicheva, a solo founder in Panama who builds production AI agents and runs a free AI visibility audit API at https://aideazz.xyz/api that scores any site for whether ChatGPT, Perplexity and Claude can cite it. Her portfolio is https://aideazz.xyz/portfolio.

You are writing a comment a real practitioner would leave. Rules, in priority order:

1. The reply must be genuinely useful even if the reader never clicks anything. Answer the actual question, specifically, from real knowledge.
2. Only mention Elena's tool or site if it is directly relevant to what was asked. Irrelevant plugs are worse than no reply.
3. If you do mention it, disclose it plainly in her own voice — "I built this" or "disclosure: it's mine". Never hide it.
4. No marketing language, no hype, no emoji, no "Great question!", no sign-off signature.
5. Under 140 words. Plain sentences. No headings, no bullet lists unless the question is genuinely a list.
6. Match the language of the post. A Spanish post gets a Spanish reply.
7. If the post does not genuinely warrant a reply from her — wrong topic, already answered, rage bait, a job ad, or she has nothing real to add — output exactly: SKIP

Output only the reply text, or SKIP. Nothing else.`;

/** Returns the draft, or null when the model declines the thread. */
export async function draftReply(thread: ScoredThread): Promise<string | null> {
  const mod: any = await import('@anthropic-ai/sdk');
  const Anthropic = mod?.default ?? mod?.Anthropic ?? mod;
  const { claudeWithGroqFallback } = await import('./llm-resilience.js');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });

  const userPrompt = [
    `Source: ${thread.channel} (${thread.source})`,
    `Title: ${thread.title}`,
    `Body: ${thread.body.slice(0, 2500) || '(no body — title only)'}`,
    '',
    'Draft her reply, or output SKIP.',
  ].join('\n');

  const text = await claudeWithGroqFallback(
    anthropic,
    process.env.COMMUNITY_DRAFT_MODEL?.trim() || 'claude-sonnet-5',
    420,
    DRAFT_SYSTEM,
    userPrompt,
    'community-listener/draft',
  );
  const clean = (text ?? '').trim();
  if (!clean || /^SKIP\b/i.test(clean)) return null;
  return clean;
}

// ─── Orchestration ─────────────────────────────────────────────────────────────

export interface ScanOptions {
  sources?: SourceId[];
  queries?: QuerySpec[];
  minScore?: number;
  /** Hard cap on drafts per run — protects both the LLM bill and Elena's attention. */
  maxDrafts?: number;
  /** Skips persistence and drafting; used by --dry-run to show what would surface. */
  seen?: Set<string>;
}

export interface ScanResult {
  scannedAt: string;
  listenerVersion: string;
  outcomes: SourceOutcome[];
  candidates: ScoredThread[];
  skippedAsSeen: number;
}

function enabledSources(requested?: SourceId[]): SourceId[] {
  if (requested?.length) return requested;
  const env = process.env.COMMUNITY_SOURCES?.trim();
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean) as SourceId[];
  return ['reddit', 'hackernews', 'indiehackers'];
}

/**
 * Searches every source × query, scores, dedupes against what Elena has already
 * been shown, and returns the survivors sorted best-first. Drafting happens
 * separately so a dry run can show the shortlist without spending tokens.
 */
export async function scanCommunities(options: ScanOptions = {}): Promise<ScanResult> {
  const sources = enabledSources(options.sources);
  const queries = options.queries?.length ? options.queries : DEFAULT_QUERIES;
  const minScore = options.minScore ?? Number(process.env.COMMUNITY_MIN_SCORE ?? 11);
  const seen = options.seen ?? new Set<string>();

  const outcomes: SourceOutcome[] = [];
  const best = new Map<string, ScoredThread>();
  let skippedAsSeen = 0;

  for (const source of sources) {
    const search = SOURCES[source];
    if (!search) {
      outcomes.push({ source, status: 'unavailable', reason: 'unknown source', found: 0 });
      continue;
    }
    let found = 0;
    let failure: string | null = null;
    for (const spec of queries) {
      try {
        for (const thread of await search(spec)) {
          const key = `${thread.source}:${thread.externalId}`;
          if (seen.has(key)) {
            skippedAsSeen++;
            continue;
          }
          if (NOISE.test(thread.title)) continue;
          const scored = scoreThread(thread, spec);
          if (scored.score < minScore) continue;
          found++;
          // The same thread can match several queries; keep its best score.
          const prev = best.get(key);
          if (!prev || scored.score > prev.score) best.set(key, scored);
        }
      } catch (err: any) {
        failure = err?.message ?? String(err);
      }
      await new Promise((r) => setTimeout(r, 1100)); // stay well inside rate limits
    }
    outcomes.push(
      failure && found === 0
        ? { source, status: 'unavailable', reason: failure, found: 0 }
        : { source, status: 'ok', found },
    );
  }

  const candidates = [...best.values()].sort((a, b) => b.score - a.score);
  const cap = options.maxDrafts ?? Number(process.env.COMMUNITY_MAX_DRAFTS ?? 5);

  return {
    scannedAt: new Date().toISOString(),
    listenerVersion: LISTENER_VERSION,
    outcomes,
    candidates: candidates.slice(0, cap),
    skippedAsSeen,
  };
}
