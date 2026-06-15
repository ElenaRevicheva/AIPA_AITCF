/**
 * Prospect Ingestion Pipeline — Phase 4b
 *
 * Reads YC company data (from job-list-filter JSON or YC API),
 * discovers founder emails via Hunter.io (free tier: 25 searches/month),
 * classifies pain points via Claude, and imports into outreach_targets.
 *
 * Budget-aware: tracks Hunter.io calls and falls back to pattern-based
 * emails when the monthly budget is exhausted.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { claudeWithGroqFallback, isAnthropicCreditExhaustion } from './llm-resilience';
import * as fs from 'fs';
import * as path from 'path';
import {
  getOutreachTargetByCompany,
} from './database';
import {
  hunterDomainSearch,
  importTargets,
  verifyEmailHunter,
  type OutreachTargetInput,
} from './outreach';
import { pushLeadToHubSpot } from './hubspot-client';

// ---------------------------------------------------------------------------
// YC company shape (matches job-list-filter output)
// ---------------------------------------------------------------------------

interface YCCompany {
  name: string;
  website: string;
  location: string;
  one_liner: string;
  batch: string;
  status: string;
  score: number;
  isHiring: boolean;
  team_size: number;
  regions: string[];
  source: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HUNTER_MONTHLY_BUDGET = Number(process.env.HUNTER_MONTHLY_BUDGET || 25);
const YC_JSON_PATH = process.env.YC_JSON_PATH || path.resolve(__dirname, '../../job-list-filter/yc_ai_assistant_companies.json');
const YC_API_BASE = 'https://api.ycombinator.com/v0.1/companies';

// In-memory counter resets on restart; conservative but functional
let hunterCallsThisMonth = 0;
let hunterResetMonth = new Date().getMonth();

function canUseHunter(): boolean {
  const now = new Date().getMonth();
  if (now !== hunterResetMonth) {
    hunterCallsThisMonth = 0;
    hunterResetMonth = now;
  }
  return hunterCallsThisMonth < HUNTER_MONTHLY_BUDGET;
}

function recordHunterCall(): void {
  hunterCallsThisMonth++;
}

// ---------------------------------------------------------------------------
// Step 1: Load YC companies — local JSON first, then YC API fallback
// ---------------------------------------------------------------------------

async function loadYCCompanies(): Promise<YCCompany[]> {
  // Try local JSON file produced by job-list-filter cron
  try {
    const raw = fs.readFileSync(YC_JSON_PATH, 'utf-8');
    const companies = JSON.parse(raw) as YCCompany[];
    if (companies.length > 0) {
      console.log(`[prospect-ingest] Loaded ${companies.length} companies from ${YC_JSON_PATH}`);
      return companies;
    }
  } catch {
    console.log(`[prospect-ingest] No local JSON at ${YC_JSON_PATH}, falling back to YC API`);
  }

  // Fallback: fetch from YC API directly (AI Assistant tag)
  try {
    const r = await fetch(`${YC_API_BASE}?tags=AI+Assistant&batch=&status=Active`, {
      headers: { 'User-Agent': 'AIdeazz-CTO-AIPA/1.0' },
    });
    if (!r.ok) {
      console.error(`[prospect-ingest] YC API returned ${r.status}`);
      return [];
    }
    const data = (await r.json()) as { companies?: YCCompany[] } | YCCompany[];
    const list = Array.isArray(data) ? data : data.companies || [];
    console.log(`[prospect-ingest] Fetched ${list.length} companies from YC API`);
    return list as YCCompany[];
  } catch (e) {
    console.error('[prospect-ingest] YC API fetch error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 2: Extract domain from website URL
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
// Step 3: Classify pain point via Claude (batch — one call for many)
// ---------------------------------------------------------------------------

async function classifyPainPoints(
  anthropic: Anthropic,
  companies: Array<{ name: string; oneLiner: string }>
): Promise<Map<string, { painPoint: string; matchedSystem: string }>> {
  const result = new Map<string, { painPoint: string; matchedSystem: string }>();
  if (companies.length === 0) return result;

  const systems = [
    'CTO AIPA — code review, architecture, deployment orchestration',
    'CMO AIPA — SEO/GEO, lead triage, cold outreach',
    'VibeJobHunter — autonomous job search, 3000+ listings/hour',
    'EspaLuz — AI Spanish tutor on WhatsApp',
    'Multi-Model Router — 76% Groq / 24% Claude, $0/month inference',
    'Oracle Always-Free Stack — 9 AI agents at $0/month',
    'Telegram Bot Ecosystem — 5 bots for ops',
    'Atuona Creative AI — poetry, image, video generation',
    'Daily Blog Auto-Publisher — daily AI tech articles',
  ];

  const companyList = companies
    .map((c, i) => `${i + 1}. ${c.name}: "${c.oneLiner}"`)
    .join('\n');

  const prompt = `You are a B2B sales analyst for AIdeazz, an AI consultancy.

AIdeazz production systems:
${systems.map((s) => `- ${s}`).join('\n')}

For each company below, determine:
1. Their likely pain point (1 sentence)
2. Which AIdeazz system best addresses it

Companies:
${companyList}

Return ONLY valid JSON array:
[{"name":"CompanyName","painPoint":"...","matchedSystem":"SystemName"}, ...]`;

  const maxRetries = 3;
  const retryCodes = new Set([529, 503, 429]);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const text = await claudeWithGroqFallback(
        anthropic,
        process.env.OUTREACH_MODEL || 'claude-sonnet-4-6',
        2048,
        null,
        prompt,
        'prospect-ingest/classify',
      );
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[prospect-ingest] Model returned non-JSON for classification');
        return result;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        name: string;
        painPoint: string;
        matchedSystem: string;
      }>;

      for (const entry of parsed) {
        result.set(entry.name, {
          painPoint: entry.painPoint,
          matchedSystem: entry.matchedSystem,
        });
      }
      return result;
    } catch (e: any) {
      if (isAnthropicCreditExhaustion(e)) {
        console.error('[prospect-ingest] Both Anthropic and Groq failed on credit exhaustion');
        return result;
      }
      const status = e?.status ?? e?.statusCode;
      if (retryCodes.has(status) && attempt < maxRetries - 1) {
        const wait = 2000 * (attempt + 1);
        console.warn(`[prospect-ingest] ${status}, retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.error('[prospect-ingest] Classification error:', e);
      return result;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Step 4: Discover founder email for a single company
// ---------------------------------------------------------------------------

async function discoverFounderEmail(
  domain: string
): Promise<{ email: string | null; founderName: string | null; source: string }> {
  if (!canUseHunter()) {
    return patternFallback(domain);
  }

  const search = await hunterDomainSearch(domain, 5);
  recordHunterCall();

  const founderTitles = ['founder', 'ceo', 'cto', 'co-founder', 'vp', 'director', 'head'];
  for (const entry of search.emails) {
    const pos = entry.position.toLowerCase();
    if (founderTitles.some((t) => pos.includes(t)) && entry.confidence >= 50) {
      return { email: entry.email, founderName: entry.name || null, source: 'hunter.io' };
    }
  }

  // If Hunter returned emails but none matched founder titles, take the first one
  if (search.emails.length > 0) {
    const best = search.emails[0]!;
    return { email: best.email, founderName: best.name || null, source: 'hunter.io' };
  }

  return patternFallback(domain);
}

function patternFallback(domain: string): {
  email: string | null;
  founderName: string | null;
  source: string;
} {
  return { email: `founder@${domain}`, founderName: null, source: 'pattern' };
}

// ---------------------------------------------------------------------------
// Main orchestrator: runProspectIngestion
// ---------------------------------------------------------------------------

export async function runProspectIngestion(
  anthropic: Anthropic,
  sendTelegram?: (msg: string) => Promise<void>
): Promise<{ ingested: number; skipped: number; errors: number; hunterUsed: number }> {
  const tag = 'prospect-ingest';
  console.log(`[${tag}] Starting prospect ingestion cycle…`);
  const startHunter = hunterCallsThisMonth;

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 1. Load companies
    const companies = await loadYCCompanies();
    if (companies.length === 0) {
      console.log(`[${tag}] No companies to ingest`);
      return { ingested: 0, skipped: 0, errors: 0, hunterUsed: 0 };
    }

    // 2. Dedup — only keep companies not already in outreach_targets
    const newCompanies: YCCompany[] = [];
    for (const c of companies) {
      const existing = await getOutreachTargetByCompany(c.name);
      if (existing) {
        skipped++;
      } else {
        newCompanies.push(c);
      }
    }
    console.log(`[${tag}] ${newCompanies.length} new companies (${skipped} already in DB)`);

    if (newCompanies.length === 0) {
      // MAY 25 2026: silent skip — 0 new is not a signal worth reporting.
      // The operator only wants to hear when there's something to act on.
      console.log(`🔍 Prospect ingestion: 0 new (all ${skipped} fetched were dupes) — Telegram SUPPRESSED`);
      return { ingested: 0, skipped, errors: 0, hunterUsed: 0 };
    }

    // 3. Classify pain points via Claude (batch call)
    const painMap = await classifyPainPoints(
      anthropic,
      newCompanies.map((c) => ({ name: c.name, oneLiner: c.one_liner }))
    );

    // 4. Discover emails + import targets
    const targets: OutreachTargetInput[] = [];

    for (const c of newCompanies) {
      try {
        const domain = extractDomain(c.website);
        if (!domain) {
          errors++;
          continue;
        }

        const discovery = await discoverFounderEmail(domain);
        const pain = painMap.get(c.name);

        const target: OutreachTargetInput = {
          name: discovery.founderName || `Founder @ ${c.name}`,
          company: c.name,
          source: `yc_${discovery.source}`,
          painPoint: pain?.painPoint || c.one_liner,
        };
        if (discovery.email) target.email = discovery.email;
        targets.push(target);

        // Rate limit: 1 request per 2 seconds for Hunter.io free tier
        if (discovery.source === 'hunter.io') {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        console.error(`[${tag}] Error processing ${c.name}:`, e);
        errors++;
      }
    }

    // 5. Batch import into Oracle
    if (targets.length > 0) {
      const result = await importTargets(targets);
      ingested = result.imported;
      console.log(`[${tag}] Imported ${ingested} targets`);

      // 6. Push to HubSpot CRM — only Hunter.io-verified emails (skip pattern guesses)
      for (const t of targets) {
        const isPatternEmail = !t.email || t.email.startsWith('founder@') || (t.source || '').endsWith('_pattern');
        if (isPatternEmail) continue; // don't pollute CRM with guessed emails
        try {
          const pain = painMap.get(t.company || '');
          await pushLeadToHubSpot({
            name:          t.name,
            email:         t.email,
            company:       t.company,
            source:        t.source || 'YC Prospect Ingestion',
            painPoint:     t.painPoint,
            matchedSystem: pain?.matchedSystem,
          });
        } catch {
          // Non-fatal — HubSpot push failure never blocks Oracle import
        }
      }

      // 7. Verify emails for newly imported targets (uses free verification quota)
      for (const t of targets) {
        if (t.email && t.email !== `founder@${extractDomain(t.company || '')}`) {
          try {
            const v = await verifyEmailHunter(t.email);
            console.log(`[${tag}] Verified ${t.email}: ${v.status}`);
          } catch {
            // Non-fatal
          }
        }
      }
    }

    const hunterUsed = hunterCallsThisMonth - startHunter;

    const summary = [
      `Prospect ingestion complete`,
      ``,
      `New targets imported: ${ingested}`,
      `Already in pipeline: ${skipped}`,
      errors ? `Errors: ${errors}` : '',
      `Hunter.io calls used: ${hunterUsed} of ${HUNTER_MONTHLY_BUDGET} monthly budget`,
      ``,
      `Sources: YC AI Assistant companies`,
      `Next: outreach cron generates drafts and sends via Resend (if configured)`,
    ]
      .filter(Boolean)
      .join('\n');

    if (sendTelegram) {
      await sendTelegram(summary);
    }

    return { ingested, skipped, errors, hunterUsed };
  } catch (e) {
    console.error(`[${tag}] Cycle error:`, e);
    if (sendTelegram) {
      await sendTelegram(`❌ Prospect ingestion failed: ${String(e).slice(0, 200)}`);
    }
    return { ingested, skipped, errors: errors + 1, hunterUsed: hunterCallsThisMonth - startHunter };
  }
}
