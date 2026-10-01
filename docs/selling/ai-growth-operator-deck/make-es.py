"""Build aigo-es.html (Spanish edition) from aigo.html — same method as the Outlook deck's make-es.py.

Every pair below is (exact English source, Spanish). The build FAILS if any English string is not found, so an
edit to the English deck that is not mirrored here cannot ship half-translated.
Edit aigo.html, update the matching pair here, then: python make-es.py && python render.py
Register: formal "usted", the way Panama / LATAM service businesses are addressed. "AI Growth Operator" stays the
product name in English, as on the site.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / 'aigo.html').read_text(encoding='utf-8')

PAIRS = [
    # document + page headers
    ('<html lang="en">', '<html lang="es">'),
    ('<title>AIdeazz AI Lab — AI Growth Operator 2026</title>', '<title>AIdeazz AI Lab — AI Growth Operator 2026 (ES)</title>'),
    ('AI Growth Operator · <b>October 2026</b>', 'AI Growth Operator · <b>Octubre 2026</b>'),
    # 1 · cover
    ('<span class="dot"></span>For high-ticket service businesses', '<span class="dot"></span>Para empresas de servicios de alto valor'),
    ('We install AI growth operators for service businesses.', 'Instalamos operadores de crecimiento con IA en empresas de servicios.'),
    ('It gets you found in AI search, researches and contacts the right prospects, follows up, and keeps your CRM alive — inside the tools you already use.',
     'Lo hace visible en las búsquedas con IA, investiga y contacta a los prospectos adecuados, da seguimiento y mantiene vivo su CRM — dentro de las herramientas que ya usa.'),
    ('Free AI-visibility audit <svg>', 'Auditoría gratuita de visibilidad en IA <svg>'),
    ('<div class="l">AI-visibility audits run</div>', '<div class="l">Auditorías de visibilidad en IA</div>'),
    ('<div class="l">Websites scored</div>', '<div class="l">Sitios web evaluados</div>'),
    ('<div class="l">CRM deals run by our agents</div>', '<div class="l">Oportunidades en CRM de nuestros agentes</div>'),
    ('<div class="l">Automated tests</div>', '<div class="l">Pruebas automatizadas</div>'),
    # 2 · problem
    ('<div class="eyebrow">The business problem</div>', '<div class="eyebrow">El problema del negocio</div>'),
    ('Your best customers research you first — <em>and quietly get lost on the way.</em>',
     'Sus mejores clientes lo investigan primero — <em>y se pierden en silencio por el camino.</em>'),
    ('<div class="no">01 · Discovery</div><h4>AI search</h4>', '<div class="no">01 · Descubrimiento</div><h4>Búsqueda con IA</h4>'),
    ("Buyers now ask ChatGPT and Perplexity who to trust. If an assistant can't cite you, you never make the shortlist.",
     'Hoy los compradores preguntan a ChatGPT y Perplexity en quién confiar. Si un asistente no puede citarlo, usted no entra en la lista corta.'),
    ('<span class="tag warn">Not recommended</span>', '<span class="tag warn">No recomendado</span>'),
    ('<div class="no">02 · Inquiry</div><h4>Forms &amp; WhatsApp</h4>', '<div class="no">02 · Consulta</div><h4>Formularios y WhatsApp</h4>'),
    ('Messages arrive at all hours, often in two languages, while the team is busy serving clients.',
     'Los mensajes llegan a toda hora, a menudo en dos idiomas, mientras el equipo está ocupado atendiendo clientes.'),
    ('<span class="tag warn">Slow first reply</span>', '<span class="tag warn">Primera respuesta lenta</span>'),
    ('<div class="no">03 · Follow-up</div><h4>Qualification</h4>', '<div class="no">03 · Seguimiento</div><h4>Calificación</h4>'),
    ('Qualifying and following up are still manual, so warm leads cool off before anyone calls back.',
     'Calificar y dar seguimiento siguen siendo tareas manuales, y los leads interesados se enfrían antes de que alguien los llame.'),
    ('<span class="tag warn">No follow-up</span>', '<span class="tag warn">Sin seguimiento</span>'),
    ('Records go stale, ownership gets fuzzy, and good opportunities age out without anyone noticing.',
     'Los registros se desactualizan, no queda claro quién es responsable y las buenas oportunidades envejecen sin que nadie lo note.'),
    ('<span class="tag warn">Stale pipeline</span>', '<span class="tag warn">Pipeline desactualizado</span>'),
    ('<span class="tag hot">The trap</span><h3>Buying another dashboard doesn\'t close this gap.</h3>',
     '<span class="tag hot">La trampa</span><h3>Comprar otro dashboard no cierra esta brecha.</h3>'),
    ('<span class="tag ok">The opportunity</span><h3>Run it as one operating loop:</h3>',
     '<span class="tag ok">La oportunidad</span><h3>Operarlo como un solo ciclo:</h3>'),
    ('<span class="tag ok">Discovery</span>', '<span class="tag ok">Descubrimiento</span>'),
    ('<span class="tag ok">Conversation</span>', '<span class="tag ok">Conversación</span>'),
    ('<span class="tag ok">Follow-up</span>', '<span class="tag ok">Seguimiento</span>'),
    ('<span class="tag ok">Measurement</span>', '<span class="tag ok">Medición</span>'),
    # 3 · not another CRM
    ('<div class="eyebrow">What you are buying</div>', '<div class="eyebrow">Lo que usted compra</div>'),
    ("We don't sell another CRM. <em>We install an operator.</em>", 'No vendemos otro CRM. <em>Instalamos un operador.</em>'),
    ('<div class="k">CRM software sells</div>', '<div class="k">El software de CRM vende</div>'),
    ('A system you configure for months — consultants, integrations, imports, training, maintenance.',
     'Un sistema que usted configura durante meses: consultores, integraciones, importaciones, capacitación, mantenimiento.'),
    ('⚠ Months later, maybe it works.', '⚠ Meses después, quizá funcione.'),
    ('<div class="k">Marketing platforms sell</div><h3>Features</h3>', '<div class="k">Las plataformas de marketing venden</div><h3>Funciones</h3>'),
    ('CRM, email, forms and chat in one place. Useful — but your team still has to create the demand.',
     'CRM, correo, formularios y chat en un solo lugar. Útil, pero su equipo todavía tiene que crear la demanda.'),
    ('⚠ It never says “I found three companies that need you.”', '⚠ Nunca le dice: “Encontré tres empresas que lo necesitan.”'),
    ('<div class="k">Most agencies sell</div><h3>Traffic</h3>', '<div class="k">La mayoría de las agencias vende</div><h3>Tráfico</h3>'),
    ('SEO or ads that end at a visit or a lead. What happens after the click is still your problem.',
     'SEO o anuncios que terminan en una visita o un lead. Lo que pasa después del clic sigue siendo su problema.'),
    ('⚠ They stop exactly where the money starts.', '⚠ Se detienen justo donde empieza el dinero.'),
    ('<div class="k">We sell</div><h3>Outcomes</h3>', '<div class="k">Nosotros vendemos</div><h3>Resultados</h3>'),
    ('An operator that works inside the tools you already use and carries every opportunity from first search to signed contract.',
     'Un operador que trabaja dentro de las herramientas que usted ya usa y lleva cada oportunidad desde la primera búsqueda hasta el contrato firmado.'),
    ('“We wake up every morning looking for your next customer.”', '“Cada mañana despertamos buscando a su próximo cliente.”'),
    ("<div class=\"lbl\">Why it's hard to copy</div>", '<div class="lbl">Por qué es difícil de copiar</div>'),
    ('Everyone has the same AI models. <b>The edge is orchestration</b> — one loop that connects AI search, research, outreach, WhatsApp, follow-up and the CRM, and reports on all of it.',
     'Todos tienen los mismos modelos de IA. <b>La ventaja es la orquestación</b>: un solo ciclo que conecta la búsqueda con IA, la investigación, el contacto, WhatsApp, el seguimiento y el CRM — y reporta sobre todo ello.'),
    # 4 · what gets installed
    ('<div class="eyebrow">What gets installed</div>', '<div class="eyebrow">Lo que se instala</div>'),
    ('One operator. <em>The whole customer loop.</em>', 'Un operador. <em>Todo el ciclo del cliente.</em>'),
    ("<div class=\"ch\">Get found <span>01</span></div><div class=\"card\"><h4>AI search visibility</h4><p>Why assistants don't cite you today — and the <b>specific fixes</b>, check by check.</p>",
     '<div class="ch">Visibilidad <span>01</span></div><div class="card"><h4>Visibilidad en búsquedas con IA</h4><p>Por qué los asistentes no lo citan hoy — y las <b>correcciones concretas</b>, punto por punto.</p>'),
    ('<div class="ch">Research <span>02</span></div><div class="card"><h4>Prospect research</h4><p>Live-web research on each prospect: <b>pain signals</b> and a real reason to talk.</p>',
     '<div class="ch">Investigar <span>02</span></div><div class="card"><h4>Investigación de prospectos</h4><p>Investigación en la web en vivo sobre cada prospecto: <b>señales de necesidad</b> y un motivo real para conversar.</p>'),
    ('<div class="ch">Qualify <span>03</span></div><div class="card"><h4>Inquiries</h4><p>Form and chat inquiries captured and qualified, with <b>a tailored reply drafted</b> for you. The human close stays yours.</p>',
     '<div class="ch">Calificar <span>03</span></div><div class="card"><h4>Consultas</h4><p>Consultas del formulario y del chat capturadas y calificadas, con <b>una respuesta personalizada redactada</b> para usted. El cierre humano sigue siendo suyo.</p>'),
    ('<div class="ch">Reach out <span>04</span></div><div class="card"><h4>Personal outreach</h4><p>Drafted for each prospect, sent only after <b>your one-tap approval</b>.</p>',
     '<div class="ch">Contactar <span>04</span></div><div class="card"><h4>Contacto personalizado</h4><p>Redactado para cada prospecto y enviado solo después de <b>su aprobación con un toque</b>.</p>'),
    ('<div class="ch">Follow up <span>05</span></div><div class="card"><h4>No lead goes quiet</h4><p>Tasks and reminders until there is a <b>reply, a call or a clear no</b>.</p>',
     '<div class="ch">Seguimiento <span>05</span></div><div class="card"><h4>Ningún lead se olvida</h4><p>Tareas y recordatorios hasta obtener <b>una respuesta, una llamada o un no claro</b>.</p>'),
    ('<div class="ch">Report <span>06</span></div><div class="card"><h4>CRM &amp; morning brief</h4><p>CRM kept current; every morning: what is <b>new, active, aging</b> and worth acting on.</p>',
     '<div class="ch">Reportar <span>06</span></div><div class="card"><h4>CRM y resumen matutino</h4><p>CRM siempre al día; cada mañana: lo <b>nuevo, lo activo, lo que se enfría</b> y lo que vale la pena atender.</p>'),
    ('<div class="lbl">Nothing goes out without you</div>', '<div class="lbl">Nada sale sin usted</div>'),
    ('<div class="s">AI drafts</div>', '<div class="s">La IA redacta</div>'),
    ('<div class="s hum">You approve</div>', '<div class="s hum">Usted aprueba</div>'),
    ('<div class="s">Operator sends</div>', '<div class="s">El operador envía</div>'),
    ('<div class="s last">CRM records it</div>', '<div class="s last">El CRM lo registra</div>'),
    # 5 · who it is for
    ('<div class="eyebrow">Who it is designed for</div>', '<div class="eyebrow">Para quién está diseñado</div>'),
    ('Built for a buying pattern, <em>not an industry.</em>', 'Diseñado para un patrón de compra, <em>no para una industria.</em>'),
    ('A strong fit when most of these are true', 'Encaja bien cuando se cumple la mayoría de estos puntos'),
    ('<i>✓</i>An average sale above roughly $2,000', '<i>✓</i>Una venta promedio de más de unos US$2,000'),
    ('<i>✓</i>Leads start online; a person still closes the sale', '<i>✓</i>Los leads llegan por internet; una persona cierra la venta'),
    ('<i>✓</i>WhatsApp or phone is part of how you sell', '<i>✓</i>WhatsApp o el teléfono son parte de cómo vende'),
    ('<i>✓</i>International or English-speaking clients who research first', '<i>✓</i>Clientes internacionales o de habla inglesa que investigan antes de escribir'),
    ('<i>✓</i>Margins that justify a managed growth system', '<i>✓</i>Márgenes que justifican un sistema de crecimiento gestionado'),
    ('<i>✓</i>No in-house AI team already doing this', '<i>✓</i>Sin un equipo interno de IA que ya haga esto'),
    ('<span class="tag">Strong early fit</span>', '<span class="tag">Encaje inicial fuerte</span>'),
    ('<h4>Medical tourism</h4><p>Patients compare clinics across borders before they ever write.</p>',
     '<h4>Turismo médico</h4><p>Los pacientes comparan clínicas de varios países antes de escribir.</p>'),
    ('<h4>Immigration &amp; relocation</h4><p>A trust business: people ask AI who to hire before they call.</p>',
     '<h4>Inmigración y reubicación</h4><p>Un negocio de confianza: la gente pregunta a la IA a quién contratar antes de llamar.</p>'),
    ('<h4>Dental implants &amp; cosmetic dentistry</h4><p>High value, research-heavy, often international.</p>',
     '<h4>Implantes dentales y odontología estética</h4><p>Alto valor, mucha investigación previa, a menudo internacional.</p>'),
    ('<h4>Luxury charters &amp; hospitality</h4><p>High ticket, WhatsApp-first, owner-operated.</p>',
     '<h4>Charters y hospitalidad de lujo</h4><p>Ticket alto, todo por WhatsApp, gestionados por sus dueños.</p>'),
    ('<span class="k">Not a fit</span>', '<span class="k">No encaja</span>'),
    ('<span class="tag no">Enterprises with large marketing teams</span>', '<span class="tag no">Grandes empresas con equipos de marketing</span>'),
    ('<span class="tag no">Restaurants &amp; cafés</span>', '<span class="tag no">Restaurantes y cafés</span>'),
    ('<span class="tag no">Gyms &amp; salons</span>', '<span class="tag no">Gimnasios y salones</span>'),
    ('<span class="tag no">E-commerce stores</span>', '<span class="tag no">Tiendas de e-commerce</span>'),
    ('<span class="tag no">Low-ticket local services</span>', '<span class="tag no">Servicios locales de bajo ticket</span>'),
    # 6 · proof
    ('<div class="eyebrow">Proof, not promises</div>', '<div class="eyebrow">Pruebas, no promesas</div>'),
    ('We run the operator <em>on our own business first.</em>', 'Primero usamos el operador <em>en nuestro propio negocio.</em>'),
    ('<span class="dot"></span>Live in production</span>', '<span class="dot"></span>En producción</span>'),
    ('<div class="t">CRM deals run by our agents</div><div class="s">1,300+ contacts · 2,100+ companies, each with the agent that found it.</div>',
     '<div class="t">Oportunidades en CRM de nuestros agentes</div><div class="s">1,300+ contactos · 2,100+ empresas, cada una con el agente que la encontró.</div>'),
    ('<div class="rt">AI-visibility audits</div><div class="rs">Public API · aideazz.xyz/api</div>',
     '<div class="rt">Auditorías de visibilidad en IA</div><div class="rs">API pública · aideazz.xyz/api</div>'),
    ('How ChatGPT, Perplexity and Claude read a business — scored across 210+ websites.',
     'Cómo ChatGPT, Perplexity y Claude leen un negocio — evaluado en más de 210 sitios web.'),
    ('<span class="tag">Get found</span>', '<span class="tag">Visibilidad</span>'),
    ('<div class="rt">Signals checked</div>', '<div class="rt">Señales revisadas</div>'),
    ('GEO · AEO · technical SEO', 'GEO · AEO · SEO técnico'),
    ('Every check returns the fix and why it matters. Our own hub scores 100/100.',
     'Cada revisión entrega la corrección y por qué importa. Nuestro propio sitio obtiene 100/100.'),
    ('<div class="rt">Approved sending</div><div class="rs">Human in the loop</div><div class="n">1 tap</div>',
     '<div class="rt">Envío aprobado</div><div class="rs">Siempre con una persona</div><div class="n">1 toque</div>'),
    ('Every message is approved before it goes out. A missing attachment blocks the send.',
     'Cada mensaje se aprueba antes de salir. Si falta un adjunto, el envío se bloquea.'),
    ('<span class="tag">Reach out</span>', '<span class="tag">Contacto</span>'),
    ('<div class="rt">AI providers in fallback</div><div class="rs">Resilience</div>',
     '<div class="rt">Proveedores de IA de respaldo</div><div class="rs">Resiliencia</div>'),
    ('If one AI vendor goes down, the operator keeps working on the next one.',
     'Si un proveedor de IA falla, el operador sigue trabajando con el siguiente.'),
    ('<span class="tag">Reliability</span>', '<span class="tag">Confiabilidad</span>'),
    ('<div class="rt">Automated tests</div><div class="rs">Unit · integration · golden set</div>',
     '<div class="rt">Pruebas automatizadas</div><div class="rs">Unitarias · integración · golden set</div>'),
    ('Changes are tested before release; worse results are rejected.',
     'Cada cambio se prueba antes de publicarse; si empeora los resultados, se rechaza.'),
    ('<span class="tag">Quality</span>', '<span class="tag">Calidad</span>'),
    ('<div class="rt">Reply to a new inquiry</div><div class="rs">Website form or chat</div><div class="n">Draft</div>',
     '<div class="rt">Respuesta a una consulta nueva</div><div class="rs">Formulario web o chat</div><div class="n">Borrador</div>'),
    ('A tailored reply is drafted for you to send — the conversation never waits for a free hour.',
     'Se redacta una respuesta personalizada para que usted la envíe: la conversación nunca tiene que esperar.'),
    ('<span class="tag">Qualify</span>', '<span class="tag">Calificar</span>'),
    ('Our own system, not a client case study. Figures are floors from production logs and the live CRM, counted 28–29 September 2026.',
     'Nuestro propio sistema, no un caso de cliente. Las cifras son mínimos tomados de los registros de producción y del CRM en vivo, contados el 28–29 de septiembre de 2026.'),
    # 7 · how we start
    ('<div class="eyebrow">How we start</div>', '<div class="eyebrow">Cómo empezamos</div>'),
    ('Three steps. <em>You see value before you commit.</em>', 'Tres pasos. <em>Usted ve el valor antes de comprometerse.</em>'),
    ('<span class="tag ok">Free</span>', '<span class="tag ok">Gratis</span>'),
    ('<h3>AI-visibility audit</h3>', '<h3>Auditoría de visibilidad en IA</h3>'),
    ('See how ChatGPT, Perplexity and Claude read your business today — with the exact fixes, ranked.',
     'Vea cómo ChatGPT, Perplexity y Claude leen su negocio hoy — con las correcciones exactas, por orden de prioridad.'),
    ('Run it at aideazz.xyz/api →', 'Hágala en aideazz.xyz/api →'),
    ('<span class="tag">Fixed price</span>', '<span class="tag">Precio fijo</span>'),
    ('<h3>Growth diagnostic</h3>', '<h3>Diagnóstico de crecimiento</h3>'),
    ('We map your path from first search to signed contract: where leads arrive, where they cool off, and what the operator would change.',
     'Mapeamos su camino desde la primera búsqueda hasta el contrato firmado: dónde llegan los leads, dónde se enfrían y qué cambiaría el operador.'),
    ('Fixed scope, fixed price', 'Alcance fijo, precio fijo'),
    ('<span class="tag">Monthly</span>', '<span class="tag">Mensual</span>'),
    ('<h3>Install &amp; manage</h3>', '<h3>Instalación y gestión</h3>'),
    ('We install the modules your business needs, then run and improve the operator every month — measured in your CRM.',
     'Instalamos los módulos que su negocio necesita y luego operamos y mejoramos el operador cada mes — medido en su CRM.'),
    ('One package, one owner, one report', 'Un paquete, un responsable, un reporte'),
    ('<div class="lbl">What we measure</div>', '<div class="lbl">Lo que medimos</div>'),
    ('<span class="tag ok">More patients</span>', '<span class="tag ok">Más pacientes</span>'),
    ('<span class="tag ok">More bookings</span>', '<span class="tag ok">Más reservas</span>'),
    ('<span class="tag ok">More consultations</span>', '<span class="tag ok">Más consultas</span>'),
    ('<span class="tag ok">More signed contracts</span>', '<span class="tag ok">Más contratos firmados</span>'),
    ("Buyers don't want “AI.” They want customers.", 'Los compradores no quieren “IA”. Quieren clientes.'),
    # 8 · close
    ('<h2>Your first AI<br><em>growth operator.</em></h2>', '<h2>Su primer operador<br><em>de crecimiento con IA.</em></h2>'),
    ('It finds prospects, follows up, and keeps working while you run your business.',
     'Encuentra prospectos, da seguimiento y sigue trabajando mientras usted dirige su negocio.'),
    ("Start with a free AI-visibility audit. We'll show you exactly where AI search and slow follow-up are costing you customers — practical either way.",
     'Empiece con una auditoría gratuita de visibilidad en IA. Le mostramos exactamente dónde la búsqueda con IA y el seguimiento lento le están costando clientes — útil en cualquier caso.'),
    ('<div class="lbl">Email</div>', '<div class="lbl">Correo</div>'),
    ('<div class="lbl">Free audit</div>', '<div class="lbl">Auditoría gratis</div>'),
    ('<div class="lbl">Portfolio</div>', '<div class="lbl">Portafolio</div>'),
    ('<div class="lbl">How we work</div>', '<div class="lbl">Cómo trabajamos</div>'),
    ('<span>AIdeazz AI Lab · Panama · Remote · EN / ES</span>', '<span>AIdeazz AI Lab · Panamá · Remoto · EN / ES</span>'),
    ('All imagery generated on the AIdeazz ATUONA pipeline', 'Todas las imágenes generadas con el pipeline ATUONA de AIdeazz'),
    # portfolio opens the Spanish site (same as the Outlook ES edition)
    ('href="https://aideazz.xyz/portfolio"', 'href="https://aideazz.xyz/portfolio?lng=es"'),
    # Spanish runs ~25% longer: size tweaks for this edition only, so the English layout stays as approved.
    ('</style>', '''/* Spanish edition only (make-es.py) */
.s1 .sub{font-size:25px}
.btn{font-size:17px}
.stats .l{font-size:14px}
.leak p{font-size:16px}
.vs p{font-size:16px}
.vs .op .q{font-size:20px}
.moat p{font-size:18px}
.col h4{font-size:18px}
.col p{font-size:14.5px}
.col .card{min-height:232px}
.model .s{font-size:17px}
.checks li{font-size:16px}
.niche h4{font-size:18px}
.niche p{font-size:14.5px}
.notfit .tag{font-size:14px}
.photo .tx .t{font-size:19px}
.rep .d{font-size:14px}
.step p{font-size:16.5px}
.doctrine{flex-wrap:wrap;row-gap:12px}
.doctrine .seg .tag{font-size:15px;padding:7px 12px}
.doctrine p{font-size:18px}
.s8 h2{font-size:80px}
.s8 .sub{font-size:22px;max-width:900px}
.s8 .ask{font-size:19.5px}
</style>'''),
]

out = src
missing = []
for en, es in PAIRS:
    if en not in out:
        missing.append(en[:90])
    out = out.replace(en, es)
if missing:
    raise SystemExit('English strings not found (deck changed? update make-es.py):\n  ' + '\n  '.join(missing))
(HERE / 'aigo-es.html').write_text(out, encoding='utf-8')
print(f'aigo-es.html written, {len(PAIRS)} pairs applied')
