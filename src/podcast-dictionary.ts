/**
 * podcast-dictionary.ts — living custom vocabulary for Speechmatics (June 10 2026)
 *
 * Problem: spoken acronyms and product names ("GEO", "AEO", "LangGraph",
 * "HubSpot") get misheard ("Aveo", "Daewoo") — especially when Elena speaks
 * Russian with English tech terms mixed in.
 *
 * Two layers, merged at call time:
 *   1. CORE_TERMS — hand-curated: Elena's products, stack, and domain jargon.
 *   2. DYNAMIC    — refreshed daily from the live market: Bright Data SERP
 *      headlines (AI / marketing / model launches, past 24h) → LLM extracts
 *      the proper nouns + emerging terms → cached to data/podcast-dictionary.json.
 *
 * Refresh triggers: daily cron in cto-aipa.ts + lazy refresh when the cache is
 * stale at use time. Every consumer (podcast / podcast_ai / campaign) calls
 * getPodcastDictionary() and passes the list as Speechmatics additional_vocab.
 * All failures degrade gracefully to CORE_TERMS — transcription never blocks.
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import { bdSerpSearch, isBrightDataConfigured } from './brightdata-enrich';

/** Elena's permanent domain vocabulary — products, stack, market jargon. */
export const CORE_TERMS: string[] = [
  // Her brands + products
  'AIdeazz', 'EspaLuz', 'VibeJobHunter', 'Algom Alpha', 'Atuona', 'AIPA',
  // The marketing discipline she talks about constantly
  'GEO', 'AEO', 'SEO', 'generative engine optimization', 'answer engine optimization',
  'technical SEO', 'AI Overview', 'llms.txt', 'structured data', 'JSON-LD', 'schema markup',
  // Models / vendors / AI stack
  'Claude', 'Anthropic', 'Claude Code', 'Opus', 'Sonnet', 'Haiku', 'OpenAI', 'GPT',
  'ChatGPT', 'Gemini', 'Groq', 'Llama', 'Whisper', 'Speechmatics', 'Perplexity',
  'DeepSeek', 'Mistral', 'Copilot', 'Cursor',
  // Agentic engineering vocabulary
  'agentic', 'AI agent', 'multi-agent', 'LangGraph', 'LangChain', 'CrewAI', 'AutoGen',
  'MCP', 'Model Context Protocol', 'RAG', 'retrieval augmented generation', 'pgvector',
  'embeddings', 'LLM', 'prompt engineering', 'tool calling', 'orchestration',
  'human-in-the-loop', 'eval harness', 'LLM-as-judge', 'fine-tuning', 'inference',
  'token', 'context window', 'hallucination', 'guardrails', 'observability',
  // Her business stack
  'HubSpot', 'Bright Data', 'Telegram', 'WhatsApp', 'Make.com', 'n8n', 'Zapier',
  'Buffer', 'Trello', 'Zoho', 'Dev.to', 'Spotify', 'YouTube', 'LinkedIn',
  'Oracle Cloud', 'AWS Lambda', 'EventBridge', 'FastAPI', 'PM2', 'systemd',
  'PostgreSQL', 'SQLite', 'TypeScript', 'Python', 'webhook', 'API', 'CRM', 'RevOps',
  // Web3 side
  'Web3', 'IPFS', 'Polygon', 'NFT', 'ERC-7857', 'tokenomics', 'DAO', 'smart contract',
  // Business vocabulary she uses on the podcast
  'fractional CTO', 'founding engineer', 'solo founder', 'bootstrapped', 'MVP',
  'product-market fit', 'go-to-market', 'lead qualification', 'buying intent',
  'pipeline', 'UTM attribution', 'AI-augmented', 'vibe coding', 'building in public',
];

const CACHE_FILE = () => path.join(
  process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR ?? path.join(process.cwd(), 'data'),
  'podcast-dictionary.json',
);

