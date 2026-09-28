# Niuro — technical-defense sheet (AI Operations & Growth Lead) · 28 Sep 2026

**How to use it:** for each question, say the 30-second answer first. Give the 90-second answer only if they lean in. The
follow-up is what a sharp interviewer asks next. Every number below was checked in production this week; if you forget a
number, describe the method instead, never guess.

**Your one-line frame (say it early):** *"I operate an AI-native development environment where specialized agents handle much
of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and
production decisions."*

---

## 1. "Walk me through an AI system you built end to end."

**30 s:** My job-search agent. It finds jobs, filters them, drafts the letter and puts the ones worth my time into my CRM. I
decide on each one, and it learns from my decisions every hour.

**90 s:** It runs as a LangGraph pipeline: find → filter → score → an LLM judge → my CRM. The filters are plain code: location,
pay, "no AI allowed" bans. The judge is a model that decides whether the role fits my lanes. Every decision I make in HubSpot
goes into a permanent ledger (554 decisions so far), and every hour those decisions become rules and lessons the judge reads.
I own it end to end: I decide what it should do, I review what the agents build, and I watch the production logs.

**Follow-up — "What would you change next?"** More good jobs coming in. The judge is only as good as what reaches it. One
search source mostly returns noise, so supply is the bottleneck now, not the judge.

## 2. "How does your evaluation harness work?"

**30 s:** Two layers. Automated tests check every rule on every change. An offline replay then re-runs the judge on my real past
decisions, with the job posting each decision was made on, before a judge change ships.

**90 s:** Layer one is a test suite: hundreds of tests (it has grown past 600) that run in about a minute. They check things
like "a job that bans AI in its hiring test is rejected" and "a spoken correction edits the card instead of creating a new
one". Layer two is the
replay. Each decision is stored with its posting. When I change the judge, I replay my past decisions and see whether it agrees
with me more or less often. If it gets worse, the change does not ship.

**Follow-up — "Your CV says 130 tests."** That was the count when I wrote that line. The suite keeps growing, because every bug
I fix gets a test that would have caught it.

## 3. "Why did the RAG upgrade make the judge worse?"

**30 s:** Because my old decisions were inconsistent. I applied to some jobs and rejected almost identical ones. Showing the
judge the most similar past jobs therefore pulled it both ways, and it did worse than simply showing my most recent decisions.

**90 s:** RAG means *retrieval-augmented generation*: before the model decides, you fetch the most relevant past examples and
show them. I embedded 109 decided postings and, for each new job, retrieved the six most similar. On the same evaluation set,
it approved fewer of the jobs I actually applied to than the simple "recent examples" version did. One reason: rejected
neighbours carried my written reason, applied ones carried none, so the evidence leaned toward "reject". I kept it switched
off, with the memory still building, and will re-test it once I have cleaner decisions.

**Follow-up — "So was RAG a waste?"** No. The memory is built and costs almost nothing to keep. The test told me *when* it will
help: once the labels are consistent. That is the value of measuring before shipping.

## 4. "How do you separate deterministic rules from model judgment?"

**30 s:** Anything that is a hard fact stated in the posting goes in code: a country list, "U.S. only", a pay figure, "no AI
tools". Judgment calls, such as "is this really my kind of role", go to the model.

**90 s:** Models are good at judgment and bad at being reliably exact. So hard constraints are code, and the code wins. I also
found the model sometimes gives the right verdict with the wrong reason, for example rejecting a job as "pay too low" when no pay
was stated. So any rule that corrects the model checks the **posting's facts**, never the model's stated reason. Example: my code
overrules a location rejection only if the posting really is open to Latin America *and* states no restriction that excludes
Panama.

**Follow-up — "Give me a bug that taught you this."** My overrule once released three correct rejections: "U.S. only", "Brazil
and Portugal", and a time-zone range without Panama. It saw the word "LATAM" and ignored the rest. Now it asks the same location
checker the filters use.

## 5. "What does fail-closed mean in your HubSpot workflow?"

**30 s:** When something is wrong, the system refuses instead of guessing. If a CV or signed document fails to load, the email
is not sent, so it can never claim an attachment it did not carry.

