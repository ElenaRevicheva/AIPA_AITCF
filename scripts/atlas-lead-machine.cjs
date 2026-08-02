#!/usr/bin/env node
/**
 * Atlas lead machine — turn Atlas lanes into REAL leads, contacts and stages.
 *
 * Why (Aug 1 2026, Elena): the Monday Atlas cycle detected windows, wrote creative,
 * and then asked her by Telegram to "adapt it into a campaign" — work that never got
 * done, so the loop earned nothing. Meanwhile the pool it could act on was 96 already
 * contacted prospects at a 1% reply rate. Reporting that harder does not make money;
 * new qualified humans entering the funnel might.
 *
 * Supply: SerpAPI's google_maps engine (Starter plan, already paid for) returns local
 * businesses WITH website + phone — the same shape Google Places gives, without the
 * missing GOOGLE_PLACES_API_KEY. Emails come from the business's own contact page, so
 * Hunter's 50/month free cap is never touched.
 *
 * Every lead is qualified before it is allowed into the CRM:
 *   - has a real website and a real email on that domain
 *   - scores inside AUDIT_BAND on Elena's own visibility audit (bad enough to need
 *     her, real enough to be a business that pays)
 *   - is not already a contact in HubSpot
 * Anything failing a check is counted and dropped, never guessed at.
 *
 * What lands in HubSpot per accepted lead:
 *   contact + deal "[CLIENT-ATLAS] {company} — GEO/AEO fix (audit: NN/G)"
 *   at stage qualifiedtobuy (🔥 I Act TODAY), with a note carrying the audit, the
 *   Atlas angle for that lane, and the ONE-CLICK send link. Elena reviews and taps —
 *   nothing is emailed by this script.
 *
 * Deliberately does NOT send. Yesterday proved a wrong premise can put 44 emails in
 * flight before anyone notices; the human gate stays.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  slugify,
  loadRegistry,
  saveRegistry,
  buildHubSpotEmailAnchor,
  buildHubSpotWaAnchor,
  digitsOnly,
  formatPhone507,
} = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();

const HS = g('HUBSPOT_API_KEY');
const SERP = g('SERPAPI_KEY');
const VIS = g('VISIBILITY_API_KEY');
const TG = g('TELEGRAM_BOT_TOKEN');
const CHAT = g('CONCIERGE_TG_CHAT') || (g('TELEGRAM_AUTHORIZED_USERS') || '').split(',')[0]?.trim();
const OWNER = g('HUBSPOT_OWNER_ID') || '91612860';
// Only a hard requirement when actually mining. Importing this module for its
// letter templates must not demand API keys the importer will never call.
if (require.main === module && (!HS || !SERP || !VIS)) {
  throw new Error('need HUBSPOT_API_KEY + SERPAPI_KEY + VISIBILITY_API_KEY');
}

const DRY = process.argv.includes('--dry');
const MAX_NEW = Number(process.env.LEAD_MAX_NEW || 8);
/** Below 35 the site is usually broken/parked; above 90 there is no problem to sell. */
const AUDIT_MIN = Number(process.env.LEAD_AUDIT_MIN || 35);
const AUDIT_MAX = Number(process.env.LEAD_AUDIT_MAX || 90);
const STAGE_ACT_TODAY = 'qualifiedtobuy'; // 🔥 I Act TODAY

