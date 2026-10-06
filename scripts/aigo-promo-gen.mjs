// AI Growth Operator promo — generation tool (runs on Oracle in /home/ubuntu/aigo-promo).
// A COPY of scripts/atuona-film8-gen.mjs (same money guard, ledger, curl transport) so film #8's tool stays untouched.
// Changes vs film #8: own folder, BUDGET_USD default 30 (Elena's cap), stills on three top models (flux | nano | gpt).
//
//   node gen.mjs image <id>                 render plan.images[id] on its engine (flux | nano | gpt) -> img/<id>.jpg
//   node gen.mjs video <shot> [engine]      render plan.shots[shot] (engine overrides) -> clips/<shot>__<engine>.mp4
//   node gen.mjs ledger                     spend so far (estimated from the vendor's per-second prices)
//   node gen.mjs music <id>                 render plan.music[id] (instrumental) -> music/<id>.mp3 (added 3 Oct 2026, film #5)
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

const BASE = '/home/ubuntu/aigo-promo';
const PLAN = JSON.parse(fs.readFileSync(path.join(BASE, 'plan.json'), 'utf8'));
const LEDGER = path.join(BASE, 'ledger.jsonl');
const UPLOADS = path.join(BASE, 'uploads.json');
const BUDGET = Number(process.env.BUDGET_USD || 30);
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
  // ---- promo top tier (schemas + page prices read 30 Sep 2026; ambiguous tiers priced at the HIGH one) ----
  veo31: {   // page lists $0.40/s and $0.20/s (audio / no audio) — guard at $0.40
    model: 'google/veo-3.1', perSec: () => 0.40,
    input: o => ({ prompt: o.prompt, negative_prompt: o.negative, image: o.start, duration: o.duration,
      resolution: '1080p', aspect_ratio: '16:9', generate_audio: false }),
  },
  luma: {    // ray-3.2 is priced per video by resolution/length; 1080p 5s guarded at the $1.20 tier
    model: 'luma/ray-3.2', perVideo: () => 1.20,
    input: o => ({ prompt: o.prompt, start_image: o.start, duration: o.duration, resolution: '1080p', aspect_ratio: '16:9', hdr: false }),
  },
  sora: {    // billed to OpenAI through our key ($0.50/s at 1792x1024); start image must be exactly that size
    model: 'openai/sora-2-pro', perSec: () => 0.50,
    input: o => ({ prompt: o.prompt, input_reference: o.start, seconds: o.duration, resolution: 'high', aspect_ratio: 'landscape',
      openai_api_key: OPENAI_KEY }),
  },
  runway: {  // Runway Gen-4.5 on Replicate: $0.12/s (page, 30 Sep) — Elena's fallback when the Venice wallet runs out
    model: 'runwayml/gen-4.5', perSec: () => 0.12,
    input: o => ({ prompt: o.prompt, image: o.start, duration: o.duration, aspect_ratio: '16:9' }),
  },
  hailuo: {  // $0.28 768p / $0.49 1080p per 6s video — guard at $0.56
    model: 'minimax/hailuo-2.3', perVideo: () => 0.56,
    input: o => ({ prompt: o.prompt, first_frame_image: o.start, duration: o.duration, resolution: '1080p', prompt_optimizer: false }),
  },
};
const OPENAI_KEY = (fs.readFileSync('/home/ubuntu/cto-aipa/.env', 'utf8').match(/^OPENAI_API_KEY=(.*)$/m) || [])[1]?.replace(/["\s]/g, '');
// Stills. Prices = the Replicate model pages on 30 Sep 2026, rounded UP (the guard must never under-count).
// Flux: $0.04/run + $0.03 per output MP + $0.03 per input MP. Nano Banana Pro: $0.15 at 2K (+ allowance per input
// image). GPT Image 2: $0.128 at high quality. Every model takes the locked reference faces as input images.
const IMAGE_ENGINES = {
  flux: { model: 'black-forest-labs/flux-2-max', price: n => 0.04 + 0.03 * 2 + 0.03 * 2 * n,
    input: (prompt, a, refs) => ({ prompt, aspect_ratio: a, resolution: '2 MP', output_format: 'jpg', output_quality: 95,
      safety_tolerance: 5, ...(refs.length ? { input_images: refs } : {}) }) },
  nano: { model: 'google/nano-banana-pro', price: n => 0.15 + 0.035 * n,
    input: (prompt, a, refs) => ({ prompt, aspect_ratio: a, resolution: '2K', output_format: 'jpg',
      safety_filter_level: 'block_only_high', allow_fallback_model: false, ...(refs.length ? { image_input: refs } : {}) }) },
  gpt: { model: 'openai/gpt-image-2', price: () => 0.128,
    input: (prompt, a, refs) => ({ prompt, aspect_ratio: a, quality: 'high', output_format: 'jpeg', number_of_images: 1,
      moderation: 'auto', ...(refs.length ? { input_images: refs } : {}) }) },
};
// A refusal ("flagged as sensitive") is final for that prompt. Re-phrase the shot into the implied register
// (light, wet fabric, shadow — the bot's UNDERGROUND_EROTIC_VIDEO_ENCODING); never re-route it to a more
// permissive model or strip the reference to get it through.

// ------------------------------------------------------------------ ledger (the money guard)
const ledger = () => fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const spent = () => ledger().filter(e => e.status === 'succeeded').reduce((s, e) => s + e.usd, 0);
// Two prepaid wallets (6 Oct 2026, film #9): VENICE_BUDGET_USD / REPLICATE_BUDGET_USD cap each one on top of BUDGET_USD.
const walletOf = e => (e.engine === 'venice' || String(e.engine || '').startsWith('venice')) ? 'venice' : 'replicate';
const spentIn = w => ledger().filter(e => e.status === 'succeeded' && walletOf(e) === w).reduce((s, e) => s + e.usd, 0);
function guard(usd, what, wallet = 'replicate') {
  const s = spent();
  if (s + usd > BUDGET) throw new Error(`BUDGET: ${what} would cost ~$${usd.toFixed(2)}; spent $${s.toFixed(2)} of $${BUDGET}. Refused.`);
  const cap = Number(process.env[wallet === 'venice' ? 'VENICE_BUDGET_USD' : 'REPLICATE_BUDGET_USD'] || Infinity), w = spentIn(wallet);
  if (w + usd > cap) throw new Error(`BUDGET(${wallet}): ${what} would cost ~$${usd.toFixed(2)}; ${wallet} spent $${w.toFixed(2)} of $${cap}. Refused.`);
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

// Venice stills (6 Oct 2026, film #9). With refs -> POST /image/multi-edit {modelId, images[], prompt, safe_mode:false};
// without refs -> POST /image/generate. Prices = Venice /models pricing read 6 Oct 2026, rounded UP. A Venice 422 is final
// for that prompt — never re-routed to another vendor.
const VENICE_IMAGE = {
  'flux-2-max-edit': n => 0.12 + 0.035 * Math.max(0, n - 1),
  'gpt-image-2-5-flare-edit': n => 0.15 + 0.01 * Math.max(0, n - 1),
  'grok-imagine-quality-edit': n => 0.09 + 0.012 * n,
  'qwen-edit-uncensored': () => 0.04,
  'firered-image-edit': () => 0.05,
  'seedream-v5-pro': () => 0.11, 'qwen-image-3-pro': () => 0.09, 'flux-2-max': () => 0.09, 'nano-banana-pro': () => 0.23,
};
async function veniceImage(id, spec) {
  const key = (fs.readFileSync('/home/ubuntu/cto-aipa/.env', 'utf8').match(/^VENICE_API_KEY=(.*)$/m) || [])[1]?.replace(/["\s]/g, '');
  if (!key) throw new Error('VENICE_API_KEY missing');
  const refs = spec.refs || [], modelId = spec.vmodel || (refs.length ? 'flux-2-max-edit' : 'seedream-v5-pro');
  const priceFn = VENICE_IMAGE[modelId]; if (!priceFn) throw new Error('no Venice price for ' + modelId);
  const usd = priceFn(refs.length), engine = `venice:${modelId}`;
  guard(usd, `image ${id} on ${engine}`, 'venice');
  // spec.look: undefined -> PLAN.look; a string -> that look (e.g. the no-people plate look); false -> none
  const prompt = [spec.prompt, spec.look === undefined ? PLAN.look : spec.look].filter(Boolean).join('\n\n');
  const b64 = r => fs.readFileSync(path.join(BASE, 'img', r.endsWith('.jpg') || r.endsWith('.png') ? r : `${r}.jpg`)).toString('base64');
  const [W, H] = (spec.aspect || '16:9') === '16:9' ? [1920, 1080] : (spec.aspect === '3:4' ? [1152, 1536] : [1536, 1536]);
  const body = refs.length
    ? { modelId, images: refs.map(b64), prompt, aspect_ratio: spec.aspect || '16:9', resolution: '2K', safe_mode: false, output_format: 'jpeg' }
    : { model: modelId, prompt, safe_mode: false, hide_watermark: true, format: 'jpeg',
        // resolution-tier models (seedream, qwen-image-3, nano, gpt) take aspect_ratio + resolution; width/height caps at 1280
        ...(/^(seedream|qwen-image|nano|gpt-image|grok-imagine|flux-3)/.test(modelId)
          ? { aspect_ratio: spec.aspect || '16:9', resolution: '2K' } : { width: W, height: H }),
        ...(spec.negative !== false ? { negative_prompt: PLAN.negative } : {}) };
  const f = path.join(BASE, 'raw', `img_${id}__venice.request.json`); fs.writeFileSync(f, JSON.stringify(body));
  const dest = path.join(BASE, 'img', `${id}.jpg`);
  const { stdout } = await run('curl', ['-s', '-m', '300', '-X', 'POST', '-H', `Authorization: Bearer ${key}`, '-H', 'Content-Type: application/json',
    '--data-binary', `@${f}`, `https://api.venice.ai/api/v1/image/${refs.length ? 'multi-edit' : 'generate'}`, '-o', dest + '.part', '-w', '%{http_code} %{content_type}'], { maxBuffer: 1 << 20 });
  const [code, ctype] = stdout.trim().split(' ');
  let ok = code === '200' && fs.existsSync(dest + '.part');
  if (ok && /json/.test(ctype || '')) {           // /image/generate answers JSON {images:[base64]}
    const j = JSON.parse(fs.readFileSync(dest + '.part', 'utf8')); const img = j?.images?.[0];
    if (img) fs.writeFileSync(dest + '.part', Buffer.from(img, 'base64')); else ok = false;
  }
  if (ok && fs.statSync(dest + '.part').size < 5000) ok = false;
  const err = ok ? null : `HTTP ${code} ${fs.existsSync(dest + '.part') ? fs.readFileSync(dest + '.part', 'utf8').slice(0, 200) : ''}`;
  record({ kind: 'image', id, engine, model: modelId, status: ok ? 'succeeded' : 'failed', usd: ok ? usd : 0, error: err });
  if (!ok) { if (fs.existsSync(dest + '.part')) fs.unlinkSync(dest + '.part'); console.log(`FAIL image ${id} (${engine}): ${err}`); process.exitCode = 2; return; }
  fs.renameSync(dest + '.part', dest);
  console.log(`OK image ${id} (${engine}) -> ${dest} (~$${usd.toFixed(3)}; venice $${spentIn('venice').toFixed(2)}, total $${spent().toFixed(2)} of $${BUDGET})`);
}

// ------------------------------------------------------------------ commands
async function image(id) {
  const spec = PLAN.images[id]; if (!spec) throw new Error('no plan.images.' + id);
  if (spec.engine === 'venice') return veniceImage(id, spec);
  const engineId = spec.engine || 'flux';
  const eng = IMAGE_ENGINES[engineId]; if (!eng) throw new Error('unknown image engine ' + engineId);
  const price = eng.price((spec.refs || []).length), model = eng.model;
  guard(price, `image ${id} on ${engineId}`);
  const refs = [];
  for (const r of spec.refs || []) refs.push(await resolveImg(r));
  const prompt = [spec.prompt, spec.look === undefined ? PLAN.look : spec.look].filter(Boolean).join('\n\n');   // same spec.look rule as veniceImage
  const p = await predict(model, eng.input(prompt, spec.aspect || '16:9', refs), `img_${id}`);
  const e = { kind: 'image', id, engine: engineId, model, status: p.status, usd: p.status === 'succeeded' ? price : 0, error: p.error || null, prediction: p.id };
  record(e);
  if (p.status !== 'succeeded') { console.log(`FAIL image ${id}: ${p.error}`); process.exitCode = 2; return; }
  const dest = path.join(BASE, 'img', `${id}.jpg`);
  await download(outUrl(p.output), dest);
  console.log(`OK image ${id} (${engineId}) -> ${dest} (~$${e.usd.toFixed(3)}; spent $${spent().toFixed(2)} of $${BUDGET})`);
}

// Venice (Elena's own prepaid wallet) — the same flow as the Atuona bot's tryVeniceVideo(): QUOTE first, refuse over
// the cap, then queue, poll /video/retrieve until it answers with the mp4 bytes. Wan 3.0 Pro = Venice's 1080p tier.
async function veniceVideo(shotId, shot, o) {
  const key = (fs.readFileSync('/home/ubuntu/cto-aipa/.env', 'utf8').match(/^VENICE_API_KEY=(.*)$/m) || [])[1]?.replace(/["\s]/g, '');
  if (!key) throw new Error('VENICE_API_KEY missing');
  const base = 'https://api.venice.ai/api/v1', model = 'wan-3-0-pro-image-to-video';
  const post = (p, body) => {   // execFile cannot pipe stdin -> the body goes through a file, like predict() does
    const f = path.join(BASE, 'raw', `${shotId}__venice${p.replace(/\//g, '_')}.request.json`);
    fs.writeFileSync(f, JSON.stringify(body));
    return run('curl', ['-s', '-m', '180', '-X', 'POST', '-H', `Authorization: Bearer ${key}`, '-H', 'Content-Type: application/json',
      '--data-binary', `@${f}`, `${base}${p}`], { maxBuffer: 1 << 28 });
  };
  const src = shot.start_by_engine?.venice ?? shot.start;
  const body = { model, prompt: o.prompt, negative_prompt: o.negative,
    image_url: `data:image/jpeg;base64,${fs.readFileSync(path.join(BASE, 'img', `${src}.jpg`)).toString('base64')}`,
    duration: `${o.duration}s`, resolution: '1080p', aspect_ratio: '16:9' };
  const q = await post('/video/quote', body);
  const usd = Number((q.stdout.match(/"quote"\s*:\s*([\d.]+)/) || [])[1]);
  if (!Number.isFinite(usd)) throw new Error('Venice gave no quote: ' + q.stdout.slice(0, 200));
  guard(usd, `video ${shotId} on venice (quoted)`, 'venice');
  const qr = await post('/video/queue', body);
  const qid = (qr.stdout.match(/"queue_id"\s*:\s*"([^"]+)"/) || [])[1];
  if (!qid) { record({ kind: 'video', id: shotId, engine: 'venice', model, status: 'failed', usd: 0, error: qr.stdout.slice(0, 200) });
    console.log(`FAIL ${shotId}__venice: ${qr.stdout.slice(0, 200)}`); process.exitCode = 2; return; }
  process.stderr.write(`  ${shotId}__venice: ${model} queue ${qid} (quoted $${usd})\n`);
  const dest = path.join(BASE, 'clips', `${shotId}__venice.mp4`), t0 = Date.now();
  while (Date.now() - t0 < 20 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 10000));
    const { stdout } = await run('curl', ['-s', '-m', '180', '-X', 'POST', '-H', `Authorization: Bearer ${key}`, '-H', 'Content-Type: application/json',
      '--data-binary', JSON.stringify({ model, queue_id: qid }), `${base}/video/retrieve`, '-o', dest + '.part', '-w', '%{http_code} %{content_type}'], { maxBuffer: 1 << 20 });
    if (/video|octet/.test(stdout) && fs.existsSync(dest + '.part') && fs.statSync(dest + '.part').size > 10000) { fs.renameSync(dest + '.part', dest); break; }
  }
  const ok = fs.existsSync(dest);
  record({ kind: 'video', id: shotId, engine: 'venice', model, seconds: o.duration, status: ok ? 'succeeded' : 'failed', usd: ok ? usd : 0, error: ok ? null : 'timeout', prediction: qid });
  console.log(ok ? `OK ${shotId}__venice -> ${dest} (~$${usd.toFixed(2)}; spent $${spent().toFixed(2)} of $${BUDGET})` : `FAIL ${shotId}__venice: no video in 20 min`);
}

async function video(shotId, engineOverride) {
  const shot = PLAN.shots[shotId]; if (!shot) throw new Error('no plan.shots.' + shotId);
  const engineId = engineOverride || shot.engine || 'kling';
  const o0 = { ...shot, prompt: [shot.motion, PLAN.motion_look].filter(Boolean).join(' '), negative: PLAN.negative,
    duration: shot.duration_by_engine?.[engineId] ?? shot.duration };
  if (engineId === 'venice') return veniceVideo(shotId, shot, o0);
  const eng = ENGINES[engineId]; if (!eng) throw new Error('unknown engine ' + engineId);
  const o = o0;
  const usd = eng.perVideo ? eng.perVideo(o) : eng.perSec(o) * o.duration;
  guard(usd, `video ${shotId} on ${engineId}`);
  // grok validates the URL's file extension and Replicate file URLs have none -> send the JPEG inline as a data URI.
  // luma too: its API rejects Replicate file URLs ("video.start_frame: Unsupported content type", 30 Sep).
  const inline = ref => `data:image/jpeg;base64,${fs.readFileSync(path.join(BASE, 'img', `${ref}.jpg`)).toString('base64')}`;
  const startRef = shot.start_by_engine?.[engineId] ?? shot.start;
  o.start = startRef ? ((engineId === 'grok' || engineId === 'luma' || engineId === 'runway') ? inline(startRef) : await resolveImg(startRef)) : undefined;
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

// Music (3 Oct 2026, Elena: "Let us create our own music"). ElevenLabs Music on Replicate: up to 300 s, force_instrumental
// (no vocals by design), commercial use under the ElevenLabs Music Terms. Price found 3 Oct: ~$8.30 per 1,000 s of output; the
// guard prices it HIGHER ($0.011/s) so it never under-counts. plan.music[id] = { engine, prompt, seconds }.
const MUSIC_ENGINES = {
  elevenlabs: { model: 'elevenlabs/music', perSec: 0.011,
    input: m => ({ prompt: m.prompt, music_length_ms: Math.round(m.seconds * 1000), force_instrumental: true, output_format: 'mp3_high_quality' }) },
};
async function music(id) {
  const m = (PLAN.music || {})[id]; if (!m) throw new Error('no plan.music.' + id);
  const eng = MUSIC_ENGINES[m.engine || 'elevenlabs']; if (!eng) throw new Error('unknown music engine ' + m.engine);
  const usd = eng.perSec * m.seconds; guard(usd, `music ${id}`);
  const p = await predict(eng.model, eng.input(m), `music_${id}`);
  record({ kind: 'music', id, engine: m.engine || 'elevenlabs', model: eng.model, seconds: m.seconds, status: p.status,
    usd: p.status === 'succeeded' ? usd : 0, error: p.error || null, prediction: p.id });
  if (p.status !== 'succeeded') { console.log(`FAIL music ${id}: ${String(p.error).slice(0, 200)}`); process.exitCode = 2; return; }
  fs.mkdirSync(path.join(BASE, 'music'), { recursive: true });
  const dest = path.join(BASE, 'music', `${id}.mp3`);
  await download(outUrl(p.output), dest);
  console.log(`OK music ${id} -> ${dest} (~$${usd.toFixed(2)}; spent $${spent().toFixed(2)} of $${BUDGET})`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'image') await image(a);
else if (cmd === 'video') await video(a, b);
else if (cmd === 'music') await music(a);
else if (cmd === 'ledger') {
  const L = ledger();
  for (const e of L) console.log(`${e.ts.slice(5, 16)} ${e.kind.padEnd(5)} ${(e.id + (e.engine ? '/' + e.engine : '')).padEnd(22)} ${e.status.padEnd(9)} $${e.usd.toFixed(2)} ${e.error ? String(e.error).slice(0, 90) : ''}`);
  console.log(`SPENT ~$${spent().toFixed(2)} of $${BUDGET} (venice $${spentIn('venice').toFixed(2)} · replicate $${spentIn('replicate').toFixed(2)}; ${L.filter(e => e.status !== 'succeeded').length} failed/refused, not billed)`);
} else { console.log('usage: node gen.mjs image <id> | video <shot> [engine] | music <id> | ledger'); process.exitCode = 1; }
