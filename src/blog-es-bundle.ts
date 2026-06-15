/**
 * Spanish bundles for aideazz.xyz/blog — translates Hashnode/dev.to English posts once,
 * caches JSON on disk, serves GET /blog/es-bundle/:slug + lightweight /blog/es-meta/:slug.
 */
import * as fs from "fs";
import * as path from "path";
import { Anthropic } from "@anthropic-ai/sdk";
import { claudeWithGroqFallback } from "./llm-resilience";

const GQL = "https://gql.hashnode.com/";
const CACHE_VERSION = 3;

export type BlogEsBundle = {
  v: number;
  slug: string;
  title: string;
  brief: string;
  markdown: string;
  source: "hashnode" | "devto";
  cachedAt: string;
};

type EnglishSource = {
  title: string;
  brief: string | null;
  markdown: string;
  url: string;
  source: "hashnode" | "devto";
};

function hashnodeHost(): string {
  return (
    (process.env.HASHNODE_HOST || "aideazz.hashnode.dev")
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.trim() || "aideazz.hashnode.dev"
  );
}

function devtoUsername(): string {
  return (process.env.DEVTO_USERNAME || "elenarevicheva").trim() || "elenarevicheva";
}

function cacheDir(): string {
  return process.env.BLOG_ES_CACHE_DIR?.trim() || path.join(process.cwd(), "data/blog-es-cache");
}

function bundlePath(slug: string): string {
  return path.join(cacheDir(), `${safeSlug(slug)}.json`);
}

function safeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 180);
}

async function gqlPublic<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Hashnode GQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Empty Hashnode GQL data");
  return json.data;
}

async function fetchEnglishFromHashnode(slug: string): Promise<EnglishSource | null> {
  const query = `
    query One($host: String!, $slug: String!) {
      publication(host: $host) {
        post(slug: $slug) {
          title
          brief
          url
          content { markdown }
        }
      }
    }
  `;
  type R = {
    publication: {
      post: {
        title: string;
        brief: string | null;
        url: string;
        content: { markdown: string | null } | null;
      } | null;
    } | null;
  };
  const data = await gqlPublic<R>(query, { host: hashnodeHost(), slug });
  const p = data.publication?.post;
  const md = p?.content?.markdown?.trim();
  if (!p || !md) return null;
  return {
    title: p.title,
    brief: p.brief,
    markdown: md,
    url: p.url,
    source: "hashnode",
  };
}

function devtoPathMatchesBlogSlug(path: string, blogSlug: string): boolean {
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  if (seg === blogSlug) return true;
  return seg.startsWith(`${blogSlug}-`);
}

async function fetchEnglishFromDevto(blogSlug: string): Promise<EnglishSource | null> {
  const user = devtoUsername();
  try {
    const listRes = await fetch(
      `https://dev.to/api/articles?username=${encodeURIComponent(user)}&per_page=100`
    );
    if (!listRes.ok) return null;
    const list = (await listRes.json()) as { id: number; path: string }[];
    if (!Array.isArray(list)) return null;
    const hit = list.find((a) => devtoPathMatchesBlogSlug(a.path, blogSlug));
    if (!hit) return null;

    const res = await fetch(`https://dev.to/api/articles/${hit.id}`);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      title: string;
      body_markdown?: string;
      url?: string;
      path?: string;
      description?: string;
    };
    const md = j.body_markdown?.trim();
    if (!md) return null;
    const brief =
      j.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || null;
    return {
      title: j.title,
      brief,
      markdown: md,
      url: j.url || `https://dev.to${j.path || hit.path}`,
      source: "devto",
    };
  } catch {
    return null;
  }
}

function readLocalBlogPost(slug: string): EnglishSource | null {
  try {
    const cacheFile = path.join(process.env.HASHNODE_TOPIC_STATE_DIR || path.join(process.cwd(), "data"), "blog-posts-cache.json");
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, { title: string; markdown: string; devtoUrl: string; aideazzBlogUrl: string }>;
    const entry = cache[slug];
    if (!entry?.markdown) return null;
    return { title: entry.title, brief: null, markdown: entry.markdown, url: entry.devtoUrl, source: "devto" };
  } catch { return null; }
}

/** Direct dev.to fetch by /{username}/{slug} — immune to the stale per-edge cache
 *  of the listing API (June 11 2026: Oracle's edge served a 64-article list missing
 *  the newest posts, so suffixed slugs returned "Post not found"). */
async function fetchDevtoByPath(slug: string): Promise<EnglishSource | null> {
  try {
    const res = await fetch(`https://dev.to/api/articles/${encodeURIComponent(devtoUsername())}/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { title: string; body_markdown?: string; url?: string; path?: string; description?: string };
    const md = j.body_markdown?.trim();
    if (!md) return null;
    const brief = j.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || null;
    return { title: j.title, brief, markdown: md, url: j.url || `https://dev.to${j.path || ""}`, source: "devto" };
  } catch {
    return null;
  }
}

/** dev.to cross-post slugs carry a short random suffix with a digit (initial-failure-51hn).
 *  Strip it to recover OUR clean slug — only when the tail contains a digit, so real
 *  words ("...-space") are never mangled. */
function cleanSlugFromDevto(slug: string): string | null {
  const m = slug.match(/^(.*)-(?=[a-z0-9]{3,6}$)(?:[a-z]*\d[a-z0-9]*)$/i);
  return m && m[1] ? m[1] : null;
}

async function fetchEnglishPost(slug: string): Promise<EnglishSource | null> {
  // 1. Our own publish cache — exact slug, then the de-suffixed clean slug.
  const local = readLocalBlogPost(slug);
  if (local) return local;
  const clean = cleanSlugFromDevto(slug);
  if (clean) {
    const localClean = readLocalBlogPost(clean);
    if (localClean) return localClean;
  }
  // 2. dev.to by direct path (fresh), then the listing matcher as last resort.
  return (await fetchDevtoByPath(slug)) ?? fetchEnglishFromDevto(slug);
}

/** Serialize translation jobs so we do not run many Claude calls at once. */
let translateGate = Promise.resolve();

function enqueueTranslate<T>(fn: () => Promise<T>): Promise<T> {
  const run = translateGate.then(fn, fn);
  translateGate = run.then(
    () => {},
    () => {}
  );
  return run;
}

function anthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY missing for Spanish translation");
  return new Anthropic({ apiKey: key });
}

