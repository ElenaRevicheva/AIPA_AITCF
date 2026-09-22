// "COULD NOT GENERATE CONTENT." (working title "Paradise Is Compiled") — Atuona film #7 from the 20.09.2026 Desktop folder: 19 clips + 20 stills, nothing else.
// Stills become video shots via still_motion.py (scripts/atuona-still-motion.py): depth-based 2.5D camera + atmosphere.
// Pipeline = scripts/atuona-film3.mjs (voice locked to its segment, 1.3s dissolves, serif stanzas, mono cards,
// ducked music, loudnorm) + still shots + gallery walls for the 9 verticals + motion-interpolated slow-mo.
// Run on Oracle:  cd /home/ubuntu/atuona-film7 && node film7.mjs        (writes work/final.mp4 — NOT published)
//                 node film7.mjs --publish                              (copies the verified final into films/out)
// Mapping + translations + stanza table: docs/atuona/FILM7_PARADISE_IS_COMPILED.md
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP0 = promisify(execFile);

const BASE = '/home/ubuntu/atuona-film7';
const CLIPS = BASE + '/clips', W = BASE + '/work', VODIR = BASE + '/vo', SPECS = BASE + '/specs', SC = BASE + '/stillclips';
const OUTDIR = '/home/ubuntu/cto-aipa/data/atuona/films/out';
const MUSIC = '/home/ubuntu/cto-aipa/data/atuona/films/music/red-lips-sensual-noir-wbmstudio-pixabay.mp3';
const PY = BASE + '/venv/bin/python', SM = BASE + '/still_motion.py';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const XFADE_D = 1.3, LEAD = 0.7, TAIL = 1.9, MI_FROM = 1.3;
const FILM_TITLE = 'Could not generate content.';   // #099's title, kept as-is (Elena, 22.09.2026)
const MOMENTS = '20.09.2026  ·  atuona.xyz Gallery  ·  Fragments #099 #015 #024 #037 #022 #020 #066 #091';
const OUTRO_SUB = 'atuona.xyz // Paradise.js  ·  by Kira Velerevich';
const SLUG = 'could-not-generate-content';
const GRAIN = 0.014;

