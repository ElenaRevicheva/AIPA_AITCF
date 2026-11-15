# EspaLuz "About your new life" - what is still missing (15 Nov 2026) - PROPOSAL, waiting for Elena

Rule for every new question: it must change what EspaLuz does (web chat profileLine + bots profile_line, the coming
"first year" path, the classroom). A question nothing uses is a form, not care. Every question keeps a typed answer.

Correction: on 15 Nov I told Elena "it knows why you moved". It does NOT - the questionnaire asks HOW LONG (moved_when),
never WHY. Question A below fixes that; until then that claim must not be used anywhere.

## Add (in this order of importance)
A. **What brought you here?** (choose any + type)
   Work (mine or my partner's) · My partner or family is from here · A better life for the children · A calmer, safer life ·
   Lower cost of living · Adventure, seeing the world · [type your own]
   Used for: tone and bridges ("you came for a calmer life - here is how families here slow down on Sundays"); the
   reason a family stays when Spanish is hard.
B. **How long do you plan to stay?**
   A few months · A year or two · This is our home now · Not sure yet · [type]
   Used for: settling family vs nomad/traveler path (audience order: families first, travelers second); the "first year"
   path shows belonging moments for stayers, travel-useful moments for short stays.
C. **When did you arrive?** (month + year, optional - one line under "How long have you been here?")
   Used for: "your FIRST Carnival / first rainy season" is only true if we know when they arrived; dates the path.
D. **Is anyone in your family from here, or already speaks Spanish?**
   My partner is from here · My partner speaks Spanish · The children speak it at school · Nobody yet · [type]
   Used for: mixed families (a local partner = the best bridge; EspaLuz suggests asking them), and the level per person.
E. **Which school do the children go to?** (inside "Who are the little ones?", only if there are children)
   Local public school · Local private school · Bilingual or international school · Homeschool · Not in school yet · [type]
   Used for: Pere & Titi's classroom "keeps up with the local school" - which school decides what to reinforce; school
   calendar facts only matter for local schools.

## Later (useful, not now)
- City or town (customs, climate and events differ inside a country; packs are country-level today).
- When EspaLuz may write first (quiet hours) - only matters when proactive messages grow.

## Not asking (on purpose)
Religion, health, money, visa status, marital status - sensitive; EspaLuz learns only what a family chooses to say, and
the notebook already keeps such notes private.

## Wiring (when approved)
Web: FamilyProfileDialog questions + profileLine/profileRules in espaluz-chat (new keys: why_here, stay_plan, arrived,
spanish_at_home, school). Bots: profile_line/_PROFILE_ASK twins in both espaluz_enhancements.py (deploy). Old answers
stay valid; new questions show as "not known yet" and EspaLuz may ask ONE lightly in conversation, like the others.
