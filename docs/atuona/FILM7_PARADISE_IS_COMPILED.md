# Film #7 — *Paradise Is Compiled* (material of 20.09.2026)

**Material = exactly Elena's Desktop folder** `June_July_September 2026 Atuona AI Film studio videos/20.09.2026 AI Film video`
— 19 videos + 20 stills, **all used, nothing added** (Elena, 21.09.2026: "these exact videos and images … not anything else").
The stills are turned into video shots by `scripts/atuona-still-motion.py` (2.5D depth reprojection + atmosphere);
the compile is `scripts/atuona-film7.mjs`. Work dir on Oracle: `/home/ubuntu/atuona-film7/`.

Title from #091: *"Paradise is not found. Paradise is compiled from what you have."* — the film is literally
compiled from what the folder had, and the stills that "could not move" now move.

## 1. Which poem each file belongs to (evidence, not guesses)

Base renders matched by **md5 against `data/atuona/films/shots/<id>.mp4`**; Director's Cuts by their Luma basename in
`~/.pm2/logs/cto-aipa-out-9.log` (`Director's Cut ready: …/<name>.mp4`, preceded by that poem's `persistShot NNN`);
stills by the Telegram timestamp (Panama, UTC−5) against the `Flux output (16:9|9:16)` + Luma `created_at` lines of the
same render. The 12 Sep 09:03/09:28 stills are the `/imagine 099` runs noted in NOW.md (12 Sep, "Flux 2 Pro painted").

| Poem | Videos | Stills (H = 16:9, V = 9:16) |
|---|---|---|
| #099 *Could not generate content.* | `qekCAAGo` (DC 9 Sep) · `atuona-base` (Kling 12 Sep) · `wuwBPZpT` (DC 12 Sep) | 09-09 17:54 H (man at monitor) · 09-12 07:59:30 H (lily corridor) · 07:59:44 V (lilies over face) · 09:03 V (ribcage lilies) · 09:28 H (corridor profile) |
| #015 *Застывшее* | `atuona-base1` + DC `MVsvkDl2` · `atuona-base2` + DC `t9YkZ1h8` · `atuona-base7` + DC `oSl5VQx2` | 09-19 14:55 H+V (underwater) · 14:59 H+V (laughing, flooded tunnel) · 16:39/16:40 H+V (torn net) · 09-20 07:46 H+V (crawling, reed) |
| #024 *Сгоревший* | `atuona-base8` (Veo) | 09-20 13:02 H+V (spiral stairs) |
| #037 *От обиды* | `atuona-base68` + DC `U9nbGpWo` | 09-20 14:31 H+V (feathers, smoke) |
| #022 *Вьются шальные повести* | `atuona-base21` (Seedance) + DC `0qjJIwPU` | 09-20 17:35 H (rusted tunnel wall) |
| #020 *Ничья* | `atuona-base6` + DC `xJycIP8b` | — |
| #066 *The Threshold* | DC `1Lj18KI5` | — |
| #091 *Код и Холст / Code and Canvas* | `atuona-base9` (Seedance) + DC `kXMf1WTY` | 09-20 18:31 H+V (laptop at night) |

The videos were **not** animated from these exact stills — the bot renders a separate "video-safe keyframe" for
each video — so every still is genuinely new picture material, not a duplicate of a clip.

## 2. English text (rule: on screen and in the voice, English only, verbatim fragments)

#066, #091, #099 have an `English Text` trait (atuona repo `metadata/<id>.json`) — fragments are cut verbatim from it.
#015–#037 exist only in Russian (`atuona-complete-with-dates.json`); the translations below were made for this film,
line by line, and the fragments are cut verbatim from them. **Elena: correct any line and the film is re-cut.**

**#015 Застывшее — Frozen**
> Frozen in the hollow of the riverbed — / that's you, it seems, not her. / She writhes in a torn net to reach you, /
> and you, the reed, catch her … (line 4 is left untranslated on screen: its neologisms have no safe reading)
> How many reeds like these we've seen — / as many dead who stitched strange mice, /
> who, dying, read aloud: I love you, mouse — / but never breathed a word that you would burn.
> What kind of children are you, drowned in the blue, / sealed numb in this sweat? / It is wondrous to me, and vile — /
> for how many ages have you been your homeland's parents?

**#024 Сгоревший — Burned Out**
> Not out of malice, not for anything — / just a certain precision, / like an old sandpaper / that wore away my skin.
> I was only running to you, / skipping every floor. / I was burning out in you, / no longer feeling my skin.
> I was finishing off / a life that hurt. / And so I didn't make it — / floors against the body.
> You are the best, however trite it sounds. / Brodsky said: life is hills. / And you — you are the Burned One. …
> Let all that smoldered scatter with the day. / Even without a body, you and I will sing it to the end.

**#037 От обиды — From the Hurt**
> From the hurt I could cry, / and wipe away my snot; / if it is that easy to spit into my soul — / it is that easy for me to lean on It!
> So easy that I will kick out the thresholds / I once had to stop at. / Every road is dear to us — / wherever you are ready to be born again.
> It is so funny, above the trill of little flocks / that gather and greedily devour you — /
> as if everyone, waking at dawn, / were shaking smoky incense out of their feathers.

**#022 Вьются шальные повести — Wild Tales Curl** (*Собрание* with a capital С = **Sobranie**, the cigarette)
> Wild tales curl / in the sad smoke of a Sobranie. / No shame, no conscience — / you stub yourself out with repentance. …
> Soon we'll be over again, / and there's no way back / in the deep pool of loneliness …

**#020 Ничья — Nobody's**
> Give me back a little more of myself, / squandered for nothing, / and the mast from the ship / that pissed away its anchors. …

## 3. Stanzas used (voice = OpenAI `tts-1` / `onyx` / speed 0.9; text = DejaVuSerif 22, bottom band)

| # | Over | Poem | Fragment |
|---|---|---|---|
| 1 | still 09-19 16:39 H (torn net) | #015 | Frozen in the hollow of the riverbed — / that's you, it seems, not her. / She writhes in a torn net to reach you. |
| 2 | still 09-19 14:55 H (underwater, mice) | #015 | How many reeds like these we've seen — / as many dead who stitched strange mice, / who, dying, read aloud: I love you, mouse — / but never breathed a word that you would burn. |
| 3 | `atuona-base7` (in the reeds) | #015 | What kind of children are you, / drowned in the blue … |
| 4 | still 09-20 13:02 H (stairs) | #024 | I was only running to you, / skipping every floor. / I was burning out in you, / no longer feeling my skin. |
| 5 | `atuona-base8` (Veo) | #024 | Let all that smoldered scatter with the day. / Even without a body, you and I will sing it to the end. |
| 6 | still 09-20 14:31 H (feathers) | #037 | As if everyone, waking at dawn, / were shaking smoky incense out of their feathers. |
| 7 | `0qjJIwPU` (smoke, candles) | #022 | Wild tales curl / in the sad smoke of a Sobranie. / No shame, no conscience — / you stub yourself out with repentance. |
| 8 | still 09-20 17:35 H (alone at the wall) | #022 | Soon we'll be over again, / and there's no way back / in the deep pool of loneliness … |
| 9 | `atuona-base6` | #020 | Give me back a little more of myself, / squandered for nothing. |
| 10 | `1Lj18KI5` | #066 | There is no painting. Never was. / Gauguin left only coordinates — / latitude of pain, longitude of hope. |
| 11 | diptych: ribcage lilies + lilies over face | #099 | Behind her eyelids — yellow lilies. / Not the ones they sent her in Paris. / These grow straight out of her chest. / Roots push into ribs. |
| 12 | `wuwBPZpT` | #099 | The lilies keep growing. |
| 13 | `kXMf1WTY` (code on a screen) | #091 | Paradise is not found. / Paradise is compiled from what you have. |
| 14 | `atuona-base9` (laptop, 1 AM) | #091 | But today — today she's just a girl with a laptop, / talking to machines about art, / in a hotel on an island / where a man died looking for paradise. |
| — | triptych of the verticals (on-screen only, mono) | #091 | git add souls.txt / git commit -m "prometheus wore safety pins" / git push origin tomorrow |

## 4. Music

**"Red Lips (Sensual Noir Lo-Fi Beat)" — WBM Studio, Pixabay** (3:33, instrumental; tags Noir · Sensual · Sexy ·
Intimate · Nocturne · Mysterious · Dark). Elena's brief: *underground, no words, dark, sexy, atmospheric.* Chosen over
"Trip-Hop Instrumental 03" (alanajordan) on measurement: darker spectrum (centroid 1669 vs 1950 Hz), more low end
(34 % vs 28 %), steady energy under a voice. Rejected on tags: *Peace • 02* (female vocals), *Dark Dub Techno*
(vocal dub, fast), *Temptation* / *Fine Seduction* (bright, romantic). Now also in the bot's music library.

## 5. How the stills move (so the next film can repeat it)

See the docstring of `scripts/atuona-still-motion.py`. Per still: Depth Anything V2 Small (ONNX, CPU, ~3 s/image) →
nearness map → virtual camera truck/dolly/roll reprojected through the depth (near pixels travel further = parallax)
→ per-shot atmosphere (water shimmer + caustics + bubbles underwater, dust in light shafts, drips from the net,
smoke drift at the window, lamp/screen flicker) → moving grain. The nine verticals become gallery walls
(4 panels for #015's four renders, a diptych for #099's lilies, a triptych to close) instead of being cropped to 16:9.
Baked-in text is framed out, never painted over, except the misspelled `UNDERGGROUND` on 09-20 07:46 V
(inpainted — it would read as a typo on screen).
