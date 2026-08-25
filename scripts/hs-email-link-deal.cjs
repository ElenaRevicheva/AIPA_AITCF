#!/usr/bin/env node
/**
 * Read the latest HubSpot note on a deal and put the CLIENT-MANUAL one-click
 * ➡️ ENVIAR POR EMAIL button on it (same /go/outreach-email/{slug} path).
 *
 * Cloud agents cannot reach api.hubapi.com. Run on Oracle:
 *   node scripts/hs-email-link-deal.cjs <dealId>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');
const {
  registerOutreachSlug,
  buildHubSpotEmailAnchor,
  buildManualEmailSubject,
  buildManualEmailBody,
  loadRegistry,
  slugify,
  NO_PHONE,
} = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'docs/selling/_email_link_deal_report.json');
const PATCH = path.join(ROOT, 'docs/selling/_email_link_registry_patch.json');

const DEAL_ID = String(process.argv[2] || '').replace(/\D/g, '');
if (!/^\d{8,}$/.test(DEAL_ID)) {
  console.error('usage: node scripts/hs-email-link-deal.cjs <dealId>');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseHsBody(text, method, p, status) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('<')) {
    throw new Error(
      `HubSpot ${status} ${method} ${p} returned HTML: ${trimmed.slice(0, 160).replace(/\s+/g, ' ')}`,
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`HubSpot ${status} ${method} ${p} not JSON: ${(e.message || e).toString().slice(0, 120)}`);
  }
}

async function hs(method, p, body) {
  const k = hubspotKey();
  if (!k) throw new Error('HUBSPOT_API_KEY missing');
  const headers = { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(`${hubspotBase()}${p}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      const j = parseHsBody(text, method, p, r.status);
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 200)}`);
      } else if (!r.ok) {
        throw new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 400)}`);
      } else {
        if (/^(POST|PATCH|PUT|DELETE)$/.test(method)) await sleep(150);
        return j;
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (!/returned HTML|not JSON|429|50\d/.test(msg) && attempt === 1) throw e;
    }
    const wait = Math.min(8000, 600 * 2 ** (attempt - 1));
    console.log(`WARN retry ${attempt}/5 ${method} ${p} in ${wait}ms:`, lastErr?.message || lastErr);
    await sleep(wait);
  }
  throw lastErr || new Error(`HubSpot ${method} ${p} failed`);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractEmail(text) {
  const m = String(text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

function companyFromDealName(name) {
  return String(name || '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+[—–-]\s+.*$/, '')
    .replace(/\s+\(audit:.*$/i, '')
    .trim();
}

function slugFromDealName(name) {
  const company = companyFromDealName(name) || name;
  return slugify(company).slice(0, 60) || `deal-${DEAL_ID}`;
}

function extractBlock(text, startRe, endRe) {
  const src = String(text || '');
  const start = src.search(startRe);
  if (start < 0) return '';
  const after = src.slice(start).replace(startRe, '');
  const end = endRe ? after.search(endRe) : -1;
  return (end >= 0 ? after.slice(0, end) : after).trim();
}

function existingSlugInNote(html) {
  const m = String(html || '').match(/\/go\/outreach-email\/([a-z0-9-]+)/i);
  return m ? m[1] : '';
}

async function notesOnDeal(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean);
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const batch = await hs('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body', 'hs_timestamp'],
      inputs: chunk.map((id) => ({ id })),
    });
    out.push(...(batch.results || []));
  }
  out.sort((a, b) => String(b.properties?.hs_timestamp || '').localeCompare(String(a.properties?.hs_timestamp || '')));
  return out;
}

async function contactsOnDeal(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/contacts`);
  const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean);
  const out = [];
  for (const id of ids) {
    out.push(
      await hs(
        'GET',
        `/crm/v3/objects/contacts/${id}?properties=email,firstname,lastname,phone,mobilephone,jobtitle,company`,
      ),
    );
  }
  return out;
}

async function companiesOnDeal(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/companies`);
  const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean);
  const out = [];
  for (const id of ids) {
    out.push(
      await hs('GET', `/crm/v3/objects/companies/${id}?properties=name,domain,website,phone,description`),
    );
  }
  return out;
}

async function contactsAtCompany(companyId) {
  if (!companyId) return [];
  const assoc = await hs('GET', `/crm/v4/objects/companies/${companyId}/associations/contacts`);
  const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean).slice(0, 20);
  const out = [];
  for (const id of ids) {
    out.push(await hs('GET', `/crm/v3/objects/contacts/${id}?properties=email,firstname,lastname,jobtitle`));
  }
  return out;
}

async function main() {
  const deal = await hs(
    'GET',
    `/crm/v3/objects/deals/${DEAL_ID}?properties=dealname,dealstage,pipeline,description,amount`,
  );
  const dealName = deal.properties?.dealname || '';
  const contacts = await contactsOnDeal(DEAL_ID);
  const companies = await companiesOnDeal(DEAL_ID);
  let companyContacts = [];
  for (const co of companies) {
    try {
      companyContacts.push(...(await contactsAtCompany(co.id)));
    } catch (e) {
      console.log('WARN company contacts', co.id, e.message || e);
    }
  }
  const notes = await notesOnDeal(DEAL_ID);
  const latest = notes[0];
  if (!latest) throw new Error(`deal ${DEAL_ID} has no notes`);

  const html = latest.properties?.hs_note_body || '';
  const text = stripHtml(html);
  const allNoteText = notes
    .map((n, i) => `#${i + 1} ${n.id} ${n.properties?.hs_timestamp}\n${stripHtml(n.properties?.hs_note_body || '')}`)
    .join('\n\n-----\n\n');
  const haystack = [text, allNoteText, deal.properties?.description, ...companies.map((c) => c.properties?.description)]
    .filter(Boolean)
    .join('\n');
  const partial = {
    ok: false,
    dealId: DEAL_ID,
    dealName,
    dealStage: deal.properties?.dealstage,
    dealUrl: `https://app.hubspot.com/contacts/51409153/record/0-3/${DEAL_ID}`,
    latestNoteId: latest.id,
    latestNoteAt: latest.properties?.hs_timestamp,
    noteCount: notes.length,
    latestNoteText: text.slice(0, 8000),
    allNotesText: allNoteText.slice(0, 12000),
    companies: companies.map((c) => ({
      id: c.id,
      name: c.properties?.name,
      domain: c.properties?.domain,
      website: c.properties?.website,
    })),
  };
  fs.writeFileSync(REPORT, JSON.stringify(partial, null, 2) + '\n');
  console.log('latest_note', latest.id, latest.properties?.hs_timestamp);
  console.log('--- NOTE TEXT START ---');
  console.log(text);
  console.log('--- NOTE TEXT END ---');
  console.log('--- ALL NOTES START ---');
  console.log(allNoteText.slice(0, 4000));
  console.log('--- ALL NOTES END ---');
  const contactEmail =
    [...contacts, ...companyContacts]
      .map((c) => (c.properties?.email || '').trim().toLowerCase())
      .find((e) => e && e.includes('@')) || '';
  const noteTo = extractEmail(text.match(/^TO:\s*(.+)$/m)?.[1] || '') || extractEmail(haystack);
  const to = contactEmail || noteTo;
  const subjectFromNote = (haystack.match(/^SUBJECT:\s*(.+)$/m)?.[1] || '').trim();
  const emailBlock = extractBlock(haystack, /---\s*EMAIL[^\n]*---/, /---\s*(Audit|MENSAJE|WhatsApp|NEXT)/i);
  const mensaje = extractBlock(haystack, /---\s*MENSAJE[^\n]*---/, /---\s*(EMAIL|Audit|NEXT)/i);
  const company = companyFromDealName(dealName);
  const scoreM = dealName.match(/audit:\s*(\d+)/i) || text.match(/(\d{2,3})\s*\/\s*100/);
  const score = scoreM ? Number(scoreM[1]) : 0;

  const registry = loadRegistry();
  const byDeal = Object.entries(registry).find(([, v]) => String(v.dealId || '') === DEAL_ID);
  const slug = existingSlugInNote(html) || (byDeal && byDeal[0]) || slugFromDealName(dealName);

  let body = '';
  let subject = subjectFromNote;
  const longestNote = notes
    .map((n) => stripHtml(n.properties?.hs_note_body || ''))
    .sort((a, b) => b.length - a.length)[0] || '';
  const letterSource = text.length >= 400 ? text : longestNote;
  if (emailBlock && extractEmail(emailBlock.split('\n').slice(0, 8).join('\n'))) {
    const raw = emailBlock.replace(/^\s*SUBJECT:.*$/m, '').replace(/^\s*TO:.*$/m, '').replace(/^\s*CC:.*$/m, '').trim();
    body = raw;
    if (!subject) subject = (emailBlock.match(/^SUBJECT:\s*(.+)$/m)?.[1] || '').trim();
  } else if (mensaje && mensaje.length > 40) {
    body = buildManualEmailBody(mensaje, { botFallback: /bot de reservas|bot of/i.test(text) });
  } else if (letterSource.length > 80) {
    body = letterSource
      .replace(/➡️[^\n]*/g, '')
      .replace(/Email options[\s\S]*?(?=\n\n|$)/i, '')
      .replace(/\[[A-Z0-9-]+\][^\n]*/g, '')
      .trim();
  }
  if (!subject) subject = buildManualEmailSubject(company || slug, score || 0);

  if (!to) throw new Error(`no email on deal ${DEAL_ID} (${dealName}) — contact or note TO: required`);
  if (!body || body.length < 40) throw new Error(`could not extract a sendable letter from note ${latest.id}`);

  const draftRel = `docs/selling/drafts/${slug}-email.txt`;
  const draft = [`SUBJECT: ${subject}`, `TO: ${to}`, '', body.endsWith('\n') ? body : `${body}\n`].join('\n');
  fs.mkdirSync(path.dirname(path.join(ROOT, draftRel)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, draftRel), draft);

  registerOutreachSlug(slug, NO_PHONE, draftRel, company || slug, {
    email: to,
    emailDraft: draftRel,
    dealId: DEAL_ID,
    score: score || undefined,
  });
  const patch = { [slug]: loadRegistry()[slug] };
  fs.writeFileSync(PATCH, JSON.stringify(patch, null, 2) + '\n');

  const sendBtn = buildHubSpotEmailAnchor(slug, to);
  const prefix = [
    sendBtn,
    '',
    '<i><b>Email options (always both):</b> (1) HubSpot → Email from <b>aipa@aideazz.xyz</b> — best CRM trail. (2) Speed: tap <b>ENVIAR POR EMAIL — aipa@</b> → confirm → Resend (same From).</i>',
    '',
  ].join('<br>');

  let patched = false;
  let already = html.includes(`/go/outreach-email/${slug}`);
  if (!already) {
    const newBody = `${prefix}<br>${html}`;
    await hs('PATCH', `/crm/v3/objects/notes/${latest.id}`, { properties: { hs_note_body: newBody } });
    patched = true;
    already = true;
    console.log('patched latest note', latest.id);
  } else {
    console.log('latest note already has send button', latest.id);
  }

  const out = {
    ok: true,
    dealId: DEAL_ID,
    dealName,
    dealStage: deal.properties?.dealstage,
    dealUrl: `https://app.hubspot.com/contacts/51409153/record/0-3/${DEAL_ID}`,
    contactIds: contacts.map((c) => c.id),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim(),
      email: c.properties?.email || '',
    })),
    latestNoteId: latest.id,
    latestNoteAt: latest.properties?.hs_timestamp,
    noteCount: notes.length,
    slug,
    to,
    subject,
    emailDraft: draftRel,
    sendUrl: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
    patched,
    alreadyHadButton: html.includes('/go/outreach-email/'),
    latestNoteText: text.slice(0, 8000),
    next: 'Open the deal → tap ENVIAR POR EMAIL on the latest note.',
  };
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ ...out, latestNoteText: `[${text.length} chars]` }, null, 2));
}

main().catch((e) => {
  try {
    const prev = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    fs.writeFileSync(
      REPORT,
      JSON.stringify(
        {
          ...prev,
          ok: false,
          error: String(e.message || e),
          dealId: DEAL_ID,
        },
        null,
        2,
      ) + '\n',
    );
  } catch {
    fs.writeFileSync(
      REPORT,
      JSON.stringify({ ok: false, dealId: DEAL_ID, error: String(e.message || e) }, null, 2) + '\n',
    );
  }
  console.error(e.stack || e.message || e);
  process.exit(1);
});
