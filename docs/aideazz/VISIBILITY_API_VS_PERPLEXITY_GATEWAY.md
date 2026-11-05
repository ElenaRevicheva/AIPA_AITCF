# AIdeazz `/api` vs Perplexity Gateway — evaluation (27 Aug 2026)

**Question:** does it make sense to enhance `https://aideazz.xyz/api` so it works like
Perplexity's router/gateway API (`https://docs.perplexity.ai/docs/gateway/quickstart`)?

**Answer: no.** They are different products. Copying the gateway shape would burn the
thing that makes `/api` valuable (a $0, deterministic, evidence-backed score) and
enter a market where we have no moat. The useful next step already exists in this
repo and is correctly kept *off* the public demo key: live citation measurement.

This is a decision record, not a build plan. Nothing here authorises a deploy.

---

## 1. What `/api` actually is

Three layers, two hosts, one job.

```
Buyer browser
  │
  ├─ GET  https://aideazz.xyz/api          4everland SPA (LabApi.tsx)
  │         POST ─────────────────────────┐
  │                                       ▼
  └─ GET  https://webhook.aideazz.xyz/cto/v1/visibility   (ugly docs + try-it)
            POST ──► nginx /cto/ ──► cto-aipa Express
                         visibilityRouter()
                         POST /v1/visibility { url }
                              │
                              ▼
                         runVisibilityAudit(url)     engine 1.2.0
                         parallel fetch:
                           page + robots.txt + llms.txt + sitemap.xml
                         34 presence/shape checks, 4 weighted categories
                         JSON: score, grade, verdict, engines, checks, topFixes
                              │
                              ▼
                         logAuditLead → Telegram (unless own domain)
```

| Surface | Host | Role |
|---|---|---|
| Money page | `aideazz.xyz/api` | Lead magnet. Pretty widget. CTA into the portfolio inquiry form. |
| Engine | `webhook.aideazz.xyz/cto/v1/visibility` | The actual API. Mounted on `cto-aipa` at `visibilityRouter()`. |
| Companion | `GET /v1/citations` | Did engines *cite* us? Read-only trend. |
| Owner-only | `POST /v1/citations/run` | Spends SerpAPI / OpenAI / Perplexity / Gemini credit. Demo key is refused. |

The public contract is one POST:

```http
POST /cto/v1/visibility
X-API-Key: aidz_demo_visibility_2026
{ "url": "https://example.com" }
```

Auth is a published demo key (20/hour) plus production keys (500/hour) and
`aidz_owner_*` (5000/hour). CORS is fully open so the 4everland page can call Oracle
cross-origin. Audits are **direct page reads only** — the file header in
`src/visibility-audit.ts` is the product constraint, not a comment:

> Everything here runs on DIRECT page fetches — zero SerpAPI / Bright Data spend.
> That is deliberate: the free tier must cost nothing per call so the live demo
> can stay public.

### What one call measures

34 checks, counted from the running engine on 27 Aug 2026:

| Category | Weight | Checks | Question it answers |
|---|---|---|---|
| AI Crawler Access | 25 | 11 | Can GPTBot / ClaudeBot / PerplexityBot / Google-Extended even reach `/`? |
| Structured Data (GEO) | 25 | 8 | Can a machine tell WHO this is and WHAT they offer? |
| Answer-Readiness (AEO) | 30 | 8 | Will an answer engine have a chunk it can quote? |
| Technical Foundation | 20 | 7 | HTTPS, speed, SSR, viewport, alt, no meta-refresh |

Scoring: pass = 1, warn = 0.5, fail = 0, averaged inside the category, then weighted.
`impact` (`high`/`medium`/`low`) sorts `topFixes`. It does **not** change the score.
A missing `lang=` and a missing Organization JSON-LD cost the same points inside GEO.

