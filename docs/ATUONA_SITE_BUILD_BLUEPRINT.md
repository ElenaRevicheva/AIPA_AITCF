# Building a site with the Atuona studio — the blueprint

**Written 3 Sep 2026, from the `/api` rebuild.** Everything here was done at least
once and verified in production. Where something failed, the failure is written
down too — those are the expensive parts.

The page: <https://aideazz.xyz/api> · source `aideazz/src/pages/LabApi.tsx`

---

## 1. What this replaces

The old page was two static gradient `<div>`s behind a form. The new one is four
films made in Elena's own Runway account, cross-dissolving behind a dot field that
lights under the cursor, a full-bleed ticker, a stats band counted from production
logs, and a logo the brand actually owns.

**The reason it is worth the bytes:** a stock gradient says nothing. A violet glass
shell cut open to a glowing core *is* the product argument — open the site up, show
what is inside — and the kicker on the page says so out loud: *"Google ranked your
page — and in 2026 that's just half of the fruit."* A metaphor nobody names is just
a nice picture.

---

## 2. The film pipeline

Four films, each the same three-beat story: **whole fruit → cut open → technical
object.** Orange, pomegranate, kiwi, pineapple.

### 2.1 The loop

```
Runway gen4_image   →  a still, 1920x1080
   ↓  (mask it if the background came out wrong — see 2.3)
Runway gen4_turbo   →  image_to_video, 5s, ratio 1280:720
   ↓
ffmpeg              →  trim to the usable window, concat/xfade, encode
   ↓
public/media/       →  desktop webm+mp4, mobile mp4, webp poster
```

Runway runs from Oracle, where the key lives:

```bash
W=$(grep "^RUNWAY_API_KEY=" .env | cut -d= -f2-)
curl -X POST https://api.dev.runwayml.com/v1/text_to_image \
  -H "Authorization: Bearer $W" -H "X-Runway-Version: 2024-11-06" \
  -H "Content-Type: application/json" -d @payload.json
```

`promptImage` for image_to_video is a **base64 data URI**, not a URL. Sending a URL
means waiting for a deploy first, and a freshly-pushed asset can return the SPA
fallback (see §6.1) — the model then animates an HTML error page.

### 2.2 Prompting: name the wrong output, not just the right one

The single most expensive lesson of the build.

The pomegranate prompt asked for *"a blade sweeps down and cleaves it open, the cut
face revealing the flesh."* Every word was honoured. The model rendered a separate
ring sitting **next to an intact pineapple** — "cut face" was satisfied without
anything being cut. Four rounds of better positive description did not fix it.

What fixed it, first try:

> "The blade drives THROUGH the body of the fruit and it splits lengthwise into two
> halves that fall apart. There is only ONE pineapple in frame and it is the one
> being split; **no separate slice, no ring, no piece sitting beside it, nothing
> already cut.**"

**Rule: enumerate the failure you keep getting.** Positive prompts describe one good
output; negative constraints close off the bad readings. Underspecification is not
the model being wrong — it is the instruction admitting a reading you did not mean.

Other prompts that only worked once the failure was named:

| Kept getting | What fixed it |
|---|---|
| two round halves, "like eggs" | `Not two fruits, not symmetrical, not centred, not oval like an egg` |
| crimson juice reading as blood | `Absolutely no liquid, no juice, no splash, no streams, no dripping, no red fluid` — solid seeds instead |
| knife appearing in a "whole fruit" shot | `NOTHING touches it: no knife, no blade, no hand, no tool anywhere in frame` |

### 2.3 Backgrounds drift — fix the input, not the output

Repeatedly the video came back on a grey studio wall. The instinct is to mask the
video. **The defect was upstream:** the *source still* was already grey, because
gen4_image ignored "pure black void", and image_to_video faithfully inherited it.

Masking the still and regenerating produced pure black on the first try.

**Two masking techniques, and when each is right:**

```bash
# SHAPE — an elliptical alpha ramp. For subjects with pale centres.
M="clip((1-(pow((X-957)/500,2)+pow((Y-557)/485,2)))*10,0,1)"
ffmpeg -i still.png -vf "geq=r='r(X,Y)*$M':g='g(X,Y)*$M':b='b(X,Y)*$M'" out.png

# IDENTITY — a saturation gate. For coloured subjects on neutral ground.
MX="max(max(r(X,Y),g(X,Y)),b(X,Y))"; MN="min(min(r(X,Y),g(X,Y)),b(X,Y))"
S="clip((($MX)-($MN))/30,0,1)"
```

