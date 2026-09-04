#!/usr/bin/env node
/**
 * Guards for the IntelliOps addendum send. Each one is a failure that would
 * look fine in a text skim and then go out wrong.
 *
 * Run: node scripts/verify-intelliops-addendum.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const failures = [];
let passed = 0;

function check(name, cond) {
  if (cond) passed++;
  else failures.push(name);
}

const srcDocx = path.join(ROOT, 'docs/selling/intelliops/ADDENDUM_No1_IntelliOps_BD.docx');
const attDocx = path.join(ROOT, 'docs/selling/attachments/ADDENDUM_No1_IntelliOps_BD.docx');
const srcTxt = path.join(ROOT, 'docs/selling/intelliops/ADDENDUM_No1_IntelliOps_BD.txt');
const draft = fs.readFileSync(path.join(ROOT, 'docs/selling/drafts/intelliops-addendum-email.txt'), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/specs/intelliops-addendum.json'), 'utf8'));
const oldDraft = fs.readFileSync(path.join(ROOT, 'docs/selling/drafts/intelliops-bd-email.txt'), 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));

check('source docx exists', fs.existsSync(srcDocx));
check('attachment docx exists', fs.existsSync(attDocx));
check('text extract exists', fs.existsSync(srcTxt));
check(
  'signature page was rendered',
  fs.existsSync(path.join(ROOT, 'docs/selling/intelliops/preview/page-2.png')),
);

const srcBytes = fs.existsSync(srcDocx) ? fs.readFileSync(srcDocx) : Buffer.alloc(0);
const attBytes = fs.existsSync(attDocx) ? fs.readFileSync(attDocx) : Buffer.alloc(0);
check('source and attachment are byte-identical', srcBytes.equals(attBytes) && srcBytes.length > 1000);
check('docx magic PK', srcBytes.slice(0, 2).toString() === 'PK');

const txt = fs.existsSync(srcTxt) ? fs.readFileSync(srcTxt, 'utf8') : '';
check('deemed acceptance after five business days', /deemed accepted/.test(txt) && /five \(5\) business days/.test(txt));
check('commission base excludes only taxes/refunds/credits/chargebacks', /excluding only taxes, refunds, credits and chargebacks/.test(txt));
check('pass-through is NOT a deduction', /pass-through amounts and reimbursable expenses are not deducted/.test(txt));
check('USD + Wise + fifteen business days', /United States dollars/.test(txt) && /Wise/.test(txt) && /fifteen \(15\) business days/.test(txt));
check('twelve-month tail', /twelve \(12\) months after termination/.test(txt));
check('AIdeazz carve-out', /AIdeazz/.test(txt) && /not a conflict under Section 16/.test(txt));
check('20% is unchanged', /20% \(twenty percent\)/.test(txt) && /unchanged/.test(txt));
check('company signature block asks for CIN/GSTIN', /CIN \/ GSTIN/.test(txt));
check('Elena is named, no invented S.A.', /Elena Revicheva/.test(txt) && !/S\.A\./.test(txt));

const piiFile = path.join(ROOT, 'docs/selling/intelliops/forbidden-pii.json');
check('forbidden-pii.json exists in a dropped dir', fs.existsSync(piiFile));
const piiList = JSON.parse(fs.readFileSync(piiFile, 'utf8')).mustNotAppear || [];
check('forbidden-pii.json names at least the cédula and RUC', piiList.length >= 2);
function hasPii(s) {
  return piiList.some((id) => String(s).includes(id));
}
check('addendum text has no forbidden id', !hasPii(txt));
check('draft has no forbidden id', !hasPii(draft));
check('spec has no forbidden id', !hasPii(JSON.stringify(spec)));

const shipped = [
  'scripts/intelliops-addendum-build.py',
  'scripts/verify-intelliops-addendum.cjs',
  'scripts/stage-hiring-outreach.cjs',
];
for (const rel of shipped) {
  const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  check(`${rel} has no forbidden id`, !hasPii(body));
}

check('draft refuses to countersign v2', /I will not countersign the 24 August revision/.test(draft));
check('draft refuses unpaid origination against v2', /I will not start originating against it/.test(draft));
check('draft does not promise to originate first', !/I will start registering immediately/.test(draft));
check('draft offers email acceptance as well as a signature', /accept the same five clauses in a reply/.test(draft));
check('draft has no markdown asterisks', !/\*\*/.test(draft));
check('draft To is Nishant', /^TO: nishant\.chaudhary@intelliopsautomation\.com$/m.test(draft));
check('draft Cc is Natalie + Elena gmail', /natalie\.adel@intelliopsautomation\.com/.test(draft) && /elena\.revicheva2016@gmail\.com/.test(draft));
check('subject threads the existing conversation', /four remaining items so commission is actually collectable/.test(draft));
check('old 25 Aug draft was not overwritten', /Thank you for the revision, and for taking the four points seriously/.test(oldDraft));
check('old slug still points at the same deal', registry['intelliops-bd']?.dealId === '64302436100');
check('new slug is not yet claiming a different deal', !registry['intelliops-addendum'] || registry['intelliops-addendum'].dealId === '64302436100');

check('spec slug', spec.slug === 'intelliops-addendum');
check('spec reuses the existing counterparty', spec.email === 'nishant.chaudhary@intelliopsautomation.com');
check('spec attachment path', spec.attachments?.[0]?.path === 'docs/selling/attachments/ADDENDUM_No1_IntelliOps_BD.docx');
const bundle = fs.readFileSync(path.join(ROOT, 'scripts/build-license-bundle.cjs'), 'utf8');
check('docs/selling/ is still dropped from the licence bundle', /'docs\/selling\/'/.test(bundle));
check('spec body matches the draft body', draft.includes(spec.body.trim()));

const DIST = path.join(ROOT, 'dist/go-wa.js');
if (fs.existsSync(DIST)) {
  const { parseOutreachAttachmentSpec } = require(DIST);
  const parsed = parseOutreachAttachmentSpec(spec.attachments[0]);
  check('send path accepts the addendum attachment', !!(parsed && parsed.filename === 'ADDENDUM_No1_IntelliOps_BD.docx'));
} else {
  check('send path accepts the addendum attachment', false);
}

const dry = execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'scripts/stage-hiring-outreach.cjs'),
    'docs/selling/specs/intelliops-addendum.json',
    '--reuse-deal=64302436100',
    '--dry-run',
  ],
  { encoding: 'utf8', cwd: ROOT },
);
check('dry-run reuses the deal instead of creating one', /would REUSE deal 64302436100/.test(dry) && !/would create company\/contact\/deal/.test(dry));
check('dry-run does not write a registry key', !registry['intelliops-addendum']);

if (failures.length) {
  console.error(`FAIL ${failures.length}  ${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`PASS ${passed} guards`);
