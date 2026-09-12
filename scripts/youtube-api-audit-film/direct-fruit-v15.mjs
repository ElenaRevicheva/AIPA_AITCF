#!/usr/bin/env node
/**
 * v15 director — the /api hero pipeline, not a still xfade.
 *
 * 1. Keep the WHOLE still (Elena: first picture is fine).
 * 2. DeepSeek Flash writes the motion line.
 * 3. Runway Gen-4.5 image→video from that whole still — same camera as
 *    aideazz.xyz/api (HeroBackdrop reel). Not Seedance. Not a Commons cut.
 * 4. finishApiHeroClip: 2.4s whole head → 1.2s dissolve → Runway body
 *    + gold–white–violet independent-phase field + prism + veil.
 *
 * Fails if Runway misses. A written motion line on a grocery cut is not a film.
 * Does not touch v13 or v14.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { finishApiHeroClip } from './hero-clip-v15.mjs';

const require = createRequire(import.meta.url);
const { extractDeepseekLine } = require('./deepseek-motion-parse.cjs');
const { FRUIT, BANNED_FRUIT } = require('./fruit-v15-spec.cjs');

const execFileP0 = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_FILM_DIR || '/home/ubuntu/aideazz-api-film-v15';
const CLIPDIR = path.join(BASE, 'clips');
const W = path.join(BASE, 'work');
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const RUNWAY_API = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VER = '2024-11-06';
const RUNWAY_MODEL = 'gen4.5';
const MOTION_ANCHOR =
  'Premium live-action product film in a pure black void. Natural film grain, slow prestige pacing. The fruit stays this fruit. Then it opens and technical traces appear — glass HUD, cyan-to-magenta fibre, no readable text. No knife, no blade, no hand, no tool. No cartoon, 3D, Pixar, or toy mascots.';

function readEnvKey(n) {
  try {
    const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((x) => x.startsWith(n + '='));
    return l ? l.slice(n.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const DEEPSEEK = (process.env.DEEPSEEK_API_KEY || readEnvKey('DEEPSEEK_API_KEY')).trim();
const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || readEnvKey('DEEPSEEK_MODEL') || 'deepseek-flash').trim();
const RUNWAY = (process.env.RUNWAY_API_KEY || readEnvKey('RUNWAY_API_KEY')).trim();

function dataUri(file) {
  const buf = fs.readFileSync(file);
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function deepseekMotion(id, motion) {
  if (!DEEPSEEK) throw new Error('DEEPSEEK_API_KEY missing on Oracle — v15 will not skip DeepSeek');
  const body = path.join(W, `deepseek-${id}.json`);
  fs.writeFileSync(
    body,
    JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 1024,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You write image-to-video motion for Runway Gen-4.5, matching the aideazz.xyz/api hero: black void, whole fruit then it opens then technical traces. One or two English sentences. Say no knife, no blade, no hand, no tool. Do not invent people, text, or logos. Return only the motion line.',
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
  const parsed = extractDeepseekLine(stdout);
  process.stderr.write(
    `deepseek raw ${id} finish=${parsed.finish} contentLen=${parsed.contentLen} reasoningLen=${parsed.reasoningLen}\n`,
  );
  if (!parsed.line || parsed.line.length < 20 || parsed.line.length > 600) {
    throw new Error(`DeepSeek returned an empty or unusable motion line for ${id}`);
  }
  process.stderr.write(`deepseek motion ${id}: ${parsed.line.slice(0, 160)}\n`);
  return parsed.line;
}

async function runwayI2V(stillPath, promptText, destMp4) {
  if (!RUNWAY) throw new Error('RUNWAY_API_KEY missing — /api hero is Runway, will not fake it with a still');
  const body = {
    model: RUNWAY_MODEL,
    promptImage: dataUri(stillPath),
    promptText: `9-12 second fragment. ${MOTION_ANCHOR} ${promptText}`.slice(0, 900),
    duration: 10,
    watermark: false,
    ratio: '1280:720',
  };
  const create = await fetch(`${RUNWAY_API}/image_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNWAY}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VER,
    },
    body: JSON.stringify(body),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`Runway create ${create.status}: ${createText.slice(0, 240)}`);
  const { id } = JSON.parse(createText);
  process.stderr.write(`runway job ${id} ${path.basename(stillPath)}\n`);
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 20000));
    const st = await fetch(`${RUNWAY_API}/tasks/${id}`, {
      headers: { Authorization: `Bearer ${RUNWAY}`, 'X-Runway-Version': RUNWAY_VER },
    });
    const raw = await st.text();
    if (!st.ok) {
      process.stderr.write(`runway poll HTTP ${st.status}\n`);
      continue;
    }
    const j = JSON.parse(raw);
    if (j.status === 'SUCCEEDED' && j.output?.[0]) {
      const url = String(j.output[0]);
      await execFileP0('curl', ['-sS', '-L', '-o', destMp4, url], { timeout: 120000 });
      if (!fs.existsSync(destMp4) || fs.statSync(destMp4).size < 10000) throw new Error('runway download empty');
      process.stderr.write(`runway ok ${path.basename(destMp4)} ${(fs.statSync(destMp4).size / 1e6).toFixed(1)}MB\n`);
      return destMp4;
    }
    if (j.status === 'FAILED') throw new Error(`Runway FAILED: ${j.failure || raw.slice(0, 200)}`);
    process.stderr.write(`runway ${id} ${j.status} (${i + 1}/36)\n`);
  }
  throw new Error('Runway poll timeout');
}

async function main() {
  if (!DEEPSEEK) throw new Error('DEEPSEEK_API_KEY missing — v15 will not pretend DeepSeek directed this');
  if (!RUNWAY) throw new Error('RUNWAY_API_KEY missing — will not publish another still xfade as the /api hero');
  for (const d of [BASE, CLIPDIR, W]) fs.mkdirSync(d, { recursive: true });
  process.stderr.write(`=== v15 Runway director ${new Date().toISOString()} ===\n`);
  process.stderr.write(`DEEPSEEK yes model=${DEEPSEEK_MODEL} RUNWAY yes (Seedance not the camera)\n`);
  const credit = [];
  for (const b of FRUIT) {
    if (BANNED_FRUIT.test(`${b.still} ${b.id}`)) throw new Error('old fruit leaked into v15: ' + b.id);
    const whole = path.join(HERE, b.whole);
    if (!fs.existsSync(whole)) {
      throw new Error('missing v15 whole still for ' + b.id + ' — run void-stills-v15.py first');
    }
    const raw = path.join(CLIPDIR, `${b.id}.mp4`);
    const body = path.join(W, `${b.id}-runway.mp4`);
    if (fs.existsSync(raw)) fs.unlinkSync(raw);
    if (fs.existsSync(body)) fs.unlinkSync(body);
    const motion = await deepseekMotion(b.id, b.motion);
    await runwayI2V(whole, motion, body);
    await finishApiHeroClip({ whole, bodyMp4: body, dest: raw });
    credit.push(`${b.id}: ${motion}`);
  }
  const log = path.join(BASE, 'deepseek-motion-v15.txt');
  fs.writeFileSync(log, credit.join('\n') + '\n');
  fs.writeFileSync(path.join(CLIPDIR, 'engine-v15.txt'), 'runway\n');
  process.stderr.write(`USED Runway on all ${FRUIT.length} fruit shots from the whole still. ${log}\n`);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
