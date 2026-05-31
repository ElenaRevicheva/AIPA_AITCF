#!/usr/bin/env node
/**
 * carve-revenue-pipeline.cjs  (May 31 2026)
 *
 * Turns the 402-deal lead firehose into a usable revenue cockpit by separating
 * CONTACTABLE prospects (can make money) from NON-CONTACTABLE noise.
 *
 * "Contactable" = the deal's associated contact has a real (non-free, non-placeholder)
 * email, OR the associated company has a real domain (not free-webmail / placeholder /
 * news-media). You can only earn revenue from a lead you can actually reach.
 *
 * ACTION (only with --apply): demote every NON-CONTACTABLE deal that currently sits in
 * an action stage (qualifiedtobuy = "I Act TODAY", presentationscheduled = "Engaged")
 * DOWN to appointmentscheduled ("Prospected"). Nothing is deleted. Every change is
 * logged to carve-log.json so it is fully reversible.
 *
 * Usage:
 *   HUBSPOT_API_KEY=... node scripts/carve-revenue-pipeline.cjs            # dry-run (read-only)
 *   HUBSPOT_API_KEY=... node scripts/carve-revenue-pipeline.cjs --apply    # execute demotions
 */

const KEY = process.env.HUBSPOT_API_KEY || '';
const BASE = 'https://api.hubapi.com';
const APPLY = process.argv.includes('--apply');

const ACTION_STAGES = new Set(['qualifiedtobuy', 'presentationscheduled', 'decisionmakerboughtin']);
const PROSPECTED = 'appointmentscheduled';

