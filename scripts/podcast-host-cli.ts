/**
 * podcast-host-cli.ts — one-time init + inspection for the aideazz-podcast feed/site.
 *
 *   npx ts-node scripts/podcast-host-cli.ts init     # create + seed the aideazz-podcast repo
 *   npx ts-node scripts/podcast-host-cli.ts info      # print repo, site URL, feed URL, meta
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { ensurePodcastRepo, podcastMeta, reseedSiteFiles } from '../src/podcast-publish';

async function main() {
  const cmd = (process.argv[2] || 'info').toLowerCase();
  const meta = podcastMeta();

  if (cmd === 'info') {
    console.log('Repo:', process.env.PODCAST_REPO || 'ElenaRevicheva/aideazz-podcast');
    console.log('Site:', meta.siteUrl);
    console.log('Feed:', `${meta.siteUrl}/feed.xml`);
    console.log('Title:', meta.title);
    console.log('Author:', meta.author, '| email:', meta.email, '| category:', meta.category);
    return;
  }

  if (cmd === 'init') {
    console.log('Creating + seeding the podcast repo (cover, manifest, feed, landing page)...');
    await ensurePodcastRepo();
    console.log('Done. Repo + seed files created.');
    console.log(`Next: connect ${process.env.PODCAST_REPO || 'ElenaRevicheva/aideazz-podcast'} to 4everland, then submit ${meta.siteUrl}/feed.xml to Spotify + Apple.`);
    return;
  }

  if (cmd === 'reseed') {
    console.log('Regenerating feed.xml + index.html + episode pages with current site URL...');
    const r = await reseedSiteFiles();
    console.log(`Done. Feed: ${r.feedUrl} (${r.episodes} episodes)`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use: init | info | reseed`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
