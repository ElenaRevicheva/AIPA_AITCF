# EspaLuz web (ascent-saas-builder) — built but unreachable (3 Nov 2026, read-only)

Repo @ `caaeffa`; live `espaluz-ai-language-tutor.lovable.app` bundle `index-Bnv61tG8.js` already contains caaeffa
(live = repo). Supabase: 13 function folders = 13 deployed, all ACTIVE (espaluz-chat v270, generate-voice v257,
voice-to-text v218, kids-memory v40, payment-mirror v24, track-learning-progress v203 …). JWT settings match config.
Live counts: 9 auth users, 4 family members, 3 connected bots, 5 referral codes.
Items marked ✔ were re-checked in code by the lead session on 3 Nov.

## 1. Built, not working for a real user
| Feature | Evidence | User gets | Fix | Publish? | Risk |
|---|---|---|---|---|---|
| ✔ **Lesson "Start" → 404** | `LearningModules.tsx:82` navigates `/learning-module/${id}`; `App.tsx:29` route is `/learning/:moduleId` | 12 built lessons with exercises (`src/data/spanishLessons.ts`) become reachable | 1 line | y | none |
| ✔ **Web promises "you both get 1 month free"** | `ReferralSystem.tsx:155,273`; nothing grants it (bots removed the same promise 2 Nov) | honesty | copy edit | y | **fix first** |
| **Referral sign-ups never recorded** | `processReferralSignup` (`useReferralTracking.tsx`) no caller; `referrals` UPDATE policy "own", `referral_rewards` no INSERT policy. 5 codes, 0 conversions | "who invited whom" starts counting | SECURITY DEFINER rpc + 1 call after signUp in `Auth.tsx` | y + migration | low |
| **Learning streak always 0** | `LearningAnalytics.tsx:62` reads `learning_streaks` (0 rows); only `track-learning-progress` (deployed) writes it; UI never calls it | real streak | `trackProgress` invokes the function | y | low |
| `user_achievements` | no reader/writer, 0 rows | — | skip | — | — |
| `copy-avatar` fn, `VoiceGenerator.tsx`, `WhatsAppWaitlistForm.tsx` | unused / obsolete | — | leave | — | — |

## 2. Security (Supabase advisors)
- 10 SECURITY DEFINER functions executable by **anon**: notably `copy_avatar_file`, `force_copy_avatar_content` (anyone can move
  avatar files), `get_user_subscription_status(uuid)` (anyone can read another user's status), `generate_referral_code`,
  `generate_connection_code`, `handle_new_user*` (should be trigger-only). Fix: `REVOKE EXECUTE … FROM anon` (and from
  authenticated where not needed). DB-only, no Publish — verify no web/bot caller relies on anon first.
- `user_subscriptions_from_browser` mutable search_path; leaked-password protection off; Postgres 17.4.1.064 patches pending.

## 3. Sharing / virality
- ✔ **Link previews show Lovable, not EspaLuz**: `index.html:19,22-23` og:image/twitter:image = lovable.dev image, `twitter:site @lovable_dev`.
  Every family share on WhatsApp/Telegram advertises Lovable. Icons/hero already in `public/`. 2-3 meta lines.
- **No PWA install**: `/manifest.webmanifest` 404; icons exist (`espaluz-icon-512.png`, `apple-touch-icon.png`) → "Add to home screen".
- No `/sitemap.xml` on the app (fine: aideazz.xyz/espaluz is the SEO door).
- Referral links use `window.location.origin` (lovable.app), not the one door `aideazz.xyz/espaluz`.
- Live share buttons: ReferralSystem (Web Share/clipboard), PaintPad "share my painting" (`PaintPad.tsx:327`).

## 4. Connect-now (ranked)
1. Lesson route one-liner → 12 lessons appear.
2. EspaLuz OG/Twitter image + handle → every share becomes a branded preview.
3. Remove the "1 month free" promise; record referral sign-ups (rpc + call).
4. PWA manifest from existing icons.
5. Wire streaks to `track-learning-progress`; separately revoke anon EXECUTE on the risky functions.
All frontend items ride ONE Lovable Publish by Elena.