/** Panama + LATAM verticals that match the offer Elena already sells. ll = geo bias. */
const TARGETS = [
  { q: 'clínica dental', ll: '@8.9824,-79.5199,12z', city: 'Panama City' },
  { q: 'hotel boutique', ll: '@8.9824,-79.5199,12z', city: 'Panama City' },
  { q: 'bufete de abogados', ll: '@8.9824,-79.5199,12z', city: 'Panama City' },
  { q: 'clínica estética', ll: '@8.9824,-79.5199,12z', city: 'Panama City' },
  { q: 'tours y excursiones', ll: '@9.3400,-82.2419,12z', city: 'Bocas del Toro' },
  { q: 'hotel', ll: '@8.4333,-82.4333,12z', city: 'Boquete' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, p, body, attempt = 0) {
  const init = { method, headers: { Authorization: `Bearer ${HS}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (r.status === 429 && attempt < 6) {
    await sleep(1500 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`HubSpot ${r.status} ${p} ${t.slice(0, 160)}`);
  }
  return t ? JSON.parse(t) : null;
}

/** Businesses with a website, from the maps engine — same data shape Places returns. */
async function mapsSearch(target) {
  const u =
    `https://serpapi.com/search.json?engine=google_maps&type=search` +
    `&q=${encodeURIComponent(target.q)}&ll=${encodeURIComponent(target.ll)}&hl=es&api_key=${SERP}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`SerpAPI ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`SerpAPI: ${d.error}`);
  return (d.local_results || [])
    .filter((x) => x.website && x.title)
    .map((x) => ({
      company: String(x.title).trim(),
      website: String(x.website).trim(),
      phone: x.phone ? String(x.phone).trim() : null,
      rating: x.rating ?? null,
      reviews: x.reviews ?? null,
      city: target.city,
    }));
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Addresses that are never a real inbox for a business owner. */
const JUNK_EMAIL =
  /(sentry|wixpress|example|yourdomain|domain\.com|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|godaddy|squarespace|wordpress|cloudflare)/i;

function pickBestEmail(emails, domain) {
  const clean = [...new Set(emails)].filter((e) => !JUNK_EMAIL.test(e) && e.length < 70);
  const onDomain = clean.filter((e) => e.toLowerCase().endsWith(`@${domain}`));
  // Off-domain fallback is only safe for personal/ISP inboxes, which small LATAM
  // businesses genuinely use. An arbitrary OTHER COMPANY's address on the page is
  // a third-party widget, not the prospect — caught live when a Panama dental
  // clinic yielded contacto@soft99chile.cl, a Chilean company. Emailing that is
  // worse than finding nothing: it is a stranger receiving a pitch about someone
  // else's website.
  const PERSONAL = /@(gmail|hotmail|outlook|yahoo|live|icloud|proton(mail)?|cableonda|cwpanama|.*\.movil)\./i;
  const offDomainSafe = clean.filter((e) => PERSONAL.test(e));
  const pool = onDomain.length ? onDomain : offDomainSafe;
  // Prefer a role inbox someone actually reads over a random personal address.
  const preferred = pool.find((e) => /^(info|contacto|contact|ventas|sales|hola|reservas|reservations|admin|citas)@/i.test(e));
  const picked = preferred || pool[0] || null;
  // Normalise: sites publish INFO@EXAMPLE.COM, and a case-mismatched address
  // creates a duplicate contact instead of matching the existing one.
  return picked ? picked.toLowerCase() : null;
}

/** Read the business's own site for a contact address — no Hunter, no quota. */
async function findEmail(website) {
  let domain;
  try {
    domain = new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const pages = ['', '/contact', '/contacto', '/contact-us', '/contactenos', '/about', '/nosotros'];
  const found = [];
  for (const p of pages) {
    try {
      const r = await fetch(new URL(p, website).toString(), {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIdeazzBot/1.0; +https://aideazz.xyz)' },
      });
      if (!r.ok) continue;
      const html = await r.text();
      const hits = html.match(EMAIL_RE) || [];
      found.push(...hits);
      // mailto: links are the most reliable signal a human put there on purpose
      const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => m[1]);
      found.push(...mailtos);
      if (found.length) break; // first page that yields anything is enough
    } catch {
      /* unreachable page — try the next */
    }
  }
  return pickBestEmail(found, domain);
}

async function auditSite(url) {
  try {
    const r = await fetch('https://webhook.aideazz.xyz/cto/v1/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': VIS },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (typeof d.score !== 'number') return null;
    return { score: d.score, grade: d.grade || '', aeo: d.aeo ?? null, geo: d.geo ?? null };
  } catch {
    return null;
  }
}

/**
 * Company-name fingerprint for dedup.
 *
 * Exact-email matching is not enough: the dry run surfaced "Centro Odontologico
 * Paitilla", already a [CLIENT-MANUAL] deal, whose site advertises an address one
 * typo away from the one in HubSpot ("odontolologico"). Matching on the accent- and
 * punctuation-stripped name catches the same business however its address is spelled,
 * so an already-worked prospect is never re-created as a fresh lead.
 */
function fingerprint(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: Odontológico -> Odontologico
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|los|las|del|para|clinica|centro|hotel|dental|spa|inc|sa|srl)$/.test(w))
    .slice(0, 3)
    .join('-');
}

/** Every company already in the CRM or the outreach registry — built once per run. */
async function loadKnown() {
  const names = new Set();
  const domains = new Set();
  for (const prefix of ['CLIENT-MANUAL', 'CLIENT-ATLAS', 'CLIENT-CTO-INGEST', 'CLIENT-CTO-SERP']) {
    let after = null;
    do {
      const body = {
        filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
        properties: ['dealname'],
        limit: 100,
      };
      if (after) body.after = after;
      const d = await hs('POST', '/crm/v3/objects/deals/search', body);
      for (const deal of d?.results || []) {
        const raw = (deal.properties?.dealname || '').replace(/^\[[^\]]+\]\s*/, '').replace(/ — .*$/, '');
        const fp = fingerprint(raw);
        if (fp) names.add(fp);
      }
      after = d?.paging?.next?.after || null;
    } while (after);
  }
  const reg = loadRegistry();
  for (const v of Object.values(reg)) {
    if (v?.company) {
      const fp = fingerprint(v.company);
      if (fp) names.add(fp);
    }
    if (v?.email) {
      const dom = String(v.email).split('@')[1];
      if (dom) domains.add(dom.toLowerCase());
    }
  }
  return { names, domains };
}

