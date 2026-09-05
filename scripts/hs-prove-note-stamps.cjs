#!/usr/bin/env node
/**
 * Read-only: print EMAILED / ENTREGADO / ABIERTO lines on a deal's notes.
 * Cloud agents cannot reach api.hubapi.com — run via hire-trigger:
 *   echo "prove-stamps --deal=64302436100" > .hire-trigger
 */
'use strict';

const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const dealArg = process.argv.find((a) => a.startsWith('--deal='));
const DEAL = dealArg ? dealArg.slice('--deal='.length).replace(/\D/g, '') : '';
if (!DEAL) {
  console.error('usage: node scripts/hs-prove-note-stamps.cjs --deal=<id>');
  process.exit(1);
}

const KEY = hubspotKey();
if (!KEY) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
const BASE = hubspotBase();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const STAMP_RE =
  /(📧\s*EMAILED[^\n<]{0,240}|✅[^<\n]{0,80}ENTREGADO[^\n<]{0,240}|👀[^<\n]{0,80}ABIERTO[^\n<]{0,240}|🔗[^<\n]{0,80}CLIC[^\n<]{0,240}|⛔[^<\n]{0,80}REBOTE[^\n<]{0,240})/gi;

async function hs(method, p) {
  const r = await fetch(`${BASE}${p}`, { method, headers });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON is the finding */
  }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text.slice(0, 200)}`);
  return json;
}

function strip(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

(async () => {
  const deal = await hs('GET', `/crm/v3/objects/deals/${DEAL}?properties=dealname,dealstage`);
  console.log(`deal ${DEAL}  ${deal.properties?.dealname || ''}  stage=${deal.properties?.dealstage || ''}`);

  const assoc = await hs('GET', `/crm/v4/objects/deals/${DEAL}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  console.log(`notes ${ids.length}`);

  const rows = [];
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    const body = n.properties?.hs_note_body || '';
    const text = strip(body);
    const stamps = [...text.matchAll(STAMP_RE)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    rows.push({
      id,
      ts: n.properties?.hs_timestamp || '',
      stamps,
      lead: text.slice(0, 90).replace(/\s+/g, ' '),
    });
  }
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  let withStamps = 0;
  for (const row of rows) {
    if (!row.stamps.length) continue;
    withStamps += 1;
    console.log(`\nNOTE ${row.id}  ${row.ts}`);
    console.log(`  lead: ${row.lead}`);
    for (const s of row.stamps) console.log(`  STAMP ${s}`);
  }
  if (!withStamps) {
    console.log('\nNO STAMPS on any note. EMAILED lands on send; ENTREGADO/ABIERTO land from Resend.');
    for (const row of rows.slice(0, 6)) console.log(`  ${row.id}  ${row.ts}  ${row.lead}`);
  }
  console.log(`\nnotes-with-stamps ${withStamps}/${rows.length}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
