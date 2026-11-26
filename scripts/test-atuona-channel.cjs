// node scripts/test-atuona-channel.cjs — the Atuona channel keeper + drafts (26 Nov 2026). Runs on dist/.
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'achan-'));
process.env.ATUONA_CHANNEL_ARCHIVE_DIR = dir; delete process.env.ATUONA_CHANNEL_ID;
const m = require('../dist/atuona-channel.js');
let ok = 0, bad = 0; const t = (name, c) => { if (c) ok++; else { bad++; console.log('✗', name); } };
const lines = () => fs.existsSync(path.join(dir, 'archive.jsonl')) ? fs.readFileSync(path.join(dir, 'archive.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
(async () => {
  const keep = m.channelKeeper();
  let nexted = 0, replied = 0; const next = async () => { nexted++; };
  const poem = 'Я успею на рейс, но только\nМне чуть чуть надо передохнуть.';
  // 1. a channel post is archived, never passed to the auth filter, never answered
  await keep({ channelPost: { message_id: 7, date: 1, chat: { id: -1001, title: 'Atuona', type: 'channel' }, text: poem }, chat: { type: 'channel' }, reply: async () => replied++ }, next);
  t('post not passed on', nexted === 0); t('post never answered', replied === 0);
  t('post archived verbatim', lines()[0]?.kind === 'post' && lines()[0].text === poem);
  t('channel learned', m.channelId() === -1001);
  // 2. a saved edit is a NEW line (old version kept)
  await keep({ editedChannelPost: { message_id: 7, date: 1, edit_date: 2, chat: { id: -1001, title: 'Atuona', type: 'channel' }, text: poem + '\nСколько ждать?' }, chat: { type: 'channel' } }, next);
  t('edit appended, original kept', lines().length === 2 && lines()[0].text === poem && lines()[1].kind === 'edit');
  // 3. a private message goes on to the filter untouched
  await keep({ chat: { type: 'private' }, message: { text: 'hi' } }, next);
  t('private chat passed on', nexted === 1);
  // 4. a channel update without a post (e.g. member change) is swallowed silently
  await keep({ chat: { type: 'channel' } }, next);
  t('other channel update not passed on', nexted === 1);
  // 5. voice leads
  t('ru lead', m.channelLead('В канал: Ливни, ливни') === 'Ливни, ливни');
  t('en lead', m.channelLead('post to the channel, Rain again') === 'Rain again');
  t('no lead in ordinary speech', m.channelLead('Поставь задачу в Трелло') === null);
  t('lead word mid-sentence ignored', m.channelLead('напиши в канал завтра') === null);
  t('bare lead gives null', m.channelLead('в канал') === null);
  // 6. a draft is archived BEFORE any button, and the preview carries both buttons
  const sent = [];
  await m.offerDraft({ from: { id: 5 }, reply: async (txt, o) => sent.push({ txt, o }) }, poem, 'voice');
  t('draft archived first', lines().at(-1).kind === 'draft' && lines().at(-1).text === poem);
  const kb = sent[0]?.o?.reply_markup?.inline_keyboard?.[0] || [];
  t('preview shows poem + 2 buttons', sent[0]?.txt.includes(poem) && kb.length === 2 && /^achan:ok:/.test(kb[0].callback_data));
  // 7. over-long text: saved, not offered
  sent.length = 0;
  await m.offerDraft({ from: { id: 5 }, reply: async (txt, o) => sent.push({ txt, o }) }, 'x'.repeat(5000), 'text');
  t('long draft saved, no buttons', lines().at(-1).text.length === 5000 && !sent[0].o);
  t('markdown log written', fs.readFileSync(path.join(dir, 'archive.md'), 'utf8').includes('передохнуть'));
  console.log(`${ok}/${ok + bad} atuona-channel checks`); if (bad) process.exitCode = 1;
})();

// ── grammY wiring: /channel and the armed step must never swallow ordinary messages (26 Nov 2026) ──
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  const { Bot } = require('grammy');
  const bot = new Bot('0:x', { botInfo: { id: 1, is_bot: true, first_name: 'A', username: 'a_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } });
  const calls = [];
  fs.rmSync(path.join(dir, 'state.json'), { force: true }); // wiring starts with the channel unknown
  bot.api.config.use(async (prev, method, payload) => { calls.push({ method, payload }); return { ok: true, result: method === 'getChatMember' ? { status: 'administrator', user: { id: 1 } } : { message_id: 99, date: 0, chat: { id: 1, type: 'private' } } }; });
  m.registerAtuonaChannel(bot);
  const reachedOld = [];
  bot.on('message:text', (ctx) => { reachedOld.push(ctx.message.text); });
  bot.command('menu', (ctx) => { reachedOld.push('/menu'); });
  let uid = 1;
  const upd = (text) => ({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'E' }, text, ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}) } });
  let ok2 = 0, bad2 = 0; const t2 = (n, c) => { if (c) ok2++; else { bad2++; console.log('✗', n); } };
  await bot.handleUpdate(upd('Привет, как дела?'));
  t2('ordinary text reaches the old handler', reachedOld[0] === 'Привет, как дела?');
  await bot.handleUpdate(upd('/menu'));
  t2('other commands still work', reachedOld.includes('/menu'));
  const before = reachedOld.length;
  await bot.handleUpdate(upd('/channel'));
  t2('/channel arms, old handler not called', reachedOld.length === before && calls.some((c) => /Channel mode is ON/.test(c.payload.text || '')));
  await bot.handleUpdate(upd('Ливни, ливни... В Панаме - плыть.'));
  t2('armed text becomes a draft, not chat', reachedOld.length === before && calls.some((c) => (c.payload.text || '').includes('В Панаме') && c.payload.reply_markup));
  await bot.handleUpdate(upd('А теперь просто поговорим'));
  t2('after the draft, text goes back to the old handler', reachedOld.at(-1) === 'А теперь просто поговорим');
  // forward a channel post while the channel is unknown -> learned, latest draft offered again
  t2('pending draft written to disk', JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8'))).includes('В Панаме'));
  t2('unknown channel: preview teaches the forward', calls.some((c) => /long-press any post → Forward/.test(c.payload.text || '')));
  const n0 = calls.length, r0 = reachedOld.length;
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'E' }, text: 'old post', forward_origin: { type: 'channel', chat: { id: -100777, title: 'Atuona: NFT Gallery of Moments', type: 'channel' }, message_id: 3, date: 0 } } });
  t2('forward teaches the channel', m.channelId() === -100777);
  t2('learning checked admin rights', calls.slice(n0).some((c) => c.method === 'getChatMember'));
  t2('draft offered again after learning', calls.slice(n0).some((c) => (c.payload.text || '').includes('В Панаме') && c.payload.reply_markup));
  t2('learning forward not passed to old handler', reachedOld.length === r0);
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'E' }, text: 'another forward', forward_origin: { type: 'channel', chat: { id: -100777, title: 'X', type: 'channel' }, message_id: 4, date: 0 } } });
  t2('once learned, forwards go to old handlers as before', reachedOld.at(-1) === 'another forward');
  console.log(`${ok2}/${ok2 + bad2} grammY wiring checks`); if (bad2) process.exit(1);
})();
