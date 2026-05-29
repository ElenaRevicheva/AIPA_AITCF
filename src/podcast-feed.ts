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
  const cards = total
    ? sorted.map((e, i) => {
        const num = String(total - i).padStart(2, '0');
        const src = e.source === 'ai' ? 'AI-narrated' : 'Elena';
        return `
      <article class="ep">
        <div class="ep-top">
          <span class="ep-num">EP ${num}</span>
          <span class="chip ${e.source === 'ai' ? 'chip-ai' : 'chip-voice'}">${src}</span>
        </div>
        <h3 class="ep-title">${xmlEscape(e.title)}</h3>
        <div class="ep-meta">${new Date(e.pubDate).toDateString()} &middot; ${fmtDuration(e.durationSec)}</div>
        <div class="player"><audio controls preload="none" src="${xmlEscape(e.audioUrl)}"></audio></div>
        <p class="ep-desc">${xmlEscape(e.description).slice(0, 300)}</p>
        ${e.blogUrl ? `<a class="readmore" href="${xmlEscape(e.blogUrl)}">Read the write-up <span class="arr">&rarr;</span></a>` : ''}
      </article>`;
      }).join('\n')
    : `<div class="empty">
        <span class="pulse"></span>
        <h3>Episode 01 is in the studio</h3>
        <p>Subscribe once and the first drop lands in your feed automatically — wherever you listen.</p>
      </div>`;

  const waveBars = Array.from({ length: 52 }, (_, i) => `<span style="animation-delay:${(i * 0.04).toFixed(2)}s"></span>`).join('');
  const topics = ['AI agents', 'Attribution over activity', 'Marketing engines', 'Shipping in production', 'Voice automation', 'Multi-agent systems', 'GEO · SEO · AEO', 'Solo-founder economics', 'Production resilience', 'Building in public'];
  const marquee = [...topics, ...topics].map((t) => `<span class="t">${xmlEscape(t)}</span>`).join('');
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
    --bg:#070310; --panel:rgba(255,255,255,.025); --line:rgba(255,255,255,.08);
    --txt:#eef1f7; --mut:#a99cc4; --mut2:#7d7396;
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
  .aurora{position:fixed;inset:0;z-index:-2;overflow:hidden;filter:blur(64px);opacity:.6}
  .aurora span{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen;animation:drift 22s ease-in-out infinite}
  .aurora .b1{width:48vw;height:48vw;left:-8vw;top:-12vw;background:radial-gradient(circle,#a855f7aa,transparent 60%)}
  .aurora .b2{width:44vw;height:44vw;right:-10vw;top:-6vw;background:radial-gradient(circle,#7c3aedaa,transparent 60%);animation-delay:-6s}
  .aurora .b3{width:52vw;height:52vw;left:25vw;top:36vh;background:radial-gradient(circle,#facc1588,transparent 60%);animation-delay:-12s}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(7vw,4vh) scale(1.12)}66%{transform:translate(-5vw,-3vh) scale(.94)}}
  body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.05;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  /* cursor spotlight */
  #spot{position:fixed;width:600px;height:600px;border-radius:50%;pointer-events:none;z-index:0;left:0;top:0;
    transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(192,132,252,.10),transparent 65%);transition:opacity .4s;opacity:0}
  .wrap{max-width:840px;margin:0 auto;padding:0 22px;position:relative;z-index:1}
  nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;position:sticky;top:0;z-index:20;
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  .brand{font-family:var(--brandf);font-weight:700;font-size:18px;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}
  .mark{width:38px;height:38px;border-radius:11px;overflow:hidden;display:inline-block;box-shadow:0 4px 20px rgba(168,85,247,.5);animation:breathe 4s ease-in-out infinite}
  .mark img{width:100%;height:100%;object-fit:cover;transform:scale(1.18);display:block}
  @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  .wm i{font-style:normal;color:var(--a1)} .wm b{color:var(--a2);font-weight:700}
  .nav-cta{font-family:var(--disp);font-weight:600;font-size:13px;color:#05060a;text-decoration:none;background:var(--grad);padding:9px 17px;border-radius:999px;transition:.25s}
  .nav-cta:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(192,132,252,.4)}
  header{text-align:center;padding:54px 0 26px}
  .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--a1);margin-bottom:30px;display:inline-flex;gap:10px;align-items:center}
  .eyebrow::before,.eyebrow::after{content:"";width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--a1))}
  .eyebrow::after{background:linear-gradient(90deg,var(--a1),transparent)}
  .cover-wrap{position:relative;width:230px;height:230px;margin:0 auto 34px}
  .cover-wrap::before{content:"";position:absolute;inset:-6px;border-radius:34px;background:var(--grad);filter:blur(28px);opacity:.75;z-index:-1;animation:pulseGlow 5s ease-in-out infinite}
  @keyframes pulseGlow{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)}}
  .cover-wrap img{width:230px;height:230px;border-radius:28px;object-fit:cover;border:1px solid var(--line);box-shadow:0 24px 70px rgba(0,0,0,.65);animation:float 7s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  h1{font-family:var(--disp);font-weight:700;font-size:clamp(40px,7vw,68px);line-height:1.02;letter-spacing:-.03em;margin-bottom:20px}
  h1 .g{background:var(--grad);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shift 6s linear infinite}
  @keyframes shift{to{background-position:200% center}}
  .lede{color:var(--mut);max-width:560px;margin:0 auto 22px;font-size:18px}
  /* hero waveform */
  .wave{display:flex;align-items:center;justify-content:center;gap:4px;height:54px;margin:0 auto 30px;max-width:440px}
  .wave span{width:4px;height:100%;border-radius:4px;background:var(--grad);transform:scaleY(.18);transform-origin:center;animation:eq 1.2s ease-in-out infinite}
  @keyframes eq{0%,100%{transform:scaleY(.18)}50%{transform:scaleY(1)}}
  .subs{display:flex;flex-wrap:wrap;gap:11px;justify-content:center}
  .subs a{display:inline-flex;align-items:center;gap:9px;padding:13px 22px;border-radius:999px;font-family:var(--disp);font-weight:600;font-size:14px;text-decoration:none;transition:.25s;border:1px solid var(--line);color:var(--txt)}
  .subs a svg{width:17px;height:17px}
  .subs .primary{background:var(--grad);color:#05060a;border:none;box-shadow:0 8px 28px rgba(192,132,252,.32)}
  .subs .primary:hover{transform:translateY(-2px);box-shadow:0 12px 38px rgba(192,132,252,.5)}
  .subs .ghost{background:var(--panel)}
  .subs .ghost:hover{border-color:var(--a3);color:#fff;transform:translateY(-2px)}
  /* marquee */
  .marquee{margin:46px 0;overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
  .marquee .track{display:inline-flex;gap:14px;white-space:nowrap;animation:scroll 32s linear infinite}
  .marquee .t{font-family:var(--mono);font-size:13px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:8px 16px;background:var(--panel)}
  @keyframes scroll{to{transform:translateX(-50%)}}
  /* bento "what you'll hear" */
  .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0 10px}
  .cardb{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;transition:.3s}
  .cardb:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.16)}
  .cardb .ic{font-size:22px;margin-bottom:12px;display:block}
  .cardb h4{font-family:var(--disp);font-size:16px;font-weight:600;margin-bottom:6px}
  .cardb p{color:var(--mut);font-size:13.5px;line-height:1.5}
  /* sections */
  .sec-head{display:flex;align-items:baseline;gap:12px;margin:64px 0 22px}
  .sec-head h2{font-family:var(--disp);font-size:24px;font-weight:600;letter-spacing:-.01em}
  .sec-head .count{font-family:var(--mono);font-size:12px;color:var(--mut2)}
  .ep{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px;margin-bottom:18px;transition:.3s;overflow:hidden}
  .ep::before{content:"";position:absolute;left:0;top:0;height:100%;width:3px;background:var(--grad);opacity:0;transition:.3s}
  .ep:hover{border-color:rgba(255,255,255,.16);transform:translateY(-3px);background:rgba(255,255,255,.04)}
  .ep:hover::before{opacity:1}
  .ep-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .ep-num{font-family:var(--mono);font-size:12px;color:var(--a2);letter-spacing:.05em}
  .chip{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;border:1px solid var(--line)}
  .chip-ai{color:var(--a3)} .chip-voice{color:var(--a1)}
  .ep-title{font-family:var(--disp);font-size:21px;font-weight:600;line-height:1.25;margin-bottom:7px}
  .ep-meta{font-family:var(--mono);font-size:12px;color:var(--mut2);margin-bottom:16px}
  .player{background:rgba(0,0,0,.3);border:1px solid var(--line);border-radius:12px;padding:8px;margin-bottom:15px}
  audio{width:100%;height:38px;display:block}
  .ep-desc{color:var(--mut);font-size:15px}
  .readmore{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-family:var(--disp);font-weight:600;font-size:14px;color:var(--a2);text-decoration:none}
  .readmore .arr{transition:.25s} .readmore:hover .arr{transform:translateX(4px)}
  .empty{text-align:center;padding:64px 24px;border:1px dashed var(--line);border-radius:22px;background:var(--panel)}
  .empty h3{font-family:var(--disp);font-size:24px;font-weight:600;margin-bottom:8px}
  .empty p{color:var(--mut);max-width:400px;margin:0 auto}
  .pulse{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--a1);margin-bottom:18px;box-shadow:0 0 0 0 rgba(192,132,252,.5);animation:ring 2s infinite}
  @keyframes ring{0%{box-shadow:0 0 0 0 rgba(192,132,252,.5)}70%{box-shadow:0 0 0 20px rgba(192,132,252,0)}100%{box-shadow:0 0 0 0 rgba(192,132,252,0)}}
  /* about */
  .about{display:flex;gap:22px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:28px;margin:18px 0}
  .about img{width:84px;height:84px;border-radius:18px;object-fit:cover;border:1px solid var(--line);flex-shrink:0}
  .about h4{font-family:var(--disp);font-size:18px;font-weight:600;margin-bottom:6px}
  .about p{color:var(--mut);font-size:14.5px}
  .about a{color:var(--a2);text-decoration:none}
  .slogan{margin-top:12px;font-family:var(--disp);font-size:14px;color:var(--mut2)}
  .slogan b{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:700}
  footer{text-align:center;padding:60px 20px 56px;color:var(--mut2);font-family:var(--mono);font-size:12px;border-top:1px solid var(--line);margin-top:56px}
  footer .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  @media(max-width:600px){.ep{padding:20px}.bento{grid-template-columns:1fr}.about{flex-direction:column;text-align:center}}
