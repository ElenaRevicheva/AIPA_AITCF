/**
 * job-identity.ts — when are two sightings the SAME job?
 *
 * 2026-10-26 (Elena): "one deal means one job with one true-facts profound kit prepared according to the
 * original job source requirements." The hiring webhook de-duplicated by EXACT deal name only, so the same
 * posting under a second title string opened a twin every time and had to be merged by hand:
 *   - CI&T 32354: "[Job - 32354] AI Solution Architect, Brazil at CI&T @ CI&T" (an aggregator copy) and
 *     "CI&T - [Job - 32354] AI Solution Architect, Colombia @ Ciandt" (Lever, the origin) — one Lever url.
 *   - Scale Army: "… @ Scale Army ... @ Scale Army Careers" (Google's truncation) and "… @ Scale Army Careers",
 *     one Ashby url that differed only in letter case.
 * Pure functions, no I/O: tested by scripts/test-hiring-dedup.cjs.
 */

const STOP = new Set(['at', 'in', 'of', 'the', 'and', 'or', 'for', 'to', 'a', 'an', 'remote', 'job', 'latin', 'america', 'latam']);

/** One string for one posting: no scheme, no www, lower-cased host, decoded + lower-cased path, no trailing
 *  slash, no query (utm, ref…) or hash. '' when it is not a url. */
export function normalizeJobUrl(u: string): string {
  try {
    const url = new URL(String(u || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch { /* keep as is */ }
    path = path.toLowerCase().replace(/\/+$/, '');
    return host ? `${host}${path}` : '';
  } catch {
    return '';
  }
}

/** The words of a job title, numbers included (a job id tells two postings apart). */
export function titleWords(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of String(title || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (w.length >= 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** A deal name "[PREFIX] <title> @ <company>" → { title, company }. */
export function splitDealName(dealName: string): { title: string; company: string } {
  let s = String(dealName || '').replace(/^\s*\[[^\]]*\]\s*/, '');
  const at = s.lastIndexOf(' @ ');
  if (at < 0) return { title: s.trim(), company: '' };
  return { title: s.slice(0, at).trim(), company: s.slice(at + 3).trim() };
}

export function companyKey(company: string): string {
  return String(company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when the incoming (title, company) names the job an existing deal is about: the companies are the same
 *  (one key contains the other: "scalearmy" ⊂ "scalearmycareers") and the two titles share 0.8 of their words
 *  BOTH ways, company words set aside ("… @ Scale Army ..." left in a title by Google's truncation does not
 *  count). Both ways, so "AI Automation Engineer" is not "AI Implementation & Automation Engineer" (3 of 4), and
 *  "[Job - 29399] AI Solutions Architect" is not "[Job - 32354] AI Solution Architect" (3 of 5). */
export function sameJob(incomingTitle: string, incomingCompany: string, dealTitle: string, dealCompany: string): boolean {
  const a = companyKey(incomingCompany), b = companyKey(dealCompany);
  if (!a || !b || !(a.includes(b) || b.includes(a))) return false;
  const longer = a.length >= b.length ? a : b;
  const strip = (words: Set<string>) => new Set([...words].filter((w) => !longer.includes(w)));
  const want = strip(titleWords(incomingTitle)), have = strip(titleWords(dealTitle));
  if (!want.size || !have.size) return false;
  const share = (x: Set<string>, y: Set<string>) => [...x].filter((w) => y.has(w)).length / x.size;
  return Math.min(share(want, have), share(have, want)) >= 0.8;
}

/** The "Job URL: …" line of a hiring deal's description, or ''. */
export function jobUrlOfDescription(description: string): string {
  const m = String(description || '').match(/^Job URL:\s*(\S+)/m);
  return (m && m[1]) || '';
}
