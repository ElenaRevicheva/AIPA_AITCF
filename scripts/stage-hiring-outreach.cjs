#!/usr/bin/env node
/**
 * stage-hiring-outreach.cjs — stage ONE one-click-ready deal that is NOT a
 * Panama GEO/AEO client. Same Sales pipeline as Manual Prospect Play
 * (`qualifiedtobuy` = 🔥 I Act TODAY). Prefix comes from the spec:
 *
 *   [HIRING-MANUAL]  job / recruiter outreach
 *   [LICENSE]        codebase-licence buyers (AfterQuery, HUD, Lazarus, Fermatix)
 *
 * Do NOT run this with a Panama client domain — that is stage-manual-prospect.cjs.
 *
 * Objects created: company (if domain given) + contact + deal + note with the
 * send anchor + HIGH send-task + registry row. Owner is always Elena
 * (91612860) so Tasks → Assigned to me shows it.
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
 * Spec: { slug, name, email, company, subject, body,
 *         title?, dealName?, domain?, cc?, note? }
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotOwnerId, hubspotBase } = require('./hs-env.cjs');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');
const DRAFTS = path.join(ROOT, 'docs/selling/drafts');
const PUBLIC_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const OWNER_ID = hubspotOwnerId();
const HS_BASE = hubspotBase();

function buildDraftText(s) {
  const lines = [`TO: ${s.email}`];
  if (String(s.cc || '').trim()) lines.push(`CC: ${String(s.cc).trim()}`);
  lines.push(`SUBJECT: ${s.subject}`, '', s.body.trim(), '');
  return lines.join('\n');
}

function loadSpec() {
  const DRY = process.argv.includes('--dry-run');
  const specPath = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!specPath) {
    console.error('usage: node scripts/stage-hiring-outreach.cjs <spec.json> [--dry-run]');
    process.exit(1);
  }
  const KEY = (process.env.HUBSPOT_ACCESS_TOKEN || '').trim() || hubspotKey();
  if (!KEY && !DRY) { console.error('HUBSPOT key missing'); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  for (const f of ['slug', 'name', 'email', 'company', 'subject', 'body']) {
    if (!spec[f]) { console.error(`spec is missing "${f}"`); process.exit(1); }
  }
  const slug = String(spec.slug).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!slug) { console.error('slug must contain a-z0-9-'); process.exit(1); }
  const cc = String(spec.cc || '').trim();
  const domain = String(spec.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return { DRY, spec, slug, cc, domain, KEY };
}
function makeHs(KEY) {
  const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  return async function hs(method, p, body) {
    const r = await fetch(`${HS_BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* non-JSON is the finding */ }
    return { ok: r.ok, status: r.status, json, text };
  };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');

async function upsertCompany(hs, spec, domain) {
  if (!domain) return null;
  const found = await hs('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
    properties: ['name', 'domain'],
    limit: 1,
  });
  const existing = found.json?.results?.[0];
  if (existing?.id) {
    console.log(`  · company exists ${existing.id}  ${domain}`);
    return existing.id;
  }
  const created = await hs('POST', '/crm/v3/objects/companies', {
    properties: {
      name: spec.company,
      domain,
      website: `https://${domain}`,
    },
  });
  if (!created.ok) {
    console.error('  ✖ company create failed:', created.text.slice(0, 200));
    return null;
  }
  console.log(`  ✓ company ${created.json.id}  ${domain}`);
  return created.json.id;
}

