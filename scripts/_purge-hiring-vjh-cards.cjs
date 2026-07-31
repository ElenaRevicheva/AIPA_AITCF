#!/usr/bin/env node
'use strict';
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const KEY = env.match(/^TRELLO_API_KEY=(.+)$/m)?.[1]?.trim();
const TOKEN = env.match(/^TRELLO_TOKEN=(.+)$/m)?.[1]?.trim();
if (!KEY || !TOKEN) throw new Error('no Trello key/token in .env');

const TAG = '[HIRING-VJH-LEAD]';

async function trello(path) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.trello.com/1${path}${sep}key=${KEY}&token=${TOKEN}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const boards = await trello('/members/me/boards?fields=name');
  console.log(`Scanning ${boards.length} boards for "${TAG}" cards...`);

  const hits = [];
  for (const b of boards) {
    const cards = await trello(`/boards/${b.id}/cards?fields=name,desc,shortUrl,idList`);
    for (const c of cards) {
      if (c.name.includes(TAG)) {
        hits.push({ ...c, boardId: b.id, boardName: b.name });
      }
    }
  }

  console.log(`Found ${hits.length} card(s) tagged "${TAG}" across ${boards.length} boards.`);
  if (hits.length === 0) { console.log('Nothing to purge.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `backups/trello-vjh-cards-${stamp}.json`;
  fs.mkdirSync('backups', { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(hits, null, 2));
  console.log(`Backed up ${hits.length} cards to ${backupPath}`);

  let deleted = 0;
  for (const c of hits) {
    const r = await fetch(`https://api.trello.com/1/cards/${c.id}?key=${KEY}&token=${TOKEN}`, { method: 'DELETE' });
    if (r.ok) {
      deleted++;
      console.log(`  deleted: [${c.boardName}] ${c.name}`);
    } else {
      console.warn(`  FAILED to delete ${c.id}: ${r.status} ${await r.text()}`);
    }
  }
  console.log(`Done. Deleted ${deleted}/${hits.length}. Backup: ${backupPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
