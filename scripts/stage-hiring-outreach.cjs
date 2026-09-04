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
 *   node scripts/stage-hiring-outreach.cjs <spec.json> [--dry-run] [--attach-deal]
 *
 * Spec: { slug, name, email, company, title?, dealName?, subject, body, note?,
 *         cc?, attachments?, companyDomain?, draftFile? }
 *
 * ── cc / attachments ────────────────────────────────────────────────────────
 * src/go-wa.ts has carried both for a while, but this script never wrote them,
 * so any letter needing a Cc or an attachment had its registry entry edited by
 * hand afterwards. Attachments are validated HERE through the sender's own
 * parseOutreachAttachmentSpec, so staging cannot register a file the send path
 * will refuse — that failure would otherwise appear as a dead button much later.
 *
 * ── --attach-deal ───────────────────────────────────────────────────────────
 * The slug guard exists because the registry was once destroyed by a stale copy.
 * Refusing outright is right for a fresh prospect, but wrong when a letter was
 * prepared and verified before the deal existed: the entry is already correct
 * and only `dealId` is missing. With --attach-deal an existing entry is MERGED —
 * fields are added, never removed or overwritten with different values.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');
const DRAFTS = path.join(ROOT, 'docs/selling/drafts');
const DRY = process.argv.includes('--dry-run');
const ATTACH_DEAL = process.argv.includes('--attach-deal');
const specPath = process.argv.slice(2).find(a => !a.startsWith('--'));

const PUBLIC_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
// Via hs-env.cjs, not fs.readFileSync('.env'): reading the file directly threw
// ENOENT before the script could say what was missing, which made even --dry-run
// impossible anywhere except Elena's laptop. Environment first, then `.env`.
const { envValue } = require('./hs-env.cjs');
const KEY = envValue('HUBSPOT_ACCESS_TOKEN') || envValue('HUBSPOT_API_KEY');