An ellipse cuts by **where a pixel is**, so background *inside* the ellipse survives
and gets lit into a visible halo. A saturation gate cuts by **what a pixel is** — a
wall is grey (r≈g≈b), a pineapple is gold — and removes it wherever it falls,
including its cast shadow.

**But saturation is wrong for a subject with a near-white core** (the pineapple
slice), which it punches a hole through. Shape for pale centres; identity for
uniformly coloured subjects on neutral ground.

### 2.4 Runway drifts within a single clip — trim, don't re-prompt

The kiwi is a whole fruit at 1.0s and two egg-like halves by 1.7s. The fix was not a
better prompt; it was **using 0–1.6s and throwing the rest away.** Always extract
frames across the clip before assembling:

```bash
for t in 0.4 1.2 2.0 2.8 3.6 4.6; do
  ffmpeg -ss $t -i clip.mp4 -frames:v 1 -vf scale=250:-1 f_$t.jpg
done
ffmpeg -i f_0.4.jpg -i f_1.2.jpg ... -filter_complex hstack=inputs=6 strip.jpg
```

One strip image shows the whole clip's arc at a glance. This is how every drift was
caught.

### 2.5 Assembly: stream-copy what is already approved

Once a cut is signed off, **never re-encode it.** Encode new heads with *identical*
parameters and concat with `-c copy`:

```bash
ENC="-an -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -profile:v high -level 4.0"
VF="scale=1280:720:flags=lanczos,unsharp=5:5:0.4,fps=24"
ffmpeg -i new_head.mp4 -t 2.4 -vf "$VF" $ENC head.mp4
printf "file 'head.mp4'\nfile 'approved.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy final.mp4   # zero generation loss
```

If `-c copy` fails the parameters differ; fix the parameters rather than falling
back to re-encoding.

**Sharpness came from a single pass.** An early version encoded an intermediate at
CRF 24 and the final at CRF 30 — visibly soft. Always assemble from the Runway
originals in one pass.

### 2.6 Encoding targets, measured

| | desktop | mobile |
|---|---|---|
| size | 1280×720 | 640×360 |
| codec | **VP9** webm, CRF 38 | **h264** mp4, CRF 33 |
| orange | 2505 KB | 298 KB |
| pomegranate | 3199 KB | 376 KB |
| kiwi | 612 KB | 100 KB |
| pineapple | 1438 KB | 243 KB |

**The codec choice inverts between them.** At high bitrate VP9 beats x264 by ~17%
(2505 vs 3002 KB). At low bitrate x264 wins (298 vs 473 KB) *and* it is the only
thing iOS Safari plays. Same decision, opposite answer, because the constraint
changed. VP9's CRF scale is not x264's: **CRF 38 ≈ x264 CRF 24.**

---

## 3. The backdrop component

`aideazz/src/components/HeroBackdrop.tsx`

**Poster-first.** The `.webp` paints immediately; the film fades in only on
`canplay`. If it never loads — slow network, missing file, codec refusal — the page
looks exactly as it did before the component existed.

**Two `<video>` elements, not one.** Swapping `src` on a single element gives a hard
cut and a black flash while the next file buffers. A and B alternate: while one
plays the other preloads the next, and 1.2s before the end they cross-dissolve on
opacity. The viewer sees one continuous piece of footage.

**Gate on cost, not on width.** The first version refused video below 860px. A narrow
screen is not a metered connection, and the rule left every phone — most of them on
wifi — looking at a still. Gate on `navigator.connection.saveData` and
`effectiveType`, and make the mobile file cheap enough that playing it is the right
default.

**The dot field.** Small squares on a tight grid (GAP 12, 2px), massed into a soft
radial blob. Each dot twitches on its own pseudo-random phase — a shared phase
pulses in visible waves and reads as a screensaver. Ambient sits at 0.13 and a
320px halo follows the pointer, easing 12% per frame so a fast mouse drags the light
behind it. On `(hover: none)` there is no pointer, so ambient carries it alone at
0.34.

---

## 4. Brand: the gradient, the ticker, the mark

### 4.1 Read the reference's computed style, don't eyeball it

Four rounds of hand-tuning a gradient toward "like the podcast" failed. One DOM
query against the real site settled it:

```js
getComputedStyle(el).backgroundImage   // on podcast.aideazz.xyz
getComputedStyle(el).animationName
```

