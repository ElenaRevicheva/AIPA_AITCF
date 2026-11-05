# Kids classroom — production log review, 5 Nov 2026

Source: Supabase `learning_sessions` + function logs, read 23:05 UTC. Five sittings, 09:54–16:24 Panama, 38 turns.
The child's own words are deliberately not quoted here (public repo). No code or settings were changed by this review.

## Reliability
- `espaluz-chat`: every lesson turn answered. One 500 at 16:27:47 UTC (209 ms), 72 minutes after the morning's last turn and
  outside any lesson: cause not checked.
- Listening: Groq Whisper worked on every clip.

## Voices — the heroes changed voice during the day
| Voice | Lines | When (UTC) |
|---|---|---|
| MiniMax (real Pere/Titi voices, Replicate) | 22 | until 15:13, then `Replicate 402 Insufficient credit` |
| Gemini free voices | 55 | 15:13 on; 10 requests/day per model, repeatedly `429` |
| OpenAI Nova (one adult voice for both heroes) | 11 | from 16:10, when Gemini is out |

Fix is money, not code: Replicate top-up (replicate.com/account/billing). Elena's call.

## Waiting time
Measured on 4 afternoon turns, end of transcription -> first voice line finished: **13–23 s**.
Brain 6–10 s (each turn first fails Claude, then often waits out Gemini's 6 s timeout, then Groq 429, then Grok);
voice 4–13 s for the first line, up to 18 s per line when Gemini is slow.

## Brain — who paid
- `answered by grok` 35 times vs `groq` 5 today: paid xAI credit (auto top-up was ON on 31 Oct). Groq's strong model hit its daily limit.
- `claude` is first in `callChain` and fails every turn with `credit balance is too low`. Fast, but against the free-first order rule.

## Curriculum bug (code)
`espaluz-chat/index.ts:1312`: `classUnit = floor(class starts / 2) % 12`. **Every press of "start class" counts**, including
re-entries seconds apart (2 starts 16 s apart at 09:54). 9 starts today moved her Unit 11 -> 12 -> wrapped to 1 -> 2.
Units are meant to be two real classes each; a morning of tapping can skip a whole unit, and Unit 12 wraps with no end-of-course moment.

## Lesson quality
Good signals: she chose topics herself, invented her own characters, spoke unprompted full English sentences, asked a hero to
read the syllables, and finished Titi's rhythm game to level 5. Mother's speech inside a clip was recognised once ("thank you, mom").

Problems:
1. **22 of 38 replies contain "Entiendo que..."**: the recast rule has become a verbal tic, and it echoes nonsense faithfully.
2. **She asked for a game in 5 turns and mostly got talk or a question back.** At 16:22 the question bounced to her ("how do you want to play?").
   A concrete request (louder music at 16:24) was not acted on either.
3. **Same opener all day:** 11 of 38 replies mention "your toy" and 7 use "who is right": the memory game ran at nearly every class start, each time with different invented details.
4. **Adult speech treated as the child and answered:** at 11:12 Panama her mother's dictation to another tool was transcribed and answered as Alisa's. Risk: it enters the memory card. Filter for adult work talk not checked.
5. Pere always speaks first (0 of 38 replies opened with Titi).

## Suggested order (nothing done yet)
1. Replicate credit (Elena): brings the real voices back and removes most of the wait.
2. Unit counter: count a class only if it had real child turns, at most once per sitting or day; do not advance on re-entry.
3. Kids prompt: vary the recast opener, start a game immediately when she asks, run the toy memory game at most once a day.
4. Drop Claude from the front of the chain while its credit is out; skip Gemini for a while after a timeout.
