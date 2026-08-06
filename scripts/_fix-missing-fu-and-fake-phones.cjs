#!/usr/bin/env node
/**
 * Two defects found by sweeping the whole registry, not one deal at a time.
 *
 * 1. FAKE PHONES — san-blas-tour and arden-price carry phone "00000000000", a
 *    placeholder written instead of leaving the field absent. Harmless today only
 *    because nothing renders a link for them; any future script asking "does this
 *    have a phone?" gets yes and builds wa.me/00000000000, a button that goes
 *    nowhere. The field is removed rather than zeroed.
 *
 * 2. MISSING FOLLOW-UP PAIR — five emailable prospects have a first-contact slug and
 *    no -fu counterpart, so a second touch would have to be built by hand. That is
 *    the manual step that never happens.
 *
 * The two ESPALUZ prospects get a follow-up in the OTHER session's own template
 * (60-day free pilot, the code, the voice-note line, the explicit opt-out), read from
 * their existing -fu drafts. Writing them in a different voice would leave one prospect
 * receiving two unrelated-sounding letters.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRegistry, saveRegistry, buildHubSpotEmailAnchor } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const DRY = process.argv.includes('--dry');
const FAKE = /^0+$|^(\d)\1{6,}$/;

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

const OPERATOR =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';
const PORTFOLIO =
  'En AIdeazz AI Lab construyo y opero: agentes de WhatsApp y Telegram que venden y agendan, automatización de procesos repetitivos, visibilidad en motores de IA (GEO/AEO), video con IA para promociones, e ingeniería de confiabilidad para sistemas de IA que fallan. Todo con demos en vivo aquí: https://aideazz.xyz/portfolio';

/** Standard AIdeazz follow-up. */
function fuStandard(company, score, grade) {
  const s = score ? ` ${score}/100${grade ? ` (${grade})` : ''}` : '';
  return [
    `Estimado equipo de ${company}:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí hace unos días sobre ${company}${s ? `, después de analizar su sitio con mi propio motor de auditoría de visibilidad en IA:${s}` : ''}. Se los retomo brevemente por si el correo se perdió.`,
    ``,
    OPERATOR,
    ``,
    `Si les sirve, en 15 minutos les muestro exactamente cómo quedaría en su operación — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    ``,
    `Pueden ver el tono de un agente mío en producción: https://wa.me/50766623757 (prueba gratis 7 días, sin pagos ni suscripción).`,
    ``,
    PORTFOLIO,
    ``,
    `Y si prefieren no seguir con esto, me lo dicen sin problema y no les vuelvo a escribir.`,
    ``,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');
}

/** ESPALUZ follow-up, matching the other session's live template. */
function fuEspaluz(company, code) {
  return [
    `Estimado equipo:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋Soy Elena Revicheva, ingeniera de IA y dirijo AIdeazz AI Lab aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí hace unos días sobre EspaLuz, el acompañante bilingüe con IA para las familias de ${company}, y quería retomarlo brevemente por si el correo se perdió entre tantos.`,
    ``,
    `Lo esencial, en tres líneas:`,
    `• Piloto gratuito de 60 días, sin costo, sin integración y sin factura de su parte.`,
    `• El código es ${code} — solo lo comparten y quedan activos.`,
    `• Una nota de voz en su idioma vuelve en español Y en inglés, texto y voz.`,
    ``,
    `Lo construí a partir de la experiencia de mi propia familia al llegar a Panamá, así que no es un chatbot genérico: cada función salió de una necesidad concreta que vivimos en casa.`,
    ``,
    `Si les sirve, en 15 minutos se los muestro por videollamada, o paso para una demostración corta. Y si prefieren no seguir con esto, me lo dicen sin problema y no les vuelvo a escribir.`,
    ``,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | AIdeazz AI Lab ✨`,
    `https://aideazz.xyz/portfolio`,
  ].join('\n');
}

const ESPALUZ_CODE = { 'balboa-academy-espaluz': 'BALBOA_PARENTS', 'amcham-panama-espaluz': 'AMCHAM_MEMBERS' };

(async () => {
  const reg = loadRegistry();
  const gaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/_sweep_gaps.json'), 'utf8'));
  const log = [];

  // ── 1. fake phones ──────────────────────────────────────────────────────────
  for (const slug of gaps.fakePhone) {
    for (const k of [slug, `${slug}-fu`]) {
      if (reg[k] && reg[k].phone && FAKE.test(String(reg[k].phone))) {
        const { phone, draft, ...rest } = reg[k];
        // drop draft too: a WhatsApp draft with no real number is a dead button
        reg[k] = rest;
        log.push(`  🧹 ${k.padEnd(30)} removed fake phone ${phone}${draft ? ' + its WA draft ref' : ''}`);
      }
    }
  }

  // ── 2. missing follow-up pairs ──────────────────────────────────────────────
  for (const slug of gaps.noFu) {
    const e = reg[slug];
    if (!e || !e.email) {
      log.push(`  ✗ ${slug.padEnd(30)} no email — skipped`);
      continue;
    }
    const fuSlug = `${slug}-fu`;
    const isEspaluz = /-espaluz$/.test(slug);
    const company = e.company || slug;
    const body = isEspaluz
      ? fuEspaluz(company, ESPALUZ_CODE[slug] || 'ESPALUZ_PILOT')
      : fuStandard(company, e.score, null);
    const subject = isEspaluz
      ? `Seguimiento — EspaLuz para familias de ${company} (piloto gratuito)`
      : `Seguimiento — ${company}${e.score ? ` (${e.score}/100)` : ''}`;
    const rel = `docs/selling/drafts/${fuSlug}-email.txt`;

    if (!DRY) {
      fs.writeFileSync(path.join(ROOT, rel), `SUBJECT: ${subject}\n\nTO: ${e.email}\n\n${body}\n`, 'utf8');
      reg[fuSlug] = {
        company,
        email: e.email,
        emailDraft: rel,
        ...(e.score ? { score: e.score } : {}),
        ...(e.dealId ? { dealId: e.dealId } : {}),
        ...(e.phone && !FAKE.test(String(e.phone)) ? { phone: e.phone } : {}),
      };
      // add the EMAIL FU button to the deal note
      if (e.dealId) {
        const na = await hs('GET', `/crm/v4/objects/deals/${e.dealId}/associations/notes`);
        const ids = (na?.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
        let target = null;
        for (const nid of ids) {
          const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
          const b = n?.properties?.hs_note_body || '';
          if (/FOLLOW-UP|EMAIL 1er CONTACTO|ENVIAR POR EMAIL/i.test(b)) target = { id: nid, body: b };
        }
        const anchor = buildHubSpotEmailAnchor(fuSlug, e.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${e.email})`);
        if (target && !/EMAIL FU/i.test(target.body)) {
          const cut = target.body.search(/<hr\s*\/?>/i);
          const nb =
            cut >= 0
              ? `${target.body.slice(0, cut)}${anchor}<br>${target.body.slice(cut)}`
              : `${anchor}<br>${target.body}`;
          await hs('PATCH', `/crm/v3/objects/notes/${target.id}`, { properties: { hs_note_body: nb } });
        } else if (!target) {
          await hs('POST', '/crm/v3/objects/notes', {
            properties: {
              hs_note_body: `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>${anchor}<br><hr><pre style="white-space:pre-wrap;font-family:inherit">${body.replace(/</g, '&lt;')}</pre>`,
              hs_timestamp: Date.now(),
            },
          }).then((n) =>
            n?.id ? hs('PUT', `/crm/v4/objects/notes/${n.id}/associations/default/deals/${e.dealId}`).catch(() => {}) : null,
          );
        }
      }
    }
    log.push(`  ✅ ${fuSlug.padEnd(30)} ${isEspaluz ? 'ESPALUZ template' : 'standard FU'} · ${e.email}`);
  }

  if (!DRY) saveRegistry(reg);
  console.log(DRY ? '=== DRY RUN ===' : '=== FIXED ===');
  log.forEach((l) => console.log(l));
  console.log(`\nregistry entries: ${Object.keys(reg).length}`);
})();
