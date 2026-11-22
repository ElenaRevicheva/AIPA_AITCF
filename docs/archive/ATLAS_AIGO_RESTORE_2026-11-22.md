# Atlas as the AI Growth Operator lead machine — frozen 22 Nov 2026, restorable in minutes

Elena, 22 Nov 2026: "back up all this approach, philosophy, encoding, so that if I want to come back to AI Growth
Operator, I can do that immediately." On that day Atlas was refocused on EspaLuz. Nothing below was deleted.

## What it was (the philosophy, in one screen)
- **Who:** Panama + LATAM businesses that sell to international customers (yachts, luxury real estate, destination
  weddings, surf/yoga, dental, offshore/residency, tourism). Lanes chosen by REACHABILITY x Atlas score, never score
  alone; GEO/AEO (`geo_aeo_tech_seo_makers`) worked every week first. Lanes: `docs/selling/ATLAS_LANES_2026-10-19.md`.
- **Qualify before CRM:** real website + real email on that domain (`ATLAS_TRUE_CONTACTS=1`), Elena's own AI-visibility
  audit inside the band 35-98, not already in HubSpot. 403 block pages are never quoted as a score. Plus up to 2
  no-website high-ticket businesses (dental) per Monday.
- **Offer:** AI visibility audit as the opener (score = gap below 85, credential at/above 85) -> WhatsApp agent 24/7,
  GEO/AEO fix, AI promo video, automation. Free 15-min demo.
- **Kit (`ATLAS_AIGO_KIT=1`):** AI Growth Operator deck PDF attached (`docs/selling/attachments/AIdeazz_AI_Growth_Operator_2026_ES.pdf`)
  + deck link, the industry promo films (`docs/selling/aigo-kit.cjs` -> `aigoVideoLinesFor`), Elena in Cc.
- **Human gate:** Atlas only STAGES (deal at 🔥 I Act TODAY + note + one-click button). Sending = `POST /go/outreach-email/<slug>/send`
  (Resend from aipa@, HubSpot email activity, deal -> ⏳ Sent). Follow-up `<slug>-fu` staged alongside.
- **Money logic:** `docs/selling/AI_GROWTH_OPERATOR_MONEY_BLUEPRINT.md`, roadmap `AI_GROWTH_OPERATOR_ROADMAP_2026-10-14_CHATGPT.md`.

## Where every piece is kept
| Piece | Kept at |
|---|---|
| cto-aipa code (lead machine, alert, outcomes, GA4 sync, libs, kit, drafts, registry) | git tag **`atlas-aigo-final-2026-11-22`** (ElenaRevicheva/CTO_AIPA) |
| Atlas capture / classify / brief / concept (whitespace app) | git tag **`atlas-aigo-final-2026-11-22`** (ElenaRevicheva/atlas-shifted, commit 305b1ac) |
| Atlas data (concepts.json, radar.sqlite, leads, outcomes, memory) + whitespace .env | Oracle `~/_session-backups/atlas-aigo-20261122/whitespace-full.tgz` |
| cto-aipa Atlas files + registry + drafts + Resend ledger snapshot | same folder, `cto-aipa-atlas-files.tgz` |
| The 5 Monday cron lines + full crontab | same folder, `crontab-atlas-lines.txt`, `crontab-full.txt` |
| ATLAS_* / LEAD_* / Places / visibility env values | same folder, `env-atlas.txt` (mode 600, never in git) |
| Laptop copy of the whole folder (md5-checked) | `D:\aideazz\_backups\atlas-aigo-20261122\` |

Monday cron as it ran (UTC): capture 14:00 · campaign alert 15:15 · outcomes 15:30 · lead machine 16:00
(`LEAD_MAX_NEW=8`) · GA4 sync daily 06:15.

## Restore (about 10 minutes)
1. `git checkout atlas-aigo-final-2026-11-22 -- scripts/atlas-lead-machine.cjs scripts/lib docs/selling/aigo-kit.cjs`
   in cto-aipa (and the same tag in whitespace if its lanes changed); build/scp named files to Oracle.
2. Put back the `env-atlas.txt` lines in `~/cto-aipa/.env` (ATLAS_AIGO_KIT=1, ATLAS_TRUE_CONTACTS=1, ...).
3. Put back the lines from `crontab-atlas-lines.txt` (`crontab -e`), replacing the EspaLuz ones.
4. Dry run: `cd ~/cto-aipa && LEAD_MAX_NEW=2 node scripts/atlas-lead-machine.cjs --dry` -> read one letter.

Last state before freezing: 58 Atlas deals 5 Oct-16 Nov; on 22 Nov the 38 never-sent first letters (19 Oct-16 Nov)
were sent with the full kit on Elena's go; their 38 follow-ups (`-fu`) stay staged.
