// ============================================================================
// NÚCLEO DEL CHATBOT KILLA (CONTROLADOR PRINCIPAL)
// ============================================================================
// Integrado en ICEWISE desde astra-chatbot-standalone.zip. Mismas funciones que el original:
// texto, voz (dictado y lectura en voz alta), zona horaria por país, reglas locales y API externa opcional.
//
// · Conversación por voz: al pulsar el micrófono, KILLA escucha, responde en voz alta y vuelve a
//   escuchar sola, hasta que se pulsa de nuevo el botón (o se escribe).
// · IA: se llama al servidor intermedio (chatbot/servidor) SIN clave; la clave vive solo en el servidor.
//   Si el servidor no está configurado o falla, se responde con las reglas locales: siempre funciona.
// · Lo que escribe la persona y lo que llega del servidor se muestra como texto, nunca como HTML.
document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById("chat-messages");
    const inputChat = document.getElementById("input-chat");
    const btnEnviar = document.getElementById("btn-enviar");
    const btnVoz = document.getElementById("btn-voz");
    const btnAltavoz = document.getElementById("btn-altavoz");
    let altavoz = false;             // leer en voz alta también las respuestas escritas
    const PLACEHOLDER = inputChat.placeholder;
    const historial = [];            // turnos de texto plano para dar contexto a la IA
    let escuchando = false;
    let conversacion = false;        // modo manos libres: escuchar → responder en voz alta → escuchar

    // Escapa texto para insertarlo dentro de HTML sin que se interprete como código
    const escaparHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const aTextoPlano = (html) => (new DOMParser().parseFromString(String(html), "text/html").body.textContent || "").trim();

    // Inicializar gestores de zona horaria y voz
    const tzManager = new TimezoneManager("select-pais", "reloj-local");
    const voiceManager = new VoiceManager(
        (textoTranscrito) => {
            inputChat.value = textoTranscrito;
            procesarMensajeUsuario(true); // true = responder también por voz
        },
        (estado, detalle) => {
            escuchando = estado === "listening";
            if (estado === "error") manejarErrorVoz(detalle);
            if (estado === "unsupported") {
                conversacion = false;
                agregarMensajeDOM(L("Tu navegador no permite dictar por voz (pasa en Firefox). Prueba con <strong>Chrome</strong>, <strong>Edge</strong> o <strong>Safari</strong>. Mientras tanto, puedes escribirme.", "Your browser does not support voice dictation (this happens in Firefox). Try <strong>Chrome</strong>, <strong>Edge</strong> or <strong>Safari</strong>. Meanwhile, you can type to me."), "bot");
            }
            actualizarBotonVoz();
        },
        { idioma: tzManager.getContextoHorario().idiomaVoz }
    );
    // El país elegido decide la variante de español con la que KILLA entiende y habla
    document.getElementById("select-pais")?.addEventListener("change", () => voiceManager.setIdioma(tzManager.getContextoHorario().idiomaVoz));

    function actualizarBotonVoz() {
        const activo = escuchando || conversacion;
        btnVoz.classList.toggle("escuchando", escuchando);
        btnVoz.classList.toggle("conversando", conversacion && !escuchando);
        btnVoz.setAttribute("aria-pressed", String(activo));
        const etiqueta = activo ? L("Terminar la conversación por voz", "End the voice conversation") : L("Hablar por voz con KILLA", "Talk to KILLA by voice");
        btnVoz.title = etiqueta; btnVoz.setAttribute("aria-label", etiqueta);
        inputChat.placeholder = escuchando ? L("Te escucho…", "I'm listening…") : (conversacion && voiceManager.hablando() ? L("KILLA está hablando…", "KILLA is speaking…") : PLACEHOLDER);
    }

    function manejarErrorVoz(codigo) {
        const mensajes = L({
            "not-allowed": "Para hablar conmigo, permite el uso del micrófono: pulsa el icono del candado junto a la dirección de la página y activa <strong>Micrófono</strong>.",
            "service-not-allowed": "El navegador no permite el dictado por voz en esta página. Prueba con Chrome o Edge, o escríbeme.",
            "audio-capture": "No encuentro ningún micrófono. Conecta uno o escríbeme.",
            "network": "El dictado por voz necesita conexión a internet. Revisa la conexión o escríbeme."
        }, {
            "not-allowed": "To talk to me, allow the microphone: click the padlock icon next to the page address and turn on <strong>Microphone</strong>.",
            "service-not-allowed": "The browser does not allow voice dictation on this page. Try Chrome or Edge, or type to me.",
            "audio-capture": "I can't find a microphone. Connect one or type to me.",
            "network": "Voice dictation needs an internet connection. Check your connection or type to me."
        });
        if (codigo === "no-speech") { conversacion = false; return; }   // silencio: se termina la conversación sin molestar
        if (codigo === "aborted") return;
        conversacion = false;
        if (mensajes[codigo]) agregarMensajeDOM(mensajes[codigo], "bot");
    }

    // remitente "user": siempre texto plano · remitente "bot": HTML de la base de conocimiento local
    function agregarMensajeDOM(texto, remitente) {
        const div = document.createElement("div");
        div.classList.add("message", remitente);
        if (remitente === "user") div.textContent = texto;
        else div.innerHTML = texto;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    // La palabra clave tiene que aparecer al INICIO de una palabra ("hora" sirve para "horas", no para "ahora")
    const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    // Con "=" delante, la palabra tiene que ir entera ("=ice" no sirve para "icewise")
    const coincide = (texto, kw) => kw.startsWith("=")
        ? new RegExp("(^|[^a-z0-9ñ])" + escRegex(kw.slice(1)) + "([^a-z0-9ñ]|$)").test(texto)
        : new RegExp("(^|[^a-z0-9ñ])" + escRegex(kw)).test(texto);
    const PAGINA_EN = window.ASTRA_LANG === "en";

    // KILLA responde en el idioma en que le escriben, sea cual sea el de la página.
    // Detector sencillo: signos y letras propias del español y palabras muy frecuentes de cada idioma.
    // Si el mensaje es ambiguo (p. ej. "1+1" o "ICEWISE"), se usa el idioma de la página.
    const PAL_ES = new Set("que qué como cómo cuanto cuánto cuanta cuánta cuantos donde dónde cual cuál quien quién por para porque el la los las un una unos del al es son esta está estan están hay y o pero con sin de en mi tu tus su sus yo me te se lo le nos eres soy puedes puede hola gracias agua hielo luna sol tierra cuando cuándo explica explicame dime hace hacen sirve funciona tiene tienen mas más muy tambien también ahora hoy".split(" "));
    const PAL_EN = new Set("the what how much many where which who why is are was were do does did can could would should will a an of to in on at for with without and or but my your his her its our their i you he she it we they me hello hi hey thanks thank water ice moon sun earth when explain tell make made work works has have more very also now today please about this that".split(" "));
    function detectarIdioma(texto) {
        const t = String(texto).toLowerCase();
        let es = (t.match(/[¿¡ñ]/g) || []).length * 2 + (t.match(/[áéíóú]/g) || []).length;
        let en = 0;
        for (const p of t.normalize("NFC").split(/[^a-záéíóúüñ']+/)) { if (PAL_ES.has(p)) es++; if (PAL_EN.has(p)) en++; }
        if (/\b(what's|it's|i'm|don't|can't|you're)\b/.test(t)) en += 2;
        if (es === en) return null;
        return es > en ? "es" : "en";
    }

    function respuestaLocal(textoLimpio, mensajeUsuario, contexto, EN) {
        const T = (es, en) => EN ? en : es;
        for (const item of ASTRA_KNOWLEDGE.respuestasPredefinidas) {
            const claves = EN ? (item.keywordsEn || []) : item.keywords;
            const resp = EN && item.respuestaEn ? item.respuestaEn : item.respuesta;
            if (claves.some((kw) => coincide(textoLimpio, kw))) {
                return typeof resp === "function" ? resp(contexto) : resp;
            }
        }
        // Respuesta por defecto si no coincide ninguna palabra clave
        return T("Todavía no sé responder eso sin conexión con la IA. Prueba a preguntarme por el <strong>rover</strong>, el <strong>hielo</strong>, el <strong>biofiltro</strong>, la <strong>colonia</strong> o cuánta <strong>agua</strong> produce ICEWISE.",
            "I can't answer that yet without a connection to the AI. Try asking me about the <strong>rover</strong>, the <strong>ice</strong>, the <strong>biofilter</strong>, the <strong>colony</strong> or how much <strong>water</strong> ICEWISE produces.");
    }

    async function generarRespuestaBot(mensajeUsuario, EN) {
        const contexto = tzManager.getContextoHorario();
        const textoLimpio = mensajeUsuario.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const api = ASTRA_KNOWLEDGE.apiConfig || {};

        // 1. IA a través del servidor intermedio (sin clave: la clave vive solo en el servidor)
        if (api.usarApiExterna && api.endpoint) {
            const control = new AbortController();
            const espera = setTimeout(() => control.abort(), 25000);
            try {
                const res = await fetch(api.endpoint + (EN ? "?idioma=en" : ""), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mensaje: mensajeUsuario,
                        idioma: EN ? "en" : "es",       // idioma del mensaje (o de la página si es ambiguo): la IA responde en él
                        contextoHorario: contexto,
                        historial: historial.slice(-4)   // lo reciente basta para seguir la conversación y ahorra cuota
                    }),
                    signal: control.signal
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.respuesta) {
                    // La respuesta viene de fuera: se muestra como texto para que no pueda inyectar código
                    return escaparHTML(data.respuesta).replace(/\n/g, "<br>");
                }
                if (res.status === 429 && data.error) return escaparHTML(data.error);
                console.warn("Servidor de KILLA:", res.status, data.error || "");
            } catch (error) {
                console.warn("Sin conexión con el servidor de KILLA; uso las respuestas locales.", error.name);
            } finally {
                clearTimeout(espera);
            }
        }

        // 2. Motor de reglas locales: también es el respaldo si el servidor falla (GitHub Pages siempre funciona)
        return respuestaLocal(textoLimpio, mensajeUsuario, contexto, EN);
    }

    async function procesarMensajeUsuario(usarVoz = false) {
        const texto = inputChat.value.trim();
        if (!texto) return;

        agregarMensajeDOM(texto, "user");
        inputChat.value = "";
        const pensando = agregarMensajeDOM(`<span class="puntos" aria-label="${L("KILLA está pensando", "KILLA is thinking")}"><i></i><i></i><i></i></span>`, "bot");
        pensando.classList.add("pensando");

        const idioma = detectarIdioma(texto) || (PAGINA_EN ? "en" : "es");
        const respuesta = await generarRespuestaBot(texto, idioma === "en");
        pensando.remove();
        agregarMensajeDOM(respuesta, "bot");
        historial.push({ role: "user", content: texto }, { role: "assistant", content: aTextoPlano(respuesta) });
        if (historial.length > 24) historial.splice(0, historial.length - 24);

        // Habla si se le habló por voz o si el altavoz está activado (también para respuestas escritas)
        if (usarVoz || altavoz) {
            voiceManager.speak(respuesta, () => {
                actualizarBotonVoz();
                if (conversacion) setTimeout(() => { if (conversacion) voiceManager.startListening(); }, 300);   // manos libres
            }, idioma);
            actualizarBotonVoz();
        }
    }

    function terminarConversacion() {
        conversacion = false;
        voiceManager.stopListening();
        voiceManager.callar();
        actualizarBotonVoz();
    }

    // Eventos de interfaz
    btnEnviar.addEventListener("click", () => { terminarConversacion(); procesarMensajeUsuario(false); });
    inputChat.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) { terminarConversacion(); procesarMensajeUsuario(false); }
    });
    btnVoz.addEventListener("click", () => {
        if (escuchando || conversacion) { terminarConversacion(); return; }
        conversacion = true;
        if (!voiceManager.startListening()) conversacion = voiceManager.soportaDictado && conversacion;
        actualizarBotonVoz();
    });

    // Altavoz: activado, KILLA lee en voz alta también lo que responde por escrito. Se recuerda en este navegador.
    function setAltavoz(on, avisar) {
        altavoz = on;
        btnAltavoz.setAttribute("aria-pressed", String(on));
        const t = on ? L("Altavoz activado: KILLA lee en voz alta sus respuestas (pulsa para silenciar)", "Speaker on: KILLA reads its answers aloud (press to mute)") : L("Altavoz: leer en voz alta también las respuestas escritas", "Speaker: also read written answers aloud");
        btnAltavoz.title = t; btnAltavoz.setAttribute("aria-label", t);
        try { localStorage.setItem("astra-altavoz", on ? "1" : "0"); } catch (_) {}
        if (on && avisar) voiceManager.desbloquearVoz();       // solo con un clic real (Safari lo exige)
        else if (!on && !conversacion) voiceManager.callar();  // silenciar corta lo que esté leyendo
        if (avisar && on && !voiceManager.soportaVoz) agregarMensajeDOM(L("Tu navegador no puede leer en voz alta. Prueba con Chrome, Edge o Safari.", "Your browser cannot read aloud. Try Chrome, Edge or Safari."), "bot");
    }
    btnAltavoz.addEventListener("click", () => setAltavoz(!altavoz, true));

    // ---------- Elegir la voz (las naturales de Edge suenan mucho más humanas) ----------
    const btnVozCfg = document.getElementById("btn-voz-cfg");
    const panelVoz = document.getElementById("panel-voz");
    const selVoz = document.getElementById("sel-voz");
    const notaVoz = document.getElementById("nota-voz");
    const PAISES = PAGINA_EN
        ? { US: "USA", GB: "UK", AU: "Australia", CA: "Canada", IN: "India", IE: "Ireland", NZ: "New Zealand", ZA: "South Africa", SG: "Singapore", PH: "Philippines", NG: "Nigeria", KE: "Kenya", HK: "Hong Kong", TZ: "Tanzania" }
        : { MX: "México", ES: "España", PE: "Perú", AR: "Argentina", CO: "Colombia", CL: "Chile", US: "EE. UU.", VE: "Venezuela", BO: "Bolivia", EC: "Ecuador", UY: "Uruguay", PY: "Paraguay", CR: "Costa Rica", CU: "Cuba", DO: "Rep. Dominicana", GT: "Guatemala", HN: "Honduras", NI: "Nicaragua", PA: "Panamá", PR: "Puerto Rico", SV: "El Salvador", GQ: "Guinea Ecuatorial", "419": "Latinoamérica" };
    const nombreVoz = (v) => {
        const pais = PAISES[(v.lang.split(/[-_]/)[1] || "").toUpperCase()] || v.lang;
        const nombre = v.name.replace(/^(Microsoft|Google)\s+/i, "").replace(/\s*Online\s*\(Natural\)/i, "").replace(/\s*-\s*(Spanish|English).*$/i, "").trim();
        return `${nombre} · ${pais}${VoiceManager.esNatural(v) ? " · natural" : ""}`;
    };
    function llenarVoces() {
        const voces = voiceManager.vocesEspanol();
        const actual = voiceManager.vozPreferida || "";
        selVoz.textContent = "";
        const auto = new Option(L("Automática (la más natural disponible)", "Automatic (the most natural available)"), "");
        selVoz.add(auto);
        voces.forEach((v) => selVoz.add(new Option(nombreVoz(v), v.voiceURI)));
        selVoz.value = voces.some((v) => v.voiceURI === actual) ? actual : "";
        const naturales = voces.filter(VoiceManager.esNatural).length;
        notaVoz.textContent = !voiceManager.soportaVoz ? L("Este navegador no puede leer en voz alta.", "This browser cannot read aloud.")
            : !voces.length ? L("No hay voces en español en este navegador.", "There are no English voices in this browser.")
            : naturales ? L(`${naturales} voces naturales disponibles.`, `${naturales} natural voices available.`)
            : L("Para voces más naturales, abre la web en Microsoft Edge.", "For more natural voices, open the site in Microsoft Edge.");
    }
    const abrirPanelVoz = (on) => {
        panelVoz.hidden = !on; btnVozCfg.setAttribute("aria-expanded", String(on));
        if (on) { llenarVoces(); selVoz.focus(); }
    };
    btnVozCfg.addEventListener("click", () => abrirPanelVoz(panelVoz.hidden));
    document.addEventListener("click", (e) => { if (!panelVoz.hidden && !e.target.closest("#panel-voz, #btn-voz-cfg")) abrirPanelVoz(false); });
    panelVoz.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); abrirPanelVoz(false); btnVozCfg.focus(); } });
    const probarVoz = () => { voiceManager.desbloquearVoz(); voiceManager.speak(L("Hola, soy KILLA. Así sueno con esta voz.", "Hi, I am KILLA. This is how I sound with this voice.")); };
    selVoz.addEventListener("change", () => {
        voiceManager.setVozPreferida(selVoz.value);
        try { localStorage.setItem("astra-voz", selVoz.value); } catch (_) {}
        probarVoz();
    });
    document.getElementById("btn-probar-voz").addEventListener("click", probarVoz);
    // Las voces del sistema llegan un momento después de abrir la página
    if (voiceManager.soportaVoz) window.speechSynthesis.addEventListener?.("voiceschanged", () => { if (!panelVoz.hidden) llenarVoces(); });
    voiceManager.setVozPreferida((() => { try { return localStorage.getItem("astra-voz") || ""; } catch (_) { return ""; } })());
    setAltavoz((() => { try { return localStorage.getItem("astra-altavoz") === "1"; } catch (_) { return false; } })(), false);
});
