#!/usr/bin/env node
/**
 * Verify every Resend-confirmed OPEN actually carries an ABIERTO stamp in HubSpot.
 *
 * Elena (Aug 4 2026): "refresh marks with ABIERTO if really they are really opened
 * proven at resend — check true logs, not config."
 *
 * Source of truth is the pm2 log: `[resend-webhook] email.opened <to> deal=<id> →
 * applied`. Those lines only exist because Resend called us, so they are proof an open
 * happened. This compares that list against the deal notes and reports — or with
 * FIX=1, repairs — any deal whose open never made it onto the note.
 *
 * Never invents a stamp: a deal with no open event in the log is left alone.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const LOG = process.env.PM2_LOG || '/home/ubuntu/.pm2/logs/cto-aipa-out-9.log';
const FIX = process.env.FIX === '1';

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

/** Same note-selection rule the webhook uses, so a repair lands where a live stamp would. */
function isOutreachNote(b) {
  return /FOLLOW-UP|MENSAJE|ENVIAR POR (WHATSAPP|EMAIL)|EMAIL FU|WHATSAPP FU|CLIENT-MANUAL/i.test(b);
}

function insertNoteStamp(body, stampHtml) {
  const fuEnd = body.search(/<hr\s*\/?>/i);
  const fuHeading = /FOLLOW-UP/i.test(body.slice(0, Math.max(fuEnd, 0)));
  if (fuEnd >= 0 && fuHeading) {
    const cut = fuEnd + (body.slice(fuEnd).match(/<hr\s*\/?>/i)?.[0].length || 4);
    return `${body.slice(0, cut)}${stampHtml}<br>${body.slice(cut)}`;
  }
  return `${stampHtml}<br>${body}`;
}

(async () => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n');
  // deal -> { emails:Set, count }
  const opens = new Map();
  for (const L of lines) {
    const m = L.match(/\[resend-webhook\] email\.opened\s+(?:for\s+)?(\S+@\S+?)\s+deal=(\d+)\s+→ applied/);
    if (!m) continue;
    const [, to, deal] = m;
    if (!opens.has(deal)) opens.set(deal, { emails: new Set(), count: 0 });
    const e = opens.get(deal);
    e.emails.add(to.replace(/[<>]/g, ''));
    e.count++;
  }
  console.log(`deals with a Resend-confirmed open: ${opens.size}\n`);

  const missing = [];
  let ok = 0;
  let gone = 0;
  for (const [dealId, info] of opens) {
    let deal;
    try {
      deal = await hs('GET', `/crm/v3/objects/deals/${dealId}?properties=dealname`);
    } catch {
      deal = null;
    }
    if (!deal) {
      gone++;
      console.log(`  ⚠ deal ${dealId} no longer exists (${[...info.emails][0]})`);
      continue;
    }
    const name = deal.properties?.dealname || '';
    const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
    const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let target = null;
    let hasStamp = false;
    for (const nid of ids) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_timestamp`);
      const b = n.properties?.hs_note_body || '';
      if (/ABIERTO/i.test(b)) hasStamp = true;
      if (!target && isOutreachNote(b)) target = { id: n.id, body: b };
    }
    if (hasStamp) {
      ok++;
      continue;
    }
    missing.push({ dealId, name: name.slice(0, 56), email: [...info.emails][0], opens: info.count, noteId: target?.id || null });
  }

  console.log(`already stamped ABIERTO : ${ok}`);
  console.log(`MISSING the stamp       : ${missing.length}`);
  console.log(`deal deleted            : ${gone}\n`);
  for (const m of missing) {
    console.log(`  ✗ ${m.name.padEnd(58)} ${m.email} (${m.opens} open${m.opens > 1 ? 's' : ''})${m.noteId ? '' : ' — NO outreach note'}`);
  }

  if (!FIX) {
    console.log('\n(read-only — rerun with FIX=1 to backfill)');
    return;
  }

  let fixed = 0;
  for (const m of missing) {
    if (!m.noteId) continue;
    const n = await hs('GET', `/crm/v3/objects/notes/${m.noteId}?properties=hs_note_body`);
    const body = n.properties?.hs_note_body || '';
    if (/ABIERTO/i.test(body)) continue;
    // Wording matches the live webhook stamp, and says plainly that the date is the
    // backfill date rather than pretending to know when the open happened.
    const stamp =
      `👀 ABIERTO (confirmado por Resend · registrado ${new Date().toISOString().slice(0, 10)} desde el log de eventos) → ${m.email}` +
      ` — señal blanda: puede ser el proxy de correo del destinatario`;
    await hs('PATCH', `/crm/v3/objects/notes/${m.noteId}`, {
      properties: { hs_note_body: insertNoteStamp(body, stamp) },
    });
    fixed++;
    console.log(`  ✅ stamped ${m.name}`);
  }
  console.log(`\nbackfilled: ${fixed}`);
})();
