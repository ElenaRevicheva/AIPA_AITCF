// node scripts/test-negative-parallelism.cjs — detector checks on real Atuona output.
const { findNegativeParallelism } = require('../dist/negative-parallelism.js');

// Real daily inspiration, 4 Nov 2026 (the message Elena flagged).
const REAL = `Семь строк вычеркнуты. Восьмую он не тронул — на ней только точка, и Кира не знает, что она закрывает.

Она считает вслух. Не для него. Для себя — чтобы услышать, как звучит число, которое он от себя отрезал.

Уле говорит по-английски, когда врёт: «It's not a confession. It's a draft.»

Агент без памяти — это амнезия, которая вежливо отвечает. Кира не хочет быть агентом. Она хочет быть той, кто remembers. Не approves. Remembers.

[В углу мерцает: точка на восьмой строке — это не конец. Это cursor.]`;

const cases = [
  ['real 4 Nov message', REAL, 4],
  ['plain negation is fine', 'Кира не знает, что она закрывает. Восьмую он не тронул.', 0],
  ['ne X, a Y', 'Это была не любовь, а привычка.', 1],
  ['ne dlya togo', 'Она пишет не для того, чтобы помнить, а для того, чтобы забыть.', 1],
  ['EN not X but Y', 'He came not for the art, but for the silence.', 1],
  ['EN plain', 'She did not answer. The rain kept on.', 0],
  ['Monet passage (clean)', 'В 1892-м Моне писал западный фасад Руана из примерочной. Тридцать раз один и тот же камень.', 0],
];

let fail = 0;
for (const [name, text, want] of cases) {
  const hits = findNegativeParallelism(text);
  const ok = hits.length === want;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${hits.length} (want ${want})`);
  if (!ok || name.startsWith('real')) hits.forEach(h => console.log('    · ' + h.text.slice(0, 90)));
}
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
