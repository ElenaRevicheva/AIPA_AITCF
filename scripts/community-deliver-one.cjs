#!/usr/bin/env node
/**
 * Deliver one complete, copy-ready community reply to Elena's Telegram,
 * with the green-check attribution path (Oracle row + HubSpot [COMMUNITY] task).
 *
 *   node scripts/community-deliver-one.cjs
 *   node scripts/community-deliver-one.cjs --already-posted
 *   node scripts/community-deliver-one.cjs scripts/community-ugc-followup.cjs --already-posted
 */
'use strict';

const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv absent is fine when the process already has env */
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const alreadyPosted = args.includes('--already-posted');
const payloadArg = args.find((a) => !a.startsWith('--'));
const payloadPath = payloadArg
  ? path.resolve(payloadArg)
  : path.join(__dirname, 'community-ugc-followup.cjs');

const payload = require(payloadPath);
const { isCompleteDraft } = require('../dist/community-listener.js');
const { encodePastePayload } = require('../dist/community-paste.js');
const {
  offerAndDeliverCommunityReply,
  recordAlreadyPosted,
} = require('../dist/community-notify.js');
const { stats } = require('../dist/community-store.js');

(async () => {
  const draft = encodePastePayload(payload.draft, {
    source: payload.source,
    externalId: payload.externalId,
  });
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

  if (alreadyPosted) {
    console.log(`--- recording POSTED ${thread.channel} ${thread.externalId} ---`);
    const result = await recordAlreadyPosted(thread, draft);
    console.log(JSON.stringify({ ...result, stats: result.stats }, null, 2));
    if (!result.ok || result.status !== 'posted') {
      console.error('failed to record posted attribution');
      process.exit(1);
    }
    console.log(
      `ok — posted=${result.stats.posted} queued=${result.stats.queued} hsTaskId=${result.hsTaskId} id=${result.id}`,
    );
    return;
  }

  console.log(`--- offering ${thread.channel} ${thread.externalId} (${draft.length} chars) with Posted button ---`);
  const result = await offerAndDeliverCommunityReply(thread, draft);
  console.log(JSON.stringify(result));
  if (!result.ok) {
    console.error('Telegram copy payload did not land');
    process.exit(1);
  }
  const s = await stats();
  console.log(`ok — green check is on the card. queued=${s.queued} posted=${s.posted}`);
})().catch((e) => {
  console.error('community-deliver-one failed:', e.message);
  process.exit(1);
});
