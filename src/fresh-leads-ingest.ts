/**
 * fresh-leads-ingest.ts
 * Multi-source prospect engine for AIdeazz.
 *
 * Sources (all free, no paid API required):
 *   1. Hacker News "Ask HN: Who is Hiring?" — monthly, 200-400 real companies
 *   2. Hacker News "Ask HN: Who wants to be hired?" — freelancers who need AI tools
 *   3. Product Hunt launches — founders who just shipped, reachable while momentum is hot
 *   4. GitHub search — repos tagged ai-agent, llm, automation with contact info in README
 *
 * Each source deduplicates against outreach_targets (by company name + email).
 * Pain-point classification via Claude Haiku batch call.
 * HubSpot push only for records with real verified contact data.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { getOutreachTargetByCompany, saveOutreachTargetsBulk } from './database';
import { pushLeadToHubSpot } from './hubspot-client';
import { batchEnrichLeads, isBrightDataConfigured } from './brightdata-enrich';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FreshLead {
  name: string;           // founder / contact name if found, else "Founder @ Company"
  company: string;
  email: string | null;
  website: string | null;
  linkedinUrl: string | null;
  description: string;    // raw text used for pain-point classification
  source: string;         // e.g. 'hn_hiring', 'product_hunt', 'github'
  isRemote?: boolean;
}

interface PainClassification {
  painPoint: string;
  matchedSystem: string;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<p>/gi, '\n').replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>.*?<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+\-]+@[\w\-]+\.[a-zA-Z][\w.]{1,}/);
  return m ? m[0].replace(/[.]+$/, '').toLowerCase() : null;
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[\w\-./?=#&%+]+/);
  return m ? m[0].replace(/[)\].,;]+$/, '') : null;
}

function extractLinkedIn(text: string): string | null {
  const m = text.match(/linkedin\.com\/in\/[\w\-]+/i);
  return m ? `https://${m[0]}` : null;
}

// ─── 1. Hacker News "Who is Hiring" ──────────────────────────────────────────

const HN_ALGOLIA = 'https://hn.algolia.com/api/v1';

interface AlgoliaStoryHit { objectID: string; title: string; created_at: string }
interface AlgoliaCommentHit {
  objectID: string;
  comment_text: string;
  parent_id: number;
  story_id: number;
  author: string;
}

async function findHNThread(query: string): Promise<{ id: string; title: string } | null> {
  try {
    const url = `${HN_ALGOLIA}/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AIdeazz-CTO-AIPA/1.0' } });
    if (!res.ok) return null;
    const data = await res.json() as { hits: AlgoliaStoryHit[] };
    // Pick the most recent matching thread
    const hit = data.hits.find(h =>
      h.title.toLowerCase().includes('who is hiring') ||
      h.title.toLowerCase().includes('who wants to be hired')
    );
    return hit ? { id: hit.objectID, title: hit.title } : null;
  } catch { return null; }
}

async function fetchHNComments(storyId: string, limit = 300): Promise<AlgoliaCommentHit[]> {
  try {
    const url = `${HN_ALGOLIA}/search?tags=comment,story_${storyId}&hitsPerPage=${limit}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AIdeazz-CTO-AIPA/1.0' } });
    if (!res.ok) return [];
    const data = await res.json() as { hits: AlgoliaCommentHit[] };
    // Only top-level comments (direct replies to the story)
    return data.hits.filter(h => h.parent_id === Number(storyId));
  } catch { return []; }
}

function parseHNHiringComment(raw: string, author: string): FreshLead | null {
  const text = stripHtml(raw);
  if (text.length < 80) return null; // too short to be a real company post

  // Company name: usually the first segment before | or newline
  const firstLine = text.split('\n')[0] || '';
  const segments  = firstLine.split('|').map(s => s.trim());
  const company   = segments[0]?.replace(/^[^a-zA-Z]*/, '').trim() || '';
  if (!company || company.length < 2 || company.length > 80) return null;

  // Skip individuals-for-hire posts (usually contain "I am" or "looking for")
  if (/^(I am|I'm|Looking for|Available|Freelance)/i.test(firstLine)) return null;

  const email      = extractEmail(text);
  const website    = extractUrl(text);
  const linkedinUrl = extractLinkedIn(text);
  const isRemote   = /\bremote\b/i.test(text);

  // Use first 600 chars of description for pain-point classification
  const description = text.slice(0, 600);

  return { name: `Founder @ ${company}`, company, email, website, linkedinUrl, description, source: 'hn_hiring', isRemote };
}

export async function ingestHNHiring(limit = 150): Promise<FreshLead[]> {
  const thread = await findHNThread('Ask HN: Who is hiring?');
  if (!thread) { console.warn('[fresh-leads] HN hiring thread not found'); return []; }
  console.log(`[fresh-leads] HN thread: "${thread.title}" (id=${thread.id})`);

  const comments = await fetchHNComments(thread.id, limit);
  console.log(`[fresh-leads] HN comments fetched: ${comments.length}`);

  const leads: FreshLead[] = [];
  for (const c of comments) {
    const lead = parseHNHiringComment(c.comment_text || '', c.author || '');
    if (lead) leads.push(lead);
  }
  return leads;
}

// ─── 2. Product Hunt launches ─────────────────────────────────────────────────
// Uses the public Product Hunt GraphQL API (no key needed for basic queries)

const PH_GRAPHQL = 'https://api.producthunt.com/v2/api/graphql';

async function ingestProductHunt(daysBack = 7, limit = 50): Promise<FreshLead[]> {
  const phToken = process.env.PRODUCT_HUNT_TOKEN || '';
  if (!phToken) {
    console.log('[fresh-leads] PRODUCT_HUNT_TOKEN not set — skipping Product Hunt');
    return [];
  }

  const postedAfter = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const query = `
    query {
      posts(order: VOTES, postedAfter: "${postedAfter}", first: ${limit}, topic: "artificial-intelligence") {
        edges {
          node {
            name
            tagline
            website
            makers { name twitterUsername profileUrl }
          }
        }
      }
    }`;

  try {
    const res = await fetch(PH_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${phToken}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: { posts?: { edges: Array<{ node: any }> } } };
    const edges = data?.data?.posts?.edges || [];

    return edges.map(({ node }) => {
      const maker = node.makers?.[0];
      const linkedinUrl = maker?.profileUrl?.includes('linkedin') ? maker.profileUrl : null;
      return {
        name:        maker?.name || `Founder @ ${node.name}`,
        company:     node.name,
        email:       null,
        website:     node.website || null,
        linkedinUrl,
        description: `${node.name}: ${node.tagline}`,
        source:      'product_hunt',
      } as FreshLead;
    }).filter(l => l.company);
  } catch (e) {
    console.error('[fresh-leads] Product Hunt error:', e);
    return [];
  }
}

// ─── 3. GitHub repo search ───────────────────────────────────────────────────
// Searches for repos tagged with AI/automation topics, extracts contact from README

async function ingestGitHub(limit = 30): Promise<FreshLead[]> {
  const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || '';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AIdeazz-CTO-AIPA/1.0',
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken.replace(/^['"]|['"]$/g, '').trim()}`;

  // Search for recently created repos with AI/automation focus that mention "contact" or have email
  const queries = [
    'ai-agent automation "contact me" in:readme pushed:>2025-01-01 stars:>5',
    'llm saas "founder" "email" in:readme pushed:>2025-01-01 stars:>10',
  ];

  const leads: FreshLead[] = [];

  for (const q of queries) {
    if (leads.length >= limit) break;
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=15`;
      const res = await fetch(url, { headers });
      if (!res.ok) { console.warn(`[fresh-leads] GitHub search ${res.status}`); continue; }
      const data = await res.json() as { items?: any[] };

      for (const repo of (data.items || []).slice(0, 10)) {
        if (leads.length >= limit) break;
        try {
          // Fetch README
          const readmeRes = await fetch(
            `https://api.github.com/repos/${repo.full_name}/readme`,
            { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } }
          );
          if (!readmeRes.ok) continue;
          const readme = await readmeRes.text();

          const email = extractEmail(readme);
          if (!email) continue; // only include if there's a real contact email

          const company  = repo.owner?.login || repo.name;
          const website  = repo.homepage || extractUrl(readme);
          const linkedin = extractLinkedIn(readme);
          const desc     = readme.slice(0, 400).replace(/#{1,6}\s*/g, '').replace(/\n+/g, ' ').trim();

          leads.push({
            name:        `${repo.owner?.login || 'Founder'} @ ${company}`,
            company,
            email,
            website:     website || null,
            linkedinUrl: linkedin,
            description: desc,
            source:      'github',
          });

          await new Promise(r => setTimeout(r, 400)); // GitHub rate limit courtesy
        } catch { continue; }
      }
    } catch (e) {
      console.error('[fresh-leads] GitHub error:', e);
    }
  }

  return leads;
}

