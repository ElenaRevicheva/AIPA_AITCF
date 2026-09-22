// Atuona film #8 — compile. VIDEO ONLY: every shot is a generated clip (Wan 2.7 / Grok Imagine 1.5), no stills.
// Shots, stanzas and voices come from plan.json (docs/atuona/film8-plan.json); clips from gen.mjs (scripts/atuona-film8-gen.mjs);
// voice from vo.py (scripts/atuona-film8-vo.py). Pipeline = film7's: voice locked to its shot, 1.3 s dissolves, stanzas across
// the full width at the bottom, mono title cards, music ducked under the voice, loudnorm + limiter.
// Run on Oracle:  cd /home/ubuntu/atuona-film8 && node film8.mjs            (writes work/final.mp4 — NOT published)
//                 node film8.mjs --reuse [--reseg=3,4]                      (re-cut only those segments)
//                 node film8.mjs --stanza-preview                            (every stanza over its shot + pixel widths)
//                 node film8.mjs --publish                                   (copies the verified final into films/out)
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP0 = promisify(execFile);

const BASE = '/home/ubuntu/atuona-film8';
const W = BASE + '/work', CLIPS = BASE + '/clips', VODIR = BASE + '/vo';
const OUTDIR = '/home/ubuntu/cto-aipa/data/atuona/films/out';
const MUSIC = '/home/ubuntu/cto-aipa/data/atuona/films/music/the-ritual-tribal-trap-sensual-saturn3-pixabay.mp3';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const XFADE_D = 1.3, LEAD = 0.7, TAIL = 1.9, MI_FROM = 1.3, VO_GAP = 0.6;
const PLAN = JSON.parse(fs.readFileSync(BASE + '/plan.json', 'utf8'));
const FILM_TITLE = process.env.FILM_TITLE || 'Hungry Earth';
const SLUG = FILM_TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MOMENTS = '22.09.2026  ·  atuona.xyz Gallery  ·  Fragments  ·  ATUONA #092 #071 #095  ·  LITPROM #007 #039';   // Elena: they are FRAGMENTS, never moments
const OUTRO_SUB = 'atuona.xyz // Paradise.js  ·  by Kira Velerevich';
const COVER_SHOT = 's09';   // the underwater fall through the mirror shards, darkened behind the title

const LOG = BASE + '/ffmpeg-commands.log';
async function execFileP(cmd, args, opts) {
  fs.appendFileSync(LOG, cmd + ' ' + args.map(a => /[\s\[\];,']/.test(a) ? `'${a}'` : a).join(' ') + '\n\n');
  return execFileP0(cmd, args, opts);
}
const caps = s => (s || '').toUpperCase();
const track = s => caps(s).split('').join(' ');
function wrap(s, maxCols, maxLines) { const out = []; for (const raw of String(s).replace(/\r/g, '').split('\n')) { const words = raw.trim().split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); continue; } let cur = ''; for (const w of words) { if (cur && (cur.length + 1 + w.length) > maxCols) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; } if (cur) out.push(cur); } while (out.length && out[out.length - 1] === '') out.pop(); return out.slice(0, maxLines).join('\n'); }
async function dur(f) { const { stdout } = await execFileP0('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]); const d = parseFloat(stdout.trim()); if (!(d > 0)) throw new Error('no duration: ' + f); return d; }
const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];
const silence = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
async function pool(n, tasks) { const res = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } })); return res; }