async function main() {
  const { DRY, spec, slug, cc, domain, KEY } = loadSpec();
  const hs = makeHs(KEY);
  console.log(`\n── staging outreach: ${slug}${DRY ? ' (dry run)' : ''}\n`);

  // 0 ── Registry guard FIRST: refuse before creating anything we'd have to undo.
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const before = Object.keys(registry).length;
  if (registry[slug]) {
    console.error(`slug "${slug}" already in the registry (${before} entries) — refusing to overwrite.`);
    process.exit(1);
  }

  // 1 ── The draft file the send endpoint reads (TO:/CC:/SUBJECT: header contract).
  const draftRel = `docs/selling/drafts/${slug}-email.txt`;
  const draftAbs = path.join(ROOT, draftRel);
  const draftText = buildDraftText(spec);
  if (!DRY) { fs.mkdirSync(DRAFTS, { recursive: true }); fs.writeFileSync(draftAbs, draftText, 'utf8'); }
  console.log(`  ✓ draft   ${draftRel} (${draftText.length} chars)`);

  const dealName = spec.dealName || `[HIRING-MANUAL] ${spec.name} — ${spec.company}`;
  const lane = dealName.startsWith('[LICENSE]') ? 'Licence-lane' : 'Hiring-lane';

  if (DRY) {
    console.log(`  · would create company/contact/deal/note/task for ${spec.name} <${spec.email}>`);
    console.log(`  · deal name: ${dealName}`);
    console.log(`  · owner: ${OWNER_ID}${domain ? `  company domain: ${domain}` : ''}`);
    console.log(`  · would add registry key "${slug}" (registry has ${before})`);
    console.log(`\n── dry run, nothing written to HubSpot\n`);
    return;
  }

  // 2 ── Company (search by domain; never blind-create a duplicate).
  const companyId = await upsertCompany(hs, spec, domain);

  // 3 ── Contact (search first; never blind-create a duplicate).
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
        email: spec.email, firstname, lastname: rest.join(' ') || spec.company,
        company: spec.company,
        lifecyclestage: 'opportunity',
        hubspot_owner_id: OWNER_ID,
        ...(spec.title ? { jobtitle: spec.title } : {}),
      },
    });
    if (!c.ok) { console.error('  ✖ contact create failed:', c.text.slice(0, 200)); process.exit(1); }
    contactId = c.json.id;
    console.log(`  ✓ contact ${contactId}`);
  }

  // 4 ── Deal. Starts in "I act TODAY" — the click is the outstanding action.
  const d = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
      hubspot_owner_id: OWNER_ID,
      description: `${lane} outreach. One-click send: ${PUBLIC_BASE}/go/outreach-email/${slug}`,
    },
  });
  if (!d.ok) { console.error('  ✖ deal create failed:', d.text.slice(0, 200)); process.exit(1); }
  const dealId = d.json.id;
  console.log(`  ✓ deal    ${dealId}  ${dealName}`);

  // 5 ── Associations so the note, task and send stamp land on one record.
  const aDealContact = await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
  ]);
  console.log(`  ${aDealContact.ok ? '✓' : '✖'} assoc   deal ${dealId} ↔ contact ${contactId}`);
  if (companyId) {
    const aCo = await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/companies/${companyId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 },
    ]);
    const aCc = await hs('PUT', `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 },
    ]);
    console.log(`  ${aCo.ok && aCc.ok ? '✓' : '✖'} assoc   company ${companyId} ↔ deal + contact`);
  }

  // 6 ── The note carrying the send anchor. findOutreachNote() looks for this
  //      anchor text, so the send stamp lands here rather than on a later note.
  const sendUrl = `${PUBLIC_BASE}/go/outreach-email/${slug}`;
  const noteBody =
    `<a href="${sendUrl}"><b>➡️ SEND BY EMAIL — aipa@aideazz.xyz (${esc(spec.email)})</b></a>` +
    `<br><br><i><b>Email options (always both):</b> (1) HubSpot → Email from <b>aipa@aideazz.xyz</b> ` +
    `— best CRM trail; paste SUBJECT/body from the draft. (2) Speed: click <b>SEND BY EMAIL — aipa@</b> ` +
    `→ confirm → Resend (same From). One click = send. There is no double-send guard.</i>` +
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

  // 7 ── HIGH send-task due today, so Tasks → Assigned to Elena surfaces it.
  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send ${lane.replace('-lane', '')} email → ${spec.company}`,
      hs_task_body:
        `Open the deal note → ➡️ SEND BY EMAIL (aipa@ → ${spec.email}). ` +
        `Or HubSpot UI Email from aipa@aideazz.xyz. Do not connect GitHub in this first email.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: OWNER_ID,
    },
  });
  if (task.ok) {
    await hs('PUT', `/crm/v4/objects/tasks/${task.json.id}/associations/deals/${dealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
    ]);
    console.log(`  ✓ task    ${task.json.id}`);
  } else {
    console.error('  ✖ task create failed:', task.text.slice(0, 160));
  }

  // 8 ── Registry LAST: only claim a slug once the objects it points at exist.
  registry[slug] = {
    phone: '',
    draft: draftRel,
    company: spec.company,
    email: String(spec.email).trim().toLowerCase(),
    emailDraft: draftRel,
    dealId: String(dealId),
    ...(cc ? { cc } : {}),
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`  ✓ registry "${slug}" added (${before} → ${Object.keys(registry).length} entries)`);

  console.log(`\n  Deal:  https://app.hubspot.com/contacts/51409153/record/0-3/${dealId}`);
  console.log(`  Send:  ${sendUrl}\n`);
}

module.exports = { buildDraftText };

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
