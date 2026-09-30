# AI Growth Operator promo — PRICED SHOT LIST v3 (for Elena's approval, 30 Sep 2026)

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

- **Stills first.** Every shot starts as one photoreal still (the Gate-1 winner of Nano Banana Pro / GPT Image 2 / Flux 2 Max, $0.13–0.15). Elena approves the still BEFORE
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
| **R1 — the guest, a woman (PROTAGONIST)** | Woman, **luxurious New York**, early 40s (Elena: "luxurious style New York woman") | Portrait of a strikingly elegant New York woman in her early forties, Tribeca quiet luxury: sleek shoulder-length dark-blonde hair with a soft side part, luminous natural skin, refined minimal makeup, thin gold stud earrings and a slim gold watch, an ivory silk blouse under a cream cashmere wrap, no logos; poised, confident, magnetic; warm penthouse lamplight; Vogue-portrait realism, looking just off camera. |
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

| # | Line | What we see | Refs | Engine | $ (5 s) |
|---|---|---|---|---|---|
| **G1** | 1 — midnight | Heavy snow falling past the floor-to-ceiling windows of a Tribeca penthouse at night, the Manhattan skyline glittering beyond, and inside, warm lamplight on **her** silhouette at a laptop. Motion: very slow push-in, snow drifting. | — (silhouette) | Gate-3 winner | 1.12–2.00 |
| **G2** | 1 — midnight | **Meet her.** Close-up at a Calacatta marble kitchen island in her Tribeca penthouse, 11:47 pm, laptop glow on her face, reading glasses, the cream cashmere wrap, a glass of red wine, the snowy window soft behind. Motion: slow dolly-in, she types, glances at the screen. | R1 | Gate-3 winner | 1.12–2.00 |
| **G3** | 3 — Friday, at sea | A white 50-ft luxury sailing catamaran anchored off a tiny palm islet in San Blas at night, full moon, low deck lights; **the owner** alone on the aft deck coiling a line; his phone sealed in a clear dry bag lights up unseen on the cockpit table. Motion: slow lateral move along the deck. | R2 | Gate-3 winner | 1.12–2.00 |
| **G4** | 3 — Monday | Morning, a Panama City marina with the skyline behind; the owner on the stern with a coffee, reading his phone, a small sigh; he lowers it and looks out at the water — **she is gone.** Motion: slow push-in. | R2 | Gate-3 winner | 1.12–2.00 |
| **G5** | 7 — rewind: she writes | **The same woman, same night, same kitchen** (rhymes with G2 on purpose), over-the-shoulder typing into a charter website's contact form; screen soft, unreadable. Motion: gentle push, she clicks send, a small smile. | R1 | Gate-3 winner | 1.12–2.00 |
| **G6** | 8 — the human yes | Dawn at the marina, golden-pink mist on calm water; the owner at the helm with a coffee reads his phone and taps once, a quiet capable smile. Motion: slow orbit around the helm. | R2 (+ref in motion) | Gate-3 winner | 1.12–2.00 |
| **G8** | 10 — arrival | Drone view: the catamaran over turquoise and deep-blue water between palm islets at golden hour. Motion: slow forward flight, gentle descent. | — | Gate-3 winner | 1.12–2.00 |
| **G7** | 10 — **THE PAYOFF** | Golden hour, San Blas. Framed on **her**: she steps from the tender onto the swim platform, the cream cashmere wrap over her shoulders in the breeze, pauses, looks up at the boat and the islet — the same slow smile we saw at midnight. The owner's hand reaches in to steady her; friends soft and out of focus behind. We recognize her before anyone says a word. Motion: slow gimbal move that settles on her face. | R1 + R2 (+refs in motion) | Gate-3 winner | 1.12–2.00 |
| **G9** | 10 — the life | Sunset on the front trampoline net: **she** laughs with friends, glasses catching the low sun, light spray, the owner at the helm soft behind. Motion: slow push-in, a clink, hair in the breeze. | R1 + R2 | Gate-3 winner | 1.12–2.00 |

Edit order for line 10: **G8 → G7 → G9** (arrive, recognize her, live it).

### Engines — v3: only the newest top tier, 1080p (Elena: "super realistic, juicy, human, 2026 latest model")

