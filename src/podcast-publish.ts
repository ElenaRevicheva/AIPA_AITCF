/**
 * podcast-publish.ts — publishes episodes to the aideazz-podcast repo via GitHub API (ADDITIVE)
 *
 * ensurePodcastRepo(): create + seed the repo (cover art, empty manifest, seed feed/index) if missing.
 * publishEpisode(): commit audio + update manifest + regenerate feed.xml + index.html + episode page.
 *
 * 4everland serves the repo at PODCAST_SITE_URL. Spotify/Apple subscribe to {site}/feed.xml.
 * Gated by the caller (PODCAST_PUBLISH_ENABLED). Uses the same GITHUB_TOKEN as the blog pipeline.
 */

import { generateFeedXml, generateIndexHtml, type PodcastEpisode, type PodcastMeta } from './podcast-feed';

const API = 'https://api.github.com';

function repoFull(): string { return process.env.PODCAST_REPO?.trim() || 'ElenaRevicheva/aideazz-podcast'; }
function siteUrl(): string { return (process.env.PODCAST_SITE_URL?.trim() || 'https://podcast.aideazz.xyz').replace(/\/$/, ''); }
function ghToken(): string {
  const t = process.env.GITHUB_TOKEN?.trim();
  if (!t) throw new Error('GITHUB_TOKEN not set');
  return t;
}

export function podcastMeta(): PodcastMeta {
  const site = siteUrl();
  return {
    title: process.env.PODCAST_TITLE?.trim() || 'AIdeazz — Building in Public with AI',
    description: process.env.PODCAST_DESC?.trim() || 'A solo founder building a company with AI agents. Honest lessons on AI-augmented building, marketing engines, and shipping in production. By Elena Revicheva.',
    author: process.env.PODCAST_AUTHOR?.trim() || 'Elena Revicheva',
    email: process.env.PODCAST_EMAIL?.trim() || process.env.MARKETING_INQUIRY_TO || 'elena.revicheva2016@gmail.com',
    siteUrl: site,
    coverUrl: `${site}/cover.png`,
    language: process.env.PODCAST_LANG?.trim() || 'en',
    category: process.env.PODCAST_CATEGORY?.trim() || 'Technology',
  };
}

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ghToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'aideazz-podcast/1.0',
  };
}

