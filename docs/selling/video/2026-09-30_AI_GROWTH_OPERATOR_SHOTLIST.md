# AI Growth Operator promo — PRICED SHOT LIST v2 (for Elena's approval, 30 Sep 2026)

Film: **She Asked ChatGPT Before She Messaged Your Yacht** · narration LOCKED + recorded (verse, 1:44) — see
`2026-09-30_AI_GROWTH_OPERATOR_PROMO_SCRIPT.md`. **Nothing is generated until Elena approves that step. $0 spent on
picture so far.**

## 0. Elena's direction (30 Sep) — the spine of the film

- **The woman is the protagonist.** We meet her first at midnight in snowy New York, we *lose* her in the first
  timeline, then follow the **same recognizable woman** through the successful timeline until she physically steps
  aboard in Panama. That is what makes the rewind understandable without explanation.
- **The owner is the second character** — a contemporary charter-business owner who also runs the boat. NOT a
  stereotypical "yacht captain": understated, capable, sun-weathered, premium-casual. His arc: at sea Friday night →
  marina at dawn → approving the AI-drafted reply on his phone.
- **Character continuity is the #1 production rule.** Never generate a scene from text and hope the faces match.
  One locked reference per person first; every shot is built from those references.
- **The boarding shot is the payoff.** We recognize her before anyone says anything — *this is the woman who sat in
  snowy New York asking AI at midnight.*

## 1. The look — elite marine lifestyle, never "toyish"

- **Stills first.** Every shot starts as one photoreal still (Flux 2 Max, $0.066). Elena approves the still BEFORE
  any motion is bought — the look and the faces are fixed for cents, not dollars.
- **Quiet wealth, not bling.** Linen, cashmere, teak, brushed steel, natural light. No gold-chain luxury, no
  champagne-spray clichés, no staged stock smiles.
- **Real camera language.** Slow dolly, gimbal, drone — deliberate moves. No floaty AI drift, no morphing, no fast zooms.
- **No generated UI or text.** Screens in generated shots stay soft or turned away; every readable screen is a
  **real capture**, shown full-frame with the film's grade and grain — never a slide, box, card or gradient.
  On-screen words: three lines only, small, white, Instrument Serif, lots of empty space.
- **One grade** over everything: warm-neutral, soft highlights, deep teal water, true skin.

