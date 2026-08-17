# Oracle Instance Resilience — All Products (Fix Bots Dying Silently)

## 🟢 VJH self-learning judge — now learns her REASONS and reads her screenshots (August 14 2026)

Supersedes the July 8-9 "self-evolving judge" entry below. The loop was alive but
starving: it learned 6 rejected *titles* and nothing else, while the explanations Elena
types (and the screenshots she attaches) sat unread in HubSpot. Commits in
`VibeJobHunterAIPA_AIMCF`: `41ccc36` → `7017d05`, docs `02d47b9`.

**Cron changed: `17 3 * * 0` (Sundays) → `17 6 * * *` (DAILY).** It is a read-only
HubSpot pull and a full week of her manual triage was sitting unlearned between runs.
Crontab backup before the edit: `/home/ubuntu/crontab.bak-20260814`.

**Measured effect (same HubSpot data, before → after):** applications recognised
**6 → 12**; negatives **6 bare titles → 12, of which 7 carry her reasoning and 3 the
contents of her screenshots**.

**Why it mattered, from one day's journal:** at 14:32 the judge surfaced *Forward
Deployed Engineer @ Blink UX* praising it as "hands-on, aligning with Elena's…" and she
killed it minutes later with **"manual coding required"**. Taste exactly inverted, and
the correction was already written in the deal note — being thrown away.

**What was actually broken (all verified, not theorised):**
- `\bapplied\b` was the only marker of her own applications, so *"I have just submitted
  manually"* was discarded — **4 of that week's 6 Sent-stage deals lost**.
- `\bengineer\b` does not match **"Engineering"** → *Forward Deployed Staff (Engineering)
  @ LevelUp Labs* never reached the negatives at all.
- Cap of 6 examples while **13** confirmed applications and **68** No-fits existed → raised to 12.
- VJH's Telegram-approval note is a bot template and was not being stripped.

**🔑 The HubSpot credential is a SERVICE KEY, not a private app.** `AIdeazz_Marketing_Engine`,
id `39045903`, portal `51409153` — one token, `HUBSPOT_API_KEY` in `/home/ubuntu/cto-aipa/.env`,
used by the whole fleet. **No private app was ever created**, so ⚙️ Settings → *Private Apps*
("your private apps have moved") and *Legacy Apps* ("no legacy apps available") are both
**empty dead ends** — do not send anyone there. Scopes are edited at
**⚙️ Settings → Integrations → Service Keys** →
`https://app.hubspot.com/service-keys/51409153/key/39045903` → *Edit → Add new scope*,
then *Save → "Yes, save"*. `access-token-info` lags a few seconds behind the save —
**verify by actually fetching a file, not by reading the scope list.**

**Screenshot reading (`gpt-4o-mini` vision) — three traps, each cost a round trip:**
1. Note attachments report **`access=HIDDEN_PRIVATE`** → `files.read` alone 403s.
   **`files.ui_hidden.read` is also required.** Both granted Aug 14 (15 scopes total,
   read-only; nothing that writes or deletes).
2. `files/v3/files/{id}` → `url` is a **signed-url *redirect*** on `api-na1.hubspot.com`
   that needs the auth header. Fetched plain it returns an HTML page, which base64s into
   OpenAI as `invalid_image_format` 400. Use **`/files/v3/files/{id}/signed-url`** for a
   real CDN link and check magic bytes before spending a vision call.
3. The prompt must **extract** what a posting demands, not judge disqualification. A
   version asking "which requirement would disqualify her" (with a NONE escape) returned
   empty for 2 of 3 real screenshots because their demands are qualitative.
   Cache: `autonomous_data/screenshot_reasons.json`, keyed by file id + `_prompt_version`
   → each screenshot is paid for **once**, and a prompt change re-reads instead of
   inheriting stale answers.

**⚠️ Verification rules (both of these make a healthy loop look dead):**
- Judge verdicts (`[submit] judge VETO (...)`, `judge OK (...)`) exist **ONLY** in
  `journalctl -u vibejobhunter`. `logs/vibejobhunter_*.log` carries only
  `src.autonomous.*` — grepping it returns 0 and proves nothing.
- **Never trust the sync's own summary line.** It once reported "10 carrying her reason"
  where every reason was the literal string `⚠️ Apply` — residue of VJH's note template
  clearing an 8-char length gate. Gate on **≥3 real words**, and always render the real
  prompt:
```bash
cd /home/ubuntu/VibeJobHunterAIPA_AIMCF && python3 scripts/judge_feedback_sync.py && \
  venv/bin/python -c "from src.core.llm_judge import _feedback_block; print(_feedback_block())"
```

