#!/usr/bin/env node
/**
 * Read-only Resend proof for one send id.
 *
 * Cloud agents cannot reach api.resend.com. Run on Oracle:
 *   node scripts/resend-email-proof.cjs <resend-id>
 *
 * Writes /tmp/resend-email-proof.json (no API keys, no HTML body).
 * Does not stamp HubSpot and does not send mail.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CTO_AIPA_ROOT || path.join(__dirname, '..');
const OUT = process.env.RESEND_PROOF_OUT || '/tmp/resend-email-proof.json';
const DEFAULT_ID = 'd0721a1e-2eb2-48f0-b6b4-c15ce1743def';

function envValue(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  try {
    return fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

function stripHtml(email) {
  if (!email || typeof email !== 'object') return email;
  const copy = { ...email };
  delete copy.html;
  delete copy.text;
  return copy;
}

function extractStamps(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const marks = [];
  const re =
    /(✅[^.]{0,160}ENTREGADO[^.]{0,200}|👀[^.]{0,160}ABIERTO[^.]{0,200}|🔗[^.]{0,160}CLIC[^.]{0,200}|⛔[^.]{0,160}REBOTE[^.]{0,200}|📧\s*EMAILED[^.]{0,200}|⛔[^.]{0,80}SUPRIMIDO[^.]{0,200})/gi;
  let m;
  while ((m = re.exec(text))) marks.push(m[1].trim());
  const markers = [...String(html || '').matchAll(/<!-- resend:([^>]+) -->/g)].map((x) => x[1]);
  return { stamps: marks, markers };
}

function verdictFrom(api, stamps, logLines) {
  const last = String(api?.last_event || '').toLowerCase();
  const blob = `${stamps.stamps.join('\n')}\n${stamps.markers.join('\n')}\n${(logLines || []).join('\n')}`.toLowerCase();
  const delivered =
    last === 'delivered' ||
    last === 'opened' ||
    last === 'clicked' ||
    /email\.delivered|entregado/.test(blob);
  const opened = last === 'opened' || last === 'clicked' || /email\.opened|abierto/.test(blob);
  const clicked = last === 'clicked' || /email\.clicked|clic en enlace/.test(blob);
  const bounced = last === 'bounced' || /email\.bounced|rebote/.test(blob);
  return {
    last_event: last || null,
    delivered: delivered ? 'yes' : bounced && !delivered ? 'no' : 'unknown',
    opened: opened ? 'yes-or-implied-by-click' : 'no-open-event-seen',
    clicked: clicked ? 'yes' : 'no-click-event-seen',
    bounced: bounced ? 'yes' : 'no',
    note:
      'last_event is one field for the whole message (To + every Cc). ' +
      'A bounce on one Cc can hide a delivery to the others. ' +
      'A click is a human act and proves that mailbox received the mail. ' +
      'An open is a soft pixel and may be a proxy.',
  };
}

async function resendGet(apiKey, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: r.status, json, text: json ? undefined : text.slice(0, 240) };
}

function grepLogs(id) {
  const files = [
    path.join(process.env.HOME || '/home/ubuntu', '.pm2/logs/cto-aipa-out.log'),
    path.join(process.env.HOME || '/home/ubuntu', '.pm2/logs/cto-aipa-error.log'),
    '/home/ubuntu/logs/resend-reconcile.log',
    path.join(ROOT, 'logs/resend-reconcile.log'),
  ];
  const hits = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f, 'utf8');
    for (const line of buf.split('\n')) {
      if (line.includes(id) || (line.includes('resend-webhook') && line.includes('afterquery'))) {
        hits.push(`${path.basename(f)}: ${line.trim().slice(0, 300)}`);
      }
    }
  }
  return hits.slice(-40);
}

async function hubspotStamps(key, dealId) {
  if (!key || !dealId) return { error: 'no hubspot key or dealId' };
  const assoc = await fetch(`https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/notes`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const assocJson = await assoc.json();
  const ids = (assocJson.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const collected = { stamps: [], markers: [], noteIds: ids };
  for (const nid of ids.slice(0, 8)) {
    const n = await fetch(`https://api.hubapi.com/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_timestamp`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const j = await n.json();
    const parsed = extractStamps(j.properties?.hs_note_body || '');
    collected.stamps.push(...parsed.stamps);
    collected.markers.push(...parsed.markers);
  }
  return collected;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    const parsed = extractStamps(
      '<!-- resend:abc:email.delivered --><b>✅ [PRIMER CONTACTO] ENTREGADO 2026-08-30 → a@b.com (Resend confirmó la entrega · Resend id abc)</b><br>' +
        '<!-- resend:abc:email.opened --><b>👀 [PRIMER CONTACTO] ABIERTO 2026-08-30 → a@b.com</b>',
    );
    if (parsed.stamps.length < 2 || parsed.markers.length !== 2) {
      console.error('self-test failed', parsed);
      process.exit(1);
    }
    const v = verdictFrom({ last_event: 'clicked' }, parsed, ['[resend-webhook] email.clicked']);
    if (v.delivered !== 'yes' || v.clicked !== 'yes') {
      console.error('verdict self-test failed', v);
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, parsed, verdict: v }, null, 2));
    return;
  }

  const id = (process.argv[2] || DEFAULT_ID).replace(/[^a-f0-9-]/gi, '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    console.error('usage: node scripts/resend-email-proof.cjs <resend-uuid>');
    process.exit(1);
  }

  const RESEND = envValue('RESEND_API_KEY') || envValue('RESEND_KEY');
  const HS = envValue('HUBSPOT_API_KEY');
  if (!RESEND) throw new Error('RESEND_API_KEY missing');

  let ledger = {};
  try {
    ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/resend-ledger.json'), 'utf8'));
  } catch {
    ledger = {};
  }
  const entry = ledger[id] || null;

  const api = await resendGet(RESEND, `https://api.resend.com/emails/${id}`);
  const eventsTried = [];
  for (const url of [
    `https://api.resend.com/emails/${id}/events`,
    `https://api.resend.com/emails/${id}?include=events`,
  ]) {
    const extra = await resendGet(RESEND, url);
    eventsTried.push({ url: url.replace(id, '{id}'), status: extra.status, json: extra.json ? stripHtml(extra.json) : extra.text });
  }

  const logLines = grepLogs(id);
  const hsStamps = await hubspotStamps(HS, entry?.dealId).catch((e) => ({ error: e.message }));
  const email = stripHtml(api.json);
  const report = {
    at: new Date().toISOString(),
    resendId: id,
    ledger: entry,
    api: { status: api.status, email },
    extraEndpoints: eventsTried,
    webhookLogHits: logLines,
    hubspotNote: hsStamps,
    verdict: verdictFrom(email, hsStamps.stamps ? hsStamps : { stamps: [], markers: [] }, logLines),
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { extractStamps, verdictFrom, stripHtml };
