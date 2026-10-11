// emit the compile's flowing-glitch filter chain for one shot: node chain.cjs <seconds> <seed> <out.txt>
const fs = require('fs');
const s = fs.readFileSync('D:/aideazz/ai-cofounders/cto-aipa/scripts/atuona-film9.mjs', 'utf8');
const FPS = 24, VH = 1080;
const grab = n => s.match(new RegExp('function ' + n + '[\\s\\S]*?\\n}\\r?\\n'))[0];
eval(grab('flowTears') + grab('glitchyChain') + ';globalThis.g = glitchyChain;');
fs.writeFileSync(process.argv[4], globalThis.g(+process.argv[2], +process.argv[3], true).slice(1));
console.log('chain written');
