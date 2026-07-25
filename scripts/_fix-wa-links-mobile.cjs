#!/usr/bin/env node
/**
 * Ops (July 25 2026): repoint every FIRST-CONTACT WhatsApp button in CLIENT-MANUAL
 * deal notes from a raw `web.whatsapp.com/send?…` link to the device-aware bridge
 * `/go/outreach/{slug}`.
 *
 * Why: on a phone `web.whatsapp.com/send` redirects to web.whatsapp.com/mobile/
 * ("use WhatsApp Web from your computer") — the app never opens, so outreach could
 * only be sent from the laptop. The bridge picks api.whatsapp.com on mobile and
 * web.whatsapp.com on desktop (no redirect → emojis survive). The FU buttons were
 * already migrated by `_install-wa-fu-notes.cjs`.
 *
 * Only rewrites anchors whose slug has a `draft` in the outreach registry — never
 * touches a link we cannot serve. Idempotent.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRegistry, buildOutreachSlugUrl } = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('HUBSPOT_API_KEY missing');
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(method, p, body, attempt = 0) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (r.status === 429 && attempt < 10) {
    await sleep(1400 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const reg = loadRegistry();
  const rows = Object.entries(reg).filter(([, c]) => c.dealId && c.draft);
  const out = { checked: 0, patched: 0, alreadyOk: 0, noNote: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const [slug, cfg] = rows[i];
    process.stderr.write(`\r ${i + 1}/${rows.length} ${slug.slice(0, 34).padEnd(34)}`);
    try {
      out.checked++;
      await sleep(110);
      const assoc = await hs('GET', `/crm/v4/objects/deals/${cfg.dealId}/associations/notes`);
      const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      if (!ids.length) {
        out.noNote++;
        continue;
      }
      let note = null;
      for (const id of ids.slice(0, 5)) {
        await sleep(80);
        const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
        if (!note || (n.properties?.hs_timestamp || '') > (note.properties?.hs_timestamp || '')) note = n;
      }
      const body = note?.properties?.hs_note_body || '';
      if (!/web\.whatsapp\.com/i.test(body)) {
        out.alreadyOk++;
        continue;
      }
      // Swap only the href; the visible label (phone number, emoji) stays as is.
      const bridge = buildOutreachSlugUrl(slug);
      const next = body.replace(/href="https:\/\/web\.whatsapp\.com\/send\?[^"]*"/gi, `href="${bridge}"`);
      if (next === body) {
        out.alreadyOk++;
        continue;
      }
      await sleep(100);
      await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, { properties: { hs_note_body: next } });
      out.patched++;
    } catch (e) {
      out.errors.push({ slug, err: e.message });
    }
  }
  process.stderr.write('\n');
  console.log(JSON.stringify({ ...out, errorList: out.errors.slice(0, 10) }, null, 2));
  fs.writeFileSync(
    path.join(root, 'docs/selling/_fix-wa-links-mobile.json'),
    JSON.stringify({ ...out, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
