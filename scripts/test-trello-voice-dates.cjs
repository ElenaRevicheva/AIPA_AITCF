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

// ── 12 Oct 2026 — typed text, links on cards, a title that is only the column, Kira ≠ daughter ──────────────
const M1 = 'Crea la tarea para el 16 de octubre 10 am para Kira Octubre Cita y conecta este enlace Here’s the Google Meet link for your intro with Natalia: https://meet.google.com/jcj-wpxs-utd';
const M3 = 'Wire this link into this task into task description Here’s the Google Meet link for your intro with Natalia: https://meet.google.com/jcj-wpxs-utd';
const MEET = 'https://meet.google.com/jcj-wpxs-utd';
check('"…into task description…" (her 12 Oct message) reaches the edit path', v.isManagementCommand(M3));
check('Spanish "descripción" reaches it', v.isManagementCommand('Agrega este enlace a la descripción de la tarea'));
check('"attach this link to the card" reaches the classifier (link request)', v.isLinkAttachRequest('Attach this link to the card'));
check('Russian "прикрепи ссылку" reaches it (link request)', v.isLinkAttachRequest('Прикрепи ссылку к задаче'));
check('"rename it to …" reaches it', v.isManagementCommand('Rename it to Intro with Natalia'));
check('her create message stays a CREATE (not an edit)', !v.isManagementCommand(M1));
check('a plain Russian new task stays a create', !v.isManagementCommand('Добавь задачу купить молоко'));
check('"Post on LinkedIn" stays a create', !v.isManagementCommand('Post on LinkedIn about the audit'));

check('the Meet link is extracted exactly', JSON.stringify(v.extractUrls(M3)) === JSON.stringify([MEET]));
check('trailing punctuation is not part of a link', JSON.stringify(v.extractUrls(`see ${MEET}.`)) === JSON.stringify([MEET]));
check('"wire this link into this task" is a link request', v.isLinkAttachRequest(M3));
check('"wire this link to the task" (no link yet) is a link request', v.isLinkAttachRequest('wire this link to the task'));
check('Spanish "agrega el enlace" is a link request', v.isLinkAttachRequest('agrega el enlace a la tarea'));
check('Russian "добавь ссылку" is a link request', v.isLinkAttachRequest('добавь ссылку в описание'));
check('a CREATE that carries a link is NOT a link request', !v.isLinkAttachRequest(M1));
check('"add the LinkedIn post" is NOT a link request', !v.isLinkAttachRequest('Add the LinkedIn post to my tasks'));
check('merge keeps the old description and adds below', v.mergeDescription('Voice note: 10/12/2026', MEET) === `Voice note: 10/12/2026\n\n${MEET}`);
check('merge is idempotent (link already there)', v.mergeDescription(`a\n\n${MEET}`, MEET) === `a\n\n${MEET}`);
check('merge into an empty description', v.mergeDescription('', MEET) === MEET);
check('a link she sent passes the verbatim check', v.urlsAreVerbatim(`Meet: ${MEET}`, M3));
check('a link the model invented is refused', !v.urlsAreVerbatim('https://meet.google.com/abc-defg-hij', M3));

const base = { isTask: true, description: '', category: 'family', urgency: 'dated', boardTarget: 'kira_current_month',
  listTarget: 'dated', labelColor: 'red', subtasks: null, confidence: 0.9, reasoning: '' };
