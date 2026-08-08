#!/usr/bin/env node
/**
 * hs-evaluate-and-send-outreach.cjs — audit [CLIENT*] deals and auto-send first or FU email.
 *
 * Uses the EXISTING one-click chain — POST /go/outreach-email/{slug}/send — so Resend
 * ledger + webhook stamp ✅ [PRIMER CONTACTO] ENTREGADO / 👀 ABIERTO land on the note.
 * Does NOT call hs-campaign-send-aipa-emails (that path skips the ledger).
 *
 * Run on Oracle (needs HUBSPOT_API_KEY + go-wa on localhost:3000):
 *   node scripts/hs-evaluate-and-send-outreach.cjs --dry-run
 *   node scripts/hs-evaluate-and-send-outreach.cjs --send
 *   node scripts/hs-evaluate-and-send-outreach.cjs --send --only=kennedy-home,t-mapp
 *   PREFIXES=CLIENT-MANUAL,CLIENT node scripts/hs-evaluate-and-send-outreach.cjs --dry-run
 *
 * After --send, run: node scripts/resend-reconcile.cjs --days=1
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
  console.error('Pass --dry-run (audit only) or --send (fire one-click sends).');
  process.exit(1);
}

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

const PREFIXES = (process.env.PREFIXES || 'CLIENT-MANUAL,CLIENT').split(',').map((s) => s.trim());
const GO_WA_BASE = (process.env.GO_WA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const HS_KEY = hubspotKey();
if (!HS_KEY) {
  console.error('HUBSPOT_API_KEY missing — run on Oracle');
  process.exit(1);
}

const JARGON = /JSON-?LD|FAQPage|LodgingBusiness|robots\.txt|llms\.txt|Top fixes|schema\.org|AEO\s+\d|H1\b|meta\s+description/i;
const STAGE_REPLIED = 'contractsent';
const STAGE_CLOSED = new Set(['closedwon', 'closedlost']);

const headers = { Authorization: `Bearer ${HS_KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, urlPath, body, attempt = 0) {
  const res = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 429 && attempt < 12) {
    await sleep(1200 * (attempt + 1));
    return hs(method, urlPath, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function dealsFor(prefix) {
  const out = [];
  let after;
  do {
    const d = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
      properties: ['dealname', 'dealstage'],
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const x of d.results || []) {
      const name = x.properties?.dealname || '';
      if (name.includes(`[${prefix}]`)) out.push({ id: x.id, name, stage: x.properties?.dealstage });
    }
    after = d.paging?.next?.after;
  } while (after);
  return out;
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

function slugReady(slug, reg) {
  const e = reg[slug];
  if (!e || !e.emailDraft || !e.dealId) return { ok: false, why: 'registry missing emailDraft/dealId' };
  if (!fs.existsSync(path.join(root, e.emailDraft))) return { ok: false, why: `draft missing (${e.emailDraft})` };
  return { ok: true, cfg: e };
}

function readEmailBody(emailDraft) {
  const raw = fs.readFileSync(path.join(root, emailDraft), 'utf8');
  return raw
    .replace(/^SUBJECT:.*$/m, '')
    .replace(/^TO:.*$/m, '')
    .replace(/^NOTE:.*$/m, '')
    .replace(/^\s+/, '')
    .trim();
}

function firstContactSent(noteBody) {
  return (
    /PRIMER CONTACTO.*ENTREGADO/i.test(noteBody) ||
    /📧\s*EMAILED/i.test(noteBody) ||
    /Resend:[a-z0-9-]+/i.test(noteBody) ||
    /✅\s*SENT/i.test(noteBody)
  );
}

function followUpSent(noteBody) {
  return /SEGUIMIENTO.*ENTREGADO/i.test(noteBody);
}

function waFirstOnly(noteBody) {
  return /✅\s*SENT/i.test(noteBody) && !/📧\s*EMAILED/i.test(noteBody) && !/Resend:/i.test(noteBody);
}

function followUpDue(noteBody, tasks) {
  const now = Date.now();
  if (tasks.some((t) => new Date(t.properties?.hs_timestamp || 0).getTime() <= now)) return true;
  const m = noteBody.match(/(?:📧 EMAILED|ENTREGADO)\s+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const days = (now - new Date(m[1]).getTime()) / 86400000;
    if (days >= 4) return true;
  }
  return false;
}

async function sendViaGoWa(slug) {
  const url = `${GO_WA_BASE}/go/outreach-email/${slug}/send`;
  const r = await fetch(url, { method: 'POST', redirect: 'follow' });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${slug} → ${r.status}: ${text.slice(0, 240)}`);
  const resend = text.match(/Resend id:\s*([a-z0-9-]+)/i)?.[1] || text.match(/resend=([a-z0-9-]+)/i)?.[1];
  return { ok: true, resendId: resend || null, snippet: text.replace(/<[^>]+>/g, ' ').slice(0, 120) };
}

(async () => {
  const reg = loadRegistry();
  const byDeal = new Map();
  for (const [slug, cfg] of Object.entries(reg)) {
    if (!cfg.dealId || !cfg.emailDraft) continue;
    if (!byDeal.has(cfg.dealId)) byDeal.set(cfg.dealId, { base: null, fu: null });
    const row = byDeal.get(cfg.dealId);
    if (/-fu$/.test(slug)) row.fu = slug;
    else row.base = slug;
  }

  const allDeals = [];
  for (const p of PREFIXES) allDeals.push(...(await dealsFor(p)));

  const report = { mode: dryRun ? 'dry-run' : 'send', prefixes: PREFIXES, deals: 0, actions: [] };

  for (const deal of allDeals) {
    report.deals++;
    const short = deal.name.replace(/^\[[A-Z-]+\]\s*/, '').slice(0, 48);
    try {
    if (/HIT-LIST|QUEUE/i.test(deal.name)) {
      report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'queue deal' });
      continue;
    }
    if (STAGE_CLOSED.has(deal.stage)) {
      report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'closed' });
      continue;
    }
    if (deal.stage === STAGE_REPLIED) {
      report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'they replied' });
      continue;
    }

    const slugs = byDeal.get(deal.id);
    if (!slugs?.base) {
      report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'no registry slug with email' });
      continue;
    }

    const note = await latestNote(deal.id);
    const noteBody = note?.properties?.hs_note_body || '';
    const tasks = await openFollowUpTasks(deal.id);

    let slugToSend = null;
    let kind = null;

    if (!firstContactSent(noteBody)) {
      if (waFirstOnly(noteBody)) {
        report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'WA first — no auto first email' });
        continue;
      }
      const ready = slugReady(slugs.base, reg);
      if (!ready.ok) {
        report.actions.push({ dealId: deal.id, name: short, slug: slugs.base, action: 'skip', why: ready.why });
        continue;
      }
      const body = readEmailBody(ready.cfg.emailDraft);
      if (JARGON.test(body)) {
        report.actions.push({
          dealId: deal.id,
          name: short,
          slug: slugs.base,
          action: 'skip',
          why: 'jargon in first-contact draft — fix copy first',
        });
        continue;
      }
      slugToSend = slugs.base;
      kind = 'first';
    } else if (!followUpSent(noteBody) && slugs.fu && followUpDue(noteBody, tasks)) {
      const ready = slugReady(slugs.fu, reg);
      if (!ready.ok) {
        report.actions.push({ dealId: deal.id, name: short, slug: slugs.fu, action: 'skip', why: ready.why });
        continue;
      }
      const body = readEmailBody(ready.cfg.emailDraft);
      if (JARGON.test(body)) {
        report.actions.push({
          dealId: deal.id,
          name: short,
          slug: slugs.fu,
          action: 'skip',
          why: 'jargon in FU draft — fix copy first',
        });
        continue;
      }
      slugToSend = slugs.fu;
      kind = 'follow-up';
    } else if (firstContactSent(noteBody) && !followUpSent(noteBody)) {
      report.actions.push({
        dealId: deal.id,
        name: short,
        action: 'skip',
        why: 'first sent — FU not due yet',
      });
      continue;
    } else {
      report.actions.push({ dealId: deal.id, name: short, action: 'skip', why: 'already contacted (email+FU)' });
      continue;
    }

    if (only && !only.has(slugToSend)) {
      report.actions.push({ dealId: deal.id, name: short, slug: slugToSend, action: 'skip', why: '--only filter' });
      continue;
    }

    if (dryRun) {
      report.actions.push({
        dealId: deal.id,
        name: short,
        slug: slugToSend,
        kind,
        action: 'would-send',
        to: reg[slugToSend]?.email,
      });
      continue;
    }

    try {
      const sent = await sendViaGoWa(slugToSend);
      report.actions.push({
        dealId: deal.id,
        name: short,
        slug: slugToSend,
        kind,
        action: 'sent',
        resendId: sent.resendId,
        to: reg[slugToSend]?.email,
      });
      console.log('SENT', kind, slugToSend, '→', reg[slugToSend]?.email, sent.resendId || '');
      await sleep(2000);
    } catch (e) {
      report.actions.push({
        dealId: deal.id,
        name: short,
        slug: slugToSend,
        kind,
        action: 'error',
        err: String(e.message || e).slice(0, 200),
      });
      console.error('FAIL', slugToSend, e.message);
    }
    } catch (e) {
      report.actions.push({
        dealId: deal.id,
        name: short,
        action: 'error',
        err: String(e.message || e).slice(0, 200),
      });
      console.error('DEAL', deal.id, e.message);
      await sleep(1500);
    }
    await sleep(120);
  }

  const summary = {
    wouldSend: report.actions.filter((a) => a.action === 'would-send').length,
    sent: report.actions.filter((a) => a.action === 'sent').length,
    skipped: report.actions.filter((a) => a.action === 'skip').length,
    errors: report.actions.filter((a) => a.action === 'error').length,
  };
  report.summary = summary;

  const outPath = path.join(root, 'docs/selling/_evaluate_send_report.json');
  fs.writeFileSync(outPath, JSON.stringify({ ...report, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ...summary, reportPath: outPath }, null, 2));

  const pending = report.actions.filter((a) => a.action === 'would-send' || a.action === 'sent');
  if (pending.length) {
    console.log('\n--- send queue ---');
    for (const a of pending) console.log(`  ${a.action.padEnd(10)} ${a.kind || '-'} ${a.slug} (${a.name})`);
  }

  if (summary.errors > 0 && summary.sent === 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
