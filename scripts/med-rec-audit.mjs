// Medical-tourism film (ICP #5) - copy of reloc-rec-audit.mjs. Relocation film S3/E1: a FRESH real audit on the live aideazz.xyz/api (every film uses different shots; the yacht, villa and /api
// films used atuona.xyz). Target = an AIdeazz-owned page that really scores 57/C with 5 top fixes (engine run 2 Oct 2026), so the
// film shows a real score and real fixes. The domain is cropped in the edit. 1920x1080, runs on Oracle in ~/aigo-med.
import { chromium } from 'playwright-core';
import fs from 'fs';
const TARGET = process.env.TARGET || 'webhook.aideazz.xyz/whitespace/';
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
fs.mkdirSync('rec/raw', { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US',
  recordVideo: { dir: 'rec/raw', size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage(); const t0 = Date.now(); const marks = [];
const mark = (what, extra = {}) => marks.push({ t: +((Date.now() - t0) / 1000).toFixed(2), what, ...extra });
await page.goto('https://aideazz.xyz/api', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const input = page.getByPlaceholder('yourwebsite.com');
await input.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
mark('typing');
await input.click(); await page.keyboard.type(TARGET, { delay: 110 });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Audit my site' }).click(); mark('submitted');
await page.waitForFunction(() => /\b\d{2,3}\s*\/\s*100\b|Grade/.test(document.body.innerText) && /checks/i.test(document.body.innerText), null, { timeout: 90000 });
mark('result'); await page.waitForTimeout(2500);
async function glideTo(text, what, hold = 3800) {
  const loc = page.getByText(text, { exact: false }).first();
  await loc.waitFor({ timeout: 15000 });
  const y = await loc.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const target = Math.max(0, y - 1080 * 0.30); const start = await page.evaluate(() => window.scrollY);
  const steps = 42;
  for (let i = 1; i <= steps; i++) { const k = i / steps; const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.evaluate(v => window.scrollTo(0, v), start + (target - start) * e); await page.waitForTimeout(33); }
  mark(what, { text }); await page.waitForTimeout(hold);
}
await glideTo('Category breakdown', 'categories', 3500);
await glideTo('Top fixes, in priority order', 'topfixes', 5000);
await page.screenshot({ path: 'rec/S3_topfixes.png' });
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(400);
await glideTo('Category breakdown', 'score_still', 600);
await page.evaluate(() => window.scrollTo(0, Math.max(0, window.scrollY - 520))); await page.waitForTimeout(800);
await page.screenshot({ path: 'rec/E1_score.png' }); mark('score_png');
const body = await page.evaluate(() => document.body.innerText);
fs.writeFileSync('rec/S3_page_text.txt', body);
await ctx.close(); await browser.close();
const vid = fs.readdirSync('rec/raw').filter(f => f.endsWith('.webm')).map(f => `rec/raw/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
fs.renameSync(vid, 'rec/S3_audit.webm');
fs.writeFileSync('rec/S3_marks.json', JSON.stringify({ target: TARGET, marks }, null, 1));
console.log(JSON.stringify(marks));
