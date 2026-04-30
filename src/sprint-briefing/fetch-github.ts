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

      const window26h = Date.now() - 26 * 60 * 60 * 1000;
      const since26hIso = new Date(window26h).toISOString();

      const mergedRecent = mergedSince.data.filter(p => {
        if (!p.merged_at) return false;
        return new Date(p.merged_at).getTime() > window26h;
      });

      chunks.push(`### GitHub ${owner}/${repo}`);

      // Recent commits — primary signal for daily activity (pushes, not just PR merges)
      try {
        const commitsRes = await octokit.rest.repos.listCommits({
          owner, repo, per_page: 15, since: since26hIso,
        });
        const commits = commitsRes.data.filter(c => c.commit.author?.date);
        chunks.push(
          `Recent commits (last 26h, ${commits.length} total):`,
          ...(commits.length
            ? commits.slice(0, 10).map(c => {
                const author = c.commit?.author;
                const d = (author?.date ?? '').slice(0, 16);
                const m = ((c.commit?.message ?? '').split('\n')[0] ?? '').slice(0, 90);
                const a = author?.name ?? 'unknown';
                return `- [${d}] ${m} (${a})`;
              })
            : ['- (no commits in window)']),
        );
      } catch {
        chunks.push('Recent commits: (fetch failed)');
      }

      chunks.push(
        `Open PRs (${openPrs.data.length}):`,
        ...openPrs.data.slice(0, 8).map(p => `- PR#${p.number} ${p.title} (${p.head.ref})`),
      );
      chunks.push(
        `Merged last ~26h:`,
        ...(mergedRecent.length
          ? mergedRecent.map(p => `- PR#${p.number} ${p.title}`)
          : ['- (none)']),
      );
      chunks.push(
        `Open issues (${openIssues.data.length} shown, most recently updated):`,
        ...openIssues.data.slice(0, 8).map(i =>
          `- #${i.number} ${i.title} [updated ${(i.updated_at || '').slice(0, 10)}]`
        ),
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