/** Escape raw control chars inside JSON string literals only (Groq/Llama emits them). */
function escapeCtrlInStrings(json: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch.charCodeAt(0) < 0x20) { out += ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ""; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

async function translateToSpanish(src: EnglishSource): Promise<{ title: string; brief: string; markdown: string }> {
  /** Prefer HASHNODE_ARTICLE_MODEL then Sonnet — Haiku 3/3.5 IDs often return not_found on newer Anthropic keys. */
  const model =
    process.env.BLOG_ES_TRANSLATE_MODEL?.trim() ||
    process.env.HASHNODE_ARTICLE_MODEL?.trim() ||
    "claude-sonnet-4-6";
  const client = anthropicClient();
  const maxTokens = model.includes("haiku") ? 4096 : 8192;
  const payload = JSON.stringify(
    {
      title: src.title,
      brief: src.brief || "",
      markdown: src.markdown,
    },
    null,
    0
  );

  const userPrompt = `You translate AI/technical blog content from English into natural Spanish (neutral LATAM/Spain).

Input is JSON with keys title, brief, markdown (GitHub-Flavored Markdown).

Return ONLY valid JSON (no markdown fence) with exactly these keys:
- "title": string
- "brief": string (max ~350 characters — article subtitle/teaser)
- "markdown": full markdown in Spanish

Rules:
- Preserve ALL markdown structure: headings, lists, tables, links [text](url), images. Translate link text; keep URLs unchanged.
- Keep fenced code blocks (\`\`\`) — preserve code as-is where it is standard (identifiers, APIs). You may translate comments inside code blocks to Spanish.
- Keep inline \`code\` identifiers in English when conventional.
- Translate the prose for human readers; keep brand names (AIdeazz, Oracle, Groq, Claude, WhatsApp, etc.) as-is or readable Spanish mention when natural.

INPUT JSON:
${payload}`;

  // Anthropic-first with Groq fallback — Spanish translation must survive credit
  // exhaustion (June 11 2026: raw Anthropic 400 leaked into the published page).
  const raw = (await claudeWithGroqFallback(client, model, maxTokens, null, userPrompt, "blog-es/translate")).trim();
  if (!raw) throw new Error("Empty translation response");
  let parsed: { title?: string; brief?: string; markdown?: string };
  try {
    parsed = JSON.parse(raw) as { title?: string; brief?: string; markdown?: string };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Translation JSON parse failed");
    try {
      parsed = JSON.parse(m[0]) as { title?: string; brief?: string; markdown?: string };
    } catch {
      // Groq/Llama emits literal newlines inside JSON strings (markdown field!) —
      // escape control chars inside string literals only, then retry.
      parsed = JSON.parse(escapeCtrlInStrings(m[0])) as { title?: string; brief?: string; markdown?: string };
    }
  }
  if (!parsed.markdown?.trim()) throw new Error("Translation missing markdown");
  return {
    title: (parsed.title || src.title).trim(),
    brief: (parsed.brief || src.brief || "").trim().slice(0, 480),
    markdown: parsed.markdown.trim(),
  };
}

const inflight = new Map<string, Promise<BlogEsBundle>>();

export async function getOrCreateSpanishBundle(slug: string): Promise<BlogEsBundle> {
  const s = safeSlug(slug);
  if (!s) throw new Error("Invalid slug");

  const existing = inflight.get(s);
  if (existing) return existing;

  const promise = (async (): Promise<BlogEsBundle> => {
    const bp = bundlePath(s);
    if (fs.existsSync(bp)) {
      try {
        const cached = JSON.parse(fs.readFileSync(bp, "utf8")) as BlogEsBundle;
        if (cached.v === CACHE_VERSION && cached.markdown?.trim()) return cached;
      } catch {
        /* regenerate */
      }
    }

    const english = await fetchEnglishPost(s);
    if (!english) throw new Error("Post not found on Hashnode or dev.to");

    const es = await enqueueTranslate(() => translateToSpanish(english));

    const bundle: BlogEsBundle = {
      v: CACHE_VERSION,
      slug: s,
      title: es.title,
      brief: es.brief,
      markdown: es.markdown,
      source: english.source,
      cachedAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(bp), { recursive: true });
    fs.writeFileSync(bp, JSON.stringify(bundle, null, 2), "utf8");
    return bundle;
  })();

  inflight.set(s, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(s);
  }
}

export function readCachedSpanishMeta(slug: string): { title: string; brief: string } | null {
  const s = safeSlug(slug);
  if (!s || !fs.existsSync(bundlePath(s))) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(bundlePath(s), "utf8")) as BlogEsBundle;
    if (cached.v !== CACHE_VERSION || !cached.markdown?.trim()) return null;
    return { title: cached.title, brief: cached.brief };
  } catch {
    return null;
  }
}
