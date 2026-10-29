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
  heroUrl?: string;      // 29 Oct 2026: the naturalistic Atuona still behind the landing-page hero (16:9)
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

/**
 * Head-only description, capped at the 170 chars search engines and the audit
 * engine expect. The feed description stays long on purpose — Apple and Spotify
 * have already ingested it, and podcast directories have no such limit — so this
 * trims the trailing byline rather than rewriting the sentence. The author is
 * still declared in <meta name="author"> and in the JSON-LD, so nothing is lost.
 */
export function seoDescription(meta: PodcastMeta): string {
  const full = meta.description.trim();
  if (full.length <= 170) return full;
  const trimmed = full.replace(/\s*By\s+[^.]+\.\s*$/i, '');
  if (trimmed.length <= 170) return trimmed;
  const cut = trimmed.slice(0, 167);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * FAQ JSON-LD paired with the visible FAQ on the page. Answer engines lift these
 * verbatim, which is the whole point: a listener asking "what is this podcast
 * about" should get our sentence back, not a summary an engine invented.
 */
export function generatePodcastFaqJsonLd(meta: PodcastMeta, episodes: PodcastEpisode[]): string {
  const count = episodes.length;
  const qa: Array<[string, string]> = [
    [
      `What is ${meta.title} about?`,
      `${seoDescription(meta)} Each episode covers what was built that week, what broke in production, and what the numbers actually said.`,
    ],
    [
      'Who hosts this podcast?',
      `${meta.author}, a solo founder building AIdeazz from Panama — a fleet of production AI agents plus a marketing engine, run by one person with AI. Formerly a board-level operator, now an AI-augmented builder shipping multi-agent systems in production.`,
    ],
    [
      'Where can I listen?',
      `Every episode streams directly at ${meta.siteUrl} with no signup. The RSS feed at ${meta.siteUrl}/feed.xml works in Apple Podcasts, Spotify, Overcast, Pocket Casts and any other podcast app.`,
    ],
    [
      'How often do new episodes come out?',
      count > 0
        ? `${count} episode${count > 1 ? 's are' : ' is'} published so far. Episodes appear when something real has shipped rather than on a fixed schedule — the point is honest field notes, not filler.`
        : 'Episodes appear when something real has shipped rather than on a fixed schedule — the point is honest field notes, not filler.',
    ],
    [
      'Is this podcast technical or business focused?',
      'Both, deliberately. Episodes cover the engineering — multi-agent architecture, reliability, what failed in production — alongside the business side: how organic content becomes pipeline, what marketing automation actually measures, and the economics of running a company on AI agents.',
    ],
  ];
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  });
}

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
    author: {
      '@type': 'Person', name: meta.author, url: 'https://aideazz.xyz',
      sameAs: ['https://www.linkedin.com/in/elenarevicheva/', 'https://dev.to/elenarevicheva', 'https://www.youtube.com/@AIdeazz'],
    },
    publisher: { '@type': 'Organization', name: 'AIdeazz', url: 'https://aideazz.xyz' },
    webFeed: `${meta.siteUrl}/feed.xml`,
    genre: meta.category,
    keywords: 'AI podcast, AI-augmented building, agentic AI, AI agents, building in public, solo founder, multi-agent systems, AI engineering, marketing engine, GEO SEO AEO',
    sameAs: ['https://www.youtube.com/@AIdeazz', 'https://aideazz.xyz'],
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
    '- Listen on: Spotify (https://open.spotify.com) and YouTube (https://www.youtube.com/@AIdeazz)',
    `- Parent project: AIdeazz (https://aideazz.xyz) — multi-agent AI systems built in production`,
    '- Topics / keywords: AI-augmented building, agentic AI, AI agents, building in public, solo founder, multi-agent systems, AI engineering, marketing engine, GEO/SEO/AEO',
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
// ─── Brand (29 Oct 2026): the AIdeazz AI Lab lockup, as on aideazz.xyz/atlas ─────
// Same AZ mark (masked PNG under the purple→gold ramp), Syne wordmark, Sora lab line,
// Instrument Serif display, Manrope body. The hero is a naturalistic Atuona still
// (Luma, see scripts/podcast-hero-atuona.cjs) under a dither veil — no more card.

export const BRAND_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@700;800&family=Sora:wght@200;300;400&family=Manrope:wght@400;500;600;700&display=swap';

