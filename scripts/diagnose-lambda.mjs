import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
const REGION='us-east-1', FN='sprint-briefing-agent';
const lambda=new LambdaClient({region:REGION}); const logs=new CloudWatchLogsClient({region:REGION});
const cfg=await lambda.send(new GetFunctionConfigurationCommand({FunctionName:FN}));
console.log('=== CONFIG ===');
console.log('LastModified:',cfg.LastModified,'| State:',cfg.State,'| LastUpdateStatus:',cfg.LastUpdateStatus);
console.log('Runtime:',cfg.Runtime,'| Timeout:',cfg.Timeout,'s | Mem:',cfg.MemorySize);
const env=cfg.Environment?.Variables||{};
console.log('Env keys:',Object.keys(env).join(', '));
console.log('SPRINT_BRIEFING_CLAUDE_MODEL:',env.SPRINT_BRIEFING_CLAUDE_MODEL||'(NOT SET -> baked-in default)');
console.log('ANTHROPIC key set:',!!(env.ANTHROPIC_API_KEY||env.CLAUDE_API_KEY));
try {
  const ev=await logs.send(new FilterLogEventsCommand({logGroupName:`/aws/lambda/${FN}`,startTime:Date.now()-28*3600*1000}));
  const msgs=(ev.events||[]).map(e=>`${new Date(e.timestamp).toISOString()} ${e.message.trim()}`);
  console.log('\n=== LOGS last 28h ('+msgs.length+' events) ===');
  const errs=msgs.filter(m=>/error|exception|404|not_found|timed out|traceback|fail|model:/i.test(m));
  console.log('--- error/model lines ('+errs.length+') ---'); errs.slice(-25).forEach(m=>console.log(m.slice(0,300)));
  console.log('--- last 12 lines ---'); msgs.slice(-12).forEach(m=>console.log(m.slice(0,300)));
} catch(e){ console.log('LOG READ ERROR:',e.name,e.message); }
