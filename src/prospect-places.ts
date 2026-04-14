/**
 * Google Places API prospect ingest — Phase 4c
 *
 * Searches Google Places by industry type + city to build outreach lists
 * for local/industry clients (construction, retail, services, etc.).
 *
 * Requires: GOOGLE_PLACES_API_KEY in .env
 * Enable via: Google Cloud Console → Places API (New) → enable for your project
 *
 * Income rationale:
 * - Elena's YC ingest targets AI startups. This module targets ANY industry in ANY city.
 * - For a Manny-style construction client: architects, realtors, public works in Lexington, KY.
 * - For a retail client: shopping center managers, property companies in target city.
 * - Same outreach_targets table → same email generation → same Resend send path. Zero new infra.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import {
  hunterDomainSearch,
  importTargets,
  verifyEmailHunter,
  type OutreachTargetInput,
} from './outreach';
import { getOutreachExistingCompaniesLowercase } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaceResult {
  /** Resource name, e.g. `places/ChIJ...` — required for Place Details enrichment */
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
}

interface PlacesResponse {
  places?: PlaceResult[];
}

export interface PlacesIngestOptions {
  city: string;
  /** Free-text industry description, e.g. "commercial architects", "realtors", "public works department" */
  industry: string;
  /** Max Places results to fetch (1–20, API cap per request) */
  maxResults?: number;
  /** Context sentence for pain-point classification, e.g. "construction renovation contractor looking for referral partners" */
  clientContext?: string;
}

// ---------------------------------------------------------------------------
// Industry preset map — common templates Elena will reuse across clients
// ---------------------------------------------------------------------------

export const INDUSTRY_PRESETS: Record<string, string[]> = {
  construction: [
    'commercial architects',
    'commercial realtors',
    'public works department',
    'property management companies',
    'general contractors',
  ],
  saas: [
    'software development companies',
    'digital marketing agencies',
    'tech startups',
    'venture capital firms',
  ],
  retail: [
    'shopping center management companies',
    'commercial property managers',
    'retail chains headquarters',
  ],
  healthcare: [
    'medical clinics',
    'dental practice management groups',
    'healthcare staffing agencies',
  ],
};

// ---------------------------------------------------------------------------
// Step 1: Search Google Places Text Search (New API v1)
// ---------------------------------------------------------------------------

async function searchPlaces(query: string, maxResults: number): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[prospect-places] GOOGLE_PLACES_API_KEY not set — skipping Places search');
    return [];
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.name,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.min(maxResults, 20),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[prospect-places] Places API error ${res.status}: ${err.slice(0, 300)}`);
      return [];
    }

    const data = (await res.json()) as PlacesResponse;
    console.log(`[prospect-places] Places query "${query}": ${data.places?.length ?? 0} results`);
    return data.places ?? [];
  } catch (e) {
    console.error('[prospect-places] Places fetch error:', e);
    return [];
  }
}

/** Text Search often omits websiteUri; Details frequently has it (needed for Hunter). */
async function fetchPlaceDetails(
  apiKey: string,
  placeName: string
): Promise<Pick<PlaceResult, 'websiteUri' | 'nationalPhoneNumber' | 'googleMapsUri'>> {
  if (!placeName) return {};
  try {
    const res = await fetch(`https://places.googleapis.com/v1/${placeName}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'websiteUri,nationalPhoneNumber,googleMapsUri',
      },
    });
    if (!res.ok) return {};
    return (await res.json()) as Pick<PlaceResult, 'websiteUri' | 'nationalPhoneNumber' | 'googleMapsUri'>;
  } catch (e) {
    console.warn('[prospect-places] Place Details error:', e);
    return {};
  }
}

async function enrichPlacesFromDetails(places: PlaceResult[]): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return places;

  const out: PlaceResult[] = [];
  let filled = 0;
  for (const p of places) {
    if (p.websiteUri || !p.name) {
      out.push(p);
      continue;
    }
    const d = await fetchPlaceDetails(apiKey, p.name);
    if (d.websiteUri) filled++;
    const merged: PlaceResult = { ...p };
    if (d.websiteUri) merged.websiteUri = d.websiteUri;
    if (d.nationalPhoneNumber) merged.nationalPhoneNumber = d.nationalPhoneNumber;
    if (d.googleMapsUri) merged.googleMapsUri = d.googleMapsUri;
    out.push(merged);
    await new Promise((r) => setTimeout(r, 120));
  }
  if (filled) console.log(`[prospect-places] Place Details filled websiteUri for ${filled} result(s)`);
  return out;
}

// ---------------------------------------------------------------------------
// Step 2: Extract domain from website URI
// ---------------------------------------------------------------------------

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
  }
}

// ---------------------------------------------------------------------------
// Step 3: Classify pain points via Claude (batch)
// ---------------------------------------------------------------------------

async function classifyPlacesPain(
  anthropic: Anthropic,
  places: Array<{ name: string; address: string; industry: string }>,
  clientContext: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!places.length) return result;

  const list = places.map((p, i) => `${i + 1}. ${p.name} (${p.address})`).join('\n');

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a B2B outreach analyst. Context about the business doing outreach: "${clientContext}"

For each business below, write ONE sentence describing their likely pain point that the outreach business can solve.
Industry being targeted: ${places[0]?.industry ?? 'local business'}

Businesses:
${list}