async function contactExists(email) {
  const d = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email'],
    limit: 1,
  });
  return !!(d && d.total > 0);
}

/** The Atlas angle for this lane — grounded in real competitor ads, refreshed weekly. */
function atlasAngle(lane = 'geo_aeo_tech_seo_makers') {
  try {
    const p = '/home/ubuntu/whitespace/data/concepts.json';
    if (!fs.existsSync(p)) return null;
    const c = JSON.parse(fs.readFileSync(p, 'utf8'))[lane];
    if (!c || !c.concept) return null;
    return {
      lane,
      concept_id: c.tracking?.concept_id || null,
      hook: c.concept.hook || c.concept.HOOK || null,
      angle: c.move?.angle || null,
      score: c.move?.score ?? null,
      snapshot: c.snapshot_date || null,
    };
  } catch {
    return null;
  }
}

/**
 * Atlas writes its creative in English ("The Crowd Doesn't Lie"); these prospects
 * are Panamanian businesses who get a Spanish email. Pasting the English hook in
 * would read as machine-translated spam, so the ANGLE TYPE — which is the part
 * Atlas actually derives from live competitor ads — selects a real Spanish framing.
 * The audit stays the substance; only the way in changes.
 *
 * Because Atlas rewrites the angle every Monday, each weekly batch tests a
 * different opening, and the angle is stamped on the deal so replies can be
 * attributed back to it.
 */
const ANGLE_ES = {
  social_proof: {
    subject: (c, s) => `${c}: cómo aparecer en ChatGPT cuando le preguntan por su sector (${s}/100)`,
    opening: (city) =>
      `Cada vez más negocios en ${city} están apareciendo como respuesta cuando alguien le pregunta a ChatGPT o Perplexity por opciones en su sector. Otros no aparecen en absoluto — y esa diferencia ya se nota en quién recibe la consulta.`,
  },
  pain_point: {
    subject: (c, s) => `${c} no aparece cuando preguntan a ChatGPT (auditoría: ${s}/100)`,
    opening: (city) =>
      `Cuando un cliente potencial le pregunta a ChatGPT o Perplexity por opciones en ${city}, su negocio todavía no aparece como respuesta citable. La consulta existe; simplemente la recibe otro.`,
  },
  curiosity_gap: {
    subject: (c, s) => `Hay algo que su web no le está diciendo a ChatGPT — ${c} (${s}/100)`,
    opening: () =>
      `Su sitio está bien hecho para personas, pero le falta la estructura que los motores de IA necesitan para citarlo. Es un detalle técnico invisible en pantalla y decisivo en la respuesta.`,
  },
  urgency_scarcity: {
    subject: (c, s) => `${c}: el lugar en la respuesta de la IA se está ocupando ahora (${s}/100)`,
    opening: (city) =>
      `En ${city} casi nadie ha optimizado todavía para búsquedas con IA — por eso el lugar en la respuesta sigue libre. Cuando sus competidores lo hagan, recuperarlo cuesta mucho más que tomarlo hoy.`,
  },
  authority: {
    subject: (c, s) => `Auditoría de visibilidad en IA — ${c} (${s}/100): 3 arreglos concretos`,
    opening: (city) =>
      `Analizo cómo aparecen los negocios de ${city} en los motores de respuesta con IA. El suyo tiene una base sólida y tres huecos concretos que lo dejan fuera de la respuesta.`,
  },
};
const ANGLE_FALLBACK = 'authority';

