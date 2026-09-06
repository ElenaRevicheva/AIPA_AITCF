# Toxic Arts — Online Art Gallery Administrator (remote)

**Found by Elena** on Instagram @toxicartsgallery · **posted 19 Aug 2026**, seen 6 Sep
**Apply** CV + short cover letter → `sales@toxic-arts.com`
**HubSpot** deal `64716021571` · company `58114196405` · contact `246756931170`
**Spec** behind the Instagram link-in-bio. `toxic-arts.com/careers` returns **404**,
so the full specification was **not** read before drafting. Check it for salary and
hours before sending.

## The company, from their own site

Contemporary gallery, 124 City Road, London EC1V 2NX — *"Unique Art & Prints by
Emerging Global Artists."*

- **Shopify storefront plus an Artsy presence** — two places holding the same stock
- **Four currencies** (GBP / USD / EUR / AUD), **four site languages** (EN, 简体中文, FR, ES)
- Ships internationally; newsletter; separate **Exhibitions** and **Editions** sections
- Roster is genuinely international: Mila Useche, Seungwoo Kang, Misha Piskur,
  Martynas Auž, Miroslav Peak, Mykhailo Piskur, Yutaro Inagaki, Tomas Gittins

## ⚠️ Honest assessment — a stretch, and not in her lane

1. **It is an administrator role.** Gallery admin posts usually sit **below the
   $3,500/month floor**. Worth 30 minutes, not a day.
2. **Posted 19 Aug — ~2.5 weeks old.** Her own board-hygiene rule: judge a posting
   by its dates. It may already be filled.
3. **Time zone is the real constraint.** Panama UTC−5 vs London UTC+1 = six hours.
   She cannot do a 09:00 London start; she *can* hold **12:00–18:00 London =
   06:00–12:00 Panama**. Said plainly in the letter rather than discovered later.

**Why send anyway:** their own wording removes the blocker — *"Previous gallery
experience is a plus, but initiative, attention to detail and a genuine interest in
art are key."* And she has a line nobody else applying will have: **she runs an
online gallery of her own**, verified live on 6 Sep (`atuona.xyz` → *ATUONA •
Underground Aesthetic Gallery*, `atuona.xyz/aifilmstudio` → *ATUONA · AI Film
Studio*, HTTP 200 both). Six finished short films from her own poetry — "genuine
interest in art" demonstrated, not asserted.

---

## THE COVER LETTER — plain text, in the email body

**Subject:** `Art Gallery Administrator - Elena Revicheva`

```
Dear Toxic Arts,

Before writing this I ran my own audit tool over your shop, the way I would in my
first week. It scored 82 out of 100 - and what stood out first is something you
have already got right: all six AI crawlers are allowed, eleven checks out of
eleven. A surprising number of galleries have that wrong by accident and never
find out, because nobody ever gets an error about it.

Where citations are leaking is answer-readiness. There is no Product schema on the
editions, so when a collector asks an assistant where to buy a print by one of your
artists, there is nothing machine-readable for it to quote - no artist, price,
edition size or availability. And there are no sameAs links tying the site to your
Artsy storefront and your Instagram, so you appear as three unconnected galleries
rather than one. Small, additive fixes that do not touch the design. I wrote up the
five I would start with:

https://claude.ai/code/artifact/9a47b4d6-99e4-417f-81f2-54e683c682f3

I did that because your post said initiative and attention to detail matter more
than gallery experience, and this seemed more honest than a paragraph about my
passion for contemporary art.

I also run a small online gallery of my own - ATUONA (atuona.xyz): six short films,
each with its own score, narration, generated poster and title cards, built from my
own poetry. I do the curation, the pipeline and the site. It taught me that an
online gallery is really two jobs, keeping the inventory honest and being findable.
With Shopify running alongside Artsy in four currencies, the first one is a daily
discipline - and reconciling systems that quietly disagree is most of what I do.

Straight with you on two things. I have not worked in a commercial gallery. And I
am in Panama, so I can hold London afternoons - about 12:00 to 18:00 your time -
but not a 9am start. Russian is my first language, my English is fluent and my
Spanish is working-level.

CV attached. I would love to talk.

Elena Revicheva
atuona.xyz - aideazz.xyz/portfolio
```

**Why this shape.** She wants this one badly, so the letter does not merely claim
initiative - it spends it. Running her own audit on their shop before applying is
something no other applicant will do, it is checkable in one click, and it converts
her actual lane into the gallery's commercial problem.

**It leads with what they got right.** The 100/100 crawler access is real and
genuinely uncommon, and opening there makes the rest read as enthusiasm rather than
an unsolicited critique. Standing rule: an audit is the CREDENTIAL, never a
you-are-invisible. That rule is why the letter never says the site is bad - it says
where citations leak, and offers the fix.

---

## THE AUDIT - run 6 Sep 2026 on toxic-arts.com with her own API

**82 / 100 - Grade B.** Verified live, not asserted.

| Category | Score | Weight |
|---|---|---|
| AI Crawler Access | **100** - 11/11 | 25% |
| Technical Foundation | 86 - 6/7 | 20% |
| Structured Data (GEO) | 75 - 4/8 | 25% |
| **Answer-Readiness (AEO)** | **69 - 4/8** | **30% (heaviest)** |

Their weakest category is the most heavily weighted one, and every fix is small.
Findings, from the engine:

- **FAIL - no H1.** "The page never states its main topic." *(Hedged in the
  write-up: Shopify themes can inject headings post-load, so confirm in the
  rendered DOM first. Never hand an employer a claim you have not qualified.)*
- **WARN - no JSON-LD.** Only `Organization` via microdata. **No `Product`** - the
  one that matters for a shop selling editions.
- **WARN - no `sameAs`.** Nothing ties the domain to Artsy or Instagram.
- **WARN - meta description 263 chars** (readable range is 50-170).
- **WARN - no machine-readable dates.** Bad for a programme built on exhibitions.
- **WARN - one question-style heading only.** Collector FAQs (edition size,
  framing, shipping and duties to the US/AU, certificates of authenticity) are
  exactly the shape an assistant lifts.

**Supporting artifact - "First Week at Toxic Arts":**
https://claude.ai/code/artifact/9a47b4d6-99e4-417f-81f2-54e683c682f3

⚠️ **Must be SHARED before sending** - Share -> General access -> Anyone with the
link, then confirm in a private window. See the LanceMart doc for why a republish
is not a delivery mechanism.

The artifact closes by naming its own limits - a sixty-second read of one page,
blind to their sales and their reasons, and some choices may be deliberate. That
paragraph is not modesty; it is what stops a helpful gesture reading as a lecture.

---

## THE CV — send a GALLERY CUT, not `29.08.26_EN_Resume`

**The 29.08 CV is excellent and current** — five-provider chain, the Groq
deprecation handled correctly, 130-test harness, six ATUONA films. Nothing in it is
wrong. **But it is the wrong document for this reader.** It opens *"AI Automation
Architect · Applied AI Engineer"* and lists Oracle Autonomous DB (mTLS) — to a
gallery director hiring an administrator that reads as bewildering overkill, and it
buries the only thing they care about. Same facts, different cut:

```
ELENA REVICHEVA
Gallery operations · digital · discoverability
Panama City (UTC−5) · remote · aipa@aideazz.xyz · +507 616 66 716 (WhatsApp)
atuona.xyz · aideazz.xyz/portfolio · linkedin.com/in/elenarevicheva
Russian (native) · English (fluent) · Spanish (working) · French (basic)

—

I run a small online art gallery and build the systems that make work findable.
Before that, seven years as Deputy CEO and Chief Legal Officer of a large public
digital programme — contracts, budgets, and the day-to-day running of an
organisation. I have been on both sides: the person making the work, and the
person running the operation behind it.

—

ATUONA — Underground Aesthetic Gallery & AI Film Studio        2025 – present
Founder and sole operator · atuona.xyz
  · Curate and publish a gallery of AI-generated film work — six finished short
    films, each with its own score, narration, generated poster and title cards
  · Source material is my own poetry, so everything published is cleared outright
    with no licensing question attached
  · Built and run the whole publishing pipeline: generation, assembly, gallery
  · Nothing goes live unverified — every release is checked frame by frame before
    publication, because a gallery that looks broken has already lost the visitor

AIdeazz AI Lab — digital, discoverability and operations     2025 – present
Founder · aideazz.xyz
  · Built a discoverability engine for search engines and AI assistants:
    structured data, crawler permissions, sitemaps, canonical and language tags
  · Built and shipped a public audit tool — aideazz.xyz/api — scoring any site on
    34 checks across four categories, returning a plain-English report
  · Weekly measurement: buying-intent questions put to four AI answer engines,
    recording whether a page was cited, named without a link, or absent
  · Daily bilingual (EN/ES) publishing with canonical URLs and campaign tracking,
    so a mention can be traced back to where it came from
  · Run a CRM of ~2,200 records — every enquiry has a source, an owner and a
    follow-up that fires; delivery and open events are written back to the record,
    so "sent" means received rather than hoped

OPERATIONAL CO-FOUNDER — OmniBazaar (decentralised e-commerce)     2024 – 2025

DEPUTY CEO & CHIEF LEGAL OFFICER — JSC "E-GOV OPERATOR", Russia   2011 – 2018
  · Seven years at board level on a large-scale public digital programme
  · Drafted and negotiated commercial agreements in a heavily regulated
    environment — directly relevant to consignment terms, artist agreements and
    edition documentation
  · Ran cross-functional teams and the day-to-day of a large organisation,
    including the parts nobody volunteers for
DEPUTY CEO, BUSINESS DEVELOPMENT — Fundery LLC (fintech)          2017 – 2018

—

EDUCATION   MA Social Psychology, Penza State University · 2018
            Presidential Program for Executive Management, RANEPA Moscow · 2015

TOOLS       HubSpot · Shopify-class storefront admin · Google Workspace ·
            Analytics & Search Console · Telegram / WhatsApp Business ·
            Python & SQL when a spreadsheet stops being enough

Everything above is live and can be opened right now.
```

**Keep the last line.** For a gallery, "you can open all of it today" is worth more
than any list of technologies.

⚠️ **One caution:** the CV says *"Shopify-class storefront admin"*. She has built
and run e-commerce and CRM systems, but her 29.08 CV does not claim Shopify
specifically. If she has not actually administered a Shopify store, change it to
`e-commerce and CRM administration` — **do not let a keyword outrun the truth.**

## Checklist

- [ ] Open the Instagram link-in-bio spec — salary and hours, before anything else
- [ ] Confirm or soften the "Shopify-class" line above
- [ ] Send CL + gallery CV to sales@toxic-arts.com
- [ ] Tell the agent "sent Toxic Arts" so deal `64716021571` moves to ⏳ Sent
