#!/usr/bin/env node
/**
 * v14 fruit director — DeepSeek writes motion, Seedance 2.5 shoots.
 * Runs on Oracle where DEEPSEEK_API_KEY and REPLICATE_API_TOKEN live.
 * Refuses to skip. No ffmpeg sway. No Runway. Does not touch v13.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileP0 = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_FILM_DIR || '/home/ubuntu/aideazz-api-film-v14';
const CLIPDIR = path.join(BASE, 'clips');
const W = path.join(BASE, 'work');
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const SEEDANCE_MODEL = 'bytedance/seedance-2.5';
const MOTION_ANCHOR =
  'Premium live-action product film, natural film grain, slow prestige pacing, tactile atmosphere. Subtle motion only; do not invent new objects, people, animals, logos, or text. No cartoon, 3D, Pixar, or toy mascots.';

function readEnvKey(n) {
  try {
    const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((x) => x.startsWith(n + '='));
    return l ? l.slice(n.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const DEEPSEEK = (process.env.DEEPSEEK_API_KEY || readEnvKey('DEEPSEEK_API_KEY')).trim();
const REPLICATE = (process.env.REPLICATE_API_TOKEN || readEnvKey('REPLICATE_API_TOKEN')).trim();

const FRUIT = [
  {
    id: 'grapes',
    still: 'fruit/geo-grapes-citation.jpg',
    motion:
      'The grape cluster SWAYS on the vine. Individual berries shift a few millimetres. Dew slides. Neural constellation traces on each grape GLOW and fire — cyan then magenta pulses travel berry to berry like neurones. Slow prestige product film. There is only THIS cluster. No knife, no hand, no extra fruit, no text, no logo, no second vine.',
  },
  {
    id: 'split',
    still: 'fruit/geo-pomegranate-100-vs-72.jpg',
    motion:
      'Pomegranate halves breathe; circuit traces pulse cyan then magenta. Numbers 100 and 72 stay exactly where they are — do not morph, do not duplicate, do not add new numerals. Slow push. No extra fruit. No grapevine.',
  },
  {
    id: 'crawlers',
    still: 'fruit/geo-passionfruit-crawlers.jpg',
    motion:
      'Three glass crawlers WALK across the passionfruit pulp — legs shift, bodies orbit a few centimetres, purple cores pulse. Pulp glistens. Tiny living motion. Do not spawn a fourth crawler. No extra fruit. Do not invent text or names.',
  },
  {
    id: 'hand',
    still: 'fruit/geo-pomegranate-audit-hand.jpg',
    motion:
      'Water droplets fall. The glass HUD stays locked to the fruit. The hand is still. No extra hands, no blood, no new UI panels, no changing the 100 score.',
  },
  {
    id: 'dashboard',
    still: 'fruit/geo-pomegranate-dashboard-2026.jpg',
    motion:
      'Juice droplets fall. The glass AI visibility dashboard stays locked to the fruit. The hand is still. Numbers stay 100. No extra hands, no blood, no new UI panels. Slow prestige product film.',
  },
];

function dataUri(file) {
  const buf = fs.readFileSync(file);
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

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

async function deepseekMotion(id, motion) {
  if (!DEEPSEEK) throw new Error('DEEPSEEK_API_KEY missing on Oracle — v14 will not skip DeepSeek');
  const body = path.join(W, `deepseek-${id}.json`);
  fs.writeFileSync(
    body,
    JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You write image-to-video motion for ByteDance Seedance 2.5. One or two English sentences. Subtle prestige motion only. Do not invent objects, people, text, or logos. Return only the motion line.',
        },
        { role: 'user', content: motion },
      ],
    }),
  );
  const { stdout } = await execFileP0(
    'curl',
    [
      '-sS',
      '--fail-with-body',
      '-m',
      '45',
      'https://api.deepseek.com/chat/completions',
      '-H',
      `Authorization: Bearer ${DEEPSEEK}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      `@${body}`,
    ],
    { timeout: 50000, maxBuffer: 1 << 20 },
  );
  const line = JSON.parse(stdout)?.choices?.[0]?.message?.content?.trim();
  if (!line || line.length < 20 || line.length > 600) {
    throw new Error(`DeepSeek returned an empty or unusable motion line for ${id}`);
  }
  process.stderr.write(`deepseek motion ${id}: ${line.slice(0, 160)}\n`);
  return line;
}

async function seedanceI2V(stillPath, promptText, destMp4) {
  if (!REPLICATE) throw new Error('REPLICATE_API_TOKEN missing — Seedance 2.5 needs it to shoot DeepSeek\'s line');
  const bodyFile = destMp4 + '.seedance.json';
  fs.writeFileSync(
    bodyFile,
    JSON.stringify({
      input: {
        prompt: `Cinematic fragment. ${MOTION_ANCHOR} ${promptText}`.slice(0, 900),
        image: dataUri(stillPath),
        duration: 8,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: false,
      },
    }),
  );
  const create = await execFileP0(
    'curl',
    [
      '-sS',
      '--fail-with-body',
      '-m',
      '120',
      '-X',
      'POST',
      `https://api.replicate.com/v1/models/${SEEDANCE_MODEL}/predictions`,
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
  let j = JSON.parse(create.stdout || '{}');
  const getUrl = j.urls?.get || (j.id ? `https://api.replicate.com/v1/predictions/${j.id}` : '');
  process.stderr.write(`seedance job ${j.id || '?'} ${path.basename(stillPath)} status=${j.status || '?'}\n`);
  for (let i = 0; i < 36; i++) {
    if (j.status === 'succeeded') {
      const url = extractHttpUrl(j.output);
      if (!url) throw new Error('Seedance succeeded without a video URL');
      await execFileP0('curl', ['-sS', '-L', '-o', destMp4, url], { timeout: 120000 });
      if (!fs.existsSync(destMp4) || fs.statSync(destMp4).size < 10000) throw new Error('seedance download empty');
      process.stderr.write(`seedance ok ${path.basename(destMp4)} ${(fs.statSync(destMp4).size / 1e6).toFixed(1)}MB\n`);
      return destMp4;
    }
    if (j.status === 'failed' || j.status === 'canceled') {
      throw new Error(`Seedance ${j.status}: ${j.error || JSON.stringify(j).slice(0, 200)}`);
    }
    if (!getUrl) throw new Error(`Seedance create had no poll URL: ${JSON.stringify(j).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 10000));
    const polled = await execFileP0(
      'curl',
      ['-sS', '--fail-with-body', '-m', '30', '-H', `Authorization: Bearer ${REPLICATE}`, getUrl],
      { timeout: 40000, maxBuffer: 1 << 20 },
    );
    j = JSON.parse(polled.stdout || '{}');
    process.stderr.write(`seedance ${j.id || '?'} ${j.status} (${i + 1}/36)\n`);
  }
  throw new Error('Seedance poll timeout');
}

async function main() {
  if (!DEEPSEEK) throw new Error('DEEPSEEK_API_KEY missing — v14 will not pretend DeepSeek directed this');
  if (!REPLICATE) throw new Error('REPLICATE_API_TOKEN missing — Seedance cannot shoot DeepSeek\'s motion');
  for (const d of [BASE, CLIPDIR, W]) fs.mkdirSync(d, { recursive: true });
  process.stderr.write(`=== v14 DeepSeek director ${new Date().toISOString()} ===\n`);
  process.stderr.write('DEEPSEEK yes REPLICATE yes\n');
  const credit = [];
  for (const b of FRUIT) {
    const still = path.join(HERE, b.still);
    if (!fs.existsSync(still)) throw new Error('missing still ' + still);
    const raw = path.join(CLIPDIR, `${b.id}.mp4`);
    if (fs.existsSync(raw)) fs.unlinkSync(raw);
    const motion = await deepseekMotion(b.id, b.motion);
    await seedanceI2V(still, motion, raw);
    credit.push(`${b.id}: ${motion}`);
  }
  const log = path.join(BASE, 'deepseek-motion-v14.txt');
  fs.writeFileSync(log, credit.join('\n') + '\n');
  process.stderr.write(`USED DeepSeek on all ${FRUIT.length} fruit shots. ${log}\n`);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
