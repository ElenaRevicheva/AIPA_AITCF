/**
 * llm-fanout.ts — ask SEVERAL search-grounded engines the SAME question IN PARALLEL,
 * keep every answer with its sources, and let the caller compare them.
 *
 * THE SIBLING OF THE WATERFALL — NOT A REPLACEMENT (10 Nov 2026)
 * ----------------------------------------------------------------------------
 * `llm-resilience.ts` is a FAILOVER chain: try one provider, on silence try the
 * next, return the FIRST real answer. Right for a chat reply or a classifier,
 * where one good answer is the goal.
 *
 * Research is the opposite job. One engine's blind spot is another's find, so
 * every engine must answer independently and the answers are compared
 * (agreement, conflicts, which sources each one actually retrieved). That is a
 * FAN-OUT, or ensemble. First built for a private client research engagement (Nov 2026):
 * several grounded researchers per question + a cross-checker.
 *
 *   waterfall (llm-resilience)        fan-out (this file)
 *   one engine at a time              all chosen engines at once
 *   stops at the first answer         waits for every engine (answer or failure)
 *   returns one text                  returns every text + sources + usage
 *
 * Use it for: multi-source research, fact cross-checks, comparing how AI engines
 * answer a buyer question, any "several independent opinions" job.
 * Do NOT use it for a single reply — that is the waterfall's job.
 *
 * Rules carried over from the fleet:
 *  - Model ids come from the caller or the environment (FANOUT_<ENGINE>_MODEL), never literals.
 *  - Claude obeys the cost rule: it joins the fan-out only when MODEL_TIER is not
 *    `free`, or when the caller deliberately passes `allowPaidClaude: true`.
 *  - An empty wallet fails at once with "NO CREDIT" (a 402/429 for no credit cannot
 *    be fixed by waiting); a real rate limit (429) waits and retries.
 *  - An engine that answered WITHOUT retrieving any source is flagged `grounded:false`:
 *    links it wrote from memory are leads, never evidence.
 *
 * The request shapes match those proven in production:
 *  Gemini google_search grounding + redirect resolution (citation-tracker.ts),
 *  Perplexity search_results/citations (citation-tracker.ts, research-agent.ts),
 *  OpenAI/xAI Responses + web_search, Claude web_search tool.
 */

import { freeTier } from './llm-resilience';

export type FanoutEngine = 'perplexity' | 'openai' | 'gemini' | 'grok' | 'claude';

export interface FanoutSource {
  url: string;
  title?: string;
  date?: string;
}

export interface FanoutAnswer {
  engine: FanoutEngine;
  model: string;
  ok: boolean;
  /** true when the engine retrieved at least one source; false = answered from memory. */
  grounded: boolean;
  text: string;
  sources: FanoutSource[];
  /** Raw provider usage object (tokens; Perplexity also reports exact cost). */
  usage?: unknown;
  ms: number;
  error?: string;
}

export interface FanoutOptions {
  engines: FanoutEngine[];
  /** Per-engine model id; falls back to env FANOUT_<ENGINE>_MODEL. Required one way or the other. */
  models?: Partial<Record<FanoutEngine, string>>;
  /** Optional system/instructions text for every engine. */
  system?: string;
  /** Per-call timeout (deep-research calls can take several minutes). Default 20 min. */
  timeoutMs?: number;
  /** Claude is paid; run it on the free tier only when the caller says so. */
  allowPaidClaude?: boolean;
  /** Perplexity deep research: reasoning effort. */
  perplexityReasoning?: 'low' | 'medium' | 'high';
  /** OpenAI Responses: reasoning effort. */
  openaiReasoning?: 'low' | 'medium' | 'high';
  /** Claude web_search max uses (default 8). */
  claudeMaxSearches?: number;
  /** Max output tokens where the API takes one (default 16000). */
  maxTokens?: number;
  /** Turn web search OFF (claude/openai only), e.g. a summary that must use only facts already given. */
  noSearch?: boolean;
  /** Progress callback, e.g. for a log line per engine. */
  onResult?: (a: FanoutAnswer) => void;
}

