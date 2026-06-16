import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
const logs=new CloudWatchLogsClient({region:'us-east-1'});
const ev=await logs.send(new FilterLogEventsCommand({logGroupName:'/aws/lambda/sprint-briefing-agent',startTime:Date.now()-6*60*1000}));
const msgs=(ev.events||[]).map(e=>e.message.trim());
console.log('events last 6min:',msgs.length);
console.log('404/model errors:',msgs.filter(m=>/404|not_found|model:/i.test(m)).length);
console.log('--- briefing/telegram/done lines ---');
msgs.filter(m=>/sprint|telegram|sent|briefing|audio|✅|END Request|REPORT/i.test(m)).slice(-12).forEach(m=>console.log(m.slice(0,200)));
