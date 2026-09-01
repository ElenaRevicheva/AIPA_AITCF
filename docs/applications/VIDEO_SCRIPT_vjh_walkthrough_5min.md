# VJH walkthrough — 5-minute video (Evaboot brief)

**Their ask:** facecam + screenshare, **unedited**, 5 minutes. A Python project involving
agentic coding & agentic workflows — *"either something you built heavily using coding
agents, or an application that is itself an agent."*

**You hit both branches.** Say so in the first fifteen seconds. That framing is what gets
you assessed as an AI-augmented builder instead of routed into a coding test.

**Their four bullets, in their order — the script follows this exactly:**
1. architecture + **the context behind why you built it that way**
2. **how you observe the agent, and how you assess the quality of what it produces** ← most airtime
3. the problems you faced and the most challenging parts
4. what you learned, and what you are still trying to figure out

⚠️ Every number below was verified against the live system on 1 Sep 2026. Do not add
figures from memory on camera. Unsure of a number → drop the sentence.

---

## SETUP — 3 minutes before you hit record

**Six tabs, left to right:**

| # | Tab | Ready state |
|---|---|---|
| 1 | `CLAUDE.md` (GitHub, cto-aipa) | scrolled to **"The contract"** section |
| 2 | `src/langgraph_pipeline/nodes.py` | **line 19** |
| 3 | `src/core/fit_gate.py` | **line 271**, `def iron_clad_fit` |
| 4 | **Terminal**, in `VibeJobHunterAIPA_AIMCF` | prompt ready, nothing typed |
| 5 | HubSpot → **Zapier** deal → Notes | ⚠️ **Zapier, not Evaboot** |
| 6 | `aideazz.xyz/ai-ops-wiki.html` | loaded |

⚠️ **Tab 5 must be Zapier.** Evaboot's note still shows the old stub — you'd be pointing at
the exact failure you're narrating.

**Terminal command to have ready (typed, NOT run):**

    python -m pytest evals/test_full_pipeline.py -q

⚠️ **Use exactly this command.** Rehearsed on the laptop 1 Sep: **42 passed in 0.32 seconds**,
all green. Do **not** run the whole suite on camera — it takes **57 seconds** (a fifth of your
video) and shows **2 failures** on this laptop because it has no API keys. The full suite is
132 passed / 2 failed here, 136 / 1 on the server. Say *"over a hundred and thirty tests in
the full suite"* — true in both places — and run the fast slice.

**Facecam:** on for 0:00–0:40 and 4:10–5:00. Screenshare for the middle. Don't hide your
face at the start — they asked for facecam because they want to see you think.

---

## THE SCRIPT

### 0:00 — Who, and both branches at once *(facecam, ~40s)*

> I'm Elena. I'm an AI-augmented builder — I don't hand-write most of this code. I direct
> Cursor and Claude Code, I review everything they produce, and I'm the one who gets the
> ping at 3am when it breaks.
>
> You asked for either something built heavily with coding agents, or an application that is
> itself an agent. **This is both.** It's VibeJobHunter — a Python agent that reads a few
> thousand job posts a day, decides which are worth my time, and writes them into my CRM.
> Coding agents built it. It is itself an agent. My job is supervising both, and that turns
> out to be the same skill.

### 0:40 — How I direct the coding agents *(tab 1, CLAUDE.md, ~35s)*

> This is what makes it repeatable. Two coding agents work this repo — Cursor and Claude
> Code — and they cannot see each other's conversations. So I wrote them a protocol.
>
> Claim what you're touching before you touch it. Everything lands on main. Never overwrite
> the other's work — merge, and the version with a verification wins. And: prove what came
> out the far end, not that the step ran.
>
> That last rule was earned, and I'll show you how.

### 1:15 — Architecture, and why *(tabs 2 and 3, ~55s)*

