#!/usr/bin/env node
/**
 * hs-lazarus-followup.cjs — write the post-call follow-up for Rohit Gupta (Turing /
 * Lazarus) onto the meeting deal as a note with a tappable mailto link, plus a
 * chase task.
 *
 * Context: the 24 Aug call established the codebase is not a fit for the
 * acquisition side (Lazarus buys businesses whose value is team collaboration
 * data + revenue outcomes; this work is solo-built). Rohit asked for a document
 * he can pass to colleagues working with businesses that may want the data. The
 * non-exclusive model-training licence offer from the 21 Aug reply stands.
 *
 * The mailto body is capped at 1800 chars by sliceWaText — a longer one gets
 * silently truncated by some mobile mail clients, which is the failure mode this
 * script refuses to ship: it aborts rather than send half a sentence.
 *
 * Usage: node scripts/hs-lazarus-followup.cjs [--dry-run]
 */
'use strict';

const { hubspotKey, hubspotBase, hubspotOwnerId } = require('./hs-env.cjs');

const dryRun = process.argv.includes('--dry-run');

const DEAL_ID = '64227273846'; // [HIRING-VJH-LEAD] Invitation … Rohit Gupta @ Turing
const CONTACT_ID = '243300108188'; // Rohit Gupta · rohit.g@turing.com
const TO = 'rohit.g@turing.com';
const CC = 'lazarus@turingcentral.com'; // keeps the Lazarus programme thread in the loop
const DOC_URL = 'https://webhook.aideazz.xyz/doc/nine-systems';

const SUBJECT = 'Following up on today’s call — the systems document, and the licence';

const BODY = `Hi Rohit,

Thank you for the time today.

So you can correct me if I have it wrong, here is my understanding: Lazarus acquires businesses where the value sits in team collaboration data and revenue outcomes — several engineers working together, results tied to a P&L. My work is solo-built and does not carry that shape, so it is not a fit on the acquisition side. Have I understood you correctly?

Your suggestion made sense, so I built the document. Nine production AI systems: what each one is, why I built it, the design decisions behind it, the repo, the live link, and what it does in production. Every figure in it was read from the running systems on the day it was written.

${DOC_URL}

The offer is unchanged from my 21 August note: a non-exclusive licence to a copy of source I solely own, for model-training use. I retain copyright, the brand, the domains, and the right to keep operating, improving and selling it. Production systems, CRM, chat logs, keys and any third-party or client material are out of scope. AIdeazz AI Lab keeps running.

I will be direct about the timing. I have been building without compensation and cannot keep doing it for free. I am looking for a serious role, and since Turing places engineers I would welcome being considered — AI-augmented product engineering, LLM orchestration with provider failover, agent systems running unattended in production, GEO/AEO. Contract work equally.

If a colleague's business needs training data of this shape, or needs someone who builds this class of system, the document is yours to forward.

Best regards,
Elena Revicheva
AIdeazz AI Lab · Panama City
https://aideazz.xyz/portfolio`;

// sliceWaText would silently cut at 1800; refuse instead so nothing half-written ships.
if (BODY.length > 1800) {
  console.error(`ABORT: body is ${BODY.length} chars, mailto cap is 1800. Trim it.`);
  process.exit(1);
}

const KEY = hubspotKey();
if (!KEY && !dryRun) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function hs(method, path, body) {
  const res = await fetch(hubspotBase() + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

// mailto carries the cc so one tap keeps both threads. Built here rather than via
// buildHubSpotMailtoAnchor: that helper hardcodes `?subject=` straight after the
// address, so smuggling a cc into the address yields two `?` in one URL and mail
// clients drop everything after the second one.
const mailtoUrl =
  `mailto:${TO}` + // left unencoded: %40 in the path trips some mobile mail clients
  `?cc=${encodeURIComponent(CC)}` +
  `&subject=${encodeURIComponent(SUBJECT)}` +
  `&body=${encodeURIComponent(BODY)}`;
const mailtoAnchor = `<a href="${mailtoUrl.replace(/&/g, '&amp;')}"><b>➡️ TAP TO SEND — follow-up to Rohit (${TO}, cc Lazarus)</b></a>`;

const noteBody = [
  '<b>[LAZARUS FOLLOW-UP] Post-call — 24 Aug 2026</b>',
  '',
  mailtoAnchor,
  '',
  `<b>Document (unlisted, noindex — safe to forward):</b><br><a href="${DOC_URL}">${DOC_URL}</a>`,
  '',
  '<i><b>Call outcome as Elena understood it:</b> codebase is not a fit for the Lazarus acquisition side — they buy businesses whose value is team collaboration data plus business revenue outcomes; this work is solo-built. Rohit asked for a document he can share with colleagues working with businesses that may need the data. The follow-up states that understanding explicitly and asks him to correct it.</i>',
  '',
  '<i><b>Offer standing (from the 21 Aug reply):</b> non-exclusive licence to a copy of solely-owned source, for model-training use. Copyright, brand, domains and right to operate retained. Production systems, CRM, chat logs, keys, third-party/client material out of scope.</i>',
  '',
  '--- EMAIL (subject + body, for copy/paste) ---',
  `<b>SUBJECT:</b> ${esc(SUBJECT)}`,
  '',
  esc(BODY),
].join('<br>');

(async () => {
  if (dryRun) {
    console.log(`SUBJECT: ${SUBJECT}`);
    console.log(`BODY (${BODY.length} chars):\n${BODY}`);
    console.log(`\nmailto anchor length: ${mailtoAnchor.length}`);
    console.log('DRY RUN — nothing written');
    return;
  }

  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteBody, hs_timestamp: new Date().toISOString() },
    associations: [
      { to: { id: DEAL_ID }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
      { to: { id: CONTACT_ID }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
    ],
  });
  console.log(`note created: ${note.id}`);

  const due = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: '[LAZARUS] Chase Rohit — did colleagues get the systems doc?',
      hs_task_body:
        'Sent the post-call follow-up with the nine-systems document and the standing non-exclusive licence offer. If no reply, ask directly whether any colleague’s business wants training data of this shape, or contract build work.',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: hubspotOwnerId(),
    },
    associations: [
      { to: { id: DEAL_ID }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] },
      { to: { id: CONTACT_ID }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] },
    ],
  });
  console.log(`task created: ${task.id} (due ${due.toISOString().slice(0, 10)})`);
  // Portal id is not optional: /contacts/objects/0-3/<id>/view 404s ("That page is
  // nowhere to be found"). The working shape is /contacts/<portalId>/record/0-3/<id>.
  console.log(`deal: https://app.hubspot.com/contacts/51409153/record/0-3/${DEAL_ID}`);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
