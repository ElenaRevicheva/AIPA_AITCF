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
  COMMUNITY_BOARD_DEAL_NAME,
  communityBoardDealUrl,
} from './community-paste';
import {
  attachDelivery,
  getOpportunity,
  getOpportunityBySourceExternal,
  saveOpportunity,
  seenExternalIds,
  setStatus,
  stats,
  type SourceId,
} from './community-store';

export {
  encodePastePayload,
  communityDocumentFilename,
  buildCommunityCard,
  buildPostedConfirmation,
  COMMUNITY_BOARD_DEAL_NAME,
  communityBoardDealUrl,
  HUBSPOT_PORTAL_ID,
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
async function createHubSpotTask(
  thread: ScoredThread,
  draft: string,
  opts?: { completed?: boolean; extra?: string },
): Promise<string | null> {
  try {
    const due = new Date(Date.now() + 12 * 3600 * 1000);
    const extra = opts?.extra ? `${opts.extra}\n\n` : '';
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `[COMMUNITY] Reply on ${thread.channel} — ${thread.title.slice(0, 70)}`,
        hs_task_body:
          extra +
          `Thread: ${thread.url}\n` +
          `Matched: "${thread.matchedQuery}" · score ${thread.score}${thread.latam ? ' · LatAm' : ''}\n\n` +
          `Draft reply (review before posting — never paste blind):\n\n${draft}`,
        hs_task_status: opts?.completed ? 'COMPLETED' : 'NOT_STARTED',
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

const TASK_TO_DEAL = 216;
const NOTE_TO_DEAL = 214;
let cachedBoardDealId: string | null = null;

/**
 * One deal Elena can actually open on the phone. Completed orphan tasks are
 * invisible in Due tasks, in Search → Tasks (open only), and in Search →
 * Activity (which matches "DEV Community" emails). Notes on a deal named
 * [COMMUNITY] show up under Search → Deals — the first tab on that screen.
 */
export async function ensureCommunityBoardDeal(): Promise<string | null> {
  if (cachedBoardDealId) return cachedBoardDealId;
  try {
    const found = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealname', operator: 'EQ', value: COMMUNITY_BOARD_DEAL_NAME },
          ],
        },
      ],
      properties: ['dealname'],
      limit: 1,
    });
    const existingId = found?.results?.[0]?.id ? String(found.results[0].id) : null;
    if (existingId) {
      cachedBoardDealId = existingId;
      return existingId;
    }
    const created = await hs('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname: COMMUNITY_BOARD_DEAL_NAME,
        // Not qualifiedtobuy — that stage is 🔥 I Act TODAY (money queue).
        dealstage: 'appointmentscheduled',
        pipeline: 'default',
        amount: '0',
        hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
      },
    });
    cachedBoardDealId = created?.id ? String(created.id) : null;
    return cachedBoardDealId;
  } catch (e: any) {
    console.warn('[community] hubspot board deal failed:', e?.message ?? e);
    return null;
  }
}

