#!/usr/bin/env node
/**
 * Repair the last seven [CLIENT-MANUAL] deals whose first-contact slug is broken.
 *
 * Same defect as the nine repaired on Aug 5: an older staging script wrote note
 * buttons pointing at slugs it never registered, so every email button returns
 * "Unknown outreach email slug" and there is no follow-up pair.
 *
 * These seven were found by _audit-full-cycle-coverage.cjs, which checked structure,
 * and they matter because _prove-automation-fired.cjs showed the post-send chain
 * itself is healthy — 175/175 stage moves, 0 missed stamps. So a wired button really
 * does produce the whole cycle; these seven simply were not wired.
 *
 * Letters are RECOVERED from the existing notes, never regenerated: they already carry
 * each company's real audit score and tailored angle. A deal whose letter cannot be
 * extracted is reported and skipped rather than given invented copy.
 *
 * Old dead buttons are re-pointed at the new slugs in place, so no note is left with a
 * link that 404s and nothing is deleted.
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
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const DRY = process.argv.includes('--dry');

const TARGETS = [
  { match: 'Panama Yacht Group', slug: 'panama-yacht-group-pty' },
  { match: 'DQSA', slug: 'dqsa-panama-pty' },
  { match: 'PALIG', slug: 'palig-panama-pty' },
  { match: 'Banco LAFISE', slug: 'banco-lafise-panama-pty' },
  { match: 'Panama Equity', slug: 'panama-equity-pty' },
  { match: 'Eurostone', slug: 'eurostone-panama-pty' },
  { match: 'Sotillo', slug: 'sotillo-company-pty' },
];

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  }
  return t ? JSON.parse(t) : null;
}

const stripMd = (s) => String(s).replace(/\*\*\*(.+?)\*\*\*/gs, '$1').replace(/\*\*(.+?)\*\*/gs, '$1');

const htmlToText = (h) =>
  String(h || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function extractLetter(noteHtml) {
  const txt = htmlToText(noteHtml);
  const m = txt.match(/---\s*MENSAJE WhatsApp[^\n]*---\s*\n([\s\S]+)/i);
  let body = m ? m[1] : null;
  if (!body) {
    const alt = txt.match(/\n(Hola,?\s*¡?un gusto saludarles[\s\S]+)/i) || txt.match(/\n(Estimado equipo[\s\S]+)/i);
    body = alt ? alt[1] : null;
  }
  if (!body) return null;
  body = body.split(/\n---\s*(?:EMAIL|SUBJECT)\b/i)[0];
  body = body.replace(/\n\s*Audit used from this deal[\s\S]*$/i, '');
  body = body.replace(/\n\s*(?:✅|👀|⛔|📧)\s*(?:\[[^\]]+\]\s*)?(?:ENTREGADO|ABIERTO|REBOTE|EMAILED)[\s\S]*$/i, '');
  return stripMd(body).trim() || null;
}

const OPERATOR =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';
const PORTFOLIO =
  'En AIdeazz AI Lab construyo y opero: agentes de WhatsApp y Telegram que venden y agendan, automatización de procesos repetitivos, visibilidad en motores de IA (GEO/AEO), video con IA para promociones, e ingeniería de confiabilidad para sistemas de IA que fallan. Todo con demos en vivo aquí: https://aideazz.xyz/portfolio';

