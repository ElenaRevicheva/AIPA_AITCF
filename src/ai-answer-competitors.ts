/**
 * ai-answer-competitors.ts — who OWNS the answers we are trying to win.
 *
 * `citation-tracker.ts` answers "were we cited?" and the answer has been 0%.
 * A zero tells you nothing about why. This module answers the next question:
 * **when an AI engine answers our buyer's question, whose brands come back?**
 * That turns an un-actionable 0% into a named competitive set — the difference
 * between "we are invisible" and "these eight domains own our category, and
 * here is what they have that we do not".
 *
 * WHY THE AGENT API AND NOT `sonar`
 * `probePerplexity()` in citation-tracker already calls `/chat/completions` with
 * `sonar`, and for its job — one answer plus the URLs it cited — that is the
 * right, cheap call. It is deliberately left alone. This is a different job:
 * we need the model to search, then RETURN A PARSEABLE STRUCTURE rather than
 * prose we would have to regex. That needs `/v1/agent` for two features `sonar`
 * does not offer: an explicit `web_search` tool and `response_format` JSON
 * schema. Using the Agent API to re-do the citation probe would be churn;
 * using it here buys a capability that does not otherwise exist.
 *
 * The key is read from the environment and never logged. A missing key throws
 * rather than returning empty, because this codebase has been bitten twice by
 * a probe that "succeeded" while measuring nothing — see the null-is-not-zero
 * rule in the AI Ops Wiki.
 */

const AGENT_ENDPOINT = 'https://api.perplexity.ai/v1/agent';
const FETCH_TIMEOUT_MS = 120_000;

export interface CompetitorBrand {
  name: string;
  domain: string;
  why_cited: string;
}

export interface CompetitorProbe {
  prompt: string;
  ok: boolean;
  error?: string;
  brands: CompetitorBrand[];
  /** True only when the engine itself reported our domain in the answer. */
  trackedDomainPresent: boolean;
  /** Real URLs the engine searched — evidence, separate from what it claimed. */
  sources: string[];
}

export interface CompetitorRun {
  ranAt: string;
  trackedDomain: string;
  model: string;
  probes: CompetitorProbe[];
  /** Domains ranked by how many of our buyer questions they show up in. */
  leaderboard: Array<{ domain: string; appearances: number; sampleReason: string }>;
  measured: number;
  weAppearedIn: number;
}

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'competitor_visibility',
    schema: {
      type: 'object',
      properties: {
        brands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              domain: { type: 'string' },
              why_cited: { type: 'string' },
            },
            required: ['name', 'domain', 'why_cited'],
            additionalProperties: false,
          },
        },
        tracked_domain_present: { type: 'boolean' },
      },
      required: ['brands', 'tracked_domain_present'],
      additionalProperties: false,
    },
  },
} as const;

