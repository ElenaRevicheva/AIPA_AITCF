# Talking avatar: what competitors show + EspaLuz free 3D prototype (5 Nov 2026)

Elena: "they are positioned like real talk, real conversation — dig what our competitors have"; "dig deeper into 3D,
a really talking head, I have no money"; "she must look like the EspaLuz on the website: light blonde, a little grey".

## UPDATE 5 Nov ~22:20 UTC: the route changed
Runway Characters (`gwm1_avatars`) makes a photoreal talking video from one photo plus our own audio. Tested with EspaLuz's
website photo and the free Edge voice: same face, real lip shapes, 24 s to generate. The earlier claim below and in chat that
a real-person talking face needs our own GPU money was too broad: this is pay-per-second at about 1 credit per 3 s (list price).
3D v1 and photo projection were rejected by Elena as far from EspaLuz. Script: `scripts/espaluz-avatar/rw_avatar.py`.

## Competitors (web research 5 Nov 2026 — review sites + app listings; internals are NOT published by any of them)

| App | Face on screen while talking | How (as far as public sources say) | Price |
|---|---|---|---|
| **TalkPal** | **None.** Call Mode is audio-only; 9 modes (chat, call, roleplay, characters, debate…) | GPT tutor + voice | $19.99/mo, $119.99/yr |
| **Replika** | **3D avatar** (customisable, full body) that animates while it talks; video call in beta for paid tiers per some reviews | 3D real-time avatar; reviewers say **lip sync is its weakest part** ("feels odd/awkward") | ~$19.99/mo, $69.99/yr |
| **Praktika** | **3D animated tutor characters** at the top of every chat — the closest "video call with an AI tutor" | 3D characters with lip sync + expressions; heavier on bandwidth | subscription |
| **Duolingo Max — Video Call with Lily** | **2D cartoon character** (Lily) talking with mouth shapes | Rive animation: a state machine blends ~10+ mouth shapes (visemes) driven by the speech; file < 1 MB | $168/yr tier |
| **Loora** | Building **real-time video avatars** (own job post: "video generation models for real-time speaking avatars") | GPU video generation — the expensive path | ~$15–20/mo |
| Langua, Speak | No clear avatar video found | voice/chat drills | — |

**What this means for EspaLuz:** the "real conversation" leaders use exactly two cheap-at-runtime mechanisms —
**a 3D character with mouth shapes (Replika, Praktika)** or **a 2D character with mouth shapes (Duolingo)**. Only Loora
pays for generated video. TalkPal, the closest positioning, shows no face at all. A talking EspaLuz would put us ahead
of TalkPal and level with Replika/Praktika — at $0 runtime cost, because the browser does the animation.

## The free 3D prototype (built and verified today)

- Private page: https://claude.ai/artifact/W7PXbDA1zwb5TbbEK1wWFE (owner-only).
- **TalkingHead** (MIT, browser, Three.js) + our **free Spanish voice** (Microsoft Edge `es-MX-DaliaNeural` via
  `edge-tts`, which also returns word timings) → 220 mouth-shape events for 28 words, played in time with the voice.
- Verified in Elena's real Chrome: mouth closed → open with teeth across frames, head moves, blinks.
- Look: TalkingHead's **sample body (Avaturn demo, non-commercial licence)** recoloured toward EspaLuz — hair tint
  sampled from `hero-web-poster.jpg` (≈ RGB 215,192,171 light ash-blonde), teal top. Face is NOT hers yet.
- Spanish mouth shapes use the Brazilian-Portuguese lip-sync module (closest built-in); a small Spanish module is easy
  (Spanish spelling ≈ sounds).

## Path to a real EspaLuz in 3D (all $0)

1. **Her face/body** — two free routes:
   - **Avaturn** (from a photo; T2 avatars are TalkingHead-ready): upload the EspaLuz portrait, pick light blonde hair
     and a teal hoodie. Free for non-commercial; **commercial use = notify Avaturn + their terms** (must check before
     the public site). Needs an account — Elena signs up herself (Claude may not create accounts).
   - **Blender + MPFB** (free, CC0/CC-BY assets, commercial OK): the TalkingHead repo ships an add-on + "Visemes 02"
     and "Faceunits 01" packs. More hand work, game-like look; needs Blender installed on the laptop.
2. **Speech:** web chat sends the reply text → free Edge voice with word timings (needs a tiny server step, e.g. on
   Oracle beside the bots, which already use Edge) → TalkingHead speaks it. Fallback for voices without timings:
   HeadAudio (MIT, detects mouth shapes from the audio itself, ~14 kB model; trained on English, so Spanish less exact).
3. **Size/speed:** avatar files are 3–14 MB; compress (Draco/Meshopt) and load only when the chat opens. Weak phones
   get the still picture.
4. **Pere & Titi:** the Duolingo way (2D, Rive, mouth-shape state machine) fits cartoon heroes better than 3D.

## Not decided (Elena's calls)
- Avaturn (fast, closest to her photo, licence to clear) vs MPFB (fully free/commercial, more work, less photoreal).
- Whether the 3D EspaLuz replaces the photoreal Grok loops on the landing or only lives inside the chat.
