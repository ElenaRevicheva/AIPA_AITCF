#!/usr/bin/env node
/**
 * stage-manual-prospect.cjs — Manual Prospect Play → HubSpot (5 records).
 * Usage: node scripts/stage-manual-prospect.cjs <domain> [--with-fu] [--dry-run]
 * Reads HUBSPOT_API_KEY from .env or the environment. Writes draft + prospect pack
 * under docs/selling/.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildHubSpotWaAnchor,
  buildDualChannelNoteLinks,
  buildManualEmailSubject,
  buildManualEmailBody,
  formatPhone507,
  registerOutreachSlug,
  slugify,
} = require('./wa-link-lib.cjs');
const {
  hubspotKey,
  hubspotOwnerId,
  hubspotBase,
  visibilityUrl,
  visibilityKey,
} = require('./hs-env.cjs');

const root = path.join(__dirname, '..');
const KEY = hubspotKey();
/** Elena Revicheva — always assign Manual Prospect tasks/deals so Tasks UI "Assigned to me" works */
const HUBSPOT_OWNER_ID = hubspotOwnerId();
const VIS_KEY = visibilityKey();
const dryRun = process.argv.includes('--dry-run');
const skipAudit = process.argv.includes('--skip-audit');
/**
 * --prepare-only writes every artifact (WhatsApp + email drafts, registry row, prospect
 * pack with the exact note HTML) without creating anything in HubSpot, so the letter can
 * be read before a deal exists — and so the play can be prepared from a machine that
 * cannot reach api.hubapi.com.
 */
const prepareOnly = process.argv.includes('--prepare-only');
/** Skip the prospect-site crawl (contacts then come from PROSPECT_META) — used by tests. */
const noScrape = process.argv.includes('--no-scrape');
/** Run the follow-up installer on the new deal, so one command ends the full cycle. */
const withFu = process.argv.includes('--with-fu');
const scoreArg = process.argv.find((a) => a.startsWith('--score='));
const scoreOverride = scoreArg ? Number(scoreArg.split('=')[1]) : null;
/**
 * --update=<dealId> refreshes an ALREADY-staged prospect: rewrites its drafts + registry
 * and posts a fresh note on the existing deal, instead of creating a second one. Purely
 * additive — the old note stays in the deal's history, nothing is deleted.
 */
const updateArg = process.argv.find((a) => a.startsWith('--update='));
const updateDealId = updateArg ? updateArg.split('=')[1].trim() : null;
const domainArg = process.argv.find(a => a.startsWith('--') === false && a !== process.argv[0] && a !== process.argv[1]);
if (!domainArg) {
  console.error('Usage: node scripts/stage-manual-prospect.cjs <domain> [--with-fu] [--prepare-only] [--dry-run] [--skip-audit] [--score=75] [--no-scrape] [--update=<dealId>]');
  process.exit(1);
}
const domain = domainArg.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const url = `https://${domain}`;

/** Modes that never call HubSpot; everything else needs the Service Key up front. */
const offline = dryRun || prepareOnly;
if (!KEY && !offline) {
  console.error('HUBSPOT_API_KEY missing — put it in .env or the environment (docs/HUBSPOT_CURSOR_CONNECTION.md)');
  process.exit(1);
}

const HS = hubspotBase();
const VIS = visibilityUrl();
const headers = KEY ? { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } : {};

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/** Panama mobiles are 8 digits starting with 6; landlines are 7 and have no WhatsApp. */
const PA_MOBILE = /^5076\d{7}$/;

