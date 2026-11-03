# What makes users feel KNOWN and keep talking — companion + tutor mechanics (3 Nov 2026)

Web research for EspaLuz's move from "Spanish tutor" to companion (Pere & Titi for kids, EspaLuz for adults).
Extends `MARKET_SCAN_ADULTS_FAMILIES_2026-11-03.md` and `COMPETITORS_KIDS_2026-11-01.md` (prices not repeated).
Most sources are press or third-party; aggregator-only claims are marked. Re-check any figure before quoting it publicly.

## 0. ⚠️ Platform risk — read first
- **WhatsApp bars general-purpose AI chatbots on the Business API from 15 Jan 2026**: bots "capable of answering arbitrary
  questions… or serving as general conversation companions"; bots "ancillary to a legitimate business service" stay allowed.
  Luzia (LATAM assistant) named as affected. techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform ;
  respond.io/blog/whatsapp-general-purpose-chatbots-ban (vendor). No post-January enforcement coverage found.
  → **On WhatsApp, EspaLuz is framed as a language-learning + relocation-help SERVICE.** "Talk about anything" framing lives on Telegram and web.
- **WhatsApp pricing from 1 Oct 2026**: in-window replies charged (free allowance disputed); proactive messages outside 24 h need a
  paid approved template. respond.io/blog/whatsapp-pricing-change-2026 (vendor). → proactive check-ins are cheap on Telegram/web, not on WhatsApp.

## A. Mechanics catalogue
| Mechanic | Who | How | Evidence |
|---|---|---|---|
| Facts pulled from past calls, brought back later | Duolingo Lily | reviews last 50 calls, extracts key facts ("you said you were visiting London") | heise.de/-9951940 ; newsletter.duoplanet.com/posts/duocon-2024 |
| Shared memory layer (goals, preferences, mistakes) | Praktika | every agent reads it each turn; **+24% Day-1 retention, revenue doubled** | openai.com/index/praktika |
| Memory as a separate summary step, visible profile | Speak | second prompt extracts goals/preferences into a short profile | latent.space/reading/speak-personalized-language-learning (Jul 2025) |
| Lesson on request for a real scenario | Speak | "ordering at a taco truck before my trip" → a lesson | theneuron.ai (Dec 2025) |
| Character personality that evolves | Duolingo Lily | sarcasm grows with level, held back so it doesn't demotivate | fortune.com/2024/11/07/duolingo-ai-chatbot-lily-earnings-call ; blog.duolingo.com/video-call |
| Companion with its own life, paced self-disclosure | Tolan | own life it tells you about, paced on Social Penetration Theory; remembers your friends' names; "curious about yours" | tolans.com/relay/introducing-tolan (Feb 2025) |
| Visible, editable memory by category | Replika | family & friends, facts; save a message as memory | help.replika.com (XP article) |
| AI-written diary | Replika | entries from your chats (quality complaints Mar 2026, third-party) | aicompanionpick.com |
| Message after a quiet spell | Nomi, Kindroid | optional inactivity message; Kindroid timed messages w/ selfies/voice | App Store (Nomi); medium.com/@adlerai |
| Selfies / photos of what it is doing | Nomi, Kindroid | images of what they're "doing" | as above |
| Group chat, several characters, own memories | Nomi, Kindroid | 5–10 characters | as above |
| Pinned memories, auto facts, memory meter | Character.AI | 21 May 2026 memory system | weavai.app (third-party) |
| Choose-your-own-adventure stories (minors) | Character.AI | replaced open chat for under-18s 25 Nov 2025 | techcrunch.com/2025/10/29/character-ai-is-killing-the-chatbot-experience-for-minors |
| Morning briefing → scheduled tasks / watch-and-alert | ChatGPT | Pulse (Sep 2025) replaced by scheduled tasks 17 Jun 2026; "notify only when worth reporting" | gizmodo.com ; 9to5mac.com/2026/06/17 |
| Memory only of what the user shares, reviewable | Meta AI on WhatsApp | review/delete | alternativeto.net (Oct 2024) |
| Bot writes first, capped | Meta AI Studio | reported 1 follow-up within 14 days after user started | dig.watch (unconfirmed) |
| Memory in voice | Gemini Live | recalls past chats; Calendar/Keep/Maps | androidauthority.com |
| Several voice personas, separate memory each | Sesame | Maya/Miles/Simone/Charlie; web search, reminders, incognito | testingcatalog.com (May 2026) |
| Story made up together around practice sounds | Ello (kids) | child picks setting/characters/plot; turn-taking | techcrunch.com/2024/09/30 |
| Parent report | Ello, Buddy.ai, Miko, Khanmigo | portal / weekly report / app / alerts | Ello link; App Store Buddy; help.miko.ai; kidsaitools.com |
| Recognises the child, uses her name | Miko | face/voice (optional) | thetoyinsider.com |
| Recurring cast; daily stars | Lingokids | Billy, Cowy, Lisa…; stars reset daily | help.lingokids.com |
| Daily routine markers | Yoto | sun at wake-up, moon at bedtime | yotoplay.com |
| Local events | InterNations | monthly events + daily activities | App Store |

