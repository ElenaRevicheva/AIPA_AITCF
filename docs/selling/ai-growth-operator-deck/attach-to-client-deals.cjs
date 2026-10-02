// PAUSED 1 Oct 2026 by Elena ("stop for a while… put it on the calendar"); dry run verified 571 deals, 0 written.
// Resume ON ORACLE: scp the 2 PDFs + this file into ~/cto-aipa/docs/selling/ai-growth-operator-deck/, then
//   cd ~/cto-aipa && node docs/selling/ai-growth-operator-deck/attach-to-client-deals.cjs          (dry run)
//   cd ~/cto-aipa && node docs/selling/ai-growth-operator-deck/attach-to-client-deals.cjs --apply
// ONE-OFF (1 Oct 2026, Elena: "attach the AI Growth Operator deck to CLIENT deals in HubSpot").
// Every OPEN [CLIENT…] deal gets ONE note with the EN + ES deck attached. Reuses scripts/hs-files.cjs.
// Idempotent: a deal whose notes already carry MARK is skipped. Dry run unless --apply.
'use strict';
const R = '/home/ubuntu/cto-aipa';
const { hubspotKey, hubspotBase } = require(R + '/scripts/hs-env.cjs');
const { filesScopeOk, uploadOutreachFile } = require(R + '/scripts/hs-files.cjs');
const APPLY = process.argv.includes('--apply');
const MARK = '📎 AI GROWTH OPERATOR DECK';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function hs(m, p, b) {
  for (let i = 0; ; i++) {
    const r = await fetch(hubspotBase() + p, { method: m, headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    if (r.status === 429 && i < 5) { await sleep(2000 * (i + 1)); continue; }
    const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p.split('?')[0]} ${r.status} ${t.slice(0, 160)}`);
    return t ? JSON.parse(t) : {};
  }
}
(async () => {
  const deals = []; let after;
  do {
    const r = await hs('POST', '/crm/v3/objects/deals/search', { filterGroups: [{ filters: [
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*CLIENT*' },
      { propertyName: 'dealstage', operator: 'NOT_IN', values: ['closedwon', 'closedlost'] }] }],
      properties: ['dealname', 'dealstage'], limit: 200, after });
    for (const d of r.results || []) if (/^\s*\[CLIENT/i.test(d.properties.dealname)) deals.push(d);
    after = r.paging && r.paging.next && r.paging.next.after; await sleep(250);
  } while (after);
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${deals.length} open CLIENT deals`);
  let ids = null;
  if (APPLY) {
    const sc = await filesScopeOk(); if (!sc.ok) throw new Error(sc.reason);
    const en = await uploadOutreachFile('' + R + '/docs/selling/ai-growth-operator-deck/AIdeazz_AI_Growth_Operator_2026.pdf', 'AIdeazz_AI_Growth_Operator_2026.pdf');
    const es = await uploadOutreachFile('' + R + '/docs/selling/ai-growth-operator-deck/AIdeazz_AI_Growth_Operator_2026_ES.pdf', 'AIdeazz_AI_Growth_Operator_2026_ES.pdf');
    ids = [en.id, es.id]; console.log(`files EN ${en.id}${en.reused ? ' (reused)' : ''} · ES ${es.id}${es.reused ? ' (reused)' : ''}`);
  }
  const body = `<strong>${MARK}</strong><p>Two PDFs attached: <b>AIdeazz_AI_Growth_Operator_2026.pdf</b> (English) and <b>AIdeazz_AI_Growth_Operator_2026_ES.pdf</b> (Español). 8 pages — what the operator does, who it is for, proof from our own system, and how we start.</p><p><em>Send whichever fits the prospect's language: attach it in HubSpot Email, or share it on WhatsApp. Public copy: aideazz.xyz/api → footer → AI Growth Operator.</em></p>`;
  let added = 0, had = 0, failed = 0;
  for (const d of deals) {
    try {
      const a = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes?limit=100`);
      const nids = (a.results || []).map((x) => ({ id: String(x.toObjectId) }));
      let has = false;
      for (let i = 0; i < nids.length && !has; i += 100) {
        const b = await hs('POST', '/crm/v3/objects/notes/batch/read', { properties: ['hs_note_body'], inputs: nids.slice(i, i + 100) });
        has = (b.results || []).some((n) => String(n.properties.hs_note_body || '').includes(MARK));
      }
      if (has) { had++; continue; }
      if (APPLY) {
        await hs('POST', '/crm/v3/objects/notes', {
          properties: { hs_note_body: body, hs_timestamp: new Date().toISOString(), hs_attachment_ids: ids.join(';') },
          associations: [{ to: { id: d.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
        });
      }
      added++;
      await sleep(120);
    } catch (e) { failed++; console.log(`  ✖ ${d.id} ${d.properties.dealname.slice(0, 50)} — ${String(e.message).slice(0, 120)}`); }
  }
  console.log(`${APPLY ? 'added' : 'would add'} ${added} · already had ${had} · failed ${failed}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
