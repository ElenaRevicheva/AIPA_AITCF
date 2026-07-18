#!/usr/bin/env node
/**
 * outreach-walink.cjs — one-click WhatsApp outreach link generator.
 *
 * Part of the MANUAL PROSPECT PLAY (docs/selling/MANUAL_PROSPECT_PLAY.md):
 * every prospect deal note in HubSpot carries a wa.me link with the FULL
 * outreach message pre-typed, so Elena's only action is click → Send.
 *
 * Usage:
 *   node scripts/outreach-walink.cjs <phone-digits> <message-file.txt>
 *   node scripts/outreach-walink.cjs 50769596919 draft.txt
 *
 * - phone: international format, digits only, no "+" (Panama: 507xxxxxxxx)
 * - message file: UTF-8 plain text, EXACTLY as it should appear in WhatsApp,
 *   literal emojis included (never pre-encoded — encoding happens here).
 *
 * Prints the https://wa.me/<phone>?text=<encoded> URL to stdout.
 * Paste it into a browser (WhatsApp Web linked to WhatsApp Business) or wrap
 * it in an <a href="..."> inside the HubSpot deal note.
 */

const fs = require('fs');

const [phone, file] = process.argv.slice(2);
if (!phone || !file) {
  console.error('Usage: node scripts/outreach-walink.cjs <phone-digits> <message-file.txt>');
  process.exit(1);
}
if (!/^\d{8,15}$/.test(phone)) {
  console.error(`Phone must be 8-15 digits, international format without "+" (got "${phone}").`);
  process.exit(1);
}

const message = fs.readFileSync(file, 'utf8').trim();
if (!message) {
  console.error(`Message file ${file} is empty.`);
  process.exit(1);
}

console.log(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
