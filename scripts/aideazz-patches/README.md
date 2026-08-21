# Patch relay for the `aideazz` repo (aideazz.xyz portfolio)

Cursor cloud agents can push to `AIPA_AITCF` but get **403 denied** on
`ElenaRevicheva/aideazz`. Solution (July 17, 2026): park verified patches here,
then push `aideazz` as the `.deploy-trigger` product — the Oracle box (which
holds a full PAT in its git credential store) runs
`scripts/oracle-resilience/push-aideazz-patch.sh`: it syncs
`/home/ubuntu/aideazz`, `git am`'s every `*.patch` in this folder (skipping
already-applied ones, aborting on conflict), and pushes `main` so 4everland
auto-deploys.

```bash
printf 'aideazz\nreason-%s\n' "$(date -u +%s)" > .deploy-trigger
git add .deploy-trigger && git commit -m "deploy: aideazz (<what>)" && git push origin main
```

`0001-geo-card-visibility-api.patch` shipped this way on July 17, 2026
(aideazz commit `bfdcd0b`, Actions run 29620502489). Applied patches stay in
the folder as a record — the relay script skips them via reverse-apply check.

## What `0001-geo-card-visibility-api.patch` does

On the `/portfolio` page's **GEO + SEO Engine** card (bilingual EN/ES):

- Adds a plain-language paragraph about the AIdeazz Lab **AI Visibility Audit API**
  (free endpoint, 0–100 score, 34 checks, AEO/GEO/tech-SEO, scored diagnosis for
  bot-blocked / JS-only sites, "this site scores A+ 100/100 on its own engine").
- Updates the Traction line: "Public AI Visibility Audit API live • aideazz.xyz
  scores A+ 100/100 on its own engine • …".
- Adds a second card button — "Audit your site free — AI Visibility API" — linking
  to the existing `/api` page (which already calls the production endpoint).
- `BusinessCard.tsx`: the aiCoFounders card renderer now supports `extraLinks`
  (previously only the EspaLuz/Algom card list rendered them).

## Apply it (from a laptop with aideazz push access)

```bash
cd aideazz
git checkout main && git pull
git am path/to/0001-geo-card-visibility-api.patch
git push origin main   # 4everland auto-deploys
```

Or: grant the Cursor GitHub App access to the `aideazz` repo
(GitHub → Settings → Applications → Cursor → Repository access), then any
cloud agent can push it directly.

`0002-portfolio-first-seo.patch` — see file.

## What `0003-pin-telegram-blog-html.patch` does

The 21 Aug 2026 daily post `telegram-my-ai-agent-ops-dashboard-not-a-web-ui`
landed on Dev.to and `/portfolio` while 4everland's IPFS pin still had no
`public/blog/<slug>/` directory (`no link named "telegram-my-ai-agent-ops-dashboard-not-a-web-ui"`).
This patch (1) comments the existing static HTML so 4everland rebuilds without
`[skip ci]`, and (2) shows the English body while the Spanish translation poll
runs instead of hiding it behind "Traduciendo…".

`0004-4everland-rebuild-stamp.patch` is a follow-up no-skip-ci stamp
(`public/4everland-pin-stamp.txt`) if the first pin commit did not change the CID.

`0005-wiki-refresh-pin-telegram-post.patch` — wiki-ship-shaped sitemap/geo refresh
so the Telegram-ops HTML already in git is in the pin. Applied; live CID did not move.

`0006-wiki-git-ahead-of-pin.patch` — new wiki chapter + concept (`git-is-not-the-origin`)
for the 21 Aug 2026 incident (56 skip-ci commits, then eligible SHAs, live CID unchanged).
Regenerates `public/ai-ops-wiki.html` (Rev 14) and restamps the pin file. No `[skip ci]`.

