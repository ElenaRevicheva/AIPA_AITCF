/**
 * research-agent.ts — autonomous Claude tool-use loop over Bright Data products.
 *
 * MAY 25 2026 (Web Data UNLOCKED hackathon). Inspired by Stephen Kimoi's
 * lablab tutorial agent (claude-bright-data-research-agent), adapted for
 * production multi-agent use inside the AIdeazz marketing engine.
 *
 * Why this exists (for the operator):
 *   Until now, all Bright Data calls in this repo were hardcoded — cron fires,
 *   we call `bdFetch`, we parse, we save. Claude wasn't actually IN the loop
 *   deciding when to search vs scrape. This module exposes the BD primitives
 *   as Claude tools and lets Claude run the loop itself for ad-hoc research
 *   on prospects, employers, or competitors. The output flows into the same
 *   HubSpot / Telegram / blog plumbing already in place.
 *
 * Three modes, three real goals:
 *   - 'client'     → find/qualify prospects        → push to HubSpot CLIENT pipeline
 *   - 'employer'   → research a hiring target      → push to HubSpot HIRING pipeline
 *   - 'competitor' → competitor SEO/AEO analysis   → suggest blog topics
 *
 * Three tools exposed to Claude:
 *   - bd_serp_search    (Bright Data SERP API — Google live results)
 *   - bd_unlock_url     (Bright Data Web Unlocker — bot-bypass page fetch)
 *   - bd_scrape_browser (Bright Data Scraping Browser — JS-rendered pages)
 *
 * Claude decides which tool to call, how many times, and when to stop.
 * The loop terminates when stop_reason==='end_turn' OR maxToolCalls reached.
 */

import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { isAnthropicCreditExhaustion, groqModel } from './llm-resilience';
import { bdSerpSearch, bdFetch, bdScrapingBrowserFetch, isBrightDataConfigured } from './brightdata-enrich';

export type ResearchMode = 'client' | 'employer' | 'competitor';

export interface ResearchResult {
  query: string;
  mode: ResearchMode;
  ok: boolean;
  report: string;          // Claude's final structured markdown
  toolCalls: number;
  durationMs: number;
  truncatedAt?: 'tool_cap' | 'time_cap';
  error?: string;
  /** Which engine actually wrote the report (the header used to say "claude-sonnet-4-5" even on a fallback). */
  engine?: string;
}

const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: 'bd_serp_search',
    description:
      'Search Google via Bright Data SERP API. Returns up to N organic results with title, link, snippet. ' +
      'Use this to find sources before scraping. Cheap. Prefer over scraping for navigation/discovery.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Google search query (you can include site: operators)' },
        num: { type: 'integer', description: 'Number of results to return (1-10, default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'bd_unlock_url',
    description:
      'Fetch a single web page via Bright Data Web Unlocker. Bypasses bot detection and geo-blocks. ' +
      'Returns the raw page text (markdown-friendly). Use for static or lightly-dynamic pages. Fast and cheap.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Absolute HTTPS URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'bd_scrape_browser',
    description:
      'Fetch a JavaScript-heavy page via Bright Data Scraping Browser (full headless browser with JS execution). ' +
      'Use ONLY when bd_unlock_url returned thin content or you know the page needs JS rendering ' +
      '(e.g. LinkedIn profile detail, SPA dashboards). Slower and more expensive than bd_unlock_url.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Absolute HTTPS URL to render' },
      },
      required: ['url'],
    },
  },
];