const ceta = v.guardTitle({ ...base, title: 'CETA', boardNameHint: 'Kira Octubre', listNameHint: 'Cita', dueDate: '2026-10-16', dueTime: '10:00' });
check('title "CETA" (the column, misheard) becomes "Cita October 16, 10:00 AM"', ceta.title === 'Cita October 16, 10:00 AM' && ceta.titleGuessed === true);
// The live classifier (dry run 12 Oct) returned listNameHint "CETA" itself — the placeholder still says "Cita".
const cetaHint = v.guardTitle({ ...base, title: 'CETA', boardNameHint: 'Kira Octubre 2026', listNameHint: 'CETA', dueDate: '2026-10-16', dueTime: '10:00' });
check('misheard column "CETA" in the hint still gives "Cita October 16, 10:00 AM"', cetaHint.title === 'Cita October 16, 10:00 AM');
const noSubject = { success: true, transcript: 'x', classification: { ...ceta, labelColor: 'red' }, card: { id: '1', name: ceta.title, url: '', shortUrl: 'https://trello.com/c/x' }, boardName: 'B', listName: 'L' };
check('a card with no subject is shown with no colour, not red', /no colour yet/.test(v.formatVoiceTrelloReply(noSubject)) && !/🔴/.test(v.formatVoiceTrelloReply(noSubject)));
check('a reply never carries a raw link (Markdown-safe)', !/meet\.google\.com/.test(v.formatVoiceTrelloReply({ ...noSubject, transcript: M1, classification: { ...ceta, description: `Meet: ${MEET}` } })));
const empty = v.guardTitle({ ...base, title: '', boardNameHint: 'Kira Octubre', listNameHint: 'Cita', dueDate: '2026-10-16', dueTime: '10:00' });
check('an empty title gets the same honest placeholder', empty.title === 'Cita October 16, 10:00 AM' && empty.titleGuessed === true);
const real = v.guardTitle({ ...base, title: 'Intro with Natalia', boardNameHint: 'Kira Octubre', listNameHint: 'Cita', dueDate: '2026-10-16' });
check('a real subject is left alone', real.title === 'Intro with Natalia' && !real.titleGuessed);
const doc = v.guardTitle({ ...base, title: 'Cita Dr. Fernando Aguilar nefrólogo', listNameHint: 'Cita', dueDate: '2026-10-15' });
check('"Cita Dr. Fernando Aguilar…" is left alone', doc.title === 'Cita Dr. Fernando Aguilar nefrólogo' && !doc.titleGuessed);
// ── Adversarial review, 12 Oct 2026: the link shortcut must never swallow a task or edit the wrong card ────────
for (const t of ['Add a task to send Marshall the link to the deck tomorrow',
  'Remind me to add the Stripe payment link to the landing page tomorrow',
  'Agrega una tarea: mandar el enlace a Natalia', 'Добавь задачу отправить ссылку Маршаллу в пятницу',
  'Add a task to watch La Liga', 'Add the LinkedIn post to my tasks']) {
  check(`new task is NOT a link request: "${t.slice(0, 48)}"`, !v.isLinkAttachRequest(t));
}
check('"remind me to add the Stripe link…" is a task creation', v.isTaskCreation('Remind me to add the Stripe payment link to the landing page tomorrow'));
const NAT = 'Intro with Natalia';
check('"wire this link to the task" points only at the card just made', v.pointsOnlyAtRecentCard('wire this link to the task', NAT));
check('"agrega este enlace a la tarea <url>" points only at it', v.pointsOnlyAtRecentCard(`agrega este enlace a la tarea ${MEET}`, NAT));
check('"add this link to the Natalia task <url>" points at it (its own title word)', v.pointsOnlyAtRecentCard(`add this link to the Natalia task ${MEET}`, NAT));
check('"attach this link to the DENTIST card" names another card → classifier', !v.pointsOnlyAtRecentCard('Attach this link to the dentist appointment: https://clinic.example/book', NAT));
check('her M3 (mentions Google Meet) goes to the classifier, not the shortcut', !v.pointsOnlyAtRecentCard(M3, NAT));
check('a link request naming a card reaches the classifier gate', v.isLinkAttachRequest(`Add this link to the Boardy intro card ${MEET}`));
check('"Can you describe how the apply kit works?" is not an edit', !v.isManagementCommand('Can you describe how the apply kit works?'));
check('"Attach the invoice to the email tomorrow" is not an edit', !v.isManagementCommand('Attach the invoice to the email tomorrow'));
check('a link with parentheses is kept whole', JSON.stringify(v.extractUrls('see https://en.wikipedia.org/wiki/Foo_(bar)')) === JSON.stringify(['https://en.wikipedia.org/wiki/Foo_(bar)']));
check('an unbalanced closing ")" is not part of the link', JSON.stringify(v.extractUrls(`(see ${MEET})`)) === JSON.stringify([MEET]));
check('a TRUNCATED link is refused (whole-URL check)', !v.urlsAreVerbatim('Zoom: https://zoom.us/j/123', 'join https://zoom.us/j/123?pwd=abc'));

