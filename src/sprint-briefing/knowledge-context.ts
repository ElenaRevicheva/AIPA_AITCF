import { getKnowledgeByCategory } from '../database';

/** Reuse CTO Personal AI: diary + tasks give "what Elena already said" — dream-workflow alignment. */
export async function loadPersonalKnowledgeContext(userIds: number[]): Promise<string> {
  if (userIds.length === 0) return '';
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
