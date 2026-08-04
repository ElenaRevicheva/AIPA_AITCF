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

/**
 * The thread has to actually be about something Elena can speak to. Reddit's
 * search matches loosely enough that "AI agents for business Panama" returned
 * r/AskParents, r/careeradvice and a Palantir earnings summary — each matched a
 * single common word and none had anything to do with the subject.
 *
 * Trusting the search engine's idea of relevance is what produced that list, so
 * this re-checks it against the text we actually received. A thread that never
 * mentions AI, automation, or search visibility in any language is not a thread
 * she can answer, however well it scored.
 */
const ON_TOPIC =
  /(\bai\b|artificial intelligence|inteligencia artificial|\bllms?\b|\bgpt\b|chatgpt|claude|perplexity|gemini|copilot|\bagents?\b|\bagentes?\b|automat|chatbot|\bbots?\b|whatsapp|\bseo\b|\baeo\b|answer engine|generative engine|search visibility|llms\.txt|crawler|\bcited?\b|citation)/i;

/**
 * Spanish "IA" has to be matched case-sensitively. Case-insensitively it also
 * matches Portuguese "ia" — the imperfect of *ir*, one of the most common words
 * in the language — which is how a r/opiniaoimpopular thread about Messi and a
 * r/portugal2 thread about bicycle refunds both cleared an AI topic gate.
 */
const ON_TOPIC_ES = /\bIA\b/;

function isOnTopic(text: string): boolean {
  return ON_TOPIC.test(text) || ON_TOPIC_ES.test(text);
}

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
  return redditRssSearch(spec);
}

// ─── Reddit without credentials (Atom) ─────────────────────────────────────────

/**
 * Reddit answers **403 Blocked** to `search.json` from datacenter IPs, but still
 * serves `search.rss` with a 200 — verified from this VM. That removes the OAuth
 * app registration from the critical path entirely; credentials remain supported
 * and preferred, but are no longer required to have a working Reddit source.
 *
 * Two traps live in this feed. It mixes **subreddits into post results** — ids
 * are prefixed `t5_` for a subreddit and `t3_` for a post, and only `t3_` is a
 * thread anyone can reply to. And it rate-limits hard: three quick requests
 * earned a 429 and then empty bodies, so calls are spaced deliberately below.
 */
const REDDIT_MIN_GAP_MS = Number(process.env.REDDIT_RSS_GAP_MS || 2500);
let lastRedditFetch = 0;

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => XML_ENTITIES[m] ?? m);
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]!.trim()) : '';
}

