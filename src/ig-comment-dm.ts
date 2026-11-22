/**
 * ig-comment-dm.ts — our own "comment HOLA -> instant DM" for Instagram (22 Nov 2026).
 *
 * Elena: "start building our own ManyChat". ManyChat Free works on ONE specific Reel per automation and caps at 25
 * people a month. This does the same on EVERY Reel, no cap, through Meta's official Instagram API (Instagram Login):
 *   comment containing HOLA / OLA on any of her posts
 *     -> public reply under the comment (Graph: POST /{comment-id}/replies)
 *     -> ONE private reply DM with the tracked WhatsApp / app / Telegram links (Graph: POST /{ig-user-id}/messages,
 *        recipient.comment_id; Meta allows one private reply per comment, within 7 days)
 * Each Reel gets its own film-style code f<date><4 hex>-ig (bots' FILM_RE), so an arrival lands in HubSpot and the
 * 13:40 report like every film.
 *
 * Route: https://webhook.aideazz.xyz/cto/ig/webhook  (nginx /cto/ -> this process, port 3000)
 * Env: IG_DM_ENABLED=true, IG_APP_SECRET, IG_VERIFY_TOKEN, IG_USER_ID, IG_PAGE_ID, IG_GRAPH_VERSION (default v23.0).
 * Tokens live in .ig-token.json (mode 600, gitignored): access_token = system user "EspaLuz HOLA bot" (never expires),
 * page_access_token + page_id = the EspaLuz Facebook Page that owns @elena_revicheva. IG_ACCESS_TOKEN is the fallback.
 * Meta app: "EspaLuz Comment Replies" under the verified EspaLuz AI Family Tutor portfolio (created 22 Nov 2026).
 * Off by default. While ManyChat still runs on a Reel, list it in IG_DM_SKIP_MEDIA so a person never gets two DMs.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { handleMessaging } from './ig-dm-chat';

const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, '.ig-comment-dm.json');
const TOKEN_FILE = path.join(ROOT, '.ig-token.json');
// New Meta apps (Nov 2026) only get "Unified login": a never-expiring system-user token from the business portfolio,
// spoken to on graph.facebook.com. The private reply goes out AS THE FACEBOOK PAGE that owns the Instagram account
// (POST /{page-id}/messages with the Page token). IG_GRAPH_HOST=graph.instagram.com keeps the old Instagram-login path.
const GRAPH = () =>
  `https://${process.env.IG_GRAPH_HOST?.trim() || 'graph.facebook.com'}/${process.env.IG_GRAPH_VERSION?.trim() || 'v23.0'}`;
const WA = '50766623757';

/** HOLA / OLA / ¡Hola! as a word, any case. "holaaa" and "Hola!!" count; "Holanda" does not. */
export const KEYWORD = /(^|[^\p{L}])¡?h?ola+(?![\p{L}])/iu;

/**
 * A post only gets the bot if its caption INVITES the comment ("Comenta HOLA" / "Comment HOLA"). The same Instagram
 * account carries AIdeazz posts that open with "¡Hola, explorer!" - a HOLA there must never get an EspaLuz DM.
 */
export const CTA = new RegExp(process.env.IG_DM_CAPTION_RE?.trim() || '(coment[ae]|comment)\\s*["“«]?\\s*hola', 'i');

interface State { done: string[]; media: Record<string, string>; invites?: Record<string, boolean> }

function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { done: [], media: {} }; }
}
function saveState(s: State): void {
  s.done = s.done.slice(-5000);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

function tokenFile(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) || {}; } catch { return {}; }
}

/** The Page token speaks for the Page (needed for messages); the system-user token is the fallback. */
function accessToken(): string {
  const t = tokenFile();
  return String(t.page_access_token || t.access_token || process.env.IG_ACCESS_TOKEN?.trim() || '');
}

/** Who sends the DM: the Facebook Page linked to the Instagram account; old Instagram-login apps used the IG user. */
export function messagesSender(): string {
  return String(tokenFile().page_id || process.env.IG_PAGE_ID?.trim() || process.env.IG_USER_ID?.trim() || '');
}

/** One stable code per Reel: f<YYYYMMDD of first HOLA><4 hex of the media id>. Stored so it never changes. */
export function codeForMedia(state: State, mediaId: string, now = new Date()): string {
  if (!state.media[mediaId]) {
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    state.media[mediaId] = `f${day}${crypto.createHash('md5').update(mediaId).digest('hex').slice(0, 4)}`;
  }
  return state.media[mediaId]!;
}

export function dmText(code: string): string {
  const hello = encodeURIComponent(`Hola EspaLuz 👋 (ref ${code}-ig)`);
  return [
    '¡Hola! 👋 Soy EspaLuz, la compañera de tu familia para la nueva vida en español.',
    "I'm EspaLuz, your family's companion for a new life in Spanish. 14 días gratis · 14 days free.",
    '',
    `💬 WhatsApp: https://wa.me/${WA}?text=${hello}`,
    `📱 App: https://app.espaluz.lat/?utm_source=instagram&utm_medium=dm&utm_campaign=${code}`,
    `✈️ Telegram: https://t.me/EspaLuzFamily_bot?start=${code}_ig`,
  ].join('\n');
}

