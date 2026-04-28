const LINEAR_API = 'https://api.linear.app/graphql';

/** Pull non-terminal issues + comments — workspace scoped by API key (team filter optional later). */
export async function fetchLinearSprintSignals(apiKey: string, _teamId?: string | undefined): Promise<string> {
  void _teamId;
  const query = `
    query SprintIssues {
      issues(
        filter: { state: { type: { nin: ["completed", "canceled"] } } }
        first: 40
      ) {
        nodes {
          identifier
          title
          priority
          updatedAt
          comments(first: 12) {
            nodes { body createdAt }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const json = (await res.json()) as {
      errors?: { message: string }[];
      data?: { issues?: { nodes: LinearIssueNode[] } };
    };
    if (json.errors?.length) {
      return `Linear API errors: ${json.errors.map(e => e.message).join('; ')}`;
    }
    const nodes = json.data?.issues?.nodes ?? [];
    const lines: string[] = ['### Linear'];
    if (nodes.length === 0) lines.push('- (no issues returned — check key / workspace)');
    for (const n of nodes) {
      lines.push(`- ${n.identifier} P${n.priority ?? '?'}: ${n.title} (${n.updatedAt})`);
      const recentComments =
        n.comments?.nodes?.filter(c => {
          const t = new Date(c.createdAt).getTime();
          return Date.now() - t < 26 * 60 * 60 * 1000;
        }) ?? [];
      for (const c of recentComments.slice(0, 3)) {
        lines.push(`  · comment: ${(c.body || '').slice(0, 180).replace(/\s+/g, ' ')}`);
      }
    }
    return lines.join('\n');
  } catch (e: unknown) {
    return `Linear fetch failed: ${String((e as Error)?.message || e)}`;
  }
}

interface LinearIssueNode {
  identifier: string;
  title: string;
  priority?: number;
  updatedAt: string;
  comments?: { nodes?: { body: string; createdAt: string }[] };
}