// stanzas across the whole width at the bottom (film7's spread(): fewest even screen lines within 92 columns)
const STANZA_SIZE = 22, STANZA_COLS = 92;
function spread(text, maxCols = STANZA_COLS) {
  const verse = String(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const len = g => g.join(' ').length;
  const parts = (from, n) => n === 1 ? [[verse.slice(from)]]
    : Array.from({ length: verse.length - from - n + 1 }, (_, k) => from + k + 1)
        .flatMap(cut => parts(cut, n - 1).map(rest => [verse.slice(from, cut), ...rest]));
  for (let n = 1; n <= verse.length; n++) {
    const fits = parts(0, n).filter(p => p.every(g => len(g) <= maxCols));
    if (fits.length) return fits.sort((a, b) => Math.max(...a.map(len)) - Math.max(...b.map(len)))[0].map(g => g.join(' ')).join('\n');
  }
  return wrap(verse.join(' '), maxCols, 7);
}
function textDraw(lines, clipDur, opaque) {
  const fo = (clipDur - 1.0).toFixed(2);
  const alpha = opaque ? '1' : `if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`;
  return `,drawtext=fontfile=${FONT}:textfile=${lines}:expansion=none:fontcolor=white:fontsize=${STANZA_SIZE}:line_spacing=9:text_align=C:x=0:y=h-text_h-26:box=1:boxw=1280:boxborderw=22|0|26|0:boxcolor=black@0.42:shadowcolor=black@0.6:shadowx=0:shadowy=1:alpha='${alpha}'`;
}
async function makeCard(titleRaw, subRaw, outFile, d, titleSize, bgVideo, noFadeIn) {
  const tFile = outFile + '_t.txt'; fs.writeFileSync(tFile, track(titleRaw));
  const size = Math.min(titleSize, Math.floor(1180 / (track(titleRaw).length * 0.602)));
  let draw = `drawtext=fontfile=${MONO}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2-26`;
  if (subRaw && subRaw.trim()) wrap(caps(subRaw), 56, 2).split('\n').forEach((line, k) => { const sFile = `${outFile}_s${k}.txt`; fs.writeFileSync(sFile, line); draw += `,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=20:x=(w-text_w)/2:y=(h/2)+40+${k * 33}`; });
  const fades = `${noFadeIn ? '' : 'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;   // noFadeIn: frame 0 = the card (gallery poster)
  if (bgVideo) {
    const vf = `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP('ffmpeg', ['-y', '-i', bgVideo, ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 120000 });
  } else {
    await execFileP('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=30:d=${d.toFixed(2)}`, ...silence, '-filter_complex', `[0:v]${draw},${fades}[v]`, '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), ...enc, outFile], { maxBuffer: 1 << 26, timeout: 120000 });
  }
  return outFile;
}

const clipOf = (sid, shot) => path.join(CLIPS, `${sid}__${shot.engine}.mp4`);
const stanzaOf = shot => shot.vo.map(v => v.text).join('\n');