</style>
</head>
<body>
<div id="spot"></div>
<div class="aurora"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>
<div class="wrap">
  <nav>
    <span class="brand"><span class="mark"><img src="https://aideazz.xyz/faviconnew.png" alt="AIdeazz"/></span><span class="wm">AI<i>deazz</i><b>·FM</b></span></span>
    <a class="nav-cta" href="#listen">Listen</a>
  </nav>
  <header>
    <span class="eyebrow">From &ldquo;A&rdquo; to &ldquo;Z&rdquo; &middot; Built in Public</span>
    <div class="cover-wrap"><img src="${xmlEscape(meta.coverUrl)}" alt="${xmlEscape(meta.title)} cover"/></div>
    <h1>Building a company<br/><span class="g">with AI agents.</span></h1>
    <p class="lede">${xmlEscape(meta.description)}</p>
    <div class="wave">${waveBars}</div>
    <div class="subs" id="listen">
      <a class="primary" href="https://open.spotify.com/"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 11-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 01-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 11-.54-1.8c4.37-1.32 9.79-.68 13.49 1.6.44.27.58.85.31 1.29zm.13-3.4C15.13 8.28 8.6 8.07 4.85 9.21a1.12 1.12 0 11-.65-2.15C8.5 5.75 15.71 6 20.06 8.58a1.12 1.12 0 11-1.16 1.92z"/></svg>Spotify</a>
      <a class="ghost" href="https://podcasts.apple.com/"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-3.2 19.47c-.05-.83-.1-2.1.02-3.01.11-.82.7-5.2.7-5.2s-.18-.36-.18-.9c0-.83.49-1.46 1.09-1.46.51 0 .76.39.76.85 0 .52-.33 1.3-.5 2.02-.14.6.3 1.1.9 1.1 1.08 0 1.9-1.14 1.9-2.78 0-1.45-1.04-2.47-2.53-2.47-1.72 0-2.73 1.29-2.73 2.62 0 .52.2 1.08.45 1.38a.18.18 0 01.04.17c-.05.2-.15.6-.17.68-.03.11-.09.14-.21.08-.79-.37-1.28-1.51-1.28-2.43 0-1.98 1.44-3.8 4.15-3.8 2.18 0 3.87 1.55 3.87 3.63 0 2.17-1.36 3.91-3.26 3.91-.64 0-1.24-.33-1.44-.72l-.39 1.5c-.14.55-.52 1.23-.78 1.65A10 10 0 1012 2z"/></svg>Apple</a>
      <a class="ghost" href="${xmlEscape(meta.siteUrl)}/feed.xml"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 11a9 9 0 019 9h-2.5A6.5 6.5 0 004 13.5V11zm0-5a14 14 0 0114 14h-2.5A11.5 11.5 0 004 8.5V6zm2.5 10.5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>RSS</a>
    </div>
  </header>
  <div class="marquee"><div class="track">${marquee}</div></div>
  <div class="sec-head"><h2>What you'll hear</h2></div>
  <div class="bento">
    <div class="cardb"><span class="ic">🤖</span><h4>Real multi-agent systems</h4><p>Nine production AI agents, what broke, and what actually held up.</p></div>
    <div class="cardb"><span class="ic">📈</span><h4>Marketing that's measured</h4><p>GEO/SEO/AEO, attribution over vanity metrics, and the engine behind it.</p></div>
    <div class="cardb"><span class="ic">🛠️</span><h4>Shipping as a solo founder</h4><p>AI-augmented building, honest constraints, no hype — just what ships.</p></div>
  </div>
  <div class="sec-head" id="episodes"><h2>Episodes</h2><span class="count">${total ? `${total} published` : 'launching soon'}</span></div>
