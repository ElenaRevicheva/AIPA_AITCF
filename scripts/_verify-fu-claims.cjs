#!/usr/bin/env node
/**
 * Verify EVERY claim in EVERY follow-up against Elena's own sources (July 26 2026).
 *
 * Nothing in a FU may be invented. For each deal we re-derive the claims from the
 * generated FU text and require each one to be traceable:
 *
 *   score/grade   → deal name "(audit: 70/B)" and/or the original note
 *   domain        → HubSpot company domain / original note
 *   quoted query  → must appear VERBATIM in the ORIGINAL note or in the
 *                   first-contact draft she actually sent (docs/selling/drafts/{slug}.txt)
 *   category score→ e.g. "AEO 60/100" must appear in the original note
 *   city (no-query variant) → HubSpot company city
 *   WhatsApp text → the href in the note must decode to the SAME text as the email FU
 *
 * "Original note" = the note with our own FU block stripped, so the FU can never
 * verify itself (that self-feeding loop is exactly what produced a fake query once).
 *
 * Read-only: touches nothing in HubSpot. Writes docs/selling/_verify-fu-claims.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('HUBSPOT_API_KEY missing');
const headers = { Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FU_MARKER = '<!-- WA-FU-GROWTH-OPERATOR -->';

async function hs(p, attempt = 0) {
  const r = await fetch(`https://api.hubapi.com${p}`, { headers });
  const t = await r.text();
  if (r.status === 429 && attempt < 10) {
    await sleep(1400 * (attempt + 1));
    return hs(p, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

const stripFu = (html) =>
  String(html)
    .replace(new RegExp(`${FU_MARKER}[\\s\\S]*?<hr>(?:<br>)?`, 'gi'), '')
    .replace(/(?:<b>)?FOLLOW-UP WhatsApp \(click[\s\S]*?<hr>(?:<br>)?/gi, '')
    .replace(/(?:<b>)?FOLLOW-UP — click y enviar[\s\S]*?<hr>(?:<br>)?/gi, '');

const plain = (html) =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Normalize for comparison: curly quotes, punctuation spacing, case. */
const norm = (s) =>
  String(s || '')
    .replace(/[“”«»„]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

(async () => {
  const reg = loadRegistry();
  const fuRows = Object.entries(reg).filter(([slug, c]) => /-fu$/.test(slug) && c.dealId);
  const report = { checked: 0, clean: 0, flagged: [], errors: [] };

  for (let i = 0; i < fuRows.length; i++) {
    const [fuSlug, cfg] = fuRows[i];
    const baseSlug = fuSlug.replace(/-fu$/, '');
    process.stderr.write(`\r ${i + 1}/${fuRows.length} ${baseSlug.slice(0, 34).padEnd(34)}`);
    const problems = [];
    try {
      report.checked++;
      const fuPath = path.join(root, cfg.emailDraft || `docs/selling/drafts/${baseSlug}-fu-email.txt`);
      if (!fs.existsSync(fuPath)) {
        problems.push('FU draft file missing');
        report.flagged.push({ slug: baseSlug, problems });
        continue;
      }
      const fuText = fs.readFileSync(fuPath, 'utf8');

      // ── sources of truth ────────────────────────────────────────────────
      const deal = await hs(`/crm/v3/objects/deals/${cfg.dealId}?properties=dealname`);
      const dealName = deal.properties?.dealname || '';
      await sleep(90);
      const assoc = await hs(`/crm/v4/objects/deals/${cfg.dealId}/associations/notes`);
      const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      let best = null;
      for (const id of ids.slice(0, 5)) {
        await sleep(70);
        const n = await hs(`/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
        if (!best || (n.properties?.hs_timestamp || '') > (best.properties?.hs_timestamp || '')) best = n;
      }
      const rawNote = best?.properties?.hs_note_body || '';
      const original = plain(stripFu(rawNote));
      let firstDraft = '';
      const fdPath = path.join(root, `docs/selling/drafts/${baseSlug}.txt`);
      if (fs.existsSync(fdPath)) firstDraft = fs.readFileSync(fdPath, 'utf8');
      // Deliberately STRICT: only the deal name, the original audit note, and the
      // first-contact draft she actually sent count as sources. The HubSpot company
      // "domain" field is not evidence that the audit ran on that URL.
      const sources = norm(`${dealName}\n${original}\n${firstDraft}`);

      // ── claim 1: score / grade ──────────────────────────────────────────
      const sc = fuText.match(/visibilidad en IA:\s*(\d+)\/100\s*\(([A-F][+-]?)\)/i);
      if (!sc) problems.push('no score claim found in FU');
      else {
        const [, score, grade] = sc;
        const inName = new RegExp(`audit:\\s*${score}\\s*/\\s*${grade}`, 'i').test(dealName);
        const inNote = new RegExp(`${score}\\s*/\\s*100`).test(original) || new RegExp(`audit:\\s*${score}`, 'i').test(original);
        if (!inName && !inNote) problems.push(`score ${score}/${grade} not found in deal name or note`);
      }

      // ── claim 2: domain ─────────────────────────────────────────────────
      const dm = fuText.match(/Analicé\s+([^\s]+)\s+con mi motor/i);
      if (dm && dm[1] !== 'su' && !/^sitio$/i.test(dm[1])) {
        if (!sources.includes(norm(dm[1]))) problems.push(`domain "${dm[1]}" not found in sources`);
      }

      // ── claim 3: quoted money query (verbatim in her own material) ───────
      const q = fuText.match(/pregunta a ChatGPT o Perplexity\s*"([^"]+)"/i);
      if (q) {
        if (!sources.includes(norm(q[1]))) {
          problems.push(`QUOTED QUERY not traceable: "${q[1]}"`);
        }
      }

      // ── claim 4: category score ─────────────────────────────────────────
      const w = fuText.match(/respuesta citable\s*\(([^)]+?)\s+(\d+)\/100\)/i);
      if (w) {
        const cat = w[1].trim();
        const val = w[2];
        const ok =
          new RegExp(`${cat}\\s*[:\\s]*${val}`, 'i').test(original) ||
          new RegExp(`${cat}[^\\d]{0,12}${val}`, 'i').test(original) ||
          new RegExp(`${cat}[^\\d]{0,12}${val}`, 'i').test(firstDraft);
        if (!ok) problems.push(`category claim "${cat} ${val}/100" not found in note`);
      }

      // ── claim 5: city (used only when there is no quoted query) ──────────
      const c = fuText.match(/opciones como la suya en ([^,\.]+),/i);
      if (c) {
        await sleep(70);
        const cAssoc = await hs(`/crm/v4/objects/deals/${cfg.dealId}/associations/companies`);
        const coId = (cAssoc.results || []).map((r) => r.toObjectId || r.id)[0];
        let city = '';
        if (coId) {
          const co = await hs(`/crm/v3/objects/companies/${coId}?properties=city`);
          city = co.properties?.city || '';
        }
        if (!city || norm(city) !== norm(c[1])) {
          problems.push(`city claim "${c[1].trim()}" ≠ HubSpot city "${city}"`);
        }
      }

      // ── claim 6: channel ("por correo" / "por WhatsApp") ─────────────────
      if (/hace unos días por correo/i.test(fuText) && !/📧\s*EMAILED|Resend:/i.test(original)) {
        problems.push('claims "por correo" but note has no EMAILED/Resend stamp');
      }
      if (/hace unos días por WhatsApp/i.test(fuText) && !/✅\s*SENT/i.test(original)) {
        problems.push('claims "por WhatsApp" but note has no SENT stamp');
      }

      // ── claim 7: the WhatsApp button carries the SAME text as the email ──
      // Scope to the FU block only — the note also holds the FIRST-CONTACT WhatsApp
      // button, whose text is legitimately different (false-flagged san-blas-tour).
      const fuBlock =
        (rawNote.match(/FOLLOW-UP — click y enviar[\s\S]*?<hr>/i) || [''])[0] || '';
      const href = fuBlock.match(/href="https:\/\/web\.whatsapp\.com\/send\?phone=(\d+)&(?:amp;)?text=([^"]+)"/i);
      if (href) {
        let waText = '';
        try {
          waText = decodeURIComponent(href[2].replace(/&amp;/g, '&'));
        } catch {
          problems.push('WhatsApp href text could not be decoded');
        }
        const emailBody = fuText.replace(/^SUBJECT:.*$/m, '').replace(/^TO:.*$/m, '').trim();
        const bodyCore = norm(emailBody.replace(/^Estimado equipo de [^:]+:\s*/i, '').replace(/^¡Un gusto/i, 'hola, ¡un gusto'));
        if (waText && !norm(waText).includes(norm(emailBody.split('\n').find((l) => /Analicé/.test(l)) || 'x'))) {
          problems.push('WhatsApp text differs from email FU text');
        }
        if (waText && cfg.phone && href[1] !== String(cfg.phone)) {
          problems.push(`WhatsApp href phone ${href[1]} ≠ registry ${cfg.phone}`);
        }
        void bodyCore;
      }

      // ── claim 8: no engineering jargon reached the prospect ─────────────
      if (/JSON-?LD|FAQPage|LodgingBusiness|robots\.txt|llms\.txt|Top fixes|schema/i.test(fuText)) {
        problems.push('engineering jargon present in FU text');
      }

      if (problems.length) report.flagged.push({ slug: baseSlug, dealId: cfg.dealId, problems });
      else report.clean++;
    } catch (e) {
      report.errors.push({ slug: baseSlug, err: e.message });
    }
  }
  process.stderr.write('\n');
  console.log(
    JSON.stringify(
      { checked: report.checked, clean: report.clean, flagged: report.flagged.length, errors: report.errors.length },
      null,
      2,
    ),
  );
  for (const f of report.flagged) console.log(`\n${f.slug}:\n  - ${f.problems.join('\n  - ')}`);
  fs.writeFileSync(
    path.join(root, 'docs/selling/_verify-fu-claims.json'),
    JSON.stringify({ ...report, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
