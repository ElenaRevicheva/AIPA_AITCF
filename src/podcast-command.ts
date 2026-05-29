/**
 * podcast-command.ts — Telegram /podcast command (ADDITIVE, isolated)
 *
 * Usage: reply to a podcast/interview/long audio (voice note or audio file) with /podcast.
 * It transcribes with speaker diarization, builds the full podcast package (bilingual blog +
 * social + show notes + chapters + clips), publishes the blog + drips LinkedIn via Buffer,
 * saves the podcast assets, and replies with a rich summary.
 *
 * 100% of the logic lives here. telegram-bot.ts gains ONE dynamic-import registration line.
 * Gated behind PODCAST_ENGINE_ENABLED (default off). Reuses the existing publish pipeline.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { transcribeAndTranslate } from './speechmatics';
import { buildPodcastPackage } from './podcast-engine';
import { publishVoiceCampaign } from './voice-campaign-publish';

export function isPodcastEngineEnabled(): boolean {
  return process.env.PODCAST_ENGINE_ENABLED?.trim().toLowerCase() === 'true';
}

/** Download a Telegram file to a Buffer (grammY pattern, mirrors the existing voice handler). */
async function downloadTelegramFile(ctx: any, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`file download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function podcastDir(): string {
  const dir = path.join(process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR ?? path.join(process.cwd(), 'data'), 'podcasts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function runPodcast(ctx: any): Promise<void> {
  try {
    if (!isPodcastEngineEnabled()) {
      await ctx.reply('🎧 Podcast engine is off. Set PODCAST_ENGINE_ENABLED=true to enable.');
      return;
    }
    const replied = ctx.message?.reply_to_message;
    const media = replied?.voice || replied?.audio || replied?.video_note || replied?.document;
    if (!media?.file_id) {
      await ctx.reply('🎧 Reply to an audio file or voice note with /podcast to turn an episode into show notes + chapters + clips + a bilingual blog + social posts.');
      return;
    }

    await ctx.reply('🎧 Got it. Transcribing the episode with speaker detection (this can take a few minutes for long audio)...');
    const audio = await downloadTelegramFile(ctx, media.file_id);
    const filename = replied.voice ? 'voice.ogg' : (replied.audio?.file_name || replied.document?.file_name || 'audio.mp3');
    const transcribed = await transcribeAndTranslate(audio, filename, { language: 'en', translateTo: ['es'], diarization: true });
    if (!transcribed.transcript.trim()) {
      await ctx.reply('🎧 Could not get a transcript from that audio. Try a clearer recording.');
      return;
    }

    await ctx.reply('✍️ Producing show notes, chapters, clips, and a bilingual blog + social...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const pkg = await buildPodcastPackage(anthropic, transcribed, { numSocialPerChannel: 4 });

    await ctx.reply('📡 Publishing the blog + queuing social...');
    const pub = await publishVoiceCampaign(pkg.cluster);

    // Save full podcast assets (show notes, chapters, clips, transcript) for reuse.
    const file = path.join(podcastDir(), `${pkg.cluster.campaignId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...pkg, transcript: transcribed.transcript, segments: transcribed.segments }, null, 2), 'utf8');

    const liOk = pub.linkedinPosted.filter((p) => p.ok).length;
    const chapterLines = pkg.chapters.map((c) => `  ${c.time}  ${c.title}`).join('\n');
    const clipLines = pkg.clips.map((c) => `  ${c.time}  "${c.quote}"`).join('\n');
    const lines = [
      `✅ Podcast processed: ${pkg.cluster.campaignId}`,
      `Topic: ${pkg.cluster.topic} | speakers: ${pkg.speakers}${pkg.durationSec ? ` | ~${Math.round(pkg.durationSec / 60)} min` : ''}`,
      '',
      pub.enBlogUrl ? `📰 Show-notes blog: ${pub.enBlogUrl}` : '📰 Blog: (skipped)',
      `💼 LinkedIn: ${liOk}/${pub.linkedinPosted.length} queued (1 now, rest dripped)`,
      '',
      '📑 CHAPTERS:',
      chapterLines || '  (none)',
      '',
      '✂️ CLIP-WORTHY MOMENTS:',
      clipLines || '  (none)',
      '',
      `🗒️ Key takeaways: ${pkg.keyTakeaways.length} | ES blog + IG captions saved`,
      `   (assets: ${file.split(/[\\/]/).pop()})`,
      '',
      'Every link is UTM-tagged → flows to HubSpot. Upload the audio to your podcast host to publish the episode itself.',
    ];
    await ctx.reply(lines.join('\n'));
  } catch (e) {
    console.error('[Podcast] error:', e);
    try { await ctx.reply(`🎧 Podcast failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`); } catch { /* ignore */ }
  }
}
