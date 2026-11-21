#!/usr/bin/env node
/**
 * EspaLuz people watch (21 Nov 2026).
 *
 * Elena: "I do not have time to look in WhatsApp or Telegram every 5 seconds. If a person is truly tracked, you are
 * responsible to detect them and outreach to them - otherwise I will be flooded with information I cannot handle."
 *
 * So the BOTS do the outreach (instant greeting, one nudge 18-23 h later: espaluz_catch.nudge_pass) and this watcher
 * decides what reaches Elena:
 *   every 5 min  - only people who NEED A HUMAN (needs_human events: price / premium / payment / a real person /
 *                  a complaint), at most once per person per 12 h (the bots rate-limit). Her own test ids are skipped.
 *                - web sign-ups that came from a film (auth user_metadata.first_touch) become HubSpot deals
 *                  ([ESPALUZ] WEB <email> — trial) through the existing /api/crm-event door. No message to Elena.
 *   --digest     - ONE daily summary: who arrived from which film, what the system already did, what needs her.
 *                  With --stdout it is printed instead of sent: espaluz-funnel-weekly.mjs --films (13:40 UTC) appends it,
 *                  so Elena gets ONE daily EspaLuz message (inventory: docs/espaluz/ESPALUZ_LEAD_INSTRUMENTS_INVENTORY_2026-11-21.md).
 *
 * Run on Oracle:  cd ~/cto-aipa && node scripts/espaluz-people-watch.mjs [--digest] [--dry]
 * State: ~/cto-aipa/.espaluz-people-watch.json (cursors). Reads the bots' shared Postgres through the Familybot venv.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const HOME = os.homedir();
const ROOT = path.join(HOME, 'cto-aipa');
const FAMILYBOT = path.join(HOME, 'EspaLuzFamilybot');
const STATE = path.join(ROOT, '.espaluz-people-watch.json');
const DIGEST = process.argv.includes('--digest');
const DRY = process.argv.includes('--dry');
const STDOUT = process.argv.includes('--stdout');

function readEnv(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
  } catch { return {}; }
}
const ENV = { ...readEnv(path.join(ROOT, '.env')), ...process.env };
const TG = ENV.TELEGRAM_BOT_TOKEN;
const CHAT = (ENV.CONCIERGE_TG_CHAT || ENV.TELEGRAM_AUTHORIZED_USERS || '').split(',')[0].trim();
const OWNER = new Set((ENV.ESPALUZ_OWNER_IDS || '').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean));
const isOwner = (who) => OWNER.has(String(who).replace(/\D/g, ''));
const isTest = (film) => /eeee/.test(film || '');   // go/no-go test code, never a real person

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const saveState = (s) => { if (!DRY) fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };

/** Shared bots' database, read through the Familybot venv (same pattern as espaluz-funnel-weekly.mjs). */
function sql(query, params = []) {
  const py = [
    'import json, os, sys, psycopg2',
    "c = psycopg2.connect(os.getenv('ESPALUZ_UNIFIED_DB_URL') or os.getenv('DATABASE_URL_UNIFIED'), connect_timeout=8)",
    'cur = c.cursor(); cur.execute(os.environ["Q"], json.loads(os.environ["P"]))',
    'print(json.dumps([[v.isoformat() if hasattr(v, "isoformat") else v for v in r] for r in cur.fetchall()]))',
  ].join('\n');
  const out = execFileSync('bash', ['-c', `cd ${FAMILYBOT} && set -a && . ./.env && set +a && venv/bin/python -c "$PY"`], {
    env: { ...process.env, PY: py, Q: query, P: JSON.stringify(params) }, encoding: 'utf8', timeout: 30_000,
  });
  return JSON.parse(out.trim().split('\n').pop());
}

async function telegram(text) {
  if (DRY) { console.log('--- would send ---\n' + text); return true; }
  if (!TG || !CHAT) { console.error('people-watch: TELEGRAM_BOT_TOKEN / chat missing'); return false; }
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
  });
  return r.ok;
}

const where = (tag) => ({ fb: 'Facebook', ig: 'Instagram', yt: 'YouTube', li: 'LinkedIn' }[tag] || (/^g\d+$/.test(tag) ? `Facebook group ${tag.slice(1)}` : tag || '?'));
const filmOf = (reason) => { const m = /^(f\d{8}[0-9a-f]{4})-(\w+)$/.exec(reason || ''); return m ? { film: m[1], tag: m[2] } : null; };
const door = (platform, who) => platform === 'whatsapp' ? `https://wa.me/${String(who).replace(/\D/g, '')}` : `Telegram id ${who} (reply through the bot)`;

/** The film each person arrived with (their latest promo_arrival), for context in alerts and the digest. */
function arrivalsByWho() {
  const rows = sql("SELECT platform, event_data->>'who', event_data->>'reason', MAX(created_at) FROM event_log " +
    "WHERE event_type='promo_arrival' GROUP BY 1,2,3");
  const m = new Map();
  for (const [p, w, r] of rows) m.set(`${p}:${w}`, r);
  return m;
}

