require("dotenv").config();
const fs=require("fs"),path=require("path");
const ROOT=__dirname+"/..";
const { buildDraft, buildFuDraft, atlasAngle } = require("./atlas-lead-machine.cjs");
const { loadRegistry, saveRegistry, digitsOnly, formatPhone507, buildHubSpotEmailAnchor, buildHubSpotWaAnchor } = require("./wa-link-lib.cjs");
const key=process.env.HUBSPOT_API_KEY.trim();
const VIS=process.env.VISIBILITY_API_KEY.trim();
const hs=async(m,p,b)=>{const o={method:m,headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"}};if(b)o.body=JSON.stringify(b);const r=await fetch("https://api.hubapi.com"+p,o);const t=await r.text();if(!r.ok)throw new Error(r.status+" "+p+" "+t.slice(0,140));return t?JSON.parse(t):null;};
const audit=async(url)=>{const r=await fetch("https://webhook.aideazz.xyz/cto/v1/visibility",{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":VIS},body:JSON.stringify({url})});if(!r.ok)return null;const d=await r.json();const aeo=(d.categories||[]).find(c=>c.id==="aeo");return{score:d.score,grade:d.grade,aeo:aeo?aeo.score:null};};
const slugOf=n=>String(n).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,54)+"-atlas";
(async()=>{
  const backup=JSON.parse(fs.readFileSync("docs/selling/_atlas_backfill_backup.json","utf8"));
  const targets=backup.filter(b=>b.dealname.includes("[CLIENT-ATLAS]"));
  console.log("backfilling",targets.length,"CLIENT-ATLAS deals\n");
  const reg=loadRegistry();
  for(const t of targets){
    const company=t.dealname.replace(/^\[CLIENT-ATLAS\]\s*/,"").replace(/\s*—.*$/,"").trim();
    const a=await audit(t.website); if(!a){console.log("  ✗ audit failed",company);continue;}
    const lead={company,website:t.website,city:"Panama City",email:t.email,phone:t.phone,query:"clínica dental"};
    const ang=atlasAngle();
    const d=buildDraft(lead,a,ang), f=buildFuDraft(lead,a,ang);
    const slug=slugOf(company), fuSlug=slug+"-fu";
    const dRel=`docs/selling/drafts/${slug}-email.txt`, fRel=`docs/selling/drafts/${fuSlug}-email.txt`;
    const waRel=`docs/selling/drafts/${slug}.txt`, fuWaRel=`docs/selling/drafts/${fuSlug}.txt`;
    fs.writeFileSync(path.join(ROOT,dRel),`SUBJECT: ${d.subject}\n\nTO: ${t.email}\n\n${d.body}\n`,"utf8");
    fs.writeFileSync(path.join(ROOT,fRel),`SUBJECT: ${f.subject}\n\nTO: ${t.email}\n\n${f.body}\n`,"utf8");
    const waText=`Hola 👋 Soy Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio\n\nAnalicé ${t.website}: ${a.score}/100 (${a.grade}). ¿Les muestro 3 arreglos en 15 min? https://aideazz.xyz/api`;
    const fuWaText=`Hola de nuevo 👋 Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio\n\nNo vendo otro chatbot — instalo un AI Growth Operator 24/7. ¿15 min? https://aideazz.xyz/api`;
    if(t.phone){fs.writeFileSync(path.join(ROOT,waRel),waText,"utf8");fs.writeFileSync(path.join(ROOT,fuWaRel),fuWaText,"utf8");}
    const common={company,email:t.email,score:a.score,dealId:String(t.dealId),...(t.phone?{phone:digitsOnly(t.phone)}:{})};
    reg[slug]={...common,emailDraft:dRel,...(t.phone?{draft:waRel}:{})};
    reg[fuSlug]={...common,emailDraft:fRel,...(t.phone?{draft:fuWaRel}:{})};
    const L1=buildHubSpotEmailAnchor(slug,t.email,`✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${t.email})`);
    const W1=t.phone?buildHubSpotWaAnchor(t.phone,waText,`➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${a.score}/100 (${formatPhone507(t.phone)})`):null;
    const L2=buildHubSpotEmailAnchor(fuSlug,t.email,`✉️ EMAIL FU — aipa@aideazz.xyz (${t.email})`);
    const W2=t.phone?buildHubSpotWaAnchor(t.phone,fuWaText,`➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(t.phone)})`):null;
    const old=(t.notes[0]&&t.notes[0].body)||"";
    const kept=old.replace(/^[\s\S]*?<hr>/i,"");
    const body=[`<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,`${L1}<br>`,W1?`${W1}<br>`:"",`${L2}<br>`,W2?`${W2}<br>`:"",`<hr>`,kept||`<b>Auditoría:</b> ${a.score}/100 ${a.grade}${a.aeo!=null?` · AEO ${a.aeo}`:""}<br><b>Sitio:</b> ${t.website}<br>`].join("");
    if(t.notes[0]) await hs("PATCH","/crm/v3/objects/notes/"+t.notes[0].id,{properties:{hs_note_body:body}});
    console.log(`  ✅ ${company} · ${a.score}/${a.grade} · dealId ${t.dealId} · 4 links · fu slug ${fuSlug}`);
  }
  saveRegistry(reg);
  console.log("\nregistry entries now:",Object.keys(reg).length);
})();
