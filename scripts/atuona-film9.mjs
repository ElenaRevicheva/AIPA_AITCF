// Atuona film #9 — ATUONA (for Niio's private-viewer programme) — compile. Film #8's pipeline (scripts/atuona-film8.mjs):
// voice locked to its shot, 1.3 s dissolves, one stanza per shot across the width at the bottom, mono title cards, Crimson
// glitch flashes with a near-hard cut, music ducked under the voice, loudnorm + limiter. Changes for film #9:
//   - 1920x1080 at 24 fps (Kling O3 renders 24 fps); every size of film #8 is scaled x1.5.
//   - the cut lives in cut.json (built from the approved frames' clips + the stanza doc), not in plan.shots.
//   - each clip is trimmed to its planned edit length (motion directions), slowed by its factor, and stretched further only if
//     the voice needs it; `reverse` (shot 5: the leaf rises), `composite_of` (35: a double exposure of 36), `key` (17: the red
//     dog keyed onto the beach), `card` (1c: a text card).
// ⛔ RUN ON THE LAPTOP, NEVER ON ORACLE (8 Oct 2026: a one-pass build there froze the server and every bot ~50 min).
// Laptop, from the repo root, with FILM9_BASE / FILM9_WORK / FILM9_CUT / FILM9_FONT / FILM9_MONO set and static-ffmpeg on
// PATH — full command in docs/atuona/FILM9_HANDOVER_2026-10-08.md §4.6:
//                 node scripts/atuona-film9.mjs                    (master: writes WORK/work/final.mp4 — NOT published)
//                 PREVIEW=1 node scripts/atuona-film9.mjs          (fast cut, no motion interpolation: WORK/work/preview.mp4)
//                 ... --reuse [--reseg=7,17]                       (re-cut only those shots; list EVERY changed shot)
//                 ... --stanza-preview                             (every stanza over its shot, as PNGs)
//                 ... --publish                                    (copies final into the PUBLIC gallery — only with Elena's go)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP0 = promisify(execFile);

// FILM9_BASE / FILM9_WORK: run the same build on the laptop (8 Oct: a heavy render on Oracle froze the bots' box).
// Inputs are read from BASE (clips/, stillclips/, img/, music/, cut.json); everything written goes to WORK (work files + vo/).
const BASE = process.env.FILM9_BASE || '/home/ubuntu/atuona-film9';
const WORK = process.env.FILM9_WORK || BASE;
const W = WORK + '/work', CLIPS = BASE + '/clips', VODIR = WORK + '/vo', IMG = BASE + '/img';
const OUTDIR = '/home/ubuntu/cto-aipa/data/atuona/films/out';
const FONT = process.env.FILM9_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = process.env.FILM9_MONO || '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
// file paths INSIDE a filter string: on Windows 'C:/x' breaks the filter parser (':' separates options), so ffmpeg runs in
// W and the filter gets paths relative to it
const WIN = process.platform === 'win32';
const fp = f => WIN ? path.relative(W, f).split(path.sep).join('/') : f;
// ffmpeg 7+/8 (the laptop's) shapes text with HarfBuzz and draws the line break as a box glyph; Oracle's ffmpeg 6 does not
const TS = WIN ? ':text_shaping=0' : '';
const VW = 1920, VH = 1080, FPS = 24;
// PREVIEW=1: the same cut in minutes — no motion interpolation (frames repeat in slow-mo), fastest x264; writes work/preview.mp4
const PREVIEW = process.env.PREVIEW === '1';
// 10 Oct 2026 (v2 cut from Elena's screenshots): voice and music are ON HOLD by her word, so FILM9_NO_VO=1 builds without the
// voice lines (every shot then runs its planned `edit` length instead of being stretched to its voice) and FILM9_NO_MUSIC=1
// without the music bed. A shot without a `stanza` burns no text (it used to burn the word "undefined"). An item
// {sid, glitch_only: 'k13.jpg'} is a Crimson flash of that still in place of a moving shot; `glitch_dur` sets a flash's length.
const NO_VO = process.env.FILM9_NO_VO === '1', NO_MUSIC = process.env.FILM9_NO_MUSIC === '1';
const XFADE_D = 1.3, LEAD = 0.7, TAIL = 1.9, MI_FROM = 1.12, GLITCH_XF = 0.1, GLITCH_D = 1.2;
const CUT = JSON.parse(fs.readFileSync(process.env.FILM9_CUT || BASE + '/cut.json', 'utf8'));
const MUSIC = path.join(BASE, CUT.music);
const SLUG = CUT.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const OUTRO_SUB = 'atuona.xyz // Paradise.js  ·  by Kira Velerevich';

