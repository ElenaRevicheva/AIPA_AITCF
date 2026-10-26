#!/usr/bin/env node
/**
 * test-hiring-dedup.cjs — one deal means one job (26 Oct 2026). Offline, against dist/job-identity.js.
 * Run: npm run build && node scripts/test-hiring-dedup.cjs
 */
'use strict';
const assert = require('assert');
const { normalizeJobUrl, sameJob, splitDealName, jobUrlOfDescription, titleWords } = require('../dist/job-identity.js');

let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };
const eq = (a, b, what) => { assert.strictEqual(a, b, `${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); n++; };

// ── the url: Scale Army's two letter cases, CI&T's one Lever url, query/hash/slash/www/scheme noise ──
const ashbyLower = 'https://jobs.ashbyhq.com/scale%20army%20careers/5d8b143e-e75e-4104-9afb-10c678979216';
const ashbyUpper = 'https://jobs.ashbyhq.com/scale%20Army%20Careers/5d8b143e-e75e-4104-9afb-10c678979216';
eq(normalizeJobUrl(ashbyLower), normalizeJobUrl(ashbyUpper), 'Ashby url, two letter cases, one job');
eq(normalizeJobUrl(ashbyLower), 'jobs.ashbyhq.com/scale army careers/5d8b143e-e75e-4104-9afb-10c678979216', 'decoded, lower-cased');
eq(normalizeJobUrl('http://www.Jobs.Lever.co/ciandt/989a2fd5/?utm_source=x#apply'), 'jobs.lever.co/ciandt/989a2fd5', 'scheme, www, query, hash, slash dropped');
eq(normalizeJobUrl('not a url'), '', 'not a url');
eq(normalizeJobUrl(''), '', 'empty');
ok(normalizeJobUrl('https://dailyremote.com/remote-job/job-32354') !== normalizeJobUrl('https://jobs.lever.co/ciandt/989a2fd5'),
  'an aggregator copy and the origin are two urls (the title rule catches those)');

// ── the deal name ──
eq(JSON.stringify(splitDealName('[HIRING-VJH-SERP-LEAD] [Job - 32354] AI Solution Architect, Colombia at CI&T @ CI&T')),
  JSON.stringify({ title: '[Job - 32354] AI Solution Architect, Colombia at CI&T', company: 'CI&T' }), 'prefix off, last @ splits');
eq(JSON.stringify(splitDealName('[HIRING-VJH-SERP-LEAD] Business Systems Automation Specialist @ Scale Army ... @ Scale Army Careers')),
  JSON.stringify({ title: 'Business Systems Automation Specialist @ Scale Army ...', company: 'Scale Army Careers' }), 'Google truncation kept in the title');
eq(JSON.stringify(splitDealName('[HIRING-MANUAL] AI Video Producer - Senior-Level')), JSON.stringify({ title: 'AI Video Producer - Senior-Level', company: '' }), 'no company');

// ── the same job ──
ok(sameJob('Business Systems Automation Specialist', 'Scale Army Careers',
  'Business Systems Automation Specialist @ Scale Army ...', 'Scale Army Careers'), 'Scale Army twins are one job');
ok(sameJob('Business Systems Automation Specialist', 'Scale Army',
  'Business Systems Automation Specialist', 'Scale Army Careers'), 'company key contains the other');
ok(sameJob('CI&T - [Job - 32354] AI Solution Architect, Colombia', 'CI&T',
  '[Job - 32354] AI Solution Architect, Brazil at CI&T', 'CI&T'), 'CI&T twins: 32354, ai, solution, architect match (brazil/colombia do not count against)');
ok(!sameJob('[Job - 29399] AI Solutions Architect, Brazil', 'CI&T',
  '[Job - 32354] AI Solution Architect, Brazil at CI&T', 'CI&T'), 'two CI&T job ids are two jobs');
ok(!sameJob('Senior AI Product Owner', 'Jobsity', 'Senior AI Product Owner', 'CodeRoad'), 'same title, another company');
ok(sameJob('Senior AI Product Owner', 'Jobsity', 'Senior AI Product Owner at Jobsity - Latin America Remote', 'Jobsity'),
  'origin title vs aggregator title with location noise');
ok(!sameJob('AI Automation Engineer', 'Databricks', 'AI Implementation & Automation Engineer', 'Databricks'), '3 of 4 words is not the same job (shorter incoming)');
ok(!sameJob('AI Implementation & Automation Engineer', 'Databricks', 'AI Automation Engineer', 'Databricks'), '3 of 4 words is not the same job (longer incoming)');
ok(sameJob('Business Systems Automation Specialist @ Scale Army ...', 'Scale Army Careers', 'Business Systems Automation Specialist', 'Scale Army Careers'), 'company words left in a title by truncation do not count');
ok(!sameJob('', 'Jobsity', 'Senior AI Product Owner', 'Jobsity'), 'no title, no match');
ok(!sameJob('Senior AI Product Owner', '', 'Senior AI Product Owner', ''), 'no company, no match');
eq([...titleWords('[Job - 32354] AI Solution Architect, Brazil at CI&T')].join(' '), '32354 ai solution architect brazil ci', 'title words, numbers kept, stop words out');

// ── the description ──
eq(jobUrlOfDescription('Category: hiring\nStage: applied\nJob URL: https://jobs.lever.co/ciandt/989a2fd5\nAggregator copy: https://x\nSource: serpapi_jobs'),
  'https://jobs.lever.co/ciandt/989a2fd5', 'Job URL line');
eq(jobUrlOfDescription('Category: hiring\nSource: vjh_review'), '', 'no Job URL line');

console.log(`✓ test-hiring-dedup: ${n} checks passed`);
