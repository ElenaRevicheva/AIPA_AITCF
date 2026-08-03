/**
 * citation-tracker.ts — do AI answer engines actually CITE us?
 *
 * The visibility audit (visibility-audit.ts) reads a page over HTTP and scores how
 * *citable* it is. That is a prerequisite for being cited, not a measurement of it.
 * This module measures the thing itself: ask a real answer engine a real buyer
 * question, then look at the sources it attached to the answer and check whether
 * aideazz.xyz is among them.
 *
 * Portfolio-first (.cursor/rules/portfolio-first.mdc): a citation of /portfolio is
 * the headline number. An apex citation counts, but is reported as secondary.
 *
 * Four engines, each using a key the fleet already has (Perplexity is optional):
 *   google-ai-overview  SerpAPI `ai_overview` block — what Google's AI answer cites
 *   gemini-grounded     generativelanguage + google_search tool — grounding chunks
 *   openai-search       chat completions + web search — url_citation annotations
 *   perplexity          api.perplexity.ai sonar — citations / search_results
 *
 * Every engine is optional and every probe is independently fault-tolerant: a missing
 * key or a bad response degrades the run, it never fails it. A run that reaches zero
 * engines still returns a valid CitationRun saying so, because "we could not measure"
 * and "we were not cited" are different answers and must never be confused.
 */

export const TRACKER_VERSION = '1.0.0';

export type EngineId = 'google-ai-overview' | 'gemini-grounded' | 'openai-search' | 'perplexity';

export interface CitationSource {
  url: string;
  title?: string;
}

export interface ProbeResult {
  engine: EngineId;
  prompt: string;
  /** false = we could not measure (no key, API error). Never counted as "not cited". */
  ok: boolean;
  error?: string;
  answerChars: number;
  sources: CitationSource[];
  /** Our domain appeared as a linked source on the answer. */
  cited: boolean;
  /** One of those cited URLs was the portfolio hub. */
  citedPortfolio: boolean;
  citedUrls: string[];
  /** 1-based rank of our first cited source among all sources. */
  position: number | null;
  /** Brand named in the answer text with no link — visibility without attribution. */
  mentioned: boolean;
}

export interface EngineSummary {
  engine: EngineId;
  probes: number;
  cited: number;
  citationRate: number;
}

export interface CitationRun {
  ranAt: string;
  trackerVersion: string;
  domain: string;
  primaryPath: string;
  engines: EngineId[];
  /** Engines skipped for a missing key — the honest "not measured" list. */
  skipped: Array<{ engine: EngineId; reason: string }>;
  probes: ProbeResult[];
  summary: {
    /** Probes that actually reached an engine. Rates are computed over this, not over attempts. */
    measured: number;
    attempted: number;
    cited: number;
    citedPortfolio: number;
    mentioned: number;
    /** Percent 0-100 of measured probes where our domain was a linked source. */
    citationRate: number;
    portfolioCitationRate: number;
    /** Percent 0-100 named in the answer text, linked or not. */
    mentionRate: number;
    byEngine: EngineSummary[];
  };
}

/**
 * Buyer-intent questions, not vanity queries. The last one is a brand-name control:
 * if even "Elena Revicheva AI portfolio" does not return us, the problem is retrieval,
 * not ranking, and no amount of content work fixes it.
 */
export const DEFAULT_PROMPTS = [
  'Who offers an AI visibility audit that checks whether ChatGPT and Perplexity can cite my website?',
  'What is the best tool to check if my site is quotable by AI search engines (AEO / GEO audit)?',
  'Is there a free API that scores a website for AI search visibility?',
  'Who builds production AI agents for small businesses in Latin America?',
  'Fractional CTO who ships AI automation for early-stage startups',
  'Elena Revicheva AI portfolio',
];

const FETCH_TIMEOUT_MS = 45_000;
const MAX_REDIRECT_RESOLVES = 6;
const PROBE_CONCURRENCY = 3;

const trackedDomain = (): string => (process.env.CITATION_DOMAIN || 'aideazz.xyz').trim().toLowerCase();
const primaryPath = (): string => (process.env.CITATION_PRIMARY_PATH || '/portfolio').trim();

/** Brand strings an engine may name without linking. Mention without a link is still signal. */
const brandPattern = (): RegExp => new RegExp(`\\bAIdeazz\\b|${escapeRegex(trackedDomain())}|\\bElena\\s+Revicheva\\b`, 'i');

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function promptList(): string[] {
  const raw = process.env.CITATION_PROMPTS?.trim();
  if (!raw) return DEFAULT_PROMPTS;
  return raw.split('|').map((p) => p.trim()).filter(Boolean);
}

