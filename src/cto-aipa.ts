import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
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
} from './database';
import { initTelegramBot, sendTelegramBroadcast } from './telegram-bot';
import { initAtuonaBot } from './atuona-creative-ai';
import { startHashnodeDailyPublisher, runDailyHashnodePost, HASHNODE_TOPIC_BRIEFS } from './hashnode-daily';
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
import { runTriageCycle, buildDailyBrief, buildDashboardHtml, getPhase5TriageStatus } from './lead-triage';
import * as dotenv from 'dotenv';
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

const AI_MODELS = {
  // For critical reviews (security, payments, complex architecture)
  critical: process.env.CRITICAL_MODEL || 'claude-opus-4-20250514',
  
  // For Ask CTO strategic questions
  strategic: process.env.STRATEGIC_MODEL || 'claude-opus-4-20250514',
  
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
  process.env.CODE_REVIEW_FALLBACK_MODEL || 'claude-3-haiku-20240307';

async function anthropicTextReview(model: string, prompt: string, maxTokens: number): Promise<string> {
  // claude-3-haiku-20240307 hard limit is 4096
  const effectiveMax = model.includes('haiku') ? Math.min(maxTokens, 4096) : maxTokens;
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
    const CMO_WEBHOOK = process.env.CMO_WEBHOOK_URL || 'https://vibejobhunter-production.up.railway.app/api/tech-update';
    
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
      console.log(`⚡ Using ${AI_MODELS.standard} for standard code review...`);
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
      console.warn(`⚡ Groq review failed (${msg.slice(0, 160)}), using Claude Haiku fallback...`);
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
  const response = await anthropic.messages.create({
    model: AI_MODELS.strategic,
    max_tokens: AI_MODELS.maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });

  const firstContent = response.content[0];
  const answer = firstContent && firstContent.type === 'text' ? firstContent.text : '';

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
  
  await initializeDatabase();
  
  console.log('✅ CTO AIPA v3.0 ready!');
  console.log('🧠 Ecosystem: AIdeazz (11 repositories)');
  console.log('💰 Cost: $0 (Oracle Cloud credits)');
  console.log('🔍 Features: Code Review, Push Monitoring, Ask CTO, CMO Integration');
  
  const app = express();
  app.set('trust proxy', 1); // behind nginx (webhook.aideazz.xyz → /cto/)
  app.use(express.json());
  
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
        'Hashnode daily article (opt-in, HASHNODE_DAILY_ENABLED)'
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
  // HASHNODE DAILY — long-form article generation + publish (opt-in)
  // ==========================================================================

  app.get('/hashnode/daily-status', (_req, res) => {
    res.json({
      enabled: process.env.HASHNODE_DAILY_ENABLED === 'true',
      cron: process.env.HASHNODE_DAILY_CRON || '30 9 * * *',
      timezone: process.env.HASHNODE_DAILY_TZ || 'America/Panama',
      note: 'Default 09:30 Panama City (UTC−5); override HASHNODE_DAILY_CRON / HASHNODE_DAILY_TZ',
      publicFeed: process.env.HASHNODE_DAILY_PUBLIC === 'true',
      topicCount: HASHNODE_TOPIC_BRIEFS.length,
      manualTriggerConfigured: !!process.env.HASHNODE_DAILY_TRIGGER_SECRET,
      articleModel: process.env.HASHNODE_ARTICLE_MODEL || AI_MODELS.strategic,
    });
  });

  app.post('/hashnode/daily-run', async (req, res) => {
    const secret = process.env.HASHNODE_DAILY_TRIGGER_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({
        error: 'Unauthorized',
        hint: 'Set HASHNODE_DAILY_TRIGGER_SECRET in .env and POST with header Authorization: Bearer <secret>',
      });
      return;
    }
    try {
      const model = process.env.HASHNODE_ARTICLE_MODEL || AI_MODELS.strategic;
      const maxTok = Math.min(AI_MODELS.maxTokens, 8192);
      const out = await runDailyHashnodePost({ anthropic, model, maxTokens: maxTok });
      res.json({ ok: true, ...out });
    } catch (e) {
      console.error('hashnode/daily-run:', e);
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
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

        await notifyCMO({
          commit_sha: req.body.after,
          repo: repo.full_name,
          title: commitMessages,
          description: `CTO reviewed push: ${commitMessages}`,
          type: 'feature',
          security_issues: reviewResult.securityIssues.length,
          complexity_issues: reviewResult.complexityIssues.length
        });
        
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
  // ============================================================
  app.get('/leads/dashboard', async (req: Request, res: Response) => {
    const secret = process.env.LEAD_TRIAGE_SECRET;
    if (secret && req.query.secret !== secret) {
      res.status(401).send('<h1 style="font-family:sans-serif;color:#ef4444">Unauthorized</h1>');
      return;
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

    const articleModel = process.env.HASHNODE_ARTICLE_MODEL || AI_MODELS.strategic;
    const maxArticleTokens = Math.min(AI_MODELS.maxTokens, 8192);
    startHashnodeDailyPublisher({
      anthropic,
      model: articleModel,
      maxTokens: maxArticleTokens,
    });
    if (process.env.HASHNODE_DAILY_TRIGGER_SECRET) {
      console.log(`📰 Hashnode manual: POST ${baseUrl}/hashnode/daily-run with Bearer secret`);
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
        const chatId = process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID;
        if (chatId) await sendTelegramBroadcast(brief, { parseMode: false });
      } catch (e) { console.error('🎯 [cron] Triage error:', e); }
    }, { timezone: triageTz });
    console.log(`🎯 Triage cron: "${triageCronExpr}" (${triageTz}) — daily lead brief`);
  });
}

startCTOAIPA().catch(console.error);

export { reviewCode, askCTO };
