# Cornerstone Panama — research (not yet staged)

> **Blocked 2026-08-07:** `cornerstone.pa` returns DNS SERVFAIL from Oracle and the
> visibility engine (`unfetchable_url` on both apex and www). Staging cannot proceed without
> a live audit score — do not pass `--score` until Elena measures it from a network that
> resolves the domain (e.g. laptop browser → `https://aideazz.xyz/api`).

## Who they are

**Cornerstone Panama** — AESC-member executive search firm; Panama office of Cornerstone
International Group. Promises final shortlist in 10 business days plus executive coaching for
the selected candidate.

- Site: `cornerstone.pa` (contact form only — no published mailto or WhatsApp)
- Managing Partner: Guillermo Segura (also on cornerstone-group.com)

## Contact evidence

| Channel | Value | Source |
|---|---|---|
| Email | **none public** | form-only on cornerstone.pa and cornerstone-group.com Panama pages |
| WhatsApp | **none found** | Oracle contact recon: no phone candidates |

Staging will be **EMAIL-PRIMARY** with `info@cornerstone.pa` (UNVERIFIED fallback) once the
audit runs.

## Next step

1. Confirm `cornerstone.pa` DNS resolves (may be transient).
2. Run `node scripts/stage-manual-prospect.cjs cornerstone.pa --dry-run` on Oracle.
3. Fill `gapClause` / `topFixes` in `PROSPECT_META` from audit output.
4. Stage with `--with-fu`.
