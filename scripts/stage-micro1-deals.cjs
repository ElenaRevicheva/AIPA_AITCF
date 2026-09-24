#!/usr/bin/env node
/**
 * stage-micro1-deals.cjs — put the 8 micro1 roles Elena chose (23 Sep 2026) into HubSpot as
 * HIRING deals she can apply from: one deal, one apply note (link, rate, CV to upload, why she
 * fits, the honest gap), the lane CV attached to that note, and a task due today.
 *
 *   node scripts/stage-micro1-deals.cjs            → dry run
 *   node scripts/stage-micro1-deals.cjs --apply    → create
 *
 * Source of the roles: docs/applications/2026-09-23_micro1_job_scan.md (all 364 read).
 *
 * WHY [HIRING-MICRO1] and not [HIRING-VJH-*]: VJH did not find these; the apply-kit job
 * (hs-fill-apply-kit.cjs) only fills cover letters on *HIRING-VJH* deals, and micro1 applies by
 * rate + resume + AI interview, not a letter. The judge-feedback sync matches the token HIRING,
 * so these outcomes DO teach VJH — intended: AI-training marketplaces are the chosen income path.
 *
 * Idempotent: a deal whose exact name already exists is skipped.
 */
'use strict';

const path = require('path');
const { hubspotKey, hubspotBase, hubspotOwnerId } = require(path.join(__dirname, 'hs-env.cjs'));
const { uploadOutreachFile, addNoteAttachments } = require(path.join(__dirname, 'hs-files.cjs'));

const APPLY = process.argv.includes('--apply');
const COMPANY_ID = '57299954768'; // micro1 · micro1.ai (existing record)
const CV_DIR = path.join(__dirname, '..', 'docs', 'applications', 'cv-by-lane');
const POST = (id) => `https://jobs.micro1.ai/post/${id}`;

const ROLES = [
  { title: 'AI Consulting Domain Expert', id: '392f2203-398d-4479-b823-d0244147ba4a', pay: '$100–200/h', rate: 150, cv: 'CV_Elena_Revicheva_architect.pdf',
    fit: ['Wants 3+ yrs corporate strategy / business transformation — 7 yrs Deputy CEO of a national e-government operator, running transformation programmes.',
          'Business cases, executive summaries, rubric-based review of AI output, prompt refinement — all daily work.',
          'MA + RANEPA Presidential Program for Executive Management (advanced degree is "a plus").'],
    gap: 'Enterprise AI Workflow Expert was "Not selected" in Aug — lead with transformation and written deliverables, not with AI tools.' },
  { title: 'AI Domain Expert', id: '9376db02-e91b-41e3-b10c-e865ff8aa2a6', pay: '$140–200/h', rate: 170, cv: 'CV_Elena_Revicheva_evaluation.pdf',
    fit: ['3+ yrs in Legal with exceptional written work — 7 yrs Chief Legal Officer: legal memoranda, contracts, regulatory positions.',
          'Plus live production AI systems: evaluates AI output for a living (534-test eval suite, LLM judge).'],
    gap: 'Part time. Say which domain you are the expert in: legal + AI operations.' },
  { title: 'AI Software Engineering Domain Expert', id: '9c1927de-288b-45c9-b3d2-e68c6fb07c1f', pay: '$100–200/h', rate: 140, cv: 'CV_Elena_Revicheva_evaluation.pdf',
    fit: ['Authoring/reviewing postmortems, technical blogs, design docs — public AI Ops Wiki (22 incidents, 19 named failure modes), daily engineering blog, repo docs.',
          'Rubric-based review of AI-written technical content; uses AI coding tools daily (Claude Code, Cursor).'],
    gap: 'Prefers 3+ yrs as Software Engineer / Solutions Architect. Real figure: production engineering since May 2025 (~16 months). Say it straight.' },
  { title: 'AI trainer', id: '972f4b3e-07a1-4a00-bd6a-b16da1f61461', pay: '$100–180/h', rate: 130, cv: 'CV_Elena_Revicheva_evaluation.pdf',
    fit: ['Domain expertise named in the posting: law and writing — CLO 7 yrs, 99 published poems (46 in Russian, 53 in English).',
          'Critique AI outputs, write rationales, author prompts — same work as her eval harness and LLM judge.'],
    gap: 'Broad pool — the specific numbers (534 tests, 20 of 51 wrong rejections caught) make the difference.' },
  { title: 'GitHub Specialist', id: '2ba22339-ccb7-4f5e-961b-18939149cffe', pay: '$90–175/h', rate: 120, cv: 'CV_Elena_Revicheva_evaluation.pdf',
    fit: ['Screen-record GitHub workflows + write prompts and rubrics.',
          'GitHub Actions deploy workflow over 12 services; 1,640 / 578 / 3,513 commits across three repos; a bot that opens real pull requests.'],
    gap: 'You must do branch → commit → PR → review → merge BY HAND in the GitHub UI on camera. Practise once before the interview.' },
  { title: 'HubSpot Specialist', id: '5d640e1d-8b4f-4e8f-8f08-53cf71c17dc8', pay: '$28–92/h', rate: 80, cv: 'CV_Elena_Revicheva_automation.pdf',
    fit: ['Screen-record HubSpot workflows (contacts, deals, pipelines, tasks, reporting, automation) + rubrics.',
          '"Current access to HubSpot" — paid HubSpot Starter account, used daily; CRM written by ten agents with source prefixes.'],
    gap: 'Low floor ($28). Ask near the top of the range.' },
  { title: 'Senior AI Trainer (robotic-arm video annotation)', id: '21b6f2ad-63a8-47d4-9fd7-31667bf3dbb1', pay: '$50–90/h', rate: 80, cv: 'CV_Elena_Revicheva_evaluation.pdf',
    fit: ['Frame-accurate start/end timestamps and event segmentation; Latin America eligible.',
          'Already SELECTED for micro1 Video Annotation Specialist (Titan Proton); her film pipeline verifies every render before release.'],
    gap: 'Not the $14–36 "Senior AI Trainer" also listed — this link is the $50–90 one.' },
  { title: 'Russian Bilingual Expert', id: 'c732f04d-3d0e-410f-ba42-781cd9f09915', pay: '$30–65/h', rate: 60, cv: 'CV_Elena_Revicheva_language.pdf',
    fit: ['Native Russian + fluent English: rate nativeness/fluency of Russian audio, justify in English.',
          'Published author in both languages: 46 poems in Russian (LITPROM, 2019–2025) and 53 in English — ear for intonation and register.'],
    gap: 'Lowest pay of the eight, but the easiest yes.' },
];

