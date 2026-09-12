/**
 * Additive stills — Luma / Gemini / Runway after the existing Flux ladder.
 * Does not call Flux. `/visualize luma` stays video.
 *
 * Gemini 3.1 Flash Image returns inline base64, not a public fileUri.
 * Persist those bytes (do not skip) and hand them to Telegram as InputFile.
 */
import fs from 'fs';
import path from 'path';
import { shotsDir } from './atuona-film-compiler';
import {
  imagePinGrade,
  imagePinModel,
  imageWaterfallPlan,
  type AddedImageProvider,
} from './atuona-image-pins';

export { imageWaterfallPlan };

export type ImageGenResult = {
  url: string;
  modelUsed: string;
  grade: string;
  bytes?: Buffer;
  mime?: string;
  filename?: string;
};

export type GeminiInlineImage = {
  bytes: Buffer;
  mime: string;
};

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

function urlFromUnknown(v: unknown): string | null {
  if (isHttpUrl(v)) return v.trim();
  if (v && typeof v === 'object') {
    const o = v as { url?: unknown; uri?: unknown; href?: unknown };
    if (isHttpUrl(o.url)) return String(o.url).trim();
    if (isHttpUrl(o.uri)) return String(o.uri).trim();
    if (isHttpUrl(o.href)) return String(o.href).trim();
  }
  return null;
}

export function extractLumaImageUrl(statusData: any): string | null {
  const fromAsset = urlFromUnknown(statusData?.assets?.image);
  if (fromAsset) return fromAsset;
  const images = statusData?.assets?.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      const u = urlFromUnknown(img);
      if (u) return u;
    }
  }
  const out = statusData?.output;
  if (Array.isArray(out)) {
    const typed = out.find((o: any) => o?.type === 'image');
    const fromTyped = urlFromUnknown(typed) || urlFromUnknown(typed?.url);
    if (fromTyped) return fromTyped;
    for (const item of out) {
      const u = urlFromUnknown(item);
      if (u) return u;
    }
  }
  return urlFromUnknown(out) || urlFromUnknown(statusData?.image) || urlFromUnknown(statusData?.url);
}

export function extractRunwayImageUrl(task: any): string | null {
  const out = task?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const u = urlFromUnknown(item);
      if (u) return u;
    }
  }
  return urlFromUnknown(out) || urlFromUnknown(task?.artifacts?.[0]) || urlFromUnknown(task?.url);
}

export function extractGeminiImageUrl(payload: any): string | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const uri = part?.fileData?.fileUri || part?.file_data?.file_uri;
    if (isHttpUrl(uri)) return String(uri).trim();
  }
  return null;
}

/** Flash Image returns `inlineData` / `inline_data`. A missing fileUri is not a miss. */
export function extractGeminiInlineImage(payload: any): GeminiInlineImage | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const data = inline?.data;
    if (typeof data !== 'string' || data.length < 32) continue;
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length < 32) continue;
    const mime = String(inline?.mimeType || inline?.mime_type || 'image/jpeg');
    return { bytes, mime };
  }
  return null;
}

