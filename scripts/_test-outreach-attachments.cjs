#!/usr/bin/env node
/**
 * Prove BSS hire-me letter has the portfolio URL and the resume PDF is
 * attachable (path sanitizer + %PDF- magic + registry wiring).
 *
 * Does not require dist/go-wa.js — that module pulls in the Oracle DB pool.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const OUTREACH_ATTACH_DIR = 'docs/selling/attachments/';

function parseOutreachAttachmentSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pathRaw = String(raw.path || '')
    .trim()
    .replace(/\\/g, '/');
  if (!pathRaw.startsWith(OUTREACH_ATTACH_DIR)) return null;
  if (pathRaw.includes('..') || pathRaw.includes('\0')) return null;
  const base = path.posix.basename(pathRaw);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.pdf$/i.test(base)) return null;
  if (path.posix.normalize(pathRaw) !== pathRaw) return null;
  const wantName = String(raw.filename || base).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}\.pdf$/i.test(wantName)) return null;
  return { relPath: pathRaw, filename: wantName };
}

const draft = fs.readFileSync(
  path.join(ROOT, 'docs/selling/drafts/ai-native-b2b-marketplace-email.txt'),
  'utf8',
);
const matches = draft.match(/https:\/\/aideazz\.xyz\/portfolio/g) || [];
assert.ok(matches.length >= 2, `portfolio URL must appear twice, got ${matches.length}`);
assert.ok(/^SUBJECT:\s*Hire me/m.test(draft), 'subject must be hire-focused');
assert.ok(/TO:\s*contact@bssgroupe\.com/.test(draft), 'To: must stay contact@bssgroupe.com');
assert.ok(/Resume is attached/i.test(draft), 'letter must say resume is attached');

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));
const entry = reg['ai-native-b2b-marketplace'];
assert.ok(entry, 'registry slug missing');
assert.equal(entry.email, 'contact@bssgroupe.com');
assert.ok(Array.isArray(entry.attachments) && entry.attachments.length === 1);

assert.equal(
  parseOutreachAttachmentSpec({ path: 'docs/selling/attachments/../.env', filename: 'x.pdf' }),
  null,
);
assert.equal(parseOutreachAttachmentSpec({ path: 'docs/selling/attachments/secret.txt' }), null);
assert.equal(parseOutreachAttachmentSpec({ path: '/etc/passwd.pdf' }), null);

const parsed = parseOutreachAttachmentSpec(entry.attachments[0]);
assert.ok(parsed, 'registry attachment spec rejected');
assert.equal(parsed.filename, 'Elena_Revicheva_Resume.pdf');

const abs = path.join(ROOT, parsed.relPath);
const buf = fs.readFileSync(abs);
assert.ok(buf.length > 1000 && buf.length < 5 * 1024 * 1024, `unexpected pdf size ${buf.length}`);
assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');

console.log(
  JSON.stringify(
    {
      ok: true,
      portfolioMentions: matches.length,
      subject: draft.match(/^SUBJECT:\s*(.+)$/m)[1],
      to: 'contact@bssgroupe.com',
      resumePath: parsed.relPath,
      resumeFilename: parsed.filename,
      resumeBytes: buf.length,
    },
    null,
    2,
  ),
);
