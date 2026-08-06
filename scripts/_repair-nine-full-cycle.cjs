#!/usr/bin/env node
/**
 * Repair nine [CLIENT-MANUAL] deals to the full click-to-send cycle.
 *
 * They were staged by an older script that wrote note buttons pointing at slugs it
 * never registered, so every email button 404s and there is no follow-up pair at all.
 * The audit verified: 9/9 had ✗EMAIL1 ✗EMAILFU ✗WAFU, and none of the nine slugs
 * existed in outreach-registry.json.
 *
 * The letters themselves are fine — already tailored, already carrying each company's
 * real audit score — so they are RECOVERED from the note rather than regenerated.
 * Nothing is invented; if a letter cannot be extracted the company is reported and
 * skipped instead of being given generic copy.
 *
 * Existing notes are left untouched. The buttons go on a NEW note, so no history is
 * overwritten.
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
  { match: 'Engel', slug: 'engel-volkers-panama' },
  { match: 'Strega', slug: 'la-strega-ristorante-pty' },
  { match: 'AutoGO', slug: 'autogo-repuestos-pty' },
  { match: 'Be Luxe', slug: 'be-luxe-real-estate-pty' },
  { match: 'Madero', slug: 'madero-valor-development' },
  { match: 'Empresas Bern', slug: 'empresas-bern-pty' },
  { match: 'Insignia', slug: 'insignia-resources-pty' },
  { match: 'Marjalizo', slug: 'marjalizo-realty' },
  { match: 'Foundever', slug: 'foundever-pty' },
];

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 130)}`);
  return t ? JSON.parse(t) : null;
}

const stripMd = (s) => String(s).replace(/\*\*\*(.+?)\*\*\*/gs, '$1').replace(/\*\*(.+?)\*\*/gs, '$1');

function htmlToText(h) {
  return String(h || '')
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
}

/** Pull the outreach letter out of the note the old script wrote. */
function extractLetter(noteHtml) {
  const txt = htmlToText(noteHtml);
  const m = txt.match(/---\s*MENSAJE WhatsApp[^\n]*---\s*\n([\s\S]+)/i);
  let body = m ? m[1] : null;
  if (!body) return null;
  // Cut anything that belongs to the note scaffolding rather than the letter.
  body = body.split(/\n---\s*(?:EMAIL|SUBJECT)\b/i)[0];
  body = body.replace(/\n\s*Audit used from this deal[\s\S]*$/i, '');
  return stripMd(body).trim() || null;
}

const OPERATOR =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';
const PORTFOLIO =
  'En AIdeazz AI Lab construyo y opero: agentes de WhatsApp y Telegram que venden y agendan, automatización de procesos repetitivos, visibilidad en motores de IA (GEO/AEO), video con IA para promociones, e ingeniería de confiabilidad para sistemas de IA que fallan. Todo con demos en vivo aquí: https://aideazz.xyz/portfolio';
const SIGN = ['Saludos,', 'Elena Revicheva', 'Fundadora | Ingeniera de IA y Automatización', 'AIdeazz AI Lab ✨'];

function buildFu(company, score, grade) {
  const s = score ? ` ${score}/100${grade ? ` (${grade})` : ''}` : '';
  return [
    `Estimado equipo de ${company}:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí hace unos días sobre ${company}${s ? `, después de analizar su sitio con mi propio motor de auditoría de visibilidad en IA:${s}` : ''}. Les resumo por si el correo se perdió.`,
    ``,
    OPERATOR,
    ``,
    `Si les sirve, en 15 minutos les muestro exactamente cómo quedaría en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    ``,
    `Pueden ver el tono de un agente mío en producción: https://wa.me/50766623757 (prueba gratis 7 días, sin pagos ni suscripción).`,
    ``,
    PORTFOLIO,
    ``,
    ...SIGN,
  ].join('\n');
}

function buildWaFu(company, score, grade) {
  const s = score ? ` (${score}/100${grade ? ` ${grade}` : ''})` : '';
  return [
    `Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí sobre la auditoría de ${company}${s}. No vendo otro chatbot: instalo un AI Growth Operator que trabaja 24/7 dentro de lo que ya usan — responde y califica por WhatsApp, mantiene el CRM al día y entrega un briefing diario.`,
    ``,
    `¿Se los muestro en 15 minutos, sin compromiso? https://aideazz.xyz/api`,
    ``,
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
  ].join('\n');
}

