/**
 * speechmatics.ts — Speechmatics batch ASR + translation intake (ADDITIVE, net-new)
 *
 * The INTAKE layer of the AIdeazz Voice Growth Engine. One voice note ->
 * transcript (EN, handles accents + EN/ES code-switching) + translation (ES) in a
 * single API call. This is the multiplier Whisper cannot do: speak once, get
 * bilingual raw material for the whole marketing engine.
 *
 * Verified live 2026-05-29 on the AIdeazz_Marketing_Engine key:
 *   EN transcript + ES translation both returned correctly on a real clip.
 *
 * Does NOT touch any existing code path. The existing Groq/OpenAI Whisper transcription
 * in telegram-bot.ts / trello-voice.ts / atuona is untouched and keeps running.
 *
 * Env:
 *   SPEECHMATICS_API_KEY   (required)  Bearer key from docs.speechmatics.com/get-started/authentication
 *   SPEECHMATICS_REGION    (optional)  default "eu1" (validated). Also "us". (eu2 cluster rejects this key.)
 *   SPEECHMATICS_OP        (optional)  operating_point: "enhanced" (default, best accuracy) | "standard"
 */

import * as fs from 'fs';

const DEFAULT_REGION = 'eu1';
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 45; // ~3 min ceiling for typical short notes

function smKey(): string {
  const k = process.env.SPEECHMATICS_API_KEY?.trim();
  if (!k) throw new Error('SPEECHMATICS_API_KEY not set');
  return k;
}

function smBase(): string {
  const region = process.env.SPEECHMATICS_REGION?.trim() || DEFAULT_REGION;
  return `https://${region}.asr.api.speechmatics.com/v2`;
}

function operatingPoint(): string {
  return process.env.SPEECHMATICS_OP?.trim() || 'enhanced';
}

export interface TranscribeOptions {
  /** Spoken/primary language of the audio. Default "en". Use "auto" for language identification. */
  language?: string;
  /** Target languages to translate the transcript into (e.g. ["es"]). Omit/empty for no translation. */
  translateTo?: string[];
  /** Optional domain-specific words to bias recognition (brand names, jargon). */
  customDictionary?: string[];
  /** Enable speaker diarization (who-said-what) for podcasts/interviews. Additive — off by default. */
  diarization?: boolean;
}

/** A timestamped speaker turn — only populated when diarization is requested. */
export interface SpeakerSegment {
  speaker: string;   // e.g. "S1"
  start: number;     // seconds
  end: number;       // seconds
  text: string;
}

export interface TranscribeResult {
  jobId: string;
  /** Plain-text transcript in the spoken language. */
  transcript: string;
  /** Map of target-language code -> translated plain text. Empty if no translation requested. */
  translations: Record<string, string>;
  /** Rough audio duration in seconds, if reported. */
  durationSec?: number;
  /** Speaker-labeled timestamped segments — only present when diarization was requested. */
  segments?: SpeakerSegment[];
}

/** Build the Speechmatics job config JSON. */
function buildConfig(opts: TranscribeOptions): string {
  const language = opts.language || 'en';
  const transcription_config: Record<string, unknown> = {
    language,
    operating_point: operatingPoint(),
  };
  if (language === 'auto') {
    // Elena speaks EN, ES, and RU into the engine. Configurable via env.
    const expected = (process.env.SPEECHMATICS_EXPECTED_LANGS || 'en,es,ru')
      .split(',').map((s) => s.trim()).filter(Boolean);
    transcription_config.language_identification_config = { expected_languages: expected };
  }
  if (opts.customDictionary?.length) {
    transcription_config.additional_vocab = opts.customDictionary.map((w) => ({ content: w }));
  }
  if (opts.diarization) {
    transcription_config.diarization = 'speaker';
  }
  const config: Record<string, unknown> = { type: 'transcription', transcription_config };
  if (opts.translateTo?.length) {
    config.translation_config = { target_languages: opts.translateTo };
  }
  return JSON.stringify(config);
}

