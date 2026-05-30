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

/** The exact AIdeazz brand mark: lucide "brain" icon paths (matches Navigation.tsx on aideazz.xyz). */
export const BRAIN_PATHS =
  '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>' +
  '<path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>' +
  '<path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>' +
  '<path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>' +
  '<path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>' +
  '<path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>' +
  '<path d="M19.938 10.5a4 4 0 0 1 .585.396"/>' +
  '<path d="M6 18a4 4 0 0 1-1.967-.516"/>' +
  '<path d="M19.967 17.484A4 4 0 0 1 18 18"/>';

// ─── SEO / GEO / AEO / TechSEO layer ───────────────────────────────────────────

/** PodcastSeries JSON-LD (+ episodes) for Google rich results and AI answer engines. */
export function generatePodcastJsonLd(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const series: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    name: meta.title,
    description: meta.description,
    url: meta.siteUrl,
    image: meta.coverUrl,
    inLanguage: meta.language,
    author: { '@type': 'Person', name: meta.author, url: 'https://aideazz.xyz' },
    publisher: { '@type': 'Organization', name: 'AIdeazz', url: 'https://aideazz.xyz' },
    webFeed: `${meta.siteUrl}/feed.xml`,
    genre: meta.category,
  };
  if (episodes.length) {
    series.numberOfEpisodes = episodes.length;
    series.hasPart = episodes.slice(0, 50).map((e) => ({
      '@type': 'PodcastEpisode',
      name: e.title,
      url: `${meta.siteUrl}/episodes/${e.id}.html`,
      datePublished: new Date(e.pubDate).toISOString(),
      timeRequired: `PT${Math.round((e.durationSec || 0) / 60)}M`,
      associatedMedia: { '@type': 'MediaObject', contentUrl: e.audioUrl, encodingFormat: 'audio/mpeg' },
    }));
  }
  return JSON.stringify(series);
}

