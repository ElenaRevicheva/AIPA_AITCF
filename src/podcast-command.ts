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
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { claudeWithGroqFallback } from './llm-resilience';
import { transcribeAndTranslate } from './speechmatics';
import { buildPodcastPackage } from './podcast-engine';
import { publishVoiceCampaign } from './voice-campaign-publish';
import { publishEpisode } from './podcast-publish';
import { ttsToMp3 } from './podcast-tts';

/**
 * JUNE 10 2026 — Non-English voice notes (e.g. Russian) are no longer published raw.
 * Default: detect language -> translate + POLISH into a profound, tech-savvy English
 * episode script (keeping Elena's idea, structure, and voice) -> narrate with TTS ->
 * publish that as the episode. The natural-voice original remains available:
 * reply with "/podcast raw" to publish the recording as-is (any language).
 */
const POLISH_SYSTEM = `You are the editorial producer for Elena Revicheva's podcast "AIdeazz — Building in Public On The Go" (solo AI founder in Panama, AI-augmented builder, EN/ES/RU speaker).

You receive a RAW TRANSCRIPT of Elena thinking out loud, often in Russian. Your job:
1. CATCH HER IDEA: identify the core thesis, her structure, her examples, her opinions. The episode must say what SHE meant — amplified, not replaced.
2. Translate to English and ELEVATE: correct, modern, tech-savvy language a senior AI builder would use. Fix rambling, keep personality and warmth.
3. Output a SPOKEN episode script: first person, conversational, short sentences. No headings, no stage directions, no markdown, no emojis. Plain ASCII only.
4. NEVER invent facts, numbers, names, or events she did not say. If she referenced something vaguely, keep it vague.
5. Length: 600-1100 words.

Return ONLY the script text.`;

/** Cheap, reliable non-English detector for our use case (RU = Cyrillic). */
function looksRussian(text: string): boolean {
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  return cyr > Math.max(20, text.length * 0.15);
}

export function isPodcastEngineEnabled(): boolean {
  return process.env.PODCAST_ENGINE_ENABLED?.trim().toLowerCase() === 'true';
}

