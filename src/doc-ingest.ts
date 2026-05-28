/**
 * Document ingestion → outreach pipeline
 *
 * Accepts any unstructured business document — RFP, takeoff sheet, call log,
 * client list, contracts, email thread, CSV paste — and extracts actionable
 * prospect entities, then feeds them into outreach_targets.
 *
 * This is Phase 4 applied to OPERATIONAL DOCUMENTS, not marketing lists.
 *
 * Income rationale:
 * - Highest-value differentiation for operations-heavy clients (construction,
 *   professional services, logistics, healthcare).
 * - A Manny-style client hands you a takeoff sheet → you extract trades + cities
 *   → you generate targeted sub-contractor outreach automatically.
 * - Elena uses the same module for herself: paste a client RFP → extract
 *   decision-maker + scope → auto-generate a proposal outreach email.
 * - No new infrastructure — same outreach_targets table, same Resend pipeline.
 *
 * Usage:
 *   POST /outreach/ingest-doc
 *   Body: { text: string, docType?: string, clientContext?: string }
 *   Auth: Bearer OUTREACH_SECRET
 *
 *   Or via Telegram: /ingest_doc followed by pasted text
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import {
  hunterDomainSearch,
  importTargets,
  type OutreachTargetInput,
} from './outreach';
import { getOutreachTargetByCompany } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocProspect {
  name: string;          // Person or company name
  company?: string;      // Company if name is a person
  website?: string;      // Domain or URL if mentioned in document
  city?: string;         // Location extracted from document
  role?: string;         // Their role or what they do
  painPoint?: string;    // Why they are a prospect / what they need
  rawContext?: string;   // Short quote from doc that identified them
}

export interface DocIngestOptions {
  text: string;
  /** e.g. "RFP from commercial property developer", "takeoff sheet for office renovation",
   *  "call log with potential subcontractors", "client list CSV" */
  docType?: string;
  /** Who is doing the outreach and what they offer */
  clientContext?: string;
  /** Max prospects to extract (prevents runaway on huge docs) */
  maxProspects?: number;
}

// ---------------------------------------------------------------------------
// Step 1: Extract prospect entities from document via Claude
// ---------------------------------------------------------------------------

async function extractProspectsFromDoc(
  anthropic: Anthropic,
  opts: DocIngestOptions
): Promise<DocProspect[]> {
  const { text, docType, clientContext, maxProspects = 20 } = opts;
  const docDesc = docType || 'business document';
  const context = clientContext || 'AI automation consultant building outreach pipelines';

  // Trim document to avoid hitting token limits (keep first 8000 chars)
  const trimmed = text.slice(0, 8000);
  const truncated = text.length > 8000 ? ' [document truncated for processing]' : '';

  const prompt = `You are an expert B2B outreach analyst extracting prospect contacts from a business document.

Document type: ${docDesc}
Who is doing the outreach: ${context}
${truncated}

Document content:
---
${trimmed}
---

Extract up to ${maxProspects} actionable prospect entities — organizations or people that the outreach business should contact. Only include entities that are clearly identifiable as real targets (skip generic mentions, your own company, boilerplate text).

For each prospect extract:
- name: person name OR company/organization name
- company: company name if "name" is a person
- website: domain or URL if mentioned (null if not found)
- city: location if mentioned (null if not found)
- role: their role or what they do (architect, realtor, subcontractor, decision-maker, etc.)
- painPoint: one sentence — what they need or why they are a good target for outreach
- rawContext: the 1-2 word phrase from the document that identified them (for traceability)

Return ONLY valid JSON array (no prose, no markdown):
[{"name":"...","company":"...","website":null,"city":"...","role":"...","painPoint":"...","rawContext":"..."}, ...]

If no clear prospects found, return: []`;

  try {
    const raw = await claudeWithGroqFallback(
      anthropic, 'claude-3-5-haiku-20241022', 2048, null, prompt, 'doc-ingest/extract'
    );
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn('[doc-ingest] Model returned no JSON array');
      return [];
    }
    const parsed = JSON.parse(match[0]) as DocProspect[];
    console.log(`[doc-ingest] Extracted ${parsed.length} prospects from document`);
    return parsed;
  } catch (e) {
    console.error('[doc-ingest] Extraction error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 2: Enrich with Hunter.io (domain search) if website is present
// ---------------------------------------------------------------------------

async function enrichWithEmail(
  domain: string
): Promise<{ email: string | null; contactName: string | null }> {
  const hunterKey = process.env.HUNTER_API_KEY?.trim();
  if (!hunterKey) return { email: null, contactName: null };

  try {
    const search = await hunterDomainSearch(domain, 5);
    if (search.emails.length > 0) {
      const best = search.emails[0]!;
      return { email: best.email, contactName: best.name || null };
    }
  } catch (e) {
    console.warn(`[doc-ingest] Hunter enrichment failed for ${domain}:`, e);
  }
  return { email: null, contactName: null };
}

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    const cleaned = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
    return cleaned || null;
  }
}

