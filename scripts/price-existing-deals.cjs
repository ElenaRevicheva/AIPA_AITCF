#!/usr/bin/env node
/**
 * price-existing-deals.cjs — Revenue Cockpit Phase 2 backfill (June 10 2026)
 *
 * Fills the EMPTY `amount` on existing client-pipeline deals by matching the
 * deal's intent text (name + description) against Elena's confirmed offer menu
 * (src/offer-pricing.ts via dist build). Idempotent + conservative:
 *   - only [CLIENT-CTO-SERP] and [CLIENT-CTO-INGEST] deals
 *   - only when amount is EMPTY (never overwrites an operator-set value)
 *   - skips protected stages (contractsent / closedwon / closedlost)
 *
 * Usage:
 *   HUBSPOT_API_KEY=... node scripts/price-existing-deals.cjs            # dry-run
 *   HUBSPOT_API_KEY=... node scripts/price-existing-deals.cjs --apply
 */

const path = require('path');
const { matchOfferToIntent, renderOfferEstimate } = require(path.join(__dirname, '..', 'dist', 'offer-pricing.js'));

const KEY = process.env.HUBSPOT_API_KEY || '';
const BASE = 'https://api.hubapi.com';
const APPLY = process.argv.includes('--apply');
const PREFIXES = ['[CLIENT-CTO-SERP]', '[CLIENT-CTO-INGEST]'];
const PROTECTED = new Set(['contractsent', 'closedwon', 'closedlost']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function hs(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 429) { await sleep(2000); return hs(method, p, body); }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

(async () => {
  if (!KEY) { console.error('HUBSPOT_API_KEY not set'); process.exit(1); }
  console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} Pricing existing client deals…\n`);

  const deals = [];
  let after;
  do {
    const data = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [], properties: ['dealname', 'dealstage', 'amount', 'description'], limit: 100, ...(after ? { after } : {}),
    });
    deals.push(...(data.results || []));
    after = data.paging?.next?.after;
    await sleep(110);
  } while (after);

  const byOffer = {};
  let priced = 0, skippedHasAmount = 0;
  for (const d of deals) {
    const name = d.properties.dealname || '';
    if (!PREFIXES.some(p => name.startsWith(p))) continue;
    if (PROTECTED.has(d.properties.dealstage || '')) continue;
    const amt = parseFloat(d.properties.amount || '');
    if (Number.isFinite(amt) && amt > 0) { skippedHasAmount++; continue; }

    const intentText = `${name} ${(d.properties.description || '').slice(0, 300)}`;
    const offer = matchOfferToIntent(intentText);
    byOffer[offer.label] = (byOffer[offer.label] || 0) + 1;
    priced++;
    if (priced <= 15) console.log(`  ${offer.label.padEnd(28)} ${renderOfferEstimate(offer).padEnd(10)} ${name.slice(0, 75)}`);

    if (APPLY) {
      await hs('PATCH', `/crm/v3/objects/deals/${d.id}`, { properties: { amount: String(offer.amount) } });
      await sleep(120);
    }
  }
  if (priced > 15) console.log(`  …+${priced - 15} more`);

  console.log(`\nSummary: ${priced} deals ${APPLY ? 'PRICED' : 'would be priced'} (${skippedHasAmount} already had amounts, untouched)`);
  console.log('By offer:', JSON.stringify(byOffer, null, 2));
  if (!APPLY) console.log('\n[DRY-RUN] Nothing written. Re-run with --apply.');
})().catch(e => { console.error(e); process.exit(1); });
