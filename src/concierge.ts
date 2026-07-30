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
  tgMessageId?: number;
  /** Resend's message id — the only handle for tracing delivery after acceptance. */
  resendId?: string;
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
 * Did a draft for this lead already land since `sinceMs`? (July 29 2026)
 *
 * Read-only helper for the concierge watchdog. Make stays the primary drafter —
 * the watchdog only steps in when Make demonstrably produced NOTHING, and this
 * is how it proves that. Any draft counts, whoever created it (Make, the chat
 * fallback, an earlier watchdog run), so we can never double-draft a lead.
 */
export function hasDraftForEmailSince(email: string, sinceMs: number): boolean {
  const target = email.trim().toLowerCase();
  if (!target) return false;
  try {
    for (const f of fs.readdirSync(DRAFT_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, f), 'utf8')) as ConciergeDraft;
        if ((d.email || '').trim().toLowerCase() !== target) continue;
        if (Date.parse(d.createdAt || '') >= sinceMs) return true;
      } catch {
        /* a half-written draft file is not evidence either way */
      }
    }
  } catch {
    /* no drafts dir yet — nothing has ever been drafted */
  }
  return false;
}

/**
 * Make DID fire and Fable 5 judged the inquiry spam. Recorded so the watchdog
 * does not "helpfully" draft a reply to spam that Make deliberately refused.
 * Silence after a spam verdict is a decision, not a failure.
 */
const spamVerdicts = new Map<string, number>();

export function noteConciergeSpamVerdict(email: string): void {
  const key = email.trim().toLowerCase();
  if (key) spamVerdicts.set(key, Date.now());
}

export function hasSpamVerdictSince(email: string, sinceMs: number): boolean {
  const at = spamVerdicts.get(email.trim().toLowerCase());
  return at !== undefined && at >= sinceMs;
}

/**
 * Fable 5's contract (see docs/make-fable5/LEAD_CONCIERGE_SETUP.md):
 *   DRAFT REPLY:\n<reply>\n\nSUBJECT: <subject>\n\nWHY THESE LINKS: <line>
 * Spam verdict is the bare token `SPAM — no reply needed`.
 */
/**
 * Markdown emphasis has to go before a draft ever reaches a prospect.
 *
 * Fable writes **bold** out of habit; the reply is sent as an email and shown in
 * Telegram, and in neither place does that render — the reader just sees literal
 * asterisks around words (Elena, July 27 2026). Stripped here rather than in a
 * prompt, so it holds for Make's drafts and our fallback drafts alike, whatever
 * either model decides to emit.
 */
function stripMarkdownEmphasis(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/gs, '$1') // ***both***
    .replace(/\*\*(.+?)\*\*/gs, '$1') // **bold**
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1$2') // *italic*, never a bullet
    .replace(/__(.+?)__/gs, '$1'); // __bold__
}

function parseClaudeOutput(raw: string): { draft: string; subject: string; spam: boolean } {
  const text = (raw || '').trim();
  if (/^SPAM\b/.test(text)) return { draft: '', subject: '', spam: true };
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const subject = stripMarkdownEmphasis(subjectMatch?.[1]?.trim() || 'Re: your inquiry — AIdeazz');
  let draft = text;
  const replyMatch = text.match(/DRAFT REPLY:\s*\n?([\s\S]*?)(?:\n\s*SUBJECT:|$)/);
  if (replyMatch?.[1]?.trim()) draft = replyMatch[1].trim();
  return { draft: stripMarkdownEmphasis(draft), subject, spam: false };
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Hands the reply to Resend and returns Resend's message id.
 *
 * A 2xx here means Resend ACCEPTED the mail — not that it reached an inbox. The id is the
 * only thread back to what actually happened (delivered / bounced / spam), because our API
 * key is send-only and cannot query events: look the id up in the Resend dashboard.
 * Discarding it, as this used to, made every "not received" report unfalsifiable.
 */
async function sendReplyEmail(d: ConciergeDraft): Promise<string | null> {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const from = process.env.CONCIERGE_FROM?.trim() || 'Elena Revicheva <aipa@aideazz.xyz>';
  const replyTo = process.env.CONCIERGE_REPLY_TO?.trim() || 'elena.revicheva2016@gmail.com';
  const html = `<div style="white-space:pre-wrap;font-family:inherit;">${escHtml(d.draft)}</div>`;
  // Send multipart (text + html). HTML-only is a spam signal from an unestablished sender —
  // real people's mail clients produce both, bulk senders often don't. The draft is already
  // plain prose, so the text part is the draft itself; no separate copy to keep in sync.
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [d.email], subject: d.subject, html, text: d.draft, reply_to: replyTo }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json().catch(() => ({}))) as { id?: string };
  const id = body.id ?? null;
  console.log(`[concierge] Resend accepted ${d.email} — id=${id ?? 'UNKNOWN'} from=${from}`);
  return id;
}