The difference was not colour. **Her keyframe is one-way** —
`100% { background-position: 220% center }` — while mine went `0% → 100% → 0%`.
A gradient that runs out and comes back reads as a **pulse**; one that keeps
travelling reads as **flow**.

Final recipe (two colours only, because a third stop is what reads as "mixed"):

```css
@keyframes az-flow { 100% { background-position: 220% center; } }
.az-flow {
  background-image: linear-gradient(115deg in oklab,#7c3aed,#facc15 50%,#7c3aed);
  background-size: 220%;
  background-clip: text; color: transparent;
  animation: az-flow 5s linear infinite;
}
```

Written **palindromic** (violet → yellow → violet) so the tile joins violet-to-violet
and the loop has no seam. **`in oklab`** keeps the crossing clean instead of sagging
through muddy pink, which sRGB interpolation does between those two hues.

`background-size` decides whether a sweep is visible at all: at 400% only a sliver
of the ramp lands on a two-letter word, so it reads as flat colour slowly changing.
**220% is what makes it flow.**

### 4.2 The ticker

"Running along all the screen" is not something a centred badge can do however its
colours are animated — the *colour* was moving while the *element* stood still.

```jsx
<div className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden">
  <div className="az-ticker flex w-max">{/* the list rendered TWICE */}</div>
</div>
```
```css
@keyframes az-ticker { to { transform: translateX(-50%); } }
```

The list is rendered **twice** and the animation travels **exactly −50%**: at that
offset copy two sits precisely where copy one began. Any other distance shows a jump
once per cycle. Check `document.scrollWidth === clientWidth` afterwards — `w-screen`
is 100vw and can overflow by the scrollbar width.

### 4.3 The logo: extract, don't redraw

**Eight rounds of hand-written SVG never matched the brand mark and were never going
to** — reading bezier coordinates off a screenshot by eye. Each round refined a
different wrong thing: coordinates, weight, stroke-vs-fill, chevron-vs-triangle.

The asset already existed. Extract it:

```bash
# alpha = luminance: right for a GLOWING mark on black
A="max(max(r(X,Y)\,g(X,Y))\,b(X,Y))"
ffmpeg -i source.jpg -vf "crop=216:248:182:1026,format=rgba,\
geq=r='r(X\,Y)':g='g(X\,Y)':b='b(X\,Y)':a='$A'" mark.png
```

A **colour key** would cut a hard silhouette straight through the glow. **Luminance
as alpha** keeps the falloff, so soft edges stay soft.

Then, to keep the colour animated — an `<img>` is fixed pixels and cannot animate its
own fill — use the PNG as a **mask** over the same moving gradient:

```css
.az-mask {
  aspect-ratio: 176 / 202;
  background-image: linear-gradient(115deg in oklab,#7c3aed,#facc15 50%,#7c3aed);
  background-size: 220%;
  animation: az-flow 5s linear infinite;
  -webkit-mask-image: url(/media/az-mark.png); mask-image: url(/media/az-mark.png);
  -webkit-mask-size: contain; mask-size: contain;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
}
```

The trade: the mask discards the logo's baked-in bevel. Shape, proportions and glow
edges survive, and the colour is live rather than frozen.

---

## 5. Numbers on the page must come from logs

Repo rule, and it is not negotiable: **if a number cannot be shown from production,
it does not go on the page.**

The API writes one line per audit. Count *that*:

```bash
ssh oracle-cto-aipa 'cd ~/.pm2/logs
  grep -c "\[visibility-lead\]" cto-aipa-out-9.log
  grep -ho "url=[^ ]*" cto-aipa-out-9.log | sed "s|url=https\?://||;s|/.*||" | sort -u | wc -l
  grep -ho "score=[0-9]*" cto-aipa-out-9.log | sed "s/score=//" | sort -n | \
    awk "{a[NR]=\$1;s+=\$1} END {printf \"n=%d mean=%.1f median=%d\n\",NR,s/NR,a[int((NR+1)/2)]}"'
```

Before publishing, **prove the window**: check the other pm2 logs hold zero matching
lines and that the log predates the feature, or the count is a fragment presented as
a total.

**Round DOWN and add `+`.** A running total only grows, so a floor goes stale in the
safe direction — `420+` was true at 428 and stays true at 4,280. Printing `428`
exactly makes the page wrong by tomorrow. Distribution statistics (median) are
printed exactly, because they are not running totals.

**Name the infrastructure.** "Production logs" is a phrase anyone can type. *"Counted
from production logs on Oracle Cloud"* is something a buyer can ask to see.

