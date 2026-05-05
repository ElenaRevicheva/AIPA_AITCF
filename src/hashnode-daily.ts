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
export function hashnodeDailyIsDelisted(): boolean {
  if (process.env.HASHNODE_DAILY_DELISTED === "true") return true;
  if (process.env.HASHNODE_DAILY_PUBLIC === "false") return true;
  return false;
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
    process.env.TELEGRAM_HASHNODE_NOTIFY_CHAT_ID?.trim() ||
    process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID?.trim()
  );
}

async function notifyTelegramHashnodePublished(title: string, urlOrMessage: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = resolveTelegramNotifyChatId();
  if (!token || !chatId) return;
  // If urlOrMessage already contains newlines it's a pre-built message, else build one
  const text = urlOrMessage.includes("\n") ? urlOrMessage : `📰 Hashnode published\n\n${title}\n${urlOrMessage}`;
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
      console.error("📰 Telegram notify failed:", r.status, t);
    }
  } catch (e) {
    console.error("📰 Telegram notify error:", e);
  }
}

async function notifyTelegramHashnodeFailure(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = resolveTelegramNotifyChatId();
  if (!token || !chatId) return;
  const text = `🚨 Hashnode daily FAILED (no Dev.to cross-post until fixed)\n\n${message}`;
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
      console.error("📰 Telegram failure notify failed:", r.status, t);
    }
  } catch (e) {
    console.error("📰 Telegram failure notify error:", e);
  }
}

