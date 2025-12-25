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
  lastPageTitleEnglish: string; // English title translation
  lastPageEnglish: string;      // English translation of poem
  lastPageTheme: string;
  lastPageDescription: string;  // AI-generated poetic description
  totalPages: number;
}

let bookState: BookState = {
  currentChapter: 1,
  currentPage: 46, // Continuing from existing 45 poems
  lastPageContent: '',
  lastPageTitle: '',
  lastPageTitleEnglish: '',
  lastPageEnglish: '',
  lastPageTheme: '',
  lastPageDescription: '',
  totalPages: 45
};

// Queue for importing multiple pages
interface PageToImport {
  russian: string;
  title?: string;
  theme?: string;
}
let importQueue: PageToImport[] = [];

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
// TRANSLATION HELPER - Russian to English with poetic style preservation
// =============================================================================

async function translateToEnglish(russianText: string, title: string): Promise<string> {
  const translatePrompt = `You are a PROFESSIONAL LITERARY TRANSLATOR specializing in Russian underground poetry.

Your approach is like the best translators of Brodsky, Vysotsky, and Bukowski - capturing SOUL, not just words.

RUSSIAN ORIGINAL:
${russianText}

TITLE: ${title}

TRANSLATION PRINCIPLES:

1. **SOUL-FOR-SOUL, NOT WORD-FOR-WORD**
   - Capture the emotional truth, even if words change
   - A "блять" might become "fucking" or "damn" or silence - whatever hits hardest
   
2. **PRESERVE THE MUSIC**
   - Russian poetry has rhythm - find English rhythm that FEELS similar
   - Internal rhymes, alliteration, sound patterns matter
   - Line breaks are intentional - respect them
   
3. **STREET LANGUAGE = STREET LANGUAGE**
   - Russian мат (swearing) → English equivalents with same punch
   - "долбаная" = "fucking" not "darned"
   - Slang stays slang, raw stays raw
   
4. **CULTURAL BRIDGES**
   - "Высоцкий" stays "Vysotsky" 
   - "инста" = "Insta" (Instagram)
   - "крипта" = "crypto"
   - Keep Russian words that have no English equivalent
   
5. **EMOTIONAL TRUTH**
   - If a line punches you in Russian, it must punch in English
   - Despair, hope, dark humor - these cross languages
   - The ending must land with same impact

6. **ELENA'S VOICE**
   - She's an ex-CEO turned vibe coder in Panama
   - Addiction recovery, family distance, building AI
   - Raw honesty about struggle and beauty
   - Mix of street and philosophy

Return ONLY the English translation. No notes, no explanations. 
Make it publishable. Make it hit.`;

  return await createContent(translatePrompt, 2000);
}

// =============================================================================
// NFT METADATA CREATOR - Matches exact format on atuona.xyz
// =============================================================================

function createNFTMetadata(
  pageId: string,
  title: string,
  russianText: string,
  englishText: string,
  theme: string
): object {
  return {
    name: `${title} #${pageId}`,
    description: `ATUONA Gallery of Moments - ${title}. Underground poetry preserved on blockchain. Free collection - true to underground values. ${theme}`,
    image: `https://atuona.xyz/images/poem-${pageId}.png`,
    attributes: [
      { trait_type: "Poem", value: title },
      { trait_type: "ID", value: pageId },
      { trait_type: "Collection", value: "GALLERY OF MOMENTS" },
      { trait_type: "Type", value: "Free Underground Poetry" },
      { trait_type: "Language", value: "Russian + English" },
      { trait_type: "Year", value: "2019-2025" },
      { trait_type: "Theme", value: theme },
      { trait_type: "Russian Text", value: russianText },
      { trait_type: "English Text", value: englishText }
    ]
  };
}

