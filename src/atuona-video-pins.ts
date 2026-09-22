import * as dotenv from 'dotenv';
dotenv.config({ override: true });

/**
 * Atuona /visualize pins — one file to bump when a vendor ships a new grade.
 *
 * Commands stay `/visualize luma 048` forever. The model id and the menu
 * grade live here (env override wins). Do not re-encode help, /menu, or
 * setMyCommands when Luma/Kling/Omni/… move — change the pin.
 *
 * DeepSeek has no video API (official models are deepseek-flash text/vision
 * only). `/visualize deepseek` is a director: Flash writes the motion line,
 * then the current video chain runs.
 */

export type VideoProvider =
  | 'luma' | 'omni' | 'runway' | 'veo' | 'kling' | 'seedance' | 'wan' | 'grok'
  | 'sora' | 'pixverse' | 'happyhorse' | 'hailuo'
  | 'venice' | 'venice18'
  | 'deepseek';

/**
 * Venice.ai video — its OWN API (VENICE_API_KEY), not Replicate, and not one call:
 * POST /video/queue → poll POST /video/retrieve → mp4 BYTES (no hosted URL).
 *
 * ⚠️ HONEST NOTE, do not quietly "fix" this into an image-style safe/adult pair.
 * The image API has a documented `safe_mode` switch, so `/imagine venice` vs `/imagine venice18`
 * is one flag. The VIDEO API HAS NO SUCH FLAG. Venice instead marks models in /models
 * (`model_spec.uncensored: true` — 44 of 138 on 22 Sep 2026, the whole Wan 3.0 family among them).
 * So here the two commands differ by MODEL TIER, and `venice18` is a label of intent and cost,
 * not a different filter. Venice's own content policy still applies to both (HTTP 422).
 */
export type VeniceVideoProvider = 'venice' | 'venice18';
export const VENICE_VIDEO_IDS: readonly VeniceVideoProvider[] = ['venice', 'venice18'];
export function isVeniceVideoProvider(id: string | null | undefined): id is VeniceVideoProvider {
  return id === 'venice' || id === 'venice18';
}

/**
 * Per-tier render settings, read from Venice's live model constraints on 22 Sep 2026:
 * wan-3-0-image-to-video → 480p/720p/1080p, 2s/5s/10s/15s/20s/25s/30s, aspect_ratio supported;
 * wan-3-0-pro-image-to-video → 1080p/2k/4k, same durations. Env overrides win.
 */
export function veniceVideoSpec(id: VeniceVideoProvider): {
  model: string; resolution: string; duration: string; aspectRatio: string;
} {
  const pro = id === 'venice18';
  return {
    model: videoPinModel(id),
    resolution: envOr('VENICE_VIDEO_RESOLUTION', pro ? '1080p' : '720p'),
    duration: envOr('VENICE_VIDEO_DURATION', '5s'),
    aspectRatio: envOr('VENICE_VIDEO_ASPECT', '16:9'),
  };
}

/** Generic Replicate image→video engines (22 Sep 2026): one runner, per-model input below. */
export type ReplicateVideoProvider = 'sora' | 'pixverse' | 'happyhorse' | 'hailuo';
export const REPLICATE_VIDEO_IDS: readonly ReplicateVideoProvider[] = ['sora', 'pixverse', 'happyhorse', 'hailuo'];
export function isReplicateVideoProvider(id: string | null | undefined): id is ReplicateVideoProvider {
  return !!id && (REPLICATE_VIDEO_IDS as readonly string[]).includes(id);
}
/** Input per model — prompt, start frame, length, size only (schemas read from Replicate 22 Sep 2026; no safety knobs). */
export function replicateVideoInput(id: ReplicateVideoProvider, imageUrl: string, prompt: string): Record<string, unknown> {
  switch (id) {
    case 'sora': return { prompt, input_reference: imageUrl, seconds: 8, resolution: 'standard', aspect_ratio: 'landscape' };
    case 'pixverse': return { prompt, image: imageUrl, duration: 8, quality: '720p' };
    case 'happyhorse': return { prompt, image: imageUrl, duration: 8, resolution: '720p' };
    case 'hailuo': return { prompt, first_frame_image: imageUrl, duration: 6, resolution: '768p' };
  }
}

export type VideoPin = {
  id: VideoProvider;
  aliases: readonly string[];
  /** Menu / status grade. Bump this string when the pin id changes. */
  grade: string;
  emoji: string;
  env: string;
  fallback: string;
  /** `director` = no video API; writes the shot then hands off. */
  kind: 'video' | 'director';
};

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v.trim() !== '' ? v.trim() : fallback;
}

