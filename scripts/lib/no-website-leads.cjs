/**
 * no-website-leads.cjs — the businesses Atlas's Google Places search already returns
 * WITHOUT a website (or with only an Instagram/Facebook page as their "website").
 *
 * Elena, 13 Oct 2026: on top of the 8 regular leads, stage the best 2 of these every
 * Monday as HubSpot deals, and name them in the Telegram summary. Max 10 deals a week.
 * Atlas used to throw them away (mapsSearch kept only results with websiteUri). These are
 * the Business Identity Audit pilot's shape: docs/selling/BUSINESS_IDENTITY_AUDIT_MVP_SPEC_2026-10-13.md
 *
 * Pure functions only — no network, no HubSpot. Tested by scripts/test-no-website-leads.cjs.
 * The ONLY claim the message makes is the one Places proves: the Google profile has no
 * website (or links a social page instead). It never says "no website exists" — Google
 * sometimes just does not link one (Panama Yacht Adventures, 12 Oct), so the note asks
 * Elena to search the name once before sending.
 */
const { buildHubSpotWaAnchor } = require('../wa-link-lib.cjs');

const MIN_REVIEWS = 5;

/** A social page given as the Google "website" — the business has no site of its own. */
const SOCIAL_PRESENCE = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)linktr\.ee$/, 'Linktree'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
];

function socialPlatform(url) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
    for (const [re, name] of SOCIAL_PRESENCE) if (re.test(host)) return name;
  } catch {
    /* not a URL */
  }
  return null;
}

const CLINIC_TYPE = /dent|doctor|clinic|hospital|surgeon|medical|physio|orthodont|dermatolog/i;
const isClinic = (c) => CLINIC_TYPE.test(`${c.primaryType || ''} ${c.query || ''}`);

/**
 * The best `max` candidates: high-ticket queries only, a phone to message, at least
 * MIN_REVIEWS Google reviews ("strong" = a real business with customers), not already in
 * the CRM (Atlas's own fingerprint set, which holds every CLIENT-MANUAL/CLIENT-ATLAS deal),
 * most reviews first.
 */
function pickNoWebsite(candidates, knownNames, fingerprint, max) {
  if (!(max > 0)) return [];
  const seen = new Set();
  return candidates
    .filter((c) => c && c.highTicket && c.phone && (c.reviews || 0) >= MIN_REVIEWS && c.company)
    .sort((a, b) => (b.reviews || 0) - (a.reviews || 0) || (b.rating || 0) - (a.rating || 0))
    .filter((c) => {
      const fp = fingerprint(c.company);
      if (!fp || knownNames.has(fp) || seen.has(fp)) return false;
      seen.add(fp);
      return true;
    })
    .slice(0, max);
}