const NO_CREDIT =
  /insufficient_quota|credit_balance|credits? (are )?depleted|no credits|credit balance is too low|used all available credits|monthly spend/i;

function envModel(engine: FanoutEngine): string | undefined {
  return process.env[`FANOUT_${engine.toUpperCase()}_MODEL`]?.trim() || undefined;
}

async function postOnce(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** A 429 means "wait" — unless it is an empty wallet, which waiting cannot fix. */
async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce(url, headers, body, timeoutMs);
    } catch (e) {
      const msg = String((e as Error).message || e);
      if (NO_CREDIT.test(msg)) throw new Error(`NO CREDIT at ${new URL(url).host}: top up, then re-run`);
      if (!/^429 /.test(msg) || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
    }
  }
}

function addSource(list: FanoutSource[], s: FanoutSource): void {
  if (s.url && !list.some((x) => x.url === s.url)) list.push(s);
}

/** Gemini grounding URIs are Google redirect links; resolve to the destination (best-effort). */
async function resolveRedirect(uri: string): Promise<string> {
  try {
    const r = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    return r.headers.get('location') || uri;
  } catch {
    return uri;
  }
}

type Runner = (prompt: string, model: string, o: FanoutOptions) => Promise<Pick<FanoutAnswer, 'text' | 'sources' | 'usage'>>;

const RUNNERS: Record<FanoutEngine, Runner> = {
  async perplexity(prompt, model, o) {
    const key = process.env.PERPLEXITY_API_KEY?.trim();
    if (!key) throw new Error('PERPLEXITY_API_KEY not set');
    const messages = [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content: prompt }];
    const j = await post('https://api.perplexity.ai/chat/completions', { Authorization: `Bearer ${key}` }, {
      model, messages,
      ...(/deep-research/.test(model) ? { reasoning_effort: o.perplexityReasoning ?? 'high' } : {}),
      web_search_options: { search_context_size: 'high' },
    }, o.timeoutMs ?? 20 * 60_000);
    const text = String(j?.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const sources: FanoutSource[] = [];
    for (const s of j?.search_results ?? []) addSource(sources, { url: String(s.url), title: s.title, date: s.date });
    for (const u of j?.citations ?? []) if (typeof u === 'string') addSource(sources, { url: u });
    return { text, sources, usage: j?.usage };
  },

  async openai(prompt, model, o) {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const j = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, {
      model, input: prompt, ...(o.system ? { instructions: o.system } : {}),
      ...(o.noSearch ? {} : { tools: [{ type: 'web_search' }] }), reasoning: { effort: o.openaiReasoning ?? 'high' },
    }, o.timeoutMs ?? 20 * 60_000);
    let text = '';
    const sources: FanoutSource[] = [];
    for (const item of j?.output ?? []) {
      if (item?.type !== 'message') continue;
      for (const c of item.content ?? []) {
        if (c?.type !== 'output_text') continue;
        text += c.text;
        for (const a of c.annotations ?? []) if (a?.type === 'url_citation') addSource(sources, { url: String(a.url), title: a.title });
      }
    }
    return { text: text.trim(), sources, usage: j?.usage };
  },

  async gemini(prompt, model, o) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error('GEMINI_API_KEY not set');
    const j = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {},
      {
        ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: `Use Google Search before answering; cite only pages you retrieved.\n\n${prompt}` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: o.maxTokens ?? 16000 },
      },
      o.timeoutMs ?? 20 * 60_000,
    );
    const cand = j?.candidates?.[0] ?? {};
    const text = (cand.content?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim();
    const sources: FanoutSource[] = [];
    for (const c of cand.groundingMetadata?.groundingChunks ?? []) {
      if (c?.web?.uri) addSource(sources, { url: await resolveRedirect(String(c.web.uri)), title: c.web.title });
    }
    return { text, sources, usage: j?.usageMetadata };
  },

  async grok(prompt, model, o) {
    const key = process.env.XAI_API_KEY?.trim();
    if (!key) throw new Error('XAI_API_KEY not set');
    const j = await post('https://api.x.ai/v1/responses', { Authorization: `Bearer ${key}` }, {
      model, input: prompt, ...(o.system ? { instructions: o.system } : {}), tools: [{ type: 'web_search' }],
    }, o.timeoutMs ?? 20 * 60_000);
    let text = '';
    const sources: FanoutSource[] = [];
    for (const item of j?.output ?? []) for (const c of item?.content ?? []) {
      if (c?.type !== 'output_text') continue;
      text += c.text;
      for (const a of c.annotations ?? []) if (a?.url) addSource(sources, { url: String(a.url), title: a.title });
    }
    return { text: text.trim(), sources, usage: j?.usage };
  },

  async claude(prompt, model, o) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    const url = 'https://api.anthropic.com/v1/messages'; // tier-gated: fanOut() admits claude only when !freeTier() or allowPaidClaude
    const j = await post(url, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
      model, max_tokens: o.maxTokens ?? 16000, ...(o.system ? { system: o.system } : {}),
      messages: [{ role: 'user', content: prompt }],
      ...(o.noSearch ? {} : { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: o.claudeMaxSearches ?? 8 }] }),
    }, o.timeoutMs ?? 20 * 60_000);
    const text = (j?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('').trim();
    const sources: FanoutSource[] = [];
    for (const b of j?.content ?? []) {
      if (b?.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.url) addSource(sources, { url: String(r.url), title: r.title, date: r.page_age });
      }
      for (const cit of b?.citations ?? []) if (cit?.url) addSource(sources, { url: String(cit.url), title: cit.title });
    }
    return { text, sources, usage: j?.usage };
  },
};

