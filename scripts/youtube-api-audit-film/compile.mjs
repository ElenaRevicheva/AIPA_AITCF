#!/usr/bin/env node
/**
 * YouTube promo + walkthrough for aideazz.xyz/api
 *
 * Uses the Atuona Film Studio stack that already ships in this repo:
 *   Runway Gen-4.5 image→video (same path as /visualize runway)
 *   OpenAI TTS tts-1 / onyx / 0.9 via curl (node fetch hangs on Oracle)
 *   ffmpeg: 1920×1080 30fps, slow-mo not freeze, 1.3s xfade, mono title cards,
 *   intro MUST NOT fade in from black, sidechain-ducked music, loudnorm −16 LUFS
 *
 * Never build inside the git checkout. Work dir: /home/ubuntu/aideazz-api-film/
 * Publish: /var/www/influencer-images/youtube/  (NOT the Atuona poetry gallery)
 *
 * Copy scripts/atuona-film3.mjs settings — do not re-invent the chains.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileP0 = promisify(execFile);
async function execFileP(cmd, args, opts) {
  if (cmd === 'ffmpeg' || cmd === 'ffprobe') {
    fs.appendFileSync(path.join(BASE, 'ffmpeg-commands.log'), cmd + ' ' + args.map((a) => (/[\s\[\];,']/.test(a) ? `'${a}'` : a)).join(' ') + '\n\n');
  }
  return execFileP0(cmd, args, opts);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_FILM_DIR || '/home/ubuntu/aideazz-api-film';
const W = path.join(BASE, 'work');
const VODIR = path.join(BASE, 'vo');
const CLIPDIR = path.join(BASE, 'clips');
const ENV_FILE = process.env.CTO_ENV || '/home/ubuntu/cto-aipa/.env';
const ATUONA_MUSIC_DIR = '/home/ubuntu/cto-aipa/data/atuona/films/music';
const FILM_MUSIC_DIR = path.join(BASE, 'music');
// Poetry beds (FILM_COMPILATION_GUIDE table) + the first-alpha dark track this promo already burned.
const BURNED_MUSIC = /light in the void|fatal error|dark-cinematic-drone|atmospheric-dark-cinematic|morning-light-fresh-corporate|tropical-cocktail|fresh-tropical|distant-horizon/i;
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
const RUNWAY_API = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VER = '2024-11-06';
const RUNWAY_MODEL = 'gen4.5';
const MOTION_ANCHOR =
  'Premium live-action product film, natural film grain, slow prestige pacing, tactile atmosphere. Subtle motion only; do not invent new objects, people, animals, logos, or text. No cartoon, 3D, Pixar, or toy mascots.';

const FILM_TITLE = 'CAN AI FIND AND CITE YOU';
const FILM_SUB = '11.09.2026  ·  AIDEAZZ.XYZ/API  ·  FREE AUDIT';
const OUTRO_TITLE = 'AIDEAZZ.XYZ/API';
const OUTRO_SUB = 'AUDIT MY SITE  ·  FREE  ·  NO SIGNUP';
const SLUG = 'can-ai-find-and-cite-you';

function readEnvKey(n) {
  try {
    const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((x) => x.startsWith(n + '='));
    return l ? l.slice(n.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}
const OPENAI = (process.env.OPENAI_API_KEY || readEnvKey('OPENAI_API_KEY')).trim();
const RUNWAY = (process.env.RUNWAY_API_KEY || readEnvKey('RUNWAY_API_KEY')).trim();

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

async function runwayI2V(stillPath, promptText, destMp4) {
  if (!RUNWAY) throw new Error('RUNWAY_API_KEY missing');
  const body = {
    model: RUNWAY_MODEL,
    promptImage: dataUri(stillPath),
    promptText: `5-second fragment. ${MOTION_ANCHOR} ${promptText}`.slice(0, 900),
    duration: 5,
    watermark: false,
    ratio: '1280:720',
  };
  const create = await fetch(`${RUNWAY_API}/image_to_video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNWAY}`, 'Content-Type': 'application/json', 'X-Runway-Version': RUNWAY_VER },
    body: JSON.stringify(body),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`Runway create ${create.status}: ${createText.slice(0, 240)}`);
  const { id } = JSON.parse(createText);
  process.stderr.write(`runway job ${id} ${path.basename(stillPath)}\n`);
  for (let i = 0; i < 30; i++) {
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
    process.stderr.write(`runway ${id} ${j.status} (${i + 1}/30)\n`);
  }
  throw new Error('Runway poll timeout');
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

async function salvageWindow(dest, envSrc, envSs, envT, fallbackSrc, fallbackSs, fallbackT, label) {
  const src = process.env[envSrc] || fallbackSrc;
  if (!fs.existsSync(src) || fs.statSync(src).size < 1e6) return false;
  const ss = process.env[envSs] || fallbackSs;
  const t = process.env[envT] || fallbackT;
  try {
    await execFileP(
      'ffmpeg',
      ['-y', '-ss', ss, '-i', src, '-t', t, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', dest],
      { maxBuffer: 1 << 26, timeout: 120000 },
    );
    if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
      process.stderr.write(`salvage ${label} ${src} ss=${ss} t=${t} ${(fs.statSync(dest).size / 1e6).toFixed(1)}MB\n`);
      return true;
    }
  } catch (e) {
    process.stderr.write(`WARN salvage ${label}: ${e.message}\n`);
  }
  return false;
}

async function salvageCrawlers(dest) {
  if (
    await salvageWindow(
      dest,
      'API_FILM_CRAWLERS_SRC',
      'API_FILM_CRAWLERS_SS',
      'API_FILM_CRAWLERS_T',
      '/var/www/influencer-images/youtube/can-ai-find-and-cite-you-v2.mp4',
      '15.0',
      '7.0',
      'crawlers-v2',
    )
  ) {
    return true;
  }
  return salvageWindow(
    dest,
    'API_FILM_CRAWLERS_SRC2',
    'API_FILM_CRAWLERS_SS2',
    'API_FILM_CRAWLERS_T2',
    '/var/www/influencer-images/youtube/can-ai-find-and-cite-you-v5.mp4',
    '11.0',
    '7.0',
    'crawlers-v5',
  );
}

async function fruitSway(src, dest, seconds) {
  const take = Math.max(5.5, seconds || 7);
  const isImg = /\.(jpg|jpeg|png|webp)$/i.test(src);
  const motion = `scale=${WX + 88}:${HY + 88}:force_original_aspect_ratio=increase,crop=${WX}:${HY}:'(in_w-out_w)/2+40*sin(2*PI*t/2.3)':'(in_h-out_h)/2+22*cos(2*PI*t/1.8)',fps=${FPS},format=yuv420p,setsar=1`;
  const inputs = isImg ? ['-loop', '1', '-i', src] : ['-i', src];
  await execFileP(
    'ffmpeg',
    ['-y', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${motion}[v]`, '-map', '[v]', '-map', '1:a', '-t', take.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
  );
  return dest;
}

async function salvageGrapes(dest) {
  // Prefer the v7 stub (intro + grapevine) then the v2 Runway walk.
  if (
    await salvageWindow(
      dest,
      'API_FILM_GRAPES_SRC',
      'API_FILM_GRAPES_SS',
      'API_FILM_GRAPES_T',
      '/var/www/influencer-images/youtube/can-ai-find-and-cite-you-v2.mp4',
      '4.6',
      '5.4',
      'grapes-v2',
    )
  ) {
    return true;
  }
  return salvageWindow(
    dest,
    'API_FILM_GRAPES_SRC2',
    'API_FILM_GRAPES_SS2',
    'API_FILM_GRAPES_T2',
    '/var/www/influencer-images/youtube/can-ai-find-and-cite-you-v7.mp4',
    '4.5',
    '6.8',
    'grapes-v7',
  );
}

async function neuronPulse(src, dest, seconds, { sway, grow } = {}) {
  const take = Math.max(4.8, seconds || 6.2);
  const isImg = /\.(jpg|jpeg|png|webp)$/i.test(src);
  let motion;
  if (grow) {
    const pan = sway
      ? `'(in_w-out_w)/2+28*sin(2*PI*t/3.1)':'(in_h-out_h)/2-10*t+14*cos(2*PI*t/2.6)'`
      : `'(in_w-out_w)/2':'(in_h-out_h)/2-10*t'`;
    motion = `scale=${WX + 180}:${HY + 180}:force_original_aspect_ratio=increase,crop=${WX}:${HY}:${pan},fps=${FPS},format=yuv420p,setsar=1`;
  } else if (sway) {
    motion = `scale=${WX + 96}:${HY + 96}:force_original_aspect_ratio=increase,crop=${WX}:${HY}:'(in_w-out_w)/2+40*sin(2*PI*t/3.1)':'(in_h-out_h)/2+24*cos(2*PI*t/2.6)',fps=${FPS},format=yuv420p,setsar=1`;
  } else {
    motion = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},format=yuv420p,setsar=1`;
  }
  const fc =
    `[0:v]${motion},eq=saturation=1.28:contrast=1.08:brightness=0.04,split=2[base][hot];` +
    `[hot]eq=brightness=0.38:saturation=1.7,hue=h='275+35*sin(2*PI*t/1.25)',gblur=sigma=8[glow];` +
    `[base][glow]blend=all_mode=screen:all_opacity=0.40,setsar=1[v]`;
  const inputs = isImg ? ['-loop', '1', '-i', src] : ['-i', src];
  await execFileP(
    'ffmpeg',
    ['-y', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', fc, '-map', '[v]', '-map', '1:a', '-t', take.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
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
  if (pinned && fs.existsSync(pinned) && fs.statSync(pinned).size > 20000) return pinned;
  const lightName = /chill|house|sunset|groove|organic|lounge/i;
  for (const dir of [FILM_MUSIC_DIR, ATUONA_MUSIC_DIR]) {
    try {
      const files = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|wav)$/i.test(f) && !BURNED_MUSIC.test(f));
      const light = files.filter((f) => lightName.test(f));
      const pick = light[0] || files[0];
      if (pick) return path.join(dir, pick);
    } catch {}
  }
  return null;
}

async function makeDrone(out) {
  await execFileP(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'anoisesrc=color=brown:d=180:r=44100,lowpass=f=180,volume=0.35', '-f', 'lavfi', '-i', 'sine=frequency=55:duration=180', '-filter_complex', '[0:a][1:a]amix=inputs=2:weights=3 1,alimiter=limit=0.6[a]', '-map', '[a]', '-t', '180', out],
    { timeout: 60000 },
  );
  return out;
}

const BEATS = [
  {
    id: 'grapes',
    kind: 'runway',
    still: 'fruit/geo-grapes-citation.jpg',
    motion:
      'The grape cluster SWAYS on the vine. Individual berries shift a few millimetres. Dew slides. Neural constellation traces on each grape GLOW and fire — cyan then magenta pulses travel berry to berry like neurones. Slow prestige product film. There is only THIS cluster. No knife, no hand, no extra fruit, no text, no logo, no second vine.',
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
    id: 'split',
    kind: 'runway',
    still: 'fruit/geo-pomegranate-100-vs-72.jpg',
    motion:
      'Pomegranate halves breathe; circuit traces pulse cyan then magenta. Numbers 100 and 72 stay exactly where they are — do not morph, do not duplicate, do not add new numerals. Slow push. No extra fruit. No grapevine.',
    vo: 'Google ranked your page. In 2026 that is just half of the fruit.',
    cap: 'Google ranked your page —\nin 2026 that is just half of the fruit.',
    clipDur: 7.8,
    labels: [
      { text: 'GOOGLE', x: 'W*0.16', y: 'H*0.78', color: '0x7DFFB3', size: 72 },
      { text: 'CHATGPT', x: 'W*0.58', y: 'H*0.68', color: '0xFF7AE0', size: 72 },
    ],
  },
  {
    id: 'crawlers',
    kind: 'runway',
    still: 'fruit/geo-passionfruit-crawlers.jpg',
    motion:
      'Three glass crawlers WALK across the passionfruit pulp — legs shift, bodies orbit a few centimetres, purple cores pulse. Pulp glistens. Tiny living motion. Do not spawn a fourth crawler. No extra fruit. Do not invent text or names.',
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
    id: 'hand',
    kind: 'runway',
    still: 'fruit/geo-pomegranate-audit-hand.jpg',
    motion:
      'Water droplets fall. The glass HUD stays locked to the fruit. The hand is still. No extra hands, no blood, no new UI panels, no changing the 100 score.',
    vo: 'This is the free AI visibility audit at aideazz.xyz/api.',
    cap: 'Free AI visibility audit\naideazz.xyz/api',
    clipDur: 6.5,
  },
  {
    id: 'dashboard',
    kind: 'runway',
    still: 'fruit/geo-pomegranate-dashboard-2026.jpg',
    motion:
      'Juice droplets fall. The glass AI visibility dashboard stays locked to the fruit. The hand is still. Numbers stay 100. No extra hands, no blood, no new UI panels. Slow prestige product film.',
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
  process.stderr.write(`=== api-audit-film ${new Date().toISOString()} ===\n`);
  process.stderr.write(`OPENAI ${OPENAI ? 'yes' : 'NO'} RUNWAY ${RUNWAY ? 'yes' : 'NO'}\n`);

  if (RUNWAY) {
    process.stderr.write('Runway Gen-4.5 image→video (one at a time — parallel THROTTLEs)\n');
    for (const id of ['grapes', 'crawlers', 'dashboard', 'hand', 'split']) {
      const b = BEATS.find((x) => x.id === id && x.kind === 'runway');
      if (!b) continue;
      const still = path.join(HERE, b.still);
      const raw = path.join(CLIPDIR, `${b.id}.mp4`);
      const forceFruit = (b.id === 'grapes' || b.id === 'crawlers') && process.env.API_FILM_FORCE_FRUIT === '1';
      if (!forceFruit && fs.existsSync(raw) && fs.statSync(raw).size > 20000) {
        process.stderr.write(`runway cache hit ${b.id}\n`);
        continue;
      }
      if (forceFruit) process.stderr.write(`${b.id} rebuild — do not reuse a still cache\n`);
      try {
        await runwayI2V(still, b.motion, raw);
      } catch (e) {
        process.stderr.write(`WARN runway ${b.id}: ${e.message}\n`);
        if (b.id === 'crawlers' && (await salvageCrawlers(raw))) {
          const swayed = raw + '.sway.mp4';
          await fruitSway(raw, swayed, b.clipDur || 8.2);
          fs.renameSync(swayed, raw);
          process.stderr.write('crawlers salvaged + sway so insects keep moving\n');
        } else if (b.id === 'crawlers') {
          process.stderr.write('crawlers still+sway — insects stay in frame\n');
          await fruitSway(still, raw, b.clipDur || 8.2);
        } else if (b.id === 'grapes') {
          // v2 salvage at 4.6s is pomegranate/title, not this vine. Use the grape still.
          process.stderr.write('grapes from grape still + grow + neuron glow\n');
          await neuronPulse(still, raw, b.clipDur || 8.0, { sway: true, grow: true });
        } else {
          process.stderr.write(`still fallback ${b.id}\n`);
          await stillToClip(still, raw, 5.5);
        }
      }
    }
  }

  const cover = path.join(HERE, 'fruit/geo-pomegranate-100-vs-72.jpg');
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
      if (b.id === 'grapes') await neuronPulse(still, raw, clipDur, { sway: true, grow: true });
      else if (b.id === 'crawlers') await fruitSway(still, raw, clipDur);
      else await stillToClip(still, raw, 5.5);
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
    if (b.id === 'grapes') process.stderr.write('chapter What it checks on moving/growing grapes + neurones\n');
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

  const inputs = seq.flatMap((c) => ['-i', c]);
  let fc = '';
  for (let i = 0; i < seq.length; i++) {
    // Same SAR trap as v6 hero concat: grapes setsar=1 vs Runway 15709:15711 truncated the xfade to ~12s.
    fc += `[${i}:v]fps=${FPS},format=yuv420p,scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,setpts=PTS-STARTPTS[vx${i}];`;
    fc += `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,aresample=44100,asetpts=PTS-STARTPTS[ax${i}];`;
  }
  let vlab = 'vx0',
    alab = 'ax0',
    merged = durs[0];
  for (let k = 1; k < seq.length; k++) {
    const ofs = Math.max(0, merged - XFADE_D).toFixed(3);
    fc += `[${vlab}][vx${k}]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[vc${k}];`;
    fc += `[${alab}][ax${k}]acrossfade=d=${XFADE_D}[ac${k}];`;
    vlab = `vc${k}`;
    alab = `ac${k}`;
    merged += durs[k] - XFADE_D;
  }
  const body = path.join(W, 'body.mp4');
  process.stderr.write('xfade concat...\n');
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', body], {
    maxBuffer: 1 << 27,
    timeout: 900000,
  });

  const LEN = await dur(body);
  process.stderr.write(`xfade body ${LEN.toFixed(1)}s (expect ${expect.toFixed(1)}s)\n`);
  if (LEN < 60 || LEN < expect * 0.7) {
    throw new Error(`xfade truncated: body ${LEN.toFixed(1)}s expect ${expect.toFixed(1)}s — refusing to publish a stub`);
  }
  fs.mkdirSync(PUBLISH, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const final = path.join(PUBLISH, `${SLUG}-${stamp}.mp4`);
  const stable = path.join(PUBLISH, `${SLUG}.mp4`);
  const v12 = path.join(PUBLISH, `${SLUG}-v12.mp4`);
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
    let music = pickMusic();
    if (!music) music = await makeDrone(path.join(W, 'drone.mp3'));
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

  fs.copyFileSync(final, stable);
  fs.copyFileSync(final, v12);
  const poster = path.join(PUBLISH, `${SLUG}-poster.jpg`);
  await execFileP('ffmpeg', ['-y', '-i', final, '-frames:v', '1', '-update', '1', poster], { timeout: 30000 });
  const qrSrc = path.join(HERE, 'qr/api-cta-qr.png');
  if (fs.existsSync(qrSrc)) fs.copyFileSync(qrSrc, path.join(PUBLISH, 'api-cta-qr.png'));
  fs.copyFileSync(qrCard, path.join(PUBLISH, 'api-cta-endcard.png'));
  const outDur = await dur(final);
  console.log(`DONE ${path.basename(final)} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${outDur.toFixed(0)}s)`);
  console.log(`PUBLIC ${PUBLIC}/${path.basename(v12)}`);
  console.log(`STABLE ${PUBLIC}/${path.basename(stable)}`);
  console.log(`POSTER ${PUBLIC}/${path.basename(poster)}`);
  console.log(`CTA ${CTA}`);
}

main().catch((e) => {
  console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message);
  process.exit(1);
});
