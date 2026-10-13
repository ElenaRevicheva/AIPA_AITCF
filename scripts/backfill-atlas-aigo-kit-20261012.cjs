#!/usr/bin/env node
/**
 * ONE-OFF (Elena, 13 Oct 2026): switch the AI Growth Operator kit ON for the 8 Atlas
 * deals staged 12 Oct — deck PDF attached + deck link, the industry promo film, Elena in
 * Cc — and replace the 4 addresses that were not real buyers with contacts dug from the
 * businesses' own pages. The Monday machine itself stays as it is on Oracle until Elena
 * says (atlas-lead-machine.cjs on main carries the kit; Oracle does not).
 *
 * The letters are built by the lead machine's OWN builders (main's version, passed via
 * ATLAS_LM), never retyped here, so they cannot drift from what the machine writes.
 *
 * Already sent 12 Oct 22:43-22:48 (Resend ledger): the 3 Costa Rica first emails → only
 * their FOLLOW-UP is re-staged with the kit. Four Seasons' first email went twice to a
 * placeholder (nombre.apellido@…) and reached nobody → re-staged in full to the real address.
 *
 * Four Seasons and Hyatt answered our audit with HTTP 403 (bot protection): the 48/53
 * scores measured the block page, not the hotel, so those letters say what was measured —
 * the block — and quote no score.
 *
 * Additive: old notes stay; a NEW note per deal carries the corrected buttons + the PDF.
 *   node scripts/backfill-atlas-aigo-kit-20261012.cjs            # dry run, prints letters
 *   node scripts/backfill-atlas-aigo-kit-20261012.cjs --apply
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LM = require(process.env.ATLAS_LM || './atlas-lead-machine.cjs');
const {
  loadRegistry, saveRegistry, buildHubSpotEmailAnchor, buildHubSpotWaAnchor, digitsOnly, formatPhone507,
} = require('./wa-link-lib.cjs');
const { AIGO_DECK_ES_ATTACHMENT, ELENA_COPY_CC } = require('../docs/selling/aigo-kit.cjs');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const APPLY = process.argv.includes('--apply');
// Addresses and phones stay OUT of git (pii-guard; the repo is public until ~20 Nov): they
// live in data/atlas-backfill-20261013.json on Oracle (gitignored), keyed by slug.
const CONTACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/atlas-backfill-20261013.json'), 'utf8'));
const LANE = 'whatsapp_ai_agents';
const WED = 'destination wedding venue';
const SURF = 'surf and yoga retreat';
const CTG = 'Cartagena Colombia';
const STE = 'Santa Teresa Costa Rica';

/**
 * mode full    = first email + FU (+ WA if a verified number) re-staged
 * mode fu-only = first email already went out; only the FU carries the kit
 * blocked      = audit got HTTP 403; letter states the block, no score
 * Sources of each address are in the 13 Oct NOW.md handoff.
 */
const LEADS = [
  { slug: 'surf-camp-costa-rica-atlas', mode: 'fu-only', company: 'Dreamsea Surf Camp',
    website: 'https://www.dreamsea.com', city: STE, query: SURF, audit: { score: 81, grade: 'B', aeo: 81 } },
  { slug: 'surf-vacations-in-costa-rica-yoga-retreat-in-san-atlas', mode: 'fu-only', company: 'Believe Surf & Yoga Costa Rica', website: 'https://www.surfandyogacostarica.com', city: STE, query: SURF, audit: { score: 82, grade: 'B', aeo: 69 } },
  { slug: 'shaka-costa-rica-surf-camp-yoga-santa-teresa-cos-atlas', mode: 'fu-only', company: 'Shaka Costa Rica', website: 'https://shakacostarica.com', city: STE, query: SURF, audit: { score: 90, grade: 'A', aeo: null } },
  { slug: 'cartagena-weddings-atlas', mode: 'full', blocked: true, company: 'Four Seasons Hotel Cartagena', website: 'https://www.fourseasons.com/cartagena/weddings/', city: CTG, query: WED },
  { slug: 'cartagena-colombia-wedding-venues-hyatt-regency-atlas', mode: 'full', blocked: true, company: 'Hyatt Regency Cartagena',
    website: 'https://www.hyatt.com/hyatt-regency/en-US/ctgrc-hyatt-regency-cartagena/weddings', city: CTG, query: WED },
  { slug: 'weddings-at-legend-santa-clara-in-cartagena-atlas', mode: 'full', company: 'Sofitel Legend Santa Clara', website: 'https://www.sofitellegendsantaclara.com', city: CTG, query: WED, audit: { score: 94, grade: 'A+', aeo: null } },
  { slug: 'cartagena-wedding-venues-atlas', mode: 'full', company: 'Two Travel',
    website: 'https://two.travel', city: CTG, query: WED, audit: { score: 98, grade: 'A+', aeo: null } },
  // Not a venue: courtneymuro.com is "The Haute Bøhemian", a luxury travel blog. The letter
  // pitches a booking agent to a business she does not run — a warning note, nothing re-staged.
  { slug: 'this-is-how-much-my-destination-wedding-cost-in--atlas', mode: 'hold', company: 'The Haute Bøhemian (blog de viajes)', website: 'https://courtneymuro.com' },
].map((l) => ({ ...l, ...CONTACTS[l.slug] }));

