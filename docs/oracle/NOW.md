# NOW — the shared session between Cursor and Claude Code

**Cursor Cloud, Cursor Desktop and Claude Code all work this repo and none of them can
see each other's chats.** No shared conversation, no Claude MCP in Cursor, no way to send
the other agent a message. The only things all of them read are **HubSpot** and **this
file**.

So this file is not documentation. It is the working memory of whichever agent is not
currently running, and the protocol below is how two agents that cannot talk avoid
destroying each other's work.

---

# PART 1 — THE PROTOCOL

## 1. The session board — claim before you touch

There is no file locking. This table is the substitute, and it works only because both
agents keep it honest.

| Agent | Claimed (UTC) | Working on | Touching (files / services) | Last commit |
|---|---|---|---|---|
| _(free)_ | — | — | — | — |

**Rules**
- **Before editing shared code or restarting a service, add your row.** Commit and push
  that row *first*, before the work. It costs one commit and prevents the whole class.
- **Delete your row when you stop.** A finished agent leaves no claim.
- **A claim older than 2 hours with no newer commit from that agent is dead — take it.**
  Sessions crash and browsers close; a permanent lock is worse than no lock.
- **If a row is live and you need those files: work somewhere else.** Do not "just be
  careful". Add a line under HANDOFF saying what you wanted, and move on.

## 2. Everything lands on `main`

**Earned 30 Aug 2026.** NOW.md was created 25 Aug on branch
`cursor/intelliops-bd-money-play-abc0` and never merged. From `main` — what Claude Code
reads and Oracle runs — it did not exist, so a second copy was written five days later.
Both agents were right about their own branch and neither could see the other.

**A shared-state file on a branch the other tool never reads is a private note.**

If your work must live on a branch, the NOW.md update still goes to `main` on its own,
naming the branch and what is on it.

## 3. Never destroy — the collision rules

- **Never `git push --force`.** Ever, on any shared branch.
- **Never `git reset`/`git checkout --` a file you did not write this session.**
- **Same file, both changed → merge, do not overwrite.** When two versions conflict, the
  one with a *verification* attached wins; if neither has one, keep both and reconcile.
- **Never blind `git pull` on Oracle's `cto-aipa`** — it deploys by `scp` of named files
  plus `pm2 restart`, so its checkout is *meant* to lag `main`. Pulling is how a running
  process and its disk start disagreeing. (`VibeJobHunterAIPA_AIMCF` and `aideazz` are the
  opposite: they deploy by git and are held exactly at `origin/main`.)
- **One deployer at a time.** Before restarting a service, check its uptime. If it
  restarted in the last 10 minutes, someone is mid-deploy — wait.

## 4. Catch the other's fall — run this at session start

Every item below is a real failure that shipped. Two minutes, before any new work.

1. **Read this file, then `git log --oneline -15`.** Anything from the other agent you did
   not expect? Any work sitting on a branch?
2. **Did the last deploy actually take?** Process start time must be *newer* than the file
   it loads:
   `systemctl show vibejobhunter -p ActiveEnterTimestamp` vs `stat -c %y <file>`
3. **Did the last change produce OUTPUT, not just run?** This is the one that bites.
   A source logged "197 jobs" hourly for a full day and delivered zero. Grep the *result*
   line, never the *ran* line.
4. **Is any claim on the board stale?** Older than 2h with no commit → release it.
5. **Check the DELIBERATE list below before "fixing" anything that looks broken.**

## 5. A work product lives in a file or in HubSpot — never only in a chat

**Earned 1 Sep 2026.** Cursor drafted preparation for the Evaboot role and it existed
only inside a Cursor chat window. Searched every Cursor database on the laptop — global
storage plus all ten workspace stores, every table and column — **zero hits**. It is not
recoverable, and the other agent would have rewritten it from nothing.

A letter, a brief, an application answer, a plan, a set of findings — the moment it is
something Elena would use, it goes to **one of two places**, immediately:

- **a file** in `docs/` (committed and pushed to `main`), or
- **a HubSpot note** on the deal it belongs to.

Chat is where the work is *discussed*. It is not where the work is *kept*. A chat window
is a private note with an expiry date: the other agent cannot read it, the session board
cannot see it, and closing the tab destroys it.

If you are mid-draft and it is not finished, still write it down — a rough file beats a
perfect message nobody else can reach.

## 6. How to pause — the handoff block

When you stop mid-task, replace the HANDOFF section with exactly these four lines. An
agent that pauses without one has lost the work, even if the code is committed.

- **DONE:** what is finished *and verified*, with the evidence
- **NEXT:** the single next action, concretely enough to start cold
- **VERIFIED BY:** the command or log line that proves the DONE claim
- **RISK:** what will break or mislead if the next agent assumes wrongly

## 7. 🚫 DELIBERATE — these look broken and are not. Do not "fix" them.

| Thing | Why it is like that |
|---|---|
| **Wellfound returns 0 / dormant** | Its private GraphQL API changed. Not scraped harder on purpose — re-guessing a private endpoint every release is a treadmill, not a source. |
| **YC Work at a Startup not scraped** | Its `/jobs` page *is* public and easy to parse. YC's ToS forbids automated extraction. robots.txt allowing ≠ ToS permission. |
| **agentic-engineering-jobs.com not wired** | Newest posting 33 days old, 91% past its own expiry. Rejected on measurement. |
| **Oracle `cto-aipa` behind `main`** | Deploys by named-file `scp`, not `git pull`. See rule 3. |
| **`test_provider_chain[claude]` fails** | Anthropic credits are at zero. The eval is *correctly* reporting it. |
| **AI-Jobs.net / BrightData LinkedIn dormant** | Measured lifetime yield ~0. Env flags exist to wake them. |

