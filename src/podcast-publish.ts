/**
 * podcast-publish.ts — publishes episodes to the aideazz-podcast repo via GitHub API (ADDITIVE)
 *
 * ensurePodcastRepo(): create + seed the repo (cover art, empty manifest, seed feed/index) if missing.
 * publishEpisode(): commit audio + update manifest + regenerate feed.xml + index.html + episode page.
 *
 * 4everland serves the repo at PODCAST_SITE_URL. Spotify/Apple subscribe to {site}/feed.xml.
 * Gated by the caller (PODCAST_PUBLISH_ENABLED). Uses the same GITHUB_TOKEN as the blog pipeline.
 */

import { generateFeedXml, generateIndexHtml, generateRobotsTxt, generateSitemapXml, generateLlmsTxt, type PodcastEpisode, type PodcastMeta } from './podcast-feed';

/** URL of the real AIdeazz brand icon (the gradient "A" mark in the aideazz.xyz address bar). */
const BRAND_ICON_URL = process.env.PODCAST_ICON_URL?.trim() || 'https://aideazz.xyz/faviconnew.png';

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
    title: process.env.PODCAST_TITLE?.trim() || 'AIdeazz — Building in Public On The Go',
    description: process.env.PODCAST_DESC?.trim() || 'Building in public, on the go — AI-augmented, agentic, from A to Z. Honest lessons on building a company with AI agents, marketing engines, and shipping in production. By Elena Revicheva.',
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
  // June 11 2026: a transient GitHub 401 ("Bad credentials" with a token that was
  // valid minutes later) killed an episode publish. Auth/server blips must not
  // lose an episode — retry up to 3x with backoff before giving up.
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const existing = await ghGetFile(path).catch(() => null);
    const body: Record<string, string> = { message, content: contentB64 };
    if (existing?.sha) body.sha = existing.sha;
    const r = await fetch(`${API}/repos/${repoFull()}/contents/${path}`, {
      method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body),
    });
    if (r.ok) return;
    const txt = (await r.text()).slice(0, 200);
    lastErr = new Error(`GitHub put ${path} failed ${r.status}: ${txt}`);
    // 422 sha-conflict: refetch sha next loop. 401/403/5xx: transient — backoff.
    const retryable = r.status === 401 || r.status === 403 || r.status === 422 || r.status >= 500;
    if (!retryable || attempt === 3) throw lastErr;
    console.warn(`[podcast-publish] ${lastErr.message} — retry ${attempt + 1}/3`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
  if (lastErr) throw lastErr;
}

async function repoExists(): Promise<boolean> {
  const r = await fetch(`${API}/repos/${repoFull()}`, { headers: ghHeaders() });
  return r.ok;
}

/** Generate the AIdeazz-branded 1500x1500 cover PNG: real "A" icon on purple+yellow, like aideazz.xyz. */
async function generateCoverPng(meta: PodcastMeta): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const W = 1500;
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="33%" r="85%">
        <stop offset="0" stop-color="#1b1033"/><stop offset="55%" stop-color="#0d0820"/><stop offset="100%" stop-color="#06040f"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="31%" r="44%">
        <stop offset="0" stop-color="#a855f755"/><stop offset="62%" stop-color="#facc1522"/><stop offset="100%" stop-color="#00000000"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${W}" fill="url(#bg)"/>
    <circle cx="750" cy="620" r="500" fill="url(#glow)"/>
    <text x="750" y="1170" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="178" text-anchor="middle" letter-spacing="-2"><tspan fill="#ffffff">AI</tspan><tspan fill="#c084fc">deazz</tspan></text>
  </svg>`;
  const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  // Composite the real AIdeazz "A" icon (faviconnew.png) as the central brand mark.
  try {
    const resp = await fetch(BRAND_ICON_URL);
    if (resp.ok) {
      const size = 560;
      const raw = Buffer.from(await resp.arrayBuffer());
      // Crop ~10% into the icon to remove its baked-in white card frame, then round the corners.
      const big = Math.round(size * 1.2);
      const off = Math.round((big - size) / 2);
      const r = Math.round(size * 0.2);
      const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`;
      const cropped = await sharp(raw).resize(big, big, { fit: 'cover' }).extract({ left: off, top: off, width: size, height: size }).png().toBuffer();
      const icon = await sharp(cropped).composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }]).png().toBuffer();
      return sharp(bg).composite([{ input: icon, top: 320, left: Math.round((W - size) / 2) }]).png().toBuffer();
    }
  } catch { /* fall back to text-only cover */ }
  return bg;
}

/** Regenerate + push just the cover art (used when the cover design changes). */
export async function reseedCover(): Promise<void> {
  const cover = await generateCoverPng(podcastMeta());
  await ghPutFile('cover.png', cover.toString('base64'), 'design: refresh cover art');
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
  await ghPutFile('robots.txt', Buffer.from(generateRobotsTxt(meta)).toString('base64'), 'seed: robots.txt');
  await ghPutFile('sitemap.xml', Buffer.from(generateSitemapXml(meta, [])).toString('base64'), 'seed: sitemap');
  await ghPutFile('llms.txt', Buffer.from(generateLlmsTxt(meta, [])).toString('base64'), 'seed: llms.txt (AEO)');
  return true;
}

async function readManifest(): Promise<PodcastEpisode[]> {
  const f = await ghGetFile('episodes.json');
  if (!f) return [];
  try { return JSON.parse(Buffer.from(f.contentB64, 'base64').toString('utf8')); } catch { return []; }
}

