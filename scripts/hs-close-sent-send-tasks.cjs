#!/usr/bin/env node
/**
 * hs-close-sent-send-tasks.cjs — close "Send … email → X" tasks whose letter
 * has demonstrably gone out.
 *
 * Why this exists: stage-hiring-outreach.cjs raises a HIGH send-task, and the
 * one-click path stamped the note and opened the +4-day follow-up but never
 * closed that task. Datastar, 4 Sep: three ENTREGADO stamps on the note and
 * "Send Hiring email → Datastar Pan…" still showing as due today. A board that
 * asks for an action already taken trains its owner to ignore it.
 *
 * src/go-wa.ts now closes the task at send time, so this is the sweep for deals
 * that were already sent before that fix, and a safety net if a send is ever
 * recorded by some other route.
 *
 * The evidence is the note, not our own bookkeeping: a task is only closed when
 * an associated note carries a delivery/send stamp written by the send path or
 * the Resend webhook. No stamp, no close.
 *
 * Usage:
 *   node scripts/hs-close-sent-send-tasks.cjs --deal=64678307604 [--dry-run]
 *   node scripts/hs-close-sent-send-tasks.cjs --all [--dry-run]
 */
'use strict';

const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const DRY = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const dealArg = process.argv.find((a) => a.startsWith('--deal='));
const DEAL_ID = dealArg ? dealArg.split('=')[1].replace(/\D/g, '') : '';

if (!DEAL_ID && !ALL) {
  console.error('usage: node scripts/hs-close-sent-send-tasks.cjs --deal=<id> | --all [--dry-run]');
  process.exit(1);
}

const KEY = hubspotKey();
if (!KEY) {
  console.error('HUBSPOT_API_KEY missing (environment or .env)');
  process.exit(1);
}
const BASE = hubspotBase();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** Deal prefixes that carry a one-click send task. */
const PREFIXES = ['CLIENT-MANUAL', 'CLIENT-ATLAS', 'PARTNER', 'LICENSE', 'HIRING-MANUAL'];

/** Written by src/go-wa.ts (EMAILED) or src/resend-webhook.ts (ENTREGADO/ABIERTO). */
const SENT_STAMP = /📧\s*EMAILED|ENTREGADO|✅\s*SENT|ABIERTO/i;

async function hs(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON is the finding */
  }
  return { ok: r.ok, status: r.status, json, text };
}

async function dealHasSendStamp(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.json?.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body`);
    const body = n.json?.properties?.hs_note_body || '';
    if (SENT_STAMP.test(body)) {
      return SENT_STAMP.exec(body)[0];
    }
  }
  return null;
}

async function openSendTasks(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  const ids = (assoc.json?.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const t = await hs('GET', `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status`);
    const subject = t.json?.properties?.hs_task_subject || '';
    const status = t.json?.properties?.hs_task_status || '';
    if (status === 'COMPLETED') continue;
    // Only the staged send task. The +4-day follow-up must stay open — that one
    // is the reminder that the reply has not arrived yet.
    if (!/^send\b/i.test(subject) || /follow-?up/i.test(subject)) continue;
    out.push({ id, subject, status });
  }
  return out;
}

async function processDeal(dealId, dealName) {
  const stamp = await dealHasSendStamp(dealId);
  if (!stamp) {
    console.log(`  · ${dealId} ${dealName || ''} — no send stamp on any note, leaving tasks alone`);
    return { closed: 0, skipped: 1 };
  }
  const tasks = await openSendTasks(dealId);
  if (!tasks.length) {
    console.log(`  · ${dealId} ${dealName || ''} — sent (${stamp}), no open send task. Nothing to do.`);
    return { closed: 0, skipped: 0 };
  }
  let closed = 0;
  for (const t of tasks) {
    if (DRY) {
      console.log(`  · would close ${t.id} "${t.subject}" (evidence: ${stamp})`);
      continue;
    }
    const r = await hs('PATCH', `/crm/v3/objects/tasks/${t.id}`, {
      properties: { hs_task_status: 'COMPLETED' },
    });
    console.log(`  ${r.ok ? '✓' : '✖'} closed ${t.id} "${t.subject}" (evidence: ${stamp})`);
    if (r.ok) closed++;
  }
  return { closed, skipped: 0 };
}

(async () => {
  console.log(`\n── close sent send-tasks${DRY ? ' (dry run)' : ''}\n`);
  let totals = { closed: 0, skipped: 0, deals: 0 };

  if (DEAL_ID) {
    const d = await hs('GET', `/crm/v3/objects/deals/${DEAL_ID}?properties=dealname,dealstage`);
    if (!d.ok) {
      console.error(`deal ${DEAL_ID} not readable: ${d.text.slice(0, 160)}`);
      process.exit(1);
    }
    console.log(`deal ${DEAL_ID}: ${d.json.properties?.dealname} [${d.json.properties?.dealstage}]`);
    const r = await processDeal(DEAL_ID, d.json.properties?.dealname);
    totals = { closed: r.closed, skipped: r.skipped, deals: 1 };
  } else {
    for (const prefix of PREFIXES) {
      const found = await hs('POST', '/crm/v3/objects/deals/search', {
        filterGroups: [
          { filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] },
        ],
        properties: ['dealname', 'dealstage'],
        limit: 100,
      });
      for (const d of found.json?.results || []) {
        if (!d.properties?.dealname?.includes(`[${prefix}]`)) continue;
        totals.deals++;
        const r = await processDeal(d.id, d.properties.dealname);
        totals.closed += r.closed;
        totals.skipped += r.skipped;
      }
    }
  }

  console.log(
    `\n── deals inspected ${totals.deals} · send tasks closed ${totals.closed} · left alone ${totals.skipped}\n`,
  );
})().catch((e) => {
  console.error('hs-close-sent-send-tasks failed:', e.message);
  process.exit(1);
});
