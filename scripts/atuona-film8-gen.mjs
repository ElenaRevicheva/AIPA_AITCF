// Atuona film #8 — generation tool (runs on Oracle in /home/ubuntu/atuona-film8).
// Every clip in film #8 is a generated VIDEO; stills exist only as keyframes / character references (inputs).
//
//   node gen.mjs image <id>                 render plan.images[id] with Flux 2 Max  -> img/<id>.jpg
//   node gen.mjs video <shot> [engine]      render plan.shots[shot] (engine overrides) -> clips/<shot>__<engine>.mp4
//   node gen.mjs ledger                     spend so far (estimated from the vendor's per-second prices)
//
// Money guard: every job is priced BEFORE it is sent and refused if it would push the ledger past BUDGET_USD.
// Prices = the Replicate model pages on 22 Sep 2026 (docs/atuona/2026-09-22_MODEL_AUDIT_AND_TOPUPS.md).
// HTTP goes through curl (node fetch hung on long calls before — FILM_COMPILATION_GUIDE recap #5).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
const run = promisify(execFile);

const BASE = '/home/ubuntu/atuona-film8';
const PLAN = JSON.parse(fs.readFileSync(path.join(BASE, 'plan.json'), 'utf8'));
const LEDGER = path.join(BASE, 'ledger.jsonl');
const UPLOADS = path.join(BASE, 'uploads.json');
const BUDGET = Number(process.env.BUDGET_USD || 60);
const TOKEN = (fs.readFileSync('/home/ubuntu/cto-aipa/.env', 'utf8').match(/^REPLICATE_API_TOKEN=(.*)$/m) || [])[1]?.replace(/["\s]/g, '');
if (!TOKEN) throw new Error('REPLICATE_API_TOKEN missing');
for (const d of ['img', 'clips', 'raw']) fs.mkdirSync(path.join(BASE, d), { recursive: true });

// ------------------------------------------------------------------ engines: model + input mapping + $/s
const ENGINES = {
  kling: {
    model: 'kwaivgi/kling-v3-omni-video', perSec: o => (o.mode === 'pro' ? 0.224 : 0.168) + (o.audio ? 0.056 : 0),
    input: o => ({ prompt: o.prompt, negative_prompt: o.negative, start_image: o.start, ...(o.end ? { end_image: o.end } : {}),
      ...(o.refs?.length ? { reference_images: o.refs } : {}), duration: o.duration, mode: o.mode || 'standard',
      aspect_ratio: '16:9', generate_audio: !!o.audio }),
  },
  seedance: {
    model: 'bytedance/seedance-2.5', perSec: () => 0.2312,
    input: o => ({ prompt: o.prompt, image: o.start, ...(o.end ? { last_frame_image: o.end } : {}), duration: o.duration,
      resolution: '720p', aspect_ratio: '16:9', generate_audio: !!o.audio }),
  },
  grok: {
    model: 'xai/grok-imagine-video-1.5', perSec: () => 0.08,
    input: o => ({ prompt: o.prompt, image: o.start, duration: o.duration, resolution: '720p', aspect_ratio: '16:9' }),
  },
  wan: {
    model: 'wan-video/wan-2.7-i2v', perSec: () => 0.10,
    input: o => ({ prompt: o.prompt, negative_prompt: o.negative, first_frame: o.start, ...(o.end ? { last_frame: o.end } : {}),
      duration: o.duration, resolution: '720p',
      // Wan rewrites the prompt by default; on s08 that rewrite kept adding cuts to Kira's face -> plan `expand: false`
      enable_prompt_expansion: o.expand !== false }),
  },
  happyhorse: {
    model: 'alibaba/happyhorse-1.0', perSec: () => 0.14,
    input: o => ({ prompt: o.prompt, image: o.start, duration: o.duration, resolution: '720p' }),
  },
  pixverse: {
    model: 'pixverse/pixverse-v6', perSec: () => 0.12,   // 720p no-audio tier not labelled on the page — priced high on purpose
    input: o => ({ prompt: o.prompt, negative_prompt: o.negative, image: o.start, ...(o.end ? { last_frame_image: o.end } : {}),
      duration: o.duration, quality: '720p' }),
  },
  veo: {
    model: 'google/veo-3.1-fast', perSec: () => 0.15,    // Google list price $0.10 @720p; Replicate's mark-up unknown — priced high
    input: o => ({ prompt: o.prompt, negative_prompt: o.negative, image: o.start, ...(o.end ? { last_frame: o.end } : {}),
      duration: o.duration, resolution: '720p', aspect_ratio: '16:9', generate_audio: false }),
  },
};
const FLUX = 'black-forest-labs/flux-2-max';
const FLUX_PER_IMAGE = 0.03 * 2.2;   // $0.03 per output megapixel, ~2 MP out (+ margin for input MPs)
// A refusal ("flagged as sensitive") is final for that prompt. Re-phrase the shot into the implied register
// (light, wet fabric, shadow — the bot's UNDERGROUND_EROTIC_VIDEO_ENCODING); never re-route it to a more
// permissive model or strip the reference to get it through.

// ------------------------------------------------------------------ ledger (the money guard)
const ledger = () => fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const spent = () => ledger().filter(e => e.status === 'succeeded').reduce((s, e) => s + e.usd, 0);
function guard(usd, what) {
  const s = spent();
  if (s + usd > BUDGET) throw new Error(`BUDGET: ${what} would cost ~$${usd.toFixed(2)}; spent $${s.toFixed(2)} of $${BUDGET}. Refused.`);
}
const record = e => fs.appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n');

// ------------------------------------------------------------------ Replicate over curl
async function curlJson(args) {
  const { stdout } = await run('curl', ['-s', '-m', '120', '-H', `Authorization: Bearer ${TOKEN}`, ...args], { maxBuffer: 1 << 26 });
  try { return JSON.parse(stdout); } catch { throw new Error('non-JSON from Replicate: ' + stdout.slice(0, 300)); }
}
async function upload(file) {   // local file -> Replicate file URL (cached by content hash)
  const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  // parallel runs share this cache: read tolerantly, write atomically (a half-written file crashed 6 keyframes)
  const readCache = () => { try { return JSON.parse(fs.readFileSync(UPLOADS, 'utf8')); } catch { return {}; } };
  const hit = readCache()[hash]; if (hit) return hit;
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const r = await curlJson(['-X', 'POST', '-F', `content=@${file};type=${type};filename=${path.basename(file)}`, 'https://api.replicate.com/v1/files']);
  const url = r?.urls?.get; if (!url) throw new Error('upload failed: ' + JSON.stringify(r).slice(0, 300));
  const cache = { ...readCache(), [hash]: url }, tmp = `${UPLOADS}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1)); fs.renameSync(tmp, UPLOADS);
  return url;
}
async function predict(model, input, label) {
  const body = path.join(BASE, 'raw', `${label}.request.json`);
  fs.writeFileSync(body, JSON.stringify({ input }, null, 1));
  let p;
  for (let attempt = 1; ; attempt++) {   // under $5 of credit Replicate allows 6 creates/min, burst 1 — wait it out
    p = await curlJson(['-X', 'POST', '-H', 'Content-Type: application/json', '-H', 'Prefer: wait=5', '--data-binary', `@${body}`,
      `https://api.replicate.com/v1/models/${model}/predictions`]);
    if (p.id || !/throttled/i.test(String(p.detail)) || attempt >= 8) break;
    process.stderr.write(`  ${label}: throttled, retry ${attempt} in 15s\n`);
    await new Promise(r => setTimeout(r, 15000));
  }
  if (!p.id) throw new Error('create failed: ' + JSON.stringify(p).slice(0, 400));
  process.stderr.write(`  ${label}: ${model} prediction ${p.id}\n`);
  const t0 = Date.now();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    if (Date.now() - t0 > 20 * 60 * 1000) throw new Error(`timeout after 20 min: ${p.id}`);
    await new Promise(r => setTimeout(r, 8000));
    p = await curlJson([`https://api.replicate.com/v1/predictions/${p.id}`]);
  }
  fs.writeFileSync(path.join(BASE, 'raw', `${label}.response.json`), JSON.stringify(p, null, 1));
  return p;
}
const outUrl = o => typeof o === 'string' ? o : Array.isArray(o) ? String(o[0]) : o?.url || null;
async function download(url, dest) {
  await run('curl', ['-s', '-L', '-m', '300', '-o', dest + '.part', url], { maxBuffer: 1 << 20 });
  fs.renameSync(dest + '.part', dest);
  if (fs.statSync(dest).size < 1000) throw new Error('download too small: ' + dest);
}
const resolveImg = async ref => upload(path.join(BASE, 'img', ref.endsWith('.jpg') || ref.endsWith('.png') ? ref : `${ref}.jpg`));

