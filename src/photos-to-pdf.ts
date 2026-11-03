/**
 * Photos to PDF (3 Nov 2026). Elena: a stack of paper photographed page by page — 30, 40, sometimes more photos — must
 * come back as ONE PDF, in the order she sent them, without a paid PDF app.
 *
 * She says "pdf" (or /pdf, "make a pdf", "haz un pdf", "сделай pdf"…), sends the photos (albums of ≤10 arrive as
 * separate messages; photos sent as files work too), then says "done" / "listo" / "готово" or /pdf again. Two minutes
 * with no new photo also finishes it, and the bot says so when the collection starts. The pages are drawn by
 * scripts/photos-to-pdf.cjs (pdf-lib, A4, one photo per page) — the same library the document desk already uses.
 *
 * Fail closed: a photo that cannot be downloaded or read stops the run and its number is named; no PDF goes out with a
 * page missing. Over Telegram's 50 MB upload limit the PDF comes in parts, and she is told.
 *
 * Privacy: the photos may be personal papers. They live only in one temp folder per run, which is deleted after the
 * send AND after any failure; nothing goes to HubSpot or any model; logs carry counts only, never names or contents.
 */
import { Bot, Context, InputFile } from 'grammy';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'photos-to-pdf.cjs');
const IDLE_FINISH_MS = 2 * 60_000;   // no new photo for this long → build what arrived
const START_EXPIRE_MS = 15 * 60_000; // started but no photo at all → drop quietly after telling her
const ACK_QUIET_MS = 4_000;          // one "N so far" reply per burst, not one per photo
const MAX_PHOTOS = 300;
const TG_FILE_LIMIT = 20 * 1024 * 1024; // what a bot may download
const SEND_LIMIT = 49_000_000;          // what a bot may upload (50 MB), with room

/** The whole message is the request — "make a pdf of the letter for Pitz" stays with the document desk. */
const START_RE = /^\s*(?:\/pdf(?:@\w+)?|pdf|photos?\s+to\s+pdf|(?:make|create|do)\s+(?:me\s+)?(?:a\s+|one\s+)?pdf(?:\s+from\s+(?:these\s+|the\s+|my\s+)?photos)?|(?:haz|hazme|crea|créame|creame)\s+(?:un\s+)?pdf(?:\s+(?:con|de)\s+(?:estas\s+|las\s+|mis\s+)?fotos)?|fotos?\s+a\s+pdf|(?:в|во)\s+pdf|сделай\s+(?:мне\s+)?pdf|фото\s+в\s+pdf)\s*[.!]?\s*$/iu;
const DONE_RE = /^\s*(?:\/done(?:@\w+)?|\/pdf(?:@\w+)?|done|ready|finish(?:ed)?|that'?s\s+all|listo|lista|ya|termin[eé]|terminado|fin|готово|всё|все|хватит)\s*[.!]?\s*$/iu;
const CANCEL_RE = /^\s*(?:\/cancel(?:@\w+)?|cancel|stop|cancelar|cancela|para|отмена|отмени|стоп)\s*[.!]?\s*$/iu;

interface Photo { messageId: number; fileId: string; ext: 'jpg' | 'png' }
interface Session { photos: Photo[]; started: number; idle?: NodeJS.Timeout; ack?: NodeJS.Timeout; expire?: NodeJS.Timeout }
const sessions = new Map<number, Session>();

function clearTimers(s: Session): void {
  if (s.idle) clearTimeout(s.idle);
  if (s.ack) clearTimeout(s.ack);
  if (s.expire) clearTimeout(s.expire);
}

/** Telegram's file URL carries the bot token: never logged, and a non-200 is an error, not a saved error page. */
function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    }).on('error', reject);
  });
}

interface Built { ok: boolean; pages?: number; bytes?: number; files?: { file: string; pages: number; bytes: number }[]; error?: string; photo?: number }
function runScript(dir: string, out: string): Promise<Built> {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, dir, out, `--max-bytes=${SEND_LIMIT}`], {
      env: { ...process.env, NODE_PATH: process.env.CV_BUILD_NODE_PATH || path.join(os.homedir(), 'cv-build-deps', 'node_modules') },
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      try { resolve(JSON.parse(String(stdout || '').trim().split('\n').pop() || '')); }
      catch { resolve({ ok: false, error: (err?.message || 'no result line').slice(0, 200) }); }
    });
  });
}