(async () => {
  const reg = loadRegistry();
  const results = [];

  for (const T of TARGETS) {
    const search = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: T.match.split(' ')[0] }] }],
      properties: ['dealname'],
      limit: 25,
    });
    // MUST be a [CLIENT-MANUAL] deal. Matching on the company name alone pulled in
    // hiring-pipeline deals — 'Insignia Resources - Zoom Interview' and 'Interview
    // Invitation from Foundever Panama' — which would have had outreach letters
    // written onto Elena's own job applications.
    const deal = (search.results || []).find((d) => {
      const n = d.properties?.dealname || '';
      return n.includes('[CLIENT-MANUAL]') && n.toLowerCase().includes(T.match.toLowerCase());
    });
    if (!deal) {
      results.push({ name: T.match, ok: false, why: 'deal not found' });
      continue;
    }
    const dealName = deal.properties.dealname;
    const company = dealName.replace(/^\[[A-Z-]+\]\s*/, '').replace(/\s*—.*$/, '').trim();
    const sm = dealName.match(/audit:\s*(\d+)\s*\/\s*([A-F]\+?)/i);
    const score = sm ? Number(sm[1]) : null;
    const grade = sm ? sm[2] : null;

    const ca = await hs('GET', `/crm/v4/objects/deals/${deal.id}/associations/contacts`);
    const cid = ca.results?.[0]?.toObjectId || ca.results?.[0]?.id || null;
    const contact = cid ? await hs('GET', `/crm/v3/objects/contacts/${cid}?properties=email,phone`) : null;
    const email = contact?.properties?.email || null;
    const phone = contact?.properties?.phone || null;

    const na = await hs('GET', `/crm/v4/objects/deals/${deal.id}/associations/notes`);
    const nids = (na.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let letter = null;
    for (const nid of nids) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      const cand = extractLetter(n.properties?.hs_note_body || '');
      if (cand && (!letter || cand.length > letter.length)) letter = cand;
    }
    if (!letter) {
      results.push({ name: company, ok: false, why: 'could not recover the letter from any note' });
      continue;
    }

    const fuSlug = `${T.slug}-fu`;
    const dRel = `docs/selling/drafts/${T.slug}-email.txt`;
    const fRel = `docs/selling/drafts/${fuSlug}-email.txt`;
    const wRel = `docs/selling/drafts/${T.slug}.txt`;
    const wfRel = `docs/selling/drafts/${fuSlug}.txt`;
    const subject = score
      ? `Auditoría de visibilidad en IA — ${company} (${score}/100)`
      : `Auditoría de visibilidad en IA — ${company}`;
    const fuBody = buildFu(company, score, grade);
    const waFuBody = buildWaFu(company, score, grade);

    if (!DRY) {
      if (email) {
        fs.writeFileSync(path.join(ROOT, dRel), `SUBJECT: ${subject}\n\nTO: ${email}\n\n${letter}\n`, 'utf8');
        fs.writeFileSync(
          path.join(ROOT, fRel),
          `SUBJECT: Seguimiento — ${company}${score ? ` (${score}/100)` : ''}\n\nTO: ${email}\n\n${fuBody}\n`,
          'utf8',
        );
      }
      fs.writeFileSync(path.join(ROOT, wRel), letter, 'utf8');
      fs.writeFileSync(path.join(ROOT, wfRel), waFuBody, 'utf8');

      const common = {
        company,
        dealId: String(deal.id),
        ...(score ? { score } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone: digitsOnly(phone) } : {}),
      };
      reg[T.slug] = { ...common, ...(email ? { emailDraft: dRel } : {}), draft: wRel };
      reg[fuSlug] = { ...common, ...(email ? { emailDraft: fRel } : {}), draft: wfRel };

      const links = [];
      if (email) links.push(buildHubSpotEmailAnchor(T.slug, email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${email})`));
      if (phone) links.push(buildHubSpotWaAnchor(phone, letter, `➡️ WHATSAPP 1er CONTACTO (laptop) — ${formatPhone507(phone)}`));
      if (email) links.push(buildHubSpotEmailAnchor(fuSlug, email, `✉️ EMAIL FU — aipa@aideazz.xyz (${email})`));
      if (phone) links.push(buildHubSpotWaAnchor(phone, waFuBody, `➡️ WHATSAPP FU (laptop) — AI Growth Operator (${formatPhone507(phone)})`));

      const note = [
        `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
        ...links.map((l) => `${l}<br>`),
        `<hr>`,
        `<b>Ciclo completo reparado ${new Date().toISOString().slice(0, 10)}.</b> Los botones anteriores apuntaban a slugs sin registrar y no enviaban nada.<br>`,
        score ? `<b>Auditoría:</b> ${score}/100${grade ? ` ${grade}` : ''}<br>` : '',
        email ? `<b>Email:</b> ${email}<br>` : `<b>Email:</b> no disponible — solo WhatsApp<br>`,
        phone ? `<b>WhatsApp:</b> ${phone}<br>` : '',
        `<hr>`,
        `<pre style="white-space:pre-wrap;font-family:inherit">${letter.replace(/</g, '&lt;')}</pre>`,
      ].join('');
      const n = await hs('POST', '/crm/v3/objects/notes', {
        properties: { hs_note_body: note, hs_timestamp: Date.now() },
      });
      if (n?.id) await hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${deal.id}`).catch(() => {});
    }

    results.push({ name: company, ok: true, email: !!email, phone: !!phone, dealId: deal.id, letterLen: letter.length });
  }

  if (!DRY) saveRegistry(reg);
  console.log(DRY ? '=== DRY RUN ===\n' : '=== REPAIRED ===\n');
  for (const r of results) {
    if (!r.ok) console.log(`  ✗ ${String(r.name).padEnd(26)} ${r.why}`);
    else
      console.log(
        `  ✅ ${String(r.name).padEnd(26)} deal ${r.dealId} · ${r.email ? 'email+WA' : 'WA only'} · ${(r.email ? 4 : 2)} links · letter ${r.letterLen}ch`,
      );
  }
  console.log(`\nregistry entries: ${Object.keys(reg).length}`);
})();
