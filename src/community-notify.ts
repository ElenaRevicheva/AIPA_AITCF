/**
 * community-notify.ts — deliver a drafted reply to Elena and record her decision.
 *
 * Two destinations on purpose. Telegram is for speed: answering a thread in its
 * first hour is most of the value, and that window closes long before a CRM
 * queue gets reviewed. HubSpot is for the record: it puts community replies in
 * the same place as the manual prospect play, so the effort is visible next to
 * the pipeline it is meant to feed.
 *
 * The buttons never post anything. They record what Elena did, close the CRM
 * task, and make sure the thread is never offered again.
 */

import type { Bot } from 'grammy';
import { isCompleteDraft, type ScoredThread } from './community-listener';
import {
  encodePastePayload,
  communityDocumentFilename,
  buildCommunityCard,
  buildPostedConfirmation,
} from './community-paste';
import {
  attachDelivery,
  getOpportunity,
  saveOpportunity,
  seenExternalIds,
  setStatus,
  type SourceId,
} from './community-store';

export {
  encodePastePayload,
  communityDocumentFilename,
  buildCommunityCard,
  buildPostedConfirmation,
} from './community-paste';

const HS = 'https://api.hubapi.com';
const SOURCES: SourceId[] = ['reddit', 'hackernews', 'indiehackers'];
/** Telegram Bot API hard cap. A paste payload that would need slicing is sent as a file instead. */
const TG_TEXT_MAX = 4096;

function tgChat(): string | null {
  return process.env.COMMUNITY_TG_CHAT?.trim() || process.env.CONCIERGE_TG_CHAT?.trim() || null;
}

function pasteFile(filename: string, text: string): Blob {
  const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
  if (typeof File === 'function') {
    return new File([bytes], filename, { type: 'text/plain;charset=utf-8' });
  }
  return new Blob([bytes], { type: 'text/plain;charset=utf-8' });
}

/** Raw Bot API send so this works from cron without holding the grammY instance. */
async function sendTelegram(
  text: string,
  keyboard?: { text: string; callback_data: string }[][],
  parseMode?: 'HTML',
  opts: { truncate?: boolean } = {},
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tgChat();
  if (!token || !chatId) {
    console.warn('[community] TELEGRAM_BOT_TOKEN or COMMUNITY_TG_CHAT not set — no TG notify');
    return null;
  }
  try {
    const { tgSafeText } = await import('./tg-text.js');
    // Always strip lone surrogates. Never slice a paste payload — a cut is how
    // a finished sentence plus "GPT-4 with" becomes the only thing on the clipboard.
    const sanitized = tgSafeText(text, Number.MAX_SAFE_INTEGER);
    if (sanitized.length > TG_TEXT_MAX) {
      if (!opts.truncate) {
        console.warn('[community] message exceeds Telegram cap — refusing to slice; send as .txt instead');
        return null;
      }
    }
    const payload = opts.truncate ? tgSafeText(sanitized, 4090) : sanitized;
    if (payload.length > TG_TEXT_MAX) return null;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: payload,
        disable_web_page_preview: true,
        link_preview_options: { is_disabled: true },
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      }),
    });
    const j: any = await r.json();
    if (!j?.ok) {
      console.warn('[community] telegram send failed:', j?.description ?? r.status);
      return null;
    }
    return j?.result?.message_id ?? null;
  } catch (e: any) {
    console.warn('[community] telegram send failed:', e?.message ?? e);
    return null;
  }
}

async function sendTelegramDocument(
  filename: string,
  text: string,
  caption: string,
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tgChat();
  if (!token || !chatId) return null;
  try {
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('caption', caption.slice(0, 1024));
    form.set('disable_web_page_preview', 'true');
    const file = pasteFile(filename, text);
    if (typeof File === 'function' && file instanceof File) {
      form.set('document', file);
    } else {
      form.append('document', file, filename);
    }
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const j: any = await r.json();
    if (!j?.ok) {
      console.warn('[community] telegram document failed:', j?.description ?? r.status);
      return null;
    }
    return j?.result?.message_id ?? null;
  } catch (e: any) {
    console.warn('[community] telegram document send failed:', e?.message ?? e);
    return null;
  }
}

