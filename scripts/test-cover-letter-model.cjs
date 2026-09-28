#!/usr/bin/env node
/**
 * test-cover-letter-model.cjs — every cover letter carries Elena's operating model.
 *
 *   npm run build && node scripts/test-cover-letter-model.cjs
 *
 * WHY. Until 28 Sep 2026 the first verified fact read "Builds and operates production AI systems
 * solo", so every drafted letter sold Elena alone and the employer met the agents in the
 * interview. The sentence is now requested in the prompt AND guaranteed in code; this checks
 * the code half, which is the half that cannot be talked out of it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist', 'cover-letter.js');
const { OPERATING_MODEL, ensureOperatingModel, describesHerAlone } = require(dist);

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const flat = (s) => s.replace(/\s+/g, ' ');

const opening = 'I am applying for the AI Automation Lead role at Example Co.';
const body = 'At AIdeazz I run a five-provider LLM fallback chain.';
const close = 'I am available to talk this week.\n\nBest regards,\nElena Revicheva';

// 1. Already present → untouched (no duplicate).
const has = [opening, OPERATING_MODEL, body, close].join('\n\n');
check('sentence present → letter unchanged', ensureOperatingModel(has) === has);

// 2. Missing, several paragraphs → inserted as paragraph 2, exactly once.
const multi = ensureOperatingModel([opening, body, close].join('\n\n'));
const paras = multi.split('\n\n');
check('missing (multi-paragraph) → inserted as paragraph 2', paras[1] === OPERATING_MODEL);
check('missing (multi-paragraph) → appears exactly once', flat(multi).split(OPERATING_MODEL).length === 2);
check('missing (multi-paragraph) → opening still first', paras[0] === opening);

// 3. Missing, one paragraph → inserted after the first sentence.
const single = ensureOperatingModel(`${opening} ${body}`);
check('missing (one paragraph) → after first sentence', single.startsWith(`${opening}\n\n${OPERATING_MODEL}`));

// 4. Paraphrased or re-wrapped copy of the sentence still counts as present.
const wrapped = [opening, OPERATING_MODEL.replace('. I own', '.\nI own'), body].join('\n\n');
check('line-wrapped sentence → recognised, not duplicated', ensureOperatingModel(wrapped) === wrapped);

// 5. "Alone" language is caught; ordinary words are not.
check('"built it solo" → caught', describesHerAlone('I built it solo over a weekend.'));
check('"single-handedly" → caught', describesHerAlone('I single-handedly run the fleet.'));
check('"on my own" → caught', describesHerAlone('I did all of this on my own.'));
check('"Solomon Islands" → not caught', !describesHerAlone('Remote, including the Solomon Islands.'));
check('"I lead the work" → not caught', !describesHerAlone('I lead requirements and architecture.'));

// 6. The old framing is gone from what the model is given.
// Comments are stripped: the history note explaining the change may quote the old line.
const src = fs.readFileSync(dist, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('dist no longer says "production AI systems solo"', !/production AI systems solo/.test(src));
check('dist carries the 15-service count', /15 long-running production services/.test(src));

// 7. The CVs and the letters say the same sentence (two homes: TS here, Python for the CVs).
const lanes = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'applications', 'cv-by-lane', 'lanes.json'), 'utf8'));
check('lane CVs carry the identical operating-model sentence', lanes.operating_model === OPERATING_MODEL);
check('lane CVs carry the through-line', /^I design intelligent systems/.test(lanes.through_line || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
