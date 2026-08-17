#!/usr/bin/env node
/**
 * Attach the backfilled WhatsApp notes to their DEALS.
 *
 * _backfill-atlas-phones.cjs found the deal by matching my label ("GLF Corp")
 * against the deal name — but the deal is named after the SCRAPED company
 * ("Empresa de Logística en Panamá"), so two of four never matched and their
 * note landed on the contact only. Elena opened the deal and saw no WhatsApp
 * link, which is exactly the outcome the note exists to prevent.
 *
 * A contact already carries the association to its deal. Use that, never a
 * string match on a name nobody guaranteed would agree.
 *
 *   node scripts/_fix-wa-note-deal-links.cjs --dry
 *   node scripts/_fix-wa-note-deal-links.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const HS = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!HS) throw new Error('need HUBSPOT_API_KEY');
const DRY = process.argv.includes('--dry');

const CONTACTS = ['242524819004', '242530888572', '242531394457', '242530864918'];
const NOTE_MARKER = 'WhatsApp recuperado';

async function hs(p, init = {}) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${HS}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`${p} -> ${r.status}: ${(await r.text()).slice(0, 140)}`);
  return r.status === 204 ? null : r.json();
}

(async () => {
  console.log(`[fix] ${DRY ? 'DRY RUN' : 'LIVE'} · ${CONTACTS.length} contacts\n`);
  for (const cid of CONTACTS) {
    try {
      const [notes, deals] = await Promise.all([
        hs(`/crm/v4/objects/contacts/${cid}/associations/notes`),
        hs(`/crm/v4/objects/contacts/${cid}/associations/deals`),
      ]);
      const dealId = (deals.results || [])[0]?.toObjectId;
      if (!dealId) { console.log(`  ✗ contact ${cid} — no associated deal`); continue; }

      // Identify the backfill note by its own marker, so a re-run cannot attach
      // the wrong note and the original lead-machine note is left alone.
      let target = null;
      for (const n of notes.results || []) {
        const full = await hs(`/crm/v3/objects/notes/${n.toObjectId}?properties=hs_note_body`);
        if ((full.properties.hs_note_body || '').includes(NOTE_MARKER)) { target = n.toObjectId; break; }
      }
      if (!target) { console.log(`  ✗ contact ${cid} — no WhatsApp note found`); continue; }

      const already = await hs(`/crm/v4/objects/notes/${target}/associations/deals`);
      if ((already.results || []).some((r) => String(r.toObjectId) === String(dealId))) {
        console.log(`  · note ${target} already on deal ${dealId} — nothing to do`);
        continue;
      }
      if (!DRY) {
        await hs(`/crm/v4/objects/notes/${target}/associations/deals/${dealId}`, {
          method: 'PUT',
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]),
        });
      }
      console.log(`  ✅ note ${target} -> deal ${dealId}${DRY ? ' (would link)' : ''}`);
    } catch (e) {
      console.log(`  ✗ contact ${cid} — ${String(e.message).slice(0, 120)}`);
    }
  }
  console.log('\n[fix] done — open the deal, the WhatsApp link is in Notes.');
})();