/** Tokens + lockup + buttons shared by the landing page and every episode page. */
export function brandCss(): string {
  return `
  :root{
    --bg:#020617; --veil:2,6,23; --panel:rgba(255,255,255,.04); --line:rgba(255,255,255,.1);
    --ink:#fff; --ink-80:rgba(255,255,255,.8); --ink-60:rgba(255,255,255,.6); --ink-45:rgba(255,255,255,.45);
    --purple:#7c3aed; --gold:#facc15; --amber:#edb867; --amber-hi:#fde68a;
    --ramp-fb:linear-gradient(115deg,#7c3aed,#facc15 50%,#7c3aed);
    --ramp:linear-gradient(115deg in oklab,#7c3aed,#facc15 50%,#7c3aed);
    --serif:'Instrument Serif',Georgia,serif;
    --sans:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    --display:'Syne',var(--sans);
    --lab:'Sora',var(--sans);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
  a{color:inherit}
  @keyframes az-flow{100%{background-position:220% center}}
  .brandlink{display:inline-flex;gap:10px;align-items:center;text-decoration:none;color:#fff;min-width:0}
  .mark{flex:none;display:inline-block;aspect-ratio:176/202;height:clamp(34px,9vw,46px);background-image:var(--ramp-fb);background-image:var(--ramp);background-size:220%;animation:az-flow 5s linear infinite;
    -webkit-mask:url(https://aideazz.xyz/media/az-mark.png) center/contain no-repeat;mask:url(https://aideazz.xyz/media/az-mark.png) center/contain no-repeat}
  .wordmark{display:flex;flex-direction:column;line-height:1;min-width:0}
  .wordmark .w{font:800 clamp(17px,4.6vw,26px)/1 var(--display);letter-spacing:.015em;text-transform:uppercase;white-space:nowrap}
  .wordmark .w b{font-weight:800;background-image:var(--ramp-fb);background-image:var(--ramp);background-size:220%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:az-flow 5s linear infinite}
  .wordmark .lab{margin-top:6px;display:flex;align-items:center;gap:8px;font:200 clamp(9.5px,2.6vw,12px)/1 var(--lab);letter-spacing:.3em;color:var(--ink-80);text-transform:uppercase;white-space:nowrap}
  .wordmark .lab i{display:inline-block;width:18px;height:1px;background:var(--amber);opacity:.9}
  @media(min-width:640px){.brandlink{gap:12px}.mark{height:54px}.wordmark .w{font-size:28px}.wordmark .lab{font-size:12px;letter-spacing:.42em}}
  @media(max-width:520px){.wordmark .lab{letter-spacing:.16em;font-size:9.5px}.wordmark .lab i:last-child{display:none}.top .btn{display:none}}
  .btn{display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--sans);letter-spacing:.02em;text-decoration:none;padding:12px 22px;border-radius:999px;transition:transform .2s,border-color .2s,background .2s}
  .btn.ghost{color:#fff;border:1px solid rgba(255,255,255,.5);background:rgba(var(--veil),.35);backdrop-filter:blur(6px)}
  .btn.ghost:hover{border-color:#fff;transform:translateY(-1px)}
  .btn.solid{color:#0b0716;background:var(--amber-hi);border:1px solid transparent}
  .btn.solid:hover{background:#fff;transform:translateY(-1px)}
  .eyebrow{display:block;font:400 11px var(--lab);letter-spacing:.24em;text-transform:uppercase;color:var(--amber)}
  @media(prefers-reduced-motion:reduce){.mark,.wordmark .w b,.ticker .track,.ticker .tk,.wave span,.play{animation:none}}
  `;
}

/** The lockup: AZ mark · AIDEAZZ·FM · "AIdeazz AI Lab · Podcast". */
export function brandLockup(meta: PodcastMeta, sub = 'AIdeazz AI Lab · Podcast'): string {
  return `<a class="brandlink" href="${xmlEscape(meta.siteUrl)}/" aria-label="${xmlEscape(meta.title)} — AIdeazz AI Lab">
      <span class="mark" aria-hidden="true"></span>
      <span class="wordmark"><span class="w">AIDEAZZ<b>·FM</b></span><span class="lab"><i></i>${xmlEscape(sub)}<i></i></span></span>
    </a>`;
}

/** Hero still: the Atuona render if the meta carries one, else the cover. */
export function heroImageUrl(meta: PodcastMeta): string {
  return meta.heroUrl || meta.coverUrl;
}

/** Where the radio mast's beacon sits in hero.jpg, as fractions of the IMAGE (measured on the 29 Oct 2026 Luma still:
 *  the mast tip at 80.7% across, 5.3% down). The page maps it through object-fit:cover at runtime, so the rings start
 *  on the beacon at every viewport. Override with PODCAST_HERO_BEACON_X / _Y when the still changes. */