const PUBLIC_REPLIES = [
  '¡Hola! 💌 Te mandé un mensaje · Sent you a DM',
  '¡Hola! 👋 Revisa tus mensajes · Check your DMs',
  '¡Hola! 🌎 Mira tus mensajes · Look in your DMs',
];

export function validSignature(rawBody: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!rawBody || !header || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graphPost(p: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${GRAPH()}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken()}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 300) };
}

async function captionInvites(state: State, mediaId: string, caption?: string): Promise<boolean> {
  state.invites ??= {};
  if (caption !== undefined) return (state.invites[mediaId] = CTA.test(caption));
  if (mediaId in state.invites) return state.invites[mediaId]!;
  const res = await fetch(`${GRAPH()}/${mediaId}?fields=caption`, { headers: { Authorization: `Bearer ${accessToken()}` } });
  if (!res.ok) return false; // unknown post -> stay silent (fail closed), and ask again next time
  const body: any = await res.json();
  return (state.invites[mediaId] = CTA.test(String(body?.caption || '')));
}

/** Handles one comments-change value. Exported for tests (no network when dryRun; pass opts.caption). */
export async function handleComment(value: any, opts: { dryRun?: boolean; caption?: string } = {}): Promise<string> {
  const commentId = String(value?.id || '');
  const text = String(value?.text || '');
  const fromId = String(value?.from?.id || '');
  const mediaId = String(value?.media?.id || '');
  if (!commentId || !mediaId) return 'skip: no ids';
  if (fromId && fromId === process.env.IG_USER_ID?.trim()) return 'skip: own comment';
  if (value?.parent_id) return 'skip: reply in a thread';
  if (!KEYWORD.test(text)) return 'skip: no keyword';
  const list = (v?: string) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const tester = list(process.env.IG_DM_TEST_USERNAMES).includes(String(value?.from?.username || '').toLowerCase());
  if (!tester && list(process.env.IG_DM_SKIP_MEDIA).includes(mediaId)) return 'skip: media still on ManyChat';

  const state = loadState();
  if (state.done.includes(commentId)) return 'skip: already answered';
  if (!opts.dryRun || opts.caption !== undefined) {
    if (!(await captionInvites(state, mediaId, opts.caption))) { saveState(state); return 'skip: post does not invite HOLA'; }
  }
  const code = codeForMedia(state, mediaId);
  if (opts.dryRun) return `would answer ${commentId} with ${code}`;

  const dm = await graphPost(`/${messagesSender()}/messages`, { recipient: { comment_id: commentId }, message: { text: dmText(code) } });
  const pub = await graphPost(`/${commentId}/replies`, { message: PUBLIC_REPLIES[state.done.length % PUBLIC_REPLIES.length] });
  // Record even a failed DM: Meta allows ONE private reply per comment, so a retry loop could only spam errors.
  state.done.push(commentId);
  saveState(state);
  const line = `[ig-dm] HOLA on media ${mediaId} (${code}) -> DM ${dm.status}${dm.ok ? '' : ' ' + dm.text} · public ${pub.status}`;
  console.log(line);
  return line;
}

export function registerInstagramCommentDm(app: Express): void {
  // Meta's subscription check: echo hub.challenge when the verify token matches.
  app.get('/ig/webhook', (req: Request, res: Response) => {
    const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.IG_VERIFY_TOKEN?.trim();
    if (ok) res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    else res.sendStatus(403);
  });

  app.post('/ig/webhook', (req: Request, res: Response) => {
    if (!validSignature((req as any).rawBody, req.get('x-hub-signature-256') || undefined, process.env.IG_APP_SECRET?.trim() || '')) {
      res.sendStatus(401);
      return;
    }
    res.sendStatus(200); // Meta wants a fast 200; the work happens after.
    if (process.env.IG_DM_ENABLED !== 'true') return;
    for (const entry of req.body?.entry ?? []) {
      // Meta delivers DMs in two shapes: entry.messaging[] (Messenger style) or entry.changes[] with field
      // "messages" / "messaging_postbacks" and the event in value (the shape its own Test button sends, 22 Nov).
      const msgEvents: any[] = [...(entry?.messaging ?? [])];
      for (const change of entry?.changes ?? []) {
        if (change?.field === 'messages' || change?.field === 'messaging_postbacks') { msgEvents.push(change.value); continue; }
        if (change?.field !== 'comments') continue;
        handleComment(change.value).catch((e) => console.error('[ig-dm] failed:', e?.message ?? e));
      }
      // Direct messages + ice-breaker taps (22 Nov 2026): EspaLuz answers in Instagram (src/ig-dm-chat.ts).
      if (process.env.IG_CHAT_ENABLED === 'true') {
        for (const ev of msgEvents) {
          handleMessaging(ev, (to, text) =>
            graphPost(`/${messagesSender()}/messages`, { recipient: { id: to }, message: { text } }),
          ).catch((e) => console.error('[ig-chat] failed:', e?.message ?? e));
        }
      }
    }
  });
  console.log(
    `📸 Instagram comment-to-DM webhook: /ig/webhook (${process.env.IG_DM_ENABLED === 'true' ? 'ON' : 'off'})` +
      ` · DM chat ${process.env.IG_CHAT_ENABLED === 'true' ? 'ON' : 'off'}`,
  );
}
