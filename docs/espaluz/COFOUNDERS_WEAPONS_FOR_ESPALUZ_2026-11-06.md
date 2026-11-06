# EspaLuz promotion: the co-founders' existing weapons (6 Nov 2026)

Elena: use the marketing co-founder in VJH, the GEO / AEO / Tech SEO engine and AI Growth Operator in CTO AIPA, and Atlas. "We should
not reinvent the bicycle." **Read-only exploration from code, Oracle, GA4, HubSpot and Studio. Dates are given because some data is old.**

## 1. What each co-founder really does today

### CMO (VJH `src/notifications/linkedin_cmo_v4.py`, `performance_tracker.py`)
| Weapon | State | Evidence |
|---|---|---|
| Daily AI-written post, EN/ES, 20:00 Panama, Make → Buffer → LinkedIn + Instagram | Works | 13 "sent successfully" in 14 days |
| Image preflight and rotation; post types; waterfall text | Works | Code, logs |
| Tech updates from CTO AIPA become posts | Works | `pending_tech_updates.json`, tech_update posts in logs |
| UTM per post, `cmo_<post>`, reported by GA4 per campaign | Tagging works | GA4 `buffer_cmo` sessions |
| Weekly strategy decision and market trends | Runs, narrow | Strategy can only answer hiring, fundraising or balanced; the trends prompt still says Nov 2025 |
| Learning from results | **Open loop** | 618 rows in `post_performance.json`, 0 with views; "No performance data yet" 13 of 13 runs in 14 days |
| EspaLuz | Only a link in a list | `aideazz.xyz/espaluz?utm_source=linkedin`, no EspaLuz post type |

### Marketing engine (CTO AIPA; roadmap v27, re-probed 20 Oct)
| Weapon | State |
|---|---|
| AI Visibility Audit API, 34 checks | Live. `app.espaluz.lat` 100 A+ today |
| GEO surfaces: sitemap, JSON-LD, llms.txt, 23 AI crawlers allowed | Live on aideazz.xyz |
| Citation probe, Monday, 4 engines | Live, one leg short while Gemini answers 402. Family questions run once on 4 Nov: EspaLuz cited 0 of 9. Not in the weekly run |
| Daily blog with quality gates and buyer-question mode | Live, questions are all B2B lanes. Its EspaLuz door still points at the old page |
| Bluesky link cards | Live per roadmap |
| AI Ops Wiki, `incident-to-blog` | Live |
| Lead Concierge, HubSpot, follow-up radar | Live for clients. The 104 `[ESPALUZ]` deals are Influencer post records, not families |
| Funnel report | Live, extended today with films |

### Atlas / WHITESPACE
| Weapon | State |
|---|---|
| Weekly ad capture, angle classification, ENTER / WATCH / AVOID brief, concept and asset | Live for 11 tracked lanes |
| `expat_language` | **Stale: last capture 17 Jul 2026, not in `tracked-verticals.json`**, though its brief is regenerated. `personal_ai_companions_on_the_go` is tracked |
| Finding, dated 17 Jul data | Pain point is crowded: 22 advertisers, 16 new in 7 days. Fear of loss open: 3 advertisers. Hypothesis to test, not a result |
| Sample of the ads | Falou already says "10 minutes a day". Nearly all sell one adult a course. One Third Stories speaks to parents |

### AI Growth Operator: what its films produced
| Measure | Number |
|---|---|
| Six YouTube Promote campaigns of 4 Oct | About $20 each, $109.62 in October |
| Channel views, 28 days | 303.8K |
| Paid sessions to `/api`, 30 days | 19,526, nearly all ISO weeks 41-42; Panama 12,465 and Nicaragua 6,894 site-wide |
| Actions from those sessions | 18 WhatsApp clicks, 42 form starts, 16 key events |
| Free daily re-uploads of those films, 21-28 Oct | 0 to 5 views each |

Reading: money bought reach, and free re-uploads bought nothing. About 19,500 visits became 18 WhatsApp clicks. Sales from them
were not traced. The price per visit is so low that weak placements are possible (inference, not read).

## 2. Each weapon on EspaLuz
| # | Weapon, reused | Change | Cost | Go needed |
|---|---|---|---|---|
| 1 | Citation probe | Add the 3 family questions to the Monday run | Free | Yes, cron file |
| 2 | Atlas | Add `expat_language` to tracked verticals, read `personal_ai_companions_on_the_go` | Small Bright Data use | Yes |
| 3 | Blog buyer-question mode | One family lane, door to `app.espaluz.lat`, same quality gates, no invented facts | Free | Yes, it is her B2B blog |
| 4 | CMO | One EspaLuz lane with facts from the claims table; update its link; close the learning loop by reading GA4 per campaign | Free | Yes |
| 5 | Make 6869112 | Shorts queue titled as a family's question; 27 unused clips; never re-post the same film daily | Free | Samples first |
| 6 | Visibility and Tech SEO | Fix old `sameAs` and Offer URLs; bring `/espaluz` in line with the family pitch | Free | Yes |
| 7 | Lead Concierge pattern | A film arrival in a bot writes one honest HubSpot record, not one per post | Free | Yes |
| 8 | YouTube Promote | One $20 test on the best film, only after sign-up is proven, judged by the scoreboard | $20 | Yes, money |

Dropped on 4 Nov and stays dropped: cold outreach. Atlas lead machine does not work EspaLuz.

## 3. Wired today (6 Nov)
- Next films: Facebook links tagged by film; WhatsApp pre-filled reference; Telegram start reference (Influencer `aa5be94`, Familybot
  `4bab3fb`, WhatsApp `92b8d55`, restarted 22:59:11 UTC, md5 = git). Not exercised by a real arrival.
- Daily scoreboard to Telegram, 13:40 UTC (`espaluz-funnel-weekly.mjs --films`); dry run read YouTube, GA4 and the bot table.
- YouTube channel link: `app.espaluz.lat/?utm_source=youtube&utm_medium=channel_link`, confirmed on the public page.

## 4. Elena only
- Instagram bio link: Instagram allows editing links on mobile only. Add `app.espaluz.lat/?utm_source=instagram&utm_medium=bio`.
- YouTube Community Guidelines warning on the channel.
- One web sign-up with an outside address.
- Gemini 402: billing.
- Not read: Facebook and Instagram views per film.
