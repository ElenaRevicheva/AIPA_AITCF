/**
 * voice-engine-cli.ts — manual driver for the Voice Growth Engine (STAGE A, additive)
 *
 * Proves the engine end-to-end without touching any prod path:
 *   transcribe+translate (Speechmatics) -> atomize (Claude->Groq) -> preview cluster.
 *
 * Usage (where SPEECHMATICS_API_KEY + ANTHROPIC_API_KEY are set):
 *   npx ts-node scripts/voice-engine-cli.ts health                 # auth check
 *   npx ts-node scripts/voice-engine-cli.ts transcribe <audio>     # transcript + ES translation
 *   npx ts-node scripts/voice-engine-cli.ts cluster <audio>        # full content cluster preview (no publish)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import Anthropic from '@anthropic-ai/sdk';
import { transcribeFile, speechmaticsHealthCheck } from '../src/speechmatics';
import { buildContentCluster } from '../src/voice-growth-engine';
import { publishVoiceCampaign } from '../src/voice-campaign-publish';
import { transcribeAndTranslate } from '../src/speechmatics';
import { buildPodcastPackage } from '../src/podcast-engine';
import * as fs from 'fs';

async function main() {
  const cmd = (process.argv[2] || 'health').toLowerCase();
  const audio = process.argv[3];

  if (cmd === 'health') {
    const ok = await speechmaticsHealthCheck();
    console.log(ok ? 'Speechmatics: AUTH OK' : 'Speechmatics: AUTH FAILED (check SPEECHMATICS_API_KEY / SPEECHMATICS_REGION)');
    return;
  }

  if (!audio) { console.error('Provide an audio file path.'); process.exit(1); }

  if (cmd === 'transcribe') {
    const r = await transcribeFile(audio, { language: 'en', translateTo: ['es'] });
    console.log(`\nJob ${r.jobId} (${r.durationSec ?? '?'}s)\n`);
    console.log('--- EN ---\n' + r.transcript + '\n');
    console.log('--- ES ---\n' + (r.translations.es || '(none)') + '\n');
    return;
  }

  if (cmd === 'cluster') {
    console.log('Transcribing + translating...');
    const r = await transcribeFile(audio, { language: 'en', translateTo: ['es'] });
    console.log('Atomizing into content cluster...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cluster = await buildContentCluster(anthropic, r, { numSocialPerChannel: 3 });

    console.log(`\n=== CAMPAIGN: ${cluster.campaignId} ===`);
    console.log(`Topic: ${cluster.topic}\n`);
    for (const b of cluster.blogs) {
      console.log(`--- BLOG [${b.lang}] "${b.title}" (slug: ${b.slug}) ---`);
      console.log(b.markdown.slice(0, 400) + '...\n');
      console.log(`  canonical: ${b.canonicalUrl}`);
      console.log(`  utm: ${b.utm}\n`);
    }
    for (const s of cluster.social) {
      console.log(`--- ${s.channel.toUpperCase()} [${s.angle}] ---`);
      console.log(s.text + '\n');
    }
    console.log(`Total atoms: ${cluster.blogs.length} blogs + ${cluster.social.length} social = ${cluster.blogs.length + cluster.social.length}\n`);
    return;
  }

  if (cmd === 'publish') {
    console.log('Transcribing + translating...');
    const r = await transcribeFile(audio, { language: 'en', translateTo: ['es'] });
    console.log('Atomizing...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cluster = await buildContentCluster(anthropic, r, { numSocialPerChannel: 3 });
    console.log(`Publishing campaign ${cluster.campaignId}...`);
    const res = await publishVoiceCampaign(cluster);
    console.log('\n=== PUBLISH RESULT ===');
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === 'podcast') {
    console.log('Transcribing with diarization + translation...');
    const r = await transcribeAndTranslate(fs.readFileSync(audio), audio.split(/[\\/]/).pop() || 'audio', { language: 'en', translateTo: ['es'], diarization: true });
    console.log(`Speakers detected: ${new Set((r.segments || []).map((s) => s.speaker)).size}`);
    console.log('Building podcast package (no publish)...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const pkg = await buildPodcastPackage(anthropic, r, { numSocialPerChannel: 3 });
    console.log('\n=== SHOW NOTES ===\n' + pkg.showNotes.slice(0, 500));
    console.log('\n=== CHAPTERS ===');
    pkg.chapters.forEach((c) => console.log(`  ${c.time}  ${c.title}`));
    console.log('\n=== CLIPS ===');
    pkg.clips.forEach((c) => console.log(`  ${c.time}  "${c.quote}" (${c.hook})`));
    console.log('\n=== TAKEAWAYS ===');
    pkg.keyTakeaways.forEach((t) => console.log(`  - ${t}`));
    console.log(`\nBlogs: ${pkg.cluster.blogs.length}, social atoms: ${pkg.cluster.social.length}`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use: health | transcribe <audio> | cluster <audio> | publish <audio> | podcast <audio>`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
