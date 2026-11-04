# EspaLuz — competitor UI and color research (4 Nov 2026)

Elena: "explore real user interfaces that already exist, have true demand and good traction… colors for parents AND
kids, the golden middle… not mock vibe-coding." Method: each live homepage opened in Chrome on 4 Nov; colors, fonts,
button shapes, page length and call-to-action count **measured in the page** (computed styles weighted by area), not
guessed. Visual board: `COMPETITOR_UI_BOARD_2026-11-04.html`.

## Who has traction (sources; mostly company-reported)
| Product | For | Traction |
|---|---|---|
| Duolingo | adults + kids (ABC) | ~$724M sales 2024, ~$1B projected 2025 (Forbes) |
| Speak | adults, AI conversation | $100M+ annualized revenue, ~15M downloads (Forbes, Nov 2025) |
| Lingokids | kids 2–8 | "78M families" (self-reported); Kidscreen award |
| Praktika | adults, AI avatar tutors | 1.2M MAU, ~$20M/12 mo (TechCrunch 2024); site says "30M+ learners" |
| Khan Academy Kids | kids 2–8 | free, ad-free; widely recommended |
| Buddy.ai, Novakid | kids, voice AI / live tutors | no reliable numbers found |
Sources: Forbes https://www.forbes.com/sites/rashishrivastava/2025/11/12/this-startup-is-racing-duolingo-to-replace-human-language-tutors-with-ai/ ·
TechCrunch https://techcrunch.com/2024/05/22/praktika-raises-35-5m-to-use-ai-avatars-to-make-learning-languages-feel-more-natural ·
Lingokids https://en.wikipedia.org/wiki/Lingokids · https://blog.kowatek.com/?p=37391

## Measured on the live homepages
| Site | Background | Brand / button | Text | Display font | Button shape | Screens | CTAs |
|---|---|---|---|---|---|---|---|
| Lingokids | deep violet `#341e60`, cream `#f8f2e9` | orange `#ff9500` (violet text on it) | cream / `#301c59` | PP Agrandir 800 (rounded) | pill 30px | 12 | 3 |
| Speak | white, grey `#f5f5f5` | electric blue `#1c49ff` | navy `#12205a` | Axiforma 600 | pill | 15.5 | 8 |
| Duolingo | white, sky `#ddf4ff` | green `#58cc02` | grey `#4b4b4b`, blue `#1cb0f6` | duolingo-sans 700 (rounded) | rounded | 11 | 5 |
| Praktika | violet `#7429ff`, white | violet `#7429ff` | near-black | Aeonik Pro 500 | pill 50px | 14 | 6 |
| Buddy.ai | mint `#e2faf5`, white | violet `#5827e7`, pink `#ff73df`, sky `#4eb7ff` | black | — | — | 16.5 | 3 |
| Khan Kids | sky `#ebf9ff`, butter `#fff9d7` | navy `#0a2a66` | navy / black | Fredoka + Plus Jakarta Sans | 12px | 11 | 2 |
| Novakid (novakidschool.com) | indigo `#4221b8`, white | mint highlight `#a2ffa6` | `#2c2a33` | Mikado 700 (rounded) | 12px | 21 | 7 |
| **EspaLuz today** | white + **66 gradient elements** | orange `#ff5724`, magenta, sky `#0088cc`, purple `#a855f7` | **15 different text colors** | system font; H1 = gradient text | mixed | **23** | **24** |
(novakid.com now opens a fashion shop — not used.)

## What the leaders share (and EspaLuz breaks)
1. **One brand color + one accent.** Kids leaders: deep violet/indigo + one warm/bright accent (Lingokids violet+orange,
   Novakid indigo+mint, Buddy violet+pink). Adult AI leaders: white + one saturated blue/violet.
2. **One rounded display font** for kids brands (PP Agrandir, Fredoka, Mikado, duolingo-sans) + a plain readable body.
3. **Solid colors, no gradient text.** Gradients appear only as one hero backdrop, never on words.
4. **The product in the first screen:** Speak shows a real Spanish sentence + its translation; Praktika the tutor on a
   phone; Buddy a child talking to the tablet ("Cat!"); Lingokids the app on a tablet.
5. **2–8 calls to action**, one primary, pill-shaped. EspaLuz has 24.
6. **11–16 screens long**; EspaLuz 23.
7. **Characters carry the kids side** (Duolingo's owl + cast, Khan's animals, Lingokids' panda). EspaLuz already owns
   two — **Pere the sloth and Titi the monkey** — but they appear nowhere above the fold.
8. **Parents get a calm, adult layer**: Lingokids and Khan keep the parent area plain (weekly report, progress), kids
   get color. That is the golden middle Elena asked for: **calm frame for the parent, color inside the kids' world.**

## Accessibility (contrast, WCAG AA needs 4.5:1 for text)
EspaLuz today: white on orange `#ff5724` **3.16** ✗ · orange text `#ea580c` on white **3.56** ✗ · white on purple
`#a855f7` **3.96** ✗.

## Proposed EspaLuz palette — grown from her own globe icon (violet sea, sun-yellow land)
| Role | Color | Contrast (measured) |
|---|---|---|
| Ink (all text) | `#1f1640` | 16.3 on cream |
| Brand violet (primary buttons, links) | `#6d28d9` (icon `#7c3aed` for large art) | white on it 7.1 / 5.7 |
| Sun (Luz — kids highlights, stars, one secondary button) | `#facc15` | ink on it 11.0 |
| Cream page background | `#fffbf2` | — |
| Lavender section tint | `#f3efff` | ink on it 14.9 |
| Leaf (success, Pere) | `#15803d` · light `#a7f3d0` | white on it 5.0 / ink on light 13.1 |
| Muted text | `#5b5675` | 6.7 on cream |
Fonts: **one rounded display font for headings** (Baloo 2 is already loaded in `index.html`; Fredoka is the free
alternative Khan Kids uses) + a plain body (system or Plus Jakarta Sans). Buttons: pill, violet with white text;
secondary = sun with ink text. No gradient text; at most one soft hero backdrop.

## Structure the leaders use, mapped to EspaLuz (a direction, not an edit)
1. Hero: "Live your new country in Spanish" + **Pere & Titi talking to a child on a tablet** (a real classroom frame),
   one violet button "Start free" + one quiet link "Parents: see how it works".
2. Three moments (doctor · public office · school gate) — the parent's world, calm cards.
3. Kids classroom strip — the only colorful band: Talk · Trace · Paint · Música with the heroes.
4. Parent report preview (what Lingokids/Khan show parents).
5. Price (14 days free → $11) + 3 questions. Footer. ~10–12 screens, 3–4 CTAs.

Nothing in the app was changed. Next decisions are Elena's (palette yes/no, font, structure), then the signed-in walkthrough.
