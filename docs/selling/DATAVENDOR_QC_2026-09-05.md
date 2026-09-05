# DataVendor QC — Megan's answer, and two corrections to yesterday (5 Sep 2026)

Supersedes the verdicts in `DATAVENDOR_QC_2026-09-04.md`. That document is still
correct about the clean-room approach and the scrubber bugs; it is **wrong on two
findings**, both corrected here.

## 1. Megan answered. The PII gate is the money gate.

Megan Chang (Customer Operation Lead, hud.ai / datavendor.ai) replied to Elena's
31 Aug + 4 Sep thread. Her answer settles the question that mattered:

> "We're actively matching codebase opportunity with inventory on Datavendor, and
> if the repo failed PII check, it cannot be sell."

**"Not DV quality certified" is not cosmetic. A repo failing `pii_qc_llm` cannot be
sold.** This is the single blocker between the listing and revenue.

Her instruction, verbatim in effect:

- Upload a **new listing** with the PII cleaned.
- **Archive** the previous one.
- The current listing may **stay live** while the cleaning happens.

She also named the failing repos and their finding types — the per-repo detail the
vendor UI does not expose anywhere:

| Repo | Findings | Types named |
| --- | ---: | --- |
| `ElenaRevicheva/AIPA_AITCF` | 1890 | AUTHORIZATION_BEARER_TOKEN, EMAIL_ADDRESS, GENERIC_SECRET_ASSIGNMENT, PHONE_NUMBER, PRIVATE_KEY, SECRET_PRIVATE_KEY, URL_WITH_CREDENTIALS |
| `ElenaRevicheva/EspaLuzWhatsApp` | 219 | ANTHROPIC_API_KEY, EMAIL_ADDRESS, GENERIC_SECRET_ASSIGNMENT, OVERLAPPING_SENSITIVE_DATA, PHONE_NUMBER, SECRET_SECRET_KEYWORD, URL_WITH_CREDENTIALS |
| `ElenaRevicheva/VibeJobHunterAIPA_AIMCF` | 144 | AUTHORIZATION_BEARER_TOKEN, EMAIL_ADDRESS, PHONE_NUMBER |
| `ElenaRevicheva/EspaLuzFamilybot` | 37 | EMAIL_ADDRESS, OVERLAPPING_SENSITIVE_DATA, PHONE_NUMBER, URL_WITH_CREDENTIALS |
| `ElenaRevicheva/dragontrade-agent` | 2 | EMAIL_ADDRESS |

## 2. ❌ CORRECTION — the "Hansel" letter was NOT phishing

`hansel.tantohari@hud-data-services.com` **is DataVendor.** Megan:

> "We're recently testing out a new email campaign and this email is indeed from us."

The 4 Sep call of "⛔ It is phishing. The sender domain settles it." was **wrong**,
and so is the NOW.md trap that repeated it. Both are corrected.

**What was actually right about the analysis:** every checkable claim in the letter
still contradicted the dashboard, the sending domain still matches neither brand,
and it still asks vendors to hunt for credentials and reply by email. The reasoning
was sound; the conclusion was not. **A sender domain that fails to match is evidence,
not proof** — it is equally consistent with a vendor running a campaign off a
marketing domain, which is exactly what happened.

The safe action was identical either way, so nothing was lost by being wrong: Elena
did not reply, did not click, and asked in-platform. **Do not treat "the safe action
was the same" as "the call was right."** It was not.

Standing guidance that survives unchanged: **never email a credential**, to anyone,
including a real vendor who asks for one.

## 3. ❌ CORRECTION — credentials were NOT clean. Two live ones shipped.

The 4 Sep doc said: *"0 real credentials, 0 connection strings. `.gitignore`
discipline held."* **That was wrong**, and it was wrong in the more dangerous
direction.

Found 5 Sep by re-scanning specifically for the types Megan named:

| Where | What | State |
| --- | --- | --- |
| `EspaLuzWhatsApp/scripts/migrations/export_railway_data.sh` | Live Railway PostgreSQL connection string, password in clear, **in HEAD**, plus the same password in a `PGPASSWORD` export | 🚨 **ROTATE** |
| `dragontrade-agent` (git history) | Second live Railway PostgreSQL connection string | 🚨 **ROTATE** |
| `EspaLuzFamilybot`, `EspaLuzWhatsApp` | Local DB passwords (`EspaLuz2026!`, `espaluz_secure_2026`) across 9 files | Rotate on the Oracle box |
| `dragontrade-agent/test-oracle-db.cjs` | `dragontrade_secure_2026` | Rotate on the Oracle box |

