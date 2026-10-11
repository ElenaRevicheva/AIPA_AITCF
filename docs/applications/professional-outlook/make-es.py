"""Build outlook-es.html (Spanish edition) from outlook.html.

Every pair below is (exact English source, Spanish). The build fails if any English string is not
found, so an edit to the English deck that is not mirrored here cannot ship half-translated.
Edit the English deck, update the matching pair here, then: python make-es.py && python render.py
Role titles on slide 7 stay in English on purpose: that is how LATAM postings write them.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / 'outlook.html').read_text(encoding='utf-8')

PAIRS = [
    # document + every page header
    ('<html lang="en">', '<html lang="es">'),
    ('<title>Elena Revicheva — Professional Outlook 2026</title>', '<title>Elena Revicheva — Perspectiva profesional 2026</title>'),
    ('Professional Outlook · <b>October 2026</b>', 'Perspectiva profesional · <b>Octubre 2026</b>'),
    ('Professional Outlook · <b>', 'Perspectiva profesional · <b>'),
    # 1 · cover
    ('Open to remote roles · Panama, UTC−5', 'Disponible para roles remotos · Panamá, UTC−5'),
    ('AI-native systems operator, product builder and executive leader.',
     'Operadora de sistemas nativos de IA, creadora de productos y líder ejecutiva.'),
    ('I design the system, direct AI-assisted implementation, ship it, operate it — and own the outcome.',
     'Diseño el sistema, dirijo la implementación asistida por IA, lo pongo en producción, lo opero — y respondo por el resultado.'),
    ('View portfolio <svg>', 'Ver portafolio <svg>'),
    ('<div class="l">Production services</div>', '<div class="l">Servicios en producción</div>'),
    ('<div class="l">CRM deals run by agents</div>', '<div class="l">Oportunidades en CRM gestionadas por agentes</div>'),
    ('<div class="l">AI film-making machinery</div>', '<div class="l">Maquinaria de cine con IA</div>'),
    ('<div class="l">Years as Deputy CEO &amp; CLO</div>', '<div class="l">Años como Deputy CEO y CLO</div>'),
    # 2 · operating unit
    ('<div class="eyebrow">The operating model</div>', '<div class="eyebrow">El modelo operativo</div>'),
    ('<h2 style="max-width:none;font-size:48px">Not a candidate plus tools. <em>One AI-native operating unit.</em>',
     '<h2 style="max-width:none;font-size:44px">Más que una candidata: <em>una unidad operativa nativa de IA.</em>'),
    ('<div class="st">Principal: the human backing every decision</div>', '<div class="st">Principal: el respaldo humano de cada decisión</div>'),
    ('<div class="t">AI Personal Assistants (AIPAs)</div>', '<div class="t">Asistentes personales de IA (AIPAs)</div>'),
    ('What should exist, how it must behave, and whether it actually worked.',
     'Qué debe existir, cómo debe comportarse y si realmente funcionó.'),
    ('<span class="tag">Requirements</span><span class="tag">Architecture</span><span class="tag">Orchestration</span><span class="tag">Evaluation</span><span class="tag">Deployment</span><span class="tag">Monitoring</span><span class="tag">Production decisions</span>',
     '<span class="tag">Requisitos</span><span class="tag">Arquitectura</span><span class="tag">Orquestación</span><span class="tag">Evaluación</span><span class="tag">Despliegue</span><span class="tag">Monitoreo</span><span class="tag">Decisiones de producción</span>'),
    ('<div class="st">Execute at scale</div>', '<div class="st">Ejecutan a escala</div>'),
    ('Implementation code, research, drafting, media generation and scheduled operations.',
     'Código de implementación, investigación, redacción, generación de medios y operaciones programadas.'),
    ('<span class="tag info">Specialised agents</span><span class="tag info">5-provider LLM fallback</span><span class="tag info">15+ services · 25+ scheduled jobs</span>',
     '<span class="tag info">Agentes especializados</span><span class="tag info">Respaldo LLM de 5 proveedores</span><span class="tag info">15+ servicios · 25+ tareas programadas</span>'),
    ('<div class="t">Human-backed AI unit</div><div class="st">Ships and stays accountable</div>',
     '<div class="t">Unidad de IA con respaldo humano</div><div class="st">Entrega y rinde cuentas</div>'),
    ('<span class="dot"></span>Live in production</span><span class="tag">One named owner</span>',
     '<span class="dot"></span>En producción</span><span class="tag">Una responsable con nombre</span>'),
    ('From an ambiguous problem to a deployed, measurable result — with one named owner who answers for it in production.',
     'De un problema ambiguo a un resultado desplegado y medible — con una responsable con nombre que responde por él en producción.'),
    ('<b>Note · How I work</b><span>Elena Revicheva · Oct 1, 2026</span>',
     '<b>Nota · Cómo trabajo</b><span>Elena Revicheva · 1 oct 2026</span>'),
    ('I operate an AI-native development environment where specialized agents handle much of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions.',
     # the wording Elena already sent in Spanish (Marketo letter, 28 Sep), + "monitoreo" to match the English
     'Trabajo con un entorno de desarrollo nativo de IA: agentes especializados ejecutan gran parte de la implementación, y yo dirijo los requisitos, la arquitectura, la orquestación, la evaluación, el despliegue, el monitoreo y las decisiones de producción.'),
    ('<span class="tag hot">The distinction</span>', '<span class="tag hot">La diferencia</span>'),
    ('<h3>I don’t sell unaided typing speed.</h3>', '<h3>No vendo velocidad de tecleo sin ayuda.</h3>'),
    ('I own the decisions that determine what gets built, what ships, how it behaves — and what happens when it fails.',
     'Soy dueña de las decisiones que determinan qué se construye, qué sale a producción, cómo se comporta — y qué pasa cuando falla.'),
    # 3 · what I do
    ('<div class="eyebrow">What I actually do</div>', '<div class="eyebrow">Lo que realmente hago</div>'),
    ('I turn ambiguous business and creative problems into <em>working AI-native systems.</em>',
     'Convierto problemas ambiguos de negocio y creativos en <em>sistemas nativos de IA que funcionan.</em>'),
    ('<div class="ch">Define <span>01</span></div><div class="card"><h4>The outcome</h4><p>The problem and the <b>measurable result</b> it must move.</p>',
     '<div class="ch">Definir <span>01</span></div><div class="card"><h4>El resultado</h4><p>El problema y el <b>resultado medible</b> que debe mover.</p>'),
    ('<div class="ch">Map <span>02</span></div><div class="card"><h4>The workflow</h4><p>Handoffs, controls and <b>failure points</b>.</p>',
     '<div class="ch">Mapear <span>02</span></div><div class="card"><h4>El flujo</h4><p>Traspasos, controles y <b>puntos de falla</b>.</p>'),
    ('<div class="ch">Choose <span>03</span></div><div class="card"><h4>The parts</h4><p>Models, APIs, tools, data — and where <b>a human must approve</b>.</p>',
     '<div class="ch">Elegir <span>03</span></div><div class="card"><h4>Las piezas</h4><p>Modelos, APIs, herramientas, datos — y dónde <b>debe aprobar una persona</b>.</p>'),
    ('<div class="ch">Direct <span>04</span></div><div class="card"><h4>The build</h4><p>Implementation through AI coding agents: <b>Claude Code, Cursor</b>.</p>',
     '<div class="ch">Dirigir <span>04</span></div><div class="card"><h4>La construcción</h4><p>Implementación con agentes de programación con IA: <b>Claude Code, Cursor</b>.</p>'),
    ('<div class="ch">Evaluate <span>05</span></div><div class="card"><h4>The proof</h4><p>Test behaviour, score outputs, <b>reject changes that make it worse</b>.</p>',
     '<div class="ch">Evaluar <span>05</span></div><div class="card"><h4>La prueba</h4><p>Pruebo el comportamiento, califico resultados, <b>rechazo cambios que lo empeoran</b>.</p>'),
    ('<div class="ch">Operate <span>06</span></div><div class="card"><h4>The run</h4><p>Deploy, monitor, diagnose, <b>iterate from production evidence</b>.</p>',
     '<div class="ch">Operar <span>06</span></div><div class="card"><h4>La operación</h4><p>Despliego, monitoreo, diagnostico, <b>itero con evidencia de producción</b>.</p>'),
    ('<div class="lbl">My development model</div>', '<div class="lbl">Mi modelo de desarrollo</div>'),
    ('<div class="s">Technical direction</div>', '<div class="s">Dirección técnica</div>'),
    ('<div class="s">Architecture</div>', '<div class="s">Arquitectura</div>'),
    ('<div class="s">AI-assisted implementation</div>', '<div class="s">Implementación asistida por IA</div>'),
    ('<div class="s last">Production ownership</div>', '<div class="s last">Responsabilidad en producción</div>'),
    # 4 · lanes
    ('<div class="eyebrow">Where I create the most value</div>', '<div class="eyebrow">Dónde creo más valor</div>'),
    ('Three lanes. <em>One pattern underneath.</em>', 'Tres líneas. <em>Un mismo patrón de fondo.</em>'),
    ('<span class="tag">Lane 01</span>', '<span class="tag">Línea 01</span>'),
    ('<span class="tag">Lane 02</span>', '<span class="tag">Línea 02</span>'),
    ('<span class="tag">Lane 03</span>', '<span class="tag">Línea 03</span>'),
    ('<h3>AI Operations</h3>', '<h3>Operaciones de IA</h3>'),
    ('<li>Workflow discovery &amp; automation</li><li>Agent orchestration</li><li>CRM &amp; pipeline operations</li><li>Monitoring &amp; feedback loops</li>',
     '<li>Descubrimiento y automatización de flujos</li><li>Orquestación de agentes</li><li>Operación de CRM y pipeline</li><li>Monitoreo y ciclos de retroalimentación</li>'),
    ('<div class="lbl">Proof in production</div>', '<div class="lbl">Prueba en producción</div>'),
    ('deals written into HubSpot by my agents, plus 1,200+ contacts and 1,800+ companies — research, qualify, draft, one human tap, send.',
     'oportunidades registradas en HubSpot por mis agentes, más 1,200+ contactos y 1,800+ empresas — investigar, calificar, redactar, un toque humano, enviar.'),
    ('<h3>AI Product &amp; Transformation</h3>', '<h3>Producto y transformación con IA</h3>'),
    ('<li>Prototype the experience</li><li>Connect systems &amp; deploy</li><li>Organise operations around it</li><li>Improve from evidence</li>',
     '<li>Prototipar la experiencia</li><li>Conectar sistemas y desplegar</li><li>Organizar la operación a su alrededor</li><li>Mejorar con evidencia</li>'),
    ('of 18 websites by my <a href="https://aideazz.xyz/api">AI Visibility Audit API ↗</a> in 1–10 October alone — 18 run by people on the public page. Anyone enters a website, no login, and gets 34 checks on how ChatGPT, Perplexity and Claude see it.',
     'de 18 sitios web con mi <a href="https://aideazz.xyz/api">API de auditoría de visibilidad en IA ↗</a> solo del 1 al 10 de octubre — 18 hechas por personas en la página pública. Cualquiera ingresa un sitio, sin registrarse, y recibe 34 controles de cómo lo ven ChatGPT, Perplexity y Claude.'),
    ('<h3>Creative AI Systems</h3>', '<h3>Sistemas creativos con IA</h3>'),
    ('<li>Concept, narrative &amp; world-building</li><li>Image · video · audio orchestration</li><li>Production pipelines</li><li>Published experiences</li>',
     '<li>Concepto, narrativa y construcción de mundos</li><li>Orquestación de imagen · video · audio</li><li>Pipelines de producción</li><li>Experiencias publicadas</li>'),
    ('published from my ATUONA universe — 99 multidisciplinary art fragments in Russian and English, made end to end by my own pipeline.',
     'publicadas desde mi universo ATUONA — 99 fragmentos de arte multidisciplinario en ruso e inglés, hechas de principio a fin con mi propio pipeline.'),
    ('<b>The through-line:</b> I design intelligent systems and the experience around them — from the agents that run a business to the films they make.',
     '<b>El hilo conductor:</b> diseño sistemas inteligentes y la experiencia a su alrededor — desde los agentes que operan un negocio hasta las películas que crean.'),
    # 5 · evidence
    ('<div class="eyebrow">Evidence</div>', '<div class="eyebrow">Evidencia</div>'),
    ('I operate systems, <em>not slides.</em>', 'Opero sistemas, <em>no diapositivas.</em>'),
    ('<span class="dot"></span>Live · one cloud server</span>', '<span class="dot"></span>En vivo · un servidor en la nube</span>'),
    ('<div class="t">long-running production services + 25+ scheduled jobs</div><div class="s">All auto-restart. I am the architect and the on-call.</div>',
     '<div class="t">servicios permanentes en producción + 25+ tareas programadas</div><div class="s">Todos con reinicio automático. Soy la arquitecta y la responsable de guardia.</div>'),
    ('<div class="rt">Opportunities processed</div><div class="rs">LangGraph pipeline · human decision gates</div><div class="n">11,000+</div><div class="d">Learns hourly from the decisions I record in the CRM.</div><span class="tag">Discovery &amp; qualification</span>',
     '<div class="rt">Oportunidades procesadas</div><div class="rs">Pipeline LangGraph · decisiones humanas</div><div class="n">11,000+</div><div class="d">Aprende cada hora de las decisiones que registro en el CRM.</div><span class="tag">Descubrimiento y calificación</span>'),
    ('<div class="rt">CRM deals run by agents</div><div class="rs">HubSpot · source attribution</div><div class="n">3,000+</div><div class="d">Plus 1,200+ contacts and 1,800+ companies written in by agents. A send is refused if an attachment fails to load.</div><span class="tag">AI operations · RevOps</span>',
     '<div class="rt">Oportunidades CRM por agentes</div><div class="rs">HubSpot · atribución de origen</div><div class="n">3,000+</div><div class="d">Además, 1,200+ contactos y 1,800+ empresas registrados por agentes. Un envío se rechaza si un adjunto no carga.</div><span class="tag">Operaciones de IA · RevOps</span>'),
    ('<div class="rt">AI-visibility audits</div><div class="rs">Public API · GEO / AEO</div><div class="n">39 audits</div><div class="d">Of 18 websites in 1–10 October (server logs); 18 run by people on the public page. 34 checks each; my own hub scores 100/100.</div><span class="tag">GEO · AEO · Tech SEO</span>',
     '<div class="rt">Auditorías de visibilidad en IA</div><div class="rs">API pública · GEO / AEO</div><div class="n">39</div><div class="d">Auditorías de 18 sitios web, 1–10 de octubre (registros del servidor); 18 por personas en la página pública. Mi sitio: 100/100.</div><span class="tag">GEO · AEO · SEO técnico</span>'),
    ('<div class="rt">AI film-making machinery</div><div class="rs">ATUONA AI Film Studio</div><div class="n">9 films</div><div class="d"><i>Crimson Escape</i>: 3:36, 16 generated shots, mixed to broadcast loudness (−16 LUFS).</div><span class="tag">Creative AI production</span>',
     '<div class="rt">Maquinaria de cine con IA</div><div class="rs">ATUONA AI Film Studio</div><div class="n">9 películas</div><div class="d"><i>Crimson Escape</i>: 3:36, 16 tomas generadas, mezcla a sonoridad de transmisión (−16 LUFS).</div><span class="tag">Producción creativa con IA</span>'),
    ('<div class="rt">Automated tests</div><div class="rs">Unit · integration · golden set</div><div class="n">600+</div><div class="d">Unit, integration and golden-set tests, plus a 5-provider LLM fallback chain.</div><span class="tag">Reliability &amp; evaluation</span>',
     '<div class="rt">Pruebas automatizadas</div><div class="rs">Unitarias · integración · golden set</div><div class="n">600+</div><div class="d">Pruebas unitarias, de integración y golden set, más respaldo LLM de 5 proveedores.</div><span class="tag">Confiabilidad y evaluación</span>'),
    ('<div class="rt">Executive foundation</div><div class="rs">Deputy CEO &amp; Chief Legal Officer</div><div class="n">7 yrs</div><div class="d">Regional e-government operator: I ran the board process and the legal side of moving public services online.</div><span class="tag">Leadership</span>',
     '<div class="rt">Base ejecutiva</div><div class="rs">Deputy CEO y Chief Legal Officer</div><div class="n">7 años</div><div class="d">Operador regional de gobierno electrónico: dirigí el proceso del consejo y la parte legal de llevar los servicios públicos a internet.</div><span class="tag">Liderazgo</span>'),
    ('All figures are floors from production logs and the live CRM API, re-counted 11 October 2026.',
     'Todas las cifras son mínimos tomados de los registros de producción y de la API del CRM en vivo, recontados el 11 de octubre de 2026.'),
    # 6 · failure
    ('<div class="eyebrow">Ownership under failure</div>', '<div class="eyebrow">Responsabilidad ante las fallas</div>'),
    ('What I do when it breaks — <em>and what it’s called.</em>', 'Qué hago cuando algo falla — <em>y cómo se llama.</em>'),
    ('<span class="tag warn">Silent failure</span>', '<span class="tag warn">Falla silenciosa · silent failure</span>'),
    ('<h4>An integration that never said it was broken</h4>', '<h4>Una integración que nunca avisó que estaba rota</h4>'),
    ('Trial sign-ups had never reached the CRM since launch, while the sender’s log looked healthy.',
     'Los registros de prueba nunca llegaron al CRM desde el lanzamiento, aunque el log del emisor se veía sano.'),
    ('Audited from the receiving end, root-caused, fixed, backfilled all 28 lost users.',
     'Audité desde el lado receptor, encontré la causa raíz, lo corregí y recuperé a los 28 usuarios perdidos.'),
    ('<span class="tag warn">Vacuous guard</span>', '<span class="tag warn">Control vacío · vacuous guard</span>'),
    ('<h4>A spending cap that could never fire</h4>', '<h4>Un tope de gasto que nunca podía activarse</h4>'),
    ('The budget guard read a price field the vendor never sends, so every price passed.',
     'El control de presupuesto leía un campo de precio que el proveedor nunca envía, así que todo precio pasaba.'),
    ('Fixed it against the vendor’s real response and published the postmortem.',
     'Lo corregí contra la respuesta real del proveedor y publiqué el postmortem.'),
    ('<span class="tag info">Evaluation gate</span>', '<span class="tag info">Puerta de evaluación · evaluation gate</span>'),
    ('<h4>The more complex model lost</h4>', '<h4>El modelo más complejo perdió</h4>'),
    ('A RAG upgrade to my screening judge scored lower on an evaluation set built from my real decisions.',
     'Una mejora con RAG de mi juez de filtrado puntuó peor en un set de evaluación hecho con mis decisiones reales.'),
    ('Shipped it switched off. Accuracy beats sophistication.', 'La lancé desactivada. La precisión le gana a la sofisticación.'),
    ('<span class="tag ok">Graceful degradation</span>', '<span class="tag ok">Degradación elegante · graceful degradation</span>'),
    ('<h4>A provider retired its models. Nothing went down.</h4>', '<h4>Un proveedor retiró sus modelos. Nada se cayó.</h4>'),
    ('A vendor deprecated the models my agents used.', 'Un proveedor descontinuó los modelos que usaban mis agentes.'),
    ('The five-provider chain kept the bots answering. One pipeline still lost three good jobs for two days, until I routed it through the chain.',
     'La cadena de cinco proveedores mantuvo a los bots respondiendo. Un pipeline aun así perdió tres buenos empleos durante dos días, hasta que lo pasé por la cadena.'),
    ('<span>Found</span>', '<span>Hallazgo</span>'),
    ('<span>Did</span>', '<span>Acción</span>'),
    ('<h4>Kintsugi, not cover-ups</h4><p>The repair stays visible. Postmortems with named failure modes are published openly.</p>',
     '<h4>Kintsugi, no encubrimientos</h4><p>La reparación queda a la vista. Publico los postmortems abiertamente, con cada modo de falla por su nombre.</p>'),
    # 7 · roles (titles stay English, see docstring)
    ('<div class="eyebrow">Where I fit</div>', '<div class="eyebrow">Dónde encajo</div>'),
    ('The roles I’m <em>built for.</em>', 'Los roles para los que <em>estoy hecha.</em>'),
    ('<b>AI operations &amp; implementation</b>', '<b>Operaciones e implementación de IA</b>'),
    ('<b>AI product &amp; transformation</b>', '<b>Producto y transformación con IA</b>'),
    ('<b>Creative technology</b>', '<b>Tecnología creativa</b>'),
    ('>Good fit</div>', '>Buen encaje</div>'),
    ('<span class="tag ok">Business problem</span>', '<span class="tag ok">Problema de negocio</span>'),
    ('<span class="tag ok">Process</span>', '<span class="tag ok">Proceso</span>'),
    ('<span class="tag ok">System design</span>', '<span class="tag ok">Diseño del sistema</span>'),
    ('<span class="tag ok">AI &amp; tools</span>', '<span class="tag ok">IA y herramientas</span>'),
    ('<span class="tag ok">Implementation</span>', '<span class="tag ok">Implementación</span>'),
    ('<span class="tag ok">Deployment</span>', '<span class="tag ok">Despliegue</span>'),
    ('<span class="tag ok">People</span>', '<span class="tag ok">Personas</span>'),
    ('<span class="tag ok">Metrics</span>', '<span class="tag ok">Métricas</span>'),
    ('<span class="tag ok">Iteration</span>', '<span class="tag ok">Iteración</span>'),
    ('>Not my fit</div>', '>No encajo</div>'),
    ('Roles whose core value is unaided coding, algorithm drills or live coding — or proving the work can be done without AI.',
     'Roles cuyo valor central es programar sin ayuda, ejercicios de algoritmos o live coding — o demostrar que el trabajo se puede hacer sin IA.'),
    ('<span class="dot"></span>Fully remote</span>', '<span class="dot"></span>100% remoto</span>'),
    ('<span class="tag">Panama · UTC−5 · overlaps US Eastern &amp; Central</span>', '<span class="tag">Panamá · UTC−5 · coincide con el horario Este y Centro de EE. UU.</span>'),
    ('<span class="tag">LATAM-friendly teams</span>', '<span class="tag">Equipos abiertos a LATAM</span>'),
    ('<span class="tag">English · Russian</span>', '<span class="tag">Inglés · Ruso</span>'),
    # 8 · close
    ('<h2>AI-native systems<br><em>ownership.</em></h2>', '<h2>Sistemas nativos de IA,<br><em>de principio a fin.</em></h2>'),
    ('Former executive. Hands-on builder. Production operator. Creative technologist.',
     'Ex ejecutiva. Constructora práctica. Operadora en producción. Tecnóloga creativa.'),
    ('I’m looking for a team that wants someone to own the path from an ambiguous problem to a deployed, measurable AI system.',
     'Busco un equipo que quiera a alguien que se haga cargo de todo el camino: de un problema ambiguo a un sistema de IA desplegado y medible.'),
    ('<div class="lbl">Email</div>', '<div class="lbl">Correo</div>'),
    ('<div class="lbl">Portfolio</div>', '<div class="lbl">Portafolio</div>'),
    ('<div class="lbl">AI films</div>', '<div class="lbl">Películas de IA</div>'),
    ('<div class="lbl">Audit API</div>', '<div class="lbl">API de auditoría</div>'),
    ('<div class="v">Live board <svg>', '<div class="v">Tablero en vivo <svg>'),
    ('<span>Panama · Remote · UTC−5</span>', '<span>Panamá · Remoto · UTC−5</span>'),
    ('All imagery generated on my ATUONA pipeline', 'Todas las imágenes generadas con mi pipeline ATUONA'),
    # Spanish runs ~25% longer than English: slide 4 lost its through-line and slide 7's flow hit the
    # card edge. Size tweaks for this edition only, so the approved English layout is untouched.
    ('</style>', '''/* Spanish edition only (make-es.py) */
.lane img{height:150px}
.lane h3{font-size:22px}
.lane li{font-size:15.5px}
.lane .pr p{font-size:14.5px}
.through{font-size:18px}
.flow{flex-wrap:wrap;row-gap:8px}
.flow .tag{font-size:14px}
.s8 .sub{font-size:23px}
</style>'''),
    # portfolio links open the Spanish site
    ('href="https://aideazz.xyz/portfolio"', 'href="https://aideazz.xyz/portfolio?lng=es"'),
    # general figure labels LAST: the slide-5 tile pairs above must see the English first (11 Oct 2026)
    ('<div class="n">39 audits</div>', '<div class="n">39 auditorías</div>'),
    ('<div class="n">9 films</div>', '<div class="n">9 películas</div>'),
]

out = src
missing = []
for en, es in PAIRS:
    if en not in out:
        missing.append(en[:90])
    out = out.replace(en, es)
if missing:
    raise SystemExit('English strings not found (deck changed? update make-es.py):\n  ' + '\n  '.join(missing))
(HERE / 'outlook-es.html').write_text(out, encoding='utf-8')
print(f'outlook-es.html written, {len(PAIRS)} pairs applied')
