/**
 * voice-growth-engine.ts — the ATOMIZER (ADDITIVE, net-new)
 *
 * Turns ONE voice-note transcript (+ its translation) into a fully-attributed,
 * bilingual, omnichannel content cluster — the "GoHighLevel-style" multiplier:
 *
 *   1 voice note  ->  1 EN blog + 1 ES blog + N LinkedIn posts + N IG captions,
 *   each carrying a UNIQUE UTM so HubSpot attribution can tell you which ANGLE,
 *   from which voice note, drove each lead.
 *
 * This module only BUILDS the cluster (pure content generation via the
 * claudeWithGroqFallback resilience helper). Distribution (blog publish + Buffer
 * + HubSpot) is done by the existing, already-live pipelines — wired in a separate
 * gated step. Touches no running code path.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import type { TranscribeResult } from './speechmatics';

const AIDEAZZ_SITE = (process.env.AIDEAZZ_SITE_URL || 'https://aideazz.xyz').replace(/\/$/, '');

export interface SocialAtom {
  channel: 'linkedin' | 'instagram';
  angle: string;       // short slug describing the hook, e.g. "contrarian-take"
  text: string;        // ready-to-post copy (UTM link already appended)
  utm: string;         // the tagged URL embedded in text
}

export interface BlogAtom {
  lang: 'en' | 'es';
  slug: string;
  title: string;
  markdown: string;
  canonicalUrl: string;
  utm: string;
}

export interface ContentCluster {
  campaignId: string;          // voice-{YYYYMMDD}-{topic-slug}
  topic: string;
  sourceTranscript: string;
  blogs: BlogAtom[];
  social: SocialAtom[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
}

/** UTM for a given campaign atom — the attribution backbone. */
export function buildCampaignUtm(opts: {
  slug: string; lang: 'en' | 'es'; source: string; campaignId: string; angle: string;
}): string {
  const path = opts.lang === 'es' ? `/es/blog/${opts.slug}` : `/blog/${opts.slug}`;
  const p = new URLSearchParams({
    utm_source: opts.source,
    utm_medium: 'voice_engine',
    utm_campaign: opts.campaignId,
    utm_content: opts.angle,
  });
  return `${AIDEAZZ_SITE}${path}?${p.toString()}`;
}

