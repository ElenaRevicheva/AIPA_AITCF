/**
 * Daily Hashnode publisher: Claude long-form → GraphQL publishPost.
 * Opt-in via HASHNODE_DAILY_ENABLED=true. Token + publication from env (same as scripts/hashnode-publish.mjs).
 *
 * Listed vs delisted: aideazz.xyz/blog loads posts via Hashnode *public* GraphQL (`publication.posts`).
 * Delisted posts are hidden from that feed and often 404 for logged-out visitors — so daily posts default
 * to **listed** (public). Opt into stealth with HASHNODE_DAILY_DELISTED=true or HASHNODE_DAILY_PUBLIC=false.
 *
 * **Pipeline (listed):** After publishPost, we poll the *same* unauthenticated GQL the portfolio uses
 * (`HASHNODE_HOST`, default aideazz.hashnode.dev) until `publication.post(slug)` returns — then we Dev.to
 * cross-post. If the post never appears in public GQ, we throw (Telegram failure, no Dev.to), so you do not
 * get a “success” when aideazz /blog would stay empty.
 * Set HASHNODE_HOST on the server to the same host as the site’s VITE_HASHNODE_HOST.
 */
import * as cron from "node-cron";
import * as fs from "fs";
import * as path from "path";
import type { Anthropic } from "@anthropic-ai/sdk";
import { saveContentLog } from "./database";
import { claudeWithGroqFallback } from "./llm-resilience";

/**
 * 2026-05-27 — Anthropic-credit-exhaustion resilience.
 *
 * Daily blog generation was a single point of failure: a 400 credit-balance
 * error from Anthropic took the whole publish cycle down. With Elena's tight
 * Anthropic budget, this would happen multiple days per month and the engine
 * would silently miss its daily blog post.
 *
 * Pattern matches src/lead-triage.ts (the canonical Groq-fallback pattern in
 * this repo): try Anthropic first → on credit-exhaustion 400, fall through to
 * Groq `llama-3.3-70b-versatile` (free tier) using the official groq-sdk
 * (which sets a Cloudflare-compatible UA — bypasses the urllib 1010 bug
 * documented in EspaLuzWhatsApp/espaluz_bridge.py:2887).
 *
 * Non-credit errors re-throw normally so retry logic upstream still works.
 */
async function generateTextWithGroqFallback(
  anthropic: Anthropic,
  model: string,
  maxTokens: number,
  system: string | null,
  userPrompt: string,
): Promise<string> {
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    return block && block.type === "text" ? block.text : "";
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    const status = e?.status ?? e?.statusCode ?? null;
    const isCreditExhaustion =
      (status === 400 || msg.includes("400")) &&
      (msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("balance"));
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!isCreditExhaustion || !groqKey) throw e;

    console.warn("📰 Anthropic credit exhausted on blog generation — falling back to Groq llama-3.3-70b-versatile");
    const { default: Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey: groqKey });
    const messages: Array<{ role: "system" | "user"; content: string }> = system
      ? [{ role: "system", content: system }, { role: "user", content: userPrompt }]
      : [{ role: "user", content: userPrompt }];

    // Groq free tier = 12,000 tokens-per-minute. When Anthropic is fully exhausted,
    // EVERY agent's fallback competes for that budget in the same minute, so the big
    // blog-generation call can hit a 413/429 "tokens per minute" error. Retry with a
    // wait that lets the per-minute window reset — a transient congestion spike must
    // not kill the daily blog (the exact gap that made the fallback look "broken").
    const GROQ_MAX_RETRIES = 4;
    for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
      try {
        const groqResp = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages,
          max_tokens: Math.min(maxTokens, 8000), // Groq max for this model
          temperature: 0.7,
        });
        const reply = groqResp.choices[0]?.message?.content?.trim() || "";
        if (reply) console.warn(`📰 Groq fallback returned ${reply.length} chars — blog cycle continues`);
        return reply;
      } catch (ge: any) {
        const gmsg = String(ge?.message || ge || "");
        const gstatus = ge?.status ?? ge?.statusCode ?? null;
        // Daily token cap (TPD) — waiting seconds is pointless; jump straight to Grok.
        const isDailyCap = /tokens per day|\bTPD\b/i.test(gmsg);
        const isRateLimit =
          gstatus === 429 || gstatus === 413 ||
          /rate.?limit|tokens per minute|\bTPM\b|too large|\b429\b|\b413\b/i.test(gmsg);
        if (isDailyCap || !isRateLimit || attempt === GROQ_MAX_RETRIES) {
          console.error(`📰 Groq fallback failed (attempt ${attempt}/${GROQ_MAX_RETRIES}${isDailyCap ? ', daily cap' : ''}): ${gmsg.slice(0, 160)}`);
          // Tier 3: Grok (xAI team credits) — keeps the daily blog alive when both
          // Anthropic (credits) and Groq (daily cap) are down.
          if (process.env.XAI_API_KEY?.trim()) {
            const { grokComplete } = await import("./llm-resilience");
            console.warn("📰 Falling back to Grok (xAI) for blog generation");
            return grokComplete(system, userPrompt, maxTokens, "daily-blog/grok");
          }
          throw ge;
        }
        const waitMs = 30_000 + attempt * 5_000; // per-minute TPM window — wait it out
        console.warn(`📰 Groq ${gstatus ?? ""} TPM/rate limit — retry ${attempt + 1}/${GROQ_MAX_RETRIES} in ${Math.round(waitMs / 1000)}s`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    return "";
  }
}

const GQL = "https://gql.hashnode.com/";

/** Base site where /blog mirrors Hashnode via public GraphQL (see aideazz repo `src/lib/hashnode-public.ts`). */
const AIDEAZZ_SITE = (process.env.AIDEAZZ_SITE_URL || "https://aideazz.xyz").replace(/\/$/, "");

/**
 * Host for public, unauthenticated GraphQL — same as aideazz VITE_HASHNODE_HOST / `hashnode-public.ts`.
 * Portfolio lists posts only if this API returns the post.
 */
