/**
 * posting-state.cjs — is this job posting still open? Checked every morning by apply-queue.cjs.
 *
 * VJH checks once, when it first finds a job (src/scrapers/job_enricher.py looks_closed). Postings
 * close LATER — 2 Torre jobs sat in "I Act TODAY" already closed on 31 Jul — so the morning page
 * re-checks each link before putting it in front of Elena.
 *
 * CLOSED_MARKERS is a COPY of job_enricher.py _CLOSED_MARKERS, whose phrases were verified on live
 * closed pages. It is copied, not reinvented: scripts/test-company-brief.cjs fails if the two lists
 * ever drift apart. Same rule as VJH: "closed" only on positive evidence, never on absence of it —
 * a JS-rendered board that returns an empty shell is "unknown", not closed.
 */
'use strict';

const CLOSED_MARKERS = [
  'this job opening is closed',
  'opening is closed',
  'this job is closed',
  'position is closed',
  'applications are closed',
  'no longer accepting applications',
  'no longer accepting candidates',
  'this position has been filled',
  'this role has been filled',
  'this job has expired',
  'this posting has expired',
  'job posting is no longer available',
  'this job is no longer available',
  'we are no longer hiring for this',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function looksClosed(html) {
  const low = String(html || '').toLowerCase();
  return CLOSED_MARKERS.find((m) => low.includes(m)) || '';
}

/** → { state: 'open' | 'closed' | 'unknown', why } — never throws. */
async function checkPosting(url, { timeoutMs = 15000 } = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { state: 'unknown', why: 'no link' };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs) });
    // A posting URL that is GONE is positive evidence. 403/5xx is a wall, not an answer.
    if (r.status === 404 || r.status === 410) return { state: 'closed', why: `the link returns HTTP ${r.status}` };
    // Greenhouse sends a closed job back to the board index with ?error=true.
    if (/greenhouse\.io/i.test(r.url) && /[?&]error=true/i.test(r.url)) return { state: 'closed', why: 'Greenhouse says the job is gone' };
    if (!r.ok) return { state: 'unknown', why: `HTTP ${r.status}` };
    const hit = looksClosed(await r.text());
    return hit ? { state: 'closed', why: `the page says "${hit}"` } : { state: 'open', why: '' };
  } catch (e) {
    return { state: 'unknown', why: String(e.name || 'fetch failed') };
  }
}

/** Check many links, a few at a time. */
async function checkAll(urls, { concurrency = 4 } = {}) {
  const out = new Array(urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await checkPosting(urls[i]);
    }
  }));
  return out;
}

module.exports = { CLOSED_MARKERS, looksClosed, checkPosting, checkAll };
