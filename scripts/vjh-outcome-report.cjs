#!/usr/bin/env node
/**
 * vjh-outcome-report.cjs  (July 9 2026)
 *
 * READ-ONLY. Adapts JobCopilot's "delete jobs you don't like — this trains your
 * copilot" feedback loop to VJH: instead of VJH's gate/judge being static code
 * that only changes when a human edits it, this reports what Elena has actually
 * DONE with the [HIRING-VJH*] deals VJH already surfaced — which ones she moved
 * forward on vs. left parked/rejected — so the gate/judge can be tuned by hand
 * from real outcomes instead of guesswork. Makes NO changes to HubSpot or to VJH.
 *
 * Stage grounding (verified live via /crm/v3/pipelines/deals, July 9 2026):
 *   appointmentscheduled -> "AI working — ignore (not triaged yet)"   = UNTRIAGED
 *   qualifiedtobuy        -> "I Act TODAY (Elena's part)"             = ACTED ON
 *   presentationscheduled -> "I Act this week (Elena's part)"         = ACTED ON
 *   decisionmakerboughtin -> "Sent — passive wait"                    = IN PROGRESS
 *   contractsent           -> "They replied — I act"                 = ACTED ON
 *   closedwon               -> "Won"                                 = ACTED ON
 *   closedlost               -> "No fit (Rejected / ghosted)"        = REJECTED
 *
 * Usage:
 *   HUBSPOT_API_KEY=... node scripts/vjh-outcome-report.cjs
 */

const KEY = process.env.HUBSPOT_API_KEY || '';
const BASE = 'https://api.hubapi.com';

const ACTED_ON = new Set(['qualifiedtobuy', 'presentationscheduled', 'contractsent', 'closedwon']);
const IN_PROGRESS = new Set(['decisionmakerboughtin']);
const REJECTED = new Set(['closedlost']);
const UNTRIAGED = new Set(['appointmentscheduled']);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'at', 'with', 'on',
  'hiring', 'lead', 'serp', 'vjh', 'remote',
]);

async function fetchAllHiringDeals() {
  const deals = [];
  let after;
  for (;;) {
    const body = {
      filterGroups: [{ filters: [
        { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'HIRING' },
      ] }],
      properties: ['dealname', 'dealstage', 'createdate', 'hs_lastmodifieddate'],
      limit: 100,
      ...(after ? { after } : {}),
    };
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`HubSpot search failed: ${res.status} ${JSON.stringify(json)}`);
    deals.push(...(json.results || []));
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return deals;
}

function bucketOf(stage) {
  if (ACTED_ON.has(stage)) return 'ACTED_ON';
  if (IN_PROGRESS.has(stage)) return 'IN_PROGRESS';
  if (REJECTED.has(stage)) return 'REJECTED';
  if (UNTRIAGED.has(stage)) return 'UNTRIAGED';
  return 'OTHER';
}

function sourcePrefixOf(dealname) {
  const m = /^\[([A-Z0-9_-]+)\]/.exec(dealname || '');
  return m ? m[1] : '(no prefix)';
}

function wordFreq(titles) {
  const freq = new Map();
  for (const t of titles) {
    const words = (t || '')
      .toLowerCase()
      .replace(/^\[[a-z0-9_-]+\]\s*/i, '') // strip [PREFIX]
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
}

async function main() {
  if (!KEY) {
    console.error('Set HUBSPOT_API_KEY first.');
    process.exit(1);
  }
  const deals = await fetchAllHiringDeals();
  console.log(`Fetched ${deals.length} [HIRING-*] deals.\n`);

  const buckets = { ACTED_ON: [], IN_PROGRESS: [], REJECTED: [], UNTRIAGED: [], OTHER: [] };
  const byPrefix = {};

  for (const d of deals) {
    const stage = d.properties.dealstage;
    const name = d.properties.dealname;
    const bucket = bucketOf(stage);
    buckets[bucket].push(name);
    const prefix = sourcePrefixOf(name);
    byPrefix[prefix] = byPrefix[prefix] || { ACTED_ON: 0, IN_PROGRESS: 0, REJECTED: 0, UNTRIAGED: 0, OTHER: 0 };
    byPrefix[prefix][bucket]++;
  }

  console.log('=== Outcome counts ===');
  for (const [bucket, list] of Object.entries(buckets)) {
    console.log(`${bucket.padEnd(12)} ${list.length}`);
  }

  console.log('\n=== By source (which VJH path finds jobs Elena actually acts on) ===');
  for (const [prefix, counts] of Object.entries(byPrefix)) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const actedPct = total ? ((counts.ACTED_ON / total) * 100).toFixed(0) : '0';
    console.log(`${prefix.padEnd(24)} total=${total}  acted-on=${counts.ACTED_ON} (${actedPct}%)  rejected=${counts.REJECTED}  untriaged=${counts.UNTRIAGED}`);
  }

  console.log('\n=== Top words in ACTED-ON titles (what she likes) ===');
  for (const [w, n] of wordFreq(buckets.ACTED_ON)) console.log(`  ${n}  ${w}`);

  console.log('\n=== Top words in REJECTED titles (what to gate out harder) ===');
  for (const [w, n] of wordFreq(buckets.REJECTED)) console.log(`  ${n}  ${w}`);

  console.log('\nRead-only report — no HubSpot or VJH changes made.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
