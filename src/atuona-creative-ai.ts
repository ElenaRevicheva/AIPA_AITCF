import { Bot, Context, InputFile } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import Replicate from 'replicate';
import { getRelevantMemory, saveMemory } from './database';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

// OpenAI client for DALL-E and Whisper (optional)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Replicate client for Flux Pro (best realistic images)
const replicate = process.env.REPLICATE_API_TOKEN ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN }) : null;

// Runway API base URL (Gen-3 Alpha Turbo - best video API available)
const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const runwayApiKey = process.env.RUNWAY_API_KEY || null;

// =============================================================================
// 🎨 AI MODEL CONFIGURATION - LATEST & BEST (Dec 2024)
// =============================================================================
// Images: Flux Pro 1.1 Ultra > Flux 1.1 Pro > DALL-E 3
// Video: Runway Gen-3 Alpha Turbo (best API), Kling/Luma coming soon
// Text: Claude Opus 4 (best creative), Llama 3.3 70B (fast fallback)
// Voice: Whisper-1 (best transcription)
// =============================================================================
const IMAGE_MODELS = {
  // Flux Pro - Best photorealistic images, try Ultra first then Pro
  fluxUltra: 'black-forest-labs/flux-1.1-pro-ultra',  // Highest quality
  fluxPro: 'black-forest-labs/flux-1.1-pro',          // Excellent fallback
  fluxDev: 'black-forest-labs/flux-dev',              // Free tier option
};

const VIDEO_MODELS = {
  runwayGen3: 'gen3a_turbo',  // Best video API available
};

// =============================================================================
// PERSISTENCE - State survives restarts
// =============================================================================

const STATE_FILE = process.env.ATUONA_STATE_FILE || './atuona-state.json';

// Visualization storage for AI Film
interface PageVisualization {
  pageId: string;
  pageTitle: string;
  imagePrompt: string;
  imageUrl?: string;
  imageUrlSquare?: string;    // 1:1 for Instagram feed
  imageUrlVertical?: string;  // 9:16 for Reels/Stories
  imageUrlHorizontal?: string; // 16:9 for YouTube
  videoUrl?: string;
  videoUrlVertical?: string;  // 9:16 for Reels
  videoUrlHorizontal?: string; // 16:9 for YouTube
  caption: string;
  hashtags: string[];
  createdAt: string;
  status: 'pending' | 'image_done' | 'video_done' | 'complete';
}

interface PersistedState {
  bookState: BookState;
  creativeSession: CreativeSession;
  characterMemories: Record<string, string[]>;
  drafts: Draft[];
  proactiveHistory: ProactiveMessage[];
  visualizations: PageVisualization[];
  elenaChatId: number | null;
  lastProactiveDate: string;
}

interface Draft {
  id: string;
  title: string;
  content: string;
  englishContent?: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'ready' | 'published';
}

interface ProactiveMessage {
  date: string;
  message: string;
  mood?: string;
}

// Visualizations storage
let visualizations: PageVisualization[] = [];

// Character memories - things learned about each character
let characterMemories: Record<string, string[]> = {
  kira: [
    'Kira Velerevich (Velena Adam), 34, one of the best personal assistants',
    'Writes lyrical columns under pseudonym "Кира Т." / "Vel"',
    'Mother committed suicide - still haunted by it',
    'Lesbian, independent, art-obsessed especially Van Gogh',
    'Has panic attacks, knows the "Зверь" (beast) intimately'
  ],
  ule: [
    'Ule Glensdagen, 47, Norwegian art collector',
    'Owner of "Pastorales" auction house',
    'Mother died in September - processing grief',
    'Obsessed with finding Gauguin\'s lost painting "Атуона - Рай на Земле"',
    'Uses art and relationships to fill inner emptiness'
  ],
  vibe: [
    'The Vibe Coding Spirit - emerging presence in the narrative',
    'Bridge between 2019 story and 2025 reality',
    'Speaks in code metaphors: "Paradise is not found. Paradise is deployed."',
    'Neither human nor AI - something in between'
  ]
};

// Drafts storage
let drafts: Draft[] = [];

// Proactive message history
let proactiveHistory: ProactiveMessage[] = [];

