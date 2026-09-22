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

export type VideoProvider = 'luma' | 'omni' | 'runway' | 'veo' | 'kling' | 'seedance' | 'wan' | 'grok' | 'deepseek';

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
