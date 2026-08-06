#!/usr/bin/env node
/**
 * Prove the post-send automation ACTUALLY fired — from logs, not from config.
 *
 * Elena (Aug 5 2026): "dig into real logs, not just config. i do not want illusions
 * hubspot fires when it silently dies."
 *
 * Structural audits only prove a button is wired. This starts from events that
 * demonstrably happened — `[go/outreach-email] sent <slug> → <to> resend=<id>` in the
 * pm2 log — and then checks HubSpot for the artefacts each send was supposed to
 * produce:
 *
 *   stage moved to ⏳ Sent · ENTREGADO or SEGUIMIENTO stamp on the note ·
 *   follow-up TASK created · EMAIL activity object in the deal's Emails tab
 *
 * A send with a Resend id but no artefacts is exactly the silent death she means.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
const LOG = process.env.PM2_LOG || '/home/ubuntu/.pm2/logs/cto-aipa-out-9.log';

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`${method} ${p} ${r.status}`);
  }
  return t ? JSON.parse(t) : null;
}

(async () => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n');

  // 1. every real send
  const sends = new Map(); // slug -> {to, ids:[]}
  for (const L of lines) {
    const m = L.match(/\[go\/outreach-email\] sent ([a-z0-9-]+) → (\S+) resend=([0-9a-f-]+)/);
    if (!m) continue;
    const [, slug, to, id] = m;
    if (!sends.has(slug)) sends.set(slug, { to, ids: [] });
    sends.get(slug).ids.push(id);
  }

  // 2. delivery / open events actually received back from Resend
  const delivered = new Set();
  const opened = new Set();
  for (const L of lines) {
    let m = L.match(/\[resend-webhook\] email\.delivered .*?deal=(\d+) → applied/);
    if (m) delivered.add(m[1]);
    m = L.match(/\[resend-webhook\] email\.opened .*?deal=(\d+) → applied/);
    if (m) opened.add(m[1]);
  }

  // 3. known silent failure: HubSpot rejecting the EMAIL activity object
  const engFail = lines.filter((L) => /logEmailEngagement failed/.test(L)).length;

  console.log(`sends found in log : ${sends.size} slugs`);
  console.log(`delivery events    : ${delivered.size} deals`);
  console.log(`open events        : ${opened.size} deals`);
  console.log(`logEmailEngagement FAILURES: ${engFail}\n`);

  const rows = [];
  for (const [slug, info] of sends) {
    const e = reg[slug];
    if (!e || !e.dealId) {
      rows.push({ slug, to: info.to, deal: null, why: 'no registry/dealId — automation could not have fired' });
      continue;
    }
    const deal = await hs('GET', `/crm/v3/objects/deals/${e.dealId}?properties=dealname,dealstage`);
    if (!deal) {
      rows.push({ slug, to: info.to, deal: e.dealId, why: 'deal deleted' });
      continue;
    }
    const na = await hs('GET', `/crm/v4/objects/deals/${e.dealId}/associations/notes`);
    let noteTxt = '';
    for (const nid of (na?.results || []).map((r) => r.toObjectId || r.id)) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      noteTxt += n?.properties?.hs_note_body || '';
    }
    const ta = await hs('GET', `/crm/v4/objects/deals/${e.dealId}/associations/tasks`);
    const ea = await hs('GET', `/crm/v4/objects/deals/${e.dealId}/associations/emails`);

    rows.push({
      slug,
      to: info.to,
      deal: e.dealId,
      name: (deal.properties.dealname || '').replace(/^\[[A-Z-]+\]\s*/, '').slice(0, 34),
      stageSent: deal.properties.dealstage !== 'qualifiedtobuy',
      entregado: /ENTREGADO/i.test(noteTxt),
      seguimiento: /SEGUIMIENTO/i.test(noteTxt),
      abierto: /ABIERTO/i.test(noteTxt),
      tasks: (ta?.results || []).length,
      emails: (ea?.results || []).length,
      hadDelivery: delivered.has(String(e.dealId)),
      hadOpen: opened.has(String(e.dealId)),
    });
  }

  const ok = rows.filter((r) => r.deal && !r.why);
  const cnt = (f) => ok.filter(f).length;
  console.log('=== OF THE SENDS THAT HAPPENED, WHAT ACTUALLY LANDED ===');
  console.log(`  deals checked                    : ${ok.length}`);
  console.log(`  stage moved off "I Act TODAY"    : ${cnt((r) => r.stageSent)}`);
  console.log(`  ENTREGADO stamp on note          : ${cnt((r) => r.entregado)}`);
  console.log(`  SEGUIMIENTO stamp on note        : ${cnt((r) => r.seguimiento)}`);
  console.log(`  ABIERTO stamp on note            : ${cnt((r) => r.abierto)}`);
  console.log(`  follow-up TASK created           : ${cnt((r) => r.tasks > 0)}`);
  console.log(`  EMAIL activity in Emails tab     : ${cnt((r) => r.emails > 0)}`);
  console.log('');
  console.log('=== CROSS-CHECK vs Resend events ===');
  console.log(`  Resend confirmed DELIVERY        : ${cnt((r) => r.hadDelivery)}`);
  console.log(`     …of those, missing ENTREGADO  : ${cnt((r) => r.hadDelivery && !r.entregado && !r.seguimiento)}`);
  console.log(`  Resend confirmed OPEN            : ${cnt((r) => r.hadOpen)}`);
  console.log(`     …of those, missing ABIERTO    : ${cnt((r) => r.hadOpen && !r.abierto)}`);

  const silent = ok.filter((r) => r.hadDelivery && !r.entregado && !r.seguimiento);
  if (silent.length) {
    console.log('\n=== SILENT DEATHS (delivered but never stamped) ===');
    silent.slice(0, 15).forEach((r) => console.log(`  ✗ ${r.name.padEnd(36)} deal ${r.deal} → ${r.to}`));
  }
  const noTask = ok.filter((r) => r.hadDelivery && r.tasks === 0);
  if (noTask.length) {
    console.log('\n=== delivered but NO follow-up task ===');
    noTask.slice(0, 10).forEach((r) => console.log(`  ✗ ${r.name.padEnd(36)} deal ${r.deal}`));
  }
  fs.writeFileSync(path.join(ROOT, 'docs/selling/_automation_proof.json'), JSON.stringify(rows, null, 2));
  console.log('\nfull per-deal evidence → docs/selling/_automation_proof.json');
})();
