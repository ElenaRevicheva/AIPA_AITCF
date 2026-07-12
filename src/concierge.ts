/**
 * Lead Concierge — one-tap send bridge (July 12 2026).
 *
 * Flow: Make.com scenario (HubSpot new contact → Claude Fable 5 draft) POSTs the
 * draft to /concierge/draft → we message Elena's Telegram with the draft and a
 * [✅ Send now] button → tap sends the reply to the lead via Resend (same
 * verified aipa@aideazz.xyz sender as marketing-notify) and logs the outcome.
 *
 * Drafts persist as JSON files under data/concierge/ (data/ is gitignored) so a
 * pm2 restart between draft arrival and Elena's tap loses nothing.
 *
 * Env: CONCIERGE_SECRET (Bearer auth for Make), CONCIERGE_TG_CHAT (Elena's chat id),
 *      CONCIERGE_REPLY_TO (reply-to on outgoing mail), CONCIERGE_FROM (optional).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as express from 'express';
import type { Express, Request, Response } from 'express';
import type { Bot } from 'grammy';
import { getResendApiKey } from './marketing-notify';

const DRAFT_DIR = path.join(process.cwd(), 'data', 'concierge');

interface ConciergeDraft {
  id: string;
  name: string;
  email: string;
  inquiry: string;
  subject: string;
  draft: string;
  status: 'pending' | 'sent' | 'skipped';
  createdAt: string;
  sentAt?: string;
}

function draftPath(id: string): string {
  return path.join(DRAFT_DIR, `${id}.json`);
}

function saveDraft(d: ConciergeDraft): void {
  fs.mkdirSync(DRAFT_DIR, { recursive: true });
  fs.writeFileSync(draftPath(d.id), JSON.stringify(d, null, 2), 'utf8');
}

function loadDraft(id: string): ConciergeDraft | null {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(draftPath(id), 'utf8')) as ConciergeDraft;
  } catch {
    return null;
  }
}

/**
 * Fable 5's contract (see docs/make-fable5/LEAD_CONCIERGE_SETUP.md):
 *   DRAFT REPLY:\n<reply>\n\nSUBJECT: <subject>\n\nWHY THESE LINKS: <line>
 * Spam verdict is the bare token `SPAM — no reply needed`.
 */
