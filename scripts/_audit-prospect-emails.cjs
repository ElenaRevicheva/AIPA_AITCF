#!/usr/bin/env node
/**
 * Audit every staged prospect address for the "glued label" defect that made
 * Dental Connect unreachable: the scraper produced emailcontactus@dentalconnect.com.mx
 * instead of contactus@… and Resend suppressed the sends while HubSpot still said
 * 📧 EMAILED (July 26 2026).
 *
 * For each suspicious address it fetches the prospect's site and reports which
 * variant the site actually shows. REPORT ONLY — never writes to HubSpot or the
 * registry; Elena decides and edits the contact (or says the word and we patch).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const GLUE = /^(e-?mail|correo(?:electronico)?|mail|escr[ií]benos|cont[aá]ctenos|write(?:to)?us|sendus)([a-z][a-z0-9._%+-]{2,})@(.+)$/i;

async function fetchSite(domain) {
  for (const url of [`https://${domain}`, `https://www.${domain}`]) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIdeazz-audit/1.0)' },
      });
      if (r.ok) return await r.text();
    } catch {
      /* try next */
    }
  }
  return null;
}

(async () => {
  const reg = loadRegistry();
  const rows = Object.entries(reg).filter(([, c]) => c.email);
  const suspicious = [];
  const seen = new Set();

  for (const [slug, cfg] of rows) {
    const email = String(cfg.email).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const m = email.match(GLUE);
    if (!m) continue;
    const candidate = `${m[2]}@${m[3]}`;
    const domain = email.split('@')[1];
    process.stderr.write(`\r checking ${slug.padEnd(34).slice(0, 34)}`);
    const html = await fetchSite(domain);
    const bound = (a) =>
      new RegExp(`(?<![A-Za-z0-9._%+-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    suspicious.push({
      slug,
      dealId: cfg.dealId,
      staged: email,
      likelyCorrect: candidate,
      siteShowsStaged: html ? bound(email).test(html) : null,
      siteShowsCandidate: html ? bound(candidate).test(html) : null,
      siteReachable: !!html,
    });
  }
  process.stderr.write('\n');

  const out = { rowsWithEmail: rows.length, suspicious };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(root, 'docs/selling/_audit-prospect-emails.json'),
    JSON.stringify({ ...out, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
