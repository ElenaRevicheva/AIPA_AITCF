/**
 * Web-chat concierge — HubSpot live chat → Telegram (+ the SAME Fable 5 draft
 * path the portfolio UTM form already uses).
 *
 * Why (July 27 2026): Elena installed HubSpot chat on aideazz.xyz. A visitor
 * (marinakulaginabowen@gmail.com) wrote in and the message landed ONLY in the
 * HubSpot Inbox — no Telegram ping, no mail to aipa@. A live-chat reply also never
 * reaches the visitor by email: it lives in the widget session, so if they close
 * the tab the answer is lost. A chat nobody sees is worse than no chat.
 *
 * What this does, every POLL_MS:
 *   1. reads new INCOMING visitor messages from the Conversations API
 *   2. pings Elena on Telegram immediately (raw message + email + thread link)
 *   3. pushes the visitor into HubSpot through pushLeadToHubSpot with
 *      aideazz_lead_kind=portfolio_inquiry — the exact stamp the form uses, so
 *      Make's Contacts/Created watch fires Fable 5 and drops the draft in Telegram
 *
 *   4. sends the visitor the same acknowledgment pair the form sends (their
 *      "We received your inquiry" + the aipa@ copy that lands in Zoho)
 *
 * It does NOT draft the reply — Make does, and its draft carries the ✅ Send
 * button that actually sends and produces the HubSpot Email activity + ENTREGADO
 * stamp. This module is the instant "someone is on your site" ping.
 *
 * What it deliberately does NOT do:
 *   - never writes into the conversation
 *   - never touches /marketing/inquiry or its state; separate module, separate
 *     state file, own try/catch. If this throws, the form path is unaffected.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.env.CTO_AIPA_ROOT || process.cwd();
const STATE_PATH = path.join(REPO_ROOT, 'data/chat-concierge-state.json');
const POLL_MS = Number(process.env.CHAT_CONCIERGE_POLL_MS ?? 3 * 60 * 1000);
const INBOX_URL = 'https://app.hubspot.com/live-messages/51409153';
/** Ignore anything older than this on first run, so a fresh deploy doesn't replay history. */
const MAX_AGE_MS = Number(process.env.CHAT_CONCIERGE_MAX_AGE_MS ?? 24 * 60 * 60 * 1000);
/**
 * How many failed identity lookups before we accept a chat visitor is anonymous.
 * 10 strikes ≈ 30 min at the 3-min poll — long enough for someone who types their
 * message first and their email a moment later, short enough that a visitor who
 * never identifies stops costing HubSpot calls for the rest of the day.
 */
const IDENTITY_MAX_STRIKES = Number(process.env.CHAT_CONCIERGE_IDENTITY_STRIKES ?? 10);

type State = {
  seen: string[];
  /**
   * Identity we have ALREADY resolved for a thread, kept per thread.
   *
   * HubSpot hands us the identity as `associatedContactId`, and that id can stop
   * resolving mid-conversation: it points at the chat VISITOR record, and any
   * later recreate of the underlying contact leaves the thread referencing an id
   * that now 404s. Our own force-recreate of allowlisted test inboxes does
   * exactly that, which is how Elena's Aug 19 session produced an alert saying
   * "(no email captured yet)" for a visitor whose email we had resolved for the
   * previous message in the same thread two minutes earlier.
   *
   * Remembering it per thread costs nothing and carries no wrong-recipient risk:
   * a thread is one conversation with one person, so reusing the identity we
   * already proved for it cannot attach a message to somebody else.
   */
  threadEmails?: Record<string, { email: string; name?: string }>;
  /** Threads already pushed to HubSpot — one conversation is ONE deal, however
   * many messages the visitor sends. The first live run created three deals for
   * Irinsa's three lines; Elena needs one prospect, not a deal per sentence. */
  pushedThreads?: string[];
  /**
   * Threads alerted while still anonymous, waiting for an identity.
   *
   * Visitors type the message FIRST and leave their email a moment later, so the
   * poll that catches the message often sees no contact yet (proven live July 27:
   * thread 11024960536 was alerted at 16:02 with no email, and
   * kiravelerevich@gmail.com only appeared afterwards). Without this the message
   * is marked seen and the lead never reaches the CRM.
   */
  pendingIdentity?: { threadId: string; firstSeen: string; strikes?: number }[];
  lastRunAt?: string;
};

