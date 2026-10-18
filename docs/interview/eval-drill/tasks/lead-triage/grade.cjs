'use strict';
// Grader for the CTO AIPA lead-triage task (src/lead-triage.ts). It scores an answer the way production USES it:
//  - usable:  the JSON has all 4 fields with allowed values — otherwise production writes
//             "Classification failed — review manually" (no JSON) or "No summary", urgency 1 ("{}" / empty reply).
//  - push_agrees: production pushes a lead into HubSpot only at urgency >= 3 (src/lead-triage.ts:338-344).
//             Does the model make the same push / no-push call as Elena's label? This is the decision that costs money.
//  - within1 / exact: urgency vs her label. Label-based metrics are null until she labels the case.

const SIGNALS = ['job_opportunity', 'client_lead', 'partnership', 'irrelevant', 'unknown'];
const VALUES = ['fractional_engagement', 'full_time_role', 'product_user', 'unknown'];

function usable(p) {
  return !!p && typeof p === 'object'
    && SIGNALS.includes(p.signal_type)
    && Number.isInteger(Number(p.urgency)) && Number(p.urgency) >= 1 && Number(p.urgency) <= 5
    && VALUES.includes(p.deal_value)
    && typeof p.one_line_summary === 'string' && p.one_line_summary.trim().length > 0;
}

function grade(pred, expected) {
  const ok = usable(pred);
  const u = ok ? Number(pred.urgency) : 1; // what production would store
  const label = expected && Number.isInteger(expected.urgency) ? expected.urgency : null;
  return {
    usable: ok ? 1 : 0,
    push_agrees: label === null ? null : ((u >= 3) === (label >= 3) ? 1 : 0),
    within1: label === null ? null : (Math.abs(u - label) <= 1 ? 1 : 0),
    exact: label === null ? null : (u === label ? 1 : 0),
  };
}

const canonical = p => (usable(p) ? { s: p.signal_type, u: Number(p.urgency), d: p.deal_value } : null);

function selftest() {
  const good = { signal_type: 'client_lead', urgency: 4, deal_value: 'fractional_engagement', one_line_summary: 'Clinic owner wants a WhatsApp agent this month.' };
  const t = (name, ok) => ({ name, ok });
  return [
    t('a complete answer is usable', grade(good, null).usable === 1),
    t('"{}" (empty reply) is not usable', grade({}, null).usable === 0),
    t('no JSON at all is not usable', grade(null, null).usable === 0),
    t('urgency 7 is not usable', grade({ ...good, urgency: 7 }, null).usable === 0),
    t('no label → label metrics are null', grade(good, null).push_agrees === null),
    t('4 vs label 3: same push decision', grade(good, { urgency: 3 }).push_agrees === 1),
    t('4 vs label 2: different push decision', grade(good, { urgency: 2 }).push_agrees === 0),
    t('unusable vs label 5: scored as production stores it (1) → disagrees', grade(null, { urgency: 5 }).push_agrees === 0),
  ];
}

module.exports = { grade, canonical, selftest, metrics: ['usable', 'push_agrees', 'within1', 'exact'] };
