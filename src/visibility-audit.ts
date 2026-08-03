/**
 * visibility-audit.ts — AEO/GEO/Tech-SEO audit engine (AIdeazz Lab API core)
 *
 * Answers one business question: "When someone asks ChatGPT/Perplexity/Claude/Gemini
 * for what you sell, can they find you, understand you, and quote you?"
 *
 * Everything here runs on DIRECT page fetches (page + robots.txt + llms.txt +
 * sitemap.xml) — zero SerpAPI / Bright Data spend. That is deliberate: the free
 * tier must cost nothing per call so the live demo can stay public.
 *
 * Four scored categories (weights sum to 100):
 *   aiAccess   (25) — can AI crawlers even reach the site?
 *   geo        (25) — structured data: can machines understand WHAT you are?
 *   aeo        (30) — answer-readiness: will an answer engine quote you?
 *   techSeo    (20) — technical foundation the other three stand on
 *
 * No HTML parser dependency on purpose: checks are presence/shape checks, and the
 * regex extraction layer below is enough — keeps the module deployable anywhere
 * in the fleet without touching package.json.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type CheckImpact = 'high' | 'medium' | 'low';
export type CategoryId = 'aiAccess' | 'geo' | 'aeo' | 'techSeo';

export interface AuditCheck {
  id: string;
  category: CategoryId;
  label: string;
  status: CheckStatus;
  impact: CheckImpact;
  /** What we actually observed on the page (evidence, not opinion). */
  detail: string;
  /** Concrete action that flips this check to pass. Only set when not passing. */
  fix?: string;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  /** 0-100 within the category. */
  score: number;
  weight: number;
  passed: number;
  total: number;
}

/** Per-engine verdict — the headline a non-technical buyer understands instantly. */
export interface EngineVisibility {
  engine: string;
  crawler: string;
  /** 'yes' = crawler allowed; 'blocked' = robots denies it; 'unknown' = robots unreachable. */
  crawlable: 'yes' | 'blocked' | 'unknown';
}

/**
 * What the page tells a machine it IS, before any JavaScript runs. Two routes that
 * return the same identity are the same page to an AI engine no matter how well each
 * one scores on its own — which is how a prerender regression hides behind an A+.
 */
export interface PageIdentity {
  title: string;
  metaDescription: string | null;
  /** Every schema.org type found, JSON-LD and microdata/RDFa combined. */
  schemaTypes: string[];
  /** Words in the raw HTML — the text a non-JS crawler actually receives. */
  words: number;
}

export interface AuditResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  /** 0-100 weighted overall. */
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  /** One-sentence executive summary. */
  verdict: string;
  aiEngines: EngineVisibility[];
  identity: PageIdentity;
  categories: CategoryScore[];
  checks: AuditCheck[];
  /** Top failing high-impact fixes, ordered — the "do these first" list. */
  topFixes: string[];
  meta: {
    responseMs: number;
    htmlBytes: number;
    redirected: boolean;
    engineVersion: string;
  };
}

export const ENGINE_VERSION = '1.2.0';

const CATEGORY_DEFS: Record<CategoryId, { label: string; weight: number }> = {
  aiAccess: { label: 'AI Crawler Access', weight: 25 },
  geo: { label: 'Structured Data (GEO)', weight: 25 },
  aeo: { label: 'Answer-Readiness (AEO)', weight: 30 },
  techSeo: { label: 'Technical Foundation', weight: 20 },
};

/** AI engines a business owner actually asks about, mapped to their crawlers. */
const AI_CRAWLERS: Array<{ engine: string; crawler: string }> = [
  { engine: 'ChatGPT (OpenAI)', crawler: 'GPTBot' },
  { engine: 'ChatGPT Search', crawler: 'OAI-SearchBot' },
  { engine: 'Claude (Anthropic)', crawler: 'ClaudeBot' },
  { engine: 'Perplexity', crawler: 'PerplexityBot' },
  { engine: 'Gemini (Google AI)', crawler: 'Google-Extended' },
  { engine: 'LLM training corpora', crawler: 'CCBot' },
];

const FETCH_UA =
  'Mozilla/5.0 (compatible; AIdeazzVisibilityBot/1.0; +https://aideazz.xyz/api)';

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface FetchedDoc {
  ok: boolean;
  status: number;
  url: string;
  redirected: boolean;
  body: string;
  headers: Headers | null;
  ms: number;
}

