#!/usr/bin/env node
/**
 * test-chain-vision.cjs — screenshots go through the same model waterfall as text.
 *
 *   npm run build && node scripts/test-chain-vision.cjs [path/to/dist/llm-resilience.js]
 *   (run where the API keys are: Oracle ~/cto-aipa, with its .env)
 *
 * WHY (12 Oct 2026). Elena sent the bot a screenshot and got "⚠️ Image analysis temporarily unavailable (API
 * credits)": vision called Claude directly — at a zero balance — while OpenAI and Gemini, both able to see
 * images, were never asked. The chain now carries an optional image. This proves, with a real 8x8 red PNG:
 *   1. Gemini sees it (free).
 *   2. The 'quality' chain answers it while Claude is out of credit (one small paid OpenAI call at most).
 *   3. Fail-closed: with no vision-capable key, the call THROWS — groq and grok refuse ("no vision") instead of
 *      describing a picture they never saw.
 */
'use strict';
const path = require('path');
const zlib = require('zlib');
try { require('dotenv').config(); } catch { /* keys may already be in env */ }

const mod = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'llm-resilience.js')));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function redPng(size = 8) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0).fill(Buffer.from([255, 0, 0]))]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const image = { base64: redPng().toString('base64'), mime: 'image/png' };
const ASK = 'What single colour fills this image? Answer with one word.';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

(async () => {
  // 1. Gemini directly (free tier)
  try {
    const t = await mod.geminiComplete(null, ASK, 300, 'test/vision', undefined, image);
    check('Gemini sees the red image', /red|rojo|красн/i.test(t), JSON.stringify(t.slice(0, 40)));
  } catch (e) { check('Gemini sees the red image', false, e.message.slice(0, 120)); }

  // 2. The 'quality' chain — Claude first; at a zero balance it must fall through to a vision-capable provider.
  try {
    const r = await mod.completeWithProfileDetailed('quality', null, ASK, 300, 'test/vision', image);
    check('quality chain answers an image', /red|rojo|красн/i.test(r.text), `${r.provider} after [${r.skipped.join(' | ').slice(0, 160)}]`);
  } catch (e) { check('quality chain answers an image', false, e.message.slice(0, 200)); }

  // 3. Fail-closed: no vision-capable key → throw, never a text-only guess.
  const saved = {};
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    const r = await mod.completeWithProfileDetailed('quality', null, ASK, 300, 'test/vision', image);
    check('no vision key → refuses (never a blind guess)', false, `answered by ${r.provider}: ${r.text.slice(0, 40)}`);
  } catch (e) {
    check('no vision key → refuses (never a blind guess)', /groq: no vision/.test(e.message) && /grok: no vision/.test(e.message), e.message.slice(0, 200));
  } finally { Object.assign(process.env, saved); }

  // 4. Text callers unchanged (no image argument).
  try {
    const t = await mod.completeWithProfile('classify', null, 'Reply with the single word: ok', 300, 'test/text');
    check('text call without an image still works', /ok/i.test(t), JSON.stringify(t.slice(0, 20)));
  } catch (e) { check('text call without an image still works', false, e.message.slice(0, 160)); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