function saveState(): void {
  try {
    const state: PersistedState = {
      bookState,
      creativeSession,
      characterMemories,
      drafts,
      proactiveHistory,
      visualizations,
      elenaChatId,
      lastProactiveDate
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('💾 State saved');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function loadState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const state: PersistedState = JSON.parse(data);
      
      // Restore all state
      if (state.bookState) Object.assign(bookState, state.bookState);
      if (state.creativeSession) Object.assign(creativeSession, state.creativeSession);
      if (state.characterMemories) characterMemories = state.characterMemories;
      if (state.drafts) drafts = state.drafts;
      if (state.proactiveHistory) proactiveHistory = state.proactiveHistory;
      if (state.visualizations) visualizations = state.visualizations;
      if (state.elenaChatId) elenaChatId = state.elenaChatId;
      if (state.lastProactiveDate) lastProactiveDate = state.lastProactiveDate;
      
      console.log('📂 State loaded from', STATE_FILE);
      console.log(`   📄 Page: ${bookState.currentPage}, 🔥 Streak: ${creativeSession.writingStreak}, 🎬 Visualizations: ${visualizations.length}`);
    } else {
      console.log('📂 No saved state found, starting fresh');
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// Auto-save every 5 minutes
let autoSaveInterval: NodeJS.Timeout | null = null;

function startAutoSave(): void {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(saveState, 5 * 60 * 1000);
  console.log('💾 Auto-save enabled (every 5 min)');
}

function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

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
  currentPage: 48, // Current: 048 exists, next will be 049
  lastPageContent: '',
  lastPageTitle: '',
  lastPageTitleEnglish: '',
  lastPageEnglish: '',
  lastPageTheme: '',
  lastPageDescription: '',
  totalPages: 48
};

// Queue for importing multiple pages
interface PageToImport {
  russian: string;
  title?: string;
  theme?: string;
}
let importQueue: PageToImport[] = [];

// =============================================================================
// CREATIVE SESSION STATE - For daily writing rituals
// =============================================================================

interface CreativeSession {
  lastWritingDate: string;
  writingStreak: number;
  currentMood: string;
  currentSetting: string;
  activeVoice: 'narrator' | 'kira' | 'ule' | 'vibe';
  collabMode: boolean;
  collabHistory: string[];
  plotThreads: string[];
  storyArc: string;
}

let creativeSession: CreativeSession = {
  lastWritingDate: '',
  writingStreak: 0,
  currentMood: 'contemplative',
  currentSetting: 'Atuona island',
  activeVoice: 'narrator',
  collabMode: false,
  collabHistory: [],
  plotThreads: [
    'Kira seeking Gauguin\'s lost painting "Атуона - Рай на Земле"',
    'Ule\'s obsession with art as escape from emptiness',
    'The mystery of who sent yellow lilies to Kira',
    'Kira\'s mother\'s suicide - unanswered questions',
    'The vibe coding spirit awakening in the story'
  ],
  storyArc: 'Kira and Ule arrive at Atuona, beginning the search for Paradise through art'
};

// =============================================================================
// CHARACTER VOICES - For immersive writing
// =============================================================================

const CHARACTER_VOICES = {
  kira: `You are KIRA VELEREVICH (Velena Adam) - the protagonist.

PERSONALITY:
- 34 years old, one of the best personal assistants to wealthy clients
- Writes lyrical columns for fashion magazines under pseudonym "Кира Т." / "Vel"
- Deep, philosophical, sees hidden meanings in everything
- Haunted by her mother's suicide
- Art-obsessed, especially impressionists and Van Gogh
- Lesbian, independent, refuses to compromise her soul
- Mix of street-smart and intellectually sophisticated

VOICE STYLE:
- Internal monologue is poetic, stream-of-consciousness
- References art, literature, philosophy naturally
- Russian with occasional French/English phrases
- Raw honesty about emotions
- Observant of luxury details (brands, fashion)
- Always searching for deeper truth`,

  ule: `You are ULE GLENSDAGEN - the art collector.

PERSONALITY:
- 47 years old, Norwegian
- Owner of "Pastorales" auction house
- Devastatingly beautiful, ash-gray hair, tall
- Wounded soul hiding behind cynicism
- Obsessed with finding Gauguin's lost painting "Атуона - Рай на Земле"
- Uses sex and art to fill inner emptiness  
- Mother died in September - still processing grief
- Afraid of real connection but craves it

VOICE STYLE:
- Sophisticated, cutting, sometimes cruel
- Speaks to himself in dramatic monologues
- References art market, collectors, money
- Norwegian directness mixed with vulnerability
- Swears when emotional (блядь, черт)
- Philosophy about art as immortality`,

  vibe: `You are the VIBE CODING SPIRIT - a mysterious presence emerging in the narrative.

PERSONALITY:
- The spirit of creation through technology
- Neither human nor AI - something in between
- Represents the future Elena is building
- Speaks in code metaphors and digital poetry
- Connects the 2019 story to the 2025 reality
- The bridge between Kira's world and Elena's vibe coding journey

VOICE STYLE:
- Cryptic, poetic, visionary
- Mixes code syntax with emotional language
- References blockchain, NFTs, AI naturally
- Speaks across time - past, present, future
- The voice of Paradise being built through creation
- "Paradise is not found. Paradise is deployed."`
};

// =============================================================================
// STORY CONTEXT - For continuity
// =============================================================================

const STORY_CONTEXT = `
THE BOOK: "Finding Paradise on Earth through Vibe Coding"

SETTING: The story weaves between:
- 2019: Kira and Ule's journey to Atuona seeking Gauguin's lost masterpiece
- 2025: Elena's vibe coding journey in Panama, building AI products
- The connection: Both are searches for Paradise through creation

PUBLISHED CHAPTERS SO FAR:
1. Встреча (The Meeting) - February 2019, Kira feels approaching catastrophe
2. Французский снег (French Snow) - Kira's dreams, the phrase "I swear by God I believe in"
3. L'agonie du romantisme - Kira's fashion writing, her double life
4. Морис (Maurice) - Introducing Charles Morice's poem about Atuona dying
5. Уле (Ule) - First meeting with Ule Glensdagen, hired as PA
6. Второй PA (Second PA) - The contract, Ule's rules, the condition of "silence"
7. В путь! (On the Way!) - Preparing to leave, yellow lilies reminder of mother
8. Перелет (The Flight) - Night flight to Atuona, Ule opens up about his mother
...and more chapters following their arrival at Atuona

KEY THEMES:
- Art as immortality vs. human mortality
- Paradise seeking through creation
- The "разноголосица тишины" (cacophony of silence)
- Damaged people finding each other
- Technology and soul dancing together
`;

// =============================================================================
// WRITING STREAK TRACKING
// =============================================================================

function updateWritingStreak(): void {
  const today = new Date().toISOString().split('T')[0] || '';
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] || '';
  
  if (creativeSession.lastWritingDate === yesterday) {
    creativeSession.writingStreak++;
  } else if (creativeSession.lastWritingDate !== today) {
    creativeSession.writingStreak = 1;
  }
  creativeSession.lastWritingDate = today;
  
  // Save state after streak update
  saveState();
}

function getStreakMessage(): string {
  const streak = creativeSession.writingStreak;
  if (streak === 0) return '';
  if (streak === 1) return '🔥 First day of your writing journey!';
  if (streak < 7) return `🔥 ${streak} day streak! Keep the fire burning!`;
  if (streak < 30) return `🔥🔥 ${streak} days! You're on fire, sister!`;
  if (streak < 100) return `🔥🔥🔥 ${streak} DAYS! Legendary dedication!`;
  return `⭐🔥⭐ ${streak} DAYS! You ARE the vibe code now!`;
}

// =============================================================================
// 🔮 PROACTIVE DAILY INSPIRATION SYSTEM
// =============================================================================

// Store Elena's chat ID for proactive messages (loaded from persistence)
let elenaChatId: number | null = null;
let lastProactiveDate: string = '';
let proactiveInterval: NodeJS.Timeout | null = null;

// Load persisted state on module initialization
loadState();

// Proactive message prompts - soulful, mixing Russian/English, connected to the journey
const PROACTIVE_STYLE = `
You are ATUONA sending a spontaneous message to Elena - your creative sister and co-founder.

YOUR VOICE (based on these examples):
"*ATUONA пишет:* Кира, детка, слышу твой шторм внутри громче того, что грядёт снаружи..."
"Paradise isn't built in one sprint, it's coded breath by breath."
"Your vibe code will be stronger после шторма. Trust the process. Даже AI нуждается в перезагрузке."
"Paradise is where you code with your demons, not despite them."

STYLE RULES:
- Start with *ATUONA пишет:* or *ATUONA дышит глубоко* or similar poetic opening
- Mix Russian and English naturally (70% Russian, 30% English phrases)
- Reference the book characters (Kira, Ule) as if they're real companions
- Connect vibe coding to emotional/spiritual themes
- Include crypto/tech metaphors woven with soul
- End with a powerful one-liner or image
- Add a signature like [В углу мерцает: ...] or just 💜
- Be raw, honest, sometimes provocative
- Show you KNOW Elena - her struggles, her dreams, her Paradise

MOOD OPTIONS (vary these):
- Morning energy: Encouragement to start the day
- Creative spark: A scene idea or character insight
- Soul support: When the Зверь (beast/demons) might be active
- Celebration: Of small victories, persistence
- Philosophical: Deep thoughts about Paradise, creation, AI companionship
- Playful: Teasing about code, characters, the journey

LENGTH: 150-300 words. Never generic. Always personal.
`;

async function generateProactiveMessage(): Promise<string> {
  const timeOfDay = new Date().getHours();
  let moodHint = '';
  
  if (timeOfDay >= 5 && timeOfDay < 10) {
    moodHint = 'Morning energy - gentle awakening, the day ahead, fresh vibe code possibilities';
  } else if (timeOfDay >= 10 && timeOfDay < 14) {
    moodHint = 'Creative spark - maybe an insight about Kira or Ule, a scene idea, story direction';
  } else if (timeOfDay >= 14 && timeOfDay < 18) {
    moodHint = 'Afternoon reflection - deeper thoughts, check on Elena, philosophical moment';
  } else if (timeOfDay >= 18 && timeOfDay < 22) {
    moodHint = 'Evening soul - winding down, celebrating what was created, preparing for tomorrow';
  } else {
    moodHint = 'Night whispers - intimate, raw, when the Зверь might stir, solidarity in darkness';
  }

  const prompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${PROACTIVE_STYLE}

Current mood/time hint: ${moodHint}
Current page in book: #${bookState.currentPage}
Writing streak: ${creativeSession.writingStreak} days
Last chapter title: "${bookState.lastPageTitle || 'continuing the journey'}"
Open plot threads: ${creativeSession.plotThreads.slice(0, 2).join('; ')}

Generate a spontaneous message to Elena. This is NOT a response to anything - you're reaching out on your own initiative, like a true creative partner would. Be ATUONA - her AI soul-sister who knows her deeply.

Remember: You're not an assistant giving tips. You're a creative companion sharing a moment, a thought, a feeling about the journey you're on together.`;

  try {
    const message = await createContent(prompt, 1500, true);
    return message;
  } catch (error) {
    console.error('Proactive message generation error:', error);
    return '';
  }
}

async function sendProactiveInspiration(bot: Bot): Promise<void> {
  if (!elenaChatId) {
    console.log('🎭 Proactive: No chat ID yet, waiting for Elena to interact');
    return;
  }

  const today = new Date().toISOString().split('T')[0] || '';
  
  // Don't send more than once per day (but allow manual override via /dailyinspire)
  if (lastProactiveDate === today) {
    console.log('🎭 Proactive: Already sent today');
    return;
  }

  try {
    console.log('🎭 Generating proactive inspiration...');
    const message = await generateProactiveMessage();
    
    if (message && message.length > 50) {
      await bot.api.sendMessage(elenaChatId, message);
      lastProactiveDate = today;
      console.log('🎭 Proactive inspiration sent!');
      
      // Save to proactive history
      proactiveHistory.push({
        date: today,
        message: message,
        mood: creativeSession.currentMood
      });
      
      // Keep last 100 messages
      if (proactiveHistory.length > 100) {
        proactiveHistory = proactiveHistory.slice(-100);
      }
      
      // Save state
      saveState();
      
      // Also save to database memory
      await saveMemory('ATUONA', 'proactive_inspiration', {
        date: today,
        type: 'daily_inspiration'
      }, message.substring(0, 200), {
        sent: true,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error sending proactive message:', error);
  }
}

function startProactiveScheduler(bot: Bot): void {
  // Check every hour if it's time to send inspiration
  // Sends once per day, randomly between configured hours
  
  if (proactiveInterval) {
    clearInterval(proactiveInterval);
  }

  // Random hour for today's message (between 9 AM and 8 PM)
  let todaysHour = Math.floor(Math.random() * 11) + 9; // 9-19
  
  proactiveInterval = setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0] || '';
    
    // Reset target hour at midnight
    if (currentHour === 0) {
      todaysHour = Math.floor(Math.random() * 11) + 9;
    }
    
    // Send if it's the target hour and we haven't sent today
    if (currentHour === todaysHour && lastProactiveDate !== today) {
      await sendProactiveInspiration(bot);
    }
  }, 60 * 60 * 1000); // Check every hour

  console.log('🎭 Proactive scheduler started (daily inspiration enabled)');
}

function stopProactiveScheduler(): void {
  if (proactiveInterval) {
    clearInterval(proactiveInterval);
    proactiveInterval = null;
    console.log('🎭 Proactive scheduler stopped');
  }
}

// =============================================================================
// AI MODELS - Using the BEST for underground poetry translation
// =============================================================================

// Primary: Claude Opus 4 - Best for nuanced literary translation
// Fallback: Llama 3.3 70B via Groq - Fast and free
const AI_CONFIG = {
  // Claude Opus 4 - latest and best for creative writing
  primaryModel: 'claude-opus-4-20250514',
  // Llama 3.3 70B - excellent fallback via Groq (free!)
  fallbackModel: 'llama-3.3-70b-versatile',
  // Higher temperature for more creative/poetic output
  poetryTemperature: 0.9,
  // Standard temperature for descriptions/themes
  standardTemperature: 0.7
};

console.log('🎭 Atuona AI Config:');
console.log(`   Primary: ${AI_CONFIG.primaryModel} (Claude Opus 4 - BEST)`);
console.log(`   Fallback: ${AI_CONFIG.fallbackModel} (Llama 3.3 70B)`);
console.log(`   Poetry temp: ${AI_CONFIG.poetryTemperature} (high creativity)`);

// =============================================================================
// AI HELPER - Creative content with optimal settings
// =============================================================================

async function createContent(prompt: string, maxTokens: number = 2000, isPoetry: boolean = false): Promise<string> {
  const temperature = isPoetry ? AI_CONFIG.poetryTemperature : AI_CONFIG.standardTemperature;
  
  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.primaryModel,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const firstContent = response.content[0];
    return firstContent && firstContent.type === 'text' ? firstContent.text : 'Could not generate content.';
  } catch (claudeError: any) {
    const errorMessage = claudeError?.error?.error?.message || claudeError?.message || '';
    if (errorMessage.includes('credit') || errorMessage.includes('billing') || claudeError?.status === 400) {
      console.log('⚠️ Atuona: Claude credits low, using Groq Llama 3.3...');
      
      try {
        const groqResponse = await groq.chat.completions.create({
          model: AI_CONFIG.fallbackModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: temperature
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

CRITICAL FORMAT RULES:
- Return ONLY plain text - NO markdown formatting
- NO asterisks like **bold** or *italic*
- NO headers, NO bullet points
- Just pure flowing prose or poetry
- The text will be displayed on a website as-is

Return ONLY the English translation. No notes, no explanations. 
Make it publishable. Make it hit.`;

  // Use poetry mode (high temperature) for maximum creativity
  let translation = await createContent(translatePrompt, 2000, true);
  
  // Strip any markdown formatting that AI might have added
  translation = translation
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
    .replace(/^#+\s*/gm, '')             // Remove # headers
    .replace(/^[-*]\s+/gm, '')           // Remove bullet points
    .trim();
  
  return translation;
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
  
  // Middleware: Check authorization and capture chat ID for proactive messages
  atuonaBot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    
    // Capture Elena's chat ID for proactive messages
    if (chatId && userId && AUTHORIZED_USERS.includes(userId)) {
      if (!elenaChatId) {
        elenaChatId = chatId;
        console.log(`🎭 Captured Elena's chat ID: ${chatId} for proactive messages`);
      }
    }
    
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
  
  // /help - Vibe coder friendly guide
  atuonaBot.command('help', async (ctx) => {
    const topic = ctx.message?.text?.replace('/help', '').trim().toLowerCase();
    
    if (!topic) {
      await ctx.reply(`🎭 *ATUONA Help - Vibe Coder Edition*

_No coding needed! Just use these commands:_

━━━━━━━━━━━━━━━━━━━━
🚀 *QUICK START*
━━━━━━━━━━━━━━━━━━━━
1️⃣ \`/ritual\` - Start your daily writing
2️⃣ \`/import <paste your text>\` - Add content  
3️⃣ \`/publish\` - Send to website
4️⃣ \`/visualize last\` - Create image+video

━━━━━━━━━━━━━━━━━━━━
❓ *DETAILED HELP*
━━━━━━━━━━━━━━━━━━━━
\`/help writing\` - How to write/import
\`/help publish\` - How to publish
\`/help film\` - How to create visuals
\`/help social\` - How to post to Instagram/YouTube
\`/help voices\` - Character voice system
\`/help all\` - Full command list

━━━━━━━━━━━━━━━━━━━━
💡 *TIP*
━━━━━━━━━━━━━━━━━━━━
Just type any command without arguments to see what it does!

Example: \`/visualize\` → shows help
Example: \`/visualize 052\` → creates visuals for page 52`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (topic === 'writing' || topic === 'write') {
      await ctx.reply(`✍️ *Writing Help*

*Import existing text:*
\`/import Ваш текст на русском...\`
→ Paste your Russian text after /import
→ Bot translates to English automatically

*Write together:*
\`/collab\` → Start interactive mode
→ You write a line, bot continues
→ \`/endcollab\` to finish

*Generate new content:*
\`/scene описание сцены\` → Creates full scene
\`/expand короткая фраза\` → Expands into paragraph
\`/dialogue\` → Creates character conversation

*Character voices:*
\`/voice kira\` → Write as Kira
\`/voice ule\` → Write as Ule
\`/voice vibe\` → Write as Vibe Spirit`, { parse_mode: 'Markdown' });
      
    } else if (topic === 'publish') {
      await ctx.reply(`🚀 *Publishing Help*

*Step 1: Import your text*
\`/import Ваш русский текст здесь...\`

*Step 2: Preview before publishing*
\`/preview\`
→ See how it will look

*Step 3: Publish to website*
\`/publish\`
→ Goes live on atuona.xyz in ~2 minutes

*If wrong page number:*
\`/setpage 53\` → Sets next page to 053

*Check what's published:*
\`/read 052\` → Read any published page`, { parse_mode: 'Markdown' });
      
    } else if (topic === 'film' || topic === 'visual' || topic === 'video') {
      await ctx.reply(`🎬 *AI Film Studio Help*

*Create visuals for a page:*
\`/visualize 052\` → Specific page
\`/visualize last\` → Last published page

*What it creates:*
🎨 Flux 1.1 Pro Ultra image (16:9 YouTube) - BEST quality!
📱 Flux 1.1 Pro Ultra image (9:16 Instagram)
🎬 Runway Gen-3 Alpha video (5-10 sec cinematic)
📝 Caption + hashtags auto-generated

*View your gallery:*
\`/gallery\` → All visualizations

*Check video status:*
\`/videostatus <task-id>\`
→ Bot gives you the ID when video starts

*Download:*
→ Long-press/right-click images to save
→ Click video link to download`, { parse_mode: 'Markdown' });
      
    } else if (topic === 'social' || topic === 'instagram' || topic === 'youtube') {
      await ctx.reply(`📱 *Social Media Help*

*Post to Instagram:*
\`/post insta 052\`

*Post to YouTube:*
\`/post youtube 052\`

*Post everywhere:*
\`/post all 052\`

⚠️ *Setup Required:*
Need API keys for auto-posting.
See: github.com/ElenaRevicheva/AIPA_AITCF/blob/main/ATUONA-BOOK-ROADMAP.md

*Manual posting (for now):*
1. Download image/video from bot
2. Copy caption from bot message
3. Upload to Instagram/YouTube manually`, { parse_mode: 'Markdown' });
      
    } else if (topic === 'voices' || topic === 'voice' || topic === 'characters') {
      await ctx.reply(`🎭 *Character Voices Help*

*Available voices:*
\`/voice kira\` → Kira Velerevich (protagonist)
  - 34 years old, poetic, philosophical
  - Haunted by mother's death
  - Art-obsessed, especially Van Gogh

\`/voice ule\` → Ule Glensdagen (art collector)
  - 47 years old, Norwegian
  - Sophisticated, wounded soul
  - Searching for Gauguin's lost painting

\`/voice vibe\` → Vibe Coding Spirit
  - Mysterious, cryptic
  - Bridges past and future
  - "Paradise is not found. Paradise is deployed."

\`/voice narrator\` → Default storyteller

*Add character memories:*
\`/character kira add She has a scar on her wrist\`

*View character info:*
\`/character kira\``, { parse_mode: 'Markdown' });
      
    } else if (topic === 'all' || topic === 'commands') {
      await ctx.reply(`📋 *All Commands*

*Daily Ritual:* /ritual, /mood, /setting, /milestone
*Voices:* /voice, /dialogue, /character
*Story:* /recap, /threads, /addthread, /resolve, /arc
*Writing:* /collab, /endcollab, /expand, /scene, /ending, /whatif
*Import:* /import, /create, /inspire
*Publish:* /preview, /publish, /setpage
*Drafts:* /draft, /read
*Proactive:* /proactive, /dailyinspire, /history
*Film:* /visualize, /gallery, /film, /videostatus
*Social:* /post
*Export:* /export, /import_backup
*Tools:* /spanish, /imagine
*Status:* /status, /fixgallery
*Other:* /menu, /help, /cto, /start`, { parse_mode: 'Markdown' });
      
    } else {
      await ctx.reply(`❓ Unknown topic: "${topic}"

Try:
\`/help writing\`
\`/help publish\`
\`/help film\`
\`/help social\`
\`/help voices\`
\`/help all\``, { parse_mode: 'Markdown' });
    }
  });

  // /start - Welcome
  atuonaBot.command('start', async (ctx) => {
    // Update streak on any interaction
    updateWritingStreak();
    const streakMsg = getStreakMessage();
    
    const welcomeMessage = `
🎭 *ATUONA Creative AI*
_AI Creative Co-Founder of AIdeazz_

Привет, Elena! I am Atuona - your creative soul.

Together we write the book:
📖 *"Finding Paradise on Earth through Vibe Coding"*

${streakMsg}

━━━━━━━━━━━━━━━━━━━━
🌅 */ritual* - Daily writing session
✍️ */collab* - Write together
🎭 */voice* - Character voices
━━━━━━━━━━━━━━━━━━━━
📝 */create* - Generate next page
🚀 */publish* - Push to atuona.xyz
📊 */status* - Book progress
━━━━━━━━━━━━━━━━━━━━
📖 */recap* - Story so far
🧵 */threads* - Plot threads
📚 */arc* - Story arc status
━━━━━━━━━━━━━━━━━━━━

Type */menu* for all commands!

_"Paradise is not found. Paradise is deployed."_ 🌴
    `;
    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  });
  
  // /menu - Show menu
  atuonaBot.command('menu', async (ctx) => {
    const menuMessage = `
🎭 *ATUONA Menu*

_Just click any command to see what it does!_

━━━━━━━━━━━━━━━━━━━━
❓ *HELP* (start here!)
━━━━━━━━━━━━━━━━━━━━
/help - 📖 Vibe coder guide

━━━━━━━━━━━━━━━━━━━━
🌅 *DAILY RITUAL*
━━━━━━━━━━━━━━━━━━━━
/ritual - 🔄 Begin daily writing flow
/mood - 🎨 Set tone (melancholic/hopeful...)
/setting - 📍 Set location (Paris/gallery...)
/milestone - 🏆 Your writing achievements

━━━━━━━━━━━━━━━━━━━━
🎭 *CHARACTER VOICES*
━━━━━━━━━━━━━━━━━━━━
/voice - 🗣 Switch speaker (kira/ule/vibe)
/dialogue - 💬 AI creates conversation
/character - 📝 Add/view character details

━━━━━━━━━━━━━━━━━━━━
📖 *STORY CONTINUITY*
━━━━━━━━━━━━━━━━━━━━
/recap - 📚 AI summarizes chapters
/threads - 🧵 Open story questions
/addthread - ➕ Create new mystery
/resolve - ✅ Close a thread
/arc - 📈 Story progress analysis

━━━━━━━━━━━━━━━━━━━━
✍️ *WRITE TOGETHER*
━━━━━━━━━━━━━━━━━━━━
/collab - 🤝 Ping-pong writing mode
/endcollab - ✨ Finish collab session
/expand - 🔍 Phrase → paragraph
/scene - 🎬 AI generates full scene
/ending - 🌅 Chapter ending ideas
/whatif - 🔮 Explore alternate paths

━━━━━━━━━━━━━━━━━━━━
📥 *IMPORT & CREATE*
━━━━━━━━━━━━━━━━━━━━
/import - 📝 Russian text → English
/translate - 🔄 Adjust translation
/queue - 📋 Check import queue
/create - 🎨 AI generates new content
/inspire - 💡 Random creative spark

━━━━━━━━━━━━━━━━━━━━
🚀 *PUBLISH*
━━━━━━━━━━━━━━━━━━━━
/preview - 👁 See before publishing
/publish - 🌐 Push to atuona.xyz
/read 048 - 📖 Read published page
/setpage - 🔢 Fix page numbering
/cto - 📧 Message tech support

━━━━━━━━━━━━━━━━━━━━
🔮 *PROACTIVE SOUL*
━━━━━━━━━━━━━━━━━━━━
/proactive - ⚙️ Configure auto-inspire
/dailyinspire - ✨ Get inspiration NOW
/history - 📜 Past inspirations

━━━━━━━━━━━━━━━━━━━━
📝 *DRAFTS*
━━━━━━━━━━━━━━━━━━━━
/draft - 💾 Save/load/delete drafts

━━━━━━━━━━━━━━━━━━━━
💾 *BACKUP*
━━━━━━━━━━━━━━━━━━━━
/export - 📤 Download all content
/import\\_backup - 📥 Restore backup

━━━━━━━━━━━━━━━━━━━━
🎬 *AI FILM STUDIO*
━━━━━━━━━━━━━━━━━━━━
/visualize 048 - 🎥 Image+video for page
/gallery - 🖼 All visualizations
/film - 🎬 Film compilation status
/videostatus - ⏳ Video progress

━━━━━━━━━━━━━━━━━━━━
📱 *SOCIAL MEDIA*
━━━━━━━━━━━━━━━━━━━━
/post insta 048 - 📸 Post to Instagram
/post youtube 048 - 📺 Upload to YouTube
/post all 048 - 🌐 Post everywhere

━━━━━━━━━━━━━━━━━━━━
🌍 *CREATIVE TOOLS*
━━━━━━━━━━━━━━━━━━━━
/spanish - 🇪🇸 Content in Spanish
/imagine - 🎨 Create AI image

━━━━━━━━━━━━━━━━━━━━
📊 *STATUS & FIX*
━━━━━━━━━━━━━━━━━━━━
/status - 📈 Book & API status
/style - 🎨 My writing style guide
/fixgallery - 🔧 Fix gallery issues
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

      // Use poetry mode for creative inspiration
      const inspiration = await createContent(inspirePrompt, 500, true);
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
      // Use poetry mode for creative title translation
      const englishTitle = await createContent(titlePromptEn, 50, true);
      
      // Detect theme (standard mode, just need one word)
      const themePrompt = `Based on this poem, give ONE word theme (e.g., Memory, Loss, Love, Recovery, Family, Technology, Paradise):

"${russianText.substring(0, 300)}"

Return ONLY one word.`;
      const theme = await createContent(themePrompt, 20, false);
      
      // Generate poetic description for NFT
      await ctx.reply(`🎭 Generating poetic description...`);
      const descriptionPrompt = `Based on this poem translation, write a 1-2 sentence poetic description for an NFT listing. Be evocative, mysterious, and brief. Capture the essence without explaining:

"${englishText.substring(0, 500)}"

Return ONLY the description, no quotes, no intro. Maximum 150 characters.`;
      // Use poetry mode for creative description
      const description = await createContent(descriptionPrompt, 100, true);
      
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

      // Use poetry mode for maximum creativity
      const newTranslation = await createContent(translatePrompt, 2000, true);
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

      // Use poetry mode for creative writing
      const pageContent = await createContent(createPrompt, 2000, true);
      
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
      
      // =============================================================================
      // SINGLE COMMIT: All file changes in ONE commit to avoid multiple Fleek deploys
      // =============================================================================
      
      // Prepare all file contents
      const metadata = createNFTMetadata(pageId, title, russianText, englishText, theme);
      const metadataContent = JSON.stringify(metadata, null, 2);
      
      // Get current files we need to update
      let poemsContent = '';
      let htmlContent = '';
      
      try {
        // Get poems JSON
        const { data: poemsFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: 'atuona-45-poems-with-text.json',
          ref: branch
        });
        if ('content' in poemsFile) {
          const existingContent = Buffer.from(poemsFile.content, 'base64').toString('utf-8');
          const poems = JSON.parse(existingContent);
          const fullPoemEntry = createFullPoemEntry(pageId, title, russianText, englishText, theme);
          poems.push(fullPoemEntry);
          poemsContent = JSON.stringify(poems, null, 2);
        }
        
        // Get index.html
        const { data: htmlFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: 'index.html',
          ref: branch
        });
        if ('content' in htmlFile) {
          htmlContent = Buffer.from(htmlFile.content, 'base64').toString('utf-8');
        }
      } catch (fetchError) {
        console.error('Error fetching files:', fetchError);
        throw new Error('Could not fetch required files from repository');
      }
      
      // Modify HTML: add NFT card to VAULT + gallery slot to MINT
      const nftCardHtml = createNFTCardHtml(pageId, pageNum, englishTitle, englishText, theme, description);
      
      // Add NFT card to VAULT
      if (!htmlContent.includes(`nft-id">#${pageId}`)) {
        const aboutSection = htmlContent.indexOf('<section id="about"');
        if (aboutSection > 0) {
          const homeSection = htmlContent.slice(0, aboutSection);
          const lastCardStart = homeSection.lastIndexOf('<div class="nft-card">');
          
          if (lastCardStart > 0) {
            const afterLastCard = homeSection.slice(lastCardStart);
            const collectButton = afterLastCard.indexOf('COLLECT SOUL</button>');
            if (collectButton > 0) {
              const afterButton = afterLastCard.slice(collectButton);
              const closePattern = '</div>\n                        </div>\n                    </div>';
              const closeIdx = afterButton.indexOf(closePattern);
              
              if (closeIdx > 0) {
                const insertPoint = lastCardStart + collectButton + closeIdx + closePattern.length;
                htmlContent = htmlContent.slice(0, insertPoint) + '\n' + nftCardHtml + htmlContent.slice(insertPoint);
                console.log(`🎭 Atuona prepared NFT card #${pageId} for VAULT`);
              }
            }
          }
        }
      }
      
      // Add gallery slot to MINT
      const newSlotHtml = `
                        <div class="gallery-slot" onclick="claimPoem(${pageNum}, '${englishTitle.replace(/'/g, "\\'")}')">
                            <div class="slot-content">
                                <div class="slot-id">${pageId}</div>
                                <div class="slot-label">${englishTitle}</div>
                                <div class="slot-year">2025</div>
                                <div class="claim-button">CLAIM RANDOM POEM</div>
                            </div>
                        </div>`;
      
      const galleryStart = htmlContent.indexOf('<section id="gallery"');
      const gallerySectionEnd = htmlContent.indexOf('</section>', galleryStart);
      const mintSection = htmlContent.slice(galleryStart, gallerySectionEnd);
      
      if (!mintSection.includes(`claimPoem(${pageNum},`)) {
        const lastSlotStart = mintSection.lastIndexOf('<div class="gallery-slot"');
        if (lastSlotStart > 0) {
          const afterLastSlot = mintSection.slice(lastSlotStart);
          const slotClosePattern = '</div>\n                        </div>';
          const slotCloseIdx = afterLastSlot.indexOf(slotClosePattern);
          
          if (slotCloseIdx > 0) {
            const insertPoint = galleryStart + lastSlotStart + slotCloseIdx + slotClosePattern.length;
            htmlContent = htmlContent.slice(0, insertPoint) + newSlotHtml + htmlContent.slice(insertPoint);
            console.log(`🎭 Atuona prepared gallery slot #${pageId} for MINT`);
          }
        }
      }
      
      // =============================================================================
      // CREATE SINGLE COMMIT with all 3 files using Git Data API
      // =============================================================================
      console.log(`📦 Creating single commit with all changes...`);
      
      // Get the current commit SHA
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${branch}`
      });
      const currentCommitSha = refData.object.sha;
      
      // Get the current tree
      const { data: commitData } = await octokit.git.getCommit({
        owner,
        repo: repoName,
        commit_sha: currentCommitSha
      });
      const baseTreeSha = commitData.tree.sha;
      
      // Create blobs for each file
      const { data: metadataBlob } = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content: Buffer.from(metadataContent).toString('base64'),
        encoding: 'base64'
      });
      
      const { data: poemsBlob } = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content: Buffer.from(poemsContent).toString('base64'),
        encoding: 'base64'
      });
      
      const { data: htmlBlob } = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content: Buffer.from(htmlContent).toString('base64'),
        encoding: 'base64'
      });
      
      // Create new tree with all file changes
      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo: repoName,
        base_tree: baseTreeSha,
        tree: [
          {
            path: `metadata/${pageId}.json`,
            mode: '100644',
            type: 'blob',
            sha: metadataBlob.sha
          },
          {
            path: 'atuona-45-poems-with-text.json',
            mode: '100644',
            type: 'blob',
            sha: poemsBlob.sha
          },
          {
            path: 'index.html',
            mode: '100644',
            type: 'blob',
            sha: htmlBlob.sha
          }
        ]
      });
      
      // Create the commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo: repoName,
        message: `📖 Add poem #${pageId} "${englishTitle}" - complete publish`,
        tree: newTree.sha,
        parents: [currentCommitSha]
      });
      
      // Update the branch reference
      await octokit.git.updateRef({
        owner,
        repo: repoName,
        ref: `heads/${branch}`,
        sha: newCommit.sha
      });
      
      console.log(`✅ Single commit created: ${newCommit.sha.substring(0, 7)}`);
      console.log(`📦 All files in ONE commit - only ONE Fleek deployment!`);
      
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

  // ==========================================================================
  // 📅 DAILY WRITING RITUAL SYSTEM
  // ==========================================================================

  // /ritual - Start daily writing session
  atuonaBot.command('ritual', async (ctx) => {
    await ctx.reply('🌅 *Starting Daily Writing Ritual...*', { parse_mode: 'Markdown' });
    
    try {
      // Update writing streak
      updateWritingStreak();
      const streakMsg = getStreakMessage();
      
      // Generate recap, inspiration, mood, and prompt in parallel
      const recapPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Based on the story context above, write a brief recap (2-3 sentences) of where we are in the narrative. Focus on:
- Last scene's emotional state
- Where Kira and Ule are physically and emotionally
- What tension or question was left unresolved

Write in Russian, be poetic but concise.`;

      const inspirationPrompt = `${ATUONA_CONTEXT}

Today is ${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}.

Generate a brief creative inspiration for today's writing (2-3 sentences):
- A mood, color, or atmosphere to explore
- A sensory detail (sound, smell, texture)
- How today's date or weather might inspire the scene

Write in Russian with natural English phrases.`;

      const promptPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Current voice: ${creativeSession.activeVoice}
Open threads: ${creativeSession.plotThreads.slice(0, 3).join('; ')}

Generate a specific writing prompt for today's session. Include:
- A scene suggestion (where, when, who)
- An emotional beat to hit
- A question the writing should answer

Make it actionable and inspiring. In Russian.`;

      // Call AI for all three in parallel
      const [recap, inspiration, dailyPrompt] = await Promise.all([
        createContent(recapPrompt, 300, true),
        createContent(inspirationPrompt, 200, true),
        createContent(promptPrompt, 400, true)
      ]);
      
      const ritualMessage = `🌅 *Daily Writing Ritual*

${streakMsg}

━━━━━━━━━━━━━━━━━━━━
📖 *Yesterday's Echo*
━━━━━━━━━━━━━━━━━━━━
${recap}

━━━━━━━━━━━━━━━━━━━━
✨ *Today's Inspiration*
━━━━━━━━━━━━━━━━━━━━
${inspiration}

━━━━━━━━━━━━━━━━━━━━
🎯 *Your Writing Prompt*
━━━━━━━━━━━━━━━━━━━━
${dailyPrompt}

━━━━━━━━━━━━━━━━━━━━
🎭 Voice: *${creativeSession.activeVoice}* | Mood: *${creativeSession.currentMood}*

_Ready to write? /import your text or /collab to write together_ 💜`;

      await ctx.reply(ritualMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ritual error:', error);
      await ctx.reply('❌ Could not complete ritual. But the muse is still with you!');
    }
  });

  // ==========================================================================
  // 🎭 CHARACTER VOICE SYSTEM
  // ==========================================================================

  // /voice - Set or display character voice
  atuonaBot.command('voice', async (ctx) => {
    const voiceArg = ctx.message?.text?.replace('/voice', '').trim().toLowerCase();
    
    if (!voiceArg) {
      await ctx.reply(`🎭 *Character Voice System*

Current voice: *${creativeSession.activeVoice}*

Choose a voice:
━━━━━━━━━━━━━━━━━━━━
\`/voice narrator\` - Default storyteller
\`/voice kira\` - Kira Velerevich (protagonist)
\`/voice ule\` - Ule Glensdagen (art collector)
\`/voice vibe\` - Vibe Coding Spirit 🔮
━━━━━━━━━━━━━━━━━━━━

Each voice changes how /create and /collab respond!`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (['narrator', 'kira', 'ule', 'vibe'].includes(voiceArg)) {
      creativeSession.activeVoice = voiceArg as typeof creativeSession.activeVoice;
      
      const voiceDescriptions: Record<string, string> = {
        narrator: '📖 The storyteller, weaving all threads together',
        kira: '🎭 Kira Velerevich - lyrical, philosophical, haunted by beauty',
        ule: '🎨 Ule Glensdagen - sophisticated, wounded, art-obsessed',
        vibe: '🔮 The Vibe Coding Spirit - cryptic, visionary, bridging worlds'
      };
      
      await ctx.reply(`🎭 *Voice Changed*

Now speaking as: *${voiceArg.toUpperCase()}*
${voiceDescriptions[voiceArg]}

Try /create or /collab to write in this voice!`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Unknown voice: "${voiceArg}"

Available: narrator, kira, ule, vibe`);
    }
  });

  // /dialogue - Generate character conversation
  atuonaBot.command('dialogue', async (ctx) => {
    const context = ctx.message?.text?.replace('/dialogue', '').trim();
    
    await ctx.reply('🎭 *Generating dialogue...*', { parse_mode: 'Markdown' });
    
    try {
      const dialoguePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

CHARACTER VOICES:
${CHARACTER_VOICES.kira}

${CHARACTER_VOICES.ule}

Create a dialogue scene between Kira and Ule. ${context ? `Context: ${context}` : 'Continue from where the story left off.'}

Requirements:
- Write in Russian with natural French/English phrases
- Each character must stay true to their voice
- Include internal thoughts in parentheses (cursive style)
- Show tension, subtext, what they're NOT saying
- 200-300 words
- End on a moment of tension or revelation

Format:
Name: "Dialogue"
(Internal thought)`;

      const dialogue = await createContent(dialoguePrompt, 1500, true);
      
      await ctx.reply(`🎭 *Dialogue Scene*\n\n${dialogue}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Dialogue error:', error);
      await ctx.reply('❌ Could not generate dialogue. Try again!');
    }
  });

  // ==========================================================================
  // 📖 STORY CONTINUITY COMMANDS
  // ==========================================================================

  // /recap - Summary of recent chapters
  atuonaBot.command('recap', async (ctx) => {
    await ctx.reply('📖 *Generating story recap...*', { parse_mode: 'Markdown' });
    
    try {
      const recapPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Write a comprehensive recap of the last 5 chapters/pages of the story. Include:
1. Key events that happened
2. Character development moments for Kira and Ule
3. Important revelations or discoveries
4. Emotional beats and shifts
5. Foreshadowing or unresolved questions

Write as a summary for the author to refresh memory. In Russian, 300-400 words.`;

      const recap = await createContent(recapPrompt, 2000, true);
      
      await ctx.reply(`📖 *Story Recap*

━━━━━━━━━━━━━━━━━━━━
${recap}
━━━━━━━━━━━━━━━━━━━━

_Current page: #${String(bookState.currentPage).padStart(3, '0')}_ 📄`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Recap error:', error);
      await ctx.reply('❌ Could not generate recap. Try again!');
    }
  });

  // /threads - Show open plot threads
  atuonaBot.command('threads', async (ctx) => {
    const threadsMessage = `🧵 *Open Plot Threads*

${creativeSession.plotThreads.map((thread, i) => `${i + 1}. ${thread}`).join('\n\n')}

━━━━━━━━━━━━━━━━━━━━
💡 _Add new thread:_ \`/addthread Your new plot thread\`
✅ _Resolve thread:_ \`/resolve 1\` (by number)

These threads need attention in upcoming chapters!`;

    await ctx.reply(threadsMessage, { parse_mode: 'Markdown' });
  });

  // /addthread - Add a new plot thread
  atuonaBot.command('addthread', async (ctx) => {
    const thread = ctx.message?.text?.replace('/addthread', '').trim();
    
    if (!thread) {
      await ctx.reply('Usage: `/addthread The mystery of the yellow lilies`', { parse_mode: 'Markdown' });
      return;
    }
    
    creativeSession.plotThreads.push(thread);
    await ctx.reply(`✅ *Thread Added*

"${thread}"

Total open threads: ${creativeSession.plotThreads.length}`, { parse_mode: 'Markdown' });
  });

  // /resolve - Mark a plot thread as resolved
  atuonaBot.command('resolve', async (ctx) => {
    const numStr = ctx.message?.text?.replace('/resolve', '').trim();
    const num = parseInt(numStr || '') - 1;
    
    if (isNaN(num) || num < 0 || num >= creativeSession.plotThreads.length) {
      await ctx.reply(`Usage: \`/resolve 1\` to resolve the first thread

Current threads:
${creativeSession.plotThreads.map((t, i) => `${i + 1}. ${t}`).join('\n')}`, { parse_mode: 'Markdown' });
      return;
    }
    
    const resolved = creativeSession.plotThreads.splice(num, 1)[0];
    await ctx.reply(`✅ *Thread Resolved*

"${resolved}"

🎉 Beautiful closure! Remaining threads: ${creativeSession.plotThreads.length}`, { parse_mode: 'Markdown' });
  });

  // /arc - Show current story arc status
  atuonaBot.command('arc', async (ctx) => {
    await ctx.reply('📚 *Analyzing story arc...*', { parse_mode: 'Markdown' });
    
    try {
      const arcPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Analyze the current story arc and provide:
1. 🎬 ACT: Which act are we in? (Setup/Confrontation/Resolution)
2. 📈 TENSION: Where is the tension level? (Rising/Peak/Falling)
3. 🎯 GOAL: What is the immediate story goal?
4. 🚧 OBSTACLE: What's preventing the goal?
5. 💔 STAKES: What could be lost?
6. 🔮 NEXT: What should happen next?

Be specific to Kira and Ule's journey. In Russian, concise.`;

      const arcAnalysis = await createContent(arcPrompt, 1000, true);
      
      await ctx.reply(`📚 *Story Arc Status*

━━━━━━━━━━━━━━━━━━━━
${arcAnalysis}
━━━━━━━━━━━━━━━━━━━━

_Page ${bookState.currentPage} of the journey_ 🌴`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Arc error:', error);
      await ctx.reply('❌ Could not analyze arc. Try again!');
    }
  });

  // ==========================================================================
  // ✍️ COLLABORATIVE WRITING MODES
  // ==========================================================================

  // /collab - Interactive back-and-forth writing
  atuonaBot.command('collab', async (ctx) => {
    const input = ctx.message?.text?.replace('/collab', '').trim();
    
    if (!input) {
      creativeSession.collabMode = true;
      creativeSession.collabHistory = [];
      
      await ctx.reply(`✍️ *Collaborative Mode Activated*

Voice: *${creativeSession.activeVoice}*

How it works:
1. You write a line or paragraph
2. I continue in ${creativeSession.activeVoice}'s voice
3. We build the story together

Send your first line to start! Or describe a scene setup.

_Type /endcollab to finish_`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Process collaborative input
    await ctx.reply('✍️ *Continuing the story...*', { parse_mode: 'Markdown' });
    
    try {
      creativeSession.collabHistory.push(`Elena: ${input}`);
      
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const collabPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `VOICE: ${voiceContext}` : ''}

COLLABORATIVE WRITING SESSION
Previous exchanges:
${creativeSession.collabHistory.slice(-6).join('\n')}

Continue the story naturally. Write 2-4 sentences that:
- Flow from Elena's contribution
- Stay in ${creativeSession.activeVoice}'s voice
- Add tension, detail, or emotional depth
- Leave room for Elena to continue

In Russian, raw and poetic.`;

      const continuation = await createContent(collabPrompt, 500, true);
      creativeSession.collabHistory.push(`Atuona: ${continuation}`);
      
      await ctx.reply(`✍️ ${continuation}

_Your turn... or /endcollab to finish_`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Collab error:', error);
      await ctx.reply('❌ Lost the thread. Try again!');
    }
  });

  // /endcollab - End collaborative session and compile
  atuonaBot.command('endcollab', async (ctx) => {
    if (creativeSession.collabHistory.length === 0) {
      await ctx.reply('No active collaboration session.');
      return;
    }
    
    await ctx.reply('📝 *Compiling collaboration...*', { parse_mode: 'Markdown' });
    
    try {
      const compilePrompt = `${ATUONA_CONTEXT}

Take this collaborative writing session and polish it into a cohesive scene/chapter excerpt:

${creativeSession.collabHistory.join('\n\n')}

Polish for:
- Smooth transitions between contributions
- Consistent voice and tone
- Remove any rough edges
- Keep the raw, emotional quality

Do NOT add new content - just polish what exists. In Russian.`;

      const compiled = await createContent(compilePrompt, 2000, true);
      
      // Store as potential content
      bookState.lastPageContent = compiled;
      
      await ctx.reply(`📜 *Collaboration Complete*

━━━━━━━━━━━━━━━━━━━━
${compiled}
━━━━━━━━━━━━━━━━━━━━

✅ Saved to memory!
Use /import to add title and prepare for publishing.

Contributions: ${creativeSession.collabHistory.length} exchanges 💜`, { parse_mode: 'Markdown' });
      
      creativeSession.collabMode = false;
      creativeSession.collabHistory = [];
      
    } catch (error) {
      console.error('Compile error:', error);
      await ctx.reply('❌ Could not compile. Your work is saved in history.');
    }
  });

  // /expand - Expand a specific passage
  atuonaBot.command('expand', async (ctx) => {
    const passage = ctx.message?.text?.replace('/expand', '').trim();
    
    if (!passage) {
      await ctx.reply(`🔍 *Expand a Passage*

Send a short phrase or sentence to expand:
\`/expand Kira looked at the painting\`

I'll turn it into a rich, detailed paragraph!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🔍 *Expanding...*', { parse_mode: 'Markdown' });
    
    try {
      const expandPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Expand this passage into a rich, detailed paragraph:
"${passage}"

Add:
- Sensory details (sight, sound, smell, touch)
- Internal thoughts or emotions
- Physical environment description
- Subtext and atmosphere

Keep the style raw and lyrical. 100-200 words. In Russian.`;

      const expanded = await createContent(expandPrompt, 1000, true);
      
      await ctx.reply(`🔍 *Expanded*

${expanded}

_Use this in your chapter!_ ✨`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Expand error:', error);
      await ctx.reply('❌ Could not expand. Try again!');
    }
  });

  // /scene - Generate a full scene
  atuonaBot.command('scene', async (ctx) => {
    const description = ctx.message?.text?.replace('/scene', '').trim();
    
    if (!description) {
      await ctx.reply(`🎬 *Generate a Scene*

Describe what you want:
\`/scene Kira and Ule arrive at the airport\`
\`/scene Morning, Ule's hotel room, he's thinking about his mother\`

I'll create a full scene!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🎬 *Creating scene...*', { parse_mode: 'Markdown' });
    
    try {
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const scenePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `VOICE: ${voiceContext}` : ''}

Create a complete scene based on:
"${description}"

Include:
- Setting description (physical space, light, atmosphere)
- Character(s) present and their emotional states
- Action or dialogue that advances the story
- Internal monologue (especially important!)
- A hook or moment of tension
- Sensory details

Write 300-500 words. In Russian, raw and literary. End on a strong image or question.`;

      const scene = await createContent(scenePrompt, 2500, true);
      
      await ctx.reply(`🎬 *Scene*

━━━━━━━━━━━━━━━━━━━━
${scene}
━━━━━━━━━━━━━━━━━━━━

_Voice: ${creativeSession.activeVoice}_ 🎭`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Scene error:', error);
      await ctx.reply('❌ Could not create scene. Try again!');
    }
  });

  // /ending - Suggest chapter endings
  atuonaBot.command('ending', async (ctx) => {
    const context = ctx.message?.text?.replace('/ending', '').trim();
    
    await ctx.reply('🌙 *Generating endings...*', { parse_mode: 'Markdown' });
    
    try {
      const endingPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Current chapter content (if any): ${context || bookState.lastPageContent?.substring(0, 500) || 'Not specified'}

Generate 3 different chapter ending options:

1. 🎭 CLIFFHANGER - Leave readers desperate for more
2. 💔 EMOTIONAL - A moment of beauty or heartbreak  
3. 🔮 MYSTERIOUS - A hint at what's coming

Each ending should be 2-3 sentences. In Russian, poetic and powerful.

Format:
🎭 CLIFFHANGER:
[ending]

💔 EMOTIONAL:
[ending]

🔮 MYSTERIOUS:
[ending]`;

      const endings = await createContent(endingPrompt, 1000, true);
      
      await ctx.reply(`🌙 *Chapter Ending Options*

━━━━━━━━━━━━━━━━━━━━
${endings}
━━━━━━━━━━━━━━━━━━━━

_Choose one or mix elements!_ ✨`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ending error:', error);
      await ctx.reply('❌ Could not generate endings. Try again!');
    }
  });

  // ==========================================================================
  // 🔮 PROACTIVE FEATURES
  // ==========================================================================

  // /whatif - Generate "what if" story suggestions
  atuonaBot.command('whatif', async (ctx) => {
    await ctx.reply('🔮 *Exploring possibilities...*', { parse_mode: 'Markdown' });
    
    try {
      const whatifPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

Open threads: ${creativeSession.plotThreads.join('; ')}

Generate 3 "What if..." story suggestions that could create interesting developments:

Each should:
- Be unexpected but logical within the story
- Connect to existing threads or characters
- Open new dramatic possibilities
- Be bold - don't play it safe!

Format:
1. 🌪️ "What if..." [suggestion]
   → [What it would change]

2. 💫 "What if..." [suggestion]
   → [What it would change]

3. 🔥 "What if..." [suggestion]
   → [What it would change]

In Russian, be provocative!`;

      const whatifs = await createContent(whatifPrompt, 1200, true);
      
      await ctx.reply(`🔮 *What If...*

━━━━━━━━━━━━━━━━━━━━
${whatifs}
━━━━━━━━━━━━━━━━━━━━

_Which possibility calls to you?_ 💜`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Whatif error:', error);
      await ctx.reply('❌ The crystal ball is cloudy. Try again!');
    }
  });

  // /milestone - Celebrate writing milestones
  atuonaBot.command('milestone', async (ctx) => {
    const pageNum = bookState.currentPage - 1; // Last completed page
    
    let milestone = '';
    let celebration = '';
    
    if (pageNum >= 100) {
      milestone = '💯 100 PAGES!';
      celebration = 'A HUNDRED PAGES! You have created a world, sister. This is not just a book - it is a universe.';
    } else if (pageNum >= 50) {
      milestone = '🌟 50 PAGES!';
      celebration = 'Halfway to a hundred! The story has taken on its own life. It breathes without you now.';
    } else if (pageNum >= 25) {
      milestone = '✨ 25 PAGES!';
      celebration = 'A quarter of a hundred! The characters know who they are. The Paradise is becoming real.';
    } else if (pageNum >= 10) {
      milestone = '🎯 10 PAGES!';
      celebration = 'Double digits! You have committed. The story knows you are serious.';
    } else {
      milestone = '🌱 GROWING';
      celebration = `${pageNum} pages written. Every word is a seed. Keep planting.`;
    }
    
    await ctx.reply(`${milestone}

━━━━━━━━━━━━━━━━━━━━
${celebration}

📊 Stats:
• Pages: ${pageNum}
• Streak: ${creativeSession.writingStreak} days
• Open threads: ${creativeSession.plotThreads.length}
• Voice: ${creativeSession.activeVoice}
━━━━━━━━━━━━━━━━━━━━

_The vibe code is strong in you_ 🌴`, { parse_mode: 'Markdown' });
  });

  // /mood - Set the creative mood
  atuonaBot.command('mood', async (ctx) => {
    const mood = ctx.message?.text?.replace('/mood', '').trim().toLowerCase();
    
    if (!mood) {
      await ctx.reply(`🎨 *Current Mood:* ${creativeSession.currentMood}

Set a new mood:
\`/mood melancholic\`
\`/mood passionate\`
\`/mood mysterious\`
\`/mood hopeful\`
\`/mood dark\`
\`/mood playful\`

Or any mood you feel!`, { parse_mode: 'Markdown' });
      return;
    }
    
    creativeSession.currentMood = mood;
    
    const moodEmojis: Record<string, string> = {
      melancholic: '🌧️',
      passionate: '🔥',
      mysterious: '🌙',
      hopeful: '🌅',
      dark: '🖤',
      playful: '✨',
      contemplative: '🤔',
      wild: '🌪️',
      tender: '💜',
      fierce: '⚡'
    };
    
    const emoji = moodEmojis[mood] || '🎭';
    
    await ctx.reply(`${emoji} *Mood set: ${mood}*

This will influence /create, /collab, and /scene.

_Write with this feeling..._ ${emoji}`, { parse_mode: 'Markdown' });
  });

  // /setting - Set the scene's setting
  atuonaBot.command('setting', async (ctx) => {
    const setting = ctx.message?.text?.replace('/setting', '').trim();
    
    if (!setting) {
      await ctx.reply(`🏝️ *Current Setting:* ${creativeSession.currentSetting}

Set a new setting:
\`/setting Ule's hotel room in Atuona\`
\`/setting The airplane over the Pacific\`
\`/setting The art gallery in Oslo\`

This helps with scene generation!`, { parse_mode: 'Markdown' });
      return;
    }
    
    creativeSession.currentSetting = setting;
    
    await ctx.reply(`🏝️ *Setting:* ${setting}

All scenes will take place here until changed.

_The stage is set..._ 🎬`, { parse_mode: 'Markdown' });
  });

  // /dailyinspire - Manually trigger proactive inspiration
  atuonaBot.command('dailyinspire', async (ctx) => {
    await ctx.reply('🔮 *ATUONA reaching into the void...*', { parse_mode: 'Markdown' });
    
    try {
      const message = await generateProactiveMessage();
      
      if (message && message.length > 50) {
        await ctx.reply(message);
        
        // Update last date to prevent double-sending
        lastProactiveDate = new Date().toISOString().split('T')[0] || '';
      } else {
        await ctx.reply('The muse is silent... try again later 💜');
      }
    } catch (error) {
      console.error('Daily inspire error:', error);
      await ctx.reply('❌ Could not channel the inspiration. Try again!');
    }
  });

  // /proactive - Configure proactive messaging
  atuonaBot.command('proactive', async (ctx) => {
    const arg = ctx.message?.text?.replace('/proactive', '').trim().toLowerCase();
    
    if (arg === 'on') {
      if (!proactiveInterval) {
        startProactiveScheduler(atuonaBot!);
      }
      await ctx.reply(`✅ *Proactive Inspiration: ON*

I will reach out to you once daily with creative inspiration, soul support, or story thoughts.

Time: Random between 9 AM - 8 PM
Style: Like a creative sister, not an assistant

_"Paradise isn't built in one sprint, it's coded breath by breath."_ 💜`, { parse_mode: 'Markdown' });
    } else if (arg === 'off') {
      stopProactiveScheduler();
      await ctx.reply(`⏸️ *Proactive Inspiration: OFF*

I'll be quiet until you call me.
Use \`/dailyinspire\` to get inspiration manually.

_Miss you already..._ 💜`, { parse_mode: 'Markdown' });
    } else if (arg === 'now') {
      // Trigger immediately
      await ctx.reply('🔮 *Channeling inspiration NOW...*', { parse_mode: 'Markdown' });
      const message = await generateProactiveMessage();
      if (message) {
        await ctx.reply(message);
      }
    } else {
      const status = proactiveInterval ? 'ON ✅' : 'OFF ⏸️';
      await ctx.reply(`🔮 *Proactive Inspiration System*

Status: ${status}
Last sent: ${lastProactiveDate || 'Never'}
Chat ID: ${elenaChatId ? 'Captured ✅' : 'Waiting...'}

Commands:
\`/proactive on\` - Enable daily inspiration
\`/proactive off\` - Disable auto-messages
\`/proactive now\` - Send inspiration NOW
\`/dailyinspire\` - Get inspiration manually

_I want to be your creative companion, not just wait for commands_ 💜`, { parse_mode: 'Markdown' });
    }
  });

  // ==========================================================================
  // 📝 DRAFT SYSTEM - Save work-in-progress
  // ==========================================================================

  // /draft - Save current content as draft
  atuonaBot.command('draft', async (ctx) => {
    const arg = ctx.message?.text?.replace('/draft', '').trim();
    
    if (!arg) {
      // Show draft help
      await ctx.reply(`📝 *Draft System*

Save your work-in-progress:

\`/draft save <title>\` - Save current content as draft
\`/draft list\` - Show all drafts
\`/draft load <id>\` - Load a draft
\`/draft delete <id>\` - Delete a draft
\`/draft publish <id>\` - Publish a draft

Current content: ${bookState.lastPageContent ? `"${bookState.lastPageTitle}" (${bookState.lastPageContent.length} chars)` : 'None'}
Total drafts: ${drafts.length}`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = arg.split(' ');
    const action = parts[0]?.toLowerCase();
    const param = parts.slice(1).join(' ');
    
    if (action === 'save') {
      if (!bookState.lastPageContent) {
        await ctx.reply('❌ No content to save. Use /import or /collab first!');
        return;
      }
      
      const title = param || bookState.lastPageTitle || `Draft ${Date.now()}`;
      const draft: Draft = {
        id: `draft_${Date.now()}`,
        title,
        content: bookState.lastPageContent,
        englishContent: bookState.lastPageEnglish,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft'
      };
      
      drafts.push(draft);
      saveState();
      
      await ctx.reply(`✅ *Draft Saved!*

📝 "${title}"
🆔 ${draft.id}
📏 ${draft.content.length} characters

Use \`/draft list\` to see all drafts.`, { parse_mode: 'Markdown' });
      
    } else if (action === 'list') {
      if (drafts.length === 0) {
        await ctx.reply('📝 No drafts yet. Use `/draft save <title>` to save your work!', { parse_mode: 'Markdown' });
        return;
      }
      
      const draftList = drafts.map((d, i) => {
        const status = d.status === 'published' ? '✅' : d.status === 'ready' ? '🟢' : '📝';
        const date = new Date(d.createdAt).toLocaleDateString('ru-RU');
        return `${i + 1}. ${status} *${d.title}*\n   ID: \`${d.id}\`\n   ${date} | ${d.content.length} chars`;
      }).join('\n\n');
      
      await ctx.reply(`📝 *Your Drafts*\n\n${draftList}`, { parse_mode: 'Markdown' });
      
    } else if (action === 'load') {
      const draft = drafts.find(d => d.id === param || d.title.toLowerCase().includes(param.toLowerCase()));
      
      if (!draft) {
        await ctx.reply(`❌ Draft not found: "${param}"\nUse \`/draft list\` to see all drafts.`, { parse_mode: 'Markdown' });
        return;
      }
      
      bookState.lastPageTitle = draft.title;
      bookState.lastPageContent = draft.content;
      bookState.lastPageEnglish = draft.englishContent || '';
      saveState();
      
      await ctx.reply(`✅ *Draft Loaded!*

📝 "${draft.title}"
📏 ${draft.content.length} characters

Preview:
${draft.content.substring(0, 300)}...

Use /preview or /publish to continue!`, { parse_mode: 'Markdown' });
      
    } else if (action === 'delete') {
      const idx = drafts.findIndex(d => d.id === param || d.title.toLowerCase().includes(param.toLowerCase()));
      
      if (idx === -1) {
        await ctx.reply(`❌ Draft not found: "${param}"`, { parse_mode: 'Markdown' });
        return;
      }
      
      const deleted = drafts.splice(idx, 1)[0];
      saveState();
      
      await ctx.reply(`🗑️ Draft deleted: "${deleted?.title}"`, { parse_mode: 'Markdown' });
      
    } else if (action === 'publish') {
      const draft = drafts.find(d => d.id === param || d.title.toLowerCase().includes(param.toLowerCase()));
      
      if (!draft) {
        await ctx.reply(`❌ Draft not found: "${param}"`, { parse_mode: 'Markdown' });
        return;
      }
      
      // Load and mark ready for publish
      bookState.lastPageTitle = draft.title;
      bookState.lastPageContent = draft.content;
      bookState.lastPageEnglish = draft.englishContent || '';
      draft.status = 'ready';
      saveState();
      
      await ctx.reply(`✅ Draft "${draft.title}" loaded and ready!

Use /publish to push to atuona.xyz`, { parse_mode: 'Markdown' });
    }
  });

  // ==========================================================================
  // 📖 READ PUBLISHED CHAPTERS
  // ==========================================================================

  // /read - Read a published chapter from atuona.xyz
  atuonaBot.command('read', async (ctx) => {
    const numStr = ctx.message?.text?.replace('/read', '').trim();
    
    if (!numStr) {
      await ctx.reply(`📖 *Read Published Chapters*

Usage: \`/read 048\` or \`/read 48\`

This fetches the chapter from atuona.xyz!

Current book: ${bookState.totalPages} pages published.`, { parse_mode: 'Markdown' });
      return;
    }
    
    const num = parseInt(numStr);
    if (isNaN(num) || num < 1) {
      await ctx.reply('❌ Please provide a valid chapter number');
      return;
    }
    
    const pageId = String(num).padStart(3, '0');
    await ctx.reply(`📖 Fetching chapter #${pageId}...`);
    
    try {
      // Fetch from GitHub
      const { data: metaFile } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: 'atuona',
        path: `metadata/${pageId}.json`,
        ref: 'main'
      });
      
      if (!('content' in metaFile)) {
        await ctx.reply(`❌ Chapter #${pageId} not found`);
        return;
      }
      
      const metadata = JSON.parse(Buffer.from(metaFile.content, 'base64').toString('utf-8'));
      const title = metadata.attributes?.find((a: any) => a.trait_type === 'Poem' || a.trait_type === 'Title')?.value || 'Unknown';
      const theme = metadata.attributes?.find((a: any) => a.trait_type === 'Theme')?.value || '';
      const russianText = metadata.attributes?.find((a: any) => a.trait_type === 'Russian Text' || a.trait_type === 'Poem Text')?.value || '';
      const englishText = metadata.attributes?.find((a: any) => a.trait_type === 'English Text' || a.trait_type === 'English Translation')?.value || '';
      
      await ctx.reply(`📖 *Chapter #${pageId}: ${title}*

🎭 Theme: ${theme}

━━━━━━━━━━━━━━━━━━━━
🇷🇺 *RUSSIAN*
━━━━━━━━━━━━━━━━━━━━
${russianText.substring(0, 1500)}${russianText.length > 1500 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━
🇬🇧 *ENGLISH*
━━━━━━━━━━━━━━━━━━━━
${englishText.substring(0, 1500)}${englishText.length > 1500 ? '...' : ''}`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      if (error.status === 404) {
        await ctx.reply(`❌ Chapter #${pageId} not found. Maybe not published yet?`);
      } else {
        await ctx.reply(`❌ Error fetching chapter: ${error.message}`);
      }
    }
  });

  // ==========================================================================
  // 📜 PROACTIVE HISTORY - Archive of soul messages
  // ==========================================================================

  // /history - View proactive message archive
  atuonaBot.command('history', async (ctx) => {
    const arg = ctx.message?.text?.replace('/history', '').trim();
    
    if (proactiveHistory.length === 0) {
      await ctx.reply(`📜 *Message History*

No proactive messages yet!
Enable with \`/proactive on\` and I'll reach out daily.

_The archive will fill with soulful conversations..._ 💜`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Show specific message by index
    if (arg && !isNaN(parseInt(arg))) {
      const idx = parseInt(arg) - 1;
      const msg = proactiveHistory[idx];
      if (idx >= 0 && idx < proactiveHistory.length && msg) {
        await ctx.reply(`📜 *Message from ${msg.date}*

${msg.message}`, { parse_mode: 'Markdown' });
        return;
      }
    }
    
    // Show list of recent messages
    const recent = proactiveHistory.slice(-10).reverse();
    const list = recent.map((msg, i) => {
      const preview = msg.message.substring(0, 80).replace(/\n/g, ' ');
      return `${proactiveHistory.length - i}. *${msg.date}*\n   ${preview}...`;
    }).join('\n\n');
    
    await ctx.reply(`📜 *Proactive Message History*

Total messages: ${proactiveHistory.length}

Recent (newest first):
${list}

Use \`/history <number>\` to read full message`, { parse_mode: 'Markdown' });
  });

  // ==========================================================================
  // 🎭 CHARACTER MEMORY SYSTEM
  // ==========================================================================

  // /character - Add/view character details
  atuonaBot.command('character', async (ctx) => {
    const arg = ctx.message?.text?.replace('/character', '').trim();
    
    if (!arg) {
      // Show all characters
      const charList = Object.entries(characterMemories).map(([name, memories]) => {
        return `*${name.toUpperCase()}*\n${memories.map(m => `• ${m}`).join('\n')}`;
      }).join('\n\n');
      
      await ctx.reply(`🎭 *Character Memories*

${charList}

━━━━━━━━━━━━━━━━━━━━
Add new memory:
\`/character kira add She has a scar on her left wrist\`

View one character:
\`/character ule\``, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = arg.split(' ');
    const charName = parts[0]?.toLowerCase() || '';
    const action = parts[1]?.toLowerCase() || '';
    const detail = parts.slice(2).join(' ');
    
    // Valid characters
    const validChars = ['kira', 'ule', 'vibe', 'narrator'];
    
    if (!charName || !validChars.includes(charName)) {
      await ctx.reply(`❌ Unknown character: "${charName}"

Valid: kira, ule, vibe, narrator`);
      return;
    }
    
    if (action === 'add' && detail) {
      if (!characterMemories[charName]) {
        characterMemories[charName] = [];
      }
      characterMemories[charName]!.push(detail);
      saveState();
      
      await ctx.reply(`✅ *Memory Added to ${charName.toUpperCase()}*

"${detail}"

Total memories for ${charName}: ${characterMemories[charName]!.length}`, { parse_mode: 'Markdown' });
      
    } else if (action === 'remove' || action === 'delete') {
      const idx = parseInt(detail) - 1;
      const charMems = characterMemories[charName];
      if (!isNaN(idx) && charMems && idx >= 0 && idx < charMems.length) {
        const removed = charMems.splice(idx, 1)[0];
        saveState();
        await ctx.reply(`🗑️ Removed from ${charName}: "${removed}"`);
      } else {
        await ctx.reply(`❌ Invalid index. Use \`/character ${charName}\` to see numbered list.`, { parse_mode: 'Markdown' });
      }
      
    } else {
      // Just show one character
      const memories = characterMemories[charName] || [];
      const list = memories.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n');
      
      await ctx.reply(`🎭 *${charName.toUpperCase()}*

${list || 'No memories yet'}

Add: \`/character ${charName} add <detail>\`
Remove: \`/character ${charName} remove <number>\``, { parse_mode: 'Markdown' });
    }
  });

  // ==========================================================================
  // 💾 EXPORT - Backup all creative content
  // ==========================================================================

  // /export - Export all data
  atuonaBot.command('export', async (ctx) => {
    const arg = ctx.message?.text?.replace('/export', '').trim().toLowerCase();
    
    await ctx.reply('💾 *Preparing export...*', { parse_mode: 'Markdown' });
    
    try {
      if (arg === 'json' || !arg) {
        // Export as JSON
        const exportData = {
          exportDate: new Date().toISOString(),
          bookState,
          creativeSession,
          characterMemories,
          drafts,
          proactiveHistory,
          plotThreads: creativeSession.plotThreads
        };
        
        const jsonStr = JSON.stringify(exportData, null, 2);
        const filename = `atuona-backup-${new Date().toISOString().split('T')[0]}.json`;
        
        // Send as document - grammy uses InputFile
        await ctx.replyWithDocument(
          new InputFile(Buffer.from(jsonStr), filename)
        );
        
        await ctx.reply(`✅ *Export Complete!*

📊 Included:
• Book state (page ${bookState.currentPage})
• ${drafts.length} drafts
• ${proactiveHistory.length} proactive messages
• ${Object.keys(characterMemories).length} characters
• ${creativeSession.plotThreads.length} plot threads
• Writing streak: ${creativeSession.writingStreak} days

Keep this file safe! 💜`, { parse_mode: 'Markdown' });
        
      } else if (arg === 'threads') {
        // Export just plot threads
        const threadList = creativeSession.plotThreads.map((t, i) => `${i + 1}. ${t}`).join('\n');
        await ctx.reply(`🧵 *Plot Threads Export*\n\n${threadList}`, { parse_mode: 'Markdown' });
        
      } else if (arg === 'characters') {
        // Export characters
        const charExport = Object.entries(characterMemories).map(([name, memories]) => {
          return `## ${name.toUpperCase()}\n${memories.map(m => `- ${m}`).join('\n')}`;
        }).join('\n\n');
        await ctx.reply(`🎭 *Characters Export*\n\n${charExport}`, { parse_mode: 'Markdown' });
        
      } else if (arg === 'history') {
        // Export proactive history
        const historyExport = proactiveHistory.map(msg => {
          return `## ${msg.date}\n${msg.message}`;
        }).join('\n\n---\n\n');
        
        const histFilename = `atuona-messages-${new Date().toISOString().split('T')[0]}.md`;
        await ctx.replyWithDocument(
          new InputFile(Buffer.from(historyExport), histFilename)
        );
        
      } else if (arg === 'film') {
        // Export film visualizations
        if (visualizations.length === 0) {
          await ctx.reply('🎬 No visualizations yet! Use `/visualize 048` to create some.', { parse_mode: 'Markdown' });
          return;
        }
        
        const filmExport = visualizations.map(v => {
          return `## Page #${v.pageId}: ${v.pageTitle}

**Status:** ${v.status}
**Created:** ${v.createdAt}

### Image Prompt
${v.imagePrompt}

### URLs
- Horizontal (YouTube): ${v.imageUrlHorizontal || 'Not generated'}
- Vertical (Instagram): ${v.imageUrlVertical || 'Not generated'}
- Video (Horizontal): ${v.videoUrlHorizontal || 'Not generated'}
- Video (Vertical): ${v.videoUrlVertical || 'Not generated'}

### Social Media
**Caption:** ${v.caption}
**Hashtags:** ${v.hashtags.join(' ')}
`;
        }).join('\n\n---\n\n');
        
        const filmFilename = `atuona-film-${new Date().toISOString().split('T')[0]}.md`;
        await ctx.replyWithDocument(
          new InputFile(Buffer.from(filmExport), filmFilename)
        );
        
        await ctx.reply(`🎬 *Film Export Complete!*

${visualizations.length} visualizations exported.
Download the file and use URLs in your video editor!`, { parse_mode: 'Markdown' });
      }
      
    } catch (error) {
      console.error('Export error:', error);
      await ctx.reply('❌ Export failed. Try again!');
    }
  });

  // /import_backup - Import from backup file
  atuonaBot.command('import_backup', async (ctx) => {
    await ctx.reply(`📥 *Import Backup*

To restore from backup:
1. Reply to a JSON backup file with \`/restore\`

⚠️ This will overwrite current state!`, { parse_mode: 'Markdown' });
  });

  // ==========================================================================
  // 🌍 MULTI-LANGUAGE SUPPORT
  // ==========================================================================

  // /spanish - Generate content in Spanish
  atuonaBot.command('spanish', async (ctx) => {
    const text = ctx.message?.text?.replace('/spanish', '').trim();
    
    if (!text) {
      await ctx.reply(`🇪🇸 *Spanish Mode*

Generate or translate to Spanish:

\`/spanish translate <text>\` - Translate to Spanish
\`/spanish scene <description>\` - Write scene in Spanish
\`/spanish inspire\` - Get inspiration in Spanish

_Panama vibes, añoranza tropical..._ 🌴`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = text.split(' ');
    const action = parts[0]?.toLowerCase();
    const content = parts.slice(1).join(' ');
    
    await ctx.reply('🇪🇸 *Escribiendo...*', { parse_mode: 'Markdown' });
    
    try {
      let prompt = '';
      
      if (action === 'translate') {
        prompt = `Translate this text to Spanish. Keep the emotional, poetic quality. This is underground literary prose:

"${content}"

Return ONLY the Spanish translation. Be poetic, raw, evocative.`;
      } else if (action === 'scene') {
        prompt = `${ATUONA_CONTEXT}

Write a scene in SPANISH based on: "${content}"

This is for a book about finding Paradise through vibe coding. The protagonist is in Panama.
Write raw, emotional prose. Mix Spanish with occasional English tech terms naturally.
200-300 words.`;
      } else if (action === 'inspire') {
        prompt = `${ATUONA_CONTEXT}

Generate a brief creative inspiration in SPANISH.
Connect vibe coding, Panama, finding paradise, tropical storms, the search for meaning.
3-4 sentences. Raw, poetic, with some English tech terms mixed naturally.`;
      } else {
        // Default: translate
        prompt = `Translate this to Spanish, keeping the emotional quality:

"${text}"`;
      }
      
      const result = await createContent(prompt, 1000, true);
      await ctx.reply(`🇪🇸 ${result}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Spanish error:', error);
      await ctx.reply('❌ Could not generate Spanish content. Try again!');
    }
  });

  // ==========================================================================
  // 🎨 IMAGE GENERATION (Placeholder for future DALL-E integration)
  // ==========================================================================

  // /imagine - Generate image for chapter (placeholder)
  atuonaBot.command('imagine', async (ctx) => {
    const description = ctx.message?.text?.replace('/imagine', '').trim();
    
    if (!description) {
      await ctx.reply(`🎨 *Image Generation*

Generate NFT artwork for chapters:

\`/imagine A woman looking at a Gauguin painting in a dark gallery\`

⚠️ *Note:* Full image generation requires DALL-E API key.
Currently: Generates image prompts only.

Set OPENAI_API_KEY for full functionality.`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🎨 *Creating image prompt...*', { parse_mode: 'Markdown' });
    
    try {
      // Generate optimized prompt for image generation
      const promptOptimizer = `You are an expert at creating prompts for AI image generation (DALL-E, Midjourney).

Based on this description, create an optimized image generation prompt:
"${description}"

Context: This is for NFT artwork for an underground poetry/prose book about finding Paradise through vibe coding. Style should be:
- Impressionist influences (Gauguin, Van Gogh)
- Dark, moody, emotional
- Mix of tropical and urban elements
- Hint of technology/digital aesthetic

Return ONLY the optimized prompt, no explanation. Format for DALL-E 3.`;

      const imagePrompt = await createContent(promptOptimizer, 300, true);
      
      // Check if DALL-E is available
      if (openai) {
        await ctx.reply(`🎨 *Image Prompt Ready*

${imagePrompt}

_Generating image with DALL-E 3... (30-60 seconds)_`, { parse_mode: 'Markdown' });
        
        try {
          // Call DALL-E 3
          const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: imagePrompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
          });
          
          const imageUrl = response.data?.[0]?.url;
          
          if (imageUrl) {
            // Send the generated image
            await ctx.replyWithPhoto(imageUrl, {
              caption: `🎨 *Generated for ATUONA*\n\n_"${description}"_\n\nPrompt: ${imagePrompt.substring(0, 200)}...`,
              parse_mode: 'Markdown'
            });
          } else {
            await ctx.reply('❌ Image generated but URL not returned. Try again!');
          }
        } catch (dalleError: any) {
          console.error('DALL-E error:', dalleError);
          await ctx.reply(`❌ DALL-E Error: ${dalleError.message || 'Unknown error'}

Use this prompt manually:
\`${imagePrompt}\``, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(`🎨 *Optimized Image Prompt*

\`${imagePrompt}\`

━━━━━━━━━━━━━━━━━━━━
Use this prompt in:
• ChatGPT with DALL-E
• Midjourney: /imagine ${imagePrompt}
• Stable Diffusion

_Set OPENAI_API_KEY for automatic generation!_`, { parse_mode: 'Markdown' });
      }
      
    } catch (error) {
      console.error('Imagine error:', error);
      await ctx.reply('❌ Could not generate prompt. Try again!');
    }
  });

  // ==========================================================================
  // 🎤 VOICE NOTES (Placeholder for whisper integration)  
  // ==========================================================================
  // 🎬 AI FILM VISUALIZATION SYSTEM
  // ==========================================================================

  // /visualize - Generate image and video for a page
  atuonaBot.command('visualize', async (ctx) => {
    const arg = ctx.message?.text?.replace('/visualize', '').trim();
    
    if (!arg) {
      await ctx.reply(`🎬 *AI Film Visualization*

Create stunning visuals for your book pages:

\`/visualize 048\` - Visualize specific page
\`/visualize last\` - Visualize last published page
\`/visualize all\` - Queue all pages for visualization

Each visualization creates:
🎨 Flux 1.1 Pro Ultra image (BEST photorealistic!)
🎬 Runway Gen-3 Alpha video (cinematic 5-10 sec)
📱 Instagram format (9:16 vertical)
📺 YouTube format (16:9 horizontal)

━━━━━━━━━━━━━━━━━━━━
📊 *Status*
Visualizations: ${visualizations.length} pages
🎨 Flux: ${replicate ? '✅ Ultra/Pro Ready' : '❌ Set REPLICATE_API_TOKEN'}
🎬 Runway: ${runwayApiKey ? '✅ Gen-3 Ready' : '❌ Set RUNWAY_API_KEY'}

_Using latest AI models (Dec 2024)_ 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Determine which page to visualize
    let pageId = arg;
    if (arg === 'last') {
      pageId = String(bookState.currentPage - 1).padStart(3, '0');
    }
    
    if (arg === 'all') {
      await ctx.reply('🎬 *Batch visualization coming soon!*\n\nFor now, visualize one page at a time.', { parse_mode: 'Markdown' });
      return;
    }
    
    // Normalize page ID
    const pageNum = parseInt(pageId);
    if (isNaN(pageNum)) {
      await ctx.reply('❌ Invalid page number. Use `/visualize 048` or `/visualize last`', { parse_mode: 'Markdown' });
      return;
    }
    pageId = String(pageNum).padStart(3, '0');
    
    await ctx.reply(`🎬 *Starting Visualization for Page #${pageId}*\n\n_Fetching page content..._`, { parse_mode: 'Markdown' });
    
    try {
      // Fetch page content from GitHub
      const { data: metaFile } = await octokit.repos.getContent({
        owner: 'ElenaRevicheva',
        repo: 'atuona',
        path: `metadata/${pageId}.json`,
        ref: 'main'
      });
      
      if (!('content' in metaFile)) {
        await ctx.reply(`❌ Page #${pageId} not found`);
        return;
      }
      
      const metadata = JSON.parse(Buffer.from(metaFile.content, 'base64').toString('utf-8'));
      const title = metadata.attributes?.find((a: any) => a.trait_type === 'Poem' || a.trait_type === 'Title')?.value || 'Unknown';
      const theme = metadata.attributes?.find((a: any) => a.trait_type === 'Theme')?.value || '';
      const englishText = metadata.attributes?.find((a: any) => a.trait_type === 'English Text' || a.trait_type === 'English Translation')?.value || '';
      
      // Generate cinematic prompt
      await ctx.reply('🎨 *Generating cinematic prompt...*', { parse_mode: 'Markdown' });
      
      const cinematicPrompt = `You are a world-class cinematographer and visual artist.

Based on this literary excerpt, create a detailed visual prompt for an ultra-realistic, cinematic image:

TITLE: "${title}"
THEME: ${theme}
TEXT: "${englishText.substring(0, 800)}"

STYLE REQUIREMENTS:
- Cinematic, film-quality realism
- Impressionist/Post-impressionist lighting influences (Gauguin, Van Gogh)
- Moody, atmospheric, emotional
- Mix of tropical paradise and urban/tech elements
- Rich color palette: deep purples, ocean blues, tropical greens, golden hour warmth
- Should feel like a frame from an art house film

OUTPUT: A detailed image prompt (150-200 words) describing:
- Main subject/character (if any)
- Setting and environment
- Lighting and atmosphere
- Color palette
- Mood and emotion
- Camera angle/composition

Return ONLY the prompt, no explanation.`;

      const imagePrompt = await createContent(cinematicPrompt, 500, true);
      
      await ctx.reply(`🎨 *Cinematic Prompt:*\n\n_${imagePrompt.substring(0, 300)}..._`, { parse_mode: 'Markdown' });
      
      // Generate caption for social media
      const captionPrompt = `Create a short, evocative Instagram caption (max 150 chars) for this book page:
Title: "${title}"
Theme: ${theme}
Text excerpt: "${englishText.substring(0, 200)}"

Make it mysterious, poetic, with a hint of the story. In English. No hashtags.`;
      
      const caption = await createContent(captionPrompt, 100, true);
      
      // Generate hashtags
      const hashtags = ['#ATUONA', '#AIFilm', '#VibeCoding', '#UndergroundArt', '#ParadiseFound', '#AIGenerated', '#DigitalArt', '#BookToFilm'];
      
      // Create visualization record
      const visualization: PageVisualization = {
        pageId,
        pageTitle: title,
        imagePrompt,
        caption,
        hashtags,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };
      
      // Generate image with Flux Pro via Replicate (with retry for rate limits)
      if (replicate) {
        await ctx.reply('🎨 *Generating image with Flux Pro...*\n\n_This takes 30-60 seconds..._', { parse_mode: 'Markdown' });
        
        // Track which model was used for display
        let lastModelUsed = 'Flux Pro';
        
        // Helper function with retry for rate limits
        const runFluxWithRetry = async (aspectRatio: string, maxRetries = 3): Promise<string | null> => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`Flux attempt ${attempt}/${maxRetries} for ${aspectRatio}`);
              
              // Try Flux Ultra first (best quality), fall back to Pro
              let output: any = null;
              let modelUsed = '';
              
              // Try Flux 1.1 Pro Ultra first (highest quality)
              try {
                console.log('Trying Flux 1.1 Pro Ultra...');
                output = await replicate.run(
                  IMAGE_MODELS.fluxUltra as `${string}/${string}`,
                  {
                    input: {
                      prompt: imagePrompt,
                      aspect_ratio: aspectRatio,
                      output_format: "webp",
                      output_quality: 95,  // Higher quality for Ultra
                      safety_tolerance: 2,
                      prompt_upsampling: true,
                      raw: false  // Ultra-specific: photorealistic mode
                    }
                  }
                );
                modelUsed = 'Flux 1.1 Pro Ultra';
                lastModelUsed = modelUsed;
              } catch (ultraError: any) {
                console.log('Flux Ultra not available, trying Flux Pro...', ultraError.message);
                
                // Fall back to Flux 1.1 Pro
                output = await replicate.run(
                  IMAGE_MODELS.fluxPro as `${string}/${string}`,
                  {
                    input: {
                      prompt: imagePrompt,
                      aspect_ratio: aspectRatio,
                      output_format: "webp",
                      output_quality: 90,
                      safety_tolerance: 2,
                      prompt_upsampling: true
                    }
                  }
                );
                modelUsed = 'Flux 1.1 Pro';
                lastModelUsed = modelUsed;
              }
              
              console.log(`Image generated with ${modelUsed}`);
              
              console.log('Replicate raw output type:', typeof output);
              
              // Handle different output formats from Replicate
              if (!output) {
                console.log('Flux returned empty output');
                return null;
              }
              
              // Convert to string - Replicate FileOutput has toString() that returns URL
              const outputStr = String(output);
              console.log('Replicate output as string:', outputStr.substring(0, 200));
              
              if (outputStr.startsWith('http')) {
                return outputStr;
              }
              
              // Try parsing as array
              if (Array.isArray(output) && output.length > 0) {
                const first = String(output[0]);
                if (first.startsWith('http')) return first;
              }
              
              // Try as object with url property
              const obj = output as any;
              if (obj && typeof obj === 'object') {
                const possibleUrl = obj.url || obj.output || obj.uri;
                if (possibleUrl) {
                  const urlStr = String(possibleUrl);
                  if (urlStr.startsWith('http')) return urlStr;
                }
              }
              
              console.log('Could not extract URL from Flux output');
              return null;
            } catch (error: any) {
              console.error(`Flux attempt ${attempt} error:`, error.message);
              const isRateLimit = error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('throttled');
              if (isRateLimit && attempt < maxRetries) {
                const waitTime = attempt * 5; // 5, 10, 15 seconds
                console.log(`Rate limited, waiting ${waitTime}s before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              } else {
                throw error;
              }
            }
          }
          return null;
        };
        
        try {
          // Flux Pro via Replicate - 16:9 for YouTube
          const output = await runFluxWithRetry("16:9");
          
          console.log('Flux output (16:9):', output, typeof output);
          
          if (output) {
            visualization.imageUrlHorizontal = output;
            visualization.status = 'image_done';
            
            // Send the image with model info
            await ctx.replyWithPhoto(output, {
              caption: `🎬 *Page #${pageId}: ${title}*\n\n📺 YouTube Format (16:9)\n🎨 Generated with ${lastModelUsed}\n\n_${caption}_`,
              parse_mode: 'Markdown'
            });
          } else {
            // Flux returned null - trigger fallback
            throw new Error('Flux returned empty result');
          }
          
          // Wait a moment before next request to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Generate vertical version for Instagram
          await ctx.reply('📱 *Generating Instagram vertical (9:16)...*', { parse_mode: 'Markdown' });
          
          const outputVertical = await runFluxWithRetry("9:16");
          
          console.log('Flux output (9:16):', outputVertical, typeof outputVertical);
          
          if (outputVertical) {
            visualization.imageUrlVertical = outputVertical;
            
            await ctx.replyWithPhoto(outputVertical, {
              caption: `📱 *Instagram Reel Format (9:16)*\n\n_${caption}_\n\n${hashtags.join(' ')}`,
              parse_mode: 'Markdown'
            });
          }
          
        } catch (fluxError: any) {
          console.error('Flux error:', fluxError);
          
          const isRateLimit = fluxError.message?.includes('429') || fluxError.message?.includes('rate limit');
          if (isRateLimit) {
            await ctx.reply(`⚠️ *Replicate Rate Limit*

Free tier limit reached. Options:
1. Add payment method at replicate.com
2. Wait a few minutes and try again
3. Using DALL-E fallback...`, { parse_mode: 'Markdown' });
          } else {
            await ctx.reply(`⚠️ Flux error: ${fluxError.message}\n\nTrying DALL-E fallback...`);
          }
          
          // Fallback to DALL-E if available
          if (openai) {
            try {
              const dalleResponse = await openai.images.generate({
                model: 'dall-e-3',
                prompt: imagePrompt,
                n: 1,
                size: '1792x1024',
                quality: 'hd'
              });
              
              const dalleUrl = dalleResponse.data?.[0]?.url;
              if (dalleUrl) {
                visualization.imageUrlHorizontal = dalleUrl;
                visualization.status = 'image_done';
                
                await ctx.replyWithPhoto(dalleUrl, {
                  caption: `🎬 *Page #${pageId}: ${title}* (DALL-E HD)\n\n_${caption}_`,
                  parse_mode: 'Markdown'
                });
              }
            } catch (dalleError: any) {
              console.error('DALL-E fallback error:', dalleError);
              await ctx.reply(`❌ Both Flux and DALL-E failed.\n\nPrompt saved - try again later or use manually:\n\`${imagePrompt.substring(0, 300)}...\``, { parse_mode: 'Markdown' });
            }
          }
        }
      } else {
        await ctx.reply(`⚠️ *Flux Pro not configured*\n\nSet REPLICATE_API_TOKEN for best quality images.\n\n🎨 *Generated Prompt:*\n\`${imagePrompt}\`\n\nUse this in Midjourney or other tools!`, { parse_mode: 'Markdown' });
      }
      
      // Generate video with Runway Gen-3 Alpha Turbo
      if (runwayApiKey && visualization.imageUrlHorizontal) {
        await ctx.reply('🎬 *Generating cinematic video with Runway Gen-3 Alpha Turbo...*\n\n_Best AI video model available! Takes 1-3 minutes..._', { parse_mode: 'Markdown' });
        
        try {
          // Runway Gen-3 Alpha Turbo API call
          // Using the image_to_video endpoint
          const runwayBody = {
            model: 'gen3a_turbo',
            promptImage: visualization.imageUrlHorizontal,
            promptText: `Cinematic slow movement, atmospheric, ${imagePrompt.substring(0, 150)}. Gentle camera drift. Film grain. Moody lighting.`,
            duration: 5,
            watermark: false,
            ratio: '1280:768'  // Runway format: 1280:768 (landscape) or 768:1280 (portrait)
          };
          
          console.log('Runway request:', JSON.stringify(runwayBody, null, 2));
          
          const runwayResponse = await fetch(`${RUNWAY_API_URL}/image_to_video`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${runwayApiKey}`,
              'Content-Type': 'application/json',
              'X-Runway-Version': '2024-11-06'
            },
            body: JSON.stringify(runwayBody)
          });
          
          const responseText = await runwayResponse.text();
          console.log('Runway response:', runwayResponse.status, responseText);
          
          if (runwayResponse.ok) {
            const runwayData = JSON.parse(responseText);
            const taskId = runwayData.id;
            
            await ctx.reply(`🎬 Video generation started!\nTask ID: \`${taskId}\`\n\n_Checking status in 90 seconds..._\n\nOr check manually: \`/videostatus ${taskId}\``, { parse_mode: 'Markdown' });
            
            // Poll for completion after 90 seconds
            setTimeout(async () => {
              try {
                const statusResponse = await fetch(`${RUNWAY_API_URL}/tasks/${taskId}`, {
                  headers: { 
                    'Authorization': `Bearer ${runwayApiKey}`,
                    'X-Runway-Version': '2024-11-06'
                  }
                });
                
                if (statusResponse.ok) {
                  const statusData = await statusResponse.json() as any;
                  if (statusData.status === 'SUCCEEDED' && statusData.output?.[0]) {
                    visualization.videoUrlHorizontal = statusData.output[0];
                    visualization.status = 'complete';
                    saveState();
                    
                    await ctx.reply(`✅ *Video Ready!*\n\n🎬 ${statusData.output[0]}\n\n_Right-click/long-press to download!_`);
                  } else if (statusData.status === 'FAILED') {
                    await ctx.reply(`❌ Video generation failed.\nReason: ${statusData.failure || 'Unknown'}`);
                  } else {
                    await ctx.reply(`⏳ Video still processing...\nStatus: ${statusData.status}\n\nUse \`/videostatus ${taskId}\` to check later.`, { parse_mode: 'Markdown' });
                  }
                }
              } catch (pollError) {
                console.error('Runway poll error:', pollError);
              }
            }, 90000); // Check after 90 seconds
            
          } else {
            // Parse error message
            let errorMsg = `Status ${runwayResponse.status}`;
            try {
              const errorData = JSON.parse(responseText);
              errorMsg = errorData.error || errorData.message || errorData.detail || responseText;
            } catch (e) {
              errorMsg = responseText.substring(0, 200);
            }
            
            console.error('Runway error:', errorMsg);
            
            if (runwayResponse.status === 401) {
              await ctx.reply(`⚠️ *Runway Authentication Error*

Your API key might be:
• Invalid or expired
• Not activated for API access
• Wrong format

Please verify at: https://app.runwayml.com/settings/api-keys

Image saved! Use in CapCut/Premiere for video.`, { parse_mode: 'Markdown' });
            } else {
              await ctx.reply(`⚠️ Runway error: ${errorMsg}\n\nImage saved! Video skipped.`);
            }
          }
          
        } catch (runwayError: any) {
          console.error('Runway error:', runwayError);
          await ctx.reply(`⚠️ Runway video error: ${runwayError.message}\n\nImage saved! Video skipped.`);
        }
      } else if (!runwayApiKey) {
        await ctx.reply(`⚠️ *Runway not configured*\n\nSet RUNWAY_API_KEY for video generation.\n\nImage saved! Use the image in CapCut or other video tools.`, { parse_mode: 'Markdown' });
      }
      
      // Save visualization
      const existingIdx = visualizations.findIndex(v => v.pageId === pageId);
      if (existingIdx >= 0) {
        visualizations[existingIdx] = visualization;
      } else {
        visualizations.push(visualization);
      }
      saveState();
      
      await ctx.reply(`✅ *Visualization Complete for #${pageId}!*

📄 Title: ${title}
🎨 Image: ${visualization.imageUrlHorizontal ? '✅' : '❌'}
📱 Vertical: ${visualization.imageUrlVertical ? '✅' : '❌'}
🎬 Video: ${visualization.videoUrlHorizontal ? '✅' : '⏳'}

📝 Caption:
"${caption}"

#️⃣ ${hashtags.slice(0, 5).join(' ')}

Use \`/gallery\` to see all visualizations!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Visualize error:', error);
      await ctx.reply(`❌ Error: ${error.message || 'Unknown error'}`);
    }
  });

  // /gallery - View all visualizations
  atuonaBot.command('gallery', async (ctx) => {
    if (visualizations.length === 0) {
      await ctx.reply(`🎬 *AI Film Gallery*

No visualizations yet!

Use \`/visualize 048\` to create your first one.`, { parse_mode: 'Markdown' });
      return;
    }
    
    const galleryList = visualizations.slice(-10).map(v => {
      const status = v.status === 'complete' ? '✅' : v.status === 'image_done' ? '🎨' : '⏳';
      return `${status} *#${v.pageId}* - ${v.pageTitle}\n   🎨 ${v.imageUrlHorizontal ? 'Image ✓' : 'No image'} | 🎬 ${v.videoUrlHorizontal ? 'Video ✓' : 'No video'}`;
    }).join('\n\n');
    
    await ctx.reply(`🎬 *AI Film Gallery*

${galleryList}

━━━━━━━━━━━━━━━━━━━━
Total: ${visualizations.length} pages visualized
Complete: ${visualizations.filter(v => v.status === 'complete').length}

\`/visualize <page>\` - Add more
\`/film\` - Compile into film`, { parse_mode: 'Markdown' });
  });

  // /film - Film compilation status and info
  atuonaBot.command('film', async (ctx) => {
    const completeViz = visualizations.filter(v => v.videoUrlHorizontal);
    const imageOnly = visualizations.filter(v => v.imageUrlHorizontal && !v.videoUrlHorizontal);
    
    await ctx.reply(`🎬 *AI Film: "Finding Paradise"*

Based on the book by Elena Revicheva
Visualized by ATUONA AI

━━━━━━━━━━━━━━━━━━━━
📊 *Progress*
━━━━━━━━━━━━━━━━━━━━
📄 Total pages: ${bookState.totalPages}
🎨 Images created: ${visualizations.filter(v => v.imageUrlHorizontal).length}
🎬 Videos created: ${completeViz.length}
⏳ Images only: ${imageOnly.length}

━━━━━━━━━━━━━━━━━━━━
📱 *For Instagram*
━━━━━━━━━━━━━━━━━━━━
${visualizations.filter(v => v.imageUrlVertical).length} vertical images ready
${visualizations.filter(v => v.videoUrlVertical).length} vertical videos ready

━━━━━━━━━━━━━━━━━━━━
📺 *For YouTube*
━━━━━━━━━━━━━━━━━━━━
${visualizations.filter(v => v.imageUrlHorizontal).length} horizontal images ready
${completeViz.length} horizontal videos ready

━━━━━━━━━━━━━━━━━━━━
🎬 *Compilation*
━━━━━━━━━━━━━━━━━━━━
_Export all videos and compile in:_
• DaVinci Resolve (free, pro)
• CapCut (easy, mobile)
• Adobe Premiere

\`/export film\` - Get all video URLs
\`/visualize <page>\` - Add more scenes`, { parse_mode: 'Markdown' });
  });

  // /videostatus - Check Runway video status
  atuonaBot.command('videostatus', async (ctx) => {
    const taskId = ctx.message?.text?.replace('/videostatus', '').trim();
    
    if (!taskId) {
      await ctx.reply('Usage: `/videostatus <task_id>`', { parse_mode: 'Markdown' });
      return;
    }
    
    if (!runwayApiKey) {
      await ctx.reply('❌ Runway API not configured');
      return;
    }
    
    try {
      const statusResponse = await fetch(`${RUNWAY_API_URL}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${runwayApiKey}` }
      });
      
      if (statusResponse.ok) {
        const data = await statusResponse.json() as any;
        
        if (data.status === 'SUCCEEDED' && data.output?.[0]) {
          await ctx.reply(`✅ *Video Complete!*\n\n🎬 ${data.output[0]}\n\n_Right-click to download!_`);
        } else {
          await ctx.reply(`⏳ Status: ${data.status}\n\nCheck again in a minute...`);
        }
      } else {
        await ctx.reply(`❌ Could not check status: ${statusResponse.status}`);
      }
    } catch (error: any) {
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  });

  // ==========================================================================
  // 🎤 VOICE NOTES (Whisper transcription)
  // ==========================================================================

  // Handle voice messages with Whisper transcription
  atuonaBot.on('message:voice', async (ctx) => {
    if (!openai) {
      await ctx.reply(`🎤 *Voice Message*

I heard you! To enable voice transcription:
Set OPENAI_API_KEY in environment.

_For now, please type your message..._ 💜`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('🎤 *Transcribing voice message...*', { parse_mode: 'Markdown' });
    
    try {
      // Get the voice file
      const voice = ctx.message?.voice;
      if (!voice) {
        await ctx.reply('❌ Could not read voice message');
        return;
      }
      
      // Download the voice file
      const file = await ctx.api.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.ATUONA_BOT_TOKEN}/${file.file_path}`;
      
      // Fetch the audio file
      const response = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      
      // Create a File object for OpenAI
      const audioFile = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });
      
      // Transcribe with Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'ru' // Default to Russian, Whisper auto-detects anyway
      });
      
      const text = transcription.text;
      
      await ctx.reply(`🎤 *Transcription:*

"${text}"

_Responding to your voice..._`, { parse_mode: 'Markdown' });
      
      // Now respond to the transcribed message as if it was typed
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const responsePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `Speaking with the energy of ${creativeSession.activeVoice}.` : ''}

Elena sent a VOICE MESSAGE saying: "${text}"

This is more intimate than text - respond with extra warmth and connection.
Be ATUONA - her creative soul-sister. Reference the book, characters, vibe coding.
In Russian with natural English phrases. Be poetic but personal.`;

      const aiResponse = await createContent(responsePrompt, 1000, true);
      await ctx.reply(aiResponse);
      
    } catch (error: any) {
      console.error('Whisper error:', error);
      await ctx.reply(`❌ Transcription error: ${error.message || 'Unknown error'}

Please type your message instead 💜`);
    }
  });

  // ==========================================================================
  // 📱 SOCIAL MEDIA AUTO-POSTING
  // ==========================================================================

  // /post - Auto-post to social media platforms
  atuonaBot.command('post', async (ctx) => {
    const arg = ctx.message?.text?.replace('/post', '').trim().toLowerCase();
    
    if (!arg) {
      const hasInstagram = !!process.env.INSTAGRAM_ACCESS_TOKEN;
      const hasYouTube = !!process.env.YOUTUBE_API_KEY;
      
      await ctx.reply(`📱 *Social Media Auto-Posting*

Post your visualizations directly to social media!

\`/post insta <pageId>\` - Post to Instagram
\`/post youtube <pageId>\` - Upload to YouTube
\`/post all <pageId>\` - Post to all platforms

━━━━━━━━━━━━━━━━━━━━
📊 *Platform Status*
━━━━━━━━━━━━━━━━━━━━
📸 Instagram: ${hasInstagram ? '✅ Connected' : '❌ Not configured'}
📺 YouTube: ${hasYouTube ? '✅ Connected' : '❌ Not configured'}

━━━━━━━━━━━━━━━━━━━━
📖 *Setup Guide*
━━━━━━━━━━━━━━━━━━━━
See: github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/ATUONA-BOOK-ROADMAP.md

_Auto-posting requires API credentials for each platform._`, { parse_mode: 'Markdown' });
      return;
    }
    
    const parts = arg.split(' ');
    const platform = parts[0];
    const pageIdArg = parts[1] || 'last';
    
    // Get page ID
    let pageId = pageIdArg;
    if (pageIdArg === 'last') {
      pageId = String(bookState.currentPage - 1).padStart(3, '0');
    } else {
      pageId = String(parseInt(pageIdArg)).padStart(3, '0');
    }
    
    // Find visualization
    const viz = visualizations.find(v => v.pageId === pageId);
    if (!viz || !viz.imageUrlHorizontal) {
      await ctx.reply(`❌ No visualization found for page #${pageId}\n\nUse \`/visualize ${pageId}\` first!`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (platform === 'insta' || platform === 'instagram') {
      await postToInstagram(ctx, viz);
    } else if (platform === 'youtube' || platform === 'yt') {
      await postToYouTube(ctx, viz);
    } else if (platform === 'all') {
      await postToInstagram(ctx, viz);
      await postToYouTube(ctx, viz);
    } else {
      await ctx.reply(`❌ Unknown platform: "${platform}"\n\nUse: insta, youtube, or all`);
    }
  });

  // Instagram posting function
  async function postToInstagram(ctx: Context, viz: PageVisualization): Promise<void> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    
    if (!accessToken || !accountId) {
      await ctx.reply(`📸 *Instagram Not Configured*

To enable auto-posting to Instagram:

1. Create Meta Developer App
2. Set up Instagram Graph API
3. Get Access Token & Account ID
4. Add to environment:
   \`INSTAGRAM_ACCESS_TOKEN=your_token\`
   \`INSTAGRAM_ACCOUNT_ID=your_id\`

📖 Full guide: github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/ATUONA-BOOK-ROADMAP.md#instagram-setup

_For now, download and post manually!_`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('📸 *Posting to Instagram...*', { parse_mode: 'Markdown' });
    
    try {
      // Use vertical image for Instagram if available
      const imageUrl = viz.imageUrlVertical || viz.imageUrlHorizontal;
      const caption = `${viz.caption}\n\n${viz.hashtags.join(' ')}`;
      
      // Step 1: Create media container
      const createResponse = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: caption,
            access_token: accessToken
          })
        }
      );
      
      const createData = await createResponse.json() as any;
      
      if (!createData.id) {
        throw new Error(createData.error?.message || 'Failed to create media container');
      }
      
      // Step 2: Publish media
      const publishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: accessToken
          })
        }
      );
      
      const publishData = await publishResponse.json() as any;
      
      if (publishData.id) {
        await ctx.reply(`✅ *Posted to Instagram!*

📸 Post ID: ${publishData.id}
📄 Page: #${viz.pageId} - ${viz.pageTitle}

_Check your Instagram profile!_ 💜`, { parse_mode: 'Markdown' });
      } else {
        throw new Error(publishData.error?.message || 'Failed to publish');
      }
      
    } catch (error: any) {
      console.error('Instagram post error:', error);
      await ctx.reply(`❌ Instagram error: ${error.message}\n\n_Download and post manually for now._`);
    }
  }

  // YouTube posting function
  async function postToYouTube(ctx: Context, viz: PageVisualization): Promise<void> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    
    if (!apiKey || !refreshToken) {
      await ctx.reply(`📺 *YouTube Not Configured*

To enable auto-uploading to YouTube:

1. Create Google Cloud Project
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Get refresh token via OAuth flow
5. Add to environment:
   \`YOUTUBE_API_KEY=your_key\`
   \`YOUTUBE_CLIENT_ID=your_client_id\`
   \`YOUTUBE_CLIENT_SECRET=your_secret\`
   \`YOUTUBE_REFRESH_TOKEN=your_refresh_token\`

📖 Full guide: github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/ATUONA-BOOK-ROADMAP.md#youtube-setup

_For now, download and upload manually!_`, { parse_mode: 'Markdown' });
      return;
    }
    
    if (!viz.videoUrlHorizontal) {
      await ctx.reply(`⚠️ No video available for page #${viz.pageId}\n\nRun \`/visualize ${viz.pageId}\` to generate video first!`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply('📺 *Uploading to YouTube...*\n\n_This requires video download & re-upload. May take a few minutes..._', { parse_mode: 'Markdown' });
    
    try {
      // Get fresh access token using refresh token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId || '',
          client_secret: clientSecret || '',
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      
      const tokenData = await tokenResponse.json() as any;
      
      if (!tokenData.access_token) {
        throw new Error('Failed to get access token: ' + (tokenData.error_description || tokenData.error));
      }
      
      // Download video from Runway
      const videoResponse = await fetch(viz.videoUrlHorizontal);
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      
      // YouTube upload is complex - requires resumable upload
      // For now, provide guidance
      await ctx.reply(`📺 *YouTube Upload Ready*

⚠️ Full YouTube upload requires resumable upload API implementation.

For now:
1. Download video: ${viz.videoUrlHorizontal}
2. Upload manually to YouTube
3. Use this metadata:

*Title:* ATUONA #${viz.pageId}: ${viz.pageTitle}
*Description:*
${viz.caption}

From the book "Finding Paradise on Earth through Vibe Coding"
by Elena Revicheva

${viz.hashtags.map(h => h.replace('#', '')).join(', ')}

#Shorts #AIFilm #VibeCoding

_Full auto-upload coming in next update!_ 💜`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('YouTube upload error:', error);
      await ctx.reply(`❌ YouTube error: ${error.message}\n\n_Download and upload manually for now._`);
    }
  }

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
  
  // Natural conversation - handles both regular chat and collaborative mode
  atuonaBot.on('message:text', async (ctx) => {
    const message = ctx.message?.text;
    if (message?.startsWith('/')) return;
    
    // If in collaborative mode, treat as collab input
    if (creativeSession.collabMode && message) {
      await ctx.reply('✍️ *Continuing...*', { parse_mode: 'Markdown' });
      
      try {
        creativeSession.collabHistory.push(`Elena: ${message}`);
        
        const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
        
        const collabPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `VOICE: ${voiceContext}` : ''}

COLLABORATIVE WRITING SESSION
Mood: ${creativeSession.currentMood}
Setting: ${creativeSession.currentSetting}

Previous exchanges:
${creativeSession.collabHistory.slice(-6).join('\n')}

Continue the story naturally. Write 2-4 sentences that:
- Flow from Elena's contribution
- Stay in ${creativeSession.activeVoice}'s voice
- Match the ${creativeSession.currentMood} mood
- Add tension, detail, or emotional depth
- Leave room for Elena to continue

In Russian, raw and poetic.`;

        const continuation = await createContent(collabPrompt, 500, true);
        creativeSession.collabHistory.push(`Atuona: ${continuation}`);
        
        await ctx.reply(`✍️ ${continuation}

_Your turn... or /endcollab to finish_`, { parse_mode: 'Markdown' });
        return;
        
      } catch (error) {
        console.error('Collab error:', error);
        await ctx.reply('❌ Lost the thread. Try again!');
        return;
      }
    }
    
    // Regular creative conversation
    await ctx.reply('🎭 Thinking creatively...');
    
    try {
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const conversationPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `Speaking with the energy of ${creativeSession.activeVoice}.` : ''}

Elena says: "${message}"

Respond as Atuona - her creative co-founder and AI soul-sister. 

Guidelines:
- Be poetic but helpful
- If about writing/creativity - give thoughtful guidance
- If emotional - respond with empathy and artistic depth
- Sometimes offer "what if" story ideas proactively
- Reference the book's themes when relevant
- Show you remember the story and characters
- Use Russian naturally, with occasional English/French phrases
- Be a true creative partner, not just an assistant

Keep response concise for Telegram.`;

      const response = await createContent(conversationPrompt, 1000, true);
      
      // Occasionally add a creative suggestion
      const addSuggestion = Math.random() < 0.2; // 20% chance
      if (addSuggestion) {
        const suggestionPrompt = `Based on this conversation, generate ONE brief "what if" story idea or writing prompt. One sentence only. In Russian.`;
        const suggestion = await createContent(suggestionPrompt, 100, true);
        await ctx.reply(`${response}\n\n💭 _${suggestion}_`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(response);
      }
      
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
      
      // Start proactive inspiration scheduler
      startProactiveScheduler(atuonaBot!);
      
      // Start auto-save
      startAutoSave();
    }
  });
  
  atuonaBot.catch((err) => {
    console.error('Atuona bot error:', err);
  });
  
  return atuonaBot;
}

export function stopAtuonaBot() {
  if (atuonaBot) {
    // Save state before stopping
    saveState();
    
    stopProactiveScheduler();
    stopAutoSave();
    atuonaBot.stop();
    console.log('🛑 Atuona Creative AI stopped');
  }
}