v2 used budget engines (Wan 2.7 $0.10/s, Grok 1.5 $0.08/s). v3 uses only the current top tier, verified live on 30 Sep
(Replicate model pages + API, Google `models.list` on our key):

| Engine | Start frame | Reference faces in motion | Res. | 5 s shot |
|---|---|---|---|---|
| **Veo 3.1** (Google flagship) | ✅ `image` | ✅ `reference_images` | 1080p | **$2.00** |
| **Kling 3.0 Omni** (pro) | ✅ `start_image` | ✅ up to 7 `reference_images` | 1080p | **$1.12** |
| **Seedance 2.5** (updated 25 Aug) | ✅ `image` | ✅ `reference_images` | 720p | **$1.16** |
| **Wan 3 Prime** (new Wan generation) | ✅ `image` | — | 1080p | **$1.40** |

Stills (faces + keyframes): **Nano Banana Pro** $0.15 · **GPT Image 2** (high) $0.128 · **Flux 2 Max** ≈ $0.13 with a
reference face. The face candidates are made on all three; Elena picks the most human, and that model makes the rest.

**How the engine is chosen: a side-by-side on the payoff shot.** The approved G7 keyframe is rendered once on each of
the four engines ($5.68). Elena watches the four and picks by eye. **The winning take IS the final G7** — nothing
is wasted — and the winner renders the other 8 shots.

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

## 4. The money — step by step, each step needs Elena's "go" (v3, top tier)

| Gate | What happens | Cost | Running total |
|---|---|---|---|
| 0 | Elena approves this v3 | $0 | $0 |
| 1 | **Lock identity:** 6 candidate faces for her (2 each on Nano Banana Pro / GPT Image 2 / Flux 2 Max) + 3 for him (1 each) → she picks one of each, and the most human model | $1.23 | $1.23 |
| 1b | Identity views from the chosen faces: her full-length in resort linen with the wrap + her profile; his full-length on deck (3 stills) | $0.45 | $1.68 |
| 2 | 10 reference-conditioned keyframes + thumbnail → **contact sheet** vs R1/R2; re-roll only rejects | $1.50 | $3.18 |
| 3 | **Engine side-by-side on G7, the payoff:** Veo 3.1 · Kling 3.0 Omni · Seedance 2.5 · Wan 3 Prime → she picks by eye; the winning take is the final G7 | $5.68 | $8.86 |
| 4 | The other 8 shots on the winner — Kling $8.96 · Seedance $9.28 · Wan 3 Prime $11.20 · Veo $16.00 | $8.96–16.00 | **$17.82–24.86** |
| — | Retake reserve | up to $5 | — |
| 5 | **Music (Elena, 30 Sep): Pixabay, modern 2026 chillout, tropical style, instrumental — NO vocals / no words.** Shortlist for her ear; never reuse "Tropical Chill" (JonasBlakewood) or "Chill House" (Kulakovka) from the /api films, or film #8's "The Ritual". Plus sound (waves, keyboard, WhatsApp ping), edit, grade, subtitles, 16:9 master + 9:16 Short + thumbnail | $0 | — |

**Expected ≈ $18–25 depending on the engine she picks at Gate 3. Hard cap in the generator: $30.**
Optional saving: the 3 shots without faces (G1 snow window, G3 moonlit boat, G8 drone) on Wan 3 at $0.50 each saves
$1.86–4.50 — her call at Gate 3. Already spent on this film: voice samples + narration ≈ $0.10.

**Gate 1 GO (30 Sep):** Elena topped Replicate up → credit **$38.03** before any render (her billing screenshot, 11:28 Panama).
Generator = `scripts/aigo-promo-gen.mjs` (a copy of film #8's, same money guard) → Oracle `~/aigo-promo/`; plan =
`aigo-promo-plan.json`. Gate 1 ran with its own step cap `BUDGET_USD=1.5`.

**Before Gate 1:** Replicate (all engines + stills run there) is prepaid and throttles below $5 — Elena checks
https://replicate.com/account/billing. **≥ $30** covers the worst case. Prices read 30 Sep (Wan 3 Prime, stills: model
pages; Veo / Kling / Seedance: 22 Sep audit) and re-read on render day; any change is reported before spending.

