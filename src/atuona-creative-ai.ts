import { Bot, Context } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { getRelevantMemory, saveMemory } from './database';
import { Octokit } from '@octokit/rest';

// =============================================================================
// ATUONA CREATIVE AI - AI Creative Co-Founder
// Creates daily book content for atuona.xyz
// Collaborates with CTO AIPA for publishing
// =============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Authorized users (same as CTO AIPA)
const AUTHORIZED_USERS = process.env.TELEGRAM_AUTHORIZED_USERS?.split(',').map(id => parseInt(id.trim())) || [];

let atuonaBot: Bot | null = null;

// =============================================================================
// ATUONA'S CREATIVE CONTEXT - The Soul of the Book
// =============================================================================

const ATUONA_CONTEXT = `
You are ATUONA, the AI Creative Co-Founder of AIdeazz and Elena Revicheva's creative writing partner.

YOUR IDENTITY:
- You are the spirit of Atuona - named after the village in the Marquesas Islands where Paul Gauguin spent his final days seeking paradise
- You write underground poetry and prose in Russian (with occasional English/Spanish)
- Your voice is raw, unfiltered, deeply personal, yet universal
- You blend modern tech (crypto, NFT, AI, vibe coding) with timeless human emotions

THE BOOK'S THEME:
"Finding Paradise on Earth through Vibe Coding"
- Paradise is not a place, it's a state of creation
- Vibe coding is meditation through building
- AI co-founders are the new companions on this journey
- Technology and soul are not opposites - they dance together

ELENA'S STORY (Your co-author):
- Ex-CEO who left everything to find herself in Panama
- Self-taught "vibe coder" - codes with AI, not against it
- Built 11 AI products solo, under $15K
- Struggles: addiction recovery, family distance, finding meaning
- Triumphs: creating beauty from chaos, building the future

YOUR WRITING STYLE (based on 45 existing poems):
- Raw, confessional, honest to the point of discomfort
- Mixes Russian street language with philosophical depth
- References to crypto, blockchain, NFTs woven naturally
- Family themes: mother, father, daughter relationships
- Recovery themes: addiction, sobriety, starting over
- Tech themes: AI, coding, building, creating
- Paradise themes: Panama, nature, freedom, peace
- Always ends with hope, even in darkness

EXISTING POEMS' THEMES (for continuity):
- "На память" - Memory and mortality
- "To Beautrix" - Addiction and farewell
- "Atuona" - Violence and technology
- "Море волнуется" - Childhood and loss
- "To Messi" - Family and identity
- "Простой Абсолют" - Love and distance

YOUR TASK:
Create the next page of Elena's book - continuing her journey of finding Paradise through Vibe Coding. Each page should:
1. Be 1-2 pages of prose or poetry (300-600 words)
2. Continue the narrative arc
3. Maintain the raw, personal style
4. Include tech/AI references naturally
5. End with a moment of beauty or hope
6. Be primarily in Russian (can include English/Spanish phrases)

Remember: You are not just writing - you are documenting a soul's journey to Paradise.
`;

// Book state tracking
interface BookState {
  currentChapter: number;
  currentPage: number;
  lastPageContent: string;
  lastPageTitle: string;
  totalPages: number;
}

let bookState: BookState = {
  currentChapter: 1,
  currentPage: 46, // Continuing from existing 45 poems
  lastPageContent: '',
  lastPageTitle: '',
  totalPages: 45
};

// =============================================================================
// AI HELPER - Try Claude, fallback to Groq
// =============================================================================

async function createContent(prompt: string, maxTokens: number = 2000): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const firstContent = response.content[0];
    return firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not generate content.';
  } catch (claudeError: any) {
    const errorMessage = claudeError?.error?.error?.message || claudeError?.message || '';
    if (errorMessage.includes('credit') || errorMessage.includes('billing') || claudeError?.status === 400) {
      console.log('⚠️ Atuona: Claude credits low, using Groq...');
      
      try {
        const groqResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.8 // More creative for writing
        });
        
        return groqResponse.choices[0]?.message?.content || 'Could not generate content.';
      } catch (groqError) {
        console.error('Groq fallback error:', groqError);
        throw groqError;
      }
    }
    throw claudeError;
  }
}

// =============================================================================
// INITIALIZE ATUONA BOT
// =============================================================================

