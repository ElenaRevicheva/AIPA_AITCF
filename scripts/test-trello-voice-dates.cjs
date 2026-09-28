#!/usr/bin/env node
/**
 * test-trello-voice-dates.cjs — voice→Trello dates land on the day she said, and a correction edits.
 *
 *   npm run build && node scripts/test-trello-voice-dates.cjs
 *
 * WHY (28 Sep 2026). "Cita ... 15 de octubre, 3 y 30 pm" became a card showing 14 Oct with no time:
 * the bot sent a bare "2026-10-15" (= midnight UTC = 14 Oct 19:00 in Panama) and dropped the time.
 * The follow-up "Appointment should be changed to 15th of October, 3.30 pm" created a SECOND card:
 * no update action existed and the word "changed" never reached the action classifier.
 */
'use strict';
const path = require('path');
// The module builds a Groq client at import; these pure functions never call it.
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'offline-test-not-used';
const v = require(path.join(__dirname, '..', 'dist', 'trello-voice.js'));

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

check('15 Oct 3:30 PM Panama → 20:30Z', v.toTrelloDue('2026-10-15', '15:30') === '2026-10-15T20:30:00.000Z');
check('date only → Panama midday, same day', v.toTrelloDue('2026-10-15') === '2026-10-15T17:00:00.000Z');
check('"9:05" normalised', v.toTrelloDue('2026-10-15', '9:05') === '2026-10-15T14:05:00.000Z');
check('nonsense time → midday, not a crash', v.toTrelloDue('2026-10-15', '25:99') === '2026-10-15T17:00:00.000Z');
check('Panama "today" at 21:00 Panama (02:00Z next day) is still today', v.panamaToday(new Date('2026-09-29T02:00:00Z')) === '2026-09-28');
check('reply shows the day Trello shows, with the time', v.formatDueForReply('2026-10-15', '15:30') === 'October 15, 3:30 PM');
check('reply without time', v.formatDueForReply('2026-10-15') === 'October 15');
check('her correction reaches the action classifier', v.isManagementCommand('Appointment should be changed to 15th of October, 3.30 pm.'));
check('Spanish correction too', v.isManagementCommand('Cambia la cita al 15 de octubre'));
check('Russian correction too', v.isManagementCommand('Измени дату на 15 октября'));
check('a plain new task still does not', !v.isManagementCommand('Cita Dr. Fernando Aguilar nefrólogo 15 de octubre'));
// 28 Sep 11:12-11:14 Panama: three description corrections, each became a NEW card.
check('"Отредактирую эту задачу…" reaches the action classifier', v.isManagementCommand('Отредактирую эту задачу, making it clear that the appointment is not for Kira, but for my stepfather Marshall.'));
check('"…ты должен отредактировать…" reaches it', v.isManagementCommand('Я имела в виду задачу, которую ты должен отредактировать, что это задача в Kira octubre'));
check('"edit the card" reaches it', v.isManagementCommand('Please edit the card: it is for Marshall'));
check('"aclara que…" reaches it', v.isManagementCommand('Aclara que la cita es para Marshall'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
