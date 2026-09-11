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
    fs.writeFileSync(sFile, wrap(caps(subRaw), 56, 2));
    draw += `,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=22:line_spacing=10:x=(w-text_w)/2:y=(h/2)+48`;
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
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},format=yuv420p`;
  await execFileP(
    'ffmpeg',
    ['-y', '-ss', ss.toFixed(3), '-stream_loop', '-1', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
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
  if (b.liveStill) {
    const stillPath = path.join(HERE, b.liveStill);
    if (fs.existsSync(stillPath)) {
      const hold = Math.min(1.8, Math.max(1.2, clipDur * 0.28));
      const p = path.join(W, `still_${b.id}.mp4`);
      await stillToClip(stillPath, p, hold);
      parts.push(p);
      remain -= hold;
      process.stderr.write(`ui still ${b.id} ${hold.toFixed(1)}s ${b.liveStill}\n`);
    }
  }
  if (loomState.path && remain > 0.5) {
    const slice = path.join(W, `loom_${b.id}.mp4`);
    if (loomState.t + remain > loomState.end - 0.2) loomState.t = 0.4;
    await fillClip(loomState.path, slice, remain, loomState.t);
    loomState.t += remain;
    parts.push(slice);
    process.stderr.write(`ui loom ${b.id} ${remain.toFixed(1)}s @${(loomState.t - remain).toFixed(1)}\n`);
  } else if (!parts.length) {
    const still = path.join(HERE, b.still);
    await stillToClip(still, path.join(W, `fb_${b.id}.mp4`), clipDur);
    parts.push(path.join(W, `fb_${b.id}.mp4`));
  }
  const raw = path.join(CLIPDIR, `${b.id}.mp4`);
  await concatClips(parts, raw);
  return raw;
}

async function stillToClip(src, dest, seconds) {
  // Hold, don't zoom — UI type must stay readable. Fruit motion comes from Runway.
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=increase,crop=${WX}:${HY},fps=${FPS},format=yuv420p`;
  await execFileP(
    'ffmpeg',
    ['-y', '-loop', '1', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', seconds.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', dest],
    { maxBuffer: 1 << 26, timeout: 120000 },
  );
  return dest;
}

