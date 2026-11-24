# EspaLuz: strict persona round, 6 paths × WhatsApp / Telegram / web (23 Nov 2026)

Synthetic families only (ids no real person can have; sends intercepted, logged, never delivered). PASS = critic ≥ 8/10
AND landed in the right place AND would stay AND no hard-rule fail. Logs on Oracle: `~/_session-backups/strict-run-18door-chat.log`,
`~/_session-backups/syn-web-run-R2-judged.json`.

## Result

| Round | Doors | Passed |
|---|---|---|
| Chat R1 (WA + TG) | 12 | 11 |
| Chat R2 (WA + TG) | 12 | **12** |
| Web R1 (before Publish) | 6 | 4 |
| Web R2 (after Elena's Publish 23 Nov) | 6 | 5 |

Every door, in every round, **landed in the right place** (landed=True on all 36). The failures are about quality, not routing.

## The two failures (both 7/10)

1. **expat WhatsApp, chat R1** (passed 9/10 in R2): the model wrote broken Spanish "¿Cómo se llamas tú?" and repeated the
   emergency-room disclaimer in the second reply. Real content fault: a grammar self-check on the tutor's own Spanish would catch it.
2. **expat web, R2**: dashboard feels generic: Russian language button shown to an English family, no class for a 10-year-old,
   "1 of 8 done" counter before doing anything, "Our story: 1 moment" unexplained.

## Repeated critic notes (passing doors, worth a look next week)

- Web chat preview cut mid-word ("Engli", "sus palabr"): looks broken (nomads, settle).
- Nomads dashboard still shows the kids classroom step in the map; "Your EspaLuz map" label appears twice.
- Pro English asks "respond in English" for the level check although the landing says Spanish is fine when stuck.
- Pro Spanish landing lists sales/business scenes first, medical last; the correction gave no "why" in English.
- "$11" with no currency; "beta" next to the Russian kids class worries a paying parent.

None of these blocks a family from arriving or staying. Decision on fixes: Elena, next week.
