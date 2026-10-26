# InfoQ — what we learned on 26 Oct 2026, and a draft proposal

## Facts from InfoQ's own pages (read live in Elena's Chrome, 26 Oct 2026)
- Two roles. **Editor**: weekly news, paid (quarterly revenue share, QCon pass), 30-min fit call. **Author**: long-form
  articles, unpaid, full copyright kept, InfoQ holds distribution rights. "Can I do both? Yes."
- Author article = **1,500–4,000 words** (average 2,000–3,000), technical, marketing-free, **five key takeaways** as full
  sentences at the top, one-paragraph bio with a LinkedIn (or other professional) link, images with cited rights.
- **Original only**: "We only publish original content not published elsewhere by the author online or in print, fully
  or partially." → a wiki incident already on aideazz.xyz cannot be pasted; a NEW article from the same experience can.
- **Exclusivity 4 weeks** after publication; then republish anywhere with "This article was originally published on
  InfoQ on <date>" and a link back.
- **Generative AI**: research, grammar, brainstorming, reviewer persona, titles — yes. Writing the content or core
  technical explanations — no. The form requires a checkbox confirming the policy; AI tools used must be disclosed, and
  InfoQ may add a standard disclosure notice to the article.
- **Process**: Google Form proposal (13 questions) → review in 5–7 working days → editors ask for a draft or decline →
  draft → technical review by an engineer-editor → publication, translation into 5 languages.
- **Queues**: Cloud · Java · Mobile · .NET · WebDev · **AI, ML & Data Engineering** · Architecture & Design · DevOps.
  "We are not re-routing articles internally across topics."
- **Profile page** (`infoq.com/profile/<First-Last>/`): created when an account is registered ("Profile page created
  <date>"); shows name, title line, Summary bio, followers, and every article/talk/podcast authored. **No external links**
  (checked on a Distinguished Engineer's profile): no LinkedIn, site or GitHub link. The followed link to aideazz.xyz
  must come from the article body/bio, within "marketing-free" style.
- **Account sign-up** (`infoq.com/reginit.action`): first/last name, email, password, country (Panama is listed), optional
  company/role/industry, newsletter opt-ins. Free. Email validation.

## Is a profile worth creating? Yes, but it is the small half.
- Cost: 3 minutes, free. It creates the public Person page the article schema will point to, and the Summary field is
  crawlable by every AI answer engine (InfoQ's robots.txt allows them all).
- Value without an article: near zero for GEO. The entity signal only compounds when a NewsArticle on infoq.com names
  her as `author` with that profile URL. **The article is the asset; the profile is its address.**
- Elena creates the account herself (name, email, password). After that, the Summary bio text below can be pasted.

### Profile Summary (paste after registering; ≤ 600 characters, no marketing)
AI-automation solutions architect. I run a fleet of production AI agents (WhatsApp, Telegram, web) solo for a bilingual
Spanish/English business in Panama: lead triage, outreach, a daily-publishing pipeline and an AI-visibility (GEO/AEO)
audit engine. Former Deputy CEO. I write about the failure modes that only show up in production — silent failures,
acknowledgement-is-not-completion, prompts as data sources — with the logs that prove them.

## Draft proposal — the 13 form answers (queue: AI, ML & Data Engineering)
Status: DRAFT for Elena's review. Nothing submitted. Every number below is from production and already verified in
CLAUDE.md / the AI Ops Wiki; the article itself must be newly written (not the wiki text).

1. **Title:** The Prompt Is a Data Source: How an Unverified Number in a Brief Silenced a Grounded LLM Publisher
2. **Abstract:** A daily LLM content pipeline had a grounding gate that refused to publish any number not traceable to
   collected evidence. It worked exactly as designed and still produced a silent day: a legacy brief fed to the model
   contained figures nobody had verified, the model copied one, four retries copied it again, and the gate failed
   closed. This article walks through the incident, the earlier near-duplicate failure the gate was built after (56 of
   121 published pages were near-copies, invisible to an exact-slug check), and the redesign: treating every input to
   the model, including its own instructions, as a source to be verified; retryable versus terminal gates; a
   deterministic fallback that assembles an article from measured facts when the model cannot stay inside the
   evidence; and the alerting that made silence visible.
3. **Outline:** (1) The system: a grounded daily publisher with evidence collection, generation, verification gates,
   publish, alert. (2) Failure one, near-duplicates: exact slug equality vs token overlap; a dedup cache that saw only
   half of what was live (64 → 123 entries). (3) Failure two, the poisoned gate: the brief as an unverified source;
   retries that cannot succeed. (4) Design: inputs are sources; strip unsourced figures before the model sees them;
   retryable gates with a changed angle; salvage a paragraph instead of discarding a draft; deterministic fallback;
   silence only when there is nothing to measure. (5) Verification: log lines, before/after counts, what "green log" hid.
   (6) Takeaways and a checklist.
4. **Topic focus:** reliability engineering for LLM content pipelines; verification gates and fail-closed design.
5. **Target reader:** engineers and tech leads running LLM generation in production with quality gates; anyone who has
   seen a green log and no output.
6. **Different and unique:** most writing on hallucination control covers RAG and judges. This is a production case where
   the guard was correct and the cadence still broke, because the prompt itself carried unverified facts. It gives the
   real counts (121 pages, 56 near-duplicates in 19 clusters; cache 64 → 123; 4 retries; the exact unsourced value),
   the log lines, and the fix as code-level decisions, from a single-operator fleet rather than a platform team.
7. **Real-world basis:** my own production system (Node/TypeScript on a VPS under PM2, Claude API, cron, Telegram
   alerts), incidents dated 25–26 Aug 2026, with the fixes still running today.
8. **Technologies:** Node.js/TypeScript, Anthropic Claude API, PM2, cron, token-overlap similarity for dedup, Telegram
   bot alerts, static-site publishing, a small evidence collector (git log, ops queue, incident files).
9. **Case studies:** the near-duplicate incident; the grounding-gate incident; the deterministic "measured notes"
   fallback; the duplicate-cache backfill.
10. **Code examples:** the overlap check that replaced slug equality; the gate's retry loop with a changed angle; the
    digit-stripping of briefs; the fallback assembler's input contract. Short, TypeScript, sanitised.
11. **Five takeaways:** (a) Every input to a model is a data source, including the brief and the system prompt; verify
    them like any other. (b) A verification gate must distinguish retryable from terminal failures, and a retry must change
    something or it is a loop. (c) Fail-closed is correct only when silence is observable; add the alert before the gate.
    (d) A dedup guard is only as good as the index it checks against; measure index coverage, not guard logic. (e) Keep a
    deterministic fallback that needs no model, so cadence survives the model's bad day.
12. **Timeframe:** completed draft within 3 weeks of acceptance.
13. **Bio:** Elena Revicheva is an AI-automation solutions architect who runs a fleet of production AI agents solo for a
    bilingual business in Panama, covering lead triage, outreach, daily publishing and an AI-visibility audit engine.
    Former Deputy CEO. LinkedIn: linkedin.com/in/elenarevicheva · GitHub: github.com/ElenaRevicheva
- **Socials field:** LinkedIn linkedin.com/in/elenarevicheva · GitHub ElenaRevicheva · (X handle if she has one)
- **Current employer:** her call (self-employed / AIdeazz).
- **AI disclosure (for the draft stage):** AI tools used for research, outline review and grammar; the text written by
  the author; all figures from production logs.
