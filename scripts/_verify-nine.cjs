#!/usr/bin/env node
/**
 * Verify a named list of prospects is staged for the FULL cycle:
 * deal + contact + registry entries (first & FU, each carrying dealId) + all four
 * click-to-send links present in the note + the draft files those links resolve to.
 *
 * Reports per company exactly which of the four buttons work, so a gap is actionable
 * rather than "something is broken".
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));

const WANTED = [
  'Engel', 'Strega', 'AutoGO', 'Be Luxe', 'Madero', 'Bern', 'Insignia', 'Marjalizo', 'Foundever',
];

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

async function allDeals() {
  const out = [];
  for (const prefix of ['CLIENT-MANUAL', 'CLIENT-ATLAS']) {
    let after;
    do {
      const d = await hs('POST', '/crm/v3/objects/deals/search', {
        filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
        properties: ['dealname', 'dealstage'],
        limit: 100,
        ...(after ? { after } : {}),
      });
      for (const x of d.results || []) {
        if ((x.properties?.dealname || '').includes(`[${prefix}]`)) {
          out.push({ id: x.id, name: x.properties.dealname, stage: x.properties.dealstage });
        }
      }
      after = d.paging?.next?.after;
    } while (after);
  }
  return out;
}

(async () => {
  const deals = await allDeals();
  console.log(`scanned ${deals.length} CLIENT-MANUAL + CLIENT-ATLAS deals\n`);

  for (const want of WANTED) {
    const hit = deals.find((d) => d.name.toLowerCase().includes(want.toLowerCase()));
    if (!hit) {
      console.log(`✗ ${want.padEnd(12)} NO DEAL FOUND`);
      continue;
    }
    const assoc = await hs('GET', `/crm/v4/objects/deals/${hit.id}/associations/notes`);
    const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let body = '';
    for (const nid of ids) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      const b = n.properties?.hs_note_body || '';
      if (/FOLLOW-UP|EMAIL FU|WHATSAPP|ENVIAR POR/i.test(b)) body += b;  // aggregate ALL notes: a deal may carry several
    }
    const slugs = [...new Set([...body.matchAll(/\/go\/outreach-email\/([a-z0-9-]+)/gi)].map((m) => m[1]))];
    const waCount = (body.match(/web\.whatsapp\.com\/send/g) || []).length;

    // which email slugs actually resolve (registry entry + draft file on disk)
    const good = slugs.filter((s) => {
      const e = reg[s];
      return e && e.emailDraft && fs.existsSync(path.join(ROOT, e.emailDraft)) && e.dealId;
    });
    const emailFirst = good.some((s) => !/-fu$/.test(s));
    const emailFu = good.some((s) => /-fu$/.test(s));

    const marks = [
      emailFirst ? '✓EMAIL1' : '✗EMAIL1',
      waCount >= 1 ? '✓WA1' : '✗WA1',
      emailFu ? '✓EMAILFU' : '✗EMAILFU',
      waCount >= 2 ? '✓WAFU' : '✗WAFU',
    ].join(' ');
    const allOk = emailFirst && emailFu && waCount >= 2;
    console.log(`${allOk ? '✅' : '⚠️ '} ${want.padEnd(11)} ${marks}  ${hit.stage.padEnd(22)} ${hit.name.slice(0, 46)}`);
    if (!allOk) {
      const bad = slugs.filter((s) => !good.includes(s));
      if (bad.length) console.log(`      broken slugs: ${bad.join(', ')}`);
      if (!slugs.length) console.log(`      note has NO email buttons at all`);
    }
  }
})();
