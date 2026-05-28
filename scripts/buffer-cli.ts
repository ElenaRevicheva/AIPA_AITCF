/**
 * buffer-cli.ts — manual Buffer distribution CLI (STAGE A, additive)
 *
 * The ONLY way Buffer posting fires in Stage A. Nothing automated. Run by hand.
 * The existing VJH CMO -> Make.com -> Buffer path is untouched and unaffected.
 *
 * Usage (run on a machine where BUFFER_API_TOKEN is set, e.g. Oracle):
 *   npx ts-node scripts/buffer-cli.ts channels   # list connected channels (read-only)
 *   npx ts-node scripts/buffer-cli.ts idea       # safe: create a private backlog idea
 *   npx ts-node scripts/buffer-cli.ts dry        # build social variants for latest blog, print, DO NOT post
 *   npx ts-node scripts/buffer-cli.ts draft      # post latest blog to Buffer as DRAFTS (not published)
 *   npx ts-node scripts/buffer-cli.ts post       # queue latest blog to Buffer (real: addToQueue)
 *
 * Safe progression: channels -> idea -> dry -> draft -> post.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import Anthropic from '@anthropic-ai/sdk';
import {
  bufferGetChannels,
  bufferPostableChannels,
  bufferCreateIdea,
  distributeArticleToBuffer,
  readLatestBlogArticle,
} from '../src/buffer-publisher';

async function main() {
  const cmd = (process.argv[2] || 'channels').toLowerCase();

  if (!process.env.BUFFER_API_TOKEN?.trim()) {
    console.error('BUFFER_API_TOKEN not set in env/.env — cannot continue');
    process.exit(1);
  }

  if (cmd === 'channels') {
    const channels = await bufferGetChannels();
    console.log(`\nConnected Buffer channels (${channels.length}):`);
    for (const c of channels) {
      const flags = [c.isDisconnected ? 'DISCONNECTED' : '', c.isLocked ? 'LOCKED' : ''].filter(Boolean).join(' ');
      console.log(`  - ${c.service.padEnd(10)} ${c.displayName || c.name}  (${c.id})  ${flags}`);
    }
    const postable = await bufferPostableChannels();
    console.log(`\nPostable (connected, unlocked, in BUFFER_TARGET_SERVICES=${process.env.BUFFER_TARGET_SERVICES || 'linkedin'}): ${postable.map((c) => c.service).join(', ') || '(none)'}\n`);
    return;
  }

  if (cmd === 'idea') {
    const idea = await bufferCreateIdea(
      'AIdeazz CLI test (safe to delete)',
      'Created by scripts/buffer-cli.ts to verify the Buffer integration. Private backlog item, not published.',
    );
    console.log(`\nCreated idea ${idea.id} in your private Buffer backlog (safe to delete).\n`);
    return;
  }

  // Remaining commands need an article + Anthropic
  const article = readLatestBlogArticle();
  if (!article) {
    console.error('No blog article found in cache (data/blog-posts-cache.json). Publish a blog first.');
    process.exit(1);
  }
  console.log(`\nLatest blog: "${article.title}" (slug: ${article.slug})`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  if (cmd === 'dry') {
    const r = await distributeArticleToBuffer(anthropic, article, { dryRun: true });
    console.log(`\n--- DRY RUN (no posts created) ---`);
    for (const preview of r.skipped) console.log(`\n${preview}`);
    console.log('');
    return;
  }

  if (cmd === 'draft') {
    const r = await distributeArticleToBuffer(anthropic, article, { saveToDraft: true });
    console.log(`\n--- DRAFTS created (not published) ---`);
    for (const p of r.posted) console.log(`  ${p.ok ? 'OK' : 'FAIL'} channel=${p.channelId} ${p.id || p.error}`);
    for (const s of r.skipped) console.log(`  SKIP ${s}`);
    console.log('');
    return;
  }

  if (cmd === 'post') {
    const r = await distributeArticleToBuffer(anthropic, article, {});
    console.log(`\n--- QUEUED to Buffer (addToQueue) ---`);
    for (const p of r.posted) console.log(`  ${p.ok ? 'OK' : 'FAIL'} channel=${p.channelId} ${p.id || p.error}`);
    for (const s of r.skipped) console.log(`  SKIP ${s}`);
    console.log('');
    return;
  }

  console.error(`Unknown command: ${cmd}. Use: channels | idea | dry | draft | post`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
