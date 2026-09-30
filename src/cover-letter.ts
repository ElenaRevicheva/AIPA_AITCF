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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ROLE DEFENSE (29 Sep 2026, Elena: "profound, not generic, tech savvy but still clear for me").
// The 🛡️ note picks from an 18-answer bank by keyword, so every deal got the same few questions.
// This asks a model which questions THIS posting will raise and answers them from the verified
// facts + the bank ONLY. Guarded in CODE, because the first dry run (gpt-4o-mini) invented
// "I track audience engagement", misstated her budget control and made up a degree requirement:
//   · every answer must quote the evidence line it rests on — verbatim, checked as a substring;
//   · every gap must quote the posting line it answers — verbatim, checked the same way;
//   · a number in an answer that is not in the evidence rejects the draft;
//   · "alone" language or a team-leadership claim rejects the draft.
// Model: ROLE_DEFENSE_MODEL (default gpt-4.1) called directly — the quality chain lands on
// gpt-4o-mini while Claude has no credits, and that is too shallow for this job.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ROLE_PROFILE = `
- I am based in Panama (UTC-5) and work fully remote; US Eastern, Central and Mountain business hours overlap my working day.
- My English is fluent at a professional level; I write and present in English every day.
- I work with APIs, webhooks and JSON daily: every system I run calls HubSpot, Resend, Telegram and other APIs and exchanges JSON.
- I am comfortable working with explicit adult (NSFW) content for creative projects (Elena, 29 Sep 2026).
`.trim();

export interface RoleDefense {
  pitch: string;
  questions: { q: string; why: string; a: string; evidence: string[] }[];
  gaps: { posting_line: string; say: string }[];
}

const numbersIn = (s: string): string[] =>
  (s.match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, ''));

/** Numbers in `text` that do not appear in `evidence`. */
export function ungroundedNumbers(text: string, evidence: string): string[] {
  const allowed = new Set(numbersIn(evidence));
  return [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
}

/** Loose-but-honest substring test: case, spacing, quote and dash styles do not matter; words do. */
export function norm(s: string): string {
  return String(s || '').toLowerCase()
    .replace(/[‘’“”"'`]/g, '').replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9%$.,/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function quotedIn(quote: string, source: string): boolean {
  const src = norm(source);
  const q = norm(quote);
  if (q.length >= 12 && src.includes(q)) return true;
  // A model sometimes re-types a short section label in front of an exact fact ("CREATIVE: directs…").
  // Drop a leading label of up to 60 characters ending in ':' and test the fact itself.
  const m = String(quote || '').match(/^[^:]{1,60}:\s*([\s\S]+)$/);
  const rest = m && m[1] ? norm(m[1]) : '';
  return rest.length >= 12 && src.includes(rest);
}

async function openaiJson(system: string, user: string, modelOverride?: string): Promise<{ text: string; provider: string }> {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  const model = (modelOverride || process.env.ROLE_DEFENSE_MODEL || 'gpt-4.1').trim();
  if (!key) throw new Error('no OPENAI_API_KEY');
  // Reasoning models (gpt-5, o-series) reject `temperature`.
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, ...(reasoning ? {} : { temperature: 0.2 }), response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(reasoning ? 240_000 : 90_000),
  });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`openai ${r.status}: ${j.error?.message || ''}`.slice(0, 160));
  return { text: j.choices?.[0]?.message?.content || '', provider: `openai:${model}` };
}

