#!/usr/bin/env node
/**
 * stage-hiring-outreach.cjs — stage ONE hiring-lane prospect, one-click ready.
 *
 * The sibling of stage-manual-prospect.cjs, for the HIRING lane rather than the
 * client lane. It creates the five objects a one-click send needs and nothing
 * else: contact, deal, association, note carrying the send anchor, and the
 * registry entry that anchor resolves against.
 *
 * ── What Elena has to do afterwards ─────────────────────────────────────────
 * Open the deal in HubSpot and click "➡️ SEND BY EMAIL". That single click, via
 * /go/outreach-email/<slug>, already does all of this (see src/go-wa.ts):
 *   • sends from aipa@aideazz.xyz through Resend
 *   • moves the deal to "⏳ Sent — passive wait" (decisionmakerboughtin)
 *   • stamps the note with the date, subject and Resend id
 *   • schedules a +4-day follow-up task
 * and the Resend webhook then stamps ENTREGADO / ABIERTO on the same note as
 * the mail is delivered and opened. Nothing here re-implements any of that.
 *
 * ── Why the deal does NOT start in "Sent" ───────────────────────────────────
 * It starts in "🔥 I act TODAY", because at staging time nothing has been sent.
 * Marking it Sent up front would put a lie on the board and hide the one action
 * that is actually outstanding — her click.
 *
 * ── The registry is append-only, on purpose ─────────────────────────────────
 * docs/selling/outreach-registry.json holds every prospect's send payload. It
 * was once destroyed by copying a stale copy over the live one, losing 20
 * entries. This script reads the current file, adds exactly one key, and writes
 * it back; it never generates the file from scratch, and it refuses to run if
 * the slug already exists.
 *
 * Usage:
 *   node scripts/stage-hiring-outreach.cjs <spec.json> [--dry-run]
 *
 * Spec: { slug, name, email, company, title?, dealName?, subject, body, note? }
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');
const DRAFTS = path.join(ROOT, 'docs/selling/drafts');
const DRY = process.argv.includes('--dry-run');
const specPath = process.argv.slice(2).find(a => !a.startsWith('--'));

const PUBLIC_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const KEY = (process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY || '').trim()
  || (fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^HUBSPOT_(?:ACCESS_TOKEN|API_KEY)=(.+)$/m)?.[1] || '').trim();

if (!specPath) { console.error('usage: node scripts/stage-hiring-outreach.cjs <spec.json> [--dry-run]'); process.exit(1); }
if (!KEY && !DRY) { console.error('HUBSPOT key missing'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
for (const f of ['slug', 'name', 'email', 'company', 'subject', 'body']) {
  if (!spec[f]) { console.error(`spec is missing "${f}"`); process.exit(1); }
}
const slug = String(spec.slug).replace(/[^a-z0-9-]/gi, '').toLowerCase();
if (!slug) { console.error('slug must contain a-z0-9-'); process.exit(1); }

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function hs(method, p, body) {
  const r = await fetch(`https://api.hubapi.com${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON is the finding */ }
  return { ok: r.ok, status: r.status, json, text };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');

