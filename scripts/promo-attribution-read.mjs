#!/usr/bin/env node
/**
 * Read-only: what did promo films produce after the view? (Elena, 6 Nov 2026: "not just publish but track who will actually
 * watch this and click the product links".) Sessions by source/medium/campaign from GA4, counts only, no person data.
 * Run on Oracle from ~/cto-aipa: node scripts/promo-attribution-read.mjs [days]
 */
import dotenv from 'dotenv';
import { GA4_READONLY_SCOPE, getGoogleAccessToken } from './google-analytics-auth.mjs';

dotenv.config({ override: true });
const days = Number(process.argv[2] || 90);
const property = (process.env.GA4_PROPERTY_ID || '515154124').trim();
const token = await getGoogleAccessToken(GA4_READONLY_SCOPE);
if (!token) throw new Error('GA4 auth failed');

async function report(body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }], ...body }),
  });
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).rows || [];
}

const VIDEO = /youtube|youtu\.be|instagram|facebook|fb\.|ig\b|aigo|video|tiktok|buffer/i;
const rows = await report({
  dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'hostName' }],
  metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
  limit: 2000,
});
const all = rows.map((r) => ({ d: r.dimensionValues.map((x) => x.value), m: r.metricValues.map((x) => Number(x.value)) }));
const sum = (list, i) => list.reduce((n, r) => n + r.m[i], 0);
const video = all.filter((r) => VIDEO.test(r.d.slice(0, 3).join(' ')));
console.log(`last ${days} days, all sessions ${sum(all, 0)}, from video/social sources ${sum(video, 0)}, engaged ${sum(video, 1)}, key events ${sum(video, 2)}`);
console.log('source | medium | campaign | host | sessions | engaged | key events');
for (const r of video.sort((a, b) => b.m[0] - a.m[0]).slice(0, 30)) console.log([...r.d, ...r.m].join(' | '));

const events = await report({
  dimensions: [{ name: 'eventName' }, { name: 'hostName' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'PARTIAL_REGEXP', value: 'door|signup|sign_up|chat|lesson|wall|click' } } },
  limit: 60,
});
console.log('event | host | count');
for (const r of events) console.log([...r.dimensionValues.map((x) => x.value), r.metricValues[0].value].join(' | '));

// The EspaLuz app itself: arrivals by source, then every counted step.
const appFilter = { filter: { fieldName: 'hostName', stringFilter: { value: 'app.espaluz.lat' } } };
const arrivals = await report({ dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }], metrics: [{ name: 'sessions' }], dimensionFilter: appFilter, limit: 30 });
console.log('app.espaluz.lat arrivals: source | medium | sessions');
for (const r of arrivals) console.log([...r.dimensionValues.map((x) => x.value), r.metricValues[0].value].join(' | '));
const steps = await report({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: appFilter, limit: 40 });
console.log('app.espaluz.lat events: name | count');
for (const r of steps) console.log(r.dimensionValues[0].value, '|', r.metricValues[0].value);
