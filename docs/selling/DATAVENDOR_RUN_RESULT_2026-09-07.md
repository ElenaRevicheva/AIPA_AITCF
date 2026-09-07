# New listing, first full QC run — 7 Sep 2026, 07:45 Panama

**115 of 115 complete. 21 passed, 22 failed.**

## The stale-snapshot problem is SOLVED

`EspaLuzWhatsApp` blind spot, before and after:

    old listing:  314x <no_ext>, 8x .ldb, 4x .mp4, 1x .db-journal, 1x .ogg  +  1x .db, 1x .gz
    new listing:  4x .mp4

The WhatsApp session store is gone from their view. A **new listing** captures fresh;
re-attaching on an existing one does not. No need to send Megan the bug report.

## pii_qc_llm — 4 of 8 pass, up from 1 of 8

| repo | score | actionable findings | what is blocking it |
| --- | ---: | ---: | --- |
| AILA | pass | 0 | — |
| atlas-captures | pass | 0 | — |
| dragontrade-agent | pass | 0 | — |
| EspaLuz_Influencer | pass | 0 | — |
| **EspaLuzWhatsApp** | **69** | **0** | blind spot only: `4x .mp4` |
| **EspaLuzFamilybot** | **69** | **0** | blind spot only: `10x .ogg, 9x .mp3, 2x .mp4` |
| AIPA_AITCF-licensed | 51 | 2 | 1 AUTHORIZATION_BEARER_TOKEN + 1 URL_WITH_CREDENTIALS |
| VibeJobHunterAIPA_AIMCF | 32.1 | 54 | PHONE_NUMBER=43, EMAIL=7, + 4 others |

## New fact: a blind spot alone costs the pass

Both EspaLuz repos have **zero actionable findings** and still score **69 against a pass
mark of 71**. Unscannable binary is not free. The earlier model
(`score = 55 - 5.75*ln(findings)`) only describes repos that HAVE findings; at zero
findings the score is set by scan completeness, and an unreadable media file is enough to
hold it two points under.

**So a repo passes only when it has zero findings AND nothing unscannable.**

## My scanner's blind spot — HUD reads PDFs, mine skips them

VibeJobHunter reports **43 phone numbers**; my scanner reports zero. The difference is the
seven tracked resume PDFs under `autonomous_data/resumes/`. HUD extracts their text; my
`hudscan` treats any file with a NUL byte in the first 4 KB as binary and skips it.

That is the same shape as every other mistake this week: **a negative result is only as
wide as the query.** The guard needs PDF text extraction before it can be trusted on a repo
that ships documents.

## What each remaining repo needs

1. **EspaLuzWhatsApp** — the four `.mp4` are ffmpeg inputs in `espaluz_bridge.py`
   (`looped_video.mp4`, `espaluz_conversation_mode*.mp4`) plus an unreferenced
   `espaluz_loop.mp4`. Untracking them clears the blind spot but removes a working feature
   from the licensed copy. **Elena's call.**
2. **EspaLuzFamilybot** — 21 media files, same question.
3. **AIPA_AITCF-licensed** — 2 findings, both in
   `scripts/oracle-resilience/oracle-fix-git-https-auth.sh` and
   `oracle-setup-github-ssh-fleet.sh`, where `https://x-access-token:<something>@host`
   appears in one literal. Mechanical to fix; no behaviour change.
4. **VibeJobHunter** — untrack the seven resume PDFs (runtime data, same treatment as
   profile.json: back up on Oracle first, since this repo deploys by `git pull`).
