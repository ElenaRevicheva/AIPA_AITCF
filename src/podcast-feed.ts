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

/** Generate the branded landing page — modern dark "AI lab" aesthetic (aurora, glass, display type). */
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
        <h3>First episode dropping soon</h3>
        <p>Subscribe now and it lands in your feed the moment it ships.</p>
      </div>`;

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
<meta name="theme-color" content="#05060a"/>
<link rel="alternate" type="application/rss+xml" title="${xmlEscape(meta.title)}" href="${xmlEscape(meta.siteUrl)}/feed.xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"/>
<style>
  :root{
    --bg:#05060a; --panel:rgba(255,255,255,.025); --line:rgba(255,255,255,.08);
    --txt:#eef1f7; --mut:#9aa3b8; --mut2:#6b7488;
    --a1:#34d399; --a2:#22d3ee; --a3:#a78bfa;
    --grad:linear-gradient(110deg,var(--a1),var(--a2) 45%,var(--a3));
    --disp:'Space Grotesk',-apple-system,Segoe UI,sans-serif;
    --body:'Inter',-apple-system,Segoe UI,sans-serif;
    --mono:'JetBrains Mono',ui-monospace,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--txt);font-family:var(--body);line-height:1.6;
    -webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;min-height:100vh}
  /* aurora background */
  .aurora{position:fixed;inset:0;z-index:-2;overflow:hidden;filter:blur(60px);opacity:.55}
  .aurora span{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen;animation:drift 22s ease-in-out infinite}
  .aurora .b1{width:46vw;height:46vw;left:-8vw;top:-10vw;background:radial-gradient(circle,#34d39988,transparent 60%)}
  .aurora .b2{width:42vw;height:42vw;right:-10vw;top:-6vw;background:radial-gradient(circle,#a78bfa88,transparent 60%);animation-delay:-6s}
  .aurora .b3{width:50vw;height:50vw;left:25vw;top:30vh;background:radial-gradient(circle,#22d3ee66,transparent 60%);animation-delay:-12s}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6vw,4vh) scale(1.1)}66%{transform:translate(-5vw,-3vh) scale(.95)}}
  /* fine grain */
  body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.04;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  .wrap{max-width:780px;margin:0 auto;padding:0 22px}
  /* nav */
  nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0;position:sticky;top:0;z-index:10;
    backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .brand{font-family:var(--mono);font-size:13px;letter-spacing:.04em;color:var(--mut);display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--a1);box-shadow:0 0 12px var(--a1);animation:blink 2.4s ease-in-out infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
  .nav-rss{font-family:var(--mono);font-size:12px;color:var(--mut);text-decoration:none;border:1px solid var(--line);padding:7px 13px;border-radius:999px;transition:.25s}
  .nav-rss:hover{color:var(--txt);border-color:var(--a2)}
  /* hero */
  header{text-align:center;padding:48px 0 30px}
  .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;
    color:var(--a1);margin-bottom:26px;display:inline-block}
  .cover-wrap{position:relative;width:210px;height:210px;margin:0 auto 30px}
  .cover-wrap::before{content:"";position:absolute;inset:-3px;border-radius:30px;background:var(--grad);
    filter:blur(22px);opacity:.7;z-index:-1;animation:pulseGlow 5s ease-in-out infinite}
  @keyframes pulseGlow{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.85;transform:scale(1.04)}}
  .cover-wrap img{width:210px;height:210px;border-radius:26px;object-fit:cover;
    border:1px solid var(--line);box-shadow:0 20px 60px rgba(0,0,0,.6);animation:float 7s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
  h1{font-family:var(--disp);font-weight:700;font-size:clamp(34px,6vw,54px);line-height:1.04;letter-spacing:-.02em;margin-bottom:18px}
  h1 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .lede{color:var(--mut);max-width:540px;margin:0 auto 30px;font-size:17px}
  /* subscribe */
  .subs{display:flex;flex-wrap:wrap;gap:11px;justify-content:center}
  .subs a{display:inline-flex;align-items:center;gap:9px;padding:12px 20px;border-radius:999px;
    font-family:var(--disp);font-weight:600;font-size:14px;text-decoration:none;transition:.25s;border:1px solid var(--line);color:var(--txt)}
  .subs a svg{width:17px;height:17px}
  .subs .primary{background:var(--grad);color:#05060a;border:none;box-shadow:0 8px 28px rgba(52,211,153,.32)}
  .subs .primary:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(52,211,153,.45)}
  .subs .ghost{background:var(--panel)}
  .subs .ghost:hover{border-color:var(--a3);color:#fff;transform:translateY(-2px)}
  /* episodes */
  .sec-head{display:flex;align-items:baseline;gap:12px;margin:64px 0 22px}
  .sec-head h2{font-family:var(--disp);font-size:22px;font-weight:600}
  .sec-head .count{font-family:var(--mono);font-size:12px;color:var(--mut2)}
  .ep{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:20px;
    padding:26px;margin-bottom:18px;transition:.3s;overflow:hidden}
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
  .readmore{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-family:var(--disp);font-weight:600;
    font-size:14px;color:var(--a2);text-decoration:none}
  .readmore .arr{transition:.25s} .readmore:hover .arr{transform:translateX(4px)}
  /* empty */
  .empty{text-align:center;padding:60px 20px;border:1px dashed var(--line);border-radius:20px;background:var(--panel)}
  .empty h3{font-family:var(--disp);font-size:22px;font-weight:600;margin-bottom:8px}
  .empty p{color:var(--mut);max-width:380px;margin:0 auto}
  .pulse{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--a1);margin-bottom:18px;
    box-shadow:0 0 0 0 rgba(52,211,153,.5);animation:ring 2s infinite}
  @keyframes ring{0%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}70%{box-shadow:0 0 0 18px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
  /* footer */
  footer{text-align:center;padding:60px 20px 50px;color:var(--mut2);font-family:var(--mono);font-size:12px;border-top:1px solid var(--line);margin-top:50px}
  footer .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  @media(max-width:560px){.ep{padding:20px}h1{font-size:34px}}
</style>
</head>
<body>
<div class="aurora"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>
<div class="wrap">
  <nav>
    <span class="brand"><span class="dot"></span>AIDEAZZ · BUILDING IN PUBLIC</span>
    <a class="nav-rss" href="${xmlEscape(meta.siteUrl)}/feed.xml">RSS</a>
  </nav>
  <header>
    <span class="eyebrow">AI &middot; Solo Founder &middot; Production Notes</span>
    <div class="cover-wrap"><img src="${xmlEscape(meta.coverUrl)}" alt="${xmlEscape(meta.title)} cover"/></div>
    <h1>Building a company<br/><span class="g">with AI agents.</span></h1>
    <p class="lede">${xmlEscape(meta.description)}</p>
    <div class="subs">
      <a class="primary" href="https://open.spotify.com/"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 11-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 01-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 11-.54-1.8c4.37-1.32 9.79-.68 13.49 1.6.44.27.58.85.31 1.29zm.13-3.4C15.13 8.28 8.6 8.07 4.85 9.21a1.12 1.12 0 11-.65-2.15C8.5 5.75 15.71 6 20.06 8.58a1.12 1.12 0 11-1.16 1.92z"/></svg>Spotify</a>
      <a class="ghost" href="https://podcasts.apple.com/"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-3.2 19.47c-.05-.83-.1-2.1.02-3.01.11-.82.7-5.2.7-5.2s-.18-.36-.18-.9c0-.83.49-1.46 1.09-1.46.51 0 .76.39.76.85 0 .52-.33 1.3-.5 2.02-.14.6.3 1.1.9 1.1 1.08 0 1.9-1.14 1.9-2.78 0-1.45-1.04-2.47-2.53-2.47-1.72 0-2.73 1.29-2.73 2.62 0 .52.2 1.08.45 1.38a.18.18 0 01.04.17c-.05.2-.15.6-.17.68-.03.11-.09.14-.21.08-.79-.37-1.28-1.51-1.28-2.43 0-1.98 1.44-3.8 4.15-3.8 2.18 0 3.87 1.55 3.87 3.63 0 2.17-1.36 3.91-3.26 3.91-.64 0-1.24-.33-1.44-.72l-.39 1.5c-.14.55-.52 1.23-.78 1.65A10 10 0 1012 2z"/></svg>Apple</a>
      <a class="ghost" href="${xmlEscape(meta.siteUrl)}/feed.xml"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 11a9 9 0 019 9h-2.5A6.5 6.5 0 004 13.5V11zm0-5a14 14 0 0114 14h-2.5A11.5 11.5 0 004 8.5V6zm2.5 10.5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>RSS</a>
    </div>
  </header>
  <div class="sec-head"><h2>Episodes</h2><span class="count">${total ? `${total} published` : 'coming soon'}</span></div>
${cards}
</div>
<footer>© ${new Date().getFullYear()} ${xmlEscape(meta.author)} &middot; powered by the <span class="g">AIdeazz Voice Growth Engine</span></footer>
</body>
</html>
`;
}
