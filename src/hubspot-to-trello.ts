/**
 * hubspot-to-trello.ts
 *
 * One-way trigger: urgent HubSpot deals → Trello card on the CURRENT MONTH
 * "Kira {Mes} 2026" board, in "Just for Today / 1st Things 1st" column.
 *
 * Triggers on:
 *   - Stage `qualifiedtobuy` (🔥 I Act TODAY)
 *   - Stage `contractsent`   (💬 They replied — I act)
 *
 * Idempotent: card description embeds `[hs:{dealId}]` tag — we search for it
 * before creating, so cycle re-runs / backfills never duplicate.
 *
 * Surgical + additive: does NOT modify existing trello-voice.ts or
 * trello-kanban.ts functionality. New module, isolated.
 *
 * Auto-detects current month → next month's board chosen automatically when
 * date rolls over (no manual config change needed).
 */

const TRELLO_KEY = (): string => (process.env.TRELLO_API_KEY || "").trim();
const TRELLO_TOKEN = (): string => (process.env.TRELLO_TOKEN || "").trim();
const HUBSPOT_PORTAL = "51409153"; // Elena's HubSpot portal ID (from URL pattern)

// Spanish month names matching Elena's board naming convention "Kira {Mes} {Year}"
const SPANISH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

interface TrelloBoard { id: string; name: string }
interface TrelloList  { id: string; name: string }
interface TrelloCard  { id: string; name: string; desc: string; shortUrl?: string }

/** Compute the expected board name for current calendar date in Panama timezone. */
export function currentMonthBoardName(now: Date = new Date()): string {
  // Panama is UTC-5 (no DST). Use local month/year of Panama.
  const panamaOffsetMs = -5 * 60 * 60 * 1000;
  const panamaNow = new Date(now.getTime() + panamaOffsetMs - now.getTimezoneOffset() * 60 * 1000);
  const month = SPANISH_MONTHS[panamaNow.getUTCMonth()];
  const year = panamaNow.getUTCFullYear();
  return `Kira ${month} ${year}`;
}

async function findCurrentMonthBoard(): Promise<TrelloBoard | null> {
  const key = TRELLO_KEY(); const tok = TRELLO_TOKEN();
  if (!key || !tok) return null;
  const url = `https://api.trello.com/1/members/me/boards?key=${key}&token=${tok}&fields=name`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const boards = (await r.json()) as TrelloBoard[];
    const target = currentMonthBoardName();
    return boards.find((b) => b.name === target) || null;
  } catch { return null; }
}

async function findTodayList(boardId: string): Promise<TrelloList | null> {
  const key = TRELLO_KEY(); const tok = TRELLO_TOKEN();
  const url = `https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${tok}&fields=name`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const lists = (await r.json()) as TrelloList[];
    // Prefer the "Just for Today / 1st Things 1st" column. Fall back to any
    // column whose name matches "today" or "today/flow". Final fallback: first list.
    const preferred = lists.find((l) => /just for today|1st things|today's|today/i.test(l.name));
    return preferred || lists[0] || null;
  } catch { return null; }
}

async function findExistingCardForDeal(boardId: string, dealId: string): Promise<boolean> {
  const key = TRELLO_KEY(); const tok = TRELLO_TOKEN();
  const url = `https://api.trello.com/1/boards/${boardId}/cards?key=${key}&token=${tok}&fields=name,desc`;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const cards = (await r.json()) as TrelloCard[];
    const tag = `[hs:${dealId}]`;
    return cards.some((c) => (c.desc || "").includes(tag));
  } catch { return false; }
}

export interface HubSpotToTrelloOpts {
  dealId: string;
  dealName: string;
  dealStage: string;          // qualifiedtobuy | contractsent
  suggestedAction?: string | undefined;   // optional AI suggestion to put in card body
}

/** Stages that warrant a Trello "today" card. */
const URGENT_STAGES = new Set(["qualifiedtobuy", "contractsent"]);

/**
 * Create a Trello card on the current-month "Kira {Mes}" board for an urgent
 * HubSpot deal. Fire-and-forget pattern — caller should NOT await this in a
 * critical path (use .catch logging instead).
 */