// ---------------------------------------------------------------------------
// Main: runDocIngestion
// ---------------------------------------------------------------------------

export async function runDocIngestion(
  anthropic: Anthropic,
  opts: DocIngestOptions,
  sendTelegram?: (msg: string) => Promise<void>
): Promise<{ ingested: number; skipped: number; errors: number; prospects: DocProspect[] }> {
  const tag = 'doc-ingest';
  const { docType = 'document' } = opts;

  if (!opts.text?.trim()) {
    return { ingested: 0, skipped: 0, errors: 0, prospects: [] };
  }

  console.log(`[${tag}] Processing ${docType} (${opts.text.length} chars)…`);

  // 1. Extract prospects from document
  const prospects = await extractProspectsFromDoc(anthropic, opts);
  if (!prospects.length) {
    const msg = `📄 Doc ingest: no prospects found in ${docType}`;
    console.log(`[${tag}] ${msg}`);
    if (sendTelegram) await sendTelegram(msg);
    return { ingested: 0, skipped: 0, errors: 0, prospects: [] };
  }

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  const targets: OutreachTargetInput[] = [];

  for (const p of prospects) {
    const companyKey = p.company || p.name;
    try {
      // Dedup check
      const existing = await getOutreachTargetByCompany(companyKey);
      if (existing) { skipped++; continue; }

      let email: string | undefined;
      let contactName = p.name;

      // Enrich with Hunter.io if website available
      const domain = p.website ? extractDomain(p.website) : null;
      if (domain) {
        const enriched = await enrichWithEmail(domain);
        if (enriched.email) email = enriched.email;
        if (enriched.contactName) contactName = enriched.contactName;
        // Rate limit: Hunter free tier
        await new Promise(r => setTimeout(r, 2000));
      }

      const tgt: OutreachTargetInput = {
        name: contactName,
        source: `doc_${docType.replace(/\s+/g, '_').toLowerCase().slice(0, 30)}`,
        painPoint: p.painPoint || `${p.role || 'Business'} in ${p.city || 'unknown location'}`,
      };
      if (p.company) tgt.company = p.company;
      if (email) tgt.email = email;
      targets.push(tgt);
    } catch (e) {
      console.error(`[${tag}] Error processing prospect ${companyKey}:`, e);
      errors++;
    }
  }

  if (targets.length > 0) {
    const result = await importTargets(targets);
    ingested = result.imported;
  }

  const summary = [
    `📄 Doc ingest complete`,
    `Source: ${docType}`,
    ``,
    `Prospects extracted: ${prospects.length}`,
    `Imported to pipeline: ${ingested}`,
    `Already in pipeline: ${skipped}`,
    errors ? `Errors: ${errors}` : '',
    ``,
    `Prospects found:`,
    ...prospects.slice(0, 8).map(p =>
      `  • ${p.name}${p.company ? ` @ ${p.company}` : ''}${p.city ? ` (${p.city})` : ''}`
    ),
    prospects.length > 8 ? `  … and ${prospects.length - 8} more` : '',
    ``,
    `Next: outreach cron generates drafts and sends via Resend`,
  ].filter(Boolean).join('\n');

  console.log(`[${tag}] ${summary}`);
  if (sendTelegram) await sendTelegram(summary);

  return { ingested, skipped, errors, prospects };
}
