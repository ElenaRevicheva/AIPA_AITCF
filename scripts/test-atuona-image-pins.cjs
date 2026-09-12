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
ok('video pin luma is still ray-3.2', video.includes("fallback: 'ray-3.2'"));
ok('/visualize luma not rewritten as image', src.includes('parseVideoProvider') && video.includes("id: 'luma'"));
ok('veo/kling/seedance/deepseek stay video-only in video pins',
  video.includes("fallback: 'veo-3.1-generate-preview'")
  && video.includes("fallback: 'kwaivgi/kling-v3-video'")
  && video.includes("fallback: 'bytedance/seedance-2.5'")
  && video.includes("grade: 'DeepSeek video'"));

if (fails.length) {
  console.error(`\nFAILED ${fails.length}:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n${pass} checks passed — Flux untouched, /imagine matches /visualize style`);
