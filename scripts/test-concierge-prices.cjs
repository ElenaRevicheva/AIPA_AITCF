#!/usr/bin/env node
/**
 * test-concierge-prices.cjs — the concierge may only quote catalog prices.
 *
 * Sep 30 2026: a test lead ("what would it cost to start?") got a draft saying
 * "This typically costs $1,500". The rules named no prices, so the model invented one.
 * Two guards now: the catalog prices are IN the rules (grounding), and every draft is
 * scanned for amounts that are not (enforcement → ⚠️ on the Telegram card).
 *
 * Run after `npm run build`:  node scripts/test-concierge-prices.cjs
 */
const { CONCIERGE_RULES, CATALOG_PRICES_USD, findOffCatalogPrices } = require('../dist/concierge-prompt.js');
const { SERVICE_PRODUCTS } = require('../dist/aideazz-service-catalog.js');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}
const same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

// 1. Grounding — the rules carry the real ladder, read from the checkout catalog.
const catalog = Object.values(SERVICE_PRODUCTS).map((p) => p.amountUsd);
check('catalog prices = checkout catalog', same(CATALOG_PRICES_USD, catalog), JSON.stringify(CATALOG_PRICES_USD));
for (const n of catalog) check(`rules name $${n}`, CONCIERGE_RULES.includes(`$${n}`));
check('rules link the diagnostic pay page', CONCIERGE_RULES.includes('/pay/analisis-tecnico?sku=diagnostic_call'));
check('rules forbid any other price', /ONLY prices that exist/.test(CONCIERGE_RULES));
check('rules: larger work is scoped after the diagnostic, no number', /scoped and priced after the diagnostic/.test(CONCIERGE_RULES));
// Lab framing (Elena, Sep 30 2026: "Nobody will pay a solo builder, it sounds weak").
const identity = CONCIERGE_RULES.split('\n\n')[0];
check('identity is the Lab, not a person', /^You are the lead concierge for AIdeazz AI Lab/.test(identity), identity.slice(0, 80));
check('identity sells the product: AI Growth Operator, not another CRM', /installs an AI Growth Operator inside the tools .* not another CRM/.test(identity));
check('identity never says solo / she ships', !/\bsolo\b|she ships|executive-turned/i.test(identity));
check('drafts must speak for the Lab and never call it solo', /Speak for the Lab/.test(CONCIERGE_RULES) && /Never describe the Lab or Elena as solo/.test(CONCIERGE_RULES));
check('and never invent a team either', /never invent staff, team size, clients or case studies/.test(CONCIERGE_RULES));
check('no unresolved ${…} in the rules', !CONCIERGE_RULES.includes('${'));

// 2. Enforcement — off-catalog amounts are found, catalog amounts and plain numbers are not.
const flagged = [
  ['the real Sep 30 draft', 'A good first step would be a focused audit … This typically costs $1,500.', [1500]],
  ['USD prefix', 'Setup is USD 1,500 plus hosting.', [1500]],
  ['US$ prefix', 'Around US$ 250 per month.', [250]],
  ['Spanish thousands dot', 'Cuesta 1.500 dólares.', [1500]],
  ['k suffix', 'Most clients start at $2k.', [2000]],
  ['range upper end', 'Management runs $500–3,000/mo.', [3000]],
  ['euro', 'We charge €900 for that.', [900]],
];
for (const [name, text, want] of flagged) {
  const got = findOffCatalogPrices(text);
  check(`flags ${name}`, same(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
const clean = [
  ['diagnostic', 'The first step is the $100 diagnostic, credited if you continue.'],
  ['cents', 'It is $100.00 via PagueloFacil.'],
  ['US$ catalog', 'US$100 for the diagnostic, then $200 and $500.'],
  ['Spanish catalog', 'El diagnóstico cuesta 100 dólares.'],
  ['plain numbers', 'A 15-minute call, 34 checks, 140 words, since 2026, 1,500 guests a year.'],
  ['no money at all', 'Let us connect for 15 minutes: https://calendly.com/elena_revicheva/coffee-chat'],
];
for (const [name, text] of clean) {
  const got = findOffCatalogPrices(text);
  check(`ignores ${name}`, got.length === 0, `got ${JSON.stringify(got)}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