## 5. Gate log

- **Gate 1 — DONE 30 Sep 16:37 UTC.** 9/9 rendered, 0 refused; ledger **$1.13** (step cap $1.50); Replicate credit before: $38.03.
  Files: Oracle `~/aigo-promo/img/r1_{nano,gpt,flux}_{a,b}.jpg`, `r2_{nano,gpt,flux}.jpg`; contact sheet sent to Elena.
  Claude's read: Nano = most natural (her A/B already look like one woman; best him); GPT = most luxurious NY (r1_gpt_a
  strongest portrait), his reads a bit "model"; Flux = her OFF-BRIEF (reads 55–60), him good but older.
  **Elena picked HER = `r1_gpt_a`** ("Woman fine") → locked as Oracle `img/R1.jpg`. Asked for more versions of him.
- **Gate 1 round 2 (him) — DONE.** 3 looks × (nano, gpt) = 6/6, $0.83; **total picture spend $1.97**. Claude's pick `r2_m2_gpt`
  (~42, salt-and-pepper, navy overshirt + white tee — premium owner, same model family as her); alts `r2_m2_nano`, `r2_m1_gpt`.
  Elena: "No. Still not iron clad. He needs to be handsome sexy Panamanian captain-business owner, casual 2026."
- **Gate 1 round 3 (him) — DONE.** 3 looks × 2 takes on GPT Image 2 = 6/6, $0.77; **total picture spend $2.74**. A/B takes
  already hold one identity per look. Claude's pick `r2_p2_gpt_a` (~39, black linen, stubble — pairs with her); alts `p1`
  (sexiest), `p3_gpt_a` (Afro-Panamanian).
- **IDENTITY LOCKED (Elena, 30 Sep):** R1 = `r1_gpt_a` → `img/R1.jpg`; **R2 = `r2_p2_gpt_a` → `img/R2.jpg`**. Both from GPT Image 2.
- **Gate 1b — DONE (Elena: "yes").** 3 views on GPT Image 2 with refs passed in: `v_r1_profile` (NY night), `v_r1_deck` (Panama
  payoff look: ivory linen dress + the cashmere wrap), `v_r2_helm` (dawn, skyline) — 3/3, $0.38; **total picture spend $3.12**.
  Identity holds in all three (checked side by side with R1/R2).
- **Gate 2 — DONE (Elena: "yeah. make it fire").** 10 keyframes (G1–G9 + thumbnail) on GPT Image 2 with R1/R2 + outfit views
  passed in: 10/10, $1.28; **total picture spend $4.40**. Identity consistent across G2/G5/G7/G9/thumb (her), G3/G4/G6 (him);
  no generated text on screens. Contact sheet sent.
- **Gate 3 proposal (Elena asked for her Venice / Runway / Luma).** Wallets 30 Sep: Runway `creditBalance 4` (≈$0.04 — empty);
  Luma direct key rejected by `/credits` ("Not authenticated") but **Luma ray-3.2 runs on Replicate**; Venice key works, balance
  needs an admin key (last known ≈$8.25 on 22 Sep). Replicate also has **Sora 2 Pro** (billed to OpenAI via our key: $0.30/s 720p,
  $0.50/s 1792×1024), **Hailuo 2.3** ($0.28–0.56/video), **Veo 3.1** ($0.40/s with audio, $0.20/s without), Kling Omni, Seedance.
