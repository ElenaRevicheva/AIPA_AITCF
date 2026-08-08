/**
 * Live quota gate for Hunter.io.
 *
 * Why this exists: the old guard (prospect-ingest) counted calls in memory, so it
 * reset on every restart and only protected one lane. The two lanes that actually
 * spent — Places ingest and the daily outreach verify — had no guard at all, and
 * drained the month's credits into leads nobody emailed.
 *
 * Hunter's /v2/account endpoint does NOT consume credits (verified Aug 8 2026:
 * two account reads either side of six domain-searches moved the counter by the
 * searches only). So the real balance is authoritative — no local counter to drift.
 *
 * RESERVE: automated lanes stop when the balance drops to HUNTER_SALES_RESERVE.
 * That floor belongs to the manual client play (scripts/hunter-owner-sweep.cjs),
 * which is the only lane that finds owner contacts for staged deals.
 */

const ACCOUNT_URL = 'https://api.hunter.io/v2/account';
const TTL_MS = 5 * 60_000;

/** Credits held back for the manual client play — automated lanes may not touch these. */
export const SALES_RESERVE = Math.max(0, Number(process.env.HUNTER_SALES_RESERVE || 25));

export type HunterLane = 'auto' | 'sales';

let cache: { at: number; remaining: number } | null = null;

/** Live remaining credits, 5-min cached. null = unknown (no key, or API unreachable). */
export async function hunterRemaining(force = false): Promise<number | null> {
  const apiKey = process.env.HUNTER_API_KEY?.trim();
  if (!apiKey) return null;
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.remaining;
  try {
    const r = await fetch(`${ACCOUNT_URL}?api_key=${apiKey}`);
    if (!r.ok) {
      console.error('[hunter-budget] account HTTP', r.status);
      return cache?.remaining ?? null;
    }
    const data = (await r.json()) as {
      data: { requests: { credits: { remaining: number } } };
    };
    const remaining = Number(data.data.requests.credits.remaining);
    if (!Number.isFinite(remaining)) return cache?.remaining ?? null;
    cache = { at: Date.now(), remaining };
    return remaining;
  } catch (e) {
    console.error('[hunter-budget] account error:', e);
    return cache?.remaining ?? null;
  }
}

/**
 * May `lane` spend `cost` credits right now?
 * Fails CLOSED for automated lanes when the balance is unknown — an outage must
 * never become an excuse to spend the sales reserve.
 */
export async function canSpendHunter(
  lane: HunterLane,
  cost = 1,
  tag = 'hunter'
): Promise<boolean> {
  const remaining = await hunterRemaining();
  if (remaining === null) {
    if (lane === 'auto') {
      console.log(`[${tag}] hunter: balance unknown — automated lane holds off (fail-closed)`);
      return false;
    }
    return true; // sales lane proceeds; Hunter itself will refuse if truly empty
  }
  const floor = lane === 'auto' ? SALES_RESERVE : 0;
  const spendable = remaining - floor;
  if (spendable < cost) {
    console.log(
      `[${tag}] hunter: SKIP — ${remaining} credits left, ${floor} reserved for client outreach ` +
        `(need ${cost})`
    );
    return false;
  }
  return true;
}

/** Record a spend locally so a burst inside one run can't outrun the 5-min cache. */
export function noteHunterSpend(n = 1): void {
  if (cache) cache.remaining = Math.max(0, cache.remaining - n);
}
