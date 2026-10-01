// One-off: art for the Professional Outlook deck, made with the Atuona stills engines —
// the same Replicate models and inputs as the bot's /imagine (dist/atuona-image-pins.js).
// Run ON ORACLE from ~/cto-aipa (that is where the key and the compiled pins live):
//   node ~/outlook-art/gen-art.cjs ~/outlook-art/out ~/outlook-art/art-jobs.json [name,name]
'use strict';
const fs = require('fs');
const path = require('path');
const pins = require(path.join(process.cwd(), 'dist/atuona-image-pins.js'));
const Replicate = require('replicate');

const [, , OUT, JOBS, ONLY] = process.argv;
const rep = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const { style, jobs } = JSON.parse(fs.readFileSync(JOBS, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

function firstUrl(out) {
  const o = Array.isArray(out) ? out[0] : out;
  if (typeof o === 'string') return o;
  if (o && typeof o.url === 'function') return String(o.url());
  return null;
}

// Sequential, one start every 11 s, retry on 429: under a $5 prepaid balance Replicate allows
// 6 predictions/minute, and a parallel batch of 17 was throttled on 12 of them (1 Oct 2026).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function one(j, engine) {
  const prompt = `${j.prompt} ${style}`;
  const model = pins.imagePinModel(engine);
  const input = engine === 'flux'
    ? { prompt, aspect_ratio: j.ar, output_format: 'jpg' }            // runFluxStillOnce's Flux 2 input
    : pins.replicateImageInput(engine, prompt, j.ar);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    try {
      const url = firstUrl(await rep.run(model, { input }));
      if (!url) throw new Error('no image in output');
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      fs.writeFileSync(path.join(OUT, `${j.name}--${engine}.jpg`), buf);
      return console.log(`OK   ${j.name} ${engine} (${model}) ${(buf.length / 1024) | 0} KB ${((Date.now() - t0) / 1000) | 0}s`);
    } catch (e) {
      const msg = String(e.message || e);
      if (/429/.test(msg) && attempt < 4) { await sleep(15000 * attempt); continue; }
      return console.log(`FAIL ${j.name} ${engine} (${model}): ${msg.slice(0, 200)}`);
    }
  }
}

(async () => {
  const todo = jobs.filter((j) => !ONLY || ONLY.split(',').includes(j.name));
  const running = [];
  for (const j of todo) for (const engine of j.engines) {
    running.push(one(j, engine));
    await sleep(11000);
  }
  await Promise.all(running);
})();