const buildFu = (company, score, grade) =>
  [
    `Estimado equipo de ${company}:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí hace unos días sobre ${company}${score ? `, después de analizar su sitio con mi propio motor de auditoría de visibilidad en IA: ${score}/100${grade ? ` (${grade})` : ''}` : ''}. Se los resumo por si el correo se perdió.`,
    ``,
    OPERATOR,
    ``,
    `Si les sirve, en 15 minutos les muestro exactamente cómo quedaría en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    ``,
    `Pueden ver el tono de un agente mío en producción: https://wa.me/50766623757 (prueba gratis 7 días, sin pagos ni suscripción).`,
    ``,
    PORTFOLIO,
    ``,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');

const buildWaFu = (company, score, grade) =>
  [
    `Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí sobre la auditoría de ${company}${score ? ` (${score}/100${grade ? ` ${grade}` : ''})` : ''}. No vendo otro chatbot: instalo un AI Growth Operator que trabaja 24/7 dentro de lo que ya usan — responde y califica por WhatsApp, mantiene el CRM al día y entrega un briefing diario.`,
    ``,
    `¿Se los muestro en 15 minutos, sin compromiso? https://aideazz.xyz/api`,
    ``,
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
  ].join('\n');

(async () => {
  const reg = loadRegistry();
  const out = [];

  for (const T of TARGETS) {
    const search = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: T.match.split(' ')[0] }] }],
      properties: ['dealname'],
      limit: 30,
    });
    const deal = (search.results || []).find((d) => {
      const n = d.properties?.dealname || '';
      return n.includes('[CLIENT-MANUAL]') && n.toLowerCase().includes(T.match.toLowerCase());
    });
    if (!deal) {
      out.push({ name: T.match, ok: false, why: 'deal not found' });
      continue;
    }
    const dealName = deal.properties.dealname;
    const company = dealName.replace(/^\[[A-Z-]+\]\s*/, '').replace(/\s*—.*$/, '').trim();
    const sm = dealName.match(/audit:\s*(\d+)\s*\/\s*([A-F]\+?)/i);
    const score = sm ? Number(sm[1]) : null;
    const grade = sm ? sm[2] : null;

    const ca = await hs('GET', `/crm/v4/objects/deals/${deal.id}/associations/contacts`);
    const cid = ca?.results?.[0]?.toObjectId || ca?.results?.[0]?.id || null;
    const contact = cid ? await hs('GET', `/crm/v3/objects/contacts/${cid}?properties=email,phone`) : null;
    const email = contact?.properties?.email || null;
    const phone = contact?.properties?.phone || null;

    const na = await hs('GET', `/crm/v4/objects/deals/${deal.id}/associations/notes`);
    const nids = (na?.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let letter = null;
    const notes = [];
    for (const nid of nids) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      const b = n?.properties?.hs_note_body || '';
      notes.push({ id: nid, body: b });
      const cand = extractLetter(b);
      if (cand && (!letter || cand.length > letter.length)) letter = cand;
    }
    if (!letter) {
      out.push({ name: company, ok: false, why: 'letter not recoverable from any note' });
      continue;
    }
    if (!email) {
      out.push({ name: company, ok: false, why: 'no contact email — WhatsApp only, nothing to wire' });
      continue;
    }

    const fuSlug = `${T.slug}-fu`;
    const dRel = `docs/selling/drafts/${T.slug}-email.txt`;
    const fRel = `docs/selling/drafts/${fuSlug}-email.txt`;
    const wRel = `docs/selling/drafts/${T.slug}.txt`;
    const wfRel = `docs/selling/drafts/${fuSlug}.txt`;
    const fuBody = buildFu(company, score, grade);
    const waFuBody = buildWaFu(company, score, grade);

    if (!DRY) {
      fs.writeFileSync(
        path.join(ROOT, dRel),
        `SUBJECT: Auditoría de visibilidad en IA — ${company}${score ? ` (${score}/100)` : ''}\n\nTO: ${email}\n\n${letter}\n`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(ROOT, fRel),
        `SUBJECT: Seguimiento — ${company}${score ? ` (${score}/100)` : ''}\n\nTO: ${email}\n\n${fuBody}\n`,
        'utf8',
      );
      fs.writeFileSync(path.join(ROOT, wRel), letter, 'utf8');
      fs.writeFileSync(path.join(ROOT, wfRel), waFuBody, 'utf8');

      const common = {
        company,
        email,
        dealId: String(deal.id),
        ...(score ? { score } : {}),
        ...(phone ? { phone: digitsOnly(phone) } : {}),
      };
      reg[T.slug] = { ...common, emailDraft: dRel, ...(phone ? { draft: wRel } : {}) };
      reg[fuSlug] = { ...common, emailDraft: fRel, ...(phone ? { draft: wfRel } : {}) };

      const links = [buildHubSpotEmailAnchor(T.slug, email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${email})`)];
      if (phone) links.push(buildHubSpotWaAnchor(phone, letter, `➡️ WHATSAPP 1er CONTACTO (laptop) — ${formatPhone507(phone)}`));
      links.push(buildHubSpotEmailAnchor(fuSlug, email, `✉️ EMAIL FU — aipa@aideazz.xyz (${email})`));
      if (phone) links.push(buildHubSpotWaAnchor(phone, waFuBody, `➡️ WHATSAPP FU (laptop) — AI Growth Operator (${formatPhone507(phone)})`));

      const note = [
        `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
        ...links.map((l) => `${l}<br>`),
        `<hr>`,
        `<b>Ciclo completo reparado ${new Date().toISOString().slice(0, 10)}.</b> Los botones anteriores apuntaban a slugs sin registrar y no enviaban nada.<br>`,
        score ? `<b>Auditoría:</b> ${score}/100${grade ? ` ${grade}` : ''}<br>` : '',
        `<b>Email:</b> ${email}<br>`,
        phone ? `<b>WhatsApp:</b> ${phone}<br>` : `<b>WhatsApp:</b> sin teléfono — solo email<br>`,
        `<hr>`,
        `<pre style="white-space:pre-wrap;font-family:inherit">${letter.replace(/</g, '&lt;')}</pre>`,
      ].join('');
      const n = await hs('POST', '/crm/v3/objects/notes', {
        properties: { hs_note_body: note, hs_timestamp: Date.now() },
      });
      if (n?.id) await hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${deal.id}`).catch(() => {});

      // Re-point any old dead button on the existing notes so nothing 404s.
      for (const nt of notes) {
        const fixed = nt.body.replace(
          /\/go\/outreach-email\/([a-z0-9-]+)/g,
          (full, slug) => (reg[slug] && reg[slug].emailDraft ? full : `/go/outreach-email/${/-fu$/.test(slug) ? fuSlug : T.slug}`),
        );
        if (fixed !== nt.body) {
          await hs('PATCH', `/crm/v3/objects/notes/${nt.id}`, { properties: { hs_note_body: fixed } });
        }
      }
    }
    out.push({ name: company, ok: true, dealId: deal.id, email, phone: !!phone, len: letter.length });
  }

  if (!DRY) saveRegistry(reg);
  console.log(DRY ? '=== DRY RUN ===\n' : '=== REPAIRED ===\n');
  for (const r of out) {
    if (!r.ok) console.log(`  ✗ ${String(r.name).padEnd(24)} ${r.why}`);
    else console.log(`  ✅ ${String(r.name).padEnd(24)} deal ${r.dealId} · ${r.phone ? '4 links' : '2 links (no phone)'} · letter ${r.len}ch`);
  }
  console.log(`\nregistry entries: ${Object.keys(reg).length}`);
})();
