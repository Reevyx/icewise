// ============================================================================
// MÓDULO DE VOZ (WEB SPEECH API) Y ZONA HORARIA (IANA)
// ============================================================================
// Funciona en GitHub Pages (HTTPS). Dictado: Chrome, Edge y Safari (Firefox no lo tiene: se avisa
// y se puede escribir). Lectura en voz alta: todos los navegadores modernos.
// Cada país usa su variante de español para entender y para hablar.
// En inglés (window.ASTRA_LANG, js/lang.js) KILLA entiende y habla inglés de EE. UU. en todos los países.
const ASTRA_EN = (window.ASTRA_LANG || "es") === "en";
const IDIOMA_BASE = ASTRA_EN ? "en-US" : "es-ES";
const ZONAS_HORARIAS = {
    "peru": { tz: "America/Lima", nombre: ASTRA_EN ? "Peru" : "Perú", voz: ASTRA_EN ? "en-US" : "es-PE" },
    "espana": { tz: "Europe/Madrid", nombre: ASTRA_EN ? "Spain" : "España", voz: ASTRA_EN ? "en-GB" : "es-ES" },
    "mexico": { tz: "America/Mexico_City", nombre: ASTRA_EN ? "Mexico" : "México", voz: ASTRA_EN ? "en-US" : "es-MX" },
    "colombia": { tz: "America/Bogota", nombre: "Colombia", voz: ASTRA_EN ? "en-US" : "es-CO" },
    "argentina": { tz: "America/Argentina/Buenos_Aires", nombre: "Argentina", voz: ASTRA_EN ? "en-US" : "es-AR" },
    "chile": { tz: "America/Santiago", nombre: "Chile", voz: ASTRA_EN ? "en-US" : "es-CL" },
    "estados_unidos": { tz: "America/New_York", nombre: ASTRA_EN ? "United States" : "Estados Unidos", voz: ASTRA_EN ? "en-US" : "es-US" }
};

class TimezoneManager {
    constructor(selectElementId, clockElementId) {
        this.selectEl = document.getElementById(selectElementId);
        this.clockEl = document.getElementById(clockElementId);
        this.paisActual = this.selectEl ? this.selectEl.value : "peru";
        this.init();
    }

    init() {
        if (this.selectEl) {
            this.selectEl.addEventListener("change", (e) => {
                this.paisActual = e.target.value;
                this.actualizarReloj();
            });
        }
        this.actualizarReloj();
        setInterval(() => this.actualizarReloj(), 1000);
    }

    getContextoHorario() {
        const info = ZONAS_HORARIAS[this.paisActual] || {
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            nombre: "Local",
            voz: IDIOMA_BASE
        };

        const ahora = new Date();
        const horaCorta = new Intl.DateTimeFormat(IDIOMA_BASE, {
            timeZone: info.tz,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }).format(ahora);

        const fechaHoraCompleta = new Intl.DateTimeFormat(IDIOMA_BASE, {
            timeZone: info.tz,
            dateStyle: "full",
            timeStyle: "medium"
        }).format(ahora);

        return {
            paisClave: this.paisActual,
            paisNombre: info.nombre,
            timeZone: info.tz,
            idiomaVoz: info.voz || IDIOMA_BASE,
            horaCorta,
            fechaHoraCompleta
        };
    }

    actualizarReloj() {
        if (!this.clockEl) return;
        const { horaCorta } = this.getContextoHorario();
        this.clockEl.textContent = horaCorta;
    }
}

