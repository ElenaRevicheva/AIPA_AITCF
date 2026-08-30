# HUD Vendor — non-exclusive training licence

**Status (30 Aug 2026):** packet ready. Application is **Elena's click** — GitHub
OAuth. An agent cannot complete it from Cursor Cloud or by installing an IDE
extension.

**What you keep:** copyright, brand, domains, and the right to keep operating,
improving and selling every product. Production stays up. This is a licence of a
**copy of source you solely own**, for model-training use. Same offer already
standing with Turing / Lazarus (`docs/selling/drafts/turing-lazarus-rohit-email.txt`).

---

## Can I sign up and submit from Cursor?

**No.** The Google AI Overview for "hud ai sign in" is the **wrong company**.

| What you searched | What Google described | What we actually want |
|---|---|---|
| "hud ai sign in" | **Hud.io** — a runtime-sensor IDE plugin | **HUD Vendor** — Human Union Data, Inc. (YC W25) |
| Command `Hud: Sign In` | Cursor / VS Code extension for org telemetry | Web form at **https://vendor.hud.ai/codebases** |
| Auth | Organisation account in a browser popup | **Your GitHub** — they scan repos you pick |

Installing the Hud IDE extension and running `Hud: Sign In` does **not** list a
codebase, does **not** start a valuation, and does **not** grant a training
licence. It connects a different product (`hud.io`) to your editor.

A Cloud Agent also cannot finish the real application: `vendor.hud.ai` is outside
this environment's network allowlist, and GitHub OAuth is a credential boundary
(same class as the Work at a Startup profile).

**What you do (five minutes, Chrome, logged into GitHub as ElenaRevicheva):**

1. Open **https://vendor.hud.ai/codebases**
2. Sign in with GitHub. Grant repo read only if that is all they ask. Do not
   grant write, admin, or delete.
3. Select the repos in the "submit" table below. Skip everything in "do not
   submit".
4. Run the **value check**. HUD's own copy: at this stage **no rights transfer**.
   They say they keep check data ≤30 days.
5. Use the email on the GitHub account (and/or send the founders letter below).
   Qualifying vendors get an NDA and a real onboarding. You **accept each
   licence** when a lab matches — payment is quoted 7–14 days after that.

If the automated check bounces public repos, send the founders letter the same
day. Do not wait.

---

## What HUD pays for (and what they do not)

Public HUD Vendor copy (hud.ai/resources + Hansel / HUD GTM on DEV):

- **Licence, not a sale.** You keep ownership. The same codebase can be licensed
  to more than one lab (separate one-off payments).
- **Baseline** published at **$5,000 per codebase**, seller keeps **80%** (20%
  grading/packaging). Hansel has also said frontier labs pay **up to $10k** for
  a qualifying private repo. Treat both as marketing ranges, not a quote.
- Rubric they advertise: production history, completeness (PRs, design notes,
  incidents), runnability, **clean rights**, domain specificity.

Their **classic inbound** is a *private, closed-source, often dead* startup
repo. Ours is the opposite on two axes: the systems are **live**, and every
listed GitHub repo is **public**. That is the one thing that can fail the
automatic qualifier. The founders letter exists for that reason — the asset is
fifteen months of production history, the wiki, the evals, and the "why", not
"here is more public GitHub".

---

## Repos — submit / skip

Checked 30 Aug 2026 via `gh repo list ElenaRevicheva`. Every repo the token can
see is **public**. No private repo was visible to this session. If you have a
private repo this token cannot see, add it to the value check first.

### Submit for the value check

