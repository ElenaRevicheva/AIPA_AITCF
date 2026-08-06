require("dotenv").config();
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const KEY=process.env.HUBSPOT_API_KEY.trim();
const reg=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/selling/outreach-registry.json"),"utf8"));
const DRY=process.argv.includes("--dry");
const hs=async(m,p,b)=>{const o={method:m,headers:{Authorization:"Bearer "+KEY,"Content-Type":"application/json"}};if(b)o.body=JSON.stringify(b);const r=await fetch("https://api.hubapi.com"+p,o);const t=await r.text();if(!r.ok)throw new Error(m+" "+p+" "+r.status);return t?JSON.parse(t):null;};
// old dead slug -> new registered slug
const MAP={
 "engel-v-lkers-panam":"engel-volkers-panama",
 "la-strega-ristorante":"la-strega-ristorante-pty",
 "autogo-repuestos":"autogo-repuestos-pty",
 "be-luxe-real-estate":"be-luxe-real-estate-pty",
 "madero-valor-development":"madero-valor-development",
 "empresas-bern":"empresas-bern-pty",
 "insignia-resources":"insignia-resources-pty",
 "marjalizo":"marjalizo-realty",
 "foundever":"foundever-pty",
};
const DEALS=["63517061802","63512345418","63507662856","63526545680","63529849517","63528429206","63516596373","63526061876","63523808804"];
(async()=>{
 let touched=0, skipped=0;
 for(const id of DEALS){
  const a=await hs("GET","/crm/v4/objects/deals/"+id+"/associations/notes");
  for(const nid of (a.results||[]).map(r=>r.toObjectId||r.id)){
   const n=await hs("GET","/crm/v3/objects/notes/"+nid+"?properties=hs_note_body");
   let b=n.properties.hs_note_body||""; const before=b;
   for(const [oldS,newS] of Object.entries(MAP)){
    if(oldS===newS) continue;
    // only rewrite when the NEW slug is actually registered and resolvable
    if(!reg[newS]||!reg[newS].emailDraft) continue;
    b=b.replace(new RegExp("/go/outreach-email/"+oldS+"(?![a-z0-9-])","g"),"/go/outreach-email/"+newS);
   }
   if(b!==before){
    if(!DRY) await hs("PATCH","/crm/v3/objects/notes/"+nid,{properties:{hs_note_body:b}});
    touched++;
   } else skipped++;
  }
 }
 console.log((DRY?"DRY — ":"")+"notes re-pointed:",touched,"| unchanged:",skipped);
})();
