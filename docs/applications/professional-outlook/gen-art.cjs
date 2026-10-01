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

(async () => {
  const todo = jobs.filter((j) => !ONLY || ONLY.split(',').includes(j.name));
  await Promise.all(todo.flatMap((j) => j.engines.map(async (engine) => {
    const prompt = `${j.prompt} ${style}`;
    const model = pins.imagePinModel(engine);
    const input = engine === 'flux'
      ? { prompt, aspect_ratio: j.ar, output_format: 'jpg' }            // runFluxStillOnce's Flux 2 input
      : pins.replicateImageInput(engine, prompt, j.ar);
    const t0 = Date.now();
    try {
      const url = firstUrl(await rep.run(model, { input }));
      if (!url) throw new Error('no image in output');
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const file = path.join(OUT, `${j.name}--${engine}.jpg`);
      fs.writeFileSync(file, buf);
      console.log(`OK   ${j.name} ${engine} (${model}) ${(buf.length / 1024) | 0} KB ${((Date.now() - t0) / 1000) | 0}s`);
    } catch (e) {
      console.log(`FAIL ${j.name} ${engine} (${model}): ${String(e.message || e).slice(0, 200)}`);
    }
  })));
})();
