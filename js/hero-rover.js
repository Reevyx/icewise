/* =========================================================================
   ICEWISE — «El rover»: vídeo cinematográfico en bucle
   -------------------------------------------------------------------------
   · Vídeo de 12 s a 30 fps renderizado en Blender con trazado de rayos (Cycles, desenfoque de movimiento real con
     obturador de 180°): el rover de ICEWISE (diseño propio) iluminado como en la presentación de un coche, con sombras
     negras marcadas y gran contraste. Escena: assets/models/rover-video.blend.
   · El bucle no tiene corte: la cámara, el mástil, el taladro y el brazo terminan exactamente en la pose del
     primer fotograma (curvas cíclicas).
   · Archivos: assets/video/rover.mp4 (1920 × 872, formato 2,2:1) y rover-movil.mp4 (recorte centrado en el rover).
     Se reproduce solo, sin sonido, mientras la sección está a la vista; se pausa fuera de ella.
   · Las 4 etapas del texto siguen al vídeo: una cada 3 s (fotogramas 1, 90, 180 y 270).
   · Con «reducir movimiento», imagen fija (póster) y todo el texto visible.
   ========================================================================= */
(function () {
  'use strict';
  const sec = document.getElementById('rover');
  const host = document.getElementById('rover-stage');
  if (!sec || !host) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const beats = Array.from(sec.querySelectorAll('[data-beat]'));
  const dots = Array.from(sec.querySelectorAll('.rs-dot'));
  const SEG = 3;                                              // segundos por etapa
  const small = innerWidth < 760 || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700);
  const src = small ? { mp4: 'assets/video/rover-movil.mp4', poster: 'assets/video/rover-movil.jpg', w: 900, h: 602 }
                    : { mp4: 'assets/video/rover.mp4', poster: 'assets/video/rover.jpg', w: 1920, h: 872 };

  const v = document.createElement('video');
  v.className = 'rs-video'; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
  v.preload = 'none'; v.poster = src.poster; v.disablePictureInPicture = true;
  v.setAttribute('aria-label', (window.L || ((e) => e))('Vídeo del rover de ICEWISE: enciende sus faros, mide el suelo, perfora y guarda la muestra con su brazo', 'Video of the ICEWISE rover: it turns on its lights, scans the ground, drills and stores the sample with its arm'));
  host.appendChild(v);
  v.addEventListener('error', () => sec.classList.add('rs--static'));
  sec.classList.add('rs--ready');                             // el póster ya se ve mientras carga

  // ---------- encuadre: formato cine a todo el ancho (escritorio) o recorte arriba (móvil) ----------
  const wide = () => !small && host.clientWidth / Math.max(1, host.clientHeight) > 1.15;
  function layout() {
    const W = host.clientWidth, H = host.clientHeight;
    const s = wide() ? Math.max(W / src.w, (H * 0.74) / src.h) : W / src.w;
    const w = src.w * s, h = src.h * s;
    const x = wide() ? (W - w) * 0.7 : 0;
    const y = wide() ? Math.max((H - h) / 2, Math.min(0, (H - h) * 0.4)) : H * 0.08;
    Object.assign(v.style, { width: w + 'px', height: h + 'px', left: x + 'px', top: y + 'px' });
  }
  new ResizeObserver(layout).observe(host); layout();

  // ---------- etapas del texto ----------
  let beat = -2;
  function setBeat(nb) {
    if (nb === beat) return; beat = nb;
    beats.forEach((b, k) => { b.classList.toggle('is-on', k === beat); b.setAttribute('aria-current', k === beat ? 'step' : 'false'); });
    dots.forEach((d, k) => d.classList.toggle('is-on', k === beat));
  }
  setBeat(reduce.matches ? -1 : 0);
  let raf = 0;
  const follow = () => { raf = 0; setBeat(Math.min(beats.length - 1, Math.floor((v.currentTime || 0) / SEG))); if (!v.paused) raf = requestAnimationFrame(follow); };
  v.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(follow); });

  // ---------- reproducir solo a la vista ----------
  if (reduce.matches) return;
  let started = false;
  const load = () => { if (started) return; started = true; v.preload = 'auto'; v.src = src.mp4; };
  const play = () => { load(); const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  const inView = () => { const r = host.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !document.hidden) play(); else v.pause(); }, { threshold: 0.2 }).observe(host);
  new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { load(); io.disconnect(); } }, { rootMargin: '100% 0px' }).observe(sec);   // se descarga un poco antes de llegar
  document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (inView()) play(); });
})();
