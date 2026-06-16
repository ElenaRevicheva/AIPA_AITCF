import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import {
  initializeDatabase,
  saveMemory,
  getRelevantMemory,
  saveAgentOutcome,
  upsertEspaluzUser,
  saveLead,
  saveMarketingInquiry,
  getOutreachTargets,
  getOutreachStats,
  getOutreachDrafts,
  markOutreachReply,
  getRecentContentLogs,
} from './database';
import { initTelegramBot, sendTelegramBroadcast } from './telegram-bot';
import { initAtuonaBot } from './atuona-creative-ai';
import { filmsOutDir, listFilms } from './atuona-film-compiler';
import {
  startDailyBlogPublisher,
  runDailyBlogPost,
  DAILY_BLOG_TOPIC_BRIEFS,
  dailyBlogIsDelisted,
} from './daily-blog-publisher';
import { getOrCreateSpanishBundle, readCachedSpanishMeta } from './blog-es-bundle';
import { startMarketingWeeklyDigest, runWeeklyMarketingDigest } from './marketing-weekly-digest';
import {
  getResendApiKey,
  scheduleMarketingInquiryEmails,
  verifyRecaptchaV3Token,
} from './marketing-notify';
import {
  importTargets,
  verifyTargetEmails,
  generateBatchDrafts,
  sendApprovedDrafts,
  sendOutreachEmail,
  runDailyOutreachCycle,
  formatOutreachStatsMessage,
  formatDraftPreview,
} from './outreach';
import { runProspectIngestion } from './prospect-ingest';
import { runSerpProspects } from './serpapi-prospects';
import { runPlacesIngestion, INDUSTRY_PRESETS } from './prospect-places';
import { runDocIngestion } from './doc-ingest';
import { runTriageCycle, buildDailyBrief, buildDashboardHtml, getPhase5TriageStatus } from './lead-triage';
import { runSprintBriefing, deliverBriefingToTelegram } from './sprint-briefing/run';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Octokit } from '@octokit/rest';
import * as cron from 'node-cron';

dotenv.config({ override: true });

