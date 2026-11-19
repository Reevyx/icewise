/* =========================================================================
   ICEWISE — Navegación, interacción e inicialización
   Movimiento con criterios de Apple (respuesta inmediata, transiciones que parten del estado
   actual, origen anclado a lo que se toca) y siempre respetando «reducir movimiento».
   ========================================================================= */
(function () {
  'use strict';
  const { $, $$ } = Ice;
  const reduce = () => Ice.reduceMotion();

  // ---------- Barra superior, índice y sección activa ----------
  function initNav() {
    const nav = $('#nav'), prog = $('#progress');
    const onScroll = () => {
      nav.classList.toggle('is-solid', scrollY > 40);
      const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    const ov = $('#index-overlay'), list = $('#index-list'), sections = $$('main section[id]');
    if (ov && list) {                                                       // el índice solo existe en la portada
      list.innerHTML = sections.map((s, i) => `<li style="--i:${i}"><a href="${s.id === 'simulacion' ? 'simulacion.html' : '#' + s.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${s.dataset.title || s.id}</a></li>`).join('');
      const open = () => { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; $('#index-close').focus(); $('#index-open').setAttribute('aria-expanded', 'true'); };
      const close = () => { ov.classList.remove('is-open'); document.body.style.overflow = ''; $('#index-open').setAttribute('aria-expanded', 'false'); };
      $('#index-open').addEventListener('click', open);
      $('#index-close').addEventListener('click', close);
      $$('a', list).forEach(a => a.addEventListener('click', close));
      addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('is-open')) close(); });
    }

    // Indicador que se desliza bajo el enlace de la sección en la que estás
    const navList = $('.nav-links'), ind = document.createElement('span');
    ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true'); navList.appendChild(ind);
    const moveInd = (a) => {
      if (!a) { ind.classList.remove('is-on'); return; }
      const r = a.getBoundingClientRect(), p = navList.getBoundingClientRect();
      ind.style.transform = `translateX(${r.left - p.left}px)`; ind.style.width = r.width + 'px'; ind.classList.add('is-on');
    };
    const links = $$('.nav-links a, #index-list a');
    let current = $('.nav-links a[aria-current="page"]');                    // en la página de la simulación
    if (current) requestAnimationFrame(() => moveInd(current));
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting || $('.nav-links a[aria-current="page"]')) return;
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
      current = $(`.nav-links a[href="#${en.target.id}"]`); moveInd(current);
    }), { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));
    addEventListener('resize', () => moveInd(current));

    // La simulación vive en su propia página: los botones llevan allí y la simulación espera EN PAUSA en la
    // estación; la misión empieza cuando se pulsa «Iniciar».
    // Si ya estás en esa página, el botón solo baja hasta el visor.
    $$('[data-run-mission]').forEach(b => b.addEventListener('click', e => {
      if (!$('#sim-view')) return;
      e.preventDefault();
      $('#simulacion').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' });
    }));
  }

  // ---------- Aparición al entrar en pantalla, escalonada ----------
  function initReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver(es => {
      let k = 0;
      es.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.style.transitionDelay = reduce() ? '0ms' : Math.min(k++ * 70, 350) + 'ms';
        en.target.classList.add('is-in'); io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  }

  // ---------- Cómo funciona: seis pasos interactivos ----------
  const ICONS = [
    '<path d="M3 18h18M6 18l2-5h8l2 5"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/><path d="M12 13V7l4-2"/>',
    '<circle cx="12" cy="12" r="2"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"/>',
    '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    '<path d="M12 3v6M12 15v6M5 9h14l-3 3 3 3H5"/>',
    '<path d="M12 3v12M8 11l4 4 4-4M7 21h10"/><path d="M12 15l-2 3h4z"/>',
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/><path d="M9.5 13a2.5 2.5 0 0 0 2.5 2.5"/>'
  ];
  const PIPE = L([
    { t: 'Explorar', d: 'El rover sale de la estación solar y entra en la oscuridad con sus propias luces.',
      x: 'Sale de la estación solar del borde iluminado y baja hacia los cráteres en sombra, guiado por sus faros y cámaras.', f: '3,6 km/h · supuesto de diseño' },
    { t: 'Detectar', d: 'Un sensor de neutrones nota el hidrógeno del hielo bajo el suelo.',
      x: 'Un espectrómetro de neutrones nota el hidrógeno del hielo hasta cerca de 1 m bajo el suelo. No ve el hielo: lo deduce.', f: 'hasta ~1 m de profundidad' },
    { t: 'Medir', d: 'Se detiene, mide más tiempo y estima cuánto hielo hay.',
      x: 'Se detiene unos 20 minutos para contar neutrones con más precisión y estimar qué porcentaje del suelo es hielo.', f: '20 min por punto' },
    { t: 'Decidir', d: '¿Hay suficiente hielo, el terreno es seguro y queda batería para volver?',
      x: 'Perfora solo si el hielo estimado supera el umbral, la pendiente es de 15° o menos y le queda batería para volver a la luz.', f: 'umbral 3 % · pendiente ≤ 15°' },
    { t: 'Perforar', d: 'Taladra 1 m y guarda las muestras en cartuchos fríos.',
      x: 'Un taladro de 300 W baja hasta 1 m y guarda las muestras en cartuchos sellados y fríos para no perder hielo por el camino.', f: '1 m · 300 W' },
    { t: 'Convertir y limpiar', d: 'Un horno convierte el hielo en vapor. El agua obtenida pasa por un biofiltro de microorganismos y por filtros químicos.',
      x: 'En la estación, el horno convierte el hielo en vapor y una trampa fría lo recoge. El agua pasa por el biofiltro de microorganismos, filtros químicos y luz UV.', f: '≈ 4,3 L al día (modelo)' }
  ], [
    { t: 'Explore', d: 'The rover leaves the solar station and drives into the darkness with its own lights.',
      x: 'It leaves the solar station on the sunlit rim and heads down to the shadowed craters, guided by its headlights and cameras.', f: '3.6 km/h · design assumption' },
    { t: 'Detect', d: 'A neutron sensor picks up the hydrogen of the ice beneath the ground.',
      x: 'A neutron spectrometer picks up the hydrogen of the ice down to about 1 m below the ground. It does not see the ice: it infers it.', f: 'down to ~1 m deep' },
    { t: 'Measure', d: 'It stops, measures for longer and estimates how much ice there is.',
      x: 'It stops for about 20 minutes to count neutrons more precisely and estimate what percentage of the soil is ice.', f: '20 min per point' },
    { t: 'Decide', d: 'Is there enough ice, is the terrain safe and is there battery left to return?',
      x: 'It drills only if the estimated ice is above the threshold, the slope is 15° or less and it has enough battery to get back to the light.', f: '3% threshold · slope ≤ 15°' },
    { t: 'Drill', d: 'It drills 1 m and stores the samples in cold cartridges.',
      x: 'A 300 W drill goes down to 1 m and stores the samples in sealed, cold cartridges so no ice is lost on the way.', f: '1 m · 300 W' },
    { t: 'Convert and clean', d: 'An oven turns the ice into vapour. The water obtained passes through a microorganism biofilter and chemical filters.',
      x: 'At the station, the oven turns the ice into vapour and a cold trap collects it. The water passes through the microorganism biofilter, chemical filters and UV light.', f: '≈ 4.3 L a day (model)' }
  ]);
  function initPipeline() {
    const el = $('#pipeline'); if (!el) return;
    el.setAttribute('role', 'tablist'); el.setAttribute('aria-label', L('Pasos del sistema', 'System steps'));
    el.innerHTML = `<div class="pipe-rail" aria-hidden="true"><i id="pipe-fill"></i></div>` + PIPE.map((p, i) =>
      `<button type="button" role="tab" class="step" id="pstep-${i}" aria-controls="pipe-detail" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
        <span class="n">${String(i + 1).padStart(2, '0')}</span><div class="t">${p.t}</div><div class="d">${p.d}</div></button>`).join('');
    const detail = document.createElement('div');
    detail.className = 'pipe-detail'; detail.id = 'pipe-detail'; detail.setAttribute('role', 'tabpanel'); detail.setAttribute('aria-live', 'polite');
    el.after(detail);
    const steps = $$('.step', el);
    let cur = -1, timer = 0, auto = !reduce(), inView = false;
    const show = (i, user) => {
      if (user) { auto = false; clearInterval(timer); }
      if (i === cur) return;
      const dir = i > cur ? 1 : -1; cur = i;
      steps.forEach((s, k) => { s.setAttribute('aria-selected', String(k === i)); s.tabIndex = k === i ? 0 : -1; s.classList.toggle('is-active', k === i); s.classList.toggle('is-done', k < i); });
      $('#pipe-fill').style.transform = `scaleX(${(i + 0.5) / PIPE.length})`;
      const p = PIPE[i];
      detail.style.setProperty('--dir', dir);
      detail.innerHTML = `<div class="pd-ic"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i]}</svg></div>
        <div class="pd-body"><span class="pd-n">${L('Paso', 'Step')} ${i + 1} / ${PIPE.length}</span><h3>${p.t}</h3><p>${p.x}</p></div>
        <div class="pd-side"><span class="pd-fact">${p.f}</span><a class="btn btn--sm" href="simulacion.html#mision" data-run-mission>${L('Verlo en la simulación', 'See it in the simulation')}</a></div>`;
      detail.classList.remove('is-anim'); void detail.offsetWidth; detail.classList.add('is-anim');
      $('[data-run-mission]', detail).addEventListener('click', e => {
        if (!$('#sim-view')) return;                 // en la portada: enlace normal a simulacion.html
        e.preventDefault(); $('#simulacion').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' });
      });
    };
    steps.forEach((s, i) => {
      s.addEventListener('pointerdown', () => show(i, true));            // responde al presionar, no al soltar
      s.addEventListener('click', () => show(i, true));
      s.addEventListener('keydown', e => {
        const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return;
        e.preventDefault(); const n = (cur + k + PIPE.length) % PIPE.length; show(n, true); steps[n].focus();
      });
    });
    show(0);
    // Avanza solo mientras se ve y nadie lo ha tocado
    const run = () => { clearInterval(timer); if (auto && inView) timer = setInterval(() => show((cur + 1) % PIPE.length), 5200); };
    new IntersectionObserver(es => { inView = es[0].isIntersecting; run(); }, { threshold: 0.4 }).observe(el);
    el.addEventListener('pointerenter', () => clearInterval(timer));
    el.addEventListener('pointerleave', run);
  }

  // ---------- Fuentes ----------
  const KEY_REFS = [3, 4, 5, 6, 11, 12, 14, 16, 21, 22, 24, 27, 29, 31, 46, 47, 48, 49, 50, 51, 52, 53, 54, 42, 43];
  function initRefs() {
    const ol = $('#ref-list'); if (!ol) return;
    ol.innerHTML = IceData.REFS.filter(r => KEY_REFS.includes(r.id)).map(r =>
      `<li id="ref-${r.id}"><span class="n">·</span><span>${L(r.text, r.en || r.text)}<br><a href="${r.url}" target="_blank" rel="noopener">${r.url.replace(/^https?:\/\//, '')}</a></span></li>`).join('');
  }

  // ---------- Números que cuentan al aparecer ----------
  function initCounters() {
    $$('[data-count]').forEach(el => Ice.countUp(el));
    const kpis = $('#dv-kpis'); if (!kpis || reduce()) return;
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return; io.disconnect();
      $$('.v', kpis).forEach(v => { const s = v.__sp; if (!s || !isFinite(s.t)) return; s.x = 0; s.v = 0; Ice.springNumber(v, s.t, s.html, 0.8); });
    }, { threshold: 0.3 }).observe(kpis);
  }

  // ---------- Luz que sigue al puntero sobre las tarjetas ----------
  function initSpotlight() {
    if (!matchMedia('(hover: hover)').matches) return;
    let raf = 0, ev = null;
    document.addEventListener('pointermove', e => {
      ev = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; const c = ev.target.closest && ev.target.closest('.card, .dv-kpi'); if (!c) return;
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (ev.clientX - r.left) + 'px'); c.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  // ---------- Ampliar imágenes: crecen desde donde están y vuelven al mismo sitio ----------
  function initZoom() {
    const imgs = $$('figure.media img');
    if (!imgs.length) return;
    const ov = document.createElement('div'); ov.className = 'zoom-ov'; ov.hidden = true;
    ov.innerHTML = `<button type="button" class="zoom-x" aria-label="${L('Cerrar la imagen', 'Close the image')}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><p class="zoom-cap"></p>`;
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    document.body.appendChild(ov);
    const big = document.createElement('img'), cap = $('.zoom-cap', ov);
    big.alt = ''; big.decoding = 'async'; ov.insertBefore(big, cap);
    let src = null, anim = null;
    const rectFor = (img) => {                                   // tamaño final: cabe en la pantalla
      const ar = img.naturalWidth / img.naturalHeight || 1, mw = innerWidth * 0.92, mh = innerHeight * 0.82;
      const w = Math.min(mw, mh * ar), h = w / ar; return { w, h, x: (innerWidth - w) / 2, y: (innerHeight - h) / 2 - 16 };
    };
    const fromTo = (img, f) => {
      const a = img.getBoundingClientRect(), b = rectFor(img);
      return [`translate(${a.left - b.x}px, ${a.top - b.y}px) scale(${a.width / b.w}, ${a.height / b.h})`, 'none'][f];
    };
    const open = (img) => {
      src = img; big.src = img.currentSrc || img.src; big.alt = img.alt;
      cap.textContent = img.closest('figure')?.querySelector('figcaption')?.textContent || '';
      const r = rectFor(img); Object.assign(big.style, { width: r.w + 'px', height: r.h + 'px', left: r.x + 'px', top: r.y + 'px' });
      ov.hidden = false; document.body.style.overflow = 'hidden'; img.style.visibility = 'hidden';
      requestAnimationFrame(() => ov.classList.add('is-on'));
      if (anim) anim.cancel();
      if (!reduce()) anim = big.animate([{ transform: fromTo(img, 0) }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      $('.zoom-x', ov).focus();
    };
    const close = () => {
      if (!src) return; const img = src; src = null;
      ov.classList.remove('is-on');
      const done = () => { ov.hidden = true; img.style.visibility = ''; document.body.style.overflow = ''; img.focus?.(); };
      if (reduce()) { done(); return; }
      const now = getComputedStyle(big).transform;                 // vuelve desde donde está ahora (interrumpible)
      if (anim) anim.cancel();
      anim = big.animate([{ transform: now === 'none' ? 'none' : now }, { transform: fromTo(img, 0) }], { duration: 420, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
      anim.onfinish = () => { anim.cancel(); done(); };
    };
    imgs.forEach(img => {
      const chip = document.createElement('span');                    // pastilla «Ampliar» que aparece con el hover
      chip.className = 'zoom-chip'; chip.setAttribute('aria-hidden', 'true');
      chip.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>${L('Ampliar', 'Enlarge')}`;
      img.closest('figure')?.appendChild(chip);
      img.tabIndex = 0; img.classList.add('zoomable');
      img.setAttribute('role', 'button'); img.setAttribute('aria-label', L('Ampliar imagen: ', 'Enlarge image: ') + img.alt);
      img.addEventListener('click', () => open(img));
      img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); } });
    });
    ov.addEventListener('click', close);
    addEventListener('keydown', e => { if (e.key === 'Escape' && src) close(); });
    addEventListener('scroll', () => { if (src) close(); }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.remove('no-js');
    initNav(); initPipeline(); initRefs();
    if (window.IceSimViewInit) IceSimViewInit();
    if (window.IceLab) IceLab.init();
    initReveal(); initCounters(); initSpotlight(); initZoom();
  });
})();
