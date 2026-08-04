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
import type { ScoredThread } from './community-listener';
import {
  attachDelivery,
  getOpportunity,
  saveOpportunity,
  seenExternalIds,
  setStatus,
  type SourceId,
} from './community-store';

const HS = 'https://api.hubapi.com';
const SOURCES: SourceId[] = ['reddit', 'hackernews', 'indiehackers'];

function tgChat(): string | null {
  return process.env.COMMUNITY_TG_CHAT?.trim() || process.env.CONCIERGE_TG_CHAT?.trim() || null;
}

/** Raw Bot API send so this works from cron without holding the grammY instance. */
async function sendTelegram(
  text: string,
  keyboard?: { text: string; callback_data: string }[][],
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tgChat();
  if (!token || !chatId) {
    console.warn('[community] TELEGRAM_BOT_TOKEN or COMMUNITY_TG_CHAT not set — no TG notify');
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4090),
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      }),
    });
    const j: any = await r.json();
    return j?.result?.message_id ?? null;
  } catch (e: any) {
    console.warn('[community] telegram send failed:', e?.message ?? e);
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

function card(thread: ScoredThread, draft: string): string {
  return [
    `${thread.latam ? '🌎 LatAm · ' : ''}${thread.channel} · score ${thread.score}`,
    ``,
    `❓ ${thread.title.slice(0, 300)}`,
    `🔗 ${thread.url}`,
    ``,
    `✍️ Draft reply — read it, edit it in your own words, then post it yourself:`,
    `──────────`,
    draft,
    `──────────`,
    ``,
    `Matched "${thread.matchedQuery}". Nothing is posted automatically.`,
  ].join('\n');
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
    const messageId = await sendTelegram(card(thread, draft), [
      [
        { text: '✅ Posted', callback_data: `cm:posted:${id}` },
        { text: '🗑 Skip', callback_data: `cm:skip:${id}` },
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
      `${action === 'posted' ? '✅ POSTED' : '🗑 SKIPPED'} · ${stamp} UTC\n` +
        `${opp.source} · ${opp.title.slice(0, 200)}\n${opp.url}` +
        (action === 'posted' ? `\n\n${opp.draft.slice(0, 3200)}` : ''),
    );
  });
}