/** Raw Bot API send so the HTTP route works without holding the grammY instance. */
async function sendTelegram(
  text: string,
  keyboard?: { text: string; callback_data: string }[][]
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CONCIERGE_TG_CHAT?.trim();
  if (!token || !chatId) {
    console.warn('[concierge] TELEGRAM_BOT_TOKEN or CONCIERGE_TG_CHAT not set — no TG notify');
    return null;
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
  if (!r.ok) {
    console.error('[concierge] TG send failed:', (await r.text()).slice(0, 200));
    return null;
  }
  const data = (await r.json()) as { result?: { message_id?: number } };
  return data.result?.message_id ?? null;
}

/**
 * CRM trail (fire-and-forget): after a successful send, log the reply as a
 * note on the lead's HubSpot contact so the CRM shows what was sent and when.
 */
function logReplyToHubSpot(d: ConciergeDraft, edited: boolean): void {
  setImmediate(async () => {
    try {
      const { findContactByEmail, addNoteToContact } = await import('./hubspot-client');
      const contactId = await findContactByEmail(d.email);
      if (!contactId) {
        console.warn(`[concierge] CRM trail: no HubSpot contact for ${d.email} — note not logged`);
        return;
      }
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      await addNoteToContact(
        contactId,
        `<strong>📧 Lead Concierge reply SENT${edited ? ' (edited in Telegram)' : ' (one-tap)'}</strong><br>` +
          `Sent: ${d.sentAt}<br>From: aipa@aideazz.xyz · Subject: ${esc(d.subject)}<br><br>${esc(d.draft)}`
      );
      console.log(`[concierge] CRM trail: note logged on contact ${contactId} (${d.email})`);

      // A note is not an email. Until now a concierge reply left no trace in the
      // deal's Emails tab or the Activities timeline, so a sent reply looked unsent
      // (July 27 2026, Elena on the UTM track). Log a real HubSpot EMAIL activity
      // and register the send so the Resend webhook can stamp ✅ ENTREGADO on
      // delivery — the same machinery the one-click FU sends already use.
      if (!d.resendId) {
        console.warn('[concierge] no Resend id — Email activity skipped (nothing to trace)');
        return;
      }
      try {
        const { findDealIdsForContact } = await import('./hubspot-client');
        const dealIds = await findDealIdsForContact(contactId).catch(() => [] as string[]);
        const dealId = dealIds[0];
        const { logEmailEngagement, recordResendSend } = await import('./resend-webhook.js');
        const engagementId = await logEmailEngagement({
          ...(dealId ? { dealId } : {}),
          contactId,
          to: d.email,
          subject: d.subject,
          body: d.draft,
          resendId: d.resendId,
        });
        recordResendSend(d.resendId, {
          ...(dealId ? { dealId } : {}),
          slug: `concierge-${d.id}`,
          to: d.email,
          subject: d.subject,
          ...(engagementId ? { engagementId } : {}),
        });
        console.log(
          `[concierge] HubSpot EMAIL activity ${engagementId ?? 'FAILED'} logged for ${d.email}` +
            (dealId ? ` (deal ${dealId})` : ' (contact only)'),
        );
      } catch (e) {
        console.warn('[concierge] Email activity logging failed (non-fatal):', (e as Error).message?.slice(0, 90));
      }
    } catch (e) {
      console.warn('[concierge] CRM trail failed (non-fatal):', (e as Error).message?.slice(0, 80));
    }
  });
}

/** Find a pending draft by the Telegram message that carries its buttons. */
function findDraftByTgMessage(messageId: number): ConciergeDraft | null {
  try {
    for (const f of fs.readdirSync(DRAFT_DIR)) {
      if (!f.endsWith('.json')) continue;
      const d = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, f), 'utf8')) as ConciergeDraft;
      if (d.tgMessageId === messageId) return d;
    }
  } catch {
    /* no drafts dir yet */
  }
  return null;
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
        inquiry = msg
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/^\[AIDEAZZ-FORM\]\s*/i, '')
          .slice(0, 1000);
      }
    }
    if (!claudeOutput.trim()) {
      res.status(400).json({ error: 'claude_output (Fable 5 text) required' });
      return;
    }

    const { draft, subject, spam } = parseClaudeOutput(claudeOutput);
    if (spam) {
      // Tell the watchdog Make already ruled on this one — it must not re-draft.
      if (email) noteConciergeSpamVerdict(email);
      // Only page Elena when the flagged sender is identifiable — a named/emailed
      // contact judged SPAM might be a misjudged real lead worth her eyes. An
      // "unknown" spam verdict is Make chewing on HubSpot auto-import junk
      // (CalendarSync et al.); notifying about it every 15-min poll is pure noise.
      if (name || email) {
        await sendTelegram(`🚫 Concierge: Fable 5 flagged the inquiry from ${name || email} as SPAM — no reply drafted.`);
      } else {
        console.log('[concierge] SPAM verdict for unidentifiable sender — dropped quietly (auto-import junk)');
      }
      res.json({ ok: true, spam: true });
      return;
    }

    // Make forwards only the draft text; resolve the recipient from HubSpot.
    // Prefer portfolio-inquiry contacts (stamped / linked to recent CLIENT-CTO-INQUIRY
    // deals) so re-tests that reused an old contact still resolve. Fall back to
    // findRecentContacts (own-app createdate window) for brand-new contacts.
    // Window = 90 min: Make's draft arrives ≤15 min after the contact
    // is created, so 90 min is ample headroom — and a narrow window makes the
    // junk-drop below decisive (junk only slips into "warn" mode during the
    // brief period right after a genuine inquiry).
    let formContactsInWindow = 0;
    if (!emailOk(email)) {
      try {
        const { findRecentInquiryContacts, findRecentContacts } = await import('./hubspot-client');
        const inquiryHits = await findRecentInquiryContacts(90);
        const recentRaw = inquiryHits.length
          ? inquiryHits
          : await findRecentContacts(90);
        const recent = recentRaw.filter((c) => emailOk(c.email));
        formContactsInWindow = recent.length;
        const head = draft.slice(0, 300).toLowerCase();
        const named = recent.filter((c) => c.firstname && head.includes(c.firstname.toLowerCase()));
        // Name match REQUIRED. The old "exactly one recent contact" fallback
        // could attach a junk auto-import draft to a real lead who happened to
        // be the only contact in the window — a wrong-recipient send. A draft
        // that names nobody stays unresolved.
        const pick = named.length === 1 ? named[0]! : null;
        if (pick) {
          email = pick.email;
          if (!name) name = `${pick.firstname} ${pick.lastname}`.trim() || pick.email;
          if (!inquiry) inquiry = (pick.message || '').slice(0, 1000);
          console.log(`[concierge] recipient resolved from HubSpot: ${email}`);
        }
      } catch (e) {
        console.warn('[concierge] HubSpot recipient lookup failed:', (e as Error).message?.slice(0, 80));
      }
    }
    if (!emailOk(email)) {
      // No form-created contact exists in the window → this draft cannot
      // belong to a real portfolio inquiry. It is Make reacting to a HubSpot
      // auto-import (CalendarSync dumped ~90 inbox contacts July 16). Drop it
      // quietly — paging Elena with junk drafts trains her to ignore the bot.
      if (formContactsInWindow === 0) {
        console.log(`[concierge] draft dropped — no form contact in window (auto-import noise): "${draft.slice(0, 80)}…"`);
        res.json({ ok: true, dropped: 'no-form-contact' });
        return;
      }
      // Real form contacts DO exist but none matched unambiguously — that may
      // be a real lead. Warn loudly.
      await sendTelegram(
        `⚠️ Concierge: a Fable 5 draft arrived but the recipient could not be determined unambiguously — reply manually.\n\n${draft.slice(0, 3200)}`
      );
      res.json({ ok: true, unresolved: true });
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
    const tgMessageId = await sendTelegram(
      `📨 New lead: ${d.name} <${d.email}>\n` +
        (inquiry ? `\n💬 They wrote:\n${inquiry.slice(0, 500)}\n` : '') +
        `\n✍️ Fable 5 draft:\n──────────\n${draft}\n──────────\n📧 Subject: ${subject}`,
      [
        [
          { text: '✅ Send now', callback_data: `cz:send:${d.id}` },
          { text: '✏️ Edit', callback_data: `cz:edit:${d.id}` },
          { text: '🗑 Skip', callback_data: `cz:skip:${d.id}` },
        ],
      ]
    );
    if (tgMessageId) d.tgMessageId = tgMessageId;
    saveDraft(d);
    console.log(`[concierge] draft ${d.id} stored for ${d.email}, TG notify sent`);

    // Mirror pending draft onto HubSpot deal Notes so Elena can review→edit→send from CRM too
    setImmediate(async () => {
      try {
        const { findContactByEmail, findDealIdsForContact, addNoteToDeal, addNoteToContact } =
          await import('./hubspot-client');
        const contactId = await findContactByEmail(d.email);
        if (!contactId) return;
        const esc = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        const pendingNote =
          `<strong>✍️ PENDING CONCIERGE DRAFT — review in Telegram or edit here, then send</strong><br>` +
          `To: ${esc(d.email)}<br>Subject: ${esc(d.subject)}<br><br>` +
          (d.inquiry ? `<strong>They wrote:</strong><br>${esc(d.inquiry.slice(0, 800))}<br><br>` : '') +
          `<strong>Draft:</strong><br><pre style="white-space:pre-wrap;font-family:inherit">${esc(d.draft)}</pre><br>` +
          `[ ] Edit · [ ] Send via Telegram ✅ button or Resend · [ ] Move deal stage`;
        const dealIds = await findDealIdsForContact(contactId);
        if (dealIds.length) {
          for (const dealId of dealIds.slice(0, 3)) await addNoteToDeal(dealId, pendingNote);
          console.log(`[concierge] pending draft mirrored to ${dealIds.length} HubSpot deal(s)`);
        } else {
          await addNoteToContact(contactId, pendingNote);
          console.log(`[concierge] pending draft mirrored to HubSpot contact ${contactId} (no deal assoc)`);
        }
      } catch (e) {
        console.warn('[concierge] HubSpot draft mirror failed (non-fatal):', (e as Error).message?.slice(0, 80));
      }
    });

    res.json({ ok: true, id: d.id });
  });
}

