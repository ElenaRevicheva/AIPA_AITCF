#!/usr/bin/env node
/**
 * podcast-hero-motion-atuona.cjs — one-off: turn the podcast hero stills into two 5 s cinemagraph loops through the
 * EXISTING Atuona Runway lane (dist/atuona-video-pins.js → RUNWAY_VIDEO_MODEL pin, default gen4.5; same
 * `image_to_video` endpoint + headers as src/atuona-creative-ai.ts `tryRunway`). Camera locked; only haze, clouds,
 * beacon and grain move — the hud.ai / Perplexity hero look, from our own still.
 *
 * Runs on Oracle (RUNWAY_API_KEY lives in ~/cto-aipa/.env). Downloads ~/cto-aipa/shots/podcast-motion-<stem>.mp4
 * (Runway's own encode; the laptop transcodes it for the web — never transcode on Oracle). Prints one JSON line per clip.
 *
 *   cd ~/cto-aipa && node scripts/podcast-hero-motion-atuona.cjs            # both
 *   cd ~/cto-aipa && node scripts/podcast-hero-motion-atuona.cjs --only=wide
 */
const fs = require('fs');
const path = require('path');
const HOME = process.env.HOME || '';
require('dotenv').config({ path: path.join(HOME, 'cto-aipa', '.env') });
const { videoPinModel } = require(path.join(HOME, 'cto-aipa', 'dist', 'atuona-video-pins.js'));

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const site = (process.env.PODCAST_SITE_URL || 'https://podcast.aideazz.xyz').replace(/\/$/, '');

// v2 of the motion (Elena, 30 Oct: "clouds move less speedy and cover more space of the screen").
const MOTION =
  'Locked-off static camera on a tripod, absolutely no camera movement, no zoom, no pan. Cinemagraph: the ENTIRE sky is ' +
  'filled with vast layered dusk clouds — soft cumulus and thin cirrus veils stretching across the whole frame from edge to ' +
  'edge, above the building and behind the mast — drifting EXTREMELY slowly, barely perceptible, like a long-exposure ' +
  'time-lapse played at quarter speed. A thin layer of haze moves very slowly across the plaza. The small warm beacon at ' +
  'the tip of the radio mast pulses softly. The building, the plaza and the horizon stay perfectly still. Muted faded ' +
  'cream-violet palette unchanged, analog film grain. Seamless loop, no people, no text, no new objects.';

const CLIPS = [
  { stem: 'wide', image: `${site}/hero.jpg`, ratio: '1280:720' },
  { stem: 'tall', image: `${site}/cover-source.jpg`, ratio: '720:1280' },
];

function headers() {
  return { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' };
}

async function render(clip) {
  const model = videoPinModel('runway');
  const create = await fetch(`${RUNWAY_API_URL}/image_to_video`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ model, promptImage: clip.image, promptText: MOTION, duration: 5, watermark: false, ratio: clip.ratio }),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await create.text();
  if (!create.ok) throw new Error(`Runway ${create.status}: ${txt.slice(0, 200)}`);
  const id = JSON.parse(txt).id;
  if (!id) throw new Error('Runway: no task id');
  console.log(`Runway ${model} task ${id} (${clip.ratio})`);
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 8000));
    const poll = await fetch(`${RUNWAY_API_URL}/tasks/${encodeURIComponent(id)}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
    if (!poll.ok) continue;
    const t = await poll.json();
    const st = String(t.status || '').toUpperCase();
    if (st === 'SUCCEEDED') {
      const url = Array.isArray(t.output) ? t.output[0] : null;
      if (!url) throw new Error('Runway succeeded with no output');
      return { id, model, url };
    }
    if (st === 'FAILED') throw new Error(`Runway failed: ${t.failure || t.failureCode || 'unknown'}`);
    process.stdout.write(`  ${st.toLowerCase()} ${Math.round((Date.now() - started) / 1000)}s\n`);
  }
  throw new Error(`Runway task ${id} not done after 10 min`);
}

(async () => {
  if (!process.env.RUNWAY_API_KEY) throw new Error('RUNWAY_API_KEY missing');
  const outDir = path.join(HOME, 'cto-aipa', 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  for (const clip of CLIPS) {
    if (only && clip.stem !== only) continue;
    try {
      const r = await render(clip);
      const file = path.join(outDir, `podcast-motion-${clip.stem}.mp4`);
      const d = await fetch(r.url, { signal: AbortSignal.timeout(180000) });
      if (!d.ok) throw new Error(`download ${d.status}`);
      const buf = Buffer.from(await d.arrayBuffer());
      fs.writeFileSync(file, buf);
      console.log(JSON.stringify({ stem: clip.stem, model: r.model, id: r.id, file, bytes: buf.length }));
    } catch (e) {
      console.log(JSON.stringify({ stem: clip.stem, error: e.message }));
      process.exitCode = 2;
    }
  }
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
