# How the `/api` hero background was made

Exploration for Elena, 12 Sep 2026. Source of truth: aideazz repo
`src/components/HeroBackdrop.tsx` (commit `15f35b6` and the 3 Sep reel commits).
This is **not** a stock gradient. It is four Runway films plus a live canvas.

## What you see on `aideazz.xyz/api`

Three stacked layers, in this order:

1. **Film reel** — orange-burst → pomegranate → kiwi → pineapple.
   Each clip is *whole fruit → cut open → technical object* in a **black void**.
   Shot in Elena's Runway account (image-to-video from Flux stills), not Pixabay.
2. **Veil** — a vertical dark gradient (`rgba(8,5,14,.62–.92)`) so type stays
   readable. The film is the room, not the subject: `saturate(0.82) brightness(0.78)`.
3. **Canvas** — a hud.ai-style field of **2px squares** on a 12px grid, gold →
   white → violet across the width. Each dot twitches on its **own phase**
   (scintillates; a shared phase reads as a screensaver). A 320px pointer
   “torch” eases toward the mouse. Three tilted prism rays drift at different
   depths. `prefers-reduced-motion` kills film **and** canvas.

Two `<video>` elements cross-dissolve for 1.2s so the reel never flash-cuts.
Poster (`orange-burst.webp`) paints first. Phones get their own 640×360 MP4s
(`*-m.mp4`); Data Saver / 2g get the poster only.

Durations on the live reel (after the “whole fruit first” heads):
orange 10.1s · pomegranate 10.1s · kiwi 12.3s · pineapple 13.1s.

## How each fruit film was actually produced

| Step | What happened | Trap already paid for |
|---|---|---|
| Still | Flux / Runway text-to-image: fruit in a **pure black void** | Grey studio wall in the still becomes grey in the video. Mask the **still** to black and regenerate. Do not mask the video — a camera push clips the fruit. |
| Motion | Runway I2V. Prompt must say `no knife, no blade, no hand, no tool` **outright**. Omitting a thing does not keep it out. | Kiwi drifted back to the rejected two-halves “eggs” shape by 1.7s. **Trim to the good frames** (0–1.6s, slowed 1.4×) instead of re-prompting. |
| Whole-then-cut | A dedicated “intact fruit rotating, no blade” head (2.4s) stream-copied onto the approved cut | If the blade is already in frame at t=0, the “whole fruit” beat never happens. |
| Encode | Desktop WebM (VP9) + MP4; mobile `*-m.mp4` | Width is the wrong gate. Cost (Data Saver / 2g) is the gate. |
| Page | `HeroBackdrop.tsx` — reel + veil + canvas. Mosaic panels were tried and **removed** (`9fc2ba3`) — Elena: ugly. | Do not put a bright fruit behind footer type. Push the film back. |

The product metaphor, written in the component: *open the site up, show what is inside* — a glass/violet shell cut to a glowing core.

## Why YouTube v14 looks nothing like this

v14 reused the **fruit names** (mango, papaya, dragon fruit, pineapple, starfruit)
and none of the **pipeline**.

| `/api` hero | v14 middle |
|---|---|
| Runway I2V from black-void Flux stills | Wikimedia Commons photos (grocery lighting) |
| Whole → cut → technical object | Already-cut still, held |
| Real motion (juice, blade, transform) | ffmpeg Ken Burns + hue glow (`juiceCut`) because Seedance 402 |
| Black void + veil + scintillating canvas | Dark grade on a stock photo |
| Film is the room behind the product | Fruit is a slide |

DeepSeek **did** write motion lines. Seedance never shot them (Replicate wallet
empty). A written motion line on a still is not a film.

## What a next cut must copy (if Elena asks)

1. New stills in a **black void**, not Commons daylight. Mask grey to black
   *before* I2V.
2. Real I2V (Runway on Elena's account, or Seedance after Replicate is topped).
   Prompt the transformation: intact fruit → cut → circuit / HUD / crawlers.
3. Keep the whole-fruit head. Trim drift; do not re-prompt a good tail.
4. Optional: overlay the same canvas language (gold–white–violet squares +
   prism rays) in ffmpeg, or screen-record the live `/api` page as the room.
5. Do not put a mosaic on it. Already rejected.