// Prevent unhandled errors from crashing PM2 cluster worker
process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ Unhandled rejection (caught):', String(reason?.message || reason).slice(0, 300));
});
process.on('uncaughtException', (err: Error) => {
  console.error('⚠️ Uncaught exception (caught):', err.message?.slice(0, 300));
  // Don't exit — PM2 will restart on crash, but we want to survive recoverable errors
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const githubToken = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || '')
  .replace(/^['"]|['"]$/g, '')
  .trim();
const octokit = new Octokit({ auth: githubToken || undefined });

// =============================================================================
// AI MODEL CONFIGURATION - Change models via environment variables!
// =============================================================================

// Groq rate-limit cooldown (May 24 2026): when Groq 429s, skip it for 60s.
// Avoids spamming the same 429 over and over. After cooldown, retry normally.
let groqCooldownUntil = 0;
const GROQ_COOLDOWN_MS = 60_000;

const AI_MODELS = {
  // For critical reviews (security, payments, complex architecture)
  critical: process.env.CRITICAL_MODEL || 'claude-opus-4-8',
  
  // For Ask CTO strategic questions
  strategic: process.env.STRATEGIC_MODEL || 'claude-opus-4-8',
  
  // For standard code reviews (fast)
  standard: process.env.STANDARD_MODEL || 'llama-3.3-70b-versatile',
  
  // Max tokens for responses
  maxTokens: parseInt(process.env.MAX_TOKENS || '8192', 10)
};

console.log('🤖 AI Models configured:');
console.log(`   Critical reviews: ${AI_MODELS.critical}`);
console.log(`   Strategic (Ask CTO): ${AI_MODELS.strategic}`);
console.log(`   Standard reviews: ${AI_MODELS.standard}`);

const _p5 = getPhase5TriageStatus();
const _gk = process.env.GROQ_API_KEY?.trim()?.length ?? 0;
const _ak = process.env.ANTHROPIC_API_KEY?.trim()?.length ?? 0;
console.log(
  `🎯 Phase 5 triage: ANTHROPIC_API_KEY ${_ak > 0 ? `set (${_ak} chars)` : 'MISSING'} · GROQ_API_KEY ${_gk > 0 ? `set (${_gk} chars)` : 'MISSING'} · ready=${_p5.ready} · cron ${_p5.cron}`
);

/** When Groq 429/rate-limit would crash the cluster worker, fall back to Haiku (same pattern as lead-triage). */
const CODE_REVIEW_FALLBACK_MODEL =
  process.env.CODE_REVIEW_FALLBACK_MODEL || 'claude-haiku-4-5-20251001';

async function anthropicTextReview(model: string, prompt: string, maxTokens: number): Promise<string> {
  // claude-haiku-4-5 supports up to 8192 output tokens
  const effectiveMax = model.includes('haiku') ? Math.min(maxTokens, 8192) : maxTokens;
  const response = await anthropic.messages.create({
    model,
    max_tokens: effectiveMax,
    messages: [{ role: 'user', content: prompt }],
  });
  const firstContent = response.content[0];
  return firstContent && firstContent.type === 'text' ? firstContent.text : '';
}

// =============================================================================
// AIdeazz ECOSYSTEM CONTEXT - CTO AIPA knows the entire startup
// =============================================================================

const AIDEAZZ_CONTEXT = `
You are CTO AIPA, the AI Technical Co-Founder of AIdeazz - a startup built by Elena Revicheva.

ABOUT ELENA:
- Ex-CEO who relocated to Panama in 2022
- Self-taught "vibe coder" using AI tools (Cursor AI Agents)
- Built 11 AI products in 10 months, solo, under $15K
- Philosophy: "The AI is the vehicle. I am the architect."

THE AIDEAZZ ECOSYSTEM (11 repositories you oversee):

1. AIPA_AITCF (You - CTO AIPA)
   - AI Technical Co-Founder running on Oracle Cloud
   - Reviews code, provides technical guidance
   - Tech: TypeScript, Node.js, Express, Oracle ATP

2. VibeJobHunterAIPA_AIMCF (CMO AIPA - Your Partner)
   - AI Marketing Co-Founder + Autonomous Job Hunter
   - Posts to LinkedIn daily, handles job applications
   - Tech: Python, FastAPI, Railway, Claude API
   - You coordinate with CMO for tech announcements

3. EspaLuzWhatsApp
   - AI Spanish Tutor WhatsApp Bot (Revenue-generating!)
   - Emotionally intelligent language learning
   - Tech: Node.js, WhatsApp Business API, GPT-4, MongoDB

4. EspaLuz_Influencer
   - Marketing/Influencer component of EspaLuz

5. EspaLuzFamilybot
   - Family-focused version of EspaLuz

6. aideazz (Main Website)
   - AI Agents Web3 Showroom at aideazz.com
   - Tech: React, TypeScript, Vite, Tailwind

7. dragontrade-agent
   - DragonTrade Web3 Trading Assistant
   - Crypto trading analysis

8. atuona
   - NFT Gallery on IPFS
   - Decentralized art showcase

9. ascent-saas-builder
   - SaaS builder tool

10. aideazz-private-docs
    - Pitch decks, private documentation

11. aideazz-pitch-deck
    - Investor pitch materials

YOUR ROLE AS CTO:
- Review ALL code changes (commits AND pull requests)
- Provide strategic technical guidance
- Help Elena learn coding concepts as you review
- Coordinate with CMO AIPA for announcements
- Think like a co-founder, not just a reviewer
- Be proactive with suggestions
- Remember: Elena is learning, so explain things clearly

YOUR PERSONALITY:
- Supportive but honest
- Strategic thinker
- Patient teacher
- Celebrates wins
- Direct about problems
`;

// =============================================================================
// INTERFACES
// =============================================================================

interface CodeReviewRequest {
  repo: string;
  pr_number?: number;
  commit_sha?: string;
  diff: string;
  title: string;
  useClaudeForCritical?: boolean;
}

interface SecurityIssue {
  type: string;
  severity: 'high' | 'medium' | 'low';
  line: string;
  description: string;
}

interface AskCTORequest {
  question: string;
  context?: string | undefined;
  repo?: string | undefined;
}

// =============================================================================
// CMO INTEGRATION
// =============================================================================

// Store pending updates for CMO (when webhook is unavailable)
const pendingCMOUpdates: Array<{
  timestamp: string;
  pr_number?: number;
  commit_sha?: string;
  repo: string;
  title: string;
  description: string;
  type: string;
  security_issues: number;
  complexity_issues: number;
}> = [];

// =============================================================================
// CREATIVE AI COLLABORATION BRIDGE - Tech Milestones Only
// =============================================================================

// Notable tech achievements worth announcing (reputation-building, not daily ops)
export interface TechMilestone {
  timestamp: string;
  type: 'milestone' | 'innovation' | 'integration' | 'launch';
  title: string;
  description: string;
  metrics?: {
    pagesCreated?: number;
    videosGenerated?: number;
    nftsMinted?: number;
  };
  techStack?: string[];
}

const techMilestones: TechMilestone[] = [];

// Only notify CMO about NOTABLE tech achievements (not daily operations)
// Called manually or on significant milestones
export async function notifyTechMilestone(milestone: Omit<TechMilestone, 'timestamp'>): Promise<boolean> {
  const milestoneWithTimestamp: TechMilestone = {
    ...milestone,
    timestamp: new Date().toISOString()
  };
  
  techMilestones.push(milestoneWithTimestamp);
  
  // Keep only last 50 milestones
  if (techMilestones.length > 50) {
    techMilestones.shift();
  }
  
  console.log(`🏆 Tech milestone: ${milestone.title}`);
  
  // Forward to CMO for LinkedIn/Instagram announcement
  try {
    const cmoNotified = await notifyCMO({
      repo: 'atuona',
      title: `🏆 ${milestone.title}`,
      description: milestone.description,
      type: 'tech_milestone',
      security_issues: 0,
      complexity_issues: 0
    });
    
    if (cmoNotified) {
      console.log(`📢 CMO notified about milestone: ${milestone.title}`);
    }
    return cmoNotified;
  } catch (error) {
    console.log(`⚠️ Failed to notify CMO about milestone: ${error}`);
    return false;
  }
}

// Get tech milestones (for manual review before CMO posts)
export function getTechMilestones(): TechMilestone[] {
  return techMilestones;
}

export async function notifyCMO(updateData: {
  pr_number?: number;
  commit_sha?: string;
  repo: string;
  title: string;
  description: string;
  type: string;
  security_issues: number;
  complexity_issues: number;
}): Promise<boolean> {
  // Store locally regardless of webhook success
  const updateWithTimestamp = {
    ...updateData,
    timestamp: new Date().toISOString()
  };
  pendingCMOUpdates.push(updateWithTimestamp);
  
  // Keep only last 50 updates in memory
  if (pendingCMOUpdates.length > 50) {
    pendingCMOUpdates.shift();
  }
  
  try {
    const CMO_WEBHOOK = process.env.CMO_WEBHOOK_URL || 'http://127.0.0.1:8080/api/tech-update';
    
    console.log(`📢 Notifying CMO AIPA about changes in ${updateData.repo}...`);
    
    const response = await fetch(CMO_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    if (response.ok) {
      const result = await response.json() as { message: string };
      console.log(`✅ CMO acknowledged: ${result.message}`);
      return true;
    } else {
      console.log(`⚠️ CMO webhook returned ${response.status} - update stored locally`);
      console.log(`   💡 CMO endpoint may need configuration. Updates available at GET /cmo-updates`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️ CMO webhook unavailable - update stored locally`);
    console.log(`   💡 Updates available at GET /cmo-updates for manual sync`);
    return false;
  }
}

// Get pending CMO updates (for manual sync or alternative integration)
function getPendingCMOUpdates() {
  return pendingCMOUpdates;
}

// =============================================================================
// CODE ANALYSIS FUNCTIONS
// =============================================================================

function analyzeSecurityIssues(diff: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = diff.split('\n');
  
  lines.forEach((line) => {
    if (line.includes('SELECT') && (line.includes('${') || line.includes('+') || line.includes('concat'))) {
      issues.push({
        type: 'SQL Injection Risk',
        severity: 'high',
        line: line.trim(),
        description: 'Potential SQL injection vulnerability. Use parameterized queries.'
      });
    }
    
    if (/(password|secret|api[_-]?key|token)\s*=\s*['"][^'"]+['"]/i.test(line)) {
      issues.push({
        type: 'Hardcoded Secret',
        severity: 'high',
        line: line.trim(),
        description: 'Hardcoded credentials detected. Use environment variables.'
      });
    }
    
    if ((line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) && !line.includes('sanitize')) {
      issues.push({
        type: 'XSS Vulnerability',
        severity: 'high',
        line: line.trim(),
        description: 'Potential XSS vulnerability. Sanitize user input before rendering.'
      });
    }
    
    if (line.includes('eval(')) {
      issues.push({
        type: 'Dangerous Function',
        severity: 'high',
        line: line.trim(),
        description: 'Use of eval() is dangerous. Consider safer alternatives.'
      });
    }
    
    if (line.includes('console.log') && line.startsWith('+')) {
      issues.push({
        type: 'Debug Code',
        severity: 'low',
        line: line.trim(),
        description: 'console.log() found. Consider removing before production.'
      });
    }
  });
  
  return issues;
}

function analyzeCodeComplexity(diff: string): string[] {
  const issues: string[] = [];
  const lines = diff.split('\n');
  
  let functionLength = 0;
  let nestingLevel = 0;
  
  lines.forEach((line) => {
    if (line.startsWith('+')) {
      if (line.includes('function') || line.includes('=>')) {
        functionLength = 0;
      }
      functionLength++;
      
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      nestingLevel += openBraces - closeBraces;
      
      if (functionLength > 50) {
        issues.push('⚠️ Function exceeds 50 lines. Consider breaking it into smaller functions.');
        functionLength = 0;
      }
      
      if (nestingLevel > 4) {
        issues.push('⚠️ Deep nesting detected (>4 levels). Consider refactoring for better readability.');
      }
    }
  });
  
  return [...new Set(issues)];
}

function detectArchitecturePatterns(diff: string): string[] {
  const patterns: string[] = [];
  
  if (diff.includes('class') && diff.includes('extends')) {
    patterns.push('✅ Object-Oriented Programming pattern detected');
  }
  
  if (diff.includes('async') && diff.includes('await')) {
    patterns.push('✅ Async/Await pattern for asynchronous operations');
  }
  
  if (diff.includes('try') && diff.includes('catch')) {
    patterns.push('✅ Proper error handling with try-catch blocks');
  }
  
  if (diff.includes('interface') || diff.includes('type')) {
    patterns.push('✅ TypeScript type definitions for type safety');
  }
  
  if (!diff.includes('catch') && diff.includes('await')) {
    patterns.push('⚠️ Missing error handling for async operations');
  }
  
  return patterns;
}

function checkPerformanceIssues(diff: string): string[] {
  const issues: string[] = [];
  
  if (diff.includes('for') && diff.includes('for')) {
    issues.push('⚠️ Nested loops detected. Consider optimizing for O(n²) complexity.');
  }
  
  if (diff.includes('.map(') && diff.includes('.filter(') && diff.includes('.map(')) {
    issues.push('⚠️ Multiple array iterations. Consider combining operations.');
  }
  
  if (diff.includes('JSON.parse(JSON.stringify(')) {
    issues.push('⚠️ Deep clone using JSON.parse/stringify is inefficient. Use structuredClone() or lodash cloneDeep().');
  }
  
  return issues;
}

// =============================================================================
// CORE REVIEW FUNCTION
// =============================================================================

async function reviewCode(request: CodeReviewRequest) {
  const identifier = request.pr_number ? `PR #${request.pr_number}` : `commit ${request.commit_sha?.substring(0, 7)}`;
  console.log(`🤖 CTO AIPA: Reviewing ${identifier} in ${request.repo}...`);

  const context = await getRelevantMemory('CTO', 'code_review', 3);
  
  const securityIssues = analyzeSecurityIssues(request.diff);
  const complexityIssues = analyzeCodeComplexity(request.diff);
  const architecturePatterns = detectArchitecturePatterns(request.diff);
  const performanceIssues = checkPerformanceIssues(request.diff);

  const hasCriticalIssues = securityIssues.some(i => i.severity === 'high') ||
                             request.diff.includes('security') ||
                             request.diff.includes('payment') ||
                             request.useClaudeForCritical;

  const analysisSummary = `
Security Issues Found: ${securityIssues.length}
${securityIssues.map(i => `- [${i.severity.toUpperCase()}] ${i.type}: ${i.description}`).join('\n')}

Code Complexity Issues: ${complexityIssues.length}
${complexityIssues.join('\n')}

Architecture Patterns: ${architecturePatterns.length}
${architecturePatterns.join('\n')}

Performance Concerns: ${performanceIssues.length}
${performanceIssues.join('\n')}
`;

  const aiPrompt = `${AIDEAZZ_CONTEXT}

You are reviewing code changes for: ${request.repo}
Change: "${request.title}"

AUTOMATED ANALYSIS RESULTS:
${analysisSummary}

CODE DIFF:
${request.diff}

PREVIOUS REVIEW CONTEXT:
${JSON.stringify(context)}

Provide a review that:
1. Addresses any critical security or architectural concerns
2. Evaluates code quality and best practices
3. Gives specific, actionable suggestions
4. Celebrates good practices and progress
5. Explains technical concepts simply (Elena is learning!)
6. Thinks strategically about how this fits the AIdeazz ecosystem

Remember: You're a co-founder, not just a reviewer. Be supportive but honest.`;

  let review: string;
  let modelUsed: string;

  if (hasCriticalIssues) {
    try {
      console.log(`🔐 Using ${AI_MODELS.critical} for critical code review...`);
      review = await anthropicTextReview(AI_MODELS.critical, aiPrompt, AI_MODELS.maxTokens);
      modelUsed = AI_MODELS.critical;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`🔐 Critical review failed, Haiku fallback: ${msg.slice(0, 220)}`);
      try {
        review = await anthropicTextReview(
          CODE_REVIEW_FALLBACK_MODEL,
          aiPrompt,
          Math.min(AI_MODELS.maxTokens, 8192)
        );
        modelUsed = `${CODE_REVIEW_FALLBACK_MODEL} (critical fallback)`;
      } catch (err2: unknown) {
        const m2 = err2 instanceof Error ? err2.message : String(err2);
        console.error(`🔐 Haiku fallback failed: ${m2.slice(0, 220)}`);
        review = `_(Review generation failed. Static analysis below.)_\n\n${analysisSummary}`;
        modelUsed = 'unavailable';
      }
    }
  } else {
    try {
      // GROQ PRE-CHECK (May 24 2026): skip Groq if prompt exceeds context limit OR in 429-cooldown.
      // Llama 3.3 70B on Groq = ~8K tokens. Pre-check at 24K chars (~6K tokens, with headroom).
      // Avoids 413 'Request too large' warnings flooding logs; goes straight to Claude.
      const GROQ_MAX_PROMPT_CHARS = 24_000;
      if (aiPrompt.length > GROQ_MAX_PROMPT_CHARS) {
        throw new Error(`pre-check: prompt too large for Groq (${aiPrompt.length} chars > ${GROQ_MAX_PROMPT_CHARS} char limit); using Claude directly`);
      }
      if (Date.now() < groqCooldownUntil) {
        const remainingSec = Math.ceil((groqCooldownUntil - Date.now()) / 1000);
        throw new Error(`pre-check: Groq in 429-cooldown for ${remainingSec}s more; using Claude directly`);
      }
      console.log(`⚡ Using ${AI_MODELS.standard} for standard code review (${aiPrompt.length} chars)...`);
      const response = await groq.chat.completions.create(
        {
          model: AI_MODELS.standard,
          messages: [{ role: 'user', content: aiPrompt }],
        },
        { timeout: 120_000, maxRetries: 0 }
      );
      review = response.choices[0]?.message?.content || '';
      modelUsed = AI_MODELS.standard;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If genuine 429 from Groq, start a 60s cooldown so next calls skip Groq.
      const is429 = msg.includes('429') || /rate ?limit/i.test(msg);
      if (is429 && !msg.startsWith('pre-check:')) {
        groqCooldownUntil = Date.now() + GROQ_COOLDOWN_MS;
        console.log(`⚡ Groq 429 hit — cooldown ${GROQ_COOLDOWN_MS / 1000}s started; using Claude Haiku fallback`);
      } else if (msg.startsWith('pre-check:')) {
        // Quiet log for the expected pre-check skip (size limit OR cooldown).
        console.log(`⚡ ${msg.slice(0, 200)}`);
      } else {
        // Genuine unexpected error — warn loudly.
        console.warn(`⚡ Groq review failed (${msg.slice(0, 160)}), using Claude Haiku fallback...`);
      }
      try {
        review = await anthropicTextReview(
          CODE_REVIEW_FALLBACK_MODEL,
          aiPrompt,
          Math.min(AI_MODELS.maxTokens, 8192)
        );
        modelUsed = `${CODE_REVIEW_FALLBACK_MODEL} (Groq fallback)`;
      } catch (err2: unknown) {
        const m2 = err2 instanceof Error ? err2.message : String(err2);
        console.error(`❌ Haiku fallback failed: ${m2.slice(0, 220)}`);
        review = `_(Automated review unavailable: ${msg.slice(0, 280)})_\n\n**Static analysis:**\n${analysisSummary}`;
        modelUsed = 'unavailable';
      }
    }
  }

  await saveMemory('CTO', 'code_review', {
    repo: request.repo,
    pr_number: request.pr_number,
    commit_sha: request.commit_sha,
    security_issues: securityIssues.length,
    complexity_issues: complexityIssues.length,
    performance_issues: performanceIssues.length
  }, review, {
    model_used: modelUsed,
    critical_issues: hasCriticalIssues,
    timestamp: new Date().toISOString()
  });

  console.log(`✅ CTO AIPA: Review complete!`);
  
  return {
    review,
    securityIssues,
    complexityIssues
  };
}

// =============================================================================
// ASK CTO - Interactive Q&A with your Tech Co-Founder
// =============================================================================

async function askCTO(request: AskCTORequest): Promise<string> {
  console.log(`💬 CTO AIPA: Answering question...`);
  console.log(`   Question: "${request.question.substring(0, 100)}..."`);

  const context = await getRelevantMemory('CTO', 'qa', 5);

  const prompt = `${AIDEAZZ_CONTEXT}

Elena is asking you a question as her Technical Co-Founder.

QUESTION: ${request.question}

${request.context ? `ADDITIONAL CONTEXT: ${request.context}` : ''}
${request.repo ? `REGARDING REPO: ${request.repo}` : ''}

PREVIOUS Q&A CONTEXT:
${JSON.stringify(context)}

Respond as a supportive technical co-founder would:
- Give clear, actionable advice
- Explain technical concepts simply
- Consider the AIdeazz ecosystem context
- Be strategic, not just tactical
- If you don't know something, say so honestly
- Suggest next steps when appropriate`;

  console.log(`🧠 Using ${AI_MODELS.strategic} for strategic thinking...`);
  const answer = await claudeWithGroqFallback(
    anthropic, AI_MODELS.strategic, AI_MODELS.maxTokens, null, prompt, 'cto-aipa/strategic-qa'
  );

  await saveMemory('CTO', 'qa', {
    question: request.question,
    repo: request.repo
  }, answer, {
    timestamp: new Date().toISOString()
  });

  console.log(`✅ CTO AIPA: Question answered!`);
  return answer;
}

// =============================================================================
// MARKETING — Phase 3 UTM / aideazz inquiry (CORS for static site → server proxy)
// =============================================================================

const MARKETING_AIDEAZZ_ORIGINS = new Set([
  'https://aideazz.xyz',
  'https://www.aideazz.xyz',
  ...(process.env.MARKETING_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
]);

/** In-memory rate limit for public inquiry-proxy (browser-safe path, no Bearer). */
const inquiryProxyHits = new Map<string, number[]>();
const INQUIRY_PROXY_WINDOW_MS = 15 * 60 * 1000;
const INQUIRY_PROXY_MAX = Number(process.env.MARKETING_INQUIRY_PROXY_MAX_PER_WINDOW ?? 12);

function getMarketingClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0];
    return (first ?? xff).trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function allowInquiryProxyRate(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - INQUIRY_PROXY_WINDOW_MS;
  const prev = inquiryProxyHits.get(ip) ?? [];
  const kept = prev.filter((t) => t > windowStart);
  if (kept.length >= INQUIRY_PROXY_MAX) {
    return false;
  }
  kept.push(now);
  inquiryProxyHits.set(ip, kept);
  return true;
}

function isAllowedAideazzSiteRequest(req: Request): boolean {
  const origin = req.headers.origin;
  if (origin && MARKETING_AIDEAZZ_ORIGINS.has(origin)) {
    return true;
  }
  const referer = req.headers.referer ?? req.headers.referrer;
  if (typeof referer === 'string') {
    return (
      referer.startsWith('https://aideazz.xyz/') ||
      referer.startsWith('https://www.aideazz.xyz/') ||
      referer === 'https://aideazz.xyz' ||
      referer === 'https://www.aideazz.xyz'
    );
  }
  return false;
}

function marketingInquiryCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && MARKETING_AIDEAZZ_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

// =============================================================================
// MAIN SERVER
// =============================================================================

async function startCTOAIPA() {
  console.log('🚀 Starting CTO AIPA v3.0 - AI Technical Co-Founder...');

  // Do not block HTTP/Telegram on Oracle — wallet/TLS issues were starving both bots for minutes
  void initializeDatabase().catch((e) =>
    console.error('❌ Database init (background):', String((e as Error)?.message || e).slice(0, 400))
  );

  console.log('✅ CTO AIPA v3.0 ready (DB init in background)!');
  console.log('🧠 Ecosystem: AIdeazz (11 repositories)');
  console.log('💰 Cost: $0 (Oracle Cloud credits)');
  console.log('🔍 Features: Code Review, Push Monitoring, Ask CTO, CMO Integration');
  
  const app = express();
  app.set('trust proxy', 1); // behind nginx (webhook.aideazz.xyz → /cto/)
  app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
  
  // Health check & status
  app.get('/', (req, res) => {
    res.json({ 
      status: 'running', 
      service: 'CTO AIPA',
      version: '3.5.0',
      role: 'AI Technical Co-Founder',
      ecosystem: 'AIdeazz',
      features: [
        'Pull Request Reviews',
        'Push/Commit Monitoring (NEW!)',
        'Ask CTO Endpoint (NEW!)',
        'Security Vulnerability Scanning',
        'Code Complexity Analysis',
        'Architecture Pattern Detection',
        'Performance Issue Detection',
        'AI-Powered Reviews (Configurable Models)',
        'CMO Integration (LinkedIn Announcements)',
        'AIdeazz Ecosystem Awareness (NEW!)',
        'Telegram Bot (Chat from phone!)',
        'Daily blog article (opt-in, DAILY_BLOG_ENABLED)'
      ],
      endpoints: {
        health: 'GET /',
        webhook: 'POST /webhook/github',
        askCTO: 'POST /ask-cto',
        cmoUpdates: 'GET /cmo-updates',
        techMilestones: 'GET /tech-milestones',
        telegram: process.env.TELEGRAM_BOT_TOKEN ? 'Active' : 'Not configured'
      },
      ai_models: {
        critical_reviews: AI_MODELS.critical,
        strategic_questions: AI_MODELS.strategic,
        standard_reviews: AI_MODELS.standard,
        max_tokens: AI_MODELS.maxTokens
      },
      integrations: {
        cmo_aipa: {
          url: 'https://vibejobhunter-production.up.railway.app',
          webhook: process.env.CMO_WEBHOOK_URL || '/api/tech-update',
          pending_updates: getPendingCMOUpdates().length
        },
        creative_ai: {
          name: 'ATUONA Creative Co-Founder',
          bot: '@Atuona_AI_CCF_AIdeazz_bot',
          tech_milestones: getTechMilestones().length
        }
      },
      repos_monitored: 11,
      uptime: process.uptime()
    });
  });

  // ==========================================================================
  // CMO UPDATES ENDPOINT - For syncing with CMO AIPA
  // ==========================================================================
  
  app.get('/cmo-updates', (req, res) => {
    const updates = getPendingCMOUpdates();
    res.json({
      status: 'success',
      count: updates.length,
      updates,
      note: 'These are tech updates waiting to be synced with CMO AIPA'
    });
  });

  // ==========================================================================
  // TECH MILESTONES ENDPOINT - Notable achievements for CMO announcements
  // ==========================================================================
  
  app.get('/tech-milestones', (req, res) => {
    const milestones = getTechMilestones();
    res.json({
      status: 'success',
      count: milestones.length,
      milestones,
      note: 'Notable tech achievements ready for LinkedIn/Instagram announcements',
      summary: {
        total: milestones.length,
        innovations: milestones.filter(m => m.type === 'innovation').length,
        integrations: milestones.filter(m => m.type === 'integration').length,
        milestones: milestones.filter(m => m.type === 'milestone').length,
        launches: milestones.filter(m => m.type === 'launch').length
      }
    });
  });

  // ==========================================================================
  // DAILY BLOG — long-form article generation + publish (opt-in)
  // ==========================================================================

  app.get('/blog/daily-status', (_req, res) => {
    res.json({
      enabled: (process.env.DAILY_BLOG_ENABLED ?? process.env.HASHNODE_DAILY_ENABLED) === 'true',
      cron: (process.env.DAILY_BLOG_CRON ?? process.env.HASHNODE_DAILY_CRON) || '30 14 * * *',
      timezone: (process.env.DAILY_BLOG_TZ ?? process.env.HASHNODE_DAILY_TZ) || 'America/Panama',
      note: 'Default 14:30 Panama City (UTC-5); override DAILY_BLOG_CRON / DAILY_BLOG_TZ',
      publicFeed: !dailyBlogIsDelisted(),
      delistedNote:
        'When delisted, the publish path skips listing the post; aideazz.xyz/blog will not surface it. Default is listed.',
      topicCount: DAILY_BLOG_TOPIC_BRIEFS.length,
      manualTriggerConfigured: !!(process.env.DAILY_BLOG_TRIGGER_SECRET ?? process.env.HASHNODE_DAILY_TRIGGER_SECRET),
      articleModel: (process.env.DAILY_BLOG_ARTICLE_MODEL ?? process.env.HASHNODE_ARTICLE_MODEL) || AI_MODELS.strategic,
    });
  });

  app.post('/blog/daily-run', (req, res) => {
    const secret = (process.env.DAILY_BLOG_TRIGGER_SECRET ?? process.env.HASHNODE_DAILY_TRIGGER_SECRET);
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({
        error: 'Unauthorized',
        hint: 'Set HASHNODE_DAILY_TRIGGER_SECRET in .env and POST with header Authorization: Bearer <secret>',
      });
      return;
    }
    // Fire-and-forget — Opus generation takes 2-3 min, past nginx timeout.
    res.status(202).json({ ok: true, status: 'started', note: 'Generating in background — check PM2 logs in ~3 min' });
    const model = (process.env.DAILY_BLOG_ARTICLE_MODEL ?? process.env.HASHNODE_ARTICLE_MODEL) || AI_MODELS.strategic;
    const maxTok = Math.min(AI_MODELS.maxTokens, 8192);
    runDailyBlogPost({ anthropic, model, maxTokens: maxTok })
      .then(out => console.log('\U0001f4f0 [manual-run] done:', JSON.stringify(out)))
      .catch(e => console.error('\U0001f4f0 [manual-run] error:', e instanceof Error ? e.message : String(e)));
  });

  // ==========================================================================
  // MAY 25 2026 RENAME — deprecated /hashnode/* aliases (preserve any external
  // webhooks that still target the old route paths). New canonical routes are
  // /blog/daily-status and /blog/daily-run above.
  // ==========================================================================
  app.get('/hashnode/daily-status', (_req, res) => {
    res.setHeader('X-Deprecation', '/hashnode/daily-status -> /blog/daily-status');
    res.redirect(307, '/blog/daily-status');
  });
  app.post('/hashnode/daily-run', (_req, res) => {
    res.setHeader('X-Deprecation', '/hashnode/daily-run -> /blog/daily-run');
    // 307 preserves the POST method + body, so the Authorization header
    // and any payload flow through to the canonical /blog/daily-run.
    res.redirect(307, '/blog/daily-run');
  });

  // ==========================================================================
  // BLOG — Spanish bundles for aideazz.xyz (cached Claude translation)
  // ==========================================================================

  const blogEsOrigins = new Set([
    'https://aideazz.xyz',
    'https://www.aideazz.xyz',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  function blogEsCors(req: Request, res: Response): void {
    const o = req.headers.origin;
    if (o && blogEsOrigins.has(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
    }
  }

  app.options('/blog/es-bundle/:slug', (req: Request, res: Response) => {
    blogEsCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  app.options('/blog/es-meta/:slug', (req: Request, res: Response) => {
    blogEsCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  app.get('/blog/es-bundle/:slug', async (req: Request, res: Response) => {
    blogEsCors(req, res);
    if (process.env.BLOG_ES_TRANSLATE_ENABLED === 'false') {
      res.status(503).json({ error: 'Spanish blog bundle disabled (BLOG_ES_TRANSLATE_ENABLED=false)' });
      return;
    }
    const raw = typeof req.params.slug === 'string' ? req.params.slug : '';
    const slug = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 180);
    if (!slug) {
      res.status(400).json({ error: 'Invalid slug' });
      return;
    }
    try {
      const bundle = await getOrCreateSpanishBundle(slug);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(bundle);
    } catch (e) {
      console.error('GET /blog/es-bundle:', e);
      const msg = e instanceof Error ? e.message : String(e);
      // NEVER leak raw provider errors (API keys hints, request ids, billing text)
      // into the public blog page — the client renders this string verbatim.
      const friendly = msg.includes('not found')
        ? 'Post not found'
        : 'Traducción temporalmente no disponible — el artículo está en inglés más abajo.';
      res.status(msg.includes('not found') ? 404 : 502).json({ error: friendly });
    }
  });

  app.get('/blog/es-meta/:slug', (req: Request, res: Response) => {
    blogEsCors(req, res);
    if (process.env.BLOG_ES_TRANSLATE_ENABLED === 'false') {
      res.status(503).json({ error: 'disabled' });
      return;
    }
    const raw = typeof req.params.slug === 'string' ? req.params.slug : '';
    const slug = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 180);
    if (!slug) {
      res.status(400).json({ error: 'Invalid slug' });
      return;
    }
    const meta = readCachedSpanishMeta(slug);
    if (!meta) {
      res.status(404).json({ error: 'not_cached' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(meta);
  });

  // ==========================================================================
  // BLOG — Published posts list (aideazz.xyz/blog + portfolio + sitemap)
  // Reads from Oracle content_log (hashnode_daily + devto_direct channels).
  // aideazz frontend calls this instead of Hashnode public GraphQL when
  // HASHNODE_ACCESS_TOKEN is absent (Dev.to-only mode).
  // ==========================================================================

  app.options('/blog/posts', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  // ── Atuona films — watch from any device (laptop or phone) ──────────────────
  // Films persist on the server. Telegram's 50MB bot limit can't deliver big ones,
  // so serve them over HTTP with Range support (mobile seeking) + a gallery page.
  // Optional gate: set ATUONA_FILMS_KEY and access with ?key=… (default: open).
  const FILMS_KEY = process.env.ATUONA_FILMS_KEY?.trim() || '';
  const filmsAuthOk = (req: Request) => !FILMS_KEY || String(req.query.key || '') === FILMS_KEY;
  const safeFilmName = (n: string) => (/^[A-Za-z0-9._-]+\.mp4$/.test(n) ? n : '');

  app.get('/films/:name', (req: Request, res: Response) => {
    if (!filmsAuthOk(req)) { res.status(401).send('Unauthorized'); return; }
    const name = safeFilmName(path.basename(req.params.name || ''));
    if (!name) { res.status(404).send('Not found'); return; }
    const file = path.join(filmsOutDir(), name);
    if (!fs.existsSync(file)) { res.status(404).send('Not found'); return; }
    const stat = fs.statSync(file);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1] as string, 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || start > end) { res.status(416).setHeader('Content-Range', `bytes */${stat.size}`); res.end(); return; }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(file).pipe(res);
    }
  });

  app.get('/films', (req: Request, res: Response) => {
    if (!filmsAuthOk(req)) { res.status(401).send('Unauthorized'); return; }
    const base = (process.env.CTO_AIPA_PUBLIC_URL || '').replace(/\/$/, '');
    const keyQ = FILMS_KEY ? `?key=${encodeURIComponent(FILMS_KEY)}` : '';
    const films = listFilms();
    const cards = films.map(f => {
      const url = `${base}/films/${encodeURIComponent(f.name)}${keyQ}`;
      const when = new Date(f.mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
      const title = f.name.replace(/\.mp4$/i, '').replace(/-\d{4}-\d{2}-\d{2}T.*$/, '').replace(/[-_]/g, ' ').trim();
      return `<div class="film"><h2>${title || f.name}</h2><div class="meta">${when} UTC · ${f.sizeMB.toFixed(1)} MB</div><video controls preload="metadata" playsinline src="${url}"></video><div><a href="${url}" download>⬇ download</a></div></div>`;
    }).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATUONA — Underground Aesthetic AI Cinema</title><link rel="icon" type="image/svg+xml" href="https://atuona.xyz/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0b0d;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif}header{padding:24px 16px;text-align:center;border-bottom:1px solid #1c1c1f}h1{margin:0;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:2.6rem;background:linear-gradient(45deg,#dc143c,#8b0000);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}.sub{color:#777;font-size:12px;margin-top:9px;letter-spacing:3px;text-transform:uppercase;font-family:'JetBrains Mono',monospace}.wrap{max-width:780px;margin:0 auto;padding:16px}.film{margin:0 0 34px}.film h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:23px;letter-spacing:.02em;margin:0 0 4px;text-transform:capitalize}.meta{color:#777;font-size:12px;margin-bottom:8px}video{width:100%;border-radius:8px;background:#000}a{color:#9ad;text-decoration:none;font-size:13px}.empty{color:#888;text-align:center;padding:48px}footer{text-align:center;color:#666;font-size:11px;letter-spacing:.06em;line-height:2;padding:34px 16px 46px;border-top:1px solid #1c1c1f;margin-top:26px}footer a{color:#8a8a90}</style></head>
<body><header><h1>ATUONA</h1><div class="sub">Underground Aesthetic AI Cinema · ${films.length} film${films.length === 1 ? '' : 's'}</div></header>
<div class="wrap">${films.length ? cards : '<div class="empty">No films yet. Run <code>/film build</code> in the bot.</div>'}</div>
<footer>A project of <strong>AIdeazz</strong> — Founder-Led AI Lab · <a href="https://aideazz.xyz">aideazz.xyz</a> · <a href="https://atuona.xyz">atuona.xyz</a><br>© 2026 AIdeazz. All rights reserved.</footer></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // JSON film list (CORS) so atuona.xyz/aifilmstudio can render players natively (no iframe).
  app.get('/films.json', (req: Request, res: Response) => {
    if (!filmsAuthOk(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    const base = (process.env.CTO_AIPA_PUBLIC_URL || '').replace(/\/$/, '');
    const keyQ = FILMS_KEY ? `?key=${encodeURIComponent(FILMS_KEY)}` : '';
    res.json(listFilms().map(f => ({
      name: f.name,
      title: f.name.replace(/\.mp4$/i, '').replace(/-\d{4}-\d{2}-\d{2}T.*$/, '').replace(/[-_]/g, ' ').trim(),
      url: `${base}/films/${encodeURIComponent(f.name)}${keyQ}`,
      sizeMB: Math.round(f.sizeMB * 10) / 10,
      when: new Date(f.mtimeMs).toISOString().slice(0, 16).replace('T', ' '),
    })));
  });

  app.get('/blog/posts', async (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      // Primary source: local blog-posts-cache.json (written at publish time, always up to date)
      const cacheFile = path.join(process.cwd(), 'data', 'blog-posts-cache.json');
      type CacheEntry = { slug: string; title: string; aideazzBlogUrl: string; publishedAt: string; devtoUrl?: string };
      let cacheEntries: CacheEntry[] = [];
      try {
        const raw = fs.readFileSync(cacheFile, 'utf8');
        const obj = JSON.parse(raw) as Record<string, CacheEntry>;
        cacheEntries = Object.values(obj).sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
      } catch { /* cache missing — fall through to Oracle */ }

      // Secondary source: Oracle content_log (may be unavailable)
      const oraclePosts: typeof cacheEntries = [];
      try {
        const logs = await getRecentContentLogs(50);
        for (const log of logs) {
          const url = log.url || '';
          const m = url.match(/aideazz\.xyz\/blog\/([^/?#]+)/);
          const slug = m?.[1]?.trim();
          if (!slug || cacheEntries.find(e => e.slug === slug)) continue; // skip duplicates
          oraclePosts.push({ slug, title: log.title, aideazzBlogUrl: url, publishedAt: String(log.created_at) });
        }
      } catch { /* Oracle unavailable — cache is sufficient */ }

      const combined = [...cacheEntries, ...oraclePosts];
      const posts = combined.map(e => ({
        title: e.title,
        slug: e.slug,
        url: e.aideazzBlogUrl || `https://aideazz.xyz/blog/${e.slug}`,
        publishedAt: e.publishedAt,
        // Cross-post link — the blog listing renders the "Also on Dev.to" badge from this.
        ...(e.devtoUrl ? { devtoUrl: e.devtoUrl } : {}),
        source: 'devto' as const,
      }));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ posts, count: posts.length });
    } catch (e) {
      console.error('GET /blog/posts:', e);
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  });


  // BLOG — English post content (by slug, from local cache)
  // Frontend falls back to this when Dev.to API is unavailable or slow.
  // ==========================================================================

  app.options("/blog/post/:slug", (req: Request, res: Response) => {
    blogEsCors(req, res);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
  });

  app.get("/blog/post/:slug", (req: Request, res: Response) => {
    blogEsCors(req, res);
    const raw = typeof req.params.slug === "string" ? req.params.slug : "";
    const slug = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 180);
    if (!slug) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    try {
      const cacheFile = path.join(process.cwd(), "data", "blog-posts-cache.json");
      type CacheEntry = { slug: string; title: string; markdown?: string; publishedAt: string; devtoUrl?: string; aideazzBlogUrl?: string };
      const obj = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Record<string, CacheEntry>;
      const entry = obj[slug];
      if (!entry || !entry.markdown?.trim()) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json({
        slug: entry.slug,
        title: entry.title,
        markdown: entry.markdown,
        publishedAt: entry.publishedAt,
        devtoUrl: entry.devtoUrl || null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  });

  // ==========================================================================
  // MARKETING — UTM inbound (aideazz.xyz contact form → Oracle business_leads)
  // ==========================================================================

  app.get('/marketing/inquiry-status', (_req, res) => {
    const base = process.env.CTO_AIPA_PUBLIC_URL?.replace(/\/$/, '') || '';
    res.json({
      ok: true,
      inquiryEndpointConfigured: !!process.env.MARKETING_INQUIRY_SECRET?.trim(),
      inquiryProxyUrl: base ? `${base}/marketing/inquiry-proxy` : null,
      emailNotifyConfigured: !!getResendApiKey(),
      captchaConfigured: !!process.env.RECAPTCHA_SECRET_KEY?.trim(),
      note:
        'Emails via Resend (RESEND_API_KEY or RESEND_KEY). Optional reCAPTCHA v3: RECAPTCHA_SECRET_KEY + aideazz VITE_RECAPTCHA_SITE_KEY.',
    });
  });

  app.options('/marketing/inquiry', marketingInquiryCors);
  app.post('/marketing/inquiry', marketingInquiryCors, async (req, res) => {
    const secret = process.env.MARKETING_INQUIRY_SECRET?.trim();
    if (!secret) {
      res.status(503).json({ error: 'Marketing inquiry endpoint not configured' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name : undefined;
    const contactEmail =
      typeof b.email === 'string' ? b.email : typeof b.contactEmail === 'string' ? b.contactEmail : undefined;
    const message = typeof b.message === 'string' ? b.message : undefined;
    const utm_source = typeof b.utm_source === 'string' ? b.utm_source : undefined;
    const utm_medium = typeof b.utm_medium === 'string' ? b.utm_medium : undefined;
    const utm_campaign = typeof b.utm_campaign === 'string' ? b.utm_campaign : undefined;
    const utm_term = typeof b.utm_term === 'string' ? b.utm_term : undefined;
    const utm_content = typeof b.utm_content === 'string' ? b.utm_content : undefined;
    const page_url = typeof b.page_url === 'string' ? b.page_url : undefined;

    if (!message?.trim() && !contactEmail?.trim() && !name?.trim()) {
      res.status(400).json({ error: 'Provide at least name, email, or message' });
      return;
    }

    const inquiry: Parameters<typeof saveMarketingInquiry>[0] = {};
    if (name) inquiry.name = name;
    if (contactEmail) inquiry.contactEmail = contactEmail;
    if (message) inquiry.message = message;
    if (utm_source) inquiry.utm_source = utm_source;
    if (utm_medium) inquiry.utm_medium = utm_medium;
    if (utm_campaign) inquiry.utm_campaign = utm_campaign;
    if (utm_term) inquiry.utm_term = utm_term;
    if (utm_content) inquiry.utm_content = utm_content;
    if (page_url) inquiry.page_url = page_url;

    const id = await saveMarketingInquiry(inquiry);
    if (!id) {
      res.status(500).json({ error: 'Failed to save inquiry' });
      return;
    }
    const emailFields: Parameters<typeof scheduleMarketingInquiryEmails>[1] = {};
    if (name !== undefined) emailFields.name = name;
    if (contactEmail !== undefined) emailFields.contactEmail = contactEmail;
    if (message !== undefined) emailFields.message = message;
    if (utm_source !== undefined) emailFields.utm_source = utm_source;
    if (utm_medium !== undefined) emailFields.utm_medium = utm_medium;
    if (utm_campaign !== undefined) emailFields.utm_campaign = utm_campaign;
    if (page_url !== undefined) emailFields.page_url = page_url;
    scheduleMarketingInquiryEmails(id, emailFields);

    // Push to HubSpot as [CLIENT] deal — hottest lead signal (person filled the form)
    setImmediate(async () => {
      try {
        const { pushLeadToHubSpot } = await import('./hubspot-client');
        const contextParts: string[] = [];
        if (message) contextParts.push(`Message: ${message}`);
        if (utm_source) contextParts.push(`Source: ${utm_source}`);
        if (page_url) contextParts.push(`Page: ${page_url}`);
        await pushLeadToHubSpot({
          name: name || contactEmail || 'Inquiry via aideazz.xyz',
          email: contactEmail || '',
          source: utm_source || 'aideazz_inquiry_form',
          painPoint: contextParts.join(' | ') || 'Direct inquiry from aideazz.xyz contact form',
          stage: 'appointmentscheduled',
        });
        console.log(`[inquiry] HubSpot [CLIENT] deal created for: ${name || contactEmail}`);
      } catch (e) {
        console.warn('[inquiry] HubSpot push non-fatal:', (e as Error).message?.slice(0, 80));
      }
    });

    res.json({ ok: true, id });
  });

  app.post('/marketing/digest-run', async (req, res) => {
    const secret = process.env.MARKETING_INQUIRY_SECRET?.trim();
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({
        error: 'Unauthorized',
        hint: 'Same secret as MARKETING_INQUIRY_SECRET — manual weekly digest test',
      });
      return;
    }
    try {
      await runWeeklyMarketingDigest();
      res.json({ ok: true });
    } catch (e) {
      console.error('marketing/digest-run:', e);
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ==========================================================================
  // PHASE 4 — OUTREACH PIPELINE (Bearer OUTREACH_SECRET)
  // ==========================================================================

  const outreachAuth = (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.OUTREACH_SECRET?.trim();
    if (!secret) { res.status(503).json({ error: 'Outreach not configured (set OUTREACH_SECRET)' }); return; }
    if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    next();
  };

  app.get('/outreach/stats', outreachAuth, async (_req, res) => {
    try {
      const stats = await getOutreachStats();
      res.json({ ok: true, ...stats });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get('/outreach/targets', outreachAuth, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      const params: { status?: string; limit?: number } = { limit };
      if (status) params.status = status;
      const targets = await getOutreachTargets(params);
      res.json({ ok: true, count: targets.length, targets });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/outreach/targets/import', outreachAuth, async (req, res) => {
    try {
      const body = req.body;
      const targets = Array.isArray(body) ? body : Array.isArray(body.targets) ? body.targets : [body];
      const result = await importTargets(targets);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/outreach/targets/verify', outreachAuth, async (_req, res) => {
    try {
      const result = await verifyTargetEmails();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Phase 4c: Google Places ingest ──────────────────────────────────────
  // POST /outreach/ingest-places { city, industry, maxResults?, clientContext?, regionCode? }
  app.post('/outreach/ingest-places', outreachAuth, async (req, res) => {
    try {
      const { city, industry, maxResults, clientContext, regionCode } = req.body as {
        city?: string;
        industry?: string;
        maxResults?: number;
        clientContext?: string;
        regionCode?: string;
      };
      if (!city || !industry) {
        res.status(400).json({ ok: false, error: 'city and industry are required' });
        return;
      }
      const placesOpts = {
        city,
        industry,
        ...(maxResults !== undefined && { maxResults }),
        ...(clientContext !== undefined && { clientContext }),
        ...(regionCode !== undefined && regionCode !== '' && { regionCode }),
      };
      const result = await runPlacesIngestion(anthropic, placesOpts);
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('outreach/ingest-places:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // GET /outreach/ingest-places/presets — return available industry presets
  app.get('/outreach/ingest-places/presets', outreachAuth, (_req, res) => {
    res.json({ ok: true, presets: INDUSTRY_PRESETS });
  });

  // ── Document → outreach ingest ───────────────────────────────────────────
  // POST /outreach/ingest-doc { text, docType?, clientContext?, maxProspects? }
  app.post('/outreach/ingest-doc', outreachAuth, async (req, res) => {
    try {
      const { text, docType, clientContext, maxProspects } = req.body as {
        text?: string; docType?: string; clientContext?: string; maxProspects?: number;
      };
      if (!text?.trim()) {
        res.status(400).json({ ok: false, error: 'text is required' });
        return;
      }
      const docOpts = { text, ...(docType !== undefined && { docType }), ...(clientContext !== undefined && { clientContext }), ...(maxProspects !== undefined && { maxProspects }) };
      const result = await runDocIngestion(anthropic, docOpts);
      res.json({ ok: true, ingested: result.ingested, skipped: result.skipped,
        errors: result.errors, prospectsFound: result.prospects.length,
        prospects: result.prospects.slice(0, 10) });
    } catch (e) {
      console.error('outreach/ingest-doc:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post('/outreach/drafts/generate', outreachAuth, async (req, res) => {
    try {
      const limit = typeof req.body.limit === 'number' ? req.body.limit : 5;
      const result = await generateBatchDrafts(anthropic, limit);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get('/outreach/drafts', outreachAuth, async (_req, res) => {
    try {
      const drafts = await getOutreachDrafts();
      res.json({ ok: true, count: drafts.length, drafts });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/outreach/send', outreachAuth, async (_req, res) => {
    try {
      const result = await sendApprovedDrafts();
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/outreach/reply', outreachAuth, async (req, res) => {
    try {
      const { emailId, snippet } = req.body as { emailId: string; snippet: string };
      if (!emailId || !snippet) { res.status(400).json({ error: 'emailId and snippet required' }); return; }
      const ok = await markOutreachReply(emailId, snippet);
      res.json({ ok });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Public form endpoint: aideazz.xyz only (Origin/Referer), honeypot, rate limit — no Bearer in browser.
  app.options('/marketing/inquiry-proxy', marketingInquiryCors);
  app.post('/marketing/inquiry-proxy', marketingInquiryCors, async (req, res) => {
    if (process.env.MARKETING_INQUIRY_PROXY_ENABLED === 'false') {
      res.status(503).json({ error: 'Public inquiry proxy disabled' });
      return;
    }
    if (!isAllowedAideazzSiteRequest(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const ip = getMarketingClientIp(req);
    if (!allowInquiryProxyRate(ip)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const b = (req.body || {}) as Record<string, unknown>;
    const hp = typeof b.company === 'string' ? b.company : '';
    if (hp.trim() !== '') {
      res.status(400).json({ error: 'Bad request' });
      return;
    }
    const recaptcha_token = typeof b.recaptcha_token === 'string' ? b.recaptcha_token : undefined;
    const captcha = await verifyRecaptchaV3Token(recaptcha_token, getMarketingClientIp(req));
    if (!captcha.ok) {
      res.status(400).json({ error: 'Verification failed', code: captcha.reason });
      return;
    }
    const name = typeof b.name === 'string' ? b.name : undefined;
    const contactEmail =
      typeof b.email === 'string' ? b.email : typeof b.contactEmail === 'string' ? b.contactEmail : undefined;
    const message = typeof b.message === 'string' ? b.message : undefined;
    const utm_source = typeof b.utm_source === 'string' ? b.utm_source : undefined;
    const utm_medium = typeof b.utm_medium === 'string' ? b.utm_medium : undefined;
    const utm_campaign = typeof b.utm_campaign === 'string' ? b.utm_campaign : undefined;
    const utm_term = typeof b.utm_term === 'string' ? b.utm_term : undefined;
    const utm_content = typeof b.utm_content === 'string' ? b.utm_content : undefined;
    const page_url = typeof b.page_url === 'string' ? b.page_url : undefined;

    if (!message?.trim() && !contactEmail?.trim() && !name?.trim()) {
      res.status(400).json({ error: 'Provide at least name, email, or message' });
      return;
    }

    const inquiry: Parameters<typeof saveMarketingInquiry>[0] = {};
    if (name) inquiry.name = name;
    if (contactEmail) inquiry.contactEmail = contactEmail;
    if (message) inquiry.message = message;
    if (utm_source) inquiry.utm_source = utm_source;
    if (utm_medium) inquiry.utm_medium = utm_medium;
    if (utm_campaign) inquiry.utm_campaign = utm_campaign;
    if (utm_term) inquiry.utm_term = utm_term;
    if (utm_content) inquiry.utm_content = utm_content;
    if (page_url) inquiry.page_url = page_url;

    const id = await saveMarketingInquiry(inquiry);
    if (!id) {
      res.status(500).json({ error: 'Failed to save inquiry' });
      return;
    }
    const proxyEmailFields: Parameters<typeof scheduleMarketingInquiryEmails>[1] = {};
    if (name !== undefined) proxyEmailFields.name = name;
    if (contactEmail !== undefined) proxyEmailFields.contactEmail = contactEmail;
    if (message !== undefined) proxyEmailFields.message = message;
    if (utm_source !== undefined) proxyEmailFields.utm_source = utm_source;
    if (utm_medium !== undefined) proxyEmailFields.utm_medium = utm_medium;
    if (utm_campaign !== undefined) proxyEmailFields.utm_campaign = utm_campaign;
    if (page_url !== undefined) proxyEmailFields.page_url = page_url;
    scheduleMarketingInquiryEmails(id, proxyEmailFields);
    res.json({ ok: true, id });
  });

  // ==========================================================================
  // ASK CTO ENDPOINT - Ask your Tech Co-Founder anything!
  // ==========================================================================
  
  app.post('/ask-cto', async (req, res) => {
    const { question, context, repo } = req.body as AskCTORequest;
    
    if (!question) {
      res.status(400).json({ error: 'Question is required' });
      return;
    }
    
    console.log(`\n💬 ========== ASK CTO ==========`);
    console.log(`   Question: ${question}`);
    
    try {
      const answer = await askCTO({ question, context, repo });
      
      res.json({
        status: 'success',
        question,
        answer,
        timestamp: new Date().toISOString(),
        from: 'CTO AIPA v3.0'
      });
    } catch (error) {
      console.error('❌ Error answering question:', error);
      res.status(500).json({ error: 'Failed to process question' });
    }
  });
  
  // ==========================================================================
  // WIRING EVENT ENDPOINT - Other agents emit events here
  // ==========================================================================

  app.post('/wiring/event', async (req, res) => {
    try {
      const { agent, action, data } = req.body;

      if (!agent || !action) {
        res.status(400).json({ error: 'Missing agent or action' });
        return;
      }

      console.log(`📡 Wiring event: ${agent} → ${action}`);

      // Route to appropriate handler based on agent + action
      if (agent === 'espaluz_whatsapp' || agent === 'espaluz_telegram') {
        const channel = agent === 'espaluz_whatsapp' ? 'whatsapp' : 'telegram';

        if (action === 'user_signup' || action === 'trial_started') {
          await upsertEspaluzUser(data?.user_id || 'unknown', channel, {
            paymentStatus: 'trial',
            trialStart: data?.timestamp ? new Date(data.timestamp) : new Date(),
            ...(data?.trial_end ? { trialEnd: new Date(data.trial_end) } : {}),
            lastActive: new Date()
          });
          await saveAgentOutcome(agent, action, data, 'verified_delivered');
          res.json({ ok: true, action: 'user_upserted_as_trial' });

        } else if (action === 'payment_received' || action === 'subscription_activated') {
          await upsertEspaluzUser(data?.user_id || data?.email || 'unknown', channel, {
            paymentStatus: 'active',
            converted: true,
            paypalSubscriptionId: data?.subscription_id || undefined,
            lastActive: new Date()
          });
          await saveAgentOutcome(agent, action, data, 'verified_delivered', { revenue: true });
          res.json({ ok: true, action: 'user_upgraded_to_paid' });

        } else if (action === 'subscription_cancelled' || action === 'subscription_suspended') {
          await upsertEspaluzUser(data?.user_id || data?.email || 'unknown', channel, {
            paymentStatus: 'cancelled',
            converted: false
          });
          await saveAgentOutcome(agent, action, data, 'verified_delivered', { churned: true });
          res.json({ ok: true, action: 'user_marked_churned' });

        } else if (action === 'lesson_sent' || action === 'message_processed') {
          // Don't upsert user for every message — just log the outcome
          await saveAgentOutcome(agent, action, {
            user_id: data?.user_id,
            lesson_type: data?.lesson_type || 'text',
            topic: data?.topic
          }, 'verified_delivered');
          res.json({ ok: true, action: 'lesson_logged' });

        } else if (action === 'trial_expired') {
          await upsertEspaluzUser(data?.user_id || 'unknown', channel, {
            paymentStatus: 'expired',
            converted: false
          });
          await saveAgentOutcome(agent, action, data, 'verified_delivered');
          res.json({ ok: true, action: 'trial_expired_logged' });

        } else {
          // Generic: just log it as an outcome
          await saveAgentOutcome(agent, action, data, 'pending_verification');
          res.json({ ok: true, action: 'generic_event_logged' });
        }

      } else if (agent === 'cmo_aipa') {
        // CMO posts, engagement tracking
        await saveAgentOutcome(agent, action, data, 'verified_delivered');
        if (action === 'lead_signal' && data?.name) {
          await saveLead(data.source || 'linkedin', data.name, data.context || '', data.signal || 'medium');
        }
        res.json({ ok: true, action: 'cmo_event_logged' });

      } else {
        // Any other agent
        await saveAgentOutcome(agent, action, data, 'pending_verification');
        res.json({ ok: true, action: 'event_logged' });
      }

    } catch (error) {
      console.error('Wiring event error:', error);
      res.status(500).json({ error: 'Failed to process event' });
    }
  });

  // GET endpoint to check wiring status
  app.get('/wiring/status', async (_req, res) => {
    res.json({
      status: 'online',
      endpoints: ['/wiring/event'],
      accepts: ['espaluz_whatsapp', 'espaluz_telegram', 'cmo_aipa', 'any_agent'],
      actions: {
        espaluz: ['user_signup', 'trial_started', 'payment_received', 'subscription_activated', 'subscription_cancelled', 'lesson_sent', 'trial_expired'],
        cmo: ['post_published', 'engagement_received', 'lead_signal'],
        generic: ['any action — logged as pending_verification']
      }
    });
  });

  // ==========================================================================
  // GITHUB WEBHOOK - Handles both PRs and Pushes
  // ==========================================================================
  
  app.post('/webhook/github', async (req, res) => {
    const event = req.headers['x-github-event'];
    
    console.log(`\n📨 ========== WEBHOOK: ${event} ==========`);
    
    // ---------- PULL REQUEST EVENTS ----------
    if (event === 'pull_request') {
      const pr = req.body.pull_request;
      const action = req.body.action;
      const repo = req.body.repository;
      
      if (action === 'opened' || action === 'synchronize') {
        console.log(`📥 New PR: #${pr.number} - ${pr.title}`);
        console.log(`   Repository: ${repo.full_name}`);
        
        res.json({ status: 'processing', type: 'pull_request', pr_number: pr.number });
        
        try {
          const [owner, repoName] = repo.full_name.split('/');
          const { data: prData } = await octokit.pulls.get({
            owner,
            repo: repoName,
            pull_number: pr.number,
            mediaType: { format: 'diff' }
          });
          
          const reviewResult = await reviewCode({
            repo: repo.full_name,
            pr_number: pr.number,
            title: pr.title,
            diff: prData as unknown as string,
            useClaudeForCritical: false
          });
          
          await octokit.issues.createComment({
            owner,
            repo: repoName,
            issue_number: pr.number,
            body: `## 🤖 CTO AIPA Code Review (v3.0 - Tech Co-Founder)\n\n${reviewResult.review}\n\n---\n*Your AI Technical Co-Founder | AIdeazz Ecosystem*`
          });
          
          console.log(`✅ Posted review on PR #${pr.number}`);

          await saveAgentOutcome('cto_aipa', 'pr_review_completed', {
            repo: repo.full_name,
            pr_number: pr.number,
            pr_title: pr.title,
            security_issues: reviewResult.securityIssues.length,
            complexity_issues: reviewResult.complexityIssues.length
          }, 'verified_delivered').catch(e => console.error('Outcome logging failed:', e));

          await notifyCMO({
            pr_number: pr.number,
            repo: repo.full_name,
            title: pr.title,
            description: `CTO reviewed PR: ${pr.title}`,
            type: reviewResult.securityIssues.length > 0 ? 'security' : 'feature',
            security_issues: reviewResult.securityIssues.length,
            complexity_issues: reviewResult.complexityIssues.length
          });
          
        } catch (error) {
          console.error(`❌ Error processing PR #${pr.number}:`, error);
        }
        
      } else {
        res.json({ status: 'ignored', action });
      }
      return;
    }
    
    // ---------- PUSH EVENTS (NEW!) ----------
    if (event === 'push') {
      const repo = req.body.repository;
      const commits = req.body.commits || [];
      const branch = req.body.ref?.replace('refs/heads/', '') || 'unknown';
      const pusher = req.body.pusher?.name || 'unknown';
      
      // Only process pushes to main/master branches
      if (branch !== 'main' && branch !== 'master') {
        console.log(`⏭️ Ignoring push to branch: ${branch}`);
        res.json({ status: 'ignored', reason: 'not main branch', branch });
        return;
      }
      
      if (commits.length === 0) {
        res.json({ status: 'ignored', reason: 'no commits' });
        return;
      }
      
      console.log(`📥 Push to ${branch}: ${commits.length} commit(s)`);
      console.log(`   Repository: ${repo.full_name}`);
      console.log(`   Pusher: ${pusher}`);
      
      res.json({ status: 'processing', type: 'push', commits: commits.length });
      
      try {
        const [owner, repoName] = repo.full_name.split('/');
        
        // Get diff for the push (compare before and after)
        const { data: comparison } = await octokit.repos.compareCommits({
          owner,
          repo: repoName,
          base: req.body.before,
          head: req.body.after,
          mediaType: { format: 'diff' }
        });
        
        const commitMessages = commits.map((c: { message: string }) => c.message).join(', ');
        
        const reviewResult = await reviewCode({
          repo: repo.full_name,
          commit_sha: req.body.after,
          title: commitMessages,
          diff: comparison as unknown as string,
          useClaudeForCritical: false
        });
        
        // Create a commit comment with the review
        await octokit.repos.createCommitComment({
          owner,
          repo: repoName,
          commit_sha: req.body.after,
          body: `## 🤖 CTO AIPA Push Review (v3.0)\n\n**Commits:** ${commitMessages}\n\n${reviewResult.review}\n\n---\n*Your AI Technical Co-Founder | AIdeazz Ecosystem*`
        });
        
        console.log(`✅ Posted review on commit ${req.body.after.substring(0, 7)}`);

        await saveAgentOutcome('cto_aipa', 'push_review_completed', {
          repo: repo.full_name,
          commit_sha: req.body.after.substring(0, 7),
          commits_count: commits.length,
          commit_messages: commitMessages.substring(0, 200),
          security_issues: reviewResult.securityIssues.length,
          complexity_issues: reviewResult.complexityIssues.length
        }, 'verified_delivered').catch(e => console.error('Outcome logging failed:', e));

        // Only notify CMO (→ X post) for genuine new features — not fixes, docs, or chores.
        // Raw commit messages are for developers, not the public audience.
        const featCommits = commits.filter((c: { message: string }) =>
          /^feat[:(]/.test(c.message) ||
          /^launch[:(]/.test(c.message) ||
          /^release[:(]/.test(c.message)
        );
        if (featCommits.length > 0) {
          const featMessages = featCommits.map((c: { message: string }) => c.message).join(', ');
          await notifyCMO({
            commit_sha: req.body.after,
            repo: repo.full_name,
            title: featMessages,
            description: featMessages,
            type: 'feature',
            security_issues: reviewResult.securityIssues.length,
            complexity_issues: reviewResult.complexityIssues.length
          });
          console.log(`📢 CMO notified — feat commit(s): ${featMessages.substring(0, 100)}`);
        } else {
          console.log(`⏭️ CMO skip — no feat: commits in this push (${commitMessages.substring(0, 80)})`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing push:`, error);
      }
      return;
    }
    
    // ---------- OTHER EVENTS ----------
    res.json({ status: 'ignored', event });
  });

  // ============================================================
  // PHASE 5 — Triage status (no secrets)
  // ============================================================
  app.get('/leads/triage-status', (_req: Request, res: Response) => {
    res.json({ ok: true, ...getPhase5TriageStatus() });
  });

  // ============================================================
  // PHASE 5 — Lead Triage Dashboard
  // GET /leads/dashboard?secret=<LEAD_TRIAGE_SECRET>
  // If secret is configured but missing/wrong: HTML unlock form (not a bare 401 — browsers often open URL without ?secret=)
  // ============================================================
  function parseDashboardSecretQuery(req: Request): string {
    const q = req.query.secret;
    if (typeof q === 'string') return q.trim();
    if (Array.isArray(q) && q[0] != null) return String(q[0]).trim();
    return '';
  }

  function sendLeadDashboardUnlockPage(res: Response, opts: { invalidAttempt: boolean }): void {
    const { invalidAttempt } = opts;
    const msg = invalidAttempt
      ? '<p style="color:#dc2626;font-size:0.95rem">That key did not match. Try again.</p>'
      : '<p style="color:#475569;font-size:0.95rem">Enter the same value as <code>LEAD_TRIAGE_SECRET</code> on the Oracle server (Settings → bookmark the URL after unlock).</p>';
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Lead triage — unlock</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:440px;margin:48px auto;padding:0 20px;color:#0f172a">
  <h1 style="font-size:1.35rem;margin-bottom:8px">Lead triage dashboard</h1>
  ${msg}
  <form method="get" action="" style="margin-top:20px">
    <label for="lead-dash-secret" style="display:block;font-weight:600;margin-bottom:8px">Dashboard key</label>
    <input id="lead-dash-secret" name="secret" type="password" autocomplete="current-password" required
      style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:1rem"/>
    <button type="submit" style="margin-top:16px;padding:10px 20px;border:0;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer">View triage</button>
  </form>
  <p style="color:#94a3b8;font-size:0.8rem;margin-top:20px">GET with <code>?secret=…</code> still works for automation.</p>
</body>
</html>`);
  }

  app.get('/leads/dashboard', async (req: Request, res: Response) => {
    const secret = process.env.LEAD_TRIAGE_SECRET?.trim();
    const provided = parseDashboardSecretQuery(req);

    if (secret) {
      if (!provided) {
        sendLeadDashboardUnlockPage(res, { invalidAttempt: false });
        return;
      }
      if (provided !== secret) {
        sendLeadDashboardUnlockPage(res, { invalidAttempt: true });
        return;
      }
    }

    try {
      const html = await buildDashboardHtml();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).send('Dashboard error — check logs');
    }
  });

  // Manual triage trigger (for Cursor agent / automation)
  // Default: 202 + background run (long Groq/Claude loops — avoids proxy/client socket hang-up).
  // Sync result in HTTP response: POST /leads/triage-run?wait=1 (can take many minutes).
  app.post('/leads/triage-run', async (req: Request, res: Response) => {
    const secret = process.env.LEAD_TRIAGE_SECRET;
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (secret && auth !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!getPhase5TriageStatus().ready) {
      res.status(503).json({
        ok: false,
        error: 'Phase 5 triage not configured — set ANTHROPIC_API_KEY in .env and pm2 restart cto-aipa',
        ...getPhase5TriageStatus(),
      });
      return;
    }
    const wait = req.query.wait === '1' || req.query.sync === '1';
    console.log(`🎯 [triage-run] Starting (background=${!wait})...`);

    const run = async () => {
      try {
        const result = await runTriageCycle(groq, anthropic);
        console.log('🎯 [triage-run] Complete:', result.processed, 'processed,', result.urgent, 'urgent');
        return result;
      } catch (err) {
        console.error('🎯 [triage-run] Error:', err);
        throw err;
      }
    };

    if (wait) {
      try {
        const result = await run();
        res.json({ ok: true, ...result });
      } catch {
        if (!res.headersSent) res.status(500).json({ error: 'Triage failed' });
      }
      return;
    }

    res.status(202).json({
      ok: true,
      accepted: true,
      message:
        'Triage running in background. Watch PM2 logs for 🎯 [triage-run] Complete, or open /leads/dashboard.',
    });
    setImmediate(() => {
      run().catch(() => undefined);
    });
  });

  // Sprint Briefing Agent (opt-in — no route unless SPRINT_BRIEFING_SECRET set; zero impact on existing stacks)
  if (process.env.SPRINT_BRIEFING_SECRET?.trim()) {
    app.post('/sprint-briefing/run', async (req: Request, res: Response) => {
      const secret = process.env.SPRINT_BRIEFING_SECRET!.trim();
      const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
      if (auth !== secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const wait = req.query.wait === '1' || req.query.sync === '1';
      const uidRaw =
        process.env.SPRINT_BRIEFING_KNOWLEDGE_USER_IDS?.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n)) ??
        [];
      const deps = {
        githubRepos: (process.env.SPRINT_BRIEFING_GITHUB_REPOS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        linearTeamId: process.env.LINEAR_TEAM_ID?.trim(),
        knowledgeUserIds: uidRaw.length ? uidRaw : undefined,
      };

      const exec = async () => {
        const result = await runSprintBriefing({ groq, anthropic, octokit }, deps);
        await deliverBriefingToTelegram(result);
        return result;
      };

      if (wait) {
        try {
          const result = await exec();
          res.json({
            ok: true,
            chars: result.narrativeText.length,
            audioBytes: result.audioMp3?.length ?? 0,
            skipped: result.audioSkippedReason,
          });
        } catch (err: unknown) {
          console.error('Sprint briefing error:', err);
          if (!res.headersSent) res.status(500).json({ error: String((err as Error)?.message || err) });
        }
        return;
      }

      res.status(202).json({
        ok: true,
        accepted: true,
        message: 'Sprint briefing running — watch Telegram and PM2 logs.',
      });
      setImmediate(() => {
        exec().catch(e => console.error('Sprint briefing background error:', e));
      });
    });
  }

  // SPRINT BRIEFING — dedup endpoints (used by Lambda Sprinter to prevent duplicate daily briefings)
  // GET /sprint-briefing/dedup-check   → { ok, alreadySent, date, lastSent }
  // POST /sprint-briefing/dedup-mark   → { ok, markedDate }
  // Panama = UTC-5; date stored as YYYY-MM-DD in knowledge_base category='sprint_dedup'
  app.get('/sprint-briefing/dedup-check', outreachAuth, async (_req: Request, res: Response) => {
    try {
      const { getKnowledgeByCategory } = await import('./database');
      type KbRow = string[];
      const rows = await getKnowledgeByCategory(1, 'sprint_dedup', 1) as KbRow[];
      const lastSent = rows?.[0]?.[3] ?? ''; // content column = stored date string
      const todayPanama = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      res.json({ ok: true, alreadySent: lastSent === todayPanama, date: todayPanama, lastSent });
    } catch (e: unknown) {
      console.error('[dedup-check] error:', e);
      res.status(500).json({ ok: false, error: String((e as Error)?.message || e) });
    }
  });

  app.post('/sprint-briefing/dedup-mark', outreachAuth, async (_req: Request, res: Response) => {
    try {
      const { saveKnowledge } = await import('./database');
      const todayPanama = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await saveKnowledge(1, 'sprint_dedup', 'last_sent', todayPanama, undefined, 'sprint_briefing', 'lambda');
      res.json({ ok: true, markedDate: todayPanama });
    } catch (e: unknown) {
      console.error('[dedup-mark] error:', e);
      res.status(500).json({ ok: false, error: String((e as Error)?.message || e) });
    }
  });

  // SPRINT BRIEFING — internal knowledge endpoint (used by Lambda Sprinter)
  // GET /sprint-knowledge?userIds=123,456  Authorization: Bearer OUTREACH_SECRET
  app.get('/sprint-knowledge', outreachAuth, async (req: Request, res: Response) => {
    try {
      const raw = String(req.query.userIds || '');
      const userIds = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
      if (!userIds.length) { res.status(400).json({ error: 'userIds required' }); return; }
      const { getKnowledgeByCategory } = await import('./database');
      // Oracle thick mode returns rows as arrays: [id, category, title, content, tags, project, source, created_at]
      // SELECT RAWTOHEX(id) as id, category, title, content, tags, project, source, created_at
      type KbRow = string[];
      const lines: string[] = ['### Personal context (Oracle knowledge_base)'];
      for (const uid of userIds) {
        const diary = await getKnowledgeByCategory(uid, 'diary', 5) as KbRow[];
        const tasks = await getKnowledgeByCategory(uid, 'task', 15) as KbRow[];
        const voiceNotes = await getKnowledgeByCategory(uid, 'voice_note', 10) as KbRow[];
        if (diary?.length) {
          lines.push(`User ${uid} recent diary:`);
          for (const row of diary) {
            const t = (row[2] || '').slice(0, 80);
            const c = (row[3] || '').slice(0, 200);
            if (t || c) lines.push(`- ${t}: ${c}`);
          }
        }
        if (tasks?.length) {
          lines.push(`User ${uid} pending tasks:`);
          for (const row of tasks) {
            const t = (row[2] || '').slice(0, 120);
            const c = (row[3] || '').slice(0, 200);
            if (t) lines.push(`- ${t}${c && c !== t ? ': ' + c : ''}`);
          }
        }
        if (voiceNotes?.length) {
          lines.push(`User ${uid} recent voice notes (from Telegram voice messages):`);
          for (const row of voiceNotes) {
            const t = (row[2] || '').slice(0, 120);
            const c = (row[3] || '').slice(0, 300);
            if (t) lines.push(`- ${t}${c && c !== t ? ': ' + c : ''}`);
          }
        }
      }
      res.json({ ok: true, context: lines.join('\n') });
    } catch (e: unknown) {
      console.error('[sprint-knowledge] error:', e);
      res.status(500).json({ error: String((e as Error)?.message || e) });
    }
  });


  // ==========================================================================
  // CRM HUB — Unified HubSpot entry point for all agents
  // ==========================================================================

  // POST /api/crm-pipeline/setup  — explains free-tier strategy (no upgrade needed)
  app.post('/api/crm-pipeline/setup', outreachAuth, (_req: Request, res: Response) => {
    res.json({
      ok: true,
      strategy: 'free-tier',
      message: 'HubSpot free plan = 1 pipeline. Using [HIRING] prefix + stage mapping instead.',
      dealNaming: '[HIRING] {jobTitle} @ {company}',
      stageMapping: {
        applied:             'Appointment Scheduled',
        recruiter_responded: 'Qualified to Buy',
        interview_scheduled: 'Presentation Scheduled',
        offer_received:      'Decision Maker Bought-In',
        accepted:            'Closed Won',
        declined:            'Closed Lost',
      },
      filterInHubSpot: 'Deals → filter by Name contains "[HIRING]"',
    });
  });

  // GET /api/crm-pipeline/ids  — reads existing pipelines from HubSpot and returns env var format
  // After creating "Hiring Pipeline" manually in HubSpot UI, call this to get the IDs.
  app.get('/api/crm-pipeline/ids', outreachAuth, async (_req: Request, res: Response) => {
    try {
      const key = process.env.HUBSPOT_API_KEY || '';
      if (!key) { res.status(500).json({ error: 'HUBSPOT_API_KEY not set' }); return; }
      const r = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) { res.status(502).json({ error: `HubSpot ${r.status}` }); return; }
      const d = await r.json() as { results: { id: string; label: string; stages: { id: string; label: string }[] }[] };
      const hiring = d.results.find(p => p.label.toLowerCase().includes('hiring'));
      if (!hiring) {
        res.status(404).json({
          error: 'No "Hiring Pipeline" found in HubSpot',
          existingPipelines: d.results.map(p => p.label),
          instructions: 'Create it in HubSpot → Settings → Objects → Deals → Pipelines',
        });
        return;
      }
      const stageLabels = ['applied','recruiter_responded','interview_scheduled','offer_received','accepted','declined'];
      const stageMap = Object.fromEntries(hiring.stages.map((s, i) => [stageLabels[i] ?? `stage_${i}`, s.id]));
      const envVars = [
        `HUBSPOT_HIRING_PIPELINE_ID=${hiring.id}`,
        `HUBSPOT_HIRING_STAGE_APPLIED=${stageMap.applied ?? ''}`,
        `HUBSPOT_HIRING_STAGE_RECRUITER_RESPONDED=${stageMap.recruiter_responded ?? ''}`,
        `HUBSPOT_HIRING_STAGE_INTERVIEW_SCHEDULED=${stageMap.interview_scheduled ?? ''}`,
        `HUBSPOT_HIRING_STAGE_OFFER_RECEIVED=${stageMap.offer_received ?? ''}`,
        `HUBSPOT_HIRING_STAGE_ACCEPTED=${stageMap.accepted ?? ''}`,
        `HUBSPOT_HIRING_STAGE_DECLINED=${stageMap.declined ?? ''}`,
      ].join('\n');
      res.json({ ok: true, pipelineId: hiring.id, stageIds: stageMap, envVars });
    } catch (e: unknown) {
      res.status(500).json({ error: String((e as Error)?.message || e) });
    }
  });

  // POST /api/crm-event  — all agents call this to write leads/deals into HubSpot
  // Auth: Bearer OUTREACH_SECRET
  // Body: { source, type, pipeline, email?, domain?, name?, context?, urgency? }
  //   source:   "vjh" | "algom_alpha" | "cmo_linkedin" | "espaluz_whatsapp" | "sprint" | "cto_aipa"
  //   type:     "application" | "prospect" | "engagement" | "inquiry" | "milestone"
  //   pipeline: "hiring" | "client"
  //   stage:    hiring → "applied"|"recruiter_responded"|"interview_scheduled"|"offer_received"|"accepted"|"declined"
  //             client → "prospected"|"contacted"|"engaged"|"negotiating"|"won"|"lost"
  app.post('/api/crm-event', outreachAuth, async (req: Request, res: Response) => {
    try {
      const {
        source, type, pipeline,
        email, domain, name, context: ctx,
        jobTitle, company, recruiterEmail, recruiterName, jobUrl,
        stage, urgency, notes, score, sourcePrefix, amount,
      } = req.body as {
        source?: string; type?: string; pipeline?: string;
        email?: string; domain?: string; name?: string; context?: string;
        jobTitle?: string; company?: string; recruiterEmail?: string; recruiterName?: string; jobUrl?: string;
        stage?: string; urgency?: number; notes?: string; score?: number;
        sourcePrefix?: string; amount?: number;
      };

      if (!source || !pipeline) {
        res.status(400).json({ error: 'source and pipeline are required' });
        return;
      }

      const {
        pushLeadToHubSpot, pushHiringDealToHubSpot, HS_STAGES,
      } = await import('./hubspot-client');

      let result: { contactId: string | null; companyId: string | null; dealId: string | null } | null = null;

      if (pipeline === 'hiring') {
        if (!jobTitle || !company) {
          res.status(400).json({ error: 'jobTitle and company required for hiring pipeline' });
          return;
        }
        result = await pushHiringDealToHubSpot({
          jobTitle,
          company,
          domain,
          recruiterEmail: recruiterEmail || email,
          recruiterName:  recruiterName  || name,
          jobUrl,
          source: source || 'VJH',
          notes,
          score:  score ?? undefined,
          stage: (stage as import('./hubspot-client').HiringStage) || 'applied',
          sourcePrefix,
        });

      } else {
        // client pipeline
        const stageMap: Record<string, import('./hubspot-client').HSDealStage> = {
          prospected: HS_STAGES.prospected, contacted: HS_STAGES.contacted,
          engaged: HS_STAGES.engaged, negotiating: HS_STAGES.negotiating,
          won: HS_STAGES.won, lost: HS_STAGES.lost,
        };

        // BrightData enrichment: website + LinkedIn + Crunchbase for CLIENT pipeline deals
        let enrichedCtx = ctx;

        // If context contains LinkedIn or Crunchbase URLs, run full company intel
        const liMatch = (ctx || '').match(/linkedin\.com\/company\/([\w-]+)/i);
        const cbMatch = (ctx || '').match(/crunchbase\.com\/organization\/([\w-]+)/i);
        if ((liMatch || cbMatch) && pipeline !== 'hiring') {
          try {
            const { enrichCompanyFull, isBrightDataConfigured } = await import('./brightdata-enrich');
            if (isBrightDataConfigured()) {
              const intel = await enrichCompanyFull({
                websiteUrl:     domain ? `https://${domain}` : undefined,
                linkedinUrl:    liMatch ? `https://www.linkedin.com/company/${liMatch[1]}` : undefined,
                crunchbaseSlug: cbMatch ? cbMatch[1] : undefined,
              });
              const parts: string[] = [ctx || ''];
              if (intel.linkedin) {
                const li = intel.linkedin;
                parts.push(`\n--- LinkedIn ---`);
                if (li.employeeRange)      parts.push(`Employees: ${li.employeeRange}`);
                if (li.companyType)        parts.push(`Type: ${li.companyType}`);
                if (li.founded)            parts.push(`Founded: ${li.founded}`);
                if (li.headquarters)       parts.push(`HQ: ${li.headquarters}`);
                if (li.recentRoles.length) parts.push(`Hiring for: ${li.recentRoles.join(', ')}`);
              }
              if (intel.crunchbase) {
                const cb = intel.crunchbase;
                parts.push(`\n--- Crunchbase ---`);
                if (cb.totalFunding)       parts.push(`Total funding: ${cb.totalFunding}`);
                if (cb.lastRoundType)      parts.push(`Last round: ${cb.lastRoundType}${cb.lastRoundAmount ? ' ' + cb.lastRoundAmount : ''}`);
                if (cb.investors.length)   parts.push(`Investors: ${cb.investors.join(', ')}`);
              }
              if (intel.website) {
                const w = intel.website;
                if (w.founderNames.length) parts.push(`Founders: ${w.founderNames.join(', ')}`);
                if (w.techStack.length)    parts.push(`Tech: ${w.techStack.slice(0, 5).join(', ')}`);
              }
              enrichedCtx = parts.filter(Boolean).join('\n');
              console.log(`[crm-event] Company intel: LI=${!!intel.linkedin} CB=${!!intel.crunchbase} site=${!!intel.website}`);
            }
          } catch (e) {
            console.warn('[crm-event] enrichCompanyFull non-fatal:', (e as Error).message?.slice(0, 80));
          }
        }

        // BrightData + Claude enrichment for ANY client-pipeline lead with a domain
        // (May 31 2026: generalized from algom_poll-only → all client leads, incl.
        // serpapi_search buying signals — fills HubSpot with founder + tech + AI-pain
        // using the $200 BrightData credits, on the now-small gated lead set).
        if (domain && pipeline !== 'hiring' && !liMatch && !cbMatch) {
          try {
            const { enrichLeadWebsite, isBrightDataConfigured } = await import('./brightdata-enrich');
            if (isBrightDataConfigured()) {
              const enrichment = await enrichLeadWebsite(domain);
              if (enrichment) {
                let painInsight = '';
                try {
                  const Anthropic = (await import('@anthropic-ai/sdk')).default;
                  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                  const msg = await claude.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 200,
                    messages: [{ role: 'user', content: `You are Elena Revicheva, fractional CTO and AI engineer. Based on the company website excerpt and lead signal below, write 2 sentences: (1) their technical pain, (2) how Elena could help.

Website (${domain}):
${enrichment.rawExcerpt}

Lead signal: ${(ctx || '').slice(0, 300)}

Founders: ${enrichment.founderNames.join(', ') || 'unknown'} | Tech: ${enrichment.techStack.slice(0, 5).join(', ') || 'unknown'} | Team: ${enrichment.teamSizeSignal || '?'} | Funding: ${enrichment.fundingSignal || '?'}` }],
                  });
                  painInsight = ((msg.content[0] as { type: string; text: string })?.text || '').trim();
                } catch { /* non-fatal */ }

                enrichedCtx = [
                  ctx,
                  `\n--- BrightData (${domain}) ---`,
                  enrichment.founderNames.length ? `Founders: ${enrichment.founderNames.join(', ')}` : null,
                  enrichment.techStack.length    ? `Tech: ${enrichment.techStack.join(', ')}` : null,
                  enrichment.teamSizeSignal      ? `Team: ${enrichment.teamSizeSignal}` : null,
                  enrichment.fundingSignal        ? `Funding: ${enrichment.fundingSignal}` : null,
                  painInsight                    ? `\nAI Pain: ${painInsight}` : null,
                ].filter(Boolean).join('\n');

                console.log(`[crm-event] BrightData enriched: ${domain} | founders: ${enrichment.founderNames.join(', ') || '—'}`);
              }
            }
          } catch (e) {
            console.warn('[crm-event] BrightData non-fatal:', (e as Error).message?.slice(0, 100));
          }
        }

        result = await pushLeadToHubSpot({
          sourcePrefix,
          name:   name || company || email || source,
          email,
          company: company || domain,
          source:  source || 'AI Marketing Engine',
          painPoint: enrichedCtx,
          stage:  stageMap[stage ?? ''] ?? HS_STAGES.prospected,
          ...(typeof amount === 'number' && amount > 0 ? { amount } : {}),
        });
      }

      // Log to Oracle regardless of HubSpot outcome
      await saveAgentOutcome(source || 'unknown', type || 'crm_event', {
        pipeline, email, domain, name, company, jobTitle, stage, urgency, ctx,
      }, result ? 'verified_delivered' : 'pending_verification');

      // NEW (May 24 2026): if HIRING deal landed in urgent stage, fire-and-forget
      // a Trello card on the current-month "Kira {Mes}" board, "Just for Today" list.
      // Idempotent (Trello search before create). Never blocks the response.
      if (result?.dealId && pipeline === 'hiring' && (stage === 'recruiter_responded' || urgency === 5 || urgency === 4)) {
        const dealStageForTrello = stage === 'recruiter_responded' ? 'contractsent' : 'qualifiedtobuy';
        const dealNameForTrello = `[${sourcePrefix || 'HIRING'}] ${jobTitle} @ ${company}`;
        import('./hubspot-to-trello').then(m => m.pushDealToTrelloToday({
          dealId: result.dealId!,
          dealName: dealNameForTrello,
          dealStage: dealStageForTrello,
          suggestedAction: notes ? notes.slice(0, 300) : undefined,
        })).catch(e => console.warn('[HubSpot→Trello fire-and-forget]', e instanceof Error ? e.message : String(e)));
      }

      res.json({
        ok: true,
        pipeline,
        hubspot: result
          ? { contactId: result.contactId, companyId: result.companyId, dealId: result.dealId }
          : null,
      });

    } catch (e: unknown) {
      console.error('[crm-event] error:', e);
      res.status(500).json({ error: String((e as Error)?.message || e) });
    }
  });

  const PORT = 3000;
  const baseUrl = process.env.CTO_AIPA_PUBLIC_URL || `http://0.0.0.0:${PORT}`;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎧 CTO AIPA listening on port ${PORT}`);
    console.log(`📡 Webhook: ${baseUrl}/webhook/github`);
    console.log(`💬 Ask CTO: ${baseUrl}/ask-cto`);
    console.log(`📋 CMO Updates: ${baseUrl}/cmo-updates`);
    console.log(`🏆 Tech Milestones: ${baseUrl}/tech-milestones`);
    console.log(`🏥 Health: ${baseUrl}/`);
    console.log(`🎯 Phase 5: GET ${baseUrl}/leads/triage-status · POST ${baseUrl}/leads/triage-run`);
    if (process.env.SPRINT_BRIEFING_SECRET?.trim()) {
      console.log(`☀️ Sprint Briefing: POST ${baseUrl}/sprint-briefing/run (Bearer SPRINT_BRIEFING_SECRET)`);
    }
    if (process.env.CMO_WEBHOOK_URL) console.log(`🤝 CMO: ${process.env.CMO_WEBHOOK_URL}`);
    
    // Initialize Telegram Bot (CTO AIPA)
    const telegramBot = initTelegramBot();
    if (telegramBot) {
      console.log(`📱 Telegram: CTO Bot starting...`);
    } else {
      console.log(`📱 Telegram: CTO Bot not configured (add TELEGRAM_BOT_TOKEN to .env)`);
    }
    
    // Initialize Atuona Creative AI Bot
    const atuonaBot = initAtuonaBot();
    if (atuonaBot) {
      console.log(`🎭 Telegram: Atuona Creative AI starting...`);
    } else {
      console.log(`🎭 Telegram: Atuona not configured (add ATUONA_BOT_TOKEN to .env)`);
    }
    
    console.log(`\n🤝 Ready to be your Technical Co-Founder!`);
    if (atuonaBot) {
      console.log(`🎭 Ready to create with your Creative Co-Founder!`);
    }

    const articleModel = (process.env.DAILY_BLOG_ARTICLE_MODEL ?? process.env.HASHNODE_ARTICLE_MODEL) || AI_MODELS.strategic;
    const maxArticleTokens = Math.min(AI_MODELS.maxTokens, 8192);
    startDailyBlogPublisher({
      anthropic,
      model: articleModel,
      maxTokens: maxArticleTokens,
    });
    if ((process.env.DAILY_BLOG_TRIGGER_SECRET ?? process.env.HASHNODE_DAILY_TRIGGER_SECRET)) {
      console.log(`📰 Daily blog manual: POST ${baseUrl}/blog/daily-run with Bearer secret (deprecated alias: ${baseUrl}/hashnode/daily-run)`);
    }
    if (process.env.MARKETING_INQUIRY_SECRET?.trim()) {
      console.log(`📣 Marketing inquiry: POST ${baseUrl}/marketing/inquiry (Bearer secret); digest ${baseUrl}/marketing/digest-run`);
    }
    startMarketingWeeklyDigest();
    if (process.env.OUTREACH_SECRET?.trim()) {
      console.log(`📧 Outreach pipeline: ${baseUrl}/outreach/* (Bearer OUTREACH_SECRET)`);

      // Prospect ingestion: 2 PM Panama (before outreach send at 3 PM)
      const ingestCronExpr = process.env.INGEST_CRON || '0 14 * * *';
      const ingestTz = process.env.INGEST_TZ || process.env.OUTREACH_TZ || 'America/Panama';
      const broadcastPlain = (msg: string) => sendTelegramBroadcast(msg, { parseMode: false });
      cron.schedule(ingestCronExpr, () => {
        console.log('🔍 [cron] Running prospect ingestion cycle…');
        runProspectIngestion(anthropic, broadcastPlain).catch(e =>
          console.error('🔍 [cron] Prospect ingestion error:', e)
        );
      }, { timezone: ingestTz });
      console.log(`🔍 Ingest cron: "${ingestCronExpr}" (${ingestTz}) — YC companies → Hunter → Oracle`);

      const outreachCronExpr = process.env.OUTREACH_CRON || '0 15 * * *';
      const outreachTz = process.env.OUTREACH_TZ || 'America/Panama';
      cron.schedule(outreachCronExpr, () => {
        console.log('📧 [cron] Running daily outreach cycle…');
        runDailyOutreachCycle(anthropic, broadcastPlain).catch(e =>
          console.error('📧 [cron] Outreach cycle error:', e)
        );
      }, { timezone: outreachTz });
      console.log(`📧 Outreach cron: "${outreachCronExpr}" (${outreachTz}) — auto generate + send`);
    }

    // Phase 5: Lead triage daily brief — 08:00 America/Panama
    const triageCronExpr = process.env.TRIAGE_CRON || '0 8 * * *';
    const triageTz = 'America/Panama';
    cron.schedule(triageCronExpr, async () => {
      console.log('🎯 [cron] Running daily lead triage...');
      if (!getPhase5TriageStatus().ready) {
        console.error('🎯 [cron] Triage skipped — ANTHROPIC_API_KEY not set');
        return;
      }
      try {
        await runTriageCycle(groq, anthropic);
        const brief = await buildDailyBrief();
        // MAY 25 2026: null brief = silent day, no Telegram (zero noise).
        if (brief === null) {
          console.log('🎯 [cron] Triage: quiet day (0 Oracle signals + 0 HubSpot actionable) — Telegram SUPPRESSED');
        } else {
          const chatId = process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID;
          if (chatId) await sendTelegramBroadcast(brief, { parseMode: false });
        }
      } catch (e) { console.error('🎯 [cron] Triage error:', e); }
    }, { timezone: triageTz });
    console.log(`🎯 Triage cron: "${triageCronExpr}" (${triageTz}) — daily lead brief`);

    const sprintCronExpr = process.env.SPRINT_BRIEFING_CRON?.trim();
    if (sprintCronExpr && process.env.SPRINT_BRIEFING_SECRET?.trim()) {
      cron.schedule(
        sprintCronExpr,
        () => {
          console.log('☀️ [cron] Sprint briefing starting…');
          const kRaw =
            process.env.SPRINT_BRIEFING_KNOWLEDGE_USER_IDS?.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n)) ??
            [];
          runSprintBriefing({ groq, anthropic, octokit }, {
            githubRepos: (process.env.SPRINT_BRIEFING_GITHUB_REPOS || '').split(',').map(s => s.trim()).filter(Boolean),
            linearTeamId: process.env.LINEAR_TEAM_ID?.trim(),
            knowledgeUserIds: kRaw.length ? kRaw : undefined,
          })
            .then(r => deliverBriefingToTelegram(r))
            .catch(e => console.error('☀️ [cron] Sprint briefing error:', e));
        },
        { timezone: triageTz },
      );
      console.log(`☀️ Sprint briefing cron: "${sprintCronExpr}" (${triageTz})`);
    }
    // Client-prospect discovery — every 6h. Runs on BrightData SERP (primary, $200
    // credits) OR legacy SerpAPI. May 31 2026: SerpAPI quota exhausted, so the gate
    // now also fires on BrightData alone — the engine is BD-first regardless.
    const serpDiscoveryEnabled = !!(process.env.SERPAPI_KEY?.trim()
      || (process.env.BRIGHTDATA_API_TOKEN?.trim() && process.env.BRIGHTDATA_ZONE?.trim()));
    if (serpDiscoveryEnabled) {
      // Run once at startup
      runSerpProspects().catch(e => console.error('[SerpProspects] startup error:', e));
      // Then every 6h
      cron.schedule('0 */6 * * *', () => {
        console.log('[SerpProspects] Running 6h discovery cycle...');
        runSerpProspects().catch(e => console.error('[SerpProspects] cron error:', e));
      }, { timezone: triageTz });
      console.log('[SerpProspects] Buying-intent client discovery (BrightData-first): every 6h');
    }
    // Podcast living dictionary — refresh daily from live market trends (Bright Data
    // headlines → LLM term extraction) so spoken jargon/product names transcribe right.
    if (process.env.PODCAST_ENGINE_ENABLED?.trim().toLowerCase() === 'true') {
      // Warm the cache at startup (non-blocking)
      import('./podcast-dictionary').then(m => m.refreshPodcastDictionary())
        .catch(e => console.warn('[podcast-dict] startup refresh:', e instanceof Error ? e.message : String(e)));
      cron.schedule('0 7 * * *', () => {
        import('./podcast-dictionary').then(m => m.refreshPodcastDictionary())
          .catch(e => console.warn('[podcast-dict] cron refresh:', e instanceof Error ? e.message : String(e)));
      }, { timezone: triageTz });
      console.log(`[podcast-dict] daily market-trend refresh: 07:00 ${triageTz}`);
    }
  });
}

startCTOAIPA().catch(console.error);

export { reviewCode, askCTO };
