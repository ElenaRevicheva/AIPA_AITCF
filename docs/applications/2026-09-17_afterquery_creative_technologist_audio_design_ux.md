# AfterQuery — Creative Technologist (Audio / Design / UX) — relevant experience

Written 17 Sep 2026. The focus is Atuona AI Film Studio. Every fact below was checked
that day against the live site or the source code. Nothing is estimated.

- Live studio: https://atuona.xyz/aifilmstudio/ (returned 200 on 17 Sep; 6 films,
  published 20 May to 4 Jul 2026)
- Code: `src/atuona-film-compiler.ts`, `src/atuona-creative-ai.ts`,
  `scripts/atuona-film-final.mjs`, `scripts/atuona-montage.mjs`

---

## SHORT VERSION (for a small "relevant experience" box)

I built and run Atuona AI Film Studio, a live pipeline that turns my poems into short
films: an LLM writes the shot, Flux 2 Pro makes the frame, Luma Ray 3.2 or Kling
animates it, and an ffmpeg pipeline I wrote adds the voice, music, typography and
transitions. Six films are live at atuona.xyz/aifilmstudio. Most of the work was
judgment, not generation: deciding why a cut felt jumpy, why the voice ran ahead of
the words on screen, and why the gallery looked broken on first load. Then I fixed
each one and wrote down the rule. That is the same judgment an AI needs to learn about
audio, design and UX.

---

## FULL VERSION

**Creator and Creative Technologist, Atuona AI Film Studio** (AIdeazz, 2026, live)
https://atuona.xyz/aifilmstudio/

A pipeline that turns poems into films. I write the poems in Russian. The films are in
English only: the text is translated and then voiced. Pipeline: an LLM writes a
cinematic prompt from the poem, **Flux 2 Pro** makes the key frame, **Luma Ray 3.2**
turns it into video (**Kling v2.1** for arthouse shots, **Runway Gen-4.5** as the
fallback), and a Luma "Director's Cut" pass restyles the clip. A compiler I wrote then
assembles the film. Six films are published.

### Audio
- **Mix and loudness.** The music bed sits at 30% volume and is **sidechain-ducked**
  under the voice (threshold 0.02, ratio 10), so it drops whenever a line is spoken.
  The finished mix is normalized to **−16 LUFS integrated with a −1.5 dBTP true-peak
  ceiling**, which leaves the voice about 6 dB above the music.
- **Voice sync.** At first the voiceover ran as one continuous track, and it drifted
  ahead of the text on screen. Fix: each stanza's voice is **locked to its own clip**.
  It starts 0.7 s in, and the clip lasts long enough to hold the line plus a 1.9 s
  pause.
- **Pacing as meaning.** The voice is set to 0.9× speed with a real pause after each
  line. Sixteen stanzas could not breathe in 87 seconds, so the film was allowed to run
  about 1:50 instead of rushing.
- **Choosing music by mood.** Tracks were rejected when their mood fought the poem: a
  "calm chillout" track read as cheerful and an "emotional" one as too sweet. "Light In
  The Void (Dark Cinematic Ambient)" was the one that fit.

### Design and motion
- **Transitions.** Crossfades are 1.3 s; 0.8 s felt cut rather than dissolved. The poem
  text fades out in the last second of each clip, so two stanzas never overlap during a
  dissolve.
- **Stretching a clip without it looking broken.** A frozen last frame held an ugly
  still, such as an open mouth. So short clips are extended with **slow motion** and
  keep moving all the way into the dissolve.
- **Type system.** Poem text is set in a **serif** inside a bottom band with a
  half-transparent box. It started in the center, over the image. Title cards use
  **monospace, uppercase, letter-spaced** type to match the website header, so the film
  and the site read as one brand. The intro opens on a darkened frame from the first
  shot, not on black.

### UX
- **The poster-frame bug.** A web video player shows frame 0 as its thumbnail. The
  intro faded in from black, so every film in the gallery looked black and broken
  before it played. The fix: the intro now starts on a full title card, and the films
  that were already rendered were patched too. This one can't be found by reading the
  code, only by looking at the page as a visitor does.
- **Watching on a phone.** Films stream with HTTP Range support, so a phone can skip
  ahead without downloading the whole file. Every film also gets a permanent watch
  link, because Telegram will not send a video over 50 MB and some films are 71 MB.
- **Honest labels.** When the chosen video model fails and another one takes over, the
  clip is labeled with the model that **actually** produced it, not the one that was
  requested.
- **Readable titles.** Films are named after their first poem, not a timestamp.
  Markdown symbols are removed from titles so no stray asterisks appear.

### Why this fits AI training work
Each fix above is a mistake an AI model makes with confidence: sequencing the voice
separately and letting it drift, holding a frozen frame, fading in from black without
knowing the thumbnail is frame 0, picking music by its title instead of its mood. I
have made each call on a real, published product, and I can write down **why** the
better version is better. That is what a rubric or a preference judgment needs.

---

## DO NOT CLAIM (checked 17 Sep, not supported)
- **Veo 3.1.** It is wired into the code, but a live Veo render was never confirmed.
  Leave it out.
- **Formal audio-engineering or design training.** The experience is hands-on, on a
  shipped product. Say it that way.
- **Viewer or audience numbers.** None are measured.

## Words to have ready if they ask (plain English)
- **Sidechain ducking:** the music automatically gets quieter whenever the voice speaks.
- **LUFS:** a unit for how loud a track *feels* overall. −16 is a common target for web
  and podcasts.
- **True peak (dBTP):** the loudest instant. Capping it at −1.5 prevents distortion on
  phones.
- **A/V sync drift:** sound and picture slowly drift apart.
- **Poster frame:** the still image a video player shows before you press play.
- **HTTP Range request:** lets a player fetch just the part of the file you skipped to.

## Interview line (true, with real numbers)
> "In my film studio the voiceover kept running ahead of the words on screen. The fix
> wasn't a better model. It was locking each stanza's voice to its own clip and giving
> every line almost two seconds to breathe, even though the film grew from 87 seconds
> to about 1:50. The same kind of judgment caught a gallery where every film looked
> broken: the player's thumbnail is frame zero, and my intro faded in from black."
