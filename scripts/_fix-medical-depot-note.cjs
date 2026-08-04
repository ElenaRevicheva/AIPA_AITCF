#!/usr/bin/env node
/**
 * One-off: add the two EMAIL buttons to the Medical Depot note.
 *
 * The deal was staged WhatsApp-only because a direct scrape of medicaldepotpanama.com
 * returns 0 bytes — the same bot-blocking that scores them 32/100 on AI crawler
 * access. The address was later recovered from Google's index, so the note needs the
 * email links it could not have had at staging time.
 *
 * Rewrites ONLY the FU button block (everything above the first <hr>) and keeps the
 * rest of the note — the audit, the gap and the letter preview — byte for byte.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHubSpotEmailAnchor, buildHubSpotWaAnchor, formatPhone507 } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();

const DEAL_ID = '63434888257';
const SLUG = 'medical-depot-panama';
const EMAIL = 'atencionclientes@medicaldepotpanama.com';
const PHONE = '+50763173304';
const SCORE = 37;

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 140)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
  const waFirst = fs.readFileSync(path.join(ROOT, reg[SLUG].draft), 'utf8');
  const waFu = fs.readFileSync(path.join(ROOT, reg[`${SLUG}-fu`].draft), 'utf8');

  const assoc = await hs('GET', `/crm/v4/objects/deals/${DEAL_ID}/associations/notes`);
  const noteId = (assoc.results || []).map((r) => r.toObjectId || r.id)[0];
  if (!noteId) throw new Error('no note on the deal');
  const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
  const old = note.properties.hs_note_body || '';
  fs.writeFileSync(path.join(ROOT, `docs/selling/_medical-depot-note.bak-${Date.now()}.html`), old, 'utf8');

  const links = [
    buildHubSpotEmailAnchor(SLUG, EMAIL, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${EMAIL})`),
    buildHubSpotWaAnchor(PHONE, waFirst, `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${SCORE}/100 (${formatPhone507(PHONE)})`),
    buildHubSpotEmailAnchor(`${SLUG}-fu`, EMAIL, `✉️ EMAIL FU — aipa@aideazz.xyz (${EMAIL})`),
    buildHubSpotWaAnchor(PHONE, waFu, `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(PHONE)})`),
  ];

  // Keep everything from the first <hr> onward; replace only the button block.
  const cut = old.search(/<hr\s*\/?>/i);
  const kept = cut >= 0 ? old.slice(cut) : `<hr>${old}`;
  const body =
    `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>` +
    links.map((l) => `${l}<br>`).join('') +
    kept.replace(
      /<b>Email:<\/b> no publicado en el sitio — solo WhatsApp<br>/,
      `<b>Email:</b> ${EMAIL} (recuperado del índice de Google — su sitio bloquea rastreadores)<br>`,
    );

  await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, { properties: { hs_note_body: body } });
  console.log(`✅ note ${noteId} updated — 4 links (was 2), audit + letter preserved`);
})();
