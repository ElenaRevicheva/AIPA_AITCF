#!/usr/bin/env node
/**
 * test-atuona-vault-insert.cjs — prove the Atuona publisher can still publish.
 *
 * The vault on atuona.xyz is now a generated tree, and this bot writes into it
 * from a different repo. That makes the markup a CONTRACT BETWEEN TWO REPOS, and
 * the previous version of that contract was three nested whitespace matches with
 * no else branch: when it missed, the poem was committed to the JSON files and to
 * MINT, Telegram said "published", and the poem never appeared in the vault.
 *
 * So this exercises the REAL compiled publisher against the REAL index.html and
 * then hands the result to atuona's own verifier. It is not a re-implementation:
 * it requires dist/atuona-vault-tree.js — the same compiled code that runs on
 * Oracle, imported by atuona-creative-ai.ts.
 *
 * Run:  node scripts/test-atuona-vault-insert.cjs
 * Needs: npm run build (for dist/) and a checkout at D:\aideazz\atuona
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ATUONA = process.env.ATUONA_REPO || 'D:/aideazz/atuona';
const HTML = path.join(ATUONA, 'index.html');
const VERIFY = path.join(ATUONA, 'scripts', 'verify-vault.mjs');
const DIST = path.join(__dirname, '..', 'dist', 'atuona-vault-tree.js');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

for (const [what, p] of [['dist build', DIST], ['atuona index.html', HTML], ['atuona verifier', VERIFY]]) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${what}: ${p}`);
    console.error(what === 'dist build' ? 'run: npm run build' : 'clone atuona or set ATUONA_REPO');
    process.exit(1);
  }
}

const mod = require(DIST);
const { insertPoemIntoVault, replacePoemCard, findCardBounds } = mod;
const clean = fs.readFileSync(HTML, 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atuona-publish-'));

console.log('test-atuona-vault-insert — the real publisher against the real vault\n');

ok('publisher exports insertPoemIntoVault', typeof insertPoemIntoVault === 'function');
ok('publisher exports replacePoemCard', typeof replacePoemCard === 'function');
ok('publisher exports findCardBounds', typeof findCardBounds === 'function');

/* A card in exactly the shape createNFTCardHtml emits. */
const card = (id, title, verse) => `
                    <div class="nft-card">
                        <div class="nft-header">
                            <div class="nft-id">#${id}</div>
                            <div class="nft-status live">LIVE</div>
                        </div>
                        <div class="nft-content">
                            <h2 class="nft-title">${title}</h2>
                            <div class="nft-verse">
                                ${verse}
                            </div>
                            <div class="blockchain-badge">
                                <span>●</span> принято к публикации at ATUONA 08-09-2026
                            </div>
                            <p class="nft-description">
                                A test poem that must never reach the live site.
                            </p>
                            <div class="nft-meta">
                                <div class="nft-price">FREE - GAS Only!</div>
                                <button class="nft-action" onclick="claimPoem('${id}', '${title}')">COLLECT SOUL</button>
                                <small style="color: var(--silver-grey); font-size: 0.7rem; margin-top: 0.5rem; display: block; font-family: 'JetBrains Mono', monospace;">Minimal fee covers blockchain preservation costs</small>
                            </div>
                        </div>
                    </div>
`;

const NEW = { pageId: '100', title: 'A Hundred', firstLine: 'The hundredth moment arrives.', dateStr: '08-09-2026' };
const published = insertPoemIntoVault(clean, { ...NEW, cardHtml: card('100', NEW.title, NEW.firstLine) });

/* 1 — the poem actually lands, in the row form the tree uses. */
ok('poem #100 gets an addressable row', published.includes('id="p100"'));
ok('poem #100 keeps its card', published.includes('<div class="nft-id">#100</div>'));
ok('poem #100 row shows its title', published.includes('<span class="poem-title">A Hundred</span>'));
ok('poem #100 row shows its number', published.includes('<span class="poem-num">#100</span>'));
ok('poem #100 mints its own token', published.includes(`claimPoem('100', 'A Hundred')`));
ok('poem #100 lands in PART I (ATUONA)',
  published.indexOf('id="p100"') > published.indexOf('id="part-atuona"') &&
  published.indexOf('id="p100"') < published.indexOf('id="part-litprom"'));
