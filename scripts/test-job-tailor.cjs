#!/usr/bin/env node
/**
 * test-job-tailor.cjs — the auto-tailored CV and defense note are chosen, never written.
 *
 *   npm run build && node scripts/test-job-tailor.cjs
 *
 * WHY (28 Sep 2026): every new ACT-TODAY hiring deal now gets a tailored CV + a technical-defense
 * note (hs-fill-apply-kit.cjs → scripts/lib/job-tailor.cjs). These checks pin the selection rules
 * and the bank's integrity, so a future edit cannot slip an unverified or "solo" line onto a deal.
 */
'use strict';
const path = require('path');
const t = require(path.join(__dirname, 'lib', 'job-tailor.cjs'));
const { OPERATING_MODEL } = require(path.join(__dirname, '..', 'dist', 'cover-letter.js'));

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

const NIURO = 'Build, deploy, and improve AI systems, agents, and workflow automations. Track KPIs, evaluate impact. '
  + 'Client delivery, SLA management, account growth. Nice to have: agent orchestration, MCP/API integrations, '
  + 'agent context and memory design, AI evaluations and feedback loops.';
const CRM = 'HubSpot CRM administrator: lead routing, sales pipeline, marketing automation, email sequences, RevOps reporting.';
const SEO = 'SEO and GEO specialist: organic search visibility, structured data, content strategy, AI search, analytics.';
const VIDEO = 'Generative AI video producer: film, motion, image generation with Runway, creative storytelling.';

const lane = (l) => ({ lane: l, laneHeadline: 'AI Automation Architect — agents, workflows and the operations around them' });

// ── CV selection ──────────────────────────────────────────────────────────────
const n = t.tailorJob({ title: 'AI Operations & Growth Lead', company: 'Niuro', jd: NIURO, ...lane('automation') });
check('evaluation-heavy posting puts the eval loop first', n.order[0] === 'evalloop');
check('exactly three project blocks (keeps the CV at two pages)', n.order.length === 3);
check('never the unconfirmed EspaLuz block or the small-sample judge block',
  !n.order.includes('espaluz') && !n.order.includes('judge'));
check('headline = the posting title + the lane tagline',
  n.headline === 'AI Operations & Growth Lead — agents, workflows and the operations around them');
check('CRM posting puts the CRM loop first', t.tailorJob({ title: 'HubSpot Admin', company: 'X', jd: CRM, ...lane('crm') }).order[0] === 'loop');
check('SEO posting puts the visibility API first', t.tailorJob({ title: 'SEO Lead', company: 'X', jd: SEO, ...lane('geo') }).order[0] === 'api');
check('creative lane can use the film blocks',
  t.tailorJob({ title: 'AI Video Producer', company: 'X', jd: VIDEO, ...lane('creative') }).order[0] === 'film');
check('other lanes never get the film blocks',
  !t.tailorJob({ title: 'AI Video Producer', company: 'X', jd: VIDEO, ...lane('automation') }).order.some((k) => k === 'film' || k === 'studio'));
check('no posting text still yields three blocks', t.tailorJob({ title: 'AI Lead', company: 'X', jd: '', ...lane('pm') }).order.length === 3);

// ── titles and file names ─────────────────────────────────────────────────────
check('location noise removed', t.cleanTitle('Senior AI Engineer (Remote - LATAM)') === 'Senior AI Engineer');
check('"| Remote" tail removed', t.cleanTitle('AI Ops Lead | Remote') === 'AI Ops Lead');
check('an em dash in the title cannot break the headline split', !t.cleanTitle('Head of AI — Platform').includes('—'));
check('file name is safe', /^[A-Za-z0-9_]+$/.test(t.slugOf('Bjak / KIRA!', 'TPM — AI Finance (Remote)')));

// ── defense note ──────────────────────────────────────────────────────────────
const bank = t.loadBank();
const ids = bank.entries.map((e) => e.id);
check('bank ids are unique', new Set(ids).size === ids.length);
check('every entry has a question and an answer', bank.entries.every((e) => e.id && e.q && e.a));
check('no answer says "solo"', bank.entries.every((e) => !/\bsolo\b/i.test(`${e.a} ${e.push || ''}`)));
check('the frame is her approved sentence, word for word', bank.frame === OPERATING_MODEL);
const d = t.pickDefense({ title: 'AI Operations & Growth Lead', jd: NIURO }, bank);
check('"Who writes the code?" always comes first', d[0].id === 'code');
check('at most five answers (one screen)', d.length <= 5);
check('Niuro posting pulls evals, memory and MCP', ['evals', 'memory', 'mcp'].every((id) => d.some((e) => e.id === id)));
const g = t.pickDefense({ title: 'Specialist', jd: '' }, bank);
check('a posting with no signal still gets the core set', g.map((e) => e.id).join(',') === 'code,evals,rules,bottleneck');
const html = t.renderDefenseHtml({ title: 'A <b>', company: 'B & C', entries: d, frame: bank.frame, cvName: 'CV_x.pdf', mark: '🛡️ TECHNICAL DEFENSE' });
check('note escapes HTML from the posting', html.includes('A &lt;b&gt;') && html.includes('B &amp; C'));
check('note names the tailored CV and carries the frame', html.includes('CV_x.pdf') && html.includes('I operate an AI-native'));

// ── word boundaries (first dry run on 20 real postings, 28 Sep) ───────────────
check('"research" does not trigger the SEO answer',
  !t.pickDefense({ title: 'Coach', jd: 'user research and discovery sessions' }, bank).some((e) => e.id === 'seo'));
check('"rapid" / "capital" do not count as an API',
  t.tailorJob({ title: 'Founding Engineer', company: 'Shaper Capital', jd: 'rapid growth capital firm', ...lane('pm') })._scores.chain === 0);
check('"KPIs" (plural) still counts as KPI',
  t.pickDefense({ title: 'Ops', jd: 'Track KPIs weekly.' }, bank).some((e) => e.id === 'kpi'));
check('"creative problem solving" does not pull the film answer',
  !t.pickDefense({ title: 'AI Engineer', jd: 'creative problem solving, generative AI' }, bank).some((e) => e.id === 'creative'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
