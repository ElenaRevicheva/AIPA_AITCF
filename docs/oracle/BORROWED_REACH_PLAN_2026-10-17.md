# Replacing Dev.to's borrowed reach — research plan (17 Oct 2026)

Research only: nothing was signed up, posted or changed. 6 research agents (one per platform family) read each
platform's own current pages; the load-bearing facts (free? API? canonical? AI/automation policy?) were re-checked
by independent skeptics — 11 of 12 held, 1 partly refuted (a DEV++ detail, not used below). Decisions are Elena's;
see NOW.md.

**Recommendation: replacing Dev.to's reach (research only, 17 Oct 2026)**

**Bottom line**

No single platform replaces Dev.to. The plan that fits your money goal has three parts:

- **Field notes go out more widely.** They are verified and built without a model, so they are safe to show strangers.
- **The daily AI article stays at home** on aideazz.xyz, Bing and Bluesky until its fact-check fix lands. The 16 Oct post had 8 false claims, and copying it to more places spreads those errors.
- **Nothing new gets automated except through a route the platform officially allows.** Daily automated posting is the pattern that got Dev.to suspended.

---

**1. Ranked plan**

**#1. LinkedIn feed: field notes through your existing Buffer setup**

- **What it gives:** recruiters and buyers see your verified incidents where they already spend time. That is human reach, not AI citations. LinkedIn's live robots.txt (official, read 17 Oct) has `User-agent: * Disallow: /`. It fully blocks GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot and Google-Extended. It lets OAI-SearchBot and Claude-SearchBot read only LinkedIn's own business blogs and /help/.
- **LinkedIn and AI citations:** third-party studies rank LinkedIn high among cited sources. How the assistants reach it is unconfirmed. So the page you want cited stays aideazz.xyz.
- **Your time:** 0 minutes a week.
- **Automation:** yes, with existing code. `bufferCreatePost({channelId, text})` and `bufferPostableChannels()` are already exported from `src/buffer-publisher.ts`. One call goes into `scripts/incident-to-blog.cjs` right after the Bluesky line. It copies the IndexNow and Bluesky pattern and cannot block the publish.
- **The caption must be built without a model:** title, one verified line from the incident, then the link. Do not use `generateSocialVariant()`. Its prompt tells Haiku to "Open with a specific hook (a real failure mode, number, or contrarian take)". That is how an unverified number reaches a recruiter.
- **The daily stream:** turn `BUFFER_SOCIAL_ENABLED` off on Oracle (one value) until the fact-check fix ships. Today the daily article reaches LinkedIn with an AI-written caption, if that flag is on. I did not check Oracle.
- **Suspension risk: low.** Buffer posts through LinkedIn's official Posts API with the `w_member_social` permission (Microsoft Learn, updated 13 May 2026). LinkedIn's User Agreement (effective 3 Nov 2025) bans *unauthorized* automated posting.
- **Pace:** natural. Field notes marked `blog: yes` ran 9 in August, 7 in September and 3 so far in October. I counted these in the wiki repo.
- **First step:** your yes. Then the small added call, plus the flag change. Test it on the next field note with `saveToDraft: true` first.

**#2. Medium: import 1–2 field notes a month by hand, English only**

- **What it gives:** the closest match to what Dev.to gave you.
  - "Import a story" adds a canonical link back to aideazz.xyz automatically and keeps the original date (official, edited 26 Aug 2026).
  - Medium's robots.txt blocks AI *training* crawlers but not Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User or PerplexityBot. So this is the only option here that AI search tools are allowed to read.
  - Cloudflare may still block those tools: unconfirmed.
- **What it does not give:** reach inside Medium. Expect followers only, because AI-assisted and self-promotional stories are excluded from wider distribution. Outbound links are probably nofollow (unconfirmed).
- **Your time:** about 2 minutes per post, if Import can read your pages. That is untested, so try one post first. Whether Import works from a phone is unconfirmed.
- **Automation: NO, on purpose.** Medium issues no API tokens to new users. Its Rules ban posting "automatically, systematically, or programmatically".
- **Suspension risk: medium.**
  - The top suspension reason Medium names is posting mainly to drive traffic or search rankings to an outside site.
  - Re-using "content templates with slight modifications" counts as spam, and field notes share a template.
  - Duplicate content gets accounts suspended.
  - AI-assisted text needs a one-sentence disclosure in the first two paragraphs.
- **Which stream:** field notes only, the strongest and most different from each other. Never the daily article: Medium lists "easily disprovable AI-hallucinated... statistics" as grounds for restriction or suspension. Never any of the ~50 near-duplicates.
- **First step:** you create the free account yourself (I cannot sign up for you). Import one field note, then check the page source for "canonical".

