#!/usr/bin/env node
/**
 * Recreate the IntelliOps BD story on the HubSpot deal:
 *   Zoho/Gmail IMAP dump + HubSpot CRM emails → timeline notes
 *   PDF agreements → HubSpot Files attached on the deal
 *   CLIENT-MANUAL one-click ➡️ ENVIAR POR EMAIL on the action note
 *
 * Run on Oracle (IMAP + api.hubapi.com):
 *   python3 scripts/intelliops-imap-pull.py
 *   node scripts/hs-intelliops-story.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase, hubspotOwnerId } = require('./hs-env.cjs');
const { registerOutreachSlug, buildHubSpotEmailAnchor, NO_PHONE } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'docs/selling/_intelliops_hs_report.json');
const THREAD = path.join(ROOT, 'docs/selling/_intelliops_thread.json');
const MAIL_INDEX = '/tmp/intelliops-mail/index.json';
const SLUG = 'intelliops-bd';
const TO = 'nishant.chaudhary@intelliopsautomation.com';
const NOTE_MARKER = '[INTELLIOPS BD] 25 Aug 2026';
const STORY_MARKER = '[INTELLIOPS STORY]';
const MAIL_MARKER = '[INTELLIOPS MAIL]';
const FILE_MARKER = '[INTELLIOPS FILE]';
const DEAL_NAME = '[HIRING-MANUAL] BD Expert @ IntelliOps Automation';

const EMAIL_DRAFT_REL = 'docs/selling/drafts/intelliops-bd-email.txt';
const REPLY_SRC = path.join(ROOT, 'docs/selling/drafts/intelliops-reply-2026-08-25.txt');

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseHsBody(text, method, p, status) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('<')) {
    throw new Error(
      `HubSpot ${status} ${method} ${p} returned HTML (rate-limit/WAF): ${trimmed.slice(0, 180).replace(/\s+/g, ' ')}`,
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error(
      `HubSpot ${status} ${method} ${p} not JSON: ${(e.message || e).toString().slice(0, 120)} :: ${trimmed.slice(0, 180)}`,
    );
  }
}

async function hs(method, p, body, extraHeaders) {
  const k = hubspotKey();
  if (!k) throw new Error('HUBSPOT_API_KEY missing');
  const headers = { Authorization: `Bearer ${k}`, ...(extraHeaders || {}) };
  let payload = body;
  if (body !== undefined && !(body instanceof FormData) && !extraHeaders) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const r = await fetch(`${hubspotBase()}${p}`, { method, headers, body: payload });
      const text = await r.text();
      const j = parseHsBody(text, method, p, r.status);
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 200)}`);
      } else if (!r.ok) {
        throw new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 400)}`);
      } else {
        if (/^(POST|PATCH|PUT|DELETE)$/.test(method)) await sleep(200);
        return j;
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (!/returned HTML|not JSON|429|50\d/.test(msg) && attempt === 1) throw e;
    }
    const wait = Math.min(12000, 700 * 2 ** (attempt - 1));
    console.log(`WARN HubSpot retry ${attempt}/6 ${method} ${p} in ${wait}ms:`, lastErr?.message || lastErr);
    await sleep(wait);
  }
  throw lastErr || new Error(`HubSpot ${method} ${p} failed`);
}

async function associate(fromType, fromId, toType, toId, typeId) {
  await hs('PUT', `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId },
  ]);
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
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
  return out;
}

async function uploadPdf(filePath, filename) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), filename);
  fd.append('folderPath', '/intelliops-bd');
  fd.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: true }));
  const r = await fetch(`${hubspotBase()}/files/v3/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hubspotKey()}` },
    body: fd,
  });
  const text = await r.text();
  if (!r.ok || String(text).trim().startsWith('<')) {
    throw new Error(`files upload ${r.status}: ${text.slice(0, 400)}`);
  }
  return parseHsBody(text, 'POST', '/files/v3/files', r.status);
}

function classifyPdf(name, bytes) {
  if (bytes > 100000) return 'v1-20-aug-from-natalie';
  if (bytes > 0 && bytes < 80000) return 'v2-24-aug-from-nishant';
  const n = String(name || '').toLowerCase();
  if (/revised|24/.test(n)) return 'v2-revised-24-aug';
  return 'agreement-pdf';
}

function isNoise(m) {
  const blob = `${m.from || ''} ${m.to || ''} ${m.subject || ''}`.toLowerCase();
  return /github\.com|notifications@github|cursor\[bot\]|github-actions\[bot\]/.test(blob);
}

function docToken() {
  const crypto = require('crypto');
  const paths = [
    path.join(ROOT, 'data/intelliops-doc-token'),
    '/tmp/intelliops-doc-token',
  ];
  for (const tokenPath of paths) {
    try {
      const t = fs.readFileSync(tokenPath, 'utf8').trim();
      if (/^[a-f0-9]{16,}$/.test(t)) return t;
    } catch {
      /* try next */
    }
  }
  const t = crypto.randomBytes(12).toString('hex');
  for (const tokenPath of paths) {
    try {
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, t);
    } catch {
      /* data/ may be unwritable */
    }
  }
  return t;
}

