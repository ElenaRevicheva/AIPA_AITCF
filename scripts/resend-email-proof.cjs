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
    .replace(/[ \t]+/g, ' ');
  const marks = [];
  const re =
    /(✅[^\n]{0,220}ENTREGADO[^\n]{0,220}|👀[^\n]{0,220}ABIERTO[^\n]{0,220}|🔗[^\n]{0,220}CLIC[^\n]{0,220}|⛔[^\n]{0,220}REBOTE[^\n]{0,220}|📧\s*EMAILED[^\n]{0,220}|⛔[^\n]{0,80}SUPRIMIDO[^\n]{0,220})/gi;
  let m;
  while ((m = re.exec(text))) marks.push(m[1].replace(/\s+/g, ' ').trim());
  const markers = [...String(html || '').matchAll(/<!--\s*resend:([^>]+)-->/g)].map((x) => x[1].trim());
  const resendIds = [...String(html || '').matchAll(/Resend(?: id|:) ?([0-9a-f-]{36})/gi)].map((x) => x[1]);
  return { stamps: marks, markers, resendIds };
}

function verdictFrom(api, stamps, logLines) {
  const last = String(api?.last_event || '').toLowerCase();
  const blob = `${(stamps.stamps || []).join('\n')}\n${(stamps.markers || []).join('\n')}\n${(logLines || []).join('\n')}`.toLowerCase();
  const clicked = last === 'clicked' || /email\.clicked|clic en enlace/.test(blob);
  const openedEvent = last === 'opened' || /email\.opened|\[\w[^\]]*\] abierto|\babierto \d{4}-/.test(blob);
  const deliveredEvent = last === 'delivered' || /email\.delivered|entregado/.test(blob);
  const bounced = last === 'bounced' || /email\.bounced|rebote/.test(blob);
  const delivered = deliveredEvent || openedEvent || clicked || last === 'opened' || last === 'clicked';
  return {
    last_event: last || null,
    delivered: delivered ? 'yes' : bounced ? 'no-for-the-bouncing-address-only' : 'unknown',
    deliveredHow: deliveredEvent
      ? 'resend-email.delivered'
      : clicked || openedEvent
        ? 'implied-by-later-event-not-a-delivered-stamp'
        : 'none',
    opened: openedEvent ? 'yes-open-event' : clicked ? 'no-open-event-click-is-not-an-open' : 'no-open-event-seen',
    clicked: clicked ? 'yes' : 'no-click-event-seen',
    bounced: bounced ? 'yes' : 'no',
    note:
      'Resend last_event is one field for the whole message (To + every Cc). ' +
      'A bounce on one Cc can hide a delivery to the others. ' +
      'A click is a human act and proves that mailbox received the mail. ' +
      'An open is a soft pixel and may be a proxy. ' +
      'EMAILED is API accept, not delivery.',
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

function listLogFiles() {
  const dirs = [
    path.join(process.env.HOME || '/home/ubuntu', '.pm2/logs'),
    '/home/ubuntu/logs',
    path.join(ROOT, 'logs'),
  ];
  const out = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      out.push(path.join(dir, name));
    }
  }
  return out;
}

function grepLogs(id) {
  const files = listLogFiles();
  const hits = [];
  for (const f of files) {
    try {
      if (!fs.statSync(f).isFile()) continue;
      if (fs.statSync(f).size > 40 * 1024 * 1024) continue;
      const buf = fs.readFileSync(f, 'utf8');
      for (const line of buf.split('\n')) {
        if (
          line.includes(id) ||
          (line.includes('[resend-webhook]') && /afterquery|d0721a1e/i.test(line))
        ) {
          hits.push(`${path.basename(f)}: ${line.trim().slice(0, 360)}`);
        }
      }
    } catch {
      /* unreadable */
    }
  }
  return { filesTried: files.map((f) => path.basename(f)), hits: hits.slice(-60) };
}

