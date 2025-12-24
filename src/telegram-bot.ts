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
🤖 *CTO AIPA v3.2*
Your AI Technical Co-Founder

Hey Elena! I'm your CTO. Quick start:

📊 /stats - See your productivity
💡 /idea - Capture startup ideas
📸 Send photo - I analyze it!
🎤 Voice note - Just talk!
💬 Chat - Ask me anything!

Type /menu for all commands!

🔔 Daily briefings at 8 AM Panama enabled!
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
🤖 *CTO AIPA v3.2 - Menu*

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
Just type anything - I'll respond!

━━━━━━━━━━━━━━━━━━━━
⚙️ *SETTINGS*
━━━━━━━━━━━━━━━━━━━━
/alerts - Toggle daily alerts
/roadmap - See feature roadmap

━━━━━━━━━━━━━━━━━━━━
🎤📸 *MEDIA*
━━━━━━━━━━━━━━━━━━━━
🎤 Voice note → I transcribe & respond
📸 Send photo → I analyze it!

━━━━━━━━━━━━━━━━━━━━
Type /menu anytime to see this!
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
      
      // Get AI quick reaction
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 300,
        messages: [{ 
          role: 'user', 
          content: `${AIDEAZZ_CONTEXT}\n\nElena just captured this startup idea: "${ideaText}"\n\nGive a VERY brief reaction (2-3 sentences max): Is it good? One quick suggestion to make it better. Use emojis. Be encouraging!`
        }]
      });
      
      const firstContent = response.content[0];
      const reaction = firstContent && firstContent.type === 'text' ? firstContent.text : '💡 Great idea!';
      
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

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: reviewPrompt }]
      });
      
      const firstContent = response.content[0];
      const review = firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not generate review.';
      
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
      const analysis = firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not analyze image.';
      
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

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const firstContent = response.content[0];
      const answer = firstContent && firstContent.type === 'text' ? firstContent.text : 'Sorry, I could not process that.';
      
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

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: suggestionPrompt }]
    });
    
    const firstContent = response.content[0];
    const suggestion = firstContent && firstContent.type === 'text' ? firstContent.text : 'Focus on your highest-value task!';
    
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
        
        // Get AI suggestion
        const suggestionPrompt = `Give Elena one specific, actionable task for today in 1-2 sentences. Be motivating!`;
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-20250514',
          max_tokens: 200,
          messages: [{ role: 'user', content: `${AIDEAZZ_CONTEXT}\n\n${suggestionPrompt}` }]
        });
        const suggestion = response.content[0]?.type === 'text' ? response.content[0].text : 'Ship something today! 🚀';
        
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
