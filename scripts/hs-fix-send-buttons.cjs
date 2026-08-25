#!/usr/bin/env node
/**
 * HubSpot stored `/go/outreach-email/{slug}` as a relative href. Clicking it
 * opens HubSpot's "Edit link" dialog (URL is not a page). Rewrite to the
 * absolute webhook URL and print the same URL in plaintext under the button.
 *
 * Optional: send a PROOF copy of the BSS hire letter + resume to Elena's
 * Gmail — never to contact@bssgroupe.com.
 *
 *   node scripts/hs-fix-send-buttons.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'docs/selling/_fix_send_buttons_report.json');
const ABS_HOST = 'https://webhook.aideazz.xyz/cto/go/outreach-email';
const PROOF_TO = 'elena.revicheva2016@gmail.com';

const DEALS = [
  { dealId: '64302436100', slug: 'intelliops-bd', name: 'IntelliOps BD' },
  { dealId: '64302126655', slug: 'ai-native-b2b-marketplace', name: 'BSS Groupe' },
];

function absUrl(slug) {
  return `${ABS_HOST}/${slug}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseHsBody(text, method, p, status) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('<')) {
    throw new Error(`HubSpot ${status} ${method} ${p} returned HTML: ${trimmed.slice(0, 160)}`);
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`HubSpot ${status} ${method} ${p} not JSON: ${e.message}`);
  }
}

async function hs(method, p, body) {
  const k = hubspotKey();
  if (!k) throw new Error('HUBSPOT_API_KEY missing');
  const headers = { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(`${hubspotBase()}${p}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    const j = parseHsBody(text, method, p, r.status);
    if (r.ok) {
      if (/^(POST|PATCH|PUT)$/.test(method)) await sleep(150);
      return j;
    }
    lastErr = new Error(`HubSpot ${r.status} ${method} ${p}: ${j.message || text.slice(0, 300)}`);
    if (r.status !== 429 && r.status < 500) throw lastErr;
    await sleep(Math.min(8000, 600 * 2 ** (attempt - 1)));
  }
  throw lastErr;
}

/**
 * Force every outreach-email href for this slug to the absolute webhook URL,
 * and ensure the raw URL is visible as text (HubSpot's editor cannot hide it).
 */
function rewriteNoteHtml(html, slug) {
  const url = absUrl(slug);
  let out = String(html || '');
  const hrefRe = new RegExp(
    `href=(["'])(?:https?:\\/\\/[^"']+)?(?:\\/cto)?\\/go\\/outreach-email\\/${slug}\\1`,
    'gi',
  );
  out = out.replace(hrefRe, `href="${url}"`);
  out = out.replace(
    new RegExp(`href=(["'])\\/go\\/outreach-email\\/${slug}\\1`, 'gi'),
    `href="${url}"`,
  );
  if (!out.includes(`href="${url}"`) && out.includes(`/go/outreach-email/${slug}`)) {
    out = out.replace(
      new RegExp(`<a([^>]*?)href=["'][^"']*\\/go\\/outreach-email\\/${slug}["']([^>]*)>`, 'i'),
      `<a$1href="${url}"$2>`,
    );
  }
  const plain = `Open this URL if the button fails: ${url}`;
  if (!out.includes(url)) {
    out = `<a href="${url}"><b>➡️ ENVIAR POR EMAIL — aipa@aideazz.xyz</b></a><br>${plain}<br><br>${out}`;
  } else if (!out.includes('Open this URL if the button fails:')) {
    out = out.replace(new RegExp(`(<a[^>]*href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>.*?<\\/a>)`, 'i'), `$1<br>${plain}`);
  }
  return out;
}

function envValue(name) {
  const live = process.env[name];
  if (live && String(live).trim()) return String(live).trim();
  const file = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  return file.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || '';
}

async function sendProofToGmail() {
  const apiKey = envValue('RESEND_API_KEY') || envValue('RESEND_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  const pdfRel = 'docs/selling/attachments/15.07.26_EN_Resume_Elena_Revicheva_compressed.pdf';
  const pdf = fs.readFileSync(path.join(ROOT, pdfRel));
  if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('resume is not a PDF');
  const sha = crypto.createHash('sha256').update(pdf).digest('hex');
  const draft = fs.readFileSync(
    path.join(ROOT, 'docs/selling/drafts/ai-native-b2b-marketplace-email.txt'),
    'utf8',
  );
  const body = draft
    .replace(/^SUBJECT:.*$/m, '')
    .replace(/^TO:.*$/m, '')
    .trim();
  const from = 'Elena Revicheva <aipa@aideazz.xyz>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [PROOF_TO],
      subject: '[PROOF — not sent to BSS] Hire me letter + Elena_Revicheva_Resume.pdf',
      text:
        `This is a proof copy sent only to ${PROOF_TO}.\n` +
        `BSS (contact@bssgroupe.com) was NOT emailed.\n` +
        `Attachment: Elena_Revicheva_Resume.pdf (${pdf.length} bytes, sha256 ${sha.slice(0, 12)}…)\n` +
        `If Gmail shows a paperclip and the PDF opens, the BSS one-click send will attach the same file.\n\n` +
        `--- letter BSS will get ---\n\n${body}\n`,
      attachments: [
        {
          filename: 'Elena_Revicheva_Resume.pdf',
          content: pdf.toString('base64'),
          content_type: 'application/pdf',
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { to: PROOF_TO, resendId: j.id, bytes: pdf.length, sha256: sha, filename: 'Elena_Revicheva_Resume.pdf' };
}

async function notesForDeal(dealId) {
  const assoc = await hs(
    'GET',
    `/crm/v4/objects/deals/${dealId}/associations/notes`,
  );
  const ids = (assoc.results || []).map((x) => x.toObjectId || x.id).filter(Boolean);
  const notes = [];
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    notes.push(n);
  }
  notes.sort((a, b) => String(b.properties?.hs_timestamp || '').localeCompare(String(a.properties?.hs_timestamp || '')));
  return notes;
}

async function main() {
  const out = { ok: true, deals: [], proof: null };
  for (const d of DEALS) {
    const url = absUrl(d.slug);
    const notes = await notesForDeal(d.dealId);
    const patched = [];
    for (const n of notes) {
      const html = n.properties?.hs_note_body || '';
      if (!html.includes('/go/outreach-email/') && !html.includes(url)) continue;
      const next = rewriteNoteHtml(html, d.slug);
      const changed = next !== html;
      if (changed) {
        await hs('PATCH', `/crm/v3/objects/notes/${n.id}`, { properties: { hs_note_body: next } });
      }
      patched.push({
        noteId: n.id,
        changed,
        hasAbsHref: next.includes(`href="${url}"`),
        hasPlainUrl: next.includes(url),
        relativeLeft: /href=["']\/go\/outreach-email\//.test(next),
      });
    }
    out.deals.push({
      ...d,
      url,
      noteCount: notes.length,
      patched,
    });
  }
  out.proof = await sendProofToGmail();
  fs.writeFileSync(REPORT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
  const bad = out.deals.some((d) => (d.patched || []).some((p) => p.relativeLeft || !p.hasAbsHref));
  if (bad || !out.proof?.resendId) process.exit(1);
}

module.exports = { rewriteNoteHtml, absUrl };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
