// ============================================================================
// NÚCLEO DEL CHATBOT ASTRA (CONTROLADOR PRINCIPAL)
// ============================================================================
// Integrado en ICEWISE desde astra-chatbot-standalone.zip. Mismas funciones que el original:
// texto, voz (dictado y lectura en voz alta), zona horaria por país, reglas locales y API externa opcional.
//
// · Conversación por voz: al pulsar el micrófono, ASTRA escucha, responde en voz alta y vuelve a
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
                agregarMensajeDOM("Tu navegador no permite dictar por voz (pasa en Firefox). Prueba con <strong>Chrome</strong>, <strong>Edge</strong> o <strong>Safari</strong>. Mientras tanto, puedes escribirme.", "bot");
            }
            actualizarBotonVoz();
        },
        { idioma: tzManager.getContextoHorario().idiomaVoz }
    );
    // El país elegido decide la variante de español con la que ASTRA entiende y habla
    document.getElementById("select-pais")?.addEventListener("change", () => voiceManager.setIdioma(tzManager.getContextoHorario().idiomaVoz));

    function actualizarBotonVoz() {
        const activo = escuchando || conversacion;
        btnVoz.classList.toggle("escuchando", escuchando);
        btnVoz.classList.toggle("conversando", conversacion && !escuchando);
        btnVoz.setAttribute("aria-pressed", String(activo));
        const etiqueta = activo ? "Terminar la conversación por voz" : "Hablar por voz con ASTRA";
        btnVoz.title = etiqueta; btnVoz.setAttribute("aria-label", etiqueta);
        inputChat.placeholder = escuchando ? "Te escucho…" : (conversacion && voiceManager.hablando() ? "ASTRA está hablando…" : PLACEHOLDER);
    }

    function manejarErrorVoz(codigo) {
        const mensajes = {
            "not-allowed": "Para hablar conmigo, permite el uso del micrófono: pulsa el icono del candado junto a la dirección de la página y activa <strong>Micrófono</strong>.",
            "service-not-allowed": "El navegador no permite el dictado por voz en esta página. Prueba con Chrome o Edge, o escríbeme.",
            "audio-capture": "No encuentro ningún micrófono. Conecta uno o escríbeme.",
            "network": "El dictado por voz necesita conexión a internet. Revisa la conexión o escríbeme."
        };
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
    const coincide = (texto, kw) => new RegExp("(^|[^a-z0-9ñ])" + escRegex(kw)).test(texto);

    function respuestaLocal(textoLimpio, mensajeUsuario, contexto) {
        for (const item of ASTRA_KNOWLEDGE.respuestasPredefinidas) {
            if (item.keywords.some((kw) => coincide(textoLimpio, kw))) {
                return typeof item.respuesta === "function"
                    ? item.respuesta(contexto)
                    : item.respuesta;
            }
        }
        // Respuesta por defecto si no coincide ninguna palabra clave
        return "Todavía no sé responder eso sin conexión con la IA. Prueba a preguntarme por el <strong>rover</strong>, el <strong>hielo</strong>, el <strong>biofiltro</strong>, la <strong>colonia</strong> o cuánta <strong>agua</strong> produce ICEWISE.";
    }

    async function generarRespuestaBot(mensajeUsuario) {
        const contexto = tzManager.getContextoHorario();
        const textoLimpio = mensajeUsuario.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const api = ASTRA_KNOWLEDGE.apiConfig || {};

        // 1. IA a través del servidor intermedio (sin clave: la clave vive solo en el servidor)
        if (api.usarApiExterna && api.endpoint) {
            const control = new AbortController();
            const espera = setTimeout(() => control.abort(), 25000);
            try {
                const res = await fetch(api.endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mensaje: mensajeUsuario,
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
                console.warn("Servidor de ASTRA:", res.status, data.error || "");
            } catch (error) {
                console.warn("Sin conexión con el servidor de ASTRA; uso las respuestas locales.", error.name);
            } finally {
                clearTimeout(espera);
            }
        }

        // 2. Motor de reglas locales: también es el respaldo si el servidor falla (GitHub Pages siempre funciona)
        return respuestaLocal(textoLimpio, mensajeUsuario, contexto);
    }

    async function procesarMensajeUsuario(usarVoz = false) {
        const texto = inputChat.value.trim();
        if (!texto) return;

        agregarMensajeDOM(texto, "user");
        inputChat.value = "";
        const pensando = agregarMensajeDOM('<span class="puntos" aria-label="ASTRA está pensando"><i></i><i></i><i></i></span>', "bot");
        pensando.classList.add("pensando");

        const respuesta = await generarRespuestaBot(texto);
        pensando.remove();
        agregarMensajeDOM(respuesta, "bot");
        historial.push({ role: "user", content: texto }, { role: "assistant", content: aTextoPlano(respuesta) });
        if (historial.length > 24) historial.splice(0, historial.length - 24);

        // Habla si se le habló por voz o si el altavoz está activado (también para respuestas escritas)
        if (usarVoz || altavoz) {
            voiceManager.speak(respuesta, () => {
                actualizarBotonVoz();
                if (conversacion) setTimeout(() => { if (conversacion) voiceManager.startListening(); }, 300);   // manos libres
            });
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

    // Altavoz: activado, ASTRA lee en voz alta también lo que responde por escrito. Se recuerda en este navegador.
    function setAltavoz(on, avisar) {
        altavoz = on;
        btnAltavoz.setAttribute("aria-pressed", String(on));
        const t = on ? "Altavoz activado: ASTRA lee en voz alta sus respuestas (pulsa para silenciar)" : "Altavoz: leer en voz alta también las respuestas escritas";
        btnAltavoz.title = t; btnAltavoz.setAttribute("aria-label", t);
        try { localStorage.setItem("astra-altavoz", on ? "1" : "0"); } catch (_) {}
        if (on && avisar) voiceManager.desbloquearVoz();       // solo con un clic real (Safari lo exige)
        else if (!on && !conversacion) voiceManager.callar();  // silenciar corta lo que esté leyendo
        if (avisar && on && !voiceManager.soportaVoz) agregarMensajeDOM("Tu navegador no puede leer en voz alta. Prueba con Chrome, Edge o Safari.", "bot");
    }
    btnAltavoz.addEventListener("click", () => setAltavoz(!altavoz, true));

    // ---------- Elegir la voz (las naturales de Edge suenan mucho más humanas) ----------
    const btnVozCfg = document.getElementById("btn-voz-cfg");
    const panelVoz = document.getElementById("panel-voz");
    const selVoz = document.getElementById("sel-voz");
    const notaVoz = document.getElementById("nota-voz");
    const PAISES = { MX: "México", ES: "España", PE: "Perú", AR: "Argentina", CO: "Colombia", CL: "Chile", US: "EE. UU.", VE: "Venezuela", BO: "Bolivia", EC: "Ecuador", UY: "Uruguay", PY: "Paraguay", CR: "Costa Rica", CU: "Cuba", DO: "Rep. Dominicana", GT: "Guatemala", HN: "Honduras", NI: "Nicaragua", PA: "Panamá", PR: "Puerto Rico", SV: "El Salvador", GQ: "Guinea Ecuatorial", "419": "Latinoamérica" };
    const nombreVoz = (v) => {
        const pais = PAISES[(v.lang.split(/[-_]/)[1] || "").toUpperCase()] || v.lang;
        const nombre = v.name.replace(/^(Microsoft|Google)\s+/i, "").replace(/\s*Online\s*\(Natural\)/i, "").replace(/\s*-\s*Spanish.*$/i, "").trim();
        return `${nombre} · ${pais}${VoiceManager.esNatural(v) ? " · natural" : ""}`;
    };
    function llenarVoces() {
        const voces = voiceManager.vocesEspanol();
        const actual = voiceManager.vozPreferida || "";
        selVoz.textContent = "";
        const auto = new Option("Automática (la más natural disponible)", "");
        selVoz.add(auto);
        voces.forEach((v) => selVoz.add(new Option(nombreVoz(v), v.voiceURI)));
        selVoz.value = voces.some((v) => v.voiceURI === actual) ? actual : "";
        const naturales = voces.filter(VoiceManager.esNatural).length;
        notaVoz.textContent = !voiceManager.soportaVoz ? "Este navegador no puede leer en voz alta."
            : !voces.length ? "No hay voces en español en este navegador."
            : naturales ? `${naturales} voces naturales disponibles.`
            : "Para voces más naturales, abre la web en Microsoft Edge.";
    }
    const abrirPanelVoz = (on) => {
        panelVoz.hidden = !on; btnVozCfg.setAttribute("aria-expanded", String(on));
        if (on) { llenarVoces(); selVoz.focus(); }
    };
    btnVozCfg.addEventListener("click", () => abrirPanelVoz(panelVoz.hidden));
    document.addEventListener("click", (e) => { if (!panelVoz.hidden && !e.target.closest("#panel-voz, #btn-voz-cfg")) abrirPanelVoz(false); });
    panelVoz.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); abrirPanelVoz(false); btnVozCfg.focus(); } });
    const probarVoz = () => { voiceManager.desbloquearVoz(); voiceManager.speak("Hola, soy ASTRA. Así sueno con esta voz."); };
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
