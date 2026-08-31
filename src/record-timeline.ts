/**
 * Record timeline — the history half of the CRM record page.
 *
 * Elena chose history-first (31 Aug 2026), which is the HubSpot instinct: when
 * you open a record you are picking up a thread, and the first question is
 * always "what has already happened with this one?" The draft sits below it,
 * because acting without the history is how you send a second cold email to
 * someone who already replied.
 *
 * Assembled entirely from OUR database. It issues no HubSpot call — the events
 * are already mirrored in `crm_event_log` (1,875 rows, 1,475 carrying a
 * hubspot_deal_id), so the page keeps its property of never touching HubSpot
 * while still showing HubSpot-originated history.
 *
 * Three sources, merged and sorted newest-first:
 *   crm_event_log  — the record's life in the pipeline, joined on hubspot_deal_id
 *   outreach_log   — what was actually emailed, joined via outreach_targets.email
 *   daily_queue    — her own actions on this record (queued, worked, skipped)
 */
import oracledb from 'oracledb';
import { getPoolConnection } from './database';

export interface TimelineEvent {
  at: string;
  kind: string;
  title: string;
  detail?: string | undefined;
  source: 'pipeline' | 'email' | 'queue';
}

const FETCH_BODY = { REPLY_SNIPPET: { type: oracledb.STRING } };

function rowsOf(res: oracledb.Result<unknown>): Record<string, unknown>[] {
  return (res.rows as Record<string, unknown>[]) || [];
}

/**
 * Everything known about one queue record, newest first.
 *
 * `dealId` and `email` are both optional because the two lanes carry different
 * identifiers: hiring records always have a HubSpot deal, client records are
 * keyed by the address the draft is addressed to. Whichever is present is used;
 * a record with neither simply returns its own queue history rather than failing.
 */
export async function getRecordTimeline(input: {
  queueId: string;
  dealId?: string | undefined;
  email?: string | undefined;
}): Promise<TimelineEvent[]> {
  const connection = await getPoolConnection();
  const events: TimelineEvent[] = [];
  try {
    // 1. Pipeline events mirrored from HubSpot.
    if (input.dealId) {
      const res = await connection.execute(
        `SELECT event_type, stream, source, status,
                TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS at
           FROM crm_event_log
          WHERE hubspot_deal_id = :d
          ORDER BY created_at DESC
          FETCH FIRST 40 ROWS ONLY`,
        { d: input.dealId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      for (const r of rowsOf(res)) {
        events.push({
          at: String(r.AT ?? ''),
          kind: String(r.EVENT_TYPE ?? 'event'),
          title: `${String(r.EVENT_TYPE ?? 'event')} · ${String(r.STREAM ?? '')}`.trim(),
          detail: [r.SOURCE, r.STATUS].filter(Boolean).map(String).join(' · ') || undefined,
          source: 'pipeline',
        });
      }
    }

    // 2. What was actually emailed. outreach_log keys on outreach_targets, not on
    //    the deal, so the address is the only reliable bridge for client records.
    if (input.email) {
      const res = await connection.execute(
        `SELECT l.subject, l.status, l.opened, l.replied, l.reply_snippet,
                TO_CHAR(l.sent_at,'YYYY-MM-DD HH24:MI') AS at
           FROM outreach_log l
           JOIN outreach_targets t ON t.id = l.target_id
          WHERE LOWER(t.email) = LOWER(:e)
          ORDER BY l.sent_at DESC
          FETCH FIRST 25 ROWS ONLY`,
        { e: input.email },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: FETCH_BODY },
      );
      for (const r of rowsOf(res)) {
        const bits = [String(r.STATUS ?? '')];
        if (Number(r.OPENED) === 1) bits.push('opened');
        if (Number(r.REPLIED) === 1) bits.push('REPLIED');
        events.push({
          at: String(r.AT ?? ''),
          kind: 'email',
          title: String(r.SUBJECT ?? '(no subject)').slice(0, 120),
          detail: [bits.filter(Boolean).join(' · '), r.REPLY_SNIPPET ? String(r.REPLY_SNIPPET).slice(0, 200) : '']
            .filter(Boolean).join(' — ') || undefined,
          source: 'email',
        });
      }
    }

    // 3. Her own actions on this record.
    const own = await connection.execute(
      `SELECT status,
              TO_CHAR(created_at,'YYYY-MM-DD HH24:MI') AS created_at,
              TO_CHAR(acted_at,'YYYY-MM-DD HH24:MI')   AS acted_at
         FROM daily_queue WHERE id = HEXTORAW(:id)`,
      { id: input.queueId.replace(/-/g, '') },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    for (const r of rowsOf(own)) {
      if (r.ACTED_AT) {
        events.push({
          at: String(r.ACTED_AT),
          kind: String(r.STATUS ?? 'acted'),
          title: `You marked this ${String(r.STATUS ?? '')}`,
          source: 'queue',
        });
      }
      if (r.CREATED_AT) {
        events.push({ at: String(r.CREATED_AT), kind: 'queued', title: 'Added to your queue', source: 'queue' });
      }
    }

    return events.sort((a, b) => b.at.localeCompare(a.at));
  } finally {
    await connection.close();
  }
}
