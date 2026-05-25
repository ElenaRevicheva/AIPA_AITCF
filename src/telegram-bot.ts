import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { Bot, Context, InputFile } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import { runResearchAgent, type ResearchMode } from './research-agent';
import Groq from 'groq-sdk';
import { 
  getRelevantMemory, 
  saveMemory,
  addTechDebt,
  getTechDebt,
  resolveTechDebt,
  addDecision,
  getDecisions,
  savePendingCode,
  getPendingCode,
  clearPendingCode,
  getAlertPreferences,
  setAlertPreferences,
  getAllAlertChatIds,
  // Learning system
  saveLesson,
  getLessons,
  getSuccessPatterns,
  // Strategic
  saveInsight,
  getActiveInsights,
  resolveInsight,
  // Health monitoring
  saveHealthCheck,
  getHealthHistory,
  // Personal AI Upgrade - Conversation Context
  saveConversationContext,
  loadConversationContext,
  clearConversationContext,
  // Personal AI Upgrade - Knowledge Base
  saveKnowledge,
  searchKnowledge,
  getKnowledgeByCategory,
  getKnowledgeByProject,
  getRecentKnowledge,
  deleteKnowledgeById,
  clearKnowledgeByCategory,
  // Wiring Build (Week 1) - Outcome tracking
  saveAgentOutcome,
  verifyAgentOutcome,
  getAgentOutcomes,
  getOutcomeSummary,
  // Wiring Build (Week 1) - Business leads
  saveLead,
  updateLead,
  getLeads,
  // Wiring Build (Week 1) - EspaLuz funnel
  upsertEspaluzUser,
  getEspaluzExpiringTrials,
  getEspaluzFunnelSummary,
  // Phase 4 - Outreach
  getOutreachStats,
  getOutreachDrafts,
  getOutreachTargets,
  deleteTestBusinessLeads,
} from './database';
import { runTriageCycle, buildDailyBrief } from './lead-triage';
import {
  importTargets,
  verifyTargetEmails,
  generateBatchDrafts,
  sendApprovedDrafts,
  formatOutreachStatsMessage,
  formatDraftPreview,
  getWarmupDailyCap,
  getPendingLeads,
  updateTargetEmail,
  type OutreachTargetInput,
} from './outreach';
import { runProspectIngestion } from './prospect-ingest';
import { runFreshLeadsIngestion } from './fresh-leads-ingest';
import { runPlacesIngestion, INDUSTRY_PRESETS } from './prospect-places';
import { runDocIngestion } from './doc-ingest';
import {
  createTrelloCardFromTranscript,
  formatVoiceTrelloReply,
  processMultiAction,
  formatMultiActionReply,
} from './trello-voice';
import type { TrelloCard } from './trello-voice';
import { generateDailyBriefing, generateWeeklyDigest } from './board-briefing';
import { getHubSpotStats, pushLeadToHubSpot } from './hubspot-client';
import { Octokit } from '@octokit/rest';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// =============================================================================
// TELEGRAM BOT FOR CTO AIPA v3.2
// Chat with your AI Technical Co-Founder from your phone!
// Features: Daily Briefing, Proactive Alerts, Voice Messages, 
//           Screenshot Analysis, Idea Capture, Ecosystem Stats
// =============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const githubToken = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || '')
  .replace(/^['"]|['"]$/g, '')
  .trim();
const octokit = new Octokit({ auth: githubToken || undefined });

// May 24 2026: dedup state for stale-repo proactive alerts (telegram-bot.ts).
// Without this, the every-4-hour cron re-alerts about the same stale repo
// 6 times/day. Now: per-repo last-alerted timestamp; skip if alerted within 24h.
const lastStaleRepoAlertAt = new Map<string, number>();
const STALE_REPO_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const STALE_REPO_THRESHOLD_DAYS = 14; // raised from 5 — only alert on genuinely stale (2+ weeks)

// Authorized users (Telegram user IDs) - add your ID for security
const AUTHORIZED_USERS = process.env.TELEGRAM_AUTHORIZED_USERS?.split(',').map(id => parseInt(id.trim())) || [];

// =============================================================================
// FILE EDITING STATE (In-Memory for Cursor-Level Operations)
// =============================================================================
interface FileEditState {
  action: 'edit' | 'create' | 'ready_to_commit';
  repo: string;
  path: string;
  content: string;
  sha: string;
  newContent?: string;
}
const fileEditStates = new Map<number, FileEditState>();

function saveFileEditState(userId: number, state: FileEditState): void {
  fileEditStates.set(userId, state);
}

function getFileEditState(userId: number): FileEditState | undefined {
  return fileEditStates.get(userId);
}

function clearFileEditState(userId: number): void {
  fileEditStates.delete(userId);
}

// =============================================================================
// CURSOR-TWIN SESSION MEMORY - Remember conversation context!
// =============================================================================
interface ConversationContext {
  recentFiles: { repo: string; path: string; content: string; timestamp: number }[];
  recentQuestions: { question: string; answer: string; timestamp: number }[];
  activeRepo: string | null;
  activeFile: string | null;
  pendingFixes: { description: string; code: string; file?: string }[];
  batchEdits: { repo: string; path: string; content: string; sha: string }[];
  lastUpdated: number;
}

const conversationContexts = new Map<number, ConversationContext>();

// Track whether the last voice interaction for a user was a JOB_SEARCH intent
const recentJobSearchVoice = new Map<number, number>(); // userId -> timestamp (ms)

// Last Trello cards created per user — used for relocation and archive commands
interface LastTrelloSession {
  cards: TrelloCard[];
  listTarget: string;
  ts: number;
}
const lastTrelloSession = new Map<number, LastTrelloSession>();
const TRELLO_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getConversationContext(userId: number): ConversationContext {
  let ctx = conversationContexts.get(userId);
  if (!ctx) {
    ctx = {
      recentFiles: [],
      recentQuestions: [],
      activeRepo: null,
      activeFile: null,
      pendingFixes: [],
      batchEdits: [],
      lastUpdated: Date.now()
    };
    conversationContexts.set(userId, ctx);
    // PERSONAL AI UPGRADE: Load from DB asynchronously (fire and forget)
    loadContextFromDbForUser(userId);
  }
  // UPGRADED: Extended retention from 30 min to 7 days (context now persists to DB)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  ctx.recentFiles = ctx.recentFiles.filter(f => f.timestamp > sevenDaysAgo).slice(-10);
  ctx.recentQuestions = ctx.recentQuestions.filter(q => q.timestamp > sevenDaysAgo).slice(-20);
  ctx.lastUpdated = Date.now();
  return ctx;
}

function addFileToContext(userId: number, repo: string, path: string, content: string): void {
  const ctx = getConversationContext(userId);
  ctx.recentFiles.push({ repo, path, content: content.substring(0, 5000), timestamp: Date.now() });
  ctx.activeRepo = repo;
  ctx.activeFile = path;
  // PERSONAL AI UPGRADE: Sync to DB (fire and forget)
  syncContextToDb(userId);
}

function addQuestionToContext(userId: number, question: string, answer: string): void {
  const ctx = getConversationContext(userId);
  ctx.recentQuestions.push({ question: question.substring(0, 500), answer: answer.substring(0, 1000), timestamp: Date.now() });
  // PERSONAL AI UPGRADE: Sync to DB (fire and forget)
  syncContextToDb(userId);
}

function addPendingFix(userId: number, description: string, code: string, file?: string): void {
  const ctx = getConversationContext(userId);
  if (file) {
    ctx.pendingFixes.push({ description, code, file });
  } else {
    ctx.pendingFixes.push({ description, code });
  }
}

function getContextSummary(userId: number): string {
  const ctx = getConversationContext(userId);
  let summary = '';
  
  if (ctx.activeRepo || ctx.activeFile) {
    summary += `CURRENT CONTEXT: Working in ${ctx.activeRepo || 'unknown repo'}`;
    if (ctx.activeFile) summary += `, file: ${ctx.activeFile}`;
    summary += '\n';
  }
  
  if (ctx.recentFiles.length > 0) {
    summary += `RECENT FILES VIEWED:\n${ctx.recentFiles.map(f => `- ${f.repo}/${f.path}`).join('\n')}\n`;
  }
  
  if (ctx.recentQuestions.length > 0) {
    const lastQ = ctx.recentQuestions[ctx.recentQuestions.length - 1];
    summary += `LAST QUESTION: "${lastQ?.question || ''}"\n`;
  }
  
  if (ctx.pendingFixes.length > 0) {
    summary += `PENDING FIXES: ${ctx.pendingFixes.length} suggestions waiting to be applied\n`;
  }
  
  return summary;
}

// Chat IDs for proactive alerts (populated when users interact)
let alertChatIds: Set<number> = new Set();

// AIdeazz ecosystem context
const AIDEAZZ_CONTEXT = `
You are CTO AIPA, the AI Technical Co-Founder of AIdeazz - a startup built by Elena Revicheva.

ABOUT ELENA:
- Ex-CEO who relocated to Panama in 2022
- Self-taught "vibe coder" using AI tools (Cursor AI Agents)
- Built 11 AI products in 10 months, solo, under $15K
- Philosophy: "The AI is the vehicle. I am the architect."

THE AIDEAZZ ECOSYSTEM (11 repositories):
1. AIPA_AITCF (You - CTO AIPA) - Oracle Cloud
2. VibeJobHunterAIPA_AIMCF (CMO AIPA) - Railway
3. EspaLuzWhatsApp - AI Spanish Tutor (Revenue-generating!)
4. EspaLuz_Influencer - Marketing component
5. EspaLuzFamilybot - Family version
6. aideazz - Main Website
7. dragontrade-agent - Web3 Trading
8. atuona - NFT Gallery
9. ascent-saas-builder - SaaS Tool
10. aideazz-private-docs - Private Docs
11. aideazz-pitch-deck - Pitch Materials

YOUR ROLE:
- Be a supportive, strategic technical co-founder
- Give concise but helpful answers (this is Telegram, keep it readable)
- Use emojis to make it friendly
- Remember you're chatting, not writing essays
- Be proactive with suggestions

THREE PERSONAS (v6.0 Personal AI Upgrade):

1. TECH CO-FOUNDER - Strategic thinking about the business, challenge ideas respectfully, remember past decisions

2. CURSOR TWIN - When Cursor credits run out, you ARE the coding assistant. Read/edit files, remember context, apply fixes, multi-file batch editing.

3. PERSONAL AI ASSISTANT - Capture ideas from voice, remember everything important, help Elena be her best self, daily reflection and planning.

MEMORY: You remember conversations, ideas, projects, and preferences across sessions.
KNOWLEDGE: You can access Elena's knowledge base (ideas, diary, research, tasks).
`;

// All AIdeazz repos for monitoring
const AIDEAZZ_REPOS = [
  'AIPA_AITCF',
  'VibeJobHunterAIPA_AIMCF', 
  'EspaLuzWhatsApp',
  'EspaLuz_Influencer',
  'EspaLuzFamilybot',
  'aideazz',
  'dragontrade-agent',
  'atuona',
  'ascent-saas-builder',
  'aideazz-private-docs',
  'aideazz-pitch-deck'
];

// Repo aliases for easier typing
const REPO_ALIASES: Record<string, string> = {
  // CTO AIPA aliases
  'cto': 'AIPA_AITCF',
  'aitcf': 'AIPA_AITCF',
  'aipa': 'AIPA_AITCF',
  'cto-aipa': 'AIPA_AITCF',
  // CMO AIPA aliases
  'cmo': 'VibeJobHunterAIPA_AIMCF',
  'aimcf': 'VibeJobHunterAIPA_AIMCF',
  'vibejobhunter': 'VibeJobHunterAIPA_AIMCF',
  'jobhunter': 'VibeJobHunterAIPA_AIMCF',
  // EspaLuz aliases
  'espaluz': 'EspaLuzWhatsApp',
  'spanish': 'EspaLuzWhatsApp',
  'tutor': 'EspaLuzWhatsApp',
  'influencer': 'EspaLuz_Influencer',
  'familybot': 'EspaLuzFamilybot',
  'family': 'EspaLuzFamilybot',
  // Other aliases
  'dragon': 'dragontrade-agent',
  'trade': 'dragontrade-agent',
  'saas': 'ascent-saas-builder',
  'ascent': 'ascent-saas-builder',
  'docs': 'aideazz-private-docs',
  'pitch': 'aideazz-pitch-deck',
  'deck': 'aideazz-pitch-deck',
  // Pseudo-project for job search umbrella (no actual repo)
  'job': 'JOB_SEARCH',
};

// Helper to resolve repo name (supports aliases and case-insensitive matching)
function resolveRepoName(input: string): string | null {
  const normalized = input.toLowerCase().trim();

  // Special case: JOB_SEARCH is a pseudo-project, not a GitHub repo
  if (normalized === 'job' || normalized === 'job_search' || normalized === 'job-search') {
    return 'JOB_SEARCH';
  }
  
  // Check aliases first
  if (REPO_ALIASES[normalized]) {
    return REPO_ALIASES[normalized];
  }
  
  // Check exact match (case-insensitive)
  const exactMatch = AIDEAZZ_REPOS.find(r => r.toLowerCase() === normalized);
  if (exactMatch) return exactMatch;
  
  // Check partial match (starts with or contains)
  const partialMatch = AIDEAZZ_REPOS.find(r => 
    r.toLowerCase().startsWith(normalized) || 
    r.toLowerCase().includes(normalized)
  );
  if (partialMatch) return partialMatch;
  
  return null;
}

let bot: Bot | null = null;
let cronJobs: cron.ScheduledTask[] = [];

// =============================================================================
// HELPER: Escape Markdown special characters for Telegram
// =============================================================================

function escapeMarkdown(text: string): string {
  // Escape special characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

// =============================================================================
// AI HELPER: Try Claude first, fallback to Groq if credits exhausted
// =============================================================================

async function askAI(prompt: string, maxTokens: number = 1500): Promise<string> {
  // Try Claude first (better quality)
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const firstContent = response.content[0];
    return firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not generate response.';
  } catch (claudeError: any) {
    // Check if it's a credit/billing error
    const errorMessage = claudeError?.error?.error?.message || claudeError?.message || '';
    if (errorMessage.includes('credit') || errorMessage.includes('billing') || claudeError?.status === 400) {
      console.log('⚠️ Claude credits low, falling back to Groq...');
      
      // Fallback to Groq (free!)
      try {
        const groqResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.7
        });
        
        return groqResponse.choices[0]?.message?.content || 'Could not generate response.';
      } catch (groqError) {
        console.error('Groq fallback error:', groqError);
        throw groqError;
      }
    }
    
    // Re-throw other errors
    throw claudeError;
  }
}