**90 s:** Fail-closed means the safe default is *no*. My outreach sends only after one human click, and the sender checks every
attachment first: right folder, right file type, under 5 MB, and actually loadable. If any check fails, the whole send is
refused. Same idea in my publisher: it will not publish a number it cannot trace to a source. If the model invents one, that day
publishes nothing rather than something false.

**Follow-up — "Isn't that bad for throughput?"** Sometimes it costs one missed send or one missed post. A wrong attachment in
front of a client, or a made-up number, costs trust. I decide per workflow which failure is cheaper.

## 6. "What happens when Anthropic fails?"

**30 s:** Nothing breaks. Every model call has a fallback chain across five providers. In fact my Anthropic balance has been at
zero for weeks, and the systems keep running on the next provider in the chain.

**90 s:** Each call tries providers in a fixed order and moves to the next on an error or an empty answer. The chain covers
Anthropic, OpenAI, Gemini, Grok and Groq. When Groq retired the models I used, it was a configuration change, not an outage. The
important design choice is that a fallback must be loud: when a provider fails, the log says which one and why, so a silent
degrade does not hide for months.

**Follow-up — "How do you know the fallback works?"** There is a test that deliberately loses the first providers and checks
the chain still answers. And the production logs show which provider answered each call.

## 7. "How do you implement agent memory?"

**30 s:** Three kinds. A permanent ledger of decisions, for learning. A semantic memory for similarity search. And a short
session memory, so a follow-up like "change it" knows which item "it" is.

**90 s:** The ledger is structured: every HubSpot decision with its stage, my reason and the posting it was made on. For
semantic memory, my language-tutor bot EspaLuz stores each conversation turn as an embedding (a list of numbers that captures
meaning) in Postgres with pgvector, and retrieves the three most similar past turns before replying. It is live, with 497 stored
memories and no retrieval errors in the last week. Session memory is simple: my Trello voice bot remembers the card it just made
for 30 minutes, so "reschedule it" edits that card instead of creating a new one.

**Follow-up — "What are the risks of memory?"** Stale or wrong memories. So memory is scoped (per student, per session), has a
similarity threshold, and fails safe: if retrieval breaks, the bot answers without memory rather than crashing.

## 8. "Tell me how you find a bottleneck."

**30 s:** I look at the *output*, not at whether the process ran. Example: my search process ran on schedule, but its filters
were silently switched off. It "worked", and it produced junk.

**90 s:** On one path, a library failed to load on the server's Python, so the code quietly skipped the career filter, my
lessons, the judge and the evidence store. The failure was logged at a level production never prints. I found it by loading the
process exactly as production does, not by reading config. After the fix, its first cycle rejected five junk results (news
articles, social posts) that used to become CRM deals. Another example: a new job source cleared my live filter 76% of the time,
against about 21% for the other sources, so it earned its place.

**Follow-up — "What's the general lesson?"** "It ran" is not "it worked". Always prove a change produced the right output.

## 9. "How do you prioritize with KPIs and measure impact?"

**30 s:** I pick the number that tracks money or time, measure it before and after, and only keep changes that move it.

**90 s:** For the job agent, the KPI is agreement with my own decisions on real postings, plus how many good jobs reach me. For
data sources, it is the share that passes the filter. For outreach, it is deliveries and opens written back to the CRM. I also
fix measurement itself: I found my replay had been scoring the judge on blank postings, so its numbers were meaningless until I
stored the real posting behind each decision.

**Follow-up — "Give me a number."** The new source: 76% versus about 21%. The RAG test: the simple version beat the complex one.
The server disk: 95% full down to 69%, with log rotation so it cannot fill again.

## 10. "Who writes the code?"

**30 s:** Specialized AI agents do much of the implementation. I own what gets built, what gets accepted, what gets deployed,
and what happens when it breaks.

**90 s:** I write the requirements and the architecture, and I decide the tests a change must pass. The agents implement. I
accept a change only when the tests pass and the production logs prove it works; the logs, not the agent's summary, are my
evidence. I am the architect, the reviewer and the on-call.

