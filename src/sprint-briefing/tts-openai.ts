import OpenAI from 'openai';

/** Uses OpenAI TTS (same OpenAI account / stack path as Whisper + ATUONA audio elsewhere in ecosystem). */
export async function synthesizeBriefingMp3(
  openai: OpenAI,
  narrativePlainText: string,
  // 14 Oct 2026: the Telegram bot speaks its replies with this same voice — a voice note wants Opus,
  // and the model is chosen by the caller (tts-1 since 15 Oct 2026 — gpt-4o-mini-tts stalled; both read Spanish well).
  opts: { model?: string; format?: 'mp3' | 'opus' } = {},
): Promise<Buffer> {
  const voice = (process.env.SPRINT_BRIEFING_TTS_VOICE || 'nova') as
    | 'alloy'
    | 'echo'
    | 'fable'
    | 'onyx'
    | 'nova'
    | 'shimmer';
  const trimmed = narrativePlainText.slice(0, 4096);
  const res = await openai.audio.speech.create({
    model: opts.model || process.env.SPRINT_BRIEFING_TTS_MODEL || 'tts-1',
    voice,
    input: trimmed,
    response_format: opts.format || 'mp3',
  });
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
