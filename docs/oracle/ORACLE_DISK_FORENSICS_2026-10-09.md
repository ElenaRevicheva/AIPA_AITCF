# Oracle disk — why the 28 Sep cleanup did not hold (forensics, 9 Oct 2026)

Elena, 9 Oct: "recently claude agent encoded some tools how to clean up oracle memory so to avoid space wasting … dig what
was done and why it did not work". Two investigation rounds, all read-only on Oracle: round 1 (history + live + analyst,
`disk_forensics_2026-10-09_round1.json`) and round 2 (one skeptic per key claim + a completeness critic,
`disk_forensics_2026-10-09_round2_verify.json`). Corrections from round 2 are applied below. **Nothing on the server was
changed by this investigation.**

## The timeline
- **28 Sep** (Claude Code session, commits `c952a81`, `58b90ec`): disk 95% → **69% (14 GB free)**. By hand: old PM2 logs
  gzip-compressed (byte-verified), npm/pip caches cleared. Installed: `pm2-logrotate` (50M, retain 10, compress, daily) and a
  journald cap `SystemMaxUse=1G`. VJH `b38836e` stopped the bot token being logged ~8,640×/day. Note left: "VERIFY tomorrow:
  rotated *.log.gz exist". Open item: film working folders (~7.6 GB) "need a per-film check".
- **30 Sep – 4 Oct:** promo-film work (~/aigo-promo/med/villa/reloc/ig/art) + music stems in /tmp. **6 – 8 Oct:** film #9.
- **7 Oct 16:00** 95% · **8 Oct ~21:00** 100% — found only during the 8 Oct RAM freeze. **9 Oct:** 98% after the film #9
  session deleted its own verified-copied `~/atuona-film9/work` (1.1 GB).

