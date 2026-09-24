# micro1 — HubSpot Specialist · AI interview prep

**Role:** HubSpot Specialist, contractor, remote, $28–92/h. Complete real HubSpot workflows
on screen, record them, write prompts + rubrics from them, review outputs.
**HubSpot deal:** `[HIRING-MICRO1] HubSpot Specialist @ micro1` (I Act TODAY).
**CV to upload:** `CV_Elena_Revicheva_crm.pdf` — attached to the deal's note in HubSpot (24 Sep). CVs live in
HubSpot, never in the Atuona bot.

You have done micro1's AI interview before ("Great work on your interview", Titan Proton next
steps, background check). Same format: the AI asks, you answer out loud, camera on.

Every number below is from your own portal or your CV. Nothing is invented. If a question goes
past what you have done, say so and explain how you would do it — that is what they grade.

---

## 1. Your opening (about 60 seconds, 130 words)

> I run my own sales operation in HubSpot, every day. My portal has more than 1,900 deals and
> 1,400 companies. I designed the pipeline: every stage is named for who acts next, so nothing
> sits without an owner. Most of the work is automated. My agents create the company, the deal,
> the note and the task through the HubSpot API. When I approve an email with one click, the
> deal moves to "Sent" by itself, the task closes, and a follow-up task appears four days later.
> Before this I was Deputy CEO of a government digital operator for seven years, so I think about
> process and data quality, not only tools. I have also worked with micro1 before, on a
> human-data project. Recording my screen and explaining each step is how I already document
> my work.

---

## 2. Questions you will probably get — and your real answer

**"Walk me through your HubSpot experience."**
Portal I administer. Objects: contacts, companies, deals, notes, tasks, files. Custom deal
pipeline with 7 stages ("AI working", "I act today", "I act this week", "Sent — waiting",
"They replied", "Won", "No fit"). Records are created through the API with associations
between them (deal↔company, note↔deal, task↔deal). CVs are attached to deals as files.

**"How do you design a pipeline?"**
Each stage must have a clear exit rule and one owner. Mine are named after who acts next.
Lesson I learned: a stage can go stale. 76 deals sat in "They replied" long after they were
handled — the stage said "act" when there was nothing to do. Now I audit stages from the live
records, not from the board.

**"Tell me about a workflow you automated."**
The one-click send (24 Sep, this week): I staged 5 partner deals, each with a note and a
"Send" task. One click on the note sends the email. Then, automatically: the deal moves to
"Sent", the note is stamped with what was sent, the Send task closes, and a follow-up task is
created for 4 days later. Why: before this, most of my outreach got one message and then
silence — no follow-up.

**"How do you build a Workflow in HubSpot?"** (the native Automation → Workflows tool)
Say it in this order: *object* (contact-, company- or deal-based) → *enrollment trigger* (e.g.
deal stage becomes "Sent") → *actions* (create task, set property, send internal
notification, rotate owner) → *delays* and *if/then branches* → *re-enrollment* settings →
*test* on one test record → *turn on* → *monitor* the workflow history.
⚠️ Be honest: most of your automation runs **through the API**, not the Workflows builder.
Say: "In my portal most automation runs through the API. I know the Workflows builder and I
would build the same logic there like this: …" — then the order above.
**Before the interview:** open your HubSpot → Automation → Workflows and click through
creating one (you do not have to turn it on). 15 minutes. Then you are describing what you saw.

**"How do you keep CRM data clean?"**
Two real stories:
1. I tagged deal sources with a prefix in the deal *name* (like `[CLIENT-MANUAL]`). Text search
   then mixed streams up. The right design is a dedicated dropdown property — a lead-source
   field — so filters are exact. (Concept: **don't hide data inside a text field**.)
2. I audited 64 prospect records and found about 17 were not companies at all — article titles
   saved as company names. Lesson: **validate at the point of entry**, not after.
Also mention: deduplicate by email / domain; required properties; one owner per record.

**"How do you report on a pipeline?"**
Deals by stage, conversion between stages, deals by source, time in stage. And I report the
honest number: I audited my own outbound — 180 prospects, about 156 contacted, 1 reply. That
told me the channel was wrong, not the effort. (Only say this if asked about results; frame it
as "I measure and act on it".)

**"What is the difference between lifecycle stage and lead status?"**
Lifecycle stage = where the contact is in the whole journey (subscriber → lead → MQL → SQL →
opportunity → customer). Lead status = the sales rep's working status inside a stage (new, open,
in progress, connected). My staging script sets lifecycle "opportunity" and lead status "open".

**"How would you write a prompt and a rubric for a HubSpot task?"** — see section 3.

