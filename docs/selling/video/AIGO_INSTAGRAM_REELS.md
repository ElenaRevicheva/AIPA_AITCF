# AIGO films → Instagram Reels (4 Oct 2026)

Elena (4 Oct): promote the 5 films on Instagram "without destroying anything that runs now", in a **new** Make scenario
("Better create new one for insta … if videos can also be [posted], we need to re[s]ize our 5 videos to fit insta format").

## How it runs (nothing existing is touched)
- **New Make scenario 6505010** "AIGO Films → Instagram Reels" (team 938264, created + activated 4 Oct). The existing
  scenarios — Daily YouTube Upload (6263197), Daily YouTube Promotion via Buffer, Emotionally Intelligent…, Vibejobhunter +
  CMO AIPA, both Lead Concierge — were not edited (their `lastEdit` stamps all predate 4 Oct 12:51 UTC).
  Blueprint (token redacted): `docs/selling/video/make/6505010_aigo_films_instagram_reels_2026-10-04_REDACTED.json`.
- Daily at 12:00 Panama: module 1 `http:ActionSendData` GETs
  `https://webhook.aideazz.xyz/influencer-images/ig-aigo/posts/<YYYY-MM-DD>.json` (Panama date). Only post days have a
  file; any other day is a 404 and the filter `{{1.statusCode}} = 200` stops there (1 op, no error). Module 2 POSTs the
  file body **verbatim** to Buffer GraphQL (`createPost`, `mode: shareNow`, Instagram channel `68389b15d6d25b49a1d75b8e`,
  `type: reel`, `shouldShareToFeed: true`, **`isAiGenerated: true`** = Instagram's AI label).
- The calendar lives in those files, not in Make: change a caption or a date with `scripts/aigo-ig-calendar.py` (it builds
  the files from the caption blocks below). The schedule fires once a day, so a posted file needs no cleanup; only a
  hand-fired run on a post day does: 4 Oct was fired by hand (Make "Run once"), so its file was renamed
  `2026-10-04.json.posted` before the 12:00 run. The script never rewrites a `.posted` day, so a rerun cannot double-post.
- After 12 Oct every GET is a 404: the scenario keeps running at 1 op/day and posts nothing. To stop it for good: Make →
  scenario 6505010 → toggle OFF (or `POST /scenarios/6505010/stop`). To add a round: write new date files, nothing in Make.
- One Reel every two days at most — the account carried Meta "community guidelines" restrictions after the 3 Oct burst.
- The Reels are served as `application/octet-stream` (nginx default for that folder); Buffer/Instagram accepted it, so no
  web-server change was made.

## The Reels (1080×1920, made by `scripts/aigo-ig-reel-overlays.py` + `scripts/aigo-ig-reels.sh`)
Each = the published 16:9 master centred on a blurred fill of itself, the slogan on top, the hook chip + "Auditoría de
visibilidad en IA, gratis · aideazz.xyz/api" + a per-film AI disclosure below (all inside the Reels safe zone);
H.264/AAC, 24 fps, closed GOP, faststart. Hosted at `https://webhook.aideazz.xyz/influencer-images/ig-aigo/reel_<film>_v1.mp4`.

| Date (12:00 Panama) | Film | Reel | YouTube |
|---|---|---|---|
| Sun 4 Oct — **posted** instagram.com/reel/DeErTwenLT7 (Buffer "sent" 12:52 UTC) | 1 Yacht | `reel_yacht_v1.mp4` | youtu.be/kUrKw61Uo4Q |
| Tue 6 Oct | 3 Villa + charter | `reel_villa_v1.mp4` | youtu.be/Tg9N0PprsaI |
| Thu 8 Oct | 4 Relocation (v2) | `reel_reloc_v1.mp4` | youtu.be/y1ZhWyqJW0w |
| Sat 10 Oct | 5 Medical tourism (v3) | `reel_medtour_v1.mp4` | youtu.be/e0rMKnH-noI |
| Mon 12 Oct | 2 /api | `reel_api_v1.mp4` | youtu.be/l9Ubxqy7zDA |

## Captions (disclosure first; credit AIdeazz AI Lab, never a person; no clickable links on Instagram → "link in bio")

**1 · Yacht**
```
AI-generated people · dramatization. / Personas generadas con IA · dramatización.

She asked ChatGPT before she messaged your yacht. Was your charter on the list?
Le preguntó a ChatGPT antes de escribirle a tu yate. ¿Tu chárter estaba en la lista?

Free AI visibility audit — what AI understands about your website, in 34 checks → aideazz.xyz/api (link in bio)
Full film on YouTube: youtu.be/kUrKw61Uo4Q

AIdeazz AI Lab · AI Growth Operator
#YachtCharter #LuxuryTravel #AIMarketing #ChatGPT #WhatsAppBusiness #Panama
```

**2 · Villa + charter (New Year)**
```
AI-generated people · dramatization. / Personas generadas con IA · dramatización.

Three generations, one island, New Year. She planned it with ChatGPT — and booked the villa that answered first.
Tres generaciones, una isla, Año Nuevo. Lo planeó con ChatGPT y reservó la villa que respondió primero.

Is your villa on AI's list? Free AI visibility audit → aideazz.xyz/api (link in bio)
Full film on YouTube: youtu.be/Tg9N0PprsaI

AIdeazz AI Lab · AI Growth Operator
#LuxuryVilla #BocasDelToro #BoutiqueHotel #AIMarketing #HospitalityMarketing #Panama
```

**3 · Relocation (immigration lawyers + real estate, Panama)**
```
AI-generated people · dramatization. / Personas generadas con IA · dramatización.

A mother moving to the mountains, her son to the city. They asked ChatGPT before they messaged anyone in Panama.
Una madre a la montaña, su hijo a la ciudad. Le preguntaron a ChatGPT antes de escribirle a nadie en Panamá.

Abogados de inmigración e inmobiliarias: ¿la IA los recomienda? Auditoría de IA gratis → aideazz.xyz/api (link en la bio)
Full film on YouTube: youtu.be/y1ZhWyqJW0w

AIdeazz AI Lab · AI Growth Operator
#Panama #Boquete #RealEstatePanama #MovingToPanama #AIMarketing #Inmobiliaria
```

**4 · Medical tourism (Colombian dental clinics + plastic surgery)**
```
Dramatization: the people, clinics and doctors are fictional and AI-generated. Not medical advice.
Dramatización: personas, clínicas y médicos ficticios generados con IA. No es consejo médico.

Patients ask ChatGPT which clinic answers quickly in English — before they write to you.
Los pacientes le preguntan a ChatGPT qué clínica responde rápido en inglés, antes de escribirte.

Free AI visibility audit for clinics → aideazz.xyz/api (link in bio)
Full film on YouTube: youtu.be/e0rMKnH-noI

AIdeazz AI Lab · AI Growth Operator
#ClinicMarketing #DentalClinic #Medellin #Colombia #AIMarketing #PatientExperience
```

**5 · /api (the free audit)**
```
One AI-generated person in this film · the audit shown is a real, live run.
Una persona generada con IA en este video · la auditoría es real.

Google ranked your page. In 2026, people ask AI first — and it suggests the businesses it can understand.
Google posicionó tu página. En 2026 la gente pregunta primero a la IA, y sugiere los negocios que puede entender.

34 checks, one score, the fixes that matter — free → aideazz.xyz/api (link in bio)
Full film on YouTube: youtu.be/l9Ubxqy7zDA

AIdeazz AI Lab · AI Growth Operator
#AEO #GEO #AISearch #ChatGPT #SmallBusiness #DigitalMarketing
```

Banned words checked (no "best", "results", "safe", "guaranteed", "new smile", "promo", "package", "price", "bufete").
**Bio link:** ADD (do not replace) `aideazz.xyz/api?utm_source=instagram&utm_medium=bio&utm_campaign=aigo_films` — Elena's account setting.