export async function pushDealToTrelloToday(opts: HubSpotToTrelloOpts): Promise<void> {
  if (!URGENT_STAGES.has(opts.dealStage)) {
    return; // Not an urgent stage — silently skip
  }
  const key = TRELLO_KEY(); const tok = TRELLO_TOKEN();
  if (!key || !tok) {
    console.warn("[HubSpot→Trello] TRELLO_API_KEY/TOKEN not set — skipping");
    return;
  }

  try {
    const board = await findCurrentMonthBoard();
    if (!board) {
      console.warn(`[HubSpot→Trello] Current month board "${currentMonthBoardName()}" not found — skipping`);
      return;
    }

    if (await findExistingCardForDeal(board.id, opts.dealId)) {
      // Idempotent: already exists on this month's board
      return;
    }

    const list = await findTodayList(board.id);
    if (!list) {
      console.warn(`[HubSpot→Trello] No suitable list on "${board.name}"`);
      return;
    }

    const emoji = opts.dealStage === "contractsent" ? "💬" : "🔥";
    const cardName = `${emoji} ${opts.dealName}`.slice(0, 250);
    const hubspotUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/record/0-3/${opts.dealId}`;
    const cardDesc = [
      opts.suggestedAction ? `**AI suggested action:** ${opts.suggestedAction}` : "",
      "",
      `**HubSpot deal:** ${hubspotUrl}`,
      `**Stage:** ${opts.dealStage === "contractsent" ? "💬 They replied — I act" : "🔥 I Act TODAY"}`,
      "",
      `_Created automatically from HubSpot — do not delete the tag below._`,
      `[hs:${opts.dealId}]`,
    ].filter(Boolean).join("\n");

    const createUrl = "https://api.trello.com/1/cards"
      + `?key=${key}&token=${tok}`
      + `&idList=${list.id}`
      + `&name=${encodeURIComponent(cardName)}`
      + `&desc=${encodeURIComponent(cardDesc)}`
      + `&pos=top`;

    const r = await fetch(createUrl, { method: "POST" });
    if (r.ok) {
      const card = (await r.json()) as TrelloCard;
      console.log(`[HubSpot→Trello] ✅ Card on "${board.name}" → ${card.shortUrl || card.id}`);
    } else {
      const err = await r.text();
      console.warn(`[HubSpot→Trello] Card create failed (${r.status}): ${err.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[HubSpot→Trello] non-fatal error:`, (e as Error).message?.slice(0, 200));
  }
}

/**
 * Backfill: scan HubSpot for all deals currently in urgent stages and create
 * Trello cards for any that don't already exist on the current month's board.
 * Idempotent — safe to run multiple times.
 */
export async function backfillUrgentDealsToTrello(): Promise<{ created: number; skipped: number; errors: number }> {
  const stats = { created: 0, skipped: 0, errors: 0 };
  const hsKey = (process.env.HUBSPOT_API_KEY || "").trim();
  if (!hsKey) {
    console.warn("[HubSpot→Trello backfill] HUBSPOT_API_KEY not set");
    return stats;
  }

  for (const stage of ["qualifiedtobuy", "contractsent"]) {
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "EQ", value: stage }] }],
        properties: ["dealname", "dealstage"],
        limit: 100,
      };
      if (after) body.after = after;

      const r = await fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hsKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        stats.errors++;
        console.warn(`[backfill] HubSpot search failed (${r.status}) for stage ${stage}`);
        break;
      }
      const data = await r.json() as {
        results: Array<{ id: string; properties: { dealname: string; dealstage: string } }>;
        paging?: { next?: { after?: string } };
      };

      for (const deal of (data.results || [])) {
        try {
          // pushDealToTrelloToday handles its own idempotency check
          const board = await findCurrentMonthBoard();
          if (!board) { stats.errors++; continue; }
          const exists = await findExistingCardForDeal(board.id, deal.id);
          if (exists) { stats.skipped++; continue; }
          await pushDealToTrelloToday({
            dealId: deal.id,
            dealName: deal.properties.dealname,
            dealStage: deal.properties.dealstage,
            suggestedAction: "Review HubSpot deal notes for full context and AI analysis.",
          });
          stats.created++;
          await new Promise((res) => setTimeout(res, 350)); // gentle rate-limit
        } catch (err) {
          stats.errors++;
          console.warn(`[backfill] deal ${deal.id} error:`, (err as Error).message?.slice(0, 100));
        }
      }
      after = data.paging?.next?.after;
    } while (after);
  }
  console.log(`[HubSpot→Trello backfill] ${stats.created} created, ${stats.skipped} skipped, ${stats.errors} errors`);
  return stats;
}