function hostPdfOnDoc(filePath, version) {
  const { execFileSync } = require('child_process');
  const token = docToken();
  const name = `intelliops-${version}-${token}.pdf`;
  const destDir = '/var/www/aideazz-docs';
  const dest = `${destDir}/${name}`;
  try {
    execFileSync('sudo', ['-n', 'mkdir', '-p', destDir], { stdio: 'pipe' });
  } catch {
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      console.log('WARN mkdir', destDir, e.message || e);
    }
  }
  try {
    fs.copyFileSync(filePath, dest);
    fs.chmodSync(dest, 0o644);
  } catch (copyErr) {
    console.log('WARN direct copy', dest, copyErr.message || copyErr);
    try {
      execFileSync('sudo', ['-n', 'cp', filePath, dest], { stdio: 'pipe' });
      execFileSync('sudo', ['-n', 'chmod', '644', dest], { stdio: 'pipe' });
    } catch (e) {
      console.log('WARN sudo -n cp', dest, e.message || e);
      return null;
    }
  }
  if (!fs.existsSync(dest)) {
    console.log('WARN hosted file missing after copy', dest);
    return null;
  }
  return `https://webhook.aideazz.xyz/doc/${name}`;
}

async function hubspotEmailsForContact(contactId) {
  const out = [];
  try {
    const assoc = await hs('GET', `/crm/v4/objects/contacts/${contactId}/associations/emails`);
    const ids = (assoc.results || []).map((r) => r.toObjectId).filter(Boolean);
    for (const id of ids) {
      const e = await hs(
        'GET',
        `/crm/v3/objects/emails/${id}?properties=hs_email_subject,hs_email_text,hs_email_html,hs_email_direction,hs_email_from_email,hs_email_to_email,hs_timestamp,hs_attachment_ids`,
      );
      out.push(e);
    }
  } catch (err) {
    console.log('WARN contact email associations', err.message || err);
  }
  // also token-search in case associations are empty
  try {
    const s = await hs('POST', '/crm/v3/objects/emails/search', {
      filterGroups: [
        { filters: [{ propertyName: 'hs_email_from_email', operator: 'CONTAINS_TOKEN', value: 'intelliops' }] },
        { filters: [{ propertyName: 'hs_email_to_email', operator: 'CONTAINS_TOKEN', value: 'intelliops' }] },
        { filters: [{ propertyName: 'hs_email_subject', operator: 'CONTAINS_TOKEN', value: 'IntelliOps' }] },
      ],
      properties: [
        'hs_email_subject',
        'hs_email_text',
        'hs_email_from_email',
        'hs_email_to_email',
        'hs_timestamp',
        'hs_email_direction',
        'hs_attachment_ids',
      ],
      limit: 50,
    });
    for (const e of s.results || []) {
      if (!out.some((x) => x.id === e.id)) out.push(e);
    }
  } catch (err) {
    console.log('WARN email search', err.message || err);
  }
  return out;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const report = loadJson(REPORT, {});
  const dealId = report.dealId;
  const contactId = report.contactId;
  if (!dealId || !contactId) throw new Error('missing deal/contact in _intelliops_hs_report.json — run hs-note-intelliops-eval.cjs first');

  const mailDump = loadJson(MAIL_INDEX, { messages: [] });
  const imapMessages = (mailDump.messages || []).filter((m) => !isNoise(m));
  console.log('imap_messages', imapMessages.length, 'accounts', (mailDump.accounts || []).join(','));

  const crmEmails = await hubspotEmailsForContact(contactId);
  console.log('hubspot_emails', crmEmails.length);

  const thread = [];
  for (const m of imapMessages) {
    thread.push({
      source: `imap:${m.account}`,
      date: m.date,
      from: m.from,
      to: m.to,
      subject: m.subject,
      excerpt: String(m.body || '').slice(0, 1500),
      attachments: (m.attachments || []).map((a) => a.filename),
      paths: m.attachments || [],
    });
  }
  for (const e of crmEmails) {
    const p = e.properties || {};
    const from = p.hs_email_from_email || '';
    const to = p.hs_email_to_email || '';
    const subj = p.hs_email_subject || '';
    const blob = `${from} ${to} ${subj}`.toLowerCase();
    if (!/intelliops|nishant/.test(blob)) continue;
    thread.push({
      source: 'hubspot-crm',
      date: p.hs_timestamp,
      from,
      to,
      subject: subj,
      direction: p.hs_email_direction,
      excerpt: String(p.hs_email_text || stripHtml(p.hs_email_html) || '').slice(0, 1500),
      attachments: p.hs_attachment_ids ? String(p.hs_attachment_ids).split(/[;,]/).filter(Boolean) : [],
      emailId: e.id,
    });
  }
  thread.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const existing = await notesOnDeal(dealId);
  let deletedNoise = 0;
  for (const n of existing) {
    const b = n.properties?.hs_note_body || '';
    if (b.includes(MAIL_MARKER) && /AIPA_AITCF|notifications@github|github-actions/.test(b)) {
      try {
        await hs('DELETE', `/crm/v3/objects/notes/${n.id}`);
        deletedNoise += 1;
        console.log('deleted noise note', n.id);
        await sleep(250);
      } catch (e) {
        console.log('WARN delete note', n.id, e.message || e);
      }
    }
  }
  if (deletedNoise) await sleep(1500);

  // Recruiter who sent v1
  const NATALIE = 'natalie.adel@intelliopsautomation.com';
  try {
    const found = await hs('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: NATALIE }] }],
      properties: ['email', 'firstname', 'lastname'],
      limit: 1,
    });
    let natalie = (found.results || [])[0];
    if (!natalie) {
      natalie = await hs('POST', '/crm/v3/objects/contacts', {
        properties: {
          firstname: 'Natalie',
          lastname: 'Adel',
          email: NATALIE,
          company: 'IntelliOps Automation',
          jobtitle: 'Recruiter',
          hubspot_owner_id: hubspotOwnerId(),
        },
      });
      console.log('created natalie', natalie.id);
    }
    await associate('deals', dealId, 'contacts', natalie.id, 3);
    await associate('contacts', natalie.id, 'companies', report.companyId, 1);
  } catch (e) {
    console.log('WARN natalie', e.message || e);
  }

  const existing2 = await notesOnDeal(dealId);
  const have = (prefix) => existing2.filter((n) => (n.properties?.hs_note_body || '').includes(prefix));

  const pdfs = [];
  for (const m of imapMessages) {
    for (const a of m.attachments || []) {
      if (!a.path || !fs.existsSync(a.path)) continue;
      pdfs.push({ ...a, date: m.date, subject: m.subject, from: m.from });
    }
  }
  const uniquePdfs = [];
  const seenHash = new Set();
  for (const p of pdfs) {
    const key = `${p.bytes}:${p.filename}`;
    if (seenHash.has(key)) continue;
    seenHash.add(key);
    uniquePdfs.push(p);
  }
  console.log('pdf_candidates', uniquePdfs.map((p) => `${p.filename} ${p.bytes}`).join(' | ') || '(none)');

  const hosted = [];
  for (const p of uniquePdfs) {
    const label = classifyPdf(p.filename, p.bytes);
    const marker = `${FILE_MARKER} ${label}`;
    const docUrl = hostPdfOnDoc(p.path, label);
    let fileId = null;
    try {
      const f = await uploadPdf(p.path, `${label}.pdf`);
      fileId = f.id;
      console.log('uploaded hubspot file', label, fileId);
    } catch (err) {
      console.log('WARN hubspot files scope missing — using /doc/ link', err.message || err);
    }
    hosted.push({ label, filename: p.filename, bytes: p.bytes, fileId, docUrl });
    const link = docUrl
      ? `<a href="${esc(docUrl)}"><b>Download ${esc(label)} PDF</b></a>`
      : '<i>PDF on Oracle /tmp/intelliops-mail — HubSpot Files scope not granted.</i>';
    const body = [
      `<b>${esc(marker)}</b>`,
      '',
      link,
      `From: ${esc(p.from)}`,
      `Subject: ${esc(p.subject)}`,
      `Date: ${esc(p.date)}`,
      `Size: ${p.bytes} bytes`,
      fileId ? `HubSpot file id: ${esc(fileId)}` : '',
    ].join('<br>');
    try {
      const already = have(marker)[0];
      if (already) {
        await hs('PATCH', `/crm/v3/objects/notes/${already.id}`, {
          properties: {
            hs_note_body: body,
            ...(fileId ? { hs_attachment_ids: String(fileId) } : {}),
          },
        });
        console.log('patched file note', label, already.id);
      } else {
        const note = await hs('POST', '/crm/v3/objects/notes', {
          properties: {
            hs_note_body: body,
            hs_timestamp: p.date && !Number.isNaN(Date.parse(p.date)) ? new Date(p.date).toISOString() : new Date().toISOString(),
            ...(fileId ? { hs_attachment_ids: String(fileId) } : {}),
          },
        });
        await associate('notes', note.id, 'deals', dealId, 214);
        await associate('notes', note.id, 'contacts', contactId, 202);
        console.log('file note', label, note.id, docUrl || 'no-url');
      }
    } catch (err) {
      console.log('WARN file note', label, err.message || err);
    }
  }

  for (const m of thread) {
    const marker = `${MAIL_MARKER} ${String(m.date || '').slice(0, 16)} ${String(m.subject || '').slice(0, 80)}`;
    if (have(marker).length || have(`${MAIL_MARKER} ${m.subject}`).length) continue;
    const body = [
      `<b>${esc(marker)}</b>`,
      `<i>${esc(m.source)}</i>`,
      `<b>From:</b> ${esc(m.from)}`,
      `<b>To:</b> ${esc(m.to)}`,
      `<b>Date:</b> ${esc(m.date)}`,
      m.attachments?.length ? `<b>Attachments:</b> ${esc((m.attachments || []).join(', '))}` : '',
      '',
      nl2br(String(m.excerpt || '(no body)')),
    ].join('<br>');
    try {
      const note = await hs('POST', '/crm/v3/objects/notes', {
        properties: {
          hs_note_body: body,
          hs_timestamp:
            m.date && !Number.isNaN(Date.parse(m.date)) ? new Date(m.date).toISOString() : new Date().toISOString(),
        },
      });
      await associate('notes', note.id, 'deals', dealId, 214);
      await associate('notes', note.id, 'contacts', contactId, 202);
      console.log('mail note', marker.slice(0, 80));
    } catch (err) {
      console.log('WARN mail note', marker.slice(0, 80), err.message || err);
    }
  }

  // Registry + one-click send (same path as CLIENT-MANUAL)
  const reply = fs.readFileSync(REPLY_SRC, 'utf8');
  const emailDraftPath = path.join(ROOT, EMAIL_DRAFT_REL);
  fs.writeFileSync(emailDraftPath, reply.endsWith('\n') ? reply : `${reply}\n`);
  registerOutreachSlug(SLUG, NO_PHONE, EMAIL_DRAFT_REL, 'IntelliOps Automation', {
    email: TO,
    emailDraft: EMAIL_DRAFT_REL,
    dealId,
    cc: 'natalie.adel@intelliopsautomation.com',
  });
  const { loadRegistry } = require('./wa-link-lib.cjs');
  const patch = { [SLUG]: loadRegistry()[SLUG] };
  fs.writeFileSync(path.join(ROOT, 'docs/selling/_intelliops_registry_patch.json'), JSON.stringify(patch, null, 2) + '\n');

  const sendBtn = buildHubSpotEmailAnchor(SLUG, TO);
  const actionPrefix = [
    sendBtn,
    '',
    '<i><b>Email options (always both):</b> (1) HubSpot → Email from <b>aipa@aideazz.xyz</b> — best CRM trail. (2) Speed: tap <b>ENVIAR POR EMAIL — aipa@</b> → confirm → Resend (same From). Do not countersign v2.</i>',
    '',
  ].join('<br>');

  let sendButtonOnActionNote = false;
  let actionNote = existing2.find((n) => (n.properties?.hs_note_body || '').includes(NOTE_MARKER));
  if (actionNote) {
    let body = actionNote.properties.hs_note_body || '';
    if (!body.includes('/go/outreach-email/intelliops-bd')) {
      body = `${actionPrefix}<br>${body}`;
      await hs('PATCH', `/crm/v3/objects/notes/${actionNote.id}`, { properties: { hs_note_body: body } });
      console.log('patched action note with send button', actionNote.id);
    } else {
      console.log('action note already has send button', actionNote.id);
    }
    sendButtonOnActionNote = true;
  } else {
    console.log('WARN action note with', NOTE_MARKER, 'not found');
  }

  const storyLines = [
      `<b>${STORY_MARKER} full thread on this deal</b>`,
      '',
      'Natalie Adel shortlisted Elena (18 Aug), calibration call 19 Aug.',
      '20 Aug Natalie sent v1 agreement PDF. 23 Aug Elena replied with four items (entity, governing law, monthly statement, attribution).',
      '24 Aug Nishant sent v2 revised PDF. Still not collectable — do not countersign.',
      `IMAP messages kept: ${imapMessages.length}. PDFs: ${hosted.map((h) => h.label).join(', ') || 'none'}.`,
      '',
      '<b>Thread (oldest → newest)</b>',
      ...thread.map(
        (m, i) =>
          `${i + 1}. ${esc(String(m.date || '').slice(0, 19))} · ${esc(m.source)} · ${esc(m.from)} · ${esc(m.subject)} · atts=${esc((m.attachments || []).join('|') || 'none')}`,
      ),
      hosted.some((h) => h.docUrl)
        ? `<br><b>Agreement PDFs (tap):</b> ${hosted
            .filter((h) => h.docUrl)
            .map((h) => `<a href="${esc(h.docUrl)}">${esc(h.label)}</a>`)
            .join(' · ')}`
        : '<br><i>PDFs not hosted — HubSpot Files scope missing and /doc/ copy failed.</i>',
    ].join('<br>');
  const storyHave = have(STORY_MARKER);
  if (storyHave.length) {
    await hs('PATCH', `/crm/v3/objects/notes/${storyHave[0].id}`, { properties: { hs_note_body: storyLines } });
    console.log('patched story note', storyHave[0].id);
  } else {
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: storyLines, hs_timestamp: new Date().toISOString() },
    });
    await associate('notes', note.id, 'deals', dealId, 214);
    await associate('notes', note.id, 'contacts', contactId, 202);
    console.log('story note', note.id);
  }

  const out = {
    ok: true,
    dealId,
    dealName: DEAL_NAME,
    contactId,
    slug: SLUG,
    sendUrl: `https://webhook.aideazz.xyz/cto/go/outreach-email/${SLUG}`,
    imapMessages: imapMessages.length,
    hubspotEmails: crmEmails.length,
    thread: thread.map((m) => ({
      date: m.date,
      source: m.source,
      from: m.from,
      to: m.to,
      subject: m.subject,
      attachments: m.attachments,
    })),
    pdfs: hosted.map((h) => ({ label: h.label, filename: h.filename, bytes: h.bytes, hosted: Boolean(h.docUrl) })),
    sendButtonOnActionNote,
    next: 'Open the deal → tap ENVIAR POR EMAIL. Do not countersign.',
  };
  fs.writeFileSync(THREAD, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ ...report, ...out, created: report.created }, null, 2) + '\n',
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