**Follow-up — "Could you do it without AI?"** Not at this speed. The point of the role is outcomes; my AI environment is how I
deliver them. If a job requires doing the work without AI, it is not the right job for me.

## 11. "Tell me about an incident you handled."

**30 s:** My server hit 95% disk. No logs had ever been trimmed. I freed a quarter of the disk without deleting anything
important, and set up automatic rotation so it cannot happen again.

**90 s:** 8.5 GB of logs, compressed to 310 MB. I removed each original only after checking the compressed copy byte for byte.
All services kept running. I capped the system journal after a full backup, and added rotation. On the way I found a library
writing a bot's secret token into the logs thousands of times a day, and silenced it at the source.

**Follow-up — "What's the named concept?"** Retention policy: decide how much history to keep and drop the rest automatically.
And "secrets in logs": a secret copied into a log is only as safe as the log.

## 12. "How do you handle client delivery and SLAs?"

**30 s:** I have not run US-client SLAs yet. I have run delivery at board level for seven years: vendor coordination,
operational delivery, and cost and performance reporting in a regulated environment.

**90 s:** An SLA is a promise with a number: response time, uptime, turnaround. The way I run my own systems maps onto it: I
define what "working" means, I measure it from production logs, and I get alerted when it breaks, not when a client notices.
From my Deputy CEO years I know the other half: setting expectations early, reporting the bad news first, and tying delivery to
cost.

**Follow-up — "A client says the AI is wrong. What do you do?"** Reproduce it on their real case, find whether it is data,
rules or model, fix the cheapest layer that fixes it, add a test so it stays fixed, and tell them what changed.

## 13. "How would you grow an account?"

**30 s:** Deliver one measurable win in their main bottleneck, show the number, then propose the next bottleneck with a cost and
an expected result.

**90 s:** As Deputy CEO for business development at a fintech, and in my own outreach loop, I learned that clients buy outcomes,
not models. So growth comes from evidence: a before/after they can see, and a clear next step with a price. I would track which
workflows save the client the most time and expand there first.

**Follow-up — "What if the client wants something that won't work?"** Say so early, with the reason, and offer the smallest test
that would prove it either way.

## 14. "What is MCP, and how have you used it?"

**30 s:** MCP, the Model Context Protocol, is a standard way to give an AI agent tools, such as a CRM, a search engine or a
browser. I use MCP connectors in my development environment every day, and I integrate APIs directly in production.

**90 s:** Instead of writing custom glue for each tool, MCP lets the agent discover and call tools through one protocol. In my
environment the agents use connectors for HubSpot, web scraping and more. In production my systems call the HubSpot, Resend
(email), Telegram and Trello APIs directly, with guards in code for what the model is allowed to decide.

**Follow-up — "Risks?"** An agent with tools can act. So actions that are irreversible or outward-facing (sending, deleting)
require a human approval step.

## 15. "Why this role, and not an engineering role?"

**30 s:** Because this role is about outcomes: bottlenecks, delivery, KPIs, growth. That is where I am strongest. I bring an
executive's operating judgment and the ability to ship AI systems through my own environment.

**90 s:** You asked for someone who builds AI systems *and* owns delivery and growth. My background is seven years running
regulated digital transformation at board level; since May 2025 I have built and run 15 production services. My degree is not in
engineering. What I offer is the combination: I can find the real bottleneck, get it built and measured, and explain it to a
client.

---

## Plain-words glossary

- **Fail-closed:** when unsure, refuse. (Opposite: fail-open, which lets things through when a part breaks.)
- **Offline evaluation / replay:** testing a change on past real cases before it goes live.
- **Deterministic rule:** code that always gives the same answer for the same input.
- **RAG:** fetch relevant past examples before the model answers.
- **Embedding:** a list of numbers that captures what a text means, so similar texts can be found.
- **Label noise:** inconsistent past decisions, which make any model's score look worse.
- **Fallback chain:** try provider A, then B, then C.
- **Retention policy:** how long logs are kept before they are trimmed.
- **SLA:** a delivery promise with a number attached.
- **MCP:** a standard way to plug tools into an AI agent.