// 1. People who need a human -> Elena, at once.
async function needsHuman(state) {
  const since = state.humanSince || new Date(Date.now() - 60 * 60_000).toISOString();
  const rows = sql("SELECT platform, event_data->>'who', event_data->>'reason', created_at FROM event_log " +
    "WHERE event_type='needs_human' AND created_at > %s::timestamp ORDER BY created_at", [since.replace('Z', '')]);
  if (!rows.length) return 0;
  const films = arrivalsByWho();
  let sent = 0;
  for (const [platform, who, text, at] of rows) {
    state.humanSince = at;
    if (isOwner(who)) continue;
    const f = filmOf(films.get(`${platform}:${who}`));
    const ok = await telegram(
      `🙋 EspaLuz: a person needs you (${platform})\n` +
      `"${String(text).slice(0, 220)}"\n` +
      (f && !isTest(f.film) ? `Came from film ${f.film} on ${where(f.tag)}.\n` : '') +
      `Reach them: ${door(platform, who)}\n` +
      `The bot has already answered; this is for a personal reply (price, premium, a human, a complaint).`);
    if (ok) sent++;
  }
  return sent;
}

// 2. Web sign-ups from a film -> HubSpot deal (no message to Elena; they appear in the digest).
async function webSignups(state) {
  const url = (ENV.ESPALUZ_SUPABASE_URL || '').replace(/\/$/, '');
  const key = ENV.ESPALUZ_SUPABASE_SERVICE_KEY;
  if (!url || !key) return 0;
  const since = state.webSince || new Date(Date.now() - 24 * 3600_000).toISOString();
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=100&page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) { console.error('people-watch: auth users', r.status); return 0; }
  const users = ((await r.json()).users || []).filter((u) => u.created_at > since).sort((a, b) => a.created_at.localeCompare(b.created_at));
  let made = 0;
  for (const u of users) {
    state.webSince = u.created_at;
    const ft = u.user_metadata?.first_touch || {};
    const film = ft.utm_campaign || ft.campaign || '';
    if (!/^f\d{8}/.test(film) || isTest(film)) continue;          // only film arrivals become film deals
    const tag = ft.content || ft.utm_content || '';                // web/track.ts stores { campaign, source, content, at }
    const platform = ft.source || ft.utm_source || 'web';
    (state.web ||= []).push({ at: u.created_at, email: u.email, film, platform });
    if (DRY) { console.log('would create web deal', film, platform); continue; }
    const res = await fetch('http://127.0.0.1:' + (ENV.PORT || 3000) + '/api/crm-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.OUTREACH_SECRET}` },
      body: JSON.stringify({ source: 'espaluz_web', type: 'film_arrival', pipeline: 'client', name: u.email, userId: u.email,
        context: `EspaLuz web | arrived from film ${film} on ${platform} | signed up on app.espaluz.lat`,
        utm_campaign: film, utm_content: tag || platform, signalStrength: 'high' }),
    });
    console.log(`🌐 web sign-up from film ${film} (${platform}) -> HubSpot ${res.status}`);
    if (res.ok) made++;
  }
  if (state.web) state.web = state.web.filter((w) => Date.now() - Date.parse(w.at) < 3 * 86400_000);
  return made;
}

// 3. One daily summary.
async function digest(state) {
  const rows = sql("SELECT a.platform, a.event_data->>'who', a.event_data->>'reason', a.created_at, " +
    "EXISTS (SELECT 1 FROM event_log n WHERE n.event_type='promo_nudge' AND n.platform=a.platform AND n.event_data->>'who'=a.event_data->>'who'), " +
    "EXISTS (SELECT 1 FROM event_log h WHERE h.event_type='needs_human' AND h.platform=a.platform AND h.event_data->>'who'=a.event_data->>'who' AND h.created_at > NOW() - INTERVAL '24 hours') " +
    "FROM event_log a WHERE a.event_type='promo_arrival' AND a.created_at > NOW() - INTERVAL '24 hours' ORDER BY a.created_at");
  const people = new Map();
  for (const [platform, who, reason, at, nudged, human] of rows) {
    const f = filmOf(reason);
    if (isOwner(who) || !f || isTest(f.film)) continue;
    people.set(`${platform}:${who}`, { platform, who, ...f, at, nudged, human });
  }
  const web = (state.web || []).filter((w) => Date.now() - Date.parse(w.at) < 24 * 3600_000);
  const lines = [...people.values()].map((p) =>
    `• ${p.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} ${p.platform === 'whatsapp' ? '…' + String(p.who).replace(/\D/g, '').slice(-4) : 'user'} ` +
    `- film ${p.film} (${where(p.tag)}) - greeted${p.nudged ? ', nudged' : ''}${p.human ? ', 🙋 asked for a human (sent to you)' : ''}`);
  for (const w of web) lines.push(`• Web sign-up ${w.email.replace(/(^.).*(@.*$)/, '$1…$2')} - film ${w.film} (${w.platform}) - HubSpot deal made`);
  const text = lines.length
    ? `📣 EspaLuz people, last 24 h: ${lines.length}\n${lines.join('\n')}\n\nThe bots greeted everyone and nudge the quiet ones once. ` +
      `Anyone who needed a person was sent to you separately. Nothing else needs you today.`
    : '📣 EspaLuz people, last 24 h: no new film arrivals. Nothing needs you.';
  if (STDOUT) { console.log(text); return true; }   // 21 Nov 2026: printed into the 13:40 film report (one message)
  return telegram(text);
}

async function main() {
  const state = loadState();
  if (DIGEST) { await digest(state); saveState(state); return; }
  const human = await needsHuman(state);
  const web = await webSignups(state);
  saveState(state);
  if (human || web || DRY) console.log(`people-watch: needs-human sent ${human}, web deals ${web}`);
}

main().catch((e) => { console.error('people-watch failed:', e.message); process.exit(1); });
