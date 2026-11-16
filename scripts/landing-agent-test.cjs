#!/usr/bin/env node
/*
 * EspaLuz landing — the agent test before every Publish (16 Nov 2026).
 *
 * Andy (EdTech founder-tester) on the landing: "it is not clear in the first minute who EspaLuz is for and what it
 * does... put sub-agents to read it as a human would and see if, in 200-300 words, they understand what the page is
 * about." Elena accepted it as rule 3 of docs/espaluz/LANDING_COLD_READ_2026-11-16.md: before every Publish.
 *
 * How it works (one command on the laptop):
 *   node scripts/landing-agent-test.cjs                      # the live site
 *   node scripts/landing-agent-test.cjs --url=http://localhost:4173/ --label=new-hero   # a local build, before Publish
 *
 *  1. A real phone browser (Pixel 7 screen) opens the page in EN, ES and RU, exactly as a stranger sees it (cookie box
 *     included), and takes what is on the FIRST SCREEN plus the first 300 words of the page.
 *  2. Three readers - a US mother in Panamá (EN), a Venezuelan father in Panamá (ES), a Russian mother in Buenos Aires
 *     (RU) - each read ONLY that text. No web search, no outside knowledge (the free-first waterfall, not the research
 *     fan-out: fanOut makes Gemini search the web first, and a reader who looks EspaLuz up is not a cold reader).
 *     The readers run on Oracle, where the model keys live (`--readers` mode, text over ssh stdin).
 *  3. PASS only when every reader names who it is for and what it does with confidence >= 4 of 5 AND would tap
 *     something (a reader who would leave is a lost visitor).
 *  4. The report is saved to docs/espaluz/landing-tests/<date>_<label>.md - before/after history in git.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const READERS = [
  { lang: 'en', who: 'an American mother of a 6-year-old who moved to Panamá two months ago; busy, skimming on her phone' },
  { lang: 'es', who: 'a Venezuelan father who just moved his family to Panamá (kids 5 and 8); he speaks Spanish; skimming on his phone' },
  { lang: 'ru', who: 'a Russian-speaking mother (remote IT job) who relocated to Buenos Aires with a 7-year-old; skimming on her phone' },
];
const WORDS = 300;
const PASS_AT = 4;

// ---------------------------------------------------------------- readers (runs on Oracle) ----------------------
async function readers() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const { completeWithProfileDetailed } = require('../dist/llm-resilience.js');
  const out = [];
  for (const r of READERS) {
    const page = input.pages[r.lang];
    if (!page) continue;
    const prompt = [
      `You are ${r.who}. You opened a website on your phone. Below is EXACTLY what you saw: first the first screen, then`,
      `the first ${WORDS} words of the page. You know NOTHING else about this product - do not use outside knowledge.`,
      `Read it the way a real busy person skims, in the language it is written in.`,
      '',
      '=== FIRST SCREEN ===', page.firstScreen, '',
      `=== FIRST ${WORDS} WORDS ===`, page.firstWords, '',
      'Answer ONLY with JSON, in English, with these keys:',
      '{"who_for": "one short sentence", "what_it_does": "one short sentence",',
      ' "confidence": 1-5 (how sure you are about both, 5 = completely clear),',
      ' "would_tap": "the exact button/link text you would tap first, or \\"leave\\"",',
      ' "confusing": ["up to 4 exact quotes from the text that slowed you down or felt like filler"],',
      ' "missing": "the one thing you needed and did not find"}',
    ].join('\n');
    let parsed = null; let provider = ''; let raw = '';
    try {
      const res = await completeWithProfileDetailed('bulk', 'You are a cold reader. Return only valid JSON.', prompt, 800, 'landing-agent-test');
      provider = res.provider; raw = res.text;
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      raw = String(e.message || e).slice(0, 300);
    }
    out.push({ lang: r.lang, who: r.who, provider, result: parsed, raw: parsed ? undefined : raw.slice(0, 400) });
  }
  process.stdout.write(JSON.stringify(out));
}

// ---------------------------------------------------------------- extract + report (runs on the laptop) ---------
async function extract(url) {
  const { chromium, devices } = require('playwright');
  const browser = await chromium.launch();
  const pages = {};
  const facts = {};
  for (const { lang } of READERS) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    // The page's own language switch; ?internal=1 keeps the test out of PostHog and Google Analytics.
    await ctx.addInitScript((l) => { try { localStorage.setItem('espaluz-lang', l); localStorage.setItem('espaluz-internal', '1'); } catch {} }, lang);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3000); // the cookie box appears after 1 s, as for a real visitor
    const got = await page.evaluate((WORDS) => {
      const H = innerHeight;
      const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
      let first = ''; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) {
        const el = n.parentElement; const t = n.textContent.trim();
        if (!el || !t || !visible(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.top < H && b.bottom > 0) first += t + ' ';
      }
      const all = document.body.innerText.replace(/\s+/g, ' ').trim();
      const words = all.split(' ');
      const overlays = [...document.querySelectorAll('div.fixed, [role="dialog"]')].filter(visible)
        .map((d) => d.getBoundingClientRect()).filter((b) => b.height < H * 0.9).map((b) => Math.round((Math.min(b.bottom, H) - Math.max(b.top, 0)) / H * 100));
      const taps = [...document.querySelectorAll('a,button')].filter(visible).map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean);
      return { firstScreen: first.replace(/\s+/g, ' ').trim(), firstWords: words.slice(0, WORDS).join(' '), totalWords: words.length,
        screens: Math.round(document.documentElement.scrollHeight / H * 10) / 10, coverPct: Math.max(0, ...overlays), taps: taps.length, distinctTaps: new Set(taps).size };
    }, WORDS);
    pages[lang] = { firstScreen: got.firstScreen, firstWords: got.firstWords };
    facts[lang] = { totalWords: got.totalWords, screens: got.screens, coverPct: got.coverPct, taps: got.taps, distinctTaps: got.distinctTaps, firstScreenWords: got.firstScreen.split(' ').length };
    await ctx.close();
  }
  await browser.close();
  return { pages, facts };
}

function report({ url, label, facts, results }) {
  // A reader who understands but would LEAVE is a lost visitor: confidence >= PASS_AT AND a tap, never "leave".
  const stays = (r) => r.result && !/^\s*"?leave\b/i.test(String(r.result.would_tap ?? ''));
  const ok = results.length === READERS.length && results.every((r) => (r.result?.confidence ?? 0) >= PASS_AT && stays(r));
  const L = [];
  L.push(`# Landing agent test — ${label} — ${ok ? 'PASS' : 'FAIL'}`, '');
  L.push(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${url} · Pixel 7 screen · pass = every reader ≥ ${PASS_AT}/5 and none would leave`, '');
  L.push('| lang | words | phone screens | words on 1st screen | 1st screen covered by a box | things to tap (different) |', '|---|---|---|---|---|---|');
  for (const [lang, f] of Object.entries(facts)) L.push(`| ${lang} | ${f.totalWords} | ${f.screens} | ${f.firstScreenWords} | ${f.coverPct}% | ${f.taps} (${f.distinctTaps}) |`);
  L.push('');
  for (const r of results) {
    const x = r.result;
    L.push(`## ${r.lang.toUpperCase()} — ${x ? `${x.confidence}/5` : 'no answer'}${r.provider ? ` (read by ${r.provider})` : ''}`);
    L.push(`Reader: ${r.who}.`, '');
    if (!x) { L.push(`Error: ${r.raw}`, ''); continue; }
    L.push(`- **Who it is for:** ${x.who_for}`, `- **What it does:** ${x.what_it_does}`, `- **Would tap first:** ${x.would_tap}`);
    if (Array.isArray(x.confusing) && x.confusing.length) L.push(`- **Slowed down by:** ${x.confusing.map((q) => `"${q}"`).join(' · ')}`);
    if (x.missing) L.push(`- **Missing:** ${x.missing}`);
    L.push('');
  }
  return { ok, text: L.join('\n') };
}

async function main() {
  if (process.argv.includes('--readers')) return readers();
  const url = arg('url', 'https://app.espaluz.lat/');
  const label = arg('label', /localhost|127\.0\.0\.1/.test(url) ? 'local-build' : 'live');
  console.log(`Reading ${url} in EN / ES / RU on a phone screen...`);
  const { pages, facts } = await extract(url);
  console.log('Asking the three cold readers (free-first models, on Oracle)...');
  const run = spawnSync('ssh', ['-o', 'ConnectTimeout=20', 'oracle-cto-aipa',
    'cd ~/cto-aipa && node -r dotenv/config scripts/landing-agent-test.cjs --readers'],
    { input: JSON.stringify({ pages }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60_000 });
  const outText = String(run.stdout || '').trim();
  let results;
  try { results = JSON.parse(outText.slice(outText.indexOf('['))); }
  catch { console.error('Readers failed:', (run.stderr || outText).slice(0, 800)); process.exit(2); }
  const { ok, text } = report({ url, label, facts, results });
  const dir = path.join(__dirname, '..', 'docs', 'espaluz', 'landing-tests');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}_${label.replace(/[^a-z0-9-]+/gi, '-')}.md`);
  fs.writeFileSync(file, text + '\n');
  console.log('\n' + text + `\nSaved: ${path.relative(process.cwd(), file)}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