**The counter starts AT the number, not at zero.** If `IntersectionObserver` never
fires or `requestAnimationFrame` is parked in a backgrounded tab, the visitor still
reads 420 and merely does not see it count. A credibility band that can render
"0 audits run" is worse than one that never animates.

---

## 6. Verification — the part that actually cost the day

### 6.1 The soft 404

A missing asset on this host returns **HTTP 200 with the SPA `index.html`**, labelled
with the content-type its extension implies. `az-mark.png` returned
`200 image/png` — at **40,238 bytes**, which is index.html.

**Check the size or the content, never the status.** This burned me three times:
once feeding a URL to Runway, once "verifying" a deploy, once on a `<Link>` to a
static file (a react-router `<Link>` to `policies.html` would answer with the SPA).

### 6.2 A passing build is not a passing typecheck

`npm run build` uses esbuild, which strips TypeScript **without checking it**. A
deleted component is not a build error. Run `tsc --noEmit` separately.

### 6.3 `$?` after a pipeline is the pipeline's LAST command

```bash
npx tsc --noEmit | head -2; echo "exit $?"    # ← reports head's status. Always 0.
```

This printed "typecheck exit 0" for hours regardless of what tsc found. **A green
check that cannot go red is worse than no check**, because it buys silence.

```bash
npx tsc --noEmit -p tsconfig.json > /tmp/t.txt 2>&1; TS=$?   # capture FIRST
```

### 6.4 Never edit source by byte range

**Four times in one day**, replacing `d[index(A):index(B)]` destroyed something that
happened to live between the landmarks — `ScoreRing` twice, five interfaces, and
`BRAND_FLOW_CSS`. One of those blanked the live page for anyone opening an audit
link, because `ScoreRing` only instantiates once a result exists: the page looks
perfect to anyone who does not run an audit.

```python
assert d.count(old) == 1      # exact literal, asserted unique
d = d.replace(old, new, 1)
print(d.count('<div'), d.count('</div>'))   # tag balance after
```

### 6.5 Verify the artifact, not a proxy for it

- Comparing a **locally built hash** to production never matches — different build
  environments produce different content hashes. Fetch the deployed bundle and grep
  for the change.
- A grep marker must be **unique to the change**. `"Oracle Cloud"` matched 15 times
  from other pages and reported a deploy that had not happened.
- A leftover **i18n string** in `en.json` will match long after the JSX stopped
  rendering it. Delete orphaned keys.
- The preview pane does not paint: `requestAnimationFrame`, `IntersectionObserver`
  and CSS animation timelines are all parked. `playState` says `"running"` while
  `currentTime` never advances. **Verify wiring there; verify motion in a real
  browser, and say which you did.**

### 6.6 The audit tool cannot be tested from localhost

`API_BASE` routes localhost to `http://localhost:8098`. The live page or a direct
`curl` are the only ways to prove the audit works:

```bash
curl -X POST https://webhook.aideazz.xyz/cto/v1/visibility \
  -H "Content-Type: application/json" -H "X-API-Key: aidz_demo_visibility_2026" \
  -d '{"url":"https://stripe.com"}'
```

---

## 7. The meta-lesson

Almost every expensive hour went the same way: **several rounds of refinement that
did not converge, because the thing being refined was the wrong thing.**

| Refining | Should have changed |
|---|---|
| gradient colours | the **middle stop** — violet and yellow were never the problem |
| the pill's colours | the **element** — a centred badge cannot run across a screen |
| bezier coordinates | the **primitive** — stroke vs fill vs "use the real asset" |
| the video output | the **input still** |
| prompt adjectives | **naming the wrong output** |
| status codes | the **response body** |

**When three attempts at the same dimension all fail, stop tuning and change the
dimension.**

---

## 8. Checklist for the next build

```
[ ] Films: strip-check every clip before assembling; trim drift, don't re-prompt
[ ] Prompts: enumerate the wrong output explicitly
[ ] Backgrounds: fix the source still, not the video
[ ] Assembly: single pass; stream-copy anything already approved
[ ] Mobile: its own encode, gated on connection cost
[ ] Reference styling: read computed values off the live reference
[ ] Logo: extract the real asset; mask it if the colour must move
[ ] Numbers: from logs, window proven, rounded down, infrastructure named
[ ] Edits: exact literal + assert count == 1 + tag balance
[ ] Checks: tsc separately, exit status captured before any pipe
[ ] Deploy: fetch the artifact, grep a marker unique to the change, check the SIZE
[ ] Audit path: test /api?url= on production — it is the link outreach sends
```