/** Menu order — portfolio of engines Elena listed. */
export const VIDEO_PIN_ORDER: readonly VideoProvider[] = [
  'luma',
  'omni',
  'runway',
  'veo',
  'kling',
  'seedance',
  'wan',
  'grok',
  'sora',
  'pixverse',
  'happyhorse',
  'hailuo',
  'venice',
  'venice18',
  'deepseek',
];

export const VIDEO_PINS: Record<VideoProvider, VideoPin> = {
  luma: {
    id: 'luma',
    aliases: ['luma', 'ray', 'ray2', 'ray3', 'ray-3', 'ray32', 'ray-3.2', 'dream', 'dreammachine'],
    grade: 'Luma ray-3.2 (HDR cinematic)',
    emoji: '🎬',
    env: 'LUMA_VIDEO_MODEL',
    fallback: 'ray-3.2',
    kind: 'video',
  },
  omni: {
    id: 'omni',
    aliases: ['omni', 'omniflash', 'gemini-omni', 'gemini', 'google'],
    grade: 'Gemini Omni 1.1 Flash (native audio)',
    emoji: '✨',
    env: 'GEMINI_OMNI_MODEL',
    fallback: 'gemini-omni-1.1-flash',
    kind: 'video',
  },
  runway: {
    id: 'runway',
    aliases: ['runway', 'gen4', 'gen45', 'gen-4', 'gen4.5', 'runwayml'],
    grade: 'Runway Gen-4.5',
    emoji: '🎬',
    env: 'RUNWAY_VIDEO_MODEL',
    fallback: 'gen4.5',
    kind: 'video',
  },
  veo: {
    id: 'veo',
    aliases: ['veo', 'veo3', 'veo31', 'veo-3.1'],
    grade: 'Google Veo 3.1 (native audio)',
    emoji: '🎬',
    env: 'VEO_MODEL',
    fallback: 'veo-3.1-generate-preview',
    kind: 'video',
  },
  kling: {
    id: 'kling',
    aliases: ['kling', 'kling3', 'kling-v3', 'kuaishou', 'kwaivgi'],
    grade: 'Kling 3.0 Omni (arthouse, reference images, native audio)',
    emoji: '🎬',
    env: 'KLING_REPLICATE_MODEL',
    fallback: 'kwaivgi/kling-v3-omni-video',
    kind: 'video',
  },
  seedance: {
    id: 'seedance',
    aliases: ['seedance', 'seedance25', 'seedance-2.5', 'seedance2.5', 'seedance2', 'bytedance', 'doubao'],
    grade: 'Seedance 2.5 (long-take + native audio)',
    emoji: '🎬',
    env: 'SEEDANCE_REPLICATE_MODEL',
    fallback: 'bytedance/seedance-2.5',
    kind: 'video',
  },
  // Wan + Grok added 22 Sep 2026 after the film #8 bake-off (docs/atuona/FILM8_2026-09-22.md §4):
  // Wan was the boldest on Kira's close shots; Grok the cheapest realistic wide shots. Both via REPLICATE_API_TOKEN.
  wan: {
    id: 'wan',
    aliases: ['wan', 'wan2.7', 'wan27', 'wan-2.7', 'alibaba'],
    grade: 'Wan 2.7 (bold emotional close-ups)',
    emoji: '🎬',
    env: 'WAN_REPLICATE_MODEL',
    fallback: 'wan-video/wan-2.7-i2v',
    kind: 'video',
  },
  grok: {
    id: 'grok',
    aliases: ['grok', 'grok-imagine', 'grokimagine', 'xai', 'imagine15'],
    grade: 'Grok Imagine Video 1.5 (realistic, cheapest)',
    emoji: '🎬',
    env: 'GROK_VIDEO_REPLICATE_MODEL',
    fallback: 'xai/grok-imagine-video-1.5',
    kind: 'video',
  },
  // Replicate prices 22 Sep 2026: Sora 2 Pro $0.30–0.50/s (8 s ≈ $2.40+), PixVerse v6 $0.05–0.23/s,
  // HappyHorse $0.14/s @720p, Hailuo 2.3 $0.28–0.56 per clip.
  sora: {
    id: 'sora',
    aliases: ['sora', 'sora2', 'sora-2', 'sora2pro', 'openai'],
    grade: 'OpenAI Sora 2 Pro (premium, ~$2.40/clip)',
    emoji: '🎬',
    env: 'SORA_REPLICATE_MODEL',
    fallback: 'openai/sora-2-pro',
    kind: 'video',
  },
  pixverse: {
    id: 'pixverse',
    aliases: ['pixverse', 'pixverse6', 'pixverse-v6'],
    grade: 'PixVerse v6 (physics, fast)',
    emoji: '🎬',
    env: 'PIXVERSE_REPLICATE_MODEL',
    fallback: 'pixverse/pixverse-v6',
    kind: 'video',
  },
  happyhorse: {
    id: 'happyhorse',
    aliases: ['happyhorse', 'happy-horse', 'horse'],
    grade: 'HappyHorse 1.0 (Alibaba)',
    emoji: '🎬',
    env: 'HAPPYHORSE_REPLICATE_MODEL',
    fallback: 'alibaba/happyhorse-1.0',
    kind: 'video',
  },
  hailuo: {
    id: 'hailuo',
    aliases: ['hailuo', 'minimax', 'hailuo23'],
    grade: 'Hailuo 2.3 (realistic human motion)',
    emoji: '🎬',
    env: 'HAILUO_REPLICATE_MODEL',
    fallback: 'minimax/hailuo-2.3',
    kind: 'video',
  },
  // Venice.ai video — own API + own credits (VENICE_API_KEY via /venicekey), never a fallback target.
  // Same family, two tiers: 1080p standard vs 2K "pro". See the note on VeniceVideoProvider above for
  // why this pair is NOT the safe/adult switch that the /imagine pair is.
  venice: {
    id: 'venice',
    aliases: ['venice', 'venicevideo', 'venicevid'],
    grade: 'Venice · Wan 3.0 (720p, vendor-uncensored)',
    emoji: '🎬',
    env: 'VENICE_VIDEO_MODEL',
    fallback: 'wan-3-0-image-to-video',
    kind: 'video',
  },
  venice18: {
    id: 'venice18',
    aliases: ['venice18', 'veniceadult', 'venice-adult', 'venicepro'],
    grade: 'Venice · Wan 3.0 Pro — ADULT LANE (1080p/2K)',
    emoji: '🔞',
    env: 'VENICE_VIDEO_PRO_MODEL',
    fallback: 'wan-3-0-pro-image-to-video',
    kind: 'video',
  },
  deepseek: {
    id: 'deepseek',
    aliases: ['deepseek', 'ds', 'dsflash', 'deepseek-flash'],
    grade: 'DeepSeek video',
    emoji: '🎬',
    env: 'DEEPSEEK_MODEL',
    fallback: 'deepseek-flash',
    kind: 'video',
  },
};