ok('poem #100 is placed newest-first, above #099',
  published.indexOf('id="p100"') < published.indexOf('id="p099"'));

/* 2 — and the page is still a valid, fully verified vault afterwards. */
const out = path.join(tmp, 'published.html');
fs.writeFileSync(out, published, 'utf8');
let verifyOut = '';
let verified = true;
try {
  verifyOut = execFileSync('node', [VERIFY, '--file', out], { cwd: ATUONA, encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  verified = false;
  verifyOut = String(e.stdout || '') + String(e.stderr || '');
}
ok('the published page still passes verify-vault', verified, verifyOut.trim().split('\n').slice(-3).join(' | '));
ok('verify flags #100 as new since the lock', /#100 is NEW since the lock/.test(verifyOut));

/* 3 — publishing twice must not create two rows claiming one token. */
const twice = insertPoemIntoVault(published, { ...NEW, cardHtml: card('100', NEW.title, NEW.firstLine) });
ok('re-publishing #100 is a no-op', twice === published);
ok('only one row for #100', (published.match(/id="p100"/g) || []).length === 1);

/* 4 — THE POINT: a missing marker must throw, not return the page unchanged.
   This is the exact failure the old whitespace splice hid. */
let threw = false;
let msg = '';
try {
  insertPoemIntoVault(clean.replace('<!-- VAULT:INSERT:ATUONA -->', ''), { ...NEW, cardHtml: card('100', NEW.title, NEW.firstLine) });
} catch (e) { threw = true; msg = e.message; }
ok('a missing insertion marker THROWS', threw, threw ? '' : 'it silently returned the page — the poem would be lost');
ok('the throw names the poem it refused to lose', /#100/.test(msg) && /Refusing/i.test(msg));

/* 5 — a new year opens a new run; the same year joins the existing one. */
const nextYear = insertPoemIntoVault(clean, {
  pageId: '101', title: 'Next Year', firstLine: 'Later.', dateStr: '02-01-2027',
  cardHtml: card('101', 'Next Year', 'Later.'),
});
ok('a poem in a new year opens a new year run', /<span class="run-y">2027<\/span>/.test(nextYear));
ok('a poem in the current year joins the existing run', !/<span class="run-y">2026<\/span>[\s\S]{0,200}<span class="run-y">2026<\/span>/.test(published));

/* 6 — replace works on the tree's indentation, where the old literal did not. */
const replaced = replacePoemCard(clean, '045', card('045', 'Под стук каблуков', 'REPLACED BODY'));
ok('replacePoemCard swaps the card in place', replaced.includes('REPLACED BODY'));
ok('replacePoemCard keeps exactly one #045 card', (replaced.match(/<div class="nft-id">#045<\/div>/g) || []).length === 1);
ok('replacePoemCard does not disturb its neighbours',
  (replaced.match(/<div class="nft-card">/g) || []).length === (clean.match(/<div class="nft-card">/g) || []).length);

let repThrew = false;
try { replacePoemCard(clean, '999', card('999', 'Nope', 'x')); } catch { repThrew = true; }
ok('replacing a poem that is not there THROWS', repThrew);

/* 7 — depth counting really is indentation-agnostic. */
const bounds = findCardBounds(clean, '045');
ok('findCardBounds locates a card in the tree', !!bounds);
if (bounds) {
  const slice = clean.slice(bounds.start, bounds.end);
  ok('bounds contain the whole card and nothing more',
    slice.startsWith('<div class="nft-card">') && slice.endsWith('</div>') &&
    (slice.match(/<div class="nft-id">/g) || []).length === 1);
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fails.length} failed.`);
if (fails.length) {
  console.error('\n✗ the publisher is not safe to deploy:');
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}
console.log('✓ the publisher lands a poem in the tree, refuses loudly when it cannot, and leaves the vault verifiable.');