## 8. What belongs in this file

The queue and whose move it is · what is open or known-broken · what is stranded on a
branch · standing traps · what just landed, briefly.

**Not** here: architecture, post-mortems, anything already in `docs/`, the memory files or
the AI Ops Wiki. Link to those. **Keep it to one screen per part** — delete finished lines;
git log keeps the record.

---

# PART 2 — CURRENT STATE

## 🤝 HANDOFF

- **DONE 5 Sep — tap note now shows today’s ENTREGADO/ABIERTO.** Elena
  had note `116418923178` open (only `EMAILED via HubSpot UI`). Actions
  `33965178681` → `✓ update note 116418923178` with the verified
  Resend lines (id `30f57283-…`). Close and reopen that same note.
  Original stamps remain on 25 Aug note `115571559227`. Do not tap
  `intelliops-bd`. Do not send again.
- **DONE 5 Sep — both IntelliOps PDFs re-read; briefing is on the deal.**
  Deal `64302436100` `[HIRING-MANUAL] BD Expert @ IntelliOps Automation`.
  Send note `116421825140`. Addendum section numbers match v2.
- **DONE 4 Sep — Datastar NDA SENT. Deal `64678307604`.**
  `https://app.hubspot.com/contacts/51409153/record/0-3/64678307604` ·
  send `https://webhook.aideazz.xyz/cto/go/outreach-email/datastar-nda`.
  `[PARTNER] Datastar Panamá S.A. — NDA (Oracle/Nexsys)`,
  company `56923599228` + contact `236844611933` (both already existed, reused),
  note `116366224737`, HIGH task `116387981992`. To `cquiroga@datastar.pa`,
  **Cc Adriana + `elena.revicheva2016@gmail.com`**, `.docx` attached (82,436 B).
  One click sends, moves to ⏳ Sent, stamps the note, opens a +4-day follow-up;
  the Resend webhook then stamps ENTREGADO / ABIERTO. Contracting party is
  **Elena Revicheva, persona natural**, RUC `8-NT-2-781965 DV 90`, cédula
  **E-8-245573**. Docs: `docs/selling/datastar/`.
