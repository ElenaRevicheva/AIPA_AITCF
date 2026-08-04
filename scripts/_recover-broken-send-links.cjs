#!/usr/bin/env node
/**
 * Rebuild the registry entries + draft files for deals whose send buttons are dead.
 *
 * 33 buttons across 17 deals point at slugs that no longer exist: the Atlas runs wrote
 * their registry entries and drafts on Oracle, they were never committed, and the reset
 * to origin/main took them. The CRM records survived — git does not hold those.
 *
 * Recovery source is HubSpot itself, not regeneration. The note already contains the
 * exact letter that was written (inside its <pre> block) and the exact WhatsApp text
 * (encoded inside the wa.me URL of its button). Rebuilding from those means the files
 * match what the buttons have always promised to send, with no drift from a template
 * that has changed twice since.
 *
 * Safe to re-run: it only touches slugs that are currently missing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRegistry, saveRegistry } = require('./wa-link-lib.cjs');

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

const unesc = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

(async () => {
  const broken = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/_broken_send_links.json'), 'utf8'));
  const reg = loadRegistry();
  const byDeal = new Map();
  for (const b of broken) {
    if (reg[b.slug]) continue; // already recovered
    const list = byDeal.get(b.dealId) || [];
    list.push(b);
    byDeal.set(b.dealId, list);
  }
  console.log(`deals to recover: ${byDeal.size}${DRY ? '  (DRY RUN)' : ''}`);

  let files = 0;
  let entries = 0;
  const failed = [];

  for (const [dealId, items] of byDeal) {
    const deal = await hs('GET', `/crm/v3/objects/deals/${dealId}?properties=dealname`);
    const dealName = deal?.properties?.dealname || '';
    const score = Number((dealName.match(/audit:\s*(\d+)/) || [])[1]) || null;

    const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
    const noteIds = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let body = '';
    for (const nid of noteIds) {
      const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      const t = n.properties?.hs_note_body || '';
      if (/\/go\/outreach-email\//.test(t)) {
        body = t;
        break;
      }
    }
    if (!body) {
      failed.push({ dealId, dealName, why: 'no note with send links' });
      continue;
    }

    // The letter, exactly as it was written, from the note's <pre> block.
    const pre = unesc((body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) || [])[1] || '').trim();
    const subject = unesc((body.match(/<b>Asunto:<\/b>\s*([^<]+)/i) || [])[1] || '').trim();
    const email = ((body.match(/EMAIL[^(]*\(([^)]+@[^)]+)\)/i) || [])[1] || '').trim();
    // WhatsApp text lives inside the button URL.
    const waUrls = [...body.matchAll(/href="(https:\/\/web\.whatsapp\.com\/send[^"]*)"/g)].map((m) =>
      unesc(m[1]),
    );
    const waOf = (u) => {
      try {
        return decodeURIComponent((new URL(u).searchParams.get('text') || '').replace(/\+/g, ' '));
      } catch {
        return '';
      }
    };
    const phone = (() => {
      try {
        return waUrls.length ? new URL(waUrls[0]).searchParams.get('phone') : null;
      } catch {
        return null;
      }
    })();

    for (const it of items) {
      const isFu = /-fu$/.test(it.slug);
      const dRel = `docs/selling/drafts/${it.slug}-email.txt`;
      const wRel = `docs/selling/drafts/${it.slug}.txt`;
      // The FIRST-contact letter is the one shown in the note; an FU draft that was
      // never previewed cannot be recovered faithfully, so it is rebuilt from the
      // first-contact letter's facts rather than invented.
      const letter = pre;
      if (!letter || !email) {
        failed.push({ dealId, dealName, slug: it.slug, why: !email ? 'no email in note' : 'no letter in note' });
        continue;
      }
      const subj = isFu
        ? `Seguimiento — auditoría de visibilidad en IA: ${dealName.replace(/^\[CLIENT-ATLAS\]\s*/, '').replace(/\s*—.*$/, '')} (${score}/100)`
        : subject || `Auditoría de visibilidad en IA (${score}/100)`;
      if (!DRY) {
        fs.writeFileSync(path.join(ROOT, dRel), `SUBJECT: ${subj}\n\nTO: ${email}\n\n${letter}\n`, 'utf8');
        const wa = waOf(waUrls[isFu ? 1 : 0] || waUrls[0] || '');
        if (wa) fs.writeFileSync(path.join(ROOT, wRel), wa, 'utf8');
        files++;
      }
      reg[it.slug] = {
        company: dealName.replace(/^\[CLIENT-[A-Z]+\]\s*/, '').replace(/\s*—.*$/, '').trim(),
        email,
        emailDraft: dRel,
        score,
        dealId: String(dealId),
        ...(phone ? { phone, draft: wRel } : {}),
      };
      entries++;
      console.log(`  ✅ ${it.slug}`);
    }
  }

  if (!DRY) saveRegistry(reg);
  console.log(`\nregistry entries rebuilt: ${entries} · draft files written: ${files} · failed: ${failed.length}`);
  for (const f of failed) console.log(`   ✗ ${f.slug || f.dealName?.slice(0, 40)} — ${f.why}`);
})();
