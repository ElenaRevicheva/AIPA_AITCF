/** Sprint Briefing Agent — shared types (Linear + GitHub → Groq cluster → Claude narrative → audio → Telegram). */

export interface SprintBriefingDeps {
  githubRepos: string[];
  /** Optional Linear GraphQL team filter */
  linearTeamId?: string | undefined;
  /** Include diary/tasks snippets from Oracle knowledge_base for these Telegram user IDs */
  knowledgeUserIds?: number[] | undefined;
}

export interface SprintBriefingResult {
  narrativeText: string;
  clusterRaw: string;
  sourcesDigest: string;
  audioMp3: Buffer | null;
  audioSkippedReason?: string | undefined;
}
