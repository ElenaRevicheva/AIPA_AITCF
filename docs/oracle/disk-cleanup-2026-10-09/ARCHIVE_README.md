# ORACLE ARCHIVE — 9 Oct 2026

Material moved off the Oracle server (ssh alias `oracle-cto-aipa`) during the disk cleanup Elena asked for:
"free up maximum space possible but without destroying live products. Remove only the garbage or duplicated stuff and stop it
to come back in the future". Oracle went from **98% full (1.4 GB free) to 47% (24 GB free)**; every bot verified after.

**Every file here was copied from Oracle and its md5 compared with the original, file by file** (`MD5SUMS.txt`, 4,787 files;
run log `archive_run.log`: 63 VERIFIED, 0 MISMATCH). Only verified items were then removed from Oracle. Paths keep their
Oracle location: `home/ubuntu/...` and `tmp/...`.

| What | Why it is here |
|---|---|
| `home/ubuntu/aigo-*` | promo-film working folders (30 Sep – 4 Oct). The FINAL films stay live on Oracle in `/var/www/influencer-images/` (served to YouTube/Instagram by Make) and on the laptop OneDrive. Stock footage, the demucs venv and node_modules were garbage and not kept. |
| `home/ubuntu/aideazz-api-film*` | API promo film folders (renders served from `/var/www/influencer-images/youtube/`). Their `work/` intermediates were garbage. v19 `fonts/` stays on Oracle. |
| `home/ubuntu/atuona-film7/*` (not venv/models), `atuona-film8`, `atuona-film3/4/5`, `atuona-compile`, `atuona-montage`, `atuona-oneoff`, `atuona-blindtest`, `trailer-sample`, `outlook-art`, `atuona-backups-2026-07-03` | Atuona film working folders. Published films stay in Oracle's public gallery `~/cto-aipa/data/atuona/films/out/`. film7's `venv` + `models` stay on Oracle (film #9 still-motion needs them). |
| `tmp/atuona-hd` | the ONLY copies of the HD1080 upscales of films #7 and #8. |
| `home/ubuntu/atuona-film9/raw` | film #9 API request logs (Oracle keeps an empty `raw/`). |
| `home/ubuntu/backups/*` (EspaLuz/Familybot/influencer/whitespace/aela tgz, journal export, crimson-escape-v1, atlas-assets-IRREPLACEABLE copy), `home/ubuntu/EspaLuzWhatsApp_ORACLE_BACKUP_20260131_185049.tgz`, `home/ubuntu/EspaLuzWhatsApp_backup_jan23_prefix` (without its venv and duplicate WhatsApp session) | old backups — a backup on the same disk is not a backup. Still on Oracle: `atlas-assets-IRREPLACEABLE` (kept there too), `espaluz-pre-persistence` (its restore pointer), `_session-backups/wwebjs_auth.20260906`, small backups, `youtube-published-20260913` (root-owned, 19 MB). |
| `tmp/youtube-api-audit-film-v15` | the only copies of three compile scripts. |

**Restore anything:** `scp -r "D:/ORACLE_ARCHIVE_2026-10-09/home/ubuntu/<folder>" oracle-cto-aipa:/home/ubuntu/` (check `df -h /` first).
Full record: repo `docs/oracle/ORACLE_DISK_FORENSICS_2026-10-09.md` and `docs/oracle/disk-cleanup-2026-10-09/`.
