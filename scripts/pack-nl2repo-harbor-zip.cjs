#!/usr/bin/env node
/**
 * Zip the Harbor NL2Repo sample so DataVendor can ingest a taskset.
 * README stays out of the zip — that file is click instructions for Elena.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TASK_DIR = path.join(
  ROOT,
  'docs/selling/harbor/nl2repo-fail-closed-gate'
);
const OUT = path.join(ROOT, 'docs/selling/harbor/nl2repo-fail-closed-gate.zip');
const FOLDER = 'nl2repo-fail-closed-gate';

const FILES = [
  'task.toml',
  'instruction.md',
  'environment/Dockerfile',
  'environment/spec.md',
  'tests/test.sh',
  'tests/test_behavior.py',
  'solution/solve.sh',
  'solution/failclosed.py',
];

for (const rel of FILES) {
  const abs = path.join(TASK_DIR, rel);
  if (!fs.existsSync(abs)) {
    console.error(`missing ${rel}`);
    process.exit(1);
  }
}

const spec = fs.readFileSync(path.join(TASK_DIR, 'environment/spec.md'), 'utf8');
const instruction = fs.readFileSync(
  path.join(TASK_DIR, 'instruction.md'),
  'utf8'
);
if (spec !== instruction) {
  console.error('environment/spec.md must match instruction.md');
  process.exit(1);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'nl2repo-zip-'));
const stagedTask = path.join(staging, FOLDER);
for (const rel of FILES) {
  const dest = path.join(stagedTask, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(TASK_DIR, rel), dest);
}

if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const zip = spawnSync('zip', ['-X', '-r', OUT, FOLDER], {
  cwd: staging,
  encoding: 'utf8',
});
fs.rmSync(staging, { recursive: true, force: true });
if (zip.status !== 0) {
  console.error(zip.stdout);
  console.error(zip.stderr);
  process.exit(zip.status || 1);
}

const listing = spawnSync('zipinfo', ['-1', OUT], { encoding: 'utf8' });
if (listing.status !== 0) {
  console.error(listing.stderr);
  process.exit(listing.status || 1);
}
const names = listing.stdout
  .trim()
  .split('\n')
  .filter((n) => n && !n.endsWith('/'));
const expected = FILES.map((f) => `${FOLDER}/${f}`).sort();
const got = [...names].sort();
if (JSON.stringify(got) !== JSON.stringify(expected)) {
  console.error('zip file list mismatch');
  console.error('expected:\n' + expected.join('\n'));
  console.error('got:\n' + got.join('\n'));
  process.exit(1);
}

const st = fs.statSync(OUT);
console.log(`packed ${OUT} (${st.size} bytes, ${names.length} files)`);
console.log(names.join('\n'));
