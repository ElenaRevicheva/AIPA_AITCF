/**
 * Concierge watchdog — the safety net under Make, never a replacement for it.
 *
 * Why (July 29 2026): every inbound draft Elena receives is produced by one
 * external Make.com scenario. On July 29 that scenario went silent and two real
 * inbound events produced nothing at all:
 *
 *   1. a chat message on a thread already pushed to HubSpot
 *      → `[chat-concierge] thread 11024998923 already in HubSpot — alert only`
 *      → no contact CREATED → Make's trigger had nothing to fire on → no draft,
 *        while the Telegram alert still promised one "from Make (~15 min)".
 *   2. a portfolio form submit (Alexia Mikes, 14:30 UTC)
 *      → `[inquiry] HubSpot [CLIENT] deal created (test email — contact recreated
 *        for Make)` — our side did everything right, Make simply never answered.
 *        The form path has no Telegram alert of its own, so it was 100% silent.
 *
 * Make remains the primary drafter and is deliberately untouched: its scenario,
 * its trigger, its webhook, its Fable 5 prompt all keep working exactly as they
 * do today. This module is ADDITIVE and only ever acts on PROVEN silence.
 *
 * The guarantee that we never race Make:
 *   Make's draft arrives ≤15 min after contact creation (concierge.ts documents
 *   this and sizes its recipient-resolution window on it). We wait
 *   CONCIERGE_WATCHDOG_MIN (default 20 min) — strictly longer — and then check
 *   whether a draft for that lead exists. If one does, from ANY source, we do
 *   nothing at all. Only total silence triggers a draft of our own.
 *
 * What it produces is not a parallel format: it POSTs to the same
 * /concierge/draft endpoint Make posts to, so the lead gets the identical
 * Telegram card with the ✅ Send button, the same Resend send path, the same
 * HubSpot Email activity and ENTREGADO stamp.
 *
 * Failure isolation: own state file, own try/catch, own timer. If this module
 * throws, the chat concierge, the form path and Make are all unaffected.
 */
import fs from 'fs';
import path from 'path';

// Deliberately process.cwd(), matching concierge.ts's DRAFT_DIR exactly rather
// than honouring CTO_AIPA_ROOT. These two modules must always agree on where
// drafts live: if the watchdog ever looked somewhere concierge does not write,
// it would see "no draft" for leads Make had already answered and post a second
// draft on top. Same root, one source of truth, no way to double-draft.
const STATE_PATH = path.join(process.cwd(), 'data', 'concierge-watchdog.json');

/** Longer than Make's ≤15-min delivery, so a live Make always wins the race. */
const WAIT_MS = Number(process.env.CONCIERGE_WATCHDOG_MIN ?? 20) * 60 * 1000;
const TICK_MS = 60 * 1000;
/** Give up on a watch this old — a lead from yesterday is not worth a cold draft today. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Watch = {
  email: string;
  name: string;
  text: string;
  /** 'web_chat' | 'inquiry_form' — only used to phrase the log line. */
  source: string;
  registeredAt: string;
};

type State = { watches: Watch[] };

function readState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
    return { watches: Array.isArray(s.watches) ? s.watches.slice(-200) : [] };
  } catch {
    return { watches: [] };
  }
}

function writeState(s: State): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify({ watches: s.watches.slice(-200) }, null, 2), 'utf8');
  } catch (e) {
    console.warn('[watchdog] state write failed:', (e as Error).message?.slice(0, 80));
  }
}

/**
 * Record that a real inbound lead arrived and a draft is owed for it.
 *
 * Called on every inbound event — chat message or form submit, new contact or
 * returning one. Registering costs nothing and changes nothing: if Make does its
 * job, the watch expires silently having done no work.
 *
 * Survives a pm2 restart between registration and the check (state on disk).
 */
