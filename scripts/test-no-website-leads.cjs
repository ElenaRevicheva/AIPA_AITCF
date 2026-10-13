#!/usr/bin/env node
/**
 * Atlas no-website leads (13 Oct 2026) — the pure half: which businesses are picked,
 * what the message claims, what the deal is called. Offline: sends nothing, writes nothing.
 *   node scripts/test-no-website-leads.cjs
 */
const n = require('./lib/no-website-leads.cjs');

let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
};

// Same shape as atlas-lead-machine.cjs fingerprint(): enough for the dedupe contract.
const fp = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|los|las|del|para|clinica|centro|hotel|dental|spa|inc|sa|srl)$/.test(w))
    .slice(0, 3)
    .join('-');

const base = { phone: '+507 6123-4567', rating: 4.8, city: 'Panama City', query: 'dental implants clinic', highTicket: true, primaryType: 'dental_clinic' };
const cands = [
  { ...base, company: 'Big Smile Clinic', reviews: 120 },
  { ...base, company: 'Tender Loving Dental Care. TLDC', reviews: 401 }, // already a pilot deal
  { ...base, company: 'Small Clinic', reviews: 4 }, // under 5 reviews
  { ...base, company: 'No Phone Clinic', reviews: 300, phone: null },
  { ...base, company: 'Gym Panama', reviews: 500, highTicket: false, query: 'gimnasio' },
  { ...base, company: 'Mid Clinic', reviews: 40, rating: 4.1 },
  { ...base, company: 'Big Smile Clinic', reviews: 120 }, // same business twice in one run
  { ...base, company: 'Insta Yacht', reviews: 60, presence: 'https://www.instagram.com/instayacht', primaryType: 'tour_agency', query: 'yacht charter' },
];
const known = new Set([fp('Tender Loving Dental Care')]);
const picked = n.pickNoWebsite(cands, known, fp, 2);

ok(picked.length === 2, 'at most 2 picked');
ok(picked[0].company === 'Big Smile Clinic', 'most reviews first (pilot clinic with 401 skipped)');
ok(picked[1].company === 'Insta Yacht', 'second by reviews: an Instagram-only business counts');
ok(!picked.some((c) => /Tender Loving/.test(c.company)), 'already in the CRM → never staged twice');
ok(!picked.some((c) => c.company === 'Small Clinic'), 'under 5 reviews → not "strong"');
ok(!picked.some((c) => c.company === 'No Phone Clinic'), 'no phone → nothing to message');
ok(!picked.some((c) => c.company === 'Gym Panama'), 'low-ticket tail query → never');
ok(n.pickNoWebsite(cands, known, fp, 0).length === 0, 'max 0 (switched off) → none');
ok(n.pickNoWebsite([], known, fp, 2).length === 0, 'nothing seen → none');
ok(n.pickNoWebsite(cands, new Set(), fp, 5).filter((c) => c.company === 'Big Smile Clinic').length === 1, 'duplicates within a run → once');

// ── the message makes only the claim Places proves ──
const m1 = n.buildNoWebsiteWa(picked[0]);
ok(/su perfil de Google no tiene sitio web/.test(m1), 'no-website message: the verified claim');
ok(/su clínica/.test(m1), 'a dental clinic is called "su clínica"');
ok(/¿Le puedo enviar un resumen gratuito/.test(m1), 'permission-first: asks before sending');
ok(/aideazz\.xyz\/portfolio/.test(m1) && /PD:/.test(m1), 'portfolio link + PD (outreach rules)');
ok(!/\/100|ranking|garantiz|invisible|no le recomienda|no lo recomienda/i.test(m1), 'no scores, rankings, guarantees or "invisible"');
ok(!/no encontré una página propia/.test(m1), 'never claims "no site exists" — Atlas did not web-search');
const m2 = n.buildNoWebsiteWa(picked[1]);
ok(/enlaza a su Instagram en lugar de un sitio web propio/.test(m2), 'Instagram-only message names Instagram');
ok(/su negocio/.test(m2), 'a yacht business is "su negocio"');
ok(/muy buena reputación/.test(m1), '4.8★ → "muy buena reputación"');
ok(!/muy buena reputación/.test(n.buildNoWebsiteWa({ ...base, company: 'X', reviews: 40, rating: 4.1 })), '4.1★ → no "muy buena"');
ok(!/reseñas/.test(n.buildNoWebsiteWa({ ...base, company: 'X', reviews: 6 })), 'under 10 reviews → no rating sentence');

// ── deal name, note, Telegram ──
const dn = n.noWebsiteDealName(picked[0]);
ok(dn.startsWith('[CLIENT-ATLAS] Big Smile Clinic — '), 'deal name: CLIENT-ATLAS prefix (dedupe + outcomes read it)');
ok(!/\bwhatsapp\b/i.test(dn), 'no "WhatsApp" in the deal name (outcomes job would file it under the WhatsApp lane)');
ok(/·\s*no_website$/.test(dn), 'angle suffix " · no_website" (per-angle reply rate)');
const note = n.buildNoWebsiteNote(picked[0], { isMobile: true, date: '2026-10-19' });
ok(/web\.whatsapp\.com\/send\?phone=50761234567/.test(note), 'note carries the laptop WhatsApp button');
ok(/search the name once/.test(note), 'note tells Elena to check for a site Google does not link');
ok(/GATES/.test(note) && /IDENTITY MATRIX/.test(note), 'note carries the matrix + gates');
const landline = n.buildNoWebsiteNote({ ...picked[0], phone: '+507 236-6746' }, { isMobile: false, date: '2026-10-19' });
ok(/número FIJO/.test(landline), 'landline → labelled button');
const tg = n.noWebsiteTelegramLine(picked);
ok(tg === '🧭 2 strong no-website businesses found: Big Smile Clinic (4.8★, 120 reviews), Insta Yacht (4.8★, 60 reviews)', 'Telegram line');
ok(n.noWebsiteTelegramLine([picked[0]]).includes('strong no-website clinics found'), 'all clinics → "clinics"');
ok(n.noWebsiteTelegramLine([]) === null, 'none staged → no line');
ok(n.socialPlatform('https://www.facebook.com/x') === 'Facebook' && n.socialPlatform('https://clinic.com') === null, 'socialPlatform');

console.log(`\nno-website leads: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
