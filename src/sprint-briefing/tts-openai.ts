import OpenAI from 'openai';

/** Uses OpenAI TTS (same OpenAI account / stack path as Whisper + ATUONA audio elsewhere in ecosystem). */
export async function synthesizeBriefingMp3(
  openai: OpenAI,
  narrativePlainText: string,
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
    model: process.env.SPRINT_BRIEFING_TTS_MODEL || 'tts-1',
    voice,
    input: trimmed,
    response_format: 'mp3',
  });
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