Verified locally against `https://github.com/ElenaRevicheva/aideazz` (GitHub is on
this VM's allowlist; `aideazz.xyz` is not): **34 checks, grade A, 88/100, 612 ms**.
GEO was the weak category (GitHub repo pages are not an Organization entity). That
is the engine behaving correctly, not a bug.

### What one call does *not* measure

The audit scores **citability**. It does not ask ChatGPT, Perplexity, Claude or
Gemini a buyer question and look at the sources they attached. That is
`src/citation-tracker.ts`, and it is a different product:

- Four engines: Google AI Overview, Gemini grounded, OpenAI search, Perplexity sonar.
- Buyer-intent prompts, not vanity queries.
- `"not measured"` and `"not cited"` are different answers and must never be mixed.
- Every probe spends real upstream credit, so `POST /v1/citations/run` requires an
  owner key and answers `202` so nginx's 60s timeout cannot turn a success into a 504.

The money-page copy says "can ChatGPT quote you?". The engine answers "would a
crawler *be able to* quote you?". That gap is documented in the GEO roadmap and
is already closed for *our* domain. It is not closed for a prospect's domain on
the free widget, on purpose.

---

## 2. What Perplexity Gateway actually is

Perplexity's public API (cookbook `ppl-ai/api-cookbook`, current as of this
evaluation) is a **hosted search-agent platform**:

- Primary product is now the **Agent API** (web access, citations, code execution,
  subagents, long-running work).
- The older **Sonar** `/chat/completions` path is deprecated; they tell new
  projects to migrate.
- Developer DX is OpenAI-SDK drop-in: set `base_url` to `https://api.perplexity.ai`,
  keep using `chat.completions.create`, pick a model (`sonar`, `sonar-pro`, …).
- Responses are generative, streamed, grounded in a live web index, and billed
  per request.
- The "gateway / router" shape is: one endpoint, many models, the platform picks
  or the caller names a model, the SDK does not change.

That is the same category as OpenRouter, LiteLLM, Portkey, Helicone: **metered
token routing with extra retrieval**. The unit of value is "an answer, with
sources, right now". The unit of cost is tokens + search.

We already have the *internal* half of that pattern, and it is not the visibility
API. `src/llm-resilience.ts` is a five-provider waterfall with three chain
profiles (`quality` / `classify` / `bulk`) so a one-word classifier does not hit
Claude Opus and a customer-facing draft does not fall through to whatever happened
to be free. That router keeps the fleet alive. It is not a product, and
productising it would put our production keys on the public internet.

---

## 3. Side-by-side

| | AIdeazz `/api` | Perplexity Gateway / Agent API |
|---|---|---|
| Job | Diagnose one URL for AI-crawler citability | Answer a question from the live web |
| I/O | `{ url }` → structured score + evidence | `messages[]` → streamed prose + citations |
| Determinism | Same page → same checks (regex, HTTP) | Same prompt → different answer |
| Marginal cost | ~0 (four GETs from Oracle) | Tokens + search, every call |
| Auth | Published demo key, rate-limited | Paid key, usage billed |
| Moat | The 34-check rubric + the lead capture | Index + models + capital |
| Buyer | Panama/LatAm owner who just learned ChatGPT cannot see them | Developer wiring an agent |
| Success metric | They book a 15-minute call | They keep sending tokens |

The resemblance is cosmetic: both are "an API about AI search" on a docs page with
a try-it widget. Underneath, one is a **thermometer** and the other is a
**conversation**. Wiring a thermometer to speak in chat-completions format does
not make it a doctor, and it does make the reading expensive.

---

## 4. What would break if we "enhanced it like the gateway"

1. **The free tier dies.** The demo is public *because* an audit is four HTTP GETs.
   Putting a Perplexity (or OpenAI, or Agent API) hop on the hot path means every
   visitor to `/api` spends money we cannot reclaim. The published demo key would
   become a funded proxy. We already refuse that for citations: owner key only.

2. **The score stops being a score.** A gateway answer is generated. A generated
   "your site is a B because…" cannot be reproduced, cannot be shown to a buyer as
   evidence, and cannot be used in outreach ("I measured 82/100 on 27 Aug"). The
   selling motion in `MANUAL_PROSPECT_PLAY.md` depends on a number we can re-run.

3. **We enter a commodity market with no index.** OpenRouter, LiteLLM, Portkey,
   and Perplexity itself already sell "one SDK, many models, citations". We do not
   have an index. We do not have spare GPU. We do have production Anthropic /
   OpenAI / Gemini / Groq / xAI keys that the rest of the fleet needs.

