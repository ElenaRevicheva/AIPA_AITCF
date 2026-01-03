import { Bot, Context } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
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
  getHealthHistory
} from './database';
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
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Authorized users (Telegram user IDs) - add your ID for security
const AUTHORIZED_USERS = process.env.TELEGRAM_AUTHORIZED_USERS?.split(',').map(id => parseInt(id.trim())) || [];

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
};

// Helper to resolve repo name (supports aliases and case-insensitive matching)
function resolveRepoName(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  
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
  
  async function showMenu(ctx: Context) {
    const menuMessage = `
🤖 *CTO AIPA v4.0 - Menu*

━━━━━━━━━━━━━━━━━━━━
🧠 *STRATEGIC CTO*
━━━━━━━━━━━━━━━━━━━━
/strategy - Ecosystem analysis
/priorities - Today's focus
/think - Deep thinking
/suggest - Quick suggestion

━━━━━━━━━━━━━━━━━━━━
🏥 *MONITORING*
━━━━━━━━━━━━━━━━━━━━
/health - Check services
/logs - Analyze logs

━━━━━━━━━━━━━━━━━━━━
📚 *LEARNING*
━━━━━━━━━━━━━━━━━━━━
/feedback - Teach me!
/lessons - What I learned

━━━━━━━━━━━━━━━━━━━━
🖥️ *CURSOR AGENT*
━━━━━━━━━━━━━━━━━━━━
/cursor - Step-by-step guide
/build - Multi-step plan
/diff - Before/after code

━━━━━━━━━━━━━━━━━━━━
📖 *LEARN CODE*
━━━━━━━━━━━━━━━━━━━━
/study - Quiz on your code
/explainfile - Explain a file
/architecture - Repo structure
/error - Debug errors
/howto - How-to guides
/cmd - Command cheatsheet

━━━━━━━━━━━━━━━━━━━━
🎓 *LEARN CONCEPTS*
━━━━━━━━━━━━━━━━━━━━
/learn - Pick a topic
/exercise - Coding challenge
/explain - Explain anything

━━━━━━━━━━━━━━━━━━━━
💻 *CODE GENERATION*
━━━━━━━━━━━━━━━━━━━━
/code - Generate code
/fix - Fix bugs
/approve - Create PR
/reject - Discard code
/pending - Check pending

━━━━━━━━━━━━━━━━━━━━
🏛️ *DECISIONS*
━━━━━━━━━━━━━━━━━━━━
/decision - Record decision
/debt - Track tech debt
/review - Review commits

━━━━━━━━━━━━━━━━━━━━
📊 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━
/stats - Weekly metrics
/daily - Morning briefing
/status - System status

━━━━━━━━━━━━━━━━━━━━
🔍 *REPOS & IDEAS*
━━━━━━━━━━━━━━━━━━━━
/repos - List repositories
/idea - Save idea
/ideas - View ideas

━━━━━━━━━━━━━━━━━━━━
💬 *CHAT*
━━━━━━━━━━━━━━━━━━━━
/ask - Ask anything
🎤 Voice - Send voice note
📸 Photo - Send screenshot

━━━━━━━━━━━━━━━━━━━━
⚙️ /alerts | /roadmap
    `;
    await ctx.reply(menuMessage, { parse_mode: 'Markdown' });
  }
  
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
  
  // /repos - List repositories
  bot.command('repos', async (ctx) => {
    const reposMessage = `
📦 *AIdeazz Repositories (11)*

1️⃣ *AIPA\\_AITCF* - CTO AIPA (You're talking to me!)
2️⃣ *VibeJobHunterAIPA\\_AIMCF* - CMO AIPA
3️⃣ *EspaLuzWhatsApp* - Spanish Tutor 💰
4️⃣ *EspaLuz\\_Influencer* - Marketing
5️⃣ *EspaLuzFamilybot* - Family Bot
6️⃣ *aideazz* - Main Website
7️⃣ *dragontrade-agent* - Trading Bot
8️⃣ *atuona* - NFT Gallery
9️⃣ *ascent-saas-builder* - SaaS Tool
🔟 *aideazz-private-docs* - Docs
1️⃣1️⃣ *aideazz-pitch-deck* - Pitch

Use */review* <repo-name> to review latest commit!
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
    
    // Check if first word is a repo name
    let repoName: string;
    let task: string;
    
    if (AIDEAZZ_REPOS.includes(firstWord)) {
      repoName = firstWord;
      task = parts.slice(1).join(' ');
    } else {
      // No repo specified, try to guess from task or use default
      repoName = 'AIPA_AITCF';
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
      
      try {
        const { data: contents } = await octokit.repos.getContent({
          owner: 'ElenaRevicheva',
          repo: repoName,
          path: ''
        });
        
        if (Array.isArray(contents)) {
          fileList = contents.map((f: any) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n');
          relevantFiles = contents.filter((f: any) => 
            f.type === 'file' && /\.(ts|js|tsx|jsx)$/.test(f.name)
          ).map((f: any) => f.name);
        }
      } catch {}
      
      // Try to get src folder
      let srcFiles: string[] = [];
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
      
      const allCodeFiles = [...relevantFiles, ...srcFiles];
      
      // Fetch a key file for context (like the main bot file or index)
      let sampleCode = '';
      const mainFile = srcFiles.find(f => f.includes('telegram-bot') || f.includes('index')) 
                    || relevantFiles.find(f => f.includes('index'))
                    || allCodeFiles[0];
      
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
      
      // Generate Cursor instructions using AI
      const cursorPrompt = `You are helping a vibe coder use LOCAL Cursor (without paid agents) to edit their code.

TASK: "${task}"
REPO: ${repoName}

FILES IN REPO:
${fileList}

CODE FILES: ${allCodeFiles.join(', ')}

${sampleCode ? `SAMPLE FROM ${mainFile}:\n\`\`\`\n${sampleCode.substring(0, 2000)}\n\`\`\`` : ''}

Generate STEP-BY-STEP instructions for LOCAL Cursor. Format EXACTLY like this:

📂 *STEP 1: Open the project*
\`\`\`
cd ~/path-to/${repoName}
cursor .
\`\`\`

📄 *STEP 2: Open file*
Open: \`<filename>\`

✂️ *STEP 3: Select code*
Find and select this section:
\`\`\`
<code to select>
\`\`\`

⌨️ *STEP 4: Cmd+K prompt*
Select the code above, press Cmd+K, and type:
\`\`\`
<exact prompt to type>
\`\`\`

📋 *STEP 5: Or copy this code*
If Cmd+K doesn't work well, copy this and paste:
\`\`\`typescript
<complete code to add/replace>
\`\`\`

💾 *STEP 6: Save and test*
- Save: Cmd+S
- Build: \`npm run build\`
- Test: <how to test>

IMPORTANT:
- Give SPECIFIC file names from the repo
- Give COMPLETE, working code (not pseudocode)
- Explain WHERE in the file to add/edit
- Use simple Cmd+K prompts (Cursor free tier works with these)
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
    
    // Parse repo and feature
    const parts = input.split(' ');
    const firstWord = parts[0] || '';
    
    let repoName: string;
    let feature: string;
    
    if (AIDEAZZ_REPOS.includes(firstWord)) {
      repoName = firstWord;
      feature = parts.slice(1).join(' ');
    } else {
      repoName = 'AIPA_AITCF';
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
        model: 'claude-3-haiku-20240307',
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
  // NATURAL CONVERSATION (any text message)
  // ==========================================================================
  
  bot.on('message:text', async (ctx) => {
    const message = ctx.message?.text;
    
    // Ignore commands (they're handled above)
    if (message?.startsWith('/')) return;
    
    // Register for alerts when user chats
    if (ctx.chat?.id) alertChatIds.add(ctx.chat.id);
    
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
      
      // Process the transcribed message
      await handleQuestion(ctx, transcription);
      
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
    
    await ctx.reply('🧠 Thinking...');
    
    try {
      const context = await getRelevantMemory('CTO', 'telegram_qa', 3);
      
      const prompt = `${AIDEAZZ_CONTEXT}

Elena is messaging you on Telegram. Keep your response concise and chat-friendly (not too long - this is mobile!). Use emojis. Be helpful but brief.

Her message: "${question}"

Previous context: ${JSON.stringify(context)}

Respond naturally as her CTO co-founder would. If she asks something complex, give the key points first, then offer to elaborate.`;

      // Use askAI with automatic Claude->Groq fallback
      const answer = await askAI(prompt, 1500);
      
      // Save to memory
      await saveMemory('CTO', 'telegram_qa', { question }, answer, {
        platform: 'telegram',
        user_id: ctx.from?.id,
        timestamp: new Date().toISOString()
      });
      
      // Split long messages (Telegram has 4096 char limit)
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
  // START BOT & SCHEDULED TASKS
  // ==========================================================================
  
  bot.start({
    onStart: async (botInfo) => {
      console.log(`🤖 Telegram bot started: @${botInfo.username}`);
      console.log(`   Chat with your CTO at: https://t.me/${botInfo.username}`);
      console.log(`   📅 Daily briefing: 8 AM Panama time`);
      console.log(`   🎤 Voice messages: Enabled`);
      
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
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      language: 'en',
      response_format: 'text'
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
    
    // 4. Format briefing
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

📁 *Recent Activity*
${activityLines}
${alertsSection}
💡 *Today's Focus*
${suggestion}

_Use /daily anytime for an update!_`;

    await ctx.reply(briefing, { parse_mode: 'Markdown' });
    
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
  
  // Check CMO AIPA
  try {
    const cmoResponse = await fetch('https://vibejobhunter-production.up.railway.app/health', {
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
        
        if (daysAgo > 5) {
          staleRepos.push(`${escapeMarkdown(repo)} (${daysAgo} days)`);
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
          const cmoResponse = await fetch('https://vibejobhunter-production.up.railway.app/health');
          cmoStatus = cmoResponse.ok ? '✅' : '⚠️';
        } catch {
          cmoStatus = '❌';
        }
        
        // Get recent activity
        const recentRepos: string[] = [];
        for (const repo of AIDEAZZ_REPOS.slice(0, 3)) {
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
              recentRepos.push(`• ${escapeMarkdown(repo)}: ${daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}`);
            }
          } catch {}
        }
        
        // Get AI suggestion (with Groq fallback)
        const suggestionPrompt = `${AIDEAZZ_CONTEXT}\n\nGive Elena one specific, actionable task for today in 1-2 sentences. Be motivating!`;
        const suggestion = await askAI(suggestionPrompt, 200);
        
        const briefing = `${greeting}

📊 *Status*
CTO: ✅ | CMO: ${cmoStatus}

📁 *Activity*
${recentRepos.join('\n')}

💡 *Today*
${suggestion}

_/daily for full briefing_`;

        await bot.api.sendMessage(chatId, briefing, { parse_mode: 'Markdown' });
        console.log(`   Sent daily briefing to ${chatId}`);
        
      } catch (error) {
        console.error(`Failed to send daily briefing to ${chatId}:`, error);
      }
    }
  }, {
    timezone: 'America/Panama'
  });
  
  cronJobs.push(dailyBriefing);
  
  // Health check every 4 hours
  const healthCheck = cron.schedule('0 */4 * * *', () => {
    checkEcosystemHealth(bot);
  });
  
  cronJobs.push(healthCheck);
  
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
