#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { rewriteNoteHtml, absUrl } = require('./hs-fix-send-buttons.cjs');

const slug = 'intelliops-bd';
const url = absUrl(slug);

const relative = `<a href="/go/outreach-email/${slug}"><b>➡️ ENVIAR POR EMAIL — aipa@</b></a>`;
const fixed = rewriteNoteHtml(relative, slug);
assert.ok(fixed.includes(`href="${url}"`), fixed);
assert.ok(!/href=["']\/go\/outreach-email\//.test(fixed), fixed);
assert.ok(fixed.includes('Open this URL if the button fails:'), fixed);
assert.ok(fixed.includes(url));

const already = `<a href="${url}"><b>btn</b></a>`;
const twice = rewriteNoteHtml(already, slug);
assert.equal(twice.split(url).length - 1 >= 2, true);

console.log(JSON.stringify({ ok: true, url, sample: fixed }, null, 2));