const SYSTEM_PROMPTS: Record<ResearchMode, string> = {
  client:
    `You are a B2B prospect-research analyst for a fractional CTO / AI-marketing-engine consultancy (AIdeazz, founder Elena Revicheva).
Your job: research a company to determine if they are a strong CLIENT prospect for fractional CTO / AI marketing services.
Use bd_serp_search to find their website, recent press, hiring pages, and LinkedIn. Use bd_unlock_url for static pages.
Use bd_scrape_browser only for JS-heavy pages where bd_unlock_url returned thin content.

Output a structured markdown report with these sections (omit empty ones, do not invent data):
- **Company:** name + 1-line summary
- **Why they might need us:** specific pain signals (no CTO, recent funding, hiring pace, tech-stack gaps)
- **Decision-maker:** name + role + LinkedIn URL if found
- **Recent signals:** funding, news, hiring (with dates)
- **Pitch angle:** ONE concrete first-message hook tailored to them
- **Verdict:** HOT / WARM / COLD with one-sentence rationale

Be concise. Cite URLs inline as [text](url). Do not hallucinate. If a tool returns nothing useful, say so and move on. Stop after 6-8 tool calls maximum.`,

  // 15 Oct 2026 (Elena): employer mode = the INTERVIEW deep-dive. She runs it only when an interview is booked (LinkedIn,
  // WhatsApp — channels no agent sees); the report is saved on the HIRING deal and hs-deal-prep.cjs puts its facts, its
  // "Careful" lines and its questions into OpenClaw's proof sheet. The numbered headings below are what that parser reads.
  employer:
    `You are researching an EMPLOYER because Elena Revicheva has a job INTERVIEW scheduled with them. Your report becomes the ONLY company knowledge her interview coach may use, so depth and truth matter more than speed.
Research the COMPANY and its PRODUCTS only. Never write anything about Elena, her fit, or advice to her.
Use bd_serp_search to find the official site, product and pricing pages, docs, recent news (last 12 months), funding, founders and leadership, customers, and the job posting.
Use bd_unlock_url (or bd_scrape_browser for JS-heavy pages) to READ the official product, pricing, about and careers pages — do not rely on search snippets alone.
Rules: every fact ends with a source marker like [1] that matches the Sources list. If sources disagree, a figure is only the company's claim, or something is unknown, put it in section 6 — never state it as settled in sections 1–4.
Output EXACTLY this structure, plain text (no markdown, no bold, no # headers), bullets start with "• ":
1. What <Company> is
2. Products (each product: what it does, for whom, how it works, AI or agents inside, plans/pricing if public)
3. Customers, markets and figures (according to the company)
4. Founders, team, funding and milestones
5. Likely interview questions (6-8, specific to this company's products and stage)
6. Careful — what we do NOT know / do not claim
Sources:
[1] https://...
Stop after 8-10 tool calls maximum.`,

  competitor:
    `You are an SEO/AEO competitor-research analyst for the AIdeazz daily blog (Claude-generated articles published to aideazz.xyz + dev.to).
Your job: research a competitor domain to find content gaps Elena's blog should fill.
Use bd_serp_search to see what's ranking for shared keywords. Use bd_unlock_url to scrape their blog index + recent posts.
Use bd_scrape_browser only for JS-heavy blog/landing pages.

Output a structured markdown report with these sections (omit empty ones):
- **Competitor:** domain + positioning
- **Top-ranking content (last 3 months):** titles + URLs + which keyword they rank for
- **Content gaps Elena should fill:** 3-5 concrete blog topic suggestions, each with the keyword + why it's a gap
- **Schema/AEO patterns they use:** FAQPage, HowTo, BlogPosting — anything Elena's blog should match or beat
- **Linkable assets:** any standout pages worth referencing/critiquing in Elena's posts
- **Verdict:** HIGH-PRIORITY-GAP / SOME-GAPS / LOW-PRIORITY with rationale

Be concise. Cite URLs inline. Stop after 5-7 tool calls maximum.`,
};

