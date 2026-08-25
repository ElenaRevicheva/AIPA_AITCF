# HANDOFF — 25 Aug 2026 — IntelliOps BD + BSS hire-me

Cursor Cloud (this agent) stopped here. Claude Code: **read this + HubSpot**, do not re-discover, do not `git reset --hard`, do not deploy `cto_aipa` from `main` (that would wipe resume-attach `go-wa.js`).

**Branch:** `cursor/intelliops-bd-money-play-abc0`  
**Do not merge unless Elena asks.** GitHub fallback in `go-wa.ts` still reads `main`; Oracle **disk** is what serves the live confirm pages.

---

## Two money lanes (do not mix)

| Lane | What it is | Deal | Full send URL |
| --- | --- | --- | --- |
| IntelliOps | Overlay **commission BD**, not a job. **Do not countersign v2.** | https://app.hubspot.com/contacts/51409153/record/0-3/64302436100 | https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-bd |
| BSS Groupe | **Job** (Torre solo-builder). Already applied. Hire-me + resume MIME attach. | https://app.hubspot.com/contacts/51409153/record/0-3/64302126655 | https://webhook.aideazz.xyz/cto/go/outreach-email/ai-native-b2b-marketplace |

If HubSpot opens **Edit link** with `/go/outreach-email/...`, that is a relative href. Paste the **full** URL above. Notes were rewritten 25 Aug to absolute `href` + plaintext fallback.

---

## What is already live (do not redo)

- BSS letter: hire-me subject, `https://aideazz.xyz/portfolio` twice, `Adjunto: Elena_Revicheva_Resume.pdf` (96 KB).
- Resume MIME attach in `src/go-wa.ts` → Resend `attachments[]`. Registry slug `ai-native-b2b-marketplace`.
- PDF on disk: `docs/selling/attachments/15.07.26_EN_Resume_Elena_Revicheva_compressed.pdf`
- Gmail **proof** (not BSS): Resend `1b5829b0-d7f3-49c5-86d2-92ec68316578` → `elena.revicheva2016@gmail.com`, sha256 `43146d1086d7…`. Paperclip there = same file BSS will get.
- IntelliOps one-click: To Nishant, Cc Natalie. Draft `docs/selling/drafts/intelliops-bd-email.txt`. v2 not collectable.
- IntelliOps PDFs on noindex `/doc/` (HubSpot Files 403, no `files` scope).

---

## What Elena still does (human)

1. IntelliOps: tap the **full** URL, review, send. Do not countersign v2.
2. BSS: tap the **full** URL, confirm Adjunto line, send. Do not send from HubSpot compose if you want the PDF attached — HubSpot UI email will **not** carry this MIME attach unless she uploads the PDF herself.

---

## Oracle rules for the next agent

- Checkout files from **this branch**. Never `git reset --hard` and never `deploy-trigger cto_aipa` from `main` until this work is on `main`.
- Do not replay `docs/selling/_email_link_registry_patch.json` onto the registry without the `attachments` array (that stripped the resume once).
- Cloud agents cannot call `api.hubapi.com`; HubSpot writes go through Oracle trigger `.hs-note-trigger`.
- Idle that trigger after a run (`# idle`).
- Never `git add -A`. Never commit `.env`.

---

## Named concept (for Elena)

HubSpot stored `/go/outreach-email/{slug}` as a **relative href**. Clicking it edited the note instead of opening the send page. That is **origin stripping**: the host was dropped, so the browser resolved the path against `app.hubspot.com`.
