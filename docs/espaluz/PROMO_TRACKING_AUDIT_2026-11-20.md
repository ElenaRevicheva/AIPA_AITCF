# EspaLuz promotion: can we catch who clicks? (audit, 20 Nov 2026)

Elena: "this time when we run promotion, we know exactly who clicks and how to catch this user and what to do with him -
not like last time with YouTube: thousands of watchers because I paid, and we do not know where they come from."

Last time (AI Growth Operator films): ~$110 YouTube Promote, 303.8K channel views, 19.5K paid sessions, 18 WhatsApp clicks,
no sale traced. Nobody joined film -> click -> person.

## 1. What the film agent did today (checked)
| Claim | Checked | Verdict |
|---|---|---|
| Film 02 v2 (style A) and v3 (opening "New country. / Latin America.") cut EN/ES/RU, sent to Elena's Telegram with captions | NOW + `FILM02_POST_TEXT_2026-11-20.md` | done |
| Posting path: Influencer bot -> Make 6869112 -> FB Page + YouTube Short + IG Reel | Make inventory in the doc (read-only) | real, already working |
| Bot footer adds the Google Play beta / free tester line EN/ES ("Comment Android"), live on Oracle | md5 = commit, restart newer than file (in NOW) | live |
| Every claim in the post is true (closed testing `lat.espaluz.app`, testers free until 31 Dec) | `play_testers` mechanism exists | true |
| A real post showing the beta line | not done | **NOT proven yet** - Elena has not sent the v3 films to the bot |
| One real tap on a film link reaching a bot | not done since 19 Nov | **NOT proven** |

Small gap: the footer's Android line is EN/ES only - the Russian film gets no Russian line.

## 2. Can we catch who clicks? Door by door
| Door | What we learn today | Can we reach the person? |
|---|---|---|
| WhatsApp link with film code | `promo_arrival` row: phone + film + platform (both bots, since 6 Nov) | **yes** - we have their number, 24 h to reply |
| Telegram link with film code | same, Telegram id | **yes** |
| Website link with utm tags | GA4 counts: visits -> chat -> sign-up, per film | **no** - the sign-up does NOT keep the film. A family that registers from a film is not marked anywhere. PostHog is anonymous by design (`person_profiles: never`). |
| Instagram Reel / YouTube Short text | links are not tappable there | **no** - unless the link is in the bio / channel links / a pinned YouTube comment |
| "Comment Android" | a public comment | **barely** - nobody reads comments automatically; YouTube has no private messages, so a YouTube commenter cannot be sent an invite at all; asking for a Gmail in public is wrong |
| Facebook GROUPS (posted by hand) | codes exist only for fb / ig / yt | **no per-group answer** - the bots only accept `-fb`, `-ig`, `-yt`, so we could not tell group A from group B |

**Live check, 20 Nov (Oracle, bot event_log):** `promo_arrival` rows ever recorded = **0**. Since 6 Nov not one person has
reached a bot through a film link. Either nobody tapped, or the links were not where people could tap them (IG/YT) - the
same blind spot as last time, now measured.

## 3. The catch plan (proposed - nothing built yet)
Rule: **no paid boost before every door is proven by one real tap.**

1. **Make every call to action a WhatsApp/Telegram door, not a comment.** Replace "Comment Android" with
   "Write ANDROID to EspaLuz on WhatsApp" + the coded link (`f…-android`). The bot asks for their Gmail privately, adds them to
   `play_testers`, and Elena gets one line to add them in Play Console. Private, tracked, and works for YouTube viewers too.
2. **The website remembers the film.** On arrival keep the utm tags in the browser; at sign-up save them on the family's
   account (one row: film, platform). Then the daily report can say "Ana signed up from film 02 ES, Facebook".
3. **Facebook groups get their own codes.** Allow `-g1`, `-g2`… in the bots' code pattern (one line in both bots), and keep a
   small list: code -> group name -> date posted.
4. **Links where they can be tapped.** Instagram: coded link in the bio. YouTube: coded link in the channel links AND a pinned
   comment under each Short (links in comments are tappable).
5. **Elena hears about every arrival, by name.** A Telegram line to her private bot when someone arrives from a film:
   "📣 New family from film 02 ES (Facebook group 3) on WhatsApp - first message: …". The daily report lists people, not only
   counts (private chat only, never public).
6. **What to do with the person (the catch):** the bot already greets them; add ONE follow-up next day if they went quiet
   (inside WhatsApp's 24 h window), offering the 14 free days or the Android beta spot. Signed-up families from a film get
   the same nudge by the existing welcome path.
7. **Prove before posting:** Elena taps one link per door from her phone; Claude reads the `📣 promo arrival` line in the log.

## 4. What it costs
Steps 1, 3, 5, 6: small additions in the two bots (no removals), same deploy routine. Step 2: one small web change + Publish.
Step 4: Elena pastes links into bio / channel / pinned comment (or Claude does it in her Chrome with her OK).
