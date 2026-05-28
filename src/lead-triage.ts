/**
 * lead-triage.ts — Phase 5: Lead Triage Engine
 * Classifies signals from business_leads + outreach_log
 * Model routing per SKILL.md: Groq for bulk, Claude Sonnet for urgency 4-5
 * Writes to lead_triage table + agent_outcomes per WIRING_CONDUCTOR
 */

import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import {
  getUntriagedLeads,
  getUntriagedOutreachTargets,
  getRepliedOutreach,
  saveTriagedLead,
  getTriagedLeads,
  saveAgentOutcome,
  getPlacesPipelineSnapshot,
  type PlacesPipelineSnapshot,
} from './database';
import { pushLeadToHubSpot, HS_STAGES, getActionableHubSpotDeals } from "./hubspot-client";

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CLAUDE_MODEL = 'claude-sonnet-4-5';
/** Groq free tier TPM ~12k — huge inquiry bodies must be clipped or requests fail with 413. */
const TRIAGE_CONTEXT_MAX_CHARS = 3600;
const TRIAGE_FALLBACK_MODEL = process.env.TRIAGE_FALLBACK_MODEL || 'claude-haiku-4-5-20251001';
const TRIAGE_INTER_LEAD_DELAY_MS = Math.max(0, parseInt(process.env.TRIAGE_INTER_LEAD_DELAY_MS || '350', 10) || 0);

/** Flip to true when Groq returns 429 daily limit — skip Groq for rest of cycle */
let _groqDailyLimitHit = false;

interface TriageResult {
  signal_type: 'job_opportunity' | 'client_lead' | 'partnership' | 'irrelevant' | 'unknown';
  urgency: number; // 1-5
  deal_value: 'fractional_engagement' | 'full_time_role' | 'product_user' | 'unknown';
  one_line_summary: string;
}

interface LeadInput {
  id: string;
  source_table: 'business_leads' | 'outreach_log' | 'outreach_targets';
  name: string;
  email: string;
  context: string;
  utm_source?: string;
}

function truncateTriageContext(text: string): string {
  const t = text || '';
  if (t.length <= TRIAGE_CONTEXT_MAX_CHARS) return t;
  return `${t.slice(0, TRIAGE_CONTEXT_MAX_CHARS)}\n…[truncated for triage — full text in Oracle]`;
}

function parseTriageJson(raw: string): TriageResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as TriageResult;
  } catch {
    return null;
  }
}

function buildTriagePrompt(lead: LeadInput, contextForModel: string): string {
  return `You are a lead triage AI for an AI systems builder / fractional AI consultant.

Classify this inbound signal and respond with ONLY valid JSON, no explanation.

Signal source: ${lead.source_table}
Name: ${lead.name || 'unknown'}
Email: ${lead.email || 'unknown'}
UTM source: ${lead.utm_source || 'direct'}
Context: ${contextForModel || 'no context'}

Respond with JSON exactly like this:
{
  "signal_type": "job_opportunity" | "client_lead" | "partnership" | "irrelevant" | "unknown",
  "urgency": 1-5,
  "deal_value": "fractional_engagement" | "full_time_role" | "product_user" | "unknown",
  "one_line_summary": "one sentence max, specific and actionable"
}

Urgency scale:
5 = Reply within hours — hot lead, explicit budget/timeline, or interview invite
4 = Reply today — strong interest, clear context, founder/decision-maker
3 = Reply this week — moderate interest, needs nurturing
2 = Monitor — passive signal, no clear intent yet
1 = Low — generic, no useful signal`;
}

/**
 * Claude when Groq rejects (413 TPM) or times out — same JSON contract.
 */