const HASHNODE_PUBLIC_HOST = (process.env.HASHNODE_HOST || "aideazz.hashnode.dev")
  .replace(/^https?:\/\//, "")
  .split("/")
  .at(0)
  ?.trim() || "aideazz.hashnode.dev";

/** True if posts are delisted (hidden from public feed + aideazz blog sync). Default: false = listed. */
export function dailyBlogIsDelisted(): boolean {
  if ((process.env.DAILY_BLOG_DELISTED ?? process.env.HASHNODE_DAILY_DELISTED) === "true") return true;
  if ((process.env.DAILY_BLOG_PUBLIC ?? process.env.HASHNODE_DAILY_PUBLIC) === "false") return true;
  return false;
}

/**
 * True when Dev.to is the only publish target (HASHNODE_ACCESS_TOKEN absent or DAILY_BLOG_DEVTO_ONLY=true). HASHNODE_ACCESS_TOKEN is the legacy Spanish-bundle GraphQL source token, unrelated to publishing.
 * In this mode runDailyBlogPost routes to runDailyDevToPost — no Hashnode API call is made.
 */
export function dailyBlogDevToOnly(): boolean {
  if ((process.env.DAILY_BLOG_DEVTO_ONLY ?? process.env.HASHNODE_DAILY_DEVTO_ONLY) === "true") return true;
  if (!process.env.HASHNODE_ACCESS_TOKEN?.trim()) return true;
  return false;
}

/** Convert article title to URL-safe slug for aideazz.xyz/blog/{slug} canonical. */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .slice(0, 100);
}

/** Best-effort: confirm the Hashnode URL responds (may 403 from datacenter IPs — ignore then). */
async function verifyHashnodeUrlReachable(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; CTO-AIPA/1.0; +https://aideazz.xyz)",
      },
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Public GraphQL (no token) — same query aideazz blog uses. If this fails, the portfolio will not list the post. */
async function publicGql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Public Hashnode GQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Empty public Hashnode GQL data");
  return json.data;
}

/** True if the post is visible in the public publication (required for aideazz /blog + sitemap). */
export async function verifyPostInPublicHashnodeFeed(host: string, slug: string): Promise<boolean> {
  if (!slug) return false;
  const query = `
    query($host: String!, $slug: String!) {
      publication(host: $host) {
        post(slug: $slug) { id }
      }
    }
  `;
  try {
    const data = await publicGql<{
      publication: { post: { id: string } | null } | null;
    }>(query, { host, slug });
    return !!data?.publication?.post?.id;
  } catch {
    return false;
  }
}

/**
 * After publishPost, the public API can lag. Poll until the post is listable the same way aideazz fetches
 * the blog, or time out. Dev.to is only cross-posted after this passes (for listed posts).
 */
async function waitForPostInPublicHashnodeFeed(
  slug: string,
  maxAttempts: number,
  delayMs: number
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const ok = await verifyPostInPublicHashnodeFeed(HASHNODE_PUBLIC_HOST, slug);
    if (ok) {
      console.log(`📰 Public feed: post available for aideazz (attempt ${i + 1}/${maxAttempts})`);
      return true;
    }
  }
  return false;
}

async function verifyUrlReachableWithRetries(
  url: string,
  opts: { maxAttempts: number; delayMs: number }
): Promise<{ ok: boolean; status: number }> {
  for (let i = 0; i < opts.maxAttempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, opts.delayMs));
    const r = await verifyHashnodeUrlReachable(url);
    if (r.ok || r.status === 403) return r;
    if (r.status !== 404) return r;
  }
  return verifyHashnodeUrlReachable(url);
}

/** Same bot as CTO AIPA; prefers HASHNODE-specific chat, else digest chat (so one ID works). */
function resolveTelegramNotifyChatId(): string | undefined {
  return (
    (process.env.TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID ?? process.env.TELEGRAM_HASHNODE_NOTIFY_CHAT_ID)?.trim() ||
    process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID?.trim()
  );
}

async function notifyTelegramBlogPublished(title: string, urlOrMessage: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = resolveTelegramNotifyChatId();
  if (!token || !chatId) return;
  // If urlOrMessage already contains newlines it's a pre-built message, else build one
  const text = urlOrMessage.includes("\n") ? urlOrMessage : `📰 Daily blog published\n\n${title}\n${urlOrMessage}`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("📰 Telegram blog-published notify failed:", r.status, t);
    }
  } catch (e) {
    console.error("📰 Telegram blog-published notify error:", e);
  }
}

async function notifyTelegramBlogFailure(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = resolveTelegramNotifyChatId();
  if (!token || !chatId) return;
  const text = `🚨 Daily blog FAILED (no Dev.to cross-post until fixed)\n\n${message}`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("📰 Telegram blog-failure notify failed:", r.status, t);
    }
  } catch (e) {
    console.error("📰 Telegram blog-failure notify error:", e);
  }
}