async function associateTaskToDeal(taskId: string, dealId: string): Promise<void> {
  try {
    await hs('PUT', `/crm/v4/objects/tasks/${taskId}/associations/deals/${dealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TASK_TO_DEAL },
    ]);
  } catch (e: any) {
    console.warn('[community] hubspot task↔deal associate failed:', e?.message ?? e);
  }
}

function pinMarker(source: string, externalId: string): string {
  return `community-pin:${source}:${externalId}`;
}

async function dealAlreadyHasPin(dealId: string, marker: string): Promise<boolean> {
  try {
    const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
    const ids = (assoc?.results ?? []).map((r: any) => String(r.toObjectId || r.id || '')).filter(Boolean);
    for (const noteId of ids.slice(0, 40)) {
      const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
      const body = String(note?.properties?.hs_note_body || '');
      if (body.includes(marker)) return true;
    }
  } catch (e: any) {
    console.warn('[community] hubspot note scan failed:', e?.message ?? e);
  }
  return false;
}

async function pinPostedNote(
  dealId: string,
  thread: Pick<ScoredThread, 'source' | 'externalId' | 'channel' | 'title' | 'url'>,
  extra?: string,
): Promise<string | null> {
  const marker = pinMarker(thread.source, thread.externalId);
  if (await dealAlreadyHasPin(dealId, marker)) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  const body = [
    `✅ POSTED ${stamp} · ${thread.channel}`,
    thread.title.slice(0, 200),
    `Thread: ${thread.url}`,
    extra || 'This reply counts in community stats.',
    marker,
  ].join('\n');
  try {
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
    });
    if (!note?.id) return null;
    await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_DEAL },
    ]);
    return String(note.id);
  } catch (e: any) {
    console.warn('[community] hubspot posted note failed:', e?.message ?? e);
    return null;
  }
}

export interface BoardPin {
  dealId: string | null;
  dealUrl: string | null;
  taskId: string | null;
  taskStatus: string | null;
  noteId: string | null;
}

/**
 * Put the reply on the one HubSpot record the mobile app can open: a Deal.
 * Associates the [COMMUNITY] task (even if already Completed) and writes a
 * timeline note when posted=true.
 */
export async function pinCommunityBoard(opts: {
  thread: ScoredThread;
  hsTaskId?: string | null;
  posted?: boolean;
  extra?: string;
}): Promise<BoardPin> {
  const empty: BoardPin = { dealId: null, dealUrl: null, taskId: opts.hsTaskId ?? null, taskStatus: null, noteId: null };
  const dealId = await ensureCommunityBoardDeal();
  if (!dealId) return empty;
  if (opts.hsTaskId) await associateTaskToDeal(opts.hsTaskId, dealId);
  let taskStatus: string | null = null;
  if (opts.hsTaskId) {
    try {
      const task = await hs(
        'GET',
        `/crm/v3/objects/tasks/${opts.hsTaskId}?properties=hs_task_subject,hs_task_status`,
      );
      taskStatus = task?.properties?.hs_task_status ?? null;
    } catch (e: any) {
      console.warn('[community] hubspot task read failed:', e?.message ?? e);
    }
  }
  const noteId = opts.posted ? await pinPostedNote(dealId, opts.thread, opts.extra) : null;
  return {
    dealId,
    dealUrl: communityBoardDealUrl(dealId),
    taskId: opts.hsTaskId ?? null,
    taskStatus,
    noteId,
  };
}

/** Backfill: pin the already-posted follow-up and send Elena the Deal URL. */
export async function pinBoardAndTellElena(opts: {
  thread: ScoredThread;
  hsTaskId?: string | null;
}): Promise<BoardPin & { cardId: number | null }> {
  const pin = await pinCommunityBoard({
    thread: opts.thread,
    hsTaskId: opts.hsTaskId ?? null,
    posted: true,
    extra: 'Pinned so the mobile app has a Deal to open. Tasks tab hides Completed.',
  });
  const cardId = await sendTelegram(
    [
      'The HubSpot needle is a Deal, not a Task.',
      '',
      `Search COMMUNITY → tap Deals (first tab) → ${COMMUNITY_BOARD_DEAL_NAME}`,
      '',
      'Ignore Search → Activity — that is matching DEV Community emails.',
      'Ignore Search → Tasks — that list is open to-dos only.',
      '',
      pin.dealUrl || '(deal URL missing — HubSpot write failed)',
      '',
      `Timeline note: ✅ POSTED ${opts.thread.channel}`,
    ].join('\n'),
    undefined,
    undefined,
    { truncate: true },
  );
  return { ...pin, cardId };
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

function postingKeyboard(id: string): { text: string; callback_data: string }[][] {
  return [
    [
      // "Posted" read as an instruction rather than a report — the first tap
      // was made expecting the reply to appear on Reddit. Neither button ever
      // touches the platform; they only record what Elena already did.
      { text: "✅ I've posted it", callback_data: `cm:posted:${id}` },
      { text: '🗑 Not worth it', callback_data: `cm:skip:${id}` },
    ],
  ];
}

export interface OfferResult {
  id: string | null;
  hsTaskId: string | null;
  hsDealId?: string | null;
  hsDealUrl?: string | null;
  cardId: number | null;
  pasteId: number | null;
  fileId: number | null;
  status: 'queued' | 'posted' | 'skipped';
  ok: boolean;
}

/**
 * The whole attribution path. Save the row, park a HubSpot [COMMUNITY] task,
 * then send the card WITH the green check. A paste without that button is a
 * reply the marketing workout cannot count.
 */
export async function offerAndDeliverCommunityReply(
  thread: ScoredThread,
  draft: string,
): Promise<OfferResult> {
  const paste = encodePastePayload(draft);
  if (!isCompleteDraft(paste)) {
    console.warn('[community] refusing to encode a torn paste:', paste.slice(-80));
    return { id: null, hsTaskId: null, cardId: null, pasteId: null, fileId: null, status: 'queued', ok: false };
  }
  const existing = await getOpportunityBySourceExternal(thread.source, thread.externalId);
  const id =
    existing?.id ??
    (await saveOpportunity({
      source: thread.source,
      externalId: thread.externalId,
      url: thread.url,
      title: thread.title,
      author: thread.author,
      score: thread.score,
      matchedQuery: thread.matchedQuery,
      latam: thread.latam,
      excerpt: thread.body.slice(0, 2000),
      draft: paste,
    }));
  if (!id) {
    return { id: null, hsTaskId: null, cardId: null, pasteId: null, fileId: null, status: 'queued', ok: false };
  }
  const hsTaskId = existing?.hsTaskId ?? (await createHubSpotTask(thread, paste));
  const board = await pinCommunityBoard({ thread, hsTaskId, posted: false });
  const delivered = await deliverCommunityPaste(thread, paste, postingKeyboard(id));
  await attachDelivery(id, hsTaskId, delivered.cardId);
  return {
    id,
    hsTaskId,
    hsDealId: board.dealId,
    hsDealUrl: board.dealUrl,
    cardId: delivered.cardId,
    pasteId: delivered.pasteId,
    fileId: delivered.fileId,
    status: existing?.status ?? 'queued',
    ok: delivered.ok,
  };
}

/**
 * Elena said "I posted" in chat. Same writes the green check would have done:
 * community_opportunities.status=posted, HubSpot [COMMUNITY] task completed,
 * Telegram confirmation. Does not send another copy payload.
 */
export async function recordAlreadyPosted(
  thread: ScoredThread,
  draft: string,
): Promise<OfferResult & { stats: Awaited<ReturnType<typeof stats>> }> {
  const paste = encodePastePayload(draft);
  let existing = await getOpportunityBySourceExternal(thread.source, thread.externalId);
  let id = existing?.id ?? null;
  if (!id) {
    id = await saveOpportunity({
      source: thread.source,
      externalId: thread.externalId,
      url: thread.url,
      title: thread.title,
      author: thread.author,
      score: thread.score,
      matchedQuery: thread.matchedQuery,
      latam: thread.latam,
      excerpt: thread.body.slice(0, 2000),
      draft: paste,
    });
    if (!id) {
      existing = await getOpportunityBySourceExternal(thread.source, thread.externalId);
      id = existing?.id ?? null;
    }
  }
  if (!id) {
    return {
      id: null,
      hsTaskId: null,
      cardId: null,
      pasteId: null,
      fileId: null,
      status: 'queued',
      ok: false,
      stats: await stats(),
    };
  }
  const hsTaskId =
    existing?.hsTaskId ??
    (await createHubSpotTask(thread, paste, {
      completed: true,
      extra: `✅ POSTED ${new Date().toISOString().slice(0, 10)} — Elena confirmed in Telegram (green-check path was missing on the one-shot paste). Attribution recorded.`,
    }));
  await setStatus(id, 'posted');
  if (hsTaskId && existing?.hsTaskId) await completeHubSpotTask(hsTaskId);
  const board = await pinCommunityBoard({
    thread,
    hsTaskId,
    posted: true,
    extra: 'Elena confirmed in Telegram. Attribution recorded on this deal timeline.',
  });
  await attachDelivery(id, hsTaskId, existing?.tgMessageId ?? null);
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const cardId = await sendTelegram(
    buildPostedConfirmation({
      posted: true,
      stamp,
      source: thread.source,
      title: thread.title,
      url: thread.url,
      ...(board.dealUrl ? { hubspotDealUrl: board.dealUrl } : {}),
    }) + `\n\nLogged. Open the Deal (Search → COMMUNITY → Deals). Tasks tab hides Completed.`,
    undefined,
    undefined,
    { truncate: true },
  );
  return {
    id,
    hsTaskId,
    hsDealId: board.dealId,
    hsDealUrl: board.dealUrl,
    cardId,
    pasteId: null,
    fileId: null,
    status: 'posted',
    ok: true,
    stats: await stats(),
  };
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

    const offered = await offerAndDeliverCommunityReply(thread, draft);
    if (offered.ok || offered.hsTaskId) delivered++;
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
    const board =
      action === 'posted'
        ? await pinCommunityBoard({
            thread: {
              source: opp.source,
              externalId: opp.externalId,
              url: opp.url,
              title: opp.title,
              body: opp.excerpt,
              author: opp.author,
              createdAt: Date.now(),
              channel: opp.source,
              score: opp.score,
              matchedQuery: opp.matchedQuery,
              latam: opp.latam,
            },
            hsTaskId: opp.hsTaskId ?? null,
            posted: true,
          })
        : { dealUrl: null as string | null };
    await ctx.answerCallbackQuery({ text: action === 'posted' ? 'Logged as posted' : 'Skipped' });
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await ctx.editMessageText(
      buildPostedConfirmation({
        posted: action === 'posted',
        stamp,
        source: opp.source,
        title: opp.title,
        url: opp.url,
        ...(board.dealUrl ? { hubspotDealUrl: board.dealUrl } : {}),
      }),
      { link_preview_options: { is_disabled: true } },
    );
  });
}
