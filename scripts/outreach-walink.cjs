#!/usr/bin/env node
/**
 * outreach-walink.cjs — WhatsApp outreach link for Manual Prospect Play.
 *
 * Preferred (HubSpot-safe slug URL, no query string):
 *   node scripts/outreach-walink.cjs --slug dopanama
 *
 * Direct wa.me (terminal testing only):
 *   node scripts/outreach-walink.cjs --direct 50764433341 draft.txt
 */
const path = require('path');
const {
  buildOutreachSlugUrl,
  buildWhatsAppPrefillUrl,
  readDraftUtf8,
  formatPhone507,
  loadRegistry,
} = require('./wa-link-lib.cjs');

const args = process.argv.slice(2);
const slugMode = args.includes('--slug');
const direct = args.includes('--direct');
const rest = args.filter(a => !a.startsWith('--'));

if (slugMode) {
  const slug = rest[0];
  if (!slug) {
    console.error('Usage: node scripts/outreach-walink.cjs --slug <slug>');
    process.exit(1);
  }
  const reg = loadRegistry()[slug];
  if (!reg) {
    console.error(`Unknown slug "${slug}" — add to docs/selling/outreach-registry.json`);
    process.exit(1);
  }
  console.log(buildOutreachSlugUrl(slug));
  console.error(`# HubSpot slug link → ${reg.company} ${formatPhone507(reg.phone)}`);
  process.exit(0);
}

const [phone, file] = rest;
if (!phone || !file) {
  console.error('Usage:');
  console.error('  node scripts/outreach-walink.cjs --slug dopanama');
  console.error('  node scripts/outreach-walink.cjs --direct 507XXXXXXXX draft.txt');
  process.exit(1);
}

const message = readDraftUtf8(path.isAbsolute(file) ? file : path.join(__dirname, '..', file));
if (direct) {
  console.log(buildWhatsAppPrefillUrl(phone, message, true));
  console.error('# Direct web.whatsapp.com link (testing — HubSpot notes use --slug)');
} else {
  console.error('For file+phone mode use --direct (HubSpot notes must use --slug)');
  process.exit(1);
}