/**
 * The services PD — the closing line every [CLIENT-MANUAL] letter carries and the
 * first Atlas letters did not (Elena, Aug 2 2026).
 *
 * The audit opens the door; the PD is what tells them she does more than SEO. It is
 * deliberately TAILORED per industry — a dental clinic hears "agenda citas y responde
 * urgencias", a hotel hears "reservas y eventos" — because a generic services list
 * reads like a brochure and gets skipped. Rule from her outreach doctrine: always
 * link aideazz.xyz/portfolio, never bare aideazz.xyz.
 */
const SERVICES_PD = {
  dental:
    'agentes de WhatsApp que responden y agendan citas 24/7 (EN/ES, conectados a su CRM), recordatorios automáticos para bajar ausencias, automatización de intake de pacientes, y video con IA para promocionar tratamientos',
  hotel:
    'agentes de WhatsApp que responden y agendan reservas y eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de grupos, y video con IA para marketing del destino',
  legal:
    'agentes de WhatsApp que califican consultas y agendan citas 24/7 (EN/ES, conectados a su CRM), automatización de intake de casos, y rescate de sistemas de IA que fallan',
  estetica:
    'agentes de WhatsApp que responden y agendan valoraciones 24/7 (EN/ES, conectados a su CRM), seguimiento automático de pacientes, y video con IA para mostrar resultados',
  tours:
    'agentes de WhatsApp que responden y reservan tours 24/7 (EN/ES, conectados a su CRM), automatización de disponibilidad y cupos, y video con IA para promocionar experiencias',
  default:
    'agentes de WhatsApp que responden y agendan 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan',
};

function servicesPD(lead) {
  const q = `${lead.query || ''} ${lead.company || ''}`.toLowerCase();
  const key = /dental|odonto|dentist/.test(q)
    ? 'dental'
    : /hotel|resort|hostal|lodge/.test(q)
      ? 'hotel'
      : /abogad|bufete|legal|law/.test(q)
        ? 'legal'
        : /estétic|estetic|spa|derma|belleza/.test(q)
          ? 'estetica'
          : /tour|excursion|viaje|charter|sail/.test(q)
            ? 'tours'
            : 'default';
  return `PD: Además de visibilidad en IA, construyo ${SERVICES_PD[key]}. Todo con demos en vivo en mi portafolio 👆`;
}

function buildDraft(lead, audit, angle) {
  const angleKey = angle?.angle && ANGLE_ES[angle.angle] ? angle.angle : ANGLE_FALLBACK;
  const v = ANGLE_ES[angleKey];
  const subject = v.subject(lead.company, audit.score);
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA y automatización aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    v.opening(lead.city),
    ``,
    `Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}).`,
    ...(audit.aeo != null
      ? [`Su punto más débil es la respuesta-a-preguntas (AEO ${audit.aeo}/100) — y es el más rápido de arreglar.`]
      : []),
    ``,
    `Son 3 arreglos concretos y de implementación rápida. Si les parece bien, se los muestro en 15 minutos, sin ningún compromiso.`,
    ``,
    `La auditoría completa es gratuita aquí: https://aideazz.xyz/api`,
    ``,
    servicesPD(lead),
    ``,
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');
  return { subject, body, angleKey };
}

/**
 * Second touch, mirroring the [CLIENT-MANUAL] follow-up exactly.
 *
 * Its PD is the AI Growth Operator paragraph — the manual FU's closing move: it
 * reframes her from "someone who audits websites" to "someone who runs the whole
 * growth motion", which is the pitch that actually carries a retainer. Says
 * plainly that a previous EMAIL was sent, so it is only ever registered for leads
 * whose first outreach really went by email.
 */