| Repo | Why it grades | Created | Last push |
|---|---|---|---|
| [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | Ops brain. Provenance: 60,132 LOC, 977 commits, 164 docs, 82 commands | 2025-10-10 | 2026-08-30 |
| [aideazz](https://github.com/ElenaRevicheva/aideazz) | Visibility engine + wiki + blog. Oldest product repo | 2025-03-25 | 2026-08-30 |
| [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | LangGraph hunter + evals. Provenance: 33,988 LOC, 543 commits, 131 tests | 2025-11-09 | 2026-08-30 |
| [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | Telegram advisor. Provenance: part of 52,487 LOC / 595 commits / since May 2025 | 2025-05-16 | 2026-08-17 |
| [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | WhatsApp twin — LATAM channel that actually matters | 2025-06-06 | 2026-08-16 |
| [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Smaller; human-on-the-last-click trading education. Optional if the form is picky | 2025-07-03 | 2026-08-16 |

Dossier they can read without a repo clone:
**https://webhook.aideazz.xyz/doc/nine-systems**
(source in-repo: `docs/strategy/aideazz-provenance.html`)

Portfolio (buyer-facing, not a repo): **https://aideazz.xyz/portfolio**

### Do not submit

| Repo | Why |
|---|---|
| `manukora-sop-brief` | Job-application brief, not a product you own as a training corpus |
| `aw-client-report-portal` | Client-shaped. Out of scope with the rest of the client material |
| `aideazz-pitch-deck` | Deck, not a production system |
| `hive` | Stale framework, last push Feb 2026 |
| `ascent-saas-builder` | Lovable-generated SaaS beta — mixed provenance |
| `atlas-shifted` | Thin / young; Atlas production lives inside AIPA_AITCF |
| `aideazz-ops-dashboard`, `aideazz-podcast`, `atuona`, `openclaw-vibejob-shortlist`, `EspaLuz_Influencer` | Satellite or thin. Do not dilute the grade |

### Never in any package, even after they qualify

Production runtime, `.env` / keys, HubSpot, Telegram/WhatsApp chat logs, customer
PII, third-party or client material, Oracle hostnames, deal/contact ids. HUD
themselves mention PII stripping as a packaging step — start from a clean copy,
do not let them discover secrets.

The live products **do not get turned off, transferred, or rebranded**.

---

## Terms you do not concede

Same sentence already sent to Turing / Lazarus. Paste it into HUD's NDA /
licence if their paper is vaguer:

> A non-exclusive licence to a copy of source I solely own, for model-training
> use. I retain copyright, the brand, the domains, and the right to keep
> operating, improving and selling it. Production systems, CRM, chat logs, keys
> and any third-party or client material are out of scope. AIdeazz AI Lab keeps
> running.

Refuse anything that: assigns copyright; is exclusive; includes the running
systems, CRM, or customer data; or requires you to take a product down.

Non-exclusive means Lazarus and HUD can both pay. Do not countersign anything
that would poison the other conversation.

---

## Founders letter

Paste-ready: `docs/selling/drafts/hud-vendor-founders-email.txt`

- **To:** `founders@hud.ai`
- **Optional Cc / DEV DM:** Hansel (HUD GTM) — DEV post that named
  `vendor.hud.ai/codebases`
- **After you send:** tell the next agent `sent HUD` so the deal can be moved.

This environment cannot send Gmail (MCP needs auth) and cannot reach
`api.hubapi.com` (egress). Staging a HubSpot deal is a Desktop / Oracle job.

---

## After they reply

1. Read the NDA against the terms block above. Do not sign on the call.
2. If they want a private snapshot: copy source **without** `.env`, CRM exports,
   chat logs, or client folders. Keep the public repos public; the snapshot is
   the licensed copy.
3. Accept per-lab. You can say no to a match.
4. Payment is after *you* accept, not after the value check.

---

## Sources (so the next agent does not re-research the wrong Hud)

- HUD Vendor process (Hansel, HUD GTM, DEV): value check at
  `vendor.hud.ai/codebases` → auto qualify → NDA → list → lab match → you accept
  → pay 7–14 days
- HUD's own "selling a codebase" page: $5k baseline, 80/20 split, grading rubric
- `founders@hud.ai` — public on the HUD SDK repo
- Hud.io Cursor extension: `docs.hud.io/docs/install-hud-in-cursor` — **not this deal**
