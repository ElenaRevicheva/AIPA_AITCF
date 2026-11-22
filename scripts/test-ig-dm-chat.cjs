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

  process.chdir(os.tmpdir());
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temp dir left behind is harmless */ }
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
