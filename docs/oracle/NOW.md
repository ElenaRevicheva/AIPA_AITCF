# NOW — live across Cursor and Claude Code

This is the shared session, not a shared chat. Cursor Cloud, Cursor Desktop,
and Claude Code **do not** see each other’s messages. They all read this file
and HubSpot. Update it when the money queue changes. Push so the other tool
sees it.

**Catch-up for Claude:** `docs/oracle/HANDOFF_2026-08-25_INTELLIOPS_BSS.md`  
**Branch:** `cursor/intelliops-bd-money-play-abc0` — do not reset Oracle to `main`.

## Tap these (25 Aug 2026)

| Lane | Deal | Tap (full URL) |
| --- | --- | --- |
| Overlay commission (not a job) | IntelliOps BD | https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-bd |
| Job follow-up (already applied on Torre) | BSS Groupe | https://webhook.aideazz.xyz/cto/go/outreach-email/ai-native-b2b-marketplace |

BSS confirm page must show **Hire me**, **Adjunto: Elena_Revicheva_Resume.pdf**, and `https://aideazz.xyz/portfolio` twice.

If HubSpot opens **Edit link** instead of the send page, paste the full URL from the table. Notes now include the same URL in plaintext.

HubSpot:

- IntelliOps: https://app.hubspot.com/contacts/51409153/record/0-3/64302436100 — do not countersign v2
- BSS: https://app.hubspot.com/contacts/51409153/record/0-3/64302126655 — To: `contact@bssgroupe.com`

Gmail proof of resume MIME attach (not sent to BSS): Resend `1b5829b0-d7f3-49c5-86d2-92ec68316578`.

## What is not live

- No Claude MCP in Cursor
- This work is **not on `main`** — Oracle disk was synced from the branch
- Do not `deploy-trigger` `cto_aipa` from `main` or resume-attach `go-wa.js` is overwritten
- Gmail MCP in Cursor needs auth
- HubSpot from Cursor cloud agents goes through Oracle (no `api.hubapi.com` egress)

## How a new session starts

1. Read this file and the 25 Aug handoff.
2. Open the HubSpot deals above.
3. Do not re-discover IntelliOps/BSS from chat history.
4. Do not replay `_email_link_registry_patch.json` without the resume `attachments` array.