async function classifyLeadAnthropic(
  lead: LeadInput,
  prompt: string,
  anthropic: Anthropic
): Promise<TriageResult> {
  const response = await anthropic.messages.create({
    model: TRIAGE_FALLBACK_MODEL,
    max_tokens: 350,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw =
    response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
  const parsed = parseTriageJson(raw) || defaultTriage();
  parsed.urgency = Math.max(1, Math.min(5, Math.round(parsed.urgency || 1)));
  parsed.signal_type = parsed.signal_type || 'unknown';
  parsed.deal_value = parsed.deal_value || 'unknown';
  parsed.one_line_summary = (parsed.one_line_summary || 'No summary').substring(0, 500);
  return parsed;
}

/**
 * Classify a single lead using Groq (fast, free).
 * Falls back to Claude Haiku if Groq fails (rate limit / request too large).
 * Refines urgency ≥4 with Claude Sonnet when context exists.
 */
async function classifyLead(
  lead: LeadInput,
  groq: Groq,
  anthropic: Anthropic
): Promise<TriageResult> {
  const contextShort = truncateTriageContext(lead.context);
  const prompt = buildTriagePrompt(lead, contextShort);

  let parsed: TriageResult;

  // Skip Groq: env override, no key, or daily limit already hit this cycle
  const skipGroq = !!process.env.TRIAGE_SKIP_GROQ || !process.env.GROQ_API_KEY?.trim() || !!_groqDailyLimitHit;
  if (skipGroq) {
    console.log(`🎯 [triage] Using Claude Haiku (${process.env.TRIAGE_SKIP_GROQ ? 'TRIAGE_SKIP_GROQ' : !process.env.GROQ_API_KEY?.trim() ? 'no GROQ key' : 'Groq daily limit hit'})`);
    try {
      parsed = await classifyLeadAnthropic(lead, prompt, anthropic);
    } catch (e: any) {
      console.error('🎯 [triage] Haiku fallback failed:', String(e?.message || e).slice(0, 200));
      return defaultTriage();
    }
  } else {
    try {
      const groqResponse = await groq.chat.completions.create(
        {
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 220,
          temperature: 0.1,
        },
        { timeout: 12_000, maxRetries: 0 }
      );
      const raw = groqResponse.choices[0]?.message?.content?.trim() || '{}';
      parsed = parseTriageJson(raw) || defaultTriage();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('Rate limit')) {
        _groqDailyLimitHit = true;
        console.warn('🎯 [triage] Groq daily limit hit — switching all remaining leads to Claude Haiku');
      } else {
        console.warn(`🎯 [triage] Groq error, fallback to Haiku:`, msg.slice(0, 160));
      }
      try {
        parsed = await classifyLeadAnthropic(lead, prompt, anthropic);
      } catch (e2: any) {
        console.error('🎯 [triage] Claude fallback failed:', String(e2?.message || e2).slice(0, 200));
        return defaultTriage();
      }
    }
  }

  // Refine high-urgency leads with Claude Sonnet (short context only)
  if (parsed.urgency >= 4 && contextShort) {
    try {
      const refineCtx = truncateTriageContext(lead.context).slice(0, 2500);
      const refined = await claudeWithGroqFallback(
        anthropic, CLAUDE_MODEL, 150, null,
        `Refine this lead summary to be maximally actionable in one sentence.
Context: ${refineCtx}
Current summary: ${parsed.one_line_summary}
Name: ${lead.name}, Source: ${lead.utm_source || lead.source_table}
Reply with ONLY the improved one-sentence summary, nothing else.`,
        'lead-triage/refine',
      );
      if (refined.trim()) parsed.one_line_summary = refined.trim().substring(0, 500);
    } catch {
      // Keep prior summary
    }
  }

  parsed.urgency = Math.max(1, Math.min(5, Math.round(parsed.urgency || 1)));
  parsed.signal_type = parsed.signal_type || 'unknown';
  parsed.deal_value = parsed.deal_value || 'unknown';
  parsed.one_line_summary = (parsed.one_line_summary || 'No summary').substring(0, 500);
  return parsed;
}

function defaultTriage(): TriageResult {
  return { signal_type: 'unknown', urgency: 1, deal_value: 'unknown', one_line_summary: 'Classification failed — review manually' };
}

/**
 * Run a full triage cycle:
 * 1. Pull untriaged business_leads + replied outreach
 * 2. Classify each with Groq (+ Claude for urgent)
 * 3. Save to lead_triage
 * 4. Log to agent_outcomes
 */
/** Non-secret status for `/leads/triage-status` and startup logs. */
export function getPhase5TriageStatus(): {
  groq: boolean;
  anthropic: boolean;
  ready: boolean;
  digestChatConfigured: boolean;
  triageSecretConfigured: boolean;
  cron: string;
} {
  const groq = !!process.env.GROQ_API_KEY?.trim();
  const anthropic = !!process.env.ANTHROPIC_API_KEY?.trim();
  return {
    groq,
    anthropic,
    ready: anthropic,
    digestChatConfigured: !!process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID?.trim(),
    triageSecretConfigured: !!process.env.LEAD_TRIAGE_SECRET?.trim(),
    cron: process.env.TRIAGE_CRON || '0 8 * * *',
  };
}

export async function runTriageCycle(groq: Groq, anthropic: Anthropic): Promise<{
  processed: number;
  urgent: number;
  summary: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('🎯 [triage] ANTHROPIC_API_KEY missing — cannot classify (set in .env, pm2 restart)');
    return {
      processed: 0,
      urgent: 0,
      summary: 'Triage inactive: add ANTHROPIC_API_KEY to ~/cto-aipa/.env and restart PM2.',
    };
  }

  _groqDailyLimitHit = false; // Reset for this cycle
  const maxBiz = Math.min(80, Math.max(5, parseInt(process.env.TRIAGE_MAX_BUSINESS_LEADS || '20', 10) || 20));
  const maxOut = Math.min(40, Math.max(3, parseInt(process.env.TRIAGE_MAX_OUTREACH || '10', 10) || 10));
  const maxProspects = Math.min(50, Math.max(5, parseInt(process.env.TRIAGE_MAX_PROSPECTS || '30', 10) || 30));

  // Sequential queries to avoid concurrent Oracle connection issues
  console.log('🎯 [triage] Querying untriaged leads...');
  const rawLeads = await getUntriagedLeads(maxBiz);
  console.log(`🎯 [triage] Raw leads: ${rawLeads.length}`);
  const repliedOutreach = await getRepliedOutreach(maxOut);
  console.log(`🎯 [triage] Replied outreach: ${repliedOutreach.length}`);
  // NEW: fresh prospects from HN / GitHub / Product Hunt ingestion
  const freshProspects = await getUntriagedOutreachTargets(maxProspects);
  console.log(`🎯 [triage] Fresh outreach_targets: ${freshProspects.length}`);

  const inputs: LeadInput[] = [
    ...(rawLeads as any[]).map((r: any) => ({
      id: r[0],
      source_table: 'business_leads' as const,
      name: r[1] || '',
      email: r[2] || '',
      context: r[3] || '',
      utm_source: r[4] || '',
    })),
    ...(repliedOutreach as any[]).map((r: any) => ({
      id: r[0],
      source_table: 'outreach_log' as const,
      name: r[1] || '',
      email: r[2] || '',
      context: `Replied to outreach. Subject: ${r[3] || ''}. Reply: ${r[4] || ''}`,
      utm_source: 'outreach',
    })),
    // r[0]=id, r[1]=name, r[2]=company, r[3]=email, r[4]=source,
    // r[5]=pain_point, r[6]=matched_system, r[7]=status, r[8]=email_status
    ...(freshProspects as any[]).map((r: any) => ({
      id: r[0],
      source_table: 'outreach_targets' as const,
      name: r[2] || r[1] || '',      // company name as primary display name
      email: r[3] || '',
      context: [
        r[5] ? `Pain point: ${r[5]}` : '',
        r[6] ? `Matched AIdeazz system: ${r[6]}` : '',
        r[4] ? `Source: ${r[4]}` : '',
      ].filter(Boolean).join('. '),
      utm_source: r[4] || 'fresh_leads',
    })),
  ];

  if (inputs.length === 0) {
    return { processed: 0, urgent: 0, summary: 'No new signals to triage.' };
  }

  let processed = 0;
  let urgent = 0;

  for (let i = 0; i < inputs.length; i++) {
    const lead = inputs[i]!;
    try {
      if (i > 0 && TRIAGE_INTER_LEAD_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, TRIAGE_INTER_LEAD_DELAY_MS));
      }
      console.log(`🎯 [triage] Classifying lead ${i + 1}/${inputs.length}: ${lead.name || lead.id}`);
      let result: TriageResult;
      try {
        result = await classifyLead(lead, groq, anthropic);
      } catch (classifyErr: any) {
        console.error(`🎯 [triage] classifyLead crashed for ${lead.id}:`, String(classifyErr?.message || classifyErr).slice(0, 200));
        result = defaultTriage();
      }
      await saveTriagedLead({
        source_table: lead.source_table,
        source_ref_id: lead.id,
        signal_type: result.signal_type,
        urgency: result.urgency,
        deal_value: result.deal_value,
        one_line_summary: result.one_line_summary,
        raw_context: lead.context,
        source_name: lead.name,
        source_email: lead.email,
      });

      // Push qualified leads to HubSpot
      // Gates:
      //  - Never test/demo entries
      //  - business_leads / outreach_log: need real email + urgency ≥ 3 + right signal type
      //  - outreach_targets (fresh prospects): push by company name alone — HubSpot can
      //    hold Company + Deal without a contact email. Email added if verified.
      const isTestEntry = /^e2e|^test|^demo|^sample|^fake/i.test(lead.name || '');
      const hasRealEmail = !!(lead.email && !lead.email.startsWith('founder@') && lead.email.includes('@'));
      const isFreshProspect = lead.source_table === 'outreach_targets';
      const urgencyBar = isFreshProspect ? 2 : 3;
      // Fresh prospects: company name alone is enough identifier for HubSpot
      const hasIdentifier = isFreshProspect ? lead.name.trim().length > 0 : hasRealEmail;
      const hsEligible =
        !isTestEntry &&
        hasIdentifier &&
        result.urgency >= urgencyBar &&
        (result.signal_type === 'client_lead' || result.signal_type === 'partnership' ||
         (isFreshProspect && result.signal_type !== 'irrelevant'));

      if (hsEligible) {
        const hsStage = result.urgency >= 4 ? HS_STAGES.engaged
                      : result.urgency >= 3 ? HS_STAGES.contacted
                      : HS_STAGES.prospected;
        // UPSERT: find existing deal by name (created by fresh-leads-ingest 1h earlier)
        // and update its stage instead of creating a duplicate. Falls back to create-new
        // if no match. Was creating 1 dup per company per cron run.
        const companyForDeal = isFreshProspect ? lead.name : undefined;
        const dealName = companyForDeal
          ? `${companyForDeal} — outreach`
          : `${lead.name || 'Unknown'} — outreach`;
        (async () => {
          try {
            const { findDealByName, updateDeal } = await import('./hubspot-client');
            const existing = await findDealByName(dealName);
            if (existing) {
              await updateDeal(existing.id, {
                stage: hsStage,
                description: `Pain point: ${result.one_line_summary}\nSource: ${lead.utm_source || lead.source_table}`,
              });
              console.log(`[triage→HS] UPDATED existing deal ${existing.id} (${dealName})`);
              try {
                const { markLeadTriagePushed } = await import('./database');
                await markLeadTriagePushed(lead.id);
              } catch (e: any) {
                console.warn('[triage→HS] mark pushed failed (non-fatal):', e?.message || e);
              }
            } else {
              await pushLeadToHubSpot({
      sourcePrefix: 'CLIENT-CTO-INGEST',
                name:      lead.name || 'Unknown',
                company:   companyForDeal,
                email:     hasRealEmail ? lead.email : undefined,
                source:    lead.utm_source || lead.source_table,
                painPoint: result.one_line_summary,
                stage:     hsStage,
              });
            }
            // May 24 2026: mark lead_triage row as pushed so future daily briefs skip it
            // (HubSpot becomes source of truth for 'what to act on'). Fire-and-forget.
            try {
              const { markLeadTriagePushed } = await import('./database');
              await markLeadTriagePushed(lead.id);
            } catch (e: any) {
              console.warn('[triage→HS] mark pushed failed (non-fatal):', e?.message || e);
            }
          } catch (e: any) {
            console.warn('[triage→HS] push failed:', e?.message || e);
          }
        })();
      }

      processed++;
      if (result.urgency >= 4) urgent++;
      console.log(`🎯 [triage] Lead ${i + 1} done: urgency=${result.urgency} type=${result.signal_type}`);
    } catch (err: any) {
      console.error(`🎯 [triage] Failed for lead ${lead.id}:`, String(err?.message || err).slice(0, 200));
    }
  }

  const fromBiz = inputs.filter(i => i.source_table === 'business_leads').length;
  const fromProspects = inputs.filter(i => i.source_table === 'outreach_targets').length;
  const fromReplies = inputs.filter(i => i.source_table === 'outreach_log').length;
  const summary = `Triaged ${processed} signals. Urgent (4-5): ${urgent}.\nSources: ${fromBiz} form leads · ${fromProspects} fresh prospects · ${fromReplies} outreach replies`;

  // Log to agent_outcomes per WIRING_CONDUCTOR
  await saveAgentOutcome('lead_triage', 'triage_cycle', {
    processed,
    urgent,
    sources: inputs.length,
  }, processed > 0 ? 'verified_delivered' : 'pending_verification');

  return { processed, urgent, summary };
}

