# ATUONA — film #9 — v12, REPUBLISHED (11 Oct 2026): a pause before every line · Mila's blue sand moves again

Elena: **"there is absolutely no pause between each stanza reading - make a little pause - but do not touch video length, except
this one with Mila and sand - make it not very long like it was but not so short as it is now because blue sand flowing should be
visible as a process - now it looks like an image and sure, make it glitchy like our current approach. after that republish the
film. Arearea stays separate task"** — and: "make sure you are not shortening or wiping other shots compiled".

## The pauses (shot lengths untouched)

- Measured in v10 (`voice_gaps.py`): 11 of 22 junctions had ~0.3 s between one line's end and the next line's start.
- `plan_v12_pauses.py`: every shot keeps its v10 length (pinned as `edit`, built with `FILM9_TAIL=0`); per junction it starts the
  next line later where its shot has room, starts the previous line earlier where that keeps its own pause, and only then plays
  a line a little faster (atempo, pitch kept). Result: **every line has ≥ 0.96 s of silence before the next** (from the actual mix
  delays); three lines play faster: 2 ×1.03, 13 ×1.11, 10b ×1.14 (same verified takes; whisper re-check 3/3).
- The typing follows the same line starts (`it.lead` now feeds the text, the mix and the timeline record).

## Mila and the blue sand (M4)

- Was a 0.9 s flash since the v2 screenshot edit. Now the whole `vM4` clip at ×1.2 = **6.0 s**, flowing glitch, no line.

## Nothing else moved

- `check_v12.py`: **23/23 shots exactly as long as in v10**; M4 6 s moving; the flash gone; every moving shot glitchy; pauses ≥ 0.96 s.
- 13 shots reused byte-identical from v10 (`cmp`); 10 re-rendered only for the new line timing; plus M4.
- `typed_check.py` (23/23 true number + stanza) and `vault_check.py` (live vault, all match) re-run on v12.

## Published

- Studio file replaced in place: `atuona-2026-10-10T23-24-23.mp4` = v12 1080p master, 161.0 s (2:41), 266.1 MB, ~13.2 Mbit/s, md5
  `d50987d386dedc0714e469a7a5ec235a` (laptop = Oracle, HTTP 200, exact length). Rollback copies on the laptop: v10
  `render_v10\work\final.mp4` (md5 `0633…`), v7 `render_v7\work\final.mp4`.
- Film page running time 2:41 (atuona `77a46c81`). Telegram: the 720p phone copy (`ok`).
