/**
 * Phase 4 — Founder Cold Email Pipeline
 *
 * Target import, Claude-powered personalized email generation,
 * Resend sending with daily cap, and Telegram notifications.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import {
  saveOutreachTarget,
  updateOutreachTargetStatus,
  getOutreachTargets,
  saveOutreachEmail,
  markOutreachSent,
  markOutreachReply,
  getOutreachSentToday,
  getOutreachStats,
  getOutreachDrafts,
} from './database';
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
    description: 'AI Technical Co-Founder — automated code review, architecture guidance, deployment orchestration across 11 repos',
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
    name: 'Hashnode Auto-Publisher',
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
  const ids: string[] = [];
  for (const t of targets) {
    const matchedSystem = matchPainToSystem(t.painPoint || t.company || '');
    const target: Parameters<typeof saveOutreachTarget>[0] = {
      name: t.name,
      emailStatus: t.email ? 'unverified' : 'missing',
      source: t.source || 'manual',
      matchedSystem,
    };
    if (t.company) target.company = t.company;
    if (t.email) target.email = t.email;
    if (t.linkedinUrl) target.linkedinUrl = t.linkedinUrl;
    if (t.painPoint) target.painPoint = t.painPoint;
    const id = await saveOutreachTarget(target);
    if (id) ids.push(id);
  }
  return { imported: ids.length, ids };
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
    ...verified,
    ...fresh.filter((row: any[]) => row[3]),  // row[3] = email column
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
// Send via Resend with daily cap
// ---------------------------------------------------------------------------

const DAILY_CAP = Number(process.env.OUTREACH_DAILY_CAP || 10);

export async function sendOutreachEmail(params: {
  emailId: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  const sentToday = await getOutreachSentToday();
  if (sentToday >= DAILY_CAP) {
    return { sent: false, reason: `Daily cap reached (${sentToday}/${DAILY_CAP})` };
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

    await markOutreachSent(params.emailId);
    return { sent: true };
  } catch (e) {
    console.error('outreach: send error', e);
    return { sent: false, reason: String(e) };
  }
}

export async function sendApprovedDrafts(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const drafts = await getOutreachDrafts();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of drafts) {
    const [emailId, targetId, subject, body, , name, company, email] =
      row as any[];
    if (!email) {
      skipped++;
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
      errors.push(`${name}@${company}: ${result.reason}`);
    }
  }
  return { sent, skipped, errors };
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

    const lines = [
      `📧 *Daily Outreach Cycle Complete*`,
      ``,
      `Drafts generated: ${gen.generated}`,
      `Emails sent: ${send.sent}`,
      send.skipped ? `Skipped (no email): ${send.skipped}` : '',
      send.errors.length ? `Errors: ${send.errors.join(', ')}` : '',
      ``,
      `Pipeline: ${stats.total_targets} targets, ${stats.total_sent} total sent, ${stats.sent_today}/${DAILY_CAP} today`,
      `Reply rate: ${stats.reply_rate}`,
    ].filter(Boolean).join('\n');

    if (sendTelegram) {
      await sendTelegram(lines);
    }
  } catch (e) {
    console.error(`[${tag}] Cycle error:`, e);
    if (sendTelegram) {
      await sendTelegram(`❌ Outreach cycle failed: ${String(e).slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Telegram notification helpers
// ---------------------------------------------------------------------------

export function formatOutreachStatsMessage(stats: Awaited<ReturnType<typeof getOutreachStats>>): string {
  return [
    `📧 *Outreach Pipeline*`,
    `Targets: ${stats.total_targets}`,
    `Sent: ${stats.total_sent} (today: ${stats.sent_today}/${DAILY_CAP})`,
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