function buildFuDraft(lead, audit, angle) {
  const subject = `Seguimiento — auditoría de visibilidad en IA: ${lead.company} (${audit.score}/100)`;
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí hace unos días por correo sobre ${lead.company}. Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}). Cuando un cliente pregunta a ChatGPT o Perplexity por opciones como la suya en ${lead.city}, su empresa todavía no aparece como una respuesta citable${audit.aeo != null ? ` (AEO ${audit.aeo}/100)` : ''}.`,
    ``,
    `No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.`,
    ``,
    `Si les sirve, en 15 minutos les muestro los 3 principales arreglos de esa auditoría y cómo quedaría el Operator en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    ``,
    servicesPD(lead),
    ``,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');
  return { subject, body };
}

async function stageLead(lead, audit, angle) {
  // Truncate the NAME, then append the marker — slicing the joined string cut the
  // "-atlas" off any company whose name ran past 54 chars (caught live on
  // "Odontologo Moisés Lukowiecki - Urgencia y Clínica Dental 24 Horas"), and two
  // long names sharing a prefix would collide onto one slug and overwrite each
  // other's draft.
  const slug = `${slugify(lead.company).slice(0, 48)}-atlas`;
  const draftRel = `docs/selling/drafts/${slug}-email.txt`;
  const { subject, body, angleKey } = buildDraft(lead, audit, angle);

  // The angle rides in the deal NAME because HubSpot custom properties 403 on this
  // plan (aideazz_lead_kind failed the same way). hs-outcomes-to-atlas.cjs already
  // parses deal names, so a " · angle" suffix is all it needs to report reply rate
  // PER ANGLE — the number that tells Elena which opening actually earns.
  const dealName = `[CLIENT-ATLAS] ${lead.company} — GEO/AEO fix (audit: ${audit.score}/${audit.grade}) · ${angleKey}`;
  if (DRY) return { slug, dealName, dealId: null };

  fs.mkdirSync(path.join(ROOT, 'docs/selling/drafts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, draftRel), `SUBJECT: ${subject}\n\nTO: ${lead.email}\n\n${body}\n`, 'utf8');

  // Contact + deal FIRST. The registry entry must carry dealId: go-wa.ts gates the
  // whole post-send chain on it — `if (!key || !p.dealId) return;` — so without it
  // a send moves no stage, writes no ENTREGADO/ABIERTO stamp, and creates no
  // follow-up task. Writing the registry before the deal existed is exactly why the
  // first three Atlas leads looked dead after Elena clicked send.
  const contact = await hs('POST', '/crm/v3/objects/contacts', {
    properties: {
      email: lead.email,
      company: lead.company,
      website: lead.website,
      ...(lead.phone ? { phone: lead.phone } : {}),
      hs_lead_status: 'NEW',
    },
  });
  const deal = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: STAGE_ACT_TODAY,
      pipeline: 'default',
      hubspot_owner_id: OWNER,
    },
  });
  if (contact?.id && deal?.id) {
    await hs('PUT', `/crm/v4/objects/deals/${deal.id}/associations/default/contacts/${contact.id}`, undefined).catch(
      () => {},
    );
  }

  // WhatsApp draft — same play as [CLIENT-MANUAL]: email is the tracked channel,
  // WhatsApp is Elena's laptop-only close. Registry needs digits-only phone.
  const waRel = `docs/selling/drafts/${slug}.txt`;
  const waText = [
    `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    `Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}).`,
    `Cuando alguien le pregunta a ChatGPT por opciones como la suya en ${lead.city}, su negocio todavía no aparece como respuesta citable.`,
    ``,
    `Son 3 arreglos concretos. ¿Les muestro en 15 minutos, sin compromiso? Auditoría gratuita: https://aideazz.xyz/api`,
  ].join('\n');
  if (lead.phone) fs.writeFileSync(path.join(ROOT, waRel), waText, 'utf8');

  // ── Second touch, staged up front ────────────────────────────────────────────
  // [CLIENT-MANUAL] deals carry BOTH touches in the note from day one, so the FU is
  // one click whenever Elena decides the first went unanswered. Atlas leads had no
  // FU slug at all, which meant a second touch required building one by hand — the
  // exact manual step that stops it from ever happening.
  const fuSlug = `${slug}-fu`;
  const fuRel = `docs/selling/drafts/${fuSlug}-email.txt`;
  const fuWaRel = `docs/selling/drafts/${fuSlug}.txt`;
  const fu = buildFuDraft(lead, audit, angle);
  fs.writeFileSync(path.join(ROOT, fuRel), `SUBJECT: ${fu.subject}\n\nTO: ${lead.email}\n\n${fu.body}\n`, 'utf8');
  const fuWaText = [
    `Hola de nuevo 👋 Soy Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
    ``,
    `Les escribí sobre la auditoría de ${lead.website}: ${audit.score}/100 (${audit.grade}).`,
    `No vendo otro chatbot — instalo un AI Growth Operator que trabaja 24/7: que ChatGPT los recomiende, califique leads por WhatsApp y mantenga el CRM al día.`,
    ``,
    `¿Les muestro en 15 minutos, sin compromiso? Auditoría gratuita: https://aideazz.xyz/api`,
  ].join('\n');
  if (lead.phone) fs.writeFileSync(path.join(ROOT, fuWaRel), fuWaText, 'utf8');

  const reg = loadRegistry();
  const common = {
    company: lead.company,
    email: lead.email,
    score: audit.score,
    ...(deal?.id ? { dealId: String(deal.id) } : {}),
    ...(lead.phone ? { phone: digitsOnly(lead.phone) } : {}),
  };
  reg[slug] = { ...common, emailDraft: draftRel, ...(lead.phone ? { draft: waRel } : {}) };
  reg[fuSlug] = { ...common, emailDraft: fuRel, ...(lead.phone ? { draft: fuWaRel } : {}) };
  saveRegistry(reg);

  // Labels matter beyond cosmetics: resend-webhook's findOutreachNote matches
  // /FOLLOW-UP|EMAIL FU|WHATSAPP FU|.../ to pick WHICH note to stamp, and
  // insertNoteStamp puts ENTREGADO/ABIERTO directly under the FOLLOW-UP block's
  // first <hr>. The old "ENVIAR PRIMER CONTACTO" heading matched nothing, so
  // stamps would have landed at the top of the note instead of under the buttons.
  const link = buildHubSpotEmailAnchor(slug, lead.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${lead.email})`);
  const waLink = lead.phone
    ? buildHubSpotWaAnchor(lead.phone, waText, `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${audit.score}/100 (${formatPhone507(lead.phone)})`)
    : null;
  const fuLink = buildHubSpotEmailAnchor(fuSlug, lead.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${lead.email})`);
  const fuWaLink = lead.phone
    ? buildHubSpotWaAnchor(lead.phone, fuWaText, `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(lead.phone)})`)
    : null;
  const noteBody = [
    `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
    `${link}<br>`,
    waLink ? `${waLink}<br>` : '',
    `${fuLink}<br>`,
    fuWaLink ? `${fuWaLink}<br><br>` : `<br>`,
    `<b>🔥 NUEVO LEAD — Atlas lead machine</b><br>`,
    `<b>Auditoría:</b> ${audit.score}/100 ${audit.grade}`,
    audit.aeo != null ? ` · AEO ${audit.aeo}` : '',
    `<br><b>Sitio:</b> ${lead.website}<br>`,
    `<b>Email:</b> ${lead.email}<br>`,
    lead.phone ? `<b>Tel:</b> ${lead.phone}<br>` : '',
    lead.rating ? `<b>Google:</b> ${lead.rating}★ (${lead.reviews || 0} reseñas)<br>` : '',
    `<b>Ciudad:</b> ${lead.city}<br>`,
    angle?.concept_id
      ? `<b>Atlas:</b> ángulo <code>${angleKey}</code> · lane ${angle.lane || '-'} · score ${angle.score ?? '-'} · snapshot ${angle.snapshot || '-'}<br><b>concept_id:</b> ${angle.concept_id}<br>`
      : `<b>Atlas:</b> ángulo <code>${angleKey}</code> (sin concepto fresco — fallback)<br>`,
    `<hr>`,
    `<b>Asunto:</b> ${subject}<br><br>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${body.replace(/</g, '&lt;')}</pre>`,
  ].join('');
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteBody, hs_timestamp: Date.now() },
  });
  if (note?.id && deal?.id) {
    await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/default/deals/${deal.id}`, undefined).catch(() => {});
  }
  return { slug, dealName, dealId: deal?.id || null };
}

