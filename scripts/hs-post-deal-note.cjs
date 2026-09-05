#!/usr/bin/env node
/**
 * Post one markdown file as a HubSpot note on an existing deal.
 *
 * Cloud agents cannot reach api.hubapi.com. Run on Oracle via the hire-trigger
 * bridge: `echo "post-note --deal=<id> --file=docs/selling/....md" > .hire-trigger`
 *
 * Idempotent on the first markdown H1 (or --marker=). A second run with the
 * same marker updates that note instead of creating a duplicate.
 *
 * Usage:
 *   node scripts/hs-post-deal-note.cjs --deal=64302436100 --file=docs/selling/intelliops/WHAT_WE_WANT.md
 *   node scripts/hs-post-deal-note.cjs --deal=64302436100 --file=... --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const dealArg = process.argv.find((a) => a.startsWith('--deal='));
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const markerArg = process.argv.find((a) => a.startsWith('--marker='));

const DEAL = dealArg ? dealArg.slice('--deal='.length).replace(/\D/g, '') : '';
const FILE_REL = fileArg ? fileArg.slice('--file='.length).replace(/\\/g, '/').replace(/^\/+/, '') : '';

if (!DEAL || !FILE_REL) {
  console.error('usage: node scripts/hs-post-deal-note.cjs --deal=<id> --file=docs/selling/....md [--dry-run]');
  process.exit(1);
}
if (!FILE_REL.startsWith('docs/selling/') || FILE_REL.includes('..') || !FILE_REL.endsWith('.md')) {
  console.error('file must be a .md under docs/selling/');
  process.exit(1);
}

const abs = path.join(ROOT, FILE_REL);
if (!fs.existsSync(abs)) {
  console.error(`missing ${FILE_REL}`);
  process.exit(1);
}
const md = fs.readFileSync(abs, 'utf8');
const marker = markerArg
  ? markerArg.slice('--marker='.length)
  : (md.match(/^#\s+(\[.+\].+)$/m) || md.match(/^#\s+(.+)$/m) || [, FILE_REL])[1].trim();

function mdToHtml(src) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
      // HubSpot mobile does not auto-linkify a bare URL. A review note that
      // said "tap SEND BY EMAIL" with a raw https:// line had nothing to tap
      // (IntelliOps, 5 Sep 2026). Remaining http(s) after the markdown pass
      // become real <a href> tags.
      .replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const out = [];
  let inOl = false;
  let inUl = false;
  const closeLists = () => {
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      closeLists();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeLists();
      out.push('<hr>');
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeLists();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    if (line.startsWith('|')) {
      closeLists();
      continue; // tables stay in the repo file; HubSpot notes mangle them
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return out.join('');
}

const html = mdToHtml(md);
console.log(`\n── post-note deal ${DEAL} ← ${FILE_REL}${DRY ? ' (dry run)' : ''}`);
console.log(`  marker  ${marker}`);
console.log(`  html    ${html.length} chars`);

if (DRY) {
  console.log('── dry run, nothing written to HubSpot\n');
  process.exit(0);
}

const KEY = hubspotKey();
if (!KEY) {
  console.error('HUBSPOT_API_KEY missing');
  process.exit(1);
}
const BASE = hubspotBase();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function hs(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON is the finding */
  }
  return { ok: r.ok, status: r.status, json, text };
}

(async () => {
  const deal = await hs('GET', `/crm/v3/objects/deals/${DEAL}?properties=dealname,dealstage`);
  if (!deal.ok) {
    console.error(`  ✖ deal ${DEAL}:`, deal.text.slice(0, 200));
    process.exit(1);
  }
  console.log(`  · deal    ${DEAL}  ${deal.json.properties?.dealname || ''}`);

  const assoc = await hs('GET', `/crm/v4/objects/deals/${DEAL}/associations/notes`);
  const ids = (assoc.json?.results || []).map((x) => x.toObjectId);
  let existing = null;
  for (const id of ids) {
    const n = await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body`);
    const body = n.json?.properties?.hs_note_body || '';
    if (body.includes(marker)) {
      existing = id;
      break;
    }
  }

  if (existing) {
    const up = await hs('PATCH', `/crm/v3/objects/notes/${existing}`, {
      properties: { hs_note_body: html },
    });
    console.log(`  ${up.ok ? '✓' : '✖'} update  note ${existing}`);
    if (!up.ok) process.exit(1);
  } else {
    const n = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: html, hs_timestamp: new Date().toISOString() },
      associations: [
        { to: { id: DEAL }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
      ],
    });
    console.log(`  ${n.ok ? '✓' : '✖'} create  note ${n.ok ? n.json.id : n.text.slice(0, 160)}`);
    if (!n.ok) process.exit(1);
  }
  console.log(`  Deal: https://app.hubspot.com/contacts/51409153/record/0-3/${DEAL}\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
