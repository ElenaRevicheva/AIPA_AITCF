# HUD Vendor — non-exclusive training licence

**Status (30 Aug 2026, evening):** Elena is on the estimator. GitHub is
**Connected** as `@ElenaRevicheva`. HUD's own screen: **public repos quote at
$0**. A Cloud Agent cannot flip visibility (this token has no `admin` on the
repos) and cannot finish OAuth.

**What you keep:** copyright, brand, domains, and the right to keep operating,
improving and selling every product. Production stays up. This is a licence of a
**copy of source you solely own**, for model-training use. Same offer already
standing with Turing / Lazarus.

---

## What HUD's estimator just told us (verbatim)

> Find out what your codebase could be worth
> Connect GitHub and HUD values your **private** code — that's where the real number is.
>
> Using this estimator does not give HUD or its partners any rights to use or
> commercially exploit the scanned data beyond providing you with a rough
> estimate of its market value.
>
> **Public repos come back at $0 — buyers can already clone them.** Connect
> GitHub to value private code, where the real number is.

Bot quote: *"Your repositories are archived and analyzed in the background.
Progress and results open on the next screen."*

Vendor next doors after a number: **Publish a listing** · **Submit a data
proposal** · **Respond to opportunities**.

Do **not** run Bot quote on the public set. That stamps **$0** and is not the
deal.

---

## Do not make every repo private

You asked if it is worth going private for money. **Yes for the product
codebases HUD will grade. No for the public face that already earns interviews.**

Making a repo private tonight does **not** un-publish it. GitHub Archive, anyone
who already cloned, and every lab that trains on public GitHub still have the
trees. HUD's estimator almost certainly looks at **current** visibility. A
non-zero quote on a repo that was public this morning is a **tool number**, not
proof the code was never public. The founders letter discloses the date. Hiding
that is how a later buyer kills the deal.

Do **not** make a private copy while the public parent stays up. That is the
same code twice, and it looks like you are selling "private" what is still
cloneable.

### Flip to private — then quote these

GitHub → repo → Settings → Danger Zone → Change repository visibility →
Private. Confirm. Then refresh HUD and select only these.

| Repo | Why | Production if it goes private |
|---|---|---|
| `AIPA_AITCF` | Ops brain. 977 commits, 60k LOC | Oracle deploys by `scp` + PAT `git fetch`. Already documented as working on private repos |
| `VibeJobHunterAIPA_AIMCF` | LangGraph + 131-test evals | Oracle holds `origin/main` via `GITHUB_TOKEN` — fetch should keep working |
| `EspaLuzFamilybot` | Telegram advisor since May 2025 | Same PAT fetch; checkout named files, not blind pull |
| `EspaLuzWhatsApp` | WhatsApp twin | Same |
| `dragontrade-agent` | Smaller; include if the form is not picky | PM2 pull via the same token |

### Leave public — do not flip

| Repo | Why it stays public |
|---|---|
| **`aideazz`** | 4everland builds aideazz.xyz from public `main`. Private risks the **portfolio / wiki / blog** going stale. That is the hiring face and the money page |
| `atuona` | Same 4everland path for atuona.xyz |
| `aideazz-podcast` | 4everland feed |
| `atlas-shifted`, `EspaLuz_Influencer`, `hive`, `aideazz-ops-dashboard`, `openclaw-vibejob-shortlist`, `ascent-saas-builder`, `aideazz-pitch-deck` | Thin or satellite — they dilute a quote |
| `manukora-sop-brief`, `aw-client-report-portal` | Not solely-owned product source |

Hiring proof that **survives** the flip: `https://aideazz.xyz/portfolio`,
`https://webhook.aideazz.xyz/doc/nine-systems`, the live bots, the wiki. Resume
GitHub links to the five become "source under NDA" — say that in Rwazi / Plata
if a recruiter asks.

### How to flip (Elena, GitHub UI)

This agent cannot do it (`permissions.admin: false` on the Cloud token).

For each repo in the flip table:

1. github.com/ElenaRevicheva/&lt;repo&gt; → **Settings**
2. Bottom: **Change repository visibility** → **Private**
3. Type the repo name. Confirm
4. Stars/forks stay; anonymous clone dies; your login and Oracle's PAT still work

To undo: same menu → Public. Do that if HUD says previously-public code is still
$0, or if a recruiter is blocked this week.

### After they are private

1. HUD estimator → refresh the GitHub connection if the list still says public
2. Select **only** the five (six) now-private repos. Do not add `aideazz`
3. Run **Bot quote**
4. Send the founders letter the same hour — it now says they were public until
   the flip date
5. Say `sent HUD` plus the quote number, even if it is $0

If Bot quote already ran on the public set: ignore that $0. Flip, refresh,
quote again.

---

## Terms you do not concede

> A non-exclusive licence to a copy of source I solely own, for model-training
> use. I retain copyright, the brand, the domains, and the right to keep
> operating, improving and selling it. Production systems, CRM, chat logs, keys
> and any third-party or client material are out of scope. AIdeazz AI Lab keeps
> running.

Refuse anything that: assigns copyright; is exclusive; includes the running
systems, CRM, or customer data; or requires you to take a product down.

Non-exclusive means Lazarus and HUD can both pay.

---

## Founders letter

Paste-ready: `docs/selling/drafts/hud-vendor-founders-email.txt`

- **To:** `founders@hud.ai`
- After send: `sent HUD`

Estimator copy (HUD, 30 Aug 2026): no rights transfer beyond the rough estimate.

---

## Cursor / hud.io — still the wrong company

`Hud: Sign In` in Cursor is **hud.io** (runtime-sensor plugin). It does not
value a codebase. The buyer is **vendor.hud.ai**.

---

## Never in any package

`.env` / keys, HubSpot, Telegram/WhatsApp chat logs, customer PII, third-party
or client material, Oracle hostnames, deal/contact ids. Live products stay up.
