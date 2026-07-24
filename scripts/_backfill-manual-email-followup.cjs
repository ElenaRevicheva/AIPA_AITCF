/**
 * Backfill Skin Clinic with VALID email (citas@ from live site) + dual note + follow-up.
 * Also ensure today's CLIENT-MANUAL deals have +4d follow-up tasks.
 */
const fs = require('fs');
const path = require('path');
const {
  buildDualChannelNoteLinks,
  buildManualEmailSubject,
  buildManualEmailBody,
  registerOutreachSlug,
  slugify,
  formatPhone507,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('HUBSPOT_API_KEY missing');
const HS = 'https://api.hubapi.com';
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function hs(method, p, body) {
  const r = await fetch(`${HS}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function ensureFollowUp(dealId, company) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  const ids = (assoc?.results || []).map((x) => x.toObjectId || x.id).filter(Boolean);
  for (const id of ids) {
    const t = await hs(
      'GET',
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_status`,
    );
    const subj = t?.properties?.hs_task_subject || '';
    const st = t?.properties?.hs_task_status || '';
    if (st !== 'COMPLETED' && /follow-up/i.test(subj)) {
      return { id, skipped: true };
    }
  }
  const due = new Date();
  due.setDate(due.getDate() + 4);
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Soft follow-up email/WA → ${company} (no reply yet?)`,
      hs_task_body: `Backfill: every Manual Prospect deal gets +4 day follow-up. Deal ${dealId}`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);
  return { id: task.id, skipped: false };
}

(async () => {
  const t = {
    dealId: '63062979686',
    contactId: '237134783071',
    noteId: '113535816765',
    company: 'The Skin Clinic Panama',
    domain: 'theskinclinicpanama.com',
    phone: '50764509248',
    // Published on theskinclinicpanama.com/citas.html (og:description)
    email: 'citas@theskinclinicpanama.com',
    score: 60,
    draftPath: 'docs/selling/drafts/the-skin-clinic-panama.txt',
  };

  const slug = slugify(t.company);
  const draft = fs.readFileSync(path.join(root, t.draftPath), 'utf8').trim();
  const emailDraftPath = `docs/selling/drafts/${slug}-email.txt`;
  const subject = buildManualEmailSubject(t.company, t.score);
  const body = buildManualEmailBody(draft, { botFallback: false });
  fs.writeFileSync(
    path.join(root, emailDraftPath),
    `SUBJECT: ${subject}\n\nTO: ${t.email}\n\n${body}\n`,
    'utf8',
  );
  registerOutreachSlug(slug, t.phone, t.draftPath, t.company, {
    email: t.email,
    emailDraft: emailDraftPath,
    score: t.score,
    dealId: t.dealId,
  });

  await hs('PATCH', `/crm/v3/objects/contacts/${t.contactId}`, {
    properties: { email: t.email },
  });

  const dual = buildDualChannelNoteLinks(t.phone, t.email, draft, t.company, t.score, slug);
  const phoneFmt = formatPhone507(t.phone);
  const noteHtml = [
    `[CLIENT-MANUAL] ${t.company} — AI Visibility outreach (https links; data verified live)`,
    '',
    dual,
    '',
    '--- MENSAJE WhatsApp (plain text) ---',
    '',
    draft.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
    '',
    '--- EMAIL ---',
    '',
    `SUBJECT: ${subject}`,
    `TO: ${t.email}`,
    '',
    body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
    '',
    `Contacts: WhatsApp ${phoneFmt} | ${t.email} | ${t.domain}`,
    '',
    'Next: Click WhatsApp OR aipa@ email. +4-day follow-up task is on this deal.',
  ].join('<br>');

  await hs('PATCH', `/crm/v3/objects/notes/${t.noteId}`, {
    properties: { hs_note_body: noteHtml },
  });

  const fu = await ensureFollowUp(t.dealId, t.company);
  console.log(
    JSON.stringify({
      company: t.company,
      email: t.email,
      source: 'citas.html og:description',
      noteUpdated: true,
      followUp: fu,
      emailLink: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
    }),
  );

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const deals = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [
      {
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT-MANUAL' },
          { propertyName: 'createdate', operator: 'GTE', value: String(since.getTime()) },
        ],
      },
    ],
    properties: ['dealname'],
    limit: 50,
  });
  let added = 0;
  let skipped = 0;
  for (const d of deals.results || []) {
    const company = (d.properties.dealname || '')
      .replace(/^\[CLIENT-MANUAL\]\s*/, '')
      .replace(/\s+—.*$/, '')
      .trim();
    const r = await ensureFollowUp(d.id, company || 'Prospect');
    if (r.skipped) skipped += 1;
    else added += 1;
  }
  console.log(JSON.stringify({ todayFollowUpsAdded: added, alreadyHadFollowUp: skipped }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
