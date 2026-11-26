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
  console.log(`${ok}/${ok + bad} atuona-channel checks`); process.exit(bad ? 1 : 0);
})();
