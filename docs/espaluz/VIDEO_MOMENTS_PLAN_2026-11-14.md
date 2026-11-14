# EspaLuz "Video moments" - plan (Elena approved the concept 14 Nov 2026)

**BUILT 14 Nov (ascent e652a3f): Celebrations.** Elena moved it before launch. The clip is NOT uploaded (3 still
pictures leave the device, 512 px JPEG); allowance 1/month (`CELEBRATION_MONTHLY_CAP`); kept clip in `avatars/<user>/`
(public URL, unguessable task id). Practice stays after launch.

Dashboard section is live as "Video moments with EspaLuz" (ascent 73881d3): photoreal hello + 2 "Coming soon" cards.

## 1. Celebrations - "Send EspaLuz your family's moment"
- Family uploads a short clip (the existing upload slot, bucket `avatars`; it gets public URLs - never call it private;
  consider a private bucket + signed URLs when this ships).
- Browser grabs 3-4 frames (video + canvas) -> the SAME photo-understanding path the classrooms use (Pere & Titi,
  Mishka & Lisa explain Alisa's photos). No new vision engine.
- EspaLuz writes a personal wish from the frames + family notebook (names/ages, verified notes only - nothing invented),
  then ONE lip-synced clip via Runway Characters (photo + our voice).

## 2. Face-to-face practice (Practica-like)
- Live layer (free, real-time): EspaLuz talking/listening video loops + her real TTS voice (the classroom trick);
  user answers by voice -> voice-to-text; replies from the free-first waterfall; topic from the notebook
  (e.g. "interview on Thursday").
- Paid layer: true lip-synced Runway clips only at the opening question and the final tips (each takes 1-2 min).
- Honest limit: no real-time lip-sync engine (Practica's live avatar is an expensive streaming product).

## 3. Money
- Included in the $11 EspaLuz Family plan: monthly allowance (draft: 1 celebration + 2 practice sessions) - set after
  measuring real Runway cost per moment.
- Extras beyond the allowance: website + WhatsApp/Telegram via PayPal / PagueloFacil. NO new Play product (Elena:
  "no more additional products"); the Play app never offers or mentions the extras (anti-steering) - in-app families
  use the allowance only.

## Order
Celebrations first (simpler, one clip), then practice. Measure cost per moment before promising numbers on the page.
