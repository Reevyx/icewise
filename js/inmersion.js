/* =========================================================================
   ICEWISE — inmersión en las imágenes (inspirada en lusion.co)
   -------------------------------------------------------------------------
   · Aparición: al entrar en pantalla, cada imagen llega desde abajo con perspectiva (inclinada hacia atrás),
     se endereza mientras su marco se abre (clip-path) y la foto interior se aleja de 1,25× a 1×.
   · Hover (solo con ratón): la imagen se inclina en 3D hacia el cursor, la foto se desplaza al revés
     (paralaje, da profundidad) y un reflejo de luz sigue al puntero. Todo con un muelle suave.
   · Cursor con etiqueta: sobre las imágenes aparece un círculo que sigue al ratón con lo que hará el clic
     («Ampliar», «Entrar»).
   · Con «reducir movimiento» no hay aparición ni inclinación; todo se ve desde el principio.
   ========================================================================= */
(function () {
  'use strict';
  const L = window.L || ((es) => es);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const items = Array.from(document.querySelectorAll('figure.media, .st-media'));
  if (!items.length || reduce) return;

  // ---------- aparición en 3D ----------
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el);
      el.classList.add('ix-in');
      setTimeout(() => el.classList.remove('ix-pre', 'ix-in'), 1700);   // al terminar, quita el recorte (no estorba al hover)
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.9 && r.bottom > 0) return;          // ya visible al cargar: sin animación
      el.classList.add('ix-pre'); io.observe(el);
    });
  }

  if (!fine) return;

  // ---------- inclinación 3D con muelle ----------
  items.forEach((el) => {
    el.classList.add('ix-tilt');
    const s = { rx: 0, ry: 0, tx: 0, ty: 0, vx: 0, vy: 0, gx: 50, gy: 50, on: false, raf: 0, last: 0 };
    const tick = (now) => {
      s.raf = 0;
      const dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now;
      const k = 1 - Math.exp(-dt * 9);                                    // seguimiento suave (estable con cualquier dt)
      s.rx += (s.tx - s.rx) * k; s.ry += (s.ty - s.ry) * k;
      el.style.setProperty('--rx', s.rx.toFixed(3) + 'deg'); el.style.setProperty('--ry', s.ry.toFixed(3) + 'deg');
      el.style.setProperty('--px', (-s.ry * 1.6).toFixed(2) + 'px'); el.style.setProperty('--py', (s.rx * 1.6).toFixed(2) + 'px');
      if (Math.abs(s.tx - s.rx) > 0.01 || Math.abs(s.ty - s.ry) > 0.01) s.raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(tick); } };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      s.ty = nx * 9; s.tx = -ny * 7;
      el.style.setProperty('--gx', ((nx + 0.5) * 100).toFixed(1) + '%'); el.style.setProperty('--gy', ((ny + 0.5) * 100).toFixed(1) + '%');
      el.classList.add('ix-hover'); go();
    });
    el.addEventListener('pointerleave', () => { s.tx = 0; s.ty = 0; el.classList.remove('ix-hover'); go(); });
  });

  // ---------- cursor con etiqueta ----------
  const cur = document.createElement('div'); cur.className = 'ix-cursor'; cur.setAttribute('aria-hidden', 'true');
  cur.innerHTML = '<span></span>'; document.body.appendChild(cur);
  const label = (el) => el.matches('.st-media') ? L('Entrar', 'Enter') : L('Ampliar', 'Zoom');
  let cx = innerWidth / 2, cy = innerHeight / 2, x = cx, y = cy, raf = 0, last = 0, over = null;
  const loop = (now) => {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    const k = 1 - Math.exp(-dt * 14); x += (cx - x) * k; y += (cy - y) * k;
    cur.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (over || Math.abs(cx - x) > 0.3 || Math.abs(cy - y) > 0.3) raf = requestAnimationFrame(loop);
  };
  document.addEventListener('pointermove', (e) => {
    cx = e.clientX; cy = e.clientY;
    const el = e.target.closest && e.target.closest('figure.media, .st-media');
    if (el !== over) {
      over = el; cur.classList.toggle('is-on', !!el);
      if (el) { cur.firstChild.textContent = label(el); x = cx; y = cy; }
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { over = null; cur.classList.remove('is-on'); });
})();