const LOG = BASE + '/ffmpeg-commands.log';
async function execFileP(cmd, args, opts) {
  fs.appendFileSync(LOG, cmd + ' ' + args.map(a => /[\s\[\];,']/.test(a) ? `'${a}'` : a).join(' ') + '\n\n');
  return execFileP0(cmd, args, opts);
}

// ---------------------------------------------------------------- the stills as shots (normalized coords)
const S = f => 'stills/photo_' + f + '.jpg';
const D = f => 'work/depth/photo_' + f + '.png';
const shot = (f, o) => ({ img: S(f), depth: D(f), ...o });
const SHOTS = {
  // #099 cold open — the error on the screen is the first line of the film
  A1: shot('2026-09-09_17-54-06', { look: [[0.50, 0.48], [0.60, 0.44]], zoom: [1.02, 1.10], truck: [[15, 0], [-15, 0]], focal: 0.55, dolly: 0.06, ease: 0.6,
    fx: [{ type: 'flicker', mask: { ellipse: [0.46, 0.34, 0.14, 0.22] }, amp: 0.05, speed: 1.6 },
         { type: 'flicker', mask: { rect: [0.56, 0.26, 0.85, 0.62], feather: 0.02 }, amp: 0.03, speed: 3.0 },
         { type: 'dust', region: [0.30, 0.10, 0.66, 0.62], count: 55, amp: 0.55, size: 1.2, gate: [0.18, 0.5], color: '#fff1d6', vel: [0.002, -0.006] }] }),
  // #015 render 3 — the torn net, water dripping through the light
  B5: shot('2026-09-19_16-39-46', { look: [[0.50, 0.50], [0.52, 0.46]], zoom: [1.02, 1.09], truck: [[-20, -6], [20, 3]], focal: 0.45, dolly: 0.10,
    fx: [{ type: 'drips', region: [0.30, 0.0, 0.76, 0.78], count: 45, vel: [0, 0.55], len: 16, amp: 0.5, size: 1.4, gate: [0.12, 0.45], color: '#e2ecff' },
         { type: 'dust', region: [0.28, 0.0, 0.78, 0.65], count: 60, amp: 0.5, gate: [0.25, 0.6], color: '#eef4ff' },
         { type: 'flicker', mask: { ellipse: [0.46, 0.18, 0.22, 0.30] }, amp: 0.025, speed: 0.8 }] }),
  // #015 render 1 — underwater, the mice of the poem
  B1: shot('2026-09-19_14-55-00', { look: [[0.48, 0.52], [0.60, 0.46]], zoom: [1.05, 1.15], truck: [[-22, -8], [22, 8]], focal: 0.5, dolly: 0.07, rot: [-0.8, 0.8], ease: 0.5,
    fx: [{ type: 'shimmer', amp: 1.6, wl: 170, period: 4.5 }, { type: 'caustics', amp: 0.11, wl: 130, period: 6.0, sharp: 5 },
         { type: 'bubbles', count: 45, vel: [0.002, -0.035], size: 2.4, amp: 0.5, color: '#d8fff0', light_gated: false }] }),
  // #015 render 2 — laughing in the flooded tunnel
  B3: shot('2026-09-19_14-59-10', { look: [[0.54, 0.50], [0.48, 0.50]], zoom: [1.03, 1.08], truck: [[21, 0], [-21, 0]], focal: 0.6, dolly: 0.04,
    fx: [{ type: 'shimmer', mask: { rect: [0, 0.60, 1, 1], feather: 0.04 }, amp: 1.8, wl: 60, period: 2.6 },
         { type: 'drips', region: [0.15, 0.0, 0.95, 0.6], count: 22, vel: [0, 0.6], len: 12, amp: 0.3, gate: [0.1, 0.4] },
         { type: 'dust', region: [0.3, 0.1, 0.95, 0.6], count: 35, amp: 0.45, gate: [0.2, 0.5] }] }),
  // #015 render 4 — crawling through the reeds (baked caption "Underground Poem 015" framed out by the crop)
  B7: shot('2026-09-20_07-46-06', { crop: [0, 0, 1, 0.93], look: [[0.48, 0.48], [0.54, 0.45]], zoom: [1.02, 1.06], truck: [[26, 0], [-26, 0]], focal: 0.5, dolly: 0.04,
    fx: [{ type: 'shimmer', mask: { rect: [0, 0.62, 1, 1], feather: 0.04 }, amp: 1.5, wl: 70, period: 3.0 },
         { type: 'dust', region: [0.2, 0.0, 0.9, 0.6], count: 40, amp: 0.4, gate: [0.2, 0.5], color: '#e8f0ff' }] }),
  // #024 — floors against the body
  C1: shot('2026-09-20_13-02-36', { look: [[0.42, 0.56], [0.58, 0.52]], zoom: [1.05, 1.10], truck: [[-16, 0], [16, -5]], focal: 0.7, dolly: 0.05,
    fx: [{ type: 'dust', region: [0.35, 0.0, 0.95, 0.78], count: 110, vel: [0.003, -0.004], amp: 0.8, size: 1.3, gate: [0.25, 0.55], color: '#fff4e6' },
         { type: 'flicker', amp: 0.015, speed: 0.6 }] }),
  // #037 — smoky incense out of their feathers
  D1: shot('2026-09-20_14-31-02', { look: [[0.52, 0.52], [0.56, 0.42]], zoom: [1.02, 1.09], truck: [[12, 5], [-12, -5]], focal: 0.55, dolly: 0.07,
    fx: [{ type: 'flow', mask: { ellipse: [0.36, 0.25, 0.11, 0.27] }, amp: 5, rise: 22, wl: 70 },
         { type: 'dust', region: [0.1, 0.05, 0.95, 0.9], count: 60, amp: 0.5, gate: [0.3, 0.65], color: '#ffe7c4' },
         { type: 'flicker', amp: 0.015, speed: 0.7 }] }),
  // #022 — alone at the rusted wall; the tunnel lamps buzz
  E1: shot('2026-09-20_17-35-14', { look: [[0.56, 0.50], [0.50, 0.50]], zoom: [1.03, 1.08], truck: [[18, 0], [-18, 0]], focal: 0.65, dolly: 0.05,
    fx: [{ type: 'flicker', mask: { ellipse: [0.21, 0.22, 0.07, 0.05] }, amp: 0.14, speed: 4.0 },
         { type: 'flicker', mask: { ellipse: [0.325, 0.25, 0.03, 0.03] }, amp: 0.12, speed: 2.2 },
         { type: 'shimmer', mask: { rect: [0, 0.62, 0.5, 1], feather: 0.03 }, amp: 1.2, wl: 50, period: 3.0 },
         { type: 'drips', region: [0.02, 0.1, 0.45, 0.75], count: 14, vel: [0, 0.6], len: 10, amp: 0.3, gate: [0.1, 0.4] }] }),
  // #099 — the lily corridor (also the cover behind the title)
  A2: shot('2026-09-12_07-59-30', { look: [[0.50, 0.46], [0.50, 0.42]], zoom: [1.03, 1.12], dolly: 0.11, rot: [0.3, -0.3], focal: 0.4,
    fx: [{ type: 'dust', region: [0.25, 0.0, 0.95, 1.0], count: 70, amp: 0.55, gate: [0.2, 0.5], color: '#fff0cc' },
         { type: 'flicker', amp: 0.015, speed: 0.6 }] }),
  // #099 — the corridor profile (baked letterbox + the "BAZAAR" corner mark framed out by the crop)
  A5: shot('2026-09-12_09-28-29', { crop: [0.0, 0.035, 0.955, 0.945], look: [[0.45, 0.5], [0.50, 0.5]], zoom: [1.04, 1.10], truck: [[-21, 0], [21, 0]], focal: 0.75, dolly: 0.05,
    fx: [{ type: 'shimmer', mask: { rect: [0.42, 0.62, 0.8, 0.95], feather: 0.03 }, amp: 1.2, wl: 45, period: 2.5 },
         { type: 'dust', region: [0.45, 0.2, 0.75, 0.8], count: 40, amp: 0.45, gate: [0.15, 0.45], color: '#cfe3ff' },
         { type: 'flicker', mask: { ellipse: [0.59, 0.31, 0.05, 0.05] }, amp: 0.05, speed: 1.2 }] }),
  // #091 — one AM, the laptop light breathing on her face
  F1: shot('2026-09-20_18-31-21', { look: [[0.50, 0.50], [0.52, 0.42]], zoom: [1.02, 1.10], truck: [[-12, 0], [12, 0]], focal: 0.6, dolly: 0.06,
    fx: [{ type: 'flicker', mask: { ellipse: [0.36, 0.60, 0.26, 0.32] }, amp: 0.05, speed: 2.5 },
         { type: 'flicker', mask: { ellipse: [0.09, 0.36, 0.07, 0.10] }, amp: 0.03, speed: 1.0 },
         { type: 'dust', region: [0.0, 0.2, 0.25, 0.6], count: 20, amp: 0.4, gate: [0.25, 0.6], color: '#ffe9c2' }] }),
};
// the nine verticals as gallery walls (full images, each panel moving on its own)
const LAYOUT = {
  four: { w: 300, h: 533, xs: [13, 331, 649, 967], y: 93, fade: [0.15, 0.55, 0.95, 1.35] },
  two: { w: 405, h: 720, xs: [225, 650], y: 0, fade: [0.2, 1.1] },
  three: { w: 405, h: 720, xs: [12, 437, 862], y: 0, fade: [0.2, 0.8, 1.4] },
};
const WALLS = {
  // #015's four renders, in the order they were made (14:55, 14:59, 16:40, next morning 07:46)
  T1: { layout: 'four', zoom: [1.0, 1.04], panels: [
    shot('2026-09-19_14-55-25', { look: [[0.5, 0.45], [0.5, 0.40]], zoom: [1.02, 1.07], truck: [[-6, 0], [6, 0]], focal: 0.5,
      fx: [{ type: 'shimmer', amp: 1.0, wl: 90, period: 4 }, { type: 'caustics', amp: 0.09, wl: 80, period: 6, sharp: 5 }] }),
    shot('2026-09-19_14-59-25', { look: [[0.5, 0.52], [0.5, 0.50]], zoom: [1.02, 1.06], truck: [[6, 0], [-6, 0]], focal: 0.6,
      fx: [{ type: 'shimmer', mask: { rect: [0, 0.62, 1, 1], feather: 0.03 }, amp: 1.2, wl: 40, period: 2.5 }] }),
    shot('2026-09-19_16-40-03', { look: [[0.5, 0.50], [0.5, 0.46]], zoom: [1.02, 1.07], truck: [[-6, 0], [6, 0]], focal: 0.5,
      fx: [{ type: 'drips', region: [0.2, 0.05, 0.8, 0.7], count: 25, vel: [0, 0.5], len: 9, amp: 0.45, gate: [0.12, 0.45], color: '#e2ecff' }] }),
    shot('2026-09-20_07-46-12', { inpaint: [[0.27, 0.298, 0.73, 0.328]], look: [[0.5, 0.5], [0.5, 0.52]], zoom: [1.02, 1.06], truck: [[6, 0], [-6, 0]], focal: 0.5,
      fx: [{ type: 'shimmer', mask: { rect: [0, 0.56, 1, 1], feather: 0.03 }, amp: 1.0, wl: 40, period: 2.8 },
           { type: 'flicker', mask: { ellipse: [0.5, 0.2, 0.2, 0.2] }, amp: 0.04, speed: 1.0 }] }),
  ] },
  // #099 — lilies growing out of her chest; lilies over her face
  T2: { layout: 'two', zoom: [1.0, 1.03], panels: [
    shot('2026-09-12_09-03-54', { look: [[0.5, 0.5], [0.58, 0.40]], zoom: [1.03, 1.10], truck: [[-7, 0], [7, 0]], focal: 0.5,
      fx: [{ type: 'dust', region: [0.3, 0, 1, 0.8], count: 40, amp: 0.5, gate: [0.3, 0.6], color: '#ffe9c2' },
           { type: 'flicker', mask: { ellipse: [0.85, 0.40, 0.2, 0.2] }, amp: 0.03, speed: 0.8 }] }),
    shot('2026-09-12_07-59-44', { look: [[0.5, 0.5], [0.5, 0.38]], zoom: [1.03, 1.12], truck: [[7, 0], [-7, 0]], focal: 0.5,
      fx: [{ type: 'dust', region: [0, 0, 1, 0.8], count: 40, amp: 0.45, gate: [0.3, 0.6], color: '#fff0c0' }] }),
  ] },
  // the closing wall — three rooms: the stairs (#024), the doorway (#037), the laptop (#091)
  T3: { layout: 'three', zoom: [1.0, 1.03], panels: [
    shot('2026-09-20_13-02-50', { look: [[0.5, 0.55], [0.5, 0.60]], zoom: [1.02, 1.06], truck: [[-6, 0], [6, 0]], focal: 0.6,
      fx: [{ type: 'dust', region: [0.4, 0.1, 0.85, 0.7], count: 50, amp: 0.7, gate: [0.25, 0.55], color: '#fff4e6' }] }),
    shot('2026-09-20_14-31-22', { look: [[0.5, 0.45], [0.5, 0.42]], zoom: [1.02, 1.06], truck: [[6, 0], [-6, 0]], focal: 0.55,
      fx: [{ type: 'flow', mask: { ellipse: [0.45, 0.13, 0.2, 0.12] }, amp: 3, rise: 14, wl: 50 },
           { type: 'dust', region: [0.1, 0.1, 0.9, 0.9], count: 30, amp: 0.4, gate: [0.3, 0.65], color: '#ffe7c4' }] }),
    shot('2026-09-20_18-31-38', { look: [[0.5, 0.40], [0.5, 0.36]], zoom: [1.02, 1.07], truck: [[-6, 0], [6, 0]], focal: 0.55,
      fx: [{ type: 'flicker', mask: { ellipse: [0.40, 0.55, 0.40, 0.25] }, amp: 0.05, speed: 2.5 },
           { type: 'flicker', mask: { ellipse: [0.85, 0.20, 0.15, 0.15] }, amp: 0.03, speed: 1.0 }] }),
  ] },
};

// ---------------------------------------------------------------- the cut (every clip and every still, once)
const SEQ = [
  // #099 — could not generate content
  { still: 'A1', dur: 6.0 },
  { clip: 'qekCAAGo.mp4', dur: 4.5, ss: 0.3 },
  // #015 — frozen (render 3: the net)
  { still: 'B5', stanza: 's01' },
  { clip: 'atuona-base2.mp4' },
  { clip: 't9YkZ1h8.mp4', dur: 4.5, ss: 0.3 },
  // #015 render 1: underwater
  { still: 'B1', stanza: 's02' },
  // #015 render 2: the flooded tunnel
  { clip: 'atuona-base1.mp4', dur: 4.0, ss: 0.5 },
  { still: 'B3', dur: 5.0 },
  { clip: 'MVsvkDl2.mp4', dur: 4.5, ss: 0.3 },
  // #015 render 4: the reeds
  { still: 'B7', dur: 5.5 },
  { clip: 'atuona-base7.mp4', stanza: 's03' },
  { clip: 'oSl5VQx2.mp4', dur: 4.5, ss: 0.3 },
  { wall: 'T1', dur: 6.5 },
  // #024 — burned out
  { still: 'C1', stanza: 's04' },
  { clip: 'atuona-base8.mp4', stanza: 's05' },
  // #037 — from the hurt
  { still: 'D1', stanza: 's06' },
  { clip: 'atuona-base68.mp4', dur: 4.5, ss: 0.3 },
  { clip: 'U9nbGpWo.mp4', dur: 4.0, ss: 0.5 },
  // #022 — wild tales curl
  { clip: '0qjJIwPU.mp4', dur: 5.0 },
  { clip: 'atuona-base21.mp4', stanza: 's07' },
  { still: 'E1', stanza: 's08' },
  // #020 — nobody's
  { clip: 'xJycIP8b.mp4', dur: 4.0, ss: 0.5 },
  { clip: 'atuona-base6.mp4', stanza: 's09' },
  // #066 — the threshold
  { clip: '1Lj18KI5.mp4', stanza: 's10' },
  // #099 — the lilies keep growing
  { clip: 'atuona-base.mp4', dur: 5.0 },
  { still: 'A2', dur: 5.5 },
  { wall: 'T2', stanza: 's11' },
  { still: 'A5', dur: 5.0 },
  { clip: 'wuwBPZpT.mp4', stanza: 's12' },
  // #091 — paradise is compiled from what you have
  { clip: 'kXMf1WTY.mp4', stanza: 's13' },
  { still: 'F1', dur: 5.0 },
  { clip: 'atuona-base9.mp4', stanza: 's14' },
  { wall: 'T3', dur: 7.5, code: ['git add souls.txt', 'git commit -m "prometheus wore safety pins"', 'git push origin tomorrow'] },
];

// ---------------------------------------------------------------- helpers (film3)
const caps = s => (s || '').toUpperCase();
const track = s => caps(s).split('').join(' ');
function wrap(s, maxCols, maxLines) { const out = []; for (const raw of String(s).replace(/\r/g, '').split('\n')) { const words = raw.trim().split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); continue; } let cur = ''; for (const w of words) { if (cur && (cur.length + 1 + w.length) > maxCols) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; } if (cur) out.push(cur); } while (out.length && out[out.length - 1] === '') out.pop(); return out.slice(0, maxLines).join('\n'); }
async function dur(f) { const { stdout } = await execFileP0('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]); const d = parseFloat(stdout.trim()); if (!(d > 0)) throw new Error('no duration: ' + f); return d; }
const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];
const silence = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];

function stillSpec(seg, d) {
  if (seg.still) return { base_dir: BASE, dur: d, fps: 30, size: [1280, 720], grain: GRAIN, vignette: 0.2, shots: [SHOTS[seg.still]] };
  const wall = WALLS[seg.wall], L = LAYOUT[wall.layout];
  return { base_dir: BASE, dur: d, fps: 30, size: [1280, 720], grain: GRAIN, vignette: 0.12, bg: '#0a0a0b', wall: { zoom: wall.zoom },
    shots: wall.panels.map((p, i) => ({ ...p, rect: [L.xs[i], L.y, L.w, L.h], fade_in: [L.fade[i], 0.9] })) };
}
async function renderStill(seg, d) {
  const spec = stillSpec(seg, d);
  const key = crypto.createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 10);
  const out = path.join(SC, `${seg.still || seg.wall}_${key}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) return out;
  spec.out = out;
  const sp = path.join(SPECS, `${seg.still || seg.wall}_${key}.json`);
  fs.writeFileSync(sp, JSON.stringify(spec, null, 1));
  await execFileP(PY, [SM, 'render', sp], { maxBuffer: 1 << 26, timeout: 1800000 });
  return out;
}

// Stanzas run across the whole width at the bottom (Elena, 22.09.2026 — a 50-column block in a small box sat in the
// middle of the frame). Verse lines are joined, in order, into the fewest screen lines that fit STANZA_COLS, choosing
// the cut that keeps the lines most even; each line is centred inside a full-width band that fades with the text.
const STANZA_SIZE = 22, STANZA_COLS = 92;
function spread(text, maxCols = STANZA_COLS) {
  const verse = String(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const len = g => g.join(' ').length;
  // every way to cut the verse lines from `from` on into n consecutive groups
  const parts = (from, n) => n === 1 ? [[verse.slice(from)]]
    : Array.from({ length: verse.length - from - n + 1 }, (_, k) => from + k + 1)
        .flatMap(cut => parts(cut, n - 1).map(rest => [verse.slice(from, cut), ...rest]));
  for (let n = 1; n <= verse.length; n++) {
    const fits = parts(0, n).filter(p => p.every(g => len(g) <= maxCols));
    if (fits.length) return fits.sort((a, b) => Math.max(...a.map(len)) - Math.max(...b.map(len)))[0].map(g => g.join(' ')).join('\n');
  }
  return wrap(verse.join(' '), maxCols, 7);   // one verse line wider than the frame: plain wrap
}
function textDraw(lines, clipDur, opaque) {
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = opaque ? '1' : `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  return `,drawtext=fontfile=${FONT}:textfile=${lines}:expansion=none:fontcolor=white:fontsize=${STANZA_SIZE}:line_spacing=9:text_align=C:x=0:y=h-text_h-26:box=1:boxw=1280:boxborderw=22|0|26|0:boxcolor=black@0.42:shadowcolor=black@0.6:shadowx=0:shadowy=1:alpha='${alpha}'`;
}
function codeDraw(i, lines, clipDur) {
  // git lines appear one by one (monospace — they are code), all fade out with the segment
  let s = '';
  const n = lines.length;
  lines.forEach((ln, k) => {
    const f = path.join(W, `code_${i}_${k}.txt`); fs.writeFileSync(f, ln);
    const t0 = (1.7 + k * 1.0).toFixed(2), fo = (clipDur - 1.0).toFixed(2);
    const alpha = `if(lt(t,${t0}),0,if(lt(t,${t0}+0.5),(t-${t0})/0.5,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1)))`;
    s += `,drawtext=fontfile=${MONO}:textfile=${f}:expansion=none:fontcolor=0xDDDDDD:fontsize=21:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=h-${40 + (n - 1 - k) * 44}-text_h:alpha='${alpha}'`;
  });
  return s;
}

async function makeCard(titleRaw, subRaw, outFile, d, titleSize, bgVideo, noFadeIn) {
  const tFile = outFile + '_t.txt'; fs.writeFileSync(tFile, track(titleRaw));
  // a long tracked title shrinks to fit 1180px (DejaVuSansMono advance = 0.602 em) instead of running off the frame
  const size = Math.min(titleSize, Math.floor(1180 / (track(titleRaw).length * 0.602)));
  let draw = `drawtext=fontfile=${MONO}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2-26`;
  // one drawtext per subtitle line: a multi-line drawtext centres the block but left-aligns line 2 under line 1
  if (subRaw && subRaw.trim()) wrap(caps(subRaw), 56, 2).split('\n').forEach((line, k) => { const sFile = `${outFile}_s${k}.txt`; fs.writeFileSync(sFile, line); draw += `,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=20:x=(w-text_w)/2:y=(h/2)+40+${k * 33}`; });
  // noFadeIn: frame 0 is the full title card, so the gallery <video> poster is never black
  const fades = `${noFadeIn ? '' : 'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;
  if (bgVideo) {
    const vf = `scale=1280:720,fps=30,eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP('ffmpeg', ['-y', '-i', bgVideo, ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 120000 });
  } else {
    const vf = `${draw},${fades}`;
    await execFileP('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=30:d=${d.toFixed(2)}`, ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 120000 });
  }
  return outFile;
}

// run tasks with a small concurrency (2 cores on Oracle)
async function pool(n, tasks) { const res = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } })); return res; }

