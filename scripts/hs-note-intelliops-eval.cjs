#!/usr/bin/env node
/**
 * Attach the 25 Aug IntelliOps evaluation + sendable reply onto the HubSpot deal.
 *
 * Cloud agents on the current egress allowlist cannot reach api.hubapi.com.
 * Run locally (laptop or Oracle) where HUBSPOT_API_KEY works:
 *
 *   node scripts/hs-note-intelliops-eval.cjs
 *   node scripts/hs-note-intelliops-eval.cjs --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase, hubspotOwnerId } = require('./hs-env.cjs');

const DRY = process.argv.includes('--dry-run');
const ROOT = path.join(__dirname, '..');
const DRAFT = fs.readFileSync(
  path.join(ROOT, 'docs/selling/drafts/intelliops-reply-2026-08-25.txt'),
  'utf8'
);

const TO = 'nishant.chaudhary@intelliopsautomation.com';
const SUBJECT =
  'Re: Revised Business Development Agreement — four remaining items so commission is actually collectable';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

const EVAL = `Nishant sent a 24 Aug revision claiming to close Elena's four points. Reviewed against the PDF.

Closed on paper: entity block (still a trade name, no CIN/GSTIN); India/New Delhi law; monthly commission statement §9; 5-day attribution window §8.

Still blocking pay:
1. silence after 5 days is not deemed accepted
2. NCR exclusions can hollow the $25k → $5k example
3. no USD/Wise rail + open-ended verification
4. 6-month tail vs 30-day termination

Play: overlay on live document-heavy conversations, not a new cold list. Not a job (no retainer). Do not countersign v2. Do not originate until v3 has the four remaining items.
Full evaluation: docs/selling/INTELLIOPS_BD_EVALUATION.md`;

const NOTE = [
  '<b>[INTELLIOPS BD] 25 Aug 2026 — do not countersign v2. Send this reply.</b>',
  '',
  `<i>${nl2br(EVAL)}</i>`,
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
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || JSON.stringify(j).slice(0, 400)}`);
  }
  return j;
}

async function search(object, propertyName, value, properties) {
  const j = await hs('POST', `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName, operator: 'CONTAINS_TOKEN', value }] }],
    properties,
    limit: 10,
  });
  return j.results || [];
}

async function main() {
  let deals = await search('deals', 'dealname', 'IntelliOps', ['dealname', 'dealstage', 'pipeline']);
  if (!deals.length) deals = await search('deals', 'dealname', 'intelliops', ['dealname', 'dealstage']);
  const contacts = await search('contacts', 'email', 'intelliops', ['firstname', 'lastname', 'email', 'company']);
  const companies = await search('companies', 'name', 'IntelliOps', ['name', 'domain']);

  console.log('deals', deals.map((d) => `${d.id} ${d.properties.dealname}`).join(', ') || '(none)');
  console.log('contacts', contacts.map((c) => `${c.id} ${c.properties.email}`).join(', ') || '(none)');
  console.log('companies', companies.map((c) => `${c.id} ${c.properties.name}`).join(', ') || '(none)');

  if (!deals.length) {
    console.log('No IntelliOps deal found. Create one in HubSpot UI, then re-run.');
    process.exit(2);
  }

  const deal = deals[0];
  const contact = contacts[0];
  const associations = [
    { to: { id: deal.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
  ];
  if (contact) {
    associations.push({
      to: { id: contact.id },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    });
  }

  if (DRY) {
    console.log('DRY RUN — would attach note + HIGH task to deal', deal.id, deal.properties.dealname);
    console.log('Note chars:', NOTE.length);
    return;
  }

  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: NOTE, hs_timestamp: new Date().toISOString() },
    associations,
  });
  console.log('note', note.id);

  const taskAssoc = [
    { to: { id: deal.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] },
  ];
  if (contact) {
    taskAssoc.push({
      to: { id: contact.id },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
    });
  }
  const due = new Date();
  due.setHours(18, 0, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: 'Send IntelliOps reply — four remaining items, do not countersign v2',
      hs_task_body:
        'Copy the email from the deal note (or docs/selling/drafts/intelliops-reply-2026-08-25.txt). Do not sign the 24 Aug PDF. Do not originate until v3 closes deemed attribution, NCR base, USD rail, and 12-month tail.',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: hubspotOwnerId(),
    },
    associations: taskAssoc,
  });
  console.log('task', task.id, 'on deal', deal.id);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
