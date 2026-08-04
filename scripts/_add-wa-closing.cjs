#!/usr/bin/env node
/**
 * Append Elena's sign-off to every existing WhatsApp draft — first contact AND
 * follow-up.
 *
 * Elena, Aug 4 2026, looking at the message that had just gone to Vitae: the emails
 * close properly and the WhatsApp messages just stopped at a link. To a business owner
 * that reads like an unfinished draft rather than a person introducing herself.
 *
 * Backs up each file, skips anything already signed, and REGENERATES the HubSpot note
 * button from the new text — a wa.me link carries the whole message inside the URL, so
 * editing the file alone would leave the button still sending the unsigned version.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHubSpotWaAnchor, formatPhone507 } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();

const CLOSING = [
  '',
  '¡Que tengan un excelente día!',
  'Saludos,',
  'Elena Revicheva',
  'Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨',
].join('\n');

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
  const slugs = Object.keys(reg).filter((s) => reg[s].draft && reg[s].dealId && reg[s].phone);
  console.log(`WhatsApp drafts to check: ${slugs.length}`);

  let updated = 0;
  let already = 0;
  const touchedDeals = new Map(); // dealId -> [{slug, text, isFu}]

  for (const slug of slugs) {
    const abs = path.join(ROOT, reg[slug].draft);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (/Fundadora \| Ingeniera/.test(text)) {
      already++;
      continue;
    }
    const next = `${text.replace(/\s+$/, '')}\n${CLOSING}\n`;
    fs.writeFileSync(`${abs}.bak-${Date.now()}`, text, 'utf8');
    fs.writeFileSync(abs, next, 'utf8');
    updated++;
    const list = touchedDeals.get(reg[slug].dealId) || [];
    list.push({ slug, text: next, isFu: /-fu$/.test(slug) });
    touchedDeals.set(reg[slug].dealId, list);
  }

  // Regenerate every affected button so file and link never drift apart.
  let buttons = 0;
  for (const [dealId, items] of touchedDeals) {
    try {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
      const noteId = (assoc.results || []).map((r) => r.toObjectId || r.id)[0];
      if (!noteId) continue;
      const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
      let body = note.properties.hs_note_body || '';
      const before = body;
      for (const it of items) {
        const phone = reg[it.slug].phone;
        const score = reg[it.slug].score;
        const label = it.isFu
          ? `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(phone)})`
          : `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${score}/100 (${formatPhone507(phone)})`;
        const fresh = buildHubSpotWaAnchor(phone, it.text, label);
        const re = it.isFu
          ? /<a href="[^"]*"><b>➡️ WHATSAPP FU[^<]*<\/b><\/a>/
          : /<a href="[^"]*"><b>➡️ WHATSAPP 1er CONTACTO[^<]*<\/b><\/a>/;
        body = body.replace(re, fresh);
      }
      if (body !== before) {
        await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, { properties: { hs_note_body: body } });
        buttons++;
      }
    } catch (e) {
      console.log(`   ⚠ deal ${dealId} — ${String(e.message).slice(0, 70)}`);
    }
  }
  console.log(`\nsigned ${updated} drafts · already signed ${already} · notes updated ${buttons}`);
})();