function readState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
    return {
      seen: Array.isArray(s.seen) ? s.seen.slice(-500) : [],
      pushedThreads: Array.isArray(s.pushedThreads) ? s.pushedThreads.slice(-200) : [],
      pendingIdentity: Array.isArray(s.pendingIdentity) ? s.pendingIdentity.slice(-100) : [],
      ...(s.lastRunAt ? { lastRunAt: s.lastRunAt } : {}),
    };
  } catch {
    return { seen: [], pushedThreads: [], pendingIdentity: [] };
  }
}

function writeState(s: State): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify(
        {
          seen: s.seen.slice(-500),
          pushedThreads: (s.pushedThreads || []).slice(-200),
          pendingIdentity: (s.pendingIdentity || []).slice(-100),
          lastRunAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.warn('[chat-concierge] state write failed:', (e as Error).message?.slice(0, 80));
  }
}

async function hs(p: string): Promise<any> {
  const key = process.env.HUBSPOT_API_KEY?.trim();
  if (!key) throw new Error('HUBSPOT_API_KEY missing');
  const r = await fetch(`https://api.hubapi.com${p}`, { headers: { Authorization: `Bearer ${key}` } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 140)}`);
  return t ? JSON.parse(t) : null;
}

async function telegramToOwners(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const ids = (process.env.TELEGRAM_AUTHORIZED_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!token || !ids.length) {
    console.warn('[chat-concierge] TELEGRAM_BOT_TOKEN / TELEGRAM_AUTHORIZED_USERS missing — alert skipped');
    return;
  }
  for (const id of ids) {
    try {
      const { tgSafeText } = await import('./tg-text.js');
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Chat visitors write with emoji constantly; slicing one in half made the
        // Bot API reject the whole alert. Sanitise before sending.
        body: JSON.stringify({ chat_id: id, text: tgSafeText(text, 4090), disable_web_page_preview: true }),
      });
      // This send used to ignore its own response entirely, so a rejected alert
      // was indistinguishable from a delivered one — silence on both sides.
      if (!r.ok) {
        console.error(`[chat-concierge] telegram send REJECTED ${r.status}: ${(await r.text()).slice(0, 160)}`);
      }
    } catch (e) {
      console.warn('[chat-concierge] telegram send failed:', (e as Error).message?.slice(0, 80));
    }
  }
}

type VisitorMessage = {
  messageId: string;
  threadId: string;
  text: string;
  email: string | null;
  name: string | null;
  createdAt: string;
};

/** HubSpot seeds every new inbox with a sample thread — never treat it as a lead. */
function isHubSpotSample(m: VisitorMessage): boolean {
  return (
    (m.email || '').endsWith('@hubspot.com') ||
    /any new chats will appear here|send a test chat/i.test(m.text)
  );
}

async function collectNewVisitorMessages(state: State): Promise<VisitorMessage[]> {
  const threads = await hs('/conversations/v3/conversations/threads?limit=25');
  const cutoff = Date.now() - MAX_AGE_MS;
  const out: VisitorMessage[] = [];

  for (const th of threads?.results || []) {
    const latest = Date.parse(th.latestMessageTimestamp || th.createdAt || '');
    if (Number.isFinite(latest) && latest < cutoff) continue;

    const msgs = await hs(`/conversations/v3/conversations/threads/${th.id}/messages?limit=20`);
    for (const msg of msgs?.results || []) {
      if (msg.type !== 'MESSAGE' || msg.direction !== 'INCOMING') continue;
      if (!msg.id || state.seen.includes(String(msg.id))) continue;
      const created = Date.parse(msg.createdAt || '');
      if (Number.isFinite(created) && created < cutoff) {
        state.seen.push(String(msg.id)); // old — mark seen, never alert
        continue;
      }
      const sender = (msg.senders || [])[0] || {};
      let email =
        sender?.deliveryIdentifier?.type === 'HS_EMAIL_ADDRESS' ? String(sender.deliveryIdentifier.value) : null;
      let name = sender?.name ? String(sender.name) : null;

      // Chat messages carry no email on the sender — HubSpot puts the identity on
      // the thread's associatedContactId (verified on Elena's live threads).
      if ((!email || !name) && th.associatedContactId) {
        try {
          const c = await hs(
            `/crm/v3/objects/contacts/${th.associatedContactId}?properties=email,firstname,lastname`,
          );
          email = email || c?.properties?.email || null;
          name =
            name ||
            [c?.properties?.firstname, c?.properties?.lastname].filter(Boolean).join(' ').trim() ||
            null;
        } catch {
          /* identity is a bonus — the alert goes out either way */
        }
      }

      /**
       * Fall back to the identity this thread already proved.
       *
       * The lookup above silently returns nothing when the thread's contact id
       * no longer resolves, and a null email is not the same as an anonymous
       * visitor — it produces an alert claiming "no email captured yet" about
       * somebody we can already reach. Remember what we learn, and reuse it for
       * later messages in the same conversation.
       */
      const known = state.threadEmails?.[String(th.id)];
      if (!email && known?.email) {
        email = known.email;
        name = name || known.name || null;
        console.log(`[chat-concierge] thread ${th.id}: contact id no longer resolves — reusing known identity ${email}`);
      } else if (email) {
        state.threadEmails = state.threadEmails || {};
        state.threadEmails[String(th.id)] = { email, ...(name ? { name } : {}) };
      }

      out.push({
        messageId: String(msg.id),
        threadId: String(th.id),
        text: String(msg.text || '').trim(),
        email,
        name,
        createdAt: msg.createdAt || new Date().toISOString(),
      });
    }
  }
  return out;
}

/**
 * Same HubSpot shape the portfolio form produces, so the Make → Fable 5 → Telegram
 * scenario treats a chat lead exactly like a form lead. Only `source` differs, so
 * the channel stays attributable.
 */
async function pushChatLeadToHubSpot(m: VisitorMessage): Promise<{ contactId: string | null; dealId: string | null } | null> {
  const { pushLeadToHubSpot } = await import('./hubspot-client.js');
  const firstName = (m.name || m.email || 'there').split(/[\s@]/)[0];
  const res = await pushLeadToHubSpot({
    name: m.name || m.email || 'Web chat visitor (aideazz.xyz)',
    email: m.email || '',
    ...(m.text ? { message: m.text } : {}),
    source: 'aideazz_web_chat',
    sourcePrefix: 'CLIENT-CTO-INQUIRY',
    painPoint: `Web chat on aideazz.xyz: ${m.text.slice(0, 400)}`,
    sourceUrl: 'https://aideazz.xyz',
    draftSubject: 'Re: your message on aideazz.xyz',
    draftBody: [
      `Hi ${firstName},`,
      ``,
      `Thanks for writing on aideazz.xyz — I saw your message:`,
      `"${m.text.slice(0, 400)}"`,
      ``,
      `Happy to answer properly here by email so nothing gets lost in the chat window.`,
      ``,
      `Elena`,
      `https://aideazz.xyz/portfolio`,
    ].join('\n'),
    stage: 'appointmentscheduled',
    crmMeta: {
      source: 'aideazz_web_chat',
      pipeline: 'client',
      type: 'inquiry',
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      atlas_concept_id: null,
    },
  } as any);
  return res ? { contactId: res.contactId, dealId: res.dealId } : null;
}