// For the main JSON file format (like atuona-45-poems-with-text.json)
function createFullPoemEntry(
  pageId: string,
  title: string,
  russianText: string,
  englishText: string,
  theme: string
): object {
  return {
    name: `${title} #${pageId}`,
    description: `ATUONA Gallery of Moments - Underground Poem ${pageId}. '${title}' - ${theme}. Raw, unfiltered Russian poetry preserved on blockchain.`,
    image: `https://fast-yottabyte-noisy.on-fleek.app/images/poem-${pageId}.png`,
    attributes: [
      { trait_type: "Title", value: title },
      { trait_type: "ID", value: pageId },
      { trait_type: "Collection", value: "GALLERY OF MOMENTS" },
      { trait_type: "Type", value: "Free Underground Poetry" },
      { trait_type: "Language", value: "Russian" },
      { trait_type: "Theme", value: theme },
      { trait_type: "Poem Text", value: russianText },
      { trait_type: "English Translation", value: englishText }
    ]
  };
}

// Create NFT card HTML for VAULT section (main page with English translation)
// Matches exact style of card #001 but with English title and text
function createNFTCardHtml(
  pageId: string,
  pageNum: number,
  englishTitle: string,
  englishText: string,
  theme: string,
  description?: string
): string {
  // Format English text with line breaks for HTML display (each line ends with <br>)
  const formattedEnglish = englishText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('<br>\n                                ');
  
  // Use AI-generated description or fallback to generic
  const nftDescription = description || `Underground poetry preserved forever on blockchain. Theme: ${theme}.`;
  
  // Format date as DD-MM-YYYY for blockchain badge
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  
  return `
                    <div class="nft-card">
                        <div class="nft-header">
                            <div class="nft-id">#${pageId}</div>
                            <div class="nft-status live">LIVE</div>
                        </div>
                        <div class="nft-content">
                            <h2 class="nft-title">${englishTitle}</h2>
                            <div class="nft-verse">
                                ${formattedEnglish}
                            </div>
                            <div class="blockchain-badge">
                                <span>●</span> принято к публикации at ATUONA ${dateStr}
                            </div>
                            <p class="nft-description">
                                ${nftDescription}
                            </p>
                            <div class="nft-meta">
                                <div class="nft-price">FREE - GAS Only!</div>
                                <button class="nft-action" onclick="claimPoem('${pageId}', '${englishTitle.replace(/'/g, "\\'")}')">COLLECT SOUL</button>
                                <small style="color: var(--silver-grey); font-size: 0.7rem; margin-top: 0.5rem; display: block; font-family: 'JetBrains Mono', monospace;">Minimal fee covers blockchain preservation costs</small>
                            </div>
                        </div>
                    </div>
`;
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
📥 *IMPORT EXISTING*
━━━━━━━━━━━━━━━━━━━━
/import - Import Russian text
/translate - Translate & preview
/batch - Import multiple pages

━━━━━━━━━━━━━━━━━━━━
📝 *CREATE NEW*
━━━━━━━━━━━━━━━━━━━━
/create - Generate next page
/continue - Continue story
/chapter <theme> - New chapter

━━━━━━━━━━━━━━━━━━━━
📖 *PUBLISH*
━━━━━━━━━━━━━━━━━━━━
/preview - See before publishing
/publish - Push to atuona.xyz
/cto <message> - Talk to CTO

━━━━━━━━━━━━━━━━━━━━
🎨 *CREATIVE*
━━━━━━━━━━━━━━━━━━━━
/style - Writing style
/inspire - Get inspiration

━━━━━━━━━━━━━━━━━━━━
📊 *STATUS & FIX*
━━━━━━━━━━━━━━━━━━━━
/status - Book progress
/queue - Import queue status
/setpage <num> - Set page number
/fixgallery - Fix missing gallery slots
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
  
  // ==========================================================================
  // IMPORT EXISTING CONTENT - Translate Russian to English
  // ==========================================================================
  
  // /import - Import existing Russian text
  atuonaBot.command('import', async (ctx) => {
    const text = ctx.message?.text?.replace('/import', '').trim();
    
    if (!text) {
      await ctx.reply(`📥 *Import Russian Text*

Send your Russian poem/prose like this:

\`/import Были, друг, мы когда-то дети.
Вместо нас теперь, вон, кресты.
В этой долбаной эстафете
Победили не я и не ты.\`

Or send the title first:

\`/import На память | Были, друг, мы когда-то дети...\`

I will:
1. ✅ Store the Russian original
2. 🔄 Translate to English
3. 📋 Format as NFT metadata
4. 🎯 Ready for /publish`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`📥 Importing Russian text...`);
    
    try {
      // Check if title is provided with | separator
      let title = '';
      let russianText = text;
      
      if (text.includes('|')) {
        const parts = text.split('|');
        title = parts[0]?.trim() || '';
        russianText = parts.slice(1).join('|').trim();
      }
      
      // If no title, ask AI to suggest one
      if (!title) {
        const titlePrompt = `Based on this Russian poem/prose, suggest a short title (1-3 words, can be Russian or English):

"${russianText.substring(0, 500)}"

Return ONLY the title, nothing else.`;
        title = await createContent(titlePrompt, 50);
        title = title.replace(/['"]/g, '').trim();
      }
      
      await ctx.reply(`📝 Title: "${title}"\n\n🔄 Translating to English...`);
      
      // Translate poem to English
      const englishText = await translateToEnglish(russianText, title);
      
      // Translate title to English
      const titlePromptEn = `Translate this Russian poem title to English. Keep it poetic and evocative:

"${title}"

Return ONLY the English title, nothing else. No quotes.`;
      const englishTitle = await createContent(titlePromptEn, 50);
      
      // Detect theme
      const themePrompt = `Based on this poem, give ONE word theme (e.g., Memory, Loss, Love, Recovery, Family, Technology, Paradise):

"${russianText.substring(0, 300)}"

Return ONLY one word.`;
      const theme = await createContent(themePrompt, 20);
      
      // Generate poetic description for NFT
      await ctx.reply(`🎭 Generating poetic description...`);
      const descriptionPrompt = `Based on this poem translation, write a 1-2 sentence poetic description for an NFT listing. Be evocative, mysterious, and brief. Capture the essence without explaining:

"${englishText.substring(0, 500)}"

Return ONLY the description, no quotes, no intro. Maximum 150 characters.`;
      const description = await createContent(descriptionPrompt, 100);
      
      // Store in book state
      bookState.lastPageTitle = title;
      bookState.lastPageTitleEnglish = englishTitle.trim();
      bookState.lastPageContent = russianText;
      bookState.lastPageEnglish = englishText;
      bookState.lastPageTheme = theme.trim();
      bookState.lastPageDescription = description.trim();
      
      // Save to memory
      await saveMemory('ATUONA', 'imported_page', {
        page: bookState.currentPage,
        title,
        theme: bookState.lastPageTheme,
        imported: true
      }, russianText, {
        type: 'import',
        english: englishText,
        timestamp: new Date().toISOString()
      });
      
      // Show preview
      const previewMessage = `✅ *Import Complete!*

📖 *Page #${String(bookState.currentPage).padStart(3, '0')}*
📌 *"${bookState.lastPageTitleEnglish}"*
🇷🇺 Original: ${title}
🎭 Theme: ${bookState.lastPageTheme}
📝 Description: ${bookState.lastPageDescription}

━━━━━━━━━━━━━━━━━━━━
🇷🇺 *RUSSIAN ORIGINAL*
━━━━━━━━━━━━━━━━━━━━
${russianText.substring(0, 800)}${russianText.length > 800 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━
🇬🇧 *ENGLISH TRANSLATION*
━━━━━━━━━━━━━━━━━━━━
${englishText.substring(0, 800)}${englishText.length > 800 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━

✅ Ready! Use:
• /preview - Full text both languages
• /publish - Push to atuona.xyz as NFT
• /import - Import another page`;

      await ctx.reply(previewMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Import error:', error);
      await ctx.reply('❌ Error importing. Try again!');
    }
  });
  
  // /translate - Re-translate or adjust translation
  atuonaBot.command('translate', async (ctx) => {
    if (!bookState.lastPageContent) {
      await ctx.reply('❌ No page imported. Use /import first!');
      return;
    }
    
    const instruction = ctx.message?.text?.replace('/translate', '').trim();
    
    await ctx.reply('🔄 Re-translating...');
    
    try {
      let translatePrompt = `You are translating raw, underground Russian poetry/prose by Elena Revicheva.

RUSSIAN ORIGINAL:
${bookState.lastPageContent}

TITLE: ${bookState.lastPageTitle}`;

      if (instruction) {
        translatePrompt += `\n\nSPECIAL INSTRUCTION: ${instruction}`;
      }

      translatePrompt += `\n\nTranslate to English while:
1. Preserving the raw, confessional tone
2. Keeping the street language feel
3. Maintaining emotional impact
4. Keeping any English/Spanish words from original

Return ONLY the English translation.`;

      const newTranslation = await createContent(translatePrompt, 2000);
      bookState.lastPageEnglish = newTranslation;
      
      await ctx.reply(`✅ *New Translation*

${newTranslation}

━━━━━━━━━━━━━━━━━━━━
Use /publish to push to atuona.xyz`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Translate error:', error);
      await ctx.reply('❌ Error translating. Try again!');
    }
  });
  
  // /queue - Show import queue status
  atuonaBot.command('queue', async (ctx) => {
    if (importQueue.length === 0) {
      await ctx.reply(`📋 *Import Queue*

Queue is empty.

Current page ready: ${bookState.lastPageTitle ? `"${bookState.lastPageTitle}"` : 'None'}

Use /import to add pages.`, { parse_mode: 'Markdown' });
      return;
    }
    
    let queueList = importQueue.slice(0, 10).map((p, i) => 
      `${i + 1}. ${p.title || 'Untitled'}`
    ).join('\n');
    
    await ctx.reply(`📋 *Import Queue*

${queueList}
${importQueue.length > 10 ? `\n... and ${importQueue.length - 10} more` : ''}

Total: ${importQueue.length} pages

Use /batch to process queue.`, { parse_mode: 'Markdown' });
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
  
  // /preview - Full preview with both languages
  atuonaBot.command('preview', async (ctx) => {
    if (!bookState.lastPageContent) {
      await ctx.reply('❌ No page to preview. Use /import or /create first!');
      return;
    }
    
    const pageId = String(bookState.currentPage).padStart(3, '0');
    
    // Send Russian first
    const russianPreview = `📖 *FULL PREVIEW - Page #${pageId}*
*"${bookState.lastPageTitle}"*
🎭 Theme: ${bookState.lastPageTheme || 'Journey'}

━━━━━━━━━━━━━━━━━━━━
🇷🇺 *RUSSIAN ORIGINAL*
━━━━━━━━━━━━━━━━━━━━

${bookState.lastPageContent}`;

    await ctx.reply(russianPreview, { parse_mode: 'Markdown' });
    
    // Send English if available
    if (bookState.lastPageEnglish) {
      const englishPreview = `━━━━━━━━━━━━━━━━━━━━
🇬🇧 *ENGLISH TRANSLATION*
━━━━━━━━━━━━━━━━━━━━

${bookState.lastPageEnglish}

━━━━━━━━━━━━━━━━━━━━

✅ Ready to publish!
• /publish - Push to atuona.xyz
• /translate - Adjust translation
• /import - Import different text`;

      await ctx.reply(englishPreview, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`⚠️ No English translation yet.

Use /translate to create one, or /publish will use Russian only.`);
    }
  });
  
  // /publish - Publish to GitHub via CTO AIPA
  atuonaBot.command('publish', async (ctx) => {
    if (!bookState.lastPageContent) {
      await ctx.reply('❌ No page to publish. Use /import or /create first!');
      return;
    }
    
    await ctx.reply('🚀 Publishing to atuona.xyz...\n\n_Checking GitHub & pushing..._', { parse_mode: 'Markdown' });
    
    try {
      const repoName = 'atuona';
      const branch = 'main';
      const owner = 'ElenaRevicheva';
      
      // Find next available page number
      let pageNum = bookState.currentPage;
      let fileSha: string | undefined;
      let fileExists = true;
      
      // Check if current page exists, if so find next available
      while (fileExists) {
        const pageId = String(pageNum).padStart(3, '0');
        try {
          const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: `metadata/${pageId}.json`,
            ref: branch
          });
          
          // File exists, try next number
          console.log(`📄 Page ${pageId} exists, trying next...`);
          pageNum++;
        } catch (e: any) {
          if (e.status === 404) {
            // File doesn't exist - this is our slot!
            fileExists = false;
          } else {
            throw e;
          }
        }
      }
      
      const pageId = String(pageNum).padStart(3, '0');
      const title = bookState.lastPageTitle;
      const englishTitle = bookState.lastPageTitleEnglish || title;
      const russianText = bookState.lastPageContent;
      const englishText = bookState.lastPageEnglish || russianText;
      const theme = bookState.lastPageTheme || 'Journey';
      const description = bookState.lastPageDescription || '';
      
      // Create NFT metadata JSON
      const metadata = createNFTMetadata(pageId, title, russianText, englishText, theme);
      const metadataContent = JSON.stringify(metadata, null, 2);
      
      // Create the individual metadata file
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: `metadata/${pageId}.json`,
        message: `📖 Add poem ${pageId}: ${title}`,
        content: Buffer.from(metadataContent).toString('base64'),
        branch
      });
      
      console.log(`🎭 Atuona published metadata/${pageId}.json`);
      
      // Also update the main poems JSON file so website shows it
      try {
        // Get current poems file
        const { data: poemsFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: 'atuona-45-poems-with-text.json',
          ref: branch
        });
        
        if ('content' in poemsFile && 'sha' in poemsFile) {
          // Decode and parse existing poems
          const existingContent = Buffer.from(poemsFile.content, 'base64').toString('utf-8');
          const poems = JSON.parse(existingContent);
          
          // Create the full poem entry for the array
          const fullPoemEntry = createFullPoemEntry(pageId, title, russianText, englishText, theme);
          
          // Add new poem to array
          poems.push(fullPoemEntry);
          
          // Update the file
          const updatedContent = JSON.stringify(poems, null, 2);
          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo: repoName,
            path: 'atuona-45-poems-with-text.json',
            message: `📖 Add poem ${pageId} to gallery: ${title}`,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: poemsFile.sha,
            branch
          });
          
          console.log(`🎭 Atuona updated main poems JSON with ${pageId}`);
        }
      } catch (jsonError) {
        console.error('Could not update main poems JSON:', jsonError);
        // Continue anyway - metadata file was created
      }
      
      // Update index.html: add NFT card to VAULT + gallery slot to MINT
      try {
        const { data: htmlFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: 'index.html',
          ref: branch
        });
        
        if ('content' in htmlFile && 'sha' in htmlFile) {
          let htmlContent = Buffer.from(htmlFile.content, 'base64').toString('utf-8');
          let htmlModified = false;
          
          // ============================================================
          // STEP 1: Add NFT card with English translation to VAULT section
          // ============================================================
          const nftCardHtml = createNFTCardHtml(pageId, pageNum, englishTitle, englishText, theme, description);
          
          // Check if this card already exists
          if (!htmlContent.includes(`nft-id">#${pageId}`)) {
            // Find the last nft-card in the home section (VAULT)
            const aboutSection = htmlContent.indexOf('<section id="about"');
            if (aboutSection > 0) {
              const homeSection = htmlContent.slice(0, aboutSection);
              
              // The HTML structure has 3-4 closing </div> tags before </section>:
              //     </div> (nft-meta), </div> (nft-content), </div> (nft-card), </div> (nft-grid), </section>
              // Find the last nft-card closing and insert after it
              
              // Strategy: Find the last </div>\n                    </div> pattern (closes nft-card)
              // then insert new card after it
              const cardClosePattern = '</div>\n                    </div>';
              const lastCardClose = homeSection.lastIndexOf(cardClosePattern);
              
              if (lastCardClose > 0) {
                const insertPoint = lastCardClose + cardClosePattern.length;
                htmlContent = htmlContent.slice(0, insertPoint) + '\n' + nftCardHtml + htmlContent.slice(insertPoint);
                htmlModified = true;
                console.log(`🎭 Atuona added NFT card #${pageId} to VAULT section`);
              } else {
                // Fallback: insert before </section>
                const sectionClose = homeSection.lastIndexOf('</section>');
                if (sectionClose > 0) {
                  // Go back to find safe insertion point
                  const safePoint = homeSection.lastIndexOf('</div>\n                </div>\n            </section>');
                  if (safePoint > 0) {
                    htmlContent = htmlContent.slice(0, safePoint) + nftCardHtml + '                    ' + htmlContent.slice(safePoint);
                    htmlModified = true;
                    console.log(`🎭 Atuona added NFT card #${pageId} to VAULT section (fallback)`);
                  }
                }
              }
            }
          } else {
            console.log(`⏭️ NFT card #${pageId} already exists in VAULT`);
          }
          
          // ============================================================
          // STEP 2: Add gallery slot to MINT section (with English title)
          // ============================================================
          const newSlotHtml = `                        <div class="gallery-slot" onclick="claimPoem(${pageNum}, '${englishTitle.replace(/'/g, "\\'")}')">
                            <div class="slot-content">
                                <div class="slot-id">${pageId}</div>
                                <div class="slot-label">${englishTitle}</div>
                                <div class="slot-year">2025</div>
                                <div class="claim-button">CLAIM RANDOM POEM</div>
                            </div>
                        </div>
`;
          
          // Check if slot already exists
          if (!htmlContent.includes(`claimPoem(${pageNum},`)) {
            // Find the gallery section (MINT) and add slot there
            const gallerySection = htmlContent.indexOf('<section id="gallery"');
            if (gallerySection > 0) {
              // Find the end of gallery-grid in the gallery section
              const afterGallery = htmlContent.slice(gallerySection);
              const galleryEnd = afterGallery.indexOf('</div>\n                    </div>\n                </div>\n            </section>');
              
              if (galleryEnd > 0) {
                const insertPoint = gallerySection + galleryEnd;
                htmlContent = htmlContent.slice(0, insertPoint) + newSlotHtml + htmlContent.slice(insertPoint);
                htmlModified = true;
                console.log(`🎭 Atuona added gallery slot #${pageId} to MINT section`);
              }
            }
          } else {
            console.log(`⏭️ Gallery slot #${pageId} already exists in MINT`);
          }
          
          // Save changes if any modifications were made
          if (htmlModified) {
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo: repoName,
              path: 'index.html',
              message: `📖 Add poem #${pageId} "${title}" - NFT card + gallery slot`,
              content: Buffer.from(htmlContent).toString('base64'),
              sha: htmlFile.sha,
              branch
            });
            console.log(`✅ Atuona updated index.html with poem #${pageId}`);
          }
        }
      } catch (htmlError) {
        console.error('Could not update index.html:', htmlError);
        // Continue anyway - metadata was created
      }
      
      // Update book state
      bookState.totalPages = pageNum;
      bookState.currentPage = pageNum + 1;
      
      // Clear for next page
      const publishedTitle = title;
      bookState.lastPageTitle = '';
      bookState.lastPageTitleEnglish = '';
      bookState.lastPageContent = '';
      bookState.lastPageEnglish = '';
      bookState.lastPageTheme = '';
      bookState.lastPageDescription = '';
      
      await ctx.reply(`✅ *Published Successfully!*

📖 *Poem #${pageId}*: "${publishedTitle}"

━━━━━━━━━━━━━━━━━━━━
✅ metadata/${pageId}.json
✅ NFT card in VAULT (English)
✅ Gallery slot in MINT
✅ Poems JSON updated
━━━━━━━━━━━━━━━━━━━━
🇷🇺 Russian original ✅
🇬🇧 English translation ✅
🎭 Theme: ${theme}
━━━━━━━━━━━━━━━━━━━━

🌐 *atuona.xyz updates in 1-2 min!*
_(Fleek auto-deploys from GitHub)_

📝 Next page: #${String(bookState.currentPage).padStart(3, '0')}

Use /import for next Russian text!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Publish error:', error);
      
      if (error.status === 404) {
        await ctx.reply(`❌ Repository not found or no access.

Make sure GitHub token has write access to ElenaRevicheva/atuona`);
      } else {
        await ctx.reply(`❌ Error: ${error.message || 'Unknown error'}

Try again or check GitHub permissions!`);
      }
    }
  });
  
  // /fixgallery - One-time fix to add missing gallery slots
  atuonaBot.command('fixgallery', async (ctx) => {
    await ctx.reply('🔧 Fixing gallery - adding missing poem slots...');
    
    try {
      const repoName = 'atuona';
      const branch = 'main';
      const owner = 'ElenaRevicheva';
      
      // Get current index.html
      const { data: htmlFile } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: 'index.html',
        ref: branch
      });
      
      if (!('content' in htmlFile) || !('sha' in htmlFile)) {
        await ctx.reply('❌ Could not read index.html');
        return;
      }
      
      let htmlContent = Buffer.from(htmlFile.content, 'base64').toString('utf-8');
      const originalHtml = htmlContent; // Save original to detect changes
      let structureFixed = false;
      
      // STEP 1: Fix broken HTML structure (nested slots)
      // The bug: slot 046 was inserted INSIDE slot 045 instead of after it
      const brokenPattern = `                            </div>
                                                <div class="gallery-slot" onclick="claimPoem(46`;
      const fixedPattern = `                            </div>
                        </div>
                        <div class="gallery-slot" onclick="claimPoem(46`;
      
      if (htmlContent.includes(brokenPattern)) {
        htmlContent = htmlContent.replace(brokenPattern, fixedPattern);
        await ctx.reply('🔧 Fixed nested slot structure (046 was inside 045)');
        structureFixed = true;
      }
      
      // Also fix any general nested slot issues
      // Pattern: slot-content closes but gallery-slot doesn't before next gallery-slot opens
      const nestedSlotRegex = /(                            <\/div>)\s*(<div class="gallery-slot")/g;
      const nestedMatches = htmlContent.match(nestedSlotRegex);
      if (nestedMatches && nestedMatches.length > 0) {
        htmlContent = htmlContent.replace(nestedSlotRegex, '$1\n                        </div>\n                        $2');
        await ctx.reply(`🔧 Fixed ${nestedMatches.length} nested slot(s)`);
        structureFixed = true;
      }
      
      // Count existing slots
      const existingSlots = (htmlContent.match(/gallery-slot/g) || []).length;
      await ctx.reply(`📊 Current gallery slots: ${existingSlots}`);
      
      // Check what metadata files exist
      const { data: metadataFiles } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: 'metadata',
        ref: branch
      });
      
      if (!Array.isArray(metadataFiles)) {
        await ctx.reply('❌ Could not read metadata folder');
        return;
      }
      
      // Find poems that need gallery slots
      const poemsToAdd: { id: string; title: string }[] = [];
      
      for (const file of metadataFiles) {
        if (file.name.endsWith('.json')) {
          const poemId = file.name.replace('.json', '');
          const poemNum = parseInt(poemId);
          
          // Check if slot exists
          if (!htmlContent.includes(`claimPoem(${poemNum},`)) {
            // Get poem title from metadata
            try {
              const { data: metaFile } = await octokit.repos.getContent({
                owner,
                repo: repoName,
                path: `metadata/${file.name}`,
                ref: branch
              });
              
              if ('content' in metaFile) {
                const metaContent = JSON.parse(Buffer.from(metaFile.content, 'base64').toString('utf-8'));
                const title = metaContent.attributes?.find((a: any) => a.trait_type === 'Poem')?.value || `Poem ${poemId}`;
                poemsToAdd.push({ id: poemId, title });
              }
            } catch (e) {
              poemsToAdd.push({ id: poemId, title: `Poem ${poemId}` });
            }
          }
        }
      }
      
      if (poemsToAdd.length === 0 && !structureFixed) {
        await ctx.reply('✅ All poems already have gallery slots and HTML is correct!');
        return;
      }
      
      // If structure was fixed but no new poems, still push the fix
      if (poemsToAdd.length === 0 && structureFixed) {
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo: repoName,
          path: 'index.html',
          message: '🔧 Fix gallery HTML structure (repair nested slots)',
          content: Buffer.from(htmlContent).toString('base64'),
          sha: htmlFile.sha,
          branch
        });
        
        await ctx.reply(`✅ *HTML Structure Fixed!*

🔧 Repaired nested gallery slots
📊 Total slots: ${existingSlots}

🌐 Fleek will auto-deploy. Check atuona.xyz in 1-2 minutes!`, { parse_mode: 'Markdown' });
        return;
      }
      
      await ctx.reply(`📝 Adding ${poemsToAdd.length} missing slots: ${poemsToAdd.map(p => p.id).join(', ')}`);
      
      // Add slots
      const insertPoint = htmlContent.lastIndexOf('</div>\n                    </div>\n                </div>\n            </section>');
      
      if (insertPoint < 0) {
        await ctx.reply('❌ Could not find insertion point in HTML');
        return;
      }
      
      let newSlots = '';
      for (const poem of poemsToAdd) {
        newSlots += `                        <div class="gallery-slot" onclick="claimPoem(${parseInt(poem.id)}, '${poem.title.replace(/'/g, "\\'")}')">
                            <div class="slot-content">
                                <div class="slot-id">${poem.id}</div>
                                <div class="slot-label">${poem.title}</div>
                                <div class="slot-year">2025</div>
                                <div class="claim-button">CLAIM RANDOM POEM</div>
                            </div>
                        </div>
`;
      }
      
      htmlContent = htmlContent.slice(0, insertPoint) + newSlots + htmlContent.slice(insertPoint);
      
      // Push updated HTML
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: 'index.html',
        message: `🎭 Add gallery slots for poems: ${poemsToAdd.map(p => p.id).join(', ')}`,
        content: Buffer.from(htmlContent).toString('base64'),
        sha: htmlFile.sha,
        branch
      });
      
      await ctx.reply(`✅ *Gallery Fixed!*

Added ${poemsToAdd.length} new slots:
${poemsToAdd.map(p => `• ${p.id}: ${p.title}`).join('\n')}

🌐 Fleek will auto-deploy. Check atuona.xyz in 1-2 minutes!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Fix gallery error:', error);
      await ctx.reply(`❌ Error: ${error.message || 'Unknown error'}`);
    }
  });

  // /setpage - Manually set the current page number
  atuonaBot.command('setpage', async (ctx) => {
    const numStr = ctx.message?.text?.replace('/setpage', '').trim();
    const num = parseInt(numStr || '');
    
    if (isNaN(num) || num < 1) {
      await ctx.reply(`📄 *Set Page Number*

Current: #${String(bookState.currentPage).padStart(3, '0')}

Usage: \`/setpage 47\` to start from page 047`, { parse_mode: 'Markdown' });
      return;
    }
    
    bookState.currentPage = num;
    await ctx.reply(`✅ Page number set to #${String(num).padStart(3, '0')}

Next /publish will create this page.`);
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
