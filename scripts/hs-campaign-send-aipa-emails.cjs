#!/usr/bin/env node
/**
 * hs-campaign-send-aipa-emails.cjs — auto-send Manual Prospect Play emails
 * from aipa@aideazz.xyz via Resend (no Elena clicks). Moves deals → Sent.
 *
 * Iron rule: EVERY campaign candidate (new send OR already emailed) gets a
 * +4 calendar-day soft follow-up Task (idempotent — skips if one is open).
 *
 * NOTE: Resend ≠ Zoho. These will NOT appear in Zoho Mail → Sent.
 * HubSpot UI sends (connected Zoho inbox) DO appear in Zoho Sent.
 * Resend id is stamped on the HubSpot note; check https://resend.com/emails
 *
 * Usage (run on Oracle where RESEND_API_KEY lives):
 *   node scripts/hs-campaign-send-aipa-emails.cjs [--dry-run] [--only=slug1,slug2]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadRegistry, buildManualEmailSubject, buildManualEmailBody, readDraftUtf8 } =
  require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg
  ? new Set(
      onlyArg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

function envKey(name) {
  const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
  let v = env.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim();
  if (!v) return undefined;
  // strip wrapping quotes from .env values
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function resolveFrom() {
  const candidates = [
    envKey('CONCIERGE_FROM'),
    envKey('OUTREACH_FROM'),
    'Elena Revicheva <aipa@aideazz.xyz>',
  ].filter(Boolean);
  for (const c of candidates) {
    // Accept "Name <email>" or bare email
    if (/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(c)) return c;
    if (/^.+\s*<[^\s<>]+@[^\s<>]+\.[^\s<>]+>\s*$/.test(c)) return c;
  }
  return 'Elena Revicheva <aipa@aideazz.xyz>';
}

const HS_KEY = envKey('HUBSPOT_API_KEY');
const RESEND_KEY = envKey('RESEND_API_KEY') || envKey('RESEND_KEY');
if (!HS_KEY) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
if (!RESEND_KEY && !dryRun) {
  console.error('RESEND_API_KEY missing — run on Oracle or add to .env');
  process.exit(1);
}

const FROM = resolveFrom();
const REPLY_TO = envKey('CONCIERGE_REPLY_TO') || 'elena.revicheva2016@gmail.com';

const headers = {
  Authorization: `Bearer ${HS_KEY}`,
  'Content-Type': 'application/json',
};

async function hs(method, urlPath, body) {
  const res = await fetch(`https://api.hubapi.com${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function parseEmailDraft(file) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8').trim();
  const subject = raw.match(/^SUBJECT:\s*(.+)$/m)?.[1]?.trim();
  const to = raw.match(/^TO:\s*(.+)$/m)?.[1]?.trim();
  const body = raw
    .replace(/^SUBJECT:.*$/m, '')
    .replace(/^TO:.*$/m, '')
    .replace(/^\s+/, '')
    .trim();
  return { subject, to, body };
}

async function latestNote(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  let best = null;
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    if (!best || (n.properties?.hs_timestamp || '') > (best.properties?.hs_timestamp || '')) best = n;
  }
  return best;
}

/** Open (non-COMPLETED) soft follow-up tasks on a deal — iron rule: every campaign send gets one. */
async function openFollowUpTasks(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const open = [];
  for (const id of ids) {
    const t = await hs(
      'GET',
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status,hs_timestamp`,
    );
    const subj = t.properties?.hs_task_subject || '';
    const status = t.properties?.hs_task_status || '';
    if (status !== 'COMPLETED' && /follow-up/i.test(subj)) open.push(t);
  }
  return open;
}

async function ensureFollowUpTask(dealId, company, note) {
  const existing = await openFollowUpTasks(dealId);
  if (existing.length) {
    return {
      id: existing[0].id,
      due: (existing[0].properties?.hs_timestamp || '').slice(0, 10),
      created: false,
    };
  }
  const due = new Date();
  due.setDate(due.getDate() + 4);
  due.setHours(23, 59, 0, 0);
  const dueStr = due.toISOString().slice(0, 10);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Soft follow-up email/WA → ${company} (no reply yet?)`,
      hs_task_body:
        `Campaign rule: every sent prospect gets a +4 day soft follow-up. ` +
        `If still silent, soft 1–2 lines. If they replied, cancel and use 💬 path. Deal ${dealId}`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);
  if (note) {
    const stamp = `<br>📅 Follow-up task <b>${task.id}</b> due <b>${dueStr}</b> (soft if still silent).`;
    await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, {
      properties: { hs_note_body: (note.properties?.hs_note_body || '') + stamp },
    });
  }
  return { id: task.id, due: dueStr, created: true };
}

