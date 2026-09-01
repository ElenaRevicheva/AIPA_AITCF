/**
 * Close queue rows Elena has already decided on, using VJH's judge feedback.
 *
 * Why (1 Sep 2026): `/queue/` reads its own table and had no idea she had already
 * rejected a job in HubSpot. It was offering her "Airtable/Zapier Automation
 * Consultant @ Nory Co" as the top card while her own note on that deal read
 * "i do not have zapier and airtable". A queue that re-offers what you turned
 * down is worse than no queue: it teaches you to stop trusting the top row.
 *
 * The classification already exists. `judge_feedback_sync.py` reads her HubSpot
 * notes and screenshots hourly and writes positives/negatives into
 * `judge_feedback.json`, which the LLM judge already consumes. This reuses that
 * output rather than inventing a second opinion — one source for "what did she
 * decide", used by both the judge and the queue.
 *
 * Semantics, deliberately different for the two lists:
 *   negatives → 'skipped'  she looked and said no
 *   positives → 'done'     she applied; it is out of the queue, not rejected
 *
 * Only ever moves rows OUT of 'new'. It never resurrects, never edits content,
 * and never writes to HubSpot.
 */
import fs from 'fs';
import { getQueue, setQueueStatus } from './daily-queue';

const FEEDBACK_PATH = process.env.VJH_JUDGE_FEEDBACK
  || '/home/ubuntu/VibeJobHunterAIPA_AIMCF/autonomous_data/judge_feedback.json';

/** Strip to comparable text: lowercase, collapse punctuation and whitespace. */
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A feedback line looks like "Title @ Company — her reason: ...".
 * Keep the part before the reason; the reason is prose and would cause false hits.
 */
function subject(line: string): string {
  return norm(String(line).split('— her reason:')[0] || '');
}

/**
 * Does this feedback entry refer to this queue row?
 *
 * Requires the row's TITLE to appear in the feedback subject, and — when the row
 * carries a company — the company too. Title alone is not enough: "Executive
 * Assistant" and "Forward Deployed Engineer" both recur across employers, and a
 * loose match would silently bury a live job she never saw.
 */
function refersTo(feedbackSubject: string, title: string, company: string): boolean {
  const t = norm(title);
  if (t.length < 8) return false;
  // Compare on a prefix: queue titles are truncated differently from VJH's.
  const probe = t.slice(0, Math.min(t.length, 34));
  if (!feedbackSubject.includes(probe)) return false;
  const c = norm(company);
  if (!c || c.length < 3) return true;
  return feedbackSubject.includes(c.slice(0, Math.min(c.length, 18)));
}

export interface FeedbackSyncResult {
  skipped: number;
  done: number;
  scanned: number;
  lines: string[];
  note?: string | undefined;
}

export async function syncJudgeFeedbackToQueue(): Promise<FeedbackSyncResult> {
  const res: FeedbackSyncResult = { skipped: 0, done: 0, scanned: 0, lines: [] };
  let raw: { positives?: unknown[]; negatives?: unknown[] };
  try {
    raw = JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8')) as typeof raw;
  } catch (e) {
    res.note = `judge_feedback.json unreadable (${(e as Error).message.slice(0, 60)}) — nothing changed`;
    return res;
  }
  const negatives = (raw.negatives || []).map(x => subject(String(x))).filter(Boolean);
  const positives = (raw.positives || []).map(x => subject(String(x))).filter(Boolean);

  const open = await getQueue('hiring', 500);
  res.scanned = open.length;

  for (const item of open) {
    if (negatives.some(f => refersTo(f, item.title, item.company))) {
      await setQueueStatus(item.id, 'skipped');
      res.skipped++;
      res.lines.push(`skipped  ${item.title.slice(0, 46)} @ ${item.company.slice(0, 20)}`);
      continue;
    }
    if (positives.some(f => refersTo(f, item.title, item.company))) {
      await setQueueStatus(item.id, 'done');
      res.done++;
      res.lines.push(`done     ${item.title.slice(0, 46)} @ ${item.company.slice(0, 20)}`);
    }
  }
  return res;
}

/** Run at boot and hourly — the same cadence VJH refreshes the feedback file. */
export function startFeedbackSync(): void {
  const run = async (): Promise<void> => {
    try {
      const r = await syncJudgeFeedbackToQueue();
      console.log(
        `[queue-feedback] scanned ${r.scanned} open, closed ${r.skipped} rejected + ${r.done} applied` +
          (r.note ? ` — ${r.note}` : ''),
      );
    } catch (e) {
      console.warn('[queue-feedback] failed:', (e as Error).message?.slice(0, 140));
    }
  };
  setTimeout(run, 35_000);
  setInterval(run, 60 * 60 * 1000);
}