if (!specPath) { console.error('usage: node scripts/stage-hiring-outreach.cjs <spec.json> [--dry-run]'); process.exit(1); }
if (!KEY && !DRY) { console.error('HUBSPOT key missing'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
for (const f of ['slug', 'name', 'email', 'company', 'subject', 'body']) {
  if (!spec[f]) { console.error(`spec is missing "${f}"`); process.exit(1); }
}
const slug = String(spec.slug).replace(/[^a-z0-9-]/gi, '').toLowerCase();
if (!slug) { console.error('slug must contain a-z0-9-'); process.exit(1); }

/** "a@b.com, c@d.com" or ["a@b.com"] → the registry's comma-separated form. */
function normalizeCc(raw) {
  const list = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const found = [...new Set(list.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])]
    .map(a => a.toLowerCase())
    .filter(a => a !== String(spec.email).trim().toLowerCase());
  return found.join(', ');
}
const ccValue = normalizeCc(spec.cc);

/**
 * Validate attachments with the SENDER's gate, not a copy of it. A second
 * implementation would drift and let staging register a file the send refuses.
 */
function validateAttachments(list) {
  if (!list?.length) return [];
  let parseSpec;
  try {
    ({ parseOutreachAttachmentSpec: parseSpec } = require(path.join(ROOT, 'dist/go-wa.js')));
  } catch (e) {
    console.error('cannot load dist/go-wa.js to validate attachments — run `npx tsc` first');
    process.exit(1);
  }
  const out = [];
  for (const a of list) {
    const parsed = parseSpec(a);
    if (!parsed) {
      console.error(`attachment rejected by the send path: ${JSON.stringify(a)}`);
      console.error('  must live under docs/selling/attachments/ and be .pdf or .docx');
      process.exit(1);
    }
    const abs = path.join(ROOT, parsed.relPath);
    if (!fs.existsSync(abs)) {
      console.error(`attachment does not exist: ${parsed.relPath}`);
      process.exit(1);
    }
    out.push({ path: parsed.relPath, filename: parsed.filename });
  }
  return out;
}
const attachments = validateAttachments(spec.attachments);

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
  const existing = registry[slug];
  if (existing && !ATTACH_DEAL) {
    console.error(`slug "${slug}" already in the registry (${before} entries) — refusing to overwrite.`);
    console.error('  If the entry is already correct and only needs its dealId, re-run with --attach-deal.');
    process.exit(1);
  }
  if (existing?.dealId) {
    console.error(`slug "${slug}" already points at deal ${existing.dealId} — refusing to stage a second deal.`);
    process.exit(1);
  }

  // 1 ── The draft file the send endpoint reads (TO:/SUBJECT: header contract).
  //      An existing, already-reviewed draft is kept rather than regenerated:
  //      re-deriving it from the spec would silently discard hand edits.
  const draftRel = spec.draftFile || `docs/selling/drafts/${slug}-email.txt`;
  const draftAbs = path.join(ROOT, draftRel);
  if (spec.draftFile && !fs.existsSync(draftAbs)) {
    console.error(`spec.draftFile does not exist: ${draftRel}`);
    process.exit(1);
  }
  if (spec.draftFile) {
    console.log(`  · draft   ${draftRel} (kept as written, ${fs.statSync(draftAbs).size} bytes)`);
  } else {
    const ccLine = ccValue ? `CC: ${ccValue}\n` : '';
    const draftText = `TO: ${spec.email}\n${ccLine}SUBJECT: ${spec.subject}\n\n${spec.body.trim()}\n`;
    if (!DRY) { fs.mkdirSync(DRAFTS, { recursive: true }); fs.writeFileSync(draftAbs, draftText, 'utf8'); }
    console.log(`  ✓ draft   ${draftRel} (${draftText.length} chars)`);
  }
  if (ccValue) console.log(`  · cc      ${ccValue}`);
  for (const a of attachments) console.log(`  · adjunto ${a.filename}`);

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

  // 4b ── Optional company, so the deal is not an orphan on the board.
  if (spec.companyDomain) {
    const domain = String(spec.companyDomain).trim().toLowerCase();
    const foundCo = await hs('POST', '/crm/v3/objects/companies/search', {
      filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
      properties: ['domain', 'name'], limit: 1,
    });
    let companyId = foundCo.json?.results?.[0]?.id || null;
    if (companyId) {
      console.log(`  · company exists ${companyId} (${domain})`);
    } else {
      const co = await hs('POST', '/crm/v3/objects/companies', {
        properties: { name: spec.company, domain },
      });
      companyId = co.ok ? co.json.id : null;
      console.log(`  ${co.ok ? '✓' : '✖'} company ${companyId || co.text.slice(0, 160)}`);
    }
    if (companyId) {
      const ac = await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/companies/${companyId}`, {});
      console.log(`  ${ac.ok ? '✓' : '✖'} assoc   deal ${dealId} ↔ company ${companyId}`);
      const acc = await hs('PUT', `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`, {});
      console.log(`  ${acc.ok ? '✓' : '✖'} assoc   contact ${contactId} ↔ company ${companyId}`);
    }
  }

  // 5 ── The note carrying the send anchor. findOutreachNote() looks for this
  //      anchor text, so the send stamp lands here rather than on a later note.
  const sendUrl = `${PUBLIC_BASE}/go/outreach-email/${slug}`;
  const noteBody =
    `<a href="${sendUrl}"><b>➡️ SEND BY EMAIL — aipa@aideazz.xyz (${esc(spec.email)})</b></a>` +
    (ccValue ? `<br><b>Cc:</b> ${esc(ccValue)}` : '') +
    (attachments.length
      ? `<br><b>Adjunto:</b> ${esc(attachments.map(x => x.filename).join(', '))}`
      : '') +
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
  //      Merge over an existing entry so --attach-deal cannot drop fields that
  //      were already reviewed; the new dealId is the only forced value.
  registry[slug] = {
    phone: '',
    draft: draftRel,
    company: spec.company,
    email: String(spec.email).trim().toLowerCase(),
    emailDraft: draftRel,
    ...(ccValue ? { cc: ccValue } : {}),
    ...(existing || {}),
    ...(attachments.length ? { attachments } : {}),
    dealId: String(dealId),
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(
    `  ✓ registry "${slug}" ${existing ? 'merged' : 'added'} (${before} → ${Object.keys(registry).length} entries)`,
  );

  console.log(`\n  Deal:  https://app.hubspot.com/contacts/51409153/record/0-3/${dealId}`);
  console.log(`  Send:  ${sendUrl}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
