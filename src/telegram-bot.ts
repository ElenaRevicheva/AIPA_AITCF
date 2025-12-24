import { Bot, Context } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { getRelevantMemory, saveMemory } from './database';
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

let bot: Bot | null = null;
let cronJobs: cron.ScheduledTask[] = [];

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
🤖 *CTO AIPA v3.3 - Menu*

━━━━━━━━━━━━━━━━━━━━
🎓 *LEARN TO CODE* 🆕
━━━━━━━━━━━━━━━━━━━━
/learn - Pick a coding topic
/learn typescript - Learn TS
/exercise - Get coding challenge
/explain <concept> - Explain anything

━━━━━━━━━━━━━━━━━━━━
💻 *CTO WRITES CODE* 🆕
━━━━━━━━━━━━━━━━━━━━
/code <repo> <task> - I create PR!
/fix <repo> <issue> - I fix bugs!

━━━━━━━━━━━━━━━━━━━━
📊 *INSIGHTS*
━━━━━━━━━━━━━━━━━━━━
/stats - Weekly ecosystem metrics
/daily - Morning briefing & focus
/status - Service health check

━━━━━━━━━━━━━━━━━━━━
💡 *IDEAS & NOTES*
━━━━━━━━━━━━━━━━━━━━
/idea <text> - Save a startup idea
/ideas - View all saved ideas

━━━━━━━━━━━━━━━━━━━━
🔍 *CODE & REPOS*
━━━━━━━━━━━━━━━━━━━━
/review <repo> - Review latest commit
/repos - List all 11 repositories

━━━━━━━━━━━━━━━━━━━━
💬 *ASK & CHAT*
━━━━━━━━━━━━━━━━━━━━
/ask <question> - Ask any question
/suggest - Get today's suggestion

━━━━━━━━━━━━━━━━━━━━
🎤📸 *MEDIA*
━━━━━━━━━━━━━━━━━━━━
🎤 Voice note → I listen & respond
📸 Send photo → I analyze it!

