/**
 * Phase 4 — Founder Cold Email Pipeline
 *
 * Target import, Claude-powered personalized email generation,
 * Resend sending with daily cap, and Telegram notifications.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import {
  saveOutreachTargetsBulk,
  updateOutreachTargetStatus,
  getOutreachTargets,
  saveOutreachEmail,
  markOutreachSent,
  markOutreachReply,
  getOutreachSentToday,
  getOutreachStats,
  getOutreachDrafts,
  getFirstOutreachSendDate,
  getPendingLeads,
  updateTargetEmail,
} from './database';

// May 24 2026 — surgical pre-filter to silence Resend 422 noise.
// fresh-leads-ingest creates leads with name='Founder @ {company}'. When
// email is also bogus (e.g. 'Founder @ X@X', missing TLD, spaces in local part),
// Resend rejects with 422 and pollutes the daily Phase 4 summary. Skip them.
function isBogusOutreachEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const s = email.trim();
  if (s.length < 6) return true;
  // Pattern that fresh-leads sometimes leaves: 'Founder @ X' or 'X @ X@X'
  if (/^founder\s*@/i.test(s)) return true;
  if (/\s/.test(s)) return true;                       // any whitespace = invalid
  if (s.endsWith('.') || s.startsWith('.')) return true; // trailing/leading dot
  // RFC-ish minimal check (matches the existing verify regex)
  if (!/^[\w.+\-]+@[\w\-]+\.[a-zA-Z][\w.]{1,}$/.test(s)) return true;
  return false;
}

import { getResendApiKey } from './marketing-notify';

// ---------------------------------------------------------------------------
// AIdeazz production systems — used in personalization to map pain → solution
// ---------------------------------------------------------------------------
const AIDEAZZ_SYSTEMS: Array<{
  name: string;
  description: string;
  painKeywords: string[];
}> = [
  {
    name: 'CTO AIPA',
    description: 'AI Technical Co-Founder — automated code review, architecture guidance, deployment orchestration across 10 repos',
    painKeywords: ['code review', 'technical debt', 'architecture', 'deployment', 'devops', 'engineering management'],
  },
  {
    name: 'CMO AIPA',
    description: 'AI Marketing Co-Founder — SEO/GEO content, UTM attribution, lead triage, cold outreach pipeline',
    painKeywords: ['marketing', 'seo', 'content', 'lead generation', 'outreach', 'growth'],
  },
  {
    name: 'VibeJobHunter',
    description: 'Autonomous job search system — processes 3000+ listings/hour, auto-applies with tailored resumes',
    painKeywords: ['recruiting', 'hiring', 'talent', 'hr', 'job matching', 'staffing'],
  },
  {
    name: 'EspaLuz',
    description: 'AI Spanish tutor on WhatsApp — conversational language learning with streak tracking and payments',
    painKeywords: ['education', 'language', 'learning', 'edtech', 'whatsapp bot', 'tutoring'],
  },
  {
    name: 'Multi-Model Router',
    description: '76% Groq / 24% Claude routing — $0/month inference cost with quality preservation',
    painKeywords: ['llm costs', 'ai costs', 'model routing', 'inference', 'api costs', 'optimization'],
  },
  {
    name: 'Oracle Always-Free Stack',
    description: '9 AI agents running on Oracle Cloud free tier at $0/month — ARM VM, autonomous DB, full production',
    painKeywords: ['infrastructure', 'cloud costs', 'hosting', 'scaling', 'devops', 'zero cost'],
  },
  {
    name: 'Telegram Bot Ecosystem',
    description: '5 Telegram bots for business operations — CTO, CMO, Creative AI, EspaLuz, monitoring',
    painKeywords: ['automation', 'notifications', 'bot', 'chat', 'operations', 'workflow'],
  },
  {
    name: 'Atuona Creative AI',
    description: 'AI Creative Co-Founder — poetry generation, image creation, video with Claude Opus 4 + Flux + Luma',
    painKeywords: ['creative', 'content creation', 'visual', 'video', 'art', 'generative ai'],
  },
  {
    name: 'Daily Blog Auto-Publisher',
    description: 'Daily AI-generated technical articles with SEO/GEO optimization — fully automated blog pipeline',
    painKeywords: ['blog', 'content marketing', 'thought leadership', 'publishing', 'seo content'],
  },
];

// ---------------------------------------------------------------------------
// Target import (manual JSON array or single target)
// ---------------------------------------------------------------------------

export interface OutreachTargetInput {
  name: string;
  company?: string;
  email?: string;
  linkedinUrl?: string;
  source?: string;
  painPoint?: string;
}

export async function importTargets(
  targets: OutreachTargetInput[]
): Promise<{ imported: number; ids: string[] }> {
  if (targets.length === 0) return { imported: 0, ids: [] };
  const rows = targets.map((t) => {
    const matchedSystem = matchPainToSystem(t.painPoint || t.company || '');
    return {
      name: t.name,
      company: t.company || null,
      email: t.email || null,
      emailStatus: t.email ? 'unverified' : 'missing',
      linkedinUrl: t.linkedinUrl || null,
      source: t.source || 'manual',
      painPoint: t.painPoint || null,
      matchedSystem,
    };
  });
  return saveOutreachTargetsBulk(rows);
}

function matchPainToSystem(text: string): string {
  const lower = text.toLowerCase();
  let bestName = AIDEAZZ_SYSTEMS[0]!.name;
  let bestScore = 0;
  for (const sys of AIDEAZZ_SYSTEMS) {
    const score = sys.painKeywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestName = sys.name;
    }
  }
  return bestName;
}

// ---------------------------------------------------------------------------
// Hunter.io — free tier: 25 searches + 50 verifications + 25 finders / month
// ---------------------------------------------------------------------------

export async function hunterDomainSearch(domain: string, limit = 5): Promise<{
  emails: Array<{ email: string; name: string; position: string; confidence: number }>;
  found: number;
}> {
  const apiKey = process.env.HUNTER_API_KEY?.trim();
  if (!apiKey) return { emails: [], found: 0 };
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}&api_key=${apiKey}`
    );
    if (!r.ok) {
      console.error('Hunter.io domain-search HTTP', r.status);
      return { emails: [], found: 0 };
    }
    const data = (await r.json()) as { data: { emails: any[] } };
    const priorityTitles = ['founder', 'ceo', 'cto', 'vp', 'director', 'head', 'co-founder'];
    const emails = (data.data.emails || []).map((e: any) => ({
      email: e.value as string,
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      position: (e.position || '') as string,
      confidence: (e.confidence || 0) as number,
    }));
    emails.sort((a: { position: string }, b: { position: string }) => {
      const aP = priorityTitles.findIndex((t) => a.position.toLowerCase().includes(t));
      const bP = priorityTitles.findIndex((t) => b.position.toLowerCase().includes(t));
      return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
    });
    return { emails, found: emails.length };
  } catch (e) {
    console.error('Hunter.io domain-search error:', e);
    return { emails: [], found: 0 };
  }
}

export async function hunterEmailFinder(
  domain: string,
  firstName: string,
  lastName: string
): Promise<{ email: string | null; score: number }> {
  const apiKey = process.env.HUNTER_API_KEY?.trim();
  if (!apiKey) return { email: null, score: 0 };
  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });
    const r = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    if (!r.ok) {
      console.error('Hunter.io email-finder HTTP', r.status);
      return { email: null, score: 0 };
    }
    const data = (await r.json()) as { data: { email: string; score: number } };
    const score = data.data.score || 0;
    return { email: score >= 60 ? data.data.email : null, score };
  } catch (e) {
    console.error('Hunter.io email-finder error:', e);
    return { email: null, score: 0 };
  }
}

// ---------------------------------------------------------------------------
// Hunter.io email verification (optional — skipped if HUNTER_API_KEY not set)
// ---------------------------------------------------------------------------

export async function verifyEmailHunter(email: string): Promise<{
  status: 'valid' | 'invalid' | 'accept_all' | 'unknown';
  score?: number;
}> {
  const apiKey = process.env.HUNTER_API_KEY?.trim();
  if (!apiKey) {
    return { status: 'unknown' };
  }
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`
    );
    if (!r.ok) {
      console.error('Hunter.io verify HTTP', r.status);
      return { status: 'unknown' };
    }
    const data = (await r.json()) as {
      data: { result: string; score: number };
    };
    const result = data.data.result as string;
    const status =
      result === 'deliverable'
        ? 'valid'
        : result === 'risky'
          ? 'accept_all'
          : result === 'undeliverable'
            ? 'invalid'
            : 'unknown';
    return { status, score: data.data.score };
  } catch (e) {
    console.error('Hunter.io verify error:', e);
    return { status: 'unknown' };
  }
}

export async function verifyTargetEmails(): Promise<{
  verified: number;
  invalid: number;
}> {
  const targets = await getOutreachTargets({ status: 'new' });
  let verified = 0;
  let invalid = 0;
  for (const row of targets) {
    const email = (row as any[])[3] as string | null;
    const targetId = (row as any[])[0] as string;
    if (!email) continue;
    // Skip obviously invalid emails (package versions, numeric TLDs, etc.)
    if (!/^[\w.+\-]+@[\w\-]+\.[a-zA-Z][\w.]{1,}$/.test(email)) {
      await updateOutreachTargetStatus(targetId, 'invalid_email', 'invalid');
      invalid++;
      continue;
    }
    const result = await verifyEmailHunter(email);
    if (result.status === 'invalid') {
      await updateOutreachTargetStatus(targetId, 'invalid_email', 'invalid');
      invalid++;
    } else {
      // 'valid', 'accept_all', OR 'unknown' (Hunter free tier can't verify all)
      // — proceed to send; bounces are acceptable over silent non-delivery
      await updateOutreachTargetStatus(targetId, 'verified', result.status);
      verified++;
    }
  }
  return { verified, invalid };
}

// ---------------------------------------------------------------------------
// Personalized email generation via Claude
// ---------------------------------------------------------------------------

export async function generateOutreachEmail(
  anthropic: Anthropic,
  target: {
    targetId: string;
    name: string;
    company: string;
    email: string;
    painPoint?: string;
    matchedSystem?: string;
  }
): Promise<{ subject: string; body: string; emailId: string | null } | null> {
  const system = AIDEAZZ_SYSTEMS.find((s) => s.name === target.matchedSystem) ?? AIDEAZZ_SYSTEMS[0]!;

  const prompt = `You are writing a cold email from Elena Revicheva, founder of AIdeazz — an AI consultancy that builds and runs 9 production AI agents at $0/month infrastructure cost.

Target: ${target.name} at ${target.company}
Their likely pain point: ${target.painPoint || 'general operations/automation'}
AIdeazz system to reference: ${system.name} — ${system.description}

Write a personalized cold email with these constraints:
1. Subject line: specific to their company, no buzzwords, no clickbait
2. 3 paragraphs max
3. NO links in the first email
4. End with: "If this is relevant, reply and I'll send you a short demo of how the wiring works."
5. Tone: direct, technical, founder-to-founder
6. Reference something specific about their company or industry
7. Map their pain to ONE of our production systems

Return ONLY valid JSON: {"subject": "...", "body": "..."}
The body should use plain text with \\n for line breaks.`;

  const maxRetries = 3;
  const retryCodes = new Set([529, 503, 429]);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: process.env.OUTREACH_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const firstBlock = response.content[0];
      const text = firstBlock && 'text' in firstBlock ? firstBlock.text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('outreach: Claude returned non-JSON:', text.slice(0, 200));
        return null;
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        subject: string;
        body: string;
      };

      const emailId = await saveOutreachEmail({
        targetId: target.targetId,
        subject: parsed.subject,
        body: parsed.body,
        status: 'draft',
      });

      return { subject: parsed.subject, body: parsed.body, emailId };
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode;
      if (retryCodes.has(status) && attempt < maxRetries - 1) {
        const wait = 2000 * (attempt + 1);
        console.warn(`outreach: Claude ${status} (attempt ${attempt + 1}/${maxRetries}), retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('outreach: email generation error:', e);
      return null;
    }
  }
  return null;
}

export async function generateBatchDrafts(
  anthropic: Anthropic,
  limit: number = 5
): Promise<{ generated: number; drafts: Array<{ targetId: string; subject: string }> }> {
  // Pick verified targets first, then 'new' ones that have an email
  const verified = await getOutreachTargets({ status: 'verified' });
  const fresh = await getOutreachTargets({ status: 'new' });
  const targets = [
    ...verified.filter((row: any[]) => !isBogusOutreachEmail(row[3])),
    ...fresh.filter((row: any[]) => row[3] && !isBogusOutreachEmail(row[3])),
  ];
  const drafts: Array<{ targetId: string; subject: string }> = [];
  const cap = Math.min(limit, targets.length);

  for (let i = 0; i < cap; i++) {
    const row = targets[i] as any[];
    const [id, name, company, email, , , , painPoint, matchedSystem] = row;
    const result = await generateOutreachEmail(anthropic, {
      targetId: id,
      name: name || 'Founder',
      company: company || 'Unknown',
      email: email || '',
      painPoint: painPoint || undefined,
      matchedSystem: matchedSystem || undefined,
    });
    if (result) {
      await updateOutreachTargetStatus(id, 'draft_ready');
      drafts.push({ targetId: id, subject: result.subject });
    }
  }
  return { generated: drafts.length, drafts };
}

// ---------------------------------------------------------------------------
// Warmup ramp — protects sending domain reputation
// Starts at OUTREACH_WARMUP_BASE (default 3), adds OUTREACH_WARMUP_INCREMENT
// (default 2) each week, up to OUTREACH_DAILY_CAP (default 10).
// Set OUTREACH_WARMUP_ENABLED=false to disable (flat cap).
// ---------------------------------------------------------------------------

const DAILY_CAP_MAX = Number(process.env.OUTREACH_DAILY_CAP || 10);
const WARMUP_BASE = Number(process.env.OUTREACH_WARMUP_BASE || 3);
const WARMUP_INCREMENT = Number(process.env.OUTREACH_WARMUP_INCREMENT || 2);
const WARMUP_ENABLED = (process.env.OUTREACH_WARMUP_ENABLED ?? 'true') !== 'false';

export async function getWarmupDailyCap(): Promise<number> {
  if (!WARMUP_ENABLED) return DAILY_CAP_MAX;
  try {
    const firstSend = await getFirstOutreachSendDate();
    if (!firstSend) {
      // No sends yet — start at warmup base
      return WARMUP_BASE;
    }
    const daysSinceFirst = Math.floor((Date.now() - firstSend.getTime()) / 86_400_000);
    const week = Math.floor(daysSinceFirst / 7); // 0-indexed week
    const cap = WARMUP_BASE + week * WARMUP_INCREMENT;
    return Math.min(cap, DAILY_CAP_MAX);
  } catch {
    return WARMUP_BASE; // safe fallback
  }
}

// ---------------------------------------------------------------------------
// Send via Resend with warmup-aware daily cap
// ---------------------------------------------------------------------------

/** @deprecated Use getWarmupDailyCap() for the effective cap. Left for backward compat. */
const DAILY_CAP = DAILY_CAP_MAX;

