/**
 * Tailored cover-letter drafting for the HIRING lane.
 *
 * Why this exists (31 Aug 2026): every hiring Note carried the same three
 * sentences with the role and company substituted, and a literal
 * "[Edit this stub — add 1–2 proof points…]" instruction left in the body.
 * 185 jobs arrived in 11 days and the letter was identical in all of them, so
 * the draft was never sendable and applying stayed a manual writing job.
 * VJH's Python `ContentGeneratorV2` does tailor, but nothing calls it — it has
 * zero callers and its `cover_letters/` directory has zero files.
 *
 * This wires the drafting into the Node path instead, at the one place every
 * source already funnels through (`buildHiringActionPackage`), so the SerpAPI,
 * vjh_review and response_detector paths all get it without touching the
 * Python pipeline.
 *
 * Three rules it will not break:
 *
 * 1. **The stub is the floor, never the ceiling.** Every failure — no job
 *    description, every provider down, a refusal, a placeholder in the output —
 *    returns `letter: ''` and the caller keeps the existing stub. This can make
 *    the letter better; it can never make the Note worse or block the deal.
 * 2. **It never invents experience.** The model is given a fixed block of
 *    verified facts and told to use only those. A cover letter that claims
 *    unearned experience is a lie sent under Elena's name to a hiring manager,
 *    which is worse than a stub she edits herself.
 * 3. **An untailored letter says so.** The result reports `tailored` and which
 *    provider answered, so a quiet drop back to boilerplate is visible in the
 *    Note rather than discovered months later in the tone of the applications.
 */
import { completeWithProfileDetailed } from './llm-resilience';

/**
 * Elena's operating model, in her approved words (28 Sep 2026). Every letter carries it.
 *
 * Why: the first fact used to read "Builds and operates production AI systems solo", so every
 * letter sold Elena alone and the employer discovered the agents in the interview — a strength
 * that surfaces late reads as something that was hidden. The product is Elena + the AI
 * environment she built, stated up front.
 */
export const OPERATING_MODEL =
  'I operate an AI-native development environment where specialized agents handle much of the ' +
  'implementation execution. I own requirements, architecture, orchestration, evaluation, ' +
  'deployment, monitoring and production decisions.';

/** Verified positioning. EDIT HERE — never let the model invent a claim. */
const VERIFIED_FACTS = `
- Her operating model (quote it verbatim): "${OPERATING_MODEL}"
- That environment runs 15 long-running production services (8 under PM2, 7 under systemd) on one cloud VM, every one set to restart automatically. Counted on the server 28 Sep 2026.
- Designs multi-provider LLM fallback chains (five providers) so a single vendor outage or an exhausted balance cannot take a product down.
- Ships agentic automation end-to-end: Telegram and WhatsApp bots, CRM pipelines, lead triage and scoring, outreach automation, webhook services.
- Specialises in GEO / AEO / technical SEO — making sites and content legible to AI answer engines, measured with a citation probe across multiple engines.
- Writes and operates the observability around her own systems: incident write-ups, verification from production logs rather than configuration.
- Former Deputy CEO; comfortable owning delivery, priorities and stakeholder communication, not only the code.
- Portfolio and live systems: https://aideazz.xyz/portfolio
- CREATIVE (use for film, video, generative-media or creative roles): directs generative AI films end to end, from concept and prompting through edit, mix and release. 8 published films: https://atuona.xyz/aifilmstudio/ . The latest, Crimson Escape, runs 3:36 from 16 generated shots, mastered to -15.7 LUFS.
- CREATIVE: chooses video engines by a bake-off, not habit: the same keyframe and motion run on six models (Wan 2.7, Grok Imagine 1.5, HappyHorse, Veo 3.1 Fast, Kling 3.0 Omni, Seedance 2.5), then each cast by shot type (Wan for emotional close-ups, Grok for wide shots).
- CREATIVE: keeps characters consistent across a film by fixing each lead with one reference portrait and generating every keyframe from it; re-renders a shot when a detail reads wrong on review.
- CREATIVE: built the production machinery behind the films: a bot that drives a dozen video and a dozen image models from one command, with an LLM as director and a pre-render budget cap (Crimson Escape cost about $18 in generation).
- CREATIVE: a poet (pen name Kira Velerevich): 99 poems in Russian and English, 46 published by the LITPROM editorial board; the films are made from them.
`.trim();

