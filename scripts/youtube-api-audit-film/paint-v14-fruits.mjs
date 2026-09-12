#!/usr/bin/env node
/**
 * v14 fruit stills. Flux 2 Pro is optional — Replicate returned 402 (no credit),
 * which is why grapes stayed: the painter never wrote new files.
 *
 * Default: Wikimedia Commons CUT tropical fruit (mango / papaya / dragon fruit /
 * pineapple / starfruit). Set API_FILM_TRY_FLUX=1 to spend Replicate if topped up.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const execFileP0 = promisify(execFile);
const require = createRequire(import.meta.url);
const { FRUIT, BANNED_FRUIT } = require('./fruit-v14-spec.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const FLUX = (process.env.FLUX2_MODEL || 'black-forest-labs/flux-2-pro').trim();
const TRY_FLUX = process.env.API_FILM_TRY_FLUX === '1';

function readEnvKey(n) {
  try {
    const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((x) => x.startsWith(n + '='));
    return l ? l.slice(n.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const REPLICATE = (process.env.REPLICATE_API_TOKEN || readEnvKey('REPLICATE_API_TOKEN')).trim();

function extractHttpUrl(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.startsWith('http')) return value;
  if (Array.isArray(value)) return extractHttpUrl(value[0]);
  if (typeof value === 'object') {
    if (typeof value.url === 'function') {
      try {
        const u = value.url();
        return extractHttpUrl(typeof u === 'string' ? u : u && u.href);
      } catch {
        /* ignore */
      }
    }
    return extractHttpUrl(value.url || value.uri || value.href);
  }
  return '';
}

function stillPath(b) {
  return path.join(HERE, b.still);
}

function assertNewFruit() {
  for (const b of FRUIT) {
    if (BANNED_FRUIT.test(`${b.still} ${b.id}`)) throw new Error('v14 spec leaked an old fruit: ' + b.id);
  }
}

function allStillsReady() {
  return FRUIT.every((b) => {
    const dest = stillPath(b);
    return fs.existsSync(dest) && fs.statSync(dest).size > 20000;
  });
}

async function fluxOnce(prompt, dest) {
  const bodyFile = dest + '.flux.json';
  fs.writeFileSync(
    bodyFile,
    JSON.stringify({
      input: {
        prompt,
        aspect_ratio: '16:9',
        output_format: 'jpg',
        output_quality: 90,
        safety_tolerance: 4,
        prompt_upsampling: false,
      },
    }),
  );
  const create = await execFileP0(
    'curl',
    [
      '-sS',
      '-w',
      '\nHTTP:%{http_code}',
      '-m',
      '120',
      '-X',
      'POST',
      `https://api.replicate.com/v1/models/${FLUX}/predictions`,
      '-H',
      `Authorization: Bearer ${REPLICATE}`,
      '-H',
      'Content-Type: application/json',
      '-H',
      'Prefer: wait=60',
      '-d',
      `@${bodyFile}`,
    ],
    { timeout: 130000, maxBuffer: 1 << 24 },
  );
  const raw = create.stdout || '';
  const http = (raw.match(/HTTP:(\d+)\s*$/) || [])[1] || '';
  const body = raw.replace(/\nHTTP:\d+\s*$/, '');
  if (http === '429') throw new Error('Flux 429 rate limit');
  if (http === '402' || /Insufficient credit/i.test(body)) throw new Error(`Flux HTTP 402: ${body.slice(0, 160)}`);
  if (http && http !== '200' && http !== '201') throw new Error(`Flux HTTP ${http}: ${body.slice(0, 200)}`);
  let j = JSON.parse(body || '{}');
  const getUrl = j.urls?.get || (j.id ? `https://api.replicate.com/v1/predictions/${j.id}` : '');
  for (let i = 0; i < 36; i++) {
    if (j.status === 'succeeded') {
      const url = extractHttpUrl(j.output);
      if (!url) throw new Error('Flux succeeded without an image URL');
      await execFileP0('curl', ['-sS', '-L', '-o', dest, url], { timeout: 120000 });
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 20000) throw new Error('Flux download empty');
      process.stderr.write(`flux ok ${path.basename(dest)} ${(fs.statSync(dest).size / 1e6).toFixed(1)}MB\n`);
      return dest;
    }
    if (j.status === 'failed' || j.status === 'canceled') {
      throw new Error(`Flux ${j.status}: ${j.error || body.slice(0, 160)}`);
    }
    if (!getUrl) throw new Error(`Flux create had no poll URL: ${body.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 8000));
    const polled = await execFileP0(
      'curl',
      ['-sS', '-w', '\nHTTP:%{http_code}', '-m', '30', '-H', `Authorization: Bearer ${REPLICATE}`, getUrl],
      { timeout: 40000, maxBuffer: 1 << 20 },
    );
    const praw = polled.stdout || '';
    const phttp = (praw.match(/HTTP:(\d+)\s*$/) || [])[1] || '';
    const pbody = praw.replace(/\nHTTP:\d+\s*$/, '');
    if (phttp === '429') throw new Error('Flux 429 rate limit');
    j = JSON.parse(pbody || '{}');
    process.stderr.write(`flux ${j.id || '?'} ${j.status} (${i + 1}/36)\n`);
  }
  throw new Error('Flux poll timeout');
}

async function flux(prompt, dest) {
  let last = new Error('Flux never started');
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fluxOnce(prompt, dest);
    } catch (e) {
      last = e;
      if (/402|Insufficient credit/i.test(e.message)) throw e;
      if (!/429|rate.?limit/i.test(e.message) || attempt === 6) throw e;
      const wait = attempt * 25;
      process.stderr.write(`flux 429 — wait ${wait}s (attempt ${attempt}/6)\n`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw last;
}

async function fetchCutFruit() {
  const py = path.join(HERE, 'fetch-v14-fruit-stills.py');
  if (!fs.existsSync(py)) throw new Error('fetch-v14-fruit-stills.py missing');
  process.stderr.write('fetching CUT tropical fruit stills from Wikimedia Commons (no grapes)\n');
  await execFileP0('python3', [py], {
    timeout: 180000,
    maxBuffer: 1 << 20,
    env: { ...process.env, API_FILM_FRUIT_DIR: path.join(HERE, 'fruit') },
  });
}

async function paintWithFlux() {
  if (!REPLICATE) throw new Error('REPLICATE_API_TOKEN missing');
  process.stderr.write(`FLUX ${FLUX}\n`);
  for (const b of FRUIT) {
    const dest = stillPath(b);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    process.stderr.write(`paint ${b.id} → ${b.still}\n`);
    await flux(b.paint, dest);
    await new Promise((r) => setTimeout(r, 8000));
  }
  process.stderr.write(`PAINTED ${FRUIT.length} new v14 fruit stills (no grapes)\n`);
}

async function main() {
  assertNewFruit();
  process.stderr.write(`=== v14 fruit stills ${new Date().toISOString()} ===\n`);
  if (TRY_FLUX && REPLICATE) {
    try {
      await paintWithFlux();
    } catch (e) {
      process.stderr.write(`Flux missed (${e.message.slice(0, 160)}) — Commons cut fruit instead\n`);
      await fetchCutFruit();
    }
  } else {
    process.stderr.write('Flux skipped (Replicate 402 last run / API_FILM_TRY_FLUX unset) — Commons cut fruit\n');
    await fetchCutFruit();
  }
  if (!allStillsReady()) throw new Error('new v14 fruit stills missed — refusing grapes');
  process.stderr.write(`READY ${FRUIT.map((f) => f.id).join(',')} stills (no grapes)\n`);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
