/* =========================================================================
   ICEWISE — «El reto»: de la órbita lunar a la sombra permanente de Shackleton
   -------------------------------------------------------------------------
   Se reproduce sola, como un vídeo de 75 s en bucle, para acompañar el discurso. Es UN SOLO vuelo de cámara:
     la Luna a contraluz con el Sol asomando por el borde → la cámara la rodea hasta quedar sobre el polo sur
     (pasa la sonda LRO disparando su láser LOLA) → descenso continuo de 1000 km a 46 km sobre el mosaico LROC
     → el relieve LOLA de Shackleton aparece en su sitio mientras el Sol da una vuelta → descenso al borde, a la
     sombra permanente junto a la estación, donde el rover trabaja → la cámara sube y vuelve a la órbita inicial.
   Guion (segundos): 0 El reto · 7 ¿Por qué la Luna? · 20 ¿Por qué el polo sur? · 35 ¿Por qué Shackleton?
     · 51 Explora la oscuridad · 64 cierre · 69,5–75 regreso a la órbita.
   Controles: pausa / reproducir y barra de capítulos (un clic salta). Fuera de la vista se pausa; al volver
   empieza de nuevo. Con «reducir movimiento» no avanza sola. Consola: document.getElementById('reto').reto.ir(s).

   Un mismo sistema de coordenadas (estereográfica polar de LOLA, en km) une todo: la Luna 3D, el mosaico, el
   relieve del cráter y el relieve fino de la simulación. Por eso los cambios de escala no tienen cortes.

   Datos (todos reales salvo lo indicado):
   · Luna: mapas LROC/LOLA (assets/img/luna/). El Sol está donde corresponde para el polo sur: en el horizonte.
   · Polo sur: mosaico LROC WAC (assets/img/lro-south-pole.jpg, NASA/GSFC/ASU), 1521 px a 400 m/px, centrado en
     el polo y con el meridiano 0° hacia arriba (orientación comprobada contra el relieve LOLA).
   · Shackleton: DEM polar de LOLA (PDS, ldem_85s_40m), ventana de 36 km a 112 m/px (assets/data/shackleton.*).
   · Borde de Shackleton (donde opera la simulación): LOLA 5 m/px Site04 (Barker et al., 2021) a 10 m/px
     (js/dem-shackleton.js, el mismo de la simulación). Encaja con el DEM del cráter con 3,4 m de diferencia media.
   · Sombras del Sol: calculadas en cada fotograma (rayo hacia el Sol con curvatura lunar y disco solar); junto al
     rover, las de la simulación (Sol a 1,2°, acimut 120°). Sombra permanente: horizonte > 1,54° en 24 acimuts.
   · LRO: órbita polar real a ~100 km, ACELERADA (una vuelta cada 25 s; la real dura ~2 h). Los puntos del láser
     LOLA marcan su recorrido; no son medidas concretas.
   · Rover, estación y colonia: modelos propios de ICEWISE, a escala, en las posiciones de la simulación.
     Huellas y cuadros de lectura del sensor: SIMULADOS, como en la simulación. El hielo no se dibuja.
   · El detalle fino del suelo junto al rover es PROCEDIMENTAL.
   ========================================================================= */
