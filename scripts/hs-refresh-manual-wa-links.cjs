#!/usr/bin/env node
/** Refresh HubSpot wa links → slug-only /go/outreach/{slug} (emoji-safe). */
const fs = require('fs');
const path = require('path');
const {
  buildHubSpotWaAnchor,
  readDraftUtf8,
  formatPhone507,
  loadRegistry,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const KEY = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.error('HUBSPOT_API_KEY missing'); process.exit(1); }

const HS = 'https://api.hubapi.com';
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const DEAL_BY_SLUG = {
  dopanama: '62821413988',
  'nomad-constructions-corp': '62832583063',
};

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

async function latestDealNote(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map(r => r.toObjectId || r.id).filter(Boolean);
  let best = null;
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    if (!best || (n.properties?.hs_timestamp || '') > (best.properties?.hs_timestamp || '')) best = n;
  }
  return best;
}

(async () => {
  const reg = loadRegistry();
  for (const [slug, cfg] of Object.entries(reg)) {
    const dealId = DEAL_BY_SLUG[slug];
    if (!dealId) { console.warn('NO_DEAL', slug); continue; }
    const draft = readDraftUtf8(cfg.draft);
    const anchor = buildHubSpotWaAnchor(slug, cfg.phone);
    const phoneFmt = formatPhone507(cfg.phone);
    const note = await latestDealNote(dealId);
    if (!note) { console.warn('NO_NOTE', dealId); continue; }
    const old = note.properties.hs_note_body || '';
    const tailMatch = old.match(/--- Audit \(verified live\) ---[\s\S]*/);
    const head = [
      `[CLIENT-MANUAL] ${cfg.company} — AI Visibility outreach (https links; data verified live)`,
      '',
      anchor,
      '',
      '--- MENSAJE (plain text — copy or send via link above) ---',
      '',
      draft,
    ].map(l => escHtml(l)).join('<br>');
    const newBody = tailMatch ? head + '<br>' + tailMatch[0] : head;
    await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, { properties: { hs_note_body: newBody } });
    console.log('PATCHED', slug, dealId, note.id);
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
