# DataVendor 8-pack — QC state and the "Hansel" letter (4 Sep 2026)

Measured this session from the live listing + a full local scan. Nothing was uploaded,
edited or replied to.

## 1. The letter does not match the account

An email signed **Hansel, DataVendor team** told Elena the PII check "is failing on the
upload", that "the listing cannot be sold or shown to buyers", that buyers "are reviewing
codebases right now", and asked her to scrub emails/names/phones/**API keys, tokens,
connection strings**, re-upload, and *"reply here"* if anything looked like a false positive.

Checked against the platform itself:

| Letter says | Platform shows |
| --- | --- |
| "cannot be sold or shown to buyers" | Listing is **Active**, in the public catalog, **Submit a PO** live |
| "failing on the upload" (implies recent) | Last QC run **31 Aug 2026, Run #4** — nothing since; listing "updated 3d ago" |
| urgency: buyers reviewing now | **0 purchases** |
| reply by email | DataVendor has in-platform **Feedback** + **Docs** |

Every QC run reads `Completed`, not failed. The real status badge is
**"Not DV quality certified"**, with **10/32 checks passed** on Run #4.

**Do not reply to that email.** A reply would send a stranger the findings of a scan of
eight private repos, after being prompted to go looking for keys and connection strings.
Ask DataVendor for the Run #4 breakdown **in-platform** instead. Unproven whether the
letter is a phish or sloppy vendor support — the safe action is identical either way.

## 2. The listing's own Terms contradict what is in the bundle

The listing Overview already promises, under **Terms → Excluded**:

> Keys / credentials · HubSpot CRM contents · Chat logs · **Customer PII** · Client material

But `AIPA_AITCF` (= `cto-aipa`) as uploaded contains **230 distinct third-party business
email addresses** in git-tracked files — hospitals, schools, dental clinics, realtors, law
firms across PA/CR/MX — plus `docs/selling/outreach-registry.json` and HubSpot record ids.

**This is the real reason to scrub, and it is independent of the letter.** Shipping the
bundle as-is would deliver a buyer the opposite of what the listing promises.

## 3. Credentials: clean — nothing to rotate

Scanned all repos with exact vendor formats (Resend `re_…`, HubSpot `pat-na1-<uuid>`,
`sk-ant-api…`, `sk-proj-…`, `ghp_`, `gsk_`, `AIza`, `xoxb-`, Telegram bot tokens), in
tracked files **and** across git history:

**0 real credentials, 0 connection strings.** `.gitignore` discipline held. Only
`.env.example` files were ever committed (plus `aideazz`'s `.env.production`, which holds
`VITE_RECAPTCHA_SITE_KEY` — public by design).

⚠️ An earlier pass in this session reported ~49 keys. That was **wrong** — a loose regex
matching ordinary identifiers like `re_getSomething` and a literal `pat-na1-mock`.

## 4. The real 8-pack — and it is NOT what the local repo set suggests

| # | Asset | Reported | Price |
| --- | --- | --- | --- |
| 1 | `AILA` | **0 LOC** | $4,264 |
| 2 | `AIPA_AITCF` (= `cto-aipa`) | JS · TS · Shell | $12,000 |
| 3 | `EspaLuzFamilybot` | 28k LOC | $12,000 |
| 4 | `EspaLuzWhatsApp` | 27k LOC | $12,000 |
| 5 | `EspaLuz_Influencer` | 4k LOC | $12,000 |
| 6 | `VibeJobHunterAIPA_AIMCF` | 54k LOC | $12,000 |
| 7 | `atlas-captures` | **0 LOC** | $4,137 |
| 8 | `dragontrade-agent` | 23k LOC | $6,450 |

- **`aideazz` and `whitespace` are NOT in this listing.** Do not bundle them.
- **`atlas-captures` is not cloned on the laptop** (only `whitespace/scripts/atlas-capture-cron.sh`).
- **Two assets are 0 LOC** and priced **$8,401 combined — 11% of the $74,851**. Fix or
  reprice them; a buyer opening an empty asset is a worse outcome than a lower price.
- `dragontrade-agent` scanned: 77 tracked files, **1** third-party address. Nearly clean.

## 5. The fix — `scripts/build-license-bundle.cjs`

Scrubs an **exported copy**; the working repos are never touched, because the outreach
tooling needs the real addresses to keep running.

- **History-free by construction** — exports the tree with no `.git`, so "clean git
  history" is satisfied **without** a filter-repo rewrite of repos that deploy from git.
- Drops sales/ops dirs: **821 files, only 2 of them code.** Costs the buyer nothing.
- Run on 7 inferred repos: 563 emails, 1,290 phones, 1 HubSpot id replaced →
  independent verify pass found **zero** real addresses remaining.
- Verified non-destructive: all 40 `.cjs` parse, `package.json`/`tsconfig.json`
  byte-identical, model ids intact.

**Two bugs already found and fixed — keep them fixed:**
1. A broad phone regex rewrote `claude-haiku-4-5-20251001` into a phone number. Lookarounds
   `(?<![\w+-])` / `(?![\w-])` are load-bearing. 693 false positives were removed by the fix.
2. `git ls-files` **quotes** non-ASCII paths (`"docs/…/CL\303\215NICA….md"`), so they slipped
   past every `startsWith()` drop-filter and then died in `git show`. Use `ls-files -z`.

**Still to do:** rebuild against the true 8 above (add `atlas-captures` + `dragontrade-agent`,
drop `aideazz` + `whitespace`).

## 6. The ask that matters more than the QC badge

Re-uploading a clean bundle **does not delete the unscrubbed copy already on their
servers**. Ask DataVendor to **purge the prior upload** — in-platform.

---

**Named failure mode:** PII leakage via version control. **Pattern:** clean-room export —
build the distributable from a filtered, history-free copy, never ship the working tree.
**Second lesson:** never let a redactor grade its own work; the independent verify pass is
what caught the corrupted model ids.
