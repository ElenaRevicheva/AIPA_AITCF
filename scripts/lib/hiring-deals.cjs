/**
 * hiring-deals.cjs — which deals are JOB APPLICATIONS, in one place.
 *
 * WHY (29 Sep 2026). The apply machinery (kit, morning queue, read-back audit) each searched
 * `*HIRING-VJH*` on its own, so a job Elena staged by hand got none of it. Elena: "hand-staged
 * deals should be the same stuffed and auto tailored in the future like regular auto searched".
 *
 * A job deal is either written by VJH (`[HIRING-VJH…]`) or staged by hand with
 * scripts/stage-manual-job.cjs (`[HIRING-MANUAL] <title> @ <company>` + a `📌 JOB POSTING` note).
 * `[HIRING-MANUAL]` also names recruiter-outreach deals, which are NOT applications — the
 * posting mark is what tells them apart, so a manual deal without it is never treated as a job.
 */
'use strict';

const JOB_MARK = '📌 JOB POSTING';

/** HubSpot search filterGroups (OR) for every job deal in one stage. */
function jobDealFilterGroups(stage) {
  return ['*HIRING-VJH*', '*HIRING-MANUAL*'].map((value) => ({ filters: [
    { propertyName: 'dealstage', operator: 'EQ', value: stage },
    { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value },
  ] }));
}

/** True for a VJH deal; for a manual one only when a note carries the posting mark. */
function isJobDeal(dealname, noteBodies) {
  if (!/HIRING-MANUAL/.test(String(dealname || ''))) return true;
  return (noteBodies || []).some((b) => String(b || '').includes(JOB_MARK));
}

module.exports = { JOB_MARK, jobDealFilterGroups, isJobDeal };