async function sendResend({ to, subject, body }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      text: body,
      html: `<div style="white-space:pre-wrap;font-family:inherit;">${esc(body)}</div>`,
      reply_to: REPLY_TO,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.id || 'ok';
}

(async () => {
  const reg = loadRegistry();
  const results = [];

  for (const [slug, cfg] of Object.entries(reg)) {
    if (only && !only.has(slug)) continue;
    if (!cfg.email || !cfg.dealId) {
      results.push({ slug, skip: 'no email/dealId' });
      continue;
    }

    const note = await latestNote(cfg.dealId);
    const body = note?.properties?.hs_note_body || '';
    const alreadyEmailed = /Resend:[a-z0-9-]+/i.test(body) || /📧 EMAILED/.test(body);

    // Already emailed → still ensure +4 day soft follow-up (every campaign candidate)
    if (alreadyEmailed) {
      if (dryRun) {
        results.push({ slug, skip: 'already emailed', followUp: 'would ensure' });
        continue;
      }
      const fu = await ensureFollowUpTask(cfg.dealId, cfg.company || slug, note);
      results.push({
        slug,
        skip: 'already emailed (note has EMAILED/Resend)',
        followUpId: fu.id,
        followUpDue: fu.due,
        followUpCreated: fu.created,
      });
      console.log('FOLLOWUP', slug, fu.created ? 'created' : 'exists', fu.id, 'due', fu.due);
      continue;
    }

    let subject;
    let to = cfg.email;
    let emailBody;
    if (cfg.emailDraft && fs.existsSync(path.join(root, cfg.emailDraft))) {
      const parsed = parseEmailDraft(cfg.emailDraft);
      subject = parsed.subject;
      to = parsed.to || to;
      emailBody = parsed.body;
    } else {
      const wa = readDraftUtf8(cfg.draft);
      subject = buildManualEmailSubject(cfg.company || slug, cfg.score || 0);
      emailBody = buildManualEmailBody(wa, { botFallback: false });
    }

    if (dryRun) {
      results.push({ slug, dryRun: true, to, subject: subject?.slice(0, 60), followUp: '+4d' });
      continue;
    }

    const resendId = await sendResend({ to, subject, body: emailBody });
    const when = new Date().toISOString().slice(0, 10);
    await hs('PATCH', `/crm/v3/objects/deals/${cfg.dealId}`, {
      properties: { dealstage: 'decisionmakerboughtin' },
    });
    let noteForStamp = note;
    if (noteForStamp) {
      const add =
        `<br><br>📧 EMAILED ${when} from <b>aipa@aideazz.xyz</b> → ${to}` +
        `<br>Subject: ${subject}` +
        `<br>Resend:${resendId} (campaign auto-send hs-campaign-send-aipa-emails).` +
        `<br><i>Note: Resend does not appear in Zoho Sent — check Resend dashboard.</i>`;
      await hs('PATCH', `/crm/v3/objects/notes/${noteForStamp.id}`, {
        properties: { hs_note_body: (noteForStamp.properties?.hs_note_body || '') + add },
      });
      noteForStamp = {
        ...noteForStamp,
        properties: {
          ...noteForStamp.properties,
          hs_note_body: (noteForStamp.properties?.hs_note_body || '') + add,
        },
      };
    }

    // Iron rule: every campaign send → +4 day soft follow-up (idempotent)
    const fu = await ensureFollowUpTask(cfg.dealId, cfg.company || slug, noteForStamp);

    results.push({
      slug,
      ok: true,
      to,
      resendId,
      dealId: cfg.dealId,
      followUpId: fu.id,
      followUpDue: fu.due,
    });
    console.log('SENT', slug, '→', to, resendId, 'followUp', fu.id, 'due', fu.due);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(JSON.stringify({ ok: true, dryRun, from: FROM, results }, null, 2));
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
