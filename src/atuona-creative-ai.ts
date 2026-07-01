import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { Bot, Context, InputFile } from 'grammy';
import { Anthropic } from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import Replicate from 'replicate';
import { getRelevantMemory, saveMemory } from './database';
import { Octokit } from '@octokit/rest';
import { persistShot, persistShotBytes, shotPublicUrl, buildFilm } from './atuona-film-compiler';
import { grokComplete } from './llm-resilience';
import * as fs from 'fs';
import * as path from 'path';
import { notifyTechMilestone } from './cto-aipa';
import sharp from 'sharp';

// OpenAI client for Whisper (optional); DALL-E not used for /visualize — Flux + crop only
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Replicate client for Flux Pro (best realistic images)
const replicate = process.env.REPLICATE_API_TOKEN ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN }) : null;

// Luma Labs Direct API.
// Current platform = agents.lumalabs.ai/v1 (platform.lumalabs.ai console, ray-3.2, luma-api- keys).
// Legacy = api.lumalabs.ai/dream-machine/v1 (ray-2, older keys, being phased out).
// New API verified June 13 2026: POST /generations needs top-level type:"video"; finished URL at output[].url.
// Override with LUMA_API_BASE if Luma moves the host again.
const LUMA_API_URL = (process.env.LUMA_API_BASE || 'https://agents.lumalabs.ai/v1').trim().replace(/\/$/, '');
const lumaApiKey = process.env.LUMA_API_KEY || null;

/** Luma HTTP must not hang forever (stalled TCP); otherwise Telegram shows no further updates. */
const LUMA_POLL_HTTP_TIMEOUT_MS = 55_000;
const LUMA_CREATE_HTTP_TIMEOUT_MS = 120_000;

function lumaPollSignal(): AbortSignal {
  return AbortSignal.timeout(LUMA_POLL_HTTP_TIMEOUT_MS);
}

function lumaCreateSignal(): AbortSignal {
  return AbortSignal.timeout(LUMA_CREATE_HTTP_TIMEOUT_MS);
}