/** Separate gate: actually publish the audio episode to the podcast feed (off until 4everland is connected). */
export function isPodcastPublishEnabled(): boolean {
  return process.env.PODCAST_PUBLISH_ENABLED?.trim().toLowerCase() === 'true';
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

    // "/podcast raw" (or "original") publishes the natural voice as-is, any language.
    const wantRaw = /\b(raw|original)\b/i.test(ctx.message?.text || '');

    await ctx.reply('🎧 Got it. Transcribing the episode with language auto-detection (this can take a few minutes for long audio)...');
    const audio = await downloadTelegramFile(ctx, media.file_id);
    const filename = replied.voice ? 'voice.ogg' : (replied.audio?.file_name || replied.document?.file_name || 'audio.mp3');
    let transcribed;
    try {
      transcribed = await transcribeAndTranslate(audio, filename, { language: 'auto', translateTo: ['es'], diarization: true });
    } catch (e) {
      // Some language/translation pairs are unsupported (e.g. ru->es) — retry without translation.
      console.warn('[Podcast] auto+translate failed, retrying without translation:', e instanceof Error ? e.message.slice(0, 120) : e);
      transcribed = await transcribeAndTranslate(audio, filename, { language: 'auto', diarization: true });
    }
    if (!transcribed.transcript.trim()) {
      await ctx.reply('🎧 Could not get a transcript from that audio. Try a clearer recording.');
      return;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const isRussian = looksRussian(transcribed.transcript);
    const originalTranscript = transcribed.transcript;
    let episodeAudio = audio;            // what gets published to the feed
    let episodeSource: 'voice' | 'ai' = 'voice';
    let polishedScript: string | null = null;

    if (isRussian && !wantRaw) {
      // ── Russian voice note: translate + polish + narrate in English ──
      await ctx.reply('🌐 Russian detected. Translating and polishing into a tech-savvy English episode (your idea, your structure — elevated)...');
      polishedScript = await claudeWithGroqFallback(
        anthropic,
        process.env.PODCAST_ENGINE_MODEL || 'claude-sonnet-4-5-20250929',
        2600,
        POLISH_SYSTEM,
        `RAW TRANSCRIPT (Russian, spoken):\n\n${originalTranscript.slice(0, 14000)}`,
        'podcast/ru-polish',
      );
      if (!polishedScript.trim()) throw new Error('Polish step returned empty script');

      await ctx.reply('🔊 Narrating the English episode with text-to-speech...');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      episodeAudio = await ttsToMp3(openai, polishedScript);
      episodeSource = 'ai';

      await ctx.reply('🎙️ Transcribing the narration with Speechmatics (captions + chapters)...');
      transcribed = await transcribeAndTranslate(episodeAudio, 'episode.mp3', { language: 'en', translateTo: ['es'], diarization: true });
      if (!transcribed.transcript.trim()) throw new Error('Narrated audio produced no transcript');
    } else if (isRussian && wantRaw) {
      await ctx.reply('🎙️ Raw mode: publishing your natural Russian voice as-is.');
    }

    await ctx.reply('✍️ Producing show notes, chapters, clips, and a bilingual blog + social...');
    const pkg = await buildPodcastPackage(anthropic, transcribed, { numSocialPerChannel: 4 });

    await ctx.reply('📡 Publishing the blog + queuing social...');
    const pub = await publishVoiceCampaign(pkg.cluster);

    // Publish the actual audio episode to the podcast feed (gated until 4everland is connected).
    let episodeUrl: string | null = null;
    if (isPodcastPublishEnabled()) {
      try {
        await ctx.reply('🎧 Publishing the episode to your podcast feed...');
        const r = await publishEpisode(
          {
            id: pkg.cluster.campaignId,
            title: pkg.cluster.topic,
            description: pkg.showNotes || pkg.cluster.topic,
            audioBytes: episodeAudio.length,
            durationSec: transcribed.durationSec || 0,
            chapters: pkg.chapters,
            ...(pub.enBlogUrl ? { blogUrl: pub.enBlogUrl } : {}),
            source: episodeSource,
          },
          episodeAudio,
        );
        episodeUrl = r.episodeUrl;
      } catch (e) {
        console.warn('[Podcast] episode publish:', e instanceof Error ? e.message : String(e));
        await ctx.reply(`🎧 (Episode audio publish skipped: ${e instanceof Error ? e.message.slice(0, 120) : 'error'})`);
      }
    }

    // Save full podcast assets (show notes, chapters, clips, transcript) for reuse.
    // For translated episodes the ORIGINAL Russian transcript and the polished
    // English script are both preserved — nothing is lost.
    const file = path.join(podcastDir(), `${pkg.cluster.campaignId}.json`);
    fs.writeFileSync(file, JSON.stringify({
      ...pkg,
      transcript: transcribed.transcript,
      segments: transcribed.segments,
      ...(isRussian ? { originalTranscriptRu: originalTranscript } : {}),
      ...(polishedScript ? { polishedScriptEn: polishedScript } : {}),
      episodeSource,
    }, null, 2), 'utf8');

    const liOk = pub.linkedinPosted.filter((p) => p.ok).length;
    const chapterLines = pkg.chapters.map((c) => `  ${c.time}  ${c.title}`).join('\n');
    const clipLines = pkg.clips.map((c) => `  ${c.time}  "${c.quote}"`).join('\n');
    const lines = [
      `✅ Podcast processed: ${pkg.cluster.campaignId}`,
      isRussian && polishedScript
        ? '🌐 Russian voice note → polished English episode (TTS-narrated). Original RU transcript saved in assets. Want your natural voice instead? Reply to the audio with /podcast raw'
        : '',
      `Topic: ${pkg.cluster.topic} | speakers: ${pkg.speakers}${pkg.durationSec ? ` | ~${Math.round(pkg.durationSec / 60)} min` : ''}`,
      '',
      pub.enBlogUrl ? `📰 Show-notes blog: ${pub.enBlogUrl}` : '📰 Blog: (skipped)',
      episodeUrl ? `🎧 Episode live: ${episodeUrl}` : '🎧 Episode audio: saved (enable PODCAST_PUBLISH_ENABLED to push to feed)',
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
