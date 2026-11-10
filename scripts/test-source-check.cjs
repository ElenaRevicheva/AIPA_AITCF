#!/usr/bin/env node
/**
 * test-source-check.cjs — the shared "is the number written in its source?" rule.
 * Fixtures are neutral examples of the formats that broke a real research job:
 * Russian/European decimal commas, space- and NBSP-grouped thousands, prices.
 * Run: npx tsc -p . && node scripts/test-source-check.cjs
 */
'use strict';
const path = require('path');
const assert = require('assert');
const { claimNumbers, normaliseNumericText, numberInText, checkClaim } = require(path.join(__dirname, '..', 'dist', 'source-check.js'));

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok ', name); };
const inSrc = (num, src) => numberInText(num, normaliseNumericText(src));

ok('decimal comma in the source matches a decimal point in the claim', () =>
  assert(inSrc('18.5', 'средняя температура составила 18,5 градуса')));
ok('space-grouped thousands match comma-grouped thousands', () =>
  assert(inSrc('12,345,678', 'Итого за год 12 345 678 и 11 000 001')));
ok('NBSP-grouped thousands match', () => assert(inSrc('3,524', 'всего 3 524 заказа')));
ok('price with dollar sign: $44,10 matches 44.10', () => assert(inSrc('44.10', 'The list price is $44,10 per unit')));
ok('47.0 also matches a source that writes 47', () => assert(inSrc('47.0', 'выручка составила 47 млн')));
ok('no false hit inside a longer number (24 vs 245)', () => assert(!inSrc('24', 'составил 245 тыс.')));
ok('no false hit inside a decimal (5 vs 1.5)', () => assert(!inSrc('5', 'рост на 1.5 процента')));
ok('years and small counts need no source (blog-evidence isFreeNumber)', () =>
  assert.deepStrictEqual(claimNumbers('In 2025 three offices, 7 teams'), []));
ok('footnote markers are not claims', () => assert.deepStrictEqual(claimNumbers('Revenue was 54.27 M [11][12]'), ['54.27']));
ok('ISO dates and URLs are not claims (blog-evidence strip)', () =>
  assert.deepStrictEqual(claimNumbers('see https://example.org/a/9143 on 2026-03-01: 613 orders'), ['613']));
ok('verdict IN SOURCE', () => assert.strictEqual(checkClaim('2025 orders 3,283; returns 1,588', ['Возвраты 1588 48,37 … итого 3 283']).verdict, 'IN SOURCE'));
ok('verdict PARTIAL keeps the missing number', () => {
  const r = checkClaim('The warehouse has 111 bays and 390,900 units', ['на складе 111 секций и 2 рампы']);
  assert.strictEqual(r.verdict, 'PARTIAL'); assert.deepStrictEqual(r.missing, ['390,900']);
});
ok('verdict NOT IN SOURCE', () =>
  assert.strictEqual(checkClaim('Approval takes up to 48 hours', ['решение принимается в установленный срок']).verdict, 'NOT IN SOURCE'));
ok('verdict NO COPY when no readable source text', () => assert.strictEqual(checkClaim('Capacity 24 units', []).verdict, 'NO COPY'));
ok('verdict NO NUMBERS for qualitative claims', () => assert.strictEqual(checkClaim('The office is open all year', ['работает круглый год']).verdict, 'NO NUMBERS'));

console.log(`\nAll ${n} source-check checks passed`);