━━━━━━━━━━━━━━━━━━━━
⚙️ /alerts /roadmap
━━━━━━━━━━━━━━━━━━━━
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
      await ctx.reply('❓ Please provide a question!\n\nExample: `/ask Should I use Redis for caching?`', { parse_mode: 'Markdown' });
      return;
    }
    
    await handleQuestion(ctx, question);
  });
  
  // /suggest - Get a suggestion
  bot.command('suggest', async (ctx) => {
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
    
    if (alertChatIds.has(chatId)) {
      alertChatIds.delete(chatId);
      await ctx.reply('🔕 Proactive alerts *disabled*. You won\'t receive automatic notifications.\n\nUse /alerts again to re-enable.', { parse_mode: 'Markdown' });
    } else {
      alertChatIds.add(chatId);
      await ctx.reply('🔔 Proactive alerts *enabled*! You\'ll receive:\n\n• ☀️ Morning briefing (8 AM Panama)\n• ⚠️ Stale repo warnings\n• 🚨 Service down alerts\n\nUse /alerts again to disable.', { parse_mode: 'Markdown' });
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
      const topicsMessage = `🎓 *Learn to Code with CTO AIPA*

Choose a topic to start learning:

*Beginner*
/learn typescript - Modern JavaScript
/learn python - AI/ML favorite
/learn git - Version control basics

*Intermediate*
/learn api - Build REST APIs
/learn database - SQL & NoSQL
/learn testing - Write tests

*Advanced*
/learn architecture - System design
/learn security - Secure coding
/learn ai - AI/ML integration

*AIdeazz Specific*
/learn cursor - Master Cursor AI
/learn whatsapp - WhatsApp bot dev
/learn oracle - Oracle Cloud basics

Pick one and let's start! 🚀`;
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
      await ctx.reply(`💻 *CTO Code Generator*

I'll write code and create a PR for you!

Usage:
/code <repo> <what to build>

Examples:
/code atuona Add a beautiful README
/code EspaLuzWhatsApp Add error handling to API calls
/code AIPA_AITCF Add /ping command to Telegram bot

I'll create a branch, write the code, and open a PR! 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and task
    const parts = input.split(' ');
    const repoName = parts[0];
    const task = parts.slice(1).join(' ');
    
    if (!repoName || !task) {
      await ctx.reply('❌ Please provide both repo and task!\n\nExample: /code atuona Add README with project description');
      return;
    }
    
    await ctx.reply(`💻 Working on "${task}" for ${repoName}...\n\n⏳ This may take a minute...`);
    
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
      
      // 4. Create a new branch
      const branchName = `cto-aipa/${Date.now()}`;
      
      // Get the SHA of the default branch
      const { data: refData } = await octokit.git.getRef({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: `heads/${defaultBranch}`
      });
      
      // Create new branch
      await octokit.git.createRef({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha
      });
      
      // 5. Create or update the file
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
        // File doesn't exist, that's fine
      }
      
      const createFileParams: any = {
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filename,
        message: commitMessage,
        content: Buffer.from(code).toString('base64'),
        branch: branchName
      };
      
      if (fileSha) {
        createFileParams.sha = fileSha;
      }
      
      await octokit.repos.createOrUpdateFileContents(createFileParams);
      
      // 6. Create PR
      const { data: pr } = await octokit.pulls.create({
        owner: 'ElenaRevicheva',
        repo: repoName,
        title: prTitle,
        body: `${prBody}\n\n---\n🤖 *Generated by CTO AIPA*\nRequested via Telegram`,
        head: branchName,
        base: defaultBranch
      });
      
      await ctx.reply(`✅ *PR Created!*

📁 File: ${filename}
🔀 Branch: ${branchName}
📝 PR: #${pr.number}

🔗 Review it here:
${pr.html_url}

Check the code and merge when ready! 🚀`, { parse_mode: 'Markdown' });
      
      // Save to memory
      await saveMemory('CTO', 'code_generation', {
        repo: repoName,
        task,
        filename,
        pr_number: pr.number
      }, `Created PR #${pr.number}`, {
        platform: 'telegram',
        type: 'code_generation',
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
  
  // /fix - Fix an issue and create PR
  bot.command('fix', async (ctx) => {
    const input = ctx.message?.text?.replace('/fix', '').trim();
    
    if (!input) {
      await ctx.reply(`🔧 *CTO Bug Fixer*

I'll fix issues and create a PR!

Usage:
/fix <repo> <issue to fix>

Examples:
/fix EspaLuzWhatsApp Fix the timeout error in API calls
/fix atuona Add missing error handling
/fix AIPA_AITCF Fix TypeScript compilation warnings

I'll analyze the code, fix the issue, and open a PR! 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Parse repo and issue
    const parts = input.split(' ');
    const repoName = parts[0];
    const issue = parts.slice(1).join(' ');
    
    if (!repoName || !issue) {
      await ctx.reply('❌ Please provide both repo and issue!\n\nExample: /fix EspaLuzWhatsApp Fix timeout errors');
      return;
    }
    
    await ctx.reply(`🔧 Analyzing "${issue}" in ${repoName}...\n\n⏳ Looking at the code...`);
    
    // Reuse the /code logic with fix context
    await ctx.reply(`🔧 Working on fixing "${issue}" in ${repoName}...\n\n⏳ Analyzing code and creating fix...`);
    
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
      
      // Create branch
      const branchName = `cto-fix/${Date.now()}`;
      
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
      } catch {}
      
      // Create/update file
      const createFileParams: any = {
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: filename,
        message: commitMessage,
        content: Buffer.from(code).toString('base64'),
        branch: branchName
      };
      
      if (fileSha) {
        createFileParams.sha = fileSha;
      }
      
      await octokit.repos.createOrUpdateFileContents(createFileParams);
      
      // Create PR
      const { data: pr } = await octokit.pulls.create({
        owner: 'ElenaRevicheva',
        repo: repoName,
        title: `🔧 Fix: ${issue}`,
        body: `Automated fix by CTO AIPA\n\n**Issue:** ${issue}\n\n---\n🤖 Generated via Telegram`,
        head: branchName,
        base: defaultBranch
      });
      
      await ctx.reply(`✅ *Fix PR Created!*

🔧 Issue: ${issue}
📁 File: ${filename}
📝 PR: #${pr.number}

🔗 Review: ${pr.html_url}

Check and merge when ready! 🚀`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Fix error:', error);
      await ctx.reply(`❌ Error creating fix: ${error.message || 'Unknown error'}\n\nTry using Cursor for complex fixes!`);
    }
  });
  
  // /review - Review latest commit
  bot.command('review', async (ctx) => {
    const repoName = ctx.message?.text?.replace('/review', '').trim();
    
    if (!repoName) {
      await ctx.reply('❓ Please provide a repo name!\n\nExample: `/review EspaLuzWhatsApp`', { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`🔍 Reviewing latest commit in ${repoName}...`);
    
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
      
      // Ask CTO to review
      const reviewPrompt = `${AIDEAZZ_CONTEXT}

Review this commit briefly (for Telegram, keep it concise - max 3-4 bullet points):

Repo: ${repoName}
Commit: ${commitSha}
Message: ${commitMessage}
Date: ${commitDate}

Diff (truncated):
${diff}

Give a quick review with:
• What changed (1 line)
• Any issues spotted
• One suggestion
• Overall verdict (👍 or ⚠️ or ❌)`;

      // Use askAI with Groq fallback
      const review = await askAI(reviewPrompt, 1000);
      
      // Escape special characters for Telegram
      const safeCommitMessage = commitMessage.replace(/[_*`\[\]()~>#+\-=|{}.!]/g, '\\$&');
      const safeRepoName = repoName.replace(/[_*`\[\]()~>#+\-=|{}.!]/g, '\\$&');
      
      const reviewMessage = `🔍 Review: ${safeRepoName}
📝 Commit: ${commitSha}
💬 "${safeCommitMessage.substring(0, 100)}"

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
    onStart: (botInfo) => {
      console.log(`🤖 Telegram bot started: @${botInfo.username}`);
      console.log(`   Chat with your CTO at: https://t.me/${botInfo.username}`);
      console.log(`   📅 Daily briefing: 8 AM Panama time`);
      console.log(`   🔔 Proactive alerts: Enabled`);
      console.log(`   🎤 Voice messages: Enabled`);
      
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
      `• ${r.repo}: ${r.days === 0 ? 'Today' : r.days === 1 ? 'Yesterday' : `${r.days}d ago`}`
    ).join('\n');
    
    const alertsSection = staleRepos.length > 0 
      ? `\n⚠️ *Needs Attention*\n${staleRepos.map(r => `• ${r} (>7 days)`).join('\n')}\n` 
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
          staleRepos.push(`${repo} (${daysAgo} days)`);
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
              recentRepos.push(`• ${repo}: ${daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}`);
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
