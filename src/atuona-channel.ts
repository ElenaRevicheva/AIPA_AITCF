/**
 * atuona-channel.ts — the Atuona Telegram channel, kept and fed by the bots (Elena, 26 Nov 2026)
 *
 * Why: on 25 Nov a long poem typed into an edit box of the channel "Atuona: NFT Gallery of
 * Moments" was lost — ✓ was never pressed, the paper copy was gone, nothing kept a copy.
 * The same day she made the Atuona bot an admin of the channel, and the bot's auth filter
 * answered her post IN THE CHANNEL with "Sorry, you are not authorized" in front of subscribers.
 *
 * Three jobs, one module:
 *  1. KEEPER (Atuona bot, before its auth filter): every channel post and every SAVED edit is
 *     appended to an archive (JSONL, never rewritten) + a readable Markdown log. The bot never
 *     replies inside a channel.
 *  2. DRAFT (Atuona bot, in its menu — Elena's call: the poems live with Atuona, not CTO AIPA):
 *     /channel <text>, or /channel then a voice note or text, or a voice
 *     note that starts "в канал …" / "channel …". The text is archived as a draft AT ONCE (so a
 *     draft is never lost), and Elena sees it with ✅ Publish / ❌ Cancel.
 *  3. PUBLISH: ✅ posts it to the channel through the Atuona bot (the admin). The keeper then
 *     archives the published post like any other.
 *
 * Limit, said plainly: text typed into Telegram and never confirmed with ✓ never leaves the
 * phone; no bot can keep it. Drafts made here are kept from the first second.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { Api, Bot, Context, NextFunction } from 'grammy';

const DIR = process.env.ATUONA_CHANNEL_ARCHIVE_DIR || path.join(os.homedir(), 'atuona-channel-archive');
const JSONL = path.join(DIR, 'archive.jsonl');
const MD = path.join(DIR, 'archive.md');
const STATE = path.join(DIR, 'state.json');
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const ARM_TTL_MS = 15 * 60 * 1000;
const TG_LIMIT = 4096;

type Kind = 'post' | 'edit' | 'draft' | 'published' | 'cancelled';
interface Entry {
  at: string; kind: Kind; chat_id?: number | undefined; chat_title?: string | undefined; message_id?: number | undefined;
  date?: number | undefined; edit_date?: number | undefined; author?: string | undefined; source?: string | undefined; text: string;
}

let atuonaApi: Api | null = null;
export function setAtuonaChannelApi(api: Api): void { atuonaApi = api; }

function ensureDir(): void { fs.mkdirSync(DIR, { recursive: true }); }

/** Append-only. A failure here is logged loudly but never blocks a bot reply. */
export function archive(e: Omit<Entry, 'at'>): void {
  try {
    ensureDir();
    const entry: Entry = { at: new Date().toISOString(), ...e };
    fs.appendFileSync(JSONL, JSON.stringify(entry) + '\n', 'utf8');
    const head = `## ${entry.at} · ${entry.kind}${entry.message_id ? ` · #${entry.message_id}` : ''}${entry.source ? ` · ${entry.source}` : ''}`;
    fs.appendFileSync(MD, `${head}\n\n${entry.text}\n\n`, 'utf8');
  } catch (err: any) {
    console.error(`[atuona-channel] ❌ archive write FAILED (${err?.message}) — text follows so it survives in the log:\n${e.text}`);
  }
}

interface State { channelId?: number | undefined; title?: string | undefined }
function readState(): State { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function writeState(s: State): void { try { ensureDir(); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch {} }

export function channelId(): number | null {
  const env = Number(process.env.ATUONA_CHANNEL_ID || '');
  if (env) return env;
  return readState().channelId ?? null;
}

// ── 1. KEEPER — register on the Atuona bot BEFORE its auth middleware ─────────────────────────
export function channelKeeper() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const post = ctx.channelPost || ctx.editedChannelPost;
    if (!post && ctx.chat?.type !== 'channel') return next();
    if (!post) return; // other channel updates: never answered, never forwarded to the filter
    const isEdit = !!ctx.editedChannelPost;
    const text = (post as any).text ?? (post as any).caption ?? '';
    const chat = post.chat as { id: number; title?: string };
    const st = readState();
    // The channel learns itself: the first post seen (or ATUONA_CHANNEL_ID) is the Atuona channel.
    if (!process.env.ATUONA_CHANNEL_ID && !st.channelId) {
      writeState({ channelId: chat.id, title: chat.title });
      console.log(`[atuona-channel] learned channel ${chat.id} "${chat.title}"`);
    }
    archive({
      kind: isEdit ? 'edit' : 'post', chat_id: chat.id, chat_title: chat.title, message_id: post.message_id,
      date: post.date, edit_date: (post as any).edit_date, author: (post as any).author_signature,
      text: text || `[${Object.keys(post).find((k) => ['photo', 'video', 'voice', 'audio', 'document', 'animation'].includes(k)) || 'no text'}]`,
    });
    console.log(`[atuona-channel] kept ${isEdit ? 'edit' : 'post'} #${post.message_id} (${text.length} chars)`);
  };
}