(function () {
  'use strict';
  const sec = document.getElementById('reto');
  if (!sec) return;
  const L = window.L || ((es) => es);
  const EN = (document.documentElement.lang || 'es').startsWith('en');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escena = sec.querySelector('.reto-escena'), lienzo = sec.querySelector('.reto-lienzo');
  const caps = Array.from(sec.querySelectorAll('.reto-cap')), barra = sec.querySelector('.reto-rail'), rail = Array.from(sec.querySelectorAll('.reto-rail button[data-ir]'));
  const marcas = sec.querySelector('.reto-marcas'), ficha = sec.querySelector('.reto-ficha'), ret = sec.querySelector('.reto-reticula');
  const latTags = Array.from(sec.querySelectorAll('.reto-lat[data-lat]')), mapTags = Array.from(sec.querySelectorAll('.reto-mapa'));
  const $hud = (k) => sec.querySelector(`[data-hud="${k}"]`), $lee = (k) => sec.querySelector(`[data-lee="${k}"]`);
  const fmt = (v, d) => v.toLocaleString(EN ? 'en-US' : 'es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const DEG = Math.PI / 180, RL = 1737.4;                                       // radio lunar (km)

  // ================= GUION (segundos) =================
  const LOOP = 75;
  const CAPS = [[0, 7], [7, 20], [20, 35], [35, 51], [51, 64], [64, 69.5]];   // texto visible de cada capítulo; 69,5–75: regreso
  const SEGS = [[0, 7], [7, 20], [20, 35], [35, 51], [51, LOOP]];               // barra de capítulos
  const QUIETO = [3.5, 15, 28, 46, 60];                                         // instante que se muestra con «reducir movimiento»
  const T_POLO = 20, T_VUELTA = 72.5;                                           // la cámara está sobre el polo (600 km) en estos instantes
  const SOL0 = 36.5, SOL1 = 50.5;                                               // el Sol da una vuelta completa sobre Shackleton
  const FOCO0 = 52.5, FOCO1 = 69.5;                                               // faros del rover encendidos
  const RUEDA0 = 52.5, RUEDA1 = 63;                                             // el rover avanza 12 m hacia el interior de la sombra
  const SOL_ALT = 1.2, SOL_AZ = 120;                                            // el Sol de la simulación (grados)
  const SPIN0 = 0.45;                                                           // giro de la Luna al empezar (rad); llega a 0 sobre el polo
  const FASE = [L('Órbita lunar', 'Lunar orbit'), L('Órbita lunar', 'Lunar orbit'), L('Descenso al polo sur', 'Descent to the south pole'), L('Cráter Shackleton', 'Shackleton crater'), L('Sombra permanente del borde', 'Permanent shadow on the rim'), L('Sombra permanente del borde', 'Permanent shadow on the rim')];

  // Interpolación cúbica monótona (Fritsch–Carlson): pasa por cada clave sin rebasarla y sin paradas bruscas.
  function pista(keys) {
    const n = keys.length, T = keys.map((k) => k[0]), V = keys.map((k) => k[1]), d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((V[i + 1] - V[i]) / (T[i + 1] - T[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (t) => {
      if (t <= T[0]) return V[0]; if (t >= T[n - 1]) return V[n - 1];
      let i = 0; while (t > T[i + 1]) i++;
      const h = T[i + 1] - T[i], x = (t - T[i]) / h, x2 = x * x, x3 = x2 * x;
      return (2 * x3 - 3 * x2 + 1) * V[i] + (x3 - 2 * x2 + x) * h * m[i] + (-2 * x3 + 3 * x2) * V[i + 1] + (x3 - x2) * h * m[i + 1];
    };
  }
  const zip = (a, b) => a.map((x, i) => [x, b[i]]);
  // desplazamiento horizontal de la escena para dejar sitio al texto (fracción del ancho; + = a la derecha)
  const DESPL = [[0, 0.17], [6.5, 0.17], [8.5, -0.17], [19.5, -0.17], [21.5, 0.16], [34.5, 0.16], [36.5, -0.15], [50.5, -0.15], [52.5, 0.1], [63.5, 0.1], [65.5, 0.16], [69.5, 0.16], [73, 0.17], [75, 0.17]];
  function desplaz(t) {
    for (let i = 1; i < DESPL.length; i++) if (t <= DESPL[i][0]) { const [a0, v0] = DESPL[i - 1], [a1, v1] = DESPL[i]; return v0 + (v1 - v0) * smooth(a0, a1, t); }
    return DESPL[DESPL.length - 1][1];
  }
  const spin = (t) => t < T_POLO ? SPIN0 * (1 - smooth(0, T_POLO - 1, t)) : t > T_VUELTA ? SPIN0 * smooth(T_VUELTA, LOOP, t) : 0;
  const mosMix = (t) => smooth(11, 17.5, t) * (1 - smooth(T_VUELTA + 0.3, 74.6, t));          // el mosaico aparece sobre la Luna
  const mosLook = (t) => smooth(12, 18, t) * (1 - smooth(33, 38, t)) * 0.9 + 0.1;              // aspecto «mapa» (luz, sombra y su límite)

  const estatico = () => { sec.classList.add('reto--estatico'); caps.forEach((c) => c.classList.add('is-on')); };
  if (!window.THREE) { estatico(); return; }

  // ---------- render ----------
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { estatico(); return; }
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;                                    // el tono (ACES) y el sRGB se hacen al final, para todo por igual
  renderer.setClearColor(0x000000, 1); renderer.autoClear = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // sombras de los faros (rocas y rover)
  const canvas = renderer.domElement; canvas.className = 'reto-canvas'; lienzo.appendChild(canvas);
  sec.classList.add('reto--3d');

  // ---------- postprocesado de cine: escena (HDR, MSAA) → bloom → gradación ----------
  // La gradación hace el sRGB, una curva con negros profundos y luces apenas cálidas, viñeta, grano fino y, en los
  // acercamientos rápidos, desenfoque radial con aberración cromática («salto»). Los modelos (rover, estación, rocas)
  // pasan por el mismo ACES que los sombreadores propios (ver conACES).
  const composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass({ enabled: true, needsSwap: false, clear: false, renderToScreen: false, setSize() {}, dispose() {}, render(r, w, read) { r.setRenderTarget(read); dibujar(); } });
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.6, 0.68); composer.addPass(bloom);
  const grade = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, t: { value: 0 }, salto: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, centro: { value: new THREE.Vector2(0.5, 0.5) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float t; uniform float salto; uniform vec2 res; uniform vec2 centro; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 srgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec2 d = vUv - centro; vec3 c;
        // aberración cromática de lente: el rojo y el azul se separan hacia los bordes (como en un objetivo de cine)
        vec2 dl = vUv - 0.5; float r2 = dot(dl, dl);
        vec2 caL = dl * (0.0012 + 0.0065 * r2);
        if (salto > 0.01) {                                                   // salto: desenfoque radial y aberración más fuerte
          vec3 a = vec3(0.0);
          for (int i = 0; i < 12; i++) { float k = float(i) / 11.0; vec2 o = d * k * 0.055 * salto, ca = caL + d * 0.0045 * salto;
            a += vec3(texture2D(tDiffuse, vUv - o - ca).r, texture2D(tDiffuse, vUv - o).g, texture2D(tDiffuse, vUv - o + ca).b); }
          c = a / 12.0;
        } else c = vec3(texture2D(tDiffuse, vUv - caL).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + caL).b);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.95), smoothstep(0.3, 1.0, l));   // luces apenas cálidas
        c = pow(c, vec3(1.07));                                               // negros más profundos
        float v = smoothstep(1.2, 0.35, length(d * vec2(res.x / res.y, 1.0)));
        c *= mix(0.45, 1.0, v);                                               // viñeta
        vec3 o = srgb(c);
        o += (hash(vUv * res + fract(t * 7.3) * 113.0) - 0.5) * 0.04;         // grano de película
        gl_FragColor = vec4(o, 1.0);
      }`
  });
  composer.addPass(grade);
  // los materiales de Three (modelos de Blender, rocas, suelo) usan el mismo ACES que los sombreadores propios
  const ACES = 'gl_FragColor.rgb = clamp((gl_FragColor.rgb * (2.51 * gl_FragColor.rgb + 0.03)) / (gl_FragColor.rgb * (2.43 * gl_FragColor.rgb + 0.59) + 0.14), 0.0, 1.0);';
  function conACES(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      [].concat(o.material).forEach((m) => {
        if (!m || m.isShaderMaterial || m.userData.aces || m.toneMapped === false) return;
        m.userData.aces = true;
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', ACES); };
        m.customProgramCacheKey = () => 'reto-aces'; m.needsUpdate = true;
      });
    });
  }

  // estrellas reales (las más brillantes del catálogo de la portada)
  function estrellas(n, soloArriba, R) {
    const S = window.ICE_STARS; if (!S) return null;
    const bin = atob(S.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const q = new Uint16Array(u8.buffer), pos = [], col = [];
    for (let i = 0; i < Math.min(S.n, n); i++) {
      const ra = q[i * 6] / 65535 * 2 * Math.PI, dec = (q[i * 6 + 1] / 65535 - 0.5) * Math.PI, I = 0.15 + 2.2 * Math.pow(i + 1, -0.4);
      const y = Math.sin(dec) * R; if (soloArriba && y < R * 0.03) continue;
      const r = q[i * 6 + 3] / 65535, g = q[i * 6 + 4] / 65535, b = q[i * 6 + 5] / 65535, m = (r + g + b) / 3 || 1;
      pos.push(Math.cos(dec) * Math.cos(ra) * R, y, Math.cos(dec) * Math.sin(ra) * R); col.push(I * (0.75 + 0.25 * r / m), I * (0.75 + 0.25 * g / m), I * (0.75 + 0.25 * b / m));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    p.frustumCulled = false; return p;
  }
  // textura de brillo radial (Sol, faros, LRO)
  function texRadial(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }
  // el Sol de la simulación (js/sim-env.js): halo, corona de rayos y disco de 0,53°; y sus destellos de lente cálidos
  function texCanvas(n, dib) { const c = document.createElement('canvas'); c.width = c.height = n; dib(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  const radialTex = (stops, n = 256) => texCanvas(n, (g, m) => { const gr = g.createRadialGradient(m / 2, m / 2, 0, m / 2, m / 2, m / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, m, m); });
  const TEX_SOL = {
    halo: radialTex([[0, 'rgba(255,250,240,1)'], [0.05, 'rgba(255,244,225,.85)'], [0.2, 'rgba(255,225,190,.2)'], [1, 'rgba(255,210,170,0)']]),
    disco: radialTex([[0, '#ffffff'], [0.45, '#fffaf0'], [0.5, 'rgba(255,250,240,0)']]),
    rayos: texCanvas(512, (g, n) => {
      let a = 3; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      g.translate(n / 2, n / 2); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 110; i++) {
        const an = r() * Math.PI * 2, Lr = n * (0.12 + 0.38 * Math.pow(r(), 2)), w = 0.6 + r() * 1.8;
        const gr = g.createLinearGradient(0, 0, Math.cos(an) * Lr, Math.sin(an) * Lr); gr.addColorStop(0, 'rgba(255,245,225,0.35)'); gr.addColorStop(1, 'rgba(255,235,200,0)');
        g.strokeStyle = gr; g.lineWidth = w; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(an) * Lr, Math.sin(an) * Lr); g.stroke();
      }
    })
  };
  function solSim(esc) {
    const mk = (map, add) => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, transparent: true, toneMapped: false })); o.frustumCulled = false; esc.add(o); return o; };
    const o = { halo: mk(TEX_SOL.halo, true), rayos: mk(TEX_SOL.rayos, true), disco: mk(TEX_SOL.disco, false) };
    o.poner = (centro, dir, d) => {
      [o.halo, o.rayos, o.disco].forEach((q) => q.position.copy(centro).addScaledVector(dir, d));
      o.halo.scale.setScalar(d * 0.21); o.rayos.scale.setScalar(d * 0.37); o.disco.scale.setScalar(d * 0.0101);
    };
    return o;
  }
  const sLente = new THREE.Scene(), cLente = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const texFant = radialTex([[0, 'rgba(255,255,255,0.0)'], [0.55, 'rgba(255,255,255,0.12)'], [0.75, 'rgba(255,255,255,0.35)'], [0.85, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
  const texDiscF = radialTex([[0, 'rgba(255,255,255,0.25)'], [0.7, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const spL = (map, color) => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0, toneMapped: false })); sLente.add(o); return o; };
  const fantasmas = [[-0.45, 0.07, 0xffd2a0, texFant], [-0.85, 0.12, 0xffc890, texFant], [0.3, 0.044, 0xfff0dc, texDiscF], [-1.3, 0.1, 0xffe0b0, texDiscF]].map(([f, sz, c, m]) => { const o = spL(m, c); o.userData = { f, sz }; return o; });
  const rayaL = spL(radialTex([[0, 'rgba(255,255,255,0.9)'], [0.15, 'rgba(255,225,190,0.3)'], [1, 'rgba(255,210,170,0)']]), 0xffe2c0);
  let lenteVis = 0;
  function lente(nx, ny, vis, dt) {
    lenteVis += (vis - lenteVis) * Math.min(1, dt * 6);
    const as = W / Hh; cLente.left = -as; cLente.right = as; cLente.updateProjectionMatrix();
    fantasmas.forEach((o) => { o.position.set(nx * o.userData.f * as, ny * o.userData.f, 0); o.scale.setScalar(o.userData.sz * 2); o.material.opacity = 0.22 * lenteVis; o.visible = lenteVis > 0.02; });
    rayaL.position.set(nx * as, ny, 0); rayaL.scale.set(as * 1.1, 0.016, 1); rayaL.material.opacity = 0.3 * lenteVis; rayaL.visible = lenteVis > 0.02;
  }
  const texPunto = texRadial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(225,235,255,.8)'], [1, 'rgba(160,180,255,0)']]);
  const sprite = (tex, color, add = true) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }));

  // GLSL compartido: el mosaico LROC con aspecto natural o de «mapa» (luz, sombra y su límite en azul)
  const GLSL_MOSAICO = `
    vec3 colMosaico(sampler2D m, vec2 uv, float look){
      float v = dot(texture2D(m, uv).rgb, vec3(0.299, 0.587, 0.114));
      float grid = smoothstep(0.86, 0.97, v);                                       // cuadrícula original (paralelos 80° y 85° S)
      float lit = smoothstep(0.05, 0.38, v);
      vec3 sty = mix(vec3(0.0, 0.002, 0.008), vec3(0.86, 0.92, 1.0) * pow(v, 0.9) * 1.15, lit);
      float edge = smoothstep(0.035, 0.065, v) * (1.0 - smoothstep(0.065, 0.12, v));  // límite luz / sombra
      sty += vec3(0.25, 0.38, 1.0) * edge * 0.18;
      sty = mix(sty, vec3(0.36, 0.46, 0.95) * 0.45, grid * 0.55);
      vec3 nat = vec3(pow(v, 1.15)) * vec3(0.97, 0.97, 1.0) * (1.0 - grid * 0.85);
      return mix(nat, sty, look);
    }`;

  // ================= 1) LA LUNA (marco M: radio lunar = 1) =================
  const sLuna = new THREE.Scene(), cLuna = new THREE.PerspectiveCamera(38, 1, 0.01, 400);
  // dirección del Sol: la del relieve (acimut 120°, 1,2° de altura), pasada al marco de la Luna (ver «marcos»)
  const sAz = SOL_AZ * DEG, sEl = SOL_ALT * DEG;
  const SOL_F = new THREE.Vector3(Math.cos(sAz) * Math.cos(sEl), Math.sin(sEl), Math.sin(sAz) * Math.cos(sEl));
  const SOL_M = new THREE.Vector3(SOL_F.x, -SOL_F.y, -SOL_F.z).normalize();   // L = (−zF, −yF, −xF) y M = Ry(−π/2)·L
  const matLuna = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { map: { value: null }, nmap: { value: null }, mos: { value: null }, hasMaps: { value: 0 }, hasMos: { value: 0 }, sun: { value: SOL_M.clone() }, fade: { value: 1 }, grat: { value: 0.4 }, mosMix: { value: 0 }, mosLook: { value: 0 },
      poloH: { value: null }, poloS: { value: null }, hasPolo: { value: 0 }, sizeKm: { value: 800 }, pxKm: { value: 0.78 }, sombraW: { value: 1 }, rotM: { value: new THREE.Matrix3() } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vO; varying vec3 vW;
      void main(){ vUv = uv; vec3 n = normalize(position); vO = n;
        vec3 e = vec3(n.z, 0.0, -n.x); float le = length(e); e = le > 1e-4 ? e / le : vec3(1.0, 0.0, 0.0);
        vN = normalize(mat3(modelMatrix) * n); vT = normalize(mat3(modelMatrix) * e);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform sampler2D nmap; uniform sampler2D mos; uniform float hasMaps; uniform float hasMos; uniform vec3 sun; uniform float fade; uniform float grat;
      uniform float mosMix; uniform float mosLook;
      uniform sampler2D poloH; uniform sampler2D poloS; uniform float hasPolo; uniform float sizeKm; uniform float pxKm; uniform float sombraW; uniform mat3 rotM;
      varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vO; varying vec3 vW;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      ${GLSL_MOSAICO}
      void main(){
        vec3 n = normalize(vN), t = normalize(vT - n * dot(vT, n)), b = cross(n, t), O = normalize(vO);
        vec3 alb = vec3(0.5), N = n;
        if (hasMaps > 0.5) { alb = pow(texture2D(map, vUv).rgb, vec3(2.2)); vec3 tn = texture2D(nmap, vUv).xyz * 2.0 - 1.0; tn.xy *= 1.15; N = normalize(t * tn.x + b * tn.y + n * tn.z); }
        // cerca del polo sur, el relieve LOLA (estereográfica polar, 0,78 km/px) y sus sombras con el Sol de la simulación,
        // en vez de los mapas equirectangulares, que ahí se estiran
        float sombraP = 0.0;
        if (hasPolo > 0.5 && O.y < -0.93) {
          float c = max(length(O.xz), 1e-6), th = acos(clamp(-O.y, -1.0, 1.0)), rho = 2.0 * 1737.4 * tan(th * 0.5);
          vec2 uvP = vec2(0.5 + rho * (-O.z / c) / sizeKm, 0.5 - rho * (O.x / c) / sizeKm);
          float wp = 1.0 - smoothstep(0.42, 0.485, max(abs(uvP.x - 0.5), abs(uvP.y - 0.5)));
          if (wp > 0.0) {
            float e = 1.0 / 1024.0;
            float hx = texture2D(poloH, uvP + vec2(e, 0.0)).r - texture2D(poloH, uvP - vec2(e, 0.0)).r;
            float hz = texture2D(poloH, uvP + vec2(0.0, e)).r - texture2D(poloH, uvP - vec2(0.0, e)).r;
            vec3 nF = normalize(vec3(-hx / (2.0 * pxKm), 1.0, -hz / (2.0 * pxKm)));
            vec3 nL = vec3(-nF.z, -nF.y, -nF.x);                                  // marco del relieve → marco local de la Luna
            vec3 up = vec3(0.0, -1.0, 0.0), ax = cross(up, O); float sa = length(ax), ca = dot(up, O);
            if (sa > 1e-5) { ax /= sa; nL = nL * ca + cross(ax, nL) * sa + ax * dot(ax, nL) * (1.0 - ca); }
            N = normalize(mix(N, normalize(rotM * nL), wp));
            alb = mix(alb, vec3(0.16), wp);
            sombraP = texture2D(poloS, uvP).r * wp * sombraW;
          }
        }
        vec3 V = normalize(cameraPosition - vW);
        // regolito: ley de Lommel-Seeliger (la Luna llena parece un disco plano) más un poco de Lambert para el relieve
        float mu0 = max(dot(N, sun), 0.0), mu = max(dot(n, V), 0.05), nl = dot(n, sun);
        float day = smoothstep(-0.18, 0.22, nl);
        float lit = mix(2.0 * mu0 / (mu0 + mu), mu0, 0.32) * day;
        float wr = max(0.0, (dot(N, sun) + 0.4) / 1.4); lit += wr * wr * 0.14 * (1.0 - day * 0.6);   // luz rasante: el relieve se lee junto a la sombra
        lit *= 1.0 - sombraP;
        vec3 col = alb * vec3(1.0, 0.95, 0.87) * lit * 1.55;
        float night = 1.0 - smoothstep(-0.3, 0.2, nl);
        col += alb * vec3(0.5, 0.6, 0.9) * (0.085 + 0.1 * max(dot(N, V), 0.0)) * night;           // luz cenicienta (la Tierra ilumina la noche lunar)
        col = pow(aces(col), vec3(1.0 / 2.2));
        // retícula científica: paralelos cada 10°, meridianos cada 30°; el paralelo 85° S resaltado (borde del mapa polar)
        float lat = degrees(asin(clamp(O.y, -1.0, 1.0))), lon = degrees(atan(O.z, O.x));
        float gl = abs(fract(lat / 10.0 + 0.5) - 0.5) * 10.0, gm = abs(fract(lon / 30.0 + 0.5) - 0.5) * 30.0 * cos(radians(lat));
        float w = fwidth(lat) * 1.2;
        float lin = max(1.0 - smoothstep(0.0, w, gl), 1.0 - smoothstep(0.0, w, gm));
        float p85 = 1.0 - smoothstep(0.0, w * 1.6, abs(lat + 85.0));
        col += vec3(0.42, 0.52, 0.95) * (lin * 0.07 + p85 * 0.4) * grat;
        // mosaico LROC del polo sur sobre la esfera (estereográfica polar): el mismo que se ve después en plano
        if (hasMos > 0.5 && mosMix > 0.0 && O.y < -0.95) {
          float c = max(length(O.xz), 1e-6), th = acos(clamp(-O.y, -1.0, 1.0)), rho = 2.0 * 1737.4 * tan(th * 0.5);
          vec2 uv = vec2(0.5 + rho * (-O.z / c) / 608.4, 0.5 + rho * (O.x / c) / 608.4);
          float a = mosMix * (1.0 - smoothstep(0.4, 0.5, length(uv - 0.5)));
          col = mix(col, colMosaico(mos, uv, mosLook), a);
        }
        gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), fade);
      }`
  });
  const luna = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 144), matLuna);
  luna.rotation.y = -Math.PI / 2 + SPIN0; sLuna.add(luna);
  const est1 = estrellas(3500, false, 60); if (est1) sLuna.add(est1);
  // el Sol de la simulación (la Luna lo tapa cuando pasa por delante)
  const solM = solSim(sLuna); solM.poner(new THREE.Vector3(), SOL_M, 150);

  // ---------- LRO en órbita polar y los pulsos de su láser LOLA ----------
  const LRO_R = 1 + 100 / RL, LRO_P = 25;                                     // ~100 km de altura · una vuelta cada 25 s (acelerada; real ~2 h)
  const lroPlano = new THREE.Vector3(Math.cos(0.5), 0, Math.sin(0.5));         // eje horizontal de la órbita (el otro es el eje polar)
  const lroAng = (t) => -Math.PI / 2 + 2 * Math.PI * (t - 23) / LRO_P;        // pasa sobre el polo sur en t = 23 s (y 3 veces por vuelta del vídeo)
  const lroPos = (t, v) => v.copy(lroPlano).multiplyScalar(Math.cos(lroAng(t)) * LRO_R).add(new THREE.Vector3(0, Math.sin(lroAng(t)) * LRO_R, 0));
  const orbG = new THREE.BufferGeometry(), orbN = 256, orbP = new Float32Array(orbN * 3), orbU = new Float32Array(orbN);
  for (let i = 0; i < orbN; i++) { const a = i / orbN * Math.PI * 2; orbP.set([lroPlano.x * Math.cos(a) * LRO_R, Math.sin(a) * LRO_R, lroPlano.z * Math.cos(a) * LRO_R], i * 3); orbU[i] = i / orbN; }
  orbG.setAttribute('position', new THREE.BufferAttribute(orbP, 3)); orbG.setAttribute('u', new THREE.BufferAttribute(orbU, 1));
  const orbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { head: { value: 0 }, fade: { value: 1 } },
    vertexShader: 'attribute float u; varying float vU; void main(){ vU = u; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float head; uniform float fade; varying float vU; void main(){ float d = fract(head - vU); float a = 0.05 + 0.8 * pow(1.0 - d, 14.0); gl_FragColor = vec4(vec3(0.62, 0.69, 1.0) * a * fade, 1.0); }'
  });
  sLuna.add(new THREE.LineLoop(orbG, orbMat));
  const lro = sprite(texPunto, 0xe8ecff); lro.scale.setScalar(0.01); sLuna.add(lro);
  // pulsos del láser: se dejan sobre la superficie (giran con la Luna) y se apagan en ~3 s
  const PUL = 700, pulP = new Float32Array(PUL * 3), pulT = new Float32Array(PUL).fill(-99);
  const pulG = new THREE.BufferGeometry(); pulG.setAttribute('position', new THREE.BufferAttribute(pulP, 3)); pulG.setAttribute('nace', new THREE.BufferAttribute(pulT, 1));
  const pulMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ahora: { value: 0 }, fade: { value: 1 }, px: { value: 1 } },
    vertexShader: `attribute float nace; uniform float ahora; uniform float px; varying float vA;
      void main(){ float e = ahora - nace; vA = e < 0.0 ? 0.0 : exp(-e / 1.6); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (2.0 + 3.0 * vA) * px; }`,
    fragmentShader: 'uniform float fade; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.55, 0.66, 1.0) * vA * fade * (1.0 - d * 2.0), 1.0); }'
  });
  const pulsos = new THREE.Points(pulG, pulMat); pulsos.frustumCulled = false; luna.add(pulsos);
  let pulI = 0, pulUlt = -1;
  const tagLro = document.createElement('span'); tagLro.className = 'reto-lat reto-sat'; tagLro.setAttribute('aria-hidden', 'true');
  tagLro.textContent = L('LRO · láser LOLA (acelerado)', 'LRO · LOLA laser (sped up)'); escena.appendChild(tagLro);

  // ================= 2) EL POLO SUR Y SHACKLETON (marco F: km, estereográfica polar de LOLA) =================
  const sCrater = new THREE.Scene(), cCrater = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
  const sEst = new THREE.Scene();                                               // estación y colonia: con la luz del Sol (el rover está en sombra)
  const est2 = estrellas(3500, true, 600); if (est2) sCrater.add(est2);   // siguen a la cámara (están «en el infinito»)
  const KM = 36;
  const UC = {                                                                  // uniformes comunes del relieve (los comparten el cráter y el borde)
    alt: { value: null }, Nn: { value: 320 }, KMs: { value: KM }, sunDir: { value: SOL_F.clone() }, reposo: { value: 1 },
    lampPos: { value: new THREE.Vector3() }, lampDir: { value: new THREE.Vector3(1, 0, 0) }, lampHit: { value: new THREE.Vector2(9999, 9999) }, lampOn: { value: 0 }, lampR: { value: 0.006 }, lampRange: { value: 0.07 },
    fade: { value: 0 }, time: { value: 0 }, contour: { value: 1 }, psrLine: { value: 0 }, psrFill: { value: 0 }, latOn: { value: 0 }, pole: { value: new THREE.Vector2() },
    detail: { value: 0 }, detO: { value: new THREE.Vector2() },
    trkA: { value: new THREE.Vector2() }, trkB: { value: new THREE.Vector2() }, scnA: { value: new THREE.Vector2() }, trkOn: { value: 0 }, scanOn: { value: 0 },
    rectBorde: { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) }, rectDet: { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) }
  };
  // Sombra del Sol por vértice: se avanza desde cada punto hacia el Sol sobre el relieve del cráter y se guarda el ángulo
  // de horizonte más alto (restando la caída por la curvatura lunar). Con el disco solar de 0,53°, hay penumbra.
  const VS_TERRENO = `uniform sampler2D alt; uniform float Nn; uniform float KMs; uniform vec3 sunDir;
    varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying float vSun;
    float hT(vec2 xz){
      vec2 g = clamp((xz / KMs + 0.5) * (Nn - 1.0), vec2(0.0), vec2(Nn - 1.001));
      ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
      float a = texelFetch(alt, i, 0).r, b = texelFetch(alt, i + ivec2(1, 0), 0).r, c = texelFetch(alt, i + ivec2(0, 1), 0).r, d = texelFetch(alt, i + ivec2(1, 1), 0).r;
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    void main(){ vUv = uv; vP = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal);
      float lh = length(sunDir.xz); vec2 d2 = sunDir.xz / max(lh, 1e-5); float tE = sunDir.y / max(lh, 1e-5);
      float h0 = vP.y + 0.004, mx = -1.0, s = 0.06;
      for (int k = 0; k < 64; k++) {
        vec2 q = vP.xz + d2 * s;
        if (abs(q.x) > KMs * 0.5 || abs(q.y) > KMs * 0.5) break;
        mx = max(mx, (hT(q) - h0) / s - s / 3474.8);
        s = s * 1.08 + 0.02;
      }
      vSun = smoothstep(-0.0047, 0.0047, tE - mx);
      gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`;
  const FS_TERRENO = `uniform sampler2D masks; uniform vec3 sunDir; uniform float reposo; uniform vec3 lampPos; uniform vec3 lampDir; uniform vec2 lampHit; uniform float lampOn; uniform float lampR; uniform float lampRange;
    uniform float fade; uniform float time; uniform float contour; uniform float psrLine; uniform float psrFill; uniform float latOn; uniform vec2 pole;
    uniform float detail; uniform vec2 detO; uniform vec2 trkA; uniform vec2 trkB; uniform vec2 scnA; uniform float trkOn; uniform float scanOn; uniform vec4 rectBorde; uniform vec4 rectDet;
    varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying float vSun;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    void main(){
      float alfa = fade;
    #ifdef CRATER
      // el relieve fino del borde (la zona de la simulación) sustituye a este dentro de su recuadro
      if (vP.x > rectBorde.x && vP.x < rectBorde.z && vP.z > rectBorde.y && vP.z < rectBorde.w) discard;
      alfa *= smoothstep(0.0, 2.5, min(18.0 - abs(vP.x), 18.0 - abs(vP.z)));            // los bordes de la ventana se funden con el mosaico
    #endif
      vec4 m = texture2D(masks, vUv);                          // r: sombra permanente · g: sombra del Sol de la simulación · b: iluminación
      vec3 N = normalize(vN);
      // rugosidad fina PROCEDIMENTAL (por debajo de la resolución del DEM)
      vec2 q = vP.xz * 8.0; float n0 = fbm(q), nx = fbm(q + vec2(0.18, 0.0)), nz = fbm(q + vec2(0.0, 0.18));
      vec3 Nd = normalize(N + vec3(n0 - nx, 0.0, n0 - nz) * 1.6);
      float alb = 0.10 + 0.07 * fbm(vP.xz * 1.6) + 0.035 * n0;
      // de cerca (junto al rover): piedras y rugosidad de metros a centímetros, también procedimentales
      float dc = length(cameraPosition - vP), wD = detail * (1.0 - smoothstep(0.08, 0.5, dc));
      vec2 rel = vP.xz - detO;
      if (wD > 0.001) {
        vec2 q2 = rel * 900.0; float a0 = fbm(q2), ax = fbm(q2 + vec2(0.06, 0.0)), az = fbm(q2 + vec2(0.0, 0.06));
        float pi = fbm(q2 * 0.18);
        Nd = normalize(Nd + vec3(a0 - ax, 0.0, a0 - az) * 6.0 * wD);
        alb *= 1.0 + ((a0 - 0.5) * 0.6 + (pi - 0.5) * 0.5) * wD;
      }
      float sunlit = vSun;
    #ifdef BORDE
      if (vP.x > rectDet.x && vP.x < rectDet.z && vP.z > rectDet.y && vP.z < rectDet.w) discard;   // ahí está el terreno de detalle
      sunlit *= mix(1.0, 1.0 - m.g, reposo);                   // con el Sol de la simulación, sus sombras (calculadas a 20 m)
      // huellas del rover (SIMULADAS): dos bandas desde la estación hasta el rover
      if (trkOn > 0.0 && wD > 0.001) {
        vec2 ab = trkB - trkA; float Lt = length(ab); vec2 dr = ab / max(Lt, 1e-6); vec2 rr = vP.xz - trkA;
        float al = dot(rr, dr), pe = dot(rr, vec2(-dr.y, dr.x));
        if (al > 0.0 && al < Lt) {
          float bw = 1.0 - smoothstep(0.00011, 0.00019, abs(abs(pe) - 0.00085));
          float dibujo = 0.65 + 0.35 * step(0.5, fract(al / 0.00032));
          alb *= 1.0 - 0.42 * bw * dibujo * trkOn * wD;
        }
      }
    #endif
      vec3 A = vec3(alb) * vec3(1.0, 0.99, 0.97);
      vec3 col = A * vec3(1.0, 0.94, 0.85) * max(dot(Nd, sunDir), 0.0) * sunlit * 5.2;
      col += A * vec3(0.30, 0.36, 0.55) * 0.016;               // luz cenicienta muy débil
      // faros del rover: cono hacia el punto que ilumina (sin haz visible: en el vacío no hay polvo que lo disperse)
      vec3 Lv = lampPos - vP; float dl = length(Lv); vec3 Ld = Lv / max(dl, 1e-6);
      float cs = dot(-Ld, lampDir);
      float fall = smoothstep(0.84, 0.975, cs) * (1.0 - smoothstep(lampRange * 0.5, lampRange, dl)) / (1.0 + dl * dl / (lampRange * lampRange * 0.06));
      float dif = max(dot(Nd, Ld), 0.0);
      float spec = pow(max(dot(reflect(-Ld, Nd), normalize(cameraPosition - vP)), 0.0), 24.0) * 0.07;
      col += (A * dif * 2.6 + spec) * vec3(0.86, 0.93, 1.0) * fall * lampOn;
      // curvas de nivel cada 250 m (solo en la vista general)
      float h = vP.y * 4.0;
      float cl = 1.0 - smoothstep(0.0, fwidth(h) * 1.2, abs(fract(h - 0.5) - 0.5));
      col += vec3(0.55, 0.62, 0.85) * cl * 0.03 * contour;
      // sombra permanente calculada: contorno y relleno azul (no es hielo: es donde podría conservarse)
      float pe2 = abs(dFdx(m.r)) + abs(dFdy(m.r));
      col += vec3(0.32, 0.45, 1.0) * smoothstep(0.03, 0.25, pe2) * psrLine * 0.8;
      col += vec3(0.10, 0.17, 0.75) * smoothstep(0.35, 0.65, m.r) * psrFill * 0.03;
      // paralelos 89,5° S (15,16 km del polo) y 89,75° S (7,58 km)
      float rp = length(vP.xz - pole), wp = fwidth(rp) * 1.4;
      float lat = (1.0 - smoothstep(0.0, wp, abs(rp - 15.16))) + (1.0 - smoothstep(0.0, wp, abs(rp - 7.58)));
      col += vec3(0.6, 0.68, 0.95) * lat * 0.2 * latOn;
      // anillo de escaneo alrededor del punto iluminado
      float r = length(vP.xz - lampHit);
      float ring = 1.0 - smoothstep(0.0, fwidth(r) * 1.5, abs(r - lampR * fract(time * 0.45)));
      col += vec3(0.4, 0.55, 1.0) * ring * smoothstep(0.5, 0.9, cs) * 0.3 * lampOn;
      col = pow(aces(col), vec3(1.0 / 2.2));
    #ifdef BORDE
      // cuadros de lectura del sensor de neutrones a lo largo del recorrido (SIMULADOS, como en la simulación)
      if (scanOn > 0.0 && wD > 0.001) {
        vec2 g = (vP.xz - scnA) / 0.0025, id = floor(g), cc = (id + 0.5) * 0.0025 + scnA;
        vec2 ab = trkB - scnA; float Ls = length(ab); vec2 dr = ab / max(Ls, 1e-6); vec2 rc = cc - scnA;
        float al = dot(rc, dr), pe = abs(dot(rc, vec2(-dr.y, dr.x)));
        if (al > -0.001 && al < Ls && pe < 0.0042) {
          vec2 fg = fract(g); float borde = 1.0 - smoothstep(0.015, 0.04, min(min(fg.x, 1.0 - fg.x), min(fg.y, 1.0 - fg.y)));
          float lleno = step(0.72, hash(id + 3.1)) * (0.6 + 0.4 * fract(time * 0.5 + hash(id)));
          col = mix(col, vec3(0.82, 0.87, 1.0), borde * 0.24 * scanOn * wD);
          col += vec3(0.22, 0.34, 1.0) * lleno * 0.07 * scanOn * wD;
        }
      }
    #endif
      gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), alfa);
    }`;
  function matRelieve(def, masksRef) {
    return new THREE.ShaderMaterial({ transparent: true, defines: { [def]: '' }, uniforms: Object.assign({ masks: masksRef }, UC), vertexShader: VS_TERRENO, fragmentShader: FS_TERRENO });
  }
  const masksCrater = { value: null }, masksBorde = { value: null };
  const matTerreno = matRelieve('CRATER', masksCrater), matBorde = matRelieve('BORDE', masksBorde);
  // el relieve 3D del polo sur (LOLA 240 m/px reducido a 0,78 km/px, ±400 km), con el mosaico LROC encima en el capítulo 02.
  // Usa la misma iluminación que la Luna 3D, así el paso de la esfera al plano no se nota.
  const UP = { sh: { value: null }, mos: { value: null }, mosMix: { value: 0 }, mosLook: { value: 0 }, fade: { value: 0 }, reposo: UC.reposo, sunDir: UC.sunDir, pole: UC.pole, sizeKm: { value: 800 },
    ventana: { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) }, hueco: { value: 0 } };
  const matPolo = new THREE.ShaderMaterial({
    transparent: true, uniforms: UP,
    vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
    fragmentShader: `uniform sampler2D sh; uniform sampler2D mos; uniform float mosMix; uniform float mosLook; uniform float fade; uniform float reposo; uniform float sizeKm;
      uniform vec3 sunDir; uniform vec2 pole; uniform vec4 ventana; uniform float hueco; varying vec3 vP; varying vec3 vN;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      ${GLSL_MOSAICO}
      void main(){
        // dentro de la ventana del cráter se desvanece a medida que aparece su relieve (más detallado)
        float dentro = (vP.x > ventana.x && vP.x < ventana.z && vP.z > ventana.y && vP.z < ventana.w) ? hueco : 0.0;
        if (dentro > 0.995) discard;
        float X = vP.x - pole.x, Zd = vP.z - pole.y, rho = length(vec2(X, Zd));
        vec2 uvP = vec2(0.5 + X / sizeKm, 0.5 + Zd / sizeKm);
        vec3 n = normalize(vN), V = normalize(cameraPosition - vP), up = normalize(vec3(X / 1737.4, 1.0, Zd / 1737.4));
        float mu0 = max(dot(n, sunDir), 0.0), mu = max(dot(up, V), 0.05), nl = dot(up, sunDir);
        float day = smoothstep(-0.18, 0.22, nl);
        float lit = mix(2.0 * mu0 / (mu0 + mu), mu0, 0.32) * day;
        float wr = max(0.0, (dot(n, sunDir) + 0.4) / 1.4); lit += wr * wr * 0.14 * (1.0 - day * 0.6);
        lit *= 1.0 - texture2D(sh, uvP).r * reposo;
        float alb = 0.16 * (0.88 + 0.24 * vn(vP.xz * 0.12));
        vec3 col = vec3(alb) * vec3(1.0, 0.95, 0.87) * lit * 1.55;
        float night = 1.0 - smoothstep(-0.3, 0.2, nl);
        col += vec3(alb) * vec3(0.5, 0.6, 0.9) * (0.085 + 0.1 * max(dot(n, V), 0.0)) * night;
        col = pow(aces(col), vec3(1.0 / 2.2));
        vec2 uvM = vec2(0.5 + X / 608.4, 0.5 - Zd / 608.4);
        col = mix(col, colMosaico(mos, uvM, mosLook), mosMix * (1.0 - smoothstep(0.4, 0.5, length(uvM - 0.5))));
        gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), fade * (1.0 - dentro) * (1.0 - smoothstep(370.0, 398.0, rho)));
      }`
  });
  let P = null;                                                                 // relieve del polo (alturas en km respecto al borde de Shackleton)
  function cargarPolo() {
    const RLc = window.ICE_RETO_LOCAL;
    const datos = RLc && RLc.polo
      ? Promise.resolve([RLc.poloMeta, (() => { const q = atob(RLc.polo), u = new Uint8Array(q.length); for (let i = 0; i < q.length; i++) u[i] = q.charCodeAt(i); return u.buffer; })()])
      : Promise.all([fetch('assets/data/polo.json').then((r) => r.json()), fetch('assets/data/polo.bin').then((r) => r.arrayBuffer())]);
    return datos.then(([m, b]) => construirPolo(m, b)).catch((e) => console.warn('Relieve del polo no disponible', e));
  }
  function construirPolo(meta, buf) {
    const N = meta.N, n2 = N * N, h16 = new Int16Array(buf, 0, n2), s8 = new Uint8Array(buf, n2 * 2, n2), size = meta.sizeKm;
    const Hk = new Float32Array(n2), half = new Uint16Array(n2);
    for (let k = 0; k < n2; k++) { Hk[k] = (h16[k] - D.rim) / 1000; half[k] = THREE.DataUtils.toHalfFloat(Hk[k]); }
    const tH = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType); tH.magFilter = tH.minFilter = THREE.LinearFilter; tH.needsUpdate = true;
    const tS = new THREE.DataTexture(new Uint8Array(s8), N, N, THREE.RedFormat, THREE.UnsignedByteType); tS.magFilter = tS.minFilter = THREE.LinearFilter; tS.needsUpdate = true;
    P = { N, Hk, size, px: size / N };
    Object.assign(matLuna.uniforms, {}); matLuna.uniforms.poloH.value = tH; matLuna.uniforms.poloS.value = tS; matLuna.uniforms.sizeKm.value = size; matLuna.uniforms.pxKm.value = size / N; matLuna.uniforms.hasPolo.value = 1;
    UP.sh.value = tS; UP.sizeKm.value = size;
    // malla de 512 × 512 vértices, con la caída por la curvatura lunar (así coincide con la esfera)
    const M = 512, pos = new Float32Array(M * M * 3);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const X = (i / (M - 1) - 0.5) * size, Zd = (j / (M - 1) - 0.5) * size, k = (j * M + i) * 3;
      pos[k] = polo.x + X; pos[k + 1] = hPolo(X, Zd) - (X * X + Zd * Zd) / (2 * RL) - 0.03; pos[k + 2] = polo.z + Zd;
    }
    const idx = []; for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) { const a = j * M + i, b = a + 1, c = a + M, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const malla = new THREE.Mesh(g, matPolo); malla.renderOrder = -1; malla.frustumCulled = false; sCrater.add(malla);
    UP.ventana.value.set(-KM / 2 + 2.6, -KM / 2 + 2.6, KM / 2 - 2.6, KM / 2 - 2.6);
    pedir();
  }
  // altura del relieve del polo (km) en coordenadas respecto al polo (X hacia +x, Zd hacia +z)
  function hPolo(X, Zd) {
    if (!P) return 0; const N = P.N, fi = clamp((X / P.size + 0.5) * N - 0.5, 0, N - 1.001), fj = clamp((Zd / P.size + 0.5) * N - 0.5, 0, N - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, H = P.Hk;
    return (H[j * N + i] * (1 - u) + H[j * N + i + 1] * u) * (1 - v) + (H[(j + 1) * N + i] * (1 - u) + H[(j + 1) * N + i + 1] * u) * v;
  }
  // altura en cualquier punto del marco F: relieve fino/cráter dentro de la ventana de 36 km, el del polo fuera
  function hAll(x, z) {
    if (D && Math.abs(x) < KM / 2 && Math.abs(z) < KM / 2) return hF(x, z);
    if (!P || !polo) return 0; const X = x - polo.x, Zd = z - polo.z; return hPolo(X, Zd) - (X * X + Zd * Zd) / (2 * RL);
  }

  // el Sol también en el marco del cráter (asoma en el horizonte; el relieve lo tapa)
  const solF = solSim(sCrater);

  // ---------- marcos de referencia: Luna (M) ↔ relieve (F) ----------
  // Cerca del polo sur, un punto de la Luna (local, radio 1) con latitud φ y longitud λ cumple x = (ρ/R)·cos λ y z = −(ρ/R)·sen λ,
  // y LOLA da X = ρ·sen λ, Y = ρ·cos λ. En el marco F: x = X + polo.x, z = −Y + polo.z, y hacia arriba (la vertical del polo).
  const mLF = new THREE.Matrix4(), mFM = new THREE.Matrix4(), mMF = new THREE.Matrix4(), mRy = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), vEsc = new THREE.Vector3();
  let polo = null;
  function marcos(rot) { mRy.makeRotationY(-rot); mFM.multiplyMatrices(mLF, mRy); mMF.copy(mFM).invert(); }
  function camF2M() { cCrater.updateMatrixWorld(); mTmp.multiplyMatrices(mMF, cCrater.matrixWorld); mTmp.decompose(cLuna.position, cLuna.quaternion, vEsc); cLuna.updateMatrixWorld(); }
  function camM2F() { cLuna.updateMatrixWorld(); mTmp.multiplyMatrices(mFM, cLuna.matrixWorld); mTmp.decompose(cCrater.position, cCrater.quaternion, vEsc); cCrater.updateMatrixWorld(); }

  // ---------- relieve del cráter ----------
  let D = null, B = null;                                  // D: cráter (112 m/px) · B: borde de la simulación (10 m/px)
  function construirTerreno(meta, buf) {
    const N = meta.N, n2 = N * N;
    const hq = new Uint16Array(buf, 0, n2), psr = new Uint8Array(buf, n2 * 2, n2), sh = new Uint8Array(buf, n2 * 3, n2), lit = new Uint8Array(buf, n2 * 4, n2);
    const rim = meta.crater.rimH, H = new Float32Array(n2);
    for (let k = 0; k < n2; k++) H[k] = (meta.hMin + hq[k] * meta.hScale - rim) / 1000;        // km, borde ≈ 0
    const g = mallaRejilla(N, KM, (i, j) => H[j * N + i], 0);
    const rgba = new Uint8Array(n2 * 4);
    for (let k = 0; k < n2; k++) { rgba[k * 4] = psr[k]; rgba[k * 4 + 1] = sh[k]; rgba[k * 4 + 2] = lit[k]; rgba[k * 4 + 3] = 255; }
    masksCrater.value = texDatos(rgba, N);
    const tAlt = new THREE.DataTexture(H, N, N, THREE.RedFormat, THREE.FloatType); tAlt.magFilter = THREE.NearestFilter; tAlt.minFilter = THREE.NearestFilter; tAlt.needsUpdate = true;
    UC.alt.value = tAlt; UC.Nn.value = N;
    const terreno = new THREE.Mesh(g, matTerreno); terreno.frustumCulled = false; sCrater.add(terreno);
    const w = (p) => new THREE.Vector3((p[0] / (N - 1) - 0.5) * KM, 0, (p[1] / (N - 1) - 0.5) * KM);
    const gr = meta.grid;
    D = { meta, N, H, psr, lit, w, rim };
    // polo sur exacto (muestra y línea 3791,5 del DEM polar)
    polo = new THREE.Vector3(((gr.off - gr.sample0) / gr.px40PerCell / (N - 1) - 0.5) * KM, 0, ((gr.off - gr.line0) / gr.px40PerCell / (N - 1) - 0.5) * KM);
    UC.pole.value.set(polo.x, polo.z);
    mLF.set(0, 0, -RL, polo.x, 0, -RL, 0, -RL, -RL, 0, 0, polo.z, 0, 0, 0, 1);
    D.pole = polo.clone(); D.center = w(meta.pois.center); D.site = w(meta.pois.site); D.rimLit = w(meta.pois.rimLit);
    D.floor = (meta.crater.floorH - rim) / 1000;
    ['pole', 'center', 'site', 'rimLit'].forEach((k) => { D[k].y = hAt(D[k].x, D[k].z) + 0.06; });
    // fracción del interior del cráter (dentro del borde) en sombra permanente
    const C = D.center, rR = meta.crater.rimRadiusM / 1000; let nIn = 0, nPsr = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * KM, z = (j / (N - 1) - 0.5) * KM;
      if (Math.hypot(x - C.x, z - C.z) < rR) { nIn++; if (psr[j * N + i] > 127) nPsr++; }
    }
    D.psrPct = Math.round(100 * nPsr / Math.max(1, nIn));
    $l3('psr').textContent = L(`Sombra permanente calculada: ${D.psrPct} % del interior del cráter. No indica que haya hielo.`, `Calculated permanent shadow: ${D.psrPct}% of the crater interior. It does not mean there is ice.`);
    crearMarcas(); cargarBorde(); pedir();
  }
  // malla de rejilla N×N de lado «lado» km centrada en (0,0) y, si «faldon» > 0, con un faldón en los bordes (tapa rendijas)
  function mallaRejilla(N, lado, hf, faldon) {
    const nv = N * N, extra = faldon ? 4 * N : 0, pos = new Float32Array((nv + extra) * 3), uv = new Float32Array((nv + extra) * 2);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i; pos[k * 3] = (i / (N - 1) - 0.5) * lado; pos[k * 3 + 1] = hf(i, j); pos[k * 3 + 2] = (j / (N - 1) - 0.5) * lado;
      uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = j / (N - 1);
    }
    const idx = []; for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx.push(a, c, b, b, c, d); }
    if (faldon) {
      const lados = [[(s) => s, () => 0], [(s) => s, () => N - 1], [() => 0, (s) => s], [() => N - 1, (s) => s]];
      lados.forEach(([fi, fj], e) => {
        for (let s = 0; s < N; s++) {
          const k = j2k(fi(s), fj(s)), o = nv + e * N + s;
          pos[o * 3] = pos[k * 3]; pos[o * 3 + 1] = pos[k * 3 + 1] - faldon; pos[o * 3 + 2] = pos[k * 3 + 2]; uv[o * 2] = uv[k * 2]; uv[o * 2 + 1] = uv[k * 2 + 1];
          if (s < N - 1) { const k2 = j2k(fi(s + 1), fj(s + 1)), o2 = o + 1; idx.push(k, o, k2, k2, o, o2, k, k2, o, k2, o2, o); }
        }
      });
    }
    function j2k(i, j) { return j * N + i; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function texDatos(rgba, N) { const t = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
  // altura (km) por interpolación bilineal en la rejilla del cráter
  function hAt(x, z) {
    if (!D) return 0; const N = D.N;
    const fi = clamp((x / KM + 0.5) * (N - 1), 0, N - 1.001), fj = clamp((z / KM + 0.5) * (N - 1), 0, N - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, H = D.H;
    return (H[j * N + i] * (1 - u) + H[j * N + i + 1] * u) * (1 - v) + (H[(j + 1) * N + i] * (1 - u) + H[(j + 1) * N + i + 1] * u) * v;
  }
  // altura y normal exactas de la malla (los mismos triángulos que se dibujan): en el borde, las del relieve fino
  function triangulo(H, N, fi, fj) {
    fi = clamp(fi, 0, N - 1.001); fj = clamp(fj, 0, N - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * N + i;
    return { u, v, a: H[k], b: H[k + 1], c: H[k + N], d: H[k + N + 1] };
  }
  const enBorde = (x, z) => B && x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  function triEn(x, z) {
    if (enBorde(x, z)) return [triangulo(B.H, B.N, (x - B.x0) / B.paso, (z - B.z0) / B.paso), B.paso];
    return [triangulo(D.H, D.N, (x / KM + 0.5) * (D.N - 1), (z / KM + 0.5) * (D.N - 1)), KM / (D.N - 1)];
  }
  function hF(x, z) {
    if (!D) return 0; const [t] = triEn(x, z);
    return t.u + t.v <= 1 ? t.a + (t.b - t.a) * t.u + (t.c - t.a) * t.v : t.d + (t.c - t.d) * (1 - t.u) + (t.b - t.d) * (1 - t.v);
  }
  function normalF(x, z) {
    const [t, s] = triEn(x, z);
    const n = t.u + t.v <= 1 ? new THREE.Vector3(-(t.b - t.a) / s, 1, -(t.c - t.a) / s) : new THREE.Vector3(-(t.d - t.c) / s, 1, -(t.d - t.b) / s);
    return n.normalize();
  }
  // coordenadas reales de un punto (estereográfica polar de LOLA, centrada en el polo)
  function latlon(x, z) {
    const X = (x - polo.x) * 1000, Y = (polo.z - z) * 1000, rho = Math.hypot(X, Y);
    return [-90 + 2 * Math.atan(rho / (2 * RL * 1000)) * 180 / Math.PI, ((Math.atan2(X, Y) * 180 / Math.PI) + 360) % 360];
  }

  // ---------- el borde de Shackleton de la simulación (LOLA 5 m/px reducido a 10 m/px) ----------
  // Se coloca por su centro (latitud y longitud de js/dem-shackleton.js) más un ajuste de (−20, −40) m, que es el que
  // mejor hace coincidir sus alturas con las del DEM del cráter (diferencia media 3,4 m).
  function cargarBorde() {
    const usar = () => { try { construirBorde(window.IceDEM); } catch (e) { console.warn('Relieve del borde no disponible', e); } };
    if (window.IceDEM) { usar(); return; }
    const s = document.createElement('script'); s.src = 'js/dem-shackleton.js'; s.onload = usar; document.head.appendChild(s);
  }
  function construirBorde(I) {
    if (!I || !D) return;
    const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const N = I.N, n2 = N * N, raw = b64(I.H), h16 = new Int16Array(raw.buffer, raw.byteOffset, n2), psr = b64(I.psr), sh = b64(I.shadow), lit = b64(I.lit);
    const H = new Float32Array(n2); for (let k = 0; k < n2; k++) H[k] = (I.base + h16[k] / 10 - D.rim) / 1000;
    const lat = I.center.lat, lon = I.center.lon, rho = 2 * RL * 1000 * Math.tan((90 + lat) * DEG / 2);
    const X = rho * Math.sin(lon * DEG) - 20, Y = rho * Math.cos(lon * DEG) - 40;
    const cx = X / 1000 + polo.x, cz = -Y / 1000 + polo.z, lado = I.SIZE / 1000, paso = I.STEP / 1000;
    B = { N, H, psr, lit, sh, cx, cz, paso, x0: cx - lado / 2, x1: cx + lado / 2, z0: cz - lado / 2, z1: cz + lado / 2, I };
    B.sim = (x, z) => new THREE.Vector3(cx + x / 1000, 0, cz + z / 1000);   // coordenadas de la simulación (m) → F (km)
    const rgba = new Uint8Array(n2 * 4);
    for (let k = 0; k < n2; k++) { rgba[k * 4] = psr[k] ? 255 : 0; rgba[k * 4 + 1] = sh[k] ? 255 : 0; rgba[k * 4 + 2] = Math.round(lit[k] * 2.55); rgba[k * 4 + 3] = 255; }
    masksBorde.value = texDatos(rgba, N);
    const g = mallaRejilla(N, lado, (i, j) => H[j * N + i], 0.04);
    const malla = new THREE.Mesh(g, matBorde); malla.position.set(cx, 0, cz); malla.frustumCulled = false; sCrater.add(malla);
    UC.rectBorde.value.set(B.x0 + 0.004, B.z0 + 0.004, B.x1 - 0.004, B.z1 - 0.004);
    // recorrido del rover: baja desde la estación hacia la sombra permanente transitable más cercana a ella
    // (≈ 440 m de la estación, pendiente < 5°, misma zona que usa la simulación) y avanza 12 m hacia el interior
    const st = B.sim(I.station.x, I.station.z), fin = B.sim(650, 110), u = new THREE.Vector3(st.x - fin.x, 0, st.z - fin.z).normalize();
    B.est = st; B.col = B.sim(I.colony.x, I.colony.z);
    B.fin = fin; B.ini = fin.clone().addScaledVector(u, 0.012); B.lejos = fin.clone().addScaledVector(u, 0.15); B.scan0 = fin.clone().addScaledVector(u, 0.03);
    B.rumbo = Math.atan2(-u.z, -u.x);                                          // hacia el interior de la sombra
    [B.ini, B.fin, B.lejos, B.scan0, B.est, B.col].forEach((p) => { p.y = hF(p.x, p.z); });
    B.dEst = Math.round(Math.hypot(st.x - fin.x, st.z - fin.z) * 1000);
    UC.trkA.value.set(B.lejos.x, B.lejos.z); UC.scnA.value.set(B.scan0.x, B.scan0.z); UC.detO.value.set(fin.x, fin.z);
    $l3('rover').textContent = L(`Rover de ICEWISE en la sombra permanente más cercana a la estación (${B.dEst} m), donde busca hielo en la simulación. Modelos a escala; huellas, cuadros del sensor y suelo fino, simulados.`,
      `ICEWISE rover in the permanent shadow closest to the station (${B.dEst} m), where it looks for ice in the simulation. Models to scale; tracks, sensor squares and fine ground, simulated.`);
    // acimut de la cámara: orientada como el mosaico (norte arriba) sobre el polo; junto al rover, relativo a su rumbo
    const hd = B.rumbo / DEG, cerca = (v, ref) => v + 360 * Math.round((ref - v) / 360);
    const A = [90, 90, 100, 120]; [hd + 230, hd + 240, hd + 200, hd + 150, hd + 170, hd + 178, hd + 182, 90, 90].forEach((v) => A.push(cerca(v, A[A.length - 1])));
    camA = pista(zip(TK, A));
    construirDetalle(); colocarRover(0); cargarModelos(); pedir();
  }

  // ---------- recorrido de la cámara en el marco F (desde el polo hasta el rover y vuelta) ----------
  // objetivo: mezcla de polo (P), centro del cráter (C) y rover (R); distancia en km (escala logarítmica); elevación,
  // acimut y cuánto se levanta la mirada (grados)
  // a los 53,5 s, plano de la estación al Sol y la sombra del rover a la vez («energía arriba, hielo abajo»)
  const TK = [20, 33, 37, 44, 51, 53.5, 56, 60, 64, 65.5, 69.5, 71, 72.5];
  const camP = pista(zip(TK, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
  const camR = pista(zip(TK, [0, 0, 0, 0.15, 0.6, 0.5, 1, 1, 1, 1, 1, 0, 0]));
  const camS = pista(zip(TK, [0, 0, 0, 0, 0.2, 0.5, 0, 0, 0, 0, 0, 0, 0]));
  const camD = pista(zip(TK, [600, 60, 40, 32, 12, 0.75, 0.04, 0.02, 0.018, 0.023, 0.026, 40, 600].map(Math.log)));
  const camE = pista(zip(TK, [89.5, 89, 68, 50, 38, 24, 14, 12, 10, 6, 5, 80, 89.5]));
  const camM = pista(zip(TK, [0, 0, 0, 0, 3, 4, 6, 4, 4, 10, 11, 0, 0]));
  let camA = pista(zip(TK, [90, 90, 100, 120, 140, 140, 140, 140, 140, 140, 140, 90, 90]));
  const tgt = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  function poseF(t, rov) {
    const wp = camP(t), wr = camR(t), ws = B ? camS(t) : 0, wc = Math.max(0, 1 - wp - wr - ws);
    tgt.set(0, 0, 0).addScaledVector(polo, wp).addScaledVector(v3.set(D.center.x, -2, D.center.z), wc).addScaledVector(v4.set(rov.x, rov.y + 0.0012, rov.z), wr);
    if (ws) tgt.addScaledVector(B.est, ws);
    const dist = Math.exp(camD(t)), el = camE(t) * DEG, az = camA(t) * DEG;
    cCrater.up.set(0, 1, 0);
    cCrater.position.set(tgt.x + dist * Math.cos(el) * Math.cos(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.sin(az));
    cCrater.position.y = Math.max(cCrater.position.y, hAll(cCrater.position.x, cCrater.position.z) + 0.0016);
    cCrater.lookAt(tgt); cCrater.rotateX(camM(t) * DEG);
    return dist;
  }

  // ---------- recorrido de la cámara en el marco M (órbita): 4 claves y vuelta ----------
  const camOrb = new THREE.PerspectiveCamera();
  const KEYS_M = (() => {
    const up = new THREE.Vector3(0, 1, 0), der = new THREE.Vector3().crossVectors(SOL_M, up).normalize(), arr = new THREE.Vector3().crossVectors(der, SOL_M).normalize();
    const anti = SOL_M.clone().negate();
    // K0: el Sol asoma por el borde (arriba a la izquierda, fino creciente) · K1: sale del todo · K2: la cámara rodea la Luna hacia el polo sur
    const d0 = anti.clone().addScaledVector(der, -0.13).addScaledVector(arr, 0.2).normalize();
    const d1 = anti.clone().addScaledVector(der, -0.24).addScaledVector(arr, 0.36).normalize();
    const d2 = anti.clone().multiplyScalar(0.3).addScaledVector(der, -0.62).add(new THREE.Vector3(0, -0.78, 0)).normalize();
    return [{ d: d0, r: 5.4, o: new THREE.Vector3(0, 0, 0) }, { d: d1, r: 4.5, o: new THREE.Vector3(0, -0.05, 0) }, { d: d2, r: 2.5, o: new THREE.Vector3(0, -0.5, 0) }];
  })();
  KEYS_M.forEach((k) => { camOrb.position.copy(k.d).multiplyScalar(k.r); camOrb.up.set(0, 1, 0); camOrb.lookAt(k.o); k.q = camOrb.quaternion.clone(); });
  const uIda = pista([[0, 0], [7, 1], [13.5, 2], [T_POLO, 3]]), uVuelta = pista([[T_VUELTA, 3], [LOOP, 0]]);
  const qPolo = new THREE.Quaternion(), pPolo = new THREE.Vector3(), qA = new THREE.Quaternion(), dA = new THREE.Vector3();
  function poseM(u) {
    // la clave 3 (sobre el polo) sale del marco F: así el paso de la Luna al relieve es el mismo encuadre
    const k = Math.min(2, Math.floor(u)), f = u - k, a = KEYS_M[k];
    const bq = k < 2 ? KEYS_M[k + 1].q : qPolo, bp = k < 2 ? v3.copy(KEYS_M[k + 1].d).multiplyScalar(KEYS_M[k + 1].r) : pPolo;
    const ra = a.r, rb = bp.length();
    dA.copy(a.d).lerp(v4.copy(bp).normalize(), f).normalize();                 // dirección (casi un arco de círculo máximo)
    cLuna.position.copy(dA).multiplyScalar(Math.exp(Math.log(ra) + (Math.log(rb) - Math.log(ra)) * f));
    qA.copy(a.q).slerp(bq, f); cLuna.quaternion.copy(qA); cLuna.updateMatrixWorld();
  }
  function prepararPolo() {                                                     // pose de la cámara sobre el polo (600 km), en M
    marcos(-Math.PI / 2); poseF(T_POLO, B ? B.fin : polo); camF2M(); qPolo.copy(cLuna.quaternion); pPolo.copy(cLuna.position);
  }

  // ================= 3) ROVER, ESTACIÓN Y COLONIA =================
  // Modelos de Blender (metros, frente del rover hacia +X) a escala dentro de un mundo en kilómetros.
  // El rover tiene su propia escena con una luz de relleno suave (para que se lea); el suelo y las rocas, en sombra
  // permanente, solo reciben una luz muy débil (la que rebota de la cresta iluminada) y la de los faros.
  const sRover = new THREE.Scene();
  const roverG = new THREE.Group(); roverG.visible = false; sRover.add(roverG);
  sRover.add(new THREE.HemisphereLight(0xa8b4dc, 0x101014, 2.4));
  const luzPared = new THREE.DirectionalLight(0xe6ebff, 4); sRover.add(luzPared); sRover.add(luzPared.target);   // la que refleja la cresta iluminada
  sCrater.add(new THREE.HemisphereLight(0x9aa6cc, 0x060607, 0.32));
  const luzParedS = new THREE.DirectionalLight(0xe6ebff, 0.5); sCrater.add(luzParedS); sCrater.add(luzParedS.target);
  const luzSol = new THREE.DirectionalLight(0xfff4e6, 9); sEst.add(luzSol); sEst.add(luzSol.target);                // estación y colonia: al Sol
  sEst.add(new THREE.HemisphereLight(0x9aa6c8, 0x14141a, 1.2));
  const estG = new THREE.Group(), colG = new THREE.Group(); sEst.add(estG, colG);
  const faros = [], brillos = [], ruedas = [];
  let roverYaw = 0, roverListo = false, roverOdo = 0;
  const qT = new THREE.Quaternion(), qY = new THREE.Quaternion(), ARR = new THREE.Vector3(0, 1, 0);
  const roverPos = new THREE.Vector3();
  function colocarRover(t) {
    if (!B) return;
    const e = smooth(RUEDA0, RUEDA1, t) * (t < T_VUELTA ? 1 : 0);
    roverPos.copy(B.ini).lerp(B.fin, e); roverPos.y = hSuelo(roverPos.x, roverPos.z);
    roverOdo = e * 12;                                                         // metros recorridos (para el giro de las ruedas)
    roverG.position.copy(roverPos);
    qT.setFromUnitVectors(ARR, normalF(roverPos.x, roverPos.z)); qY.setFromAxisAngle(ARR, -roverYaw);
    roverG.quaternion.copy(qT).multiply(qY);
    ruedas.forEach((w) => { w.rotation.z = -roverOdo / 0.35; });
    UC.trkB.value.set(roverPos.x, roverPos.z);
  }
  const LOCAL = location.protocol === 'file:';
  const b64buf = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  function cargadorGLTF() {
    const loader = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) {
      const dr = new THREE.DRACOLoader(); dr.setDecoderPath('assets/vendor/draco170/'); dr.setDecoderConfig({ type: 'wasm' });
      if (LOCAL) dr._loadLibrary = (url, type) => Promise.resolve(type === 'arraybuffer' ? b64buf(window.ICE_DRACO.wasm) : window.ICE_DRACO.wrapper);
      loader.setDRACOLoader(dr);
    }
    return loader;
  }
  // reflejos de estudio en el metal del rover: un entorno oscuro con dos paneles de luz neutros, suaves
  let envRover = null;
  function entornoEstudio() {
    if (envRover) return envRover;
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#040507'); gr.addColorStop(0.47, '#14161c'); gr.addColorStop(0.53, '#09090b'); gr.addColorStop(1, '#020203');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.filter = 'blur(7px)'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(70, 62, 150, 16); g.fillRect(310, 54, 110, 11); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 118, 512, 4); g.filter = 'none';
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer); envRover = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
    return envRover;
  }
  function cargarModelos() {
    if (!THREE.GLTFLoader || !B) return;
    const local = LOCAL, b64 = b64buf, loader = cargadorGLTF();
    const listo = {
      rover: (m) => {
        m.scale.setScalar(0.001); roverG.add(m);
        const env = entornoEstudio();
        m.traverse((o) => {
          if (o.isMesh) [].concat(o.material).forEach((mt) => { if (/LED|baliza/.test(mt.name)) mt.toneMapped = false; else if (mt.isMeshStandardMaterial) { mt.envMap = env; mt.envMapIntensity = 0.85; } });
          if (/^wheel/i.test(o.name)) ruedas.push(o);
        });
        conACES(m);
        for (let i = 0; i < 4; i++) {
          const f = m.getObjectByName('faro_' + i); if (!f) continue; faros.push(f);
          const s = sprite(texPunto, 0xdfe8ff); s.scale.setScalar(0.0006); sCrater.add(s); brillos.push(s);
        }
        roverListo = true;
      },
      station: (m) => { m.scale.setScalar(0.001); estG.add(m); estG.position.copy(B.est); conACES(m); },
      colony: (m) => {
        // como en la simulación: el complejo presurizado a una sola altura, cada sector sobre su suelo, paneles al Sol
        m.scale.setScalar(0.001); colG.add(m); colG.position.copy(B.col);
        const y0 = B.col.y * 1000, hm = (o) => hF(B.col.x + o.position.x / 1000, B.col.z + o.position.z / 1000) * 1000;
        const pres = m.children.filter((o) => o.userData.presurizado), off = pres.length ? pres.reduce((s, o) => s + hm(o) - y0, 0) / pres.length : 0;
        [...m.children].forEach((o) => {
          if (o.name === 'NAV' || /_int$/.test(o.name)) { o.visible = false; return; }
          o.position.y += o.userData.presurizado ? off : hm(o) - y0;
          if (/^N_solar/i.test(o.name)) o.rotation.y = -SOL_AZ * DEG;
        });
        conACES(m);
      }
    };
    const cargar1 = (name) => {
      const ok = (gl) => { listo[name](gl.scene); pedir(); }, ko = () => {};
      if (local) { try { loader.parse(b64(window.ICE_EMBED[name]), '', ok, ko); } catch (e) { } }
      else loader.load(`assets/models/${name}.glb`, ok, undefined, ko);
    };
    const todos = () => ['rover', 'station', 'colony'].forEach(cargar1);
    if (local) {
      if (window.ICE_EMBED) { todos(); return; }
      const s = document.createElement('script'); s.src = 'assets/models/modelos-locales.js'; s.onload = todos; document.head.appendChild(s);
    } else todos();
  }

  // ================= 4) EL SUELO JUNTO AL ROVER (como en la simulación) =================
  // Malla de 140 × 140 m con celdas de 0,35 m: la base son los mismos triángulos del relieve de 10 m y encima los
  // microcráteres y ondulaciones procedimentales de la simulación (js/sim-env.js), con el regolito escaneado (Poly Haven),
  // rocas escaneadas (Poly Haven) que proyectan sombra bajo los faros y huellas de las ruedas. Todo ese detalle es
  // ilustrativo: el relieve real llega a 10 m.
  function hash4(i, j, k, sd) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1440662683) ^ Math.imul(sd | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  const sm = (x) => x * x * (3 - 2 * x);
  function vnoise(x, z, sd) {
    const xi = Math.floor(x), zi = Math.floor(z), u = sm(x - xi), v = sm(z - zi), w = (i, j) => hash4(i, j, 0, sd);
    const a = w(xi, zi), b = w(xi + 1, zi), c = w(xi, zi + 1), d = w(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, oct, sd) { let a = 0.5, f = 1, sum = 0, n = 0; for (let o = 0; o < oct; o++) { sum += a * vnoise(x * f, z * f, sd + o * 17); n += a; a *= 0.5; f *= 2; } return sum / n; }
  function micro(x, z) {                                                       // metros: microcráteres por celdas de 4 m (igual que la simulación)
    let h = -Math.abs(fbm(x / 6 + 30, z / 6 + 30, 3, 51) - 0.5) * 0.09 - Math.abs(vnoise(x * 0.9, z * 0.9, 52) - 0.5) * 0.02, dark = 0;
    const ci = Math.floor(x / 4), cj = Math.floor(z / 4);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const I = ci + a, J = cj + b; if (hash4(I, J, 3, 7) > 0.22) continue;
      const cx = (I + hash4(I, J, 1, 7)) * 4, cz = (J + hash4(I, J, 2, 7)) * 4, rad = 0.35 + 1.5 * Math.pow(hash4(I, J, 4, 7), 2.2);
      const rho = Math.hypot(x - cx, z - cz) / rad; if (rho > 1.6) continue;
      const dep = 0.2 * rad * (0.5 + 0.5 * hash4(I, J, 5, 7));
      h += rho < 1 ? dep * (rho * rho - 1) : 0.05 * rad * Math.exp(-(((rho - 1) / 0.25) ** 2));
      if (rho < 1) dark = Math.max(dark, 0.12 * (1 - rho * rho));
    }
    return [Math.min(h, 0.012), dark];
  }
  const DET = { size: 0.14, seg: 400, mesh: null };
  const matSuelo = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 1, metalness: 0, vertexColors: true });
  conACES(new THREE.Mesh(new THREE.BufferGeometry(), matSuelo));
  // cuadros de lectura del sensor (SIMULADOS) y anillo de escaneo, encima del suelo de detalle
  const matScan = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { scanOn: UC.scanOn, scnA: UC.scnA, trkB: UC.trkB, lampHit: UC.lampHit, lampR: UC.lampR, lampOn: UC.lampOn, lampPos: UC.lampPos, lampDir: UC.lampDir, time: UC.time },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
    fragmentShader: `uniform float scanOn; uniform vec2 scnA; uniform vec2 trkB; uniform vec2 lampHit; uniform float lampR; uniform float lampOn; uniform vec3 lampPos; uniform vec3 lampDir; uniform float time; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 col = vec3(0.0);
        vec2 g = (vP.xz - scnA) / 0.0025, id = floor(g), cc = (id + 0.5) * 0.0025 + scnA;
        vec2 ab = trkB - scnA; float Ls = length(ab); vec2 dr = ab / max(Ls, 1e-6); vec2 rc = cc - scnA;
        float al = dot(rc, dr), pe = abs(dot(rc, vec2(-dr.y, dr.x)));
        if (scanOn > 0.0 && al > -0.001 && al < Ls && pe < 0.0042) {
          vec2 fg = fract(g); float borde = 1.0 - smoothstep(0.015, 0.04, min(min(fg.x, 1.0 - fg.x), min(fg.y, 1.0 - fg.y)));
          float lleno = step(0.72, hash(id + 3.1)) * (0.6 + 0.4 * fract(time * 0.5 + hash(id)));
          col += vec3(0.75, 0.82, 1.0) * borde * 0.028 * scanOn + vec3(0.05, 0.09, 0.42) * lleno * 0.05 * scanOn;
        }
        float r = length(vP.xz - lampHit), cs = dot(normalize(vP - lampPos), lampDir);
        float ring = 1.0 - smoothstep(0.0, fwidth(r) * 1.5, abs(r - lampR * fract(time * 0.45)));
        col += vec3(0.1, 0.16, 0.6) * ring * smoothstep(0.5, 0.9, cs) * 0.12 * lampOn;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  // la luz de los faros: un foco que proyecta las sombras de las rocas (en el vacío no se ve el haz, solo el suelo iluminado)
  const focoFaros = new THREE.SpotLight(0xeaf0ff, 0, 0.09, 0.6, 0.6, 0);
  focoFaros.castShadow = true; focoFaros.shadow.mapSize.set(1024, 1024); focoFaros.shadow.camera.near = 0.0003; focoFaros.shadow.camera.far = 0.1;
  focoFaros.shadow.bias = -0.0004; focoFaros.shadow.normalBias = 0.00003; focoFaros.visible = false;
  sCrater.add(focoFaros, focoFaros.target);
  // destello de los faros hacia la cámara cuando el rover mira de frente (como al encender las luces de un coche)
  const destello = sprite(texPunto, 0xf2f5ff); destello.visible = false; sCrater.add(destello);
  const rayaFaro = sprite(radialTex([[0, 'rgba(255,255,255,0.95)'], [0.12, 'rgba(225,232,255,0.35)'], [1, 'rgba(200,215,255,0)']]), 0xe8eeff); rayaFaro.visible = false; sCrater.add(rayaFaro);
  const hSuelo = (x, z) => (DET.mesh && DET.dentro(x, z) ? DET.hAt(x, z) : hF(x, z));
  function distRecorrido(x, z) {                                              // distancia (km) a la línea por la que baja el rover
    const ax = B.lejos.x, az = B.lejos.z, dx = B.fin.x - ax, dz = B.fin.z - az, L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1.05);
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  }
  function construirDetalle() {
    const c = B.scan0.clone().lerp(B.fin, 0.6), S1 = DET.seg + 1, st = DET.size / DET.seg, hl = DET.size / 2;
    const n = S1 * S1, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), Y = new Float32Array(n), nrm = new Float32Array(n * 3);
    for (let iz = 0; iz < S1; iz++) for (let ix = 0; ix < S1; ix++) {
      const g = iz * S1 + ix, lx = ix * st - hl, lz = iz * st - hl, x = c.x + lx, z = c.z + lz;
      const xs = (x - B.cx) * 1000, zs = (z - B.cz) * 1000, [m, dark] = micro(xs, zs);
      const fade = sm(clamp((hl - Math.max(Math.abs(lx), Math.abs(lz))) / 0.014, 0, 1));
      const camino = 0.3 + 0.7 * smooth(0.0012, 0.0026, distRecorrido(x, z));           // por donde pasa el rover, el suelo está más asentado
      const y = hF(x, z) + m * fade * camino / 1000; Y[g] = y;
      pos[g * 3] = x; pos[g * 3 + 1] = y; pos[g * 3 + 2] = z; uv[g * 2] = xs / 3; uv[g * 2 + 1] = zs / 3;
      col[g * 3] = col[g * 3 + 1] = col[g * 3 + 2] = 1 - dark * fade;
    }
    for (let iz = 0; iz < S1; iz++) for (let ix = 0; ix < S1; ix++) {
      const g = iz * S1 + ix, x0 = ix > 0 ? g - 1 : g, x1 = ix < S1 - 1 ? g + 1 : g, z0 = iz > 0 ? g - S1 : g, z1 = iz < S1 - 1 ? g + S1 : g;
      const dx = (Y[x1] - Y[x0]) / ((x1 - x0) * st), dz = (Y[z1] - Y[z0]) / (((z1 - z0) / S1) * st), inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      nrm[g * 3] = -dx * inv; nrm[g * 3 + 1] = inv; nrm[g * 3 + 2] = -dz * inv;
    }
    const idx = new Uint32Array((S1 - 1) * (S1 - 1) * 6); let o = 0;
    for (let j = 0; j < S1 - 1; j++) for (let i = 0; i < S1 - 1; i++) { const a = j * S1 + i, b = a + 1, cc = a + S1, d = cc + 1; idx[o++] = a; idx[o++] = cc; idx[o++] = b; idx[o++] = b; idx[o++] = cc; idx[o++] = d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, matSuelo); mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.visible = false; sCrater.add(mesh);
    Object.assign(DET, { mesh, c, Y, S1, st, hl });
    DET.dentro = (x, z) => Math.abs(x - c.x) < hl && Math.abs(z - c.z) < hl;
    DET.hAt = (x, z) => {
      const fi = clamp((x - c.x + hl) / st, 0, S1 - 1.001), fj = clamp((z - c.z + hl) / st, 0, S1 - 1.001), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * S1 + i;
      return u + v <= 1 ? Y[k] + (Y[k + 1] - Y[k]) * u + (Y[k + S1] - Y[k]) * v : Y[k + S1 + 1] + (Y[k + S1] - Y[k + S1 + 1]) * (1 - u) + (Y[k + 1] - Y[k + S1 + 1]) * (1 - v);
    };
    UC.rectDet.value.set(c.x - hl + 0.002, c.z - hl + 0.002, c.x + hl - 0.002, c.z + hl - 0.002);
    DET.ov = new THREE.Mesh(g, matScan); DET.ov.renderOrder = 2; DET.ov.frustumCulled = false; DET.ov.visible = false; sCrater.add(DET.ov);
    construirHuellas(); cargarSuelo();
  }
  // huellas de las ruedas (SIMULADAS): dos bandas con el dibujo de la rueda, oscurecen el regolito (como en la simulación)
  function construirHuellas() {
    const tx = texCanvas(128, (g, nn) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, nn, nn);
      g.fillStyle = 'rgba(70,70,74,0.55)'; for (let k = 0; k < nn; k += 16) g.fillRect(10, k, nn - 20, 8);
      g.fillStyle = 'rgba(90,90,94,0.5)'; g.fillRect(0, 0, 10, nn); g.fillRect(nn - 10, 0, 10, nn);
    });
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
    const u = new THREE.Vector3().subVectors(B.fin, B.lejos), Ltot = u.length(); u.normalize();
    const pe = new THREE.Vector3(-u.z, 0, u.x), paso = 0.0005, wb = 0.00034;
    DET.huellas = [-1, 1].map((lado) => {
      const pts = []; for (let d = 0; d <= Ltot; d += paso) { const q = B.lejos.clone().addScaledVector(u, d).addScaledVector(pe, lado * 0.00085); if (DET.dentro(q.x, q.z)) pts.push([d, q]); }
      const pos = new Float32Array(pts.length * 6), uvs = new Float32Array(pts.length * 4), idx = [];
      pts.forEach(([d, q], k) => {
        for (let e = 0; e < 2; e++) { const x = q.x + pe.x * (e ? wb / 2 : -wb / 2), z = q.z + pe.z * (e ? wb / 2 : -wb / 2); pos.set([x, DET.hAt(x, z) + 0.00001, z], (k * 2 + e) * 3); uvs.set([e, d / 0.00045], (k * 2 + e) * 2); }
        if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1; m.visible = false; sCrater.add(m);
      return { m, d0: pts.length ? pts[0][0] : 0, n: pts.length, paso };
    });
  }
  function cargarSuelo() {
    const usar = () => {
      const base = LOCAL ? window.ICE_TERRAIN_LOCAL : null, tl = new THREE.TextureLoader();
      const rp = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
      tl.load(base ? base.color : 'assets/terrain/regolito_color_2k.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; matSuelo.map = rp(t); matSuelo.needsUpdate = true; pedir(); });
      tl.load(base ? base.normal : 'assets/terrain/regolito_normal_2k.jpg', (t) => { matSuelo.normalMap = rp(t); matSuelo.normalScale.set(0.9, 0.9); matSuelo.needsUpdate = true; pedir(); });
      const loader = cargadorGLTF(), ok = (gl) => colocarRocas(gl.scene);
      if (base) {
        const t0 = performance.now();
        (function ir() { if (!window.ICE_DRACO) { if (performance.now() - t0 < 30000) setTimeout(ir, 250); return; } try { loader.parse(b64buf(base.rocas), '', ok, () => {}); } catch (e) { } })();
      } else loader.load('assets/terrain/rocas_lunares.glb', ok, undefined, () => {});
    };
    if (LOCAL && !window.ICE_TERRAIN_LOCAL) { const sc = document.createElement('script'); sc.src = 'assets/terrain/terreno-local.js'; sc.onload = usar; document.head.appendChild(sc); }
    else usar();
  }
  // rocas escaneadas de Poly Haven (7 formas; se usa el nivel de detalle medio): fuera del camino del rover
  function colocarRocas(root) {
    const tipos = {};
    root.traverse((o) => { if (!o.isMesh) return; const mm = /^(.*?)(?:_L([12]))?$/.exec(o.name || 'roca'), lv = mm[2] ? +mm[2] : 0; (tipos[mm[1]] = tipos[mm[1]] || [])[lv] = o; });
    const lista = Object.keys(tipos).sort().map((k) => tipos[k][1] || tipos[k][0]).filter(Boolean);
    if (!lista.length) return;
    let a = 77; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const porTipo = lista.map(() => []), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let k = 0; k < 340; k++) {
      const x = DET.c.x + (r() - 0.5) * (DET.size - 0.012), z = DET.c.z + (r() - 0.5) * (DET.size - 0.012);
      if (distRecorrido(x, z) < 0.0029) continue;
      const big = r() < 0.035, size = big ? 0.7 + 0.8 * r() : 0.05 + 0.42 * Math.pow(r(), 2.6);   // metros
      porTipo[Math.floor(r() * lista.length)].push([x, z, size, r() * Math.PI * 2, (r() - 0.5) * 0.4]);
    }
    lista.forEach((o, ti) => {
      const geo = o.geometry; geo.computeBoundingBox(); const bb = geo.boundingBox, dim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
      const mat = o.material.clone(); mat.color.setScalar(0.36); mat.envMapIntensity = 0.1;
      const im = new THREE.InstancedMesh(geo, mat, porTipo[ti].length);
      porTipo[ti].forEach(([x, z, size, yaw, tilt], k) => {
        const s = size / dim / 1000; e.set(tilt * 0.5, yaw, tilt); q.setFromEuler(e); sc.setScalar(s);
        ps.set(x, DET.hAt(x, z) - (bb.min.y * s) - size * 0.12 / 1000, z); m4.compose(ps, q, sc); im.setMatrixAt(k, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.visible = false; conACES(im); sCrater.add(im);
      (DET.rocas = DET.rocas || []).push(im);
    });
    pedir();
  }

  // ---------- puntos de interés ----------
  const POIS = [
    { k: 'pole', t: L('Polo sur geográfico', 'Geographic south pole'), x: L('Está sobre el borde de Shackleton, a unos 10 km del centro del cráter. Aquí el Sol nunca sube más de ~1,5° sobre el horizonte.', 'It lies on the rim of Shackleton, about 10 km from the centre of the crater. Here the Sun never rises more than ~1.5° above the horizon.') },
    { k: 'rimLit', t: L('Borde iluminado', 'Sunlit rim'), x: L('Según este relieve, desde aquí el Sol se ve en casi todas las direcciones: un buen sitio para paneles solares.', 'According to this terrain, the Sun can be seen from here in almost every direction: a good place for solar panels.') },
    { k: 'site', t: L('Zona de estudio de ICEWISE', 'ICEWISE study area'), x: L('Aquí situamos la estación y la colonia de la simulación: borde iluminado y una sombra permanente cercana. Relieve de detalle: LOLA 5 m/px (Barker et al., 2021).', 'This is where we place the station and the colony of the simulation: a sunlit rim and a nearby permanent shadow. Detailed terrain: LOLA 5 m/px (Barker et al., 2021).') },
    { k: 'center', t: L('Fondo del cráter', 'Crater floor'), x: L('Unos 4 km bajo el borde y en sombra permanente. Si hay hielo, todavía no se ha confirmado cuánto ni dónde.', 'About 4 km below the rim and in permanent shadow. If there is ice, how much and where has not been confirmed yet.') }
  ];
  let botones = [];
  function crearMarcas() {
    botones = POIS.map((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'reto-marca' + (p.k === 'rimLit' || p.k === 'site' ? ' reto-marca--sol' : '');
      b.innerHTML = `<span class="rm-p" aria-hidden="true"></span><span class="rm-t">${p.t}</span>`;
      b.setAttribute('aria-label', p.t);
      b.addEventListener('click', (e) => { e.stopPropagation(); abrirFicha(p); });
      marcas.appendChild(b); return { p, b, x: 0, y: 0 };
    });
  }
  // abrir una ficha pausa el vídeo (para poder explicarla); al cerrarla sigue
  function abrirFicha(p) { ficha.querySelector('.rf-t').textContent = p.t; ficha.querySelector('.rf-x').textContent = p.x; ficha.hidden = false; vid.ficha = true; requestAnimationFrame(() => ficha.classList.add('is-on')); actualizarBoton(); }
  function cerrarFicha() { if (ficha.hidden) return; ficha.classList.remove('is-on'); vid.ficha = false; actualizarBoton(); pedir(); setTimeout(() => { if (!ficha.classList.contains('is-on')) ficha.hidden = true; }, 300); }
  ficha.querySelector('.rf-cerrar').addEventListener('click', cerrarFicha);

  // ---------- leyenda de la escena ----------
  const ley = document.createElement('div'); ley.className = 'reto-ley3d'; ley.setAttribute('aria-hidden', 'true');
  ley.innerHTML = '<p class="l3 l3-sol"><i></i><span data-l3="sol"></span></p><p class="l3 l3-psr"><i></i><span data-l3="psr"></span></p><p class="l3 l3-rover"><i></i><span data-l3="rover"></span></p>';
  escena.appendChild(ley);
  function $l3(k) { return ley.querySelector(`[data-l3="${k}"]`); }

  // ---------- carga (perezosa) ----------
  let cargado = false;
  function cargar() {
    if (cargado) return; cargado = true;
    const tl = new THREE.TextureLoader(), local = window.ICE_MOON_LOCAL;
    const t = (u, cb) => tl.load(u, (x) => { x.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); cb(x); pedir(); });
    t(local ? local.color : 'assets/img/luna/luna-color-2k.jpg', (x) => { matLuna.uniforms.map.value = x; });
    t(local ? local.normal : 'assets/img/luna/luna-normal-2k.jpg', (x) => { matLuna.uniforms.nmap.value = x; matLuna.uniforms.hasMaps.value = 1; });
    // con doble clic (file://) el mosaico y el relieve van incrustados en assets/data/reto-local.js
    const RLc = window.ICE_RETO_LOCAL;
    t(RLc ? RLc.mosaico : 'assets/img/lro-south-pole.jpg', (x) => { matLuna.uniforms.mos.value = x; matLuna.uniforms.hasMos.value = 1; UP.mos.value = x; });
    const datos = RLc
      ? Promise.resolve([RLc.meta, (() => { const s = atob(RLc.bin), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; })()])
      : Promise.all([fetch('assets/data/shackleton.json').then((r) => r.json()), fetch('assets/data/shackleton.bin').then((r) => r.arrayBuffer())]);
    datos.then(([m, b]) => { construirTerreno(m, b); return cargarPolo(); }).catch(() => {});
  }
  new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { cargar(); io.disconnect(); } }, { rootMargin: '150% 0px' }).observe(sec);

  // ---------- tamaño ----------
  let W = 1, Hh = 1, chico = false;
  function layout() {
    const r = escena.getBoundingClientRect(); W = Math.max(1, r.width); Hh = Math.max(1, r.height); chico = W < 760;
    const pr = Math.min(devicePixelRatio || 1, chico ? 1.25 : 1.5);
    renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false);
    composer.setPixelRatio(pr); composer.setSize(W, Hh); grade.uniforms.res.value.set(W * pr, Hh * pr);
    [cLuna, cCrater].forEach((c) => { c.aspect = W / Hh; c.updateProjectionMatrix(); });
    pulMat.uniforms.px.value = renderer.getPixelRatio();
    pedir();
  }
  new ResizeObserver(layout).observe(escena);

  // ================= REPRODUCCIÓN =================
  const vid = { t: reduce ? QUIETO[0] : 0, pausa: reduce, ficha: false, enVista: false, salio: true };
  const reproduciendo = () => !vid.pausa && !vid.ficha && vid.enVista && !document.hidden;
  const btnP = document.createElement('button'); btnP.type = 'button'; btnP.className = 'reto-pausa';
  barra.insertBefore(btnP, barra.firstChild);
  const ICO_PAUSA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const ICO_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  function actualizarBoton() {
    const on = !vid.pausa && !vid.ficha;
    btnP.innerHTML = on ? ICO_PAUSA : ICO_PLAY;
    const t = on ? L('Pausar el descenso', 'Pause the descent') : L('Reproducir el descenso', 'Play the descent');
    btnP.setAttribute('aria-label', t); btnP.title = t; sec.classList.toggle('reto--pausa', !on);
  }
  btnP.addEventListener('click', () => { if (vid.ficha) cerrarFicha(); else vid.pausa = !vid.pausa; actualizarBoton(); pedir(); });
  const fills = rail.map((b, i) => {
    const s = document.createElement('i'); s.className = 'rr-barra'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<i></i>';
    b.appendChild(s); b.style.flexGrow = String(SEGS[i][1] - SEGS[i][0]); return s.firstChild;
  });
  rail.forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.ir; vid.t = reduce ? QUIETO[k] : SEGS[k][0] + 0.01; contado.clear(); cerrarFicha(); pedir();
  }));
  actualizarBoton();

  // ---------- capítulos, números y lecturas ----------
  let capActual = -2; const contado = new Set();
  function activarCap(k) {
    if (k === capActual) return; capActual = k;
    caps.forEach((c, i) => {
      const on = i === k; c.classList.toggle('is-on', on); c.setAttribute('aria-hidden', String(!on));
      c.querySelectorAll('a, button').forEach((el) => { el.tabIndex = on ? 0 : -1; });
    });
    $hud('fase').textContent = k < 0 ? L('Regreso a la órbita', 'Back to orbit') : FASE[k];
    if (k >= 0 && !contado.has(k)) { contado.add(k); contar(caps[k]); }
    if (k !== 3) cerrarFicha();
  }
  function contar(cap) {
    cap.querySelectorAll('.reto-num').forEach((el) => {
      const v = +el.dataset.v, d = +el.dataset.d || 0;
      if (reduce) { el.textContent = fmt(v, d); return; }
      const t0 = performance.now(), dur = 900;
      const paso = (now) => { const t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3); el.textContent = fmt(v * e, d); if (t < 1) requestAnimationFrame(paso); };
      requestAnimationFrame(paso);
    });
  }
  const capDe = (t) => { for (let k = 0; k < CAPS.length; k++) if (t >= CAPS[k][0] && t < CAPS[k][1]) return k; return -1; };

  // ---------- faros del rover: siguen al cursor, al dedo o barren solos ----------
  const lamp = { tgt: null, on: 0, ultimo: 0, manual: false, sx: -1, sy: -1 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  function tocarRelieve(nx, ny) {
    if (!D) return null;
    ndc.set(nx, ny); ray.setFromCamera(ndc, cCrater);
    const o = ray.ray.origin, d = ray.ray.direction; let tPrev = 0;
    for (let t = 0.001; t < 120; t += 0.001 + t * 0.015) {
      tmp.copy(d).multiplyScalar(t).add(o);
      if (Math.abs(tmp.x) > KM / 2 || Math.abs(tmp.z) > KM / 2) { if (t > 60) break; tPrev = t; continue; }
      if (tmp.y < hF(tmp.x, tmp.z)) {
        let a = tPrev, b = t;
        for (let k = 0; k < 16; k++) { const m = (a + b) / 2; tmp.copy(d).multiplyScalar(m).add(o); if (tmp.y < hF(tmp.x, tmp.z)) b = m; else a = m; }
        return tmp.clone();
      }
      tPrev = t;
    }
    return null;
  }
  // el punto iluminado queda delante del rover, a 6–40 m, y como mucho a 60° de su rumbo
  function limitar(p) {
    const R = roverPos, dx = p.x - R.x, dz = p.z - R.z; let a = Math.atan2(dz, dx), d = Math.hypot(dx, dz);
    let da = Math.atan2(Math.sin(a - B.rumbo), Math.cos(a - B.rumbo)); da = clamp(da, -60 * DEG, 60 * DEG); a = B.rumbo + da; d = clamp(d, 0.006, 0.04);
    const x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; return new THREE.Vector3(x, hF(x, z), z);
  }
  const enFoco = () => B && vid.t >= FOCO0 && vid.t < FOCO1;
  escena.addEventListener('pointermove', (e) => {
    const r = escena.getBoundingClientRect(); lamp.sx = e.clientX - r.left; lamp.sy = e.clientY - r.top;
    if (e.pointerType !== 'mouse' || !enFoco()) { iman(lamp.sx, lamp.sy); return; }
    const h = tocarRelieve(lamp.sx / W * 2 - 1, -(lamp.sy / Hh) * 2 + 1);
    if (h) { lamp.tgt = limitar(h); lamp.manual = true; lamp.ultimo = performance.now(); }
    iman(lamp.sx, lamp.sy); pedir();
  });
  escena.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !enFoco() || e.target.closest('button, a, .reto-cap')) return;
    const r = escena.getBoundingClientRect(); lamp.sx = e.clientX - r.left; lamp.sy = e.clientY - r.top;
    const h = tocarRelieve(lamp.sx / W * 2 - 1, -(lamp.sy / Hh) * 2 + 1);
    if (h) { lamp.tgt = limitar(h); lamp.manual = true; lamp.ultimo = performance.now() + 3000; pedir(); }
  });
  escena.addEventListener('pointerleave', () => { lamp.sx = -1; });
  lienzo.addEventListener('keydown', (e) => {
    if (!enFoco()) return;
    const st = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!st) return;
    e.preventDefault();
    const b = lamp.tgt || roverPos.clone();
    const fw = new THREE.Vector3(); cCrater.getWorldDirection(fw); fw.y = 0; fw.normalize(); const rg = new THREE.Vector3(-fw.z, 0, fw.x);
    lamp.tgt = limitar(b.clone().addScaledVector(rg, st[0] * 0.003).addScaledVector(fw, -st[1] * 0.003));
    lamp.manual = true; lamp.ultimo = performance.now() + 4000; lamp.sx = -1; pedir();
  });
  // sin interacción: los faros barren el suelo de delante
  function barrido(t) {
    const R = roverPos, a = B.rumbo + Math.sin(t * 0.45) * 26 * DEG, d = 0.018 + 0.006 * Math.sin(t * 0.31 + 1.0);
    const x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; return new THREE.Vector3(x, hF(x, z), z);
  }
  function leerPunto(p) {
    const [la, lo] = latlon(p.x, p.z);
    const e = 0.006, sl = Math.atan(Math.hypot(hF(p.x + e, p.z) - hF(p.x - e, p.z), hF(p.x, p.z + e) - hF(p.x, p.z - e)) / (2 * e)) * 180 / Math.PI;
    let ps, lf;
    if (enBorde(p.x, p.z)) { const i = Math.round((p.x - B.x0) / B.paso), j = Math.round((p.z - B.z0) / B.paso), k = j * B.N + i; ps = !!B.psr[k]; lf = B.lit[k] / 100; }
    else { const N = D.N, i = clamp(Math.round((p.x / KM + 0.5) * (N - 1)), 0, N - 1), j = clamp(Math.round((p.z / KM + 0.5) * (N - 1)), 0, N - 1); ps = D.psr[j * N + i] > 127; lf = D.lit[j * N + i] / 255; }
    $lee('lat').textContent = fmt(-la, 4) + '° S';
    $lee('lon').textContent = fmt(lo, 2) + '° E';
    $lee('alt').textContent = fmt(Math.max(0, (p.y - D.floor) * 1000), 0) + ' m';
    $lee('pend').textContent = fmt(sl, 0) + '°';
    $lee('luz').textContent = ps ? L('Sombra permanente: nunca le da el Sol', 'Permanent shadow: the Sun never reaches it')
      : lf > 0.5 ? L('Recibe luz solar a menudo', 'Often receives sunlight') : L('Recibe luz solar a veces', 'Sometimes receives sunlight');
    ret.querySelector('.rt-l').textContent = ps ? 'PSR' : L('LUZ', 'LIT');
    ret.classList.toggle('es-psr', ps);
  }

  // ---------- marcas con leve atracción magnética ----------
  function iman(mx, my) {
    botones.forEach((o) => {
      const dx = mx - o.x, dy = my - o.y, d = Math.hypot(dx, dy), k = d < 70 && mx >= 0 ? (1 - d / 70) * 7 : 0;
      o.b.style.setProperty('--mx', (dx / (d || 1) * k).toFixed(1) + 'px'); o.b.style.setProperty('--my', (dy / (d || 1) * k).toFixed(1) + 'px');
    });
  }
  const proy = (v, cam) => { tmp.copy(v).project(cam); return [(tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * Hh, tmp.z < 1 && tmp.z > -1]; };

  // ---------- paralaje 3D con el ratón: la cámara se inclina un poco hacia el cursor y vuelve sola (muelle sin rebote) ----------
  const finoPuntero = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const par = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  escena.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = escena.getBoundingClientRect(); par.tx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); par.ty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); pedir(); }, { passive: true });
  escena.addEventListener('pointerleave', () => { par.tx = par.ty = 0; pedir(); });
  function paralaje(cam, dt) {
    if (reduce || !finoPuntero) return;
    const w = 2 * Math.PI / 1.1;
    ['x', 'y'].forEach((k) => { const v = 'v' + k, t = 't' + k, e0 = par[k] - par[t], kk = par[v] + w * e0, ex = Math.exp(-w * dt); par[k] = par[t] + (e0 + kk * dt) * ex; par[v] = (par[v] - w * kk * dt) * ex; });
    cam.rotateY(-par.x * 0.024); cam.rotateX(-par.y * 0.016); cam.updateMatrixWorld();
  }
  const parMueve = () => Math.abs(par.x - par.tx) + Math.abs(par.y - par.ty) + Math.abs(par.vx) + Math.abs(par.vy) > 1e-3;

  // ---------- cursor propio: un anillo que sigue al ratón con retraso y reacciona a lo que hay debajo ----------
  if (finoPuntero && !reduce) {
    const cur = document.createElement('div'); cur.className = 'reto-cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<i class="rc-anillo"></i><i class="rc-punto"></i><span class="rc-texto"></span>'; escena.appendChild(cur);
    sec.classList.add('reto--cursor');
    const cp = cur.querySelector('.rc-punto'), ctx = cur.querySelector('.rc-texto'), cs = { x: -100, y: -100, ax: -100, ay: -100, on: false, raf: 0 };
    const mover = () => {
      cs.raf = 0; cs.ax += (cs.x - cs.ax) * 0.22; cs.ay += (cs.y - cs.ay) * 0.22;
      cur.style.transform = `translate3d(${cs.ax.toFixed(1)}px, ${cs.ay.toFixed(1)}px, 0)`; cp.style.transform = `translate3d(${(cs.x - cs.ax).toFixed(1)}px, ${(cs.y - cs.ay).toFixed(1)}px, 0)`;
      if (cs.on && Math.abs(cs.x - cs.ax) + Math.abs(cs.y - cs.ay) > 0.4) cs.raf = requestAnimationFrame(mover);
    };
    escena.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = escena.getBoundingClientRect(); cs.x = e.clientX - r.left; cs.y = e.clientY - r.top;
      if (!cs.on) { cs.ax = cs.x; cs.ay = cs.y; } cs.on = true; cur.classList.add('is-on');
      const marca = e.target.closest('.reto-marca'), boton = e.target.closest('button, a, .reto-cap');
      const txt = marca ? L('Ver', 'View') : (!boton && enFoco() ? L('Ilumina', 'Light up') : '');
      if (ctx.textContent !== txt) ctx.textContent = txt;
      cur.classList.toggle('is-texto', !!txt); cur.classList.toggle('is-boton', !txt && !!e.target.closest('button, a'));
      if (!cs.raf) cs.raf = requestAnimationFrame(mover);
    });
    escena.addEventListener('pointerleave', () => { cs.on = false; cur.classList.remove('is-on'); });
    escena.addEventListener('pointerdown', () => cur.classList.add('is-pulsa'));
    addEventListener('pointerup', () => cur.classList.remove('is-pulsa'));
  }
  // ---------- botones magnéticos con luz: se acercan un poco al cursor y un brillo sigue al ratón por su borde ----------
  function magnetico(el) {
    if (!finoPuntero || reduce || !el || el.dataset.mg) return; el.dataset.mg = '1'; el.classList.add('mg');
    const luz = document.createElement('span'); luz.className = 'mg-luz'; luz.setAttribute('aria-hidden', 'true'); el.appendChild(luz);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.style.setProperty('--mgx', clamp(dx * 0.22, -8, 8).toFixed(1) + 'px'); el.style.setProperty('--mgy', clamp(dy * 0.22, -6, 6).toFixed(1) + 'px');
      el.style.setProperty('--lx', (e.clientX - r.left).toFixed(0) + 'px'); el.style.setProperty('--ly', (e.clientY - r.top).toFixed(0) + 'px');
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--mgx', '0px'); el.style.setProperty('--mgy', '0px'); });
  }
  [btnP, ...rail, ...sec.querySelectorAll('.rc-cta .btn, .rf-cerrar')].forEach(magnetico);

  // ---------- cifras ancladas al relieve: dejan la columna de texto y se dibujan sobre el lugar real ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  const guias = document.createElementNS(SVGNS, 'svg'); guias.setAttribute('class', 'reto-guias'); guias.setAttribute('aria-hidden', 'true'); escena.appendChild(guias);
  const CIFRAS = {
    frio: { t0: 30.6, t1: 34.6, sol: false, v: -233, d: 0, u: ' °C', x: L('en las sombras permanentes más frías (< 40 K), medido por Diviner', 'in the coldest permanent shadows (< 40 K), measured by Diviner') },
    diam: { t0: 37.4, t1: 44.2, sol: false, v: 20.8, d: 1, u: ' km', x: L('de diámetro', 'in diameter') },
    prof: { t0: 44.0, t1: 50.6, sol: false, v: 4.0, d: 1, u: ' km', x: L('de profundidad', 'deep') },
    sol80: { t0: 40.2, t1: 50.6, sol: true, v: 80, d: 0, u: ' %', pre: '> ', x: L('del tiempo al Sol en algunos puntos del borde', 'of the time in sunlight at some points on the rim') },
    est: { t0: 52.3, t1: 54.9, sol: true, v: 83, d: 0, u: ' %', x: L('del tiempo al Sol en la estación (calculado con LOLA)', 'of the time in sunlight at the station (calculated with LOLA)') }
  };
  Object.entries(CIFRAS).forEach(([k, c]) => {
    c.linea = document.createElementNS(SVGNS, 'polyline'); c.linea.setAttribute('class', 'rg-linea' + (c.sol ? ' rg-sol' : '')); guias.appendChild(c.linea);
    c.marca = document.createElementNS(SVGNS, 'circle'); c.marca.setAttribute('r', '3.5'); c.marca.setAttribute('class', 'rg-punto' + (c.sol ? ' rg-sol' : '')); guias.appendChild(c.marca);
    c.el = document.createElement('div'); c.el.className = 'reto-cifra' + (c.sol ? ' reto-cifra--sol' : ''); c.el.setAttribute('aria-hidden', 'true');
    c.el.innerHTML = `<b>${c.pre || ''}<span class="rc-v">0</span>${c.u}</b><span>${c.x}</span>`; escena.appendChild(c.el);
    c.num = c.el.querySelector('.rc-v'); c.contada = false;
  });
  const aPx = (v, cam) => { const [x, y, ok] = proy(v, cam); return ok ? [x, y] : null; };
  function cifra(k, t, pts, lbl) {
    const c = CIFRAS[k], p = smooth(c.t0, c.t0 + 1.6, t) * (1 - smooth(c.t1 - 0.6, c.t1, t));
    const ok = p > 0.001 && pts && pts.every(Boolean) && !chico;
    c.el.classList.toggle('is-on', ok && p > 0.55); c.linea.style.opacity = c.marca.style.opacity = ok ? 1 : 0;
    if (!ok) { if (p <= 0.001) c.contada = false; return; }
    c.linea.setAttribute('points', pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '));
    let L2 = 0; for (let i = 1; i < pts.length; i++) L2 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    c.linea.style.strokeDasharray = L2.toFixed(1); c.linea.style.strokeDashoffset = (L2 * (1 - smooth(0, 0.7, p))).toFixed(1);
    c.marca.setAttribute('cx', pts[0][0].toFixed(1)); c.marca.setAttribute('cy', pts[0][1].toFixed(1));
    c.el.style.transform = `translate3d(${lbl[0].toFixed(0)}px, ${lbl[1].toFixed(0)}px, 0)`;
    if (p > 0.55 && !c.contada) { c.contada = true; contarEl(c.num, c.v, c.d); }
  }
  function contarEl(el, v, d) {
    if (reduce) { el.textContent = fmt(v, d); return; }
    const t0 = performance.now(), dur = 1100;
    const paso = (now) => {
      const q = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - q, 3);
      el.textContent = fmt(v * e, d); el.style.opacity = q < 1 ? (0.65 + 0.35 * Math.random()).toFixed(2) : 1;   // leve parpadeo digital
      if (q < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  function anclarCifras(t) {
    if (!D || !polo) { Object.keys(CIFRAS).forEach((k) => cifra(k, -1)); return; }
    const C = D.center, rR = D.meta.crater.rimRadiusM / 1000;
    // frío: desde el fondo de Shackleton hacia arriba a la derecha
    const pf = aPx(v3.set(C.x, D.floor, C.z), cCrater);
    cifra('frio', t, pf && [pf, [pf[0] + 120, pf[1] - 90], [pf[0] + 200, pf[1] - 90]], pf && [pf[0] + 208, pf[1] - 112]);
    // diámetro: de borde a borde, perpendicular a la mirada (siempre de lado en la pantalla)
    const fw = v4; cCrater.getWorldDirection(fw); fw.y = 0; fw.normalize(); const rx = -fw.z, rz = fw.x;
    const a = aPx(tmpA.set(C.x + rx * rR, hAll(C.x + rx * rR, C.z + rz * rR) + 0.05, C.z + rz * rR), cCrater), b = aPx(tmpB.set(C.x - rx * rR, hAll(C.x - rx * rR, C.z - rz * rR) + 0.05, C.z - rz * rR), cCrater);
    cifra('diam', t, a && b && [a, b], a && b && [(a[0] + b[0]) / 2 - 40, (a[1] + b[1]) / 2 - 64]);
    // profundidad: vertical sobre el centro, del nivel del borde al fondo
    const top = aPx(tmpA.set(C.x, 0, C.z), cCrater), bot = aPx(tmpB.set(C.x, D.floor, C.z), cCrater);
    cifra('prof', t, top && bot && [bot, top], top && bot && [top[0] + 16, top[1] - 10]);
    // > 80 %: desde el borde iluminado
    // (la etiqueta va hacia el lado de la pantalla con más sitio)
    const lado = (q, dx, dy, w) => { const s2 = q[0] > W * 0.55 ? -1 : 1; return [[q, [q[0] + s2 * dx, q[1] - dy], [q[0] + s2 * (dx + 80), q[1] - dy]], [s2 > 0 ? q[0] + dx + 88 : q[0] - dx - 88 - w, q[1] - dy - 24]]; };
    const rl = aPx(D.rimLit, cCrater), rlL = rl && rl[0] > 40 && rl[0] < W - 40 ? lado(rl, 70, 70, 250) : null;
    cifra('sol80', t, rlL && rlL[0], rlL && rlL[1]);
    // la estación solar en la cresta
    const es = B && aPx(v3.copy(B.est).setY(B.est.y + 0.01), cCrater), esL = es && es[0] > 40 && es[0] < W - 40 && es[1] > 90 ? lado(es, 60, 80, 250) : null;
    cifra('est', t, esL && esL[0], esL && esL[1]);
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  // ---------- frases de tráiler a pantalla completa entre capítulos ----------
  const FRASES = [
    [19.1, 21.0, L('En el polo, el Sol nunca sube más de <em class="fr-sol">1,5°</em>.', 'At the pole, the Sun never rises more than <em class="fr-sol">1.5°</em>.')],
    [33.3, 35.3, L('Su fondo <em class="fr-hielo">nunca</em> recibe la luz del Sol.', 'Its floor <em class="fr-hielo">never</em> receives sunlight.')],
    [50.7, 52.6, L('Hasta <em class="fr-hielo">−233 °C</em> en las sombras más frías.', 'Down to <em class="fr-hielo">−233 °C</em> in the coldest shadows.')],
    [69.6, 71.7, L('<em class="fr-sol">Energía</em> arriba. <em class="fr-hielo">Hielo</em> abajo.', '<em class="fr-sol">Energy</em> above. <em class="fr-hielo">Ice</em> below.')]
  ];
  const frase = document.createElement('div'); frase.className = 'reto-frase'; frase.setAttribute('aria-hidden', 'true'); frase.innerHTML = '<p></p>'; escena.appendChild(frase);
  const fraseP = frase.querySelector('p'); let fraseAct = -1;
  function frases(t) {
    let k = -1; FRASES.forEach(([a, b], i) => { if (t >= a && t < b) k = i; });
    if (k !== fraseAct) { fraseAct = k; if (k >= 0) fraseP.innerHTML = FRASES[k][2]; frase.classList.toggle('is-on', k >= 0); sec.classList.toggle('reto--frase', k >= 0); }
  }

  // ---------- titulares que se revelan palabra a palabra (y reaccionan al cursor) ----------
  const esc = (x) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const palabras = [];
  if (!reduce) caps.forEach((c) => {
    const h = c.querySelector('.rc-h'); if (!h) return;
    const txt = h.textContent.replace(/\s+/g, ' ').trim(); h.setAttribute('aria-label', txt);
    h.innerHTML = txt.split(' ').map((w, i) => `<span class="rv-w" aria-hidden="true"><span class="rv-i" style="--i:${i}">${esc(w)}</span></span>`).join(' ');
    h.querySelectorAll('.rv-i').forEach((el) => palabras.push({ el, cap: c }));
  });
  sec.classList.add('reto--revela');
  let palRaf = 0, palX = -1e4, palY = -1e4;
  function palabrasCursor() {
    palRaf = 0;
    palabras.forEach((o) => {
      if (!o.cap.classList.contains('is-on')) { if (o.lev) { o.lev = 0; o.el.style.setProperty('--lev', 0); } return; }
      const r = o.el.getBoundingClientRect(), d = Math.hypot(palX - (r.left + r.width / 2), palY - (r.top + r.height / 2));
      const lev = Math.max(0, 1 - d / 190); if (Math.abs(lev - (o.lev || 0)) > 0.01) { o.lev = lev; o.el.style.setProperty('--lev', lev.toFixed(3)); }
    });
  }
  if (finoPuntero && !reduce) {
    escena.addEventListener('pointermove', (e) => { palX = e.clientX; palY = e.clientY; if (!palRaf) palRaf = requestAnimationFrame(palabrasCursor); }, { passive: true });
    escena.addEventListener('pointerleave', () => { palX = palY = -1e4; if (!palRaf) palRaf = requestAnimationFrame(palabrasCursor); });
  }

  // ---------- tarjetas con inclinación 3D y un reflejo de luz que sigue al ratón ----------
  function inclinar(el) {
    if (!finoPuntero || reduce || !el) return; el.classList.add('incl');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - 0.5) * 11).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  }
  sec.querySelectorAll('.rc-dos > div, .rc-lectura, .rc-aviso').forEach(inclinar);

  // ---------- visibilidad: se reproduce con la mitad de la sección a la vista; al volver, empieza de nuevo ----------
  let raf = 0, last = 0, visible = false;
  new IntersectionObserver((es) => {
    const e = es[es.length - 1]; visible = e.isIntersecting;
    const enVista = e.intersectionRatio >= 0.5;
    if (!visible) vid.salio = true;
    if (enVista && !vid.enVista && vid.salio && !reduce) { vid.t = 0; contado.clear(); vid.salio = false; }
    vid.enVista = enVista; if (visible) pedir();
  }, { threshold: [0, 0.5, 1] }).observe(sec);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pedir(); });
  function pedir() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  const faroP = new THREE.Vector3(), cenV = new THREE.Vector3(), solNdc = new THREE.Vector2();
  let solVis = 0, altPrev = 0, saltoS = 0;
  const DR = { aL: 1, aF: 0 };
  function dibujar() {                                                          // lo llama el primer pase del postprocesado
    renderer.clear();
    if (DR.aL > 0.001) renderer.render(sLuna, cLuna);
    if (DR.aF > 0.001) { renderer.clearDepth(); renderer.render(sCrater, cCrater); if (roverG.visible) renderer.render(sRover, cCrater); if (estG.visible) renderer.render(sEst, cCrater); }
    renderer.clearDepth(); renderer.render(sLente, cLente);
  }
  let tPrev = 0, lampMov = false;
  function frame(now) {
    raf = 0;
    const dtr = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;   // hasta 0,25 s por fotograma: en equipos lentos el vídeo no se retrasa
    const corre = reproduciendo();
    if (corre) vid.t += dtr;
    if (vid.t >= LOOP) { vid.t -= LOOP; contado.clear(); }
    const t = vid.t;
    if (t < tPrev - 1) { contado.clear(); Object.values(CIFRAS).forEach((c) => { c.contada = false; }); } tPrev = t;
    activarCap(capDe(t));
    SEGS.forEach(([a, b], i) => { const f = clamp((t - a) / (b - a), 0, 1); fills[i].style.transform = `scaleX(${f.toFixed(4)})`; rail[i].classList.toggle('is-on', t >= a && t < b); rail[i].setAttribute('aria-current', t >= a && t < b ? 'step' : 'false'); });

    // ---- cámara: una sola, en el marco de la Luna (órbita) o en el del relieve (cerca del polo) ----
    const rot = -Math.PI / 2 + spin(t); luna.rotation.y = rot; luna.updateMatrixWorld();
    const listoF = !!(D && polo);
    let enF = listoF && t >= T_POLO && t <= T_VUELTA, dCam = 1e4, alt;
    if (listoF) { prepararPolo(); marcos(rot); }
    if (enF) { colocarRover(t); dCam = poseF(t, roverPos); paralaje(cCrater, dtr); camF2M(); }
    else {
      const u = t < T_POLO ? uIda(t) : uVuelta(t);
      if (!listoF) { qPolo.copy(KEYS_M[2].q); pPolo.copy(KEYS_M[2].d).multiplyScalar(KEYS_M[2].r * 0.8); }
      poseM(Math.min(u, 3)); paralaje(cLuna, dtr); if (listoF) camM2F();
    }
    alt = (cLuna.position.length() - 1) * RL;
    if (enF && alt < 900) alt = cCrater.position.y - hAll(cCrater.position.x, cCrater.position.z);
    // visibilidad: el relieve plano aparece por debajo de ~420 km (mismo encuadre que la esfera)
    const aF = listoF ? smooth(420, 260, alt) : 0, aL = 1 - aF;
    const aDEM = smooth(120, 60, alt);
    // encuadre: la escena se aparta del lado del texto (escritorio) o sube sobre el panel (móvil)
    const sx = chico ? 0 : desplaz(t), sy = chico ? 0.16 : 0;
    cLuna.near = clamp((cLuna.position.length() - 1) * 0.3, 0.004, 1);
    cCrater.near = clamp(Math.min(dCam, alt) * 0.02, 0.0003, 20); cCrater.far = Math.max(400, alt * 3 + 700);
    [cLuna, cCrater].forEach((c) => c.setViewOffset(W, Hh, -sx * W, sy * Hh, W, Hh));

    // ---- Luna, Sol, LRO ----
    if (aL > 0) {
      matLuna.uniforms.fade.value = 1;
      matLuna.uniforms.mosMix.value = mosMix(t); matLuna.uniforms.mosLook.value = mosLook(t);
      matLuna.uniforms.grat.value = (0.25 + 0.55 * smooth(5, 14, t)) * (1 - smooth(15.5, 19, t)) * (t < 40 ? 1 : 0);
      // LRO: posición en su órbita (fija en el espacio) y pulsos del láser sobre el suelo, que giran con la Luna
      const lp = lroPos(t, v3); lro.position.copy(lp); lro.scale.setScalar(clamp(lp.distanceTo(cLuna.position) * 0.012, 0.002, 0.04));
      orbMat.uniforms.head.value = ((lroAng(t) + Math.PI / 2) / (2 * Math.PI) + 0.25) % 1; orbMat.uniforms.fade.value = 0.85;
      const ahora = now / 1000; pulMat.uniforms.ahora.value = ahora;
      if (corre && ahora - pulUlt > 0.012) {
        pulUlt = ahora; const sub = v4.copy(lp).normalize().multiplyScalar(1.0006); luna.worldToLocal(sub);
        for (let k = 0; k < 2; k++) { pulP.set([sub.x + (Math.random() - 0.5) * 0.004, sub.y + (Math.random() - 0.5) * 0.004, sub.z + (Math.random() - 0.5) * 0.004], pulI * 3); pulT[pulI] = ahora; pulI = (pulI + 1) % PUL; }
        pulG.attributes.position.needsUpdate = true; pulG.attributes.nace.needsUpdate = true;
      }
      const [lx, ly, lok] = proy(lp, cLuna);
      // ¿la Luna tapa a LRO? (el rayo cámara → sonda corta la esfera antes de llegar)
      const co = cLuna.position, dl = v4.copy(lp).sub(co), Ls = dl.length(); dl.multiplyScalar(1 / Ls);
      const tca = -co.dot(dl), d2 = co.lengthSq() - tca * tca, detras = d2 < 1 && tca > 0 && tca - Math.sqrt(1 - d2) < Ls;
      tagLro.style.transform = `translate3d(${lx.toFixed(0)}px, ${ly.toFixed(0)}px, 0)`;
      tagLro.classList.toggle('is-on', aL > 0.9 && lok && !detras && t > 2 && t < 26 && lx > 30 && lx < W - 200 && ly > 90 && ly < Hh - 90);
      // destellos de lente: según cuánto Sol asoma por detrás de la Luna y si está en pantalla
      tmp.copy(SOL_M).multiplyScalar(150).project(cLuna);
      const dMoon = cenV.copy(cLuna.position).negate().normalize();
      const ang = Math.acos(clamp(SOL_M.dot(dMoon), -1, 1)), rM = Math.asin(1 / Math.max(1.0001, cLuna.position.length()));
      if (aL > 0.5) { solNdc.set(tmp.x, tmp.y); solVis = smooth(rM - 0.004, rM + 0.02, ang) * (tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15 ? 1 : 0); }
    } else tagLro.classList.remove('is-on');
    matLuna.uniforms.rotM.value.setFromMatrix4(luna.matrixWorld);
    matLuna.uniforms.sombraW.value = 1 - spin(t) / SPIN0;
    if (aL > 0 && !(aF > 0.001 && D)) { $hud('alt').textContent = fmt(alt, 0) + ' km'; const la = Math.asin(clamp(-cenV.copy(cLuna.position).normalize().y, -1, 1)) / DEG; $hud('lat').textContent = fmt(Math.abs(la), 1) + (la >= 0 ? '° S' : '° N'); }

    // ---- polo sur y Shackleton (marco F) ----
    let foco = 0;
    if (aF > 0 && D) {
      UP.fade.value = aF; UP.mosLook.value = mosLook(t); UP.mosMix.value = mosMix(t) * (1 - 0.6 * aDEM); UP.hueco.value = aDEM;
      UC.fade.value = aF * aDEM;
      // el Sol: una vuelta completa durante «¿Por qué Shackleton?» y quieto (el de la simulación) el resto del tiempo
      const giro = clamp((t - SOL0) / (SOL1 - SOL0), 0, 1), sa = (SOL_AZ + 360 * giro) * DEG;
      UC.sunDir.value.set(Math.cos(sa) * Math.cos(sEl), Math.sin(sEl), Math.sin(sa) * Math.cos(sEl));
      UC.reposo.value = giro <= 0 || giro >= 1 ? 1 : 0;
      $l3('sol').textContent = L(`Sol a ${fmt(SOL_ALT, 1)}° sobre el horizonte · día ${fmt(giro * 29.5, 1)} de 29,5 (acelerado)`, `Sun ${fmt(SOL_ALT, 1)}° above the horizon · day ${fmt(giro * 29.5, 1)} of 29.5 (sped up)`);
      UC.time.value = now / 1000;
      UC.psrLine.value = smooth(35.5, 37.5, t) * (1 - smooth(50.5, 52.5, t));
      UC.psrFill.value = smooth(37.5, 39.5, t) * (1 - smooth(50.5, 53, t));
      UC.latOn.value = smooth(38, 40, t) * (1 - smooth(50, 51.5, t));
      const cerca = 1 - smooth(0.15, 1.5, Math.min(dCam, alt));
      UC.contour.value = 0.5 * (1 - cerca) * smooth(32, 36, t) * (1 - smooth(51, 53, t));
      UC.detail.value = cerca;
      UC.trkOn.value = smooth(51, 54, t) * (1 - smooth(70, 71, t)); UC.scanOn.value = smooth(54, 56, t) * (1 - smooth(69.5, 70.5, t));
      foco = enFoco() ? 1 : 0;
      {
        $hud('alt').textContent = alt > 2 ? fmt(alt, 0) + ' km' : fmt(alt * 1000, 0) + ' m';
        const [la] = latlon(cCrater.position.x, cCrater.position.z); $hud('lat').textContent = fmt(-la, la > -89 ? 1 : 3) + '° S';
      }
      if (est2) est2.position.copy(cCrater.position);
      solF.poner(cCrater.position, UC.sunDir.value, 300);
      if (aL <= 0.5) {                                                           // ¿el relieve tapa el Sol? (se avanza hacia él desde la cámara)
        const sd = UC.sunDir.value, shl = Math.hypot(sd.x, sd.z), tE = sd.y / shl, c = cCrater.position; let tapado = false;
        for (const tk of [0.01, 0.03, 0.08, 0.2, 0.5, 1.2, 3, 7, 16, 35, 80, 170]) { if (hAll(c.x + sd.x / shl * tk, c.z + sd.z / shl * tk) > c.y + tE * tk) { tapado = true; break; } }
        tmp.copy(c).addScaledVector(sd, 300).project(cCrater); solNdc.set(tmp.x, tmp.y);
        solVis = !tapado && tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15 ? aF : 0;
      }
      // la estación y la colonia, al Sol de la simulación
      luzSol.position.copy(estG.position).addScaledVector(SOL_F, 1); luzSol.target.position.copy(estG.position);
    }

    // ---- rover y faros ----
    const verRover = roverListo && B && aF > 0.5 && dCam < 4;
    roverG.visible = verRover; brillos.forEach((s) => { s.visible = verRover && lamp.on > 0.05; });
    const verSuelo = !!DET.mesh && aF > 0.5 && Math.min(dCam, alt) < 0.25;
    if (DET.mesh) {
      DET.mesh.visible = DET.ov.visible = verSuelo; (DET.rocas || []).forEach((m) => { m.visible = verSuelo; });
      (DET.huellas || []).forEach((h) => {
        h.m.visible = verSuelo && UC.trkOn.value > 0.01;
        const dR = roverPos.distanceTo(B.lejos) - 0.0011;                          // hasta las ruedas traseras
        h.m.geometry.setDrawRange(0, Math.max(0, Math.min(h.n - 1, Math.floor((dR - h.d0) / h.paso))) * 6);
      });
    }
    estG.visible = colG.visible = !!B && aF > 0.5 && aDEM > 0.5;
    lamp.on += (foco - lamp.on) * (1 - Math.exp(-dtr * 4));
    if (B) {
      luzPared.position.copy(roverPos).add(v3.set(-Math.cos(B.rumbo) * 0.5, 0.25, -Math.sin(B.rumbo) * 0.5)); luzPared.target.position.copy(roverPos);
      luzParedS.position.copy(luzPared.position); luzParedS.target.position.copy(roverPos);
      if (lamp.on > 0.01) {
        if (!lamp.tgt || ((!lamp.manual || now - lamp.ultimo > 3500) && !reduce)) lamp.tgt = barrido(reduce ? 0 : t);
        const k = 1 - Math.exp(-dtr * 6), cur = UC.lampHit.value;
        if (cur.x > 999) cur.set(lamp.tgt.x, lamp.tgt.z); else cur.set(cur.x + (lamp.tgt.x - cur.x) * k, cur.y + (lamp.tgt.z - cur.y) * k);
        const hit = new THREE.Vector3(cur.x, hF(cur.x, cur.y), cur.y);
        // el rover mira hacia donde ilumina (como mucho 30° fuera de su rumbo de marcha)
        let yObj = Math.atan2(hit.z - roverPos.z, hit.x - roverPos.x), da = Math.atan2(Math.sin(yObj - B.rumbo), Math.cos(yObj - B.rumbo));
        yObj = B.rumbo + clamp(da, -30 * DEG, 30 * DEG);
        const dy = Math.atan2(Math.sin(yObj - roverYaw), Math.cos(yObj - roverYaw)); roverYaw += dy * (1 - Math.exp(-dtr * 2.5));
        lampMov = Math.abs(lamp.tgt.x - cur.x) + Math.abs(lamp.tgt.z - cur.y) > 0.00002 || Math.abs(dy) > 0.002;
        colocarRover(t); roverG.updateMatrixWorld(true);
        if (faros.length) { faroP.set(0, 0, 0); faros.forEach((f, i) => { f.getWorldPosition(v3); faroP.add(v3); brillos[i].position.set(v3.x + Math.cos(roverYaw) * 0.00015, v3.y, v3.z + Math.sin(roverYaw) * 0.00015); }); faroP.multiplyScalar(1 / faros.length); }
        else faroP.set(roverPos.x + Math.cos(roverYaw) * 0.0012, roverPos.y + 0.0009, roverPos.z + Math.sin(roverYaw) * 0.0012);
        brillos.forEach((s) => { s.material.opacity = lamp.on; s.scale.setScalar(clamp(dCam * 0.03, 0.0006, 0.05)); });
        UC.lampPos.value.copy(faroP); UC.lampDir.value.copy(hit).sub(faroP).normalize(); UC.lampOn.value = lamp.on;
        // el foco de los faros (con sombras de las rocas) y su destello hacia la cámara
        focoFaros.visible = verSuelo; focoFaros.intensity = 9 * lamp.on; focoFaros.position.copy(faroP); focoFaros.target.position.copy(hit); focoFaros.target.updateMatrixWorld();
        const adel = v3.set(Math.cos(roverYaw), 0, Math.sin(roverYaw)), aCam = v4.copy(cCrater.position).sub(faroP).normalize();
        const fr = Math.pow(Math.max(0, adel.dot(aCam)), 5) * lamp.on;
        destello.visible = rayaFaro.visible = verRover && lamp.on > 0.05;
        destello.position.copy(faroP).addScaledVector(adel, 0.0003); rayaFaro.position.copy(destello.position);
        destello.scale.setScalar(0.0012 + fr * dCam * 0.2); destello.material.opacity = lamp.on * (0.25 + 0.75 * fr);
        rayaFaro.scale.set(0.002 + fr * dCam * 1.1, 0.0002 + fr * dCam * 0.014, 1); rayaFaro.material.opacity = 0.85 * fr;
        leerPunto(hit);
        const [px, py] = proy(hit, cCrater);
        ret.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
      } else { UC.lampOn.value = 0; roverYaw = B.rumbo; colocarRover(t); lampMov = false; focoFaros.visible = false; destello.visible = rayaFaro.visible = false; }
    }
    ret.classList.toggle('is-on', lamp.on > 0.5 && t < CAPS[4][1]);
    lienzo.tabIndex = foco ? 0 : -1;

    // ---- leyenda, marcas y etiquetas ----
    ley.classList.toggle('is-sol', !!D && t >= SOL0 - 0.5 && t < SOL1 + 0.5);
    ley.classList.toggle('is-psr', !!D && t >= 38 && t < 51);
    ley.classList.toggle('is-rover', verRover && t >= 55 && t < CAPS[4][1]);
    const verMarcas = D && aF > 0.9 && aDEM > 0.9 && t >= 39 && t < 50.5;
    botones.forEach((o) => {
      const [x, y, ok] = proy(D[o.p.k], cCrater); o.x = x; o.y = y;
      const on = verMarcas && ok && x > 20 && x < W - 20 && y > 80 && y < Hh - 70;
      o.b.style.left = x + 'px'; o.b.style.top = y + 'px'; o.b.classList.toggle('is-on', on); o.b.tabIndex = on ? 0 : -1;
    });
    if (D) {
      const lv = aF > 0.9 && UC.latOn.value > 0.5;
      [15.16, 7.58].forEach((rad, i) => {
        const dir = new THREE.Vector3(D.center.x - D.pole.x, 0, D.center.z - D.pole.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9);
        const q = D.pole.clone().addScaledVector(dir, rad); q.y = hAt(q.x, q.z) + 0.05;
        const [x, y, ok] = proy(q, cCrater); latTags[i].style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`;
        latTags[i].classList.toggle('is-on', lv && ok && x > 30 && x < W - 30 && y > 90 && y < Hh - 70);
      });
      // etiquetas del mosaico: el paralelo 85° S de su cuadrícula (152 km del polo) y Shackleton
      const verMapa = aF > 0.6 && aDEM < 0.5 && t > T_POLO && t < 30.6;
      [[v3.set(polo.x + 151.7 * 0.707, 0, polo.z - 151.7 * 0.707), alt > 200], [v4.set(D.center.x, 0, D.center.z), alt < 260]].forEach(([v, on], i) => {
        const [x, y, ok] = proy(v, cCrater); mapTags[i].style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`;
        mapTags[i].classList.toggle('is-on', verMapa && on && ok && x > 30 && x < W - 60 && y > 100 && y < Hh - 70);
      });
    }

    // ---- cifras ancladas, frases de tráiler ----
    anclarCifras(t); frases(t);

    // ---- destellos de lente, salto y dibujo con el postprocesado ----
    lente(solNdc.x, solNdc.y, solVis, dtr || 0.016); solVis = 0;
    const la = Math.log(Math.max(alt, 0.001)), vz = corre && dtr > 0 ? Math.abs(la - altPrev) / dtr : 0; altPrev = la;
    saltoS += ((vz > 25 ? 0 : smooth(0.35, 1.5, vz)) - saltoS) * (1 - Math.exp(-(dtr || 0.016) * 6));
    grade.uniforms.salto.value = reduce ? 0 : saltoS * 0.9; grade.uniforms.t.value = now / 1000; grade.uniforms.centro.value.set(0.5 + sx, 0.5 + sy);
    DR.aL = aL; DR.aF = aF;
    composer.render(dtr);

    const sigue = corre || lampMov || parMueve() || saltoS > 0.01 || Math.abs(lamp.on - foco) > 0.01 || (lamp.on > 0.01 && !reduce && vid.enVista);
    if (sigue) pedir();
  }
  // acceso para pruebas y para el presentador desde la consola: document.getElementById('reto').reto.ir(segundos)
  sec.reto = { ir: (s) => { vid.t = clamp(s, 0, LOOP - 0.001); pedir(); }, get t() { return vid.t; } };
  layout(); activarCap(capDe(vid.t));
})();
