#!/usr/bin/env node
/**
 * How many deals actually have the FULL click-to-send cycle?
 *
 * A deal is "complete" only when all of these hold:
 *   - a registry entry for the first-contact slug, carrying dealId
 *   - its email draft file exists on disk
 *   - a registry entry for the -fu slug, also carrying dealId
 *   - its follow-up draft file exists
 *   - the deal's notes contain a working EMAIL button and (if a phone exists) a
 *     WhatsApp button, for both first contact and follow-up
 *
 * dealId is checked explicitly because go-wa.ts gates the whole post-send chain on it
 * — `if (!key || !p.dealId) return;`. Without it a send moves no stage, writes no
 * ENTREGADO/SEGUIMIENTO/ABIERTO stamp and creates no follow-up task, even though the
 * email goes out and the button looks fine.
 *
 * Read-only. Prints a per-prefix scoreboard plus the exact failing deals.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^HUBSPOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
const PREFIXES = (process.env.PREFIXES || 'CLIENT-MANUAL,CLIENT-ATLAS').split(',').map((s) => s.trim());
const SHOW = Number(process.env.SHOW || 12);

async function hs(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 110)}`);
  return t ? JSON.parse(t) : null;
}

async function dealsFor(prefix) {
  const out = [];
  let after;
  do {
    const d = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
      properties: ['dealname', 'dealstage'],
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const x of d.results || []) {
      if ((x.properties?.dealname || '').includes(`[${prefix}]`)) {
        out.push({ id: x.id, name: x.properties.dealname, stage: x.properties.dealstage, prefix });
      }
    }
    after = d.paging?.next?.after;
  } while (after);
  return out;
}

const slugOk = (s) => {
  const e = reg[s];
  return !!(e && e.emailDraft && e.dealId && fs.existsSync(path.join(ROOT, e.emailDraft)));
};

(async () => {
  const all = [];
  for (const p of PREFIXES) all.push(...(await dealsFor(p)));
  console.log(`checking ${all.length} deals across ${PREFIXES.join(' + ')}\n`);

  const stats = {};
  const broken = [];
  let n = 0;
  for (const d of all) {
    n++;
    if (n % 25 === 0) process.stderr.write(`  …${n}/${all.length}\n`);
    stats[d.prefix] = stats[d.prefix] || { total: 0, complete: 0, emailOnly: 0, waOnly: 0, none: 0, noDealId: 0 };
    const S = stats[d.prefix];
    S.total++;

    const na = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes`);
    const nids = (na.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
    let body = '';
    for (const nid of nids) {
      const nn = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body`);
      body += nn.properties?.hs_note_body || '';
    }
    const slugs = [...new Set([...body.matchAll(/\/go\/outreach-email\/([a-z0-9-]+)/gi)].map((m) => m[1]))];
    const waCount = (body.match(/web\.whatsapp\.com\/send|wa\.me\//g) || []).length;

    const okFirst = slugs.some((s) => !/-fu$/.test(s) && slugOk(s));
    const okFu = slugs.some((s) => /-fu$/.test(s) && slugOk(s));
    // a registry entry exists but without dealId → send works, automation does not
    const missingDealId = slugs.some((s) => reg[s] && reg[s].emailDraft && !reg[s].dealId);
    if (missingDealId) S.noDealId++;

    const emailComplete = okFirst && okFu;
    const waComplete = waCount >= 2;
    if (emailComplete && waComplete) S.complete++;
    else if (emailComplete) S.emailOnly++;
    else if (waComplete) S.waOnly++;
    else S.none++;

    if (!(emailComplete && waComplete)) {
      broken.push({
        prefix: d.prefix,
        name: d.name.replace(/^\[[A-Z-]+\]\s*/, '').slice(0, 44),
        why: !slugs.length ? 'no email button at all' : !okFirst ? 'first-contact slug broken' : !okFu ? 'no working FU slug' : `only ${waCount} WA link`,
      });
    }
  }

  console.log('=== FULL-CYCLE COVERAGE ===');
  for (const [p, S] of Object.entries(stats)) {
    const pct = S.total ? Math.round((S.complete / S.total) * 100) : 0;
    console.log(
      `\n[${p}] ${S.total} deals — COMPLETE ${S.complete} (${pct}%)\n` +
        `   email pair only (no 2nd WA): ${S.emailOnly}\n` +
        `   WhatsApp only (email broken): ${S.waOnly}\n` +
        `   neither                     : ${S.none}\n` +
        `   registry entry без dealId   : ${S.noDealId}  ← send works, stamps/tasks do NOT`,
    );
  }

  const byWhy = {};
  for (const b of broken) byWhy[b.why] = (byWhy[b.why] || 0) + 1;
  console.log('\n=== why they fail ===');
  for (const [w, c] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}  ${w}`);
  console.log(`\n=== first ${SHOW} incomplete ===`);
  for (const b of broken.slice(0, SHOW)) console.log(`  ✗ [${b.prefix}] ${b.name.padEnd(46)} ${b.why}`);
  fs.writeFileSync(path.join(ROOT, 'docs/selling/_full_cycle_gaps.json'), JSON.stringify(broken, null, 2));
  console.log(`\nfull list → docs/selling/_full_cycle_gaps.json (${broken.length} deals)`);
})();
