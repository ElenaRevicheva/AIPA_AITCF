#!/usr/bin/env node
// Tests for src/ig-dm-chat.ts (EspaLuz answers Instagram DMs + ice breakers). No network: fake sender + fake model.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igchat-'));
process.chdir(dir);
const m = require(path.join(__dirname, '..', 'dist', 'ig-dm-chat.js'));
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const sent = [];
const send = async (to, text) => { sent.push({ to, text }); return { ok: true, status: 200, text: '' }; };
const llm = async () => 'Hola 👋 EspaLuz ayuda a tu familia con el español de cada día. Mira https://evil.example/x';
const now = new Date('2026-11-22T21:00:00Z');

(async () => {
  ok((await m.handleMessaging({ sender: { id: 'ME' }, message: { text: 'hi' } }, send, { ownId: 'ME', llm, now })) === 'skip: own/echo', 'own message ignored');
  ok((await m.handleMessaging({ sender: { id: 'A' }, message: { text: 'hi', is_echo: true } }, send, { ownId: 'ME', llm, now })) === 'skip: own/echo', 'echo ignored');
  ok((await m.handleMessaging({ sender: { id: 'A' }, message: { attachments: [{}] } }, send, { ownId: 'ME', llm, now })).startsWith('skip: no text'), 'sticker ignored');

  const r1 = await m.handleMessaging({ sender: { id: 'A' }, message: { text: 'hola, como funciona?' } }, send, { ownId: 'ME', llm, now });
  ok(r1.includes('+doors'), 'first message of the day carries the doors');
  ok(!sent[0].text.includes('evil.example'), 'links written by the model are stripped');
  ok(/wa\.me\/50766623757/.test(sent[0].text) && /f\d{8}[0-9a-f]{4}-ig/.test(sent[0].text), 'WhatsApp door with a film-style -ig code');
  ok(/\b(f\d{8}[0-9a-f]{4})[-_](fb|ig|yt|li|g\d{1,3})\b/.test(sent[0].text), "bots' FILM_RE matches the code");

  const r2 = await m.handleMessaging({ sender: { id: 'A' }, message: { text: 'and my kids?' } }, send, { ownId: 'ME', llm, now });
  ok(!r2.includes('+doors'), 'second message: no doors unless asked');
  const r3 = await m.handleMessaging({ sender: { id: 'A' }, message: { text: 'ok how do I start?' } }, send, { ownId: 'ME', llm, now });
  ok(r3.includes('+doors'), 'asking to start brings the doors back');

  const r4 = await m.handleMessaging({ sender: { id: 'B' }, postback: { payload: 'ESPALUZ_FREE' } }, send, { ownId: 'ME', llm: async () => { throw new Error('model must not be called'); }, now });
  ok(r4.startsWith('[ig-chat] ice ESPALUZ_FREE') && sent.at(-1).text.includes('14'), 'ice breaker answers from the fixed text, no model');
  ok(m.ICE_BREAKERS.length <= 4 && m.ICE_BREAKERS.every((b) => b.question.length <= 80), 'ice breakers within Meta limits (≤4, ≤80 chars)');

  ok((await m.handleMessaging({ sender: { id: 'D' }, postback: { payload: 'MANYCHAT_xyz' } }, send, { ownId: 'ME', llm, now })) === "skip: another app's button", "ManyChat's button tap is not answered twice");
  process.env.IG_CHAT_MAX_PER_DAY = '2';
  await m.handleMessaging({ sender: { id: 'C' }, message: { text: 'a' } }, send, { ownId: 'ME', llm, now });
  await m.handleMessaging({ sender: { id: 'C' }, message: { text: 'b' } }, send, { ownId: 'ME', llm, now });
  ok((await m.handleMessaging({ sender: { id: 'C' }, message: { text: 'c' } }, send, { ownId: 'ME', llm, now })) === 'skip: daily cap', 'daily cap per person');
  ok(sent.every((s) => s.text.length <= 990), 'every reply fits an Instagram message');
  // 23 Nov 2026: a long bilingual answer is trimmed - the doors (WhatsApp, App, Telegram) are never the part that gets cut.
  const longLlm = async () => ('Hola, EspaLuz ayuda a tu familia en la vida diaria. '.repeat(14) + '\n\n' + 'Hi, EspaLuz helps your family in daily life. '.repeat(14));
  await m.handleMessaging({ sender: { id: 'LONG' }, message: { text: 'hola' } }, send, { ownId: 'ME', llm: longLlm, now });
  const lt = sent.at(-1).text;
  ok(lt.length <= 990 && /wa\.me/.test(lt) && /app\.espaluz\.lat/.test(lt) && /t\.me\/EspaLuzFamily_bot/.test(lt), 'long answer: all three doors survive the 990-character limit');

  // ── Inbox poll (22 Nov 2026) ──
  process.env.IG_CHAT_MAX_PER_DAY = '12';
  const since = new Date('2026-11-22T20:00:00Z');
  const pnow = new Date('2026-11-22T21:00:00Z');
  const msg = (id, iso, from, message) => ({ id, created_time: iso, from: { id: from }, message });
  const before = sent.length;
  const convs = [
    // new contact: first message 1 h ago -> answered
    { id: 'c_new', updated_time: '', messages: { data: [msg('m1', '2026-11-22T20:30:00Z', 'NEW1', 'hola, ¿cómo funciona?')] } },
    // old friend: history reaches back 2 months -> never answered
    { id: 'c_old', updated_time: '', messages: { data: [msg('o2', '2026-11-22T20:40:00Z', 'FRIEND', 'how are you?'), msg('o1', '2026-09-20T10:00:00Z', 'FRIEND', 'hi')] } },
    // Elena already answered last -> nothing to do
    { id: 'c_done', updated_time: '', messages: { data: [msg('d2', '2026-11-22T20:45:00Z', 'ME', 'todo bien'), msg('d1', '2026-11-22T20:44:00Z', 'NEW2', 'hola')] } },
    // message from before the poll started -> backlog, not answered
    { id: 'c_back', updated_time: '', messages: { data: [msg('b1', '2026-11-22T19:00:00Z', 'NEW3', 'hola')] } },
  ];
  const r = await m.pollOnce(convs, send, { ownId: 'ME', since, now: pnow, llm });
  ok(sent.length - before === 1 && sent.at(-1).to === 'NEW1', 'poll answers only the new contact');
  ok(r.some((l) => l.includes('older chat')), "poll never answers an old friend's chat");
  const again = await m.pollOnce(convs, send, { ownId: 'ME', since, now: pnow, llm });
  ok(sent.length - before === 1 && !again.some((l) => l.startsWith('[ig-chat]')), 'the same message is never answered twice');

  // ── Meta refuses ("not the thread owner") -> not marked done, retried after the wait (23 Nov 2026) ──
  const refuse = async () => ({ ok: false, status: 400, text: '{"error":{"error_subcode":2534037}}' });
  const lconv = [{ id: 'c_lock', updated_time: '', messages: { data: [msg('L1', '2026-11-22T20:50:00Z', 'LOCK', '¿Hay algo para mis hijos?')] } }];
  const r1L = await m.pollOnce(lconv, refuse, { ownId: 'ME', since, now: pnow, llm });
  ok(r1L.some((l) => l.includes('reply 400')), 'refused send is reported');
  const n0 = sent.length;
  await m.pollOnce(lconv, send, { ownId: 'ME', since, now: new Date(pnow.getTime() + 5 * 60000), llm });
  ok(sent.length === n0, 'no retry before the wait is over');
  const r3L = await m.pollOnce(lconv, send, { ownId: 'ME', since, now: new Date(pnow.getTime() + 16 * 60000), llm });
  ok(sent.length === n0 + 1 && sent.at(-1).to === 'LOCK' && r3L.some((l) => l.includes('reply 200')), 'retried and answered once the chat is free');
  ok(sent.at(-1).text.includes('wa.me'), 'a refused first try does not use up the doors');
  await m.pollOnce(lconv, send, { ownId: 'ME', since, now: new Date(pnow.getTime() + 40 * 60000), llm });
  ok(sent.length === n0 + 1, 'answered message is not answered again');

  process.chdir(os.tmpdir());
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temp dir left behind is harmless */ }
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
