#!/usr/bin/env node
/**
 * Put the already-posted UGC follow-up on a HubSpot Deal Elena can open
 * on mobile. Completed orphan tasks are invisible in Due / Search → Tasks.
 *
 *   node scripts/hs-pin-community-board.cjs
 */
'use strict';

const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* env already present on Oracle */
}

const payload = require('./community-ugc-followup.cjs');
const { getOpportunityBySourceExternal } = require('../dist/community-store.js');
const {
  pinBoardAndTellElena,
  COMMUNITY_BOARD_DEAL_NAME,
} = require('../dist/community-notify.js');

(async () => {
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
  const existing = await getOpportunityBySourceExternal(thread.source, thread.externalId);
  console.log('--- pin community board ---');
  console.log('oracle row', existing ? 'found' : 'missing', 'status', existing?.status ?? null);
  const pin = await pinBoardAndTellElena({
    thread,
    hsTaskId: existing?.hsTaskId ?? null,
  });
  const out = {
    dealName: COMMUNITY_BOARD_DEAL_NAME,
    dealId: pin.dealId,
    dealUrl: pin.dealUrl,
    taskId: pin.taskId,
    taskStatus: pin.taskStatus,
    noteId: pin.noteId,
    telegramCardId: pin.cardId,
    objectType: 'deal 0-3 (not task 0-27)',
  };
  console.log(JSON.stringify(out, null, 2));
  if (!pin.dealId || !pin.dealUrl || !pin.dealUrl.includes('/record/0-3/')) {
    console.error('failed to pin a mobile-openable HubSpot deal');
    process.exit(1);
  }
  if (!pin.cardId) {
    console.warn('deal pinned but Telegram directions did not send');
  }
  console.log(`ok — open ${pin.dealUrl}`);
})().catch((e) => {
  console.error('hs-pin-community-board failed:', e.message);
  process.exit(1);
});
