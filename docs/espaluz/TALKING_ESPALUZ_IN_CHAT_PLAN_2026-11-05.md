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

## Elena's decisions, later on 5 Nov
- Non-paying users: pre-made clips only. Classroom role: "mentora amiga". She opens and closes the session, appears from time to
  time to suggest a feature, and calms things and reconnects the child with Pere and Titi. Never noisy.
- Elena: the old loop after every reply is "the past season".

## Proposed paid-user flow (not yet approved)
Every reply: text at once, voice note right after, as today. The old looping video stops completely.
Her talking video only at moments that earn it: first reply of the day, when the bot detects a low mood, or when the user asks.
Asking: web = existing "Generate Video" button; Telegram = button under the reply (the bot uses none today, new small work);
WhatsApp = user types "video" (no buttons in the bridge today). Monthly cap per family.

## Proposed classroom rules (not yet approved)
Runs in the page from about 12 pre-made clips x 2 languages (about 120 s: 16 credits measured, 40 at list price). No live generation.
- Open: start of lesson. Close: end of lesson. Middle: at most one appearance per lesson.
- Suggestion: only after several turns, only for a feature not yet used in this lesson, never while the child or a hero is speaking.
- Features found in `Classroom.tsx`: conversation, class with tracing, painting, showing a photo, activities (music, monkey, dice).
  Vibe coding NOT found in that file on 5 Nov: confirm where it lives before she promises it.
- Reconnect: child's words show upset (extends the existing `KIDS_QUIET` rule). She says one calm line, then Pere and Titi return gently.
- Real distress is not handled by a clip: it goes into the parent report. Wording for this needs Elena's review.

## Order
1. Web chat real clips on tap + wallet guard + fallback (test with Elena's own account).
2. Classroom lines, tested by Alisa; measure whether she likes it.
3. Telegram, then WhatsApp, through the same door.
4. Measure: do trial users who hear her start more chats, and does anyone subscribe? Then decide on live conversation.

## Classroom mentora amiga: proposal of 6 Nov 2026 (lines await Elena's OK; nothing wired yet)
Test clip made: new avatar `249a879e-6e98-4474-866a-bffbd69fe6c3` from a Grok classroom still of her face, 11.5 s, 24 s to generate, wallet 377 -> 375.
Voice under test: `en-US-AvaMultilingualNeural`, one voice for both languages, each clip Spanish then English like Pere and Titi.
"Program Titi" (`TracePad.tsx`, mode `program`) is the vibe-coding feature the earlier note could not find.

| When | Spanish | English |
|---|---|---|
| Very first lesson | ¡Hola! Soy EspaLuz, tu amiga mayor. Pere y Titi te están esperando. | Hi! I'm EspaLuz, your big friend. Pere and Titi are waiting for you. |
| Later lessons | ¡Qué alegría verte otra vez! Pere y Titi ya están listos. | So good to see you again! Pere and Titi are ready. |
| Close | Hoy lo hiciste muy bien. Me encantó verte. ¡Hasta pronto! | You did really well today. I loved seeing you. See you soon! |
| Suggest painting | ¿Quieres pintar algo? Toca Pintar y enséñaselo a Pere y Titi. | Want to paint something? Tap Paint and show Pere and Titi. |
| Suggest photo | ¿Hay algo bonito cerca de ti? Toca Foto y enséñaselo a Pere y Titi. | Is there something nice near you? Tap Photo and show Pere and Titi. |
| Suggest tracing (Class only) | ¿Quieres escribir con tu dedo? Toca Trazar. | Want to write with your finger? Tap Trace. |
| Suggest Program Titi | En Pintar también puedes programar a Titi. ¡Tú le dices qué hacer! | In Paint you can also program Titi. You tell him what to do! |
| Reconnect 1 | Calma, aquí estoy contigo. Respiramos una vez, despacio. Pere y Titi siguen a tu lado. | It's okay, I'm here with you. One slow breath. Pere and Titi are right beside you. |
| Reconnect 2 | Está bien sentirse así. Cuando quieras, Pere y Titi te escuchan. | It's okay to feel this way. Whenever you want, Pere and Titi are listening. |

Rules: at most one middle appearance a lesson, never while anyone is speaking or recording, one tap on Habla silences her, no child's name in any clip,
"talk less" requests never trigger her. Real distress is NOT handled by a clip; parent alert wording is a separate decision.