async function normalizeVideo(src, dest, clipDur) {
  const nat = await dur(src);
  const factor = (clipDur / nat).toFixed(5);
  const vf = `scale=${WX}:${HY}:force_original_aspect_ratio=decrease,pad=${WX}:${HY}:(ow-iw)/2:(oh-ih)/2:black,setpts=${factor}*PTS,fps=${FPS},format=yuv420p`;
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
  fs.writeFileSync(txt, wrap(caption, 48, 5));
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  const draw = `drawtext=fontfile=${FONT}:textfile=${txt}:expansion=none:fontcolor=white:fontsize=28:line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=16:x=(w-text_w)/2:y=h-text_h-48:alpha='${alpha}'`;
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
    id: 'split',
    kind: 'runway',
    still: 'fruit/geo-pomegranate-100-vs-72.jpg',
    motion:
      'Pomegranate halves breathe; circuit traces pulse cyan then magenta. Numbers 100 and 72 stay exactly where they are — do not morph, do not duplicate, do not add new numerals. Slow push. No extra fruit. No grapevine.',
    vo: 'Google ranked your page. In 2026 that is just half of the fruit.',
    cap: 'Google ranked your page —\nin 2026 that is just half of the fruit.',
    labels: [
      { text: 'GOOGLE', x: 'W*0.22', y: 'H*0.55', color: '0x7DFFB3', size: 56 },
      { text: 'CHATGPT', x: 'W*0.58', y: 'H*0.08', color: '0xFF7AE0', size: 56 },
    ],
  },
  {
    id: 'crawlers',
    kind: 'runway',
    still: 'fruit/geo-passionfruit-crawlers.jpg',
    motion:
      'Three glass crawlers shift weight on passionfruit pulp, purple cores pulse. Pulp glistens. Tiny orbit. Do not spawn a fourth crawler. No extra fruit. Do not invent text.',
    vo: 'Six crawlers decide whether ChatGPT, Claude, Gemini and Perplexity can quote you.',
    cap: 'Six crawlers decide who gets cited.',
    labels: [
      { text: 'GPTBot', x: 'W*0.22', y: 'H*0.05', color: '0x7DFFFB', size: 34 },
      { text: 'ClaudeBot', x: 'W*0.68', y: 'H*0.05', color: '0xFFB347', size: 34 },
      { text: 'PerplexityBot', x: '(W-text_w)/2', y: 'H*0.40', color: '0xFF7AE0', size: 34 },
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
  },
  { id: 'hero', kind: 'ui', still: 'ui/ui-hero.png', liveStill: 'ui/live-hero.png', vo: 'Paste a public URL. We read the page directly — thirty-four signals, no signup, no scraping bill.', cap: '34 signals. Direct page reads. No signup.' },
  { id: 'form', kind: 'ui', still: 'ui/ui-form.png', vo: 'Type yourwebsite.com. Click Audit my site.', cap: 'Paste the URL. Audit my site.' },
  { id: 'auditing', kind: 'ui', still: 'ui/ui-auditing.png', vo: 'Seconds later the score lands — and whether each engine can even read the site.', cap: 'Auditing… 34 signals.' },
  { id: 'score', kind: 'ui', still: 'ui/ui-score.png', vo: 'One AI Visibility Score, then GPTBot, ClaudeBot, Perplexity, Gemini, Google-Extended.', cap: 'Score, then which engines can read you.' },
  { id: 'checks', kind: 'ui', still: 'ui/ui-checks.png', vo: 'Every check shows what we saw, why it matters, and how to fix the ones that fail. Not five tips. All thirty-four.', cap: 'What we saw. Why it matters. How to fix it.' },
  { id: 'categories', kind: 'ui', still: 'ui/ui-categories.png', liveStill: 'ui/live-categories.png', vo: 'Crawler access. Structured data. Answer-readiness. Technical foundation. Same weights as the live API.', cap: 'Four categories. One score.' },
  { id: 'cta', kind: 'ui', still: 'ui/ui-cta.png', liveStill: 'ui/live-cta.png', vo: 'Free. Run yours now. aideazz.xyz/api', cap: 'aideazz.xyz/api' },
];

