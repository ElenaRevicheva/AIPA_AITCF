#!/usr/bin/env node
/**
 * cleanup-junk-crm.cjs  (June 10 2026)
 *
 * Archives the HEADLINE-ERA junk from HubSpot: deals (and headline/URL-named
 * companies + contacts) created by the pre-gate SERP firehose, which saved every
 * Google result title as a "prospect".
 *
 * Classification (conservative):
 *   DEAL is junk when name starts with [CLIENT-CTO-SERP] AND
 *     (a) createdate < GATE_LIVE (2026-05-31T14:30Z — buying-intent gate deploy), OR
 *     (b) base name is a bare URL (https://..., www....), OR
 *     (c) base name contains a social/marketplace domain (facebook.com, upwork.com, youtube.com) or ": r/" (Reddit)
 *   NEVER touched: [HIRING-*], [CLIENT-ALGOM], [CLIENT-CTO-INGEST], [ESPALUZ*],
 *     un-prefixed deals, and ANY deal in contractsent / closedwon / closedlost.
 *   COMPANY is junk when: name starts with http/www, OR name len>60 with spaces
 *     (sentence/headline), OR name ends with "..." — AND it has no real domain.
 *   CONTACT is junk when: no email AND (name>60 chars with spaces OR starts http).
 *
 * Dry-run by default: prints counts + samples, writes full plan to
 * junk-cleanup-plan.json. --apply archives (HubSpot keeps archived ~90 days).
 *
 * Usage:
 *   HUBSPOT_API_KEY=... node scripts/cleanup-junk-crm.cjs            # dry-run
 *   HUBSPOT_API_KEY=... node scripts/cleanup-junk-crm.cjs --apply
 */

