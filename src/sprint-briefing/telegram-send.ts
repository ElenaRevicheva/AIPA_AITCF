/** Raw Telegram Bot API — MP3 via sendAudio (OpenAI TTS output). Works from Oracle CTO OR AWS Lambda. */
export async function sendTelegramBriefingAudio(params: {
  botToken: string;
  chatId: number;
  audio: Buffer;
  caption?: string | undefined;
  filename?: string | undefined;
}): Promise<{ ok: boolean; description?: string }> {
  const { botToken, chatId, audio, caption, filename } = params;
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption.slice(0, 1024));
  const blob = new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' });
  form.set('audio', blob, filename || 'sprint-briefing.mp3');

  const url = `https://api.telegram.org/bot${botToken}/sendAudio`;
  const res = await fetch(url, { method: 'POST', body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  return json.description !== undefined
    ? { ok: !!json.ok, description: json.description }
    : { ok: !!json.ok };
}

export async function sendTelegramText(params: {
  botToken: string;
  chatId: number;
  text: string;
}): Promise<void> {
  const url = `https://api.telegram.org/bot${params.botToken}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text.slice(0, 4096),
    }),
  });
}
