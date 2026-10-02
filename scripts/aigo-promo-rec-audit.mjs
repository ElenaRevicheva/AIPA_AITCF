// Real screen capture for the promo (S3): the live aideazz.xyz/api audit, typed and run like a visitor would, 1920x1080.
// Logs the on-screen boxes of the typed domain so the edit can blur it precisely.
import { chromium } from 'playwright-core';
import fs from 'fs';
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US',
  recordVideo: { dir: 'out', size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage(); const t0 = Date.now(); const marks = [];
const mark = (what, extra = {}) => marks.push({ t: +((Date.now() - t0) / 1000).toFixed(2), what, ...extra });
await page.goto('https://aideazz.xyz/api', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const input = page.getByPlaceholder('yourwebsite.com');
await input.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
mark('input', { box: await input.boundingBox() });
await input.click(); await page.keyboard.type('atuona.xyz', { delay: 140 });
await page.waitForTimeout(500);
mark('click');
await page.getByRole('button', { name: 'Audit my site' }).click();
await page.waitForFunction(() => /\b\d{2,3}\s*\/\s*100\b|Grade|A\+/.test(document.body.innerText) && /checks/i.test(document.body.innerText), null, { timeout: 90000 });
mark('result');
await page.waitForTimeout(1500);
for (let i = 0; i < 240; i++) { await page.mouse.wheel(0, 9); await page.waitForTimeout(30); }   // slow scroll ≈ 7 s
mark('scrolled');
await page.waitForTimeout(1500);
const vpath = await page.video().path(); await ctx.close(); await browser.close();
fs.writeFileSync('out/marks.json', JSON.stringify({ video: vpath, marks }, null, 1));
console.log(JSON.stringify({ video: vpath, marks }));
