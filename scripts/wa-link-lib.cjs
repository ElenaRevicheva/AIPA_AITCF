/**
 * wa-link-lib.cjs — canonical WhatsApp link builder for Manual Prospect Play.
 *
 * DECISION (Elena, July 19 2026, CORRECTED after a live test): HubSpot deal notes use a
 * `https://web.whatsapp.com/send?phone=<digits>&text=<encodeURIComponent(msg)>` anchor.
 * `wa.me` DID corrupt 4-byte emojis to "�" on Elena's desktop WhatsApp Web (its server
 * redirect re-encodes the bytes). `web.whatsapp.com/send` hands the text straight to the
 * browser — no redirect, emojis survive in full color. (Cursor was right about this.) The
 * `&` in the URL is written as `&amp;` inside the note href (valid HTML → decodes to `&`).
 * Keep draft files UTF-8 with literal color-default emojis; encode ONCE. The /go/outreach
 * slug server is retired (dormant).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'docs/selling/outreach-registry.json');
const OUTREACH_BASE =
  (process.env.CTO_OUTREACH_WA_BASE || 'https://webhook.aideazz.xyz/cto/go/outreach').replace(/\/$/, '');

function sliceWaText(text, max = 2000) {
  return [...String(text || '').trim()].slice(0, max).join('');
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function formatPhone507(phone) {
  const d = digitsOnly(phone);
  const local = d.startsWith('507') ? d.slice(3) : d;
  if (local.length === 8) return `+507 ${local.slice(0, 4)}-${local.slice(4)}`;
  return `+${d}`;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readDraftUtf8(file) {
  const p = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const buf = fs.readFileSync(p);
  const raw =
    buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.slice(3) : buf;
  const text = raw.toString('utf8').trim();
  if (!text) throw new Error(`Draft empty: ${p}`);
  if (text.includes('\uFFFD')) throw new Error(`Draft contains replacement char (bad encoding): ${p}`);
  return text;
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return {};
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function saveRegistry(reg) {
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(reg, null, 2)}\n`, { encoding: 'utf8' });
}

/** Register slug → phone + draft (+ optional email draft for one-click aipa@ send). */
function registerOutreachSlug(slug, phone, draftRelPath, company, extra = {}) {
  const reg = loadRegistry();
  reg[slug] = {
    phone: digitsOnly(phone),
    draft: draftRelPath.replace(/\\/g, '/'),
    company,
    ...(extra.email ? { email: String(extra.email).trim().toLowerCase() } : {}),
    ...(extra.emailDraft
      ? { emailDraft: String(extra.emailDraft).replace(/\\/g, '/') }
      : {}),
    ...(extra.dealId ? { dealId: String(extra.dealId) } : {}),
    ...(extra.score != null ? { score: Number(extra.score) } : {}),
  };
  saveRegistry(reg);
  return slug;
}

/** HubSpot-safe: no query string, no ampersands, no encoded emojis. */
function buildOutreachSlugUrl(slug) {
  const safe = String(slug).replace(/[^a-z0-9-]/gi, '');
  if (!safe) throw new Error('Invalid outreach slug');
  return `${OUTREACH_BASE}/${safe}`;
}

/**
 * WhatsApp outreach is LAPTOP-ONLY by Elena's decision (July 25 2026): notes link
 * straight to `web.whatsapp.com/send` (see buildHubSpotWaAnchor). A mobile bridge
 * was built and rolled back the same day after WhatsApp restricted her linked
 * devices — do not reintroduce one without her explicit go-ahead.
 */

/** One-click email via cto-aipa → Resend as aipa@aideazz.xyz (same sender as Concierge). */
function buildOutreachEmailUrl(slug) {
  const safe = String(slug).replace(/[^a-z0-9-]/gi, '');
  if (!safe) throw new Error('Invalid outreach email slug');
  const base = OUTREACH_BASE.replace(/\/outreach\/?$/, '/outreach-email');
  return `${base}/${safe}`;
}

function buildWaMeUrl(phone, text) {
  const digits = digitsOnly(phone);
  const safe = sliceWaText(text);
  if (!safe) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(safe)}`;
}

/** Direct prefill URL — use web.whatsapp.com on desktop (never wa.me for emoji messages). */
function buildWhatsAppPrefillUrl(phone, text, web = true) {
  const digits = digitsOnly(phone);
  const encoded = encodeURIComponent(sliceWaText(text));
  return web
    ? `https://web.whatsapp.com/send?phone=${digits}&text=${encoded}`
    : `https://api.whatsapp.com/send?phone=${digits}&text=${encoded}`;
}

/** web.whatsapp.com/send anchor for HubSpot notes (chosen method — see header).
 * Emojis survive (no wa.me redirect). `&` → `&amp;` so the HTML href is valid. */
