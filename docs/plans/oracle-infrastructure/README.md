# Oracle Cloud Infrastructure — AIdeazz

**Server:** `170.9.242.90` (Oracle Cloud, startup credits)  
**Branch:** `docs` in this repo

This folder is the **canonical plan** for all AI products running on the Oracle instance. Sync or copy these docs to [aideazz-private-docs](https://github.com/ElenaRevicheva/aideazz-private-docs) at `docs/plans/oracle-infrastructure/` so private docs stay up to date.

## Contents

| File | Purpose |
|------|---------|
| [OVERVIEW.md](./OVERVIEW.md) | Server specs, canonical list of all 8 AI agents, repos, links, process manager, health endpoints |
| [RESILIENCE.md](./RESILIENCE.md) | How we fix “bots silently die” — systemd/PM2 hardening, health-check cron, OCI keep-alive, deployment checklist |

## Scripts and code

- **Health-check and keep-alive scripts** live in the [AIPA_AITCF (CTO AIPA)](https://github.com/ElenaRevicheva/AIPA_AITCF) repo: `scripts/oracle-resilience/`.
- **Full resilience doc** (with script content): AIPA_AITCF repo, `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`.

## Quick SSH

```bash
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90
```
