#!/usr/bin/env node
/**
 * Paint NEW v14 fruit stills with Flux 2 Pro. Not grapes / pomegranate / passionfruit.
 * Runs on Oracle (REPLICATE_API_TOKEN). Writes fruit/v14-*.jpg next to this script.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const execFileP0 = promisify(execFile);
const require = createRequire(import.meta.url);
const { FRUIT } = require('./fruit-v14-spec.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const FLUX = (process.env.FLUX2_MODEL || 'black-forest-labs/flux-2-pro').trim();

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
      if (!/429|rate.?limit/i.test(e.message) || attempt === 6) throw e;
      const wait = attempt * 25;
      process.stderr.write(`flux 429 — wait ${wait}s (attempt ${attempt}/6)\n`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw last;
}

async function main() {
  if (!REPLICATE) throw new Error('REPLICATE_API_TOKEN missing — cannot paint new v14 fruit');
  process.stderr.write(`=== v14 Flux fruit stills ${new Date().toISOString()} ===\n`);
  process.stderr.write(`FLUX ${FLUX}\n`);
  for (const b of FRUIT) {
    if (/grape|pomegranate|passionfruit|maracuya/i.test(`${b.still} ${b.id}`)) {
      throw new Error('v14 spec leaked an old fruit: ' + b.id);
    }
    const dest = path.join(HERE, b.still);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 20000 && process.env.API_FILM_KEEP_FRUIT_STILLS === '1') {
      process.stderr.write(`keep ${b.still}\n`);
      continue;
    }
    process.stderr.write(`paint ${b.id} → ${b.still}\n`);
    await flux(b.paint, dest);
    await new Promise((r) => setTimeout(r, 8000));
  }
  process.stderr.write(`PAINTED ${FRUIT.length} new v14 fruit stills (no grapes)\n`);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
