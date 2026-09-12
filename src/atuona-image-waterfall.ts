/**
 * Additive stills — Luma / Gemini / Runway after the existing Flux ladder.
 * Does not call Flux. `/visualize luma` stays video.
 */
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
};

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

export function extractLumaImageUrl(statusData: any): string | null {
  const asset = statusData?.assets?.image;
  if (isHttpUrl(asset)) return asset.trim();
  const out = statusData?.output;
  if (Array.isArray(out)) {
    const img =
      out.find((o: any) => o?.type === 'image' && isHttpUrl(o?.url)) ||
      out.find((o: any) => isHttpUrl(o?.url));
    if (img?.url) return String(img.url).trim();
    const first = out[0];
    if (isHttpUrl(first)) return first.trim();
  }
  if (isHttpUrl(out)) return String(out).trim();
  return null;
}

export function extractRunwayImageUrl(task: any): string | null {
  const out = task?.output;
  if (Array.isArray(out) && isHttpUrl(out[0])) return String(out[0]).trim();
  if (isHttpUrl(out)) return String(out).trim();
  return null;
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
}): Promise<ImageGenResult> {
  const model = imagePinModel('omni');
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
  if (!imageUrl) {
    throw new Error('Gemini image returned no public URL (inline bytes only — skipped)');
  }
  return { url: imageUrl, modelUsed: imagePinGrade('omni'), grade: imagePinGrade('omni') };
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
  /** `/imagine luma 048` — try this vendor first, then the rest. */
  prefer?: AddedImageProvider;
};

/** Luma uni-1-max → Gemini Flash Image → Runway gen4_image. Flux is not in this function. */
export async function runAddedImageProviders(deps: AddedImageDeps): Promise<ImageGenResult | null> {
  let order: AddedImageProvider[] = ['luma', 'omni', 'runway'];
  if (deps.prefer && order.includes(deps.prefer)) {
    order = [deps.prefer, ...order.filter((id) => id !== deps.prefer)];
  }

  for (const id of order) {
    try {
      if (id === 'luma' && deps.lumaApiKey) {
        console.log('Trying Luma stills (additive)...');
        return await tryLumaImage({
          lumaApiUrl: deps.lumaApiUrl,
          lumaApiKey: deps.lumaApiKey,
          prompt: deps.prompt,
          aspectRatio: deps.aspectRatio,
        });
      }
      if (id === 'omni' && deps.geminiApiKey) {
        console.log('Trying Gemini Flash Image (additive)...');
        return await tryGeminiImage({
          geminiApiKey: deps.geminiApiKey,
          prompt: deps.prompt,
          aspectRatio: deps.aspectRatio,
        });
      }
      if (id === 'runway' && deps.runwayApiKey) {
        console.log('Trying Runway Gen-4 Image (additive)...');
        return await tryRunwayImage({
          runwayApiKey: deps.runwayApiKey,
          prompt: deps.prompt,
          aspectRatio: deps.aspectRatio,
        });
      }
    } catch (err: any) {
      console.log(`${id} stills unavailable...`, err?.message);
    }
  }

  return null;
}
