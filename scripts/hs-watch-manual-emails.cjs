#!/usr/bin/env node
/**
 * hs-watch-manual-emails.cjs — auto-advance [CLIENT-MANUAL] deals when HubSpot
 * CRM emails are sent or replied to (no need for Elena to say "emailed").
 *
 * Requires Service Key scopes: sales-email-read (+ deals/contacts/notes/tasks write).
 *
 * Usage:
 *   node scripts/hs-watch-manual-emails.cjs           # process last LOOKBACK_HOURS
 *   node scripts/hs-watch-manual-emails.cjs --dry-run
 *   node scripts/hs-watch-manual-emails.cjs --hours=48
 *
 * Outbound EMAIL on a CLIENT-MANUAL contact → deal → decisionmakerboughtin (⏳ Sent),
 *   append 📧 EMAILED, create +4 day soft follow-up (if none open).
 * INCOMING_EMAIL on a CLIENT-MANUAL contact while deal is in ⏳ Sent → contractsent
 *   (💬 They replied), complete open follow-up tasks.
 *
 * State file (processed email ids): docs/selling/.hs-manual-email-watcher-state.json
 * Install on Oracle (optional): cron every 10 min.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const STATE_PATH = path.join(root, 'docs/selling/.hs-manual-email-watcher-state.json');
const KEY = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) {
  console.error('HUBSPOT_API_KEY missing in .env');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const hoursArg = process.argv.find((a) => a.startsWith('--hours='));
const LOOKBACK_HOURS = hoursArg ? Number(hoursArg.split('=')[1]) : 72;

const HS = 'https://api.hubapi.com';
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const STAGE_SENT = 'decisionmakerboughtin';
const STAGE_REPLIED = 'contractsent';
const STAGE_ACT = 'qualifiedtobuy';

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { processedEmailIds: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { processedEmailIds: {} };
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function companyFromDealName(name) {
  const m = String(name || '').match(/\[CLIENT-MANUAL\]\s+(.+?)\s+—/);
  return m ? m[1].trim() : 'Prospect';
}

async function latestDealNote(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  let best = null;
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    if (!best || (n.properties?.hs_timestamp || '') > (best.properties?.hs_timestamp || '')) best = n;
  }
  return best;
}

async function openFollowUpTasks(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const open = [];
  for (const id of ids) {
    const t = await hs(
      'GET',
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status,hs_timestamp`,
    );
    const subj = t.properties?.hs_task_subject || '';
    const status = t.properties?.hs_task_status || '';
    if (status !== 'COMPLETED' && /follow-up/i.test(subj)) open.push(t);
  }
  return open;
}

async function createFollowUpTask(dealId, company, channelLabel) {
  const due = new Date();
  due.setDate(due.getDate() + 4);
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Soft follow-up ${channelLabel} → ${company} (no reply yet?)`,
      hs_task_body: `Auto-created by hs-watch-manual-emails. If still silent, soft 1–2 line follow-up. If they replied, cancel and use 💬 path. Deal ${dealId}`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_timestamp: due.toISOString(),
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);
  return { id: task.id, due: due.toISOString().slice(0, 10) };
}

async function manualDealsForContact(contactId) {
  const assoc = await hs('GET', `/crm/v4/objects/contacts/${contactId}/associations/deals`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const d = await hs('GET', `/crm/v3/objects/deals/${id}?properties=dealname,dealstage`);
    const name = d.properties?.dealname || '';
    if (name.includes('[CLIENT-MANUAL]')) out.push(d);
  }
  return out;
}

async function processOutbound(email, deal, state) {
  const emailId = email.id;
  const subject = email.properties?.hs_email_subject || '(no subject)';
  const to = email.properties?.hs_email_to_email || '';
  const when = (email.properties?.hs_timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const company = companyFromDealName(deal.properties?.dealname);
  const stage = deal.properties?.dealstage;
  const actions = [];

  if (dryRun) {
    console.log('DRY outbound', { emailId, dealId: deal.id, company, stage, subject, to });
    return;
  }

  if (stage !== STAGE_SENT) {
    await hs('PATCH', `/crm/v3/objects/deals/${deal.id}`, {
      properties: { dealstage: STAGE_SENT },
    });
    actions.push(`stage→${STAGE_SENT}`);
  }

  const note = await latestDealNote(deal.id);
  if (note) {
    const body = note.properties?.hs_note_body || '';
    if (!body.includes(`Email object: ${emailId}`) && !body.includes(`📧 EMAILED ${when}`)) {
      const add =
        `<br><br>📧 EMAILED ${when} via HubSpot UI` +
        (to ? ` → ${to}` : '') +
        `<br>Subject: ${subject}` +
        `<br>Email object: ${emailId} (auto-detected by hs-watch-manual-emails).`;
      await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, {
        properties: { hs_note_body: body + add },
      });
      actions.push(`note📧`);
    }
  }

  const openFu = await openFollowUpTasks(deal.id);
  let fu = openFu[0];
  if (!fu) {
    fu = await createFollowUpTask(deal.id, company, 'email/WA');
    if (note) {
      const n2 = await hs('GET', `/crm/v3/objects/notes/${note.id}?properties=hs_note_body`);
      await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, {
        properties: {
          hs_note_body:
            (n2.properties?.hs_note_body || '') +
            `<br>📅 Follow-up task <b>${fu.id}</b> due <b>${fu.due}</b> (soft if still silent).`,
        },
      });
    }
    actions.push(`follow-up:${fu.id}`);
  }

  state.processedEmailIds[emailId] = {
    at: new Date().toISOString(),
    kind: 'outbound',
    dealId: deal.id,
    actions,
  };
  console.log('OUTBOUND', deal.id, company, actions.join(', ') || 'noop');
}

async function processInbound(email, deal, state) {
  const emailId = email.id;
  const subject = email.properties?.hs_email_subject || '(no subject)';
  const when = (email.properties?.hs_timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const company = companyFromDealName(deal.properties?.dealname);
  const stage = deal.properties?.dealstage;
  const actions = [];

  if (dryRun) {
    console.log('DRY inbound', { emailId, dealId: deal.id, company, stage, subject });
    return;
  }

  // Only auto-promote from passive wait (or still in I Act TODAY if they emailed first).
  if (stage === STAGE_SENT || stage === STAGE_ACT) {
    await hs('PATCH', `/crm/v3/objects/deals/${deal.id}`, {
      properties: { dealstage: STAGE_REPLIED },
    });
    actions.push(`stage→${STAGE_REPLIED}`);
  }

  for (const t of await openFollowUpTasks(deal.id)) {
    await hs('PATCH', `/crm/v3/objects/tasks/${t.id}`, {
      properties: { hs_task_status: 'COMPLETED' },
    });
    actions.push(`task✓${t.id}`);
  }

  const note = await latestDealNote(deal.id);
  if (note) {
    const body = note.properties?.hs_note_body || '';
    if (!body.includes(`Email object: ${emailId}`)) {
      const add =
        `<br><br>💬 EMAIL REPLY ${when}` +
        `<br>Subject: ${subject}` +
        `<br>Email object: ${emailId} (auto-detected by hs-watch-manual-emails).`;
      await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, {
        properties: { hs_note_body: body + add },
      });
      actions.push('note💬');
    }
  }

  state.processedEmailIds[emailId] = {
    at: new Date().toISOString(),
    kind: 'inbound',
    dealId: deal.id,
    actions,
  };
  console.log('INBOUND', deal.id, company, actions.join(', ') || 'noop');
}

(async () => {
  const state = loadState();
  // Seed already-handled Panama Aesthetics send so we don't double-append.
  if (!state.processedEmailIds['113286576039']) {
    state.processedEmailIds['113286576039'] = {
      at: '2026-07-20T19:10:00.000Z',
      kind: 'outbound',
      dealId: '62873560951',
      actions: ['seeded'],
    };
  }

  const since = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  const emails = await hs('POST', '/crm/v3/objects/emails/search', {
    filterGroups: [
      {
        filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }],
      },
    ],
    properties: [
      'hs_email_subject',
      'hs_email_direction',
      'hs_email_status',
      'hs_email_to_email',
      'hs_email_from_email',
      'hs_timestamp',
    ],
    limit: 50,
    sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
  });

  let scanned = 0;
  let matched = 0;

  for (const email of emails.results || []) {
    scanned += 1;
    if (state.processedEmailIds[email.id]) continue;

    const direction = email.properties?.hs_email_direction || '';
    const isOut = direction === 'EMAIL';
    const isIn = direction === 'INCOMING_EMAIL';
    if (!isOut && !isIn) continue;

    const contactAssoc = await hs('GET', `/crm/v4/objects/emails/${email.id}/associations/contacts`);
    const contactIds = (contactAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    for (const contactId of contactIds) {
      const deals = await manualDealsForContact(contactId);
      if (!deals.length) continue;
      matched += 1;
      for (const deal of deals) {
        if (isOut) await processOutbound(email, deal, state);
        else await processInbound(email, deal, state);
      }
    }
  }

  if (!dryRun) saveState(state);
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        lookbackHours: LOOKBACK_HOURS,
        scanned,
        matchedManual: matched,
        processedTotal: Object.keys(state.processedEmailIds).length,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