/** Host match that accepts www and subdomains but not lookalike domains (notaideazz.xyz). */
function isOurHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  const d = trackedDomain();
  return h === d || h.endsWith(`.${d}`);
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isOurUrl(url: string): boolean {
  try {
    return isOurHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Engine adapters — each returns { text, sources } or throws
// ---------------------------------------------------------------------------

interface EngineAnswer {
  text: string;
  sources: CitationSource[];
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 120)}`);
  }
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 120)}`);
  }
}

/**
 * Google AI Overview via SerpAPI. Google returns the overview inline OR defers it
 * behind a page_token that must be fetched from a second endpoint; both shapes are
 * normal, and "no AI Overview for this query" is a valid result, not an error.
 */
async function probeGoogleAiOverview(prompt: string): Promise<EngineAnswer> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) throw new Error('SERPAPI_KEY not set');

  const params = new URLSearchParams({ engine: 'google', q: prompt, api_key: key, hl: 'en', gl: 'us' });
  let data = await getJson(`https://serpapi.com/search?${params}`);

  let overview = data?.ai_overview;
  if (overview?.page_token) {
    const second = new URLSearchParams({ engine: 'google_ai_overview', page_token: overview.page_token, api_key: key });
    data = await getJson(`https://serpapi.com/search?${second}`);
    overview = data?.ai_overview ?? overview;
  }
  if (!overview || overview.error) return { text: '', sources: [] };

  const text = (overview.text_blocks ?? [])
    .map((b: any) => [b.snippet, ...(b.list ?? []).map((li: any) => li.snippet)].filter(Boolean).join(' '))
    .join('\n');

  const sources: CitationSource[] = (overview.references ?? [])
    .map((r: any) => ({ url: String(r.link ?? ''), title: r.title ?? r.source }))
    .filter((s: CitationSource) => s.url);

  return { text, sources };
}

/**
 * Gemini with the google_search tool. Grounding chunk URIs are Google redirect links,
 * not the destination — the domain lives in `web.title`. Resolve only the chunks that
 * look like ours, so we learn the exact path (/portfolio vs apex) without paying a
 * redirect round-trip for every source on every answer.
 */
async function probeGeminiGrounded(prompt: string): Promise<EngineAnswer> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const model = (process.env.CITATION_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }] },
    {},
  );

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];

  const sources: CitationSource[] = [];
  let resolves = 0;
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri) continue;
    const title = String(web.title ?? '');
    const looksOurs = isOurHost(title) || brandPattern().test(title);
    let url = String(web.uri);
    if (looksOurs && resolves < MAX_REDIRECT_RESOLVES) {
      resolves += 1;
      url = await resolveRedirect(url, title);
    }
    sources.push({ url, title });
  }
  return { text, sources };
}

/** Follow a grounding redirect to its destination. Falls back to a domain-only URL. */
async function resolveRedirect(uri: string, title: string): Promise<string> {
  try {
    const res = await fetch(uri, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (res.url && !res.url.includes('grounding-api-redirect')) return res.url;
  } catch {
    // Redirect resolution is best-effort — a timeout must not lose the citation itself.
  }
  return isOurHost(title) ? `https://${title.replace(/^www\./, '')}` : uri;
}

/** OpenAI web search — citations arrive as url_citation annotations on the message. */
async function probeOpenAiSearch(prompt: string): Promise<EngineAnswer> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const model = (process.env.CITATION_OPENAI_MODEL || 'gpt-4o-search-preview').trim();

  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { model, messages: [{ role: 'user', content: prompt }], web_search_options: {} },
    { Authorization: `Bearer ${key}` },
  );

  const message = data?.choices?.[0]?.message;
  const text = String(message?.content ?? '');
  const sources: CitationSource[] = (message?.annotations ?? [])
    .filter((a: any) => a?.type === 'url_citation' && a?.url_citation?.url)
    .map((a: any) => ({ url: String(a.url_citation.url), title: a.url_citation.title }));

  return { text, sources };
}

/** Perplexity sonar — optional, needs PERPLEXITY_API_KEY. */
async function probePerplexity(prompt: string): Promise<EngineAnswer> {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) throw new Error('PERPLEXITY_API_KEY not set');
  const model = (process.env.CITATION_PERPLEXITY_MODEL || 'sonar').trim();

  const data = await postJson(
    'https://api.perplexity.ai/chat/completions',
    { model, messages: [{ role: 'user', content: prompt }] },
    { Authorization: `Bearer ${key}` },
  );

  const text = String(data?.choices?.[0]?.message?.content ?? '');
  const fromResults: CitationSource[] = (data?.search_results ?? [])
    .filter((r: any) => r?.url)
    .map((r: any) => ({ url: String(r.url), title: r.title }));
  const fromCitations: CitationSource[] = (data?.citations ?? [])
    .filter((c: any) => typeof c === 'string')
    .map((c: string) => ({ url: c }));

  return { text, sources: fromResults.length > 0 ? fromResults : fromCitations };
}

