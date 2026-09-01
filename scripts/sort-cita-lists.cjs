#!/usr/bin/env node
/**
 * Nightly: put every "Kira <Mes> <Año>" board's Cita column back in date order.
 *
 * Why (1 Sep 2026): Elena was moving cards into date order by hand every month.
 * New cards land at the bottom of the list regardless of their due date, so the
 * column drifts out of order the moment anything is added — by her, by /cita, or
 * by any other agent.
 *
 * Safety: this writes ONE field, `pos`. It never changes a card's name, dates,
 * labels, description or list, and never creates or archives anything. That is
 * what makes it safe to run unattended against boards she edits by hand.
 *
 * Prints a result line per board — the count moved, not merely "ran" — so the log
 * answers "did it do anything" rather than "did it execute".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Read .env by hand. Never `source` it: FROM_EMAIL contains spaces and angle
// brackets and breaks shell parsing.
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

(async () => {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  if (!process.env.TRELLO_API_KEY || !process.env.TRELLO_TOKEN) {
    console.log(`[${stamp}] cita-sort ABORT — TRELLO_API_KEY/TRELLO_TOKEN missing`);
    process.exit(1);
  }
  try {
    const { sortAllKiraCitaLists } = require(path.join(ROOT, 'dist/iendi-cita.js'));
    const lines = await sortAllKiraCitaLists();
    const moved = lines.reduce((n, l) => {
      const m = l.match(/(\d+) moved/);
      return n + (m ? parseInt(m[1], 10) : 0);
    }, 0);
    console.log(`[${stamp}] cita-sort OK — ${moved} card(s) repositioned across ${lines.length} board(s)`);
    lines.forEach(l => console.log(`    ${l}`));
    process.exit(0);
  } catch (e) {
    console.log(`[${stamp}] cita-sort FAILED — ${String(e && e.message || e).slice(0, 200)}`);
    process.exit(1);
  }
})();