/**
 * Drafting is Make's job, deliberately (Elena, July 27 2026).
 *
 * A locally generated draft was tried and removed: it arrived ~12 minutes earlier
 * but as plain text she could not act on, while Make's Fable 5 draft lands with the
 * ✅ Send button that actually sends the reply and produces the HubSpot Email
 * activity + ENTREGADO stamp. Two drafts for one message was noise, so this module
 * now only pings — Make owns the reply.
 *
 * The chat push stamps [AIDEAZZ-FORM] via pushLeadToHubSpot, which is exactly what
 * Make's filter watches, so chat leads enter the same concierge cycle as the form.
 */

/**
 * Same acknowledgment pair the portfolio form sends (July 27 2026, Elena's call):
 *   → visitor: "We received your inquiry — AIdeazz"
 *   → aipa@aideazz.xyz: "[AIdeazz] Inquiry — {name}" (this is what lands in Zoho)
 *
 * A chat visitor who leaves an email currently gets nothing back, so from their
 * side the message vanished. Fires once per conversation — it is called only on
 * the push, which the one-deal-per-thread guard already limits to once.
 */
function sendVisitorAck(m: VisitorMessage): void {
  if (!m.email) return;
  try {
    void import('./marketing-notify.js').then(({ scheduleMarketingInquiryEmails }) => {
      scheduleMarketingInquiryEmails(`chat-${m.threadId}`, {
        ...(m.name ? { name: m.name } : {}),
        contactEmail: m.email as string,
        ...(m.text ? { message: m.text } : {}),
        utm_source: 'aideazz_web_chat',
        page_url: 'https://aideazz.xyz/portfolio',
      });
      console.log(`[chat-concierge] acknowledgment queued for ${m.email} (+ team copy to aipa@)`);
    });
  } catch (e) {
    console.warn('[chat-concierge] acknowledgment failed:', (e as Error).message?.slice(0, 90));
  }
}