const BLOCK_LINE = (l) =>
  `Intenté analizar ${l.website} con mi motor de visibilidad en IA y su servidor bloqueó la lectura (acceso denegado, HTTP 403) antes de mostrar la página. ` +
  `Esa misma protección contra bots puede estar frenando también a los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot): si no los deja pasar, ChatGPT no puede leer su oferta de bodas para recomendarla.`;

function letters(l) {
  const angle = { angle: 'urgency_scarcity' };
  const lead = { ...l, lane: LANE };
  // A placeholder audit for the template; every line that would quote it is replaced below.
  const audit = l.audit || { score: 0, grade: '-', aeo: null };
  let first = LM.buildDraft(lead, audit, angle);
  let fu = LM.buildFuDraft(lead, audit, angle);
  if (l.blocked) {
    const a = first.body.split('\n');
    const i = a.findIndex((x) => x.startsWith('Analicé '));
    if (i < 0) throw new Error('template changed: no Analicé line');
    a.splice(i, 1, BLOCK_LINE(l));
    first = { ...first, subject: `${l.company}: su página de bodas bloquea la lectura automática — ¿también a ChatGPT?`, body: a.join('\n') };
    const b = fu.body.split('\n');
    const j = b.findIndex((x) => x.startsWith('Les escribí hace unos días'));
    if (j < 0) throw new Error('template changed: no FU opening line');
    b[j] = `Les escribí hace unos días por correo sobre ${l.company}. ${BLOCK_LINE(l)}`;
    fu = { subject: `Seguimiento — ${l.company}: la IA no puede leer su página de bodas`, body: b.join('\n') };
    if (/\b0\/100|\(-\)/.test(first.body + fu.body + first.subject + fu.subject)) throw new Error('placeholder score leaked');
  }
  const wa = l.phone && l.audit ? LM.buildWaDraft(lead, audit) : null;
  const fuWa = l.phone && l.audit ? LM.buildFuWaDraft(lead, audit) : null;
  return { first, fu, wa, fuWa };
}

async function hs(method, p, body, attempt = 0) {
  const r = await fetch(hubspotBase() + p, {
    method, headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 429 && attempt < 8) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return hs(method, p, body, attempt + 1); }
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p.split('?')[0]} ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : {};
}

if (require.main !== module) { module.exports = { LEADS, letters }; return; }

