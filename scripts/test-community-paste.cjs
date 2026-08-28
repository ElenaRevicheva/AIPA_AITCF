#!/usr/bin/env node
/**
 * The 28 Aug r/AI_UGC_Marketing paste was torn: Elena could copy one sentence,
 * and the POSTED confirmation stopped at "GPT-4 with" under a Reddit preview.
 *
 * These checks run against the compiled encoder. They do not call Telegram.
 *
 *   node scripts/test-community-paste.cjs
 */
'use strict';

const assert = require('assert');
const { isCompleteDraft } = require('../dist/community-listener.js');
const {
  encodePastePayload,
  buildCommunityCard,
  buildPostedConfirmation,
  communityDocumentFilename,
} = require('../dist/community-paste.js');
const { tgSafeText } = require('../dist/tg-text.js');
const followup = require('./community-ugc-followup.cjs');

const TORN =
  'You’re right that each model pulls from the sources it actually indexes, but “engine = UGC” isn’t the whole story. GPT-4 with';

const FULL =
  'You’re right that each model pulls from the sources it actually indexes, but “engine = UGC” isn’t the whole story. ' +
  'GPT-4 with browsing retrieves through a search index and cites a handful of sources; without browsing it reproduces training data. ' +
  'I built a free audit that scores that gap at https://aideazz.xyz/api';

const thread = {
  source: 'reddit',
  externalId: '1vz7a0f',
  url: 'https://www.reddit.com/r/AI_UGC_Marketing/comments/1vz7a0f/which_ugc_gets_you_cited_by_ai_depends_entirely/',
  title: 'Which UGC gets you cited by AI depends entirely on the engine, and I\'ve got the citation graph to prove it. (Plus the ChatGPT/Reddit twist.)',
  body: 'Anyone here making UGC specifically for AI pickup?',
  author: 'op',
  createdAt: Date.now(),
  channel: 'r/AI_UGC_Marketing',
  score: 14,
  matchedQuery: 'get recommended by ChatGPT Perplexity',
  latam: false,
};

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

console.log('\ncommunity paste encoder\n');

check('torn mid-sentence draft is refused', () => {
  assert.strictEqual(isCompleteDraft(TORN), false);
});

check('finished sentence is accepted', () => {
  assert.strictEqual(isCompleteDraft('Citations come from being the answer somewhere the model already looks.'), true);
});

check('draft that ends on the required URL is accepted', () => {
  assert.strictEqual(isCompleteDraft(FULL), true);
});

check('SKIP is not a paste', () => {
  assert.strictEqual(isCompleteDraft('SKIP'), false);
  assert.strictEqual(isCompleteDraft(''), false);
});

check('encodePastePayload is lossless — every sentence survives', () => {
  const encoded = encodePastePayload(FULL);
  assert.strictEqual(encoded, FULL);
  assert.ok(encoded.includes('GPT-4 with browsing'), 'second sentence missing');
  assert.ok(encoded.includes('https://aideazz.xyz/api'), 'URL missing');
  assert.ok(!encoded.startsWith('<'), 'paste payload must not be HTML');
  assert.ok(!encoded.includes('<pre>'), 'paste payload must not be wrapped in <pre>');
});

check('BOM and padding do not eat the body', () => {
  assert.strictEqual(encodePastePayload(`\uFEFF  ${FULL}  \n`), FULL);
});

check('card does not embed the draft, so HTML copy cannot tear it', () => {
  const card = buildCommunityCard(thread, FULL);
  assert.ok(card.includes('open the thread'), 'card lost the thread link');
  assert.ok(!card.includes('GPT-4 with browsing'), 'draft leaked into the HTML card');
  assert.ok(!card.includes('<pre>'), 'old <pre> wrapper is back');
});

check('default card keeps the Posted / Skip buttons — that is the attribution path', () => {
  const card = buildCommunityCard(thread, FULL);
  assert.ok(card.includes('The buttons below post nothing'), 'green-check copy missing from default card');
  const noButtons = buildCommunityCard(thread, FULL, { withButtons: false });
  assert.ok(!noButtons.includes('The buttons below post nothing'));
});

check('POSTED confirmation does not splice the draft under the Reddit URL', () => {
  const posted = buildPostedConfirmation({
    posted: true,
    stamp: '2026-08-28 11:41',
    source: 'reddit',
    title: thread.title,
    url: thread.url,
  });
  assert.ok(posted.startsWith('✅ POSTED'));
  assert.ok(posted.includes(thread.url));
  assert.ok(!posted.includes('GPT-4 with'), 'draft must not sit next to the URL');
  assert.ok(!posted.includes(FULL.slice(0, 40)));
});

check('.txt name is stable and paste-sized', () => {
  assert.strictEqual(communityDocumentFilename('reddit', '1vz7a0f'), 'reddit-1vz7a0f-reply.txt');
  const bytes = Buffer.from(encodePastePayload(FULL), 'utf8');
  assert.ok(bytes.length > 200, `file too small (${bytes.length})`);
  assert.strictEqual(bytes.toString('utf8'), FULL);
});

check('UGC follow-up is a complete paste, not another "GPT-4 with" fragment', () => {
  assert.strictEqual(isCompleteDraft(followup.draft), true);
  const encoded = encodePastePayload(followup.draft);
  assert.strictEqual(encoded, followup.draft.trim());
  assert.ok(encoded.includes('GPT-4 with browsing'), 'second thought missing');
  assert.ok(encoded.includes('https://aideazz.xyz/api'), 'audit URL missing');
  assert.ok(!encoded.endsWith('GPT-4 with'), 'follow-up is torn');
  const words = encoded.trim().split(/\s+/).length;
  assert.ok(words <= 140, `follow-up is ${words} words`);
});

check('old HTML+slice encoder would have torn a long reply — we no longer do that', () => {
  const oldCard = [
    'r/test · score 14',
    `<pre>${FULL.repeat(20)}</pre>`,
  ].join('\n');
  const sliced = tgSafeText(oldCard, 4090);
  assert.ok(sliced.length < oldCard.length, 'expected the old path to slice');
  const encoded = encodePastePayload(FULL.repeat(20));
  assert.strictEqual(encoded, FULL.repeat(20).trim());
  assert.ok(encoded.includes('https://aideazz.xyz/api'), 'sliced encoder ate the URL');
});

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