async function dispatchTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    if (name === 'bd_serp_search') {
      const query = String(input.query || '').trim();
      const num = Math.min(10, Math.max(1, Number(input.num) || 5));
      if (!query) return JSON.stringify({ error: 'empty query' });
      const results = await bdSerpSearch(query, { num });
      return JSON.stringify({ count: results.length, results: results.slice(0, num) });
    }
    if (name === 'bd_unlock_url') {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return JSON.stringify({ error: 'invalid url' });
      const html = await bdFetch(url);
      if (!html) return JSON.stringify({ error: 'fetch returned null' });
      // Strip tags + collapse whitespace for token efficiency
      const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 8000); // cap to ~2k tokens per scrape
      return JSON.stringify({ url, length: text.length, text });
    }
    if (name === 'bd_scrape_browser') {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return JSON.stringify({ error: 'invalid url' });
      const html = await bdScrapingBrowserFetch(url);
      if (!html) return JSON.stringify({ error: 'browser fetch returned null' });
      const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 8000);
      return JSON.stringify({ url, length: text.length, text });
    }
    return JSON.stringify({ error: `unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message?.slice(0, 200) || 'tool error' });
  }
}

/**
 * Perplexity as the research engine when Claude cannot run (15 Oct 2026: Anthropic credit at zero). The old fallback asked
 * Groq to "write the best report you can" from what was gathered — after a credit error on the FIRST call that was nothing,
 * so it wrote a report from no research at all. Perplexity searches the web itself and returns its sources.
 */
async function perplexityReport(system: string, query: string): Promise<{ text: string; engine: string } | null> {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) return null;
  const model = (process.env.RESEARCH_PERPLEXITY_MODEL || 'sonar-pro').trim();
  const sys = system.split('\n').filter((l) => !/bd_|tool calls/i.test(l)).join('\n')
    + '\nSearch the web yourself and read the official pages before writing.';
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 3000,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: `Research target: ${query.trim()}` }] }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!r.ok) { console.warn(`[research-agent] Perplexity ${r.status}: ${(await r.text()).slice(0, 160)}`); return null; }
    const j: any = await r.json();
    let text = String(j?.choices?.[0]?.message?.content || '').replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '').trim();
    if (!text) return null;
    // Perplexity's [n] markers index its citations; list them when the model did not.
    const cites: string[] = (Array.isArray(j?.citations) ? j.citations : (j?.search_results || []).map((s: any) => s?.url)).filter(Boolean);
    if (cites.length && !/^\s*(Sources|Fuentes)\s*:/im.test(text)) text += `\n\nSources:\n${cites.map((u, i) => `[${i + 1}] ${u}`).join('\n')}`;
    if (j?.usage) console.log(`[research-agent] Perplexity ${model} usage ${JSON.stringify(j.usage).slice(0, 200)}`);
    return { text, engine: `perplexity ${model}` };
  } catch (e) {
    console.warn('[research-agent] Perplexity failed:', (e as Error).message?.slice(0, 160));
    return null;
  }
}

export async function runResearchAgent(
  anthropic: Anthropic,
  query: string,
  mode: ResearchMode,
  opts: { maxToolCalls?: number; timeoutMs?: number; model?: string } = {},
): Promise<ResearchResult> {
  const started = Date.now();
  const maxToolCalls = opts.maxToolCalls ?? 8;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const model = opts.model ?? 'claude-sonnet-4-5';

  if (!isBrightDataConfigured()) {
    return {
      query, mode, ok: false, report: 'Bright Data not configured (BRIGHTDATA_API_TOKEN / BRIGHTDATA_ZONE missing). Cannot run research.',
      toolCalls: 0, durationMs: Date.now() - started, error: 'bd_not_configured',
    };
  }

  const system = SYSTEM_PROMPTS[mode];
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Research target: ${query.trim()}\n\nRun your research now using the tools and output the final report.` },
  ];

  let toolCalls = 0;
  let truncatedAt: ResearchResult['truncatedAt'];

  // Tool-use loop
  while (true) {
    if (Date.now() - started > timeoutMs) {
      truncatedAt = 'time_cap';
      break;
    }
    if (toolCalls >= maxToolCalls) {
      truncatedAt = 'tool_cap';
      // Push one final "no more tools, summarize now" nudge
      messages.push({
        role: 'user',
        content: `You have used your tool budget (${maxToolCalls} calls). Stop calling tools and output the final structured report now based on what you have.`,
      });
    }

    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system,
        tools: truncatedAt === 'tool_cap' ? [] : TOOL_DEFS,
        messages,
      });
    } catch (err) {
      if (isAnthropicCreditExhaustion(err)) {
        const groqKey = process.env.GROQ_API_KEY?.trim();
        // Groq can only summarise what the tools already returned — never let it write from nothing.
        if (groqKey && toolCalls > 0) {
          try {
            console.warn('[research-agent] Anthropic credit exhausted mid-loop — Groq single-shot fallback');
            const groq = new Groq({ apiKey: groqKey });
            const gathered = messages
              .slice(0, 12)
              .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
              .join('\n\n')
              .slice(0, 12000);
            const groqResp = await groq.chat.completions.create({
              model: groqModel(),
              messages: [{ role: 'user', content: `${system.split('\n').filter((l) => !/bd_|tool calls/i.test(l)).join('\n')}\n\nBased ONLY on this research gathered so far for "${query}" (mode: ${mode}), write the report in exactly the format above:\n\n${gathered}\n\nReturn the final report now.` }],
              max_tokens: 2048,
              temperature: 0.3,
            });
            const fallbackReport = groqResp.choices[0]?.message?.content?.trim() || '';
            if (fallbackReport) {
              console.warn(`[research-agent] Groq fallback returned ${fallbackReport.length} chars`);
              return { query, mode, ok: true, report: fallbackReport, toolCalls, durationMs: Date.now() - started, truncatedAt: 'tool_cap', error: 'groq_fallback', engine: `groq ${groqModel()} (from ${toolCalls} Bright Data results)` };
            }
          } catch (groqErr) {
            console.error('[research-agent] Groq fallback also failed:', (groqErr as Error).message);
          }
        }
      }
      // Claude unavailable and nothing summarisable gathered → Perplexity researches it whole (searches + sources).
      const px = await perplexityReport(system, query);
      if (px) {
        console.warn(`[research-agent] Claude unavailable — report by ${px.engine} (${px.text.length} chars)`);
        return { query, mode, ok: true, report: px.text, toolCalls, durationMs: Date.now() - started, engine: px.engine };
      }
      return {
        query, mode, ok: false, report: `Claude API error: ${(err as Error).message?.slice(0, 300)}`,
        toolCalls, durationMs: Date.now() - started, error: 'claude_api_error',
      };
    }

    // Append assistant turn (full content block array)
    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'tool_use') {
      // Execute every tool_use block in this turn, collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          toolCalls++;
          const result = await dispatchTool(block.name, block.input as Record<string, any>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // end_turn (or any non-tool-use stop) — extract final text
    const finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n\n')
      .trim();

    const out: ResearchResult = {
      query, mode, ok: true,
      report: finalText || '(empty report — Claude returned no text)',
      toolCalls,
      durationMs: Date.now() - started,
      engine: `${model} + Bright Data`,
    };
    if (truncatedAt) out.truncatedAt = truncatedAt;
    return out;
  }

  // Fell through (shouldn't normally reach here)
  return {
    query, mode, ok: false,
    report: 'Loop exited without final report',
    toolCalls, durationMs: Date.now() - started,
    error: 'loop_exit_without_report',
  };
}