// ------------------------------------------------------------------ commands
async function image(id) {
  const spec = PLAN.images[id]; if (!spec) throw new Error('no plan.images.' + id);
  const price = FLUX_PER_IMAGE, model = FLUX;
  guard(price, `image ${id}`);
  const refs = [];
  for (const r of spec.refs || []) refs.push(await resolveImg(r));
  const prompt = [spec.prompt, PLAN.look].filter(Boolean).join('\n\n');
  const input = { prompt, aspect_ratio: spec.aspect || '16:9', resolution: '2 MP', output_format: 'jpg', output_quality: 95,
    safety_tolerance: 5, ...(refs.length ? { input_images: refs } : {}), ...(spec.seed ? { seed: spec.seed } : {}) };
  const p = await predict(model, input, `img_${id}`);
  const e = { kind: 'image', id, model, status: p.status, usd: p.status === 'succeeded' ? price : 0, error: p.error || null, prediction: p.id };
  record(e);
  if (p.status !== 'succeeded') { console.log(`FAIL image ${id}: ${p.error}`); process.exitCode = 2; return; }
  const dest = path.join(BASE, 'img', `${id}.jpg`);
  await download(outUrl(p.output), dest);
  console.log(`OK image ${id} -> ${dest} (~$${e.usd.toFixed(3)}; spent $${spent().toFixed(2)} of $${BUDGET})`);
}

