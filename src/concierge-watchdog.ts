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

/**
 * `covers` = ISO timestamps of leads we had to draft for because Make produced
 * nothing. Each entry is hard evidence that a real inbound lead reached us and
 * Make did not answer it, which is what turns "Make looks fine" into "Make is
 * broken" — see checkMakeHealth.
 */
type State = { watches: Watch[]; covers: string[] };

function readState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
    return {
      watches: Array.isArray(s.watches) ? s.watches.slice(-200) : [],
      covers: Array.isArray(s.covers) ? s.covers.slice(-100) : [],
    };
  } catch {
    return { watches: [], covers: [] };
  }
}

function writeState(s: State): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify({ watches: s.watches.slice(-200), covers: (s.covers || []).slice(-100) }, null, 2),
      'utf8',
    );
  } catch (e) {
    console.warn('[watchdog] state write failed:', (e as Error).message?.slice(0, 80));
  }
}

/** How many real leads Make failed to answer within the given window. */
function coversSince(sinceMs: number): number {
  try {
    return (readState().covers || []).filter(t => Date.parse(t) >= sinceMs).length;
  } catch {
    return 0;
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
 * Hand the uncovered lead to the same endpoint Make posts to, and let it draft.
 * Same card, same ✅ Send button, same CRM trail — whoever got there first.
 */
async function generateAndPostDraft(w: Watch): Promise<boolean> {
  const secret = process.env.CONCIERGE_SECRET?.trim();
  if (!secret) {
    console.warn('[watchdog] CONCIERGE_SECRET missing — cannot post a draft');
    return false;
  }
  const base = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');

  /**
   * No LLM call here any more — post the lead and let /concierge/draft write it.
   *
   * This function used to run its own `claudeWithGroqFallback`: a two-provider
   * chain that opened on a hard-coded `claude-opus-5`. With Anthropic dry that
   * meant every watchdog draft depended on Groq alone, and Groq returns EMPTY
   * rather than erroring at small budgets — which is exactly the failure logged
   * on Aug 18 ("LLM produced an EMPTY draft for watchdog-verify3"): a dead end
   * with four healthy providers untried.
   *
   * The endpoint now owns drafting for every caller, on the full five-provider
   * `quality` chain, treating empty as a failure and walking on. Keeping a second
   * copy of that logic here is how the two drifted apart in the first place.
   */
  try {
    const body = new URLSearchParams({
      email: w.email,
      name: w.name,
      inquiry: w.text,
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
      // Record on the in-memory state, NOT through a separate read-modify-write.
      // This function writes `state` again when the loop ends, so anything
      // persisted behind its back gets clobbered — which is exactly what happened
      // on the first live cover: the log said "covered for Make" while covers[]
      // stayed empty, quietly disabling the unproductive-Make alert that reads it.
      state.covers = [...(state.covers || []), new Date().toISOString()].slice(-100);
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
    const { tgSafeText } = await import('./tg-text.js');
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // These alerts quote the prospect's own words, so they carry the same
      // emoji hazard as the draft card — and this is the path that is supposed
      // to work when everything else has failed.
      body: JSON.stringify({ chat_id: chat, text: tgSafeText(text, 4090), disable_web_page_preview: true }),
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
/** Make's own execution status code for a failed run (1 = success, 3 = error). */
const MAKE_STATUS_ERROR = 3;
const MAKE_STALE_MIN = Number(process.env.MAKE_STALE_MIN ?? 45);
const MAKE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Standing, accepted conditions (empty Anthropic balance) get a daily voice, not a six-hourly one. */
const CREDIT_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
let lastMakeAlertAt = 0;
let lastCreditAlertAt = 0;

export async function checkMakeHealth(): Promise<{
  ok: boolean;
  lastRunMinAgo: number | null;
  nextExecMinAway: number | null;
  action: 'none' | 're-armed' | 'started' | 'alerted';
}> {
  const token = process.env.MAKE_API_TOKEN?.trim();
  const base = (process.env.MAKE_API_BASE || 'https://us2.make.com/api/v2').replace(/\/$/, '');
  const scenarioId = process.env.MAKE_CONCIERGE_SCENARIO_ID?.trim() || '5633833';
  const idle = { ok: true, lastRunMinAgo: null, nextExecMinAway: null, action: 'none' as const };
  if (!token) return idle; // not configured — stay silent

  const api = async (p: string, method = 'GET') =>
    fetch(`${base}${p}`, { method, headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } });

  try {
    const sr = await api(`/scenarios/${scenarioId}`);
    if (!sr.ok) return idle;
    const sc = (JSON.parse(await sr.text()) as any)?.scenario;
    if (!sc) return idle;

    const lr = await api(`/scenarios/${scenarioId}/logs?pg[limit]=20`);
    const rows = lr.ok ? ((JSON.parse(await lr.text())?.scenarioLogs || []) as any[]) : [];
    // Only real executions count. Blueprint edits and stop/start appear as rows
    // with no `operations` and would make a dead scenario look alive.
    const lastRun = rows.find(l => l.operations !== undefined && l.operations !== null);
    const lastRunMinAgo = lastRun?.timestamp
      ? Math.round((Date.now() - Date.parse(lastRun.timestamp)) / 60000)
      : null;
    const nextExecMs = sc.nextExec ? Date.parse(sc.nextExec) : NaN;
    const nextExecMinAway = Number.isFinite(nextExecMs) ? Math.round((nextExecMs - Date.now()) / 60000) : null;

    // `nextExec` is the authoritative signal, not the gap between runs. A long
    // gap with a valid future nextExec is Make pacing itself and needs no help;
    // acting on the gap alone would restart a perfectly healthy scenario.
    const scheduledOk = nextExecMinAway !== null && nextExecMinAway > -5 && nextExecMinAway <= MAKE_STALE_MIN;
    const runningOk = lastRunMinAgo === null || lastRunMinAgo <= MAKE_STALE_MIN;
    if (sc.isActive && (scheduledOk || runningOk)) {
      // Alive is not the same as working.
      //
      // Between 2026-07-30 and 2026-08-15 this scenario ran every 15 minutes,
      // on schedule, with a valid nextExec and an empty DLQ — and drafted
      // nothing at all, because a filter rejected every lead (contacts stopped
      // carrying the [AIDEAZZ-FORM] stamp after a swallowed HubSpot 409). Every
      // liveness signal said HEALTHY for 16 days while real leads went dark.
      //
      // So ask the question liveness cannot answer: is it producing? A run that
      // does real work costs more than one operation (1 = the trigger alone),
      // and the only trustworthy witness that leads actually arrived is our own
      // cover log. No covers means a genuinely quiet inbox — that is not a fault
      // and must never alert.
      //
      // And a run that ERRORS still burns operations, so counting operations
      // alone is not enough either: on 2026-08-15 the Anthropic module failed
      // ("credit balance is too low") and the run reported ops=2, which would
      // have read as perfectly productive. Only a clean run counts.
      const producedRecently = rows.some(l => (l.operations ?? 0) > 1 && l.status !== MAKE_STATUS_ERROR);
      const missed = coversSince(Date.now() - 24 * 60 * 60 * 1000);

      // An errored run names its own cause, and that cause is usually something
      // only Elena can clear (credits, a revoked key). Surfacing the message beats
      // any guess we could make from the outside.
      const lastError = rows.find(l => l.status === MAKE_STATUS_ERROR && l.error);
      const errMinAgo = lastError?.timestamp
        ? Math.round((Date.now() - Date.parse(lastError.timestamp)) / 60000)
        : null;
      // Only complain if nothing has succeeded SINCE the error. Alerting purely
      // because an error sits inside the window would keep crying wolf for hours
      // after Elena has already fixed the cause (topping up credits, say).
      const recoveredSince =
        !!lastError &&
        rows.some(
          l =>
            l.status !== MAKE_STATUS_ERROR &&
            (l.operations ?? 0) > 1 &&
            Date.parse(l.timestamp) > Date.parse(lastError.timestamp),
        );
      if (lastError && !recoveredSince && errMinAgo !== null && errMinAgo <= 6 * 60) {
        const msg = String(lastError.error?.message || 'unknown error').slice(0, 300);
        const mod = lastError.error?.causeModule?.appName || 'a module';
        /**
         * An empty Anthropic balance is a KNOWN state, not breaking news.
         *
         * Elena decided on Aug 19 2026 to leave Make's Anthropic module in place
         * and top it up when she has the money; drafting moved to Oracle's own
         * five-provider chain the same day, so this error costs her nothing. It
         * will therefore be true continuously for as long as the balance is zero.
         * Repeating it every six hours trains her to swipe the concierge's alerts
         * away — which is precisely how a real one gets missed. Once a day, and
         * worded as the accepted state it is.
         */
        const isCredit = /credit balance|too low|billing|purchase credits/i.test(msg);
        const cooldown = isCredit ? CREDIT_ALERT_COOLDOWN_MS : MAKE_ALERT_COOLDOWN_MS;
        const lastAt = isCredit ? lastCreditAlertAt : lastMakeAlertAt;
        if (Date.now() - lastAt > cooldown) {
          if (isCredit) lastCreditAlertAt = Date.now();
          else lastMakeAlertAt = Date.now();
          await notifyOwners(
            isCredit
              ? `💤 Make is still out of Anthropic credits — and it no longer matters\n\n` +
                  `Make's ${mod} module says:\n"${msg}"\n\n` +
                  `Your leads are NOT waiting on it. Every draft is now written on Oracle ` +
                  `through the 5-provider waterfall (claude → openai → gemini → groq → grok), ` +
                  `the same one your other products use. Make is optional backup.\n\n` +
                  `Top the balance up whenever you like — nothing is blocked on it.\n` +
                  `You will hear this at most once a day.`
              : `⚠️ Make Lead Concierge is ERRORING\n\n` +
                  `Its last run (${errMinAgo} min ago) failed in ${mod}:\n\n"${msg}"\n\n` +
                  `Leads are reaching the scenario but no draft comes out of it.\n\n` +
                  `https://us2.make.com/938264/scenarios/${scenarioId}/edit\n\n` +
                  `Nothing is lost — I draft for everyone Make misses.`,
          );
        }
        console.error(`[watchdog] MAKE ERRORING — ${lastError.error?.message?.slice(0, 120)}`);
        return { ok: false, lastRunMinAgo, nextExecMinAway, action: 'alerted' };
      }

      if (!producedRecently && missed > 0) {
        const cooled = Date.now() - lastMakeAlertAt > MAKE_ALERT_COOLDOWN_MS;
        if (cooled) {
          lastMakeAlertAt = Date.now();
          await notifyOwners(
            `⚠️ Make runs, but drafts NOTHING\n\n` +
              `The Lead Concierge is on schedule and looks healthy, but not one of its ` +
              `last ${rows.length} runs did real work, while I had to cover ${missed} real ` +
              `lead${missed === 1 ? '' : 's'} in the last 24h.\n\n` +
              `That means leads are reaching Make and being rejected — almost always the ` +
              `filter: contacts must carry [AIDEAZZ-FORM] in their message.\n\n` +
              `https://us2.make.com/938264/scenarios/${scenarioId}/edit\n\n` +
              `Nothing is lost — I draft for everyone Make misses.`,
          );
        }
        console.error(
          `[watchdog] MAKE UNPRODUCTIVE — 0 productive runs in last ${rows.length}, ${missed} leads covered in 24h`,
        );
        return { ok: false, lastRunMinAgo, nextExecMinAway, action: 'alerted' };
      }
      return { ok: true, lastRunMinAgo, nextExecMinAway, action: 'none' };
    }

    const cooled = Date.now() - lastMakeAlertAt > MAKE_ALERT_COOLDOWN_MS;
    if (!cooled) return { ok: false, lastRunMinAgo, nextExecMinAway, action: 'none' };
    lastMakeAlertAt = Date.now();

    // Self-heal. Someone switching it off, or a scheduler left un-armed after an
    // edit, are both cured by a clean stop→start, which recomputes nextExec.
    let action: 'none' | 're-armed' | 'started' | 'alerted' = 'alerted';
    try {
      if (sc.isActive) {
        await api(`/scenarios/${scenarioId}/stop`, 'POST');
        await new Promise(r => setTimeout(r, 3000));
      }
      const started = await api(`/scenarios/${scenarioId}/start`, 'POST');
      if (started.ok) action = sc.isActive ? 're-armed' : 'started';
    } catch {
      /* fall through to the alert — Elena still needs to know */
    }

    const verdict = sc.isActive
      ? `Last execution ${lastRunMinAgo ?? '?'} min ago and no valid next run scheduled.`
      : `The scenario was switched OFF.`;
    await notifyOwners(
      `⚠️ Make Lead Concierge needed help\n\n${verdict}\n` +
        (action === 'alerted'
          ? `I could NOT restart it automatically — please open it:\n`
          : `✅ I restarted it automatically (${action}). It should resume the 15-min cycle.\n`) +
        `https://us2.make.com/938264/scenarios/${scenarioId}/edit\n\n` +
        `Your leads were never at risk — I draft for anyone Make misses within ` +
        `${Math.round(WAIT_MS / 60000)} min.\n\n` +
        `If drafts stay missing, the trigger's polling epoch went stale: right-click ` +
        `the HubSpot module → Choose where to start → From now on → Save.`,
    );
    console.error(`[watchdog] MAKE UNHEALTHY — lastRun=${lastRunMinAgo}min nextExec=${nextExecMinAway}min action=${action}`);
    return { ok: false, lastRunMinAgo, nextExecMinAway, action };
  } catch (e) {
    console.warn('[watchdog] Make health check failed (non-fatal):', (e as Error).message?.slice(0, 90));
    return idle;
  }
}

/**
 * The webhook scenario (returning contacts) is "instant": it has no schedule, so
 * nextExec and run-gap mean nothing for it and checking them would raise false
 * alarms forever. What CAN go wrong is exactly what went wrong with its sibling:
 * switched off, or erroring on every call. Watch those two things only.
 */
export async function checkWebhookScenarioHealth(): Promise<{ ok: boolean; reason: string }> {
  const token = process.env.MAKE_API_TOKEN?.trim();
  const id = process.env.MAKE_CONCIERGE_WEBHOOK_SCENARIO_ID?.trim();
  if (!token || !id) return { ok: true, reason: 'not configured' };
  const base = (process.env.MAKE_API_BASE || 'https://us2.make.com/api/v2').replace(/\/$/, '');
  const api = (p: string) => fetch(`${base}${p}`, { headers: { Authorization: `Token ${token}` } });
  try {
    const sr = await api(`/scenarios/${id}`);
    if (!sr.ok) return { ok: true, reason: 'unreadable' };
    const sc = (JSON.parse(await sr.text()) as any)?.scenario;
    if (!sc) return { ok: true, reason: 'unreadable' };

    const lr = await api(`/scenarios/${id}/logs?pg[limit]=10`);
    const rows = lr.ok ? ((JSON.parse(await lr.text())?.scenarioLogs || []) as any[]) : [];
    const lastError = rows.find(l => l.status === MAKE_STATUS_ERROR && l.error);
    const recovered =
      !!lastError &&
      rows.some(
        l =>
          l.status !== MAKE_STATUS_ERROR &&
          (l.operations ?? 0) > 1 &&
          Date.parse(l.timestamp) > Date.parse(lastError.timestamp),
      );

    if (sc.isActive && !(lastError && !recovered)) return { ok: true, reason: 'healthy' };
    // Same reasoning as the credit alert: this scenario being off is no longer a
    // lead-loss risk now that Oracle drafts at ingest, so it is a daily note.
    if (Date.now() - lastWebhookAlertAt < CREDIT_ALERT_COOLDOWN_MS) return { ok: false, reason: 'cooling down' };
    lastWebhookAlertAt = Date.now();

    const why = !sc.isActive
      ? 'It is switched OFF.'
      : `Its last run failed in ${lastError.error?.causeModule?.appName || 'a module'}:\n\n"${String(
          lastError.error?.message || '',
        ).slice(0, 250)}"`;
    await notifyOwners(
      `⚠️ Make webhook concierge needs attention\n\n` +
        `This is the scenario that answers people ALREADY in HubSpot who fill the form again.\n\n${why}\n\n` +
        `https://us2.make.com/938264/scenarios/${id}/edit\n\n` +
        `Nothing is lost — I still draft for anyone it misses.`,
    );
    console.error(`[watchdog] WEBHOOK SCENARIO UNHEALTHY — ${why.slice(0, 120)}`);
    return { ok: false, reason: why.slice(0, 120) };
  } catch (e) {
    console.warn('[watchdog] webhook scenario check failed (non-fatal):', (e as Error).message?.slice(0, 90));
    return { ok: true, reason: 'check failed' };
  }
}

/**
 * The drafting rules live in concierge-prompt.ts and are pushed into Make. A Make
 * blueprint can also be edited in the UI, where nothing would ever tell us the
 * copies had diverged — the failure mode that made three copies feel dangerous in
 * the first place. So re-read the live prompts and say so if one has drifted.
 */
export async function checkPromptDrift(): Promise<{ checked: number; drifted: string[] }> {
  const token = process.env.MAKE_API_TOKEN?.trim();
  const out = { checked: 0, drifted: [] as string[] };
  if (!token) return out;
  const base = (process.env.MAKE_API_BASE || 'https://us2.make.com/api/v2').replace(/\/$/, '');
  const ids = [
    process.env.MAKE_CONCIERGE_SCENARIO_ID?.trim() || '5633833',
    process.env.MAKE_CONCIERGE_WEBHOOK_SCENARIO_ID?.trim(),
  ].filter(Boolean) as string[];
  try {
    const { CONCIERGE_RULES, extractRules } = await import('./concierge-prompt.js');
    for (const id of ids) {
      const r = await fetch(`${base}/scenarios/${id}/blueprint`, { headers: { Authorization: `Token ${token}` } });
      if (!r.ok) continue;
      const bp = (JSON.parse(await r.text()) as any)?.response?.blueprint;
      const msg = (bp?.flow || []).find((m: any) => m.id === 3)?.mapper?.messages?.[0]?.content;
      if (typeof msg !== 'string') continue;
      out.checked++;
      if (extractRules(msg) !== CONCIERGE_RULES.trim()) out.drifted.push(id);
    }
    if (out.drifted.length && Date.now() - lastDriftAlertAt > MAKE_ALERT_COOLDOWN_MS) {
      lastDriftAlertAt = Date.now();
      await notifyOwners(
        `⚠️ A Make concierge prompt has drifted\n\n` +
          `Scenario ${out.drifted.join(', ')} no longer matches the rules in the repo, so Make and I would ` +
          `answer the same person differently.\n\n` +
          `Fix: npm run make:sync-prompts -- --apply`,
      );
      console.error(`[watchdog] PROMPT DRIFT in scenario(s) ${out.drifted.join(', ')}`);
    }
  } catch (e) {
    console.warn('[watchdog] prompt drift check failed (non-fatal):', (e as Error).message?.slice(0, 90));
  }
  return out;
}

let lastWebhookAlertAt = 0;
let lastDriftAlertAt = 0;
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
    const sweep = () => {
      void checkMakeHealth();
      void checkWebhookScenarioHealth();
      void checkPromptDrift();
    };
    makeTimer = setInterval(sweep, 15 * 60 * 1000);
    setTimeout(sweep, 60_000);
    console.log(
      `🔎 Make monitor started — liveness (stale after ${MAKE_STALE_MIN} min), productivity, ` +
        `webhook scenario, and prompt drift`,
    );
  }
}