**Look block — appended to every still prompt (subject always FIRST — film #8 lesson):**
> Photorealistic cinematic film still, shot on ARRI Alexa 35 with anamorphic lenses, natural light, shallow depth
> of field, real skin texture with pores and fine lines, subtle film grain, restrained luxury palette, editorial
> quiet wealth. Not CGI, not illustration, not a stock photo, no plastic skin, no oversaturation, no text, no logos,
> no watermark, no brand names.

## 2. The two characters — identity locked FIRST

| Ref | Who | Reference prompt (subject first) |
|---|---|---|
| **R1 — the guest, a woman (PROTAGONIST)** | Woman, New York, early 40s | Portrait of a woman in her early forties, elegant and intelligent, shoulder-length dark-blonde hair with a soft side part, minimal makeup, thin gold stud earrings, a cream cashmere wrap over a simple black top, warm lamplight, calm curious eyes, looking just off camera. |
| **R2 — the owner (second character)** | Man, Panama, about 40 | Portrait of a Latin American man about forty who owns and runs a small luxury charter business: sun-weathered skin, short dark hair, a neat short beard, calm capable eyes with faint smile lines; washed navy linen overshirt, sleeves pushed up, a minimal steel watch; soft morning sea light. **Negative: no captain's hat, no uniform, no epaulettes, no white captain costume, no gold chains, no sunglasses on the face.** |

**Continuity anchors for HER** (so the payoff is instant): the same face, the same dark-blonde side-parted hair,
the same thin gold studs — and the **same cream cashmere wrap**: on her shoulders at the kitchen island in New York,
and over her shoulders again in the evening breeze on the boat. Her face stays open in the payoff shot (no
sunglasses on the face).

**How identity is locked — the chain, as film #8's generator already does it:**
1. **Reference** — R1 and R2 are chosen from candidates and frozen.
2. **Keyframe** — every still for a shot is generated *with the reference passed in* (`input_images` on Flux 2 Max),
   so the face comes from the locked reference, not from the text.
3. **Motion** — every video **starts from its approved keyframe** (`start_image` / `image` / `first_frame`), so the
   moving face is the approved one. On Kling (G6, G7) the reference is passed again during motion
   (`reference_images`) — a second lock for the two shots where identity matters most.
4. **Contact sheet** — before any motion is bought, Elena sees all her keyframes side by side with R1 (and his with
   R2) and rejects any frame where the person drifts.

## 3. The shots — 9 generated + 7 real

Every generated clip = **5 s**. Durations follow the recorded narration.

| # | Line | What we see | Refs | Engine | $ |
|---|---|---|---|---|---|
| **G1** | 1 — midnight | Exterior: a West Village brownstone at night, heavy snow, one warm lit window with **her** silhouette at a laptop. Motion: very slow push-in, snow drifting. | — (silhouette) | Grok | 0.40 |
| **G2** | 1 — midnight | **Meet her.** Close-up at a marble kitchen island, 11:47 pm, laptop glow on her face, reading glasses, the cream cashmere wrap, a glass of red wine, the snowy window soft behind. Motion: slow dolly-in, she types, glances at the screen. | R1 | Wan | 0.50 |
| **G3** | 3 — Friday, at sea | A white 50-ft luxury sailing catamaran anchored off a tiny palm islet in San Blas at night, full moon, low deck lights; **the owner** alone on the aft deck coiling a line; his phone sealed in a clear dry bag lights up unseen on the cockpit table. Motion: slow lateral move along the deck. | R2 | Grok | 0.40 |
| **G4** | 3 — Monday | Morning, a Panama City marina with the skyline behind; the owner on the stern with a coffee, reading his phone, a small sigh; he lowers it and looks out at the water — **she is gone.** Motion: slow push-in. | R2 | Wan | 0.50 |
| **G5** | 7 — rewind: she writes | **The same woman, same night, same kitchen** (rhymes with G2 on purpose), over-the-shoulder typing into a charter website's contact form; screen soft, unreadable. Motion: gentle push, she clicks send, a small smile. | R1 | Wan | 0.50 |
| **G6** | 8 — the human yes | Dawn at the marina, golden-pink mist on calm water; the owner at the helm with a coffee reads his phone and taps once, a quiet capable smile. Motion: slow orbit around the helm. | R2 (+ref in motion) | Kling | 0.84 |
| **G8** | 10 — arrival | Drone view: the catamaran over turquoise and deep-blue water between palm islets at golden hour. Motion: slow forward flight, gentle descent. | — | Grok | 0.40 |
| **G7** | 10 — **THE PAYOFF** | Golden hour, San Blas. Framed on **her**: she steps from the tender onto the swim platform, the cream cashmere wrap over her shoulders in the breeze, pauses, looks up at the boat and the islet — the same slow smile we saw at midnight. The owner's hand reaches in to steady her; friends soft and out of focus behind. We recognize her before anyone says a word. Motion: slow gimbal move that settles on her face. | R1 + R2 (+refs in motion) | Kling | 0.84 |
| **G9** | 10 — the life | Sunset on the front trampoline net: **she** laughs with friends, glasses catching the low sun, light spray, the owner at the helm soft behind. Motion: slow push-in, a clink, hair in the breeze. | R1 + R2 | Wan | 0.50 |

Edit order for line 10: **G8 → G7 → G9** (arrive, recognize her, live it).
**Engine choice** = Elena's film #8 grid: Wan for faces and emotion, Grok for wides and landscape, Kling where
identity, hands and phones must stay exact (G6, G7).

**Real screens — $0** (the "product screens are real" promise):

| # | Line | Capture | Who / status |
|---|---|---|---|
| S1 | 2 | An AI assistant answering *best private catamaran charter San Blas*, company names blurred | Claude (browser) |
| S2 | 3 | A WhatsApp message on a real phone: *Hi! Is your catamaran free March 12–17? We're 6.* | **Elena** — 1 screenshot |
| S3 | 6 | The live audit: v19's Playwright take or atuona.xyz (93/A+, 3 fixes), domain cropped | Claude |
| S4 | 7 | "We received your inquiry — AIdeazz" email | ✅ have (take 2 #01) |
| S5 | 7 | Telegram "New inquiry" card | ✅ have (take 2 #02) |
| S6 | 8 | Draft card → ✏️ Edit → "✅ Your edited version was SENT" | ✅ have (take 2 #03–05) |
| S7 | 9 | Telegram 8 AM morning brief (NEW / ACTIVE / AGING), names blurred | **Elena** — 1 screenshot at 8 AM |

## 4. The money — step by step, each step needs Elena's "go"

| Gate | What happens | Cost | Running total |
|---|---|---|---|
| 0 | Elena approves this v2 | $0 | $0 |
| 1 | **Lock identity:** 3 candidate portraits for her + 3 for him (6 stills) → she picks one of each | $0.40 | $0.40 |
| 1b | Identity views from the chosen faces: her full-length in resort linen with the wrap + her profile; his full-length on deck (3 stills) | $0.20 | $0.60 |
| 2 | 7 reference-conditioned keyframes (G2–G9 with people) + G1 + G8 + thumbnail (10 stills) → **contact sheet** vs R1/R2; re-roll only the rejects | $0.66 | $1.26 |
| 3 | **One motion test: G7, the payoff, on Kling** — is she unmistakably the midnight woman? | $0.84 | $2.10 |
| 4 | The other 8 motion shots | $4.04 | **$6.14** |
| — | Retake reserve (a shot that fails is re-rolled once) | up to $5.00 | ≤ $11.14 |
| 5 | Music + sound (Pixabay, licence-free), edit, grade, subtitles, 16:9 master + 9:16 Short + thumbnail | $0 | — |

**Expected spend ≈ $6–8. Hard cap in the generator: $12** (`BUDGET_USD=12` — any job that would cross it is refused).
Already spent on this film: voice samples + narration ≈ $0.10.

**Before Gate 1:** Replicate is prepaid (Flux + all four video engines run on it) and throttles below $5 — Elena
checks https://replicate.com/account/billing shows **≥ $12**. Prices were read from Replicate's model pages on 22 Sep;
they are re-read on render day and any change is reported before spending.
