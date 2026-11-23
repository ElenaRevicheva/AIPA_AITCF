// EspaLuz WEB persona readers (23 Nov 2026; Elena after Andy Caballero's "human-like readers" advice): one strict persona per
// landing path walks the WEB door the way a person does, and every page they see is written down for the persona critic
// (EspaLuzWhatsApp/scripts/synthetic_web_judge.py, run on Oracle with the same critic as the chat families).
//
// Per persona: open the landing in their browser language -> open THEIR path card and read it -> tap its web button as a
// stranger (signed out) and read where it lands -> sign in with a one-tap link (synthetic account) -> tap the same button
// again and read where a member lands -> on the coach pages (Pro English / Pro Spanish) type their real first question and
// read the coach's answer.
//
// Usage: SYN_DIR=<dir holding syn-web-links.json> node scripts/espaluz-synthetic-web.mjs   -> writes <dir>/syn-web-run.json
// The links file comes from EspaLuzWhatsApp/scripts/synthetic_web_links.py (one-tap links; delete it after the run).
import { chromium } from 'playwright';
import fs from 'fs';

const dir = process.env.SYN_DIR || '.';
const base = process.env.BASE || 'https://app.espaluz.lat';
const links = JSON.parse(fs.readFileSync(`${dir}/syn-web-links.json`, 'utf8'));
const P = [
  { key: 'expat', locale: 'en-US', href: '/path/expat' },
  { key: 'nomads', locale: 'de-DE', href: '/path/nomads' },
  { key: 'settle', locale: 'es-VE', href: '/path/settle' },
  { key: 'pro', locale: 'es-CO', href: '/pro-english', ask: 'Hola, tengo entrevistas en inglés para trabajos remotos en unas semanas. ¿Cómo empezamos?' },
  { key: 'russian', locale: 'ru-RU', href: '/path/russian' },
  { key: 'prosp', locale: 'en-US', href: '/pro-spanish', ask: "Hi, I'm a nurse at a clinic in Houston. Lots of my patients only speak Spanish and I need to do intake with them. Where do we start?" },
];
const text = async (page, n = 1400) => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, n);
const where = (page) => { const u = new URL(page.url()); return u.pathname + (u.searchParams.get('next') ? ` (next=${u.searchParams.get('next')})` : ''); };

async function openCard(page, href) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const a = page.locator(`a[href="${href}"]`).first();
  const n = await a.evaluate((el) => { let i = 0; for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) { if (!d.open) d.setAttribute('data-syn', String(i++)); } return i; });
  for (let i = n - 1; i >= 0; i--) await page.locator(`details[data-syn="${i}"] > summary`).click();
  const card = await a.evaluate((el) => (el.closest('details')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200));
  const button = (await a.innerText()).trim();
  return { a, card, button };
}

async function coachTurn(page, ask) {
  const box = page.locator('input[placeholder^="Write in"]').first();
  if (!(await box.count())) return { said: ask, reply: '(no text box on the page)' };
  const before = await text(page, 20000);
  await box.fill(ask);
  await box.press('Enter');
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); const now = await text(page, 20000); if (now.length > before.length + 80) break; }
  await page.waitForTimeout(4000);
  const after = await text(page, 20000);
  return { said: ask, reply: after.slice(Math.max(0, after.indexOf(ask.slice(0, 30))), Math.max(0, after.indexOf(ask.slice(0, 30))) + 1500) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = [];
for (const p of P) {
  const ctx = await browser.newContext({ locale: p.locale, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const r = { path: p.key, locale: p.locale, steps: [] };
  try {
    const { a, card, button } = await openCard(page, p.href);
    r.steps.push({ step: 'landing card', what_they_see: card, button });
    await a.click(); await page.waitForTimeout(5000);
    r.out_landed = where(page);
    r.steps.push({ step: 'tapped the web button, signed out', landed_on: r.out_landed, what_they_see: await text(page) });
    if (p.ask && !/\/auth/.test(r.out_landed)) { /* coach pages are open to guests too: nothing to type before signing in */ }
    await page.goto(links[p.key].url, { waitUntil: 'networkidle' }); await page.waitForTimeout(5000);
    const again = await openCard(page, p.href);
    await again.a.click(); await page.waitForTimeout(7000);
    r.in_landed = where(page);
    const toast = page.locator('[data-sonner-toast]');
    r.steps.push({ step: 'signed in, tapped the same button', landed_on: r.in_landed,
      toast: (await toast.count()) ? (await toast.first().innerText()).replace(/\s+/g, ' ') : '', what_they_see: await text(page) });
    if (p.ask) r.steps.push({ step: 'typed a first question to the coach', ...(await coachTurn(page, p.ask)) });
  } catch (e) { r.error = String(e).slice(0, 300); }
  out.push(r);
  console.log(`${p.key}: out=${r.out_landed} in=${r.in_landed}${r.error ? ' ERROR ' + r.error : ''}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${dir}/syn-web-run.json`, JSON.stringify(out, null, 1));
