require("dotenv").config();
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const {loadRegistry,saveRegistry}=require("./wa-link-lib.cjs");
const OPERATOR="No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.";
const PORTFOLIO="En AIdeazz AI Lab construyo y opero: agentes de WhatsApp y Telegram que venden y agendan, automatización de procesos repetitivos, visibilidad en motores de IA (GEO/AEO), video con IA para promociones, e ingeniería de confiabilidad para sistemas de IA que fallan. Todo con demos en vivo aquí: https://aideazz.xyz/portfolio";
// First contact for these three went out by WhatsApp on Jul 19 and was never stored.
// So the email is written as a CHANNEL SWITCH, not a first touch — saying "les escribí
// por WhatsApp" is true; saying "les escribí por correo" would not be.
const L=[
 {slug:"palig-panam",company:"PALIG Panamá",site:"palig.com",score:79,grade:"B",
  gap:"su sitio no tiene datos estructurados (GEO 44/100): los motores leen el texto pero no entienden qué empresa es ni qué cubre cada póliza",
  q:"¿cuál es el mejor seguro de salud en Panamá?"},
 {slug:"banco-lafise-panam",company:"Banco LAFISE Panamá",site:"lafise.com.pa",score:80,grade:"B",
  gap:"su sitio no tiene datos estructurados de identidad ni H1 claros (GEO 56/100), así que los motores no lo citan como respuesta",
  q:"¿qué banco en Panamá abre cuenta a extranjeros?",
  extra:"Y una nota sincera: ya operan Chatbot Lía, así que no vengo a venderles su primer chatbot — vengo a extender lo que ya tienen hacia donde hoy no llega."},
 {slug:"panama-equity-kent-davis",company:"Panama Equity",site:"panamaequity.com",score:97,grade:"A+",
  gap:"su sitio ya está en 97/100 — de los mejores que he medido; el hueco no es la web, es que ChatGPT todavía no los nombra cuando un comprador extranjero pregunta por condominios frente al mar",
  q:"¿cuál es el mejor condominio frente al mar en Panamá?"},
];
(async()=>{
 const reg=loadRegistry(); let n=0;
 for(const x of L){
  const e=reg[x.slug]; if(!e){console.log("skip (no reg entry):",x.slug);continue;}
  const body=[
   `Estimado equipo de ${x.company}:`,``,
   `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,``,
   `Les escribí por WhatsApp hace unos días y les dejo aquí el detalle por correo, que se lee mejor.`,``,
   `Analicé ${x.site} con mi propio motor de auditoría de visibilidad en IA (lo desarrollé yo, corre en https://aideazz.xyz/api) y obtuvo ${x.score}/100 (${x.grade}). Cuando alguien le pregunta a ChatGPT o Perplexity "${x.q}", ${x.gap}.`,
   ...(x.extra?[``,x.extra]:[]),``,
   OPERATOR,``,
   `Si les sirve, en 15 minutos les muestro los arreglos concretos y cómo quedaría el Operator en su operación — sin compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api`,``,
   `Pueden ver el tono de un agente mío en producción: https://wa.me/50766623757 (prueba gratis 7 días, sin pagos ni suscripción).`,``,
   PORTFOLIO,``,
   `¡Que tengan un excelente día!`,`Saludos,`,`Elena Revicheva`,`Fundadora | Ingeniera de IA y Automatización`,`AIdeazz AI Lab ✨`,
  ].join("\n");
  const rel=`docs/selling/drafts/${x.slug}-email.txt`;
  fs.writeFileSync(path.join(ROOT,rel),`SUBJECT: Auditoría de visibilidad en IA — ${x.company} (${x.score}/100)\n\nTO: ${e.email}\n\n${body}\n`,"utf8");
  reg[x.slug]={...e,emailDraft:rel};
  n++; console.log(`✅ ${x.company.padEnd(22)} first-contact email written · ${body.length}ch · ${e.email}`);
 }
 saveRegistry(reg);
 console.log("\nrepaired:",n);
})();
