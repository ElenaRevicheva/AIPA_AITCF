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
if (!HS || !SERP || !VIS) throw new Error('need HUBSPOT_API_KEY + SERPAPI_KEY + VISIBILITY_API_KEY');

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
  const pool = onDomain.length ? onDomain : clean;
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
      concept_id: c.tracking?.concept_id || null,
      hook: c.concept.hook || c.concept.HOOK || null,
      angle: c.move?.angle || null,
      score: c.move?.score ?? null,
    };
  } catch {
    return null;
  }
}

function buildDraft(lead, audit, angle) {
  const subject = `Auditoría de visibilidad en IA — ${lead.company} (${audit.score}/100): 3 arreglos concretos`;
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA y automatización aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    `Analicé ${lead.website} con mi motor de visibilidad en IA y obtuvo ${audit.score}/100 (${audit.grade}).`,
    ``,
    `Cuando un cliente le pregunta a ChatGPT o Perplexity por opciones como la suya en ${lead.city}, su negocio todavía no aparece como una respuesta citable. No es un problema de diseño ni de publicidad: los motores de IA no encuentran la estructura que necesitan para citarlos.`,
    ``,
    `Son 3 arreglos concretos y de implementación rápida. Si les parece bien, se los muestro en 15 minutos, sin ningún compromiso.`,
    ``,
    `La auditoría completa es gratuita aquí: https://aideazz.xyz/api`,
    ``,
    `Saludos cordiales,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
    ``,
    `PD: ${angle?.hook ? angle.hook : 'Quien aparece primero en la respuesta de la IA se queda con la consulta — y hoy ese lugar sigue libre en su categoría.'}`,
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
  const { subject, body } = buildDraft(lead, audit, angle);

  const dealName = `[CLIENT-ATLAS] ${lead.company} — GEO/AEO fix (audit: ${audit.score}/${audit.grade})`;
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

  const reg = loadRegistry();
  reg[slug] = {
    company: lead.company,
    email: lead.email,
    emailDraft: draftRel,
    score: audit.score,
    ...(deal?.id ? { dealId: String(deal.id) } : {}),
    ...(lead.phone ? { phone: digitsOnly(lead.phone), draft: waRel } : {}),
  };
  saveRegistry(reg);

  const link = buildHubSpotEmailAnchor(slug, lead.email, `✉️ ENVIAR PRIMER CONTACTO — aipa@aideazz.xyz (${lead.email})`);
  const waLink = lead.phone
    ? buildHubSpotWaAnchor(lead.phone, waText, `➡️ WHATSAPP (laptop) — auditoría ${audit.score}/100 (${formatPhone507(lead.phone)})`)
    : null;
  const noteBody = [
    `<b>🔥 NUEVO LEAD — Atlas lead machine</b><br>`,
    `${link}<br>`,
    waLink ? `${waLink}<br><br>` : `<br>`,
    `<b>Auditoría:</b> ${audit.score}/100 ${audit.grade}`,
    audit.aeo != null ? ` · AEO ${audit.aeo}` : '',
    `<br><b>Sitio:</b> ${lead.website}<br>`,
    `<b>Email:</b> ${lead.email}<br>`,
    lead.phone ? `<b>Tel:</b> ${lead.phone}<br>` : '',
    lead.rating ? `<b>Google:</b> ${lead.rating}★ (${lead.reviews || 0} reseñas)<br>` : '',
    `<b>Ciudad:</b> ${lead.city}<br>`,
    angle?.concept_id ? `<b>Atlas:</b> ${angle.angle || ''} · ${angle.concept_id}<br>` : '',
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

(async () => {
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