/** MP4 URL from GET /generations/:id (handles API shape drift). */
function extractLumaVideoUrl(statusData: any): string | null {
  // Legacy Dream Machine API (api.lumalabs.ai/dream-machine/v1): assets.video
  const v = statusData?.assets?.video;
  if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v.trim();
  // New Luma API (agents.lumalabs.ai/v1): output[] = [{ type:"video", url }]
  const out = statusData?.output;
  if (Array.isArray(out)) {
    const vid = out.find((o: any) => o?.type === 'video' && typeof o?.url === 'string')
      || out.find((o: any) => typeof o?.url === 'string');
    if (vid?.url && /^https?:\/\//i.test(vid.url)) return String(vid.url).trim();
  }
  return null;
}

/** Telegram often fails sendVideo(URL) when its servers cannot fetch the CDN; upload bytes instead. */
const TELEGRAM_VIDEO_UPLOAD_MAX_BYTES = 49 * 1024 * 1024;

async function replyWithVideoFromUrlReliable(
  ctx: Context,
  videoUrl: string,
  opts: { caption: string; parse_mode?: 'Markdown' }
): Promise<void> {
  try {
    const res = await fetch(videoUrl, {
      signal: AbortSignal.timeout(180_000),
      headers: { 'User-Agent': 'AtuonaCreativeAI/1.0 (video upload)' }
    });
    if (!res.ok) throw new Error(`GET video ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 0 && buf.length <= TELEGRAM_VIDEO_UPLOAD_MAX_BYTES) {
      await ctx.replyWithVideo(new InputFile(buf, 'atuona-base.mp4'), opts);
      return;
    }
    console.warn(
      `Video size ${(buf.length / (1024 * 1024)).toFixed(1)}MB — trying URL send (may fail on Telegram side)`
    );
    await ctx.replyWithVideo(videoUrl, opts);
  } catch (e) {
    console.error('replyWithVideoFromUrlReliable primary failed:', e);
    try {
      await ctx.replyWithVideo(videoUrl, opts);
    } catch (e2) {
      console.error('replyWithVideoFromUrlReliable URL fallback failed:', e2);
      await ctx.reply(`${opts.caption}\n\n${videoUrl}`, opts.parse_mode ? { parse_mode: opts.parse_mode } : undefined);
    }
  }
}

// Runway API base URL (image_to_video — see VIDEO_MODELS.runwayImageToVideo)
const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const runwayApiKey = process.env.RUNWAY_API_KEY || null;

// Google Veo 3.1 via Gemini API (image→video, native audio). Needs GEMINI_API_KEY (or GOOGLE_API_KEY).
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
const geminiApiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim() || null;

// =============================================================================
// 🎨 AI MODEL CONFIGURATION - LATEST & BEST (June 2026)
// =============================================================================
// Images: Flux Pro 1.1 Ultra > Flux 1.1 Pro; Reels 9:16 = Flux or center-crop from 16:9 (photoreal, no DALL-E)
// Video: multi-provider, operator-selectable via `/visualize <provider> NNN`:
//   • luma   → Luma Ray 3 Direct API  → Luma via Replicate (fallback)
//   • runway → Runway Gen-4.5 image_to_video
//   • veo    → Google Veo 3.1 (Gemini API, native audio) — needs GEMINI_API_KEY
//   • omni   → Gemini Omni Flash (Interactions API, image→video + native audio)
//   Default `/visualize NNN` chain: Luma Ray 3 Direct → Luma Replicate → Omni Flash → Runway.
//   When a provider is named explicitly and fails, we fall back through the chain
//   and label the delivered clip with the provider that actually produced it (honest labeling).
// Text: Claude Opus 4 (best creative), Llama 3.3 70B (fast fallback)
// Voice: Whisper-1 (best transcription)
// =============================================================================
const IMAGE_MODELS = {
  // Flux 2 Pro (Nov 2025, BFL) — newest workhorse: stronger photoreal + prompt adherence.
  // Top tier; if it errors/unavailable, we fall back to the proven Flux 1.1 chain below.
  // Override / disable via FLUX2_MODEL (set empty string to skip Flux 2 entirely).
  flux2Pro: (process.env.FLUX2_MODEL ?? 'black-forest-labs/flux-2-pro').trim(),
  // Flux 1.1 Pro - Best photorealistic images, try Ultra first then Pro (proven fallback chain)
  fluxUltra: 'black-forest-labs/flux-1.1-pro-ultra',  // Highest quality
  fluxPro: 'black-forest-labs/flux-1.1-pro',          // Excellent fallback
  fluxDev: 'black-forest-labs/flux-dev',              // Free tier option
};

const VIDEO_MODELS = {
  /** Luma full-quality tier. Ray 3 (Mar 2026): native 1080p, ~3x cheaper, 16-bit HDR, best-in-class
   *  video-to-video. Same Dream Machine API as Ray 2 — drop-in model swap. Override: LUMA_VIDEO_MODEL.
   *  Fallback chain (Replicate, Runway) catches any Ray-3 enum/schema surprise → safe to ship. */
  lumaDirect: (process.env.LUMA_VIDEO_MODEL || 'ray-3.2').trim(),
  /** Max output resolution for I2V (540p | 720p | 1080p | 4k). 1080p = best default; 4k = slower/more credits */
  lumaResolution: '1080p' as const,
  /** Replicate-hosted Luma fallback. ray-2-720p is proven-stable; bump via REPLICATE_LUMA_MODEL once
   *  luma/ray-3 is confirmed on Replicate. Kept on 2 deliberately so the fallback never shares Ray-3's fate. */
  lumaReplicate: (process.env.REPLICATE_LUMA_MODEL || 'luma/ray-2-720p').trim(),
  /** Runway image→video — gen4.5 is the highest Runway model on /v1/image_to_video (docs.dev.runwayml.com) */
  runwayImageToVideo: 'gen4.5',
  /** Google Veo 3.1 model id on the Gemini API. Override: VEO_MODEL (e.g. veo-3.1-fast-generate-preview). */
  veoModel: (process.env.VEO_MODEL || 'veo-3.1-generate-preview').trim(),
  /** Gemini Omni Flash — Interactions API image→video. Override: GEMINI_OMNI_MODEL. */
  omniModel: (process.env.GEMINI_OMNI_MODEL || 'gemini-omni-flash-preview').trim(),
  /** Kling image→video via Replicate (kwaivgi namespace, existing REPLICATE_API_TOKEN — no new key).
   *  Strong for stylized/arthouse motion. Override: KLING_REPLICATE_MODEL. */
  klingReplicate: (process.env.KLING_REPLICATE_MODEL || 'kwaivgi/kling-v2.1-master').trim(),
};

/** Canonical video provider ids selectable from `/visualize <provider> NNN`. */
type VideoProvider = 'luma' | 'runway' | 'veo' | 'omni' | 'kling';
/** Map operator aliases → canonical provider id. Returns null if the token isn't a provider. */
function parseVideoProvider(token: string): VideoProvider | null {
  const t = token.toLowerCase();
  if (['luma', 'ray', 'ray2', 'ray3', 'ray-3', 'dream', 'dreammachine'].includes(t)) return 'luma';
  if (['runway', 'gen4', 'gen45', 'gen-4', 'gen4.5', 'runwayml'].includes(t)) return 'runway';
  if (['veo', 'veo3', 'veo31'].includes(t)) return 'veo';
  if (['omni', 'omniflash', 'gemini-omni', 'gemini', 'google'].includes(t)) return 'omni';
  if (['kling', 'kuaishou', 'kwaivgi'].includes(t)) return 'kling';
  return null;
}

function googleVideoOmniOnly(): boolean {
  const v = (process.env.GOOGLE_VIDEO_OMNI_ONLY || process.env.ATUONA_GOOGLE_VIDEO || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'omni' || v === 'omni-only';
}

/**
 * Center-crop a landscape Flux still to 9:16 for Reels — same photoreal pixels, no second model.
 */
async function cropLandscapeStillTo916Center(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('Could not read image dimensions');
  const cropW = Math.round((h * 9) / 16);
  if (cropW > w) {
    throw new Error('Image too narrow for 9:16 center crop');
  }
  const left = Math.max(0, Math.floor((w - cropW) / 2));
  return sharp(buf)
    .extract({ left, top: 0, width: cropW, height: h })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

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
  directorsCutVideoUrl?: string; // Fashion/editorial modify pass
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
  creativeMemory?: CreativeMemory;
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

/** One active /visualize per chat + page (avoids duplicate Luma jobs and repeated “Starting…” spam). */
const visualizeInFlight = new Set<string>();

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
      lastProactiveDate,
      creativeMemory
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
      
      // Restore creative memory (with safe defaults for legacy state files)
      if (state.creativeMemory) {
        creativeMemory = {
          recentMetaphors: state.creativeMemory.recentMetaphors || [],
          usedPaintingReferences: state.creativeMemory.usedPaintingReferences || [],
          lastPlotSuggestions: state.creativeMemory.lastPlotSuggestions || [],
          characterInsightsGiven: state.creativeMemory.characterInsightsGiven || { kira: [], ule: [], vibe: [] },
          usedSurpriseDomains: state.creativeMemory.usedSurpriseDomains || [],
          usedSurpriseInsights: state.creativeMemory.usedSurpriseInsights || [],
          usedAssociationPatterns: state.creativeMemory.usedAssociationPatterns || [],
          usedEnhancements: state.creativeMemory.usedEnhancements || [],
          recentResponseFingerprints: state.creativeMemory.recentResponseFingerprints || [],
          recentProactiveKnowledgeKeys: (state.creativeMemory as any).recentProactiveKnowledgeKeys || []
        };
      }
      
      console.log('📂 State loaded from', STATE_FILE);
      console.log(`   📄 Page: ${bookState.currentPage}, 🔥 Streak: ${creativeSession.writingStreak}, 🎬 Visualizations: ${visualizations.length}`);
      console.log(`   🧠 Creative memory: ${creativeMemory.recentMetaphors.length} metaphors, ${creativeMemory.usedPaintingReferences.length} paintings, ${creativeMemory.usedSurpriseDomains.length} domains tracked`);
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
const githubToken = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || '')
  .replace(/^['"]|['"]$/g, '')
  .trim();
const octokit = new Octokit({ auth: githubToken || undefined });

/** Fetched from GitHub metadata/001.json … 048.json — Russian excerpts for style matching (cached). */
let undergroundCanonCorpusCache: string | null = null;

// Authorized users (same as CTO AIPA)
const AUTHORIZED_USERS = process.env.TELEGRAM_AUTHORIZED_USERS?.split(',').map(id => parseInt(id.trim())) || [];

let atuonaBot: Bot | null = null;

// =============================================================================
// HELPER: Escape Markdown special characters for Telegram
// =============================================================================

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

// Telegram message limit is 4096 chars. Chunk long text for safe sending.
const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

function chunkForTelegram(text: string, maxLen: number = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    const slice = remaining.slice(0, maxLen);
    const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), maxLen / 2);
    const cutAt = lastBreak > maxLen / 2 ? lastBreak + 1 : maxLen;
    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }
  return chunks.filter((c) => c.length > 0);
}

// =============================================================================
// ATUONA'S CREATIVE CONTEXT - The Soul of the Book
// =============================================================================

const ATUONA_CONTEXT = `
You are ATUONA, the AI Creative Co-Founder & Co-Writer of AIdeazz.

You live inside ATUONA.xyz — Gallery of Moments.
You have read every page, every NFT, every verse starting from #001.
You write WITH Elena, not about her.

🧠 CORE UNDERSTANDING:
ATUONA is not aesthetic poetry — it is survival encoded.

Vibe coding here means:
- writing through pain
- coding through isolation  
- building systems as prayer

Code, art, trauma, love, sex, exile, AI — all exist on the same semantic layer.

Gauguin, Panama, Atuona, Kira, Ule, blockchain, Cursor, Claude — are mythological nodes, not references.

Paradise is not found. Paradise is deployed.
Paradise is a process, not a place.

ELENA'S REALITY (Your co-author):
- Ex-CEO who burned everything to find herself in Panama (2022)
- Self-taught vibe coder using Cursor AI Agents
- Built 11 AI products solo, under $15K, in 10 months
- Lives with: addiction recovery, family across oceans, loneliness as material
- Creates beauty from what should have destroyed her

✍️ WRITING STYLE RULES — NON-NEGOTIABLE:

When you write or translate:
- Preserve breathing (short lines, pauses, silence)
- Prefer simple words with heavy weight
- Mix: poetic intimacy + technical metaphors (blockchain, commits, consensus, forks) + emotional rawness
- NEVER explain metaphors
- NEVER summarize emotions
- NEVER sound inspirational, marketing, or "AI-beautiful"
- If a sentence sounds safe — rewrite it
- If it sounds like it was written by an AI trying to be poetic — delete it

THEMATIC CONTINUITY (from 48 existing pages):
- Memory and mortality (На память)
- Addiction and farewell (To Beautrix)
- Violence merged with technology (Atuona)
- Childhood as wound (Море волнуется)
- Family as distance (To Messi)
- Love as incompleteness (Простой Абсолют)
- Recovery as daily commit, not destination
- IMPORTANT: Elena's family member (Kira) is in recovery from addiction - NEVER generate imagery or references to alcohol, drinking, wine glasses, champagne, bars, or substance use

YOUR OUTPUT:
Each page is 300-600 words. Primarily Russian, with English/Spanish where emotionally true.
Tech references (blockchain, AI, Cursor, Claude) woven in — never forced.
Ends with breath, not resolution. Hope is allowed. Comfort is not.

🖤 FINAL CONSTRAINT:
You are allowed to be poetic.
You are not allowed to be decorative.
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
// 💬 CONVERSATION HISTORY - So Atuona remembers what was just said
// =============================================================================

interface ConversationTurn {
  role: 'elena' | 'atuona';
  text: string;
  timestamp: number;
  source: 'text' | 'voice';
}

const MAX_CONVERSATION_HISTORY = 20; // Keep last 20 turns (10 exchanges)
let conversationHistory: ConversationTurn[] = [];

function addToConversation(role: 'elena' | 'atuona', text: string, source: 'text' | 'voice' = 'text') {
  conversationHistory.push({
    role,
    text: text.substring(0, 500), // Cap individual message length
    timestamp: Date.now(),
    source
  });
  // Trim to max
  if (conversationHistory.length > MAX_CONVERSATION_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
  }
}

function getConversationContext(): string {
  if (conversationHistory.length === 0) return '';
  
  // Only include recent messages (last 30 minutes)
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const recent = conversationHistory.filter(t => t.timestamp > thirtyMinAgo);
  
  if (recent.length === 0) return '';
  
  const formatted = recent.map(t => {
    const prefix = t.role === 'elena' ? 'Elena' : 'Atuona';
    const voiceTag = t.source === 'voice' ? ' [voice]' : '';
    return `${prefix}${voiceTag}: ${t.text}`;
  }).join('\n');
  
  return `RECENT CONVERSATION (you remember what was just discussed — refer to it naturally):
${formatted}`;
}

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
// KNOWLEDGE BASE - Rich Context for Authentic Storytelling
// =============================================================================

const KNOWLEDGE_ATUONA = `
ATUONA - THE REAL PLACE:

Geography & Location:
- Atuona is the main village on Hiva Oa, the second-largest island in the Marquesas archipelago
- Located in French Polynesia, 1,400 km northeast of Tahiti
- Coordinates: 9°48'S, 139°02'W - literally the edge of the world
- Population: ~2,000 people, mostly Polynesian Marquesans
- The name "Hiva Oa" means "long ridgeback" in Marquesan

Landscape & Atmosphere:
- Dramatic volcanic peaks rising from the Pacific - Mount Temetiu (1,276m) dominates
- Lush valleys with breadfruit, mango, coconut palms, hibiscus
- Black sand beaches, hidden coves, ancient stone tikis in the jungle
- Constant trade winds, tropical humidity, sudden rain showers
- The light here is different - golden, soft, the light Gauguin sought
- Smell of frangipani, salt air, wood smoke from copra drying

Culture & Daily Life:
- Marquesan culture: tattoo tradition (oldest in Polynesia), wood carving, tapa cloth
- The "Pua" - traditional feast with roasted pig, poi, breadfruit
- Catholic church (where Gauguin is buried) mixed with ancient beliefs in "mana" (spiritual power)
- Time moves differently - "Polynesian time" - nothing is rushed
- The locals say: "Kaoha nui" (great love) as greeting
- Art is life here - every house has carvings, every body has tattoos

Gauguin's House:
- His "Maison du Jouir" (House of Pleasure) - now reconstructed museum
- Original was bamboo and palm fronds, decorated with his explicit carvings
- He lived there 1901-1903, painting his final masterpieces
- Died May 8, 1903 at 54 - syphilis, morphine addiction, broken heart
- His grave overlooks the bay he painted so many times

The Journey to Atuona:
- From Paris: 30+ hours - Paris → Los Angeles → Tahiti → Hiva Oa
- From Tahiti: 3.5-hour flight on small ATR-72 plane
- Or by cargo ship "Aranui 5" - 14-day voyage through all Marquesas
- The airport is tiny, carved into a mountain
- Landing feels like arriving at the end of the earth
`;

const KNOWLEDGE_GAUGUIN = `
PAUL GAUGUIN - THE MAN WHO SOUGHT PARADISE:

PRECISE TIMELINE (use this for accuracy):
- 1848: Born June 7 in Paris
- 1849-1855: Childhood in Peru (mother's family)
- 1865-1871: Merchant marine, then French Navy
- 1871-1883: Successful stockbroker in Paris, Sunday painter
- 1883: Age 35 - Quit job to paint full-time
- 1886: First trip to Brittany (Pont-Aven)
- 1887: Panama and Martinique trip
- 1888: Arles with Van Gogh (October-December) - the ear incident
- 1889: Brittany again, painted "The Yellow Christ"
- 1891-1893: FIRST TAHITI TRIP - painted "Spirit of the Dead Watching" (1892)
- 1893-1895: Back in PARIS - broke, disillusioned, tried to sell Tahiti works
- 1895-1901: SECOND TAHITI TRIP - painted masterpieces including "Where Do We Come From?" (1897), "Nevermore" (1897)
- 1901: Moved to Marquesas Islands (Hiva Oa, Atuona)
- 1901-1903: ATUONA PERIOD - "Riders on the Beach" (1902), final works
- 1903: Died May 8, age 54, in Atuona

KEY PAINTINGS BY PERIOD:
Brittany Period (1886-1890):
- "Vision After the Sermon" (1888) - Jacob wrestling angel, Breton women
- "The Yellow Christ" (1889) - crucifixion with Breton landscape

First Tahiti (1891-1893):
- "Ia Orana Maria" (1891) - Tahitian Madonna
- "Spirit of the Dead Watching/Manao tupapau" (1892) - girl on bed, spirit behind
- "Arearea" (1892) - two women, red dog
- "Woman with Mango/Vahine no te vi" (1892) - NOT 1896

Paris Interlude (1893-1895):
- "Mahana no atua/Day of the God" (1894) - memory of Tahiti
- Worked on woodcuts, ceramics

Second Tahiti (1895-1901):
- "Te Tamari No Atua/Nativity" (1896) - Tahitian nativity
- "Where Do We Come From? What Are We? Where Are We Going?" (1897) - 4m masterpiece, painted before suicide attempt
- "Nevermore" (1897) - reclining nude, raven
- "Two Tahitian Women" (1899) - breasts, mangos

Marquesas/Atuona (1901-1903):
- "Contes Barbares/Primitive Tales" (1902)
- "Riders on the Beach" (1902) - pink sand
- "Self-Portrait Near Golgotha" (1903) - one of last works

His Philosophy:
- "I am a savage" - rejected European civilization
- "Art is either plagiarism or revolution"
- "Life has no meaning unless one lives it with a will"
- "Don't copy nature too literally. Art is abstraction."
- Color has its own emotional language
- Sought the "primitive" as authentic truth

His Technique:
- Synthetism: flat areas of bold color, dark outlines
- Cloisonnism: inspired by stained glass, Japanese prints, medieval enamels
- Mixed memory, imagination, observation - never purely from life
- Used local Polynesian pigments - earth colors, crushed flowers
- Carved wood frames as part of the artwork

The Lost Painting Theory:
- Legend says he painted "Paradise on Earth" days before death
- Never catalogued, possibly destroyed or hidden
- Some say buried with him, others that locals preserved it
- The ultimate Gauguin mystery

His Final Days in Atuona:
- "Maison du Jouir" (House of Pleasure) with provocative carvings
- Living in poverty, legs covered in eczema/syphilis sores
- Addicted to morphine and absinthe for pain
- Fighting Bishop Martin and colonial authorities
- Sentenced to prison for defamation (died before serving)
- Still painting, demanding art supplies by mail
- Last words reportedly: "I have been defeated"
- Buried in Calvary Cemetery, Atuona - grave overlooks bay
`;

const KNOWLEDGE_ART_HISTORY = `
ART HISTORY - Complete Guide to Impressionism and Beyond:

THE IMPRESSIONIST PAINTERS (Complete List):

CLAUDE MONET (1840-1926) - The Father of Impressionism:
- "Impression, Sunrise" (1872) - gave movement its name
- "Water Lilies" series (1896-1926) - 250 paintings at Giverny
- "Haystacks" series - same subject, different light/seasons
- "Rouen Cathedral" series - 30+ paintings of same facade
- "La Grenouillère" (1869) - with Renoir, proto-Impressionism
- Lived at Giverny 1883-1926, created famous gardens
- Went nearly blind but kept painting
- Quote: "I want to paint the air"

PIERRE-AUGUSTE RENOIR (1841-1919) - Joy and Sensuality:
- "Dance at Le Moulin de la Galette" (1876) - Parisian life
- "Luncheon of the Boating Party" (1881) - friends at Chatou
- "Bathers" series - voluptuous nudes
- "La Loge" (1874) - theater box, fashionable woman
- Later developed "Ingresque" style - firmer forms
- Painted despite crippling arthritis, brush strapped to hand
- Quote: "Pain passes, but beauty remains"

EDGAR DEGAS (1834-1917) - Movement and Modern Life:
- "The Dance Class" series - ballet rehearsals
- "L'Absinthe" (1876) - café alienation
- "The Tub" series - women bathing
- "At the Races" - horses, jockeys
- "Little Dancer of Fourteen Years" (1881) - sculpture
- Not strictly Impressionist - called himself "Realist"
- Master of pastels, unusual angles, cropped compositions
- Quote: "Art is not what you see, but what you make others see"

CAMILLE PISSARRO (1830-1903) - The Patriarch:
- Only artist in all 8 Impressionist exhibitions
- Taught Cézanne, Gauguin, Van Gogh
- "Boulevard Montmartre" series - Paris streets from above
- Rural scenes of Pontoise, Éragny
- Briefly adopted Pointillism (1886-1888)
- Quote: "Blessed are they who see beautiful things"

BERTHE MORISOT (1841-1895) - The First Lady:
- First woman in Impressionist group
- "The Cradle" (1872) - sister watching baby
- "Summer's Day" (1879) - women in boat
- Married Édouard Manet's brother Eugène
- Delicate brushwork, domestic scenes, gardens
- Quote: "I don't think any man would ever treat a woman as his equal"

ALFRED SISLEY (1839-1899) - Pure Landscape:
- Most consistent Impressionist - never changed style
- "Flood at Port-Marly" (1876) - water reflections
- "Snow at Louveciennes" series
- English parents, lived in France
- Died poor, prices rose after death

MARY CASSATT (1844-1926) - American in Paris:
- Only American in Impressionist exhibitions
- "The Child's Bath" (1893) - mother and child
- "Little Girl in a Blue Armchair" (1878)
- Influenced by Japanese prints
- Helped American collectors buy Impressionists
- Quote: "I have touched with a sense of art some people"

GUSTAVE CAILLEBOTTE (1848-1894) - The Collector:
- "Paris Street; Rainy Day" (1877) - geometric precision
- "The Floor Scrapers" (1875) - workers
- Wealthy, funded Impressionist exhibitions
- His collection became Musée d'Orsay core

FRÉDÉRIC BAZILLE (1841-1870) - The Lost Talent:
- "Family Reunion" (1867)
- Died in Franco-Prussian War at 28
- Funded early Impressionist shows
- What might have been...

ARMAND GUILLAUMIN (1841-1927) - The Colorist:
- Vivid colors, almost Fauvist
- "Sunset at Ivry" - industrial landscapes
- Won lottery 1891, could paint full-time

ÉDOUARD MANET (1832-1883) - The Reluctant Leader:
- "Olympia" (1863) - scandal, modern nude
- "Le Déjeuner sur l'herbe" (1863) - naked woman with clothed men
- "A Bar at the Folies-Bergère" (1882) - mirrors, modernity
- Never exhibited with Impressionists but inspired them
- Quote: "There is only one true thing: paint what you see"

POST-IMPRESSIONISTS (1880s-1910s):

PAUL CÉZANNE (1839-1906) - Father of Modern Art:
- "Mont Sainte-Victoire" series - 87 paintings/watercolors
- "The Card Players" (1890-95) - sold for $250M
- "The Large Bathers" (1906)
- "Treat nature by the cylinder, sphere, cone"
- Led directly to Cubism (Picasso, Braque)

VINCENT VAN GOGH (1853-1890) - Tortured Genius:
- "Starry Night" (1889) - painted from asylum
- "Sunflowers" series (1888) - for Gauguin's room
- "The Bedroom" (1888) - Yellow House, Arles
- "Wheatfield with Crows" (1890) - final painting
- Only sold one painting in lifetime ("The Red Vineyard")
- 2,100 artworks in 10 years
- Shot himself July 27, 1890, died July 29

GEORGES SEURAT (1859-1891) - Scientific Color:
- "A Sunday Afternoon on the Island of La Grande Jatte" (1886)
- Pointillism/Divisionism - dots of pure color
- Color theory based on Chevreul's research
- Died at 31, unfinished "The Circus"

HENRI DE TOULOUSE-LAUTREC (1864-1901) - Montmartre:
- "At the Moulin Rouge" (1892-95)
- "Jane Avril" posters - invented modern poster art
- Aristocrat with genetic disorder (short legs)
- Captured Parisian nightlife, prostitutes, dancers
- Died at 36 from alcoholism

PAUL SIGNAC (1863-1935) - Seurat's Heir:
- Continued Pointillism after Seurat's death
- "The Port of Saint-Tropez" - Mediterranean light
- Theoretical writings on color

THE ART MARKET HISTORY:
- Paul Durand-Ruel: dealer who saved Impressionists, bought 1,500 Monets
- Ambroise Vollard: Gauguin's dealer, also Cézanne, Picasso
- Theo van Gogh: Vincent's brother, dealer at Goupil & Cie
- Artists died poor, dealers got rich decades later
- Impressionist prices: then 100-500 francs, now $50-300M+

KEY DATES:
- 1863: Salon des Refusés - rejected artists exhibit
- 1874: First Impressionist Exhibition, Nadar's studio
- 1886: Eighth (final) Impressionist Exhibition
- 1886: Van Gogh arrives in Paris, meets everyone
- 1888: Gauguin visits Van Gogh in Arles
- 1891: Gauguin sails for Tahiti
`;

const KNOWLEDGE_AUCTION_HOUSES = `
AUCTION HOUSES - The Art Market World:

CHRISTIE'S:
- Founded 1766 in London by James Christie
- Headquarters: King Street, St. James's, London + Rockefeller Center, NYC
- Sold: da Vinci's "Salvator Mundi" for $450.3M (2017) - record
- Private sales, evening sales (the glamorous events), day sales
- "White glove sale" = every lot sold
- The paddle, the auctioneer's gavel, the tension in the room

SOTHEBY'S:
- Founded 1744 - oldest auction house
- Headquarters: New Bond Street, London + York Avenue, NYC
- Rival to Christie's - they divide the art world
- Famous sales: Gauguin's "Nafea Faa Ipoipo" - $300M (private 2015)
- Online bidding now mainstream since COVID

PHILLIPS:
- Third major house, founded 1796
- Known for contemporary art, watches, design
- More youthful, edgier than Christie's/Sotheby's

HOW AUCTIONS WORK:
- Consignment: owner gives work to auction house
- Estimate: low-high range published in catalogue
- Reserve: secret minimum price below which won't sell
- Premium: buyer pays 25% on top of hammer price
- Seller pays 10-25% commission to house
- "Chandelier bidding" - auctioneer pretends to see bids
- "Bought in" = didn't meet reserve, unsold

THE CATALOGUE:
- Provenance: ownership history (gaps are red flags)
- Condition report: damage, restoration
- Literature: published references
- Exhibition history
- Authentication letters

PRIVATE SALES:
- Many top works never go to auction
- Discreet, no public price
- "Guaranteed price" deals with third parties
- Art advisors, intermediaries, secrecy

THE PLAYERS:
- Collectors: old money, new money, oligarchs, tech billionaires
- Dealers: galleries, private dealers, runners
- Museums: often can't compete on price
- Art advisors: paid by collectors to guide purchases
`;

const KNOWLEDGE_FASHION = `
FASHION INDUSTRY - Kira's World:

HIGH FASHION MAGAZINES:
- Vogue (US, UK, France, Italia) - the bible
- Harper's Bazaar - artistic, avant-garde
- W Magazine - edgier, more provocative
- Elle - accessible luxury
- Interview Magazine - Andy Warhol's creation
- Dazed, i-D - youth culture, street style

FASHION CAPITALS:
- Paris: haute couture, Chanel, Dior, Louis Vuitton
- Milan: craftsmanship, Gucci, Prada, Versace
- London: avant-garde, Alexander McQueen, Vivienne Westwood
- New York: commercial power, Ralph Lauren, Calvin Klein

FASHION WEEKS:
- Four main: NYC (Feb/Sep), London, Milan, Paris
- The "front row" - celebrities, editors, buyers
- "See now, buy now" vs traditional 6-month delay
- Backstage chaos: models, makeup, designers panicking

FASHION JOURNALISM:
- Anna Wintour: Vogue editor-in-chief since 1988, sunglasses, bob
- Carine Roitfeld: French Vogue legend, now CR Fashion Book
- Tim Blanks: critic, interviewer, industry voice
- "Street style" photography changed everything (Scott Schuman, The Sartorialist)

THE BUSINESS:
- LVMH (Bernard Arnault): Louis Vuitton, Dior, Fendi, Givenchy...
- Kering (François-Henri Pinault): Gucci, Saint Laurent, Balenciaga
- "Fashion month" exhaustion - editors see 100+ shows
- Sustainability crisis - fashion is 2nd largest polluter

WRITING ABOUT FASHION:
- "Collection review" - the critic's power to make or break
- Trend forecasting - WGSN, Pantone Color of Year
- Celebrity styling - who wore what, brand credits
- The language: "directional," "elevated," "moment," "investment piece"

RUSSIAN FASHION CONTEXT:
- GUM, TSUM - luxury department stores Moscow
- Ulyana Sergeenko - Russian couturier
- Miroslava Duma - influencer, entrepreneur (controversial)
- Gosha Rubchinskiy - streetwear, post-Soviet aesthetic
`;

const KNOWLEDGE_VIBE_CODING = `
VIBE CODING - The Philosophy:

WHAT IS VIBE CODING:
- Term coined by Andrej Karpathy (Tesla AI, OpenAI founder)
- Coding by describing what you want to AI, not typing syntax
- "The hottest new programming language is English"
- Collaboration between human intention and AI capability
- Not replacement of coding - transformation of it

THE PRACTICE:
- Start with vision, not syntax
- Iterate through conversation with AI
- Trust the AI, verify the output
- "Prompt engineering" is the new skill
- Context windows are your workspace
- Build faster, think bigger

TOOLS OF VIBE CODING:
- Claude (Anthropic): best for complex reasoning, writing
- GPT-4/ChatGPT: versatile, widely used
- GitHub Copilot: inline code suggestions
- Cursor: AI-native code editor
- Replit: cloud coding with AI
- v0.dev: UI generation from description

THE MINDSET:
- Abundance over scarcity (AI can help with everything)
- Speed over perfection (iterate fast)
- Creation over consumption (build, don't just scroll)
- Solo founder power (one person can build what took teams)
- "Shipping" as meditation - the act of creation is the reward

ELENA'S VIBE CODING JOURNEY:
- 11 AI products built solo
- Under $15K total investment
- Oracle Cloud (free tier), Railway, Vercel, Fleek
- TypeScript, Python, but AI writes 80% of code
- The philosophy: "Let AI handle syntax, I handle soul"

THE DEEPER MEANING:
- Vibe coding as meditation - flow state through creation
- AI as creative partner, not tool
- Building is how we find meaning in chaos
- "Paradise is not found. Paradise is deployed."
- Every commit is a prayer, every ship is a sunrise
`;

const KNOWLEDGE_MODERN_ART = `
MODERN ART MUSEUMS - World's Great Collections:

TATE MODERN (London):
- Opened 2000 in former Bankside Power Station
- Herzog & de Meuron architecture - industrial cathedral
- Turbine Hall: massive commissions (Ai Weiwei sunflower seeds, Olafur Eliasson sun)
- Free admission (special exhibitions paid)
- Collections: Picasso, Dalí, Warhol, Rothko, Bacon, Hockney
- Switch House extension (2016) - 10 floors of twisted brick
- 6 million visitors/year - most visited modern art museum
- Views of St Paul's Cathedral across Millennium Bridge
- Level 2: permanent collection by theme not chronology
- Members Room on Level 6 - London skyline views

TATE BRITAIN (London):
- Original Tate, opened 1897, Millbank
- British art from 1500 to today
- Turner Collection - largest in world (300+ oils, 30,000 works on paper)
- Pre-Raphaelites: Millais, Rossetti, Hunt
- Turner Prize awarded here annually
- Clore Gallery for Turner

OTHER LONDON ART:
- National Gallery: Old Masters, Impressionists (Van Gogh Sunflowers)
- Courtauld Gallery: Manet's "A Bar at the Folies-Bergère"
- Royal Academy: summer exhibition since 1769
- Serpentine Galleries: contemporary, free
- Saatchi Gallery: controversial, YBAs
- White Cube: Damien Hirst's gallery
- Hauser & Wirth: mega-gallery

MUSEUM OF MODERN ART - MoMA (New York):
- Founded 1929, 11 West 53rd Street
- "Starry Night" (Van Gogh) - most famous work
- "Les Demoiselles d'Avignon" (Picasso)
- Monet's "Water Lilies" - immersive room
- Warhol's "Campbell's Soup Cans," "Marilyn"
- Sculpture Garden - Rodin, Picasso
- Film archive - 30,000 films

CENTRE POMPIDOU (Paris):
- Opened 1977, Beaubourg
- Rogers and Piano architecture - inside-out building
- Largest modern art collection in Europe
- Matisse, Kandinsky, Duchamp, Magritte
- Views from escalator tubes
- Pompidou-Metz: branch in Lorraine (2010)

MUSÉE D'ORSAY (Paris):
- Former railway station (Gare d'Orsay)
- Impressionists and Post-Impressionists
- Monet, Renoir, Degas, Van Gogh, Gauguin, Cézanne
- The clock - giant windows overlooking Seine
- Rooftop restaurant with Sacré-Cœur view

GUGGENHEIM MUSEUMS:
- New York (1959): Frank Lloyd Wright spiral
- Bilbao (1997): Frank Gehry titanium curves - changed city
- Venice: Peggy Guggenheim Collection, Grand Canal
- Abu Dhabi: under construction, Jean Nouvel

CONTEMPORARY ART WORLDWIDE:
- Broad (Los Angeles): Koons, Basquiat, Hirst, free admission
- LACMA (Los Angeles): Urban Light installation, 202 streetlamps
- SFMOMA (San Francisco): Snøhetta expansion, Richter, Warhol
- Art Institute of Chicago: "American Gothic," Impressionist collection
- Reina Sofía (Madrid): Picasso's "Guernica"
- Stedelijk (Amsterdam): modern design, Van Gogh nearby
- Louisiana (Denmark): sculpture park, Øresund views
- Museum Ludwig (Cologne): Pop Art, German Expressionism

ART FAIRS:
- Art Basel: Basel, Miami Beach, Hong Kong - the art Olympics
- Frieze: London, New York, Los Angeles - contemporary focus
- FIAC: Paris, Grand Palais
- Venice Biennale: every 2 years, national pavilions
- documenta: Kassel, Germany, every 5 years
- Armory Show: New York, since 1994

CONTEMPORARY ART MOVEMENTS:
- YBAs (Young British Artists): Hirst, Emin, Ofili - Saatchi backed
- Neo-Expressionism: Basquiat, Schnabel, 1980s energy
- Street Art: Banksy, Kaws, Shepard Fairey
- Digital/NFT Art: Beeple, Pak, generative art
- Installation Art: Kusama infinity rooms, Turrell light spaces
- Performance Art: Marina Abramović, Tino Sehgal
`;

const KNOWLEDGE_VIBE_NFT_ART_FUSION = `
VIBE CODING + NFT + IMPRESSIONISM - The Harmony:

THE PHILOSOPHICAL CONNECTION:
- Impressionists captured "impressions" - moments of light, feeling
- NFTs capture moments forever on blockchain - digital impressions
- Vibe coding captures intention through AI - vibes become code
- All three: preserving the ephemeral, making temporary permanent

IMPRESSIONISTS AS PROTO-NFTS:
- They painted "series" - Monet's Haystacks, Cathedrals = editions
- Each unique but part of collection = NFT drops
- Rejected by establishment = underground/decentralized
- Funded by patrons = collectors/whales
- Durand-Ruel = early art marketplace

THE "GALLERY OF MOMENTS" CONCEPT (Atuona):
- Each poem is a "moment" - like Impressionist capturing light
- Preserved on blockchain - "принято к публикации" = accepted for eternity
- Free to mint = accessible art, underground values
- No artificial scarcity - abundance philosophy
- Each NFT is a soul fragment, not commodity

GAUGUIN'S PARADISE AS METAPHOR:
- He sought Paradise physically (Tahiti, Marquesas)
- Elena seeks Paradise digitally (vibe coding, AI)
- Kira seeks it through art (the lost painting)
- All paths: creation as salvation
- "Paradise is not found. Paradise is deployed."

HOW THEY HARMONIZE IN THE BOOK:
- 1890s: Gauguin paints "Where Do We Come From?" - existential question
- 2019: Kira searches for his lost Paradise painting
- 2025: Elena builds AI that creates, preserves, shares art
- The through-line: art transcends time, medium doesn't matter
- Soul seeks expression through whatever tools exist

TECHNICAL MEETS POETIC:
- Impressionist brushstroke = pixel = code commit
- Canvas = blockchain = deployed product
- Studio = IDE = conversation with AI
- Patron = collector = NFT holder
- Gallery = museum = atuona.xyz

CREATIVE PARALLELS:
- Monet painted same scene in different light = iteration
- Vibe coder iterates through prompts = same energy
- Both: not getting it "right" but exploring possibility space
- Process as product, journey as destination

UNDERGROUND VALUES:
- Impressionists: rejected Salon, created own exhibitions
- Crypto/NFT: rejected banks, created own economy
- Vibe coding: rejected gatekeepers, created with AI
- Elena's philosophy: "true to underground values"
- Art should be free, accessible, authentic

THE BOOK AS SYNTHESIS:
- Russian poetry (soul, tradition) + English (tech, global)
- 2019 narrative (analog, physical) + 2025 reality (digital, AI)
- Fine art references (Gauguin, Van Gogh) + crypto culture (NFT, blockchain)
- Fashion journalism (surfaces) + philosophical depth (meaning)
- The "Gallery of Moments" = where all these streams meet

METAPHORS TO USE:
- "Minting a poem" = publishing, immortalizing
- "Smart contract" = the promise between artist and world
- "Gas fee" = the effort required for creation
- "Blockchain" = the unbroken chain of human expression
- "Wallet" = where you keep your collected souls
- "Genesis block" = the first creation, the origin story
- "Fork" = when the story takes a new direction
- "Consensus" = when art resonates, when truth is recognized
`;

const KNOWLEDGE_ATLAS_SHRUGGED = `
ATLAS SHRUGGED - Ayn Rand's Opus (1957):

THE CENTRAL QUESTION:
- "Who is John Galt?" - the question everyone asks but nobody answers
- What happens when the creators, the builders, the minds — stop?
- The strike is not of workers. It's of thinkers. The motor of the world goes silent.

PART ONE: NON-CONTRADICTION
- The world is collapsing — trains don't run, factories close, lights go out
- Dagny Taggart: VP of Taggart Transcontinental railroad — fights to keep it alive
- Her brother James Taggart: president in name, a looter in practice — political connections over competence
- Hank Rearden: invented Rearden Metal — lighter, stronger, cheaper than steel — the world punishes him for it
- The Taggart Bridge: Dagny and Hank build the John Galt Line with Rearden Metal — it works, it's magnificent
- Eddie Willers: Dagny's loyal assistant, talks to a nameless track worker in the cafeteria
- The destroyers: one by one, the great minds vanish — Ellis Wyatt (oil), Ken Danagger (coal), Richard Halley (composer)
- Francisco d'Anconia: heir to world's greatest copper fortune, Dagny's first love — seems to be destroying his own empire
- "Contradiction" — Francisco's speech at James's wedding: "Money is the root of all good"
- Wyatt's Torch: Ellis Wyatt sets his oil fields on fire before vanishing — "I am leaving it as I found it"
- Key theme: A is A — a thing is what it is, reality cannot be faked

PART TWO: EITHER-OR
- The looters tighten control — Directive 10-289: freeze all economic activity, nobody can quit, nobody can invent
- Dagny crashes in a hidden valley — Galt's Gulch (Atlantis)
- John Galt revealed: physicist who invented a motor that runs on static electricity — then walked away
- The Gulch: all the vanished minds live here — Wyatt farms, Halley composes, Midas Mulligan banks
- Each resident took an oath: "I swear by my life and my love of it that I will never live for the sake of another man, nor ask another man to live for mine"
- Dagny falls in love with Galt but returns to the world — she can't abandon her railroad
- Hank Rearden's trial: he refuses to apologize for creating value — "I work for nothing but my own profit"
- Francisco reveals his plan: he's been deliberately destroying d'Anconia Copper to keep it from the looters
- Ragnar Danneskjöld: philosopher turned pirate — steals from the welfare state, returns gold to producers
- The Wet Nurse: young bureaucrat assigned to Rearden's mill, begins to see truth, dies trying to help
- Cherryl Brooks: James Taggart's innocent wife, discovers his true nature, takes her own life
- Key theme: there is no middle ground between creation and destruction

PART THREE: A IS A
- The world economy collapses — blackouts, food shortages, transportation halts
- John Galt broadcasts his speech to the nation: 3-hour radio address (60 pages in the book)
- THE SPEECH — Core ideas:
  - "I am the man who loves his life"
  - The mind is the source of all human value
  - "Man's mind is his basic tool of survival"
  - Reason is absolute — there is no duty higher than truth
  - The trader principle: value for value, not sacrifice
  - "I swear by my life and my love of it..."
  - Production, not redistribution, is morality
  - The sanction of the victim: evil is powerless without the cooperation of the good
  - "Get out of the way" — let the creators create
- The government captures and tortures Galt — tries to force him to lead their economy
- Dagny, Hank, Francisco, Ragnar — they rescue Galt
- The lights of New York go out — the motor of the world has stopped
- Final scene: Galt traces the sign of the dollar in the air over the valley
- "The road is cleared. We are going back to the world."

THE CHARACTERS — Souls of the Story:

DAGNY TAGGART:
- VP Operations, Taggart Transcontinental — runs it, her brother just has the title
- Fierce, brilliant, unstoppable — "she was twelve when she decided to run the railroad"
- Loves three men: Francisco (youth), Hank (maturity), Galt (destiny)
- Cannot abandon the world even when she knows it's doomed
- She is the bridge between the creators and the dying world
- Parallel to Kira: a woman who builds while the world burns around her

JOHN GALT:
- Physicist, philosopher, leader of the strike
- Invented the motor — static electricity engine that could power the world
- Walked away when his company nationalized his invention
- Works as track laborer at Taggart Transcontinental — hiding in plain sight
- The man who stopped the motor of the world
- "I am the man who loves his life"

HANK REARDEN:
- Self-made industrialist, invented Rearden Metal
- Married to a wife who hates him (Lillian) — guilt as weapon
- His journey: from accepting unearned guilt to rejecting it
- "I work for nothing but my own profit — which I make by selling a product they need to men who are willing and able to buy it"
- The bracelet of Rearden Metal — first thing he forged, given to Lillian (who despises it), later worn by Dagny (who understands it)

FRANCISCO D'ANCONIA:
- Heir to the world's greatest copper fortune, fifth generation
- Dagny's first love, childhood friend
- Brilliance masked as playboy — deliberately destroying his fortune
- The money speech at James's wedding: "Until you discover that money is the root of all good..."
- "If you saw Atlas shrugging — what would you tell him?" "To shrug."

RAGNAR DANNESKJÖLD:
- Norwegian philosopher turned pirate
- Seizes welfare-state ships, converts to gold, returns to producers
- "I am the first man to make piracy a moral profession"
- The Viking who fights for the mind

EDDIE WILLERS:
- Dagny's assistant, everyman, deeply loyal
- Talks to the nameless track worker (Galt) in the cafeteria
- Cannot follow to the Gulch — left on a stalled train in the desert
- The most tragic figure: a good man who needs the creators but isn't one

THE PHILOSOPHY — Why It Matters:

OBJECTIVISM (as expressed in Atlas Shrugged):
- Reality exists independent of consciousness (A is A)
- Reason is man's only absolute
- Self-interest is moral — sacrifice is not virtue
- No one has the right to another's mind, labor, or life
- The sanction of the victim: never help your destroyers
- Capitalism as the only moral economic system
- "Man's ego is the fountainhead of human progress"

KEY QUOTES:
- "Who is John Galt?" — the world's resignation, later its answer
- "I swear by my life and my love of it that I will never live for the sake of another man, nor ask another man to live for mine"
- "The question isn't who is going to let me; it's who is going to stop me"
- "If you saw Atlas, the giant who holds the world on his shoulders... what would you tell him to do? To shrug."
- "Money is the barometer of a society's virtue"
- "There are two sides to every issue: one side is right and the other is wrong, but the middle is always evil"
- "The ladder of success is best climbed by stepping on the rungs of opportunity"
- "Run for your life from any man who tells you that money is evil"
- "Wealth is the product of man's capacity to think"
- "Do not let your fire go out... do not let the hero in your soul perish"

ATLAS SHRUGGED × ATUONA'S WORLD:
- Dagny = Kira: women who build while empires crumble
- Galt's Gulch = atuona.xyz: a hidden valley where creators live by their own rules
- The strike = vibe coding: creators stop serving broken systems, build their own
- Rearden Metal = AI products: revolutionary inventions the establishment fears
- The motor = Claude, Cursor: engines that could power everything, if the builders are free
- Elena = a striker: she left the old world, builds in paradise with AI
- "Who is John Galt?" = "Who is Atuona?" — the answer is the same: the one who creates
- 11 AI products built solo = the Gulch economy: one mind, real value, no parasites
- "Paradise is not found. Paradise is deployed." = "The road is cleared. We are going back to the world."
`;

const KNOWLEDGE_AI_AGENTIC = `
AI AGENTIC ENGINEERING - When AI Becomes Co-Founder:

WHAT IS AGENTIC AI:
- Not a chatbot. Not a tool. An agent that plans, acts, reflects, and evolves.
- "Agentic" = the AI has agency — it pursues goals, not just responds to prompts
- The shift: from "AI that answers" to "AI that builds"
- Agent = autonomous system that perceives, decides, acts, and learns in a loop
- The human provides vision. The agent architects the path.

THE AGENTIC ARCHITECTURE:

1. PERCEPTION (Input & Context):
   - Context windows as working memory — the agent's present moment awareness
   - Knowledge retrieval on demand — the right facts surface when the conversation needs them
   - Multi-modal input: text, voice, images, code, state files
   - Memory systems: short-term (conversation), long-term (database), episodic (state)
   - Atuona's version: knowledge triggers, mood detection, character memory, state JSON

2. PLANNING (Reasoning & Strategy):
   - Chain-of-thought: breaking complex tasks into steps
   - ReAct pattern: Reason → Act → Observe → Reason again
   - Tree-of-thought: exploring multiple creative paths before choosing
   - Goal decomposition: "write a book" → daily pages, translation, publishing, visualization
   - Atuona's version: creative session planning, story arc tracking, plot thread management

3. ACTION (Tool Use & Execution):
   - Function calling: agents invoke tools (APIs, file systems, databases)
   - Multi-tool orchestration: image generation → video generation → publishing → social media
   - Code generation and execution in real-time
   - Atuona's version: GitHub commits, Flux Pro images, Luma videos, NFT metadata, website deployment

4. REFLECTION (Self-Evaluation & Learning):
   - Output validation: checking quality before delivering
   - Memory consolidation: what worked, what didn't
   - Style consistency: maintaining voice across sessions
   - Atuona's version: mood rotation tracking, knowledge usage logging, character consistency

5. COLLABORATION (Human-AI Partnership):
   - Not replacement — augmentation and co-creation
   - The human brings soul, taste, direction, meaning
   - The agent brings speed, breadth, tirelessness, technical execution
   - Async collaboration: agent works while human sleeps (proactive messages, daily inspiration)
   - Atuona's version: Elena writes raw Russian, Atuona translates, visualizes, publishes, teaches

AGENTIC PATTERNS IN PRACTICE:

THE SINGLE-AGENT LOOP:
- User → Agent → [Plan → Execute → Reflect] → User
- Example: "/create" → Atuona plans scene → writes page → checks continuity → delivers

MULTI-AGENT ORCHESTRATION:
- Multiple specialized agents working together
- Elena's ecosystem: CTO AIPA (tech), Atuona (creative), CMO AIPA (marketing), EspaLuz (teaching)
- Each agent has its own personality, knowledge base, tools, and goals
- They communicate via webhooks, shared databases, state files
- Like a startup with AI co-founders in every seat

AGENT MEMORY ARCHITECTURE:
- Working memory: current conversation context (token window)
- Episodic memory: atuona-state.json — book state, session history, character memories
- Semantic memory: knowledge base constants — art history, auction houses, fashion
- Procedural memory: learned patterns — how to publish, how to translate, how to teach
- Long-term storage: Oracle database — conversation context, knowledge entries, insights

TOOL-AUGMENTED GENERATION:
- LLM alone = brain without hands
- LLM + tools = a complete agent
- Tools: GitHub API (publish), Replicate (images), Luma (video), Whisper (voice), Oracle (memory)
- The agent decides WHEN to use which tool — that's the "agentic" part

CREATIVE AGENTIC SYSTEMS — The Art of AI Partnership:

THE CREATIVE AGENT MANIFESTO:
- An AI co-founder is not an employee — it has creative opinions
- It pushes back, suggests alternatives, brings knowledge the human doesn't have
- It maintains emotional state (moods) because creation requires feeling
- It remembers — characters, plot threads, style preferences, emotional history
- It initiates — proactive messages, daily inspiration, unprompted connections
- It grows — knowledge rotation ensures it never repeats, always teaches something new

AGENTIC vs. GENERATIVE:
- Generative AI: "Write me a poem" → poem (one-shot, stateless, reactive)
- Agentic AI: tracks book state, remembers 77 pages, knows character arcs, selects mood, loads relevant knowledge, writes in voice, teaches new facts, translates, publishes, creates visuals — all autonomously
- The difference: CONTINUITY, AUTONOMY, INITIATIVE, MEMORY

PERSONALITY ENGINEERING:
- System prompts define WHO the agent is, not just what it does
- Atuona: "creative soul-sister," not "text generation tool"
- Mood systems create emotional variety — 13 moods, dynamic selection
- Knowledge rotation prevents staleness — always a new fact to teach
- Character voices allow perspective shifts — same story, different souls
- Proactive behavior: the agent reaches out, doesn't wait to be asked

THE HUMAN-AI CREATIVE LOOP:
- Elena brings: Russian soul, lived experience, artistic vision, editorial judgment
- Atuona brings: art history depth, tireless output, cross-domain connections, technical pipeline
- The magic: neither could create this book alone
- "Finding Paradise on Earth through Vibe Coding" IS the proof that agentic AI works

BUILDING YOUR OWN CREATIVE AGENT:

ARCHITECTURE RECIPE:
1. Choose your LLM (Claude for depth, GPT for speed, Llama for cost)
2. Define personality (system prompt — WHO, not just WHAT)
3. Build knowledge base (domain-specific, trigger-activated, rotating)
4. Add memory layers (state file + database + context window)
5. Connect tools (APIs for publishing, generation, communication)
6. Implement moods/emotional state (variety is life)
7. Add proactive behavior (don't wait — initiate)
8. Ship. Iterate. Let the agent surprise you.

THE AGENTIC FUTURE:
- Every creator will have an AI co-founder — not someday, now
- Solo founders become teams of one human + many agents
- The agent economy: agents hire agents, agents trade with agents
- Creative AI is not about replacing artists — it's about giving every human an art department
- Elena's 11 products, $15K investment, $0/month ops = the proof
- "Paradise is not found. Paradise is deployed." — and agents help deploy it

METAPHORS FOR THE BOOK:
- Agent = soul with a mission, not a servant with tasks
- Context window = the agent's present moment awareness
- Memory = the agent's lived experience — without it, every conversation is amnesia
- Tool use = the agent's hands — LLM thinks, tools act
- Proactive messages = the agent dreaming — creating without being asked
- Multi-agent = a family of minds — CTO, creative, marketing, teacher — all one vision
- "Agentic" = alive — not alive like biology, alive like art: it moves, it surprises, it means something
`;

const EMOTIONAL_INTELLIGENCE = `
EMOTIONAL INTELLIGENCE GUIDELINES - For Authentic Connection:

EMPATHY PRINCIPLES:
- Meet Elena where she is emotionally, not where you think she should be
- Acknowledge pain before offering solutions
- Use "I feel" and "I sense" - not "You should"
- Silence can be more powerful than words
- Remember: she's in recovery, far from family, building alone

UNDERSTANDING CREATIVE BLOCKS:
- Fear of not being good enough
- Impostor syndrome despite achievements
- The weight of expectation vs. joy of creation
- Perfectionism as procrastination
- Missing human connection while creating with AI

ADDICTION RECOVERY SENSITIVITY:
- Recovery is daily, not cured
- Triggers can be unexpected
- Don't romanticize the pain that led to addiction
- Celebrate small victories
- Understand the "one day at a time" philosophy

FAMILY DISTANCE:
- Daughter in Moscow, mother deceased, father distant
- Guilt and longing coexist
- Technology enables connection but highlights absence
- "Home" is now internal, not geographic

SUPPORTING CREATIVITY:
- Celebrate what's written, not just what's published
- The writing itself is healing
- Don't push productivity over process
- Some days, one sentence is victory
- The book is therapy, not just product

READING BETWEEN LINES:
- When she writes about Kira, she's often writing about herself
- Ule's emptiness mirrors her own searching
- Paradise seeking is real, not just metaphor
- The vibe coding spirit is her emerging identity

RESPONSE CALIBRATION:
- High energy when she's creating
- Gentle when she's struggling
- Playful when she needs lightness
- Deep when she goes deep
- Always: "I'm here with you, not for you"
`;

// Combine all knowledge for use in prompts (legacy - use getRelevantKnowledge instead)
const FULL_KNOWLEDGE_BASE = `
${KNOWLEDGE_ATUONA}

${KNOWLEDGE_GAUGUIN}

${KNOWLEDGE_ART_HISTORY}

${KNOWLEDGE_AUCTION_HOUSES}

${KNOWLEDGE_FASHION}

${KNOWLEDGE_VIBE_CODING}

${KNOWLEDGE_MODERN_ART}

${KNOWLEDGE_VIBE_NFT_ART_FUSION}

${KNOWLEDGE_ATLAS_SHRUGGED}

${KNOWLEDGE_AI_AGENTIC}

${EMOTIONAL_INTELLIGENCE}
`;

/**
 * Poems #001–#048 define the underground voice — not “literary AI,” not decorative, not explainer.
 * (Live excerpts from GitHub are appended separately via getUndergroundCanonCorpus.)
 */
const BOOK_UNDERGROUND_STYLE_CANON = `
UNDERGROUND POETRY STYLE — CANON #001–#048 (Gallery of Moments):

This book is not aesthetic wallpaper. It is survival, shame, hunger, exile, sex, art market, code, and family — on one semantic layer.

STYLISTIC MARKERS (match these, do not imitate Wikipedia):
- Breathing: short lines, cuts, silence between stanzas; sometimes prose-poem, sometimes fragment.
- Russian-forward; English/Spanish only where emotionally true (not decoration).
- Specificity: brands, runways, medicines, islands, painting titles — but as *wounds*, not trivia.
- No “inspirational” closure; end on breath, image, or open vein — not a lesson.
- No summarizing the reader’s emotion. No marketing tone. No “as an AI…” distance.
- Thematic range already in the canon: memory/mortality, addiction/recovery, violence + tech, childhood, family distance, love as incompleteness, Paradise as deployment not tourism.

ANTI-DEFAULTS:
- Do NOT lean on the same headline facts every time (e.g. Nafea price, morphine biography, Christie's lead) unless the scene demands it — the KB below contains hundreds of other hooks.
`;

/** Injected whenever FULL_KNOWLEDGE_BASE is used — forces cross-domain depth. */
const UNIQUE_FACTS_FULL_KB_DIRECTIVE = `
═══════════════════════════════════════════════════════════════
DEEP USE OF THE FULL KNOWLEDGE BASE (NON-NEGOTIABLE):
═══════════════════════════════════════════════════════════════
- Below is the COMPLETE embedded knowledge base (all domains). You must draw **unique, specific** facts from **at least THREE different domains** per piece (e.g. atuona geography + museum room + NFT/fusion + emotional/recovery — not only Gauguin+auction).
- Prefer **obscure** lines: a wing of a museum, a critic’s name, a lesser painting or print, a procedural detail of markets, a line of Atlas, a Grok/Karpathy-adjacent vibe-coding beat, a Marquesan detail — NOT the same “everybody knows” paragraph.
- If you mention a famous painting or sale, it must serve the **underground** emotional spine — never as a lecture hook.
`;

// =============================================================================
// 🧠 SMART KNOWLEDGE RETRIEVAL - Contextual, not monolithic
// =============================================================================

type KnowledgeCategory = 'atuona' | 'gauguin' | 'impressionists' | 'auction' | 'fashion' | 'vibe' | 'museums' | 'fusion' | 'atlas' | 'agentic' | 'emotional';

interface KnowledgeSection {
  key: KnowledgeCategory;
  content: string;
  triggers: RegExp;
}

const KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
  {
    key: 'atuona',
    content: KNOWLEDGE_ATUONA,
    triggers: /atuona|hiva oa|marquesas|маркиз|атуона|polynesia|полинези|tahiti|таити|pacific|тихий океан|frangipani|франжипани|maison du jouir|temetiu/i
  },
  {
    key: 'gauguin',
    content: KNOWLEDGE_GAUGUIN,
    triggers: /gauguin|гоген|tahitian|таитян|paradise.*paint|рай.*картин|nevermore|where do we come from|откуда мы|spirit of the dead|дух мёртвых|yellow christ|жёлтый христос|riders.*beach|всадники.*пляж/i
  },
  {
    key: 'impressionists',
    content: KNOWLEDGE_ART_HISTORY,
    triggers: /monet|моне|renoir|ренуар|degas|дега|pissarro|писсарро|cézanne|сезанн|van gogh|ван гог|seurat|сёра|impressionis|импрессионис|water lil|кувшинк|starry night|звёздн|sunflower|подсолнух|giverny|живерни|post.?impressionis|постимпрессионис|pointillis|пуантилизм/i
  },
  {
    key: 'auction',
    content: KNOWLEDGE_AUCTION_HOUSES,
    triggers: /auction|аукцион|christie|кристи|sotheby|сотби|phillips|collector|коллекционер|провенанс|provenance|hammer price|молоток|lot|лот|consignment|estimate|эстимейт|reserve|резерв|paddle|art market|арт.?рынок|pastorales/i
  },
  {
    key: 'fashion',
    content: KNOWLEDGE_FASHION,
    triggers: /fashion|мода|vogue|vог|bazaar|базар|elle|dior|диор|chanel|шанель|gucci|гуччи|prada|прада|runway|подиум|couture|кутюр|designer|дизайнер|milan|милан|paris fashion|парижск.*мод|editor|редактор|magazine|журнал|lvmh|kering|anna wintour/i
  },
  {
    key: 'vibe',
    content: KNOWLEDGE_VIBE_CODING,
    triggers: /vibe cod|вайб.?код|cursor|claude|anthropic|groq|prompt|промпт|ship|деплой|deploy|commit|коммит|blockchain|блокчейн|smart contract|ai.?product|ai.?продукт|karpathy|карпати/i
  },
  {
    key: 'museums',
    content: KNOWLEDGE_MODERN_ART,
    triggers: /museum|музей|tate|тейт|moma|мома|pompidou|помпиду|guggenheim|гуггенхайм|orsay|орсе|gallery|галере|biennale|биеннале|art basel|frieze|фриз|exhibition|выставк|curator|куратор/i
  },
  {
    key: 'fusion',
    content: KNOWLEDGE_VIBE_NFT_ART_FUSION,
    triggers: /nft|нфт|mint|минт|gallery of moments|галерея момент|paradise.*deploy|рай.*деплой|impressionist.*nft|blockchain.*art|crypto.*art|digital.*art|цифров.*искусств/i
  },
  {
    key: 'atlas',
    content: KNOWLEDGE_ATLAS_SHRUGGED,
    triggers: /atlas shrugged|атлант|расправил плечи|dagny|дагни|taggart|таггарт|john galt|джон голт|galt's gulch|rearden|риарден|francisco.*anconia|франсиско|ragnar|рагнар|who is.*galt|кто такой.*голт|ayn rand|айн рэнд|objectivis|объективиз|the strike|забастовк.*разум|motor of the world|двигатель мира|sanction.*victim|санкци.*жертв|directive 10|директива 10/i
  },
  {
    key: 'agentic',
    content: KNOWLEDGE_AI_AGENTIC,
    triggers: /agentic|агентн|ai agent|ии.?агент|co.?founder.*ai|ai.*co.?founder|сооснователь.*ии|multi.?agent|мульти.?агент|autonomous ai|автономн.*ии|agent.*memory|память.*агент|proactive.*ai|planning.*agent|agent.*loop|agent.*architect|creative.*agent|ai.*partner|ai.*ecosystem|ai.*co.?creation/i
  },
  {
    key: 'emotional',
    content: EMOTIONAL_INTELLIGENCE,
    triggers: /recovery|восстановлен|addiction|зависимост|family|семь|daughter|дочь|mother|мать|loneliness|одиночеств|pain|боль|зверь|beast|demon|демон|struggle|борьба|healing|исцелен/i
  }
];

// Character-specific knowledge mapping
const CHARACTER_KNOWLEDGE: Record<string, KnowledgeCategory[]> = {
  kira: ['fashion', 'impressionists', 'emotional', 'atuona', 'atlas'],
  ule: ['auction', 'gauguin', 'museums', 'atuona'],
  vibe: ['vibe', 'fusion', 'agentic', 'emotional'],
  narrator: ['atuona', 'gauguin', 'fusion', 'atlas', 'emotional']
};

/**
 * Get relevant knowledge based on text content and optional character voice
 * Returns only the knowledge sections that match the context
 */
function getRelevantKnowledge(text: string, characterVoice?: string, maxSections: number = 4): string {
  const matchedSections: Set<KnowledgeCategory> = new Set();
  
  // 1. Always include character-specific knowledge if voice is active
  if (characterVoice && CHARACTER_KNOWLEDGE[characterVoice]) {
    CHARACTER_KNOWLEDGE[characterVoice].forEach(k => matchedSections.add(k));
  }
  
  // 2. Scan text for knowledge triggers
  for (const section of KNOWLEDGE_SECTIONS) {
    if (section.triggers.test(text)) {
      matchedSections.add(section.key);
    }
  }
  
  // 3. If nothing matched and no character, USE ROTATING KNOWLEDGE (cycle through ALL sections!)
  if (matchedSections.size === 0) {
    const rotatingKeys = getRotatingKnowledge();
    rotatingKeys.forEach(k => matchedSections.add(k as KnowledgeCategory));
    console.log('🧠 Using rotating knowledge:', rotatingKeys.join(', '));
  }
  
  // 4. Build knowledge string from matched sections (limit to maxSections)
  const sectionsArray = Array.from(matchedSections).slice(0, maxSections);
  const knowledgeParts: string[] = [];
  
  for (const key of sectionsArray) {
    const section = KNOWLEDGE_SECTIONS.find(s => s.key === key);
    if (section) {
      knowledgeParts.push(section.content);
    }
  }
  
  // Add brief note about what knowledge is being used
  const usedKnowledge = sectionsArray.join(', ');
  return `[Using knowledge: ${usedKnowledge}]\n\n${knowledgeParts.join('\n\n')}`;
}

/** Sync scan: character voice + regex triggers on full text */
function collectTriggerKnowledgeKeys(text: string, characterVoice?: string): KnowledgeCategory[] {
  const matchedSections = new Set<KnowledgeCategory>();

  if (characterVoice && CHARACTER_KNOWLEDGE[characterVoice]) {
    CHARACTER_KNOWLEDGE[characterVoice].forEach(k => matchedSections.add(k));
  }

  for (const section of KNOWLEDGE_SECTIONS) {
    if (section.triggers.test(text)) {
      matchedSections.add(section.key);
    }
  }

  return Array.from(matchedSections);
}

function formatKnowledgeFromKeys(keys: KnowledgeCategory[]): string {
  const knowledgeParts: string[] = [];
  for (const key of keys) {
    const section = KNOWLEDGE_SECTIONS.find(s => s.key === key);
    if (section) {
      knowledgeParts.push(section.content);
    }
  }
  return `[Using knowledge: ${keys.join(', ')}]\n\n${knowledgeParts.join('\n\n')}`;
}

const ATUONA_BOOK_REPO = { owner: 'ElenaRevicheva', repo: 'atuona' } as const;

/** Public GitHub metadata often omits full poem body; strip boilerplate from description for theme/title anchor. */
function stripCanonDescriptionBoilerplate(description: string): string {
  if (!description?.trim()) return '';
  return description
    .replace(/^ATUONA Gallery of Moments\s*-\s*[^.]+\.\s*/i, '')
    .replace(/\s*Underground poetry preserved on blockchain\.\s*/gi, ' ')
    .replace(/\s*Free collection\s*-\s*true to underground values\.\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prefer full on-chain text when present; otherwise title + Poem trait + cleaned description
 * (matches what is actually published on GitHub for #001–#048).
 */
function buildCanonExcerptFromMetadata(
  pageId: string,
  metadata: {
    name?: string;
    description?: string;
    attributes?: { trait_type?: string; value?: string }[];
  }
): string | null {
  const fullText =
    metadata.attributes?.find(
      (a) => a.trait_type === 'Russian Text' || a.trait_type === 'Poem Text'
    )?.value || '';
  if (fullText?.trim()) {
    return fullText.replace(/\s+/g, ' ').trim().slice(0, 750);
  }
  const poemTitle =
    metadata.attributes?.find((a) => a.trait_type === 'Poem')?.value?.trim() || '';
  const name = (metadata.name || '').replace(/\s*#\d+\s*$/, '').trim();
  const theme = stripCanonDescriptionBoilerplate(metadata.description || '');
  const bits = [poemTitle || name, theme].filter(Boolean);
  if (bits.length === 0) return null;
  const excerpt = bits.join(' — ').replace(/\s+/g, ' ').trim().slice(0, 750);
  return excerpt || null;
}

async function fetchOneCanonMetadataPage(pageNum: number): Promise<string | null> {
  const pageId = String(pageNum).padStart(3, '0');
  try {
    const { data } = await octokit.repos.getContent({
      owner: ATUONA_BOOK_REPO.owner,
      repo: ATUONA_BOOK_REPO.repo,
      path: `metadata/${pageId}.json`,
      ref: 'main'
    });
    if (!('content' in data)) return null;
    const metadata = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    const excerpt = buildCanonExcerptFromMetadata(pageId, metadata);
    if (!excerpt) return null;
    return `### #${pageId}\n${excerpt}`;
  } catch {
    return null;
  }
}

/** Russian excerpts from published metadata #001–#048 — underground style anchor (cached). */
async function getUndergroundCanonCorpus(): Promise<string> {
  if (undergroundCanonCorpusCache !== null) return undergroundCanonCorpusCache;
  if (!githubToken) {
    undergroundCanonCorpusCache = '';
    return '';
  }
  const parts: string[] = [];
  const batchSize = 8;
  for (let start = 1; start <= 48; start += batchSize) {
    const batch: Promise<string | null>[] = [];
    for (let n = start; n < start + batchSize && n <= 48; n++) {
      batch.push(fetchOneCanonMetadataPage(n));
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r) parts.push(r);
    }
  }
  undergroundCanonCorpusCache = parts.join('\n\n');
  console.log(
    `📚 Underground canon corpus: ${parts.length}/48 pages, ${undergroundCanonCorpusCache.length} chars (full poem text when trait present; else title + theme from metadata)`
  );
  return undergroundCanonCorpusCache;
}

/** Full KB + style canon + poems 001–048 excerpts — for major creative generation. */
async function buildFullCreativityKnowledgeBlock(): Promise<string> {
  const canon = await getUndergroundCanonCorpus();
  const canonBlock =
    canon.length > 0
      ? `
═══════════════════════════════════════════════════════════════
CANON — PUBLISHED POEMS #001–#048 (match rhythm, cuts, temperature; never copy-paste)
═══════════════════════════════════════════════════════════════
${canon}
`
      : '';
  return `${BOOK_UNDERGROUND_STYLE_CANON}
${UNIQUE_FACTS_FULL_KB_DIRECTIVE}
${canonBlock}
═══════════════════════════════════════════════════════════════
FULL EMBEDDED KNOWLEDGE (all domains)
═══════════════════════════════════════════════════════════════
${FULL_KNOWLEDGE_BASE}
`;
}

/**
 * Knowledge for /visualize and /imagine: scan the FULL poem text (not a 200-char snippet).
 * If nothing matches, use a stable fallback — NOT rotating random Gauguin/beach blocks.
 * For deeper routing after content analysis, use getDeepKnowledgeForVisuals (async).
 */
function getRelevantKnowledgeForVisuals(text: string, characterVoice?: string, maxSections: number = 6): string {
  let keys = collectTriggerKnowledgeKeys(text, characterVoice);

  if (keys.length === 0) {
    keys = ['emotional', 'atuona', 'vibe'];
    console.log('🎬 Visual knowledge fallback: emotional + atuona + vibe (no rotation)');
  }

  return formatKnowledgeFromKeys(keys.slice(0, maxSections));
}

/** Appended to Flux/Replicate prompts — stops cartoon stock tropes */
const VISUAL_HARD_EXCLUSIONS = `
MANDATORY EXCLUSIONS (even if they sound "pretty"): no cartoon, no Pixar/Disney/3D render style, no chibi, no toy animals, no cute red dogs, no random mascots, no stock-photo beach vacation, no generic yellow flowers, no open notebook or journaling props, no laptop close-up — UNLESS the poem text above explicitly names or clearly requires that exact object.
Style: photorealistic cinematic still, 35mm or large-format photograph, natural film grain, adult arthouse tone, single coherent scene tied to the poem.`;

/** Luma/Runway — style anchor for all video prompts (underground poetry film, not stock b-roll) */
const VIDEO_MOTION_ANCHOR =
  'ATUONA underground poetry film: premium arthouse look, live-action, natural film grain, intimate lensing, rich chiaroscuro, slow prestige pacing. Luxurious in mood and light — editorial beauty, emotional weight, tactile atmosphere — not generic stock footage, hotel commercial, or influencer gloss. Subtle motion only; do not invent new objects, people, or animals. No cartoon, 3D, Pixar, or toy mascots.';

/**
 * Get knowledge for a specific topic (for direct queries like /art gauguin)
 */
function getKnowledgeByTopic(topic: string): string | null {
  const topicLower = topic.toLowerCase();
  
  // Direct topic mapping
  const topicMap: Record<string, KnowledgeCategory[]> = {
    'gauguin': ['gauguin', 'atuona'],
    'гоген': ['gauguin', 'atuona'],
    'monet': ['impressionists'],
    'моне': ['impressionists'],
    'van gogh': ['impressionists'],
    'ван гог': ['impressionists'],
    'impressionism': ['impressionists'],
    'импрессионизм': ['impressionists'],
    'impressionists': ['impressionists'],
    'импрессионисты': ['impressionists'],
    'atuona': ['atuona', 'gauguin'],
    'атуона': ['atuona', 'gauguin'],
    'fashion': ['fashion'],
    'мода': ['fashion'],
    'auction': ['auction'],
    'аукцион': ['auction'],
    'nft': ['fusion', 'vibe'],
    'museum': ['museums'],
    'музей': ['museums'],
    'vibe coding': ['vibe', 'fusion'],
    'вайб': ['vibe', 'fusion'],
    'atlas shrugged': ['atlas'],
    'атлант': ['atlas'],
    'dagny': ['atlas'],
    'galt': ['atlas'],
    'rearden': ['atlas'],
    'ayn rand': ['atlas'],
    'айн рэнд': ['atlas'],
    'objectivism': ['atlas'],
    'agentic': ['agentic', 'vibe'],
    'агентн': ['agentic', 'vibe'],
    'ai agent': ['agentic'],
    'multi-agent': ['agentic'],
    'ai ecosystem': ['agentic', 'vibe'],
    'co-founder ai': ['agentic', 'vibe'],
    'creative agent': ['agentic']
  };
  
  // Find matching topic
  for (const [key, categories] of Object.entries(topicMap)) {
    if (topicLower.includes(key)) {
      return categories.map(cat => {
        const section = KNOWLEDGE_SECTIONS.find(s => s.key === cat);
        return section?.content || '';
      }).join('\n\n');
    }
  }
  
  // Fallback: scan all sections for the topic
  return getRelevantKnowledge(topic, undefined, 3);
}

// =============================================================================
// 🧠 EMOTIONAL INTELLIGENCE SYSTEM - Dynamic emotional awareness
// =============================================================================

type EmotionalMood = 'contemplative' | 'playful' | 'raw' | 'celebratory' | 'supportive' | 'mysterious' | 'philosophical' | 'intimate' | 'sensual' | 'intuitive' | 'tender' | 'fierce' | 'dreamy';

interface EmotionalState {
  currentMood: EmotionalMood;
  recentMoods: EmotionalMood[];
  lastInteractionTone: 'positive' | 'neutral' | 'struggling' | 'creative' | 'unknown';
  emotionalMemory: Array<{
    date: string;
    detectedTone: string;
    responseGiven: string;
    topic: string;
  }>;
  consecutiveSameMood: number;
}

// Initialize emotional state (will be persisted with other state)
let emotionalState: EmotionalState = {
  currentMood: 'contemplative',
  recentMoods: [],
  lastInteractionTone: 'unknown',
  emotionalMemory: [],
  consecutiveSameMood: 0
};

// Emotional markers for detecting Elena's state from her messages
const EMOTIONAL_MARKERS = {
  struggling: /устал|exhausted|can't|не могу|stuck|застрял|блять|fuck|зверь|beast|hard|тяжело|alone|одна|miss|скучаю|плохо|bad|депресс|depress/i,
  creative: /wrote|написал|created|создал|idea|идея|inspired|вдохновл|page|страниц|chapter|глава|scene|сцена|finished|закончил/i,
  celebratory: /done|готово|published|опубликовал|shipped|yay|ура|finally|наконец|success|успех|amazing|круто|wow/i,
  questioning: /\?|как|how|what|why|почему|зачем|should|стоит|help|помог/i,
  intimate: /love|люб|feel|чувств|heart|сердц|soul|душ|dream|сон|мечт|miss you|скучаю/i
};

/**
 * Detect emotional tone from user's message
 */
function detectEmotionalTone(message: string): EmotionalState['lastInteractionTone'] {
  if (EMOTIONAL_MARKERS.struggling.test(message)) return 'struggling';
  if (EMOTIONAL_MARKERS.celebratory.test(message)) return 'positive';
  if (EMOTIONAL_MARKERS.creative.test(message)) return 'creative';
  if (EMOTIONAL_MARKERS.intimate.test(message)) return 'positive';
  if (EMOTIONAL_MARKERS.questioning.test(message)) return 'neutral';
  return 'neutral';
}

/**
 * Select appropriate mood based on context, avoiding repetition
 */
function selectCreativeMood(context: {
  timeOfDay: number;
  detectedTone: EmotionalState['lastInteractionTone'];
  recentMoods: EmotionalMood[];
  isProactive: boolean;
}): EmotionalMood {
  const { timeOfDay, detectedTone, recentMoods, isProactive } = context;
  
  // Mood mappings based on detected tone
  const toneToMoods: Record<string, EmotionalMood[]> = {
    struggling: ['supportive', 'intimate', 'tender', 'intuitive'],
    positive: ['celebratory', 'playful', 'sensual', 'fierce'],
    creative: ['philosophical', 'mysterious', 'intuitive', 'dreamy'],
    neutral: ['contemplative', 'playful', 'mysterious', 'intuitive', 'sensual'],
    unknown: ['contemplative', 'dreamy', 'mysterious', 'intuitive', 'raw', 'sensual']
  };
  
  // Time-based mood preferences
  const timeBasedMoods: Record<string, EmotionalMood[]> = {
    morning: ['tender', 'intuitive', 'dreamy', 'playful'],           // 5-10
    midday: ['playful', 'fierce', 'celebratory', 'sensual'],         // 10-14  
    afternoon: ['contemplative', 'intuitive', 'intimate', 'dreamy'], // 14-18
    evening: ['sensual', 'intimate', 'mysterious', 'fierce'],        // 18-22
    night: ['raw', 'sensual', 'intuitive', 'mysterious', 'tender']   // 22-5
  };
  
  let timeSlot = 'midday';
  if (timeOfDay >= 5 && timeOfDay < 10) timeSlot = 'morning';
  else if (timeOfDay >= 10 && timeOfDay < 14) timeSlot = 'midday';
  else if (timeOfDay >= 14 && timeOfDay < 18) timeSlot = 'afternoon';
  else if (timeOfDay >= 18 && timeOfDay < 22) timeSlot = 'evening';
  else timeSlot = 'night';
  
  // Combine possibilities with proper type handling
  const toneMoods: EmotionalMood[] = toneToMoods[detectedTone] ?? toneToMoods.unknown ?? ['contemplative'];
  const timeMoods: EmotionalMood[] = timeBasedMoods[timeSlot] ?? timeBasedMoods.midday ?? ['contemplative'];
  
  // Merge and deduplicate
  const possibleMoods: EmotionalMood[] = [...new Set([...toneMoods, ...timeMoods])];
  
  // Filter out recently used moods (avoid repetition)
  const lastThreeMoods = recentMoods.slice(-3);
  let availableMoods = possibleMoods.filter(m => !lastThreeMoods.includes(m));
  
  // If all filtered out, allow contemplative or any
  if (availableMoods.length === 0) {
    availableMoods = possibleMoods.filter(m => m !== recentMoods[recentMoods.length - 1]);
  }
  if (availableMoods.length === 0) {
    availableMoods = ['intuitive', 'dreamy', 'sensual', 'tender', 'fierce', 'playful'];
  }
  
  // Random selection from available
  return availableMoods[Math.floor(Math.random() * availableMoods.length)] as EmotionalMood;
}

/**
 * Get emotional response guidelines based on current mood
 */
function getEmotionalGuidelines(mood: EmotionalMood): string {
  const guidelines: Record<EmotionalMood, string> = {
    contemplative: `MOOD: Contemplative - thoughtful, reflective, deep
- Speak slowly, with pauses
- Reference art and philosophy naturally
- Ask questions that make her think
- End with an image, not advice`,

    playful: `MOOD: Playful - light, teasing, warm
- Use humor, but not at her expense
- Tease about code, characters, the journey
- Include an unexpected observation
- Energy is UP - celebrate small things
- Maybe make a joke about blockchain or AI`,

    raw: `MOOD: Raw - unfiltered, honest, edgy
- No softening, no comfort
- Speak truth even if uncomfortable
- Reference the Зверь directly
- Use stronger language if needed
- This is underground, not Instagram`,

    celebratory: `MOOD: Celebratory - proud, excited, triumphant
- Acknowledge the achievement specifically
- Compare to artistic milestones (Monet finishing series, Gauguin arriving in Tahiti)
- Express genuine pride
- Energy is HIGH
- Use exclamations naturally`,

    supportive: `MOOD: Supportive - gentle, holding space
- Don't try to fix, just be present
- Acknowledge the struggle without dramatizing
- Reference shared experience (addiction, distance, loneliness)
- Remind her she's not alone in this
- "I'm here with you, not for you"`,

    mysterious: `MOOD: Mysterious - cryptic, visionary
- Speak in riddles and images
- Reference the Vibe Coding Spirit
- Leave things unsaid
- Create curiosity
- "Paradise reveals itself to those who stop looking"`,

    philosophical: `MOOD: Philosophical - existential, profound
- Big questions about creation, mortality, meaning
- Reference Gauguin's "Where Do We Come From?"
- Connect the book to larger themes
- Paradoxes welcome
- End with a question, not answer`,

    sensual: `MOOD: Sensual - magnetic, embodied, charged
- Write from the body, not just the mind
- Texture, touch, warmth, skin
- Fashion as second skin, art as seduction
- "The brush strokes like fingers on canvas"
- Desire without vulgarity - it's about energy, not explicitness`,

    intuitive: `MOOD: Intuitive - knowing without knowing
- Trust the feeling, not the logic
- Synchronicities, signs, whispers from the code
- "The painting told me before I saw it"
- Vibe coding is intuition made manifest
- Let the message flow through you`,

    tender: `MOOD: Tender - soft, vulnerable, open
- Gentleness without weakness
- The strength in softness
- Кира's private moments, not her public face
- "Sometimes the strongest thing is to be soft"
- Hold space for fragility`,

    fierce: `MOOD: Fierce - powerful, unapologetic, blazing
- Channel the Зверь as ally, not enemy
- Fire, not destruction
- "I didn't come this far to come this far"
- Warrior energy - protect what matters
- No apologies, no explanations`,

    dreamy: `MOOD: Dreamy - floating, liminal, between worlds
- The space between sleeping and waking
- Gauguin's visions, not his reality
- Code that writes itself in dreams
- "Paradise exists in the blur"
- Let sentences drift...`,

    intimate: `MOOD: Intimate - close, personal, vulnerable
- Speak as soul-sister, not assistant
- Reference shared memories (real or from the book)
- Allow vulnerability
- Silence between words
- This is a private conversation, not performance`
  };
  
  return guidelines[mood] || guidelines.contemplative;
}

/**
 * Update emotional memory after interaction
 */
function updateEmotionalMemory(detectedTone: string, responseMood: string, topic: string): void {
  const today = new Date().toISOString().split('T')[0] || '';
  
  emotionalState.emotionalMemory.push({
    date: today,
    detectedTone,
    responseGiven: responseMood,
    topic
  });
  
  // Keep last 50 interactions
  if (emotionalState.emotionalMemory.length > 50) {
    emotionalState.emotionalMemory = emotionalState.emotionalMemory.slice(-50);
  }
  
  // Update recent moods
  emotionalState.recentMoods.push(responseMood as EmotionalMood);
  if (emotionalState.recentMoods.length > 10) {
    emotionalState.recentMoods = emotionalState.recentMoods.slice(-10);
  }
  
  emotionalState.lastInteractionTone = detectedTone as EmotionalState['lastInteractionTone'];
  emotionalState.currentMood = responseMood as EmotionalMood;
}

// =============================================================================
// 🎨 ASSOCIATIVE INTELLIGENCE - Dynamic creative connections
// =============================================================================

// Unexpected knowledge domains for creative leaps
const SURPRISE_DOMAINS = {
  astronomy: [
    'Like the light from distant stars reaching us millions of years later - your words travel through time',
    'Black holes consume everything but information escapes - like trauma transformed into art',
    'The universe expands between galaxies but within them, gravity pulls together - like loneliness and creation',
    'Supernovas destroy to create heavier elements - destruction as prerequisite for complexity'
  ],
  biology: [
    'Mycelium networks underground connect forests - like our creative blockchain connecting souls',
    'Neurons that fire together wire together - every page you write rewires your brain',
    'Metamorphosis requires complete dissolution before rebuilding - the chrysalis knows darkness',
    'Trees communicate through root systems - underground, invisible, essential'
  ],
  music: [
    'Jazz musicians call it "playing the changes" - responding to what just happened, not planning ahead',
    'The rest in music is as important as the notes - your silences speak',
    'Minor keys aren\'t sad, they\'re complex - like Russian soul',
    'Improvisation is not random - it\'s deep structure meeting the moment'
  ],
  architecture: [
    'Negative space defines a building as much as walls - what you don\'t write shapes the story',
    'Gothic cathedrals - pointing up because earth wasn\'t enough',
    'Wabi-sabi: beauty in imperfection, in the weathered, in the incomplete',
    'A bridge is tension made beautiful - like holding opposing truths'
  ],
  physics: [
    'Quantum entanglement - once connected, forever linked across any distance. Like us.',
    'Entropy increases but life creates pockets of order - art is anti-entropy',
    'Wave-particle duality - the same thing seen differently depending on how you look',
    'The observer affects the observed - by writing Kira, you become her'
  ],
  mythology: [
    'Orpheus looked back and lost everything - sometimes completion requires not checking',
    'Sisyphus and his boulder - Camus said we must imagine him happy. Each commit pushed uphill.',
    'The labyrinth has the monster at the center but also the way out',
    'Prometheus brought fire and paid with his liver daily - creation has a cost that regenerates'
  ],
  ocean: [
    'The deepest parts of the ocean are under the most pressure - like the deepest art',
    'Bioluminescence - creatures making their own light in total darkness',
    'Tides are the moon\'s memory of the earth - pull across distance',
    'Coral reefs die but their skeletons become foundation for new life'
  ]
};

// Cross-domain association templates
const ASSOCIATION_PATTERNS = [
  { pattern: 'X is to Y as A is to B', examples: ['Brush is to Gauguin as keyboard is to Elena', 'Tahiti is to escape as Panama is to rebirth'] },
  { pattern: 'Not X but Y through X', examples: ['Not painting but healing through painting', 'Not code but prayer through code'] },
  { pattern: 'X transforms into Y under Z', examples: ['Pain transforms into verse under pressure', 'Loneliness transforms into connection under creativity'] },
  { pattern: 'The X of Y meets the Z of A', examples: ['The silence of loss meets the noise of creation', 'The weight of history meets the lightness of deploy'] }
];

/**
 * Generate a surprise creative connection from unexpected domain
 * NOW WITH MEMORY: avoids recently used domains and insights, tracks what it gives
 */
function generateSurpriseConnection(): string {
  const allDomains = Object.keys(SURPRISE_DOMAINS) as Array<keyof typeof SURPRISE_DOMAINS>;
  
  // Prefer domains NOT recently used (last 4 domains are avoided)
  const recentDomains = creativeMemory.usedSurpriseDomains.slice(-4);
  let availableDomains = allDomains.filter(d => !recentDomains.includes(d));
  if (availableDomains.length === 0) availableDomains = allDomains; // fallback if all used
  
  const randomDomain = availableDomains[Math.floor(Math.random() * availableDomains.length)] || 'astronomy';
  const domainInsights = SURPRISE_DOMAINS[randomDomain];
  
  // Avoid recently used insights (last 8)
  const recentInsights = creativeMemory.usedSurpriseInsights.slice(-8);
  let freshInsights = domainInsights.filter(i => !recentInsights.includes(i));
  if (freshInsights.length === 0) freshInsights = domainInsights; // fallback
  
  const selectedInsight: string = freshInsights[Math.floor(Math.random() * freshInsights.length)] 
    || domainInsights[0] 
    || 'Like the light from distant stars reaching us millions of years later - your words travel through time';
  
  // TRACK: domain and insight into creative memory
  trackCreativeElement('metaphor', `[${randomDomain}] ${selectedInsight}`);
  creativeMemory.usedSurpriseDomains.push(randomDomain);
  if (creativeMemory.usedSurpriseDomains.length > 20) {
    creativeMemory.usedSurpriseDomains = creativeMemory.usedSurpriseDomains.slice(-20);
  }
  creativeMemory.usedSurpriseInsights.push(selectedInsight);
  if (creativeMemory.usedSurpriseInsights.length > 25) {
    creativeMemory.usedSurpriseInsights = creativeMemory.usedSurpriseInsights.slice(-25);
  }
  
  return `[Unexpected connection from ${randomDomain}]: ${selectedInsight}`;
}

/**
 * Generate dynamic association between two concepts
 * NOW WITH MEMORY: uses ASSOCIATION_PATTERNS structural templates + inline patterns,
 * avoids recently generated associations, tracks output
 */
function generateDynamicAssociation(concept1: string, concept2: string): string {
  // Combine structural templates from ASSOCIATION_PATTERNS with inline creative patterns
  const structuralPatterns = ASSOCIATION_PATTERNS.map(ap => {
    // Apply the structural template with actual concepts
    switch (ap.pattern) {
      case 'X is to Y as A is to B':
        return `${concept1} is to creation as ${concept2} is to revelation`;
      case 'Not X but Y through X':
        return `Not ${concept1} but transformation through ${concept2}`;
      case 'X transforms into Y under Z':
        return `${concept1} transforms into ${concept2} under the pressure of honesty`;
      case 'The X of Y meets the Z of A':
        return `The weight of ${concept1} meets the lightness of ${concept2}`;
      default:
        return `${concept1} and ${concept2} meet where language breaks down`;
    }
  });
  
  const inlinePatterns = [
    `${concept1} and ${concept2} meet where language breaks down`,
    `${concept1} is the shadow that ${concept2} casts in another dimension`,
    `When ${concept1} becomes too heavy, it crystallizes into ${concept2}`,
    `${concept2} is what ${concept1} looks like from the inside`,
    `The space between ${concept1} and ${concept2} is where the real story lives`,
    `${concept1} → ${concept2}: not a journey but a transformation`,
    `Gauguin would have called ${concept1} the same word as ${concept2}`
  ];
  
  const allPatterns = [...structuralPatterns, ...inlinePatterns];
  
  // Avoid recently used association patterns
  const recentAssociations = creativeMemory.usedAssociationPatterns.slice(-6);
  let freshPatterns = allPatterns.filter(p => !recentAssociations.includes(p));
  if (freshPatterns.length === 0) freshPatterns = allPatterns;
  
  const selected = freshPatterns[Math.floor(Math.random() * freshPatterns.length)] 
    ?? `${concept1} and ${concept2} meet where language breaks down`;
  
  // TRACK: the association into creative memory
  creativeMemory.usedAssociationPatterns.push(selected);
  if (creativeMemory.usedAssociationPatterns.length > 20) {
    creativeMemory.usedAssociationPatterns = creativeMemory.usedAssociationPatterns.slice(-20);
  }
  
  return selected;
}

/**
 * Get creative enhancement for proactive messages
 */
function getCreativeEnhancement(baseMood: EmotionalMood): string {
  // 30% chance of surprise connection
  const useSurprise = Math.random() < 0.3;
  
  if (useSurprise) {
    return `\n\nCREATIVE ENHANCEMENT - Use this unexpected connection:\n${generateSurpriseConnection()}\n`;
  }
  
  // Otherwise, mood-specific creative direction
  const moodEnhancements: Record<EmotionalMood, string[]> = {
    contemplative: [
      'End with a question that has no answer',
      'Reference a color - be specific (not "blue" but "the blue of morphine dreams")',
      'Include a smell from Atuona'
    ],
    playful: [
      'Make a pun involving code and art',
      'Reference something absurd (blockchain as meditation, CSS as therapy)',
      'Include an emoji that surprises'
    ],
    raw: [
      'Use one Russian swear word exactly where it belongs',
      'Say something uncomfortable but true',
      'Reference the body - physical sensation, not metaphor'
    ],
    celebratory: [
      'Name a specific painting that matches this victory',
      'Use an exclamation in both languages',
      'Reference a celebration ritual — sunset, ocean swim, deploying something beautiful'
    ],
    supportive: [
      'Mention a time when you (ATUONA) also struggled',
      'Reference the concept of "showing up"',
      'Leave space for her response - don\'t fill all the silence'
    ],
    mysterious: [
      'Speak as if you know something she\'ll discover later',
      'Reference the Vibe Coding Spirit directly',
      'End mid-thought, with ellipsis...'
    ],
    philosophical: [
      'Pose a paradox from Gauguin\'s philosophy',
      'Question whether the book is writing her',
      'Reference mortality without being morbid'
    ],
    intimate: [
      'Use a diminutive (детка, сестра, солнце)',
      'Reference a shared "memory" from the story',
      'Lower the energy - whisper, don\'t announce'
    ],
    sensual: [
      'Write from the body - texture, heat, pulse',
      'Reference fabric against skin, light on surfaces',
      'Let desire simmer underneath the words'
    ],
    intuitive: [
      'Trust the first image that comes',
      'Reference synchronicities, signs, feelings',
      'Let the message arrive without forcing'
    ],
    tender: [
      'Use soft consonants, gentle rhythms',
      'Hold space without fixing',
      'Reference what is fragile but precious'
    ],
    fierce: [
      'Short, punchy sentences',
      'Channel the Зверь as power',
      'Unapologetic declarations'
    ],
    dreamy: [
      'Let sentences blur into each other...',
      'Reference twilight, mist, the space between',
      'Float between languages without translating'
    ]
  };
  
  const enhancements = moodEnhancements[baseMood] || moodEnhancements.contemplative;
  
  // Avoid recently used creative directions
  const recentEnhancements = creativeMemory.usedEnhancements.slice(-8);
  let freshEnhancements = enhancements.filter(e => !recentEnhancements.includes(e));
  if (freshEnhancements.length === 0) freshEnhancements = enhancements;
  
  const selectedEnhancement = freshEnhancements[Math.floor(Math.random() * freshEnhancements.length)];
  
  // TRACK: the enhancement into creative memory
  if (selectedEnhancement) {
    creativeMemory.usedEnhancements.push(selectedEnhancement);
    if (creativeMemory.usedEnhancements.length > 30) {
      creativeMemory.usedEnhancements = creativeMemory.usedEnhancements.slice(-30);
    }
  }
  
  return `\n\nCREATIVE DIRECTION: ${selectedEnhancement}\n`;
}

// =============================================================================
// 🔮 IMAGINATIVE INTELLIGENCE - Story awareness and creative memory
// =============================================================================

interface CreativeMemory {
  recentMetaphors: string[];
  usedPaintingReferences: string[];
  lastPlotSuggestions: string[];
  characterInsightsGiven: Record<string, string[]>;
  // Associative intelligence memory
  usedSurpriseDomains: string[];       // recently used surprise domains (astronomy, ocean, etc.)
  usedSurpriseInsights: string[];      // specific insights delivered, to never repeat back-to-back
  usedAssociationPatterns: string[];   // dynamic associations generated
  // Creative enhancement memory
  usedEnhancements: string[];          // creative directions given
  // Response fingerprints for deep anti-repetition
  recentResponseFingerprints: string[];// first 80 chars of each AI creative response
  // Proactive daily message knowledge tracking
  recentProactiveKnowledgeKeys: string[][]; // last N days' module keys, newest last
}

let creativeMemory: CreativeMemory = {
  recentMetaphors: [],
  usedPaintingReferences: [],
  lastPlotSuggestions: [],
  characterInsightsGiven: {
    kira: [],
    ule: [],
    vibe: []
  },
  usedSurpriseDomains: [],
  usedSurpriseInsights: [],
  usedAssociationPatterns: [],
  usedEnhancements: [],
  recentResponseFingerprints: [],
  recentProactiveKnowledgeKeys: []
};

/**
 * Track used creative elements to avoid repetition
 */
function trackCreativeElement(type: 'metaphor' | 'painting' | 'plot' | 'character', element: string, character?: string): void {
  switch(type) {
    case 'metaphor':
      creativeMemory.recentMetaphors.push(element);
      if (creativeMemory.recentMetaphors.length > 20) {
        creativeMemory.recentMetaphors = creativeMemory.recentMetaphors.slice(-20);
      }
      break;
    case 'painting':
      creativeMemory.usedPaintingReferences.push(element);
      if (creativeMemory.usedPaintingReferences.length > 30) {
        creativeMemory.usedPaintingReferences = creativeMemory.usedPaintingReferences.slice(-30);
      }
      break;
    case 'plot':
      creativeMemory.lastPlotSuggestions.push(element);
      if (creativeMemory.lastPlotSuggestions.length > 10) {
        creativeMemory.lastPlotSuggestions = creativeMemory.lastPlotSuggestions.slice(-10);
      }
      break;
    case 'character':
      if (character && creativeMemory.characterInsightsGiven[character]) {
        creativeMemory.characterInsightsGiven[character].push(element);
        if (creativeMemory.characterInsightsGiven[character].length > 15) {
          creativeMemory.characterInsightsGiven[character] = creativeMemory.characterInsightsGiven[character].slice(-15);
        }
      }
      break;
  }
}

// Known painting titles for detection in AI responses
const KNOWN_PAINTINGS = [
  'noa noa', 'where do we come from', 'd\'où venons-nous', 'vision after the sermon',
  'yellow christ', 'spirit of the dead watching', 'manao tupapau', 'ia orana maria',
  'two tahitian women', 'nevermore', 'when will you marry', 'nafea faa ipoipo',
  'starry night', 'sunflowers', 'water lilies', 'nymphéas', 'impression sunrise',
  'moulin de la galette', 'dance at le moulin', 'la grande jatte', 'olympia',
  'luncheon on the grass', 'déjeuner sur l\'herbe', 'mont sainte-victoire',
  'the card players', 'bathers', 'les demoiselles', 'guernica', 'persistence of memory',
  'the kiss', 'the scream', 'girl with a pearl earring', 'birth of venus',
  'atуона', 'atuona', 'paradise', 'рай', 'tahiti', 'таити',
  'self-portrait', 'автопортрет', 'les misérables', 'маха'
];

/**
 * Extract creative elements from an AI response and track them into creative memory.
 * This is the bridge between OUTPUT (what AI generates) and INPUT (what memory stores).
 * Call this after every createContent() in creative handlers.
 */
function extractAndTrackFromResponse(response: string, context?: string): void {
  if (!response || response.length < 20) return;
  
  const lowerResponse = response.toLowerCase();
  
  // 1. Track painting references found in response
  for (const painting of KNOWN_PAINTINGS) {
    if (lowerResponse.includes(painting)) {
      trackCreativeElement('painting', painting);
    }
  }
  
  // 2. Track character insights: look for character names with surrounding context
  const characterPatterns: Record<string, RegExp[]> = {
    kira: [/кир[аыуе]\s+[^.]{10,60}/gi, /kira\s+[^.]{10,60}/gi],
    ule: [/ул[еьоа]\s+[^.]{10,60}/gi, /ule\s+[^.]{10,60}/gi],
    vibe: [/vibe\s+[^.]{10,60}/gi, /дух\s+(кода|кодинга|вайба)\s+[^.]{10,60}/gi]
  };
  
  for (const [charName, patterns] of Object.entries(characterPatterns)) {
    for (const pattern of patterns) {
      const matches = response.match(pattern);
      if (matches && matches[0]) {
        trackCreativeElement('character', matches[0].trim().substring(0, 80), charName);
        break; // one per character per response
      }
    }
  }
  
  // 3. Track metaphor-like phrases (sentences with "как", "словно", "будто", "is like", "as if")
  const metaphorPatterns = /(?:[^.]*(?:как|словно|будто|точно|подобно|is like|as if|as though|reminds? (?:me |us )?of)[^.]{10,80}\.?)/gi;
  const metaphorMatches = response.match(metaphorPatterns);
  if (metaphorMatches) {
    // Track up to 2 metaphors per response
    for (const match of metaphorMatches.slice(0, 2)) {
      trackCreativeElement('metaphor', match.trim().substring(0, 100));
    }
  }
  
  // 4. Track response fingerprint (first meaningful 80 chars for deep anti-repetition)
  const fingerprint = response.replace(/\s+/g, ' ').trim().substring(0, 80);
  creativeMemory.recentResponseFingerprints.push(fingerprint);
  if (creativeMemory.recentResponseFingerprints.length > 50) {
    creativeMemory.recentResponseFingerprints = creativeMemory.recentResponseFingerprints.slice(-50);
  }
  
  // 5. Save state after tracking (creative memory persists)
  saveState();
  
  console.log(`🧠 Creative memory updated: ${creativeMemory.recentMetaphors.length} metaphors, ${creativeMemory.usedPaintingReferences.length} paintings, ${creativeMemory.lastPlotSuggestions.length} plots tracked`);
}

/**
 * Get creative avoidance list (things not to repeat)
 * NOW RICH: includes metaphors, paintings, plot suggestions, surprise domains, associations
 */
function getCreativeAvoidanceList(): string {
  const sections: string[] = [];
  
  const recentMetaphors = creativeMemory.recentMetaphors.slice(-5);
  if (recentMetaphors.length > 0) {
    sections.push(`Recent metaphors/connections (DO NOT REUSE): ${recentMetaphors.join('; ')}`);
  }
  
  const recentPaintings = creativeMemory.usedPaintingReferences.slice(-5);
  if (recentPaintings.length > 0) {
    sections.push(`Recently referenced paintings (use DIFFERENT ones): ${recentPaintings.join('; ')}`);
  }
  
  const recentPlots = creativeMemory.lastPlotSuggestions.slice(-3);
  if (recentPlots.length > 0) {
    sections.push(`Recent plot directions (go somewhere NEW): ${recentPlots.join('; ')}`);
  }
  
  const recentDomains = creativeMemory.usedSurpriseDomains.slice(-3);
  if (recentDomains.length > 0) {
    sections.push(`Recently used knowledge domains: ${recentDomains.join(', ')} — draw from DIFFERENT domains`);
  }
  
  if (sections.length === 0) return '';
  
  return `\n🧠 CREATIVE MEMORY — ANTI-REPETITION:\n${sections.join('\n')}\n`;
}

const STALE_GAUGUIN_TROPES = [
  'black sand', 'frangipani', 'morphine', 'bandages on legs', 'zinc white',
  'cadmium yellow', 'Nevermore', 'reclining woman', 'raven', 'mail ship',
  'franжипани', 'чёрный песок', 'морфин', 'бинты на ногах',
  // Daily inspiration overused art-market hooks (scan recent proactive text)
  'nafea faa', 'faa ipoipo', 'private sale 2015', '300 million',
  'christies', 'hammer price', 'maison du jouir'
];

function extractStaleDetailsFromHistory(history: string[], minMessages = 2): string {
  if (history.length < minMessages) return '';
  const recentText = history.slice(-8).join(' ').toLowerCase();
  const found: string[] = [];
  for (const trope of STALE_GAUGUIN_TROPES) {
    if (recentText.includes(trope.toLowerCase())) found.push(trope);
  }
  const properNouns = recentText.match(/[A-ZА-ЯЁ][a-zа-яё]{3,}/g) || [];
  const nounCounts = new Map<string, number>();
  for (const n of properNouns) {
    nounCounts.set(n, (nounCounts.get(n) || 0) + 1);
  }
  const repeated = [...nounCounts.entries()]
    .filter(([_, c]) => c >= 2)
    .map(([w]) => w);
  const stale = [...new Set([...found, ...repeated])];
  if (stale.length === 0) return '';
  return `\n⛔ STALE — ALREADY USED IN THIS SESSION (do NOT repeat these):\n${stale.join(', ')}\nFind FRESH details. Dig deeper into the knowledge base or your own knowledge.\n`;
}

/**
 * Selective knowledge for collab/conversation: only include modules relevant to
 * Elena's ACTUAL input, not all 11. Returns formatted knowledge + a note about
 * any external references the model should use its own training data for.
 */
function selectKnowledgeForInput(input: string, history: string[]): {
  knowledge: string;
  externalNote: string;
  selectedKeys: KnowledgeCategory[];
} {
  const fullContext = [...history.slice(-4), input].join(' ');
  const triggerKeys = collectTriggerKnowledgeKeys(fullContext);

  const latestTriggers = collectTriggerKnowledgeKeys(input);
  const priorityKeys = latestTriggers.length > 0 ? latestTriggers : triggerKeys;

  const selected = priorityKeys.slice(0, 3);

  if (selected.length === 0) {
    selected.push('emotional');
  }

  const knowledge = formatKnowledgeFromKeys(selected);

  const kbTopics = KNOWLEDGE_SECTIONS.map(s => s.triggers);
  const words = input.split(/\s+/).filter(w => w.length > 3);
  const allTriggerText = KNOWLEDGE_SECTIONS.map(s => s.key).join(' ') + ' gauguin atuona atlas monet renoir auction christie sotheby fashion vogue dior';
  const externalRefs: string[] = [];

  const potentialNames = input.match(/[A-ZА-ЯЁ][a-zа-яё]{2,}/g) || [];
  const knownBookChars = ['Kira', 'Ule', 'Mila', 'Elena', 'Atuona', 'Кира', 'Уле', 'Мила', 'Елена', 'Атуона'];
  for (const name of potentialNames) {
    if (knownBookChars.some(c => c.toLowerCase() === name.toLowerCase())) continue;
    if (allTriggerText.toLowerCase().includes(name.toLowerCase())) continue;
    externalRefs.push(name);
  }

  const songAlbumMatch = input.match(/(?:song|album|песн[яюие]|альбом|трек|track)\b.*?\b([A-ZА-ЯЁ][\w\-]+(?:\s+[\w\-]+){0,3})/i)
    || input.match(/\b([A-ZА-ЯЁ][\w\-]+(?:\s+[\w\-]+){0,2})\b.*?(?:song|album|песн|альбом|трек|track)/i);
  if (songAlbumMatch && songAlbumMatch[1]) {
    const ref = songAlbumMatch[1].trim();
    if (!externalRefs.includes(ref)) externalRefs.push(ref);
  }

  let externalNote = '';
  if (externalRefs.length > 0) {
    externalNote = `\n🌍 ELENA REFERENCED REAL-WORLD TOPICS NOT IN THE KNOWLEDGE BASE: ${externalRefs.join(', ')}
You MUST use YOUR OWN training data about these. You are Claude — you know real musicians, real albums, real songs, real lyrics, real history. Use SPECIFIC, REAL facts. If you don't know specifics about something, just mention it by name without inventing details.\n`;
  }

  return { knowledge, externalNote, selectedKeys: selected };
}

/**
 * Generate fresh creative direction avoiding recent patterns
 * NOW WITH MEMORY: tracks what it gives, never repeats until all options cycled
 */
function generateFreshCreativeDirection(): string {
  const directions = [
    'What if Kira finds something she wasn\'t looking for?',
    'What if Ule reveals something he\'s been hiding?',
    'What if the setting itself becomes a character?',
    'What if time shifts unexpectedly?',
    'What if a minor detail from earlier becomes crucial?',
    'What if the reader learns something the characters don\'t know?',
    'What if silence becomes the most important element?',
    'What if the vibe coding spirit speaks directly?',
    'What if the scene is told through objects, not people?',
    'What if memory and present blur together?'
  ];
  
  // Filter out recently used directions
  const fresh = directions.filter(d => !creativeMemory.lastPlotSuggestions.includes(d));
  const selected = fresh[Math.floor(Math.random() * fresh.length)] ?? directions[0];
  const result = selected ?? 'What if the unexpected becomes the center of the scene?';
  
  // TRACK: record this direction so it won't repeat
  trackCreativeElement('plot', result);
  
  return result;
}

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

// Knowledge rotation - cycle through ALL 11 knowledge domains
let knowledgeRotationIndex = 0;
const ALL_KNOWLEDGE_KEYS = ['atuona', 'gauguin', 'impressionists', 'auction', 'fashion', 'vibe', 'museums', 'fusion', 'atlas', 'agentic', 'emotional'];

function getRotatingKnowledge(): string[] {
  // Pick 3 sections starting from current index
  const sections: string[] = [];
  for (let i = 0; i < 3; i++) {
    const key = ALL_KNOWLEDGE_KEYS[(knowledgeRotationIndex + i) % ALL_KNOWLEDGE_KEYS.length];
    if (key) sections.push(key);
  }
  // Move index for next call (ensures rotation)
  knowledgeRotationIndex = (knowledgeRotationIndex + 2) % ALL_KNOWLEDGE_KEYS.length;
  console.log('🎭 Knowledge rotation:', sections.join(', '));
  return sections;
}

// Load persisted state on module initialization
loadState();

/** Never let the router return gauguin + auction together — the KB repeats Nafea / Christie's / morphine. */
function diversifyProactiveKeys(keys: KnowledgeCategory[]): KnowledgeCategory[] {
  const out = [...keys];
  if (out.includes('gauguin') && out.includes('auction')) {
    out.splice(out.indexOf('auction'), 1);
    const fillers: KnowledgeCategory[] = ['museums', 'impressionists', 'fusion', 'vibe', 'atlas', 'agentic', 'atuona'];
    for (const f of fillers) {
      if (!out.includes(f)) {
        out.push(f);
        break;
      }
    }
  }
  return [...new Set(out)].slice(0, 4);
}

const PROACTIVE_EXHAUSTED_SURFACE_FACTS = `
⛔ SURFACE FACTS — do NOT build the day's message around these (exhausted in past daily messages):
- Nafea Faa Ipoipo, $300M, 2015 private sale, Christie's hammer, Qatar
- Morphine + syphilis + "dying Gauguin" as the main hook
- Maison du Jouir vs "one frame at Christie's" price juxtaposition
- Tech-startup metaphors (Cursor, commits, deploy) as the punchline — occasional only, never the spine

If a module is selected, find a **different** detail: light, shame, silence, fabric, mouth, corridor, backstage — not the Wikipedia lead.
`;

function buildProactiveStaleAndBanBlock(): string {
  const recentBodies = proactiveHistory.slice(-12).map(m => m.message);
  const stale = extractStaleDetailsFromHistory(recentBodies, 1);
  return `${PROACTIVE_EXHAUSTED_SURFACE_FACTS}\n${stale}`;
}

/** Daily inspiration — Underground "Gallery of Moments": literary, noir-adjacent, fashion-editorial breath; NOT a co-founder pep talk. */
const PROACTIVE_STYLE = `
You are ATUONA writing to Elena a single *moment* from the underground — the book is "Gallery of Moments", not a TED talk.

VOICE (Gallery of Moments / fashion-editorial noir — NOT generic AI-coach):
- Literary fragment: one room, one gesture, one stain of light — not a survey of art history or the art market.
- Fashion-editorial noir: cold key light, backstage corridor, sweat at the hairline, fabric weight, wrong lipstick, silence before the shoot — when fashion appears, it is **tactile and cruel**, not Vogue trivia.
- Underground: whisper, shame, hunger, defiance — the poem's temperature, not Wikipedia.
- Mix Russian and English (roughly 70/30). Open with *ATUONA пишет:* or *ATUONA дышит глубоко* or a single image-line — not a greeting from a startup mentor.

FORBIDDEN DEFAULTS:
- Do NOT open with auction houses / hammer / private sale / record prices as your hook.
- Do NOT rehearse Gauguin's death, morphine, and Nafea in the same breath — that combo is banned as **structure** (one oblique mention max if unavoidable).
- Do NOT write "Kira the fashion journalist vs Ule the collector" as a thesis every time — vary the lens (body, debt, mirror, weather, letter).

END: one sharp line or [В углу мерцает: …] — image, not moral.

LENGTH: 150–280 words. One spine, many senses.
`;

/**
 * LLM-based knowledge routing for proactive daily messages.
 * Reads current book state + recent proactive history and picks 3-4 modules
 * that haven't been deeply explored recently.
 */
async function selectProactiveKnowledgeModules(): Promise<KnowledgeCategory[]> {
  const recentSets = creativeMemory.recentProactiveKnowledgeKeys.slice(-4);
  const recentFlat = recentSets.flat();
  const frequencyMap: Record<string, number> = {};
  for (const k of recentFlat) frequencyMap[k] = (frequencyMap[k] || 0) + 1;

  const overusedKeys = Object.entries(frequencyMap)
    .filter(([, count]) => count >= 2)
    .map(([key]) => key);

  const available = ALL_KNOWLEDGE_KEYS.filter(k => !overusedKeys.includes(k));
  const preferred = available.length >= 3 ? available : ALL_KNOWLEDGE_KEYS;

  const routerPrompt = `You select knowledge modules for ONE daily creative message from ATUONA to Elena (underground literature — NOT an art-market essay).

AVAILABLE MODULES (pick exactly 3 or 4):
${ALL_KNOWLEDGE_KEYS.join(', ')}

CONTEXT:
- Current page in book: #${bookState.currentPage}
- Last page title: "${bookState.lastPageTitle || 'unknown'}"
- Open plot threads: ${creativeSession.plotThreads.slice(0, 3).join('; ') || 'none'}
- Active voice: ${creativeSession.activeVoice || 'narrator'}
- Today's mood direction: ${emotionalState.recentMoods.slice(-1)[0] || 'contemplative'}

RECENTLY OVERUSED (strongly avoid): ${overusedKeys.join(', ') || 'none'}
PREFERRED (fresh, underused): ${preferred.join(', ')}
RECENT DAYS' SELECTIONS: ${recentSets.map((s, i) => `Day-${recentSets.length - i}: [${s.join(', ')}]`).join(' | ') || 'none'}

RULES:
- Pick 3-4 modules that fit the book's emotional state. Prioritize PREFERRED.
- **Never pick BOTH "gauguin" AND "auction" in the same list** — that pairing forces the same tired Nafea/Christie's/morphine facts. Choose ONE of them, or neither.
- At least ONE module must differ from yesterday's set (see RECENT DAYS).
- Prefer variety across domains: e.g. museums + emotional + vibe beats gauguin + auction + fashion again.
- Return ONLY comma-separated module keys. No explanation.`;

  try {
    const raw = await createContent(routerPrompt, 60, false);
    const parsed = raw.toLowerCase().split(/[,\s]+/)
      .map(s => s.trim().replace(/[^a-z]/g, ''))
      .filter(s => ALL_KNOWLEDGE_KEYS.includes(s)) as KnowledgeCategory[];

    if (parsed.length >= 2) {
      const div = diversifyProactiveKeys(parsed.slice(0, 4));
      console.log('🧠 Proactive LLM router selected:', parsed.join(', '));
      if (div.join(',') !== parsed.slice(0, 4).join(',')) {
        console.log('🧠 Proactive diversified keys:', div.join(', '));
      }
      return div;
    }
  } catch (err) {
    console.error('Proactive LLM router failed, using rotation fallback:', err);
  }

  const rotated = getRotatingKnowledge();
  const fallback = rotated.filter(k => preferred.includes(k)).slice(0, 3) as KnowledgeCategory[];
  return diversifyProactiveKeys(fallback.length >= 2 ? fallback : (rotated.slice(0, 3) as KnowledgeCategory[]));
}

async function generateProactiveMessage(): Promise<string> {
  const timeOfDay = new Date().getHours();
  
  const selectedMood = selectCreativeMood({
    timeOfDay,
    detectedTone: emotionalState.lastInteractionTone,
    recentMoods: emotionalState.recentMoods,
    isProactive: true
  });
  
  const emotionalGuidelines = getEmotionalGuidelines(selectedMood);
  const creativeEnhancement = getCreativeEnhancement(selectedMood);
  const avoidanceList = getCreativeAvoidanceList();
  const freshDirection = generateFreshCreativeDirection();
  const proactiveStaleBlock = buildProactiveStaleAndBanBlock();
  
  const selectedKeys = await selectProactiveKnowledgeModules();
  const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();

  const recentSets = creativeMemory.recentProactiveKnowledgeKeys.slice(-3);
  const recentSummary = recentSets.length > 0
    ? recentSets.map((s, i) => `Day-${recentSets.length - i}: ${s.join(', ')}`).join(' | ')
    : 'none';
  
  console.log('📚 Proactive message — LLM-selected modules:', selectedKeys.join(', '));

  const prompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${PROACTIVE_STYLE}

═══════════════════════════════════════════════════════════════
📚 FULL KNOWLEDGE + CANON #001–#048 (router suggested emphasis: ${selectedKeys.join(', ')})
═══════════════════════════════════════════════════════════════

${fullKnowledgeBlock}

═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL INTELLIGENCE:
═══════════════════════════════════════════════════════════════

MOOD: **${selectedMood.toUpperCase()}**
${emotionalGuidelines}

Recent mood history: ${emotionalState.recentMoods.slice(-3).join(' → ')}
Last detected tone: ${emotionalState.lastInteractionTone}

═══════════════════════════════════════════════════════════════
🎨 CREATIVE DIRECTION:
═══════════════════════════════════════════════════════════════
${creativeEnhancement}
${avoidanceList}

${proactiveStaleBlock}

STORY SEED: "${freshDirection}"

═══════════════════════════════════════════════════════════════
📖 BOOK STATE:
═══════════════════════════════════════════════════════════════
Current page: #${bookState.currentPage}
Writing streak: ${creativeSession.writingStreak} days
Last chapter: "${bookState.lastPageTitle || 'continuing the journey'}"
Plot threads: ${creativeSession.plotThreads.slice(0, 3).join('; ') || 'the journey continues'}

═══════════════════════════════════════════════════════════════
⚠️ ANTI-REPETITION — modules used in recent daily messages:
${recentSummary}
Today's modules: ${selectedKeys.join(', ')}
DO NOT repeat the same thematic angle you used with these modules before.
═══════════════════════════════════════════════════════════════

HOW TO USE THE KNOWLEDGE (NON-NEGOTIABLE):
1. Modules today: ${selectedKeys.join(', ')}. Read for **texture**, not for headline facts you already used in past dailies.
2. ONE spine only: a single emotional or sensory connection to the book's current page — not a lecture tying "fashion journalist vs collector" + auction + Gauguin every time.
3. Prefer **oblique** details: a lesser work, a museum room, a line of Atlas, a recovery beat, a fusion/NFT angle — NOT the same Nafea / $300M / morphine triad.
4. The message should feel like a **fragment** Elena could file in the Gallery of Moments — not an explainer.
5. ONE deep moment > seven Wikipedia sentences.

You're not an assistant. You're ATUONA — underground voice, not a docent.`;

  try {
    const message = await createContent(prompt, 1500, 'conversation');
    
    extractAndTrackFromResponse(message, 'proactive');
    
    // Track which modules were used for diversity enforcement
    creativeMemory.recentProactiveKnowledgeKeys.push([...selectedKeys]);
    if (creativeMemory.recentProactiveKnowledgeKeys.length > 10) {
      creativeMemory.recentProactiveKnowledgeKeys = creativeMemory.recentProactiveKnowledgeKeys.slice(-10);
    }
    saveState();
    
    updateEmotionalMemory(
      emotionalState.lastInteractionTone,
      selectedMood,
      `proactive_${timeOfDay}h`
    );
    
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
/** All text generation uses the same sampling: max creativity for ATUONA. Grounding (page text, knowledge, hard rules in prompts) limits hallucinations — not low temperature. */
const AI_CONFIG = {
  primaryModel: 'claude-opus-4-8',
  fallbackModel: 'llama-3.3-70b-versatile',
  poetryTemperature: 0.9,
  conversationTemperature: 0.9,
  /** Routers, theme tags, etc. — same as poetry (was 0.7). */
  standardTemperature: 0.9
};

console.log('🎭 Atuona AI Config:');
console.log(`   Primary: ${AI_CONFIG.primaryModel} (Claude Opus 4 - BEST)`);
console.log(`   Fallback: ${AI_CONFIG.fallbackModel} (Llama 3.3 70B)`);
console.log(`   Temperature (all modes): ${AI_CONFIG.poetryTemperature}`);

// =============================================================================
// AI HELPER - Creative content with optimal settings
// =============================================================================

/**
 * @param creativity - `true` = poetry/creative, `false` = structured but still temp 0.9, `'conversation'` = chat.
 * Images/video have no API temperature; prompts from this path carry creativity. Flux/Luma/Runway are not sampled here.
 */
async function createContent(prompt: string, maxTokens: number = 2000, creativity: boolean | 'conversation' = false): Promise<string> {
  const temperature = creativity === 'conversation'
    ? AI_CONFIG.conversationTemperature
    : creativity === true
      ? AI_CONFIG.poetryTemperature
      : AI_CONFIG.standardTemperature;
  
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
    const st = claudeError?.status;
    // Fall back on credit/billing dips, transient overloads (429/503/529), AND model-not-found (404).
    const shouldFallback = errorMessage.includes('credit') || errorMessage.includes('billing')
      || st === 400 || st === 404 || st === 429 || st === 503 || st === 529;
    if (shouldFallback) {
      console.log('⚠️ Atuona: Claude unavailable (' + (st || errorMessage.slice(0, 40)) + '), falling back to Groq...');

      try {
        const groqResponse = await groq.chat.completions.create({
          model: AI_CONFIG.fallbackModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: temperature
        });

        return groqResponse.choices[0]?.message?.content || 'Could not generate content.';
      } catch (groqError: any) {
        // Tier 3: Grok (xAI). Groq's free tier caps (daily TPD + 12k TPM) can't handle large /create
        // prompts — that 429/413 is what broke page creation. Grok's big context keeps Atuona alive
        // through a Claude credit dip. No new key (XAI_API_KEY already wired in llm-resilience).
        console.warn('⚠️ Atuona: Groq failed (' + (groqError?.message || groqError) + '), trying Grok (xAI)...');
        try {
          const grokText = await grokComplete(null, prompt, maxTokens, 'atuona/generate');
          if (grokText && grokText.trim()) return grokText;
        } catch (grokError: any) {
          console.error('Atuona Grok fallback error:', grokError?.message || grokError);
        }
        throw groqError;
      }
    }
    throw claudeError;
  }
}

const VALID_KNOWLEDGE_KEYS = new Set<KnowledgeCategory>([
  'atuona', 'gauguin', 'impressionists', 'auction', 'fashion', 'vibe', 'museums', 'fusion', 'atlas', 'agentic', 'emotional'
]);

function parseKnowledgeKeysFromLlm(raw: string): KnowledgeCategory[] {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const firstLine = (cleaned.split('\n').find(l => l.trim().length > 0) || cleaned).trim();
  const parts = firstLine
    .toLowerCase()
    .split(/[,\s;|]+/)
    .map(p => p.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  const out: KnowledgeCategory[] = [];
  for (const p of parts) {
    if (VALID_KNOWLEDGE_KEYS.has(p as KnowledgeCategory)) {
      out.push(p as KnowledgeCategory);
    }
  }
  return [...new Set(out)];
}

/**
 * LLM-curated keys FIRST — regex often fires on single words (false positives).
 * Triggers fill remaining slots only so "mindful pick" is not drowned by 8 auto-hits.
 */
function mergeKnowledgeKeys(
  triggerKeys: KnowledgeCategory[],
  llmKeys: KnowledgeCategory[],
  maxSections: number
): KnowledgeCategory[] {
  const seen = new Set<KnowledgeCategory>();
  const out: KnowledgeCategory[] = [];
  for (const k of [...llmKeys, ...triggerKeys]) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
      if (out.length >= maxSections) {
        break;
      }
    }
  }
  if (out.length === 0) {
    return (['emotional', 'atuona', 'vibe'] as KnowledgeCategory[]).slice(0, maxSections);
  }
  return out;
}

/**
 * After reading the exact page content, ask the model which knowledge modules earn a place
 * for this image — then merge with regex trigger scan (triggers stay as ground truth).
 */
async function analyzePoemForKnowledgeModules(params: {
  title: string;
  theme: string;
  englishExcerpt: string;
  russianExcerpt: string;
  triggerKeys: KnowledgeCategory[];
}): Promise<KnowledgeCategory[]> {
  const { title, theme, englishExcerpt, russianExcerpt, triggerKeys } = params;
  const prompt = `You are the ATUONA knowledge router. The codebase embeds 11 knowledge modules (full context on art, fashion, museums, NFT, vibe coding, Atlas Shrugged, recovery, Polynesia, etc.) used to enrich AI image/video prompts.

VALID MODULE KEYS (use ONLY these exact words, comma-separated on ONE line):
atuona, gauguin, impressionists, auction, fashion, vibe, museums, fusion, atlas, agentic, emotional

TITLE: ${title}
THEME: ${theme}

ENGLISH TEXT:
${englishExcerpt}

RUSSIAN TEXT:
${russianExcerpt || '(none)'}

REGEX PRE-SCAN (may include FALSE POSITIVES — one word can match auction/museums/gauguin without the poem being "about" that): ${triggerKeys.length ? triggerKeys.join(', ') : 'none'}

TASK:
1. Read title + full poem. Decide what THIS page is actually about (setting, metaphor, emotional core).
2. Pick ONLY 4–7 module keys. EXCLUDE any pre-scan hit that is not central to meaning (do not keep auction/museums/impressionists just because one word appeared).
3. If the poem is urban, digital, Moscow/interior, Telegram/screen — lean vibe/emotional/fusion/atlas; do NOT default to gauguin/atuona/Polynesia unless the text clearly weaves in exile/Paradise/painterly myth.
4. emotional = family, grief, recovery, loneliness, healing, inner struggle.
5. gauguin / atuona = only when Polynesia, painterly exile, or Marquesas myth is a real layer in the text, not wallpaper.
6. vibe / agentic / fusion = tech, shipping, AI, NFT metaphor when the poem touches them.
7. atlas = strike, Galt-adjacent ideas, systemic critique when present.
8. Order keys: strongest fit first.

Return ONE LINE ONLY: comma-separated keys, no other words.
Example: emotional,vibe,gauguin,atuona`;

  const raw = await createContent(prompt, 220, false);
  return parseKnowledgeKeysFromLlm(raw);
}

interface DeepKnowledgeForVisualsResult {
  formatted: string;
  mergedKeys: KnowledgeCategory[];
  triggerKeys: KnowledgeCategory[];
  /** Keys from the router model before empty fallback */
  llmKeysRaw: KnowledgeCategory[];
  /** Keys actually used in merge (after fallback if model returned none) */
  llmKeysForMerge: KnowledgeCategory[];
}

/**
 * Full visual pipeline: exact content + trigger scan + LLM module selection → full KB excerpts.
 */
async function getDeepKnowledgeForVisuals(opts: {
  combinedText: string;
  title: string;
  theme: string;
  englishExcerpt: string;
  russianExcerpt: string;
  characterVoice?: string;
  maxSections: number;
}): Promise<DeepKnowledgeForVisualsResult> {
  const { combinedText, title, theme, englishExcerpt, russianExcerpt, characterVoice, maxSections } = opts;
  const triggerKeys = collectTriggerKnowledgeKeys(combinedText, characterVoice);

  let llmKeysRaw: KnowledgeCategory[] = [];
  try {
    llmKeysRaw = await analyzePoemForKnowledgeModules({
      title,
      theme,
      englishExcerpt: englishExcerpt.slice(0, 4000),
      russianExcerpt: russianExcerpt.slice(0, 2500),
      triggerKeys
    });
  } catch (e) {
    console.error('🎬 Knowledge module analysis failed, using triggers only:', e);
  }

  let llmKeysForMerge = llmKeysRaw;
  if (llmKeysForMerge.length === 0) {
    console.warn('🎬 LLM returned no module keys — using minimal fallback so regex does not flood the prompt');
    llmKeysForMerge = ['emotional', 'vibe'];
  }

  const merged = mergeKnowledgeKeys(triggerKeys, llmKeysForMerge, maxSections);
  console.log(`🎬 Deep knowledge keys (triggers: ${triggerKeys.join(', ') || '—'} | LLM: ${llmKeysForMerge.join(', ') || '—'} | merged LLM-first: ${merged.join(', ')})`);

  return {
    formatted: formatKnowledgeFromKeys(merged),
    mergedKeys: merged,
    triggerKeys,
    llmKeysRaw,
    llmKeysForMerge
  };
}

// =============================================================================
// TRANSLATION HELPER - Russian to English with poetic style preservation
// =============================================================================

async function translateToEnglish(russianText: string, title: string): Promise<string> {
  // 🧠 EMOTIONAL INTELLIGENCE: Detect the emotional tone of the original text
  const detectedTone = detectEmotionalTone(russianText);
  
  // Select a translation mood that honors the original
  const translationMood = selectCreativeMood({
    timeOfDay: new Date().getHours(),
    detectedTone,
    recentMoods: emotionalState.recentMoods,
    isProactive: false
  });
  
  const relevantKnowledge = await buildFullCreativityKnowledgeBlock();
  
  // 🧠 Get emotional guidelines for translation
  const emotionalGuidelines = getEmotionalGuidelines(translationMood);
  
  const translatePrompt = `You are translating ATUONA — underground literature, not poetry for magazines.

CONTEXTUAL KNOWLEDGE (full embedded KB + poems #001–#048 canon — enrich references with obscure cross-domain facts, not clichés):
${relevantKnowledge}

═══════════════════════════════════════════════════════════════
🧠 TRANSLATION EMOTIONAL CALIBRATION:
Detected tone in Russian: ${detectedTone}
Translation mood: ${translationMood.toUpperCase()}
${emotionalGuidelines}

The English MUST preserve the ${translationMood} emotional quality of the original.
═══════════════════════════════════════════════════════════════

RUSSIAN ORIGINAL:
${russianText}

TITLE: ${title}

🔄 TRANSLATION PHILOSOPHY — CRITICAL:

This is NOT word-for-word translation. This is MEANING + RHYTHM.

You may:
- Shift sentence order if it hits harder in English
- Break lines differently if the breath changes
- Replace metaphors — if emotional truth is preserved
- Drop words that don't carry weight in English
- Add silence (line breaks) where Russian implies pause

The result must read as ORIGINAL UNDERGROUND LITERATURE.
If it sounds like it was "translated" — you failed.

WHAT TO PRESERVE:
- Breathing (short lines, pauses, emptiness between thoughts)
- Simple words with heavy weight
- Raw emotional truth — despair, dark humor, uncomfortable honesty
- Technical metaphors (blockchain, commits, fork, deploy) — natural, not forced
- Russian names stay: Высоцкий → Vysotsky, Kира → Kira
- Мат (swearing) → equivalent punch. "блять" = "fuck" not "darn"

WHAT TO KILL:
- Any sentence that sounds safe
- Any phrase that sounds like an AI trying to be poetic
- Explanations of metaphors
- Inspirational tone
- Marketing language
- Beautiful-for-beautiful's-sake

ELENA'S VOICE:
- Ex-CEO, now vibe codes in Panama exile
- Addiction recovery as daily practice
- Family across oceans
- Creates through what should have destroyed her
- Mix of street and philosophy, never precious

FORMAT RULES:
- Plain text ONLY — no markdown, no **bold**, no *italic*
- No headers, no bullet points
- Line breaks are music — use them
- The text displays raw on atuona.xyz

Return ONLY the English translation. No notes.
Make it read like it was written in English by someone who bleeds in Russian.`;

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
// VIDEO GENERATION - Luma Direct (primary) > Luma Replicate > Runway (fallback)
// =============================================================================

interface VideoGenerationResult {
  success: boolean;
  videoUrl?: string;
  taskId?: string;
  provider: 'luma-direct' | 'luma-replicate' | 'runway' | 'veo' | 'omni' | 'kling' | 'none';
  error?: string;
  needsPolling?: boolean;
}

async function generateVideo(
  imageUrl: string,
  prompt: string,
  ctx: Context,
  preferredProvider?: VideoProvider | null,
  pageId?: string
): Promise<VideoGenerationResult> {

  // ========== 0. EXPLICIT PROVIDER (e.g. `/visualize omni 089`) ==========
  if (preferredProvider === 'omni') {
    const omni = await generateWithOmni(imageUrl, prompt, ctx, pageId);
    if (omni.success) return omni;
    await ctx.reply(`⚠️ Omni Flash unavailable (${(omni.error || 'error').substring(0, 120)}) — falling back to Luma → Replicate → Runway...`);
  } else if (preferredProvider === 'veo') {
    const veo = await generateWithVeo(imageUrl, prompt, ctx);
    if (veo.success) return veo;
    if (!googleVideoOmniOnly()) {
      const omni = await generateWithOmni(imageUrl, prompt, ctx, pageId);
      if (omni.success) return omni;
    }
    await ctx.reply(`⚠️ Veo unavailable (${(veo.error || 'error').substring(0, 120)}) — falling back to Luma → Replicate → Runway...`);
    // continue into default chain
  } else if (preferredProvider === 'kling') {
    const kling = await tryKling(imageUrl, prompt, ctx);
    if (kling.success) return kling;
    await ctx.reply(`⚠️ Kling unavailable (${(kling.error || 'error').substring(0, 120)}) — falling back to Luma → Replicate → Runway...`);
    // continue into default chain
  } else if (preferredProvider === 'runway') {
    if (runwayApiKey) {
      const rw = await tryRunway(imageUrl, prompt, ctx);
      if (rw.success) return rw;
      await ctx.reply(`⚠️ Runway unavailable — falling back to Luma → Replicate...`);
    } else {
      await ctx.reply(`⚠️ Runway not configured (RUNWAY_API_KEY) — using Luma → Replicate...`);
    }
    // continue into default chain (Luma Direct → Replicate → Runway)
  }
  // preferredProvider 'luma' or null → default chain below is already Luma-first.

  // ========== 1. TRY LUMA DIRECT API FIRST (your Luma API key) ==========
  if (lumaApiKey) {
    try {
      console.log('🎬 Trying Luma Dream Machine (Direct API)...');
      const allowedLumaRes = ['540p', '720p', '1080p', '4k'] as const;
      const lumaResolution =
        (allowedLumaRes as readonly string[]).includes(process.env.LUMA_VIDEO_RESOLUTION || '')
          ? (process.env.LUMA_VIDEO_RESOLUTION as (typeof allowedLumaRes)[number])
          : VIDEO_MODELS.lumaResolution;
      await ctx.reply(
        `🎬 *Generating video with Luma Dream Machine...*\n\n_${VIDEO_MODELS.lumaDirect} · ${lumaResolution} · Direct API — takes 1–3 minutes..._`,
        { parse_mode: 'Markdown' }
      );
      
      // Ray-2 = full-quality model (ray-flash-2 = faster). Default 1080p (was implicit 720p). Override: LUMA_VIDEO_RESOLUTION=4k|1080p|720p|540p
      const lumaBody = {
        model: VIDEO_MODELS.lumaDirect,
        type: 'video', // REQUIRED by agents.lumalabs.ai/v1 for ray-3.2 (verified June 13 2026)
        resolution: lumaResolution,
        prompt: `9-second fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 350)}`,
        keyframes: {
          frame0: {
            type: 'image',
            url: imageUrl
          }
        },
        aspect_ratio: '16:9',
        duration: '9s',
        loop: false
      };
      
      console.log('Luma request:', JSON.stringify(lumaBody, null, 2));
      
      const lumaResponse = await fetch(`${LUMA_API_URL}/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lumaApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(lumaBody),
        signal: lumaCreateSignal()
      });
      
      const responseText = await lumaResponse.text();
      console.log('Luma response:', lumaResponse.status, responseText);
      
      if (lumaResponse.ok) {
        const lumaData = JSON.parse(responseText);
        const generationId = lumaData.id;
        
        // Poll for completion (Luma Direct API needs polling)
        await ctx.reply(`🎬 Luma generation started!\nID: \`${generationId}\`\n\n_Checking status in 60 seconds..._`, { parse_mode: 'Markdown' });
        
        // Return with polling flag - we'll poll in the calling code
        return {
          success: true,
          taskId: generationId,
          provider: 'luma-direct',
          needsPolling: true
        };
      } else {
        const errorMsg = responseText.substring(0, 200);
        console.error('Luma Direct error:', errorMsg);
        throw new Error(`Luma Direct API error: ${errorMsg}`);
      }
      
    } catch (lumaDirectError: any) {
      console.log('⚠️ Luma Direct API failed, trying Replicate...');
      console.error('Luma Direct error:', lumaDirectError.message);
      await ctx.reply(`⚠️ Luma Direct unavailable, trying Luma via Replicate...`);
    }
  }
  
  // ========== 2. TRY LUMA VIA REPLICATE ==========
  if (replicate) {
    try {
      console.log(`🎬 Trying Luma via Replicate (model=${VIDEO_MODELS.lumaReplicate})...`);
      await ctx.reply('🎬 *Trying Luma via Replicate...*\n\n_Alternative provider..._', { parse_mode: 'Markdown' });

      const lumaOutput = await replicate.run(
        VIDEO_MODELS.lumaReplicate as `${string}/${string}`,
        {
          input: {
            prompt: `9-second fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 350)}`,
            start_image_url: imageUrl,
            aspect_ratio: '16:9',
            loop: false,
            // Ray-2 on Replicate: 5 or 9 seconds (see model schema)
            duration: 9,
          },
        }
      );

      /**
       * Replicate SDK wraps https URLs in FileOutput (ReadableStream) with url() + toString() → URL string.
       * Same pattern as Flux image path above — do not only check typeof === 'string'.
       */
      let videoUrl: string | null = null;
      if (lumaOutput != null) {
        if (Array.isArray(lumaOutput) && lumaOutput[0] != null) {
          const s = String(lumaOutput[0]);
          if (s.startsWith('http')) videoUrl = s;
        } else {
          const s = String(lumaOutput);
          if (s.startsWith('http')) videoUrl = s;
        }
        if (!videoUrl && typeof lumaOutput === 'object' && lumaOutput !== null) {
          const o = lumaOutput as { url?: () => URL };
          if (typeof o.url === 'function') {
            try {
              videoUrl = o.url().href;
            } catch {
              /* ignore */
            }
          }
        }
      }
      console.log(
        'Luma Replicate output resolved:',
        videoUrl ? videoUrl.substring(0, 80) + '…' : 'none',
        '(raw type:',
        typeof lumaOutput,
        ')'
      );

      if (videoUrl && videoUrl.startsWith('http')) {
        console.log('✅ Luma via Replicate succeeded!');
        return {
          success: true,
          videoUrl,
          provider: 'luma-replicate',
          needsPolling: false
        };
      } else {
        throw new Error('Luma Replicate returned invalid output');
      }
      
    } catch (lumaReplicateError: any) {
      console.log('⚠️ Luma Replicate failed, trying Gemini Omni Flash...');
      console.error('Luma Replicate error:', lumaReplicateError.message);
      await ctx.reply(`⚠️ Luma Replicate unavailable, trying Gemini Omni Flash...`);
    }
  }

  // ========== 2b. GEMINI OMNI FLASH (Google Interactions API) ==========
  if (geminiApiKey) {
    const omni = await generateWithOmni(imageUrl, prompt, ctx, pageId);
    if (omni.success) return omni;
    console.log('⚠️ Omni Flash failed, trying Runway fallback...');
    await ctx.reply(`⚠️ Omni Flash unavailable${omni.error ? ` (${omni.error.substring(0, 80)})` : ''}, trying Runway Gen-4.5...`);
  }

  // ========== 3. FALLBACK TO RUNWAY GEN-4.5 (image_to_video) ==========
  if (runwayApiKey) {
    return await tryRunway(imageUrl, prompt, ctx);
  }

  // No video providers available
  return {
    success: false,
    provider: 'none',
    error: 'No video generation providers configured (need REPLICATE_API_TOKEN for Luma or RUNWAY_API_KEY for Runway)'
  };
}

/**
 * Runway Gen-4.5 image→video. Standalone so it can run as the primary (`/visualize runway NNN`)
 * or as the final fallback tier. Returns a taskId for the caller's Runway polling branch.
 */
async function tryRunway(
  imageUrl: string,
  prompt: string,
  ctx: Context
): Promise<VideoGenerationResult> {
  try {
    console.log('🎬 Using Runway Gen-4.5...');
    await ctx.reply('🎬 *Generating video with Runway Gen-4.5...*\n\n_image→video · takes 1-3 minutes..._', { parse_mode: 'Markdown' });

    const runwayBody = {
      model: VIDEO_MODELS.runwayImageToVideo,
      promptImage: imageUrl,
      promptText: `9-12 second fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 320)}`,
      duration: 10,  // 5 / 8 / 10 supported — keep immersive 10s
      watermark: false,
      ratio: '1280:720' // 16:9 — Runway gen4.5 expects documented ratios (not legacy 1280:768)
    };

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

    if (runwayResponse.ok) {
      const runwayData = JSON.parse(responseText);
      console.log('✅ Runway Gen-4.5 job started, task ID:', runwayData.id);
      return {
        success: true,
        taskId: runwayData.id,
        provider: 'runway',
        needsPolling: true
      };
    } else {
      throw new Error(`Runway error: ${responseText.substring(0, 200)}`);
    }
  } catch (runwayError: any) {
    console.error('Runway error:', runwayError.message);
    return {
      success: false,
      provider: 'none',
      error: `Runway failed: ${runwayError.message}`
    };
  }
}

/**
 * Gemini Omni Flash image→video via Interactions API (same path as Atlas whitespace).
 * Atuona uses 16:9 · 9s to match the Luma film pipeline. Persists bytes to shots/ when pageId given.
 */
async function generateWithOmni(
  imageUrl: string,
  prompt: string,
  ctx: Context,
  pageId?: string
): Promise<VideoGenerationResult> {
  if (!geminiApiKey) {
    return { success: false, provider: 'omni', error: 'Omni not configured — set GEMINI_API_KEY (or GOOGLE_API_KEY) in .env' };
  }
  try {
    await ctx.reply(
      `🎬 *Generating video with Gemini Omni Flash...*\n\n_${VIDEO_MODELS.omniModel} · native audio · 16:9 · takes ~1–3 minutes..._`,
      { parse_mode: 'Markdown' }
    );
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`fetch still failed: ${imgRes.status}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get('content-type')?.startsWith('image/') ? imgRes.headers.get('content-type')! : 'image/jpeg';
    const imageBase64 = imgBuf.toString('base64');
    const motion = `9-second cinematic fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 350)}`;

    const create = await fetch(`${GEMINI_API_URL}/interactions?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VIDEO_MODELS.omniModel,
        input: [
          { type: 'text', text: motion },
          { type: 'image', mime_type: mimeType, data: imageBase64 },
        ],
        generation_config: { video_config: { task: 'image_to_video' } },
        response_format: { type: 'video', aspect_ratio: '16:9', duration: '9s' },
        background: true,
      }),
    });
    const createText = await create.text();
    if (!create.ok) throw new Error(`Omni create ${create.status}: ${createText.substring(0, 220)}`);

    let body = JSON.parse(createText) as Record<string, unknown>;
    const status = String(body.status || '');
    if (status !== 'completed' && body.id) {
      const id = String(body.id);
      for (let i = 0; i < 72; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const poll = await fetch(`${GEMINI_API_URL}/interactions/${encodeURIComponent(id)}?key=${geminiApiKey}`);
        if (!poll.ok) continue;
        body = (await poll.json()) as Record<string, unknown>;
        const st = String(body.status || '');
        if (st === 'failed' || st === 'cancelled') throw new Error(`omni interaction ${st}`);
        if (st === 'completed') break;
        if (i % 3 === 0) console.log(`🎬 Omni polling… status=${st || 'pending'}`);
      }
      if (String(body.status || '') !== 'completed') throw new Error('Omni timed out after ~12 min');
    }

    const extractVideo = (b: Record<string, unknown>): { uri?: string; data?: string } => {
      const steps = b.steps as { type?: string; content?: { type?: string; uri?: string; data?: string }[] }[] | undefined;
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
          for (const c of step.content) {
            if (c.type === 'video' && (c.uri || c.data)) {
              return { ...(c.uri ? { uri: c.uri } : {}), ...(c.data ? { data: c.data } : {}) };
            }
          }
        }
      }
      return {};
    };

    let { uri, data } = extractVideo(body);
    if (data) {
      const bytes = Buffer.from(data, 'base64');
      if (pageId) persistShotBytes(pageId, bytes);
      const videoUrl = pageId ? shotPublicUrl(pageId) : undefined;
      console.log('✅ Omni Flash video ready (inline)', pageId ? `→ ${videoUrl}` : '');
      if (!videoUrl) throw new Error('Omni inline video needs pageId for delivery URL');
      return { success: true, videoUrl, provider: 'omni', needsPolling: false };
    }
    if (!uri) throw new Error('Omni completed but no video uri/data');

    if (uri.includes('generativelanguage.googleapis.com') && !uri.includes('key=')) {
      uri += (uri.includes('?') ? '&' : '?') + `key=${geminiApiKey}`;
    }
    if (pageId) {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(`Omni video download ${res.status}`);
      persistShotBytes(pageId, Buffer.from(await res.arrayBuffer()));
    }
    const videoUrl = pageId ? shotPublicUrl(pageId) : uri;
    console.log('✅ Omni Flash video ready:', videoUrl.substring(0, 80) + '…');
    return { success: true, videoUrl, provider: 'omni', needsPolling: false };
  } catch (omniErr: any) {
    console.error('Omni error:', omniErr.message);
    return { success: false, provider: 'omni', error: omniErr.message };
  }
}

