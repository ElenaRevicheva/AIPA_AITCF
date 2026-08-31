/**
 * Client lane feeder for the daily queue.
 *
 * The drafts already exist: `docs/selling/outreach-registry.json` holds ~371
 * per-prospect outreach emails with a company, a score and a HubSpot deal id.
 * They were reachable only by knowing a slug, so in practice they were reachable
 * by nobody. This surfaces the best unsent one as a card.
 *
 * Two safety properties, both load-bearing:
 *
 * 1. **Never queue something already emailed.** `data/resend-ledger.json` is the
 *    record of what actually went out, keyed by slug. Anything in it is excluded
 *    on the way in, and any queue row whose slug has since been sent is closed on
 *    the next sync. A queue that re-offers a prospect she already contacted is
 *    worse than an empty queue — it produces a duplicate cold email to a real
 *    person.
 * 2. **The card links to the CONFIRM page, never to a send.**
 *    `GET /go/outreach-email/:slug` renders the draft with a separate send path;
 *    it does not dispatch. Nothing on the queue page can send an email.
 */
import fs from 'fs';
import path from 'path';
import { upsertQueueItem, setQueueStatus, getQueue } from './daily-queue';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTREACH_REGISTRY = path.join(REPO_ROOT, 'docs/selling/outreach-registry.json');
const RESEND_LEDGER = path.join(REPO_ROOT, 'data/resend-ledger.json');
const CONFIRM_BASE = 'https://webhook.aideazz.xyz/cto/go/outreach-email';

/** How many to keep queued. The card shows one; the rest are the bench. */
const QUEUE_DEPTH = 40;

interface RegistryEntry {
  company?: string;
  email?: string;
  draft?: string;
  emailDraft?: string;
  dealId?: string;
  score?: number;
}

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Registry `draft`/`emailDraft` fields hold a repo-relative PATH, not the letter.
 * Resolve it to the actual text — a card showing "docs/selling/drafts/x.txt" is
 * worse than an empty one, because it looks like a draft until you read it.
 */
function readDraftBody(ref: string): { text: string; reason?: string } {
  const val = (ref || '').trim();
  if (!val) return { text: '', reason: 'no draft in registry' };
  // Anything with a newline is already the body; a bare path never is.
  if (val.includes('\n')) return { text: val };
  const abs = path.isAbsolute(val) ? val : path.join(REPO_ROOT, val);
  try {
    const body = fs.readFileSync(abs, 'utf8').trim();
    return body ? { text: body } : { text: '', reason: 'draft file is empty' };
  } catch {
    return { text: '', reason: `draft file missing: ${path.basename(val)}` };
  }
}

/** Slugs that have actually been emailed, from the send ledger. */
function sentSlugs(): Set<string> {
  const ledger = readJson<Record<string, { slug?: string }>>(RESEND_LEDGER, {});
  return new Set(Object.values(ledger).map(v => v.slug).filter((s): s is string => Boolean(s)));
}

/**
 * Refresh the client lane. Safe to run repeatedly.
 *
 * Returns what it did so the caller can log a result line rather than a "ran"
 * line — a sync that queued zero and closed zero should be visible as such.
 */
export async function syncClientLane(): Promise<{ queued: number; closed: number; pool: number }> {
  const registry = readJson<Record<string, RegistryEntry>>(OUTREACH_REGISTRY, {});
  const sent = sentSlugs();

  // Close anything that has been emailed since the last sync, so a sent prospect
  // cannot reappear as an open card.
  let closed = 0;
  for (const item of await getQueue('client', 500)) {
    if (sent.has(item.externalKey)) {
      await setQueueStatus(item.id, 'done');
      closed++;
    }
  }

  const candidates = Object.entries(registry)
    .filter(([slug, e]) => Boolean(e.email) && Boolean(e.emailDraft || e.draft) && !sent.has(slug))
    .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0));

  let queued = 0;
  for (const [slug, e] of candidates.slice(0, QUEUE_DEPTH)) {
    const body = readDraftBody(e.emailDraft || e.draft || '');
    await upsertQueueItem({
      lane: 'client',
      externalKey: slug,
      title: e.company?.trim() || slug,
      company: e.email || '',
      actionUrl: `${CONFIRM_BASE}/${slug}`,
      draft: body.text,
      // These are per-prospect drafts written from that prospect's own audit,
      // not a template with the name swapped — but only if the file actually
      // resolved. A missing file is reported, never passed off as a draft.
      draftTailored: Boolean(body.text) && !body.reason,
      draftReason: body.reason,
      score: e.score,
      hubspotDealId: e.dealId,
    });
    queued++;
  }

  return { queued, closed, pool: candidates.length };
}

/** Run at boot and every 6h. Never throws into the caller. */
export function startClientLaneSync(): void {
  const run = async (): Promise<void> => {
    try {
      const r = await syncClientLane();
      console.log(`[client-lane] queued ${r.queued}, closed ${r.closed} already-sent, pool ${r.pool} unsent`);
    } catch (e) {
      console.warn('[client-lane] sync failed:', (e as Error).message?.slice(0, 140));
    }
  };
  setTimeout(run, 20_000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
