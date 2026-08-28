#!/usr/bin/env node
/**
 * Deliver one complete, copy-ready community reply to Elena's Telegram.
 * Runs on Oracle (needs TELEGRAM_BOT_TOKEN + COMMUNITY_TG_CHAT / CONCIERGE_TG_CHAT).
 *
 *   node scripts/community-deliver-one.cjs
 *   node scripts/community-deliver-one.cjs scripts/community-ugc-followup.cjs
 */
'use strict';

const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv absent is fine when the process already has env */
}

const payloadPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'community-ugc-followup.cjs');

const payload = require(payloadPath);
const { isCompleteDraft } = require('../dist/community-listener.js');
const { encodePastePayload } = require('../dist/community-paste.js');
const { deliverCommunityPaste } = require('../dist/community-notify.js');

(async () => {
  const draft = encodePastePayload(payload.draft);
  if (!isCompleteDraft(draft)) {
    console.error('REFUSING torn paste — last 80 chars:', JSON.stringify(draft.slice(-80)));
    process.exit(1);
  }
  const thread = {
    source: payload.source,
    externalId: payload.externalId,
    url: payload.url,
    title: payload.title,
    body: payload.body || '',
    author: payload.author || '',
    createdAt: payload.createdAt || Date.now(),
    channel: payload.channel,
    score: payload.score || 0,
    matchedQuery: payload.matchedQuery || '',
    latam: Boolean(payload.latam),
  };
  console.log(`--- delivering ${thread.channel} ${thread.externalId} (${draft.length} chars) ---`);
  const result = await deliverCommunityPaste(thread, draft);
  console.log(JSON.stringify(result));
  if (!result.ok) {
    console.error('Telegram copy payload did not land');
    process.exit(1);
  }
  console.log('ok — long-press Copy on the plain-text message, or open the .txt');
})().catch((e) => {
  console.error('community-deliver-one failed:', e.message);
  process.exit(1);
});
