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
  saveRadarLedger,
  radarKeyboard,
  openRadarItems,
  radarButtonsSentToday,
  markRadarButtonsSent,
  loadRadarButtonsSent,
  radarChatTargets,
  extractRadarTelegramMessageId,
  backfillLedgerEmailAliases,
  parseRadarDigestLoose,
  extractLastRadarDigest,
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

function digestFromKnownLogs() {
  const files = [
    '/home/ubuntu/logs/followup-radar.log',
    path.join(process.cwd(), 'data/followup-radar.log'),
    path.join(process.cwd(), 'logs/followup-radar.log'),
    '/home/ubuntu/cto-aipa/logs/followup-radar.log',
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const extracted = extractLastRadarDigest(raw);
    const items = parseRadarDigestLoose(extracted || '');
    if (items.length) return { file, items, raw: extracted };
  }
  return { file: '', items: [], raw: '' };
}

async function main() {
  loadEnv();
  const force = process.argv.includes('--force');
  const replace = process.argv.includes('--replace');
  const ifMissing = process.argv.includes('--if-missing') || (!force && !replace);

  if (ifMissing && !force && !replace && radarButtonsSentToday()) {
    console.log('skip=already-posted-today');
    return;
  }

  const ledger = loadRadarLedger();
  const backfilled = backfillLedgerEmailAliases(ledger);
  if (backfilled) {
    saveRadarLedger(ledger);
    console.log(`ledger_backfill=${backfilled}`);
  }

  const digest = digestFromKnownLogs();
  console.log(`digest_items=${digest.items.length}`);

  let resolved = discoverRadarProposal({ digestText: digest.items.length ? digest.raw : undefined });
  if (digest.items.length) {
    const emails = new Set(digest.items.map((it) => it.who.trim().toLowerCase()));
    const base = resolved?.proposal.items || digest.items;
    const items = base.filter((it) => emails.has(it.who.trim().toLowerCase()));
    resolved = {
      proposal: { id: resolved?.proposal.id || `rdr-${Date.now().toString(36)}`, items: items.length ? items : digest.items },
      source: 'digest',
    };
  }

  if (resolved?.proposal.items.length) {
    console.log(`discover=${resolved.source} items=${resolved.proposal.items.length}`);
  } else {
    console.log('discover=none');
  }

  if (!resolved?.proposal.items.length) {
    if (!replace) {
      console.error('FAIL: no open radar items from today\'s digest (HubSpot tasks are not a source)');
      process.exit(3);
    }
  } else {
    saveRadarProposal(resolved.proposal);
  }

  const open = resolved ? openRadarItems(resolved.proposal.items, ledger) : [];
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

  const markup = resolved
    ? radarKeyboard(resolved.proposal.id, resolved.proposal.items, ledger, true)
    : { inline_keyboard: [] };
  const buttons = markup.inline_keyboard.flat().length;
  const text = open.length
    ? `🧹 ${open.length} thread${open.length === 1 ? '' : 's'} on today's radar — tap Clean to stop seeing them. Mail is not touched.`
    : '🧹 Those month-old threads were already cleared. Buttons now match today\'s digest only.';

  const editIds = [
    ...(process.env.RADAR_EDIT_IDS || '').split(/[\s,]+/).map((s) => Number(s)).filter((n) => n > 0),
    ...(loadRadarButtonsSent().message_ids || []),
    5393,
    5394,
  ].filter((n, i, all) => all.indexOf(n) === i);

  let edited = 0;
  for (const messageId of editIds) {
    for (const chatId of targets) {
      try {
        await tg(token, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: markup,
        });
        edited += 1;
        console.log(`edited=1 message_id=${messageId} buttons=${buttons} chat=${maskChat(chatId)}`);
      } catch (e) {
        console.warn(`edit-miss message_id=${messageId} chat=${maskChat(chatId)}: ${(e && e.message) || e}`);
      }
    }
  }

  let posted = 0;
  let lastId = 0;
  if (!replace && !edited && open.length) {
    for (const chatId of targets) {
      try {
        const sent = await tg(token, 'sendMessage', {
          chat_id: chatId,
          text,
          reply_markup: markup,
        });
        posted += 1;
        lastId = sent.message_id || lastId;
        editIds.push(sent.message_id);
        console.log(`posted=1 items=${open.length} buttons=${buttons} source=${resolved.source} chat=${maskChat(chatId)} message_id=${sent.message_id}`);
      } catch (e) {
        console.error(`send-fail chat=${maskChat(chatId)}: ${(e && e.message) || e}`);
      }
    }
  }

  if (posted || edited) {
    markRadarButtonsSent(undefined, new Date(), { message_ids: editIds });
    console.log(`ok items=${open.length} posted=${posted} edited=${edited} last_message_id=${lastId}`);
    return;
  }
  if (replace) {
    console.error('FAIL: could not edit the resurrected button rows');
    process.exit(4);
  }
  console.error('FAIL: telegram send produced no message');
  process.exit(4);
}

main().catch((e) => {
  console.error('FAIL:', (e && e.message) || e);
  process.exit(1);
});
