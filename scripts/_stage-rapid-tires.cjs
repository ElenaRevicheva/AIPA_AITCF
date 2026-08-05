#!/usr/bin/env node
/**
 * Rapid Tires Panamá — [CLIENT-MANUAL], full cycle.
 *
 * Audited live at 95/100 A+, so the usual "your AI visibility is broken" opening would
 * be false. The audit is used as the credential instead, with its four categories named
 * so it reads as a measurement and not as flattery.
 *
 * Elena's correction (Aug 4 2026): "in Panama all businesses have automatic generic
 * chatbots" — offering a market leader an FAQ bot is offering them something they own.
 * So the letter names their existing bot first and draws the line that matters:
 * answering is not selling. The wedge is reading the tyre size from a photo of the
 * sidewall, plus per-branch stock and booking — none of which an off-the-shelf bot can
 * do, because they need their inventory and calendar.
 *
 * The ask is a diagnostic, not a demo: send 10 real WhatsApp conversations and get back
 * an analysis of where each sale died. Hard to refuse, costs them nothing, and hands
 * over their real funnel data before any quote.
 *
 * UPDATE=<dealId> rewrites the drafts, note and deal name for an existing deal instead
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
const UPDATE = process.env.UPDATE || null;

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
  // Both branch numbers on Google Maps are landlines (214-5776, 282-0165) and wa.me
  // cannot open those. This is the published mobile.
  phone: '+50766172399',
  score: 95,
  grade: 'A+',
};

const DEAL_NAME = `[CLIENT-MANUAL] ${L.company} — WhatsApp sales agent · stock + citas (audit: ${L.score}/${L.grade})`;

const AUDIT_BLOCK = [
  `• Acceso para motores de IA: 95/100 — ChatGPT, Perplexity y Google AI sí pueden leer su sitio`,
  `• Datos estructurados (GEO): 94/100 — entienden qué empresa son, qué venden y dónde`,
  `• Respuesta-a-preguntas (AEO): 94/100 — su contenido sirve como respuesta citable`,
  `• Base técnica: 100/100 — perfecto`,
].join('\n');

const OPERATOR = [
  `Y para ser clara sobre lo que hago: no vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.`,
].join('\n');

const PORTFOLIO = `En AIdeazz AI Lab construyo y opero: agentes de WhatsApp y Telegram que venden y agendan, automatización de procesos repetitivos, visibilidad en motores de IA (GEO/AEO), video con IA para promociones, e ingeniería de confiabilidad para sistemas de IA que fallan. Todo con demos en vivo aquí: https://aideazz.xyz/portfolio`;

const PD = `PD: Para llegar a 100/100 solo les faltan dos detalles pequeños: un archivo guía que les indica a los buscadores con IA cuáles son sus páginas importantes, y las etiquetas que hacen que su enlace se vea bien —con imagen y descripción— cuando alguien lo comparte por WhatsApp. Se los dejo listos sin costo, trabajemos juntos o no.`;

const first = [
  `Estimado equipo de Rapid Tires:`,
  ``,
  `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
  ``,
  `Primero, felicitaciones de verdad. Analicé rapidtirespanama.com con mi propio motor de auditoría de visibilidad en IA (lo desarrollé yo, corre en https://aideazz.xyz/api) y su sitio sacó 95/100 (A+) — de los mejores puntajes que he medido en Panamá:`,
  ``,
  AUDIT_BLOCK,
  ``,
  `Se los digo porque casi nadie en Panamá está en ese nivel, y porque no les voy a inventar un problema que no tienen.`,
  ``,
  `Les escribo por otra cosa. Asumo que ya tienen un bot en WhatsApp — casi todos en Panamá lo tienen, y casi todos hacen lo mismo: contestan. El punto es que contestar no es vender.`,
  ``,
  `Un cliente escribe "¿tienen 225/45R17?" y recibe "en breve un asesor le atenderá". Esa venta ya se enfrió, sobre todo si escribió un sábado a las 8 de la noche.`,
  ``,
  `Lo que yo instalo hace otra cosa:`,
  ``,
  `1. Lee la medida desde una foto del costado de la llanta. La mayoría de los clientes no sabe su medida, y ahí se cae la conversación antes de empezar.`,
  ``,
  `2. Consulta el stock por sucursal y aparta el juego — "sí, hay 4 en Costa del Este, se las guardo hasta mañana".`,
  ``,
  `3. Agenda la instalación con recordatorio, y le pasa al asesor solo lo que necesita una persona, con el resumen listo.`,
  ``,
  `4. Reactiva sola la cotización que quedó fría: "¿seguimos con las 225/45R17 que consultó el sábado?"`,
  ``,
  `5. Separa flotas y empresas del cliente individual y las rutea a comercial, que es donde está el ticket grande.`,
  ``,
  `Nada de eso lo hace un bot genérico, porque requiere conectarse a su inventario y a su agenda.`,
  ``,
  OPERATOR,
  ``,
  `Una propuesta concreta, sin compromiso: mándenme 10 conversaciones reales de WhatsApp de la semana pasada, sin datos personales. Les devuelvo un análisis señalando en qué mensaje exactamente se cayó cada venta y cuántas de esas 10 se habrían cerrado solas. Si el número no les impresiona, no hay nada que hablar.`,
  ``,
  `Pueden ver el tono de un agente mío en producción: https://wa.me/50766623757 (prueba gratis 7 días, sin pagos ni suscripción).`,
  ``,
  PORTFOLIO,
  ``,
  `¡Que tengan un excelente día!`,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización`,
  `AIdeazz AI Lab ✨`,
  ``,
  PD,
].join('\n');

const fu = [
  `Estimado equipo de Rapid Tires:`,
  ``,
  `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
  ``,
  `Les escribí hace unos días. Resumo en dos líneas por si se perdió el correo:`,
  ``,
  `Su sitio está excelente — 95/100 (A+) en mi auditoría de visibilidad en IA, de los mejores de Panamá. No vengo a arreglar la web.`,
  ``,
  `Vengo por WhatsApp. Ya tienen un bot, como casi todos aquí, y como casi todos contesta pero no vende: cuando alguien pregunta por una medida un sábado en la noche, recibe "un asesor le atenderá" y esa venta se enfría. El agente que instalo lee la medida desde una foto de la llanta, consulta stock por sucursal, aparta el juego, agenda la instalación y reactiva solo las cotizaciones que quedaron frías.`,
  ``,
  OPERATOR,
  ``,
  `Sigue en pie la propuesta sin compromiso: mándenme 10 conversaciones reales de WhatsApp de la semana pasada (sin datos personales) y les devuelvo el análisis de en qué mensaje se cayó cada venta.`,
  ``,
  `Agente mío en producción, por si quieren ver el tono: https://wa.me/50766623757`,
  ``,
  PORTFOLIO,
  ``,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización`,
  `AIdeazz AI Lab ✨`,
].join('\n');

const waFirst = [
  `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
  ``,
  `Primero, felicitaciones: analicé rapidtirespanama.com con mi propio motor de auditoría de IA (https://aideazz.xyz/api) y sacó 95/100 (A+) — de los mejores de Panamá. Ahí no tienen problema y no les voy a inventar uno.`,
  ``,
  `Les escribo por otra cosa. Asumo que ya tienen un bot en WhatsApp; casi todos aquí lo tienen y casi todos solo CONTESTAN. Contestar no es vender: alguien pregunta "¿tienen 225/45R17?" un sábado a las 8pm, recibe "un asesor le atenderá", y esa venta se enfría.`,
  ``,
  `El agente que instalo lee la medida desde una FOTO del costado de la llanta, consulta stock por sucursal, aparta el juego, agenda la instalación y reactiva solo las cotizaciones frías. Eso un bot genérico no lo hace, porque necesita su inventario y su agenda.`,
  ``,
  `Propuesta sin compromiso: mándenme 10 conversaciones reales de la semana pasada (sin datos personales) y les señalo en qué mensaje se cayó cada venta.`,
  ``,
  `Agente mío en producción para que vean el tono: https://wa.me/50766623757`,
  ``,
  `¡Que tengan un excelente día!`,
  `Saludos,`,
  `Elena Revicheva`,
  `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
].join('\n');

const waFu = [
  `Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
  ``,
  `Resumo por si se perdió: su sitio está excelente (95/100 A+), no vengo a arreglar la web. Vengo por WhatsApp — su bot contesta, pero no vende.`,
  ``,
  `El agente que instalo lee la medida desde una foto de la llanta, consulta stock por sucursal, aparta, agenda la instalación y reactiva las cotizaciones frías. No vendo otro chatbot: instalo un AI Growth Operator que trabaja 24/7 dentro de lo que ya usan.`,
  ``,
  `Sigue en pie: mándenme 10 conversaciones reales de la semana pasada y les digo dónde se cayó cada venta. Sin compromiso.`,
  ``,
  `Pruébenlo: https://wa.me/50766623757`,
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
    `SUBJECT: Rapid Tires sacó 95/100 en visibilidad en IA — les escribo por otra cosa\n\nTO: ${L.email}\n\n${first}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, fRel),
    `SUBJECT: Seguimiento — su bot contesta, pero ¿vende? (Rapid Tires)\n\nTO: ${L.email}\n\n${fu}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(ROOT, wRel), waFirst, 'utf8');
  fs.writeFileSync(path.join(ROOT, wfRel), waFu, 'utf8');

  let dealId = UPDATE;
  if (!dealId) {
    const contact = await hs('POST', '/crm/v3/objects/contacts', {
      properties: { email: L.email, company: L.company, website: L.site, phone: L.phone, hs_lead_status: 'NEW' },
    });
    const deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: { dealname: DEAL_NAME, dealstage: 'qualifiedtobuy', pipeline: 'default', hubspot_owner_id: OWNER },
    });
    dealId = deal.id;
    if (contact?.id) {
      await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contact.id}`).catch(() => {});
    }
  } else {
    // Rename so hs-outcomes-to-atlas scores it against whatsapp_ai_agents, not the
    // geo_aeo default it would fall back to.
    await hs('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: { dealname: DEAL_NAME } });
  }

  const common = { company: L.company, email: L.email, score: L.score, dealId: String(dealId), phone: digitsOnly(L.phone) };
  reg[L.slug] = { ...common, emailDraft: dRel, draft: wRel };
  reg[`${L.slug}-fu`] = { ...common, emailDraft: fRel, draft: wfRel };
  saveRegistry(reg);

  const links = [
    buildHubSpotEmailAnchor(L.slug, L.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${L.email})`),
    buildHubSpotWaAnchor(L.phone, waFirst, `➡️ WHATSAPP 1er CONTACTO (laptop) — 95/100 A+ (${formatPhone507(L.phone)})`),
    buildHubSpotEmailAnchor(`${L.slug}-fu`, L.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${L.email})`),
    buildHubSpotWaAnchor(L.phone, waFu, `➡️ WHATSAPP FU (laptop) — su bot contesta, no vende (${formatPhone507(L.phone)})`),
  ];
  const note = [
    `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
    ...links.map((l) => `${l}<br>`),
    `<hr>`,
    `<b>Auditoría (motor propio ${'https://aideazz.xyz/api'}, ${new Date().toISOString().slice(0, 10)}):</b> ${L.score}/100 ${L.grade}<br>`,
    `Acceso IA 95 · GEO 94 · AEO 94 · Técnico 100<br>`,
    `<b>Sitio:</b> ${L.site}<br><b>Email:</b> ${L.email}<br><b>WhatsApp:</b> ${L.phone}<br>`,
    `<b>Sucursales (fijos, wa.me no los abre):</b> Via Porras +507 214-5776 · Costa del Este +507 282-0165<br>`,
    `<b>Google:</b> 4.7★ (172) Via Porras · 4.6★ (75) Costa del Este<br>`,
    `<hr>`,
    `<b>ÁNGULO — leer antes de llamar:</b><br>`,
    `El sitio NO es el problema (95/A+, de los mejores de Panamá). Y ya tienen bot de WhatsApp — en Panamá casi todos lo tienen. La venta NO es "un bot que contesta", es que <b>contestar no es vender</b>.<br>`,
    `Diferenciadores que un bot genérico no puede: (1) lee la medida desde FOTO del costado de la llanta, (2) stock por sucursal + apartado, (3) agenda instalación, (4) reactiva cotización fría, (5) rutea flotas a comercial. Requieren inventario + agenda = integración real.<br>`,
    `<b>El pedido es un diagnóstico, no un demo:</b> 10 conversaciones reales de WhatsApp → análisis de dónde murió cada venta. Difícil de rechazar y entrega su funnel real antes de cotizar.<br>`,
    `<hr>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${first.replace(/</g, '&lt;')}</pre>`,
  ].join('');
  const n = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: note, hs_timestamp: Date.now() },
  });
  if (n?.id) await hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${dealId}`).catch(() => {});

  console.log(`${UPDATE ? '♻️  updated' : '✅ staged'} ${L.company} · ${L.score}/${L.grade} · deal ${dealId} · 4 links`);
  console.log('registry entries:', Object.keys(reg).length);
})();