class VoiceManager {
    // onStateChangeCallback(estado, detalle): "listening" · "idle" · "error" (detalle = código del navegador) · "unsupported"
    constructor(onTranscriptCallback, onStateChangeCallback, opciones = {}) {
        this.onTranscript = onTranscriptCallback;
        this.onStateChange = onStateChangeCallback;
        this.idioma = opciones.idioma || IDIOMA_BASE;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
        this.soportaDictado = !!this.recognition;
        this.soportaVoz = "speechSynthesis" in window;

        if (this.recognition) {
            this.recognition.lang = this.idioma;
            this.recognition.interimResults = false;
            this.recognition.continuous = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => this.onStateChange?.("listening");
            this.recognition.onend = () => this.onStateChange?.("idle");
            this.recognition.onerror = (e) => {
                console.warn("Error de voz:", e.error);
                this.onStateChange?.("error", e.error);
            };
            this.recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                this.onTranscript?.(text);
            };
        }
        // Las voces del sistema se cargan después de abrir la página
        if (this.soportaVoz) {
            this.voces = window.speechSynthesis.getVoices();
            window.speechSynthesis.addEventListener?.("voiceschanged", () => { this.voces = window.speechSynthesis.getVoices(); });
        }
    }

    setIdioma(idioma) {
        this.idioma = idioma || IDIOMA_BASE;
        if (this.recognition) this.recognition.lang = this.idioma;
    }

    startListening() {
        if (!this.recognition) {
            this.onStateChange?.("unsupported");
            return false;
        }
        this.desbloquearVoz();
        if (this.soportaVoz) window.speechSynthesis.cancel();   // no escucharse a sí misma
        try {
            this.recognition.lang = this.idioma;
            this.recognition.start();
            return true;
        } catch (err) {
            console.warn("El reconocimiento ya está activo.");
            return false;
        }
    }

    stopListening() {
        try { this.recognition && this.recognition.abort(); } catch (_) {}
    }

    // Safari (iPhone) solo deja hablar después de un toque: se "desbloquea" con el primer clic del micrófono
    desbloquearVoz() {
        if (!this.soportaVoz || this._desbloqueada) return;
        this._desbloqueada = true;
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }

    // Voz elegida por la persona (voiceURI); vacío = automática
    setVozPreferida(uri) {
        this.vozPreferida = uri || "";
    }

    // Voces naturales: en Edge, "Microsoft … Online (Natural)"; en otros sistemas, las neuronales
    static esNatural(v) {
        return /natural|neural/i.test(v.name);
    }

    // Voces del idioma de la página (español o inglés): primero las naturales, luego las del país elegido, luego el resto
    vocesEspanol() {
        const todas = this.soportaVoz ? window.speechSynthesis.getVoices() : [];
        const id = this.idioma.toLowerCase();
        const delPais = (v) => v.lang.replace("_", "-").toLowerCase() === id;
        return todas
            .filter((v) => (ASTRA_EN ? /^en([-_]|$)/i : /^es([-_]|$)/i).test(v.lang))
            .sort((a, b) => (VoiceManager.esNatural(b) - VoiceManager.esNatural(a)) || (delPais(b) - delPais(a)) || a.name.localeCompare(b.name));
    }

    elegirVoz() {
        const voces = this.vocesEspanol();
        if (this.vozPreferida) {
            const elegida = voces.find((v) => v.voiceURI === this.vozPreferida);
            if (elegida) return elegida;
        }
        // Automática: la voz natural del país; si no hay, cualquier natural; si no, la del país; si no, la primera en español
        const id = this.idioma.toLowerCase();
        const delPais = (v) => v.lang.replace("_", "-").toLowerCase() === id;
        return voces.find((v) => VoiceManager.esNatural(v) && delPais(v))
            || voces.find((v) => VoiceManager.esNatural(v))
            || voces.find(delPais)
            || voces[0]
            || null;
    }

    hablando() {
        return this.soportaVoz && window.speechSynthesis.speaking;
    }

    callar() {
        if (this.soportaVoz) window.speechSynthesis.cancel();
    }

    // Voz para un idioma distinto al de la página (KILLA responde en el idioma en que le escriben)
    vozDeIdioma(lang) {
        const todas = this.soportaVoz ? window.speechSynthesis.getVoices() : [];
        const re = lang === "en" ? /^en([-_]|$)/i : /^es([-_]|$)/i;
        const voces = todas.filter((v) => re.test(v.lang));
        return voces.find((v) => VoiceManager.esNatural(v)) || voces[0] || null;
    }

    // Lee el texto en voz alta. onEnd se llama al terminar (o si no se puede hablar).
    // lang ("es" | "en"): idioma de la respuesta; si no es el de la página, se usa una voz de ese idioma.
    speak(text, onEnd, lang) {
        if (!this.soportaVoz) { onEnd?.(); return; }
        window.speechSynthesis.cancel();
        // Texto sin etiquetas HTML (con un documento aparte, que no ejecuta nada)
        const html = String(text).replace(/<br\s*\/?>/gi, ". ");
        const cleanText = (new DOMParser().parseFromString(html, "text/html").body.textContent || "").replace(/\s+/g, " ").trim();
        if (!cleanText) { onEnd?.(); return; }
        // Frases cortas: Chrome corta las lecturas de más de ~15 segundos
        const frases = cleanText.match(/[^.!?…]+[.!?…]*\s*/g) || [cleanText];
        const trozos = [];
        frases.forEach((f) => {
            const ultimo = trozos[trozos.length - 1];
            if (ultimo && (ultimo + f).length < 180) trozos[trozos.length - 1] = ultimo + f; else trozos.push(f);
        });
        const otro = lang && lang !== (ASTRA_EN ? "en" : "es");
        const voz = otro ? this.vozDeIdioma(lang) : this.elegirVoz();
        const langVoz = otro ? (lang === "en" ? "en-US" : "es-ES") : this.idioma;
        trozos.forEach((trozo, i) => {
            const utterance = new SpeechSynthesisUtterance(trozo.trim());
            utterance.lang = voz ? voz.lang : langVoz;
            if (voz) utterance.voice = voz;
            if (i === trozos.length - 1) { utterance.onend = () => onEnd?.(); utterance.onerror = () => onEnd?.(); }
            window.speechSynthesis.speak(utterance);
        });
    }
}
