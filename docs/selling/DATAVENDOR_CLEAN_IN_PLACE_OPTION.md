# Clean the LISTED repos in place — measured, and it is the better path (5 Sep 2026)

Elena's question: why not surgically clean the repos already on the listing, which are
the ones valued at $89,481, instead of listing lower-valued copies?

Measured rather than argued. She is right, and two earlier claims in this session were
wrong.

## 1. ✅ `pii_qc_llm` scans the HEAD SNAPSHOT, not git history

The decisive test — `dragontrade-agent`, which Megan reported as exactly **2 findings
(EMAIL_ADDRESS)**:

| Where | Distinct third-party emails |
| --- | ---: |
| **HEAD tree** | **2** |
| Full git history | 4 |
| **Megan's report** | **2 findings** |

The finding count matches HEAD exactly and does not match history. Cross-checked on
`EspaLuzFamilybot`: HEAD holds 45 email occurrences + 7 credential URLs against 37
reported findings (an LLM judge filtering doc/example addresses), while history holds
only 24 distinct — fewer than the reported count, so history cannot be the source.

**Consequence: a NORMAL FORWARD COMMIT that removes the PII from HEAD is sufficient to
pass the gate.** No history rewrite. No force-push. No new listing. No archiving.

The repos keep their full history, contributor data and existing measurements — so the
**$89,481 valuation and the listing's standing are preserved**.

## 2. ❌ CORRECTION — the "JS/TS platform gap" does not hold for the originals

Earlier this session I concluded that HUD cannot measure SOURCE LOC for JS/TS repos,
because every JS/TS `-licensed` copy returned `Unavailable`.

**The listing's own QC record contradicts that for the originals:**

```
passed | codebase complexity | ElenaRevicheva/AIPA_AITCF        (TypeScript)
passed | codebase complexity | ElenaRevicheva/dragontrade-agent (JavaScript)
```

Both originals measured. Only my copies lost it. The likely cause is my own drop list:
their note says SOURCE LOC counts *"checked-in generated or vendored code"*, and I
dropped `dist-lambda/` — generated JS — from `AIPA_AITCF`.

**Cleaning in place avoids this entirely**, because nothing is dropped.

## 3. ❌ CORRECTION — `.wwebjs_auth/` is not the bulk of EspaLuzWhatsApp's findings

I claimed it was "almost certainly the bulk of that repo's 219 PII findings." Measured:

| | Emails | Phone-shaped |
| --- | ---: | ---: |
| EspaLuzWhatsApp HEAD, whole repo | 27 | 769 |
| inside `.wwebjs_auth/` | **0** | **24** |

It should still leave the repo — it is a 47 MB authenticated browser session store and
does not belong in git — but the PII case for removing it was overstated.

## 4. Where the PII actually is

### AIPA_AITCF — 1,890 findings, and one directory is 81% of it

| Path | Email occurrences in HEAD | Files |
| --- | ---: | ---: |
| **`docs/selling/`** | **1,306** | **820** |
| `docs/oracle/` | 39 | 14 |
| `docs/applications/` | 4 | 7 |
| everything else | 257 | — |

`docs/oracle/NOW.md` — the shared multi-agent coordination file — holds only **6**. It can
be scrubbed in place and stay; the protocol in PART 1 is not disturbed.

**Only `docs/selling/` has to move.** It is CRM and outreach working material: it does not
belong in a repo being licensed, and it is exactly what the listing Terms already promise
to exclude.

**Destination: `ElenaRevicheva/aideazz-private-docs`** — already exists, already private,
**not on the listing**. A real versioned home, not a gitignored folder that Cursor cannot
see and no backup covers.

### The other four are small

| Repo | Findings | Work |
| --- | ---: | --- |
| dragontrade-agent | 2 | redact 2 addresses |
| EspaLuzFamilybot | 37 | ~45 emails + 7 localhost credential URLs, in docs and `backup_before_postgres/` |
| VibeJobHunterAIPA_AIMCF | 144 | emails, phones, bearer-token references |
| EspaLuzWhatsApp | 219 | 27 emails, real phone numbers, the Railway connection string, and `git rm -r --cached .wwebjs_auth` |

## 5. What "touching the repo" does and does not mean here

Elena's constraint is that running products must not break. This plan respects it:

- **Forward commits only.** No `filter-repo`, no history rewrite, no `--force`.
- **`git rm --cached` + `.gitignore` removes a path from git while leaving the files on
  disk** — locally and on Oracle. The WhatsApp bot keeps its session; nothing is deleted.
- The two repos that deploy from git (`VibeJobHunterAIPA_AIMCF`, `aideazz`) receive an
  ordinary commit on `main`, which is how they are shipped every day.
- 🚨 The Railway passwords must be **rotated** regardless. Redaction never un-publishes.

## 6. The trade, stated plainly

| | Clean in place | Separate `-licensed` repos |
| --- | --- | --- |
| Valuation | **keeps $89,481** | $38,346 |
| Listing | keeps existing, nothing archived | new listing + archive old |
| Risk to running products | forward commits on live repos | **zero** |
| `docs/selling/` | must move to `aideazz-private-docs` | stays put |
| Status | not started | **done and verified** |

The `-licensed` repos remain a working fallback either way, and the tooling built for them
(`build-license-bundle.cjs`, `rebuild-license-history.cjs`) is what produced the evidence
above. Nothing is wasted; the question is only which set gets listed.