const LOG = WORK + '/ffmpeg-commands.log';
async function execFileP(cmd, args, opts) {
  fs.appendFileSync(LOG, cmd + ' ' + args.map(a => /[\s\[\];,']/.test(a) ? `'${a}'` : a).join(' ') + '\n\n');
  return execFileP0(cmd, args, WIN ? { cwd: W, ...opts } : opts);
}
const caps = s => (s || '').toUpperCase();
const track = s => caps(s).split('').join(' ');
function wrap(s, maxCols, maxLines) { const out = []; for (const raw of String(s).replace(/\r/g, '').split('\n')) { const words = raw.trim().split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); continue; } let cur = ''; for (const w of words) { if (cur && (cur.length + 1 + w.length) > maxCols) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; } if (cur) out.push(cur); } while (out.length && out[out.length - 1] === '') out.pop(); return out.slice(0, maxLines).join('\n'); }
async function dur(f) { const { stdout } = await execFileP0('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]); const d = parseFloat(stdout.trim()); if (!(d > 0)) throw new Error('no duration: ' + f); return d; }
async function vdur(f) { const { stdout } = await execFileP0('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'default=nw=1:nk=1', f]); const d = parseFloat(stdout.trim()); if (!(d > 0)) throw new Error('no video duration: ' + f); return d; }
const enc = ['-c:v', 'libx264', '-preset', PREVIEW ? 'ultrafast' : 'veryfast', '-crf', PREVIEW ? '20' : '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];
const silence = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
async function pool(n, tasks) { const res = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } })); return res; }
const fit = `scale=${VW}:${VH}:force_original_aspect_ratio=increase,crop=${VW}:${VH},setsar=1`;

// stanzas across the whole width at the bottom (film #7/#8 spread(): fewest even screen lines within 92 columns)
const STANZA_SIZE = 33, STANZA_COLS = 92;
function spread(text, maxCols = STANZA_COLS) {
  const verse = String(text).replace(/\r/g, '').split(/\n| \/ /).map(l => l.trim()).filter(Boolean);
  if (verse.some(l => l.length > maxCols)) return balanced(verse.join(' '), maxCols);   // a prose sentence longer than a line
  const len = g => g.join(' ').length;
  const parts = (from, n) => n === 1 ? [[verse.slice(from)]]
    : Array.from({ length: verse.length - from - n + 1 }, (_, k) => from + k + 1)
        .flatMap(cut => parts(cut, n - 1).map(rest => [verse.slice(from, cut), ...rest]));
  for (let n = 1; n <= verse.length; n++) {
    const fits = parts(0, n).filter(p => p.every(g => len(g) <= maxCols));
    if (fits.length) return fits.sort((a, b) => Math.max(...a.map(len)) - Math.max(...b.map(len)))[0].map(g => g.join(' ')).join('\n');
  }
  return balanced(verse.join(' '), maxCols);
}
// the fewest screen lines of EVEN length: no orphan word ("years.") left alone on the last line
function balanced(text, maxCols) {
  const n = Math.ceil(text.length / maxCols);
  for (let w = Math.ceil(text.length / n); w <= maxCols; w++) {
    const out = wrap(text, w, 99).split('\n');
    if (out.length <= n) return out.join('\n');
  }
  return wrap(text, maxCols, 7);
}
function textDraw(lines, clipDur, opaque) {
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = opaque ? '1' : `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  return `,drawtext=fontfile=${fp(FONT)}:textfile=${fp(lines)}:expansion=none${TS}:fontcolor=white:fontsize=${STANZA_SIZE}:line_spacing=13:text_align=C:x=0:y=h-text_h-39:box=1:boxw=${VW}:boxborderw=33|0|39|0:boxcolor=black@0.42:shadowcolor=black@0.6:shadowx=0:shadowy=1:alpha='${alpha}'`;
}
async function makeCard(titleRaw, subRaw, outFile, d, titleSize, bgVideo, noFadeIn, serifBody) {
  let draw;
  if (serifBody) {   // 1c: a line of hers on black, serif like the stanzas
    const bFile = outFile + '_b.txt'; fs.writeFileSync(bFile, spread(serifBody, 60));
    draw = `drawtext=fontfile=${fp(FONT)}:textfile=${fp(bFile)}:expansion=none${TS}:fontcolor=white:fontsize=40:line_spacing=16:text_align=C:x=(w-text_w)/2:y=(h-text_h)/2`;
  } else {
    const tFile = outFile + '_t.txt'; fs.writeFileSync(tFile, track(titleRaw));
    const size = Math.min(titleSize, Math.floor(1770 / (track(titleRaw).length * 0.602)));
    draw = `drawtext=fontfile=${fp(MONO)}:textfile=${fp(tFile)}:expansion=none${TS}:fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2-39`;
    if (subRaw && subRaw.trim()) wrap(caps(subRaw), 56, 2).split('\n').forEach((line, k) => { const sFile = `${outFile}_s${k}.txt`; fs.writeFileSync(sFile, line); draw += `,drawtext=fontfile=${fp(MONO)}:textfile=${fp(sFile)}:expansion=none${TS}:fontcolor=0xBBBBBB:fontsize=30:x=(w-text_w)/2:y=(h/2)+60+${k * 50}`; });
  }
  const fades = `${noFadeIn ? '' : 'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;   // noFadeIn: frame 0 = the card (gallery poster)
  if (bgVideo) {
    const vf = `${fit},fps=${FPS},eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP('ffmpeg', ['-y', '-i', bgVideo, ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 300000 });
  } else {
    await execFileP('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${VW}x${VH}:r=${FPS}:d=${d.toFixed(2)}`, ...silence, '-filter_complex', `[0:v]${draw},${fades}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 300000 });
  }
  return outFile;
}

// film #8's Crimson glitch, x1.5: the still fitted over a darkened blur of itself, black stutter frames, a jumping RGB split,
// a torn horizontal band, heavy grain (frame numbers re-timed from 30 to 24 fps)
async function makeGlitch(img, outFile, d = GLITCH_D) {
  const fc = `[0:v]split=2[a][b];` +
    `[a]${fit},boxblur=36:2,eq=brightness=-0.32:saturation=0.7[bg];` +
    `[b]scale=-2:${VH},setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${FPS},format=yuv420p,split=2[m][t];` +
    `[t]crop=iw:135:0:ih*0.42[band];[m][band]overlay=x=72:y=H*0.42:enable='between(n,4,6)+between(n,16,18)',` +
    `rgbashift=rh=-21:bh=21:enable='lt(mod(n,6),2)',rgbashift=rh=8:gv=-5:bv=5:enable='gte(mod(n,6),2)',` +
    `noise=alls=38:allf=t,eq=contrast=1.12,drawbox=x=0:y=0:w=iw:h=ih:color=black@1:t=fill:enable='between(n,0,1)+eq(n,10)+between(n,26,28)'[v]`;
  await execFileP('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-t', d.toFixed(2), '-i', img, ...silence, '-filter_complex', fc,
    '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 300000 });
  return outFile;
}

const clipPath = it => path.join(CLIPS, it.clip);
const voPath = it => path.join(VODIR, `${it.sid}.mp3`);

async function main() {
  const final = path.join(W, PREVIEW ? 'preview.mp4' : 'final.mp4');
  if (process.argv.includes('--publish')) {
    if (!fs.existsSync(final)) throw new Error('no work/final.mp4 — build first');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(OUTDIR, `${SLUG}-${stamp}.mp4`);
    fs.copyFileSync(final, dest + '.part'); fs.renameSync(dest + '.part', dest);
    console.log('PUBLISHED', dest); return;
  }
  fs.mkdirSync(W, { recursive: true });
  const items = CUT.items;
  const shots = items.filter(it => !it.card && !it.glitch_only);
  const missing = shots.filter(it => !fs.existsSync(clipPath(it))).map(it => `${it.sid}: ${it.clip}`);
  if (missing.length) throw new Error('missing clips: ' + missing.join(', '));
  const noImg = items.filter(it => it.glitch_only && !fs.existsSync(path.join(IMG, it.glitch_only))).map(it => `${it.sid}: ${it.glitch_only}`);
  if (noImg.length) throw new Error('missing glitch stills: ' + noImg.join(', '));
  const noVo = NO_VO ? [] : shots.filter(it => it.stanza && !fs.existsSync(voPath(it))).map(it => it.sid);
  if (noVo.length && !process.argv.includes('--stanza-preview')) throw new Error('missing voice: ' + noVo.join(', ') + ' (run vo9.py)');

  // 1. durations: the planned edit length, at least as long as its voice; the clip is slowed by its factor, more if needed
  const plan = [];
  for (const it of shots) {
    const vd = !NO_VO && fs.existsSync(voPath(it)) ? await dur(voPath(it)) : 0;
    const need = vd ? LEAD + vd + TAIL : 0;
    // `trim`: QC's last clean second of the clip (the rest is never used); `end`: the window ENDS there (1a's lilac turn,
    // 2's exhale, 6's plunge), so the start moves back as the shot gets longer
    const endAt = Math.min(await vdur(clipPath(it)), it.trim || Infinity, it.end || Infinity);
    let ss = it.ss || 0;
    const avail = endAt - ss - (it.composite_offset || 0) - 0.05;
    const d = Math.max(it.edit, need);
    // tail shots: the main clip runs at its own pace and leaves at least tail_min s (plus the 1 s dissolve) to the tail
    const src = it.tail ? Math.min(avail, (d - (it.tail_min || 0) + 1.0) / (it.slow || 1)) : Math.min(avail, d / (it.slow || 1));
    if (it.end) ss = Math.max(0, endAt - (it.composite_offset || 0) - src - 0.05);
    plan.push({ it, vd, ss, src, d, factor: d / src });
  }

  if (process.argv.includes('--stanza-preview')) {
    const PV = path.join(W, 'stanza-preview'); fs.mkdirSync(PV, { recursive: true });
    for (const p of plan) {
      if (!p.it.stanza) continue;
      const txt = path.join(PV, `${p.it.sid}.txt`), lines = spread(p.it.stanza); fs.writeFileSync(txt, lines);
      await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', (p.src / 2).toFixed(2), '-i', clipPath(p.it), '-frames:v', '1', '-vf', fit + textDraw(txt, 99, true), path.join(PV, `${p.it.sid}.png`)]);
      console.log(`${p.it.sid.padEnd(4)} ${p.d.toFixed(1)}s  ${lines.replace(/\n/g, ' ⏎ ')}`);
    }
    console.log('PREVIEW', PV); return;
  }
  fs.writeFileSync(LOG, '');

  // 2. normalize every segment + burn its stanza (clip audio replaced by silence: voice + music are the soundtrack)
  const reuse = process.argv.includes('--reuse');
  const reseg = ((process.argv.find(a => a.startsWith('--reseg=')) || '').slice(8)).split(',').filter(Boolean);
  const segOf = {};
  await pool(2, plan.map((p, i) => async () => {
    const { it } = p, out = path.join(W, `${PREVIEW ? 'pv_' : ''}seg_${it.sid}.mp4`);
    if (reuse && !reseg.includes(it.sid) && fs.existsSync(out) && fs.statSync(out).size > 10000) { segOf[it.sid] = out; return; }
    const txt = path.join(W, `p_${it.sid}.txt`); fs.writeFileSync(txt, it.stanza ? spread(it.stanza) : '');
    const text = it.stanza ? textDraw(txt, p.d) : '';   // a shot without a stanza (24b: the lots after the tear) carries no band
    const interp = !PREVIEW && p.factor >= MI_FROM ? `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : `fps=${FPS}`;
    const slow = `setpts=${p.factor.toFixed(5)}*(PTS-STARTPTS),${interp}`;
    const args = ['-y', ...(p.ss ? ['-ss', p.ss.toFixed(2)] : []), '-t', p.src.toFixed(3), '-i', clipPath(it)];
    let fc;
    if (it.composite_of) {   // 35: the same woman twice — the clip over its own mirror image, a few seconds later
      args.push('-ss', String(it.composite_offset), '-t', p.src.toFixed(3), '-i', clipPath(it));
      fc = `[0:v]${fit}[a];[1:v]${fit},hflip[b];[a][b]blend=all_mode=screen:all_opacity=${it.composite_opacity || 0.55},${slow},format=yuv420p${text}[v]`;
    } else if (it.tail) {    // 36: the clean part of the walk at its own pace, then a 1 s dissolve into the still-motion of the
      // same approved frame for the rest of the stanza (QC cut the walk at 4 s; her #003 lines need ~12 s)
      const mainOut = p.src * (it.slow || 1), XF = 1.0, tailOut = p.d - mainOut + XF;
      const tss = it.tail_ss || 0, tailF = Math.max(1, tailOut / ((await vdur(path.join(CLIPS, it.tail))) - tss - 0.05));
      args.push(...(tss ? ['-ss', tss.toFixed(2)] : []), '-i', path.join(CLIPS, it.tail));
      const mi = f => !PREVIEW && f >= MI_FROM ? `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : `fps=${FPS}`;
      fc = `[0:v]${fit},setpts=${(it.slow || 1).toFixed(4)}*(PTS-STARTPTS),${mi(it.slow || 1)},settb=AVTB[m];` +
           `[1:v]${fit},setpts=${tailF.toFixed(4)}*(PTS-STARTPTS),${mi(tailF)},trim=duration=${tailOut.toFixed(3)},settb=AVTB[t];` +
           `[m][t]xfade=transition=fade:duration=${XF}:offset=${(mainOut - XF).toFixed(3)},format=yuv420p${text}[v]`;
    } else if (it.key) {     // 17: Gauguin's red dog keyed onto the beach, no shadow
      const k = it.key, kh = Math.round(VH * k.plate_h);
      args.push('-loop', '1', '-i', path.join(IMG, k.img));
      fc = `[0:v]${fit}${it.reverse ? ',reverse' : ''},${slow}[base];[1:v]chromakey=0x1ea53a:${k.similarity || 0.16}:${k.blend || 0.06},despill=green,scale=-2:${kh}${k.hflip ? ',hflip' : ''}[dog];` +
           `[base][dog]overlay=x=${Math.round(VW * k.x)}:y=${Math.round(VH * k.y)}:shortest=1,format=yuv420p${text}[v]`;
    } else {
      fc = `[0:v]${fit}${it.reverse ? ',reverse' : ''},${slow},format=yuv420p${text}[v]`;
    }
    const sIdx = it.composite_of || it.key || it.tail ? 2 : 1;
    await execFileP('ffmpeg', [...args, ...silence, '-filter_complex', fc, '-map', '[v]', '-map', `${sIdx}:a`, '-t', p.d.toFixed(2), ...enc, out], { maxBuffer: 1 << 26, timeout: 3600000 });
    segOf[it.sid] = out;
    process.stderr.write(`seg ${i + 1}/${plan.length} ${it.sid} ${p.d.toFixed(2)}s from ${p.src.toFixed(2)}s${p.factor > 1.001 ? ` slow×${p.factor.toFixed(2)}${p.factor >= MI_FROM ? ' (interp)' : ''}` : ''}\n`);
  }));

  // sequence: intro card over the cover shot, then per item [card | segment (+ its glitch flash)], then the outro card
  const cover = plan.find(p => p.it.sid === CUT.cover);
  const seq = [{ file: await makeCard(CUT.title, CUT.moments, path.join(W, 'card_intro.mp4'), 4.4, 60, clipPath(cover.it), true) }];
  const seqOf = {};
  for (const it of items) {
    if (it.card) { seq.push({ file: await makeCard('', '', path.join(W, `card_${it.sid}.mp4`), it.card_dur || 4.5, 0, null, false, it.card) }); continue; }
    if (it.glitch_only) { seq.push({ file: await makeGlitch(path.join(IMG, it.glitch_only), path.join(W, `glitch_only_${it.sid}.mp4`), it.glitch_dur || GLITCH_D), glitch: true }); continue; }
    if (it.glitch_before) seq.push({ file: await makeGlitch(path.join(IMG, it.glitch_before), path.join(W, `glitch_before_${it.sid}.mp4`)), glitch: true });
    seqOf[it.sid] = seq.length; seq.push({ file: segOf[it.sid] });
    if (it.glitch_after) seq.push({ file: await makeGlitch(path.join(IMG, it.glitch_after), path.join(W, `glitch_after_${it.sid}.mp4`)), glitch: true });
  }
  seq.push({ file: await makeCard('ATUONA', OUTRO_SUB, path.join(W, 'card_outro.mp4'), 4.2, 84) });

  // 3. transition chain: 1.3 s dissolves, a near-hard cut into and out of a glitch (film #8: video-stream lengths, not container)
  const durs = []; for (const c of seq) durs.push(await vdur(c.file));
  const joinD = seq.map((c, k) => k === 0 ? 0 : (c.glitch || seq[k - 1].glitch) ? GLITCH_XF : XFADE_D);
  const segStart = k => { let s = 0; for (let i = 0; i < k; i++) s += durs[i] - joinD[i + 1]; return Math.max(0, s); };
  // 8 Oct 2026: ONE ffmpeg decoding all ~45 full-HD inputs at once ran the 12 GB box out of memory and froze every bot on it
  // for a long while. So the chain runs in batches of CHUNK segments (near-lossless intermediates), then the batches are
  // dissolved together — never more than CHUNK decoders alive — and it refuses to start when the box is short of memory.
  const CHUNK = 6;
  const memAvailMB = () => WIN ? Math.round(os.freemem() / 1048576)
    : Math.round(+(fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/) || [0, 0])[1] / 1024);
  async function chain(files, ds, joins, out, last) {
    if (memAvailMB() < (WIN ? 800 : 2500)) throw new Error(`only ${memAvailMB()} MB free — not starting a dissolve chain (the bots share this box)`);
    if (files.length === 1) { fs.copyFileSync(files[0], out); return ds[0]; }
    const inputs = files.flatMap(f => ['-i', f]); let fc = '', vlab = '0:v', alab = '0:a', merged = ds[0];
    for (let k = 1; k < files.length; k++) { const D = joins[k], ofs = Math.max(0, merged - D).toFixed(3); fc += `[${vlab}][${k}:v]xfade=transition=fade:duration=${D}:offset=${ofs}[vc${k}];[${alab}][${k}:a]acrossfade=d=${D}[ac${k}];`; vlab = `vc${k}`; alab = `ac${k}`; merged += ds[k] - D; }
    const v = last ? ['-preset', PREVIEW ? 'ultrafast' : 'medium', '-crf', PREVIEW ? '22' : '18', '-maxrate', '14M', '-bufsize', '28M']
                   : ['-preset', PREVIEW ? 'ultrafast' : 'veryfast', '-crf', PREVIEW ? '16' : '12'];
    await execFileP('ffmpeg', ['-y', '-threads', '2', '-filter_threads', '1', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`,
      '-c:v', 'libx264', ...v, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', out], { maxBuffer: 1 << 27, timeout: 7200000 });
    return merged;
  }
  const body = path.join(W, 'body.mp4');
  const starts = []; for (let i = 0; i < seq.length; i += CHUNK) starts.push(i);
  const chunkFiles = [];
  for (const [g, s0] of starts.entries()) {
    const ks = Array.from({ length: Math.min(CHUNK, seq.length - s0) }, (_, j) => s0 + j);
    const f = path.join(W, `${PREVIEW ? 'pv_' : ''}chunk_${g}.mp4`);
    await chain(ks.map(k => seq[k].file), ks.map(k => durs[k]), ks.map((k, j) => j === 0 ? 0 : joinD[k]), f, false);
    chunkFiles.push(f);
    process.stderr.write(`dissolve batch ${g + 1}/${starts.length}\n`);
  }
  const cds = []; for (const f of chunkFiles) cds.push(await vdur(f));
  const merged = await chain(chunkFiles, cds, starts.map((s0, g) => g === 0 ? 0 : joinD[s0]), body, true);
  process.stderr.write(`dissolve chain: ${seq.length} segments in ${starts.length} batches, ${merged.toFixed(1)}s\n`);

  // 4. mix: music ducked under the voice bus, loudness-normalized, limited
  const LEN = await dur(body);
  const voAt = plan.filter(p => p.vd).map(p => ({ file: voPath(p.it), t: +(segStart(seqOf[p.it.sid]) + LEAD).toFixed(2) }));
  const musicOn = !NO_MUSIC;
  // the graph has three shapes: music ducked under the voice bus (the 8 Oct preview), music alone (FILM9_NO_VO), voice alone
  // (FILM9_NO_MUSIC); with neither, the body's silent track is kept as it is
  const mixIn = ['-i', body]; if (musicOn) mixIn.push('-i', MUSIC); voAt.forEach(v => mixIn.push('-i', v.file));
  let mf = musicOn ? `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];` : '';
  const vl = []; voAt.forEach((v, k) => { mf += `[${k + (musicOn ? 2 : 1)}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1[v${k}];`; vl.push(`[v${k}]`); });
  if (vl.length) mf += `${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9${musicOn ? ',asplit=2[vsc][vmix];' : '[premix];'}`;
  if (musicOn && vl.length) mf += `[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];`;
  else if (musicOn) mf += `[music]anull[premix];`;
  mf += `[premix]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false[a]`;
  if (!musicOn && !vl.length) {
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', body, '-c', 'copy', '-movflags', '+faststart', final], { maxBuffer: 1 << 26, timeout: 900000 });
    process.stderr.write('no voice, no music: the body is the film\n');
  } else {
  // music shorter than the film: crossfade the track into itself from its 60 s mark (a steady groove loops cleanly), never cut out
  if (musicOn && (await dur(MUSIC)) < LEN) {
    const ext = path.join(W, 'music_extended.m4a');
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-i', MUSIC, '-i', MUSIC, '-filter_complex', '[1:a]atrim=start=60,asetpts=PTS-STARTPTS[b];[0:a][b]acrossfade=d=4[a]', '-map', '[a]', '-c:a', 'aac', '-b:a', '256k', ext], { maxBuffer: 1 << 26 });
    mixIn[3] = ext;
    process.stderr.write(`music ${(await dur(MUSIC)).toFixed(1)}s < film ${LEN.toFixed(1)}s -> extended by a 4 s self-crossfade
`);
  }
  await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', '-movflags', '+faststart', final], { maxBuffer: 1 << 27, timeout: 900000 });
  }
  fs.writeFileSync(path.join(W, 'timeline.json'), JSON.stringify(plan.map(p => ({ shot: p.it.sid, clip: p.it.clip, poem: p.it.poem, start: +segStart(seqOf[p.it.sid]).toFixed(2), dur: +p.d.toFixed(2), slow: +p.factor.toFixed(3), vo_at: p.vd ? +(segStart(seqOf[p.it.sid]) + LEAD).toFixed(2) : null, glitch_after: p.it.glitch_after || null })), null, 1));
  console.log(`DONE ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${LEN.toFixed(1)}s, ${plan.length} shots, ${voAt.length} voice lines) — verify, then: node film9.mjs --publish`);
}
main().catch(e => { console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message); process.exit(1); });
