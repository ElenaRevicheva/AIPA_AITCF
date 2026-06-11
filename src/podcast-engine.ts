/**
 * podcast-engine.ts — long-audio repurposing (ADDITIVE, net-new)
 *
 * Turns a podcast episode / interview / X Space / recorded call into a full content package:
 *   - bilingual blog recap + LinkedIn + Instagram atoms (reuses buildContentCluster)
 *   - show notes + key takeaways
 *   - timestamped chapters (from speaker-diarized segments)
 *   - pull-quote clip list (start/end + quote + hook) for video clipping
 *
 * Reuses speechmatics (diarization param) + voice-growth-engine + the publish pipeline.
 * Touches no existing code path.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import type { TranscribeResult, SpeakerSegment } from './speechmatics';
import { buildContentCluster, type ContentCluster } from './voice-growth-engine';

export interface PodcastChapter { time: string; title: string }
export interface PodcastClip { time: string; quote: string; hook: string }

export interface PodcastPackage {
  cluster: ContentCluster;
  showNotes: string;
  keyTakeaways: string[];
  chapters: PodcastChapter[];
  clips: PodcastClip[];
  speakers: number;
  durationSec?: number;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** Escape raw control characters that LLMs (esp. the Groq fallback) sometimes emit
 *  INSIDE string literals — invalid JSON ("Bad control character in string literal").
 *  Whitespace BETWEEN tokens is legal JSON and left untouched: we track in-string
 *  state so only literals are repaired. */
function escapeCtrlInStrings(json: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ''; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

function extractJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced && fenced[1]) ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output');
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Groq/Llama frequently emits literal newlines inside JSON strings — repair + retry.
    return JSON.parse(escapeCtrlInStrings(slice));
  }
}

/** Compact diarized segments into a timestamped digest the model can reason over. */
function segmentDigest(segments: SpeakerSegment[], perSegCap = 280): string {
  return segments
    .map((s) => `[${fmtTime(s.start)}] ${s.speaker}: ${s.text.slice(0, perSegCap)}`)
    .join('\n')
    .slice(0, 14000); // keep prompt bounded for very long episodes
}

const PODCAST_SYSTEM = `You are the AIdeazz Podcast Producer for Elena Revicheva (solo AI founder, Panama). You turn a recorded conversation into publish-ready podcast assets.

Voice: clear, specific, no hype, plain ASCII punctuation only.
CRITICAL: never invent quotes, names, numbers, or facts not present in the transcript. Chapter titles and clip quotes must reflect what was actually said. Quotes must be near-verbatim from the transcript.`;

/**
 * Build the full podcast package. `source` should come from transcribeAndTranslate with
 * diarization:true and translateTo:['es'].
 */
export async function buildPodcastPackage(
  anthropic: Anthropic,
  source: TranscribeResult,
  opts: { numSocialPerChannel?: number; model?: string } = {},
): Promise<PodcastPackage> {
  const model = opts.model || process.env.PODCAST_ENGINE_MODEL || process.env.VOICE_ENGINE_MODEL || 'claude-sonnet-4-5-20250929';

  // 1. Reuse the bilingual content cluster (blog EN+ES + LinkedIn + IG).
  const cluster = await buildContentCluster(anthropic, source, { numSocialPerChannel: opts.numSocialPerChannel ?? 4, model });

  // 2. Podcast-specific assets from the timestamped, diarized segments.
  const segments = source.segments || [];
  const speakers = new Set(segments.map((s) => s.speaker)).size || 1;
  const digest = segments.length
    ? segmentDigest(segments)
    : source.transcript.slice(0, 14000);

  const prompt = `Here is a diarized, timestamped transcript of an audio episode (Sx = speaker labels):

"""${digest}"""

Return a JSON object with this exact shape:
{
  "show_notes": "<2-3 paragraph episode summary in markdown>",
  "key_takeaways": ["<takeaway 1>", "<takeaway 2>", "<takeaway 3>", "<takeaway 4>", "<takeaway 5>"],
  "chapters": [ { "time": "<m:ss from the transcript>", "title": "<chapter title>" } ],
  "clips": [ { "time": "<m:ss>", "quote": "<near-verbatim punchy quote from that moment>", "hook": "<one line on why this clip works>" } ]
}

Rules:
- 4-8 chapters, in chronological order, times taken from the [timestamps] in the transcript.
- 3-5 clips: the most quotable, shareable moments, quote near-verbatim from the transcript.
- Do NOT invent anything not in the transcript.
- Return ONLY the JSON object.`;

  const raw = await claudeWithGroqFallback(anthropic, model, 4000, PODCAST_SYSTEM, prompt, 'podcast/assets');
  const parsed = extractJson(raw);

  const pkg: PodcastPackage = {
    cluster,
    showNotes: typeof parsed.show_notes === 'string' ? parsed.show_notes : '',
    keyTakeaways: Array.isArray(parsed.key_takeaways) ? parsed.key_takeaways.slice(0, 8) : [],
    chapters: Array.isArray(parsed.chapters) ? parsed.chapters.slice(0, 12) : [],
    clips: Array.isArray(parsed.clips) ? parsed.clips.slice(0, 8) : [],
    speakers,
  };
  if (source.durationSec !== undefined) pkg.durationSec = source.durationSec;
  return pkg;
}
