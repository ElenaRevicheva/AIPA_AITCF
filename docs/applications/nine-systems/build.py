"""
Nine Systems — employer edition. One source, one PDF per employer.

    python docs/applications/nine-systems/build.py            -> general + ripio PDFs

WHY ONE SOURCE: the 24 Aug dossier was written for a BUYER and got reused for hiring, which is
how a family story and "what would actually help: an introduction" ended up in front of
screeners. Here the body is shared and only the employer block changes, so a fix to a fact is
made once and every edition gets it.

FIGURES: every number below was re-read on BUILT (see FACTS). Change a number only after
re-reading it from production or the repo — never from an older document.
"""
import pathlib, subprocess, html

HERE = pathlib.Path(__file__).parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BUILT = "23 September 2026"

FACTS = dict(
    commits_ops=1640, commits_vjh=578, commits_web=3513, commits_espaluz=214 + 399, commits_dragon=176,
    evals=534, commands="110+", audits="500", audit_urls="248", checks=34,
    films=8, incidents=22, failure_modes=19, deploy_services=12,
)

EDITIONS = {
    "general": dict(
        role="AI Automation Engineer · AI Solutions Architect",
        fit="",
    ),
    "ripio": dict(
        role="AI Automation Engineer · prepared for Ripio",
        fit="""
<h2>Ripio's requirements → where I have done it</h2>
<table class="map">
<tr><th>The posting asks for</th><th>Evidence</th></tr>
<tr><td>Automate manual processes of a staff area</td><td>Job search, CRM hygiene, lead response, daily publishing and a morning briefing were all done by hand; now they run unattended (systems 1, 2, 4).</td></tr>
<tr><td>Agents, bots and LLM tools integrated with chat, internal APIs and third parties</td><td>Telegram control plane with {commands} commands, plus HubSpot, Resend, GitHub (it opens real pull requests), Perplexity and Bright Data. My chat surface is Telegram and WhatsApp; the pattern is the same one Slack uses.</td></tr>
<tr><td>Business problem before the technical solution</td><td>Each system below opens with the problem it replaced. The Atlas rule "detect, not predict" exists because a forecast cannot be checked.</td></tr>
<tr><td>End to end, CI/CD, production monitoring</td><td>A GitHub Actions deploy workflow covers {deploy_services} services plus fleet verification. PM2. Read-back audits that alert on Telegram. A synthetic lead runs through the real pipeline every morning.</td></tr>
<tr><td>AI-native development: context, harness, agent self-correction</td><td>A {evals}-test eval suite. A shared-memory protocol for two coding agents. Generation gates that retry and salvage instead of guessing (Part 3).</td></tr>
<tr><td>Work with Infrastructure and Security</td><td>An attachment gate (traversal, magic bytes, type spoofing), private file storage, a leak scan before publishing, and credentials kept out of agents. Crypto-relevant: an agent that may never take an irreversible financial action on its own (system 9).</td></tr>
<tr><td>Backend languages</td><td>Python and TypeScript in production. Go and Java: not yet.</td></tr>
</table>
""",
    ),
}

