# Pencil — GenAI Creator (LATAM, remote) — application kit

**Apply here:** https://jobs.ashbyhq.com/pencil/5b7acbb1-39d8-4eb8-8162-579bbc09ba75/application?utm_source=torre.ai
**HubSpot deal:** `[HIRING-VJH-LEAD] GenAI Creator for Agentic Creative Workflows and Systems Enablement @ Pencil` (stage: 🔥 YOU act TODAY)
**Posting verified 18 Sep 2026** via Ashby's public job-board API. Published 27 Aug 2026.

## What this job is (and why it fits)

Pencil sells an "AI Operating System for marketing" to Diageo, L'Oréal and Unilever. This role
sits in **Enablement / Creative** and the posting is explicit that this track is **the systems
side**: *"building, scaling, and governing the agents, workflows, and creative infrastructure
that creative teams and clients rely on… the growth path is technical leadership and
architecture, not creative direction."*

That is Elena's work almost line for line:

| What they ask for | What she has done, verified |
| --- | --- |
| Build agentic and nodal creative workflows: insight → concept → copy → image → video | **Atuona AI Film Studio** (atuona.xyz/aifilmstudio): script by LLM → images by Flux → text-to-video → automatic assembly → published gallery |
| Own workflow governance, quality control, reliability | A publishing pipeline that **refuses to publish any number without a verified source**, and blocks near-duplicate articles — both built after real failures |
| Evaluate models and tooling; stress-test; structured feedback | **Multi-provider fallback across Veo, Luma, Runway and Kling** for video, and a five-provider chain for text, ordered by use case |
| Repeatable frameworks across brands, markets and channels | Daily **bilingual (EN/ES)** publishing to web, LinkedIn, Instagram and YouTube, 146 pages live |
| Translate operational problems into technical plans; client discovery | Seven years as Deputy CEO / Chief Legal Officer running digital transformation programs |
| Technical standards, documentation, enablement | **AI Ops Wiki**: 21 production incidents, 18 named failure patterns, written up automatically |

**The gaps — do not paper over them:**
- *"2–3 years' experience in advertising creative development"* and *"preference for prior
  agency experience"*: she has GenAI creative production for her **own** products and brands,
  not for an agency or client roster.
- *"Proficiency in Adobe Creative Cloud"*: not her toolset. She works in Flux, Veo, Kling,
  Runway, Claude and Make. Say so plainly; do not claim Adobe.
- Salary is **not stated** in the posting. Ask.

Position her as the person who **builds the machine the creatives use**, which is exactly what
the posting says this track is.

---

## The application form — every required field

Ashby asks these (pulled from their API, so nothing will surprise you):

1. Name · Email · **Resume (file)**
2. Annual salary expectations in local currency, with currency code
3. Which city & country do you intend to work from?
4. Do you have the legal right to work and remain in that country? (yes/no)
5. Notice period / availability
6. Portfolio link
7. **Long answer:** a creative project where you used GenAI from concept to final output
8. **Long answer:** a time you built or experimented with a GenAI workflow, prompt system or
   agent to solve a creative production challenge

**Resume to upload:** `docs/selling/attachments/17.09.26_EN_Resume_Elena_Revicheva.pdf`
(the 17 Sep English version, 2 pages — Atuona and the AI visibility work are already in it).

---

## Draft answers — read them out loud, change anything that is not you

### 2. Salary expectations
Panama uses the US dollar, so answer in USD. **Pick one and delete the rest:**
- Confident: `USD 66,000 per year (USD). Open to discussing the range for this role.`
- Middle *(recommended)*: `USD 60,000 per year (USD). I am flexible for the right team and scope.`
- Safe: `USD 48,000 per year (USD), depending on scope and level.`

*(Your stated floor is USD 3,000/month = USD 36,000/year. Asking 48–66k leaves room to
negotiate down and still clear the floor. Naming a number below 48k anchors you low for a
role serving Diageo and Unilever.)*

### 3. City & country
`Panama City, Panama.`

### 4. Legal right to work there
**Answer this one yourself** — it is about your Panama immigration status, and I will not
guess it. If you hold residency with the right to work, answer **Yes**. If you invoice through
your own company, most remote employers hire LATAM staff as contractors, and you can add:
`Yes — I live in Panama City and work as an independent contractor through my own business.`

### 5. Notice period
`Available immediately.`

### 6. Portfolio link
```
Portfolio: https://aideazz.xyz/portfolio
AI film studio (GenAI video, end to end): https://atuona.xyz/aifilmstudio
Product film I wrote, generated, scored and shipped: https://youtu.be/j5MoD-O1uf0
AI Visibility Audit API (my own product, free to try): https://aideazz.xyz/api
Engineering write-ups (21 production incidents): https://aideazz.xyz/ai-ops-wiki.html
GitHub: https://github.com/ElenaRevicheva
```

