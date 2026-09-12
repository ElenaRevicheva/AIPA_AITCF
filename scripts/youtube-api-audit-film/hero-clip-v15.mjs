#!/usr/bin/env node
/**
 * /api HeroBackdrop language as one fruit clip.
 * whole 2.4s on black void → 1.2s xfade → cut + scintillating gold-white-violet
 * field + prism wash + veil. Not Ken Burns on a grocery photo.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const WX = 1920, HY = 1080, FPS = 30;
const WHOLE = 2.4, XFADE = 1.2;

function plate(tag, sway) {
  const pan = sway
    ? `'(in_w-out_w)/2+26*sin(2*PI*t/2.8)':'(in_h-out_h)/2+14*cos(2*PI*t/2.2)'`
    : `'(in_w-out_w)/2':'(in_h-out_h)/2-6*t'`;
  return (
    `[${tag}:v]scale=${WX + 100}:${HY + 100}:force_original_aspect_ratio=increase,` +
    `crop=${WX}:${HY}:${pan},fps=${FPS},format=yuv420p,setsar=1,` +
    `eq=saturation=0.82:brightness=-0.08:contrast=1.05[${tag}p]`
  );
}

export async function renderHeroClip({ whole, cut, dest, seconds = 8 }) {
  if (!fs.existsSync(whole)) throw new Error('missing whole still ' + whole);
  if (!fs.existsSync(cut)) throw new Error('missing cut still ' + cut);
  const take = Math.max(7.2, seconds);
  const cutHold = Math.max(3.6, take - WHOLE);
  // Independent-phase dots (HeroBackdrop twitch) + gold→violet wash (arcoiris).
  const field =
    `geq=r='if(eq(mod(X\\,12)\\,0)*eq(mod(Y\\,12)\\,0)\\,40+90*(X/${WX})+40*sin(2*PI*T+X*0.08+Y*0.05)\\,0)':` +
    `g='if(eq(mod(X\\,12)\\,0)*eq(mod(Y\\,12)\\,0)\\,55+50*(1-abs(2*X/${WX}-1))+28*sin(2*PI*T+X*0.08+Y*0.05)\\,0)':` +
    `b='if(eq(mod(X\\,12)\\,0)*eq(mod(Y\\,12)\\,0)\\,35+120*(X/${WX})+36*sin(2*PI*T+1.6+X*0.06+Y*0.04)\\,0)'`;
  const fc =
    `${plate('0', true)};${plate('1', false)};` +
    `[0p][1p]xfade=transition=fade:duration=${XFADE}:offset=${WHOLE}[xf];` +
    `[xf]split[base][hot];` +
    `[hot]${field},hue=h='300+40*sin(2*PI*t/3)',gblur=sigma=1[glow];` +
    `[base][glow]blend=all_mode=screen:all_opacity=0.38[lit];` +
    `[lit]vignette=PI/5,eq=saturation=0.88:brightness=-0.03,format=yuv420p,setsar=1[v]`;
  await execFileP(
    'ffmpeg',
    [
      '-y',
      '-loop', '1', '-t', (WHOLE + XFADE + 0.3).toFixed(2), '-i', whole,
      '-loop', '1', '-t', (cutHold + XFADE + 0.3).toFixed(2), '-i', cut,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', fc,
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
      dest,
    ],
    { timeout: 180000, maxBuffer: 1 << 26 },
  );
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 20000) {
    throw new Error('hero-clip empty ' + dest);
  }
  process.stderr.write(`hero-clip ${path.basename(dest)} whole→cut + field (HeroBackdrop language)\n`);
  return dest;
}

if (process.argv[1] && process.argv[1].endsWith('hero-clip-v15.mjs')) {
  renderHeroClip({ whole: process.argv[2], cut: process.argv[3], dest: process.argv[4] }).catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
}
