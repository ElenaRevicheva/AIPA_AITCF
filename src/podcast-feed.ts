/**
 * podcast-feed.ts — pure generators for the podcast RSS feed + branded site (ADDITIVE, net-new)
 *
 * No side effects. Given a podcast manifest (meta + episodes), produces:
 *   - feed.xml  (RSS 2.0 + iTunes/Apple Podcasts namespace — what Spotify/Apple subscribe to)
 *   - index.html (the "cool wrapper": branded landing page with an audio player + episode list)
 *
 * The publisher (podcast-publish.ts) commits the output to the aideazz-podcast repo.
 */

export interface PodcastEpisode {
  id: string;            // slug, also audio filename
  title: string;
  description: string;   // show notes (plain text / light markdown)
  audioUrl: string;      // absolute URL to the mp3
  audioBytes: number;
  durationSec: number;
  pubDate: string;       // RFC-822 (e.g. "Fri, 29 May 2026 12:00:00 GMT")
  chapters?: Array<{ time: string; title: string }>;
  blogUrl?: string;
  source?: 'voice' | 'ai';
}

export interface PodcastMeta {
  title: string;
  description: string;
  author: string;
  email: string;
  siteUrl: string;       // e.g. https://podcast.aideazz.xyz
  coverUrl: string;      // absolute URL to 1400x1400+ cover art
  language: string;      // e.g. "en"
  category: string;      // Apple category, e.g. "Technology"
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** Generate a valid podcast RSS 2.0 feed with iTunes tags. */
export function generateFeedXml(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const items = episodes
    .slice()
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .map((e) => {
      const chapterNote = e.chapters?.length
        ? '\n\nChapters:\n' + e.chapters.map((c) => `${c.time} ${c.title}`).join('\n')
        : '';
      const desc = xmlEscape(e.description + chapterNote + (e.blogUrl ? `\n\nFull write-up: ${e.blogUrl}` : ''));
      return `    <item>
      <title>${xmlEscape(e.title)}</title>
      <description>${desc}</description>
      <itunes:summary>${desc}</itunes:summary>
      <enclosure url="${xmlEscape(e.audioUrl)}" length="${e.audioBytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${xmlEscape(e.id)}</guid>
      <pubDate>${xmlEscape(e.pubDate)}</pubDate>
      <itunes:duration>${fmtDuration(e.durationSec)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <link>${xmlEscape(meta.siteUrl)}/episodes/${xmlEscape(e.id)}.html</link>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEscape(meta.title)}</title>
    <link>${xmlEscape(meta.siteUrl)}</link>
    <language>${xmlEscape(meta.language)}</language>
    <description>${xmlEscape(meta.description)}</description>
    <itunes:author>${xmlEscape(meta.author)}</itunes:author>
    <itunes:summary>${xmlEscape(meta.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${xmlEscape(meta.author)}</itunes:name>
      <itunes:email>${xmlEscape(meta.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${xmlEscape(meta.coverUrl)}"/>
    <itunes:category text="${xmlEscape(meta.category)}"/>
    <itunes:explicit>false</itunes:explicit>
    <image>
      <url>${xmlEscape(meta.coverUrl)}</url>
      <title>${xmlEscape(meta.title)}</title>
      <link>${xmlEscape(meta.siteUrl)}</link>
    </image>
${items}
  </channel>
</rss>
`;
}

/** Generate the branded landing page (the "cool wrapper") with inline audio players. */
export function generateIndexHtml(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const sorted = episodes.slice().sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const cards = sorted.length
    ? sorted.map((e) => `
      <article class="ep">
        <h2>${xmlEscape(e.title)}</h2>
        <div class="meta">${new Date(e.pubDate).toDateString()} · ${fmtDuration(e.durationSec)} · ${e.source === 'ai' ? 'AI-narrated' : 'Elena'}</div>
        <audio controls preload="none" src="${xmlEscape(e.audioUrl)}"></audio>
        <p>${xmlEscape(e.description).slice(0, 320)}</p>
        ${e.blogUrl ? `<a class="readmore" href="${xmlEscape(e.blogUrl)}">Read the write-up →</a>` : ''}
      </article>`).join('\n')
    : '<p class="empty">First episode coming soon.</p>';

  return `<!DOCTYPE html>
<html lang="${xmlEscape(meta.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${xmlEscape(meta.title)}</title>
<meta name="description" content="${xmlEscape(meta.description)}"/>
<meta property="og:title" content="${xmlEscape(meta.title)}"/>
<meta property="og:description" content="${xmlEscape(meta.description)}"/>
<meta property="og:image" content="${xmlEscape(meta.coverUrl)}"/>
<link rel="alternate" type="application/rss+xml" title="${xmlEscape(meta.title)}" href="${xmlEscape(meta.siteUrl)}/feed.xml"/>
<style>
  :root { --bg:#0b0d12; --card:#151922; --txt:#e8ecf3; --mut:#8b93a7; --acc:#6ee7b7; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--txt); font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif; }
  header { text-align:center; padding:56px 20px 32px; background:radial-gradient(ellipse at top,#1a2030,transparent); }
  header img { width:200px; height:200px; border-radius:24px; box-shadow:0 12px 40px rgba(0,0,0,.5); }
  header h1 { margin:20px 0 6px; font-size:30px; } header p { color:var(--mut); max-width:620px; margin:0 auto; }
  .subs { margin:22px 0 0; } .subs a { display:inline-block; margin:4px; padding:9px 16px; border:1px solid #2a3142; border-radius:999px; color:var(--txt); text-decoration:none; font-size:14px; }
  .subs a:hover { border-color:var(--acc); color:var(--acc); }
  main { max-width:720px; margin:0 auto; padding:24px 20px 80px; }
  .ep { background:var(--card); border:1px solid #20283a; border-radius:16px; padding:22px; margin:16px 0; }
  .ep h2 { margin:0 0 4px; font-size:20px; } .meta { color:var(--mut); font-size:13px; margin-bottom:12px; }
  audio { width:100%; margin:6px 0 12px; } .ep p { color:#c4ccdb; margin:0; } .readmore { color:var(--acc); text-decoration:none; font-size:14px; }
  .empty { color:var(--mut); text-align:center; padding:40px; } footer { text-align:center; color:var(--mut); font-size:13px; padding:30px; }
</style>
</head>
<body>
<header>
  <img src="${xmlEscape(meta.coverUrl)}" alt="${xmlEscape(meta.title)} cover"/>
  <h1>${xmlEscape(meta.title)}</h1>
  <p>${xmlEscape(meta.description)}</p>
  <div class="subs">
    <a href="${xmlEscape(meta.siteUrl)}/feed.xml">RSS</a>
    <a href="https://podcasts.apple.com/">Apple Podcasts</a>
    <a href="https://open.spotify.com/">Spotify</a>
  </div>
</header>
<main>
${cards}
</main>
<footer>© ${new Date().getFullYear()} ${xmlEscape(meta.author)} · powered by the AIdeazz Voice Growth Engine</footer>
</body>
</html>
`;
}
