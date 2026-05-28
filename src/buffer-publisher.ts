/**
 * buffer-publisher.ts — Buffer GraphQL social distribution (ADDITIVE, opt-in)
 *
 * STAGE A (2026-05-28): standalone module. Touches NO existing code path.
 * The existing VJH CMO -> Make.com -> Buffer milestone path is untouched and keeps
 * running in parallel; this adds a SECOND, independent path that distributes
 * daily-blog articles to Buffer with UTM-tagged links so click-throughs flow into
 * the already-live /marketing/inquiry -> lead-triage -> HubSpot pipeline.
 *
 * Measurement note: the Buffer API exposes NO analytics query, so attribution comes
 * from the UTM side (see reference_buffer_api memory), not from Buffer itself.
 *
 * Nothing here fires automatically. In Stage A it is driven only by scripts/buffer-cli.ts
 * (manual). Stage B will add a gated, try-catch-wrapped call from daily-blog-publisher.ts
 * behind BUFFER_SOCIAL_ENABLED (default off) — not in this commit.
 *
 * Env:
 *   BUFFER_API_TOKEN       (required)  Bearer token from publish.buffer.com/settings/api
 *   BUFFER_ORG_ID          (optional)  defaults to the known AIdeazz org id
 *   BUFFER_TARGET_SERVICES (optional)  comma list, default "linkedin" (where UTM links are clickable)
 *   BUFFER_SOCIAL_ENABLED  (optional)  gate for the Stage B auto-hook; default off
 *   AIDEAZZ_SITE_URL       (optional)  defaults to https://aideazz.xyz
 */

import type Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { claudeWithGroqFallback } from './llm-resilience';

const BUFFER_ENDPOINT = 'https://api.buffer.com';
const DEFAULT_ORG_ID = '6837714cc8be66c3825d0904';
const AIDEAZZ_SITE = (process.env.AIDEAZZ_SITE_URL || 'https://aideazz.xyz').replace(/\/$/, '');

export function isBufferSocialEnabled(): boolean {
  return process.env.BUFFER_SOCIAL_ENABLED?.trim().toLowerCase() === 'true';
}

function bufferToken(): string {
  const t = process.env.BUFFER_API_TOKEN?.trim();
  if (!t) throw new Error('BUFFER_API_TOKEN not set');
  return t;
}

function bufferOrgId(): string {
  return process.env.BUFFER_ORG_ID?.trim() || DEFAULT_ORG_ID;
}

/**
 * Default share mode. `shareNow` publishes immediately (reliable — does not depend on a
 * configured posting schedule). `addToQueue` requires the channel to have posting-schedule
 * time slots set up in Buffer, otherwise the post silently lands as a DRAFT (the 2026-05-28
 * symptom). Override with BUFFER_POST_MODE if a schedule is later configured.
 */
type ShareMode = 'addToQueue' | 'shareNow' | 'shareNext' | 'customScheduled' | 'recommendedTime';
function defaultPostMode(): ShareMode {
  const m = process.env.BUFFER_POST_MODE?.trim() as ShareMode | undefined;
  return m || 'shareNow';
}

