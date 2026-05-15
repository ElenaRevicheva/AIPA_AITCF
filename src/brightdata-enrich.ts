/**
 * brightdata-enrich.ts
 * BrightData Web Unlocker enrichment layer for the Aideazz marketing engine.
 *
 * Enriches outreach leads with:
 *   - Company website → founder names, tech stack, team signals
 *   - Context extraction for Claude pain-point classification
 *
 * Requires env vars:
 *   BRIGHTDATA_API_TOKEN  — customer API token (77c17e6d-...)
 *   BRIGHTDATA_ZONE       — Web Unlocker zone name (e.g. "web_unlocker1")
 *
 * Zone setup (one-time, 30 seconds):
 *   BrightData dashboard → Proxies & Scraping Infrastructure → Web Unlocker → Add zone
 *   Name it "web_unlocker1" (or any name) → Save → copy zone name to .env
 *
 * API cost: ~$3/GB. Typical company page = 30–80KB = well under $0.001/call.
 */

const BD_API = 'https://api.brightdata.com/request';
const BD_TOKEN = () => process.env.BRIGHTDATA_API_TOKEN || '';
const BD_ZONE  = () => process.env.BRIGHTDATA_ZONE || '';

export interface EnrichmentResult {
  founderNames: string[];
  techStack: string[];
  teamSizeSignal: string | null;   // e.g. "5-10 employees", "Series A"
  fundingSignal: string | null;
  rawExcerpt: string;              // first 800 chars of markdown for Claude
}

/**
 * Fetch a URL through BrightData Web Unlocker and return page markdown.
 * Returns null if credentials not configured or request fails.
 */
export async function bdFetch(url: string): Promise<string | null> {
  const token = BD_TOKEN();
  const zone  = BD_ZONE();
  if (!token || !zone) {
    return null;
  }

  try {
    const res = await fetch(BD_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zone, url, format: 'raw' }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.warn(`[BrightData] ${url} → ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }

    return res.text();
  } catch (err) {
    console.warn(`[BrightData] fetch error for ${url}:`, (err as Error).message);
    return null;
  }
}

/**
 * Lightweight regex-based extraction — no LLM call, runs instantly.
 * Used to pre-enrich leads before Claude pain-point classification.
 */
export function extractFromPageText(raw: string): EnrichmentResult {
  // Strip HTML tags if raw HTML was returned
  const text = raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Founder / team names — heuristics
  const founderPatterns = [
    /(?:founder|co-founder|ceo|cto|built by|created by)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi,
    /([A-Z][a-z]+ [A-Z][a-z]+)\s*[,–-]\s*(?:Founder|CEO|CTO|Co-Founder)/gi,
  ];
  const founderNames: string[] = [];
  for (const re of founderPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = (m[1] || m[2])?.trim();
      if (name && !founderNames.includes(name)) founderNames.push(name);
      if (founderNames.length >= 3) break;
    }
  }

  // Tech stack — common signals
  const TECH_KEYWORDS = [
    'React', 'Next.js', 'TypeScript', 'Python', 'Node.js', 'Go', 'Rust',
    'LangChain', 'LangGraph', 'OpenAI', 'Claude', 'Llama', 'Groq',
    'PostgreSQL', 'Supabase', 'MongoDB', 'Redis',
    'AWS', 'GCP', 'Azure', 'Vercel', 'Fly.io',
    'Kubernetes', 'Docker', 'FastAPI', 'GraphQL',
  ];
  const techStack = TECH_KEYWORDS.filter(t =>
    new RegExp(`\\b${t.replace('.', '\\.')}\\b`, 'i').test(text)
  );

  // Team size / funding signals
  const teamMatch = text.match(/\b(\d+)\s*(?:person|people|employee|member|engineer|dev)\b/i);
  const teamSizeSignal = teamMatch ? `~${teamMatch[1]} employees` : null;

  const fundingMatch = text.match(/\b(?:seed|series [a-c]|pre-seed|bootstrapped|backed by|raised \$[\d.]+[mk])/i);
  const fundingSignal = fundingMatch ? fundingMatch[0].trim() : null;

  const rawExcerpt = text.slice(0, 800);

  return { founderNames, techStack, teamSizeSignal, fundingSignal, rawExcerpt };
}

/**
 * Enrich a single lead's website with BrightData.
 * Returns null if no website or BD not configured.
 * Non-fatal — caller should always handle null gracefully.
 */
export async function enrichLeadWebsite(websiteUrl: string): Promise<EnrichmentResult | null> {
  const html = await bdFetch(websiteUrl);
  if (!html) return null;
  return extractFromPageText(html);
}

/**
 * Batch-enrich up to `limit` leads that have a website.
 * Returns a Map<website, EnrichmentResult> for merging into the main lead list.
 * Throttles to 1 req/sec to respect trial credit rate.
 */
export async function batchEnrichLeads(
  leads: Array<{ website: string | null }>,
  limit = 10,
): Promise<Map<string, EnrichmentResult>> {
  const token = BD_TOKEN();
  const zone  = BD_ZONE();
  if (!token || !zone) {
    console.log('[BrightData] Skipping enrichment — BRIGHTDATA_ZONE not configured');
    console.log('[BrightData] To activate: create a Web Unlocker zone in BrightData dashboard');
    console.log('[BrightData] Then add BRIGHTDATA_ZONE=<zone_name> to Oracle .env');
    return new Map();
  }

  const results = new Map<string, EnrichmentResult>();
  let count = 0;

  for (const lead of leads) {
    if (!lead.website || count >= limit) continue;
    try {
      const enrichment = await enrichLeadWebsite(lead.website);
      if (enrichment) {
        results.set(lead.website, enrichment);
        count++;
        console.log(`[BrightData] ✅ Enriched ${lead.website} — founders: ${enrichment.founderNames.join(', ')||'—'} tech: ${enrichment.techStack.slice(0,3).join(', ')||'—'}`);
      }
    } catch (err) {
      console.warn(`[BrightData] Non-fatal error for ${lead.website}:`, (err as Error).message);
    }
    if (count < limit) await new Promise(r => setTimeout(r, 1000)); // 1 req/sec
  }

  console.log(`[BrightData] Enriched ${results.size} company pages`);
  return results;
}

/** Returns true if BrightData is ready (both env vars set). */
export function isBrightDataConfigured(): boolean {
  return !!(BD_TOKEN() && BD_ZONE());
}
