/**
 * site-contacts.cjs — read the email addresses a business DECLARES on its own pages.
 *
 * One implementation for both stagers. The rules were written for the hand stager
 * (scripts/stage-manual-prospect.cjs, parseContacts) from real misses, Jul–Oct 2026:
 *   - mailto: and Cloudflare-hidden addresses (data-cfemail) are authoritative
 *   - plain-text addresses need a left boundary, and a glued label is repaired only
 *     when the site itself shows the repaired address
 *   - placeholder addresses from form mocks (jane@company.com) are worse than nothing
 * The Atlas lead machine had its own weaker copy and staged a placeholder, a guessed
 * pattern and a complaints desk on 12 Oct 2026. Moving the rules here (13 Oct) lets
 * Atlas use them without a second copy drifting.
 *
 * extractSiteEmails() is byte-for-byte the email half of the old parseContacts, so the
 * hand stager's behaviour is unchanged. isNotABuyerInbox() / isTemplateAddress() are
 * the 12 Oct additions, used by Atlas only.
 */
'use strict';

// Placeholder addresses printed inside form previews and demo screenshots are the one
// class of scrape that is worse than finding nothing: it looks like a real contact, so
// it silently outranks the hand-researched preferredEmail and ships a one-click button
// aimed at a fictional person. PUMAS.digital (Aug 11 2026) published `jane@company.com`
// in its demo-request mock and the staged deal took it as the prospect's address.
const PLACEHOLDER = /^(jane|john|joe|name|you|your(name|email|company)?|firstname|email|test|demo|sample)@|@(company|yourcompany|yourdomain|domain|example|acme|email|mail|test|sample)\.(com|org|net|io|co)$/i;
const JUNK = /\.(png|jpg|jpeg|gif|webp|svg|css|js|html)$|@(2x|3x)\b|sentry|wixpress|example\.|correoernesto|^[0-9]+@|@.*-seccion\.|user@domain|john@doe|ttycirugia/i;

/**
 * Every address the page declares, best evidence first: mailto + Cloudflare-decoded,
 * then plain text. Lower-cased, junk and placeholders removed. Duplicates are kept in
 * order (callers pick the first match they want).
 */
function extractSiteEmails(html) {
  html = String(html || '');
  // mailto: is authoritative — the site itself declares the address there.
  const mailtoEmails = [...html.matchAll(/mailto:([^"'\s?<>]+)/gi)].map(m => m[1].toLowerCase());
  // Cloudflare "Email Address Obfuscation" replaces every address with a
  // data-cfemail hex blob (first byte = XOR key). The site is still declaring the
  // address, so it is as authoritative as mailto:. alquilerdeyatespanama.com
  // (2 Oct 2026) printed info@ in its footer and the scrape saw no email at all.
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]{4,})"/gi)) {
    const hex = m[1];
    const key = parseInt(hex.slice(0, 2), 16);
    let s = '';
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    mailtoEmails.push(s.toLowerCase());
  }
  // Plain text needs a LEFT boundary, or a label glued to the address is swallowed
  // into the local part: "Email" + "contactus@<clinic domain>" became
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

  return [...mailtoEmails, ...textEmails]
    .map(e => e.toLowerCase())
    .map(unglue)
    .filter(e => !JUNK.test(e))
    .filter(e => !PLACEHOLDER.test(e))
    .filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e));
}

/**
 * A FORMAT, not an address: Google's index shows "nombre.apellido@<chain>.com" when a
 * page explains how staff addresses are built, and a scrape of that snippet produced
 * a lead aimed at nobody (Four Seasons, 12 Oct 2026; two sends, zero recipients).
 * Same for "first.last@", "last@" (a Sofitel pattern guess) and friends.
 */
const TEMPLATE_LOCAL = /^(nombre|apellido|nombre\.apellido|nombreapellido|first|last|firstname|lastname|first\.last|firstname\.lastname|f\.lastname|flast|name\.surname|surname|usuario|user|username|tu(nombre|correo|email)|su(nombre|correo|email)|xxx+|abc)@/i;
function isTemplateAddress(email) {
  return TEMPLATE_LOCAL.test(String(email || ''));
}

/**
 * Inboxes that exist but never buy: complaints, legal notices, press, careers, privacy,
 * no-reply. Hyatt's consumeraffairs@ was staged as a wedding-venue lead on 12 Oct 2026. A suffix
 * counts too: notificacionesjuridicas.santaclara@ is still the legal-notices inbox.
 */
const NOT_A_BUYER_LOCAL = /^(consumer[._-]?affairs|complaints?|quejas|reclamos|privacy|privacidad|dpo|gdpr|legal|juridic[oa]?|notificaciones[._-]?juridicas|notificacionesjuridicas|abuse|postmaster|webmaster|hostmaster|no[._-]?reply|donotreply|do[._-]?not[._-]?reply|unsubscribe|bounce|press|prensa|media|pr|careers?|jobs?|empleo|empleos|trabaja(con)?nosotros|rrhh|hr|recruiting|talent|investors?|ir|compliance|etica|ethics|security|soporte[._-]?tecnico|billing|facturacion|accounts?[._-]?payable|cuentasporpagar)(?:[._-][a-z0-9._-]*)?@/i;
function isNotABuyerInbox(email) {
  return NOT_A_BUYER_LOCAL.test(String(email || ''));
}

module.exports = { extractSiteEmails, isTemplateAddress, isNotABuyerInbox, PLACEHOLDER, JUNK };
