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
import { Anthropic } from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import { matchOfferToIntent, renderOfferEstimate } from './offer-pricing';
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
  // ICP-targeted (May 31 2026): non-technical founders + SMBs needing AI/automation
  { q: '"non-technical founder" ("looking for" OR "need" OR "seeking") (CTO OR "technical co-founder" OR "someone to build")', site: '', tag: 'nontech_founder', urgency: 5 },
  { q: '"looking for someone to build" (my app OR MVP OR platform OR SaaS OR startup)', site: 'site:reddit.com', tag: 'reddit_build', urgency: 4 },
  { q: '"need help" ("AI automation" OR "automate my business" OR "AI for my business") (small business OR agency OR founder)', site: '', tag: 'smb_ai', urgency: 4 },
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

// Cheap, high-confidence NOISE pre-filter (May 31 2026) — drops obvious
// articles / news / discussions / job-seekers BEFORE the LLM intent call, to
// save tokens. Conservative: only rejects when clearly not a buying signal.
const NOISE_DOMAINS = [
  'wikipedia.org', 'britannica.com', 'youtube.com', 'youtu.be', 'forbes.com',
  'techcrunch.com', 'wired.com', 'cnn.com', 'bbc.com', 'nbcnews.com', 'nytimes.com',
  'theverge.com', 'cnbc.com', 'washingtonpost.com', 'theguardian.com',
  'businessinsider.com', 'vox.com', 'platformer.news', 'medium.com', 'substack.com',
  'energy.gov', 'investopedia.com', 'hbr.org', 'gartner.com', 'mckinsey.com',
];
// Article/opinion/discussion title shapes — content ABOUT the topic, not a buyer.
const NOISE_TITLE_PATTERNS = [
  'how to', 'how ai', 'why ', 'what is', 'what are', 'the best', 'top ', ' vs ',
  'guide to', 'tutorial', 'explained', 'definition', 'examples', 'is destroying',
  'is dead', 'surpasses', 'step down', 'steps down', 'suffering from', 'apparently',
  ' | hacker news', 'ask hn:', 'i talked', 'i hired', 'i briefly', 'i always',
  'my worst', "i've ever had", 'rant on', 'for hire', '[for hire]', 'for-hire',
  'seeking roles', 'seeking ml', 'seeking a job', 'cs student', 'cs grad', 'unemployed',
  'data scientist', 'open to work', '#opentowork', 'available for hire',
];

function looksLikeNoise(title: string, link: string): string | null {
  const t = (title || '').toLowerCase();
  const l = (link || '').toLowerCase();
  for (const d of NOISE_DOMAINS)        if (l.includes(d)) return `noise-domain: ${d}`;
  for (const p of NOISE_TITLE_PATTERNS) if (t.includes(p)) return `noise-title: ${p}`;
  return null;
}

function shouldRejectResult(title: string, link: string): string | null {
  const t = (title || '').toLowerCase();
  const l = (link || '').toLowerCase();
  for (const p of TITLE_REJECT_PATTERNS) if (t.includes(p)) return `title-pattern: ${p}`;
  for (const c of BIG_CO_REJECT)         if (t.includes(c) || l.includes(c)) return `big-co/aggregator: ${c}`;
  const noise = looksLikeNoise(title, link);
  if (noise) return noise;
  return null;
}

// ─── Buying-intent classifier (the core fix) ──────────────────────────────────
// A Google result is a PAGE, not a prospect. This decides whether the page
// represents a real person/company ACTIVELY SEEKING to hire a CTO / technical
// co-founder / AI build help — vs an article, discussion, news, or job-seeker.

interface Candidate { title: string; link: string; snippet: string; tag: string; urgency: number; domain?: string | undefined; }
interface IntentVerdict { isLead: boolean; label: string; confidence: number; }

