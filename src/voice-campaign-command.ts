/**
 * voice-campaign-command.ts — Telegram /campaign command (ADDITIVE, isolated)
 *
 * Usage: reply to any voice note (or audio file) with /campaign. The replied audio is
 * turned into a full bilingual, attributed campaign and auto-published.
 *
 * 100% of the logic lives here. telegram-bot.ts only gains ONE import + ONE registration
 * line; no existing handler is modified. Reply-to means the existing voice handler is not
 * touched at all. Gated behind VOICE_ENGINE_ENABLED (default off).
 *
 * Anthropic is created lazily from env so this module imports nothing from telegram-bot.ts.
 */

import Anthropic from '@anthropic-ai/sdk';
import { transcribeAndTranslate } from './speechmatics';
import { buildContentCluster } from './voice-growth-engine';
import { publishVoiceCampaign } from './voice-campaign-publish';

export function isVoiceEngineEnabled(): boolean {
  return process.env.VOICE_ENGINE_ENABLED?.trim().toLowerCase() === 'true';
}

/** Download a Telegram file (voice/audio) to a Buffer. Mirrors the existing grammY voice handler. */
async function downloadTelegramFile(ctx: any, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`file download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Handle /campaign. Expects the command to be a reply to a message containing a voice note
 * or audio file. Self-contained; safe to register with a single line in telegram-bot.ts.
 */
export async function runVoiceCampaign(ctx: any): Promise<void> {
  try {
    if (!isVoiceEngineEnabled()) {
      await ctx.reply('🎙️ Voice campaign engine is off. Set VOICE_ENGINE_ENABLED=true to enable.');
      return;
    }
    const replied = ctx.message?.reply_to_message;
    const voice = replied?.voice || replied?.audio;
    if (!voice?.file_id) {
      await ctx.reply('🎙️ Reply to a voice note (or audio file) with /campaign to turn it into a full bilingual campaign.');
      return;
    }

    await ctx.reply('🎙️ Got it. Transcribing your voice note...');
    const audio = await downloadTelegramFile(ctx, voice.file_id);
    const filename = replied.voice ? 'voice.ogg' : (replied.audio?.file_name || 'audio.mp3');
    const { getPodcastDictionary } = await import('./podcast-dictionary');
    const customDictionary = await getPodcastDictionary().catch(() => [] as string[]);
    const transcribed = await transcribeAndTranslate(audio, filename, { language: 'en', translateTo: ['es'], customDictionary });
    if (!transcribed.transcript.trim()) {
      await ctx.reply('🎙️ Could not get a transcript from that audio. Try again with clearer audio.');
      return;
    }

    await ctx.reply('✍️ Writing your bilingual content cluster (blog EN + ES, LinkedIn, Instagram)...');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cluster = await buildContentCluster(anthropic, transcribed, { numSocialPerChannel: 3 });

    await ctx.reply('📡 Publishing the campaign...');
    const r = await publishVoiceCampaign(cluster);

    const liOk = r.linkedinPosted.filter((p) => p.ok).length;
    const lines = [
      `✅ Campaign live: ${r.campaignId}`,
      `Topic: ${cluster.topic}`,
      '',
      r.enBlogUrl ? `📰 EN blog: ${r.enBlogUrl}` : '📰 EN blog: (skipped)',
      r.devtoUrl ? `   Dev.to: ${r.devtoUrl}` : '',
      `💼 LinkedIn: ${liOk}/${r.linkedinPosted.length} queued (1 now, rest dripped over days)`,
      '',
      `📦 Saved for next step: ES blog${r.deferred.esBlog ? ' ✓' : ''}, ${r.deferred.igAtoms} Instagram captions`,
      `   (${r.savedFile.split(/[\\/]/).pop()})`,
      '',
      'Every link is UTM-tagged → click-throughs flow to HubSpot via your inquiry pipeline.',
    ].filter(Boolean);
    await ctx.reply(lines.join('\n'));
  } catch (e) {
    console.error('[VoiceCampaign] error:', e);
    try { await ctx.reply(`🎙️ Campaign failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`); } catch { /* ignore */ }
  }
}