export async function sendOutreachEmail(params: {
  emailId: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string; resendId?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  const sentToday = await getOutreachSentToday();
  const effectiveCap = await getWarmupDailyCap();
  if (sentToday >= effectiveCap) {
    return { sent: false, reason: `Daily cap reached (${sentToday}/${effectiveCap} — warmup week)` };
  }

  const from = process.env.OUTREACH_FROM?.trim() || process.env.MARKETING_INQUIRY_FROM?.trim() || 'AIdeazz <elena@aideazz.xyz>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.toEmail],
        subject: params.subject,
        text: params.body,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('outreach: Resend error', r.status, t);
      return { sent: false, reason: `Resend ${r.status}: ${t.slice(0, 200)}` };
    }

    let resendId: string | undefined;
    try {
      const j = (await r.json()) as { id?: string };
      resendId = j?.id;
      console.log(`[outreach] Resend accepted id=${resendId ?? '(no id in body)'}`);
    } catch {
      console.warn('[outreach] Resend 200 but body was not JSON — still attempting DB mark sent');
    }

    const marked = await markOutreachSent(params.emailId);
    if (!marked) {
      return {
        sent: false,
        reason:
          'Resend accepted but outreach_log was not updated (check email row id / Oracle)',
      };
    }
    return resendId ? { sent: true, resendId } : { sent: true };
  } catch (e) {
    console.error('outreach: send error', e);
    return { sent: false, reason: String(e) };
  }
}

