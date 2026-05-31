#!/usr/bin/env node
/**
 * backfill-hubspot-ingest.cjs  (May 31 2026)
 *
 * One-off, IDEMPOTENT enrichment of existing [CLIENT-CTO-INGEST] HubSpot records.
 * Fills blanks only — never clobbers operator-entered values.
 *
 *   • Company: description (from the deal's pain-point line) + domain (from a real,
 *     non-free-webmail contact email) + website.
 *   • Contact: collapses the ugly "Name @ Name" duplicate (clears the "@ X" lastname).
 *
 * Does NOT change deal stages (the quality gate applies to NEW leads going forward).
 *
 * Usage:
 *   HUBSPOT_API_KEY=... node scripts/backfill-hubspot-ingest.cjs [--dry-run] [--limit N]
 */

const KEY = process.env.HUBSPOT_API_KEY || '';
const BASE = 'https://api.hubapi.com';
const DRY = process.argv.includes('--dry-run');
const LIMIT_ARG = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();
const PREFIX = '[CLIENT-CTO-INGEST]';

const FREE = new Set([
  'gmail.com','googlemail.com','yahoo.com','ymail.com','hotmail.com','outlook.com','live.com',
  'msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me',
  'gmx.com','gmx.net','mail.com','yandex.com','zoho.com','fastmail.com','hey.com','tutanota.com',
]);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function companyDomainFromEmail(email) {
  if (!email || !email.includes('@')) return undefined;
  const dom = email.split('@')[1]?.toLowerCase().trim();
  return dom && !FREE.has(dom) ? dom : undefined;
}
/** Pull the "Pain point: ..." text out of the deal description for a company summary. */
function descFromDeal(dealDesc) {
  if (!dealDesc) return undefined;
  const lines = dealDesc.split('\n').map(s => s.trim()).filter(Boolean);
  const pain = lines.find(l => /^pain point:/i.test(l));
  const src  = lines.find(l => /^source:/i.test(l));
  const bits = [];
  if (pain) bits.push(pain.replace(/^pain point:\s*/i, 'Likely pain: '));
  if (src)  bits.push(src.replace(/^source:\s*/i, 'Discovered via '));
  return bits.length ? bits.join(' · ') : undefined;
}

async function hs(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) { await sleep(2000); return hs(method, path, body); }
    throw new Error(`${method} ${path} → ${res.status}: ${t.slice(0, 200)}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : {};
}

async function allIngestDeals() {
  const out = [];
  let after;
  do {
    const body = {
      filterGroups: [],
      properties: ['dealname', 'description'],
      limit: 100,
      ...(after ? { after } : {}),
    };
    const data = await hs('POST', '/crm/v3/objects/deals/search', body);
    for (const r of (data.results || [])) {
      if ((r.properties?.dealname || '').startsWith(PREFIX)) {
        out.push({ id: r.id, name: r.properties.dealname, description: r.properties.description || '' });
      }
    }
    after = data.paging?.next?.after;
    await sleep(120);
  } while (after);
  return out;
}

async function firstAssoc(dealId, toType) {
  const data = await hs('GET', `/crm/v3/objects/deals/${dealId}/associations/${toType}`);
  return data.results?.[0]?.toObjectId || data.results?.[0]?.id || null;
}

(async () => {
  if (!KEY) { console.error('HUBSPOT_API_KEY not set'); process.exit(1); }
  console.log(`${DRY ? '[DRY-RUN] ' : ''}Backfilling ${PREFIX} records…\n`);

  const deals = await allIngestDeals();
  console.log(`Found ${deals.length} ${PREFIX} deals.\n`);

  let companiesEnriched = 0, contactsCleaned = 0, scanned = 0;

  for (const deal of deals) {
    if (scanned >= LIMIT_ARG) break;
    scanned++;
    try {
      const companyId = await firstAssoc(deal.id, 'companies');
      const contactId = await firstAssoc(deal.id, 'contacts');

      // Contact email (for company domain) + name cleanup
      let contactEmail;
      if (contactId) {
        const c = await hs('GET', `/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname`);
        contactEmail = c.properties?.email;
        const fn = c.properties?.firstname || '';
        const ln = c.properties?.lastname || '';
        // "Laith0003" + "@ Laith0003" → clear the lastname
        if (/^@\s*/.test(ln) || (ln && fn && ln.replace(/^@\s*/, '').trim() === fn.trim())) {
          if (DRY) { console.log(`  contact ${contactId}: would clear lastname "${ln}"`); }
          else { await hs('PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: { lastname: '' } }); await sleep(120); }
          contactsCleaned++;
        }
      }

      // Company enrichment (fill blanks only).
      // NOTE: we deliberately DO NOT derive company domain from the README-extracted
      // contact email here — those are frequently placeholder (acme.com, yourco.com)
      // or third-party domains, so writing them would fabricate wrong data. The
      // original scraped website isn't persisted, so backfill only sets the
      // (accurate, Haiku-classified) description.
      if (companyId) {
        const co = await hs('GET', `/crm/v3/objects/companies/${companyId}?properties=name,domain,website,description`);
        const p = co.properties || {};
        const patch = {};
        const desc = descFromDeal(deal.description);
        if (desc && !p.description)      patch.description = desc;
        if (Object.keys(patch).length) {
          if (DRY) { console.log(`  company ${companyId} (${p.name}): would set ${JSON.stringify(patch)}`); }
          else { await hs('PATCH', `/crm/v3/objects/companies/${companyId}`, { properties: patch }); await sleep(120); }
          companiesEnriched++;
        }
      }
    } catch (e) {
      console.warn(`  ! deal ${deal.id} (${deal.name}): ${e.message}`);
    }
    if (scanned % 25 === 0) console.log(`  …scanned ${scanned}/${deals.length}`);
  }

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Done. Scanned ${scanned} deals · companies enriched: ${companiesEnriched} · contacts cleaned: ${contactsCleaned}`);
})().catch(e => { console.error(e); process.exit(1); });