async function hs(method: string, path: string, body?: unknown): Promise<any> {
  const key = process.env.HUBSPOT_API_KEY?.trim();
  if (!key) throw new Error('HUBSPOT_API_KEY not set');
  const res = await fetch(`${HS}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`hubspot ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

/**
 * Due in 12 hours, not 4 days like the outreach follow-ups: a community thread
 * is worth answering today or not at all.
 */
async function createHubSpotTask(thread: ScoredThread, draft: string): Promise<string | null> {
  try {
    const due = new Date(Date.now() + 12 * 3600 * 1000);
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `[COMMUNITY] Reply on ${thread.channel} — ${thread.title.slice(0, 70)}`,
        hs_task_body:
          `Thread: ${thread.url}\n` +
          `Matched: "${thread.matchedQuery}" · score ${thread.score}${thread.latam ? ' · LatAm' : ''}\n\n` +
          `Draft reply (review before posting — never paste blind):\n\n${draft}`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: thread.latam ? 'HIGH' : 'MEDIUM',
        hs_timestamp: due.toISOString(),
        hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
      },
    });
    return task?.id ? String(task.id) : null;
  } catch (e: any) {
    console.warn('[community] hubspot task failed:', e?.message ?? e);
    return null;
  }
}

async function completeHubSpotTask(taskId: string): Promise<void> {
  try {
    await hs('PATCH', `/crm/v3/objects/tasks/${taskId}`, {
      properties: { hs_task_status: 'COMPLETED' },
    });
  } catch (e: any) {
    console.warn('[community] hubspot task close failed:', e?.message ?? e);
  }
}

/**
 * Three messages on purpose. The card is HTML (title, link, buttons). The
 * paste payload is a separate plain-text message so long-press Copy cannot
 * tear. The .txt is the top that cannot be sliced by the 4096-char cap or a
 * link preview. An automated poster would get the domain banned; this is
 * still a human paste, just a complete one.
 */
export async function deliverCommunityPaste(
  thread: ScoredThread,
  draft: string,
  keyboard?: { text: string; callback_data: string }[][],
): Promise<{ cardId: number | null; pasteId: number | null; fileId: number | null; ok: boolean }> {
  const paste = encodePastePayload(draft);
  if (!isCompleteDraft(paste)) {
    console.warn('[community] refusing to encode a torn paste:', paste.slice(-80));
    return { cardId: null, pasteId: null, fileId: null, ok: false };
  }
  const cardId = await sendTelegram(
    buildCommunityCard(thread, draft, { withButtons: Boolean(keyboard?.length) }),
    keyboard,
    'HTML',
    { truncate: true },
  );
  const pasteId = await sendTelegram(paste);
  const fileId = await sendTelegramDocument(
    communityDocumentFilename(thread.source, thread.externalId),
    paste,
    'Full reply (.txt) — open, Select All, Copy. Use this if the chat message looks cut off.',
  );
  if (!pasteId && !fileId) {
    console.warn('[community] copy payload failed (neither plain text nor .txt landed)');
  }
  return { cardId, pasteId, fileId, ok: Boolean(pasteId || fileId) };
}

async function deliverCopyPayload(
  thread: ScoredThread,
  draft: string,
  keyboard: { text: string; callback_data: string }[][],
): Promise<number | null> {
  const r = await deliverCommunityPaste(thread, draft, keyboard);
  return r.cardId ?? r.pasteId ?? r.fileId;
}

export interface CycleResult {
  scannedAt: string;
  candidates: number;
  drafted: number;
  declined: number;
  delivered: number;
  outcomes: Array<{ source: string; status: string; found: number; reason?: string }>;
}

