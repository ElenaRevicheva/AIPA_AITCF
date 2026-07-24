/**
 * Create one HubSpot queue deal listing remaining open hit-list domains
 * so Elena can see what's left to stage/send.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const KEY = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, p, body, attempt = 0) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (r.status === 429 && attempt < 5) {
    await sleep(2000 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

function openFromDoc() {
  const md = fs.readFileSync(path.join(root, 'docs/selling/PANAMA_TARGET_PROSPECTS.md'), 'utf8');
  const open = [];
  for (const line of md.split(/\n/)) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([a-z0-9.-]+\.[a-z.]{2,})\s*\|/i);
    if (!m) continue;
    const name = m[1].trim();
    const domain = m[2].trim().toLowerCase();
    if (/· SENT/.test(name) || /\bSENT\b/i.test(line) && /STAGED/i.test(line)) continue;
    if (/BLOCKED/i.test(line)) continue;
    open.push({ name: name.replace(/\s*·\s*SENT\s*$/, '').trim(), domain });
  }
  // dedupe
  const map = new Map();
  for (const r of open) map.set(r.domain, r);
  return [...map.values()];
}

const READY_TO_SEND = [
  { company: 'DermoMédica', domain: 'dermomedica.com.pa', dealId: '63060115712', score: '54/D' },
  { company: 'The Casco School', domain: 'thecascoschool.com', dealId: '63060405782', score: '54/D' },
  { company: 'Boston School International', domain: 'bostonschool.edu.pa', dealId: '63053387934', score: '88/A' },
  { company: 'STUDIO at The Haven', domain: 'studiohavenboquete.com', dealId: '63049661069', score: '87/A' },
  { company: 'Gamboa Rainforest Reserve', domain: 'gamboaresort.com', dealId: '63039072050', score: '85/A' },
];

(async () => {
  // Dedupe: search existing queue deal
  const existing = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [
      {
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'HIT-LIST' },
        ],
      },
    ],
    properties: ['dealname'],
    limit: 5,
  });
  const dup = (existing.results || []).find((d) =>
    (d.properties?.dealname || '').includes('HIT-LIST — remaining'),
  );

  const open = openFromDoc();
  const openLines = open
    .map((r, i) => `${i + 1}. <b>${r.name}</b> — <code>${r.domain}</code>`)
    .join('<br>');
  const sendLines = READY_TO_SEND.map(
    (r) =>
      `➡️ <b>${r.company}</b> (${r.score}) — deal <code>${r.dealId}</code> / ${r.domain}`,
  ).join('<br>');

  const noteHtml = [
    '<b>[CLIENT-MANUAL] HIT-LIST QUEUE</b> — remaining targets from PANAMA_TARGET_PROSPECTS.md',
    '',
    `<b>SEND TODAY (5 newly staged, live audits):</b><br>${sendLines}`,
    '',
    `<b>STILL OPEN on hit-list (${open.length}):</b> not yet outreach-staged (need WA+email mine before Manual Prospect Play).<br>${openLines}`,
    '',
    'Source: docs/selling/PANAMA_TARGET_PROSPECTS.md · Updated ' + new Date().toISOString().slice(0, 10),
    'Next: send the 5 above from their deal notes; then mine contacts for the open list and stage via stage-manual-prospect.cjs',
  ].join('<br>');

  let dealId = dup?.id;
  if (!dealId) {
    const deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname: `[CLIENT-MANUAL] HIT-LIST — remaining ${open.length} targets (queue)`,
        dealstage: 'qualifiedtobuy',
        pipeline: 'default',
      },
    });
    dealId = deal.id;
  } else {
    await hs('PATCH', `/crm/v3/objects/deals/${dealId}`, {
      properties: {
        dealname: `[CLIENT-MANUAL] HIT-LIST — remaining ${open.length} targets (queue)`,
        dealstage: 'qualifiedtobuy',
      },
    });
  }

  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);

  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send 5 new staged + work HIT-LIST queue (${open.length} open)`,
      hs_task_body: `1) Send outreach on the 5 deals listed in the queue note.\n2) Mine WA/email for remaining ${open.length} hit-list domains, then stage.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);

  console.log(
    JSON.stringify(
      {
        queueDealId: dealId,
        noteId: note.id,
        taskId: task.id,
        readyToSend: READY_TO_SEND.length,
        openRemaining: open.length,
        openDomains: open.map((o) => o.domain),
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