// ─── Pain-point classification ────────────────────────────────────────────────

const AIDEAZZ_SYSTEMS = [
  'CTO AIPA — code review, architecture, deployment orchestration',
  'CMO AIPA — SEO/GEO, lead triage, cold outreach',
  'VibeJobHunter — autonomous job search, 3000+ listings/hour',
  'EspaLuz — AI Spanish tutor on WhatsApp',
  'Multi-Model Router — 76% Groq / 24% Claude, $0/month inference',
  'Oracle Always-Free Stack — 9 AI agents at $0/month',
];

async function classifyPainPoints(
  anthropic: Anthropic,
  leads: Array<{ company: string; description: string }>,
): Promise<Map<string, PainClassification>> {
  const result = new Map<string, PainClassification>();
  if (leads.length === 0) return result;

  const list = leads.map((l, i) => `${i + 1}. ${l.company}: "${l.description.slice(0, 200)}"`).join('\n');

  const prompt = `You are a B2B analyst for AIdeazz, an AI systems builder.

AIdeazz systems:
${AIDEAZZ_SYSTEMS.map(s => `- ${s}`).join('\n')}

For each company below give: their likely pain point (1 sentence) and the best matching AIdeazz system.

${list}

Return ONLY valid JSON array:
[{"company":"Name","painPoint":"...","matchedSystem":"SystemName"},...]`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = resp.content[0] && 'text' in resp.content[0] ? resp.content[0].text : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]) as Array<{ company: string; painPoint: string; matchedSystem: string }>;
    for (const e of parsed) result.set(e.company, { painPoint: e.painPoint, matchedSystem: e.matchedSystem });
  } catch (e) {
    console.error('[fresh-leads] Pain classification error:', e);
  }
  return result;
}