### 7. A creative project using GenAI from concept to final output

*(Tools verified against the actual build on 18 Sep 2026: `aideazz-api-film-v19/kit/compile-v19.mjs`
and `generate-hero-fruits.mjs` — FLUX 2 Pro via Replicate, Runway `gen4.5`, ByteDance Seedance 2.5
via Replicate, OpenAI `tts-1` voice "onyx", ffmpeg drawtext with the site's own .ttf fonts,
sidechain ducking, QR overlay + end card, and the guard that refuses to compile a silent promo.)*

> A product film for my own AI Visibility Audit API — concept to published video, made alone in a
> few days.
>
> The idea was to explain a technical product without explaining: fruit, sliced open, as a metaphor
> for looking inside a website the way an AI assistant does.
>
> What I used, and for what:
>
> - **Claude** — script, voiceover copy and the shot list; **DeepSeek** for prompt variants.
> - **FLUX 2 Pro** (via Replicate) — the hero stills. Each fruit is a specific prompt: glass sphere,
>   suspended liquid, a vertical beam of light through the middle.
> - **Runway Gen-4.5** — image-to-motion for the main shots, driven through their API rather than
>   the web UI, so the whole film rebuilds unattended.
> - **ByteDance Seedance 2.5** (via Replicate) — my second motion engine, switchable per shot,
>   because no single video model gives you every move you want. One environment variable swaps it.
> - **OpenAI TTS** (`tts-1`, voice "onyx") — the narration.
> - **FFmpeg** — the whole edit: crossfades between shots, on-screen type drawn in my product
>   site's own font files so the film and the landing page are one brand, the QR code composited
>   onto every shot plus an end card, and the music sidechain-ducked under the voice so the
>   narration always sits on top.
> - **Make.com + Buffer** — publishing.
>
> I made every decision and every asset: concept, script, prompts, model choice, generation, edit,
> sound, typography and the final publish. It took nineteen versions, and most of the improvement
> came from watching the output honestly and rejecting shots — not from better prompts.
>
> One detail I am proud of: the compiler refuses to build if the music file is missing, because I
> shipped a silent promo once. Now that failure is impossible.
>
> The film is live on YouTube and runs without me: a Make.com automation publishes it on a schedule
> to LinkedIn, Instagram and YouTube, rotating between two cuts so the channel never repeats itself
> two days running.

### 8. A GenAI workflow, prompt system or agent you built to solve a production problem

> **The challenge.** I run an AI film studio that turns a written idea into a finished short
> film. Early on, every fix cost a full rebuild: one bad scene out of eight meant regenerating
> the whole film, paying for every shot again, and waiting. On top of that, video providers
> fail constantly — a model is down, a credit balance is empty, a prompt is refused — and a
> pipeline that assumes one provider simply stops.
>
> **How I approached it.** Two changes. First, the pipeline **keeps every intermediate asset**
> — script, each image, each clip — so any single scene can be regenerated and dropped back
> into the film without touching the other seven. Second, I put a **fallback chain across four
> video providers** behind one interface, so when one fails the next takes the shot.
>
> **What I learned** was not about prompts. It was that a silent fallback is a trap. The
> pipeline would quietly switch to a weaker provider, report success, and produce a film that
> was technically "done" and visibly worse — a failure that looks like success in the logs. So
> now every fallback announces which provider actually produced each shot, and the quality
> check happens on the finished frames, not on the exit code.
>
> I applied the same rule to written content: my publishing pipeline **refuses to publish any
> number it cannot trace back to a verified source**, and it blocks near-duplicate articles by
> comparing each draft against everything already published. Both gates exist because I
> shipped the mistake first and then went looking for the reason.
>
> That is the part I would bring to Pencil: not only building the workflow, but knowing where
> it will quietly degrade, and making it say so.

---

## Steps (about 15 minutes)

1. Open the apply link at the top on your laptop.
2. Upload `17.09.26_EN_Resume_Elena_Revicheva.pdf`.
3. Paste answers 2–8 above; **write question 4 yourself**.
4. Submit, then move the HubSpot deal to the applied stage so VJH learns from it.

## Two things to watch
- **Apply to this exact posting.** Pencil has four identical GenAI Creator postings: generic
  **LATAM** (this one — the right one for Panama), plus Mexico, Brazil and Argentina. Applying
  to a country-specific one puts you in the wrong pile.
- **Pay is not published.** Your salary answer is the only number in play, so pick it
  deliberately.