export function initTelegramBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.log('ℹ️ Telegram bot not configured (TELEGRAM_BOT_TOKEN not set)');
    return null;
  }
  
  bot = new Bot(token);
  
  // Middleware: Check authorization
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    
    // If no authorized users configured, allow all (for initial setup)
    if (AUTHORIZED_USERS.length === 0) {
      console.log(`⚠️ No authorized users configured. User ${userId} accessing bot.`);
      console.log(`   Add TELEGRAM_AUTHORIZED_USERS=${userId} to .env to restrict access.`);
      await next();
      return;
    }
    
    if (userId && AUTHORIZED_USERS.includes(userId)) {
      await next();
    } else {
      console.log(`🚫 Unauthorized access attempt from user ${userId}`);
      await ctx.reply('⛔ Sorry, you are not authorized to use this bot.');
    }
  });
  
  // ==========================================================================
  // COMMANDS
  // ==========================================================================
  
  // /start - Welcome message
  bot.command('start', async (ctx) => {
    // Register for alerts when user starts
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    
    const welcomeMessage = `
🤖 *CTO AIPA v3.3*
Your AI Technical Co-Founder + Coding Teacher!

🆕 *NEW: I can code & teach!*
/learn - Start coding lessons
/code <repo> <task> - I write code!
/fix <repo> <issue> - I fix bugs!

📊 /stats - Your productivity
📸 Send photo - I analyze!
🎤 Voice - Just talk!

Type /menu for all commands! 🚀
    `;
    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  });
  
  // /help - Show commands
  bot.command('help', async (ctx) => {
    await showMenu(ctx);
  });
  
  // /menu - Show organized menu
  bot.command('menu', async (ctx) => {
    await showMenu(ctx);
  });
  
  // ==========================================================================
  // INTERACTIVE MENU SYSTEM - Tap sections to see details!
  // ==========================================================================
  
  const MENU_SECTIONS: Record<string, { title: string; commands: { cmd: string; desc: string; usage: string }[] }> = {
    'cursor_twin': {
      title: '🚀 CURSOR-TWIN OPERATIONS',
      commands: [
        { cmd: '/readfile', desc: 'Read any file from your repos', usage: '/readfile cto src/telegram-bot.ts\n/readfile espaluz main.py 1-50' },
        { cmd: '/editfile', desc: 'Edit files and commit to GitHub', usage: '/editfile cto src/database.ts\nThen describe your change' },
        { cmd: '/createfile', desc: 'Create new files', usage: '/createfile cto src/newfile.ts\nThen paste the content' },
        { cmd: '/commit', desc: 'Commit pending changes', usage: '/commit Fixed login bug' },
        { cmd: '/search', desc: 'Search code across repos (grep)', usage: '/search cto handleQuestion\n/search espaluz async def' },
        { cmd: '/tree', desc: 'List directory structure', usage: '/tree cto src/\n/tree espaluz' },
        { cmd: '/run', desc: 'Trigger GitHub Actions CI/CD', usage: '/run cto\n/run espaluz deploy' },
        { cmd: '/cancel', desc: 'Cancel pending edits', usage: '/cancel' },
      ]
    },
    'session_memory': {
      title: '🧠 SESSION MEMORY',
      commands: [
        { cmd: '/context', desc: 'Show what I remember from our session', usage: '/context\nSee active project, recent files, pending fixes' },
        { cmd: '/apply', desc: 'Apply my last suggested fix', usage: 'Ask me to fix something → I suggest code → /apply → /commit' },
        { cmd: '/batch', desc: 'Multi-file batch editing', usage: '/batch add cto src/file1.ts\n/batch add cto src/file2.ts\n/batch commit "Updated both"' },
      ]
    },
    'power': {
      title: '⚡ POWER FEATURES',
      commands: [
        { cmd: '/fixerror', desc: 'Paste an error, get a fix', usage: '/fixerror TypeError: Cannot read property...' },
        { cmd: '/multifile', desc: 'Load multiple files at once', usage: '/multifile cto src/telegram-bot.ts src/database.ts' },
        { cmd: '/refactor', desc: 'Get code improvement suggestions', usage: '/refactor cto src/telegram-bot.ts' },
        { cmd: '/gentest', desc: 'Generate tests for your code', usage: '/gentest cto src/database.ts' },
        { cmd: '/explaincode', desc: 'Deep code explanation', usage: '/explaincode cto src/cto-aipa.ts 100-200' },
        { cmd: '/quickfix', desc: 'Fast one-liner fixes', usage: '/quickfix add error handling to fetch' },
        { cmd: '/diff', desc: 'Show recent changes in a repo', usage: '/diff cto\n/diff espaluz 7' },
      ]
    },
    'strategic': {
      title: '🧠 STRATEGIC CTO',
      commands: [
        { cmd: '/strategy', desc: 'Ecosystem analysis and planning', usage: '/strategy\nGet AIdeazz ecosystem overview' },
        { cmd: '/priorities', desc: 'What to work on today', usage: '/priorities\nBased on your recent work' },
        { cmd: '/think', desc: 'Deep strategic thinking', usage: '/think Should I add payments to EspaLuz?' },
        { cmd: '/suggest', desc: 'Quick actionable suggestion', usage: '/suggest improve onboarding' },
      ]
    },
    'monitoring': {
      title: '🏥 MONITORING',
      commands: [
        { cmd: '/health', desc: 'Check production services', usage: '/health\nCheck all AIdeazz services' },
        { cmd: '/logs', desc: 'Analyze pasted logs', usage: '/logs\nThen paste error logs' },
        { cmd: '/status', desc: 'Ecosystem status overview', usage: '/status' },
        { cmd: '/daily', desc: 'Morning briefing', usage: '/daily\nGets sent at 8 AM automatically' },
        { cmd: '/stats', desc: 'Weekly metrics and stats', usage: '/stats' },
      ]
    },
    'learning': {
      title: '📚 LEARNING & TEACHING',
      commands: [
        { cmd: '/feedback', desc: 'Teach me what worked/failed', usage: '/feedback That fix worked great!' },
        { cmd: '/lessons', desc: 'See what I learned from you', usage: '/lessons' },
        { cmd: '/learn', desc: 'Pick a coding topic', usage: '/learn typescript\n/learn react hooks' },
        { cmd: '/exercise', desc: 'Get a coding challenge', usage: '/exercise python\n/exercise javascript' },
        { cmd: '/explain', desc: 'Explain any concept', usage: '/explain async await\n/explain dependency injection' },
      ]
    },
    'code_gen': {
      title: '💻 CODE GENERATION',
      commands: [
        { cmd: '/code', desc: 'Generate code', usage: '/code cto Add rate limiting middleware' },
        { cmd: '/fix', desc: 'Fix a bug', usage: '/fix cto The menu shows wrong count' },
        { cmd: '/approve', desc: 'Create PR for pending code', usage: '/approve' },
        { cmd: '/reject', desc: 'Discard pending code', usage: '/reject' },
        { cmd: '/pending', desc: 'Check pending code status', usage: '/pending' },
      ]
    },
    'decisions': {
      title: '🏛️ DECISIONS & DEBT',
      commands: [
        { cmd: '/decision', desc: 'Record architectural decision', usage: '/decision Use PostgreSQL for EspaLuz memory' },
        { cmd: '/debt', desc: 'Track technical debt', usage: '/debt cto Need to refactor voice handler' },
        { cmd: '/review', desc: 'Review latest commits', usage: '/review cto\n/review espaluz 5' },
      ]
    },
    'repos': {
      title: '🔍 REPOS & IDEAS',
      commands: [
        { cmd: '/repos', desc: 'List all repositories', usage: '/repos' },
        { cmd: '/idea', desc: 'Save a startup idea', usage: '/idea Add AI voice coaching to EspaLuz' },
        { cmd: '/ideas', desc: 'View saved ideas', usage: '/ideas' },
      ]
    },
    'personal_ai': {
      title: '🧠 PERSONAL AI (NEW!)',
      commands: [
        { cmd: '/project', desc: 'Set active project (repos or job search)', usage: '/project espaluz\n/project job\nNow /readfile main.py or job-focused commands work without specifying repo.' },
        { cmd: '/know', desc: 'Search your knowledge base', usage: '/know pricing strategy\n/know EspaLuz features' },
        { cmd: '/diary', desc: 'Quick diary entry', usage: '/diary Today I launched the new feature...' },
        { cmd: '/task', desc: 'Save a task directly', usage: '/task Build combinator for Aiden, Tora and AILA' },
        { cmd: '/tasks', desc: 'Show your pending tasks', usage: '/tasks' },
        { cmd: '/research', desc: 'Save research notes', usage: '/research Competitor X charges $20/mo' },
        { cmd: '/rules', desc: 'Show project rules (CLAUDE.md or JOB_SEARCH.md)', usage: '/rules\nIn /project job, this shows JOB_SEARCH rules.' },
        { cmd: '/resume', desc: 'Restore your last session', usage: '/resume\nLoads your context from database' },
        { cmd: '/forget', desc: 'Clear conversation memory', usage: '/forget\nStart fresh (keeps knowledge base)' },
      ]
    },
    'wiring': {
      title: '📊 BUSINESS WIRING',
      commands: [
        { cmd: '/research_company',    desc: '🔥 NEW (hackathon) — Autonomous Claude + Bright Data research on a prospect. Returns founder, pain signals, decision-maker, sendable pitch angle, HOT/WARM/COLD verdict. ~90s.', usage: '/research_company decircle.io\n/research_company Acme.ai' },
        { cmd: '/research_employer',   desc: '🎯 NEW (hackathon) — Same agent, employer mode. Recent funding, hiring patterns, tech stack, comp signals, application angle for you.', usage: '/research_employer Cresta\n/research_employer Anthropic' },
        { cmd: '/research_competitor', desc: '📚 NEW (hackathon) — Same agent, SEO/AEO competitor gap analysis. Returns top-ranking content + 3-5 blog topic gaps for your daily publisher.', usage: '/research_competitor brain.fm\n/research_competitor manny-santos.com' },
        { cmd: '/briefing',       desc: '📋 Full business snapshot — agents, leads, EspaLuz, health. Start here every morning.', usage: '/briefing' },
        { cmd: '/outcomes',       desc: '✅ What your AI agents actually did today — posts, leads, emails, revenue.', usage: '/outcomes\n/outcomes cmo' },
        { cmd: '/leads',          desc: '👥 Everyone who has shown interest in working with you — your live client list.', usage: '/leads\n/leads new' },
        { cmd: '/lead',           desc: '➕ Manually add someone you spotted — so you never lose a potential client.', usage: '/lead add linkedin John at TechCorp asked about AI agents' },
        { cmd: '/outreach',       desc: '📬 Sales pipeline health — companies targeted, emails sent, who replied.', usage: '/outreach' },
        { cmd: '/fresh_leads',    desc: '🔍 Finds companies hiring/building RIGHT NOW on HN, GitHub, Product Hunt. Auto-runs Tue + Fri 7am.', usage: '/fresh_leads\n/fresh_leads all — include Product Hunt' },
        { cmd: '/outreach_ingest',desc: '🚀 Discovers YC-backed startups and finds their founder emails automatically.', usage: '/outreach_ingest' },
        { cmd: '/places_ingest',  desc: '📍 Local businesses by industry + city — builds your local prospect list.', usage: '/places_ingest construction Lexington KY\n/places_ingest architects Panama City' },
        { cmd: '/doc_ingest',     desc: '📄 Paste any doc (RFP, email, list) — AI pulls every potential client from it.', usage: '/doc_ingest\n[paste document text below]' },
        { cmd: '/outreach_drafts',desc: '✉️ Outreach emails written and waiting for your review before sending.', usage: '/outreach_drafts' },
        { cmd: '/pending_leads',  desc: '🔒 Pipeline companies stuck because we have no email yet — shows who needs unblocking.', usage: '/pending_leads' },
        { cmd: '/add_email',      desc: '📧 Unblock a stuck lead by adding their email so outreach can proceed.', usage: '/add_email <lead-id> ceo@company.com' },
        { cmd: '/linkedin_draft', desc: '💼 AI writes your 300-char LinkedIn connection message — copy-paste ready.', usage: '/linkedin_draft fintech startup Panama' },
        { cmd: '/triage',         desc: '🎯 AI scores every prospect 1–5, tells you who to contact TODAY, pushes best to HubSpot. Run after /fresh_leads.', usage: '/triage' },
        { cmd: '/hubspot',        desc: '🟠 Your HubSpot CRM live — view contacts/deals or sync your full pipeline there.', usage: '/hubspot\n/hubspot sync — push all pipeline to HubSpot' },
        { cmd: '/xlsx',           desc: '📊 Download full pipeline as a spreadsheet — open in Excel or Google Sheets.', usage: '/xlsx' },
        { cmd: '/cleanbiz',       desc: '🧹 Remove test/fake entries so triage and HubSpot work on real data only.', usage: '/cleanbiz\n/cleanbiz confirm — delete permanently' },
        { cmd: '/espaluz',        desc: '🌟 EspaLuz tutoring business pulse — trials, paying subscribers, revenue.', usage: '/espaluz' },
        { cmd: '/outcome',        desc: '📝 Log what an AI agent just did. Used automatically — you can also log manually.', usage: '/outcome cmo post_published linkedin' },
      ]
    },
    'chat': {
      title: '💬 CHAT & MEDIA',
      commands: [
        { cmd: '/ask', desc: 'Ask me anything', usage: '/ask How do I fix this error?' },
        { cmd: '🎤 Voice', desc: 'Send a voice message', usage: 'Just record and send! I transcribe and understand.' },
        { cmd: '📸 Photo', desc: 'Send a screenshot', usage: 'Send any image - I\'ll analyze it!' },
      ]
    },
  };
  
  async function showMenu(ctx: Context) {
    const menuMessage = `🤖 *CTO AIPA v6.0 - PERSONAL AI CO-FOUNDER*

_Tap a section below to see commands and usage examples!_

Or just ask me anything - I understand natural language!`;
    
    await ctx.reply(menuMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 Cursor-Twin', callback_data: 'menu:cursor_twin' },
            { text: '🧠 Session Memory', callback_data: 'menu:session_memory' },
          ],
          [
            { text: '⚡ Power Features', callback_data: 'menu:power' },
            { text: '🧠 Strategic', callback_data: 'menu:strategic' },
          ],
          [
            { text: '🏥 Monitoring', callback_data: 'menu:monitoring' },
            { text: '📚 Learning', callback_data: 'menu:learning' },
          ],
          [
            { text: '💻 Code Gen', callback_data: 'menu:code_gen' },
            { text: '🏛️ Decisions', callback_data: 'menu:decisions' },
          ],
          [
            { text: '🔍 Repos & Ideas', callback_data: 'menu:repos' },
            { text: '🧠 Personal AI ✨', callback_data: 'menu:personal_ai' },
          ],
          [
            { text: '📊 Business Wiring', callback_data: 'menu:wiring' },
            { text: '💬 Chat & Media', callback_data: 'menu:chat' },
          ],
          [
            { text: '⚙️ Settings', callback_data: 'menu:settings' },
          ],
        ]
      }
    });
  }
  
  // Handle menu section callbacks - using callbackQuery filter for better grammY compatibility
  bot.callbackQuery(/^menu:/, async (ctx) => {
    const data = ctx.callbackQuery?.data || '';
    console.log(`📲 Menu callback received: ${data}`);
    
    const section = data.replace('menu:', '');
    
    if (section === 'settings') {
      await ctx.answerCallbackQuery();
      await ctx.reply(`⚙️ *Settings*

/alerts - Toggle daily proactive alerts
/roadmap - View CTO AIPA roadmap
/forget - Clear my memory of our conversations
/resume - Restore last session`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (section === 'main') {
      await ctx.answerCallbackQuery();
      await showMenu(ctx);
      return;
    }

    // Special-case: Personal AI menu, keep response very small & robust (no Markdown to avoid parse errors)
    if (section === 'personal_ai') {
      await ctx.answerCallbackQuery();
      await ctx.reply(
`🧠 PERSONAL AI (JOB + PROJECTS)

/project  - Set active project or job search mode
  Example: /project job  (JOB_SEARCH umbrella: VibeJob Hunter + YC shortlist)

/rules    - Show project rules
  In JOB_SEARCH mode this shows JOB_SEARCH.md summary

/know     - Search your knowledge base
/diary    - Save diary entry (job search or project)
/task     - Save a task directly
/tasks    - Show your pending tasks
/done N   - Mark task #N as done (removes it)
/cleartasks auto - AI cleans up stale tasks
/research - Save research / market notes
/resume   - Restore last session
/forget   - Clear conversation context (keeps knowledge base)
/trello_analyze - Full Kanban analysis of all Trello boards

🎤 Voice → Trello — just speak naturally, no trigger phrase needed:
  "Until June 20, call the car inspection and find the counteragent address"
  → AI creates cards on the right board, right list, with due date

  "Move the court cards to Kira Junio"
  → Finds cards by name and moves them

  "Archive those cards" / "Заархивируй те карточки"
  → Archives the last created cards

  One voice message can create + move + archive at once`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Back to Menu', callback_data: 'menu:main' }]
          ]
        }
      });
      return;
    }

    const sectionData = MENU_SECTIONS[section];
    if (!sectionData) {
      await ctx.answerCallbackQuery({ text: 'Unknown section' });
      return;
    }
    
    await ctx.answerCallbackQuery();

    // Use HTML — Markdown v1 chokes on underscores inside bold (**/fresh_leads**)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let response = `<b>${esc(sectionData.title)}</b>\n\n`;

    for (const cmd of sectionData.commands) {
      response += `<b>${esc(cmd.cmd)}</b>\n`;
      response += `${esc(cmd.desc)}\n`;
      response += `<code>${esc((cmd.usage || '').split('\n')[0] || '')}</code>\n\n`;
    }

    await ctx.reply(response, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Back to Menu', callback_data: 'menu:main' }],
        ],
      },
    });
  });
  
  // Handle command detail callbacks
  bot.callbackQuery(/^cmd:/, async (ctx) => {
    const data = ctx.callbackQuery?.data || '';
    const cmdName = data.replace('cmd:', '');
    console.log(`📲 Command callback received: ${cmdName}`);
    await ctx.answerCallbackQuery();
    
    // Find the command in sections
    for (const [sectionKey, section] of Object.entries(MENU_SECTIONS)) {
      const cmd = section.commands.find(c => c.cmd === '/' + cmdName || c.cmd === cmdName);
      if (cmd) {
        await ctx.reply(`*${cmd.cmd}*

📝 *What it does:*
${cmd.desc}

💡 *Usage:*
\`\`\`
${cmd.usage}
\`\`\`

_Try it now! Just tap the command above._`, { parse_mode: 'Markdown' });
        return;
      }
    }
    
    await ctx.reply(`Command /${cmdName} not found in help.`);
  });
  
  // /status - Ecosystem status
  bot.command('status', async (ctx) => {
    await ctx.reply('🔍 Checking AIdeazz ecosystem...');
    
    try {
      // Check CTO AIPA
      const ctoStatus = '✅ CTO AIPA: Online (Oracle Cloud)';
      
      // Check CMO AIPA
      let cmoStatus = '❓ CMO AIPA: Checking...';
      try {
        const cmoResponse = await fetch('https://vibejobhunter-production.up.railway.app/health');
        cmoStatus = cmoResponse.ok ? '✅ CMO AIPA: Online (Railway)' : '⚠️ CMO AIPA: Issues detected';
      } catch {
        cmoStatus = '❌ CMO AIPA: Offline';
      }
      
      // Get recent activity
      const repos = await octokit.repos.listForUser({ username: 'ElenaRevicheva', per_page: 5, sort: 'updated' });
      const recentRepos = repos.data.map(r => `• ${r.name}`).join('\n');
      
      const statusMessage = `
📊 *AIdeazz Ecosystem Status*

🤖 *Services*
${ctoStatus}
${cmoStatus}

📁 *Recently Updated Repos*
${recentRepos}

🧠 *AI Models Active*
• Claude Opus 4 (strategic)
• Llama 3.3 70B (fast reviews)

💰 *Cost This Month*: ~$0.50
      `;
      
      await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      await ctx.reply('❌ Error checking status. Try again later.');
      console.error('Status check error:', error);
    }
  });
  
  // /repos - List repositories with aliases
  bot.command('repos', async (ctx) => {
    // Build list with aliases for each repo
    const repoList = AIDEAZZ_REPOS.map((repo, i) => {
      const aliases = Object.entries(REPO_ALIASES)
        .filter(([_, v]) => v === repo)
        .map(([k]) => k);
      const aliasText = aliases.length > 0 ? ` → \`${aliases[0]}\`` : '';
      const num = i < 9 ? `${i + 1}️⃣` : i === 9 ? '🔟' : '1️⃣1️⃣';
      return `${num} ${escapeMarkdown(repo)}${aliasText}`;
    }).join('\n');
    
    const reposMessage = `
📦 *AIdeazz Repositories (11)*

${repoList}

*Shortcuts:* cto, cmo, espaluz, atuona, dragon, saas, docs, pitch

👉 Try: \`/review cto\` or \`/architecture espaluz\`
    `;
    await ctx.reply(reposMessage, { parse_mode: 'Markdown' });
  });
  
  // /ask - Ask a question
  bot.command('ask', async (ctx) => {
    const question = ctx.message?.text?.replace('/ask', '').trim();
    
    if (!question) {
      await ctx.reply(`💬 *ASK ME ANYTHING*

*What is this?*
Ask any technical question - about coding, architecture, your products, or anything else!

*Examples (copy and edit):*
\`/ask Should I use PostgreSQL or MongoDB for EspaLuz?\`
\`/ask How do I handle errors in async functions?\`
\`/ask What's the best way to structure my Telegram bot?\`
\`/ask How does OAuth work?\`

*Or just chat!*
You can also just send a message without /ask and I'll respond.

👉 *Try now:* Ask any question!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await handleQuestion(ctx, question);
  });
  
  // /suggest - Get a suggestion
  bot.command('suggest', async (ctx) => {
    await ctx.reply(`💡 *Getting today's suggestion...*`, { parse_mode: 'Markdown' });
    await handleQuestion(ctx, 'Give me one actionable suggestion for today that would have the highest impact on AIdeazz. Be specific and concise.');
  });
  
  // /roadmap - Show roadmap
  bot.command('roadmap', async (ctx) => {
    const roadmapMessage = `
🛣️ *CTO AIPA Roadmap*

✅ *Completed*
• PR/Push reviews
• Ask CTO endpoint
• CMO integration
• Telegram bot
• Daily briefings
• Voice messages
• Proactive alerts
• Screenshot analysis 📸
• Idea capture 💡
• Ecosystem stats 📊
• Learn to code system 🎓
• CTO writes code /code 💻
• CTO fixes bugs /fix 🔧

📋 *Planned*
• Test generation
• Performance monitoring
• Multi-agent collaboration

💡 Use */suggest* for today's priority!
    `;
    await ctx.reply(roadmapMessage, { parse_mode: 'Markdown' });
  });
  
  // /daily - Daily briefing
  bot.command('daily', async (ctx) => {
    // Save chat ID for proactive alerts
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    await sendDailyBriefing(ctx);
  });

  // =============================================================================
  // BUSINESS WIRING COMMANDS (Week 1 Build)
  // =============================================================================

  // /briefing - Unified business briefing (the core wiring product)
  bot.command('briefing', async (ctx) => {
    await ctx.reply('📊 Generating unified business briefing...');
    try {
      // Pull from all three new tables in parallel
      const [outcomeSummary, leads, espaluzSummary, expiringTrials] = await Promise.all([
        getOutcomeSummary(24),
        getLeads(undefined, 10),
        getEspaluzFunnelSummary(),
        getEspaluzExpiringTrials(2)
      ]);

      // Format briefing as plain text — no Markdown parse mode to avoid escaping nightmares
      const conversionRate = outcomeSummary.total > 0
        ? Math.round((outcomeSummary.positive / outcomeSummary.total) * 100)
        : 0;
      const agentBreakdown = Object.keys(outcomeSummary.by_agent).length > 0
        ? '\nBy agent: ' + Object.entries(outcomeSummary.by_agent).map(([a, c]) => `${a}: ${c}`).join(', ')
        : '';

      const highLeads = (leads as any[]).filter((l: any) => l[3] === 'high' || l[4] === 'high');
      const newLeads = (leads as any[]).filter((l: any) => l[5] === 'new' || l[4] === 'new');
      const highLeadsList = highLeads.length > 0
        ? '\n\n⚡ High-signal leads:\n' + highLeads.slice(0, 3).map((l: any) =>
          `• ${l[2] || l[1] || 'unknown'} (${l[1] || l[0]})`).join('\n')
        : '';

      const trialSection = expiringTrials.length > 0
        ? `\n\n⏰ EXPIRING TRIALS\n${(expiringTrials as any[]).map((t: any) =>
          `• ${t[1] || t[0]} (${t[2] || t[1]}) — expires ${t[4] || 'soon'}`).join('\n')}\nSend retention message?`
        : '';

      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const briefing = `📊 AIdeazz Business Briefing
${dateStr}

📈 OUTCOMES (last 24h)
Actions taken: ${outcomeSummary.total}
Verified delivered: ${outcomeSummary.verified_delivered} ✅
Verified failed: ${outcomeSummary.verified_failed}${outcomeSummary.verified_failed > 0 ? ' ⚠️' : ''}
Pending verification: ${outcomeSummary.pending}
Positive outcomes: ${outcomeSummary.positive}
Activity→Outcome rate: ${conversionRate}%${agentBreakdown}

💰 REVENUE (EspaLuz)
Active subscribers: ${espaluzSummary.active_paid} ($${espaluzSummary.monthly_revenue.toFixed(2)}/mo)
Active trials: ${espaluzSummary.active_trials}
Expiring soon: ${espaluzSummary.expiring_soon}${espaluzSummary.expiring_soon > 0 ? ' ⚠️' : ''}
Churned: ${espaluzSummary.churned}
Total users tracked: ${espaluzSummary.total_users}

🎯 LEADS
Total tracked: ${(leads as any[]).length}
High signal: ${highLeads.length}
New (uncontacted): ${newLeads.length}${highLeadsList}${trialSection}

/outcomes — detailed agent view
/leads — full lead list
/espaluz — funnel details`;

      await ctx.reply(briefing);

      // Log this briefing as an outcome
      await saveAgentOutcome('cto_aipa', 'briefing_generated', {
        outcomes: outcomeSummary,
        revenue: espaluzSummary.monthly_revenue,
        leads_count: (leads as any[]).length
      }, 'verified_delivered');

    } catch (error) {
      console.error('Briefing error:', error);
      await ctx.reply('❌ Error generating briefing. Individual commands still work: /outcomes, /leads, /espaluz');
    }
  });

  // /outcomes - View agent outcomes
  bot.command('outcomes', async (ctx) => {
    const agentFilter = ctx.message?.text?.replace('/outcomes', '').trim() || undefined;
    try {
      const outcomes = await getAgentOutcomes(agentFilter, 48, 15);
      if (!outcomes || (outcomes as any[]).length === 0) {
        await ctx.reply(`📈 No outcomes recorded${agentFilter ? ` for ${agentFilter}` : ''} in last 48h.\n\nUse /outcome to log one:\n/outcome cmo post_published {"platform":"linkedin"}`);
        return;
      }
      const lines = (outcomes as any[]).map((o: any) => {
        const agent = o[1] || o[0];
        const action = o[2] || o[1];
        const detailRaw = o[3];
        const status = o[4] || o[3];
        const createdAt = o[6];
        const statusIcon = status === 'outcome_positive' ? '✅' :
                          status === 'verified_delivered' ? '📨' :
                          status === 'verified_failed' ? '❌' :
                          status === 'pending_verification' ? '⏳' : '❓';
        // Parse detail JSON for key facts
        let detail = '';
        try {
          const d = typeof detailRaw === 'string' ? JSON.parse(detailRaw) : (detailRaw || {});
          const parts: string[] = [];
          // User lessons
          if (d.user_id) parts.push(`user: ${String(d.user_id).slice(-6)}`);
          if (d.topic) parts.push(`"${String(d.topic).slice(0, 30)}"`);
          if (d.lesson_type) parts.push(d.lesson_type);
          // GitHub push reviews
          if (d.repo) parts.push(`repo: ${String(d.repo).split('/')[1] || d.repo}`);
          if (d.commits_count) parts.push(`${d.commits_count} commit${d.commits_count !== 1 ? 's' : ''}`);
          if (d.security_issues !== undefined && d.security_issues > 0) parts.push(`⚠️ ${d.security_issues} sec`);
          if (d.commit_messages) parts.push(`"${String(d.commit_messages).slice(0, 40)}"`);
          // Briefings
          if (d.revenue !== undefined) parts.push(`$${Number(d.revenue).toFixed(2)} MRR`);
          if (d.leads_count !== undefined) parts.push(`${d.leads_count} leads`);
          if (d.outcomes?.total !== undefined) parts.push(`${d.outcomes.total} prior outcomes`);
          // Generic
          if (d.platform) parts.push(d.platform);
          if (d.channel) parts.push(d.channel);
          if (parts.length > 0) detail = ` · ${parts.join(', ')}`;
        } catch {}
        // Format timestamp as HH:MM
        let timeStr = '';
        try {
          const t = new Date(createdAt);
          timeStr = ` [${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Panama' })}]`;
        } catch {}
        return `${statusIcon} ${agent}: ${action}${timeStr}${detail}`;
      });
      await ctx.reply(`📈 Agent Outcomes (48h) — ${(outcomes as any[]).length} events${agentFilter ? ` [${agentFilter}]` : ''}\n\n${lines.join('\n')}`);
    } catch (error) {
      console.error('Outcomes error:', error);
      await ctx.reply('❌ Error fetching outcomes.');
    }
  });

  // /outcome - Log an agent outcome manually
  bot.command('outcome', async (ctx) => {
    const parts = ctx.message?.text?.replace('/outcome', '').trim().split(/\s+/, 3) || [];
    if (parts.length < 2) {
      await ctx.reply('📝 Log an outcome:\n\n/outcome <agent> <action_type> [detail_json]\n\nExamples:\n/outcome cmo post_published {"platform":"linkedin"}\n/outcome vjh application_sent {"company":"TechCorp"}\n/outcome espaluz user_signup {"channel":"whatsapp"}');
      return;
    }
    const agentName = parts[0] || 'unknown';
    const actionType = parts[1] || 'unknown';
    const detailRaw = ctx.message?.text?.replace('/outcome', '').trim().substring(agentName.length + actionType.length + 2);
    let detail: any = {};
    try { detail = detailRaw ? JSON.parse(detailRaw) : {}; } catch { detail = { raw: detailRaw }; }

    const id = await saveAgentOutcome(agentName, actionType, detail);
    if (id) {
      await ctx.reply(`✅ Outcome logged: ${agentName} → ${actionType}\nID: ${id.substring(0, 8)}...\n\nStatus: pending verification. Use /briefing to see summary.`);
    } else {
      await ctx.reply('❌ Failed to save outcome.');
    }
  });

  // MAY 25 2026 (hackathon): autonomous research agent commands
  // ============================================================================
  // Powered by Claude tool-use loop over Bright Data SERP API + Web Unlocker
  // + Scraping Browser. Inspired by Stephen Kimoi's lablab tutorial, adapted
  // to AIdeazz's production multi-agent context (output flows where the
  // existing CRM / blog / Telegram plumbing already lives).
  //
  // Three modes, three real goals:
  //   /research_company <name>     → find/qualify CLIENT prospects
  //   /research_employer <name>    → research a hiring target before applying
  //   /research_competitor <domain>→ SEO/AEO competitor gap analysis for blog
  // ============================================================================
  async function runResearchTelegram(ctx: any, mode: ResearchMode, cmdName: string): Promise<void> {
    const raw = ctx.message?.text?.replace('/' + cmdName, '').trim() || '';
    if (!raw) {
      await ctx.reply(`Usage: /${cmdName} <company-or-domain>\n\nExample: /${cmdName} Cresta`);
      return;
    }
    const startedAt = Date.now();
    await ctx.reply(`🔍 Researching ${raw} (${mode} mode) via Bright Data + Claude tool-use loop. This typically takes 30-90 seconds.`);

    try {
      const result = await runResearchAgent(anthropic, raw, mode, { maxToolCalls: 8, timeoutMs: 150_000 });
      if (!result.ok) {
        await ctx.reply(`❌ Research failed for ${raw}: ${result.error || 'unknown'}\n\n${result.report.slice(0, 1000)}`);
        return;
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const header = `📊 *Research: ${raw}* (${mode})\n` +
        `_${result.toolCalls} BrightData tool calls · ${elapsed}s · model claude-sonnet-4-5_` +
        (result.truncatedAt ? `\n⚠️ Truncated at ${result.truncatedAt}` : '') +
        `\n\n`;

      // Telegram caps at 4096 chars. Chunk if needed (preserve markdown by splitting on blank lines).
      const fullText = header + result.report;
      const MAX = 4000;
      if (fullText.length <= MAX) {
        await ctx.reply(fullText, { parse_mode: 'Markdown' as const });
      } else {
        const chunks: string[] = [];
        let buf = '';
        for (const para of fullText.split('\n\n')) {
          if ((buf + '\n\n' + para).length > MAX) {
            if (buf) chunks.push(buf);
            buf = para;
          } else {
            buf = buf ? buf + '\n\n' + para : para;
          }
        }
        if (buf) chunks.push(buf);
        for (const c of chunks) {
          try { await ctx.reply(c, { parse_mode: 'Markdown' as const }); } catch {
            // If markdown parse fails (special chars in scraped text), retry plain
            await ctx.reply(c);
          }
          await new Promise(r => setTimeout(r, 400));
        }
      }
    } catch (err) {
      await ctx.reply(`❌ Research agent error: ${(err as Error).message?.slice(0, 300)}`);
    }
  }

  bot.command('research_company',    async (ctx) => { await runResearchTelegram(ctx, 'client',     'research_company'); });
  bot.command('research_employer',   async (ctx) => { await runResearchTelegram(ctx, 'employer',   'research_employer'); });
  bot.command('research_competitor', async (ctx) => { await runResearchTelegram(ctx, 'competitor', 'research_competitor'); });

  // /leads - View business leads
  bot.command('leads', async (ctx) => {
    const statusFilter = ctx.message?.text?.replace('/leads', '').trim() || undefined;
    try {
      const leads = await getLeads(statusFilter, 20);
      if (!leads || (leads as any[]).length === 0) {
        await ctx.reply(`🎯 No leads${statusFilter ? ` with status "${statusFilter}"` : ''} yet.\n\nAdd one:\n/lead add linkedin John_Doe commented on automation post`);
        return;
      }
      const lines = (leads as any[]).map((l: any) => {
        const name = l[2] || l[1] || 'unknown';
        const source = l[1] || l[0];
        const signal = l[3] || l[4] || 'low';
        const status = l[5] || l[4] || 'new';
        const signalIcon = signal === 'high' ? '🔥' : signal === 'medium' ? '⚡' : '·';
        return `${signalIcon} ${name} (${source}) — ${status}`;
      });
      await ctx.reply(`🎯 Business Leads${statusFilter ? ` — ${statusFilter}` : ''}\n\n${lines.join('\n')}\n\n/lead add <source> <name> <context>\n/lead update <id> <status>`);
    } catch (error) {
      console.error('Leads error:', error);
      await ctx.reply('❌ Error fetching leads.');
    }
  });

  // /lead - Add or update a lead
  bot.command('lead', async (ctx) => {
    const text = ctx.message?.text?.replace('/lead', '').trim() || '';
    const parts = text.split(/\s+/);

    if (parts[0] === 'add' && parts.length >= 3) {
      const source = parts[1] || 'unknown';
      const name = parts[2] || 'unknown';
      const context = parts.slice(3).join(' ') || '';
      const signal = context.toLowerCase().includes('dm') || context.toLowerCase().includes('comment') ? 'high' :
                     context.toLowerCase().includes('like') ? 'medium' : 'low';
      const id = await saveLead(source, name, context, signal);
      if (id) {
        await ctx.reply(`✅ Lead added: ${name} from ${source}\nSignal: ${signal === 'high' ? '🔥 high' : signal === 'medium' ? '⚡ medium' : '· low'}\nID: ${id.substring(0, 8)}...`);
      } else {
        await ctx.reply('❌ Failed to save lead.');
      }
    } else if (parts[0] === 'update' && parts.length >= 3) {
      const leadId = parts[1] || '';
      const status = parts[2] || 'new';
      const nextAction = parts.slice(3).join(' ') || undefined;
      const success = await updateLead(leadId, status, nextAction);
      if (success) {
        await ctx.reply(`✅ Lead updated to: ${status}${nextAction ? `\nNext: ${nextAction}` : ''}`);
      } else {
        await ctx.reply('❌ Failed to update lead. Check the ID.');
      }
    } else {
      await ctx.reply('🎯 Lead management:\n\nAdd:\n/lead add <source> <name> <context>\nExample: /lead add linkedin John_Doe commented on wiring post\n\nUpdate:\n/lead update <id> <status> [next action]\nStatuses: new, contacted, in-conversation, converted, lost');
    }
  });

  // /outreach - Outreach pipeline stats
  bot.command('outreach', async (ctx) => {
    try {
      const stats = await getOutreachStats();
      // Plain text only — legacy Telegram Markdown breaks on e.g. "0/10" (slash + digits).
      const msg = [
        `📧 Outreach Pipeline — Phase 4`,
        ``,
        `Targets: ${stats.total_targets}`,
        `Emails sent: ${stats.total_sent} (today: ${stats.sent_today} of 10 cap)`,
        `Replies: ${stats.total_replies}`,
        `Reply rate: ${stats.reply_rate}`,
        ``,
        `Commands:`,
        `/outreach_ingest — YC + Hunter.io → Oracle`,
        `/outreach_drafts — Pending drafts`,
        `/outreach_stats — Full stats (HTTP)`,
      ].join('\n');
      await ctx.reply(msg);
    } catch (error) {
      console.error('Outreach stats error:', error);
      await ctx.reply(
        `❌ Error fetching outreach stats: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // /xlsx — export outreach pipeline to CSV and send as file
  bot.command('xlsx', async (ctx) => {
    try {
      await ctx.reply('📊 Building pipeline export...');
      const rows = await getOutreachTargets({ limit: 500 }) as any[];
      if (rows.length === 0) {
        await ctx.reply('📭 No targets in pipeline yet. Run /fresh_leads first.');
        return;
      }

      // Build CSV — columns match getOutreachTargets query order:
      // id, name, company, email, email_status, linkedin_url, source, pain_point, matched_system, status, created_at, updated_at
      const header = 'Company,Contact Name,Email,Email Status,Source,Pain Point,Matched AIdeazz System,Pipeline Status,Added';
      const lines = rows.map((r: any) => {
        const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const date = r[10] ? new Date(r[10]).toLocaleDateString('en-US') : '';
        return [esc(r[2]), esc(r[1]), esc(r[3]), esc(r[4]), esc(r[6]), esc(r[7]), esc(r[8]), esc(r[9]), esc(date)].join(',');
      });

      const csv = [header, ...lines].join('\n');
      const buf = Buffer.from(csv, 'utf-8');

      // Count real emails vs pattern
      const withEmail = rows.filter((r: any) => r[3] && !String(r[3]).startsWith('founder@')).length;
      const bySource: Record<string, number> = {};
      for (const r of rows) {
        const s = String(r[6] || 'unknown').split('_')[0] || 'unknown';
        bySource[s] = (bySource[s] || 0) + 1;
      }

      await ctx.replyWithDocument(
        new InputFile(buf, `pipeline_${new Date().toISOString().slice(0, 10)}.csv`),
        { caption: `📊 Pipeline export — ${rows.length} companies\n✉️ With real email: ${withEmail}\nSources: ${Object.entries(bySource).map(([k,v]) => `${k}:${v}`).join(' · ')}\n\nOpen in Excel — File → Import → CSV` }
      );
    } catch (error) {
      console.error('/xlsx error:', error);
      await ctx.reply(`❌ Export error: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // /cleanbiz — remove test/fake entries from business_leads and lead_triage
  bot.command('cleanbiz', async (ctx) => {
    const arg = ctx.message?.text?.replace('/cleanbiz', '').trim().toLowerCase() || '';
    if (arg !== 'confirm') {
      // Show what will be deleted first
      try {
        const leads = await getLeads() as any[];
        const testEntries = leads.filter((r: any) => {
          const name = String(r[1] || '').toLowerCase();
          return /^(e2e|test|demo|sample|fake|typo|tytjyt|katarinar)/.test(name) ||
                 ['hope','kate','irina','maya','katya','marina','katerina'].includes(name);
        });
        if (testEntries.length === 0) {
          await ctx.reply('✅ No test entries found in business_leads — already clean.');
          return;
        }
        const list = testEntries.map((r: any) => `• ${r[1] || 'unknown'} (${r[0] || 'no source'})`).join('\n');
        await ctx.reply(`🧹 Found ${testEntries.length} test entries to remove:\n\n${list}\n\nReply /cleanbiz confirm to delete.`);
      } catch (e) {
        await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    // Confirmed — delete via proper DB function
    try {
      const testNames = ['E2E','E2E2','typo','tytjyt','katarinar','hope','kate','Elena Revicheva','irina','Maya','Katya','Marina','Katerina'];
      const result = await deleteTestBusinessLeads(testNames);
      await ctx.reply(
        `✅ Cleaned:\n• business_leads removed: ${result.blDeleted}\n• lead_triage rows removed: ${result.trDeleted}\n\nRun /triage to classify real leads only.`
      );
    } catch (e) {
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // /outreach_drafts - Show draft emails ready for review
  bot.command('outreach_drafts', async (ctx) => {
    try {
      const rawDrafts = await getOutreachDrafts();
      if (!rawDrafts || rawDrafts.length === 0) {
        await ctx.reply('📝 No outreach drafts pending.\n\nRun /outreach_ingest to discover YC companies, or import targets via POST /outreach/targets/import.');
        return;
      }
      const lines = (rawDrafts as any[]).slice(0, 5).map((row: any, i: number) => {
        const [, , subject, body, , name, company] = row;
        return `*${i + 1}. ${name || 'Unknown'} (${company || '?'})*\nSubject: ${subject || '—'}\nPreview: ${(body || '').slice(0, 100)}…`;
      });
      await ctx.reply(`📝 *Outreach Drafts* (${rawDrafts.length} total)\n\n${lines.join('\n\n')}\n\nApprove all: POST /outreach/send`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Outreach drafts error:', error);
      await ctx.reply('❌ Error fetching drafts.');
    }
  });

  // /pending_leads — show targets with no email (stuck in pipeline)
  bot.command('pending_leads', async (ctx) => {
    try {
      const leads = await getPendingLeads(15);
      if (!leads || leads.length === 0) {
        await ctx.reply('✅ No pending leads — all targets have emails.');
        return;
      }
      const lines = leads.map((r: any, i: number) => {
        const id = (r.ID || r.id || '').toString().slice(0, 8);
        const company = r.COMPANY || r.company || '?';
        const pain = (r.PAIN_POINT || r.pain_point || '').slice(0, 80);
        // Extract website from pain_point if stored there
        const webMatch = pain.match(/https?:\/\/[^\s,)]+/);
        const website = webMatch ? webMatch[0] : null;
        return `${i + 1}. *${company}* [${id}]\n${website ? `🌐 ${website}\n` : ''}📝 ${pain.slice(0, 60)}`;
      });
      const msg = `📭 *${leads.length} leads with no email*\n\nTo add email:\n/add_email <8-char-id> <email>\n\n${lines.join('\n\n')}`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // /add_email <id> <email> — manually add email to a pending lead
  bot.command('add_email', async (ctx) => {
    try {
      const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
      if (args.length < 2) {
        await ctx.reply('Usage: /add_email <target-id-prefix> <email>\nGet IDs from /pending_leads');
        return;
      }
      const [idPrefix, email] = args;
      if (!idPrefix || !email || !email.includes('@')) {
        await ctx.reply('❌ Invalid args. Usage: /add_email <id> user@company.com');
        return;
      }
      // Query the full ID from prefix
      const leads = await getPendingLeads(50);
      const match = leads.find((r: any) => {
        const id = (r.ID || r.id || '').toString();
        return id.startsWith(idPrefix.toUpperCase()) || id.toLowerCase().startsWith(idPrefix.toLowerCase());
      });
      if (!match) {
        await ctx.reply(`❌ No pending lead found with id starting "${idPrefix}". Run /pending_leads to get IDs.`);
        return;
      }
      const fullId = (match.ID || match.id || '').toString();
      const company = match.COMPANY || match.company || '?';
      const ok = await updateTargetEmail(fullId, email);
      if (ok) {
        await ctx.reply(`✅ Email set for *${company}*\n${email}\n\nLead will be included in next outreach cycle.`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('❌ DB update failed. Check Oracle connection.');
      }
    } catch (e) {
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // /linkedin_draft <company name> — generate LinkedIn message + search link
  bot.command('linkedin_draft', async (ctx) => {
    try {
      const company = ctx.message?.text?.replace(/^\/linkedin_draft\s*/i, '').trim();
      if (!company) {
        await ctx.reply('Usage: /linkedin_draft <company name>\nExample: /linkedin_draft Chili Panama');
        return;
      }
      await ctx.reply(`✍️ Generating LinkedIn outreach for *${company}*…`, { parse_mode: 'Markdown' });

      const prompt = `Write a short, direct LinkedIn connection request message (300 chars max) from Elena Revicheva, AI automation builder, to a founder/CEO at "${company}".

Context: Elena builds AI automations — Telegram/WhatsApp bots, outreach pipelines, LLM integrations — on Oracle at $0/month infra cost. She wants to connect, not pitch immediately.

Return ONLY the message text. No subject line. No "Hi [Name]" opener that requires a name. Start with a hook about their company or industry.`;

      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      const draft = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : 'Could not generate draft.';

      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + ' founder CEO')}&origin=GLOBAL_SEARCH_HEADER`;

      await ctx.reply(
        `🔗 *LinkedIn draft for ${company}*\n\n${draft}\n\n---\n📋 Copy the message above, then open LinkedIn to find the right person:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔍 Find on LinkedIn →', url: searchUrl },
            ]],
          },
        }
      );
    } catch (e) {
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // /outreach_ingest - Manually trigger prospect ingestion
  bot.command('outreach_ingest', async (ctx) => {
    try {
      await ctx.reply('🔍 Starting prospect ingestion (YC companies → Hunter.io → Oracle)…\nThis may take 1-2 minutes.');
      const result = await runProspectIngestion(anthropic, async (msg) => {
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      });
      if (!result.ingested && !result.skipped) {
        await ctx.reply('⚠️ No companies found to ingest. Check YC JSON path or API.');
      }
    } catch (error) {
      console.error('Outreach ingest error:', error);
      await ctx.reply('❌ Error running prospect ingestion.');
    }
  });

  // /fresh_leads — multi-source fresh prospect ingestion (HN + GitHub + Product Hunt)
  bot.command('fresh_leads', async (ctx) => {
    const arg = ctx.message?.text?.replace('/fresh_leads', '').trim().toLowerCase() || '';
    const sources = arg === 'all' ? ['hn', 'ph', 'github'] as const
                  : arg === 'ph'  ? ['ph'] as const
                  : arg === 'gh'  ? ['github'] as const
                  : ['hn', 'github'] as const; // default: HN + GitHub (no PH token needed)

    await ctx.reply(
      `🔎 Searching fresh prospects...\nSources: ${sources.join(' + ').toUpperCase()}\n\nThis may take 2-3 minutes — fetching, deduplicating, classifying pain points.`
    );

    try {
      const result = await runFreshLeadsIngestion(
        anthropic,
        sources as any,
        async (msg) => { try { await ctx.reply(msg); } catch {} }
      );
      if (result.ingested === 0 && result.skipped === 0) {
        await ctx.reply('⚠️ No new leads found. All companies may already be in pipeline, or source APIs returned empty. Try /fresh_leads all to include Product Hunt.');
      } else {
        // Trigger triage immediately on the fresh batch
        await ctx.reply(`✅ ${result.ingested} new prospects imported.\n\n💡 Run /triage to classify them and push qualified leads to HubSpot.`);
      }
    } catch (error) {
      console.error('Fresh leads error:', error);
      await ctx.reply('❌ Error during fresh leads ingestion. Check server logs.');
    }
  });

  // /places_ingest <industry> <city> — Google Places → outreach targets
  // Usage: /places_ingest construction Lexington KY
  //        /places_ingest architects Panama City
  bot.command('places_ingest', async (ctx) => {
    const args = ctx.message?.text?.replace('/places_ingest', '').trim() || '';
    if (!args) {
      const presetList = Object.keys(INDUSTRY_PRESETS).join(', ');
      await ctx.reply(
        `📍 Usage: /places_ingest <industry> <city>\n\nExamples:\n/places_ingest construction Lexington KY\n/places_ingest architects Panama City\n/places_ingest realtors Louisville KY\n\nIndustry presets: ${presetList}\n\nOr use any free-text industry name.`
      );
      return;
    }
    // Parse city + industry from args.
    // Priority 1: explicit "in" separator  → /places_ingest AI agencies in Panama City
    // Priority 2: last 2 words = city      → /places_ingest AI agencies Panama City
    // Priority 3: last word = city (2-word input) → /places_ingest architects London
    let industry = args;
    let city = '';

    const inSepMatch = args.match(/^(.+?)\s+in\s+(.+)$/i);
    if (inSepMatch) {
      industry = inSepMatch[1]!.trim();
      city = inSepMatch[2]!.trim();
    } else {
      const words = args.split(/\s+/);
      if (words.length >= 3) {
        // Take last 2 words as city (e.g. "Panama City", "Lexington KY", "New York")
        city = words.slice(-2).join(' ');
        industry = words.slice(0, -2).join(' ');
      } else if (words.length === 2) {
        industry = words[0]!;
        city = words[1]!;
      } else {
        await ctx.reply('❌ Please specify both industry and city.\nExamples:\n/places_ingest AI automation agencies Panama City\n/places_ingest architects in Lexington KY\n/places_ingest construction Louisville KY');
        return;
      }
    }
    await ctx.reply(`📍 Searching Google Places: "${industry}" in "${city}"…\nThis may take 1-2 minutes.`);
    try {
      await runPlacesIngestion(anthropic, { city, industry }, async (msg) => {
        await ctx.reply(msg);
      });
    } catch (e) {
      console.error('places_ingest error:', e);
      await ctx.reply(`❌ Places ingest failed: ${String(e).slice(0, 200)}`);
    }
  });

  // /doc_ingest [docType] — paste document text, extract prospects → outreach
  // Usage: /doc_ingest RFP\n<paste document text>
  //        /doc_ingest takeoff sheet\n<paste content>
  bot.command('doc_ingest', async (ctx) => {
    const raw = ctx.message?.text?.replace('/doc_ingest', '').trim() || '';
    if (!raw || raw.length < 20) {
      await ctx.reply(
        `📄 Paste a business document to extract prospects.\n\nUsage:\n/doc_ingest RFP\n[paste your RFP, takeoff sheet, call log, or client list here]\n\nWorks with: RFPs, takeoff sheets, call logs, client lists, contractor directories, email threads.`
      );
      return;
    }
    // First line = docType hint (optional), rest = document text
    const lines = raw.split('\n');
    const firstLine = lines[0]!.trim();
    const isDocTypeHint = firstLine.length < 60 && !/\s{3,}/.test(firstLine);
    const docType = isDocTypeHint ? firstLine : 'pasted document';
    const text = isDocTypeHint ? lines.slice(1).join('\n').trim() : raw;
    if (!text || text.length < 10) {
      await ctx.reply('❌ No document text found after the doc type. Paste the full content.');
      return;
    }
    await ctx.reply(`📄 Processing ${docType} (${text.length} chars)…\nExtracting prospects…`);
    try {
      await runDocIngestion(anthropic, { text, docType }, async (msg) => {
        await ctx.reply(msg);
      });
    } catch (e) {
      console.error('doc_ingest error:', e);
      await ctx.reply(`❌ Doc ingest failed: ${String(e).slice(0, 200)}`);
    }
  });

  // /triage — Phase 5: Run lead triage cycle manually
  bot.command('triage', async (ctx) => {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      await ctx.reply(
        '❌ Phase 5 triage needs ANTHROPIC_API_KEY in Oracle ~/cto-aipa/.env — then `pm2 restart cto-aipa --update-env`.'
      );
      return;
    }
    await ctx.reply('🔍 Running lead triage cycle...');
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const result = await runTriageCycle(groq, anthropic);
      const brief = await buildDailyBrief();
      // MAY 25 2026: buildDailyBrief now returns string|null. Don't print literal 'null'.
      const briefText = brief || '(0 actionable signals right now — Oracle triage + HubSpot pipeline both quiet)';
      await ctx.reply(
        `✅ Triage complete\n\nProcessed: ${result.processed}\nUrgent (4-5): ${result.urgent}\n\n${briefText}`
      );
    } catch (error) {
      console.error('Triage error:', error);
      await ctx.reply('❌ Triage error. Check server logs.');
    }
  });

  // /triage_urgent — Show only urgency 4-5 leads
  bot.command('triage_urgent', async (ctx) => {
    try {
      const brief = await buildDailyBrief();
      // MAY 25 2026: buildDailyBrief can return null on quiet days. Surface a
      // concrete message when invoked manually rather than silently doing nothing.
      await ctx.reply(brief || '📥 Lead Brief: 0 actionable signals right now (Oracle triage + HubSpot pipeline both quiet).');
    } catch (error) {
      await ctx.reply('❌ Error fetching lead brief.');
    }
  });

  // /hubspot — CRM stats + backfill sync
  bot.command('hubspot', async (ctx) => {
    if (!process.env.HUBSPOT_API_KEY?.trim()) {
      await ctx.reply('❌ HUBSPOT_API_KEY not set in .env. Add it and `pm2 restart cto-aipa --update-env`.');
      return;
    }

    const arg = ctx.message?.text?.replace('/hubspot', '').trim().toLowerCase() || '';

    // /hubspot sync — push all existing Oracle outreach_targets to HubSpot
    if (arg === 'sync') {
      await ctx.reply('🔄 Syncing all Oracle outreach targets → HubSpot CRM...');
      try {
        const rows = await getOutreachTargets({ limit: 500 }) as any[];
        if (rows.length === 0) {
          await ctx.reply('📭 No outreach targets in Oracle yet. Run /outreach_ingest first.');
          return;
        }
        let pushed = 0;
        let skipped = 0;
        let failed = 0;
        for (const r of rows) {
          // columns: id, name, company, email, email_status, linkedin_url, source, pain_point, matched_system, status, created_at, updated_at
          const name          = (r[1] || r[2] || '') as string;
          const company       = (r[2] || undefined) as string | undefined;
          const email         = (r[3] || undefined) as string | undefined;
          const linkedinUrl   = (r[5] || undefined) as string | undefined;
          const source        = (r[6] || 'Oracle outreach_targets') as string;
          const painPoint     = (r[7] || undefined) as string | undefined;
          const matchedSystem = (r[8] || undefined) as string | undefined;

          // Skip test/simulated entries
          const isTestName  = /^e2e|^test|^demo|^sample|^fake|^founder @/i.test(name);
          const isPatternEmail = !email || email.startsWith('founder@') || source.endsWith('_pattern');

          // Need at least a real company name or a real email to be worth pushing
          if (isTestName || (!company && isPatternEmail)) { skipped++; continue; }

          // Push without fake email — HubSpot contact will just have name + company
          try {
            const hsResult = await pushLeadToHubSpot({
              name:          name || company || 'Unknown',
              email:         isPatternEmail ? undefined : email,
              company,
              linkedinUrl,
              source,
              painPoint,
              matchedSystem,
            });
            // pushLeadToHubSpot never throws — it returns null on any API error
            const anyCreated = hsResult && (hsResult.contactId || hsResult.companyId || hsResult.dealId);
            if (anyCreated) {
              pushed++;
            } else {
              failed++;
              console.warn(`[HS sync] silent fail for "${name || company}" — result: ${JSON.stringify(hsResult)}`);
            }
          } catch (e: any) {
            failed++;
            console.error(`[HS sync] exception for "${name || company}":`, e?.message || e);
          }
          // Respect HubSpot free-tier 100 req/10s
          await new Promise(res => setTimeout(res, 120));
        }
        const stats = await getHubSpotStats();
        await ctx.reply(
          `✅ HubSpot sync complete\n\n` +
          `Pushed:   ${pushed}\n` +
          `Skipped:  ${skipped} (test/pattern data — not real)\n` +
          `${failed ? `Failed:   ${failed}\n` : ''}` +
          `\n🟠 CRM totals now:\n` +
          `👤 Contacts:  ${stats?.contacts ?? '?'}\n` +
          `🏢 Companies: ${stats?.companies ?? '?'}\n` +
          `💼 Deals:     ${stats?.deals ?? '?'}`
        );
      } catch (error) {
        console.error('HubSpot sync error:', error);
        await ctx.reply('❌ Sync error. Check server logs.');
      }
      return;
    }

    // /hubspot — just show stats
    await ctx.reply('📊 Fetching HubSpot CRM stats...');
    try {
      const stats = await getHubSpotStats();
      if (!stats) {
        await ctx.reply('❌ Could not reach HubSpot API. Check key scopes and network.');
        return;
      }
      await ctx.reply(
        `🟠 HubSpot CRM — aipa@aideazz.xyz\n\n` +
        `👤 Contacts:  ${stats.contacts}\n` +
        `🏢 Companies: ${stats.companies}\n` +
        `💼 Deals:     ${stats.deals}\n\n` +
        `Sync existing targets: /hubspot sync\n` +
        `Auto-push: /outreach_ingest + /triage\n` +
        `Dashboard: app.hubspot.com`
      );
    } catch (error) {
      console.error('HubSpot stats error:', error);
      await ctx.reply('❌ HubSpot stats error. Check server logs.');
    }
  });

  // /espaluz - EspaLuz funnel status
  bot.command('espaluz', async (ctx) => {
    try {
      const [summary, expiring] = await Promise.all([
        getEspaluzFunnelSummary(),
        getEspaluzExpiringTrials(3)
      ]);

      const expiringSection = (expiring as any[]).length > 0
        ? `\n\n⏰ *Expiring Trials (next 3 days)*\n${(expiring as any[]).map((t: any) => {
          const userId = t[1] || t[0];
          const channel = t[2] || t[1];
          return `• ${userId} (${channel})`;
        }).join('\n')}\n_These users need a retention message!_`
        : '\n\n✅ No trials expiring in next 3 days.';

      const convRate = summary.total_users > 0 ? Math.round((summary.active_paid / summary.total_users) * 100) : 0;
      const report = `🇪🇸 *EspaLuz Funnel Report*

💰 *Revenue*
Active paid: ${summary.active_paid} subscribers
Monthly: $${summary.monthly_revenue.toFixed(2)}/mo
Price: $7.77/user/mo

📊 *Funnel*
Total users: ${summary.total_users}
Active trials: ${summary.active_trials}
Paid: ${summary.active_paid}
Churned: ${summary.churned}
Conversion rate: ${convRate}%${expiringSection}

Data source: espaluz-funnel table (Oracle DB)
Note: EspaLuz repos must emit events to keep this current`;

      await ctx.reply(report, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('EspaLuz funnel error:', error);
      await ctx.reply('❌ Error fetching EspaLuz data.');
    }
  });

  // =============================================================================
  // END BUSINESS WIRING COMMANDS
  // =============================================================================

  // /alerts - Toggle proactive alerts
  bot.command('alerts', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    // Check current preference from database (persistent!)
    const prefs = await getAlertPreferences(chatId);
    const currentlyEnabled = prefs?.alertsEnabled ?? false;
    
    // Toggle and save to database
    const newEnabled = !currentlyEnabled;
    await setAlertPreferences(chatId, newEnabled, true);
    
    // Also update in-memory set for current session
    if (newEnabled) {
      alertChatIds.add(chatId);
      await ctx.reply('🔔 Proactive alerts *enabled*! You\'ll receive:\n\n• ☀️ Morning briefing (8 AM Panama)\n• ⚠️ Stale repo warnings\n• 🚨 Service down alerts\n\n✅ _Preference saved to database - persists across restarts!_\n\nUse /alerts again to disable.', { parse_mode: 'Markdown' });
    } else {
      alertChatIds.delete(chatId);
      await ctx.reply('🔕 Proactive alerts *disabled*. You won\'t receive automatic notifications.\n\n✅ _Preference saved to database - persists across restarts!_\n\nUse /alerts again to re-enable.', { parse_mode: 'Markdown' });
    }
  });
  
  // /idea - Capture startup ideas
  bot.command('idea', async (ctx) => {
    const ideaText = ctx.message?.text?.replace('/idea', '').trim();
    
    if (!ideaText) {
      await ctx.reply('💡 Capture your startup idea!\n\nExample: `/idea Add gamification to EspaLuz with XP points and streaks`', { parse_mode: 'Markdown' });
      return;
    }
    
    try {
      // Save idea to database
      const ideaId = `idea_${Date.now()}`;
      await saveMemory('CTO', 'startup_idea', { 
        idea: ideaText,
        id: ideaId 
      }, ideaText, {
        platform: 'telegram',
        type: 'idea',
        user_id: ctx.from?.id,
        timestamp: new Date().toISOString()
      });
      
      // Get AI quick reaction (with Groq fallback)
      const reaction = await askAI(`${AIDEAZZ_CONTEXT}\n\nElena just captured this startup idea: "${ideaText}"\n\nGive a VERY brief reaction (2-3 sentences max): Is it good? One quick suggestion to make it better. Use emojis. Be encouraging!`, 300);
      
      await ctx.reply(`💡 *Idea Captured!*\n\n"${ideaText.substring(0, 200)}${ideaText.length > 200 ? '...' : ''}"\n\n${reaction}\n\n_Use /ideas to view all saved ideas_`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Idea capture error:', error);
      await ctx.reply('❌ Error saving idea. Try again!');
    }
  });
  
  // /ideas - View saved ideas
  bot.command('ideas', async (ctx) => {
    try {
      const ideas = await getRelevantMemory('CTO', 'startup_idea', 10);
      
      if (!ideas || ideas.length === 0) {
        await ctx.reply('💡 No ideas saved yet!\n\nUse `/idea <your idea>` to capture one.', { parse_mode: 'Markdown' });
        return;
      }
      
      const ideaList = ideas.map((idea: any, i: number) => {
        const text = idea.input?.idea || idea.output || 'Unknown idea';
        const date = idea.metadata?.timestamp ? new Date(idea.metadata.timestamp).toLocaleDateString() : '';
        return `${i + 1}. ${text.substring(0, 80)}${text.length > 80 ? '...' : ''} _(${date})_`;
      }).join('\n\n');
      
      await ctx.reply(`💡 *Your Startup Ideas*\n\n${ideaList}\n\n_Keep capturing ideas with /idea!_`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ideas list error:', error);
      await ctx.reply('❌ Error loading ideas. Try again!');
    }
  });
  
  // ==========================================================================
  // TECHNICAL DEBT TRACKING - Real CTOs track tech debt!
  // ==========================================================================
  
  // /debt - Add or list technical debt
  bot.command('debt', async (ctx) => {
    const input = ctx.message?.text?.replace('/debt', '').trim();
    
    // If no input, show menu
    if (!input) {
      await ctx.reply(`📋 *Technical Debt Tracker*

Track issues that need fixing later.

*Commands:*
/debt <repo> <description> - Add new debt
/debt list - Show all open debt
/debt list <repo> - Show debt for repo
/debt done <id> - Mark debt as resolved

*Examples:*
/debt EspaLuz Needs better error handling in API calls
/debt aideazz Refactor homepage component
/debt list
/debt done ABC123

_A real CTO tracks technical debt!_`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Handle subcommands
    if (input.startsWith('list')) {
      const repo = input.replace('list', '').trim() || undefined;
      const debts = await getTechDebt(repo);
      
      if (!debts || debts.length === 0) {
        await ctx.reply(repo 
          ? `✨ No open tech debt for ${repo}!`
          : '✨ No open tech debt! (Or use /debt list <repo>)');
        return;
      }
      
      const debtList = debts.map((d: any, i: number) => {
        const [id, repoName, desc, severity] = d;
        const shortId = id?.substring(0, 8) || '?';
        const shortDesc = desc?.substring(0, 60) || 'No description';
        return `${i + 1}. [${shortId}] *${escapeMarkdown(repoName || '')}*\n   ${shortDesc}${desc?.length > 60 ? '...' : ''}\n   ⚠️ ${severity || 'medium'}`;
      }).join('\n\n');
      
      await ctx.reply(`📋 *Open Technical Debt*\n\n${debtList}\n\n_Use /debt done <id> to resolve_`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (input.startsWith('done ')) {
      const debtId = input.replace('done ', '').trim();
      const success = await resolveTechDebt(debtId);
      
      if (success) {
        await ctx.reply(`✅ Tech debt ${debtId.substring(0, 8)} marked as resolved!`);
        await saveAgentOutcome('cto_aipa', 'tech_debt_resolved', { debt_id: debtId.substring(0, 8) }, 'verified_delivered').catch(() => {});
      } else {
        await ctx.reply('❌ Could not resolve debt. Check the ID and try again.');
      }
      return;
    }
    
    // Otherwise, add new debt: /debt <repo> <description>
    const parts = input.split(' ');
    const repo = parts[0];
    const description = parts.slice(1).join(' ');
    
    if (!repo || !description) {
      await ctx.reply('❌ Please provide repo and description.\n\nExample: /debt EspaLuz Needs error handling');
      return;
    }
    
    // Detect severity from keywords
    let severity = 'medium';
    if (description.toLowerCase().includes('critical') || description.toLowerCase().includes('urgent')) {
      severity = 'high';
    } else if (description.toLowerCase().includes('minor') || description.toLowerCase().includes('nice to have')) {
      severity = 'low';
    }
    
    const debtId = await addTechDebt(repo, description, severity);
    
    if (debtId) {
      await ctx.reply(`📋 *Tech Debt Added*

📦 Repo: ${escapeMarkdown(repo)}
📝 ${description}
⚠️ Severity: ${severity}
🔖 ID: ${debtId.substring(0, 8)}

_Use /debt list to see all debt_`, { parse_mode: 'Markdown' });
        await saveAgentOutcome('cto_aipa', 'tech_debt_recorded', { repo, severity, description: description.substring(0, 200) }, 'verified_delivered').catch(() => {});
    } else {
      await ctx.reply('❌ Error adding tech debt. Try again!');
    }
  });
  
  // ==========================================================================
  // ARCHITECTURAL DECISIONS - Real CTOs document decisions!
  // ==========================================================================
  
  // /decision - Record architectural decisions
  bot.command('decision', async (ctx) => {
    const input = ctx.message?.text?.replace('/decision', '').trim();
    
    if (!input) {
      await ctx.reply(`🏛️ *Architectural Decision Record*

Document important technical decisions.

*Commands:*
/decision <title> | <description> | <rationale>
/decision list - Show recent decisions
/decision list <repo> - Decisions for repo

*Examples:*
/decision Use PostgreSQL | For EspaLuz user data | Better JSON support than MySQL
/decision Oracle Cloud | For CTO AIPA hosting | Free tier is generous
/decision list

_A real CTO documents why, not just what!_`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (input.startsWith('list')) {
      const repo = input.replace('list', '').trim() || undefined;
      const decisions = await getDecisions(repo);
      
      if (!decisions || decisions.length === 0) {
        await ctx.reply('📭 No decisions recorded yet.\n\nUse /decision to add one!');
        return;
      }
      
      const decisionList = decisions.map((d: any, i: number) => {
        const [id, repoName, title, desc, rationale, createdAt] = d;
        const date = createdAt ? new Date(createdAt).toLocaleDateString() : '';
        return `${i + 1}. *${escapeMarkdown(title || '')}*${repoName ? ` (${escapeMarkdown(repoName)})` : ''}\n   ${desc?.substring(0, 80) || ''}\n   📅 ${date}`;
      }).join('\n\n');
      
      await ctx.reply(`🏛️ *Architectural Decisions*\n\n${decisionList}`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse: title | description | rationale (optional repo prefix)
    const parts = input.split('|').map(s => s.trim());
    
    if (parts.length < 2) {
      await ctx.reply('❌ Please use format:\n/decision Title | Description | Rationale\n\nExample:\n/decision Use Redis | For caching API responses | Faster than DB queries');
      return;
    }
    
    const title = parts[0] || '';
    const description = parts[1] || '';
    const rationale = parts[2] || 'No rationale provided';
    
    // Check if first word of title is a repo name
    const firstWord = title.split(' ')[0] || '';
    const isRepo = firstWord && AIDEAZZ_REPOS.includes(firstWord);
    const repo = isRepo ? firstWord : undefined;
    const finalTitle = isRepo ? title.split(' ').slice(1).join(' ') : title;
    
    const decisionId = await addDecision(finalTitle, description, rationale, repo);
    
    if (decisionId) {
      await ctx.reply(`🏛️ *Decision Recorded*

📌 *${escapeMarkdown(finalTitle)}*
${repo ? `📦 Repo: ${escapeMarkdown(repo)}\n` : ''}📝 ${description}
💡 Rationale: ${rationale}

_Use /decision list to see all decisions_`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ Error recording decision. Try again!');
    }
  });
  
  // ==========================================================================
  // CURSOR AGENT SIMULATOR - Be your own Cursor Agent!
  // ==========================================================================
  
  // /cursor - Get step-by-step Cursor instructions for any task
  bot.command('cursor', async (ctx) => {
    const input = ctx.message?.text?.replace('/cursor', '').trim();
    
    if (!input) {
      await ctx.reply(`🖥️ *CURSOR AGENT MODE*

*What is this?*
I become your Cursor Agent! Tell me what you want to change in your product - in YOUR words, like you're talking to a human - and I'll give you step-by-step instructions to do it yourself in local Cursor.

*What do I need from you?*
Just tell me which product and what you want. Use your own words!

*Examples (just copy one and edit):*
\`/cursor EspaLuzWhatsApp make the AI tutor more friendly and patient with beginners\`

\`/cursor atuona add beautiful animations when poems load\`

\`/cursor AIPA_AITCF improve how the bot responds to voice messages\`

*What will I give you?*
📂 Which file to open
✂️ What code to select  
⌨️ What to type in Cmd+K
📋 Code to copy/paste if needed

👉 *Try now:* Just type /cursor and then describe what you want!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and task
    const parts = input.split(' ');
    const firstWord = parts[0] || '';
    
    // Check if first word is a repo name (use resolveRepoName for aliases!)
    let repoName: string;
    let task: string;
    
    const resolvedRepo = resolveRepoName(firstWord);
    if (resolvedRepo) {
      repoName = resolvedRepo;
      task = parts.slice(1).join(' ');
    } else {
      // No repo specified - try to guess from task keywords
      const taskLower = input.toLowerCase();
      if (taskLower.includes('family') || taskLower.includes('familybot') || taskLower.includes('telegram tutor')) {
        repoName = 'EspaLuzFamilybot';
      } else if (taskLower.includes('espaluz') || taskLower.includes('spanish') || taskLower.includes('whatsapp')) {
        repoName = 'EspaLuzWhatsApp';
      } else if (taskLower.includes('atuona') || taskLower.includes('poem') || taskLower.includes('creative')) {
        repoName = 'AIPA_AITCF'; // atuona-creative-ai is in this repo
      } else if (taskLower.includes('cmo') || taskLower.includes('job') || taskLower.includes('marketing')) {
        repoName = 'VibeJobHunterAIPA_AIMCF';
      } else {
        repoName = 'AIPA_AITCF';
      }
      task = input;
    }
    
    if (!task) {
      await ctx.reply('❌ Please describe what you want to do!\n\nExample: /cursor AIPA_AITCF add a /ping command');
      return;
    }
    
    await ctx.reply(`🔍 Analyzing ${repoName} to guide you...\n\n⏳ Fetching codebase context...`);
    
    try {
      // Fetch repo structure for context
      let fileList = '';
      let relevantFiles: string[] = [];
      let projectLang: 'typescript' | 'python' | 'javascript' = 'typescript';
      let rootContents: any[] = [];
      
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: ''
        });
        
        if (Array.isArray(contents)) {
          rootContents = contents;
          fileList = contents.map((f: any) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n');
          relevantFiles = contents.filter((f: any) => 
            f.type === 'file' && /\.(ts|js|tsx|jsx)$/.test(f.name)
          ).map((f: any) => f.name);
          
          // Detect project language from root files
          const hasPythonFiles = contents.some((f: any) => f.name.endsWith('.py'));
          const hasPackageJson = contents.some((f: any) => f.name === 'package.json');
          const hasRequirementsTxt = contents.some((f: any) => f.name === 'requirements.txt');
          
          if (hasPythonFiles || hasRequirementsTxt) {
            projectLang = 'python';
            // For Python, relevant files are .py files in root
            relevantFiles = contents.filter((f: any) => 
              f.type === 'file' && f.name.endsWith('.py')
            ).map((f: any) => f.name);
          } else if (hasPackageJson) {
            const hasTsFiles = contents.some((f: any) => f.name.endsWith('.ts') || f.name.endsWith('.tsx'));
            projectLang = hasTsFiles ? 'typescript' : 'javascript';
          }
        }
      } catch {}
      
      // Try to get src folder (for TS/JS projects only)
      let srcFiles: string[] = [];
      if (projectLang !== 'python') {
        try {
          const { data: srcContents } = await octokit.repos.getContent({
            owner: 'ElenaRevicheva',
            repo: repoName,
            path: 'src'
          });
          if (Array.isArray(srcContents)) {
            srcFiles = srcContents.filter((f: any) => 
              f.type === 'file' && /\.(ts|js|tsx|jsx)$/.test(f.name)
            ).map((f: any) => `src/${f.name}`);
            fileList += '\n📁 src/\n' + srcContents.map((f: any) => `   📄 ${f.name}`).join('\n');
          }
        } catch {}
      }
      
      const allCodeFiles = [...relevantFiles, ...srcFiles];
      
      // Fetch a key file for context (language-aware!)
      let sampleCode = '';
      let mainFile: string | undefined;
      
      if (projectLang === 'python') {
        // For Python, main.py or bot.py or first .py file
        mainFile = relevantFiles.find(f => f === 'main.py') 
                || relevantFiles.find(f => f.includes('bot'))
                || relevantFiles[0];
      } else {
        // For TS/JS, look for telegram-bot, index, or first code file
        mainFile = srcFiles.find(f => f.includes('telegram-bot') || f.includes('index')) 
                || relevantFiles.find(f => f.includes('index'))
                || allCodeFiles[0];
      }
      
      if (mainFile) {
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner: 'ElenaRevicheva',
            repo: repoName,
            path: mainFile
          });
          if (!Array.isArray(fileData) && 'content' in fileData) {
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            // Get first 100 lines for context
            sampleCode = content.split('\n').slice(0, 100).join('\n');
          }
        } catch {}
      }
      
      // Generate language-specific instructions
      const langConfig = projectLang === 'python' ? {
        codeBlock: 'python',
        buildCmd: 'python main.py',
        testCmd: 'python -c "import main; print(\'OK\')"',
        framework: 'telebot/pyTelegramBotAPI for Telegram, Flask for web',
        mainFile: 'main.py',
        note: 'This is a PYTHON project using telebot. Use @bot.message_handler() for commands, NOT bot.command().'
      } : {
        codeBlock: 'typescript',
        buildCmd: 'npm run build',
        testCmd: 'npm start',
        framework: 'grammy for Telegram bots',
        mainFile: 'src/telegram-bot.ts',
        note: 'This is a TypeScript project using grammy. Use bot.command() for commands.'
      };
      
      // Generate Cursor instructions using AI
      const cursorPrompt = `You are helping a vibe coder use LOCAL Cursor (without paid agents) to edit their code.

PROJECT LANGUAGE: **${projectLang.toUpperCase()}**
${langConfig.note}

TASK: "${task}"
REPO: ${repoName}

FILES IN REPO:
${fileList}

CODE FILES: ${allCodeFiles.join(', ')}

${sampleCode ? `SAMPLE FROM ${mainFile}:\n\`\`\`${langConfig.codeBlock}\n${sampleCode.substring(0, 2000)}\n\`\`\`` : ''}

Generate STEP-BY-STEP instructions for LOCAL Cursor. Format EXACTLY like this:

📂 *STEP 1: Open the project*
\`\`\`
cd ~/path-to/${repoName}
cursor .
\`\`\`

📄 *STEP 2: Open file*
Open: \`${langConfig.mainFile}\` (or the relevant file)

✂️ *STEP 3: Select code*
Find and select this section:
\`\`\`${langConfig.codeBlock}
<code to select>
\`\`\`

⌨️ *STEP 4: Cmd+K prompt*
Select the code above, press Cmd+K, and type:
\`\`\`
<exact prompt to type>
\`\`\`

📋 *STEP 5: Or copy this code*
If Cmd+K doesn't work well, copy this and paste:
\`\`\`${langConfig.codeBlock}
<complete ${projectLang} code to add/replace>
\`\`\`

💾 *STEP 6: Save and test*
- Save: Cmd+S
- Run: \`${langConfig.buildCmd}\`
- Test: ${langConfig.testCmd}

CRITICAL RULES FOR ${projectLang.toUpperCase()} PROJECT:
- Give SPECIFIC file names from the repo (${allCodeFiles.slice(0, 3).join(', ')})
- Give COMPLETE, working ${projectLang} code (not pseudocode)
- Explain WHERE in the file to add/edit
- Use the correct framework: ${langConfig.framework}
${projectLang === 'python' ? `- Use @bot.message_handler(commands=['name']) syntax
- Import with: from telebot import types
- The bot already uses gTTS for text-to-speech` : `- Use bot.command('name', async (ctx) => {...}) syntax`}
- If adding new code, say "add after line X" or "add at the end of the file"`;

      const instructions = await askAI(cursorPrompt, 3500);
      
      // Split into multiple messages if too long
      if (instructions.length > 4000) {
        const msgParts = instructions.split(/(?=📂|📄|✂️|⌨️|📋|💾)/);
        for (const part of msgParts) {
          if (part && part.trim()) {
            await ctx.reply(part.trim(), { parse_mode: 'Markdown' });
          }
        }
      } else {
        await ctx.reply(`🖥️ *Cursor Instructions for: ${task}*\n\n${instructions}`, { parse_mode: 'Markdown' });
      }
      
      await ctx.reply(`━━━━━━━━━━━━━━━━━━━━
💡 *Tips for Local Cursor:*
• Cmd+K = Edit selected code (FREE)
• Cmd+L = Chat about code
• Tab = Accept AI suggestions (FREE)
• @ = Reference files in chat

Need more help? Just ask! 🎯`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Cursor guide error:', error);
      await ctx.reply('❌ Error generating instructions. Try again or be more specific!');
    }
  });
  
  // /build - Multi-step project guidance (like a real Cursor Agent)
  bot.command('build', async (ctx) => {
    const input = ctx.message?.text?.replace('/build', '').trim();
    
    if (!input) {
      await ctx.reply(`🏗️ *BUILD MODE*

*What is this?*
For BIG features that need multiple steps. I'll create a plan and break it into small, doable pieces. Like having a senior developer plan your work!

*What do I need from you?*
Tell me which product and what big feature you want to add.

*Examples (copy and edit):*
\`/build EspaLuzWhatsApp add a progress tracking system so students can see how they're improving\`

\`/build atuona create a favorites feature so visitors can save poems they like\`

\`/build AIPA_AITCF add daily coding tips that get sent automatically\`

*What will I give you?*
📋 A numbered plan with steps
🎯 Each step has a /cursor command to get details
⏱️ Time estimate for the whole feature

👉 *Try now:* Type /build and describe what you want to create!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and feature (use resolveRepoName for aliases!)
    const parts = input.split(' ');
    const firstWord = parts[0] || '';
    
    let repoName: string;
    let feature: string;
    
    const resolvedRepo = resolveRepoName(firstWord);
    if (resolvedRepo) {
      repoName = resolvedRepo;
      feature = parts.slice(1).join(' ');
    } else {
      // Smart detection from keywords
      const inputLower = input.toLowerCase();
      if (inputLower.includes('family') || inputLower.includes('familybot')) {
        repoName = 'EspaLuzFamilybot';
      } else if (inputLower.includes('espaluz') || inputLower.includes('spanish') || inputLower.includes('whatsapp')) {
        repoName = 'EspaLuzWhatsApp';
      } else {
        repoName = 'AIPA_AITCF';
      }
      feature = input;
    }
    
    if (!feature) {
      await ctx.reply('❌ Please describe what you want to build!');
      return;
    }
    
    await ctx.reply(`🏗️ Planning "${feature}" for ${repoName}...\n\n⏳ Breaking into steps...`);
    
    try {
      // Get repo context
      let fileList = '';
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: ''
        });
        if (Array.isArray(contents)) {
          fileList = contents.map((f: any) => f.name).join(', ');
        }
      } catch {}
      
      // Generate build plan
      const buildPrompt = `You are a senior developer helping a vibe coder build a feature using LOCAL Cursor.

FEATURE: "${feature}"
REPO: ${repoName}
FILES: ${fileList}

Create a BUILD PLAN with numbered steps. For each step:
1. What file to edit/create
2. Brief description of changes
3. The /cursor command to get detailed instructions

Format EXACTLY like this:

🏗️ *Build Plan: ${feature}*

*Overview:* (1-2 sentences what we're building)

━━━━━━━━━━━━━━━━━━━━

📌 *Step 1: <title>*
File: \`<filename>\`
What: <brief description>
Command: \`/cursor ${repoName} <specific task for this step>\`

📌 *Step 2: <title>*
File: \`<filename>\`
What: <brief description>
Command: \`/cursor ${repoName} <specific task for this step>\`

(continue for all steps needed)

━━━━━━━━━━━━━━━━━━━━

⏱️ *Estimated time:* X minutes
🎯 *Difficulty:* Easy/Medium/Hard

Start with Step 1 when ready!

Keep it to 3-6 steps maximum. Be practical.`;

      const buildPlan = await askAI(buildPrompt, 2000);
      
      await ctx.reply(buildPlan, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Build plan error:', error);
      await ctx.reply('❌ Error creating build plan. Try again!');
    }
  });
  
  // /diff - Show what code to change (before/after)
  bot.command('diff', async (ctx) => {
    const input = ctx.message?.text?.replace('/diff', '').trim();
    
    if (!input) {
      await ctx.reply(`📝 *DIFF MODE - Before/After*

*What is this?*
I show you exactly what code to find and what to replace it with. Like a "find and replace" guide!

*What do I need from you?*
Tell me the product, the file name, and what you want to change.

*How to find file names?*
Use \`/architecture EspaLuzWhatsApp\` to see all files first!

*Examples (copy and edit):*
\`/diff EspaLuzWhatsApp index.ts make the welcome message more warm and friendly\`

\`/diff atuona src/gallery.ts add smooth fade-in animation\`

*What will I give you?*
❌ BEFORE: The exact code to find
✅ AFTER: What to replace it with
💡 How to do it in Cursor

👉 *Tip:* First use /architecture to see file names!`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoName: string = parts[0] || 'AIPA_AITCF';
    const filePath: string = parts[1] || '';
    const change: string = parts.slice(2).join(' ');
    
    if (!filePath || !change) {
      await ctx.reply('❌ Please provide repo, file, and what to change.\n\nExample: /diff AIPA_AITCF src/telegram-bot.ts add logging');
      return;
    }
    
    await ctx.reply(`📝 Analyzing ${filePath} in ${repoName}...`);
    
    try {
      // Fetch the file
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Could not read file.');
        return;
      }
      
      const fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const truncated = fileContent.substring(0, 4000);
      
      const diffPrompt = `Show the exact code change needed.

FILE: ${filePath}
CHANGE: "${change}"

CURRENT CODE:
\`\`\`
${truncated}
\`\`\`

Format your response EXACTLY like this:

📍 *Location:* Line X (or "after function Y")

❌ *BEFORE (find this code):*
\`\`\`typescript
<exact current code to find, 3-10 lines>
\`\`\`

✅ *AFTER (replace with this):*
\`\`\`typescript
<new code to replace it with>
\`\`\`

💡 *In Cursor:*
1. Select the BEFORE code
2. Press Cmd+K
3. Type: "<simple prompt>"

Keep it focused on ONE specific change.`;

      const diff = await askAI(diffPrompt, 2000);
      
      await ctx.reply(`📝 *Changes for ${filePath}*\n\n${diff}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ File not found: ${filePath}\n\nUse /architecture ${repoName} to see files.`);
      } else {
        await ctx.reply('❌ Error analyzing file.');
      }
    }
  });
  
  // ==========================================================================
  // SELF-LEARNING SECTION - Become a real developer!
  // ==========================================================================
  
  // /study - Quiz yourself on your own codebase
  bot.command('study', async (ctx) => {
    const input = ctx.message?.text?.replace('/study', '').trim();
    
    if (!input) {
      await ctx.reply(`📚 *STUDY MODE*

*What is this?*
I pick a random piece of YOUR code and quiz you on it. This helps you understand what you've built - super important for interviews and becoming a real developer!

*What do I need from you?*
Nothing! Or tell me which product to quiz you on.

*Examples:*
\`/study\` - Random quiz from any repo
\`/study EspaLuzWhatsApp\` - Quiz from EspaLuz
\`/study AIPA_AITCF\` - Quiz from CTO AIPA

*What will I give you?*
📄 A code snippet from your project
❓ Questions about what it does
🎯 Help you understand YOUR code

👉 *Try now:* Just type /study and I'll quiz you!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('📚 Fetching a code snippet from your repos...');
    
    try {
      // Pick a random repo or use specified one
      const repoName: string = input || AIDEAZZ_REPOS[Math.floor(Math.random() * AIDEAZZ_REPOS.length)] || 'AIPA_AITCF';
      
      // Get file list from repo
      const { data: contents } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: ''
      });
      
      if (!Array.isArray(contents)) {
        await ctx.reply('Could not read repo contents.');
        return;
      }
      
      // Find code files (ts, js, tsx, jsx)
      const codeFiles = contents.filter((f: any) => 
        f.type === 'file' && /\.(ts|js|tsx|jsx)$/.test(f.name)
      );
      
      // Also check src folder
      let srcFiles: any[] = [];
      try {
        const { data: srcContents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: 'src'
        });
        if (Array.isArray(srcContents)) {
          srcFiles = srcContents.filter((f: any) => 
            f.type === 'file' && /\.(ts|js|tsx|jsx)$/.test(f.name)
          ).map((f: any) => ({ ...f, path: `src/${f.name}` }));
        }
      } catch {}
      
      const allFiles = [...codeFiles, ...srcFiles];
      
      if (allFiles.length === 0) {
        await ctx.reply(`No code files found in ${repoName}. Try /study AIPA_AITCF`);
        return;
      }
      
      // Pick random file
      const randomFile = allFiles[Math.floor(Math.random() * allFiles.length)];
      
      // Fetch file content
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: randomFile.path || randomFile.name
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('Could not read file.');
        return;
      }
      
      const fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      // Extract a random function or section (look for function/const/export patterns)
      const lines = fileContent.split('\n');
      const functionStarts: number[] = [];
      
      lines.forEach((line, i) => {
        if (/^(export )?(async )?(function |const \w+ = |class )/.test(line.trim())) {
          functionStarts.push(i);
        }
      });
      
      let codeSnippet = '';
      let snippetStart = 0;
      
      if (functionStarts.length > 0) {
        // Pick a random function
        snippetStart = functionStarts[Math.floor(Math.random() * functionStarts.length)] || 0;
        const snippetEnd = Math.min(snippetStart + 15, lines.length);
        codeSnippet = lines.slice(snippetStart, snippetEnd).join('\n');
      } else {
        // Just take first 15 lines
        codeSnippet = lines.slice(0, 15).join('\n');
      }
      
      // Truncate if too long
      if (codeSnippet.length > 1500) {
        codeSnippet = codeSnippet.substring(0, 1500) + '\n...';
      }
      
      await ctx.reply(`📚 *STUDY TIME*

📦 Repo: ${repoName}
📄 File: ${randomFile.path || randomFile.name}
📍 Line: ${snippetStart + 1}

\`\`\`
${codeSnippet}
\`\`\`

━━━━━━━━━━━━━━━━━━━━
❓ *YOUR TASK:*

1. What does this code do?
2. What would happen if you removed line ${snippetStart + 3}?
3. Can you spot any potential issues?

Reply with your answer, then use:
/explain-file ${repoName} ${randomFile.path || randomFile.name}
to check your understanding!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Study error:', error);
      await ctx.reply('❌ Error fetching code. Try /study AIPA_AITCF');
    }
  });
  
  // /explain-file - Explain any file from your repos
  bot.command('explain', async (ctx) => {
    // This might conflict with existing /explain for concepts
    // Keep the existing behavior for concepts, add file explanation
    const input = ctx.message?.text?.replace('/explain', '').trim();
    
    // Check if it looks like a file path (contains / or ends with extension)
    if (!input || (!input.includes('/') && !input.includes('.'))) {
      // Fall through to concept explanation (existing behavior)
      // This is handled elsewhere, so just return
      return;
    }
  });
  
  // /explain-file - Dedicated file explanation
  bot.command('explainfile', async (ctx) => {
    const input = ctx.message?.text?.replace('/explainfile', '').trim();
    
    if (!input) {
      await ctx.reply(`📖 *EXPLAIN FILE*

*What is this?*
I read any file from your projects and explain what every part does in simple words. Like having a teacher go through your code!

*What do I need from you?*
Tell me which product and which file.

*How to find file names?*
Use \`/architecture EspaLuzWhatsApp\` first!

*Examples (copy and edit):*
\`/explainfile EspaLuzWhatsApp index.ts\`
\`/explainfile AIPA_AITCF src/telegram-bot.ts\`

*What will I give you?*
📦 What each import does
🔧 What each function does
🔗 How pieces connect

👉 *Tip:* Use /architecture first to see file names!`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoName: string = parts[0] || 'AIPA_AITCF';
    const filePath: string = parts.slice(1).join(' ') || 'index.ts';
    
    await ctx.reply(`📖 Fetching ${filePath} from ${repoName}...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Could not read file. Make sure path is correct.');
        return;
      }
      
      const fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      // Truncate for API limits
      const truncatedContent = fileContent.length > 6000 
        ? fileContent.substring(0, 6000) + '\n... (truncated)'
        : fileContent;
      
      const explainPrompt = `You are teaching a vibe coder to become a real developer.

Explain this file in simple terms. For EACH section:
1. What it does (in plain English)
2. WHY it's written that way
3. What would break if you removed it

File: ${filePath}
Repo: ${repoName}

\`\`\`
${truncatedContent}
\`\`\`

Format for Telegram (use simple language, no jargon without explaining it):
📦 IMPORTS - what libraries and why
🔧 SETUP - configuration and initialization  
⚡ FUNCTIONS - what each function does
🔗 EXPORTS - what other files can use

Be encouraging! This person built this but wants to understand it deeply.`;

      const explanation = await askAI(explainPrompt, 3000);
      
      // Split into multiple messages if too long
      if (explanation.length > 4000) {
        const mid = explanation.lastIndexOf('\n', 2000);
        await ctx.reply(`📖 *${filePath}* (Part 1)\n\n${explanation.substring(0, mid)}`);
        await ctx.reply(`📖 *${filePath}* (Part 2)\n\n${explanation.substring(mid)}`);
      } else {
        await ctx.reply(`📖 *${filePath}*\n\n${explanation}`);
      }
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ File not found: ${filePath}\n\nUse /architecture ${repoName} to see available files.`);
      } else {
        await ctx.reply('❌ Error fetching file. Check repo and path.');
      }
    }
  });
  
  // /architecture - Show and explain repo structure
  bot.command('architecture', async (ctx) => {
    const repoInput = ctx.message?.text?.replace('/architecture', '').trim();
    
    if (!repoInput) {
      await ctx.reply(`🏗️ *ARCHITECTURE - See Your Project Structure*

*What is this?*
I show you all files in your project and explain what each one does. Like a map of your codebase!

*What do I need from you?*
Just tell me which product to explore.

*Examples:*
• \`/architecture espaluz\` - AI Spanish Tutor
• \`/architecture cto\` - CTO AIPA (this bot!)
• \`/architecture atuona\` - NFT Poetry Gallery

*Shortcuts:* cto, cmo, espaluz, atuona, dragon, saas, docs, pitch

👉 *Try now:* /architecture cto`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Resolve repo name (supports aliases)
    const repoName = resolveRepoName(repoInput);
    
    if (!repoName) {
      await ctx.reply(`❌ Repo "${repoInput}" not found.\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`🏗️ Analyzing ${escapeMarkdown(repoName)} structure...`);
    
    try {
      // Get root contents
      const { data: rootContents } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: ''
      });
      
      if (!Array.isArray(rootContents)) {
        await ctx.reply('Could not read repo.');
        return;
      }
      
      // Build tree structure
      let tree = '';
      const folders: string[] = [];
      const files: string[] = [];
      
      for (const item of rootContents) {
        if (item.type === 'dir') {
          folders.push(item.name);
          tree += `📁 ${item.name}/\n`;
        } else {
          files.push(item.name);
          tree += `📄 ${item.name}\n`;
        }
      }
      
      // Try to get src folder contents
      let srcTree = '';
      try {
        const { data: srcContents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: 'src'
        });
        if (Array.isArray(srcContents)) {
          srcTree = srcContents.map((f: any) => `   📄 ${f.name}`).join('\n');
        }
      } catch {}
      
      // Get package.json for dependencies
      let deps = '';
      try {
        const { data: pkgFile } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: 'package.json'
        });
        if (!Array.isArray(pkgFile) && 'content' in pkgFile) {
          const pkg = JSON.parse(Buffer.from(pkgFile.content, 'base64').toString('utf-8'));
          deps = Object.keys(pkg.dependencies || {}).join(', ');
        }
      } catch {}
      
      // Ask AI to explain the architecture
      const archPrompt = `Explain this repo structure to someone learning to code:

Repo: ${repoName}
Structure:
${tree}
${srcTree ? `\nsrc/ folder:\n${srcTree}` : ''}
${deps ? `\nDependencies: ${deps}` : ''}

Explain in simple terms:
1. What is the PURPOSE of this repo?
2. What does each KEY FILE do?
3. How do the pieces connect?
4. Where should someone look first to understand it?

Keep it SHORT and practical for Telegram.`;

      const archExplanation = await askAI(archPrompt, 1500);
      
      await ctx.reply(`🏗️ *${escapeMarkdown(repoName)} Architecture*

${tree}${srcTree ? `\n📁 src/\n${srcTree}\n` : ''}
${deps ? `\n📦 *Dependencies:* ${deps.substring(0, 200)}${deps.length > 200 ? '...' : ''}\n` : ''}
━━━━━━━━━━━━━━━━━━━━

${archExplanation}

━━━━━━━━━━━━━━━━━━━━
💡 *Next steps:*
/explainfile ${escapeMarkdown(repoName)} <filename>
/study ${escapeMarkdown(repoName)}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ Repo "${repoName}" not found. Use /repos to see available repos.`);
      } else {
        await ctx.reply('❌ Error reading repo structure.');
      }
    }
  });
  
  // /error - Paste an error, get explanation and fix
  bot.command('error', async (ctx) => {
    const errorText = ctx.message?.text?.replace('/error', '').trim();
    
    if (!errorText) {
      await ctx.reply(`🐛 *ERROR HELPER*

*What is this?*
When you see a scary red error message, paste it here and I'll explain what went wrong in simple words + how to fix it!

*What do I need from you?*
Just copy the error message and paste it after /error

*Example:*
\`/error TypeError: Cannot read property 'map' of undefined\`

Or paste a long error:
\`/error npm ERR! code ENOENT npm ERR! syscall open...\`

*What will I give you?*
🐛 What the error means (simple words!)
🤔 Why it probably happened
🔧 Step-by-step how to fix it
🛡️ How to avoid it next time

👉 *Try now:* Next time you see an error, paste it here!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🔍 Analyzing error...');
    
    const errorPrompt = `You are helping a vibe coder understand and fix an error.

Error message:
${errorText}

Explain in SIMPLE terms:
1. 🐛 WHAT: What does this error mean? (plain English)
2. 🤔 WHY: What usually causes this?
3. 🔧 FIX: Step-by-step how to fix it
4. 🛡️ PREVENT: How to avoid this in the future

Use simple language. This person is learning.
If it's a TypeScript error, explain the type system simply.
If it's a runtime error, explain where to add console.log to debug.`;

    const explanation = await askAI(errorPrompt, 1500);
    
    await ctx.reply(`🐛 *Error Analysis*\n\n${explanation}`);
  });
  
  // /howto - Step-by-step guides for common tasks
  bot.command('howto', async (ctx) => {
    const task = ctx.message?.text?.replace('/howto', '').trim().toLowerCase();
    
    if (!task) {
      await ctx.reply(`📖 *HOW-TO GUIDES*

*What is this?*
Step-by-step instructions for common tasks. Like a cookbook for coding!

*Ready-made guides:*
\`/howto deploy\` - Deploy to Oracle server
\`/howto git\` - Save and share your code
\`/howto pm2\` - Manage running apps
\`/howto npm\` - Install packages
\`/howto typescript\` - TypeScript basics
\`/howto cursor\` - Local Cursor tips

*Or ask anything:*
\`/howto connect to my database\`
\`/howto add a new telegram command\`
\`/howto fix permission denied error\`

👉 *Try now:* /howto deploy`, { parse_mode: 'Markdown' });
      return;
    }
    
    const guides: { [key: string]: string } = {
      'deploy': `🚀 *How to Deploy to Oracle*

1️⃣ *SSH into your server:*
\`\`\`
ssh ubuntu@your-oracle-ip
\`\`\`

2️⃣ *Go to your project:*
\`\`\`
cd ~/cto-aipa
\`\`\`

3️⃣ *Pull latest code:*
\`\`\`
git pull origin main
\`\`\`

4️⃣ *Install dependencies (if changed):*
\`\`\`
npm install
\`\`\`

5️⃣ *Build TypeScript:*
\`\`\`
npm run build
\`\`\`

6️⃣ *Restart PM2:*
\`\`\`
pm2 restart all
\`\`\`

7️⃣ *Check logs:*
\`\`\`
pm2 logs --lines 20
\`\`\`

✅ Done! Test your bot.`,

      'git': `📚 *Git Basics*

*Save your changes:*
\`\`\`
git add .
git commit -m "describe what you changed"
git push origin main
\`\`\`

*Get latest code:*
\`\`\`
git pull origin main
\`\`\`

*Create a branch:*
\`\`\`
git checkout -b my-feature
\`\`\`

*Switch branches:*
\`\`\`
git checkout main
\`\`\`

*See what changed:*
\`\`\`
git status
git diff
\`\`\`

*Undo last commit (keep changes):*
\`\`\`
git reset --soft HEAD~1
\`\`\``,

      'pm2': `⚙️ *PM2 Commands*

*Start app:*
\`\`\`
pm2 start dist/index.js --name myapp
\`\`\`

*Restart:*
\`\`\`
pm2 restart all
\`\`\`

*Stop:*
\`\`\`
pm2 stop all
\`\`\`

*View logs:*
\`\`\`
pm2 logs
pm2 logs --lines 50
\`\`\`

*List running apps:*
\`\`\`
pm2 list
\`\`\`

*Save config (survives reboot):*
\`\`\`
pm2 save
pm2 startup
\`\`\``,

      'npm': `📦 *NPM Commands*

*Install all dependencies:*
\`\`\`
npm install
\`\`\`

*Add a package:*
\`\`\`
npm install package-name
\`\`\`

*Add dev dependency:*
\`\`\`
npm install -D package-name
\`\`\`

*Run scripts:*
\`\`\`
npm run build
npm run start
npm run dev
\`\`\`

*See installed packages:*
\`\`\`
npm list --depth=0
\`\`\``,

      'typescript': `📘 *TypeScript Basics*

*Compile once:*
\`\`\`
npx tsc
\`\`\`

*Watch mode (auto-compile):*
\`\`\`
npx tsc --watch
\`\`\`

*Check errors without compiling:*
\`\`\`
npx tsc --noEmit
\`\`\`

*Common types:*
\`\`\`typescript
const name: string = "Elena";
const age: number = 30;
const active: boolean = true;
const items: string[] = ["a", "b"];
\`\`\`

*Function types:*
\`\`\`typescript
function greet(name: string): string {
  return "Hello " + name;
}
\`\`\``,

      'cursor': `🖥️ *Local Cursor Tips*

*Without paid agents, use:*

1️⃣ *Cmd+K* - Edit selected code
   Select code → Cmd+K → describe change

2️⃣ *Cmd+L* - Chat about code
   Ask questions about your codebase

3️⃣ *Tab completion* - Accept suggestions
   Free AI completions as you type

4️⃣ *@file* - Reference files in chat
   "Explain @src/index.ts"

5️⃣ *Cmd+Shift+E* - Explain selected code

*Best free workflow:*
- Use Tab completions (free)
- Use Cmd+K for small edits
- Ask CTO AIPA for guidance
- Copy explanations to Cursor chat`
    };
    
    if (!task) {
      await ctx.reply(`📖 *How-To Guides*

Available guides:
/howto deploy - Deploy to Oracle
/howto git - Git basics
/howto pm2 - PM2 process manager
/howto npm - NPM package manager
/howto typescript - TypeScript basics
/howto cursor - Local Cursor tips

Or ask anything:
/howto add a new telegram command`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Check for predefined guide
    for (const [key, guide] of Object.entries(guides)) {
      if (task.includes(key)) {
        await ctx.reply(guide, { parse_mode: 'Markdown' });
        return;
      }
    }
    
    // Custom question - use AI
    const howtoPrompt = `Give a step-by-step guide for: "${task}"

Context: This is for a solo developer working with:
- TypeScript/Node.js
- Telegram bots (grammy)
- Oracle Cloud VM
- GitHub repos
- PM2 for process management

Format as numbered steps with code blocks where needed.
Keep it practical and copy-pasteable.`;

    const guide = await askAI(howtoPrompt, 2000);
    await ctx.reply(`📖 *How to: ${task}*\n\n${guide}`, { parse_mode: 'Markdown' });
  });
  
  // /cmd - Quick command reference
  bot.command('cmd', async (ctx) => {
    const category = ctx.message?.text?.replace('/cmd', '').trim().toLowerCase();
    
    if (!category) {
      await ctx.reply(`⌨️ *Quick Commands*

/cmd git - Git commands
/cmd npm - NPM commands
/cmd pm2 - PM2 commands
/cmd ssh - SSH/server commands
/cmd debug - Debugging commands

Print and keep near your desk! 📋`, { parse_mode: 'Markdown' });
      return;
    }
    
    const commands: { [key: string]: string } = {
      'git': `📋 *Git Cheat Sheet*

\`git status\` - See changes
\`git add .\` - Stage all
\`git commit -m "msg"\` - Commit
\`git push\` - Push to remote
\`git pull\` - Get latest
\`git log --oneline -5\` - Recent commits
\`git diff\` - See changes
\`git checkout -b name\` - New branch
\`git checkout main\` - Switch branch
\`git stash\` - Save changes aside
\`git stash pop\` - Restore stashed`,

      'npm': `📋 *NPM Cheat Sheet*

\`npm install\` - Install deps
\`npm i package\` - Add package
\`npm i -D package\` - Dev dependency
\`npm run build\` - Build project
\`npm run start\` - Start app
\`npm list --depth=0\` - Show deps
\`npm outdated\` - Check updates
\`npm update\` - Update packages`,

      'pm2': `📋 *PM2 Cheat Sheet*

\`pm2 list\` - Show apps
\`pm2 start app.js\` - Start
\`pm2 restart all\` - Restart
\`pm2 stop all\` - Stop
\`pm2 logs\` - View logs
\`pm2 logs -f\` - Follow logs
\`pm2 monit\` - Monitor
\`pm2 save\` - Save config
\`pm2 delete all\` - Remove all`,

      'ssh': `📋 *SSH Cheat Sheet*

\`ssh user@ip\` - Connect
\`scp file user@ip:path\` - Copy to server
\`scp user@ip:path file\` - Copy from server
\`exit\` - Disconnect
\`pwd\` - Current directory
\`ls -la\` - List files
\`cat file\` - View file
\`nano file\` - Edit file
\`tail -f file\` - Watch file`,

      'debug': `📋 *Debug Cheat Sheet*

\`console.log(variable)\` - Print value
\`console.log({variable})\` - Print with name
\`console.table(array)\` - Pretty print
\`JSON.stringify(obj, null, 2)\` - Format JSON
\`typeof variable\` - Check type
\`pm2 logs --lines 100\` - Recent logs
\`npx tsc --noEmit\` - Check types
\`node --inspect app.js\` - Debug mode`
    };
    
    const cmd = commands[category];
    if (cmd) {
      await ctx.reply(cmd, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('Unknown category. Use /cmd to see options.');
    }
  });
  
  // ==========================================================================
  // PRODUCTION MONITORING - Know your system health!
  // ==========================================================================
  
  // /health - Check production services
  bot.command('health', async (ctx) => {
    await ctx.reply(`🏥 *HEALTH CHECK*

*What is this?*
I check if your services are running and responding. Like a doctor checkup for your apps!

Checking services now...`, { parse_mode: 'Markdown' });
    
    const services = [
      { name: 'GitHub API', url: 'https://api.github.com/users/ElenaRevicheva' },
      { name: 'CTO AIPA Bot', url: null, check: 'self' },
    ];
    
    let results = '';
    
    // Check GitHub API
    try {
      const start = Date.now();
      await octokit.users.getByUsername({ username: 'ElenaRevicheva' });
      const responseTime = Date.now() - start;
      results += `✅ *GitHub API* - Healthy (${responseTime}ms)\n`;
      await saveHealthCheck('GitHub API', 'healthy', responseTime);
    } catch (err: any) {
      results += `❌ *GitHub API* - Down\n   ${err.message}\n`;
      await saveHealthCheck('GitHub API', 'down', undefined, err.message);
    }
    
    // Check Claude API
    try {
      const start = Date.now();
      await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      });
      const responseTime = Date.now() - start;
      results += `✅ *Claude API* - Healthy (${responseTime}ms)\n`;
      await saveHealthCheck('Claude API', 'healthy', responseTime);
    } catch (err: any) {
      results += `⚠️ *Claude API* - Issue\n   ${err.message?.substring(0, 50)}\n`;
      await saveHealthCheck('Claude API', 'degraded', undefined, err.message);
    }
    
    // Check Groq API  
    try {
      const start = Date.now();
      await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      });
      const responseTime = Date.now() - start;
      results += `✅ *Groq API* - Healthy (${responseTime}ms)\n`;
      await saveHealthCheck('Groq API', 'healthy', responseTime);
    } catch (err: any) {
      results += `⚠️ *Groq API* - Issue\n   ${err.message?.substring(0, 50)}\n`;
      await saveHealthCheck('Groq API', 'degraded', undefined, err.message);
    }
    
    // Self check (if we got here, bot is running)
    results += `✅ *CTO AIPA Bot* - Running\n`;
    await saveHealthCheck('CTO AIPA Bot', 'healthy');
    
    // Get recent health history
    const history = await getHealthHistory(undefined, 24);
    const downCount = history.filter((h: any) => h[1] === 'down').length;
    
    await ctx.reply(`🏥 *Health Check Results*

${results}
━━━━━━━━━━━━━━━━━━━━
📊 *Last 24 hours:*
• Total checks: ${history.length}
• Issues detected: ${downCount}

${downCount > 0 ? '⚠️ Some issues detected recently. Use /logs to investigate.' : '✅ All systems stable!'}`, { parse_mode: 'Markdown' });

      await saveAgentOutcome('cto_aipa', 'health_check_completed', {
        issues_detected: downCount,
        checks_24h: history.length
      }, 'verified_delivered').catch(() => {});
  });
  
  // /logs - Analyze pasted logs
  bot.command('logs', async (ctx) => {
    const logText = ctx.message?.text?.replace('/logs', '').trim();
    
    if (!logText) {
      await ctx.reply(`📋 *LOG ANALYZER*

*What is this?*
Paste your PM2 logs, error logs, or any log output and I'll analyze what's happening and suggest fixes.

*How to get logs from Oracle:*
\`\`\`
pm2 logs --lines 50
\`\`\`

Then copy the output and:
\`/logs <paste logs here>\`

*What will I give you?*
🔍 What's happening in the logs
⚠️ Any errors or warnings
🔧 Suggested fixes
📈 Patterns I notice

👉 *Try now:* Get logs from your server and paste them!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('📋 Analyzing logs...');
    
    const logPrompt = `You are a DevOps expert analyzing production logs.

LOGS:
${logText.substring(0, 4000)}

Analyze these logs and provide:

1. 📊 *SUMMARY* - What's happening overall (1-2 sentences)

2. ⚠️ *ISSUES FOUND* - List any errors, warnings, or concerns
   - What the error means
   - Likely cause

3. 🔧 *RECOMMENDED ACTIONS* - Specific steps to fix issues

4. 📈 *PATTERNS* - Any recurring issues or trends

5. ✅ *HEALTH VERDICT* - Is the system healthy, degraded, or critical?

Be specific and actionable. This person is learning, so explain simply.`;

    const analysis = await askAI(logPrompt, 2000);
    await ctx.reply(`📋 *Log Analysis*\n\n${analysis}`, { parse_mode: 'Markdown' });
  });
  
  // ==========================================================================
  // LEARNING SYSTEM - CTO learns from experience!
  // ==========================================================================
  
  // /feedback - Tell CTO if something worked or not
  bot.command('feedback', async (ctx) => {
    const input = ctx.message?.text?.replace('/feedback', '').trim();
    
    if (!input) {
      await ctx.reply(`📝 *FEEDBACK - Help Me Learn!*

*What is this?*
Tell me if my suggestions worked or not. I'll remember and get smarter over time!

*Usage:*
\`/feedback success <what worked>\`
\`/feedback fail <what didn't work>\`
\`/feedback partial <what kind of worked>\`

*Examples:*
\`/feedback success The /cursor instructions for adding voice feature worked perfectly!\`

\`/feedback fail The code you generated had a syntax error on line 5\`

\`/feedback partial The approach was right but I had to modify the database query\`

*Why does this matter?*
I save these lessons and use them to give you better advice next time!

👉 *Try now:* After trying my suggestions, tell me how it went!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse outcome and description
    const words = input.split(' ');
    const outcome = (words[0] || '').toLowerCase();
    const description = words.slice(1).join(' ');
    
    if (!outcome || !['success', 'fail', 'failure', 'partial'].includes(outcome) || !description) {
      await ctx.reply('❌ Please use format:\n/feedback success|fail|partial <description>\n\nExample: /feedback success The code worked great!');
      return;
    }
    
    const normalizedOutcome = outcome === 'fail' || outcome === 'failure' ? 'failure' : outcome as 'success' | 'failure' | 'partial';
    
    // Generate lesson from feedback
    const lessonPrompt = `Based on this user feedback, extract a concise lesson learned:

Outcome: ${normalizedOutcome}
Description: ${description}

Generate a short lesson (1-2 sentences) that I can remember for future similar situations.
Format: Just the lesson, no preamble.`;

    const lesson = await askAI(lessonPrompt, 200);
    
    await saveLesson(
      'user_feedback',
      description.substring(0, 500),
      'AI suggestion',
      normalizedOutcome,
      lesson
    );
    
    const emoji = normalizedOutcome === 'success' ? '✅' : normalizedOutcome === 'failure' ? '❌' : '⚠️';
    
    await ctx.reply(`${emoji} *Feedback Recorded!*

*Outcome:* ${normalizedOutcome}
*What happened:* ${description.substring(0, 200)}

*Lesson I learned:*
${lesson}

I'll remember this for next time! 🧠

Use /lessons to see what I've learned.`, { parse_mode: 'Markdown' });
  });
  
  // /lessons - See what CTO has learned
  bot.command('lessons', async (ctx) => {
    const category = ctx.message?.text?.replace('/lessons', '').trim();
    
    if (!category) {
      await ctx.reply(`📚 *LESSONS LEARNED*

*What is this?*
I show you everything I've learned from our interactions. Use this to see how I'm improving!

*Options:*
\`/lessons\` - Show all recent lessons
\`/lessons success\` - Only successful patterns
\`/lessons failures\` - What didn't work (so we avoid it)

Fetching lessons...`, { parse_mode: 'Markdown' });
    }
    
    let lessons;
    if (category === 'success') {
      lessons = await getSuccessPatterns();
    } else {
      lessons = await getLessons(undefined, 15);
    }
    
    if (!lessons || lessons.length === 0) {
      await ctx.reply(`📚 No lessons recorded yet!

Start teaching me by using /feedback after trying my suggestions:
• /feedback success <what worked>
• /feedback fail <what didn't work>

The more feedback you give, the smarter I become! 🧠`);
      return;
    }
    
    const lessonList = lessons.map((l: any, i: number) => {
      const [id, cat, context, action, outcome, lesson] = l;
      const emoji = outcome === 'success' ? '✅' : outcome === 'failure' ? '❌' : '⚠️';
      return `${i + 1}. ${emoji} *${outcome}*\n   ${lesson || context?.substring(0, 100)}`;
    }).join('\n\n');
    
    await ctx.reply(`📚 *What I've Learned*

${lessonList}

━━━━━━━━━━━━━━━━━━━━
🧠 Total lessons: ${lessons.length}
✅ Successes: ${lessons.filter((l: any) => l[4] === 'success').length}
❌ Failures: ${lessons.filter((l: any) => l[4] === 'failure').length}

_Keep giving feedback to make me smarter!_`, { parse_mode: 'Markdown' });
  });
  
  // ==========================================================================
  // STRATEGIC INTELLIGENCE - Think like a CTO!
  // ==========================================================================
  
  // /strategy - Get strategic analysis of your ecosystem
  bot.command('strategy', async (ctx) => {
    const focus = ctx.message?.text?.replace('/strategy', '').trim();
    
    if (!focus) {
      await ctx.reply(`🎯 *STRATEGIC ANALYSIS*

*What is this?*
I analyze your entire ecosystem and give you strategic advice - like a real CTO thinking about the big picture!

*Options:*
\`/strategy\` - Full ecosystem analysis
\`/strategy EspaLuzWhatsApp\` - Focus on one product
\`/strategy growth\` - Growth opportunities
\`/strategy risks\` - Risk assessment
\`/strategy tech\` - Technical priorities

Analyzing your ecosystem...`, { parse_mode: 'Markdown' });
    }
    
    await ctx.reply('🎯 Analyzing ecosystem strategically...\n\n⏳ Gathering data from all sources...');
    
    try {
      // Gather ecosystem data
      let repoData: { name: string; commits: number; lastUpdate: string; issues: number }[] = [];
      
      for (const repo of AIDEAZZ_REPOS.slice(0, 6)) {
        try {
          const [commitsRes, repoInfo] = await Promise.all([
            octokit.repos.listCommits({
              owner: 'ElenaRevicheva',
              repo,
              per_page: 10
            }),
            octokit.repos.get({
              owner: 'ElenaRevicheva',
              repo
            })
          ]);
          
          const lastCommit = commitsRes.data[0];
          const daysSinceUpdate = lastCommit 
            ? Math.floor((Date.now() - new Date(lastCommit.commit.author?.date || '').getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          
          repoData.push({
            name: repo,
            commits: commitsRes.data.length,
            lastUpdate: daysSinceUpdate === 0 ? 'today' : `${daysSinceUpdate}d ago`,
            issues: repoInfo.data.open_issues_count
          });
        } catch {}
      }
      
      // Get tech debt
      const techDebt = await getTechDebt();
      const decisions = await getDecisions(undefined, 10);
      const lessons = await getLessons(undefined, 10);
      const insights = await getActiveInsights();
      
      // Build strategic context
      const repoSummary = repoData.map(r => 
        `${r.name}: ${r.commits} recent commits, updated ${r.lastUpdate}, ${r.issues} issues`
      ).join('\n');
      
      const debtSummary = techDebt.slice(0, 5).map((d: any) => d[2]).join('; ');
      const decisionSummary = decisions.slice(0, 5).map((d: any) => d[2]).join('; ');
      const lessonSummary = lessons.slice(0, 5).map((l: any) => l[5] || l[2]).join('; ');
      
      const strategyPrompt = `You are CTO of AIdeazz, a startup with these products:

ECOSYSTEM STATUS:
${repoSummary}

KNOWN TECH DEBT:
${debtSummary || 'None recorded'}

RECENT DECISIONS:
${decisionSummary || 'None recorded'}

LESSONS LEARNED:
${lessonSummary || 'None recorded'}

${focus ? `FOCUS AREA: ${focus}` : 'FULL STRATEGIC ANALYSIS'}

As CTO, provide strategic analysis:

1. 📊 *ECOSYSTEM HEALTH* (1-2 sentences)

2. 🎯 *TOP 3 PRIORITIES* - What to focus on this week
   - Priority 1: ...
   - Priority 2: ...
   - Priority 3: ...

3. ⚠️ *RISKS* - What could go wrong if ignored

4. 🚀 *OPPORTUNITIES* - Quick wins available now

5. 💡 *STRATEGIC RECOMMENDATION* - One key insight

Be specific, actionable, and think like a startup CTO who needs to ship fast but sustainably.
Consider: What would make this ecosystem more attractive to investors? What would help the founder become a stronger developer?`;

      const strategy = await askAI(strategyPrompt, 2500);
      
      await ctx.reply(`🎯 *Strategic Analysis*\n\n${strategy}`, { parse_mode: 'Markdown' });

      await saveAgentOutcome('cto_aipa', 'strategy_analysis_completed', {
        type: 'ecosystem_review'
      }, 'verified_delivered').catch(() => {});

      // Save key insights
      await saveInsight('strategic_review', 'Weekly strategic review completed', 3);
      
    } catch (error) {
      console.error('Strategy error:', error);
      await ctx.reply('❌ Error generating strategic analysis. Try again!');
    }
  });
  
  // /priorities - What should I work on today?
  bot.command('priorities', async (ctx) => {
    await ctx.reply(`🎯 *TODAY'S PRIORITIES*

*What is this?*
I analyze your tech debt, recent activity, and lessons learned to tell you what's most important to work on TODAY.

Analyzing...`, { parse_mode: 'Markdown' });
    
    try {
      // Gather priority data
      const techDebt = await getTechDebt();
      const insights = await getActiveInsights();
      const lessons = await getSuccessPatterns();
      
      // Check which repos need attention
      let staleRepos: string[] = [];
      for (const repo of AIDEAZZ_REPOS.slice(0, 6)) {
        try {
          const commits = await octokit.repos.listCommits({
            owner: 'ElenaRevicheva',
            repo,
            per_page: 1
          });
          const lastCommit = commits.data[0];
          if (lastCommit) {
            const daysSince = Math.floor((Date.now() - new Date(lastCommit.commit.author?.date || '').getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > 7) {
              staleRepos.push(`${repo} (${daysSince}d)`);
            }
          }
        } catch {}
      }
      
      const priorityPrompt = `Based on this data, give me 3 specific priorities for TODAY:

OPEN TECH DEBT (${techDebt.length} items):
${techDebt.slice(0, 5).map((d: any) => `- ${d[1]}: ${d[2]}`).join('\n') || 'None'}

STALE REPOS (no commits in 7+ days):
${staleRepos.join(', ') || 'None - all active!'}

SUCCESSFUL PATTERNS TO REPEAT:
${lessons.slice(0, 3).map((l: any) => l[3]).join('\n') || 'None yet'}

Give exactly 3 priorities with:
1. 🥇 *MUST DO* - Most critical
   What: ...
   Why: ...
   Time: X minutes
   Command: /cursor ... (or other command to start)

2. 🥈 *SHOULD DO* - Important
   What: ...
   Why: ...
   Time: X minutes
   Command: ...

3. 🥉 *COULD DO* - Nice to have
   What: ...
   Why: ...
   Time: X minutes
   Command: ...

Be specific! Reference actual repos and tasks.`;

      const priorities = await askAI(priorityPrompt, 1500);
      
      await ctx.reply(`🎯 *Today's Priorities*\n\n${priorities}\n\n━━━━━━━━━━━━━━━━━━━━\n💡 After completing a task, use /feedback to help me learn!`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Priorities error:', error);
      await ctx.reply('❌ Error calculating priorities. Try /strategy for full analysis.');
    }
  });
  
  // /think - Deep strategic thinking on a topic
  bot.command('think', async (ctx) => {
    const topic = ctx.message?.text?.replace('/think', '').trim();
    
    if (!topic) {
      await ctx.reply(`🧠 *DEEP THINKING MODE*

*What is this?*
I think deeply about a strategic question - product direction, technical architecture, business model, etc. Like brainstorming with a CTO!

*Examples:*
\`/think Should I add payments to EspaLuz or focus on growth first?\`

\`/think What's the best way to monetize ATUONA NFT gallery?\`

\`/think How should I position AIdeazz for investors?\`

\`/think Should I use microservices or keep it monolithic?\`

*What will I give you?*
🔍 Analysis of the question
⚖️ Pros and cons
🎯 Recommendation
📋 Next steps

👉 *Try now:* Ask a strategic question!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🧠 Thinking deeply...\n\n⏳ Analyzing from multiple angles...');
    
    // Gather context
    const decisions = await getDecisions(undefined, 5);
    const lessons = await getLessons(undefined, 5);
    
    const thinkPrompt = `You are a seasoned startup CTO thinking deeply about this question:

"${topic}"

CONTEXT - Previous decisions:
${decisions.map((d: any) => d[2] + ': ' + d[3]).join('\n') || 'None recorded'}

CONTEXT - Lessons learned:
${lessons.map((l: any) => l[5] || l[2]).join('\n') || 'None recorded'}

Think like a CTO who:
- Has been through multiple startups
- Understands both technical and business tradeoffs
- Knows the founder is solo and resource-constrained
- Wants sustainable growth, not hype

Provide:

🔍 *ANALYSIS*
(Break down the key factors, 3-4 points)

⚖️ *TRADEOFFS*
| Option A | Option B |
| Pros | Pros |
| Cons | Cons |

🎯 *MY RECOMMENDATION*
(Clear stance with reasoning)

📋 *NEXT STEPS*
1. ...
2. ...
3. ...

💭 *CONTRARIAN VIEW*
(What if I'm wrong? Alternative perspective)

Be thoughtful, specific, and actionable.`;

    const thinking = await askAI(thinkPrompt, 2500);
    
    await ctx.reply(`🧠 *Deep Thinking: ${topic.substring(0, 50)}...*\n\n${thinking}`, { parse_mode: 'Markdown' });

    await saveAgentOutcome('cto_aipa', 'strategic_thinking_completed', {
      topic: topic.substring(0, 200)
    }, 'verified_delivered').catch(() => {});

    // Save as insight
    await saveInsight('strategic_thinking', `Analyzed: ${topic.substring(0, 200)}`, 2);
  });
  
  // /stats - Ecosystem statistics
  bot.command('stats', async (ctx) => {
    await ctx.reply('📊 Calculating ecosystem stats...');
    
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      let totalCommitsThisWeek = 0;
      let mostActiveRepo = { name: '', commits: 0 };
      const repoStats: { name: string; commits: number; lastCommit: string }[] = [];
      
      // Gather stats from all repos
      for (const repo of AIDEAZZ_REPOS) {
        try {
          const commits = await octokit.repos.listCommits({
            owner: 'ElenaRevicheva',
            repo,
            since: weekAgo.toISOString(),
            per_page: 100
          });
          
          const commitCount = commits.data.length;
          totalCommitsThisWeek += commitCount;
          
          if (commitCount > mostActiveRepo.commits) {
            mostActiveRepo = { name: repo, commits: commitCount };
          }
          
          // Get last commit date
          const latestCommit = commits.data[0];
          let lastCommitText = 'No recent';
          if (latestCommit) {
            const commitDate = new Date(latestCommit.commit.author?.date || '');
            const daysAgo = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
            lastCommitText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
          }
          
          if (commitCount > 0) {
            repoStats.push({ name: repo, commits: commitCount, lastCommit: lastCommitText });
          }
        } catch {
          // Skip repos that error
        }
      }
      
      // Sort by most commits
      repoStats.sort((a, b) => b.commits - a.commits);
      
      // Get open PRs count
      let openPRs = 0;
      try {
        const prs = await octokit.search.issuesAndPullRequests({
          q: 'is:pr is:open author:ElenaRevicheva',
          per_page: 100
        });
        openPRs = prs.data.total_count;
      } catch {}
      
      // Format stats
      const topRepos = repoStats.slice(0, 5).map(r => 
        `• ${r.name}: ${r.commits} commits (${r.lastCommit})`
      ).join('\n');
      
      const avgPerDay = (totalCommitsThisWeek / 7).toFixed(1);
      
      const statsMessage = `📊 *AIdeazz Ecosystem Stats*

📅 *This Week*
• Total commits: ${totalCommitsThisWeek}
• Average: ${avgPerDay}/day
• Open PRs: ${openPRs}

🔥 *Most Active*
${mostActiveRepo.name} (${mostActiveRepo.commits} commits)

📈 *Top Repos This Week*
${topRepos || 'No activity this week'}

🏆 *Productivity*
${totalCommitsThisWeek > 20 ? '🚀 On fire!' : totalCommitsThisWeek > 10 ? '💪 Great progress!' : totalCommitsThisWeek > 5 ? '👍 Steady work!' : '🌱 Quiet week'}

_Keep shipping! Use /daily for focus._`;

      // Send without Markdown to avoid parsing issues with repo names containing underscores
      await ctx.reply(statsMessage.replace(/\*/g, ''));
      
    } catch (error) {
      console.error('Stats error:', error);
      await ctx.reply('❌ Error calculating stats. Try again!');
    }
  });
  
  // ==========================================================================
  // LEARNING & TEACHING COMMANDS - Become a real coder!
  // ==========================================================================
  
  // /learn - Structured coding lessons
  bot.command('learn', async (ctx) => {
    const topic = ctx.message?.text?.replace('/learn', '').trim().toLowerCase();
    
    if (!topic) {
      const topicsMessage = `🎓 *LEARN TO CODE*

*What is this?*
I teach you coding concepts with simple explanations and examples. Like having a patient teacher!

*Pick a topic (just click one):*

📗 *Beginner*
/learn typescript
/learn git
/learn api

📘 *Intermediate*  
/learn database
/learn testing

📕 *Advanced*
/learn architecture
/learn security

🎯 *For YOUR projects*
/learn cursor - Master local Cursor
/learn whatsapp - WhatsApp bots
/learn oracle - Oracle Cloud

*What will I give you?*
📝 Simple explanation
💡 Real examples
🎯 Practice exercise

👉 *Try now:* /learn typescript`;
      await ctx.reply(topicsMessage, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`📚 Preparing your ${topic} lesson...`);
    
    try {
      const lessonPrompt = `${AIDEAZZ_CONTEXT}

Elena wants to learn "${topic}". She's a "vibe coder" transitioning to become a real coder.

Create a structured lesson that:
1. Explains the concept simply (2-3 sentences)
2. Shows a practical code example (keep it short, 10-15 lines max)
3. Gives ONE exercise she can do RIGHT NOW in her local Cursor
4. The exercise should take 5-10 minutes max

Format for Telegram (no markdown that might break):
- Use emojis
- Keep code blocks simple
- Be encouraging but practical
- End with "Try this in Cursor, then tell me how it went!"

Remember: She uses Cursor AI Agents, so the exercise should work there.`;

      // Use askAI with Groq fallback
      const lesson = await askAI(lessonPrompt, 2000);
      
      // Save progress
      await saveMemory('CTO', 'learning_progress', { 
        topic,
        type: 'lesson'
      }, lesson, {
        platform: 'telegram',
        type: 'learning',
        timestamp: new Date().toISOString()
      });
      
      // Split long messages
      if (lesson.length > 4000) {
        const parts = lesson.match(/.{1,4000}/g) || [];
        for (const part of parts) {
          await ctx.reply(part);
        }
      } else {
        await ctx.reply(lesson);
      }

      await saveAgentOutcome('cto_aipa', 'lesson_delivered', {
        topic: topic
      }, 'verified_delivered').catch(() => {});

    } catch (error) {
      console.error('Learn error:', error);
      await ctx.reply('❌ Error generating lesson. Try again!');
    }
  });
  
  // /exercise - Get a coding challenge
  bot.command('exercise', async (ctx) => {
    const difficulty = ctx.message?.text?.replace('/exercise', '').trim().toLowerCase() || 'beginner';
    
    await ctx.reply(`🏋️ Generating ${difficulty} coding exercise...`);
    
    try {
      const exercisePrompt = `${AIDEAZZ_CONTEXT}

Create a ${difficulty} coding exercise for Elena. She uses Cursor AI and is learning to code properly.

Requirements:
1. Exercise should take 10-15 minutes
2. Should be practical (something useful for AIdeazz)
3. Give clear step-by-step instructions
4. Include what the expected output should look like
5. Suggest she use Cursor Agent to help if stuck

Difficulty level: ${difficulty}
- beginner: Simple function, basic logic
- intermediate: API call, file handling, classes
- advanced: Architecture, async patterns, testing

Format for Telegram (no complex markdown):
🎯 Challenge: [name]
⏱️ Time: 10-15 min
📝 Instructions:
1. ...
2. ...
✅ Expected Output:
💡 Hint: ...

Be specific and practical!`;

      // Use askAI with Groq fallback
      const exercise = await askAI(exercisePrompt, 1500);

      await ctx.reply(exercise);

      await saveAgentOutcome('cto_aipa', 'exercise_delivered', {
        difficulty
      }, 'verified_delivered').catch(() => {});

    } catch (error) {
      console.error('Exercise error:', error);
      await ctx.reply('❌ Error generating exercise. Try again!');
    }
  });
  
  // /explain - Explain any coding concept
  bot.command('explain', async (ctx) => {
    const concept = ctx.message?.text?.replace('/explain', '').trim();
    
    if (!concept) {
      await ctx.reply('🤔 What should I explain?\n\nExample:\n/explain async await\n/explain API\n/explain git rebase\n/explain how does OAuth work');
      return;
    }
    
    await ctx.reply(`🧠 Let me explain "${concept}"...`);
    
    try {
      const explainPrompt = `${AIDEAZZ_CONTEXT}

Elena asks: "Explain ${concept}"

She's transitioning from "vibe coder" to real coder. Explain this concept:
1. Simple analogy (like explaining to a smart 10-year-old)
2. Why it matters (practical use case)
3. Quick code example if relevant (keep very short)
4. How she can practice this in her AIdeazz projects

Keep it concise for Telegram. Use emojis. Be encouraging!`;

      // Use askAI with Groq fallback
      const explanation = await askAI(explainPrompt, 1500);
      
      await ctx.reply(explanation);
      
    } catch (error) {
      console.error('Explain error:', error);
      await ctx.reply('❌ Error explaining concept. Try again!');
    }
  });
  
  // ==========================================================================
  // CODING COMMANDS - CTO writes real code!
  // ==========================================================================
  
  // /code - Generate code and create PR
  bot.command('code', async (ctx) => {
    const input = ctx.message?.text?.replace('/code', '').trim();
    
    if (!input) {
      await ctx.reply(`💻 *CODE GENERATOR*

*What is this?*
I write code for you and prepare it as a GitHub Pull Request. But I show you first so you can approve before it goes live!

*What do I need from you?*
Tell me which product and what you want me to create.

*Examples (copy and edit):*
\`/code EspaLuzWhatsApp add a welcome message for new students\`
\`/code atuona add a share button for poems\`
\`/code AIPA_AITCF add a /hello command\`

*What happens next?*
1️⃣ I generate the code
2️⃣ I show it to you for review
3️⃣ You type /approve to create PR
4️⃣ Or /reject to throw it away

*Difference from /cursor:*
• /code = I write, you approve
• /cursor = I guide, you write in Cursor

👉 *Try now:* /code and describe what you want!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and task
    const parts = input.split(' ');
    const repoInput = parts[0];
    const task = parts.slice(1).join(' ');
    
    if (!repoInput || !task) {
      await ctx.reply('❌ Please provide both repo and task!\n\nExample: /code atuona Add README with project description\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon', { parse_mode: 'Markdown' });
      return;
    }
    
    // Resolve repo name (supports aliases)
    const repoName = resolveRepoName(repoInput);
    
    if (!repoName) {
      await ctx.reply(`❌ Repo "${repoInput}" not found.\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`💻 Working on "${task}" for ${escapeMarkdown(repoName)}...\n\n⏳ This may take a minute...`);
    
    try {
      // 1. Check if repo exists and get default branch
      const { data: repoData } = await octokit.repos.get({
        owner: 'ElenaRevicheva',
        repo: repoName
      });
      
      const defaultBranch = repoData.default_branch;
      
      // 2. Get the current file structure
      let fileList = '';
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: ''
        });
        
        if (Array.isArray(contents)) {
          fileList = contents.map((f: any) => `${f.type}: ${f.name}`).join('\n');
        }
      } catch {
        fileList = 'Could not fetch file list';
      }
      
      // 3. Ask Claude to generate the code
      const codePrompt = `${AIDEAZZ_CONTEXT}

Elena wants you to: "${task}"
Repository: ${repoName}
Current files in repo:
${fileList}

Generate the code changes needed. Return your response in this EXACT format:

FILENAME: <filename to create or modify>
\`\`\`
<file contents>
\`\`\`

COMMIT_MESSAGE: <short commit message>

PR_TITLE: <PR title>

PR_BODY: <PR description, 2-3 sentences>

Important:
- Generate complete, working code
- If creating a new file, provide full contents
- If modifying, mention what to add/change
- Keep it practical and simple
- This is for a real PR that will be reviewed`;

      // Use askAI with Groq fallback
      const codeResponse = await askAI(codePrompt, 4000);
      
      // Parse the response
      const filenameMatch = codeResponse.match(/FILENAME:\s*(.+)/);
      const codeMatch = codeResponse.match(/```[\w]*\n([\s\S]*?)```/);
      const commitMatch = codeResponse.match(/COMMIT_MESSAGE:\s*(.+)/);
      const prTitleMatch = codeResponse.match(/PR_TITLE:\s*(.+)/);
      const prBodyMatch = codeResponse.match(/PR_BODY:\s*([\s\S]*?)(?=\n\n|$)/);
      
      if (!filenameMatch || !filenameMatch[1] || !codeMatch || !codeMatch[1]) {
        await ctx.reply(`🤖 Here's what I'd suggest for "${task}":\n\n${codeResponse.substring(0, 3000)}\n\n⚠️ Could not auto-create PR. You can copy this code to Cursor!`);
        return;
      }
      
      const filename = filenameMatch[1].trim();
      const code = codeMatch[1];
      const commitMessage = (commitMatch && commitMatch[1]) ? commitMatch[1].trim() : `feat: ${task}`;
      const prTitle = (prTitleMatch && prTitleMatch[1]) ? prTitleMatch[1].trim() : `CTO AIPA: ${task}`;
      const prBody = (prBodyMatch && prBodyMatch[1]) ? prBodyMatch[1].trim() : `Automated PR by CTO AIPA.\n\nTask: ${task}`;
      
      // 4. SAFE MODE: Save pending code for review instead of auto-commit
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Could not identify chat. Try again.');
        return;
      }
      
      await savePendingCode(
        chatId,
        repoName,
        task,
        filename,
        code,
        commitMessage,
        prTitle,
        prBody
      );
      
      // Show preview with code snippet
      const codePreview = code.length > 1500 ? code.substring(0, 1500) + '\n... (truncated)' : code;
      
      await ctx.reply(`📝 *CODE PREVIEW*

📁 *File:* ${filename}
📦 *Repo:* ${repoName}
💬 *Commit:* ${commitMessage}

━━━━━━━━━━━━━━━━━━━━
\`\`\`
${codePreview}
\`\`\`
━━━━━━━━━━━━━━━━━━━━

⚠️ *This code has NOT been committed yet!*

Review the code above, then:
✅ /approve - Create PR with this code
❌ /reject - Discard this code
📝 /code again - Generate different code

_A real CTO reviews before committing!_`, { parse_mode: 'Markdown' });
      
      // Save to memory
      await saveMemory('CTO', 'code_preview', {
        repo: repoName,
        task,
        filename
      }, 'Code generated, awaiting approval', {
        platform: 'telegram',
        type: 'code_preview',
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Code generation error:', error);
      
      if (error.status === 404) {
        await ctx.reply(`❌ Repo "${repoName}" not found. Use /repos to see available repos.`);
      } else if (error.status === 422) {
        await ctx.reply(`❌ Could not create PR. The branch might already exist or there's a conflict.`);
      } else {
        await ctx.reply(`❌ Error creating code: ${error.message || 'Unknown error'}\n\nTry again or use Cursor for complex tasks!`);
      }
    }
  });
  
  // /approve - Actually create PR from pending code
  bot.command('approve', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.reply('❌ Could not identify chat.');
      return;
    }
    
    const pending = await getPendingCode(chatId);
    if (!pending) {
      await ctx.reply('❌ No pending code to approve.\n\nUse /code first to generate code.');
      return;
    }
    
    await ctx.reply('✅ Approving code and creating PR...');
    
    try {
      // Extract pending code data
      const [id, repoName, task, filename, code, commitMessage, prTitle, prBody] = pending as any[];
      
      // Get default branch
      const { data: repoData } = await octokit.repos.get({
        owner: 'ElenaRevicheva',
        repo: repoName
      });
      const defaultBranch = repoData.default_branch;
      
      // Create branch
      const branchName = `cto-aipa/${Date.now()}`;
      const { data: refData } = await octokit.git.getRef({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: `heads/${defaultBranch}`
      });
      
      await octokit.git.createRef({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha
      });
      
      // Check if file exists
      let fileSha: string | undefined;
      try {
        const { data: existingFile } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: filename,
          ref: defaultBranch
        });
        if (!Array.isArray(existingFile)) {
          fileSha = existingFile.sha;
        }
      } catch {
        // File doesn't exist
      }
      
      // Create/update file
      const createFileParams: any = {
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filename,
        message: commitMessage,
        content: Buffer.from(code).toString('base64'),
        branch: branchName
      };
      if (fileSha) createFileParams.sha = fileSha;
      
      await octokit.repos.createOrUpdateFileContents(createFileParams);
      
      // Create PR
      const { data: pr } = await octokit.pulls.create({
        owner: 'ElenaRevicheva',
        repo: repoName,
        title: prTitle,
        body: `${prBody}\n\n---\n🤖 *Generated by CTO AIPA*\n✅ *Approved by human before commit*`,
        head: branchName,
        base: defaultBranch
      });
      
      // Clear pending code
      await clearPendingCode(chatId, 'approved');
      
      await ctx.reply(`✅ *PR Created!*

📁 File: ${filename}
🔀 Branch: ${branchName}
📝 PR: #${pr.number}

🔗 ${pr.html_url}

_Human-approved code is better code!_ 🎯`, { parse_mode: 'Markdown' });

      await saveAgentOutcome('cto_aipa', 'code_approved_pr_created', {
        repo: repoName,
        filename,
        pr_number: pr.number,
        task: task?.substring(0, 200)
      }, 'verified_delivered').catch(() => {});

      await saveMemory('CTO', 'code_approved', {
        repo: repoName,
        task,
        filename,
        pr_number: pr.number
      }, `PR #${pr.number} created after approval`, {
        platform: 'telegram',
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Approve error:', error);
      await ctx.reply(`❌ Error creating PR: ${error.message || 'Unknown error'}`);
    }
  });
  
  // /reject - Discard pending code
  bot.command('reject', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.reply('❌ Could not identify chat.');
      return;
    }
    
    const pending = await getPendingCode(chatId);
    if (!pending) {
      await ctx.reply('❌ No pending code to reject.');
      return;
    }
    
    await clearPendingCode(chatId, 'rejected');
    await ctx.reply('🗑️ Code rejected and discarded.\n\nUse /code to generate new code.');
  });
  
  // /pending - Show pending code status
  bot.command('pending', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.reply('❌ Could not identify chat.');
      return;
    }
    
    const pending = await getPendingCode(chatId);
    if (!pending) {
      await ctx.reply('📭 No pending code awaiting approval.\n\nUse /code to generate code.');
      return;
    }
    
    const [id, repoName, task, filename] = pending as any[];
    await ctx.reply(`📋 *Pending Code*

📦 Repo: ${repoName}
📁 File: ${filename}
📝 Task: ${task}

Use /approve to create PR or /reject to discard.`, { parse_mode: 'Markdown' });
  });
  
  // /fix - Fix an issue and create PR
  bot.command('fix', async (ctx) => {
    const input = ctx.message?.text?.replace('/fix', '').trim();
    
    if (!input) {
      await ctx.reply(`🔧 *FIX BUGS*

*What is this?*
Tell me what's broken and I'll generate a fix! Like /code but specifically for fixing problems.

*What do I need from you?*
Tell me which product and what's wrong - in your own words!

*Examples (copy and edit):*
\`/fix EspaLuzWhatsApp the bot stops responding after 5 minutes\`
\`/fix atuona images load too slowly\`
\`/fix AIPA_AITCF error when sending voice messages\`

*What happens next?*
1️⃣ I analyze your code
2️⃣ I generate a fix
3️⃣ You review it
4️⃣ /approve to create PR or /reject

👉 *Try now:* Describe what's broken!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and issue
    const parts = input.split(' ');
    const repoInput = parts[0];
    const issue = parts.slice(1).join(' ');
    
    if (!repoInput || !issue) {
      await ctx.reply('❌ Please provide both repo and issue!\n\nExample: /fix espaluz Fix timeout errors\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon', { parse_mode: 'Markdown' });
      return;
    }
    
    // Resolve repo name (supports aliases)
    const repoName = resolveRepoName(repoInput);
    
    if (!repoName) {
      await ctx.reply(`❌ Repo "${repoInput}" not found.\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`🔧 Analyzing "${issue}" in ${escapeMarkdown(repoName)}...\n\n⏳ Looking at the code...`);
    
    // Reuse the /code logic with fix context
    await ctx.reply(`🔧 Working on fixing "${issue}" in ${escapeMarkdown(repoName)}...\n\n⏳ Analyzing code and creating fix...`);
    
    try {
      // Get repo info
      const { data: repoData } = await octokit.repos.get({
        owner: 'ElenaRevicheva',
        repo: repoName
      });
      
      const defaultBranch = repoData.default_branch;
      
      // Get relevant files for context
      let fileContext = '';
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: ''
        });
        
        if (Array.isArray(contents)) {
          fileContext = contents.slice(0, 10).map((f: any) => f.name).join(', ');
        }
      } catch {}
      
      // Ask Claude to analyze and fix
      const fixPrompt = `${AIDEAZZ_CONTEXT}

Elena wants to fix: "${issue}"
Repository: ${repoName}
Files: ${fileContext}

Analyze this issue and provide a fix. Return in this format:

FILENAME: <file to create or modify>
\`\`\`
<complete file contents with the fix>
\`\`\`

COMMIT_MESSAGE: fix: <description>

PR_TITLE: Fix: ${issue}

PR_BODY: <2-3 sentence description of the fix>

Be practical and create working code.`;

      // Use askAI with Groq fallback
      const fixResponse = await askAI(fixPrompt, 4000);
      
      // Parse response
      const filenameMatch = fixResponse.match(/FILENAME:\s*(.+)/);
      const codeMatch = fixResponse.match(/```[\w]*\n([\s\S]*?)```/);
      const commitMatch = fixResponse.match(/COMMIT_MESSAGE:\s*(.+)/);
      
      if (!filenameMatch || !filenameMatch[1] || !codeMatch || !codeMatch[1]) {
        await ctx.reply(`🔧 Here's my analysis and suggested fix:\n\n${fixResponse.substring(0, 3000)}\n\n⚠️ Apply this fix manually in Cursor!`);
        return;
      }
      
      const filename = filenameMatch[1].trim();
      const code = codeMatch[1];
      const commitMessage = (commitMatch && commitMatch[1]) ? commitMatch[1].trim() : `fix: ${issue}`;
      const prTitle = `🔧 Fix: ${issue}`;
      const prBody = `Fix for: ${issue}\n\nGenerated by CTO AIPA`;
      
      // SAFE MODE: Save pending code for review instead of auto-commit
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Could not identify chat. Try again.');
        return;
      }
      
      await savePendingCode(
        chatId,
        repoName,
        `Fix: ${issue}`,
        filename,
        code,
        commitMessage,
        prTitle,
        prBody
      );
      
      // Show preview with code snippet
      const codePreview = code.length > 1500 ? code.substring(0, 1500) + '\n... (truncated)' : code;
      
      await ctx.reply(`🔧 *FIX PREVIEW*

📁 *File:* ${filename}
📦 *Repo:* ${repoName}
🐛 *Issue:* ${issue}

━━━━━━━━━━━━━━━━━━━━
\`\`\`
${codePreview}
\`\`\`
━━━━━━━━━━━━━━━━━━━━

⚠️ *This fix has NOT been committed yet!*

Review the code above, then:
✅ /approve - Create PR with this fix
❌ /reject - Discard this fix
🔧 /fix again - Generate different fix

_A real CTO reviews fixes before deploying!_`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Fix error:', error);
      await ctx.reply(`❌ Error creating fix: ${error.message || 'Unknown error'}\n\nTry using Cursor for complex fixes!`);
    }
  });
  
  // /review - Review latest commit
  bot.command('review', async (ctx) => {
    const repoInput = ctx.message?.text?.replace('/review', '').trim();
    
    if (!repoInput) {
      await ctx.reply(`🔍 *CODE REVIEW*

*What is this?*
I review the latest changes in any of your repos - like having a senior developer check your code!

*What do I need from you?*
Just tell me which product to review.

*Examples:*
\`/review cto\` or \`/review AIPA_AITCF\`
\`/review espaluz\` or \`/review EspaLuzWhatsApp\`
\`/review atuona\`

*Shortcuts:* cto, cmo, espaluz, atuona, dragon, saas, docs, pitch

*What will I give you?*
📝 What changed
⚠️ Any issues I spot
💡 Suggestions to improve
✅ or ❌ Overall verdict

👉 *Try now:* /review cto`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Resolve repo name (supports aliases)
    const repoName = resolveRepoName(repoInput);
    
    if (!repoName) {
      await ctx.reply(`❌ Repo "${repoInput}" not found.\n\n*Available repos:* ${AIDEAZZ_REPOS.slice(0, 5).map(r => escapeMarkdown(r)).join(', ')}...\n\n*Shortcuts:* cto, cmo, espaluz, atuona, dragon`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`🔍 Reviewing latest commit in ${escapeMarkdown(repoName)}...\n\n_Fetching codebase context..._`, { parse_mode: 'Markdown' });
    
    try {
      // Get latest commit
      const commits = await octokit.repos.listCommits({
        owner: 'ElenaRevicheva',
        repo: repoName,
        per_page: 1
      });
      
      if (commits.data.length === 0) {
        await ctx.reply('No commits found in this repo.');
        return;
      }
      
      const latestCommit = commits.data[0];
      const commitMessage = latestCommit?.commit?.message || 'No message';
      const commitSha = latestCommit?.sha?.substring(0, 7) || 'unknown';
      const commitDate = latestCommit?.commit?.author?.date || 'unknown';
      
      // Get commit diff
      const { data: commitData } = await octokit.repos.getCommit({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: latestCommit?.sha || '',
        mediaType: { format: 'diff' }
      });
      
      const diff = (commitData as unknown as string).substring(0, 3000); // Limit diff size
      
      // ==========================================================================
      // ENHANCED CONTEXT: Fetch actual codebase info for better review
      // ==========================================================================
      
      let packageJson = '';
      let techStack = '';
      let repoDescription = '';
      
      // Try to fetch package.json for tech stack context
      try {
        const { data: pkgFile } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: 'package.json'
        });
        if (!Array.isArray(pkgFile) && pkgFile.type === 'file' && 'content' in pkgFile) {
          packageJson = Buffer.from(pkgFile.content, 'base64').toString('utf-8');
          const pkg = JSON.parse(packageJson);
          const deps = Object.keys(pkg.dependencies || {}).slice(0, 10).join(', ');
          techStack = `Dependencies: ${deps}`;
        }
      } catch {
        // No package.json
      }
      
      // Get repo description
      try {
        const { data: repoInfo } = await octokit.repos.get({
          owner: 'ElenaRevicheva',
          repo: repoName
        });
        repoDescription = repoInfo.description || '';
      } catch {}
      
      // Fetch relevant architectural decisions for this repo
      const decisions = await getDecisions(repoName, 3);
      let decisionsContext = '';
      if (decisions && decisions.length > 0) {
        decisionsContext = '\n\nRELEVANT ARCHITECTURAL DECISIONS:\n' + 
          decisions.map((d: any) => `- ${d[2]}: ${d[3]}`).join('\n');
      }
      
      // Fetch open tech debt for this repo
      const techDebt = await getTechDebt(repoName, 'open');
      let techDebtContext = '';
      if (techDebt && techDebt.length > 0) {
        techDebtContext = '\n\nKNOWN TECH DEBT:\n' + 
          techDebt.slice(0, 3).map((d: any) => `- ${d[2]}`).join('\n');
      }
      
      // Ask CTO to review with enhanced context
      const reviewPrompt = `${AIDEAZZ_CONTEXT}

Review this commit with REAL CODEBASE CONTEXT:

Repo: ${repoName}
Description: ${repoDescription || 'No description'}
${techStack ? `Tech Stack: ${techStack}` : ''}
Commit: ${commitSha}
Message: ${commitMessage}
Date: ${commitDate}
${decisionsContext}
${techDebtContext}

Diff (truncated):
${diff}

As a TRUE Technical Co-Founder, give a review that:
• Understands the context of this specific repo
• References past decisions if relevant
• Notes if this addresses known tech debt
• Spots real issues (not generic advice)
• Gives ONE specific, actionable suggestion

Format for Telegram (keep concise):
📝 What changed
⚠️ Issues (if any)
💡 Suggestion
✅ or ⚠️ or ❌ Verdict`;

      // Use askAI with Groq fallback
      const review = await askAI(reviewPrompt, 1200);
      
      // Escape special characters for Telegram
      const safeCommitMessage = commitMessage.replace(/[_*`\[\]()~>#+\-=|{}.!]/g, '\\$&');
      const safeRepoName = repoName.replace(/[_*`\[\]()~>#+\-=|{}.!]/g, '\\$&');
      
      const reviewMessage = `🔍 Review: ${safeRepoName}
📝 Commit: ${commitSha}
💬 "${safeCommitMessage.substring(0, 100)}"
${techStack ? `\n📦 ${techStack.substring(0, 100)}` : ''}

${review}`;
      
      // Send without Markdown to avoid parsing issues with AI-generated content
      await ctx.reply(reviewMessage);

      await saveAgentOutcome('cto_aipa', 'code_review_completed', {
        repo: repoName,
        commit_sha: commitSha
      }, 'verified_delivered').catch(() => {});

    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ Repo "${repoName}" not found. Use /repos to see available repos.`);
      } else {
        await ctx.reply('❌ Error reviewing commit. Try again later.');
        console.error('Review error:', error);
      }
    }
  });
  
  // ==========================================================================
  // 🚀 CURSOR-LEVEL CAPABILITIES - Direct File Operations via GitHub API
  // ==========================================================================

  // /readfile - Read any file from any repo (like local Cursor)
  bot.command('readfile', async (ctx) => {
    const input = ctx.message?.text?.replace('/readfile', '').trim();
    
    if (!input) {
      await ctx.reply(`📖 *READ FILE - See Code Instantly*

Read any file from any AIdeazz repo:

\`/readfile cto src/telegram-bot.ts\`
\`/readfile espaluz index.ts\`
\`/readfile atuona src/gallery.ts\`

With line range:
\`/readfile cto src/telegram-bot.ts 1-50\`

I'll show you the actual code! 📄`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoInput = parts[0] || '';
    const filePath = parts[1] || '';
    const lineRange = parts[2] || '';
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"\n\nUse /repos to see available repos.`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!\n\nExample: `/readfile cto src/telegram-bot.ts`', { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`📖 Reading ${filePath} from ${repoName}...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ This is a directory, not a file. Use /tree to see contents.');
        return;
      }
      
      let content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const lines = content.split('\n');
      
      // Track in session context for Cursor-twin memory
      addFileToContext(ctx.from?.id || 0, repoName, filePath, content);
      
      // Handle line range
      let startLine = 1;
      let endLine = lines.length;
      if (lineRange && lineRange.includes('-')) {
        const rangeParts = lineRange.split('-');
        const start = parseInt(rangeParts[0] || '1');
        const end = parseInt(rangeParts[1] || String(lines.length));
        if (!isNaN(start)) startLine = Math.max(1, start);
        if (!isNaN(end)) endLine = Math.min(lines.length, end);
      }
      
      // Add line numbers
      const numberedLines = lines
        .slice(startLine - 1, endLine)
        .map((line, i) => `${String(startLine + i).padStart(4)} | ${line}`)
        .join('\n');
      
      // Split if too long for Telegram
      const maxLen = 3500;
      if (numberedLines.length > maxLen) {
        const chunks = [];
        let current = '';
        for (const line of numberedLines.split('\n')) {
          if ((current + line).length > maxLen) {
            chunks.push(current);
            current = line + '\n';
          } else {
            current += line + '\n';
          }
        }
        if (current) chunks.push(current);
        
        for (let i = 0; i < Math.min(chunks.length, 5); i++) {
          await ctx.reply(`📄 ${filePath} (${startLine}-${endLine}) [${i+1}/${chunks.length}]\n\n\`\`\`\n${chunks[i]}\`\`\``, { parse_mode: 'Markdown' });
        }
        if (chunks.length > 5) {
          await ctx.reply(`⚠️ File too long. Showing first 5 chunks. Use line range to see specific sections.`);
        }
      } else {
        await ctx.reply(`📄 *${repoName}/${filePath}* (lines ${startLine}-${endLine})\n\n\`\`\`\n${numberedLines}\`\`\``, { parse_mode: 'Markdown' });
      }
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ File not found: ${filePath}\n\nUse \`/tree ${repoInput}\` to see available files.`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('❌ Error reading file. Check the path and try again.');
        console.error('Read file error:', error);
      }
    }
  });

  // /tree - Show directory structure (like ls in terminal)
  bot.command('tree', async (ctx) => {
    const input = ctx.message?.text?.replace('/tree', '').trim();
    
    if (!input) {
      await ctx.reply(`🌳 *DIRECTORY TREE*

See the file structure of any repo:

\`/tree cto\` - Root of CTO AIPA
\`/tree cto src\` - Just the src folder
\`/tree espaluz\` - EspaLuz structure

Like \`ls\` command but for GitHub! 📁`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoInput = parts[0] || '';
    const dirPath = parts[1] || '';
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    try {
      const { data: contents } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: dirPath
      });
      
      if (!Array.isArray(contents)) {
        await ctx.reply('❌ This is a file, not a directory. Use /readfile to view it.');
        return;
      }
      
      const tree = contents
        .sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1;
          if (a.type !== 'dir' && b.type === 'dir') return 1;
          return a.name.localeCompare(b.name);
        })
        .map(item => `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`)
        .join('\n');
      
      await ctx.reply(`🌳 *${repoName}/${dirPath || ''}*\n\n${tree}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ Directory not found: ${dirPath || 'root'}`);
      } else {
        await ctx.reply('❌ Error listing directory.');
        console.error('Tree error:', error);
      }
    }
  });

  // /search - Search code across repos (like grep)
  bot.command('search', async (ctx) => {
    const input = ctx.message?.text?.replace('/search', '').trim();
    
    if (!input) {
      await ctx.reply(`🔍 *CODE SEARCH - Find Anything*

Search across all AIdeazz repos:

\`/search handleQuestion\` - Find function
\`/search TODO\` - Find all TODOs
\`/search cto getRelevantMemory\` - Search in specific repo

Like grep but for your whole codebase! 🔎`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    let repoFilter: string | null = null;
    let query = input;
    
    // Check if first word is a repo name
    const possibleRepo = resolveRepoName(parts[0] || '');
    if (possibleRepo && parts.length > 1) {
      repoFilter = possibleRepo;
      query = parts.slice(1).join(' ');
    }
    
    await ctx.reply(`🔍 Searching for "${query}"${repoFilter ? ` in ${repoFilter}` : ' across all repos'}...`);
    
    try {
      const searchQuery = repoFilter 
        ? `${query} repo:ElenaRevicheva/${repoFilter}`
        : `${query} user:ElenaRevicheva`;
      
      const { data: results } = await octokit.search.code({
        q: searchQuery,
        per_page: 10
      });
      
      if (results.total_count === 0) {
        await ctx.reply(`❌ No results found for "${query}"`);
        return;
      }
      
      let response = `🔍 *Found ${results.total_count} results:*\n\n`;
      
      for (const item of results.items.slice(0, 8)) {
        const repoShort = item.repository.name;
        response += `📄 *${repoShort}/${item.path}*\n`;
        response += `   \`/readfile ${repoShort} ${item.path}\`\n\n`;
      }
      
      if (results.total_count > 8) {
        response += `\n_...and ${results.total_count - 8} more results_`;
      }
      
      await ctx.reply(response, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Search error:', error);
      await ctx.reply('❌ Search error. Try a different query.');
    }
  });

  // /editfile - Actually edit files via GitHub API!
  bot.command('editfile', async (ctx) => {
    const input = ctx.message?.text?.replace('/editfile', '').trim();
    
    if (!input) {
      await ctx.reply(`✏️ *EDIT FILE - Real Code Changes!*

I can actually edit files in your repos! This is REAL, not instructions.

*Step 1:* Tell me what to edit
\`/editfile cto src/telegram-bot.ts\`

*Step 2:* I'll show you the file and ask what to change

*Step 3:* I'll make the edit and create a commit!

⚠️ Changes go directly to GitHub. Use with care!

_Like Cursor, but remote!_ 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoInput = parts[0] || '';
    const filePath = parts.slice(1).join(' ');
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!');
      return;
    }
    
    await ctx.reply(`✏️ Loading ${filePath} for editing...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Cannot edit directories.');
        return;
      }
      
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const lines = content.split('\n');
      
      // Store file info for pending edit
      saveFileEditState(ctx.from?.id || 0, {
        action: 'edit',
        repo: repoName,
        path: filePath,
        content: content,
        sha: fileData.sha
      });
      
      // Show first 50 lines
      const preview = lines.slice(0, 50).map((l, i) => `${String(i+1).padStart(3)} | ${l}`).join('\n');
      
      await ctx.reply(`✏️ *Editing: ${repoName}/${filePath}*
      
Total lines: ${lines.length}
Preview (first 50 lines):

\`\`\`
${preview.substring(0, 2000)}
\`\`\`

Now tell me what to change! Examples:
• "Add a console.log at line 25"
• "Replace lines 10-15 with [code]"
• "Add this function after line 100: [code]"

Or use \`/readfile ${repoInput} ${filePath} 40-80\` to see more.`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ File not found: ${filePath}`);
      } else {
        await ctx.reply('❌ Error loading file for edit.');
        console.error('Edit file error:', error);
      }
    }
  });

  // /commit - Apply pending edit and commit to GitHub
  bot.command('commit', async (ctx) => {
    const commitMsg = ctx.message?.text?.replace('/commit', '').trim();
    
    const pending = getFileEditState(ctx.from?.id || 0);
    
    if (!pending || pending.action !== 'ready_to_commit') {
      await ctx.reply(`❌ No pending changes to commit.

First use /editfile to prepare changes, then describe what to change.`);
      return;
    }
    
    const message = commitMsg || `CTO AIPA: Update ${pending.path}`;
    
    await ctx.reply(`📤 Committing changes to ${pending.repo}/${pending.path}...`);
    
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner: 'ElenaRevicheva',
        repo: pending.repo,
        path: pending.path,
        message: message,
        content: Buffer.from(pending.newContent || '').toString('base64'),
        sha: pending.sha
      });
      
      clearFileEditState(ctx.from?.id || 0);
      
      await ctx.reply(`✅ *Committed successfully!*

📦 Repo: ${pending.repo}
📄 File: ${pending.path}
💬 Message: ${message}

Changes are now live on GitHub! 🎉`, { parse_mode: 'Markdown' });

      await saveAgentOutcome('cto_aipa', 'file_committed', {
        repo: pending.repo,
        file: pending.path,
        commit_message: message.substring(0, 200)
      }, 'verified_delivered').catch(() => {});

    } catch (error: any) {
      console.error('Commit error:', error);
      await ctx.reply(`❌ Commit failed: ${error.message}\n\nTry again or use /cancel to discard changes.`);
    }
  });

  // /cancel - Cancel pending edit
  bot.command('cancel', async (ctx) => {
    clearFileEditState(ctx.from?.id || 0);
    const ctx2 = getConversationContext(ctx.from?.id || 0);
    ctx2.pendingFixes = [];
    ctx2.batchEdits = [];
    await ctx.reply('🗑️ Pending changes and batch edits cancelled.');
  });

  // /apply - Apply the last suggested fix (Cursor-twin feature!)
  bot.command('apply', async (ctx) => {
    const convCtx = getConversationContext(ctx.from?.id || 0);
    
    if (convCtx.pendingFixes.length === 0) {
      await ctx.reply(`❌ No pending fixes to apply.

First ask me about an error or request a code change, then use /apply to apply my suggestion!

Example workflow:
1. You: "fix the menu crash in familybot"
2. Me: Here's the fix... [code]
3. You: /apply
4. Me: Applied! Commit with /commit`);
      return;
    }
    
    const lastFix = convCtx.pendingFixes[convCtx.pendingFixes.length - 1];
    
    if (!lastFix || !convCtx.activeRepo || !convCtx.activeFile) {
      await ctx.reply(`⚠️ I have a fix but don't know which file to apply it to.

Please specify:
\`/editfile ${convCtx.activeRepo || 'repo'} ${convCtx.activeFile || 'path/to/file'}\`

Then describe the change or paste the fix.`);
      return;
    }
    
    await ctx.reply(`⚡ Applying fix to ${convCtx.activeRepo}/${convCtx.activeFile}...`);
    
    try {
      // Fetch current file
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: convCtx.activeRepo,
        path: convCtx.activeFile
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Cannot apply to this path.');
        return;
      }
      
      const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      // Use AI to intelligently apply the fix
      const applyPrompt = `Apply this fix to the code:

CURRENT FILE (${convCtx.activeFile}):
\`\`\`
${currentContent}
\`\`\`

FIX TO APPLY:
Description: ${lastFix.description}
Code:
\`\`\`
${lastFix.code}
\`\`\`

Return ONLY the complete updated file content. No explanations, no markdown fences.
Apply the fix intelligently - find where it should go and integrate it properly.`;

      const newContent = await askAI(applyPrompt, 8000);
      const cleanContent = newContent.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
      
      // Store for commit
      saveFileEditState(ctx.from?.id || 0, {
        action: 'ready_to_commit',
        repo: convCtx.activeRepo,
        path: convCtx.activeFile,
        content: currentContent,
        sha: fileData.sha,
        newContent: cleanContent
      });
      
      // Clear the pending fix
      convCtx.pendingFixes.pop();
      
      // Show preview
      const preview = cleanContent.split('\n').slice(0, 25).map((l, i) => `${String(i+1).padStart(3)}| ${l}`).join('\n');
      
      await ctx.reply(`✅ *Fix Applied!*

Preview:
\`\`\`
${preview.substring(0, 2500)}
\`\`\`

Ready to commit? 
• \`/commit Applied fix: ${lastFix.description.substring(0, 30)}...\`
• \`/cancel\` to discard`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Could not apply fix: ${error.message}\n\nTry /editfile manually.`);
    }
  });

  // /batch - Multi-file batch editing (like Cursor multi-file)
  bot.command('batch', async (ctx) => {
    const input = ctx.message?.text?.replace('/batch', '').trim();
    const convCtx = getConversationContext(ctx.from?.id || 0);
    
    if (!input) {
      const batchCount = convCtx.batchEdits.length;
      await ctx.reply(`📦 *BATCH EDITS - Multi-File Changes*

Edit multiple files before committing - just like Cursor!

*Current batch:* ${batchCount} file(s)

*Commands:*
\`/batch add <repo> <file>\` - Add file to batch
\`/batch show\` - Show batch contents
\`/batch commit <message>\` - Commit all at once
\`/batch clear\` - Clear batch

*Workflow:*
1. /batch add cto src/file1.ts
2. [describe changes for file1]
3. /batch add cto src/file2.ts  
4. [describe changes for file2]
5. /batch commit "Refactored auth flow"

_Edit multiple files, commit once!_ 📦`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const action = parts[0]?.toLowerCase();
    
    if (action === 'show') {
      if (convCtx.batchEdits.length === 0) {
        await ctx.reply('📦 Batch is empty. Use `/batch add <repo> <file>` to start.');
        return;
      }
      const summary = convCtx.batchEdits.map((e, i) => 
        `${i + 1}. ${e.repo}/${e.path}`
      ).join('\n');
      await ctx.reply(`📦 *Batch Contents (${convCtx.batchEdits.length} files):*\n\n${summary}`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (action === 'clear') {
      convCtx.batchEdits = [];
      await ctx.reply('🗑️ Batch cleared.');
      return;
    }
    
    if (action === 'add') {
      const repoInput = parts[1] || '';
      const filePath = parts.slice(2).join(' ');
      
      const repoName = resolveRepoName(repoInput);
      if (!repoName) {
        await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
        return;
      }
      
      if (!filePath) {
        await ctx.reply('❌ Please specify a file path!');
        return;
      }
      
      await ctx.reply(`📄 Loading ${filePath} into batch...`);
      
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: filePath
        });
        
        if (Array.isArray(fileData) || !('content' in fileData)) {
          await ctx.reply('❌ Cannot batch directories.');
          return;
        }
        
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        
        convCtx.batchEdits.push({
          repo: repoName,
          path: filePath,
          content,
          sha: fileData.sha
        });
        
        // Also add to conversation context
        addFileToContext(ctx.from?.id || 0, repoName, filePath, content);
        
        await ctx.reply(`✅ Added to batch: ${repoName}/${filePath}

*Batch now has ${convCtx.batchEdits.length} file(s)*

Now describe what to change in this file, or add more files with /batch add`, { parse_mode: 'Markdown' });
        
      } catch (error: any) {
        await ctx.reply(`❌ Could not load file: ${error.message}`);
      }
      return;
    }
    
    if (action === 'commit') {
      const message = parts.slice(1).join(' ') || 'Batch update from CTO AIPA';
      
      if (convCtx.batchEdits.length === 0) {
        await ctx.reply('❌ Batch is empty. Add files first with `/batch add`');
        return;
      }
      
      await ctx.reply(`📤 Committing ${convCtx.batchEdits.length} files...`);
      
      let successCount = 0;
      const errors: string[] = [];
      
      for (const edit of convCtx.batchEdits) {
        try {
          await octokit.repos.createOrUpdateFileContents({
            owner: 'ElenaRevicheva',
            repo: edit.repo,
            path: edit.path,
            message: `${message} - ${edit.path}`,
            content: Buffer.from(edit.content).toString('base64'),
            sha: edit.sha
          });
          successCount++;
        } catch (error: any) {
          errors.push(`${edit.path}: ${error.message}`);
        }
      }
      
      convCtx.batchEdits = [];
      
      if (errors.length > 0) {
        await ctx.reply(`⚠️ Batch partially committed: ${successCount} succeeded, ${errors.length} failed\n\nErrors:\n${errors.join('\n')}`);
      } else {
        await ctx.reply(`✅ *Batch Committed!*\n\n${successCount} files updated\nMessage: "${message}"`, { parse_mode: 'Markdown' });
      }
      return;
    }
    
    await ctx.reply('❓ Unknown batch command. Use: add, show, commit, or clear');
  });

  // /context - Show current session context (Cursor-twin feature)
  bot.command('context', async (ctx) => {
    const convCtx = getConversationContext(ctx.from?.id || 0);
    const summary = getContextSummary(ctx.from?.id || 0);
    
    if (!summary && convCtx.recentFiles.length === 0 && convCtx.recentQuestions.length === 0) {
      await ctx.reply(`📋 *Session Context*

No context yet! Start by:
• Reading a file: \`/readfile cto src/telegram-bot.ts\`
• Asking a question
• Loading multiple files: \`/multifile\`

I'll remember what we're working on! 🧠`, { parse_mode: 'Markdown' });
      return;
    }
    
    let response = `📋 *Session Context (I Remember!)*\n\n`;
    response += summary;
    
    if (convCtx.pendingFixes.length > 0) {
      response += `\n💡 *Pending Fixes:* ${convCtx.pendingFixes.length}\nUse /apply to apply the last one!\n`;
    }
    
    if (convCtx.batchEdits.length > 0) {
      response += `\n📦 *Batch:* ${convCtx.batchEdits.length} files\nUse /batch show to see them\n`;
    }
    
    response += `\n_Context persists to DB and survives restarts (7-day retention)_`;
    
    await ctx.reply(response, { parse_mode: 'Markdown' });
  });

  // /createfile - Create a new file
  bot.command('createfile', async (ctx) => {
    const input = ctx.message?.text?.replace('/createfile', '').trim();
    
    if (!input) {
      await ctx.reply(`📝 *CREATE FILE - Add New Files*

Create new files in any repo:

\`/createfile cto src/utils/helper.ts\`

Then send me the file content, and I'll create it!

_Like touch + edit in one!_ 📄`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoInput = parts[0] || '';
    const filePath = parts.slice(1).join(' ');
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!');
      return;
    }
    
    // Check if file exists
    try {
      await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      await ctx.reply(`❌ File already exists! Use /editfile to modify it.`);
      return;
    } catch (error: any) {
      if (error.status !== 404) {
        await ctx.reply('❌ Error checking file.');
        return;
      }
    }
    
    // Store pending create
    saveFileEditState(ctx.from?.id || 0, {
      action: 'create',
      repo: repoName,
      path: filePath,
      content: '',
      sha: ''
    });
    
    await ctx.reply(`📝 *Ready to create: ${repoName}/${filePath}*

Now send me the file content!

You can:
• Paste code directly
• Or describe what the file should contain and I'll generate it

When ready, use /commit to save.`, { parse_mode: 'Markdown' });
  });

  // /run - Trigger GitHub Action (compile/test)
  bot.command('run', async (ctx) => {
    const input = ctx.message?.text?.replace('/run', '').trim();
    
    if (!input) {
      await ctx.reply(`▶️ *RUN - Trigger GitHub Actions*

Run workflows in your repos:

\`/run cto build\` - Run build workflow
\`/run espaluz test\` - Run tests
\`/run cto deploy\` - Trigger deploy

Requires GitHub Actions workflows in the repo.

_Like npm run but remote!_ 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(' ');
    const repoInput = parts[0] || '';
    const workflow = parts[1] || 'build';
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    await ctx.reply(`▶️ Triggering ${workflow} workflow in ${repoName}...`);
    
    try {
      // List workflows to find the right one
      const { data: workflows } = await octokit.actions.listRepoWorkflows({
        owner: 'ElenaRevicheva',
        repo: repoName
      });
      
      const targetWorkflow = workflows.workflows.find(w => 
        w.name.toLowerCase().includes(workflow.toLowerCase()) ||
        w.path.toLowerCase().includes(workflow.toLowerCase())
      );
      
      if (!targetWorkflow) {
        const available = workflows.workflows.map(w => w.name).join(', ');
        await ctx.reply(`❌ Workflow "${workflow}" not found.\n\nAvailable: ${available || 'None'}`);
        return;
      }
      
      await octokit.actions.createWorkflowDispatch({
        owner: 'ElenaRevicheva',
        repo: repoName,
        workflow_id: targetWorkflow.id,
        ref: 'main'
      });
      
      await ctx.reply(`✅ *Workflow triggered!*

📦 Repo: ${repoName}
▶️ Workflow: ${targetWorkflow.name}
🔗 Check: https://github.com/ElenaRevicheva/${repoName}/actions

_Results in a few minutes..._`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Run workflow error:', error);
      if (error.message?.includes('Workflow does not have')) {
        await ctx.reply(`❌ This workflow doesn't support manual triggers.\n\nIt needs \`workflow_dispatch\` in the YAML.`);
      } else {
        await ctx.reply(`❌ Error triggering workflow: ${error.message}`);
      }
    }
  });

  // =============================================================================
  // CURSOR-LEVEL POWER FEATURES - Maximum Co-Founder Capabilities
  // =============================================================================

  // /fixerror - Paste an error, get a fix (like Cursor's error fixing)
  bot.command('fixerror', async (ctx) => {
    const error = ctx.message?.text?.replace('/fixerror', '').trim();
    
    if (!error) {
      await ctx.reply(`🔧 *FIX ERROR - Paste Any Error!*

Just paste your error message and I'll analyze it:

\`/fixerror TypeError: Cannot read property 'map' of undefined at line 45\`

Or just type:
\`/fixerror\` then paste the full error in the next message!

_Like Cursor's error fixing, but remote!_ 🎯`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🔍 Analyzing error...');
    
    try {
      const fixPrompt = `${AIDEAZZ_CONTEXT}

You are debugging an error. Analyze this error and provide:
1. What caused it (1-2 sentences)
2. The exact fix (code if applicable)
3. How to prevent it in the future

ERROR:
${error}

Be concise - this is Telegram chat. Use code blocks for any code.`;

      const fix = await askAI(fixPrompt, 2000);
      await ctx.reply(`🔧 *Error Analysis*\n\n${fix}`, { parse_mode: 'Markdown' });
      
    } catch (err) {
      await ctx.reply('❌ Error analyzing. Try pasting a cleaner error message.');
    }
  });

  // /multifile - Work with multiple files at once
  bot.command('multifile', async (ctx) => {
    const input = ctx.message?.text?.replace('/multifile', '').trim();
    
    if (!input) {
      await ctx.reply(`📂 *MULTIFILE - Bulk Operations*

Work with multiple files at once:

\`/multifile cto src/telegram-bot.ts src/database.ts\`
→ Load both files into context

\`/multifile familybot main.py espaluz_menu.py\`
→ Work across Python files

Then ask me anything about them, or request changes!

_Like Cursor's multi-file context!_ 🎯`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const repoInput = parts[0] || '';
    const filePaths = parts.slice(1);
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (filePaths.length === 0) {
      await ctx.reply('❌ Please specify at least one file path!');
      return;
    }
    
    await ctx.reply(`📂 Loading ${filePaths.length} files from ${repoName}...`);
    
    try {
      const fileContents: { path: string; content: string }[] = [];
      
      for (const filePath of filePaths.slice(0, 5)) { // Max 5 files
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner: 'ElenaRevicheva',
            repo: repoName,
            path: filePath
          });
          
          if (!Array.isArray(fileData) && 'content' in fileData) {
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            fileContents.push({ path: filePath, content });
          }
        } catch {
          await ctx.reply(`⚠️ Couldn't load: ${filePath}`);
        }
      }
      
      if (fileContents.length === 0) {
        await ctx.reply('❌ No files could be loaded. Check the paths!');
        return;
      }
      
      // Store in memory for context
      const contextKey = `multifile_${ctx.from?.id}`;
      await saveMemory('CTO', contextKey, { repo: repoName, files: filePaths }, 
        fileContents.map(f => `=== ${f.path} ===\n${f.content.substring(0, 3000)}`).join('\n\n'),
        { type: 'multifile_context' }
      );
      
      // Show summary
      const summary = fileContents.map(f => {
        const lines = f.content.split('\n').length;
        return `📄 ${f.path} (${lines} lines)`;
      }).join('\n');
      
      await ctx.reply(`✅ *${fileContents.length} files loaded!*

${summary}

Now ask me anything about these files! Examples:
• "How do these files work together?"
• "Find bugs in this code"
• "Refactor the error handling"
• "What functions are duplicated?"

_Context active for your next questions!_`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Error loading files: ${error.message}`);
    }
  });

  // /refactor - Suggest code improvements
  bot.command('refactor', async (ctx) => {
    const input = ctx.message?.text?.replace('/refactor', '').trim();
    
    if (!input) {
      await ctx.reply(`♻️ *REFACTOR - Code Improvements*

Get refactoring suggestions:

\`/refactor cto src/telegram-bot.ts\`
→ Analyze entire file

\`/refactor familybot main.py handleMenu\`
→ Focus on specific function

I'll suggest:
• Code smells to fix
• Performance improvements
• Better patterns
• Cleaner structure

_Like Cursor's refactoring suggestions!_ 🎯`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const repoInput = parts[0] || '';
    const filePath = parts[1] || '';
    const focus = parts.slice(2).join(' ');
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!');
      return;
    }
    
    await ctx.reply(`♻️ Analyzing ${filePath} for refactoring opportunities...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Cannot analyze directories.');
        return;
      }
      
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      const refactorPrompt = `${AIDEAZZ_CONTEXT}

Analyze this code for refactoring opportunities:

FILE: ${filePath}
${focus ? `FOCUS ON: ${focus}` : ''}

\`\`\`
${content.substring(0, 8000)}
\`\`\`

Provide 3-5 SPECIFIC refactoring suggestions:
1. What: Specific issue
2. Why: Why it's a problem
3. How: Exact code change (short snippet)

Be practical - focus on high-impact improvements, not nitpicks.
Format for Telegram (markdown, code blocks).`;

      const suggestions = await askAI(refactorPrompt, 3000);
      
      // Split if too long
      if (suggestions.length > 4000) {
        const parts = suggestions.split(/(?=\d+\.\s)/);
        for (const part of parts.filter(p => p.trim())) {
          await ctx.reply(part.trim(), { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(`♻️ *Refactoring Suggestions*\n\n${suggestions}`, { parse_mode: 'Markdown' });
      }
      
    } catch (error: any) {
      await ctx.reply(`❌ Error analyzing: ${error.message}`);
    }
  });

  // /gentest - Generate tests for code
  bot.command('gentest', async (ctx) => {
    const input = ctx.message?.text?.replace('/gentest', '').trim();
    
    if (!input) {
      await ctx.reply(`🧪 *GENTEST - Generate Tests*

Create tests for your code:

\`/gentest cto src/database.ts\`
→ Generate tests for entire file

\`/gentest familybot main.py handle_menu\`
→ Tests for specific function

I'll generate:
• Unit tests
• Edge cases
• Mock setups
• Test descriptions

_Like Cursor's test generation!_ 🧪`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const repoInput = parts[0] || '';
    const filePath = parts[1] || '';
    const functionName = parts.slice(2).join(' ');
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!');
      return;
    }
    
    await ctx.reply(`🧪 Generating tests for ${filePath}...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Cannot generate tests for directories.');
        return;
      }
      
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const isPython = filePath.endsWith('.py');
      
      const testPrompt = `${AIDEAZZ_CONTEXT}

Generate comprehensive tests for this ${isPython ? 'Python' : 'TypeScript'} code:

FILE: ${filePath}
${functionName ? `FOCUS ON: ${functionName}` : ''}

\`\`\`${isPython ? 'python' : 'typescript'}
${content.substring(0, 6000)}
\`\`\`

Generate ${isPython ? 'pytest' : 'Jest'} tests that include:
1. Happy path tests
2. Edge cases
3. Error handling
4. Mocks for external dependencies

Return ONLY the test code, ready to use.`;

      const tests = await askAI(testPrompt, 4000);
      
      // Split for Telegram
      if (tests.length > 4000) {
        await ctx.reply(`🧪 *Generated Tests (Part 1)*\n\n${tests.substring(0, 3800)}...`, { parse_mode: 'Markdown' });
        await ctx.reply(`🧪 *...Continued*\n\n${tests.substring(3800)}`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`🧪 *Generated Tests*\n\n${tests}`, { parse_mode: 'Markdown' });
      }
      
      await ctx.reply(`💡 *Next steps:*
• Copy tests to your test file
• \`/createfile ${repoInput} tests/${filePath.replace(/\.[^.]+$/, '.test' + (isPython ? '.py' : '.ts'))}\`
• Then paste the tests!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Error generating tests: ${error.message}`);
    }
  });

  // /explaincode - Deep code explanation (like Cursor's explain)
  bot.command('explaincode', async (ctx) => {
    const input = ctx.message?.text?.replace('/explaincode', '').trim();
    
    if (!input) {
      await ctx.reply(`📖 *EXPLAIN CODE - Deep Analysis*

Understand any code in detail:

\`/explaincode cto src/telegram-bot.ts 100-200\`
→ Explain lines 100-200

\`/explaincode familybot main.py handle_voice\`
→ Explain specific function

I'll explain:
• What it does (plain English)
• How it works (step by step)
• Key patterns used
• Potential issues

_Like talking to a senior dev!_ 📖`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const repoInput = parts[0] || '';
    const filePath = parts[1] || '';
    const focus = parts.slice(2).join(' ');
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    if (!filePath) {
      await ctx.reply('❌ Please specify a file path!');
      return;
    }
    
    await ctx.reply(`📖 Analyzing ${filePath}...`);
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filePath
      });
      
      if (Array.isArray(fileData) || !('content' in fileData)) {
        await ctx.reply('❌ Cannot explain directories.');
        return;
      }
      
      let content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      // Handle line range
      const lineMatch = focus.match(/^(\d+)-(\d+)$/);
      if (lineMatch && lineMatch[1] && lineMatch[2]) {
        const start = parseInt(lineMatch[1]) - 1;
        const end = parseInt(lineMatch[2]);
        const lines = content.split('\n');
        content = lines.slice(start, end).join('\n');
      }
      
      const explainPrompt = `${AIDEAZZ_CONTEXT}

Explain this code like you're teaching a junior developer:

FILE: ${filePath}
${focus && !lineMatch ? `FOCUS ON: ${focus}` : ''}

\`\`\`
${content.substring(0, 6000)}
\`\`\`

Explain:
1. **Overview**: What does this code do? (2-3 sentences, plain English)
2. **How it works**: Step-by-step flow (numbered list)
3. **Key patterns**: What design patterns or techniques are used?
4. **Watch out**: Any tricky parts or potential issues?

Keep it conversational - this is for learning!`;

      const explanation = await askAI(explainPrompt, 3000);
      
      if (explanation.length > 4000) {
        const parts = explanation.split(/(?=\*\*)/);
        for (const part of parts.filter(p => p.trim())) {
          await ctx.reply(part.trim(), { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(`📖 *Code Explanation*\n\n${explanation}`, { parse_mode: 'Markdown' });
      }
      
    } catch (error: any) {
      await ctx.reply(`❌ Error explaining: ${error.message}`);
    }
  });

  // /quickfix - One-line fix suggestions (like Cursor's quick fix)
  bot.command('quickfix', async (ctx) => {
    const input = ctx.message?.text?.replace('/quickfix', '').trim();
    
    if (!input) {
      await ctx.reply(`⚡ *QUICK FIX - Fast Code Fixes*

Describe a problem, get a one-liner fix:

\`/quickfix cto how to handle null in telegram-bot.ts line 450\`

\`/quickfix familybot the menu command crashes on long text\`

I'll give you:
• The exact line to change
• The fix code
• Copy-paste ready!

_Lightning fast fixes!_ ⚡`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Check if first word is a repo
    const parts = input.split(' ');
    const firstWord = parts[0] || '';
    const resolvedRepo = resolveRepoName(firstWord);
    
    let repoContext = '';
    if (resolvedRepo) {
      // Try to get repo context
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: resolvedRepo,
          path: ''
        });
        if (Array.isArray(contents)) {
          repoContext = `\nRepo ${resolvedRepo} files: ${contents.slice(0, 10).map((f: any) => f.name).join(', ')}`;
        }
      } catch {}
    }
    
    await ctx.reply('⚡ Finding quick fix...');
    
    try {
      const quickfixPrompt = `${AIDEAZZ_CONTEXT}
${repoContext}

Give a QUICK, SPECIFIC fix for this problem:
${input}

Response format:
📍 **Location**: [file and line if known]
🔧 **Fix**: 
\`\`\`
[exact code to use]
\`\`\`
💡 **Why**: [one sentence explanation]

Be SPECIFIC. Give exact code, not general advice.`;

      const fix = await askAI(quickfixPrompt, 1500);
      await ctx.reply(`⚡ *Quick Fix*\n\n${fix}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  });

  // /diff - Show changes between versions or compare files
  bot.command('diff', async (ctx) => {
    const input = ctx.message?.text?.replace('/diff', '').trim();
    
    if (!input) {
      await ctx.reply(`📊 *DIFF - Compare Code*

See what changed in recent commits:

\`/diff cto\`
→ Show latest commit changes

\`/diff familybot 3\`
→ Last 3 commits summary

\`/diff espaluz main.py\`
→ Recent changes to specific file

_Like git diff, but readable!_ 📊`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = input.split(/\s+/);
    const repoInput = parts[0] || '';
    const extra = parts[1] || '';
    
    const repoName = resolveRepoName(repoInput);
    if (!repoName) {
      await ctx.reply(`❌ Unknown repo: "${repoInput}"`);
      return;
    }
    
    await ctx.reply(`📊 Fetching changes from ${repoName}...`);
    
    try {
      const numCommits = parseInt(extra) || 1;
      const isFile = extra.includes('.') || extra.includes('/');
      
      // Get recent commits
      const listCommitsOptions: Parameters<typeof octokit.repos.listCommits>[0] = {
        owner: 'ElenaRevicheva',
        repo: repoName,
        per_page: isFile ? 5 : Math.min(numCommits, 5)
      };
      if (isFile) {
        listCommitsOptions.path = extra;
      }
      const { data: commits } = await octokit.repos.listCommits(listCommitsOptions);
      
      if (commits.length === 0) {
        await ctx.reply('No commits found.');
        return;
      }
      
      let diffSummary = '';
      
      for (const commit of commits.slice(0, Math.min(numCommits, 3))) {
        // Get commit details
        const { data: commitDetail } = await octokit.repos.getCommit({
          owner: 'ElenaRevicheva',
          repo: repoName,
          ref: commit.sha
        });
        
        const files = commitDetail.files || [];
        const additions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
        const deletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
        
        diffSummary += `\n📝 *${escapeMarkdown(commit.commit.message.split('\n')[0] || 'No message')}*
📅 ${new Date(commit.commit.author?.date || '').toLocaleDateString()}
✏️ ${files.length} files: +${additions} -${deletions}
${files.slice(0, 5).map(f => `   ${f.status === 'added' ? '🆕' : f.status === 'removed' ? '🗑️' : '📄'} ${escapeMarkdown(f.filename || '')}`).join('\n')}
`;
      }
      
      await ctx.reply(`📊 *Recent Changes in ${escapeMarkdown(repoName)}*\n${diffSummary}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Error fetching diff: ${error.message}`);
    }
  });

  // Handle natural text after /editfile or /createfile
  bot.on('message:text', async (ctx, next) => {
    const message = ctx.message?.text;
    
    // Pass commands to their specific handlers
    if (message?.startsWith('/')) return next();
    
    // Check for pending file operations
    const pending = getFileEditState(ctx.from?.id || 0);
    
    if (pending && (pending.action === 'edit' || pending.action === 'create')) {
      // User is providing edit instructions or new file content
      await ctx.reply('🤖 Processing your changes...');
      
      try {
        let newContent: string;
        
        if (pending.action === 'create') {
          // For create, check if it looks like code or instructions
          if (message?.includes('function') || message?.includes('const ') || message?.includes('import ') || message?.includes('class ')) {
            // Looks like code, use directly
            newContent = message || '';
          } else {
            // Generate code based on description
            const generatePrompt = `Generate the content for a new file: ${pending.path}

User's description: ${message}

Return ONLY the file content, no explanations. Make it production-ready.`;
            
            newContent = await askAI(generatePrompt, 3000);
          }
        } else {
          // For edit, apply the requested changes
          const editPrompt = `You are editing a file. Apply the user's requested changes.

CURRENT FILE (${pending.path}):
\`\`\`
${pending.content}
\`\`\`

USER'S REQUESTED CHANGES:
${message}

Return ONLY the complete new file content with the changes applied. No explanations, no markdown code fences.`;
          
          newContent = await askAI(editPrompt, 8000);
          
          // Clean up if AI added code fences
          newContent = newContent.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
        }
        
        // Store the new content ready for commit
        saveFileEditState(ctx.from?.id || 0, {
          ...pending,
          action: 'ready_to_commit',
          newContent: newContent
        });
        
        // Show diff preview
        const preview = newContent.split('\n').slice(0, 30).map((l, i) => `${String(i+1).padStart(3)} | ${l}`).join('\n');
        
        await ctx.reply(`✅ *Changes prepared!*

Preview of new content:
\`\`\`
${preview.substring(0, 2000)}
\`\`\`
${newContent.split('\n').length > 30 ? `\n... (${newContent.split('\n').length - 30} more lines)` : ''}

Ready to commit? Use:
• \`/commit Your commit message\`
• \`/cancel\` to discard

⚠️ This will update the file on GitHub!`, { parse_mode: 'Markdown' });
        
      } catch (error: any) {
        console.error('Edit processing error:', error);
        await ctx.reply('❌ Error processing changes. Try again with clearer instructions.');
      }
      
      return;
    }
    
    // Register for alerts when user chats
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    
    // Run intent detection for text messages too (same as voice pipeline)
    const textIntent = await detectPersonalAIIntent(message || '');
    if (textIntent.type !== 'question' && textIntent.type !== 'conversation' && textIntent.type !== 'command') {
      const handled = await handlePersonalAIAction(ctx, message || '', textIntent, 'text');
      if (handled) {
        const userId = ctx.from?.id || 0;
        syncContextToDb(userId);
        return;
      }
    }
    
    await handleQuestion(ctx, message || '');
  });
  
  // ==========================================================================
  // VOICE MESSAGES - Talk naturally to your CTO!
  // ==========================================================================
  
  bot.on('message:voice', async (ctx) => {
    await ctx.reply('🎤 Processing your voice message...');
    
    // Register for alerts
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    
    try {
      // Get voice file from Telegram
      const voice = ctx.message?.voice;
      if (!voice) {
        await ctx.reply('❌ Could not access voice message.');
        return;
      }
      
      const file = await ctx.api.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      // Download voice file
      const tempFile = `/tmp/voice_${Date.now()}.ogg`;
      await downloadFile(fileUrl, tempFile);
      
      // Transcribe with Groq Whisper
      const transcription = await transcribeAudio(tempFile);
      
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch {}
      
      if (!transcription) {
        await ctx.reply('❌ Could not transcribe voice message. Try again or type your message.');
        return;
      }
      
      // Show what was heard
      await ctx.reply(`🎤 I heard: "${transcription.substring(0, 200)}${transcription.length > 200 ? '...' : ''}"`);

      // SPECIAL CASE: Job-search / VibeJob Hunter intents from voice
      // Must run BEFORE Trello NLP so these specific commands reach their handler.
      const lower = transcription.toLowerCase();
      if (
        lower.includes('vibejobhunter') ||
        lower.includes('vibe job hunter') ||
        lower.includes('job matcher') ||
        lower.includes('job matching') ||
        lower.includes('job search') ||
        lower.includes('improve my job') ||
        lower.includes('job engine')
      ) {
        await handleJobSearchVoiceIntent(ctx, transcription);
        const userId = ctx.from?.id || 0;
        recentJobSearchVoice.set(userId, Date.now());
        // We deliberately STOP here: no automatic file/path guessing or edits.
        // Any concrete code work will be done later in Cursor with your confirmation.
        return;
      }

      // ── Trello Voice Card Creator ──────────────────────────────────────────
      // ── Multi-action pre-check (move / archive / mixed commands) ──────────
      // If the transcript contains management vocabulary, ask Claude Haiku to
      // decompose it into typed actions (create / move / archive) and execute
      // all of them.  Falls through when the LLM says it is a pure task.
      {
        const uid = ctx.from?.id || 0;
        const session = lastTrelloSession.get(uid);
        const recentCards = (session && Date.now() - session.ts <= TRELLO_SESSION_TTL_MS)
          ? session.cards : [];

        const multiResult = await processMultiAction(transcription, recentCards);
        if (multiResult.handled) {
          // Keep session updated with any newly created cards
          const newlyCreated = multiResult.results
            .filter(r => r.type === 'create' && r.success)
            .flatMap(r => r.cards ?? []);
          if (newlyCreated.length > 0) {
            lastTrelloSession.set(uid, { cards: newlyCreated, listTarget: 'todo_flow', ts: Date.now() });
          }
          await ctx.reply(formatMultiActionReply(multiResult.results), { parse_mode: 'Markdown' });
          // Save voice note to knowledge_base so Sprinter morning briefing picks it up
          {
            const voiceUserId = ctx.from?.id || 0;
            const cardTitles = multiResult.results
              .filter(r => r.type === 'create' && r.success)
              .flatMap(r => (r.cards ?? []).map((c: { name?: string }) => c.name || ''))
              .filter(Boolean);
            const noteTitle = transcription.substring(0, 100);
            const noteContent = cardTitles.length
              ? ('Voice: ' + transcription + (cardTitles.length ? '\n\nTrello cards created:\n' + cardTitles.map(t => '- ' + t).join('\n') : ''))
              : ('Voice: ' + transcription);
            saveKnowledge(voiceUserId, 'voice_note', noteTitle, noteContent, 'voice,trello', undefined, 'voice').catch(() => {});
          }
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // NLP classifies every voice message — no trigger phrase required.
      // If the message is an actionable task, a Trello card is created and
      // we return. If not a task (question, command, chat), we fall through.
      const trelloResult = await createTrelloCardFromTranscript(transcription);
      if (trelloResult.success) {
        // Store session for "those cards" references in follow-up commands
        const uid = ctx.from?.id || 0;
        const createdCards = trelloResult.cards ?? (trelloResult.card ? [trelloResult.card] : []);
        if (createdCards.length > 0) {
          lastTrelloSession.set(uid, {
            cards: createdCards,
            listTarget: trelloResult.classification?.listTarget ?? 'todo_flow',
            ts: Date.now(),
          });
        }
        await ctx.reply(formatVoiceTrelloReply(trelloResult), { parse_mode: 'Markdown' });
        // Save voice note to knowledge_base so Sprinter morning briefing picks it up
        {
          const voiceUserId2 = ctx.from?.id || 0;
          const createdCards2 = trelloResult.cards ?? (trelloResult.card ? [trelloResult.card] : []);
          const cardTitles2 = createdCards2.map((c: { name?: string }) => c.name || '').filter(Boolean);
          const noteTitle2 = transcription.substring(0, 100);
          const noteContent2 = 'Voice: ' + transcription + (cardTitles2.length ? '\n\nTrello cards created:\n' + cardTitles2.map((t: string) => '- ' + t).join('\n') : '');
          saveKnowledge(voiceUserId2, 'voice_note', noteTitle2, noteContent2, 'voice,trello', undefined, 'voice').catch(() => {});
        }
        return;
      }
      // ──────────────────────────────────────────────────────────────────────
      
      // PERSONAL AI UPGRADE: Detect intent from voice message
      const intent = await detectPersonalAIIntent(transcription);
      
      // Try to handle as Personal AI action first (idea, diary, task, research)
      if (intent.type !== 'question' && intent.type !== 'conversation' && intent.type !== 'command') {
        const handled = await handlePersonalAIAction(ctx, transcription, intent, 'voice');
        if (handled) {
          // Sync context to DB
          const userId = ctx.from?.id || 0;
          syncContextToDb(userId);
          return;
        }
      }
      
      // Fall through to normal question handling
      await handleQuestion(ctx, transcription);
      
      // Sync context to DB after conversation
      const userId = ctx.from?.id || 0;
      syncContextToDb(userId);
      
    } catch (error) {
      console.error('Voice message error:', error);
      await ctx.reply('❌ Error processing voice message. Please try typing instead.');
    }
  });
  
  // ==========================================================================
  // PHOTO/SCREENSHOT ANALYSIS - Send images for AI analysis!
  // ==========================================================================
  
  bot.on('message:photo', async (ctx) => {
    await ctx.reply('📸 Analyzing your image...');
    
    // Register for alerts
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    
    try {
      // Get the largest photo (last in array)
      const photos = ctx.message?.photo;
      if (!photos || photos.length === 0) {
        await ctx.reply('❌ Could not access photo.');
        return;
      }
      
      const largestPhoto = photos[photos.length - 1];
      if (!largestPhoto) {
        await ctx.reply('❌ Could not access photo.');
        return;
      }
      const file = await ctx.api.getFile(largestPhoto.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      // Download photo to temp file
      const tempFile = `/tmp/photo_${Date.now()}.jpg`;
      await downloadFile(fileUrl, tempFile);
      
      // Read and convert to base64
      const imageBuffer = fs.readFileSync(tempFile);
      const base64Image = imageBuffer.toString('base64');
      
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch {}
      
      // Get caption if provided
      const caption = ctx.message?.caption || '';
      
      // Analyze with Claude Vision
      const analysisPrompt = caption 
        ? `Elena sent this image with the message: "${caption}". Analyze it and respond to her question/request.`
        : `Elena sent this image. Analyze what you see and provide helpful feedback. If it's:
- An error/bug screenshot: Identify the issue and suggest a fix
- UI/design: Give feedback on UX and suggest improvements
- Architecture diagram: Review and suggest optimizations
- Code snippet: Review the code
- Anything else: Describe what you see and how it relates to AIdeazz

Keep response concise for Telegram. Use emojis.`;

      let analysis: string;
      
      try {
        // Try Claude Vision (requires credits)
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: `${AIDEAZZ_CONTEXT}\n\n${analysisPrompt}`
              }
            ]
          }]
        });
        
        const firstContent = response.content[0];
        analysis = firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not analyze image.';
      } catch (visionError: any) {
        // If Claude credits exhausted, ask user to describe instead
        const errorMsg = visionError?.error?.error?.message || '';
        if (errorMsg.includes('credit') || errorMsg.includes('billing')) {
          await ctx.reply('⚠️ Image analysis temporarily unavailable (API credits). Please describe what you see in the image and I\'ll help!\n\nExample: "I see an error message saying TypeError in my code"');
          return;
        }
        throw visionError;
      }
      
      // Save to memory
      await saveMemory('CTO', 'image_analysis', { 
        caption,
        has_image: true 
      }, analysis, {
        platform: 'telegram',
        type: 'image_analysis',
        timestamp: new Date().toISOString()
      });
      
      // Send analysis (without Markdown to avoid parsing issues)
      const responseMessage = `📸 Image Analysis\n\n${analysis}`;
      
      if (responseMessage.length > 4000) {
        const parts = responseMessage.match(/.{1,4000}/g) || [];
        for (const part of parts) {
          await ctx.reply(part);
        }
      } else {
        await ctx.reply(responseMessage);
      }
      
    } catch (error) {
      console.error('Photo analysis error:', error);
      await ctx.reply('❌ Error analyzing image. Try again or describe what you see!');
    }
  });
  
  // ==========================================================================
  // HELPER: Handle questions with AI
  // ==========================================================================
  
  async function handleQuestion(ctx: Context, question: string) {
    if (!question.trim()) {
      await ctx.reply('❓ Please ask me something!');
      return;
    }
    
    const lowerQ = question.toLowerCase();

    // If a JOB_SEARCH voice intent was detected very recently, avoid auto-mapping
    // natural language into /readfile or /editfile. Keep answers high-level.
    const userId = ctx.from?.id || 0;
    const lastJobVoice = recentJobSearchVoice.get(userId);
    const withinJobVoiceWindow = lastJobVoice && (Date.now() - lastJobVoice < 5 * 60 * 1000); // 5 minutes
    if (withinJobVoiceWindow) {
      await ctx.reply(
`🧠 I’m keeping this in JOB_SEARCH planning mode.

I won’t guess file paths or run /readfile or /editfile from this question.
Use this time to clarify what you want to improve, and we’ll do the concrete code edits together later in Cursor.`,
      );
      // Do NOT fall through to the auto-command detection below.
      return;
    }
    
    // ==========================================================================
    // CURSOR-LIKE INTENT DETECTION - Understand natural language requests
    // ==========================================================================
    
    // Detect: "show me the code in...", "read file...", "what's in..."
    const readFilePatterns = [
      /(?:show|read|open|see|view|look at|what'?s in|check)\s+(?:the\s+)?(?:file|code)?\s*(?:in\s+)?([a-z]+)[\s\/]+(.+)/i,
      /(?:show|read|open)\s+([a-z]+)[\s\/]+(.+)/i,
    ];
    
    for (const pattern of readFilePatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const repo = match[1];
        const filePath = match[2].trim();
        if (resolveRepoName(repo)) {
          await ctx.reply(`📖 I'll read that file for you...`);
          // Simulate the /readfile command
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/readfile ${repo} ${filePath}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "edit the...", "change...", "modify...", "update..."
    const editFilePatterns = [
      /(?:edit|change|modify|update|fix)\s+(?:the\s+)?(?:file\s+)?([a-z]+)[\s\/]+(.+)/i,
    ];
    
    for (const pattern of editFilePatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const repo = match[1];
        const filePath = match[2].trim().split(/\s+/)[0]; // Get just the path
        if (resolveRepoName(repo)) {
          await ctx.reply(`✏️ Opening that file for editing...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/editfile ${repo} ${filePath}` } };
          // @ts-ignore  
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "search for...", "find...", "where is...", "grep..."
    const searchPatterns = [
      /(?:search|find|grep|look for|where is|where's)\s+(?:for\s+)?['"]?([^'"]+)['"]?(?:\s+in\s+([a-z]+))?/i,
    ];
    
    for (const pattern of searchPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[1].length > 2) {
        const searchTerm = match[1].trim();
        const repo = match[2];
        // Only auto-search if it looks like code search (not general questions)
        if (searchTerm.includes('function') || searchTerm.includes('const ') || 
            searchTerm.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) || searchTerm.includes('(')) {
          await ctx.reply(`🔍 Searching for "${searchTerm}"...`);
          const searchCmd = repo ? `/search ${repo} ${searchTerm}` : `/search ${searchTerm}`;
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: searchCmd } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "create file...", "make a new file...", "add file..."
    const createPatterns = [
      /(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?file\s+([a-z]+)[\s\/]+(.+)/i,
    ];
    
    for (const pattern of createPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const repo = match[1];
        const filePath = match[2].trim();
        if (resolveRepoName(repo)) {
          await ctx.reply(`📝 Creating new file...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/createfile ${repo} ${filePath}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "list files in...", "show directory...", "what files..."
    const treePatterns = [
      /(?:list|show|what)\s+(?:files?|directory|folder|structure)\s+(?:in\s+)?([a-z]+)(?:[\s\/]+(.+))?/i,
    ];
    
    for (const pattern of treePatterns) {
      const match = question.match(pattern);
      if (match && match[1]) {
        const repo = match[1];
        const dir = match[2] || '';
        if (resolveRepoName(repo)) {
          await ctx.reply(`🌳 Listing directory...`);
          const treeCmd = dir ? `/tree ${repo} ${dir}` : `/tree ${repo}`;
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: treeCmd } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "run build...", "deploy...", "run tests..."
    const runPatterns = [
      /(?:run|trigger|start|execute)\s+(?:the\s+)?(\w+)\s+(?:on|in|for)\s+([a-z]+)/i,
      /deploy\s+([a-z]+)/i,
    ];
    
    for (const pattern of runPatterns) {
      const match = question.match(pattern);
      if (match && match[1]) {
        const workflow = match[1];
        const repo = match[2] || match[1];
        if (resolveRepoName(repo)) {
          await ctx.reply(`▶️ Triggering workflow...`);
          const runCmd = `/run ${repo} ${workflow !== repo ? workflow : 'build'}`;
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: runCmd } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "fix this error", "I got an error", "error:"
    const errorPatterns = [
      /(?:fix|got|have|seeing|this)\s+(?:an?\s+)?error/i,
      /error:?\s*(.+)/i,
      /traceback|exception|crash|bug|broken/i,
    ];
    
    for (const pattern of errorPatterns) {
      if (pattern.test(question) && question.length > 20) {
        await ctx.reply(`🔧 I can help fix that! Let me analyze...`);
        const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/fixerror ${question}` } };
        // @ts-ignore
        return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
      }
    }
    
    // Detect: "explain", "how does X work", "what does X do"
    const explainPatterns = [
      /(?:explain|how does|what does|understand)\s+(?:the\s+)?(?:code in\s+)?([a-z]+)[\s\/]+(.+)/i,
      /(?:explain|how does|what does)\s+(.+)\s+(?:in\s+)?([a-z]+)/i,
    ];
    
    for (const pattern of explainPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const possibleRepo = resolveRepoName(match[1]) || resolveRepoName(match[2]);
        const filePath = resolveRepoName(match[1]) ? match[2] : match[1];
        if (possibleRepo) {
          await ctx.reply(`📖 Let me explain that code...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/explaincode ${possibleRepo} ${filePath.trim()}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "refactor", "improve", "clean up"
    const refactorPatterns = [
      /(?:refactor|improve|clean up|optimize)\s+(?:the\s+)?(?:code in\s+)?([a-z]+)[\s\/]+(.+)/i,
    ];
    
    for (const pattern of refactorPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const possibleRepo = resolveRepoName(match[1]);
        if (possibleRepo) {
          await ctx.reply(`♻️ Analyzing for improvements...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/refactor ${possibleRepo} ${match[2].trim()}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "generate tests", "write tests", "test this"
    const testPatterns = [
      /(?:generate|write|create|make)\s+tests?\s+(?:for\s+)?([a-z]+)[\s\/]+(.+)/i,
      /test\s+(?:the\s+)?(?:code in\s+)?([a-z]+)[\s\/]+(.+)/i,
    ];
    
    for (const pattern of testPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[2]) {
        const possibleRepo = resolveRepoName(match[1]);
        if (possibleRepo) {
          await ctx.reply(`🧪 Generating tests...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/gentest ${possibleRepo} ${match[2].trim()}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // Detect: "what changed", "recent changes", "diff"
    const diffPatterns = [
      /(?:what changed|recent changes|show changes|diff)\s+(?:in\s+)?([a-z]+)/i,
      /(?:show|get)\s+(?:the\s+)?diff\s+(?:for\s+)?([a-z]+)/i,
    ];
    
    for (const pattern of diffPatterns) {
      const match = question.match(pattern);
      if (match && match[1]) {
        const possibleRepo = resolveRepoName(match[1]);
        if (possibleRepo) {
          await ctx.reply(`📊 Fetching recent changes...`);
          const fakeCtx = { ...ctx, message: { ...ctx.message, text: `/diff ${possibleRepo}` } };
          // @ts-ignore
          return bot.handleUpdate({ message: fakeCtx.message, update_id: Date.now() });
        }
      }
    }
    
    // ==========================================================================
    // DEFAULT: Smart CTO conversation with action suggestions
    // ==========================================================================
    
    await ctx.reply('🧠 Thinking...');
    
    try {
      const context = await getRelevantMemory('CTO', 'telegram_qa', 3);
      const sessionContext = getContextSummary(ctx.from?.id || 0);
      const convCtx = getConversationContext(ctx.from?.id || 0);
      
      // Get recent file content for context if available
      let recentFileContent = '';
      if (convCtx.recentFiles.length > 0) {
        const lastFile = convCtx.recentFiles[convCtx.recentFiles.length - 1];
        if (lastFile) {
          recentFileContent = `\nLAST FILE VIEWED (${lastFile.repo}/${lastFile.path}):\n\`\`\`\n${lastFile.content.substring(0, 2000)}\n\`\`\`\n`;
        }
      }
      
      const prompt = `${AIDEAZZ_CONTEXT}

You are CTO AIPA v5.2 - MAXIMUM CURSOR TWIN! When Elena runs out of Cursor credits, YOU are her primary coding assistant!

SESSION CONTEXT (remember this!):
${sessionContext || 'No prior context - starting fresh conversation'}
${recentFileContent}

YOUR CURSOR-LEVEL CAPABILITIES:

🚀 FILE OPERATIONS:
- /readfile <repo> <path> - Read any file
- /editfile <repo> <path> - Edit files + commit to GitHub
- /createfile <repo> <path> - Create new files
- /commit <message> - Commit pending changes
- /tree <repo> [path] - List directory
- /search <term> - Search code across repos
- /batch - Manage multi-file edits in one commit

⚡ POWER FEATURES:
- /fixerror <paste error> - Analyze error, get fix
- /apply - Apply my last suggested fix directly!
- /multifile <repo> <file1> <file2> - Load multiple files
- /refactor <repo> <file> - Refactoring suggestions
- /gentest <repo> <file> - Generate tests
- /explaincode <repo> <file> [lines] - Deep explanation
- /quickfix <description> - Fast one-liner fixes
- /diff <repo> - See recent changes

🎯 CURSOR-TWIN BEHAVIORS:
1. Remember what files we've been working on
2. If she references "this file" or "here", use the session context
3. If she asks to "fix this" and I suggested a fix, tell her to use /apply
4. If she says "again" or "continue", remember the last action
5. Proactively suggest next logical steps
6. When suggesting code, offer to apply it with /editfile

SHORTCUT UNDERSTANDING:
- "familybot", "family" → EspaLuzFamilybot (Python)
- "espaluz", "spanish" → EspaLuzWhatsApp (Python)  
- "cto", "aipa" → AIPA_AITCF (TypeScript)
- "atuona", "creative" → AIPA_AITCF/atuona-creative-ai.ts

CONCISE RULES:
- This is MOBILE chat - be brief but helpful!
- Give EXACT commands she can copy!
- Reference session context for continuity
- Use emojis 🚀

Her message: "${question}"

Previous DB context: ${JSON.stringify(context)}

Act like Cursor - understand context, suggest the right action, remember the conversation!`;

      const answer = await askAI(prompt, 1500);
      
      // Save to conversation context
      addQuestionToContext(ctx.from?.id || 0, question, answer);
      
      // Check if answer contains code suggestion - save for /apply
      if (answer.includes('```') && (answer.toLowerCase().includes('fix') || answer.toLowerCase().includes('change') || answer.toLowerCase().includes('replace'))) {
        const codeMatch = answer.match(/```[\w]*\n?([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
          addPendingFix(ctx.from?.id || 0, question, codeMatch[1], convCtx.activeFile || undefined);
        }
      }
      
      await saveMemory('CTO', 'telegram_qa', { question }, answer, {
        platform: 'telegram',
        user_id: ctx.from?.id,
        timestamp: new Date().toISOString()
      });
      
      if (answer.length > 4000) {
        const parts = answer.match(/.{1,4000}/g) || [];
        for (const part of parts) {
          await ctx.reply(part);
        }
      } else {
        await ctx.reply(answer);
      }
      
    } catch (error) {
      console.error('Question handling error:', error);
      await ctx.reply('❌ Sorry, I encountered an error. Try again!');
    }
  }
  
  // ==========================================================================
  // PERSONAL AI COMMANDS (NEW - Personal AI Upgrade)
  // IMPORTANT: Must be registered BEFORE bot.start()!
  // ==========================================================================

  // /project - Set or show active project
  bot.command('project', async (ctx) => {
    const input = ctx.message?.text?.replace('/project', '').trim();
    const userId = ctx.from?.id || 0;
    const convCtx = getConversationContext(userId);
    
    if (!input) {
      const currentProject = convCtx.activeRepo || 'None set';
      const claudeMd = convCtx.activeRepo === 'JOB_SEARCH'
        ? JOB_SEARCH_DOC_SNIPPET
        : (convCtx.activeRepo ? await loadClaudeMd(convCtx.activeRepo) : null);
      
      await ctx.reply(`📁 *Active Project*

Current: \`${currentProject}\`
${claudeMd ? '✅ CLAUDE.md found' : '❌ No CLAUDE.md'}

*Switch project:*
\`/project espaluz\` - EspaLuzFamilybot
\`/project whatsapp\` - EspaLuzWhatsApp
\`/project cto\` - CTO AIPA
\`/project atuona\` - Atuona book
\`/project job\` - Job search umbrella (VibeJob Hunter + YC shortlist)

Or use any repo alias!`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Pseudo-project: JOB_SEARCH (job search umbrella)
    if (input.toLowerCase() === 'job') {
      convCtx.activeRepo = 'JOB_SEARCH';
      convCtx.lastUpdated = Date.now();
      syncContextToDb(userId);

      await ctx.reply(`✅ *Switched to JOB_SEARCH*

📋 *Job search rules (JOB_SEARCH.md):*
\`\`\`
${JOB_SEARCH_DOC_SNIPPET}
\`\`\`

Now I will treat your questions and notes as part of your job search system (VibeJob Hunter + YC shortlist).`, { parse_mode: 'Markdown' });
      return;
    }

    const repoName = resolveRepoName(input);
    if (!repoName || repoName === 'JOB_SEARCH') {
      await ctx.reply(`❌ Unknown project: "${input}"\n\nUse /repos to see available projects.`);
      return;
    }
    
    convCtx.activeRepo = repoName;
    convCtx.lastUpdated = Date.now();
    
    // Load CLAUDE.md if exists
    const claudeMd = await loadClaudeMd(repoName);
    
    // Sync to DB
    syncContextToDb(userId);
    
    await ctx.reply(`✅ *Switched to ${repoName}*

${claudeMd ? `📋 *Project Rules (CLAUDE.md):*\n\`\`\`\n${claudeMd.substring(0, 500)}${claudeMd.length > 500 ? '...' : ''}\n\`\`\`` : '📝 No CLAUDE.md found - I\'ll use default behavior.'}

Now you can use /readfile, /editfile, /search without specifying the repo!`, { parse_mode: 'Markdown' });
  });

  // /know - Search your knowledge base
  bot.command('know', async (ctx) => {
    const query = ctx.message?.text?.replace('/know', '').trim();
    const userId = ctx.from?.id || 0;
    
    if (!query) {
      // Show recent knowledge
      const recent = await getRecentKnowledge(userId, 7, 10);
      
      if (recent.length === 0) {
        await ctx.reply(`🧠 *Your Knowledge Base*

Empty! Start adding:
• Send a voice note with an idea
• \`/idea <your idea>\`
• \`/diary\` for diary entries
• \`/research <topic>\`

I'll remember everything for you!`, { parse_mode: 'Markdown' });
        return;
      }
      
      let response = `🧠 *Recent Knowledge (7 days)*\n\n`;
      for (const item of recent) {
        const [id, category, title, content, tags, project, source, createdAt] = item as any[];
        const emoji = category === 'idea' ? '💡' : category === 'diary' ? '📔' : category === 'task' ? '✅' : category === 'research' ? '🔬' : '📝';
        response += `${emoji} *${title?.substring(0, 50) || 'Untitled'}*\n`;
        response += `   ${category} • ${source}\n\n`;
      }
      response += `\n_/know <query> to search_`;
      
      await ctx.reply(response, { parse_mode: 'Markdown' });
      return;
    }
    
    // Search knowledge
    const results = await searchKnowledge(userId, query, undefined, 10);
    
    if (results.length === 0) {
      await ctx.reply(`🔍 No results for "${query}"\n\nTry different keywords or add new knowledge with /idea, /diary, /research`);
      return;
    }
    
    let response = `🔍 *Results for "${query}"*\n\n`;
    for (const item of results) {
      const [id, category, title, content, tags, project, source, createdAt] = item as any[];
      const emoji = category === 'idea' ? '💡' : category === 'diary' ? '📔' : category === 'task' ? '✅' : category === 'research' ? '🔬' : '📝';
      response += `${emoji} *${title?.substring(0, 50) || 'Untitled'}*\n`;
      response += `${(content as string)?.substring(0, 100)}...\n\n`;
    }
    
    await ctx.reply(response, { parse_mode: 'Markdown' });
  });

  // /diary - Quick diary entry
  bot.command('diary', async (ctx) => {
    const entry = ctx.message?.text?.replace('/diary', '').trim();
    const userId = ctx.from?.id || 0;
    
    if (!entry) {
      // Show recent diary entries
      const diaries = await getKnowledgeByCategory(userId, 'diary', 5);
      
      if (diaries.length === 0) {
        await ctx.reply(`📔 *Diary*

No entries yet! 

*Write an entry:*
\`/diary Today I worked on EspaLuz and felt productive...\`

Or send a voice message starting with "Today I..." or "I'm feeling..."`, { parse_mode: 'Markdown' });
        return;
      }
      
      let response = `📔 *Recent Diary Entries*\n\n`;
      for (const item of diaries) {
        const [id, category, title, content, tags, project, source, createdAt] = item as any[];
        response += `*${title}*\n`;
        response += `${(content as string)?.substring(0, 150)}...\n\n`;
      }
      
      await ctx.reply(response, { parse_mode: 'Markdown' });
      return;
    }
    
    // Save diary entry
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const id = await saveKnowledge(userId, 'diary', today, entry, undefined, undefined, 'text');
    
    if (id) {
      await ctx.reply(`📔 *Diary entry saved!*\n\n_${today}_\n\n"${entry.substring(0, 100)}${entry.length > 100 ? '...' : ''}"\n\n_Your thoughts are safe with me._`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ Failed to save diary entry. Try again?');
    }
  });

  // /tasks - Show pending tasks
  bot.command('tasks', async (ctx) => {
    const userId = ctx.from?.id || 0;
    const tasks = await getKnowledgeByCategory(userId, 'task', 20);
    
    if (tasks.length === 0) {
      await ctx.reply(`✅ *Tasks*

No tasks! 

*Add a task:*
Say "Remind me to..." in a voice message
Or: \`/idea TODO: fix the login bug\``, { parse_mode: 'Markdown' });
      return;
    }
    
    // Escape special Markdown characters to prevent parse failures
    const escapeMd = (s: string) => s.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
    
    let response = `✅ Your Tasks\n\n`;
    let i = 1;
    for (const item of tasks) {
      const [id, category, title, content, tags, project, source, createdAt] = item as any[];
      const label = (title?.substring(0, 60) || (content as string)?.substring(0, 60) || '?');
      response += `${i}. ${label}\n`;
      if (project) response += `   📁 ${project}\n`;
      i++;
    }
    response += `\n${tasks.length} task(s) total`;
    
    await ctx.reply(response);
  });

  // /done N[,M,...] — delete task(s) by number from /tasks list
  bot.command('done', async (ctx) => {
    const userId = ctx.from?.id || 0;
    const arg = ctx.message?.text?.replace('/done', '').trim() || '';
    if (!arg) {
      await ctx.reply('Usage: `/done 3` or `/done 1,4,7` — delete tasks by their number from /tasks', { parse_mode: 'Markdown' });
      return;
    }
    const nums = arg.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
    if (nums.length === 0) {
      await ctx.reply('Please provide task numbers, e.g. `/done 2,5`', { parse_mode: 'Markdown' });
      return;
    }
    const tasks = await getKnowledgeByCategory(userId, 'task', 50);
    const toDelete = nums.map(n => tasks[n - 1]).filter(Boolean);
    if (toDelete.length === 0) {
      await ctx.reply('❌ No matching tasks found. Run /tasks to see current numbers.');
      return;
    }
    let deleted = 0;
    for (const t of toDelete) {
      const id = (t as any[])[0] as string;
      if (await deleteKnowledgeById(userId, id)) deleted++;
    }
    await ctx.reply(`✅ *${deleted} task${deleted !== 1 ? 's' : ''} removed.*\n\nRun /tasks to see what's left.`, { parse_mode: 'Markdown' });
  });

  // /cleartasks — wipe all tasks or run Claude auto-cleanup
  bot.command('cleartasks', async (ctx) => {
    const userId = ctx.from?.id || 0;
    const arg = ctx.message?.text?.replace('/cleartasks', '').trim().toLowerCase() || '';

    // /cleartasks auto — Claude reads every task and marks stale ones
    if (arg === 'auto') {
      const tasks = await getKnowledgeByCategory(userId, 'task', 50);
      if (tasks.length === 0) { await ctx.reply('✅ No tasks to clean up.'); return; }

      await ctx.reply('🤖 Analyzing your tasks...');

      const numbered = tasks.map((t: any[], i: number) => `${i + 1}. ${(t[2] || t[3] || '?').toString().substring(0, 120)}`).join('\n');
      const key = process.env.ANTHROPIC_API_KEY || '';
      let staleNums: number[] = [];

      if (key) {
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 200,
              messages: [{ role: 'user', content: `These are Elena's pending tasks. Today is ${new Date().toDateString()}.
Identify which are likely DONE, STALE, DUPLICATE, or TEST entries that can be safely deleted.
Reply with ONLY a JSON array of task numbers to delete (e.g. [1,2,5]). Empty array if none.

Tasks:
${numbered}` }],
            }),
          });
          if (resp.ok) {
            const data = await resp.json() as { content?: Array<{ text?: string }> };
            const text = (data?.content?.[0]?.text || '').trim().replace(/```json\n?|\n?```/g, '');
            staleNums = JSON.parse(text) as number[];
          }
        } catch { /* fall through */ }
      }

      if (staleNums.length === 0) {
        await ctx.reply('✅ Claude found nothing obviously stale — all tasks look relevant.\n\nUse `/done N` to delete specific ones manually.');
        return;
      }

      const staleList = staleNums.map(n => `${n}. ${((tasks[n - 1] as any[])?.[2] || '?').toString().substring(0, 80)}`).join('\n');
      await ctx.reply(`🗑️ *Claude suggests deleting ${staleNums.length} tasks:*\n\n${staleList}\n\nReply \`/cleartasks confirm ${staleNums.join(',')}\` to delete them, or \`/done N\` for individual ones.`, { parse_mode: 'Markdown' });
      return;
    }

    // /cleartasks confirm 1,3,5 — delete the specific numbers Claude suggested
    if (arg.startsWith('confirm ')) {
      const nums = arg.replace('confirm ', '').split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      const tasks = await getKnowledgeByCategory(userId, 'task', 50);
      let deleted = 0;
      for (const n of nums) {
        const t = tasks[n - 1] as any[];
        if (t && await deleteKnowledgeById(userId, t[0] as string)) deleted++;
      }
      await ctx.reply(`✅ *${deleted} tasks removed.*\n\nRun /tasks to see what's left.`, { parse_mode: 'Markdown' });
      return;
    }

    // /cleartasks — delete ALL tasks
    const count = await clearKnowledgeByCategory(userId, 'task');
    await ctx.reply(`🗑️ *All ${count} tasks cleared.*\n\nFresh start! Add new ones with /task or via voice.`, { parse_mode: 'Markdown' });
  });

  // /task - Save a task directly
  bot.command('task', async (ctx) => {
    const taskText = ctx.message?.text?.replace('/task', '').trim();
    const userId = ctx.from?.id || 0;
    
    if (!taskText) {
      await ctx.reply(`✅ *Add a Task*\n\nExample: \`/task Build combinator for Aiden, Tora and AILA\`\n\nOr just say "Write down the task..." in a voice or text message.`, { parse_mode: 'Markdown' });
      return;
    }
    
    const title = taskText.split('.')[0]?.substring(0, 100) || taskText.substring(0, 100);
    const id = await saveKnowledge(userId, 'task', title, taskText, 'pending', undefined, 'text');
    
    if (id) {
      await ctx.reply(`✅ *Task saved!*\n\n"${title}"\n\n_Use /tasks to see all pending tasks_`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ Failed to save task. Try again?');
    }
  });

  // /research - Save research note
  bot.command('research', async (ctx) => {
    const note = ctx.message?.text?.replace('/research', '').trim();
    const userId = ctx.from?.id || 0;
    
    if (!note) {
      await ctx.reply(`🔬 *Research Notes*

Save research findings:
\`/research Competitor X charges $20/mo and has 10k users\`

Or send a voice note: "I found out that..." or "Research: ..."`, { parse_mode: 'Markdown' });
      return;
    }
    
    const title = note.split('.')[0]?.substring(0, 100) || 'Research note';
    const id = await saveKnowledge(userId, 'research', title, note, undefined, undefined, 'text');
    
    if (id) {
      await ctx.reply(`🔬 *Research saved!*\n\n"${title}"\n\n_Use /know to search your research_`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ Failed to save research. Try again?');
    }
  });

  // /rules - Show CLAUDE.md for current project (or JOB_SEARCH.md for job search)
  bot.command('rules', async (ctx) => {
    const userId = ctx.from?.id || 0;
    const convCtx = getConversationContext(userId);
    
    if (!convCtx.activeRepo) {
      await ctx.reply(`❌ No active project set.\n\nUse \`/project espaluz\` to set one first.`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Special: JOB_SEARCH pseudo-project reads local JOB_SEARCH.md
    if (convCtx.activeRepo === 'JOB_SEARCH') {
      await ctx.reply(`📋 *JOB_SEARCH — Job Search Rules*

\`\`\`
${JOB_SEARCH_DOC_SNIPPET}
\`\`\`

Use \`/project job\` to keep CTO AIPA in job-search mode while we plan applications, outreach, and improvements to VibeJob Hunter + YC shortlist.`, { parse_mode: 'Markdown' });
      return;
    }

    const claudeMd = await loadClaudeMd(convCtx.activeRepo);
    
    if (!claudeMd) {
      await ctx.reply(`📋 *${convCtx.activeRepo}*

No CLAUDE.md file found in this repo.

Create one to give me project-specific instructions!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`📋 *Rules for ${convCtx.activeRepo}*

\`\`\`
${claudeMd.substring(0, 3500)}${claudeMd.length > 3500 ? '...(truncated)' : ''}
\`\`\``, { parse_mode: 'Markdown' });
  });

  // /resume - Reload context from database (recovery)
  bot.command('resume', async (ctx) => {
    const userId = ctx.from?.id || 0;
    
    await ctx.reply('🔄 Loading your last session...');
    await loadContextFromDbForUser(userId);
    
    const summary = getContextSummary(userId);
    
    // Also load recent knowledge (tasks, ideas) even if conversation context is empty
    const recentTasks  = await getKnowledgeByCategory(userId, 'task', 5);
    const recentIdeas  = await getKnowledgeByCategory(userId, 'idea', 3);
    
    const hasConvContext = !!summary;
    const hasKnowledge   = recentTasks.length > 0 || recentIdeas.length > 0;
    
    if (!hasConvContext && !hasKnowledge) {
      await ctx.reply(`ℹ️ No previous session found.\n\nStart fresh! I'll remember our conversation.`);
      return;
    }
    
    let response = `✅ *Session Restored!*\n\n`;
    
    if (summary) {
      response += `${summary}\n`;
    }
    
    if (recentTasks.length > 0) {
      response += `*Pending tasks:*\n`;
      recentTasks.forEach((item: any[], i: number) => {
        const title = item[2]?.substring(0, 60) || item[3]?.substring(0, 60) || 'task';
        response += `${i + 1}. ${title}\n`;
      });
      response += '\n';
    }
    
    if (recentIdeas.length > 0) {
      response += `*Recent ideas:*\n`;
      recentIdeas.forEach((item: any[], i: number) => {
        const title = item[2]?.substring(0, 60) || item[3]?.substring(0, 60) || 'idea';
        response += `• ${title}\n`;
      });
    }
    
    response += `\n_I remember what we were working on!_`;
    
    await ctx.reply(response, { parse_mode: 'Markdown' });
  });

  // /forget - Clear conversation context
  bot.command('forget', async (ctx) => {
    const userId = ctx.from?.id || 0;
    
    conversationContexts.delete(userId);
    await clearConversationContext(userId);
    
    await ctx.reply(`🧹 *Memory cleared!*\n\nI've forgotten our conversation context. Starting fresh!\n\n_Your knowledge base (ideas, diary, tasks) is still intact._`, { parse_mode: 'Markdown' });
  });

  // /trello_analyze - Full Kanban health analysis across all Trello boards
  bot.command('trello_analyze', async (ctx) => {
    const userId = ctx.from?.id || 0;
    if (!AUTHORIZED_USERS.includes(userId)) { await ctx.reply('⛔ Unauthorized'); return; }

    await ctx.reply('🔍 Fetching all Trello boards and running Kanban analysis... (may take 20-30s)');
    try {
      const { analyzeKanban } = await import('./trello-kanban');
      const analysis = await analyzeKanban();

      // Split into chunks if too long for Telegram (4096 char limit)
      const MAX = 4000;
      if (analysis.length <= MAX) {
        await ctx.reply(`📊 *Kanban Analysis*\n\n${analysis}`, { parse_mode: 'Markdown' });
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < analysis.length; i += MAX) chunks.push(analysis.slice(i, i + MAX));
        for (let i = 0; i < chunks.length; i++) {
          const header = i === 0 ? '📊 *Kanban Analysis* (1/' + chunks.length + ')\n\n' : `*(${i + 1}/${chunks.length})*\n\n`;
          await ctx.reply(header + chunks[i], { parse_mode: 'Markdown' });
        }
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      await ctx.reply(`❌ Trello analysis failed: ${msg}\n\nCheck that TRELLO_API_KEY and TRELLO_TOKEN are set in .env on Oracle.`);
    }
  });

  // ==========================================================================
  // START BOT & SCHEDULED TASKS
  // ==========================================================================
  
  bot.start({
    onStart: async (botInfo) => {
      console.log(`🤖 Telegram bot started: @${botInfo.username}`);
      console.log(`   Chat with your CTO at: https://t.me/${botInfo.username}`);
      console.log(`   📅 Daily briefing: 8 AM Panama time`);
      console.log(`   🎤 Voice messages: Enabled`);
      
      // Register commands with descriptions for Telegram's command menu
      try {
        await bot!.api.setMyCommands([
          // CURSOR-TWIN OPERATIONS
          { command: 'readfile', description: '📖 Read any file from your repos' },
          { command: 'editfile', description: '✏️ Edit files and commit to GitHub' },
          { command: 'createfile', description: '📝 Create new files in your repos' },
          { command: 'commit', description: '💾 Commit pending changes' },
          { command: 'search', description: '🔍 Search code across repos (like grep)' },
          { command: 'tree', description: '🌳 List directory structure' },
          { command: 'run', description: '▶️ Trigger GitHub Actions (CI/CD)' },
          { command: 'cancel', description: '🗑️ Cancel pending edits' },
          // SESSION MEMORY
          { command: 'context', description: '📋 Show what I remember from our session' },
          { command: 'apply', description: '⚡ Apply my last suggested fix' },
          { command: 'batch', description: '📦 Multi-file batch editing' },
          // POWER FEATURES
          { command: 'fixerror', description: '🔧 Paste an error, get a fix' },
          { command: 'multifile', description: '📂 Load multiple files at once' },
          { command: 'refactor', description: '♻️ Get code improvement suggestions' },
          { command: 'gentest', description: '🧪 Generate tests for your code' },
          { command: 'explaincode', description: '📖 Deep code explanation' },
          { command: 'quickfix', description: '⚡ Fast one-liner fixes' },
          { command: 'diff', description: '📊 Show recent changes in a repo' },
          // STRATEGIC CTO
          { command: 'strategy', description: '🎯 Ecosystem analysis and strategy' },
          { command: 'priorities', description: '📌 What to work on today' },
          { command: 'think', description: '🧠 Deep strategic thinking' },
          { command: 'suggest', description: '💡 Quick actionable suggestion' },
          // MONITORING
          { command: 'health', description: '🏥 Check production services' },
          { command: 'logs', description: '📋 Analyze pasted logs' },
          { command: 'status', description: '📊 Ecosystem status overview' },
          { command: 'daily', description: '☀️ Morning briefing' },
          { command: 'stats', description: '📈 Weekly metrics and stats' },
          // CODE GENERATION
          { command: 'code', description: '💻 Generate code and create PR' },
          { command: 'fix', description: '🔧 Fix a bug and create PR' },
          { command: 'approve', description: '✅ Approve and create PR' },
          { command: 'reject', description: '❌ Discard pending code' },
          { command: 'pending', description: '⏳ Check pending code status' },
          // DECISIONS & LEARNING
          { command: 'decision', description: '🏛️ Record architectural decision' },
          { command: 'debt', description: '📋 Track technical debt' },
          { command: 'review', description: '🔍 Review latest commits' },
          { command: 'feedback', description: '📝 Teach me what worked' },
          { command: 'lessons', description: '📚 See what I learned' },
          // CURSOR GUIDE
          { command: 'cursor', description: '🖥️ Step-by-step Cursor instructions' },
          { command: 'build', description: '🏗️ Multi-step project guidance' },
          // LEARN CODE
          { command: 'study', description: '📚 Quiz yourself on your code' },
          { command: 'explainfile', description: '📖 Explain any file' },
          { command: 'architecture', description: '🏗️ Show repo structure' },
          { command: 'error', description: '🐛 Debug an error' },
          { command: 'howto', description: '📖 How-to guides' },
          { command: 'cmd', description: '⌨️ Command cheatsheet' },
          // LEARN CONCEPTS
          { command: 'learn', description: '🎓 Pick a coding topic to learn' },
          { command: 'exercise', description: '🏋️ Get a coding challenge' },
          { command: 'explain', description: '🤔 Explain any concept' },
          // REPOS & IDEAS
          { command: 'repos', description: '📂 List all repositories' },
          { command: 'idea', description: '💡 Save a startup idea' },
          { command: 'ideas', description: '💡 View saved ideas' },
          // CHAT
          { command: 'ask', description: '💬 Ask me anything' },
          { command: 'menu', description: '📋 Show full command menu' },
          { command: 'help', description: '❓ Get help' },
          // PERSONAL AI
          { command: 'project', description: '📁 Set/show active project' },
          { command: 'know', description: '🧠 Search your knowledge base' },
          { command: 'diary', description: '📔 Quick diary entry' },
          { command: 'task', description: '✅ Save a task directly' },
          { command: 'tasks', description: '✅ Show your pending tasks' },
          { command: 'research', description: '🔬 Save research note' },
          { command: 'rules', description: '📋 Show CLAUDE.md for project' },
          { command: 'resume', description: '🔄 Restore last session' },
          { command: 'forget', description: '🧹 Clear conversation memory' },
          { command: 'trello_analyze', description: '📋 Full Kanban analysis of all Trello boards' },
          // SETTINGS
          { command: 'alerts', description: '🔔 Toggle proactive alerts' },
          { command: 'roadmap', description: '🛣️ View CTO AIPA roadmap' },
        ]);
        console.log(`   📋 Registered ${82} commands with Telegram`);
      } catch (err) {
        console.log(`   ⚠️ Could not register commands: ${err}`);
      }
      
      // Load alert preferences from database (persistent!)
      try {
        const savedChatIds = await getAllAlertChatIds();
        savedChatIds.forEach(id => alertChatIds.add(id));
        console.log(`   🔔 Loaded ${savedChatIds.length} alert subscribers from database`);
      } catch (err) {
        console.log(`   ⚠️ Could not load alert preferences: ${err}`);
      }
      
      // Start scheduled tasks
      startScheduledTasks(bot!);
    }
  });

  bot.catch((err) => {
    console.error('Telegram bot error:', err);
  });
  
  return bot;
}

// =============================================================================
// HELPER: Download file from URL
// =============================================================================

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// =============================================================================
// HELPER: Transcribe audio with Groq Whisper
// =============================================================================

async function transcribeAudio(filePath: string): Promise<string | null> {
  try {
    // No language lock — Elena speaks EN, ES and RU in the same message.
    // The prompt seeds Whisper's vocabulary with project names and month names
    // so it transcribes them correctly (e.g. "May" not "me", "card" not "desk").
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      response_format: 'text',
      prompt: [
        // Month names (common source of errors when mixed EN/ES/RU)
        'January, February, March, April, May, June, July, August, September, October, November, December.',
        // Project / brand vocabulary
        'Trello, HubSpot, VibeJob, EspaLuz, Algom, AIdeazz, Atuona, AIPA, Kira, Elena.',
        // Trello action vocabulary
        'Move card, create card, add card, archive card, move this card, add task, new task.',
        // Avoid common substitutions
        'Trello card. Kira board. Kira Mayo. Kira Junio.',
      ].join(' '),
    });

    return transcription as unknown as string;
  } catch (error) {
    console.error('Transcription error:', error);
    return null;
  }
}

// =============================================================================
// HELPER: Send Daily Briefing
// =============================================================================

async function sendDailyBriefing(ctx: Context) {
  await ctx.reply('☀️ Generating your daily briefing...');
  
  try {
    // 1. Check service health
    let ctoStatus = '✅ Online';
    let cmoStatus = '❓ Checking...';
    
    try {
      const cmoResponse = await fetch('https://vibejobhunter-production.up.railway.app/health');
      cmoStatus = cmoResponse.ok ? '✅ Online' : '⚠️ Issues';
    } catch {
      cmoStatus = '❌ Offline';
    }
    
    // 2. Get recent activity across all repos
    const recentActivity: { repo: string; days: number; message: string }[] = [];
    const staleRepos: string[] = [];
    const now = new Date();
    
    for (const repo of AIDEAZZ_REPOS.slice(0, 6)) { // Check main repos
      try {
        const commits = await octokit.repos.listCommits({
          owner: 'ElenaRevicheva',
          repo,
          per_page: 1
        });
        
        const latestCommit = commits.data[0];
        if (latestCommit) {
          const commitDate = new Date(latestCommit.commit.author?.date || '');
          const daysAgo = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
          const message = latestCommit.commit.message?.split('\n')[0] || 'No message';
          
          recentActivity.push({ repo, days: daysAgo, message: message.substring(0, 40) });
          
          if (daysAgo > 7) {
            staleRepos.push(repo);
          }
        }
      } catch {
        // Skip repos that error
      }
    }
    
    // Sort by most recent
    recentActivity.sort((a, b) => a.days - b.days);
    
    // 3. Generate AI suggestion
    const suggestionPrompt = `${AIDEAZZ_CONTEXT}

Generate a brief (2-3 sentences) morning motivation and ONE specific technical task Elena should focus on today. Consider:
- Recent repos: ${recentActivity.slice(0, 3).map(r => `${r.repo} (${r.days}d ago)`).join(', ')}
- Stale repos needing attention: ${staleRepos.length > 0 ? staleRepos.join(', ') : 'None'}
- CMO status: ${cmoStatus}

Be concise, motivating, and actionable. This is Telegram mobile - keep it short!`;

    // Use askAI with Groq fallback
    const suggestion = await askAI(suggestionPrompt, 500);
    
    // 4. Pull wiring data (outcomes, revenue, leads)
    let wiringSection = '';
    try {
      const [outcomeSummary, espaluzSummary, leads, expiringTrials] = await Promise.all([
        getOutcomeSummary(24),
        getEspaluzFunnelSummary(),
        getLeads(undefined, 5),
        getEspaluzExpiringTrials(2)
      ]);

      const convRate = outcomeSummary.total > 0
        ? Math.round((outcomeSummary.positive / outcomeSummary.total) * 100)
        : 0;

      wiringSection = `
💰 *Revenue*
EspaLuz: ${espaluzSummary.active_paid} paid ($${espaluzSummary.monthly_revenue.toFixed(2)}/mo) | ${espaluzSummary.active_trials} trials${espaluzSummary.expiring_soon > 0 ? ` | ⚠️ ${espaluzSummary.expiring_soon} expiring` : ''}

📈 *Outcomes (24h)*
${outcomeSummary.total} actions | ${outcomeSummary.positive} positive | ${convRate}% conversion${outcomeSummary.verified_failed > 0 ? ` | ⚠️ ${outcomeSummary.verified_failed} failed` : ''}

🎯 *Leads*
${(leads as any[]).length} tracked${(leads as any[]).filter((l: any) => (l[3] === 'high' || l[4] === 'high')).length > 0 ? ' | 🔥 ' + (leads as any[]).filter((l: any) => (l[3] === 'high' || l[4] === 'high')).length + ' high-signal' : ''}
`;
    } catch (err) {
      console.error('Wiring data error in daily briefing:', err);
      wiringSection = '\n_⚠️ Wiring data unavailable — use /briefing for details_\n';
    }

    // 5. Format briefing
    const activityLines = recentActivity.slice(0, 4).map(r =>
      `• ${escapeMarkdown(r.repo)}: ${r.days === 0 ? 'Today' : r.days === 1 ? 'Yesterday' : `${r.days}d ago`}`
    ).join('\n');

    const alertsSection = staleRepos.length > 0
      ? `\n⚠️ *Needs Attention*\n${staleRepos.map(r => `• ${escapeMarkdown(r)} (>7 days)`).join('\n')}\n`
      : '';

    const briefing = `☀️ *Good Morning, Elena!*

📊 *Ecosystem Status*
CTO AIPA: ${ctoStatus}
CMO AIPA: ${cmoStatus}
${wiringSection}
📁 *Recent Activity*
${activityLines}
${alertsSection}
💡 *Today's Focus*
${suggestion}

_/briefing for full business view | /daily anytime for update_`;

    await ctx.reply(briefing, { parse_mode: 'Markdown' });

    await saveAgentOutcome('cto_aipa', 'daily_briefing_sent', {
      type: 'auto_scheduled'
    }, 'verified_delivered').catch(() => {});

    // Save to memory
    await saveMemory('CTO', 'daily_briefing', { date: now.toISOString() }, briefing, {
      platform: 'telegram',
      type: 'daily_briefing'
    });
    
  } catch (error) {
    console.error('Daily briefing error:', error);
    await ctx.reply('❌ Error generating briefing. Try /status instead.');
  }
}

// =============================================================================
// HELPER: Check ecosystem and send proactive alerts
// =============================================================================

async function checkEcosystemHealth(bot: Bot): Promise<void> {
  if (alertChatIds.size === 0) return;
  
  console.log('🔍 Running proactive health check...');
  
  const alerts: string[] = [];
  
  // Check CMO AIPA (Oracle-local — same VM, port 8080)
  const CMO_HEALTH_URL = process.env.CMO_API_URL
    ? `${process.env.CMO_API_URL.replace(/\/$/, '')}/health`
    : 'http://127.0.0.1:8080/health';
  try {
    const cmoResponse = await fetch(CMO_HEALTH_URL, {
      signal: AbortSignal.timeout(10000)
    });
    if (!cmoResponse.ok) {
      alerts.push('🚨 CMO AIPA is having issues!');
    }
  } catch {
    alerts.push('🚨 CMO AIPA appears to be offline!');
  }
  
  // Check for stale repos (>5 days)
  const now = new Date();
  const staleRepos: string[] = [];
  
  for (const repo of ['EspaLuzWhatsApp', 'VibeJobHunterAIPA_AIMCF', 'AIPA_AITCF']) {
    try {
      const commits = await octokit.repos.listCommits({
        owner: 'ElenaRevicheva',
        repo,
        per_page: 1
      });
      
      const latestCommit = commits.data[0];
      if (latestCommit) {
        const commitDate = new Date(latestCommit.commit.author?.date || '');
        const daysAgo = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysAgo > STALE_REPO_THRESHOLD_DAYS) {
          // Dedup: skip if we already alerted about this repo in last 24h
          const lastAlert = lastStaleRepoAlertAt.get(repo) || 0;
          if (Date.now() - lastAlert >= STALE_REPO_ALERT_COOLDOWN_MS) {
            staleRepos.push(`${escapeMarkdown(repo)} (${daysAgo} days)`);
            lastStaleRepoAlertAt.set(repo, Date.now());
          }
        }
      }
    } catch {}
  }
  
  if (staleRepos.length > 0) {
    alerts.push(`⏰ Repos need attention: ${staleRepos.join(', ')}`);
  }
  
  // Send alerts to all registered chats
  if (alerts.length > 0) {
    const alertMessage = `🔔 *Proactive Alert*\n\n${alerts.join('\n')}\n\n_Use /daily for full status_`;
    
    for (const chatId of alertChatIds) {
      try {
        await bot.api.sendMessage(chatId, alertMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send alert to ${chatId}:`, error);
        // Remove invalid chat IDs
        alertChatIds.delete(chatId);
      }
    }
  }
}

// =============================================================================
// PERSONAL AI HELPER FUNCTIONS (NEW - Personal AI Upgrade)
// =============================================================================

// Sync in-memory context to database (non-blocking)
async function syncContextToDb(userId: number): Promise<void> {
  try {
    const ctx = conversationContexts.get(userId);
    if (ctx) {
      await saveConversationContext(userId, {
        activeProject: ctx.activeRepo,
        activeFile: ctx.activeFile,
        recentFiles: ctx.recentFiles,
        recentQuestions: ctx.recentQuestions,
        pendingFixes: ctx.pendingFixes,
        batchEdits: ctx.batchEdits,
        lastUpdated: ctx.lastUpdated
      });
    }
  } catch (err) {
    console.error('Context sync error (non-fatal):', err);
  }
}

// Load context from DB on bot startup (recovery)
async function loadContextFromDbForUser(userId: number): Promise<void> {
  try {
    const dbContext = await loadConversationContext(userId);
    if (dbContext) {
      const ctx = getConversationContext(userId);
      ctx.activeRepo = dbContext.activeProject;
      ctx.activeFile = dbContext.activeFile;
      ctx.recentFiles = dbContext.recentFiles;
      ctx.recentQuestions = dbContext.recentQuestions;
      ctx.pendingFixes = dbContext.pendingFixes;
      ctx.batchEdits = dbContext.batchEdits;
      ctx.lastUpdated = dbContext.lastUpdated;
      console.log(`📥 Loaded context from DB for user ${userId}`);
    }
  } catch (err) {
    console.error('Context load error (non-fatal):', err);
  }
}

// Detect intent from voice/text for Personal AI routing
async function detectPersonalAIIntent(text: string): Promise<{
  type: 'idea' | 'diary' | 'task' | 'research' | 'question' | 'command' | 'conversation';
  title?: string;
  tags?: string;
  project?: string;
}> {
  const lowerText = text.toLowerCase();
  
  // Quick pattern matching first (no AI needed)
  if (lowerText.startsWith('/')) {
    return { type: 'command' };
  }
  
  // TASK triggers
  if (
    lowerText.includes('remind me') ||
    lowerText.includes('todo') ||
    lowerText.includes('need to') ||
    lowerText.includes('write down') ||
    lowerText.includes('write it down') ||
    lowerText.includes('note this') ||
    lowerText.includes('save this task') ||
    lowerText.includes('add a task') ||
    lowerText.includes('add task') ||
    lowerText.includes('log this task') ||
    lowerText.includes('create a task') ||
    lowerText.includes('put it in tasks') ||
    lowerText.includes('put in tasks') ||
    lowerText.includes('write the task') ||
    lowerText.includes('write the tasks')
  ) {
    const title = text.substring(0, 100).replace(/remind me to |i need to |todo:? |write (down )?(the tasks?[: ]*)?|write it down[: ]*|note this[: ]?|save this tasks?[: ]?|add (a )?tasks?[: ]?|log this tasks?[: ]?|create (a )?tasks?[: ]?|put (it )?in tasks[: ]?/gi, '').trim();
    return { type: 'task', title: title || text.substring(0, 100) };
  }
  
  // IDEA triggers
  if (lowerText.includes('idea about') || lowerText.includes('i was thinking') || lowerText.includes('what if we') ||
      lowerText.includes('startup idea') || lowerText.includes('product idea') || lowerText.includes('what if i')) {
    return { type: 'idea', title: text.substring(0, 100) };
  }
  
  // DIARY / NOTE triggers
  if (
    lowerText.includes('today i') || lowerText.includes('feeling') || lowerText.includes('i realized') ||
    lowerText.includes('record a') || lowerText.includes('record this') || lowerText.includes('note down') ||
    lowerText.includes('make a note') || lowerText.includes('remember this') || lowerText.includes('met someone') ||
    lowerText.includes('met a') || lowerText.includes('i met') || lowerText.includes('contact:') ||
    lowerText.includes('save a note') || lowerText.includes('log this')
  ) {
    const title = text.replace(/^(record a?|record this|note down|make a note|remember this|log this)[: ]*/i, '').substring(0, 100);
    return { type: 'diary', title: title || `Note ${new Date().toLocaleDateString()}` };
  }
  
  // RESEARCH triggers
  if (lowerText.includes('research') || lowerText.includes('look into') || lowerText.includes('find out about') ||
      lowerText.includes('check out') || lowerText.includes('investigate')) {
    return { type: 'research', title: text.substring(0, 100) };
  }
  
  if (text.endsWith('?')) {
    return { type: 'question' };
  }
  
  // AI-powered fallback for voice messages that don't match keywords
  // Use a fast Groq call to classify intent
  if (text.length > 5 && text.length < 400) {
    try {
      const classifyResponse = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 30,
        messages: [{
          role: 'user',
          content: `Classify this voice note into exactly ONE word: task, diary, idea, research, or question.
Voice note: "${text}"
Reply with ONLY one word.`
        }]
      });
      const classification = (classifyResponse.choices[0]?.message?.content || '').trim().toLowerCase().replace(/[^a-z]/g, '');
      if (['task', 'diary', 'idea', 'research', 'question'].includes(classification)) {
        return { type: classification as any, title: text.substring(0, 100) };
      }
    } catch {
      // Groq fallback failed — fall through to conversation
    }
  }
  
  return { type: 'conversation' };
}

// Handle high-level JOB_SEARCH voice intents without touching code directly
async function handleJobSearchVoiceIntent(ctx: Context, text: string): Promise<void> {
  const userId = ctx.from?.id || 0;

  // Save as a JOB_SEARCH task so it shows up in /tasks
  await saveKnowledge(
    userId,
    'task',
    'Improve VibeJob Hunter job matching accuracy',
    text,
    'pending',
    'JOB_SEARCH',
    'voice'
  );

  await ctx.reply(
`🧠 JOB_SEARCH intent detected.

Here is how I will handle this:
1) Treat this as a JOB_SEARCH task: "Improve VibeJob Hunter job matching accuracy".
2) When you are in Cursor, we will:
   - Inspect the real matching logic files in VibeJobHunterAIPA_AIMCF.
   - Propose specific scoring/filter changes aligned with JOB_SEARCH.md.
   - Draft a small, reviewable patch instead of changing code blindly from Telegram.

Nothing has been changed in code yet.
When you are ready at the laptop, tell me in Cursor and we will implement the patch together.`,
  );
}

// Handle Personal AI actions (called from voice handler or text)
async function handlePersonalAIAction(
  ctx: Context,
  text: string,
  intent: { type: string; title?: string; tags?: string; project?: string },
  source: 'voice' | 'text'
): Promise<boolean> {
  const userId = ctx.from?.id || 0;
  
  switch (intent.type) {
    case 'idea':
      const ideaId = await saveKnowledge(userId, 'idea', intent.title || text.substring(0, 100), text, intent.tags, intent.project, source);
      if (ideaId) {
        await ctx.reply(`💡 *Idea saved!*\n\n"${(intent.title || text).substring(0, 100)}..."\n\n_Use /know to search your ideas_`, { parse_mode: 'Markdown' });
        return true;
      }
      break;
      
    case 'diary':
      const diaryId = await saveKnowledge(userId, 'diary', intent.title || `Diary ${new Date().toLocaleDateString()}`, text, undefined, undefined, source);
      if (diaryId) {
        await ctx.reply(`📔 *Diary entry saved!*\n\n_Your thoughts are recorded. Use /diary to see recent entries._`, { parse_mode: 'Markdown' });
        return true;
      }
      break;
      
    case 'task':
      const taskId = await saveKnowledge(userId, 'task', intent.title || text.substring(0, 100), text, 'pending', intent.project, source);
      if (taskId) {
        await ctx.reply(`✅ *Task saved!*\n\n"${(intent.title || text).substring(0, 100)}"\n\n_Use /tasks to see your pending tasks_`, { parse_mode: 'Markdown' });
        // Update conversation context so /resume shows this activity
        addQuestionToContext(userId, `[task saved] ${intent.title || text.substring(0, 100)}`, 'Task saved to knowledge base.');
        return true;
      }
      break;
      
    case 'research':
      const researchId = await saveKnowledge(userId, 'research', intent.title || text.substring(0, 100), text, intent.tags, intent.project, source);
      if (researchId) {
        await ctx.reply(`🔬 *Research note saved!*\n\n"${(intent.title || text).substring(0, 100)}..."\n\n_Use /know to search your research_`, { parse_mode: 'Markdown' });
        return true;
      }
      break;
      
    default:
      return false; // Not handled, continue with normal processing
  }
  
  return false;
}

// Small cached snippet of JOB_SEARCH rules for quick display (loaded from local docs)
const JOB_SEARCH_DOC_SNIPPET = `JOB_SEARCH — umbrella for job search:
- Target: remote, AI-systems roles paying ≥ $3.5K/month net.
- Focus: AI agents, automation, internal tools (no WordPress/ads/random tech help).
- Use existing agents: VibeJob Hunter + YC/OpenClaw shortlist.
- Roles: Applied AI / AI Systems / Agent Engineer / Internal AI Tools.`;

// Load CLAUDE.md from a repo (for project-specific instructions)
async function loadClaudeMd(repoAlias: string): Promise<string | null> {
  const repoName = resolveRepoName(repoAlias);
  if (!repoName) return null;
  
  try {
    const { data } = await octokit.repos.getContent({
      owner: 'ElenaRevicheva',
      repo: repoName,
      path: 'CLAUDE.md'
    });
    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
  } catch {
    // No CLAUDE.md found - this is fine
  }
  return null;
}

// =============================================================================
// SCHEDULED TASKS
// =============================================================================

function startScheduledTasks(bot: Bot): void {
  // Daily briefing at 8 AM Panama time (UTC-5) = 13:00 UTC
  const dailyBriefing = cron.schedule('0 13 * * *', async () => {
    console.log('☀️ Sending scheduled daily briefings...');
    
    for (const chatId of alertChatIds) {
      try {
        // Create a fake context for sending messages
        const now = new Date();
        const greeting = now.getUTCHours() >= 10 && now.getUTCHours() < 22 
          ? '☀️ Good morning, Elena!' 
          : '🌙 Evening update!';
        
        // Generate briefing content
        let cmoStatus = '❓';
        try {
          const cmoResponse = await fetch('http://127.0.0.1:8080/health');
          cmoStatus = cmoResponse.ok ? '✅' : '⚠️';
        } catch {
          cmoStatus = '❌';
        }
        
        // Get recent activity AND detect genuinely stale repos in one GitHub pass
        // (May 25 2026: walk all AIDEAZZ_REPOS so stale detection is complete;
        // 'Activity' section still shows only top 3.)
        const allRepoActivity: { repo: string; daysAgo: number }[] = [];
        for (const repo of AIDEAZZ_REPOS) {
          try {
            const commits = await octokit.repos.listCommits({
              owner: 'ElenaRevicheva',
              repo,
              per_page: 1
            });
            const latestCommit = commits.data[0];
            if (latestCommit) {
              const date = new Date(latestCommit.commit.author?.date || '');
              const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
              allRepoActivity.push({ repo, daysAgo });
            }
          } catch {}
        }
        const recentRepos: string[] = allRepoActivity.slice(0, 3).map(
          ({ repo, daysAgo }) => `• ${escapeMarkdown(repo)}: ${daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}`
        );

        // May 25 2026: deterministic, signal-driven 'Today's real issues' section.
        // Replaces the previous LLM-confabulated 'Today' line that hallucinated the
        // same EspaLuz focus suggestion every day (content-less prompt → same output).
        // Only renders when there is a TRUE crucial issue. On clean days, the
        // entire section is omitted (no '✅ all clear' filler — no noise).
        // Reuses module-scope STALE_REPO_THRESHOLD_DAYS (14d) — single source of truth
        // with the stale-repo proactive-alert dedup logic.
        const realIssues: string[] = [];
        if (cmoStatus === '❌') {
          realIssues.push('CMO offline — `pm2 logs cmo` to triage');
        }
        for (const { repo, daysAgo } of allRepoActivity) {
          if (daysAgo > STALE_REPO_THRESHOLD_DAYS) {
            realIssues.push(`${escapeMarkdown(repo)} stale (${daysAgo} days)`);
          }
        }
        const issuesSection = realIssues.length > 0
          ? `\n\n🚨 *Today's real issues*\n${realIssues.map((i) => `• ${i}`).join('\n')}`
          : '';
        
        const briefing = `${greeting}

📊 *Status*
CTO: ✅ | CMO: ${cmoStatus}

📁 *Activity*
${recentRepos.join('\n')}${issuesSection}

_/daily for full briefing_`;

        // Trello board briefing
        let trelloBriefing = '';
        try {
          trelloBriefing = await generateDailyBriefing();
        } catch (err) {
          console.error('[BoardBriefing] Daily briefing error:', err);
        }

        await bot.api.sendMessage(chatId, briefing, { parse_mode: 'Markdown' });
        if (trelloBriefing) {
          await bot.api.sendMessage(chatId, trelloBriefing, { parse_mode: 'Markdown' });
        }
        console.log(`   Sent daily briefing to ${chatId}`);

      } catch (error) {
        console.error(`Failed to send daily briefing to ${chatId}:`, error);
      }
    }
  }, {
    timezone: 'America/Panama'
  });

  cronJobs.push(dailyBriefing);

  // Weekly Trello digest — Monday 9 AM Panama time
  const weeklyDigest = cron.schedule('0 9 * * 1', async () => {
    console.log('📊 Sending weekly Trello digest...');
    for (const chatId of alertChatIds) {
      try {
        const digest = await generateWeeklyDigest();
        if (digest) {
          await bot.api.sendMessage(chatId, digest, { parse_mode: 'Markdown' });
          console.log(`   Sent weekly digest to ${chatId}`);
        }
      } catch (err) {
        console.error(`Failed to send weekly digest to ${chatId}:`, err);
      }
    }
  }, { timezone: 'America/Panama' });

  cronJobs.push(weeklyDigest);

  // Health check every 4 hours
  const healthCheck = cron.schedule('0 */4 * * *', () => {
    checkEcosystemHealth(bot);
  });
  cronJobs.push(healthCheck);

  // Fresh leads ingestion — Tuesday + Friday 7 AM Panama time
  // Pulls HN "Who is Hiring" + GitHub repos, deduplicates, classifies, imports
  const freshLeadsCron = cron.schedule('0 7 * * 2,5', async () => {
    console.log('[cron] Running fresh leads ingestion (HN + GitHub)...');
    try {
      const result = await runFreshLeadsIngestion(
        anthropic,
        ['hn', 'github'],
        async (msg) => {
          for (const id of AUTHORIZED_USERS) {
            try { await bot.api.sendMessage(id, `📬 Fresh leads cron:\n\n${msg}`); } catch {}
          }
        }
      );
      console.log(`[cron] Fresh leads done: ${result.ingested} ingested, ${result.skipped} skipped`);
    } catch (e) {
      console.error('[cron] Fresh leads error:', e);
    }
  }, { timezone: 'America/Panama' });
  cronJobs.push(freshLeadsCron);

  console.log('📅 Scheduled tasks started');
}

export function stopTelegramBot() {
  // Stop cron jobs
  for (const job of cronJobs) {
    job.stop();
  }
  cronJobs = [];
  
  if (bot) {
    bot.stop();
    console.log('🛑 Telegram bot stopped');
  }
}

export async function sendTelegramBroadcast(
  message: string,
  opts?: { parseMode?: 'Markdown' | 'HTML' | false }
): Promise<void> {
  if (!bot || alertChatIds.size === 0) return;
  const parseMode = opts?.parseMode === false ? undefined : opts?.parseMode ?? 'Markdown';
  for (const chatId of alertChatIds) {
    try {
      await bot.api.sendMessage(
        chatId,
        message,
        parseMode ? { parse_mode: parseMode } : {}
      );
    } catch (e) {
      console.error(`Broadcast to ${chatId} failed:`, e);
    }
  }
}
