#!/usr/bin/env node
/**
 * Weekly EspaLuz funnel line (2 Nov 2026, Elena: "connect all the pieces into one funnel").
 *
 * Every machine that talks about EspaLuz sends families to https://aideazz.xyz/espaluz?utm_source=<machine>.
 * The page counts each door button (GA4 events espaluz_door_web / _whatsapp / _telegram). This script reads
 * the last 7 days and sends ONE line per source to Elena's Telegram:
 *     influencer: 12 visits -> 3 doors (wa 2, tg 1, web 0)
 * plus the payments the payment truth recorded in the same 7 days. Read-only everywhere.
 *
 * Run on Oracle:
 *   node scripts/espaluz-funnel-weekly.mjs --dry-run     # print, send nothing
 *   node scripts/espaluz-funnel-weekly.mjs
 * Cron: 30 13 * * 1 (after the Monday citation probe).
 */
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { GA4_READONLY_SCOPE, getGoogleAccessToken } from './google-analytics-auth.mjs';

dotenv.config({ override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const GA4_PROPERTY_ID = (process.env.GA4_PROPERTY_ID || '515154124').trim();
const TG = process.env.TELEGRAM_BOT_TOKEN?.trim();
const CHAT = (process.env.CONCIERGE_TG_CHAT || process.env.ATLAS_TELEGRAM_CHAT_ID || '').trim();
const FAMILYBOT = '/home/ubuntu/EspaLuzFamilybot';

async function ga4(body) {
  const token = await getGoogleAccessToken(GA4_READONLY_SCOPE);
  if (!token) throw new Error('GA4 auth failed — check GOOGLE_ANALYTICS_CREDENTIALS');
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], ...body }),
  });
  if (!res.ok) throw new Error(`GA4 runReport ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).rows || [];
}

/** Payments recorded by the one payment truth in the last 7 days (count only — no payer is printed). */
function paymentsLast7Days() {
  const py = [
    'import espaluz_payment_truth as t',
    'c=t._conn(); cur=c.cursor()',
    "cur.execute(\"SELECT provider, COUNT(*) FROM payment_events WHERE received_at > NOW() - INTERVAL '7 days' GROUP BY provider\")",
    "print(' '.join(f'{p}={n}' for p, n in cur.fetchall()) or 'none')",
  ].join('\n');
  try {
    const out = execFileSync('bash', ['-c', `cd ${FAMILYBOT} && set -a && . ./.env && set +a && venv/bin/python -c "$PY"`], {
      env: { ...process.env, PY: py },
      encoding: 'utf8',
      timeout: 30_000,
    });
    return out.trim().split('\n').pop();
  } catch (e) {
    return `unreadable (${String(e.message).slice(0, 80)})`;
  }
}

async function main() {
  const visits = await ga4({
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/espaluz' } } },
  });
  const doors = await ga4({
    dimensions: [{ name: 'sessionSource' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'BEGINS_WITH', value: 'espaluz_door_' } } },
  });

  const bySource = new Map();
  const row = (s) => {
    if (!bySource.has(s)) bySource.set(s, { visits: 0, web: 0, whatsapp: 0, telegram: 0 });
    return bySource.get(s);
  };
  for (const r of visits) row(r.dimensionValues[0].value).visits += Number(r.metricValues[0].value) || 0;
  for (const r of doors) {
    const door = r.dimensionValues[1].value.replace('espaluz_door_', '');
    row(r.dimensionValues[0].value)[door] = (row(r.dimensionValues[0].value)[door] || 0) + (Number(r.metricValues[0].value) || 0);
  }

  const lines = [...bySource.entries()]
    .sort((a, b) => b[1].visits - a[1].visits)
    .map(([src, v]) => {
      const total = v.web + v.whatsapp + v.telegram;
      return `${src}: ${v.visits} visits -> ${total} doors (wa ${v.whatsapp}, tg ${v.telegram}, web ${v.web})`;
    });
  // app.espaluz.lat (counting added 6 Nov 2026): where people stop inside the app. No classroom data beyond the open count.
  const appFilter = { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'app.espaluz.lat' } } };
  const appVisits = await ga4({
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: appFilter,
  });
  const appEvents = await ga4({
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { andGroup: { expressions: [
      appFilter,
      { filter: { fieldName: 'eventName', stringFilter: { matchType: 'BEGINS_WITH', value: 'app_' } } },
    ] } },
  });
  const appCount = new Map(appEvents.map((r) => [r.dimensionValues[0].value, Number(r.metricValues[0].value) || 0]));
  const n = (name) => appCount.get(name) || 0;
  const appSessions = appVisits.reduce((sum, r) => sum + (Number(r.metricValues[0].value) || 0), 0);
  const appSources = appVisits
    .slice(0, 5)
    .map((r) => `${r.dimensionValues[0].value} ${r.metricValues[0].value}`)
    .join(', ');
  const appLine =
    `app.espaluz.lat: ${appSessions} visits${appSources ? ` (${appSources})` : ''}\n` +
    `-> first chat ${n('app_chat_first')} -> came back ${n('app_chat_return')} -> free limit ${n('app_free_wall')}\n` +
    `-> sign-up sent ${n('app_signup_sent')}, failed ${n('app_signup_error')}, unconfirmed ${n('app_signin_unconfirmed')}, signed in ${n('app_signin')}\n` +
    `-> classroom opened ${n('app_classroom_open')}, doors wa ${n('app_door_whatsapp')}, tg ${n('app_door_telegram')}`;

  const text =
    `🦥🐒 EspaLuz funnel, last 7 days\n` +
    (lines.length ? lines.join('\n') : 'no visits to aideazz.xyz/espaluz yet') +
    `\n\n${appLine}` +
    `\n\npayments recorded: ${paymentsLast7Days()}`;

  console.log(text);
  if (DRY_RUN) return;
  if (!TG || !CHAT) {
    console.error('espaluz-funnel-weekly: TELEGRAM_BOT_TOKEN / CONCIERGE_TG_CHAT missing — nothing sent');
    process.exit(1);
  }
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
  });
  console.log(r.ok ? 'sent to Telegram' : `Telegram send failed: ${(await r.text()).slice(0, 200)}`);
}

main().catch((e) => {
  console.error('espaluz-funnel-weekly failed:', e.message);
  process.exit(1);
});