interface DictCache { updatedAt: string; terms: string[]; sourceHeadlines?: number }

function loadCache(): DictCache | null {
  try {
    const f = CACHE_FILE();
    if (!fs.existsSync(f)) return null;
    const c = JSON.parse(fs.readFileSync(f, 'utf8')) as DictCache;
    return Array.isArray(c.terms) ? c : null;
  } catch { return null; }
}

function saveCache(c: DictCache): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE()), { recursive: true });
    fs.writeFileSync(CACHE_FILE(), JSON.stringify(c, null, 2), 'utf8');
  } catch (e) {
    console.warn('[podcast-dict] cache save failed:', (e as Error).message?.slice(0, 80));
  }
}

function cacheAgeHours(c: DictCache | null): number {
  if (!c?.updatedAt) return Infinity;
  const t = Date.parse(c.updatedAt);
  return Number.isFinite(t) ? (Date.now() - t) / 3_600_000 : Infinity;
}

/**
 * Refresh the DYNAMIC layer from today's market: Bright Data SERP headlines →
 * LLM extracts proper nouns / product names / emerging terms. Saves the cache.
 * Returns the fresh term list (or [] when sources are unavailable).
 */
export async function refreshPodcastDictionary(): Promise<string[]> {
  try {
    if (!isBrightDataConfigured()) {
      console.log('[podcast-dict] Bright Data not configured — keeping core dictionary only');
      return [];
    }
    const queries = [
      'AI news today new model launch',
      'AI marketing GEO AEO trends',
      'new AI startup tools launch this week',
    ];
    const headlines: string[] = [];
    for (const q of queries) {
      const results = await bdSerpSearch(q, { num: 10, gl: 'us', hl: 'en', tbs: 'qdr:d' });
      for (const r of results) headlines.push(`${r.title} — ${r.description || ''}`.slice(0, 160));
      await new Promise((r) => setTimeout(r, 400));
    }
    if (headlines.length === 0) {
      console.log('[podcast-dict] no fresh headlines — keeping previous dynamic terms');
      return loadCache()?.terms ?? [];
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `From today's tech/AI headlines below, extract up to 60 TERMS worth adding to a speech-recognition custom dictionary: product names, company names, model names, protocol names, and emerging jargon. One term per line, no numbering, no commentary. Prefer multi-word proper nouns exactly as written. Skip generic words.

HEADLINES:
${headlines.join('\n')}`;

    const raw = await claudeWithGroqFallback(
      anthropic, 'claude-haiku-4-5-20251001', 900, null, prompt, 'podcast-dict/refresh',
    );
    const terms = raw.split(/\r?\n/)
      .map((l) => l.replace(/^[\s\-•\d.]+/, '').trim())
      .filter((l) => l.length >= 2 && l.length <= 40 && !/[:;"]/.test(l))
      .slice(0, 80);

    const cache: DictCache = { updatedAt: new Date().toISOString(), terms, sourceHeadlines: headlines.length };
    saveCache(cache);
    console.log(`[podcast-dict] refreshed: ${terms.length} dynamic terms from ${headlines.length} headlines`);
    return terms;
  } catch (e) {
    console.warn('[podcast-dict] refresh failed (non-fatal):', (e as Error).message?.slice(0, 120));
    return loadCache()?.terms ?? [];
  }
}

/**
 * The merged dictionary for Speechmatics additional_vocab.
 * Lazy-refreshes when the cache is older than maxAgeHours (default 24h).
 * Always returns within Speechmatics' limits (cap 900 entries) and never throws.
 */
export async function getPodcastDictionary(maxAgeHours = 24): Promise<string[]> {
  let cache = loadCache();
  if (cacheAgeHours(cache) > maxAgeHours) {
    await refreshPodcastDictionary();
    cache = loadCache();
  }
  const dynamic = cache?.terms ?? [];
  const merged = [...new Set([...CORE_TERMS, ...dynamic])];
  return merged.slice(0, 900);
}