/**
 * Draft fallback for RETURNING visitors — the case Make cannot serve.
 *
 * Make's trigger is HubSpot "Watch CRM Objects → Contacts CREATED". A person who
 * is already a contact only gets UPDATED by our push, so no event fires and no
 * draft is ever produced. Proven July 27 2026: Malina Choke wrote on July 16 (new
 * contact → draft sent) and again today through the chat bubble (existing contact
 * → silence). Returning prospects are the most valuable ones; they cannot be the
 * ones who get ignored.
 *
 * So: brand-new contact → Make drafts, exactly as before, nothing changes here.
 * Existing contact → we draft and POST to /concierge/draft ourselves, which
 * produces the identical Telegram card with the ✅ Send button, the same Resend
 * send path, the same HubSpot Email activity and ENTREGADO stamp.
 *
 * Never both: the caller only invokes this when the contact existed beforehand.
 */
/**
 * Hand a chat visitor to Make, the same way the form path hands over a returning
 * contact.
 *
 * Make's polling trigger only ever sees contacts it watched being CREATED, so a
 * chat visitor who is already in HubSpot — or who simply sends a second message
 * in an open thread — is invisible to it. Posting to the webhook scenario closes
 * that hole, so "Make drafts every inbound lead" is true for the chat bubble too
 * and not only for the form.
 *
 * Returns false when the webhook is not configured or does not accept the lead,
 * and the caller then drafts locally — Make is preferred, never required.
 */
async function postToMakeWebhook(m: VisitorMessage): Promise<boolean> {
  const hook = process.env.MAKE_CONCIERGE_WEBHOOK_URL?.trim();
  if (!hook || !m.email) return false;
  try {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: m.email,
        name: m.name || '',
        firstname: (m.name || '').split(/\s+/)[0] || '',
        message: m.text,
        inquiry: m.text,
        aideazz_lead_kind: 'portfolio_inquiry',
        source: 'aideazz_web_chat',
        reused_contact: true,
      }),
    });
    console.log(`[chat-concierge] Make concierge webhook → ${r.status} for ${m.email}`);
    return r.ok;
  } catch (e) {
    console.warn('[chat-concierge] Make webhook failed:', (e as Error).message?.slice(0, 90));
    return false;
  }
}

