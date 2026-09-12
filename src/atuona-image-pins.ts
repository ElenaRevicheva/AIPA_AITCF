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

export type ImageCommandProvider = 'flux' | 'luma' | 'omni' | 'runway';
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
export const IMAGE_PIN_ORDER: readonly ImageCommandProvider[] = ['flux', 'luma', 'omni', 'runway'];

export const IMAGE_PINS: Record<ImageCommandProvider, ImagePin> = {
  flux: {
    id: 'flux',
    aliases: ['flux', 'flux2', 'flux-2', 'bfl'],
    grade: 'Flux 2 Pro',
    emoji: '🎨',
    env: 'FLUX2_MODEL',
    fallback: 'black-forest-labs/flux-2-pro',
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

/** `/imagine 048 - 🎨 Image (default: Flux 2 Pro)` then per-engine lines. */
export function imagineDefaultLine(page = '048'): string {
  return `/imagine ${page} - 🎨 Image (default: Flux 2 Pro)`;
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