function parseClaudeOutput(raw: string): { draft: string; subject: string; spam: boolean } {
  const text = (raw || '').trim();
  if (/^SPAM\b/.test(text)) return { draft: '', subject: '', spam: true };
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const subject = subjectMatch?.[1]?.trim() || 'Re: your inquiry — AIdeazz';
  let draft = text;
  const replyMatch = text.match(/DRAFT REPLY:\s*\n?([\s\S]*?)(?:\n\s*SUBJECT:|$)/);
  if (replyMatch?.[1]?.trim()) draft = replyMatch[1].trim();
  return { draft, subject, spam: false };
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendReplyEmail(d: ConciergeDraft): Promise<void> {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const from = process.env.CONCIERGE_FROM?.trim() || 'Elena Revicheva <aipa@aideazz.xyz>';
  const replyTo = process.env.CONCIERGE_REPLY_TO?.trim() || 'elena.revicheva2016@gmail.com';
  const html = `<div style="white-space:pre-wrap;font-family:inherit;">${escHtml(d.draft)}</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [d.email], subject: d.subject, html, reply_to: replyTo }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Raw Bot API send so the HTTP route works without holding the grammY instance. */
async function sendTelegram(
  text: string,
  keyboard?: { text: string; callback_data: string }[][]
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CONCIERGE_TG_CHAT?.trim();
  if (!token || !chatId) {
    console.warn('[concierge] TELEGRAM_BOT_TOKEN or CONCIERGE_TG_CHAT not set — no TG notify');
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4090),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
  });
  if (!r.ok) console.error('[concierge] TG send failed:', (await r.text()).slice(0, 200));
}

export function registerConciergeRoutes(app: Express): void {
  // Make's HTTP module can't JSON-escape multi-line drafts; form-urlencoded
  // fields are encoded natively by Make, so accept both content types here.
  app.post('/concierge/draft', express.urlencoded({ extended: true, limit: '1mb' }), async (req: Request, res: Response) => {
    const secret = process.env.CONCIERGE_SECRET?.trim();
    if (!secret) {
      res.status(503).json({ error: 'Concierge not configured — set CONCIERGE_SECRET' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const b = (req.body || {}) as Record<string, unknown>;
    let email = typeof b.email === 'string' ? b.email.trim() : '';
    let name = typeof b.name === 'string' ? b.name.trim() : '';
    let inquiry = typeof b.inquiry === 'string' ? b.inquiry.trim() : '';
    const claudeOutput =
      typeof b.claude_output === 'string' ? b.claude_output : typeof b.draft === 'string' ? b.draft : '';
    // Make's per-property chips can arrive blank (the raw-record chip is the
    // reliable one — see LEAD_CONCIERGE_SETUP.md second fix). Fall back to
    // extracting from the raw HubSpot record JSON when direct fields are empty.
    const raw = typeof b.raw === 'string' ? b.raw : '';
    const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    if (!emailOk(email) && raw) {
      const m = raw.match(/"email"\s*:\s*"([^"]+@[^"]+)"/i);
      if (m?.[1] && emailOk(m[1])) email = m[1];
      if (!name) {
        const fn = raw.match(/"firstname"\s*:\s*"([^"]*)"/i)?.[1] || '';
        const ln = raw.match(/"lastname"\s*:\s*"([^"]*)"/i)?.[1] || '';
        name = `${fn} ${ln}`.trim();
      }
      if (!inquiry) {
        const msg = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1] || '';
        inquiry = msg.replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 1000);
      }
    }
    if (!emailOk(email)) {
      res.status(400).json({ error: 'Valid lead email required (direct field or raw record)' });
      return;
    }
    if (!claudeOutput.trim()) {
      res.status(400).json({ error: 'claude_output (Fable 5 text) required' });
      return;
    }

    const { draft, subject, spam } = parseClaudeOutput(claudeOutput);
    if (spam) {
      await sendTelegram(`🚫 Concierge: Fable 5 flagged the inquiry from ${name || email} as SPAM — no reply drafted.`);
      res.json({ ok: true, spam: true });
      return;
    }

    const d: ConciergeDraft = {
      id: crypto.randomBytes(8).toString('hex'),
      name: name || email,
      email,
      inquiry,
      subject,
      draft,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    saveDraft(d);
    await sendTelegram(
      `📨 New lead: ${d.name} <${d.email}>\n` +
        (inquiry ? `\n💬 They wrote:\n${inquiry.slice(0, 500)}\n` : '') +
        `\n✍️ Fable 5 draft:\n──────────\n${draft}\n──────────\n📧 Subject: ${subject}`,
      [
        [
          { text: '✅ Send now', callback_data: `cz:send:${d.id}` },
          { text: '🗑 Skip', callback_data: `cz:skip:${d.id}` },
        ],
      ]
    );
    console.log(`[concierge] draft ${d.id} stored for ${d.email}, TG notify sent`);
    res.json({ ok: true, id: d.id });
  });
}

/** Must be called BEFORE bot.start() (grammY registers middleware at start). */
export function registerConciergeCallbacks(bot: Bot): void {
  bot.callbackQuery(/^cz:(send|skip):([a-f0-9]{16})$/, async (ctx) => {
    const allowedChat = process.env.CONCIERGE_TG_CHAT?.trim();
    if (allowedChat && String(ctx.chat?.id) !== allowedChat) {
      await ctx.answerCallbackQuery({ text: 'Not authorized' });
      return;
    }
    const action = ctx.match![1] as 'send' | 'skip';
    const id = ctx.match![2]!;
    const d = loadDraft(id);
    if (!d) {
      await ctx.answerCallbackQuery({ text: 'Draft not found (expired?)' });
      return;
    }
    if (d.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: `Already ${d.status}` });
      return;
    }

    if (action === 'skip') {
      d.status = 'skipped';
      saveDraft(d);
      await ctx.answerCallbackQuery({ text: 'Skipped' });
      await ctx.editMessageText(`🗑 Skipped — no reply sent to ${d.name} <${d.email}>.`);
      return;
    }

    try {
      await sendReplyEmail(d);
      d.status = 'sent';
      d.sentAt = new Date().toISOString();
      saveDraft(d);
      await ctx.answerCallbackQuery({ text: 'Sent ✅' });
      await ctx.editMessageText(
        `✅ SENT to ${d.name} <${d.email}> at ${d.sentAt}\n📧 Subject: ${d.subject}\n\n${d.draft.slice(0, 3500)}`
      );
      console.log(`[concierge] draft ${d.id} SENT to ${d.email}`);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      console.error(`[concierge] send failed for ${d.id}:`, msg);
      await ctx.answerCallbackQuery({ text: 'Send failed — see message' });
      await ctx.reply(`❌ Concierge send to ${d.email} failed: ${msg.slice(0, 300)}\nDraft ${d.id} is still pending — tap Send again to retry.`);
    }
  });
}
