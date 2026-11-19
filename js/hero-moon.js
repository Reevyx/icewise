/* =========================================================================
   ICEWISE — Portada: la Luna en 3D
   -------------------------------------------------------------------------
   · Superficie real: mapa de color LROC y relieve LOLA (NASA SVS 4720, CGI Moon Kit, dominio público).
   · Estrellas reales: las más brillantes del catálogo de la simulación (assets/sky/estrellas.js).
   · El brillo azul del borde es estético (la Luna no tiene atmósfera).
   · Lo que da sentido a la escena (con leyenda en pantalla):
       - hielo APROXIMADO: brillo azul en los fondos oscuros del polo sur (sombra permanente), no es un mapa medido;
       - LRO, la sonda de la NASA que hizo estos mapas, en su órbita polar (altura y velocidad exageradas);
       - la Tierra al fondo (NASA Blue Marble, assets/sky/), iluminada por el mismo Sol; no a escala ni a su distancia;
       - el velo difuso de la Vía Láctea (NASA SVS 4851) alineado con las estrellas; su tono azul es estético.
   · Interacción (principios de Apple «Designing Fluid Interfaces»):
       - arrastrar gira la Luna 1:1 bajo el dedo; al soltar conserva la velocidad (inercia) y vuelve
         sola a su giro lento; la inclinación tiene límites elásticos (rubber-band);
       - al bajar por la página la cámara se acerca y se inclina hacia el polo sur, donde está Shackleton;
       - todo el movimiento usa muelles críticamente amortiguados y se puede interrumpir en cualquier momento;
       - con «reducir movimiento» no hay giro automático ni animación de entrada.
   · Solo dibuja mientras la portada se ve; si no hay WebGL se muestra la foto de Artemis II.
   ========================================================================= */
