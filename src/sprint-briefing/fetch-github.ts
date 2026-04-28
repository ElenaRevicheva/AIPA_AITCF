import type { Octokit } from '@octokit/rest';

export async function fetchGithubSprintSignals(octokit: Octokit, repos: string[]): Promise<string> {
  const chunks: string[] = [];
  for (const full of repos) {
    const [owner, repo] = full.trim().split('/');
    if (!owner || !repo) continue;
    try {
      const [openIssues, openPrs, mergedSince] = await Promise.all([
        octokit.rest.issues.listForRepo({ owner, repo, state: 'open', per_page: 30, sort: 'updated' }),
        octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 20, sort: 'updated' }),
        octokit.rest.pulls.list({
          owner,
          repo,
          state: 'closed',
          per_page: 15,
          sort: 'updated',
          direction: 'desc',
        }),
      ]);

      const mergedRecent = mergedSince.data.filter(p => {
        if (!p.merged_at) return false;
        const t = new Date(p.merged_at).getTime();
        return Date.now() - t < 26 * 60 * 60 * 1000;
      });

      chunks.push(`### GitHub ${owner}/${repo}`);
      chunks.push(
        `Open issues (${openIssues.data.length} shown):`,
        ...openIssues.data.slice(0, 15).map(i => `- #${i.number} ${i.title} [${i.state}]`),
      );
      chunks.push(
        `Open PRs:`,
        ...openPrs.data.slice(0, 12).map(p => `- PR#${p.number} ${p.title} (${p.head.ref})`),
      );
      chunks.push(
        `Merged last ~24h:`,
        ...(mergedRecent.length
          ? mergedRecent.map(p => `- PR#${p.number} ${p.title}`)
          : ['- (none in window)']),
      );

      try {
        const runs = await octokit.rest.actions.listWorkflowRunsForRepo({
          owner,
          repo,
          per_page: 8,
          status: 'completed',
        });
        const failed = runs.data.workflow_runs.filter(r => r.conclusion === 'failure').slice(0, 5);
        if (failed.length) {
          chunks.push(`Recent CI failures:`);
          chunks.push(...failed.map(r => `- ${r.name}: ${r.conclusion} (${r.head_branch})`));
        }
      } catch {
        /* optional — no Actions */
      }
    } catch (e: unknown) {
      chunks.push(`### GitHub ${full}: ERROR ${String((e as Error)?.message || e).slice(0, 200)}`);
    }
  }
  return chunks.join('\n');
}
