#!/usr/bin/env node
/**
 * hs-attach-deal-files.cjs — upload a slug's outreach attachments into HubSpot
 * and hang them off the deal's outreach note.
 *
 * The send path MIME-attaches these through Resend, which gets the file to the
 * recipient but leaves the CRM record empty: opening the deal showed a letter
 * that claimed an attachment, with no file anywhere on it. That also breaks the
 * second send option the play insists on — HubSpot UI Email — because there is
 * nothing in HubSpot to attach.
 *
 * Idempotent twice over: an existing file of the same name is reused rather
 * than duplicated, and note ids are unioned rather than replaced. Safe to
 * re-run, which is why staging calls it unconditionally.
 *
 * Usage:
 *   node scripts/hs-attach-deal-files.cjs --slug=datastar-nda [--dry-run]
 *   node scripts/hs-attach-deal-files.cjs --deal=64678307604 [--dry-run]
 *   node scripts/hs-attach-deal-files.cjs --all [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  filesScopeOk,
  uploadOutreachFile,
  addNoteAttachments,
  findOutreachNoteId,
  FOLDER_PATH,
} = require('./hs-files.cjs');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');

const DRY = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=').trim() : '';
};
const SLUG = arg('slug');
const DEAL = arg('deal').replace(/\D/g, '');

if (!SLUG && !DEAL && !ALL) {
  console.error('usage: --slug=<slug> | --deal=<id> | --all  [--dry-run]');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

function targets() {
  if (SLUG) {
    if (!registry[SLUG]) {
      console.error(`slug "${SLUG}" is not in the registry`);
      process.exit(1);
    }
    return [[SLUG, registry[SLUG]]];
  }
  if (DEAL) {
    const hit = Object.entries(registry).find(([, v]) => String(v.dealId || '') === DEAL);
    if (!hit) {
      console.error(`no registry slug points at deal ${DEAL}`);
      process.exit(1);
    }
    return [hit];
  }
  return Object.entries(registry).filter(([, v]) => v.attachments?.length && v.dealId);
}

(async () => {
  console.log(`\n── attach outreach files to HubSpot${DRY ? ' (dry run)' : ''}\n`);

  const scope = await filesScopeOk();
  if (!scope.ok) {
    console.error(`FATAL: ${scope.reason}`);
    process.exit(2);
  }
  console.log(`  files scope ok · folder ${FOLDER_PATH}\n`);

  let uploaded = 0;
  let attached = 0;
  let skipped = 0;

  for (const [slug, entry] of targets()) {
    if (!entry.attachments?.length) {
      console.log(`  · ${slug} — no attachments in the registry, nothing to do`);
      skipped++;
      continue;
    }
    if (!entry.dealId) {
      console.log(`  · ${slug} — no dealId, cannot attach to a note`);
      skipped++;
      continue;
    }

    const noteId = await findOutreachNoteId(entry.dealId);
    if (!noteId) {
      console.log(`  ✖ ${slug} — deal ${entry.dealId} has no note to attach to`);
      skipped++;
      continue;
    }

    const ids = [];
    for (const a of entry.attachments) {
      const abs = path.join(ROOT, a.path);
      if (!fs.existsSync(abs)) {
        console.log(`  ✖ ${slug} — missing on disk: ${a.path}`);
        continue;
      }
      if (DRY) {
        console.log(`  · ${slug} — would upload ${a.filename} (${fs.statSync(abs).size} B) → note ${noteId}`);
        continue;
      }
      const up = await uploadOutreachFile(abs, a.filename);
      console.log(`  ${up.reused ? '·' : '✓'} ${slug} — file ${up.id} ${up.name}${up.reused ? ' (reused)' : ''}`);
      if (!up.reused) uploaded++;
      ids.push(up.id);
    }

    if (DRY || !ids.length) continue;

    const res = await addNoteAttachments(noteId, ids);
    if (res.added.length) {
      console.log(`  ✓ ${slug} — note ${noteId} attachments ${res.before.length} → ${res.after.length}`);
      attached += res.added.length;
    } else {
      console.log(`  · ${slug} — note ${noteId} already carries those files`);
    }
  }

  console.log(`\n── uploaded ${uploaded} · newly attached ${attached} · skipped ${skipped}\n`);
})().catch((e) => {
  if (e.code === 'FILES_SCOPE') {
    console.error(`\nBLOCKED — one scope short:\n${e.message}\n`);
    process.exit(3);
  }
  console.error('hs-attach-deal-files failed:', e.message);
  process.exit(1);
});
