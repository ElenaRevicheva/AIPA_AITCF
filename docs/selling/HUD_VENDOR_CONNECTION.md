# HUD Vendor — can this agent connect?

**Verdict (30 Aug 2026, 22:10 UTC):** the vendor connection **already exists**.
Elena sent **8 private repos** to the preliminary check. That check *is* the
connection. There is **no public vendor API** this agent can call to read the
quote, finish the NDA, or list inventory.

Do not create a `HUD_API_KEY` for this deal. That key belongs to a different
product.

---

## What "connection" means here

Three things share a brand. Only one is the money.

| Thing | URL | What it is | Can the agent connect? |
|---|---|---|---|
| **HUD Vendor / DataVendor** | `datavendor.ai` · `vendor.hud.ai` | Marketplace. GitHub OAuth → estimator → NDA → listing. This is the licence deal. | **Already connected** (Elena's browser). No vendor API. |
| **HUD platform (evals)** | `hud.ai` · `api.beta.hud.ai/v2` | RL environments, tasksets, traces. REST + MCP. Needs `HUD_API_KEY`. | Possible later, **different product**. Do not wire it for the quote. |
| **hud.io** | Cursor `Hud: Sign In` | Runtime-sensor plugin. Square Peg / different company. | Irrelevant. |

Hansel (HUD GTM) published the vendor path: check at `vendor.hud.ai/codebases`,
data kept ≤30 days, no rights transferred at check. Qualifying vendors are
emailed (check email and/or GitHub email), then NDA, then listing. Pay is
7–14 days after a lab accepts. Up to ~$10k per qualifying private codebase;
non-exclusive; you keep ownership.

Login Elena already used: **`aipa@aideazz.xyz`**, org **Aldeazz AI Lab**,
GitHub **`@ElenaRevicheva`**.

---

## What was probed this session

### 1. DataVendor has no public vendor API

HUD's published REST surface (`https://docs.hud.ai/platform/rest-api`,
OpenAPI at `https://api.beta.hud.ai/openapi.json`) is the **evals platform**:
environments, tasksets, runs, traces, secrets, account. Sections: Core, Runs
and evals, Secondary, Utilities, Secrets, Account.

Grep of that document for `vendor`, `codebase`, `datavendor`, `listing`,
`inventory`, `license`: **no matches**. `github_url` appears only as a field
on eval environments.

There is no documented route for: estimator status, quote, NDA, listings, or
"respond to opportunities". Those doors are **browser-session**.

### 2. This Cloud environment cannot reach HUD

Egress is restricted. Allowed list has GitHub, npm, PyPI — not `*.hud.ai` and
not `datavendor.ai`.

Probe 30 Aug 2026 22:05 UTC (`/opt/cursor/artifacts/hud-connection-probe.log`):

| Host | DNS | TLS |
|---|---|---|
| `datavendor.ai` | 216.150.1.1 | `SSL_ERROR_SYSCALL` |
| `vendor.hud.ai` | 216.150.1.193 | `SSL_ERROR_SYSCALL` |
| `hud.ai` / `www.hud.ai` | 216.150.1.1 / .129 | `SSL_ERROR_SYSCALL` |
| `api.beta.hud.ai` | 32.184.58.62 | `SSL_ERROR_SYSCALL` |
| `docs.hud.ai` | 66.33.60.130 | `SSL_ERROR_SYSCALL` |
| `api.github.com` | 140.82.114.6 | connects |

DNS resolves. The firewall kills TLS. Adding egress would let us *read public
docs*. It would **not** create a vendor API, and it would **not** let this
agent finish OAuth or an NDA.

### 3. This agent cannot see the other seven private repos

Cloud GitHub token is scoped to **this** checkout (`ElenaRevicheva/AIPA_AITCF`).

| Repo | From this agent |
|---|---|
| `AIPA_AITCF` | private, `admin: false`, `pull: false` |
| `VibeJobHunterAIPA_AIMCF` | 404 |
| `EspaLuzFamilybot` | 404 |
| `EspaLuzWhatsApp` | 404 |
| `EspaLuz_Influencer` | 404 |
| `dragontrade-agent` | 404 |
| `AILA` | 404 |
| `atlas-captures` | 404 |
| `aideazz` | public (correct — keep it public) |

`GET /user/installations` → 403. This agent cannot list the DataVendor GitHub
App and cannot confirm "All repositories". HUD's own App, if Elena granted
private access, can still archive those eight. A 404 here is a **token
scope**, not proof HUD failed.

### 4. Inbox and CRM are closed from here

- Gmail MCP: `needsAuth`
- Slack MCP: error
- `api.hubapi.com` is not on the egress list (HubSpot goes through Oracle)

The agent cannot watch for HUD's "you qualified" email. Elena can.

---

## What is possible / not

| Action | Who | Possible? |
|---|---|---|
| GitHub → DataVendor OAuth (the vendor connection) | Elena | **Done.** 8 repos in the check. |
| Wait for the estimator number on `datavendor.ai/codebases/result` | Elena | Yes. Screenshot it. |
| Watch `aipa@aideazz.xyz` + GitHub email for qualify / NDA | Elena | Yes. That is HUD's published next step. |
| Send founders letter if the UI stalls or the number is $0 | Elena | Draft: `docs/selling/drafts/hud-vendor-founders-email.txt` on `cursor/hud-vendor-license-1c49`. To: `founders@hud.ai`. Say `sent HUD`. |
| Sign NDA / listing | Elena | Yes. **Refuse exclusive and copyright assignment.** |
| Agent polls the quote / NDA / listings | Agent | **No.** No vendor API. |
| Agent `HUD_API_KEY` → `api.beta.hud.ai` | Agent | Wrong product. Eval traces, not money. |
| Agent flips repo visibility | Agent | **No.** `admin: false`. |
| Cursor `Hud: Sign In` | — | Wrong company (`hud.io`). |

---

## If the check finishes and HUD emails you

1. Read the number. Screenshot it. Tell the agent `HUD quoted $X`.
2. Finish org / NDA if they send one. Keep the standing terms: non-exclusive
   licence of a copy you solely own, for model-training; you keep copyright,
   brand, domains, and the right to keep selling. Production stays up.
3. Disclose the 30 Aug 2026 public→private flip. Private ≠ never-public.
4. Do **not** Bot-quote the leftover public list (`aideazz`, `atuona`, …).
   That stamps $0.

If the UI hangs on "Archiving 1 of 8" or the number never appears: send the
founders letter, use **Submit a data proposal**, **Book a call**. The check
email is enough introduction.

---

## Do not do next

- Do not add `hud.ai` / `datavendor.ai` to Cloud egress *in order to close
  this deal*. The deal is email + browser.
- Do not mint a HUD evals API key and put it in `.env`. That wires the wrong
  product and looks like a connection that is not the licence.
- Do not flip `aideazz` private. That is the portfolio.
- Do not sign exclusive or assign copyright.

Licence packet (flip list, terms, founders letter):
`docs/selling/HUD_VENDOR_LICENSE.md` on `cursor/hud-vendor-license-1c49`.