async function main() {
  const final = path.join(W, 'final.mp4');
  if (process.argv.includes('--publish')) {
    if (!fs.existsSync(final)) throw new Error('no work/final.mp4 — build first');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(OUTDIR, `${SLUG}-${stamp}.mp4`);
    fs.copyFileSync(final, dest + '.part'); fs.renameSync(dest + '.part', dest);
    console.log('PUBLISHED', dest); return;
  }
  fs.mkdirSync(W, { recursive: true });
  const SHOTS = Object.entries(PLAN.shots).filter(([k]) => /^s\d\d$/.test(k)).sort(([a], [b]) => a.localeCompare(b));

  // every planned shot is a rendered video (no stills, nothing missing)
  const missing = SHOTS.filter(([sid, s]) => !fs.existsSync(clipOf(sid, s))).map(([sid, s]) => `${sid}__${s.engine}`);
  if (missing.length) throw new Error('missing clips: ' + missing.join(', '));

  // 1. durations: the shot is at least as long as its voice (LEAD + lines + gaps + TAIL); longer clips keep their length
  const plan = [];
  for (const [sid, shot] of SHOTS) {
    const vos = shot.vo.map((v, k) => path.join(VODIR, `${sid}_${k}.mp3`));
    const vds = []; for (const f of vos) vds.push(await dur(f));
    const need = LEAD + vds.reduce((a, b) => a + b, 0) + VO_GAP * (vds.length - 1) + TAIL;
    const nat = Math.min(await dur(clipOf(sid, shot)), shot.trim || Infinity);   // plan `trim`: drop an off-plan tail (s07's pan to a stranger)
    const d = Math.max(nat, need);
    plan.push({ sid, shot, vos, vds, nat, d, factor: d / nat });
  }

  if (process.argv.includes('--stanza-preview')) {
    const PV = path.join(W, 'stanza-preview'); fs.mkdirSync(PV, { recursive: true });
    for (const p of plan) {
      const txt = path.join(PV, `${p.sid}.txt`), lines = spread(stanzaOf(p.shot)); fs.writeFileSync(txt, lines);
      await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', (p.nat / 2).toFixed(2), '-i', clipOf(p.sid, p.shot), '-frames:v', '1', '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720' + textDraw(txt, 99, true), path.join(PV, `${p.sid}.png`)]);
      console.log(`${p.sid} ${lines.replace(/\n/g, ' ⏎ ')}`);
    }
    console.log('PREVIEW', PV); return;
  }
  fs.writeFileSync(LOG, '');
  process.stderr.write(`material: ${plan.length} generated video shots, 0 stills\n`);

  // 2. normalize every segment + burn its stanza (clip audio replaced by silence: voice + music are the soundtrack)
  const reuse = process.argv.includes('--reuse');
  const reseg = ((process.argv.find(a => a.startsWith('--reseg=')) || '').slice(8)).split(',').filter(Boolean).map(Number);
  const segFiles = [];
  await pool(2, plan.map((p, i) => async () => {
    const out = path.join(W, `seg_${String(i).padStart(2, '0')}.mp4`);
    if (reuse && !reseg.includes(i) && fs.existsSync(out) && fs.statSync(out).size > 10000) { segFiles[i] = out; return; }
    const txt = path.join(W, `p_${i}.txt`); fs.writeFileSync(txt, spread(stanzaOf(p.shot)));
    const interp = p.factor >= MI_FROM ? 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' : 'fps=30';
    const vf = `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=${p.factor.toFixed(5)}*PTS,${interp},format=yuv420p${textDraw(txt, p.d)}`;
    await execFileP('ffmpeg', ['-y', '-i', clipOf(p.sid, p.shot), ...silence, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', p.d.toFixed(2), ...enc, out], { maxBuffer: 1 << 26, timeout: 900000 });
    segFiles[i] = out;
    process.stderr.write(`seg ${i + 1}/${plan.length} ${p.sid} ${p.shot.engine} ${p.d.toFixed(2)}s${p.factor > 1.001 ? ` slow×${p.factor.toFixed(2)}${p.factor >= MI_FROM ? ' (interp)' : ''}` : ''}\n`);
  }));

  const cover = plan.find(p => p.sid === COVER_SHOT);
  const seq = [await makeCard(FILM_TITLE, MOMENTS, path.join(W, 'card_intro.mp4'), 4.4, 40, clipOf(cover.sid, cover.shot), true), ...segFiles,
               await makeCard('ATUONA', OUTRO_SUB, path.join(W, 'card_outro.mp4'), 4.2, 56)];

  // 3. dissolve chain (offset = running merged length − XFADE_D)
  const durs = []; for (const c of seq) durs.push(await dur(c));
  const segStart = k => { let s = 0; for (let i = 0; i < k; i++) s += durs[i]; return Math.max(0, s - k * XFADE_D); };
  const inputs = seq.flatMap(c => ['-i', c]); let fc = ''; let vlab = '0:v', alab = '0:a', merged = durs[0];
  for (let k = 1; k < seq.length; k++) { const ofs = Math.max(0, merged - XFADE_D).toFixed(3); fc += `[${vlab}][${k}:v]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[vc${k}];[${alab}][${k}:a]acrossfade=d=${XFADE_D}[ac${k}];`; vlab = `vc${k}`; alab = `ac${k}`; merged += durs[k] - XFADE_D; }
  const body = path.join(W, 'body.mp4');
  process.stderr.write(`dissolve chain: ${seq.length} segments, ${merged.toFixed(1)}s\n`);
  await execFileP('ffmpeg', ['-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${vlab}]`, '-map', `[${alab}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', body], { maxBuffer: 1 << 27, timeout: 3600000 });

  // 4. mix: music ducked under the voice bus, loudness-normalized, limited
  const LEN = await dur(body);
  const voAt = [];
  plan.forEach((p, i) => { let t = segStart(i + 1) + LEAD; p.vos.forEach((f, k) => { voAt.push({ file: f, t: +t.toFixed(2) }); t += p.vds[k] + VO_GAP; }); });
  let mf = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN - 3).toFixed(2)}:d=3[music];`;
  const vl = []; voAt.forEach((v, k) => { mf += `[${k + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t * 1000)}:all=1[v${k}];`; vl.push(`[v${k}]`); });
  mf += `${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];`;
  mf += `[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];[premix]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false[a]`;
  const mixIn = ['-i', body, '-stream_loop', '-1', '-i', MUSIC]; voAt.forEach(v => mixIn.push('-i', v.file));
  await execFileP('ffmpeg', ['-y', '-v', 'error', ...mixIn, '-filter_complex', mf, '-map', '0:v', '-map', '[a]', '-t', LEN.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', '-movflags', '+faststart', final], { maxBuffer: 1 << 27, timeout: 900000 });
  fs.writeFileSync(path.join(W, 'timeline.json'), JSON.stringify(plan.map((p, i) => ({ i: i + 1, shot: p.sid, engine: p.shot.engine, poem: p.shot.poem, start: +segStart(i + 1).toFixed(2), dur: +p.d.toFixed(2), vo_at: +(segStart(i + 1) + LEAD).toFixed(2) })), null, 1));
  console.log(`DONE ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)}MB, ${LEN.toFixed(1)}s, ${plan.length} shots, ${voAt.length} voice lines) — verify, then: node film8.mjs --publish`);
}
main().catch(e => { console.error('FAIL:', e.stderr ? String(e.stderr).slice(-800) : e.message); process.exit(1); });
