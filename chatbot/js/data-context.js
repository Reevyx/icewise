// ============================================================================
// BASE DE CONOCIMIENTO Y CONTEXTO DEL CHATBOT (Reemplaza dependencias del sim)
// ============================================================================
// Respuestas locales: funcionan sin internet ni servidor, y son el respaldo si la IA no está disponible.
// Se elige la PRIMERA regla cuya palabra clave aparezca al inicio de una palabra del mensaje (sin tildes,
// en minúsculas): por eso las reglas más concretas van primero. Las cifras salen del modelo de la
// simulación de ICEWISE; lo simulado, los supuestos y las hipótesis se dicen como tales.
const ASTRA_KNOWLEDGE = {
    nombre: "ASTRA",
    version: "1.1-icewise",
    respuestasPredefinidas: [
        {
            keywords: ["potable", "beber", "bebible", "tomar agua", "se puede tomar"],
            respuesta: "El agua de ICEWISE es de <strong>uso técnico</strong>. Para beberla habría que confirmar su calidad con análisis de laboratorio reales; en la simulación solo se comprueba que los contaminantes bajan de un límite ilustrativo."
        },
        {
            keywords: ["adsorbente", "filtro quimico", "filtros quimicos", "regenera", "carbon activado"],
            respuesta: "Los filtros químicos (adsorbente) retienen lo que el biofiltro no limpia. Vienen de la Tierra (3 kg en la estación) y, sin regenerarlos, se agotan en unas dos semanas. Como <strong>hipótesis</strong>, el horno los calienta para limpiarlos y reutilizarlos: así duran unos 70 días, y después habría que reponer unos 3 kg cada dos meses."
        },
        {
            keywords: ["biofiltro", "bacteria", "microorganismo", "microbio", "liquen", "deinococcus", "pseudomonas", "placopsis"],
            respuesta: "El biofiltro es una cámara sellada con microorganismos que limpian el agua del hielo lunar, que trae amoníaco, azufre, metanol y mercurio. <em>P. extremorientalis</em> se alimenta del amoníaco y del azufre, <em>D. peraridilitoris</em> retiene el mercurio y resiste la radiación, y el liquen <em>Placopsis</em> avisa si el agua sale contaminada. Que lo logren en la Luna es una <strong>hipótesis</strong> por comprobar en laboratorio. Los microbios no producen agua: la limpian."
        },
        {
            keywords: ["horno", "planta", "vapor", "sublima", "trampa fria", "procesa", "purifica", "limpia el agua"],
            respuesta: "En el vacío el hielo no se derrite: al calentarlo pasa directamente a vapor. Por eso el horno calienta las muestras, el vapor se congela en una trampa fría (la caja que se cubre de escarcha), luego se funde y pasa por el biofiltro, los filtros químicos y una membrana con luz UV hasta llegar al tanque. Desde ahí se bombea a la colonia."
        },
        {
            keywords: ["perfor", "taladro", "broca", "excava", "muestra"],
            respuesta: "Antes de perforar, el rover se detiene unos 20 minutos a medir con su sensor y decide: perfora solo si el hielo estimado supera el umbral (3 % por defecto), la pendiente es de 15° o menos y le queda batería para volver. Perfora 1 m con un taladro de 300 W (supuesto de diseño) y guarda la muestra en una bodega de 40 kg."
        },
        {
            keywords: ["hielo", "neutron", "sensor", "detecta", "encuentra", "sombra permanente", "psr"],
            respuesta: "El rover no ve el hielo: lo descubre con un <strong>sensor de neutrones</strong>, porque el hidrógeno del agua frena los neutrones. El hielo está en zonas de sombra permanente, donde nunca da el Sol (unos 40 K). En la simulación el relieve y las sombras son reales (LOLA, NASA), pero dónde hay hielo y cuánto es simulado."
        },
        {
            keywords: ["velocidad", "rapido", "lento", "km/h", "viper"],
            respuesta: "En la simulación el rover va a 3,6 km/h, un <strong>supuesto de diseño</strong> de ICEWISE. Como referencia real, el rover VIPER de la NASA va a unos 0,8 km/h. Ir más rápido da más perforaciones, pero el agua que llega a la colonia casi no cambia: lo que más limita es procesarla y limpiarla."
        },
        {
            keywords: ["rover", "vehiculo", "robot", "autonom", "conducir"],
            respuesta: "El rover de ICEWISE es autónomo: explora, detecta hielo con su sensor de neutrones, se detiene a medir, decide si perforar, perfora y lleva las muestras a la estación. Tiene una batería de 5 kWh y paneles de 300 W, y esquiva rocas, la estación y pendientes de más de 24°. En la simulación también lo puedes conducir tú con W A S D."
        },
        {
            keywords: ["colonia", "colono", "persona", "habitante", "astronauta", "tripulacion"],
            respuesta: "La colonia ICEWISE tiene <strong>10 personas</strong> (supuesto). Cada una usa unos 2,5 litros de agua al día y se recicla el 90 %, así que necesitan unos 2,5 litros nuevos al día. En el modelo, el sistema produce unos 4,3 litros al día: cubre la demanda con margen."
        },
        {
            keywords: ["energia", "solar", "bateria", "panel", "electric", "cargador"],
            respuesta: "La estación tiene paneles solares de 2000 W en el borde iluminado, donde casi siempre da el Sol. Esa energía alimenta el horno, la cámara del biofiltro y un cargador de 1200 W para el rover (supuesto de diseño). El rover lleva una batería de 5 kWh y paneles de 300 W. La idea del proyecto: energía arriba, hielo abajo."
        },
        {
            keywords: ["shackleton", "ubicacion", "donde", "crater", "polo sur", "lola"],
            respuesta: "ICEWISE está en el borde del cráter <strong>Shackleton</strong>, a 89,6° de latitud sur, muy cerca del polo sur de la Luna. En el borde casi siempre da el Sol (energía) y dentro del cráter hay sombras permanentes donde puede haber hielo. El relieve de la simulación es real, medido por el altímetro LOLA de la NASA."
        },
        {
            keywords: ["real", "simulad", "verdad", "inventad", "supuesto", "hipotesis"],
            respuesta: "Es real: el relieve y las sombras (LOLA, NASA), el cielo, la Tierra y la física del calor y del vacío. Es simulado: el hielo bajo el suelo y los resultados de producción. Son supuestos o hipótesis: la colonia de 10 personas, la velocidad del rover, el taladro, el cargador, la regeneración del filtro y que los microorganismos limpien el agua en la Luna."
        },
        {
            keywords: ["agua", "litro", "produc", "abastec", "cuanto tarda"],
            respuesta: "En el modelo, ICEWISE produce unos <strong>4,3 litros de agua limpia al día</strong>, más o menos un litro cada 5 o 6 horas. La colonia de 10 personas necesita unos 2,5 litros nuevos al día. Son resultados de la simulación, no mediciones reales."
        },
        {
            keywords: ["icewise", "proyecto", "propuesta", "de que trata"],
            respuesta: "ICEWISE es una propuesta escolar para obtener agua del hielo lunar en el cráter Shackleton: un rover autónomo busca el hielo, perfora y lleva las muestras a una planta que las convierte en agua, la limpia con un biofiltro de microorganismos y la envía a una colonia de 10 personas."
        },
        {
            keywords: ["quien eres", "que haces", "que puedes", "ayuda"],
            respuesta: "Soy <strong>ASTRA</strong>, el asistente de ICEWISE. Puedo responderte por texto o por voz sobre el rover, el hielo, la planta, el biofiltro, la colonia y el agua, y decirte la hora de tu país."
        },
        {
            keywords: ["hola", "buenos dias", "buenas tardes", "buenas noches", "saludos"],
            respuesta: "¡Hola! Soy ASTRA. Pregúntame por el rover, el hielo, el biofiltro, la colonia o cuánta agua produce ICEWISE."
        },
        {
            keywords: ["hora", "fecha", "tiempo", "horario", "pais"],
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