async function video(shotId, engineOverride) {
  const shot = PLAN.shots[shotId]; if (!shot) throw new Error('no plan.shots.' + shotId);
  const engineId = engineOverride || shot.engine || 'kling';
  const eng = ENGINES[engineId]; if (!eng) throw new Error('unknown engine ' + engineId);
  const o = { ...shot, prompt: [shot.motion, PLAN.motion_look].filter(Boolean).join(' '), negative: PLAN.negative,
    duration: shot.duration_by_engine?.[engineId] ?? shot.duration };
  const usd = eng.perSec(o) * o.duration;
  guard(usd, `video ${shotId} on ${engineId}`);
  // grok validates the URL's file extension and Replicate file URLs have none -> send the JPEG inline as a data URI
  const inline = ref => `data:image/jpeg;base64,${fs.readFileSync(path.join(BASE, 'img', `${ref}.jpg`)).toString('base64')}`;
  o.start = shot.start ? (engineId === 'grok' ? inline(shot.start) : await resolveImg(shot.start)) : undefined;
  o.end = shot.end ? await resolveImg(shot.end) : undefined;
  o.refs = [];
  for (const r of (engineId === 'kling' ? shot.refs || [] : [])) o.refs.push(await resolveImg(r));
  const label = `${shotId}__${engineId}`;
  const p = await predict(eng.model, eng.input(o), label);
  const e = { kind: 'video', id: shotId, engine: engineId, model: eng.model, seconds: o.duration, status: p.status,
    usd: p.status === 'succeeded' ? usd : 0, error: p.error || null, prediction: p.id };
  record(e);
  if (p.status !== 'succeeded') { console.log(`FAIL ${label}: ${String(p.error).slice(0, 200)}`); process.exitCode = 2; return; }
  const dest = path.join(BASE, 'clips', `${label}.mp4`);
  await download(outUrl(p.output), dest);
  console.log(`OK ${label} -> ${dest} (~$${usd.toFixed(2)}; spent $${spent().toFixed(2)} of $${BUDGET})`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'image') await image(a);
else if (cmd === 'video') await video(a, b);
else if (cmd === 'ledger') {
  const L = ledger();
  for (const e of L) console.log(`${e.ts.slice(5, 16)} ${e.kind.padEnd(5)} ${(e.id + (e.engine ? '/' + e.engine : '')).padEnd(22)} ${e.status.padEnd(9)} $${e.usd.toFixed(2)} ${e.error ? String(e.error).slice(0, 90) : ''}`);
  console.log(`SPENT ~$${spent().toFixed(2)} of $${BUDGET} (${L.filter(e => e.status !== 'succeeded').length} failed/refused, not billed)`);
} else { console.log('usage: node gen.mjs image <id> | video <shot> [engine] | ledger'); process.exitCode = 1; }