/** Must be called BEFORE the catch-all chat handlers and bot.start(). */
export function registerConciergeCallbacks(bot: Bot): void {
  bot.callbackQuery(/^cz:(send|skip|edit):([a-f0-9]{16})$/, async (ctx) => {
    const allowedChat = process.env.CONCIERGE_TG_CHAT?.trim();
    if (allowedChat && String(ctx.chat?.id) !== allowedChat) {
      await ctx.answerCallbackQuery({ text: 'Not authorized' });
      return;
    }
    const action = ctx.match![1] as 'send' | 'skip' | 'edit';
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

    if (action === 'edit') {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `✏️ To send your own version to ${d.name} <${d.email}>:\n\nREPLY to the draft message above (swipe/long-press it → Reply) with the full edited text. I'll email exactly what you write, same subject line. The buttons on the original stay active until you send or skip.`
      );
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
      const resendId = await sendReplyEmail(d);
      d.status = 'sent';
      d.sentAt = new Date().toISOString();
      if (resendId) d.resendId = resendId;
      saveDraft(d);
      await ctx.answerCallbackQuery({ text: 'Sent ✅' });
      await ctx.editMessageText(
        `✅ SENT to ${d.name} <${d.email}> at ${d.sentAt}\n📧 Subject: ${d.subject}` +
          `\n🧾 Resend id: ${resendId ?? 'unknown'} — accepted by Resend; if they say it never arrived, check their spam, then this id in the Resend dashboard.` +
          `\n\n${d.draft.slice(0, 3300)}`
      );
      logReplyToHubSpot(d, false);
      console.log(`[concierge] draft ${d.id} SENT to ${d.email} (resend id=${resendId ?? 'unknown'})`);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      console.error(`[concierge] send failed for ${d.id}:`, msg);
      await ctx.answerCallbackQuery({ text: 'Send failed — see message' });
      await ctx.reply(`❌ Concierge send to ${d.email} failed: ${msg.slice(0, 300)}\nDraft ${d.id} is still pending — tap Send again to retry.`);
    }
  });

  // Edited-draft path: a text reply to a concierge draft message sends the
  // edited text to the lead. Anything else falls through to the normal bot.
  bot.on('message:text', async (ctx, next) => {
    const repliedTo = ctx.message.reply_to_message?.message_id;
    if (!repliedTo) return next();
    const allowedChat = process.env.CONCIERGE_TG_CHAT?.trim();
    if (allowedChat && String(ctx.chat?.id) !== allowedChat) return next();
    const d = findDraftByTgMessage(repliedTo);
    if (!d) return next();
    if (d.status !== 'pending') {
      await ctx.reply(`This draft was already ${d.status} — nothing sent.`);
      return;
    }
    const edited = ctx.message.text.trim();
    if (edited.length < 20) {
      await ctx.reply('That looks too short to be a full reply — nothing sent. Reply again with the complete edited text.');
      return;
    }
    try {
      d.draft = edited;
      const resendId = await sendReplyEmail(d);
      d.status = 'sent';
      d.sentAt = new Date().toISOString();
      if (resendId) d.resendId = resendId;
      saveDraft(d);
      await ctx.reply(
        `✅ Your edited version was SENT to ${d.name} <${d.email}>.\n📧 Subject: ${d.subject}` +
          `\n🧾 Resend id: ${resendId ?? 'unknown'}`
      );
      logReplyToHubSpot(d, true);
      console.log(`[concierge] draft ${d.id} SENT (edited) to ${d.email} (resend id=${resendId ?? 'unknown'})`);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      console.error(`[concierge] edited send failed for ${d.id}:`, msg);
      await ctx.reply(`❌ Send failed: ${msg.slice(0, 300)}\nDraft is still pending — reply again or tap Send.`);
    }
  });
}
