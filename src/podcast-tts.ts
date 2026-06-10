/**
 * podcast-tts.ts — shared OpenAI text-to-speech helper for the podcast engine.
 *
 * Extracted from podcast-ai-command.ts (June 10 2026) so BOTH episode paths can
 * narrate scripts: /podcast_ai (topic -> script -> TTS) and /podcast on a
 * non-English voice note (Russian speech -> polished English script -> TTS).
 * Behavior unchanged: same chunking, same env knobs (PODCAST_TTS_VOICE/MODEL).
 */

import OpenAI from 'openai';

/** Split text into <=maxLen chunks on sentence boundaries (OpenAI TTS caps ~4096 chars/call). */
export function chunkText(text: string, maxLen = 3800): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > maxLen) { if (cur) chunks.push(cur.trim()); cur = s; }
    else cur += (cur ? ' ' : '') + s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export async function ttsToMp3(openai: OpenAI, text: string): Promise<Buffer> {
  const voice = (process.env.PODCAST_TTS_VOICE || 'nova') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  const parts: Buffer[] = [];
  for (const chunk of chunkText(text)) {
    const res = await openai.audio.speech.create({
      model: process.env.PODCAST_TTS_MODEL || 'tts-1',
      voice,
      input: chunk,
      response_format: 'mp3',
    });
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(parts);
}