Return ONLY valid JSON array: [{"name":"...","painPoint":"..."}, ...]`,
      }],
    });

    const text = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]) as Array<{ name: string; painPoint: string }>;
    for (const p of parsed) result.set(p.name, p.painPoint);
  } catch (e) {
    console.warn('[prospect-places] Pain classification failed (non-fatal):', e);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main: runPlacesIngestion
// ---------------------------------------------------------------------------

export async function runPlacesIngestion(
  anthropic: Anthropic,
  opts: PlacesIngestOptions,
  sendTelegram?: (msg: string) => Promise<void>
): Promise<{ ingested: number; skipped: number; errors: number }> {
  const { city, industry, maxResults = 20, clientContext } = opts;
  const tag = 'prospect-places';
  const query = `${industry} in ${city}`;
  const context = clientContext || `AI automation and workflow consultant looking to partner with ${industry} businesses`;

  console.log(`[${tag}] Searching: "${query}"`);

  let places = await searchPlaces(query, maxResults);
  if (!places.length) {
    if (sendTelegram) await sendTelegram(`📍 Places ingest: no results for "${query}"`);
    return { ingested: 0, skipped: 0, errors: 0 };
  }

  places = await enrichPlacesFromDetails(places);

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  const withWebsite = places.filter((p) => p.websiteUri);
  const stillNoWebsite = places.filter((p) => !p.websiteUri).length;
  console.log(
    `[${tag}] After Details: ${withWebsite.length} with websiteUri, ${stillNoWebsite} without (will still import for manual follow-up)`
  );

  // Dedup in one Oracle round-trip (avoids blocking both Telegram bots on TLS retry storms)
  const names = places.map((p) => p.displayName?.text || '').filter(Boolean);
  let existingSet: Set<string>;
  try {
    existingSet = await getOutreachExistingCompaniesLowercase(names);
  } catch (e: any) {
    const msg = `❌ Database unavailable (cannot dedupe/import). Check Oracle wallet/TLS, then retry.\n${String(e?.message || e).slice(0, 200)}`;
    console.error(`[${tag}]`, e);
    if (sendTelegram) await sendTelegram(msg);
    return { ingested: 0, skipped: 0, errors: 1 };
  }

  const newPlaces: PlaceResult[] = [];
  for (const p of places) {
    const name = p.displayName?.text || '';
    if (!name) continue;
    if (existingSet.has(name.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    newPlaces.push(p);
  }

  if (!newPlaces.length) {
    const msg = `📍 Places ingest "${query}": 0 new (${skipped} already in pipeline)`;
    console.log(`[${tag}] ${msg}`);
    if (sendTelegram) await sendTelegram(msg);
    return { ingested: 0, skipped, errors: 0 };
  }

  const noWebNew = newPlaces.filter((p) => !p.websiteUri).length;

  // Classify pain points (batch Haiku call)
  const painMap = await classifyPlacesPain(
    anthropic,
    newPlaces.map((p) => ({
      name: p.displayName?.text || '',
      address: p.formattedAddress || city,
      industry,
    })),
    context
  );

  const src = `places_${industry.replace(/\s+/g, '_').toLowerCase()}`;
  const targets: OutreachTargetInput[] = [];

  for (const place of newPlaces) {
    const name = place.displayName?.text || '';
    const basePain =
      painMap.get(name) || `${industry} business in ${city} — likely needs AI automation`;

    if (!place.websiteUri) {
      const extras = [
        place.googleMapsUri ? `Google Maps: ${place.googleMapsUri}` : '',
        place.nationalPhoneNumber ? `Phone: ${place.nationalPhoneNumber}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      targets.push({
        name: `Contact @ ${name}`,
        company: name,
        source: src,
        painPoint: extras
          ? `${basePain}\n${extras}\n(No website in Google Places — add email manually.)`
          : `${basePain}\n(No website in Google Places — add email manually.)`,
      });
      continue;
    }

    const domain = extractDomain(place.websiteUri);
    if (!domain) {
      errors++;
      continue;
    }

    try {
      let email: string | null = null;
      let founderName: string | null = null;

      const hunterKey = process.env.HUNTER_API_KEY?.trim();
      if (hunterKey) {
        const search = await hunterDomainSearch(domain, 5);
        if (search.emails.length > 0) {
          email = search.emails[0]!.email;
          founderName = search.emails[0]!.name || null;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      targets.push({
        name: founderName || `Manager @ ${name}`,
        company: name,
        source: src,
        painPoint: basePain,
        ...(email ? { email } : {}),
      });
    } catch (e) {
      console.error(`[${tag}] Error processing ${name}:`, e);
      errors++;
    }
  }

  if (targets.length > 0) {
    const result = await importTargets(targets);
    ingested = result.imported;

    for (const t of targets) {
      if (t.email) {
        try {
          await verifyEmailHunter(t.email);
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  const summary = [
    `📍 Places ingest complete`,
    `Query: "${query}"`,
    ``,
    `New targets imported: ${ingested}`,
    `Already in pipeline: ${skipped}`,
    noWebNew ? `Imported without website/email (manual follow-up): ${noWebNew}` : '',
    `Places in result set with no listing website: ${stillNoWebsite}`,
    errors ? `Errors: ${errors}` : '',
    ``,
    `Next: outreach cron generates drafts and sends via Resend`,
  ].filter(Boolean).join('\n');

  console.log(`[${tag}] ${summary}`);
  if (sendTelegram) await sendTelegram(summary);

  return { ingested, skipped, errors };
}
