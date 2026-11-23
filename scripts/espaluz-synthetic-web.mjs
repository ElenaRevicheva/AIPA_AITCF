// Synthetic web families: each one opens the real landing in its own language, clicks ITS path's web button signed out,
// then signs in with a one-tap link and clicks the same button again. Records where it truly lands.
import { chromium } from 'playwright';
import fs from 'fs';
const dir = process.env.SYN_DIR || '.'; // holds syn-web-links.json (one-tap links from kids-memory classroom_link); never commit it
const links = JSON.parse(fs.readFileSync(`${dir}/syn-web-links.json`, 'utf8'));
const P = [
  { key: 'expat', locale: 'en-US', href: '/path/expat' },
  { key: 'nomads', locale: 'en-GB', href: '/path/nomads' },
  { key: 'settle', locale: 'es-PA', href: '/path/settle' },
  { key: 'pro', locale: 'es-CO', href: '/pro-english' },
  { key: 'russian', locale: 'ru-RU', href: '/path/russian' },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = [];
const head = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260);
async function clickDoor(page, href) {
  await page.goto('https://app.espaluz.lat/', { waitUntil: 'networkidle' });
  const a = page.locator(`a[href="${href}"]`).first();
  // a human opens the path's card: click the summary of every closed <details> around the button, outermost first
  const n = await a.evaluate((el) => { let k = 0; for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) { if (!d.open) d.setAttribute('data-syn', String(k++)); } return k; });
  for (let k = n - 1; k >= 0; k--) await page.locator(`details[data-syn="${k}"] > summary`).click();
  await a.scrollIntoViewIfNeeded();
  const label = (await a.innerText()).trim();
  await a.click();
  await page.waitForTimeout(6000);
  return label;
}
for (const p of P) {
  const ctx = await browser.newContext({ locale: p.locale, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const r = { key: p.key, locale: p.locale };
  r.out_label = await clickDoor(page, p.href);
  r.out_url = new URL(page.url()).pathname + (new URL(page.url()).searchParams.get('next') ? ` (next=${new URL(page.url()).searchParams.get('next')})` : '');
  r.out_page = await head(page);
  await page.screenshot({ path: `${dir}/web-${p.key}-1-signed-out.png` });
  await page.goto(links[p.key].url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  r.in_label = await clickDoor(page, p.href);
  r.in_url = new URL(page.url()).pathname;
  const toast = page.locator('[data-sonner-toast]');
  r.in_toast = (await toast.count()) ? (await toast.first().innerText()).replace(/\s+/g, ' ') : '(no toast)';
  r.in_page = await head(page);
  await page.screenshot({ path: `${dir}/web-${p.key}-2-signed-in.png` });
  out.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${dir}/syn-web-result.json`, JSON.stringify(out, null, 1));