function episodePageHtml(meta: PodcastMeta, e: PodcastEpisode): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const chapters = e.chapters?.length
    ? '<div class="chapters"><h3>Chapters</h3><ul>' + e.chapters.map((c) => `<li><span class="t">${esc(c.time)}</span> ${esc(c.title)}</li>`).join('') + '</ul></div>'
    : '';
  return `<!DOCTYPE html>
<html lang="${meta.language}"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(e.title)} — ${esc(meta.title)}</title>
<meta name="description" content="${esc(e.description).slice(0, 160)}"/>
<meta property="og:title" content="${esc(e.title)}"/>
<meta property="og:image" content="${meta.coverUrl}"/>
<meta name="theme-color" content="#05060a"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  :root{--bg:#0a0712;--txt:#f3f0fa;--mut:#b3a9c9;--line:rgba(255,255,255,.09);--a1:#a855f7;--a2:#facc15;--a3:#7c3aed;
    --disp:'Figtree',-apple-system,Segoe UI,sans-serif;--body:'Figtree',-apple-system,Segoe UI,sans-serif;--mono:'Figtree',-apple-system,Segoe UI,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--txt);font-family:var(--body);line-height:1.7;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
  .aurora{position:fixed;inset:0;z-index:-1;filter:blur(70px);opacity:.4;overflow:hidden}
  .aurora span{position:absolute;border-radius:50%;mix-blend-mode:screen}
  .aurora .b1{width:50vw;height:50vw;left:-12vw;top:-14vw;background:radial-gradient(circle,#a855f788,transparent 60%)}
  .aurora .b2{width:46vw;height:46vw;right:-12vw;top:0;background:radial-gradient(circle,#d946ef88,transparent 60%)}
  .wrap{max-width:720px;margin:0 auto;padding:34px 22px 80px}
  .back{font-family:var(--mono);font-size:12px;color:var(--mut);text-decoration:none;display:inline-flex;gap:7px;align-items:center}
  .back:hover{color:var(--a2)}
  .num{font-family:var(--mono);font-size:12px;color:var(--a2);letter-spacing:.05em;margin:34px 0 10px;display:block}
  h1{font-family:var(--disp);font-weight:700;font-size:clamp(28px,5vw,42px);line-height:1.1;letter-spacing:-.02em;margin-bottom:12px}
  .meta{font-family:var(--mono);font-size:12px;color:var(--mut);margin-bottom:24px}
  .player{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:28px}
  audio{width:100%;display:block}
  .desc{color:var(--mut);font-size:16px;white-space:pre-wrap}
  .chapters{margin-top:34px;border-top:1px solid var(--line);padding-top:24px}
  .chapters h3{font-family:var(--disp);font-size:18px;margin-bottom:14px}
  .chapters ul{list-style:none} .chapters li{padding:9px 0;border-bottom:1px solid var(--line);color:var(--mut)}
  .chapters .t{font-family:var(--mono);font-size:12px;color:var(--a1);margin-right:12px}
  .cta{display:inline-flex;align-items:center;gap:7px;margin-top:30px;font-family:var(--disp);font-weight:600;color:var(--a2);text-decoration:none}
  .cta:hover{gap:11px}
</style></head>
<body>
<div class="aurora"><span class="b1"></span><span class="b2"></span></div>
<div class="wrap">
  <a class="back" href="${meta.siteUrl}">&larr; ${esc(meta.title)}</a>
  <span class="num">${e.source === 'ai' ? 'AI-NARRATED EPISODE' : 'EPISODE'}</span>
  <h1>${esc(e.title)}</h1>
  <div class="meta">${new Date(e.pubDate).toDateString()} &middot; ${Math.round((e.durationSec || 0) / 60)} min</div>
  <div class="player"><audio controls preload="none" src="${e.audioUrl}"></audio></div>
  <p class="desc">${esc(e.description)}</p>
  ${chapters}
  ${e.blogUrl ? `<a class="cta" href="${e.blogUrl}">Read the full write-up &rarr;</a>` : ''}
</div>
</body></html>`;
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
  // 3. feed + index + episode page + SEO files (sitemap, llms.txt regenerate with the new episode)
  await ghPutFile('feed.xml', Buffer.from(generateFeedXml(meta, next)).toString('base64'), `episode: ${ep.id} feed`);
  await ghPutFile('index.html', Buffer.from(generateIndexHtml(meta, next)).toString('base64'), `episode: ${ep.id} index`);
  await ghPutFile(`episodes/${ep.id}.html`, Buffer.from(episodePageHtml(meta, episode)).toString('base64'), `episode: ${ep.id} page`);
  await ghPutFile('sitemap.xml', Buffer.from(generateSitemapXml(meta, next)).toString('base64'), `episode: ${ep.id} sitemap`);
  await ghPutFile('llms.txt', Buffer.from(generateLlmsTxt(meta, next)).toString('base64'), `episode: ${ep.id} llms.txt`);

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
  await ghPutFile('robots.txt', Buffer.from(generateRobotsTxt(meta)).toString('base64'), 'reseed: robots.txt');
  await ghPutFile('sitemap.xml', Buffer.from(generateSitemapXml(meta, manifest)).toString('base64'), 'reseed: sitemap');
  await ghPutFile('llms.txt', Buffer.from(generateLlmsTxt(meta, manifest)).toString('base64'), 'reseed: llms.txt');
  for (const e of manifest) {
    await ghPutFile(`episodes/${e.id}.html`, Buffer.from(episodePageHtml(meta, e)).toString('base64'), `reseed: ${e.id} page`);
  }
  return { feedUrl: `${meta.siteUrl}/feed.xml`, episodes: manifest.length };
}
