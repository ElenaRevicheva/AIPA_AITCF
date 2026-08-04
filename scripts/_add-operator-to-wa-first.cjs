#!/usr/bin/env node
/**
 * Add the AI Growth Operator paragraph to every EXISTING WhatsApp first-contact draft.
 *
 * Elena, Aug 4 2026: it belongs in the first WhatsApp message too, not only the
 * follow-up — it is what reframes her from "someone who audits websites" to "someone
 * who runs the growth motion".
 *
 * Rewrites only first-contact WA drafts (never the -fu ones, which already carry it),
 * skips any that already contain it, and backs up each file before touching it.
 * The HubSpot note links are regenerated from the new text so the button and the file
 * never drift apart — a wa.me link embeds the message, so editing the file alone would
 * leave the button sending the old wording.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHubSpotWaAnchor, formatPhone507 } = require('./wa-link-lib.cjs');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const REG = path.join(ROOT, 'docs/selling/outreach-registry.json');

const OPERATOR_ES =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  const ONLY = (process.env.ONLY_SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const targets = Object.keys(reg).filter(
    (s) => !/-fu$/.test(s) && reg[s].draft && reg[s].dealId && (!ONLY.length || ONLY.includes(s)),
  );
  console.log(`first-contact WA drafts to check: ${targets.length}`);

  let updated = 0;
  let already = 0;
  for (const slug of targets) {
    const rel = reg[slug].draft;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.log(`   ⚠ ${slug} — draft file missing, skipped`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    if (text.includes('AI Growth Operator')) {
      already++;
      continue;
    }

    // Insert before the closing call-to-action so the message still ends on the ask.
    const lines = text.split('\n');
    const ctaIdx = lines.findIndex((l) => /15 minutos|15 min|aideazz\.xyz\/api/.test(l));
    const at = ctaIdx > 0 ? ctaIdx : lines.length;
    lines.splice(at, 0, OPERATOR_ES, '');
    const next = lines.join('\n');

    fs.writeFileSync(`${abs}.bak-${Date.now()}`, text, 'utf8');
    fs.writeFileSync(abs, next, 'utf8');

    // Regenerate the note button from the NEW text — the wa.me link carries the
    // message inside the URL, so a stale button would keep sending the old wording.
    const phone = reg[slug].phone;
    if (phone) {
      const assoc = await hs('GET', `/crm/v4/objects/deals/${reg[slug].dealId}/associations/notes`);
      const noteId = (assoc.results || []).map((r) => r.toObjectId || r.id)[0];
      if (noteId) {
        const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
        const body = note.properties.hs_note_body || '';
        const label = `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${reg[slug].score}/100 (${formatPhone507(phone)})`;
        const fresh = buildHubSpotWaAnchor(phone, next, label);
        // Replace the whole existing first-contact anchor, whatever its old URL was.
        const patched = body.replace(/<a href="[^"]*"><b>➡️ WHATSAPP 1er CONTACTO[^<]*<\/b><\/a>/, fresh);
        if (patched !== body) {
          await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, { properties: { hs_note_body: patched } });
        }
      }
    }
    updated++;
    console.log(`   ✅ ${slug} — paragraph added, note button regenerated`);
  }
  console.log(`\nupdated ${updated} · already had it ${already}`);
})();
