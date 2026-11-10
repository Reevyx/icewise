/* =========================================================================
   ICEWISE — Navegación e inicialización
   ========================================================================= */
(function () {
  'use strict';
  const { $, $$ } = Ice;

  function initNav() {
    const nav = $('#nav'), prog = $('#progress');
    const onScroll = () => {
      nav.classList.toggle('is-solid', scrollY > 40);
      const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.width = (h > 0 ? scrollY / h * 100 : 0) + '%';
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    const ov = $('#index-overlay'), list = $('#index-list'), sections = $$('main section[id]');
    list.innerHTML = sections.map((s, i) => `<li><a href="#${s.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${s.dataset.title || s.id}</a></li>`).join('');
    const open = () => { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; $('#index-close').focus(); $('#index-open').setAttribute('aria-expanded', 'true'); };
    const close = () => { ov.classList.remove('is-open'); document.body.style.overflow = ''; $('#index-open').setAttribute('aria-expanded', 'false'); };
    $('#index-open').addEventListener('click', open);
    $('#index-close').addEventListener('click', close);
    $$('a', list).forEach(a => a.addEventListener('click', close));
    addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('is-open')) close(); });

    const links = $$('.nav-links a, #index-list a');
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));

    $$('[data-run-mission]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      $('#simulacion').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => document.dispatchEvent(new CustomEvent('icewise:startMission')), 700);
    }));
  }

  function initReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  }

  const PIPE = [
    { t: 'Explorar', d: 'El rover sale de la estación solar y entra en la oscuridad con sus propias luces.' },
    { t: 'Detectar', d: 'Un sensor de neutrones nota el hidrógeno del hielo bajo el suelo.' },
    { t: 'Medir', d: 'Se detiene, mide más tiempo y estima cuánto hielo hay.' },
    { t: 'Decidir', d: '¿Hay suficiente hielo, el terreno es seguro y queda batería para volver?' },
    { t: 'Perforar', d: 'Taladra 1 m y guarda las muestras en cartuchos fríos.' },
    { t: 'Convertir y limpiar', d: 'Un horno convierte el hielo en vapor. El agua obtenida pasa por un biofiltro de microorganismos y por filtros químicos.' }
  ];
  function initPipeline() {
    const el = $('#pipeline'); if (!el) return;
    el.innerHTML = PIPE.map((p, i) => `<a href="#simulacion" class="step reveal"><span class="n">${String(i + 1).padStart(2, '0')}</span><div class="t">${p.t}</div><div class="d">${p.d}</div></a>`).join('');
  }

  const KEY_REFS = [3, 4, 5, 6, 11, 12, 14, 16, 21, 22, 24, 27, 29, 31, 46, 47, 48, 49, 50, 51, 42, 43];
  function initRefs() {
    const ol = $('#ref-list'); if (!ol) return;
    ol.innerHTML = IceData.REFS.filter(r => KEY_REFS.includes(r.id)).map(r =>
      `<li id="ref-${r.id}"><span class="n">·</span><span>${r.text}<br><a href="${r.url}" target="_blank" rel="noopener">${r.url.replace(/^https?:\/\//, '')}</a></span></li>`).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.remove('no-js');
    initNav(); initPipeline(); initRefs();
    if (window.IceSimViewInit) IceSimViewInit();
    IceLab.init();
    if (window.IceProto) IceProto.init();
    initReveal();
  });
})();
