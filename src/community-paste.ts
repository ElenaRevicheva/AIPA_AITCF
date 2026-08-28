/**
 * community-paste.ts — the copy buffer is the real interface.
 *
 * Wrapping a draft in HTML `<pre>` inside a metadata card (with a Reddit URL)
 * is what tore the 28 Aug r/AI_UGC_Marketing paste: mobile copy took the first
 * visible sentence, and the POSTED edit then sat the rest next to a link
 * preview that covered "GPT-4 with".
 *
 * Encoding rule: the paste payload is the draft and only the draft. No HTML,
 * no URL, no markers that would get pasted onto Reddit. Long-press Copy on
 * that message, or open the .txt, is the whole reply.
 *
 * Kept separate from community-notify.ts so the encoder can be tested without
 * booting the Oracle pool the store pulls in.
 */

import type { ScoredThread } from './community-listener';
import { draftWarnings } from './community-listener';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function encodePastePayload(draft: string): string {
  return (draft ?? '').replace(/^\uFEFF/, '').trim();
}

export function communityDocumentFilename(source: string, externalId: string): string {
  const safe = `${source}-${externalId}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${safe || 'community'}-reply.txt`;
}

export function buildCommunityCard(thread: ScoredThread, draft: string, opts?: { withButtons?: boolean }): string {
  // Warnings stay on the card. The draft itself does not — stuffing it into a
  // <pre> here is what made mobile copy return a single sentence.
  const warnings = draftWarnings(draft);
  const withButtons = opts?.withButtons !== false;
  return [
    `${thread.latam ? '🌎 LatAm · ' : ''}${esc(thread.channel)} · score ${thread.score}`,
    ``,
    `❓ <b>${esc(thread.title.slice(0, 300))}</b>`,
    `🔗 <a href="${esc(thread.url)}">open the thread</a>`,
    ``,
    `✍️ The next messages are the <b>full</b> reply — long-press Copy on the plain-text one, or open the .txt if anything looks cut off. Paste into the thread, then edit it into your own words.`,
    ...(warnings.length ? ['', ...warnings.map(w => `⚠️ ${esc(w)}`)] : []),
    ``,
    withButtons
      ? `<i>Matched "${esc(thread.matchedQuery)}". The buttons below post nothing — they only record what you did, so this thread stops being offered.</i>`
      : `<i>Matched "${esc(thread.matchedQuery)}". Long-press Copy on the next message, or open the .txt. No logging buttons on this one.</i>`,
  ].join('\n');
}

export function buildPostedConfirmation(input: {
  posted: boolean;
  stamp: string;
  source: string;
  title: string;
  url: string;
}): string {
  // Deliberately no draft here. Putting the reply after the thread URL is what
  // made Telegram draw a Reddit preview over the remaining sentences.
  return [
    `${input.posted ? '✅ POSTED' : '🗑 SKIPPED'} · ${input.stamp} UTC`,
    `${input.source} · ${input.title.slice(0, 200)}`,
    input.url,
  ].join('\n');
}