${cards}
  <div class="sec-head"><h2>Your host</h2></div>
  <div class="about">
    <img src="${xmlEscape(meta.coverUrl)}" alt="${xmlEscape(meta.author)}"/>
    <div><h4>${xmlEscape(meta.author)}</h4><p>Solo founder of <a href="https://aideazz.xyz">AIdeazz</a> — building a company with AI agents from Panama. Former board-level operator, now an AI-augmented builder shipping multi-agent systems in production. This is the honest, unedited version.</p>
    <p class="slogan">Your AI companion who remembers your journey — from struggle to success. The <b>A&#8209;to&#8209;Z</b> of your private AI space. <a href="https://aideazz.xyz">aideazz.xyz &rarr;</a></p></div>
  </div>
</div>
<footer>© ${new Date().getFullYear()} ${xmlEscape(meta.author)} &middot; powered by the <span class="g">AIdeazz Voice Growth Engine</span></footer>
<script>
  (function(){var s=document.getElementById('spot');if(!s)return;
   window.addEventListener('pointermove',function(e){s.style.opacity=1;s.style.left=e.clientX+'px';s.style.top=e.clientY+'px';},{passive:true});
   window.addEventListener('pointerleave',function(){s.style.opacity=0;});})();
</script>
</body>
</html>
`;
}