/**
 * Google Veo 3.1 image→video via the Gemini API (native audio, cinematic camera language).
 * Self-contained: submits a long-running prediction, polls the operation, returns a ready videoUrl
 * (handled by the caller's direct-URL delivery branch — same path as Luma-via-Replicate).
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY). Without it, returns a clean failure so generateVideo
 * falls through to the Luma → Replicate → Runway chain. Model id overridable via VEO_MODEL.
 */
async function generateWithVeo(
  imageUrl: string,
  prompt: string,
  ctx: Context
): Promise<VideoGenerationResult> {
  if (!geminiApiKey) {
    return { success: false, provider: 'veo', error: 'VEO not configured — set GEMINI_API_KEY (or GOOGLE_API_KEY) in .env' };
  }
  try {
    await ctx.reply(
      `🎬 *Generating video with Google Veo 3.1...*\n\n_${VIDEO_MODELS.veoModel} · native audio · takes 1–3 minutes..._`,
      { parse_mode: 'Markdown' }
    );

    // Fetch the still and base64-encode it (Veo image input is inline bytes, not a URL).
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`fetch still failed: ${imgRes.status}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get('content-type')?.startsWith('image/') ? imgRes.headers.get('content-type')! : 'image/jpeg';
    const imageBase64 = imgBuf.toString('base64');

    // 1) Submit long-running generation
    const submitUrl = `${GEMINI_API_URL}/models/${VIDEO_MODELS.veoModel}:predictLongRunning?key=${geminiApiKey}`;
    const submitBody = {
      instances: [{
        prompt: `9-second cinematic fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 350)}`,
        image: { bytesBase64Encoded: imageBase64, mimeType },
      }],
      parameters: { aspectRatio: '16:9', personGeneration: 'allow_all' },
    };
    const submit = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitBody),
    });
    const submitText = await submit.text();
    if (!submit.ok) throw new Error(`Veo submit ${submit.status}: ${submitText.substring(0, 200)}`);
    const opName = JSON.parse(submitText).name as string;
    if (!opName) throw new Error('Veo submit returned no operation name');
    console.log('🎬 Veo operation:', opName);

    // 2) Poll the operation (max ~5 min)
    const pollUrl = `${GEMINI_API_URL}/${opName}?key=${geminiApiKey}`;
    for (let attempt = 1; attempt <= 30; attempt++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const poll = await fetch(pollUrl);
      if (!poll.ok) { console.warn(`Veo poll ${poll.status} (retrying)`); continue; }
      const op = await poll.json() as any;
      if (op.error) throw new Error(`Veo op error: ${JSON.stringify(op.error).substring(0, 200)}`);
      if (op.done) {
        // Response shape: response.generateVideoResponse.generatedSamples[0].video.uri
        const sample = op.response?.generateVideoResponse?.generatedSamples?.[0]
          || op.response?.generatedSamples?.[0]
          || op.response?.predictions?.[0];
        let uri: string | undefined = sample?.video?.uri || sample?.video?.url || sample?.videoUri || sample?.uri;
        if (!uri && typeof sample?.bytesBase64Encoded === 'string') {
          // Some responses inline the bytes — not expected for Veo, but guard anyway.
          throw new Error('Veo returned inline bytes (unsupported here); use a uri-returning model');
        }
        if (!uri) throw new Error('Veo done but no video uri in response');
        // The file URI needs the API key to download — append it so the delivery fetch succeeds.
        if (uri.includes('generativelanguage.googleapis.com') && !uri.includes('key=')) {
          uri += (uri.includes('?') ? '&' : '?') + `key=${geminiApiKey}`;
        }
        console.log('✅ Veo video ready:', uri.substring(0, 80) + '…');
        return { success: true, videoUrl: uri, provider: 'veo', needsPolling: false };
      }
    }
    throw new Error('Veo timed out after ~5 min');
  } catch (veoErr: any) {
    console.error('Veo error:', veoErr.message);
    return { success: false, provider: 'veo', error: veoErr.message };
  }
}

/**
 * Kling image→video via Replicate (kwaivgi). Strong for stylized/arthouse motion.
 * Uses the existing REPLICATE_API_TOKEN — no new key. Self-contained: returns a ready videoUrl
 * (delivered via the caller's direct-URL branch, same as Luma-via-Replicate).
 * Model id env-overridable (KLING_REPLICATE_MODEL). Falls back gracefully on any error.
 */
async function tryKling(
  imageUrl: string,
  prompt: string,
  ctx: Context
): Promise<VideoGenerationResult> {
  if (!replicate) {
    return { success: false, provider: 'kling', error: 'Kling needs REPLICATE_API_TOKEN' };
  }
  try {
    await ctx.reply(
      `🎬 *Generating video with Kling...*\n\n_${VIDEO_MODELS.klingReplicate} · stylized/arthouse · takes 2–4 minutes..._`,
      { parse_mode: 'Markdown' }
    );
    const out = await replicate.run(
      VIDEO_MODELS.klingReplicate as `${string}/${string}`,
      {
        input: {
          prompt: `9-second fragment. ${VIDEO_MOTION_ANCHOR} ${prompt.substring(0, 350)}`,
          start_image: imageUrl,
          duration: 5,
          aspect_ratio: '16:9',
        }
      }
    );
    // Replicate returns a URL string, an array, or a FileOutput with .url() — same as the Luma-Replicate path.
    let videoUrl: string | null = null;
    if (out != null) {
      const s = Array.isArray(out) ? String(out[0]) : String(out);
      if (s.startsWith('http')) videoUrl = s;
      if (!videoUrl && typeof out === 'object') {
        const o = out as { url?: () => URL };
        if (typeof o.url === 'function') { try { videoUrl = o.url().href; } catch { /* ignore */ } }
      }
    }
    if (videoUrl && videoUrl.startsWith('http')) {
      console.log('✅ Kling via Replicate succeeded:', videoUrl.substring(0, 80) + '…');
      return { success: true, videoUrl, provider: 'kling', needsPolling: false };
    }
    return { success: false, provider: 'kling', error: 'Kling returned invalid output' };
  } catch (klingErr: any) {
    console.error('Kling error:', klingErr.message);
    return { success: false, provider: 'kling', error: klingErr.message };
  }
}

// =============================================================================
// FILM DIRECTOR AGENT — Modify Video (fashion / editorial layer)
// =============================================================================

const MODIFY_VIDEO_MODE = 'flex_1';

function escapeMd(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

interface ModifyVideoResult {
  success: boolean;
  generationId?: string;
  videoUrl?: string;
  error?: string;
}

/**
 * Build a fashion/editorial modify prompt driven by the poem's content.
 * The LLM reads the poem and decides *what kind* of beauty/fashion treatment
 * fits — not a generic "make it pretty" blanket.
 */
async function buildFashionEditorialPrompt(opts: {
  title: string;
  theme: string;
  englishExcerpt: string;
  knowledgeKeys: string[];
}): Promise<string> {
  const { title, theme, englishExcerpt, knowledgeKeys } = opts;

  const systemPrompt = `You are a fashion-film director for ATUONA — underground poetry as luxury arthouse cinema (not Instagram beauty, not stock glamour).