(async () => {
  const reg = loadRegistry();
  const ledger = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/resend-ledger.json'), 'utf8')); } catch { return []; } })();
  const sentSlugs = new Set((Array.isArray(ledger) ? ledger : Object.values(ledger)).map((e) => e.slug));
  let fileId = null;
  if (APPLY) {
    const bk = path.join(process.env.HOME || ROOT, '_session-backups', 'atlas-aigo-kit-20261013');
    fs.mkdirSync(bk, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), path.join(bk, 'outreach-registry.json'));
    for (const l of LEADS) for (const s of [l.slug, `${l.slug}-fu`]) for (const f of [`${s}-email.txt`, `${s}.txt`]) {
      const p = path.join(ROOT, 'docs/selling/drafts', f);
      if (fs.existsSync(p)) fs.copyFileSync(p, path.join(bk, f));
    }
    console.log(`backup → ${bk}`);
    const { uploadOutreachFile } = require('./hs-files.cjs');
    const f = await uploadOutreachFile(path.join(ROOT, AIGO_DECK_ES_ATTACHMENT.path), AIGO_DECK_ES_ATTACHMENT.filename);
    fileId = String(f.id);
    console.log(`deck file ${fileId}${f.reused ? ' (reused)' : ''}`);
  }

  for (const l of LEADS) {
    const row = reg[l.slug];
    if (!row?.dealId) throw new Error(`${l.slug}: no registry row/dealId`);
    // A first email that went to a REAL address must never be re-staged (it would send twice).
    if (l.mode === 'full' && sentSlugs.has(l.slug) && row.email === l.email) throw new Error(`${l.slug}: first email already sent to ${l.email}`);
    if (l.mode === 'fu-only' && sentSlugs.has(`${l.slug}-fu`)) { console.log(`skip ${l.slug}: FU already sent`); continue; }
    if (l.mode === 'hold') {
      console.log(`
══ HOLD ${l.company} · deal ${row.dealId} — warning note only`);
      if (APPLY) {
        const n = await hs('POST', '/crm/v3/objects/notes', {
          properties: { hs_timestamp: Date.now(), hs_note_body:
            `<b>⚠️ NO ENVIAR — 13 Oct</b><br>${l.website} no es un lugar de bodas: es <b>${l.company}</b>, el blog de una creadora de contenido. ` +
            `La carta de Atlas le ofrece un agente de reservas para un negocio que ella no tiene. El contacto (${l.email}) sí es el suyo. Decisión de Elena.` },
          associations: [{ to: { id: row.dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
        });
        console.log(`  note ${n.id}`);
      }
      continue;
    }
    const { first, fu, wa, fuWa } = letters(l);
    console.log(`\n══ ${l.company} <${l.email}> · deal ${row.dealId} · ${l.mode}${l.blocked ? ' · 403' : ''}`);
    if (l.mode === 'full') console.log(`SUBJECT: ${first.subject}\n${first.body}\n── FU: ${fu.subject}`);
    else console.log(`FU SUBJECT: ${fu.subject}\n${fu.body}`);
    if (!APPLY) continue;

    const common = { company: l.company, email: l.email, score: l.audit ? l.audit.score : null, dealId: row.dealId,
      ...(l.phone ? { phone: digitsOnly(l.phone) } : {}), cc: ELENA_COPY_CC, attachments: [AIGO_DECK_ES_ATTACHMENT] };
    const write = (slug, m, waText) => {
      const er = `docs/selling/drafts/${slug}-email.txt`;
      fs.writeFileSync(path.join(ROOT, er), `SUBJECT: ${m.subject}\n\nTO: ${l.email}\n\n${m.body}\n`, 'utf8');
      const wr = `docs/selling/drafts/${slug}.txt`;
      if (waText) fs.writeFileSync(path.join(ROOT, wr), waText, 'utf8');
      reg[slug] = { ...common, emailDraft: er, ...(waText ? { draft: wr } : {}) };
    };
    if (l.mode === 'full') write(l.slug, first, wa);
    write(`${l.slug}-fu`, fu, fuWa);
    saveRegistry(reg);

    const dealId = row.dealId;
    const label = l.blocked ? 'audit: 403 bloqueado' : `audit: ${l.audit.score}/${l.audit.grade}`;
    await hs('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: { dealname: `[CLIENT-ATLAS] ${l.company} — WhatsApp agent (${label}) · urgency_scarcity` } });
    if (l.mode === 'full' && row.email !== l.email) {
      const a = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/contacts`);
      const cid = a.results?.[0]?.toObjectId;
      if (cid) await hs('PATCH', `/crm/v3/objects/contacts/${cid}`, { properties: { email: l.email, company: l.company } });
      console.log(`  contact ${cid || '(none)'}: ${row.email} → ${l.email}`);
    }
    const btn = [];
    if (l.mode === 'full') {
      btn.push(buildHubSpotEmailAnchor(l.slug, l.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${l.email}) · Cc Elena · PDF adjunto`));
      if (wa) btn.push(buildHubSpotWaAnchor(l.phone, wa, `➡️ WHATSAPP 1er CONTACTO (laptop) (${formatPhone507(l.phone)})`));
    }
    btn.push(buildHubSpotEmailAnchor(`${l.slug}-fu`, l.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${l.email}) · Cc Elena · PDF adjunto`));
    if (fuWa) btn.push(buildHubSpotWaAnchor(l.phone, fuWa, `➡️ WHATSAPP FU (laptop) (${formatPhone507(l.phone)})`));
    const shown = l.mode === 'full' ? first : fu;
    const noteBody = [
      `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
      btn.join('<br>'), `<br><br>`,
      `<b>🔁 13 Oct — kit activado: presentación PDF adjunta + video + Cc Elena</b><br>`,
      l.mode === 'fu-only' ? `El 1er correo ya salió el 12 Oct sin el kit; el seguimiento lo lleva.<br>` : '',
      row.email !== l.email ? `<b>Contacto verificado:</b> ${l.email} (antes: ${row.email})<br>` : '',
      l.blocked ? `<b>Auditoría:</b> su servidor bloqueó la lectura (HTTP 403) — el puntaje anterior medía la página de bloqueo, no el hotel.<br>` : '',
      `<b>Sitio:</b> ${l.website}<br><hr>`,
      `<b>Asunto:</b> ${shown.subject}<br><br>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${shown.body.replace(/</g, '&lt;')}</pre>`,
    ].join('');
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteBody, hs_timestamp: Date.now(), hs_attachment_ids: fileId },
      associations: [{ to: { id: dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
    console.log(`  note ${note.id} · registry ${l.mode === 'full' ? l.slug + ' + ' : ''}${l.slug}-fu`);
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