function parseContacts(html) {
  const out = new Set();
  const patterns = [
    /wa\.me\/(\d+)/gi,
    /api\.whatsapp\.com\/send[^"']*phone=(\d+)/gi,
    /tel:([+\d\s-]+)/gi,
    /mailto:([^"'\s?]+)/gi,
    // The plus is optional: Panama sites commonly print "507 300-2858". Requiring it
    // made those sites look phone-less and silently downgraded them to email-only.
    /(?<!\d)\+?507[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) out.add(m[1] || m[0]);
  }
  // An explicit wa.me / api.whatsapp link is the site declaring a WhatsApp number —
  // authoritative even when it is not a Panama mobile.
  const waExplicit = [
    ...[...html.matchAll(/wa\.me\/(\d+)/gi)].map(m => m[1]),
    ...[...html.matchAll(/api\.whatsapp\.com\/send[^"']*phone=(\d+)/gi)].map(m => m[1]),
  ]
    .map(d => (d.length === 8 ? `507${d}` : d))
    .filter(d => d.length >= 10);
  const phones = [...out]
    .map(p => {
      let d = p.replace(/\D/g, '');
      // wa.me/66150368 (local 8-digit) → 50766150368
      if (d.length === 8) d = `507${d}`;
      return d;
    })
    .filter(p => p.length >= 10 && p.startsWith('507'));
  // Emails: mailto links AND plain text (many Panama sites print info@… as text).
  const junk = /\.(png|jpg|jpeg|gif|webp|svg|css|js|html)$|@(2x|3x)\b|sentry|wixpress|example\.|correoernesto|^[0-9]+@|@.*-seccion\.|user@domain|john@doe|ttycirugia/i;
  // mailto: is authoritative — the site itself declares the address there.
  const mailtoEmails = [...html.matchAll(/mailto:([^"'\s?<>]+)/gi)].map(m => m[1].toLowerCase());
  // Plain text needs a LEFT boundary, or a label glued to the address is swallowed
  // into the local part: "Email" + "contactus@dentalconnect.com.mx" became
  // emailcontactus@… and the send was suppressed (caught July 26 2026).
  const textEmails = [
    ...html.matchAll(/(?<![A-Za-z0-9._%+-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g),
  ].map(m => m[0].toLowerCase());

  /**
   * Last-resort repair for addresses that still arrive glued to a label
   * ("emailcontactus@…", "correoinfo@…"). Only accepts the stripped variant when
   * the site itself also shows it — never guesses a new address.
   */
  const unglue = (addr) => {
    const m = addr.match(/^(e-?mail|correo(?:electronico)?|mail|escr[ií]benos|cont[áa]ctenos)([a-z][a-z0-9._%+-]{2,})@(.+)$/i);
    if (!m) return addr;
    const candidate = `${m[2]}@${m[3]}`.toLowerCase();
    const shown = new RegExp(`(?<![A-Za-z0-9._%+-])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    return shown.test(html) || mailtoEmails.includes(candidate) ? candidate : addr;
  };

  const emails = [...mailtoEmails, ...textEmails]
    .map(e => e.toLowerCase())
    .map(unglue)
    .filter(e => !junk.test(e))
    .filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e));
  // Only a declared WhatsApp link or a Panama mobile can receive a WhatsApp message.
  // Handing a landline to wa.me produces a button that opens a chat with nobody.
  const wa = waExplicit[0] || phones.find(p => PA_MOBILE.test(p)) || null;
  const onDomain = emails.find(e => e.endsWith(`@${domain}`) || e.includes(domain.split('.')[0]));
  const email = onDomain || emails[0] || null;
  return { phones: [...new Set(phones)], email, whatsapp: wa };
}

function weakestCategory(audit) {
  const cats = audit.categories || [];
  if (Array.isArray(cats) && cats.length) {
    const sorted = [...cats].sort((a, b) => a.score - b.score);
    const w = sorted[0];
    const labelMap = { aiAccess: 'AI Access', geo: 'GEO', aeo: 'AEO', techSeo: 'Tech' };
    return { name: labelMap[w.id] || w.label || w.id, score: w.score, id: w.id };
  }
  const scores = audit.scores || audit.breakdown || {};
  const pairs = [
    ['Tech', scores.tech ?? scores.techSeo ?? scores.technical ?? 100],
    ['AI Access', scores.aiAccess ?? scores.ai_access ?? 100],
    ['GEO', scores.geo ?? 100],
    ['AEO', scores.aeo ?? 100],
  ];
  pairs.sort((a, b) => a[1] - b[1]);
  return { name: pairs[0][0], score: pairs[0][1], id: pairs[0][0] };
}

/** The AI Growth Operator paragraph — canonical wording (MANUAL_PROSPECT_PLAY.md). */
const OPERATOR_PARA =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';

/** A site scoring this high has no visibility problem to sell against. */
const CREDENTIAL_SCORE = 85;

/**
 * The one place Elena says she is open to roles (`openToRoles: true` in PROSPECT_META).
 *
 * Written for search firms, where a senior engineer is not a favour to place but
 * inventory to map, and worded to keep that footing: it is disclosed as transparency,
 * not asked as a favour; it names the level she would consider instead of "cualquier
 * oportunidad"; and it closes by putting the paid offer back on the table, so the letter
 * cannot be read as a pitch that was really a job application. One block, one review —
 * per-prospect wording would drift into pleading on the fourth rewrite.
 *
 * Said once, in the first letter only. The follow-up stays purely commercial: asking
 * twice is what turns a peer's disclosure into a request.
 */
const OPEN_TO_ROLES_NOTE =
  'Y una nota personal, con transparencia: además de instalar estos sistemas para empresas, estoy abierta a escuchar oportunidades — liderazgo técnico en IA, arquitectura o automatización, en Panamá o remoto. Si en alguna de sus búsquedas calza ese perfil, con gusto les envío mi CV y conversamos; y si no, la propuesta de arriba sigue en pie igual.';

function buildDraft(ctx) {
  const {
    domain, score, grade, weakName, weakScore, moneyQuery, compliment, pdEmoji, pdLine,
  } = ctx;

  // Rapid Tires precedent (Aug 4 2026): telling an 87-94/100 site that it "todavía no
  // aparece como respuesta citable" is simply false, and reads as not having done the
  // homework. Above CREDENTIAL_SCORE the audit becomes the CREDENTIAL that earns the
  // read, and the letter pivots to what they actually lack. Requires a `pivot` in meta
  // so the reason for writing is specific to their business, never a template.
  if (score >= CREDENTIAL_SCORE && ctx.pivot) {
    return [
      `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
      '',
      `Primero, felicitaciones de verdad. Analicé ${domain} con mi propio motor de auditoría de visibilidad en IA (lo desarrollé yo, corre en https://aideazz.xyz/api) y sacó ${score}/100 (${grade}) — ${compliment}.`,
      '',
      `Se los digo porque casi nadie está en ese nivel, y porque no les voy a inventar un problema que no tienen.`,
      '',
      `Les escribo por otra cosa. ${ctx.pivot}`,
      '',
      OPERATOR_PARA,
      '',
      ctx.ask ||
        `Si les sirve, en 15 minutos les muestro cómo quedaría el Operator en su negocio — sin compromiso.`,
      // After the paid ask, never before it: the offer is the reason for writing.
      ...(ctx.openToRoles ? ['', OPEN_TO_ROLES_NOTE] : []),
      '',
      `PD: para llegar a 100/100 solo les falta afinar un par de detalles (${ctx.gapClause}). Se los dejo listos sin costo, trabajemos juntos o no. ${pdEmoji}`,
      '',
      `¡Que tengan un excelente día!`,
      `Saludos,`,
      `Elena Revicheva`,
      `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
    ].join('\n');
  }

  // Only quote a category number when the live audit produced one. With --score the
  // overall figure is a human assertion and the per-category breakdown does not exist;
  // printing the old default ("AEO 60/100") would invent a measurement.
  const weakBit = weakScore != null && weakName ? ` (${weakName} ${weakScore}/100)` : '';

  return [
    `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.`,
    '',
    `Primero, felicitaciones — ${compliment}. Les escribo porque analicé ${domain} con mi motor de visibilidad en IA y obtuvo ${score}/100: cuando un ${ctx.customer} le pregunta a ChatGPT o Perplexity "${moneyQuery}", los asistentes todavía no los pueden recomendar con claridad — ${ctx.gapClause}.`,
    '',
    `Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api ${pdEmoji}`,
    ...(ctx.openToRoles ? ['', OPEN_TO_ROLES_NOTE] : []),
    '',
    `PD: Además de visibilidad en IA, ${pdLine} Todo con demos en vivo en mi portafolio👆`,
    '',
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena✨🌍💫`,
  ].join('\n');
}

/**
 * Close the cycle on a deal: FU WhatsApp + FU email drafts, the `{slug}-fu` registry row
 * and both FU buttons at the top of its note.
 *
 * Reports what the installer actually did, not merely that it exited 0. On Abolu's first
 * staging the installer found the deal missing from HubSpot's search index — it is
 * eventually consistent and the deal was seconds old — so it patched nothing, exited 0,
 * and the run announced a follow-up that did not exist.
 */
function installFollowUp(dealId) {
  const fu = spawnSync(process.execPath, [path.join(__dirname, '_install-wa-fu-notes.cjs'), `--only=${dealId}`], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (fu.stderr) process.stderr.write(fu.stderr);
  if (fu.stdout) console.log(fu.stdout.trim());
  const retry = `run: node scripts/_install-wa-fu-notes.cjs --only=${dealId}`;
  if (fu.status !== 0) return `FAILED (exit ${fu.status}) — ${retry}`;
  let summary = {};
  try {
    summary = JSON.parse(fu.stdout.slice(fu.stdout.indexOf('{')));
  } catch {
    return `UNKNOWN — installer printed no summary; ${retry}`;
  }
  if (summary.installed === 1) return 'installed';
  return `NOT installed (${JSON.stringify(summary.errorList || summary.skipNoPhoneList || [])}) — ${retry}`;
}

/**
 * The reviewable pack for a staged prospect. Written by both paths: with HubSpot ids
 * after a live stage, and with the note HTML alone under --prepare-only.
 */
function buildPack(o) {
  return [
    `# [CLIENT-MANUAL] ${o.company} — HubSpot note pack`,
    '',
    `> Staged ${new Date().toISOString().slice(0, 10)}. Deal: \`${o.dealName}\`${o.ids ? ` (ID ${o.ids.dealId})` : ' — NOT created yet (--prepare-only)'}.`,
    `> WhatsApp draft: \`${o.draftPath}\` · Email draft: \`${o.emailDraftPath}\``,
    `> Email one-click: \`https://webhook.aideazz.xyz/cto/go/outreach-email/${o.slug}\` (from aipa@aideazz.xyz)`,
    ...(o.emailUnverified ? [`> ⚠️ Email \`${o.email}\` is UNVERIFIED fallback — confirm before send.`] : []),
    ...(o.emailOnlyOk ? ['> ⚠️ EMAIL-PRIMARY — no public WhatsApp found; use email one-click.'] : []),
    ...(o.auditNote ? [`> ⚠️ ${o.auditNote}`] : []),
    '',
    o.ids
      ? `Deal **${o.ids.dealId}** | Company **${o.ids.companyId}** | Contact **${o.ids.contactId}** | Note **${o.ids.noteId}** | Send task **${o.ids.taskId}**`
      : `Create the deal with: \`node scripts/stage-manual-prospect.cjs ${domain} --with-fu\``,
    '',
    '## Deal note (HTML as posted to HubSpot)',
    '',
    '```html',
    o.noteHtml,
    '```',
    '',
  ].join('\n');
}

const PROSPECT_META = {
  // Audited live Aug 6 2026: 82/100 B — aiAccess 95, geo 81, aeo 75, techSeo 79.
  // Crawlers reach them fine, so the letter must not call them invisible; the real gap
  // is that nothing on the page is shaped like an answer an engine can lift.
  'arden-price.com': {
    company: 'Arden & Price',
    city: 'Panama City',
    // The letter renders this as "cuando un ${customer} le pregunta…", so it has to be a
    // masculine noun phrase — "un empresa" is the kind of slip that ends a cold read.
    customer: 'gerente general que necesita contratar a un ejecutivo senior en Panamá',
    moneyQuery: '¿cuál es la mejor firma de executive search o headhunting en Panamá?',
    compliment:
      'su sitio ya está entre los mejor preparados que he medido en Panamá — 82/100, con acceso para crawlers de IA en 95/100 y sitio bilingüe EN/ES',
    gapClause:
      'no hay nada con forma de respuesta: cero titulares en forma de pregunta, sin marcado FAQPage/Service, sin llms.txt, y la meta-descripción del sitio dice literalmente "Executive Search Previous Next" (30 caracteres)',
    dealOffer: 'AEO/GEO fix · answer-readiness para búsquedas de headhunting',
    // Only used if a re-audit lands at 85+; keeps the letter honest either way.
    pivot:
      'En executive search la primera consulta ya no empieza en Google sino en ChatGPT, y quien contesta esa pregunta se queda con la búsqueda. Lo que hago es dejar el sitio en forma de respuesta citable para esas consultas, y encima montar el intake: un agente que califica al cliente que llega (posición, seniority, industria, urgencia, presupuesto) y al candidato espontáneo, y le pasa a su equipo el resumen listo en vez de un formulario más.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre su flujo actual — sin compromiso.',
    pdEmoji: '💼',
    pdLine:
      'dejo su sitio en forma de respuesta citable para los motores de IA, construyo agentes que califican clientes y candidatos 24/7 en EN/ES conectados a su CRM, automatización de intake y seguimiento, y rescate de sistemas de IA que fallan.',
    topFixes:
      '(1) meta-descripción real de 50–170 caracteres, (2) FAQ con las preguntas que sus clientes hacen de verdad + FAQPage/Service JSON-LD, (3) llms.txt y sameAs a LinkedIn',
    contactFirstName: 'Arden & Price',
    contactLastName: '(Contact)',
    // mailto: on the site — authoritative. The only published line, 507 300-2858, is a
    // Panama City landline (mobiles start with 6), so wa.me cannot open it: EMAIL-PRIMARY,
    // same call as Insignia Resources. The landline still lands on the CRM record to call.
    preferredEmail: 'info@arden-price.com',
    emailOnlyOk: true,
  },
  'dopanama.com': {
    company: 'DoPanama',
    city: 'Panama City',
    customer: 'expat que quiere mudarse o invertir en Panamá',
    moneyQuery: '¿cómo compro propiedad / me reubico en Panamá?',
    compliment: 'su sitio transmite confianza y experiencia real con expats (videos, podcast, equipo bilingüe)',
    gapClause: 'faltan respuestas en formato FAQ que los motores puedan citar directamente',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads y agendan consultas de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats (residencia, costo de vida, zonas), (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'DoPanama',
    contactLastName: '(WhatsApp contact)',
  },
  'panamaaesthetics.com': {
    company: 'Panama Aesthetics',
    city: 'Panama City',
    customer: 'paciente internacional que busca cirugía plástica o estética en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de cirugía plástica en Panamá?',
    compliment: 'su sitio transmite profesionalismo médico real — contenido completo, datos estructurados y abierto a todos los motores de IA',
    gapClause: 'la página tarda más de 11 segundos en responder (los motores de IA cortan la lectura) y falta una sección de preguntas y respuestas que puedan citar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de pacientes (precios, recuperación, paquetes internacionales) + FAQPage JSON-LD, (2) cache/CDN del HTML — 11s → <1.5s, (3) llms.txt',
    contactFirstName: 'Panama Aesthetics',
    contactLastName: '(WhatsApp contact)',
  },
  'ycyachts.com': {
    company: 'YC Panama Yachts',
    city: 'Panama City',
    customer: 'turista internacional que quiere alquilar un yate en Panamá o San Blas',
    moneyQuery: '¿cuál es el mejor charter de yates en Panamá?',
    compliment: 'su sitio está técnicamente impecable — 100/100 en fundación técnica, acceso de IA y datos estructurados, algo que casi nadie logra',
    gapClause: 'falta una sección de preguntas y respuestas que los motores puedan citar directamente',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de charters 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) sección FAQ con las preguntas reales de sus clientes (precios, rutas San Blas, qué incluye el charter) como H2/H3, (2) FAQPage JSON-LD, (3) dateModified/fechas visibles en contenido actualizado',
    contactFirstName: 'YC Panama Yachts',
    contactLastName: '(WhatsApp contact)',
  },
  'flamencomarina.com': {
    company: 'Fuerte Amador Resort & Marina',
    city: 'Panama City',
    customer: 'turista o visitante que busca marina, charter o resort en Amador / Isla Flamenco',
    moneyQuery: '¿cuál es la mejor marina o resort en Amador Panamá?',
    compliment: 'tienen un complejo real y completo en Isla Flamenco — marina, resort, charters y restaurantes en la Calzada de Amador',
    gapClause: 'casi no hay datos estructurados que ChatGPT pueda citar (sin Organization/FAQ JSON-LD) y el título/H1 no describen claramente la oferta',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de marina, charters y eventos 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Organization + LocalBusiness/Marina JSON-LD con name/url/logo/sameAs, (2) un solo H1 + title 15–70 chars que nombren la oferta (marina/resort Amador), (3) FAQ con preguntas reales de visitantes + FAQPage',
    contactFirstName: 'Fuerte Amador',
    contactLastName: '(WhatsApp contact)',
  },
  'centromarino.com': {
    company: 'Centro Marino Panamá',
    city: 'Panama City',
    customer: 'dueño de bote o comprador que busca motores Mercury, botes o servicio náutico en Panamá',
    moneyQuery: '¿dónde compro motores Mercury o servicio de botes en Panamá?',
    compliment: 'más de 35 años en el sector náutico con varias sucursales (Amador/Flamenco Marina, Ocean Reef, Club de Yates) y representación Mercury',
    gapClause: 'falta un H1 claro, poco contenido profundo y no hay FAQ en formato de preguntas que los motores puedan citar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican consultas de ventas/taller 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones e intake de servicio, video con IA para marketing de botes y motores, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un solo H1 + copy sustantivo (qué venden, a quién, prueba), (2) FAQ con preguntas reales de dueños de botes + FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Centro Marino',
    contactLastName: '(WhatsApp contact)',
  },
  'relofirm.com': {
    company: 'ReloFirm',
    city: 'Panama City',
    customer: 'expat o ejecutivo que busca reubicación legal y fiscal en Panamá',
    moneyQuery: '¿cómo me reubico legalmente en Panamá?',
    compliment: 'su práctica combina derecho y reubicación con un tono profesional internacional',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar cuando alguien busca reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats, (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'ReloFirm',
    contactLastName: '(WhatsApp contact)',
  },
  'panamadentalclinic.com': {
    company: 'Panama Dental Clinic',
    city: 'David',
    customer: 'paciente internacional que busca odontología o dental tourism en Panamá',
    moneyQuery: '¿cuál es la mejor clínica dental en Panamá?',
    compliment: 'su clínica apunta a turismo dental con oferta clara para pacientes internacionales',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pide la mejor clínica dental en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes internacionales + FAQPage JSON-LD, (2) Organization/LocalBusiness schema, (3) llms.txt',
    contactFirstName: 'Panama Dental Clinic',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766111939',
    preferredEmail: 'ced.sanantoniolm@gmail.com',
  },
  'kraemerlaw.com': {
    company: 'Kraemer Law',
    city: 'Panama City',
    customer: 'expat o inversionista que busca inmigración o residencia en Panamá',
    moneyQuery: '¿cuál es el mejor abogado de inmigración en Panamá?',
    compliment: 'su firma transmite especialización legal seria en inmigración y asuntos corporativos',
    gapClause: 'faltan FAQs citables sobre visas/residencia que los motores de IA puedan usar como respuesta',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia, (2) FAQPage/Attorney JSON-LD, (3) llms.txt',
    contactFirstName: 'Kraemer Law',
    contactLastName: '(WhatsApp contact)',
  },
  'ampatours.com': {
    company: 'Ampa Tours',
    city: 'Panama City',
    customer: 'turista que busca charters, pesca o tours en Panamá',
    moneyQuery: '¿cuál es el mejor tour o charter de pesca en Panamá?',
    compliment: 'tienen experiencia real en charters y pesca deportiva en Panamá',
    gapClause: 'faltan respuestas estructuradas que ChatGPT pueda citar cuando alguien busca tours o pesca',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de tours/charters 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Ampa Tours',
    contactLastName: '(WhatsApp contact)',
  },
  'tranquilobay.com': {
    company: 'Tranquilo Bay',
    city: 'Bocas del Toro',
    customer: 'viajero que busca eco lodge o hotel boutique en Bocas del Toro',
    moneyQuery: '¿cuál es el mejor eco lodge en Bocas del Toro?',
    compliment: 'su lodge tiene una propuesta de eco-turismo auténtica en Bocas',
    gapClause: 'aún no aparecen como respuesta citable frente a competidores cuando alguien pregunta por eco lodges',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de procesos, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ huéspedes reales, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Tranquilo Bay',
    contactLastName: '(WhatsApp contact)',
  },
  'americantradehotel.com': {
    company: 'American Trade Hotel',
    city: 'Panama City',
    customer: 'pareja o empresa que busca hotel boutique, bodas o eventos en Casco Viejo',
    moneyQuery: '¿cuál es el mejor hotel boutique en Casco Viejo Panamá?',
    compliment: 'ocupan un edificio histórico en Casco Viejo con marca boutique fuerte',
    gapClause: 'faltan FAQs citables sobre bodas/eventos/estadía que los motores puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan habitaciones/eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas/eventos/estadía, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'American Trade Hotel',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'info@americantradehotel.com',
    preferredPhone: '5072112000',
  },
  'sanblasdreams.com': {
    company: 'San Blas Dreams',
    city: 'Panama City',
    customer: 'turista que busca tours a San Blas / Guna Yala',
    moneyQuery: '¿cuál es el mejor tour a San Blas desde Panamá?',
    compliment: 'son un operador ATP con foco real en San Blas',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT cite cuando alguien busca tours a San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/itinerarios/qué incluye, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Dreams',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764735905',
    preferredEmail: 'info@sanblasdreams.com',
  },
  'pesquerosport.com': {
    company: 'Pesqueros Sport',
    city: 'Panama City',
    customer: 'pescador deportivo que busca equipo, charters o servicio náutico en Panamá',
    moneyQuery: '¿dónde compro equipo de pesca deportiva en Panamá?',
    compliment: 'tienen presencia real en el mundo de la pesca deportiva en Panamá',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien busca equipo o pesca deportiva',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican consultas de ventas 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ productos/servicios, (2) LocalBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Pesqueros Sport',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764310642',
  },
  'flamencodrystackpanama.com': {
    company: 'Flamenco Drystack Panama',
    city: 'Panama City',
    customer: 'dueño de bote que busca dry stack o almacenaje náutico en Amador/Flamenco',
    moneyQuery: '¿dónde guardo mi bote en dry stack en Panamá?',
    compliment: 'ofrecen dry stack real en la zona de Flamenco — un servicio escaso y valioso',
    gapClause: 'faltan datos estructurados y FAQs que ChatGPT pueda citar sobre dry stack en Panamá',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de dry stack 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Organization/LocalBusiness JSON-LD, (2) FAQ precios/capacidad/acceso, (3) llms.txt',
    contactFirstName: 'Flamenco Drystack',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'info@flamencodrystack.net',
    preferredPhone: '50768365198',
  },
  'prestigestorage.com.pa': {
    company: 'Prestige Storage',
    city: 'Panama City',
    customer: 'persona o empresa que busca self-storage o bodegas en Panamá',
    moneyQuery: '¿cuál es el mejor self storage en Panamá?',
    compliment: 'tienen una operación de storage profesional con sitio claro y contactable',
    gapClause: 'faltan FAQs citables sobre tamaños, precios y seguridad que los motores puedan usar',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan cotizaciones 24/7 (EN/ES, conectados a su CRM), automatización de intake de leads, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tamaños/precios/seguridad, (2) LocalBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Prestige Storage',
    contactLastName: '(WhatsApp contact)',
  },
  'panamafertility.com': {
    company: 'Panama Fertility',
    city: 'Panama City',
    customer: 'pareja internacional que busca tratamiento de fertilidad o IVF en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de fertilidad en Panamá?',
    compliment: 'su sitio web está excelentemente preparado para la era de la IA (datos estructurados 100/100, contenido listo para respuestas 94/100)',
    gapClause: 'su archivo robots.txt hoy les dice a GPTBot (ChatGPT), Claude y Gemini que NO entren — aunque su contenido sea perfecto',
    pdEmoji: '👶',
    pdLine: 'construyo agentes de WhatsApp que atienden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Quitar Disallow para GPTBot/ClaudeBot/Google-Extended/CCBot en robots.txt, (2) un solo H1 claro, (3) pulido menor de SEO técnico',
    contactFirstName: 'Panama Fertility',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760709716',
    preferredEmail: 'info@panamafertility.com',
  },
  'ivi-fertility.com': {
    company: 'IVI Panama',
    city: 'Panama City',
    customer: 'pareja internacional que busca IVF o fertilidad en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de IVF en Panamá?',
    compliment: 'IVI es una marca global de fertilidad con presencia real en Panamá y pacientes de 80+ nacionalidades',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pregunta por IVF o fertilidad en Panamá',
    pdEmoji: '👶',
    pdLine: 'construyo agentes de WhatsApp que atienden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes internacionales + FAQPage JSON-LD, (2) Organization/MedicalBusiness schema, (3) llms.txt',
    contactFirstName: 'IVI Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766316301',
    preferredEmail: 'ivipanama@ivirma.com',
  },
  'relocationpanama.com': {
    company: 'Relocation Panama',
    city: 'Panama City',
    customer: 'expat que quiere reubicarse en Panamá (Pacific/Coronado)',
    moneyQuery: '¿cómo me reubico en Panamá o en la costa del Pacífico?',
    compliment: 'su servicio boutique de reubicación transmite experiencia real con expats en Panamá',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats, (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'Relocation Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762339432',
    preferredEmail: 'info@relocationpanama.com',
  },
  'panamaexpatservice.com': {
    company: 'Panama Expat Service',
    city: 'Panama City',
    customer: 'expat que busca tours de reubicación, inmigración o mudanza con mascotas a Panamá',
    moneyQuery: '¿cómo me mudo a Panamá con mi familia o mascota?',
    compliment: 'ofrecen un servicio integral de reubicación — tours, inmigración, bienes raíces y reubicación de mascotas',
    gapClause: 'faltan FAQs citables que los motores de IA puedan usar cuando alguien busca reubicarse a Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ expats/mascotas/residencia, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Panama Expat Service',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762962070',
    preferredEmail: 'info@panamaexpatservice.com',
  },
  'igopanama.com': {
    company: 'International Relocation Partner',
    city: 'Panama City',
    customer: 'expat o ejecutivo que busca reubicación internacional con oficinas en PTY, Miami y Madrid',
    moneyQuery: '¿cómo me reubico internacionalmente a Panamá?',
    compliment: 'tienen una red multi-oficina real (Panamá, Miami, Madrid, Costa Rica) con enfoque internacional',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ reubicación/residencia, (2) FAQPage/Organization JSON-LD, (3) llms.txt',
    contactFirstName: 'International Relocation Partner',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762418879',
    preferredEmail: 'info@igopanama.com',
  },
  'immigrationvisa247.com': {
    company: 'Immigration Visa 24/7',
    city: 'Panama City',
    customer: 'expat que busca visa, residencia pensionado o friendly nations en Panamá',
    moneyQuery: '¿cómo obtengo residencia o visa en Panamá?',
    compliment: 'su sitio multilingüe (EN/NL/FR/ES) transmite especialización en visas y residencia panameña',
    gapClause: 'faltan FAQs citables sobre pensionado, friendly nations e inversor que los motores puedan responder',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia por programa, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Immigration Visa 24/7',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769423311',
    preferredEmail: 'lawyers@immigrationvisa247.com',
  },
  'lacgrp.com': {
    company: 'LAC Legal',
    city: 'Panama City',
    customer: 'expat o empresa que busca residencia, visas o permisos de trabajo en Panamá',
    moneyQuery: '¿cuál es el mejor abogado de inmigración en Panamá?',
    compliment: 'LAC Legal combina derecho de inmigración y corporativo con servicio bilingüe EN/ES',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre residencia y visas',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia/trabajo, (2) FAQPage/Attorney JSON-LD, (3) llms.txt',
    contactFirstName: 'LAC Legal',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '5073955607',
    preferredEmail: 'lac@lacgrp.com',
  },
  'ndm.com.pa': {
    company: 'NDM Law Firm',
    city: 'Panama City',
    customer: 'expat que busca especialistas en residencia panameña',
    moneyQuery: '¿cómo obtengo residencia permanente en Panamá?',
    compliment: 'NDM se posiciona como especialistas en residencia con práctica legal establecida',
    gapClause: 'faltan FAQs citables sobre residencia que los motores de IA puedan usar como respuesta',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ residencia/visas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'NDM Law Firm',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '5078302656',
    preferredEmail: 'info@ndm.com.pa',
  },
  'panamalegalcenter.com': {
    company: 'Panama Legal Center',
    city: 'Panama City',
    customer: 'expat que busca friendly nations, pensionado o residencia en Panamá',
    moneyQuery: '¿cómo aplico a friendly nations o pensionado en Panamá?',
    compliment: '15 años de experiencia en residencia panameña — friendly nations y pensionado son su foco',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca residencia en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ friendly nations/pensionado, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Panama Legal Center',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764040388',
    preferredEmail: 'customer@panamalegalcenter.com',
  },
  'delvallepanama.com': {
    company: 'Delvalle & Delvalle',
    city: 'Panama City',
    customer: 'expat o inversionista que busca servicios de inmigración en Panamá',
    moneyQuery: '¿cuál es el mejor bufete de inmigración en Panamá?',
    compliment: 'Delvalle & Delvalle es una firma reconocida en servicios de inmigración panameña',
    gapClause: 'faltan FAQs citables sobre visas e inmigración que los motores puedan responder',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ inmigración/residencia, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Delvalle & Delvalle',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50761093066',
    preferredEmail: 'info@delvallepanama.com',
  },
  'gomitom.com': {
    company: 'Gomitom',
    city: 'Panama City',
    customer: 'expat que busca inmigración o bienes raíces en Panamá',
    moneyQuery: '¿cómo obtengo residencia y compro propiedad en Panamá?',
    compliment: 'Gomitom combina derecho de inmigración y bienes raíces — un combo valioso para expats',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre inmigración y propiedad',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ inmigración + bienes raíces, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gomitom',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769800688',
    preferredEmail: 'info@gomitom.com',
  },
  'charterinsanblas.com': {
    company: 'Charter in San Blas',
    city: 'Panama City',
    customer: 'turista internacional que busca charter todo incluido en San Blas',
    moneyQuery: '¿cuál es el mejor charter en San Blas Panamá?',
    compliment: 'ofrecen charters todo incluido en San Blas con reputación de 5 estrellas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca charters en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de charters 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'Charter in San Blas',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762950550',
    preferredEmail: 'info@charterinsanblas.com',
  },
  'sanblastour.com': {
    company: 'San Blas Tour',
    city: 'Panama City',
    customer: 'turista que busca tours en velero o catamarán a San Blas',
    moneyQuery: '¿cuál es el mejor tour a San Blas en velero?',
    compliment: 'tienen flota real de veleros y catamaranes para San Blas',
    gapClause: 'faltan FAQs citables sobre itinerarios y precios que los motores puedan usar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/itinerarios/flota, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Tour',
    contactLastName: '(Email contact)',
    preferredEmail: 'contact@sanblastour.com',
    emailOnlyOk: true, // site publishes email only — no public WA
  },
  'sanblasonsailboats.com': {
    company: 'San Blas on Sailboats',
    city: 'Panama City',
    customer: 'turista que busca red de veleros verificados para San Blas',
    moneyQuery: '¿dónde reservo un velero verificado para San Blas?',
    compliment: 'operan una red de veleros verificados para San Blas — confianza real para turistas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre veleros en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ flota/precios/rutas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas on Sailboats',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769323919',
    preferredEmail: 'info@sanblasonsailboats.com',
  },
  'wesailsanblas.com': {
    company: 'We Sail San Blas',
    city: 'Panama City',
    customer: 'turista que busca catamarán todo incluido en San Blas',
    moneyQuery: '¿cuál es el mejor catamarán todo incluido en San Blas?',
    compliment: 'ofrecen catamaranes con todas las comidas incluidas — propuesta clara para San Blas',
    gapClause: 'faltan FAQs citables que los motores de IA puedan usar sobre catamaranes en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/comidas/itinerario, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'We Sail San Blas',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50763693628',
    preferredEmail: 'wesailsanblas@gmail.com',
  },
  'sailboattrips.com': {
    company: 'SailBoat Trips',
    city: 'Panama City',
    customer: 'turista que busca charter con tripulación en Panamá o San Blas',
    moneyQuery: '¿dónde alquilo un velero con tripulación en Panamá?',
    compliment: 'ofrecen charters con tripulación — experiencia real en aguas panameñas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre charters con tripulación',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/tripulación, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'SailBoat Trips',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764686603',
    preferredEmail: 'info@sailboattrips.com',
  },
  'sanblassailing.com': {
    company: 'San Blas Sailing',
    city: 'Panama City',
    customer: 'turista que busca yate con tripulación en San Blas',
    moneyQuery: '¿cuál es el mejor yate con tripulación en San Blas?',
    compliment: 'especialistas en yates con tripulación para San Blas — nicho premium',
    gapClause: 'faltan FAQs citables sobre yates y precios que los motores puedan responder',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ yates/precios/rutas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Sailing',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50767806959',
    preferredEmail: 'panama@sanblassailing.com',
  },
  'sailingcharterpanama.com': {
    company: 'Sailing Charter Panama',
    city: 'Panama City',
    customer: 'turista que busca catamarán todo incluido en Panamá',
    moneyQuery: '¿cuál es el mejor charter de catamarán en Panamá?',
    compliment: 'ofrecen charters todo incluido en catamarán — propuesta premium para turistas internacionales',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre charters en Panamá',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Sailing Charter Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760761493',
    preferredEmail: 'sailingcharterpanama@gmail.com',
  },
  'casacayuco.com': {
    company: 'Casa Cayuco',
    city: 'Bastimentos',
    customer: 'viajero que busca eco-lodge o aventura en Bastimentos/Bocas',
    moneyQuery: '¿cuál es el mejor eco lodge en Bastimentos Bocas del Toro?',
    compliment: 'Casa Cayuco es un eco-lodge de aventura auténtico en Bastimentos',
    gapClause: 'faltan FAQs citables sobre alojamiento y actividades que los motores puedan usar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ huéspedes/actividades/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Casa Cayuco',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760887663',
    preferredEmail: 'info@casacayuco.com',
  },
  'eclypsedemar.com': {
    company: 'Eclypse de Mar',
    city: 'Bocas del Toro',
    customer: 'viajero que busca bungalows sobre el agua o gastronomía en Bocas',
    moneyQuery: '¿dónde me quedo en bungalows sobre el agua en Bocas del Toro?',
    compliment: 'Eclypse de Mar combina bungalows sobre el agua con fine dining — experiencia única en Bocas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre alojamiento premium en Bocas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/restaurante/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Eclypse de Mar',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769345141',
    preferredEmail: 'info@eclypsedemar.com',
  },
  'prpevents.com': {
    company: 'PRP Events',
    city: 'Panama City',
    customer: 'pareja internacional que planea boda destino en Panamá',
    moneyQuery: '¿cuál es el mejor wedding planner de bodas destino en Panamá?',
    compliment: 'PRP Events se especializa en bodas destino — nicho de alto ticket internacional',
    gapClause: 'faltan FAQs citables sobre bodas destino que los motores de IA puedan usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan consultas de bodas 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas destino/paquetes/precios, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'PRP Events',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766907472',
    preferredEmail: 'ventas@prpevents.com',
  },
  'destinationdreamweddings.com': {
    company: 'Destination Dream Weddings',
    city: 'Panama City',
    customer: 'pareja que busca boda destino completa en Panamá',
    moneyQuery: '¿cómo planifico una boda destino en Panamá?',
    compliment: 'ofrecen servicio completo de bodas destino en Panamá — propuesta clara para parejas internacionales',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre bodas en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan consultas de bodas 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas/paquetes/venues, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Destination Dream Weddings',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'wendy@destinationdreamweddings.com',
    preferredPhone: '12044064876',
  },
  'panamasonrie.com': {
    company: 'Panamá Sonríe',
    city: 'Panama City',
    customer: 'paciente que busca diseño de sonrisa o prótesis dental en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de diseño de sonrisa en Panamá?',
    compliment: 'Panamá Sonríe ofrece diseño de sonrisa y prótesis con presencia en Via Israel y Albrook',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pregunta por clínicas dentales en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas dentales 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes/precios/implantes, (2) FAQPage/Dentist JSON-LD, (3) llms.txt',
    contactFirstName: 'Panamá Sonríe',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50761405700',
    preferredEmail: 'info@panamasonrie.com',
  },
  'arango-orillac.com': {
    company: 'Clínica Arango Orillac',
    city: 'Panama City',
    customer: 'paciente internacional que busca odontología de confianza en Panamá',
    moneyQuery: '¿cuál es la mejor clínica dental bilingüe en Panamá?',
    compliment: 'desde 1935 con más de 50 profesionales e inglés garantizado — credibilidad real',
    gapClause: 'faltan FAQs citables sobre odontología internacional que ChatGPT pueda usar como respuesta',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes intl + inglés, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Clínica Arango Orillac',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769973733',
    // Site is WA-only; directory listings show info@ — flag UNVERIFIED in note when used
    preferredEmail: 'info@arango-orillac.com',
  },
  'centroodontologicopaitilla.com': {
    company: 'Centro Odontológico Paitilla',
    city: 'Panama City',
    customer: 'paciente que busca odontología en Paitilla / turismo dental',
    moneyQuery: '¿cuál es la mejor clínica dental en Paitilla Panamá?',
    compliment: 'desde 1990 en el Centro Médico Paitilla con alto volumen de reseñas',
    gapClause: 'aún no aparecen como respuesta citable frente a clínicas competidoras en búsquedas de IA',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan citas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ citas/especialidades, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Centro Odontológico Paitilla',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762334051',
    preferredEmail: 'contacto@centroodontologicopaitilla.com',
  },
  'theskinclinicpanama.com': {
    company: 'The Skin Clinic Panama',
    city: 'Panama City',
    customer: 'paciente que busca dermatología o estética médica en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de dermatología en Panamá?',
    compliment: 'Dr. Drohan (Tulane) en Hospital Pacífica Salud — perfil médico internacional fuerte',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre dermatología en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas estéticas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing de tratamientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tratamientos/precios, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Skin Clinic',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764509248',
    preferredEmail: 'citas@theskinclinicpanama.com',
  },
  'dermomedica.com.pa': {
    company: 'DermoMédica',
    city: 'Panama City',
    customer: 'paciente que busca dermatología clínica o cosmiatría en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de dermatología y láser en Panamá?',
    compliment: 'ofrecen dermatología clínica, cosmiatría y láser con sitio en inglés',
    gapClause: 'faltan FAQs citables sobre tratamientos que los motores de IA puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tratamientos/láser, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'DermoMédica',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762372819',
    preferredEmail: 'info@dermomedica.com.pa',
  },
  'grupodentalnacional.com': {
    company: 'Grupo Dental Nacional',
    city: 'Panama City',
    customer: 'paciente que busca odontología en Centro Médico Nacional o La Chorrera',
    moneyQuery: '¿cuál es la mejor clínica dental Almanza Carrizo en Panamá?',
    compliment: 'más de 25 años con sedes en Centro Médico Nacional y La Chorrera',
    gapClause: 'faltan respuestas citables cuando alguien busca clínicas dentales multi-sede en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan citas multi-sede 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ sedes/especialidades, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Grupo Dental Nacional',
    contactLastName: '(WhatsApp contact)',
    // Contacto page: WhatsApp mobiles (507) 6670-7039 / 6673-6040 — no public mailto → info@ UNVERIFIED
    preferredPhone: '50766707039',
  },
  'giannadentist.com': {
    company: 'Gianna Dentist MaDenta',
    city: 'Panama City',
    customer: 'paciente internacional que busca odontología cosmética o implantes en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de implantes dentales en Panamá para extranjeros?',
    compliment: 'enfocados en cosmética e implantes para pacientes internacionales y expats',
    gapClause: 'faltan FAQs citables sobre eval online / turismo dental que ChatGPT pueda usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan evaluaciones 24/7 (EN/ES, conectados a su CRM), automatización de intake intl, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ implantes/turismo dental, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'MaDenta',
    contactLastName: '(WhatsApp contact)',
    // madentaclinic.com (same brand): wa.me/50762709109 + recepcion@
    preferredPhone: '50762709109',
    preferredEmail: 'recepcion@madentaclinic.com',
  },
  'puntapacifica.com': {
    company: 'Hospital Punta Pacífica',
    city: 'Panama City',
    customer: 'paciente internacional que busca hospital afiliado a Johns Hopkins en Panamá',
    moneyQuery: '¿cuál es el mejor hospital de turismo médico en Panamá?',
    compliment: 'Pacífica Salud / Punta Pacífica es afiliado a Johns Hopkins Medicine International — marca clínica fuerte',
    gapClause: 'faltan FAQs citables de turismo médico que ChatGPT use frente a otros hospitales en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan pacientes intl 24/7 (EN/ES, conectados a su CRM), automatización de intake médico, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ turismo médico/especialidades, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Mike',
    contactLastName: 'Kelly (Medical Tourism)',
    // pacificasalud.com medical-tourism page: Mike Kelly +507-6614-1448 / turismomedico@pacificasalud.com
    preferredPhone: '50766141448',
    preferredEmail: 'turismomedico@pacificasalud.com',
  },
  'hospitalsanfernando.com': {
    company: 'Hospital San Fernando',
    city: 'Panama City',
    customer: 'paciente internacional que busca hospital JCI o Global Patient Care en Panamá',
    moneyQuery: '¿cuál es el mejor hospital privado JCI en Panamá para pacientes internacionales?',
    compliment: 'Clínica Hospital San Fernando fue el primer hospital privado de Panamá y opera Global Patient Care 24/7',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre atención a pacientes internacionales en San Fernando',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan pacientes intl 24/7 (EN/ES, conectados a su CRM), automatización de intake médico, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ Global Patient Care/especialidades, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Global Patient Care',
    contactLastName: '(WhatsApp contact)',
    // Site: global@hospitalsanfernando.com / 6639-3783 (Global Patient Care)
    preferredPhone: '50766393783',
    preferredEmail: 'global@hospitalsanfernando.com',
  },
  'fincalerida.com': {
    company: 'Finca Lérida',
    city: 'Boquete',
    customer: 'viajero que busca hotel boutique de café o coffee estate en Boquete',
    moneyQuery: '¿cuál es el mejor coffee estate hotel en Boquete Panamá?',
    compliment: 'Finca Lérida es un coffee estate histórico en Boquete (Cayuga Collection) — propuesta premium clara',
    gapClause: 'faltan FAQs citables sobre estadía/café/tours que ChatGPT pueda responder frente a otros lodges de Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/café/tours, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Finca Lérida',
    contactLastName: '(WhatsApp contact)',
    // hotelfincalerida.com/contact: WhatsApp rooms +507 6509-5139; email on domain
    preferredPhone: '50765095139',
    preferredEmail: 'info@fincalerida.com',
  },
  'losquetzales.com': {
    company: 'Los Quetzales EcoLodge',
    city: 'Cerro Punta',
    customer: 'viajero que busca ecolodge, birding o spa en las tierras altas de Chiriquí',
    moneyQuery: '¿cuál es el mejor ecolodge en Cerro Punta Panamá?',
    compliment: 'Los Quetzales es un ecolodge icónico en Cerro Punta con birding y spa en cloud forest',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre ecolodges en Cerro Punta / Guadalupe',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/birding/spa, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Los Quetzales',
    contactLastName: '(WhatsApp contact)',
    // Footer: +507 6671-2131 / stay@losquetzales.com
    preferredPhone: '50766712131',
    preferredEmail: 'stay@losquetzales.com',
  },
  'havenboquete.com': {
    company: 'The Haven Wellness Resort',
    city: 'Boquete',
    customer: 'viajero que busca spa, yoga o wellness retreat en Boquete',
    moneyQuery: '¿cuál es el mejor wellness resort en Boquete Panamá?',
    compliment: 'The Haven combina hotel, spa y estudio de yoga en Boquete — propuesta wellness clara',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre wellness en Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/spa 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ spa/yoga/estadía, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Haven',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764915578',
    preferredEmail: 'info@havenboquete.com',
  },
  'valleescondidoboquete.com': {
    company: 'Valle Escondido Resort',
    city: 'Boquete',
    customer: 'pareja o grupo que busca bodas o eventos en Boquete',
    moneyQuery: '¿dónde hacer una boda o evento en Boquete Panamá?',
    compliment: 'Valle Escondido es un resort de eventos y bodas en Boquete con oferta clara',
    gapClause: 'faltan FAQs citables sobre eventos/bodas que los motores de IA puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ eventos/bodas/paquetes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Valle Escondido',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50765369875',
    preferredEmail: 'eventos@valleescondidoboquete.com',
  },
  'isp.edu.pa': {
    company: 'International School of Panama',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional IB en Panamá',
    moneyQuery: '¿cuál es el mejor colegio internacional en Panamá?',
    compliment: 'ISP es NEASC/IB con más de 40 años — referencia fuerte para familias internacionales',
    gapClause: 'faltan FAQs citables de admisiones que ChatGPT use cuando un expat busca colegio en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican leads de admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake de admisiones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/IB/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'ISP Admissions',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769821470',
    preferredEmail: 'admissions@isp.edu.pa',
  },
  'thecascoschool.com': {
    company: 'The Casco School',
    city: 'Panama City',
    customer: 'familia que busca colegio bilingüe británico en Panamá',
    moneyQuery: '¿cuál es el mejor colegio británico bilingüe en Panamá?',
    compliment: 'colegio británico bilingüe con sedes en Albrook y Costa del Este',
    gapClause: 'faltan respuestas citables de admisiones que los motores de IA puedan usar',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/curriculum, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Casco School',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766442413',
    preferredEmail: 'admissions@thecascoschool.com',
  },
  'bostonschool.edu.pa': {
    company: 'Boston School International',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional en Costa del Este',
    moneyQuery: '¿cuál es el mejor colegio internacional en Costa del Este Panamá?',
    compliment: 'colegio internacional en Costa del Este con flujo claro de tours y admisiones',
    gapClause: 'faltan FAQs citables de admisiones que ChatGPT use cuando un expat busca colegio en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican leads de admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake de admisiones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/curriculum/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Boston School Admissions',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764548560',
    preferredEmail: 'admissions@bostonschool.edu.pa',
  },
  'studiohavenboquete.com': {
    company: 'STUDIO at The Haven',
    city: 'Boquete',
    customer: 'viajero o residente que busca yoga o wellness en Boquete',
    moneyQuery: '¿dónde hacer yoga o wellness en Boquete Panamá?',
    compliment: 'estudio de yoga/ejercicio ligado a The Haven en Boquete — propuesta wellness clara',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre yoga/wellness en Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan clases/reservas 24/7 (EN/ES, conectados a su CRM), automatización de booking, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ clases/horarios/precios, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'STUDIO Haven',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764260843',
    preferredEmail: 'studiohavenboquete@gmail.com',
  },
  'gamboaresort.com': {
    company: 'Gamboa Rainforest Reserve',
    city: 'Gamboa',
    customer: 'grupo o viajero internacional que busca venue o eco-resort cerca del Canal',
    moneyQuery: '¿cuál es el mejor resort o venue de eventos en Gamboa Panamá?',
    compliment: 'eco-resort/nature venue con oferta internacional de grupos y eventos',
    gapClause: 'faltan FAQs citables sobre estadía y eventos que los motores de IA puedan responder',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ reservas/eventos/paquetes, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gamboa Rainforest',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766723083',
    preferredEmail: 'reservations@gamboaresort.com',
  },
  'redfrogbeach.com': {
    company: 'Red Frog Beach Island Resort',
    city: 'Bocas del Toro',
    customer: 'viajero o comprador que busca resort o propiedad en Bocas',
    moneyQuery: '¿cuál es el mejor resort en Bocas del Toro?',
    compliment: 'combinan resort e inmobiliaria en Bocas — ticket alto e internacional',
    gapClause: 'faltan FAQs citables sobre estadía y propiedades que ChatGPT pueda citar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican reservas/leads RE 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ resort/RE/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Red Frog Beach',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50763476597',
    preferredEmail: 'reservations@redfrogbeach.com',
  },
  'islapalenque.com': {
    company: 'Isla Palenque',
    city: 'Bocas del Toro',
    customer: 'viajero de lujo que busca resort en isla privada en Bocas',
    moneyQuery: '¿cuál es el mejor resort de isla privada en Bocas del Toro?',
    compliment: 'resort de lujo en isla privada — posicionamiento premium internacional',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre resorts premium en Bocas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de lujo 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/paquetes, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Isla Palenque',
    contactLastName: '(WhatsApp contact)',
    // Site: island direct mobile +(507) 6617-3771; reservations@islapalenque.com
    preferredPhone: '50766173771',
    preferredEmail: 'reservations@islapalenque.com',
  },
  'cancundentalspecialists.com': {
    company: 'Cancun Dental Specialists',
    city: 'Cancún',
    customer: 'paciente de EE.UU./Canadá que busca odontología en Cancún',
    moneyQuery: '¿cuál es la mejor clínica dental en Cancún para pacientes de EE.UU.?',
    compliment: 'Hotel Zone con dentistas en inglés y alto volumen de pacientes norteamericanos',
    gapClause: 'faltan FAQs citables de turismo dental que ChatGPT use frente a competidores de Cancún',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), international patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Cancun Dental Specialists',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '529983130107',
    preferredEmail: 'contact@cancundentalspecialists.com',
  },
  'smiletijuana.com': {
    company: 'Smile Tijuana',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología fronteriza bilingüe',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana para pacientes de San Diego?',
    compliment: 'clínica fronteriza bilingüe con flujo claro para pacientes de EE.UU.',
    gapClause: 'faltan respuestas citables en IA sobre odontología fronteriza en Tijuana',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ border patients/prices, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Smile Tijuana',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '526642930717',
    preferredEmail: 'info@smiletijuanadentist.com',
  },
  'clinicabiblica.com': {
    company: 'Hospital Clinica Biblica',
    city: 'San José',
    customer: 'paciente internacional que busca hospital privado en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital privado en Costa Rica para pacientes internacionales?',
    compliment: 'Clínica Bíblica is Costa Rica’s longest-running private hospital with an English-facing intl patient path',
    gapClause: 'AI answers still lack citable FAQs on intl patient intake vs other CR hospitals',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and coordinate intl patients 24/7 (EN/ES, CRM-wired), medical intake automation, AI video for hospital marketing, and AI-system rescue.',
    topFixes: '(1) FAQ intl patients/specialties, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital Clinica Biblica',
    contactLastName: '(WhatsApp contact)',
    // Site click-to-chat / wa.me 50685957000 — no public mailto → info@ UNVERIFIED
    preferredPhone: '50685957000',
  },
  'metropolitanocr.com': {
    company: 'Hospital Metropolitano',
    city: 'San José',
    customer: 'paciente o turista que busca hospital multi-sede en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital Metropolitano en Costa Rica?',
    compliment: 'Hospital Metropolitano has multi-site coverage including tourism corridors (Guanacaste / Quepos)',
    gapClause: 'missing citable AI answers for multi-site hospital choice and intl patient flow in Costa Rica',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and coordinate patients 24/7 (EN/ES, CRM-wired), intake automation across sites, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ sedes/especialidades/turismo médico, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital Metropolitano',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50664343139',
    preferredEmail: 'info@metropolitanocr.com',
  },
  'yachtchartercr.com': {
    company: 'Costa Rica Yacht Charter Brokers',
    city: 'Costa Rica',
    customer: 'viajero que busca yacht charter de lujo en Costa Rica',
    moneyQuery: '¿cuál es el mejor yacht charter en Costa Rica?',
    compliment: 'you run a luxury yacht charter concierge brand for Costa Rica’s Pacific',
    gapClause: 'AI still lacks structured FAQs on routes, boats, and booking that get cited vs competitors',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ boats/routes/pricing, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'CR Yacht Charter',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50662422041',
    preferredEmail: 'step-aboard@yachtchartercr.com',
  },
  'elitecartagena.com': {
    company: 'Elite Cartagena',
    city: 'Cartagena',
    customer: 'viajero que busca yacht o catamarán verificado en Cartagena',
    moneyQuery: '¿cuál es el mejor yacht charter en Cartagena?',
    compliment: 'Elite Cartagena markets a verified yacht/catamaran fleet for Cartagena',
    gapClause: 'missing citable FAQs on fleet, pricing, and booking that ChatGPT can use',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ fleet/prices/routes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Elite Cartagena',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '15164936070',
    preferredEmail: 'jc@elitecartagena.com',
  },
  'drjorgerodriguez.com': {
    company: 'Dr. Jorge Rodriguez',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía estética en Medellín',
    moneyQuery: '¿cuál es el mejor cirujano plástico en Medellín para pacientes internacionales?',
    compliment: 'intl-facing aesthetic practice in Medellín with a bilingual patient path',
    gapClause: 'missing citable FAQs on procedures and medical tourism that AI engines can answer',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ procedures/travel/pricing, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Jorge Rodriguez',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573003719688',
  },
  'saludsinfronteras.com': {
    company: 'Salud sin Fronteras',
    city: 'Medellín',
    customer: 'paciente internacional que busca facilitador de turismo médico en Colombia',
    moneyQuery: '¿cuál es el mejor facilitador de turismo médico en Medellín?',
    compliment: 'you coordinate medical tourism across Medellín/Bogotá/Cartagena for intl patients',
    gapClause: 'AI still lacks citable FAQs on packages, specialties, and intake for medical tourism facilitators',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Salud sin Fronteras',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573507316151',
  },
  'colombialuxurygroup.com': {
    company: 'Colombia Luxury Group',
    city: 'Cartagena',
    customer: 'viajero que busca yacht rental o charter en Cartagena',
    moneyQuery: '¿cuál es el mejor yacht rental en Cartagena?',
    compliment: 'Cartagena yacht rental with a fast WhatsApp quote flow — clear luxury positioning',
    gapClause: 'missing structured FAQs on fleet, routes, and pricing that ChatGPT can cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ fleet/prices/routes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Colombia Luxury Group',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573042091627',
  },
  'luisguillermotobon.com': {
    company: 'Dr. Luis Guillermo Tobon',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía estética en Medellín',
    moneyQuery: '¿cuál es el mejor cirujano plástico en Medellín con 30 años de experiencia?',
    compliment: '30+ years aesthetic surgery in Medellín with an English-facing intl path',
    gapClause: 'missing citable FAQs on procedures and medical tourism that AI engines can answer',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ procedures/travel/pricing, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Luis Guillermo Tobon',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573215095101',
  },
  'hicartagena.com': {
    company: 'Hi Cartagena',
    city: 'Cartagena',
    customer: 'viajero que busca concierge de lujo o yachts en Cartagena',
    moneyQuery: '¿cuál es el mejor luxury concierge o yacht en Cartagena?',
    compliment: 'luxury concierge + yachts in Cartagena with a WhatsApp-first booking path',
    gapClause: 'AI answers lack structured FAQs on charters and concierge packages to cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ yachts/concierge/pricing, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hi Cartagena',
    contactLastName: '(WhatsApp contact)',
    // Hit-list verified WA +57 313 695 2776
    preferredPhone: '573136952776',
  },
  'tijuanadentalcenter.com': {
    company: 'Tijuana Dental Center',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología en Zona Río Tijuana',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana Zona Río para pacientes de EE.UU.?',
    compliment: 'Zona Río clinic with high US-patient volume and an English contact path',
    gapClause: 'missing citable FAQs on border dental care that ChatGPT uses vs competitors',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Tijuana Dental Center',
    contactLastName: '(WhatsApp contact)',
    // Contact page published +1 (619) 906-7481 / info@smile4evermexico.com
    preferredPhone: '16199067481',
    preferredEmail: 'info@smile4evermexico.com',
  },
  'thebristol.com': {
    company: 'Bristol Panama',
    city: 'Panama City',
    customer: 'viajero o empresa que busca hotel de lujo o eventos en Panamá',
    moneyQuery: '¿cuál es el mejor hotel de lujo en Ciudad de Panamá?',
    compliment: 'The Bristol is a classic luxury hotel brand in Panama City',
    gapClause: 'AI answers lack citable FAQs on rooms, events, and packages vs other luxury hotels',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book rooms/events 24/7 (EN/ES, CRM-wired), intake automation, AI video for hotel marketing, and AI-system rescue.',
    topFixes: '(1) FAQ rooms/events/packages, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Bristol Panama',
    contactLastName: '(Concierge)',
    preferredPhone: '5072947878',
    preferredEmail: 'concierge@bristolpanama.com',
  },
  'sortishotel.com': {
    company: 'Sortis Hotel',
    city: 'Panama City',
    customer: 'viajero o planner que busca hotel, spa o casino/eventos en Obarrio',
    moneyQuery: '¿cuál es el mejor hotel spa casino en Ciudad de Panamá?',
    compliment: 'Sortis Hotel Spa & Casino (Autograph Collection) has a strong meetings + leisure brand',
    gapClause: 'missing citable FAQs on spa, casino, and event packages for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book 24/7 (EN/ES, CRM-wired), event intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ spa/casino/events, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Sortis Hotel',
    contactLastName: '(Reservations)',
    preferredPhone: '5073988888',
    preferredEmail: 'reservaciones@sortishotel.com',
  },
  'balboaacademy.edu': {
    company: 'Balboa Academy',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional en Ciudad del Saber',
    moneyQuery: '¿cuál es el mejor colegio internacional en Panamá Clayton?',
    compliment: 'Balboa Academy is a long-running international school in City of Knowledge',
    gapClause: 'missing citable admissions FAQs that ChatGPT uses when expats search schools in Panama',
    pdEmoji: '🏠',
    pdLine: 'I build WhatsApp agents that answer and qualify admissions leads 24/7 (EN/ES, CRM-wired), admissions intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ admissions/fees/curriculum, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Balboa Academy',
    contactLastName: '(Admissions)',
    preferredPhone: '5073021076',
    preferredEmail: 'contactba@balboa-academy.org',
  },
  'oxfordpanama.com': {
    company: 'Oxford International School Panama',
    city: 'Panama City',
    customer: 'familia que busca colegio internacional Oxford en Panamá',
    moneyQuery: '¿cuál es el mejor Oxford school en Panamá?',
    compliment: 'Oxford International School has a clear admissions + WhatsApp path for families',
    gapClause: 'AI still lacks structured admissions FAQs vs other international schools in Panama',
    pdEmoji: '🏠',
    pdLine: 'I build WhatsApp agents that answer and qualify admissions leads 24/7 (EN/ES, CRM-wired), admissions intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ admissions/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Oxford International School',
    contactLastName: '(Admissions)',
    preferredPhone: '50763795769',
    preferredEmail: 'admisiones@ois.edu.pa',
  },
  'hospitalcima.com': {
    company: 'Hospital CIMA',
    city: 'San José',
    customer: 'paciente internacional que busca hospital en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital CIMA en Costa Rica para pacientes internacionales?',
    compliment: 'Hospital CIMA San José is a major intl-patient hospital brand in Escazú',
    gapClause: 'missing citable FAQs on intl insurance and patient intake for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that coordinate intl patients 24/7 (EN/ES, CRM-wired), medical intake automation, AI video for hospital marketing, and AI-system rescue.',
    topFixes: '(1) FAQ intl patients/insurance, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital CIMA',
    contactLastName: '(International Patients)',
    preferredPhone: '50622081000',
    preferredEmail: 'info@hospitalcima.com',
  },
  'medicaltourscostarica.com': {
    company: 'Medical Tours Costa Rica',
    city: 'Costa Rica',
    customer: 'paciente de EE.UU./Canadá que busca facilitador de turismo médico en Costa Rica',
    moneyQuery: '¿cuál es el mejor medical tourism facilitator en Costa Rica?',
    compliment: 'Medical Tours Costa Rica is a facilitator brand — GEO + WhatsApp qualify is the whole model',
    gapClause: 'AI answers lack structured package FAQs vs other CR medical tourism facilitators',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Medical Tours CR',
    contactLastName: '(Operations)',
    preferredPhone: '18666656433',
    preferredEmail: 'operations@medtourscr.com',
  },
  'goodnessdental.com': {
    company: 'Goodness Dental',
    city: 'Escazú',
    customer: 'paciente de EE.UU./Canadá que busca odontología en Costa Rica',
    moneyQuery: '¿cuál es la mejor clínica dental en Costa Rica para pacientes de EE.UU.?',
    compliment: 'Goodness Dental is a US/Canada-facing dental tourism brand in Escazú',
    gapClause: 'missing citable FAQs on implants, travel, and pricing for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Goodness Dental',
    contactLastName: '(Patient Care)',
    preferredPhone: '18664062744',
    preferredEmail: 'patients@goodnessdental.com',
  },
  'agencyofthesea.com': {
    company: 'Agency of the Sea',
    city: 'Jacó',
    customer: 'capitán o charter client que busca yacht agency en Costa Rica',
    moneyQuery: '¿cuál es el mejor yacht agent en Costa Rica?',
    compliment: 'Agency of the Sea is a local CR yacht/port agent with WhatsApp-first ops',
    gapClause: 'AI lacks structured FAQs on charters, ports, and agency services to cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book agency/charter requests 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ ports/charters/services, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gabriela',
    contactLastName: 'Porras (Agency of the Sea)',
    preferredPhone: '50672885005',
    preferredEmail: 'gabriela@agencyofthesea.com',
  },
  'absolutemedicaltourism.com': {
    company: 'Absolute Medical Tourism',
    city: 'Medellín',
    customer: 'paciente internacional que busca facilitador VIP de turismo médico en Colombia',
    moneyQuery: '¿cuál es el mejor medical tourism facilitator en Medellín?',
    compliment: 'Absolute Medical Tourism positions VIP concierge packages for Colombia health travel',
    gapClause: 'missing citable FAQs on packages and logistics that ChatGPT can use',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Absolute Medical Tourism',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573016347898',
    preferredEmail: 'info@absolutemedicaltourism.com',
  },
  'sotadental.com': {
    company: 'SOTA Dental',
    city: 'Cancún',
    customer: 'paciente de EE.UU./Canadá que busca All-on-4 o implantes en México',
    moneyQuery: '¿cuál es la mejor clínica All-on-4 en Cancún o Tijuana?',
    compliment: 'SOTA Dental is a multi-city Mexico implants brand (Cancún/Tijuana/Los Algodones/PdC)',
    gapClause: 'AI answers lack structured FAQs vs other Mexico dental tourism brands',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ All-on-4/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'SOTA Dental',
    contactLastName: '(Patient Care)',
    preferredPhone: '18006813340',
    preferredEmail: 'contact@sotadental.com',
  },
  'dentalconnect.com.mx': {
    company: 'Dental Connect',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología fronteriza con pickup',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana con border pickup?',
    compliment: 'Dental Connect markets bilingual border dental with pickup logistics',
    gapClause: 'missing citable FAQs on border patients and pricing for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ border patients/prices, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dental Connect',
    contactLastName: '(Contact)',
    preferredPhone: '18885758150',
    preferredEmail: 'contactus@dentalconnect.com.mx',
  },
  'danielacorreacirujana.com': {
    company: 'Dr. Daniela Correa',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía plástica en Medellín',
    moneyQuery: '¿cuál es la mejor cirujana plástica en Medellín para pacientes internacionales?',
    compliment: 'cirugía plástica en Medellín con flujo EN + WhatsApp para pacientes intl',
    gapClause: 'faltan FAQs citables sobre procedimientos y turismo médico que ChatGPT pueda usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake intl, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ procedimientos/precios/viaje, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Daniela Correa',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573332841861',
    preferredEmail: 'danielacorreacirujana@gmail.com',
  },
  'panama.evrealestate.com': {
    company: 'Engel & Völkers Panamá',
    city: 'Panama City',
    customer: 'comprador internacional que busca bienes raíces de lujo en Panama City',
    moneyQuery: '¿cuál es la mejor inmobiliaria de lujo en Panama City?',
    compliment: 'Engel & Völkers es una marca inmobiliaria internacional con oficinas en Casco Antiguo y Costa del Este',
    gapClause: 'mi motor recibió una pantalla de "Verificación Humana" en vez de su contenido — así ven hoy sus listados los motores de IA: nada',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican al comprador desde el primer mensaje (presupuesto, zona, urgencia) y lo entregan listo al asesor correcto 24/7 (EN/ES, conectados a su CRM), automatización de seguimiento de leads fríos, video con IA para marketing de propiedades, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Permitir acceso de los crawlers de IA sin verificación humana, (2) Organization/RealEstateAgent JSON-LD, (3) contenido sustantivo server-rendered (hoy ~35 palabras)',
    contactFirstName: 'Engel & Völkers Panamá',
    contactLastName: '(WhatsApp contact)',
    // Contact page has only a placeholder "you@emailaddress.com" — no real email published.
    preferredPhone: '50767808277',
  },
  'lastregaristorante.com': {
    company: 'La Strega Ristorante',
    city: 'Panama City',
    customer: 'comensal que busca restaurante italiano para reservar en Panama City',
    moneyQuery: '¿cuál es el mejor restaurante italiano en Panama City?',
    compliment: 'La Strega tiene dos sedes activas (Bella Vista y Costa del Este) con buena reputación en reseñas',
    gapClause: 'cuando mi motor visitó su sitio el servidor devolvió error 503 — así lo ven ahora mismo los motores de IA: nada',
    pdEmoji: '🍝',
    pdLine: 'construyo agentes de WhatsApp que confirman reservas, manejan lista de espera y reactivan clientes que no llegaron 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos privados, video con IA para marketing del restaurante, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Resolver el error del servidor para que el sitio responda 200, (2) Restaurant/LocalBusiness JSON-LD, (3) contenido sustantivo (menú, horarios, FAQ) en HTML server-rendered',
    contactFirstName: 'La Strega',
    contactLastName: '(WhatsApp contact)',
    // Landlines on site: Bella Vista 398-5421, Costa del Este 305-0160 (wa.me may not open these).
    // Mobile-format number found via Facebook page scrape — UNCONFIRMED, verify before send.
    preferredPhone: '50760530985',
    preferredEmail: 'reservas@lastregaristorante.com',
  },
  'marjalizorealty.com': {
    company: 'Marjalizo',
    city: 'Panama City',
    customer: 'inversionista internacional que busca proyectos inmobiliarios de lujo en Panamá',
    moneyQuery: '¿cuál es la mejor inmobiliaria de lujo para invertir en Panamá?',
    compliment: 'datos estructurados perfectos, contenido listo para respuestas y base técnica impecable; de los mejores puntajes que he medido en Panamá',
    gapClause: 'robots.txt, sitemap.xml y llms.txt',
    dealOffer: 'AI Growth Operator · comprador internacional',
    pivot:
      'Con 35 años y oficinas en Panamá, Colombia y Miami, su cuello de botella no es la web: es que un inversionista escribe un domingo desde Bogotá o Miami preguntando por un proyecto, y la respuesta llega cuando ya se enfrió. El agente que instalo califica desde el primer mensaje (presupuesto, proyecto, plazo), responde en el huso horario del comprador, aparta la cita con el asesor correcto y reactiva solo las cotizaciones que quedaron frías.',
    ask: 'Una propuesta concreta, sin compromiso: mándenme 10 conversaciones reales de WhatsApp de la semana pasada, sin datos personales. Les devuelvo un análisis señalando en qué mensaje exactamente se cayó cada venta.',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican al comprador internacional desde el primer mensaje (presupuesto, proyecto, urgencia), coordinan entre las zonas horarias de Panamá, Colombia y Miami, y reactivan cotizaciones frías 24/7, conectados a su CRM, video con IA para marketing de proyectos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) robots.txt explícito para crawlers de IA, (2) sitemap.xml, (3) llms.txt',
    contactFirstName: 'Marjalizo',
    contactLastName: '(WhatsApp contact)',
    // Confirmed live via marjalizo.com/contacto (redirect target of this domain): wa.me/50763152222
    preferredPhone: '50763152222',
  },
  'valordevelopment.com.pa': {
    company: 'Madero (Valor Development)',
    city: 'Panama City',
    customer: 'comprador que busca apartamento de lujo en Costa del Este',
    moneyQuery: '¿cuál es el mejor proyecto de apartamentos en Costa del Este?',
    compliment: 'acceso de crawlers 95/100 y datos estructurados 94/100, un sitio ya listo para la era de la IA',
    gapClause: 'un solo H1 claro y un llms.txt',
    dealOffer: 'AI Growth Operator · venta de Madero',
    // Madero has no site of its own — it lives at valordevelopment.com.pa/project/madero/.
    // The sellable entity is the developer, so the letter leads with the project by name.
    pivot:
      'Madero es un ticket de $600K a $1.4M en Costa del Este, y ese comprador casi nunca cierra en la primera conversación: pregunta por planta, precio y financiamiento, compara con dos torres más, y decide semanas después. Lo que instalo responde esa primera consulta al instante con la planta y el rango correcto, califica presupuesto y plazo, agenda la visita al showroom y reactiva sola la cotización que quedó fría — sin que un asesor tenga que acordarse.',
    ask: 'Una propuesta concreta, sin compromiso: mándenme 10 conversaciones reales de WhatsApp de la semana pasada, sin datos personales. Les devuelvo un análisis de en qué mensaje exactamente se cayó cada venta y cuántas se habrían cerrado solas.',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican compradores y agendan visitas 24/7 (EN/ES, conectados a su CRM), automatización de seguimiento de cotizaciones, video con IA para marketing de proyectos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un solo H1 que nombre la oferta, (2) llms.txt, (3) FAQ + FAQPage JSON-LD con las preguntas reales del comprador',
    contactFirstName: 'Valor Development',
    contactLastName: '(Ventas — Madero)',
    // Site's own click-to-chat ("quiero agendar una cita"): api.whatsapp.com/send?phone=50765663082
    preferredPhone: '50765663082',
    preferredEmail: 'ventas@gvalordevelopment.com',
  },
  'empresasbern.com': {
    company: 'Empresas Bern',
    city: 'Panama City',
    customer: 'comprador o inversionista que busca proyecto inmobiliario premium en Panamá',
    moneyQuery: '¿cuál es el mejor desarrollador inmobiliario en Panamá?',
    compliment: 'datos estructurados 94/100 y acceso de crawlers 91/100, un sitio ya bien preparado para la era de la IA',
    gapClause: 'un H1 único, un robots.txt explícito y un llms.txt',
    dealOffer: 'AI Growth Operator · ventas multi-proyecto',
    pivot:
      'Con más de 160 proyectos y salas de venta en Costa del Este y Bayfront, el problema no es que no los encuentren: es que una consulta que entra un sábado por la noche sobre Bayfront termina esperando al lunes, y el comprador de Boquete o Playa Bonita ya escribió a otro. El agente que instalo atiende esa consulta al instante, sabe distinguir entre sus proyectos, califica presupuesto y zona, agenda la visita a la sala correcta y reactiva las cotizaciones frías.',
    ask: 'Una propuesta concreta, sin compromiso: mándenme 10 conversaciones reales de WhatsApp de la semana pasada, sin datos personales. Les devuelvo un análisis de en qué mensaje se cayó cada venta.',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican compradores y agendan visitas 24/7 (EN/ES, conectados a su CRM), automatización de seguimiento, video con IA para marketing de proyectos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un solo H1, (2) robots.txt que dé la bienvenida a crawlers de IA + sitemap, (3) llms.txt',
    contactFirstName: 'Empresas Bern',
    contactLastName: '(WhatsApp contact)',
    // joinchat widget config on /contacto: "telephone":"50766792204" (reproduced 3/3 fetches).
    // Landline +507 214-2376 also published, but wa.me cannot open it.
    preferredPhone: '50766792204',
  },
  'insigniaresource.com': {
    company: 'Insignia Resources',
    city: 'Panama City',
    customer: 'empresa de EE.UU. que busca un equipo remoto nearshore en Panamá',
    moneyQuery: '¿cuál es el mejor partner de staffing nearshore en Panamá?',
    compliment: 'acceso de crawlers 95/100 y contenido profundo de más de 1,000 palabras, que ya compite bien en respuestas de IA',
    gapClause: 'un H1 único, sameAs a sus perfiles y un llms.txt',
    dealOffer: 'AI Growth Operator · calificación de leads B2B',
    pivot:
      'Ustedes venden equipos remotos a empresas de EE.UU., así que cada lead que llega por el sitio vale mucho y llega en horario gringo. Lo que instalo califica ese lead en el momento (rol buscado, volumen, urgencia, presupuesto), lo rutea al reclutador correcto con el resumen listo, y hace el seguimiento de los que no contestaron — que en B2B suele ser donde se pierde la mitad del pipeline.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo quedaría el Operator sobre su flujo actual de leads — sin compromiso.',
    pdEmoji: '💼',
    pdLine: 'construyo agentes que califican y rutean leads B2B 24/7 (EN/ES, conectados a su CRM), automatización de intake y seguimiento, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un solo H1, (2) sameAs en el JSON-LD + og:image, (3) llms.txt',
    contactFirstName: 'Insignia Resources',
    contactLastName: '(Contact)',
    // mailto: on the site (24 occurrences) — authoritative. Published phone is a US
    // landline (646.350.1001), which wa.me cannot open, so this one is email-primary.
    preferredEmail: 'info@insigniaresources.com',
    emailOnlyOk: true,
    noteFlag:
      'PRIOR CONTACT — Insignia Resources already exists in HubSpot as a HIRING lead (deal 62733594526, "Insignia Resources - Zoom Interview", Jul 16 2026). They interviewed you. Do NOT send this as a cold first-touch; open by referencing that conversation, or decide whether pitching them conflicts with the role.',
  },
  'foundever.com': {
    company: 'Foundever',
    city: 'Panama City',
    customer: 'empresa global que busca externalizar su experiencia de cliente (CX)',
    moneyQuery: '¿cuál es el mejor proveedor de CX outsourcing en Panamá?',
    compliment: 'respuesta-a-preguntas 100/100 y 94/100 global, de los sitios mejor preparados para IA que he medido',
    gapClause: 'un llms.txt y alt text en las imágenes',
    dealOffer: 'AI Growth Operator · automatización interna',
    pivot:
      'A ustedes no les vendo visibilidad ni un chatbot — son 2,000+ personas haciendo CX en Panamá en cuatro idiomas, saben del tema más que la mayoría. Lo que hago es la capa de automatización interna alrededor de eso: agentes que preparan al asesor antes de que conteste, resumen y clasifican la conversación cuando termina, mantienen el CRM al día solo, y entregan un briefing diario con las cuentas que necesitan atención. Es el trabajo que consume horas del equipo y que nadie quiere hacer a mano.',
    ask: 'Si les sirve, en 15 minutos les muestro qué automatizaría primero y qué horas libera — sin compromiso.',
    pdEmoji: '💼',
    pdLine: 'construyo agentes de IA que asisten y resumen conversaciones, automatización de procesos repetitivos conectada a las herramientas que ya usan, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) llms.txt, (2) alt text en imágenes, (3) FAQPage/Service JSON-LD',
    contactFirstName: 'Foundever Panamá',
    contactLastName: '(Contact)',
    // Only a Panama landline (+507 599-5962) is published; no public WhatsApp or email.
    emailOnlyOk: true,
    noteFlag:
      'PRIOR CONTACT — Foundever already exists in HubSpot as HIRING leads (deals 62754997070 "Interview Invitation from Foundever Panama" + 62740209189, Jul 16 2026). Also note they are a CX outsourcer, i.e. partly a competitor for this offer. Do NOT send as a cold first-touch without deciding the framing.',
  },
  'autogorepuestos.com': {
    company: 'AutoGO Repuestos',
    city: 'Panama City',
    customer: 'dueño de vehículo que busca repuestos, llantas o baterías en Panamá',
    moneyQuery: '¿dónde compro repuestos o llantas para mi carro en Panamá?',
    compliment: 'AutoGO tiene catálogo real de repuestos para Toyota, Suzuki, Kia, Hyundai y más, con buen acceso de crawlers de IA (95/100)',
    gapClause: 'la página no tiene H1 ni meta-descripción — los motores de IA no pueden resumir claramente qué venden ni a quién',
    pdEmoji: '🔧',
    pdLine: 'construyo agentes de WhatsApp que leen la medida o pieza desde una foto, consultan stock por sucursal, apartan el repuesto y reactivan cotizaciones frías 24/7, conectados a su CRM, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un H1 claro con la oferta, (2) meta-descripción 50–170 caracteres, (3) FAQ con preguntas reales de clientes + FAQPage JSON-LD',
    contactFirstName: 'AutoGO Repuestos',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766329199',
  },
  /**
   * Panama executive search — the Arden & Price cohort, staged Aug 7 2026 with
   * `openToRoles` so each letter also states, once, that Elena would hear about a senior
   * AI role. These three were picked over Amrop and Stanton Chase because a search firm
   * has to be audited on its own domain: those two publish Panama as a subpath of a
   * global site, so the engine would score the head office, not the office being written
   * to. Every claim in the compliments comes from each firm's own site.
   */
  't-mapp.com': {
    company: 'T-MAPP',
    city: 'Panama City',
    customer: 'director regional que necesita contratar gerencia media o talento tech en Panamá',
    moneyQuery: '¿qué headhunter en Panamá consigue talento regional o tecnológico?',
    compliment:
      'publican la guía de los mejores headhunters de Panamá — pocos en su sector tienen la seguridad de ubicar a su competencia en una tabla — y su Smart Search apunta al ejecutivo pasivo, que es el difícil',
    // Verified by the live audit run on Aug 7 2026: score 92 A (AI Access 95 · GEO 94 ·
    // AEO 81 · Tech 100). WARNs for llms.txt, html-lang, question-headings (only one),
    // semantic-html, freshness-signal.
    gapClause:
      'les falta una sección de preguntas y respuestas con las dudas reales de quien abre una búsqueda, y fechas claras en el contenido que van actualizando',
    dealOffer: 'AI Growth Operator · intake y calificación de búsquedas',
    pivot:
      'Su activo es el mapa del talento pasivo, y un mapa se enfría solo. Lo que hago es dejarlo vivo: un agente que atiende 24/7 al cliente que llega con una vacante y la califica antes de que un consultor invierta una hora (nivel, industria, banda salarial, urgencia), califica también al candidato que se postula, mantiene el CRM al día y les entrega cada mañana un briefing de qué se movió en el mapa.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre su flujo de búsquedas — sin compromiso.',
    pdEmoji: '💼',
    pdLine:
      'construyo agentes de WhatsApp que atienden y califican 24/7 tanto al cliente que abre una búsqueda como al candidato que se postula (nivel, industria, urgencia, banda salarial), automatización del intake y del seguimiento de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes:
      '(1) FAQ con las preguntas literales de quien abre una búsqueda ejecutiva (plazo, confidencialidad, industria, honorarios), (2) archivo para asistentes de IA + idioma declarado en la página, (3) fechas visibles en contenido actualizado',
    contactFirstName: 'T-MAPP',
    contactLastName: '(Contact)',
    // Site publishes contact forms only — no mailto or WA link. Their own terms name
    // alejandro@t-mapp.com for contractual notifications (Talent Mapping S.A.S).
    preferredEmail: 'alejandro@t-mapp.com',
    emailOnlyOk: true,
    openToRoles: true,
  },
  'cornerstone.pa': {
    company: 'Cornerstone Panama',
    city: 'Panama City',
    customer:
      'presidente o miembro de junta directiva que necesita contratar a un CEO o a un director en Panamá',
    moneyQuery: '¿quién hace búsqueda de CEO y de junta directiva en Panamá?',
    compliment:
      'son miembros de la AESC y ponen por escrito algo que casi nadie se atreve: terna final en 10 días hábiles, con coaching de adaptación para el ejecutivo seleccionado',
    gapClause: 'PENDING_AUDIT',
    dealOffer: 'AI Growth Operator · intake y calificación de búsquedas',
    pivot:
      'Su promesa es la terna final en 10 días hábiles, y ese reloj empieza a correr desde el primer contacto del cliente. Lo que hago es proteger esos primeros días: un agente que atiende la consulta apenas entra, califica la posición (nivel, industria, banda salarial, urgencia) y se la pasa al socio con el perfil ya definido, en vez de gastar dos días en agendar la reunión de arranque.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre su proceso actual — sin compromiso.',
    pdEmoji: '💼',
    pdLine:
      'construyo agentes de WhatsApp que atienden y califican 24/7 tanto al cliente que abre una búsqueda como al candidato que se postula (nivel, industria, urgencia, banda salarial), automatización del intake y del seguimiento de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: 'PENDING_AUDIT',
    contactFirstName: 'Cornerstone Panama',
    contactLastName: '(Contact)',
    // cornerstone.pa publishes a contact form only — no mailto or WA on the Panama site.
    emailOnlyOk: true,
    openToRoles: true,
  },
  'talentum.com.pa': {
    company: 'Talentum Headhunting',
    city: 'Panama City',
    customer:
      'gerente general sin departamento de RRHH que necesita contratar gerencia media o ejecutiva',
    moneyQuery: '¿cuál es la mejor agencia de reclutamiento ejecutivo en Panamá?',
    compliment:
      'son una boutique panameña con una promesa que se puede verificar: no reciclan hojas de vida, cada búsqueda arranca identificando dónde está ese talento, y acompañan a empresas que no tienen un departamento de RRHH permanente',
    // Verified by the live audit run on Aug 7 2026: score 85 A (AI Access 95 · GEO 88 ·
    // AEO 75 · Tech 86). FAIL h1, img-alt (7/22); WARNs for llms.txt, schema-answer,
    // entity-links, question-headings.
    gapClause:
      'la primera pantalla no deja claro qué hacen, faltan respuestas en forma de pregunta y respuesta para las dudas típicas de una empresa que quiere contratar, y muchas fotos del equipo no tienen descripción que un asistente pueda leer',
    dealOffer: 'AI Growth Operator · intake y calificación de búsquedas',
    pivot:
      'Sus clientes son empresas sin departamento de RRHH permanente: cuando necesitan contratar, ustedes son el departamento. Lo que hago es que ese cliente encuentre respuesta apenas escribe, a cualquier hora — un agente que califica la vacante (nivel, funciones, banda salarial, urgencia) y se la entrega al consultor ya perfilada, atiende también al candidato que se postula, y reactiva a los clientes que contrataron el año pasado y no han vuelto.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre sus búsquedas actuales — sin compromiso.',
    pdEmoji: '💼',
    pdLine:
      'construyo agentes de WhatsApp que atienden y califican 24/7 tanto al cliente que abre una búsqueda como al candidato que se postula (nivel, industria, urgencia, banda salarial), automatización del intake y del seguimiento de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes:
      '(1) titular principal claro + FAQ con las dudas reales de empresas sin RRHH, (2) conectar el sitio a LinkedIn y perfiles verificados, (3) descripciones en las fotos del equipo y casos de éxito',
    contactFirstName: 'Talentum Headhunting',
    contactLastName: '(Contact)',
    // talentum.com.pa/contacts/ publishes c.fistonich@ for commercial inquiries;
    // the scrape also found +507 6339-6599 as a Panama mobile on the site.
    preferredEmail: 'c.fistonich@talentum.com.pa',
    openToRoles: true,
  },
  /**
   * RE/MAX Millenium Panamá — RE/MAX franchise office at the World Trade Center,
   * Marbella, Panama City. Owners Jose Jardim and Maria Flores, ~14 agents. Inventory
   * spans sale, rent, commercial and new developments; the site is written in English
   * for the international buyer.
   *
   * Not to be confused with RE/MAX Millennium (remaxmillennium.ca), the Vaughan/Toronto
   * brokerage — same name, different company, two n's.
   *
   * Contacts: info@remax-millenium.com is the office address published on the site; the
   * company's own LinkedIn posts sign off with +507 6851-6654 and jljardim@ (the owner).
   * The site scrape decides which number the WhatsApp button gets — preferredPhone is
   * only the fallback for when it publishes none.
   *
   * No audit number is hardcoded: score, grade and the weakest category come from the
   * live engine at staging time, and the letter switches to the credential opening on
   * its own above 85.
   */
  'remax-millenium.com': {
    company: 'REMAX Millenium',
    city: 'Panama City',
    customer: 'comprador o inversionista extranjero que busca propiedad en Panamá',
    moneyQuery: '¿cuál es la mejor inmobiliaria en Ciudad de Panamá para comprar o invertir?',
    compliment:
      'tienen el respaldo de la red global RE/MAX con equipo local en el World Trade Center de Marbella, y su sitio ya está en inglés para el comprador internacional, con inventario de venta, alquiler, comercial y proyectos nuevos',
    // Verified by the live audit run on Aug 7 2026: FAIL question-headings, plus WARNs
    // for robots.txt, llms.txt, answer schema and sameAs. The buyer-question framing
    // lives in `pivot`; this clause is what the free fix-list at the end of the letter
    // promises, so it names only what the engine actually flagged.
    gapClause:
      'no hay una sola sección en forma de pregunta y respuesta, ni marcado FAQPage, ni llms.txt, ni sameAs que ate el sitio a sus perfiles',
    dealOffer: 'AI Growth Operator · calificación de compradores por WhatsApp',
    pivot:
      'Su comprador llega de otro país y en otra zona horaria, y la primera pregunta casi nunca es por una propiedad: es si puede comprar sin ser residente, qué impuestos paga, si hay financiamiento para extranjeros. Lo que hago es dejar ese primer contacto atendido 24/7 en inglés y español — un agente que responde esas dudas, califica al comprador (presupuesto, zona, plazo, si compra de contado), agenda la visita y le pasa al asesor el lead ya briefeado, además de reactivar a los que preguntaron hace meses y nunca volvieron.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre los leads que ya reciben — sin compromiso.',
    pdEmoji: '🏠',
    pdLine:
      'construyo agentes de WhatsApp que califican compradores 24/7 en inglés y español (presupuesto, zona, plazo, forma de pago), agendan visitas y se conectan a su CRM, automatización de seguimiento y reactivación de leads fríos, video con IA para marketing de propiedades, y rescate de sistemas de IA que fallan.',
    topFixes:
      '(1) FAQ cuyos H2/H3 sean las preguntas literales del comprador extranjero (residencia, título, impuestos, financiamiento) + FAQPage/Service JSON-LD, (2) robots.txt que dé la bienvenida a los crawlers de IA + llms.txt + sameAs a LinkedIn y redes, (3) el HTML tarda 3.0 s en responder — cache/CDN, y fechas legibles por máquina en el contenido',
    contactFirstName: 'REMAX Millenium',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'info@remax-millenium.com',
  },
  /**
   * Abolu, S.A. (Grupo Caco Abbo) — the largest hardware wholesaler in Panama: 8,000+
   * SKUs, 50+ brands, nationwide delivery under 48h, and the Panama distributor of the
   * group's own Best Value tool brand. HQ Edificio Abolu, Llano Bonito, Juan Díaz.
   *
   * Contacts come from Abolu's own published material, not from guesswork. The site
   * footer prints servicioalcliente@abolu.net and Tel (+507) 233-7525; their product
   * catalogue prints "WHATSAPP 6670-8797 / CALL CENTER 233-7525 / VÍA EMAIL
   * VENTAS@ABOLU.NET" on the ordering pages. 233-7525 is a landline (Panama mobiles start
   * with 6), so the site scrape alone finds no WhatsApp-capable number — hence
   * preferredPhone. The other number in that catalogue, 6981-6633, is always paired with
   * WeChat: that is the export desk, not the Panama sales line, so it is not used here.
   *
   * Nothing below quotes an audit number: score, grade and the weakest category come from
   * the live run of the visibility engine at staging time.
   */
  'abolu.net': {
    company: 'Abolu Best Value',
    city: 'Panama City',
    customer: 'dueño de ferretería que necesita reabastecer su tienda en Panamá',
    moneyQuery: '¿cuál es el mejor distribuidor mayorista de ferretería en Panamá?',
    compliment:
      'son el mayorista ferretero más grande de Panamá, con más de 8,000 SKU, más de 50 marcas, entregas a nivel nacional en menos de 48 horas y su propia marca Best Value',
    gapClause:
      'todo ese catálogo vive en un PDF y dentro del portal de pedidos, no en páginas que un motor de IA pueda leer y citar, y el sitio no responde en texto lo que un ferretero pregunta antes de escoger proveedor: mínimo de compra, crédito, cobertura y tiempos de entrega, garantía de las marcas',
    dealOffer: 'AI Growth Operator · pedidos y reposición por WhatsApp',
    pivot:
      'Su cliente es el dueño de ferretería, y hoy pide por WhatsApp fuera del horario del call center: pregunta si hay existencia, cuánto cuesta la caja, cuándo le llega. Lo que hago es dejar ese canal atendido 24/7 — un agente que consulta disponibilidad, arma el pedido, lo pasa a su vendedor con el cliente ya identificado, y reactiva solo a las ferreterías que dejaron de comprar este mes.',
    ask: 'Si les sirve, en 15 minutos les muestro cómo se vería sobre su flujo de pedidos actual — sin compromiso.',
    pdEmoji: '🔧',
    pdLine:
      'construyo agentes de WhatsApp que atienden pedidos y cotizaciones de ferreterías 24/7 (consultan disponibilidad, arman el pedido y se lo pasan al vendedor, conectados a su CRM), automatización de reposición y reactivación de clientes inactivos, video con IA para marketing de marcas, y rescate de sistemas de IA que fallan.',
    topFixes:
      '(1) páginas HTML de marca y categoría con el catálogo que hoy solo existe en PDF, (2) FAQ con las preguntas reales de un ferretero (mínimo de compra, crédito, cobertura y tiempos de entrega, garantías) + FAQPage JSON-LD, (3) Organization/LocalBusiness JSON-LD con dirección, teléfono y horario + llms.txt',
    contactFirstName: 'Abolu Best Value',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766708797',
    preferredEmail: 'servicioalcliente@abolu.net',
  },
  'beluxerealestate.com': {
    company: 'Be Luxe Real Estate',
    city: 'Panama City',
    customer: 'comprador internacional que busca propiedades de lujo en Costa del Este o Santa María',
    moneyQuery: '¿cuál es la mejor inmobiliaria de lujo en Costa del Este Panamá?',
    compliment: 'Be Luxe se posiciona en propiedades exclusivas de Costa del Este y Santa María',
    gapClause: 'su sitio es un shell de JavaScript — mi motor solo vio 9 palabras en el HTML crudo; la mayoría de los crawlers de IA no ejecutan JavaScript, así que ven una página casi vacía',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican al comprador desde el primer mensaje (presupuesto, zona, urgencia) y reactivan cotizaciones frías 24/7, conectados a su CRM, video con IA para marketing de propiedades, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Server-renderizar o prerenderizar el sitio (hoy invisible para IA), (2) Organization/RealEstateAgent JSON-LD, (3) un solo H1 claro',
    contactFirstName: 'Be Luxe Real Estate',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766534655',
  },
};

(async () => {
  console.log('DOMAIN', domain);

  // Audit. The score is not decoration: it names the deal, it is the email subject line,
  // and the prospect reads it in the first paragraph ("obtuvo N/100"). A placeholder that
  // reaches any of those is a claim about their business that nobody measured — so a
  // number is either measured here or asserted on the command line with --score, and
  // there is no third path (the old code silently shipped 75/B on a skip or a 429).
  let audit = {};
  let score = scoreOverride;
  let grade = 'B';
  let weak = { name: null, score: null, id: null };
  let catScores = {};
  let auditNote = '';

  if (scoreOverride != null) {
    if (!Number.isFinite(scoreOverride) || scoreOverride < 0 || scoreOverride > 100) {
      throw new Error(`--score must be 0-100, got "${scoreArg.split('=')[1]}"`);
    }
    console.warn('AUDIT_ASSERTED — using --score', score);
    auditNote = `Score ${score} asserted with --score (no live audit in this run) — re-audit before quoting category numbers.`;
  } else if (skipAudit) {
    throw new Error(
      '--skip-audit needs --score=<0-100>: the score goes into the deal name, the email ' +
        'subject and the prospect\'s first sentence, so it cannot default to a placeholder.',
    );
  } else {
    async function runVisibilityAudit(auditTarget) {
      const res = await fetch(VIS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': VIS_KEY },
        body: JSON.stringify({ url: auditTarget }),
      });
      const text = await res.text();
      return { res, text, auditTarget };
    }

    let { res: auditRes, text: auditText, auditTarget } = await runVisibilityAudit(url);
    const wwwUrl = `https://www.${domain}`;
    if (
      !auditRes.ok &&
      auditRes.status === 422 &&
      auditText.includes('unfetchable_url') &&
      !domain.startsWith('www.') &&
      auditTarget !== wwwUrl
    ) {
      console.warn(`AUDIT_RETRY — ${url} unfetchable, trying ${wwwUrl}`);
      ({ res: auditRes, text: auditText, auditTarget } = await runVisibilityAudit(wwwUrl));
    }

    if (auditRes.ok) {
      audit = JSON.parse(auditText);
      score = Math.round(audit.score ?? audit.overall ?? audit.total ?? 0);
      grade = audit.grade || audit.letterGrade || 'B';
      weak = weakestCategory(audit);
      catScores = Object.fromEntries((audit.categories || []).map((c) => [c.id, c.score]));
      if (auditTarget !== url) {
        auditNote = `Audit ran against ${auditTarget} (${url} was unfetchable from the engine).`;
      }
    } else if (auditRes.status === 429) {
      throw new Error(
        'visibility audit → 429 rate limited. Use VISIBILITY_API_KEY (owner key, not the ' +
          '20/hour demo key) and retry, or pass --score=<measured value>. Staging with a ' +
          'placeholder would put an invented score in front of the prospect.',
      );
    } else {
      throw new Error(`visibility audit → ${auditRes.status}: ${auditText.slice(0, 300)}`);
    }
  }
  console.log('AUDIT', score, grade, weak.name, weak.score);

  // Contacts
  let html = '';
  if (!noScrape) {
    for (const page of [url, `${url}/contact`, `${url}/contact-us`, `${url}/contacto`]) {
      try {
        const r = await fetch(page, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPA/1.0)' } });
        if (r.ok) html += '\n' + await r.text();
      } catch { /* skip */ }
    }
  }
  const contacts = parseContacts(html);
  console.log('CONTACTS', JSON.stringify(contacts));

  const meta = PROSPECT_META[domain];
  if (!meta) throw new Error(`No PROSPECT_META for ${domain} — add to stage-manual-prospect.cjs`);

  // `PENDING_AUDIT` marks copy that must be written from the audit rather than guessed:
  // the gap clause is what the letter offers to fix for free, and the note's fix list is
  // what Elena walks the prospect through. A --dry-run prints the audit's own findings,
  // and the sentinel keeps that from being skipped — the string itself must never reach
  // a prospect. The dry run is exempt: printing the audit is how the copy gets written.
  if (!dryRun) {
    const pending = Object.entries(meta).filter(([, v]) => v === 'PENDING_AUDIT');
    if (pending.length) {
      throw new Error(
        `PROSPECT_META.${domain} still has placeholder copy (${pending.map(([k]) => k).join(', ')}). ` +
          `Run with --dry-run, then write it from what the audit actually found.`,
      );
    }
  }

  if (meta.preferredPhone) {
    contacts.whatsapp = String(meta.preferredPhone).replace(/\D/g, '');
  }
  // Iron rule (MANUAL_PROSPECT_PLAY.md): BOTH WhatsApp + email on every deal.
  // Prefer scraped → preferredEmail → info@{domain} flagged UNVERIFIED (Elena confirms).
  let emailUnverified = false;
  if (meta.preferredEmail && !contacts.email) {
    contacts.email = meta.preferredEmail;
  }
  if (!contacts.email) {
    contacts.email = `info@${domain}`;
    emailUnverified = true;
  }
  // Two different questions, previously answered by one variable: which number goes on
  // the CRM record (any published line is useful — Elena can call it), and which number
  // can receive a WhatsApp message (only a declared WA link, a Panama mobile, or a
  // human-asserted preferredPhone). A landline answering the first must not answer the
  // second, or the deal ships a WhatsApp button that opens a chat with nobody.
  const preferred = meta.preferredPhone ? String(meta.preferredPhone).replace(/\D/g, '') : '';
  const crmPhone = contacts.whatsapp || contacts.phones[0] || preferred || '';
  const waPhone = contacts.whatsapp || preferred || '';
  if (!waPhone) {
    if (meta.emailOnlyOk && contacts.email) {
      console.warn(
        `EMAIL_ONLY — no WhatsApp-capable number${crmPhone ? ` (published line ${formatPhone507(crmPhone)} is not a mobile)` : ''}; note will be email-primary`,
      );
    } else {
      throw new Error(`No WhatsApp/phone found on ${domain} — add preferredPhone to PROSPECT_META`);
    }
  }
  const phoneDigits = crmPhone;
  const phoneForLinks = waPhone || '00000000000';
  const draft = buildDraft({
    domain,
    score,
    grade,
    weakName: weak.name,
    weakScore: weak.score,
    customer: meta.customer,
    moneyQuery: meta.moneyQuery,
    compliment: meta.compliment,
    gapClause: meta.gapClause,
    pdEmoji: meta.pdEmoji,
    pdLine: meta.pdLine,
    pivot: meta.pivot,
    ask: meta.ask,
    openToRoles: !!meta.openToRoles,
  });

  const slug = slugify(meta.company);
  // The letter buildDraft() produced: above CREDENTIAL_SCORE with a pivot it leads with
  // the score as a credential instead of a gap, and the deal name and subject line have
  // to say the same thing the prospect is reading.
  const credentialLetter = score >= CREDENTIAL_SCORE && !!meta.pivot;
  // A site above CREDENTIAL_SCORE has no GEO/AEO deficit to fix — naming the deal
  // "GEO/AEO fix" would misdescribe the offer (and mis-route hs-outcomes-to-atlas).
  const offerLabel = credentialLetter ? meta.dealOffer || 'AI Growth Operator' : 'GEO/AEO fix';
  const dealName = `[CLIENT-MANUAL] ${meta.company} — ${offerLabel} (audit: ${score}/${grade})`;

  const draftPath = `docs/selling/drafts/${slug}.txt`;
  const emailDraftPath = `docs/selling/drafts/${slug}-email.txt`;
  const prospectPath = `docs/selling/prospects/${meta.company.toUpperCase().replace(/\s+/g, '_')}.md`;

  const emailSubject = buildManualEmailSubject(meta.company, score, { credential: credentialLetter });
  const emailBody = buildManualEmailBody(draft, { botFallback: false });

  if (!dryRun) {
    fs.mkdirSync(path.join(root, 'docs/selling/drafts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/selling/prospects'), { recursive: true });
    fs.writeFileSync(path.join(root, draftPath), draft + '\n', { encoding: 'utf8' });
    registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
      email: contacts.email,
      emailDraft: emailDraftPath,
      score,
    });
    fs.writeFileSync(
      path.join(root, emailDraftPath),
      `SUBJECT: ${emailSubject}\n\nTO: ${contacts.email}\n${emailUnverified ? 'NOTE: UNVERIFIED — confirm recipient before send\n' : ''}${meta.emailOnlyOk ? 'NOTE: EMAIL-PRIMARY — no public WhatsApp on site\n' : ''}\n${emailBody}\n`,
      { encoding: 'utf8' },
    );
  }

  const dualLinks = buildDualChannelNoteLinks(
    phoneForLinks,
    contacts.email,
    draft,
    meta.company,
    score,
    slug,
  );
  const phoneFmt = phoneDigits ? formatPhone507(phoneDigits) : '';
  const phoneDisplay = waPhone
    ? phoneFmt
    : crmPhone
      ? `${phoneFmt} (fijo — sin WhatsApp; EMAIL PRIMARY)`
      : '(no public WhatsApp — EMAIL PRIMARY)';

  // Dedupe (skipped in --update mode, where hitting the existing deal is the point)
  if (KEY && !updateDealId && !offline) {
    const existing = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: meta.company.split(' ')[0] }] }],
      properties: ['dealname'],
      limit: 10,
    });
    const dup = (existing.results || []).find(d => (d.properties?.dealname || '').includes('[CLIENT-MANUAL]') && (d.properties?.dealname || '').includes(meta.company));
    if (dup) {
      console.error('DUPLICATE', dup.id, dup.properties.dealname);
      process.exit(1);
    }
  }

  const auditLine =
    `${score}/100 Grade ${grade} | Tech ${catScores.techSeo ?? '?'} | AI Access ${catScores.aiAccess ?? '?'} | GEO ${catScores.geo ?? '?'} | AEO ${catScores.aeo ?? '?'}` +
    (weak.score != null ? ` (${weak.name} ${weak.score} weakest)` : ' (no live category breakdown)');
  const emailBlock = [
    '',
    '--- EMAIL (mismo texto que el link aipa@ de arriba — backup si el link se trunca) ---',
    '',
    emailUnverified
      ? `<b>⚠️ TO UNVERIFIED</b> — fallback <code>info@${escHtml(domain)}</code>; confirm before Send.`
      : '',
    `SUBJECT: ${escHtml(emailSubject)}`,
    `TO: ${escHtml(contacts.email)}`,
    '',
    escHtml(emailBody),
  ];
  const noteHtml = [
    `[CLIENT-MANUAL] ${meta.company} — AI Visibility outreach (https links; data verified live)`,
    '',
    // Surfaced at the TOP: Elena must see a prior relationship before sending what would
    // otherwise read as a cold first-touch to someone who already knows her.
    ...(meta.noteFlag ? [`<b>⚠️ ${escHtml(meta.noteFlag)}</b>`, ''] : []),
    dualLinks,
    '',
    '--- MENSAJE WhatsApp (plain text) ---',
    '',
    escHtml(draft),
    ...emailBlock,
    '',
    auditNote ? '--- Audit (ASSERTED, not measured in this run) ---' : '--- Audit (verified live) ---',
    escHtml(auditLine),
    ...(auditNote ? [`<b>⚠️ ${escHtml(auditNote)}</b>`] : []),
    '',
    `Angle: "${credentialLetter ? 'audit is the CREDENTIAL — pivot to AI Growth Operator' : score >= CREDENTIAL_SCORE ? 'muy cerca — 3 arreglos' : 'invisible as citable answer'}". Money query: ${meta.moneyQuery}`,
    ...(meta.openToRoles
      ? [
          '',
          '<b>DUAL TRACK</b> — this letter also states Elena is open to roles (senior AI/automation, Panama or remote), once, after the paid ask. If they reply about a role, that is still a 💬 They replied. The follow-up does not repeat it.',
        ]
      : []),
    '',
    `Top fixes: ${meta.topFixes}.`,
    '',
    `Contacts: WhatsApp ${phoneDisplay} | ${contacts.email}${emailUnverified ? ' (UNVERIFIED)' : ''} | ${domain}`,
    '',
    'Next: Click WhatsApp OR aipa@ email one-click (prefilled → Send). If WA is a bot → use email. After send, say "sent {company}" so follow-up task is created (+4 days).',
  ].join('<br>');

  if (dryRun) {
    console.log('DRY_RUN dealName', dealName);
    console.log('DRAFT_PREVIEW', draft.slice(0, 200) + '...');
    console.log('WA', phoneDisplay, '| EMAIL', contacts.email, emailUnverified ? '(UNVERIFIED)' : '');
    return;
  }

  // --prepare-only: every artifact on disk, nothing in HubSpot. The pack carries the
  // note HTML verbatim, so the two send buttons can be reviewed (or pasted into a deal
  // by hand) exactly as the live path would post them.
  if (prepareOnly) {
    fs.writeFileSync(
      path.join(root, prospectPath),
      buildPack({
        company: meta.company,
        dealName,
        draftPath,
        emailDraftPath,
        slug,
        email: contacts.email,
        emailUnverified,
        emailOnlyOk: !!meta.emailOnlyOk,
        auditNote,
        ids: null,
        noteHtml,
      }),
      'utf8',
    );
    console.log(JSON.stringify({
      ok: true,
      mode: 'prepare-only',
      domain,
      dealName,
      email: contacts.email,
      emailUnverified,
      phone: phoneDisplay,
      draftPath,
      emailDraftPath,
      prospectPath,
      emailOneClick: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
      hubspot: 'not touched (--prepare-only)',
    }, null, 2));
    return;
  }

  // --update: refresh an already-staged prospect. Rewrites drafts + registry (done
  // above) and posts a corrected note; renames the deal if the offer label changed.
  // Never deletes the previous note — it stays in the deal history.
  if (updateDealId) {
    await hs('PATCH', `/crm/v3/objects/deals/${updateDealId}`, {
      properties: { dealname: dealName },
    });
    const upNote = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
    });
    await hs('PUT', `/crm/v4/objects/notes/${upNote.id}/associations/deals/${updateDealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
    ]);
    registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
      email: contacts.email,
      emailDraft: emailDraftPath,
      score,
      dealId: updateDealId,
    });
    fs.writeFileSync(
      path.join(root, prospectPath),
      buildPack({
        company: meta.company,
        dealName,
        draftPath,
        emailDraftPath,
        slug,
        email: contacts.email,
        emailUnverified,
        emailOnlyOk: !!meta.emailOnlyOk,
        auditNote,
        ids: { dealId: updateDealId, companyId: '—', contactId: '—', noteId: upNote.id, taskId: '—' },
        noteHtml,
      }),
      'utf8',
    );
    // The FU block lives at the top of the newest note, so it has to be reinstalled after
    // one is posted — otherwise --update silently buries the follow-up buttons.
    const upFu = withFu ? installFollowUp(updateDealId) : null;
    console.log(JSON.stringify({
      ok: true, mode: 'update', dealId: updateDealId, dealName, noteId: upNote.id,
      email: contacts.email, emailUnverified, audit: { score, grade },
      followUp: upFu || 'not installed (pass --with-fu)',
    }, null, 2));
    return;
  }

  // Company
  const companyId = await hs('POST', '/crm/v3/objects/companies', {
    properties: {
      name: meta.company,
      domain,
      website: url,
      city: meta.city,
      ...(phoneFmt ? { phone: phoneFmt } : {}),
      description: `Email: ${contacts.email}${emailUnverified ? ' (UNVERIFIED fallback)' : ''}${meta.emailOnlyOk ? ' | EMAIL-PRIMARY (no public WA)' : ''}`,
    },
  }).then(r => r.id);

  // Contact — always email + phone when available
  const contactProps = {
    firstname: meta.contactFirstName,
    lastname: meta.contactLastName,
    company: meta.company,
    ...(phoneFmt ? { phone: phoneFmt } : {}),
    email: contacts.email,
    lifecyclestage: 'opportunity',
    hs_lead_status: 'OPEN',
  };
  const contactId = await hs('POST', '/crm/v3/objects/contacts', { properties: contactProps }).then(r => r.id);

  // Deal — qualifiedtobuy = I Act TODAY
  const dealId = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
      hubspot_owner_id: HUBSPOT_OWNER_ID,
    },
  }).then(r => r.id);

  // Note
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);

  // Task 1 — send today, HIGH
  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send outreach → ${meta.company} (WhatsApp + email ready)`,
      hs_task_body:
        `1) Open deal note → WhatsApp link → Send. ` +
        `2) Or ENVIAR POR EMAIL — aipa@ → ${contacts.email}${emailUnverified ? ' (UNVERIFIED — confirm)' : ''}. ` +
        `Say "sent ${meta.company}" after WA (creates +4d follow-up); email one-click auto-advances + follow-up.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: HUBSPOT_OWNER_ID,
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);

  // Associations
  await hs('PUT', `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 },
  ]);
  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
  ]);
  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/companies/${companyId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 },
  ]);

  // Prospect pack + registry (email always present per playbook)
  registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
    email: contacts.email,
    emailDraft: emailDraftPath,
    score,
    dealId,
  });
  fs.writeFileSync(
    path.join(root, prospectPath),
    buildPack({
      company: meta.company,
      dealName,
      draftPath,
      emailDraftPath,
      slug,
      email: contacts.email,
      emailUnverified,
      emailOnlyOk: !!meta.emailOnlyOk,
      auditNote,
      ids: { dealId, companyId, contactId, noteId: note.id, taskId: task.id },
      noteHtml,
    }),
    'utf8',
  );

  // --with-fu closes the cycle in the same command: the follow-up installer writes the
  // FU WhatsApp + FU email drafts, registers the `{slug}-fu` row and puts both FU
  // buttons at the top of the note. Without it the deal ships with first-contact
  // buttons only and someone has to remember a second command.
  const fuResult = withFu ? installFollowUp(dealId) : null;

  console.log(JSON.stringify({
    ok: true,
    domain,
    dealId,
    dealName,
    companyId,
    contactId,
    noteId: note.id,
    taskId: task.id,
    email: contacts.email,
    emailUnverified,
    emailOnlyOk: !!meta.emailOnlyOk,
    audit: { score, grade, weak, ...(auditNote ? { warning: auditNote } : {}) },
    phone: phoneDisplay,
    draftPath,
    emailDraftPath,
    prospectPath,
    followUp: fuResult || 'not installed (pass --with-fu)',
    emailOneClick: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
  }, null, 2));
  console.warn('');
  console.warn('⚠️  EMAIL ONE-CLICK requires GitHub push (else UI: Unknown outreach email slug):');
  console.warn(`    git add docs/selling/outreach-registry.json docs/selling/drafts/${slug}*.txt ${prospectPath}`);
  console.warn('    git commit && git push origin main');
  console.warn('    Oracle: cd ~/cto-aipa && git pull && npm run build && pm2 restart cto-aipa');
  console.warn('    (After go-wa GitHub fallback is deployed: push alone is enough for confirm page.)');
  console.warn('');
})().catch(e => {
  console.error(String(e.message || e));
  process.exit(1);
});
