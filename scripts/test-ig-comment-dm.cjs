#!/usr/bin/env node
// Tests for src/ig-comment-dm.ts (run after build): keyword, signature, codes, guard rails. No network.
'use strict';
process.chdir(require('os').tmpdir());
const m = require(require('path').join(__dirname, '..', 'dist', 'ig-comment-dm.js'));
const crypto = require('crypto');
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
for (const t of ['HOLA', 'hola', 'Hola!', '¡Hola!', 'OLA', 'holaaa 😊', 'Hola EspaLuz']) ok(m.KEYWORD.test(t), `keyword: ${t}`);
for (const t of ['Holanda', 'cola', 'hello', 'solar']) ok(!m.KEYWORD.test(t), `not keyword: ${t}`);
const body = Buffer.from('{"a":1}');
const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
ok(m.validSignature(body, sig, 's3cret'), 'signature valid');
ok(!m.validSignature(body, sig, 'other'), 'signature wrong secret rejected');
ok(!m.validSignature(body, undefined, 's3cret'), 'missing signature rejected');
const st = { done: [], media: {} };
const c1 = m.codeForMedia(st, '1789', new Date('2026-11-22T10:00:00Z'));
ok(/^f20261122[0-9a-f]{4}$/.test(c1), `code shape ${c1}`);
ok(m.codeForMedia(st, '1789', new Date('2027-01-01')) === c1, 'code stable per media');
const FILM_RE = /\b(f\d{8}[0-9a-f]{4})[-_](fb|ig|yt|li|g\d{1,3})\b/;
const dm = m.dmText(c1);
ok(FILM_RE.test(decodeURIComponent(dm)), 'DM WhatsApp text carries a bot-readable code');
ok(dm.includes(`start=${c1}_ig`), 'Telegram start code');
ok(dm.includes(`utm_campaign=${c1}`), 'app utm');
process.env.IG_USER_ID = '42';
(async () => {
  ok((await m.handleComment({ id: 'c1', text: 'HOLA', from: { id: '42' }, media: { id: 'm' } }, { dryRun: true })) === 'skip: own comment', 'own comment skipped');
  ok((await m.handleComment({ id: 'c2', text: 'nice', from: { id: '7' }, media: { id: 'm' } }, { dryRun: true })) === 'skip: no keyword', 'no keyword skipped');
  ok((await m.handleComment({ id: 'c3', text: 'hola', from: { id: '7' }, media: { id: 'm' }, parent_id: 'x' }, { dryRun: true })) === 'skip: reply in a thread', 'thread reply skipped');
  process.env.IG_DM_SKIP_MEDIA = 'm';
  ok((await m.handleComment({ id: 'c4', text: 'hola', from: { id: '7' }, media: { id: 'm' } }, { dryRun: true })) === 'skip: media still on ManyChat', 'ManyChat Reel skipped');
  process.env.IG_DM_SKIP_MEDIA = '';
  ok(String(await m.handleComment({ id: 'c5', text: 'Hola!', from: { id: '7' }, media: { id: 'm2' } }, { dryRun: true })).startsWith('would answer c5'), 'stranger HOLA answered');
  // Caption gate (22 Nov): the same account posts AIdeazz content that opens with "¡Hola, explorer!".
  ok(m.CTA.test('💬 Comenta HOLA y te mando el enlace'), 'CTA: Spanish invite');
  ok(m.CTA.test('Comment "HOLA" and EspaLuz sends you the link'), 'CTA: English invite');
  ok(!m.CTA.test('¡Hola, Founders & technical leaders explorer! Your breakthrough awaits'), 'CTA: AIdeazz greeting is not an invite');
  ok((await m.handleComment({ id: 'c6', text: 'hola', from: { id: '7' }, media: { id: 'm3' } },
    { dryRun: true, caption: '¡Hola, explorer! Indexing. Crawlability.' })) === 'skip: post does not invite HOLA', 'HOLA on AIdeazz post ignored');
  ok(String(await m.handleComment({ id: 'c7', text: 'HOLA', from: { id: '7' }, media: { id: 'm4' } },
    { dryRun: true, caption: '💬 Comenta HOLA y te mando el enlace' })).startsWith('would answer c7'), 'HOLA on inviting post answered');
  process.env.IG_DM_TEST_USERNAMES = 'kiravelerevich';
  ok(String(await m.handleComment({ id: 'c8', text: 'hola', from: { id: '9', username: 'KiraVelerevich' }, media: { id: 'm' } },
    { dryRun: true, caption: 'Comenta HOLA' })).startsWith('would answer c8'), 'test account may use a ManyChat Reel');
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
