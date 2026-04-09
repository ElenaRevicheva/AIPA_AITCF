/**
 * Daily Hashnode publisher: Claude long-form → GraphQL publishPost.
 * Opt-in via HASHNODE_DAILY_ENABLED=true. Token + publication from env (same as scripts/hashnode-publish.mjs).
 */
import * as cron from "node-cron";
import * as fs from "fs";
import * as path from "path";
import type { Anthropic } from "@anthropic-ai/sdk";

const GQL = "https://gql.hashnode.com/";

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

export async function runDailyHashnodePost(deps: { anthropic: Anthropic; model: string; maxTokens: number }): Promise<{
  title: string;
  url: string;
  topicIndex: number;
}> {
  const token = process.env.HASHNODE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("HASHNODE_ACCESS_TOKEN missing");

  const { index, keyword, brief } = pickNextTopic();
  const userPrompt = `Target SEO keyword (natural use, not stuffing): "${keyword}"

Topic brief:
${brief}

Write the article for developers and technical founders. Ground in AIdeazz reality: multi-agent systems, Oracle infra, Groq/Claude routing, Telegram/WhatsApp agents, real constraints.`;

  console.log(`📰 Hashnode daily: generating topic #${index} (${keyword})…`);

  const resp = await deps.anthropic.messages.create({
    model: deps.model,
    max_tokens: deps.maxTokens,
    system: ARTICLE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = resp.content[0];
  const rawText = block && block.type === "text" ? block.text : "";
  if (!rawText) throw new Error("Empty model response");

  const parsed = parseArticle(rawText);
  if (!parsed) {
    throw new Error("Could not parse TITLE/MARKDOWN from model output");
  }

  const v = validateArticle(parsed.markdown);
  if (!v.ok) {
    throw new Error(`Quality gate: ${v.reason}`);
  }

  const publicationId = await resolvePublicationId(token);
  const delisted = process.env.HASHNODE_DAILY_PUBLIC !== "true";
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

  const out = await gql<{ publishPost: { post: { title: string; url: string } } }>(PUBLISH_MUTATION, { input }, token);
  const post = out.publishPost?.post;
  if (!post?.url) throw new Error("publishPost returned no URL");

  writeTopicIndex(index);
  console.log(`📰 Hashnode daily: published — ${post.url} (${delisted ? "delisted" : "public feed"})`);
  return { title: post.title, url: post.url, topicIndex: index };
}

export function startHashnodeDailyPublisher(deps: { anthropic: Anthropic; model: string; maxTokens: number }): cron.ScheduledTask | null {
  if (process.env.HASHNODE_DAILY_ENABLED !== "true") {
    console.log("📰 Hashnode daily: off (set HASHNODE_DAILY_ENABLED=true to schedule)");
    return null;
  }
  const cronExpr = process.env.HASHNODE_DAILY_CRON || "0 13 * * *";
  const job = cron.schedule(
    cronExpr,
    async () => {
      try {
        await runDailyHashnodePost(deps);
      } catch (e) {
        console.error("📰 Hashnode daily error:", e);
      }
    },
    { timezone: process.env.HASHNODE_DAILY_TZ || "UTC" }
  );
  console.log(`📰 Hashnode daily: scheduled ${cronExpr} (${process.env.HASHNODE_DAILY_TZ || "UTC"}) — public feed: ${process.env.HASHNODE_DAILY_PUBLIC === "true" ? "yes" : "no (delisted)"}`);
  return job;
}