async function ghGetFile(path: string): Promise<{ contentB64: string; sha: string } | null> {
  const r = await fetch(`${API}/repos/${repoFull()}/contents/${path}`, { headers: ghHeaders() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub get ${path} failed ${r.status}`);
  const j = (await r.json()) as { content?: string; sha?: string };
  return { contentB64: (j.content || '').replace(/\n/g, ''), sha: j.sha || '' };
}

async function ghPutFile(path: string, contentB64: string, message: string): Promise<void> {
  const existing = await ghGetFile(path).catch(() => null);
  const body: Record<string, string> = { message, content: contentB64 };
  if (existing?.sha) body.sha = existing.sha;
  const r = await fetch(`${API}/repos/${repoFull()}/contents/${path}`, {
    method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub put ${path} failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function repoExists(): Promise<boolean> {
  const r = await fetch(`${API}/repos/${repoFull()}`, { headers: ghHeaders() });
  return r.ok;
}

/** Generate a simple branded 1500x1500 cover PNG (Apple/Spotify require >=1400 square). */
async function generateCoverPng(meta: PodcastMeta): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0d12"/><stop offset="1" stop-color="#1a2030"/></linearGradient></defs>
    <rect width="1500" height="1500" fill="url(#g)"/>
    <circle cx="750" cy="560" r="200" fill="none" stroke="#6ee7b7" stroke-width="14"/>
    <text x="750" y="600" font-family="Arial,sans-serif" font-size="170" fill="#6ee7b7" text-anchor="middle">AIdeazz</text>
    <text x="750" y="980" font-family="Arial,sans-serif" font-size="78" fill="#e8ecf3" text-anchor="middle">Building in Public</text>
    <text x="750" y="1080" font-family="Arial,sans-serif" font-size="78" fill="#e8ecf3" text-anchor="middle">with AI</text>
    <text x="750" y="1320" font-family="Arial,sans-serif" font-size="48" fill="#8b93a7" text-anchor="middle">${meta.author}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Create + seed the podcast repo if it does not exist. Returns true if it now exists. */
export async function ensurePodcastRepo(): Promise<boolean> {
  if (await repoExists()) return true;
  const name = repoFull().split('/')[1];
  const create = await fetch(`${API}/user/repos`, {
    method: 'POST', headers: ghHeaders(),
    body: JSON.stringify({ name, private: false, description: 'AIdeazz podcast — auto-published by the Voice Growth Engine', auto_init: true, homepage: siteUrl() }),
  });
  if (!create.ok && create.status !== 422 /* already exists */) {
    throw new Error(`create repo failed ${create.status}: ${(await create.text()).slice(0, 200)}`);
  }
  // small delay for auto_init commit to land
  await new Promise((r) => setTimeout(r, 2500));
  const meta = podcastMeta();
  const cover = await generateCoverPng(meta);
  await ghPutFile('cover.png', cover.toString('base64'), 'seed: cover art');
  await ghPutFile('episodes.json', Buffer.from('[]').toString('base64'), 'seed: empty manifest');
  await ghPutFile('feed.xml', Buffer.from(generateFeedXml(meta, [])).toString('base64'), 'seed: empty feed');
  await ghPutFile('index.html', Buffer.from(generateIndexHtml(meta, [])).toString('base64'), 'seed: landing page');
  return true;
}

async function readManifest(): Promise<PodcastEpisode[]> {
  const f = await ghGetFile('episodes.json');
  if (!f) return [];
  try { return JSON.parse(Buffer.from(f.contentB64, 'base64').toString('utf8')); } catch { return []; }
}

function episodePageHtml(meta: PodcastMeta, e: PodcastEpisode): string {
  const chapters = e.chapters?.length ? '<h3>Chapters</h3><ul>' + e.chapters.map((c) => `<li>${c.time} — ${c.title}</li>`).join('') + '</ul>' : '';
  return `<!DOCTYPE html><html lang="${meta.language}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>${e.title}</title>
<style>body{background:#0b0d12;color:#e8ecf3;font:16px/1.6 -apple-system,Segoe UI,sans-serif;max-width:720px;margin:0 auto;padding:40px 20px}a{color:#6ee7b7}audio{width:100%;margin:16px 0}</style>
</head><body><a href="${meta.siteUrl}">← ${meta.title}</a><h1>${e.title}</h1>
<audio controls src="${e.audioUrl}"></audio><p>${e.description.replace(/</g, '&lt;')}</p>${chapters}
${e.blogUrl ? `<p><a href="${e.blogUrl}">Full write-up →</a></p>` : ''}</body></html>`;
}

export interface PublishEpisodeResult { episodeUrl: string; feedUrl: string; audioUrl: string }

/** Publish one episode: commit audio + manifest + feed + index + episode page. */
export async function publishEpisode(
  ep: Omit<PodcastEpisode, 'audioUrl' | 'pubDate'> & { pubDate?: string },
  audio: Buffer,
): Promise<PublishEpisodeResult> {
  await ensurePodcastRepo();
  const meta = podcastMeta();
  const audioUrl = `${meta.siteUrl}/audio/${ep.id}.mp3`;
  const episode: PodcastEpisode = { ...ep, audioUrl, pubDate: ep.pubDate || new Date().toUTCString() };

  // 1. audio
  await ghPutFile(`audio/${ep.id}.mp3`, audio.toString('base64'), `episode: ${ep.id} audio`);
  // 2. manifest
  const manifest = await readManifest();
  const next = [episode, ...manifest.filter((m) => m.id !== ep.id)];
  await ghPutFile('episodes.json', Buffer.from(JSON.stringify(next, null, 2)).toString('base64'), `episode: ${ep.id} manifest`);
  // 3. feed + 4. index + 5. episode page
  await ghPutFile('feed.xml', Buffer.from(generateFeedXml(meta, next)).toString('base64'), `episode: ${ep.id} feed`);
  await ghPutFile('index.html', Buffer.from(generateIndexHtml(meta, next)).toString('base64'), `episode: ${ep.id} index`);
  await ghPutFile(`episodes/${ep.id}.html`, Buffer.from(episodePageHtml(meta, episode)).toString('base64'), `episode: ${ep.id} page`);

  return { episodeUrl: `${meta.siteUrl}/episodes/${ep.id}.html`, feedUrl: `${meta.siteUrl}/feed.xml`, audioUrl };
}

/** Regenerate feed.xml + index.html (+ episode pages) from the current manifest and current
 * meta/PODCAST_SITE_URL. Use after changing the site URL so all links are consistent. */
export async function reseedSiteFiles(): Promise<{ feedUrl: string; episodes: number }> {
  await ensurePodcastRepo();
  const meta = podcastMeta();
  const manifest = await readManifest();
  await ghPutFile('feed.xml', Buffer.from(generateFeedXml(meta, manifest)).toString('base64'), 'reseed: feed');
  await ghPutFile('index.html', Buffer.from(generateIndexHtml(meta, manifest)).toString('base64'), 'reseed: index');
  for (const e of manifest) {
    await ghPutFile(`episodes/${e.id}.html`, Buffer.from(episodePageHtml(meta, e)).toString('base64'), `reseed: ${e.id} page`);
  }
  return { feedUrl: `${meta.siteUrl}/feed.xml`, episodes: manifest.length };
}
