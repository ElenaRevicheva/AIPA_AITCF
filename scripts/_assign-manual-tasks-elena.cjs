#!/usr/bin/env node
/**
 * Assign all CLIENT-MANUAL open tasks (+ deals) to Elena's HubSpot owner.
 * Also create + assign soft follow-ups where a deal has zero open tasks.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const OWNER =
  env.match(/^HUBSPOT_OWNER_ID=(.+)$/m)?.[1]?.trim() || '91612860'; // Elena Revicheva
if (!KEY) throw new Error('HUBSPOT_API_KEY missing');
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SINCE = new Date('2026-07-18T00:00:00Z').getTime();

async function hs(method, p, body, attempt = 0) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (r.status === 429 && attempt < 10) {
    await sleep(1200 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  console.log(`Owner ${OWNER}`);
  const deals = [];
  let after;
  do {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT-MANUAL' },
            { propertyName: 'createdate', operator: 'GTE', value: String(SINCE) },
          ],
        },
      ],
      properties: ['dealname', 'dealstage', 'hubspot_owner_id'],
      limit: 100,
    };
    if (after) body.after = after;
    const page = await hs('POST', '/crm/v3/objects/deals/search', body);
    deals.push(...(page.results || []));
    after = page.paging?.next?.after;
    await sleep(200);
  } while (after);

  const real = deals.filter((d) => !/HIT-LIST|remaining|queue/i.test(d.properties.dealname || ''));
  let tasksPatched = 0;
  let dealsPatched = 0;
  let followupsCreated = 0;
  let alreadyOwned = 0;

  for (let i = 0; i < real.length; i++) {
    const d = real[i];
    const company = (d.properties.dealname || '')
      .replace(/^\[CLIENT-MANUAL\]\s*/i, '')
      .replace(/\s+[—–-].*$/, '')
      .trim();
    process.stderr.write(`\r ${i + 1}/${real.length} ${company.slice(0, 32).padEnd(32)}`);

    if (String(d.properties.hubspot_owner_id || '') !== OWNER) {
      await sleep(100);
      await hs('PATCH', `/crm/v3/objects/deals/${d.id}`, {
        properties: { hubspot_owner_id: OWNER },
      });
      dealsPatched++;
    }

    await sleep(100);
    const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/tasks`);
    const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    const openTasks = [];
    for (const id of ids) {
      await sleep(80);
      const t = await hs(
        'GET',
        `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status,hubspot_owner_id`,
      );
      const status = t?.properties?.hs_task_status || '';
      if (status === 'COMPLETED') continue;
      openTasks.push(t);
      const cur = String(t?.properties?.hubspot_owner_id || '');
      if (cur === OWNER) {
        alreadyOwned++;
        continue;
      }
      await sleep(80);
      await hs('PATCH', `/crm/v3/objects/tasks/${id}`, {
        properties: { hubspot_owner_id: OWNER },
      });
      tasksPatched++;
    }

    if (openTasks.length === 0) {
      const due = new Date();
      due.setDate(due.getDate() + 1);
      due.setHours(23, 59, 0, 0);
      await sleep(100);
      const task = await hs('POST', '/crm/v3/objects/tasks', {
        properties: {
          hs_task_subject: `Soft follow-up email/WA → ${company} (no reply yet?)`,
          hs_task_body: `Assigned to Elena. Soft 1–2 line follow-up if still silent. Deal ${d.id}`,
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: 'MEDIUM',
          hs_timestamp: due.toISOString(),
          hubspot_owner_id: OWNER,
        },
      });
      await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${d.id}`, [
        { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
      ]);
      followupsCreated++;
    }
  }
  process.stderr.write('\n');

  const summary = {
    owner: OWNER,
    deals: real.length,
    dealsPatched,
    tasksPatched,
    alreadyOwned,
    followupsCreated,
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(root, 'docs/selling/_assign-manual-tasks-elena.json'),
    JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
