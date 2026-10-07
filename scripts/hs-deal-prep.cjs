#!/usr/bin/env node
/**
 * hs-deal-prep.cjs — print a job deal's prep material from HubSpot, for interview practice. READ-ONLY.
 *
 *   node scripts/hs-deal-prep.cjs --company="Addepto"      # best matching [HIRING-…] deal
 *   node scripts/hs-deal-prep.cjs --deal=<dealId>
 *
 * WHY (7 Oct 2026, Elena: "it should be able to pick the deal data from hubspot"). The OpenClaw mock-interview
 * skill (openclaw-vibejob-shortlist, docs/openclaw/interview-spar) prepares her for a SPECIFIC job. Everything that
 * job needs is already on its deal, written by the apply kit: the posting link, 🔎 COMPANY BRIEF, 🛡️ TECHNICAL
 * DEFENSE, 🎯 ROLE DEFENSE, the letter. Nothing could read it back. This only reads — same calls as
 * hs-audit-apply-kit.cjs, same job-deal definition (lib/hiring-deals.cjs). It never writes to HubSpot.
 */
'use strict';
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');
const { isJobDeal } = require('./lib/hiring-deals.cjs');
const { COMET_MARK } = require('./lib/comet-prompt.cjs');

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3).trim();
const MAX_NOTE = 2500;

async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 4) {
      await r.text();
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      continue;
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${urlPath.split('?')[0]} → ${r.status}: ${text.slice(0, 120)}`);
    return JSON.parse(text);
  }
}

const stripHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

function label(text) {
  if (text.includes('📌 JOB POSTING')) return '📌 JOB POSTING';
  if (text.includes('COMPANY BRIEF')) return '🔎 COMPANY BRIEF';
  if (text.includes('ROLE DEFENSE')) return '🎯 ROLE DEFENSE (model-written from verified material — context, not a quotable proof)';
  if (text.includes('TECHNICAL DEFENSE')) return '🛡️ TECHNICAL DEFENSE';
  if (/cover letter|dear hiring|hiring team/i.test(text)) return '✉️ LETTER';
  return '📝 NOTE';
}

async function notesOf(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const out = [];
  for (const r of assoc.results || []) {
    const n = await hs('GET', `/crm/v3/objects/notes/${r.toObjectId}?properties=hs_note_body,hs_timestamp`);
    out.push({ html: String(n.properties?.hs_note_body || ''), ts: n.properties?.hs_timestamp || '' });
  }
  return out;
}

(async () => {
  const company = arg('company');
  let dealId = arg('deal');
  if (!company && !dealId) {
    console.error('usage: --company="<company>" | --deal=<dealId>');
    process.exit(2);
  }

  if (!dealId) {
    const res = await hs('POST', '/crm/v3/objects/deals/search', {
      query: company,
      properties: ['dealname', 'dealstage', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 20,
    });
    const found = (res.results || []).filter((d) => /^\s*\[HIRING-/i.test(d.properties.dealname || ''));
    if (!found.length) {
      console.log(`No [HIRING-…] deal in HubSpot matches "${company}".`);
      return;
    }
    // Prefer a live deal (I act TODAY / interview stages) over a closed one.
    const live = found.filter((d) => !/closed/i.test(d.properties.dealstage || ''));
    const pick = (live.length ? live : found)[0];
    if (found.length > 1) {
      console.log(`${found.length} matching job deals (newest first):`);
      for (const d of found.slice(0, 6)) console.log(`  · ${d.properties.dealname} [${d.properties.dealstage}] id=${d.id}`);
      console.log('');
    }
    dealId = pick.id;
  }

  const deal = await hs('GET', `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,createdate`);
  const notes = await notesOf(dealId);
  if (!isJobDeal(deal.properties.dealname, notes.map((n) => n.html))) {
    console.log(`Deal ${dealId} is not a job deal: ${deal.properties.dealname}`);
    return;
  }

  console.log(`===== DEAL: ${deal.properties.dealname}`);
  console.log(`stage: ${deal.properties.dealstage} · created: ${String(deal.properties.createdate).slice(0, 10)} · id: ${dealId}`);
  const links = new Set();
  for (const n of notes) {
    for (const m of n.html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
      if (!/hubspot|webhook\.aideazz|aideazz\.xyz/i.test(m[1])) links.add(m[1]);
    }
  }
  if (links.size) console.log(`posting / apply links: ${[...links].slice(0, 3).join(' · ')}`);

  for (const n of notes) {
    const text = stripHtml(n.html);
    if (!text || text.includes(COMET_MARK)) continue; // the Comet prompt only re-quotes the letter
    console.log(`\n===== ${label(text)}`);
    console.log(text.length > MAX_NOTE ? `${text.slice(0, MAX_NOTE)} …[cut]` : text);
  }
})().catch((e) => {
  console.error(`hs-deal-prep failed: ${e.message}`);
  process.exit(1);
});