/** Rotating briefs — aligned with marketing roadmap; one per calendar day when enabled. */
export const HASHNODE_TOPIC_BRIEFS: Array<{ keyword: string; brief: string }> = [
  {
    keyword: "multi-agent AI system",
    brief:
      "How to run a multi-agent AI system at ~$0/month infra (Oracle Always Free, systemd, PM2). No hype — constraints, failure modes, what you actually operate.",
  },
  {
    keyword: "AI-assisted development",
    brief:
      "AI-assisted development in production: Cursor, Claude Code, and how an executive-turned-builder ships TypeScript without a traditional CS path. Concrete workflow, not tool marketing.",
  },
  {
    keyword: "multi-model LLM routing",
    brief:
      "Why route ~76% of inference to fast open-weight stacks and reserve frontier models for high-stakes steps. Cost, latency, and when 'best model' is wrong economics.",
  },
  {
    keyword: "AI for construction business",
    brief:
      "Wiring real operations (not demos): documents, field data, and automation for construction-adjacent businesses — boundaries, trust, and human handoff.",
  },
  {
    keyword: "AI automation small business",
    brief:
      "What actually ships in small-business AI automation vs. what dies in slides: integrations, deliverability, and owning your data.",
  },
  {
    keyword: "Oracle Cloud free tier AI",
    brief:
      "Oracle Cloud Always Free as a serious home for agents: VM shape, Autonomous DB, mTLS, and the boring work that keeps processes alive.",
  },
  {
    keyword: "what is an AI agent",
    brief:
      "A production definition of an AI agent from someone running several: observe → decide → act → persist state; contrast with chat-only wrappers.",
  },
  {
    keyword: "GEO generative engine optimization",
    brief:
      "GEO vs SEO: being quotable in ChatGPT/Perplexity — structured facts, authorship, and durable pages on domains you control.",
  },
  {
    keyword: "AI language tutor WhatsApp",
    brief:
      "EspaLuz-style systems: language tutoring on WhatsApp/Telegram — memory, voice, payments, and why messaging UX beats a generic web chat.",
  },
  {
    keyword: "autonomous job search AI",
    brief:
      "Autonomous job search at scale: discovery, scoring, ATS reality, and ethics boundaries — what 'automation' means when outcomes affect people.",
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
  const base = process.env.HASHNODE_TOPIC_STATE_DIR || path.join(process.cwd(), "data");
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

function pickNextTopic(): { index: number; keyword: string; brief: string } {
  const n = HASHNODE_TOPIC_BRIEFS.length;
  const prev = readTopicIndex();
  const index = (prev + 1) % n;
  const t = HASHNODE_TOPIC_BRIEFS[index]!;
  return { index, keyword: t.keyword, brief: t.brief };
}

function extractTag(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = text.match(re);
  return m ? m[1]!.trim() : null;
}

function parseArticle(raw: string): { title: string; markdown: string } | null {
  const title = extractTag(raw, "TITLE");
  const markdown = extractTag(raw, "MARKDOWN");
  if (title && markdown) return { title, markdown };
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) {
    return {
      title: lines[0].slice(2).trim(),
      markdown: lines.slice(1).join("\n").replace(/^\s+/, "").trim(),
    };
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

const ARTICLE_SYSTEM = `You are the writing voice of Elena Revicheva / AIdeazz: executive-turned-AI-builder, Panama-based, shipping production agents on Oracle Cloud.

Hard rules:
- First person or neutral technical — never fake case studies or client names.
- No startup clichés or filler (no "game-changer", "revolutionary", "in today's fast-paced world", "comprehensive guide", "unlock", "synergies").
- Minimum depth: concrete tradeoffs, failure modes, costs, or operational reality — not a listicle of obvious tips.
- Use Markdown: start with ## sections (not H1). Include at least four ## headings after an intro paragraph.
- Target length: 1,400–2,400 words of body (excluding title).
- End with a short byline line: "— Elena Revicheva · [AIdeazz](https://aideazz.xyz) · [Portfolio](https://aideazz.xyz/portfolio)"
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
  gscQueries: string[]
): Promise<{ index: number; keyword: string; brief: string }> {
  const fallback = pickNextTopic();
  if (!gscQueries.length) return fallback;
  try {
    const topics = HASHNODE_TOPIC_BRIEFS.map((t, i) => `${i}: ${t.keyword}`).join("\n");
    const resp = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 64,
      messages: [{
        role: "user",
        content: `These are the search queries already bringing traffic to aideazz.xyz:\n${gscQueries.slice(0, 20).join(", ")}\n\nThese are available article topics (index: keyword):\n${topics}\n\nWhich single index number has the biggest gap — i.e. is least represented in the current traffic? Reply with only the integer index.`,
      }],
    });
    const raw = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
    const idx = parseInt(raw, 10);
    if (!isNaN(idx) && idx >= 0 && idx < HASHNODE_TOPIC_BRIEFS.length) {
      const t = HASHNODE_TOPIC_BRIEFS[idx]!;
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

export async function runDailyHashnodePost(deps: { anthropic: Anthropic; model: string; maxTokens: number }): Promise<{
  title: string;
  url: string;
  slug?: string;
  aideazzBlogUrl: string;
  topicIndex: number;
  devtoUrl?: string | undefined;
  delisted: boolean;
}> {
  const token = process.env.HASHNODE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("HASHNODE_ACCESS_TOKEN missing");

  // Pull GSC queries (best-effort) and let Claude pick the gap topic
  const gscQueries = await fetchGscTopQueries();
  const { index, keyword, brief } = await pickTopicWithGscGap(deps.anthropic, gscQueries);

  const baseUserPrompt = `Target SEO keyword (natural use, not stuffing): "${keyword}"

Topic brief:
${brief}

Write the article for developers and technical founders. Ground in AIdeazz reality: multi-agent systems, Oracle infra, Groq/Claude routing, Telegram/WhatsApp agents, real constraints.`;

  console.log(`📰 Hashnode daily: generating topic #${index} (${keyword})…`);

  const MAX_GENERATION_ATTEMPTS = 3;
  let parsed: ReturnType<typeof parseArticle> | null = null;
  let lastValidationError = "";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const forbiddenNote = lastValidationError
      ? `\n\nCRITICAL: The previous attempt failed quality gate — ${lastValidationError}. Do NOT use that phrase anywhere in the article.`
      : "";
    const userPrompt = baseUserPrompt + forbiddenNote;

    if (attempt > 1) console.log(`📰 Hashnode daily: retry attempt ${attempt}/${MAX_GENERATION_ATTEMPTS} (quality gate failure: ${lastValidationError})`);

    const resp = await deps.anthropic.messages.create({
      model: deps.model,
      max_tokens: deps.maxTokens,
      system: ARTICLE_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    const rawText = block && block.type === "text" ? block.text : "";
    if (!rawText) throw new Error("Empty model response");

    parsed = parseArticle(rawText);
    if (!parsed) {
      throw new Error("Could not parse TITLE/MARKDOWN from model output");
    }

    const v = validateArticle(parsed.markdown);
    if (v.ok) break;

    lastValidationError = v.reason;
    if (attempt === MAX_GENERATION_ATTEMPTS) {
      throw new Error(`Quality gate: ${v.reason} (failed after ${MAX_GENERATION_ATTEMPTS} attempts)`);
    }
  }

  if (!parsed) throw new Error("Article generation produced no output");

  const publicationId = await resolvePublicationId(token);
  const delisted = hashnodeDailyIsDelisted();
  const input = {
    publicationId,
    title: parsed.title.slice(0, 200),
    contentMarkdown: parsed.markdown,
    tags: [
      { slug: "ai", name: "AI" },
      { slug: "programming", name: "Programming" },
      { slug: "machine-learning", name: "Machine Learning" },
    ],
    settings: {
      delisted,
      enableTableOfContent: true,
      isNewsletterActivated: false,
    },
  };

  const out = await gql<{ publishPost: { post: { title: string; url: string; slug: string } } }>(
    PUBLISH_MUTATION,
    { input },
    token
  );
  const post = out.publishPost?.post;
  if (!post?.url) throw new Error("publishPost returned no URL");

  const slug = post.slug?.trim() || "";
  if (!slug) {
    const err = "Hashnode returned no post slug; cannot verify public feed (aideazz /blog).";
    await notifyTelegramHashnodeFailure(`${err}\n${post.url}`);
    throw new Error(err);
  }

  console.log(`📰 Hashnode publishPost OK: ${post.url} (${delisted ? "delisted" : "listed"}) — verifying public API (aideazz uses same)…`);

  if (!delisted) {
    const inFeed = await waitForPostInPublicHashnodeFeed(
      slug,
      Number(process.env.HASHNODE_FEED_WAIT_ATTEMPTS || "15"),
      Number(process.env.HASHNODE_FEED_WAIT_MS || "4000")
    );
    if (!inFeed) {
      const err =
        "Post not visible in public Hashnode GraphQL after repeated checks — aideazz /blog and sitemap will NOT list it. " +
        `Confirm HASHNODE_HOST=${HASHNODE_PUBLIC_HOST} matches the publication, publicationId is correct, and HASHNODE_DAILY_DELISTED is not true.`;
      await notifyTelegramHashnodeFailure(`${err}\nSlug: ${slug}\n${post.url}`);
      throw new Error(err);
    }
  } else {
    console.warn(
      "📰 HASHNODE_DAILY_DELISTED: post is not in public GQL — aideazz /blog will not list it. Remove delist for full pipeline."
    );
  }

  const reach = await verifyUrlReachableWithRetries(post.url, {
    maxAttempts: 6,
    delayMs: 3000,
  });
  if (!reach.ok && reach.status === 404) {
    console.warn(
      "📰 Direct URL check: HTTP 404 (browser/server); public GQL already passed for aideazz — optional to verify in browser."
    );
  } else if (!reach.ok && reach.status && reach.status !== 403) {
    console.warn(
      `📰 Direct URL: HTTP ${reach.status} (datacenter or bot filter); portfolio uses GQL, not this fetch.`
    );
  }

  // Cross-post to Dev.to only after listed posts are confirmed in the same public API as aideazz
  const devtoUrl = await crossPostToDevTo(post.title, parsed.markdown, post.url);
  if (!devtoUrl && process.env.DEVTO_API_KEY?.trim()) {
    console.warn("📰 Dev.to API returned no URL (check key / rate); Hashnode + aideazz are still OK.");
  }

  writeTopicIndex(index);
  await saveContentLog({
    channel: "hashnode_daily",
    keyword,
    title: post.title,
    url: post.url,
    status: "published",
    topicIndex: index,
  });

  const aideazzBlogUrl = `${AIDEAZZ_SITE}/blog/${encodeURIComponent(slug)}`;
  /** Same page with Spanish UI + localized titles/bodies where bundled (`?lng=es`). */
  const aideazzSpanishUiUrl = `${aideazzBlogUrl}?lng=es`;
  const gqOk = !delisted;
  const lines = [
    gqOk
      ? "📰 OK — English article live on all three surfaces below (API URLs, not placeholders)."
      : "📰 Hashnode published (delisted — not in public GQL; aideazz /blog will not list).",
    "",
    post.title,
    "",
    "1) Hashnode (canonical, English):",
    post.url,
    "",
    "2) aideazz /blog (mirrors Hashnode; add ?lng=es for Spanish chrome + overrides):",
    aideazzSpanishUiUrl,
    "",
    devtoUrl
      ? "3) Dev.to (cross-post, English):"
      : process.env.DEVTO_API_KEY?.trim()
        ? "3) Dev.to: (cross-post failed — check logs / DEVTO_API_KEY)"
        : "3) Dev.to: (skipped — DEVTO_API_KEY not set)",
  ];
  if (devtoUrl) lines.push(devtoUrl);
  if (delisted) {
    lines.push("");
    lines.push("⚠️ Delisted: set HASHNODE_DAILY_DELISTED=false (and HASHNODE_DAILY_PUBLIC=true) for portfolio + feed sync.");
  }
  if (!devtoUrl && process.env.DEVTO_API_KEY?.trim()) {
    lines.push("");
    lines.push("⚠️ Dev.to cross-post failed or skipped — see PM2 logs.");
  }
  const telegramMsg = lines.join("\n");
  await notifyTelegramHashnodePublished(post.title, telegramMsg);

  return {
    title: post.title,
    url: post.url,
    aideazzBlogUrl,
    topicIndex: index,
    delisted,
    ...(slug ? { slug } : {}),
    ...(devtoUrl ? { devtoUrl } : {}),
  };
}

export function startHashnodeDailyPublisher(deps: { anthropic: Anthropic; model: string; maxTokens: number }): cron.ScheduledTask | null {
  if (process.env.HASHNODE_DAILY_ENABLED !== "true") {
    console.log("📰 Hashnode daily: off (set HASHNODE_DAILY_ENABLED=true to schedule)");
    return null;
  }
  // Default: 14:30 (2:30 PM) every day, America/Panama (UTC−5, Panama City — no DST)
  const cronExpr = process.env.HASHNODE_DAILY_CRON || "30 14 * * *";
  const tz = process.env.HASHNODE_DAILY_TZ || "America/Panama";
  const job = cron.schedule(
    cronExpr,
    async () => {
      try {
        await runDailyHashnodePost(deps);
      } catch (e) {
        console.error("📰 Hashnode daily error:", e);
      }
    },
    { timezone: tz }
  );
  console.log(
    `📰 Hashnode daily: scheduled ${cronExpr} (${tz}) — listed (aideazz sync): ${hashnodeDailyIsDelisted() ? "no (DELISTED)" : "yes"}`
  );
  return job;
}
