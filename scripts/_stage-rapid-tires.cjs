#!/usr/bin/env node
/**
 * One-off: stage Rapid Tires Panamá as a [CLIENT-MANUAL] deal, full cycle.
 *
 * Elena asked for this one by name (Aug 4 2026). Audited live: 95/100 A+ — their site
 * is genuinely excellent, so the usual "your AI visibility is broken" opening would be
 * FALSE here. Leading with a problem they do not have is how you lose a good prospect
 * in the first line.
 *
 * So the audit is used as a compliment instead of a wound, and the offer moves to the
 * pain a multi-branch tyre shop with 250+ Google reviews actually has: the same
 * questions arriving all day on WhatsApp — do you have my size, how much for four,
 * are you open, do you do alignment — across several locations.
 *
 * Set REPAIR=<dealId> to rebuild drafts and registry against an existing deal instead
 * of creating a second one.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  loadRegistry,
  saveRegistry,
  digitsOnly,
  formatPhone507,
  buildHubSpotEmailAnchor,
  buildHubSpotWaAnchor,
} = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();
const KEY = g('HUBSPOT_API_KEY');
const OWNER = g('HUBSPOT_OWNER_ID') || '91612860';
const EXISTING = process.env.REPAIR || null;

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 140)}`);
  return t ? JSON.parse(t) : null;
}

const L = {
  slug: 'rapid-tires-panama',
  company: 'Rapid Tires Panamá',
  site: 'https://www.rapidtirespanama.com/',
  email: 'info@rapidtirespanama.com',
  // Google Maps lists landlines for the branches (214-5776, 282-0165), which wa.me
  // cannot open. This mobile is the one published for WhatsApp contact.
  phone: '+50766172399',
  score: 95,
  grade: 'A+',
};

const PD =
  'PD: Además de agentes de WhatsApp, hago automatización de procesos repetitivos (cotizaciones, seguimiento, reportes), visibilidad en motores de IA y video con IA para promociones. Todo con demos en vivo en mi portafolio 👆';

const OPERATOR =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: responde WhatsApp al instante, califica al cliente, mantiene el CRM al día y les entrega un briefing diario con las mejores oportunidades.';

const first = [
  `Estimado equipo de ${L.company}:`,
  ``,
  `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
  ``,
  `Primero, felicitaciones de verdad: analicé rapidtirespanama.com con mi motor de visibilidad en IA y obtuvo **95/100 (A+)**. Es de los mejores puntajes que he medido en Panamá — su sitio sí aparece como respuesta citable cuando alguien le pregunta a ChatGPT dónde comprar llantas. Ahí no tienen problema, y no les voy a inventar uno.`,
  ``,
  `Les escribo por otra cosa. Con más de 250 reseñas y varias sucursales, me imagino que por WhatsApp les llegan todo el día las mismas preguntas: si tienen la medida, cuánto cuestan cuatro, si hacen alineación, hasta qué hora abren, si aceptan tarjeta. Eso consume tiempo del equipo y muchas se enfrían cuando llegan de noche o en fin de semana.`,
  ``,
  `Instalo un agente de WhatsApp que contesta eso solo, 24/7, en español e inglés: consulta medida y precio, dice qué sucursal tiene disponibilidad, toma los datos del cliente y le pasa al equipo solo lo que necesita una persona — con un resumen listo.`,
  ``,
  `Si les parece bien, se lo muestro funcionando en 15 minutos, sin ningún compromiso. Pueden probar uno que ya tengo en producción aquí: https://wa.me/50766623757`,
  ``,
  `PD técnica, por si les sirve: los únicos dos detalles que le faltan al sitio para llegar a 100 son un archivo llms.txt y las etiquetas og: para previsualizaciones. Se los paso sin costo aunque no trabajemos juntos.`,
  ``,
  `¡Que tengan un excelente día!`,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización`,
  `AIdeazz AI Lab ✨`,
].join('\n');

const fu = [
  `Estimado equipo de ${L.company}:`,
  ``,
  `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
  ``,
  `Les escribí hace unos días sobre ${L.company}. Su sitio está excelente (95/100 A+ en mi auditoría de visibilidad en IA), así que mi propuesta no es arreglar la web — es lo que pasa en WhatsApp: las mismas preguntas de medidas, precios y sucursales, todo el día, y las que llegan de noche esperando hasta la mañana.`,
  ``,
  OPERATOR,
  ``,
  `Si les sirve, en 15 minutos les muestro cómo quedaría con sus propias preguntas y su tono — sin compromiso. Pueden probar uno en producción aquí: https://wa.me/50766623757`,
  ``,
  PD,
  ``,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización`,
  `AIdeazz AI Lab ✨`,
].join('\n');

const waFirst = [
  `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
  ``,
  `Primero, felicitaciones: analicé rapidtirespanama.com con mi motor de visibilidad en IA y sacó 95/100 (A+), de los mejores que he medido en Panamá. Ahí no tienen problema.`,
  ``,
  `Les escribo por otra cosa: con varias sucursales, por WhatsApp les deben llegar todo el día las mismas preguntas — medidas, precio de cuatro, alineación, horarios. Instalo un agente que contesta eso solo 24/7 (ES/EN), toma los datos y le pasa al equipo solo lo que necesita una persona.`,
  ``,
  `Pueden probar uno que ya tengo en producción: https://wa.me/50766623757`,
  ``,
  `¿Se los muestro en 15 minutos, sin compromiso?`,
  ``,
  `¡Que tengan un excelente día!`,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
].join('\n');

const waFu = [
  `Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
  ``,
  `Su sitio está excelente (95/100 A+), así que no vengo a arreglar la web. Vengo por WhatsApp: las mismas preguntas de medidas, precios y sucursales todo el día, y las de la noche esperando hasta la mañana.`,
  ``,
  `No vendo otro chatbot — instalo un agente que contesta solo lo repetitivo, califica al cliente y le pasa al equipo lo que necesita una persona. Pruébenlo: https://wa.me/50766623757`,
  ``,
  `¿15 minutos, sin compromiso?`,
  ``,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
].join('\n');

(async () => {
  const reg = loadRegistry();
  const dRel = `docs/selling/drafts/${L.slug}-email.txt`;
  const fRel = `docs/selling/drafts/${L.slug}-fu-email.txt`;
  const wRel = `docs/selling/drafts/${L.slug}.txt`;
  const wfRel = `docs/selling/drafts/${L.slug}-fu.txt`;

  fs.writeFileSync(
    path.join(ROOT, dRel),
    `SUBJECT: ${L.company} sacó 95/100 en visibilidad en IA — les escribo por otra cosa\n\nTO: ${L.email}\n\n${first}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, fRel),
    `SUBJECT: Seguimiento — agente de WhatsApp para ${L.company}\n\nTO: ${L.email}\n\n${fu}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(ROOT, wRel), waFirst, 'utf8');
  fs.writeFileSync(path.join(ROOT, wfRel), waFu, 'utf8');

  let dealId = EXISTING;
  if (!dealId) {
    const contact = await hs('POST', '/crm/v3/objects/contacts', {
      properties: { email: L.email, company: L.company, website: L.site, phone: L.phone, hs_lead_status: 'NEW' },
    });
    const deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname: `[CLIENT-MANUAL] ${L.company} — WhatsApp agent (audit: ${L.score}/${L.grade})`,
        dealstage: 'qualifiedtobuy',
        pipeline: 'default',
        hubspot_owner_id: OWNER,
      },
    });
    dealId = deal.id;
    if (contact?.id) {
      await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contact.id}`).catch(() => {});
    }
  }

  const common = { company: L.company, email: L.email, score: L.score, dealId: String(dealId), phone: digitsOnly(L.phone) };
  reg[L.slug] = { ...common, emailDraft: dRel, draft: wRel };
  reg[`${L.slug}-fu`] = { ...common, emailDraft: fRel, draft: wfRel };
  saveRegistry(reg);

  if (!EXISTING) {
    const links = [
      buildHubSpotEmailAnchor(L.slug, L.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${L.email})`),
      buildHubSpotWaAnchor(L.phone, waFirst, `➡️ WHATSAPP 1er CONTACTO (laptop) — 95/100 A+ (${formatPhone507(L.phone)})`),
      buildHubSpotEmailAnchor(`${L.slug}-fu`, L.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${L.email})`),
      buildHubSpotWaAnchor(L.phone, waFu, `➡️ WHATSAPP FU (laptop) — agente de WhatsApp (${formatPhone507(L.phone)})`),
    ];
    const note = [
      `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
      ...links.map((l) => `${l}<br>`),
      `<hr>`,
      `<b>Auditoría (motor propio, ${new Date().toISOString().slice(0, 10)}):</b> ${L.score}/100 ${L.grade} — Acceso IA 95 · GEO 94 · AEO 94 · Técnico 100<br>`,
      `<b>Sitio:</b> ${L.site}<br><b>Email:</b> ${L.email}<br><b>WhatsApp:</b> ${L.phone}<br>`,
      `<b>Sucursales/tel fijos:</b> Via Porras +507 214-5776 · Costa del Este +507 282-0165 (fijos — wa.me no los abre)<br>`,
      `<b>Google:</b> 4.7★ (172 reseñas) Via Porras · 4.6★ (75) Costa del Este<br>`,
      `<b>ÁNGULO:</b> el sitio NO es el problema (95/A+). La venta es el agente de WhatsApp para preguntas repetitivas entre sucursales. Los únicos huecos técnicos son llms.txt y etiquetas og: — se ofrecen gratis como gesto.<br>`,
      `<hr>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${first.replace(/</g, '&lt;')}</pre>`,
    ].join('');
    const n = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: note, hs_timestamp: Date.now() },
    });
    if (n?.id) await hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${dealId}`).catch(() => {});
  }

  console.log(`${EXISTING ? '♻️  repaired' : '✅ staged'} ${L.company} · ${L.score}/${L.grade} · deal ${dealId} · 4 links`);
  console.log('registry entries:', Object.keys(reg).length);
})();
