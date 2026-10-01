// /api merged film: a REAL audit of atuona.xyz on the live aideazz.xyz/api, then a guided read of the 34 checks - the browser
// glides to each group and holds, so the film can show what each group checks and the exact fix for what fails. 1920x1080.
import { chromium } from 'playwright-core';
import fs from 'fs';
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US',
  recordVideo: { dir: 'out_groups', size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage(); const t0 = Date.now(); const marks = [];
const mark = (what, extra = {}) => marks.push({ t: +((Date.now() - t0) / 1000).toFixed(2), what, ...extra });
await page.goto('https://aideazz.xyz/api', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const input = page.getByPlaceholder('yourwebsite.com');
await input.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
await input.click(); await page.keyboard.type('atuona.xyz', { delay: 140 });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Audit my site' }).click();
await page.waitForFunction(() => /\b\d{2,3}\s*\/\s*100\b|Grade|A\+/.test(document.body.innerText) && /checks/i.test(document.body.innerText), null, { timeout: 90000 });
mark('result'); await page.waitForTimeout(1500);
// glide to an element (eased, ~1.4 s) so it sits ~42% down the screen, then hold
async function glideTo(text, what, hold = 3800) {
  const loc = page.getByText(text, { exact: false }).first();
  await loc.waitFor({ timeout: 15000 });
  const y = await loc.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const target = Math.max(0, y - 1080 * 0.42); const start = await page.evaluate(() => window.scrollY);
  const steps = 42;
  for (let i = 1; i <= steps; i++) { const k = i / steps; const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.evaluate(v => window.scrollTo(0, v), start + (target - start) * e); await page.waitForTimeout(33); }
  mark(what, { text, status: await loc.evaluate(el => (el.closest('div')?.innerText || '').slice(0, 160)) });
  await page.waitForTimeout(hold);
}
await glideTo('Can AI engines read this site', 'engines');
await glideTo('Category breakdown', 'categories');
await glideTo('Top fixes, in priority order', 'topfixes', 4500);
await glideTo('ChatGPT (OpenAI) can crawl', 'g1_crawlers');
await glideTo('Answer-rich schema', 'g2_structured_fail', 4500);
await glideTo('Identity schema', 'g2_structured_pass');
await glideTo('Question-style headings', 'g3_aeo_fail', 4500);
await glideTo('Lists or tables', 'g3_aeo_lists', 4500);
await glideTo('Served over HTTPS', 'g4_tech');
await glideTo('Content present in raw HTML', 'g4_tech_js');
mark('end'); await page.waitForTimeout(800);
const vpath = await page.video().path(); await ctx.close(); await browser.close();
fs.writeFileSync('out_groups/marks.json', JSON.stringify({ video: vpath, marks }, null, 1));
console.log(JSON.stringify({ video: vpath, marks }, null, 1));