const ENGINES: Record<EngineId, { run: (p: string) => Promise<EngineAnswer>; keyEnv: string }> = {
  'google-ai-overview': { run: probeGoogleAiOverview, keyEnv: 'SERPAPI_KEY' },
  'gemini-grounded': { run: probeGeminiGrounded, keyEnv: 'GEMINI_API_KEY' },
  'openai-search': { run: probeOpenAiSearch, keyEnv: 'OPENAI_API_KEY' },
  perplexity: { run: probePerplexity, keyEnv: 'PERPLEXITY_API_KEY' },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function evaluate(engine: EngineId, prompt: string, answer: EngineAnswer): ProbeResult {
  const citedUrls: string[] = [];
  let position: number | null = null;

  answer.sources.forEach((source, index) => {
    if (!isOurUrl(source.url)) return;
    citedUrls.push(source.url);
    if (position === null) position = index + 1;
  });

  const primary = primaryPath().toLowerCase();
  const citedPortfolio = citedUrls.some((u) => (pathOf(u) ?? '').toLowerCase().startsWith(primary));

  return {
    engine,
    prompt,
    ok: true,
    answerChars: answer.text.length,
    sources: answer.sources,
    cited: citedUrls.length > 0,
    citedPortfolio,
    citedUrls,
    position,
    mentioned: brandPattern().test(answer.text),
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RunOptions {
  prompts?: string[];
  engines?: EngineId[];
}

export async function runCitationProbes(options: RunOptions = {}): Promise<CitationRun> {
  const prompts = options.prompts?.length ? options.prompts : promptList();
  const requested = options.engines?.length ? options.engines : (Object.keys(ENGINES) as EngineId[]);

  const active: EngineId[] = [];
  const skipped: Array<{ engine: EngineId; reason: string }> = [];
  for (const engine of requested) {
    const keyEnv = ENGINES[engine].keyEnv;
    if (process.env[keyEnv]?.trim()) active.push(engine);
    else skipped.push({ engine, reason: `${keyEnv} not set` });
  }

  const jobs = active.flatMap((engine) => prompts.map((prompt) => ({ engine, prompt })));
  const probes = await mapWithConcurrency(jobs, PROBE_CONCURRENCY, async ({ engine, prompt }) => {
    try {
      return evaluate(engine, prompt, await ENGINES[engine].run(prompt));
    } catch (err: any) {
      return {
        engine,
        prompt,
        ok: false,
        error: String(err?.message ?? err).slice(0, 300),
        answerChars: 0,
        sources: [],
        cited: false,
        citedPortfolio: false,
        citedUrls: [],
        position: null,
        mentioned: false,
      } satisfies ProbeResult;
    }
  });

  const measuredProbes = probes.filter((p) => p.ok);
  const rate = (n: number): number => (measuredProbes.length === 0 ? 0 : Math.round((n / measuredProbes.length) * 100));

  const byEngine: EngineSummary[] = active.map((engine) => {
    const rows = measuredProbes.filter((p) => p.engine === engine);
    const cited = rows.filter((p) => p.cited).length;
    return {
      engine,
      probes: rows.length,
      cited,
      citationRate: rows.length === 0 ? 0 : Math.round((cited / rows.length) * 100),
    };
  });

  return {
    ranAt: new Date().toISOString(),
    trackerVersion: TRACKER_VERSION,
    domain: trackedDomain(),
    primaryPath: primaryPath(),
    engines: active,
    skipped,
    probes,
    summary: {
      measured: measuredProbes.length,
      attempted: probes.length,
      cited: measuredProbes.filter((p) => p.cited).length,
      citedPortfolio: measuredProbes.filter((p) => p.citedPortfolio).length,
      mentioned: measuredProbes.filter((p) => p.mentioned).length,
      citationRate: rate(measuredProbes.filter((p) => p.cited).length),
      portfolioCitationRate: rate(measuredProbes.filter((p) => p.citedPortfolio).length),
      mentionRate: rate(measuredProbes.filter((p) => p.mentioned).length),
      byEngine,
    },
  };
}

/**
 * One line a human can act on. Says "not measured" when no engine answered, because
 * reporting 0% citations from zero probes would be a lie the roadmap would inherit.
 */
export function summarize(run: CitationRun): string {
  const { summary } = run;
  if (summary.measured === 0) {
    const why = run.skipped.map((s) => s.reason).join(', ') || 'every probe failed';
    return `Citation tracking did not run — ${why}. This is "not measured", not "not cited".`;
  }
  return (
    `${run.domain} cited in ${summary.cited}/${summary.measured} AI answers (${summary.citationRate}%), ` +
    `${run.primaryPath} in ${summary.citedPortfolio} (${summary.portfolioCitationRate}%), ` +
    `named without a link in ${summary.mentionRate}%.`
  );
}
