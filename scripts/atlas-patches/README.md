# Patch relay for Atlas Shifted (`/home/ubuntu/whitespace`)

Cursor cloud agents can push `AIPA_AITCF` but get **403** on
`ElenaRevicheva/atlas-shifted`. Same pattern as `scripts/aideazz-patches/`.

Park patches here, then `.deploy-trigger` product **`atlas-patch`**. Oracle
applies them onto `/home/ubuntu/whitespace`, rebuilds `dist/`, reruns
classify → brief → concept so `radar.sqlite` is today's snapshot, and pushes
`atlas-shifted` `main` with the box's deploy key.

`0001-classify-embed-failover.patch` — 14 Sep 2026: OpenAI embeddings returned
429 *You have no credits remaining*. The Jul 12 retry treated that as a
transient rate limit, then `classify.js` exited 1 and the cron skipped
brief/concept. Fail over to Gemini `text-embedding-004`, then a lexical
`0002-gemini-embedding-001.patch` — same day: `text-embedding-004` 404'd
(`not found for API version v1beta`). Try `gemini-embedding-001`, then
`gemini-embedding-2`, then the old id.

