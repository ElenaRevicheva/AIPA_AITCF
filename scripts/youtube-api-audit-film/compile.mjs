#!/usr/bin/env node
/**
 * YouTube promo + walkthrough for aideazz.xyz/api
 *
 * HD path (11 Sep 2026, Elena: "make super high quality"):
 *   Luma Ray 3.2 image→video at native 1080p 16:9
 *   Runway Gen-4.5 720p only as fallback (lanczos + unsharp, never setpts-stretch)
 *   Ken Burns on the original still if both APIs fail
 *   ffmpeg 1920×1080 30fps, CRF 14, preset medium, lanczos
 *   OpenAI TTS tts-1 / onyx / 0.9 via curl — VO STRINGS ARE FROZEN
 *
 * Never build inside the git checkout. Work dir: /home/ubuntu/aideazz-api-film/
 * Publish: /var/www/influencer-images/youtube/  (NOT the Atuona poetry gallery)
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
const BURNED_MUSIC = /light in the void|fatal error|dark-cinematic-drone|atmospheric-dark-cinematic|morning-light-fresh-corporate|tropical-cocktail|fresh-tropical/i;
const PUBLISH = process.env.API_FILM_PUBLISH || path.join(BASE, 'out');
const PUBLIC = 'https://webhook.aideazz.xyz/influencer-images/youtube';
const STILL_BASE = process.env.API_FILM_STILL_BASE || `${PUBLIC}/stills`;

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const SANS = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : FONT;
const XFADE_D = 1.0, LEAD = 0.7, TAIL = 1.9, SPEED = 0.9;
const WX = 1920, HY = 1080, FPS = 30;
const CRF = '14';
const PRESET = 'medium';
const VCODEC = ['-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-profile:v', 'high'];
const SCALE = `scale=${WX}:${HY}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WX}:${HY},fps=${FPS},format=yuv420p`;
const SCALE_SHARP = `scale=${WX}:${HY}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WX}:${HY},unsharp=5:5:0.6:5:5:0.0,fps=${FPS},format=yuv420p`;

const RUNWAY_API = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VER = '2024-11-06';
const RUNWAY_MODEL = 'gen4.5';
const LUMA_API = (process.env.LUMA_API_BASE || 'https://agents.lumalabs.ai/v1').replace(/\/$/, '');
const LUMA_MODEL = process.env.LUMA_VIDEO_MODEL || 'ray-3.2';
const MOTION_ANCHOR =
  'Premium live-action product film, natural film grain, slow prestige pacing, tactile atmosphere. Subtle motion only; do not invent new objects, people, animals, logos, or text. No cartoon, 3D, Pixar, or toy mascots.';

const FILM_TITLE = 'CAN AI FIND AND CITE YOU';
const FILM_SUB = '11.09.2026  ·  AIDEAZZ.XYZ/API  ·  FREE AUDIT';
const SLUG = 'can-ai-find-and-cite-you';
const CTA = 'https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta';

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
const LUMA = (process.env.LUMA_API_KEY || readEnvKey('LUMA_API_KEY')).trim();

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
async function videoWidth(f) {
  try {
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', f]);
    return parseInt(String(stdout).trim(), 10) || 0;
  } catch {
    return 0;
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

function extractLumaVideoUrl(statusData) {
  const v = statusData?.assets?.video;
  if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v.trim();
  const out = statusData?.output;
  if (Array.isArray(out)) {
    const vid = out.find((o) => o?.type === 'video' && typeof o?.url === 'string') || out.find((o) => typeof o?.url === 'string');
    if (vid?.url && /^https?:\/\//i.test(vid.url)) return String(vid.url).trim();
  }
  return null;
}

async function lumaI2V(publicUrl, promptText, destMp4) {
  if (!LUMA) throw new Error('LUMA_API_KEY missing');
  if (!publicUrl) throw new Error('luma needs a public still URL');
  const body = {
    model: LUMA_MODEL,
    type: 'video',
    resolution: '1080p',
    prompt: `9-second fragment. ${MOTION_ANCHOR} ${promptText}`.slice(0, 500),
    keyframes: { frame0: { type: 'image', url: publicUrl } },
    aspect_ratio: '16:9',
    duration: '9s',
    loop: false,
  };
  const create = await fetch(`${LUMA_API}/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LUMA}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`Luma create ${create.status}: ${createText.slice(0, 240)}`);
  const { id } = JSON.parse(createText);
  process.stderr.write(`luma job ${id} 1080p ${path.basename(publicUrl)}\n`);
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const st = await fetch(`${LUMA_API}/generations/${id}`, {
      headers: { Authorization: `Bearer ${LUMA}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await st.text();
    if (!st.ok) {
      process.stderr.write(`luma poll HTTP ${st.status}\n`);
      continue;
    }
    const j = JSON.parse(raw);
    const url = extractLumaVideoUrl(j);
    if ((j.state === 'completed' || j.status === 'completed') && url) {
      await execFileP0('curl', ['-sS', '-L', '-o', destMp4, url], { timeout: 180000 });
      if (!fs.existsSync(destMp4) || fs.statSync(destMp4).size < 10000) throw new Error('luma download empty');
      process.stderr.write(`luma ok ${path.basename(destMp4)} ${(fs.statSync(destMp4).size / 1e6).toFixed(1)}MB w=${await videoWidth(destMp4)}\n`);
      return destMp4;
    }
    if (j.state === 'failed' || j.status === 'failed') throw new Error(`Luma FAILED: ${j.failure_reason || raw.slice(0, 200)}`);
    process.stderr.write(`luma ${id} ${j.state || j.status} (${i + 1}/24)\n`);
  }
  throw new Error('Luma poll timeout');
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
      process.stderr.write(`runway ok ${path.basename(destMp4)} ${(fs.statSync(destMp4).size / 1e6).toFixed(1)}MB (720p — will lanczos)\n`);
      return destMp4;
    }
    if (j.status === 'FAILED') throw new Error(`Runway FAILED: ${j.failure || raw.slice(0, 200)}`);
    process.stderr.write(`runway ${id} ${j.status} (${i + 1}/30)\n`);
  }
  throw new Error('Runway poll timeout');
}

async function kenBurns(stillPath, dest, seconds) {
  const frames = Math.max(2, Math.round(seconds * FPS));
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WX}:${HY},zoompan=z='min(zoom+0.00045,1.08)':d=${frames}:s=${WX}x${HY}:fps=${FPS},format=yuv420p`;
  await execFileP(
    'ffmpeg',
    ['-y', '-loop', '1', '-i', stillPath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function makeCard(titleRaw, subRaw, outFile, d, titleSize, bgImage, noFadeIn) {
  const tFile = outFile + '_t.txt';
  fs.writeFileSync(tFile, track(titleRaw));
  let draw = `drawtext=fontfile=${MONO}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=(h-text_h)/2-26`;
  if (subRaw && subRaw.trim()) {
    const sFile = outFile + '_s.txt';
    fs.writeFileSync(sFile, wrap(caps(subRaw), 56, 2));
    draw += `,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=22:line_spacing=10:x=(w-text_w)/2:y=(h/2)+48`;
  }
  const fades = `${noFadeIn ? '' : 'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;
  if (bgImage && fs.existsSync(bgImage)) {
    const vf = `${SCALE.replace(',format=yuv420p', '')},eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP(
      'ffmpeg',
      ['-y', '-loop', '1', '-i', bgImage, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile],
      { maxBuffer: 1 << 26, timeout: 90000 },
    );
  } else {
    await execFileP(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${WX}x${HY}:r=${FPS}:d=${d.toFixed(2)}`, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${draw},${fades}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile],
      { maxBuffer: 1 << 26, timeout: 90000 },
    );
  }
  return outFile;
}

async function takeNative(src, dest, seconds, startAt, sharp) {
  const ss = Math.max(0, startAt || 0);
  const vf = sharp ? SCALE_SHARP : SCALE;
  await execFileP(
    'ffmpeg',
    ['-y', '-ss', ss.toFixed(3), '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
  );
  return dest;
}

async function loopNative(src, dest, seconds, sharp) {
  const vf = sharp ? SCALE_SHARP : SCALE;
  await execFileP(
    'ffmpeg',
    ['-y', '-stream_loop', '-1', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 180000 },
  );
  return dest;
}

async function concatClips(parts, dest) {
  if (parts.length === 1) {
    fs.copyFileSync(parts[0], dest);
    return dest;
  }
  const inputs = parts.flatMap((p) => ['-i', p]);
  let fc = '';
  for (let i = 0; i < parts.length; i++) fc += `[${i}:v][${i}:a]`;
  fc += `concat=n=${parts.length}:v=1:a=1[v][a]`;
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest], { maxBuffer: 1 << 26, timeout: 180000 });
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

async function stillToClip(src, dest, seconds) {
  const vf = SCALE;
  await execFileP(
    'ffmpeg',
    ['-y', '-loop', '1', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function buildUiClip(b, clipDur, loomState) {
  const parts = [];
  let remain = clipDur;
  if (b.liveStill) {
    const stillPath = path.join(HERE, b.liveStill);
    if (fs.existsSync(stillPath)) {
      const hold = Math.min(1.6, Math.max(1.1, clipDur * 0.22));
      const p = path.join(W, `still_${b.id}.mp4`);
      await stillToClip(stillPath, p, hold);
      parts.push(p);
      remain -= hold;
      process.stderr.write(`ui still ${b.id} ${hold.toFixed(1)}s ${b.liveStill}\n`);
    }
  }
  const leftover = loomState.path ? Math.max(0, loomState.end - 0.15 - loomState.t) : 0;
  if (loomState.path && leftover > 0.45 && remain > 0.45) {
    const take = Math.min(remain, leftover);
    const slice = path.join(W, `loom_${b.id}.mp4`);
    await takeNative(loomState.path, slice, take, loomState.t, false);
    process.stderr.write(`ui loom ${b.id} ${take.toFixed(1)}s @${loomState.t.toFixed(1)} (1x, no wrap)\n`);
    loomState.t += take;
    parts.push(slice);
    remain -= take;
  }
  if (remain > 0.4) {
    const still = path.join(HERE, b.liveStill || b.still);
    const pad = path.join(W, `pad_${b.id}.mp4`);
    await stillToClip(still, pad, remain);
    parts.push(pad);
  }
  if (!parts.length) {
    const still = path.join(HERE, b.still);
    await stillToClip(still, path.join(W, `fb_${b.id}.mp4`), clipDur);
    parts.push(path.join(W, `fb_${b.id}.mp4`));
  }
  const raw = path.join(CLIPDIR, `${b.id}.mp4`);
  await concatClips(parts, raw);
  return raw;
}

function labelFilter(labels) {
  return labels
    .map((L) => {
      const col = L.color || '0x7DFFFB';
      const fs = L.size || 42;
      const escaped = String(L.text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
      return `drawtext=fontfile=${SANS}:text='${escaped}':fontcolor=${col}:fontsize=${fs}:borderw=2:bordercolor=black@0.65:box=1:boxcolor=black@0.45:boxborderw=14:x=${L.x}:y=${L.y}`;
    })
    .join(',');
}

async function overlayLabels(src, dest, labels) {
  if (!labels || !labels.length) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-vf', labelFilter(labels), ...VCODEC, '-c:a', 'copy', dest],
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
  fs.writeFileSync(txt, wrap(caption, 48, 5));
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  const draw = `drawtext=fontfile=${FONT}:textfile=${txt}:expansion=none:fontcolor=white:fontsize=28:line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=16:x=(w-text_w)/2:y=h-text_h-48:alpha='${alpha}'`;
  await execFileP(
    'ffmpeg',
    ['-y', '-i', src, '-vf', draw, ...VCODEC, '-c:a', 'copy', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

function pickMusic() {
  const pinned = (process.env.API_FILM_MUSIC || '').trim();
  if (pinned && fs.existsSync(pinned) && fs.statSync(pinned).size > 20000) return pinned;
  const lightName = /chill|house|horizon|lounge|organic|sunset|groove|deep-house|distant/i;
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

// VO + captions are frozen. Do not edit the vo/cap strings.
const BEATS = [
  {
    id: 'split',
    kind: 'motion',
    still: 'fruit/geo-pomegranate-100-vs-72.jpg',
    motion:
      'Pomegranate halves breathe; circuit traces pulse cyan then magenta. Numbers 100 and 72 stay exactly where they are — do not morph, do not duplicate, do not add new numerals. Slow push. No extra fruit. No grapevine.',
    vo: 'Google ranked your page. In 2026 that is just half of the fruit.',
    cap: 'Google ranked your page —\nin 2026 that is just half of the fruit.',
    labels: [
      { text: 'GOOGLE', x: 430, y: 640, color: '0x7DFFB3', size: 48 },
      { text: 'CHATGPT', x: 1180, y: 150, color: '0xFF7AE0', size: 48 },
    ],
  },
  {
    id: 'crawlers',
    kind: 'motion',
    still: 'fruit/geo-passionfruit-crawlers.jpg',
    motion:
      'Three glass crawlers shift weight on passionfruit pulp, purple cores pulse. Pulp glistens. Tiny orbit. Do not spawn a fourth crawler. No extra fruit. Do not invent text.',
    vo: 'Six crawlers decide whether ChatGPT, Claude, Gemini and Perplexity can quote you.',
    cap: 'Six crawlers decide who gets cited.',
    labels: [
      { text: 'GPTBot', x: 160, y: 36, color: '0x7DFFFB', size: 36 },
      { text: 'ClaudeBot', x: 1280, y: 48, color: '0xFFB347', size: 36 },
      { text: 'PerplexityBot', x: 680, y: 430, color: '0xFF7AE0', size: 36 },
    ],
  },
  {
    id: 'hand',
    kind: 'motion',
    still: 'fruit/geo-pomegranate-audit-hand.jpg',
    motion:
      'Water droplets fall. The glass HUD stays locked to the fruit. The hand is still. No extra hands, no blood, no new UI panels, no changing the 100 score.',
    vo: 'This is the free AI visibility audit at aideazz.xyz/api.',
    cap: 'Free AI visibility audit\naideazz.xyz/api',
  },
  { id: 'hero', kind: 'ui', still: 'ui/ui-hero.png', liveStill: 'ui/live-hero.png', vo: 'Paste a public URL. We read the page directly — thirty-four signals, no signup, no scraping bill.', cap: '34 signals. Direct page reads. No signup.' },
  { id: 'form', kind: 'ui', still: 'ui/ui-form.png', vo: 'Type yourwebsite.com. Click Audit my site.', cap: 'Paste the URL. Audit my site.' },
  { id: 'auditing', kind: 'ui', still: 'ui/ui-auditing.png', vo: 'Seconds later the score lands — and whether each engine can even read the site.', cap: 'Auditing… 34 signals.' },
  { id: 'score', kind: 'ui', still: 'ui/ui-score.png', vo: 'One AI Visibility Score, then GPTBot, ClaudeBot, Perplexity, Gemini, Google-Extended.', cap: 'Score, then which engines can read you.' },
  { id: 'checks', kind: 'ui', still: 'ui/ui-checks.png', vo: 'Every check shows what we saw, why it matters, and how to fix the ones that fail. Not five tips. All thirty-four.', cap: 'What we saw. Why it matters. How to fix it.' },
  { id: 'categories', kind: 'ui', still: 'ui/ui-categories.png', liveStill: 'ui/live-categories.png', vo: 'Crawler access. Structured data. Answer-readiness. Technical foundation. Same weights as the live API.', cap: 'Four categories. One score.' },
  { id: 'cta', kind: 'ui', still: 'ui/ui-cta.png', liveStill: 'ui/live-cta.png', vo: 'Free. Run yours now. aideazz.xyz/api', cap: 'aideazz.xyz/api' },
];

async function fruitMotion(b, dest) {
  const still = path.join(HERE, b.still);
  const publicUrl = `${STILL_BASE}/${path.basename(b.still)}`;
  if (LUMA) {
    try {
      await lumaI2V(publicUrl, b.motion, dest);
      return { sharp: (await videoWidth(dest)) < 1800 };
    } catch (e) {
      process.stderr.write(`WARN luma ${b.id}: ${e.message}\n`);
    }
  }
  if (RUNWAY) {
    try {
      await runwayI2V(still, b.motion, dest);
      return { sharp: true };
    } catch (e) {
      process.stderr.write(`WARN runway ${b.id}: ${e.message}\n`);
    }
  }
  process.stderr.write(`fruit ${b.id}: Ken Burns HD still (no I2V)\n`);
  await kenBurns(still, dest, 9);
  return { sharp: false };
}

async function main() {
  for (const d of [BASE, W, VODIR, CLIPDIR, PUBLISH]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BASE, 'ffmpeg-commands.log'), '');
  process.stderr.write(`=== api-audit-film ${new Date().toISOString()} HD luma=${LUMA ? 'yes' : 'NO'} runway=${RUNWAY ? 'yes' : 'NO'} ===\n`);
  process.stderr.write(`OPENAI ${OPENAI ? 'yes' : 'NO'}\n`);

  const fruitMeta = {};
  for (const b of BEATS.filter((x) => x.kind === 'motion')) {
    const raw = path.join(CLIPDIR, `${b.id}.mp4`);
    if (fs.existsSync(raw) && fs.statSync(raw).size > 20000 && (await videoWidth(raw)) >= 1800) {
      process.stderr.write(`motion cache hit HD ${b.id} w=${await videoWidth(raw)}\n`);
      fruitMeta[b.id] = { sharp: false };
      continue;
    }
    try {
      if (fs.existsSync(raw)) fs.unlinkSync(raw);
    } catch {}
    fruitMeta[b.id] = await fruitMotion(b, raw);
  }

  const cover = path.join(HERE, 'fruit/geo-pomegranate-100-vs-72.jpg');
  const seq = [];
  seq.push(await makeCard(FILM_TITLE, FILM_SUB, path.join(W, 'card_intro.mp4'), 3.6, 52, cover, true));

  const loomPath = findLoom();
  const loomState = { path: loomPath, t: 0.2, end: loomPath ? await dur(loomPath) : 0 };
  process.stderr.write(loomPath ? `loom ${loomPath} dur=${loomState.end.toFixed(1)}s w=${await videoWidth(loomPath)}\n` : 'WARN no Loom walkthrough — UI stills only\n');

  const voInfo = [];
  for (let i = 0; i < BEATS.length; i++) {
    const b = BEATS[i];
    const still = path.join(HERE, b.still);
    if (!fs.existsSync(still) && b.kind !== 'ui') throw new Error('missing still ' + still);
    let voFile = null,
      vd = 0;
    if (b.vo) {
      voFile = path.join(VODIR, `v_${b.id}.mp3`);
      if (!(fs.existsSync(voFile) && fs.statSync(voFile).size > 1000)) await tts(b.vo, voFile);
      vd = await dur(voFile);
    }
    const clipDur = b.vo ? Math.max(6.5, LEAD + vd + TAIL) : 5.5;
    let raw = path.join(CLIPDIR, `${b.id}.mp4`);
    if (b.kind === 'ui') {
      raw = await buildUiClip(b, clipDur, loomState);
    } else if (!(fs.existsSync(raw) && fs.statSync(raw).size > 20000)) {
      await kenBurns(still, raw, 9);
    }
    const sharp = !!(fruitMeta[b.id] && fruitMeta[b.id].sharp);
    const conformed = path.join(W, `n_${b.id}.mp4`);
    if (b.kind === 'ui' && Math.abs((await dur(raw)) - clipDur) < 0.35 && (await videoWidth(raw)) >= 1800) {
      fs.copyFileSync(raw, conformed);
    } else {
      await loopNative(raw, conformed, clipDur, sharp);
    }
    const labeled = path.join(W, `lb_${b.id}.mp4`);
    await overlayLabels(conformed, labeled, b.labels);
    const baked = path.join(W, `fc_${String(i).padStart(2, '0')}.mp4`);
    await bakeCaption(labeled, baked, b.cap, clipDur);
    seq.push(baked);
    if (voFile) voInfo.push({ segIndex: i + 1, file: voFile });
    process.stderr.write(`beat ${i + 1}/${BEATS.length} ${b.id} dur=${clipDur.toFixed(1)} vo=${b.vo ? vd.toFixed(1) : '-'} w=${await videoWidth(baked)}\n`);
  }

  const qrCard = path.join(HERE, 'qr/api-cta-endcard.png');
  if (!fs.existsSync(qrCard)) throw new Error('missing QR end card ' + qrCard);
  const qrOut = path.join(W, 'card_qr.mp4');
  await kenBurns(qrCard, qrOut, 6.8);
  seq.push(qrOut);
  process.stderr.write(`qr outro 6.8s ${CTA}\n`);

  const durs = [];
  for (const c of seq) durs.push(await dur(c));
  const segStart = (k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += durs[i];
    return Math.max(0, s - k * XFADE_D);
  };

  const inputs = seq.flatMap((c) => ['-i', c]);
  let fc = '';
  let vlab = '0:v',
    alab = '0:a',
    merged = durs[0];
  for (let k = 1; k < seq.length; k++) {
    const ofs = Math.max(0, merged - XFADE_D).toFixed(3);
    fc += `[${vlab}][${k}:v]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[vc${k}];`;
    fc += `[${alab}][${k}:a]acrossfade=d=${XFADE_D}[ac${k}];`;
    vlab = `vc${k}`;
    alab = `ac${k}`;
    merged += durs[k] - XFADE_D;
  }
  const body = path.join(W, 'body.mp4');
  process.stderr.write('xfade concat (1080p CRF14)...\n');
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`, ...VCODEC, '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', body], {
    maxBuffer: 1 << 27,
    timeout: 600000,
  });

  const LEN = await dur(body);
  let music = pickMusic();
  if (!music) music = await makeDrone(path.join(W, 'drone.mp3'));
  process.stderr.write(`music ${music}\n`);

  const voAt = voInfo.map((v) => ({ file: v.file, t: +(segStart(v.segIndex) + LEAD).toFixed(2) }));
  let mf = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.20,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];`;
  const vl = [];
  if (voAt.length) {
    voAt.forEach((v, k) => {
      const idx = k + 2;
      mf += `[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1[v${k}];`;
      vl.push(`[v${k}]`);
    });
    mf += `${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];`;
    mf += `[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];[premix]loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  } else {
    mf += `[music]loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  }
  const mixIn = ['-i', body, '-stream_loop', '-1', '-i', music];
  voAt.forEach((v) => mixIn.push('-i', v.file));
  fs.mkdirSync(PUBLISH, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const final = path.join(PUBLISH, `${SLUG}-${stamp}.mp4`);
  const stable = path.join(PUBLISH, `${SLUG}.mp4`);
  const v3 = path.join(PUBLISH, `${SLUG}-v3.mp4`);
  process.stderr.write('final mix...\n');
  await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '256k', '-movflags', '+faststart', final], { maxBuffer: 1 << 27, timeout: 300000 });
  fs.copyFileSync(final, stable);
  fs.copyFileSync(final, v3);
  const poster = path.join(PUBLISH, `${SLUG}-poster.jpg`);
  await execFileP('ffmpeg', ['-y', '-i', final, '-frames:v', '1', '-q:v', '2', poster], { timeout: 30000 });
  const qrPub = path.join(PUBLISH, 'api-cta-qr.png');
  const qrSrc = path.join(HERE, 'qr/api-cta-qr.png');
  if (fs.existsSync(qrSrc)) fs.copyFileSync(qrSrc, qrPub);
  const endPub = path.join(PUBLISH, 'api-cta-endcard.png');
  fs.copyFileSync(qrCard, endPub);
  console.log(`DONE ${path.basename(final)} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${LEN.toFixed(0)}s, w=${await videoWidth(final)})`);
  console.log(`PUBLIC ${PUBLIC}/${path.basename(v3)}`);
  console.log(`STABLE ${PUBLIC}/${path.basename(stable)}`);
  console.log(`POSTER ${PUBLIC}/${path.basename(poster)}`);
  console.log(`QR ${PUBLIC}/api-cta-qr.png`);
  console.log(`CTA ${CTA}`);
}

main().catch((e) => {
  console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message);
  process.exit(1);
});
