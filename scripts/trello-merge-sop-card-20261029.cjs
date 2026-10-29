#!/usr/bin/env node
// One-off, 29 Oct 2026: merge the duplicate card the voice bot made into the card Elena named, on Kira Noviembre 2026.
// Runs ON ORACLE (the bot's TRELLO_API_KEY/TRELLO_TOKEN live only in ~/cto-aipa/.env):
//   ssh oracle-cto-aipa 'cd ~/cto-aipa && node scripts/trello-merge-sop-card-20261029.cjs'          # dry run, changes nothing
//   ssh oracle-cto-aipa 'cd ~/cto-aipa && node scripts/trello-merge-sop-card-20261029.cjs --apply'  # append + archive + read back
// Dry run on 29 Oct 15:40 UTC found exactly: keep "Update SOAP AI Ops HTML with agent descriptions" (trello.com/c/3Jm6hFkj),
// archive "Complete Spanish version of sub HTML and add to portfolio" (trello.com/c/wSLcfQKC). The --apply run was blocked
// by the Claude auto-mode classifier (External System Writes) — Elena or the next agent runs it. ARCHIVES, never deletes.
'use strict';
require('dotenv').config();
const KEY = process.env.TRELLO_API_KEY, TOKEN = process.env.TRELLO_TOKEN;
if (!KEY || !TOKEN) { console.error('no TRELLO_API_KEY/TRELLO_TOKEN in .env — run from ~/cto-aipa on Oracle'); process.exit(2); }
const BOARD = '65a6d4421c1ad47e706bfcd8'; // Kira Noviembre 2026
const APPLY = process.argv.includes('--apply');
const NOTE = [
  '29 Oct 2026 (voice note, merged from a duplicate card the bot created):',
  '1. First verify and clean up the SOP AI Ops HTML page.',
  '2. Then build the Spanish version of it.',
  'Why: this page is meaningful and converts much better than the current portfolio page — it becomes the portfolio.',
].join('\n');

async function api(method, p, params) {
  const u = new URL(`https://api.trello.com/1${p}`);
  u.searchParams.set('key', KEY); u.searchParams.set('token', TOKEN);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const r = await fetch(u, { method });
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

(async () => {
  const cards = await api('GET', `/boards/${BOARD}/cards/open`, { fields: 'name,desc,idList,shortUrl,dateLastActivity' });
  console.log(`open cards on the board: ${cards.length}`);
  const soap = cards.filter((c) => /\b(soap|sop)\b/i.test(c.name) && /html/i.test(c.name) && !/spanish version/i.test(c.name));
  const dup = cards.filter((c) => /spanish version of sub html/i.test(c.name));
  console.log('target (keep):', soap.map((c) => `"${c.name}" ${c.shortUrl}`));
  console.log('duplicate (archive):', dup.map((c) => `"${c.name}" ${c.shortUrl}`));
  if (soap.length !== 1 || dup.length !== 1) { console.error('need exactly one of each — nothing changed (already merged?)'); process.exit(1); }
  const [t] = soap, [d] = dup;
  console.log(`target desc now (${(t.desc || '').length} chars): ${JSON.stringify((t.desc || '').slice(0, 200))}`);
  console.log(`duplicate desc: ${JSON.stringify((d.desc || '').slice(0, 300))}`);
  if (!APPLY) { console.log('\nDRY RUN — rerun with --apply'); return; }
  const merged = (t.desc || '').includes(NOTE) ? (t.desc || '') : [(t.desc || '').trim(), NOTE].filter(Boolean).join('\n\n');
  await api('PUT', `/cards/${t.id}`, { desc: merged });
  await api('PUT', `/cards/${d.id}`, { closed: 'true' });
  const backT = await api('GET', `/cards/${t.id}`, { fields: 'name,desc,closed,shortUrl' });
  const backD = await api('GET', `/cards/${d.id}`, { fields: 'name,closed,shortUrl' });
  console.log(`\nREAD BACK target: "${backT.name}" closed=${backT.closed} descHasNote=${backT.desc.includes(NOTE)} ${backT.shortUrl}`);
  console.log(`READ BACK duplicate: "${backD.name}" closed=${backD.closed} (archived, restorable from the board menu → Archived items)`);
  if (!backT.desc.includes(NOTE) || !backD.closed) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
