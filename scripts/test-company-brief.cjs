#!/usr/bin/env node
/**
 * test-company-brief.cjs — the 🔎 COMPANY BRIEF note and the posting check cannot break their neighbours.
 *
 *   node scripts/test-company-brief.cjs
 *
 * WHY (28 Sep 2026): the brief became a note on every ACT-TODAY hiring deal. Every reader of those
 * notes takes "the first https:// link" as the APPLY link, and VJH's learning loop reads notes for
 * Elena's own words — so a brief that looked like any other note would silently swap her apply links
 * for Wikipedia and teach VJH the wrong thing. These checks pin the note's shape, and that the
 * closed-posting phrases stay a faithful copy of VJH's verified list.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cr = require(path.join(__dirname, 'lib', 'company-research.cjs'));
const ps = require(path.join(__dirname, 'lib', 'posting-state.cjs'));

let pass = 0, fail = 0, skip = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

const research = {
  brief: 'Glean sells an enterprise AI work platform[1][8] that connects to internal apps (see https://www.glean.com/about).',
  angle: 'Its move into agentic workflows with governance[3][14].',
  sources: ['https://www.glean.com/about', 'https://sacra.com/c/glean/', 'https://en.wikipedia.org/wiki/Glean?x=1'],
};
const html = cr.renderBriefHtml({ company: 'Glean', research, date: new Date('2026-09-28T12:00:00Z') });

// ── the note's shape ──────────────────────────────────────────────────────────
check('carries the marker VJH skips', html.includes(cr.BRIEF_MARK));
check('no scheme-prefixed URL anywhere (every reader takes the first one as the apply link)', !/https?:\/\//i.test(html));
check('no href (hs-fill-apply-kit jobUrlOf reads href="…")', !/href=/i.test(html));
check('apply-queue parseNote finds no link in it', !(html.replace(/<[^>]+>/g, ' ').match(/https?:\/\/[^\s<>"')]+/)));
check('never reads as a letter (LETTER_RE /COVER LETTER/)', !/COVER LETTER/i.test(html));
check('no "Source:" (apply-queue parseNote reads Source: as the job source)', !/\bSource:/.test(html));
check('no "SEND BY EMAIL" (hs-files findOutreachNoteId)', !/SEND BY EMAIL/i.test(html));
check('Perplexity [1][8] markers removed', !/\[\d+\]/.test(html));
check('sources shown as bare domains', html.includes('glean.com/about') && html.includes('sacra.com/c/glean') && html.includes('en.wikipedia.org/wiki/Glean'));
check('dated, and tells her to check a fact before saying it', html.includes('2026-09-28') && /check a fact/i.test(html));
check('no brief → no note', cr.renderBriefHtml({ company: 'X', research: null }) === null
  && cr.renderBriefHtml({ company: 'X', research: { brief: '  ', angle: 'a', sources: [] } }) === null);
check('HTML in the research is escaped', cr.renderBriefHtml({ company: 'A<b>', research: { brief: 'x <script>', sources: [] } })
  .includes('A&lt;b&gt;'));
check('URL-encoded company shown decoded', cr.renderBriefHtml({ company: 'Scale%20Army%20Careers', research })
  .includes('Scale Army Careers'));

// ── one company, one paid lookup ─────────────────────────────────────────────
check('companyKey decodes and lower-cases', cr.companyKey('Scale%20Army%20Careers') === 'scale army careers');
(async () => {
  const tmp = path.join(os.tmpdir(), `brief-cache-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ 'scale%20army%20careers': { brief: 'old key', sources: [] } }));
  const r = cr.createResearcher('', { cacheFile: tmp });
  const hit = await r.research('Scale Army Careers', 'AI Implementation Specialist');
  check('an entry cached under the old encoded key is found (no second payment)', hit && hit.brief === 'old key' && r.stats.cached === 1);
  check('no key + no cache → null, not a crash', (await r.research('Nobody Inc', 'x')) === null);
  r.save();
  check('save() with nothing new leaves the cache untouched', JSON.parse(fs.readFileSync(tmp, 'utf8'))['scale%20army%20careers'].brief === 'old key');
  fs.unlinkSync(tmp);

  // ── closed postings ──────────────────────────────────────────────────────────
  check('closed phrase detected', ps.looksClosed('<h1>This job opening is closed. SET AN ALERT</h1>') === 'this job opening is closed');
  check('"closed-loop" prose is not a closed posting', ps.looksClosed('We build closed-loop systems.') === '');
  check('no link → unknown, never closed', (await ps.checkPosting('')).state === 'unknown');

  // ── the copies must match their source of truth (VJH) ────────────────────────
  const vjh = [path.join(__dirname, '..', '..', '..', 'VibeJobHunterAIPA_AIMCF'), path.join(os.homedir(), 'VibeJobHunterAIPA_AIMCF')]
    .find((p) => fs.existsSync(path.join(p, 'src', 'scrapers', 'job_enricher.py')));
  if (!vjh) { skip++; console.log('SKIP  VJH repo not found next to cto-aipa — drift checks not run'); }
  else {
    const py = fs.readFileSync(path.join(vjh, 'src', 'scrapers', 'job_enricher.py'), 'utf8');
    const block = (py.match(/_CLOSED_MARKERS = \(([\s\S]*?)\n\)/) || [])[1] || '';
    const list = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    check(`CLOSED_MARKERS is exactly VJH's list (${list.length} phrases)`, list.length > 0 && JSON.stringify(list) === JSON.stringify(ps.CLOSED_MARKERS));
    const sync = fs.readFileSync(path.join(vjh, 'scripts', 'judge_feedback_sync.py'), 'utf8');
    const kit = (sync.match(/_KIT_NOTE = re\.compile\(([\s\S]*?)\)\n/) || [])[1] || '';
    check('VJH _KIT_NOTE knows the brief marker (else it becomes "her reason")', /COMPANY BRIEF/.test(kit));
    check('VJH applied-check skips kit notes', /def _elena_said_applied[\s\S]{0,400}_KIT_NOTE\.search/.test(sync));
  }

  console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
  process.exit(fail ? 1 : 0);
})();
