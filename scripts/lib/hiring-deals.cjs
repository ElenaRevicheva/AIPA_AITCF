/**
 * hiring-deals.cjs — which deals are JOB APPLICATIONS, in one place.
 *
 * WHY (29 Sep 2026). The apply machinery (kit, morning queue, read-back audit) each searched
 * `*HIRING-VJH*` on its own, so a job Elena staged by hand got none of it. Elena: "hand-staged
 * deals should be the same stuffed and auto tailored in the future like regular auto searched".
 *
 * A job deal is ANY deal whose name starts with a `[HIRING-…]` prefix — VJH (`[HIRING-VJH…]`), cto-aipa,
 * a hand-staged job (`[HIRING-MANUAL] <title> @ <company>` + a `📌 JOB POSTING` note), or a prefix that
 * does not exist yet. 1 Oct 2026, Elena: "any HIRING option, with any prefix, no matter it comes from
 * CTO, VJH or from me manually". It was a two-prefix allowlist; 7 `[HIRING-MICRO1]` deals sat in
 * I Act TODAY for a week with no CV, defense or brief because nothing listed their prefix.
 * `[HIRING-MANUAL]` also names recruiter-outreach deals, which are NOT applications — the
 * posting mark is what tells them apart, so a manual deal without it is never treated as a job.
 */
'use strict';

const JOB_MARK = '📌 JOB POSTING';

/** HubSpot search filterGroups (OR) for every job deal in one stage. */
function jobDealFilterGroups(stage) {
  // A broad search; isJobDeal() then keeps only names that START with `[HIRING-`.
  return [{ filters: [
    { propertyName: 'dealstage', operator: 'EQ', value: stage },
    { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING*' },
  ] }];
}

/** True for any `[HIRING-…]` deal; for a manual one only when a note carries the posting mark. */
function isJobDeal(dealname, noteBodies) {
  const name = String(dealname || '');
  if (!/^\s*\[HIRING-/i.test(name)) return false;
  if (!/HIRING-MANUAL/i.test(name)) return true;
  return (noteBodies || []).some((b) => String(b || '').includes(JOB_MARK));
}

module.exports = { JOB_MARK, jobDealFilterGroups, isJobDeal };