/** bare hostname: strip scheme, www and path so counts group correctly. */
function normaliseDomain(raw: string): string {
  return String(raw || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    ?.trim()
    .toLowerCase() ?? '';
}

/** Build the request body. Exported so a --dry-run can print it without spending a call. */
export function buildAgentRequest(prompt: string, trackedDomain: string) {
  const preset = (process.env.COMPETITOR_PPLX_PRESET || 'medium').trim();
  return {
    preset,
    // The docs' own advice: describe the shape in the prompt as well as the
    // schema — schema adherence improves when the model is told twice.
    instructions:
      'You are a competitive-visibility analyst. Search the live web, then answer ONLY with the ' +
      'JSON object described by the schema. List every brand or company an AI assistant would ' +
      'plausibly name in response to the question, with its primary domain and one short reason ' +
      'it earns the citation. Set tracked_domain_present to true only if the tracked domain ' +
      'genuinely appears in what you found.',
    input:
      `Buyer question: "${prompt}"\n\n` +
      `Tracked domain (ours): ${trackedDomain}\n\n` +
      'Return: brands[] (name, domain, why_cited) and tracked_domain_present (boolean).',
    tools: [{ type: 'web_search' }],
    response_format: SCHEMA,
  };
}

async function postAgent(body: unknown, key: string): Promise<any> {
  const res = await fetch(AGENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // 429 carries Retry-After; surface it so a caller can honour it instead of
    // hammering. Never echo the body wholesale — it can contain the prompt.
    const retry = res.headers.get('retry-after');
    throw new Error(
      `HTTP ${res.status}${retry ? ` (retry-after ${retry}s)` : ''}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 120)}`);
  }
}

/** Pull the real searched URLs out of `output` — evidence the model actually looked. */
function extractSources(data: any): string[] {
  const urls = new Set<string>();
  for (const item of data?.output ?? []) {
    for (const r of item?.search_results?.results ?? item?.results ?? []) {
      if (r?.url) urls.add(String(r.url));
    }
  }
  return [...urls];
}

export async function probeCompetitors(
  prompts: string[],
  trackedDomain: string,
): Promise<CompetitorRun> {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) throw new Error('PERPLEXITY_API_KEY not set');

  const probes: CompetitorProbe[] = [];
  for (const prompt of prompts) {
    try {
      const data = await postAgent(buildAgentRequest(prompt, trackedDomain), key);
      const parsed = JSON.parse(String(data?.output_text ?? '{}'));
      const sources = extractSources(data);
      // Trust the engine's own boolean, but verify against the URLs it searched.
      // If it says we are absent and a source URL is ours, the URLs win — a model
      // asserting absence is a claim, a URL is evidence.
      const inSources = sources.some((u) => u.includes(trackedDomain));
      probes.push({
        prompt,
        ok: true,
        brands: Array.isArray(parsed.brands) ? parsed.brands : [],
        trackedDomainPresent: Boolean(parsed.tracked_domain_present) || inSources,
        sources,
      });
    } catch (err) {
      probes.push({
        prompt,
        ok: false,
        error: (err as Error).message,
        brands: [],
        trackedDomainPresent: false,
        sources: [],
      });
    }
  }

  // The leaderboard is built from the URLs the engine actually SEARCHED, not
  // from the brands[] array it claimed. First live run, 27 Aug: search returned
  // 27 real competitor domains per question and brands[] came back empty every
  // time -- the tool call works, the structured field does not populate
  // reliably alongside it. Building the ranking from brands[] threw the whole
  // finding away and printed "none identified" over rich evidence.
  //
  // This is the module's own stated principle applied to its own output: an
  // assertion is a claim, a URL is evidence. brands[] now only ENRICHES a row
  // that the sources already earned.
  const reasons = new Map<string, string>();
  for (const p of probes) {
    for (const b of p.brands) {
      const d = normaliseDomain(b.domain);
      if (d && b.why_cited && !reasons.has(d)) reasons.set(d, b.why_cited);
    }
  }

  const counts = new Map<string, { appearances: number; sampleReason: string }>();
  for (const p of probes) {
    // Count a domain once per question, not once per mention.
    const seen = new Set<string>();
    for (const url of p.sources) {
      const d = normaliseDomain(url);
      // Our own domain is the thing being measured, not a competitor.
      if (!d || seen.has(d) || d.includes(trackedDomain)) continue;
      seen.add(d);
      const cur = counts.get(d) ?? { appearances: 0, sampleReason: reasons.get(d) ?? '' };
      cur.appearances += 1;
      if (!cur.sampleReason && reasons.has(d)) cur.sampleReason = reasons.get(d)!;
      counts.set(d, cur);
    }
  }

  const measured = probes.filter((p) => p.ok).length;
  return {
    ranAt: new Date().toISOString(),
    trackedDomain,
    model: (process.env.COMPETITOR_PPLX_PRESET || 'medium').trim(),
    probes,
    leaderboard: [...counts.entries()]
      .map(([domain, v]) => ({ domain, ...v }))
      .sort((a, b) => b.appearances - a.appearances),
    measured,
    weAppearedIn: probes.filter((p) => p.ok && p.trackedDomainPresent).length,
  };
}

/** One line a human can act on. Says "not measured" when nothing answered. */
export function summarizeCompetitors(run: CompetitorRun): string {
  if (run.measured === 0) {
    return 'Competitor probe did not run — every request failed. This is "not measured", not "no competitors".';
  }
  const top = run.leaderboard.slice(0, 5).map((l) => `${l.domain} (${l.appearances})`).join(' · ');
  return (
    `${run.trackedDomain} named in ${run.weAppearedIn}/${run.measured} AI answers to buyer questions. ` +
    `Domains that own them: ${top || 'none identified'}.`
  );
}
