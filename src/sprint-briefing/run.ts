import Groq from 'groq-sdk';
import type { Anthropic } from '@anthropic-ai/sdk';
import type { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { fetchGithubSprintSignals } from './fetch-github';
import { fetchLinearSprintSignals } from './fetch-linear';
import { clusterSignalsWithGroq, writeBriefingNarrative } from './synthesize';
import { synthesizeBriefingMp3 } from './tts-openai';
import { sendTelegramBriefingAudio, sendTelegramText } from './telegram-send';
import type { SprintBriefingDeps, SprintBriefingResult } from './types';

export interface RunSprintBriefingClients {
  groq: Groq;
  anthropic: Anthropic;
  octokit: Octokit;
}

/**
 * End-to-end Sprint Briefing — reuses Groq+Claude routing style from CTO AIPA / triage.
 * Optional Oracle diary/tasks context (dream workflow). Optional OpenAI TTS (same stack as Whisper paths).
 */
export async function runSprintBriefing(
  clients: RunSprintBriefingClients,
  deps: SprintBriefingDeps,
): Promise<SprintBriefingResult> {
  const { groq, anthropic, octokit } = clients;
  const githubRepos = deps.githubRepos.length ? deps.githubRepos : parseReposEnv();

  const gh = await fetchGithubSprintSignals(octokit, githubRepos);
  const linearKey = process.env.LINEAR_API_KEY?.trim();
  const linearTeam = deps.linearTeamId ?? process.env.LINEAR_TEAM_ID?.trim();
  const lin = linearKey ? await fetchLinearSprintSignals(linearKey, linearTeam || undefined) : '### Linear\n(skipped — LINEAR_API_KEY not set)';

  let personal = '';
  const ids = deps.knowledgeUserIds?.length
    ? deps.knowledgeUserIds
    : parseUserIdsEnv();
  if (ids.length > 0 && process.env.SPRINT_BRIEFING_SKIP_ORACLE !== '1') {
    try {
      const { loadPersonalKnowledgeContext } = await import('./knowledge-context');
      personal = await loadPersonalKnowledgeContext(ids);
    } catch {
      personal = '(personal knowledge skipped)';
    }
  }

  const rawDigest = ['--- SIGNAL PACK ---', gh, '', lin, '', personal].join('\n');

  const clusterRaw = await clusterSignalsWithGroq(groq, rawDigest);
  const narrativeText = await writeBriefingNarrative(anthropic, clusterRaw, rawDigest);

  let audioMp3: Buffer | null = null;
  let audioSkippedReason: string | undefined;

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      audioMp3 = await synthesizeBriefingMp3(openai, narrativeText);
    } catch (e: unknown) {
      audioSkippedReason = `OpenAI TTS failed: ${String((e as Error)?.message || e).slice(0, 200)}`;
    }
  } else {
    audioSkippedReason = 'OPENAI_API_KEY not set — text-only mode';
  }

  const sourcesDigest = rawDigest.slice(0, 8000);

  if (process.env.SPRINT_BRIEFING_SKIP_ORACLE !== '1') {
    try {
      const { saveAgentOutcome } = await import('../database');
      await saveAgentOutcome(
        'cto_aipa',
        'sprint_briefing',
        {
          repos: githubRepos,
          linear: !!linearKey,
          audio: !!audioMp3,
          chars: narrativeText.length,
        },
        audioMp3 ? 'verified_delivered' : 'pending_verification',
      );
    } catch {
      /* Lambda path without Oracle wallet */
    }
  }

  return {
    narrativeText,
    clusterRaw,
    sourcesDigest,
    audioMp3,
    audioSkippedReason,
  };
}

export async function deliverBriefingToTelegram(result: SprintBriefingResult): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIdRaw = process.env.TELEGRAM_SPRINT_BRIEFING_CHAT_ID?.trim();
  if (!token || !chatIdRaw) {
    console.warn('Sprint briefing: TELEGRAM_BOT_TOKEN or TELEGRAM_SPRINT_BRIEFING_CHAT_ID missing — skip Telegram');
    return;
  }
  const chatId = parseInt(chatIdRaw, 10);
  if (Number.isNaN(chatId)) return;

  const cap = result.audioSkippedReason ? `\n\n_${result.audioSkippedReason}_` : '';
  if (result.audioMp3) {
    const r = await sendTelegramBriefingAudio({
      botToken: token,
      chatId,
      audio: result.audioMp3,
      caption: `☀️ Sprint Briefing — ${new Date().toISOString().slice(0, 10)}${cap}`,
      filename: 'sprint-briefing.mp3',
    });
    if (!r.ok) {
      await sendTelegramText({
        botToken: token,
        chatId,
        text: `Sprint briefing (audio failed: ${r.description || 'unknown'})\n\n${result.narrativeText.slice(0, 3500)}`,
      });
    }
  } else {
    await sendTelegramText({
      botToken: token,
      chatId,
      text: `☀️ Sprint Briefing (text)\n\n${result.narrativeText.slice(0, 3800)}${cap}`,
    });
  }
}

function parseReposEnv(): string[] {
  const raw = process.env.SPRINT_BRIEFING_GITHUB_REPOS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function parseUserIdsEnv(): number[] {
  const raw = process.env.SPRINT_BRIEFING_KNOWLEDGE_USER_IDS || process.env.TELEGRAM_AUTHORIZED_USERS || '';
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !Number.isNaN(n));
}