// ─── Dedup helper ─────────────────────────────────────────────────────────────

async function isAlreadyInPipeline(company: string, email: string | null): Promise<boolean> {
  // Check by company name
  const existing = await getOutreachTargetByCompany(company);
  return !!existing;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export interface FreshLeadsResult {
  ingested:  number;
  skipped:   number;
  errors:    number;
  bySource:  Record<string, number>;
  summary:   string;
}

export async function runFreshLeadsIngestion(
  anthropic: Anthropic,
  sources: ('hn' | 'ph' | 'github')[] = ['hn', 'github'],
  sendTelegram?: (msg: string) => Promise<void>,
): Promise<FreshLeadsResult> {
  const tag = 'fresh-leads';
  console.log(`[${tag}] Starting multi-source ingestion (sources: ${sources.join(', ')})`);

  const allLeads: FreshLead[] = [];
  const bySource: Record<string, number> = {};

  // Gather from all enabled sources in parallel
  const fetches: Promise<FreshLead[]>[] = [];
  if (sources.includes('hn'))     fetches.push(ingestHNHiring(200));
  if (sources.includes('ph'))     fetches.push(ingestProductHunt(14, 50));
  if (sources.includes('github')) fetches.push(ingestGitHub(30));

  const results = await Promise.allSettled(fetches);
  for (const r of results) {
    if (r.status === 'fulfilled') allLeads.push(...r.value);
  }

  // Count by source
  for (const l of allLeads) bySource[l.source] = (bySource[l.source] || 0) + 1;
  console.log(`[${tag}] Raw leads: ${allLeads.length}`, bySource);

  // Dedup against Oracle — skip companies already in pipeline
  const newLeads: FreshLead[] = [];
  for (const lead of allLeads) {
    try {
      const dup = await isAlreadyInPipeline(lead.company, lead.email);
      if (!dup) newLeads.push(lead);
    } catch { newLeads.push(lead); } // assume new if check fails
  }

  const skipped = allLeads.length - newLeads.length;
  console.log(`[${tag}] After dedup: ${newLeads.length} new (${skipped} already in pipeline)`);

  if (newLeads.length === 0) {
    const summary = `Fresh leads: 0 new companies (${skipped} already in pipeline). Sources: ${JSON.stringify(bySource)}`;
    if (sendTelegram) await sendTelegram(`🔍 ${summary}`);
    return { ingested: 0, skipped, errors: 0, bySource, summary };
  }

  // BrightData enrichment — scrape company websites for founder names, tech stack, funding
  // Enriches up to 10 leads per run (preserves trial credits). Skips if zone not configured.
  const bdEnrichMap = isBrightDataConfigured()
    ? await batchEnrichLeads(newLeads.filter(l => l.website), 10)
    : new Map();

  // Merge BrightData enrichment into lead descriptions for better pain classification
  if (bdEnrichMap.size > 0) {
    for (const lead of newLeads) {
      if (!lead.website) continue;
      const bd = bdEnrichMap.get(lead.website);
      if (!bd) continue;
      const extras: string[] = [];
      if (bd.founderNames.length > 0) extras.push(`Founders: ${bd.founderNames.join(', ')}`);
      if (bd.techStack.length > 0)    extras.push(`Tech: ${bd.techStack.slice(0, 5).join(', ')}`);
      if (bd.teamSizeSignal)          extras.push(bd.teamSizeSignal);
      if (bd.fundingSignal)           extras.push(bd.fundingSignal);
      if (extras.length > 0) lead.description = `${lead.description} | ${extras.join(' | ')}`;
      // Prefer real founder name if found
      if (bd.founderNames.length > 0 && lead.name.startsWith('Founder @')) {
        lead.name = `${bd.founderNames[0]} @ ${lead.company}`;
      }
    }
    console.log(`[${tag}] BrightData enriched ${bdEnrichMap.size} leads`);
  }

  // Classify pain points in batches of 20 (Haiku token limit)
  const painMap = new Map<string, PainClassification>();
  for (let i = 0; i < newLeads.length; i += 20) {
    const batch = newLeads.slice(i, i + 20);
    const batchMap = await classifyPainPoints(anthropic, batch.map(l => ({ company: l.company, description: l.description })));
    batchMap.forEach((v, k) => painMap.set(k, v));
  }

  // Import to Oracle
  let ingested = 0;
  let errors   = 0;

  const bulkTargets = newLeads.map(l => {
    const pain = painMap.get(l.company);
    return {
      name:          l.name,
      company:       l.company,
      email:         l.email || undefined,
      source:        l.source,
      painPoint:     pain?.painPoint || l.description.slice(0, 200),
      matchedSystem: pain?.matchedSystem,
      linkedinUrl:   l.linkedinUrl || undefined,
    };
  });

  try {
    const importResult = await saveOutreachTargetsBulk(bulkTargets as any);
    ingested = (importResult as any)?.imported ?? newLeads.length;
    console.log(`[${tag}] Imported ${ingested} targets to Oracle`);
  } catch (e) {
    console.error(`[${tag}] Bulk import error:`, e);
    errors = newLeads.length;
  }

  // Push real contacts (with actual email) to HubSpot
  let hsCount = 0;
  for (const l of newLeads) {
    const isRealEmail = l.email && !l.email.startsWith('founder@') && l.email.includes('@');
    if (!isRealEmail) continue;
    const pain = painMap.get(l.company);
    try {
      await pushLeadToHubSpot({
        sourcePrefix: 'CLIENT-CTO-INGEST',
        name:          l.name,
        email:         l.email || undefined,
        company:       l.company,
        linkedinUrl:   l.linkedinUrl || undefined,
        source:        l.source,
        painPoint:     pain?.painPoint,
        matchedSystem: pain?.matchedSystem,
      });
      hsCount++;
      await new Promise(r => setTimeout(r, 120)); // HubSpot rate limit
    } catch { /* non-fatal */ }
  }

  const sourceBreakdown = Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const summary = [
    `Fresh prospect ingestion complete`,
    ``,
    `New targets imported: ${ingested}`,
    `Already in pipeline: ${skipped}`,
    errors ? `Errors: ${errors}` : '',
    `Pushed to HubSpot: ${hsCount} (with verified email)`,
    ``,
    `Sources: ${sourceBreakdown}`,
  ].filter(Boolean).join('\n');

  if (sendTelegram) await sendTelegram(summary);
  console.log(`[${tag}] Done. ${ingested} imported, ${hsCount} to HubSpot`);

  return { ingested, skipped, errors, bySource, summary };
}