/**
 * Build the Telegram daily brief message.
 * Called by cron at 08:00 America/Panama.
 */
/** Names that indicate test / demo entries — never show in the live brief. */
const TEST_NAMES = new Set([
  'e2e','e2e2','typo','tytjyt','katarinar','hope','kate',
  'irina','maya','katya','marina','katerina','test','demo',
  'sample','fake','elena revicheva',
]);

function isTestRow(r: any): boolean {
  const name = String(r[8] || r[1] || '').toLowerCase().trim();
  return TEST_NAMES.has(name) || /^(e2e|test|demo|sample|fake)/i.test(name);
}

// MAY 25 2026 (later): freshness buckets — NEW / ACTIVE / AGING
// Groups HubSpot actionable deals by recency so each day's brief surfaces
// what's NEW today separately from what's still in play vs what's aging.
// Without buckets, the same 10 deals can show identically for a week and
// the operator stops reading the message.
function renderDealBuckets(deals: Array<{ dealname: string; stage: string; lastModified: string }>): { section: string; counts: { newToday: number; active: number; aging: number } } {
  const stageHint = (stage: string): string =>
    stage === 'qualifiedtobuy' ? '🔥' :
    stage === 'contractsent'   ? '💬' :
    stage.includes('recruiter') ? '🎯' :
    stage.includes('interview') ? '📅' :
    stage.includes('offer')     ? '🏆' : '•';

  const HOUR = 60 * 60 * 1000;
  const DAY  = 24 * HOUR;
  const now = Date.now();

  type Bucket = 'new' | 'active' | 'aging';
  const buckets: Record<Bucket, Array<{ line: string; days: number }>> = { new: [], active: [], aging: [] };

  for (const d of deals) {
    const t = d.lastModified ? new Date(d.lastModified).getTime() : 0;
    const ageMs = t > 0 && Number.isFinite(t) ? now - t : -1;
    const days = ageMs >= 0 ? Math.floor(ageMs / DAY) : -1;
    let bucket: Bucket;
    if (days < 0) bucket = 'aging'; // unknown freshness -> conservative
    else if (ageMs <= DAY) bucket = 'new';
    else if (days <= 7) bucket = 'active';
    else bucket = 'aging';

    const ageLabel =
      days < 0 ? '' :
      days === 0 ? (ageMs <= HOUR ? `${Math.max(1, Math.floor(ageMs / 60_000))}m ago` : `${Math.floor(ageMs / HOUR)}h ago`) :
      `${days}d`;
    const line = `  ${stageHint(d.stage)} ${d.dealname}${ageLabel ? ' — ' + ageLabel : ''}`;
    buckets[bucket].push({ line, days });
  }

  // Sort each bucket: newest first
  buckets.new.sort((a, b) => a.days - b.days);
  buckets.active.sort((a, b) => a.days - b.days);
  buckets.aging.sort((a, b) => a.days - b.days);

  const parts: string[] = [];
  if (buckets.new.length > 0) {
    parts.push(`🆕 NEW today (${buckets.new.length}) — fresh in last 24h:`);
    parts.push(buckets.new.slice(0, 6).map(b => b.line).join('\n'));
  }
  if (buckets.active.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(`🔥 ACTIVE (${buckets.active.length}) — modified 1-7 days ago:`);
    parts.push(buckets.active.slice(0, 6).map(b => b.line).join('\n'));
  }
  if (buckets.aging.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(`⏰ AGING (${buckets.aging.length}) — >7d untouched, close or remove:`);
    parts.push(buckets.aging.slice(0, 4).map(b => b.line).join('\n'));
  }

  return {
    section: parts.join('\n'),
    counts: { newToday: buckets.new.length, active: buckets.active.length, aging: buckets.aging.length },
  };
}

