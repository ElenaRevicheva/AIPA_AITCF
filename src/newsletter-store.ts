/**
 * Newsletter subscriber list — Oracle-backed, double opt-in.
 *
 * Deliberately isolated: its own table, its own module, no reads or writes to
 * business_leads, outreach_targets or anything the concierge and outreach
 * pipelines touch. A newsletter subscriber is not a lead and must never
 * silently become one.
 *
 * Double opt-in is not decoration. A single-opt-in list built from a public form
 * is one bored bot away from a spam-trap address, and a trap hit damages the same
 * sending domain the concierge replies from. Confirmation is what keeps the
 * marketing list from putting transactional mail at risk.
 *
 * oracledb is imported lazily so this module can be required on a machine with no
 * Oracle client (CI, a laptop) without exploding at import time.
 */

import crypto from 'crypto';

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed';

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  source: string | null;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribeToken: string;
}

export interface SubscribeResult {
  /** What the caller should do next — 'confirm_sent' means an opt-in mail is owed. */
  outcome: 'confirm_sent' | 'already_confirmed' | 'resent_confirm';
  email: string;
  confirmToken: string | null;
  unsubscribeToken: string;
}

export interface ListStats {
  confirmed: number;
  pending: number;
  unsubscribed: number;
}

let tableReady = false;

function newToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Normalise before storing so the same human cannot occupy two rows and receive
 * everything twice. The unique constraint only helps if the input is canonical.
 */
export function normalizeEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** Deliberately permissive: reject the obviously broken, let Resend judge the rest. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

async function connect() {
  const { getPoolConnection } = await import('./database');
  return getPoolConnection();
}

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  let connection: any;
  try {
    connection = await connect();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE newsletter_subscribers (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          email VARCHAR2(254) NOT NULL UNIQUE,
          status VARCHAR2(16) DEFAULT ''pending'' NOT NULL,
          confirm_token VARCHAR2(64),
          unsubscribe_token VARCHAR2(64) NOT NULL,
          source VARCHAR2(120),
          created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
          confirmed_at TIMESTAMP,
          unsubscribed_at TIMESTAMP,
          last_sent_at TIMESTAMP,
          send_count NUMBER DEFAULT 0
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await connection.commit();
    tableReady = true;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/**
 * Record a signup and return what the caller owes the subscriber.
 *
 * Re-subscribing while pending reissues the token rather than erroring: the usual
 * cause is a confirmation mail lost to a spam folder, and making that a dead end
 * loses a real subscriber.
 */
export async function subscribe(rawEmail: string, source: string): Promise<SubscribeResult> {
  await ensureTable();
  const email = normalizeEmail(rawEmail);
  const oracledb = (await import('oracledb')).default;

  let connection: any;
  try {
    connection = await connect();

    const existing: any = await connection.execute(
      `SELECT status, unsubscribe_token FROM newsletter_subscribers WHERE email = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.STATUS === 'confirmed') {
        return {
          outcome: 'already_confirmed',
          email,
          confirmToken: null,
          unsubscribeToken: row.UNSUBSCRIBE_TOKEN,
        };
      }
      // pending or previously unsubscribed — reopen with a fresh token.
      const confirmToken = newToken();
      await connection.execute(
        `UPDATE newsletter_subscribers
            SET status = 'pending', confirm_token = :confirmToken,
                unsubscribed_at = NULL, source = :source
          WHERE email = :email`,
        { confirmToken, source, email },
        { autoCommit: true },
      );
      return {
        outcome: 'resent_confirm',
        email,
        confirmToken,
        unsubscribeToken: row.UNSUBSCRIBE_TOKEN,
      };
    }

    const confirmToken = newToken();
    const unsubscribeToken = newToken();
    await connection.execute(
      `INSERT INTO newsletter_subscribers (email, status, confirm_token, unsubscribe_token, source)
       VALUES (:email, 'pending', :confirmToken, :unsubscribeToken, :source)`,
      { email, confirmToken, unsubscribeToken, source },
      { autoCommit: true },
    );
    return { outcome: 'confirm_sent', email, confirmToken, unsubscribeToken };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** Returns the confirmed email, or null when the token is unknown or already spent. */
export async function confirm(token: string): Promise<{ email: string; unsubscribeToken: string } | null> {
  await ensureTable();
  const oracledb = (await import('oracledb')).default;
  let connection: any;
  try {
    connection = await connect();
    const found: any = await connection.execute(
      `SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE confirm_token = :token`,
      { token },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (found.rows.length === 0) return null;

    // Clearing the token makes confirmation single-use, so a forwarded link cannot
    // re-confirm an address its owner has since unsubscribed.
    await connection.execute(
      `UPDATE newsletter_subscribers
          SET status = 'confirmed', confirmed_at = SYSTIMESTAMP, confirm_token = NULL
        WHERE confirm_token = :token`,
      { token },
      { autoCommit: true },
    );
    return { email: found.rows[0].EMAIL, unsubscribeToken: found.rows[0].UNSUBSCRIBE_TOKEN };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/**
 * Unsubscribe keeps the row and flips the status rather than deleting it, so a
 * later import cannot resurrect someone who already asked to be left alone.
 */
export async function unsubscribe(token: string): Promise<string | null> {
  await ensureTable();
  const oracledb = (await import('oracledb')).default;
  let connection: any;
  try {
    connection = await connect();
    const found: any = await connection.execute(
      `SELECT email FROM newsletter_subscribers WHERE unsubscribe_token = :token`,
      { token },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (found.rows.length === 0) return null;
    await connection.execute(
      `UPDATE newsletter_subscribers
          SET status = 'unsubscribed', unsubscribed_at = SYSTIMESTAMP, confirm_token = NULL
        WHERE unsubscribe_token = :token`,
      { token },
      { autoCommit: true },
    );
    return found.rows[0].EMAIL;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

/** The send list. Only 'confirmed' — pending and unsubscribed are never returned. */
export async function listConfirmed(): Promise<Array<{ email: string; unsubscribeToken: string }>> {
  await ensureTable();
  const oracledb = (await import('oracledb')).default;
  let connection: any;
  try {
    connection = await connect();
    const r: any = await connection.execute(
      `SELECT email, unsubscribe_token FROM newsletter_subscribers
        WHERE status = 'confirmed' ORDER BY confirmed_at`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return r.rows.map((row: any) => ({ email: row.EMAIL, unsubscribeToken: row.UNSUBSCRIBE_TOKEN }));
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export async function markSent(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await ensureTable();
  let connection: any;
  try {
    connection = await connect();
    await connection.executeMany(
      `UPDATE newsletter_subscribers
          SET last_sent_at = SYSTIMESTAMP, send_count = NVL(send_count, 0) + 1
        WHERE email = :email`,
      emails.map((email) => ({ email })),
      { autoCommit: true },
    );
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}

export async function stats(): Promise<ListStats> {
  await ensureTable();
  const oracledb = (await import('oracledb')).default;
  let connection: any;
  try {
    connection = await connect();
    const r: any = await connection.execute(
      `SELECT status, COUNT(*) AS n FROM newsletter_subscribers GROUP BY status`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const out: ListStats = { confirmed: 0, pending: 0, unsubscribed: 0 };
    for (const row of r.rows) {
      if (row.STATUS === 'confirmed') out.confirmed = Number(row.N);
      else if (row.STATUS === 'pending') out.pending = Number(row.N);
      else if (row.STATUS === 'unsubscribed') out.unsubscribed = Number(row.N);
    }
    return out;
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}