/** Rotating briefs — 20 topics. Each has a long-tail keyword and an opinionated, story-driven brief. */
export const DAILY_BLOG_TOPIC_BRIEFS: Array<{ keyword: string; brief: string }> = [
  {
    keyword: "Oracle Always Free production AI agents",
    brief:
      "Running 10 AI agents on Oracle Always Free: exact VM shape, PM2 supervision, RAM ceiling, and what crashes first when you hit the limit. Written from 18 months of operating — not a setup tutorial.",
  },
  {
    keyword: "AI-assisted development non-technical founder",
    brief:
      "How I build production TypeScript as an executive with no CS degree: Claude Code as a permanent pair programmer, not a shortcut. Concrete workflow — what I can fully explain, what I trust blindly, and why that's the honest answer.",
  },
  {
    keyword: "LLM routing cost Groq vs Claude",
    brief:
      "Why 76% of my inference hits Groq/Llama instead of Claude: a real cost and latency matrix after 18 months. When frontier models are the wrong economics — and the one step where they're non-negotiable.",
  },
  {
    keyword: "HubSpot CRM automation AI agents dedup",
    brief:
      "My 10 AI agents fill HubSpot automatically — no SDR, no manual entry. The dedup failure that created 300 duplicate deals, the pipeline routing fix, and what breaks when one agent skips the schema.",
  },
  {
    keyword: "WhatsApp AI bot production webhook failures",
    brief:
      "Three things that killed my first WhatsApp bot in production: webhook delivery gaps, in-memory state resets on PM2 restart, and Twilio rate limits at 2 AM. What tutorials never say about running messaging bots continuously.",
  },
  {
    keyword: "AI job application automation ATS limitations",
    brief:
      "VibeJobHunter fires applications every hour. Here's what it misses, the ATS rejection patterns I discovered, and the ethics boundary I drew around auto-apply. ATS isn't the enemy — blind automation is.",
  },
  {
    keyword: "pgvector Oracle Autonomous DB RAG production",
    brief:
      "Six months of pgvector on Oracle Autonomous DB: embedding model trade-offs, IVFFlat vs HNSW for my data size, and why retrieval quality dropped at 10k vectors. Real numbers, not benchmark charts.",
  },
  {
    keyword: "LangGraph stateful agents production checkpointing",
    brief:
      "Three LangGraph rewrites before it clicked: a state schema mismatch that silently discarded every job for weeks, checkpoint corruption, and the one pattern that finally made multi-step pipelines stable.",
  },
  {
    keyword: "generative engine optimization structured data citations",
    brief:
      "GEO isn't SEO with AI buzzwords — it's a different game: structured facts, authorship signals, citation-ready format, and durable pages on domains you control. What I changed to appear in Perplexity answers.",
  },
  {
    keyword: "fractional CTO AI vendor lock-in audit",
    brief:
      "The vendor lock-in decisions I made at AIdeazz that I'd unmake: one API contract I can't escape, one database choice that costs more than expected, one infra bet that aged badly. What a fractional CTO should audit before you're locked in.",
  },
  {
    keyword: "AI language learning WhatsApp conversation memory",
    brief:
      "Why WhatsApp beat a web app for Spanish learning: EspaLuz architecture — two-layer memory without a paid vector store, conversation continuity across sessions, and what 3 paying users taught me that 100 free signups couldn't.",
  },
  {
    keyword: "BrightData web unlocker B2B lead enrichment",
    brief:
      "When BrightData Web Unlocker is worth $1.50/CPM and when it's wasted money: what I learned enriching B2B leads before HubSpot push. Real false-positive rate, extraction failure modes, and which signals are actually worth scraping.",
  },
  {
    keyword: "AI agent evaluation harness 131 tests production",
    brief:
      "131 tests, 4 layers, $0.03/run: why I built an eval harness before writing new features. The silent failure I would have shipped without it — and what AI agent tests catch that unit tests fundamentally cannot.",
  },
  {
    keyword: "small business AI automation client pipeline results",
    brief:
      "What actually happened when I wired a construction-adjacent business to AI automation: real lead conversion numbers, the manual step that couldn't be removed no matter what, and why clients don't care about the tech stack.",
  },
  {
    keyword: "B2B lead generation AI agent X Twitter signals",
    brief:
      "How Algom Alpha finds B2B leads on X using hiring-adjacent keyword signals: the scoring logic, the false-positive rate I'm not proud of, and what 'qualified lead' actually means when a bot is deciding.",
  },
  {
    keyword: "executive career pivot AI developer non-traditional",
    brief:
      "From Deputy CEO at a Russian digital infrastructure program to solo AI builder in Panama: what executive experience transferred to running a tech startup, what was completely useless, and why I stopped hiding the gap.",
  },
  {
    keyword: "AI startup infrastructure cost breakdown real numbers",
    brief:
      "Real monthly line items for an AI startup running 10 agents: Oracle $0, Groq $12, BrightData $40/run, Claude API $8, Resend $4. Where the hidden costs accumulate — and what 'free tier' actually means at operating scale.",
  },
  {
    keyword: "Telegram bot ops dashboard AI agents production",
    brief:
      "Why Telegram replaced my web dashboard for running AI agents: broadcast to subscribers, inline keyboards for approval flows, and why a chat interface beats a web UI for a solo operator managing 10 live systems.",
  },
  {
    keyword: "AI content pipeline GSC gap analysis automated publishing",
    brief:
      "The blog pipeline that writes and publishes itself: GSC gap analysis picks the topic, Claude drafts the article, Dev.to gets the post, aideazz.xyz caches it. What 'content gap' actually means when you have 15 GSC queries.",
  },
  {
    keyword: "AI hiring automation ethics auto-apply boundary",
    brief:
      "The ethics line I drew inside VibeJobHunter: what I automated without hesitation, what I kept manual on purpose, and why auto-apply is a bad product decision even when it works technically. Where AI should stop in a job search.",
  },
];

const BANNED_PHRASES = [
  /game[- ]changer/i,
  /revolutionary/i,
  /unlock the power/i,
  /in today's fast[- ]paced/i,
  /in this comprehensive guide/i,
  /leverage synergies/i,
  /cutting[- ]edge solution/i,
  /dive deep into/i,
];

const ME_QUERY = `
  query MePub {
    me {
      username
      publications(first: 10) {
        edges {
          node {
            id
            title
            domainInfo { hashnodeSubdomain }
          }
        }
      }
    }
  }
`;

const PUBLISH_MUTATION = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post { id title url slug }
    }
  }
