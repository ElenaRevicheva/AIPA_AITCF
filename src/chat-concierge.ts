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
 * What it deliberately does NOT do:
 *   - never writes into the conversation
 *   - never emails the visitor (no auto-reply without Elena's word)
 *   - never touches /marketing/inquiry or its state; separate module, separate
 *     state file, own try/catch. If this throws, the form path is unaffected.
 *
 * Known limit, identical to the form: Make fires on Contacts/CREATED, so a repeat
 * visitor whose email is already a contact gets no Fable draft until
 * MAKE_CONCIERGE_WEBHOOK_URL is set on Oracle (it is not, as of today). The
 * Telegram alert in step 2 fires regardless — that is the part that never fails.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.env.CTO_AIPA_ROOT || process.cwd();
const STATE_PATH = path.join(REPO_ROOT, 'data/chat-concierge-state.json');
const POLL_MS = Number(process.env.CHAT_CONCIERGE_POLL_MS ?? 3 * 60 * 1000);
const INBOX_URL = 'https://app.hubspot.com/live-messages/51409153';
/** Ignore anything older than this on first run, so a fresh deploy doesn't replay history. */
const MAX_AGE_MS = Number(process.env.CHAT_CONCIERGE_MAX_AGE_MS ?? 24 * 60 * 60 * 1000);

type State = {
  seen: string[];
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
  pendingIdentity?: { threadId: string; firstSeen: string }[];
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
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text: text.slice(0, 4096), disable_web_page_preview: true }),
      });
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
 * The reply draft, generated here rather than in Make.
 *
 * The form path relies on Make's Contacts/CREATED watch to trigger Fable 5. That
 * can never fire for web chat: HubSpot creates the contact itself the moment the
 * visitor leaves an email (verified — Irinsa's contact predates her chat by two
 * weeks). So the draft is produced locally through the fleet's resilience chain
 * (Claude → Groq → Gemini), which matters because the Anthropic key is dry.
 *
 * If MAKE_CONCIERGE_WEBHOOK_URL is ever set, Make owns the draft again and this
 * returns null — Elena must never receive two different drafts for one message.
 */
