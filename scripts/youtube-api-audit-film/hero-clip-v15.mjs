#!/usr/bin/env node
/**
 * Finish a fruit beat the way aideazz.xyz/api does:
 *   1. Hold the WHOLE still (the picture Elena already likes) for 2.4s.
 *   2. 1.2s cross-dissolve into a real I2V body (Runway Gen-4.5).
 *   3. Overlay the live-canvas language: 2px squares on a 12px grid,
 *      gold → white → violet, each dot on its own phase, three prism rays,
 *      then the dark veil so the film is the room.
 *
 * Never uses a Commons cut still. That is the ugly beat she rejected.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const WX = 1920, HY = 1080, FPS = 30;
const WHOLE = 2.4, XFADE = 1.2;
const FIELD_W = 480, FIELD_H = 270;

function plateStill(tag) {
  return (
    `[${tag}:v]scale=${WX}:${HY}:force_original_aspect_ratio=increase,` +
    `crop=${WX}:${HY},fps=${FPS},format=yuv420p,setsar=1[${tag}p]`
  );
}

/**
 * Low-res independent-phase field (HeroBackdrop GAP 12, 2px squares).
 * Rendered at 480×270 then scaled — geq at 1080p is a screensaver that never finishes.
 */
function fieldGeq() {
  const cell = `lt(mod(X\\,3)\\,1)*lt(mod(Y\\,3)\\,1)`;
  const ph = `6.28318*mod(abs(sin(X*12.9898+Y*78.233))*43758.5453\\,1)`;
  const amp = `(0.22+0.38*(0.5+0.5*sin(2*PI*T+${ph})))`;
  const t = `(X/${FIELD_W})`;
  const peak = `(1-abs(2*${t}-1))`;
  const r = `(232+(124-232)*${t}+40*${peak})`;
  const g = `(197+(58-197)*${t}+50*${peak})`;
  const b = `(106+(237-106)*${t}+20*${peak})`;
  const ray =
    `(0.20+0.12*sin(2*PI*T))*` +
    `(lt(abs(Y-0.28*${FIELD_H}-(X-${FIELD_W}/2)*0.22)\\,3)+` +
    `lt(abs(Y-0.50*${FIELD_H}-(X-${FIELD_W}/2)*-0.16)\\,3)+` +
    `lt(abs(Y-0.72*${FIELD_H}-(X-${FIELD_W}/2)*0.11)\\,3))`;
  return (
    `geq=r='${r}*${amp}*${cell}+232*${ray}':` +
    `g='${g}*${amp}*${cell}+197*${ray}':` +
    `b='${b}*${amp}*${cell}+80*${ray}'`
  );
}

async function renderFieldLoop(dest, seconds) {
  await execFileP(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=${FIELD_W}x${FIELD_H}:r=${FPS}:d=${seconds.toFixed(2)}`,
      '-vf', `${fieldGeq()},scale=${WX}:${HY}:flags=neighbor,format=yuv420p`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-an',
      dest,
    ],
    { timeout: 60000, maxBuffer: 1 << 24 },
  );
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 5000) {
    throw new Error('canvas field empty ' + dest);
  }
}

export async function finishApiHeroClip({ whole, bodyMp4, dest }) {
  if (!fs.existsSync(whole)) throw new Error('missing whole still ' + whole);
  if (!fs.existsSync(bodyMp4)) throw new Error('missing Runway body ' + bodyMp4);
  if (fs.statSync(bodyMp4).size < 20000) throw new Error('Runway body empty ' + bodyMp4);
  const probe = await execFileP(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', bodyMp4],
    { timeout: 20000 },
  );
  const bodyDur = Math.max(5, parseFloat(String(probe.stdout || '10')) || 10);
  const take = WHOLE + bodyDur - XFADE;
  const work = path.dirname(dest);
  const field = path.join(work, `${path.basename(dest, '.mp4')}-field.mp4`);
  const stitched = path.join(work, `${path.basename(dest, '.mp4')}-stitch.mp4`);
  await renderFieldLoop(field, take);
  const stitchFc =
    `${plateStill('0')};${plateStill('1')};` +
    `[0p][1p]xfade=transition=fade:duration=${XFADE}:offset=${WHOLE},format=yuv420p,setsar=1[v]`;
  await execFileP(
    'ffmpeg',
    [
      '-y',
      '-loop', '1', '-t', (WHOLE + XFADE + 0.3).toFixed(2), '-i', whole,
      '-i', bodyMp4,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', stitchFc,
      '-map', '[v]',
      '-map', '2:a',
      '-t', take.toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '44100',
      '-ac', '2',
      stitched,
    ],
    { timeout: 120000, maxBuffer: 1 << 26 },
  );
  const fadeIn = (WHOLE - 0.2).toFixed(2);
  const overlayFc =
    `[1:v]fade=t=in:st=${fadeIn}:d=${XFADE}[glow];` +
    `[0:v][glow]blend=all_mode=screen:all_opacity=0.46,` +
    `eq=saturation=0.82:brightness=-0.03,vignette=PI/5,format=yuv420p,setsar=1[v]`;
  await execFileP(
    'ffmpeg',
    [
      '-y',
      '-i', stitched,
      '-i', field,
      '-filter_complex', overlayFc,
      '-map', '[v]',
      '-map', '0:a?',
      '-t', take.toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '44100',
      '-ac', '2',
      dest,
    ],
    { timeout: 120000, maxBuffer: 1 << 26 },
  );
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 20000) {
    throw new Error('api-hero clip empty ' + dest);
  }
  process.stderr.write(
    `api-hero ${path.basename(dest)} whole-head ${WHOLE}s + Runway body + canvas field (no cut still)\n`,
  );
  return dest;
}

/** @deprecated name kept so old imports fail loud if someone still passes a cut. */
export async function renderHeroClip(opts) {
  if (opts && opts.cut) {
    throw new Error('hero-clip must not use a Commons cut still — pass bodyMp4 from Runway');
  }
  return finishApiHeroClip(opts);
}

if (process.argv[1] && process.argv[1].endsWith('hero-clip-v15.mjs')) {
  finishApiHeroClip({
    whole: process.argv[2],
    bodyMp4: process.argv[3],
    dest: process.argv[4],
  }).catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
}
