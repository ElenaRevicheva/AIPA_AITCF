#!/usr/bin/env node
/**
 * stage-atuona-contact.cjs — Atuona AI Film Studio contacts (festivals, curators, galleries) → HubSpot.
 *
 * Same send path as stage-partner-trailer.cjs: the email draft file + a registry row, so the
 * deal note's button opens /go/outreach-email/<slug> and sends from aipa@aideazz.xyz via Resend
 * (reply-to is Elena's Gmail). The send moves the deal to "Sent", stamps the note, closes the
 * "Send …" task and books the follow-up on its own.
 *
 * The letters are hand-written per person (the draft file IS the letter), so this script never
 * generates text. Data: docs/selling/atuona-contacts.json. Research and tiers:
 * docs/selling/2026-09-24_ATUONA_PEOPLE_TO_CONTACT.md.
 *
 * Usage: node scripts/stage-atuona-contact.cjs [--dry-run]
 * Idempotent: a contact whose deal name already exists is skipped (registry refreshed).
 * Oracle reads the registry from its own disk — scp the draft and MERGE the row there afterwards.
 */
const fs = require('fs');
const path = require('path');
const { registerOutreachSlug, buildOutreachEmailUrl } = require('./wa-link-lib.cjs');
const { hubspotKey, hubspotOwnerId, hubspotBase } = require('./hs-env.cjs');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const KEY = hubspotKey();
const OWNER = hubspotOwnerId();
const HS = hubspotBase();
if (!KEY && !dryRun) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const assoc = (from, fromId, to, toId, typeId) =>
  hs('PUT', `/crm/v4/objects/${from}/${fromId}/associations/${to}/${toId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId },
  ]);

const CONTACTS = JSON.parse(fs.readFileSync(path.join(root, 'docs/selling/atuona-contacts.json'), 'utf8')).contacts;

(async () => {
  const out = [];
  for (const c of CONTACTS) {
    const who = `${c.firstname} ${c.lastname}`;
    const dealName = `[ATUONA-ART] ${c.company} — ${who} — ${c.purpose || 'film submission'}`;
    const raw = fs.readFileSync(path.join(root, c.draft), 'utf8');
    const to = (raw.match(/^TO:\s*(.+)$/m) || [])[1]?.trim();
    if (to !== c.email) throw new Error(`${c.slug}: draft TO (${to}) ≠ data email (${c.email})`);
    const body = raw.replace(/^(TO|SUBJECT|CC):.*$/gm, '').trim();
    const oneClick = buildOutreachEmailUrl(c.slug);
    if (dryRun) {
      out.push({ slug: c.slug, dealName, to, oneClick });
      continue;
    }

    const found = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: dealName }] }],
      properties: ['dealname'],
      limit: 1,
    });
    if (found.total > 0) {
      const dealId = found.results[0].id;
      registerOutreachSlug(c.slug, '', c.draft, c.company, { email: c.email, emailDraft: c.draft, dealId });
      out.push({ slug: c.slug, dealId, skipped: 'deal exists — registry refreshed' });
      continue;
    }

    const companyId = await hs('POST', '/crm/v3/objects/companies', {
      properties: { name: c.company, domain: c.domain, website: `https://${c.domain}` },
    }).then((r) => r.id);
    const existing = await hs('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: c.email }] }],
      limit: 1,
    });
    const contactId =
      existing.total > 0
        ? existing.results[0].id
        : await hs('POST', '/crm/v3/objects/contacts', {
            properties: { email: c.email, firstname: c.firstname, lastname: c.lastname, jobtitle: c.jobtitle, company: c.company },
          }).then((r) => r.id);
    const dealId = await hs('POST', '/crm/v3/objects/deals', {
      properties: { dealname: dealName, dealstage: 'qualifiedtobuy', pipeline: 'default', hubspot_owner_id: OWNER },
    }).then((r) => r.id);
    await assoc('deals', dealId, 'companies', companyId, 5);
    await assoc('deals', dealId, 'contacts', contactId, 3);

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const noteHtml = [
      `<b>🎬 ATUONA-ART — ${esc(who)}, ${esc(c.company)}</b>`,
      '',
      `<a href="${oneClick}"><b>✉️ ENVIAR POR EMAIL — one click from aipa@aideazz.xyz</b></a>`,
      '(opens a preview page → one button → sent. Replies go to your Gmail. The deal then moves to Sent and a follow-up task appears.)',
      '',
      `To: ${esc(c.email)} · Subject: ${esc(c.subject)}`,
      `Ask: ${esc(c.ask)}`,
      `Address source: ${esc(c.emailSource)}`,
      '',
      '--- EMAIL ---',
      esc(body),
      '',
      'Tiers + order of moves: docs/selling/2026-09-24_ATUONA_PEOPLE_TO_CONTACT.md',
    ].join('<br>');
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
    });
    await assoc('notes', note.id, 'deals', dealId, 214);

    const due = new Date();
    due.setHours(23, 59, 0, 0);
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `Send Atuona letter → ${who} (one click, aipa@)`,
        hs_task_body: 'Open the deal note → ✉️ ENVIAR POR EMAIL → review → send. The send closes this task and books the follow-up.',
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH',
        hs_timestamp: due.toISOString(),
        hubspot_owner_id: OWNER,
      },
    });
    await assoc('tasks', task.id, 'deals', dealId, 216);

    registerOutreachSlug(c.slug, '', c.draft, c.company, { email: c.email, emailDraft: c.draft, dealId });
    out.push({ slug: c.slug, dealId, companyId, contactId, noteId: note.id, taskId: task.id, oneClick });
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
