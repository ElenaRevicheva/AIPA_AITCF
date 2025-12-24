import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { initializeDatabase, saveMemory, getRelevantMemory } from './database';
import { initTelegramBot } from './telegram-bot';
import * as dotenv from 'dotenv';
import express from 'express';
import { Octokit } from '@octokit/rest';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

async function notifyCMO(updateData: {
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

  if (hasCriticalIssues) {
    console.log(`🔐 Using ${AI_MODELS.critical} for critical code review...`);
    const response = await anthropic.messages.create({
      model: AI_MODELS.critical,
      max_tokens: AI_MODELS.maxTokens,
      messages: [{ role: 'user', content: aiPrompt }]
    });
    const firstContent = response.content[0];
    review = firstContent && firstContent.type === 'text' ? firstContent.text : '';
  } else {
    console.log(`⚡ Using ${AI_MODELS.standard} for standard code review...`);
    const response = await groq.chat.completions.create({
      model: AI_MODELS.standard,
      messages: [{ role: 'user', content: aiPrompt }]
    });
    review = response.choices[0]?.message?.content || '';
  }

  await saveMemory('CTO', 'code_review', {
    repo: request.repo,
    pr_number: request.pr_number,
    commit_sha: request.commit_sha,
    security_issues: securityIssues.length,
    complexity_issues: complexityIssues.length,
    performance_issues: performanceIssues.length
  }, review, {
    model_used: hasCriticalIssues ? AI_MODELS.critical : AI_MODELS.standard,
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
  app.use(express.json());
  
  // Health check & status
  app.get('/', (req, res) => {
    res.json({ 
      status: 'running', 
      service: 'CTO AIPA',
      version: '3.0.0',
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
        'Telegram Bot (Chat from phone!)'
      ],
      endpoints: {
        health: 'GET /',
        webhook: 'POST /webhook/github',
        askCTO: 'POST /ask-cto',
        cmoUpdates: 'GET /cmo-updates',
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
  
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎧 CTO AIPA v3.0 listening on http://163.192.99.45:${PORT}`);
    console.log(`📡 Webhook: http://163.192.99.45:${PORT}/webhook/github`);
    console.log(`💬 Ask CTO: http://163.192.99.45:${PORT}/ask-cto`);
    console.log(`📋 CMO Updates: http://163.192.99.45:${PORT}/cmo-updates`);
    console.log(`🏥 Health: http://163.192.99.45:${PORT}/`);
    console.log(`🤝 CMO Integration: https://vibejobhunter-production.up.railway.app/api/tech-update`);
    
    // Initialize Telegram Bot
    const telegramBot = initTelegramBot();
    if (telegramBot) {
      console.log(`📱 Telegram: Bot starting...`);
    } else {
      console.log(`📱 Telegram: Not configured (add TELEGRAM_BOT_TOKEN to .env)`);
    }
    
    console.log(`\n🤝 Ready to be your Technical Co-Founder!`);
  });
}

startCTOAIPA().catch(console.error);

export { reviewCode, askCTO };