/**
 * Give Fable 5 first shot on chat too — without stalling the poll loop.
 *
 * The chat bubble had no precedence at all: it posted to Make and drafted
 * locally in the same breath, so Oracle answered in ~2.6s against Make's poll
 * and won every time. On 22 Aug 2026 Elena topped the Anthropic balance up,
 * watched the form path correctly hand its lead to Fable 5, then tested the
 * bubble and got "Draft (claude, 2603ms)" — the local writer again. Make never
 * lost that race; it was never in it.
 *
 * The form path (cto-aipa.ts) solves this by AWAITING a grace window, which is
 * safe there because it handles one inquiry per request. This runs inside a
 * for-loop over every unread visitor message, so an inline sleep would hold
 * back everyone queued behind the current visitor — including the second pass
 * that resolves anonymous threads. So: schedule, do not sleep.
 *
 * If the process restarts inside the grace the timer dies with it, and the
 * registerLeadWatch above still covers the lead at 20 minutes — the same
 * backstop every chat lead already has. Fails toward drafting NOW whenever the
 * verdict is missing or negative, because a duplicate collapses on the
 * person+message fingerprint and a silence does not.
 */
async function draftAfterMakeGrace(m: VisitorMessage): Promise<void> {
  let verdict = { can: false, reason: 'verdict unavailable' };
  try {
    const { makeCanDraft } = await import('./concierge-watchdog.js');
    verdict = makeCanDraft();
  } catch (e) {
    console.warn('[chat-concierge] verdict read failed:', (e as Error).message?.slice(0, 80));
  }

  const graceMs = Number(process.env.CONCIERGE_MAKE_GRACE_MIN ?? 5) * 60 * 1000;
  if (!verdict.can || graceMs <= 0) {
    console.log(`[chat-concierge] drafting now — Make cannot: ${verdict.reason}`);
    await postFallbackDraft(m);
    return;
  }

  console.log(
    `[chat-concierge] Make looks able to draft (${verdict.reason}) — holding ` +
      `${Math.round(graceMs / 60000)} min so Fable 5 gets first shot for ${m.email}`,
  );
  const t = setTimeout(() => {
    void postFallbackDraft(m).catch(e =>
      console.warn('[chat-concierge] deferred draft failed:', (e as Error).message?.slice(0, 90)),
    );
  }, graceMs);
  t.unref?.();
}

