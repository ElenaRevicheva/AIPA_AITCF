#!/usr/bin/env node
/**
 * Quick AI Growth Operator Diagnostic — what a paying client and Elena receive.
 * Pure functions only: sends nothing, writes nothing. Run after `npx tsc`:
 *   node scripts/test-diagnostic-delivery.cjs            (offline)
 *   node scripts/test-diagnostic-delivery.cjs --scan     (also scans a real site and prints the prep note)
 */
const path = require('path');
const { pathToFileURL } = require('url');
const dist = f => pathToFileURL(path.join(__dirname, '..', 'dist', f)).href;

let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
};

(async () => {
  const d = await import(dist('diagnostic-delivery.js'));
  const hs = await import(dist('hubspot-client.js'));

  // ── language comes from the pay page's lng= ──
  ok(d.orderLang('https://aideazz.xyz/pay/analisis-tecnico?sku=diagnostic_call&lng=en') === 'en', 'lng=en → en');
  ok(d.orderLang('https://aideazz.xyz/pay/analisis-tecnico?sku=diagnostic_call&lng=es') === 'es', 'lng=es → es');
  ok(d.orderLang(null) === 'es', 'no page_url → es (LATAM-first default)');
  ok(d.orderLang('not a url') === 'es', 'garbage page_url → es');

  // ── intake written by the pay page ──
  const notes = [
    'Website: clinicadental.com',
    'Customers reach us via: WhatsApp, Website form',
    'Typical sale value: $2,000–10,000',
    'Notes: we do implants for US patients',
  ].join('\n');
  const intake = d.parseIntake(notes);
  ok(intake.website === 'https://clinicadental.com', 'website gets https://');
  ok(intake.channels === 'WhatsApp, Website form', 'channels parsed');
  ok(intake.saleValue === '$2,000–10,000', 'sale value parsed');
  ok(intake.freeText === 'we do implants for US patients', 'free text parsed');

  // a client who skipped the fields but pasted a URL in the notes box
  const loose = d.parseIntake('see https://example.org/about please');
  ok(loose.website === 'https://example.org/about', 'first URL taken from free notes');
  ok(loose.channels === null && loose.saleValue === null, 'no structured answers → null');
  ok(d.parseIntake(null).website === null, 'no notes → no website');

  // ── fit criteria are ticked ONLY from what they said ──
  const fit = d.fitCriteria(intake);
  ok(fit.length === 6, 'six criteria from the deck');
  ok(fit[0].mark === '✅', '$2,000–10,000 → sale criterion met');
  ok(fit[1].mark === '✅' && fit[2].mark === '✅', 'WhatsApp + form → online + WhatsApp criteria met');
  ok(fit.slice(3).every(c => c.mark === '❓'), 'audience / margins / AI team are always asked, never assumed');
  ok(d.fitCriteria(d.parseIntake('Typical sale value: $500–2,000'))[0].mark === '❌', '$500–2,000 → not met');
  ok(d.fitCriteria(d.parseIntake('Typical sale value: Over $10,000'))[0].mark === '✅', 'Over $10,000 → met');
  ok(d.fitCriteria(d.parseIntake(''))[0].mark === '❓', 'unanswered → ask');
  ok(d.MODULES.length === 6, 'six modules from the deck');

  // ── client email ──
  const order = {
    id: 'ABC123',
    sku: 'diagnostic_call',
    amount_usd: 100,
    client_name: 'Ana Pérez',
    client_email: 'ana@example.com',
    company_name: 'Clínica Dental',
    notes,
    page_url: 'https://aideazz.xyz/pay/analisis-tecnico?sku=diagnostic_call&lng=en',
  };
  // Elena's flow: results in writing FIRST, together with a one-off Calendly link; then the call.
  const en = d.buildClientEmail(order, intake);
  ok(en.lang === 'en' && en.subject.startsWith('Payment received — Quick AI Growth Operator Diagnostic'), 'EN subject');
  ok(/results in writing by email, together with a link to book a 45-minute video call/.test(en.text), 'EN: results first, then a link to book 45 min');
  ok(!/calendly\.com/i.test(en.text), 'EN: no fixed booking link (Elena sends a one-off link)');
  ok(en.text.includes('$100 is credited'), 'credit promise present');
  ok(en.text.includes('https://clinicadental.com'), 'their website is named');
  const es = d.buildClientEmail({ ...order, page_url: order.page_url.replace('lng=en', 'lng=es') }, intake);
  ok(es.lang === 'es' && es.subject.startsWith('Pago recibido — Diagnóstico rápido AI Growth Operator'), 'ES subject');
  ok(/resultados por escrito por correo, junto con un enlace para reservar una videollamada de 45 minutos/.test(es.text) && es.text.includes('se abonan'), 'ES: results first + link + credit');

  // ── prep note (no scan) ──
  const note = d.buildPrepNote(order, intake, 'en', { result: null, error: 'no website given' }, true);
  ok(note.includes('PAID — Quick AI Growth Operator Diagnostic'), 'note headline');
  ok(note.includes('YOUR MOVE') && note.includes('one-off meeting, Duration 45 min'), 'note tells Elena her move (one-off meeting, 45 min)');
  ok(note.includes('No scan: no website given'), 'no scan is stated, not hidden');
  ok(note.includes('DRAFT RESULTS EMAIL (EN)'), 'results draft attached');
  ok(note.includes('[Elena: paste your one-off Calendly link]'), 'draft has the slot for her one-off link');
  ok(d.buildPrepNote(order, intake, 'es', { result: null, error: 'x' }, true).includes('[Elena: pegar su enlace único de Calendly]'), 'ES draft has the slot too');
  ok(!note.includes('<script'), 'no raw HTML from input');
  const xss = d.buildPrepNote({ ...order, notes: 'Notes: <img src=x onerror=alert(1)>' }, d.parseIntake('Website: a.com\nNotes: <img src=x>'), 'en', { result: null, error: 'x' }, true);
  ok(!xss.includes('<img'), 'client text is escaped in the note');

  // ── the bug this fixes: paid orders went through the PROSPECT gate and were dropped ──
  // The gate is left exactly as it is; paid orders now bypass it (paid-order-hubspot.ts).
  const paid = {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    company: 'Clínica Dental',
    source: 'aideazz_service_checkout',
    painPoint: '[PAID] Preliminary technical web audit — client paid $200, seeking delivery of contracted analysis',
    sourcePrefix: 'CLIENT-SERVICE-PAID',
  };
  ok(hs.isQualifiedClient(paid).ok === false, 'the prospect gate still rejects a paid order — which is why paid orders must not go through it');
  ok(hs.HS_STAGES.contacted === 'qualifiedtobuy', 'contacted = qualifiedtobuy = 🔥 I act TODAY');
  const po = await import(dist('paid-order-hubspot.js'));
  ok(
    po.paidDealName({ service: 'Quick AI Growth Operator Diagnostic', amountUsd: 100, name: 'Ana', company: 'Clínica Dental' }) ===
      '[CLIENT-SERVICE-PAID] Clínica Dental — Quick AI Growth Operator Diagnostic ($100)',
    'deal named after the service, not "— outreach"',
  );
  ok(po.paidDealName({ service: 'X', amountUsd: 200, name: 'Ana', company: null }).startsWith('[CLIENT-SERVICE-PAID] Ana — X'), 'no company → client name');
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'service-checkout.ts'), 'utf8') +
    require('fs').readFileSync(path.join(__dirname, '..', 'src', 'diagnostic-delivery.ts'), 'utf8');
  ok(!/pushLeadToHubSpot\s*\(/.test(src), 'no paid-order path calls pushLeadToHubSpot()');

  if (process.argv.includes('--scan')) {
    const { runVisibilityAudit } = await import(dist('visibility-audit.js'));
    const target = process.argv[process.argv.indexOf('--scan') + 1] || 'https://aideazz.xyz';
    const result = await runVisibilityAudit(target.startsWith('--') ? 'https://aideazz.xyz' : target);
    ok(typeof result.score === 'number', 'real scan returns a score');
    const withScan = d.buildPrepNote(order, intake, 'en', { result, error: null }, true);
    ok(withScan.includes(`Score ${result.score}/100`), 'scan score lands in the note');
    console.log('\n--- prep note (HTML→text) ---\n' + withScan.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));
    console.log('\n--- EN client email ---\n' + en.text);
  }

  console.log(`\ndiagnostic delivery: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
