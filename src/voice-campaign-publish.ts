/**
 * voice-campaign-publish.ts — orchestrator: content cluster -> live, attributed campaign (ADDITIVE)
 *
 * Takes a ContentCluster (from voice-growth-engine) and publishes it by REUSING the
 * already-live pipelines:
 *   - EN blog -> Dev.to + aideazz.xyz + per-article static HTML + sitemap (full SEO/GEO/AEO path)
 *   - LinkedIn atoms -> Buffer (first immediately, rest dripped over days)
 *   - ES blog + Instagram atoms -> saved to a campaign file for the next iteration
 *
 * It only CALLS existing exported helpers; it does not modify them. UTM links baked into
 * each atom flow into the existing /marketing/inquiry -> triage -> HubSpot pipeline.
 *
 * Safe-by-default: ES native-blog static publishing and IG media posting are intentionally
 * deferred (no existing path yet) so nothing produces a broken link.
 */

import type Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { saveBlogPostCache, pushSitemapToGithub } from './daily-blog-publisher';
import { pushOneArticleHtml } from './blog-static-pages';
import { bufferPostableChannels, bufferCreatePost } from './buffer-publisher';
import type { ContentCluster } from './voice-growth-engine';

const AIDEAZZ_SITE = (process.env.AIDEAZZ_SITE_URL || 'https://aideazz.xyz').replace(/\/$/, '');

/** Inline Dev.to publish (mirrors daily-blog-publisher's private helper; kept here to avoid editing that file). */
async function publishToDevTo(title: string, markdown: string, canonicalUrl: string): Promise<string | null> {
  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const body = `*Originally published on [AIdeazz](${canonicalUrl}) — cross-posted here with canonical link.*\n\n${markdown}`;
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        article: { title, body_markdown: body, published: true, canonical_url: canonicalUrl, tags: ['ai', 'programming', 'machinelearning'] },
      }),
    });
    if (!res.ok) { console.warn(`[VoiceCampaign] Dev.to failed ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch (e) {
    console.warn('[VoiceCampaign] Dev.to error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export interface PublishResult {
  campaignId: string;
  enBlogUrl: string | null;
  devtoUrl: string | null;
  linkedinPosted: Array<{ ok: boolean; id?: string; error?: string; when: string }>;
  savedFile: string;
  deferred: { esBlog: boolean; igAtoms: number; extraLinkedin: number };
}

function campaignDir(): string {
  const dir = path.join(process.env.DAILY_BLOG_TOPIC_STATE_DIR ?? process.env.HASHNODE_TOPIC_STATE_DIR ?? path.join(process.cwd(), 'data'), 'voice-campaigns');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Publish a content cluster. Full auto-fire scope (safe tonight):
 *  - EN blog: live via Dev.to + aideazz static + sitemap
 *  - LinkedIn atoms: #1 shareNow, #2.. customScheduled at +24h increments (drip)
 *  - ES blog + IG atoms: saved for next iteration (no broken links)
 */
export async function publishVoiceCampaign(cluster: ContentCluster): Promise<PublishResult> {
  const result: PublishResult = {
    campaignId: cluster.campaignId,
    enBlogUrl: null,
    devtoUrl: null,
    linkedinPosted: [],
    savedFile: '',
    deferred: { esBlog: false, igAtoms: 0, extraLinkedin: 0 },
  };

  // 1. EN blog -> full SEO/GEO/AEO path
  const en = cluster.blogs.find((b) => b.lang === 'en');
  if (en) {
    const aideazzBlogUrl = `${AIDEAZZ_SITE}/blog/${en.slug}`;
    const devtoUrl = await publishToDevTo(en.title, en.markdown, aideazzBlogUrl);
    saveBlogPostCache({ slug: en.slug, title: en.title, markdown: en.markdown, devtoUrl: devtoUrl || '', aideazzBlogUrl });
    await pushOneArticleHtml({ slug: en.slug, title: en.title, markdown: en.markdown, ...(devtoUrl ? { devtoUrl } : {}), url: aideazzBlogUrl }).catch((e) =>
      console.warn('[VoiceCampaign] static page:', e instanceof Error ? e.message : String(e)),
    );
    pushSitemapToGithub().catch((e) => console.warn('[VoiceCampaign] sitemap:', e instanceof Error ? e.message : String(e)));
    result.enBlogUrl = aideazzBlogUrl;
    result.devtoUrl = devtoUrl;
  }

  // 2. LinkedIn atoms -> Buffer (drip). Their UTM links already target the EN blog slug.
  const liAtoms = cluster.social.filter((s) => s.channel === 'linkedin');
  let liChannelId: string | null = null;
  try {
    const channels = await bufferPostableChannels();
    liChannelId = channels.find((c) => c.service === 'linkedin')?.id || null;
  } catch (e) {
    console.warn('[VoiceCampaign] buffer channels:', e instanceof Error ? e.message : String(e));
  }
  if (liChannelId) {
    for (let i = 0; i < liAtoms.length; i++) {
      const atom = liAtoms[i]!;
      const when = i === 0 ? 'now' : `+${i}d`;
      const opts: { channelId: string; text: string; mode: 'shareNow' | 'customScheduled'; dueAt?: string } =
        i === 0
          ? { channelId: liChannelId, text: atom.text, mode: 'shareNow' }
          : { channelId: liChannelId, text: atom.text, mode: 'customScheduled', dueAt: new Date(Date.now() + i * 24 * 3600 * 1000).toISOString() };
      const r = await bufferCreatePost(opts);
      result.linkedinPosted.push({ ok: r.ok, ...(r.id ? { id: r.id } : {}), ...(r.error ? { error: r.error } : {}), when });
    }
  } else {
    result.deferred.extraLinkedin = liAtoms.length;
  }

  // 3. Save full cluster (incl ES blog + IG atoms) for the next iteration / manual use.
  const igCount = cluster.social.filter((s) => s.channel === 'instagram').length;
  result.deferred.esBlog = cluster.blogs.some((b) => b.lang === 'es');
  result.deferred.igAtoms = igCount;
  const file = path.join(campaignDir(), `${cluster.campaignId}.json`);
  fs.writeFileSync(file, JSON.stringify(cluster, null, 2), 'utf8');
  result.savedFile = file;

  return result;
}