async function classifyBuyingIntent(
  anthropic: Anthropic,
  candidates: Candidate[],
): Promise<Map<number, IntentVerdict>> {
  const out = new Map<number, IntentVerdict>();
  if (candidates.length === 0) return out;

  const list = candidates
    .map((c, i) => `${i + 1}. TITLE: ${c.title}\n   SNIPPET: ${(c.snippet || '').slice(0, 220)}\n   URL: ${c.link}`)
    .join('\n');

  const prompt = `You triage web search results for AIdeazz, which sells: a Fractional CTO retainer, AI Marketing Engine setup, and custom AI agent builds. The ideal buyer is a NON-TECHNICAL FOUNDER or a small/mid business that needs technical leadership or AI/automation help.

For each result decide: is this a REAL BUYING SIGNAL — i.e. a specific person or company ACTIVELY EXPRESSING A NEED for TECHNICAL help AIdeazz sells: to hire/find a CTO, technical co-founder, AI engineer, or someone to BUILD their app/product/software/automation.

Mark is_lead=false for: news/opinion articles, how-to/guides, definitions, general discussions or debates ABOUT the topic, podcasts, course/ad pages, people OFFERING their own services (freelancers/agencies/"for hire"), and job-seekers looking for roles.
ALSO mark is_lead=false when the person is seeking the OPPOSITE of what AIdeazz offers — e.g. a (technical) founder seeking a SALES / MARKETING / BUSINESS / non-technical co-founder. AIdeazz is the technical/AI side, so only people who need TECHNICAL/AI/BUILD help are buyers.
Mark is_lead=true ONLY when someone is the BUYER actively seeking the technical/AI/build help AIdeazz provides.

For each lead, write a short human label of WHO wants WHAT (e.g. "Non-technical founder seeking CTO for social-media app", "SMB owner needs help automating operations with AI"). For non-leads, label can be "".

Results:
${list}

Return ONLY a valid JSON array, one object per result in order:
[{"i":1,"is_lead":true,"label":"...","confidence":0.0-1.0}, ...]`;

  try {
    const text = await claudeWithGroqFallback(
      anthropic, 'claude-haiku-4-5-20251001', 2048, null, prompt, 'serp-prospects/intent',
    );
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.warn('[SerpProspects] intent classifier returned non-JSON'); return out; }
    const parsed = JSON.parse(m[0]) as Array<{ i: number; is_lead: boolean; label?: string; confidence?: number }>;
    for (const e of parsed) {
      const idx = e.i - 1;
      if (idx < 0 || idx >= candidates.length) continue;
      out.set(idx, {
        isLead: !!e.is_lead,
        label: (e.label || '').trim(),
        confidence: typeof e.confidence === 'number' ? e.confidence : (e.is_lead ? 0.7 : 0),
      });
    }
  } catch (e) {
    console.error('[SerpProspects] intent classification error:', (e as Error).message?.slice(0, 120));
  }
  return out;
}

