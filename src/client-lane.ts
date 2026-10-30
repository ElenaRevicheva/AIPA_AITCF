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
import { getPoolConnection } from './database';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTREACH_REGISTRY = path.join(REPO_ROOT, 'docs/selling/outreach-registry.json');
const RESEND_LEDGER = path.join(REPO_ROOT, 'data/resend-ledger.json');
const CONFIRM_BASE = 'https://webhook.aideazz.xyz/cto/go/outreach-email';

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
 * 30 Oct 2026 (Elena: "the pipe fresh, without dead skeletons"): the lane is now the CLIENT
 * deals in HubSpot "I Act TODAY" — the same rule as the hiring lane. Before, it was the
 * registry's top 40 by score minus the Resend ledger, so every prospect reached by WhatsApp,
 * HubSpot email or Make came back as a fresh card: all 25 cards served were deals already in
 * "⏳ Sent — passive wait", two of them twice. HubSpot is READ ONLY here.
 */
const HS = 'https://api.hubapi.com';
const ACT_TODAY = 'qualifiedtobuy';

/** id → dealname of every CLIENT deal in I Act TODAY. Throws on any HubSpot failure, so a
 *  bad read can never empty her lane (fail-closed: nothing changes that run). */
async function clientDealsActToday(): Promise<Map<string, string>> {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error('HUBSPOT_API_KEY missing');
  const deals = new Map<string, string>();
  let after: string | undefined;
  do {
    const r = await fetch(`${HS}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: 'dealstage', operator: 'EQ', value: ACT_TODAY },
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT' },
        ] }],
        properties: ['dealname'], limit: 100, ...(after ? { after } : {}),
      }),
    });
    if (!r.ok) throw new Error(`HubSpot search ${r.status}`);
    const page = await r.json() as { results?: { id: string; properties: { dealname?: string } }[]; paging?: { next?: { after?: string } } };
    // The token search also matches "(not a client…" in a PARTNER deal's name — keep [CLIENT-*] only.
    for (const d of page.results || []) {
      if (/^\[CLIENT-/.test(d.properties.dealname || '')) deals.set(String(d.id), d.properties.dealname || '');
    }
    after = page.paging?.next?.after;
  } while (after);
  return deals;
}

/** Machine moves only — acted_at stays empty, so her own Skip / Did it is never touched. */
async function setLaneStatus(keys: string[], from: string, to: string): Promise<number> {
  if (!keys.length) return 0;
  const c = await getPoolConnection();
  try {
    let n = 0;
    for (const k of keys) {
      const r = await c.execute(
        `UPDATE daily_queue SET status = :to_status, updated_at = CURRENT_TIMESTAMP
          WHERE lane = 'client' AND external_key = :ext_key AND status = :from_status AND acted_at IS NULL`,
        { to_status: to, ext_key: k, from_status: from }, { autoCommit: false });
      n += r.rowsAffected || 0;
    }
    await c.commit();
    return n;
  } finally {
    await c.close();
  }
}

/**
 * Refresh the client lane. Safe to run repeatedly.
 *
 * Returns what it did so the caller can log a result line rather than a "ran"
 * line — a sync that queued zero and closed zero should be visible as such.
 */
export async function syncClientLane(): Promise<{ queued: number; closed: number; skipped: number; actToday: number }> {
  const registry = readJson<Record<string, RegistryEntry>>(OUTREACH_REGISTRY, {});
  const sent = sentSlugs();
  const keep = await clientDealsActToday();

  // Close anything that has been emailed since the last sync, so a sent prospect
  // cannot reappear as an open card.
  let closed = 0;
  for (const item of await getQueue('client', 500)) {
    if (sent.has(item.externalKey)) {
      await setQueueStatus(item.id, 'done');
      closed++;
    }
  }

  // One card per deal: its best unsent registry draft, or the deal alone (no draft yet).
  const best = new Map<string, [string, RegistryEntry]>();
  for (const [slug, e] of Object.entries(registry)) {
    const id = String(e.dealId || '');
    if (!keep.has(id) || !e.email || !(e.emailDraft || e.draft) || sent.has(slug)) continue;
    const cur = best.get(id);
    if (!cur || (e.score ?? 0) > (cur[1].score ?? 0)) best.set(id, [slug, e]);
  }
  const wanted = new Set<string>();
  for (const id of keep.keys()) wanted.add(best.get(id)?.[0] || `deal:${id}`);

  // A card a MACHINE skipped earlier whose deal is back in I Act TODAY returns.
  await setLaneStatus([...wanted], 'skipped', 'new');

  let queued = 0;
  for (const [id, name] of keep) {
    const hit = best.get(id);
    const company = (name.replace(/^\[[^\]]+\]\s*/, '').split(' — ')[0] || '').trim() || name;
    if (hit) {
      const [slug, e] = hit;
      const body = readDraftBody(e.emailDraft || e.draft || '');
      await upsertQueueItem({
        lane: 'client',
        externalKey: slug,
        title: e.company?.trim() || company,
        company: e.email || '',
        actionUrl: `${CONFIRM_BASE}/${slug}`,
        draft: body.text,
        // These are per-prospect drafts written from that prospect's own audit,
        // not a template with the name swapped — but only if the file actually
        // resolved. A missing file is reported, never passed off as a draft.
        draftTailored: Boolean(body.text) && !body.reason,
        draftReason: body.reason,
        score: e.score,
        hubspotDealId: id,
      });
    } else {
      await upsertQueueItem({
        lane: 'client', externalKey: `deal:${id}`, title: company, company: '',
        draft: '', draftTailored: false, draftReason: 'no unsent draft — open the HubSpot record',
        hubspotDealId: id,
      });
    }
    queued++;
  }

  // Everything else still open leaves the lane: deal not in I Act TODAY, no deal at all, or a
  // second draft for a deal that already has a card. Skipped, never deleted; undo file kept.
  const stale = (await getQueue('client', 500)).map(i => i.externalKey).filter(k => !wanted.has(k));
  let skipped = 0;
  if (stale.length) {
    const dir = path.join(process.env.HOME || '.', '_session-backups');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `queue-client-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
      JSON.stringify({ at: new Date().toISOString(), lane: 'client', from: 'new', to: 'skipped', external_keys: stale }, null, 1));
    skipped = await setLaneStatus(stale, 'new', 'skipped');
  }

  return { queued, closed, skipped, actToday: keep.size };
}

/** Run at boot and hourly (30 Oct: was 6h — her HubSpot moves should reach the lane the same hour). Never throws into the caller. */
export function startClientLaneSync(): void {
  const run = async (): Promise<void> => {
    try {
      const r = await syncClientLane();
      console.log(`[client-lane] I Act TODAY ${r.actToday} client deals · queued ${r.queued} · closed ${r.closed} already-sent · skipped ${r.skipped} not in I Act TODAY`);
    } catch (e) {
      console.warn('[client-lane] sync failed:', (e as Error).message?.slice(0, 140));
    }
  };
  setTimeout(run, 20_000);
  setInterval(run, 60 * 60 * 1000);
}
