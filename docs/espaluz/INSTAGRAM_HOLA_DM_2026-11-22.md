# Instagram "comment HOLA" -> DM (ManyChat Free, 22 Nov 2026)

Elena's go, 22 Nov: HOLA + ManyChat free layer only (25 people/month; no paid plan). Why: Reels have no tappable link;
a comment is the one action a viewer takes without leaving Instagram; the DM's buttons ARE tappable.
Plan and facts: `AUTOMATE_REACH_PLAN_2026-11-22.md`.

## Tracking code
`f20261122c0de`, tag `ig` (bots' FILM_RE `\b(f\d{8}[0-9a-f]{4})[-_](fb|ig|yt|li|g\d{1,3})\b`, tested 22 Nov).
An arrival lands as `promo_arrival` -> HubSpot `[ESPALUZ]` deal and the 13:40 report, like every film.

## Automation (ManyChat -> Automation -> "User comments on your post or reel")
- Trigger: any post or Reel, comment contains **HOLA** or **OLA** (any case).
- Public reply to the comment (rotate): "¡Hola! 💌 Te mandé un mensaje · Sent you a DM" / "¡Hola! 👋 Check your DMs · Revisa tus mensajes"
- DM (one message, Meta allows one private reply per comment):

> ¡Hola! 👋 I'm EspaLuz, your family's companion for a new life in Spanish.
> Soy EspaLuz, la compañera de tu familia para la nueva vida en español.
> Pick where to start - 14 days free · Elige por dónde empezar - 14 días gratis:

Buttons:
| Label | URL |
|---|---|
| 💬 WhatsApp | `https://wa.me/50766623757?text=Hola%20EspaLuz%20%F0%9F%91%8B%20(ref%20f20261122c0de-ig)` |
| 📱 Open the app | `https://app.espaluz.lat/?utm_source=instagram&utm_medium=dm&utm_campaign=f20261122c0de` |
| ✈️ Telegram | `https://t.me/EspaLuzFamily_bot?start=f20261122c0de_ig` |

## Limits (free layer)
25 contacts/month is a hard ceiling. Elena's rule: no upgrade. The counter shows in the ManyChat sidebar ("Free contacts
limit x/25"); the 13:40 report does not read it yet. Arrivals themselves DO show in the report (code f20261122c0de-ig).

## LIVE 22 Nov ~14:15 UTC (Claude via Elena's Chrome, her go "do the rest for me")
- ManyChat account `fb6008426` ("Elena Revicheva", FREE, 0/25 contacts), Instagram @elena_revicheva connected by Elena.
- Automation "Auto-send links from comments" = **LIVE**, bound to the EN v18 Reel `DgBN7VvjgFD` ONLY.
  **Free plan limit:** "any post" and "next post" are paid - each Reel needs its own automation (free also caps how many
  automations run). Keywords: HOLA, Hola, hola, OLA, Ola, ola, ¡Hola!. Public reply under the comment: 3 bilingual variants.
  Opening DM (bilingual) + button "Show me · Muéstrame" -> link DM with the 3 tracked buttons above.
- Reel caption edited (line 2): "💬 Comment HOLA and EspaLuz sends you the link · Comenta HOLA y te mando el enlace".
- NOT yet proven: a real HOLA comment from another account (her own comments do not trigger ManyChat).
- ES / RU v18 Reels: when posted, add one automation per Reel + the same caption line (Claude, in Chrome).

## OUR OWN webhook LIVE 22 Nov 20:34 UTC (replaces ManyChat once App Review passes)
- Code `src/ig-comment-dm.ts`, route `https://webhook.aideazz.xyz/cto/ig/webhook`, 30 tests `node scripts/test-ig-comment-dm.cjs`.
- Meta app "EspaLuz Comment Replies" (Development mode) in the verified EspaLuz AI Family Tutor portfolio; webhook
  field `comments` subscribed + account subscription ON. Token: system user "EspaLuz HOLA bot", never expires.
- Proof: `[ig-dm] HOLA on media 18643872349054710 (f2026112251b9) -> DM 200 · public 200` (2nd-profile test on the ES Reel).
- Rules: one DM + one public reply per comment; only posts whose caption invites HOLA; the two ManyChat Reels skipped
  (except the test account); each Reel gets its own code f<date><hex>-ig.
- To use on a new Reel: write "💬 Comenta HOLA · Comment HOLA" in the caption. Nothing else.
- Before strangers: Meta App Review for advanced access (instagram_manage_comments, instagram_manage_messages).