export async function generateRoleDefense(input: {
  jobTitle: string;
  company: string;
  jd: string;
  bank: string;
}): Promise<{ defense: RoleDefense | null; provider?: string; reason?: string }> {
  const jd = String(input.jd || '').slice(0, MAX_JD_CHARS);
  if (jd.length < MIN_JD_CHARS) return { defense: null, reason: `posting too short (${jd.length} chars)` };
  // Internal routing labels ("CREATIVE (use for …):") are for the letter prompt, not facts to quote.
  // ROLE_PROFILE: plain facts about HER (not projects) that the reviewer otherwise cannot see, so it turned
  // them into false "gaps" ("I haven't committed to overlapping Mountain Time", "I haven't handled JSON").
  // Only the role defense gets them; the letter never volunteers them.
  const evidence = `${VERIFIED_FACTS.replace(/^- CREATIVE[^:]*:\s*/gm, '- ')}\n${ROLE_PROFILE}\n\n${input.bank}`;

  const system = [
    'You prepare a candidate for an interview for ONE specific job. Truth beats polish.',
    'The EVIDENCE is about the candidate; the POSTING is about the job. Never quote the POSTING as evidence. If the evidence cannot answer a question, do not ask that question.',
    'Use ONLY the EVIDENCE about the candidate. Never invent a tool, employer, client, metric, habit, number, year or result.',
    'For every answer, copy into "evidence" the exact sentence(s) from EVIDENCE it rests on, word for word. An answer you cannot back with a verbatim quote must not be written — turn it into a gap instead.',
    'Requirements: list EVERY requirement the POSTING states (requirements, qualifications, "who you are", must-haves), each copied word for word into "posting_line". Never add one the posting does not state. For each, put in "met_by" a verbatim EVIDENCE quote that proves she meets it, or "" if nothing in the evidence clearly does. Be strict: a related skill is not the requirement.',
    'Every number you write must appear in the EVIDENCE. Never claim she leads, manages or builds teams. Never describe her as working alone or solo.',
    'Depth: each answer = what she did, how it works in plain words (the mechanism), the verified result, and what it means for THIS job. 3-5 short sentences.',
    'Clarity: she reads this on a phone before a call. Short sentences, plain words; explain a technical term in a few words the first time.',
    'Everything she will SAY (pitch, answers, gap answers) is in the first person ("I"), never "she".',
    'Return one JSON object only.',
  ].join('\n');
  const user = [
    `JOB: ${input.jobTitle} at ${input.company}`,
    '', 'POSTING:', jd,
    '', 'EVIDENCE ABOUT THE CANDIDATE (the only source):', evidence,
    '',
    'Return: {"pitch": "one sentence, why she fits THIS role, from the evidence",',
    ' "questions": [{"q": "a question THIS posting makes an interviewer ask - name its duty, tool or domain",',
    '   "why": "the posting phrase that triggers it", "a": "her first-person answer", "evidence": ["verbatim quote from EVIDENCE", "..."]}],',
    ' "requirements": [{"posting_line": "verbatim requirement from the POSTING", "met_by": "verbatim EVIDENCE quote, or empty",',
    '   "say": "if not met: her honest first-person line - name the gap plainly, then the nearest real thing she has done"}]}',
    'Give 5 questions, the most specific to this posting first, and every stated requirement.',
  ].join('\n');

  let lastReason = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const u = attempt ? `${user}\n\nYour previous draft was rejected: ${lastReason}. Fix exactly that.` : user;
      let out: { text: string; provider: string };
      try { out = await openaiJson(system, u); }
      catch (oe) {
        // Logged, not swallowed: a silent fallback is how the Mid-Level video posting kept failing on the
        // chain's broken JSON while the real cause (the OpenAI error) was invisible.
        console.warn(`[role-defense] ${String((oe as Error)?.message || oe).slice(0, 200)} — falling back to the quality chain`);
        // 2,400 tokens cut Gemini's JSON off mid-array (29 Sep, OpenAI out of credits) — room for the whole object.
        out = await completeWithProfileDetailed('quality', system, u, 8000, 'role-defense');
      }
      const raw = out.text.trim();
      if (process.env.ROLE_DEBUG) console.log(`[role-defense attempt ${attempt}] ${lastReason}\n${raw.slice(0, 6000)}`);
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as RoleDefense;
      const problems: string[] = [];
      const questions = (j.questions || []).filter((x) => x && x.q && x.a).slice(0, 6).filter((x) => {
        const quotes = (x.evidence || []).filter(Boolean);
        const bad = quotes.filter((qq) => !quotedIn(qq, evidence));
        if (!quotes.length || bad.length) {
          problems.push(`answer "${x.q.slice(0, 50)}" has ${quotes.length ? 'a quote not in the evidence: ' + String(bad[0]).slice(0, 60) : 'no evidence quote'}`);
          return false;
        }
        return true;
      });
      // A requirement counts as MET only when its quote really is in the evidence — code decides, not
      // the model's optimism (gpt-4.1 twice returned "no gaps" for a posting whose first requirement
      // she does not meet). Everything else is a gap, and a gap needs an honest line to say.
      type Req = { posting_line?: string; met_by?: string; say?: string };
      const reqs = ((j as unknown as { requirements?: Req[] }).requirements || []).filter((r) => r && r.posting_line);
      const gaps: { posting_line: string; say: string }[] = [];
      const claimedMet: { line: string; proof: string }[] = [];
      const HONEST = 'Say plainly that I have not done this yet, then name the nearest real thing I have done.';
      for (const r of reqs) {
        const line = String(r.posting_line);
        if (!quotedIn(line, jd)) { problems.push(`requirement "${line.slice(0, 50)}" is not a line of the posting`); continue; }
        if (r.met_by && quotedIn(r.met_by, evidence)) { claimedMet.push({ line, proof: String(r.met_by) }); continue; }
        gaps.push({ posting_line: line, say: String(r.say || HONEST) });
      }
      if (!reqs.length) problems.push('no requirements listed — list every requirement the posting states');
      if (questions.length < (attempt < 2 ? 4 : 3)) { lastReason = `only ${questions.length} grounded answers. ${problems.slice(0, 3).join('; ')}`; continue; }
      // A dropped item is a silent loss (a whole honest gap vanished this way on the first real run):
      // retry with the exact problem; only the last attempt keeps just what verified.
      if (problems.length && attempt < 2) {
        lastReason = `${problems.slice(0, 4).join('; ')}. Quotes must be copied character for character`;
        continue;
      }
      const spoken = [j.pitch || '', ...questions.map((x) => x.a), ...gaps.map((x) => x.say)].join('\n');
      // Claims about HER come only from the evidence. A gap line may also repeat the posting's own numbers
      // ("Stable Diffusion / AUTOMATIC1111", "4 years") — that is naming the requirement, not a claim.
      const badNums = [
        ...ungroundedNumbers([j.pitch || '', ...questions.map((x) => x.a)].join('\n'), evidence),
        ...ungroundedNumbers(gaps.map((x) => x.say).join('\n'), `${evidence}\n${jd}`),
      ];
      if (badNums.length) { lastReason = `numbers not in the evidence: ${badNums.join(', ')}`; continue; }
      if (describesHerAlone(spoken)) { lastReason = 'described her as working alone'; continue; }
      if (/\b(led|lead|leading|managed|managing|built)\s+(a\s+|the\s+|my\s+)?team/i.test(spoken)) { lastReason = 'claimed team leadership'; continue; }

      // INDEPENDENT REVIEW (gpt-5, a reasoning model — not the drafter grading itself). Quotes prove a
      // sentence exists, not that the answer stays inside it: the drafter attached a real quote to "I call
      // for a camera … I always weigh the cost", and marked "a filmmaker first … from somewhere real" as met
      // by "directs generative AI films". The reviewer drops every answer with a claim the evidence does
      // not support, and judges EVERY stated requirement met / not met, writing the honest line for gaps.
      // Nice-to-haves are not requirements: the first real run listed 23 "gaps" on one posting, six of
      // them "…is an advantage". A phone card with 23 warnings is not usable, so they are dropped here.
      const NICE = /\b(advantage|a plus|nice to have|nice-to-have|preferred|bonus|desirable|ideally)\b/i;
      const allReqs = reqs.map((r) => String(r.posting_line)).filter((l) => quotedIn(l, jd) && !NICE.test(l));
      let kept = questions, finalGaps = gaps.filter((g) => !NICE.test(g.posting_line)), reviewer = '';
      try {
        const revSys = [
          'You are a strict reviewer protecting a job candidate from saying anything untrue in an interview.',
          'ANSWERS: an answer is supported only if EVERY claim in it (actions, habits, methods, results) is stated in the EVIDENCE. General reasoning she never evidenced ("I weigh the cost", "I track metrics") is NOT supported.',
          'REQUIREMENTS, two kinds. HARD (years of experience, named software, credentials, seniority level, on-set/agency/client/brand work, a domain, a language level): met only if the EVIDENCE states it explicitly; a related skill is not the requirement. SOFT (a capability, mindset or way of working, e.g. consistency, autonomy, experimentation, owning production end to end, prompting, a portfolio): met when the EVIDENCE shows her actually doing it — including through the ANSWERS you marked supported.',
          'Willingness, availability, time-zone, language and comfort requirements are answered by the EVIDENCE profile lines — mark them met when a profile line covers them. A portfolio or track-record line is met when the EVIDENCE lists published work. Never produce a gap line that runs down her own work ("not high-quality by your standard").',
          'For every requirement NOT met, write "say": what she would SAY out loud, in natural first-person speech: "I haven\'t done X yet. What I have done is Y." — X is the requirement in plain words, Y the nearest real thing from the EVIDENCE. Never "I haven\'t claimed/stated". No number that is not in the EVIDENCE.',
          'Return JSON only.',
        ].join('\n');
        const revUser = `EVIDENCE:\n${evidence}\n\nANSWERS:\n${questions.map((x, i) => `${i}. Q: ${x.q}\n   A: ${x.a}`).join('\n')}\n\nREQUIREMENTS:\n${allReqs.map((l, i) => `${i}. ${l}`).join('\n')}\n\nReturn {"answers":[{"i":0,"supported":true,"unsupported_claim":""}],"requirements":[{"i":0,"met":false,"say":""}]}`;
        let rv: { text: string; provider: string };
        try { rv = await openaiJson(revSys, revUser, (process.env.ROLE_REVIEW_MODEL || 'gpt-5').trim()); }
        catch (re) {
          // Never skip the review silently: fall back to the chain (Gemini when OpenAI has no credits).
          console.warn(`[role-defense] review: ${String((re as Error)?.message || re).slice(0, 120)} — reviewing via the quality chain`);
          rv = await completeWithProfileDetailed('quality', revSys, revUser, 6000, 'role-review');
        }
        reviewer = rv.provider;
        const rj = JSON.parse(rv.text.slice(rv.text.indexOf('{'), rv.text.lastIndexOf('}') + 1)) as {
          answers?: { i: number; supported: boolean; unsupported_claim?: string }[];
          requirements?: { i: number; met: boolean; say?: string }[];
        };
        const dropped = (rj.answers || []).filter((a) => a.supported === false);
        kept = questions.filter((_, i) => !dropped.some((d) => d.i === i));
        if (kept.length < 3) {
          lastReason = `answers made claims the evidence does not support: ${dropped.map((d) => d.unsupported_claim).filter(Boolean).slice(0, 3).join('; ')}. Answer only with what the evidence states`;
          continue;
        }
        // A requirement a supported answer already addresses is met — the answer IS the proof.
        const answered = (l: string) => kept.some((x) => x.why && (quotedIn(x.why, l) || quotedIn(l, x.why)));
        finalGaps = (rj.requirements || []).filter((r) => r.met === false && allReqs[r.i] && !answered(allReqs[r.i] as string))
          .sort((a, b) => a.i - b.i).slice(0, 8).map((r) => {
            const say = String(r.say || HONEST);
            return { posting_line: allReqs[r.i] as string, say: ungroundedNumbers(say, `${evidence}\n${jd}`).length ? HONEST : say };
          });
      } catch { /* reviewer unavailable: keep the mechanically checked draft rather than drop the note */ }
      return { defense: { pitch: String(j.pitch || ''), questions: kept.slice(0, 5), gaps: finalGaps },
        provider: reviewer ? `${out.provider} + review ${reviewer}` : out.provider };
    } catch (e) {
      lastReason = (e instanceof Error ? e.message : String(e)).slice(0, 160);
    }
  }
  return { defense: null, reason: lastReason };
}