export async function buildDailyBrief(): Promise<string | null> {
  const leads = await getTriagedLeads(undefined, 100);
  // Filter out test/demo entries that slipped in from form testing
  const rows = (leads as any[]).filter(r => !isTestRow(r));

  // MAY 25 2026: HubSpot-enriched brief — return null when nothing actionable.
  // Old behavior sent "No real signals yet" every day to the operator. Bad noise.
  // New behavior: ALWAYS check HubSpot for actionable deals (since lead activity
  // flows there now via May 24 response_detector + crm-event wiring). Only send
  // the Telegram brief if EITHER (a) there are Oracle triage signals, or
  // (b) HubSpot has actionable deals. On a truly quiet day, return null and
  // the caller suppresses the send entirely.
  // Limit 25 so we have enough deals to bucket meaningfully across freshness tiers.
  const actionableDeals = await getActionableHubSpotDeals({ limit: 25 }).catch(() => []);

  if (rows.length === 0 && actionableDeals.length === 0) {
    console.log('📥 Lead Brief: 0 Oracle signals + 0 HubSpot actionable deals — Telegram SUPPRESSED');
    return null;
  }

  // If we ONLY have HubSpot deals (no Oracle signals), surface those:
  if (rows.length === 0 && actionableDeals.length > 0) {
    const { section, counts } = renderDealBuckets(actionableDeals);
    return [
      `📥 Lead Brief — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      ``,
      `🎯 HubSpot deals needing action (${actionableDeals.length} total: ${counts.newToday} new, ${counts.active} active, ${counts.aging} aging):`,
      section,
      ``,
      `(No new Oracle triage signals — leads flow to HubSpot via May 24 wiring.)`,
      `/triage — re-run triage  |  /leads — full list`,
    ].join('\n');
  }

  const urgent = rows.filter((r: any) => r[4] >= 4);    // urgency
  const thisWeek = rows.filter((r: any) => r[4] === 3);
  const monitor = rows.filter((r: any) => r[4] <= 2);

  const top = urgent[0] || thisWeek[0];
  const topLine = top
    ? `Top: ${top[8] || 'unknown'} (${top[1]}) — ${top[7]}`
    : 'No top priority today.';

  const urgentList = urgent.slice(0, 3).map((r: any) =>
    `  • ${r[8] || 'unknown'}: ${(r[7] || '').substring(0, 80)}`
  ).join('\n');

  // Always append HubSpot actionable deals section if any present — bucketed by freshness.
  let hsSection = '';
  if (actionableDeals.length > 0) {
    const { section, counts } = renderDealBuckets(actionableDeals);
    hsSection = `\n\n🎯 HubSpot deals needing action (${actionableDeals.length} total: ${counts.newToday} new, ${counts.active} active, ${counts.aging} aging):\n${section}`;
  }

  return [
    `📥 Lead Brief — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
    ``,
    `🔴 Act Today: ${urgent.length}`,
    urgent.length > 0 ? urgentList : '',
    `🟡 This Week: ${thisWeek.length}`,
    `⚪ Monitor: ${monitor.length}`,
    ``,
    topLine,
    hsSection,
    ``,
    `/triage — run triage now`,
    `/leads — full lead list`,
  ].filter(l => l !== undefined).join('\n');
}

function escapeHtmlLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Google Places imports — same page as triage, different table (`outreach_targets`). */
function renderPlacesPipelineSection(snap: PlacesPipelineSnapshot): string {
  const rows = snap.recent
    .map(r => {
      const when = r.createdAt
        ? new Date(r.createdAt).toLocaleString('en-US', { timeZone: 'America/Panama' })
        : '—';
      return `<tr><td style="padding:8px;border-bottom:1px solid #334155;">${escapeHtmlLite(r.label)}</td><td style="padding:8px;border-bottom:1px solid #334155;font-size:11px;color:#94a3b8;">${escapeHtmlLite(r.source)}</td><td style="padding:8px;border-bottom:1px solid #334155;font-size:12px;color:#cbd5e1;">${escapeHtmlLite(when)}</td></tr>`;
    })
    .join('');
  return `
    <div style="background:#0c4a6e;border:1px solid #0ea5e9;border-radius:12px;padding:16px;margin-bottom:24px;">
      <h2 style="color:#38bdf8;font-size:16px;margin:0 0 8px;">📍 Google Places → outreach pipeline</h2>
      <p style="color:#94a3b8;font-size:12px;margin:0 0 12px;line-height:1.5;">
        Shown from <code style="color:#7dd3fc;">outreach_targets</code> where <code>source</code> starts with <code>places_</code> (not the AI triage queue).
        Updated every time you open this page. Run <code>/places_ingest</code> or cron to add rows. When cold email gets replies, triage can pick them up below.
      </p>
      <p style="color:#e2e8f0;font-size:13px;margin-bottom:12px;">
        <strong>${snap.totalFromPlaces}</strong> total from Places · <strong>${snap.importedLast24h}</strong> last 24h · <strong>${snap.importedLast7d}</strong> last 7 days
      </p>
      ${
        snap.recent.length === 0
          ? '<p style="color:#64748b;font-size:13px;">No Places imports yet.</p>'
          : `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr><th style="text-align:left;padding:8px;color:#94a3b8;">Company / label</th><th style="text-align:left;padding:8px;color:#94a3b8;">source</th><th style="text-align:left;padding:8px;color:#94a3b8;">Imported (Panama)</th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>`;
}

/**
 * Build the HTML dashboard for /leads/dashboard
 * Server-rendered, password protected via query param
 */
export async function buildDashboardHtml(): Promise<string> {
  const [leads, placesSnap] = await Promise.all([
    getTriagedLeads(undefined, 100),
    getPlacesPipelineSnapshot(),
  ]);
  const rows = leads as any[];

  const urgent = rows.filter((r: any) => r[4] >= 4);
  const thisWeek = rows.filter((r: any) => r[4] === 3);
  const monitor = rows.filter((r: any) => r[4] <= 2);

  const renderCard = (r: any) => {
    const urgency = r[4] || 1;
    const signal = r[3] || 'unknown';
    const summary = r[7] || 'No summary';
    const name = r[8] || 'Unknown';
    const email = r[9] || '';
    const source = r[1] || '';
    const createdAt = r[10] ? new Date(r[10]).toLocaleDateString('en-US') : '';
    const color = urgency >= 4 ? '#ef4444' : urgency === 3 ? '#f59e0b' : '#6b7280';
    const badge = urgency >= 4 ? '🔴' : urgency === 3 ? '🟡' : '⚪';
    return `
    <div style="background:#1e1b4b;border:1px solid ${color}40;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:18px;">${badge}</span>
        <span style="font-weight:600;color:#e2e8f0;">${name}</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:auto;">${source} · ${createdAt}</span>
      </div>
      <p style="color:#cbd5e1;font-size:14px;margin:0 0 8px;">${summary}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${color}20;color:${color};">${signal}</span>
        ${email ? `<a href="mailto:${email}" style="font-size:11px;color:#a78bfa;">${email}</a>` : ''}
      </div>
    </div>`;
  };

  const section = (title: string, items: any[], color: string) => items.length === 0 ? '' : `
    <h2 style="color:${color};font-size:16px;margin:24px 0 12px;">${title} (${items.length})</h2>
    ${items.map(renderCard).join('')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>AIdeazz Lead Triage Dashboard</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;background:#0f0a1e;color:#e2e8f0;padding:24px;}a{color:#a78bfa;}</style>
</head>
<body>
  <div style="max-width:700px;margin:0 auto;">
    <div style="margin-bottom:24px;">
      <h1 style="font-size:22px;background:linear-gradient(to right,#a78bfa,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
        AIdeazz Lead Triage
      </h1>
      <p style="color:#64748b;font-size:13px;margin-top:4px;">
        ${rows.length} signals · ${urgent.length} urgent · ${thisWeek.length} this week · ${monitor.length} monitoring
        · updated ${new Date().toLocaleString('en-US', { timeZone: 'America/Panama' })} Panama
      </p>
    </div>
    ${renderPlacesPipelineSection(placesSnap)}
    ${section('🔴 Act Today', urgent, '#ef4444')}
    ${section('🟡 This Week', thisWeek, '#f59e0b')}
    ${section('⚪ Monitor', monitor, '#6b7280')}
    ${rows.length === 0 ? '<p style="color:#64748b;text-align:center;padding:48px 0;">No triaged leads yet. Run /triage on Telegram.</p>' : ''}
    <p style="text-align:center;color:#374151;font-size:11px;margin-top:32px;">AIdeazz · aideazz.xyz · Phase 5 Lead Triage</p>
  </div>
</body>
</html>`;
}
