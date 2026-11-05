# EspaLuz talking inside every chat + kids classroom: plan (5 Nov 2026)

Elena: make her work in WhatsApp, Telegram, web chat and the kids classroom, where she accompanies Pere and Titi as a
senior teacher, not a nanny: a trusted older friend for children. Status: PLAN, nothing built.

## Measured facts
- Hello clips are LIVE on app.espaluz.lat (bundle `index-B3zggpMy.js`: button + 4 clips, mp4 200).
- Runway Characters, 5 clips, 74.5 s of video: wallet 389 -> 379 = 10 credits, about 8 credits a minute. Balance stayed
  379 on a later check. LIST price is 1 credit per 3 s (20 a minute), so budget on the list price until a bill confirms.
- Generation takes 20-30 s for a 9-20 s clip, so a talking reply cannot be instant.
- Web chat calls `generateVideo` automatically after replies (`ChatWithEspaluz.tsx:279`). If wired naively, every
  reply spends credits. This must change to tap-only or capped.
- Recent demand is small: WhatsApp served 8 reply videos in 8 days. Exposure is low today.

## Two kinds of clip
| | Pre-made | Made per reply |
|---|---|---|
| Used for | fixed lines: hello, lesson start, praise, goodbye | her actual answer |
| Cost | once, then free for everyone | every time |
| Speed | instant | 20-30 s after the text and voice |
| Who gets it | everyone, including the free trial | paying families, with a monthly cap |

## How it works (reuse, no new servers)
1. One door: the existing Supabase function `generate-video`. Today it returns voice + the old looping-lips clip. New
   first step: send the reply's voice to Runway with the EspaLuz avatar, return the real talking video.
2. Bots call that same door with the bot secret they already use for `generate-voice`.
3. Text and voice always go first; the talking video follows in about 25 s.
4. Falls back when credits run out or Runway fails: voice + the calm photoreal clip, never the old lips, never silence.
5. Guards: paid replies only, monthly cap per family, global floor on the wallet (stop at 50 credits), log line per clip.

## Per channel
- Web chat: "Generate Video" button makes the real clip. Remove auto-generation for this path. Free trial keeps pre-made.
- Telegram: `generate_video_with_audio` (main.py:2843) calls the door instead of building the loop. Telegram sends are free.
- WhatsApp: `create_video_with_looped_base` (espaluz_bridge.py:1786) same swap. Twilio limit 16 MB; clips are about 2 MB.
- Kids classroom: pre-made only. Pere and Titi stay the heroes and keep their own voices; she opens the lesson, encourages,
  and closes it. About 10 lines x 2 languages, about 5 s each = 100 s, about 14 credits (list price 34).
  No child's name in her lines, so no child's data goes to Runway. Clips need her in a classroom setting, not by the sea:
  one new avatar from a new still (Grok free limit resets 10 Nov).

## Her classroom role
Wording to approve. Older friend + teacher: "maestra amiga" / "your teacher and friend". She does not correct harshly, does
not replace the parent, and does not take over from Pere and Titi.

## Later: live video conversation
Runway real-time sessions: list 2 credits upfront + 2 per 6 s (20 a minute), 5 minutes max, needs LiveKit, untested, sends the
user's audio to Runway. Adults and paying tier only, never in the kids classroom without a separate privacy decision.

## Money
$0.01 per credit (NOW.md table, 28 Oct). A family with 30 talking replies of 30 s a month = 15 min = 120 credits measured,
300 at list = $1.20-$3.00 out of $11. Wallet 379 = 47 min measured, 19 min list. Wire no spend for non-paying visitors.

## Order
1. Web chat real clips on tap + wallet guard + fallback (test with Elena's own account).
2. Classroom lines, tested by Alisa; measure whether she likes it.
3. Telegram, then WhatsApp, through the same door.
4. Measure: do trial users who hear her start more chats, and does anyone subscribe? Then decide on live conversation.
