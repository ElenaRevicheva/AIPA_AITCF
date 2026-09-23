#!/usr/bin/env node
/**
 * hs-audit-apply-kit.cjs — prove every "🔥 I Act TODAY" HIRING deal carries BOTH halves of the
 * apply kit: a cover letter in its note AND a CV PDF attached to that note.
 *
 *   node scripts/hs-audit-apply-kit.cjs            → read-only report, exit 1 on any gap
 *   node scripts/hs-audit-apply-kit.cjs --telegram → same, plus a Telegram alert when a gap exists
 *
 * WHY. The attach job's own log is not proof: on 22 Sep it said "no note 7 · failed 0" while
 * those deals had notes. This script trusts nothing the writers say about themselves — it reads
 * HubSpot back, deal by deal, and checks the finished state. It writes nothing to HubSpot.
 */
'use strict';

const path = require('path');
const { hubspotKey, hubspotBase, envValue } = require(path.join(__dirname, 'hs-env.cjs'));

const TELEGRAM = process.argv.includes('--telegram');
const STAGE = 'qualifiedtobuy';
// The letter VJH writes is headed "--- COVER LETTER"; hand-staged deals say "Cover letter".
const LETTER_RE = /COVER LETTER/i;
const MIN_LETTER_CHARS = 400; // a heading with no letter under it is not a letter
// A stub is not a letter. Same markers hs-fill-apply-kit.cjs uses — keep them in step.
const STUB_RE = /Edit this stub|Boilerplate — not tailored/i;

async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 4) {
      await r.text();
      await new Promise((res) => setTimeout(res, Number(r.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1)));
      continue;
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${urlPath.split('?')[0]} → ${r.status}: ${text.slice(0, 120)}`);
    return JSON.parse(text);
  }
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function auditDeal(d) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId);
  let letter = false, cv = false, cvName = '';
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_attachment_ids`);
    const body = stripHtml(n.properties?.hs_note_body);
    const at0 = STUB_RE.test(body);
    const at = body.search(LETTER_RE);
    if (!at0 && at >= 0 && body.length - at >= MIN_LETTER_CHARS) letter = true;
    for (const fid of String(n.properties?.hs_attachment_ids || '').split(';').filter(Boolean)) {
      const f = await hs('GET', `/files/v3/files/${fid}`);
      if (/^CV_/i.test(f.name || '') && String(f.extension).toLowerCase() === 'pdf') { cv = true; cvName = `${f.name}.pdf`; }
    }
  }
  return { id: d.id, name: String(d.properties.dealname).replace(/^\[[^\]]*\]\s*/, ''), notes: ids.length, letter, cv, cvName };
}

async function telegram(text) {
  const token = envValue('TELEGRAM_BOT_TOKEN');
  const chat = envValue('TELEGRAM_LEADS_DIGEST_CHAT_ID') || envValue('TELEGRAM_AUTHORIZED_USERS').split(',')[0].trim();
  if (!token || !chat) { console.log('  (telegram not configured — alert printed only)'); return; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900) }),
  });
  console.log(`  telegram ${r.status}`);
}

(async () => {
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealstage', operator: 'EQ', value: STAGE },
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING-VJH*' },
    ] }],
    properties: ['dealname'],
    limit: 100,
  });
  const deals = search.results || [];
  const rows = [];
  for (const d of deals) {
    try { rows.push(await auditDeal(d)); }
    catch (e) { rows.push({ id: d.id, name: d.properties.dealname, error: e.message }); }
  }

  const gaps = rows.filter((r) => r.error || !r.letter || !r.cv);
  for (const r of rows) {
    const mark = r.error ? '✖ ERR ' : `${r.letter ? '✓' : '✖'}L ${r.cv ? '✓' : '✖'}CV`;
    console.log(`  ${mark}  ${String(r.name).slice(0, 60).padEnd(62)} ${r.error || r.cvName || ''}`);
  }
  console.log(`\n${deals.length} deals · complete ${rows.length - gaps.length} · gaps ${gaps.length}`);

  if (gaps.length) {
    process.exitCode = 1;
    if (TELEGRAM) {
      const lines = gaps.map((g) => `• ${String(g.name).slice(0, 70)} — ${g.error ? 'audit error' : [!g.letter && 'no letter', !g.cv && 'no CV'].filter(Boolean).join(' + ')}`);
      await telegram(`⚠️ Apply kit gap: ${gaps.length} of ${deals.length} ACT TODAY job deals are missing a cover letter or CV\n\n${lines.join('\n')}`);
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