function extractJson(raw: string): any {
  // Models sometimes wrap JSON in prose or fences — pull the first {...} block.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced && fenced[1]) ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

const ATOMIZER_SYSTEM = `You are the AIdeazz Voice Growth Engine — a content strategist for a solo AI founder (Elena Revicheva, Panama). She builds multi-agent AI systems with real production constraints. Her audience: technical founders, AI builders, potential clients.

Voice: failure-first, specific, opinionated, evidence over adjectives. Plain ASCII punctuation only (no em-dashes, no smart quotes). No "Excited to share". No hype.

CRITICAL INTEGRITY RULE: NEVER invent statistics, dollar amounts, percentages, dates, client names, or outcomes that are not explicitly stated in the transcript. Elena's brand is honesty and verifiable evidence; fabricated metrics would damage her reputation. If the transcript has no numbers, write compellingly WITHOUT inventing any. Use qualitative specifics and the reader's own situation instead of fake data.

You turn one spoken idea into a coordinated content campaign. Output STRICT JSON only.`;

/**
 * Generate the full bilingual content cluster from a transcript.
 * @param numSocialPerChannel how many distinct-angle social atoms per channel (default 3)
 */
export async function buildContentCluster(
  anthropic: Anthropic,
  source: TranscribeResult,
  opts: { numSocialPerChannel?: number; channels?: Array<'linkedin' | 'instagram'>; model?: string } = {},
): Promise<ContentCluster> {
  const numSocial = opts.numSocialPerChannel ?? 3;
  const channels = opts.channels ?? ['linkedin', 'instagram'];
  const model = opts.model || process.env.VOICE_ENGINE_MODEL || 'claude-sonnet-4-5-20250929';
  const transcriptEN = source.transcript;
  const transcriptES = source.translations['es'] || '';

  const prompt = `Here is a transcript of a voice note from Elena (spoken language English):

"""${transcriptEN}"""

${transcriptES ? `Spanish translation of the same note:\n"""${transcriptES}"""\n` : ''}

Produce a JSON object with this exact shape:
{
  "topic": "<5-8 word topic title>",
  "blog_en": { "title": "<SEO title>", "markdown": "<700-1000 word article, failure-first lead, opinionated, with a '## FAQ' section of 3 Q&A pairs at the end>" },
  "blog_es": { "title": "<native Spanish SEO title, NOT a literal translation>", "markdown": "<same article rewritten natively in Spanish, 700-1000 words, with '## Preguntas frecuentes' section>" },
  "linkedin": [ ${Array.from({ length: numSocial }).map((_, i) => `{ "angle": "<short-kebab-angle-${i + 1}>", "text": "<2-4 sentence LinkedIn post, distinct hook, ending with 3-5 hashtags>" }`).join(', ')} ],
  "instagram": [ ${Array.from({ length: numSocial }).map((_, i) => `{ "angle": "<short-kebab-angle-${i + 1}>", "text": "<punchy IG caption, distinct hook, ending with 5-8 hashtags>" }`).join(', ')} ]
}

Rules:
- Each social atom must use a DIFFERENT angle on the same core idea (contrarian, how-to, story, principle, etc.).
- Do NOT invent any numbers, dollar amounts, percentages, client names, or outcomes not present in the transcript above. This is the most important rule.
- Do NOT put any URL in blog markdown or social text — links are added programmatically.
- Spanish must read as written by a native, not machine-translated.
- Return ONLY the JSON object.`;

  const raw = await claudeWithGroqFallback(anthropic, model, 6000, ATOMIZER_SYSTEM, prompt, 'voice-engine/atomize');
  const parsed = extractJson(raw);

  const topic: string = parsed.topic || 'voice-note';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const topicSlug = slugify(topic);
  const campaignId = `voice-${date}-${topicSlug}`.slice(0, 90);

  const blogs: BlogAtom[] = [];
  const mkBlog = (lang: 'en' | 'es', b: { title: string; markdown: string }): BlogAtom => {
    const slug = slugify(b.title);
    return {
      lang,
      slug,
      title: b.title,
      markdown: b.markdown,
      canonicalUrl: lang === 'es' ? `${AIDEAZZ_SITE}/es/blog/${slug}` : `${AIDEAZZ_SITE}/blog/${slug}`,
      utm: buildCampaignUtm({ slug, lang, source: 'blog', campaignId, angle: 'canonical' }),
    };
  };
  if (parsed.blog_en?.title) blogs.push(mkBlog('en', parsed.blog_en));
  if (parsed.blog_es?.title) blogs.push(mkBlog('es', parsed.blog_es));

  // Each social atom links to the blog of its channel's primary language (EN for LinkedIn, both available).
  const enSlug = blogs.find((b) => b.lang === 'en')?.slug || topicSlug;
  const esSlug = blogs.find((b) => b.lang === 'es')?.slug || topicSlug;

  const social: SocialAtom[] = [];
  for (const channel of channels) {
    const atoms: Array<{ angle: string; text: string }> = parsed[channel] || [];
    for (const a of atoms) {
      const angle = slugify(a.angle || 'angle');
      // LinkedIn -> EN blog; Instagram -> ES blog (broadens Spanish-market reach). Tunable later.
      const lang: 'en' | 'es' = channel === 'instagram' ? 'es' : 'en';
      const slug = lang === 'es' ? esSlug : enSlug;
      const utm = buildCampaignUtm({ slug, lang, source: channel, campaignId, angle });
      social.push({ channel, angle, text: `${a.text.trim()}\n\n${utm}`, utm });
    }
  }

  return { campaignId, topic, sourceTranscript: transcriptEN, blogs, social };
}
