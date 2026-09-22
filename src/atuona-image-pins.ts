import * as dotenv from 'dotenv';
dotenv.config({ override: true });

/**
 * Additive stills pins + /imagine commands.
 *
 * `/visualize luma 048` stays VIDEO. Image commands are `/imagine …`.
 * Flux ladder in IMAGE_MODELS / runFluxWithRetry is unchanged.
 *
 * Veo / Kling-video / Seedance have no stills API on our keys.
 * DeepSeek has no pixel renderer — Flash already writes the image prompt.
 */

/** Stills engines on Replicate, added 22 Sep 2026 (newest per vendor, checked live that day). Named-only: a miss falls back to Flux. */
export type ReplicateImageProvider =
  'seedream' | 'gpt' | 'grok' | 'nanopro' | 'imagen4' | 'ideogram' | 'qwen' | 'wan' | 'hunyuan';
/** Venice.ai: its own API, not Replicate. `venice18` sends the vendor's documented safe_mode:false (adult work is a
 *  feature of that product, on Elena's own account) — a separate command so it is never picked by accident. */
export type VeniceImageProvider = 'venice' | 'venice18';
export type ImageCommandProvider = 'flux' | 'luma' | 'omni' | 'runway' | ReplicateImageProvider | VeniceImageProvider;
export type AddedImageProvider = 'luma' | 'omni' | 'runway';

export type ImagePin = {
  id: ImageCommandProvider;
  aliases: readonly string[];
  grade: string;
  emoji: string;
  env: string;
  fallback: string;
  kind: 'image';
};

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v.trim() !== '' ? v.trim() : fallback;
}

/** Same vendor order as video, Flux first (default stills). */
export const IMAGE_PIN_ORDER: readonly ImageCommandProvider[] = [
  'flux', 'luma', 'omni', 'runway',
  'seedream', 'gpt', 'grok', 'nanopro', 'imagen4', 'ideogram', 'qwen', 'wan', 'hunyuan',
  'venice', 'venice18',
];

export const REPLICATE_IMAGE_IDS: readonly ReplicateImageProvider[] =
  ['seedream', 'gpt', 'grok', 'nanopro', 'imagen4', 'ideogram', 'qwen', 'wan', 'hunyuan'];

export const VENICE_IMAGE_IDS: readonly VeniceImageProvider[] = ['venice', 'venice18'];
export function isVeniceImageProvider(id: string | null | undefined): id is VeniceImageProvider {
  return id === 'venice' || id === 'venice18';
}

export function isReplicateImageProvider(id: string | null | undefined): id is ReplicateImageProvider {
  return !!id && (REPLICATE_IMAGE_IDS as readonly string[]).includes(id);
}

/**
 * Input for each Replicate stills model — prompt, frame shape, size and format ONLY.
 * Every safety / moderation knob a model exposes (disable_safety_checker, moderation, safety_filter_level)
 * is deliberately left at the vendor default. Schemas read from the Replicate model API on 22 Sep 2026.
 */
export function replicateImageInput(id: ReplicateImageProvider, prompt: string, aspectRatio: string): Record<string, unknown> {
  const portrait = aspectRatio === '9:16';
  switch (id) {
    case 'seedream': return { prompt, aspect_ratio: aspectRatio, size: '2K', output_format: 'jpeg' };
    case 'gpt': return { prompt, aspect_ratio: aspectRatio, quality: 'high', output_format: 'jpeg' };
    case 'grok': return { prompt, aspect_ratio: aspectRatio, resolution: '2k', quality: 'medium' };
    case 'nanopro': return { prompt, aspect_ratio: aspectRatio, resolution: '2K', output_format: 'jpg' };
    case 'imagen4': return { prompt, aspect_ratio: aspectRatio, image_size: '2K', output_format: 'jpg' };
    case 'ideogram': return { prompt, resolution: portrait ? '1440x2560' : '2560x1440' };
    case 'qwen': return { prompt, aspect_ratio: aspectRatio, output_format: 'jpg' };
    case 'wan': return { prompt, size: portrait ? '1152*2048' : '2048*1152' };
    case 'hunyuan': return { prompt, aspect_ratio: aspectRatio, output_format: 'jpg' };
  }
}

