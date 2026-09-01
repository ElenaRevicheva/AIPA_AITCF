# VJH walkthrough — 5-minute video script

**Use for:** Evaboot (Agentic Python Engineer), Rwazi (they asked for a Loom), and as a
standing portfolio asset. One take. Bracketed lines are clicks, not words.

⚠️ **Every number below was verified against the live system on 1 Sep 2026.** Do not add
figures from memory on camera. If you are unsure of a number, drop the sentence.

---

## BEFORE YOU RECORD — 2 minutes of setup

**Five tabs, left to right:**

| # | Tab | Ready state |
|---|---|---|
| 1 | `aideazz.xyz/portfolio` | loaded |
| 2 | GitHub → `src/langgraph_pipeline/nodes.py` | **scrolled to line 19** |
| 3 | GitHub → `src/core/fit_gate.py` | scrolled to line 271, `def iron_clad_fit` |
| 4 | GitHub → `src/langgraph_pipeline/crm_hub.py` | scrolled to line 25 |
| 5 | HubSpot → **Zapier** deal → Notes | ⚠️ **Zapier, NOT Evaboot** |
| 6 | `aideazz.xyz/ai-ops-wiki.html` | loaded |

⚠️ **Tab 5 must be the Zapier deal.** Its note has the real letter drafted against the
posting. The Evaboot note still shows the old stub — you would be pointing at the exact
failure you are describing.

**Do not open** `pipeline.py` or `state.py` on camera. You do not need them.

**Verified facts you will say:**
- `SUBMIT_THRESHOLD = 70` — nodes.py **line 19**
- `iron_clad_fit` — `src/core/fit_gate.py` **line 271**
- `push_application_to_crm` — `crm_hub.py` **line 25**
- `AUTO_APPLY_ENABLED=false` on the server; **524 cycles / 14 days, `applied=0` every one**
- New source cleared **76%** of the live filter, rest of the fleet **~21%**
- **175** jobs per cycle marked seen without being read
- **185** identical letters in 11 days

---

## THE SCRIPT

### 0:00 — Who and what *(camera, ~25s)*

> I'm Elena. I build programs that keep working when I'm not watching — not demos.
>
> This is VibeJobHunter. It's Python. It reads a few thousand job posts a day, throws away
> the ones that are not for me, and writes what survives into HubSpot, my CRM. I designed
> it, I run it, and I get the ping when it breaks. Built with Cursor and Claude Code, on
> one small server.

### 0:25 — The recipe *(tab 2, nodes.py — scroll slowly, do not read code aloud, ~45s)*

> This file is the recipe. Not one pile of code that does everything — a line of steps.
> Is this job even for me. How good a match is it. Then: tell me, and write a card.
>
> It remembers what it has already seen, so it does not show me the same company twice and
> call that new work. If a job is only a maybe, it stops and asks me on Telegram.

### 1:10 — The thresholds, honestly *(point at line 19, ~50s)*

> Seventy or more, the code is allowed to submit on its own. Sixty to sixty-nine waits for
> me. Fifty-five to fifty-nine is not an application at all — it goes to founder outreach
> instead. Below that, thrown away.
>
> But look at what is actually running. **Auto-apply is off, and it has always been off.**
> Five hundred and twenty-four cycles in the last two weeks. Applied equals zero, every
> single one.
>
> The capability is built and I keep it switched off, because I want the last click.

### 2:00 — Rules before the model *(tab 3, fit_gate.py line 271, ~35s)*

> This is the part I call iron-clad, and it is not a score. It is a yes or no, before any
> scoring happens. Is it genuinely remote. Is it open to Latin America. Is it AI-augmented
> work rather than research. Does it clear the pay floor.
>
> A language model gets an opinion *after* this. It does not get to argue with "this job is
> in the wrong country."

### 2:35 — The write *(tab 4, crm_hub.py line 25, ~30s)*

> When a job survives, this writes it to HubSpot. HubSpot is the notebook I trust, and the
> agent is not allowed to be the notebook.
>
> If the card is not in HubSpot, it did not happen.

### 3:05 — Look at the output *(tab 5, Zapier deal → Notes, ~35s)*

> I do not trust a log that says the job ran. I look at the thing it made.
>
> This card is what it made this morning. Score. Apply link. And the letter — drafted
> against this specific posting, quoting their own words back at them. If that letter still
> said "edit this stub," the agent failed, even if the run looked green.

### 3:40 — The quiet bugs *(tab 6, wiki, ~55s)*

> The worst bugs never raised an error.
>
> One: the pipeline dropped a field between steps. The filter needed the job's location, and
> it silently arrived empty — so every posting was judged against nothing. Clean runs. No
> exception. Nothing produced.
>
> Two: it reported "applied" for months and had never applied once. I renamed the cards to
> "lead — I apply" and left automatic apply off. Saying you did it is not doing it.
>
> Three: a hundred and eighty-five letters in eleven days, all the same three sentences with
> the company name swapped. It looked finished. The real letter-writer existed and nothing
> called it.
>
> And the same shape again with volume — we marked a hundred and seventy-five jobs a cycle
> as "already seen" before anything had read them. Running is not producing.

### 4:35 — What I take from it *(camera, ~25s)*

> So: look at the output, not the heartbeat. If a number is not proven, do nothing. A new
> job board has to beat the live filter before I plug it in — one cleared seventy-six
> percent where the rest of the fleet clears about twenty-one.
>
> Still open: one email path crashes on a plain-text reply it expected as a form. And the
> question you already live with — how much of "send" an agent should own before the CRM
> becomes fiction. I keep the last click. I have watched "sent" mean nothing.
>
> Portfolio is aideazz.xyz slash portfolio. That's the walkthrough.

**[stop]**

---

## Delivery notes

- **Slow down on line 19 and on the wiki.** Those are the two moments that earn the job.
- **Do not read code aloud.** Scroll, point, say what it does in plain words.
- **The confessions are the strongest part.** Deliver them level, not apologetically —
  they are evidence you find your own bugs.
- If you run long, cut the third bug story (185 letters). Keep bugs one and two.
- If you fluff a line, keep going. One take beats a polished re-record.
