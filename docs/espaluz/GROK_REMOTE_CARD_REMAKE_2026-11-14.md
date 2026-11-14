# Task: remake the "For you, every day" card video in Grok Imagine (Elena approved, 14 Nov 2026)

Why: the home-page card "For you, every day" is about the PARENT's own life in Spanish, but its clip shows Pere & Titi
(the kids' heroes) on the MOTHER's laptop - the picture says "kids product" where the text says "for you".
Keep everything else; change only the mother's laptop screen to her chatting with EspaLuz.

Rules: photoreal (never cartoon for adults), no readable text on screens (AI letters garble), no logos/watermarks,
nothing posted publicly, Elena's X Premium only (no paid credits), creatives stay on the laptop.

## 1. Grok Imagine (Claude in Chrome, Elena's signed-in X account, grok.com/imagine)
- Upload the current still: D:\aideazz\ascent-saas-builder\src\assets\heroes\hero-remote-poster.jpg
- Image prompt:
  "Keep the same woman, room, window, city view, plants and the little girl at her desk with the tablet exactly as
  they are. Change ONLY the woman's laptop screen: it now shows a messaging app conversation - soft chat bubbles and a
  small round photo of a smiling woman with long silver-blonde hair (her bilingual companion), no cartoon characters on
  the laptop. Photorealistic, warm natural daylight, calm documentary feel, no readable text, no logos, no watermark,
  3:2 landscape."
- Generate, pick the best 2 (same faces as the original, girl's tablet still shows the two cartoon friends, laptop shows
  chat + small round photo). Show Elena both; she picks.
- On the pick: Make video, 6-10 s:
  "She reads the reply, smiles softly and types an answer; the girl keeps learning on her tablet in the background;
  gentle natural movement, steady camera."
- Download still + video to D:\aideazz\ai-cofounders\cto-aipa\docs\espaluz\remote-card-remake\ (create the folder).

## 2. Swap into the site (ascent-saas-builder, named files only)
- Current files: src/assets/heroes/hero-remote.mp4 (~396 KB) and hero-remote-poster.jpg (~51 KB); the page shows them
  in a 720:484 box (Index.tsx, card 1 of the three hero cards). Keep the SAME file names so no code changes.
- Back up the old pair first (copy to docs/espaluz/remote-card-remake/old/).
- Encode: 720x484 (crop to fit, keep faces), H.264, yuv420p, no audio, under ~600 KB, +faststart; poster = first good
  frame, JPEG ~60 KB.
- npm run build; responsive check at 360/412/768/1280/1600 (page width = screen width); look at the card on 412.
- Commit (named files), push ascent main; tell Elena to Publish in Lovable; verify on live after Publish.
- One line in docs/oracle/NOW.md (cto-aipa, main).
