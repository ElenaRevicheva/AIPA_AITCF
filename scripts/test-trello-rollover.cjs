// Unit checks for src/trello-rollover.ts (pure parts only — no Trello calls).
// Run after a build: node scripts/test-trello-rollover.cjs
const path = require('path');
const r = require(path.join(__dirname, '..', 'dist', 'trello-rollover.js'));

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

// Trigger: needs BOTH a move word and a paid word
eq('EN move paid cards', r.isRolloverRequest('move paid cards'), true);
eq('EN roll the paid ones up to the 15th', r.isRolloverRequest('Roll the paid ones up to the 15th'), true);
eq('RU перенеси оплаченные', r.isRolloverRequest('Перенеси оплаченные карточки'), true);
eq('RU оплатила, перенеси до 15', r.isRolloverRequest('я всё оплатила, перенеси до 15'), true);
eq('ES pasa las pagadas', r.isRolloverRequest('pasa las pagadas al mes que viene'), true);
eq('no paid word → normal Trello', r.isRolloverRequest('move the court cards to next month'), false);
eq('no move word → not a rollover', r.isRolloverRequest('I paid HubSpot today'), false);
eq('unrelated', r.isRolloverRequest('create a card for the dentist'), false);

// "up to" day
eq('up to the 15th', r.parseUpToDay('move paid cards up to the 15th'), 15);
eq('до 15', r.parseUpToDay('перенеси оплаченные до 15'), 15);
eq('по 10-е', r.parseUpToDay('перенеси оплаченные по 10-е'), 10);
eq('hasta el 13', r.parseUpToDay('pasa las pagadas hasta el 13'), 13);
eq('none said', r.parseUpToDay('move paid cards'), null);
eq('out of range', r.parseUpToDay('move paid cards up to 45'), null);

// Same day next month, same Panama clock (UTC-5)
eq('15 Nov 09:00 Panama → 15 Dec 09:00', r.nextMonthDue('2026-11-15T14:00:00.000Z'), '2026-12-15T14:00:00.000Z');
eq('13 Nov 08:40 → 13 Dec 08:40', r.nextMonthDue('2026-11-13T13:40:00.000Z'), '2026-12-13T13:40:00.000Z');
eq('Dec → Jan next year', r.nextMonthDue('2026-12-15T14:00:00.000Z'), '2027-01-15T14:00:00.000Z');
eq('31 Jan → 28 Feb (clamped)', r.nextMonthDue('2027-01-31T14:00:00.000Z'), '2027-02-28T14:00:00.000Z');
eq('late evening Panama stays same Panama day', r.nextMonthDue('2026-11-16T02:30:00.000Z'), '2026-12-16T02:30:00.000Z');
eq('fmtPanama', r.fmtPanama('2026-12-15T14:00:00.000Z'), '15 Dic 09:00');

// Cancelled subscriptions are flagged, kept ones are not
eq('Spotify flagged', r.cancelledMatch('Pay Spotify'), 'Spotify');
eq('ChatGPT flagged', r.cancelledMatch('Оплата ChatGPT plus'), 'ChatGPT Plus');
eq('Make kept', r.cancelledMatch('Pay make.com'), null);
eq('HubSpot kept', r.cancelledMatch('Hubspot'), null);
eq('Microsoft kept', r.cancelledMatch('Оплата Микрософт'), null);

// "except" numbers
eq('except 1, 3', r.parseExcept('move paid cards up to 30 except 1, 3'), [1, 3]);
eq('кроме 1 и 3', r.parseExcept('перенеси оплаченные до 30 кроме 1 и 3'), [1, 3]);
eq('menos 2 y 5', r.parseExcept('pasa las pagadas menos 2 y 5'), [2, 5]);
eq('but not #4', r.parseExcept('move paid cards but not #4'), [4]);
eq('no except', r.parseExcept('move paid cards up to the 15th'), []);
eq('applyExcept numbers skip cancelled', r.applyExcept({ items: [
  { id: 'a', cancelled: null }, { id: 'b', cancelled: 'Spotify' }, { id: 'c', cancelled: null }, { id: 'd', cancelled: null }] }, [2])
  .items.map(i => !!i.kept), [false, false, true, false]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
