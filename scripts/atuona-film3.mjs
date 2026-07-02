// "THE SECRET EXHIBITION" — 02.07.2026 clips (poems #095-#098), EXACT June-19 STANZAS pipeline,
// new music: Pixabay "Dark Cinematic Drone Deep Bass Ambient". Cover card from Elena's provided image.
// Per-clip stanza matched to the poem that clip visualizes (mapping recovered from PM2 logs).
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP0 = promisify(execFile);
async function execFileP(cmd, args, opts){
  if (cmd === 'ffmpeg' || cmd === 'ffprobe') {
    fs.appendFileSync('/home/ubuntu/atuona-film3/ffmpeg-commands.log', cmd + ' ' + args.map(a=>/[\s\[\];,']/.test(a)?`'${a}'`:a).join(' ') + '\n\n');
  }
  return execFileP0(cmd, args, opts);
}

const BASE = '/home/ubuntu/atuona-film3';
const CLIPS = BASE + '/clips';
const W = BASE + '/work';
const VODIR = BASE + '/vo';
const OUTDIR = '/home/ubuntu/cto-aipa/data/atuona/films/out';
const MUSIC = '/home/ubuntu/cto-aipa/data/atuona/films/music/dark-cinematic-drone-pixabay.mp3';
const COVER = BASE + '/cover.jpg';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const XFADE_D = 1.3, LEAD = 0.7, TAIL = 1.9, SPEED = 0.9;
const FILM_TITLE = 'THE SECRET EXHIBITION';
const MOMENTS = '02.07.2026  ·  atuona.xyz Gallery  ·  Moments #095 #096 #097 #098';
const OUTRO_SUB = 'atuona.xyz // Paradise.js  ·  by Kira Velerevich';
const SLUG = 'the-secret-exhibition-02-07-2026';

// clip -> poem (from Oracle PM2 log timeline + md5 vs persisted shots)
const POEM_OF = {
  '-VSF1F_a.mp4': '098', 'Hn8qOF3z.mp4': '098', 'PQ7QZKTz.mp4': '095', 'S564SzTx.mp4': '096',
  'atuona-base.mp4': '098', 'atuona-base1.mp4': '098', 'atuona-base12.mp4': '098',
  'atuona-base4.mp4': '095', 'atuona-base6.mp4': '095', 'eoaMvVAu.mp4': '097', 'yW7lw53H.mp4': '095',
};

function readEnvKey(n){ try { const l=fs.readFileSync('/home/ubuntu/cto-aipa/.env','utf8').split('\n').find(x=>x.startsWith(n+'=')); return l?l.slice(n.length+1).trim().replace(/^["']|["']$/g,''):''; } catch { return ''; } }
const KEY=(process.env.OPENAI_API_KEY||readEnvKey('OPENAI_API_KEY')).trim();

const caps = s => (s||'').toUpperCase();
const track = s => caps(s).split('').join(' ');
function stripMd(s){ return (s||'').replace(/\r/g,'').replace(/[*_`]+/g,''); }
function wrap(s,maxCols,maxLines){ const out=[]; for(const raw of stripMd(s).split('\n')){ const words=raw.trim().split(/\s+/).filter(Boolean); if(!words.length){out.push('');continue;} let cur=''; for(const w of words){ if(cur&&(cur.length+1+w.length)>maxCols){out.push(cur);cur=w;} else cur=cur?`${cur} ${w}`:w; } if(cur)out.push(cur);} while(out.length&&out[out.length-1]==='')out.pop(); while(out.length&&out[0]==='')out.shift(); return out.slice(0,maxLines).join('\n'); }
async function dur(f){ try { const {stdout}=await execFileP('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',f]); const d=parseFloat(stdout.trim()); return d>0?d:5; } catch { return 5; } }
async function tts(text,out){ const body=out+'.json'; fs.writeFileSync(body,JSON.stringify({model:'tts-1',voice:'onyx',input:text,response_format:'mp3',speed:SPEED})); let last=''; for(let a=0;a<4;a++){ try { await execFileP0('curl',['-sS','--fail-with-body','-m','60','-o',out,'https://api.openai.com/v1/audio/speech','-H',`Authorization: Bearer ${KEY}`,'-H','Content-Type: application/json','-d',`@${body}`],{timeout:70000}); if(fs.existsSync(out)&&fs.statSync(out).size>1000){try{fs.unlinkSync(body);}catch{} return;} last='small'; } catch(e){ last='curl '+(e&&e.code!=null?e.code:'?'); } await new Promise(r=>setTimeout(r,2000)); } try{fs.unlinkSync(body);}catch{} throw new Error('tts '+last); }

async function makeCard(titleRaw,subRaw,outFile,d,titleSize,bgImage,noFadeIn){
  const tFile=outFile+'_t.txt'; fs.writeFileSync(tFile, track(titleRaw));
  let draw=`drawtext=fontfile=${MONO}:textfile=${tFile}:expansion=none:fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=(h-text_h)/2-26`;
  if(subRaw && subRaw.trim()){ const sFile=outFile+'_s.txt'; fs.writeFileSync(sFile, wrap(caps(subRaw),56,2)); draw+=`,drawtext=fontfile=${MONO}:textfile=${sFile}:expansion=none:fontcolor=0xBBBBBB:fontsize=20:line_spacing=10:x=(w-text_w)/2:y=(h/2)+40`; }
  // noFadeIn: first frame fully visible so video players use the title card as the poster (not black)
  const fades=`${noFadeIn?'':'fade=t=in:st=0:d=0.8,'}fade=t=out:st=${(d-0.8).toFixed(2)}:d=0.8,format=yuv420p`;
  if(bgImage && fs.existsSync(bgImage)){
    const vf=`scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,eq=brightness=-0.36:saturation=0.8,${draw},${fades}`;
    await execFileP('ffmpeg',['-y','-loop','1','-i',bgImage,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100','-filter_complex',`[0:v]${vf}[v]`,'-map','[v]','-map','1:a','-t',d.toFixed(2),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','44100','-ac','2',outFile],{maxBuffer:1<<26,timeout:60000});
  } else {
    const vf=`${draw},${fades}`;
    await execFileP('ffmpeg',['-y','-f','lavfi','-i',`color=c=black:s=1280x720:r=30:d=${d.toFixed(2)}`,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100','-filter_complex',`[0:v]${vf}[v]`,'-map','[v]','-map','1:a','-t',d.toFixed(2),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','44100','-ac','2',outFile],{maxBuffer:1<<26,timeout:60000});
  }
  return outFile;
}

async function main(){
  fs.writeFileSync(BASE+'/ffmpeg-commands.log','');
  const STANZAS=JSON.parse(fs.readFileSync(BASE+'/stanzas.json','utf8'));
  const used={}; for(const k of Object.keys(STANZAS)) used[k]=0;

  const clips=fs.readdirSync(CLIPS).filter(f=>f.endsWith('.mp4')).sort();
  const N=clips.length;
  // clip 0 = wordless visual opener; clips 1..N-1 each carry the next stanza OF THEIR OWN POEM
  function stanzaFor(i){
    if(i===0) return null;
    const pid=POEM_OF[clips[i]]; if(!pid||!STANZAS[pid]) return null;
    const arr=STANZAS[pid].stanzas; const s=arr[used[pid]] || null;
    if(s) used[pid]++;
    return s ? [s, s.replace(/\s+/g,' ').trim()] : null;
  }

  const seq=[]; seq.push(await makeCard(FILM_TITLE, MOMENTS, path.join(W,'card_intro.mp4'), 4.4, 40, COVER, true));

  const voInfo=[];
  for(let i=0;i<N;i++){
    const src=path.join(CLIPS,clips[i]); const st=stanzaFor(i);
    let voFile=null, vd=0;
    if(st){ voFile=path.join(VODIR,`v_${String(i).padStart(2,'0')}.mp3`); if(!(fs.existsSync(voFile)&&fs.statSync(voFile).size>1000)) await tts(st[1],voFile); vd=await dur(voFile); }
    const nat=await dur(src);
    const clipDur=st ? Math.max(nat, LEAD+vd+TAIL) : Math.min(nat, 5.5);
    const factor=(clipDur/nat).toFixed(5);
    let draw='';
    if(st){ const txt=path.join(W,`p_${i}.txt`); fs.writeFileSync(txt,wrap(st[0],50,7)); const fo=(clipDur-1.0).toFixed(2); const alpha=`if(lt(t,0.7),t/0.7,if(gt(t,${fo}),max(0,(${clipDur.toFixed(2)}-t)/1.0),1))`; draw=`,drawtext=fontfile=${FONT}:textfile=${txt}:expansion=none:fontcolor=white:fontsize=22:line_spacing=6:box=1:boxcolor=black@0.5:boxborderw=14:x=(w-text_w)/2:y=h-text_h-30:alpha='${alpha}'`; }
    const vf=`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setpts=${factor}*PTS,fps=30,format=yuv420p${draw}`;
    const clip=path.join(W,`fc_${String(i).padStart(2,'0')}.mp4`);
    await execFileP('ffmpeg',['-y','-i',src,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100','-filter_complex',`[0:v]${vf}[v]`,'-map','[v]','-map','1:a','-t',clipDur.toFixed(2),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','44100','-ac','2',clip],{maxBuffer:1<<26,timeout:150000});
    seq.push(clip);
    if(voFile) voInfo.push({segIndex:i+1, file:voFile});
    process.stderr.write(`clip ${i+1}/${N} ${clips[i]} poem#${POEM_OF[clips[i]]}${st?'':' [visual]'} dur=${clipDur.toFixed(1)}\n`);
  }
  seq.push(await makeCard('ATUONA', OUTRO_SUB, path.join(W,'card_outro.mp4'), 4.2, 56));

  const durs=[]; for(const c of seq) durs.push(await dur(c));
  const segStart=k=>{ let s=0; for(let i=0;i<k;i++) s+=durs[i]; return Math.max(0,s-k*XFADE_D); };

  const inputs=seq.flatMap(c=>['-i',c]); let fc=''; let vlab='0:v',alab='0:a',merged=durs[0];
  for(let k=1;k<seq.length;k++){ const ofs=Math.max(0,merged-XFADE_D).toFixed(3); fc+=`[${vlab}][${k}:v]xfade=transition=fade:duration=${XFADE_D}:offset=${ofs}[vc${k}];`; fc+=`[${alab}][${k}:a]acrossfade=d=${XFADE_D}[ac${k}];`; vlab=`vc${k}`; alab=`ac${k}`; merged+=durs[k]-XFADE_D; }
  const body=path.join(W,'body.mp4');
  await execFileP('ffmpeg',['-y',...inputs,'-filter_complex',fc.replace(/;$/,''),'-map',`[${vlab}]`,'-map',`[${alab}]`,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','44100','-ac','2',body],{maxBuffer:1<<27,timeout:480000});

  const LEN=await dur(body);
  const voAt=voInfo.map(v=>({file:v.file, t:+(segStart(v.segIndex)+LEAD).toFixed(2)}));
  let mf=`[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=${(LEN-3).toFixed(2)}:d=3[music];`;
  const vl=[]; voAt.forEach((v,k)=>{ const idx=k+2; mf+=`[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.t*1000)}:all=1[v${k}];`; vl.push(`[v${k}]`); });
  mf+=`${vl.join('')}amix=inputs=${vl.length}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];`;
  mf+=`[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];[premix]loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  const mixIn=['-i',body,'-stream_loop','-1','-i',MUSIC]; voAt.forEach(v=>mixIn.push('-i',v.file));
  const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const final=path.join(OUTDIR,`${SLUG}-${stamp}.mp4`);
  process.stderr.write('final mix...\n');
  await execFileP('ffmpeg',['-y','-v','error',...mixIn,'-filter_complex',mf,'-map','0:v','-map','[a]','-t',LEN.toFixed(2),'-c:v','copy','-c:a','aac','-ar','44100','-b:a','192k',final],{maxBuffer:1<<27,timeout:300000});
  console.log(`DONE ${path.basename(final)} (${(fs.statSync(final).size/1e6).toFixed(1)}MB, ${LEN.toFixed(0)}s, ${N} clips, ${voInfo.length} voiced)`);
}
main().catch(e=>{ console.error('FAIL:', e.stderr?String(e.stderr).slice(-500):e.message); process.exit(1); });