function addPhoto(ctx: Context, s: Session, photo: Photo): void {
  if (s.photos.length >= MAX_PHOTOS) return;
  s.photos.push(photo);
  if (s.expire) { clearTimeout(s.expire); delete s.expire; }
  const chatId = ctx.chat!.id;
  if (s.ack) clearTimeout(s.ack);
  s.ack = setTimeout(() => {
    const n = s.photos.length;
    const full = n >= MAX_PHOTOS ? ` That is the most one PDF takes (${MAX_PHOTOS}); say done. / Es el máximo (${MAX_PHOTOS}); di listo.` : '';
    void ctx.api.sendMessage(chatId, `📥 ${n} photo${n === 1 ? '' : 's'} so far. Send more, or say done. / ${n} foto${n === 1 ? '' : 's'} hasta ahora. Manda más o di listo.${full}`).catch(() => {});
  }, ACK_QUIET_MS);
  if (s.idle) clearTimeout(s.idle);
  s.idle = setTimeout(() => { void finish(ctx, chatId, true); }, IDLE_FINISH_MS);
}

async function finish(ctx: Context, chatId: number, byIdle: boolean): Promise<void> {
  const s = sessions.get(chatId);
  if (!s) return;
  sessions.delete(chatId);
  clearTimers(s);
  const say = (t: string) => ctx.api.sendMessage(chatId, t).catch(() => {});
  if (!s.photos.length) {
    await say('No photos arrived, so there is no PDF. Say pdf to start again. / No llegó ninguna foto; no hay PDF. Di pdf para empezar otra vez.');
    return;
  }
  const photos = [...s.photos].sort((a, b) => a.messageId - b.messageId);
  const n = photos.length;
  await say(`${byIdle ? '⏱️ No new photo for 2 minutes — ' : ''}📄 Making one PDF from ${n} photo${n === 1 ? '' : 's'}… / Haciendo un PDF con ${n} foto${n === 1 ? '' : 's'}…`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2p-'));
  try {
    for (let i = 0; i < n; i++) {
      const p = photos[i]!;
      try {
        const file = await ctx.api.getFile(p.fileId);
        if (!file.file_path) throw new Error('no file path');
        await download(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, path.join(dir, `${String(i + 1).padStart(4, '0')}.${p.ext}`));
      } catch {
        console.warn(`[photos-to-pdf] download failed at ${i + 1}/${n}`);
        await say(`❌ Photo ${i + 1} of ${n} could not be downloaded, so I made no PDF (it would miss that page). Send them again from that one, or all again. / La foto ${i + 1} de ${n} no se pudo descargar; no hice el PDF para que no falte esa página. Vuelve a enviarlas.`);
        return;
      }
    }
    const r = await runScript(dir, path.join(dir, 'photos.pdf'));
    if (!r.ok || !r.files?.length || r.pages !== n) {
      console.warn(`[photos-to-pdf] build failed: ${n} photos${r.photo ? `, at ${r.photo}` : ''}`);
      await say(r.photo
        ? `❌ Photo ${r.photo} of ${n} could not be read as an image, so I made no PDF. Send that one again as a photo (not a file). / La foto ${r.photo} de ${n} no se pudo leer; no hice el PDF. Reenvía esa como foto (no como archivo).`
        : `❌ The PDF could not be made (${(r.error || 'unknown error').slice(0, 120)}). Nothing was sent. / No se pudo hacer el PDF. No envié nada.`);
      return;
    }
    const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Panama' });
    const parts = r.files.length;
    let from = 1;
    for (let i = 0; i < parts; i++) {
      const f = r.files[i]!;
      const to = from + f.pages - 1;
      const name = parts === 1 ? `photos-${stamp}-${n}p.pdf` : `photos-${stamp}-part${i + 1}-of-${parts}.pdf`;
      const caption = parts === 1
        ? `📄 ${n} photos → ${n} pages, in the order you sent them. / ${n} fotos → ${n} páginas, en el orden enviado.`
        : `📄 Part ${i + 1} of ${parts}: photos ${from}–${to}. Telegram takes at most 50 MB per file. / Parte ${i + 1} de ${parts}: fotos ${from}–${to}.`;
      await ctx.api.sendDocument(chatId, new InputFile(f.file, name), { caption });
      from = to + 1;
    }
    console.log(`[photos-to-pdf] sent ${n} pages in ${parts} file(s), ${r.bytes} bytes`);
  } catch (e) {
    console.warn(`[photos-to-pdf] failed: ${String((e as Error)?.message || e).replace(/bot\d+:[\w-]+/g, 'bot***').slice(0, 160)}`);
    await say('❌ Something failed while making or sending the PDF, so nothing was sent. Say pdf and send the photos again. / Algo falló; no envié nada. Di pdf y vuelve a enviar las fotos.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Registered before every other message handler: while a collection is open, her photos are pages, not questions. */
export function registerPhotosToPdf(bot: Bot): void {
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const msg = ctx.message;
    if (!chatId || !msg) return next();
    const text = (msg.text ?? msg.caption ?? '').trim();
    let s = sessions.get(chatId);

    if (s && msg.text !== undefined) {
      if (DONE_RE.test(text)) { await finish(ctx, chatId, false); return; }
      if (CANCEL_RE.test(text)) {
        sessions.delete(chatId); clearTimers(s);
        await ctx.reply(`🗑️ Cancelled — ${s.photos.length} photo(s) dropped, no PDF. / Cancelado — no hay PDF.`);
        return;
      }
      if (START_RE.test(text)) { await finish(ctx, chatId, false); return; } // "/pdf" again closes it
      return next(); // any other text is a normal message; the collection stays open
    }

    if (!s && START_RE.test(text) && (msg.text !== undefined || msg.photo || msg.document)) {
      s = { photos: [], started: Date.now() };
      sessions.set(chatId, s);
      const opened = s;
      s.expire = setTimeout(() => {
        if (sessions.get(chatId) === opened && !opened.photos.length) {
          sessions.delete(chatId); clearTimers(opened);
          void ctx.api.sendMessage(chatId, 'No photos came for 15 minutes, so I closed the PDF request. Say pdf to start again. / Cerré el pedido de PDF. Di pdf para empezar.').catch(() => {});
        }
      }, START_EXPIRE_MS);
      if (msg.text !== undefined) {
        await ctx.reply('📸 Send the photos now — as many as you have, in order (albums are fine). Then say done / listo / готово. If you stop for 2 minutes I make the PDF with what arrived. Say cancel to drop it.\n\n📸 Envía las fotos ahora, en orden. Luego di listo. Si pasan 2 minutos sin fotos, hago el PDF con lo que llegó. Di cancelar para anularlo.');
        return;
      }
      // A photo whose caption is the request starts the collection and is its first page — fall through.
    }

    if (!s) return next();
    if (msg.photo?.length) {
      addPhoto(ctx, s, { messageId: msg.message_id, fileId: msg.photo[msg.photo.length - 1]!.file_id, ext: 'jpg' });
      return;
    }
    if (msg.document) {
      const mime = (msg.document.mime_type || '').toLowerCase();
      const ext = mime === 'image/png' ? 'png' : (mime === 'image/jpeg' || mime === 'image/jpg') ? 'jpg' : null;
      if (!ext) {
        await ctx.reply('⚠️ That file was not added: the PDF takes JPG or PNG photos. Send it as a photo instead. / Ese archivo no se añadió: envíalo como foto.');
        return;
      }
      if ((msg.document.file_size || 0) > TG_FILE_LIMIT) {
        await ctx.reply('⚠️ That file was not added: it is over 20 MB, the most a bot can download. Send it as a photo instead. / No se añadió: pasa de 20 MB. Envíalo como foto.');
        return;
      }
      addPhoto(ctx, s, { messageId: msg.message_id, fileId: msg.document.file_id, ext });
      return;
    }
    return next();
  });
}
