/* =========================================================================
   ICEWISE — Idioma de la página (inglés por defecto, español con el botón)
   -------------------------------------------------------------------------
   · El idioma se guarda en este navegador (localStorage "icewise-lang") y también lo usa ASTRA.
     ?lang=es / ?lang=en en la dirección lo fuerza.
   · El HTML está escrito en español. En inglés, applyPage() cambia cada bloque de texto por su
     traducción de js/i18n-en.js (la clave es el HTML español del bloque, con los espacios
     normalizados). Si un texto español cambia, hay que actualizar su traducción
     (tools/i18n: node extraer.js → editar en-index.json → node construir.js).
   · En el código: L('texto en español', 'English text') devuelve el del idioma activo.
   · Cambiar de idioma recarga la página (la simulación vuelve a empezar).
   ========================================================================= */
(function (root) {
  'use strict';
  const KEY = 'icewise-lang';
  const valido = (v) => (v === 'es' || v === 'en') ? v : null;

  function detectar() {
    let v = null;
    try { v = valido(new URLSearchParams(location.search).get('lang')); } catch (_) {}
    if (v) { try { localStorage.setItem(KEY, v); } catch (_) {} return v; }
    try { v = valido(localStorage.getItem(KEY)); } catch (_) {}
    return v || 'en';
  }

  const lang = root.document ? detectar() : 'es';
  const L = (es, en) => (lang === 'en' && en !== undefined) ? en : es;

  // ---------- Bloques de texto del HTML ----------
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const LETRA = /[A-Za-zÁÉÍÓÚáéíóúÑñÜü]|\d,\d/;   // con letras, o un número con coma decimal ("5,6 %")
  const NO_ENTRAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG', 'CANVAS', 'KBD']);
  const ATRIBUTOS = ['alt', 'title', 'aria-label', 'placeholder', 'data-title'];

  // Un bloque es el elemento más externo que tiene texto propio (con letras); se traduce entero.
  function textoPropio(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && LETRA.test(n.nodeValue) && norm(n.nodeValue) !== 'ICEWISE') return true;
    return false;
  }
  function bloques(raiz) {
    const out = [];
    (function rec(el) {
      for (const h of el.children) {
        if (NO_ENTRAR.has(h.tagName) || h.getAttribute('translate') === 'no') continue;
        if (textoPropio(h)) out.push(h); else rec(h);
      }
    })(raiz);
    return out;
  }
  function atributos(raiz) {
    const out = [];
    raiz.querySelectorAll(ATRIBUTOS.map((a) => `[${a}]`).join(',')).forEach((el) => {
      ATRIBUTOS.forEach((a) => { const v = el.getAttribute(a); if (v && LETRA.test(v)) out.push([el, a, norm(v)]); });
    });
    return out;
  }

  function applyPage(doc) {
    doc = doc || document;
    const de = doc.documentElement;
    try {
      const dic = root.ICEWISE_EN;
      if (lang !== 'en' || !dic) return;
      const t = (s) => dic[norm(s)];
      const titulo = t(doc.title); if (titulo) doc.title = titulo;
      const meta = doc.querySelector('meta[name="description"]');
      if (meta && t(meta.content)) meta.content = t(meta.content);
      // Primero los bloques y después los atributos (así también se traducen los de los bloques nuevos)
      bloques(doc.body).forEach((el) => { const x = dic[norm(el.innerHTML)]; if (x) el.innerHTML = x; });
      atributos(doc.body).forEach(([el, a, v]) => { const x = dic[v]; if (x) el.setAttribute(a, x); });
    } finally {
      de.classList.remove('i18n-wait');
    }
  }

  function setLang(v) {
    v = valido(v); if (!v || v === lang) return;
    try { localStorage.setItem(KEY, v); } catch (_) {}
    const u = new URL(location.href); u.searchParams.delete('lang');
    location.replace(u.href);
  }

  // Botón de idioma (arriba a la derecha): muestra los dos idiomas y resalta el activo
  function initToggle() {
    const b = document.getElementById('lang-toggle'); if (!b) return;
    const otro = lang === 'en' ? 'es' : 'en';
    b.innerHTML = `<span${lang === 'en' ? ' class="on"' : ''}>EN</span><span${lang === 'es' ? ' class="on"' : ''}>ES</span>`;
    const t = otro === 'es' ? 'Ver la página en español' : 'View this page in English';
    b.title = t; b.setAttribute('aria-label', t); b.setAttribute('lang', otro);
    b.addEventListener('click', () => setLang(otro));
  }

  root.IceI18n = { lang, L, applyPage, setLang, initToggle, bloques, atributos, norm, KEY };
  root.IceLang = lang;
  root.L = L;

  const d = root.document;
  if (d && !root.__I18N_EXTRAER) {
    d.documentElement.lang = lang;
    if (lang === 'en') d.documentElement.classList.add('i18n-wait');
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', initToggle); else initToggle();
  }
})(typeof window !== 'undefined' ? window : globalThis);
