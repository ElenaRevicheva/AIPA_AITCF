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
import { bdSerpSearch, isBrightDataConfigured } from './brightdata-enrich';
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

// ─── Hard filter: skip results whose title screams "wrong shape" ───
// Mirrors Python JobGate (CAREER_FOCUS) — was missing here, allowing
// Bristol Myers / Atlassian / Medium / useshiny.com to pollute [CLIENT].
const TITLE_REJECT_PATTERNS = [
  // Senior/wrong-level roles in result titles
  'principal', 'director', 'vp ', 'vp,', 'vice president', 'staff engineer',
  'head of', 'trainee', 'graduate engineer', 'apprentice',
  // Wrong domain
  'devops', 'devsecops', 'database engineer', 'ui developer', 'power bi',
  'cloud engineer', 'sales', 'recruiter', 'account manager',
  'senior engineer', 'senior software', 'senior ai', 'senior ml',
  'ml engineer', 'machine learning engineer', 'data scientist',
];

// Fortune-500 / large companies that should NOT show up as fractional-CTO prospects
const BIG_CO_REJECT = [
  'bristol myers', 'atlassian', 'medium ', 'medium —', 'workday', 'pepsico',
  'expedia', 'general motors', 'bausch + lomb', 'saic', 'pennymac', 'teradata',
  'blue orange digital', 'new york life', 'datavant', 'airbnb', 'rocket lawyer',
  'liberty mutual', 'salesforce', 'adobe', 'hubspot ', 'servicenow',
  'google', 'meta', 'amazon', 'microsoft', 'oracle', 'apple',
  // Aggregator/listing/recruiting sites that show up as "company"
  'useshiny.com', 'ziprecruiter', 'indeed.com', 'glassdoor',
  'ai 2030', 'intalex', 'tds global', 'jobgether', 'tempo software',
  'careeratlas', 'jobs for humanity', 'jobs for the future',
];

function shouldRejectResult(title: string, link: string): string | null {
  const t = (title || '').toLowerCase();
  const l = (link || '').toLowerCase();
  for (const p of TITLE_REJECT_PATTERNS) if (t.includes(p)) return `title-pattern: ${p}`;
  for (const c of BIG_CO_REJECT)         if (t.includes(c) || l.includes(c)) return `big-co/aggregator: ${c}`;
  return null;
}

async function fetchGoogleSearch(query: string, site: string): Promise<SerpResult[]> {
  // MAY 25 2026 (hackathon): prefer BrightData SERP API (Web Unlocker proxy +
  // brd_json=1) — reuses BRIGHTDATA_API_TOKEN + BRIGHTDATA_ZONE, no extra creds.
  // Falls back to legacy SerpAPI if BrightData not configured. The two responses
  // are normalized to the same `SerpResult` shape so downstream code is unchanged.
  if (isBrightDataConfigured()) {
    const bdResults = await bdSerpSearch(query, { site, num: 10, gl: 'us', hl: 'en', tbs: 'qdr:w' });
    if (bdResults.length > 0) {
      return bdResults.map(r => {
        const out: SerpResult = {
          title: r.title,
          link: r.link,
          snippet: r.description || '',
        };
        if (r.display_link) out.displayed_link = r.display_link;
        return out;
      });
    }
    // bdSerpSearch returned [] — log + continue to SerpAPI fallback if available
    console.log(`[SerpProspects] BrightData SERP returned 0 for "${query.slice(0, 40)}" — falling back to SerpAPI`);
  }

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

      // HARD FILTER: skip wrong-role + big-co + aggregator results before any push.
      const rejectReason = shouldRejectResult(result.title || '', result.link || '');
      if (rejectReason) {
        console.log(`[SerpProspects]   ✗ REJECT (${rejectReason}): ${result.title?.slice(0, 60)}`);
        continue;
      }
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
        sourcePrefix: 'CLIENT-CTO-SERP',
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
