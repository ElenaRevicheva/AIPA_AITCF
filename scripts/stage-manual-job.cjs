#!/usr/bin/env node
/**
 * stage-manual-job.cjs — stage a job Elena found herself so it gets the SAME kit as an automatic one.
 *
 *   node scripts/stage-manual-job.cjs --url=<posting> --title="<role>" --company="<company>" [--info="<line>"]...
 *
 * WHY (29 Sep 2026). Hand-staged deals were built one at a time in chat, and each missed a piece the
 * automatic HIRING deals get: Allied Revenue got no tailored CV or defense, the video-producer deal got
 * its defense skipped because a hand-written note quoted the kit's own marker. Elena: "hand-staged deals
 * should have the same tailored machinery like auto HIRING I act today".
 *
 * WHAT IT DOES: creates `[HIRING-MANUAL] <title> @ <company>` in 🔥 I act TODAY (the ` @ ` is what the
 * kit parses), a note that opens with `📌 JOB POSTING: <code>url</code>` (the kit's opt-in — recruiter-
 * outreach deals share the prefix and must stay out), any --info lines, and a HIGH "Apply" task.
 * It writes NO CV, letter or defense itself: hs-fill-apply-kit.cjs does, on Oracle (cron every 10 min,
 * or at once with `--apply --only=<dealId>`), exactly as for an automatic deal.
 *
 * Idempotent: an existing deal with the same name is reported, not duplicated.
 */
'use strict';
const path = require('path');
const { hubspotKey, hubspotOwnerId, hubspotBase } = require(path.join(__dirname, 'hs-env.cjs'));

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const infos = process.argv.filter((a) => a.startsWith('--info=')).map((a) => a.slice(7));
const url = arg('url'), title = arg('title').trim(), company = arg('company').trim();
if (!/^https?:\/\//.test(url) || !title || !company) {
  console.error('usage: --url=<https://…> --title="<role>" --company="<company>" [--info="…"]');
  process.exit(2);
}
if (/ @ /.test(title) || / @ /.test(company)) { console.error('" @ " is the separator — not allowed inside title/company'); process.exit(2); }
// The kit reads "cover letter" or its defense mark in ANY deal note as "already done" and skips that step.
const blocked = infos.find((s) => /cover letter|TECHNICAL DEFENSE/i.test(s));
if (blocked) { console.error(`--info must not contain "cover letter" or the defense mark: ${blocked}`); process.exit(2); }

const KEY = hubspotKey(), OWNER = hubspotOwnerId(), HS = hubspotBase();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function hs(method, p, body) {
  const r = await fetch(HS + p, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const toDeal = (id, typeId) => [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }] }];

(async () => {
  const dealname = `[HIRING-MANUAL] ${title} @ ${company}`;
  const found = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: dealname }] }], limit: 1 });
  if (found.total) { console.log(JSON.stringify({ exists: found.results[0].id, dealname })); return; }

  const deal = (await hs('POST', '/crm/v3/objects/deals', { properties: {
    dealname, dealstage: 'qualifiedtobuy', pipeline: 'default', hubspot_owner_id: OWNER } })).id;
  // The posting line must come first and must be the only <code> — the kit takes the first one as the URL.
  // This note must NOT contain the words "cover letter" or the kit's defense mark (checked on --info above).
  const html = [`📌 JOB POSTING: <code>${esc(url)}</code>`, '', `<b>💼 ${esc(title)} — ${esc(company)}</b>`,
    `<a href="${esc(url)}"><b>👉 APPLY</b></a>`, ...infos.map(esc), '',
    'Tailored CV, letter, defense and company brief: added by the apply kit, same as automatic deals.',
  ].join('<br>');
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() }, associations: toDeal(deal, 214) });
  const due = new Date(); due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', { properties: {
    hs_task_subject: `Apply: ${title} @ ${company}`,
    hs_task_body: 'Open the deal → letter note + tailored CV on the defense note → apply → move the deal to Sent.',
    hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hs_timestamp: due.toISOString(), hubspot_owner_id: OWNER,
  }, associations: toDeal(deal, 216) });
  console.log(JSON.stringify({ deal, note: note.id, task: task.id, dealname,
    kit: `cd ~/cto-aipa && node scripts/hs-fill-apply-kit.cjs --apply --only=${deal}` }));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