// ── Re-check, 12 Oct 2026: modal / pointer phrases are ATTACH requests, not new tasks ──────────────────────────
for (const t of [`Add this link to the new task ${MEET}`, `Agrega este enlace a la nueva tarea ${MEET}`,
  `Agrega este enlace a la tarea que acabas de crear ${MEET}`, `Нужно добавить ссылку в эту задачу ${MEET}`,
  `Надо прикрепить ссылку к задаче ${MEET}`, `I need to add this link to the task ${MEET}`]) {
  check(`attach, not a new task: "${t.slice(0, 50)}"`, v.isLinkAttachRequest(t) && v.pointsOnlyAtRecentCard(t, NAT));
}
check('her Spanish create (M1) is still a task creation', v.isTaskCreation(M1));
check('"Создай задачу на 16 октября…" is a task creation', v.isTaskCreation('Создай задачу на 16 октября на 10 утра в Kira octubre'));
check('"Add a task to send Marshall the link" is a task creation', v.isTaskCreation('Add a task to send Marshall the link to the deck tomorrow'));
const emojiAt79 = 'Remind me tomorrow to call the bank about the mortgage refinance paperwork pls 🙏 thanks a lot';
const e80 = v.echo80(emojiAt79);
check('the reply echo never cuts an emoji in half', !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(e80));

const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'trello-voice.ts'), 'utf8');
check('the colour prompt no longer says "Kira=daughter"', !/Kira\s*=\s*daughter/i.test(src) && /daughter Alisa/.test(src));

// ── 28 Oct 2026 — a series from one voice note: every card got the FIRST date ─────────────────────────────────────
// "Starting today, 28 Oct, a 10-day medication cycle… repeat next month… next cycle from 28 Nov…" → 3 cards, all due Oct 28.
const B = ['Start medication cycle 1 (Oct 28 - Nov 6)', 'Start medication cycle 2 (Nov 28 - Dec 7)', 'Start medication cycle 3 (Dec 28 - Jan 6)'];
const bron = { dueDate: '2026-10-28', subtaskDueDates: null };
check('her 28 Oct note: the model gave no per-card dates → cycle 1 still Oct 28', v.subtaskDue(bron, 0, B[0]) === '2026-10-28');
check('…cycle 2 reads Nov 28 from its own title', v.subtaskDue(bron, 1, B[1]) === '2026-11-28');
check('…cycle 3 reads Dec 28 from its own title (not Jan 6)', v.subtaskDue(bron, 2, B[2]) === '2026-12-28');
check('the model\'s own per-card date wins', v.subtaskDue({ dueDate: '2026-10-28', subtaskDueDates: ['2026-10-28', '2026-11-29', null] }, 1, B[1]) === '2026-11-29');
check('a missing slot falls back to the title', v.subtaskDue({ dueDate: '2026-10-28', subtaskDueDates: ['2026-10-28', null] }, 1, B[1]) === '2026-11-28');
check('a malformed slot is ignored', v.subtaskDue({ dueDate: '2026-10-28', subtaskDueDates: ['', 'Nov 28th'] }, 1, B[1]) === '2026-11-28');
check('plain steps keep the shared date', v.subtaskDue({ dueDate: '2026-10-30', subtaskDueDates: null }, 1, 'Send invites') === '2026-10-30');
check('no date anywhere → no date', v.subtaskDue({ dueDate: null, subtaskDueDates: null }, 0, 'Design slides') === null);
check('Spanish "28 de noviembre" in a title', v.dateFromTitle('Ciclo 2 desde el 28 de noviembre', '2026-10-28') === '2026-11-28');
check('"Jan 6" after an October start is next year', v.dateFromTitle('Dose (Jan 6)', '2026-10-28') === '2027-01-06');
check('"Q4 report" is not a date', v.dateFromTitle('Prepare the Q4 report', '2026-10-28') === null);
check('"May the deck be ready" is not a date', v.dateFromTitle('May the deck be ready', '2026-10-28') === null);
const series = { success: true, transcript: 'x', classification: { ...base, title: 'Medication cycles', dueDate: '2026-10-28' },
  cards: B.map((n, i) => ({ id: String(i), name: n, url: '', shortUrl: 'https://trello.com/c/' + i, due: v.toTrelloDue(['2026-10-28', '2026-11-28', '2026-12-28'][i]) })),
  boardName: 'Kira Octubre 2026', listName: 'Cita' };
const sr = v.formatVoiceTrelloReply(series);
check('the reply shows each card\'s own date', /— 📅 October 28/.test(sr) && /— 📅 November 28/.test(sr) && /— 📅 December 28/.test(sr) && /Each card has its own date/.test(sr));
const same = { ...series, cards: series.cards.map((c) => ({ ...c, due: v.toTrelloDue('2026-10-30') })) };
check('cards sharing one date keep the single "Due" line', /📅 Due: October 28/.test(v.formatVoiceTrelloReply(same)) && !/— 📅/.test(v.formatVoiceTrelloReply(same)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