/**
 * One full pass: scan, dedupe, draft, persist, deliver. Safe to run on a cron —
 * everything already shown to Elena is filtered out before a single token is spent.
 */
export async function runCommunityCycle(options: { dryRun?: boolean } = {}): Promise<CycleResult> {
  const { scanCommunities, draftReply } = await import('./community-listener');

  const seen = new Set<string>();
  if (!options.dryRun) {
    for (const source of SOURCES) {
      for (const id of await seenExternalIds(source)) seen.add(`${source}:${id}`);
    }
  }

  const scan = await scanCommunities({ seen });
  let drafted = 0;
  let declined = 0;
  let delivered = 0;

  for (const thread of scan.candidates) {
    if (options.dryRun) continue;
    let draft: string | null = null;
    try {
      draft = await draftReply(thread);
    } catch (e: any) {
      console.warn('[community] draft failed:', e?.message ?? e);
      continue;
    }
    if (!draft) {
      declined++;
      // Record the decline so the same thread is not re-evaluated every cycle.
      await saveOpportunity({
        source: thread.source,
        externalId: thread.externalId,
        url: thread.url,
        title: thread.title,
        author: thread.author,
        score: thread.score,
        matchedQuery: thread.matchedQuery,
        latam: thread.latam,
        excerpt: thread.body.slice(0, 2000),
        draft: '',
      });
      continue;
    }
    drafted++;

    const id = await saveOpportunity({
      source: thread.source,
      externalId: thread.externalId,
      url: thread.url,
      title: thread.title,
      author: thread.author,
      score: thread.score,
      matchedQuery: thread.matchedQuery,
      latam: thread.latam,
      excerpt: thread.body.slice(0, 2000),
      draft,
    });
    if (!id) continue;

    const taskId = await createHubSpotTask(thread, draft);
    const messageId = await deliverCopyPayload(thread, draft, [
      [
        // "Posted" read as an instruction rather than a report — the first tap
        // was made expecting the reply to appear on Reddit. Neither button ever
        // touches the platform; they only record what Elena already did.
        { text: "✅ I've posted it", callback_data: `cm:posted:${id}` },
        { text: '🗑 Not worth it', callback_data: `cm:skip:${id}` },
      ],
    ]);
    await attachDelivery(id, taskId, messageId);
    if (messageId || taskId) delivered++;
  }

  return {
    scannedAt: scan.scannedAt,
    candidates: scan.candidates.length,
    drafted,
    declined,
    delivered,
    outcomes: scan.outcomes,
  };
}

/**
 * Must be registered before bot.start() and before the catch-all chat handlers,
 * same as the concierge callbacks. Prefix `cm:` never collides with `cz:`.
 */
export function registerCommunityCallbacks(bot: Bot): void {
  bot.callbackQuery(/^cm:(posted|skip):([a-fA-F0-9]{32})$/, async (ctx) => {
    const allowed = tgChat();
    if (allowed && String(ctx.chat?.id) !== allowed) {
      await ctx.answerCallbackQuery({ text: 'Not authorized' });
      return;
    }
    const action = ctx.match![1] as 'posted' | 'skip';
    const id = ctx.match![2]!;
    const opp = await getOpportunity(id);
    if (!opp) {
      await ctx.answerCallbackQuery({ text: 'Not found' });
      return;
    }
    await setStatus(id, action === 'posted' ? 'posted' : 'skipped');
    if (opp.hsTaskId) await completeHubSpotTask(opp.hsTaskId);
    await ctx.answerCallbackQuery({ text: action === 'posted' ? 'Logged as posted' : 'Skipped' });
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await ctx.editMessageText(
      buildPostedConfirmation({
        posted: action === 'posted',
        stamp,
        source: opp.source,
        title: opp.title,
        url: opp.url,
      }),
      { link_preview_options: { is_disabled: true } },
    );
  });
}