**Fail-safe unchanged:** HubSpot unreachable / no qualifying outcomes / invalid JSON / no
files scope → existing `judge_feedback.json` left untouched (atomic tmp+rename) and the
judge prompt is byte-identical to pre-feature. The loop can never take the judge down.
Restart rule (Iron Rule #11) still applies to `llm_judge.py` code changes —
`sudo systemctl restart vibejobhunter` **and** `pm2 restart serpapi-jobs`; feedback-data
updates need no restart (the file is read per judge call). Full detail:
`VibeJobHunterAIPA_AIMCF/CLAUDE.md` § SELF-LEARNING LOOP.

---

## 🟢 n8n + private ops dashboard — the CRM read layer (August 13 2026)

**What went live:** n8n 2.34.5 on Oracle (PM2 `n8n`, port 5678) plus a
password-protected ops dashboard at `webhook.aideazz.xyz/ops/` showing live
HubSpot data across the HIRING and CLIENT streams. First run: 17 HIRING,
8 CLIENT, 25 needing action.

**Why n8n at all.** Every other candidate in the fleet was rejected on inspection
— Resend→HubSpot tracking is already solved in TypeScript, prospect staging is
fully automatic in `atlas-lead-machine.cjs`, follow-up reminders come from
HubSpot itself, and VJH's LangGraph pipeline would be a strict downgrade. The one
genuine gap was `aideazz-ops-dashboard`: a deployed React UI whose own code said
*"Placeholder rows — swap for API response shape when wiring CTO AIPA read
endpoint."* It needed an aggregation endpoint over HubSpot and nothing else. That
is n8n's actual shape — and greenfield, so nothing existing could be downgraded.

**The workflow (4 nodes):** Webhook `GET /webhook/ops` → HTTP Request
`POST api.hubapi.com/crm/v3/objects/deals/search` → Code (maps HubSpot's shape to
the dashboard's `OpsRow`) → Respond to Webhook (**All Incoming Items**, not First).

### Layout

| Path | Serves | Auth |
|---|---|---|
| `webhook.aideazz.xyz/crm/` | n8n editor | n8n's own owner login |
| `webhook.aideazz.xyz/crm/webhook/ops` | the data feed | **HTTP basic** (`.htpasswd-ops`) |
| `webhook.aideazz.xyz/ops/` | React dashboard, `/var/www/ops` | **HTTP basic** (same file) |
| `webhook.aideazz.xyz/crm/webhook/*` (all others) | future external webhooks | **none, deliberately** — Resend/HubSpot cannot type a password |

Dashboard and feed share one origin on purpose: no CORS, and the browser sends
credentials to both automatically. A static page cannot hold a secret, so
same-origin + browser auth is the only honest way to protect it.

### ⚠️ Security defect found and fixed the same hour

Before the same-origin move, n8n's webhook **echoed back whatever `Origin` it was
sent** — verified with `Origin: https://evil-example.com`, which came back as
`Access-Control-Allow-Origin: https://evil-example.com`. Any website could have
read the whole pipeline from a visitor's browser, and the URL itself had no auth
at all. Now both paths return **401** unauthenticated; `/whitespace/`,
`/aw-portal/` and `/crm/` verified unaffected.

### Traps hit (all cost real time)

- **n8n binds to `0.0.0.0` by default.** Set `N8N_LISTEN_ADDRESS=127.0.0.1` so
  nginx is the only door. Verify with `ss -tlnp | grep 5678`.
- **Editor "Execute step" spins forever behind a proxy** while the workflow runs
  perfectly. Don't trust it — read `execution_entity` in
  `~/.n8n/database.sqlite`, or just call the production URL.
- **Test vs production webhook URLs.** `/webhook-test/...` works only while
  "Listen for test event" is active; `/webhook/...` needs the workflow Published.
- **git-bash rewrites `--base=/ops/` to `/Git/ops/`.** Build with
  `MSYS_NO_PATHCONV=1`, then confirm `dist/index.html` references `/ops/`.
- **`location = /crm/webhook/ops`** must be an EXACT match so it outranks the
  `/crm/` prefix; otherwise auth either covers every webhook or none.

**Restart:** `pm2 restart n8n` · **wake/kill:** it is PM2-managed and `pm2 save`d.
**Data:** SQLite at `~/.n8n` — deliberately NOT the shared Postgres, so n8n
cannot affect EspaLuz or anything else.

**Purpose:** Stop all AI bots on Oracle from silently dying. One plan, one deployment, covers every product on `170.9.242.90`. This file also lists **canonical Git repos**, **Oracle VM directories**, and **authoritative local Windows clones** so nothing is duplicated or misplaced across machines.

**Related:** The **AIdeazz AI Lab** story (marketing engine phases, Atlas measure layer, client-facing narrative) lives in [`AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md`](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md) — start there for *what the lab does*; use **this file** for *where it runs and how to keep it alive*.

**Note:** These details are synced to [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure). In this repo, the export lives in `docs/plans/oracle-infrastructure/` (README, OVERVIEW, RESILIENCE). Copy that folder to the private repo’s `docs/plans/oracle-infrastructure/` and push to the `docs` branch. See `docs/plans/oracle-infrastructure/SYNC_TO_PRIVATE_REPO.md`.

---

## 🟢 Sitemap rebuilt from shipped pages + Ahrefs LLM-referral tracking (August 4 2026, afternoon)

### The sitemap was lying, and a dead Hashnode call was hiding it

`aideazz/scripts/generate-sitemap.mjs` sourced blog URLs from two publishing APIs.
Both were wrong.

**Hashnode was retired months ago.** The GraphQL fetch could only fail, and it failed
silently by design (`on Hashnode failure, writes static URLs only — build still
succeeds`). That warning line in every build log trained everyone to ignore it, which
is exactly why the second bug survived.

**dev.to slugs are not aideazz.xyz slugs.** The generator inferred one from the other
by stripping a trailing hash (`-[a-z0-9]{3,6}$`). That inference is wrong in both
directions, verified live:

| Direction | Example | Reality |
| --- | --- | --- |
| Wanted to publish | `aideazz.xyz/blog/ai-language-learning-5cd4` | **404** — no page on this domain |
| Wanted to drop | `.../131-tests-4-layers-...-2026-07-31` | **200, 1,595 words** of prerendered content |

Because the fetch was flaky, the committed sitemap had frozen at **50 URLs listing 36
of 96 blog posts**. Sixty real pages — every one a 200 with 900–1,600 words — were
absent from the sitemap, invisible to Google and to every AI crawler the citation work
exists to court. The daily publisher kept adding posts to a list nobody was reading.

**Fix:** blog URLs now come from `public/blog/<slug>/index.html` — the files that
actually ship. The filesystem is the only source that agrees with what a crawler will
fetch. Result: **110 URLs, nothing dropped, 96/96 blog URLs backed by a real page.**
`lastmod` prefers the post's own `datePublished` (JSON-LD, then
`article:published_time`) over file mtime, because a checkout rewrites mtime and would
otherwise tell Google the whole archive changed today.

**No network calls at build time now.** The sitemap is reproducible instead of
dependent on a third party being reachable from the build runner.

### Hashnode is fully out of the live path

Audited before assuming. The sitemap generator held the **last live Hashnode call in
the entire pipeline**:

| Surface | State |
| --- | --- |
| `aideazz/scripts/generate-sitemap.mjs` | **Removed** — was the only live call |
| `cto-aipa/src/daily-blog-publisher.ts` | Already dev.to-only. `devtoOnly()` returns true when `HASHNODE_ACCESS_TOKEN` is absent, so it self-switched when the token went away. This is why posts kept shipping. |
| `aideazz/src/pages/BlogIndex.tsx` | Calls `mergeHashnodeWithLocal([], local)` — empty array, pure merge, no fetch |
| `aideazz/src/lib/hashnode-public.ts` | `fetchHashnodePostList` / `fetchHashnodePostBySlug` have **no callers** — dead code |

Left the dead exports in place rather than ripping them out in the same change as a
sitemap fix. They cost nothing at runtime (tree-shaken, never called) and deleting them
would have widened the blast radius of a fix that needed to be provable.

### Ahrefs Web Analytics — the other half of the citation loop

The citation probe answers *does a model mention us*. Nothing answered *does a model
send anyone*, because GA4 folds ChatGPT, Perplexity, Gemini and Claude into
undifferentiated referral traffic. Ahrefs Web Analytics splits them out by name, free
tier, cookie-free.

**Where the tag lives** — four injection points, because these surfaces do not share a
template:

| Surface | File | Covers |
| --- | --- | --- |
| SPA shell | `aideazz/index.html` | `/`, and every prerendered route (`/portfolio`, `/api`, `/blog`) since `prerender-routes.mjs` only swaps SEO tags and leaves `<head>` analytics intact |
| Standalone pages | `aideazz/public/{pitch,pitch-es,sop-ai-ops,sop-ai-ops-es}.html` | Served directly, inherit nothing |
| Blog template | `cto-aipa/src/blog-static-pages.ts` | Every **future** post, automatically |
| Published posts | `aideazz/public/blog/*/index.html` | The 96 that predate the template change (backfilled) |

**Backfill was purely additive: 322 insertions, 0 deletions across 100 files.** Verified
with `git diff --numstat` before committing.

**Trap — CRLF.** Published posts are CRLF; the template source is LF. A literal `\n`
anchor matched **zero** files and reported "no GA4 anchor: 95". Match `\r?\n`, capture
the EOL, and re-emit what the file already uses, or the diff becomes 95 whole-file
rewrites instead of 3-line additions.

**Trap — one post had no GA4 at all.** A post from an older generator had no analytics
tag to anchor to. Needed a `</head>` fallback branch.

**Found while verifying: `sop-ai-ops.html` never had GA4.** One of the six `/portfolio`
proof links has been invisible in analytics since launch. Added GA4 alongside Ahrefs to
both it and its Spanish twin.

### Windows traps hit during this work (all cost real time)

| Symptom | Cause | Do this instead |
| --- | --- | --- |
| `The token '&&' is not a valid statement separator` | PowerShell, not bash | Use `;` or separate calls |
| `Invalid string escape` in `node -e` | PowerShell mangles quotes in inline JS | Write a `.cjs` file and run it |
| `git show HEAD:file > out.txt` produced content with **neither** expected string | PowerShell `>` writes **UTF-16LE**; reading as utf8 gives garbage | `execFileSync('git', [...]).toString('utf8')` in node |
| `1 file changed, 0 insertions(+), 0 deletions(-)` on a `.ts` commit | Git treats `.ts` as **binary** (MPEG transport stream), so it shows no line diff — the content commits fine | Verify with `git show HEAD:<file>` read as utf8, not by reading the diff stat |
| Read/edit tools refuse `.ts` as "binary" | Same MPEG misdetection | Patch via a node script with an anchor-count guard |

### Verification (live, post-deploy)

```
A+ 100/100  https://aideazz.xyz/portfolio     ← unchanged, tag is async + cookie-free
A+ 100/100  https://aideazz.xyz
A+  98/100  https://aideazz.xyz/api
A+ 100/100  https://aideazz.xyz/blog
A+ 100/100  https://aideazz.xyz/sop-ai-ops.html
A+ 100/100  https://podcast.aideazz.xyz/
sitemap.xml  110 <loc> entries (was 50)
```

All seven surfaces confirmed carrying the tag by fetching the **deployed** page, not by
trusting the source.

### Second defect: canonicals pointed at a URL that redirects

Search Console surfaced this immediately after the sitemap resubmission. Inspecting a
post returned **"Crawled – currently not indexed"**, and the *Referring page* it
recorded carried a **trailing slash** the page never declared for itself.

Cause: posts ship as `public/blog/<slug>/index.html`. On IPFS a real directory wins, so
the host **301s `/blog/<slug>` → `/blog/<slug>/`**. But `blog-static-pages.ts` built
`const canonical = ${SITE}/blog/${slug}` with no slash, so **every post declared a
canonical address that immediately redirected away** — and the sitemap listed the same
pre-redirect URL 96 times.

Fixed in one place (`canonical` in the template), which flows to all four
self-referential URLs: `rel=canonical`, `og:url`, JSON-LD `url`, JSON-LD
`mainEntityOfPage`. Published pages backfilled — the regex rewrites **only the post's
own slug** (`(?![/\w-])` guard) so inter-post links are untouched.

Verified live post-deploy: 96/96 canonicals match their own address, 96/96 sitemap
entries carry the slash, every sitemap URL resolves to a real file.

> **Rule:** the declared canonical must be a URL that answers **200**, never one that
> 301s. On IPFS/4everland, any path backed by a directory needs the trailing slash.

### Ruled out: these are not duplicate pages

Seventeen slug clusters look like republished duplicates (4× "deputy CEO", 3× "131
tests", 3× "GSC gap analysis" — 27 redundant-looking pages of 96). Measured before
acting, using **5-word-shingle Jaccard on visible body text**: they overlap **1.3–2.7%**.
They are genuinely distinct articles on repeated topics, not copies. Google is not
withholding indexing for duplication — do not "fix" this by deleting posts.

### Open item

"Crawled – currently not indexed" is Google saying *found it, not convinced yet*. The
technical faults are now gone, so what remains is authority, which only third-party
references buy. Resubmit `sitemap.xml`, then let the community listener and directory
work supply the external signals.

---

## 🟢 Proof surfaces enforced — SOP + podcast to A+ 100 (August 4 2026)

The three surfaces `/portfolio` links to as proof had never been audited. When they
finally were, two of them graded below the page citing them. Both are fixed and, more
importantly, **enforced**, so they cannot drift again unnoticed.

| Property | Was | Now | What was wrong |
| --- | --- | --- | --- |
| `aideazz.xyz/sop-ai-ops.html` | A 89 | **A+ 100** | No Open Graph tags at all (hard fail), 179-char meta, no `sameAs`, no FAQ schema, one semantic landmark |
| `podcast.aideazz.xyz/` | A+ 95 | **A+ 100** | 187-char meta, no FAQ schema, no list or table anywhere on the page |
| `aideazz.xyz/blog` | A+ 100 | **A+ 100** | Nothing — promoted from report-only to enforced |

**Self-audit target list (`scripts/visibility-self-audit.cjs`) — enforced now:**
`/portfolio`, `aideazz.xyz`, `/api`, `/blog`, `/sop-ai-ops.html`, `podcast.aideazz.xyz`,
`webhook…/cto/v1/visibility`. Report-only: Atlas board, `atuona.xyz`.

**Where each one is edited — they are three different repos, this is the part that
wastes time:**

| Surface | Source | Deploy |
| --- | --- | --- |
| SOP page | `aideazz` repo → `public/sop-ai-ops.html` (static, not React) | push to `main`, 4everland rebuilds |
| Podcast | `cto-aipa` → `src/podcast-feed.ts` (generates the HTML) | `npx ts-node scripts/podcast-host-cli.ts reseed` — pushes to `ElenaRevicheva/aideazz-podcast` via the GitHub API, 4everland serves it |
| `/blog` | `aideazz` → `scripts/prerender-routes.mjs` | push to `main` |

**Podcast reseed needs `GITHUB_TOKEN` only.** It is a pure GitHub API operation and
does **not** need the Oracle VM — a laptop with `gh auth token` can run it. The VM has
the token in `.env`; a laptop does not, so export it first.

**Feed safety rule — do not "fix" the feed description.** `reseedSiteFiles()` rewrites
`feed.xml` as well as `index.html`. The channel description is **187 chars and must
stay that way**: Apple and Spotify have already ingested it and podcast directories
have no length limit. The 170-char cap is an HTML `<head>` concern only, so
`seoDescription()` in `podcast-feed.ts` trims a head-only copy and leaves the feed
untouched. Verified after deploy: feed still 200, 11 items, 187-char description,
enclosure URLs unchanged.

**Semantic landmark changes on the SOP page are tag swaps, not restructuring.**
`div.hero → header`, `div.wrap#main → main`, `div.footer → footer`. All CSS there is
class-based (no `div.wrap` selectors), so nothing moves visually. The TOC scrollspy
picks up the new `<section id="faq">` because it selects `.section`.

**Both FAQs are duplicated by design** — visible HTML *and* `FAQPage` JSON-LD. If you
edit one, edit the other, or answer engines will lift a sentence the page no longer
says. Both files carry a comment saying so.

## 🟢 AI citation tracking + `/blog` identity fix (August 3 2026)

**What runs where, and what to check when it goes quiet.** Story and rationale live in
[`AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md`](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md)
(Phase 1, Aug 3) — this entry is the operational half.

**New surfaces on `cto-aipa` (PM2 app `cto-aipa`, port 3000):**

| Surface | Where | Notes |
| --- | --- | --- |
| `GET /cto/v1/citations` | `src/visibility-api.ts` | Latest run + 12-run trend. Returns `measured:false` (not `0%`) when nothing has run. |
| `scripts/citation-probe.cjs` | CLI | `--save` persists, `--notify` pings Telegram, `--json` for storage. **Exits 1 when nothing could be measured.** |
| `ai_citation_runs` | Oracle | Auto-created on first save (ORA-955 ignored, same idiom as the rest of the schema). |
| `.github/workflows/citation-probe.yml` | CI | Mondays 13:00 UTC, an hour after the visibility self-audit. |

**Keys it needs (any one is enough; all are optional):** `SERPAPI_KEY` (Google AI
Overviews), `GEMINI_API_KEY` (grounded search), `OPENAI_API_KEY` (web search),
`PERPLEXITY_API_KEY` (optional, not currently in the fleet). The keys live in the
Oracle VM `.env` — **the laptop `.env` has none of them**, so a local run will
correctly report "not measured" and exit 1. That is the designed behaviour, not a bug.

**Why exit 1 on zero engines:** a citation tracker that quietly measures nothing is
worse than no tracker, because the resulting 0% gets reported as "we were not cited".
If the weekly job goes red with `SKIPPED … not set`, the fix is a key, not the code.

**Import rule — do not break this:** `src/citation-tracker.ts` has **no database
dependency** so it runs on a bare GitHub runner with no Oracle wallet. Persistence
lives in `src/citation-store.ts` and is imported **lazily** by both the CLI and the
`/v1/citations` route, because importing `src/database.ts` initialises an Oracle pool
at module load (verified: a top-level import throws DPI-1047 / NJS-125 off-VM).

**Website side (repo `aideazz`, 4everland from `main`):** `/blog` was serving crawlers
the homepage template and scoring A+ 100/100 for it. `_redirects` alone cannot fix
this — the per-article pages make `/blog` a **real directory** in the IPFS build and
gateways resolve real directories before `_redirects`, and `fix-blog-index.mjs`
deliberately fills it with `dist/index.html`. `scripts/prerender-routes.mjs` runs last
and now also writes `dist/blog/index.html` with blog identity. If `/blog` ever reverts
to the homepage title, check that ordering first.

**Guardrail:** `scripts/visibility-self-audit.cjs` now fails when two enforced routes
share a `<title>`. Score alone cannot catch a homepage fallback, because the fallback
*is* the A+ homepage. Engine `1.2.0` adds `AuditResult.identity` so the gate compares
real values rather than parsing a display string.

**Known local-build trap:** `npm run build` in the `aideazz` repo regenerates
`public/sitemap*.xml|txt`. If the Hashnode fetch fails (it does from some networks —
returns HTML, not JSON), the regenerated sitemap **silently drops published URLs**.
Never commit sitemap files from a laptop build; `git checkout --` them and let the
deploy runner regenerate.

## 🟢 Community listener — finds questions, drafts replies, never posts (August 4 2026)

Operational half of the "citations come from being the answer, not from having a
good page" work. Story in
[`AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md`](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md).

**Where it lives:** PM2 app `cto-aipa`, cron `25 * * * *` (America/Panama), gated
behind `COMMUNITY_LISTENER_ENABLED=true`. Unset the flag and the whole feature is
inert — no scanning, no LLM spend, no notifications.

**CLI:**

```bash
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && node scripts/community-listen.cjs --dry-run"  # scan + score only
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && node scripts/community-listen.cjs"            # full cycle
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && node scripts/community-listen.cjs --stats"    # queued/posted/skipped
```

**Sources, and why each behaves as it does:**

| Source | Mechanism | State |
|---|---|---|
| Hacker News | Algolia public API | Works, no credentials |
| Indie Hackers | Algolia index `discussions` behind their own search box | Works. IH is client-rendered with **no API and no RSS** — fetching HTML returns an empty shell, so scraping is not an option. Keys overridable via `IH_ALGOLIA_APP_ID` / `IH_ALGOLIA_KEY` because they rotate |
| Reddit | **Atom feed** `search.rss`, OAuth used instead when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set | Works with **no credentials**. `search.json` returns **403 Blocked** to datacenter IPs but `search.rss` answers **200** — verified from this VM. The OAuth app registration is therefore optional, not required |

Every source reports `matched` / `zero` / `unavailable` **separately**. A source
that quietly returns nothing is indistinguishable from a quiet market, and that
distinction is the entire point of measuring.

**Reddit field notes (all three cost real time):**

- `search.json` → **403**, `search.rss` → **200**, same IP, same second. Do not conclude
  Reddit is blocked because the JSON API is.
- The Atom feed **mixes subreddits into post results**: ids are `t5_` for a subreddit and
  `t3_` for a post. Only `t3_` is something a human can reply to.
- `sort=new` is a trap. Reddit matches multi-word queries loosely, so newest-first returns
  whatever was just posted sharing any single word — "AI agents for business Panama"
  returned r/AskParents, r/careeradvice and a Palantir earnings summary. Use `sort=relevance`.
- Rate limits bite fast: three quick requests earned a 429 and then **empty 200 bodies**,
  which is worse than an error because it looks like a quiet market. Calls are spaced by
  `REDDIT_RSS_GAP_MS` (default 2500).

**Two relevance gates, both earned:**

- `ON_TOPIC` — the thread text must mention AI, automation or search visibility in some
  language. Reddit's own relevance ranking is not trustworthy enough to skip this.
- **Spanish `IA` must be matched case-sensitively.** Case-insensitively it also matches
  Portuguese `ia`, the imperfect of *ir* and among the commonest words in the language,
  which is how a Messi thread and a bicycle-refund thread cleared an AI topic gate.
- `latam` comes from the **thread's own text**, never from the query's flag. Trusting the
  flag stamped "🌎 LatAm" and a HIGH-priority HubSpot task onto a Palantir earnings post
  because the *query* said Panama.

**IH field notes (cost an hour, do not rediscover):** hits carry `itemId`, and the
post URL is `https://www.indiehackers.com/post/{itemId}`. `createdTimestamp` is
**epoch milliseconds**. Results come back **relevance-sorted, not date-sorted**, so
a `numericFilters: ['createdTimestamp>…']` window is mandatory or you surface
2023 threads. IH returns HTTP **200 for every path including 404s**, so status
codes cannot be used to validate a URL.

**Draft safety — both rules came from real failures, do not remove them:**

- The first live draft mentioned the audit API **without linking it**. That is the
  worst of both outcomes: reads as self-promotion, earns no citation. `draftWarnings()`
  now flags an unlinked plug.
- The improved prompt then invented `"reduce el 65% de respuestas manuales"` and a
  four-month client history. **Both fabricated.** A made-up number under Elena's name
  is worse than a vaguer reply because she cannot defend it when asked. The prompt
  forbids inventing statistics, client counts and first-hand anecdotes; `draftWarnings()`
  flags any figure outside the published set (`0`, `34`, `100`) and any first-hand claim.
- Warnings appear **on the Telegram card**, not only in logs — the log is not where the
  decision to post gets made. They **warn, never rewrite**: silently patching a draft
  would hide that the model drifted.

**Isolation (this deploy changed nothing that already worked):**

- Telegram callback prefix `cm:` cannot collide with the concierge's `cz:`, and is
  registered after it.
- New Oracle table `community_opportunities` only, created with the existing ORA-955
  create-if-absent idiom. Unique index on `(source, external_id)` does the dedupe.
- HubSpot **creates new tasks only**. The single mutation to an existing object is
  closing a task it created itself, by an id it stored.
- No new HTTP routes. **Nothing is ever posted to any community platform** — that is a
  product decision, not a limitation: a bot that auto-posts links gets the domain
  blacklisted on precisely the platforms where the wedge is cheapest.

**Deploy trap (bit me again):** Oracle has **no `tsc`** — `npm run build` on the VM
fails with `sh: 1: tsc: not found`. Build on Windows, `scp dist/*.js`, then
`pm2 restart cto-aipa --update-env`. Also: **shell scripts scp'd from Windows carry
CRLF** and fail with `$'\r': command not found` — run `sed -i 's/\r$//'` first.

**⚠️ Fleet-wide finding, August 4:** `ANTHROPIC_API_KEY` returns
`"Your credit balance is too low to access the Anthropic API"` (HTTP 400). Groq and
xAI both return 200. Every Claude-dependent feature across the fleet is running on
fallbacks — `llm-resilience.ts` is doing its job, but drafts are being written by
third-tier models. Verified by direct API call, not inferred from logs.

## 🟢 Newsletter (double opt-in) + citation runs deployed (August 3 2026, evening)

Deployed to the VM the same evening. Story in
[`AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md`](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md)
(Phase 1, Aug 3 evening) — this is the operational half.

**New surfaces on `cto-aipa` (PM2 app `cto-aipa`, port 3000):**

| Surface | Where | Notes |
| --- | --- | --- |
| `POST /cto/v1/newsletter/subscribe` | `src/newsletter-api.ts` | Honeypot + validation, writes `pending`, sends opt-in mail. 10/hour per IP. |
| `GET /cto/v1/newsletter/confirm` | same | Single-use token, HTML page (a human clicked a link, not an API). |
| `GET /cto/v1/newsletter/unsubscribe` | same | Per-subscriber token, flips status — **the row is never deleted**. |
| `GET /cto/v1/newsletter/stats` | same | Owner key (`aidz_owner_`) only. |
| `newsletter_subscribers` | Oracle | Auto-created, ORA-955 ignored, same idiom as the rest of the schema. |
| `scripts/newsletter-broadcast.cjs` | CLI | Needs `npm run build` first (reads `dist/newsletter-store.js`). |
| `POST /cto/v1/citations/run` | `src/visibility-api.ts` | Owner key only — a run spends real SerpAPI/OpenAI credit. |

**Keys it needs:** `RESEND_API_KEY` (or `RESEND_KEY`) — already present on the VM, the
same one `marketing-notify` and the concierge use. Optional overrides:
`NEWSLETTER_FROM` (default `AIdeazz <aipa@aideazz.xyz>`), `NEWSLETTER_SITE_URL`
(default `https://aideazz.xyz/portfolio`), `CTO_AIPA_PUBLIC_URL` (link base).

**Why every send is its own message:** `newsletter-broadcast.cjs` sends one email per
subscriber rather than one with many recipients, because each copy carries that
reader's own unsubscribe token — and a shared `To:` header would expose the whole list
to everyone on it. 600ms between sends stays inside the Resend rate budget. Always
`--dry-run` first; `--test you@x.com` renders with a dead unsubscribe token so
proofreading cannot remove a real subscriber.

**Isolation rule — do not break this:** the newsletter has its **own table and its own
module**. A subscriber must never be written into `business_leads` or picked up by the
concierge. An inquiry is a lead someone answers personally; a subscription is a reader
on a marketing list. Merging them would push newsletter volume through the address that
sends lead replies and risk the reputation of both.

**Why nginx forced the citation run async:** a three-engine sweep outlasts nginx's 60s
proxy timeout, so the first manual run returned `504` while the probe completed and
saved normally — a success that read as a failure. The endpoint now returns `202` in
~2s and finishes in the background; `GET /v1/citations` exposes `running`, and a second
start while one is in flight gets `409` instead of double-billing the engines. **If a
future long job is added behind nginx, do the same — do not raise the proxy timeout.**

**Verified live the same evening:** invalid email → 400, bogus confirm/unsubscribe
token → 404 page, stats without owner key → 403, honeypot → 200 with nothing stored,
and a real end-to-end signup → `{"confirmed":1,"pending":0,"unsubscribed":0}`. First
citation runs stored: 0/18 then 1/18, `/portfolio` 0%, mention rate 11%.

**Restart safety note:** three deploys ran this evening, each restarting PM2 `cto-aipa`
(shared with the Lab API, Lead Concierge and inquiry proxy). After each,
`GET /cto/marketing/inquiry-status` was re-checked for
`inquiryEndpointConfigured: true` + `emailNotifyConfigured: true` — that endpoint is
the cheapest proof the website form still reaches Oracle and HubSpot. Do this after
every `cto_aipa` deploy.

## ✅ Fleet HubSpot-outcomes audit — July 16 2026 (log-verified, per source prefix)

Elena asked to confirm every agent actually surfaces its outcomes to HubSpot (client/hiring/espaluz). Pulled 175 real deals from the last 14 days + grepped real Oracle logs (not config) per prefix:

- **HIRING-VJH-LEAD/SERP-LEAD** — alive, high volume (159 in 14 days). SERP-LEAD path still 0% acted-on (known, separate question of whether it's worth keeping).
- **CLIENT-CTO-INQUIRY** — alive but every deal parks at `appointmentscheduled` ("ignore, not triaged") forever, even after the Lead Concierge sends a reply — the send only logs a contact note, never promotes the deal stage. Not fixed this pass (flagged for next session): should move to `decisionmakerboughtin` ("⏳ Sent — passive wait") on send.
- **CLIENT-CTO-SERP — NOT broken, structurally cannot produce contactable buyers (verified July 16):** the buyer-radar IS running (SerpAPI enabled, ~856 quota, queries firing, LLM classifier says "lead"). But last HubSpot deal = **June 22** — exactly when the `isQualifiedClient` gate went live. Endpoint logs show every "lead" rejected: `CLIENT lead NOT qualified (no reachable identity (no email/domain/site/linkedin)) — skipping`. The "leads" are Google **search-result page titles** on social URLs (tiktok/facebook/instagram/upwork/skool) — no email, no real company site, no way to contact anyone. The gate is doing its job. **This is not a fixable bug — it's the ceiling of the channel.** The only "fixes" are (a) weaken the gate → junk dashboard returns, or (b) build a contact-discovery layer → that's building. **Accept as dead-for-sales.** Same applies to CLIENT-CTO-INGEST (HN "Who's hiring" scrape, ~1 lead/cycle, mostly already-seen) and CLIENT-ALGOM (X account has 0 credits, `algom-stream` crash-looped 24,673×).
- **HIRING-OPENCLAW, CLIENT-CMO, CLIENT-PLACES** — still genuinely not wired (no code path exists yet), as previously documented.
- **ESPALUZ — was 100% dark, now FIXED:** `_push_espaluz_to_crm()` / `_push_espaluz_tg_to_crm()` (in EspaLuzWhatsApp/EspaLuzFamilybot) both had `if not secret: return` with **`OUTREACH_SECRET` never set in either bot's `.env`** — silent no-op, no log line, ever. Confirmed via Postgres: **28 real WhatsApp trial users** (real phone numbers, multiple countries, back to 2025-07) had never once reached HubSpot. Fixed: added `OUTREACH_SECRET` + `CTO_AIPA_WEBHOOK_URL` to both `.env` files, restarted both services (forward-going trials verified live via direct API test), then ran a one-off backfill (`EspaLuzWhatsApp/scripts/backfill_espaluz_hubspot.py`) — all 28 now live in HubSpot as `[ESPALUZ] WA {phone} — trial` deals.
- **EspaLuz_Influencer daily CRM signal — separate bug, also FIXED:** `_CRM_HUB_URL` was hardcoded to `127.0.0.1:8080` (VJH's web port) instead of cto-aipa's `:3000` — every daily content-post signal 404'd for at least 14 straight days (log-confirmed: `CRM signal sent ... Status: 404` nightly). One-line fix, `EspaLuz_Influencer` commit `c488625`, deployed + restarted.
- **Noted, not fixed (low priority):** `espaluz-webhook.service` (`paypal_webhook_server.py`, port 5000) is crash-looping — **154,000+ restarts** — almost certainly because `espaluz-payments-webhook.service` already owns port 5000 and is the live one (`active running`). Looks like dead/superseded legacy service; safe to `systemctl disable` in a future pass, not urgent since the real payment receiver is healthy.

## ✅ VJH `detected_responses` — FIXED July 16 2026 (was: real replies detected, surfaced to NOBODY)

**Fixed same day** (VibeJobHunterAIPA_AIMCF `3bf8894`, deployed + restarted `vibejobhunter`). Root cause was sharper than first thought: `push_response_to_hubspot()` and the sender-blocklist filter already existed in `response_detector.py`, but only inside a dead sibling function nothing called — the actual live orchestrator cycle (`orchestrator.py::_check_for_responses`) duplicated the save+alert logic without either helper. Wired both in. **Backfill run live:** of 189 historical rows, 49 survived the blocklist (Torre.ai/newsletter noise) as real; all 49 pushed to HubSpot (`dealstage=contractsent`, verified via direct API read) + one Telegram digest sent — includes the July 15 Truelogic interview shortlisting, 2 Oracle Startup Program meeting invites, and several inbound `[AIdeazz]` client inquiries. **This retires the "0 contractsent ever" funnel-truth line** in `AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md` / selling-pivot notes — update those before quoting old numbers. Backfill script: `scripts/backfill_detected_responses.py` (one-off, not cron — re-running would re-touch the same 49 deals).

**Gap #2 still open** (confirmed by code read, corrected from the July 15 guess): `multi_channel_sender.py` (the module that actually sends LinkedIn/email/Twitter outreach) has zero HubSpot references. It's fully disconnected from `crm_hub.py::push_application_to_crm` (which only fires earlier, at cover-letter-generation time). No dealId is threaded through to attach the sent message text as a note after send. Not started — needs a lookup-by-company+jobTitle or a stored dealId on the outreach record.

<details><summary>Original finding (superseded, kept for context)</summary>

## 🔴 VJH `detected_responses` — real replies detected, surfaced to NOBODY (found July 16 2026)

**The bug:** `VibeJobHunterAIPA_AIMCF/src/autonomous/response_detector.py` classifies inbound email replies into
`autonomous_data/vibejobhunter.db` → table `detected_responses`, and **there is no code path from that table to
HubSpot, Telegram, or anything Elena reads.** 189 rows accumulated Jan–Jul 2026 in silence.

**What was actually in there** (this is why it matters — it is not a hygiene issue, it is lost money):
- `alex@alex.com` **2026-07-15 — "Interview Invitation for Senior Full-Stack Engineer (TypeScript / AI Automation) at Truelogic"** + an Event Confirmation for a scheduled AI-assisted interview. Elena was shortlisted; the invite lived in SQLite.
- `adriana.vargas@oracle.com` — **"Reunión Aideazz + Oracle"** (June 24) and "Aideazz Future Projects" (Jan 19): real Zoom invites from the Oracle Startup Program contact.
- Foundever Panama interview invitation; a stranger offering LangGraph help; article-collab follow-ups.

**Honest triage of the 189 (don't repeat "186 lost jobs" — it's wrong):** ~90 are **Torre.ai "Emma" bot** mail, 11 are
`noreply@` senders, and the classifier is noisy enough to have tagged a **Zoom app-install confirmation** as a
`positive` employer response. **88 are plausibly real humans.** So: real gold, buried under bot noise — the fix must
**filter**, not firehose.

**Schema:** `detected_responses(id, email_id, from_email, from_name, subject, body_preview, received_at,
response_type, confidence, company_name, ai_analysis, suggested_action, created_at)`;
`response_type ∈ positive|question|rejection`, `confidence` 0–1.

**The fix when we build it (money-first, not a rebuild):** push high-confidence, non-Torre/non-`noreply` rows to
HubSpot as a **note + task** on the matching contact and ping Telegram. Reuse the existing HubSpot writer and the
`[STREAM-AGENT]` prefix convention; verify from logs before/after. Related gap: outreach **message text** likely is
not visible as an engagement on the `[HIRING-VJH]` deals it creates (`outreach_log.jsonl` has no hubspot/synced
field and stopped writing 2026-05-16; newer sends go via `src/autonomous/multi_channel_sender.py`).

</details>

## ⏳ Groq model deprecation — ONE `GROQ_MODEL` switch per repo (July 15 2026) — **DEADLINE AUGUST 2026**

**The threat:** Groq retires **`llama-3.3-70b-versatile`** (dev tier) in **August 2026**. That model is the **universal tier-2 fallback for the entire fleet** (see the "UNIVERSAL Claude → Groq spine" note below) — and the Anthropic key is routinely credit-dead, so Groq is often what is *actually* answering. Also **`llama-3.1-8b-instant` is decommissioned Aug 16 2026** → it is **NOT a valid migration target** (we already fled it in June 2026; note at `src/telegram-bot.ts:8104`).

**Groq the PROVIDER is not going away — only the model.** Same API key, same LPU, same tier-2 slot. Migration = ask Groq for a different model id.

**The principle:** models are rented, not owned; retirement is permanent and recurring. You don't escape the treadmill — you make each retirement cost **10 minutes, not 2 days**. Code names a **role**, never a model id. Evals are what remove the fear of swapping.

**Cutover (when decided) = one line + restart, instantly reversible:**
```bash
# in the repo's .env, then restart the process
GROQ_MODEL=<new-model-id>
```

**Status by repo:**

| Repo | Switch | State |
|---|---|---|
| **cto-aipa** (`ced31f5`) | `src/llm-resilience.ts` → `groqModel()` | ✅ 7 hard-coded sites collapsed to one |
| **VibeJobHunterAIPA_AIMCF** (`04c4001`) | `src/utils/model_config.py` → `groq_model()` | ✅ 4 sites wired |
| **whitespace / Atlas** | `WHITESPACE_GROQ_MODEL` (`src/config.ts:23`) | ✅ was already correct — the pattern others copied |
| **EspaLuzFamilybot** | `main.py:2556,4311` | ❌ hard-coded — ⚠️ **paying users**, deploy carefully |
| **EspaLuzWhatsApp** | `espaluz_bridge.py:3021`, `whatsapp_convo_mode.py:161` | ❌ hard-coded — ⚠️ **paying users** |
| **EspaLuz_Influencer** | `cto_milestone_module.py:42`, `main.py:672,1042` | ❌ hard-coded |
| **dragontrade-agent** | `aideazz-content-generator.js:333,375`, `engagement-bot.js:61`, `x-tech-updater.js:115` | ❌ hard-coded |

(Ignore `*.bak-modelfix-20260616` files — backups, not live.)

**Implementation gotchas (both were real bugs, not theory):**
- **Resolve at CALL time, not import time.** `cto-aipa.ts` has **no top-of-file dotenv**, so a module-load `process.env` read silently misses `GROQ_MODEL` and pins you to the dead default — the switch *looks* fine and does nothing. Hence `groqModel()` is a lazy getter, and `AI_MODELS.standard` / `AI_CONFIG.fallbackModel` became **getters**. Same reason VJH's `groq_model()` reads `os.environ` **then falls back to `dotenv_values`** (mirrors `llm_judge._key()` — the bot doesn't always export .env).
- **Log strings must print the resolved id**, never a literal — otherwise logs lie after cutover and you debug a ghost.
- `sprint-briefing` follows `GROQ_MODEL` **without importing** `llm-resilience` (it ships in the separate AWS Lambda bundle).

**⚠️ MODEL TARGET STILL UNDECIDED — do not flip yet:**
- **`openai/gpt-oss-120b` is a REASONING model.** Against the real 2,918-char VJH judge prompt at `max_tokens:120` it burned the budget *thinking* and returned **EMPTY content (`finish=length`) in 16/22 golden cases**. The judge **fails open** → it would have **silently approved every job**. Same exposure: lead-triage (`max_tokens:220`), Telegram intent classifier (`max_tokens:30`). **When it did answer it was 10/10 correct** — quality is fine, the token budget is the problem. Any move to a reasoning model requires raising `max_tokens` at every call site.
- Non-reasoning candidates live on the key: **`meta-llama/llama-4-scout-17b-16e-instruct`**, `qwen/qwen3-32b` (⚠️ Qwen3 has hybrid *thinking* mode — verify before trusting), `groq/compound`.
- **Eval harness:** VJH `evals/golden_set.json` — 22 cases, labels are **`apply` / `discard`** (not approve/reject). Run it against a candidate before any cutover.

**⚠️ Groq free-tier TPD is the real churn driver (verified July 15):** `Rate limit reached … tokens per day (TPD): Limit 100000, Used 99606`. The fleet burns its 100k/day/model budget and fails over to xAI/Gemini for the rest of the day. Same 429s in `whitespace/data/capture.log`. **This also blocks evals** — a burned baseline can't be compared. Run model evals on **fresh daily quota, one model at a time**, separating 429s from truncations.

---

## 🟢 LLM resilience + VibeJobHunter pipeline (June 23-24 2026)

- **Sprinter (AWS Lambda `sprint-briefing-agent`, us-east-1, EventBridge `cron(0 13 * * ? *)` = 8AM Panama):** narrative + clustering chain is now **Claude → Groq → Gemini → OpenAI `gpt-4o-mini`** (`src/sprint-briefing/synthesize.ts`). It failed to fire June 23 because all of Claude(400 dead)/Groq(429 capped)/Gemini(429 depleted) failed — added OpenAI as the reliable backstop (key already in the Lambda env, 19 vars). **Verified June 24:** force-test logged `OpenAI (gpt-4o-mini) returned 1926 chars → narrative fallback succeeded`, `{"ok":true}`. **Rebuild+deploy:** `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --format=cjs --external:@aws-sdk/signature-v4-crt --external:encoding --outfile=dist-lambda/sprint/lambda-pkg/handler.js` → `py` zipfile (handler.js at zip root) → `node scripts/deploy-lambda.mjs`. **Force-test** = set Lambda env `SPRINT_BRIEFING_FORCE=1`, invoke (boto3, creds in `~/.aws`), then REMOVE the var. Deploy step 4 may transiently `ResourceConflict` ("update in progress") — code still uploaded; retry config update or ignore (it only re-sets an already-set var).
- **Provider reality:** the **Anthropic** key AND the **Gemini** key are OUT OF CREDITS (`400` / `429 prepayment depleted`). Working free/cheap: **Groq** (`llama-3.3-70b-versatile`, free) + **OpenAI** (`gpt-4o-mini`, cheap). Every AI path now falls back: `claude_helper`→Groq; VJH `response_detector` classify→Groq; VJH **LLM judge → OpenAI → Groq**. **Keys are read from each repo's `.env` directly** (bots do NOT export them to `os.environ`, which would otherwise fail-open/degrade). Groq sits behind Cloudflare → **must send a browser `User-Agent`** or it 403s the default urllib UA.
- **Atlas Shifted (`whitespace` PM2, port 8095) — added June 25 2026; performance bridge June 29 2026; GA4 sync July 3 2026:** the marketing-angle radar (repo [`atlas-shifted`](https://github.com/ElenaRevicheva/atlas-shifted), Oracle `/home/ubuntu/whitespace`). Daily capture cron **`0 14 * * *` UTC** (= **9 AM Panama**). Most complete LLM chain in the fleet: **Claude → Groq → OpenAI → Grok** (text/JSON, per-process circuit breaker) + **OpenAI `text-embedding-3-small`** for the angle classifier (⚠️ embeddings are **OpenAI-only — no failover**; if OpenAI dies, classification halts). Image: Flux (Replicate) → OpenAI `gpt-image-1`. Video: Runway → **Luma Agents API** (`ray-3.2` i2v fallback). **Jun 29 performance bridge:** Atlas exports **`concept_id` + UTM tags**; CTO AIPA **`POST /cto/api/performance-event`** → Oracle **`atlas_performance_events`**; Atlas UI shows ROAS/CPA/leads/**ga4_sessions** when hub wired (`ATLAS_PERFORMANCE_SECRET` = `OUTREACH_SECRET`). **Jul 3 GA4 adapter:** **`scripts/sync-atlas-ga4.mjs`** cron **`15 6 * * *` UTC** on `cto-aipa` (separate from Atlas capture — measure only). **Jul 3 UI:** public banner client-safe before 9 AM (`atlas-shifted` `eb9e99c`). Detect→create pipeline **unchanged**. **Gotcha fixed June 25:** a standalone CLI that reads `process.env.*` directly (e.g. `video.ts`) **must `import 'dotenv/config'`** or every key is undefined and providers skip silently (looked like "dry credits"; it wasn't). **Jul 9 [ATLAS-RADAR] CRM bridge:** brief cron pushes ENTER windows → HubSpot `[ATLAS-RADAR]` deals via `/cto/api/crm-event` `source=atlas_radar` (`radar-to-crm.ts`, fail-open, dealname-deduped, no conversion attribution — see §13). **Jul 9 EN/ES i18n:** `atlas.html` + `index.html` have a portfolio-style EN/ES toggle (browser auto-detect `es` → Spanish for LATAM clients, localStorage `atlas_lang`/`ws_lang`; ENTER/WATCH/AVOID stay untranslated as product vocabulary; LLM ad copy renders in its generated language) — `e192b9c`. **⚠️ Jul 6-9 SILENT-DEATH POSTMORTEM — Bright Data account invalid:** the account went "Customer has invalid status" (HTTP 422 on `api.brightdata.com/zone?zone=…`) after the Scraping Browser burned the balance → every `atlas_scraping_browser` websocket got **403** → capture wrote **0 new ads for 4 days** while the cron kept exiting 0 (classify/brief/concept "succeeded" on stale JSONL — dashboard snapshot froze at 07-05, agg cells thinned 45→18). **The unlocker zone still returned 200** on the same token, which masks the account state — do NOT conclude "Bright Data is fine" from an unlocker probe. **Diagnosis:** `curl api.brightdata.com/zone?zone=atlas_scraping_browser -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN"` → `422 Customer has invalid status` = balance/suspension (Elena tops up at brightdata.com/cp) vs `200` = zone fine, look elsewhere. **Fix Jul 9:** $20 top-up → zone 200 → manual `atlas-capture-cron.sh` run → fresh snapshot 2026-07-09 (44 cells) same day. **✅ Outage guard BUILT same day (atlas-shifted `2393a33`):** `capture.ts` now sends a Telegram alert (fleet bot creds in `whitespace/.env`) when a full run finds **0 ads across ALL verticals** — the outage signature — with the diagnose-curl in the message. Delivery verified live July 9. Single-vertical (`only`) runs don't alert.
- **Fleet LLM failover — UNIVERSAL `Claude → Groq` spine (re-audited in code June 25):** **every** agent falls to **Groq (free `llama-3.3-70b-versatile`)** on Claude 400/credit-exhaustion — EspaLuz Telegram (`main.py` ~L4255), EspaLuz WhatsApp (`espaluz_bridge.py` ~L2880 + `whatsapp_convo_mode.py`), EspaLuz Influencer (`cto_milestone_module.py`), VJH (`claude_helper` / `response_detector` / judge `OpenAI→Groq`), cto-aipa (`claudeWithGroqFallback`, `src/llm-resilience.ts`), Algom, Atlas. **Extended tiers** in higher-volume/critical paths: **Grok (xAI)** in cto-aipa / Algom / Atlas (`XAI_MODEL` default `grok-4.20-0309-non-reasoning`); **OpenAI** in Atlas / Sprinter / VJH-judge; **Gemini** in Sprinter / blog-es. Fullest chain = Atlas (**Claude → Groq → OpenAI → Grok**). **CORRECTION (June 25):** an earlier draft of this note wrongly stated EspaLuz was "Claude + OpenAI only, no Groq/Grok" — that was a grep artifact (matched backup files). EspaLuz has the Claude→Groq fallback; "free grok" = **Groq**, the free Llama provider (not xAI Grok). The fleet is uniformly resilient to a single Anthropic outage.
- **VibeJobHunter (`vibejobhunter` systemd):** honest-LEAD mode — surfaces right-fit (fully-remote · LATAM-open · AI-augmented · no-coding) jobs to Telegram + HubSpot "🔥 I Act TODAY", **capped at 6/cycle** (`VJH_SURFACE_CAP`). Deploy: `cd /home/ubuntu/VibeJobHunterAIPA_AIMCF && git pull && sudo systemctl restart vibejobhunter`. Full chain + the "0-surfacing" bug-chain gotchas: VJH `CLAUDE.md` → "CURRENT PIPELINE". **Dedup stores:** `autonomous_data/seen_jobs.json` (`seen_jobs_v2`) + `vjh_checkpoint.db` — clearing them WITHOUT the surface cap **floods Telegram** (happened June 23; cap added).

## 🟢 VJH retargeting + self-evolving judge (July 8-9 2026)

> ⚠️ **The judge half of this entry is SUPERSEDED by the August 14 2026 section at the
> top of this doc.** Still accurate here: the signal-honesty rule (`qualifiedtobuy` is
> bot-filed and does not count) and the fail-safe design. Now WRONG here: the cron is
> **daily `17 6 * * *`**, not weekly `17 3 * * 0`; the loop no longer learns bare titles
> (it carries her reasons and her screenshots); positives now also include her own
> applications in `decisionmakerboughtin` when a note confirms she applied; and the cap
> is 12, not 6. The Torre/lane retargeting bullets below are unaffected.

Built after a head-to-head comparison with JobCopilot (paid SaaS, weworkremotely.jobcopilot.com — Elena has access): VJH filters far more precisely for her constraints; JobCopilot's one real edge was its "delete jobs you don't like → trains your copilot" feedback loop. That loop is now adapted into VJH, honestly. All changes additive — eval harness stayed **115 pass / 14 skip** after every deploy; exclude lists / LangGraph shape / safety nets untouched. Commits (VibeJobHunterAIPA_AIMCF):

- **`d138821` Torre.ai links fixed:** `torre.ai/jobs/{slug}` 404s to `/en/404`; the public page resolves on the opaque **`id`** (`torre.ai/jobs/{id}` → redirects to `{id}-{slug}`). Verified live against Torre's API + both URL patterns. Every Torre HubSpot deal before this carried a dead link.
- **`ad00d42` Torre real locations + timezone signal:** (1) Torre jobs were blanket-labeled `"Remote — LATAM / Americas"` regardless of Torre's real `locations` array (an OR-list of accepted countries) — now built from real data; a non-empty list with no LATAM country flows to `COUNTRY_LOCK` and parks honestly. (2) `fit_gate.py` fallback branch (only when no region tag decides first) now recognizes **US Eastern/Central time-zone phrases** (Panama = UTC-5 year-round) via \b-bounded regex — "must overlap Eastern Time" jobs that never say LATAM/worldwide were invisible. False-positive guard: bare `et`/`ct`/`est` substrings ("mark**et**", "b**est**") can't match.
- **`dc54b6c` Elena's CORRECTED target lanes** (her words July 9: *"I am not a Machine Learning Engineer… I am not a researcher"*): **(a) AI-augmented products/agents/systems BUILDER, (b) GEO/AEO/Tech SEO, (c) AI Automation & AI-augmented engineering SOLUTIONS ARCHITECT** — encoded in all three layers: `job_gate.py` (new \b-bounded `seo_term` standalone title lane — "Technical SEO Lead" had no AI term so the ai×builder detector never fired — plus SEO/AEO/product-owner include phrases), `fit_gate.py` (`_SEO_AEO_PATTERNS` in `ai_aug`; "seoul"/"archaeology" substring-guarded), `llm_judge.py` (prompt names the 3 lanes; **vetoes pure ML/AI research** — research scientist/engineer, academic). Live-verified on Oracle: SEO lane → approve, ML Research Scientist → veto.
- **`a550977` Self-evolving judge (the JobCopilot adaptation):** weekly cron (`17 3 * * 0`, ubuntu crontab) runs **`scripts/judge_feedback_sync.py`** (stdlib-only) → pulls `[HIRING-*]` outcomes from HubSpot → writes `autonomous_data/judge_feedback.json` → `llm_judge.py` injects the titles as few-shot taste calibration ("refines judgment, does NOT override criteria 1-4"). **Signal honesty:** positives = ONLY stages Elena moves by hand (`presentationscheduled`/`contractsent`/`closedwon`) — **`qualifiedtobuy` is bot-filed and does NOT count**; negatives = `closedlost`. **Fail-safe:** file absent/corrupt → prompt byte-identical to pre-feature; sync failure → existing file untouched (atomic tmp+rename). First run July 9: 6 real negatives, 0 positives (honest — none manually advanced yet). Log: `autonomous_data/judge_feedback_sync.log`.
- **Outcome report (cto-aipa `fa1367c`):** `scripts/vjh-outcome-report.cjs` (read-only) — acted-on/rejected/untriaged buckets by source prefix + top title words per bucket. **July 9 findings:** SERP-LEAD path = 414 deals, **0% acted-on**; bot path = 78 deals, 46% (inflated — see qualifiedtobuy caveat above). ⚠️ **Open question:** whether the SERP/Google-Jobs ingest path is worth keeping at all.
- **Restart rule (Iron Rule #11 still applies):** after touching `fit_gate.py`/`job_gate.py`/`llm_judge.py`, restart BOTH `sudo systemctl restart vibejobhunter` AND `pm2 restart serpapi-jobs`. The judge reads `judge_feedback.json` per-call (no restart needed for feedback updates alone).
- **Honest capability line vs JobCopilot:** VJH discovers more broadly, filters more precisely, tracks outcomes in a real CRM, and now updates its judge's taste weekly from Elena's demonstrated behavior. It deliberately does NOT click the final submit (LEAD mode) — that stays Elena's call. JobCopilot's remaining edge is only the auto-fill/submit step.

---

## 🟢 Lead Concierge — Fable 5 in Make.com + Oracle one-tap send (v3, July 12 2026)

**What it is:** every new portfolio inquiry becomes a Fable 5 reply draft in Elena's Telegram with **[✅ Send now] [✏️ Edit] [🗑 Skip]** buttons; one tap emails the lead from `aipa@aideazz.xyz` (reply-to Elena's gmail) and logs the sent text as a **note on the HubSpot contact** (CRM trail). Make cloud does the AI drafting (scenario `5633833`, us2, org `938264`, paid plan, ALWAYS-ON polling every 15 min); **the buttons/send/notes run on THIS VM inside `cto-aipa`** (`src/concierge.ts`).

**Flow (v3 + July 23 fix):** InquiryForm → cto-aipa `/marketing/inquiry-proxy` → `business_leads` + **INSTANT HubSpot push** (July 12: no longer waits for the 08:00 UTC triage cron; `CLIENT-CTO-INQUIRY` bypasses the buying-intent keyword gate; inquiry text → contact `message` prefixed `[AIDEAZZ-FORM]`; allowlisted test emails force-recreate the contact so Make Contacts/Created fires; reused production emails POST `MAKE_CONCIERGE_WEBHOOK_URL`) → Make "Watch CRM Objects" (Contacts/**Created**, filter **`message` contains `AIDEAZZ-FORM`**) **or** Custom Webhook → Anthropic Claude (`claude-fable-5`, max 1500) → **HTTP POST `https://webhook.aideazz.xyz/cto/concierge/draft`** (Bearer `CONCIERGE_SECRET`; form-urlencoded `claude_output`) → recipient resolve via `findRecentInquiryContacts(90)` (stamped / recent `[CLIENT-CTO-INQUIRY]` deals) with fallback `findRecentContacts` + first-name match → Telegram buttons → Resend + HubSpot note. Drafts in `data/concierge/`. Edit = REPLY to the draft TG message (20+ chars).

**Failure modes + fixes:**
- `[400] credit balance is too low` (Make Claude module) → Anthropic API is prepaid — top up at console.anthropic.com Plans & Billing.
- No TG after form submit → (1) Make filter must be `message` contains `AIDEAZZ-FORM` (not "own forms"/analytics source — form ≡ radar fingerprint). (2) Reused non-test email needs `MAKE_CONCIERGE_WEBHOOK_URL` on Oracle. (3) Test emails (`CONCIERGE_TEST_EMAILS`, default adamvelena / marinakulaginabowen / kiravelerevich) recreate the contact — check Make history + `grep inquiry ~/.pm2/logs/cto-aipa-out*.log`. (4) `grep concierge` for `/concierge/draft`.
- "Recipient could not be determined" TG notice → >1 contact created in the 45-min window with no name match; reply manually from the notice.
- **`🚫 SPAM from unknown` TG noise every 15 min — FIXED July 17 2026 (`1e11dde`, completes the `e3feb31`→`1fd39ec`→`f164ca6` junk-drop chain).** HubSpot auto-imports (CalendarSync dumped ~90 inbox contacts July 16) kept firing Make's Contacts/Created trigger; Fable 5 correctly said SPAM, but the SPAM branch in `src/concierge.ts` returned BEFORE the quiet-drop logic and paged Telegram unconditionally. Now: SPAM verdict with **no name AND no email** → console-log only (`SPAM verdict for unidentifiable sender — dropped quietly`); a **named** sender flagged SPAM still pages Elena (possible misjudged real lead). Upstream waste remains: Make still burns ops + Fable 5 tokens on each junk contact — the real cure is a filter in scenario `5633833` skipping contacts not created by our integration (Make UI change, not code).
- Confirmation/reply emails "not received" → Resend accepted + DNS verified OK (DKIM `resend._domainkey`, SPF on `send.aideazz.xyz`, DMARC p=none): **check Gmail Spam** — cold sender reputation; verify true delivery status in the Resend dashboard (API key is send-only, can't query events).
- **CONFIRMED July 16 2026 — replies DO land in Gmail spam.** A real lead (`espaluztester@gmail.com`) reported nothing arrived while Telegram said `✅ SENT`; it was in spam. Full DNS re-check that day: SPF `send.aideazz.xyz` = `v=spf1 include:amazonses.com ~all` ✅, DKIM `resend._domainkey.aideazz.xyz` present + aligns with From `aipa@aideazz.xyz` ✅, DMARC `p=none` ✅, SES bounce MX `feedback-smtp.us-east-1.amazonses.com` ✅ — **auth is not the problem; sender trust is** (new domain, near-zero volume). Two fixes shipped: (1) `src/concierge.ts` now **captures Resend's message id**, persists it on the draft, logs it, and shows it in the TG receipt — previously the id was discarded and the key is send-only (`401` on `GET /emails`), so every "never arrived" was unfalsifiable; (2) mail now sends **multipart `text` + `html`** (HTML-only is a structural spam signal). Remaining levers are Elena's, not code: mark **"Report not spam"** in Gmail (highest value), cut first-reply link count in the Fable 5 prompt (that reply carried 4 links), and only later raise DMARC `p=none` → `p=quarantine`. **"✅ SENT" means Resend ACCEPTED, never "delivered" — look the id up in the dashboard.**
- Scenario won't toggle ON → Make active-scenario plan limit.
- Trigger pointer consumes contacts per run — re-testing needs a NEW test contact (fresh email, gmail `+alias` works).
- Buttons dead after pm2 restart → drafts survive (`data/concierge/`), but reply-to-edit needs the draft's `tgMessageId` — drafts created before July 12 evening lack it.

**Case study published July 11 (the meta-play):** https://dev.to/elenarevicheva/how-i-wired-claude-fable-5-into-makecom-to-answer-my-portfolio-leads-8-days-after-launch-h93 (+ LinkedIn via Buffer, + Make Community). Watch HubSpot for `utm_campaign=fable5-case-study`.

---

## 🟢 SELLING PIVOT + SerpAPI re-subscribed (July 10-11 2026)

**Elena's directive July 10: done building without selling — every hour goes to putting her in front of a buyer.** Canonical selling kit: **`docs/selling/SELLING_KIT.md`** (positioning names, 3 offers with pricing, Upwork/Fiverr copy, proposal template, week-1 firing sequence). Umbrella identity: **Production AI Builder**; lanes: Conversational AI Agent Builder (WhatsApp·Telegram) · AI Automation & Integration Architect · AI Search Visibility Architect (GEO/AEO/Tech SEO).

**July 10 live fleet audit (verify-from-logs, both ends — Oracle logs + HubSpot API), key findings:**
- HubSpot funnel truth (861 deals): **0 contractsent / 0 won ever** — intake works, conversion motion never existed. Success metric now = buyer replies landing at `contractsent`.
- 🟢 Alive writers: VJH SERP (`[HIRING-VJH-SERP-LEAD]` 222 deals/28d, hourly) + VJH LangGraph (79) + cto-aipa crm-event hub.
- 🔴 `algom-stream` crash-looping since ~June 13: X API **account 1910676161845186560 has no credits** (restart loop every 30s — top-up or `pm2 stop algom-stream`). `[CLIENT-ALGOM]` frozen since June 13.
- 🔴 `openclaw-gateway` systemd **inactive**; `[HIRING-OPENCLAW]` never wired (0 deals ever).
- 🔴 `[ESPALUZ]` HubSpot deals = June 29 wiring TESTS only (incl. duplicates) — no live EspaLuz→HubSpot writer exists.
- 🟡 `[CLIENT-CTO-SERP]` was dry June 22→July 10 (BrightData SERP sparse + gate); `[CLIENT-CTO-INGEST]` trickle; `[ATLAS-RADAR]` 1 deal (July 9, by design new).

**SerpAPI re-subscribed July 11 (Starter, 1,000 searches/mo) — cto-aipa `48f38b1`:**
- `serpapi-prospects.ts`: BD-first kept; **SerpAPI fallback re-enabled** when BD returns 0, guarded by live quota check (`SERPAPI_RESERVE`, default 200, protects VJH hiring ingest on the same key). Quota probe: `curl "https://serpapi.com/account?api_key=$K"`.
- **4 new buyer queries mapped to the kit offers:** `whatsapp_agent` (EN reddit), `whatsapp_es` (Spanish, hl=es — LATAM lane), `automation_hire` (make/n8n/zapier "hire someone"), `geo_aeo`. Per-query `lang` threads through both engines.
- Intent-classifier prompt now sells the kit's offers + reads Spanish results (labels stay English). `offer-pricing.ts`: whatsapp/telegram/bot-de → agent_build.
- **Verified live (dry-run on Oracle):** 88 fetched (was 48) · quota guard "998 left → fallback ENABLED" · 1 genuine lead first run (`geo_aeo` SMB → $3,000 est). Deployed: pull → `npm run build` → `pm2 restart cto-aipa`.

---

## Server

| Field     | Value |
|----------|--------|
| **Public IP** | `170.9.242.90` |
| **SSH**  | `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90` |
| **OS**   | Ubuntu 24.04, 12 GB RAM, VM.Standard.E5.Flex |

---

## All 11 AI Agents on Oracle (Canonical List)

Every agent on this instance **must** have: (1) restart hardening, (2) a health-check (HTTP or process liveness) that restarts if unhealthy, (3) included in OCI keep-alive — **except AWS-only modules** (Sprinter), which use CloudWatch + EventBridge instead.

| # | Name | Repo | Try it / See it | Process manager | Service / PM2 name | Health URL or check | Public web (4everland) | Web repo (`main` deploy) | Local checkout note |
|---|------|------|------------------|------------------|--------------------|----------------------|--------------------------|---------------------------|---------------------|
| 1 | **EspaLuz WhatsApp** | [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | [wa.me/50766623757](http://wa.me/50766623757) | systemd | `espaluz-whatsapp` | `http://127.0.0.1:8081/webhook` | — | — | — |
| 2 | **EspaLuz Telegram** | [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | [t.me/EspaLuzFamily_bot](https://t.me/EspaLuzFamily_bot) | systemd | `espaluz-familybot` or TBD | Add `/health` or use `systemctl is-active` | — | — | — |
| 3 | **EspaLuz Influencer** | [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | [t.me/Influencer_EspaLuz_bot](https://t.me/Influencer_EspaLuz_bot) | systemd | `espaluz-influencer` | Confirm port on server; add block in script | — | — | — |
| 4 | **Algom Alpha** | [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Automated posting on @reviceva | PM2 or systemd | e.g. `dragontrade` or `algom-alpha` | Add HTTP health or process check | — | — | — |
| 5 | **VibeJob Hunter** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | [t.me/vibejob_hunter_bot](https://t.me/vibejob_hunter_bot) | systemd | `vibejobhunter` | `systemctl is-active vibejobhunter` (autonomous loop; no HTTP) | — | — | — |
| 6 | **AI Marketing Co-Founder (CMO)** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) (same repo as 5) | [LinkedIn](https://linkedin.com/in/elenarevicheva), [Instagram](https://instagram.com/elena_revicheva) | systemd | `vibejobhunter-web` | `http://127.0.0.1:8080/health` (FastAPI: CTO `/api/tech-update`, `/health`) | [aideazz.xyz](https://aideazz.xyz) | [aideazz](https://github.com/ElenaRevicheva/aideazz) | `D:\aideazz\aideazz` |
| 7 | **OpenClaw Vibejob Shortlist** | [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | [t.me/OpenClaw_VibeJobsList_bot](https://t.me/OpenClaw_VibeJobsList_bot) | systemd | `openclaw-gateway` | `http://127.0.0.1:18789/` | — | — | — |
| 8 | **Tech Co-Founder (CTO AIPA)** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | [t.me/aitcf_aideazz_bot](https://t.me/aitcf_aideazz_bot) | PM2 | `cto-aipa` | `http://127.0.0.1:3000/` | — | — | — |
| 8.1 | **Sprint Briefing (Sprinter)** *(CTO AIPA — AWS)* | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (`src/sprint-briefing/`); packaging workspace `D:\aideazz\SprintBriefingAgent` | Private Telegram (Sprint Briefing audio) | AWS Lambda | `sprint-briefing-agent` | CloudWatch `/aws/lambda/sprint-briefing-agent` · EventBridge schedule `cron(0 13 * * ? *)` (~8:00 America/Panama) | — | — | **Sprinter:** Lambda/SAM workspace — not an Oracle systemd/PM2 process (see [AILA symphony §8.1](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)) |
| 9 | **Creative Co-Founder Atuona** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (same repo as 8) | [@Atuona_AI_CCF_AIdeazz_bot](https://t.me/Atuona_AI_CCF_AIdeazz_bot) | PM2 (same process as 8) | `cto-aipa` | `http://127.0.0.1:3000/` | [atuona.xyz](https://atuona.xyz) | [atuona](https://github.com/ElenaRevicheva/atuona) | *No local web checkout — deploy site from GitHub `main` only (4everland)* |
| 10 | **AILA** (Adaptive Intelligent Life Assistant) | [AILA](https://github.com/ElenaRevicheva/AILA) | *Not deployed as its own process on Oracle* — repo holds architecture, blueprint, Hive integration notes. **PAUSED deliberately; Elena is returning to it.** See the AELA note below. | — | — | — | — | — | `D:\aideazz\AILA` (planning repo) |

> **AELA = AILA, renamed. Canonical is [`ElenaRevicheva/AILA`](https://github.com/ElenaRevicheva/AILA).** (Established Aug 16 2026.) The repo was renamed `AELA` → `AILA` on GitHub, and the old URL still resolves via GitHub's redirect — which is exactly why a stale clone under the old name looked like a second project. Proof they are one repo: Oracle's `aela` clone fetched `origin/docs` at `c98f3e7`, the same commit as the canonical local clone `D:\aideazz\AILA` (branch `docs`).
>
> **Oracle's stale `/home/ubuntu/aela/` was removed Aug 16 2026** — 254 MB, 10,079 files, untouched since 20 March, **no process, no systemd unit, no PM2 entry**. Safe to remove: its HEAD `5ce3f8e` was *behind* `origin/docs` `c98f3e7`, **0 unpushed commits**, nothing unique outside `.claude/` (tool settings) and a `.env`. Backup at `~/backups/aela-oracle-copy.*.tgz` (69 MB). **Nothing was lost.**
>
> Removing it also cut one copy of `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` off the VM.
>
> **Rule going forward:** AILA is **paused deliberately** and Elena is returning to it. Work from `D:\aideazz\AILA` (branch `docs`) against `github.com/ElenaRevicheva/AILA`. Do **not** recreate a clone on Oracle — it is a planning repo, not a deployed process. If you meet the name "AELA" anywhere, it is the old name for this same repo.
| 11 | **Atlas Shifted** (Marketing Strategist) | [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | [live radar](https://webhook.aideazz.xyz/whitespace/atlas.html) | PM2 | `whitespace` (port 8095) | `http://127.0.0.1:8095/healthz` | via `webhook.aideazz.xyz/whitespace/` (nginx → :8095) | — | `D:\aideazz\whitespace` (Oracle `/home/ubuntu/whitespace`; folder ≠ repo). Data backup repo: `atlas-captures` |
| 12 | **n8n** (ops/CRM automation engine) | *no repo — workflows live in n8n's own SQLite at `~/.n8n`* | [editor](https://webhook.aideazz.xyz/crm/) (n8n owner login) | PM2 | `n8n` (port 5678, **bound to 127.0.0.1**) | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5678/` → 200 · executions: `sqlite3 ~/.n8n/database.sqlite "SELECT id,status FROM execution_entity ORDER BY id DESC LIMIT 5;"` | via `webhook.aideazz.xyz/crm/` (nginx → :5678) | — | No local checkout — n8n is installed globally (`npm i -g n8n`), workflows are edited in the browser. **Export workflows to git before any upgrade.** |
| 13 | **Ops dashboard** (private CRM view) | [aideazz-ops-dashboard](https://github.com/ElenaRevicheva/aideazz-ops-dashboard) | [webhook.aideazz.xyz/ops/](https://webhook.aideazz.xyz/ops/) — **HTTP basic auth**, user `elena` | nginx static (`/var/www/ops`) | — (no process) | `curl -o /dev/null -w '%{http_code}' https://webhook.aideazz.xyz/ops/` → **401 expected** (200 would mean the lock is off) | served from `webhook.aideazz.xyz/ops/`, deliberately NOT on the public marketing site | — | `D:\aideazz\aideazz-ops-dashboard`. Deploy: `MSYS_NO_PATHCONV=1 npx vite build --base=/ops/` then `scp -r dist/* oracle:/var/www/ops/` |

**Repos (8 on Oracle VM):** EspaLuzWhatsApp, EspaLuzFamilybot, EspaLuz_Influencer, dragontrade-agent, VibeJobHunterAIPA_AIMCF, openclaw-vibejob-shortlist, AIPA_AITCF, AILA (8 repos for agents **on the VM**; 8+9 share AIPA_AITCF, 5+6 share VibeJobHunterAIPA_AIMCF). **Sprinter** uses the same **AIPA_AITCF** codebase path plus optional **`D:\aideazz\SprintBriefingAgent`** workspace for AWS packaging — runtime on **AWS Lambda**, not under `/home/ubuntu/` PM2/systemd.

**Public sites:** [aideazz.xyz](https://aideazz.xyz) and [atuona.xyz](https://atuona.xyz) — **4everland** hosting, deploy from GitHub **`main`**. Not Oracle processes; columns above tie each site to its owning agent narrative.

> **⚠️ Frontend serving chain (learned July 15 2026):** these static sites are served by **BunnyCDN pulling from a 4everland/IPFS origin** — NOT directly from Oracle. So a site outage is **independent** of the Oracle VM: Oracle can be 100% healthy (all agents + `webhook.aideazz.xyz/cto` returning 200) while the public site is down. Diagnose the layers separately before touching anything.
>
> **Incident — aideazz.xyz `502 Bad Gateway` (July 15 2026):** whole site 502 with `Server: BunnyCDN`, `CDN-PullZone: 5088105`, **`ErrorCode: 107`**. Root cause = Bunny's **IPFS origin pin went stale/unreachable** (same failure class as the July raw-IPFS-resolution blog incident below). Oracle was fully healthy throughout. **Fix = push a real rebuild commit to `aideazz` `main`** (must NOT be `[skip ci]`, or 4everland won't rebuild) → 4everland re-pins a fresh IPFS CID → Bunny origin recovers in **~90–180s**. Recovery order: **subpaths (`/portfolio`) return 200 first, root `/` last** — so keep checking root before declaring failure. **Before triggering, `git pull --ff-only` first** — the live build is from GitHub `origin/main`, which may be ahead of a stale local clone; never rebuild from behind. **If a push does NOT recover it**, the 4everland project itself is likely paused/expired — that lives in Elena's **4everland dashboard** (credential boundary — Claude cannot reach it).
>
> **✅ RESOLVED — re-verified live July 31 2026.** The `www` redirect is **working**; the museum copy is gone. Do not act on the incident notes below without re-checking first:
> ```
> curl -sI https://www.aideazz.xyz   → HTTP/1.1 301 Moved Permanently
>                                       Location: https://aideazz.xyz/
>                                       Server: cloudflare
> curl -sI https://aideazz.xyz       → HTTP/1.1 200 OK
>                                       Server: BunnyCDN · CDN-PullZone: 5088105
> ```
> The Cloudflare 301 Redirect Rule described in the fix below was restored at some point between Jul 21 and Jul 31 and nobody updated this doc. On Jul 31 an agent read the stale entry and told Elena her `www` was serving a museum copy — she pushed back, one `curl` settled it, and she was right. **Lesson: this doc records what was true on the date written. Verify the live system before repeating any claim from it** — the same rule already stated in [[feedback_verify_from_logs]]. The history below is kept because the failure mode is real and can recur.
>
> **Incident — `www.aideazz.xyz` museum copy (confirmed July 21 2026 · FIXED, see above):** **`https://aideazz.xyz`** (apex) and **`https://www.aideazz.xyz`** are **two different front doors**, not one site with a cache bug.
> - Apex: Bunny pull zone **`5088105`**, current IPFS root (fresh SOP / July 21 content). DNS A → Bunny edge.
> - `www`: Cloudflare-proxied → Bunny pull zone **`5088110`** → **different / older IPFS CID** (old title “AI Personal Assistants That Evolve With You”). HTTPS returns **200** (no redirect).
> - Phase 1f (Apr 18) recorded a Cloudflare **301 `www` → apex** Redirect Rule + SPA JS redirect in `aideazz` `src/main.tsx`. Live check Jul 21: **the CF 301 is gone/broken**; JS redirect never runs because `www` serves the old pin, not the current SPA.
> - **Force-redeploying 4everland does NOT fix `www`** — GitHub `main` only refreshes the apex project/CID (zone `5088105`).
> - **Fix (Elena — Cloudflare dashboard, ~2 min):** Rules → **Redirect Rules** → create (or restore):
>   1. If hostname equals `www.aideazz.xyz`
>   2. Then Dynamic redirect → `concat("https://aideazz.xyz", http.request.uri.path)` (preserve query string)
>   3. Status **301** · place at top of rules
>   Verify: `curl -sI https://www.aideazz.xyz/sop-ai-ops.html` → **301** `Location: https://aideazz.xyz/sop-ai-ops.html`, then apex **200** with fresh title. Optional: add `CLOUDFLARE_API_TOKEN` + zone id to `cto-aipa/.env` so agents can restore this without a dashboard login.
### Canonical deploy directories on Oracle (`ubuntu@170.9.242.90`)

Each **GitHub repo** has **one** working tree on the VM — **no duplicate clones** for the same product. Agents that share a repo share **one directory** and differ only by **process** (systemd unit or PM2 app name).

| GitHub repo | Deploy path on VM | Agents (#) |
|-------------|-------------------|------------|
| [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | `/home/ubuntu/EspaLuzWhatsApp` | 1 |
| [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | `/home/ubuntu/EspaLuzFamilybot` | 2 |
| [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | `/home/ubuntu/EspaLuz_Influencer` | 3 |
| [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | `/home/ubuntu/dragontrade-agent` — if PM2 shows a different cwd, treat that as source of truth | 4 |
| [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | `/home/ubuntu/VibeJobHunterAIPA_AIMCF` | 5 + 6 |
| [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | `/home/ubuntu/openclaw-vibejob-shortlist` | 7 |
| [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | `/home/ubuntu/cto-aipa` | 8 + 9 |
| [AILA](https://github.com/ElenaRevicheva/AILA) | *not deployed — no canonical path yet* | 10 |
| [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | `/home/ubuntu/whitespace` (folder ≠ repo; renamed whitespace→atlas-aipa→atlas-shifted, GitHub redirects) | 11 |

**Same repo, two agents (still one clone):** **#8 + #9** → one checkout **`/home/ubuntu/cto-aipa`**, one PM2 app `cto-aipa`. **#5 + #6** → one checkout **`/home/ubuntu/VibeJobHunterAIPA_AIMCF`**, two units (`vibejobhunter`, `vibejobhunter-web`).

**Sprinter (#8.1):** Runs on **AWS Lambda** (`sprint-briefing-agent`), **not** under systemd/PM2 on this VM. Product narrative and architecture match **[AILA — `AILA_SYMPHONY_ANALYSIS.md` §8.1](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)**. Ship pipeline code from **[AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF)** `src/sprint-briefing/`; optional local packaging folder **`D:\aideazz\SprintBriefingAgent`**.

**Wallet / DB (CTO only):** Autonomous DB wallet for CTO AIPA lives under **`/home/ubuntu/cto-aipa/wallet/`** (see §7).

### Canonical local folders + Git remotes (development machine)

> **⚠️ AI ASSISTANT RULE:** This section is the **single source of truth** for all local folder paths and GitHub repos. **Never ask Elena where a repo lives — look here first.** Never create duplicate checkouts. If a path below says "no local checkout", that means no local folder exists — work from GitHub directly.

This doc is the **single map**: **Oracle VM paths** (above) + **where your authoritative clones live locally** + **which GitHub repo each tracks**. **One clone per repo** — never two working trees with the same `origin` (e.g. do **not** duplicate **VJH** under `ai-cofounders` if `D:\aideazz\VibeJobHunterAIPA_AIMCF` already exists).

| GitHub repo | Canonical local path (Windows) | Notes |
|-------------|----------------------------------|--------|
| [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | `D:\aideazz\ai-cofounders\cto-aipa` | Folder name **`cto-aipa`** ≠ repo name — intentional (Cursor/workspace layout). Remote: `ElenaRevicheva/AIPA_AITCF`. |
| [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | `D:\aideazz\VibeJobHunterAIPA_AIMCF` | **Authoritative VJH + CMO checkout** — lives under `D:\aideazz\`, not under `ai-cofounders`. |
| [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | `D:\aideazz\EspaLuzWhatsApp` | Clone once; matches GitHub repo name. |
| [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | `D:\aideazz\EspaLuzFamilybot` | Same. |
| [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | `D:\aideazz\EspaLuz_Influencer` | Same. |
| [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | `D:\aideazz\dragontrade-agent` | Same. |
| [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | `D:\aideazz\openclaw-vibejob-shortlist` | Same. |
| [AILA](https://github.com/ElenaRevicheva/AILA) | `D:\aideazz\AILA` | Repo-only until deployed on Oracle; symphony inventory source on branch **`docs`**: [`AILA_SYMPHONY_ANALYSIS.md`](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md). |
| [aideazz](https://github.com/ElenaRevicheva/aideazz) | `D:\aideazz\aideazz` | **[aideazz.xyz](https://aideazz.xyz)** — **4everland** hosting, deploy from GitHub **`main`**. Pages: [`/portfolio`](https://aideazz.xyz/portfolio) (AI products portfolio card), [`/pitch.html`](https://aideazz.xyz/pitch.html) (pitch page). i18n content in `src/i18n/locales/en.json` + `es.json`. Static assets / PDFs in `public/`. |
| [atuona](https://github.com/ElenaRevicheva/atuona) | **No local checkout** | **[atuona.xyz](https://atuona.xyz)** — **4everland**, deploy from GitHub `main` **only**. No `D:\aideazz\atuona` folder exists — edit via GitHub or clone fresh if needed. |
| **Sprinter** (Lambda workspace; pairs with AIPA_AITCF) | `D:\aideazz\SprintBriefingAgent` | AWS SAM/Lambda packaging for Sprint Briefing — mirrors **`src/sprint-briefing/`** in AIPA_AITCF (see §8.1 in symphony doc). |
| [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | `D:\aideazz\whitespace` | **Atlas Shifted** marketing-angle radar. Folder **`whitespace`** ≠ repo `atlas-shifted` (renamed whitespace→atlas-aipa→atlas-shifted). Oracle `/home/ubuntu/whitespace`, PM2 `whitespace`:8095. Data time-series backup repo: **`atlas-captures`** (private; daily cron pushes `captures.jsonl`). |

**Verify anytime:** `git remote -v` should show `ElenaRevicheva/<repo>` — if two folders point at the same remote, delete or repurpose the duplicate spare checkout.

#### How CTO AIPA accesses all repos — including private ones

**On your Windows dev machine:** every repo is cloned at the canonical path in the table above. Git credentials are configured locally — `git pull` and `git push` work without additional login.

**On Oracle VM (`170.9.242.90`):** use **HTTPS + `GITHUB_TOKEN`** (PAT in `/home/ubuntu/cto-aipa/.env`). GitHub **deploy keys are one-repo-only** — the atlas key cannot pull private repos like `EspaLuzFamilybot`. Do **not** rely on `https://github.com/...` without credentials (fails with `could not read Username`).

**One-time fix (refresh PAT or after token rotation):**

```bash
# On Oracle VM — pass new PAT once (also updates cto-aipa/.env + ~/.git-credentials):
TOKEN=ghp_YOUR_NEW_PAT bash ~/oracle-fix-git-https-auth.sh

# Or from Windows:
scp -i ~/.ssh/ssh-key-2026-01-07private.key \
  scripts/oracle-resilience/oracle-fix-git-https-auth.sh ubuntu@170.9.242.90:~/
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90 \
  "TOKEN=ghp_YOUR_NEW_PAT bash ~/oracle-fix-git-https-auth.sh"
```

**Verify:** `cd /home/ubuntu/EspaLuzFamilybot && git fetch origin main` (no username prompt).

**EspaLuz deploy note:** runtime JSON (`subscribers.json`, `paguelofacil_payments.json`, trials) may differ from git — prefer `git fetch` + `git checkout origin/main -- <code-files>` for code-only deploys, or stash before pull. See `EspaLuzFamilybot/deploy/BACKUP_AND_ROLLBACK_PAGUELOFACIL_WA.md`.

#### Cloud agent deploys (no laptop SSH) — **June 30, 2026 — full fleet**

Cursor Cloud Agents **cannot** SSH to Oracle. Deploy **all 11 agents** from your **phone** via GitHub Actions:

1. **One-time secrets** on [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF):
   - **`ORACLE_SSH_KEY`** — all Oracle products (#1–11)
   - **`AWS_ACCESS_KEY_ID`** + **`AWS_SECRET_ACCESS_KEY`** — Sprinter Lambda (#8.1) only
2. **From phone:** GitHub → **Actions** → **Deploy to Oracle VM** → pick **product** → Run
3. **Products:** `whatsapp` · `telegram` · `influencer` · `dragontrade` · `vjh` · `vjh_web` · `openclaw` · `cto_aipa` · `atlas` · `fleet-verify` · `sprinter-aws`

Registry: `scripts/oracle-resilience/oracle-products.conf` · universal deploy: `deploy-product.sh`

**Not on Oracle SSH:** AILA (#10, not deployed) · [aideazz.xyz](https://aideazz.xyz) / [atuona.xyz](https://atuona.xyz) → push GitHub `main` → 4everland

Full guide: `scripts/oracle-resilience/CLOUD_AGENT_DEPLOY.md` · workflow: `.github/workflows/deploy-oracle.yml`

**Cloud agent loop:** fix → push product repo `main` → (optional) merge AIPA_AITCF registry → phone → Actions → product.

#### EspaLuz bots — sync status (June 30, 2026, verified live)

| Layer | WhatsApp (#1) | Telegram (#2) |
|-------|---------------|---------------|
| **GitHub `main`** | `11829c3` (Atlas prefilled + June 30 stack) | `65ad940` (Atlas `/start=expat_language_*` + memory/RAG/PF) |
| **Local (Elena PC)** | `11829c3` ✓ | `65ad940` ✓ |
| **Oracle live HEAD** | `11829c3` ✓ | `65ad940` ✓ (synced June 30) |
| **Services** | `espaluz-whatsapp` active | `espaluz-familybot` + `espaluz-payments-webhook` active |
| **Memory/RAG** | `get_session_uuid` ✓ · PG 346 chat rows · 84 embeddings | `get_session_uuid` ✓ · same PG · TG sessions 26 677 bytes preserved |

**WhatsApp Atlas:** new prefilled `concept_id` path in `11829c3` (`espaluz_bridge.py` + `user_trial_system.py`). June 30 fixes (`4084e45` memory, LLM chain, markdown, PF) included via fast-forward — not overwritten.

**Telegram Atlas:** already in `main.py` at `65ad940` via `/start=expat_language_*` — no separate Atlas commit needed.

**Telegram Oracle drift (fixed):** Oracle had been at `80be496` with local staged PF/memory edits. Synced with backup → checkout code → restore runtime JSON → `git merge --ff-only origin/main`. Script: `scripts/espaluz-hotfixes/deploy-telegram-june30-sync.sh`.

**Expected `git status` on Oracle Telegram:** runtime JSON files show `M` (prod data vs empty placeholders still tracked in git) — **normal; do not commit**. Untracked `??` backup/mp3 files are safe to delete.

**WhatsApp Oracle stash:** `stash@{0}: pre-atlas-deploy-oracle-local` — old local hotfixes; drop with `git stash drop stash@{0}` when confirmed unneeded.

**Before cloud-agent deploy:** set `ORACLE_SSH_KEY` on AIPA_AITCF; use `PRODUCT=telegram` or `deploy-telegram-june30-sync.sh` pattern for future Telegram code-only deploys.

| What you need | Where to go |
|---------------|-------------|
| Any repo file | `cd /d/aideazz/<canonical-path>` (see table above) |
| AILA (private docs branch) | `cd /d/aideazz/AILA` — already on branch `docs` |
| CTO AIPA / Atuona / Sprinter | `D:\aideazz\ai-cofounders\cto-aipa` |
| atuona.xyz site (no local checkout) | Push changes via GitHub directly — no local folder |

If a path says **"no local checkout"** in the table → use GitHub API or browser only, do **not** create a new local clone.

**Cross-links:** Planning inventory — [AILA `AILA_SYMPHONY_ANALYSIS.md`](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md). Ops / health — this file on **[AIPA_AITCF `main`](https://github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md)**.

---

**Note on #10:** The [AILA](https://github.com/ElenaRevicheva/AILA) product is listed as the tenth *agent slot* in the canonical inventory (longitudinal personal assistant). There is no separate systemd/PM2 service or health URL until AILA is deployed; add `check_oracle_health.sh` / `oci_keepalive.sh` hooks when a runnable service exists.

**Action:** On the server run `pm2 list` and `systemctl list-units --type=service --all | grep -E 'espaluz|cto|vibe|dragon|algom'` and set the exact service/PM2 names and ports in the health script. Add a simple HTTP health endpoint in any bot that doesn’t have one (e.g. `/health` returning 200) so the cron can detect hangs, not only crashes.

**DragonTrade (Algom Alpha) on Oracle:** PM2 app names are `dragontrade-main`, `dragontrade-dashboard`, `dragontrade-bybit`, `dragontrade-binance`. In the app's `.env` on the server set `COINGECKO_USE_DIRECT_API_ONLY=1` and `COINGECKO_API_KEY=<key>` to avoid crash-loops from CoinGecko MCP (mcp.api.coingecko.com 500/SSE errors). See `docs/DRAGONTRADE_ORACLE_SILENT_DEATH_FIX.md` for the full diagnosis.

---

## Root Causes We Fix

1. **Process crashes** — systemd/PM2 not restarting (or start limit hit).
2. **Process hangs** — process up but not responding (health check detects and restarts).
3. **Oracle reclaiming instance** — free-tier “idle” reclamation (keep-alive).
4. **Not starting after reboot** — services not enabled (ensure `enable` + PM2 startup).
5. **Autonomous DB client misconfiguration (CTO AIPA)** — wrong or stale **wallet**, **`sqlnet.ora`** `WALLET_LOCATION` still pointing at Instant Client’s **`?/network/admin`**, missing **`WALLET_PASSWORD`** for **`ewallet.p12`**, or **ORA-29024** after cert/trust mismatch. Looks like “bots died” because HTTP/Telegram start but DB paths block or time out. *Not caused by Google Places “encoding”* — see [postmortem below](#7-cto-aipa--autonomous-db-april-2026-postmortem).

---

## 1. Systemd Services (EspaLuz WhatsApp, Telegram, Influencer; others if using systemd)

Apply to every systemd-run bot: **Restart:** `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`. **Do not add** `WatchdogSec` unless the app calls `sd_notify(WATCHDOG=1)` (see `ORACLE_RESILIENCE_PLAN_REVIEW.md`).

Example (adjust service name and paths for each):

```ini
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10
# No MemoryMax needed (12 GB RAM). No WatchdogSec unless app supports it.
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable espaluz-whatsapp   # and espaluz-influencer
sudo systemctl restart espaluz-whatsapp
```

---

## 2. PM2 (CTO AIPA + Atuona; VibeJob/CMO, Algom Alpha if run with PM2)

- Ensure PM2 starts on boot: `pm2 startup` (run the command it prints), then `pm2 save`.
- Use an ecosystem file with `max_restarts` and `autorestart: true` (default) for each app.
- Health-check cron will restart if HTTP check fails (see below). For apps without HTTP, cron can still `pm2 restart <name>` when `pm2 jlist` shows status not "online".

---

## 3. One Health-Check Script (All Services)

Single script that checks every product and restarts only the unhealthy ones. Run from cron every 5 minutes.

**Path on server:** `/home/ubuntu/check_oracle_health.sh`

```bash
#!/bin/bash
# Oracle 170.9.242.90 — health check all products, restart if unhealthy
LOG=/var/log/oracle-health.log
exec >> "$LOG" 2>&1

echo "=== $(date -Iseconds) ==="

# CTO AIPA + Atuona (PM2, port 3000)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "CTO AIPA/Atuona unhealthy (HTTP $HTTP), restarting PM2..."
  pm2 restart cto-aipa
fi

# EspaLuz WhatsApp (systemd, port 8081)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8081/webhook 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "EspaLuz WhatsApp unhealthy (HTTP $HTTP), restarting..."
  sudo systemctl restart espaluz-whatsapp
fi

# VibeJob Hunter web + CMO bridge (systemd vibejobhunter-web, port 8080)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8080/health 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "VibeJobHunter web unhealthy (HTTP $HTTP), restarting vibejobhunter-web + vibejobhunter..."
  sudo systemctl restart vibejobhunter-web vibejobhunter
fi

# EspaLuz Influencer (systemd) — UPDATE port/path to match your deployment
# HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:PORT/health 2>/dev/null || echo "000")
# if [ "$HTTP" != "200" ]; then
#   echo "EspaLuz Influencer unhealthy (HTTP $HTTP), restarting..."
#   sudo systemctl restart espaluz-influencer
# fi

echo "Health check done."
```

- Make executable: `chmod +x /home/ubuntu/check_oracle_health.sh`
- Cron: `*/5 * * * * /home/ubuntu/check_oracle_health.sh`

---

## 4. OCI Keep-Alive (Prevent Instance Reclamation)

- Light CPU/IO + optional curl to your own services so the instance doesn’t look idle.

**Path on server:** `/home/ubuntu/oci_keepalive.sh`

```bash
#!/bin/bash
# Prevent Oracle from reclaiming free-tier instance
LOG=/var/log/oci-keepalive.log
dd if=/dev/urandom bs=1M count=10 of=/dev/null 2>/dev/null
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/ || true
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8081/webhook || true
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8080/health || true
echo "$(date -Iseconds): keepalive" >> "$LOG"
```

- Cron: `0 */4 * * * /home/ubuntu/oci_keepalive.sh`

---

## 5. Deployment Checklist (One-Pass Fix)

Do this once on the server (SSH as above).

- [ ] **Systemd units** (for every bot run by systemd: EspaLuz WhatsApp, EspaLuz Telegram, EspaLuz Influencer, and any others)  
  - [ ] Add `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`; no `WatchdogSec`.  
  - [ ] `sudo systemctl daemon-reload` and `enable <service>` for each.

- [ ] **PM2**  
  - [ ] `pm2 startup` (apply the printed command).  
  - [ ] `pm2 save`.

- [ ] **Health script**  
  - [ ] Create `/home/ubuntu/check_oracle_health.sh` (content above).  
  - [ ] Uncomment/fix EspaLuz Influencer block when port/path known.  
  - [ ] `chmod +x /home/ubuntu/check_oracle_health.sh`.  
  - [ ] Crontab: `*/5 * * * * /home/ubuntu/check_oracle_health.sh`.

- [ ] **Keep-alive**  
  - [ ] Create `/home/ubuntu/oci_keepalive.sh` (content above).  
  - [ ] `chmod +x /home/ubuntu/oci_keepalive.sh`.  
  - [ ] Crontab: `0 */4 * * * /home/ubuntu/oci_keepalive.sh`.

- [ ] **Verify**  
  - [ ] `sudo systemctl status espaluz-whatsapp espaluz-influencer` (and any other systemd bots)  
- [ ] `pm2 list` (all 10 agents: 8+9 = cto-aipa; 5+6 = one app if on Oracle; 4 = dragontrade/algom if PM2; 7 = openclaw-gateway; 10 = AILA when deployed)  
  - [ ] Wait 5 minutes and `tail -50 /var/log/oracle-health.log`

---

## 6. When You Add or Change Agents

- Keep the "All 10 AI Agents" table updated with exact service names and health URLs.
- In `check_oracle_health.sh`: add or uncomment a block for that agent (curl health URL then restart if non-200, or systemctl/pm2 restart if process check only).
- In `oci_keepalive.sh`: add a curl to each agent's health URL so keep-alive touches every service that has HTTP.

---

## 7. CTO AIPA + Autonomous DB — April 2026 postmortem (bots “silent,” ORA-29024 / ORA-28759)

**Context:** Right after **Phase 4c** (Google Places, `/places_ingest`) shipped, CTO AIPA + Atuona (same PM2 app **`cto-aipa`**) showed DB errors, hangs, or unresponsive behavior. **Root cause was not the Places API request encoding.** Places calls Google HTTPS and uses Oracle only for dedup/import; the failure mode was **wallet/TLS client setup** on the VM **combined with** a **`database.ts`** change in the same deploy (pool retry removal, shorter queue timeout), which made outages **more visible**.

**What we fixed**

| Layer | Fix |
|--------|-----|
| **Wallet** | Download **fresh client credentials** from OCI for **`ctoaipadb2025`** → deploy under **`/home/ubuntu/cto-aipa/wallet/`** (flatten nested folders). |
| **`sqlnet.ora`** | Set **`WALLET_LOCATION`** `DIRECTORY` to **`"/home/ubuntu/cto-aipa/wallet"`** (absolute). Default OCI zip often uses **`?/network/admin`**, which does not point at the PM2 wallet directory → **ORA-28759**. Use **LF** line endings. |
| **Secrets** | **`WALLET_PASSWORD`** in **`.env`** (password from wallet download). **`DB_PASSWORD`** is the **database user** password — they differ. Pass **`walletPassword`** into the node-oracledb pool when **`WALLET_PASSWORD`** is set. |
| **Service name** | **`DB_SERVICE_NAME`** must match an alias in **`tnsnames.ora`** (e.g. **`ctoaipadb2025_high`**). |
| **Code** | Restore **ORA-29024** / transient **retry + pool reset** in **`database.ts`**; optional **`TNS_ADMIN`** env override. |
| **Deploy** | **`pm2 restart cto-aipa --update-env`** after **`npm run build`**. |

**Tenancy:** DB may live in **aipa** OCI while the VM is on **aideazz** — that is normal; connectivity is wallet + public ADB endpoint.

**Verify:** **`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/`** → `200`; PM2 logs show **`Connected to Oracle`**; Telegram **`/places_ingest`** completes with **“New targets imported: N”.**

**Full narrative (marketing engine + product context):** [AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md#postmortem--april-14-2026-why-it-looked-like-google-api-encoding-broke-oracle-and-how-it-was-fixed).

---

## 8. Sprinter (Sprint Briefing Lambda) — Oracle Wallet & Knowledge Access (April 2026)

**Context:** Sprinter runs as **AWS Lambda** (`sprint-briefing-agent`), not on the Oracle VM. It needs to read voice-note tasks and diary entries from `knowledge_base` in Oracle Autonomous DB to include them in the morning briefing. Two approaches were tried; only the REST proxy works reliably.

### Wallet files (for reference)

Oracle wallet for CTO AIPA lives at **`/home/ubuntu/cto-aipa/wallet/`** on the Oracle VM (9 files):

| File | Purpose |
|------|---------|
| `cwallet.sso` | Auto-login wallet — thick mode only (no password needed). Works on the Oracle VM via Instant Client. |
| `ewallet.p12` | PKCS12 encrypted wallet — thin mode (Lambda). **Requires wallet password.** |
| `ewallet.pem` | PEM-encoded wallet — thin mode (Lambda). **Requires wallet password.** |
| `sqlnet.ora` | Connection config — `WALLET_LOCATION` must point to absolute path (e.g. `/home/ubuntu/cto-aipa/wallet`). |
| `tnsnames.ora` | TNS aliases (e.g. `ctoaipadb2025_high`). |
| Others | `keystore.jks`, `truststore.jks`, `ojdbc.properties`, `README` |

**Critical:** `ewallet.p12` and `ewallet.pem` are encrypted with a wallet password. The server `.env` has `#WALLET_PASSWORD=disabled` — the thick-mode Oracle server uses `cwallet.sso` (auto-login, no password). The wallet password for PKCS12 files is **not stored anywhere** and was never set in `.env`. Do NOT attempt thin-mode from Lambda using these files.

### Why thin-mode from Lambda doesn't work

- Lambda uses **oracledb v6 thin mode** (pure JS, no Instant Client) — requires `ewallet.p12` with a password.
- `cwallet.sso` is thick-mode only and cannot be used in Lambda.
- The wallet password is unknown/lost — attempts to use an empty string or `DB_PASSWORD` both fail with `NJS-505: bad decrypt`.

### Solution: REST proxy endpoint on CTO AIPA server

Lambda calls the Oracle server **directly via HTTPS** instead of connecting to Oracle. The CTO AIPA server already has a working thick-mode Oracle connection (via `cwallet.sso`, no password needed).

**Endpoint:** `GET https://webhook.aideazz.xyz/cto/sprint-knowledge?userIds=<id1>,<id2>`  
**Auth:** `Authorization: Bearer <OUTREACH_SECRET>`  
**Response:** `{ ok: true, context: "### Personal context (Oracle knowledge_base)\nUser ... pending tasks:\n- ..." }`

Returns last 5 diary entries + up to 15 pending tasks per user from `knowledge_base`.

**Lambda env vars required:**

| Var | Value |
|-----|-------|
| `SPRINT_KNOWLEDGE_API_URL` | `https://webhook.aideazz.xyz/cto/sprint-knowledge` |
| `OUTREACH_SECRET` | (see server `.env` — the shared outreach auth secret) |
| `SPRINT_BRIEFING_KNOWLEDGE_USER_IDS` | `5481526862` (Elena's Telegram user ID — **required** so `parseUserIdsEnv()` returns a non-empty array) |

**⚠️ Critical: `SPRINT_BRIEFING_SKIP_ORACLE=1` is set in the Lambda handler code (`src/lambda/sprint-briefing-aws.ts` line 19) to prevent direct Oracle connections from Lambda. The flag must NOT be used to gate the HTTP proxy path.** Fixed May 3, 2026: `SKIP_ORACLE` gate moved inside `knowledge-context.ts` so it only blocks paths 2 & 3 (Oracle direct), leaving path 1 (HTTP proxy) always reachable. Without this fix, voice notes were always missing from the briefing even though they were saved correctly in Oracle.

**Code path:** `src/sprint-briefing/knowledge-context.ts` — checks `SPRINT_KNOWLEDGE_API_URL` first (HTTP proxy), then falls back to `ORACLE_WALLET_S3_BUCKET` (oracle-thin, disabled in practice), then thick-mode pool (server only).

### Row format in `knowledge_base`

Oracle thick mode returns rows as **arrays**, not objects. `getKnowledgeByCategory` returns:

```
row[0] = id (hex string)
row[1] = category  
row[2] = title
row[3] = content
row[4] = status
row[5] = project
row[6] = source  ('voice', 'telegram', etc.)
row[7] = created_at (ISO string)
```

Always use `row[2]` / `row[3]` for title/content in the `/sprint-knowledge` endpoint — NOT `row.title` / `row.TITLE` (those return undefined).

### Voice notes → briefing flow

1. User sends voice message to CTO AIPA Telegram bot
2. Whisper transcribes → `detectPersonalAIIntent` → `handlePersonalAIAction` → `saveKnowledge(userId, 'task'|'diary', title, content, 'pending', ...)`
3. Knowledge saved to Oracle `knowledge_base` with `source='voice'`
4. Next morning: Lambda Sprinter fires (EventBridge `cron(0 13 * * ? *)` = 8AM Panama / UTC-5)
5. Lambda calls `/sprint-knowledge` → gets tasks → includes in briefing prompt → Claude generates script → OpenAI TTS → audio sent to Telegram

---

## References

- Plan (EspaLuz-focused): `.cursor/plans/oracle_instance_resilience_d6cfcf8b.plan.md`
- CTO review (WatchdogSec, all products): `docs/oracle/ORACLE_RESILIENCE_PLAN_REVIEW.md`
- Migration/ports: `docs/RAILWAY_TO_ORACLE_MIGRATION.md`
- **CTO AIPA + Places + Oracle (April 2026):** [AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md#postmortem--april-14-2026-why-it-looked-like-google-api-encoding-broke-oracle-and-how-it-was-fixed)
- Private infra docs (may not list all products): [aideazz-private-docs / oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure)
- **Symphony inventory (planning source):** [AILA — `AILA_SYMPHONY_ANALYSIS.md` (`docs` branch)](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)

---

## Last Verified (August 14, 2026) — PagueloFacil durable mirror, JSON snapshots, RAG key, analytics

Claude Opus encodings reviewed and kept. Real defects, not cosmetic: PagueloFacil lived in a 2 KB JSON file that `_load_store()` would replace with `{}` on `JSONDecodeError` (next save = silent money-record wipe); RAG captured `OPENAI_API_KEY` at import time (any import before `load_dotenv()` = permanent silent amnesia); WhatsApp `user_analytics` never updated `daily_activity` / `total_days_active` on the existing-user Postgres path, and `/analytics/export` read the near-empty JSON fallback (HTTP 500).

| Surface | Status | What landed |
|---------|--------|-------------|
| **PagueloFacil store** | ✅ Live | `espaluz_pf_durable.py` append-only Postgres mirror (SHA-deduped). `_load_store()` restores from Postgres if the file is missing or unreadable; bad files are quarantined. `_save_store()` is atomic (temp + fsync + rename) then mirrors. Every durable function swallows its own errors — payments keep working if Postgres is down. Repo: [EspaLuzFamilybot `0b46027`](https://github.com/ElenaRevicheva/EspaLuzFamilybot/commit/0b46027). |
| **JSON state (both bots)** | ✅ Live | `json_store_guard.py` snapshots 27 JSON files every 15 min via `espaluz-json-guard.timer`. Imports no bot code; secrets denied by name (`credential`, `token`, `secret`, `key.json`, `service_account`). Units: `EspaLuzFamilybot/deploy/espaluz-json-guard.{service,timer}`. |
| **RAG** | ✅ Live | `espaluz_rag.py` resolves `OPENAI_API_KEY` lazily at call time (both repos). Backfill `rag_backfill.py` (dry-run default, insert-only): 164 vectors / 5 sessions → 415 / 9. |
| **WhatsApp analytics** | ✅ Live | Existing-user UPDATE now maintains `daily_activity` + derives `total_days_active`. CSV export reads Postgres and includes PayPal / PagueloFacil / trial classification. DB URL resolved by **key priority** (`ESPALUZ_UNIFIED_DB_URL` → `DATABASE_URL_UNIFIED` → `DATABASE_URL`), not first-line-wins — the legacy empty `DATABASE_URL` sits above the unified one in these `.env` files. Repo: [EspaLuzWhatsApp `4d90acf`](https://github.com/ElenaRevicheva/EspaLuzWhatsApp/commit/4d90acf). |
| **Stale status columns** | ✅ Applied on Oracle | Trial/subscription `status` flipped only where `trial_end` / period already passed (load-bearing for access — date guard first). Historical `total_days_active` floored from `first_seen`/`last_seen` for the 3 multi-day users. |

**Verified live (Aug 14):** PF store 2 users / 2 processed / 3 orders; durable snapshot `ok`; `espaluz-json-guard.timer` enabled; WhatsApp `/webhook` 200; PagueloFacil webhook HTTP 200; RAG key resolvable; analytics DB on unified Postgres. Oracle working-tree drift on `espaluz_paguelofacil.py` + `user_analytics.py` was CRLF-only — canonical `git checkout origin/main -- <files>` (never a blind pull).

**Residual:** `streak_days` is still only updated on the JSON fallback path, not the Postgres existing-user UPDATE. Dashboard streak remains decorative until that column is derived from `daily_activity`.

**Deploy files:** Telegram `espaluz_paguelofacil.py espaluz_pf_durable.py espaluz_rag.py json_store_guard.py` + restart `espaluz-familybot espaluz-payments-webhook`. WhatsApp `espaluz_rag.py user_analytics.py` + restart `espaluz-whatsapp`. Timer install: `sudo cp deploy/espaluz-json-guard.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now espaluz-json-guard.timer`.

---

## Last Verified (June 29, 2026) — EspaLuz PagueloFacil + Access Control

| Agent | Status | Change |
|-------|--------|--------|
| **EspaLuz WhatsApp** | ✅ Live | PagueloFacil `pagar` (shared webhook), help menu payment section, iron-clad access gate, trial + PF expiry reminders. PayPangea removed. Repo: [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp). Status doc: `docs/CURRENT_STATUS_JUNE29.md`. |
| **EspaLuz Telegram** | ✅ Live | Fixed `is_subscribed()` (removed 7-day grace + default allow). `enforce_learning_access()` on voice/text/photo. Same reminder + pause logic via `espaluz_paypal_system.py`. Repo: [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot). |
| **Payment webhooks** | ✅ Live | Shared `espaluz_paguelofacil.py` — `WA:` / `TG:` user keys, `paguelofacil_payments.json`, `https://webhook.aideazz.xyz/paguelofacil-webhook`. systemd `espaluz-payments-webhook`. |
| **Git on Oracle** | ✅ PAT auth | `git fetch origin main` works for all private repos via `GITHUB_TOKEN` in `cto-aipa/.env`. Deploy code: `git checkout origin/main -- <files>` (avoid blind pull — runtime JSON drift). Script: `scripts/oracle-resilience/oracle-fix-git-https-auth.sh`. |

**Deploy rule (unchanged):** canonical local clone → push GitHub → Oracle `git fetch` + checkout specific files → `systemctl restart espaluz-whatsapp espaluz-familybot espaluz-payments-webhook`.

**Docs updated:** `EspaLuzFamilybot/docs/CURRENT_STATUS_JUNE26.md`, `docs/SWOT_ANALYSIS_ESPALUZ.md`, `EspaLuzWhatsApp/docs/CURRENT_STATUS_JUNE29.md`.

---

## Last Verified (June 16, 2026) — Fleet-wide Claude model-retirement fix

**June 15–16 2026: Anthropic decommissioned the May-2025 model IDs `claude-sonnet-4-20250514` and `claude-opus-4-20250514` (also older `claude-3-5-*`, `claude-3-*`, `claude-2*`, `claude-instant*`).** Every agent hardcoding them got `404 not_found_error` (a *fallback-class* failure — silent until you read logs). Swept the entire fleet; all fixed + deployed + verified live.

| Agent | Status | Fix (commit / change) |
|-------|--------|------------------------|
| **CTO AIPA + Atuona** | ✅ Fixed + running | `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001` across all call paths (AIPA_AITCF `10337e1`, `9c453ec`). **Atuona `/create`** got a **Grok (xAI) tier-3 fallback** (`95c359a`) so a Claude credit dip + Groq free-tier cap (429/413) no longer breaks page creation. Atuona film **Phase 2** also shipped (`d6ed8a8`: title cards + on-screen poem text + crossfades). Blog delivery buffer fix (`946e165`). |
| **EspaLuz Telegram** | ✅ Fixed + restarted | `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929` in `main.py` ×3 (EspaLuzFamilybot `88a36d0`). systemd `espaluz-familybot` restarted. |
| **EspaLuz WhatsApp** | ✅ Fixed + restarted | same swap in `espaluz_bridge.py` ×2, `main.py`, `whatsapp_convo_mode.py` (EspaLuzWhatsApp `997d5c8`). systemd `espaluz-whatsapp` restarted; live RU→ES translation verified. |
| **VibeJob Hunter + CMO** | ✅ Fixed + restarted | **~22 active call sites** `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929` + rebuilt the broken fallback chain in `src/utils/claude_helper.py` (was 4× the SAME dead model → now 4 distinct live models) (VibeJobHunterAIPA_AIMCF `43ebdfd`). systemd `vibejobhunter` + `vibejobhunter-web` restarted (`:8080` HTTP 200). **Was 404ing its whole autonomous apply/message pipeline.** |
| **Algom Alpha** | ✅ Fixed + restarted | 2 calls in `aideazz-content-generator.js` → `claude-sonnet-4-5-20250929` (dragontrade-agent `7447949`). PM2 `dragontrade-main` restarted. |
| **Sprinter (AWS Lambda)** | ✅ Fixed (env override) | Lambda DID fire (EventBridge OK) but synthesis 404'd. `synthesize.ts` reads `process.env.SPRINT_BRIEFING_CLAUDE_MODEL`, which was unset → **set Lambda env `SPRINT_BRIEFING_CLAUDE_MODEL=claude-sonnet-4-6` (no rebuild needed)** via AWS SDK from the dev machine (Oracle has no AWS creds). Force-tested → `{"ok":true}`, briefing delivered. Helper scripts in `scripts/`: `diagnose-lambda.mjs`, `fix-sprinter-model.mjs`, `check-sprinter-logs.mjs`, `deploy-lambda.mjs`. |
| **EspaLuz Influencer** | ✅ Clean | No hardcoded dead model ID — uses Groq/current. |
| **OpenClaw** | ✅ Clean | No hardcoded dead model ID. |

**Current entitled Claude model IDs** (keep these): Opus `claude-opus-4-8` · Sonnet `claude-sonnet-4-6` / `claude-sonnet-4-5-20250929` · Haiku `claude-haiku-4-5-20251001`. **Dead (will 404):** anything `*-20250514`, `claude-3-*`, `claude-2*`, `claude-instant*`, `claude-3-5-haiku-20241022`. Probe a key: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $K" -H "anthropic-version: 2023-06-01" -d '{"model":"<id>","max_tokens":4,"messages":[{"role":"user","content":"hi"}]}'`.

**✅ Resolved (June 19 2026):** Sprinter Lambda `GITHUB_TOKEN` was expired (every `/repos/...` query 401'd, repo section degraded). Refreshed the Lambda env var (`aws lambda update-function-configuration`, us-east-1, function `sprint-briefing-agent`) with the valid Oracle `.env` `GITHUB_TOKEN` (user ElenaRevicheva, `repo` scope, verified 200). Native invoke confirmed: dedup OK, `/sprint-knowledge` proxy OK (4369 chars), Trello OK, **no more GitHub 401**. To refresh again: `GH=<valid-pat> py scripts/update-sprinter-token.py` (merges env, preserves all 18 vars). **Durability — RESOLVED June 19 2026 (commit `e52f6a1`):** the Lambda's narrative gen now carries a free **`gemini-2.5-flash` fallback** in BOTH steps (`clusterSignalsWithGroq` + `writeBriefingNarrative`, `src/sprint-briefing/synthesize.ts`). It was Claude→Groq only — and Anthropic credits are permanently dry, so it effectively rode on Groq alone and died on Groq-capped mornings. Now **Claude → Groq → Gemini**; `GEMINI_API_KEY` added to the Lambda env (19 vars). Rebuild recipe (no committed build script): `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --format=cjs --external:@aws-sdk/signature-v4-crt --external:encoding` → zip the single `handler.js` → `update-function-code` (boto3/`py`; AWS creds in `~/.aws`, no CLI installed). Back up the prior `dist-lambda/sprint/handler-fixed.zip` first. Test-invoke validates the bundle even under quota exhaustion (reaching the Gemini call proves it loaded).

**RULE reinforced (June 16):** edit the **canonical local clone** (paths in the table above) → push to GitHub → deploy on Oracle (EspaLuz/VJH carry runtime-state drift in their repo dirs, so deploy specific code files via `git checkout origin/main -- <file>` or in-place `sed`, never a blind `git pull`). Hotfixing directly on Oracle without committing to git leaves the repo behind the running code.

---

## Last Verified (May 15, 2026)

| Agent | Status | Notes |
|-------|--------|-------|
| CTO AIPA + Atuona | ✅ Running | **Multi-agent HubSpot hub + BrightData live May 14–15**: `/api/crm-event` unified hub (all agents POST, Bearer OUTREACH_SECRET); `/api/crm-pipeline/setup` + `/api/crm-pipeline/ids`; `src/brightdata-enrich.ts` (NEW — zone `web_unlocker1`, max 10/run, 1 req/s); `src/hubspot-client.ts` additions: `HS_HIRING_PIPELINE_ID`, `HS_HIRING_STAGE_IDS`, `HiringStage`, `createHiringPipeline()`, `pushHiringDealToHubSpot()`. Free-tier hiring pipeline: `[HIRING] {jobTitle} @ {company}`. Oracle env: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_ZONE=web_unlocker1`. **HubSpot CRM + multi-source fresh leads engine live May 9**. **X webhook handler live May 10**: receives Follow/DM/Mention/Like events, broadcasts to Telegram, fires auto-follow back. Body parser fixed (express.json verify callback — raw body saved before json() consumes stream). twitter-api-v2 added as dependency. **HubSpot duplicate posting loop fixed May 10** (see §11). Board Trello briefing + task management live May 8–9. CTO→CMO pipeline May 1. |
| EspaLuz Telegram | ✅ Running + **2-layer memory live (Apr 25)** | LangChain retrieval + pgvector RAG wired. `espaluz_rag.py` + `espaluz_embeddings` (pgvector, ivfflat, 1536 dims). Confirmed in logs. |
| EspaLuz WhatsApp | ✅ Running + **2-layer memory live (Apr 25)** | LangChain + pgvector RAG wired (`espaluz_rag.py`, two save blocks). PayPal webhook signature verification still disabled — free/paid detection unreliable. Pre-existing `Enhancement error: slice(None, 5, None)` — non-critical. |
| EspaLuz Influencer | ✅ Running + **CTO milestone posts live (May 1)** + **me_01–me_32 rotation fix (Jun 27)** | **Odd** days → EspaLuz tutor images (`image_urls`). **Even** days → AI Marketing Engine **round-robin** through 36 assets (4 legacy PNGs + [32 agent cards](https://github.com/ElenaRevicheva/EspaLuz_Influencer/tree/main/marketing_engine_images)); Groq copy uses `marketing_engine_image_meta.py` focus hints. **CTO milestone** (even days, `sprinter.jpg`) **max once per 7 days** — was blocking every even day when the CMO queue had pending items (Jun logs: 77 milestone vs 23 marketing posts). `content_memory.json` tracks `marketing_image_rotation_index` + `last_milestone_influencer_post`. |
| VibeJob Hunter + CMO | ✅ Running (Oracle) + **CTO collab live (May 1)** + **HubSpot CRM push live May 14–15** | `vibejobhunter-web` (port 8080). **NEW: `src/langgraph_pipeline/crm_hub.py`** — after each job application, posts to `/api/crm-event` (pipeline=hiring). Env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL=https://webhook.aideazz.xyz/cto`. `nodes.py` modified to call CRM push after submit. CMO now picks up pending CTO milestones at daily 20:00 Panama post — generates LinkedIn post, then fires dev.to blog crosspost (`blog_publisher.py`, fire-and-forget). `sprinter.jpg` added to image rotation pool. |
| Algom Alpha (dragontrade @reviceva) | ✅ Running (PM2) + **X Activity API full automation live May 10** + **HubSpot CRM push live May 14–15** | **NEW: `pushProspectToCRM()` in `stream-listener.js`** — high-intent keyword matches (`need_cto`, `ai_engineer_hiring`, `crm_pain`, `ai_founder`, `fractional_cto`) POST to `/api/crm-event` → Client Pipeline in HubSpot. Env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL`. Every 5th tweet, `x-tech-updater.js` checks `/api/x-updates` for a pending CTO milestone. **X webhook automation May 10**: Account Activity API subscription active — Follow/DM/Mention/Like events stream to CTO AIPA in real-time → Elena's personal Telegram (@aitcf_aideazz_bot). Auto-follow back: when @reviceva gets a new follower → `v2.follow()` fires instantly. Engagement bot (`engagement-bot.js`): replies to mentions every 45min (max 2/run), auto-follows substantive commenters. Filtered stream (`stream-listener.js`): monitors "fractional CTO", "AI engineer hiring", "HubSpot CRM pain" keywords across all X in real-time → auto-like + follow prospects. **DM auto-reply**: Claude Haiku generates contextual reply — blocked at PPU tier (X API 403, requires Basic $100/mo). Profile events subscribed via X Activity API console: Bio/Pic/Screenname. Credentials: `TWITTER_API_KEY/SECRET/ACCESS_TOKEN/SECRET` in both `/home/ubuntu/dragontrade-agent/.env` AND `/home/ubuntu/cto-aipa/.env`. Elena's correct Twitter user ID: `1563632998863577092`. |
| Sprint Briefing (Sprinter) | ✅ AWS Lambda — **voice notes fixed May 3** | Bug: `SPRINT_BRIEFING_SKIP_ORACLE=1` in Lambda handler was gating the ENTIRE personal-context load (including HTTP proxy). Fix: gate moved to `knowledge-context.ts` paths 2/3 only. `SPRINT_BRIEFING_KNOWLEDGE_USER_IDS=5481526862` confirmed set in Lambda. Code + Lambda bundle redeployed May 3. Voice notes from prior day will appear in next 8AM briefing. See §8 for full architecture. |
| AILA | ❌ Not deployed | Repo exists, no code. CTO AIPA serves as interim conductor via `agent_outcomes` table. |

### CTO AIPA → All Posting Channels Pipeline (live May 1, 2026)

When CTO AIPA ships a meaningful milestone, the following happens automatically — no manual intervention:

| Step | What happens | Where |
|------|-------------|--------|
| 1 | CTO AIPA detects real milestone (commit to monitored repos) | `cto-aipa` PM2, `src/cto-aipa.ts` |
| 2 | Notifies CMO AIPA via `POST http://127.0.0.1:8080/api/tech-update` | Same Oracle VM, localhost |
| 3 | Milestone queued in `pending_tech_updates.json` | `/home/ubuntu/VibeJobHunterAIPA_AIMCF/cto_aipa_updates/` |
| 4 | **LinkedIn** — CMO picks it up at 20:00 Panama, generates post via Claude, sends via Make.com | `linkedin_cmo_v4.py`, `vibejobhunter-web` |
| 5 | **Dev.to only** — blog crosspost fires after LinkedIn, fire-and-forget (Hashnode dropped — paid plan only; NOT in use) | `blog_publisher.py` |
| 6 | **X @reviceva** — dragontrade posts tweet on next 5th-post slot | `x-tech-updater.js`, `dragontrade-main` PM2 |
| 7 | **Instagram** — EspaLuz Influencer uses milestone on next even day at 18:00 Panama (23:00 UTC) | `cto_milestone_module.py`, `espaluz-influencer` systemd |

**Guard: only real milestones post.** Only commits prefixed `feat:`, `launch:`, or `release:` trigger CMO notification. `fix:`, `docs:`, `chore:`, `refactor:` commits are silently skipped — they are internal developer work, not audience-facing announcements. When a milestone does post, the tweet is written in plain language by Claude Haiku (Groq fallback) — no commit syntax, no jargon, no raw technical details.

**Critical items needing server verification:**
- `grep ATS_DRY_RUN /home/ubuntu/VibeJobHunterAIPA_AIMCF/.env` — is VJH actually submitting applications or just generating local artifacts?
- EspaLuz PayPal signature verification — still disabled per WIRING_CONDUCTOR_WEEK1 audit.

---

## 9. HubSpot CRM + Multi-Source Fresh Leads Engine (May 9, 2026)

### What shipped

| File | Role |
|------|------|
| `src/hubspot-client.ts` | HubSpot CRM API v3 wrapper — `upsertContact`, `upsertCompany`, `createDeal`, v4 associations (contact↔company, deal↔contact, deal↔company), `addNoteToContact`, `pushLeadToHubSpot()` full pipeline, `getHubSpotStats()` |
| `src/fresh-leads-ingest.ts` | Multi-source prospecting engine — 3 live sources, pain-point classification via Claude Haiku, dedup vs Oracle, HubSpot push for verified emails only |
| `src/prospect-ingest.ts` | Updated — only pushes to HubSpot if Hunter.io found a real email (not pattern `founder@domain`) |
| `src/lead-triage.ts` | Updated — pushes `client_lead`/`partnership` signals with urgency ≥3 to HubSpot; urgency 4-5 → stage `engaged`, urgency 3 → stage `contacted` |

### Fresh leads sources (all free, no paid API)

| Source | How it works | Volume |
|--------|-------------|--------|
| **Hacker News "Who is Hiring"** | Monthly thread — Algolia API, no key needed. Parses company name, email, website, description from top-level comments. | ~150–250 companies/month |
| **GitHub repo search** | Searches repos tagged `ai-agent`, `automation`, `llm` with contact email in README. GitHub token (free, already have it) for higher rate limits. | ~20–30/run |
| **Product Hunt AI launches** | GraphQL API, personal developer token. Fetches recent AI-category launches, extracts maker name + website. Token: `JqSMu_wrfci5Anxe1RV7QcaJyO9EfIWIw7QBLk305Eg` (env: `PRODUCT_HUNT_TOKEN`, added May 9). | ~30–50/run |

### Filters — real data only
- Pattern emails (`founder@domain.com`) never pushed to HubSpot — company record still created
- Test entries (E2E, demo, fake) skipped entirely
- `/hubspot sync` reports pushed vs skipped counts explicitly

### Telegram commands
| Command | Action |
|---------|--------|
| `/fresh_leads` | HN + GitHub (default, no extra token needed) |
| `/fresh_leads all` | HN + GitHub + Product Hunt |
| `/hubspot` | Live CRM stats (contacts · companies · deals) |
| `/hubspot sync` | Backfill all existing Oracle outreach_targets → HubSpot |

### Cron schedule
- **Tue + Fri 7:00 AM Panama** — automatic fresh leads pull (HN + GitHub)
- After each run: `/triage` classifies new signals → qualified leads auto-push to HubSpot

### HubSpot account
- Account: `aipa@aideazz.xyz`
- Service Key: stored in Oracle `.env` as `HUBSPOT_API_KEY` (pat-na1-… format, never commit in plaintext)
- Scopes: `crm.objects.contacts`, `crm.objects.companies`, `crm.objects.deals` read+write
- Free tier: 1M contacts, unlimited companies/deals, 100 req/10s rate limit

### BrightData Web Unlocker (added May 14–15, 2026)

Oracle `.env` additions:

| Var | Value |
|-----|-------|
| `BRIGHTDATA_API_TOKEN` | `77c17e6d-bb2d-42da-84d5-f300420a1721` |
| `BRIGHTDATA_ZONE` | `web_unlocker1` |

Zone: `web_unlocker1`, $1.50/CPM, 30-day trial active. Max 10 enrichments/run, 1 req/sec throttle. Integrated in `src/brightdata-enrich.ts` → called from `fresh-leads-ingest.ts` after dedup, before Claude pain classification.

### Multi-agent CRM hub (added May 14–15, 2026)

New CTO AIPA endpoints:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/crm-event` | `Bearer OUTREACH_SECRET` | Unified hub — all agents route here; validates, deduplicates, writes to HubSpot, logs to `crm_event_log` |
| `GET /api/crm-pipeline/setup` | `Bearer OUTREACH_SECRET` | Returns free-tier strategy (`[HIRING] {jobTitle} @ {company}` naming, stage map) |
| `GET /api/crm-pipeline/ids` | `Bearer OUTREACH_SECRET` | Reads existing pipeline IDs from HubSpot |

VJH + Algom Alpha env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL=https://webhook.aideazz.xyz/cto`.

---

## 10. Board Briefing + Task Management (May 8–9, 2026)

| Feature | File | What it does |
|---------|------|-------------|
| Daily Trello briefing | `src/board-briefing.ts` | Every morning (13:00 UTC = 8AM Panama): fetches Kira* + VibeJob boards, categorises cards (overdue/today/dueSoon/dueWeek/undated), Claude Haiku generates one actionable suggestion. Sent as a separate Telegram message after Sprinter. |
| Weekly Trello digest | `src/board-briefing.ts` | Every Monday 9AM Panama: full board snapshot + Claude Haiku insight paragraph (patterns, bottlenecks, what to tackle first). |
| `/done N` | `telegram-bot.ts` | Delete task(s) by number from `/tasks` list. `/done 1,4,7` removes three at once. |
| `/cleartasks auto` | `telegram-bot.ts` | Claude reads all tasks, identifies stale ones, proposes a list to delete. |
| `/cleartasks confirm N,M` | `telegram-bot.ts` | Executes Claude's suggestion. |

---

## 11. X Full Automation + HubSpot Duplicate Loop Fix (May 10, 2026)

### X Webhook & Automation — What Shipped

| Component | File | Status |
|-----------|------|--------|
| Account Activity API subscription | Script: `POST /2/account_activity/webhooks/{id}/subscriptions/all` (OAuth 1.0a) | ✅ Active — Follow/DM/Mention/Like stream to CTO AIPA webhook |
| Webhook body parser fix | `src/cto-aipa.ts` — `express.json({ verify: (req,_,buf) => { req.rawBody=buf } })` | ✅ HMAC signature verification working — was failing because global `express.json()` consumed body stream before route-level `express.raw()` could capture it |
| Auto-follow back | `src/cto-aipa.ts` — `client.v2.follow('1563632998863577092', userId)` | ✅ Live on PPU tier — fires instantly on every new follower event |
| Telegram follow alerts | `src/cto-aipa.ts` | ✅ Follow/Mention/Like events previewed in Elena's Telegram (`@aitcf_aideazz_bot`) |
| DM auto-reply | — | ❌ Blocked at PPU tier (X API 403 on both v1 + v2 endpoints). Requires Basic tier ($100/mo). Elena handles DMs manually in X inbox; Telegram previews DM text so she knows when to check. |
| Filtered stream | `dragontrade-agent/stream-listener.js` | ✅ App-Only Bearer token (OAuth 2.0 `client_credentials` grant) — separate from OAuth 1.0a. 5 keyword rules: `fractional_cto`, `need_cto`, `ai_engineer_hiring`, `crm_pain`, `ai_founder`. Auto-like + auto-follow prospects. |
| Stream retry loop | `dragontrade-agent/index.js` | ✅ 5-attempt retry with 90s delay — handles X "subscription provisioning" delay on first connect |
| Engagement bot | `dragontrade-agent/engagement-bot.js` | ✅ Runs every 45min — max 2 replies + 3 follows per run. State in `engagement_state.json`. |
| Elena's correct Twitter user ID | All files | ✅ `1563632998863577092` — confirmed via `client.v2.me()`. Was incorrectly `30551469` in prior versions. |

**Credentials location:** `TWITTER_API_KEY/SECRET/ACCESS_TOKEN/SECRET/BEARER_TOKEN` in **both** `/home/ubuntu/dragontrade-agent/.env` AND `/home/ubuntu/cto-aipa/.env`.

---

### HubSpot Duplicate Posting Loop — Root Cause & Fix

**Symptom:** Same tweet posted twice, ~6 minutes apart. HubSpot milestone items kept reappearing as "pending" on every `x-tech-updater.js` cycle.

**Root causes (three compounding issues):**

| # | Bug | Detail |
|---|-----|--------|
| 1 | **Field name mismatch** | JSON file used `"posted": true` (written by legacy path). GET `/api/x-updates` filtered on `"posted_x"` only → items with only `posted=true` passed the filter every cycle. |
| 2 | **Timestamp field mismatch** | Mark endpoint matched on `repo + timestamp`. Old HubSpot items had no `timestamp` field — only `received_at`. Match always failed → `posted_x` never set → items stayed "pending" forever. |
| 3 | **5 backlog items with no `posted_x`** | Already-posted items accumulated `posted: true` but never got `posted_x: true`. Backfill needed. |

**Fixes applied — `VibeJobHunterAIPA_AIMCF/src/api/app.py`:**

```python
# GET /api/x-updates — now excludes BOTH fields
pending = [u for u in updates if not u.get("posted_x", False) and not u.get("posted", False)]

# POST /api/x-updates/mark — 3-tier matching
for u in updates:
    ts_match = (u.get("timestamp") == ts) or (u.get("received_at") == ts)
    repo_match = u.get("repo") == repo or repo in u.get("repo", "")
    already = u.get("posted_x") or u.get("posted")
    if repo_match and ts_match and not already:
        u["posted_x"] = True
        u["posted_x_at"] = datetime.utcnow().isoformat() + "Z"
        marked = True; break
# Fallback: match by title if timestamp matching fails
if not marked and body.get("title"):
    for u in updates:
        if u.get("title") == title and not u.get("posted_x") and not u.get("posted"):
            u["posted_x"] = True; marked = True; break
```

**Fix in `x-tech-updater.js`** (both dragontrade-agent + VibeJobHunterAIPA_AIMCF copies): mark body now sends `title` field alongside `repo` and `timestamp`, enabling fallback matching.

**Backfill:** 5 items in `pending_tech_updates.json` that had `posted: true` but no `posted_x` were manually set to `posted_x: true`.

**Verified state after fix:**
```json
{"ok": true, "pending": [], "total": 0, "held": true}
```
All 4 HubSpot items: `posted_x=True AND posted=True`. Queue clean. Future milestone items (tasks/trello/voice features) will post cleanly — one per 5th-tweet cycle, no duplicates.

---

## 12. Blog Publishing Pipeline (May 2026)

### What fires and where

| Channel | Status | Notes |
|---------|--------|-------|
| **Dev.to** | ✅ Active | Primary blog channel — all posts published here via `DEVTO_API_KEY` |
| **aideazz.xyz/blog** | ✅ Active | Auto-populated from Dev.to crosspost via existing sync mechanism |
| **Hashnode** | ❌ NOT IN USE | Dropped — paid plan only. `HASHNODE_ACCESS_TOKEN` is NOT set in `.env` |

> **Important:** The blog publisher source file is **`src/daily-blog-publisher.ts`** (renamed from `hashnode-daily.ts` May 2026). It runs in **Dev.to-only mode** whenever `HASHNODE_ACCESS_TOKEN` is absent from env.

### Source file

`/home/ubuntu/cto-aipa/src/daily-blog-publisher.ts`

When `HASHNODE_ACCESS_TOKEN` is not set → Dev.to-only mode (Hashnode path skipped entirely).

### PM2 process

| Process | Script | Schedule |
|---------|--------|---------|
| `cto-aipa` | `dist/cto-aipa.js` | Runs blog generation on schedule (daily) |

Logs: `pm2 logs cto-aipa --lines 200 | grep -i blog`

### GSC integration

| Env var | Value |
|---------|-------|
| `GOOGLE_ANALYTICS_CREDENTIALS` | JSON string — service account key from GCP project `vaulted-circle-368018` |
| `GSC_SITE_URL` | `sc-domain:aideazz.xyz` |

Function: `fetchGscTopQueries()` in **`src/daily-blog-publisher.ts`** — JWT from `GOOGLE_ANALYTICS_CREDENTIALS`; returns top search queries to inform blog topic selection.
Service account added to GSC property as `siteFullUser` (verified May 16 2026).

### GA4 integration

| Env var | Value |
|---------|-------|
| `GOOGLE_ANALYTICS_CREDENTIALS` | Same service account JSON as GSC (reused) |
| `GA4_PROPERTY_ID` | `515154124` |

**GCP project:** `vaulted-circle-368018` — **analytics only** (GA4 + GSC). Service account **`aideazz-analytics-reader@vaulted-circle-368018.iam.gserviceaccount.com`**. Do **not** conflate with the separate **Aldeazz** GCP project (reCAPTCHA Enterprise, Google Places) — leave both projects as-is.

| Use | Where | Script / endpoint |
|-----|-------|-------------------|
| Site-wide analytics dashboard | VJH `vibejobhunter-web` :8080 | `performance_tracker.py` |
| GSC gap topic pick (blog) | CTO AIPA PM2 | `fetchGscTopQueries()` in `daily-blog-publisher.ts` |
| **Atlas campaign sessions** | CTO AIPA cron **`15 6 * * *` UTC** | **`scripts/sync-atlas-ga4.mjs`** → `ga4_sessions` / `ga4_key_events` on performance ledger |

Verified Jul 3 2026: GA4 adapter live; first `ga4_sync` row (`ai_augmented_product_building`, 1 session, Jul 2).

### VJH CMO crosspost

`blog_publisher.py` in `VibeJobHunterAIPA_AIMCF/` — fire-and-forget Dev.to crosspost after LinkedIn posts.
Called from `linkedin_cmo.py` via the `POST /api/crm-event` hub endpoint.

### Env vars summary

| Var | Required | Purpose |
|-----|----------|---------|
| `DEVTO_API_KEY` | ✅ Yes | Publishes to Dev.to |
| `HASHNODE_ACCESS_TOKEN` | ❌ Not set | Leave unset — Hashnode is dropped |
| `GOOGLE_ANALYTICS_CREDENTIALS` | ✅ Yes | GSC + GA4 auth (same service account) |
| `GSC_SITE_URL` | ✅ Yes | `sc-domain:aideazz.xyz` |
| `GA4_PROPERTY_ID` | ✅ Yes | `515154124` |


## 13. HubSpot Income Dashboard + BrightData Full Wiring (May 14–16, 2026)

### What shipped

All agents now feed HubSpot as a unified income dashboard. Three deal types in one pipeline (free tier), separated by name prefix:

| Prefix | Source agents | HubSpot stage on arrival |
|--------|--------------|--------------------------|
| `[HIRING]` | VJH LangGraph after each application | Appointment Scheduled (= Applied) |
| `[CLIENT]` | SEO inquiry form, Algom Alpha X stream, EspaLuz Influencer (marketing days) | Appointment Scheduled (= Prospected) |
| `[ESPALUZ]` | EspaLuz WhatsApp `user_trial_system.py`, EspaLuz Telegram `espaluz_database.py`, EspaLuz Influencer (EspaLuz days) | Appointment Scheduled (= Trial Started) |

Stage progression mapping (free-tier stage names → real meaning):
- Appointment Scheduled = Applied / Prospected / Trial Started
- Qualified to Buy = Recruiter Responded / Contacted / Trial Active
- Presentation Scheduled = Interview / Demo Call / Personal Outreach Sent
- Decision Maker Bought In = Offer / Proposal / Payment Link Sent
- Contract Sent = Negotiating
- Closed Won / Closed Lost = final outcomes

### /api/crm-event hub (CTO AIPA)

Single POST endpoint all agents call. Auth: `Bearer OUTREACH_SECRET`.

```
POST https://webhook.aideazz.xyz/cto/api/crm-event
Body: { source, type, pipeline: "hiring"|"client", stage?, email?, domain?,
        name?, context?, jobTitle?, company?, recruiterEmail?, jobUrl?, score?, urgency?, notes? }
```

Logs to Oracle `agent_outcomes` table. Routes to `pushHiringDealToHubSpot()` or `pushLeadToHubSpot()` based on pipeline. Non-fatal — 500 from HubSpot never breaks caller.

**🆕 July 9 2026 — `source: "atlas_radar"` branch:** Atlas daily-brief cron POSTs detected **ENTER windows** here (`whitespace/src/radar-to-crm.ts`, fail-open, `ATLAS_CRM_RADAR_PUSH=off` to disable). Routes to **`pushAtlasRadarDealToHubSpot()`** → deal-only **`[ATLAS-RADAR] {vertical} — ENTER: {angle}`**, deduped by dealname (score/why live in the note, not the name). Bypasses the RIGHT-CLIENT gate **by design** (EspaLuz pattern — a market window is an action item, not a buyer lead) and deliberately carries **no UTM/concept attribution**, so radar insights can never inflate the Atlas conversion ledger (`hubspot_deals` stays real-conversions-only). Body: `{ source:"atlas_radar", pipeline:"client", vertical, angle, state, score?, why?, evidence?, atlas_concept_id?, landing_url? }`. Commits: cto-aipa `3f8faba`, atlas-shifted `b640d63`.

### /api/performance-event hub (Atlas ↔ AIdeazz — June 29 2026; GA4 adapter July 3 2026)

Sidecar outcome ledger for Atlas creatives. Auth: `Bearer OUTREACH_SECRET` (same secret as CRM hub).

```
POST https://webhook.aideazz.xyz/cto/api/performance-event
Body: { source, concept_id, vertical, angle_id?, metrics: { spend?, clicks?, conversions?, revenue?, sessions?, leads?, ga4_sessions?, ga4_key_events?, hubspot_deals?, wa_clicks? },
        period_start?, period_end?, notes? }

GET https://webhook.aideazz.xyz/cto/api/atlas-performance?vertical=&concept_id=
```

Writes Oracle **`atlas_performance_events`**. Atlas **`/api/atlas`** reads aggregated totals when `ATLAS_PERFORMANCE_SECRET` is set in `whitespace/.env`.

| Adapter | Script / trigger | Metric names |
|---------|------------------|--------------|
| Form leads | `~/cto-aipa/scripts/sync-atlas-business-leads.mjs` | `leads` |
| GA4 nightly | `~/cto-aipa/scripts/sync-atlas-ga4.mjs` (cron 06:15 UTC) | `ga4_sessions`, `ga4_key_events` |
| HubSpot deals | `src/atlas-crm-bridge.ts` (sidecar) | `hubspot_deals` |

### BrightData enrichment layers (brightdata-enrich.ts)

Zone: `web_unlocker1` | Token: `BRIGHTDATA_API_TOKEN` | Cost: ~$1.50/CPM (web_unlocker)

| Function | What it fetches | When triggered |
|----------|----------------|----------------|
| `enrichLeadWebsite(url)` | Company homepage → founders, tech stack, team size, funding signal | Algom Alpha CLIENT deals with a domain |
| `enrichLinkedInCompany(url)` | `linkedin.com/company/{slug}` → employee range, type, HQ, founded, recent open roles | CLIENT deals where context contains a LI company URL |
| `enrichCrunchbase(slug)` | `crunchbase.com/organization/{slug}` → total funding, last round, investors | CLIENT deals where context contains a CB org URL |
| `enrichCompanyFull({websiteUrl, linkedinUrl, crunchbaseSlug})` | All three in parallel, non-fatal per source | Auto-triggered in /api/crm-event for CLIENT pipeline |
| `bdFetch(url)` | Any URL via BrightData Web Unlocker (raw HTML) | Base primitive for all above |

All results appended to HubSpot deal notes as structured sections (`--- LinkedIn ---`, `--- Crunchbase ---`).

### VJH → HubSpot wiring (crm_hub.py)

File: `src/langgraph_pipeline/crm_hub.py`

```python
push_application_to_crm(job_title, company, job_url, recruiter_email, stage, score)
```

Called from `nodes.py` after every LangGraph application. POSTs to `/api/crm-event` with `pipeline=hiring`. Deal notes include score and apply URL. `human_pending` jobs get a `⚠️ NEEDS MANUAL APPLY` note.

### BrightData LinkedIn Jobs (VJH job_monitor.py)

Method: `_search_brightdata_linkedin()` — added to secondary sources pool, 60s timeout.

- Queries 3 LinkedIn search URLs (founding AI engineer, fractional CTO, AI automation engineer)
- URL: `linkedin.com/jobs/search/?keywords=...&location=Worldwide&f_WT=2&f_JT=F&f_TPR=r86400`
- Returns ~120 jobs per cycle from LinkedIn SSR HTML (confirmed working May 16)
- Enriches top 5 gate-passing candidates with individual job page fetch → salary, applicant count, seniority level
- Env: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_ZONE` added to VJH `.env`

### Gate additions (job_gate.py)

Two new gates added May 16:

```python
# Gate 4.1 — applicant count (from BrightData LinkedIn enrichment)
if applicant_count > 200: return False  # too crowded for cold apply

# Gate 4.2 — LinkedIn seniority field (catches what title regex misses)
BLOCKED_SENIORITY = {"director", "executive", "c-suite", "vp", "not applicable"}
if seniority_level in BLOCKED_SENIORITY: return False
```

### Eval harness (VJH evals/)

Fixed May 16:
- Layer 4 LLM judge: model updated `claude-3-haiku-20240307` (404) → `claude-haiku-4-5-20251001`
- `test_full_pipeline.py`: `SCORER_GOLDEN_SET` (scorer cases) split from `GATE_ONLY_CASES` (gate cases)
- New `test_gate_blocks_excluded_title` test validates gate on VP/Director titles
- Golden set updated: 20 scorer cases + 2 gate-only cases (v4_002 VP Eng, v4_004 Dir Eng)
- **129/129 passing**, ~$0.03/run, ~76 seconds

### aipa@aideazz.xyz email — status

SMTP: `smtp.zoho.com:587` ✅ authenticated  
IMAP: `imappro.zoho.com:993` ✅ authenticated (403 messages in inbox)  
Response detector: `src/autonomous/response_detector.py` — scans inbox every VJH cycle for recruiter replies, alerts via Telegram with `🔥🔥🔥 INTERVIEW REQUEST DETECTED`

### EspaLuz bots → HubSpot wiring

`EspaLuzWhatsApp/user_trial_system.py` — `start_trial()` PostgreSQL path: after `conn.commit()`, fires `threading.Thread` to POST `[ESPALUZ] WA {phone} — trial day 1` to `/api/crm-event`.

`EspaLuzFamilybot/espaluz_database.py` — same pattern, `[ESPALUZ] TG {user_id} — {N}d trial`.

`EspaLuz_Influencer/main.py` — `send_automated_daily_promo()`: after Make.com webhook, fires CRM signal. EspaLuz days → `[ESPALUZ] Influencer post — YYYY-MM-DD`. Marketing engine days → `[CLIENT] AIdeazz tech content — YYYY-MM-DD`.

### Commits (May 14–16, 2026)

| Repo | Commit | Description |
|------|--------|-------------|
| cto-aipa | `e66a1f0` | SEO inquiry form → HubSpot [CLIENT] |
| cto-aipa | `f32d315` | BrightData LinkedIn + Crunchbase enrichment |
| VibeJobHunterAIPA_AIMCF | `9b214e1` | Gate VP/Director/Manager + crm_hub score field |
| VibeJobHunterAIPA_AIMCF | `150ec07` | Eval harness: LLM judge model fix + golden set v4 |
| VibeJobHunterAIPA_AIMCF | `0c1151a` | test_full_pipeline: gate-only cases split |
| VibeJobHunterAIPA_AIMCF | `92e3eba` | BrightData LinkedIn Jobs source + gate 4.1/4.2 |
| VibeJobHunterAIPA_AIMCF | `b33f7d1` | Fix LinkedIn URL (SSR search page, not guest API) |
| VibeJobHunterAIPA_AIMCF | `ec4e072` | Fix nodes.py f-string syntax error (was killing pipeline) |
| EspaLuzWhatsApp | `887f419` | Trial start → HubSpot [ESPALUZ] |
| EspaLuzFamilybot | `80be496` | Trial start → HubSpot [ESPALUZ] |
| EspaLuz_Influencer | `d1534d9` | Daily posts → HubSpot CRM signal |


---

## 🆕 May 20 2026 — HubSpot prefix architecture + Sprinter voice fix + xAI key in env

### HubSpot dealname prefix system (deployed May 20 2026)

Every HubSpot deal is now stamped with a `[STREAM-AGENT]` prefix so the dashboard is scannable by source. Helper functions live in:

- `/home/ubuntu/cto-aipa/src/hubspot-client.ts` — `pushHiringDealToHubSpot` and `pushLeadToHubSpot` both accept `sourcePrefix?: string`. When set, dealname is wrapped as `[<sourcePrefix>] <baseName>`.
- `/home/ubuntu/cto-aipa/src/cto-aipa.ts` — `/api/crm-event` endpoint destructures `sourcePrefix` from body and passes through to the right helper.

Active prefixes (full reference: `docs/HUBSPOT_NAMING.md`):

| Prefix | Writer | Pipeline |
|--------|--------|----------|
| `[HIRING-VJH]` | `crm_hub.py` (VJH) | HIRING |
| `[HIRING-VJH-SERP]` | `serpapi_jobs_ingest.py` (VJH) | HIRING |
| `[CLIENT-CTO-INGEST]` | `fresh-leads-ingest.ts` + `lead-triage.ts` (CTO) | CLIENT |
| `[CLIENT-CTO-SERP]` | `serpapi-prospects.ts` (CTO) | CLIENT |
| `[CLIENT-ALGOM]` | `algom-poll.js` + `stream-listener.js` (dragontrade) | CLIENT |

Backwards compatible: callers without `sourcePrefix` keep legacy naming. New writers MUST set `sourcePrefix` — pick from the table or add a new reserved prefix.

**Smoke test (verifies end-to-end):**
```bash
S=$(grep '^OUTREACH_SECRET=' /home/ubuntu/cto-aipa/.env | cut -d= -f2-)
curl -s -X POST https://webhook.aideazz.xyz/cto/api/crm-event \
  -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d '{"source":"smoke","type":"application","pipeline":"hiring","sourcePrefix":"TEST","jobTitle":"x","company":"y","domain":"z.io","jobUrl":"https://z","stage":"applied"}'
# Then DELETE the resulting deal+company via /crm/v3/objects/{deals,companies}/{id}
```

### Sprinter voice-knowledge fix (deployed May 20 2026)

The Telegram voice handler in `telegram-bot.ts` previously created Trello cards from voice notes but never persisted them to Oracle `knowledge_base`. The Lambda morning briefing therefore had zero voice context. Fixed in two places:

1. `src/telegram-bot.ts`: both Trello return paths (`processMultiAction` and `createTrelloCardFromTranscript`) now call `saveKnowledge(userId, 'voice_note', ...)` before returning.
2. `src/cto-aipa.ts`: `/sprint-knowledge` endpoint now fetches `getKnowledgeByCategory(uid, 'voice_note', 10)` alongside existing `diary` and `task` queries, and renders them under "recent voice notes" in the Lambda context.

### Voice→Trello move fix + `[HIRING-VJH-LEAD]` purge (deployed July 25 2026, commit `0e027b1`)

Two bugs made spoken moves disobey ("move the court cards to Kira Agosto, column Cita"):

1. **The column was thrown away.** The move branch hard-coded `resolveList(lists, 'todo_flow')`, and the move action schema had no `targetList` field at all — every moved card landed in "Надо сделать / Поток" regardless of the column named.
2. **The board resolved to the wrong month.** The fallback matched any word, so "Kira Agosto" hit whichever `Kira …` board came first (Julio / Finance / Habits); `agosto` was not even in the month list.

Fix in `src/trello-voice.ts`: `targetList` added to the move action + prompt rules, plus two resolvers — `resolveMoveDestBoard()` (structured key → named-month token that MUST match → `BOARD_KEYWORDS` → best word-overlap) and `resolveMoveDestList()` (real list-name substring, e.g. `"Cita"` → `Датировано / "Cita"` → `LIST_KEYWORDS` synonyms → `todo_flow` only as last resort).

Verified against the live board/list names with the compiled `dist/trello-voice.js`: "Kira Agosto"+"Cita" → `Kira Agosto 2026 / Датировано / "Cita"`; "kira julio"+"поток" → `Kira Julio 2026 / Надо сделать / "Поток"`; no column named → `Поток` fallback.

**Deploy note (bit me here):** Oracle has **no `tsc`** (`node_modules/typescript` absent) — `npm run build` on the server fails with `sh: 1: tsc: not found`. Build locally on Windows, back up the server file, then `scp dist/<file>.js oracle-cto-aipa:/home/ubuntu/cto-aipa/dist/` and `pm2 restart cto-aipa --update-env`.

**Card purge (same day):** 54 stale `[HIRING-VJH-LEAD]` cards (auto-pushed recruiter/job emails) deleted from the Kira boards; 0 remain across all 11 boards; `[hs:]` client cards and real job cards untouched. Full card data backed up first to `backups/trello-vjh-cards-20260724-175218.json` on Oracle **and** on the Windows clone. That file is **gitignored on purpose — this repo is PUBLIC and the dump carries recruiter names, emails and message bodies.** Never commit it.

### XAI_API_KEY env requirement (added May 20 2026)

xAI team key for `rhino-sneezing-lemon` (X account `1910676161845186560`) is now in env on both:

- `/home/ubuntu/cto-aipa/.env` — `XAI_API_KEY`, `XAI_TEAM_NAME`, `XAI_TEAM_X_ACCOUNT_ID`
- `/home/ubuntu/dragontrade-agent/.env` — same 3 keys

**Status:** key available in env, **not yet wired to any code**. Three pending wiring options (each its own session): (1) Algom backup Twitter listener with higher rate limits, (2) Grok-as-LLM in CTO AIPA model routing, (3) xAI team-level X API access.

**Security note:** key was shared in chat on May 20 2026; rotate before production use.


---

## NEW May 22 2026 - Blog SEO fix (per-article static HTML pages)

### Root cause confirmed by audit

aideazz.xyz blog URLs were all serving identical generic SPA shell HTML to Google. All 30+ articles looked like duplicate content - zero organic discovery. The previous sitemap fix (commit 8c65f07) was correct, but the URLs it pointed to had no per-article content.

### What changed (2 commits across 2 repos)

**cto-aipa commit 8984a02:**
- NEW file src/blog-static-pages.ts - reads data/blog-posts-cache.json, renders markdown to HTML inline (no new npm deps), generates per-article static HTML with article-specific title/OG tags/JSON-LD/article body, pushes to ElenaRevicheva/aideazz/public/blog/SLUG/index.html via GitHub Contents API.
- RENAMED src/hashnode-daily.ts to src/daily-blog-publisher.ts (file name now matches function; Hashnode was already removed in b30c334).
- WIRED into the renamed file alongside pushSitemapToGithub (fire-and-forget; auto-fires after every blog publish).
- 14 cached articles backfilled (one-shot run).

**aideazz commit e4fe4ee:**
- 1-line additive rule in public/_redirects: `/blog/:slug    /blog/:slug/index.html    200`
- Inserted ABOVE the SPA catch-all so /blog/SLUG (no trailing slash) serves the static HTML.
- All other existing rules preserved.

### Verification (live)

```bash
curl -s 'https://aideazz.xyz/blog/what-a-fractional-cto-actually-does-for-ai-startups' | grep -oE '<title>[^<]+</title>'
# Returns: <title>What a Fractional CTO Actually Does for AI Startups | AIdeazz</title>
```

Was: `<title>AIdeazz - AI Personal Assistants That Evolve With You</title>` (generic).
Now: article-specific title, OG tags, JSON-LD, real article body in HTML.

### Operational notes

- Future articles auto-generate static HTML when daily-blog-publisher cron fires (no manual action)
- If GITHUB_TOKEN expires, BlogStatic logs a warning and skips - daily blog publish still works
- 4everland deploy lag: ~90-180 seconds after GitHub commit
- Google re-crawl + ranking impact: ~1-2 weeks


---

## NEW May 24 2026 (evening) — FAQPage schema (AEO) + Groq 413/429 fixes + Remote Control

### FAQPage JSON-LD schema (AEO discoverability)

Was: ARTICLE_SYSTEM prompt required `## Frequently Asked Questions` (3-5 Q&A pairs) and validateArticle gated publication on it. Content was visible to humans as headings + paragraphs, but the static-HTML generator only emitted BlogPosting JSON-LD. Crawlers couldn't recognize the Q&A as discrete answerable entities.

Now: `cto-aipa/src/blog-static-pages.ts` has `extractFaqPairs()` that parses the markdown FAQ section and emits a second `<script type="application/ld+json">` with FAQPage schema. Purely additive — BlogPosting unchanged. Falls back gracefully (no FAQPage emitted) if article lacks the section.

Verified live: every blog URL on aideazz.xyz now serves both BlogPosting + FAQPage JSON-LD blocks. Google AI Overview / Perplexity / Bing Chat now pull from your Q&A as authoritative.

### Groq 413 (request too large) pre-check

Code-review path was sending full PR diffs to Llama 3.3 70B on Groq, exceeding ~8K token context. Returned 413 repeatedly. Fallback to Claude Haiku worked, but warnings flooded logs.

Fix in `cto-aipa.ts`: pre-check `aiPrompt.length > 24_000` chars before calling Groq. If too big, throw a typed pre-check error logged quietly (not warn). Saves ~100 noisy log lines per cycle.

### Groq 429 (rate limit) 60-second cooldown

Free-tier Groq has per-minute rate limits. When 429 hit, fallback worked but next call also tried Groq, also 429'd, etc — log flood.

Fix in `cto-aipa.ts`: module-scope `groqCooldownUntil` timestamp. On 429, set cooldown 60s into future. Pre-check skips Groq during cooldown (1 quiet log per skip). After cooldown expires, retries Groq normally. Genuine unexpected errors (network/auth) still warn loudly.

### Claude Code Remote Control activation (works on Windows)

Successfully activated `claude remote-control` for working from phone while away from laptop. Stack:
- Claude Code v2.1.149 installed via MSIX (Windows Store package, at `C:\\Users\\kirav\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\claude-code\\2.1.149\\claude.exe`)
- Auth: `claude auth login --claudeai` (browser OAuth to elena.revicheva2016@gmail.com Pro account)
- TUI requires Windows Terminal (not raw cmd.exe — MSIX symlink + ConPTY issues)
- Workspace trust dialog accepted by running interactive Claude in the worktree path once
- Desktop launcher: `claude-remote.bat` (PowerShell wrapper, auto-finds latest claude.exe version)

Ritual: plug in laptop → double-click `claude-remote.bat` → press `y` + Enter (default spawn mode) → press SPACE for QR → Win+L to lock screen → take phone (Claude app, Code tab, scan QR) → continue work from phone.

Security: phone session has FULL access to SSH/git/HubSpot. If phone lost during away time, come back to laptop, Ctrl+C the terminal window, session dies immediately.

### Operational verification commands

```bash
# FAQ schema live on any article:
curl -s 'https://aideazz.xyz/blog/<slug>/' | python3 -c "import sys,re; html=sys.stdin.read(); print('FAQPage:', 'YES' if 'FAQPage' in html else 'NO')"

# Groq cooldown active:
pm2 logs cto-aipa --nostream --lines 100 | grep -E 'pre-check|429 hit|cooldown'

# Remote control auth + version:
& 'C:\\Users\\kirav\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\claude-code\\2.1.149\\claude.exe' auth status
```

### Commits

- `c053548` feat(blog-seo): emit FAQPage JSON-LD schema from article markdown
- `44c26bc` fix(code-review): option-a Groq 60s cooldown after 429 to silence rate-limit noise
- `7d5c01f` fix(code-review): pre-check prompt size before Groq call to avoid 413 noise


### XAI status update — May 25 2026 — Grok wiring complete in dragontrade-agent

The May 20 2026 note above said the `XAI_API_KEY` (rhino-sneezing-lemon
team, X account `1910676161845186560`) was "in env, not yet wired to any
code." That's now superseded for **option (1) Algom backup / Grok routing**:

**Wired in `dragontrade-agent` commit `294efee`** (pushed to origin/main):

- New file `grok-content.js` — minimal xAI Chat Completions wrapper using
  model `grok-4.20-0309-non-reasoning`. Consecutive-failure cutoff at 3
  prevents burning credits on a depleted account; HTTP 402 (credits
  depleted) and 429 (rate limit) raised with specific error messages for
  log triage.
- `index.js` switch: educational posts try Grok first
  (`generateEducationalWithGrok()`), fall back to the 7-month-old CMC
  engine (`this.cmcEngine.generateRealInsight(...)`) on any Grok error.
  `isGrokTemporarilyDisabled()` short-circuits Grok calls after the
  cutoff fires.

**Verification anchors in logs** (`pm2 logs dragontrade-main`):
- Success: `✅ Generated via Grok (xAI)`
- Graceful fallback: `⚠️ Grok failed (...) — falling back to CMC/Claude`
- Cutoff active: `ℹ️ Grok temporarily disabled (consecutive failures) — using CMC/Claude`

**Posting identity unchanged.** The bot still posts from `@reviceva`
(Elena's personal X dev account via existing `TWITTER_API_KEY` /
`TWITTER_ACCESS_TOKEN` in `dragontrade-agent/.env`). The rhino-sneezing-
lemon team account ID `1910676161845186560` is **not** used for posting —
only the team's xAI key is consumed, for the educational slot only.

**Cadence note for future ops.** `POST_INTERVAL_MIN` and
`POST_INTERVAL_MAX` are read from `process.env` first with `'300'`/`'420'`
as fallbacks. `dragontrade-agent/.env` was previously set to `120`/`180`
which silently overrode the new code defaults. Both `.env` and code now
agree on `300`/`420` (≈4 posts/day). If you tweak cadence, update both
or remove the `.env` lines so the code defaults take effect.

**Still pending wiring** for the same xAI key (separate future sessions):
(2) Grok-as-LLM in CTO AIPA model routing,
(3) xAI team-level X API access (would change posting identity — defer
unless brand strategy says otherwise).


### check_oracle_health.sh status update — May 25 2026 — jq fix for dragontrade loop

The dragontrade-* loop in `/home/ubuntu/check_oracle_health.sh` previously
used `pm2 describe "$app" | grep -q "status: online"`. That grep NEVER
matched because pm2's actual output is box-drawing-character formatted
(`│ status │ online │`), not colon-separated. The script wrongly restarted
every dragontrade-* app on EVERY 5-min cron tick for weeks, creating a
silent 5-min crashloop that prevented Algom Alpha's engagement loop from
ever completing a cycle (first run is delayed 5 min after bot startup —
exactly when the cron restart fired).

**Patched live (live state on Oracle VM):**

```bash
# 4. Algom Alpha (dragontrade PM2 apps)
# May 25 2026 FIX: use jq on pm2 jlist. Previous grep "status: online"
# NEVER matched because pm2 describe uses box-drawing chars (no colon).
for app in dragontrade-main dragontrade-dashboard; do
  status=$(pm2 jlist 2>/dev/null | jq -r --arg app "$app" '.[] | select(.name==$app) | .pm2_env.status' 2>/dev/null)
  if [ -z "$status" ]; then
    echo "Algom Alpha / $app (4) MISSING from pm2 list, skipping (deleted or never started)"
  elif [ "$status" != "online" ]; then
    echo "Algom Alpha / $app (4) status=$status, restarting..."
    pm2 restart "$app"
  fi
done
```

Also: `dragontrade-bybit` and `dragontrade-binance` removed from the loop
(both deleted from pm2 via `pm2 delete` + `pm2 save` and commented out of
`dragontrade-agent/ecosystem.config.cjs` — the new 20-post cycle is 0%
paper_trading so they're orphaned).

**Companion fix in cto-aipa:** `src/daily-blog-publisher.ts` now uses
sliding-window mutex + prefix-collision dedup + always-fire Telegram
notification on every outcome. Env knobs:
`HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES` (default 12),
`HASHNODE_DAILY_SLUG_PREFIX_LEN` (default 30). Prevents the May 24 issue
where two BrightData articles published 20 min apart with no Telegram
notification.

**Verification anchors in logs:**

- Engagement cycle success: `[Engagement] Done — N replies sent, M new follows` in `pm2 logs dragontrade-main`
- Engagement state file exists at `/home/ubuntu/dragontrade-agent/engagement_state.json`
- Blog publish success: `📰 Article published.` followed by Telegram notify
- Blog publish skipped: `📰 Daily blog SKIPPED: ...` + dedicated skip notify to Telegram

**Lesson rule documented in SKILL.md** (Interview story #5): "Verify from
logs, never claim from config." Before reporting agent behavior, grep
historical logs for the ACTION line (not the SETUP line). If the action
signature count is 0, the behavior isn't happening regardless of config.


### Daily blog publisher — Hashnode->DailyBlog rename (May 25 2026 late-evening)

Internal symbol cleanup: the publisher hasn't written to Hashnode in weeks,
it publishes to Dev.to + aideazz.xyz only. Renamed everything in commit
`1565895` to match reality. Backward compat preserved for all env vars and
HTTP routes.

**Canonical names going forward:**

| Old | New |
|---|---|
| `HASHNODE_DAILY_ENABLED` | `DAILY_BLOG_ENABLED` |
| `HASHNODE_DAILY_CRON` | `DAILY_BLOG_CRON` |
| `HASHNODE_DAILY_TZ` | `DAILY_BLOG_TZ` |
| `HASHNODE_DAILY_TRIGGER_SECRET` | `DAILY_BLOG_TRIGGER_SECRET` |
| `HASHNODE_DAILY_PUBLIC` | `DAILY_BLOG_PUBLIC` |
| `HASHNODE_DAILY_DELISTED` | `DAILY_BLOG_DELISTED` |
| `HASHNODE_DAILY_DEVTO_ONLY` | `DAILY_BLOG_DEVTO_ONLY` |
| `HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES` | `DAILY_BLOG_MIN_HOURS_BETWEEN_PUBLISHES` |
| `HASHNODE_DAILY_SLUG_PREFIX_LEN` | `DAILY_BLOG_SLUG_PREFIX_LEN` |
| `HASHNODE_DAILY_RUN_ON_START` | `DAILY_BLOG_RUN_ON_START` |
| `HASHNODE_ARTICLE_MODEL` | `DAILY_BLOG_ARTICLE_MODEL` |
| `HASHNODE_TOPIC_STATE_DIR` | `DAILY_BLOG_TOPIC_STATE_DIR` |
| `TELEGRAM_HASHNODE_NOTIFY_CHAT_ID` | `TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID` |

**HTTP routes:**

| Operation | Canonical (new) | Deprecated alias (still works, 307-redirects) |
|---|---|---|
| Status | `GET /blog/daily-status` | `GET /hashnode/daily-status` |
| Manual trigger | `POST /blog/daily-run` | `POST /hashnode/daily-run` |

The deprecation alias responses include an `X-Deprecation:` header indicating
the new canonical path. 307 status preserves the POST method + body, so any
existing webhook with `Authorization: Bearer ...` header continues to work
unchanged through the redirect.

**Out of scope** for this rename (separate future cleanup): `HASHNODE_ACCESS_TOKEN`,
`HASHNODE_HOST`, `HASHNODE_PUBLICATION_ID`, `HASHNODE_SUBDOMAIN` — these belong
to `src/blog-es-bundle.ts`, which uses Hashnode public GraphQL as a vestigial
*source* for legacy Spanish translation cache. Not a publish target.

**Verification anchors:**

- Startup log: `📰 Daily blog: scheduled 30 14 * * * (America/Panama) — mode: Dev.to + aideazz.xyz cross-post — listed: yes`
- Successful publish: `📰 Daily blog published` (Telegram notify text starts with this)
- Failure: `🚨 Daily blog FAILED` (Telegram notify text)
- Skip (mutex): `📰 Daily blog SKIPPED: last publish was N.Nh ago (< 12h cooldown)`


### Outreach bogus-retry-loop fix — May 25 2026 evening (later)

The daily Phase 4 outreach Telegram summary kept showing the same Resend
422 "invalid email" failures every day even after the May 25 morning
isBogusOutreachEmail filter shipped. Root cause: the morning filter ran
only at draft-CREATION time (`generateBatchDrafts`). The actual SEND step
(`sendApprovedDrafts`) iterates `outreach_log` status='draft' and sends
ALL of them without checking — old bogus drafts retried every cron run
forever.

**Three-layer fix in commit `daf757b`:**

| Layer | What | Where |
|---|---|---|
| 1 | `getOutreachDrafts` SQL excludes targets with status='invalid_email'/'archived'/'dismissed' | `src/database.ts` |
| 2 | `sendApprovedDrafts` pre-send check via `isBogusOutreachEmail`; on bogus -> mark target invalid_email + draft rejected_bogus_email | `src/outreach.ts` |
| 3 | `sendApprovedDrafts` on Resend 422 (invalid email format) -> auto-mark target invalid_email + draft rejected_by_resend_422 (so it never retries) | `src/outreach.ts` |

**DB backfill done live**: 1 stuck bogus draft (`leeex1 / katex@0.16.9` — a
npm package version captured as email by the fresh-leads parser) was
marked invalid. Verified: bogus drafts remaining = 0.

**Verification anchors in logs**:
- Pre-send bogus auto-mark: `[outreach] auto-marked bogus draft invalid: <name> / <company> / <email>`
- Resend 422 auto-mark: `[outreach] Resend 422 auto-marked invalid: <name> / <company> / <email>`
- Phase 4 Telegram summary: new line `Auto-marked invalid (bogus or Resend 422): N — won't retry`

**Lesson rule extension** (in SKILL.md): "Verify from logs, never claim
from config" -> extended to "...and for stateful agents, query the actual
DB before claiming the bug isn't fixed (or that it is)." The DB query
showed exactly 1 bogus draft (not 20, not 0), which made the fix surgical
and the backfill trivial.


### Telegram-usefulness refactor — May 25 2026 evening (final)

The 4 daily Telegram messages from CTO AIPA (prospect ingest, AIdeazz inbound,
Lead Brief, Phase 4 outreach) all used to read from Oracle tables that are
now empty / all-archived because real lead activity flows into HubSpot since
May 24 (response_detector + crm-event wiring). Result: technically-correct
but useless "no signals" / "0 new" daily noise.

**Fix shipped in commit `4c40349`:**

- **New helper** `getActionableHubSpotDeals()` in `src/hubspot-client.ts`
  queries HubSpot for deals in stages that mean "needs my attention":
  client `qualifiedtobuy` + `contractsent`; hiring `recruiter_responded` +
  `interview_scheduled` + `offer_received`.
- **Lead Brief** (`src/lead-triage.ts buildDailyBrief`) returns `string | null`;
  null when 0 Oracle signals AND 0 HubSpot actionable. Otherwise renders
  HubSpot deals with stage hints (🔥 act today, 💬 they replied, 🎯 recruiter,
  📅 interview, 🏆 offer) + days-since-modified.
- **Silent-skip** applied to prospect-ingest (0 new), marketing-weekly-digest
  (0 inquiries), outreach Phase 4 (0 actionable activity).

**Verification anchors in logs**:
- `📥 Lead Brief: 0 Oracle signals + 0 HubSpot actionable deals — Telegram SUPPRESSED` (quiet)
- `🔍 Prospect ingestion: 0 new (all N fetched were dupes) — Telegram SUPPRESSED`
- `📣 Weekly marketing digest: 0 inquiries in last 7d — Telegram SUPPRESSED`
- `📧 Phase 4 outreach: quiet cycle (0 actionable signals) — Telegram SUPPRESSED`
- `🎯 [cron] Triage: quiet day (0 Oracle signals + 0 HubSpot actionable) — Telegram SUPPRESSED`

**Required env vars for hiring-stage filtering** (already configured):
- `HUBSPOT_API_KEY`
- `HUBSPOT_HIRING_PIPELINE_ID`
- `HUBSPOT_HIRING_STAGE_RECRUITER_RESPONDED`
- `HUBSPOT_HIRING_STAGE_INTERVIEW_SCHEDULED`
- `HUBSPOT_HIRING_STAGE_OFFER_RECEIVED`

If any hiring-stage env is unset, that stage is silently excluded from the filter (no error).


### Research agent + BrightData operations — May 25 2026 evening (post-final)

CTO AIPA now exposes 3 autonomous research commands powered by Claude
tool-use over BrightData. Implementation: `src/research-agent.ts` (the
loop + tool dispatcher) + `src/brightdata-enrich.ts` (the BD primitives:
`bdFetch`, `bdSerpSearch`, `bdScrapingBrowserFetch`, `bdSmartFetch`).

**Telegram commands** (all gated by `TELEGRAM_AUTHORIZED_USERS`):
- `/research_company <name>` — client prospect mode
- `/research_employer <name>` — hiring target mode
- `/research_competitor <domain>` — SEO/AEO competitor mode

**Env vars required (single set — all 4 BD products share):**
- `BRIGHTDATA_API_TOKEN` (already set since May 14-15)
- `BRIGHTDATA_ZONE` (= `web_unlocker1` since May 14-15)
- `ANTHROPIC_API_KEY` (Claude Sonnet 4.5 for the agent's tool-use)

**Operational characteristics:**
- Loop budget: max 8 BD tool calls per command, 120s timeout
- Returns structured markdown report (sent to Telegram chunked at 4000 char)
- Falls back gracefully on any single BD call failure
- Telegram reply format: `📊 Research: <target> (<mode>) · N BD calls · Ns · model claude-sonnet-4-5`

**Verification anchors in logs:**
- Bot startup: standard initTelegramBot output (no special line)
- Successful run: `🔍 Researching <target> (<mode>) via Bright Data + Claude tool-use loop` then `[BrightData] ...` / `[BD-SERP] ...` lines per tool call
- Errors: `❌ Research agent error: ...`

**MCP Server config for IDE-side use (`.mcp.json` at cto-aipa repo root):**
```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "${BRIGHTDATA_API_TOKEN}",
        "WEB_UNLOCKER_ZONE": "${BRIGHTDATA_ZONE}",
        "GROUPS": "browser,advanced_scraping"
      }
    }
  }
}
```
This gives Claude Code (developer side) direct access to BD tools via MCP
when working in the repo. NOT a production wiring — the production loop
is in `src/research-agent.ts`.

**Audit fix (May 25 post-final, commit `4f786d2`):** `/triage` Telegram
command now guards against `null` return from `buildDailyBrief`. Same
pattern as `/triage_urgent`. Surfaced by the non-destructive change audit.

---

## NEW May 28 2026 — Groq free-fallback on EVERY Anthropic call site (no agent dies on credit exhaustion)

**Operator goal (verbatim):** "all my agents do not silently die — none of their
features and functionalities die or hallucinate when I run out of Anthropic tokens —
let Grok truly work with its fallback."

**Problem.** A resilience audit found the codebase had *some* Groq fallbacks
(reviewCode, lead-triage, sprint-briefing, atuona, dragontrade, daily-blog
generation) but **12 Anthropic call sites had NO fallback** — they threw on the
Anthropic `400 "credit balance is too low"` error and the feature silently died.
That is why, on credit-exhaustion days, `/research_company`, outreach drafts,
prospect enrichment, LinkedIn drafts, and several Telegram commands degraded.

**Canonical helper — `src/llm-resilience.ts` (NEW).** One shared module all call
sites import. Exports:
- `isAnthropicCreditExhaustion(e)` — true only for `400` + `credit`/`balance`/`billing`
  (transient 429/503/529 are NOT treated as exhaustion — those still retry upstream).
- `claudeWithGroqFallback(anthropic, model, maxTokens, system, userPrompt, label)` —
  try Anthropic → on credit exhaustion route to **Groq `llama-3.3-70b-versatile`**
  via the official `groq-sdk` (Cloudflare-safe UA — avoids the urllib 1010 bug).
  Non-credit errors re-throw so existing retry/error handling is unchanged.

**All 12 newly-protected call sites (commit `dbc8b90`):**

| File:fn | Model (primary) | Fallback label |
|---------|-----------------|----------------|
| `cto-aipa.ts` askCTO strategic Q&A | Opus | `cto-aipa/strategic-qa` |
| `lead-triage.ts` urgency≥4 refine | Sonnet | `lead-triage/refine` |
| `trello-voice.ts` card classify | Haiku | `trello-voice/classify` |
| `research-agent.ts` tool loop | Sonnet | Groq single-shot summary on exhaustion mid-loop |
| `daily-blog-publisher.ts` GSC topic picker | Haiku | `daily-blog/topic-picker` |
| `doc-ingest.ts` prospect extract | Haiku | `doc-ingest/extract` |
| `fresh-leads-ingest.ts` pain classify | Haiku | `fresh-leads/pain-classify` |
| `outreach.ts` cold email draft | Sonnet | `outreach/email-draft` (skips retry on exhaustion) |
| `prospect-ingest.ts` pain scoring | Sonnet | `prospect-ingest/classify` (skips retry on exhaustion) |
| `prospect-places.ts` places enrich | Haiku | `prospect-places/pain-classify` |
| `telegram-bot.ts` LinkedIn draft | Haiku | `telegram-bot/linkedin-draft` |
| `trello-kanban.ts` Kanban analysis | Opus | `trello-kanban/analyze` |

`research-agent.ts` is special: its multi-turn Bright Data tool loop can't run on
Groq (no tool API parity), so on credit exhaustion it does a **Groq single-shot
summary** of whatever it gathered so far — returns a usable (if thinner) report
instead of `ok:false`.

**Already-fixed paths (context, not re-touched):**
- VJH `src/utils/claude_helper.py` `call_groq_fallback()` — fixed 2026-05-27
  (urllib→requests + UA; powers resume + cover-letter generation).
- EspaLuz WhatsApp `espaluz_bridge.py:2891` — fixed 2026-05-27 (same Cloudflare 1010 fix).
- `daily-blog-publisher.ts` main article generation — `generateTextWithGroqFallback`
  (commit `84e7486`).

**Verification — isolation test (does NOT touch the live key).**
`scripts/test-llm-resilience.ts` mocks an Anthropic client that throws the exact
`400 credit balance` error, then calls `claudeWithGroqFallback` for every label and
asserts Groq returns a non-empty response. Run on Oracle (where `GROQ_API_KEY` is set):

```bash
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/test-llm-resilience.ts"
```

**Result on Oracle May 28 2026:** `11 passed, 0 failed` — every path logged
`Anthropic credit exhausted — falling back to Groq llama-3.3-70b-versatile` and
returned real content. Deployed: `git pull` → `npm run build` → `pm2 restart cto-aipa`
(online, build clean, `tsc --noEmit` zero errors).

**Pattern earned:** *"graceful degradation is not resilience — a feature that
silently returns empty when Claude fails never actually ran Groq. Wire the fallback,
then prove it fires with an isolation test."*

---

## NEW May 28 2026 — Buffer GraphQL social distribution (ADDITIVE, parallel to Make.com CMO)

**Goal.** Turn the daily GEO/SEO/AEO blog output into multi-channel social reach with
closed-loop attribution, WITHOUT disturbing the existing CMO path.

**Two parallel social paths now exist (by design):**
1. **VJH CMO → Make.com → Buffer → LinkedIn/IG** (milestone posts) — *unchanged, untouched.*
2. **cto-aipa → Buffer GraphQL API → LinkedIn** (blog-article distribution) — *new this release.*

They are different processes (`vibejobhunter-web` vs `cto-aipa`) posting different content.
Only shared resource is the Buffer account posting queue (handled by graceful skip).

**Buffer API facts (verified live 2026-05-28):**
- Endpoint `https://api.buffer.com`, auth `Authorization: Bearer <BUFFER_API_TOKEN>`.
- Org `6837714cc8be66c3825d0904`. Channels: LinkedIn `68389647d6d25b49a18a0de2`,
  Instagram `68389b15d6d25b49a1d75b8e`, YouTube `68389437d6d25b49a1665d44`, TikTok (LOCKED).
- Mutations: `createPost` (input requires `channelId`, `schedulingType: automatic`,
  `mode: addToQueue|shareNow|shareNext|customScheduled|recommendedTime`, `assets: []`;
  optional `saveToDraft: true`, `dueAt`), `createIdea`, `editPost`, `deletePost`.
- **No analytics query** — attribution is UTM-side, not Buffer-side.

**Code (commits `41808c3` Stage A, `6e306c7` Stage B):**
- `src/buffer-publisher.ts` — standalone module: `bufferGetChannels`, `bufferPostableChannels`,
  `bufferCreatePost`, `bufferCreateIdea`, `generateSocialVariant` (Claude→Groq via
  `claudeWithGroqFallback`), `buildUtmLink`, `distributeArticleToBuffer`, `isBufferSocialEnabled`.
- `scripts/buffer-cli.ts` — manual CLI: `channels | idea | dry | draft | post`.
- `src/daily-blog-publisher.ts` — ONE added fire-and-forget block after `saveBlogPostCache`,
  gated on `BUFFER_SOCIAL_ENABLED`, try-catch wrapped (cannot break the blog cycle).
  Mirrors the existing `blog-static-pages` additive pattern.

**UTM loop (the measurement):** each post carries
`aideazz.xyz/blog/{slug}?utm_source=linkedin&utm_medium=buffer_cmo&utm_campaign={slug}` →
click-through → `/marketing/inquiry` → lead-triage → HubSpot. Wires the pending `[CLIENT-CMO]`
attribution from the UTM side (no LinkedIn API needed).

**Env (gitignored, set local + Oracle):** `BUFFER_API_TOKEN`, `BUFFER_ORG_ID`,
`BUFFER_TARGET_SERVICES=linkedin`, `BUFFER_SOCIAL_ENABLED=true` (live on Oracle).

**Verified on Oracle:** `createIdea` test OK; `channels` lists 4; `dry` generated a real
LinkedIn variant w/ UTM link; `draft` created Buffer draft `6a18a026c50122d5a577c8cc`
(saveToDraft, not published). Build clean, `tsc --noEmit` zero errors, `cto-aipa` online
after restart. Next daily blog cron (14:30 Panama) auto-distributes via `addToQueue`.

**Safety verification command (run anytime):**
```bash
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/buffer-cli.ts dry"
```

**Pattern earned:** *"a new distribution arm should be a second parallel path, never a
rewrite of the working one — gate it off by default, prove it with draft mode, then flip on."*

---

## NEW May 29-30 2026 — AIdeazz Voice Growth Engine + Podcast (additive, gated, in cto-aipa)

**What it is:** Voice/topic → bilingual omnichannel campaign + an actual auto-publishing podcast.
All additive in the `cto-aipa` (AIPA_AITCF) process; existing agents untouched. Full design +
build history in [[project_voice_growth_engine]] memory + the marketing roadmap doc.

**Telegram commands (in `cto-aipa`, gated by env flags):**
- `/campaign` (reply to a voice note) → Speechmatics transcribe+translate → Claude→Groq atomizer →
  bilingual blog + LinkedIn/IG, UTM-tagged → publish. Flag `VOICE_ENGINE_ENABLED=true`.
- `/podcast` (reply to audio) + `/podcast_ai <topic>` → same + show notes/chapters + **publishes an
  audio episode to the podcast feed**. Flags `PODCAST_ENGINE_ENABLED=true`, `PODCAST_PUBLISH_ENABLED=true`.

**Key files (cto-aipa/src):** `speechmatics.ts` (ASR+translation+diarization), `voice-growth-engine.ts`
(atomizer), `voice-campaign-publish.ts` (blog+Buffer), `podcast-engine.ts` + `podcast-command.ts` +
`podcast-ai-command.ts`, `podcast-feed.ts` (RSS+site+SEO), `podcast-publish.ts` (GitHub-API publish).
CLIs: `scripts/voice-engine-cli.ts`, `scripts/podcast-host-cli.ts` (init|info|reseed).

**External infra (NEW):**
- **Podcast site/repo:** `ElenaRevicheva/aideazz-podcast` (separate repo) → **4everland** → `https://podcast.aideazz.xyz`
  (Cloudflare CNAME `podcast` → ddnsweb3.com, DNS-only). Feed `…/feed.xml`. Episodes commit via GitHub API → 4everland auto-redeploys.
- **Distribution LIVE:** Spotify for Creators (auto-polls feed) + YouTube @AIdeazz podcast (Public, auto-uploads). Apple pending.
- **Fonts:** Figtree TTF installed on Oracle `~/.fonts/Figtree.ttf` (+`fc-cache`) — required for the
  server-rendered cover PNG (sharp/librsvg via fontconfig). If cover reverts to Arial, re-install.

**Env added to `/home/ubuntu/cto-aipa/.env` (gitignored):** `SPEECHMATICS_API_KEY`, `SPEECHMATICS_REGION=eu1`,
`BUFFER_API_TOKEN`, `BUFFER_ORG_ID`, `BUFFER_TARGET_SERVICES`, `BUFFER_SOCIAL_ENABLED`, `VOICE_ENGINE_ENABLED`,
`PODCAST_ENGINE_ENABLED`, `PODCAST_PUBLISH_ENABLED`, `PODCAST_SITE_URL=https://podcast.aideazz.xyz`.
(Rotate Speechmatics + Buffer keys — they appeared in chat during setup.)

**Verify command:** `ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/voice-engine-cli.ts health"`
(Speechmatics auth) and `npx ts-node scripts/podcast-host-cli.ts info`.

**Pattern earned:** *"distribute once, prove each leg from evidence — feed item, Dev.to URL, Buffer
'sent' status, UTM in content, 200 from /marketing/inquiry — never claim propagation from config."*

## NEW June 12 2026 — blog-static deploy semantics fix (`1cc388a`, deployed + verified online)

**Incident:** `aideazz.xyz/blog/0-to-1-transferable-skills` returned a raw IPFS resolution error
("no link named … under bafybei…"). The article's static page WAS committed to the aideazz repo —
but by `src/blog-static-pages.ts` with `[skip ci]`, so 4everland never rebuilt. Every NEW article
404'd on its own URL until an unrelated commit happened to trigger a deploy.

**Fix (cto-aipa `1cc388a`):** `[skip ci]` is appended only when UPDATING an existing page (GitHub
Contents API returned a `sha`). A NEW page commits normally → exactly one deploy per new article.
Bulk-regenerate deploy-storm protection preserved (unchanged files produce no commits at all).

**Deploy:** `git pull` + `npm run build` (tsc clean) + `pm2 restart cto-aipa` on Oracle.
**Verified:** `pm2 jlist | jq -r '.[] | select(.name==$n) | .pm2_env.status'` → `online`,
restart count 11; boot logs show full startup (business_leads ready, scheduled tasks, SerpProspects).

**Rule earned:** *"A new public artifact must trigger its own deploy — the pipeline that creates
something linkable owns making it reachable."*

**Same-day public proof layer refresh (aideazz repo `83fd5df`→`d742a6c`):** SOP EN+ES actualized to
June 2026 (Grok tier-3 failover, Bright Data layer, bilingual blog pipeline, NEW "engagement loop
that never ran" postmortem — this doc's verify-from-logs story is now public); root `favicon.ico`
regenerated from the real AIdeazz logo (multi-size) + crisp 32px/apple-touch icons wired sitewide;
portfolio diagram labels corrected + honest "9 live 24/7" count enforced in 8 places EN+ES.

## NEW June 13 2026 — Atuona Ray-3 swap + operator-selectable video providers (`cbc3a49`, deployed)

**Backup before touching the live creative agent:** tag `atuona-pre-ray3-multiprovider-20260613` +
branch `backup/atuona-pre-multiprovider-20260613` pushed to GitHub. Restore: `git checkout <tag>`.

**Shipped in `src/atuona-creative-ai.ts`:**
- **Luma Ray-2 → Ray-3** (`VIDEO_MODELS.lumaDirect`), env-overridable `LUMA_VIDEO_MODEL`. Ray-3 =
  native 1080p, ~3x cheaper, 16-bit HDR, best-in-class video-to-video. Replicate fallback deliberately
  KEPT on `ray-2-720p` so the fallback never shares a Ray-3 enum/schema surprise.
- **Operator-selectable engine:** `/visualize <provider> NNN` where provider ∈ luma | runway | veo
  (aliases ray3/gen4/google). Explicit provider runs FIRST, then falls back through
  Luma→Replicate→Runway with honest provider labeling on the delivered clip. Bare `/visualize NNN`
  unchanged (default chain).
- **NEW `generateWithVeo`** — Google Veo 3.1 via Gemini API (image→video, native audio), self-contained
  submit+poll, returns ready videoUrl (same delivery path as Luma-via-Replicate). Activates when
  `GEMINI_API_KEY`/`GOOGLE_API_KEY` is set; without it returns clean failure → falls through to the chain.
  **STATUS: wired but UNTESTED — no GEMINI key on Oracle yet; Veo's Gemini response shape needs one live
  confirmation once a key is added (response parse has defensive fallbacks).**
- `tryRunway()` extracted so Runway can run primary OR fallback; call-site direct-URL delivery generalized.

**Deploy:** pull + `npm run build` (tsc clean) + `pm2 restart cto-aipa`. Verified `online` (restart 12),
boot log `🎭 Atuona Creative AI started: @Atuona_AI_CCF_AIdeazz_bot` — clean init, no crash.

**Root cause of the June 12 Atuona failure (same as Algom): billing.** Luma API wallet hit
`{"detail":"Insufficient credits"}` — Direct + Modify (Director's Cut) both 402; Replicate fallback
delivered the base cut. Luma API wallet is SEPARATE from the consumer app: top up at
https://lumalabs.ai/dream-machine/api/billing/overview (not Account→Subscription).

**Fallback truth (answer to "do I fall back to runway/dalle?"):** video falls back Luma→Replicate→Runway
(yes Runway). Images are **Flux-only** (Ultra→Pro→Dev) — **no DALL-E** anywhere in /visualize.

## NEW June 13 2026 — Luma migrated to current API (agents.lumalabs.ai/v1 + ray-3.2), commit `e523b8b`

**Root cause of the "Insufficient credits" / 403 confusion:** Luma runs TWO APIs.
- LEGACY (what Atuona used): `api.lumalabs.ai/dream-machine/v1`, ray-2, old keys — wallet $0, being phased out.
- CURRENT (now migrated to): `https://agents.lumalabs.ai/v1` — console `platform.lumalabs.ai`, per-project
  billing (`proj_…`), `luma-api-` keys, models `ray-3.2` (video) / `uni-1` (image). This is where the
  operator's $8 lives. Billing is per-platform — the old key's wallet ≠ the new $8.

**New-API schema (verified live, gen `fe0de54f…` → completed on the $8):** POST `/generations` requires
top-level **`type:"video"`** + `model:"ray-3.2"` + `keyframes.frame0.{type:image,url}` + resolution/
duration/aspect_ratio. Poll GET `/generations/{id}`; finished URL at **`output[].url`** (legacy was
`assets.video`). `extractLumaVideoUrl` now handles both. Base overridable `LUMA_API_BASE`, model `LUMA_VIDEO_MODEL`.

**Key write gotcha:** the .env key came in 53 chars ending `n` — a stray `\n` literalized into the value.
Real key 52 chars. Fixed in place (`${K%n}` + `tr -d "[:space:]"`); never re-typed the secret.

**Deploy:** pull + build (tsc clean) + `pm2 restart cto-aipa` → online (restart 14), boot log
`🎭 Atuona Creative AI started`. Director's Cut (Modify) still on legacy schema — skips gracefully,
open follow-up. Veo 3.1 needs GEMINI_API_KEY + billing; Runway keyed, needs Runway credits.

## June 13 2026 (cont.) — Director's Cut (Modify Video) working on new Luma API (`7a8531c`)

Migrated the fashion/editorial restyle pass to agents.lumalabs.ai/v1: POST `/generations` with
`model:"ray-3.2"` + `type:"video"` + `mode:"flex_1"` + `media:{url:<base video>}` (replaces legacy
`/generations/video/modify` + `generation_type:modify_video`, model ray-2). Verified live — a ray-3.2
modify completed in ~25s (faster than base generation, confirming the source video was actually used).
Poll uses the output[]-aware `extractLumaVideoUrl`. Deployed, cto-aipa online (restart 15), boot clean.
Full /visualize pipeline now end-to-end on the new platform: Flux image → ray-3.2 base video →
ray-3.2 Modify Director's Cut.

## June 14 2026 — Atuona engine expansion: Flux 2 Pro (image) + Kling (4th video engine), verified live

Surgical/additive (commits `8af553c` code, `a499200` polish; backup tag `atuona-pre-flux2-kling-20260613`):
- **Image: Flux 2 Pro** (`black-forest-labs/flux-2-pro`, env `FLUX2_MODEL`, empty=disable) is the new top
  tier; Flux 1.1 Ultra→Pro→Dev kept intact as fallback. Verified: `Trying Flux 2 Pro → Image generated
  with Flux 2 Pro` every run (no fallback).
- **Video: Kling** (4th selectable engine, `/visualize kling NNN`) via Replicate `kwaivgi/kling-v2.1-master`
  (env `KLING_REPLICATE_MODEL`, existing REPLICATE_API_TOKEN — no new key). Verified: `✅ Kling via
  Replicate succeeded` (~3 min/render). For stylized/arthouse motion. Falls back to Luma→Replicate→Runway.
- Existing Luma ray-3.2 / Runway / Veo 3.1 / Director's Cut all untouched.

**Full Atuona engine matrix now:** image = Flux 2 Pro (→1.1 fallback); video = Luma ray-3.2 · Runway
Gen-4.5 · Veo 3.1 (native audio) · Kling — all operator-selectable via `/visualize <provider> NNN` and /menu.
All three codebases (local / GitHub / Oracle) synced at `a499200`.

## June 15 2026 — Atuona FILM COMPILER (`/film build`) live + first film made

New isolated module `src/atuona-film-compiler.ts` (commits `8d549eb`, `42d94bd`). Turns Atuona's
per-poem shots into a finished film, all on Oracle via ffmpeg (ffmpeg 6.1.1 + ffprobe present):
- `persistShot()` saves each base cut to `data/atuona/films/shots/<pageId>.mp4` as generated (fixes
  CDN URL expiry); hooked into the 3 base-video success paths.
- `buildFilm()` = staged ffmpeg: normalize 720p + last-frame-hold → bake OpenAI-TTS poem voiceover per
  clip → hard-cut concat → ducked music bed → mp4. `/film build [pages]` command; delivers to Telegram
  (<49MB) or saves to server.
- Music: royalty-free library in `data/atuona/films/music/` (Suno gated on SUNO_API_KEY).
- **Hang fix:** first run froze on a no-timeout network call after shot 1 → `withTimeout` added
  (TTS 45s / GitHub 15s / ffmpeg 150s); a hung call now skips the shot, film always completes.
- **Recovery:** past shot URLs (Luma cdn-luma.com) often outlive their 1h signature — recovered 18/22
  prior shots by probing `atuona-state.json` (repo root) and curling live URLs into shots/.

**First film: `finding-paradise` — 97s, 5 shots, 12.8MB, full poem VO + melancholic ambient score.**
Backup tag `atuona-pre-filmcompiler-20260615`. Restore points clean; existing engines untouched.

---

## July 26–27 2026 — Inbound concierge: HubSpot web chat + Resend delivery truth (LIVE)

**What changed:** aideazz.xyz got a HubSpot chat bubble, and both inbound tracks (portfolio UTM
form + web chat) now end in the same place — a Telegram draft with a ✅ Send button, a Resend
send, a HubSpot **EMAIL activity**, and a delivery stamp. Files: `src/chat-concierge.ts` (new),
`src/resend-webhook.ts` (new), `src/concierge.ts`, `src/go-wa.ts`, `src/hubspot-client.ts`.

### The rule that governs BOTH tracks (learned the hard way)

> **Make's Lead Concierge trigger is HubSpot `Watch CRM Objects → Contacts CREATED`.**
> A first-time person is **created** → Make drafts. A person already in the CRM is only
> **updated** → **Make never fires**. Proven July 27: Malina Choke (`espaluztester@`) wrote on
> Jul 16 (new contact → draft sent) and again via chat (existing contact → silence).

Elena's four test inboxes hide this, because `isConciergeTestEmail()` force-recreates them
(delete + create) so Make fires every time: `adamvelena@`, `marinakulaginabowen@`,
`kiravelerevich@`, `espaluztester@` (added Jul 27). **All four are hers — never add a real
prospect, their history is destroyed on every touch.**

**Fix (`dc5465f`):** `chat-concierge` checks `findContactByEmail()` **before** pushing.
New contact or allowlisted tester → Make drafts, unchanged. Existing contact → cto-aipa drafts
and POSTs to its own `/concierge/draft` (Bearer `CONCIERGE_SECRET`, form-urlencoded,
`claude_output` in Fable's `SUBJECT:` / `DRAFT REPLY:` shape) → identical Telegram card with the
Send button. Never both.

### `src/chat-concierge.ts` — web chat watcher

Polls `conversations/v3/conversations/threads` every `CHAT_CONCIERGE_POLL_MS` (default 180s),
state in `data/chat-concierge-state.json` (gitignored). Per new INCOMING message: Telegram ping →
HubSpot lead (`[CLIENT-CTO-INQUIRY] {name} — outreach`, `aideazz_web_chat` source) → visitor
acknowledgment via `scheduleMarketingInquiryEmails` (the same pair the form sends: visitor
confirmation + `aipa@` copy that lands in Zoho).

Three traps found live, all fixed:
- **No email on the sender.** Chat messages carry `CHANNEL_SPECIFIC_OPAQUE_ID`; the identity is on
  the thread's `associatedContactId` → resolve the contact for email + name.
- **Email arrives AFTER the message.** Visitors type first, leave the email seconds later, so the
  poll that catches the message often sees an anonymous thread. `pendingIdentity` re-checks those
  threads every poll and pushes when the contact appears (gives up after `MAX_AGE_MS`, 24h).
  Without it the message is marked seen and the lead never reaches the CRM.
- **One deal per conversation.** The first run created three deals for one person's three lines;
  `pushedThreads` guards it (later messages still alert, no new deal).

HubSpot seeds every inbox with a sample thread (`emailmaria@hubspot.com`) — skipped by
`isHubSpotSample()`. `pollChatOnce({ dryRun: true })` prints what would be sent, writes nothing.

### `src/resend-webhook.ts` — acceptance is NOT delivery

Dental Connect's sends were **Suppressed** by Resend while HubSpot read ⏳ Sent + `📧 EMAILED`.
`POST /cto/resend/webhook` (Svix-signed, `RESEND_WEBHOOK_SECRET` in Oracle `.env`) stamps the
**outreach note** — at the TOP, under the FU buttons — with `✅ ENTREGADO` / `⛔ REBOTE` /
`🚫 QUEJA` / `👀 ABIERTO` / `🔗 CLIC`; bounce and complaint also raise a HIGH task and flip the
logged email SENT → BOUNCED. Signature verified manually (no svix dep): valid 200, forged 401,
unsigned 401, replayed 401.

**Suppressed sends emit NO webhook at all** → `scripts/resend-reconcile.cjs` (cron `17 * * * *`,
log `~/logs/resend-reconcile.log`) polls `GET /emails/{id}` for recent ledger entries and stamps
`⛔ SUPRIMIDO` + a task. Ledger: `data/resend-ledger.json` (resendId → dealId/engagementId).

### HubSpot EMAIL activities — the `hs_email_headers` gotcha

A note is not an email: agent-sent replies were invisible in the deal's **Emails** tab. Both
senders (`/go/outreach-email/:slug/send` and the concierge) now call `logEmailEngagement()`.
**From/to MUST go in `hs_email_headers` JSON** — the flat `hs_email_from_email` /
`hs_email_to_email` properties are rejected **400** ("derived from the hs_email_headers
property"). That 400 silently killed a 89-row backfill attempt; no backfill was performed
(deliberate — existing notes stay, only new sends get activities).

### Site-side gotchas (repo `aideazz`)

- **HubSpot loader is CDN-cached.** After publishing a chatflow, `js-na1.hs-scripts.com/51409153.js`
  kept serving a stale 1893-byte copy with **no** `conversations-embed` (`cf-cache-status: HIT`,
  `Age` climbing with the clock) — so the widget could not appear for **any** visitor, incognito
  included. Fix: version the URL — `…/51409153.js?v=20260726` is a different cache key and returns
  the current 2352-byte build. Bump the date if a future chatflow change is ever stuck.
- **Widget collisions.** HubSpot's launcher is hard-anchored bottom-right at z-index ~2.1e9.
  `WhatsAppFloat` moved to **bottom-left** (both `/portfolio` and, added Jul 27, the homepage —
  it had never been mounted on `Index.tsx`), and `ScrollProgress` moved `bottom-8` → `bottom-28`
  so the scroll-top button is not hidden behind the chat bubble (`Index.tsx` only, `/portfolio`
  untouched).
- **Collected Forms** ships with the tracking script and captures the portfolio inquiry form
  directly — turn it off (Settings → Tracking & Analytics → Tracking Code → Collected Forms) or it
  creates contacts in parallel with the cto-aipa → Fable pipeline.

### Markdown in drafts

Fable emits `**bold**`, which renders as literal asterisks in the prospect's email.
`stripMarkdownEmphasis()` in `parseClaudeOutput` removes `**`/`*`/`__` for **every** draft (Make's
and ours); `- bullets` and `5*3` are preserved.

**Restore points:** tags `pre-chat-concierge-20260727` (cto-aipa), `pre-hubspot-chat-20260726`
(aideazz); zips in `D:\aideazz\_backups\`.

---

# August 16–17 2026 — fleet-wide 5-provider LLM chains, Atlas, and the GEO/citation layer

Two days of work with one spine: **no single provider, plan, or API can take a product
down silently.** Recorded here because every failure in this stretch looked configured
and wasn't — the code named a provider, the env named a model, and nothing was actually
reachable. Read the lesson before the changelog.

## 🔑 The lesson, earned three times in two days

**An env var existing proves nothing. Probe the provider.**

| Product | It looked like | It actually was |
|---|---|---|
| EspaLuz Telegram | `GROQ_MODEL` set → Groq fallback ready | **no `GROQ_API_KEY` at all** — the rung returned `None` on every call for the life of the bot |
| whitespace/Atlas | `GROQ_MODEL` set by the Aug 16 sweep | the code reads **`WHITESPACE_GROQ_MODEL`** — the var that was set is ignored here, the dead `llama-3.3-70b` default stayed live and **404'd at tier 2 in production** |
| Atlas lead machine | `BRIGHTDATA_API_TOKEN` in `.env` | the module reads `process.env`, cron runs near-empty → `bdSerpSearch` returned `[]` with **no error**, which would have meant zero leads every Monday |

Verification order that actually works: check the **exact var name the code reads** →
check the **key** → **curl the model id**. Not one of these three was catchable by
reading config.

## Fleet chain status — all six products

Order is per USE CASE, never a fleet template. Each product has its own eval; re-run it
before changing any model id.

| Product | Chain | Eval | HEAD |
|---|---|---|---|
| cto-aipa | 3 profiles (quality / classify / bulk) in `llm-resilience.ts` | `npm run eval:llm` | `180aad8` |
| VJH | judge: openai→gemini→groq→grok→**claude last** | `pytest evals/test_provider_chain.py` | `9d46dcd` |
| EspaLuz_Influencer | BULK gemini→groq→openai→grok→claude | `python3 eval_llm_chain.py` | `61340e8` |
| dragontrade | BULK (`llm-chain.mjs`) + Telegram alerting | `node eval-llm-chain.mjs` | `17558e2` |
| EspaLuz WhatsApp | **QUALITY** claude→openai→gemini→grok→groq | `venv/bin/python3 eval_llm_chain.py` | `24e5c15` |
| **EspaLuz Telegram** | **QUALITY** claude→openai→gemini→grok→groq · **no markdown strip** (bot strips at send) | `venv/bin/python eval_llm_chain.py` | `58cdb4b` |
| **whitespace / Atlas Shifted** | **QUALITY** claude→openai→gemini→grok→groq · circuit breaker preserved | `node eval-llm-chain.mjs` | `2986c28` |

**EspaLuz Telegram (`d8e608f`, `58cdb4b`)** — 3 call sites converted, one more than the
WhatsApp twin: the tutor fallback, `_convo_translate`, and `quick_translate_for_convo`
(the bot's **last single-provider LLM call** — Claude only, no fallback, hard-coded id).
Verified by killing providers cumulatively: with **4 of 5 dark, groq still returned
2,967 chars**. `_telegram_groq_chat` / `_telegram_openai_chat` are now callerless and
marked `DEAD CODE` rather than deleted — removing code is Elena's call.

**whitespace / Atlas (`fc0313b`, `3de5edb`, `2986c28`)** — Groq moved from tier 2 to
**last** (post-deprecation its free tier has no plain model; the weakest link does not
belong second). Gemini added. **Three status strings had drifted from the chain** and
all now derive from `PROFILE_QUALITY`: `activeLlmLabel()`, the startup banner
(`Claude+Groq+OpenAI` — three providers, one dead, while five were configured), and the
brief's shrug footer (`4-tier … Claude → Groq → OpenAI → Grok`). A Groq 404 now logs
`model NOT FOUND — retired?` by name.

## Atlas Shifted — lanes, leads, and the recovered films

**Lanes now = Elena's portfolio (11 tracked).** Added `ai_video_generation` and
`ai_reliability_and_rescue` via `/api/atlas/track`, so every portfolio service has a
radar. Monday chain verified firing on schedule: **14:00** capture→classify→brief→concept
· **15:15** campaign alert · **15:30** outcomes feedback · **16:00** lead machine.

**⚠️ SerpAPI is CANCELLED (2026-08-11), 0/1000, and is not coming back.** It took two
things down: the Atlas lead machine (its *entire* supply was `google_maps`) and the AI
citation probe. Both now run on Bright Data — see `reference_serpapi_vs_brightdata`.

**Lead machine → Bright Data (`2ca559d`).** SerpAPI first only while it has quota (probed
once per run via the *free* account endpoint), else Bright Data. Four non-obvious fixes
were required: `process.env` population (above), `tbs:''` (the shared `bdSerpSearch`
defaults to `qdr:w` — past-week — which is right for buying signals and returns **0** for
"find me restaurants"), `gl:'pa'` (without it the proxy exited in **South Africa**), and
an institutional filter (organic returns government pages maps never did — the first dry
run staged **Panama's Ministry of Commerce**). The Aug 4 crawler-blocked rescue keyed on
Google reviews/stars, which organic lacks, so page-one placement now stands in — without
that it would have silently stopped saving exactly the prospects it exists for.

**Atlas videos were never lost.** All 7 mp4s were on disk and publicly served; what
vanished was the `concepts.json` entry when a vertical left the tracked list. Restored 4
orphans incl. the EspaLuz WhatsApp-tutor promo — **no re-render, no spend**. Full recipe
and the unguarded `c.move` crash it exposed: `reference_atlas_orphaned_videos`.
Irreplaceable-asset backup: `backups/atlas-assets-IRREPLACEABLE-20260817-1144.tgz`.

## GEO / citations

**The citation probe was failing every Monday** — by design ("a tracker that quietly
measures nothing is worse than no tracker"), because its only Google engine was SerpAPI.
Fixed (`875614d`, `180aad8`):

- `probeGoogleAiOverviewBD` reads AI Overviews through Bright Data (`brd_json=1`; body in
  `texts[].snippet`, sources in `references[].href`, no page_token hop). The engine now
  activates on **either** supply via `altKeyEnv` — a lapsed subscription had removed
  Google from the picture entirely.
- **Moved off GitHub Actions to Oracle cron** (`/home/ubuntu/run-citation-probe.sh`,
  Mondays 13:00 UTC). GitHub reads repo *secrets*, a different store from Oracle's `.env`;
  Oracle already has every key, so nothing is copied anywhere.
- `/portfolio` and `/api` are tracked **in parallel** (`CITATION_PRIMARY_PATH`), because
  they run different races: `/portfolio` is the entity page, `/api` is a tool page and
  tool queries are won by tool domains. Measuring only `/portfolio` scored `/api`'s wins
  as losses.

**Live diagnosis (18/18 probes measured, 3 engines):** aideazz.xyz cited 0×, **named
without a link in 11%**. `/portfolio` IS indexed and ranks #5 for "Elena Revicheva AI
portfolio" — the four above it are LinkedIn, Instagram, Dev.to and a LinkedIn post, and
OpenAI cited **twine.net/user1631810 thirteen times** for her own name. The gap is
authority, not markup. Fix shipped in `aideazz` `520ce00`: `sameAs` now declares
Instagram, Twine and beBee. **The reciprocal half — those profiles linking back to
/portfolio — is Elena's and is the highest-leverage remaining move.**

## ⚠️ Oracle-only code with NO git backup

`EspaLuzFamilybot/aideazz_service_payments.py` (4,065 b, Jul 4) is **untracked and live** —
`paypal_webhook_server.py` wires it via an `AIDEAZZ_SVC_HOOK_START/END` block that is
also not in git, and `espaluz-payments-webhook` is active. This is **money code with no
version control**. Backed up 2026-08-17 to
`backups/oracle-only-code/aideazz_service_payments.py.20260817-1507`; contains no
hardcoded secrets, so it is safe to commit whenever Elena decides.
`EspaLuzWhatsApp/scripts/backfill_espaluz_hubspot.py` also differs on Oracle (one-off
script, low risk).

## Sync audit — 2026-08-17

All 8 repos **local == origin/main**. Oracle git HEADs for cto-aipa, EspaLuzFamilybot and
whitespace had drifted behind while their *files* were current (deployed by scp/checkout
without moving the pointer) — realigned with **`git reset --mixed origin/main`**, which
moves HEAD and index and never touches working files. Verify with
`git diff --ignore-cr-at-eol --ignore-all-space origin/main`, **not md5**: scp preserves
Windows CRLF while `git checkout` writes LF, so hashes differ on identical content.
All services active; `cto-aipa` restarted so `visibility-api.ts`'s dynamic import of the
tracker could not serve a cached pre-Bright-Data copy.