export async function sendApprovedDrafts(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
  autoMarkedInvalid: number;
}> {
  const drafts = await getOutreachDrafts();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  // MAY 25 2026 FIX: pre-send bogus filter + 422-auto-mark-invalid
  // Bogus drafts (e.g. "katex@0.16.9" — npm version captured as email)
  // were retrying every cron forever, polluting the daily Phase 4 summary.
  // Two-layer fix: (1) skip + auto-mark invalid_email on bogus; (2) on
  // Resend 422 (invalid `to` format), auto-mark invalid_email so it never
  // retries. getOutreachDrafts (database.ts) also excludes invalid_email
  // targets at query time so this is belt-and-suspenders.
  let autoMarkedInvalid = 0;
  for (const row of drafts) {
    const [emailId, targetId, subject, body, , name, company, email] =
      row as any[];
    if (!email) {
      skipped++;
      continue;
    }

    // Layer 1: pre-send bogus filter
    if (isBogusOutreachEmail(email)) {
      await updateOutreachTargetStatus(targetId, 'invalid_email', 'bogus_format');
      await markOutreachDraftStatus(emailId, 'rejected_bogus_email');
      autoMarkedInvalid++;
      console.warn(`[outreach] auto-marked bogus draft invalid: ${name} / ${company} / ${email}`);
      continue;
    }

    const result = await sendOutreachEmail({
      emailId,
      toEmail: email,
      subject,
      body,
    });

    if (result.sent) {
      sent++;
      await updateOutreachTargetStatus(targetId, 'emailed');
    } else {
      if (result.reason?.includes('Daily cap')) break;

      // Layer 2: Resend 422 = invalid email format. Auto-mark so we don't retry.
      const is422InvalidFormat = result.reason?.includes('422') &&
        (result.reason?.toLowerCase().includes('invalid') || result.reason?.toLowerCase().includes('to'));
      if (is422InvalidFormat) {
        await updateOutreachTargetStatus(targetId, 'invalid_email', 'rejected_by_resend_422');
        await markOutreachDraftStatus(emailId, 'rejected_by_resend_422');
        autoMarkedInvalid++;
        console.warn(`[outreach] Resend 422 auto-marked invalid: ${name} / ${company} / ${email}`);
        continue;
      }

      errors.push(`${name}@${company}: ${result.reason}`);
    }
  }
  return { sent, skipped, errors, autoMarkedInvalid };
}