Both Railway proxy hostnames still resolve to live Railway IPs (checked passively
by DNS; nothing was connected to).

### Why the earlier scan missed it — the named lesson

The 4 Sep scan searched for **vendor key formats**: `re_…`, `pat-na1-<uuid>`,
`sk-ant-api…`, `sk-proj-…`, `ghp_`, `gsk_`, `AIza`, `xoxb-`, Telegram bot tokens.
It found none, and that was true. But a **database connection string is not a
vendor key** — it is a URL. It matched no pattern in the list, so it returned zero,
and zero was read as "clean".

> **Named failure mode: a negative result is only as wide as the query.**
> Absence of a vendor key is not absence of a credential. The scan answered the
> question it was asked and was reported as if it had answered a broader one.

This is the same shape as the incident this repo already carries about SerpAPI —
a key existing proves nothing about the balance behind it. Both are cases of a
check whose *scope* is narrower than the *claim* made from it.

## 4. The fix — `scripts/build-license-bundle.cjs` now has a secrets pass

The scrubber had **no secret handling at all**. It scrubbed emails, phones and
HubSpot ids, and dropped `.env`/`.pem`/`.key` files — which is why it produced a
"clean" bundle that still carried a live Postgres password in a `.sh` file.

Added pass 2, covering exactly the classes Megan's scanner names:

- `URL_WITH_CREDENTIALS` — `scheme://user:pass@host` → `user:REDACTED@`
- `PRIVATE_KEY` / `SECRET_PRIVATE_KEY` — PEM bodies, only when a real body exists
- `ANTHROPIC_API_KEY` and 12 other vendor key shapes
- `GENERIC_SECRET_ASSIGNMENT` / `SECRET_SECRET_KEYWORD` — secret-ish name **and**
  secret-ish quoted literal; both halves must qualify
- `AUTHORIZATION_BEARER_TOKEN` — skips `Bearer SOME_ENV_VAR_NAME` in prose
- SQL `ALTER/CREATE USER … WITH PASSWORD 'x'` — has no `=` or `:`, so the
  assignment rule never saw it
- Managed-DB proxy hostnames (`*.proxy.rlwy.net`)

**Three traps kept from the earlier bugs, plus one new:**

1. The phone regex lookarounds are load-bearing — they are what stops
   `claude-haiku-4-5-20251001` becoming a phone number. Verified intact this run.
2. `git ls-files -z`, never plain `ls-files` — git quotes non-ASCII paths.
3. The Resend rule requires the two-segment shape `re_xxx_yyy`; a loose
   `re_[A-Za-z0-9]{20,}` matched ordinary identifiers like `re_getSomething`.
4. **New:** the verify rule for credential URLs needs `(?!REDACTED@)`. Without it
   the checker flags the scrubber's own replacement, the gate can never go green,
   and it reads exactly like a real failure.

### The SQL-password call worth remembering

Two remaining hits were genuine doc placeholders (`'secure_password_here'`). The
tempting fix was to teach the verifier to forgive placeholders — but that makes the
checker mirror the scrubber, and a checker that shares the scrubber's judgement
cannot catch the scrubber's mistakes. Instead the **scrub** was made absolute: no
quoted password literal survives in SQL DDL, placeholder or not. It costs the buyer
nothing and buys an invariant a blunt checker can confirm.

> **An invariant a dumb checker can confirm beats a clever rule it has to be
> taught to share.**

## 5. Build result — verified

```
  AIPA_AITCF                350 files kept
  EspaLuzWhatsApp           551
  VibeJobHunterAIPA_AIMCF   197
  EspaLuzFamilybot          189
  dragontrade-agent          76
  EspaLuz_Influencer         73
  AILA                        9
  atlas-captures            skip (no local clone)

PII     files=1445 dropped=846 emails=380 phones=1296 hubspotIds=2
SECRETS urlCreds=15 privateKeys=0 vendorKeys=0 secretAssignments=20
        bearerTokens=1 sqlPasswords=4 dbHosts=5

VERIFY: clean — no PII and no secrets remain     (exit 0)
```

**Non-destructive, checked rather than assumed:**

- 160 JS/CJS/MJS files — all parse.
- `package.json` / `tsconfig.json` — byte-identical to HEAD.
- Model identifiers intact; zero mangled into phone shapes.
- 4 files fail to parse in the bundle (2 JSON, 2 Python). **All four are already
  broken in HEAD, identically** — `emotional_promo_engine.json` (bad control
  character), `target_companies.json` (BOM), `find_new_subs.py` ×2 (unterminated
  string, line 40). Not caused by the scrub.