const fs = require('fs');
const KEY = process.env.HUBSPOT_API_KEY || '';
const BASE = 'https://api.hubapi.com';
const APPLY = process.argv.includes('--apply');
const GATE_LIVE = Date.parse('2026-05-31T14:30:00Z');
const PROTECTED_STAGES = new Set(['contractsent', 'closedwon', 'closedlost']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function hs(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 429) { await sleep(2000); return hs(method, path, body); }
  if (!res.ok && res.status !== 204) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

async function allObjects(type, props) {
  const out = [];
  let after;
  do {
    const data = await hs('POST', `/crm/v3/objects/${type}/search`, {
      filterGroups: [], properties: props, limit: 100, ...(after ? { after } : {}),
    });
    out.push(...(data.results || []));
    after = data.paging?.next?.after;
    await sleep(110);
  } while (after);
  return out;
}

const baseName = (dealname) => (dealname || '').replace(/^\[[A-Z-]+\]\s*/, '').replace(/\s*—\s*outreach\s*$/i, '').trim();
const isUrlName = (s) => /^(https?:\/\/|www\.)/i.test(s);
const hasSocialDomain = (s) => /(facebook\.com|upwork\.com|youtube\.com|youtu\.be)/i.test(s) || /:\s*r\//.test(s);

function classifyDeal(d) {
  const name = d.properties.dealname || '';
  const stage = d.properties.dealstage || '';
  if (!name.startsWith('[CLIENT-CTO-SERP]')) return null;
  if (PROTECTED_STAGES.has(stage)) return null;
  const base = baseName(name);
  const created = Date.parse(d.properties.createdate || '');
  if (Number.isFinite(created) && created < GATE_LIVE) return 'pre-gate-firehose';
  if (isUrlName(base)) return 'bare-url-name';
  if (hasSocialDomain(base)) return 'social-domain-name';
  return null;
}

function classifyCompany(c) {
  const name = (c.properties.name || '').trim();
  const domain = (c.properties.domain || '').trim();
  if (domain) return null; // has a real domain — keep
  if (isUrlName(name)) return 'url-name';
  if (name.endsWith('...') || name.endsWith('…')) return 'truncated-headline';
  if (name.length > 60 && name.includes(' ')) return 'sentence-headline';
  return null;
}

function classifyContact(ct) {
  const email = (ct.properties.email || '').trim();
  if (email) return null; // has email — keep
  const fn = (ct.properties.firstname || '').trim();
  const ln = (ct.properties.lastname || '').trim();
  const full = `${fn} ${ln}`.trim();
  if (isUrlName(full)) return 'url-name';
  if (full.length > 60 && full.includes(' ')) return 'sentence-headline';
  return null;
}

(async () => {
  if (!KEY) { console.error('HUBSPOT_API_KEY not set'); process.exit(1); }
  console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} Junk CRM cleanup — gate-live cutoff ${new Date(GATE_LIVE).toISOString()}\n`);

  const [deals, companies, contacts] = [
    await allObjects('deals', ['dealname', 'dealstage', 'createdate']),
    await allObjects('companies', ['name', 'domain', 'createdate']),
    await allObjects('contacts', ['firstname', 'lastname', 'email', 'createdate']),
  ];
  console.log(`Scanned: ${deals.length} deals · ${companies.length} companies · ${contacts.length} contacts\n`);

  const junkDeals = [], junkCompanies = [], junkContacts = [];
  const dealRules = {};
  for (const d of deals) {
    const rule = classifyDeal(d);
    if (rule) { junkDeals.push({ id: d.id, name: d.properties.dealname, stage: d.properties.dealstage, rule }); dealRules[rule] = (dealRules[rule] || 0) + 1; }
  }
  for (const c of companies) {
    const rule = classifyCompany(c);
    if (rule) junkCompanies.push({ id: c.id, name: c.properties.name, rule });
  }
  for (const ct of contacts) {
    const rule = classifyContact(ct);
    if (rule) junkContacts.push({ id: ct.id, name: `${ct.properties.firstname || ''} ${ct.properties.lastname || ''}`.trim(), rule });
  }

  console.log(`── JUNK DEALS: ${junkDeals.length} (rules: ${JSON.stringify(dealRules)}) ──`);
  for (const d of junkDeals.slice(0, 18)) console.log(`  [${d.rule}|${d.stage}] ${d.name.slice(0, 90)}`);
  if (junkDeals.length > 18) console.log(`  …+${junkDeals.length - 18} more`);

  console.log(`\n── JUNK COMPANIES: ${junkCompanies.length} ──`);
  for (const c of junkCompanies.slice(0, 12)) console.log(`  [${c.rule}] ${c.name.slice(0, 90)}`);
  if (junkCompanies.length > 12) console.log(`  …+${junkCompanies.length - 12} more`);

  console.log(`\n── JUNK CONTACTS: ${junkContacts.length} ──`);
  for (const ct of junkContacts.slice(0, 12)) console.log(`  [${ct.rule}] ${ct.name.slice(0, 90)}`);
  if (junkContacts.length > 12) console.log(`  …+${junkContacts.length - 12} more`);

  const plan = { generatedAt: new Date().toISOString(), gateLive: new Date(GATE_LIVE).toISOString(), junkDeals, junkCompanies, junkContacts };
  fs.writeFileSync(__dirname + '/junk-cleanup-plan.json', JSON.stringify(plan, null, 2));
  console.log(`\nPlan written: scripts/junk-cleanup-plan.json`);
  console.log(`KEPT untouched: all [HIRING-*], [CLIENT-ALGOM], [CLIENT-CTO-INGEST], un-prefixed, and protected stages.`);

  if (!APPLY) { console.log(`\n[DRY-RUN] Nothing archived. Re-run with --apply to archive (recoverable ~90 days in HubSpot).`); return; }

  // Batch archive (100 per call)
  async function batchArchive(type, items) {
    let done = 0;
    for (let i = 0; i < items.length; i += 100) {
      const inputs = items.slice(i, i + 100).map(x => ({ id: x.id }));
      await hs('POST', `/crm/v3/objects/${type}/batch/archive`, { inputs });
      done += inputs.length;
      console.log(`  archived ${done}/${items.length} ${type}`);
      await sleep(250);
    }
  }
  console.log(`\n[APPLY] Archiving…`);
  await batchArchive('deals', junkDeals);
  await batchArchive('companies', junkCompanies);
  await batchArchive('contacts', junkContacts);
  console.log(`\n[APPLY] Done. Archived ${junkDeals.length} deals, ${junkCompanies.length} companies, ${junkContacts.length} contacts. Recoverable in HubSpot for ~90 days.`);
})().catch(e => { console.error(e); process.exit(1); });
