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
  saveRadarProposal,
  loadRadarProposal,
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

if (failures.length) {
  console.error('FAIL: ' + failures.join(' | '));
  process.exit(1);
}
console.log(`PASS: ${passed} radar-cleanup checks`);