async function postFallbackDraft(m: VisitorMessage): Promise<boolean> {
  const secret = process.env.CONCIERGE_SECRET?.trim();
  if (!secret || !m.email) return false;
  const base = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');

  /**
   * No LLM call here — post the lead and let /concierge/draft write it.
   *
   * This was the last of the four copies of the drafting logic, and the most
   * out of date: a two-provider chain opening on a hard-coded `claude-opus-5`,
   * exactly what produced empty drafts once the Anthropic balance emptied. The
   * endpoint now owns drafting for every caller on the full five-provider
   * `quality` chain.
   */
  try {
    const body = new URLSearchParams({
      email: m.email,
      name: m.name || '',
      inquiry: m.text,
    });
    const r = await fetch(`${base}/concierge/draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) {
      console.warn(`[chat-concierge] /concierge/draft returned ${r.status}`);
      return false;
    }
    console.log(`[chat-concierge] fallback draft posted for returning contact ${m.email} (Make cannot fire)`);
    return true;
  } catch (e) {
    console.warn('[chat-concierge] fallback draft post failed:', (e as Error).message?.slice(0, 90));
    return false;
  }
}

export async function pollChatOnce(
  opts: { dryRun?: boolean } = {},
): Promise<{ found: number; alerted: number; pushed: number; skipped: number }> {
  const dry = !!opts.dryRun;
  const state = readState();
  const result = { found: 0, alerted: 0, pushed: 0, skipped: 0 };
  let messages: VisitorMessage[] = [];
  try {
    messages = await collectNewVisitorMessages(state);
  } catch (e) {
    console.warn('[chat-concierge] poll failed:', (e as Error).message?.slice(0, 120));
    return result;
  }
  result.found = messages.length;

  for (const m of messages) {
    state.seen.push(m.messageId);
    if (!m.text || isHubSpotSample(m)) {
      result.skipped++;
      continue;
    }
    // 1. Alert first — this must survive any CRM failure.
    const alert = [
      `💬 New chat message on aideazz.xyz`,
      ``,
      m.name ? `👤 ${m.name}` : null,
      m.email ? `📧 ${m.email}` : `📧 (no email captured yet)`,
      ``,
      `💬 They wrote:`,
      `"${m.text.slice(0, 900)}"`,
      ``,
      m.email
        ? `✍️ Draft with the ✅ Send button follows (~15 min).`
        : `⚠️ No email yet — answer in the chat while their tab is still open. If they leave one, I'll ping you again.`,
      ``,
      `Reply here: ${INBOX_URL}/inbox/${m.threadId}`,
      m.email ? `Or by email: ${m.email}` : null,
    ]
      .filter(l => l !== null)
      .join('\n');
    if (dry) {
      console.log(`\n----- WOULD SEND TO TELEGRAM -----\n${alert}\n----------------------------------`);
      result.alerted++;
      result.skipped++;
      continue; // dry run must not touch HubSpot or the seen-state
    }
    await telegramToOwners(alert);
    result.alerted++;

    // 1b. This visitor is owed a draft — register it BEFORE the branching below.
    //     Make is still the primary drafter and nothing here competes with it;
    //     the watchdog only acts if Make produces nothing at all. This placement
    //     matters: the `already in HubSpot` branch below pushes nothing, so
    //     Make's Contacts/CREATED trigger can never fire for a follow-up message
    //     in an open thread — that is exactly how July 29's chat went unanswered.
    if (m.email) {
      try {
        const { registerLeadWatch } = await import('./concierge-watchdog.js');
        registerLeadWatch({ email: m.email, name: m.name, text: m.text, source: 'web_chat' });
      } catch (e) {
        console.warn('[chat-concierge] watchdog register failed:', (e as Error).message?.slice(0, 80));
      }
    }

    // 2. CRM push — isolated; a failure here never blocks the alert above.
    //    ONE deal per conversation: later messages in the same thread still alert
    //    (with a fresh draft) but must not spawn another deal for the same person.
    const alreadyPushed = (state.pushedThreads || []).includes(m.threadId);
    if (m.email && !alreadyPushed) {
      try {
        // Decide BEFORE the push: a contact that already exists will only be
        // updated, so Make's Contacts/CREATED watch will never see it. Test
        // inboxes are force-recreated by pushLeadToHubSpot, so Make does fire
        // for them — they must not get our fallback on top.
        const { findContactByEmail, isConciergeTestEmail } = await import('./hubspot-client.js');
        const existedBefore = await findContactByEmail(m.email).catch(() => null);
        const makeWillFire = !existedBefore || isConciergeTestEmail(m.email);

        const hsRes = await pushChatLeadToHubSpot(m);
        if (hsRes?.dealId) {
          result.pushed++;
          state.pushedThreads = [...(state.pushedThreads || []), m.threadId];
          console.log(`[chat-concierge] HubSpot lead from web chat: ${m.email} (deal ${hsRes.dealId})`);
          sendVisitorAck(m);
          // Everyone goes to the real-time webhook, new or returning. The polling
          // scenario runs on a low-priority Make plan with observed multi-hour
          // gaps, so relying on it for a brand-new visitor meant they waited
          // longer than a returning one. Polling stays on as backup, and
          // /concierge/draft dedupes on person+message so both firing is safe.
          /**
           * Draft unconditionally. Make's 200 is NOT evidence it will answer.
           *
           * This used to read "if Make refused it, draft it ourselves" — and
           * Make's webhook endpoint returns 200 even when the scenario behind
           * it is switched off, which scenario 5953877 has been since Aug 15
           * 2026. So `r.ok` was true, the fallback never ran, and every chat
           * lead silently waited 20 minutes for the watchdog instead. A queue
           * that accepts your message and never reads it looks exactly like one
           * that works.
           *
           * The endpoint dedupes on person+message, so drafting here costs
           * nothing when Make does eventually answer — the second one collapses.
           */
          await postToMakeWebhook(m);
          await draftAfterMakeGrace(m);
          if (makeWillFire) {
            console.log(`[chat-concierge] new contact — polling scenario may also see ${m.email} (deduped)`);
          }
        }
      } catch (e) {
        console.warn('[chat-concierge] HubSpot push failed:', (e as Error).message?.slice(0, 100));
      }
    } else if (m.email && alreadyPushed) {
      // One deal per conversation, but every message still deserves an answer.
      // This branch pushes nothing to HubSpot, so Make's CREATED watch can never
      // see it — July 29's follow-up message went unanswered for exactly this
      // reason. Hand it to the webhook scenario, and draft locally if that fails.
      console.log(`[chat-concierge] thread ${m.threadId} already in HubSpot — no second deal, drafting reply`);
      // Same reasoning as above: Make's 200 proves delivery, never an answer.
      await postToMakeWebhook(m);
      await draftAfterMakeGrace(m);
    } else if (!m.email && !alreadyPushed) {
      // Anonymous for now — remember the thread and pick the identity up later.
      const pend = state.pendingIdentity || [];
      if (!pend.some(p => p.threadId === m.threadId)) {
        state.pendingIdentity = [...pend, { threadId: m.threadId, firstSeen: new Date().toISOString() }];
        console.log(`[chat-concierge] thread ${m.threadId} has no email yet — will re-check for identity`);
      }
    }
  }

  // Second pass: threads alerted while anonymous. The visitor usually leaves an
  // email seconds later, long after their message was marked seen.
  const stillPending: { threadId: string; firstSeen: string; strikes?: number }[] = [];
  for (const p of state.pendingIdentity || []) {
    if ((state.pushedThreads || []).includes(p.threadId)) continue; // resolved elsewhere
    if (Date.now() - Date.parse(p.firstSeen) > MAX_AGE_MS) {
      console.log(`[chat-concierge] thread ${p.threadId} stayed anonymous — giving up on identity`);
      continue;
    }
    // A visitor who never leaves an email costs one failed lookup per poll for a
    // whole day. Thread 11034113718 ("Хочу тебя", July 29 2026) burned 399 of
    // them. HubSpot's thread field is named associatedContactId but for an
    // anonymous chat it holds a VISITOR id (actor type VISITOR, verified via
    // /conversations/v3/conversations/actors) — /crm/v3/objects/contacts/{id}
    // can NEVER resolve it, so retrying is pure waste against the rate limit.
    if ((p.strikes ?? 0) >= IDENTITY_MAX_STRIKES) {
      console.log(
        `[chat-concierge] thread ${p.threadId} — ${p.strikes} failed identity lookups, visitor is anonymous; no longer re-checking`,
      );
      continue;
    }
    try {
      const th = await hs(`/conversations/v3/conversations/threads/${p.threadId}`);
      if (!th?.associatedContactId) {
        stillPending.push({ ...p, strikes: (p.strikes ?? 0) + 1 });
        continue;
      }
      const c = await hs(
        `/crm/v3/objects/contacts/${th.associatedContactId}?properties=email,firstname,lastname`,
      );
      const email = c?.properties?.email;
      if (!email) {
        stillPending.push({ ...p, strikes: (p.strikes ?? 0) + 1 });
        continue;
      }
      const msgs = await hs(`/conversations/v3/conversations/threads/${p.threadId}/messages?limit=20`);
      const firstIncoming = (msgs?.results || []).find(
        (x: any) => x.type === 'MESSAGE' && x.direction === 'INCOMING' && String(x.text || '').trim(),
      );
      const m2: VisitorMessage = {
        messageId: String(firstIncoming?.id || p.threadId),
        threadId: p.threadId,
        text: String(firstIncoming?.text || '').trim(),
        email,
        name: [c?.properties?.firstname, c?.properties?.lastname].filter(Boolean).join(' ').trim() || null,
        createdAt: firstIncoming?.createdAt || p.firstSeen,
      };
      if (dry) {
        console.log(`[chat-concierge] (dry) would now push late identity ${email} for thread ${p.threadId}`);
        stillPending.push({ ...p, strikes: (p.strikes ?? 0) + 1 });
        continue;
      }
      // Same rule as the first pass — a returning contact needs our fallback draft.
      const { findContactByEmail, isConciergeTestEmail } = await import('./hubspot-client.js');
      const existedBefore = await findContactByEmail(email).catch(() => null);
      const makeWillFire = !existedBefore || isConciergeTestEmail(email);
      const hsRes = await pushChatLeadToHubSpot(m2);
      if (hsRes?.dealId) {
        result.pushed++;
        state.pushedThreads = [...(state.pushedThreads || []), p.threadId];
        console.log(
          `[chat-concierge] late identity resolved — HubSpot lead ${email} (deal ${hsRes.dealId}, thread ${p.threadId})`,
        );
        sendVisitorAck(m2);
        if (!makeWillFire) await postFallbackDraft(m2);
        try {
          const { registerLeadWatch } = await import('./concierge-watchdog.js');
          registerLeadWatch({ email, name: m2.name, text: m2.text, source: 'web_chat_late_identity' });
        } catch {
          /* the alert below still goes out */
        }
        await telegramToOwners(
          `📧 Email captured for an earlier chat\n\n👤 ${m2.name || email}\n📧 ${email}\n\n"${m2.text.slice(0, 400)}"\n\nNow in HubSpot — you can reply by email.`,
        );
      } else {
        stillPending.push({ ...p, strikes: (p.strikes ?? 0) + 1 });
      }
    } catch (e) {
      // Log the first strike only. A 404 here is the normal, expected shape of
      // "anonymous visitor", not an incident — repeating it every poll buried
      // real errors under 399 identical lines on July 29 2026.
      if ((p.strikes ?? 0) === 0) {
        console.warn('[chat-concierge] identity re-check failed:', (e as Error).message?.slice(0, 90));
      }
      stillPending.push({ ...p, strikes: (p.strikes ?? 0) + 1 });
    }
  }
  state.pendingIdentity = stillPending;

  if (!dry) writeState(state); // a dry run must leave the queue untouched
  if (result.found) {
    console.log(
      `[chat-concierge] found=${result.found} alerted=${result.alerted} pushed=${result.pushed} skipped=${result.skipped}`,
    );
  }
  return result;
}

let timer: NodeJS.Timeout | null = null;

export function startChatConcierge(): void {
  if (timer) return;
  if (!process.env.HUBSPOT_API_KEY?.trim()) {
    console.warn('[chat-concierge] HUBSPOT_API_KEY missing — web chat watcher not started');
    return;
  }
  // First pass shortly after boot, then on the interval.
  setTimeout(() => void pollChatOnce(), 20_000);
  timer = setInterval(() => void pollChatOnce(), POLL_MS);
  console.log(`💬 Web chat concierge started (poll every ${Math.round(POLL_MS / 1000)}s → Telegram + HubSpot)`);
}
