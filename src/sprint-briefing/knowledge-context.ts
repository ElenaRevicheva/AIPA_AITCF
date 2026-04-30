/**
 * Loads personal context (diary + tasks) from Oracle.
 *
 * Three paths (checked in order):
 *  1. Lambda → HTTP API  (SPRINT_KNOWLEDGE_API_URL set): calls /sprint-knowledge on CTO AIPA server
 *     — avoids Oracle wallet entirely; Oracle stays internal to the server.
 *  2. Lambda → oracle-thin (ORACLE_WALLET_S3_BUCKET set, fallback): thin-mode direct connection.
 *  3. Oracle server (default): thick-mode via existing database.ts pool.
 */
export async function loadPersonalKnowledgeContext(userIds: number[]): Promise<string> {
  if (userIds.length === 0) return '';

  // Path 1: Lambda HTTP API — preferred when CTO AIPA server is reachable
  const apiUrl = process.env.SPRINT_KNOWLEDGE_API_URL?.trim();
  const apiSecret = process.env.OUTREACH_SECRET?.trim();
  if (apiUrl && apiSecret) {
    const url = `${apiUrl}?userIds=${userIds.join(',')}`;
    console.log('[knowledge-context] HTTP path:', url);
    const { default: https } = await import('https');
    const data = await new Promise<string>((resolve, reject) => {
      const req = https.get(url, { headers: { Authorization: `Bearer ${apiSecret}` } }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    });
    const json = JSON.parse(data) as { ok?: boolean; context?: string; error?: string };
    if (json.ok && json.context) {
      console.log('[knowledge-context] HTTP OK, context length:', json.context.length);
      return json.context;
    }
    throw new Error(json.error || 'sprint-knowledge API returned no context');
  }

  // Path 2: Lambda oracle-thin (direct Oracle connection via S3 wallet — requires wallet password)
  if (process.env.ORACLE_WALLET_S3_BUCKET) {
    const { loadKnowledgeFromOracle } = await import('./oracle-thin');
    return loadKnowledgeFromOracle(userIds);
  }

  // Path 3: Oracle server — thick-mode pool already initialised by database.ts
  const { getKnowledgeByCategory } = await import('../database');
  const lines: string[] = ['### Personal context (Oracle knowledge_base)'];
  for (const uid of userIds) {
    try {
      const diary = await getKnowledgeByCategory(uid, 'diary', 5);
      const tasks = await getKnowledgeByCategory(uid, 'task', 15);
      if (diary?.length) {
        lines.push(`User ${uid} recent diary:`);
        for (const row of diary as { title?: string; content?: string }[]) {
          lines.push(`- ${(row.title || '').slice(0, 80)}: ${(row.content || '').slice(0, 200)}`);
        }
      }
      if (tasks?.length) {
        lines.push(`User ${uid} pending tasks:`);
        for (const row of tasks as { title?: string; content?: string }[]) {
          lines.push(`- ${(row.title || '').slice(0, 120)}`);
        }
      }
    } catch (e: unknown) {
      lines.push(`(knowledge load failed for ${uid}: ${String((e as Error)?.message || e).slice(0, 120)})`);
    }
  }
  return lines.join('\n');
}