- 7 zips, **0 `.git` entries**, **0 canary hits** across all of them.

Artifacts:
- Tree: `D:/aideazz/_license-bundle-2026-09-05/`
- Upload zips: `D:/aideazz/_license-upload-2026-09-05/` (243 MB total)
- Canary list: `D:/aideazz/_license-canaries.txt` — **outside every repo on
  purpose.** It holds the exact strings that must not ship, so committing it
  anywhere would defeat the check it powers. Same rule as the cédula near-miss:
  an identifier belongs in dropped data, never in a shipped script.

## 5b. 🚨 A live WhatsApp Web session was committed — and both passes were blind to it

Found while checking why `atlas-captures` (a 2-file data repo) would be handled at all.

`EspaLuzWhatsApp` tracks **378 files / 47.2 MB** under `.wwebjs_auth/session/` — a
Chromium profile for an **authenticated WhatsApp Web session**: `Cache_Data`, Local
Storage, Session Storage, IndexedDB, LevelDB. That is authentication material plus
cached contact and message data, and it is almost certainly the bulk of that repo's
219 PII findings.

**It was invisible to both halves of the tool at once.** The scrub pass rewrote only
files matching `TEXT_EXT`, and the verify pass *walked the same allowlist*. `.log`,
`.ldb`, `.jsonl`, `.tsv` and `.diff` were on neither list — so those files were
copied byte-for-byte **and then not checked**. A file nobody thought to name was
both unscrubbed and unverified.

> **Named failure mode: an allowlist shared by the fixer and the checker is a single
> point of failure wearing two hats.** The independent verify pass was not
> independent — it inherited the scrubber's assumption about where secrets live.

Three fixes:

1. **Dropped entirely** — `.wwebjs_auth/`, `__pycache__/`, `node_modules/`, `.venv/`,
   and `*.pyc`, `*.ldb`, `*.pid`, `*.log`, `*.sqlite`, `*.db`. Compiled Python embeds
   string literals, so a `.pyc` can carry a secret the `.py` no longer does.
2. **Verify now sniffs bytes, not extensions** — NUL byte or >5% control characters
   means binary; everything else is scanned whatever it is called.
3. **Scrub uses the same sniff as a fallback**, so anything verify inspects, scrub
   has already processed. Every extension previously added to that allowlist was a
   bug report; it is no longer the primary gate.

The sniff paid for itself on the first run: it immediately caught a real address in
`scripts/espaluz-hotfixes/kinder-preference-fix.diff`, a file the allowlist had
never looked at.

**Effect on the bundle:** `EspaLuzWhatsApp` fell from **551 files to 169**, and total
dropped rose from 846 to **1,234**. Nothing a buyer needs was lost.

## 5c. Delivery is GitHub, not zips

`Settings → Integrations` reads **GitHub · Connected — "Sell repositories you host on
GitHub."** Assets are identified as `ElenaRevicheva/<repo>` and `Repository snapshot`
is a mandatory check. **There is no zip upload path for a codebase asset**, so the
zips built earlier on 5 Sep were the wrong artifact and have been deleted.

The cleaned trees must exist as **GitHub repositories**.
`scripts/publish-license-repos.cjs` pushes each to a **new private** repo, one commit,
no history — gated on `--verify-only` exiting 0 and refusing any tree with a nested
`.git`. New repos, never a history rewrite: `VibeJobHunterAIPA_AIMCF` and `aideazz`
deploy from git and are held at `origin/main`.

Full per-check breakdown, and why cleaning PII fixes only 5 of the 22 failures:
`docs/selling/DATAVENDOR_QC_RUN4_BREAKDOWN.md`.

## 6. Open — Elena's move

1. 🚨 **Rotate both Railway PostgreSQL passwords.** Credential action, hers alone.
   Redaction does not undo distribution — the old upload still sits on DataVendor's
   servers.
2. **Send the reply** — `docs/selling/drafts/megan-hud-qc-cleanup-2026-09-05.txt`.
   It discloses the two live credentials, asks DataVendor to **purge the prior
   upload**, and asks the one question that gates the re-upload: *does archiving
   forfeit the opportunity matching or the $89,481 estimator valuation?*
3. **Do not archive the current listing until that answer arrives.** Megan
   confirmed it can stay live while cleaning, so there is no cost to waiting and
   an unknown cost to guessing.
