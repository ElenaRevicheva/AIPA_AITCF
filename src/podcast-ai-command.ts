/**
 * podcast-ai-command.ts — Telegram /podcast_ai command (ADDITIVE, isolated)
 *
 * Usage: /podcast_ai <topic or notes>
 * Flow: Claude writes a spoken episode script -> OpenAI TTS renders the audio ->
 * Speechmatics transcribes that audio (captions/chapters/translation) -> builds the
 * podcast package -> publishes blog + social + (gated) the audio episode to the feed.
 *
 * Speechmatics is used on the generated audio (your requirement: Speechmatics in both
 * the real-voice and AI-narrated paths). 100% isolated logic; one registration line in
 * telegram-bot.ts. Gated behind PODCAST_ENGINE_ENABLED + (for the feed) PODCAST_PUBLISH_ENABLED.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { claudeWithGroqFallback } from './llm-resilience';
import { transcribeAndTranslate } from './speechmatics';
import { buildPodcastPackage } from './podcast-engine';
import { publishVoiceCampaign } from './voice-campaign-publish';
import { publishEpisode } from './podcast-publish';
import { isPodcastEngineEnabled, isPodcastPublishEnabled } from './podcast-command';
import { ttsToMp3 } from './podcast-tts';

const SCRIPT_SYSTEM = `You write spoken podcast scripts for Elena Revicheva, a solo AI founder in Panama (AI-augmented builder). First-person, warm, clear, conversational — it will be read aloud by a single narrator. Short sentences. No headings, no stage directions, no markdown, no emojis. Plain ASCII only. Never invent statistics or facts. 600-900 words.`;

export async function runPodcastAi(ctx: any): Promise<void> {
  try {
    if (!isPodcastEngineEnabled()) {
      await ctx.reply('🎧 Podcast engine is off. Set PODCAST_ENGINE_ENABLED=true to enable.');
      return;
    }
    const text: string = ctx.message?.text || '';
    const topic = text.replace(/^\/podcast_ai(@\w+)?/i, '').trim();
    if (!topic) {
      await ctx.reply('🎧 Usage: /podcast_ai <topic or notes>\nExample: /podcast_ai why solo founders should track attribution not activity');
      return;
    }

    await ctx.reply('✍️ Writing the episode script...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const script = await claudeWithGroqFallback(
      anthropic,
      process.env.PODCAST_ENGINE_MODEL || 'claude-sonnet-4-5-20250929',
      2200,
      SCRIPT_SYSTEM,
      `Write a spoken podcast episode script about: ${topic}`,
      'podcast-ai/script',
    );
    if (!script.trim()) { await ctx.reply('🎧 Could not generate a script. Try a different topic.'); return; }

    await ctx.reply('🔊 Narrating with text-to-speech...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audio = await ttsToMp3(openai, script);

    await ctx.reply('🎙️ Transcribing the narration with Speechmatics (captions + chapters)...');
    const transcribed = await transcribeAndTranslate(audio, 'episode.mp3', { language: 'en', translateTo: ['es'], diarization: true });

    await ctx.reply('✍️ Building show notes, chapters, blog, and social...');
    const pkg = await buildPodcastPackage(anthropic, transcribed, { numSocialPerChannel: 4 });

    await ctx.reply('📡 Publishing blog + social...');
    const pub = await publishVoiceCampaign(pkg.cluster);

    let episodeUrl: string | null = null;
    if (isPodcastPublishEnabled()) {
      try {
        await ctx.reply('🎧 Publishing the episode to your podcast feed...');
        const r = await publishEpisode(
          {
            id: pkg.cluster.campaignId,
            title: pkg.cluster.topic,
            description: pkg.showNotes || pkg.cluster.topic,
            audioBytes: audio.length,
            durationSec: transcribed.durationSec || 0,
            chapters: pkg.chapters,
            ...(pub.enBlogUrl ? { blogUrl: pub.enBlogUrl } : {}),
            source: 'ai',
          },
          audio,
        );
        episodeUrl = r.episodeUrl;
      } catch (e) {
        await ctx.reply(`🎧 (Episode audio publish skipped: ${e instanceof Error ? e.message.slice(0, 120) : 'error'})`);
      }
    }

    const liOk = pub.linkedinPosted.filter((p) => p.ok).length;
    const lines = [
      `✅ AI episode produced: ${pkg.cluster.campaignId}`,
      `Topic: ${pkg.cluster.topic}${transcribed.durationSec ? ` | ~${Math.round(transcribed.durationSec / 60)} min` : ''}`,
      '',
      pub.enBlogUrl ? `📰 Show-notes blog: ${pub.enBlogUrl}` : '',
      episodeUrl ? `🎧 Episode live: ${episodeUrl}` : '🎧 Episode audio: rendered (enable PODCAST_PUBLISH_ENABLED to push to feed)',
      `💼 LinkedIn: ${liOk}/${pub.linkedinPosted.length} queued`,
      '',
      'Note: AI-narrated uses an OpenAI voice. For your authentic voice, use /podcast on a recording.',
    ].filter(Boolean);
    await ctx.reply(lines.join('\n'));
  } catch (e) {
    console.error('[PodcastAI] error:', e);
    try { await ctx.reply(`🎧 AI podcast failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`); } catch { /* ignore */ }
  }
}