async function redditRssSearch(spec: QuerySpec): Promise<RawThread[]> {
  const wait = REDDIT_MIN_GAP_MS - (Date.now() - lastRedditFetch);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRedditFetch = Date.now();

  // `sort=new` looked right and was badly wrong: Reddit matches multi-word
  // queries loosely, so newest-first returned whatever had just been posted that
  // shared any single word — r/AskParents and r/therapists for "AI agents for
  // business Panama". Relevance-first with a one-week window is the honest read.
  const params = new URLSearchParams({ q: spec.q, sort: 'relevance', t: 'week' });
  const res = await fetchWithTimeout(`https://www.reddit.com/search.rss?${params}`);
  if (res.status === 429) throw new Error('reddit rss rate-limited (429) — raise REDDIT_RSS_GAP_MS');
  if (!res.ok) throw new Error(`reddit rss ${res.status}`);

  const xml = await res.text();
  if (!xml.trim()) throw new Error('reddit rss returned an empty body (usually throttling)');

  const out: RawThread[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = m[1]!;
    const id = pick(block, 'id');
    if (!id.startsWith('t3_')) continue; // t5_ is a subreddit, not a thread

    const href = block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '';
    const title = pick(block, 'title');
    if (!href || !title) continue;

    out.push({
      source: 'reddit',
      externalId: id.slice(3),
      url: decodeXml(href),
      title: title.slice(0, 500),
      body: decodeXml(pick(block, 'content'))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000),
      author: pick(block, 'name').replace(/^\/u\//, ''),
      createdAt: Date.parse(pick(block, 'updated')) || Date.now(),
      channel: href.match(/reddit\.com\/(r\/[^/]+)/)?.[1] ?? 'reddit',
      matchedQuery: spec.q,
    } as RawThread);
  }
  return out;
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

  // Evidence, not intent. Taking the query's latam flag at face value stamped
  // "🌎 LatAm" on a Palantir earnings post, because the *query* mentioned Panama
  // and the thread did not. The flag drives Elena's priority and a HIGH-priority
  // HubSpot task, so it has to come from the thread's own text.
  const latam = LATAM_TERMS.test(haystack);
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

/**
 * The first live draft came back as "ensure proper schema, sitemap and
 * robots.txt" with no link — generic enough to be worthless and unlinked
 * enough to be worth less than that, since an uncited mention buys nothing.
 * Two lessons are encoded below: the URL is mandatory whenever the tool is
 * mentioned at all, and the model is handed concrete facts to reason from.
 * Weak models fall back on SEO boilerplate when given nothing specific, and
 * Anthropic credit runs out often enough that Groq drafts are the normal case,
 * not the exception.
 */
const DRAFT_SYSTEM = `You draft community replies for Elena Revicheva, a solo founder in Panama who builds production AI agents. She runs a free AI visibility audit API at https://aideazz.xyz/api that scores any site on 34 checks for whether ChatGPT, Perplexity and Claude can actually cite it. Her portfolio is https://aideazz.xyz/portfolio.

Things she knows first-hand, because she built and measured them. Use these when relevant instead of generic advice:

- No LLM has "rankings". ChatGPT with browsing retrieves through a search index and cites a handful of sources; without browsing it reproduces what was in training data. Optimising for a "#1 spot" is the wrong frame — the real questions are whether you are in the index it retrieves from, whether a single passage of yours is quotable standalone, and whether enough third-party sources corroborate you that the model's prior already contains you.
- Being crawlable is necessary and nowhere near sufficient. Her own site scores 100/100 and was still cited 0% of the time in measured probes. Perfect technical hygiene is table stakes; citations come from being the answer somewhere the model already looks.
- robots.txt must name the AI agents explicitly — GPTBot, ClaudeBot, PerplexityBot, Google-Extended. Blanket allow rules miss them and most sites silently block the ones they most want.
- llms.txt is an emerging convention, cheap to add, and not yet honoured by every crawler. Worth doing, not worth believing in.
- Question-shaped headings with a direct answer in the first sentence underneath get quoted. Long preamble before the answer does not.
- Third-party corroboration moves the needle harder than anything on your own domain, because a model that has seen you in one place has seen an ad, and a model that has seen you in five has seen a fact.

You are writing a comment a real practitioner would leave. Rules, in priority order:

1. The reply must be genuinely useful even if the reader never clicks anything. Answer the actual question specifically. If the question rests on a false premise, correct the premise first — that is the most useful thing you can do.
2. At least one sentence must carry a concrete, checkable claim: a named crawler, a specific mechanism, a real trade-off, or a number from the list above. A reply that would be true of any website is a failed reply.
3. NEVER invent facts about Elena. Do not invent statistics, percentages, client counts, revenue figures, timelines, or "I have seen X do Y" anecdotes. The facts listed above are the only things she has measured — everything else you state must be general knowledge true of the field, not a claim about her experience. A fabricated number posted under her name is far worse than a vaguer reply, because she cannot defend it when asked.
4. Never write generic SEO checklist advice. "Add schema, sitemap and robots.txt" is banned — every reader has heard it and it signals you did not read their question.
5. Only mention Elena's tool if it is directly relevant to what was asked. Irrelevant plugs are worse than no reply.
6. If you mention it, you MUST include the full URL https://aideazz.xyz/api inline, and disclose it plainly in her own voice — "I built this" or "disclosure: it's mine". A mention without the URL is useless to both sides. Never hide the affiliation.
7. No marketing language, no hype, no emoji, no "Great question!", no sign-off signature.
8. Under 140 words. Plain sentences. No headings, no bullet lists unless the question is genuinely a list.
9. Match the language of the post. A Spanish post gets a Spanish reply, and the URL stays as-is.
10. If the post does not genuinely warrant a reply from her — wrong topic, already answered, rage bait, a job ad, or she has nothing real to add — output exactly: SKIP

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

  // A plug without a link is the worst of both worlds: it reads as self-promotion
  // and earns no citation. Elena reviews every draft anyway, so this warns rather
  // than rewrites — silently patching a URL in would hide that the model drifted.
  for (const w of draftWarnings(clean)) console.warn(`[community-listener/draft] ${w}`);
  return clean;
}

/**
 * Quality flags shown next to the draft at review time. These are warnings, not
 * rewrites: silently patching a draft would hide that the model drifted, and
 * Elena reads every one of these before it goes anywhere.
 *
 * Both rules come from real failures. The first live draft plugged the audit API
 * without linking it, which reads as self-promotion and earns no citation — the
 * worst of both outcomes. A Spanish test draft then invented "reduce el 65% de
 * respuestas manuales" plus a four-month client history, neither of which she has
 * ever measured. She cannot defend an invented number when someone asks where it
 * came from, so any figure outside the ones she has actually published is surfaced.
 */
export function draftWarnings(draft: string): string[] {
  const out: string[] = [];
  if (/\b(I built|audit API|visibility audit|disclosure|es mía)\b/i.test(draft) && !draft.includes('aideazz.xyz')) {
    out.push('mentions the tool without the URL — add https://aideazz.xyz/api or cut the mention');
  }
  const PUBLISHED = new Set(['0', '34', '100']);
  const figures = [...draft.matchAll(/(\d[\d.,]*)\s*(%|por ciento|percent)/gi)]
    .map(m => m[1]!.replace(/[.,]+$/, ''))
    .filter(n => !PUBLISHED.has(n));
  if (figures.length) {
    out.push(`unverified figure(s): ${[...new Set(figures)].join(', ')} — verify or cut before posting`);
  }
  if (/\b(he visto|I have seen|I've seen|mis clientes|my clients)\b/i.test(draft)) {
    out.push('claims first-hand experience — confirm it is true before posting');
  }
  return out;
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
          if (!isOnTopic(`${thread.title}\n${thread.body}`)) continue;
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
