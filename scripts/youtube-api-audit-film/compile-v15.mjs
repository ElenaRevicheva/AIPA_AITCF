#!/usr/bin/env node
/**
 * YouTube promo v15 for aideazz.xyz/api — /api hero language + DeepSeek Flash.
 *
 *   DeepSeek (when keyed) writes the motion line; Seedance 2.5 shoots I2V.
 *   OpenAI TTS tts-1 / onyx / 0.9 via curl (node fetch hangs on Oracle)
 *   ffmpeg: 1920×1080 30fps, slow-mo not freeze, 1.3s xfade, mono title cards,
 *   intro MUST NOT fade in from black, sidechain-ducked music, loudnorm −16 LUFS
 *   Music: juicy unused Pixabay (Mango Sky / tropical house). No drone fallback.
 *
 * Never build inside the git checkout. Work dir: /home/ubuntu/aideazz-api-film-v15/
 * Publish ONLY can-ai-find-and-cite-you-v15.mp4 — never v14 / v13 / unversioned.
 * Copy scripts/atuona-film3.mjs settings — do not re-invent the chains.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { renderHeroClip } from './hero-clip-v15.mjs';

const require = createRequire(import.meta.url);
const { extractDeepseekLine } = require('./deepseek-motion-parse.cjs');
const { FRUIT: V15_FRUIT } = require('./fruit-v15-spec.cjs');

const execFileP0 = promisify(execFile);
async function execFileP(cmd, args, opts) {
  if (cmd === 'ffmpeg' || cmd === 'ffprobe') {
    fs.appendFileSync(path.join(BASE, 'ffmpeg-commands.log'), cmd + ' ' + args.map((a) => (/[\s\[\];,']/.test(a) ? `'${a}'` : a)).join(' ') + '\n\n');
  }
  return execFileP0(cmd, args, opts);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_FILM_DIR || '/home/ubuntu/aideazz-api-film-v15';
const W = path.join(BASE, 'work');
const VODIR = path.join(BASE, 'vo-v15');
const CLIPDIR = path.join(BASE, 'clips');
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const FILM_MUSIC_DIR = path.join(BASE, 'music');
// Poetry beds (FILM_COMPILATION_GUIDE table) + the first-alpha dark track this promo already burned.
const BURNED_MUSIC = /light in the void|fatal error|dark-cinematic-drone|atmospheric-dark-cinematic|morning-light-fresh-corporate|tropical-cocktail|fresh-tropical|distant-horizon|kulakovka|mango.?sky|dariocoiro/i;
const PUBLISH = process.env.API_FILM_PUBLISH || path.join(BASE, 'out');
const PUBLIC = 'https://webhook.aideazz.xyz/influencer-images/youtube';

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const SANS = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : FONT;
const CTA = 'https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta';
const XFADE_D = 1.3, LEAD = 0.7, TAIL = 1.9, SPEED = 0.9;
const WX = 1920, HY = 1080, FPS = 30;
const SEEDANCE_MODEL = 'bytedance/seedance-2.5';
const MOTION_ANCHOR =
  'Premium live-action product film in a pure black void, matching aideazz.xyz/api. Natural film grain, slow prestige pacing. Whole fruit first, then the cut, then technical traces. Do not invent people, logos, or readable text. No cartoon, 3D, Pixar, or toy mascots.';

const FILM_TITLE = 'CAN AI FIND AND CITE YOU';
const FILM_SUB = '12.09.2026  ·  AIDEAZZ.XYZ/API  ·  FREE AUDIT';
const OUTRO_TITLE = 'AIDEAZZ.XYZ/API';
const OUTRO_SUB = 'AUDIT MY SITE  ·  FREE  ·  NO SIGNUP';
const SLUG = 'can-ai-find-and-cite-you';
const CUT = 'v15';

function readEnvKey(n) {
  try {
    const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((x) => x.startsWith(n + '='));
    return l ? l.slice(n.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}
const OPENAI = (process.env.OPENAI_API_KEY || readEnvKey('OPENAI_API_KEY')).trim();
const REPLICATE = (process.env.REPLICATE_API_TOKEN || readEnvKey('REPLICATE_API_TOKEN')).trim();
const DEEPSEEK = (process.env.DEEPSEEK_API_KEY || readEnvKey('DEEPSEEK_API_KEY')).trim();
const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || readEnvKey('DEEPSEEK_MODEL') || 'deepseek-flash').trim();

const caps = (s) => (s || '').toUpperCase();
const track = (s) => caps(s).split('').join(' ');
function stripMd(s) {
  return (s || '').replace(/\r/g, '').replace(/[*_`]+/g, '');
}
function wrap(s, maxCols, maxLines) {
  const out = [];
  for (const raw of stripMd(s).split('\n')) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > maxCols) {
        out.push(cur);
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  while (out.length && out[0] === '') out.shift();
  return out.slice(0, maxLines).join('\n');
}
async function dur(f) {
  try {
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]);
    const d = parseFloat(stdout.trim());
    return d > 0 ? d : 5;
  } catch {
    return 5;
  }
}

async function tts(text, out) {
  if (!OPENAI) throw new Error('OPENAI_API_KEY missing');
  const body = out + '.json';
  fs.writeFileSync(body, JSON.stringify({ model: 'tts-1', voice: 'onyx', input: text, response_format: 'mp3', speed: SPEED }));
  let last = '';
  for (let a = 0; a < 4; a++) {
    try {
      await execFileP0(
        'curl',
        ['-sS', '--fail-with-body', '-m', '60', '-o', out, 'https://api.openai.com/v1/audio/speech', '-H', `Authorization: Bearer ${OPENAI}`, '-H', 'Content-Type: application/json', '-d', `@${body}`],
        { timeout: 70000 },
      );
      if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
        try {
          fs.unlinkSync(body);
        } catch {}
        return;
      }
      last = 'small';
    } catch (e) {
      last = 'curl ' + (e && e.code != null ? e.code : '?');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  try {
    fs.unlinkSync(body);
  } catch {}
  throw new Error('tts ' + last);
}

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

async function deepseekMotion(motion) {
  if (!DEEPSEEK) throw new Error('DEEPSEEK_API_KEY missing — v15 will not skip DeepSeek');
  const body = path.join(W, `deepseek-motion-${Date.now()}.json`);
  fs.mkdirSync(W, { recursive: true });
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
            'You write image-to-video motion for ByteDance Seedance 2.5, matching the aideazz.xyz/api hero: black void, whole fruit then cut then technical traces. One or two English sentences. Do not invent objects, people, text, or logos. Return only the motion line.',
        },
        { role: 'user', content: motion },
      ],
    }),
  );
  try {
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
    process.stderr.write(`deepseek raw finish=${parsed.finish} contentLen=${parsed.contentLen} reasoningLen=${parsed.reasoningLen}\n`);
    if (parsed.line && parsed.line.length >= 20 && parsed.line.length <= 600) {
      process.stderr.write(`deepseek motion ${parsed.line.slice(0, 120)}\n`);
      return parsed.line;
    }
    throw new Error('DeepSeek returned an empty or unusable motion line');
  } catch (e) {
    throw new Error(`DeepSeek motion failed: ${e.message}`);
  }
}

async function seedanceI2V(stillPath, promptText, destMp4) {
  if (!REPLICATE) throw new Error('REPLICATE_API_TOKEN missing — Seedance 2.5 needs it');
  const bodyFile = destMp4 + '.seedance.json';
  fs.mkdirSync(path.dirname(destMp4), { recursive: true });
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

async function makeCard(titleRaw, subRaw, outFile, d, titleSize, bgImage, noFadeIn) {
  const tFile = outFile + '_t.txt';
  fs.writeFileSync(tFile, track(titleRaw));
  let draw = `drawtext=fontfile=${MONO}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=(h-text_h)/2-26`;
  if (subRaw && subRaw.trim()) {
    const sFile = outFile + '_s.txt';
    fs.writeFileSync(sFile, wrap(caps(subRaw), 40, 2));
    draw += `,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=38:line_spacing=14:x=(w-text_w)/2:y=(h/2)+64`;
  }
  const fades = `${noFadeIn ? '' : 'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;
  if (bgImage && fs.existsSync(bgImage)) {
    const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP(
      'ffmpeg',
      ['-y', '-loop', '1', '-i', bgImage, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile],
      { maxBuffer: 1 << 26, timeout: 90000 },
    );
  } else {
    await execFileP(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${WX}x${HY}:r=${FPS}:d=${d.toFixed(2)}`, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${draw},${fades}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile],
      { maxBuffer: 1 << 26, timeout: 90000 },
    );
  }
  return outFile;
}

async function fillClip(src, dest, seconds, startAt) {
  const ss = Math.max(0, startAt || 0);
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},format=yuv420p,setsar=1`;
  // Never loop. The 65s Loom's long tail is the results scroll Elena called too long.
  await execFileP(
    'ffmpeg',
    ['-y', '-ss', ss.toFixed(3), '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
  );
  return dest;
}

async function concatClips(parts, dest) {
  const usable = parts.filter((p) => fs.existsSync(p) && fs.statSync(p).size > 1000);
  if (!usable.length) throw new Error('concat: no parts');
  if (usable.length === 1) {
    fs.copyFileSync(usable[0], dest);
    return dest;
  }
  const inputs = usable.flatMap((p) => ['-i', p]);
  let fc = '';
  for (let i = 0; i < usable.length; i++) {
    // Conform fps/pix/SAR before concat. v6 died here: still SAR 0:1 vs Loom 15709:15711.
    fc += `[${i}:v]fps=${FPS},format=yuv420p,scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,setpts=PTS-STARTPTS[v${i}];`;
    fc += `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[a${i}];`;
  }
  for (let i = 0; i < usable.length; i++) fc += `[v${i}][a${i}]`;
  fc += `concat=n=${usable.length}:v=1:a=1[v][a]`;
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest], { maxBuffer: 1 << 26, timeout: 180000 });
  return dest;
}

function findLoom() {
  const cands = [
    process.env.API_FILM_LOOM,
    path.join(HERE, 'loom/walkthrough.mp4'),
    path.join(BASE, 'loom/walkthrough.mp4'),
    path.join(BASE, 'kit/loom/walkthrough.mp4'),
  ].filter(Boolean);
  for (const p of cands) {
    if (fs.existsSync(p) && fs.statSync(p).size > 200000) return p;
  }
  return null;
}

async function buildUiClip(b, clipDur, loomState) {
  const parts = [];
  let remain = clipDur;
  const slidePath = path.join(HERE, b.still);
  const livePath = b.liveStill ? path.join(HERE, b.liveStill) : null;

  // First-video walkthrough slides lead. They are the prepared 1920×1080 scenes.
  if (fs.existsSync(slidePath) && b.slideHold !== 0) {
    const hold = Math.min(b.slideHold || 2.2, Math.max(1.5, remain * 0.36));
    const p = path.join(W, `slide_${b.id}.mp4`);
    await stillToClip(slidePath, p, hold);
    parts.push(p);
    remain -= hold;
    process.stderr.write(`ui slide ${b.id} ${hold.toFixed(1)}s ${b.still}\n`);
  }

  if (livePath && fs.existsSync(livePath) && remain > 0.55 && b.liveHold !== 0) {
    const hold = Math.min(b.liveHold || 1.2, remain * 0.28);
    if (hold >= 1.0) {
      const p = path.join(W, `live_${b.id}.mp4`);
      await stillToClip(livePath, p, hold);
      parts.push(p);
      remain -= hold;
      process.stderr.write(`ui live ${b.id} ${hold.toFixed(1)}s ${b.liveStill}\n`);
    }
  }

  const loomMax = b.loomMax === 0 ? 0 : b.loomMax || 2.5;
  if (loomState.path && loomMax > 0 && remain > 0.45) {
    // checks may jump to the results waterfall (past the sequential walk cap).
    const startAt = b.loomAt != null ? b.loomAt : loomState.t;
    const hardEnd = b.loomAt != null ? startAt + loomMax + 0.35 : loomState.end;
    const avail = hardEnd - startAt;
    if (avail > 0.45) {
      const take = Math.min(remain, loomMax, avail);
      const slice = path.join(W, `loom_${b.id}.mp4`);
      await fillClip(loomState.path, slice, take, startAt);
      if (b.loomAt == null) loomState.t += take;
      parts.push(slice);
      remain -= take;
      process.stderr.write(`ui loom ${b.id} ${take.toFixed(1)}s @${startAt.toFixed(1)} no-loop\n`);
    } else {
      process.stderr.write(`ui loom ${b.id} skipped — useful window used up\n`);
    }
  }

  if (remain > 0.35) {
    const padSrc = fs.existsSync(slidePath) ? slidePath : livePath && fs.existsSync(livePath) ? livePath : slidePath;
    const p = path.join(W, `pad_${b.id}.mp4`);
    await stillToClip(padSrc, p, remain);
    parts.push(p);
  }
  if (!parts.length) {
    const fb = path.join(W, `fb_${b.id}.mp4`);
    await stillToClip(slidePath, fb, clipDur);
    parts.push(fb);
  }
  const raw = path.join(CLIPDIR, `${b.id}.mp4`);
  await concatClips(parts, raw);
  return raw;
}

async function stillToClip(src, dest, seconds) {
  // Hold, don't zoom — UI type must stay readable. Fruit motion comes from Runway.
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},format=yuv420p,setsar=1`;
  await execFileP(
    'ffmpeg',
    ['-y', '-loop', '1', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function normalizeVideo(src, dest, clipDur, opts = {}) {
  const nat = await dur(src);
  const vfCore = `scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS},format=yuv420p`;
  const vf = opts.pad
    ? `${vfCore.replace(',format=yuv420p', '')},tpad=stop_mode=clone:stop_duration=${Math.max(0, clipDur - nat).toFixed(3)},format=yuv420p`
    : `scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,setpts=${(clipDur / nat).toFixed(5)}*PTS,fps=${FPS},format=yuv420p`;
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', clipDur.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
  );
  return dest;
}

function labelFilter(labels) {
  return labels
    .map((L) => {
      const col = L.color || '0x7DFFFB';
      const fs = L.size || 64;
      const escaped = String(L.text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
      return `drawtext=fontfile=${SANS}:text='${escaped}':fontcolor=${col}:fontsize=${fs}:borderw=4:bordercolor=black@0.65:box=1:boxcolor=black@0.45:boxborderw=20:x=${L.x}:y=${L.y}`;
    })
    .join(',');
}

async function overlaySlide(src, dest, lines) {
  if (!lines || !lines.length) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  const parts = lines.map((L, i) => {
    const tf = dest + `_s${i}.txt`;
    fs.writeFileSync(tf, wrap(L.text, 40, 2));
    const col = L.color || 'white';
    const fsze = L.size || 52;
    return `drawtext=fontfile=${SANS}:textfile=${tf}:expansion=none:fontcolor=${col}:fontsize=${fsze}:line_spacing=12:box=1:boxcolor=black@0.50:boxborderw=22:x=(w-text_w)/2:y=${L.y}`;
  });
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-vf', parts.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function overlayQrBug(src, dest) {
  const qr = path.join(HERE, 'qr/api-cta-qr.png');
  if (!fs.existsSync(qr) || !fs.existsSync(src)) {
    if (src !== dest && fs.existsSync(src)) fs.copyFileSync(src, dest);
    return dest;
  }
  // Bottom-right, clear of centred captions. Loop the PNG for the whole shot.
  const fc = `[1:v]scale=168:168[qr];[0:v][qr]overlay=W-w-28:H-h-36:shortest=1[v]`;
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-loop', '1', '-i', qr, '-filter_complex', fc, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function overlayLabels(src, dest, labels) {
  if (!labels || !labels.length) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-vf', labelFilter(labels), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function bakeCaption(src, dest, caption, clipDur) {
  if (!caption) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  const txt = dest + '.txt';
  fs.writeFileSync(txt, wrap(caption, 28, 5));
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  const draw = `drawtext=fontfile=${FONT}:textfile=${txt}:expansion=none:fontcolor=white:fontsize=52:line_spacing=16:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h-text_h-28:alpha='${alpha}'`;
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-vf', draw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

function pickMusic() {
  const pinned = (process.env.API_FILM_MUSIC || '').trim();
  if (pinned && fs.existsSync(pinned) && fs.statSync(pinned).size > 20000 && !BURNED_MUSIC.test(pinned)) return pinned;
  const juicyName = /v15-|tropical|juicy|papaya|brazilian|beach-party|summer/i;
  try {
    const files = fs.readdirSync(FILM_MUSIC_DIR).filter((f) => /\.(mp3|m4a|wav)$/i.test(f) && !BURNED_MUSIC.test(f));
    const juicy = files.filter((f) => juicyName.test(f));
    const pick = juicy[0] || files[0];
    if (pick) return path.join(FILM_MUSIC_DIR, pick);
  } catch {}
  return null;
}

const BEATS = [
  {
    id: 'mango',
    kind: 'seedance',
    still: V15_FRUIT[0].still,
    whole: V15_FRUIT[0].whole,
    motion: V15_FRUIT[0].motion,
    vo: null,
    cap: null,
    clipDur: 8.0,
    slide: [
      { text: 'WHAT IT CHECKS', y: 'H*0.05', size: 56, color: 'white' },
      { text: 'The same four weights that build the score', y: 'H*0.14', size: 32, color: '0xFDE68A' },
      { text: 'AI Crawler Access     ·     Structured Data (GEO)', y: 'H*0.82', size: 36, color: 'white' },
      { text: 'Answer-Readiness (AEO)     ·     Technical Foundation', y: 'H*0.90', size: 36, color: 'white' },
    ],
  },
  {
    id: 'papaya',
    kind: 'seedance',
    still: V15_FRUIT[1].still,
    whole: V15_FRUIT[1].whole,
    motion: V15_FRUIT[1].motion,
    vo: 'Google ranked your page. In 2026 that is just half of the fruit.',
    cap: 'Google ranked your page —\nin 2026 that is just half of the fruit.',
    clipDur: 7.8,
    labels: [
      { text: 'GOOGLE', x: 'W*0.16', y: 'H*0.78', color: '0x7DFFB3', size: 72 },
      { text: 'CHATGPT', x: 'W*0.58', y: 'H*0.68', color: '0xFF7AE0', size: 72 },
    ],
  },
  {
    id: 'dragon',
    kind: 'seedance',
    still: V15_FRUIT[2].still,
    whole: V15_FRUIT[2].whole,
    motion: V15_FRUIT[2].motion,
    vo: 'Six crawlers decide whether ChatGPT, Claude, Gemini and Perplexity can quote you.',
    cap: 'Six crawlers decide who gets cited.',
    clipDur: 8.2,
    labels: [
      { text: 'GPTBot', x: 'W*0.08+36*sin(2*PI*t/2.3)', y: 'H*0.06+18*cos(2*PI*t/1.9)', color: '0x7DFFFB', size: 42 },
      { text: 'ClaudeBot', x: 'W*0.62+36*sin(2*PI*t/2.1+1)', y: 'H*0.06+16*cos(2*PI*t/2.4+0.4)', color: '0xFFB347', size: 42 },
      { text: 'PerplexityBot', x: 'W*0.32+28*sin(2*PI*t/2.6)', y: 'H*0.86+12*cos(2*PI*t/2.2)', color: '0xFF7AE0', size: 42 },
    ],
  },
  {
    id: 'pineapple',
    kind: 'seedance',
    still: V15_FRUIT[3].still,
    whole: V15_FRUIT[3].whole,
    motion: V15_FRUIT[3].motion,
    vo: 'This is the free AI visibility audit at aideazz.xyz/api.',
    cap: 'Free AI visibility audit\naideazz.xyz/api',
    clipDur: 6.5,
  },
  {
    id: 'starfruit',
    kind: 'seedance',
    still: V15_FRUIT[4].still,
    whole: V15_FRUIT[4].whole,
    motion: V15_FRUIT[4].motion,
    vo: 'Counted from production logs: four hundred and twenty audits, fourteen thousand signals, two hundred and ten sites, median eighty-five.',
    cap: '420+ audits · 14,000+ signals · median 85',
    clipDur: 11.2,
    slide: [
      { text: 'CAN AI FIND AND CITE YOU', y: 'H*0.05', size: 68, color: 'white' },
      { text: 'Google ranked your page — in 2026 that is just half of the fruit', y: 'H*0.16', size: 44, color: '0xFDE68A' },
      { text: '420+ audits   ·   14,000+ signals   ·   210+ sites   ·   median 85', y: 'H*0.84', size: 48, color: 'white' },
    ],
  },
  {
    id: 'loomwalk',
    kind: 'ui',
    still: 'ui/ui-hero.png',
    vo: null,
    cap: null,
    clipDur: 16,
    slideHold: 0,
    liveHold: 0,
    loomMax: 16,
    loomAt: 0.4,
  },
  {
    id: 'website',
    kind: 'ui',
    still: 'ui/ui-hero.png',
    liveStill: 'ui/live-hero.png',
    vo: null,
    cap: null,
    clipDur: 8,
    slideHold: 2.4,
    liveHold: 2.0,
    loomMax: 0,
  },
  { id: 'hero', kind: 'ui', still: 'ui/ui-hero.png', liveStill: 'ui/live-hero.png', vo: 'Paste a public URL. We read the page directly — thirty-four signals, no signup, no scraping bill.', cap: '34 signals. Direct page reads. No signup.', loomMax: 0, liveHold: 1.2, clipDur: 9.2 },
  { id: 'form', kind: 'ui', still: 'ui/ui-form.png', vo: 'Type yourwebsite.com. Click Audit my site.', cap: 'Paste the URL. Audit my site.', loomMax: 0, clipDur: 6.5 },
  { id: 'auditing', kind: 'ui', still: 'ui/ui-auditing.png', vo: 'Seconds later the score lands — and whether each engine can even read the site.', cap: 'Auditing… 34 signals.', loomMax: 0, clipDur: 8.2 },
  { id: 'score', kind: 'ui', still: 'ui/ui-score.png', vo: 'One AI Visibility Score, then GPTBot, ClaudeBot, Perplexity, Gemini, Google-Extended.', cap: 'Score, then which engines can read you.', loomMax: 0, clipDur: 8.0 },
  { id: 'checks', kind: 'ui', still: 'ui/ui-checks.png', vo: 'Every check shows what we saw, why it matters, and how to fix the ones that fail. Not five tips. All thirty-four.', cap: 'What we saw. Why it matters. How to fix it.', loomMax: 0, clipDur: 10.3 },
  { id: 'categories', kind: 'ui', still: 'ui/ui-categories.png', liveStill: 'ui/live-categories.png', vo: 'Crawler access. Structured data. Answer-readiness. Technical foundation. Same weights as the live API.', cap: 'Four categories. One score.', loomMax: 0, clipDur: 9.5 },
  { id: 'cta', kind: 'ui', still: 'ui/ui-cta.png', liveStill: 'ui/live-cta.png', vo: 'Free. Run yours now. aideazz.xyz/api', cap: 'aideazz.xyz/api', loomMax: 0, clipDur: 6.5 },
];

async function main() {
  for (const d of [BASE, W, VODIR, CLIPDIR, PUBLISH]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BASE, 'ffmpeg-commands.log'), '');
  process.stderr.write(`=== api-audit-film ${CUT} ${new Date().toISOString()} ===\n`);
  process.stderr.write(`OPENAI ${OPENAI ? 'yes' : 'NO'} REPLICATE ${REPLICATE ? 'yes' : 'NO'} DEEPSEEK ${DEEPSEEK ? `yes ${DEEPSEEK_MODEL}` : 'NO'}\n`);

  const fruitReady = process.env.API_FILM_FRUIT_READY === '1';
  const fruitIds = V15_FRUIT.map((f) => f.id);
  const haveFruit = fruitIds.every((id) => {
    const p = path.join(CLIPDIR, `${id}.mp4`);
    return fs.existsSync(p) && fs.statSync(p).size > 20000;
  });
  if (V15_FRUIT.some((f) => /grape|pomegranate|passionfruit/i.test(`${f.id} ${f.still} ${f.whole}`))) {
    throw new Error('v15 spec leaked grapes — refusing to compile');
  }
  if (fruitReady && haveFruit) {
    process.stderr.write('fruit clips already directed by DeepSeek on black-void stills — not rebuilding\n');
  } else {
    if (!DEEPSEEK) throw new Error('v15 requires DEEPSEEK_API_KEY — will not silently skip');
    process.stderr.write('DeepSeek Flash directs. Seedance 2.5 shoots when credited; else HeroBackdrop clip (not Ken Burns).\n');
    for (const id of fruitIds) {
      const b = BEATS.find((x) => x.id === id && x.kind === 'seedance');
      if (!b) continue;
      const still = path.join(HERE, b.still);
      const whole = path.join(HERE, b.whole);
      if (!fs.existsSync(still)) throw new Error('missing v15 cut still ' + still);
      if (!fs.existsSync(whole)) throw new Error('missing v15 whole still ' + whole);
      const raw = path.join(CLIPDIR, `${b.id}.mp4`);
      if (fs.existsSync(raw)) fs.unlinkSync(raw);
      const motion = await deepseekMotion(b.motion);
      try {
        await seedanceI2V(still, motion, raw);
      } catch (e) {
        process.stderr.write(`Seedance missed ${id} (${(e.message || '').slice(0, 100)}) — hero-clip fallback\n`);
        await renderHeroClip({ whole, cut: still, dest: raw, seconds: 8 });
      }
    }
  }

  const cover = path.join(HERE, V15_FRUIT[0].still);
  const seq = [];
  seq.push(await overlayQrBug(await makeCard(FILM_TITLE, FILM_SUB, path.join(W, 'card_intro.mp4'), 4.4, 60, cover, true), path.join(W, 'card_intro_qr.mp4')));

  const loomPath = findLoom();
  const loomRaw = loomPath ? await dur(loomPath) : 0;
  const loomUseful = loomPath ? Math.min(loomRaw, Number(process.env.API_FILM_LOOM_END || 20)) : 0;
  const loomState = { path: loomPath, t: 0.4, end: loomUseful };
  process.stderr.write(loomPath ? `loom ${loomPath} dur=${loomRaw.toFixed(1)}s useful=${loomUseful.toFixed(1)}s (no loop, no results-scroll tail)\n` : 'WARN no Loom walkthrough — UI stills only\n');

  const voInfo = [];
  for (let i = 0; i < BEATS.length; i++) {
    const b = BEATS[i];
    const still = path.join(HERE, b.still);
    if (!fs.existsSync(still) && b.kind !== 'ui') throw new Error('missing still ' + still);
    let voFile = null,
      vd = 0;
    if (b.vo) {
      voFile = path.join(VODIR, `v_${b.id}.mp3`);
      if (!(fs.existsSync(voFile) && fs.statSync(voFile).size > 1000)) {
        if (OPENAI) await tts(b.vo, voFile);
        else process.stderr.write(`WARN no OPENAI for ${b.id} — need cached vo or donor film audio\n`);
      }
      if (fs.existsSync(voFile) && fs.statSync(voFile).size > 1000) vd = await dur(voFile);
      else voFile = null;
    }
    let raw = path.join(CLIPDIR, `${b.id}.mp4`);
    const clipDur = b.clipDur || (b.vo ? Math.max(6.5, LEAD + vd + TAIL) : 5.5);
    if (b.kind === 'ui') {
      raw = await buildUiClip(b, clipDur, loomState);
    } else if (!(fs.existsSync(raw) && fs.statSync(raw).size > 20000)) {
      if (b.kind === 'seedance') {
        const whole = path.join(HERE, b.whole);
        if (!fs.existsSync(whole)) throw new Error('missing v15 whole still for hero clip ' + whole);
        await renderHeroClip({ whole, cut: still, dest: raw, seconds: clipDur });
      } else {
        await stillToClip(still, raw, 5.5);
      }
    }
    const nat = await dur(raw);
    let normDur;
    if (b.kind === 'ui') normDur = clipDur;
    else if (b.clipDur) normDur = b.clipDur;
    else if (b.vo) normDur = Math.max(nat, LEAD + vd + TAIL);
    else normDur = Math.min(Math.max(nat, 4.8), 6.2);
    const norm = path.join(W, `n_${b.id}.mp4`);
    await normalizeVideo(raw, norm, normDur, { pad: b.kind === 'ui' });
    const labeled = path.join(W, `lb_${b.id}.mp4`);
    await overlayLabels(norm, labeled, b.labels);
    const slid = path.join(W, `sl_${b.id}.mp4`);
    await overlaySlide(labeled, slid, b.slide);
    const baked = path.join(W, `fc_${String(i).padStart(2, '0')}.mp4`);
    await bakeCaption(slid, baked, b.cap, normDur);
    const withQr = path.join(W, `qr_${String(i).padStart(2, '0')}.mp4`);
    await overlayQrBug(baked, withQr);
    seq.push(withQr);
    if (voFile) voInfo.push({ segIndex: i + 1, file: voFile });
    if (b.id === 'mango') process.stderr.write('chapter What it checks on a new mango cut — not grapes\n');
    if (b.id === 'loomwalk') process.stderr.write('chapter Elena Loom shortened (no results-scroll tail)\n');
    if (b.id === 'website') process.stderr.write('chapter finishing slides\n');
    process.stderr.write(`beat ${i + 1}/${BEATS.length} ${b.id} dur=${normDur.toFixed(1)} vo=${b.vo ? vd.toFixed(1) : '-'}\n`);
  }
  const qrCard = path.join(HERE, 'qr/api-cta-endcard.png');
  if (!fs.existsSync(qrCard)) throw new Error('missing QR end card ' + qrCard);
  seq.push(await stillToClip(qrCard, path.join(W, 'card_qr.mp4'), 5.8));
  process.stderr.write(`qr bug on every shot; qr outro 5.8s ${CTA}\n`);

  const durs = [];
  for (const c of seq) durs.push(await dur(c));
  const expect = durs.reduce((a, b) => a + b, 0) - XFADE_D * Math.max(0, seq.length - 1);
  process.stderr.write(`xfade ${seq.length} clips durs=${durs.map((d) => d.toFixed(1)).join('+')} expect=${expect.toFixed(1)}s\n`);
  const segStart = (k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += durs[i];
    return Math.max(0, s - k * XFADE_D);
  };

  // Pairwise xfade — one 16-input 1080p graph OOMs the GitHub runner (exit 143).
  const normV = `fps=${FPS},format=yuv420p,scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,setpts=PTS-STARTPTS`;
  const normA = `aformat=sample_rates=44100:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS`;
  async function xfadeTwo(aPath, bPath, dest) {
    const da = await dur(aPath);
    const ofs = Math.max(0, da - XFADE_D).toFixed(3);
    const fc =
      `[0:v]${normV}[v0];[1:v]${normV}[v1];[0:a]${normA}[a0];[1:a]${normA}[a1];` +
      `[v0][v1]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[v];` +
      `[a0][a1]acrossfade=d=${XFADE_D}[a]`;
    await execFileP(
      'ffmpeg',
      ['-y', '-i', aPath, '-i', bPath, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
      { maxBuffer: 1 << 26, timeout: 180000 },
    );
    return dest;
  }
  let body = seq[0];
  for (let k = 1; k < seq.length; k++) {
    const next = path.join(W, `xf_${String(k).padStart(2, '0')}.mp4`);
    process.stderr.write(`xfade pair ${k}/${seq.length - 1} +${path.basename(seq[k])}\n`);
    await xfadeTwo(body, seq[k], next);
    body = next;
  }

  const LEN = await dur(body);
  process.stderr.write(`xfade body ${LEN.toFixed(1)}s (expect ${expect.toFixed(1)}s)\n`);
  if (LEN < 60 || LEN < expect * 0.7) {
    throw new Error(`xfade truncated: body ${LEN.toFixed(1)}s expect ${expect.toFixed(1)}s — refusing to publish a stub`);
  }
  fs.mkdirSync(PUBLISH, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const final = path.join(PUBLISH, `${SLUG}-${CUT}-${stamp}.mp4`);
  const v15 = path.join(PUBLISH, `${SLUG}-v15.mp4`);
  const targetDur = Number(process.env.API_FILM_TARGET_DUR || 107);
  const voAt = voInfo.map((v) => ({ file: v.file, t: +(segStart(v.segIndex) + LEAD).toFixed(2) }));
  const donor = (process.env.API_FILM_AUDIO_FROM || '').trim();
  const haveVo = voAt.length > 0;
  if (!haveVo && !(donor && fs.existsSync(donor))) {
    throw new Error('voiceover required — no TTS files and no API_FILM_AUDIO_FROM (previous cut with VO)');
  }

  if (!haveVo) {
    const ad = await dur(donor);
    const take = Math.min(targetDur || ad, ad, LEN);
    const pts = (take / LEN).toFixed(6);
    process.stderr.write(`vo donor ${donor} ${ad.toFixed(1)}s — same onyx VO as the earlier cuts, picture fit to ${take.toFixed(1)}s\n`);
    await execFileP(
      'ffmpeg',
      [
        '-y', '-v', 'error', '-i', body, '-i', donor,
        '-filter_complex',
        `[0:v]setpts=${pts}*PTS,fps=${FPS},format=yuv420p,setsar=1[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:st=0:d=0.4,afade=t=out:st=${(take - 1.2).toFixed(2)}:d=1.2[a]`,
        '-map', '[v]', '-map', '[a]', '-t', take.toFixed(2),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', final,
      ],
      { maxBuffer: 1 << 27, timeout: 300000 },
    );
  } else {
    const music = pickMusic();
    if (!music) throw new Error('juicy unused Pixabay bed required — refusing brown-noise drone');
    process.stderr.write(`music ${music}\n`);
    let mf = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.22,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];`;
    const vl = [];
    voAt.forEach((v, k) => {
      const idx = k + 2;
      mf += `[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1[v${k}];`;
      vl.push(`[v${k}]`);
    });
    mf += `${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];`;
    mf += `[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];[premix]loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
    const mixIn = ['-i', body, '-stream_loop', '-1', '-i', music];
    voAt.forEach((v) => mixIn.push('-i', v.file));
    process.stderr.write(`final mix with ${voAt.length} voiceover stems\n`);
    await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', final], { maxBuffer: 1 << 27, timeout: 300000 });
  }

  fs.copyFileSync(final, v15);
  const poster = path.join(PUBLISH, `${SLUG}-v15-poster.jpg`);
  await execFileP('ffmpeg', ['-y', '-i', final, '-frames:v', '1', '-update', '1', poster], { timeout: 30000 });
  const qrSrc = path.join(HERE, 'qr/api-cta-qr.png');
  if (fs.existsSync(qrSrc)) fs.copyFileSync(qrSrc, path.join(PUBLISH, 'api-cta-qr.png'));
  fs.copyFileSync(qrCard, path.join(PUBLISH, 'api-cta-endcard.png'));
  const outDur = await dur(final);
  console.log(`DONE ${path.basename(final)} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${outDur.toFixed(0)}s)`);
  console.log(`PUBLIC ${PUBLIC}/${path.basename(v15)}`);
  console.log(`POSTER ${PUBLIC}/${path.basename(poster)}`);
  console.log(`CTA ${CTA}`);
  console.log('V15_OK');
  console.log('v13 and v14 and unversioned files were not written');
}

main().catch((e) => {
  console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message);
  process.exit(1);
});