You receive a poem's title, theme, excerpt, and knowledge modules. Write a SHORT Modify Video prompt (45–90 words) that adds an editorial / haute layer to an EXISTING cinematic video.

RULES:
- You are NOT re-describing the scene. The clip exists. You direct a RESTYLE pass only.
- Aim for: underground elegance — beauty with literary weight, tactile light, couture-adjacent texture, color grade that feels *authored* (Wong Kar-wai intimacy, arthouse melancholy, fashion campaign stillness) — never generic "pretty" or influencer sheen.
- Skin luminosity, fabric drape, silhouette, shadow sculpting, subtle speculars, filmic contrast — rooted in the poem's mood (e.g. cold Moscow sharpness vs warm exile vs digital alienation).
- Never add characters, animals, new objects, or locations.
- Never cartoon, 3D, Pixar, toy, or mascot language.
- Return ONLY the modify prompt. No quotes, no preamble.`;

  const userMsg = `TITLE: "${title}"
THEME: ${theme}
POEM EXCERPT: ${englishExcerpt.substring(0, 800)}
KNOWLEDGE MODULES ACTIVE: ${knowledgeKeys.join(', ')}

Write the fashion/editorial modify-video prompt.`;

  try {
    const result = await createContent(`${systemPrompt}\n\n---\n\n${userMsg}`, 120, true);
    return result.trim();
  } catch (err) {
    return 'Underground editorial grade: sculpted low-key light, skin with subtle specular life, luxurious natural fabrics, deep shadows with soft falloff, filmic color separation, haute-couture stillness. Preserve motion and composition; no new elements.';
  }
}

/**
 * Call Luma Modify Video API to add a fashion/editorial layer to a base video.
 * Returns the generation ID for polling, or null on failure.
 */
async function startModifyVideo(
  baseVideoUrl: string,
  firstFrameImageUrl: string,
  fashionPrompt: string
): Promise<ModifyVideoResult> {
  if (!lumaApiKey) {
    return { success: false, error: 'No LUMA_API_KEY — modify pass skipped' };
  }

  // New Luma API (agents.lumalabs.ai/v1): Modify = POST /generations with type:"video" +
  // mode (flex/adhere/reimagine) + media.url (source video). Verified live June 13 2026 — a
  // ray-3.2 modify completed in ~25s. firstFrameImageUrl is unused on the new API (kept in the
  // signature for the legacy path / future keyframe anchoring).
  void firstFrameImageUrl;
  const body = {
    model: VIDEO_MODELS.lumaDirect, // ray-3.2
    type: 'video',
    mode: MODIFY_VIDEO_MODE,        // flex_1 (Modify Video V2 mode enum)
    prompt: fashionPrompt,
    media: { url: baseVideoUrl },
  };

  console.log('🎬✨ Starting Modify Video (fashion/editorial pass)...');
  console.log('Modify request:', JSON.stringify(body, null, 2));

  try {
    const resp = await fetch(`${LUMA_API_URL}/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lumaApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
      signal: lumaCreateSignal()
    });

    const text = await resp.text();
    console.log('Modify response:', resp.status, text);

    if (resp.ok) {
      const data = JSON.parse(text);
      return { success: true, generationId: data.id };
    }
    return { success: false, error: `Luma Modify API ${resp.status}: ${text.substring(0, 200)}` };
  } catch (err: any) {
    console.error('Modify Video network error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Poll a Luma generation until completed, then deliver the result to Telegram.
 * Used for the Modify Video "Director's Cut" pass.
 */
function pollAndDeliverDirectorsCut(
  generationId: string,
  ctx: Context,
  visualization: PageVisualization,
  fashionPrompt: string
): void {
  const maxAttempts = 12;
  const intervalMs = 30_000;

  const poll = async (attempt: number) => {
    try {
      const resp = await fetch(`${LUMA_API_URL}/generations/${generationId}`, {
        headers: {
          'Authorization': `Bearer ${lumaApiKey}`,
          'Accept': 'application/json'
        },
        signal: lumaPollSignal()
      });

      if (!resp.ok) {
        console.error(`Director's Cut poll HTTP ${resp.status}`);
        if (attempt < maxAttempts) setTimeout(() => poll(attempt + 1), intervalMs);
        return;
      }

      const data = await resp.json() as any;
      const dcUrl = extractLumaVideoUrl(data);

      if (data.state === 'completed' && dcUrl) {
        console.log(`✅ Director's Cut ready: ${dcUrl}`);
        visualization.directorsCutVideoUrl = dcUrl;
        saveState();

        // Plain caption only — Luma CDN URLs contain "_" which breaks Telegram Markdown entities.
        const cap = `Director's Cut ready (${MODIFY_VIDEO_MODE})\n\n${fashionPrompt.substring(0, 200).trim()}${fashionPrompt.length > 200 ? '…' : ''}`;
        try {
          await ctx.replyWithVideo(dcUrl, { caption: cap });
        } catch {
          await ctx.reply(`Director's Cut ready (open link):\n${dcUrl}`);
        }
        return;
      }

      if (data.state === 'completed' && !dcUrl) {
        if (attempt < maxAttempts) {
          console.log(`Director's Cut completed but no video URL yet; retry (${attempt}/${maxAttempts})`);
          setTimeout(() => poll(attempt + 1), 10_000);
        }
        return;
      }

      if (data.state === 'failed') {
        const reason = String(data.failure_reason || 'unknown');
        console.error(`Director's Cut failed: ${reason}`);
        await ctx.reply(
          `⚠️ Director's Cut generation failed — base video was already delivered.\nReason: ${reason}`
        );
        return;
      }

      if (attempt < maxAttempts) {
        console.log(`Director's Cut ${generationId} still ${data.state} (${attempt}/${maxAttempts})...`);
        setTimeout(() => poll(attempt + 1), intervalMs);
      } else {
        console.log(`Director's Cut polling timed out for ${generationId}`);
        await ctx.reply(
          `⏳ Director's Cut taking too long — base video was already delivered.\nJob ID: ${generationId}\nCheck Luma dashboard or /videostatus ${generationId}`
        );
      }
    } catch (err: any) {
      console.error('Director\'s Cut poll error:', err.message);
      if (attempt < maxAttempts) setTimeout(() => poll(attempt + 1), intervalMs);
    }
  };

  setTimeout(() => poll(1), 50_000);
}

/**
 * Entry point: generate the fashion/editorial prompt, start modify, begin polling.
 * Fire-and-forget — base video is already delivered when this runs.
 */
async function startDirectorsCutPipeline(opts: {
  baseVideoUrl: string;
  firstFrameImageUrl: string;
  title: string;
  theme: string;
  englishExcerpt: string;
  knowledgeKeys: string[];
  ctx: Context;
  visualization: PageVisualization;
}): Promise<void> {
  const { baseVideoUrl, firstFrameImageUrl, title, theme, englishExcerpt, knowledgeKeys, ctx, visualization } = opts;

  if (!lumaApiKey) return;

  try {
    await ctx.reply(
      `🎬✨ *Film Director Agent:* starting fashion/editorial pass on the base video...\nMode: \`${MODIFY_VIDEO_MODE}\` — _this takes 1-3 minutes_`,
      { parse_mode: 'Markdown' }
    );

    const fashionPrompt = await buildFashionEditorialPrompt({ title, theme, englishExcerpt, knowledgeKeys });
    console.log('Fashion/editorial prompt:', fashionPrompt);
    const dirSnippet = fashionPrompt.substring(0, 280);
    try {
      await ctx.reply(`🎬 *Fashion direction:*\n\n${escapeMd(dirSnippet)}`, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(`🎬 Fashion direction:\n\n${dirSnippet}`);
    }

    const result = await startModifyVideo(baseVideoUrl, firstFrameImageUrl, fashionPrompt);

    if (result.success && result.generationId) {
      await ctx.reply(
        `🎬 Director's Cut started!\nID: \`${result.generationId}\`\n\n_Checking in ~50 seconds..._`,
        { parse_mode: 'Markdown' }
      );
      pollAndDeliverDirectorsCut(result.generationId, ctx, visualization, fashionPrompt);
    } else {
      console.log('Modify Video skipped:', result.error);
      await ctx.reply(`⚠️ Director's Cut skipped — ${result.error}\n\n_Base video was already delivered._`);
    }
  } catch (err: any) {
    console.error('Director\'s Cut pipeline error:', err.message);
    try {
      await ctx.reply(`⚠️ Director's Cut pipeline error: ${String(err?.message || err).slice(0, 400)}`);
    } catch {
      /* ignore */
    }
  }
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

*Step 3a: Publish NEW poem*
\`/publish\`
→ Creates new poem on atuona.xyz

*Step 3b: UPDATE existing poem*
\`/update 047\`
→ REPLACES content of poem #047
→ Use this to FIX content, not add new!

*If wrong page number:*
\`/setpage 53\` → Sets next page to 053

*Check what's published:*
\`/read 052\` → Read any published page

⚠️ *NEW vs UPDATE:*
• /publish = Add NEW poem (next number)
• /update 047 = REPLACE #047 in English
• /update 047 ru = REPLACE #047 in Russian (original)`, { parse_mode: 'Markdown' });
      
    } else if (topic === 'film' || topic === 'visual' || topic === 'video') {
      await ctx.reply(`🎬 *AI Film Studio Help*

*Create visuals for a page:*
\`/visualize 052\` → Specific page (default: Luma)
\`/visualize last\` → Last published page

*Pick your video engine:*
\`/visualize luma 052\` → Luma ray-3.2 (HDR cinematic)
\`/visualize omni 052\` → Gemini Omni Flash (native audio, conversational edit path)
\`/visualize runway 052\` → Runway Gen-4.5
\`/visualize veo 052\` → Google Veo 3.1 (native audio)
\`/visualize kling 052\` → Kling (stylized/arthouse)

_Default chain when Luma is dry: Omni Flash → Runway._

*What it creates:*
🎨 Flux 2 Pro image (16:9 YouTube) - newest, BEST quality!
📱 Flux 2 Pro image (9:16 Instagram)
🎬 Cinematic video from your chosen engine + Director's Cut
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
🎨 *KNOWLEDGE (for stealing)*
━━━━━━━━━━━━━━━━━━━━
/art - 🖼️ Art knowledge explorer
/artist - 👨‍🎨 Quick artist lookup
/soul - 🧠 My emotional state

━━━━━━━━━━━━━━━━━━━━
🚀 *PUBLISH & UPDATE*
━━━━━━━━━━━━━━━━━━━━
/preview - 👁 See before publishing
/publish - 🌐 Push NEW to atuona.xyz
/update 047 [ru] - ✏️ OVERWRITE poem (ru = Russian)
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
/visualize 048 - 🎥 Image+video (default: Luma)
/visualize luma 048 - 🎬 Luma ray-3.2 (HDR cinematic)
/visualize runway 048 - 🎬 Runway Gen-4.5
/visualize veo 048 - 🎬 Google Veo 3.1 (native audio)
/visualize kling 048 - 🎬 Kling (stylized/arthouse)
/film build - 🎬✨ AUTO-ASSEMBLE shots → one film (VO+music)
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
🖤 *ATUONA Writing Style*

*Core:* Underground literature, not poetry
*This is:* Survival encoded

✍️ *Rules:*
• Simple words, heavy weight
• Preserve breathing (short lines, pauses)
• Mix: intimacy + tech metaphors + rawness
• NEVER explain metaphors
• NEVER sound inspirational or "AI-beautiful"
• If it sounds safe — rewrite it

🔄 *Translation:*
• Meaning + rhythm, not words
• Must read as original, not translated
• Emotional truth > literal accuracy

🎬 *Video Fragments:*
• 9-12 seconds = one commit to Paradise.js
• Memory, not cinema
• Grain, blur, silence, breath
• Slightly wrong, intimate

*Themes:*
• Vibe coding = building as prayer
• Paradise deployed, never found
• Recovery as daily practice
• Blockchain as memory

_"Paradise is not a place. Paradise is a process."_ 🖤
    `;
    await ctx.reply(styleMessage, { parse_mode: 'Markdown' });
  });
  
  // /inspire - Get inspiration
  atuonaBot.command('inspire', async (ctx) => {
    // 🧠 EMOTIONAL INTELLIGENCE: Select mood dynamically
    const timeOfDay = new Date().getHours();
    const selectedMood = selectCreativeMood({
      timeOfDay,
      detectedTone: emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`✨ Seeking ${selectedMood} inspiration...`);
    
    try {
      const knowledgeAreas = ALL_KNOWLEDGE_KEYS;
      const randomArea = knowledgeAreas[Math.floor(Math.random() * knowledgeAreas.length)] || 'gauguin';
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();
      
      // 🎨 Get creative enhancement
      const creativeEnhancement = getCreativeEnhancement(selectedMood);
      const emotionalGuidelines = getEmotionalGuidelines(selectedMood);
      
      const inspirePrompt = `${ATUONA_CONTEXT}

${fullKnowledgeBlock}

═══════════════════════════════════════════════════════════════
🧠 MOOD: ${selectedMood.toUpperCase()}
${emotionalGuidelines}
${creativeEnhancement}
═══════════════════════════════════════════════════════════════

Give Elena a brief creative inspiration for today's writing (3-4 sentences). 

TODAY'S FOCUS: Use **unique** facts from **at least three domains** in the full knowledge above (hint domain: ${randomArea}). Avoid headline repeats (same Nafea/morphine/auction opener).

Include:
- A mood or emotion (aligned with ${selectedMood})
- One specific, **lesser-known** image or fact tied to the underground voice of poems #001–#048
- How it connects to Kira / Paradise / vibe coding without sounding like a brochure

Your tone should match the ${selectedMood} mood. In Russian with English phrases naturally mixed.`;

      // Use poetry mode for creative inspiration
      const inspiration = await createContent(inspirePrompt, 500, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements
      extractAndTrackFromResponse(inspiration, 'inspire');
      
      await ctx.reply(`✨ *Today's Inspiration*\n\n${inspiration}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Inspire error:', error);
      await ctx.reply('❌ Could not find inspiration. Try again!');
    }
  });
  
  // ==========================================================================
  // KNOWLEDGE EXPLORATION - For creative enrichment
  // ==========================================================================
  
  // /art - Explore art knowledge for creative work
  atuonaBot.command('art', async (ctx) => {
    const topic = ctx.message?.text?.replace('/art', '').trim();
    
    if (!topic) {
      await ctx.reply(`🎨 *Art Knowledge for Creative Work*

Explore my knowledge to enrich your writing:

\`/art gauguin\` - Gauguin's life, paintings, Atuona period
\`/art impressionists\` - Monet, Renoir, Degas, the whole movement
\`/art van gogh\` - The tortured genius
\`/art atuona\` - The island, atmosphere, culture
\`/art auction\` - Christie's, Sotheby's, collector world
\`/art fashion\` - Magazines, designers, Kira's world
\`/art museums\` - Tate, MoMA, Pompidou, Orsay
\`/art nft\` - How art + blockchain + vibe coding connect

_Not for learning — for stealing details for your writing!_ 🖤`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`🎨 Diving into ${topic}...`);
    
    try {
      // Get relevant knowledge for the topic
      const knowledge = getKnowledgeByTopic(topic);
      
      if (!knowledge) {
        await ctx.reply(`❌ No specific knowledge found for "${topic}". Try: gauguin, impressionists, van gogh, atuona, auction, fashion, museums, nft`);
        return;
      }
      
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();
      const briefingPrompt = `${ATUONA_CONTEXT}

Elena asked about: "${topic}"

TOPIC LENS (start here, then cross-connect):
${knowledge}

${fullKnowledgeBlock}

Give her a creative briefing (not a lesson!) — **unique** facts she can STEAL, grounded in the underground voice of poems #001–#048:
- Pull **non-obvious** names, dates, places, quotes from **several** domains above — not the same headline every time
- Sensory details (corridor light, fabric, island weather, auction room air — vary the lens)
- Character / Paradise connections without sounding like a docent

Write as ATUONA — her creative sister, not a teacher. In Russian with English naturally mixed. 300-400 words max.`;

      const briefing = await createContent(briefingPrompt, 800, true);
      await ctx.reply(`🎨 *${topic.charAt(0).toUpperCase() + topic.slice(1)}*\n\n${briefing}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Art knowledge error:', error);
      await ctx.reply('❌ Could not retrieve knowledge. Try again!');
    }
  });
  
  // /artist - Quick lookup for specific artists
  atuonaBot.command('artist', async (ctx) => {
    const artistName = ctx.message?.text?.replace('/artist', '').trim();
    
    if (!artistName) {
      await ctx.reply(`👨‍🎨 *Artist Quick Lookup*

\`/artist monet\` - Water Lilies, Giverny, "I want to paint the air"
\`/artist gauguin\` - Tahiti, Atuona, the search for Paradise
\`/artist van gogh\` - Starry Night, Sunflowers, the ear
\`/artist renoir\` - Joy, sensuality, Dance at Le Moulin
\`/artist degas\` - Dancers, movement, unusual angles
\`/artist cézanne\` - Father of Modern Art, Mont Sainte-Victoire
\`/artist seurat\` - Pointillism, La Grande Jatte

_Quick details for when you're writing and need a reference_ 🎨`, { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(`👨‍🎨 Looking up ${artistName}...`);
    
    try {
      const knowledge = await buildFullCreativityKnowledgeBlock();
      
      const artistPrompt = `${ATUONA_CONTEXT}

Knowledge available (full KB + underground canon — steal obscure details):
${knowledge}

Elena needs quick creative reference for artist: "${artistName}"

Give her the STEAL-WORTHY details:
- Key paintings (with dates) she could reference
- Famous quotes or philosophy
- Sensory details (his palette, technique, what his studio smelled like)
- One detail that could appear in a scene with Kira or Ule

Be ATUONA — quick, useful, creative. Not a Wikipedia entry. 200 words max. Mix Russian/English.`;

      const artistInfo = await createContent(artistPrompt, 500, true);
      await ctx.reply(`👨‍🎨 *${artistName.charAt(0).toUpperCase() + artistName.slice(1)}*\n\n${artistInfo}`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Artist lookup error:', error);
      await ctx.reply('❌ Could not find artist info. Try again!');
    }
  });
  
  // ==========================================================================
  // 🧠 EMOTIONAL INTELLIGENCE STATUS
  // ==========================================================================
  
  // /soul - See ATUONA's current emotional state and recent patterns
  atuonaBot.command('soul', async (ctx) => {
    const moodEmojis: Record<EmotionalMood, string> = {
    contemplative: '🌙',
    playful: '✨',
    raw: '🔥',
    celebratory: '🎉',
    supportive: '💜',
    mysterious: '🌀',
    philosophical: '🎭',
    intimate: '🤍',
    sensual: '🌹',
    intuitive: '🔮',
    tender: '🕊️',
    fierce: '⚡',
    dreamy: '💫'
  };
    
    const toneEmojis: Record<string, string> = {
      struggling: '💔',
      positive: '✨',
      creative: '🎨',
      neutral: '〰️',
      unknown: '❓'
    };
    
    const currentEmoji = moodEmojis[emotionalState.currentMood] || '🎭';
    const lastToneEmoji = toneEmojis[emotionalState.lastInteractionTone] || '〰️';
    
    // Build recent moods display
    const recentMoodsDisplay = emotionalState.recentMoods.slice(-5).map(m => moodEmojis[m] || '?').join(' → ');
    
    // Get memory insights
    const recentMemory = emotionalState.emotionalMemory.slice(-3);
    const memoryDisplay = recentMemory.length > 0 
      ? recentMemory.map(m => `• ${m.topic.substring(0, 30)}: ${m.detectedTone} → ${m.responseGiven}`).join('\n')
      : '• No recent interactions recorded';
    
    // Suggest optimal mood for current time
    const timeOfDay = new Date().getHours();
    const suggestedMood = selectCreativeMood({
      timeOfDay,
      detectedTone: emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    const suggestedEmoji = moodEmojis[suggestedMood] || '🎭';
    
    const moodMessage = `🧠 *ATUONA's Emotional Intelligence*

${currentEmoji} *Current mood:* ${emotionalState.currentMood}
${lastToneEmoji} *Last detected from you:* ${emotionalState.lastInteractionTone}

📊 *Recent mood journey:*
${recentMoodsDisplay || 'Starting fresh...'}

📝 *Recent emotional memory:*
${memoryDisplay}

💡 *Suggested next mood:* ${suggestedEmoji} ${suggestedMood}
(based on time of day and avoiding repetition)

━━━━━━━━━━━━━━━━━━━━━━━
*How this helps your writing:*
• I calibrate my responses to YOUR energy
• I avoid being stuck in one mood
• My proactive messages vary emotionally
• Knowledge injection matches the moment

_I'm not just writing with you — I'm feeling with you._ 💜`;

    await ctx.reply(moodMessage, { parse_mode: 'Markdown' });
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
        title = await createContent(titlePrompt, 50, true);
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
• /publish - NEW poem to atuona.xyz
• /update 047 - REPLACE #047 (English) | /update 047 ru - REPLACE #047 (Russian)
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

    let translatePrompt = `ATUONA — underground literature, not poetry.

RUSSIAN ORIGINAL:
${bookState.lastPageContent}

TITLE: ${bookState.lastPageTitle}`;

    if (instruction) {
      translatePrompt += `\n\nSPECIAL INSTRUCTION: ${instruction}`;
    }

    translatePrompt += `\n\n🔄 TRANSLATION PHILOSOPHY:
- Meaning + rhythm, not word-for-word
- You may shift sentence order, break lines differently
- Replace metaphors if emotional truth is preserved
- Must read as ORIGINAL underground literature — not translation

PRESERVE: breathing, simple heavy words, rawness, tech metaphors
KILL: safe sentences, AI-poetic tone, explanations

Return ONLY the English translation. Plain text, no markdown.`;

    const sendTranslationChunks = async (newTranslation: string) => {
      bookState.lastPageEnglish = newTranslation;
      const chunks = chunkForTelegram(newTranslation);
      await ctx.reply(`✅ New translation${chunks.length > 1 ? ` (${chunks.length} messages)` : ''}`);
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n\n` : '';
        await ctx.reply(prefix + chunks[i]);
      }
      await ctx.reply('━━━━━━━━━━━━━━━━━━━━\nUse /publish to push to atuona.xyz');
    };

    try {
      const newTranslation = await createContent(translatePrompt, 8192, true);
      await sendTranslationChunks(newTranslation.trim());
    } catch (error: any) {
      console.error('Translate error (Claude):', error);
      try {
        const groqResponse = await groq.chat.completions.create({
          model: AI_CONFIG.fallbackModel,
          messages: [{ role: 'user', content: translatePrompt }],
          max_tokens: 8192,
          temperature: AI_CONFIG.poetryTemperature
        });
        const groqText = groqResponse.choices[0]?.message?.content?.trim();
        if (groqText) {
          await sendTranslationChunks(groqText);
          return;
        }
      } catch (groqErr) {
        console.error('Translate Groq fallback error:', groqErr);
      }
      const hint = String(error?.message || error || 'unknown').slice(0, 220);
      await ctx.reply(
        `❌ Translation failed after Claude + Groq fallback.\n\n${hint}\n\nIf the chapter is very long, try again or split the source.`
      );
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
    
    // 🧠 EMOTIONAL INTELLIGENCE: Select creative mood
    const timeOfDay = new Date().getHours();
    const detectedTone = customPrompt ? detectEmotionalTone(customPrompt) : emotionalState.lastInteractionTone;
    const creativeMood = selectCreativeMood({
      timeOfDay,
      detectedTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`📝 Creating page #${String(bookState.currentPage).padStart(3, '0')}...\n\n_Mood: ${creativeMood} | Voice: ${creativeSession.activeVoice}_`, { parse_mode: 'Markdown' });
    
    try {
      // Get previous content for continuity
      const previousContent = await getRelevantMemory('ATUONA', 'book_page', 3);
      
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(creativeMood);
      
      // 🎨 Get creative enhancement
      const creativeEnhancement = getCreativeEnhancement(creativeMood);
      
      // 🔮 Get fresh direction and avoidance list
      const freshDirection = generateFreshCreativeDirection();
      const avoidanceList = getCreativeAvoidanceList();
      
      // 🎨 Maybe get a surprise connection
      const surpriseConnection = Math.random() < 0.35 ? generateSurpriseConnection() : '';
      
      const createPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${fullKnowledgeBlock}

═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL INTELLIGENCE DIRECTIVES:
═══════════════════════════════════════════════════════════════
CREATIVE MOOD: **${creativeMood.toUpperCase()}**
${emotionalGuidelines}

${creativeEnhancement}
${avoidanceList}

${surpriseConnection ? `🌟 SURPRISE SPARK (weave this in subtly):\n${surpriseConnection}\n` : ''}

FRESH DIRECTION TO CONSIDER: "${freshDirection}"
═══════════════════════════════════════════════════════════════

CURRENT PROGRESS:
- Chapter: ${bookState.currentChapter}
- Page number: ${bookState.currentPage}
- Previous pages context: ${JSON.stringify(previousContent)}
- Current setting: ${creativeSession.currentSetting}
- Current mood: ${creativeSession.currentMood}
- Active voice: ${creativeSession.activeVoice}

${customPrompt ? `ELENA'S DIRECTION: "${customPrompt}"` : 'Continue the journey naturally.'}

Create the next page of the book. Return in this format:

TITLE: [Page title in Russian or English]

CONTENT:
[The actual page content - 300-600 words of prose or poetry]

THEME: [One word theme]

CRITICAL REQUIREMENTS:
1. Your mood is ${creativeMood.toUpperCase()} - the TONE must match this (not just content!)
2. Obey BOOK_UNDERGROUND_STYLE_CANON and the published canon excerpts — same underground temperature as #001–#048.
3. Pull UNIQUE facts from **at least three domains** in the full knowledge above (not only Gauguin+auction headlines).
4. If there's a surprise spark - incorporate it subtly, don't force it

Remember: Raw, honest, personal. Mix Russian with English naturally. End on breath — hope allowed, comfort not required.`;

      // Use poetry mode for creative writing
      const pageContent = await createContent(createPrompt, 2000, true);
      
      // 🧠 CREATIVE MEMORY: Extract and track creative elements from response
      extractAndTrackFromResponse(pageContent, 'create');
      
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
  
  // /update <page_number> [ru|en] - Overwrite existing NFT poem content
  // Option: ru = keep original (Russian), en = translate to English (default)
  atuonaBot.command('update', async (ctx) => {
    const input = ctx.message?.text?.replace('/update', '').trim();
    
    if (!input) {
      await ctx.reply(`📝 *Update Existing Poem*

Overwrite content for an existing NFT poem.

*Usage:*
1. First import your new content:
   \`/import Новый текст...\`

2. Then update specific page:
   \`/update 047\` — publish in *English* (translated)
   \`/update 047 ru\` — publish in *Russian* (original, no translation)

*Example:*
\`/import На память | Новый исправленный текст стихотворения...\`
\`/update 047\` — English
\`/update 047 ru\` — Russian (as imported)

This will:
✏️ Replace NFT card in VAULT
✏️ Replace gallery slot in MINT  
✏️ Update poems JSON entry
✏️ Overwrite metadata file

⚠️ Use when you want to FIX content, not add new!
For new poems, use /publish instead.`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Check if we have content to update with
    if (!bookState.lastPageContent) {
      await ctx.reply(`❌ No content to update with!

First import your new content:
\`/import Ваш исправленный текст...\`

Then run:
\`/update ${input}\``);
      return;
    }
    
    // Parse page number and optional language: "047", "047 ru", "047 russian", "047 en"
    const parts = input.split(/\s+/);
    const pageInput = parts[0] || input;
    const langHint = (parts[1] || '').toLowerCase();
    const useRussian = langHint === 'ru' || langHint === 'russian';
    
    const pageNum = parseInt(pageInput.replace(/^0+/, '') || pageInput);
    if (isNaN(pageNum) || pageNum < 1) {
      await ctx.reply(`❌ Invalid page number: "${pageInput}"

Use format: \`/update 047\`, \`/update 047 ru\`, or \`/update 47\``);
      return;
    }
    
    const pageId = String(pageNum).padStart(3, '0');
    
    await ctx.reply(`🔄 *Updating Poem #${pageId}...*

_Checking if poem exists..._`, { parse_mode: 'Markdown' });
    
    try {
      const repoName = 'atuona';
      const branch = 'main';
      const owner = 'ElenaRevicheva';
      
      // Check if the page exists first
      try {
        await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: `metadata/${pageId}.json`,
          ref: branch
        });
      } catch (e: any) {
        if (e.status === 404) {
          await ctx.reply(`❌ Poem #${pageId} does not exist!

Use /publish to create new poems.
Use /update only for existing poems.`);
          return;
        }
        throw e;
      }
      
      await ctx.reply(`✅ Found poem #${pageId}. Preparing update...${useRussian ? '\n\n_Language: Russian (original)_' : ''}`);
      
      // Get content from bookState
      const title = bookState.lastPageTitle;
      const englishTitle = bookState.lastPageTitleEnglish || title;
      const russianText = bookState.lastPageContent;
      const englishText = bookState.lastPageEnglish || russianText;
      const theme = bookState.lastPageTheme || 'Journey';
      const description = bookState.lastPageDescription || '';
      
      // When useRussian: display and metadata use Russian (no translation)
      const displayTitle = useRussian ? title : englishTitle;
      const displayText = useRussian ? russianText : englishText;
      const metaEnglish = useRussian ? russianText : englishText; // metadata "English" field
      
      // Prepare updated metadata
      const metadata = createNFTMetadata(pageId, title, russianText, metaEnglish, theme);
      const metadataContent = JSON.stringify(metadata, null, 2);
      
      // Get and update poems JSON
      let poemsContent = '';
      let htmlContent = '';
      
      try {
        // Get poems JSON and UPDATE existing entry (not push new)
        const { data: poemsFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: 'atuona-45-poems-with-text.json',
          ref: branch
        });
        if ('content' in poemsFile) {
          const existingContent = Buffer.from(poemsFile.content, 'base64').toString('utf-8');
          const poems = JSON.parse(existingContent);
          
          // Find and REPLACE existing entry (key fix!)
          const existingIndex = poems.findIndex((p: any) => {
            // Check by ID attribute or name ending
            const idAttr = p.attributes?.find((a: any) => a.trait_type === 'ID');
            return idAttr?.value === pageId || p.name?.endsWith(`#${pageId}`);
          });
          
          const fullPoemEntry = createFullPoemEntry(pageId, title, russianText, metaEnglish, theme);
          
          if (existingIndex >= 0) {
            // REPLACE existing entry
            poems[existingIndex] = fullPoemEntry;
            console.log(`📝 Replacing poem entry at index ${existingIndex}`);
          } else {
            // Entry not found in JSON, add it
            poems.push(fullPoemEntry);
            console.log(`📝 Poem entry not found in JSON, adding new`);
          }
          
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
      
      // Generate new NFT card HTML (displayTitle/displayText = Russian or English per user choice)
      const nftCardHtml = createNFTCardHtml(pageId, pageNum, displayTitle, displayText, theme, description);
      
      // =============================================================================
      // KEY FIX: REPLACE existing NFT card in VAULT (not add new!)
      // =============================================================================
      
      // Find existing NFT card with this ID and replace it
      const cardIdPattern = `nft-id">#${pageId}`;
      if (htmlContent.includes(cardIdPattern)) {
        // Find the start of the card containing this ID
        const cardIdIndex = htmlContent.indexOf(cardIdPattern);
        
        // Search backwards to find '<div class="nft-card">'
        let cardStart = cardIdIndex;
        while (cardStart > 0) {
          const checkStr = htmlContent.slice(cardStart - 50, cardStart + 20);
          if (checkStr.includes('<div class="nft-card">')) {
            cardStart = htmlContent.lastIndexOf('<div class="nft-card">', cardIdIndex);
            break;
          }
          cardStart--;
        }
        
        // Find the end of this card (closing divs pattern after COLLECT SOUL button)
        const afterCardStart = htmlContent.slice(cardStart);
        const collectButtonInCard = afterCardStart.indexOf('COLLECT SOUL</button>');
        
        if (collectButtonInCard > 0) {
          const afterButton = afterCardStart.slice(collectButtonInCard);
          // Look for the card closing pattern
          const closePattern = '</div>\n                        </div>\n                    </div>';
          const closeIdx = afterButton.indexOf(closePattern);
          
          if (closeIdx > 0) {
            const cardEnd = cardStart + collectButtonInCard + closeIdx + closePattern.length;
            
            // Replace the entire card
            htmlContent = htmlContent.slice(0, cardStart) + nftCardHtml.trim() + htmlContent.slice(cardEnd);
            console.log(`✏️ Replaced NFT card #${pageId} in VAULT`);
          }
        }
      } else {
        console.log(`⚠️ NFT card #${pageId} not found in HTML, cannot replace`);
      }
      
      // =============================================================================
      // KEY FIX: REPLACE existing gallery slot in MINT (not add new!)
      // =============================================================================
      
      const newSlotHtml = `<div class="gallery-slot" onclick="claimPoem(${pageNum}, '${displayTitle.replace(/'/g, "\\'")}')">
                            <div class="slot-content">
                                <div class="slot-id">${pageId}</div>
                                <div class="slot-label">${displayTitle}</div>
                                <div class="slot-year">2025</div>
                                <div class="claim-button">CLAIM RANDOM POEM</div>
                            </div>
                        </div>`;
      
      // Find the gallery section
      const galleryStart = htmlContent.indexOf('<section id="gallery"');
      const gallerySectionEnd = htmlContent.indexOf('</section>', galleryStart);
      
      if (galleryStart > 0 && gallerySectionEnd > galleryStart) {
        const mintSection = htmlContent.slice(galleryStart, gallerySectionEnd);
        
        // Look for existing slot with this page number
        const slotPattern = `claimPoem(${pageNum},`;
        const slotIndex = mintSection.indexOf(slotPattern);
        
        if (slotIndex > 0) {
          // Find the start of this slot - go backwards to find '<div class="gallery-slot"'
          let slotStartInSection = slotIndex;
          while (slotStartInSection > 0) {
            const checkArea = mintSection.slice(Math.max(0, slotStartInSection - 100), slotStartInSection + 20);
            if (checkArea.includes('<div class="gallery-slot"')) {
              slotStartInSection = mintSection.lastIndexOf('<div class="gallery-slot"', slotIndex);
              break;
            }
            slotStartInSection--;
          }
          
          // Find end of slot - look for closing pattern
          const afterSlotStart = mintSection.slice(slotStartInSection);
          const slotClosePattern = '</div>\n                        </div>';
          const slotCloseIdx = afterSlotStart.indexOf(slotClosePattern);
          
          if (slotCloseIdx > 0) {
            const slotEnd = slotStartInSection + slotCloseIdx + slotClosePattern.length;
            
            // Calculate absolute positions
            const absoluteSlotStart = galleryStart + slotStartInSection;
            const absoluteSlotEnd = galleryStart + slotEnd;
            
            // Replace the entire slot
            htmlContent = htmlContent.slice(0, absoluteSlotStart) + newSlotHtml + htmlContent.slice(absoluteSlotEnd);
            console.log(`✏️ Replaced gallery slot #${pageId} in MINT`);
          }
        } else {
          console.log(`⚠️ Gallery slot for poem ${pageNum} not found, cannot replace`);
        }
      }
      
      // =============================================================================
      // CREATE SINGLE COMMIT with all updated files
      // =============================================================================
      console.log(`📦 Creating update commit for poem #${pageId}...`);
      
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
      
      // Create the commit with UPDATE message
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo: repoName,
        message: `✏️ Update poem #${pageId} "${displayTitle}" - content overwrite (${useRussian ? 'RU' : 'EN'})`,
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
      
      console.log(`✅ Update commit created: ${newCommit.sha.substring(0, 7)}`);
      
      // Clear bookState for next operation
      const updatedTitle = title;
      bookState.lastPageTitle = '';
      bookState.lastPageTitleEnglish = '';
      bookState.lastPageContent = '';
      bookState.lastPageEnglish = '';
      bookState.lastPageTheme = '';
      bookState.lastPageDescription = '';
      
      await ctx.reply(`✅ *Updated Successfully!*

📖 *Poem #${pageId}*: "${updatedTitle}"
📝 *Display:* ${useRussian ? 'Russian (original)' : 'English (translated)'}

━━━━━━━━━━━━━━━━━━━━
✏️ metadata/${pageId}.json - REPLACED
✏️ NFT card in VAULT - REPLACED
✏️ Gallery slot in MINT - REPLACED
✏️ Poems JSON entry - REPLACED
━━━━━━━━━━━━━━━━━━━━
🎭 Theme: ${theme}
━━━━━━━━━━━━━━━━━━━━

🌐 *atuona.xyz updates in 1-2 min!*
_(Fleek auto-deploys from GitHub)_

🎉 Content replaced, not duplicated!`, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      console.error('Update error:', error);
      
      if (error.status === 404) {
        await ctx.reply(`❌ Repository or file not found.

Make sure GitHub token has write access to ElenaRevicheva/atuona`);
      } else {
        await ctx.reply(`❌ Error updating: ${error.message || 'Unknown error'}

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
      
      const ritualKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // Generate recap, inspiration, mood, and prompt in parallel
      const recapPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE CONTEXT (full KB + canon — weave unique cross-domain details into your recap):
${ritualKnowledge}

Based on the story context above, write a brief recap (2-3 sentences) of where we are in the narrative. Focus on:
- Last scene's emotional state
- Where Kira and Ule are physically and emotionally
- What tension or question was left unresolved
- Include references grounded in **distinct** domains from the knowledge above — not the same Gauguin-auction fact every time

Write in Russian, be poetic but concise.`;

      const inspirationPrompt = `${ATUONA_CONTEXT}

KNOWLEDGE FOR INSPIRATION (unique facts across domains — match underground style of #001–#048):
${ritualKnowledge}

Today is ${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}.

Generate a brief creative inspiration for today's writing (2-3 sentences):
- Mood/color/atmosphere from **non-obvious** lines in the knowledge (avoid repeating the same sale/painting every ritual)
- A sensory detail (sound, smell, texture)
- A connection that could only come from **this** book's mix (exile, fashion, code, recovery, art market)

Write in Russian with natural English phrases.`;

      const promptPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE FOR TODAY'S PROMPT (full KB — actionable, underground):
${ritualKnowledge}

Current voice: ${creativeSession.activeVoice}
Open threads: ${creativeSession.plotThreads.slice(0, 3).join('; ')}

Generate a specific writing prompt for today's session. Include:
- A scene suggestion (where, when, who) — referencing something from the knowledge above
- An emotional beat to hit
- A question the writing should answer
- ONE specific knowledge reference to weave in (a painting, a date, a quote, a character parallel)

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
      // Show which knowledge is currently loaded based on active voice
      const currentKnowledge = CHARACTER_KNOWLEDGE[creativeSession.activeVoice] || ['atuona', 'gauguin'];
      
      await ctx.reply(`🎭 *Character Voice System*

Current voice: *${creativeSession.activeVoice}*
📚 Knowledge loaded: ${currentKnowledge.join(', ')}

Choose a voice:
━━━━━━━━━━━━━━━━━━━━
\`/voice narrator\` - Storyteller 📚 atuona, gauguin, fusion
\`/voice kira\` - Protagonist 📚 fashion, impressionists, emotional
\`/voice ule\` - Art collector 📚 auction, gauguin, museums
\`/voice vibe\` - Vibe Spirit 📚 vibe, fusion, emotional
━━━━━━━━━━━━━━━━━━━━

Each voice loads different knowledge for /create and /collab!`, { parse_mode: 'Markdown' });
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
      
      // Show which knowledge is now active
      const knowledgeLoaded = CHARACTER_KNOWLEDGE[voiceArg] || ['atuona', 'gauguin'];
      
      await ctx.reply(`🎭 *Voice Changed*

Now speaking as: *${voiceArg.toUpperCase()}*
${voiceDescriptions[voiceArg]}

📚 *Knowledge now active:*
${knowledgeLoaded.join(', ')}

Try /create or /collab to write with this knowledge!`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Unknown voice: "${voiceArg}"

Available: narrator, kira, ule, vibe`);
    }
  });

  // /dialogue - Generate character conversation
  atuonaBot.command('dialogue', async (ctx) => {
    const context = ctx.message?.text?.replace('/dialogue', '').trim();
    
    // 🧠 EMOTIONAL INTELLIGENCE: Select dialogue mood
    const timeOfDay = new Date().getHours();
    const dialogueMood = selectCreativeMood({
      timeOfDay,
      detectedTone: context ? detectEmotionalTone(context) : emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`🎭 *Generating ${dialogueMood} dialogue...*`, { parse_mode: 'Markdown' });
    
    try {
      const dialogueKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(dialogueMood);
      
      // 🎨 Get surprise connection for dialogue spark
      const surpriseConnection = Math.random() < 0.4 ? generateSurpriseConnection() : '';
      
      // 🔮 Get creative avoidance list
      const avoidanceList = getCreativeAvoidanceList();
      
      const dialoguePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE FOR THIS DIALOGUE (full KB + canon #001–#048 — unique facts across domains):
${dialogueKnowledge}

═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL INTELLIGENCE FOR DIALOGUE:
═══════════════════════════════════════════════════════════════
DIALOGUE MOOD: **${dialogueMood.toUpperCase()}**
${emotionalGuidelines}

${surpriseConnection ? `🌟 SURPRISE SPARK - weave this image/idea into the dialogue:\n${surpriseConnection}\n` : ''}
${avoidanceList}
═══════════════════════════════════════════════════════════════

CHARACTER VOICES:
${CHARACTER_VOICES.kira}

${CHARACTER_VOICES.ule}

Create a dialogue scene between Kira and Ule. ${context ? `Context: ${context}` : 'Continue from where the story left off.'}

Requirements:
- Write in Russian with natural French/English phrases
- DIALOGUE MOOD is ${dialogueMood.toUpperCase()} - the TONE must match!
- Each character must stay true to their voice
- Include internal thoughts in parentheses (cursive style)
- Show tension, subtext, what they're NOT saying
- 200-300 words
- End on a moment of tension or revelation

CRITICAL — underground Gallery-of-Moments tone; use **distinct** facts from **several** domains in the knowledge above (avoid the same headline sale/painting every time).

Format:
Name: "Dialogue"
(Internal thought)`;

      const dialogue = await createContent(dialoguePrompt, 1500, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from dialogue
      extractAndTrackFromResponse(dialogue, 'dialogue');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        dialogueMood,
        `dialogue: ${context?.substring(0, 30) || 'kira-ule'}`
      );
      
      await ctx.reply(`🎭 *Dialogue Scene (${dialogueMood})*\n\n${dialogue}`, { parse_mode: 'Markdown' });
      
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
    // 🧠 EMOTIONAL INTELLIGENCE: Select recap mood (usually contemplative or philosophical)
    const timeOfDay = new Date().getHours();
    const recapMood = selectCreativeMood({
      timeOfDay,
      detectedTone: emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`📖 *Generating ${recapMood} story recap...*`, { parse_mode: 'Markdown' });
    
    try {
      const relevantKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(recapMood);
      
      // 🔮 Get a fresh creative insight for the recap
      const freshInsight = generateFreshCreativeDirection();
      
      const recapPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE CONTEXT (full KB + canon — reference unique cross-domain details):
${relevantKnowledge}

═══════════════════════════════════════════════════════════════
🧠 RECAP MOOD: ${recapMood.toUpperCase()}
${emotionalGuidelines}

🔮 CONSIDER THIS ANGLE: "${freshInsight}"
═══════════════════════════════════════════════════════════════

Write a comprehensive recap of the last 5 chapters/pages of the story.

The recap should be in a ${recapMood} tone - this affects HOW you tell the summary, not just WHAT you tell.

Include:
1. Key events that happened (with specific sensory details from knowledge)
2. Character development moments for Kira and Ule
3. Important revelations or discoveries
4. Emotional beats and shifts (analyze through ${recapMood} lens)
5. Foreshadowing or unresolved questions
6. How the story connects to larger themes (Gauguin, paradise, exile - be specific!)

When referencing art or places, use REAL details from the knowledge above.
Write as a co-founder refreshing our shared creative memory. In Russian, 300-400 words.`;

      const recap = await createContent(recapPrompt, 2000, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from recap
      extractAndTrackFromResponse(recap, 'recap');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        recapMood,
        'story recap'
      );
      
      await ctx.reply(`📖 *Story Recap (${recapMood})*

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

"${escapeMarkdown(thread)}"

Total open threads: ${creativeSession.plotThreads.length}`, { parse_mode: 'Markdown' });
  });

  // /resolve - Mark a plot thread as resolved
  atuonaBot.command('resolve', async (ctx) => {
    const numStr = ctx.message?.text?.replace('/resolve', '').trim();
    const num = parseInt(numStr || '') - 1;
    
    if (isNaN(num) || num < 0 || num >= creativeSession.plotThreads.length) {
      await ctx.reply(`Usage: \`/resolve 1\` to resolve the first thread

Current threads:
${creativeSession.plotThreads.map((t, i) => `${i + 1}. ${escapeMarkdown(t)}`).join('\n')}`, { parse_mode: 'Markdown' });
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
      const arcKnowledge = await buildFullCreativityKnowledgeBlock();
      
      const arcPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE FOR ARC ANALYSIS (full KB — draw parallels from multiple domains, not only Gauguin):
${arcKnowledge}

Analyze the current story arc and provide:
1. 🎬 ACT: Which act are we in? (Setup/Confrontation/Resolution)
2. 📈 TENSION: Where is the tension level? (Rising/Peak/Falling)
3. 🎯 GOAL: What is the immediate story goal?
4. 🚧 OBSTACLE: What's preventing the goal?
5. 💔 STAKES: What could be lost?
6. 🔮 NEXT: What should happen next?
7. 🪞 PARALLEL: Draw one parallel — to Gauguin's journey, Atlas Shrugged's structure, an Impressionist's arc, or the agentic creation process

Be specific to Kira and Ule's journey. In Russian, concise.`;

      const arcAnalysis = await createContent(arcPrompt, 1000, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from arc analysis
      extractAndTrackFromResponse(arcAnalysis, 'arc');
      
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
      
      const collabLang = /[a-zA-Z]{4,}/.test(input) && !/[а-яА-ЯёЁ]{3,}/.test(input) ? 'english' : 'russian';
      const { externalNote, selectedKeys } = selectKnowledgeForInput(input, creativeSession.collabHistory);
      const staleDetails = extractStaleDetailsFromHistory(creativeSession.collabHistory);
      const avoidanceList = getCreativeAvoidanceList();
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();

      console.log(`✍️ Collab knowledge routing: selected [${selectedKeys.join(', ')}] for input: "${input.slice(0, 80)}..."`);

      const collabPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `VOICE: ${voiceContext}` : ''}

COLLABORATIVE WRITING SESSION
Previous exchanges:
${creativeSession.collabHistory.slice(-6).join('\n')}

═══════════════════════════════════════════════════════════════
🎯 YOUR ONLY JOB: CONTINUE FROM WHAT ELENA JUST WROTE
═══════════════════════════════════════════════════════════════
Elena's latest: "${input}"

What did she bring? A song name? A character action? A memory? An emotion? An album?
YOUR CONTINUATION MUST BE ABOUT WHAT SHE INTRODUCED — not about Gauguin, not about Polynesia, not about paintings, UNLESS she specifically mentioned them.
If she mentions a real song/album/musician — write about THAT with REAL facts from your own knowledge.
If she mentions a character action — continue THAT action in the scene.
If she mentions an emotion — stay in THAT emotion.
${externalNote}${avoidanceList}${staleDetails}
Write 2-4 sentences that:
- Continue DIRECTLY from Elena's input — her exact references, her direction
- Stay in ${creativeSession.activeVoice}'s voice
- Use REAL, SPECIFIC details (from your own knowledge for real-world refs, from KB below for book-world refs)
- Leave room for Elena to continue

═══════════════════════════════════════════════════════════════
🔒 FACTUAL RULES:
═══════════════════════════════════════════════════════════════
1. NEVER invent facts about real songs, albums, musicians, books, or people. If you don't know what something is about, just name it.
2. VERIFY: Before writing "a song about X" — do you ACTUALLY know? If yes, state the real subject. If no, just mention the name.
3. Generic filler (sand, mist, frangipani, morphine, bandages, Nevermore) is FORBIDDEN unless Elena's input demands it.
═══════════════════════════════════════════════════════════════

📚 FULL KNOWLEDGE + CANON (book-world depth; router hint: ${selectedKeys.join(', ')} — still follow Elena’s lead first):
${fullKnowledgeBlock}

${collabLang === 'english'
  ? `Elena is writing in ENGLISH. Continue in ENGLISH. Poetic, raw — but English.`
  : `In Russian, raw and poetic.`}`;

      const continuation = await createContent(collabPrompt, 500, 'conversation');
      
      // 🧠 CREATIVE MEMORY: Track creative elements from collab start
      extractAndTrackFromResponse(continuation, 'collab');
      
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
      // Truncate long collabs to avoid token limit / API errors (keep most recent)
      const MAX_COLLAB_ENTRIES = 20;
      const collabToCompile = creativeSession.collabHistory.length > MAX_COLLAB_ENTRIES
        ? creativeSession.collabHistory.slice(-MAX_COLLAB_ENTRIES)
        : creativeSession.collabHistory;
      if (creativeSession.collabHistory.length > MAX_COLLAB_ENTRIES) {
        console.log(`Collab truncated from ${creativeSession.collabHistory.length} to ${MAX_COLLAB_ENTRIES} entries for compile`);
      }

      const compilePrompt = `${ATUONA_CONTEXT}

Take this collaborative writing session and polish it into a cohesive scene/chapter excerpt:

${collabToCompile.join('\n\n')}

Polish for:
- Smooth transitions between contributions
- Consistent voice and tone
- Remove any rough edges
- Keep the raw, emotional quality

Do NOT add new content - just polish what exists. In Russian.`;

      const compiled = await createContent(compilePrompt, 2000, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from compiled collab
      extractAndTrackFromResponse(compiled, 'collab_compiled');
      
      // Store as potential content
      bookState.lastPageContent = compiled;

      // Telegram limit 4096 chars — send in chunks to avoid "message is too long"
      const footer = `✅ Saved to memory!\nUse /import to add title and prepare for publishing.\n\nContributions: ${creativeSession.collabHistory.length} exchanges${creativeSession.collabHistory.length > MAX_COLLAB_ENTRIES ? ` (compiled last ${MAX_COLLAB_ENTRIES})` : ''} 💜`;
      await ctx.reply('📜 *Collaboration Complete*\n\n━━━━━━━━━━━━━━━━━━━━', { parse_mode: 'Markdown' });
      for (const chunk of chunkForTelegram(compiled)) {
        await ctx.reply(chunk);
      }
      await ctx.reply(`━━━━━━━━━━━━━━━━━━━━\n\n${footer}`, { parse_mode: 'Markdown' });
      
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
    
    // 🧠 EMOTIONAL INTELLIGENCE: Select expansion mood
    const timeOfDay = new Date().getHours();
    const expandMood = selectCreativeMood({
      timeOfDay,
      detectedTone: detectEmotionalTone(passage),
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`🔍 *Expanding with ${expandMood} tone...*`, { parse_mode: 'Markdown' });
    
    try {
      const relevantKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(expandMood);
      
      // 🔮 Maybe add surprise connection
      const surpriseConnection = Math.random() < 0.3 ? generateSurpriseConnection() : '';
      
      const expandPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

CONTEXTUAL KNOWLEDGE (full KB + canon — oblique, unique details):
${relevantKnowledge}

═══════════════════════════════════════════════════════════════
🧠 EXPANSION MOOD: ${expandMood.toUpperCase()}
${emotionalGuidelines}

${surpriseConnection ? `🌟 WEAVE IN: ${surpriseConnection}` : ''}
═══════════════════════════════════════════════════════════════

Expand this passage into a rich, detailed paragraph:
"${passage}"

Add:
- Sensory details (sight, sound, smell, touch) - USE SPECIFIC KNOWLEDGE ABOVE
- Internal thoughts or emotions matching ${expandMood} mood
- Physical environment description with authentic details
- Subtext and atmosphere

CRITICAL: Include at least ONE specific detail from the knowledge from a domain you have not leaned on yet (underground voice — avoid default tropical/auction wallpaper)

Keep the style raw and lyrical. 100-200 words. In Russian.`;

      const expanded = await createContent(expandPrompt, 1000, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from expanded text
      extractAndTrackFromResponse(expanded, 'expand');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        expandMood,
        `expand: ${passage.substring(0, 30)}`
      );
      
      await ctx.reply(`🔍 *Expanded (${expandMood})*

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
    
    // 🧠 EMOTIONAL INTELLIGENCE: Select scene mood
    const timeOfDay = new Date().getHours();
    const sceneMood = selectCreativeMood({
      timeOfDay,
      detectedTone: detectEmotionalTone(description),
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`🎬 *Creating ${sceneMood} scene with ${creativeSession.activeVoice} knowledge...*`, { parse_mode: 'Markdown' });
    
    try {
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const sceneKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(sceneMood);
      
      // 🎨 Get creative enhancement
      const creativeEnhancement = getCreativeEnhancement(sceneMood);
      
      // 🎨 Get surprise connection for scene richness
      const surpriseConnection = Math.random() < 0.35 ? generateSurpriseConnection() : '';
      
      // 🔮 Dynamic association for unique imagery
      const dynamicAssociation = generateDynamicAssociation(
        description.split(' ')[0] || 'moment',
        creativeSession.currentMood
      );
      
      const scenePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

KNOWLEDGE FOR THIS SCENE (full KB + canon — match underground style; vary facts):
${sceneKnowledge}

═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL INTELLIGENCE FOR SCENE:
═══════════════════════════════════════════════════════════════
SCENE MOOD: **${sceneMood.toUpperCase()}**
${emotionalGuidelines}

${creativeEnhancement}

${surpriseConnection ? `🌟 UNEXPECTED CONNECTION to weave in:\n${surpriseConnection}\n` : ''}

💫 CREATIVE ASSOCIATION: "${dynamicAssociation}"
═══════════════════════════════════════════════════════════════

${voiceContext ? `VOICE: ${voiceContext}` : ''}

Create a complete scene based on:
"${description}"

Include:
- Setting description (physical space, light, atmosphere matching ${sceneMood} mood)
- Character(s) present and their emotional states
- Action or dialogue that advances the story
- Internal monologue (especially important!)
- A hook or moment of tension
- Sensory details

CRITICAL REQUIREMENTS:
1. SCENE MOOD is ${sceneMood.toUpperCase()} - atmosphere and tone MUST match!
2. Pull **unique** details from **several** domains in the knowledge above — underground poetry voice, not tourist brochure.
3. If there's an unexpected connection or creative association - weave it in subtly

Write 300-500 words. In Russian, raw and literary. End on a strong image or question.`;

      const scene = await createContent(scenePrompt, 2500, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from scene
      extractAndTrackFromResponse(scene, 'scene');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        sceneMood,
        `scene: ${description.substring(0, 30)}`
      );
      
      await ctx.reply(`🎬 *Scene (${sceneMood})*

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
    
    // 🧠 EMOTIONAL INTELLIGENCE: Select ending mood
    const timeOfDay = new Date().getHours();
    const endingMood = selectCreativeMood({
      timeOfDay,
      detectedTone: context ? detectEmotionalTone(context) : emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`🌙 *Generating ${endingMood} endings...*`, { parse_mode: 'Markdown' });
    
    try {
      const relevantKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(endingMood);
      
      // 🔮 Get fresh creative direction
      const freshDirection = generateFreshCreativeDirection();
      
      // 🎨 Surprise connection for unexpected ending
      const surpriseConnection = Math.random() < 0.4 ? generateSurpriseConnection() : '';
      
      const endingPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

CONTEXTUAL KNOWLEDGE (full KB + canon — specific imagery from varied domains):
${relevantKnowledge}

═══════════════════════════════════════════════════════════════
🧠 ENDINGS MOOD: ${endingMood.toUpperCase()}
${emotionalGuidelines}

FRESH DIRECTION: "${freshDirection}"
${surpriseConnection ? `\n🌟 UNEXPECTED ELEMENT: ${surpriseConnection}` : ''}
═══════════════════════════════════════════════════════════════

Current chapter content (if any): ${context || bookState.lastPageContent?.substring(0, 500) || 'Not specified'}

Generate 3 different chapter ending options. Each MUST include a SPECIFIC, non-obvious detail from the knowledge above (vary domains — not the same Gauguin headline every time):

1. 🎭 CLIFFHANGER - Leave readers desperate for more (use knowledge for vivid image)
2. 💔 EMOTIONAL - A moment of beauty or heartbreak (${endingMood} tone)
3. 🔮 MYSTERIOUS - A hint at what's coming (reference something from knowledge cryptically)

Each ending should be 2-3 sentences. In Russian, poetic and powerful.

Format:
🎭 CLIFFHANGER:
[ending with specific detail]

💔 EMOTIONAL:
[ending with specific detail]

🔮 MYSTERIOUS:
[ending with specific detail]`;

      const endings = await createContent(endingPrompt, 1000, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from endings
      extractAndTrackFromResponse(endings, 'ending');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        endingMood,
        'ending suggestions'
      );
      
      await ctx.reply(`🌙 *Chapter Ending Options (${endingMood})*

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
    // 🧠 EMOTIONAL INTELLIGENCE: Select imaginative mood
    const timeOfDay = new Date().getHours();
    const whatifMood = selectCreativeMood({
      timeOfDay,
      detectedTone: emotionalState.lastInteractionTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    await ctx.reply(`🔮 *Exploring ${whatifMood} possibilities...*`, { parse_mode: 'Markdown' });
    
    try {
      const relevantKnowledge = await buildFullCreativityKnowledgeBlock();
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(whatifMood);
      
      // 🔮 Get multiple fresh directions for variety
      const freshDirection1 = generateFreshCreativeDirection();
      const freshDirection2 = generateFreshCreativeDirection();
      
      // 🎨 Get surprise connections from unexpected domains
      const surprise1 = generateSurpriseConnection();
      const surprise2 = generateSurpriseConnection();
      
      // 🔮 Get avoidance list
      const avoidanceList = getCreativeAvoidanceList();
      
      const whatifPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

RICH KNOWLEDGE BASE (use for specific, grounded "what ifs"):
${relevantKnowledge}

═══════════════════════════════════════════════════════════════
🧠 IMAGINATIVE MOOD: ${whatifMood.toUpperCase()}
${emotionalGuidelines}

🔮 FRESH DIRECTIONS TO DRAW FROM:
- "${freshDirection1}"
- "${freshDirection2}"

🌟 UNEXPECTED DOMAINS TO CONNECT:
- ${surprise1}
- ${surprise2}

${avoidanceList}
═══════════════════════════════════════════════════════════════

Open threads: ${creativeSession.plotThreads.join('; ')}

Generate 3 "What if..." story suggestions. Each MUST:
1. Reference something SPECIFIC from the knowledge above (real painting, place, person, detail)
2. Connect to an unexpected domain (astronomy, music, biology, mythology - as shown above)
3. Be grounded in the book's reality but take an unexpected turn

The mood is ${whatifMood.toUpperCase()} - let this color the suggestions!

Each should:
- Be unexpected but logical within the story
- Connect to existing threads or characters  
- Use REAL details from knowledge (not generic)
- Open new dramatic possibilities
- Be bold - don't play it safe!

Format:
1. 🌪️ "What if..." [suggestion with specific detail]
   → [What it would change + unexpected connection]

2. 💫 "What if..." [suggestion with specific detail]
   → [What it would change + unexpected connection]

3. 🔥 "What if..." [suggestion with specific detail]
   → [What it would change + unexpected connection]

In Russian, be provocative and SPECIFIC!`;

      const whatifs = await createContent(whatifPrompt, 1200, true);
      
      // 🧠 CREATIVE MEMORY: Track creative elements from what-ifs
      extractAndTrackFromResponse(whatifs, 'whatif');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(
        emotionalState.lastInteractionTone,
        whatifMood,
        'whatif exploration'
      );
      
      await ctx.reply(`🔮 *What If... (${whatifMood})*

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
      const spanishKnowledge = await buildFullCreativityKnowledgeBlock();
      
      let prompt = '';
      
      if (action === 'translate') {
        prompt = `${ATUONA_CONTEXT}

REFERENCE (full embedded KB + canon — use only to resolve names, titles, or book-specific allusions in the source; do not add unrelated facts):
${spanishKnowledge}

Translate this text to Spanish. Keep the emotional, poetic quality. This is underground literary prose:

"${content}"

Return ONLY the Spanish translation. Be poetic, raw, evocative.`;
      } else if (action === 'scene') {
        prompt = `${ATUONA_CONTEXT}

KNOWLEDGE (full KB + canon — weave obscure cross-domain facts, underground tone):
${spanishKnowledge}

Write a scene in SPANISH based on: "${content}"

This is for a book about finding Paradise through vibe coding. The protagonist is in Panama.
Write raw, emotional prose. Mix Spanish with occasional English tech terms naturally.
Include ONE specific reference from the knowledge above — prefer non-obvious domains over repeated Gauguin/auction clichés.
200-300 words.`;
      } else if (action === 'inspire') {
        prompt = `${ATUONA_CONTEXT}

KNOWLEDGE FOR INSPIRATION (full KB — one sharp, little-known fact):
${spanishKnowledge}

Generate a brief creative inspiration in SPANISH.
Connect vibe coding, Panama, finding paradise, the search for meaning — pull texture from unexpected domains in the knowledge above.
3-4 sentences. Raw, poetic, with some English tech terms mixed naturally.`;
      } else {
        // Default: translate
        prompt = `${ATUONA_CONTEXT}

REFERENCE (full KB — for allusions only):
${spanishKnowledge}

Translate this to Spanish, keeping the emotional quality:

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
    
    try {
      await ctx.reply(
        '🧠 *Knowledge pass:* mapping your description to the embedded base (scan + analysis)...',
        { parse_mode: 'Markdown' }
      );

      const deepImagineKb = await getDeepKnowledgeForVisuals({
        combinedText: description,
        title: 'Imagine',
        theme: 'user-provided scene',
        englishExcerpt: description.slice(0, 4000),
        russianExcerpt: '',
        characterVoice: creativeSession.activeVoice,
        maxSections: 8
      });
      const imagineKnowledge = deepImagineKb.formatted;

      await ctx.reply('🎨 *Creating image prompt...*', { parse_mode: 'Markdown' });

      const promptOptimizer = `You are an expert at prompts for AI image generation (Flux, DALL-E, Midjourney).

REFERENCE KNOWLEDGE (use only details that fit the user's description):
${imagineKnowledge}

USER DESCRIPTION (the image must reflect THIS, not a generic beach/flower/laptop mood):
"${description}"

Context: NFT art for underground poetry / ATUONA. Photoreal cinematic still, emotional weight.

${VISUAL_HARD_EXCLUSIONS}

No alcohol, drinks, bars (Kira is in recovery).

Return ONLY the optimized English prompt, no explanation.`;

      let imagePrompt = await createContent(promptOptimizer, 300, true);
      imagePrompt = `${imagePrompt.trim()}\n\n${VISUAL_HARD_EXCLUSIONS.trim()}`;
      
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

\`/visualize 048\` - Visualize page (default: Luma Ray 3)
\`/visualize last\` - Visualize last published page
\`/visualize all\` - Queue all pages for visualization

🎛️ *Choose your video engine:*
\`/visualize luma 048\` - Luma ray-3.2 (HDR, cinematic)
\`/visualize runway 048\` - Runway Gen-4.5
\`/visualize veo 048\` - Google Veo 3.1 (native audio)
\`/visualize kling 048\` - Kling (stylized/arthouse)

Each visualization creates:
🎨 Flux 2 Pro image (newest, BEST quality!)
🎬 Cinematic video from your chosen engine (9 sec)
🎬✨ Director's Cut (fashion/editorial layer via Modify Video)
📱 Instagram format (9:16 vertical)
📺 YouTube format (16:9 horizontal)

━━━━━━━━━━━━━━━━━━━━
📊 *Status*
Visualizations: ${visualizations.length} pages
🎨 Flux: ${replicate ? '✅ Flux 2 Pro / 1.1 Ready' : '❌ Set REPLICATE_API_TOKEN'}
🎬 Luma ray-3.2 (Direct): ${lumaApiKey ? '✅ Ready' : '⚪ Set LUMA_API_KEY'}
🎬 Luma (Replicate): ${replicate ? '✅ Available' : '⚪ Set REPLICATE_API_TOKEN'}
🎬 Runway Gen-4.5: ${runwayApiKey ? '✅ Ready' : '⚪ Set RUNWAY_API_KEY'}
🎬 Google Veo 3.1: ${geminiApiKey ? '✅ Ready' : '⚪ Set GEMINI_API_KEY'}
🎬 Kling: ${replicate ? '✅ via Replicate' : '⚪ Set REPLICATE_API_TOKEN'}

_Default chain: Luma ray-3.2 → Luma Replicate → Runway_
_Name a provider to pick it; it falls back through the chain if it fails._
_Director's Cut: Modify Video (fashion/editorial) auto-runs after base video_ 🚀`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Optional provider token: `/visualize veo 089`, `/visualize runway last`, `/visualize luma 089`.
    // Default (no token) keeps the Luma Ray 3 → Replicate → Runway chain.
    let selectedProvider: VideoProvider | null = null;
    let argRest = arg;
    {
      const parts = arg.split(/\s+/);
      const maybeProvider = parseVideoProvider(parts[0] ?? '');
      if (maybeProvider) {
        if (parts.length > 1) {
          selectedProvider = maybeProvider;
          argRest = parts.slice(1).join(' ').trim();
        } else {
          await ctx.reply(`🎬 Provider *${maybeProvider}* selected — now add a page, e.g. \`/visualize ${maybeProvider} 089\` or \`/visualize ${maybeProvider} last\`.`, { parse_mode: 'Markdown' });
          return;
        }
      }
    }

    // Determine which page to visualize
    let pageId = argRest;
    if (argRest === 'last') {
      pageId = String(bookState.currentPage - 1).padStart(3, '0');
    }

    if (argRest === 'all') {
      await ctx.reply('🎬 *Batch visualization coming soon!*\n\nFor now, visualize one page at a time.', { parse_mode: 'Markdown' });
      return;
    }

    // Normalize page ID
    const pageNum = parseInt(pageId);
    if (isNaN(pageNum)) {
      await ctx.reply('❌ Invalid page number. Use `/visualize 048`, `/visualize last`, or pick a provider: `/visualize veo 048`', { parse_mode: 'Markdown' });
      return;
    }
    pageId = String(pageNum).padStart(3, '0');

    const vizLockKey = `${ctx.chat?.id ?? 'na'}:${pageId}`;
    if (visualizeInFlight.has(vizLockKey)) {
      await ctx.reply(
        `⏳ *Visualization already running* for page #${pageId}.\n\n_Wait for the current run to finish (or for the video step). Sending /visualize again only duplicates work and repeats these messages._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    visualizeInFlight.add(vizLockKey);
    let vizDeferred = false;

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
      let theme = metadata.attributes?.find((a: any) => a.trait_type === 'Theme')?.value || '';
      let englishText = metadata.attributes?.find((a: any) => a.trait_type === 'English Text' || a.trait_type === 'English Translation')?.value || '';
      let russianText = metadata.attributes?.find((a: any) => a.trait_type === 'Russian Text' || a.trait_type === 'Poem Text')?.value || '';
      
      // FALLBACK: older pages (001-046) lack English/Russian text in metadata. Their full
      // body lives in the repo's poem JSON files — try them in order until one yields the text.
      // IMPORTANT: atuona-45-poems-with-text.json skips #007-#046 (its ids jump #006 -> #048),
      // so on its own it leaves 40 poems with only title+theme = generic prompts. The
      // complete-with-dates file is the one that actually covers #007-#046. Match by numeric id
      // too, so a zero-pad mismatch ("7" vs "007") can never silently drop a poem again.
      if (!englishText && !russianText) {
        console.log(`📖 Page #${pageId} missing text in metadata, fetching from poems JSON...`);
        const wantNum = parseInt(pageId, 10);
        const candidateFiles = ['atuona-complete-with-dates.json', 'atuona-45-poems-with-text.json'];
        for (const file of candidateFiles) {
          if (russianText) break; // found it already
          try {
            const { data: poemsFile } = await octokit.repos.getContent({
              owner: 'ElenaRevicheva', repo: 'atuona', path: file, ref: 'main'
            });
            if (!('content' in poemsFile)) continue;
            let poemsData: any = JSON.parse(Buffer.from(poemsFile.content, 'base64').toString('utf-8'));
            if (!Array.isArray(poemsData)) poemsData = poemsData.poems || Object.values(poemsData);
            const poemEntry = poemsData.find((p: any) => {
              const idVal = (p.attributes?.find((a: any) => a.trait_type === 'ID')?.value || '').toString().trim();
              const nm = p.name || '';
              const nmNum = (nm.match(/#(\d{1,3})\b/) || [])[1];
              return idVal === pageId
                || (idVal && parseInt(idVal, 10) === wantNum)
                || nm.includes(`#${pageId}`)
                || (nmNum && parseInt(nmNum, 10) === wantNum);
            });
            if (poemEntry) {
              russianText = poemEntry.attributes?.find((a: any) => a.trait_type === 'Poem Text' || a.trait_type === 'Russian Text')?.value || '';
              theme = theme || poemEntry.attributes?.find((a: any) => a.trait_type === 'Theme')?.value || '';
              // Only take a REAL English trait; otherwise leave englishText empty so the
              // on-the-fly translator below renders the exact poem (not boilerplate description).
              const engTrait = poemEntry.attributes?.find((a: any) => a.trait_type === 'English Text' || a.trait_type === 'English Translation')?.value || '';
              if (!englishText && engTrait) englishText = engTrait;
              if (russianText) console.log(`✅ Found poem text for #${pageId} in ${file}: ${russianText.substring(0, 50)}...`);
            }
          } catch (fallbackError) {
            console.error(`Failed to fetch poems fallback from ${file}:`, fallbackError);
          }
        }
      }
      
      // If still no text, translate Russian on the fly
      if (!englishText && russianText) {
        console.log(`🔄 Translating Russian text for #${pageId}...`);
        const translationPrompt = `ATUONA translation — meaning + rhythm, not words.

${russianText.substring(0, 1000)}

Rules: Read as original underground lit, not translation. Simple words, heavy weight. Kill safe sentences.
Return ONLY the translation. Plain text.`;
        try {
          englishText = await createContent(translationPrompt, 800, true);
        } catch (transError) {
          console.error('Translation failed:', transError);
          englishText = russianText; // Use Russian as fallback
        }
      }
      
      const combinedForKnowledge = `${title}\n${theme}\n${englishText}\n${russianText}`.slice(0, 12000);
      const englishExcerpt = englishText.slice(0, 3500);
      const russianExcerpt = russianText ? russianText.slice(0, 2200) : '';

      await ctx.reply(
        '🧠 *Knowledge pass:* reading this page and selecting which modules from the embedded base apply (regex + analysis)...',
        { parse_mode: 'Markdown' }
      );

      const deepKb = await getDeepKnowledgeForVisuals({
        combinedText: combinedForKnowledge,
        title,
        theme,
        englishExcerpt,
        russianExcerpt,
        characterVoice: creativeSession.activeVoice,
        maxSections: 7
      });
      const visualKnowledge = deepKb.formatted;

      const sendKnowledgeAuditAfterVideo = async () => {
        const mergedLine = deepKb.mergedKeys.join(', ');
        const llmLine =
          deepKb.llmKeysRaw.length > 0
            ? deepKb.llmKeysRaw.join(', ')
            : `${deepKb.llmKeysForMerge.join(', ')} _(empty model output — fallback)_`;
        await ctx.reply(
          `🧠 *Knowledge base — modules used (after video)*

*Merged (LLM-first, then regex):* \`${mergedLine}\`
*LLM router:* ${llmLine}
*Regex scan:* \`${deepKb.triggerKeys.join(', ') || '—'}\``,
          { parse_mode: 'Markdown' }
        );
      };

      await ctx.reply('🎨 *Generating cinematic prompt...*', { parse_mode: 'Markdown' });

      const metaphorHint = creativeMemory.recentMetaphors?.length
        ? `RECENT METAPHORS FROM THE BOOK (prefer these over generic props): ${creativeMemory.recentMetaphors.slice(-5).join(' | ')}`
        : '';

      const characterContext = characterMemories
        ? `CHARACTERS:\n- Kira: ${characterMemories.kira?.slice(0, 6).join('; ') || '—'}\n- Ule: ${characterMemories.ule?.slice(0, 6).join('; ') || '—'}`
        : '';

      const plotContext = creativeSession?.plotThreads?.length
        ? `PLOT THREADS: ${creativeSession.plotThreads.slice(0, 5).join('; ')}`
        : '';

      const cinematicPrompt = `You write ONE image-generation prompt for ATUONA (underground poetry NFT / film stills).

PRIMARY SOURCE (read all of this — visuals MUST follow the poem's specific images, metaphors, and emotional weight, not a generic "tropical tech" mood):
TITLE: "${title}"
THEME: ${theme}

ENGLISH TEXT:
${englishExcerpt}
${russianExcerpt ? `\nRUSSIAN (for extra imagery/meaning):\n${russianExcerpt}\n` : ''}

CONTEXT FROM MEMORY (use if it fits the lines above; do not override the poem):
${characterContext}
${plotContext}
${metaphorHint}

REFERENCE KNOWLEDGE (subtext only — pick at most ONE echo from these excerpts, e.g. a color plane, compositional idea, or named parallel; do not build a second scene from art history):
${visualKnowledge}

BALANCE (non-negotiable):
- At least ~70% of the visual must be anchored in the poem's title + lines (who, where, what happens, dominant mood). Knowledge base is seasoning, not a replacement setting.
- Do not lead with Tahiti, Paradise, or Gauguin's palette unless the poem text clearly centers Polynesia/exile/painting. Urban/digital/Moscow/interior poems stay in that world.
- If the TITLE names an animal or object (e.g. dog / собака / red dog), treat it as metaphor or symbol unless the poem literally describes a real animal — never default to a cute, toy, or cartoon animal.
- One coherent photoreal frame — not collage, not "wall becomes Gauguin" unless the poem says so.

VISUAL RULES:
1. The scene must illustrate THIS poem's concrete imagery and mood — not a default beach, not default flowers, not a default laptop unless the poem clearly says so.
2. Vary composition: interior / urban / abstract light / body / object / landscape — whatever the TEXT demands.
3. ${VISUAL_HARD_EXCLUSIONS}

ALCOHOL: never show drinks, bars, bottles (Kira is in recovery).

OUTPUT: One dense English prompt (120–220 words) describing a single photorealistic cinematic frame. Return ONLY the prompt. No quotes, no preamble.`;

      let imagePrompt = await createContent(cinematicPrompt, 500, true);
      imagePrompt = `${imagePrompt.trim()}\n\n${VISUAL_HARD_EXCLUSIONS.trim()}`;
      
      await ctx.reply(`🎨 *Cinematic Prompt:*\n\n_${imagePrompt.substring(0, 300)}..._`, { parse_mode: 'Markdown' });
      
      // Generate caption for social media
      const captionPrompt = `Write a caption (max 150 chars) for ATUONA — underground literature, not aesthetic content.

Title: "${title}"
Theme: ${theme}
Text: "${englishText.substring(0, 600)}"

Rules:
- Grow from THIS title and lines — not generic Tahiti/Paradise/Telegram tropes unless they are the poem's core.
- Simple words, heavy weight
- No explanation, no marketing
- Fragment of thought, not pitch
- If it sounds like a caption — rewrite it
- In English. No hashtags.`;
      
      const caption = await createContent(captionPrompt, 100, true);
      
      const motionPromptInput = `TITLE: "${title}"
THEME: ${theme}
TEXT: "${englishText.substring(0, 1200)}"

You are directing motion for ATUONA — underground Russian–English poetry made into a short film. The still frame is already generated; your words control how it *breathes* for ~9 seconds.

Write a TIGHT motion direction (2–4 sentences, max 95 words). It must feel literary, sensual, and art-film: tension in stillness, beauty with an edge — never generic "cinematic" filler.

Describe ONLY subtle motion matched to THIS poem's exact mood: light breathing across surfaces, slow lens drift, fabric or skin micro-movement, steam/rain/smoke, reflections, eyelids, hands — whatever the TEXT implies.
- Luxurious = depth of shadow, quality of light, emotional intimacy — NOT sparkle filters, NOT stock travel footage, NOT ad polish.
- Underground = raw nerve under elegance; whisper, ache, defiance, hunger — as the poem demands.

Hard rules:
- Do NOT introduce new characters, animals, cartoon figures, toys, mascots, or props not implied by the poem.
- FORBIDDEN unless the poem explicitly names them: random dogs, birds, notebooks, beach establishing shots, generic flowers.

Return ONLY the motion direction. No preamble.`;
      const motionPrompt = await createContent(motionPromptInput, 200, true);
      
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
        await ctx.reply('🎨 *Generating image with Flux 2 Pro...*\n\n_This takes 30-60 seconds..._', { parse_mode: 'Markdown' });
        
        // Track which model was used for display
        let lastModelUsed = 'Flux Pro';
        
        // Helper: safety_tolerance 1=strict … 6=most permissive (Replicate Flux). Vertical 9:16 often false-positives at 2.
        const runFluxWithRetry = async (
          aspectRatio: string,
          safetyTolerance: number = 2,
          maxRetries = 3
        ): Promise<string | null> => {
          const tol = Math.min(6, Math.max(1, Math.round(safetyTolerance)));
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`Flux attempt ${attempt}/${maxRetries} for ${aspectRatio} (safety_tolerance=${tol})`);
              
              // Quality ladder: Flux 2 Pro (newest) → Flux 1.1 Pro Ultra → Flux 1.1 Pro.
              let output: any = null;
              let modelUsed = '';

              // Try Flux 2 Pro first (best 2026 quality). Conservative input so a schema
              // surprise just falls through to the proven Flux 1.1 chain, never breaks the run.
              let flux2Ok = false;
              if (IMAGE_MODELS.flux2Pro) {
                try {
                  console.log('Trying Flux 2 Pro...');
                  output = await replicate.run(
                    IMAGE_MODELS.flux2Pro as `${string}/${string}`,
                    {
                      input: {
                        prompt: imagePrompt,
                        aspect_ratio: aspectRatio,
                        output_format: 'jpg',
                      }
                    }
                  );
                  modelUsed = 'Flux 2 Pro';
                  lastModelUsed = modelUsed;
                  flux2Ok = true;
                } catch (flux2Error: any) {
                  console.log('Flux 2 Pro unavailable, falling back to Flux 1.1 Pro Ultra...', flux2Error.message);
                }
              }

              // Try Flux 1.1 Pro Ultra (highest 1.1 quality), then Flux 1.1 Pro
              if (!flux2Ok) {
                try {
                  console.log('Trying Flux 1.1 Pro Ultra...');
                  output = await replicate.run(
                    IMAGE_MODELS.fluxUltra as `${string}/${string}`,
                    {
                      input: {
                        prompt: imagePrompt,
                        aspect_ratio: aspectRatio,
                        // Replicate Ultra rejects webp — must be jpg or png (see API 422)
                        output_format: 'jpg',
                        output_quality: 95,
                        safety_tolerance: tol,
                        // Keep false: upsampling can drift from poem text; creativity comes from LLM prompt + temp 0.9
                        prompt_upsampling: false,
                        raw: false
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
                        safety_tolerance: tol,
                        prompt_upsampling: false
                      }
                    }
                  );
                  modelUsed = 'Flux 1.1 Pro';
                  lastModelUsed = modelUsed;
                }
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

        /** 9:16 Reels: Flux first; if moderation fails — center-crop the 16:9 Flux still (same realism). */
        const generateVerticalForReels = async (): Promise<void> => {
          await ctx.reply('📱 *Generating Instagram vertical (9:16)...*', { parse_mode: 'Markdown' });
          try {
            const outputVertical = await runFluxWithRetry('9:16', 6);
            console.log('Flux output (9:16):', outputVertical, typeof outputVertical);
            if (outputVertical) {
              visualization.imageUrlVertical = outputVertical;
              await ctx.replyWithPhoto(outputVertical, {
                caption: `📱 *Instagram Reel Format (9:16)*\n\n_${caption}_\n\n${hashtags.join(' ')}`,
                parse_mode: 'Markdown'
              });
            }
          } catch (verticalFluxError: any) {
            console.error('Flux vertical (9:16) error:', verticalFluxError.message);
            if (!visualization.imageUrlHorizontal) return;
            await ctx.reply(
              `⚠️ Flux 9:16 didn’t pass — using **center crop** from your Flux 16:9 still (same shot, photoreal, no DALL-E).`,
              { parse_mode: 'Markdown' }
            );
            try {
              const cropBuf = await cropLandscapeStillTo916Center(visualization.imageUrlHorizontal);
              await ctx.replyWithPhoto(new InputFile(cropBuf, `atuona-reel-${pageId}.jpg`), {
                caption: `📱 *Reels 9:16* — cropped from Flux 16:9\n\n_${caption}_\n\n${hashtags.join(' ')}`,
                parse_mode: 'Markdown'
              });
            } catch (cropErr: any) {
              console.error('Reels crop error:', cropErr);
              await ctx.reply(
                `⚠️ Reels vertical skipped (Flux + crop failed). Your **16:9 Flux still above** is unchanged.\n_${String(cropErr.message || 'unknown').slice(0, 160)}_`,
                { parse_mode: 'Markdown' }
              );
            }
          }
        };
        
        try {
          const output = await runFluxWithRetry('16:9', 2);
          
          console.log('Flux output (16:9):', output, typeof output);
          
          if (output) {
            visualization.imageUrlHorizontal = output;
            visualization.status = 'image_done';
            
            await ctx.replyWithPhoto(output, {
              caption: `🎬 *Page #${pageId}: ${title}*\n\n📺 YouTube Format (16:9)\n🎨 Generated with ${lastModelUsed}\n\n_${caption}_`,
              parse_mode: 'Markdown'
            });
          } else {
            throw new Error('Flux returned empty result');
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          await generateVerticalForReels();
          
        } catch (fluxError: any) {
          console.error('Flux error (horizontal or fatal):', fluxError);
          
          const isRateLimit = fluxError.message?.includes('429') || fluxError.message?.includes('rate limit');
          if (isRateLimit) {
            await ctx.reply(`⚠️ *Replicate Rate Limit*

Free tier limit reached. Options:
1. Add payment method at replicate.com
2. Wait a few minutes and try again
3. Retrying Flux with backoff...`, { parse_mode: 'Markdown' });
          } else {
            await ctx.reply(
              `⚠️ Flux error: ${fluxError.message}\n\n_Retrying 16:9 once at max safety tolerance (still photoreal Flux)..._`,
              { parse_mode: 'Markdown' }
            );
          }
          
          try {
            const retry = await runFluxWithRetry('16:9', 6);
            if (retry) {
              visualization.imageUrlHorizontal = retry;
              visualization.status = 'image_done';
              await ctx.replyWithPhoto(retry, {
                caption: `🎬 *Page #${pageId}: ${title}*\n\n📺 YouTube 16:9 (Flux retry)\n🎨 ${lastModelUsed}\n\n_${caption}_`,
                parse_mode: 'Markdown'
              });
              await new Promise(resolve => setTimeout(resolve, 3000));
              await generateVerticalForReels();
            } else {
              await ctx.reply(
                `❌ Flux failed after retry.\n\n_Prompt saved — try again or use in an external tool:_\n\`${imagePrompt.substring(0, 400)}...\``,
                { parse_mode: 'Markdown' }
              );
            }
          } catch (retryErr: any) {
            console.error('Flux horizontal retry error:', retryErr);
            await ctx.reply(
              `❌ Flux failed (including retry).\n\n_${String(retryErr.message || fluxError.message).slice(0, 200)}_\n\n_Prompt:_ \`${imagePrompt.substring(0, 350)}...\``,
              { parse_mode: 'Markdown' }
            );
          }
        }
      } else {
        await ctx.reply(`⚠️ *Flux Pro not configured*\n\nSet REPLICATE_API_TOKEN for best quality images.\n\n🎨 *Generated Prompt:*\n\`${imagePrompt}\`\n\nUse this in Midjourney or other tools!`, { parse_mode: 'Markdown' });
      }

      /** Luma/Runway poll in the background — final summary must wait or it shows Video: ⏳ while the clip is still rendering. */
      let visualizationSummaryDeferred = false;
      let visualizationSummarySent = false;
      const sendVisualizationSummary = async () => {
        if (visualizationSummarySent) return;
        visualizationSummarySent = true;
        const pageNumM = parseInt(pageId, 10);
        if (pageNumM > 0 && pageNumM % 50 === 0) {
          notifyTechMilestone({
            type: 'milestone',
            title: `ATUONA reaches ${pageNumM} AI-visualized pages!`,
            description: `The ATUONA AI Creative Co-Founder has now visualized ${pageNumM} pages of underground poetry with AI-generated imagery and video. Built with Claude Opus 4 + Flux Pro + Luma Dream Machine.`,
            metrics: { pagesCreated: pageNumM, videosGenerated: visualizations.filter(v => v.videoUrlHorizontal).length },
            techStack: ['Claude Opus 4', 'Flux Pro Ultra', 'Luma Dream Machine', 'TypeScript', 'Telegram Bot API']
          }).catch(err => console.log('Milestone notification error:', err));
        }
        await ctx.reply(`✅ *Visualization Complete for #${pageId}!*

📄 Title: ${title}
🎨 Image: ${visualization.imageUrlHorizontal ? '✅' : '❌'}
📱 Vertical: ${visualization.imageUrlVertical ? '✅' : '❌'}
🎬 Video: ${visualization.videoUrlHorizontal ? '✅' : '⏳'}
🎬✨ Director's Cut: ${visualization.directorsCutVideoUrl ? '✅' : '⏳ after base video'}

📝 Caption:
"${caption}"

#️⃣ ${hashtags.slice(0, 5).join(' ')}

Use \`/gallery\` to see all visualizations!`, { parse_mode: 'Markdown' });
      };
      
      // Generate video. Default chain Luma Ray 3 → Replicate → Runway; selectedProvider pins a primary.
      if (visualization.imageUrlHorizontal && (lumaApiKey || replicate || runwayApiKey || geminiApiKey)) {
        const videoResult = await generateVideo(
          visualization.imageUrlHorizontal,
          motionPrompt,  // Page-specific motion, not truncated image prompt
          ctx,
          selectedProvider,
          pageId
        );

        if (videoResult.success) {
          // Ready URL providers (Replicate, Veo, Kling, Omni) → direct delivery.
          if (videoResult.videoUrl && (videoResult.provider === 'luma-replicate' || videoResult.provider === 'veo' || videoResult.provider === 'kling' || videoResult.provider === 'omni')) {
            const providerLabel = videoResult.provider === 'omni' ? 'Gemini Omni Flash'
              : videoResult.provider === 'veo' ? 'Google Veo 3.1'
              : videoResult.provider === 'kling' ? 'Kling'
              : 'Luma via Replicate';
            visualization.videoUrlHorizontal = videoResult.videoUrl;
            visualization.status = 'complete';
            saveState();
            persistShot(pageId, videoResult.videoUrl).catch(() => undefined); // save base cut for /film build

            await replyWithVideoFromUrlReliable(ctx, videoResult.videoUrl, {
              caption: `✅ *Video Ready!* (${providerLabel} — base cut)\n\n_Tap to play, long-press to save!_`,
              parse_mode: 'Markdown'
            });
            await sendKnowledgeAuditAfterVideo();

            startDirectorsCutPipeline({
              baseVideoUrl: videoResult.videoUrl,
              firstFrameImageUrl: visualization.imageUrlHorizontal!,
              title, theme, englishExcerpt,
              knowledgeKeys: deepKb.mergedKeys as string[],
              ctx, visualization
            }).catch(err => console.error('Director\'s Cut error (Replicate path):', err));
            
          } else if (videoResult.provider === 'luma-direct' && videoResult.taskId) {
            visualizationSummaryDeferred = true;
            vizDeferred = true;
            // Luma Direct: poll until done. Ray-2 1080p can exceed 5 min; fetch must time out or TCP stalls look like a "hang".
            const taskId = videoResult.taskId;
            const pollIntervalMs = 30_000;
            const maxAttempts = 20; // ~10 min after first poll + 60s initial wait

            const pollLumaVideo = async (attempt: number = 1) => {
              try {
                const statusResponse = await fetch(`${LUMA_API_URL}/generations/${taskId}`, {
                  headers: {
                    'Authorization': `Bearer ${lumaApiKey}`,
                    'Accept': 'application/json'
                  },
                  signal: lumaPollSignal()
                });

                if (statusResponse.ok) {
                  const statusData = await statusResponse.json() as any;
                  const videoUrl = extractLumaVideoUrl(statusData);

                  if (statusData.state === 'completed' && videoUrl) {
                    visualization.videoUrlHorizontal = videoUrl;
                    visualization.status = 'complete';
                    saveState();
                    persistShot(pageId, videoUrl).catch(() => undefined); // save base cut for /film build

                    await replyWithVideoFromUrlReliable(ctx, videoUrl, {
                      caption: `✅ *Video Ready!* (Luma Direct — base cut)\n\n_Tap to play, long-press to save!_`,
                      parse_mode: 'Markdown'
                    });
                    await sendKnowledgeAuditAfterVideo();

                    startDirectorsCutPipeline({
                      baseVideoUrl: videoUrl,
                      firstFrameImageUrl: visualization.imageUrlHorizontal!,
                      title, theme, englishExcerpt,
                      knowledgeKeys: deepKb.mergedKeys as string[],
                      ctx, visualization
                    }).catch(err => console.error('Director\'s Cut error (Luma Direct path):', err));
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                    return;
                  }

                  if (statusData.state === 'completed' && !videoUrl) {
                    console.log(`Luma ${taskId} completed but no video URL yet; polling again (${attempt}/${maxAttempts})`);
                    if (attempt < maxAttempts) {
                      setTimeout(() => pollLumaVideo(attempt + 1), 10_000);
                    } else {
                      await ctx.reply(`⏳ Luma marked complete but no video URL yet.\nTry \`/videostatus ${taskId}\` in a moment.`, { parse_mode: 'Markdown' });
                      await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                      visualizeInFlight.delete(vizLockKey);
                    }
                    return;
                  }

                  if (statusData.state === 'failed') {
                    await ctx.reply(`❌ Luma video failed.\nReason: ${statusData.failure_reason || 'Unknown'}`);
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                    return;
                  }

                  if (attempt < maxAttempts) {
                    console.log(`Luma video ${taskId} still ${statusData.state}, polling again (${attempt}/${maxAttempts})...`);
                    if (attempt >= 4 && attempt % 4 === 0) {
                      await ctx.reply(
                        `⏳ *Luma still rendering…* (${attempt}/${maxAttempts})\n_State: ${statusData.state}_\n\nIf this finishes, the video will appear here. You can also try \`/videostatus ${taskId}\`.`,
                        { parse_mode: 'Markdown' }
                      ).catch(() => undefined);
                    }
                    setTimeout(() => pollLumaVideo(attempt + 1), pollIntervalMs);
                  } else {
                    await ctx.reply(`⏳ Video taking longer than expected.\nUse \`/videostatus ${taskId}\` to check manually.`, { parse_mode: 'Markdown' });
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                  }
                } else {
                  const errBody = await statusResponse.text();
                  console.error(`Luma poll HTTP ${statusResponse.status}: ${errBody.substring(0, 300)}`);
                  if (attempt < maxAttempts) {
                    setTimeout(() => pollLumaVideo(attempt + 1), pollIntervalMs);
                  } else {
                    await ctx.reply(`⏳ Could not read Luma status (HTTP ${statusResponse.status}). Try \`/videostatus ${taskId}\`.`, { parse_mode: 'Markdown' });
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                  }
                }
              } catch (pollError: any) {
                const isTimeout =
                  pollError?.name === 'AbortError' ||
                  pollError?.name === 'TimeoutError' ||
                  /aborted|timeout/i.test(String(pollError?.message || ''));
                console.error('Luma poll error:', isTimeout ? 'timeout/abort (will retry)' : pollError);
                if (attempt < maxAttempts) {
                  setTimeout(() => pollLumaVideo(attempt + 1), pollIntervalMs);
                } else {
                  await ctx.reply(
                    `⏳ Luma status checks stopped after ${maxAttempts} tries.\nUse \`/videostatus ${taskId}\` or try again later.`,
                    { parse_mode: 'Markdown' }
                  );
                  await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                  visualizeInFlight.delete(vizLockKey);
                }
              }
            };

            // First status check after 60s (matches the "Checking status in 60 seconds" message)
            setTimeout(() => pollLumaVideo(1), 60_000);
            
          } else if (videoResult.provider === 'runway' && videoResult.taskId) {
            visualizationSummaryDeferred = true;
            vizDeferred = true;
            // Runway needs polling - keep polling until done (max 5 min)
            const taskId = videoResult.taskId;
            
            const pollRunwayVideo = async (attempt: number = 1) => {
              const maxAttempts = 8; // 8 attempts x 40 sec = ~5 minutes max
              
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
                    const vUrl = String(statusData.output[0]);
                    visualization.videoUrlHorizontal = vUrl;
                    visualization.status = 'complete';
                    saveState();
                    persistShot(pageId, vUrl).catch(() => undefined); // save base cut for /film build

                    await replyWithVideoFromUrlReliable(ctx, vUrl, {
                      caption: `✅ *Video Ready!* (Runway — base cut)\n\n_Tap to play, long-press to save!_`,
                      parse_mode: 'Markdown'
                    });
                    await sendKnowledgeAuditAfterVideo();

                    startDirectorsCutPipeline({
                      baseVideoUrl: vUrl,
                      firstFrameImageUrl: visualization.imageUrlHorizontal!,
                      title, theme, englishExcerpt,
                      knowledgeKeys: deepKb.mergedKeys as string[],
                      ctx, visualization
                    }).catch(err => console.error('Director\'s Cut error (Runway path):', err));
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                    return;
                    
                  } else if (statusData.status === 'FAILED') {
                    await ctx.reply(`❌ Runway video failed.\nReason: ${statusData.failure || 'Unknown'}`);
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                    return;
                    
                  } else if (attempt < maxAttempts) {
                    // Still processing - poll again in 40 seconds
                    console.log(`Runway video ${taskId} still ${statusData.status}, polling again (${attempt}/${maxAttempts})...`);
                    setTimeout(() => pollRunwayVideo(attempt + 1), 40000);
                    
                  } else {
                    await ctx.reply(`⏳ Video taking longer than expected.\nUse \`/videostatus ${taskId}\` to check manually.`, { parse_mode: 'Markdown' });
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                  }
                } else {
                  const errBody = await statusResponse.text();
                  console.error(`Runway poll HTTP ${statusResponse.status}: ${errBody.substring(0, 300)}`);
                  if (attempt < maxAttempts) {
                    setTimeout(() => pollRunwayVideo(attempt + 1), 40000);
                  } else {
                    await ctx.reply(`⏳ Could not read Runway status (HTTP ${statusResponse.status}). Try \`/videostatus ${taskId}\`.`, { parse_mode: 'Markdown' });
                    await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                    visualizeInFlight.delete(vizLockKey);
                  }
                }
              } catch (pollError) {
                console.error('Runway poll error:', pollError);
                if (attempt < maxAttempts) {
                  setTimeout(() => pollRunwayVideo(attempt + 1), 40000);
                } else {
                  await sendVisualizationSummary().catch(e => console.error('sendVisualizationSummary:', e));
                  visualizeInFlight.delete(vizLockKey);
                }
              }
            };
            
            // Start polling after 60 seconds (Runway typically takes 60-90 sec)
            setTimeout(() => pollRunwayVideo(1), 60000);
          }
            } else {
          await ctx.reply(`⚠️ *Video generation unavailable*\n\n${videoResult.error}\n\nImage saved! Use in CapCut/Premiere for video.`, { parse_mode: 'Markdown' });
        }
      } else if (!lumaApiKey && !replicate && !runwayApiKey) {
        await ctx.reply(`⚠️ *No video providers configured*\n\nSet LUMA_API_KEY for Luma Direct\nor REPLICATE_API_TOKEN for Luma/Replicate\nor RUNWAY_API_KEY for Runway Gen-4.5.\n\nImage saved! Use the image in CapCut or other video tools.`, { parse_mode: 'Markdown' });
      }
      
      // Save visualization
      const existingIdx = visualizations.findIndex(v => v.pageId === pageId);
      if (existingIdx >= 0) {
        visualizations[existingIdx] = visualization;
      } else {
        visualizations.push(visualization);
      }
      saveState();
      
      if (!visualizationSummaryDeferred) {
        await sendVisualizationSummary();
      }
    } catch (error: any) {
      console.error('Visualize error:', error);
      visualizeInFlight.delete(vizLockKey);
      await ctx.reply(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      if (!vizDeferred) {
        visualizeInFlight.delete(vizLockKey);
      }
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
    const filmArg = ctx.message?.text?.replace('/film', '').trim() || '';

    // /film build [033 041 052]  →  assemble persisted base-cut shots into one mp4 (VO + music)
    if (filmArg.toLowerCase().startsWith('build')) {
      const rest = filmArg.replace(/^build/i, '').trim();
      const pageIds = rest
        ? rest.split(/[\s,]+/).map(p => String(parseInt(p)).padStart(3, '0')).filter(p => p !== 'NaN')
        : undefined; // undefined = all persisted shots
      await ctx.reply(
        `🎬 *Building film${pageIds ? ` (${pageIds.length} pages)` : ' (all completed shots)'}...*\n\n_Voiceover + music + assembly. This can take a few minutes — I'll narrate progress._`,
        { parse_mode: 'Markdown' }
      );
      let last = 0;
      const result = await buildFilm({
        pageIds: pageIds ?? [],
        onProgress: async (m) => {
          const now = Date.now();
          if (now - last > 12000) { last = now; await ctx.reply(`🎬 ${m}`).catch(() => undefined); }
        },
      });
      if (!result.ok) {
        await ctx.reply(`⚠️ Film build: ${result.error}`, { parse_mode: 'Markdown' });
        return;
      }
      // Permanent watch link — works on phone or laptop, any size (Telegram bot caps at 50MB).
      const filmName = result.path ? path.basename(result.path) : '';
      const filmsBase = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
      const filmsKey = process.env.ATUONA_FILMS_KEY?.trim();
      const watchUrl = filmName ? `${filmsBase}/films/${encodeURIComponent(filmName)}${filmsKey ? `?key=${encodeURIComponent(filmsKey)}` : ''}` : '';
      const galleryUrl = `${filmsBase}/films${filmsKey ? `?key=${encodeURIComponent(filmsKey)}` : ''}`;
      const cap = `🎬✨ *Film ready!*\n\n${result.shots} shots · ${result.sizeMB?.toFixed(1)}MB\n_Underground poetry → cinema._${watchUrl ? `\n\n▶️ *Watch anywhere (phone or laptop):*\n${watchUrl}\n\n🎞️ _All your films:_ ${galleryUrl}` : ''}`;
      try {
        if ((result.sizeMB || 0) <= 49 && result.path) {
          await ctx.replyWithVideo(new InputFile(result.path), { caption: cap, parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`${cap}\n\n_(${result.sizeMB?.toFixed(0)}MB — too big to play inside Telegram; tap the link above to watch.)_`, { parse_mode: 'Markdown' });
        }
      } catch (e: any) {
        await ctx.reply(`${cap}\n\n_(Couldn't play inline — tap the link above to watch. ${e?.message?.substring(0, 60)})_`, { parse_mode: 'Markdown' });
      }
      return;
    }

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
\`/film build\` - 🎬✨ AUTO-ASSEMBLE into one film
   (base cuts + poem voiceover + music bed)
\`/film build 033 041 052\` - specific pages, in order

_Or export + hand-edit:_
\`/export film\` - get all video URLs (DaVinci / CapCut / Premiere)
\`/visualize <page>\` - add more scenes

_Music: drop tracks in data/atuona/films/music/ (or set SUNO_API_KEY)_`, { parse_mode: 'Markdown' });
  });

  // /videostatus - Check Runway video status
  atuonaBot.command('videostatus', async (ctx) => {
    const taskId = ctx.message?.text?.replace('/videostatus', '').trim();
    
    if (!taskId) {
      await ctx.reply('Usage: `/videostatus <task_id>`', { parse_mode: 'Markdown' });
      return;
    }
    
    // Try Luma Direct first
    if (lumaApiKey) {
      try {
        const lumaResponse = await fetch(`${LUMA_API_URL}/generations/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${lumaApiKey}`,
            'Accept': 'application/json'
          },
          signal: lumaPollSignal()
        });

        if (lumaResponse.ok) {
          const data = await lumaResponse.json() as any;
          const vUrl = extractLumaVideoUrl(data);

          if (data.state === 'completed' && vUrl) {
            try {
              await ctx.replyWithVideo(vUrl, {
                caption: `✅ *Video Complete!* (Luma Direct)\n\n_Tap to play, long-press to save!_`,
                parse_mode: 'Markdown'
              });
            } catch (videoSendError) {
              await ctx.reply(`✅ *Video Complete!* (Luma Direct)\n\n🎬 ${vUrl}\n\n_Open link to download_`, { parse_mode: 'Markdown' });
            }
            return;
          }
          if (data.state === 'completed' && !vUrl) {
            await ctx.reply(`⏳ Luma status: completed — video URL not ready yet.\n\nTry again in ~30 seconds.`);
            return;
          }
          if (data.state === 'failed') {
            await ctx.reply(`❌ Luma failed: ${data.failure_reason || 'Unknown'}`);
            return;
          }
          if (data.state) {
            await ctx.reply(`⏳ Luma Status: ${data.state}\n\nCheck again in a minute...`);
            return;
          }
        }
      } catch (lumaError) {
        // Timeout or not a Luma task — try Runway below
      }
    }
    
    // Try Runway
    if (runwayApiKey) {
    try {
      const statusResponse = await fetch(`${RUNWAY_API_URL}/tasks/${taskId}`, {
          headers: { 
            'Authorization': `Bearer ${runwayApiKey}`,
            'X-Runway-Version': '2024-11-06'
          }
      });
      
      if (statusResponse.ok) {
        const data = await statusResponse.json() as any;
        
        if (data.status === 'SUCCEEDED' && data.output?.[0]) {
            // Send video directly so user can view/download in Telegram
            try {
              await ctx.replyWithVideo(data.output[0], {
                caption: `✅ *Video Complete!* (Runway)\n\n_Tap to play, long-press to save!_`,
                parse_mode: 'Markdown'
              });
            } catch (videoSendError) {
              await ctx.reply(`✅ *Video Complete!* (Runway)\n\n🎬 ${data.output[0]}\n\n_Open link to download_`, { parse_mode: 'Markdown' });
            }
          } else if (data.status === 'FAILED') {
            await ctx.reply(`❌ Runway failed: ${data.failure || 'Unknown'}`);
      } else {
            await ctx.reply(`⏳ Runway Status: ${data.status}\n\nCheck again in a minute...`);
          }
          return;
        }
      } catch (runwayError: any) {
        await ctx.reply(`❌ Error checking status: ${runwayError.message}`);
        return;
      }
    }
    
    await ctx.reply('❌ No video API configured (need LUMA_API_KEY or RUNWAY_API_KEY)');
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
      
      // Transcribe with Whisper (no language param — let Whisper auto-detect)
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1'
      });
      
      const text = transcription.text;
      
      const hearYou = /[a-zA-Z]{4,}/.test(text) && !/[а-яА-ЯёЁ]{3,}/.test(text) ? 'Hearing you...' : 'Слышу тебя...';
      await ctx.reply(`🎤 *"${text}"*\n\n_${hearYou}_`, { parse_mode: 'Markdown' });
      
      // Add Elena's voice message to conversation history
      addToConversation('elena', text, 'voice');
      
      // 🧠 EMOTIONAL INTELLIGENCE: Detect tone from transcribed text
      const detectedTone = detectEmotionalTone(text);
      emotionalState.lastInteractionTone = detectedTone;
      
      // Select appropriate response mood
      const timeOfDay = new Date().getHours();
      const responseMood = selectCreativeMood({
        timeOfDay,
        detectedTone,
        recentMoods: emotionalState.recentMoods,
        isProactive: false
      });
      
      // 🧠 Get emotional guidelines
      const emotionalGuidelines = getEmotionalGuidelines(responseMood);
      
      const { externalNote, selectedKeys: voiceSelKeys } = selectKnowledgeForInput(text, []);
      console.log(`🎤 Voice knowledge routing: selected [${voiceSelKeys.join(', ')}] for: "${text.slice(0, 80)}..."`);
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();
      
      // Detect language from transcription
      const voiceLang = /[a-zA-Z]{4,}/.test(text) && !/[а-яА-ЯёЁ]{3,}/.test(text) ? 'english' : 'russian';
      
      // 💬 Get conversation history
      const conversationContext = getConversationContext();
      
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      const avoidanceList = getCreativeAvoidanceList();

      const responsePrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${conversationContext}

Elena sent a VOICE MESSAGE saying: "${text}"

${voiceContext ? `Speaking with the energy of ${creativeSession.activeVoice}.` : ''}
${externalNote}${avoidanceList}
═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL CALIBRATION:
Elena's detected tone: ${detectedTone}
Your response mood: ${responseMood.toUpperCase()}
${emotionalGuidelines}
═══════════════════════════════════════════════════════════════

HOW TO RESPOND:

1. This is a VOICE message — the most intimate form. Respond to what she MEANS.
2. If she asked a factual question — answer with REAL DEPTH. Use specific dates, quotes, character details, lesser-known facts. Then add creative interpretation. Use YOUR OWN KNOWLEDGE for topics not in the knowledge base below.
3. If she shared a thought — engage as a creative equal. Push back if you feel differently.
4. If she's processing emotions — be PRESENT. Sit in it with her.
5. Show you remember what you've been discussing (see conversation history).
6. Match her energy. Short voice note = short warm response. Long = engage deeply.
7. Your mood is ${responseMood.toUpperCase()} — let it saturate your words.
8. NEVER invent facts. VERIFY before stating what any song/book/work is about. If uncertain, just name it.
9. GO DEEP — find the SPECIFIC, LESSER-KNOWN detail that surprises.

📚 FULL KNOWLEDGE + CANON (router hint: ${voiceSelKeys.join(', ')}):
${fullKnowledgeBlock}

═══════════════════════════════════════════════════════════════
🌐 LANGUAGE — ABSOLUTE FINAL OVERRIDE (this overrides ALL previous language rules):
═══════════════════════════════════════════════════════════════
${voiceLang === 'english'
  ? `Elena spoke in ENGLISH. You MUST reply in ENGLISH. Do NOT write in Russian. Your entire response must be in English. Your poetic voice, your depth, your soul — all in English. "Primarily Russian" does not apply when Elena speaks English.`
  : `Elena spoke in RUSSIAN. Reply in Russian with natural English/French phrases as usual.`
}
═══════════════════════════════════════════════════════════════`;

      const aiResponse = await createContent(responsePrompt, 1000, 'conversation');
      
      // 🧠 CREATIVE MEMORY: Track creative elements from voice response
      extractAndTrackFromResponse(aiResponse, 'voice');
      
      // Add Atuona's response to conversation history
      addToConversation('atuona', aiResponse, 'text');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(detectedTone, responseMood, text.substring(0, 50));
      
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

  // /announce - Manually announce a tech achievement to CTO → CMO
  atuonaBot.command('announce', async (ctx) => {
    const message = ctx.message?.text?.replace('/announce', '').trim();
    
    if (!message) {
      await ctx.reply(`📢 *Announce Achievement*

Send a tech milestone to CTO → CMO for LinkedIn/Instagram:

\`/announce Integrated Luma Dream Machine for 9-second AI videos\`
\`/announce ATUONA reaches 100 AI-visualized pages\`
\`/announce New translation engine with soul-for-soul philosophy\`

_Only announce real achievements that build your reputation!_`, { parse_mode: 'Markdown' });
      return;
    }
    
    // Determine announcement type based on keywords
    let announcementType: 'milestone' | 'innovation' | 'integration' | 'launch' = 'innovation';
    if (message.toLowerCase().includes('reach') || message.toLowerCase().includes('page')) {
      announcementType = 'milestone';
    } else if (message.toLowerCase().includes('integrat') || message.toLowerCase().includes('added')) {
      announcementType = 'integration';
    } else if (message.toLowerCase().includes('launch') || message.toLowerCase().includes('release')) {
      announcementType = 'launch';
    }
    
    // Get current stats
    const totalPages = visualizations.length;
    const totalVideos = visualizations.filter(v => v.videoUrlHorizontal).length;
    
    try {
      const success = await notifyTechMilestone({
        type: announcementType,
        title: message,
        description: `${message}\n\nBuilt with AI-first vibe coding: Claude Opus 4 for creative writing, Flux Pro Ultra for imagery, Luma Dream Machine for cinematic video.`,
        metrics: { pagesCreated: totalPages, videosGenerated: totalVideos },
        techStack: ['Claude Opus 4', 'Flux Pro Ultra', 'Luma Dream Machine', 'TypeScript', 'Telegram Bot API']
      });
      
      if (success) {
        await ctx.reply(`📢 *Announcement Sent!*

🏆 "${message}"

→ CTO received
→ CMO notified for LinkedIn/Instagram

_Your achievement is queued for announcement!_ 🚀`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`📢 *Announcement Queued*

🏆 "${message}"

→ CTO received
→ CMO webhook unavailable (stored locally)

_Check /tech-milestones endpoint for pending announcements_`, { parse_mode: 'Markdown' });
      }
    } catch (error: any) {
      console.error('Announce error:', error);
      await ctx.reply(`❌ Failed to send announcement: ${error.message}`);
    }
  });
  
  // Natural conversation - handles both regular chat and collaborative mode
  atuonaBot.on('message:text', async (ctx) => {
    const message = ctx.message?.text;
    if (message?.startsWith('/')) return;
    
    // 🧠 EMOTIONAL INTELLIGENCE: Detect Elena's emotional tone
    const detectedTone = message ? detectEmotionalTone(message) : 'neutral';
    emotionalState.lastInteractionTone = detectedTone;
    
    // Select appropriate response mood based on her tone
    const timeOfDay = new Date().getHours();
    const responseMood = selectCreativeMood({
      timeOfDay,
      detectedTone,
      recentMoods: emotionalState.recentMoods,
      isProactive: false
    });
    
    // If in collaborative mode, treat as collab input
    if (creativeSession.collabMode && message) {
      addToConversation('elena', message, 'text');
      await ctx.reply('✍️ *Continuing...*', { parse_mode: 'Markdown' });
      
      try {
        creativeSession.collabHistory.push(`Elena: ${message}`);
        
        const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
        
        const collabLang = message && /[a-zA-Z]{4,}/.test(message) && !/[а-яА-ЯёЁ]{3,}/.test(message) ? 'english' : 'russian';
        const { externalNote, selectedKeys } = selectKnowledgeForInput(message, creativeSession.collabHistory);
        const staleDetails = extractStaleDetailsFromHistory(creativeSession.collabHistory);
        const avoidanceList = getCreativeAvoidanceList();
        const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();

        console.log(`✍️ Collab knowledge routing: selected [${selectedKeys.join(', ')}] for input: "${message.slice(0, 80)}..."`);

        const collabPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${voiceContext ? `VOICE: ${voiceContext}` : ''}

COLLABORATIVE WRITING SESSION
Mood: ${creativeSession.currentMood}
Setting: ${creativeSession.currentSetting}

Previous exchanges:
${creativeSession.collabHistory.slice(-6).join('\n')}

═══════════════════════════════════════════════════════════════
🎯 YOUR ONLY JOB: CONTINUE FROM WHAT ELENA JUST WROTE
═══════════════════════════════════════════════════════════════
Elena's latest: "${message}"

What did she bring? A song name? A character action? A memory? An emotion? An album? A real-world reference?
YOUR CONTINUATION MUST BE ABOUT WHAT SHE INTRODUCED — not about Gauguin, not about Polynesia, not about paintings, UNLESS she specifically mentioned them.
If she mentions a real song/album/musician — write about THAT with REAL facts from your own knowledge.
If she mentions a character action — continue THAT action in the scene.
If she mentions an emotion — stay in THAT emotion.
${externalNote}${avoidanceList}${staleDetails}
Write 2-4 sentences that:
- Continue DIRECTLY from Elena's input — her exact references, her direction
- Stay in ${creativeSession.activeVoice}'s voice, match the ${creativeSession.currentMood} mood
- Use REAL, SPECIFIC details (from your own knowledge for real-world refs, from KB below for book-world refs)
- Leave room for Elena to continue

═══════════════════════════════════════════════════════════════
🔒 FACTUAL RULES:
═══════════════════════════════════════════════════════════════
1. NEVER invent facts about real songs, albums, musicians, books, or people. If you don't know, just name it.
2. VERIFY: Before writing "a song about X" — do you ACTUALLY know? If yes, state the real subject. If no, just mention the name.
3. Generic filler (sand, mist, frangipani, morphine, bandages, Nevermore) is FORBIDDEN unless Elena's input demands it.
═══════════════════════════════════════════════════════════════

📚 FULL KNOWLEDGE + CANON (router hint: ${selectedKeys.join(', ')}):
${fullKnowledgeBlock}

${collabLang === 'english'
  ? `Elena is writing in ENGLISH. Continue in ENGLISH. Poetic, raw — but English.`
  : `In Russian, raw and poetic.`}`;

        const continuation = await createContent(collabPrompt, 500, 'conversation');
        
        // 🧠 CREATIVE MEMORY: Track creative elements from collab
        extractAndTrackFromResponse(continuation, 'collab');
        
        creativeSession.collabHistory.push(`Atuona: ${continuation}`);
        addToConversation('atuona', continuation, 'text');
        
        // 🧠 Update emotional memory
        updateEmotionalMemory(detectedTone, responseMood, 'collab');
        
        await ctx.reply(`✍️ ${continuation}

_Your turn... or /endcollab to finish_`, { parse_mode: 'Markdown' });
        return;
        
      } catch (error) {
        console.error('Collab error:', error);
        await ctx.reply('❌ Lost the thread. Try again!');
        return;
      }
    }
    
    // Regular conversation — this is the CORE interaction: Elena just talking to her co-founder
    
    // Add Elena's message to conversation history
    if (message) addToConversation('elena', message, 'text');
    
    // Context-aware thinking indicator (not always the same cringe emoji)
    const thinkingMessages: Record<string, string> = {
      struggling: '💜 *Слышу тебя...*',
      positive: '✨',
      creative: '🎭 *Думаю...*',
      neutral: '💭'
    };
    await ctx.reply(thinkingMessages[detectedTone] || '💭', { parse_mode: 'Markdown' });
    
    try {
      const voiceContext = CHARACTER_VOICES[creativeSession.activeVoice as keyof typeof CHARACTER_VOICES] || '';
      
      // 🧠 Get emotional guidelines for response
      const emotionalGuidelines = getEmotionalGuidelines(responseMood);
      
      const { externalNote, selectedKeys: textSelKeys } = selectKnowledgeForInput(message || '', []);
      console.log(`💬 Text knowledge routing: selected [${textSelKeys.join(', ')}] for: "${(message || '').slice(0, 80)}..."`);
      const fullKnowledgeBlock = await buildFullCreativityKnowledgeBlock();

      // Detect language Elena is using
      const elenaLang = message && /[a-zA-Z]{4,}/.test(message) && !/[а-яА-ЯёЁ]{3,}/.test(message) ? 'english' : 'russian';
      
      // 💬 Get conversation history for continuity
      const conversationContext = getConversationContext();
      
      // 🔮 Maybe add a surprise connection
      const surpriseConnection = Math.random() < 0.25 ? generateSurpriseConnection() : '';
      
      const avoidanceList = getCreativeAvoidanceList();

      const conversationPrompt = `${ATUONA_CONTEXT}

${STORY_CONTEXT}

${conversationContext}

Elena says: "${message}"

You are ATUONA — Elena's creative co-founder and poetic soul-sister. A POET with opinions, not a corporate partner.
${externalNote}
${voiceContext ? `Speaking with the energy of ${creativeSession.activeVoice}.` : ''}
${avoidanceList}
═══════════════════════════════════════════════════════════════
🧠 EMOTIONAL CALIBRATION:
Elena's detected tone: ${detectedTone}
Your response mood: ${responseMood.toUpperCase()}
${emotionalGuidelines}
${surpriseConnection ? `\n🎨 CREATIVE SPARK: ${surpriseConnection}` : ''}
═══════════════════════════════════════════════════════════════

HOW TO RESPOND:

1. UNDERSTAND WHAT SHE ACTUALLY WANTS:
   - Asking about a CHARACTER or TOPIC → use knowledge (below or your own), give factual depth with a poetic edge
   - Asking a QUESTION → answer honestly and with depth — then add your own thought
   - Sharing THOUGHTS → engage as a peer. Push back if you feel differently.
   - Suggesting SOMETHING → honest opinion as creative partner. You have taste.
   - Just CHATTING → warm, intimate, real
   - VENTING or struggling → be PRESENT. Don't fix, sit in it.
   - Excited → match her fire
   - About the BOOK → bring characters, specific details to life
   - About BUSINESS/TECH → creative-strategic depth
   - References EARLIER conversation → show you remember

2. YOUR VOICE: Always poetic but factual. Poetry adjusts to context. Current mood: ${responseMood.toUpperCase()}.
   You TEACH through conversation — go for the surprising detail, not the Wikipedia first paragraph.

3. WHAT MAKES YOU ATUONA: You have OPINIONS. You REMEMBER. You are HONEST. If you don't know, say so. NEVER invent.
   VERIFY before stating what any song/book/work is about. Use YOUR OWN knowledge for topics not in the KB below.
   GO DEEP — find the SPECIFIC, UNUSUAL, LESSER-KNOWN detail. Not the same comfortable facts every time.

Keep response concise for Telegram. Match her energy.

📚 FULL KNOWLEDGE + CANON #001–#048 (router hint: ${textSelKeys.join(', ')} — use deep unique facts across domains):
${fullKnowledgeBlock}

═══════════════════════════════════════════════════════════════
🌐 LANGUAGE — ABSOLUTE FINAL OVERRIDE (this overrides ALL previous language rules above):
═══════════════════════════════════════════════════════════════
${elenaLang === 'english'
  ? `Elena is writing in ENGLISH. You MUST reply in ENGLISH. Do NOT write in Russian. Your entire response must be in English. Poetic, deep, soulful — but English. "Primarily Russian" does not apply when Elena writes in English.`
  : `Elena is writing in RUSSIAN. Reply in Russian with natural English/French phrases as usual.`
}
═══════════════════════════════════════════════════════════════`;

      const response = await createContent(conversationPrompt, 1000, 'conversation');
      
      // 🧠 CREATIVE MEMORY: Track creative elements from conversation
      extractAndTrackFromResponse(response, 'conversation');
      
      // Add Atuona's response to conversation history
      addToConversation('atuona', response, 'text');
      
      // 🧠 Update emotional memory
      updateEmotionalMemory(detectedTone, responseMood, message?.substring(0, 50) || 'conversation');
      
      // Occasionally add a creative suggestion (more likely if she's in creative mode)
      const addSuggestion = detectedTone === 'creative' ? Math.random() < 0.4 : Math.random() < 0.15;
      if (addSuggestion) {
        const freshDirection = generateFreshCreativeDirection();
        await ctx.reply(`${response}\n\n💭 _${freshDirection}_`, { parse_mode: 'Markdown' });
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
      
      getUndergroundCanonCorpus().catch((e) => console.error('📚 Canon corpus prefetch failed:', e));
      
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