BODY = """
<header>
  <div class="kicker">AIDEAZZ AI LAB · PANAMA CITY (UTC−5) · ENGINEERING PORTFOLIO · {built}</div>
  <h1>Nine systems, and the decisions behind them</h1>
  <div class="who"><strong>Elena Revicheva</strong> · {role}</div>
  <div class="links"><a href="https://aideazz.xyz/portfolio">aideazz.xyz/portfolio</a> · <a href="https://aideazz.xyz/api">aideazz.xyz/api</a> · <a href="https://aideazz.xyz/ai-ops-wiki.html">aideazz.xyz/ai-ops-wiki.html</a> · <a href="https://atuona.xyz">atuona.xyz</a></div>
</header>

<p class="lede">I design, build and operate production AI automation alone: a fleet of LLM agents on one Oracle Cloud server,
controlled from Telegram, with HubSpot as the system of record. Each system replaced work I was doing by hand. This
document explains why each one exists, the design decisions that mattered, and what is running today. It is written
for an engineering team deciding whether that judgement belongs on their roadmap.</p>

<div class="stats">
  <div><b>{commits_ops:,}</b><span>commits · ops agent</span></div>
  <div><b>{evals}</b><span>eval tests · job engine</span></div>
  <div><b>{audits}</b><span>API audits served</span></div>
  <div><b>{films}</b><span>AI films, auto-edited</span></div>
  <div><b>{incidents}</b><span>public incident write-ups</span></div>
</div>

<div class="method">
<h3>How I build: AI-native, and that is the point</h3>
<p>I frame the problem, design how the pieces fit, and delegate the implementation to coding agents (Claude Code and
Cursor). Then I prove that what came back is true. On several repos most commits carry the agent's authorship, and I say
so because anyone can see it in a <code>git log</code>. The scarce skill has moved from typing the code to <strong>knowing which
output to distrust and proving the difference</strong>. Every discipline in Part 3 exists because generated code is
confidently wrong in specific, repeatable ways: it reports success it did not achieve, it writes a second implementation
instead of finding the first, and it produces plausible numbers.</p>
<p>Before AI I spent seven years as Deputy CEO and Chief Legal Officer of a national e-government operator. So I start
from the business process and the compliance risk, not from the tool.</p>
</div>

{fit}

<h2>Part 1 · The shared spine</h2>
<table class="spine">
<tr><th>Layer</th><th>Choice</th><th>Why this, and not the obvious alternative</th></tr>
<tr><td>Compute</td><td>One Oracle Cloud server, PM2</td><td>Failures are observable in one place. GitHub Actions deploys named files to {deploy_services} services and verifies the fleet afterwards.</td></tr>
<tr><td>Control</td><td>Telegram, not a web dashboard</td><td>Approvals happen with one tap, wherever I am. {commands} commands, including a coding assistant that opens real pull requests.</td></tr>
<tr><td>Ledger</td><td>HubSpot CRM</td><td>Every agent writes with a prefix that names its author, so provenance is a filter rather than an investigation.</td></tr>
<tr><td>Models</td><td>Five providers, three ranked chains</td><td>One API key is a single point of failure for the whole operation. The chains are ordered by use case: quality, classification, bulk.</td></tr>
<tr><td>Language</td><td>TypeScript and Python</td><td>TypeScript wherever money or CRM state is touched, so the type checker catches a class of mistake before deploy. Python where the ML ecosystem lives.</td></tr>
</table>
<p class="callout"><strong>The decision I would defend hardest: the five-provider chain.</strong> On 19 Aug 2026 the primary provider's
balance hit zero, and the chain fell through in 2.4 seconds with no lost request. The lesson that took longer: the order
must differ by use case. Reasoning models return empty strings under low token budgets, so a classification chain led by one
<em>fails silently</em>, which is worse than an error.</p>

<h2>Part 2 · The nine systems</h2>

<div class="sys"><h3>1 · CTO AIPA: operations brain and inbound lead concierge</h3>
<div class="meta">TypeScript · HubSpot API · Telegram · Resend · GitHub API · {commits_ops:,} commits</div>
<p><b>Problem.</b> Inbound needed a fast, correct reply with a human approving it, and overnight failures across the fleet were invisible until morning.</p>
<p><b>Design.</b> A form submission becomes a CRM record and a drafted reply, which arrives as a one-tap approval card. Delivery and open events are written back to the deal. Two systems can write the reply, and redundancy alone means the faster one always wins, so a <b>cached health verdict decides precedence</b> (5-minute grace period, 20-minute safety net). The same bot is a coding co-pilot: <code>/code</code> and <code>/fix</code> open real PRs, <code>/approve</code> keeps a human on the last click, and <code>/decision</code> and <code>/debt</code> record architecture choices.</p>
<p><b>Running.</b> An 08:00 briefing every day. A synthetic lead goes through the real pipeline every morning, silent on pass and alerting on failure.</p></div>

<div class="sys"><h3>2 · VibeJobHunter: job discovery with a human on the last click</h3>
<div class="meta">Python · LangGraph · SQLite checkpointing · pytest · Perplexity API · {commits_vjh} commits</div>
<p><b>Design.</b> A LangGraph state machine: gate → score → route → notify. It is checkpointed, so a crash resumes instead of restarting, and there is a deliberate human-approval interrupt. An LLM judge scores fit, and a <b>trust clamp</b> limits how far keyword rules can overrule it (this fixed an incident where keyword bonuses silently outvoted a correct "no"). A feedback loop writes my real CRM decisions, and my typed reasons, back into the judge. It <b>fails closed</b> on an LLM outage. I removed auto-apply after measuring <b>volume and zero outcomes</b>.</p>
<p><b>New in September.</b> The Perplexity API researches every queued job, with sources cited and results cached. A tailored cover letter and a lane-matched CV go onto every deal. This week a <b>read-back audit</b> showed only 11 of 23 deals really complete: a refused API call was being logged as "no data". I fixed it with retry-on-429 and failed lookups that raise, then added a self-healing job every 2 hours and a daily audit with alerts. Result: 19 of 23, and the other 4 proven to be closed postings.</p>
<p><b>Harness.</b> {evals} tests. The offline layers run with the AI disabled and no network, so they are cheap enough to run before every scoring-rule change. One test class covers bias compensation.</p></div>

<div class="sys"><h3>3 · AI Visibility Audit API: a public product</h3>
<div class="meta">TypeScript · REST · Oracle Cloud · <a href="https://aideazz.xyz/api">aideazz.xyz/api</a></div>
<p><b>Problem.</b> Buyers and recruiters now ask an AI assistant before a search engine, and nobody could tell a business whether ChatGPT, Perplexity or Claude can read its site.</p>
<p><b>Design.</b> {checks} checks per URL (answer-engine readiness, structured data, crawlability, technical SEO). Each one returns the fix and why it matters, not only a score. The public page states production figures as <b>floors that only go stale in the safe direction</b>: a running total printed exactly is wrong by tomorrow.</p>
<p><b>Running.</b> {audits} audits served across {audit_urls} URLs, counted today from the log line the API writes for each audit. My own hub scores 100/100. The API also has a promo film cut by the same automated edit pipeline as system 6.</p></div>

<div class="sys"><h3>4 · Publishing engine: blog, podcast, social</h3>
<div class="meta">TypeScript · Dev.to canonical · Buffer · daily at 14:30 Panama</div>
<p><b>Design.</b> <b>Grounded generation.</b> Before writing, the generator collects production evidence: uptimes, real commit messages, CRM counts. A gate rejects any figure it cannot trace, then retries up to 4 times with a different angle each time and salvages the sourced paragraphs. If the model still decorates the facts, a measured-notes article is assembled deterministically. Detection is token-overlap against everything already published, which caught near-duplicates that exact-slug matching missed.</p></div>

<div class="sys"><h3>5 · AI Ops Wiki: the public incident record</h3>
<div class="meta">generated from structured entries, never hand-edited · <a href="https://aideazz.xyz/ai-ops-wiki.html">ai-ops-wiki</a></div>
<p>{incidents} incidents and {failure_modes} named failure modes, each with the verified number that proves it. Examples: <i>redundancy is not precedence</i>, <i>acknowledgement is not completion</i>, <i>the prompt is a source</i>, <i>vacuous guard</i>. This is the fastest way for a stranger to judge how I think, including the times a system fooled me.</p></div>

<div class="sys"><h3>6 · Atuona: an automated AI film studio</h3>
<div class="meta">TypeScript · ffmpeg · multi-provider video and image APIs · <a href="https://atuona.xyz">atuona.xyz</a></div>
<p><b>Problem.</b> Most AI video tools stop at generating a clip. Pacing, voice timing, transitions, text and the mix are still done by hand. I automated that second half.</p>
<p><b>This week.</b> Films #7 and #8 were published on 22 Sep, so the gallery now holds <b>{films}</b>. Film #8 is 3:36 long and cut from 16 shots, all newly generated. The engines were chosen per shot type through a <b>bake-off</b> (one for close-ups, another for wides) behind a generation tool with a <b>hard budget guard</b>. Film #7 turned still images into moving shots with a <b>depth-based 2.5D camera</b>. The bot now drives a dozen video and image engines from one command, with an LLM acting as director.</p>
<p><b>Design that transfers.</b> Voiceover is locked to its clip by a duration formula. Short clips get slow motion, never a held frame. Crossfades run on a running-offset accumulator. Music ducks under the voice with sidechain compression, and the mix is normalised to broadcast loudness (−16 LUFS; film #8 measured −15.7). Every render is verified frame by frame before publishing.</p>
<p><b>Two incidents from the same day.</b> (1) New engine lines pushed a menu past the chat platform's 4,096-character limit, so the bot silently answered nothing. The fix was chunked replies and a rule to re-measure on every new menu line. (2) A pre-render <b>spending cap could never fire</b>: it read price fields the vendor never sends, so every price passed as <code>NaN</code>. I fixed it and published it as the <i>vacuous guard</i> concept. The rule: print the vendor's raw response once before trusting any guard built on its shape.</p></div>

<div class="sys"><h3>7 · EspaLuz: bilingual expat advisor on WhatsApp and Telegram</h3>
<div class="meta">Python · LangChain · pgvector RAG on Oracle Autonomous DB · voice and image in · {commits_espaluz} commits</div>
<p>Born from my own family's relocation to Panama. Two layers of memory: short-term conversation context, plus a <b>per-family vector store retrieved by relevance rather than recency</b>. The answer in November depends on the form a family filled in in June. Voice in and out, image understanding for forms, and payments wired for trials. Design constraint: emotional intelligence before grammar correction.</p></div>

<div class="sys"><h3>8 · Atlas: radar for advertising angles</h3>
<div class="meta">inside the ops agent · 7 verticals · weekly</div>
<p>Reads public ad libraries and reports which creative angle is running in a market, and for how long. The rule is <b>detect, not predict</b>: "this is live and three weeks old" can be checked, while "this will work" cannot. Outcomes are written back to the CRM and scored.</p></div>

<div class="sys"><h3>9 · DragonTrade and Algom</h3>
<div class="meta">JavaScript · {commits_dragon} commits · paper trading only</div>
<p><b>DragonTrade</b> is a trading-education agent that runs on paper trading only. I built it to learn how to operate an agent that must <b>never take an irreversible financial action without a human</b>. <b>Algom</b> listens to a public post stream for buying intent and files leads under its own CRM prefix, so its yield can be measured against every other source.</p></div>

<h2>Part 3 · The decisions that repeat</h2>
<table class="principles">
<tr><td>Measure at the edge, not the source</td><td>A commit is not a deploy, and an accepted email is not a delivered one. Verify where the request actually lands.</td></tr>
<tr><td>Reconcile: read the end state back</td><td>A job's own log is not proof. Audits read the CRM back and alert on any gap.</td></tr>
<tr><td>Unmeasured is not zero</td><td>A tracker exits non-zero when it cannot measure. A refused call is a failure, never "no data".</td></tr>
<tr><td>A guard must be able to fire</td><td>Test every cap and filter against the vendor's real response shape (the vacuous guard).</td></tr>
<tr><td>Fail open or closed, per system</td><td>Alerting fails open: a duplicate beats silence. Publishing and money fail closed.</td></tr>
<tr><td>A human on the last click</td><td>Anything that reaches another person, or moves money, waits for one tap.</td></tr>
<tr><td>Every record names its author</td><td>Many agents write to one CRM, and a source prefix makes provenance a filter.</td></tr>
<tr><td>Context is an artefact</td><td>Two coding agents share one repo through a claim board and handoff blocks, not through memory.</td></tr>
</table>

<h2>Part 4 · What I would bring</h2>
<p>An engineer who turns a staff team's manual work into agents and automations, takes them to production with CI/CD and
monitoring, and treats the correctness of AI output as the main engineering problem rather than an afterthought. I have
done all of it alone, without an on-call rota, which forces different decisions from the ones a team makes. I would like to
make them inside a team that already has users.</p>

<p class="foot">Figures re-read from the running systems and repositories on {built}; audit counts come from the production log.
Code on GitHub. I am happy to walk through any of it live, including the parts that broke. · Elena Revicheva ·
<a href="https://aideazz.xyz/portfolio">aideazz.xyz/portfolio</a></p>
"""

