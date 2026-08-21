# Handoff — 21 Aug 2026 — Telegram-ops canonical 404 (git ahead of pin)

**Read this before pushing more aideazz commits.** The next agent should **not**
retry git-am stamps or Contents API puts expecting the live CID to move.

Stopped: 21 Aug 2026 ~22:20 UTC. Cloud agent run:
https://cursor.com/agents/bc-7f8b7980-52f7-4acb-8e11-48a0f73207b1

---

## What is still broken (live)

Canonical GEO URL:

`https://aideazz.xyz/blog/telegram-my-ai-agent-ops-dashboard-not-a-web-ui/`

(trailing slash is the real file; IPFS 301s slashless → slash)

| Surface | State |
| --- | --- |
| Dev.to | Live; canonical points at the aideazz URL |
| `/portfolio` | Lists it (Oracle `GET /blog/posts`, not IPFS) |
| GitHub `ElenaRevicheva/aideazz` `main` | HTML present (`public/blog/<slug>/index.html`) |
| 4everland project card | Still **`29d1a63`** — `ai-ops-wiki: refresh journal +` **20 Aug 21:30 UTC** |
| Live `x-ipfs-path` CID | `bafybeibllpftpprs4kg4p4jjrjsrhddgxl5h5cd3af36abhovxizm25z5m` |
| Live HTTP | **404** `no link named "telegram-my-ai-agent-ops-dashboard-not-a-web-ui"` |
| Article audit | **D 47/100**, no `<title>` (GHA `32528413398` at 21:25:37 UTC) |
| `/portfolio`, `/blog` | Still A+ 100 on the same run |

Elena’s 4everland screenshot (21 Aug evening) matches this: Successful, `main`,
commit **`29d1a6`**, CID **`bafybeibllpftpprs4kg4p4jjrjsrhddgxl5h5cd3af36abhovxizm25z5m`**,
“1d ago”. That card is the **last pin**, not GitHub HEAD.

`git compare 29d1a63...main` was **64 commits ahead** at 21:44 UTC. GitHub HEAD
had already moved again (wiki-ship `9cfe92b` at 21:30 UTC 21 Aug — same job as
yesterday, one day later). 4everland did not build it.

---

## What 20 Aug actually did (the working path)

Post that **is** in the live CID:
`why-my-ai-agent-ops-dashboard-is-a-telegram-bot`

1. Oracle `cto-aipa` `pushOneArticleHtml` → GitHub Contents API.
2. Commit `e07f2a1` 20 Aug **19:31:17Z** — author **Elena**, message
   `chore(blog-static): regenerate <slug>/index.html`, file **added**.
3. **`4everland[bot]`** GitHub Deployment `production` 19:31:48Z, **success**
   19:32:58Z. That bot runs `npm run build` / output `dist` and cuts a new CID.

Same bot also built wiki-ship `29d1a63` at 20 Aug 21:30–21:31. **Last
`4everland[bot]` production deploy: 20 Aug 21:31:15Z.** None since.

Check-suites stay `queued` even on the working commit. **Do not use check-suite
status.** Use Deployments API, creator `4everland[bot]`.

`[skip ci]` is not what 4everland used on 20 Aug — `e70f711` had skip-ci and
still got a bot deploy. Today’s eligible no-skip-ci puts got **zero** deploys.

---

## What this session already shipped (do not redo)

### AIPA_AITCF (`main`)

- Publisher guard: `src/blog-github-commit.ts`, `src/daily-blog-publisher.ts`
  (`shipNewArticleCanonical` awaits one-article HTML put; sitemap has no skip-ci;
  Telegram does not claim published if the HTML put failed). Oracle `cto-aipa`
  already running this (`27d79ce` era).
- Dev.to preface: domain, not italic `AIdeazz` (the `I` closed emphasis →
  “Aldeazz”).
- `scripts/test-blog-canonical-ship.cjs` — includes republish-CLI checks.
- GHA visibility dump of the live Telegram URL + pin stamp
  (`.github/workflows/visibility-self-audit.yml`). Article audit
  `continue-on-error: true`.