// ---------------------------------------------------------------- build
async function main() {
  const publish = process.argv.includes('--publish');
  const final = path.join(W, 'final.mp4');
  if (publish) {
    if (!fs.existsSync(final)) throw new Error('no work/final.mp4 — build first');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(OUTDIR, `${SLUG}-${stamp}.mp4`);
    fs.copyFileSync(final, dest + '.part'); fs.renameSync(dest + '.part', dest);
    console.log('PUBLISHED', dest);
    return;
  }
  for (const d of [W, SC, SPECS]) fs.mkdirSync(d, { recursive: true });
  const STANZAS = JSON.parse(fs.readFileSync(BASE + '/stanzas.json', 'utf8'));

  // --stanza-preview: every stanza in the current layout over frame 0 of its built segment (text-free there: the
  // alpha starts at 0), plus each screen line's width in pixels. Renders nothing into the film.
  if (process.argv.includes('--stanza-preview')) {
    const PV = path.join(W, 'stanza-preview'); fs.mkdirSync(PV, { recursive: true });
    const tl = JSON.parse(fs.readFileSync(path.join(W, 'timeline.json'), 'utf8')).filter(s => s.stanza);
    for (const s of tl) {
      const txt = path.join(PV, `${s.stanza}.txt`), lines = spread(STANZAS[s.stanza].text);
      fs.writeFileSync(txt, lines);
      const seg = path.join(W, `seg_${String(s.i - 1).padStart(2, '0')}.mp4`);
      await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', seg, '-frames:v', '1', '-vf', 'null' + textDraw(txt, 99, true), path.join(PV, `${s.stanza}.png`)]);
      const widths = [];
      for (const [k, line] of lines.split('\n').entries()) {
        const lf = path.join(PV, `${s.stanza}_w${k}.txt`); fs.writeFileSync(lf, line);
        const r = await execFileP0('ffmpeg', ['-nostdin', '-f', 'lavfi', '-i', 'color=c=black:s=1800x80', '-vf', `drawtext=fontfile=${FONT}:textfile=${lf}:expansion=none:fontcolor=white:fontsize=${STANZA_SIZE}:x=10:y=20,bbox=min_val=40`, '-frames:v', '1', '-f', 'null', '-'], { maxBuffer: 1 << 24 }).catch(e => e);
        widths.push(+((String(r.stderr).match(/ w:(\d+)/) || [])[1] || -1));
      }
      console.log(`${s.stanza} ${lines.split('\n').length} line(s), widest ${Math.max(...widths)}px of 1280 | ${lines.replace(/\n/g, ' ⏎ ')}`);
    }
    console.log('PREVIEW', PV); return;
  }
  fs.writeFileSync(LOG, '');

  // every clip and every still exactly once
  const used = SEQ.filter(s => s.clip).map(s => s.clip).sort();
  const all = fs.readdirSync(CLIPS).filter(f => f.endsWith('.mp4')).sort();
  if (JSON.stringify(used) !== JSON.stringify(all)) throw new Error('clip set mismatch: ' + all.filter(f => !used.includes(f)).join(','));
  const stillsUsed = [...SEQ.filter(s => s.still).map(s => SHOTS[s.still].img), ...SEQ.filter(s => s.wall).flatMap(s => WALLS[s.wall].panels.map(p => p.img))].map(p => path.basename(p)).sort();
  const stillsAll = fs.readdirSync(BASE + '/stills').filter(f => f.endsWith('.jpg')).sort();
  if (JSON.stringify(stillsUsed) !== JSON.stringify(stillsAll)) throw new Error('still set mismatch');
  process.stderr.write(`material: ${used.length} clips + ${stillsUsed.length} stills, all used once\n`);

  // 1. durations (voice locked to its segment)
  const plan = [];
  for (const seg of SEQ) {
    let vo = null, vd = 0;
    if (seg.stanza) { vo = path.join(VODIR, seg.stanza + '.mp3'); vd = await dur(vo); }
    const need = vo ? LEAD + vd + TAIL : 0;
    if (seg.clip) {
      const ss = seg.ss || 0;
      const srcDur = await dur(path.join(CLIPS, seg.clip));
      const nat = seg.dur ? Math.min(seg.dur, srcDur - ss) : srcDur - ss;
      const d = Math.max(nat, need, seg.dur || 0);
      plan.push({ seg, vo, vd, ss, nat, d, factor: d / nat });
    } else {
      plan.push({ seg, vo, vd, d: Math.max(seg.dur || 0, need) });
    }
  }

  // --probe: first / middle / last frame of every still shot + wall, for review before the long render
  if (process.argv.includes('--probe')) {
    fs.mkdirSync(path.join(W, 'probe'), { recursive: true });
    const jobs = plan.filter(p => !p.seg.clip).map(p => async () => {
      const id = p.seg.still || p.seg.wall;
      const sp = path.join(SPECS, `probe_${id}.json`); fs.writeFileSync(sp, JSON.stringify(stillSpec(p.seg, p.d)));
      for (const [k, t] of [['a', 0], ['b', p.d / 2], ['c', p.d - 0.04]]) await execFileP(PY, [SM, 'probe', sp, t.toFixed(2), path.join(W, 'probe', `${id}_${k}.jpg`)], { timeout: 300000 });
      process.stderr.write(`probe ${id} ${p.d.toFixed(2)}s\n`);
    });
    await pool(2, jobs);
    return;
  }

  // 2. render the stills / walls (+ the moving cover behind the title)
  const coverSeg = { still: 'A2' };
  const stillTasks = plan.filter(p => !p.seg.clip).map(p => async () => { p.src = await renderStill(p.seg, p.d); process.stderr.write(`still ${p.seg.still || p.seg.wall} ${p.d.toFixed(2)}s\n`); });
  let cover;
  stillTasks.push(async () => { cover = await renderStill({ ...coverSeg, cover: true }, 4.4); });
  await pool(2, stillTasks);

  // 3. normalize every segment + burn its text
  //    --reuse keeps finished work/seg_NN.mp4; --reseg=23,24 re-renders only those (0-based) — e.g. after a text fix
  const reuse = process.argv.includes('--reuse');
  const reseg = ((process.argv.find(a => a.startsWith('--reseg=')) || '').slice(8)).split(',').filter(Boolean).map(Number);
  const segFiles = [];
  const segTasks = plan.map((p, i) => async () => {
    const out = path.join(W, `seg_${String(i).padStart(2, '0')}.mp4`);
    if (reuse && !reseg.includes(i) && fs.existsSync(out) && fs.statSync(out).size > 10000) { segFiles[i] = out; return; }
    let draw = '';
    if (p.seg.stanza) { const txt = path.join(W, `p_${i}.txt`); fs.writeFileSync(txt, spread(STANZAS[p.seg.stanza].text)); draw = textDraw(txt, p.d); }
    if (p.seg.code) draw += codeDraw(i, p.seg.code, p.d);
    let vf, inArgs;
    if (p.seg.clip) {
      const interp = p.factor >= MI_FROM ? 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' : 'fps=30';
      inArgs = ['-ss', p.ss.toFixed(2), '-i', path.join(CLIPS, p.seg.clip)];
      vf = `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=${p.factor.toFixed(5)}*PTS,${interp},format=yuv420p${draw}`;
    } else {
      inArgs = ['-i', p.src];
      vf = `scale=1280:720,setsar=1,fps=30,format=yuv420p${draw}`;
    }
    await execFileP('ffmpeg', ['-y', ...inArgs, ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', p.d.toFixed(2), ...enc, out], { maxBuffer: 1 << 26, timeout: 900000 });
    segFiles[i] = out;
    const what = p.seg.clip || p.seg.still || p.seg.wall;
    process.stderr.write(`seg ${i + 1}/${plan.length} ${what} ${p.d.toFixed(2)}s${p.seg.stanza ? ' ' + p.seg.stanza : ''}${p.factor && p.factor > 1.001 ? ` slow×${p.factor.toFixed(2)}${p.factor >= MI_FROM ? ' (interp)' : ''}` : ''}\n`);
  });
  await pool(2, segTasks);

  const seq = [await makeCard(FILM_TITLE, MOMENTS, path.join(W, 'card_intro.mp4'), 4.4, 40, cover, true), ...segFiles,
               await makeCard('ATUONA', OUTRO_SUB, path.join(W, 'card_outro.mp4'), 4.2, 56)];

  // 4. dissolve chain (offset = running merged length − XFADE_D)
  const durs = []; for (const c of seq) durs.push(await dur(c));
  const segStart = k => { let s = 0; for (let i = 0; i < k; i++) s += durs[i]; return Math.max(0, s - k * XFADE_D); };
  const inputs = seq.flatMap(c => ['-i', c]); let fc = ''; let vlab = '0:v', alab = '0:a', merged = durs[0];
  for (let k = 1; k < seq.length; k++) { const ofs = Math.max(0, merged - XFADE_D).toFixed(3); fc += `[${vlab}][${k}:v]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[vc${k}];[${alab}][${k}:a]acrossfade=d=${XFADE_D}[ac${k}];`; vlab = `vc${k}`; alab = `ac${k}`; merged += durs[k] - XFADE_D; }
  const body = path.join(W, 'body.mp4');
  process.stderr.write(`dissolve chain: ${seq.length} segments, ${merged.toFixed(1)}s\n`);
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '5M', '-bufsize', '10M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', body], { maxBuffer: 1 << 27, timeout: 3600000 });

  // 5. mix: music bed ducked under the voice bus, loudness-normalized
  const LEN = await dur(body);
  const voAt = plan.map((p, i) => p.vo ? { file: p.vo, t: +(segStart(i + 1) + LEAD).toFixed(2) } : null).filter(Boolean);
  let mf = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];`;
  const vl = []; voAt.forEach((v, k) => { mf += `[${k + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1[v${k}];`; vl.push(`[v${k}]`); });
  mf += `${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];`;
  mf += `[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];[premix]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false[a]`; // limiter: single-pass loudnorm let the true peak reach -0.2 dBFS
  const mixIn = ['-i', body, '-stream_loop', '-1', '-i', MUSIC]; voAt.forEach(v => mixIn.push('-i', v.file));
  await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', '-movflags', '+faststart', final], { maxBuffer: 1 << 27, timeout: 900000 });
  fs.writeFileSync(path.join(W, 'timeline.json'), JSON.stringify(plan.map((p, i) => ({ i: i + 1, what: p.seg.clip || p.seg.still || p.seg.wall, stanza: p.seg.stanza || null, start: +segStart(i + 1).toFixed(2), dur: +p.d.toFixed(2), vo_at: p.vo ? +(segStart(i + 1) + LEAD).toFixed(2) : null })), null, 1));
  console.log(`DONE ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${LEN.toFixed(1)}s, ${plan.length} segments, ${voAt.length} voiced) — verify, then: node film7.mjs --publish`);
}
main().catch(e => { console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message); process.exit(1); });
