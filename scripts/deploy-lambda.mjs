/**
 * Deploy updated Sprint Briefing Lambda bundle + set SPRINT_BRIEFING_KNOWLEDGE_USER_IDS.
 * Run: node scripts/deploy-lambda.mjs
 */
import { LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTION_NAME = 'sprint-briefing-agent';
const REGION = process.env.AWS_REGION || 'us-east-1';
const KNOWLEDGE_USER_IDS = process.env.SPRINT_BRIEFING_KNOWLEDGE_USER_IDS || '5481526862';

// Zip path — built by esbuild, committed to dist-lambda/
const zipPath = resolve(__dirname, '../dist-lambda/sprint/lambda-pkg/handler.js');

async function run() {
  // Build a minimal zip in memory from the handler.js
  // The zip was pre-built; look for handler-fixed.zip first, then build fresh
  const zipFilePath = resolve(__dirname, '../dist-lambda/sprint/handler-fixed.zip');
  const zipBytes = readFileSync(zipFilePath);

  const client = new LambdaClient({ region: REGION });

  // 1. Verify function exists
  console.log(`[1/4] Checking Lambda function: ${FUNCTION_NAME}`);
  try {
    await client.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    console.log('      ✅ Found');
  } catch (e) {
    console.error('      ❌ Function not found. Check FUNCTION_NAME and AWS region.', e.message);
    process.exit(1);
  }

  // 2. Update code
  console.log('[2/4] Uploading new handler bundle...');
  await client.send(new UpdateFunctionCodeCommand({
    FunctionName: FUNCTION_NAME,
    ZipFile: zipBytes,
  }));
  console.log('      ✅ Code updated');

  // 3. Get current env vars (must merge, not replace)
  console.log('[3/4] Reading current env vars...');
  const config = await client.send(new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }));
  const existing = config.Environment?.Variables || {};
  console.log('      Current vars:', Object.keys(existing).join(', ') || '(none)');

  // 4. Merge in SPRINT_BRIEFING_KNOWLEDGE_USER_IDS
  const merged = { ...existing, SPRINT_BRIEFING_KNOWLEDGE_USER_IDS: KNOWLEDGE_USER_IDS };
  console.log('[4/4] Setting SPRINT_BRIEFING_KNOWLEDGE_USER_IDS =', KNOWLEDGE_USER_IDS);
  await client.send(new UpdateFunctionConfigurationCommand({
    FunctionName: FUNCTION_NAME,
    Environment: { Variables: merged },
  }));
  console.log('      ✅ Env vars updated');

  console.log('\n✅ Lambda deployed successfully.');
  console.log(`   Function : ${FUNCTION_NAME}`);
  console.log(`   Region   : ${REGION}`);
  console.log(`   User IDs : ${KNOWLEDGE_USER_IDS}`);
  console.log('\nNext Sprinter run: 8:00 AM Panama (13:00 UTC). Force test: set SPRINT_BRIEFING_FORCE=1 in Lambda console → Test.');
}

run().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });
