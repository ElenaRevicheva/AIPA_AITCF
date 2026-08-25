#!/usr/bin/env node
/**
 * Stage IntelliOps BD onto HubSpot — the five records Elena acts from.
 *
 * Cloud agents cannot reach api.hubapi.com. Run on Oracle (or a laptop with the
 * Service Key) via scripts/oracle-hs-note-intelliops.sh:
 *
 *   node scripts/hs-note-intelliops-eval.cjs
 *   node scripts/hs-note-intelliops-eval.cjs --dry-run
 *
 * Idempotent: reuses company / contact / deal when they already exist. Will not
 * post a second 25 Aug evaluation note or a duplicate send-task.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase, hubspotOwnerId } = require('./hs-env.cjs');

const DRY = process.argv.includes('--dry-run');
const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'docs/selling/_intelliops_hs_report.json');
const DRAFT = fs.readFileSync(
  path.join(ROOT, 'docs/selling/drafts/intelliops-reply-2026-08-25.txt'),
  'utf8'
);

const TO = 'nishant.chaudhary@intelliopsautomation.com';
const DOMAIN = 'intelliopsautomation.com';
const DEAL_NAME = '[HIRING-MANUAL] BD Expert @ IntelliOps Automation';
const NOTE_MARKER = '[INTELLIOPS BD] 25 Aug 2026';
const TASK_SUBJECT = 'Send IntelliOps reply — four remaining items, do not countersign v2';
const SUBJECT =
  'Re: Revised Business Development Agreement — four remaining items so commission is actually collectable';

const DEAL_DESCRIPTION = [
  'BD commission agreement with IntelliOps Automation (Nishant Chaudhary, Noida).',
  '24 Aug v2 does NOT get countersigned.',
  'Remaining blockers: (1) attribution silence ≠ deemed accepted; (2) NCR sponge;',
  '(3) no USD/Wise rail; (4) 6-month tail vs 30-day termination.',
  'Overlay income, not a job. Send the note email. Do not originate until v3.',
].join(' ');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

const EVAL_BODY = `Nishant sent a 24 Aug revision claiming to close Elena's four points. Reviewed against the PDF.

Closed on paper:
• Entity block (still a trade name — no CIN/GSTIN)
• India / New Delhi law (§22)
• Monthly commission statement (§9)
• 5-day attribution window (§8)

Still blocking pay:
1. Silence after 5 days is not deemed accepted
2. NCR exclusions (pass-through / third-party costs) can hollow the $25k → $5k example
3. No USD / Wise rail; "verification" has no clock
4. 6-month tail vs 30-day termination

Play: overlay on live document-heavy conversations. Not a new cold list. Not a job (no retainer).
Do not countersign v2. Do not originate until v3 has the four remaining items.
Full write-up: docs/selling/INTELLIOPS_BD_EVALUATION.md`;

const NOTE = [
  `<b>${esc(NOTE_MARKER)} — do not countersign v2. Send this reply.</b>`,
  '',
  '<b>NEXT:</b> copy the email below → send to Nishant from Elena (not aipa@).',
  '<b>THEN:</b> say <i>sent IntelliOps</i> so this task closes.',
  '<b>NOT YET:</b> signature, origination, or a second cold list.',
  '',
  `<i>${nl2br(EVAL_BODY)}</i>`,
  '',
  '--- EMAIL (copy from here) ---',
  `<b>TO:</b> ${esc(TO)}`,
  `<b>SUBJECT:</b> ${esc(SUBJECT)}`,
  '',
  nl2br(DRAFT.replace(/^SUBJECT:.*\nTO:.*\n\n/, '')),
].join('<br>');

async function hs(method, p, body) {
  const k = hubspotKey();
  if (!k) throw new Error('HUBSPOT_API_KEY missing');
  const r = await fetch(`${hubspotBase()}${p}`, {
    method,
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) {
    throw new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 400)}`);
  }
  return j;
}

async function searchEq(object, propertyName, value, properties) {
  const j = await hs('POST', `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
    properties,
    limit: 5,
  });
  return j.results || [];
}

async function searchToken(object, propertyName, value, properties) {
  const j = await hs('POST', `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName, operator: 'CONTAINS_TOKEN', value }] }],
    properties,
    limit: 10,
  });
  return j.results || [];
}

async function associate(fromType, fromId, toType, toId, typeId) {
  await hs('PUT', `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId },
  ]);
}

async function dealHasMarkerNote(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean);
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body`);
    const body = n.properties?.hs_note_body || '';
    if (body.includes(NOTE_MARKER)) return id;
  }
  return null;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log('REPORT', REPORT);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const owner = hubspotOwnerId();
  const created = { company: false, contact: false, deal: false, note: false, task: false };

  let companies = await searchEq('companies', 'domain', DOMAIN, ['name', 'domain']);
  if (!companies.length) {
    companies = await searchToken('companies', 'name', 'IntelliOps', ['name', 'domain']);
  }
  let company = companies[0];
  if (!company && !DRY) {
    company = await hs('POST', '/crm/v3/objects/companies', {
      properties: {
        name: 'IntelliOps Automation',
        domain: DOMAIN,
        website: `https://www.${DOMAIN}`,
        city: 'Noida',
        country: 'India',
        description:
          'RPA / AI workflow / IDP shop. Counterparty on Elena BD commission agreement. Trade name on the 24 Aug PDF — no CIN/GSTIN yet. Founder Nishant Chaudhary.',
      },
    });
    created.company = true;
  }
  console.log('company', company ? `${company.id} ${company.properties?.name || ''}` : DRY ? '(would create)' : '(missing)');

  let contacts = await searchEq('contacts', 'email', TO, ['firstname', 'lastname', 'email', 'jobtitle']);
  if (!contacts.length) {
    contacts = await searchToken('contacts', 'email', 'intelliops', ['firstname', 'lastname', 'email']);
  }
  let contact = contacts[0];
  if (!contact && !DRY) {
    contact = await hs('POST', '/crm/v3/objects/contacts', {
      properties: {
        firstname: 'Nishant',
        lastname: 'Chaudhary',
        email: TO,
        company: 'IntelliOps Automation',
        jobtitle: 'Founder',
        website: `https://www.${DOMAIN}`,
        lifecyclestage: 'opportunity',
        hs_lead_status: 'OPEN',
        hubspot_owner_id: owner,
      },
    });
    created.contact = true;
  }
  console.log('contact', contact ? `${contact.id} ${contact.properties?.email || ''}` : DRY ? '(would create)' : '(missing)');

  let deals = await searchToken('deals', 'dealname', 'IntelliOps', ['dealname', 'dealstage', 'pipeline']);
  if (!deals.length) {
    deals = (await searchEq('deals', 'dealname', DEAL_NAME, ['dealname', 'dealstage'])).concat(deals);
  }
  let deal = deals.find((d) => (d.properties.dealname || '').includes('IntelliOps')) || deals[0];
  if (!deal && !DRY) {
    deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname: DEAL_NAME,
        dealstage: 'qualifiedtobuy',
        pipeline: 'default',
        description: DEAL_DESCRIPTION,
        hubspot_owner_id: owner,
      },
    });
    created.deal = true;
  }
  console.log('deal', deal ? `${deal.id} ${deal.properties?.dealname || ''}` : DRY ? '(would create)' : '(missing)');

  if (DRY) {
    const report = {
      ok: true,
      dryRun: true,
      created,
      dealName: DEAL_NAME,
      to: TO,
      noteChars: NOTE.length,
    };
    writeReport(report);
    return;
  }

  if (!deal || !contact || !company) {
    throw new Error('missing company, contact or deal after create');
  }

  await associate('contacts', contact.id, 'companies', company.id, 1);
  await associate('deals', deal.id, 'contacts', contact.id, 3);
  await associate('deals', deal.id, 'companies', company.id, 5);

  let noteId = await dealHasMarkerNote(deal.id);
  if (!noteId) {
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: NOTE, hs_timestamp: new Date().toISOString() },
    });
    noteId = note.id;
    created.note = true;
  }
  await associate('notes', noteId, 'deals', deal.id, 214);
  await associate('notes', noteId, 'contacts', contact.id, 202);
  console.log('note', noteId, created.note ? 'created' : 'reused');

  let tasks = await searchToken('tasks', 'hs_task_subject', 'IntelliOps', [
    'hs_task_subject',
    'hs_task_status',
  ]);
  let task = tasks.find((t) => (t.properties.hs_task_subject || '').includes('IntelliOps reply'));
  if (!task) {
    const due = new Date();
    due.setHours(23, 59, 0, 0);
    task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: TASK_SUBJECT,
        hs_task_body:
          'Open the IntelliOps deal note. Copy the email. Send to Nishant from Elena. Do not sign the 24 Aug PDF. Do not originate until v3. Then say "sent IntelliOps".',
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH',
        hs_timestamp: due.toISOString(),
        hubspot_owner_id: owner,
      },
    });
    created.task = true;
  }
  await associate('tasks', task.id, 'deals', deal.id, 216);
  await associate('tasks', task.id, 'contacts', contact.id, 204);
  console.log('task', task.id, created.task ? 'created' : 'reused');

  writeReport({
    ok: true,
    dryRun: false,
    created,
    companyId: company.id,
    contactId: contact.id,
    dealId: deal.id,
    noteId,
    taskId: task.id,
    dealName: deal.properties?.dealname || DEAL_NAME,
    dealStage: deal.properties?.dealstage || (created.deal ? 'qualifiedtobuy' : undefined),
    to: TO,
    next: 'Open the deal → Notes → copy the email → send. Do not countersign.',
  });
}

main().catch((e) => {
  console.error(e.message || e);
  try {
    writeReport({ ok: false, error: String(e.message || e) });
  } catch {
    /* report is best-effort on failure */
  }
  process.exit(1);
});
