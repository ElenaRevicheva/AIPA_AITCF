#!/usr/bin/env node
/**
 * Thin orchestrator — fires existing /go/outreach-email/{slug}/send on Oracle.
 *
 * Send + HubSpot stamps + Resend ledger + ENTREGADO/ABIERTO all live in src/go-wa.ts
 * and src/resend-webhook.ts. This file only decides *which* slugs to click and POSTs.
 * Does NOT replace hs-campaign-send-aipa-emails.cjs (that path calls Resend directly).
 *
 *   node scripts/hs-evaluate-and-send-outreach.cjs --dry-run
 *   node scripts/hs-evaluate-and-send-outreach.cjs --send
 *   node scripts/hs-evaluate-and-send-outreach.cjs --send --only=kennedy-home
 *
 * After --send: node scripts/resend-reconcile.cjs --days=1
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./wa-link-lib.cjs');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const doSend = process.argv.includes('--send');
if (!dryRun && !doSend) {
  console.error('Pass --dry-run or --send');
  process.exit(1);
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;

const GO_WA_BASE = (process.env.GO_WA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const HS_KEY = hubspotKey();
if (!HS_KEY) {
  console.error('HUBSPOT_API_KEY missing — run on Oracle');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, urlPath, body, attempt = 0) {
  const res = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${HS_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 429 && attempt < 12) {
    await sleep(1200 * (attempt + 1));
    return hs(method, urlPath, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
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

async function openFollowUpTasks(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const open = [];
  for (const id of ids) {
    const t = await hs(
      'GET',
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status,hs_timestamp`,
    );
    if (t.properties?.hs_task_status !== 'COMPLETED' && /follow-up/i.test(t.properties?.hs_task_subject || '')) {
      open.push(t);
    }
  }
  return open;
}

/** Same skip rule as hs-campaign-send-aipa-emails.cjs */
function alreadyEmailed(noteBody) {
  return /Resend:[a-z0-9-]+/i.test(noteBody) || /📧\s*EMAILED/.test(noteBody);
}

function firstContactSent(noteBody) {
  return alreadyEmailed(noteBody) || /PRIMER CONTACTO.*ENTREGADO/i.test(noteBody) || /✅\s*SENT/i.test(noteBody);
}

function followUpSent(noteBody) {
  return /SEGUIMIENTO.*ENTREGADO/i.test(noteBody);
}

function followUpDue(noteBody, tasks) {
  const now = Date.now();
  if (tasks.some((t) => new Date(t.properties?.hs_timestamp || 0).getTime() <= now)) return true;
  const m = noteBody.match(/(?:📧 EMAILED|ENTREGADO)\s+(\d{4}-\d{2}-\d{2})/i);
  if (m && (now - new Date(m[1]).getTime()) / 86400000 >= 4) return true;
  return false;
}

function slugReady(slug, reg) {
  const e = reg[slug];
  if (!e?.emailDraft || !e.dealId) return false;
  return fs.existsSync(path.join(root, e.emailDraft));
}

async function sendViaGoWa(slug) {
  const r = await fetch(`${GO_WA_BASE}/go/outreach-email/${slug}/send`, { method: 'POST' });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 200)}`);
  const resendId = text.match(/Resend id:\s*([a-z0-9-]+)/i)?.[1];
  return resendId || null;
}

(async () => {
  const reg = loadRegistry();
  const report = { mode: dryRun ? 'dry-run' : 'send', actions: [] };

  for (const [slug, cfg] of Object.entries(reg)) {
    if (only && !only.has(slug)) continue;
    if (!cfg.email || !cfg.dealId || !slugReady(slug, reg)) {
      report.actions.push({ slug, action: 'skip', why: 'no email/dealId/draft' });
      continue;
    }

    try {
      const note = await latestNote(cfg.dealId);
      const body = note?.properties?.hs_note_body || '';
      const isFu = /-fu$/.test(slug);
      let kind = null;

      if (isFu) {
        if (!firstContactSent(body)) {
          report.actions.push({ slug, dealId: cfg.dealId, action: 'skip', why: 'first contact not sent' });
          continue;
        }
        if (followUpSent(body)) {
          report.actions.push({ slug, dealId: cfg.dealId, action: 'skip', why: 'FU already ENTREGADO' });
          continue;
        }
        const tasks = await openFollowUpTasks(cfg.dealId);
        if (!followUpDue(body, tasks)) {
          report.actions.push({ slug, dealId: cfg.dealId, action: 'skip', why: 'FU not due yet' });
          continue;
        }
        kind = 'follow-up';
      } else {
        if (alreadyEmailed(body)) {
          report.actions.push({ slug, dealId: cfg.dealId, action: 'skip', why: 'already emailed (Resend/EMAILED)' });
          continue;
        }
        if (/✅\s*SENT/i.test(body)) {
          report.actions.push({ slug, dealId: cfg.dealId, action: 'skip', why: 'WA first — no auto email' });
          continue;
        }
        kind = 'first';
      }

      if (dryRun) {
        report.actions.push({ slug, dealId: cfg.dealId, kind, action: 'would-send', to: cfg.email });
        continue;
      }

      const resendId = await sendViaGoWa(slug);
      report.actions.push({ slug, dealId: cfg.dealId, kind, action: 'sent', to: cfg.email, resendId });
      console.log('SENT', kind, slug, '→', cfg.email, resendId || '');
      await sleep(2000);
    } catch (e) {
      report.actions.push({ slug, dealId: cfg.dealId, action: 'error', err: String(e.message || e).slice(0, 160) });
      console.error('FAIL', slug, e.message);
      await sleep(1500);
    }
    await sleep(100);
  }

  const summary = {
    wouldSend: report.actions.filter((a) => a.action === 'would-send').length,
    sent: report.actions.filter((a) => a.action === 'sent').length,
    skipped: report.actions.filter((a) => a.action === 'skipped').length,
    errors: report.actions.filter((a) => a.action === 'error').length,
  };
  report.summary = summary;

  const outPath = path.join(root, 'docs/selling/_evaluate_send_report.json');
  fs.writeFileSync(outPath, JSON.stringify({ ...report, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ...summary, reportPath: outPath }, null, 2));
  if (summary.errors > 0 && summary.sent === 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