// ---------------------------------------------------------------------------
// Fully automatic daily outreach cycle
// ---------------------------------------------------------------------------

export async function runDailyOutreachCycle(
  anthropic: Anthropic,
  sendTelegram?: (msg: string) => Promise<void>
): Promise<void> {
  const tag = 'outreach-auto';
  console.log(`[${tag}] Daily outreach cycle starting…`);

  try {
    // Step 0: verify any 'new' targets → moves them to 'verified' or 'invalid_email'
    const verify = await verifyTargetEmails();
    console.log(`[${tag}] Verified ${verify.verified} targets, rejected ${verify.invalid}`);

    // Step 1: generate drafts for verified + new-with-email targets
    const gen = await generateBatchDrafts(anthropic, 10);
    console.log(`[${tag}] Generated ${gen.generated} drafts`);

    // Step 2: immediately send all drafts
    const send = await sendApprovedDrafts();
    console.log(`[${tag}] Sent ${send.sent}, skipped ${send.skipped}, errors ${send.errors.length}`);

    // Step 3: get stats for Telegram summary
    const stats = await getOutreachStats();
    const resendConfigured = Boolean(getResendApiKey());
    const warmupCap = await getWarmupDailyCap();

    const lines = [
      `Phase 4 — client outreach (honest summary)`,
      resendConfigured ? `Resend: configured` : `Resend: NOT configured — no real sends (set RESEND_API_KEY or RESEND_KEY)`,
      WARMUP_ENABLED ? `Warmup ramp: ENABLED (cap today=${warmupCap}/${DAILY_CAP_MAX})` : `Warmup ramp: disabled (flat cap ${DAILY_CAP_MAX})`,
      ``,
      `Targets verified: ${verify.verified}, invalid: ${verify.invalid}`,
      `Draft rows created (Claude): ${gen.generated}`,
      `Emails accepted by Resend + DB: ${send.sent}`,
      send.skipped ? `Skipped (no address on target): ${send.skipped}` : '',
      send.autoMarkedInvalid ? `Auto-marked invalid (bogus or Resend 422): ${send.autoMarkedInvalid} — won't retry` : '',
      send.errors.length ? `Send failures: ${send.errors.join('; ')}` : '',
      gen.generated > 0 && send.sent === 0 && resendConfigured
        ? `Note: drafts exist but 0 sends — check errors above or daily cap.`
        : '',
      ``,
      `Pipeline: ${stats.total_targets} targets, ${stats.total_sent} total sent ever`,
      `Today: ${stats.sent_today} of ${warmupCap} cap — reply rate ${stats.reply_rate}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (sendTelegram) {
      await sendTelegram(lines);
    }
  } catch (e) {
    console.error(`[${tag}] Cycle error:`, e);
    if (sendTelegram) {
      await sendTelegram(`Outreach cycle failed: ${String(e).slice(0, 400)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Telegram notification helpers
// ---------------------------------------------------------------------------

// Re-export DB helpers so callers only need to import from outreach
export { getPendingLeads, updateTargetEmail } from './database';
import { markOutreachDraftStatus } from './database';

export function formatOutreachStatsMessage(stats: Awaited<ReturnType<typeof getOutreachStats>>): string {
  return [
    `Outreach pipeline`,
    `Targets: ${stats.total_targets}`,
    `Sent: ${stats.total_sent} (today ${stats.sent_today} of ${DAILY_CAP} cap)`,
    `Replies: ${stats.total_replies}`,
    `Reply rate: ${stats.reply_rate}`,
  ].join('\n');
}

export function formatDraftPreview(
  drafts: Array<{ name: string; company: string; subject: string; body: string }>
): string {
  if (drafts.length === 0) return 'No drafts pending.';
  return drafts
    .map(
      (d, i) =>
        `*${i + 1}. ${d.name} (${d.company})*\n` +
        `Subject: ${d.subject}\n` +
        `Preview: ${d.body.slice(0, 120)}…`
    )
    .join('\n\n');
}