export const IMAGE_PINS: Record<ImageCommandProvider, ImagePin> = {
  flux: {
    id: 'flux',
    aliases: ['flux', 'flux2', 'flux-2', 'bfl'],
    grade: 'Flux 2 Max',
    emoji: '🎨',
    env: 'FLUX2_MODEL',
    fallback: 'black-forest-labs/flux-2-max',
    kind: 'image',
  },
  luma: {
    id: 'luma',
    aliases: ['luma', 'uni', 'uni1', 'uni-1', 'photon'],
    grade: 'Luma uni-1-max',
    emoji: '🎨',
    env: 'LUMA_IMAGE_MODEL',
    fallback: 'uni-1-max',
    kind: 'image',
  },
  omni: {
    id: 'omni',
    aliases: ['omni', 'gemini', 'imagen', 'nano-banana'],
    grade: 'Gemini 3.1 Flash Image',
    emoji: '🎨',
    env: 'GEMINI_IMAGE_MODEL',
    fallback: 'gemini-3.1-flash-image',
    kind: 'image',
  },
  runway: {
    id: 'runway',
    aliases: ['runway', 'gen4image', 'gen4_image'],
    grade: 'Runway Gen-4 Image',
    emoji: '🎨',
    env: 'RUNWAY_IMAGE_MODEL',
    fallback: 'gen4_image',
    kind: 'image',
  },
  // ---- Replicate stills, added 22 Sep 2026. Aliases never reuse an older engine's alias (omni keeps 'imagen', 'nano-banana').
  seedream: { id: 'seedream', aliases: ['seedream', 'seedream5', 'bytedance'], grade: 'Seedream 5 Pro (ByteDance)',
    emoji: '🎨', env: 'SEEDREAM_IMAGE_MODEL', fallback: 'bytedance/seedream-5-pro', kind: 'image' },
  gpt: { id: 'gpt', aliases: ['gpt', 'gptimage', 'gpt-image', 'gpt-image-2', 'openai'], grade: 'GPT Image 2 (OpenAI)',
    emoji: '🎨', env: 'GPT_IMAGE_MODEL', fallback: 'openai/gpt-image-2', kind: 'image' },
  grok: { id: 'grok', aliases: ['grok', 'grokimage', 'xai'], grade: 'Grok Imagine Image 2 (xAI)',
    emoji: '🎨', env: 'GROK_IMAGE_MODEL', fallback: 'xai/grok-imagine-image-2', kind: 'image' },
  nanopro: { id: 'nanopro', aliases: ['nanopro', 'nano-banana-pro', 'nanobananapro', 'gemini3pro'], grade: 'Nano Banana Pro (Google)',
    emoji: '🎨', env: 'NANO_PRO_IMAGE_MODEL', fallback: 'google/nano-banana-pro', kind: 'image' },
  imagen4: { id: 'imagen4', aliases: ['imagen4', 'imagen-4', 'imagen4ultra'], grade: 'Imagen 4 Ultra (Google)',
    emoji: '🎨', env: 'IMAGEN_IMAGE_MODEL', fallback: 'google/imagen-4-ultra', kind: 'image' },
  ideogram: { id: 'ideogram', aliases: ['ideogram', 'ideogram4'], grade: 'Ideogram v4 Quality',
    emoji: '🎨', env: 'IDEOGRAM_IMAGE_MODEL', fallback: 'ideogram-ai/ideogram-v4-quality', kind: 'image' },
  qwen: { id: 'qwen', aliases: ['qwen', 'qwenimage'], grade: 'Qwen Image 2512 (realistic people)',
    emoji: '🎨', env: 'QWEN_IMAGE_MODEL', fallback: 'qwen/qwen-image-2512', kind: 'image' },
  wan: { id: 'wan', aliases: ['wan', 'wanimage', 'wan-image'], grade: 'Wan 2.7 Image Pro (Alibaba)',
    emoji: '🎨', env: 'WAN_IMAGE_MODEL', fallback: 'wan-video/wan-2.7-image-pro', kind: 'image' },
  hunyuan: { id: 'hunyuan', aliases: ['hunyuan', 'tencent'], grade: 'Hunyuan Image 3 (Tencent)',
    emoji: '🎨', env: 'HUNYUAN_IMAGE_MODEL', fallback: 'tencent/hunyuan-image-3', kind: 'image' },
  // Venice.ai — its own API (VENICE_API_KEY, /venicekey). Adult work is permitted by that vendor's product;
  // `venice18` flips their own safe_mode switch. Never a fallback target: both are named-only.
  venice: { id: 'venice', aliases: ['venice', 'venicesafe'], grade: 'Venice SD3.5 (safe mode on)',
    emoji: '🎨', env: 'VENICE_IMAGE_MODEL', fallback: 'venice-sd35', kind: 'image' },
  venice18: { id: 'venice18', aliases: ['venice18', 'veniceadult', 'venice-adult'], grade: 'Venice SD3.5 — ADULT (safe mode off)',
    emoji: '🔞', env: 'VENICE_IMAGE_MODEL', fallback: 'venice-sd35', kind: 'image' },
};

