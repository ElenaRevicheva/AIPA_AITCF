/**
 * wa-link-lib.cjs — canonical WhatsApp link builder for Manual Prospect Play.
 *
 * DECISION (Elena, July 19 2026): HubSpot deal notes use a DIRECT wa.me anchor
 * `https://wa.me/<digits>?text=<encodeURIComponent(msg)>`. This is proven to render
 * emojis correctly on Elena's WhatsApp Web — the earlier "�" corruption came from the
 * b64 + /go/outreach server round-trip layers, NOT from wa.me itself. Direct wa.me has a
 * single `?text=` param (no `&`), so HubSpot can't mangle it. Keep the draft files UTF-8
 * with literal emojis; encode ONCE here. The /go/outreach slug server is retired (dormant).
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

/** Register slug → phone + draft path (called by stage-manual-prospect). */
function registerOutreachSlug(slug, phone, draftRelPath, company) {
  const reg = loadRegistry();
  reg[slug] = {
    phone: digitsOnly(phone),
    draft: draftRelPath.replace(/\\/g, '/'),
    company,
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

/** Direct wa.me anchor for HubSpot notes (chosen method — see header). */
function buildHubSpotWaAnchor(phone, text, label) {
  const url = buildWaMeUrl(phone, text);
  const title = label || `➡️ ENVIAR POR WHATSAPP (${formatPhone507(phone)})`;
  return `<a href="${url}"><b>${title}</b></a>`;
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
  registerOutreachSlug,
  buildOutreachSlugUrl,
  buildWaMeUrl,
  buildWhatsAppPrefillUrl,
  buildHubSpotWaAnchor,
};
