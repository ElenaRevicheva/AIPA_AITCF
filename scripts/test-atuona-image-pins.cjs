#!/usr/bin/env node
/**
 * Contract: Flux ladder stays in creative-ai; /imagine mirrors /visualize style.
 * Video tokens stay video. Run: node scripts/test-atuona-image-pins.cjs
 */
const fs = require('fs');
const path = require('path');
const pins = fs.readFileSync(path.join(__dirname, '..', 'src', 'atuona-image-pins.ts'), 'utf8');
const waterfall = fs.readFileSync(path.join(__dirname, '..', 'src', 'atuona-image-waterfall.ts'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'atuona-creative-ai.ts'), 'utf8');
const video = fs.readFileSync(path.join(__dirname, '..', 'src', 'atuona-video-pins.ts'), 'utf8');
const cto = fs.readFileSync(path.join(__dirname, '..', 'src', 'cto-aipa.ts'), 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
};

ok('luma stills pin is uni-1-max', pins.includes("fallback: 'uni-1-max'"));
ok('gemini stills pin is gemini-3.1-flash-image', pins.includes("fallback: 'gemini-3.1-flash-image'"));
ok('runway stills pin is gen4_image', pins.includes("fallback: 'gen4_image'"));
ok('flux command pin exists', pins.includes("id: 'flux'") && pins.includes("grade: 'Flux 2 Pro'"));
ok('imagine default line style', pins.includes('Image (default: Flux 2 Pro)'));
ok('imagine menu helper', pins.includes('export function imagineMenuLines'));
ok('added pins do not steal ray-3.2', !pins.includes("fallback: 'ray-3.2'"));
ok('added pins do not steal gen4.5 video', !pins.includes("fallback: 'gen4.5'"));
ok('waterfall does not call Flux', !waterfall.includes('flux-2-pro') && !waterfall.includes('tryFlux'));
ok('creative-ai still has Flux 2 Pro ladder', src.includes("flux2Pro: (process.env.FLUX2_MODEL ?? 'black-forest-labs/flux-2-pro').trim()"));
ok('creative-ai still has Flux Ultra id', src.includes("fluxUltra: 'black-forest-labs/flux-1.1-pro-ultra'"));
ok('creative-ai still has Flux Pro id', src.includes("fluxPro: 'black-forest-labs/flux-1.1-pro'"));
ok('creative-ai still has fluxDev', src.includes("fluxDev: 'black-forest-labs/flux-dev'"));
ok('runFluxWithRetry still exists', src.includes('const runFluxWithRetry = async'));
ok('DALL-E /imagine path still present', src.includes("model: 'dall-e-3'"));
ok('imagine parses image provider', src.includes('parseImageProvider'));
ok('imagine page still runner', src.includes('runImaginePageStill'));
ok('menu lists imagine default + engines', src.includes('imagineDefaultLine') && src.includes('imagineMenuLines'));
ok('menu dropped leftover Create AI image one-liner', !src.includes('/imagine - 🎨 Create AI image'));
ok('video pin luma is still ray-3.2', video.includes("fallback: 'ray-3.2'"));
ok('/visualize luma not rewritten as image', src.includes('parseVideoProvider') && video.includes("id: 'luma'"));
ok('veo/kling/seedance/deepseek stay video-only in video pins',
  video.includes("fallback: 'veo-3.1-generate-preview'")
  && video.includes("fallback: 'kwaivgi/kling-v3-video'")
  && video.includes("fallback: 'bytedance/seedance-2.5'")
  && video.includes("grade: 'DeepSeek video'"));
ok('extractGeminiInlineImage exported', waterfall.includes('export function extractGeminiInlineImage'));
ok('Gemini no longer skips inline bytes', !waterfall.includes('inline bytes only — skipped'));
ok('Gemini persist uses shotsDir not pageId.mp4', waterfall.includes('persistGeminiStillBytes') && waterfall.includes('shotsDir()'));
ok('imagine sends InputFile when Gemini returns bytes', src.includes('function photoFromStill') && src.includes('still.bytes'));
ok('shots route serves jpg/png stills', cto.includes('shotContentType') && cto.includes('image/jpeg'));
ok('inline extractor reads camel and snake case', waterfall.includes('part?.inlineData || part?.inline_data'));

function extractGeminiImageUrl(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const uri = part?.fileData?.fileUri || part?.file_data?.file_uri;
    if (typeof uri === 'string' && /^https?:\/\//i.test(uri.trim())) return uri.trim();
  }
  return null;
}
function extractGeminiInlineImage(payload) {
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
const pixelBytes = Buffer.alloc(40, 7);
const pixelB64 = pixelBytes.toString('base64');
const inlineOnly = {
  candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: pixelB64 } }] } }],
};
const snakeOnly = {
  candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: pixelB64 } }] } }],
};
const fileUriOnly = {
  candidates: [{ content: { parts: [{ fileData: { fileUri: 'https://example.com/still.png' } }] } }],
};
ok('url extractor rejects inline-only (not a public URL)', extractGeminiImageUrl(inlineOnly) === null);
ok('inline extractor returns png bytes', (() => {
  const got = extractGeminiInlineImage(inlineOnly);
  return !!(got && got.mime === 'image/png' && got.bytes.equals(pixelBytes));
})());
ok('inline extractor accepts snake_case inline_data', extractGeminiInlineImage(snakeOnly)?.mime === 'image/jpeg');
ok('url extractor still accepts fileUri', extractGeminiImageUrl(fileUriOnly) === 'https://example.com/still.png');

if (fails.length) {
  console.error(`\nFAILED ${fails.length}:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n${pass} checks passed — Flux untouched, /imagine matches /visualize style`);
