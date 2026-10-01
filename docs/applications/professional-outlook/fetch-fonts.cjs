// Pull Google Fonts (OFL) into ./fonts so the PDF render never depends on the network.
// Usage: node fetch-fonts.cjs "<css2 url>" <out.css> <file prefix>
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const URL = process.argv[2] || 'https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300..700&display=swap';
(async () => {
  let css = await (await fetch(URL, { headers: { 'User-Agent': UA } })).text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
  let i = 0;
  for (const u of urls) {
    const name = `${process.argv[4] || 'f'}${String(i++).padStart(2, '0')}.woff2`;
    fs.writeFileSync(path.join(__dirname, 'fonts', name), Buffer.from(await (await fetch(u)).arrayBuffer()));
    css = css.split(u).join(name);
  }
  fs.writeFileSync(path.join(__dirname, 'fonts', process.argv[3] || 'fonts.css'), css);
  console.log('fonts:', urls.length);
})();
