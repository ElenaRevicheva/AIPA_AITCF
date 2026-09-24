#!/usr/bin/env node
/**
 * stage-partner-trailer.cjs — romance promo partners → HubSpot, CLIENT-MANUAL style.
 *
 * Same send path as stage-manual-prospect.cjs: an email draft file + a registry row, so
 * the deal note's button opens /go/outreach-email/<slug> and sends from aipa@aideazz.xyz
 * via Resend. That send moves the deal to "Sent", stamps the note, closes the "Send …"
 * task and books the +4 day follow-up on its own.
 *
 * A separate script because the pitch is not audit-driven (see the stage-manual-prospect
 * memory: bespoke only when the pitch structure genuinely differs). Plan and targets:
 * docs/selling/2026-09-23_ROMANCE_PROMO_CHANNEL_PARTNERS.md. Hard cap: 5 targets.
 *
 * Usage: node scripts/stage-partner-trailer.cjs [--dry-run]
 * Idempotent: a partner whose deal name already exists is skipped.
 */
const fs = require('fs');
const path = require('path');
const { registerOutreachSlug, buildOutreachEmailUrl } = require('./wa-link-lib.cjs');
const { hubspotKey, hubspotOwnerId, hubspotBase } = require('./hs-env.cjs');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const KEY = hubspotKey();
const OWNER = hubspotOwnerId();
const HS = hubspotBase();
if (!KEY && !dryRun) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const SAMPLE = 'https://youtube.com/shorts/UudO7lUfJKA';
const SIGNATURE = [
  'Elena Revicheva',
  'Poet and AI film director',
  'AI Film Studio: https://atuona.xyz/aifilmstudio',
  'Portfolio: https://aideazz.xyz/portfolio',
  '',
  'P.S. I also make AI music videos and short brand films in the same style, if any of your authors need launch visuals beyond the trailer.',
].join('\n');

const MENU_ASK = (what) =>
  `Would you like to add trailers to your ${what}? I produce them, you sell them to your authors, and we share the revenue. ` +
  'I can make the first one free for one of your upcoming releases, so you can see how your authors react.';

// Partner data lives in docs/selling/ (the outreach data plane; pii-guard keeps third-party
// addresses out of scripts). Addresses were read from each company own page on 24 Sep 2026.
const PARTNERS = JSON.parse(fs.readFileSync(path.join(root, "docs/selling/partners-trailer.json"), "utf8")).partners;

function letter(p) {
  const intro =
    p.shape === 'white-label'
      ? `I make short cinematic book trailers for romance and dark romance: dark, luxurious, sensual, never explicit. Vertical, ready to post. Here is one:\n${SAMPLE}`
      : `I make short cinematic book trailers in exactly that mood: dark, luxurious, sensual, never explicit. 30 seconds, vertical, ready for TikTok and Reels. Here is one:\n${SAMPLE}`;
  const ask =
    p.shape === 'white-label'
      ? 'I can produce trailers under your brand for your clients, at a fixed wholesale price, and you bill them as you like. The first one is free for one of your upcoming releases, so you can see how it performs before deciding anything.'
      : MENU_ASK(p.what);
  return [p.greeting, '', p.opener, '', intro, '', ask, '', SIGNATURE].join('\n');
}

(async () => {
  const out = [];
  for (const p of PARTNERS) {
    const dealName = `[PARTNER-TRAILER] ${p.company} — cinematic book trailers (${p.shape === 'white-label' ? 'white-label' : 'menu / rev-share'})`;
    const draftRel = `docs/selling/drafts/${p.slug}-email.txt`;
    const body = letter(p);
    fs.writeFileSync(path.join(root, draftRel), `TO: ${p.email}\nSUBJECT: ${p.subject}\n\n${body}\n`, 'utf8');
    const oneClick = buildOutreachEmailUrl(p.slug);
    if (dryRun) {
      out.push({ slug: p.slug, dealName, to: p.email, oneClick });
      continue;
    }

    const found = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: dealName }] }],
      properties: ['dealname'],
      limit: 1,
    });
    if (found.total > 0) {
      const dealId = found.results[0].id;
      registerOutreachSlug(p.slug, '', draftRel, p.company, { email: p.email, emailDraft: draftRel, dealId });
      out.push({ slug: p.slug, dealId, skipped: 'deal exists — registry refreshed' });
      continue;
    }

    const companyId = await hs('POST', '/crm/v3/objects/companies', {
      properties: { name: p.company, domain: p.domain, website: `https://${p.domain}`, description: `Romance promo partner. Email: ${p.email}` },
    }).then((r) => r.id);
    const dealId = await hs('POST', '/crm/v3/objects/deals', {
      properties: { dealname: dealName, dealstage: 'qualifiedtobuy', pipeline: 'default', hubspot_owner_id: OWNER },
    }).then((r) => r.id);
    await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/companies/${companyId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 },
    ]);

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const noteHtml = [
      `<b>🎬 PARTNER-TRAILER — ${esc(p.company)}</b> (${p.shape === 'white-label' ? 'white-label' : 'menu / revenue share'})`,
      '',
      `<a href="${oneClick}"><b>✉️ ENVIAR POR EMAIL — one click from aipa@aideazz.xyz</b></a>`,
      `(opens a preview page → one button → sent. The deal then moves to Sent and a +4 day follow-up task appears.)`,
      '',
      `To: ${esc(p.email)} · Subject: ${esc(p.subject)}`,
      `Sample: <a href="${SAMPLE}">${SAMPLE}</a>`,
      '',
      '--- EMAIL ---',
      esc(body),
      '',
      'Plan + stop rule: docs/selling/2026-09-23_ROMANCE_PROMO_CHANNEL_PARTNERS.md (5 targets max; 30 days, at least one yes, else drop).',
    ].join('<br>');
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
    });
    await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
    ]);

    const due = new Date();
    due.setHours(23, 59, 0, 0);
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `Send partner email → ${p.company} (one click, aipa@)`,
        hs_task_body: `Open the deal note → ✉️ ENVIAR POR EMAIL → review → send. The send closes this task and books the follow-up.`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH',
        hs_timestamp: due.toISOString(),
        hubspot_owner_id: OWNER,
      },
    });
    await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
    ]);

    registerOutreachSlug(p.slug, '', draftRel, p.company, { email: p.email, emailDraft: draftRel, dealId });
    out.push({ slug: p.slug, dealId, companyId, noteId: note.id, taskId: task.id, oneClick });
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