async function main() {
  for (const d of [BASE, W, VODIR, CLIPDIR, PUBLISH]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BASE, 'ffmpeg-commands.log'), '');
  process.stderr.write(`=== api-audit-film ${new Date().toISOString()} ===\n`);
  process.stderr.write(`OPENAI ${OPENAI ? 'yes' : 'NO'} RUNWAY ${RUNWAY ? 'yes' : 'NO'}\n`);

  if (RUNWAY) {
    process.stderr.write('Runway Gen-4.5 image→video (one at a time — parallel THROTTLEs)\n');
    for (const b of BEATS.filter((x) => x.kind === 'runway')) {
      const still = path.join(HERE, b.still);
      const raw = path.join(CLIPDIR, `${b.id}.mp4`);
      if (fs.existsSync(raw) && fs.statSync(raw).size > 20000) {
        process.stderr.write(`runway cache hit ${b.id}\n`);
        continue;
      }
      try {
        await runwayI2V(still, b.motion, raw);
      } catch (e) {
        process.stderr.write(`WARN runway ${b.id}: ${e.message} — still fallback\n`);
        await stillToClip(still, raw, 5.5);
      }
    }
  }

  const cover = path.join(HERE, 'fruit/geo-pomegranate-100-vs-72.jpg');
  const seq = [];
  seq.push(await makeCard(FILM_TITLE, FILM_SUB, path.join(W, 'card_intro.mp4'), 4.4, 52, cover, true));

  const loomPath = findLoom();
  const loomState = { path: loomPath, t: 0.4, end: loomPath ? await dur(loomPath) : 0 };
  process.stderr.write(loomPath ? `loom ${loomPath} dur=${loomState.end.toFixed(1)}s\n` : 'WARN no Loom walkthrough — UI stills only\n');

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
    let raw = path.join(CLIPDIR, `${b.id}.mp4`);
    const clipDur = b.vo ? Math.max(6.5, LEAD + vd + TAIL) : 5.5;
    if (b.kind === 'ui') {
      raw = await buildUiClip(b, clipDur, loomState);
    } else {
      if (!(fs.existsSync(raw) && fs.statSync(raw).size > 20000)) {
        await stillToClip(still, raw, 5.5);
      }
    }
    const nat = await dur(raw);
    const normDur = b.kind === 'ui' ? clipDur : b.vo ? Math.max(nat, LEAD + vd + TAIL) : Math.min(Math.max(nat, 4.8), 6.2);
    const norm = path.join(W, `n_${b.id}.mp4`);
    await normalizeVideo(raw, norm, normDur);
    const labeled = path.join(W, `lb_${b.id}.mp4`);
    await overlayLabels(norm, labeled, b.labels);
    const baked = path.join(W, `fc_${String(i).padStart(2, '0')}.mp4`);
    await bakeCaption(labeled, baked, b.cap, normDur);
    seq.push(baked);
    if (voFile) voInfo.push({ segIndex: i + 1, file: voFile });
    process.stderr.write(`beat ${i + 1}/${BEATS.length} ${b.id} dur=${normDur.toFixed(1)} vo=${b.vo ? vd.toFixed(1) : '-'}\n`);
  }
  const qrCard = path.join(HERE, 'qr/api-cta-endcard.png');
  if (!fs.existsSync(qrCard)) throw new Error('missing QR end card ' + qrCard);
  seq.push(await stillToClip(qrCard, path.join(W, 'card_qr.mp4'), 5.8));
  process.stderr.write(`qr outro 5.8s ${CTA}\n`);

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
  process.stderr.write('xfade concat...\n');
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', body], {
    maxBuffer: 1 << 27,
    timeout: 480000,
  });

  const LEN = await dur(body);
  let music = pickMusic();
  if (!music) music = await makeDrone(path.join(W, 'drone.mp3'));
  process.stderr.write(`music ${music}\n`);

  const voAt = voInfo.map((v) => ({ file: v.file, t: +(segStart(v.segIndex) + LEAD).toFixed(2) }));
  // Chillout-energy beds can sit up a hair vs the sad piano; sidechain still ducks under VO.
  let mf = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.22,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];`;
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
  process.stderr.write('final mix...\n');
  await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', final], { maxBuffer: 1 << 27, timeout: 300000 });
  fs.copyFileSync(final, stable);
  const v4 = path.join(PUBLISH, `${SLUG}-v4.mp4`);
  fs.copyFileSync(final, v4);
  const poster = path.join(PUBLISH, `${SLUG}-poster.jpg`);
  await execFileP('ffmpeg', ['-y', '-i', final, '-frames:v', '1', '-update', '1', poster], { timeout: 30000 });
  const qrSrc = path.join(HERE, 'qr/api-cta-qr.png');
  if (fs.existsSync(qrSrc)) fs.copyFileSync(qrSrc, path.join(PUBLISH, 'api-cta-qr.png'));
  fs.copyFileSync(qrCard, path.join(PUBLISH, 'api-cta-endcard.png'));
  console.log(`DONE ${path.basename(final)} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${LEN.toFixed(0)}s)`);
  console.log(`PUBLIC ${PUBLIC}/${path.basename(v4)}`);
  console.log(`STABLE ${PUBLIC}/${path.basename(stable)}`);
  console.log(`POSTER ${PUBLIC}/${path.basename(poster)}`);
  console.log(`CTA ${CTA}`);
}

main().catch((e) => {
  console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message);
  process.exit(1);
});
