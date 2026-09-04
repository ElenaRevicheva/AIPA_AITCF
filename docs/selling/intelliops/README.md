# IntelliOps BD — addendum, not a countersignature

**Status (4 Sep 2026):** do **not** countersign the 24 August v2. Do **not**
tap the old one-click `intelliops-bd` — that resends the already-sent 25 August
letter. The letter that goes next is the addendum on slug `intelliops-addendum`.

**Deal:** https://app.hubspot.com/contacts/51409153/record/0-3/64302436100
**Send:** https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-addendum

This is overlay commission, not a job. Full evaluation:
`docs/selling/intelliops/INTELLIOPS_BD_EVALUATION.md`.

---

## What the mailbox actually contains

Read from Zoho + Gmail via `scripts/intelliops-imap-pull.py` on 4 Sep
(Actions `33927589841`, 7 messages, 2 PDFs). There is no third agreement.

| When | Who | What |
|---|---|---|
| 18–19 Aug | Natalie / Elena | Calibration call |
| 20 Aug | Natalie | v1 PDF (256 KB) — e-sign and return |
| 23 Aug | Elena | Four items before signing (entity, law, statement, attribution) |
| 24 Aug | Nishant | v2 PDF (34 KB) — claims to close those four. Already signed on their side |
| 25 Aug | Elena | Four *remaining* items so commission is collectable. **Already sent** (slug `intelliops-bd`) |
| 26 Aug | Nishant → Elena's gmail | **No new draft.** "Start originating first; we will revise later." |

"The latest draft they sent after the additional questions" is v2, sent after
the *first* four questions. After the *second* four, they sent a commercial
position, not a document.

---

## What we are sending

A one-page **Addendum No. 1** to the 24 August agreement, plus a covering
email. The addendum writes the four remaining items and the AIdeazz carve-out.
It does not change the 20% rate. Elena does **not** sign v2.

They can bind the addendum by signing it **or** by accepting the same four
items in a reply. Either is enough. Origination starts the same week, not
before.

Source of the Word file: `ADDENDUM_No1_IntelliOps_BD.docx` in this folder.
The send path only attaches files under `docs/selling/attachments/` — the
copy there must stay byte-identical (the verifier checks).

---

## Elena

1. Open the deal. Read the note. Open the `.docx` if you want a signature on
   your side — the covering email does not require it. They can sign first.
2. Click **➡️ SEND BY EMAIL**. To Nishant, Cc Natalie + your gmail.
3. Do not countersign v2. Do not start registering opportunities until they
   accept the four items in writing.

Rebuild / re-render:

```bash
python3 scripts/intelliops-addendum-build.py
node scripts/verify-intelliops-addendum.cjs
```