/** robots.txt — allow all crawlers incl. AI answer engines; point to the sitemap. */
export function generateRobotsTxt(meta: PodcastMeta): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# AI answer engines explicitly welcomed (AEO/GEO)',
    'User-agent: GPTBot',
    'Allow: /',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'User-agent: PerplexityBot',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Allow: /',
    'User-agent: Google-Extended',
    'Allow: /',
    'User-agent: Applebot-Extended',
    'Allow: /',
    '',
    `Sitemap: ${meta.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/** sitemap.xml — homepage + every episode page. */
export function generateSitemapXml(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `  <url><loc>${meta.siteUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>`,
    ...episodes.map((e) =>
      `  <url><loc>${meta.siteUrl}/episodes/${e.id}.html</loc><changefreq>monthly</changefreq><priority>0.8</priority><lastmod>${new Date(e.pubDate).toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** llms.txt — concise, citable context for AI answer engines (GEO). */
export function generateLlmsTxt(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const lines = [
    `# ${meta.title}`,
    '',
    `> ${meta.description}`,
    '',
    `- Host: ${meta.author} (solo founder, AIdeazz; Panama)`,
    `- Format: ${meta.category} podcast, episodic, language ${meta.language}`,
    `- RSS feed: ${meta.siteUrl}/feed.xml`,
    `- Website: ${meta.siteUrl}`,
    `- Parent project: AIdeazz (https://aideazz.xyz) — multi-agent AI systems built in production`,
    '',
    '## What this podcast covers',
    'Honest, failure-first lessons from building a company with AI agents: AI-augmented development, multi-agent orchestration, marketing engines (GEO/SEO/AEO), attribution over vanity metrics, voice automation, and shipping resilient systems as a solo founder.',
    '',
    '## Episodes',
  ];
  if (episodes.length) {
    for (const e of episodes.slice(0, 50)) {
      lines.push(`- [${e.title}](${meta.siteUrl}/episodes/${e.id}.html): ${e.description.slice(0, 160)}`);
    }
  } else {
    lines.push('- First episode launching soon.');
  }
  lines.push('');
  return lines.join('\n');
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

/** Generate the branded landing page — bold, motion-rich "live AI radio" aesthetic + full SEO/GEO/AEO. */
export function generateIndexHtml(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const sorted = episodes.slice().sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const total = sorted.length;
  const esc = xmlEscape;
  const rows = total
    ? sorted.map((e, i) => {
        const num = String(total - i).padStart(2, '0');
        const src = e.source === 'ai' ? 'AI-narrated' : 'Elena';
        return `
      <article class="erow">
        <div class="erow-num">${num}</div>
        <div class="erow-main">
          <h3 class="erow-title">${esc(e.title)}</h3>
          <div class="erow-meta">${new Date(e.pubDate).toDateString()} &middot; ${fmtDuration(e.durationSec)} &middot; ${src}</div>
          <p class="erow-desc">${esc(e.description).slice(0, 220)}</p>
          <audio controls preload="none" src="${esc(e.audioUrl)}"></audio>
          ${e.blogUrl ? `<a class="readmore" href="${esc(e.blogUrl)}">Read the write-up &rarr;</a>` : ''}
        </div>
      </article>`;
      }).join('\n')
    : `<div class="empty">
        <span class="pulse"></span>
        <div><h3>Episode 01 is in the studio</h3>
        <p>Hit Follow and the first drop lands in your app automatically — wherever you listen.</p></div>
      </div>`;
  const countLabel = total ? `${total} episode${total > 1 ? 's' : ''}` : 'Launching soon';
  const waveBars = Array.from({ length: 72 }, (_, i) => `<span style="animation-delay:${(i * 0.035).toFixed(2)}s"></span>`).join('');
  const jsonLd = generatePodcastJsonLd(meta, sorted);

  return `<!DOCTYPE html>
<html lang="${xmlEscape(meta.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${xmlEscape(meta.title)} — AI podcast by ${xmlEscape(meta.author)}</title>
<meta name="description" content="${xmlEscape(meta.description)}"/>
<link rel="canonical" href="${xmlEscape(meta.siteUrl)}/"/>
<meta name="theme-color" content="#05060a"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${xmlEscape(meta.title)}"/>
<meta property="og:url" content="${xmlEscape(meta.siteUrl)}/"/>
<meta property="og:title" content="${xmlEscape(meta.title)}"/>
<meta property="og:description" content="${xmlEscape(meta.description)}"/>
<meta property="og:image" content="${xmlEscape(meta.coverUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${xmlEscape(meta.title)}"/>
<meta name="twitter:description" content="${xmlEscape(meta.description)}"/>
<meta name="twitter:image" content="${xmlEscape(meta.coverUrl)}"/>
<link rel="alternate" type="application/rss+xml" title="${xmlEscape(meta.title)}" href="${xmlEscape(meta.siteUrl)}/feed.xml"/>
<link rel="sitemap" type="application/xml" href="${xmlEscape(meta.siteUrl)}/sitemap.xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Poppins:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"/>
<script type="application/ld+json">${jsonLd}</script>
<style>
  :root{
    --bg:#0a0712; --bg2:#0f0a18; --panel:rgba(255,255,255,.04); --line:rgba(255,255,255,.09);
    --txt:#f3f0fa; --mut:#b3a9c9; --mut2:#857a9c;
    --a1:#a855f7; --a2:#facc15; --a3:#7c3aed;
    --grad:linear-gradient(115deg,#7c3aed,#a855f7 42%,#facc15);
    --disp:'Space Grotesk',-apple-system,Segoe UI,sans-serif;
    --brandf:'Poppins',-apple-system,Segoe UI,sans-serif;
    --body:'Inter',-apple-system,Segoe UI,sans-serif;
    --mono:'JetBrains Mono',ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--txt);font-family:var(--body);line-height:1.6;
    -webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;min-height:100vh}
  /* ambient flowing color palette (dark / purple / yellow) */
  .aurora{position:fixed;inset:0;z-index:-3;overflow:hidden;filter:blur(72px);opacity:.5}
  .aurora span{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen;animation:drift 24s ease-in-out infinite}
  .aurora .b1{width:46vw;height:46vw;left:-8vw;top:6vh;background:radial-gradient(circle,#a855f7aa,transparent 60%)}
  .aurora .b2{width:42vw;height:42vw;right:-10vw;top:32vh;background:radial-gradient(circle,#7c3aedaa,transparent 60%);animation-delay:-7s}
  .aurora .b3{width:48vw;height:48vw;left:30vw;top:62vh;background:radial-gradient(circle,#facc1577,transparent 60%);animation-delay:-14s}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6vw,4vh) scale(1.1)}66%{transform:translate(-5vw,-3vh) scale(.94)}}
  /* cursor spotlight — reveals a purple→yellow palette as you move */
  #spot{position:fixed;width:680px;height:680px;border-radius:50%;pointer-events:none;z-index:0;left:50%;top:28%;
    transform:translate(-50%,-50%);opacity:0;transition:opacity .5s;
    background:radial-gradient(circle,rgba(168,85,247,.16),rgba(250,204,21,.06) 42%,transparent 70%)}
  /* Spotify-style color wash that fades into the dark base (sits over the aurora at the top) */
  .wash{position:fixed;top:0;left:0;right:0;height:560px;z-index:-2;
    background:linear-gradient(180deg,#5b21b6 0%,#3b1769 32%,rgba(20,12,38,.4) 70%,transparent 100%)}
  .wash::after{content:"";position:absolute;inset:0;opacity:.06;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  .wrap{max-width:960px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
  /* nav */
  nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0;position:sticky;top:0;z-index:20;
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  .brand{font-family:var(--brandf);font-weight:700;font-size:18px;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}
  .mark{width:38px;height:38px;border-radius:11px;overflow:hidden;display:inline-block;box-shadow:0 4px 20px rgba(168,85,247,.5)}
  .mark img{width:100%;height:100%;object-fit:cover;transform:scale(1.18);display:block}
  .wm i{font-style:normal;color:var(--a1)} .wm b{color:var(--a2);font-weight:700}
  .nav-cta{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--txt);text-decoration:none;border:1px solid rgba(255,255,255,.55);padding:8px 18px;border-radius:999px;transition:.2s}
  .nav-cta:hover{border-color:#fff;transform:scale(1.04)}
  /* hero (Spotify show header) */
  .hero{display:flex;gap:30px;align-items:flex-end;padding:30px 0 8px}
  .cover{width:228px;height:228px;border-radius:14px;object-fit:cover;box-shadow:0 16px 50px rgba(0,0,0,.55);flex-shrink:0}
  .hero-info{min-width:0;padding-bottom:6px}
  .kind{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--txt)}
  .hero-info h1{font-family:var(--brandf);font-weight:700;font-size:clamp(34px,6.5vw,76px);line-height:1.02;letter-spacing:-.03em;margin:14px 0 16px}
  .hero-info h1 .g{background:var(--grad);background-size:220% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shift 5s linear infinite}
  @keyframes shift{to{background-position:220% center}}
  @media(prefers-reduced-motion:reduce){.hero-info h1 .g{animation:none}}
  .hero-meta{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--mut);flex-wrap:wrap}
  .hero-meta .mk{width:22px;height:22px;border-radius:6px;overflow:hidden;display:inline-block}
  .hero-meta .mk img{width:100%;height:100%;object-fit:cover;transform:scale(1.18)}
  .hero-meta b{color:var(--txt);font-weight:600}
  .hero-meta .dotsep{color:var(--mut2)}
  /* action bar */
  .actions{display:flex;align-items:center;gap:24px;padding:24px 0 6px}
  .play{width:58px;height:58px;border-radius:50%;background:var(--grad);display:grid;place-items:center;text-decoration:none;
    box-shadow:0 10px 30px rgba(168,85,247,.5);transition:.2s}
  .play:hover{transform:scale(1.07)}
  .play svg{width:26px;height:26px;color:#0a0712;margin-left:3px}
  .follow{font-family:var(--disp);font-weight:700;font-size:14px;color:var(--txt);text-decoration:none;border:1px solid rgba(255,255,255,.5);padding:11px 24px;border-radius:999px;transition:.2s}
  .follow:hover{border-color:#fff;transform:scale(1.04)}
  .iconlinks{display:flex;gap:18px;margin-left:4px}
  .iconlinks a{color:var(--mut2);transition:.2s}
  .iconlinks a:hover{color:var(--txt);transform:scale(1.12)}
  .iconlinks svg{width:23px;height:23px;display:block}
  /* flowing equalizer wave */
  .wave{display:flex;align-items:center;justify-content:center;gap:4px;height:48px;margin:26px 0 4px;opacity:.9;
    -webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
  .wave span{flex:1;max-width:5px;height:100%;border-radius:4px;background:var(--grad);transform:scaleY(.16);transform-origin:center;animation:eq 1.2s ease-in-out infinite}
  @keyframes eq{0%,100%{transform:scaleY(.16)}50%{transform:scaleY(1)}}
  @media(prefers-reduced-motion:reduce){.wave span{animation:none;transform:scaleY(.5)}}
  /* section heads */
  .sec-head{display:flex;align-items:baseline;gap:12px;margin:48px 0 8px}
  .sec-head h2{font-family:var(--brandf);font-size:24px;font-weight:700;letter-spacing:-.01em}
  .sec-head .count{font-family:var(--mono);font-size:12px;color:var(--mut2)}
  .list-cols{display:grid;grid-template-columns:36px 1fr;gap:16px;padding:6px 12px;border-bottom:1px solid var(--line);
    font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut2)}
  /* episode rows (Spotify list) */
  .erow{display:grid;grid-template-columns:36px 1fr;gap:16px;padding:16px 12px;border-radius:8px;transition:background .2s;align-items:start}
  .erow:hover{background:rgba(255,255,255,.05)}
  .erow-num{font-family:var(--mono);font-size:15px;color:var(--mut2);padding-top:2px}
  .erow-title{font-family:var(--disp);font-size:17px;font-weight:600;line-height:1.3}
  .erow-meta{font-family:var(--mono);font-size:12px;color:var(--mut2);margin:5px 0 8px}
  .erow-desc{color:var(--mut);font-size:14px;margin-bottom:12px}
  audio{width:100%;max-width:560px;height:36px;display:block}
  .readmore{display:inline-block;margin-top:12px;font-family:var(--disp);font-weight:600;font-size:13px;color:var(--a2);text-decoration:none}
  .readmore:hover{text-decoration:underline}
  /* empty state (row-like banner) */
  .empty{display:flex;align-items:center;gap:20px;padding:30px 24px;border-radius:14px;background:var(--panel);border:1px solid var(--line);margin-top:8px}
  .empty h3{font-family:var(--disp);font-size:20px;font-weight:600;margin-bottom:5px}
  .empty p{color:var(--mut);font-size:14px}
  .pulse{flex-shrink:0;width:14px;height:14px;border-radius:50%;background:var(--a1);box-shadow:0 0 0 0 rgba(192,132,252,.5);animation:ring 2s infinite}
  @keyframes ring{0%{box-shadow:0 0 0 0 rgba(192,132,252,.5)}70%{box-shadow:0 0 0 18px rgba(192,132,252,0)}100%{box-shadow:0 0 0 0 rgba(192,132,252,0)}}
  /* what you'll hear */
  .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:10px 0}
  .cardb{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;transition:.25s}
  .cardb:hover{background:rgba(255,255,255,.07)}
  .cardb .kbar{display:block;width:30px;height:3px;border-radius:3px;background:var(--grad);margin-bottom:16px}
  .cardb h4{font-family:var(--disp);font-size:16px;font-weight:600;margin-bottom:6px}
  .cardb p{color:var(--mut);font-size:13.5px;line-height:1.5}
  /* about */
  .about{display:flex;gap:22px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;margin:10px 0}
  .about img{width:84px;height:84px;border-radius:14px;object-fit:cover;flex-shrink:0}
  .about h4{font-family:var(--disp);font-size:18px;font-weight:600;margin-bottom:6px}
  .about p{color:var(--mut);font-size:14.5px}
  .about a{color:var(--a2);text-decoration:none}
  .slogan{margin-top:12px;font-family:var(--disp);font-size:14px;color:var(--mut2)}
  .slogan b{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:700}
  footer{text-align:center;padding:54px 20px 50px;color:var(--mut2);font-family:var(--mono);font-size:12px;border-top:1px solid var(--line);margin-top:48px}
  footer .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  @media(max-width:680px){.hero{flex-direction:column;align-items:flex-start}.cover{width:180px;height:180px}.bento{grid-template-columns:1fr}.about{flex-direction:column;text-align:center}}
</style>
</head>
<body>
<div class="aurora"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>
<div id="spot"></div>
<div class="wash"></div>
<div class="wrap">
  <nav>
    <span class="brand"><span class="mark"><img src="https://aideazz.xyz/faviconnew.png" alt="AIdeazz"/></span><span class="wm">AI<i>deazz</i><b>·FM</b></span></span>
    <a class="nav-cta" href="${esc(meta.siteUrl)}/feed.xml">Follow</a>
  </nav>
  <header class="hero">
    <img class="cover" src="${esc(meta.coverUrl)}" alt="${esc(meta.title)} cover"/>
    <div class="hero-info">
      <span class="kind">Podcast</span>
      <h1>Building in Public<br/>with <span class="g">AI Agents.</span></h1>
      <p class="lede" style="color:var(--mut);max-width:580px;margin-bottom:14px">Honest lessons on AI-augmented building, marketing engines, and shipping in production. By ${esc(meta.author)}.</p>
      <div class="hero-meta">
        <span class="mk"><img src="https://aideazz.xyz/faviconnew.png" alt="AIdeazz"/></span>
        <b>AIdeazz</b><span class="dotsep">&middot;</span>
        <span>${esc(meta.author)}</span><span class="dotsep">&middot;</span>
        <span>From &ldquo;A&rdquo; to &ldquo;Z&rdquo; of AI-Augmented Workflows</span><span class="dotsep">&middot;</span>
        <span>${countLabel}</span>
      </div>
    </div>
  </header>
  <div class="actions" id="listen">
    <a class="play" href="https://open.spotify.com/" aria-label="Play on Spotify"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></a>
    <a class="follow" href="${esc(meta.siteUrl)}/feed.xml">Follow</a>
    <div class="iconlinks">
      <a href="https://open.spotify.com/" aria-label="Spotify"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 11-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 01-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 11-.54-1.8c4.37-1.32 9.79-.68 13.49 1.6.44.27.58.85.31 1.29zm.13-3.4C15.13 8.28 8.6 8.07 4.85 9.21a1.12 1.12 0 11-.65-2.15C8.5 5.75 15.71 6 20.06 8.58a1.12 1.12 0 11-1.16 1.92z"/></svg></a>
      <a href="https://www.youtube.com/@AIdeazz" aria-label="YouTube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg></a>
      <a href="${esc(meta.siteUrl)}/feed.xml" aria-label="RSS"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 11a9 9 0 019 9h-2.5A6.5 6.5 0 004 13.5V11zm0-5a14 14 0 0114 14h-2.5A11.5 11.5 0 004 8.5V6zm2.5 10.5a2 2 0 11-4 0 2 2 0 014 0z"/></svg></a>
    </div>
  </div>
  <div class="wave">${waveBars}</div>
  <div class="sec-head" id="episodes"><h2>All episodes</h2><span class="count">${countLabel}</span></div>
  ${total ? '<div class="list-cols"><span>#</span><span>Episode</span></div>' : ''}
${rows}
  <div class="sec-head"><h2>What you'll hear</h2></div>
  <div class="bento">
    <div class="cardb"><span class="kbar"></span><h4>Real multi-agent systems</h4><p>Nine production AI agents, what broke, and what actually held up.</p></div>
    <div class="cardb"><span class="kbar"></span><h4>Marketing that's measured</h4><p>GEO/SEO/AEO, attribution over vanity metrics, and the engine behind it.</p></div>
    <div class="cardb"><span class="kbar"></span><h4>Shipping as a solo founder</h4><p>AI-augmented building, honest constraints, no hype — just what ships.</p></div>
  </div>
  <div class="sec-head"><h2>About</h2></div>
  <div class="about">
    <img src="${esc(meta.coverUrl)}" alt="${esc(meta.author)}"/>
    <div><h4>${esc(meta.author)}</h4><p>Solo founder of <a href="https://aideazz.xyz">AIdeazz</a> — building a company with AI agents from Panama. Former board-level operator, now an AI-augmented builder shipping multi-agent systems in production. This is the honest, unedited version.</p>
    <p class="slogan">Your AI companion who remembers your journey — from struggle to success. The <b>A&#8209;to&#8209;Z</b> of your private AI space. <a href="https://aideazz.xyz">aideazz.xyz &rarr;</a></p></div>
  </div>
</div>
<footer>© ${new Date().getFullYear()} ${esc(meta.author)} &middot; powered by the <span class="g">AIdeazz Voice Growth Engine</span></footer>
<script>
  (function(){var s=document.getElementById('spot');if(!s)return;
   window.addEventListener('pointermove',function(e){s.style.opacity=1;s.style.left=e.clientX+'px';s.style.top=e.clientY+'px';},{passive:true});
   window.addEventListener('pointerleave',function(){s.style.opacity=0;});})();
</script>
</body>
</html>
`;
}