function extFromMime(mime: string): 'jpg' | 'png' | 'webp' {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

function safeStillStem(stem: string | undefined): string {
  const cleaned = (stem || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
  return cleaned || `gemini-${Date.now()}`;
}

function stillPublicUrl(filename: string): string {
  const base = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
  const key = process.env.ATUONA_FILMS_KEY?.trim();
  const q = key ? `?key=${encodeURIComponent(key)}` : '';
  return `${base}/films/shots/${encodeURIComponent(filename)}${q}`;
}

/** Write Gemini stills next to video shots. Never overwrite `{pageId}.mp4`. */
export function persistGeminiStillBytes(
  buf: Buffer,
  mime: string,
  stem?: string
): { url: string; filename: string } {
  const filename = `${safeStillStem(stem)}.${extFromMime(mime)}`;
  const dest = path.join(shotsDir(), filename);
  fs.writeFileSync(dest, buf);
  console.log(`🎨 persistGeminiStill ${filename}: saved ${(buf.length / 1e6).toFixed(2)}MB → ${dest}`);
  return { url: stillPublicUrl(filename), filename };
}

export function runwayRatioForAspect(aspectRatio: string): string {
  if (aspectRatio === '9:16') return '1080:1920';
  if (aspectRatio === '1:1') return '1080:1080';
  return '1920:1080';
}

async function tryLumaImage(opts: {
  lumaApiUrl: string;
  lumaApiKey: string;
  prompt: string;
  aspectRatio: string;
}): Promise<ImageGenResult> {
  const model = imagePinModel('luma');
  const create = await fetch(`${opts.lumaApiUrl}/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.lumaApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      type: 'image',
      prompt: opts.prompt.slice(0, 6000),
      aspect_ratio: opts.aspectRatio,
      output_format: 'jpeg',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const createText = await create.text();
  if (!create.ok) {
    throw new Error(`Luma image ${create.status}: ${createText.slice(0, 200)}`);
  }
  const created = JSON.parse(createText);
  const id = created?.id;
  if (!id) throw new Error('Luma image: no generation id');

  for (let attempt = 1; attempt <= 12; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 1 ? 4000 : 5000));
    const poll = await fetch(`${opts.lumaApiUrl}/generations/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${opts.lumaApiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(55_000),
    });
    if (!poll.ok) continue;
    const status: any = await poll.json();
    const state = String(status?.state || status?.status || '').toLowerCase();
    if (state === 'completed' || state === 'succeeded') {
      const url = extractLumaImageUrl(status);
      if (url) {
        return { url, modelUsed: imagePinGrade('luma'), grade: imagePinGrade('luma') };
      }
      throw new Error('Luma image completed with no URL');
    }
    if (state === 'failed' || state === 'error') {
      throw new Error(`Luma image failed: ${String(status?.failure_reason || status?.failure || state)}`);
    }
  }
  throw new Error('Luma image timed out');
}

async function tryGeminiImage(opts: {
  geminiApiKey: string;
  prompt: string;
  aspectRatio: string;
  persistStem?: string;
}): Promise<ImageGenResult> {
  const model = imagePinModel('omni');
  const grade = imagePinGrade('omni');
  const url = `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.geminiApiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: opts.aspectRatio },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Gemini image ${resp.status}: ${text.slice(0, 200)}`);
  }
  const payload = JSON.parse(text);
  const imageUrl = extractGeminiImageUrl(payload);
  if (imageUrl) {
    return { url: imageUrl, modelUsed: grade, grade };
  }
  const inline = extractGeminiInlineImage(payload);
  if (!inline) {
    throw new Error('Gemini image returned no image parts');
  }
  const saved = persistGeminiStillBytes(inline.bytes, inline.mime, opts.persistStem);
  return {
    url: saved.url,
    modelUsed: grade,
    grade,
    bytes: inline.bytes,
    mime: inline.mime,
    filename: saved.filename,
  };
}

async function tryRunwayImage(opts: {
  runwayApiKey: string;
  prompt: string;
  aspectRatio: string;
}): Promise<ImageGenResult> {
  const model = imagePinModel('runway');
  const create = await fetch(`${RUNWAY_API_URL}/text_to_image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.runwayApiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model,
      promptText: opts.prompt.slice(0, 1000),
      ratio: runwayRatioForAspect(opts.aspectRatio),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const createText = await create.text();
  if (!create.ok) {
    throw new Error(`Runway image ${create.status}: ${createText.slice(0, 200)}`);
  }
  const created = JSON.parse(createText);
  const taskId = created?.id;
  if (!taskId) throw new Error('Runway image: no task id');

  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 1 ? 8000 : 6000));
    const poll = await fetch(`${RUNWAY_API_URL}/tasks/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${opts.runwayApiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!poll.ok) continue;
    const task: any = await poll.json();
    const status = String(task?.status || '').toUpperCase();
    if (status === 'SUCCEEDED') {
      const imageUrl = extractRunwayImageUrl(task);
      if (imageUrl) {
        return { url: imageUrl, modelUsed: imagePinGrade('runway'), grade: imagePinGrade('runway') };
      }
      throw new Error('Runway image succeeded with no URL');
    }
    if (status === 'FAILED') {
      throw new Error(`Runway image failed: ${String(task?.failure || 'unknown')}`);
    }
  }
  throw new Error('Runway image timed out');
}