`;

function authHeader(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, "");
}

async function gql<T>(query: string, variables: Record<string, unknown> | undefined, token: string): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(token),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL data");
  return json.data;
}

function statePath(): string {
  const base = (process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR) || path.join(process.cwd(), "data");
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, "hashnode-last-topic.json");
}

function readTopicIndex(): number {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const j = JSON.parse(raw) as { lastIndex?: number };
    return typeof j.lastIndex === "number" && j.lastIndex >= 0 ? j.lastIndex : -1;
  } catch {
    return -1;
  }
}

function writeTopicIndex(i: number): void {
  fs.writeFileSync(statePath(), JSON.stringify({ lastIndex: i, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

/** Write published post to data/blog-posts-cache.json so blog-es-bundle can serve it without hitting dev.to's paginated API. */
export function saveBlogPostCache(entry: { slug: string; title: string; markdown: string; devtoUrl: string; aideazzBlogUrl: string }): void {
  const cacheFile = path.join((process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR) || path.join(process.cwd(), "data"), "blog-posts-cache.json");
  let cache: Record<string, typeof entry & { publishedAt: string }> = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { /* first run */ }
  cache[entry.slug] = { ...entry, publishedAt: new Date().toISOString() };
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf8");
}


/** Regenerate sitemap.xml from cache + static pages, commit to ElenaRevicheva/aideazz via GitHub API. */
export async function pushSitemapToGithub(): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) { console.warn("📍 Sitemap: GITHUB_TOKEN not set — skipping"); return; }

  const REPO = "ElenaRevicheva/aideazz";
  const FILE = "public/sitemap.xml";
  const SITE = "https://aideazz.xyz";
  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    ["/"                  , "1.0", "weekly" , today],
    ["/about"             , "0.8", "monthly", today],
    ["/portfolio"         , "0.9", "weekly" , today],
    ["/blog"              , "0.85","weekly" , today],
    ["/pitch.html"        , "0.7", "monthly", today],
    ["/pitch-es.html"     , "0.6", "monthly", today],
    ["/sop-ai-ops.html"   , "0.72","weekly" , today],
    ["/sop-ai-ops-es.html", "0.72","weekly" , today],
    ["/llms.txt"          , "0.55","monthly", today],
    ["/.well-known/llms.txt","0.55","monthly",today],
    ["/geo-manifest.json" , "0.55","monthly", today],
    ["/humans.txt"        , "0.35","yearly" , today],
    ["/CITATION.cff"      , "0.35","yearly" , today],
    ["/robots.txt"        , "0.3" ,"yearly" , today],
  ] as const;

  const makeUrl = (loc: string, date: string, freq: string, priority: string): string =>
    ["  <url>",
     "    <loc>" + loc + "</loc>",
     "    <lastmod>" + date + "</lastmod>",
     "    <changefreq>" + freq + "</changefreq>",
     "    <priority>" + priority + "</priority>",
     "  </url>"].join("\n");

  const rows: string[] = staticUrls.map(([p, pri, freq, d]) =>
    makeUrl(SITE + p, d, freq, pri));

  type CacheEntry = { slug: string; publishedAt?: string };
  try {
    const cacheFile = getBlogPostCachePath();
    const obj = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, CacheEntry>;
    const posts = Object.values(obj)
      .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    for (const e of posts) {
      rows.push(makeUrl(SITE + "/blog/" + e.slug,
        (e.publishedAt || today).slice(0, 10), "monthly", "0.75"));
    }
    console.log("📍 Sitemap: " + posts.length + " blog posts + " + staticUrls.length + " static pages");
  } catch { console.warn("📍 Sitemap: cache read failed"); }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + rows.join("\n") + "\n"
    + "</urlset>\n";

  const encoded = Buffer.from(xml).toString("base64");
  const headers: Record<string,string> = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "cto-aipa-sitemap/1.0",
  };
  const apiUrl = "https://api.github.com/repos/" + REPO + "/contents/" + FILE;

  let sha: string | undefined;
  try {
    const r = await fetch(apiUrl, { headers });
    if (r.ok) { const j = await r.json() as { sha?: string }; sha = j.sha; }
  } catch { /* new file */ }

  const body: Record<string,string> = {
    message: "chore(sitemap): auto-update [skip ci]",
    content: encoded,
  };
  if (sha) body.sha = sha;

  const put = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify(body) });
  if (put.ok) {
    console.log("📍 Sitemap committed to GitHub ✅");
  } else {
    const err = await put.text();
    console.warn("📍 Sitemap commit failed (" + put.status + "): " + err.slice(0, 200));
  }
}
export function getBlogPostCachePath(): string {
  return path.join((process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR) || path.join(process.cwd(), "data"), "blog-posts-cache.json");
}

/** Returns true if this slug already exists in the local cache (= canonical URL collision risk). */
function slugAlreadyPublished(slug: string): boolean {
  try {
    const cacheFile = getBlogPostCachePath();
    if (!fs.existsSync(cacheFile)) return false;
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(cache, slug);
  } catch {
    return false;
  }
}

/** Returns set of topic indices already present in the cache (by keyword match on slug). */
function getPublishedTopicIndices(): Set<number> {
  const excluded = new Set<number>();
  try {
    const cacheFile = getBlogPostCachePath();
    if (!fs.existsSync(cacheFile)) return excluded;
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, unknown>;
    const publishedSlugs = Object.keys(cache);
    DAILY_BLOG_TOPIC_BRIEFS.forEach((t, i) => {
      const kSlug = t.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (publishedSlugs.some(s => s.includes(kSlug) || kSlug.includes(s.slice(0, 20)))) {
        excluded.add(i);
      }
    });
  } catch { /* ignore */ }
  return excluded;
}

function pickNextTopic(): { index: number; keyword: string; brief: string } {
  const n = DAILY_BLOG_TOPIC_BRIEFS.length;
  const prev = readTopicIndex();
  const index = (prev + 1) % n;
  const t = DAILY_BLOG_TOPIC_BRIEFS[index]!;
  return { index, keyword: t.keyword, brief: t.brief };
}

function extractTag(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = text.match(re);
  return m ? m[1]!.trim() : null;
}

function cleanTitle(t: string): string {
  return (t || "")
    .replace(/<\/?TITLE>/gi, "")
    .replace(/\*\*/g, "")
    .replace(/^[#*\s"'`]+/, "")
    .replace(/["'`#*\s]+$/, "")
    .trim()
    .slice(0, 120)
    .trim();
}

/**
 * Tolerant article parser. The canonical contract is the XML envelope
 * <TITLE>..</TITLE><MARKDOWN>..</MARKDOWN> (Claude obeys it). But the Groq
 * fallback (and any future model) frequently drops the envelope — and because
 * ARTICLE_SYSTEM says "no H1", Groq returns a valid body with NO title line at
 * all. This parser recovers a usable {title, markdown} from any of those shapes
 * so a credit-exhaustion fallback never silently kills the daily blog.
 */
function parseArticle(raw: string): { title: string; markdown: string } | null {
  if (!raw || !raw.trim()) return null;

  // Strip a leading/trailing ```markdown code-fence wrapper some models add.
  let text = raw.trim()
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // 1. Canonical envelope.
  let title = extractTag(text, "TITLE");
  let markdown = extractTag(text, "MARKDOWN");
  if (title && markdown) return { title: cleanTitle(title), markdown: markdown.trim() };

  // 2. Tolerant TITLE detection (envelope missing or malformed).
  if (!title) {
    const titlePatterns = [
      /<TITLE>\s*([^\n<]+?)\s*(?:<\/TITLE>|\n|$)/i,                 // unclosed <TITLE>
      /^\s*(?:\*\*)?\s*TITLE\s*[:\-]\s*(?:\*\*)?\s*([^\n]+?)\s*$/im, // TITLE: / **TITLE:**
      /^\s*(?:\*\*)?\s*Title\s*[:\-]\s*(?:\*\*)?\s*([^\n]+?)\s*$/im, // Title:
      /^\s*#\s+(.+?)\s*$/m,                                          // first '# ' heading anywhere
    ];
    for (const re of titlePatterns) {
      const m = text.match(re);
      if (m && m[1] && m[1].trim().length >= 8) { title = m[1].trim(); break; }
    }
  }

  // 3. Body: use <MARKDOWN> if present, else strip envelope/title scaffolding.
  if (!markdown) {
    markdown = text
      .replace(/<\/?MARKDOWN>/gi, "")
      .replace(/<TITLE>[\s\S]*?<\/TITLE>/gi, "")
      .replace(/<\/?TITLE>/gi, "")
      .replace(/^\s*(?:\*\*)?\s*TITLE\s*[:\-].*$/im, "")
      .replace(/^\s*(?:\*\*)?\s*Title\s*[:\-].*$/im, "")
      .trim();
    if (title) {
      // Drop a leading '# {title}' heading from the body if it duplicates the title.
      const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      markdown = markdown.replace(new RegExp(`^\\s*#\\s+${esc}\\s*$`, "m"), "").trim();
    }
  }

  // 4. Last-resort title — derive from the first '## ' section or first real line so a
  //    quality body is NEVER discarded just because the model omitted the title.
  if (!title && markdown) {
    const h2 = markdown.match(/^##\s+(.+?)\s*$/m);
    if (h2 && h2[1]) {
      title = h2[1].trim();
    } else {
      const firstLine = markdown.split(/\r?\n/).find((l) => l.trim().replace(/^[#*>\s]+/, "").length > 12);
      if (firstLine) title = firstLine.replace(/^[#*>\s]+/, "").trim().slice(0, 90);
    }
  }

  if (title && markdown && markdown.length > 200) {
    return { title: cleanTitle(title), markdown };
  }
  return null;
}

function validateArticle(markdown: string): { ok: true } | { ok: false; reason: string } {
  if (markdown.length < 1400) {
    return { ok: false, reason: `Body too short (${markdown.length} chars); need ≥1400 for substance.` };
  }
  const h2 = (markdown.match(/^## /gm) || []).length;
  if (h2 < 3) {
    return { ok: false, reason: `Need at least 3 ## sections; found ${h2}.` };
  }
  if (!/^## Frequently Asked Questions/m.test(markdown)) {
    return { ok: false, reason: 'Missing ## Frequently Asked Questions section (required for GEO).' };
  }
  const faqQs = (markdown.match(/^\*\*Q:/gm) || []).length;
  if (faqQs < 3) {
    return { ok: false, reason: `FAQ section needs ≥3 Q&A pairs; found ${faqQs}.` };
  }
  for (const re of BANNED_PHRASES) {
    if (re.test(markdown)) {
      return { ok: false, reason: `Banned generic phrase matched: ${re}` };
    }
  }
  return { ok: true };
}

async function resolvePublicationId(token: string): Promise<string> {
  const forced = process.env.HASHNODE_PUBLICATION_ID?.trim();
  if (forced) return forced;
  const data = await gql<{
    me: {
      publications: {
        edges: { node: { id: string; domainInfo?: { hashnodeSubdomain?: string } } }[];
      };
    };
  }>(ME_QUERY, undefined, token);
  const edges = data.me?.publications?.edges ?? [];
  const nodes = edges.map((e) => e.node).filter(Boolean);
  const sub = (process.env.HASHNODE_SUBDOMAIN || "aideazz").toLowerCase();
  const hit = nodes.find((n) => (n.domainInfo?.hashnodeSubdomain || "").toLowerCase() === sub);
  const pub = hit || nodes[0];
  if (!pub?.id) throw new Error("No Hashnode publication — create blog and set HASHNODE_PUBLICATION_ID");
  return pub.id;
}

const ARTICLE_SYSTEM = `You are the writing voice of Elena Revicheva / AIdeazz: executive-turned-AI-builder, single mother who relocated from Russia to Panama, shipping production AI agents on Oracle Cloud with zero VC funding.

Hard rules:
- Lead with the failure, the constraint, the hard number, or the decision — never with background or context-setting. The reader decides in the first three sentences whether to continue.
- Take a clear position. If you write "it depends", follow it immediately with your own specific answer. Hedging without a conclusion is not depth — it's padding.
- A specific number, a real error message, or an actual cost figure is worth more than three adjectives. Use them.
- Write for the practitioner who is already skeptical of AI hype. They stop reading the moment you state the obvious. Assume they have shipped something before.
- First person or neutral technical — never fake case studies or invented client names.
- No startup clichés: no "game-changer", "revolutionary", "in today's fast-paced world", "comprehensive guide", "unlock", "synergies", "seamlessly".
- Use Markdown: ## sections only (no H1, no "Introduction" or "Conclusion" as headings). At least four ## headings after the opening paragraph.
- Target length: 1,400–2,400 words of body (excluding title).
- Before the byline, add exactly this section (3–5 pairs, questions a skeptical practitioner would actually ask — not beginner FAQ):

## Frequently Asked Questions

**Q: [specific, non-obvious question about the topic]**
A: [direct, factual answer — 2-4 sentences, with a concrete number or tradeoff]

**Q: [another practitioner-level question]**
A: [answer]

(continue for 3–5 total Q&A pairs)

- End with: "— Elena Revicheva · [AIdeazz](https://aideazz.xyz) · [Portfolio](https://aideazz.xyz/portfolio)"
- Output EXACTLY in this envelope (XML tags, no text outside):

<TITLE>Your compelling title here (under 100 chars)</TITLE>
<MARKDOWN>
... full markdown ...
</MARKDOWN>`;

// ─────────────────────────────────────────────
// GSC: pull top queries so Claude can find gaps
// ─────────────────────────────────────────────

/** Minimal JWT builder for Google service account — no external lib needed */
async function buildGoogleJwt(sa: { client_email: string; private_key: string }, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  // Use Node crypto to sign — no external dep
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, "base64url");
  return `${unsigned}.${sig}`;
}

async function getGoogleAccessToken(scope: string): Promise<string | null> {
  const raw = process.env.GOOGLE_ANALYTICS_CREDENTIALS?.trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as { client_email: string; private_key: string };
    const jwt = await buildGoogleJwt(sa, scope);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchGscTopQueries(): Promise<string[]> {
  const siteUrl = process.env.GSC_SITE_URL?.trim() || "sc-domain:aideazz.xyz";
  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/webmasters.readonly");
    if (!token) return [];
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 25 }),
      }
    );
    if (!res.ok) { console.warn(`📰 GSC fetch failed: ${res.status}`); return []; }
    const data = (await res.json()) as { rows?: { keys: string[]; clicks: number }[] };
    const queries = (data.rows || []).map((r) => r.keys[0] ?? "").filter(Boolean);
    console.log(`📰 GSC: ${queries.length} queries fetched for gap analysis`);
    return queries;
  } catch (e) {
    console.warn("📰 GSC fetch error:", e);
    return [];
  }
}

/** Ask Claude which topic from the rotation is least covered by current GSC queries. */
async function pickTopicWithGscGap(
  anthropic: Anthropic,
  gscQueries: string[],
  excludedIndices: Set<number> = new Set()
): Promise<{ index: number; keyword: string; brief: string }> {
  // Find fallback = next rotation topic that isn't already published
  const baseFallback = pickNextTopic();
  const fallback = excludedIndices.has(baseFallback.index)
    ? (() => {
        const n = DAILY_BLOG_TOPIC_BRIEFS.length;
        for (let d = 1; d < n; d++) {
          const idx = (baseFallback.index + d) % n;
          if (!excludedIndices.has(idx)) {
            const t = DAILY_BLOG_TOPIC_BRIEFS[idx]!;
            return { index: idx, keyword: t.keyword, brief: t.brief };
          }
        }
        return baseFallback; // all published, just use rotation
      })()
    : baseFallback;
  if (!gscQueries.length) return fallback;
  try {
    // Only offer topics not already in the cache
    const available = DAILY_BLOG_TOPIC_BRIEFS
      .map((t, i) => ({ i, t }))
      .filter(({ i }) => !excludedIndices.has(i));
    const topics = available.map(({ i, t }) => `${i}: ${t.keyword}`).join("\n");
    if (!topics) return fallback;
    const raw = await claudeWithGroqFallback(
      anthropic, "claude-haiku-4-5-20251001", 64, null,
      `These are the search queries already bringing traffic to aideazz.xyz:\n${gscQueries.slice(0, 20).join(", ")}\n\nThese are available article topics (index: keyword):\n${topics}\n\nWhich single index number has the biggest gap — i.e. is least represented in the current traffic? Reply with only the integer index.`,
      "daily-blog/topic-picker",
    );
    const idx = parseInt(raw, 10);
    if (!isNaN(idx) && idx >= 0 && idx < DAILY_BLOG_TOPIC_BRIEFS.length) {
      const t = DAILY_BLOG_TOPIC_BRIEFS[idx]!;
      console.log(`📰 GSC gap analysis: picked topic #${idx} (${t.keyword})`);
      return { index: idx, keyword: t.keyword, brief: t.brief };
    }
  } catch (e) {
    console.warn("📰 GSC gap pick failed, using rotation:", e);
  }
  return fallback;
}

// ─────────────────────────────────────────────
// Dev.to cross-posting — DA 90+, canonical back
// ─────────────────────────────────────────────

async function crossPostToDevTo(
  title: string,
  markdown: string,
  canonicalUrl: string
): Promise<string | null> {
  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    // Prepend authorship line Dev.to readers see before hitting canonical
    const body = `*Originally published on [AIdeazz](${canonicalUrl}) — cross-posted here with canonical link.*\n\n${markdown}`;
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        article: {
          title,
          body_markdown: body,
          published: true,
          canonical_url: canonicalUrl,
          tags: ["ai", "programming", "machinelearning"],
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`📰 Dev.to cross-post failed (${res.status}): ${err.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { url?: string };
    console.log(`📰 Dev.to cross-posted: ${data.url}`);
    return data.url ?? null;
  } catch (e) {
    console.warn("📰 Dev.to cross-post error:", e);
    return null;
  }
}

/**
 * Dev.to-only publish path — used when Hashnode API is unavailable (paid wall) or
 * HASHNODE_DAILY_DEVTO_ONLY=true.  Dev.to article canonical_url points to
 * aideazz.xyz/blog/{slug} so aideazz gets the backlink credit and the blog page at
 * that slug can fetch content from Dev.to (fetchEnglishFromDevto in blog-es-bundle.ts
 * already matches dev.to slugs with numeric suffix against the clean title slug).
 */
export async function runDailyDevToPost(deps: { anthropic: Anthropic; model: string; maxTokens: number }): Promise<{
  title: string;
  url: string;
  slug: string;
  aideazzBlogUrl: string;
  topicIndex: number;
  devtoUrl: string;
  delisted: boolean;
}> {
  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "DEVTO_API_KEY missing — required for Dev.to-only mode (HASHNODE_ACCESS_TOKEN is not set)"
    );
  }

  const gscQueries = await fetchGscTopQueries();
  const publishedIndices = getPublishedTopicIndices();
  if (publishedIndices.size > 0) {
    console.log(`📰 Skipping ${publishedIndices.size} already-published topic(s): [${[...publishedIndices].join(', ')}]`);
  }
  const { index, keyword, brief } = await pickTopicWithGscGap(deps.anthropic, gscQueries, publishedIndices);

  const baseUserPrompt = `Target SEO keyword (natural use, not stuffing): "${keyword}"

Topic brief:
${brief}

Write the article for developers and technical founders. Ground in AIdeazz reality: multi-agent systems, Oracle infra, Groq/Claude routing, Telegram/WhatsApp agents, real constraints.`;

  console.log(`📰 Dev.to direct: generating topic #${index} (${keyword})…`);

  const MAX_GENERATION_ATTEMPTS = 3;
  let parsed: ReturnType<typeof parseArticle> | null = null;
  let lastValidationError = "";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const forbiddenNote = lastValidationError
      ? `\n\nCRITICAL: The previous attempt failed quality gate — ${lastValidationError}. Do NOT use that phrase anywhere in the article.`
      : "";
    const userPrompt = baseUserPrompt + forbiddenNote;

    if (attempt > 1) {
      console.log(`📰 Dev.to direct: retry ${attempt}/${MAX_GENERATION_ATTEMPTS} (quality gate: ${lastValidationError})`);
    }

    // Anthropic with Groq fallback on credit exhaustion (see generateTextWithGroqFallback above)
    const rawText = await generateTextWithGroqFallback(
      deps.anthropic,
      deps.model,
      deps.maxTokens,
      ARTICLE_SYSTEM,
      userPrompt,
    );
    if (!rawText) throw new Error("Empty model response (Anthropic + Groq both returned empty)");

    parsed = parseArticle(rawText);
    if (!parsed) throw new Error("Could not parse TITLE/MARKDOWN from model output");

    const v = validateArticle(parsed.markdown);
    if (v.ok) break;

    lastValidationError = v.reason;
    if (attempt === MAX_GENERATION_ATTEMPTS) {
      throw new Error(`Quality gate: ${v.reason} (failed after ${MAX_GENERATION_ATTEMPTS} attempts)`);
    }
  }

  if (!parsed) throw new Error("Article generation produced no output");

  // Slug collision guard — topic exclusion above should prevent this, but just in case.
  let finalTitle = parsed.title;
  let slug = titleToSlug(finalTitle);
  if (slugAlreadyPublished(slug)) {
    // This exact canonical was already published — Dev.to hard-fails a duplicate canonical with
    // 422 "Canonical url has already been taken". Uniquify with today's date so the (freshly
    // generated) post still ships instead of crashing the whole daily run.
    const suffix = new Date().toISOString().slice(0, 10);
    console.warn(`📰 Slug "${slug}" already published — uniquifying canonical with ${suffix} to avoid 422 collision.`);
    slug = `${slug}-${suffix}`;
  }
  const aideazzBlogUrl = `${AIDEAZZ_SITE}/blog/${slug}`;

  // Dev.to canonical points to aideazz.xyz/blog/{slug} — backlink credit to aideazz
  const devtoUrl = await crossPostToDevTo(finalTitle, parsed.markdown, aideazzBlogUrl);
  if (!devtoUrl) {
    throw new Error("Dev.to publishing failed — check DEVTO_API_KEY and rate limits");
  }

  writeTopicIndex(index);
  saveBlogPostCache({ slug, title: finalTitle, markdown: parsed.markdown, devtoUrl, aideazzBlogUrl });
  // Auto-push updated sitemap to aideazz repo → 4everland redeploys
  pushSitemapToGithub().catch(e => console.warn("📍 Sitemap:", e instanceof Error ? e.message : String(e)));

  // ADDITIVE (May 22 2026): also regenerate per-article static HTML pages for SEO/GEO discoverability.
  // Fire-and-forget so it never blocks the publish cycle. Surgical: only ADDS new files at
  // public/blog/{slug}/index.html in aideazz repo; no existing files touched.
  import('./blog-static-pages').then(m => m.pushAllBlogArticlesHtml())
    .catch(e => console.warn("[BlogStatic]", e instanceof Error ? e.message : String(e)));

  // ADDITIVE (May 28 2026): also distribute this article to Buffer (LinkedIn etc.) with a
  // UTM-tagged link so click-throughs flow into /marketing/inquiry → triage → HubSpot.
  // Gated behind BUFFER_SOCIAL_ENABLED (default off) and fire-and-forget in a try-catch so a
  // Buffer outage or bad key can NEVER break the blog publish cycle. Runs in parallel to the
  // existing VJH CMO → Make.com → Buffer milestone path, which is untouched.
  import('./buffer-publisher').then(m => {
    if (!m.isBufferSocialEnabled()) return;
    return m.distributeArticleToBuffer(deps.anthropic, { slug, title: finalTitle, markdown: parsed!.markdown, aideazzBlogUrl })
      .then(r => console.log(`📣 [Buffer] article=${r.article} posted=${r.posted.filter(p => p.ok).length}/${r.posted.length} skipped=${r.skipped.length}`));
  }).catch(e => console.warn("[Buffer]", e instanceof Error ? e.message : String(e)));
  await saveContentLog({
    channel: "devto_direct",
    keyword,
    title: parsed.title,
    url: aideazzBlogUrl,
    status: "published",
    topicIndex: index,
  });

  const lines = [
    "📰 Article published.",
    "",
    parsed.title,
    "",
    "1) aideazz /blog (canonical):",
    aideazzBlogUrl,
    "",
    "2) Dev.to (cross-post):",
    devtoUrl,
  ];
  await notifyTelegramBlogPublished(finalTitle, lines.join("\n"));

  return {
    title: finalTitle,
    url: aideazzBlogUrl,
    slug,
    aideazzBlogUrl,
    topicIndex: index,
    devtoUrl,
    delisted: false,
  };
}

// ============================================================================
// MAY 25 2026 FIX: sliding-window mutex + prefix dedup + always-notify
// ----------------------------------------------------------------------------
// Three problems caught on May 24 2026:
//   1. Two BrightData articles published within 20 minutes (00:30 + 00:50 UTC).
//      Cache shows both as fresh entries — dedup missed the second one because
//      it uses a topic-INDEX exclude that resets on restart, and the slugs were
//      only fuzzy-matched by keyword. Result: same content, two URLs, two
//      Dev.to + aideazz.xyz posts.
//   2. No Telegram notification fired for either publish. Existing notify path
//      only runs on the success branch and is silent on early exceptions / dedup
//      skips, so an operator has no way to know "what happened today" without
//      tailing logs.
//   3. The publisher has 3 trigger sources (cron, HTTP /hashnode/daily-run,
//      HASHNODE_DAILY_RUN_ON_START) — each can fire independently and previously
//      had no cross-trigger lockout.
//
// Fix shape (defensive, covers all trigger sources):
//   A. recentPublishCutoffOk: read the cache, find newest publishedAt, refuse
//      any publish within HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES (default 12h).
//   B. findPrefixConflict: before publishing, compute the new slug's 30-char
//      prefix and refuse if any cached slug shares it (catches BrightData-style
//      variants where the only difference is the suffix).
//   C. notifyTelegramSkipped: dedicated notify so operator always knows when
//      a daily run was suppressed and why.
//   D. runDailyBlogPost wrapped to: try mutex → run inner → always notify
//      Telegram with success / skip / failure outcome.
// ============================================================================

function recentPublishCutoffOk(): { ok: true } | { ok: false; reason: string; hoursAgo: number } {
  try {
    const cacheFile = getBlogPostCachePath();
    if (!fs.existsSync(cacheFile)) return { ok: true };
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, { publishedAt?: string }>;
    const minHours = Number((process.env.DAILY_BLOG_MIN_HOURS_BETWEEN_PUBLISHES ?? process.env.HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES) || "12");
    if (!Number.isFinite(minHours) || minHours <= 0) return { ok: true };
    const cutoffMs = Date.now() - minHours * 60 * 60 * 1000;
    let newest = 0;
    for (const v of Object.values(cache)) {
      const t = v?.publishedAt ? Date.parse(v.publishedAt) : NaN;
      if (Number.isFinite(t) && t > newest) newest = t;
    }
    if (newest === 0) return { ok: true };
    if (newest >= cutoffMs) {
      const hoursAgo = (Date.now() - newest) / 3600_000;
      return { ok: false, reason: `last publish was ${hoursAgo.toFixed(1)}h ago (< ${minHours}h cooldown)`, hoursAgo };
    }
    return { ok: true };
  } catch {
    // If the cache can't be read, fail OPEN (allow the publish) so we don't
    // silently break the daily cadence on a transient FS error.
    return { ok: true };
  }
}

function findPrefixConflict(newSlug: string): { conflict: true; existingSlug: string } | { conflict: false } {
  try {
    const cacheFile = getBlogPostCachePath();
    if (!fs.existsSync(cacheFile)) return { conflict: false };
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, unknown>;
    const prefixLen = Number((process.env.DAILY_BLOG_SLUG_PREFIX_LEN ?? process.env.HASHNODE_DAILY_SLUG_PREFIX_LEN) || "30");
    if (!Number.isFinite(prefixLen) || prefixLen < 8) return { conflict: false };
    const newPrefix = newSlug.slice(0, prefixLen);
    for (const existingSlug of Object.keys(cache)) {
      if (existingSlug === newSlug) continue; // exact match already handled by slugAlreadyPublished
      if (existingSlug.startsWith(newPrefix) || newSlug.startsWith(existingSlug.slice(0, prefixLen))) {
        return { conflict: true, existingSlug };
      }
    }
    return { conflict: false };
  } catch {
    return { conflict: false };
  }
}

async function notifyTelegramSkipped(reason: string, detail: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = resolveTelegramNotifyChatId();
  if (!token || !chatId) return;
  const text = `\u23F8 Daily blog SKIPPED\n\nReason: ${reason}\nDetail: ${detail}\n\n(Sliding-window mutex or prefix-dedup tripped — no Dev.to / aideazz.xyz publish today.)`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("\ud83d\udcf0 Telegram skip-notify failed:", r.status, t);
    }
  } catch (e) {
    console.error("\ud83d\udcf0 Telegram skip-notify error:", e);
  }
}

// Wrapped entry point: guards via mutex + prefix dedup, then runs inner, always
// notifies Telegram on outcome. The inner runDailyDevToPost is unchanged.
async function _runDailyBlogPost_inner_may25(
  deps: { anthropic: Anthropic; model: string; maxTokens: number }
): ReturnType<typeof runDailyDevToPost> {
  // Guard 1: sliding-window mutex (any-content, any-trigger-source lockout)
  const cutoff = recentPublishCutoffOk();
  if (!cutoff.ok) {
    console.log(`\ud83d\udcf0 Daily blog SKIPPED: ${cutoff.reason}`);
    await notifyTelegramSkipped("Sliding-window cooldown", cutoff.reason);
    throw new Error(`SKIPPED_BY_COOLDOWN: ${cutoff.reason}`);
  }
  // Guard 2: actually run the publisher
  return await runDailyDevToPost(deps);
}

export async function runDailyBlogPost(deps: { anthropic: Anthropic; model: string; maxTokens: number }): Promise<{
  title: string;
  url: string;
  slug?: string;
  aideazzBlogUrl: string;
  topicIndex: number;
  devtoUrl?: string | undefined;
  delisted: boolean;
}> {
  // May 25 2026 FIX: always notify Telegram on outcome (success / skip / failure)
  // and run mutex/dedup guards via _runDailyBlogPost_inner_may25.
  try {
    const result = await _runDailyBlogPost_inner_may25(deps);
    // Post-publish prefix-conflict check: if the SLUG we just emitted collides
    // with an older slug by prefix, flag it (don't unpublish — Dev.to already
    // accepted it — but warn the operator so they can manually de-list / delete).
    try {
      const conflict = findPrefixConflict(result.slug || "");
      if (conflict.conflict) {
        const warn = `Slug prefix collision: just-published "${result.slug}" shares prefix with cached "${conflict.existingSlug}"`;
        console.warn(`\ud83d\udcf0 ${warn}`);
        await notifyTelegramSkipped("Prefix collision (already published)", warn);
      }
    } catch { /* ignore — post-check is advisory only */ }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("SKIPPED_BY_COOLDOWN:")) {
      // Already notified via notifyTelegramSkipped — re-throw silently for caller awareness.
      throw err;
    }
    // Real failure — notify Telegram via the existing failure-notify path.
    try {
      await notifyTelegramBlogFailure(msg);
    } catch { /* swallow — we don't want notify failures to mask the original error */ }
    throw err;
  }
}

export function startDailyBlogPublisher(deps: { anthropic: Anthropic; model: string; maxTokens: number }): cron.ScheduledTask | null {
  if ((process.env.DAILY_BLOG_ENABLED ?? process.env.HASHNODE_DAILY_ENABLED) !== "true") {
    console.log("📰 Daily blog: off (set DAILY_BLOG_ENABLED=true to schedule)");
    return null;
  }
  // Default: 14:30 (2:30 PM) every day, America/Panama (UTC-5, Panama City — no DST)
  const cronExpr = (process.env.DAILY_BLOG_CRON ?? process.env.HASHNODE_DAILY_CRON) || "30 14 * * *";
  const tz = (process.env.DAILY_BLOG_TZ ?? process.env.HASHNODE_DAILY_TZ) || "America/Panama";
  const job = cron.schedule(
    cronExpr,
    async () => {
      try {
        await runDailyBlogPost(deps);
      } catch (e) {
        console.error("📰 Daily blog error:", e);
      }
    },
    { timezone: tz }
  );
  const mode = dailyBlogDevToOnly()
    ? "Dev.to-only (HASHNODE_ACCESS_TOKEN absent or DAILY_BLOG_DEVTO_ONLY=true)"
    : `Dev.to + aideazz.xyz cross-post — listed: ${dailyBlogIsDelisted() ? "no (DELISTED)" : "yes"}`;
  console.log(`📰 Daily blog: scheduled ${cronExpr} (${tz}) — mode: ${mode}`);

  // Fire once immediately on startup when HASHNODE_DAILY_RUN_ON_START=true.
  // Useful after deploys to publish without waiting for the next cron window.
  if ((process.env.DAILY_BLOG_RUN_ON_START ?? process.env.HASHNODE_DAILY_RUN_ON_START) === "true") {
    console.log("📰 Daily blog: DAILY_BLOG_RUN_ON_START=true — firing in 10s…");
    setTimeout(async () => {
      console.log("📰 Daily blog: startup run starting…");
      try {
        await runDailyBlogPost(deps);
      } catch (e) {
        console.error("📰 Daily blog (startup run) error:", e);
      }
    }, 10_000);
  }

  return job;
}