async function main() {
  console.log(`\n── staging hiring outreach: ${slug}${DRY ? ' (dry run)' : ''}\n`);

  // 0 ── Registry guard FIRST: refuse before creating anything we'd have to undo.
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const before = Object.keys(registry).length;
  if (registry[slug]) {
    console.error(`slug "${slug}" already in the registry (${before} entries) — refusing to overwrite.`);
    process.exit(1);
  }

  // 1 ── The draft file the send endpoint reads (TO:/SUBJECT: header contract).
  const draftRel = `docs/selling/drafts/${slug}-email.txt`;
  const draftAbs = path.join(ROOT, draftRel);
  const draftText = `TO: ${spec.email}\nSUBJECT: ${spec.subject}\n\n${spec.body.trim()}\n`;
  if (!DRY) { fs.mkdirSync(DRAFTS, { recursive: true }); fs.writeFileSync(draftAbs, draftText, 'utf8'); }
  console.log(`  ✓ draft   ${draftRel} (${draftText.length} chars)`);

  if (DRY) {
    console.log(`  · would create contact/deal/note for ${spec.name} <${spec.email}>`);
    console.log(`  · would add registry key "${slug}" (registry has ${before})`);
    console.log(`\n── dry run, nothing written to HubSpot\n`);
    return;
  }

  // 2 ── Contact (search first; never blind-create a duplicate).
  const found = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: spec.email }] }],
    properties: ['email'], limit: 1,
  });
  let contactId = found.json?.results?.[0]?.id || null;
  if (contactId) {
    console.log(`  · contact exists ${contactId}`);
  } else {
    const [firstname, ...rest] = String(spec.name).split(/\s+/);
    const c = await hs('POST', '/crm/v3/objects/contacts', {
      properties: {
        email: spec.email, firstname, lastname: rest.join(' '),
        company: spec.company, ...(spec.title ? { jobtitle: spec.title } : {}),
      },
    });
    if (!c.ok) { console.error('  ✖ contact create failed:', c.text.slice(0, 200)); process.exit(1); }
    contactId = c.json.id;
    console.log(`  ✓ contact ${contactId}`);
  }

  // 3 ── Deal. Starts in "I act TODAY" — the click is the outstanding action.
  const dealName = spec.dealName || `[HIRING-MANUAL] ${spec.name} — ${spec.company}`;
  const d = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName, dealstage: 'qualifiedtobuy', pipeline: 'default',
      description: `Hiring-lane outreach. One-click send: ${PUBLIC_BASE}/go/outreach-email/${slug}`,
    },
  });
  if (!d.ok) { console.error('  ✖ deal create failed:', d.text.slice(0, 200)); process.exit(1); }
  const dealId = d.json.id;
  console.log(`  ✓ deal    ${dealId}  ${dealName}`);

  // 4 ── Associate, so the note and the send stamp land on one record.
  const a = await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`, {});
  console.log(`  ${a.ok ? '✓' : '✖'} assoc   deal ${dealId} ↔ contact ${contactId}`);

  // 5 ── The note carrying the send anchor. findOutreachNote() looks for this
  //      anchor text, so the send stamp lands here rather than on a later note.
  const sendUrl = `${PUBLIC_BASE}/go/outreach-email/${slug}`;
  const noteBody =
    `<a href="${sendUrl}"><b>➡️ SEND BY EMAIL — aipa@aideazz.xyz (${esc(spec.email)})</b></a>` +
    `<br><br><b>Subject:</b> ${esc(spec.subject)}` +
    `<br><br>${nl2br(spec.body.trim())}` +
    (spec.note ? `<br><br><b>Context:</b> ${nl2br(spec.note)}` : '') +
    `<br><br><i>One click sends it, moves this deal to "⏳ Sent — passive wait", stamps the ` +
    `Resend id here, and schedules a +4-day follow-up. ENTREGADO / ABIERTO are stamped on ` +
    `this same note as the mail is delivered and opened.</i>`;
  const n = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteBody, hs_timestamp: new Date().toISOString() },
    associations: [
      { to: { id: dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
      { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
    ],
  });
  console.log(`  ${n.ok ? '✓' : '✖'} note    ${n.ok ? n.json.id : n.text.slice(0, 160)}`);

  // 6 ── Registry LAST: only claim a slug once the objects it points at exist.
  registry[slug] = {
    phone: '',
    draft: draftRel,
    company: spec.company,
    email: String(spec.email).trim().toLowerCase(),
    emailDraft: draftRel,
    dealId: String(dealId),
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`  ✓ registry "${slug}" added (${before} → ${Object.keys(registry).length} entries)`);

  console.log(`\n  Deal:  https://app.hubspot.com/contacts/51409153/record/0-3/${dealId}`);
  console.log(`  Send:  ${sendUrl}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