## Each piece of tooling — does it work?
| Tooling | When / who | Status | Evidence |
|---|---|---|---|
| One-off cleanup (compress logs, clear caches) | 28 Sep, Claude | Done once; nothing repeats it | pip cache already back to 245 MB of the 359 MB cleared |
| `pm2-logrotate` rotation | 28 Sep | **Works** | module online since 28 Sep 15:37; rotates nightly; ~/.pm2/logs bounded by retain=10 |
| `pm2-logrotate` **compression** | 28 Sep | **Broken since day one (silent)** | 0 of 107 rotated files gzipped (no gzip header either). Module 3.0.0 `app.js:38-49` `parseBool` accepts only the STRING 'true'; PM2 passes the string "true", but the module's own `pmx` 1.6.8 (`configuration.js:97`, Autocast) turns it into a boolean first → `COMPRESSION=false` |
| The 842 MB old PM2 daemon log | side effect of 28 Sep | Left uncompressed; in practice never removed | `~/.pm2/pm2__2026-09-28_15-38-05.log` 882,455,872 B; retain=10 would delete it only after ~524 MB of new daemon log (today ~4.8 KB/day) |
| journald cap 1 GB | 28 Sep | **Works** | journal 1015.5 MB |
| VJH token-spam fix | 28 Sep | **Works** | 0 token lines in 24 h |
| "VERIFY tomorrow" (.gz exist) | 28 Sep | **Never done** | no later record; would have caught the compression bug on 29 Sep |
| Disk alarm `health_monitor.sh` (warns > 80%) | 19 Mar (`a855b32`), cron */5 | **Alarm with no listener** | ~500 "WARNING: High disk usage" lines — written only to `~/health.log` (keeps ~42 h); no Telegram, nobody reads it |
| Disk check in `check_oracle_health.sh` / NOW §4 checklist | — | **Never existed** | the health check never runs `df`; "check df -h /" first written 8 Oct, after the fact |
| Disk guard / clean-up in film & promo scripts | — | **Never existed** | no script checks free disk; none removes its large working output (the 8 Oct film #9 guard checks RAM, not disk) |
| "Per-film published + backed-up check" before cleaning film folders | 28 Sep rule (memory) | Rule held; **the check was never done** | the 7.6 GB flagged on 28 Sep is still there |
| Ubuntu /tmp cleaner | stock | Works as designed | daily 03:19: deletes entries untouched > 30 days, and wipes /tmp at boot — no reboot since 13 May, so early-Oct scratch stays until ~early Nov |
| Disk-usage history (sysstat) | stock | **Not recording disk** | `SADC_OPTIONS="-S DISK"` (no XDISK) → no history of the climb |
| Health check vs the duplicate `espaluz-webhook` | live copy patched 25 May | **Restart loop** | the old unit crash-loops on port 5000 (held by `espaluz-payments-webhook` since 28 Jun 11:32); the health check restarted it **29,637 times**; `StartLimitIntervalSec` sits in `[Service]` (ignored; `StartLimitBurst` applied as a legacy alias) |
| Repo copy of `check_oracle_health.sh` | last changed 28 Mar | **Stale** | still has the old dragontrade restart loop the live copy fixed by hand 25 May — a redeploy would bring it back |

## Why the disk refilled (28 Sep 14 GB free → 8 Oct ~0.2 GB: about 13.8 GB of NEW growth)
1. **Promo-film folders ~/aigo-*: 7.2 GB** (created 30 Sep – 4 Oct; includes a 1.09 GB demucs Python venv). No tool looks
   at them, no script clears them.
2. **Film #9 ~/atuona-film9: 2.9 GB** (1.8 GB still there + the 1.1 GB `work/` deleted 9 Oct).
3. **/tmp scratch from other sessions: 2.8 GB** (`vjh-test-20261006` 1.25 GB, `demucs_*` stems 1.19 GB, ...).
4. Smaller: uncompressed rotated PM2 logs +0.4 GB; new influencer images +0.38 GB; caches +0.34 GB (mostly the 1 Oct
   demucs install); VJH data a few tens of MB.
**The root cause:** the 28 Sep work fixed **the incident, not the class** — it capped the two kinds of log that filled the
disk last time; the next growth came from a NEW activity (film/promo production, from 30 Sep) that no tool covers. And the
one alarm that saw it coming talked to nobody (**alarm with no listener**); the promised verification never ran (**unverified
fix**); compression failed without an error (**silent failure**).

## Standing space (not the refill, but where the rest of the 45 GB is)
Pre-28 Sep film folders atuona-film7/8 3.0 GB, aideazz-api-film* 2.6 GB, older atuona dirs ~0.7 GB · VJH `autonomous_data`
1.24 GB (`ats_cache` 698 MB never pruned; checkpoint DB 442 MB, +3.1 MB/day) · `/usr` 7.1 GB incl. global npm n8n 2.4 GB +
openclaw 1.2 GB · old EspaLuz backups in ~ 1.4 GB (one touched 3/7 Oct — treat as live) + ~/backups 1.3 GB · ~/.cursor-server
0.6 GB + two old Claude CLI binaries 0.47 GB · venvs inside film/promo dirs 1.6 GB (reinstallable) · /var/log app logs with
no rotation ~0.6 GB · `/tmp/atuona-hd` 0.6 GB.

## Fix proposal — for Elena's approval (nothing done yet)
Repairs (prefer fixing what exists):
- **A. Give the alarm a listener:** `health_monitor.sh` sends one Telegram message via the existing alert bot when the disk
  crosses 85 / 90 / 95% (once per crossing); add `df -h /` to the NOW.md §4 start-of-session check + the Cursor mirror;
  enable disk history in sysstat (`-S XDISK`). No deletion.
- **B. Fix compression:** one-line `parseBool` patch (accept boolean true) or pin pm2-logrotate 2.7.0; then gzip the 107
  rotated logs + the 842 MB daemon log with the 28 Sep byte-verified method → ~1.3 GB. Logs kept, only compressed.
- **C. Close out every film/promo:** a free-disk guard before renders (≥ 5 GB) next to the RAM guard; scratch inside the
  film's own folder, never /tmp; after the final mp4 is md5-verified on the laptop, clear the working folder (rule to be
  approved by Elena; never approved assets). Film renders on the laptop (already the rule since 8 Oct).