async function telegram(text) {
  if (!TG || !CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4090), disable_web_page_preview: true }),
    });
  } catch {
    /* best effort */
  }
}

// Only run when executed directly. Without this, `require`-ing the module to reuse
// its letter templates would fire the whole machine — Google searches, audits, and
// real HubSpot contacts and deals — as an import side effect.
if (require.main === module) (async () => {
  const angle = atlasAngle();
  console.log(
    `[lead-machine] start${DRY ? ' (DRY RUN — nothing written)' : ''} · max ${MAX_NEW} · band ${AUDIT_MIN}-${AUDIT_MAX}` +
      (angle ? ` · atlas angle: ${angle.angle} (${angle.score})` : ' · no atlas angle'),
  );
  const known = await loadKnown();
  console.log(`[lead-machine] dedup set: ${known.names.size} companies, ${known.domains.size} domains already worked`);
  const staged = [];
  const skip = { noEmail: 0, dupe: 0, band: 0, noAudit: 0, seen: 0 };

  for (const target of TARGETS) {
    if (staged.length >= MAX_NEW) break;
    let businesses = [];
    try {
      businesses = await mapsSearch(target);
    } catch (e) {
      console.warn(`[lead-machine] serp "${target.q}" failed: ${String(e.message).slice(0, 90)}`);
      continue;
    }
    console.log(`[lead-machine] ${target.city} · "${target.q}" → ${businesses.length} with a website`);

    for (const b of businesses) {
      if (staged.length >= MAX_NEW) break;
      skip.seen++;
      // Cheapest checks first: never spend a scrape or an audit on a business
      // Elena has already worked.
      const fp = fingerprint(b.company);
      let domain = '';
      try {
        domain = new URL(b.website).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        /* handled below by findEmail */
      }
      if ((fp && known.names.has(fp)) || (domain && known.domains.has(domain))) {
        skip.dupe++;
        console.log(`   ↺ ${b.company.slice(0, 34)} — already in the CRM, skipped`);
        continue;
      }
      const email = await findEmail(b.website);
      if (!email) {
        skip.noEmail++;
        continue;
      }
      if (await contactExists(email)) {
        skip.dupe++;
        continue;
      }
      // Remember within this run too, so two branches of the same chain don't
      // both get staged.
      if (fp) known.names.add(fp);
      if (domain) known.domains.add(domain);
      const audit = await auditSite(b.website);
      if (!audit) {
        skip.noAudit++;
        continue;
      }
      if (audit.score < AUDIT_MIN || audit.score > AUDIT_MAX) {
        skip.band++;
        console.log(`   ✗ ${b.company.slice(0, 30)} — ${audit.score}/100 outside band`);
        continue;
      }
      const r = await stageLead({ ...b, email }, audit, angle);
      staged.push({ ...b, email, score: audit.score, grade: audit.grade, ...r });
      console.log(`   ✅ ${b.company.slice(0, 32)} · ${audit.score}/${audit.grade} · ${email}`);
      await sleep(400);
    }
  }

  console.log(
    `[lead-machine] done · staged ${staged.length} · looked at ${skip.seen} · ` +
      `no-email ${skip.noEmail} · already-in-CRM ${skip.dupe} · outside-band ${skip.band} · audit-failed ${skip.noAudit}`,
  );

  if (staged.length && !DRY) {
    const lines = [
      `🔥 ${staged.length} nuevos leads listos — 🔥 I Act TODAY`,
      ``,
      ...staged.map((s) => `· ${s.company} — ${s.score}/${s.grade} · ${s.city}`),
      ``,
      `Cada uno ya tiene contacto, deal y el botón ENVIAR en la nota de HubSpot.`,
      `Revisa y envía: https://app.hubspot.com/contacts/51409153/objects/0-3/views/all/list`,
    ];
    await telegram(lines.join('\n'));
  }
})();

/**
 * Exported so the one-off backfill writes the SAME letters this machine writes.
 * Copy-pasting the templates into a second script guarantees they drift apart, and
 * the drift only surfaces when a prospect gets a letter nobody reviewed.
 * Guarded by require.main so exporting never triggers the run above.
 */
module.exports = { buildDraft, buildFuDraft, servicesPD, atlasAngle, ANGLE_ES, ANGLE_FALLBACK };
