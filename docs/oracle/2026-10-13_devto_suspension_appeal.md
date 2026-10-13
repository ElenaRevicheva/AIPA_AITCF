# Dev.to suspension — appeal sent 13 Oct 2026

**What happened:** the daily blog failed from 11 Oct (`Dev.to cross-post failed (401)`). The API key is active and byte-identical
to the one in Oracle `.env`; every authenticated call returns 401 from laptop and Oracle alike. dev.to/new shows:
*"Your account has been suspended and has limited access. Your ability to post and comment may be limited. For more information,
you may send a message to support@dev.to."* Dev.to's maintainer, on forem/forem #23675: the API "intentionally returns 401 for API
key requests if an account is currently flagged". Last successful post: 10 Oct 2026.

**Likely trigger (inference, not confirmed by Dev.to):** one automated post a day since April, sometimes two; and before the
25 Aug fix the publisher shipped near-duplicate articles (56 of 121 site pages were near-copies, see CLAUDE.md).

**Side effect:** the daily run stops when Dev.to fails, so aideazz.xyz has had no new daily article since 10 Oct either.

## The appeal (SENT 13 Oct 2026 20:08 UTC from aipa@aideazz.xyz via Zoho SMTP to support@dev.to, Elena in Cc; copy in Zoho Sent; Cc copy verified in her Gmail)

Subject: Account review request — @elenarevicheva (suspended; API returns 401 since 11 Oct)

> Hi DEV team,
>
> My account @elenarevicheva (https://dev.to/elenarevicheva) has been suspended: dev.to/new shows "Your account has been
> suspended and has limited access", and my API key has returned 401 since 11 October.
>
> I want to be transparent about how I have been publishing, because I suspect it is what triggered your spam protection:
>
> - Since April 2026 my articles have been published through the API by my own pipeline, about one a day, with the canonical
>   URL on my site aideazz.xyz. Since late August each article is assembled from measured facts of the AI systems I run in
>   production (logs, commits, incident records).
> - In August I found that the pipeline had been publishing near-duplicate articles (similar topics, reworded). I fixed it on
>   25 August with a similarity check against everything already published, so a new post can no longer repeat an earlier one.
>   Some of the older near-duplicates are still on my profile.
>
> Could you please review the suspension? I am ready to follow whatever you consider good practice: publish far less often,
> unpublish the older near-duplicates (or have you remove them), and keep only articles that stand on their own.
>
> If the suspension is for a different reason, please tell me what it is so I can fix it.
>
> Thank you,
> Elena Revicheva
> AI & Automation Engineer, AIdeazz AI Lab
> https://aideazz.xyz/portfolio

## Next
- Watch for Dev.to's reply (reply radar scans the Zoho inbox every 10 min).
- Elena's call: let aideazz.xyz publish daily even when Dev.to fails (micro fix in the existing publisher).
