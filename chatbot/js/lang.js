// ============================================================================
// IDIOMA DE KILLA (inglés por defecto, español con el botón)
// ============================================================================
// Usa la misma preferencia que la web de ICEWISE (localStorage "icewise-lang"), así el chat siempre
// habla el idioma de la página. ?lang=es / ?lang=en en la dirección lo fuerza.
// Dentro de la web el idioma se cambia con el botón de la página; abierto solo, el chat tiene el suyo.
(function () {
    "use strict";
    const KEY = "icewise-lang";
    const valido = (v) => (v === "es" || v === "en") ? v : null;
    let lang = null;
    try { lang = valido(new URLSearchParams(location.search).get("lang")); } catch (_) {}
    if (lang) { try { localStorage.setItem(KEY, lang); } catch (_) {} }
    if (!lang) { try { lang = valido(localStorage.getItem(KEY)); } catch (_) {} }
    lang = lang || "en";

    window.ASTRA_LANG = lang;
    window.L = (es, en) => (lang === "en" && en !== undefined) ? en : es;
    document.documentElement.lang = lang;

    // Textos fijos de chatbot/index.html en inglés
    const EN = {
        title: "KILLA · ICEWISE Assistant",
        "#lbl-pais": "Country:",
        "#lbl-voz": "KILLA's voice",
        "#btn-probar-voz": "Try voice",
        "#btn-enviar": "Send",
        "#msg-inicio": "Hi, I am <strong>KILLA</strong>. You can type to me or use the microphone button. How can I help you today?"
    };
    const PAISES_EN = { peru: "Peru (PET)", espana: "Spain (CET)", mexico: "Mexico (CST)", colombia: "Colombia (COT)", argentina: "Argentina (ART)", chile: "Chile (CLT)", estados_unidos: "USA (EST)" };
    const ATRIB_EN = {
        "#btn-altavoz": "Speaker: also read written answers aloud",
        "#btn-voz-cfg": "Choose KILLA's voice",
        "#btn-voz": "Talk by voice"
    };

    function aplicar() {
        const btn = document.getElementById("btn-lang");
        if (btn) {
            const otro = lang === "en" ? "es" : "en";
            btn.innerHTML = `<span${lang === "en" ? ' class="on"' : ""}>EN</span><span${lang === "es" ? ' class="on"' : ""}>ES</span>`;
            const t = otro === "es" ? "Cambiar KILLA a español" : "Switch KILLA to English";
            btn.title = t; btn.setAttribute("aria-label", t);
            btn.addEventListener("click", () => {
                try { localStorage.setItem(KEY, otro); } catch (_) {}
                const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u.href);
            });
        }
        if (lang !== "en") return;
        document.title = EN.title;
        for (const sel in EN) { if (sel === "title") continue; const el = document.querySelector(sel); if (el) el.innerHTML = EN[sel]; }
        for (const sel in ATRIB_EN) { const el = document.querySelector(sel); if (el) { el.title = ATRIB_EN[sel]; el.setAttribute("aria-label", ATRIB_EN[sel]); } }
        document.querySelectorAll("#select-pais option").forEach((o) => { if (PAISES_EN[o.value]) o.textContent = PAISES_EN[o.value]; });
        const inp = document.getElementById("input-chat");
        if (inp) { inp.placeholder = "Type a message or speak..."; inp.setAttribute("aria-label", "Message for KILLA"); }
    }
    // Este archivo se carga al final del <body>: el HTML ya existe y se traduce antes de que arranque el chat
    aplicar();
})();
