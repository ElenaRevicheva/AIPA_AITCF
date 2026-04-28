/**
 * AWS Lambda entry — set SPRINT_BRIEFING_SKIP_ORACLE=1 so Oracle wallet not required.
 * Bundle with esbuild: `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --outfile=dist-lambda/sprint/handler.js --external:@anthropic-ai/sdk --external:groq-sdk --external:@octokit/rest --external:openai`
 * Prefer deploying deps in Lambda layer or mark external:false for single file (large).
 */
import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { runSprintBriefing, deliverBriefingToTelegram } from '../sprint-briefing/run';

process.env.SPRINT_BRIEFING_SKIP_ORACLE = '1';

export async function handler(): Promise<{ ok: boolean; error?: string }> {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN,
    });
    const repos = (process.env.SPRINT_BRIEFING_GITHUB_REPOS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const result = await runSprintBriefing({ groq, anthropic, octokit }, { githubRepos: repos });
    await deliverBriefingToTelegram(result);
    return { ok: true };
  } catch (e: unknown) {
    console.error(e);
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
