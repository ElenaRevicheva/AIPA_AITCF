# Cloud Agent Self-Deploy — what changed on July 11, 2026

> **TL;DR:** Cursor Cloud Agents can now deploy to the Oracle fleet **entirely on their own** — no phone, no laptop, no waiting for Elena to press "Run workflow". They commit a product name to `.deploy-trigger` and push to `main`; GitHub Actions does the SSH deploy. The old phone flow still works unchanged.

---

## What we had before (still works)

The original remote-deploy setup (`scripts/oracle-resilience/CLOUD_AGENT_DEPLOY.md`):

1. Cloud agent edits code → pushes to the repo.
2. **Elena** (phone or laptop) → GitHub → Actions → **Deploy to Oracle VM** → Run workflow → pick product.
3. GitHub Actions SSHes into `170.9.242.90` with the `ORACLE_SSH_KEY` secret and runs `scripts/oracle-resilience/deploy-product.sh`.

The limitation: cloud agents **cannot** press the "Run workflow" button. Their GitHub tokens get `HTTP 403: Resource not accessible by integration` on the `workflow_dispatch` API. So every deploy had a human step in the middle.

## What we have now (added July 11, 2026)

A second workflow, **`.github/workflows/deploy-oracle-on-trigger.yml`**, that fires on a plain `git push` — something cloud agents CAN do.

**How it works:**

1. Write the product name as the **first line** of the `.deploy-trigger` file at the repo root.
2. Commit and push to `main`.
3. The workflow reads the product from the file and runs the **exact same** SSH + `deploy-product.sh` path as the phone flow. Same secrets, same registry (`oracle-products.conf`), same health checks.

```bash
# Deploy CTO AIPA (typical cloud-agent one-liner)
echo "cto_aipa" > .deploy-trigger
git add .deploy-trigger && git commit -m "deploy: cto_aipa" && git push origin main
```

**Tip — redeploying the same product twice:** the workflow only fires when `.deploy-trigger` *changes*. Add a throwaway second line to force a new commit:

```bash
printf 'cto_aipa\nretry-%s\n' "$(date -u +%s)" > .deploy-trigger
```

### Valid products (first line of `.deploy-trigger`)

Same choices as the phone workflow — registry lives in `scripts/oracle-resilience/oracle-products.conf`:

| Product | Deploys |
|---------|---------|
| `whatsapp` | EspaLuz WhatsApp (checkout mode — memory-safe) |
| `telegram` | EspaLuz Telegram + payments (checkout mode) |
| `influencer` | EspaLuz Influencer bot |
| `dragontrade` | Algom Alpha PM2 apps |
| `vjh` | VibeJob Hunter loop |
| `vjh_web` | CMO FastAPI :8080 |
| `openclaw` | OpenClaw gateway |
| `cto_aipa` | CTO AIPA + Atuona (pull → `npm ci && npm run build` → PM2 restart) |
| `atlas` | Atlas Shifted radar |
| `aideazz` | **Patch relay (added July 17, 2026):** the box `git am`'s every `scripts/aideazz-patches/*.patch` onto the aideazz repo's `main` and pushes (4everland auto-deploys aideazz.xyz). Exists because cloud agents get 403 pushing to the aideazz repo directly; the box's PAT can. See `scripts/aideazz-patches/README.md`. |
| `blog_html` | **Re-put one cached article** via GitHub Contents API (`pushOneArticleHtml`, same channel as the daily publisher — author Elena, no `[skip ci]`). Second line of `.deploy-trigger` is the slug. |
| `fleet-verify` | **Health check only — deploys nothing.** Runs `verify-fleet-health.sh` across all 9 products + EspaLuz memory-persistence audit. |

## Safety properties (same guarantees as the phone flow)

- **PM2 products** (`cto_aipa`, `atlas`, `dragontrade`): `git pull --ff-only` — the deploy **fails instead of overwriting** if the box has diverged. `.env` and `wallet/` are gitignored and never touched.
- **EspaLuz Python bots**: checkout mode (`git checkout origin/main -- <files>`) — prod JSON (`user_sessions.json`, `family_memory_data/`, trials, PagueloFacil payments) is never overwritten.
- Post-deploy **health check** per product; `fleet-verify` available as a zero-risk audit any time.
- A docs-only or code-only push does **not** trigger a deploy — the workflow fires **only** when `.deploy-trigger` itself changes.

## Gotchas learned during the first live run (July 11, 2026)

- `pm2 restart` **reuses the old process environment** ("Use --update-env to update environment variables"). If `.env` changed (e.g. a rotated `SERPAPI_KEY`), run `pm2 restart cto-aipa --update-env` on the box, or the process keeps the old values.
- `git checkout origin/main -- scripts/` can fail on the box (stale state); the trigger workflow tolerates this and continues with the scripts already present, printing diagnostics.
- The **first** deploy of this workflow failed for exactly that reason — fixed in commit `73f3412`; run [29166101813](https://github.com/ElenaRevicheva/AIPA_AITCF/actions/runs/29166101813) is the first green end-to-end cloud-agent deploy (`cto_aipa`).

## Which flow to use when

| Situation | Use |
|-----------|-----|
| Elena on phone, wants a deploy with a UI button and product picker | **Deploy to Oracle VM** (workflow_dispatch — unchanged) |
| Cursor Cloud Agent finished a change and must ship it live autonomously | **`.deploy-trigger` push** (this doc) |
| Anyone wants a zero-risk "is the fleet healthy?" audit | `.deploy-trigger` = `fleet-verify`, or phone workflow with product `fleet-verify` |

## Proven live

July 11, 2026: a cloud agent shipped the SerpAPI ES-first + Telegram-alert change (`src/serpapi-prospects.ts`, PR #16) end-to-end with zero human steps: branch → PR → fast-forward `main` → `.deploy-trigger` push → Actions SSH deploy → `pm2 restart cto-aipa` → health `OK CTO AIPA + Atuona (#8+#9)` → follow-up `fleet-verify` = **all 9 products + memory persistence green**.