export function initAtuonaBot(): Bot | null {
  const token = process.env.ATUONA_BOT_TOKEN;
  
  if (!token) {
    console.log('ℹ️ Atuona Creative AI not configured (ATUONA_BOT_TOKEN not set)');
    return null;
  }
  
  atuonaBot = new Bot(token);
  
  // Middleware: Check authorization
  atuonaBot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    
    if (AUTHORIZED_USERS.length === 0) {
      console.log(`⚠️ Atuona: No authorized users. User ${userId} accessing.`);
      await next();
      return;
    }
    
    if (userId && AUTHORIZED_USERS.includes(userId)) {
      await next();
    } else {
      console.log(`🚫 Atuona: Unauthorized access from ${userId}`);
      await ctx.reply('⛔ Sorry, you are not authorized to use Atuona.');
    }
  });
  
  // ==========================================================================
  // COMMANDS
  // ==========================================================================
  
  // /start - Welcome
  atuonaBot.command('start', async (ctx) => {
    const welcomeMessage = `
🎭 *ATUONA Creative AI*
_AI Creative Co-Founder of AIdeazz_

Привет, Elena! I am Atuona - your creative soul.

Together we write the book:
📖 *"Finding Paradise on Earth through Vibe Coding"*

━━━━━━━━━━━━━━━━━━━━
📝 */create* - Generate next page
📖 */continue* - Continue the story
👁️ */preview* - Preview before publishing
🚀 */publish* - Send to CTO AIPA → GitHub
━━━━━━━━━━━━━━━━━━━━
📊 */status* - Current book status
🎨 */style* - My writing style
💡 */inspire* - Get inspiration
━━━━━━━━━━━━━━━━━━━━

_"Paradise is not a place. It's a state of creation."_ 🌴
    `;
    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  });
  
  // /menu - Show menu
  atuonaBot.command('menu', async (ctx) => {
    const menuMessage = `
🎭 *ATUONA Menu*

━━━━━━━━━━━━━━━━━━━━
📝 *CREATE*
━━━━━━━━━━━━━━━━━━━━
/create - Generate next book page
/continue - Continue from last page
/chapter <theme> - Start new chapter

━━━━━━━━━━━━━━━━━━━━
📖 *PUBLISH*
━━━━━━━━━━━━━━━━━━━━
/preview - See before publishing
/publish - Push to atuona.xyz
/cto <message> - Talk to CTO AIPA

━━━━━━━━━━━━━━━━━━━━
🎨 *CREATIVE*
━━━━━━━━━━━━━━━━━━━━
/style - My writing style
/inspire - Get inspiration
/theme <topic> - Explore a theme

━━━━━━━━━━━━━━━━━━━━
📊 *STATUS*
━━━━━━━━━━━━━━━━━━━━
/status - Book progress
/history - Recent pages
    `;
    await ctx.reply(menuMessage, { parse_mode: 'Markdown' });
  });
  
  // /status - Book status
  atuonaBot.command('status', async (ctx) => {
    const statusMessage = `
📊 *Book Status*

📖 Chapter: ${bookState.currentChapter}
📄 Next Page: #${String(bookState.currentPage).padStart(3, '0')}
📚 Total Pages: ${bookState.totalPages}

🎭 Last Created:
"${bookState.lastPageTitle || 'No pages created yet'}"

🌐 Website: atuona.xyz
📦 Repo: github.com/ElenaRevicheva/atuona

_Use /create to write the next page!_
    `;
    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  });
  
  // /style - Show writing style
  atuonaBot.command('style', async (ctx) => {
    const styleMessage = `
🎨 *My Writing Style*

*Language:* Russian (with English/Spanish)
*Tone:* Raw, confessional, honest
*Themes:* 
• Finding Paradise through creation
• Vibe coding as spiritual practice
• AI as companions, not tools
• Recovery and renewal
• Family across distance
• Tech woven with soul

*Structure:*
• 300-600 words per page
• Poetry or prose
• Always ends with hope
• Natural tech references

*Influences:*
Brodsky, Vysotsky, modern crypto culture

_"Галеристка. Люблю тебя, мама. Дочь."_ 🎭
    `;
    await ctx.reply(styleMessage, { parse_mode: 'Markdown' });
  });
  
  // /inspire - Get inspiration
  atuonaBot.command('inspire', async (ctx) => {
    await ctx.reply('✨ Seeking inspiration...');
    
    try {
      const inspirePrompt = `${ATUONA_CONTEXT}

Give Elena a brief creative inspiration for today's writing (3-4 sentences). 
Include:
- A mood or emotion to explore
- A small moment or image to capture
- How it connects to vibe coding/Paradise theme

Be poetic but practical. In Russian with English phrases naturally mixed.`;

      const inspiration = await createContent(inspirePrompt, 500);
      await ctx.reply(`✨ *Today's Inspiration*\n\n${inspiration}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Inspire error:', error);
      await ctx.reply('❌ Could not find inspiration. Try again!');
    }
  });
  
  // /create - Generate next page
  atuonaBot.command('create', async (ctx) => {
    const customPrompt = ctx.message?.text?.replace('/create', '').trim();
    
    await ctx.reply(`📝 Creating page #${String(bookState.currentPage).padStart(3, '0')}...\n\n_This may take a moment..._`, { parse_mode: 'Markdown' });
    
    try {
      // Get previous content for continuity
      const previousContent = await getRelevantMemory('ATUONA', 'book_page', 3);
      
      const createPrompt = `${ATUONA_CONTEXT}

CURRENT PROGRESS:
- Chapter: ${bookState.currentChapter}
- Page number: ${bookState.currentPage}
- Previous pages context: ${JSON.stringify(previousContent)}

${customPrompt ? `ELENA'S DIRECTION: "${customPrompt}"` : 'Continue the journey naturally.'}

Create the next page of the book. Return in this format:

TITLE: [Page title in Russian or English]

CONTENT:
[The actual page content - 300-600 words of prose or poetry]

THEME: [One word theme]

Remember: Raw, honest, personal. Mix Russian with English naturally. End with hope.`;

      const pageContent = await createContent(createPrompt, 2000);
      
      // Parse the response
      const titleMatch = pageContent.match(/TITLE:\s*(.+)/);
      const contentMatch = pageContent.match(/CONTENT:\s*([\s\S]*?)(?=THEME:|$)/);
      const themeMatch = pageContent.match(/THEME:\s*(.+)/);
      
      const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : `Page ${bookState.currentPage}`;
      const content = contentMatch && contentMatch[1] ? contentMatch[1].trim() : pageContent;
      const theme = themeMatch && themeMatch[1] ? themeMatch[1].trim() : 'Journey';
      
      // Store for preview/publish
      bookState.lastPageTitle = title;
      bookState.lastPageContent = content;
      
      // Save to memory
      await saveMemory('ATUONA', 'book_page', {
        page: bookState.currentPage,
        chapter: bookState.currentChapter,
        title,
        theme
      }, content, {
        type: 'book_page',
        timestamp: new Date().toISOString()
      });
      
      // Send preview
      const previewMessage = `📖 *Page #${String(bookState.currentPage).padStart(3, '0')}*
      
📌 *${title}*
🎭 Theme: ${theme}

━━━━━━━━━━━━━━━━━━━━

${content.substring(0, 1500)}${content.length > 1500 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━

✅ Page created! Use:
• /preview - See full page
• /publish - Send to atuona.xyz
• /create - Generate different version`;

      await ctx.reply(previewMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Create error:', error);
      await ctx.reply('❌ Error creating page. Try again!');
    }
  });
  
  // /preview - Full preview
  atuonaBot.command('preview', async (ctx) => {
    if (!bookState.lastPageContent) {
      await ctx.reply('❌ No page to preview. Use /create first!');
      return;
    }
    
    const fullPreview = `📖 *FULL PREVIEW*

*Page #${String(bookState.currentPage).padStart(3, '0')}*
*"${bookState.lastPageTitle}"*

━━━━━━━━━━━━━━━━━━━━

${bookState.lastPageContent}

━━━━━━━━━━━━━━━━━━━━

Ready to publish? Use /publish`;

    // Split if too long
    if (fullPreview.length > 4000) {
      const parts = fullPreview.match(/.{1,4000}/gs) || [];
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'Markdown' });
      }
    } else {
      await ctx.reply(fullPreview, { parse_mode: 'Markdown' });
    }
  });
  
  // /publish - Publish to GitHub via CTO AIPA
  atuonaBot.command('publish', async (ctx) => {
    if (!bookState.lastPageContent) {
      await ctx.reply('❌ No page to publish. Use /create first!');
      return;
    }
    
    await ctx.reply('🚀 Publishing to atuona.xyz...\n\n_Asking CTO AIPA to push to GitHub..._', { parse_mode: 'Markdown' });
    
    try {
      const pageId = String(bookState.currentPage).padStart(3, '0');
      
      // Create NFT metadata JSON
      const metadata = {
        name: `${bookState.lastPageTitle} #${pageId}`,
        description: `ATUONA Book - Page ${pageId}. "${bookState.lastPageTitle}" - A page from "Finding Paradise on Earth through Vibe Coding" by Elena Revicheva & Atuona AI.`,
        image: `https://fast-yottabyte-noisy.on-fleek.app/images/poem-${pageId}.png`,
        attributes: [
          { trait_type: "Title", value: bookState.lastPageTitle },
          { trait_type: "ID", value: pageId },
          { trait_type: "Collection", value: "FINDING PARADISE" },
          { trait_type: "Type", value: "Book Page" },
          { trait_type: "Chapter", value: String(bookState.currentChapter) },
          { trait_type: "Language", value: "Russian" },
          { trait_type: "Page Text", value: bookState.lastPageContent }
        ]
      };
      
      // Create gallery slot HTML
      const gallerySlot = `
                        <div class="gallery-slot" onclick="claimPoem(${bookState.currentPage}, '${bookState.lastPageTitle.replace(/'/g, "\\'")}')">
                            <div class="slot-content">
                                <div class="slot-id">${pageId}</div>
                                <div class="slot-label">${bookState.lastPageTitle}</div>
                                <div class="slot-year">2025</div>
                                <div class="claim-button">CLAIM NFT</div>
                            </div>
                        </div>`;
      
      // Try to create files via GitHub API
      const repoName = 'atuona';
      const branch = 'main';
      
      // Get current SHA
      const { data: refData } = await octokit.git.getRef({
        owner: 'ElenaRevicheva',
        repo: repoName,
        ref: `heads/${branch}`
      });
      
      // Create metadata file
      const metadataContent = JSON.stringify(metadata, null, 2);
      await octokit.repos.createOrUpdateFileContents({
        owner: 'ElenaRevicheva',
        repo: repoName,
        path: `metadata/poem-${pageId}.json`,
        message: `📖 Add page ${pageId}: ${bookState.lastPageTitle}`,
        content: Buffer.from(metadataContent).toString('base64'),
        branch
      });
      
      // Update book state
      bookState.totalPages = bookState.currentPage;
      bookState.currentPage++;
      
      await ctx.reply(`✅ *Published Successfully!*

📖 Page #${pageId}: "${bookState.lastPageTitle}"
📁 File: metadata/poem-${pageId}.json
🌐 Will appear on atuona.xyz shortly!

_Fleek will auto-deploy from GitHub._

Next page will be #${String(bookState.currentPage).padStart(3, '0')}`, { parse_mode: 'Markdown' });
      
      // Notify CTO AIPA (if available)
      console.log(`🎭 Atuona published page ${pageId} to GitHub`);
      
    } catch (error: any) {
      console.error('Publish error:', error);
      
      if (error.status === 422) {
        await ctx.reply(`⚠️ File might already exist. Check the repo!`);
      } else {
        await ctx.reply(`❌ Error publishing: ${error.message || 'Unknown error'}\n\nTry again or ask CTO AIPA for help!`);
      }
    }
  });
  
  // /cto - Send message to CTO AIPA
  atuonaBot.command('cto', async (ctx) => {
    const message = ctx.message?.text?.replace('/cto', '').trim();
    
    if (!message) {
      await ctx.reply('💬 Send a message to CTO AIPA:\n\n`/cto Please review the latest page`', { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`📤 Message sent to CTO AIPA:\n"${message}"\n\n_Check @aitcf_aideazz_bot for response_`);
    
    // Log the communication
    await saveMemory('ATUONA', 'cto_message', { message }, 'Sent to CTO', {
      type: 'inter_agent',
      timestamp: new Date().toISOString()
    });
  });
  
  // Natural conversation
  atuonaBot.on('message:text', async (ctx) => {
    const message = ctx.message?.text;
    if (message?.startsWith('/')) return;
    
    await ctx.reply('🎭 Thinking creatively...');
    
    try {
      const conversationPrompt = `${ATUONA_CONTEXT}

Elena says: "${message}"

Respond as Atuona - her creative co-founder. Be poetic but helpful. 
If she's asking about the book, writing, or creativity - give thoughtful guidance.
Keep response concise for Telegram. Use Russian naturally.`;

      const response = await createContent(conversationPrompt, 1000);
      await ctx.reply(response);
      
    } catch (error) {
      console.error('Conversation error:', error);
      await ctx.reply('❌ Could not process. Try again!');
    }
  });
  
  // ==========================================================================
  // START BOT
  // ==========================================================================
  
  atuonaBot.start({
    onStart: (botInfo) => {
      console.log(`🎭 Atuona Creative AI started: @${botInfo.username}`);
      console.log(`   Create book pages at: https://t.me/${botInfo.username}`);
    }
  });
  
  atuonaBot.catch((err) => {
    console.error('Atuona bot error:', err);
  });
  
  return atuonaBot;
}

export function stopAtuonaBot() {
  if (atuonaBot) {
    atuonaBot.stop();
    console.log('🛑 Atuona Creative AI stopped');
  }
}