export type AddedImageDeps = {
  prompt: string;
  aspectRatio: string;
  lumaApiKey: string | null;
  lumaApiUrl: string;
  runwayApiKey: string | null;
  geminiApiKey: string | null;
  /** `/imagine luma 048` — that vendor only. Flux is the unpaid fallback, not Omni/Runway. */
  prefer?: AddedImageProvider;
  /** Optional shots/ filename stem, e.g. `099-still`. Never `{pageId}` alone (that is the mp4). */
  persistStem?: string;
};

/** Named `/imagine luma` is Luma only. No prefer = Luma → Omni → Runway after Flux misses. */
export function addedImageTryOrder(prefer?: AddedImageProvider): AddedImageProvider[] {
  const all: AddedImageProvider[] = ['luma', 'omni', 'runway'];
  if (prefer && all.includes(prefer)) return [prefer];
  return all;
}

export type AddedImageAttempt = {
  result: ImageGenResult | null;
  miss: string | null;
};

function keyMissing(id: AddedImageProvider): string {
  if (id === 'luma') return 'LUMA_API_KEY missing';
  if (id === 'omni') return 'GEMINI_API_KEY missing';
  return 'RUNWAY_API_KEY missing';
}

/** Luma / Gemini / Runway only. Flux is not in this function. */
export async function runAddedImageProvidersDetailed(deps: AddedImageDeps): Promise<AddedImageAttempt> {
  const order = addedImageTryOrder(deps.prefer);
  let miss: string | null = null;

  for (const id of order) {
    try {
      if (id === 'luma') {
        if (!deps.lumaApiKey) { miss = keyMissing(id); continue; }
        console.log('Trying Luma stills (additive)...');
        return {
          result: await tryLumaImage({
            lumaApiUrl: deps.lumaApiUrl,
            lumaApiKey: deps.lumaApiKey,
            prompt: deps.prompt,
            aspectRatio: deps.aspectRatio,
          }),
          miss: null,
        };
      }
      if (id === 'omni') {
        if (!deps.geminiApiKey) { miss = keyMissing(id); continue; }
        console.log('Trying Gemini Flash Image (additive)...');
        return {
          result: await tryGeminiImage({
            geminiApiKey: deps.geminiApiKey,
            prompt: deps.prompt,
            aspectRatio: deps.aspectRatio,
            ...(deps.persistStem ? { persistStem: deps.persistStem } : {}),
          }),
          miss: null,
        };
      }
      if (id === 'runway') {
        if (!deps.runwayApiKey) { miss = keyMissing(id); continue; }
        console.log('Trying Runway Gen-4 Image (additive)...');
        return {
          result: await tryRunwayImage({
            runwayApiKey: deps.runwayApiKey,
            prompt: deps.prompt,
            aspectRatio: deps.aspectRatio,
          }),
          miss: null,
        };
      }
    } catch (err: any) {
      miss = String(err?.message || `${id} stills unavailable`);
      console.log(`${id} stills unavailable...`, miss);
    }
  }

  return { result: null, miss };
}

export async function runAddedImageProviders(deps: AddedImageDeps): Promise<ImageGenResult | null> {
  const { result } = await runAddedImageProvidersDetailed(deps);
  return result;
}