export const HERO_BEACON = { x: process.env.PODCAST_HERO_BEACON_X?.trim() || '0.807', y: process.env.PODCAST_HERO_BEACON_Y?.trim() || '0.053' };
/** The same beacon in the SQUARE still (cover-source.jpg), which phones get: a tall narrow box would crop the wide
 *  still to empty sky (Elena, 29 Oct, "on cell it is torn"). Mast tip at 50% across, 19% down. */
export const HERO_BEACON_SQUARE = { x: process.env.PODCAST_HERO_BEACON_SQ_X?.trim() || '0.50', y: process.env.PODCAST_HERO_BEACON_SQ_Y?.trim() || '0.19' };
/** The square still's URL: the cover's source, next to hero.jpg. */
export function heroSquareUrl(meta: PodcastMeta): string {
  return meta.heroUrl ? meta.heroUrl.replace(/hero\.jpg$/, 'cover-source.jpg') : meta.coverUrl;
}

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
  // Full-bleed equalizer (Elena, 29 Oct: "this running wave should be along all the screen"): 200 bars, edge to edge.
  const waveBars = Array.from({ length: 200 }, (_, i) => `<span style="animation-delay:${((i % 50) * 0.035).toFixed(2)}s"></span>`).join('');
  const jsonLd = generatePodcastJsonLd(meta, sorted);
  const faqJsonLd = generatePodcastFaqJsonLd(meta, sorted);
  const seoDesc = seoDescription(meta);
  const hero = heroImageUrl(meta);
  const tickerItems = ['AI-augmented', 'Agentic', 'From A to Z', countLabel, 'Recorded in Panamá, on the go', 'Honest field notes', 'AIdeazz AI Lab'];
  const ticker = tickerItems.concat(tickerItems).map((t) => `<span class="tk">${esc(t)}</span><span class="dot" aria-hidden="true">&#9679;</span>`).join('');

  return `<!DOCTYPE html>
<html lang="${xmlEscape(meta.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${xmlEscape(meta.title)} — AI podcast by ${xmlEscape(meta.author)}</title>
<link rel="icon" type="image/png" href="https://aideazz.xyz/faviconnew.png"/>
<link rel="apple-touch-icon" href="https://aideazz.xyz/faviconnew.png"/>
<meta name="description" content="${xmlEscape(seoDesc)}"/>
<meta name="keywords" content="AI podcast, AI-augmented, agentic AI, AI agents, building in public, solo founder, multi-agent systems, AI engineering, marketing engine, AIdeazz, Elena Revicheva"/>
<meta name="author" content="${xmlEscape(meta.author)}"/>
<link rel="canonical" href="${xmlEscape(meta.siteUrl)}/"/>
<meta name="theme-color" content="#020617"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${xmlEscape(meta.title)}"/>
<meta property="og:url" content="${xmlEscape(meta.siteUrl)}/"/>
<meta property="og:title" content="${xmlEscape(meta.title)}"/>
<meta property="og:description" content="${xmlEscape(seoDesc)}"/>
<meta property="og:image" content="${xmlEscape(meta.coverUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${xmlEscape(meta.title)}"/>
<meta name="twitter:description" content="${xmlEscape(seoDesc)}"/>
<meta name="twitter:image" content="${xmlEscape(meta.coverUrl)}"/>
<link rel="alternate" type="application/rss+xml" title="${xmlEscape(meta.title)}" href="${xmlEscape(meta.siteUrl)}/feed.xml"/>
<link rel="sitemap" type="application/xml" href="${xmlEscape(meta.siteUrl)}/sitemap.xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="preload" as="image" href="${esc(hero)}" media="(min-width: 681px)"/>
<link rel="preload" as="image" href="${esc(heroSquareUrl(meta))}" media="(max-width: 680px)"/>
<link href="${BRAND_FONTS_HREF}" rel="stylesheet"/>
<script type="application/ld+json">${jsonLd}</script>
<script type="application/ld+json">${faqJsonLd}</script>
<style>
${brandCss()}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
  /* top bar over the photo */
  .top{position:absolute;top:0;left:0;right:0;z-index:20}
  .topin{max-width:1080px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  /* hero: the Atuona still, full-bleed, under a dither veil that fades into the page */
  .hero{position:relative;min-height:min(86vh,820px);display:flex;align-items:flex-end;isolation:isolate;overflow:hidden}
  /* The still is alive (Elena, 29 Oct): it breathes, the halftone glow beats like a heart, a band of light flows
     through the dots and radio rings pulse from the mast beacon. The pointer only adds a drift on top. */
  .hero-par picture{display:block;width:100%;height:100%}
  .hero-par{position:absolute;inset:-4%;z-index:-3;transform:translate3d(var(--px,0px),var(--py,0px),0);transition:transform .45s cubic-bezier(.2,.7,.2,1);will-change:transform}
  .hero-img{width:100%;height:100%;object-fit:cover;object-position:center top;filter:saturate(.82) contrast(1.04);animation:breathe 11s ease-in-out infinite;transform-origin:80% 8%}
  @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
  .hero-glow{position:absolute;inset:-4%;z-index:-2;pointer-events:none;mix-blend-mode:screen;opacity:var(--glow,.6);
    background:radial-gradient(560px circle at var(--mx,62%) var(--my,46%),rgba(253,230,138,.95),rgba(250,204,21,.38) 32%,rgba(124,58,237,.18) 58%,transparent 72%);
    -webkit-mask-image:radial-gradient(circle,#000 .95px,transparent 1.25px);mask-image:radial-gradient(circle,#000 .95px,transparent 1.25px);
    -webkit-mask-size:4px 4px;mask-size:4px 4px;
    transform:translate3d(calc(var(--px,0px) * 1.6),calc(var(--py,0px) * 1.6),0);transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .6s;
    animation:heartbeat 2.4s ease-in-out infinite}
  @keyframes heartbeat{0%,100%{filter:brightness(.9)}10%{filter:brightness(1.45)}20%{filter:brightness(1)}30%{filter:brightness(1.35)}55%{filter:brightness(.9)}}
  .hero-flow{position:absolute;inset:-4%;z-index:-2;pointer-events:none;mix-blend-mode:screen;opacity:.5;
    background:linear-gradient(104deg,transparent 34%,rgba(253,230,138,.42) 47%,rgba(168,85,247,.22) 53%,transparent 66%);background-size:260% 100%;
    -webkit-mask-image:radial-gradient(circle,#000 .95px,transparent 1.25px);mask-image:radial-gradient(circle,#000 .95px,transparent 1.25px);
    -webkit-mask-size:4px 4px;mask-size:4px 4px;animation:flow 13s linear infinite}
  @keyframes flow{0%{background-position:130% 0}100%{background-position:-130% 0}}
  .hero-rings{position:absolute;left:66%;top:30%;width:0;height:0;z-index:-1;pointer-events:none;overflow:visible;opacity:0;transition:opacity 1.2s}
  .hero-rings.on{opacity:1}
  .hero-rings svg{position:absolute;left:-180px;top:-180px;width:360px;height:360px;overflow:visible}
  .hero-rings circle{fill:none;stroke:#fde68a;stroke-width:1.2;opacity:0;transform-origin:180px 180px;animation:ring-out 4.8s cubic-bezier(.2,.6,.3,1) infinite}
  .hero-rings circle:nth-child(2){animation-delay:1.6s}.hero-rings circle:nth-child(3){animation-delay:3.2s}
  .hero-rings .beacon{fill:#fde68a;stroke:none;opacity:1;animation:beacon 2.4s ease-in-out infinite;filter:drop-shadow(0 0 6px #fde68a) drop-shadow(0 0 14px rgba(250,204,21,.8))}
  @keyframes ring-out{0%{transform:scale(.05);opacity:.9}70%{opacity:.18}100%{transform:scale(1);opacity:0}}
  @keyframes beacon{0%,100%{opacity:.55}10%{opacity:1}20%{opacity:.7}30%{opacity:1}55%{opacity:.55}}
  @media(prefers-reduced-motion:reduce){.hero-par,.hero-glow{transform:none;transition:none}.hero-img,.hero-glow,.hero-flow,.hero-rings circle,.hero-rings .beacon{animation:none}.hero-rings{display:none}}
  .hero-veil{position:absolute;inset:0;z-index:-1;pointer-events:none;
    background:linear-gradient(180deg,rgba(var(--veil),.55) 0%,rgba(var(--veil),.05) 26%,rgba(var(--veil),.1) 55%,rgba(var(--veil),.92) 88%,var(--bg) 100%)}
  .hero-in{position:relative;width:100%;max-width:1080px;margin:0 auto;padding:150px 24px 54px}
  .display{margin:16px 0 0;max-width:12ch;font:400 clamp(44px,3.4vw + 24px,84px)/1 var(--serif);letter-spacing:-.025em;
    text-shadow:0 1px 3px rgba(0,0,0,.6),0 2px 24px rgba(var(--veil),.75)}
  .display em{font-style:italic;color:var(--amber-hi)}
  .lede{margin:22px 0 0;max-width:52ch;font:400 clamp(15px,1.6vw,18px)/1.6 var(--sans);color:var(--ink-80);text-shadow:0 1px 12px rgba(var(--veil),.8)}
  .hero-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;font:300 12px var(--lab);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-60)}
  .hero-meta .dotsep{color:var(--amber)}
  .actions{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:28px}
  .play{width:58px;height:58px;border-radius:50%;background:var(--ramp-fb);background:var(--ramp);background-size:220%;animation:az-flow 5s linear infinite;display:grid;place-items:center;text-decoration:none;box-shadow:0 10px 30px rgba(124,58,237,.45);transition:transform .2s}
  .play:hover{transform:scale(1.06)}
  .play svg{width:26px;height:26px;color:#0b0716;margin-left:3px}
  .iconlinks{display:flex;gap:18px;margin-left:4px}
  .iconlinks a{color:var(--ink-60);transition:.2s}
  .iconlinks a:hover{color:#fff;transform:scale(1.1)}
  .iconlinks svg{width:23px;height:23px;display:block}
  /* ticker, as on Atlas */
  .ticker{overflow:hidden;border-block:1px solid rgba(255,255,255,.1);padding:12px 0;background:rgba(var(--veil),.3)}
  .ticker .track{display:flex;align-items:center;gap:22px;width:max-content;animation:az-ticker 40s linear infinite}
  .ticker .tk{flex:none;font:400 12px var(--lab);letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;background-image:var(--ramp-fb);background-image:var(--ramp);background-size:220%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:az-flow 5s linear infinite}
  .ticker .dot{flex:none;font-size:6px;color:var(--ink-45)}
  @keyframes az-ticker{to{transform:translateX(-50%)}}
  /* equalizer — the audio signature, kept */
  .wave{position:relative;left:50%;width:100vw;transform:translateX(-50%);display:flex;align-items:center;justify-content:space-between;gap:3px;height:48px;margin:26px 0 0;padding:0 8px;opacity:.8;
    -webkit-mask:linear-gradient(90deg,transparent,#000 3%,#000 97%,transparent);mask:linear-gradient(90deg,transparent,#000 3%,#000 97%,transparent)}
  .wave span{flex:1 1 0;min-width:2px;height:100%;border-radius:4px;background:var(--ramp-fb);transform:scaleY(.16);transform-origin:center;animation:eq 1.2s ease-in-out infinite}
  @keyframes eq{0%,100%{transform:scaleY(.16)}50%{transform:scaleY(1)}}
  @media(prefers-reduced-motion:reduce){.wave span{transform:scaleY(.5)}}
  /* sections */
  .sec-head{display:flex;align-items:baseline;gap:14px;margin:54px 0 10px}
  .sec-head h2{font:400 clamp(28px,1.2vw + 22px,36px)/1.08 var(--serif);letter-spacing:-.015em}
  .sec-head .count{font:300 11px var(--lab);letter-spacing:.18em;text-transform:uppercase;color:var(--ink-45)}
  .list-cols{display:grid;grid-template-columns:40px 1fr;gap:16px;padding:6px 12px;border-bottom:1px solid var(--line);font:300 10.5px var(--lab);letter-spacing:.18em;text-transform:uppercase;color:var(--ink-45)}
  .erow{display:grid;grid-template-columns:40px 1fr;gap:16px;padding:18px 12px;border-bottom:1px solid var(--line);transition:background .2s;align-items:start}
  .erow:hover{background:rgba(255,255,255,.04)}
  .erow-num{font:400 15px var(--serif);color:var(--amber);padding-top:3px}
  .erow-title{font:600 17px/1.3 var(--sans)}
  .erow-meta{font:300 11px var(--lab);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-45);margin:6px 0 9px}
  .erow-desc{color:var(--ink-60);font-size:14px;margin-bottom:12px}
  audio{width:100%;max-width:560px;height:36px;display:block}
  .readmore{display:inline-block;margin-top:12px;font:600 13px var(--sans);color:var(--amber-hi);text-decoration:none}
  .readmore:hover{text-decoration:underline}
  .empty{display:flex;align-items:center;gap:20px;padding:30px 24px;border-radius:14px;background:var(--panel);border:1px solid var(--line);margin-top:8px}
  .empty h3{font:400 24px var(--serif);margin-bottom:5px}
  .empty p{color:var(--ink-60);font-size:14px}
  .pulse{flex-shrink:0;width:14px;height:14px;border-radius:50%;background:var(--purple);box-shadow:0 0 0 0 rgba(192,132,252,.5);animation:ring 2s infinite}
  @keyframes ring{0%{box-shadow:0 0 0 0 rgba(192,132,252,.5)}70%{box-shadow:0 0 0 18px rgba(192,132,252,0)}100%{box-shadow:0 0 0 0 rgba(192,132,252,0)}}
  .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:10px 0}
  .cardb{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;transition:.25s}
  .cardb:hover{background:rgba(255,255,255,.07)}
  .cardb .kbar{display:block;width:30px;height:2px;border-radius:3px;background:var(--amber);margin-bottom:16px}
  .cardb h4{font:400 22px/1.15 var(--serif);margin-bottom:8px}
  .cardb p{color:var(--ink-60);font-size:13.5px;line-height:1.5}
  .about{display:flex;gap:24px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;margin:10px 0}
  .about img{width:112px;height:112px;border-radius:12px;object-fit:cover;flex-shrink:0;filter:saturate(.85)}
  .about h4{font:400 24px var(--serif);margin-bottom:6px}
  .about p{color:var(--ink-60);font-size:14.5px}
  .about a{color:var(--amber-hi);text-decoration:none}
  .slogan{margin-top:12px;font-size:14px;color:var(--ink-45)}
  .slogan b{font-weight:700;background-image:var(--ramp-fb);-webkit-background-clip:text;background-clip:text;color:transparent}
  .facts{list-style:none;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:10px 0}
  .facts li{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;display:flex;gap:12px;align-items:baseline}
  .facts .k{font:300 10.5px var(--lab);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-45);min-width:104px;flex-shrink:0}
  .facts .v{font-size:14px;color:var(--ink)}
  .facts a{color:var(--amber-hi);text-decoration:none}
  .faq{display:flex;flex-direction:column;gap:10px;margin:10px 0}
  .faq-i{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px;transition:.25s}
  .faq-i:hover{background:rgba(255,255,255,.07)}
  .faq-i h3{font:400 21px/1.2 var(--serif);margin-bottom:7px}
  .faq-i p{color:var(--ink-60);font-size:14px;line-height:1.6}
  .faq-i a{color:var(--amber-hi)}
  footer{text-align:center;padding:54px 20px 50px;color:var(--ink-45);font:300 11px var(--lab);letter-spacing:.14em;text-transform:uppercase;border-top:1px solid var(--line);margin-top:54px}
  footer .big{display:block;margin:0 auto 22px;max-width:30ch;font:400 clamp(1.3rem,3vw,2.2rem)/1.15 var(--serif);letter-spacing:0;text-transform:none;color:var(--ink-60)}
  footer .big em{font-style:italic;color:var(--amber)}
  footer .g{background-image:var(--ramp-fb);-webkit-background-clip:text;background-clip:text;color:transparent}
  @media(max-width:680px){.hero-img{object-position:center 30%;transform-origin:50% 20%}.hero-dither{opacity:.16}.hero-grain{opacity:.1}.hero-glow,.hero-flow{-webkit-mask-size:3px 3px;mask-size:3px 3px}
    .hero-veil{background:linear-gradient(180deg,rgba(var(--veil),.5) 0%,rgba(var(--veil),.12) 22%,rgba(var(--veil),.35) 48%,rgba(var(--veil),.9) 80%,var(--bg) 100%)}}
  @media(max-width:680px){.bento{grid-template-columns:1fr}.about{flex-direction:column;text-align:center}.facts{grid-template-columns:1fr}.facts .k{min-width:unset}.hero-in{padding-top:120px}.display{max-width:none}}
</style>
</head>
<body>
  <header class="top">
    <div class="topin">
      ${brandLockup(meta)}
    </div>
  </header>
  <section class="hero">
    <div class="hero-par"><picture>
      <source media="(max-width: 680px)" srcset="${esc(heroSquareUrl(meta))}"/>
      <img class="hero-img" src="${esc(hero)}" alt="A 1930s Art Deco broadcasting house with a radio mast at dusk, on film — the ${esc(meta.title)} artwork, rendered by the AIdeazz Atuona studio" fetchpriority="high"/>
    </picture></div>
    <div class="hero-dither" aria-hidden="true"></div>
    <div class="hero-flow" aria-hidden="true"></div>
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="hero-rings" aria-hidden="true" data-bx="${HERO_BEACON.x}" data-by="${HERO_BEACON.y}" data-bx-sq="${HERO_BEACON_SQUARE.x}" data-by-sq="${HERO_BEACON_SQUARE.y}"><svg viewBox="0 0 360 360"><circle cx="180" cy="180" r="150"/><circle cx="180" cy="180" r="150"/><circle cx="180" cy="180" r="150"/><circle class="beacon" cx="180" cy="180" r="3"/></svg></div>
    <div class="hero-grain" aria-hidden="true"></div>
    <div class="hero-veil" aria-hidden="true"></div>
    <div class="hero-in">
      <span class="eyebrow">Podcast &middot; AIdeazz AI Lab</span>
      <h1 class="display">Building in public, <em>on the go.</em></h1>
      <p class="lede">Honest lessons on AI-augmented building, marketing engines, and shipping in production. By ${esc(meta.author)} — one person and a fleet of agents, from Panamá.</p>
      <div class="hero-meta">
        <span>${esc(meta.author)}</span><span class="dotsep">&#9679;</span>
        <span>From &ldquo;A&rdquo; to &ldquo;Z&rdquo; of AI-augmented workflows</span><span class="dotsep">&#9679;</span>
        <span>${countLabel}</span>
      </div>
      <div class="actions" id="listen">
        <a class="play" href="#episodes" aria-label="Listen to the latest episode"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></a>
        <a class="btn solid" href="${esc(meta.siteUrl)}/feed.xml">Follow the feed</a>
        <div class="iconlinks">
          <a href="https://open.spotify.com/" aria-label="Spotify"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 11-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 01-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 11-.54-1.8c4.37-1.32 9.79-.68 13.49 1.6.44.27.58.85.31 1.29zm.13-3.4C15.13 8.28 8.6 8.07 4.85 9.21a1.12 1.12 0 11-.65-2.15C8.5 5.75 15.71 6 20.06 8.58a1.12 1.12 0 11-1.16 1.92z"/></svg></a>
          <a href="https://www.youtube.com/@AIdeazz" aria-label="YouTube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg></a>
          <a href="${esc(meta.siteUrl)}/feed.xml" aria-label="RSS"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 11a9 9 0 019 9h-2.5A6.5 6.5 0 004 13.5V11zm0-5a14 14 0 0114 14h-2.5A11.5 11.5 0 004 8.5V6zm2.5 10.5a2 2 0 11-4 0 2 2 0 014 0z"/></svg></a>
        </div>
      </div>
    </div>
  </section>
  <div class="ticker" aria-hidden="true"><div class="track">${ticker}</div></div>
<div class="wrap">
  <div class="wave" aria-hidden="true">${waveBars}</div>
  <div class="sec-head" id="episodes"><h2>All episodes</h2><span class="count">${countLabel}</span></div>
  ${total ? '<div class="list-cols"><span>#</span><span>Episode</span></div>' : ''}
${rows}
  <div class="sec-head"><h2>What you&rsquo;ll hear</h2></div>
  <div class="bento">
    <div class="cardb"><span class="kbar"></span><h4>Real multi-agent systems</h4><p>Nine production AI agents, what broke, and what actually held up.</p></div>
    <div class="cardb"><span class="kbar"></span><h4>Marketing that&rsquo;s measured</h4><p>GEO/SEO/AEO, attribution over vanity metrics, and the engine behind it.</p></div>
    <div class="cardb"><span class="kbar"></span><h4>Shipping as a solo founder</h4><p>AI-augmented building, honest constraints, no hype — just what ships.</p></div>
  </div>
  <div class="sec-head"><h2>Show facts</h2></div>
  <ul class="facts">
    <li><span class="k">Host</span><span class="v">${esc(meta.author)}, solo founder of <a href="https://aideazz.xyz/portfolio">AIdeazz</a></span></li>
    <li><span class="k">Episodes</span><span class="v">${countLabel}</span></li>
    <li><span class="k">Language</span><span class="v">${esc(meta.language === 'en' ? 'English' : meta.language)}</span></li>
    <li><span class="k">Category</span><span class="v">${esc(meta.category)}</span></li>
    <li><span class="k">Recorded in</span><span class="v">Panama (UTC−5), on the go</span></li>
    <li><span class="k">RSS feed</span><span class="v"><a href="${esc(meta.siteUrl)}/feed.xml">${esc(meta.siteUrl.replace(/^https?:\/\//, ''))}/feed.xml</a></span></li>
    <li><span class="k">Cost</span><span class="v">Free, no signup, no paywall</span></li>
    <li><span class="k">Listen on</span><span class="v">Any podcast app, or stream here</span></li>
  </ul>
  <div class="sec-head" id="faq"><h2>Frequently asked</h2></div>
  <div class="faq">
    <div class="faq-i"><h3>What is ${esc(meta.title)} about?</h3><p>${esc(seoDesc)} Each episode covers what was built that week, what broke in production, and what the numbers actually said.</p></div>
    <div class="faq-i"><h3>Who hosts this podcast?</h3><p>${esc(meta.author)}, a solo founder building AIdeazz from Panama — a fleet of production AI agents plus a marketing engine, run by one person with AI. Formerly a board-level operator, now an AI-augmented builder shipping multi-agent systems in production.</p></div>
    <div class="faq-i"><h3>Where can I listen?</h3><p>Every episode streams directly on this page with no signup. The <a href="${esc(meta.siteUrl)}/feed.xml">RSS feed</a> works in Apple Podcasts, Spotify, Overcast, Pocket Casts and any other podcast app.</p></div>
    <div class="faq-i"><h3>How often do new episodes come out?</h3><p>${total ? `${countLabel} published so far. Episodes` : 'Episodes'} appear when something real has shipped rather than on a fixed schedule — the point is honest field notes, not filler.</p></div>
    <div class="faq-i"><h3>Is this podcast technical or business focused?</h3><p>Both, deliberately. Episodes cover the engineering — multi-agent architecture, reliability, what failed in production — alongside the business side: how organic content becomes pipeline, what marketing automation actually measures, and the economics of running a company on AI agents.</p></div>
  </div>
  <div class="sec-head"><h2>About</h2></div>
  <div class="about">
    <img src="${esc(meta.coverUrl)}" alt="${esc(meta.title)} cover art"/>
    <div><h4>${esc(meta.author)}</h4><p>Solo founder of <a href="https://aideazz.xyz">AIdeazz</a> — building a company with AI agents from Panama. Former board-level operator, now an AI-augmented builder shipping multi-agent systems in production. This is the honest, unedited version.</p>
    <p class="slogan">Your AI companion who remembers your journey — from struggle to success. The <b>A&#8209;to&#8209;Z</b> of your private AI space. <a href="https://aideazz.xyz">aideazz.xyz &rarr;</a></p></div>
  </div>
</div>
<footer>
  <span class="big">Built in public, <em>on the go</em> — one person, a fleet of agents, and the honest notes.</span>
  © ${new Date().getFullYear()} ${esc(meta.author)} &middot; AIdeazz AI Lab &middot; powered by the <span class="g">AIdeazz Voice Growth Engine</span>
</footer>
<script>
  // Pointer parallax + glow (as on hud.ai / Perplexity hero art): the still drifts a few px against the cursor and the
  // halftone glow follows it. Pointer only — touch and reduced-motion get the still image.
  (function(){
    var h=document.querySelector('.hero');if(!h)return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var raf=0,px=0,py=0,mx=62,my=46,glow=.55;
    function paint(){raf=0;h.style.setProperty('--px',px.toFixed(1)+'px');h.style.setProperty('--py',py.toFixed(1)+'px');
      h.style.setProperty('--mx',mx.toFixed(1)+'%');h.style.setProperty('--my',my.toFixed(1)+'%');h.style.setProperty('--glow',glow);}
    h.addEventListener('pointermove',function(e){if(e.pointerType==='touch')return;var r=h.getBoundingClientRect();
      var x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;px=(0.5-x)*22;py=(0.5-y)*14;mx=x*100;my=y*100;glow=.85;
      if(!raf)raf=requestAnimationFrame(paint);},{passive:true});
    h.addEventListener('pointerleave',function(){px=0;py=0;glow=.55;if(!raf)raf=requestAnimationFrame(paint);});
  })();
  (function(){
    // Rings start on the mast beacon: image-space fractions → page pixels through object-fit:cover (center top).
    var hero=document.querySelector('.hero'),par=document.querySelector('.hero-par'),img=document.querySelector('.hero-img'),rings=document.querySelector('.hero-rings');
    if(!hero||!par||!img||!rings)return;
    function place(){var iw=img.naturalWidth,ih=img.naturalHeight;if(!iw||!ih)return;
      var sq=/cover-source/.test(img.currentSrc||'');
      var bx=parseFloat(rings.getAttribute(sq?'data-bx-sq':'data-bx')),by=parseFloat(rings.getAttribute(sq?'data-by-sq':'data-by'));
      var pr=par.getBoundingClientRect(),hr=hero.getBoundingClientRect(),s=Math.max(pr.width/iw,pr.height/ih),w=iw*s,hh=ih*s;
      var posY=sq?0.30:0; // object-position: center 30% on phones (square), center top otherwise
      var x=(pr.width-w)*0.5+bx*w+(pr.left-hr.left),y=(pr.height-hh)*posY+by*hh+(pr.top-hr.top);
      rings.style.left=x.toFixed(1)+'px';rings.style.top=y.toFixed(1)+'px';rings.classList.add('on');}
    if(img.complete)place();img.addEventListener('load',place);window.addEventListener('resize',place,{passive:true});
  })();
</script>
</body>
</html>
`;
}
