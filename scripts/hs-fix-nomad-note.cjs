#!/usr/bin/env node
/** One-shot: append full Manual Prospect Play note to Nomad deal. Reads HUBSPOT_API_KEY from .env */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const m = env.match(/^HUBSPOT_API_KEY=(.+)$/m);
const KEY = m?.[1]?.trim();
if (!KEY) {
  console.error('HUBSPOT_API_KEY missing in .env');
  process.exit(1);
}

const HS = 'https://api.hubapi.com';
const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const draft = fs.readFileSync(
  path.join(root, 'docs/selling/drafts/nomad-constructions-corp.txt'),
  'utf8',
).trim();
const waUrl = `https://wa.me/50769484982?text=${encodeURIComponent(draft)}`;

const noteHtml = [
  '[CLIENT-MANUAL] Nomad Constructions Corp. — AI Visibility outreach (https links; data verified live)',
  '',
  `<a href="${waUrl.replace(/"/g, '&quot;')}"><b>➡️ ENVIAR POR WHATSAPP (+507 6948-4982)</b></a>`,
  '',
  '--- MENSAJE (plain text — copy or send via link above) ---',
  '',
  draft,
  '',
  '--- Audit (verified live) ---',
  '90/100 Grade A | Tech 100 | AI Access 95 | GEO 88 | AEO 81 (weakest) | All AI crawlers allowed',
  '',
  'Angle: "muy cerca — 3 arreglos". Money query: constructora recomendada Pedasí/Azuero / Panamá — not yet a citable answer.',
  '',
  'Top fixes: (1) clear H1, (2) FAQ with question-style headings, (3) llms.txt + FAQPage/Service JSON-LD.',
  '',
  'Contacts: WhatsApp +507 6948-4982 | info@nomadcc.com | IG @nomad_constructions | nomadcc.com',
  '',
  'Next: Click wa.me link → Send → move deal to "⏳ Sent — passive wait" → complete task → append ✅ SENT {date} + verbatim text to this note.',
].join('<br>');

(async () => {
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{
      filters: [{
        propertyName: 'dealname',
        operator: 'CONTAINS_TOKEN',
        value: 'Nomad',
      }],
    }],
    properties: ['dealname', 'dealstage'],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 5,
  });

  const deals = (search.results || []).filter(d =>
    (d.properties?.dealname || '').includes('[CLIENT-MANUAL]') &&
    (d.properties?.dealname || '').includes('Nomad'),
  );
  if (!deals.length) {
    console.error('No [CLIENT-MANUAL] Nomad deal found');
    process.exit(1);
  }

  const deal = deals[0];
  console.log('DEAL', deal.id, deal.properties.dealname);

  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: {
      hs_note_body: noteHtml,
      hs_timestamp: new Date().toISOString(),
    },
  });

  await hs(
    'PUT',
    `/crm/v4/objects/notes/${note.id}/associations/deals/${deal.id}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
  );

  console.log('NOTE_ADDED', note.id, 'to deal', deal.id);
})().catch(e => {
  console.error(String(e.message || e));
  process.exit(1);
});