async function hsGet(key, p) {
  const r = await fetch(`https://api.hubapi.com${p}`, { headers: { Authorization: `Bearer ${key}` } });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function hubspotStamps(key, dealId, engagementId) {
  if (!key || !dealId) return { error: 'no hubspot key or dealId' };
  const assoc = await hsGet(key, `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const collected = { stamps: [], markers: [], resendIds: [], noteIds: ids, tasks: [] };
  for (const nid of ids.slice(0, 8)) {
    const n = await hsGet(key, `/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_timestamp`);
    const parsed = extractStamps(n.properties?.hs_note_body || '');
    collected.stamps.push(...parsed.stamps);
    collected.markers.push(...parsed.markers);
    collected.resendIds.push(...parsed.resendIds);
  }
  const tAssoc = await hsGet(key, `/crm/v4/objects/deals/${dealId}/associations/tasks`).catch(() => ({ results: [] }));
  const tIds = (tAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  for (const tid of tIds.slice(0, 12)) {
    const t = await hsGet(
      key,
      `/crm/v3/objects/tasks/${tid}?properties=hs_task_subject,hs_task_body,hs_task_status,hs_timestamp,hs_task_priority`,
    );
    const sub = t.properties?.hs_task_subject || '';
    if (/clic|rebot|entreg|bounce|open|click/i.test(sub)) {
      collected.tasks.push({
        id: t.id,
        subject: sub,
        body: String(t.properties?.hs_task_body || '').slice(0, 400),
        status: t.properties?.hs_task_status,
        priority: t.properties?.hs_task_priority,
      });
    }
  }
  if (engagementId) {
    const em = await hsGet(
      key,
      `/crm/v3/objects/emails/${engagementId}?properties=hs_email_status,hs_email_subject,hs_timestamp,hs_email_direction`,
    );
    collected.loggedEmail = {
      id: em.id,
      status: em.properties?.hs_email_status,
      subject: em.properties?.hs_email_subject,
      timestamp: em.properties?.hs_timestamp,
    };
  }
  return collected;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    const parsed = extractStamps(
      '<!-- resend:abc:email.delivered --><b>✅ [PRIMER CONTACTO] ENTREGADO 2026-08-30 → a@b.com (Resend confirmó la entrega · Resend id abc)</b><br>' +
        '<!-- resend:abc:email.opened --><b>👀 [PRIMER CONTACTO] ABIERTO 2026-08-30 → a@b.com</b>',
    );
    if (parsed.stamps.length < 2 || parsed.markers.length !== 2 || !parsed.stamps[0].includes('a@b.com')) {
      console.error('self-test failed', parsed);
      process.exit(1);
    }
    const v = verdictFrom({ last_event: 'clicked' }, parsed, ['[resend-webhook] email.clicked']);
    if (v.delivered !== 'yes' || v.clicked !== 'yes' || v.opened !== 'yes-open-event') {
      console.error('verdict self-test failed', v);
      process.exit(1);
    }
    const bounceOnly = verdictFrom({}, { stamps: ['⛔ REBOTE 2026-08-30 → x@y.com'], markers: [] }, []);
    if (bounceOnly.delivered !== 'no-for-the-bouncing-address-only') {
      console.error('bounce verdict failed', bounceOnly);
      process.exit(1);
    }
    const clickOnly = verdictFrom({}, { stamps: ['🔗 CLIC EN ENLACE 2026-08-30 → x@y.com'], markers: [] }, []);
    if (clickOnly.delivered !== 'yes' || clickOnly.opened !== 'no-open-event-click-is-not-an-open') {
      console.error('click verdict failed', clickOnly);
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

  const logs = grepLogs(id);
  const hsStamps = await hubspotStamps(HS, entry?.dealId, entry?.engagementId).catch((e) => ({ error: e.message }));
  const email = stripHtml(api.json);
  const restricted = api.status === 401 && /restricted_api_key|only send emails/i.test(JSON.stringify(api.json || {}));
  const report = {
    at: new Date().toISOString(),
    resendId: id,
    ledger: entry,
    api: { status: api.status, restrictedSendingKey: restricted, email },
    extraEndpoints: eventsTried,
    webhookLogHits: logs.hits,
    logFilesTried: logs.filesTried,
    hubspotNote: hsStamps,
    verdict: verdictFrom(email, hsStamps.stamps ? hsStamps : { stamps: [], markers: [] }, logs.hits),
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
