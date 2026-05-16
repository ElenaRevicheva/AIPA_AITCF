/**
 * serpapi-prospects.ts
 * Scheduled discovery: Google Search → founder pain signals → HubSpot client pipeline.
 *
 * Queries HN / Reddit / general web for "need CTO", "hire AI engineer", etc.
 * Results deduped by URL hash, pushed to /api/crm-event pipeline:'client'.
 * BrightData enrichment fires automatically in crm-event handler for domains with websites.
 *
 * Runs every 6h via cto-aipa's scheduled task system.
 */

import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const STATE_FILE = resolve(process.cwd(), 'serpapi_prospects_seen.json');

const SERPAPI_KEY    = (process.env.SERPAPI_KEY || '').trim();
const OUTREACH_URL   = (process.env.CTO_AIPA_WEBHOOK_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const OUTREACH_SECRET = (process.env.OUTREACH_SECRET || '').trim();

const SEARCH_QUERIES = [
  // Hacker News — high signal, technical founders
  { q: '"need CTO" OR "looking for CTO" OR "hire CTO"',      site: 'site:news.ycombinator.com', tag: 'hn_cto',        urgency: 5 },
  { q: '"technical co-founder" wanted OR needed OR seeking',  site: 'site:news.ycombinator.com', tag: 'hn_cofounder',  urgency: 5 },
  // Reddit startups
  { q: '"need a CTO" OR "hire AI engineer" startup',          site: 'site:reddit.com',           tag: 'reddit_cto',    urgency: 4 },
  // General web — broad but catches blog posts / Twitter threads indexed by Google
  { q: '"fractional CTO" interested OR "fractional CTO" hire OR "fractional CTO" available', site: '', tag: 'web_fractional', urgency: 4 },
  { q: '"hire AI engineer" OR "hiring AI engineer" (startup OR seed OR "series a")',      site: 'site:wellfound.com OR site:ycombinator.com', tag: 'web_ai_eng', urgency: 4 },
];

function loadSeen(): Set<string> {
  try {
    if (existsSync(STATE_FILE)) return new Set(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
  } catch {}
  return new Set();
}

function saveSeen(seen: Set<string>): void {
  try {
    const arr = [...seen];
    writeFileSync(STATE_FILE, JSON.stringify(arr.slice(-3000)));
  } catch {}
}

function urlHash(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  displayed_link?: string;
}

async function fetchGoogleSearch(query: string, site: string): Promise<SerpResult[]> {
  if (!SERPAPI_KEY) return [];
  const q = site ? `${query} ${site}` : query;
  try {
    const params = new URLSearchParams({
      engine:  'google',
      q,
      hl:      'en',
      tbs:     'qdr:w',  // past week
      num:     '10',
      api_key: SERPAPI_KEY,
    });
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      console.warn(`[SerpProspects] Search error (${query.slice(0, 40)}): ${res.status}`);
      return [];
    }
    const data = await res.json() as { organic_results?: SerpResult[] };
    return data.organic_results || [];
  } catch (e) {
    console.warn(`[SerpProspects] fetch error:`, (e as Error).message?.slice(0, 80));
    return [];
  }
}

async function pushToCRM(payload: Record<string, unknown>): Promise<void> {
  if (!OUTREACH_SECRET) return;
  try {
    await fetch(OUTREACH_URL + '/api/crm-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OUTREACH_SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {}
}

export async function runSerpProspects(): Promise<void> {
  if (!SERPAPI_KEY) {
    console.warn('[SerpProspects] SERPAPI_KEY not set — skipping');
    return;
  }

  const seen = loadSeen();
  let newProspects = 0;

  for (const entry of SEARCH_QUERIES) {
    console.log(`[SerpProspects] Querying: ${entry.q.slice(0, 60)} ${entry.site}`);
    const results = await fetchGoogleSearch(entry.q, entry.site);
    console.log(`[SerpProspects]   → ${results.length} results`);

    for (const result of results) {
      const hash = urlHash(result.link);
      if (seen.has(hash)) continue;
      seen.add(hash);
      newProspects++;

      // Extract domain for BrightData enrichment (fires automatically in crm-event handler)
      let domain: string | undefined;
      try {
        domain = new URL(result.link).origin;
        // Skip aggregator domains — not useful to enrich
        const skipDomains = ['news.ycombinator.com', 'reddit.com', 'twitter.com', 'x.com', 'google.com', 'wikipedia.org', 'youtube.com', 'forbes.com', 'techcrunch.com', 'wired.com', 'cnn.com', 'bbc.com', 'medium.com', 'indeed.com', 'glassdoor.com', 'linkedin.com'];
        if (skipDomains.some(d => domain!.includes(d))) domain = undefined;
      } catch {}

      console.log(`[SerpProspects]   + [${entry.tag}] ${result.title?.slice(0, 60)}`);

      await pushToCRM({
        source:   'serpapi_search',
        type:     'prospect',
        pipeline: 'client',
        name:     result.title?.slice(0, 120) || 'Unknown',
        domain,
        context:  `[Google/${entry.tag}] ${result.title}\n${result.link}\n\n${result.snippet}`,
        urgency:  entry.urgency,
      });

      await new Promise(r => setTimeout(r, 500));
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  saveSeen(seen);
  console.log(`[SerpProspects] Done — new prospects: ${newProspects}`);
}
