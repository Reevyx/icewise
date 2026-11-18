// ============================================================================
// BASE DE CONOCIMIENTO Y CONTEXTO DEL CHATBOT (Reemplaza dependencias del sim)
// ============================================================================
// Respuestas locales: funcionan sin internet ni servidor, y son el respaldo si la IA no está disponible.
// Se elige la PRIMERA regla cuya palabra clave aparezca al inicio de una palabra del mensaje (sin tildes,
// en minúsculas): por eso las reglas más concretas van primero. Las cifras salen del modelo de la
// simulación de ICEWISE; lo simulado, los supuestos y las hipótesis se dicen como tales.
// En inglés se usan keywordsEn y respuestaEn (una palabra clave que empieza por "=" exige la palabra entera).
const ASTRA_KNOWLEDGE = {
    nombre: "ASTRA",
    version: "1.1-icewise",
    respuestasPredefinidas: [
        {
            keywords: ["potable", "beber", "bebible", "tomar agua", "se puede tomar"],
            keywordsEn: ["drink", "potable", "safe to"],
            respuestaEn: "ICEWISE water is for <strong>technical use</strong>. To drink it, its quality would have to be confirmed with real laboratory analyses; the simulation only checks that contaminants fall below an illustrative limit.",
            respuesta: "El agua de ICEWISE es de <strong>uso técnico</strong>. Para beberla habría que confirmar su calidad con análisis de laboratorio reales; en la simulación solo se comprueba que los contaminantes bajan de un límite ilustrativo."
        },
        {
            keywords: ["adsorbente", "filtro quimico", "filtros quimicos", "regenera", "carbon activado"],
            keywordsEn: ["adsorbent", "chemical filter", "regenerat", "activated carbon"],
            respuestaEn: "The chemical filters (adsorbent) capture what the biofilter does not clean. They come from Earth (3 kg at the station) and, without regeneration, run out in about two weeks. As a <strong>hypothesis</strong>, the oven heats them to clean and reuse them: that way they last about 70 days, and then about 3 kg would have to be resupplied every two months.",
            respuesta: "Los filtros químicos (adsorbente) retienen lo que el biofiltro no limpia. Vienen de la Tierra (3 kg en la estación) y, sin regenerarlos, se agotan en unas dos semanas. Como <strong>hipótesis</strong>, el horno los calienta para limpiarlos y reutilizarlos: así duran unos 70 días, y después habría que reponer unos 3 kg cada dos meses."
        },
        {
            keywords: ["biofiltro", "bacteria", "microorganismo", "microbio", "liquen", "deinococcus", "pseudomonas", "placopsis"],
            keywordsEn: ["biofilter", "bacteri", "microorganism", "microbe", "lichen", "deinococcus", "pseudomonas", "placopsis"],
            respuestaEn: "The biofilter is a sealed chamber with microorganisms that clean the water from lunar ice, which carries ammonia, sulphur, methanol and mercury. <em>P. extremorientalis</em> feeds on the ammonia and sulphur, <em>D. peraridilitoris</em> captures mercury and withstands radiation, and the lichen <em>Placopsis</em> warns if the water comes out contaminated. Whether they can do it on the Moon is a <strong>hypothesis</strong> still to be tested in the lab. The microbes do not produce water: they clean it.",
            respuesta: "El biofiltro es una cámara sellada con microorganismos que limpian el agua del hielo lunar, que trae amoníaco, azufre, metanol y mercurio. <em>P. extremorientalis</em> se alimenta del amoníaco y del azufre, <em>D. peraridilitoris</em> retiene el mercurio y resiste la radiación, y el liquen <em>Placopsis</em> avisa si el agua sale contaminada. Que lo logren en la Luna es una <strong>hipótesis</strong> por comprobar en laboratorio. Los microbios no producen agua: la limpian."
        },
        {
            keywords: ["horno", "planta", "vapor", "sublima", "trampa fria", "procesa", "purifica", "limpia el agua"],
            keywordsEn: ["oven", "plant", "vapor", "vapour", "sublim", "cold trap", "process", "purif", "clean the water"],
            respuestaEn: "In a vacuum, ice does not melt: when heated it turns straight into vapour. So the oven heats the samples, the vapour freezes in a cold trap (the box that gets covered in frost), then it is melted and passes through the biofilter, the chemical filters and a membrane with UV light until it reaches the tank. From there it is pumped to the colony.",
            respuesta: "En el vacío el hielo no se derrite: al calentarlo pasa directamente a vapor. Por eso el horno calienta las muestras, el vapor se congela en una trampa fría (la caja que se cubre de escarcha), luego se funde y pasa por el biofiltro, los filtros químicos y una membrana con luz UV hasta llegar al tanque. Desde ahí se bombea a la colonia."
        },
        {
            keywords: ["perfor", "taladro", "broca", "excava", "muestra"],
            keywordsEn: ["drill", "bore", "excavat", "sample"],
            respuestaEn: "Before drilling, the rover stops for about 20 minutes to measure with its sensor and decides: it drills only if the estimated ice is above the threshold (3% by default), the slope is 15° or less and it has enough battery to return. It drills 1 m with a 300 W drill (design assumption) and stores the sample in a 40 kg cargo bay.",
            respuesta: "Antes de perforar, el rover se detiene unos 20 minutos a medir con su sensor y decide: perfora solo si el hielo estimado supera el umbral (3 % por defecto), la pendiente es de 15° o menos y le queda batería para volver. Perfora 1 m con un taladro de 300 W (supuesto de diseño) y guarda la muestra en una bodega de 40 kg."
        },
        {
            keywords: ["invent", "confirmad", "evidencia", "prueba de que", "por que hay hielo", "zonas de hielo", "seguro que hay"],
            keywordsEn: ["made up", "confirmed", "evidence", "proof", "why is there ice", "sure there"],
            respuestaEn: "Ice in the permanently shadowed craters of the south pole <strong>is confirmed</strong>: the LCROSS impact (2009) measured 5.6% water in Cabeus crater, and direct evidence of surface ice was published in 2018 (M3 data). In the simulation, those shadowed areas are calculated from the real terrain (LOLA, NASA) and ice is placed only inside them. What <strong>is simulated</strong> is how much there is at each point, because from orbit only kilometre-wide averages are measured and nobody has measured it on the ground yet.",
            respuesta: "El hielo en los cráteres de sombra permanente del polo sur <strong>está confirmado</strong>: el impacto de LCROSS (2009) midió un 5,6 % de agua en el cráter Cabeus y en 2018 se publicó evidencia directa de hielo en la superficie (datos de M3). En la simulación, esas zonas de sombra se calculan con el relieve real (LOLA, NASA) y el hielo solo se pone dentro de ellas. Lo que sí es <strong>simulado</strong> es cuánto hay en cada punto, porque desde órbita solo se mide un promedio de kilómetros y nadie lo ha medido aún sobre el terreno."
        },
        {
            keywords: ["hielo", "neutron", "sensor", "detecta", "encuentra", "sombra permanente", "psr"],
            keywordsEn: ["=ice", "neutron", "sensor", "detect", "find", "permanent shadow", "psr"],
            respuestaEn: "The rover cannot see the ice: it discovers it with a <strong>neutron sensor</strong>, because the hydrogen in water slows neutrons down. The ice is in permanently shadowed areas, where the Sun never shines (about 40 K), and its presence there is confirmed. In the simulation the terrain and shadows are real (LOLA, NASA); what is simulated is how much ice there is at each point.",
            respuesta: "El rover no ve el hielo: lo descubre con un <strong>sensor de neutrones</strong>, porque el hidrógeno del agua frena los neutrones. El hielo está en zonas de sombra permanente, donde nunca da el Sol (unos 40 K), y su presencia ahí está confirmada. En la simulación el relieve y las sombras son reales (LOLA, NASA); lo simulado es cuánto hielo hay en cada punto."
        },
        {
            keywords: ["velocidad", "rapido", "lento", "km/h", "viper"],
            keywordsEn: ["speed", "fast", "slow", "km/h", "viper"],
            respuestaEn: "In the simulation the rover moves at 3.6 km/h, a <strong>design assumption</strong> of ICEWISE. As a real reference, NASA's VIPER rover moves at about 0.8 km/h. Going faster gives more drill holes, but the water reaching the colony barely changes: the main limit is processing and cleaning it.",
            respuesta: "En la simulación el rover va a 3,6 km/h, un <strong>supuesto de diseño</strong> de ICEWISE. Como referencia real, el rover VIPER de la NASA va a unos 0,8 km/h. Ir más rápido da más perforaciones, pero el agua que llega a la colonia casi no cambia: lo que más limita es procesarla y limpiarla."
        },
        {
            keywords: ["rover", "vehiculo", "robot", "autonom", "conducir"],
            keywordsEn: ["rover", "vehicle", "robot", "autonom", "drive"],
            respuestaEn: "The ICEWISE rover is autonomous: it explores, detects ice with its neutron sensor, stops to measure, decides whether to drill, drills and takes the samples to the station. It has a 5 kWh battery and 300 W panels, and it avoids rocks, the station and slopes steeper than 24°. In the simulation you can also drive it yourself with W A S D.",
            respuesta: "El rover de ICEWISE es autónomo: explora, detecta hielo con su sensor de neutrones, se detiene a medir, decide si perforar, perfora y lleva las muestras a la estación. Tiene una batería de 5 kWh y paneles de 300 W, y esquiva rocas, la estación y pendientes de más de 24°. En la simulación también lo puedes conducir tú con W A S D."
        },
        {
            keywords: ["colonia", "colono", "persona", "habitante", "astronauta", "tripulacion", "uku pacha", "base lunar", "modulo", "sector", "invernadero"],
            keywordsEn: ["colony", "colonist", "people", "person", "inhabitant", "astronaut", "crew", "uku pacha", "moon base", "lunar base", "module", "sector", "greenhouse"],
            respuestaEn: "The <strong>UKU PACHA MK-I</strong> colony has <strong>10 people</strong> and could grow in stages (up to 48), only if water, air, energy and safety allow it. It has about 600 m² pressurized in seven sectors: living quarters, science, an 80 m² greenhouse, medical, workshop, life support and logistics, half-buried under regolith. Each person uses about 2.5 L of water a day and 90% is recycled: they need about 2.5 L of new water a day, and ICEWISE produces about 4.3 L (model). These are conceptual research parameters, not a certified design.",
            respuesta: "La colonia <strong>UKU PACHA MK-I</strong> tiene <strong>10 personas</strong> y podría crecer por etapas (hasta 48), solo si el agua, el aire, la energía y la seguridad lo permiten. Tiene unos 600 m² presurizados en siete sectores: habitacional, ciencia, invernadero de 80 m², médico, taller, soporte vital y logística, semienterrados bajo regolito. Cada persona usa unos 2,5 L de agua al día y se recicla el 90 %: necesitan unos 2,5 L nuevos al día, y ICEWISE produce unos 4,3 L (modelo). Son parámetros conceptuales de la investigación, no un diseño certificado."
        },
        {
            keywords: ["energia", "solar", "bateria", "panel", "electric", "cargador"],
            keywordsEn: ["energy", "power", "solar", "battery", "panel", "electric", "charger"],
            respuestaEn: "The station has 2000 W of solar panels on the sunlit rim, where the Sun shines almost all the time. That energy powers the oven, the biofilter chamber and a 1200 W charger for the rover (design assumption). The rover carries a 5 kWh battery and 300 W panels. The project's idea: energy up high, ice down low.",
            respuesta: "La estación tiene paneles solares de 2000 W en el borde iluminado, donde casi siempre da el Sol. Esa energía alimenta el horno, la cámara del biofiltro y un cargador de 1200 W para el rover (supuesto de diseño). El rover lleva una batería de 5 kWh y paneles de 300 W. La idea del proyecto: energía arriba, hielo abajo."
        },
        {
            keywords: ["shackleton", "ubicacion", "donde", "crater", "polo sur", "lola"],
            keywordsEn: ["shackleton", "location", "where", "crater", "south pole", "lola"],
            respuestaEn: "ICEWISE is on the rim of <strong>Shackleton</strong> crater, at 89.6° south latitude, very close to the Moon's south pole. The Sun almost always shines on the rim (energy) and inside the crater there are permanent shadows where there may be ice. The simulation terrain is real, measured by NASA's LOLA altimeter.",
            respuesta: "ICEWISE está en el borde del cráter <strong>Shackleton</strong>, a 89,6° de latitud sur, muy cerca del polo sur de la Luna. En el borde casi siempre da el Sol (energía) y dentro del cráter hay sombras permanentes donde puede haber hielo. El relieve de la simulación es real, medido por el altímetro LOLA de la NASA."
        },
        {
            keywords: ["real", "simulad", "verdad", "inventad", "supuesto", "hipotesis"],
            keywordsEn: ["=real", "simulat", "true", "assum", "hypothes"],
            respuestaEn: "Real: the terrain and shadows (LOLA, NASA), the sky, the Earth and the physics of heat and vacuum. Simulated: how much ice there is at each point (the shadowed areas where it lies are real) and the production results. Assumptions or hypotheses: the 10-person colony, the rover speed, the drill, the charger, filter regeneration and whether microorganisms can clean the water on the Moon.",
            respuesta: "Es real: el relieve y las sombras (LOLA, NASA), el cielo, la Tierra y la física del calor y del vacío. Es simulado: cuánto hielo hay en cada punto (las zonas de sombra donde está sí son reales) y los resultados de producción. Son supuestos o hipótesis: la colonia de 10 personas, la velocidad del rover, el taladro, el cargador, la regeneración del filtro y que los microorganismos limpien el agua en la Luna."
        },
        {
            keywords: ["agua", "litro", "produc", "abastec", "cuanto tarda"],
            keywordsEn: ["water", "litre", "liter", "produc", "supply", "how long"],
            respuestaEn: "In the model, ICEWISE produces about <strong>4.3 litres of clean water a day</strong>, roughly one litre every 5 or 6 hours. The 10-person colony needs about 2.5 litres of new water a day. These are simulation results, not real measurements.",
            respuesta: "En el modelo, ICEWISE produce unos <strong>4,3 litros de agua limpia al día</strong>, más o menos un litro cada 5 o 6 horas. La colonia de 10 personas necesita unos 2,5 litros nuevos al día. Son resultados de la simulación, no mediciones reales."
        },
        {
            keywords: ["icewise", "proyecto", "propuesta", "de que trata"],
            keywordsEn: ["icewise", "project", "proposal", "what is it about"],
            respuestaEn: "ICEWISE is a school proposal to obtain water from lunar ice at Shackleton crater: an autonomous rover searches for ice, drills and takes the samples to a plant that turns them into water, cleans it with a microorganism biofilter and sends it to the 10-person UKU PACHA colony.",
            respuesta: "ICEWISE es una propuesta escolar para obtener agua del hielo lunar en el cráter Shackleton: un rover autónomo busca el hielo, perfora y lleva las muestras a una planta que las convierte en agua, la limpia con un biofiltro de microorganismos y la envía a la colonia UKU PACHA, de 10 personas."
        },
        {
            keywords: ["quien eres", "que haces", "que puedes", "ayuda"],
            keywordsEn: ["who are you", "what do you do", "what can you", "help"],
            respuestaEn: "I am <strong>ASTRA</strong>, the ICEWISE assistant. I can answer by text or voice about the rover, the ice, the plant, the biofilter, the colony and the water, and tell you the time in your country.",
            respuesta: "Soy <strong>ASTRA</strong>, el asistente de ICEWISE. Puedo responderte por texto o por voz sobre el rover, el hielo, la planta, el biofiltro, la colonia y el agua, y decirte la hora de tu país."
        },
        {
            keywords: ["hola", "buenos dias", "buenas tardes", "buenas noches", "saludos"],
            keywordsEn: ["=hi", "hello", "hey", "good morning", "good afternoon", "good evening", "greetings"],
            respuestaEn: "Hi! I am ASTRA. Ask me about the rover, the ice, the biofilter, the colony or how much water ICEWISE produces.",
            respuesta: "¡Hola! Soy ASTRA. Pregúntame por el rover, el hielo, el biofiltro, la colonia o cuánta agua produce ICEWISE."
        },
        {
            keywords: ["hora", "fecha", "tiempo", "horario", "pais"],
            keywordsEn: ["=time", "date", "clock", "country"],
            respuestaEn: (contexto) => `The current synchronised time for ${contexto.paisNombre} (${contexto.timeZone}) is: ${contexto.fechaHoraCompleta}.`,
            respuesta: (contexto) => `La hora actual sincronizada para ${contexto.paisNombre} (${contexto.timeZone}) es: ${contexto.fechaHoraCompleta}.`
        }
    ],
    // Conexión opcional con la IA a través del servidor intermedio (chatbot/servidor, Cloudflare Worker).
    // AQUÍ NUNCA VA UNA CLAVE DE API: este archivo es público en GitHub Pages. La IA gratuita (Workers AI)
    // no usa clave, y una clave de pago, si existiera, viviría solo en el servidor como secreto.
    // Aquí solo va la dirección del servidor, que no es secreta. Si el servidor no está configurado
    // o falla, ASTRA responde con las reglas locales de arriba.
    apiConfig: {
        usarApiExterna: true,
        endpoint: "https://astra-icewise.rone-robot.workers.dev"   // p. ej. "https://astra-icewise.TU-USUARIO.workers.dev"
    }
};
