/**
 * Loads personal context (diary + tasks) from Oracle.
 *
 * Two paths:
 *  - Lambda (ORACLE_WALLET_S3_BUCKET set): thin-mode connection, wallet from S3
 *  - Oracle server (default): thick-mode via existing database.ts pool
 */
export async function loadPersonalKnowledgeContext(userIds: number[]): Promise<string> {
  if (userIds.length === 0) return '';

  // Lambda path — wallet lives in S3, use thin-mode connector
  if (process.env.ORACLE_WALLET_S3_BUCKET) {
    const { loadKnowledgeFromOracle } = await import('./oracle-thin');
    return loadKnowledgeFromOracle(userIds);
  }

  // Oracle server path — thick-mode pool already initialised by database.ts
  const { getKnowledgeByCategory } = await import('../database');
  const lines: string[] = ['### Personal context (Oracle knowledge_base)'];
  for (const uid of userIds) {
    try {
      const diary = await getKnowledgeByCategory(uid, 'diary', 5);
      const tasks = await getKnowledgeByCategory(uid, 'task', 15);
      if (diary?.length) {
        lines.push(`User ${uid} recent diary snippets:`);
        for (const row of diary as { title?: string; body?: string }[]) {
          lines.push(`- ${(row.title || '').slice(0, 80)}: ${(row.body || '').slice(0, 200)}`);
        }
      }
      if (tasks?.length) {
        lines.push(`User ${uid} pending tasks:`);
        for (const row of tasks as { title?: string; body?: string }[]) {
          lines.push(`- ${(row.title || '').slice(0, 120)}`);
        }
      }
    } catch (e: unknown) {
      lines.push(`(knowledge load failed for ${uid}: ${String((e as Error)?.message || e).slice(0, 120)})`);
    }
  }
  return lines.join('\n');
}