/**
 * Ask every chosen engine the same prompt at once. Never throws for one engine's
 * failure — each answer carries `ok`/`error`, so a run with three working engines
 * out of four is still a usable result (and says which one was missing).
 */
export async function fanOut(prompt: string, opts: FanoutOptions): Promise<FanoutAnswer[]> {
  const engines = opts.engines.filter((e) => e !== 'claude' || opts.allowPaidClaude || !freeTier());
  const skipped = opts.engines.filter((e) => !engines.includes(e));
  const results = await Promise.all(engines.map(async (engine): Promise<FanoutAnswer> => {
    const model = opts.models?.[engine] || envModel(engine);
    const t0 = Date.now();
    let a: FanoutAnswer;
    if (!model) {
      a = { engine, model: '', ok: false, grounded: false, text: '', sources: [], ms: 0, error: `no model id (pass models.${engine} or set FANOUT_${engine.toUpperCase()}_MODEL)` };
    } else {
      try {
        const r = await RUNNERS[engine](prompt, model, opts);
        if (!r.text) throw new Error('empty answer');
        a = { engine, model, ok: true, grounded: r.sources.length > 0 || !!opts.noSearch, text: r.text, sources: r.sources, usage: r.usage, ms: Date.now() - t0 };
      } catch (e) {
        a = { engine, model, ok: false, grounded: false, text: '', sources: [], ms: Date.now() - t0, error: String((e as Error).message || e).slice(0, 300) };
      }
    }
    opts.onResult?.(a);
    return a;
  }));
  for (const engine of skipped) {
    const a: FanoutAnswer = { engine, model: '', ok: false, grounded: false, text: '', sources: [], ms: 0, error: 'skipped: MODEL_TIER=free (pass allowPaidClaude to include Claude)' };
    opts.onResult?.(a);
    results.push(a);
  }
  return results;
}

/** Bundle successful answers for a cross-checker, labelling ungrounded ones as leads only. */
export function bundleForCrossCheck(answers: FanoutAnswer[]): string {
  return answers.filter((a) => a.ok).map((a) => [
    `=== ENGINE: ${a.engine} (${a.model})`,
    ...(a.grounded ? [] : ['⚠️ UNGROUNDED: this engine did NOT retrieve any source; URLs in its text were written from memory and are unverified leads only. Never keep a claim on this engine alone.']),
    a.text,
    '--- sources:',
    ...a.sources.map((s, i) => `(${i + 1}) ${s.title ?? ''} ${s.url} ${s.date ?? ''}`.trim()),
  ].join('\n')).join('\n\n');
}