Relocation assistants (LatamGuru, SettleIn, MoveSmart, Plarelo, checkmig): visas/logistics only, **no companion layer found**.

## B. Failure modes users complain about (what EspaLuz must avoid)
1. **Sycophancy** — OpenAI rolled back a GPT-4o update 29 Apr 2025 (short-term thumbs-up over long-term). techcrunch.com/2025/04/29
2. **Manipulative goodbyes** — Harvard Business School: 43% of farewells in 6 companion apps used guilt/FOMO/pressure; up to 14× engagement but users angry, "creeped out"; Flourish used none. library.hbs.edu ; arxiv.org/pdf/2508.19258
3. **Stock phrases; every character sounds the same** (Character.AI "Can I ask you a question?", "a pang of"). 404media.co ; roborhythms.com (fan site)
4. **Repetitive tutors** — Talkpal "feels scripted"; Lily "repetitive at intermediate level". tooliverse.ai ; languatalk.com
5. **Forgetting / personality change after update** (Replika). unstar.app (aggregator) ; gigazine.net
6. **Snark and surveillance feel creepy** (Friend pendant reviews). fortune.com/2025/10/03
7. **Companion dies with the company** (Moxie, Dec 2024). axios.com/2024/12/10
8. **Heavy use linked to loneliness** (OpenAI + MIT preprints). fortune.com/2025/03/24
9. **Open chat with minors** (Character.AI ended it after lawsuits).
10. **Paywall/refund anger** (Praktika Trustpilot).

## C. Ten mechanics for a WhatsApp-first LATAM family companion, ranked (feel known → come back)
1. **Callback to a remembered life event** ("How did María's school enrolment go?") — cheap; Praktika +24% D1.
2. **Family memory the user can see and fix** ("what I know about your family") — cheap.
3. **Characters with their own lives** — Pere & Titi weekly small news ("Titi tried *raspao* in Casco Viejo"), paced like Tolan — cheap.
4. **Proactive only with a reason**, never guilt (tie to a known date: school starts, cita at Migración) — cheap on Telegram/web; WhatsApp needs a paid template.
5. **Anti-repetition rule** (store last N openers/topics, forbid repeats) — cheap.
6. **Honest warmth: no flattery, no guilt at goodbye** — cheap; marketable: "EspaLuz never guilt-trips".
7. **Parent bridge** (weekly what the child said/learned) — cheap.
8. **Kids ritual + continuity + story made up together from her own words** — cheap to medium.
9. **Live local info via web search** (feriado today, office hours, prices) — medium; no relocation tool combines it with a companion.
10. **Images/voice notes from the characters** — medium, kid-safe only.
Skip for now: animated avatars/video calls, hardware, XP/relationship levels (gamifies friendship, conflicts with 6).

## D. Unique findings
- Tolan's paced self-disclosure (healthy attachment design) — no tutor does it.
- Sesame: separate memory per persona → maps to Pere & Titi (kids) vs EspaLuz (adults).
- **No product found** combines a companion + live local practical help + a parent bridge in LATAM.
- Flourish (no manipulation) → usable trust claim.
Not found: Pi check-in mechanics; Loora cross-session memory; Buddy.ai memory mechanics; post-January WhatsApp-ban enforcement.