4. **The money page's identity splits.** `/api` is the *tool* page in the citation
   tracker (`CITATION_PRIMARY_PATH=/portfolio,/api,/ai-ops-wiki.html`). Tool queries
   ("free AEO audit API") are a race `/api` can win. "OpenAI-compatible LLM router"
   is a race it cannot. Mixing them is the same class of bug as serving homepage
   identity on `/portfolio`: two products, one URL, crawlers cite neither clearly.

5. **Lead quality drops.** Today every audit is a self-qualified lead (they typed
   their own domain). A chat gateway attracts developers who want cheap tokens, not
   owners who want to be found by ChatGPT. Telegram already pings on each non-own
   audit. Flooding that channel with SDK traffic is how a lead magnet becomes noise.

---

## 5. What *is* worth stealing — and what already exists

Steal the DX, not the category.

| Perplexity pattern | Fit for `/api` | Verdict |
|---|---|---|
| Try-it widget on the docs page | Already on both UIs | Keep |
| OpenAI-SDK drop-in (`base_url` + `chat.completions`) | Wrong I/O shape | Do not |
| Model router / agent with subagents | Internal, in `llm-resilience.ts` | Do not expose |
| Citations attached to the answer | We have this as `citation-tracker` | Keep owner-only; productise later as a **paid** add-on for the *prospect's* domain |
| Streaming | Audit returns in ~0.5–4 s | Theatre. Skip |
| OpenAPI spec + versioned errors | We have typed JSON and error codes, no spec file | Cheap yes, later |
| "not measured" ≠ "not cited" | Already a hard rule in the tracker | Keep |

Three real gaps in *this* product, none of which is "become a gateway":

1. **The pretty page hides the evidence.** `aideazz.xyz/api` (`LabApi.tsx`) renders
   score, engines, category bars and top fixes. It does **not** render the 34
   checks. The webhook docs page does. A buyer who lands on the money page never
   sees the evidence the outreach message claims exists.

2. **`impact` does not affect the score.** A blocked GPTBot and a missing `lang`
   attribute do not cost the same in the real world. They cost the same inside a
   category. Fixing that is a rubric change, not a platform change.

3. **`robots.txt` is evaluated at `/` only**, and only for `Disallow: /` or `/*`.
   A site that blocks `/blog` for GPTBot still looks crawlable if you audit the
   homepage. Path-aware robots is the highest-leverage engine change, still $0
   per call.

The honest paid upgrade, when a buyer asks for it: **live citation probe for
their domain**, wrapping `runCitationProbes()` with their URL in the prompt set.
That is "like Perplexity" in the only way that matters — it asks the engines —
and it is already built, already cost-gated, already careful about measurement
vs. absence. It does not belong on the demo key.

---

## 6. Recommendation

Do not turn `/api` into a Perplexity-style gateway.

Keep the public audit a thermometer: four fetches, 34 checks, a number a buyer
can re-run. Keep the LLM waterfall private. Keep citation probes owner-only until
there is a priced SKU.

If this page is enhanced, enhance it as an AEO instrument:

1. Show all 34 checks on `aideazz.xyz/api` (parity with the webhook docs page).
2. Path-aware `robots.txt` and impact-weighted scoring.
3. A paid "does ChatGPT actually cite *you*?" run, not a chat endpoint.

---

## 7. How to say this in an interview

**What broke if we copied them:** we would have turned a free diagnostic into a
metered proxy and lost the only number outreach can stand on.

**Why:** a lead magnet has to cost nothing per use; a gateway has to cost
something per token. Those constraints cannot share an endpoint.

**What it is called:** a **category error** — treating two products that share a
surface (an API about AI search) as the same product. The related terms are
**lead magnet vs. platform**, **citability vs. citation**, and **deterministic
instrument vs. generative gateway**.

**Ready line:** "I looked at making our AI-visibility API look like Perplexity's
gateway. That is a category error. Ours is a $0 diagnostic: four HTTP fetches,
34 checks, a score a buyer can re-run. Theirs is a metered search-agent platform.
We already have the router, internally, so the fleet fails over. The thing a
buyer actually wants — 'did ChatGPT cite me' — we already built, and we
correctly kept it off the public demo key because every probe spends real
upstream credit."
