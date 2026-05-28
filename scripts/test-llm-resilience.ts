/**
 * test-llm-resilience.ts — isolation test for claudeWithGroqFallback
 *
 * Simulates Anthropic credit exhaustion (400 + "credit balance" error) and verifies
 * that claudeWithGroqFallback routes to Groq and returns a real response.
 *
 * Does NOT touch the live ANTHROPIC_API_KEY. Uses a mock Anthropic client that
 * throws the exact error a depleted account produces.
 *
 * Run:
 *   npx ts-node scripts/test-llm-resilience.ts
 *
 * Requires GROQ_API_KEY in env (reads from .env via dotenv).
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { claudeWithGroqFallback, isAnthropicCreditExhaustion } from '../src/llm-resilience';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Mock Anthropic client that throws credit exhaustion ─────────────────────

function makeMockAnthropicCreditExhausted(): Anthropic {
  const err: any = new Error(
    'Your credit balance is too low to access the Anthropic API. ' +
    'Please go to Plans & Billing to upgrade or purchase credits.'
  );
  err.status = 400;
  err.error = { error: { message: err.message } };
  return {
    messages: {
      create: async () => { throw err; },
    },
  } as unknown as Anthropic;
}

// ─── Test runner ─────────────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; detail: string };

async function runTest(
  name: string,
  fn: () => Promise<string>,
): Promise<TestResult> {
  try {
    const result = await fn();
    const passed = result.length > 0;
    return { name, passed, detail: passed ? `${result.length} chars` : 'empty response' };
  } catch (e: unknown) {
    return { name, passed: false, detail: (e as Error).message?.slice(0, 120) || String(e) };
  }
}

async function main() {
  const mock = makeMockAnthropicCreditExhausted();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  console.log('\n🧪 LLM Resilience Isolation Tests');
  console.log('─'.repeat(60));

  if (!groqKey) {
    console.error('❌ GROQ_API_KEY not set — cannot test Groq fallback');
    process.exit(1);
  }

  // Verify isAnthropicCreditExhaustion detects the mock error
  const mockErr: any = new Error('Your credit balance is too low');
  mockErr.status = 400;
  mockErr.error = { error: { message: mockErr.message } };
  const detected = isAnthropicCreditExhaustion(mockErr);
  console.log(`\n[0] isAnthropicCreditExhaustion detection: ${detected ? '✅ PASS' : '❌ FAIL'}`);

  const tests: Array<() => Promise<TestResult>> = [
    () => runTest(
      'cto-aipa/strategic-qa',
      () => claudeWithGroqFallback(mock, 'claude-opus-4-20250514', 512, null,
        'What is 2+2? Answer in one sentence.', 'cto-aipa/strategic-qa'),
    ),
    () => runTest(
      'lead-triage/refine',
      () => claudeWithGroqFallback(mock, 'claude-sonnet-4-5', 150, null,
        'Refine: "Lead from tech company." Reply with only one sentence.', 'lead-triage/refine'),
    ),
    () => runTest(
      'trello-voice/classify (with system)',
      () => claudeWithGroqFallback(mock, 'claude-haiku-4-5-20251001', 128,
        'You are a task classifier. Return JSON with isTask:true/false.',
        'Add a card to review the PR tomorrow', 'trello-voice/classify'),
    ),
    () => runTest(
      'daily-blog/topic-picker',
      () => claudeWithGroqFallback(mock, 'claude-haiku-4-5-20251001', 64, null,
        'Topics: 0: ai agents, 1: groq api. Traffic: groq tutorial. Which index has the biggest gap? Reply with only the integer.', 'daily-blog/topic-picker'),
    ),
    () => runTest(
      'doc-ingest/extract',
      () => claudeWithGroqFallback(mock, 'claude-3-5-haiku-20241022', 256, null,
        'Extract prospects from: "Contact Bob at Acme Corp, builder." Return JSON array [{"name":"...","company":"..."}].', 'doc-ingest/extract'),
    ),
    () => runTest(
      'fresh-leads/pain-classify',
      () => claudeWithGroqFallback(mock, 'claude-haiku-4-5-20251001', 256, null,
        'For company "Acme Corp (SaaS startup)" give pain point. Return JSON: [{"company":"Acme Corp","painPoint":"...","matchedSystem":"..."}]', 'fresh-leads/pain-classify'),
    ),
    () => runTest(
      'outreach/email-draft',
      () => claudeWithGroqFallback(mock, 'claude-sonnet-4-20250514', 256, null,
        'Write a 2-sentence cold email to "Acme Corp" about AI automation. Return JSON: {"subject":"...","body":"..."}', 'outreach/email-draft'),
    ),
    () => runTest(
      'prospect-ingest/classify',
      () => claudeWithGroqFallback(mock, 'claude-sonnet-4-20250514', 256, null,
        'Classify: "Acme Corp". Return JSON: [{"name":"Acme Corp","painPoint":"...","matchedSystem":"..."}]', 'prospect-ingest/classify'),
    ),
    () => runTest(
      'prospect-places/pain-classify',
      () => claudeWithGroqFallback(mock, 'claude-haiku-4-5-20251001', 256, null,
        'For "Joe\'s Diner (123 Main St)" write 1 sentence pain point. Return JSON: [{"name":"Joe\'s Diner","painPoint":"..."}]', 'prospect-places/pain-classify'),
    ),
    () => runTest(
      'telegram-bot/linkedin-draft',
      () => claudeWithGroqFallback(mock, 'claude-haiku-4-5-20251001', 200, null,
        'Write a 1-sentence LinkedIn connection request to a founder at "Acme Corp". Start with a hook.', 'telegram-bot/linkedin-draft'),
    ),
    () => runTest(
      'trello-kanban/analyze',
      () => claudeWithGroqFallback(mock, 'claude-opus-4-20250514', 512, null,
        'Analyze this Trello board: 1 card "Fix bug" in "Todo". Give a 1-sentence health summary.', 'trello-kanban/analyze'),
    ),
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    const r = await testFn();
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} [${r.name}] — ${r.detail}`);
    if (r.passed) passed++; else failed++;
    // Small pause to respect Groq rate limits
    await new Promise(res => setTimeout(res, 800));
  }

  console.log('\n─'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n❌ Some tests failed — check GROQ_API_KEY and Groq service status');
    process.exit(1);
  } else {
    console.log('\n✅ All fallback paths verified — Groq is live and working\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
