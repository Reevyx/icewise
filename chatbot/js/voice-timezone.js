// ============================================================================
// MÓDULO DE VOZ (WEB SPEECH API) Y ZONA HORARIA (IANA)
// ============================================================================
// Funciona en GitHub Pages (HTTPS). Dictado: Chrome, Edge y Safari (Firefox no lo tiene: se avisa
// y se puede escribir). Lectura en voz alta: todos los navegadores modernos.
// Cada país usa su variante de español para entender y para hablar.
const ZONAS_HORARIAS = {
    "peru": { tz: "America/Lima", nombre: "Perú", voz: "es-PE" },
    "espana": { tz: "Europe/Madrid", nombre: "España", voz: "es-ES" },
    "mexico": { tz: "America/Mexico_City", nombre: "México", voz: "es-MX" },
    "colombia": { tz: "America/Bogota", nombre: "Colombia", voz: "es-CO" },
    "argentina": { tz: "America/Argentina/Buenos_Aires", nombre: "Argentina", voz: "es-AR" },
    "chile": { tz: "America/Santiago", nombre: "Chile", voz: "es-CL" },
    "estados_unidos": { tz: "America/New_York", nombre: "Estados Unidos", voz: "es-US" }
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
            voz: "es-ES"
        };

        const ahora = new Date();
        const horaCorta = new Intl.DateTimeFormat("es-ES", {
            timeZone: info.tz,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }).format(ahora);

        const fechaHoraCompleta = new Intl.DateTimeFormat("es-ES", {
            timeZone: info.tz,
            dateStyle: "full",
            timeStyle: "medium"
        }).format(ahora);

        return {
            paisClave: this.paisActual,
            paisNombre: info.nombre,
            timeZone: info.tz,
            idiomaVoz: info.voz || "es-ES",
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
        this.idioma = opciones.idioma || "es-ES";
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
        this.idioma = idioma || "es-ES";
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

    elegirVoz() {
        const voces = this.voces && this.voces.length ? this.voces : (this.soportaVoz ? window.speechSynthesis.getVoices() : []);
        const id = this.idioma.toLowerCase();
        return voces.find((v) => v.lang.replace("_", "-").toLowerCase() === id)
            || voces.find((v) => /^es[-_]/i.test(v.lang) && v.localService)
            || voces.find((v) => /^es/i.test(v.lang))
            || null;
    }

    hablando() {
        return this.soportaVoz && window.speechSynthesis.speaking;
    }

    callar() {
        if (this.soportaVoz) window.speechSynthesis.cancel();
    }

    // Lee el texto en voz alta. onEnd se llama al terminar (o si no se puede hablar).
    speak(text, onEnd) {
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
        const voz = this.elegirVoz();
        trozos.forEach((trozo, i) => {
            const utterance = new SpeechSynthesisUtterance(trozo.trim());
            utterance.lang = voz ? voz.lang : this.idioma;
            if (voz) utterance.voice = voz;
            if (i === trozos.length - 1) { utterance.onend = () => onEnd?.(); utterance.onerror = () => onEnd?.(); }
            window.speechSynthesis.speak(utterance);
        });
    }
}
