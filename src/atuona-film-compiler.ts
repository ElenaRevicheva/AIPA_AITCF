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
    const { data } = await octokit.repos.getContent({
      owner: ATUONA_OWNER, repo: ATUONA_REPO, path: `metadata/${pageId}.json`, ref: 'main',
    });
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
    const resp = await openai.audio.speech.create({
      model: 'tts-1', voice: voice as any, input: text.substring(0, 1800),
    });
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

// ── Build ────────────────────────────────────────────────────────────────────
export interface BuildFilmResult { ok: boolean; path?: string; sizeMB?: number; shots?: number; error?: string; }

/**
 * Assemble a film from persisted base-cut shots. `pageIds` in order; if omitted, all persisted shots
 * (sorted). For each: bake the poem VO onto the (last-frame-held) shot, hard-cut concat, then a ducked
 * music bed across the whole thing. Staged ffmpeg via temp files = reliable + debuggable.
 */
export async function buildFilm(opts: {
  pageIds?: string[];
  onProgress?: (msg: string) => Promise<void> | void;
}): Promise<BuildFilmResult> {
  const W = workDir();
  const note = async (m: string) => { console.log('🎬 [film]', m); try { await opts.onProgress?.(m); } catch { /* ignore */ } };

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
  for (let i = 0; i < shots.length; i++) {
    const { id, file } = shots[i]!;
    const clip = path.join(W, `clip_${String(i).padStart(3, '0')}.mp4`);
    const shotDur = (await ffprobeDuration(file)) || 6;

    const { text } = await fetchPoem(id);
    const voFile = await ttsForPoem(id, text);
    const voDur = voFile ? await ffprobeDuration(voFile) : 0;
    // Clip length: long enough to hear the poem, min the shot length, capped so one poem can't dominate.
    const clipDur = Math.min(Math.max(shotDur, voDur + 0.6), Math.max(shotDur, 22));
    const holdPad = Math.max(0, clipDur - shotDur);

    try {
      const vNorm = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30,tpad=stop_mode=clone:stop_duration=${holdPad.toFixed(2)},format=yuv420p`;
      if (voFile) {
        await execFileP('ffmpeg', [
          '-y', '-i', file, '-i', voFile,
          '-filter_complex', `[0:v]${vNorm}[v];[1:a]aresample=44100,apad[a]`,
          '-map', '[v]', '-map', '[a]', '-t', clipDur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip,
        ], { maxBuffer: 1 << 26 });
      } else {
        // no VO: keep shot, add silent track for uniform concat
        await execFileP('ffmpeg', [
          '-y', '-i', file, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', `[0:v]${vNorm}[v]`,
          '-map', '[v]', '-map', '1:a', '-t', clipDur.toFixed(2),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip,
        ], { maxBuffer: 1 << 26 });
      }
      clips.push(clip);
      await note(`shot ${i + 1}/${shots.length} ✓ (#${id})`);
    } catch (e: any) {
      console.warn(`🎬 clip ${id} failed:`, e?.stderr?.toString?.()?.slice(-300) || e?.message);
      // skip the broken shot rather than fail the whole film
    }
  }
  if (!clips.length) return { ok: false, error: 'All shots failed to normalize (ffmpeg).' };

  // 3) Hard-cut concat (uniform codecs → stream copy)
  const listFile = path.join(W, 'concat.txt');
  fs.writeFileSync(listFile, clips.map(c => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
  const body = path.join(W, 'body.mp4');
  await execFileP('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', body], { maxBuffer: 1 << 26 });

  // 4) Ducked music bed (loop to length, low volume, mix under the baked VO)
  const filmLen = await ffprobeDuration(body);
  const music = await pickMusic(filmLen);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const final = path.join(outDir(), `finding-paradise-${stamp}.mp4`);
  try {
    if (music) {
      await note('mixing music bed...');
      const vol = (process.env.ATUONA_MUSIC_VOLUME || '0.16').trim();
      await execFileP('ffmpeg', [
        '-y', '-i', body, '-stream_loop', '-1', '-i', music,
        '-filter_complex', `[1:a]volume=${vol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=3[a]`,
        '-map', '0:v', '-map', '[a]', '-t', filmLen.toFixed(2),
        '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', final,
      ], { maxBuffer: 1 << 26 });
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
