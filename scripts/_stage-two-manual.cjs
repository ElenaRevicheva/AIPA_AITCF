#!/usr/bin/env node
/**
 * One-off: stage Vitae Health + Medical Depot Panama as [CLIENT-MANUAL] deals.
 *
 * Elena asked for these two by name (Aug 2 2026). Both audited live with her own
 * engine, both staged at 🔥 I Act TODAY with the full click-to-send treatment.
 *
 * Medical Depot has NO published email — its site blocks bots hard enough that the
 * scraper got 0 bytes, which is the same reason its AI Crawler Access scores 32/100.
 * It is staged WhatsApp-only rather than guessed at, exactly like the other 7
 * no-email [CLIENT-MANUAL] deals.
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

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 140)}`);
  return t ? JSON.parse(t) : null;
}

const PD =
  'PD: Además de visibilidad en IA, construyo agentes de WhatsApp que responden y agendan 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes y seguimiento, y video con IA para marketing. Todo con demos en vivo en mi portafolio 👆';
const OPERATOR =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';

const LEADS = [
  {
    slug: 'vitae-health',
    existingDealId: process.env.REPAIR ? '63447576873' : null,
    company: 'Vitae Health',
    site: 'https://www.vitae-health.com/',
    email: 'info@vitae-health.com',
    phone: '+50765691219',
    score: 84,
    grade: 'B',
    dealName: '[CLIENT-MANUAL] Vitae Health — GEO/AEO fix (audit: 84/B)',
    query: '¿quién ofrece cuidado en casa o enfermería a domicilio en Panamá?',
    gap: 'su sitio casi no tiene datos estructurados (GEO 50/100, 2 de 8 revisiones): los motores leen el texto pero no entienden QUÉ empresa es, qué servicios ofrece ni dónde opera',
    compliment:
      'servicio de coordinación de cuidado en casa con presencia clara y contenido bien escrito — su respuesta-a-preguntas ya está en 94/100, algo muy poco común',
  },
  {
    slug: 'medical-depot-panama',
    existingDealId: process.env.REPAIR ? '63434888257' : null,
    company: 'Medical Depot Panama',
    site: 'https://medicaldepotpanama.com/',
    email: null,
    phone: '+50763173304',
    score: 37,
    grade: 'F',
    dealName: '[CLIENT-MANUAL] Medical Depot Panama — AI crawler blocked (audit: 37/F)',
    query: '¿dónde compro equipo médico, sillas de ruedas o camas hospitalarias en Panamá?',
    gap: 'su sitio BLOQUEA a los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot) en robots.txt y en su protección de bots — Acceso 32/100: ChatGPT literalmente no puede leer su catálogo aunque quisiera recomendarlo',
    compliment: 'catálogo de equipo médico con varias sucursales y una base técnica sólida en el sitio (71/100 en fundamentos)',
  },
];

(async () => {
  const reg = loadRegistry();
  for (const L of LEADS) {
    const host = L.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const first = [
      `Estimado equipo de ${L.company}:`,
      ``,
      `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
      ``,
      `Primero, felicitaciones — ${L.compliment}.`,
      ``,
      `Les escribo porque analicé ${host} con mi motor de visibilidad en IA y obtuvo ${L.score}/100 (${L.grade}): cuando alguien le pregunta a ChatGPT o Perplexity "${L.query}", su empresa todavía no aparece como respuesta citable — ${L.gap}.`,
      ``,
      `Son 3 arreglos concretos y de implementación rápida. Si les parece bien, se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api`,
      ``,
      PD,
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
      `Les escribí hace unos días sobre ${L.company}. Analicé ${host} con mi motor de visibilidad en IA: ${L.score}/100 (${L.grade}). Cuando un cliente pregunta a ChatGPT o Perplexity "${L.query}", su empresa todavía no aparece como una respuesta citable.`,
      ``,
      OPERATOR,
      ``,
      `Si les sirve, en 15 minutos les muestro los 3 principales arreglos de esa auditoría y cómo quedaría el Operator en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
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
      `Analicé su sitio con mi motor de visibilidad en IA: ${L.score}/100 (${L.grade}). Cuando alguien le pregunta a ChatGPT "${L.query}", su empresa todavía no aparece como respuesta citable.`,
      ``,
      `Son 3 arreglos concretos. ¿Se los muestro en 15 minutos, sin compromiso? Auditoría gratuita: https://aideazz.xyz/api`,
    ].join('\n');

    const waFu = [
      `Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
      ``,
      `Sobre la auditoría de ${L.company} (${L.score}/100): no vendo otro chatbot — instalo un AI Growth Operator que trabaja 24/7, califica leads por WhatsApp y mantiene el CRM al día.`,
      ``,
      `¿15 minutos, sin compromiso? https://aideazz.xyz/api`,
    ].join('\n');

    const dRel = `docs/selling/drafts/${L.slug}-email.txt`;
    const fRel = `docs/selling/drafts/${L.slug}-fu-email.txt`;
    const wRel = `docs/selling/drafts/${L.slug}.txt`;
    const wfRel = `docs/selling/drafts/${L.slug}-fu.txt`;
    if (L.email) {
      fs.writeFileSync(
        path.join(ROOT, dRel),
        `SUBJECT: Auditoría de visibilidad en IA — ${L.company} (${L.score}/100): 3 arreglos concretos\n\nTO: ${L.email}\n\n${first}\n`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(ROOT, fRel),
        `SUBJECT: Seguimiento — auditoría de visibilidad en IA: ${L.company} (${L.score}/100)\n\nTO: ${L.email}\n\n${fu}\n`,
        'utf8',
      );
    }
    fs.writeFileSync(path.join(ROOT, wRel), waFirst, 'utf8');
    fs.writeFileSync(path.join(ROOT, wfRel), waFu, 'utf8');

    // REPAIR MODE: the deals already exist in HubSpot (a git reset wiped only the
    // uncommitted drafts and registry entries, never the CRM records). Re-creating
    // them would give Elena duplicate deals for the same company, so when
    // EXISTING_DEAL is set we rebuild the files and skip every CRM write.
    if (L.existingDealId) {
      const common0 = {
        company: L.company,
        score: L.score,
        dealId: String(L.existingDealId),
        phone: digitsOnly(L.phone),
        ...(L.email ? { email: L.email } : {}),
      };
      reg[L.slug] = { ...common0, draft: wRel, ...(L.email ? { emailDraft: dRel } : {}) };
      reg[`${L.slug}-fu`] = { ...common0, draft: wfRel, ...(L.email ? { emailDraft: fRel } : {}) };
      console.log(`♻️  ${L.company} · repaired drafts + registry · deal ${L.existingDealId} (no new CRM records)`);
      continue;
    }

    const contact = await hs('POST', '/crm/v3/objects/contacts', {
      properties: {
        ...(L.email ? { email: L.email } : {}),
        company: L.company,
        website: L.site,
        phone: L.phone,
        hs_lead_status: 'NEW',
      },
    });
    const deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: { dealname: L.dealName, dealstage: 'qualifiedtobuy', pipeline: 'default', hubspot_owner_id: OWNER },
    });
    if (contact?.id && deal?.id) {
      await hs('PUT', `/crm/v4/objects/deals/${deal.id}/associations/default/contacts/${contact.id}`).catch(() => {});
    }

    const common = {
      company: L.company,
      score: L.score,
      dealId: String(deal.id),
      phone: digitsOnly(L.phone),
      ...(L.email ? { email: L.email } : {}),
    };
    reg[L.slug] = { ...common, draft: wRel, ...(L.email ? { emailDraft: dRel } : {}) };
    reg[`${L.slug}-fu`] = { ...common, draft: wfRel, ...(L.email ? { emailDraft: fRel } : {}) };

    const links = [];
    if (L.email) links.push(buildHubSpotEmailAnchor(L.slug, L.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${L.email})`));
    links.push(buildHubSpotWaAnchor(L.phone, waFirst, `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${L.score}/100 (${formatPhone507(L.phone)})`));
    if (L.email) links.push(buildHubSpotEmailAnchor(`${L.slug}-fu`, L.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${L.email})`));
    links.push(buildHubSpotWaAnchor(L.phone, waFu, `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(L.phone)})`));

    const note = [
      `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
      ...links.map((l) => `${l}<br>`),
      `<hr>`,
      `<b>Auditoría (motor propio, ${new Date().toISOString().slice(0, 10)}):</b> ${L.score}/100 ${L.grade}<br>`,
      `<b>Sitio:</b> ${L.site}<br><b>Tel:</b> ${L.phone}<br>`,
      L.email ? `<b>Email:</b> ${L.email}<br>` : `<b>Email:</b> no publicado en el sitio — solo WhatsApp<br>`,
      `<b>Hueco principal:</b> ${L.gap}<br>`,
      `<hr>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${(L.email ? first : waFirst).replace(/</g, '&lt;')}</pre>`,
    ].join('');
    const n = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: note, hs_timestamp: Date.now() },
    });
    if (n?.id) await hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${deal.id}`).catch(() => {});

    console.log(`✅ ${L.company} · ${L.score}/${L.grade} · deal ${deal.id} · ${links.length} links · ${L.email || 'WhatsApp only'}`);
  }
  saveRegistry(reg);
  console.log('registry entries:', Object.keys(reg).length);
})();