export function videoPinModel(id: VideoProvider): string {
  const pin = VIDEO_PINS[id];
  return envOr(pin.env, pin.fallback);
}

export function parseVideoProvider(token: string): VideoProvider | null {
  const t = token.toLowerCase();
  for (const id of VIDEO_PIN_ORDER) {
    const pin = VIDEO_PINS[id];
    if (pin.id === t || pin.aliases.includes(t)) return id;
  }
  return null;
}

export function providerGrade(id: VideoProvider): string {
  return VIDEO_PINS[id].grade;
}

/** `/visualize luma 048 - 🎬 Luma ray-3.2 …` — menu and help read this, not literals. */
export function visualizeMenuLines(page = '048'): string {
  return VIDEO_PIN_ORDER.map((id) => {
    const p = VIDEO_PINS[id];
    return `/visualize ${id} ${page} - ${p.emoji} ${p.grade}`;
  }).join('\n');
}

export function visualizeHelpLines(page = '052'): string {
  return VIDEO_PIN_ORDER.map((id) => {
    const p = VIDEO_PINS[id];
    return `\`/visualize ${id} ${page}\` → ${p.grade}`;
  }).join('\n');
}

export function visualizeStatusLines(ready: Record<VideoProvider, boolean>): string {
  return VIDEO_PIN_ORDER.map((id) => {
    const p = VIDEO_PINS[id];
    return `${p.emoji} ${p.grade}: ${ready[id] ? '✅ Ready' : '⚪ key missing'}`;
  }).join('\n');
}

export function visualizeCommandDescription(): string {
  return `🎥 Image+video — ${VIDEO_PIN_ORDER.join('|')} 048`;
}