/** Permission-first first contact (ES). Asks before sending anything. */
function buildNoWebsiteWa(c) {
  const what = isClinic(c) ? 'su clínica' : 'su negocio';
  const rep =
    (c.reviews || 0) >= 10 && c.rating
      ? ` Tienen ${String(c.rating).replace('.', ',')}★ con ${c.reviews} reseñas en Google${c.rating >= 4.5 ? ': muy buena reputación' : ''}.`
      : '';
  const gap = c.presence
    ? `su perfil de Google enlaza a su ${socialPlatform(c.presence) || 'red social'} en lugar de un sitio web propio`
    : 'su perfil de Google no tiene sitio web';
  return (
    `Hola, equipo de ${c.company}. Soy Elena, de AIdeazz AI Lab.${rep}\n\n` +
    `Revisé cómo aparece ${what} en internet y encontré algo útil: ${gap}. ` +
    `Así, Google y asistentes como ChatGPT tienen poca información propia suya para mostrar a quienes buscan sus servicios.\n\n` +
    `¿Le puedo enviar un resumen gratuito de 1 página con lo que encontré y cómo corregirlo?\n\n` +
    `Elena · AIdeazz AI Lab · aideazz.xyz/portfolio\n` +
    `PD: también creamos asistentes de WhatsApp bilingües que responden y agendan a sus clientes 24/7.`
  );
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

/** The deal note: send button, message, evidence, empty identity matrix, approval gates. */
function buildNoWebsiteNote(c, { isMobile, date }) {
  const msg = buildNoWebsiteWa(c);
  const btn = buildHubSpotWaAnchor(
    c.phone,
    msg,
    isMobile ? undefined : `➡️ PROBAR WHATSAPP (${c.phone}, número FIJO: puede no tener WhatsApp)`,
  );
  return [
    `<b>🧭 NO-WEBSITE LEAD — Atlas Monday (Business Identity Audit)</b>`,
    `<b>1️⃣ BEFORE SENDING (30 s):</b> search the name once. Google sometimes just does not link an existing site; if they have one, mark this deal ❌ No fit.`,
    `<b>2️⃣ SEND (permission-first, from the laptop)</b>`,
    btn,
    isMobile
      ? `<i>Mobile number from Google — WhatsApp likely, not confirmed.</i>`
      : `<i>⚠️ Google lists a LANDLINE. Find their Instagram (search the name) and open the bio: the real WhatsApp is often behind a Linktree / bit.ly / wa.link link (TLDC, 15 Oct). Trust only a link on the business's own page, never one from another account. If none: call, or park.</i>`,
    `<b>Message (ES):</b><br>${esc(msg)}`,
    `<b>3️⃣ EVIDENCE (Google Places, ${date})</b>`,
    `• ${c.mapsUri ? `<a href="${c.mapsUri}">Google Maps listing</a>` : 'Google Maps listing'} · ${c.rating ?? '—'}★ · ${c.reviews || 0} reviews · phone ${esc(c.phone)} · ${esc(c.city || '')}`,
    c.presence
      ? `• Google "website" field is a social page: ${esc(c.presence)} (no site of their own).`
      : `• Google profile has <b>no website</b> (Places websiteUri empty).`,
    `• Query: "${esc(c.query || '')}"${c.primaryType ? ` · type ${esc(c.primaryType)}` : ''}`,
    `<b>4️⃣ IDENTITY MATRIX</b> (fill when they say YES; states: present / empty / not exposed / not checked)`,
    `Google Maps: name ✓ · phone ✓ · hours ⏸ · services ⏸ · booking ⏸<br>Instagram: ${c.presence && socialPlatform(c.presence) === 'Instagram' ? `link ✓ (${esc(c.presence)}) · content ⏸` : '⏸ not checked'}<br>WhatsApp Business profile: ⏸ not checked<br>Website: none`,
    `<b>5️⃣ GATES</b> G1 yes to summary ☐ · G2 paid $100 ☐ · G3 facts confirmed ☐ · G4 kit approved ☐ · G5 hub publish approved ☐`,
    `<i>No scores, no ranking or "ChatGPT ignores you" claims, nothing published without their written OK. Spec: docs/selling/BUSINESS_IDENTITY_AUDIT_MVP_SPEC_2026-10-13.md</i>`,
  ]
    .filter(Boolean)
    .join('<br>');
}

/** The deal name. No "WhatsApp" in it: hs-outcomes-to-atlas.cjs maps that word to the WhatsApp lane. */
const noWebsiteDealName = (c) => `[CLIENT-ATLAS] ${c.company} — GEO/AEO fix (no website) · no_website`;

/** The Telegram line Elena asked for. */
function noWebsiteTelegramLine(picked) {
  if (!picked.length) return null;
  const kind = picked.every(isClinic) ? 'clinics' : 'businesses';
  return `🧭 ${picked.length} strong no-website ${kind} found: ${picked
    .map((c) => `${c.company} (${c.rating ?? '—'}★, ${c.reviews} reviews)`)
    .join(', ')}`;
}

module.exports = {
  MIN_REVIEWS,
  socialPlatform,
  isClinic,
  pickNoWebsite,
  buildNoWebsiteWa,
  buildNoWebsiteNote,
  noWebsiteDealName,
  noWebsiteTelegramLine,
};