(function () {
  'use strict';
  const hero = document.getElementById('inicio');
  const host = document.getElementById('hero-moon');
  if (!hero || !host) return;
  const T = window.L || ((es) => es);
  const fail = () => hero.classList.add('hero--nomoon');
  if (!window.THREE) { fail(); return; }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const DEG = Math.PI / 180;
  const SHACK = { lat: -89.67, lon: 129.78 };         // borde del cráter Shackleton

  // ---------- Muelle (respuesta en segundos, amortiguamiento 1 = sin rebote) ----------
  function spring(x, response = 0.5, damping = 1) {
    const s = { x, v: 0, t: x, response, damping };
    s.step = (dt) => {
      const w = 2 * Math.PI / s.response, a = -w * w * (s.x - s.t) - 2 * s.damping * w * s.v;
      s.v += a * dt; s.x += s.v * dt;
      return s.x;
    };
    return s;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail(); return; }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement; canvas.className = 'moon-canvas'; canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(0, 0, 4.3);

  // ---------- Luna ----------
  const tilt = new THREE.Group(), spin = new THREE.Group(), anchor = new THREE.Group();
  anchor.add(tilt); tilt.add(spin); scene.add(anchor);
  // Material lunar propio. El regolito no se ve como una bola de plástico: sigue la ley de Lommel-Seeliger
  // (por eso la Luna llena parece un disco plano, sin oscurecerse en el borde). El relieve real (LOLA) marca los
  // cráteres junto a la línea de sombra, y la cara oscura recibe la débil luz cenicienta que refleja la Tierra.
  const mat = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      map: { value: null }, normalMap: { value: null }, hasMaps: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.6, 0.2, 0.77) },   // dirección hacia el Sol, en coordenadas de cámara
      sunColor: { value: new THREE.Color(1.0, 0.965, 0.92) },
      exposure: { value: 1.5 }, relief: { value: 1.15 },
      iceAmt: { value: 0 }, time: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vV; varying float vLat;
      void main() {
        vUv = uv;
        vec3 n = normalize(position); vLat = n.y;              // seno de la latitud (y = eje de los polos)
        vec3 east = vec3(n.z, 0.0, -n.x);                     // dirección en la que crece la longitud (eje u de la textura)
        float le = length(east); east = le > 1e-4 ? east / le : vec3(1.0, 0.0, 0.0);
        vN = normalize(normalMatrix * n); vT = normalize(normalMatrix * east);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform sampler2D normalMap; uniform float hasMaps;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float exposure; uniform float relief; uniform float iceAmt; uniform float time;
      varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vV; varying float vLat;
      vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main() {
        vec3 n = normalize(vN), t = normalize(vT - n * dot(vT, n)), b = cross(n, t);
        vec3 alb = vec3(0.55);
        vec3 N = n;
        if (hasMaps > 0.5) {
          alb = toLinear(texture2D(map, vUv).rgb);
          vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0; tn.xy *= relief;
          N = normalize(t * tn.x + b * tn.y + n * tn.z);
        }
        vec3 L = normalize(sunDir), V = normalize(vV);
        float mu0 = max(dot(N, L), 0.0), mu = max(dot(n, V), 0.05);
        float ls = mu0 / (mu0 + mu);                          // Lommel-Seeliger
        float nl = dot(n, L);
        float day = smoothstep(-0.22, 0.28, nl);               // paso gradual del día a la noche: sin «pintura negra»
        float lit = mix(ls * 2.0, mu0, 0.32) * day;            // un poco de Lambert para que el relieve se lea
        float wrapL = max(0.0, (dot(N, L) + 0.45) / 1.45);     // luz rasante envolvente: el relieve sigue leyéndose junto a la sombra
        lit += wrapL * wrapL * 0.16 * (1.0 - day * 0.6);
        float g = acos(clamp(dot(L, V), -1.0, 1.0));
        float surge = 1.0 + 0.35 * exp(-g * 6.0);              // leve oposición: más brillo cuando el Sol está detrás del observador
        vec3 col = alb * sunColor * lit * surge * exposure;
        float night = 1.0 - smoothstep(-0.3, 0.2, nl);
        float eN = max(dot(N, V), 0.0);
        col += alb * vec3(0.52, 0.62, 0.9) * (0.035 + 0.05 * eN) * night;   // luz cenicienta: la Tierra ilumina la cara nocturna
        // Hielo (APROXIMADO): cerca del polo sur, los fondos de cráter más oscuros del mosaico, que son las zonas en
        // sombra permanente donde puede haber hielo, se marcan con un brillo azul que late despacio. Es un recurso
        // visual, no un mapa de hielo medido.
        float pole = smoothstep(-0.966, -0.995, vLat);         // de ~75° S hacia el polo
        float lum = dot(alb, vec3(0.3, 0.59, 0.11));
        float dark = 0.25 + 0.75 * (1.0 - smoothstep(0.03, 0.2, lum));   // más en los fondos oscuros de cráter
        float ice = pole * dark * iceAmt * (0.78 + 0.22 * sin(time * 1.4 + vUv.x * 420.0 + vUv.y * 260.0));
        col += vec3(0.22, 0.38, 1.0) * ice * 1.1;
        col = aces(col);
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
      }`
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 144), mat);
  moon.rotation.y = -Math.PI / 2;                     // longitud 0 (cara visible) mirando a la cámara
  spin.add(moon);


  // Marcador de Shackleton (hijo de la Luna: gira con ella)
  const lat = SHACK.lat * DEG, phi = (SHACK.lon + 180) / 360 * 2 * Math.PI;
  const pinLocal = new THREE.Vector3(-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)).multiplyScalar(1.002);
  const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8fa0ff }));
  pinDot.position.copy(pinLocal); moon.add(pinDot);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 48), new THREE.MeshBasicMaterial({ color: 0x5266eb, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.copy(pinLocal); ring.lookAt(pinLocal.clone().multiplyScalar(2)); moon.add(ring);

  const pin = document.createElement('button');
  pin.type = 'button'; pin.className = 'moon-pin';
  pin.innerHTML = `<span class="mp-dot" aria-hidden="true"></span><span class="mp-t">Shackleton · ICEWISE</span><span class="mp-s">${T('89,7° S · polo sur', '89.7° S · south pole')}</span><span class="mp-s mp-ice">${T('En azul: sombra permanente, donde puede haber hielo (aprox.)', 'In blue: permanent shadow, where there may be ice (approx.)')}</span>`;
  pin.setAttribute('aria-label', T('Ir a la ubicación: cráter Shackleton', 'Go to the location: Shackleton crater'));
  pin.addEventListener('click', () => document.getElementById('ubicacion')?.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' }));
  host.appendChild(pin);

  // ---------- LRO en su órbita polar (de esta sonda salen los mapas de la Luna y del polo sur) ----------
  // Órbita polar real; la altura (~200 km) y la velocidad están exageradas para que se vea (el periodo real es de ~2 h).
  // La órbita no gira con la Luna (está fija en el espacio) pero sí se inclina con ella.
  const orbit = new THREE.Group(); orbit.rotation.y = 0.62; orbit.rotation.z = 0.08; tilt.add(orbit);
  const OR = 1.12, ON = 256, oPos = new Float32Array(ON * 3), oU = new Float32Array(ON);
  for (let i = 0; i < ON; i++) { const a = i / ON * Math.PI * 2; oPos.set([Math.cos(a) * OR, Math.sin(a) * OR, 0], i * 3); oU[i] = i / ON; }
  const oGeo = new THREE.BufferGeometry(); oGeo.setAttribute('position', new THREE.BufferAttribute(oPos, 3)); oGeo.setAttribute('u', new THREE.BufferAttribute(oU, 1));
  const oMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { head: { value: 0 }, fade: { value: 0 } },
    vertexShader: 'attribute float u; varying float vU; void main(){ vU = u; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float head; uniform float fade; varying float vU; void main(){ float d = fract(head - vU); float a = 0.07 + 0.85 * pow(1.0 - d, 10.0); gl_FragColor = vec4(vec3(0.62, 0.69, 1.0) * a * fade, 1.0); }'
  });
  orbit.add(new THREE.LineLoop(oGeo, oMat));
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe4e8ff, transparent: true, opacity: 0 }));
  orbit.add(sat);
  const satTag = document.createElement('span'); satTag.className = 'moon-sat'; satTag.setAttribute('aria-hidden', 'true'); satTag.textContent = 'LRO';
  host.appendChild(satTag);

  // ---------- La Tierra al fondo (NASA Blue Marble), con la misma luz del Sol. No está a escala ni a su distancia real ----------
  const earthMat = new THREE.ShaderMaterial({
    toneMapped: false, transparent: true,
    uniforms: { map: { value: null }, sunW: { value: new THREE.Vector3(1, 0, 0) }, fade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vNw; varying vec3 vVw; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vNw = normalize(mat3(modelMatrix) * position); vVw = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform vec3 sunW; uniform float fade; varying vec2 vUv; varying vec3 vNw; varying vec3 vVw;
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main(){
        vec3 n = normalize(vNw), V = normalize(vVw), L = normalize(sunW);
        float nl = dot(n, L), day = smoothstep(-0.08, 0.3, nl);
        vec3 alb = pow(texture2D(map, vUv).rgb, vec3(2.2));
        vec3 col = alb * day * 1.9;
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);                 // atmósfera (la Tierra sí la tiene)
        col += vec3(0.28, 0.52, 1.0) * rim * (0.15 + 1.2 * smoothstep(-0.35, 0.45, nl));
        col = aces(col);
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), fade);
      }`
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.3, 64, 48), earthMat);
  earth.rotation.z = 23.4 * DEG; earth.visible = false; scene.add(earth);

  // ---------- Velo de la Vía Láctea: brillo difuso real (NASA SVS 4851) en la misma orientación que las estrellas ----------
  // El tono azulado es estético.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    uniforms: { fondo: { value: null }, fade: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D fondo; uniform float fade; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); vec3 e = vec3(d.x, d.z, d.y);           // a coordenadas ecuatoriales (como las estrellas)
        float ra = atan(e.y, e.x), dec = asin(clamp(e.z, -1.0, 1.0));
        vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
        float b = texture2D(fondo, uv).r;
        gl_FragColor = vec4(vec3(0.30, 0.38, 0.95) * b * b * 0.42 * fade, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), skyMat); sky.renderOrder = -2; scene.add(sky);

  // ---------- Etiquetas pegadas a cada objeto (qué significa lo que se ve) ----------
  satTag.title = T('LRO, la sonda de la NASA que hizo estos mapas (órbita acelerada)', 'LRO, the NASA probe that made these maps (orbit sped up)');
  const earthTag = document.createElement('span'); earthTag.className = 'moon-sat moon-earth-tag'; earthTag.setAttribute('aria-hidden', 'true');
  earthTag.textContent = T('Tierra · no a escala', 'Earth · not to scale');
  host.appendChild(earthTag);

  // ---------- Luz: el Sol entra rasante y «amanece» sobre la Luna al abrir ----------
  // Fase final: gibosa, con la línea de sombra a la izquierda, donde el relieve de los cráteres se ve mejor
  const SUN_END = 0.82;
  const sunAng = spring(reduce.matches ? SUN_END : 2.75, 2.6, 1);
  sunAng.t = SUN_END;
  const sunW = new THREE.Vector3();

  // ---------- Estrellas reales ----------
  // Las mismas 62 000 estrellas y el mismo dibujo que el cielo de la simulación (js/sim-env.js, «cielo de larga
  // exposición»): brillo según su puesto en el catálogo, color real en las brillantes, picos de difracción en las 25
  // más brillantes y un halo suave en las 250 siguientes.
  (function stars() {
    const S = window.ICE_STARS; if (!S) return;
    const bin = atob(S.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const GAIA0 = 26000; let relG = 1;
    const q = new Uint16Array(u8.buffer), n = S.n, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), brt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = q[i * 6] / 65535 * 2 * Math.PI, dec = (q[i * 6 + 1] / 65535 - 0.5) * Math.PI, R = 60;
      pos.set([Math.cos(dec) * Math.cos(ra) * R, Math.sin(dec) * R, Math.cos(dec) * Math.sin(ra) * R], i * 3);
      const rel = Math.pow(10, q[i * 6 + 2] / 65535 * 7 - 7); if (i === GAIA0) relG = rel;
      const rk = i + 1, I = i < GAIA0 ? 0.13 + 4.8 * Math.pow(rk, -0.42) : 0.05 + 0.3 * Math.sqrt(rel / relG);
      const r = q[i * 6 + 3] / 65535, g = q[i * 6 + 4] / 65535, b = q[i * 6 + 5] / 65535, m = (r + g + b) / 3, sat = rk < 3000 ? 1.5 : 0.15;
      col.set([(m + (r - m) * sat) * I, (m + (g - m) * sat) * I, (m + (b - m) * sat) * I], i * 3);
      const big = rk <= 25, mid = !big && rk <= 250;
      size[i] = big ? 14 + 30 * Math.pow(rk, -0.45) : mid ? 4 + 5 * Math.pow(rk / 25, -0.5) : 1.6 + 3.0 * Math.pow(rk, -0.22); brt[i] = big ? 1 : mid ? 0.5 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('bright', new THREE.BufferAttribute(brt, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { pr: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float size; attribute float bright; uniform float pr; varying vec3 vC; varying float vB;
        void main(){ float s = size * pr, ps = max(s, 3.0);
          vC = color * (bright > 0.25 ? 1.0 : s / ps); vB = bright;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = ps; }`,
      fragmentShader: `varying vec3 vC; varying float vB;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
          float big = step(0.75, vB), mid = step(0.25, vB) * (1.0 - big);
          float core = big > 0.5 ? exp(-d * d * 420.0) * 2.2 + 0.2 * exp(-d * d * 40.0)
                     : mid > 0.5 ? exp(-d * d * 300.0) * 2.0 + 0.06 * exp(-d * d * 40.0) : exp(-d * d * 16.0);
          float sp = big * (exp(-abs(p.x) * 90.0) * exp(-abs(p.y) * 6.0) + exp(-abs(p.y) * 90.0) * exp(-abs(p.x) * 6.0)) * 0.8;
          gl_FragColor = vec4(vC * (core + sp), 1.0); }`
    }));
    pts.renderOrder = -1; pts.frustumCulled = false; scene.add(pts); scene.userData.stars = pts;
  })();

  // ---------- Texturas (2K primero; 4K en pantallas grandes) ----------
  const base = (document.currentScript && document.currentScript.src) ? new URL('../assets/img/luna/', document.currentScript.src).href : 'assets/img/luna/';
  const local = window.ICE_MOON_LOCAL;                // file:// (doble clic): texturas incrustadas en base64
  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((ok, ko) => loader.load(url, ok, undefined, ko));
  const prep = (t, srgb) => { if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
  Promise.all([load(local ? local.color : base + 'luna-color-2k.jpg'), load(local ? local.normal : base + 'luna-normal-2k.jpg')]).then(([c, n]) => {
    mat.uniforms.map.value = prep(c, false); mat.uniforms.normalMap.value = prep(n, false); mat.uniforms.hasMaps.value = 1;
    ready();
    const big = Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) > 1400;
    if (big && !local) load(base + 'luna-color-4k.jpg').then(t => { mat.uniforms.map.value = prep(t, false); }).catch(() => {});
    if (!local) {                                       // la Tierra y el velo del cielo llegan después (no retrasan la Luna)
      load(base + 'tierra-1k.jpg').then(t => { earthMat.uniforms.map.value = prep(t, false); earthOK = true; layout(); }).catch(() => {});
      const skyBase = new URL('../../sky/', base).href;
      load(skyBase + 'cielo_fondo_1k.png').then(t => { skyMat.uniforms.fondo.value = t; skyOK = true; requestDraw(); }).catch(() => {});
    }
  }).catch(fail);
  let earthOK = false, skyOK = false;

  // ---------- Estado del movimiento ----------
  const IDLE = 0.055;                                  // giro lento (rad/s)
  const pitch = spring(-0.32, 0.55, 1), zoom = spring(4.6, 0.6, 1), shiftX = spring(0, 0.6, 1);
  const parX = spring(0, 0.9, 1), parY = spring(0, 0.9, 1), appear = spring(reduce.matches ? 1 : 0.86, 0.9, 0.82);
  let yaw = 0.35, yawVel = reduce.matches ? 0 : IDLE, scrollP = 0, isReady = false;

  const extras = spring(0, 1.4, 1);                    // la órbita, la Tierra, el cielo y el hielo aparecen tras la Luna
  function ready() {
    isReady = true; hero.classList.add('hero--moon');
    appear.t = 1; extras.t = 1; if (reduce.matches) extras.x = 1;
    requestDraw();
  }

  // ---------- Tamaño y encuadre ----------
  let W = 1, H = 1, R_px = 1;
  function layout() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    // Escritorio: la Luna a la derecha del texto. Pantallas estrechas: centrada y más arriba, siempre entera.
    const wide = W > 900, aspect = W / H, t15 = Math.tan(15 * DEG);
    baseZ = Math.max(wide ? 5 : 4.6, 1.18 / (t15 * Math.min(aspect, 1.6)));
    shiftX.t = wide ? 0.86 : 0; shiftY = wide ? 0 : 0.42 * baseZ / 4.6;
    if (!started) { shiftX.x = shiftX.t; zoom.x = baseZ; }
    // la Tierra, arriba a la derecha y lejos (solo en pantallas anchas, donde no tapa nada)
    earth.visible = wide && earthOK;
    if (earth.visible) { const d = baseZ + 9; earth.position.set(0.78 * d * t15 * aspect, 0.6 * d * t15, -9); }
    onScroll();
    requestDraw();
  }
  let started = false, baseZ = 4.6, shiftY = 0;
  new ResizeObserver(layout).observe(host);

  // ---------- Arrastrar para girar (1:1, con inercia y límites elásticos) ----------
  const drag = { on: false, id: null, x: 0, y: 0, hist: [], moved: false };
  const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
  const PMIN = -1.45, PMAX = 0.35;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.on = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.hist = [{ x: e.clientX, y: e.clientY, t: performance.now() }]; drag.moved = false;
    canvas.setPointerCapture(e.pointerId); hero.classList.add('is-grabbing', 'hero--touched');
    yawVel = 0; pitch.v = 0;                          // atrapar la Luna en movimiento: se detiene bajo el dedo
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.on) {                                    // paralaje suave al mover el ratón por la portada
      if (e.pointerType === 'mouse') { parX.t = (e.clientX / innerWidth - 0.5) * 0.12; parY.t = (e.clientY / innerHeight - 0.5) * 0.08; requestDraw(); }
      return;
    }
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    yaw += dx / R_px;                                  // el punto bajo el dedo lo sigue
    const raw = pitch.x + dy / R_px, base0 = Math.min(PMAX, Math.max(PMIN, raw));
    pitch.x = base0 + rubber(raw - base0, 1);          // resistencia progresiva fuera de los límites
    pitch.v = 0;
    drag.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (drag.hist.length > 6) drag.hist.shift();
    requestDraw();
  });
  const release = (e) => {
    if (!drag.on || e.pointerId !== drag.id) return;
    drag.on = false; hero.classList.remove('is-grabbing');
    const h = drag.hist, a = h[0], b = h[h.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
    const fresh = performance.now() - b.t < 80;        // si el dedo se quedó quieto antes de soltar, no hay lanzamiento
    yawVel = fresh ? (b.x - a.x) / dt / R_px : 0;      // la inercia continúa a la velocidad del dedo
    pitch.v = fresh ? (b.y - a.y) / dt / R_px : 0;
    pitch.damping = 0.8;                               // vuelve con un leve rebote: el gesto tuvo impulso
    requestDraw();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!drag.on) { parX.t = 0; parY.t = 0; } });

  // ---------- Desplazamiento: la cámara se acerca al polo sur ----------
  function onScroll() {
    const h = hero.offsetHeight || 1;
    scrollP = Math.min(1, Math.max(0, scrollY / (h * 0.85)));
    if (!drag.on) pitch.t = -0.32 - 0.95 * scrollP;
    zoom.t = baseZ - 0.3 * baseZ * scrollP;
    requestDraw();
  }
  addEventListener('scroll', onScroll, { passive: true });

  // ---------- Bucle (solo mientras la portada se ve) ----------
  let visible = true, raf = 0, last = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) requestDraw(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });
  function requestDraw() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const v3 = new THREE.Vector3(), n3 = new THREE.Vector3(), cam3 = new THREE.Vector3();

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; started = true;
    // giro: la inercia decae como un desplazamiento (≈ 0,998 por ms) hasta el giro lento
    const idle = reduce.matches ? 0 : IDLE;
    if (!drag.on) { yawVel = idle + (yawVel - idle) * Math.pow(0.135, dt); yaw += yawVel * dt; }
    if (!drag.on) {
      pitch.step(dt);
      if (Math.abs(pitch.v) < 0.002 && Math.abs(pitch.x - pitch.t) < 0.002) pitch.damping = 1;
    }
    zoom.step(dt); shiftX.step(dt); parX.step(dt); parY.step(dt); appear.step(dt); sunAng.step(dt);

    spin.rotation.y = yaw; tilt.rotation.x = pitch.x;
    anchor.position.x = shiftX.x * (1 - scrollP * 0.55); anchor.position.y = shiftY * (1 - scrollP);
    anchor.scale.setScalar(appear.x);
    camera.position.set(parX.x, -parY.x, zoom.x); camera.lookAt(anchor.position.x * 0.35, anchor.position.y * 0.35, 0);
    const a = sunAng.x;                                                     // el Sol gira alrededor y deja la Luna en fase gibosa
    sunW.set(Math.sin(a) * 0.93, 0.26, Math.cos(a) * 0.93).normalize();
    camera.updateMatrixWorld();
    mat.uniforms.sunDir.value.copy(sunW).transformDirection(camera.matrixWorldInverse);
    if (scene.userData.stars) scene.userData.stars.rotation.y = yaw * 0.04;
    sky.rotation.y = yaw * 0.04;
    // extras: hielo del polo (más intenso al acercarse a Shackleton), órbita de LRO, Tierra y velo del cielo
    extras.step(dt); const ex = Math.max(0, Math.min(1, extras.x));
    mat.uniforms.time.value = now / 1000;
    mat.uniforms.iceAmt.value = ex * (0.55 + 0.75 * scrollP);
    const head = reduce.matches ? 0.3 : (now / 1000 / 26) % 1;           // una vuelta cada 26 s (la real dura ~2 h)
    oMat.uniforms.head.value = head; oMat.uniforms.fade.value = ex;
    sat.position.set(Math.cos(head * Math.PI * 2) * OR, Math.sin(head * Math.PI * 2) * OR, 0); sat.material.opacity = ex;
    skyMat.uniforms.fade.value = skyOK ? ex : 0;
    earthMat.uniforms.fade.value = ex; earthMat.uniforms.sunW.value.copy(sunW);
    if (!reduce.matches) earth.rotation.y += dt * 0.06;
    ring.material.opacity = 0.55 + 0.45 * Math.sin(now / 520);
    ring.scale.setScalar(1 + 0.25 * (0.5 + 0.5 * Math.sin(now / 520)));

    // radio de la Luna en píxeles (para que el arrastre siga al dedo 1:1)
    R_px = (H / 2) / Math.tan(camera.fov * DEG / 2) / Math.max(0.5, zoom.x - 0) * appear.x;

    renderer.render(scene, camera);
    placePin();

    const moving = drag.on || Math.abs(yawVel) > 1e-4 || Math.abs(pitch.v) > 1e-4 || Math.abs(pitch.x - pitch.t) > 1e-4 ||
      Math.abs(zoom.x - zoom.t) > 1e-4 || Math.abs(appear.x - appear.t) > 1e-4 || Math.abs(sunAng.x - sunAng.t) > 1e-4 ||
      Math.abs(parX.x - parX.t) > 1e-4 || Math.abs(parY.x - parY.t) > 1e-4 || Math.abs(shiftX.x - shiftX.t) > 1e-4 || !reduce.matches;
    if (moving) requestDraw();
  }

  function placePin() {
    if (!isReady) { pin.classList.remove('is-on'); return; }
    pinDot.getWorldPosition(v3); n3.copy(v3).sub(anchor.position).normalize(); cam3.copy(camera.position).sub(v3).normalize();
    const facing = n3.dot(cam3);
    v3.project(camera);
    const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
    pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    pin.classList.toggle('is-on', facing > 0.12 && appear.x > 0.97 && y < H - 170 && y > 90);
    // etiqueta de LRO: sigue al punto y se oculta cuando pasa por detrás de la Luna
    sat.getWorldPosition(v3); cam3.copy(camera.position);
    const toSat = v3.clone().sub(cam3), toMoon = anchor.position.clone().sub(cam3);
    const along = toMoon.dot(toSat.clone().normalize());
    const miss = Math.sqrt(Math.max(0, toMoon.lengthSq() - along * along));
    const hidden = toSat.length() > along && miss < appear.x * 1.0;   // detrás del disco lunar
    v3.project(camera);
    const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
    satTag.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    satTag.classList.toggle('is-on', !hidden && extras.x > 0.6 && sy > 70 && sy < H - 60);
    // etiqueta de la Tierra, a su izquierda
    if (earth.visible) {
      v3.copy(earth.position).project(camera);
      const ex2 = (v3.x * 0.5 + 0.5) * W, ey2 = (-v3.y * 0.5 + 0.5) * H;
      earthTag.style.transform = `translate3d(${ex2.toFixed(1)}px, ${ey2.toFixed(1)}px, 0) translate(-100%, 0)`;
    }
    earthTag.classList.toggle('is-on', earth.visible && extras.x > 0.6 && scrollP < 0.5);
  }

  layout(); onScroll(); requestDraw();
})();
