#!/usr/bin/env node
/**
 * podcast-hero-atuona.cjs — one-off: render the podcast.aideazz.xyz hero + cover stills through the
 * EXISTING Atuona image machinery: the Luma image pin (dist/atuona-image-pins.js → uni-1-max, prepaid
 * credits) on Luma's own API, and the dist/atuona-image-waterfall.js runner for any other engine.
 *
 * Why not the waterfall for Luma too: its poll budget is ~60 s (the Telegram reply budget) and a Luma
 * image generation on this account takes longer than that — the first run was billed and then timed out.
 * Here Luma gets up to 8 minutes per still. Same model, same endpoint, same key.
 *
 * Runs on Oracle (keys live in ~/cto-aipa/.env). Writes ~/cto-aipa/shots/podcast-<stem>.jpg and prints one
 * JSON line per image: {stem, model, id, url, file, bytes}.
 *
 *   cd ~/cto-aipa && node scripts/podcast-hero-atuona.cjs                 # luma (default)
 *   cd ~/cto-aipa && node scripts/podcast-hero-atuona.cjs --only=hero-wide
 *   cd ~/cto-aipa && node scripts/podcast-hero-atuona.cjs --prefer=runway  # waterfall, Runway pin
 */
const fs = require('fs');
const path = require('path');
const HOME = process.env.HOME || '';
require('dotenv').config({ path: path.join(HOME, 'cto-aipa', '.env') });

const { runAddedImageProvidersDetailed, extractLumaImageUrl } = require(path.join(HOME, 'cto-aipa', 'dist', 'atuona-image-waterfall.js'));
const { imagePinModel, imagePinGrade } = require(path.join(HOME, 'cto-aipa', 'dist', 'atuona-image-pins.js'));

const prefer = (process.argv.find((a) => a.startsWith('--prefer=')) || '--prefer=luma').split('=')[1];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

// v2, 29 Oct 2026 (Elena): no lone tree — too close to hud.ai's sign-in art. The subject is OURS: a 1930s broadcasting
// house, the kind of building Ayn Rand would have put on a plaza, shot with a 2026 eye (restraint, grain, dither).
const SCENE =
  'Analog 35mm film photograph, heavy visible film grain, soft dithered halftone texture, faded muted palette: ' +
  'cream and sepia haze with a soft violet-lilac dusk sky and a thin band of warm gold light on the horizon. ' +
  'A monumental 1930s Art Deco radio broadcasting house on a wide empty plaza: streamlined limestone facade, tall ' +
  'vertical fluted pillars, stepped setbacks, a great round clock, a slender steel radio mast rising from the roof ' +
  'with one small warm beacon glowing at its tip, long shadows across the stone, heroic low angle, the spirit of ' +
  'Atlas Shrugged rendered with quiet 2026 restraint, nostalgic, calm, minimal, generous empty sky. ' +
  'No text, no letters, no signage, no logos, no people, no cars, no watermark.';

const SHOTS = [
  { stem: 'hero-wide', aspectRatio: '16:9', prompt: SCENE + ' Wide cinematic composition, the building on the right third, plaza and horizon in the lower third, open sky left.' },
  { stem: 'cover-square', aspectRatio: '1:1', prompt: SCENE + ' Square composition, the building centered low, the mast rising into generous empty sky above it.' },
];

const LUMA_URL = (process.env.LUMA_API_BASE || 'https://agents.lumalabs.ai/v1').trim().replace(/\/$/, '');
function lumaHeaders() {
  return { Authorization: `Bearer ${process.env.LUMA_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}
// Luma returns the still as output[0].url — the waterfall's extractor knows every shape; reuse it.
function lumaImageUrl(g) { return extractLumaImageUrl(g); }

/** Same request the Atuona waterfall sends (model pin, type image, jpeg) — patient poll. */
async function lumaStill(prompt, aspectRatio) {
  const model = imagePinModel('luma');
  const create = await fetch(`${LUMA_URL}/generations`, {
    method: 'POST', headers: lumaHeaders(),
    body: JSON.stringify({ model, type: 'image', prompt: prompt.slice(0, 6000), aspect_ratio: aspectRatio, output_format: 'jpeg' }),
    signal: AbortSignal.timeout(120000),
  });
  const txt = await create.text();
  if (!create.ok) throw new Error(`Luma image ${create.status}: ${txt.slice(0, 200)}`);
  const id = JSON.parse(txt).id;
  if (!id) throw new Error('Luma image: no generation id');
  console.log(`Luma ${model} generation ${id} created (${aspectRatio})`);
  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 6000));
    const poll = await fetch(`${LUMA_URL}/generations/${encodeURIComponent(id)}`, { headers: lumaHeaders(), signal: AbortSignal.timeout(55000) });
    if (!poll.ok) continue;
    const g = await poll.json();
    const state = String(g.state || g.status || '').toLowerCase();
    if (state === 'completed' || state === 'succeeded') {
      const url = lumaImageUrl(g);
      if (!url) throw new Error('Luma image completed with no URL');
      return { url, id, modelUsed: imagePinGrade('luma') };
    }
    if (state === 'failed' || state === 'error') throw new Error(`Luma image failed: ${g.failure_reason || state}`);
    process.stdout.write(`  ${state || 'queued'} ${Math.round((Date.now() - started) / 1000)}s\n`);
  }
  throw new Error(`Luma image ${id} still not done after 8 min`);
}

async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}

(async () => {
  const outDir = path.join(HOME, 'cto-aipa', 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  for (const shot of SHOTS) {
    if (only && shot.stem !== only) continue;
    let result = null;
    let miss = null;
    try {
      if (prefer === 'luma') {
        if (!process.env.LUMA_API_KEY) throw new Error('LUMA_API_KEY missing');
        result = await lumaStill(shot.prompt, shot.aspectRatio);
      } else {
        const r = await runAddedImageProvidersDetailed({
          prompt: shot.prompt,
          aspectRatio: shot.aspectRatio,
          lumaApiKey: process.env.LUMA_API_KEY || null,
          lumaApiUrl: LUMA_URL,
          runwayApiKey: process.env.RUNWAY_API_KEY || null,
          geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null,
          prefer,
          persistStem: `podcast-${shot.stem}`,
        });
        result = r.result; miss = r.miss;
      }
    } catch (e) { miss = e.message; }
    if (!result) {
      console.log(JSON.stringify({ stem: shot.stem, error: miss }));
      process.exitCode = 2;
      continue;
    }
    const file = path.join(outDir, `podcast-${shot.stem}.jpg`);
    let bytes;
    if (result.bytes) { fs.writeFileSync(file, result.bytes); bytes = result.bytes.length; }
    else bytes = await download(result.url, file);
    console.log(JSON.stringify({ stem: shot.stem, model: result.modelUsed, id: result.id || null, url: result.url, file, bytes }));
  }
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