- **D. Stop the webhook loop:** disable the duplicate `espaluz-webhook.service` (the payments unit serves port 5000), remove
  it from the live health check, add a logrotate rule for the /var/log app logs (size 20M, rotate 4, compress,
  copytruncate) → ~0.6 GB. Touches EspaLuz — her go.
- **E. Repo hygiene (git only):** commit the live rotation/journal settings as a re-apply script; sync the repo
  `check_oracle_health.sh` with the live fix; move StartLimit keys to `[Unit]` in the repo (applying it live = her go).
Cleanups (each needs her go; other sessions' files):
- **F. /tmp scratch** ~3.5 GB (vjh-test 1.25, demucs stems 1.19, atuona-hd 0.6, qrvenv 0.24) — check nothing runs from
  vjh-test and no promo song needs its stems.
- **G. Folder-by-folder film/promo list:** for each folder — final published? laptop copy md5-matched? — she ticks; venvs
  (1.6 GB) are reinstallable and low-risk. Up to ~13 GB.
- **H. VJH data:** prune `ats_cache` / rotate the checkpoint DB — VJH design decision first.
- **I. Bigger disk:** OCI boot volumes resize online; the shape is VM.Standard.E5.Flex (not Always Free) — check the cost in
  the console first.

## DONE — 9 Oct 2026, with Elena's go ("free up maximum space possible but without destroying live products. Remove only the garbage or duplicated stuff and stop it to come back")
**Result: 98% (1.4 GB free) → 47% (24 GB free).** All bots verified after every step (ports 3000/8081/8080/18789/3001/5000 = 200,
PM2 all online, systemd + OpenClaw active, Make-served promo films + public gallery 200).
How (records in `docs/oracle/disk-cleanup-2026-10-09/`, classification in `disk_cleanup_classification_2026-10-09.json`):
1. **Classified read-only** by a liveness map (40 live paths: bots, nginx sites, Make-served files, crons, open files) + 4
   classifiers + skeptics. Skeptics vetoed 8 removals (only copies of the HD upscales and IG reels, film #9's still-motion venv
   + depth model, the WhatsApp session backup, ...): those were kept or archived first.
2. **Phase 1 garbage, 9.4 GB** (`phase1_garbage.txt`) via `scripts/oracle-resilience/safe-remove.sh` (dry run first; refuses
   protected and in-use paths; logs to `~/safe-remove.log`) + `pip cache purge`, `npm cache clean`, `apt-get clean`.
3. **Logs compressed, byte-verified** (`scripts/oracle-resilience/compress-verified.sh`): 107 rotated PM2 logs + the 842 MB PM2
   daemon log (→ 39 MB); `/var/log` app logs via the new logrotate rule (health log 212 MB → 4.8 MB, family bot 145 → 5.2,
   webhook 278 → 8.9).
4. **Archived to the laptop, md5-verified file by file** (`scripts/oracle-resilience/archive-to-laptop.sh`):
   `D:\ORACLE_ARCHIVE_2026-10-09\` (12 GB, 63 items, 4,787 files, 0 mismatches, README) — then removed from Oracle (11.5 GB).
   Two stuck wait-loops from 30 Sep / 2 Oct (`while pgrep …` that matches itself, never exits) held aigo-promo/aigo-reloc;
   ended, then removed.
Prevention deployed the same day (see the 🛡️ NOW entry): Telegram disk alarm (delivered 98% and "back to 73%"), compression
fix, app-log rotation, duplicate webhook disabled, sysstat disk history, and a **free-disk guard in the film generator**
(`~/atuona-film9/gen.mjs` refuses paid calls under 3 GB free). Still open: VJH data growth (ats_cache, checkpoint DB) — a VJH
design decision; the OCI disk-resize option (cost unverified).
