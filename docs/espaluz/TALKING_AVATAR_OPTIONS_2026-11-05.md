# EspaLuz talking avatar — free options (5 Nov 2026)

Elena: "we don't have money for a speaking avatar with lips moving as speech flows; the existing EspaLuz looping lips
(WhatsApp, Telegram, web chat) is ugly. Find another solution." Rule: free only, nothing paid wired.

## What exists today (read from the code)
- **Landing (other Claude agent, ascent `5cbf8af`):** 4 photorealistic Grok Imagine clips (web / WhatsApp / Telegram /
  kids), 10 s, silent, seamless loop, poster first, `HeroClip.tsx`. They smile, breathe, wave — they do not talk.
- **Web chat "video":** `generate-video` returns only AUDIO (free Google translate voice) + one fixed
  `avatar.mp4` (old cartoon-ish EspaLuz with a mouth that opens and closes on a loop) that the page plays under it.
  **Why it looks bad:** the mouth loops at its own speed, keeps moving in pauses and keeps going after the voice ends —
  the eye sees the mismatch at once.
- **WhatsApp / Telegram:** the bots glue the same kind of looping clip to the audio into one video file.

## Why not real lip-sync
- Real lip-sync models (Wav2Lip, SadTalker, MuseTalk, LivePortrait) need a GPU per clip. Oracle has none (and the
  rule is no heavy renders there); Replicate/HeyGen/D-ID cost money; free Hugging Face demo spaces queue for minutes
  and are not allowed for production use at our scale. Not an option today.

## Free options, best first

### A. Speech-gated talking loop (recommended first) — $0
1. One extra Grok Imagine clip of the SAME photoreal EspaLuz **talking** (natural mouth movement, small nods and hand
   gestures, no sound), made from the same still as `hero-web` — the way the other agent made the four loops.
2. In the browser, the page listens to the voice it is playing (Web Audio *AnalyserNode*, loudness only, nothing sent
   anywhere). **Voice loud → the talking clip plays. Voice silent (a pause, a full stop, the end) → it switches to
   the idle loop.** The mouth now starts and stops exactly with the voice and rests in every pause.
3. Same trick for WhatsApp/Telegram later: `ffmpeg silencedetect` on the reply audio → talking segments while she
   speaks, idle segments in pauses, one file. Light work (the bots already build a video), laptop-tested first.
- Honest limit: the lips follow the **rhythm** of speech, not each sound. At chat size this reads as "she is talking";
  on a big close-up a careful eye can tell.

### B. Mouth shapes on the still ("PNGtuber" method) — $0, more work, closer sync
- 4–5 pictures of the same still that differ ONLY in the mouth (closed, slightly open, open "a", round "o", smile "e"),
  cut to the mouth area so nothing else shifts. The page picks the picture from the voice in real time (loudness +
  brightness of the sound), adds blinks and a slow breathing movement. True moment-by-moment sync, tiny files, works
  with every voice we have. Risk: AI-edited mouths must line up pixel-perfect; needs careful compositing.

### C. 3D talking head (TalkingHead-style, browser, real visemes) — $0, different look
- Real lip shapes in the browser from any voice, but the avatar becomes 3D/stylised, not the photoreal EspaLuz on
  the landing. Brand change — only if Elena wants that look.

## Proposed order (waiting for Elena's go)
1. A in the web chat: one Grok Imagine talking clip (made in Elena's Chrome, free plan) + speech gating in
   `ChatWithEspaluz.tsx`; landing hero can "say hello" the same way. Needs a Lovable Publish.
2. If A pleases her: same for Pere & Titi in the classroom, then the WhatsApp/Telegram video files.
3. B only if A's rhythm-only sync is not good enough.