- **Gate 3 GO (Elena: "Go 3").** Payoff G7 on 7 engines: Kling 3.0 Omni pro + face refs · Veo 3.1 1080p · Luma ray-3.2 1080p ·
  Sora 2 Pro (OpenAI key, 1792×1024 start) · Hailuo 2.3 1080p · Seedance 2.5 720p · **Venice Wan 3.0 Pro 1080p on her Venice wallet**
  (quote-before-queue, same flow as Atuona's `tryVeniceVideo`). Worst-case $8.82, step cap `BUDGET_USD=13.40`. Runway excluded
  (4 credits) — next round only if none of the 7 satisfies her.
- **Gate 3 — RESULT.** 4 takes: Kling $1.12 · Venice $1.18 (Venice wallet) · Luma $1.20 (2nd try — 1st failed on our side:
  Replicate file URL rejected, fixed by inlining the start frame) · Hailuo $0.56. **Refused, not billed:** Veo 3.1 + Seedance
  ("flagged as sensitive" on an innocent frame), Sora 2 Pro (OpenAI answers **HTTP 404 on /v1/videos** for our key — the
  account has no Sora video access). **Total picture spend $8.46.** Claude's read: Venice holds her identity best (pick);
  Hailuo = best value; Kling most cinematic but face drifts mid-shot; Luma loses her (turns away, face changes).
  Comparison: Oracle `~/aigo-promo/review/G7_engine_compare.mp4` (2×2).
- **ENGINE DECISION (Elena, 30 Sep): Venice Wan 3.0 Pro** ("first let us go with venice"). The G7 payoff = the Venice take.
  Runway Gen-4.5 IS on Replicate (`runwayml/gen-4.5`, Runway API list price 12 credits/s = $0.12/s) — kept as an option for
  a later round; no Runway top-up needed.
- **Gate 4 GO (Elena: "use 7 usd in venice and fall back to runway").** Venice wallet $7.07 (her screenshot) = 5 shots.
  Venice Wan 3.0 Pro for the faces: G2 G4 G5 G6 G9 ($5.90). Runway Gen-4.5 via Replicate ($0.12/s) for the wides: G1 G3 G8
  ($1.80). Motion prompts = the 8 lines shown to her. Step cap `BUDGET_USD=16.50`.
- **Gate 4 — DONE.** 8/8, 0 refused; **total video generation $16.16** (Venice $7.08 = G7 test $1.18 + 5 shots $5.90 →
  Venice wallet ≈ $1.17 left, since her $7.07 screenshot was taken after the test; Replicate ≈ $9.08; OpenAI $0). Review: all faces consistent; **G1 Runway invents a different woman +
  readable screen after ~3.5 s → only its first 3 s are used**; G3 trimmed before he turns away.
- **Rough assembly v1 — sent 30 Sep.** `scripts/aigo-promo-roughcut.py` → Oracle `~/aigo-promo/rough/AIGO_rough_cut_v1.mp4`
  (1080p, 104.4 s = narration) + `_review720.mp4`. 25 segments. Placeholders still to capture (all $0): S1 AI assistant
  answer (names blurred) · S2 WhatsApp screenshot (Elena) · S3 clean /api audit recording (atuona.xyz, domain cropped) ·
  S7 8 AM brief (Elena). Still to do: Pixabay music shortlist (no vocals), blur her email + the link preview with her name
  in the phone screens, 9:16 Short, thumbnail title, final grade.

## 6. Elena's review of rough cut v1 (30 Sep) — the fix list

1. Her AI question must be SHOWN: she asks e.g. *where can I book a yacht in Bocas del Toro or San Blas* and the AI answers.
2. G5 (she writes, 0:52): her arms are awkwardly placed → re-render.
3. G1 opens on a woman in a BLACK dress, then "another woman" appears → G1 must be HER (R1, cream wrap) or nobody.
4. G6: the captain drives from the wrong side (faces the stern) → re-render with correct helm orientation.
5. Telegram → WhatsApp (open: the real approval card lives in Telegram — see answer in chat; never fake a product screen).
6. Show the HubSpot CRM (real deal record).
7. Her QR (decodes to `https://aideazz.xyz/api` — verified 30 Sep, needs a B/W threshold for OpenCV; test-decode final
   frames) on EVERY frame that has no man/woman video: cards, real screens, end card.
8. Voice: more natural, verse sounds robotic → samples on ElevenLabs v3 / MiniMax Speech 2.8 HD / Chatterbox (all on Replicate).
9. AIdeazz AI Lab logo (her PNG, transparent) on the final page.
10. Idea: the woman uses her PHONE instead of the laptop.

**Fixes round — GO (Elena: "1 - yes. 2. Go fixes. 3 yes").** Decision: owner approval stays **Telegram** (real product),
guest channel = **WhatsApp** (real screenshot). New stills on GPT Image 2 with refs: `k_g1b` (HER at the snowy window, phone —
replaces the woman in black), `k_g2b` (asks AI on her phone), `k_g5b` (sends, natural hands), `k_g6b` (behind the wheel facing the
bow), `k_thumb2` — 5/5 OK after 2 refusals ("curled on a sofa, legs tucked" + silk tripped GPT's filter; neutral wording passed,
refusals not billed). Ledger **$16.80**. Voice round 3: ElevenLabs v3 (Roger, Mark, Drew, James) + MiniMax 2.8 HD (magnetic,
trustworthy) — 6/6 transcript-clean, ≈$0.15 (outside the gen ledger). `scripts/aigo-promo-vo-round3.py`.

**"Go Panama" (Elena, 30 Sep).** Stills `k_g4b` + `k_g6c` (Flamenco Marina / Amador, twisted F&F tower, cargo ships anchored for the
Canal) — 2/2, $0.26; ledger **$17.06** (+≈$0.15 voice). WhatsApp S2 = her screenshot cropped to the bubble only (header with her
name/photo removed): `captures/elena-phone-20260930-take3/S2_whatsapp_crop.jpg`.
**Real-footage audit:** Pixabay "san blas panama" (117+) is fuzzy matching — San Francisco/San José/Murcia, NO San Blas.
Pexels "San Blas Islands": location metadata = Atlanta / Indonesia / Philippines / Paris; "Panama" is only an SEO tag next to
Honduras, Dominican Republic, Tuvalu → **rejected, would mislead**. Genuinely titled-Panama Pixabay 4K clips: 34734 Causeway Panama
City 25s · 371077 + 371076 Panama City architecture 21s · 371074 Ciudad de Panamá 11s · 346372 Sunset Bocas del Toro 47s. No free
San Blas footage exists → San Blas stays AI with authentic Guna Yala detail, or Elena's own footage.

**"Go motion" — DONE.** G1b Runway ($0.60) + G2b G5b G4b G6c Hailuo ($0.56 each) = $2.84 → ledger **$19.90**. All 5 pass:
same woman throughout G1b (no stranger), phone shots natural, G4b/G6c show Panama City (F&F tower, Canal ships), G6c helm correct.
**S1 ChatGPT recording (Elena's phone, 74 s)** → `captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4`. Use 13–74 s only:
0–13 s = home screen + ChatGPT drawer with her PRIVATE chat list → never use. Real answer names Catamaran Adventures San Blas,
San Blas Sailing, a luxury all-inclusive charter + map card → blur the names.
**Pending Elena:** Pixabay download OK (5 × 1080p, 313 MB) · San Blas A (her footage) / B (AI Guna Yala re-render ≈$0.73) · voice pick
(ElevenLabs v3 Roger/Mark/Drew/James, MiniMax magnetic/trustworthy) · later: fresh test inquiry → HubSpot deal screenshot + 8 AM brief.
**Next (all $0):** v2 cut — new shots, S1 blurred, S2 WhatsApp crop, Telegram screens, QR (→ /api) on every non-people frame,
logo on the end card, new voice, Pixabay music shortlist.

**CUT v2 — built 30 Sep** (`scripts/aigo-promo-roughcut-v2.py` + `aigo-promo-cut2-audio.py` → Oracle `~/aigo-promo/cut2/AIGO_cut_v2.mp4`,
90.2 s, narration MiniMax #5 loudness-normalised −16 LUFS). Real screens from `captures/safe/` — private text blurred by MANUAL
pixel boxes (Gemini's auto-boxes landed on the wrong lines → rejected) or cropped; Resend id blurred (internal id). S3 = real 1080p
Playwright recording of the live /api audit on atuona.xyz (93). Real Panama stock: Causeway/Biomuseo (34734), Bocas sunset (346372).
G8b Guna Yala drone ($0.60). QR test-decoded from 4 exported frames → `https://aideazz.xyz/api`. Voice samples ≈$0.26 total.
**Spend: generation $20.62 + voices ≈$0.26 ≈ $20.90 of $30.** Still to do: Pixabay music (no vocals, her ear), 8 AM brief
(her screenshot tomorrow), delete test deal 65531490170 (her OK), final grade, 9:16 Short, thumbnail title.