CSS = """
@page { size: A4; margin: 13mm 14mm 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #1c2230; font-size: 9.05pt; line-height: 1.34; margin: 0; }
a { color: #1d4ed8; text-decoration: none; }
code { font-family: Consolas, monospace; font-size: 8.4pt; background: #f1f3f7; padding: 0 2px; }
header { border-bottom: 2px solid #1c2230; padding-bottom: 6px; margin-bottom: 8px; }
.kicker { font-size: 7.6pt; letter-spacing: 1px; color: #5a6376; font-weight: 600; }
h1 { font-size: 18pt; margin: 2px 0 2px; letter-spacing: -0.3px; }
.who { font-size: 10.2pt; } .links { font-size: 8.5pt; margin-top: 2px; }
.lede { font-size: 9.6pt; margin: 6px 0 8px; }
.stats { display: flex; gap: 6px; margin: 6px 0 8px; }
.stats div { flex: 1; border: 1px solid #d5d9e2; border-radius: 4px; padding: 5px 6px; text-align: center; }
.stats b { display: block; font-size: 14pt; } .stats span { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .4px; color: #5a6376; }
.method { background: #f5f7fa; border-left: 3px solid #1c2230; padding: 6px 10px; margin: 6px 0; }
.method h3 { margin: 0 0 3px; font-size: 10pt; } .method p { margin: 3px 0; }
h2 { font-size: 10.6pt; text-transform: uppercase; letter-spacing: .6px; margin: 11px 0 5px; border-bottom: 1px solid #c9ced8; padding-bottom: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin-bottom: 4px; }
th { text-align: left; background: #eef1f6; padding: 4px 6px; font-size: 8.2pt; text-transform: uppercase; letter-spacing: .4px; }
td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #e3e6ec; }
td:first-child { font-weight: 600; color: #2a3346; width: 28%; }
.spine td:nth-child(2) { width: 24%; } .spine td:first-child { width: 12%; }
.callout { background: #fff8e6; border-left: 3px solid #d59b00; padding: 5px 9px; margin: 6px 0; }
.sys { margin: 0 0 6px; page-break-inside: avoid; }
.sys h3 { font-size: 10pt; margin: 0 0 1px; }
.meta { font-size: 8.1pt; color: #5a6376; margin-bottom: 2px; }
.sys p { margin: 2px 0; }
.foot { margin-top: 8px; font-size: 8.2pt; color: #5a6376; border-top: 1px solid #c9ced8; padding-top: 4px; }
"""

for name, ed in EDITIONS.items():
    vals = dict(FACTS, built=BUILT, role=ed["role"])
    vals["fit"] = ed["fit"].format(**vals)
    page = f"<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Elena Revicheva — Nine Systems</title><style>{CSS}</style></head><body>{BODY.format(**vals)}</body></html>"
    src = HERE / f"nine_systems_{name}.html"
    src.write_text(page, encoding="utf-8")
    out = HERE / f"Elena_Revicheva_Nine_Systems_{'Ripio' if name == 'ripio' else 'Employer'}.pdf"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / '.chrome'}", f"--print-to-pdf={out}", src.resolve().as_uri()], check=True)
    print("built", out.name)