async function draftReply(m: VisitorMessage): Promise<string | null> {
  if (process.env.MAKE_CONCIERGE_WEBHOOK_URL?.trim()) return null;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const { claudeWithGroqFallback } = await import('./llm-resilience.js');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });
    const first = (m.name || m.email || 'there').split(/[\s@]/)[0];
    const system =
      'You are Elena Revicheva writing a short first reply to someone who just messaged the chat on her site ' +
      'aideazz.xyz. Elena is an AI engineer in Panama who installs an AI Growth Operator for service businesses ' +
      '(AI search visibility, prospect research, outreach, follow-up, WhatsApp qualification, CRM, daily briefing). ' +
      'Rules: warm and direct, max 90 words, no bullet lists, no marketing adjectives, never promise results, ' +
      'answer what they actually asked, end by offering a 15-minute call. Reply in the language they wrote in. ' +
      'Output only the message body, no subject line, no signature.';
    const userPrompt = `Their message: "${m.text}"\nTheir name: ${first}`;
    try {
      const text = await claudeWithGroqFallback(anthropic, 'claude-opus-5', 400, system, userPrompt, 'chat-concierge/draft');
      if (text?.trim()) return text.trim();
    } catch (e) {
      // claudeWithGroqFallback only falls back on credit exhaustion / dead model —
      // an invalid or missing key (401) rethrows, which would silently cost the
      // draft. A prospect waiting is worth one more attempt on a live provider.
      console.warn('[chat-concierge] Claude path failed:', (e as Error).message?.slice(0, 90));
    }

    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (groqKey) {
      try {
        const { groqModel } = await import('./llm-resilience.js');
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: groqModel(),
            max_tokens: 400,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        if (r.ok) {
          const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
          const t = j.choices?.[0]?.message?.content?.trim();
          if (t) return t;
        }
      } catch (e) {
        console.warn('[chat-concierge] Groq draft failed:', (e as Error).message?.slice(0, 90));
      }
    }

    try {
      const { geminiComplete } = await import('./llm-resilience.js');
      const t = await geminiComplete(system, userPrompt, 400, 'chat-concierge/draft');
      return t?.trim() ? t.trim() : null;
    } catch {
      return null;
    }
  } catch (e) {
    console.warn('[chat-concierge] draft failed:', (e as Error).message?.slice(0, 100));
    return null;
  }
}

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
    // 1. Alert first — this must survive any CRM or LLM failure.
    const draft = await draftReply(m);
    const alert = [
      `💬 New chat message on aideazz.xyz`,
      ``,
      m.name ? `👤 ${m.name}` : null,
      m.email ? `📧 ${m.email}` : `📧 (no email captured yet)`,
      ``,
      `💬 They wrote:`,
      `"${m.text.slice(0, 900)}"`,
      ...(draft ? [``, `✍️ Draft reply:`, `──────────`, draft, `──────────`] : []),
      ``,
      `Reply here: ${INBOX_URL}/inbox/${m.threadId}`,
      m.email ? `Or by email: ${m.email}` : `⚠️ No email — answer in the chat while their tab is still open.`,
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

    // 2. CRM push — isolated; a failure here never blocks the alert above.
    //    ONE deal per conversation: later messages in the same thread still alert
    //    (with a fresh draft) but must not spawn another deal for the same person.
    const alreadyPushed = (state.pushedThreads || []).includes(m.threadId);
    if (m.email && !alreadyPushed) {
      try {
        const hsRes = await pushChatLeadToHubSpot(m);
        if (hsRes?.dealId) {
          result.pushed++;
          state.pushedThreads = [...(state.pushedThreads || []), m.threadId];
          console.log(`[chat-concierge] HubSpot lead from web chat: ${m.email} (deal ${hsRes.dealId})`);
          sendVisitorAck(m);
        }
      } catch (e) {
        console.warn('[chat-concierge] HubSpot push failed:', (e as Error).message?.slice(0, 100));
      }
    } else if (m.email && alreadyPushed) {
      console.log(`[chat-concierge] thread ${m.threadId} already in HubSpot — alert only, no second deal`);
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
  const stillPending: { threadId: string; firstSeen: string }[] = [];
  for (const p of state.pendingIdentity || []) {
    if ((state.pushedThreads || []).includes(p.threadId)) continue; // resolved elsewhere
    if (Date.now() - Date.parse(p.firstSeen) > MAX_AGE_MS) {
      console.log(`[chat-concierge] thread ${p.threadId} stayed anonymous — giving up on identity`);
      continue;
    }
    try {
      const th = await hs(`/conversations/v3/conversations/threads/${p.threadId}`);
      if (!th?.associatedContactId) {
        stillPending.push(p);
        continue;
      }
      const c = await hs(
        `/crm/v3/objects/contacts/${th.associatedContactId}?properties=email,firstname,lastname`,
      );
      const email = c?.properties?.email;
      if (!email) {
        stillPending.push(p);
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
        stillPending.push(p);
        continue;
      }
      const hsRes = await pushChatLeadToHubSpot(m2);
      if (hsRes?.dealId) {
        result.pushed++;
        state.pushedThreads = [...(state.pushedThreads || []), p.threadId];
        console.log(
          `[chat-concierge] late identity resolved — HubSpot lead ${email} (deal ${hsRes.dealId}, thread ${p.threadId})`,
        );
        sendVisitorAck(m2);
        await telegramToOwners(
          `📧 Email captured for an earlier chat\n\n👤 ${m2.name || email}\n📧 ${email}\n\n"${m2.text.slice(0, 400)}"\n\nNow in HubSpot — you can reply by email.`,
        );
      } else {
        stillPending.push(p);
      }
    } catch (e) {
      console.warn('[chat-concierge] identity re-check failed:', (e as Error).message?.slice(0, 90));
      stillPending.push(p);
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