export function imagePinModel(id: ImageCommandProvider): string {
  const pin = IMAGE_PINS[id];
  if (id === 'flux' && process.env.FLUX2_MODEL !== undefined) {
    return process.env.FLUX2_MODEL.trim();
  }
  return envOr(pin.env, pin.fallback);
}

export function imagePinGrade(id: ImageCommandProvider): string {
  return IMAGE_PINS[id].grade;
}

export function parseImageProvider(token: string): ImageCommandProvider | null {
  const t = token.toLowerCase();
  for (const id of IMAGE_PIN_ORDER) {
    const pin = IMAGE_PINS[id];
    if (pin.id === t || pin.aliases.includes(t)) return id;
  }
  return null;
}

export function imageWaterfallPlan(ready: {
  luma: boolean;
  gemini: boolean;
  runway: boolean;
}): string[] {
  const steps: string[] = [];
  if (ready.luma) steps.push('luma');
  if (ready.gemini) steps.push('omni');
  if (ready.runway) steps.push('runway');
  return steps;
}

export function imageStatusLines(ready: Record<AddedImageProvider, boolean>): string {
  return (['luma', 'omni', 'runway'] as const).map((id) => {
    const p = IMAGE_PINS[id];
    return `${p.emoji} ${p.grade}: ${ready[id] ? '✅ Ready' : '⚪ key missing'}`;
  }).join('\n');
}

export function imageHelpLine(): string {
  return (['luma', 'omni', 'runway'] as const).map((id) => IMAGE_PINS[id].grade).join(' → ');
}

/** `/imagine 048 - 🎨 Image (default: Flux 2 Max)` then per-engine lines. */
export function imagineDefaultLine(page = '048'): string {
  return `/imagine ${page} - 🎨 Image (default: ${IMAGE_PINS.flux.grade})`;
}

export function imagineMenuLines(page = '048'): string {
  return IMAGE_PIN_ORDER.map((id) => {
    const p = IMAGE_PINS[id];
    return `/imagine ${id} ${page} - ${p.emoji} ${p.grade}`;
  }).join('\n');
}

export function imagineHelpLines(page = '048'): string {
  return IMAGE_PIN_ORDER.map((id) => {
    const p = IMAGE_PINS[id];
    return `\`/imagine ${id} ${page}\` → ${p.grade}`;
  }).join('\n');
}

export function imagineCommandDescription(): string {
  return `🎨 Image — ${IMAGE_PIN_ORDER.join('|')} 048`;
}
