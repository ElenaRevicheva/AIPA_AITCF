#!/usr/bin/env node
/**
 * One-off completion for Be Luxe Real Estate — stage-manual-prospect.cjs crashed with a
 * HubSpot 500 on note creation (transient), after Company/Contact/Deal already existed.
 * Finishes: Note, Task, deal<->company, deal<->contact associations. Uses the draft/email
 * files + registry entry that were already written to disk by the earlier run.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  buildDualChannelNoteLinks,
  formatPhone507,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const OWNER = env.match(/^HUBSPOT_OWNER_ID=(.+)$/m)?.[1]?.trim() || '91612860';

const COMPANY_ID = '57298965810';
const CONTACT_ID = '240103550046';
const DEAL_ID = '63526545680';
const SLUG = 'be-luxe-real-estate';
const COMPANY = 'Be Luxe Real Estate';
const DOMAIN = 'beluxerealestate.com';
const SCORE = 60;
const PHONE = '50766534655';
const EMAIL = 'info@beluxerealestate.com';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

async function hs(method, p, body) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const draft = fs.readFileSync(path.join(root, `docs/selling/drafts/${SLUG}.txt`), 'utf8').trim();
  const emailDraft = fs.readFileSync(path.join(root, `docs/selling/drafts/${SLUG}-email.txt`), 'utf8').trim();
  const [, subject, , , ...rest] = emailDraft.split('\n');
  const emailBody = rest.join('\n').replace(/^NOTE:.*\n\n?/, '').trim();

  const dualLinks = buildDualChannelNoteLinks(PHONE, EMAIL, draft, COMPANY, SCORE, SLUG);
  const phoneFmt = formatPhone507(PHONE);

  const noteHtml = [
    `[CLIENT-MANUAL] ${COMPANY} — AI Visibility outreach (https links; data verified live)`,
    '',
    dualLinks,
    '',
    '--- MENSAJE WhatsApp (plain text) ---',
    '',
    escHtml(draft),
    '',
    '--- EMAIL (mismo texto que el link aipa@ de arriba — backup si el link se trunca) ---',
    '',
    `<b>⚠️ TO UNVERIFIED</b> — fallback <code>info@${escHtml(DOMAIN)}</code>; confirm before Send.`,
    `SUBJECT: ${escHtml(subject.replace(/^SUBJECT:\s*/, ''))}`,
    `TO: ${escHtml(EMAIL)}`,
    '',
    escHtml(emailBody),
    '',
    '--- Audit (verified live) ---',
    `${SCORE}/100 Grade C | Tech 86 | AI Access 86 | GEO 56 | AEO 25 (AEO weakest)`,
    '',
    `Angle: "invisible as citable answer". Money query: ¿cuál es la mejor inmobiliaria de lujo en Costa del Este Panamá?`,
    '',
    `Top fixes: (1) Server-renderizar o prerenderizar el sitio (hoy invisible para IA), (2) Organization/RealEstateAgent JSON-LD, (3) un solo H1 claro.`,
    '',
    `Contacts: WhatsApp ${phoneFmt} | ${EMAIL} (UNVERIFIED) | ${DOMAIN}`,
    '',
    'Next: Click WhatsApp OR aipa@ email one-click (prefilled → Send). If WA is a bot → use email. After send, say "sent Be Luxe Real Estate" so follow-up task is created (+4 days).',
  ].join('<br>');

  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${DEAL_ID}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);

  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send outreach → ${COMPANY} (WhatsApp + email ready)`,
      hs_task_body: `1) Open deal note → WhatsApp link → Send. 2) Or ENVIAR POR EMAIL — aipa@ → ${EMAIL} (UNVERIFIED — confirm). Say "sent ${COMPANY}" after WA (creates +4d follow-up); email one-click auto-advances + follow-up.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: OWNER,
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${DEAL_ID}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);

  await hs('PUT', `/crm/v4/objects/deals/${DEAL_ID}/associations/contacts/${CONTACT_ID}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
  ]);
  await hs('PUT', `/crm/v4/objects/deals/${DEAL_ID}/associations/companies/${COMPANY_ID}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 },
  ]);

  const pack = `# [CLIENT-MANUAL] ${COMPANY} — HubSpot note pack

> Staged ${new Date().toISOString().slice(0, 10)}. Deal: \`[CLIENT-MANUAL] ${COMPANY} — GEO/AEO fix (audit: ${SCORE}/C)\` (ID ${DEAL_ID}).
> Draft: \`docs/selling/drafts/${SLUG}.txt\`
> Email one-click: \`https://webhook.aideazz.xyz/cto/go/outreach-email/${SLUG}\` (from aipa@aideazz.xyz)
> ⚠️ Email \`${EMAIL}\` is UNVERIFIED fallback — confirm before send.

Deal **${DEAL_ID}** | Company **${COMPANY_ID}** | Contact **${CONTACT_ID}** | Note **${note.id}** | Send task **${task.id}**
`;
  fs.writeFileSync(path.join(root, 'docs/selling/prospects/BE_LUXE_REAL_ESTATE.md'), pack, 'utf8');

  console.log(JSON.stringify({ ok: true, dealId: DEAL_ID, companyId: COMPANY_ID, contactId: CONTACT_ID, noteId: note.id, taskId: task.id }, null, 2));
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
