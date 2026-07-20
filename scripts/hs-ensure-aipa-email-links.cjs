#!/usr/bin/env node
/**
 * hs-ensure-aipa-email-links.cjs — ensure every [CLIENT-MANUAL] registry deal with
 * an email has the one-click aipa@ Resend link at the top of the HubSpot note
 * (alongside WhatsApp). Also writes missing *-email.txt drafts + updates registry.
 *
 * Usage: node scripts/hs-ensure-aipa-email-links.cjs [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildHubSpotWaAnchor,
  buildHubSpotEmailAnchor,
  buildManualEmailSubject,
  buildManualEmailBody,
  loadRegistry,
  registerOutreachSlug,
  readDraftUtf8,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const KEY = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY && !dryRun) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function hs(method, urlPath, body) {
  const res = await fetch(`https://api.hubapi.com${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** Known deal IDs for registry backfill */
const DEAL_IDS = {
  dopanama: '62821413988',
  'nomad-constructions-corp': '62832583063',
  'panama-aesthetics': '62873560951',
  'yc-panama-yachts': '62864888204',
  'fuerte-amador-resort-marina': '62857562269',
  'centro-marino-panam': '62863032403',
};

const NOTE_IDS = {
  dopanama: '113233845937',
  'nomad-constructions-corp': '113241617071',
  'panama-aesthetics': '113300656658',
  'yc-panama-yachts': '113304365082',
  'fuerte-amador-resort-marina': '113315049527',
  'centro-marino-panam': '113299431175',
};

(async () => {
  const reg = loadRegistry();

  // Pull emails from HubSpot contacts when missing in registry
  for (const [slug, cfg] of Object.entries(reg)) {
    const dealId = cfg.dealId || DEAL_IDS[slug];
    if (!dealId) continue;
    if (!cfg.email) {
      const d = await hs(
        'GET',
        `/crm/v3/objects/deals/${dealId}?properties=dealname&associations=contacts`,
      );
      const cid = d.associations?.contacts?.results?.[0]?.id;
      if (cid) {
        const c = await hs('GET', `/crm/v3/objects/contacts/${cid}?properties=email,phone`);
        if (c.properties?.email) cfg.email = c.properties.email.trim().toLowerCase();
      }
    }
    cfg.dealId = dealId;
    if (cfg.email && !cfg.emailDraft) {
      cfg.emailDraft = `docs/selling/drafts/${slug}-email.txt`;
    }
    if (cfg.email && cfg.draft && !fs.existsSync(path.join(root, cfg.emailDraft))) {
      const wa = readDraftUtf8(cfg.draft);
      const score = cfg.score || 0;
      const subject = buildManualEmailSubject(cfg.company || slug, score);
      const body = buildManualEmailBody(wa, { botFallback: false });
      const file = `SUBJECT: ${subject}\n\nTO: ${cfg.email}\n\n${body}\n`;
      if (!dryRun) {
        fs.writeFileSync(path.join(root, cfg.emailDraft), file, 'utf8');
        console.log('WROTE', cfg.emailDraft);
      } else console.log('DRY would write', cfg.emailDraft);
    }
    if (!dryRun) {
      registerOutreachSlug(slug, cfg.phone, cfg.draft, cfg.company, {
        email: cfg.email,
        emailDraft: cfg.emailDraft,
        dealId: cfg.dealId,
        score: cfg.score,
      });
    }
  }

  for (const [slug, cfg] of Object.entries(loadRegistry())) {
    if (!cfg.email || !cfg.phone || !cfg.draft) {
      console.log('SKIP (need email+phone+draft)', slug);
      continue;
    }
    const noteId = NOTE_IDS[slug];
    if (!noteId) {
      console.log('SKIP (no note id)', slug);
      continue;
    }
    const draft = readDraftUtf8(cfg.draft);
    const emailRaw = cfg.emailDraft && fs.existsSync(path.join(root, cfg.emailDraft))
      ? fs.readFileSync(path.join(root, cfg.emailDraft), 'utf8').trim()
      : '';
    const wa = buildHubSpotWaAnchor(cfg.phone, draft);
    const em = buildHubSpotEmailAnchor(slug, cfg.email);
    const head = [
      `[CLIENT-MANUAL] ${cfg.company} — AI Visibility outreach (https links; data verified live)`,
      '',
      wa,
      '',
      em,
      '',
      '<i><b>Email options (always both):</b> (1) HubSpot → Email from <b>aipa@aideazz.xyz</b> — best CRM trail; paste SUBJECT/body from EMAIL block. (2) Speed: click <b>ENVIAR POR EMAIL — aipa@</b> → confirm → Resend (same From). If WA is a bot, use email.</i>',
      '',
      '--- MENSAJE WhatsApp ---',
      '',
      escHtml(draft),
      '',
      '--- EMAIL (HubSpot paste OR one-click aipa@ link above) ---',
      '',
      emailRaw ? escHtml(emailRaw) : `<i>TO: ${cfg.email}</i>`,
    ].join('<br>');

    if (dryRun) {
      console.log('DRY would patch note', slug, noteId);
      continue;
    }
    const note = await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
    const old = note.properties?.hs_note_body || '';
    const idx = old.search(/--- Audit \(verified live\) ---/);
    const sentIdx = old.search(/✅ SENT|📧 EMAILED|💬 /);
    let tail = '';
    if (idx >= 0) tail = old.slice(idx);
    else if (sentIdx >= 0) tail = old.slice(sentIdx);
    const newBody = tail ? `${head}<br><br>${tail}` : head;
    await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, {
      properties: { hs_note_body: newBody },
    });
    console.log('PATCHED', slug, noteId, 'aipa@ link ready');
  }
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