export function registerLeadWatch(lead: {
  email: string;
  name?: string | null;
  text?: string | null;
  source: string;
}): void {
  try {
    const email = (lead.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const state = readState();
    // One watch per email at a time — a visitor sending three lines in a row is
    // one person owed one reply, not three drafts.
    if (state.watches.some(w => w.email.toLowerCase() === email.toLowerCase())) {
      return;
    }
    state.watches.push({
      email,
      name: (lead.name || '').trim(),
      text: (lead.text || '').trim(),
      source: lead.source,
      registeredAt: new Date().toISOString(),
    });
    writeState(state);
    console.log(
      `[watchdog] watching ${email} (${lead.source}) — if Make sends no draft in ${Math.round(WAIT_MS / 60000)} min, I will`,
    );
  } catch (e) {
    console.warn('[watchdog] register failed (non-fatal):', (e as Error).message?.slice(0, 80));
  }
}

/**
 * Write the draft ourselves, in Fable 5's own output contract, and hand it to
 * the same endpoint Make posts to. Same card, same ✅ Send button, same CRM trail.
 */
async function generateAndPostDraft(w: Watch): Promise<boolean> {
  const secret = process.env.CONCIERGE_SECRET?.trim();
  if (!secret) {
    console.warn('[watchdog] CONCIERGE_SECRET missing — cannot post a draft');
    return false;
  }
  const base = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
  const first = (w.name || w.email).split(/[\s@]/)[0];

  const system =
    'You are Elena Revicheva, founder of AIdeazz AI Lab, replying to someone who contacted her through ' +
    'aideazz.xyz. She installs an AI Growth Operator for service businesses: AI search visibility, prospect ' +
    'research, outreach and follow-up, WhatsApp lead qualification, CRM upkeep, daily briefing. ' +
    'Answer what they actually asked, warm and direct, max 110 words, no bullet lists, no hype, never promise ' +
    'results, end by offering a 15-minute call. Reply in the language they wrote in. ' +
    'Plain text only — no markdown, no ** around words, no headings. ' +
    'Output EXACTLY this shape:\nSUBJECT: <one line>\nDRAFT REPLY:\n<the message body, no signature>';
  const userPrompt = `Their message: "${w.text || '(no message text captured — they reached out via the site)'}"\nTheir name: ${first}`;

  let text = '';
  try {
    const mod: any = await import('@anthropic-ai/sdk');
    // CommonJS interop: depending on how the SDK is transpiled the constructor is
    // either the namespace default or module.exports itself. Picking the wrong one
    // yields `undefined`, and `new undefined()` throws inside this try — which is
    // indistinguishable from an API failure in the log. Resolve it explicitly.
    const Anthropic = mod?.default ?? mod?.Anthropic ?? mod;
    if (typeof Anthropic !== 'function') {
      console.error('[watchdog] Anthropic SDK export is not a constructor — cannot draft');
      return false;
    }
    const { claudeWithGroqFallback } = await import('./llm-resilience.js');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });
    text = await claudeWithGroqFallback(anthropic, 'claude-opus-5', 500, system, userPrompt, 'concierge-watchdog');
    console.log(`[watchdog] LLM returned ${text.trim().length} chars for ${w.email}`);
  } catch (e) {
    console.error('[watchdog] draft LLM failed:', (e as Error).message?.slice(0, 200));
  }
  if (!text.trim()) {
    // Was silent before: an empty completion looked exactly like a crash.
    console.error(`[watchdog] LLM produced an EMPTY draft for ${w.email} — nothing to post`);
    return false;
  }

  try {
    const body = new URLSearchParams({
      email: w.email,
      name: w.name,
      inquiry: w.text,
      claude_output: text,
    });
    const r = await fetch(`${base}/concierge/draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const replyBody = (await r.text()).slice(0, 200);
    if (!r.ok) {
      console.error(`[watchdog] /concierge/draft returned ${r.status}: ${replyBody}`);
      return false;
    }
    // A 200 is not proof the card was sent: the endpoint also answers 200 when it
    // drops a draft as unresolved or as auto-import noise. Say which one happened.
    console.log(`[watchdog] /concierge/draft accepted for ${w.email}: ${replyBody}`);
    return true;
  } catch (e) {
    console.error('[watchdog] draft post failed:', (e as Error).message?.slice(0, 200));
    return false;
  }
}

export async function runWatchdogOnce(): Promise<{ due: number; covered: number; makeDelivered: number }> {
  const result = { due: 0, covered: 0, makeDelivered: 0 };
  const state = readState();
  if (!state.watches.length) return result;

  const { hasDraftForEmailSince, hasSpamVerdictSince } = await import('./concierge');
  const keep: Watch[] = [];

  for (const w of state.watches) {
    const registered = Date.parse(w.registeredAt);
    const age = Date.now() - registered;

    if (age < WAIT_MS) {
      keep.push(w); // Make still has time — hands off.
      continue;
    }
    if (age > MAX_AGE_MS) {
      console.log(`[watchdog] giving up on ${w.email} — too old to send a cold draft`);
      continue;
    }
    result.due++;

    // Look slightly before registration: Make can answer a contact created a
    // moment before we registered the watch.
    const since = registered - 5 * 60 * 1000;
    if (hasDraftForEmailSince(w.email, since)) {
      result.makeDelivered++;
      console.log(`[watchdog] ${w.email} already has a draft — Make did its job, standing down`);
      continue;
    }
    if (hasSpamVerdictSince(w.email, since)) {
      console.log(`[watchdog] ${w.email} was ruled SPAM by Fable 5 — no draft, by design`);
      continue;
    }

    console.warn(
      `[watchdog] NO draft for ${w.email} (${w.source}) after ${Math.round(age / 60000)} min — Make silent, drafting now`,
    );
    const ok = await generateAndPostDraft(w);
    if (ok) {
      result.covered++;
      console.log(`[watchdog] covered for Make — draft delivered to Telegram for ${w.email}`);
    } else {
      // Could not draft: tell Elena in plain words rather than losing the lead.
      await notifyOwners(
        `⚠️ Inbound lead with NO draft\n\n👤 ${w.name || w.email}\n📧 ${w.email}\n\n"${w.text.slice(0, 500)}"\n\n` +
          `Make sent nothing in ${Math.round(age / 60000)} min and I could not draft either — reply by hand.`,
      );
    }
  }

  state.watches = keep;
  writeState(state);
  return result;
}

/**
 * Instant "someone filled the form" ping — the counterpart of the chat bubble's
 * alert, which the form path never had. Independent of Make and of HubSpot: even
 * if both are down, Elena knows within seconds that a human reached out and can
 * answer from her phone. The draft, when it comes, is a bonus on top.
 */
export async function notifyInquiryReceived(f: {
  name?: string;
  email?: string;
  message?: string;
  utmSource?: string;
  pageUrl?: string;
}): Promise<void> {
  const lines = [
    `📨 New inquiry from the aideazz.xyz form`,
    ``,
    f.name ? `👤 ${f.name}` : null,
    f.email ? `📧 ${f.email}` : `📧 (no email left)`,
    f.message ? `\n💬 They wrote:\n"${f.message.slice(0, 900)}"` : null,
    f.utmSource ? `\n🔗 Source: ${f.utmSource}` : null,
    f.pageUrl ? `📄 Page: ${f.pageUrl}` : null,
    ``,
    f.email ? `✍️ Draft with the ✅ Send button follows (~15 min).` : null,
    f.email ? `Or reply directly: ${f.email}` : null,
  ].filter(l => l !== null) as string[];
  await notifyOwners(lines.join('\n'));
}

/** Plain owner ping — used only when we cannot produce a draft at all. */
async function notifyOwners(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat =
    process.env.CONCIERGE_TG_CHAT?.trim() ||
    (process.env.TELEGRAM_AUTHORIZED_USERS || '').split(',')[0]?.trim();
  if (!token || !chat) {
    console.warn('[watchdog] TELEGRAM_BOT_TOKEN / CONCIERGE_TG_CHAT missing — owner ping skipped');
    return;
  }
  // Log the outcome, not the attempt: "the alert was sent" has to be checkable
  // in the log afterwards, otherwise a silent failure looks identical to success.
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4090), disable_web_page_preview: true }),
    });
    if (r.ok) {
      console.log(`[watchdog] owner ping DELIVERED to Telegram chat ${chat}`);
    } else {
      console.error(`[watchdog] owner ping FAILED ${r.status}: ${(await r.text()).slice(0, 160)}`);
    }
  } catch (e) {
    console.error('[watchdog] owner ping threw:', (e as Error).message?.slice(0, 120));
  }
}

/**
 * Make liveness check — the answer to "how do I know it will work next time?"
 *
 * The Lead Concierge scenario has failed silently twice in four days: blind from
 * July 27-30 (stale polling epoch, `ops=1` on every run), then starved on July 30
 * (`limit:1` trigger, four junk contacts ate every slot). Both times the first
 * symptom was a real prospect getting no reply, discovered by hand.
 *
 * A scheduled scenario that stops running is invisible from inside Make unless
 * someone opens the dashboard. So we watch it from outside: if its newest
 * execution is older than MAKE_STALE_MIN, say so on Telegram — once per
 * cooldown, never in a loop. Read-only; it never edits or restarts the scenario.
 */
const MAKE_STALE_MIN = Number(process.env.MAKE_STALE_MIN ?? 45);
const MAKE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
let lastMakeAlertAt = 0;

export async function checkMakeHealth(): Promise<{ ok: boolean; lastRunMinAgo: number | null }> {
  const token = process.env.MAKE_API_TOKEN?.trim();
  const base = (process.env.MAKE_API_BASE || 'https://us2.make.com/api/v2').replace(/\/$/, '');
  const scenarioId = process.env.MAKE_CONCIERGE_SCENARIO_ID?.trim() || '5633833';
  if (!token) return { ok: true, lastRunMinAgo: null }; // not configured — stay silent

  try {
    const r = await fetch(`${base}/scenarios/${scenarioId}/logs?pg[limit]=5`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!r.ok) return { ok: true, lastRunMinAgo: null };
    const rows = (JSON.parse(await r.text())?.scenarioLogs || []) as any[];
    // Only real executions count. Blueprint edits appear as rows with no
    // operations and would otherwise mask a scenario that stopped executing.
    const lastRun = rows.find(l => l.operations !== undefined && l.operations !== null);
    if (!lastRun?.timestamp) return { ok: true, lastRunMinAgo: null };

    const minAgo = Math.round((Date.now() - Date.parse(lastRun.timestamp)) / 60000);
    if (minAgo <= MAKE_STALE_MIN) return { ok: true, lastRunMinAgo: minAgo };

    if (Date.now() - lastMakeAlertAt > MAKE_ALERT_COOLDOWN_MS) {
      lastMakeAlertAt = Date.now();
      await notifyOwners(
        `⚠️ Make Lead Concierge looks STALLED\n\n` +
          `Last execution: ${minAgo} min ago (expected every 15 min).\n\n` +
          `Inbound leads are still safe — I draft for anyone Make misses within ` +
          `${Math.round(WAIT_MS / 60000)} min. But Make itself needs a look:\n` +
          `https://us2.make.com/938264/scenarios/${scenarioId}/edit\n\n` +
          `Most likely: the trigger's polling epoch went stale again. Fix = right-click ` +
          `the HubSpot module → Choose where to start → From now on → Save.`,
      );
      console.error(`[watchdog] MAKE STALLED — last run ${minAgo} min ago; owner alerted`);
    }
    return { ok: false, lastRunMinAgo: minAgo };
  } catch (e) {
    console.warn('[watchdog] Make health check failed (non-fatal):', (e as Error).message?.slice(0, 90));
    return { ok: true, lastRunMinAgo: null };
  }
}

let timer: NodeJS.Timeout | null = null;
let makeTimer: NodeJS.Timeout | null = null;

export function startConciergeWatchdog(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runWatchdogOnce().catch(e =>
      console.warn('[watchdog] tick failed (non-fatal):', (e as Error).message?.slice(0, 90)),
    );
  }, TICK_MS);
  console.log(
    `🛟 Concierge watchdog started — Make stays primary; covers only if no draft after ${Math.round(WAIT_MS / 60000)} min`,
  );

  if (process.env.MAKE_API_TOKEN?.trim() && !makeTimer) {
    // Every 15 min, matching the scenario's own cadence.
    makeTimer = setInterval(() => void checkMakeHealth(), 15 * 60 * 1000);
    setTimeout(() => void checkMakeHealth(), 60_000);
    console.log(`🔎 Make liveness monitor started — alerts if no execution for ${MAKE_STALE_MIN} min`);
  }
}
