// v11 harness: render the term_stream .ass for the Arearea item with the v10 design
// usage: node harness11.cjs <cut_v11.json> <shot seconds> <voice seconds> <out.ass>
const fs = require('fs');
const s = fs.readFileSync('D:/aideazz/ai-cofounders/cto-aipa/scripts/atuona-film9.mjs', 'utf8');
const VW = 1920, VH = 1080;
const CUT = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const srcWrap = s.match(/function wrap[^\n]*/)[0];
const srcBal = s.match(/function balanced[\s\S]*?\n}\r?\n/)[0];
const block = s.slice(s.indexOf('const TEXTFONTS'), s.indexOf('const clipPath'));
eval(srcWrap + ';' + srcBal + ';' + block.replace(/^const /gm, 'var ') + ';globalThis.S = termStreamAss;');
const it = CUT.items.find(i => i.term_stream);
globalThis.S(it, +process.argv[3], it.lead, +process.argv[4], process.argv[5]);
console.log(fs.readFileSync(process.argv[5], 'utf8').split('\n').filter(l => l.startsWith('Dialogue')).length, 'events, lead', it.lead);