function buildHubSpotWaAnchor(phone, text, label) {
  const url = buildWhatsAppPrefillUrl(phone, text, true).replace(/&/g, '&amp;');
  const title = label || `➡️ ENVIAR POR WHATSAPP (${formatPhone507(phone)})`;
  return `<a href="${url}"><b>${title}</b></a>`;
}

/** Canonical email subject for Manual Prospect Play (spam-safe, audit-specific). */
function buildManualEmailSubject(company, score) {
  return `Auditoría de visibilidad en IA — ${company} (${score}/100): 3 arreglos concretos`;
}

/**
 * Email body from the WhatsApp draft. Optional botFallback opener when WA hit a
 * reservations/menu bot (Fuerte Amador lesson, July 20 2026).
 */
function buildManualEmailBody(waDraft, opts = {}) {
  const draft = String(waDraft || '').trim();
  const lines = [];
  if (opts.botFallback) {
    lines.push(
      'Estimado equipo:',
      '',
      '¡Un gusto saludarles! 👋 Les escribo por este medio porque el WhatsApp llegó a un bot de reservas / menú automático — esta propuesta es comercial (visibilidad en IA), no una reserva. Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.',
      '',
    );
    const rest = draft.replace(/^Hola[\s\S]*?(?=Primero,)/i, '').trim();
    lines.push(rest || draft);
  } else {
    lines.push(
      'Estimado equipo:',
      '',
      draft.replace(
        /^Hola, ¡un gusto saludarles! 👋/,
        '¡Un gusto saludarles! 👋',
      ),
    );
  }
  return lines
    .join('\n')
    .replace(/\nElena✨🌍💫\s*$/, '\nElena Revicheva✨🌍💫')
    .trim();
}

/**
 * One-click email from aipa@aideazz.xyz — HubSpot note link opens confirm page,
 * then Resend sends (same path as Lead Concierge). NOT Gmail, NOT HubSpot compose
 * (HubSpot has no public prefill deep-link for connected inbox).
 */
function buildHubSpotEmailAnchor(slug, email, label) {
  const url = buildOutreachEmailUrl(slug);
  const addr = String(email || '').trim();
  const title = label || `➡️ ENVIAR POR EMAIL — aipa@aideazz.xyz (${addr || 'prospect'})`;
  return `<a href="${url}"><b>${title}</b></a>`;
}

/** @deprecated — kept for scripts; prefer buildHubSpotEmailAnchor(slug). */
function buildGmailComposeUrl(email, subject, body) {
  const addr = String(email || '').trim();
  if (!addr || !addr.includes('@')) throw new Error('gmail compose needs a real email');
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: addr,
    su: subject,
    body: sliceWaText(body, 1800),
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildHubSpotMailtoAnchor(email, subject, body, label) {
  const addr = String(email || '').trim();
  if (!addr || !addr.includes('@')) throw new Error('mailto needs a real email');
  const url =
    `mailto:${addr}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(sliceWaText(body, 1800))}`;
  const href = url.replace(/&/g, '&amp;');
  const title = label || `➡️ EMAIL (mailto) (${addr})`;
  return `<a href="${href}"><b>${title}</b></a>`;
}

/**
 * HubSpot note: WA + aipa@ one-click email (confirm page → Resend).
 */
function buildDualChannelNoteLinks(phone, email, waDraft, company, score, slug) {
  const parts = [buildHubSpotWaAnchor(phone, waDraft)];
  if (email && slug) {
    parts.push('');
    parts.push(buildHubSpotEmailAnchor(slug, email));
    parts.push('');
    parts.push(
      '<i><b>Email options (always both):</b> (1) HubSpot → Email from <b>aipa@aideazz.xyz</b> — best CRM trail; paste SUBJECT/body from EMAIL block below. (2) Speed: click <b>ENVIAR POR EMAIL — aipa@</b> → confirm → Resend (same From). If WA opens a bot, use email.</i>',
    );
  }
  return parts.join('<br>');
}

module.exports = {
  OUTREACH_BASE,
  REGISTRY_PATH,
  sliceWaText,
  digitsOnly,
  formatPhone507,
  slugify,
  readDraftUtf8,
  loadRegistry,
  saveRegistry,
  registerOutreachSlug,
  buildOutreachSlugUrl,
  buildOutreachEmailUrl,
  buildWaMeUrl,
  buildWhatsAppPrefillUrl,
  buildHubSpotWaAnchor,
  buildManualEmailSubject,
  buildManualEmailBody,
  buildGmailComposeUrl,
  buildHubSpotMailtoAnchor,
  buildHubSpotEmailAnchor,
  buildDualChannelNoteLinks,
};
