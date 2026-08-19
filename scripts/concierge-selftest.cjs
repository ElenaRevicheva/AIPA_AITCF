#!/usr/bin/env node
/**
 * concierge-selftest.cjs — prove the lead pipeline end to end, on demand.
 *
 * Why this exists (Aug 19 2026): the pipeline had been "a total mess" for four
 * days and there was no way to ask it whether it worked. Every probe Elena or I
 * sent said the word TEST in the message body, the drafting rules correctly
 * answer `SPAM — no reply needed` to anything that reads like a test, and the
 * endpoint drops spam quietly. So a healthy pipeline and a dead one produced the
 * identical observable: nothing in Telegram. Four days of "0 drafts for a bunch
 * of nonsense reasons" were partly that.
 *
 * The fix is not to weaken the spam rule — it is the rule that keeps junk out of
 * her phone. It is to send a realistic inquiry (which the model answers like any
 * other) and carry the "this is a drill" flag OUT OF BAND, in a form field only
 * our own code reads. The model's judgement is untouched; the card is labelled
 * 🧪 and the reply is never mailed to anyone.
 *
 * Usage:
 *   node scripts/concierge-selftest.cjs            # full path incl. HubSpot
 *   node scripts/concierge-selftest.cjs --draft    # drafting only, no CRM write
 *
 * Exit code 0 = pass, 1 = fail. Safe to run from cron.
 */

require('dotenv').config();

const BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const SECRET = (process.env.CONCIERGE_SECRET || '').trim();
const DRAFT_ONLY = process.argv.includes('--draft');

/**
 * Realistic prospect wording, on purpose.
 *
 * Reads as a genuine buyer with a concrete problem, because that is the only
 * input that exercises branch (A) of the rules. The stamp that makes it a drill
 * never appears in this text — see the `selftest` field below.
 */
const CANARY = {
  name: 'Daniel Ortega',
  emailPrefix: 'concierge-canary',
  inquiry:
    'Hola Elena, I run a dental clinic in Panama City and most of our new patients come from Google. ' +
    'A friend told me people are starting to ask ChatGPT for clinic recommendations instead and we do not ' +
    'show up there at all. Is that something you can look at, and roughly what would it cost to start?',
};

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body is itself the finding */
  }
  return { status: r.status, text, json };
}

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\n🧪 Concierge self-test → ${BASE}\n`);
  if (!SECRET) {
    console.error('CONCIERGE_SECRET missing — cannot authenticate to /concierge/draft');
    process.exit(1);
  }

  const email = `${CANARY.emailPrefix}-${Date.now()}@test.aideazz.xyz`;

  // 1. The waterfall must produce a card without any draft text supplied — this
  //    is the exact call shape Make can no longer make, and the one that proves
  //    Oracle is self-sufficient.
  const t0 = Date.now();
  const res = await post('/concierge/draft', {
    email,
    name: CANARY.name,
    inquiry: CANARY.inquiry,
    selftest: '1',
  });
  const ms = Date.now() - t0;

  record('endpoint reachable + authorised', res.status !== 401 && res.status !== 503, `HTTP ${res.status}`);
  record('drafted without claude_output (5-LLM waterfall)', res.status === 200, `${ms}ms · ${res.text.slice(0, 120)}`);

  const j = res.json || {};
  record('a Telegram card was produced', !!j.id, j.id ? `draft ${j.id}` : `response: ${res.text.slice(0, 120)}`);
  if (j.spam) record('model did NOT rule the canary spam', false, 'rules need softer canary wording');
  if (j.dropped) record('draft not dropped as auto-import noise', false, String(j.dropped));
  if (j.unresolved) record('recipient resolved', false, 'draft arrived but recipient was ambiguous');

  // 2. Idempotency — the property that lets Make, the watchdog and the inline
  //    path all fire at one lead without three cards landing on her phone.
  if (!DRAFT_ONLY && j.id) {
    const dupe = await post('/concierge/draft', {
      email,
      name: CANARY.name,
      inquiry: CANARY.inquiry,
      selftest: '1',
    });
    record(
      'duplicate suppressed (redundant drafters collapse)',
      !!(dupe.json && dupe.json.duplicate),
      dupe.text.slice(0, 120),
    );
  }

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${failed.length === 0 ? '✅ PASS' : `❌ FAIL (${failed.length})`} — ${checks.length} checks, ${ms}ms to first card\n`);

  // Report to Telegram so a cron run is visible without reading logs. Failures
  // always speak; a pass speaks only when asked, so the daily drill is silent
  // while healthy and loud the moment it is not.
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = (process.env.CONCIERGE_TG_CHAT || '').trim();
  if (token && chat && (failed.length > 0 || process.argv.includes('--notify'))) {
    const body =
      failed.length === 0
        ? `✅ Concierge self-test PASSED — ${checks.length} checks, first card in ${ms}ms.\nEvery inbound lead gets a draft.`
        : `❌ Concierge self-test FAILED — ${failed.length}/${checks.length} checks broke:\n\n` +
          failed.map(f => `• ${f.name}${f.detail ? `\n   ${f.detail}` : ''}`).join('\n') +
          `\n\nInbound leads may be going unanswered.`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: body, disable_web_page_preview: true }),
    }).catch(() => {});
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('self-test threw:', e);
  process.exit(1);
});