**#3. LinkedIn native Article: once a month, at the laptop**

- **What it gives:** a long-form case study on your profile, where a recruiter who opens it will see it. "All members" can publish (official help page, updated about 2 months ago).
- **Your time:** more than 2 minutes. The help page says "This feature isn't available on the LinkedIn mobile app." That breaks the phone rule, which is why this ranks #3.
- **Automation: no.** The Posts API's "Article" type is only a link share (source URL, title, thumbnail). I found no API for native Articles (unconfirmed that none exists).
- **Canonical:** the help page mentions no canonical option. So write about 300 words in your own voice with the link back, rather than pasting the full field note.
- **Newsletters:** they need 150+ followers/connections plus other criteria. Those help pages may be old, so this is unconfirmed for 2026.
- **Suspension risk: low** (manual).
- **First step:** next laptop session, take the field note with the strongest verified number.

**#4. Keep Bluesky, IndexNow (Bing) and Search Console as they are**

These are already wired for both streams. They cost 0 minutes and need no change.

---

**2. What NOT to do**

- **Do not point the daily pipeline at any new platform.** That repeats the Dev.to pattern exactly.
- **No "RSS to Medium" auto-publish tools.** How they post is unconfirmed, and Medium bans programmatic posting.
- **Skip Hashnode, even by hand.**
  - All API access needs Pro: $5/month per publication in Hashnode's own FAQ, though no price shows on its pricing page.
  - Its Code of Conduct bans "Automated or bulk posting... SEO abuse".
  - Free posts judged off-topic can be auto-deleted.
  - In the 18 Oct test, free *.hashnode.dev blogs served a Cloudflare challenge to non-browser requests. That may block AI tools fetching pages live.
  - Its readers are developers; about 76% of hashnode.dev traffic comes from Bangladesh (Semrush, third-party).
- **Never let a model rewrite field-note text or captions anywhere.**
- **No Spanish posts to Medium for reach.** Non-English stories never get wider distribution.
- **No new Dev.to account** while the appeal is open.

---

**3. The Dev.to appeal**

**Keep it open. It costs nothing. Do not spend time chasing it.**

**Dev.to's own AI guidelines** (official, "last updated... April 8th 2024", still live):

- AI-assisted posts must disclose it, either with #ABotWroteThis or a note in the article.
- They must be fact-checked.
- They should not promote a business, "including your own", or exist mainly to build a personal brand.
- Building backlinks for another site's SEO is listed as grounds for suspension or a ban.
- Nothing on the page covers how often you can post.

**What your code shows:**

- The Dev.to preface read only "Originally published at aideazz.xyz — cross-posted here with canonical link." It carried no AI disclosure. I did not check the article bodies.
- The code describes the goal as "DA 90+, canonical back" and "backlink credit to aideazz".

So the likely trigger matches Dev.to's written rules. Dev.to has not given its actual reason.

**If you are reinstated:**

- Send field notes only, at their natural pace of about 2 a week at most.
- Each one carries the AI-assisted tag.
- No sales pitch in the body. The canonical link is fine.
- The daily article never goes back to Dev.to.

**One trap before you lift the pause:** the daily publisher and `incident-to-blog.cjs` both read the same switch, `DEVTO_PAUSED`. Unsetting it after reinstatement would quietly restart the daily cross-post. The daily path needs its own off-switch first, which is a one-line change.

---

**The concept to name in interviews:** *platform risk.* Borrowed reach can be taken away overnight. And *syndication multiplies errors*: a mistake in the source gets copied to every outlet. That is why only the verified, model-free field notes get distributed more widely.

**Sources**

Official:
- [LinkedIn robots.txt](https://www.linkedin.com/robots.txt) (live, 17 Oct 2026)
- [LinkedIn: Publish articles](https://www.linkedin.com/help/linkedin/answer/a522427) (updated about 2 months ago)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) (updated 13 May 2026)
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) (effective 3 Nov 2025)
- [DEV AI guidelines](https://dev.to/guidelines-for-ai-assisted-articles-on-dev) (8 Apr 2024)
- Medium and Hashnode: the URLs in the verified research input

Possibly outdated: [LinkedIn Newsletter access criteria](https://www.linkedin.com/help/linkedin/answer/a591266), plus the third-party Semrush and Peec figures as cited there.

Repo files read:
- `src\buffer-publisher.ts`
- `scripts\incident-to-blog.cjs`
- `src\daily-blog-publisher.ts`
- `src\blog-github-commit.ts`
- `aideazz/content\ai-ops-wiki\incidents\`
