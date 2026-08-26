# Outreach attachments

PDFs listed on a slug in `docs/selling/outreach-registry.json` as `attachments`
are MIME-attached by `/go/outreach-email/{slug}` (Resend).

Only this folder, only `.pdf`. Path traversal is rejected in `src/go-wa.ts`.
