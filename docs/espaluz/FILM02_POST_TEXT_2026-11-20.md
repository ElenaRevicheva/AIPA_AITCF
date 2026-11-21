# EspaLuz film 02: the text under the video (20 Nov 2026)

**How posting works (checked live in Make on 20 Nov):** you send the film to the **EspaLuz Influencer bot** on Telegram, with a
caption. The bot passes it to Make scenario **6869112** ("EspaLuz video → Facebook + Instagram + YouTube Shorts"), which posts to
the **EspaLuz Facebook Page**, a **YouTube Short** and an **Instagram Reel** (through Buffer).
The text under each video = **your caption** + **a fixed ending the bot adds** (links, 14 days free, Google Play beta, AI note).
The **first line of your caption becomes the YouTube title** (up to 88 characters + "#Shorts").

## 1. What you paste as the caption (one per film)
_21 Nov (v18): the slogan line "Paperwork gets solved once. Adaptation is what lasts." (Elena) under the headline; the film shows "...Doctors. *Adaptation.*" and SAYS the slogan. Before: documents first + one adaptation word (EN culture / ES costumbres / RU повседневная жизнь - «обычаи» sounded old-fashioned), same as the films EN/ES v16, RU v17._

**EN film** (`espaluz-film02-en-v18.mp4`)
```
Moved to Latin America with your family? EspaLuz helps you feel at home 🌎
Paperwork gets solved once. Adaptation is what lasts.
New country, new language, new everything. Schools, doctors, everyday life, what "ahorita" really means: just ask EspaLuz on WhatsApp, Telegram or the web. It answers in Spanish and English and remembers your family. Your child gets 10 minutes a day with Pere & Titi (ages 5-8).
```

**ES film** (`espaluz-film02-es-v18.mp4`)
```
¿Te mudaste a Latinoamérica con tu familia? EspaLuz te ayuda a sentirte en casa 🌎
Los trámites pasan. La adaptación queda.
Nuevo país, nuevo idioma, todo nuevo. Colegios, médicos, la vida diaria, qué significa de verdad "ahorita": pregúntale a EspaLuz por WhatsApp, Telegram o la web. Responde en español e inglés y recuerda a tu familia. Tu peque tiene 10 minutos al día con Pere y Titi (de 5 a 8 años).
```

**RU film** (`espaluz-film02-ru-v18.mp4`)
```
Переехали в Латинскую Америку с семьёй? EspaLuz поможет почувствовать себя дома 🌎
Документы оформляют один раз. Адаптация — это надолго.
Новая страна, новый язык, всё новое. Школы, врачи, повседневная жизнь, что на самом деле значит «ahorita»: просто спросите EspaLuz в WhatsApp, Telegram или на сайте. Она отвечает по-испански и по-английски и помнит вашу семью. Ребёнку — 10 минут в день с Пере и Тити (5-8 лет).
```

## 2. The ending the bot adds by itself (NEW: the Google Play beta line)

Same on all three platforms, only the link line differs:
- **Facebook:** tappable links to the app, WhatsApp and Telegram, each tagged with this film's code.
- **Instagram:** "Link in bio, or type espaluz.lat" (Instagram captions can't hold tappable links).
- **YouTube:** "Tap the channel name above, or type espaluz.lat" (Shorts descriptions can't hold tappable links on phones).

Then, on every platform:
```
App · WhatsApp · Telegram — 14 days free · 14 días gratis

📱 On Android? Get the EspaLuz app before everyone else. Only a few free beta spots are left on Google Play: families who grab one use it FREE until 31 December (normally $11/month). Comment "Android" to claim your spot and we'll send you the invite.
📱 ¿Tienes Android? Ten la app de EspaLuz antes que nadie. Quedan pocos cupos gratis en la beta de Google Play: las familias que entran la usan GRATIS hasta el 31 de diciembre (normalmente $11 al mes). Comenta "Android" para apartar tu cupo y te mandamos la invitación.

People in this video are AI-generated.
```

**Why people will join (Elena, 20 Nov: "nobody tests for nothing"):** the line leads with what THEY get: the app first, and the whole family free until 31 Dec instead of 14 days (the `play_testers` mechanism, already live for 5 testers). No number in public (Elena): "only a few free spots left" makes it limited, not an endless search. Elena decides when the spots close.

**Why "comment Android":** comments work on all three platforms, and links don't work on two of them. Each person who comments
sends you their Gmail. You add it in Play Console → Testing → Closed testing → Testers, and in the `play_testers` table so they get free access.
Each tester counts toward the 12 testers Google requires for 14 days before EspaLuz can go public.
Every claim is true today: closed testing track `lat.espaluz.app`, and testers have free access until 31 Dec 2026.

## 3. Full example: what the Instagram Reel will show (EN)
```
Moved to Latin America with your family? EspaLuz helps you feel at home 🌎
New country, new language, new everything. Paperwork, schools, doctors, the local culture, what "ahorita" really means: just ask EspaLuz on WhatsApp, Telegram or the web. It answers in Spanish and English and remembers your family. Your child gets 10 minutes a day with Pere & Titi (ages 5-8).

🌎 EspaLuz — your new life in Latin America, in Spanish · tu nueva vida en Latinoamérica
🔗 Link in bio, or type espaluz.lat · Enlace en el perfil, o escribe espaluz.lat
App · WhatsApp · Telegram — 14 days free · 14 días gratis

📱 On Android? Get the EspaLuz app before everyone else. Only a few free beta spots are left on Google Play: families who grab one use it FREE until 31 December (normally $11/month). Comment "Android" to claim your spot and we'll send you the invite.
📱 ¿Tienes Android? Ten la app de EspaLuz antes que nadie. Quedan pocos cupos gratis en la beta de Google Play: las familias que entran la usan GRATIS hasta el 31 de diciembre (normalmente $11 al mes). Comenta "Android" para apartar tu cupo y te mandamos la invitación.

People in this video are AI-generated.
```

## 4. Your Make account (read-only check, 20 Nov): 10 scenarios, 972 of 10,000 credits used this cycle
| id | state | what it does |
|---|---|---|
| 6869112 | ACTIVE, on webhook | **EspaLuz video → Facebook Page + YouTube Short + Instagram Reel** (this one) |
| 6868765 | ACTIVE, on webhook | EspaLuz photo → Facebook Page |
| 3044021 | ACTIVE, on webhook | Daily photo promo → Buffer (your personal IG + LinkedIn) |
| 3543445 | ACTIVE, on webhook | VibeJobHunter + CMO AIPA → Buffer |
| 5633833 | ACTIVE, every 15 min | Lead Concierge (HubSpot) |
| 5953877 | ACTIVE, on webhook | Lead Concierge, returning contacts |
| 6505010 | ACTIVE, daily 12:00 | AIGO films → Instagram Reels (from files on the server) |
| 6518503 | ACTIVE, daily 09:45 | AIGO YouTube thumbnails |
| 6263197 | stopped | Daily YouTube upload (AIGO films) |
| 6262097 | stopped, invalid | Daily YouTube promotion via Buffer (old) |

90% of the credits are unused. The cheapest way to use them for EspaLuz is to reuse 6869112 for a film-a-week queue.
That is a separate decision, and nothing in Make was changed today.

**Tracking note:** the bot gives each video it posts its own film code, `f<date><hash>`, and the daily 13:40 film report reads
those codes. The hand-made codes in `FILM02_LINKS_2026-11-20.md` (`f20261120a0e1-3`) are for posting by hand: a bio link,
channel links, or Facebook groups.