// ── 2 + 3. DRAFT → PUBLISH on the CTO AIPA bot ────────────────────────────────────────────────
const drafts = new Map<string, { text: string; userId: number; at: number }>();
const armed = new Map<number, number>(); // userId → armed-until

const VOICE_LEAD = /^\s*(?:в\s+канал|в\s+атуону|канал|атуона\s+канал|to\s+(?:the\s+)?channel|post\s+to\s+(?:the\s+)?channel|channel)\s*[:,.\-—–!]*\s*/i;

/** A voice note that starts "в канал …" / "channel …" — returns the text after the lead, or null. */
export function channelLead(transcription: string): string | null {
  const m = VOICE_LEAD.exec(transcription);
  if (!m) return null;
  const rest = transcription.slice(m[0].length).trim();
  return rest || null;
}

export function isArmed(userId: number): boolean {
  const until = armed.get(userId);
  if (!until) return false;
  if (Date.now() > until) { armed.delete(userId); return false; }
  return true;
}

export async function offerDraft(ctx: Context, text: string, source: 'voice' | 'text'): Promise<void> {
  const userId = ctx.from?.id || 0;
  armed.delete(userId);
  const clean = text.trim();
  archive({ kind: 'draft', source, text: clean });
  if (clean.length > TG_LIMIT) {
    await ctx.reply(`📥 Saved as a draft (${clean.length} chars), but Telegram allows ${TG_LIMIT} per post. Send it in two parts with /channel.`);
    return;
  }
  for (const [k, d] of drafts) if (Date.now() - d.at > DRAFT_TTL_MS) drafts.delete(k);
  const token = randomBytes(5).toString('hex');
  drafts.set(token, { text: clean, userId, at: Date.now() });
  const where = channelId() ? '' : '\n\n⚠️ The channel is not known yet — post or edit anything in it once, then press ✅.';
  await ctx.reply(`📥 Draft saved. This goes to the Atuona channel exactly as written:\n\n${clean}${where}`, {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Publish', callback_data: `achan:ok:${token}` },
      { text: '❌ Cancel', callback_data: `achan:no:${token}` },
    ]] },
  });
}

export function registerAtuonaChannel(bot: Bot): void {
  bot.command('channel', async (ctx) => {
    const text = (ctx.match as string | undefined)?.trim();
    if (text) { await offerDraft(ctx, text, 'text'); return; }
    armed.set(ctx.from?.id || 0, Date.now() + ARM_TTL_MS);
    await ctx.reply('🎙️ Send the post now — a voice note or text. I save it as a draft first, then show it to you before anything is published.');
  });

  // Armed by /channel: the next plain text is the post. Registered before the general text handler.
  bot.on('message:text', async (ctx, next) => {
    const t = ctx.message?.text || '';
    if (t.startsWith('/') || !isArmed(ctx.from?.id || 0)) return next();
    await offerDraft(ctx, t, 'text');
  });

  bot.callbackQuery(/^achan:(ok|no):/, async (ctx) => {
    const [, verdict, tok] = (ctx.callbackQuery?.data || '').split(':');
    const token = tok || '';
    const d = drafts.get(token);
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (!d || d.userId !== (ctx.from?.id || 0)) {
      await ctx.answerCallbackQuery({ text: 'That draft expired — it is still in the archive. Send it again with /channel.' });
      return;
    }
    drafts.delete(token);
    if (verdict !== 'ok') {
      archive({ kind: 'cancelled', source: 'cto-aipa', text: d.text });
      await ctx.answerCallbackQuery({ text: 'Not published' });
      await ctx.reply('👍 Not published. The draft stays in the archive.');
      return;
    }
    const id = channelId();
    if (!atuonaApi || !id) {
      drafts.set(token, d);
      await ctx.answerCallbackQuery({ text: 'Channel not ready' });
      await ctx.reply(!atuonaApi ? '⚠️ The Atuona bot is not running, so nothing was published. The draft is saved.' : '⚠️ I do not know the channel yet: post or edit anything in it once, then press ✅ again.', {
        reply_markup: { inline_keyboard: [[{ text: '✅ Publish', callback_data: `achan:ok:${token}` }, { text: '❌ Cancel', callback_data: `achan:no:${token}` }]] },
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Publishing…' });
    try {
      const m = await atuonaApi.sendMessage(id, d.text);
      archive({ kind: 'published', chat_id: id, message_id: m.message_id, source: 'cto-aipa', text: d.text });
      console.log(`[atuona-channel] published #${m.message_id} to ${id} (${d.text.length} chars)`);
      await ctx.reply(`✅ Published in the Atuona channel (post #${m.message_id}) and archived.`);
    } catch (err: any) {
      console.error(`[atuona-channel] publish failed: ${err?.description || err?.message}`);
      await ctx.reply(`❌ Telegram refused the post: ${err?.description || err?.message}. The draft is saved in the archive.`);
    }
  });
}
