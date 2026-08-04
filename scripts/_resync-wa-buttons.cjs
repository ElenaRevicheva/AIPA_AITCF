#!/usr/bin/env node
/**
 * Re-point every WhatsApp button in HubSpot at the CURRENT draft file.
 *
 * A wa.me link carries the whole message inside the URL, so a button is a frozen copy
 * of whatever the draft said when it was written. Two backfills (the Growth Operator
 * paragraph, then the sign-off) rewrote the files and left most buttons stale — Elena
 * would have clicked and sent the old text.
 *
 * The first attempt missed them for two reasons, both fixed here:
 *   - the 87 original [CLIENT-MANUAL] notes label first contact "ENVIAR POR WHATSAPP",
 *     not "WHATSAPP 1er CONTACTO", so the regex matched nothing
 *   - it only inspected the FIRST note on a deal; the outreach note is often not it
 *
 * Idempotent and safe to re-run: it rebuilds each anchor from the file on disk and
 * only PATCHes a note whose body actually changed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHubSpotWaAnchor, formatPhone507 } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const DRY = process.argv.includes('--dry');

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

/** Every label shape a WhatsApp button has ever been written with. */
const FIRST_LABEL_RE = /<a href="[^"]*"><b>(➡️ (?:WHATSAPP 1er CONTACTO|ENVIAR POR WHATSAPP)[^<]*)<\/b><\/a>/;
const FU_LABEL_RE = /<a href="[^"]*"><b>(➡️ WHATSAPP FU[^<]*)<\/b><\/a>/;

(async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
  const byDeal = new Map();
  for (const slug of Object.keys(reg)) {
    const e = reg[slug];
    if (!e.draft || !e.dealId || !e.phone) continue;
    const abs = path.join(ROOT, e.draft);
    if (!fs.existsSync(abs)) continue;
    const list = byDeal.get(e.dealId) || [];
    list.push({ slug, isFu: /-fu$/.test(slug), text: fs.readFileSync(abs, 'utf8'), phone: e.phone, score: e.score });
    byDeal.set(e.dealId, list);
  }
  console.log(`deals with WhatsApp drafts: ${byDeal.size}${DRY ? '  (DRY RUN)' : ''}`);

  let patched = 0;
  let unchanged = 0;
  let noButton = 0;
  for (const [dealId, items] of byDeal) {
    try {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
      const noteIds = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      let hitAny = false;
      for (const noteId of noteIds) {
        const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
        let body = note.properties?.hs_note_body || '';
        const before = body;
        for (const it of items) {
          const re = it.isFu ? FU_LABEL_RE : FIRST_LABEL_RE;
          const m = body.match(re);
          if (!m) continue;
          // Keep the label exactly as it was — only the URL is refreshed.
          body = body.replace(re, buildHubSpotWaAnchor(it.phone, it.text, m[1]));
        }
        if (body !== before) {
          hitAny = true;
          if (!DRY) await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, { properties: { hs_note_body: body } });
          patched++;
        }
      }
      if (!hitAny) noButton++;
      else unchanged += 0;
    } catch (e) {
      console.log(`   ⚠ deal ${dealId} — ${String(e.message).slice(0, 70)}`);
    }
  }
  console.log(`\nnotes re-pointed: ${patched} · deals with no WhatsApp button found: ${noButton}`);
})();