**"Do you have human-data experience?"**
Yes: selected by micro1 for the Titan Proton human-data project. And I build evaluation
rubrics and an AI judge for my own job pipeline — when I replayed 51 rejected items, 20 were
wrong, caught before release.

**"Are you comfortable recording your screen?"** Yes — I already record and explain my systems.

---

## 3. Prompt + rubric example (have this ready — it is the core of the job)

**Prompt:** "A new partner, Acme Books (acmebooks.com), wants to hear about our video service.
Create the company, a deal named 'Acme Books — trailer partnership' in the Sales pipeline at
stage 'Appointment scheduled', associate the deal with the company, and create a task for the
deal owner to follow up in 3 business days."

**Rubric (each item pass / fail):**
1. Company exists once, with domain acmebooks.com — no duplicate created.
2. Deal name exactly as given.
3. Deal is in the correct pipeline **and** the correct stage.
4. Deal is associated with the company.
5. Task exists, is associated with the deal, assigned to the deal owner.
6. Task due date = 3 business days from today (weekend skipped).
7. No other records were created or changed.

Why a good rubric looks like this: each line is **checkable by someone else**, one thing per
line, and it includes the mistakes people really make (duplicates, wrong pipeline, missing
association, wrong due date).

---

## 4. Words to use (they signal real experience)

objects · properties · associations (and association labels) · pipeline and stages ·
enrollment trigger · re-enrollment · if/then branch · owner rotation · lifecycle stage vs lead
status · deduplication · required properties · source attribution · task queue · Private App /
Service Key (API access) · "validate at entry" · "one owner per record"

## 5. On the day

- Quiet room, camera at eye level, laptop plugged in.
- Speak slowly. Short sentences. A number beats an adjective.
- If you do not know: "I have not used that feature. Here is how I would find out and do it: …"
- Do not argue with the AI interviewer's framing. Answer, give one real example, stop.

---

## 6. The exercise — screen share (added 24 Sep, second agent)

The invite says **"AI Interview + Exercise"**, up to 48 min, and **"be ready to share your screen"**.
Expect to do a small HubSpot task live and talk while you do it.

**Likely tasks** (the focus areas they listed): create a contact + company and associate them ·
create a deal in the right pipeline and stage · move a deal and add a task · build a filtered view
or a simple report · describe (or build) a workflow.

**How to do it on camera — say each step out loud:**
"I'm opening Contacts. I search first so I don't create a duplicate. Not found, so I create it…
Now I associate it with the company… I check the deal is in the right pipeline, not only the right
stage… Done. Let me verify: I open the record and check the association and the task due date."
→ **Always finish by checking your own work on screen.** That is the habit their rubric rewards.

**🔒 Privacy — your portal holds real people's names and emails (2,640 deals, 1,998 companies on 24 Sep).**
- Share **only the HubSpot browser window**, not the whole screen. Close Gmail, Zoho, WhatsApp, Telegram.
- Do the exercise on a **test record** you create for it ("Test Contact — Interview", domain `example.com`).
- Don't open lists of real prospects on camera. If they ask to see your pipeline, show the **board with
  stage names**, collapsed, not individual client records.
- Delete the test records after the interview.

**Workflows:** your API key cannot see whether your Starter plan includes the Workflows builder (the
check returns 403). **Before the interview, open Automation → Workflows yourself.**

**✅ Checked by Elena 24 Sep 14:17 (screenshot):** Automation Overview shows **0 native automations** on
every object (contacts, companies, deals, forms, email, ads, tickets); "Upgrade to Professional" is shown;
HubSpot now points to **Agent Hub** ("your new home for automation — workflows and agents"). Say it as a
strength: *"My portal's Automation Overview shows zero native workflows, because all my automation runs
through the HubSpot API from my own agents."* Rehearse the builder via **Open Agent Hub → Workflows**.
- If it opens: click through building one (don't turn it on).
- If it asks you to upgrade: say so honestly in the interview — "my plan doesn't include Workflows, so
  my automation runs through the API; here is how I'd build the same logic in the Workflows builder…"

**20-minute rehearsal, the day before:** create a test contact → company → associate → deal in
"🔥I Act TODAY" → task due in 3 days → open the deal and verify all of it → delete everything.
Do it once while talking out loud. Then the exercise is something you have already done.

**⚠️ Check your CV before the interview.** `CV_Elena_Revicheva_crm.pdf` says "EspaLuz — **paying**
WhatsApp / Telegram tutor… PayPal subscriptions", "early users in 19 countries", and "Operational
Co-Founder — OmniBazaar 2024–2025". The interviewer can ask about any line. If any is not true, tell
the agent and it will be rebuilt before you start.
