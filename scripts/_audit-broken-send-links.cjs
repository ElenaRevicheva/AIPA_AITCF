#!/usr/bin/env node
/**
 * Find every HubSpot deal whose one-click send button is dead.
 *
 * A button points at /go/outreach-email/{slug}, which resolves only if the slug is in
 * outreach-registry.json AND its draft file exists on disk (or on GitHub main). The
 * Aug 3-4 reset to origin/main wiped registry entries and drafts that had been written
 * on Oracle but never committed — so buttons Elena clicks return "Unknown outreach
 * email slug" instead of sending.
 *
 * Read-only. Prints exactly which deals are broken and why, so the repair can be
 * targeted rather than guessed at.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

async function allDeals(prefix) {
  const out = [];
  let after;
  do {
    const body = {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
      properties: ['dealname', 'dealstage'],
      limit: 100,
      ...(after ? { after } : {}),
    };
    const d = await hs('POST', '/crm/v3/objects/deals/search', body);
    for (const x of d.results || []) {
      if ((x.properties?.dealname || '').includes(`[${prefix}]`)) {
        out.push({ id: x.id, name: x.properties.dealname, stage: x.properties.dealstage });
      }
    }
    after = d.paging?.next?.after;
  } while (after);
  return out;
}

(async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
  const prefixes = (process.env.PREFIXES || 'CLIENT-ATLAS,CLIENT-MANUAL').split(',');
  const deals = [];
  for (const p of prefixes) deals.push(...(await allDeals(p.trim())));
  console.log(`deals to check: ${deals.length} (${prefixes.join(' + ')})\n`);

  const broken = [];
  let checked = 0;
  let ok = 0;
  for (const d of deals) {
    const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes`);
    const noteIds = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    const slugs = new Set();
    for (const nid of noteIds) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      const body = n.properties?.hs_note_body || '';
      for (const m of body.matchAll(/\/go\/outreach-email\/([a-z0-9-]+)/gi)) slugs.add(m[1]);
    }
    if (!slugs.size) continue;
    checked++;
    for (const slug of slugs) {
      const e = reg[slug];
      let why = null;
      if (!e) why = 'slug missing from registry';
      else if (!e.emailDraft) why = 'registry entry has no emailDraft';
      else if (!fs.existsSync(path.join(ROOT, e.emailDraft))) why = `draft file missing (${e.emailDraft})`;
      else if (!e.dealId) why = 'registry entry has no dealId (stamps/tasks will not fire)';
      if (why) broken.push({ deal: d.name.slice(0, 58), dealId: d.id, slug, why });
      else ok++;
    }
  }

  console.log(`working buttons: ${ok} · BROKEN: ${broken.length}\n`);
  const byWhy = {};
  for (const b of broken) byWhy[b.why] = (byWhy[b.why] || 0) + 1;
  for (const [w, n] of Object.entries(byWhy)) console.log(`  ${String(n).padStart(3)}  ${w}`);
  console.log('');
  for (const b of broken) console.log(`  ✗ ${b.deal.padEnd(58)} ${b.slug}`);
  fs.writeFileSync(path.join(ROOT, 'docs/selling/_broken_send_links.json'), JSON.stringify(broken, null, 2));
  console.log(`\nwrote docs/selling/_broken_send_links.json`);
})();
