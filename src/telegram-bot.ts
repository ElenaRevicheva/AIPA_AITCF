import { Bot, Context } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import { getRelevantMemory, saveMemory } from './database';
import { Octokit } from '@octokit/rest';

// =============================================================================
// TELEGRAM BOT FOR CTO AIPA
// Chat with your AI Technical Co-Founder from your phone!
// =============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Authorized users (Telegram user IDs) - add your ID for security
const AUTHORIZED_USERS = process.env.TELEGRAM_AUTHORIZED_USERS?.split(',').map(id => parseInt(id.trim())) || [];

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

let bot: Bot | null = null;

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
    const welcomeMessage = `
🤖 *CTO AIPA v3.0*
Your AI Technical Co-Founder

Hey! I'm your CTO. Here's what I can do:

📊 */status* - AIdeazz ecosystem status
💬 */ask* <question> - Ask me anything
🔍 */review* <repo> - Review latest commit
📋 */repos* - List all repositories
💡 */suggest* - Get a suggestion for today
ℹ️ */help* - Show all commands

Or just send me a message and I'll help! 🚀
    `;
    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  });
  
  // /help - Show commands
  bot.command('help', async (ctx) => {
    const helpMessage = `
🆘 *CTO AIPA Commands*

*/status* - Check AIdeazz ecosystem health
*/ask* <question> - Ask any technical question
*/review* <repo> - Review latest commit in a repo
*/repos* - List all 11 repositories
*/suggest* - Get today's suggestion
*/roadmap* - See technical roadmap

💬 *Or just chat naturally!*
"What should I focus on?"
"How do I add caching to EspaLuz?"
"Review my architecture"
    `;
    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
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
• Telegram bot (You're using it!)

🔄 *In Progress*
• Daily briefings
• Auto-dependency updates

📋 *Planned*
• Test generation
• Performance monitoring
• Multi-agent collaboration

💡 Use */suggest* for today's priority!
    `;
    await ctx.reply(roadmapMessage, { parse_mode: 'Markdown' });
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
    
    await handleQuestion(ctx, message || '');
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
  // START BOT
  // ==========================================================================
  
  bot.start({
    onStart: (botInfo) => {
      console.log(`🤖 Telegram bot started: @${botInfo.username}`);
      console.log(`   Chat with your CTO at: https://t.me/${botInfo.username}`);
    }
  });
  
  bot.catch((err) => {
    console.error('Telegram bot error:', err);
  });
  
  return bot;
}

export function stopTelegramBot() {
  if (bot) {
    bot.stop();
    console.log('🛑 Telegram bot stopped');
  }
}