function targetServices(): string[] {
  return (process.env.BUFFER_TARGET_SERVICES?.trim() || 'linkedin')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Inlined to keep this module fully standalone (matches daily-blog-publisher's path logic). */
function blogCachePath(): string {
  const dir = (process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR)
    || path.join(process.cwd(), 'data');
  return path.join(dir, 'blog-posts-cache.json');
}

// ─── Low-level GraphQL ─────────────────────────────────────────────────────────

async function bufferGraphQL<T = any>(query: string): Promise<T> {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bufferToken()}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Buffer API error: ${json.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
  }
  if (!json.data) throw new Error('Buffer API returned no data');
  return json.data;
}

/** Escape a string for safe inline embedding in a GraphQL query literal. */
function gqlStr(s: string): string {
  return JSON.stringify(s); // JSON string encoding is valid GraphQL string syntax
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface BufferChannel {
  id: string;
  service: string;
  name: string;
  displayName: string | null;
  type: string;
  isDisconnected: boolean;
  isLocked: boolean;
}

export async function bufferGetChannels(): Promise<BufferChannel[]> {
  const data = await bufferGraphQL<{ channels: BufferChannel[] }>(
    `query { channels(input: { organizationId: ${gqlStr(bufferOrgId())} }) {
       id service name displayName type isDisconnected isLocked } }`,
  );
  return data.channels || [];
}

/** Channels we can actually post to: connected, not locked, and in the target-services allowlist. */
export async function bufferPostableChannels(): Promise<BufferChannel[]> {
  const wanted = targetServices();
  const all = await bufferGetChannels();
  return all.filter((c) => !c.isDisconnected && !c.isLocked && wanted.includes(c.service.toLowerCase()));
}

export async function bufferCreateIdea(title: string, text: string): Promise<{ id: string }> {
  const data = await bufferGraphQL<{ createIdea: { id: string } }>(
    `mutation { createIdea(input: {
       organizationId: ${gqlStr(bufferOrgId())},
       content: { title: ${gqlStr(title)}, text: ${gqlStr(text)} }
     }) { ... on Idea { id } } }`,
  );
  return data.createIdea;
}

export interface CreatePostResult { ok: boolean; id?: string; error?: string; channelId: string }

export async function bufferCreatePost(opts: {
  channelId: string;
  text: string;
  mode?: 'addToQueue' | 'shareNow' | 'shareNext' | 'customScheduled' | 'recommendedTime';
  dueAt?: string;        // ISO 8601 UTC, only for customScheduled
  saveToDraft?: boolean; // true = goes to Buffer drafts, NOT published
}): Promise<CreatePostResult> {
  const mode = opts.mode || defaultPostMode();
  const dueAtField = opts.dueAt ? `, dueAt: ${gqlStr(opts.dueAt)}` : '';
  const draftField = opts.saveToDraft ? `, saveToDraft: true` : '';
  try {
    const data = await bufferGraphQL<{ createPost: { post?: { id: string }; message?: string } }>(
      `mutation { createPost(input: {
         channelId: ${gqlStr(opts.channelId)},
         text: ${gqlStr(opts.text)},
         schedulingType: automatic,
         mode: ${mode},
         assets: []${dueAtField}${draftField}
       }) {
         ... on PostActionSuccess { post { id } }
         ... on MutationError { message }
       } }`,
    );
    if (data.createPost?.post?.id) return { ok: true, id: data.createPost.post.id, channelId: opts.channelId };
    return { ok: false, error: data.createPost?.message || 'unknown createPost failure', channelId: opts.channelId };
  } catch (e) {
    return { ok: false, error: (e as Error).message?.slice(0, 200), channelId: opts.channelId };
  }
}

// ─── Article -> social variant ───────────────────────────────────────────────

export interface BlogArticle { slug: string; title: string; markdown: string; aideazzBlogUrl?: string }

export function buildUtmLink(slug: string, service: string): string {
  return `${AIDEAZZ_SITE}/blog/${slug}?utm_source=${encodeURIComponent(service)}&utm_medium=buffer_cmo&utm_campaign=${encodeURIComponent(slug)}`;
}

/** Read the most recently published article from the blog cache (read-only). */
export function readLatestBlogArticle(): BlogArticle | null {
  try {
    const raw = fs.readFileSync(blogCachePath(), 'utf8');
    const obj = JSON.parse(raw) as Record<string, BlogArticle & { publishedAt?: string }>;
    const posts = Object.values(obj).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    return posts[0] || null;
  } catch {
    return null;
  }
}

/** Generate a channel-appropriate social post (with UTM link baked in) via Claude->Groq fallback. */
export async function generateSocialVariant(
  anthropic: Anthropic,
  article: BlogArticle,
  service: string,
  model = process.env.BUFFER_VARIANT_MODEL || 'claude-haiku-4-5-20251001',
): Promise<string> {
  const url = buildUtmLink(article.slug, service);
  const excerpt = article.markdown.replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const prompt = `You are the social media co-founder for AIdeazz (multi-agent AI systems, Oracle-first infra, real production constraints).
Write ONE ${service} post promoting this new blog article. Audience: technical founders and AI builders.

Article title: ${article.title}
Article excerpt: ${excerpt}

Rules:
- Open with a specific hook (a real failure mode, number, or contrarian take) — no "Excited to share".
- 2 to 4 short sentences. Plain ASCII punctuation only (no em-dashes, no smart quotes).
- End with this exact link on its own line: ${url}
- Then 3 to 5 relevant hashtags.
- Return ONLY the post text, nothing else.`;
  const text = await claudeWithGroqFallback(anthropic, model, 400, null, prompt, `buffer/variant-${service}`);
  const clean = text.trim();
  // Guarantee the UTM link is present even if the model dropped it.
  return clean.includes(url) ? clean : `${clean}\n\n${url}`;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

export interface DistributeResult {
  article: string;
  posted: CreatePostResult[];
  skipped: string[];
  dryRun: boolean;
}

/**
 * Distribute one article to all postable Buffer channels.
 * - dryRun:true  -> build variants + payloads, do NOT call Buffer (returns previews in skipped)
 * - saveToDraft:true -> create posts as Buffer DRAFTS (not published)
 * - default -> addToQueue (publishes on the channel's normal schedule)
 *
 * Does NOT check BUFFER_SOCIAL_ENABLED — the caller decides. The Stage B auto-hook will
 * gate on isBufferSocialEnabled(); the manual CLI calls this directly.
 */
export async function distributeArticleToBuffer(
  anthropic: Anthropic,
  article: BlogArticle,
  opts: { dryRun?: boolean; saveToDraft?: boolean; mode?: ShareMode } = {},
): Promise<DistributeResult> {
  const channels = await bufferPostableChannels();
  const result: DistributeResult = { article: article.slug, posted: [], skipped: [], dryRun: !!opts.dryRun };
  if (channels.length === 0) {
    result.skipped.push('no postable channels (check BUFFER_TARGET_SERVICES / locked channels)');
    return result;
  }
  for (const ch of channels) {
    const text = await generateSocialVariant(anthropic, article, ch.service);
    if (opts.dryRun) {
      result.skipped.push(`[DRY ${ch.service}/${ch.id}]\n${text}`);
      continue;
    }
    const r = await bufferCreatePost({
      channelId: ch.id,
      text,
      mode: opts.mode || defaultPostMode(),
      ...(opts.saveToDraft ? { saveToDraft: true } : {}),
    });
    result.posted.push(r);
  }
  return result;
}
