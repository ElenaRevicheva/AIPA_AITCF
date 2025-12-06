import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { initializeDatabase, saveMemory, getRelevantMemory } from './database';
import * as dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface CodeReviewRequest {
  repo: string;
  pr_number: number;
  diff: string;
  useClaudeForCritical?: boolean;
}

async function reviewCode(request: CodeReviewRequest) {
  console.log(`🤖 CTO AIPA: Reviewing PR #${request.pr_number} in ${request.repo}...`);
  
  const context = await getRelevantMemory('CTO', 'code_review', 3);
  
  const useClaude = request.useClaudeForCritical || 
                    request.diff.includes('security') || 
                    request.diff.includes('payment');
  
  let review: string;
  
  if (useClaude) {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Review this code change:\n\n${request.diff}\n\nPrevious context: ${JSON.stringify(context)}`
      }]
    });
    const firstContent = response.content[0];
    review = firstContent && firstContent.type === 'text' ? firstContent.text : '';
  } else {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Review this code change:\n\n${request.diff}\n\nPrevious context: ${JSON.stringify(context)}`
      }]
    });
    review = response.choices[0]?.message?.content || '';
  }
  
  await saveMemory('CTO', 'code_review', {
    repo: request.repo,
    pr_number: request.pr_number
  }, review, {
    model_used: useClaude ? 'claude' : 'groq',
    timestamp: new Date().toISOString()
  });
  
  console.log(`✅ CTO AIPA: Review complete!`);
  console.log(review);
  return review;
}

async function startCTOAIPA() {
  console.log('🚀 Starting CTO AIPA on Oracle Cloud...');
  
  await initializeDatabase();
  
  console.log('✅ CTO AIPA ready and running on Oracle Cloud Infrastructure!');
  console.log('💰 Cost: $0 (using Oracle credits)');
  
  // TODO: Set up webhook listener for GitHub events
}

startCTOAIPA().catch(console.error);

export { reviewCode };