> **[nodes.py]** The agent is a state machine, not one big function. Discrete steps: is this
> job even for me, how good a match, then tell me and write the card. Each step is separately
> testable, which matters when a language model sits in the middle of it.
>
> **[point at line 19]** Seventy or more, the code may submit on its own. Sixty to sixty-nine
> waits for me. Fifty-five to fifty-nine goes to founder outreach instead. Below that, gone.
>
> But **auto-apply is off, and has always been off.** Five hundred and twenty-four cycles in
> two weeks — applied equals zero, every one. The capability is built and I keep it switched
> off, because I want the last click.
>
> **[fit_gate.py, line 271]** And this is the architectural decision I care most about.
> **Deterministic rules run before the model, not after.** Genuinely remote. Open to Latin
> America. AI-augmented work, not research. Clears the pay floor. Yes or no, in Python.
>
> The model gets an opinion *after* this. It does not get to argue with "this job is in the
> wrong country." When an LLM is a component, the cheapest reliability you can buy is putting
> the non-negotiables in code where they can't be talked out of.

### 2:10 — How I observe it and judge its output *(tab 4 terminal, then tab 5, ~75s)*
*This is their hardest question. Slow down here.*

> Observing an agent is the actual problem. A model gives you a confident answer whether or
> not it was right, so you cannot watch it — you have to watch what it produced.
>
> **[run `python -m pytest evals/test_full_pipeline.py -q` — it finishes in under a second]**
>
> Forty-two green. This is the eval harness — the honest answer to "how do you know the agent
> is any good." Fixtures where I already know the right answer: a technical SEO lead should
> pass, a research scientist should not. The agent has to keep getting them right after every
> change I let a coding agent make.
>
> Over a hundred and thirty tests in the full suite. Two of them fail on this laptop, and
> that's correct — it has no API keys. On the server one still fails, because a provider's
> credits are empty and the test says so out loud instead of quietly falling back and
> pretending everything is fine. **A test that can't fail isn't telling you anything.**
>
> **[tab 5, HubSpot note]** Then the second check: I look at what it actually made. This card
> is from this morning. Score, apply link, and a letter drafted against that specific
> posting, quoting their own words back. If that letter still said "edit this stub," the
> agent failed — even if every log was green.
>
> And it learns from me. When I reject something and write why — or just attach a screenshot
> of the posting — that reason is read, including the image, and goes into the model's prompt
> within the hour. Its taste is trained on my actual decisions, not on my job title.

### 3:25 — The problems *(tab 6, wiki, ~45s)*

> The hard bugs never raised an error. I write them up publicly.
>
> The pipeline silently dropped a field between steps — the filter needed each job's
> location, and it arrived empty, so every posting was judged against nothing. Clean runs.
> No exception. Nothing produced.
>
> It reported "applied" for months and had never applied once.
>
> And the one that taught me the most: it marked a hundred and seventy-five jobs a cycle as
> "already seen" **before** anything had read them — under a log line announcing success.
> Running is not producing.

### 4:10 — Learned, and still figuring out *(facecam, ~45s)*

> What I learned: watch the output, not the heartbeat. Put the non-negotiables in
> deterministic code, and let the model be the judgment layer on top. And a new data source
> has to beat the live filter before I wire it in — the last one cleared seventy-six percent
> where the rest of the fleet clears about twenty-one.
>
> Still figuring out: how much of "send" an agent should own before the CRM becomes fiction.
> Right now I keep the last click, and I'm not sure that's permanent — I'm sure it's right
> while I still find bugs like these.
>
> Also: how to review code I didn't write as fast as agents produce it. That's the real
> bottleneck of working this way, and I don't think anyone has solved it yet.
>
> That's VibeJobHunter. Thanks for watching.

**[stop]**

---

## Delivery notes

- **The AI-augmentation frame is load-bearing.** Say "I direct coding agents" in the first
  15 seconds and again at CLAUDE.md. It's the difference between being read as an AI-native
  builder and being sent a LeetCode link.
- **Run the evals live.** Unedited video makes a real terminal command the single most
  credible thing you can do. Don't screenshot it.
- **Slow down at 2:10.** That block is their hardest bullet and your strongest material.
- **Don't read code aloud.** Scroll, point, say what it does in plain words.
- The confessions are evidence, not apology. Deliver them level.
- Overrunning? Cut the second bug story. Never cut the eval run or `fit_gate.py`.
- Fluff a line and keep going. One honest take beats a fourth attempt — and it matches
  everything else you're saying.
