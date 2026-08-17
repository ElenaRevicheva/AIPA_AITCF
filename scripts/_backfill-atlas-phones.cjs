#!/usr/bin/env node
/**
 * One-off: backfill the WhatsApp numbers that the Aug 17 leads were staged without.
 *
 * Those six reached HubSpot the day the supply moved from SerpAPI's maps engine
 * (which carried `phone`) to Bright Data organic (which does not). d21cffe fixes
 * it going forward by reading the number off the contact page findEmail already
 * downloads; this recovers the ones already written.
 *
 * Writes: contact.phone + a note on the deal carrying a click-to-send WhatsApp
 * link. Sends NOTHING — Elena clicks from WhatsApp Web on the laptop, which is
 * the standing rule after Meta restricted her linked devices.
 *
 *   node scripts/_backfill-atlas-phones.cjs --dry
 *   node scripts/_backfill-atlas-phones.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHubSpotWaAnchor, formatPhone507, digitsOnly } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();
const HS = g('HUBSPOT_API_KEY');
if (!HS) throw new Error('need HUBSPOT_API_KEY');
const DRY = process.argv.includes('--dry');

// Recovered live from each company's own contact page on 2026-08-17.
// `mobile:false` = a fixed line: the link is still generated, but WhatsApp only
// delivers to mobiles, so it is flagged rather than silently handed over.
const LEADS = [
  { email: 'info@csapty.com', company: 'Servicios de Contabilidad C.S.A.', phone: '5072606043', score: 87, grade: 'A', mobile: false },
  { email: 'info@auditool.org', company: 'Auditool', phone: '573027796688', score: 76, grade: 'B', mobile: true },
  { email: 'ventas@aduanarobles.com', company: 'Aduana Robles', phone: '50763300787', score: 83, grade: 'B', mobile: true },
  { email: 'info@glfcorp.com', company: 'GLF Corp', phone: '50766228942', score: 90, grade: 'A', mobile: true },
];

// 85+ is the CREDENTIAL, never "you are invisible" — a 90/A business told it does
// not appear will simply reply with its own score. Below that the gap is real and
// can be named. Same rule stage-manual-prospect.cjs encodes as CREDENTIAL_SCORE.
const CREDENTIAL_SCORE = 85;

function waText(l) {
  const opener =
    l.score >= CREDENTIAL_SCORE
      ? `Analicé ${l.company} con mi motor de visibilidad en IA: ${l.score}/100 (${l.grade}) — de los mejores puntajes que he medido en Panamá. No le voy a inventar un problema que no tienen.`
      : `Analicé ${l.company} con mi motor de visibilidad en IA: ${l.score}/100 (${l.grade}). Cuando un cliente le pregunta a ChatGPT o Perplexity por opciones como la suya, su empresa todavía no aparece como respuesta citable.`;
  return [
    `Hola, un gusto saludarles 👋 Soy Elena Revicheva, ingeniera de IA y automatización aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    opener,
    ``,
    `No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: responde y califica consultas por WhatsApp en español e inglés, automatiza cotizaciones y seguimiento, mantiene el CRM al día y les entrega un briefing diario con las mejores oportunidades.`,
    ``,
    `¿Les sirven 15 minutos esta semana? Les muestro cómo quedaría en su operación, sin compromiso. La auditoría completa es gratuita: https://aideazz.xyz/api`,
    ``,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | AIdeazz AI Lab ✨`,
  ].join('\n');
}

async function hs(p, init = {}) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${HS}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`HubSpot ${p} -> ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? null : r.json();
}

async function findContact(email) {
  const d = await hs('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'phone', 'company'],
      limit: 1,
    }),
  });
  return (d.results || [])[0] || null;
}

async function findDeal(company) {
  const d = await hs('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT-ATLAS' }] }],
      properties: ['dealname'],
      limit: 100,
    }),
  });
  const key = company.toLowerCase().slice(0, 14);
  return (d.results || []).find((r) => (r.properties.dealname || '').toLowerCase().includes(key)) || null;
}

(async () => {
  console.log(`[backfill] ${DRY ? 'DRY RUN — nothing written' : 'LIVE'} · ${LEADS.length} leads\n`);
  for (const l of LEADS) {
    const tag = l.mobile ? '' : '  ⚠️ LANDLINE — WhatsApp may not deliver';
    try {
      const c = await findContact(l.email);
      if (!c) { console.log(`  ✗ ${l.company} — contact not found (${l.email})`); continue; }

      const text = waText(l);
      const anchor = buildHubSpotWaAnchor(
        l.phone,
        text,
        `➡️ WHATSAPP (laptop) — ${l.company} · auditoría ${l.score}/100 (${formatPhone507(l.phone)})`,
      );

      if (!DRY) {
        await hs(`/crm/v3/objects/contacts/${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: { phone: digitsOnly(l.phone) } }),
        });
        const deal = await findDeal(l.company);
        const note = await hs('/crm/v3/objects/notes', {
          method: 'POST',
          body: JSON.stringify({
            properties: {
              hs_timestamp: Date.now(),
              hs_note_body:
                `<b>WhatsApp recuperado del sitio</b> — ${formatPhone507(l.phone)}` +
                `${l.mobile ? '' : ' (línea fija — WhatsApp puede no entregar)'}<br><br>` +
                `${anchor}<br><br><pre>${text.replace(/</g, '&lt;')}</pre>`,
            },
          }),
        });
        if (deal) {
          await hs(`/crm/v4/objects/notes/${note.id}/associations/deals/${deal.id}`, {
            method: 'PUT',
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]),
          });
        }
        await hs(`/crm/v4/objects/notes/${note.id}/associations/contacts/${c.id}`, {
          method: 'PUT',
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]),
        });
        console.log(`  ✅ ${l.company} — phone set, note+WA link on ${deal ? 'deal+contact' : 'contact'}${tag}`);
      } else {
        console.log(`  · ${l.company} — would set ${formatPhone507(l.phone)} (contact ${c.id})${tag}`);
      }
    } catch (e) {
      console.log(`  ✗ ${l.company} — ${String(e.message).slice(0, 120)}`);
    }
  }
  console.log('\n[backfill] done — nothing was sent; click from WhatsApp Web on the laptop.');
})();