- Aideazz patches `0003`–`0006` in `scripts/aideazz-patches/` (gitignored
  `*.patch` — `git add -f`). `0006` is the wiki chapter + concept.
- **`blog_html` deploy-trigger product** — Oracle re-runs the 20 Aug Contents
  API path: `scripts/republish-blog-html.cjs` +
  `scripts/oracle-resilience/republish-blog-html.sh`.
  `.github/workflows/deploy-oracle-on-trigger.yml` accepts product `blog_html`;
  line 2 of `.deploy-trigger` is the slug.

Fired and **OK** (Oracle run `32528131288`):

```
📄 BlogStatic republish OK telegram-my-ai-agent-ops-dashboard-not-a-web-ui
📍 Sitemap committed to GitHub ✅
```

GitHub (author Elena): `7826dd1` HTML 21:21:50Z, `d28d8c3` sitemap 21:21:51Z.

PRs (already on `main` via ff): #26 (earlier pin/publisher), #27 (wiki patch
relay), #28 (`blog_html`).

### aideazz `main` (GitHub, not the live pin)

- `public/blog/telegram-my-ai-agent-ops-dashboard-not-a-web-ui/index.html`
- Wiki: `content/ai-ops-wiki/incidents/2026-08-21-git-ahead-of-pin.md`
  + `concepts/git-is-not-the-origin.md` + generated `public/ai-ops-wiki.html`
  (Rev 14). **`blog: no`** until the CID moves.
- `BlogPost.tsx`: show English while Spanish “Traduciendo…” polls;
  `AbortSignal.timeout(12000)`. Not in the live JS bundle until 4everland builds.

Cloud agents **403** pushing `aideazz` directly. Oracle relay:
`.deploy-trigger` first line `aideazz` (patches) or `blog_html` (Contents API).
Push the trigger commit **to `main` first** — a SHA first pushed on a feature
branch then fast-forwarded did **not** queue GHA (`ede2f94`). Retry on a
main-first SHA (`0d226e2`) did.

This VM cannot `curl` `aideazz.xyz` (egress). Live proof =
`.audit-trigger` on `main` or `cursor/**` →
`scripts/visibility-self-audit.cjs`.

---

## What the next agent should do

1. **Ask Elena if she Redeployed.** Dashboard:
   https://dashboard.4everland.org → Hosting → project **aideazz**
   (repo `ElenaRevicheva/aideazz`, domain `aideazz.xyz`).
   Success on the **card**: SHA ≠ `29d1a63`, CID ≠
   `bafybeibllpftpprs4kg4p4jjrjsrhddgxl5h5cd3af36abhovxizm25z5m`.
   Settings → Git: **Deploy Hook ON** (git pushes are not becoming deploys).
2. **Do not** push more no-skip-ci stamps, wiki-ship, or `blog_html` retries
   until that card SHA moves. Three eligible channels already ran today
   (Elena new-file put, Elena republish, Oracle git-am wiki). Zero bot deploys.
3. After Redeploy (~90–180s): bump `.audit-trigger` on `main` (new SHA,
   **push `main` first**). Pass:
   - new `x-ipfs-path` CID
   - HTTP 200
   - `<title>Telegram: My AI Agent Ops Dashboard, Not a Web UI | AIdeazz</title>`
4. Then the wiki HTML already in git becomes live. Do **not** mark the
   incident `blog: yes` until that proof exists.
5. Spanish spinner fix rides the same rebuild.

There is **no** 4everland hosting token in this repo or in the cloud-agent
`.env`. Agents cannot be `4everland[bot]`.

---

## Named lesson (for Elena / interviews)

Git and Dev.to advertised a URL whose directory is not in the live pin. A
Contents API put is a **receipt**. The CID / `4everland[bot]` Deployment is
**completion**. Names: **git is not the origin**, **acknowledgement is not
completion**, **verify from logs** (Deployments API + `x-ipfs-path`, not
`git log`).

Ready-to-say: “On 20 Aug the daily HTML put was followed in 31 seconds by a
`4everland[bot]` production deploy. On 21 Aug the identical Elena put got no
deploy; the dashboard still showed `29d1a63` and CID `bafybei…z5m` while
GitHub `main` was 64 commits ahead.”
