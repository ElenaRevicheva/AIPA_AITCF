#!/usr/bin/env node
/**
 * Force-post Follow-up radar Clean / Keep buttons into Elena's Telegram chat.
 *
 * Runs on Oracle only. Reads TELEGRAM_BOT_TOKEN from .env. Discovers today's
 * threads from radar-proposal.json, followup-radar.log, or open HubSpot
 * [FOLLOWUP-RADAR] tasks. Never prints addresses — CI logs are public enough.
 *
 *   node scripts/post-radar-buttons-now.cjs --force
 *   node scripts/post-radar-buttons-now.cjs --if-missing
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist/radar-cleanup.js');
if (!fs.existsSync(DIST)) {
  console.error('FAIL: dist/radar-cleanup.js missing — compile first');
  process.exit(2);
}

const {
  discoverRadarProposal,
  saveRadarProposal,
  loadRadarLedger,
  radarKeyboard,
  openRadarItems,
  radarButtonsSentToday,
  markRadarButtonsSent,
  radarChatTargets,
  extractRadarTelegramMessageId,
  radarItemKey,
} = require(DIST);

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

function env(name) {
  return (process.env[name] || '').trim();
}

function maskChat(id) {
  return `…${String(id).slice(-4)}`;
}

async function hsSearchRadarTasks(key) {
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: 'hs_task_subject', operator: 'CONTAINS_TOKEN', value: 'FOLLOWUP' },
          { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' },
        ],
      },
    ],
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_timestamp'],
    limit: 50,
  };
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`hs: search ${res.status}`);
    return [];
  }
  const json = await res.json();
  const items = [];
  const seen = new Set();
  for (const t of json.results || []) {
    const subj = String(t.properties?.hs_task_subject || '');
    const blob = `${subj}\n${t.properties?.hs_task_body || ''}`;
    if (!/FOLLOWUP-RADAR|Follow-up radar/i.test(blob)) continue;
    const emails = blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    const who = emails.find((e) => !/@aideazz\./i.test(e) && !/@hubspot/i.test(e));
    if (!who || seen.has(who.toLowerCase())) continue;
    seen.add(who.toLowerCase());
    const ageM = blob.match(/(\d+)\s*d(?:ays?)?\b/i);
    const subject = subj.replace(/\[FOLLOWUP-RADAR\]/ig, '').trim().slice(0, 80);
    items.push({
      key: radarItemKey(who, subject),
      who,
      subject,
      age: ageM ? Number(ageM[1]) : 0,
      stale: true,
    });
  }
  return items;
}

async function tg(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${method} ${json.error_code || res.status}: ${json.description || 'failed'}`);
  }
  return json.result;
}

async function main() {
  loadEnv();
  const force = process.argv.includes('--force');
  const ifMissing = process.argv.includes('--if-missing') || !force;

  if (ifMissing && !force && radarButtonsSentToday()) {
    console.log('skip=already-posted-today');
    return;
  }

  let resolved = discoverRadarProposal({});
  if (resolved?.proposal.items.length) {
    console.log(`discover=${resolved.source} items=${resolved.proposal.items.length}`);
  } else {
    console.log('discover=none');
    const key = env('HUBSPOT_API_KEY');
    if (key) {
      try {
        const items = await hsSearchRadarTasks(key);
        console.log(`hs_open_tasks=${items.length}`);
        if (items.length) {
          resolved = { proposal: { id: `rdr-${Date.now().toString(36)}`, items }, source: 'hubspot' };
        }
      } catch (e) {
        console.warn(`hs: ${(e && e.message) || e}`);
      }
    } else {
      console.log('hs=no-key');
    }
  }

  if (!resolved?.proposal.items.length) {
    console.error('FAIL: no open radar items (stale proposal ignored; no digest log; no HS tasks)');
    process.exit(3);
  }

  saveRadarProposal(resolved.proposal);
  const ledger = loadRadarLedger();
  const open = openRadarItems(resolved.proposal.items, ledger);
  if (!open.length) {
    console.log('skip=all-cleared items=' + resolved.proposal.items.length);
    return;
  }

  const token = env('TELEGRAM_BOT_TOKEN');
  const targets = radarChatTargets();
  if (!token) {
    console.error('FAIL: TELEGRAM_BOT_TOKEN missing');
    process.exit(2);
  }
  if (!targets.length) {
    console.error('FAIL: no chat ids (TELEGRAM_AUTHORIZED_USERS / CONCIERGE_TG_CHAT)');
    process.exit(2);
  }

  const markup = radarKeyboard(resolved.proposal.id, resolved.proposal.items, ledger, true);
  const buttons = markup.inline_keyboard.flat().length;
  const text = `🧹 ${open.length} thread${open.length === 1 ? '' : 's'} on today's radar — tap Clean to stop seeing them. Mail is not touched.`;

  let edited = 0;
  const logFiles = [
    path.join(process.cwd(), 'data/followup-radar.log'),
    path.join(process.cwd(), 'logs/followup-radar.log'),
    '/home/ubuntu/cto-aipa/logs/followup-radar.log',
  ];
  for (const file of logFiles) {
    if (!fs.existsSync(file)) continue;
    const mid = extractRadarTelegramMessageId(fs.readFileSync(file, 'utf8'));
    if (!mid) continue;
    for (const chatId of targets) {
      try {
        await tg(token, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: mid,
          reply_markup: markup,
        });
        edited += 1;
        console.log(`edited=1 message_id=${mid} chat=${maskChat(chatId)}`);
      } catch (e) {
        console.warn(`edit-miss chat=${maskChat(chatId)}: ${(e && e.message) || e}`);
      }
    }
    break;
  }

  let posted = 0;
  let lastId = 0;
  if (!edited) {
    for (const chatId of targets) {
      try {
        const sent = await tg(token, 'sendMessage', {
          chat_id: chatId,
          text,
          reply_markup: markup,
        });
        posted += 1;
        lastId = sent.message_id || lastId;
        console.log(`posted=1 items=${open.length} buttons=${buttons} source=${resolved.source} chat=${maskChat(chatId)} message_id=${sent.message_id}`);
      } catch (e) {
        console.error(`send-fail chat=${maskChat(chatId)}: ${(e && e.message) || e}`);
      }
    }
  }

  if (posted || edited) {
    markRadarButtonsSent();
    console.log(`ok items=${open.length} posted=${posted} edited=${edited} last_message_id=${lastId}`);
    return;
  }
  console.error('FAIL: telegram send produced no message');
  process.exit(4);
}

main().catch((e) => {
  console.error('FAIL:', (e && e.message) || e);
  process.exit(1);
});