const FREE = new Set([
  'gmail.com','googlemail.com','yahoo.com','ymail.com','hotmail.com','outlook.com','live.com',
  'msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me',
  'gmx.com','gmx.net','mail.com','yandex.com','zoho.com','fastmail.com','hey.com','tutanota.com',
]);
const PLACEHOLDER = new Set([
  'example.com','example.org','example.net','acme.com','yourco.com','yourcompany.com',
  'company.com','domain.com','email.com','test.com','mycompany.com','sample.com','foo.com','bar.com','localhost',
  'yourdomain.com','your-domain.com','yourname.com','your-email.com','changeme.com','host.com','site.com','website.com',
]);
const NEWS_MEDIA = new Set([
  'bbc.com','cnn.com','nbcnews.com','youtube.com','youtu.be','britannica.com','wikipedia.org',
  'platformer.news','medium.com','reddit.com','forbes.com','techcrunch.com','nytimes.com',
  'theverge.com','wired.com','cnbc.com','washingtonpost.com','theguardian.com','businessinsider.com',
  'vox.com','substack.com','quora.com','linkedin.com','twitter.com','x.com','facebook.com',
]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function realCompanyDomain(dom) {
  if (!dom) return false;
  dom = dom.toLowerCase().replace(/^www\./, '').trim();
  if (!dom.includes('.')) return false;
  if (FREE.has(dom) || PLACEHOLDER.has(dom) || NEWS_MEDIA.has(dom)) return false;
  if (/\.gov$/.test(dom) || dom.endsWith('.gov')) return false;
  return true;
}
function realEmail(email) {
  if (!email || !email.includes('@')) return false;
  const dom = email.split('@')[1]?.toLowerCase().trim();
  return dom && !FREE.has(dom) && !PLACEHOLDER.has(dom);
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

async function allDeals() {
  const out = [];
  let after;
  do {
    const body = { filterGroups: [], properties: ['dealname', 'dealstage'], limit: 100, ...(after ? { after } : {}) };
    const data = await hs('POST', '/crm/v3/objects/deals/search', body);
    for (const r of (data.results || [])) {
      out.push({ id: String(r.id), name: r.properties?.dealname || '', stage: r.properties?.dealstage || '' });
    }
    after = data.paging?.next?.after;
    await sleep(100);
  } while (after);
  return out;
}

async function batchAssoc(fromIds, toType) {
  const map = {};
  for (let i = 0; i < fromIds.length; i += 100) {
    const inputs = fromIds.slice(i, i + 100).map(id => ({ id }));
    const data = await hs('POST', `/crm/v4/associations/deals/${toType}/batch/read`, { inputs });
    for (const r of (data.results || [])) {
      const fromId = String(r.from?.id);
      const toId = r.to?.[0]?.toObjectId;
      if (fromId && toId) map[fromId] = String(toId);
    }
    await sleep(100);
  }
  return map;
}

async function batchRead(objType, ids, props) {
  const map = {};
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 100) {
    const inputs = uniq.slice(i, i + 100).map(id => ({ id }));
    const data = await hs('POST', `/crm/v3/objects/${objType}/batch/read`, { properties: props, inputs });
    for (const r of (data.results || [])) map[String(r.id)] = r.properties || {};
    await sleep(100);
  }
  return map;
}

(async () => {
  if (!KEY) { console.error('HUBSPOT_API_KEY not set'); process.exit(1); }
  console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} Carving revenue pipeline…\n`);

  const deals = await allDeals();
  console.log(`Total deals: ${deals.length}`);

  const dealContact = await batchAssoc(deals.map(d => d.id), 'contacts');
  const dealCompany = await batchAssoc(deals.map(d => d.id), 'companies');
  const contacts = await batchRead('contacts', Object.values(dealContact), ['email']);
  const companies = await batchRead('companies', Object.values(dealCompany), ['name', 'domain', 'website']);

  const revenue = [], cold = [];
  for (const d of deals) {
    const email = contacts[dealContact[d.id]]?.email;
    const co = companies[dealCompany[d.id]] || {};
    const dom = co.domain || (co.website ? co.website.replace(/^https?:\/\//, '').replace(/\/.*/, '') : '');
    const contactable = realEmail(email) || realCompanyDomain(dom);
    (contactable ? revenue : cold).push({ ...d, email: email || '', domain: dom || '', company: co.name || '' });
  }

  const inAction = (arr) => arr.filter(d => ACTION_STAGES.has(d.stage));
  const demote = inAction(cold); // non-contactable deals sitting in action stages

  console.log(`\n── CONTACTABLE (revenue pipeline): ${revenue.length} ──`);
  for (const d of revenue.slice(0, 15)) console.log(`  [${d.stage}] ${d.name}  <${d.email || d.domain}>`);
  if (revenue.length > 15) console.log(`  …+${revenue.length - 15} more`);

  console.log(`\n── NON-CONTACTABLE: ${cold.length}  (of these, ${demote.length} currently in an ACTION stage) ──`);
  for (const d of demote.slice(0, 15)) console.log(`  [${d.stage}] ${d.name}`);
  if (demote.length > 15) console.log(`  …+${demote.length - 15} more`);

  console.log(`\n── ACTION-VIEW IMPACT ──`);
  console.log(`  "I Act TODAY"/"Engaged" today : ${inAction(deals).length}`);
  console.log(`  After carve (contactable only): ${inAction(revenue).length}`);
  console.log(`  Would be demoted to Prospected : ${demote.length}`);

  if (APPLY) {
    const log = [];
    let done = 0;
    for (const d of demote) {
      await hs('PATCH', `/crm/v3/objects/deals/${d.id}`, { properties: { dealstage: PROSPECTED } });
      log.push({ id: d.id, name: d.name, from: d.stage, to: PROSPECTED });
      done++;
      if (done % 25 === 0) console.log(`  …demoted ${done}/${demote.length}`);
      await sleep(110);
    }
    require('fs').writeFileSync(__dirname + '/carve-log.json', JSON.stringify(log, null, 2));
    console.log(`\n[APPLY] Demoted ${done} non-contactable deals → Prospected. Reversible log: scripts/carve-log.json`);
  } else {
    console.log(`\n[DRY-RUN] No changes made. Re-run with --apply to demote the ${demote.length} non-contactable action-stage deals.`);
  }
})().catch(e => { console.error(e); process.exit(1); });