async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 4) { await r.text(); await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${urlPath.split('?')[0]} -> ${r.status} ${text.slice(0, 160)}`);
    return text ? JSON.parse(text) : {};
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteBody(r) {
  return [
    `<strong>⚠️ MANUAL APPLY REQUIRED — micro1 (${esc(r.pay)}). You submit.</strong>`,
    `<p>Apply: <a href="${POST(r.id)}">${POST(r.id)}</a></p>`,
    `<p><strong>🚨 The form pre-fills "Your rate: $1/hour".</strong> Change it before Next. Suggested: <strong>$${r.rate}/h</strong> (inside ${esc(r.pay)}; your Titan Proton contract is $80/h). Your call.</p>`,
    `<p><strong>Resume:</strong> the form defaults to <code>Elena.pdf</code> — click "Upload new" and use the CV attached to this note (<code>${esc(r.cv)}</code>).</p>`,
    `<p><strong>Why you fit (all verified):</strong></p><ul>${r.fit.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`,
    `<p><strong>Honest gap:</strong> ${esc(r.gap)}</p>`,
    '<p>Process: screening questions → AI interview (~30 min) → review. Source: docs/applications/2026-09-23_micro1_job_scan.md</p>',
  ].join('');
}

(async () => {
  const owner = hubspotOwnerId();
  const due = new Date(); due.setUTCHours(23, 0, 0, 0);
  const cvIds = new Map();
  let made = 0, skipped = 0;
  for (const r of ROLES) {
    const dealname = `[HIRING-MICRO1] ${r.title} @ micro1`;
    const exist = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: dealname }] }], properties: ['dealname'], limit: 1,
    });
    if (exist.total) { console.log(`  = exists  ${dealname} (${exist.results[0].id})`); skipped++; continue; }
    if (!APPLY) { console.log(`  · would   ${dealname}  → ${r.cv}, rate $${r.rate}`); continue; }

    const deal = await hs('POST', '/crm/v3/objects/deals', {
      properties: { dealname, pipeline: 'default', dealstage: 'qualifiedtobuy', hubspot_owner_id: owner },
      associations: [{ to: { id: COMPANY_ID }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }] }],
    });
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteBody(r), hs_timestamp: new Date().toISOString(), hubspot_owner_id: owner },
      associations: [{ to: { id: deal.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
    if (!cvIds.has(r.cv)) cvIds.set(r.cv, (await uploadOutreachFile(path.join(CV_DIR, r.cv), r.cv)).id);
    await addNoteAttachments(note.id, [cvIds.get(r.cv)]);
    await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `Apply: ${r.title} (micro1) — set rate $${r.rate}/h, upload ${r.cv}`,
        hs_task_body: `Link: ${POST(r.id)}\nThe form pre-fills $1/hour — change it. Upload the CV attached to the deal note.`,
        hs_timestamp: due.toISOString(), hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hubspot_owner_id: owner,
      },
      associations: [{ to: { id: deal.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] }],
    });
    made++;
    console.log(`  ✓ created ${dealname}  deal ${deal.id} · note ${note.id} + ${r.cv} · task`);
  }
  console.log(`created ${made} · already existed ${skipped}${APPLY ? '' : '  (DRY RUN)'}`);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