async function fetchGoogleSearch(query: string, site: string): Promise<SerpResult[]> {
  // MAY 25 2026 (hackathon): prefer BrightData SERP API (Web Unlocker proxy +
  // brd_json=1) — reuses BRIGHTDATA_API_TOKEN + BRIGHTDATA_ZONE, no extra creds.
  // Falls back to legacy SerpAPI if BrightData not configured. The two responses
  // are normalized to the same `SerpResult` shape so downstream code is unchanged.
  if (isBrightDataConfigured()) {
    // num:20 — more candidates per BrightData request = more leads per credit.
    const bdResults = await bdSerpSearch(query, { site, num: 20, gl: 'us', hl: 'en', tbs: 'qdr:w' });
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
    // BrightData is the engine. When it returns 0 the query is simply sparse this
    // week — do NOT fall back to SerpAPI (quota exhausted; wastes a 20s timeout).
    console.log(`[SerpProspects] BrightData SERP returned 0 for "${query.slice(0, 40)}" (sparse) — skipping`);
    return [];
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

const SERP_MIN_CONFIDENCE = Number(process.env.SERP_MIN_CONFIDENCE || 0.6);

/**
 * @param opts.dryRun  when true, classifies + logs decisions but pushes NOTHING
 *                     to the CRM and does NOT persist the seen-set. Used to test
 *                     the buying-intent gate on live search results safely.
 */
export async function runSerpProspects(opts: { dryRun?: boolean } = {}): Promise<{
  fetched: number; preFiltered: number; classified: number; leads: number; pushed: number;
}> {
  const dryRun = !!opts.dryRun;
  if (!SERPAPI_KEY && !isBrightDataConfigured()) {
    console.warn('[SerpProspects] no SERPAPI_KEY / BrightData — skipping');
    return { fetched: 0, preFiltered: 0, classified: 0, leads: 0, pushed: 0 };
  }

  const seen = loadSeen();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

  // ── 1. Gather candidates across all queries (cheap regex pre-filter only) ──
  const candidates: Candidate[] = [];
  let fetched = 0;
  for (const entry of SEARCH_QUERIES) {
    console.log(`[SerpProspects] Querying: ${entry.q.slice(0, 60)} ${entry.site}`);
    const results = await fetchGoogleSearch(entry.q, entry.site);
    fetched += results.length;
    console.log(`[SerpProspects]   → ${results.length} results`);

    for (const result of results) {
      const hash = urlHash(result.link);
      if (seen.has(hash)) continue;
      seen.add(hash);

      const rejectReason = shouldRejectResult(result.title || '', result.link || '');
      if (rejectReason) {
        console.log(`[SerpProspects]   ✗ pre-filter (${rejectReason}): ${result.title?.slice(0, 55)}`);
        continue;
      }

      // Domain for enrichment — drop aggregator/forum domains (not a company site)
      let domain: string | undefined;
      try {
        domain = new URL(result.link).origin;
        const skipDomains = ['news.ycombinator.com', 'reddit.com', 'twitter.com', 'x.com', 'google.com', 'wikipedia.org', 'youtube.com', 'forbes.com', 'techcrunch.com', 'wired.com', 'cnn.com', 'bbc.com', 'medium.com', 'indeed.com', 'glassdoor.com', 'linkedin.com', 'wellfound.com'];
        if (skipDomains.some(d => domain!.includes(d))) domain = undefined;
      } catch {}

      candidates.push({ title: result.title || '', link: result.link, snippet: result.snippet || '', tag: entry.tag, urgency: entry.urgency, domain });
    }
    await new Promise(r => setTimeout(r, dryRun ? 300 : 2000));
  }

  console.log(`[SerpProspects] ${candidates.length} candidates survived pre-filter (of ${fetched} fetched)`);

  // ── 2. Buying-intent classification (batches of 20) ──
  const verdicts = new Map<number, IntentVerdict>();
  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    const map = await classifyBuyingIntent(anthropic, batch);
    map.forEach((v, localIdx) => verdicts.set(i + localIdx, v));
  }

  // ── 3. Push only genuine buying signals ──
  let leads = 0, pushed = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const v = verdicts.get(i);
    const isLead = !!v?.isLead && (v?.confidence ?? 0) >= SERP_MIN_CONFIDENCE;
    if (!isLead) {
      console.log(`[SerpProspects]   ✗ not-a-lead (${v ? v.confidence.toFixed(2) : 'n/a'}): ${c.title.slice(0, 55)}`);
      continue;
    }
    leads++;
    const dealName = (v!.label || c.title).slice(0, 120);
    // Revenue Cockpit Phase 2: estimate deal value from the intent label
    const offer = matchOfferToIntent(`${v!.label} ${c.title} ${c.snippet}`);
    console.log(`[SerpProspects]   ✅ LEAD [${c.tag}] ${dealName} → ${offer.label} (${renderOfferEstimate(offer)})`);
    if (dryRun) continue;

    await pushToCRM({
      source:   'serpapi_search',
      type:     'prospect',
      pipeline: 'client',
      sourcePrefix: 'CLIENT-CTO-SERP',
      name:     dealName,
      domain:   c.domain,
      amount:   offer.amount,
      context:  `[Google/${c.tag}] BUYING SIGNAL: ${v!.label}\nBest-fit offer: ${offer.label} — est. ${renderOfferEstimate(offer)}\n${c.title}\n${c.link}\n\n${c.snippet}`,
      urgency:  c.urgency,
    });
    pushed++;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!dryRun) saveSeen(seen);
  const stats = { fetched, preFiltered: candidates.length, classified: verdicts.size, leads, pushed };
  console.log(`[SerpProspects] ${dryRun ? '[DRY-RUN] ' : ''}Done — ${JSON.stringify(stats)}`);
  return stats;
}
