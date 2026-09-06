#!/usr/bin/env node
/**
 * Gate tests for Follow-up radar Clean / Keep buttons (src/radar-cleanup.ts).
 *
 * The 6 Sep 2026 regression: today's digest listed three live threads (4–5d)
 * and attached zero buttons, because the keyboard was gated on `item.stale`.
 * These checks lock the rule that a thread Elena can already see is a thread
 * she can clean.
 *
 * Run: npx tsc --noEmit && node scripts/test-radar-cleanup.cjs
 * (needs dist/radar-cleanup.js — run `npx tsc` first)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist/radar-cleanup.js');
if (!fs.existsSync(DIST)) {
  console.error('dist/radar-cleanup.js missing — run `npx tsc` first');
  process.exit(1);
}

const {
  parseRadarDigest,
  isRadarDigest,
  radarKeyboard,
  radarItemKey,
  ledgerHides,
  openRadarItems,
  mergeRadarItems,
  resolveRadarProposal,
  discoverRadarProposal,
  saveRadarProposal,
  saveRadarLedger,
  loadRadarProposal,
  extractLastRadarDigest,
  extractRadarTelegramMessageId,
  itemsFromRadarJson,
  radarChatTargets,
  ledgerHidesItem,
  backfillLedgerEmailAliases,
  parseRadarDigestLoose,
} = require(DIST);

const failures = [];
let passed = 0;

function check(name, cond) {
  if (cond) passed++;
  else failures.push(name);
}

// Same shape as the live card (age + address + subject). Addresses are
// example.com — Claude's pii-guard treats those as fixtures, not people.
const TODAYS_DIGEST = [
  '🛰️ Follow-up radar',
  '🔴 THEY WROTE LAST — your move',
  '5d recruiter@example.com',
  'Interview Invitation + Next Steps',
  '4d billing@example.com',
  'Re: 2026-08-25-receipt',
  '🟡 YOU WROTE LAST — gone quiet, a nudge is free',
  '5d hello@example.com',
  'Quick first step before the vendor call',
].join('\n');

const parsed = parseRadarDigest(TODAYS_DIGEST);
check('parses three threads from today\'s card', parsed.length === 3);
check('parses first they-wrote', parsed[0]?.who === 'recruiter@example.com' && parsed[0]?.age === 5);
check('parses second they-wrote', parsed[1]?.who === 'billing@example.com' && parsed[1]?.age === 4);
check('parses you-wrote', parsed[2]?.who === 'hello@example.com' && parsed[2]?.age === 5);
check('subjects survive the parse', parsed[2]?.subject.includes('vendor call'));
check('isRadarDigest recognises the card', isRadarDigest(TODAYS_DIGEST) === true);
check('isRadarDigest rejects a random ping', isRadarDigest('Visibility audit lead 82/100') === false);

// The bug: none of these are marked stale by the Python proposer (4–5d),
// so the old keyboard (showAll=false, filter stale) rendered ZERO rows.
const notStale = parsed.map((it) => ({ ...it, stale: false }));
const oldShown = notStale.filter((it) => it.stale);
check('today\'s threads would have been hidden by the stale gate', oldShown.length === 0);

const kb = radarKeyboard('rdr-test', notStale, {});
const flat = kb.inline_keyboard.flat();
check('new keyboard still emits one button per thread', flat.filter((b) => b.callback_data.startsWith('rdrone:')).length === 3);
check('Clear N is present', flat.some((b) => /^🧹 Clear 3$/.test(b.text)));
check('Keep all is present', flat.some((b) => b.text === 'Keep all' && b.callback_data === 'rdrkeep:rdr-test'));
check('callback_data stays under Telegram\'s 64-byte cap',
  flat.every((b) => Buffer.byteLength(b.callback_data, 'utf8') <= 64));

const ledger = {
  [notStale[0].key]: { at: '2026-09-06T00:00:00Z', until: null, who: notStale[0].who, kind: 'dismissed' },
};
const afterOne = radarKeyboard('rdr-test', notStale, ledger);
const afterFlat = afterOne.inline_keyboard.flat();
check('a dismissed thread loses its button', afterFlat.filter((b) => b.callback_data.startsWith('rdrone:')).length === 2);
check('Clear N recounts what is still open', afterFlat.some((b) => b.text === '🧹 Clear 2'));

const keptExpired = {
  [notStale[1].key]: {
    at: '2026-08-01T00:00:00Z',
    until: '2026-08-15T00:00:00Z',
    who: notStale[1].who,
    kind: 'kept',
  },
};
check('an expired Keep snooze does not hide the thread',
  ledgerHides(keptExpired[notStale[1].key], new Date('2026-09-06T12:00:00Z')) === false);
check('a permanent dismiss still hides',
  ledgerHides({ at: '2026-09-01T00:00:00Z', until: null, kind: 'dismissed' }, new Date()) === true);
check('an active Keep snooze hides only until the date',
  ledgerHides({ at: '2026-09-06T00:00:00Z', until: '2026-09-20T00:00:00Z', kind: 'kept' }, new Date('2026-09-06T12:00:00Z')) === true);

const proposalItems = [
  { key: 'python-key-1', who: 'recruiter@example.com', subject: 'old subject', age: 9, stale: true },
];
const merged = mergeRadarItems(proposalItems, parsed);
check('merge keeps Python\'s key for a matched email', merged[0]?.key === 'python-key-1');
check('merge still adds threads Python omitted', merged.some((it) => it.who === 'hello@example.com'));
const resurrect = mergeRadarItems(
  [...proposalItems, { key: 'old', who: 'old@example.com', subject: 'gone', age: 32, stale: true }],
  parsed,
);
check('merge does not resurrect file-only leftovers', !resurrect.some((it) => it.who === 'old@example.com'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-cleanup-'));
saveRadarProposal({ id: 'from-disk', items: proposalItems }, tmp);
const resolved = resolveRadarProposal({ digestText: TODAYS_DIGEST, dir: tmp });
check('resolve merges disk proposal with the photographed digest',
  resolved?.source === 'merged' && resolved.proposal.id === 'from-disk' && resolved.proposal.items.length === 3);

const digestOnly = resolveRadarProposal({ digestText: TODAYS_DIGEST, dir: path.join(tmp, 'empty') });
check('resolve can stand up a proposal from the digest alone',
  digestOnly?.source === 'digest' && digestOnly.proposal.items.length === 3);

const reloaded = loadRadarProposal(tmp);
check('proposal round-trips to disk', reloaded?.id === 'from-disk');

check('openRadarItems drops dismissed keys', openRadarItems(notStale, ledger).length === 2);
check('radarItemKey is stable', radarItemKey('A@example.com', 'Hello  there') === 'a@example.com|hello there');

const {
  itemKeyAliases,
  dismissRadarItems,
  radarButtonsSentToday,
  markRadarButtonsSent,
} = require(DIST);
const byEmail = {};
dismissRadarItems([notStale[2]], byEmail, { at: '2026-09-06T12:00:00Z', until: null, kind: 'dismissed', who: notStale[2].who });
check('dismiss writes the email alias so tomorrow\'s Python key still matches',
  !!byEmail['hello@example.com'] && itemKeyAliases(notStale[2]).every((k) => byEmail[k]));
check('hiding by email alias removes the thread',
  openRadarItems([notStale[2]], { 'hello@example.com': byEmail['hello@example.com'] }).length === 0);

markRadarButtonsSent(tmp, new Date('2026-09-06T15:00:00Z'));
check('buttons-sent stamp is same-day', radarButtonsSentToday(tmp, new Date('2026-09-06T18:00:00Z')) === true);
check('buttons-sent stamp expires next day', radarButtonsSentToday(tmp, new Date('2026-09-07T00:01:00Z')) === false);

const LOG = [
  '2026-09-06 12:00:00 INFO sending digest',
  '📡 Follow-up radar',
  '🔴 THEY WROTE LAST — your move',
  '5d recruiter@example.com',
  'Interview Invitation + Next Steps',
  '4d billing@example.com',
  'Re: 2026-08-25-receipt',
  '🟡 YOU WROTE LAST — gone quiet, a nudge is free',
  '5d hello@example.com',
  'Quick first step before the vendor call',
  'telegram message_id=424242',
  '2026-09-06 12:32:00 INFO ✅ POSTED reddit',
].join('\n');
const extracted = extractLastRadarDigest(LOG);
check('extracts the last digest from a cron log', extractLastRadarDigest(LOG) != null && parseRadarDigest(extracted).length === 3);
check('extract ignores later POSTED lines', extracted && !/POSTED reddit/.test(extracted));
check('reads message_id from the log window', extractRadarTelegramMessageId(LOG) === 424242);
check('no message_id returns null', extractRadarTelegramMessageId('no ids here') === null);

const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-log-'));
fs.writeFileSync(path.join(logDir, 'followup-radar.log'), LOG);
const fromLog = discoverRadarProposal({ dir: logDir });
check('discover stands up a proposal from followup-radar.log',
  fromLog && fromLog.proposal.items.length === 3 && (fromLog.source === 'log' || fromLog.source === 'digest'));

const jsonItems = itemsFromRadarJson({
  threads: [{ email: 'ops@example.com', title: 'Ping', days: 6 }],
});
check('json dump with email/days normalises to a radar item',
  jsonItems.length === 1 && jsonItems[0].who === 'ops@example.com' && jsonItems[0].age === 6);

const chats = radarChatTargets({
  TELEGRAM_AUTHORIZED_USERS: '111, 222',
  CONCIERGE_TG_CHAT: '111',
  COMMUNITY_TG_CHAT: '333',
});
check('chat targets union env ids and drop dupes',
  chats.length === 3 && chats.includes(111) && chats.includes(333));
check('chat targets ignore empty', radarChatTargets({}).length === 0);

const leftover = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-leftover-'));
saveRadarProposal({
  id: 'old-cleared',
  items: [{ key: 'old@example.com|gone', who: 'old@example.com', subject: 'gone', age: 40, stale: true }],
}, leftover);
saveRadarLedger({
  'old@example.com': { at: '2026-08-01T00:00:00Z', until: null, kind: 'dismissed', who: 'old@example.com' },
}, leftover);
check('a leftover cleared proposal alone is not a live digest',
  discoverRadarProposal({ dir: leftover }) === null);
fs.writeFileSync(path.join(leftover, 'followup-radar.log'), LOG);
const rescued = discoverRadarProposal({ dir: leftover });
check('today\'s log still wins over a leftover cleared proposal',
  rescued != null && rescued.proposal.items.some((it) => it.who === 'recruiter@example.com')
  && rescued.proposal.items.length >= 3);

const wedKey = 'service@example.com|month old outreach';
const wedLedger = {
  [wedKey]: { at: '2026-09-02T12:00:00Z', until: null, kind: 'dismissed', who: 'service@example.com' },
};
const hsResurrect = { key: 'service@example.com|[followup-radar] they', who: 'service@example.com', subject: '[FOLLOWUP-RADAR] THEY', age: 32 };
check('Wednesday Clean still hides a HubSpot task with a new key',
  ledgerHidesItem(hsResurrect, wedLedger) === true);
const emptyAliases = { [wedKey]: { at: '2026-09-02T12:00:00Z', until: null, kind: 'dismissed' } };
check('email prefix on an old Python key is enough to hide',
  ledgerHidesItem(hsResurrect, emptyAliases) === true);
const filled = { ...emptyAliases };
check('backfill writes the email alias', backfillLedgerEmailAliases(filled) === 1 && !!filled['service@example.com']);

const loose = parseRadarDigestLoose('notify ok\n32 days waiting on ops@example.com (THEY)\n');
check('loose log parse finds age+email without the card layout',
  loose.length === 1 && loose[0].who === 'ops@example.com' && loose[0].age === 32);

const hsDump = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-hsdump-'));
saveRadarProposal({
  id: 'hs-dump',
  items: [
    { key: 'old', who: 'old@example.com', subject: 'month old', age: 32, stale: true },
    { key: 'python-key-1', who: 'recruiter@example.com', subject: 'old subject', age: 9, stale: true },
  ],
}, hsDump);
fs.writeFileSync(path.join(hsDump, 'followup-radar.log'), LOG);
const fromDump = discoverRadarProposal({ dir: hsDump });
check('a HubSpot dump cannot out-vote today\'s digest',
  fromDump != null
  && fromDump.proposal.items.length === 3
  && !fromDump.proposal.items.some((it) => it.who === 'old@example.com'));

if (failures.length) {
  console.error('FAIL: ' + failures.join(' | '));
  process.exit(1);
}
console.log(`PASS: ${passed} radar-cleanup checks`);
