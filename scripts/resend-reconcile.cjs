#!/usr/bin/env node
/**
 * Reconcile Resend's final status for recent sends → HubSpot (July 26 2026).
 *
 * The webhook covers delivered/bounced/complained in real time, but a SUPPRESSED
 * send (address on Resend's suppression list after an earlier bounce) fires no
 * event at all — that is exactly what happened to Dental Connect while HubSpot
 * showed 📧 EMAILED. This polls GET /emails/{id} for every ledger entry from the
 * last N days and stamps the real status, so no send can silently look successful.
 *
 * Idempotent (same <!-- resend:id:status --> marker as the webhook).
 * Run hourly on Oracle:  node scripts/resend-reconcile.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const val = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const RESEND = val('RESEND_API_KEY');
const HS = val('HUBSPOT_API_KEY');
const OWNER = val('HUBSPOT_OWNER_ID') || '91612860';
if (!RESEND || !HS) throw new Error('RESEND_API_KEY / HUBSPOT_API_KEY missing');

const LEDGER = path.join(root, 'data/resend-ledger.json');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, p, body) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${HS}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

const STAMPS = {
  delivered: (to, d) => `✅ ENTREGADO ${d} → ${to} (confirmado por Resend)`,
  bounced: (to, d) => `⛔ REBOTE ${d} → ${to} — NO llegó`,
  complained: (to, d) => `🚫 QUEJA DE SPAM ${d} → ${to} — no volver a escribir`,
  // The silent killer this script exists for:
  suppressed: (to, d) =>
    `⛔ SUPRIMIDO ${d} → ${to} — Resend BLOQUEÓ el envío (dirección en lista de supresión). ` +
    `El prospecto NO recibió nada; hace falta otra dirección.`,
  canceled: (to, d) => `⚠️ CANCELADO ${d} → ${to} — el envío no se completó`,
};
const NEEDS_TASK = new Set(['bounced', 'complained', 'suppressed', 'canceled']);

(async () => {
  let ledger = {};
  try {
    ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {
    console.log(JSON.stringify({ note: 'no ledger yet — nothing sent through one-click since deploy' }));
    return;
  }
  const cutoff = Date.now() - DAYS * 86400000;
  const rows = Object.entries(ledger).filter(([, v]) => !v.at || new Date(v.at).getTime() >= cutoff);
  const out = { checked: 0, stamped: 0, duplicates: 0, problems: [], errors: [] };

  for (const [id, entry] of rows) {
    try {
      out.checked++;
      await sleep(150);
      const r = await fetch(`https://api.resend.com/emails/${id}`, {
        headers: { Authorization: `Bearer ${RESEND}` },
      });
      if (!r.ok) {
        out.errors.push({ id, err: `resend ${r.status}` });
        continue;
      }
      const e = await r.json();
      const status = String(e.last_event || e.status || '').toLowerCase();
      const stampFn = STAMPS[status];
      if (!stampFn || !entry.dealId) continue;

      const when = new Date().toISOString().slice(0, 10);
      const marker = `<!-- resend:${id}:${status} -->`;
      const assoc = await hs('GET', `/crm/v4/objects/deals/${entry.dealId}/associations/notes`);
      const ids = (assoc.results || []).map((x) => x.toObjectId || x.id).filter(Boolean);
      let best = null;
      for (const nid of ids.slice(0, 6)) {
        await sleep(70);
        const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_timestamp`);
        if (!best || (n.properties?.hs_timestamp || '') > (best.properties?.hs_timestamp || '')) best = n;
      }
      if (!best) continue;
      const body = best.properties?.hs_note_body || '';
      if (body.includes(marker)) {
        out.duplicates++;
        continue;
      }
      await hs('PATCH', `/crm/v3/objects/notes/${best.id}`, {
        properties: { hs_note_body: `${body}<br>${marker}<b>${stampFn(entry.to, when)}</b>` },
      });
      out.stamped++;

      if (NEEDS_TASK.has(status)) {
        out.problems.push({ slug: entry.slug, to: entry.to, status });
        const due = new Date();
        due.setHours(due.getHours() + 2);
        const task = await hs('POST', '/crm/v3/objects/tasks', {
          properties: {
            hs_task_subject: `⛔ Email NO llegó (${status}) → buscar otra dirección: ${entry.to}`,
            hs_task_body:
              `Resend: ${status}. El prospecto no recibió el correo. Buscar otra dirección ` +
              `(sitio /contacto, Instagram, Google Business), actualizar el contacto en HubSpot y reenviar.`,
            hs_task_status: 'NOT_STARTED',
            hs_task_priority: 'HIGH',
            hs_timestamp: due.getTime(),
            hubspot_owner_id: OWNER,
          },
        });
        if (task?.id) {
          await hs('PUT', `/crm/v3/objects/tasks/${task.id}/associations/deals/${entry.dealId}/task_to_deal`).catch(
            () => undefined,
          );
        }
      }
    } catch (err) {
      out.errors.push({ id, err: err.message });
    }
  }
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(root, 'docs/selling/_resend-reconcile.json'),
    JSON.stringify({ ...out, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