const MIN_JD_CHARS = 200;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_JD_CHARS = 6_000;

export interface CoverLetterResult {
  /** The drafted letter, or '' when the caller should keep its stub. */
  letter: string;
  tailored: boolean;
  provider?: string;
  /** How much job-description text actually reached the model. 0 = nothing to tailor to. */
  jdChars: number;
  /** Why it fell back. Present only on failure — surfaced in the Note, not swallowed. */
  reason?: string;
}

/** Strip a job page down to readable text. Best effort; never throws. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'AIdeazz-VJH/1.0 (+https://aideazz.xyz)', accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Greenhouse and Ashby both publish the posting as documented, unauthenticated
 * JSON. Prefer it over scraping the page: Ashby's board is a JS-rendered SPA
 * whose HTML carries ~33 characters of text, so scraping it silently produces a
 * boilerplate letter. These are the boards' own public endpoints — no key, no
 * spoofed user agent.
 */
async function fetchStructured(jobUrl: string): Promise<string> {
  const gh = jobUrl.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?]+)\/jobs\/(\d+)/i);
  if (gh?.[1] && gh[2]) {
    const j = (await getJson(
      `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs/${gh[2]}?content=true`,
    )) as { content?: string; title?: string } | null;
    if (j?.content) return htmlToText(decodeEntities(j.content)).slice(0, MAX_JD_CHARS);
  }

  const ab = jobUrl.match(/jobs\.ashbyhq\.com\/([^/?]+)\/([0-9a-f-]{36})/i);
  if (ab?.[1] && ab[2]) {
    const j = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${ab[1]}`)) as {
      jobs?: { id?: string; descriptionPlain?: string; descriptionHtml?: string }[];
    } | null;
    const post = j?.jobs?.find(p => p.id?.toLowerCase() === ab[2]?.toLowerCase());
    const body = post?.descriptionPlain || (post?.descriptionHtml ? htmlToText(post.descriptionHtml) : '');
    if (body) return body.slice(0, MAX_JD_CHARS);
  }

  return '';
}

/**
 * Fetch the posting so the letter can answer THIS job.
 *
 * Returns '' on any failure. A job board that blocks us is a reason to fall
 * back to the stub, never a reason to fail the deal write — the Note and the
 * apply link are useful even when the letter is boilerplate.
 */
/** Exported 28 Sep 2026: the apply kit tailors the CV and defense note to the same posting text. */
export async function fetchJobDescription(jobUrl?: string): Promise<string> {
  if (!jobUrl || !/^https?:\/\//i.test(jobUrl)) return '';

  const structured = await fetchStructured(jobUrl);
  if (structured.length >= MIN_JD_CHARS) return structured;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(jobUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Identify honestly. Never spoof a browser or a crawler to get access —
        // see the ai-native-builder source decision (29 Aug 2026).
        'user-agent': 'AIdeazz-VJH/1.0 (+https://aideazz.xyz)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) return '';
    return htmlToText(await res.text()).slice(0, MAX_JD_CHARS);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** Placeholders the stub was full of. If the model emits one, it is not sendable. */
function looksUnfinished(text: string): boolean {
  return /\[(edit|insert|add|your|company|role|tbd|todo|xx)/i.test(text) || /\bTODO\b/.test(text);
}

/** A letter that sells her as working alone contradicts the operating model. */
export function describesHerAlone(text: string): boolean {
  return /\b(solo|single-?handed(ly)?|by myself|on my own|all by hand)\b/i.test(text);
}

/**
 * The prompt asks for the operating-model sentence verbatim; this makes it true even when the
 * model paraphrases or drops it. A prompt is a request, the code is the guarantee — so the
 * sentence is inserted as its own paragraph after the opening one when it is missing.
 */
export function ensureOperatingModel(letter: string): string {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (flat(letter).includes(OPERATING_MODEL)) return letter;
  const paras = letter.trim().split(/\n\s*\n/);
  if (paras.length > 1) {
    paras.splice(1, 0, OPERATING_MODEL);
    return paras.join('\n\n');
  }
  const m = letter.match(/^[\s\S]*?[.!?](\s|$)/);
  const head = m ? m[0].trim() : letter.trim();
  const rest = letter.trim().slice(head.length).trim();
  return [head, OPERATING_MODEL, rest].filter(Boolean).join('\n\n');
}

/**
 * Draft a letter for one job. Never throws — failure is `letter: ''`.
 */
export async function generateCoverLetter(input: {
  jobTitle: string;
  company: string;
  jobUrl?: string | undefined;
  score?: number | undefined;
  notes?: string | undefined;
}): Promise<CoverLetterResult> {
  const fetched = await fetchJobDescription(input.jobUrl);
  // The ingest notes sometimes carry the posting text when the URL is unfetchable.
  const context = fetched || (input.notes || '').trim();
  const jdChars = context.length;

  // Refuse to call a tailored letter tailored when there was nothing to tailor
  // against. Generating from the title alone produces confident, generic prose —
  // which is the stub with extra steps, and harder to spot.
  if (jdChars < MIN_JD_CHARS) {
    return {
      letter: '',
      tailored: false,
      jdChars,
      reason: fetched
        ? `job page returned only ${jdChars} chars of text`
        : 'could not read the job posting (blocked, JS-rendered, or no URL)',
    };
  }

  const systemPrompt = [
    'You write job application cover letters for one specific candidate.',
    '',
    'HARD RULES:',
    '- Use ONLY the verified facts supplied about the candidate. Never invent an employer, a metric, a year, a technology or a credential.',
    '- If the job asks for something the candidate does not demonstrably have, do not claim it. Say nothing about it, or name the nearest thing she has actually done.',
    '- Never claim she leads, manages or builds teams, and never name tools, editors or years of experience that are not in the facts.',
    '- No placeholders of any kind. The output is pasted as-is into an application form.',
    '- No flattery about the company, no "I am passionate about", no filler.',
    '- The second paragraph MUST contain her operating-model sentence exactly as given in the facts, word for word. Never describe her as working alone, solo or single-handed, and never apologise for or minimise her use of AI — it is how she works.',
    '',
    'STYLE: 150-220 words. Plain, direct, specific. Four short paragraphs at most.',
    'Open with the role. Then the two or three things from the verified facts that most directly match THIS posting, said concretely. Close with a short availability line.',
    'Sign off exactly as: Best regards,\\nElena Revicheva\\nhttps://aideazz.xyz',
  ].join('\n');

  const userPrompt = [
    `ROLE: ${input.jobTitle}`,
    `COMPANY: ${input.company}`,
    input.jobUrl ? `URL: ${input.jobUrl}` : '',
    '',
    'JOB POSTING:',
    context.slice(0, MAX_JD_CHARS),
    '',
    'VERIFIED FACTS ABOUT THE CANDIDATE (the only source you may draw on):',
    VERIFIED_FACTS,
    '',
    'Write the letter body only. No subject line, no preamble, no commentary.',
  ].filter(Boolean).join('\n');

  try {
    const { text, provider } = await completeWithProfileDetailed(
      'quality',
      systemPrompt,
      userPrompt,
      900,
      'cover-letter',
    );
    const draft = text.trim();
    if (draft.length < 120) {
      return { letter: '', tailored: false, jdChars, reason: `model returned ${draft.length} chars` };
    }
    if (looksUnfinished(draft)) {
      return { letter: '', tailored: false, jdChars, reason: 'model left a placeholder in the draft' };
    }
    if (describesHerAlone(draft)) {
      return { letter: '', tailored: false, jdChars, reason: 'draft described her as working alone' };
    }
    return { letter: ensureOperatingModel(draft), tailored: true, provider, jdChars };
  } catch (e) {
    return {
      letter: '',
      tailored: false,
      jdChars,
      reason: (e instanceof Error ? e.message : String(e)).slice(0, 160),
    };
  }
}
