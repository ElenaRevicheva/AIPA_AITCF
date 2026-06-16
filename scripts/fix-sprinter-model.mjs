import { LambdaClient, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, InvokeCommand } from '@aws-sdk/client-lambda';
const REGION='us-east-1', FN='sprint-briefing-agent', MODEL='claude-sonnet-4-6';
const c=new LambdaClient({region:REGION});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitReady(){for(let i=0;i<40;i++){const cfg=await c.send(new GetFunctionConfigurationCommand({FunctionName:FN}));if(cfg.LastUpdateStatus==='Successful'&&cfg.State==='Active')return;await sleep(2000);}throw new Error('not ready');}
let cfg=await c.send(new GetFunctionConfigurationCommand({FunctionName:FN}));
let env={...(cfg.Environment?.Variables||{}), SPRINT_BRIEFING_CLAUDE_MODEL:MODEL, SPRINT_BRIEFING_FORCE:'1'};
await c.send(new UpdateFunctionConfigurationCommand({FunctionName:FN,Environment:{Variables:env}}));
console.log('[1] set SPRINT_BRIEFING_CLAUDE_MODEL='+MODEL+' + FORCE=1'); await waitReady(); console.log('    applied');
console.log('[2] invoking (delivers a briefing to your Telegram)...');
const res=await c.send(new InvokeCommand({FunctionName:FN,InvocationType:'RequestResponse',Payload:Buffer.from(JSON.stringify({source:'manual-recovery'}))}));
console.log('    StatusCode:',res.StatusCode,'| FunctionError:',res.FunctionError||'(none)');
console.log('    Response:',(res.Payload?Buffer.from(res.Payload).toString():'').slice(0,600));
cfg=await c.send(new GetFunctionConfigurationCommand({FunctionName:FN}));
env={...(cfg.Environment?.Variables||{})}; env.SPRINT_BRIEFING_CLAUDE_MODEL=MODEL; delete env.SPRINT_BRIEFING_FORCE;
await c.send(new UpdateFunctionConfigurationCommand({FunctionName:FN,Environment:{Variables:env}}));
console.log('[3] removed FORCE (model override stays). Done.');