async function fetchDoc(url: string): Promise<FetchedDoc> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_UA, Accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      redirected: res.redirected,
      body,
      headers: res.headers,
      ms: Date.now() - started,
    };
  } catch {
    return { ok: false, status: 0, url, redirected: false, body: '', headers: null, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Extraction layer (regex-based, presence/shape checks only)
// ---------------------------------------------------------------------------

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function textContent(html: string): string {
  return stripScriptsAndStyles(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push((m[1] ?? '').trim());
  return out;
}

/** All <meta> tags as { name/property → content }, lowercased keys. */
function extractMeta(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const key =
      /\b(?:name|property|http-equiv)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content !== undefined && !map.has(key)) map.set(key, content);
  }
  return map;
}

interface JsonLdInfo {
  blocks: number;
  types: Set<string>;
  /** type → JSON path where it was first seen (evidence for check details). */
  typePaths: Map<string, string>;
  hasDates: boolean;
  /** sameAs entity links (Wikidata, social profiles) — strong disambiguation signal. */
  hasSameAs: boolean;
}

function extractJsonLd(html: string): JsonLdInfo {
  const info: JsonLdInfo = { blocks: 0, types: new Set(), typePaths: new Map(), hasDates: false, hasSameAs: false };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    info.blocks += 1;
    try {
      const parsed: unknown = JSON.parse(raw);
      collectJsonLdTypes(parsed, info, 'root');
    } catch {
      // Malformed JSON-LD still counts as a block; the schema checks will flag quality.
    }
    if (/"date(?:Published|Modified)"\s*:/.test(raw)) info.hasDates = true;
    if (/"sameAs"\s*:/.test(raw)) info.hasSameAs = true;
  }
  return info;
}

function collectJsonLdTypes(node: unknown, info: JsonLdInfo, path: string): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, info, path);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    const addType = (x: string) => {
      info.types.add(x);
      if (!info.typePaths.has(x)) info.typePaths.set(x, path);
    };
    if (typeof t === 'string') addType(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') addType(x);
    // Walk EVERY nested value, not just @graph/mainEntity/itemListElement:
    // real-world identity often lives in nested nodes — e.g. Wikipedia declares
    // its Organization inside Article.publisher — and missing it falsely fails
    // the identity check.
    for (const [key, value] of Object.entries(obj)) {
      if (key === '@type' || key === '@context') continue;
      if (value && typeof value === 'object') {
        collectJsonLdTypes(value, info, path === 'root' ? key : `${path}.${key}`);
      }
    }
  }
}

/**
 * schema.org types declared as HTML microdata (itemtype=) or RDFa (typeof=).
 * Older CMSes and several major platforms mark up this way instead of JSON-LD —
 * AI retrievers read it fine, so "no JSON-LD" must not mean "no structured data".
 */
function extractInlineSchemaTypes(html: string): Set<string> {
  const types = new Set<string>();
  const microdata = /\bitemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = microdata.exec(html)) !== null) if (m[1]) types.add(m[1]);
  if (/\b(?:vocab\s*=\s*["']https?:\/\/schema\.org\/?["']|typeof\s*=\s*["'](?:schema:)?[A-Za-z]+["'])/i.test(html)) {
    const rdfa = /\btypeof\s*=\s*["'](?:schema:)?([A-Za-z]+)["']/gi;
    while ((m = rdfa.exec(html)) !== null) if (m[1]) types.add(m[1]);
  }
  return types;
}

/** "Organization (in publisher)" — evidence of where the type was declared. */
function describeTypeSource(types: string[], jsonLd: JsonLdInfo, inline: Set<string>): string {
  return types
    .map((t) => {
      const path = jsonLd.typePaths.get(t);
      if (path) return path === 'root' ? t : `${t} (in ${path})`;
      return inline.has(t) ? `${t} (microdata/RDFa)` : t;
    })
    .join(', ');
}

/**
 * Minimal robots.txt evaluation: is `crawler` allowed to fetch "/"?
 * Groups rules by user-agent; a specific UA group overrides `*`.
 */
function robotsAllows(robotsTxt: string, crawler: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  const groups: Array<{ agents: string[]; disallowRoot: boolean; allowRoot: boolean }> = [];
  let current: { agents: string[]; disallowRoot: boolean; allowRoot: boolean } | null = null;
  let collectingAgents = false;

  for (const rawLine of lines) {
    const line = (rawLine.split('#')[0] ?? '').trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'user-agent') {
      if (!collectingAgents || !current) {
        current = { agents: [], disallowRoot: false, allowRoot: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
    } else {
      collectingAgents = false;
      if (!current) continue;
      if (field === 'disallow' && (value === '/' || value === '/*')) current.disallowRoot = true;
      if (field === 'allow' && value === '/') current.allowRoot = true;
    }
  }

  const target = crawler.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a === target));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? wildcard;
  if (!group) return true; // no applicable rules → allowed
  if (group.allowRoot) return true;
  return !group.disallowRoot;
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

export async function runVisibilityAudit(inputUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(inputUrl);
  const origin = new URL(url).origin;

  const [page, robots, llms, sitemap] = await Promise.all([
    fetchDoc(url),
    fetchDoc(`${origin}/robots.txt`),
    fetchDoc(`${origin}/llms.txt`),
    fetchDoc(`${origin}/sitemap.xml`),
  ]);

  // Only a genuine connection failure (DNS/timeout/refused) is unauditable.
  // Every real HTTP response — including 403 bot-blocks and empty JS-only shells —
  // is itself a finding: it's exactly how the site looks to an AI crawler.
  if (page.status === 0) {
    throw new AuditFetchError(
      `Could not connect to ${url} (network error, DNS failure, or timeout). ` +
        `Check the domain is spelled correctly and the site is online.`,
    );
  }

  const html = page.body;
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const text = textContent(html);
  const words = text ? text.split(' ').length : 0;
  const checks: AuditCheck[] = [];
  const robotsAvailable = robots.ok && robots.body.length > 0;

  // Diagnose the two ways a "reachable" page is still invisible to AI:
  //   blocked  — server refused our request (bot protection blocks AI crawlers too)
  //   jsShell  — 200 OK but almost no text in the raw HTML (client-rendered SPA)
  const isBlocked = page.status === 401 || page.status === 403 || page.status === 429;
  const isServerError = page.status >= 500;
  const jsShell = page.status >= 200 && page.status < 300 && words < 50;

  checks.push({
    id: 'http-response',
    category: 'aiAccess',
    label: 'Server returns a readable page (HTTP 200)',
    status: page.status >= 200 && page.status < 300 ? 'pass' : 'fail',
    impact: 'high',
    detail:
      page.status >= 200 && page.status < 300
        ? `HTTP ${page.status}`
        : isBlocked
          ? `HTTP ${page.status} — the server BLOCKED our request. Bot protection that stops us also stops GPTBot, ClaudeBot and PerplexityBot.`
          : isServerError
            ? `HTTP ${page.status} — server error; AI crawlers get nothing.`
            : `HTTP ${page.status} — non-success response; the page is not being served to crawlers.`,
    ...(page.status >= 200 && page.status < 300
      ? {}
      : {
          fix: isBlocked
            ? 'Allowlist AI crawler user-agents (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) in your WAF/bot protection.'
            : 'Return HTTP 200 with server-rendered content for crawler user-agents.',
        }),
  });

  // ---- Category 1: AI Crawler Access -------------------------------------
  const aiEngines: EngineVisibility[] = AI_CRAWLERS.map(({ engine, crawler }) => ({
    engine,
    crawler,
    crawlable: robotsAvailable ? (robotsAllows(robots.body, crawler) ? 'yes' : 'blocked') : 'unknown',
  }));
  const blockedEngines = aiEngines.filter((e) => e.crawlable === 'blocked');

  checks.push({
    id: 'robots-txt',
    category: 'aiAccess',
    label: 'robots.txt reachable',
    status: robotsAvailable ? 'pass' : 'warn',
    impact: 'medium',
    detail: robotsAvailable
      ? `Found at ${origin}/robots.txt (${robots.body.length} bytes)`
      : `No robots.txt at ${origin}/robots.txt — crawlers fall back to "allow all", but you lose control`,
    ...(robotsAvailable
      ? {}
      : { fix: 'Publish a robots.txt that explicitly welcomes AI crawlers and points to your sitemap.' }),
  });

  for (const e of aiEngines) {
    const pass = e.crawlable !== 'blocked';
    checks.push({
      id: `crawler-${e.crawler.toLowerCase()}`,
      category: 'aiAccess',
      label: `${e.engine} can crawl (${e.crawler})`,
      status: pass ? 'pass' : 'fail',
      impact: 'high',
      detail:
        e.crawlable === 'yes'
          ? `robots.txt allows ${e.crawler}`
          : e.crawlable === 'blocked'
            ? `robots.txt BLOCKS ${e.crawler} — this engine cannot read the site`
            : `robots.txt unreachable — assuming allowed`,
      ...(pass ? {} : { fix: `Remove the Disallow rule for ${e.crawler} in robots.txt.` }),
    });
  }

  const hasLlmsTxt = llms.ok && llms.body.length > 0 && !/^\s*</.test(llms.body);
  checks.push({
    id: 'llms-txt',
    category: 'aiAccess',
    label: 'llms.txt present',
    status: hasLlmsTxt ? 'pass' : 'warn',
    impact: 'medium',
    detail: hasLlmsTxt
      ? `Found at ${origin}/llms.txt — you are giving LLMs a curated map of the site`
      : 'No llms.txt — an emerging standard (llmstxt.org) that tells AI assistants what matters on your site',
    ...(hasLlmsTxt
      ? {}
      : { fix: 'Add an llms.txt at the site root: a short markdown file listing your key pages and what they offer.' }),
  });

  const hasSitemap =
    (sitemap.ok && /<(urlset|sitemapindex)\b/i.test(sitemap.body)) ||
    (robotsAvailable && /sitemap\s*:/i.test(robots.body));
  checks.push({
    id: 'sitemap',
    category: 'aiAccess',
    label: 'XML sitemap available',
    status: hasSitemap ? 'pass' : 'fail',
    impact: 'medium',
    detail: hasSitemap
      ? 'Sitemap found (direct or referenced in robots.txt)'
      : `No sitemap at ${origin}/sitemap.xml and none referenced in robots.txt`,
    ...(hasSitemap ? {} : { fix: 'Generate a sitemap.xml and reference it from robots.txt (Sitemap: <url>).' }),
  });

  // noindex can hide in the HTML meta OR the X-Robots-Tag response header —
  // the header variant is invisible in "view source" and a classic silent killer.
  const robotsMeta = (meta.get('robots') ?? '').toLowerCase();
  const robotsHeader = (page.headers?.get('x-robots-tag') ?? '').toLowerCase();
  const metaNoindex = robotsMeta.includes('noindex') || robotsMeta.includes('none');
  const headerNoindex = /\b(noindex|none)\b/.test(robotsHeader);
  const noindexed = metaNoindex || headerNoindex;
  checks.push({
    id: 'no-noindex',
    category: 'aiAccess',
    label: 'Page is indexable (no noindex meta/header)',
    status: noindexed ? 'fail' : 'pass',
    impact: 'high',
    detail: metaNoindex
      ? `<meta name="robots" content="${robotsMeta}"> — this page tells every engine to ignore it`
      : headerNoindex
        ? `X-Robots-Tag response header "${robotsHeader}" — invisible in the HTML, but every engine obeys it`
        : 'No noindex directive in meta robots or X-Robots-Tag header',
    ...(noindexed
      ? {
          fix: metaNoindex
            ? 'Remove the noindex directive unless this page is intentionally hidden.'
            : 'Remove "noindex" from the X-Robots-Tag header (check CDN/server config — it is often set there by mistake).',
        }
      : {}),
  });

  // ---- Category 2: Structured Data (GEO) ---------------------------------
  // Structured data is JSON-LD *or* microdata/RDFa — engines read all three.
  const inlineTypes = extractInlineSchemaTypes(html);
  const allSchemaTypes = new Set<string>([...jsonLd.types, ...inlineTypes]);
  const hasJsonLd = jsonLd.blocks > 0;
  const hasAnySchema = hasJsonLd || inlineTypes.size > 0;
  checks.push({
    id: 'json-ld',
    category: 'geo',
    label: 'Structured data present (JSON-LD / microdata)',
    status: hasJsonLd ? 'pass' : inlineTypes.size > 0 ? 'warn' : 'fail',
    impact: 'high',
    detail: hasJsonLd
      ? `${jsonLd.blocks} JSON-LD block(s), types: ${listTypes(jsonLd.types, 8) || 'none parsed'}${inlineTypes.size > 0 ? ` + microdata/RDFa: ${listTypes(inlineTypes, 4)}` : ''}`
      : inlineTypes.size > 0
        ? `No JSON-LD, but microdata/RDFa found: ${listTypes(inlineTypes, 8)} — readable, though JSON-LD is what engines parse most reliably`
        : 'No JSON-LD or microdata found — machines must guess what this page is',
    ...(hasJsonLd ? {} : { fix: 'Add JSON-LD (schema.org) describing the page: at minimum Organization or WebSite.' }),
  });

  const identityTypes = ['Organization', 'NewsMediaOrganization', 'LocalBusiness', 'Person', 'WebSite', 'ProfessionalService', 'Corporation', 'Brand'];
  const presentIdentity = identityTypes.filter((t) => allSchemaTypes.has(t));
  const hasIdentity = presentIdentity.length > 0;
  checks.push({
    id: 'schema-identity',
    category: 'geo',
    label: 'Identity schema (Organization / Person / WebSite)',
    status: hasIdentity ? 'pass' : hasAnySchema ? 'warn' : 'fail',
    impact: 'high',
    detail: hasIdentity
      ? `Identity declared: ${describeTypeSource(presentIdentity, jsonLd, inlineTypes)}`
      : 'No identity schema — AI engines cannot confidently say WHO is behind this site',
    ...(hasIdentity
      ? {}
      : { fix: 'Add Organization (or Person) JSON-LD with name, url, logo, sameAs links to your profiles.' }),
  });

  const answerTypes = ['FAQPage', 'QAPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'Product', 'Service', 'Offer', 'Recipe', 'Event'];
  const presentAnswerTypes = answerTypes.filter((t) => allSchemaTypes.has(t));
  checks.push({
    id: 'schema-answer',
    category: 'geo',
    label: 'Answer-rich schema (FAQ / Article / Product / Service)',
    status: presentAnswerTypes.length > 0 ? 'pass' : 'warn',
    impact: 'medium',
    detail:
      presentAnswerTypes.length > 0
        ? `Present: ${describeTypeSource(presentAnswerTypes, jsonLd, inlineTypes)}`
        : 'None of FAQPage/HowTo/Article/Product/Service found — these are the types answer engines quote most',
    ...(presentAnswerTypes.length > 0
      ? {}
      : { fix: 'Mark up your FAQ or key offer as FAQPage / Service JSON-LD so engines can lift Q&A directly.' }),
  });

  // sameAs links tie the page to a canonical entity (Wikidata, LinkedIn, GitHub…)
  // — how engines disambiguate YOU from someone with a similar name.
  checks.push({
    id: 'entity-links',
    category: 'geo',
    label: 'Entity links (sameAs to profiles / knowledge graph)',
    status: jsonLd.hasSameAs ? 'pass' : 'warn',
    impact: 'medium',
    detail: jsonLd.hasSameAs
      ? 'sameAs present — the page anchors itself to known entities'
      : 'No sameAs links — engines cannot tie this page to your profiles or knowledge-graph entries',
    ...(jsonLd.hasSameAs
      ? {}
      : { fix: 'Add sameAs to your JSON-LD: links to LinkedIn, GitHub, Wikidata, social profiles.' }),
  });

  const ogTitle = meta.get('og:title');
  const ogDesc = meta.get('og:description');
  const ogImage = meta.get('og:image');
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    id: 'open-graph',
    category: 'geo',
    label: 'Open Graph tags (title, description, image)',
    status: ogCount === 3 ? 'pass' : ogCount > 0 ? 'warn' : 'fail',
    impact: 'medium',
    detail: `${ogCount}/3 present${ogTitle ? ` — og:title: "${truncate(ogTitle, 60)}"` : ''}`,
    ...(ogCount === 3 ? {} : { fix: 'Add og:title, og:description and og:image — used for previews AND by several AI retrievers.' }),
  });

  const canonical = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
  checks.push({
    id: 'canonical',
    category: 'geo',
    label: 'Canonical URL declared',
    status: canonical ? 'pass' : 'warn',
    impact: 'medium',
    detail: canonical ? 'rel="canonical" present' : 'No canonical link — duplicate-URL signals get split',
    ...(canonical ? {} : { fix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL of this page.' }),
  });

  const langAttr = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  checks.push({
    id: 'html-lang',
    category: 'geo',
    label: 'Language declared on <html>',
    status: langAttr ? 'pass' : 'warn',
    impact: 'low',
    detail: langAttr ? `lang="${langAttr}"` : 'No lang attribute — engines must guess the language',
    ...(langAttr ? {} : { fix: 'Add lang="en" (or your language) to the <html> tag.' }),
  });

  const metaDesc = meta.get('description');
  const descOk = !!metaDesc && metaDesc.length >= 50 && metaDesc.length <= 170;
  checks.push({
    id: 'meta-description',
    category: 'geo',
    label: 'Meta description (50–170 chars)',
    status: descOk ? 'pass' : metaDesc ? 'warn' : 'fail',
    impact: 'medium',
    detail: metaDesc
      ? `${metaDesc.length} chars — "${truncate(metaDesc, 80)}"`
      : 'Missing — this is the sentence engines reuse when summarizing you',
    ...(descOk ? {} : { fix: 'Write a 50–170 char meta description that states what you offer and for whom.' }),
  });

  // ---- Category 3: Answer-Readiness (AEO) --------------------------------
  const title = extractTag(html, 'title')[0] ?? '';
  const titleOk = title.length >= 15 && title.length <= 70;
  checks.push({
    id: 'title',
    category: 'aeo',
    label: 'Title tag (15–70 chars)',
    status: title ? (titleOk ? 'pass' : 'warn') : 'fail',
    impact: 'high',
    detail: title ? `${title.length} chars — "${truncate(title, 70)}"` : 'No <title> tag',
    ...(titleOk ? {} : { fix: 'Give the page a 15–70 character title that names the offer, not just the brand.' }),
  });

  const h1s = extractTag(html, 'h1').map((h) => textContent(h)).filter(Boolean);
  checks.push({
    id: 'h1',
    category: 'aeo',
    label: 'Exactly one H1',
    status: h1s.length === 1 ? 'pass' : h1s.length > 1 ? 'warn' : 'fail',
    impact: 'high',
    detail:
      h1s.length === 1
        ? `H1: "${truncate(h1s[0] ?? '', 70)}"`
        : h1s.length > 1
          ? `${h1s.length} H1s found — the main topic is ambiguous`
          : 'No H1 — the page never states its main topic',
    ...(h1s.length === 1 ? {} : { fix: 'Use exactly one H1 that states the page topic in plain words.' }),
  });

  const h2s = extractTag(html, 'h2').map((h) => textContent(h)).filter(Boolean);
  const h3s = extractTag(html, 'h3').map((h) => textContent(h)).filter(Boolean);
  checks.push({
    id: 'heading-structure',
    category: 'aeo',
    label: 'Section headings (H2/H3) structure content',
    status: h2s.length >= 2 ? 'pass' : h2s.length + h3s.length > 0 ? 'warn' : 'fail',
    impact: 'medium',
    detail: `${h2s.length} H2s, ${h3s.length} H3s`,
    ...(h2s.length >= 2
      ? {}
      : { fix: 'Break content into H2 sections — answer engines extract section-level chunks.' }),
  });

  const allHeadings = [...h1s, ...h2s, ...h3s];
  const questionHeadings = allHeadings.filter(
    (h) => /\?/.test(h) || /^(how|what|why|when|where|who|which|can|should|is|are|do|does|cómo|qué|por qué|cuándo|dónde|quién|puede)\b/i.test(h),
  );
  checks.push({
    id: 'question-headings',
    category: 'aeo',
    label: 'Question-style headings (FAQ signal)',
    status: questionHeadings.length >= 2 ? 'pass' : questionHeadings.length === 1 ? 'warn' : 'fail',
    impact: 'medium',
    detail:
      questionHeadings.length > 0
        ? `${questionHeadings.length} question-style heading(s), e.g. "${truncate(questionHeadings[0] ?? '', 60)}"`
        : 'No headings phrased as questions — answer engines match questions to question-shaped content',
    ...(questionHeadings.length >= 2
      ? {}
      : { fix: 'Add an FAQ section whose H2/H3s are the literal questions customers ask.' }),
  });

  checks.push({
    id: 'content-depth',
    category: 'aeo',
    label: 'Content depth (300+ words)',
    status: words >= 300 ? 'pass' : words >= 120 ? 'warn' : 'fail',
    impact: 'high',
    detail: `~${words} words of visible text`,
    ...(words >= 300
      ? {}
      : { fix: 'Thin pages rarely get cited. Add substantive copy: what you do, for whom, proof, FAQs.' }),
  });

  const semanticTags = ['main', 'article', 'section', 'nav', 'header', 'footer'].filter((t) =>
    new RegExp(`<${t}\\b`, 'i').test(html),
  );
  checks.push({
    id: 'semantic-html',
    category: 'aeo',
    label: 'Semantic HTML5 landmarks',
    status: semanticTags.length >= 3 ? 'pass' : semanticTags.length > 0 ? 'warn' : 'fail',
    impact: 'low',
    detail: semanticTags.length > 0 ? `Present: ${semanticTags.join(', ')}` : 'Only generic <div>s — harder to segment',
    ...(semanticTags.length >= 3
      ? {}
      : { fix: 'Wrap content in <main>/<article>/<section> so extractors can isolate the substance.' }),
  });

  const hasLists = /<(ul|ol|dl)\b/i.test(html);
  const hasTables = /<table\b/i.test(html);
  checks.push({
    id: 'extractable-facts',
    category: 'aeo',
    label: 'Lists or tables (extractable facts)',
    status: hasLists || hasTables ? 'pass' : 'warn',
    impact: 'low',
    detail: `${hasLists ? 'lists ✓' : 'no lists'}, ${hasTables ? 'tables ✓' : 'no tables'}`,
    ...(hasLists || hasTables
      ? {}
      : { fix: 'Present key facts (features, prices, steps) as lists — LLMs lift structured facts verbatim.' }),
  });

  const hasFreshness = jsonLd.hasDates || /<time\b/i.test(html) || !!meta.get('article:modified_time');
  checks.push({
    id: 'freshness-signal',
    category: 'aeo',
    label: 'Freshness signal (dates)',
    status: hasFreshness ? 'pass' : 'warn',
    impact: 'low',
    detail: hasFreshness
      ? 'datePublished/dateModified or <time> found'
      : 'No machine-readable dates — engines prefer content they can date',
    ...(hasFreshness ? {} : { fix: 'Add dateModified to JSON-LD or visible <time> elements on updated content.' }),
  });

  // ---- Category 4: Technical Foundation ----------------------------------
  const isHttps = new URL(page.url).protocol === 'https:';
  checks.push({
    id: 'https',
    category: 'techSeo',
    label: 'Served over HTTPS',
    status: isHttps ? 'pass' : 'fail',
    impact: 'high',
    detail: isHttps ? 'HTTPS ✓' : 'Plain HTTP — many crawlers and all browsers penalize this',
    ...(isHttps ? {} : { fix: 'Install a TLS certificate and redirect HTTP → HTTPS.' }),
  });

  checks.push({
    id: 'response-time',
    category: 'techSeo',
    label: 'Response time under 1.5s',
    status: page.ms <= 1500 ? 'pass' : page.ms <= 4000 ? 'warn' : 'fail',
    impact: 'medium',
    detail: `${page.ms} ms to fetch the HTML`,
    ...(page.ms <= 1500
      ? {}
      : { fix: 'Slow responses cause crawl budget cuts and timeouts in AI retrievers. Cache or CDN the HTML.' }),
  });

  const htmlBytes = Buffer.byteLength(html, 'utf8');
  checks.push({
    id: 'page-weight',
    category: 'techSeo',
    label: 'HTML under 1.5 MB',
    status: htmlBytes <= 1_500_000 ? 'pass' : 'warn',
    impact: 'low',
    detail: `${(htmlBytes / 1024).toFixed(0)} KB of HTML`,
    ...(htmlBytes <= 1_500_000 ? {} : { fix: 'Trim inlined payloads; several AI fetchers truncate very large documents.' }),
  });

  const hasViewport = meta.has('viewport');
  checks.push({
    id: 'viewport',
    category: 'techSeo',
    label: 'Mobile viewport meta',
    status: hasViewport ? 'pass' : 'fail',
    impact: 'medium',
    detail: hasViewport ? `viewport: "${truncate(meta.get('viewport') ?? '', 50)}"` : 'Missing viewport meta',
    ...(hasViewport ? {} : { fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' }),
  });

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsWithAlt = imgTags.filter((t) => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
  const altRatio = imgTags.length === 0 ? 1 : imgsWithAlt / imgTags.length;
  checks.push({
    id: 'img-alt',
    category: 'techSeo',
    label: 'Image alt coverage ≥ 80%',
    status: altRatio >= 0.8 ? 'pass' : altRatio >= 0.5 ? 'warn' : 'fail',
    impact: 'low',
    detail: imgTags.length === 0 ? 'No <img> tags' : `${imgsWithAlt}/${imgTags.length} images have alt text`,
    ...(altRatio >= 0.8 ? {} : { fix: 'Describe images in alt text — it is indexable content and an accessibility win.' }),
  });

  const contentRendered = words >= 50;
  checks.push({
    id: 'ssr-content',
    category: 'techSeo',
    label: 'Content present in raw HTML (not JS-only)',
    status: contentRendered ? 'pass' : 'fail',
    impact: 'high',
    detail: contentRendered
      ? `~${words} words server-delivered`
      : `Only ~${words} words in raw HTML — most AI crawlers do NOT execute JavaScript; they see an empty page`,
    ...(contentRendered
      ? {}
      : { fix: 'Server-render or prerender the page. A JS-only SPA is invisible to most AI retrievers.' }),
  });

  const metaRefresh = meta.has('refresh');
  checks.push({
    id: 'no-meta-refresh',
    category: 'techSeo',
    label: 'No meta-refresh redirect',
    status: metaRefresh ? 'fail' : 'pass',
    impact: 'low',
    detail: metaRefresh ? 'meta http-equiv="refresh" found — crawlers often stop here' : 'None',
    ...(metaRefresh ? { fix: 'Replace the meta refresh with a proper HTTP 301 redirect.' } : {}),
  });

  // ---- Scoring ------------------------------------------------------------
  const categories: CategoryScore[] = (Object.keys(CATEGORY_DEFS) as CategoryId[]).map((id) => {
    const def = CATEGORY_DEFS[id];
    const catChecks = checks.filter((c) => c.category === id);
    const points = catChecks.reduce(
      (sum, c) => sum + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0),
      0,
    );
    const score = catChecks.length === 0 ? 0 : Math.round((points / catChecks.length) * 100);
    return {
      id,
      label: def.label,
      score,
      weight: def.weight,
      passed: catChecks.filter((c) => c.status === 'pass').length,
      total: catChecks.length,
    };
  });

  const overall = Math.round(
    categories.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0),
  );
  const grade = overall >= 93 ? 'A+' : overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

  const topFixes = checks
    .filter((c) => c.status !== 'pass' && c.fix)
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact) || statusRank(b.status) - statusRank(a.status))
    .slice(0, 5)
    .map((c) => c.fix as string);

  const verdict = buildVerdict(overall, grade, blockedEngines, categories, {
    httpBlocked: isBlocked,
    serverError: isServerError,
    jsShell,
  });

  return {
    url: inputUrl,
    finalUrl: page.url,
    fetchedAt: new Date().toISOString(),
    score: overall,
    grade,
    verdict,
    aiEngines,
    identity: {
      title,
      metaDescription: metaDesc ?? null,
      schemaTypes: [...allSchemaTypes],
      words,
    },
    categories,
    checks,
    topFixes,
    meta: {
      responseMs: page.ms,
      htmlBytes,
      redirected: page.redirected,
      engineVersion: ENGINE_VERSION,
    },
  };
}

export class AuditFetchError extends Error {}

function buildVerdict(
  score: number,
  grade: string,
  blocked: EngineVisibility[],
  categories: CategoryScore[],
  flags: { httpBlocked: boolean; serverError: boolean; jsShell: boolean },
): string {
  if (flags.httpBlocked) {
    return `Grade ${grade} (${score}/100) — CRITICAL: the server blocks automated requests, so AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are turned away before they ever see your content.`;
  }
  if (flags.serverError) {
    return `Grade ${grade} (${score}/100) — the server returned an error; AI crawlers currently get nothing from this URL.`;
  }
  if (flags.jsShell) {
    return `Grade ${grade} (${score}/100) — CRITICAL: this page is a JavaScript-only shell. Most AI crawlers don't run JavaScript, so they see an almost-empty page. Server-render or prerender it.`;
  }
  if (blocked.length > 0) {
    return `Grade ${grade} (${score}/100) — CRITICAL: ${blocked.map((b) => b.engine).join(', ')} ${blocked.length === 1 ? 'is' : 'are'} blocked from reading this site at all.`;
  }
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  if (score >= 85) {
    return `Grade ${grade} (${score}/100) — strong AI visibility; polish ${weakest?.label ?? 'the weakest area'} to stay ahead.`;
  }
  if (score >= 55) {
    return `Grade ${grade} (${score}/100) — AI engines can see this site but ${weakest?.label ?? 'a key area'} is costing citations.`;
  }
  return `Grade ${grade} (${score}/100) — this site is close to invisible to AI search; start with ${weakest?.label ?? 'the basics'}.`;
}

function impactRank(i: CheckImpact): number {
  return i === 'high' ? 3 : i === 'medium' ? 2 : 1;
}
function statusRank(s: CheckStatus): number {
  return s === 'fail' ? 2 : s === 'warn' ? 1 : 0;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Cap a schema type list, but say how many were left out — a silent cut reads as "that is all you have". */
function listTypes(types: Iterable<string>, max: number): string {
  const all = [...types];
  const shown = all.slice(0, max).join(', ');
  return all.length > max ? `${shown} +${all.length - max} more` : shown;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Throws TypeError on garbage — caller converts to a 400.
  return new URL(withProto).toString();
}
