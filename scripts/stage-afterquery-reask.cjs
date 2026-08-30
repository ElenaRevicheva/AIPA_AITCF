#!/usr/bin/env node
/**
 * Stage AfterQuery Atrium re-ask: company + contact + deal + note + task + registry.
 * Reads /tmp/afterquery-zoho.json when present so To/Cc follow their reply.
 * Does not send mail. Deal starts in qualifiedtobuy (🔥 I act TODAY).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');
const DRAFT_REL = 'docs/selling/drafts/afterquery-atrium-reask-email.txt';
const ZOHO_JSON = process.env.AFTERQUERY_ZOHO_JSON || '/tmp/afterquery-zoho.json';
const SLUG = 'afterquery-atrium-reask';
const DRY = process.argv.includes('--dry-run');
const PUBLIC_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const PORTAL = '51409153';
const OWNER = process.env.HUBSPOT_OWNER_ID || '91612860';

function envValue(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  try {
    return fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

const KEY = (process.env.HUBSPOT_API_KEY || process.env.HUBSPOT_ACCESS_TOKEN || envValue('HUBSPOT_API_KEY')).trim();
if (!KEY && !DRY) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function hs(method, p, body) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { ok: r.ok, status: r.status, json, text };
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function loadZoho() {
  try {
    return JSON.parse(fs.readFileSync(ZOHO_JSON, 'utf8'));
  } catch {
    return { ok: false, error: 'no zoho json', messages: [] };
  }
}

function pickAddresses(zoho) {
  const fallbackTo = 'support@afterquery.com';
  const fallbackCc = ['founders@afterquery.com'];
  const reply = String(zoho.reply_from || '').toLowerCase();
  const inbound = (zoho.messages || []).filter((m) =>
    (m.from_emails || []).some((a) => String(a).endsWith('@afterquery.com')),
  );
  let to = fallbackTo;
  const cc = new Set(fallbackCc);
  if (reply && reply.endsWith('@afterquery.com')) {
    to = reply;
    cc.add('support@afterquery.com');
    cc.add('founders@afterquery.com');
  } else if (inbound[0]?.from_emails?.[0]) {
    to = String(inbound[0].from_emails[0]).toLowerCase();
    cc.add('support@afterquery.com');
    cc.add('founders@afterquery.com');
  }
  cc.delete(to);
  return { to, cc: [...cc] };
}

function contactName(zoho, to) {
  const hdr = String(zoho.reply_from_header || '');
  const beforeAt = hdr.split('<')[0].trim().replace(/"/g, '');
  if (beforeAt && !beforeAt.includes('@') && beforeAt.split(/\s+/).length >= 1) {
    const parts = beforeAt.split(/\s+/);
    return { firstname: parts[0], lastname: parts.slice(1).join(' ') || 'AfterQuery' };
  }
  const local = to.split('@')[0].replace(/[._]/g, ' ');
  const bits = local.split(/\s+/).filter(Boolean);
  return {
    firstname: bits[0] ? bits[0][0].toUpperCase() + bits[0].slice(1) : 'AfterQuery',
    lastname: bits.slice(1).join(' ') || 'Atrium',
  };
}

function buildBody(zoho) {
  const base = `I submitted a set of GitHub repos to Atrium while they were public. You declined.

On 30 Aug 2026 I changed the product repos to private so you could grade current visibility. I am disclosing that date. Private now is not the same as never-public. I am not hiding the first submit.

Please re-grade these eight, which I solely own. No conflicting SPDX licence. Same offer: a non-exclusive licence to a copy of source, for model-training use. I retain copyright, the brand, the domains, and the right to keep operating and selling. Production systems, CRM, chat logs, keys, and any third-party or client material are out of scope.

- https://github.com/ElenaRevicheva/AIPA_AITCF
- https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF
- https://github.com/ElenaRevicheva/EspaLuzFamilybot
- https://github.com/ElenaRevicheva/EspaLuzWhatsApp
- https://github.com/ElenaRevicheva/EspaLuz_Influencer
- https://github.com/ElenaRevicheva/dragontrade-agent
- https://github.com/ElenaRevicheva/AILA
- https://github.com/ElenaRevicheva/atlas-captures

aideazz stays public. That repo deploys https://aideazz.xyz/portfolio.

Dossier: https://webhook.aideazz.xyz/doc/nine-systems

If the first no was "public at submit," this is the re-ask. If it was a different filter, a one-line reason is enough.

Best regards,
Elena Revicheva
AIdeazz AI Lab · Panama City
https://aideazz.xyz/portfolio`;

  const theirSubj = String(zoho.reply_subject || '').trim();
  const snippet = String(zoho.reply_snippet || '').trim();
  if (zoho.ok && zoho.reply_from && snippet) {
    const opener = theirSubj
      ? `Hi,\n\nThank you for the earlier reply on Atrium ("${theirSubj.replace(/"/g, '')}"). I have the thread in Zoho.`
      : `Hi,\n\nThank you for the earlier reply on Atrium. I have the thread in Zoho.`;
    return `${opener}\n\n${base.replace(/^Hi,\n\n/, '')}`;
  }
  return `Hi,\n\n${base}`;
}

function buildSubject(zoho) {
  const their = String(zoho.reply_subject || '').trim();
  if (their && !/^re:/i.test(their)) return `Re: ${their}`;
  if (their) return their;
  return 'Re-grade — repos were public at first submit, private as of 30 Aug 2026';
}

async function findOrCreateCompany() {
  const found = await hs('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: 'afterquery.com' }] }],
    properties: ['name', 'domain'],
    limit: 1,
  });
  if (found.json?.results?.[0]?.id) return found.json.results[0].id;
  const c = await hs('POST', '/crm/v3/objects/companies', {
    properties: { name: 'AfterQuery', domain: 'afterquery.com', city: 'San Francisco' },
  });
  if (!c.ok) throw new Error(`company create ${c.status}: ${c.text.slice(0, 200)}`);
  return c.json.id;
}

async function findOrCreateContact(to, name) {
  const found = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: to }] }],
    properties: ['email', 'firstname', 'lastname'],
    limit: 1,
  });
  if (found.json?.results?.[0]?.id) return found.json.results[0].id;
  const c = await hs('POST', '/crm/v3/objects/contacts', {
    properties: {
      email: to,
      firstname: name.firstname,
      lastname: name.lastname,
      company: 'AfterQuery',
      jobtitle: 'Atrium / codebase licensing',
      hubspot_owner_id: OWNER,
    },
  });
  if (!c.ok) throw new Error(`contact create ${c.status}: ${c.text.slice(0, 200)}`);
  return c.json.id;
}

async function main() {
  const zoho = loadZoho();
  const { to, cc } = pickAddresses(zoho);
  const subject = buildSubject(zoho);
  const body = buildBody(zoho);
  const name = contactName(zoho, to);
  const draftText = `TO: ${to}\nCC: ${cc.join(', ')}\nSUBJECT: ${subject}\n\n${body.trim()}\n`;
  fs.mkdirSync(path.join(ROOT, 'docs/selling/drafts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, DRAFT_REL), draftText, 'utf8');

  const zohoNote = path.join(ROOT, 'docs/selling/drafts/afterquery-zoho-thread.txt');
  const zohoLines = [
    `Searched at: ${zoho.searched_at || 'n/a'}`,
    `IMAP ok: ${zoho.ok ? 'yes' : 'no'} ${zoho.error || ''}`,
    `Inbound AfterQuery: ${zoho.inbound_count ?? 0}  Outbound: ${zoho.outbound_count ?? 0}`,
    `Reply from: ${zoho.reply_from_header || zoho.reply_from || '(none)'}`,
    `Reply subject: ${zoho.reply_subject || '(none)'}`,
    `Reply date: ${zoho.reply_date || '(none)'}`,
    '',
    '--- snippet (first inbound, truncated) ---',
    zoho.reply_snippet || '(no inbound AfterQuery mail found)',
    '',
    '--- hits ---',
    ...((zoho.messages || []).slice(0, 8).map(
      (m, i) =>
        `${i + 1}. ${m.date || '?'} | ${m.folder || '?'} | ${m.from || '?'} → ${m.to || '?'} | ${m.subject || '?'}`,
    ) || ['(none)']),
  ];
  fs.writeFileSync(zohoNote, zohoLines.join('\n') + '\n', 'utf8');

  console.log(`draft  ${DRAFT_REL}`);
  console.log(`to     ${to}`);
  console.log(`cc     ${cc.join(', ') || '-'}`);
  console.log(`subj   ${subject}`);
  console.log(`zoho   ok=${!!zoho.ok} inbound=${zoho.inbound_count ?? 0} from=${zoho.reply_from || '-'}`);

  if (DRY) {
    console.log('dry-run — no HubSpot writes');
    return;
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  if (registry[SLUG]?.dealId) {
    console.error(`slug ${SLUG} already staged as deal ${registry[SLUG].dealId} — refusing to duplicate`);
    process.exit(1);
  }

  const companyId = await findOrCreateCompany();
  console.log(`company ${companyId}`);
  const contactId = await findOrCreateContact(to, name);
  console.log(`contact ${contactId}`);

  const dealName = '[LICENSE] AfterQuery Atrium — disclosed re-ask';
  const d = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
      hubspot_owner_id: OWNER,
      description: `Atrium re-ask after public→private flip (30 Aug 2026). One-click: ${PUBLIC_BASE}/go/outreach-email/${SLUG}`,
    },
  });
  if (!d.ok) throw new Error(`deal create ${d.status}: ${d.text.slice(0, 240)}`);
  const dealId = d.json.id;
  console.log(`deal    ${dealId}`);

  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`, {});
  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/default/companies/${companyId}`, {});
  await hs('PUT', `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`, {});

  const sendUrl = `${PUBLIC_BASE}/go/outreach-email/${SLUG}`;
  const zohoBlock = zoho.ok
    ? `<b>Zoho thread:</b> inbound ${zoho.inbound_count || 0}, outbound ${zoho.outbound_count || 0}` +
      (zoho.reply_from ? `<br>Last inbound from <b>${esc(zoho.reply_from)}</b> — ${esc(zoho.reply_subject || '')}` : '<br>No inbound AfterQuery mail found; sending to support@ + founders@')
    : `<b>Zoho search failed:</b> ${esc(zoho.error || 'unknown')} — letter still uses support@ + founders@`;

  const noteBody =
    `<a href="${sendUrl}"><b>➡️ SEND BY EMAIL — aipa@aideazz.xyz (${esc(to)})</b></a>` +
    `<br><br>${zohoBlock}` +
    `<br><br><b>Subject:</b> ${esc(subject)}` +
    `<br><b>Cc:</b> ${esc(cc.join(', ') || '—')}` +
    `<br><br>${nl2br(body)}` +
    `<br><br><i>One click sends from aipa@ via Resend, moves this deal to ⏳ Sent, stamps the Resend id, and schedules +4d follow-up. Do not sign exclusive / copyright assignment if they send an NDA pack.</i>` +
    `<br><i>Also: HubSpot → Email from aipa@aideazz.xyz (best CRM trail). Paste SUBJECT/body above.</i>`;

  const n = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteBody, hs_timestamp: new Date().toISOString() },
    associations: [
      { to: { id: dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
      { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
    ],
  });
  if (!n.ok) throw new Error(`note ${n.status}: ${n.text.slice(0, 200)}`);
  console.log(`note    ${n.json.id}`);

  const due = new Date();
  const t = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: 'Send AfterQuery Atrium disclosed re-ask (8 private repos)',
      hs_task_body: `Click SEND BY EMAIL on the deal note. To ${to}. Disclose 30 Aug flip. Do not silent-resubmit.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: OWNER,
    },
    associations: [
      { to: { id: dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] },
      { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] },
    ],
  });
  if (!t.ok) throw new Error(`task ${t.status}: ${t.text.slice(0, 200)}`);
  console.log(`task    ${t.json.id}`);

  registry[SLUG] = {
    phone: '',
    company: 'AfterQuery',
    email: to,
    cc: cc.join(', '),
    emailDraft: DRAFT_REL,
    draft: DRAFT_REL,
    dealId: String(dealId),
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`registry ${SLUG}`);
  console.log(`Deal: ${`https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}`}`);
  console.log(`Send: ${sendUrl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
