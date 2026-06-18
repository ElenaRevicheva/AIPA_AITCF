/**
 * atuona-film-compiler.ts — assemble Atuona's per-poem shots into a finished film.
 *
 * Pipeline (the "last box" Atuona was missing): persisted base-cut shots + poem voiceover (OpenAI TTS)
 * + a music bed → one mp4, all on Oracle via ffmpeg. No Google Flow / LTX subscription.
 *
 * ISOLATED MODULE — the main bot only calls persistShot() (in each base-video success path) and
 * buildFilm() (from the /film build command). Nothing else in atuona-creative-ai.ts changes.
 *
 * Music: drop royalty-free tracks in data/atuona/films/music/ (any .mp3/.m4a/.wav). Suno original
 * score is gated on SUNO_API_KEY (Phase 3). No copyrighted audio ships in code.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { Octokit } from '@octokit/rest';

const execFileP = promisify(execFile);

/** Race a promise against a timeout so a hung API call can't freeze the whole film. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Self-contained clients (read env; never throw at import).
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const octokit = new Octokit({ auth: (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim() || undefined });

const ATUONA_OWNER = 'ElenaRevicheva';
const ATUONA_REPO = 'atuona';

// ── Directories ──────────────────────────────────────────────────────────────
function baseDir(): string {
  const root = process.env.HASHNODE_TOPIC_STATE_DIR || path.join(process.cwd(), 'data');
  return path.join(root, 'atuona', 'films');
}
function dir(sub: string): string {
  const d = path.join(baseDir(), sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function shotsDir(): string { return dir('shots'); }
export function musicDir(): string { return dir('music'); }
function workDir(): string { return dir('work'); }
function outDir(): string { return dir('out'); }

/** Absolute dir where finished films land — used by the web /films routes (watch from any device). */
export function filmsOutDir(): string { return outDir(); }
/** Finished films, newest first, for the web gallery. */
export function listFilms(): Array<{ name: string; sizeMB: number; mtimeMs: number }> {
  try {
    return fs.readdirSync(outDir())
      .filter(f => f.toLowerCase().endsWith('.mp4'))
      .map(f => { const s = fs.statSync(path.join(outDir(), f)); return { name: f, sizeMB: s.size / 1e6, mtimeMs: s.mtimeMs }; })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch { return []; }
}

// ── Shot persistence (called from each base-video success path) ───────────────
/** Download a finished base-cut video to shots/<pageId>.mp4 so films can be assembled later
 *  (CDN URLs expire ~1h; this makes shots permanent). Fire-and-forget safe: never throws. */
export async function persistShot(pageId: string, videoUrl: string): Promise<string | null> {
  try {
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null;
    const dest = path.join(shotsDir(), `${pageId}.mp4`);
    const res = await fetch(videoUrl);
    if (!res.ok) { console.warn(`🎞️ persistShot ${pageId}: HTTP ${res.status}`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`🎞️ persistShot ${pageId}: saved ${(buf.length / 1e6).toFixed(1)}MB → ${dest}`);
    return dest;
  } catch (e: any) {
    console.warn(`🎞️ persistShot ${pageId} error:`, e?.message);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}

/** Fetch the English poem text + title for VO from the atuona repo metadata. */
async function fetchPoem(pageId: string): Promise<{ title: string; text: string }> {
  try {
    const { data } = await withTimeout(octokit.repos.getContent({
      owner: ATUONA_OWNER, repo: ATUONA_REPO, path: `metadata/${pageId}.json`, ref: 'main',
    }), 15000, `fetchPoem ${pageId}`);
    if ('content' in data) {
      const meta = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
      const attrs: Array<{ trait_type?: string; value?: string }> = meta.attributes || [];
      const get = (...keys: string[]) => attrs.find(a => keys.includes(a.trait_type || ''))?.value || '';
      const title = get('Poem', 'Title') || `Page ${pageId}`;
      const text = get('English Text', 'English Translation') || '';
      return { title, text };
    }
  } catch (e: any) {
    console.warn(`🎙️ fetchPoem ${pageId}:`, e?.message);
  }
  return { title: `Page ${pageId}`, text: '' };
}

/** Generate voiceover audio for a poem via OpenAI TTS. Returns the mp3 path, or null. */
async function ttsForPoem(pageId: string, text: string): Promise<string | null> {
  if (!openai || !text.trim()) return null;
  try {
    const out = path.join(workDir(), `vo_${pageId}.mp3`);
    const voice = (process.env.ATUONA_TTS_VOICE || 'onyx').trim(); // onyx = deep, fitting for the tone
    const resp = await withTimeout(openai.audio.speech.create({
      model: 'tts-1', voice: voice as any, input: text.substring(0, 1800),
    }), 45000, `TTS ${pageId}`);
    fs.writeFileSync(out, Buffer.from(await resp.arrayBuffer()));
    return out;
  } catch (e: any) {
    console.warn(`🎙️ ttsForPoem ${pageId}:`, e?.message);
    return null;
  }
}

/** Pick a music bed: first file in music/, else Suno (gated), else null (VO-only film). */
async function pickMusic(filmLen: number): Promise<string | null> {
  try {
    const files = fs.readdirSync(musicDir()).filter(f => /\.(mp3|m4a|wav|aac|ogg)$/i.test(f));
    if (files.length) {
      const chosen = path.join(musicDir(), files[Math.floor(Math.random() * files.length)]!);
      console.log(`🎵 music bed: ${chosen}`);
      return chosen;
    }
  } catch { /* ignore */ }
  const suno = await sunoScore(filmLen);
  if (suno) return suno;
  console.log('🎵 no music available (library empty, no SUNO_API_KEY) — VO-only film');
  return null;
}

/** Suno original score (Phase 3) — only if SUNO_API_KEY is set. Best-effort; returns null on any issue. */
async function sunoScore(filmLen: number): Promise<string | null> {
  const key = (process.env.SUNO_API_KEY || '').trim();
  if (!key) return null;
  try {
    const base = (process.env.SUNO_API_BASE || 'https://api.sunoapi.org').replace(/\/$/, '');
    const submit = await fetch(`${base}/api/v1/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'underground arthouse poetry film score, melancholic ambient, cinematic, instrumental, no vocals',
        instrumental: true, model: process.env.SUNO_MODEL || 'V4', customMode: false,
      }),
    });
    if (!submit.ok) { console.warn('🎵 Suno submit', submit.status); return null; }
    const sub = await submit.json() as any;
    const taskId = sub?.data?.taskId || sub?.taskId || sub?.id;
    if (!taskId) return null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const poll = await fetch(`${base}/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      if (!poll.ok) continue;
      const pj = await poll.json() as any;
      const items = pj?.data?.response?.sunoData || pj?.data?.data || [];
      const url = Array.isArray(items) && items[0]?.audioUrl;
      if (url) {
        const out = path.join(workDir(), 'score.mp3');
        const a = await fetch(url); if (!a.ok) return null;
        fs.writeFileSync(out, Buffer.from(await a.arrayBuffer()));
        console.log('🎵 Suno score ready');
        return out;
      }
    }
  } catch (e: any) { console.warn('🎵 Suno error:', e?.message); }
  return null;
}

// ── Text rendering (Phase 2: title cards + on-screen poem text) ───────────────
const FILM_FONT = process.env.ATUONA_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const FILM_FONT_BOLD = process.env.ATUONA_FONT_BOLD || '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';
const off = (v: string | undefined): boolean => /^(0|false|off|no)$/i.test((v || '').trim());

/** Strip markdown so titles/poems render clean on screen (no literal ** * _ ` # in the video). */
function stripMd(s: string): string {
  return (s || '').replace(/\r/g, '').replace(/[*_`]+/g, '').replace(/^\s{0,3}#{1,6}\s*/gm, '');
}
/** Filesystem-safe slug from a poem/film title → meaningful film filenames (gallery shows real titles). */
function slugifyTitle(s: string): string {
  return stripMd(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'atuona-film';
}

/** Word-wrap a poem to a fixed column, preserving its own line/stanza breaks. Caps total lines. */
function wrapPoem(s: string, maxCols = 44, maxLines = 11): string {
  const out: string[] = [];
  for (const raw of stripMd(s).split('\n')) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; } // keep stanza break
    let cur = '';
    for (const w of words) {
      if (cur && (cur.length + 1 + w.length) > maxCols) { out.push(cur); cur = w; }
      else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  while (out.length && out[0] === '') out.shift();
  return out.slice(0, maxLines).join('\n');
}

// ── Build ────────────────────────────────────────────────────────────────────
export interface BuildFilmResult { ok: boolean; path?: string; sizeMB?: number; shots?: number; error?: string; }

/**
 * Assemble a film from persisted base-cut shots. `pageIds` in order; if omitted, all persisted shots
 * (sorted). For each: bake the poem VO onto the (last-frame-held) shot, hard-cut concat, then a ducked
 * music bed across the whole thing. Staged ffmpeg via temp files = reliable + debuggable.
 */
export async function buildFilm(opts: {
  pageIds?: string[];
  title?: string;
  subtitle?: string;
  onProgress?: (msg: string) => Promise<void> | void;
}): Promise<BuildFilmResult> {
  const W = workDir();
  const note = async (m: string) => { console.log('🎬 [film]', m); try { await opts.onProgress?.(m); } catch { /* ignore */ } };

  // Phase 2 features — all default ON, each independently disablable via env (no rebuild needed).
  const usePoemText = !off(process.env.ATUONA_FILM_POEMTEXT);
  const useCards = !off(process.env.ATUONA_FILM_CARDS);
  const useXfade = !off(process.env.ATUONA_FILM_CROSSFADE);
  const XFADE_D = Math.max(0.2, parseFloat(process.env.ATUONA_FILM_XFADE_SEC || '0.8') || 0.8);

  // Render a black title/credits card (faded in/out, silent audio) → normalized to the clip spec.
  const makeCard = async (cardTitle: string, cardSub: string, outFile: string, dur = 3.7, bgImage?: string): Promise<string | null> => {
    try {
      const tFile = path.join(W, `${path.basename(outFile, '.mp4')}_title.txt`);
      fs.writeFileSync(tFile, wrapPoem(cardTitle, 26, 3));
      let draw = `drawtext=fontfile=${FILM_FONT_BOLD}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=58:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2-28`;
      if (cardSub.trim()) {
        const sFile = path.join(W, `${path.basename(outFile, '.mp4')}_sub.txt`);
        fs.writeFileSync(sFile, wrapPoem(cardSub, 52, 2));
        draw += `,drawtext=fontfile=${FILM_FONT}:textfile=${sFile}:expansion=none:fontcolor=0xCCCCCC:fontsize=26:line_spacing=8:x=(w-text_w)/2:y=(h/2)+40`;
      }
      const fades = `fade=t=in:st=0:d=0.8,fade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8,format=yuv420p`;
      if (bgImage && fs.existsSync(bgImage)) {
        // Cover card: a darkened still (e.g. the first shot) behind the title — so the film
        // opens on an image, not a black void. Title/sub fade in over it, then it crossfades in.
        const vf = `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,eq=brightness=-0.34:saturation=0.82,${draw},${fades}`;
        await execFileP('ffmpeg', [
          '-y', '-loop', '1', '-i', bgImage,
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', dur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile,
        ], { maxBuffer: 1 << 26, timeout: 60000 });
      } else {
        const vf = `${draw},${fades}`;
        await execFileP('ffmpeg', [
          '-y', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=30:d=${dur.toFixed(2)}`,
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', dur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile,
        ], { maxBuffer: 1 << 26, timeout: 60000 });
      }
      return outFile;
    } catch (e: any) {
      console.warn('🎬 title card failed:', e?.stderr?.toString?.()?.slice(-200) || e?.message);
      return null;
    }
  };

  // 1) Resolve ordered shots from disk
  let ids = opts.pageIds && opts.pageIds.length ? opts.pageIds : [];
  if (!ids.length) {
    ids = fs.existsSync(shotsDir())
      ? fs.readdirSync(shotsDir()).filter(f => f.endsWith('.mp4')).map(f => f.replace(/\.mp4$/, '')).sort()
      : [];
  }
  const shots = ids
    .map(id => ({ id, file: path.join(shotsDir(), `${id}.mp4`) }))
    .filter(s => fs.existsSync(s.file));
  if (shots.length === 0) {
    return { ok: false, error: 'No persisted shots found. Run /visualize on some pages first (new shots auto-save).' };
  }
  await note(`assembling ${shots.length} shot(s)...`);

  // 2) Per-shot clip: normalize 720p/30fps, bake VO (hold last frame if VO longer), uniform codec
  const clips: string[] = [];
  let firstPoemTitle = '';
  for (let i = 0; i < shots.length; i++) {
    const { id, file } = shots[i]!;
    const clip = path.join(W, `clip_${String(i).padStart(3, '0')}.mp4`);
    const shotDur = (await ffprobeDuration(file)) || 6;

    const { title: poemTitle, text } = await fetchPoem(id);
    if (i === 0 && poemTitle) firstPoemTitle = poemTitle;
    const voFile = await ttsForPoem(id, text);
    const voDur = voFile ? await ffprobeDuration(voFile) : 0;
    // Clip length: long enough to hear the poem, min the shot length, capped so one poem can't dominate.
    const clipDur = Math.min(Math.max(shotDur, voDur + 0.6), Math.max(shotDur, 22));
    const holdPad = Math.max(0, clipDur - shotDur);

    // On-screen poem text: subtitle band anchored to the bottom (keeps the center/image clear),
    // smaller font, wider/fewer lines, compact dark plate, fades in over 0.7s.
    let drawPoem = '';
    if (usePoemText && text.trim()) {
      const wrapped = wrapPoem(text, 58, 7);
      if (wrapped) {
        const txtFile = path.join(W, `txt_${String(i).padStart(3, '0')}.txt`);
        fs.writeFileSync(txtFile, wrapped);
        drawPoem = `,drawtext=fontfile=${FILM_FONT}:textfile=${txtFile}:expansion=none:fontcolor=white:fontsize=20:line_spacing=5:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-22:alpha=if(lt(t\\,0.7)\\,t/0.7\\,1)`;
      }
    }

    try {
      const vNorm = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30,tpad=stop_mode=clone:stop_duration=${holdPad.toFixed(2)},format=yuv420p${drawPoem}`;
      if (voFile) {
        await execFileP('ffmpeg', [
          '-y', '-i', file, '-i', voFile,
          '-filter_complex', `[0:v]${vNorm}[v];[1:a]aresample=44100,apad[a]`,
          '-map', '[v]', '-map', '[a]', '-t', clipDur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip,
        ], { maxBuffer: 1 << 26, timeout: 150000 });
      } else {
        // no VO: keep shot, add silent track for uniform concat
        await execFileP('ffmpeg', [
          '-y', '-i', file, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', `[0:v]${vNorm}[v]`,
          '-map', '[v]', '-map', '1:a', '-t', clipDur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip,
        ], { maxBuffer: 1 << 26, timeout: 150000 });
      }
      clips.push(clip);
      await note(`shot ${i + 1}/${shots.length} ✓ (#${id})`);
    } catch (e: any) {
      console.warn(`🎬 clip ${id} failed:`, e?.stderr?.toString?.()?.slice(-300) || e?.message);
      // skip the broken shot rather than fail the whole film
    }
  }
  if (!clips.length) return { ok: false, error: 'All shots failed to normalize (ffmpeg).' };

  // 3) Title cards (intro + outro) → front/back of the sequence
  const seq = [...clips];
  if (useCards) {
    await note('rendering title cards...');
    const filmTitle = (opts.title || firstPoemTitle || 'ATUONA').trim();
    // Cover image for the intro — first shot's frame (darkened in makeCard), so the film
    // opens on a visual, not black. Falls back to a black card if extraction fails.
    let cover: string | undefined;
    try {
      const coverImg = path.join(W, 'cover.jpg');
      await execFileP('ffmpeg', ['-y', '-ss', '0.6', '-i', shots[0]!.file, '-frames:v', '1', '-q:v', '3', coverImg], { maxBuffer: 1 << 26, timeout: 30000 });
      if (fs.existsSync(coverImg)) cover = coverImg;
    } catch { /* black card fallback */ }
    // Subtitle = the real gallery moments (poem numbers) featured in this film.
    const moments = shots.map(s => `#${s.id}`).join(', ');
    const filmSub = (opts.subtitle || `atuona.xyz Gallery  ·  Moments ${moments}`).trim();
    const intro = await makeCard(filmTitle, filmSub, path.join(W, 'card_intro.mp4'), 3.8, cover);
    const outro = await makeCard('ATUONA', 'atuona.xyz // Paradise.js  ·  by Kira Velerevich', path.join(W, 'card_outro.mp4'), 3.6);
    if (intro) seq.unshift(intro);
    if (outro) seq.push(outro);
  }

  // 4) Assemble: crossfade chain (xfade video + acrossfade audio), or hard-cut concat fallback.
  const body = path.join(W, 'body.mp4');
  if (useXfade && seq.length >= 2) {
    await note('crossfading shots...');
    const durs: number[] = [];
    for (const c of seq) durs.push((await ffprobeDuration(c)) || 6);
    const inputs = seq.flatMap(c => ['-i', c]);
    let fc = ''; let vlab = '0:v'; let alab = '0:a'; let merged = durs[0]!;
    for (let k = 1; k < seq.length; k++) {
      const ofs = Math.max(0, merged - XFADE_D).toFixed(3);
      const vo = `vc${k}`, ao = `ac${k}`;
      fc += `[${vlab}][${k}:v]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[${vo}];`;
      fc += `[${alab}][${k}:a]acrossfade=d=${XFADE_D}[${ao}];`;
      vlab = vo; alab = ao;
      merged += durs[k]! - XFADE_D;
    }
    await execFileP('ffmpeg', [
      '-y', ...inputs, '-filter_complex', fc.replace(/;$/, ''),
      '-map', `[${vlab}]`, '-map', `[${alab}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '44100', '-ac', '2', body,
    ], { maxBuffer: 1 << 26, timeout: 300000 });
  } else {
    // Hard-cut concat (uniform codecs → stream copy)
    const listFile = path.join(W, 'concat.txt');
    fs.writeFileSync(listFile, seq.map(c => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
    await execFileP('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', body], { maxBuffer: 1 << 26, timeout: 150000 });
  }

  // 5) Ducked music bed (loop to length, low volume, mix under the baked VO)
  const filmLen = await ffprobeDuration(body);
  const music = await pickMusic(filmLen);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const final = path.join(outDir(), `${slugifyTitle(opts.title || firstPoemTitle || 'atuona-film')}-${stamp}.mp4`);
  try {
    if (music) {
      await note('mixing music bed...');
      const vol = (process.env.ATUONA_MUSIC_VOLUME || '0.16').trim();
      await execFileP('ffmpeg', [
        '-y', '-i', body, '-stream_loop', '-1', '-i', music,
        '-filter_complex', `[1:a]volume=${vol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=3[a]`,
        '-map', '0:v', '-map', '[a]', '-t', filmLen.toFixed(2),
        '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', final,
      ], { maxBuffer: 1 << 26, timeout: 150000 });
    } else {
      fs.copyFileSync(body, final);
    }
  } catch (e: any) {
    console.warn('🎬 music mix failed, delivering VO-only:', e?.message);
    fs.copyFileSync(body, final);
  }

  const sizeMB = fs.statSync(final).size / 1e6;
  console.log(`🎬 [film] DONE → ${final} (${sizeMB.toFixed(1)}MB, ${clips.length} shots, ${filmLen.toFixed(0)}s)`);
  return { ok: true, path: final, sizeMB, shots: clips.length };
}
