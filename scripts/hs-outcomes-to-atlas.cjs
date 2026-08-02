#!/usr/bin/env node
/**
 * hs-outcomes-to-atlas.cjs — #4: real CRM outcomes -> Atlas feedback loop.
 *
 * Reads every [CLIENT-MANUAL] + [ATLAS-RADAR] deal from HubSpot, maps each to one of
 * Elena's service lanes (dealname keywords), buckets its Sales-Pipeline stage into
 * staged/sent/replied/won/lost, and POSTs the per-lane aggregate to Atlas
 * (POST /api/atlas/outcomes, Bearer ATLAS_OUTCOMES_TOKEN). Atlas then serves "what
 * actually converts" alongside "what's open" on /api/atlas/angle.
 *
 * Stage map (Sales Pipeline, default):
 *   qualifiedtobuy        -> staged   (🔥 I Act TODAY)
 *   decisionmakerboughtin -> sent     (⏳ Sent — passive wait)
 *   contractsent          -> replied  (💬 They replied — I act)
 *   closedwon             -> won · closedlost -> lost
 *
 * ADDITIVE + STANDALONE: read-only on HubSpot, no service touched. Cron weekly after
 * the campaign alert. Flags: --dry-run (print, don't POST).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();

const KEY = g('HUBSPOT_API_KEY');
const TOKEN = g('ATLAS_OUTCOMES_TOKEN');
const ATLAS = (g('ATLAS_PUBLIC_BASE') || 'https://webhook.aideazz.xyz/whitespace').replace(/\/$/, '');
const DRY = process.argv.includes('--dry-run');

if (!KEY) { console.error('HUBSPOT_API_KEY missing'); process.exit(1); }

const STAGE = {
  qualifiedtobuy: 'staged',
  decisionmakerboughtin: 'sent',
  contractsent: 'replied',
  closedwon: 'won',
  closedlost: 'lost',
};

/** dealname keywords -> service lane (order matters: most specific first). */
function lane(dealname) {
  const d = dealname.toLowerCase();
  if (/\bwhatsapp\b|booking agent|wa agent/.test(d)) return 'whatsapp_ai_agents';
  if (/automation|automatiza/.test(d)) return 'ai_automation';
  if (/video|film|atuona/.test(d)) return 'ai_film_making_studios';
  if (/fractional|cto retainer/.test(d)) return 'fractional_cto';
  if (/marketing/.test(d)) return 'ai_marketing_studios';
  if (/product building|mvp/.test(d)) return 'ai_augmented_product_building';
  // Default: the [CLIENT-MANUAL] play pitches the visibility audit (GEO/AEO fix).
  return 'geo_aeo_tech_seo_makers';
}

async function hs(body) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function fetchDeals(prefix) {
  const out = [];
  let after;
  do {
    const res = await hs({
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
      properties: ['dealname', 'dealstage'],
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const d of res.results || []) {
      const name = d.properties?.dealname || '';
      if (name.includes(`[${prefix}]`)) out.push({ name, stage: d.properties?.dealstage || '' });
    }
    after = res.paging?.next?.after;
  } while (after);
  return out;
}

async function main() {
  // [CLIENT-ATLAS] is the Monday lead machine's output. It was missing here, so
  // every lead it created was invisible to the feedback loop — Atlas could never
  // learn from the deals it caused.
  const deals = [
    ...(await fetchDeals('CLIENT-MANUAL')),
    ...(await fetchDeals('CLIENT-ATLAS')),
    ...(await fetchDeals('ATLAS-RADAR')),
  ];
  console.log(`deals: ${deals.length} ([CLIENT-MANUAL] + [CLIENT-ATLAS] + [ATLAS-RADAR])`);

  const outcomes = {};
  // Per-ANGLE outcomes: the lead machine stamps " · social_proof" etc. on the deal
  // name. Lane tells Atlas which service converts; angle tells it which OPENING
  // converts — which is the thing Atlas rewrites every Monday and, until now, had
  // no way of grading.
  const byAngle = {};
  const blank = () => ({ staged: 0, sent: 0, replied: 0, won: 0, lost: 0, other: 0, total: 0 });
  const rate = (o) => {
    const reached = o.sent + o.replied + o.won + o.lost;
    return reached ? Math.round(((o.replied + o.won) / reached) * 100) : null;
  };

  for (const d of deals) {
    const v = lane(d.name);
    const bucket = STAGE[d.stage] || 'other';
    outcomes[v] = outcomes[v] || blank();
    outcomes[v][bucket] = (outcomes[v][bucket] || 0) + 1;
    outcomes[v].total++;

    const am = String(d.name || '').match(/·\s*([a-z_]+)\s*$/i);
    if (am) {
      const a = am[1].toLowerCase();
      byAngle[a] = byAngle[a] || blank();
      byAngle[a][bucket] = (byAngle[a][bucket] || 0) + 1;
      byAngle[a].total++;
    }
  }
  // Reply rate per lane — the "what converts" number Atlas serves.
  for (const v of Object.keys(outcomes)) outcomes[v].reply_rate = rate(outcomes[v]);
  for (const a of Object.keys(byAngle)) byAngle[a].reply_rate = rate(byAngle[a]);
  if (Object.keys(byAngle).length) {
    console.log('per-angle outcomes:', JSON.stringify(byAngle, null, 2));
    outcomes._by_angle = byAngle;
  }

  console.log(JSON.stringify(outcomes, null, 2));
  if (DRY) { console.log('(dry-run — not pushed)'); return; }
  if (!TOKEN) { console.error('ATLAS_OUTCOMES_TOKEN missing — cannot push'); process.exit(1); }

  const r = await fetch(`${ATLAS}/api/atlas/outcomes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'hs-outcomes-to-atlas', outcomes }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Atlas push ${r.status}: ${body.slice(0, 200)}`);
  console.log(`pushed to Atlas: ${body}`);
}

main().catch((e) => { console.error('hs-outcomes-to-atlas fatal:', e); process.exit(1); });