- **✅ SENT 4 Sep by one-click.** Resend `809bdd7d-ffc6-4a00-bb7e-7063c20c17cf`,
  **ENTREGADO confirmed to all three** (Conrad, Adriana, Elena's gmail), `.docx`
  attached, deal now `decisionmakerboughtin` (⏳ Sent), send-task closed.
  Waiting on Conrad's countersigned copy; the +4-day follow-up is open and his
  reply now auto-advances the deal (prefix fix below).
- **⚠️ The letter as sent says "lo que conversamos con Adriana y Pedro" and that
  is unverified** — Pedro Olivares was only ever a **Cc** on the thread and wrote
  nothing in it; "Nexsys" is inferred from his domain. **Deliberately NOT
  corrected:** Pedro is not copied on the reply, it is the same idiom Adriana
  opened with ("Según lo conversado"), and it sits in the covering email, not in
  the NDA. A correction email would cost more than the line. **Do not repeat the
  phrasing in the follow-up.** Adriana asked for the NDA; Pedro did not.
- **🚨 Two faults that one screenshot caught, both fixed 4 Sep:**
  1. **A delivered letter left its own send-task open** — three ENTREGADO stamps
     and `Send Hiring email → Datastar Pan…` still due today. `go-wa.ts` now
     closes the staged `Send …` task on a successful send (never the follow-up),
     and `scripts/hs-close-sent-send-tasks.cjs` sweeps deals sent before the fix,
     closing a task only when a note carries a real stamp. Verified: closed
     `116387981992`, and a second run reports `Nothing to do`.
  2. **`hs-watch-manual-emails.cjs` watched `CLIENT-MANUAL`/`CLIENT-ATLAS` only**,
     so **every** deal from `stage-hiring-outreach.cjs` — `[PARTNER]`,
     `[LICENSE]`, `[HIRING-MANUAL]` — was invisible to it: Conrad's reply would
     not have moved this deal to 💬 or cancelled the follow-up. **Third time this
     list has been the bug.** Add a writer that stages deals → add its prefix in
     the same change.
  `[PARTNER]` was also labelled "Send **Hiring** email"; the lane now reads off
  the prefix instead of one `startsWith` test.
- **The bridge gained sweep + attach modes** (no new workflow):
  `echo "close-send-tasks --deal=<id> --dry-run" > .hire-trigger` ·
  `echo "attach-files --slug=<slug>" > .hire-trigger`.
  (Trigger content must CHANGE to fire — add a second `retry-$(date +%s)` line;
  only line one is read.)
- **🔑 ONE THING ONLY ELENA CAN DO — add the `files` scope to the Service Key.**
  The signed NDA reached Conrad and both Cc's, but the **CRM copy of the file is
  not in HubSpot**: uploading returns 403. HubSpot → Development → Keys →
  Service Keys → **`Aldeazz_Marketing_Engine`** → Scopes → tick **`files`** →
  Save. Then `echo "attach-files --slug=datastar-nda" > .hire-trigger` backfills
  it, and every future staged deal attaches its files automatically.
  ⚠️ **Files READ does not imply Files WRITE** — `/files/v3/files/search`
  answered 200 while `POST /files/v3/files` answered 403, so a scope preflight
  looked green and the write still failed. Nothing else is blocked by this.
- **⚠️ Attachments used to live ONLY in the repo + the Resend payload.** The deal
  showed a letter claiming a signed NDA with no file on the record, and the
  HubSpot UI Email option had nothing to attach. There was **no Files API call
  anywhere in the codebase** before 4 Sep. `scripts/hs-files.cjs` +
  `hs-attach-deal-files.cjs` fix it, wired into staging so it is no longer
  something to remember. Rule now in `MANUAL_PROSPECT_PLAY.md`.
- **NEXT:** Elena:
  (0) **LanceMart — paste the LinkedIn DM to Aryaman.** He asked.
  File: `docs/applications/2026-09-04_lancemart_ai_automation_specialist.md`
  (STEP 3). Then Torre if he takes it further.
  (1) Coconut VA — Carmi asked Monday.com familiarity. Book the slot, then
  paste the Carmi answer in Wellfound Messages (not Gmail). File:
  `docs/applications/2026-09-04_coconut_va_wellfound_reply.md`. GHL Tech
  Specialist at $900–1.1k/mo is a skip.
  IntelliOps addendum is already sent. Do not tap `intelliops-bd`. Do not
  countersign v2.
- **🚨 THE TRAP, and it nearly shipped: a signature image goes where the FLOW
  puts it, not where it looked right while editing.** Elena's returned file had
  her signature as an **inline** image in the body, so it rendered above
  **Conrado's** name in Datastar's box while her own box sat blank — and Conrad
  had nowhere to sign. The text extract is identical either way; only a RENDER
  shows it. Fixed by extracting her signature and re-placing it inside her box
  (`scripts/datastar-nda-sign.py`, both `mc:Choice` and `mc:Fallback`). Her
  original kept as `AS_RECEIVED_from_Elena_04.09.2026.docx`; before/after in
  `docs/selling/datastar/preview/`. **Always render the signature page and check
  which name the signature sits above.**
- **⚠️ I BUILT A SECOND HUBSPOT BRIDGE BEFORE FINDING THE ONE THAT EXISTED.**
  `.hire-trigger` + `hire-outreach-on-trigger.yml` + `oracle-stage-hiring-outreach.sh`
  were stranded on `cursor/fermatix-hubspot-deal-1c49`, unmerged — PART 1 §2, exactly.
  Theirs is better (md5-snapshots `docs/selling` to pack only what a run touched;
  unions the registry GitHub ∪ Oracle disk). Mine is deleted. **All of it is now on
  `main`, plus the rescued `fermatix` spec, letter and registry row (deal
  `64531338321`) that §OPEN said lived only on Oracle's disk.** Union now reports
  `kept 0 Oracle-only`. **Search `.github/workflows/` and `git log --all` before
  building a bridge.**
- **VERIFIED BY (IntelliOps):** Actions `33962804536` — `✓ create note 116421568303`
  on deal `64302436100`. Earlier stage `33928557848` — reuse + send note.
  `verify-intelliops-addendum.cjs` PASS 49. Both PDFs quoted in
  `docs/selling/intelliops/V1_VS_V2.md`.
- **RISK (IntelliOps):** the old slug still sends the 25 Aug letter. The CRM
  copy of the addendum is not in HubSpot (files write 403). AIdeazz is a
  nombre comercial — do not invent a company on their signature block.
- **VERIFIED BY:** Actions run `33897131057` — `✓ deal 64678307604`, `✓ note`,
  `✓ task`, `registry merged`, then Oracle's own preview printing To/Cc/Adjunto.
  Oracle checkout `HEAD is now at 363ca78`, whose attachment blob
  `a4f3ebdf` is byte-identical to local (82,436 B) — the corrected file, not the
  one with the signature on Datastar's side. `verify-datastar-nda-fill.cjs` PASS
  (6 guards, each tested by breaking it); `test-outreach-attachments.cjs` 24 checks.
- **⚠️ A cédula in `scripts/` would have shipped to DataVendor.** The verifier
  first hard-coded `E-8-245573` as an assertion literal.
  `build-license-bundle.cjs` drops `docs/selling/` but **ships `scripts/`**, so
  her national ID was one bundle build away from a licensed corpus. Expected
  values now live in `docs/selling/datastar/expected-fields.json` (inside a
  dropped dir) and the verifier asserts both halves: `docs/selling/datastar/`
  still in `DROP_DIRS`, and no script contains the cédula or RUC.
  **Rule: an identifier belongs in dropped data, never in a shipped script.**
- **RISK:** the number on the *back* of the carné (`AE1074827`, also in the MRZ)
  is the plastic serial. The cédula is **E-8-245573** on the *front*. Do not
  “correct” it. AIdeazz is a commercial name, not a S.A. — do not invent one.
  Datastar's own box clips `Representante Legal` (fixed height + wrapped name);
  that is in **their** template — `preview/original-page4.png` proves it. Left
  untouched on purpose; do not silently restyle the counterparty's block.
  Render with `scripts/datastar-nda-render.cjs` (LibreOffice on the real
  `.docx`) — a text extract cannot show a clipped line.

- **DONE 4 Sep — EspaLuz WhatsApp TUTOR-mode audio fixed** (EspaLuzWhatsApp `9029b1f`,
  live on Oracle 10:49:22 UTC). Users could not open the voice note in tutor mode;
  translate mode was fine. Cause: `generate_tts_audio()` builds the reply from gTTS
  speech (**24000 Hz**) with `create_pause_audio()` silence (**44100 Hz**) between
  segments and **byte-concatenated** them into one mp3. An mp3 that changes sample
  rate mid-stream is malformed — `Header missing`, `Queue input is backward in time`,
  `Non-monotonic DTS`. Silence now matches gTTS at 24 kHz/64k, and concatenation goes
  through ffmpeg's concat demuxer **with a re-encode** so any future mismatch is
  normalised. Translate mode was never affected: one edge-tts source, no pauses.
- **⚠️ THE TRAP, worth more than the fix: a tolerant tool in the middle of a pipeline
  ERASES the evidence.** ffmpeg silently repaired the bad timestamps
  (`changing to 164040`) and emitted an Opus file that passed *every* check —
  valid OpusHead, EOS present, decodes with no warnings, real audio at −20 dB,
  correct Content-Type, Twilio reporting `read` with `error_code: None`. Everything
  downstream looked perfect because ffmpeg had already cleaned up after the fault.
  **Run the producing pipeline with `ffmpeg -v warning` and read the DECODER's
  complaints — do not probe the finished artifact and conclude it is healthy.**
- **Two wrong diagnoses before the right one, both recorded in the EspaLuzWhatsApp
  log:** the MP3-in-a-`.ogg`-filename bug (`677d322`) is real but unreachable on this
  path, and byte-concatenation alone is harmless when segments share a format
  (tested — byte-identical output). The defect needed BOTH. What cracked it was
  Elena's isolation — *"translate works, tutor doesn't"* — which turned an
  unfalsifiable hunt into a diff between two artifacts.

- **DONE 3 Sep — `/api` rebuilt end to end (aideazz `a17c052`, cto-aipa `9513168`).**
  Four Runway films behind the hero, a full-bleed ticker, Elena's real A/Z logo
  (extracted from her own asset, masked so the violet→yellow gradient flows through
  it), and a stats band **counted from Oracle production logs**: 420+ audits,
  14,000+ signals, 210+ sites, median 85 — floors rounded DOWN so they cannot expire.
  Every check the API returns now carries a **`why it matters`** as well as a fix
  (34 why / 4 fix on a live stripe.com response).
  **Blueprint for repeating any of this: `docs/ATUONA_SITE_BUILD_BLUEPRINT.md`.**
- **⚠️ TRAPS THAT COST TODAY — all four are in the blueprint §6, read it before
  editing `LabApi.tsx` or trusting a deploy check:**
  1. Editing source by **byte range** (`d[index(A):index(B)]`) destroyed code four
     times, twice the same `ScoreRing`. One instance **blanked the live page for
     every `?url=` audit link** — and looked fine to anyone who did not run an audit.
     Match exact literals and assert `count == 1`.
  2. `npm run build` **never typechecks** (esbuild strips types). Run `tsc --noEmit`.
  3. `$?` after a pipeline is the **last** command's status — `tsc | head; echo $?`
     printed 0 all session regardless of errors. Capture the status before any pipe.
  4. A missing asset returns **200 with index.html** under the requested
     content-type. Check the **size**, never the status.
- **VERIFIED BY:** live production, not source — `aideazz.xyz/api?url=…` renders
  (11,527 chars, score ring, 34 why), `az-mark.png` serves 77,346 bytes (not the
  40,238-byte SPA fallback), and Oracle's `dist/visibility-audit.js` md5 matches
  local.
- **RISK:** the audit path can only be tested from production or curl — `API_BASE`
  routes localhost to `:8098`, so a local preview always shows it failing.

- **DONE:** NL2Repo offer form **insists** on a delivery taskset (red:
  *Select at least one delivery taskset*). Artifacts upload on that page
  is a different field and will not clear it. Harbor sample packed on
  `cursor/hud-vendor-license-1c49`:
  `docs/selling/harbor/nl2repo-fail-closed-gate.zip` (8 files, `task.toml`
  inside the folder). Golden 9/9; empty 0/9 (false-positive closed).
- **DONE 3 Sep:** taskset listing **built and submitted to the NL2Repo
  opportunity** — `NL2Repo sample — fail-closed number gate`, Harbor zip
  attached as the asset, tag Coding/SWE, Buy now **$600** (1 task × $600),
  plus the buyer note (paid sample, batch after QC, non-exclusive, no
  asserted pass rates). **That submission is already a bid.**
- **NEXT:** 🚫 **Stop retrying Submit offer — it cannot be cleared from the
  vendor UI.** Measured 3 Sep: `My listings` = **Active 2, In review 0,
  Draft 0**, NL2Repo taskset **Active** at $600 — so the empty picker is
  **not** a QC delay. **"Harbor tasksets" (upload a zip on a listing) ≠
  "HUD tasksets" (team inventory)**, and the picker reads inventory. The
  zip in **Artifacts** does not clear the red line either. Getting into
  inventory needs the HUD side (org invite / API key / CLI), which Elena
  does not have. **Elena: send the one platform question** —
  `docs/selling/drafts/hud-nl2repo-taskset-inventory-ask.txt`: accept the
  listing submission as the offer, or tell her how to push a Harbor bundle
  into HUD team inventory. Buyer contact on the brief, or Megan on the
  Cal.com thread. Do not email the lab.
  ⚠️ Pricing sits inside the Required "Listing metadata" gate — never blank.
  ⚠️ The repo is private, so `raw.githubusercontent.com` 404s; download the
  zip from the logged-in blob page. Pastes and gate table:
  `docs/selling/drafts/hud-nl2repo-taskset-listing.txt` and
  `docs/selling/HUD_VENDOR_LICENSE.md` (HUD branch).
- **VERIFIED BY:** `python3 scripts/test-nl2repo-fail-closed-gate.py` →
  `PASS: golden… 9 passed` then `PASS: empty workspace failed`;
  `node scripts/pack-nl2repo-harbor-zip.cjs` → 8 files, 5687 bytes.
- **RISK:** the gap gate is per task — Qwen3.8 Max ave ≤50%, Opus/Fable max
  >0.6, **every** task ≥12.5% gap. A nine-test Python CLI is probably **too
  easy for Qwen**, so this exact item may fail the gap while still being a
  valid Harbor task. That is the honest position in the Assumptions: the
  sample proves the *format*; pass rates get measured on **their** scaffold.
  Do not invent numbers. `FN/FP QA agent review` grades a subject trace, so
  it cannot be pre-satisfied. Anthropic $0. Batch quotes must price the
  stack spread (Python, JS/TS, Go, Java, Rust, C++, Swift, Kotlin) — twenty
  Python CLIs would not be accepted. Full gate table in
  `docs/selling/HUD_VENDOR_LICENSE.md` on `cursor/hud-vendor-license-1c49`.

## 🏠 WHEN ELENA IS HOME — two things, in this order

**1. ⏳ RESCUE THE CURSOR EVABOOT DRAFT — do this FIRST, before closing anything.**
Cursor drafted preparation for the Evaboot role and it exists **only in an open Cursor chat
window on the laptop**. Verified unrecoverable from disk: every Cursor database was searched
— global storage plus all ten workspace stores, `cursorDiskKV` and `composerHeaders`
included, every table and every column — **zero hits for "Evaboot"**. Not in git on any
branch, not in the deal's HubSpot notes, not in any file.

👉 **Copy the text out of that chat and paste it into the Evaboot HubSpot deal note**
(deal `64517386099`) **or into a file in `docs/applications/`.** If that window closes
first, it is gone and the work gets done twice. This is the exact failure that earned
PART 1 §5.

**2. 🔑 Unlock D: — one elevated line, then tell the agent.**
Her own account has **read-only** on the root of D: — `BUILTIN\Users: ReadAndExecute` only,
owner `NT AUTHORITY\SYSTEM`. That is almost certainly why a 1 TB drive sat 97.7% empty: any
app saving to a top-level folder on D: gets Access Denied. In **PowerShell as Administrator**:

    icacls D:\ /grant "ELENA\kirav:(OI)(CI)M"

Then say so, and the agent finishes the job: create the Downloads and Videos folders on D:,
move the files, and update the shell-folder registry so Windows genuinely relocates them
rather than just pointing at them.

Already done, no action needed: npm and pip caches deleted (1.91 GB), Playwright's 610
browser files **moved** to D: rather than deleted (saving a ~700 MB re-download), and all
three verified working from their new homes. C: free 106.5 → 108.4 GB. C: was never in
danger at 45% free — the point was that growth now lands on the right disk.

## 💰 MONEY QUEUE

| # | Thing | State | Whose move |
|---|---|---|---|
| 1 | **Zapier — Sr. Technical Account Manager** ($55–82.6K + bonus, remote South America, **PST hours**) | ✅ **SUBMITTED 1 Sep 06:12 EST.** VJH surfaced it 09:04 UTC, she applied within 3h. Deal `⏳ Sent`. Judge has learned it as a positive | **Waiting on them.** ⚠️ Deal has **Contacts (0)** — no person linked, so a recruiter reply may not auto-match. Add the recruiter contact if one writes |
| 2 | **Rwazi — AI Engineer, Marketing & GTM Systems** (contractor, 25–40h) | ✅ Applied — registered as a learned positive | **Elena: record the Loom** — they said "links or Looms beat resumes" |
| 3 | **Plata — Automation Stream Lead** | Cover letter written | Elena: send |
| 4 | **Behram / AI Native Builder — LinkedIn comment** | Drafted, numbers verified | Elena: paste |
| 5 | **Work at a Startup profile** | Every field paste-ready | Elena: create the account — agent cannot (credential boundary) |
| 6 | **Evaboot - Agentic Python Engineer** ($70-120K, remote, bootstrapped, team of 5) | VJH found it 31 Aug 15:59, score 73. Its note is the OLD stub - the deal predates the 17:54 cover-letter fix by under 2h. Cursor's prep is trapped in a chat window | **Elena: rescue the Cursor draft (see above).** Then the agent writes the application |
| 7 | **James Onyemu (MONARCH / Delta State hotel)** | Reply drafted: paid-only, redirect to the hotel's AI-discoverability | Elena: send if she wants it |
| 8 | **HUD — NL2 Repo Tasks** ($600/task) | ✅ Taskset listing **Active** $600 + **submitted to the opportunity** 3 Sep with buyer note. ❌ Submit offer is **not fixable from the vendor UI** — its picker reads HUD **team inventory**, and a Harbor zip on a listing never lands there | **Elena: send the inventory question** (`docs/selling/drafts/hud-nl2repo-taskset-inventory-ask.txt`). Never attach the 8-pack to clear the picker |
| 9 | **Datastar NDA** (Oracle support for AIdeazz) | ✅ **SENT 4 Sep** — deal `64678307604`, ENTREGADO to all three, stage ⏳ Sent, send-task closed, FU due 8 Sep. ⚠️ the file is **not yet in HubSpot** — upload needs the `files` scope | **Elena: tick `files` on the Service Key** (one setting), then the agent backfills. Otherwise: waiting on Conrad's countersigned copy |
| 10 | **Coconut VA — Wellfound match** | Applied ~19 Aug, matched 3 Sep. Carmi asked Monday.com familiarity. Paste-ready answer in `docs/applications/2026-09-04_coconut_va_wellfound_reply.md` | **Elena: book the slot, paste the Carmi note in Wellfound.** $21–36k Monday.com SA. Do not claim Monday fluency — HubSpot + Make is the honest equivalent |
| 11 | **IntelliOps BD** (overlay commission, not a job) | Addendum **staged** 4 Sep on deal `64302436100`. No v3 exists — Nishant 26 Aug asked for unpaid origination first. Do **not** countersign v2. Do **not** tap the old `intelliops-bd` button | **Elena: tap** `https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-addendum` |

Drafts in `docs/applications/`. Resume: `29.08.26_EN_Resume_Elena Revicheva.{docx,pdf}`.

## 🔗 Carried from Cursor's 25 Aug version — verify still live before tapping

| Lane | Deal | Tap (full URL) |
| --- | --- | --- |
| Overlay commission (not a job) | IntelliOps addendum | https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-addendum |
| Job follow-up (applied on Torre) | BSS Groupe | https://webhook.aideazz.xyz/cto/go/outreach-email/ai-native-b2b-marketplace |

BSS confirm page must show **Hire me**, **Adjunto: Elena_Revicheva_Resume.pdf**, and
`https://aideazz.xyz/portfolio` twice. If HubSpot opens **Edit link**, paste the full URL.

- IntelliOps deal `.../record/0-3/64302436100` — **do not countersign v2**. New send is `intelliops-addendum`, not `intelliops-bd`
- BSS deal `.../record/0-3/64302126655` — To: `contact@bssgroupe.com`
- Catch-up: `docs/oracle/HANDOFF_2026-08-25_INTELLIOPS_BSS.md`

## 🌿 Stranded on the Cursor branch — do not lose, do not reset

`cursor/datastar-nda-filled-ded9` (4 Sep) — filled Datastar NDA + reply-all draft
in `docs/selling/datastar/`. New files only; merge is safe. Elena still has to send.

`cursor/intelliops-addendum-ded9` (4 Sep) — addendum + covering email staged on
deal `64302436100`. IMAP puller and `--reuse-deal` are on this branch; the
registry row is already on Oracle disk. Merge is additive.

`cursor/intelliops-bd-money-play-abc0`, last commit 25 Aug. Only there:
`scripts/hs-email-link-deal.cjs`, `hs-fix-send-buttons.cjs`, `hs-intelliops-story.cjs`,
`hs-note-intelliops-eval.cjs`, `oracle-hs-note-intelliops.sh`.
⚠️ The branch is also **behind** `main` on many files — a naive merge would delete current
work. Port what you want by hand; never reset. The IMAP puller is now on `main`.

## 🔴 OPEN — do not assume these work

- ✅ **`fermatix` is rescued onto `main` (4 Sep)** — spec, letter and registry row
  (deal `64531338321`). The staging union now reports `kept 0 Oracle-only`, so
  Oracle and `main` agree. **Still never `scp` a whole `outreach-registry.json` over
  Oracle's** — merge keys, as `oracle-stage-hiring-outreach.sh` does.
- ✅ **Megan (HUD/DataVendor) letter is ARMED as one-click (4 Sep).** Deal
  `.../record/0-3/64673099185`. Send: `https://webhook.aideazz.xyz/cto/go/outreach-email/megan-hud-datavendor`
  · FU: same URL + `-fu`. Both verified **HTTP 200** live, To `megan@hud.ai`. Registry rows
  are on `main` **and** merged into Oracle's disk copy — the GitHub raw fallback is **dead
  for this repo** (private repo, `fetchGithubRegistry` sends no auth token), so the Oracle
  disk copy is the only path that works. No pm2 restart needed: the registry is read
  per-request. ⚠️ A **duplicate draft of the same letter also sits in Zoho Drafts** — send
  by ONE route, then delete the other, or Megan gets it twice.
- 🚨 **DataVendor "Hansel" letter is PHISHING — DO NOT REPLY, DO NOT RE-UPLOAD (4 Sep).**
  **From `hansel.tantohari@hud-data-services.com`** — signs *"Datavendor team"* but the
  listing is on **`datavendor.ai`**, and that domain is neither DataVendor nor HUD. It is a
  blended lookalike weaponising the `hud.io ≠ hud.ai ≠ DataVendor` trap already in §6. It
  ships **Unsubscribe/Exclude** footers (bulk-send, not a person) and its payload is: hunt
  your private repos for *keys, tokens, connection strings*, then **"reply here"**. That
  reply is where the secrets go. **Do not click Unsubscribe or Exclude either** — both
  confirm a live mailbox. Mark as phishing; report in-platform. No breach implied: the
  listing is in the **public** catalog and `aipa@aideazz.xyz` is on the site.
  It claims the 8-pack PII check is failing and the listing "cannot be sold or shown to
  buyers". **The platform contradicts it:** listing is **Active** in the public catalog
  with **Submit a PO** live, last QC run was **31 Aug (Run #4, `Completed`, 10/32
  passed)**, and there are **0 purchases** — no "buyers reviewing right now". It asks her
  to hunt for keys/tokens/connection strings and *reply by email*. Ask DataVendor for the
  Run #4 breakdown **in-platform (Feedback)** instead.
  **The PII itself is real** (230 third-party business addresses in `AIPA_AITCF` tracked
  files) and the listing's own Terms already promise "Excluded: Customer PII" — so the
  scrub is owed to the buyer regardless of who sent the letter.
  **Credentials are clean: 0 real keys** in any repo, tracked or history (an earlier
  ~49-key figure was a bad regex). Nothing to rotate.
  ⚠️ The real 8-pack is **not** the local repo set: it includes `atlas-captures` (not
  cloned here) and `dragontrade-agent`, and **excludes `aideazz` and `whitespace`**.
  `AILA` and `atlas-captures` are **0 LOC** yet priced $8,401 combined.
  Full detail + the fix: `docs/selling/DATAVENDOR_QC_2026-09-04.md`.
  Scrubber: `scripts/build-license-bundle.cjs` (exports a copy, history-free, never
  touches the working repos).
- **Anthropic credits at zero** since 17 Aug. The 5-provider chain absorbs it; nothing is
  down. Elena tops up, or leave it on OpenAI.
- **VJH outreach crash:** `[outreach] ERROR <company>: 'str' object has no attribute 'get'`
  — real, in the founder-email path, needs its own session.
- **~50 duplicate blog pages** need canonical consolidation. **Canonical only — never
  delete.** 21 pages carry the fabricated Redis stack; never canonicalise onto one.
- No Claude MCP in Cursor. Gmail MCP in Cursor needs auth. HubSpot from Cursor cloud
  agents routes through Oracle (no `api.hubapi.com` egress).

## ✅ JUST LANDED (29–31 Aug)

- **`/api` hero — 4-film reel + new copy (3 Sep, aideazz `15f35b6`).** Films are
  orange → pomegranate → kiwi → pineapple, each natural fruit → cut open →
  technical object, cross-dissolving in `HeroBackdrop.tsx`. Desktop only
  (<860px gets no `src`), poster-first, `prefers-reduced-motion` kills film+canvas.
  **Two traps, both already paid for:** (1) Runway drifts — the kiwi returns to
  the rejected two-halves shape by 1.7s, so only 0–1.6s is usable; trim to the
  good frames rather than re-prompting. (2) A grey background in a video comes
  from a grey background in the SOURCE STILL — mask the still to black and
  regenerate; masking the video clips the fruit when the camera pushes in.
  Copy names both halves on purpose: *Google ranked your page* / *six crawlers
  decide whether AI can quote it*. **Six is verified** against `AI_CRAWLERS` in
  `src/visibility-audit.ts` — do not round it.

- **🆕 Elena's own CRM is live: `webhook.aideazz.xyz/queue/`** (`2eff542`, 31 Aug).
  Two cards — an employer to apply to and a client to contact — each with the draft
  already written and one button. Reads table `daily_queue` in **our Oracle DB, not
  HubSpot**: her states (`new/working/done/skipped`), because HubSpot has no urgency
  field and VJH's real states were being stuffed into sales stages that mean something
  else (`lead_parked` → `appointmentscheduled`). **The page makes ZERO HubSpot calls —
  not even a read.** `hubspot_deal_id` is a deep-link only. Behind the same basic auth
  as `/ops/`; **`/cto/` stays public on purpose** (one-click outreach links are opened
  from email clients that cannot authenticate) — do not "secure" it.
  **Client lane is empty: its feeder is not wired yet — that is the next increment,
  not a bug.** Seeded with 10 live roles, 9 tailored.
- **ai-native-builder.com wired into VJH** — densest source in the fleet, 72% gate pass
  vs ~21%. Memory: `project_ai_native_builder_source`.
- **Three pipeline bugs fixed** (`36e985c`) after that source ran a full day producing
  nothing: dedup ledger stamped before the cap (175 jobs burned per cycle), priority was a
  group not a ranking, and the judge believed Elena does not hand-code.
- **Board-quality guards:** `board_hygiene.py`, `scripts/qualify_job_board.py`, weekly
  Telegram watch (Tue 06:00 Panama).
- **Wiki incident published** `2026-08-30-marked-done-before-anyone-read-them`, `blog: yes`.
- **Hiring Notes now carry a REAL cover letter** (`0eeda5f`, live 31 Aug). Was the same
  three sentences for all 185 jobs with `[Edit this stub…]` left in the body. Now drafted
  against the actual posting via `src/cover-letter.ts`, wired at the single funnel point
  `buildHiringActionPackage` — so serpapi_jobs, vjh_review and response_detector all get
  it without touching the Python side. **The stub is the floor:** any failure keeps the
  old stub and the Note says *why* it is boilerplate. Prefers Greenhouse/Ashby **public
  JSON APIs** over scraping (Ashby's HTML yields ~33 chars). Coverage measured:
  Greenhouse/Ashby/Wellfound/Torre tailor; weworkremotely 403s the honest UA → stub.
  **Do not fix that with a spoofed UA.** VJH's Python `ContentGeneratorV2` is still dead
  code (0 callers, 0 files) — left alone deliberately, not missed.
- **`/opspw` — ops dashboard lock resettable from Telegram** (`2faf9a7`). The `/ops/`
  password was lost; a bcrypt hash cannot be recovered, only replaced. Helper
  `scripts/oracle-resilience/set-opspw-stdin.sh` → Oracle `/home/ubuntu/`, mode 700.
  Backs up, writes bcrypt, verifies the LIVE endpoint two ways (new password 200 **and**
  anonymous still 401), auto-rolls-back on either failure. Done in prod: 44→67 bytes,
  hash now `$2y$`, rollback did not fire. **Username is hardcoded** — it cannot mint
  accounts. Whoever holds the Telegram account can reset that lock; that is the accepted
  trade for phone-only access, not an oversight.

## 🏥 Family / Cita — automated 1 Sep 2026

- **`/cita` in Telegram** turns an IENDI clinic block into Trello cards: right
  `Kira <Mes> <Año>` board, Cita column, **red = FAMILY**, Panama→UTC due dates,
  column re-sorted. Takes a paste, a forwarded message, or a **voice note**.
  Idempotent on name+due — re-sending changes nothing. `/citasort` re-sorts on demand.
- **HOURLY cron :47** (`scripts/sort-cita-lists.cjs`) keeps every Kira Cita column in
  date order. It writes **only `pos`** — never content, dates, labels or list — so it
  is safe against boards Elena edits by hand.
- ⚠️ **The column drifts out of order between runs and it is NOT a sort bug.** 1 Sep:
  4 of 22 cards were found at Trello *midpoint* positions (114688, 311296, 835584) —
  the value Trello writes when a card is **dragged**. Our sort only ever writes exact
  multiples of 65536, so a non-multiple pos is proof something else moved it: an
  accidental long-press drag on mobile (easy while scrolling a 22-card column) or a
  Butler rule. Re-running the sort fixed it immediately: `moved 4 of 22`, then
  `out-of-order=0`. **Before debugging the sort, check whether positions are
  multiples of 65536.**
- ⚠️ **Do not route this through `trello-voice.ts`.** Its `BOARD_KEYWORDS.kira_current_month`
  is hardcoded to `mayo/junio/julio 2026` and is blind to September onward. `iendi-cita.ts`
  resolves boards dynamically from the appointment's month. **That stale map is still
  live for the other voice→Trello flows and is worth fixing separately.**

## 🧠 VJH judge feedback — HOURLY, and the schedule lives only in crontab

- `scripts/judge_feedback_sync.py` reads Elena's HubSpot notes **and screenshots**
  (vision, cached per attachment) into `autonomous_data/judge_feedback.json`, which
  `src/core/llm_judge.py:170` loads into the live judge prompt. Verified end to end
  1 Sep 2026: file written 14:17, the India/Level AI reason present in it, log shows
  `scanned 400 deals -> 12 positives, 12 negatives (8 carrying her reason, 5 read
  from screenshots)` — and that count rose 7→8 between runs, so it is learning, not
  merely executing.
- **Cadence is `17 * * * *` — HOURLY, changed from daily.** ⚠️ **This schedule exists
  ONLY in Oracle's crontab. It is in no repo.** Rebuild the box, restore an old cron
  backup, or infer the cadence from the code, and it silently reverts to daily — a
  19-hour learning lag that looks exactly like a working system. If you touch VJH
  cron, preserve this line.
- 🚫 **The `python3` in that cron is deliberately NOT the venv.** The script uses only
  `urllib` and `json` and is verified working under a stripped `env -i`. Do not
  "fix" it to `venv/bin/python`.

## ⚠️ Standing traps

- **Never `git add -A`** in cto-aipa. Named files only.
- **Claude Code `Auto` mode blocks all credential-store work** — reading `.htpasswd`,
  grepping `auth_basic`, and *editing your own permission list*. That last refusal is
  deliberate: an agent cannot self-approve escalation. Do not try to slip it past by
  renaming files or burying the logic in a compiled bundle. Ask Elena to switch the mode
  selector (bottom-left) from `Auto` to `Manual` — every blocked command then succeeds on
  the first try. Not `Bypass permissions`; that disarms everything session-wide.
- Oracle runs VJH under `venv/bin/python` — bare `python3` dies on `pydantic_settings`.
- Do **not** `source .env` — `FROM_EMAIL` has spaces and angle brackets; syntax error.
  Read keys with `grep`/`cut`.
- After any deploy: restart, prove it from `journalctl`, **and check the OUTCOME.**
- **hud.io ≠ hud.ai ≠ DataVendor API.** Cursor `Hud: Sign In` is a plugin.
  The licence buyer is DataVendor (`datavendor.ai`). Their estimator:
  **public = $0**. REST/MCP is evals, not the quote. Do not add
  `openclaw-vibejob-shortlist` (MIT), `ascent-saas-builder` (Lovable),
  or `atlas-shifted` (still public) to the Ready 8-pack. Packet:
  `docs/selling/HUD_VENDOR_LICENSE.md` on `cursor/hud-vendor-license-1c49`.
- **No fourth Lazarus.** Codebase buyers that quote: Lazarus, Atrium
  (AfterQuery), HUD. Lazarus: solo / no team+P&L. Atrium **25 Aug**:
  round closed (volume), not quality; they do not keep the trees. HUD
  saw them already private tonight. Flip ≠ never-public. Hashseatic is
  not a quote. Next dollars: HUD number, AfterQuery click follow-up, jobs.
- **HUD lookalikes searched 31 Aug.** Still not a fourth quote: Hashseatic
  / gitbuyer (you find the lab), FileYield / ThenAI.
  ⚠️ **DataFactor was mis-screened as "not this SKU" — it IS this SKU.**
  Re-read from their own app bundle 2 Sep: *"Submit your repositories for a free
  quality assessment… DataFactor may offer to pay you for the right to license
  them to leading AI companies"*, *"A single strong repository can reach thousands
  of dollars"*, *"Each repository is evaluated individually, then rolled up into
  one portfolio score and a single payout estimate"*. Free, static, read-only;
  *"Training rights exist only if you accept"*. **Caveat on exclusivity:** their
  wording is *"You keep ownership of your code unless otherwise agreed"* —
  ownership is NOT exclusivity, and an exclusive licence leaves ownership intact.
  Non-exclusivity is unverified until it is in a contract. TrainPlex.in = Indic mill, lower bar, excludes “fully
  AI-generated” — metadata only, read paper, no GitHub tonight.
  Fermatix (`hi@fermatix.ai`) sources private repos for royalties —
  inbound later, refuse exclusive. Mercor/Surge/Scale = hours, not the
  8-pack. Fleet/Chakra/Mechanize/Sharpe build gyms; they do not list
  her GitHub.
