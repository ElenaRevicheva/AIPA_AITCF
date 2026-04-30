/**
 * Oracle thin-mode reader for Lambda — no Instant Client required.
 * oracledb v6 thin mode = pure JavaScript, works in Lambda without native libraries.
 *
 * Startup sequence (called once per Lambda cold start):
 *   1. Download wallet folder from S3 → /tmp/wallet/
 *   2. Rewrite sqlnet.ora WALLET_LOCATION to /tmp/wallet (server path won't work in Lambda)
 *   3. Connect via full TNS descriptor from tnsnames.ora (no TNS_ADMIN needed in thin mode)
 *   4. Read diary + tasks from knowledge_base
 *
 * Oracle server is NOT touched — this is a read-only Lambda path.
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const WALLET_LOCAL = '/tmp/oracle-wallet';
// Direct connect string from tnsnames.ora — avoids TNS_ADMIN path dependency
const CONNECT_STRING =
  '(description=(retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)' +
  '(host=adb.us-chicago-1.oraclecloud.com))(connect_data=(service_name=' +
  'g697acccbe4f857_ctoaipadb2025_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))';

let walletReady = false;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadWalletFromS3(): Promise<void> {
  if (walletReady) return;

  const bucket = process.env.ORACLE_WALLET_S3_BUCKET;
  const prefix = process.env.ORACLE_WALLET_S3_PREFIX || 'wallet/';
  if (!bucket) throw new Error('ORACLE_WALLET_S3_BUCKET not set');

  fs.mkdirSync(WALLET_LOCAL, { recursive: true });

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  // List all files in the wallet prefix
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const files = (list.Contents || []).filter(o => o.Key && !o.Key.endsWith('/'));

  for (const obj of files) {
    const key = obj.Key!;
    const filename = path.basename(key);
    const localPath = path.join(WALLET_LOCAL, filename);

    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = await streamToBuffer(res.Body as Readable);
    fs.writeFileSync(localPath, buf);
  }

  // Rewrite sqlnet.ora — replace Oracle server path with Lambda /tmp path
  const sqlnetPath = path.join(WALLET_LOCAL, 'sqlnet.ora');
  if (fs.existsSync(sqlnetPath)) {
    let content = fs.readFileSync(sqlnetPath, 'utf8');
    content = content.replace(/DIRECTORY="[^"]*"/g, `DIRECTORY="${WALLET_LOCAL}"`);
    fs.writeFileSync(sqlnetPath, content, 'utf8');
  }

  walletReady = true;
  console.log(`[oracle-thin] Wallet ready at ${WALLET_LOCAL} (${files.length} files)`);
}

export async function loadKnowledgeFromOracle(
  userIds: number[],
): Promise<string> {
  if (userIds.length === 0) return '';

  await downloadWalletFromS3();

  // Dynamic import — keeps oracledb out of the bundle if SKIP_ORACLE=1
  const oracledb = await import('oracledb');

  // Thin mode — no initOracleClient(), no Instant Client
  oracledb.default.initOracleClient = () => {}; // no-op if called elsewhere
  // oracledb thin mode is the default in v6 when initOracleClient is not called

  const conn = await oracledb.default.getConnection({
    user: process.env.DB_USER || 'ADMIN',
    password: process.env.DB_PASSWORD,
    connectString: CONNECT_STRING,
    walletLocation: WALLET_LOCAL,
    walletPassword: process.env.WALLET_PASSWORD || '',  // '' = no-password wallet (ewallet.p12 with empty pwd)
  });

  try {
    const lines: string[] = ['### Personal context (Oracle knowledge_base)'];

    for (const uid of userIds) {
      // Last 5 diary entries
      const diary = await conn.execute<[string, string]>(
        `SELECT title, content FROM knowledge_base
         WHERE user_id = :uid AND category = 'diary'
         ORDER BY created_at DESC FETCH FIRST 5 ROWS ONLY`,
        { uid },
        { outFormat: oracledb.default.OUT_FORMAT_ARRAY },
      );

      // Up to 15 pending tasks
      const tasks = await conn.execute<[string, string]>(
        `SELECT title, content FROM knowledge_base
         WHERE user_id = :uid AND category = 'task' AND (status IS NULL OR status = 'pending')
         ORDER BY created_at DESC FETCH FIRST 15 ROWS ONLY`,
        { uid },
        { outFormat: oracledb.default.OUT_FORMAT_ARRAY },
      );

      if (diary.rows?.length) {
        lines.push(`User ${uid} recent diary:`);
        for (const [title, body] of diary.rows) {
          lines.push(`- ${(title || '').slice(0, 80)}: ${(body || '').slice(0, 200)}`);
        }
      }

      if (tasks.rows?.length) {
        lines.push(`User ${uid} pending tasks:`);
        for (const [title] of tasks.rows) {
          lines.push(`- ${(title || '').slice(0, 120)}`);
        }
      }
    }

    return lines.join('\n');
  } finally {
    await conn.close();
  }
}