/** Submit an audio buffer to Speechmatics, returning the job id. */
async function submitJob(audio: Buffer, filename: string, opts: TranscribeOptions): Promise<string> {
  const form = new FormData();
  // Node 18+ Blob/FormData are global.
  form.append('data_file', new Blob([audio]), filename);
  form.append('config', buildConfig(opts));
  const res = await fetch(`${smBase()}/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${smKey()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Speechmatics submit failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string };
  if (!json.id) throw new Error('Speechmatics submit returned no job id');
  return json.id;
}

async function getStatus(jobId: string): Promise<string> {
  const res = await fetch(`${smBase()}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${smKey()}` },
  });
  if (!res.ok) throw new Error(`Speechmatics status failed ${res.status}`);
  const json = (await res.json()) as { job?: { status?: string; duration?: number } };
  return json.job?.status || 'unknown';
}

interface SmTranscriptResponse {
  job?: { duration?: number };
  results?: Array<{ alternatives?: Array<{ content?: string; speaker?: string }>; type?: string; start_time?: number; end_time?: number }>;
  translations?: Record<string, Array<{ content?: string; type?: string }>>;
}

/** Group word/punctuation results into speaker turns with timestamps (for diarized audio). */
function buildSegments(results: NonNullable<SmTranscriptResponse['results']>): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];
  let cur: SpeakerSegment | null = null;
  for (const r of results) {
    const alt = r.alternatives?.[0];
    const content = alt?.content || '';
    if (!content) continue;
    const speaker = alt?.speaker || 'S1';
    const isPunct = r.type === 'punctuation';
    if (!cur || (!isPunct && speaker !== cur.speaker)) {
      if (cur) segments.push(cur);
      cur = { speaker, start: r.start_time ?? 0, end: r.end_time ?? 0, text: content };
    } else {
      cur.text += isPunct ? content : ' ' + content;
      if (r.end_time !== undefined) cur.end = r.end_time;
    }
  }
  if (cur) segments.push(cur);
  for (const s of segments) s.text = s.text.replace(/\s+([,.;:!?])/g, '$1').trim();
  return segments;
}

/** Reassemble plain text from Speechmatics word/punctuation tokens. */
function joinTokens(tokens: Array<{ content?: string | undefined; type?: string | undefined }>): string {
  let out = '';
  for (const t of tokens) {
    const c = t.content || '';
    if (!c) continue;
    if (t.type === 'punctuation') out += c;
    else out += (out ? ' ' : '') + c;
  }
  return out.replace(/\s+([,.;:!?])/g, '$1').trim();
}

async function getResult(jobId: string, withSegments: boolean): Promise<{ transcript: string; translations: Record<string, string>; durationSec?: number; segments?: SpeakerSegment[] }> {
  const res = await fetch(`${smBase()}/jobs/${jobId}/transcript?format=json-v2`, {
    headers: { Authorization: `Bearer ${smKey()}` },
  });
  if (!res.ok) throw new Error(`Speechmatics transcript fetch failed ${res.status}`);
  const json = (await res.json()) as SmTranscriptResponse;
  const transcript = joinTokens(
    (json.results || []).map((r) => ({ content: r.alternatives?.[0]?.content, type: r.type })),
  );
  const translations: Record<string, string> = {};
  for (const [lang, toks] of Object.entries(json.translations || {})) {
    translations[lang] = joinTokens(toks);
  }
  const result: { transcript: string; translations: Record<string, string>; durationSec?: number; segments?: SpeakerSegment[] } = {
    transcript,
    translations,
  };
  if (json.job?.duration !== undefined) result.durationSec = json.job.duration;
  if (withSegments) result.segments = buildSegments(json.results || []);
  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** End-to-end: submit audio buffer, poll to completion, return transcript + translations. */
export async function transcribeAndTranslate(
  audio: Buffer,
  filename: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const jobId = await submitJob(audio, filename, opts);
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const status = await getStatus(jobId);
    if (status === 'done') {
      const r = await getResult(jobId, !!opts.diarization);
      return { jobId, ...r };
    }
    if (status === 'rejected' || status === 'deleted') {
      throw new Error(`Speechmatics job ${jobId} ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Speechmatics job ${jobId} did not complete within timeout`);
}

/** Convenience: read a local file path and transcribe+translate it. */
export async function transcribeFile(path: string, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
  const audio = fs.readFileSync(path);
  const filename = path.split(/[\\/]/).pop() || 'audio';
  return transcribeAndTranslate(audio, filename, opts);
}

/** Lightweight connectivity/auth check — returns true if the key authorizes against the configured region. */
export async function speechmaticsHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${smBase()}/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${smKey()}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
