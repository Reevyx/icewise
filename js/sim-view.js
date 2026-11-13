/* =========================================================================
   ICEWISE — Vista 3D (Three.js r128) y panel de control de la simulación
   ========================================================================= */
(function () {
  'use strict';
  const { $, $$, fmt, toast, charts } = Ice;

  let sim, S, P, W;
  let renderer, scene, camera, controls, sun, terrain, fill;
  let iceMesh, detMesh, psrMesh, crystals, detCanvas, detCtx, detTex;
  const R3 = {}, ST = {}, BIO = {}, COL = {};
  let trailGeo, trail, holesGroup, wpMarker, candMarker, locator, pickMarker;
  let warp = 120, camMode = 'rover', visible = true, lastUI = 0, lastTex = 0, lastChart = 0, lastHover = 0, holesDrawn = 0;
  const keys = {}, labels = [];
  const COBALT = 0x5266eb, IVORY = 0xededf3;
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();

  const TASKS = { idle: 'En estación · cargando batería', explore: 'Explorando: busca señal de hielo', goto: 'Va hacia una zona prometedora', characterize: 'Midiendo cuánto hielo hay',
    decide: 'Decidiendo si perforar', drill: 'Perforando', reposition: 'Se mueve unos metros para otra perforación', return: 'Vuelve a la estación', manual: 'Control manual', dead: 'Sin energía: inmovilizado' };

  // =====================================================================
  // TEXTURAS PROCEDURALES
  // =====================================================================
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 4; return t;
  }
  const texRegolith = () => canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = 150 + (Math.random() - 0.5) * 70; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v + 3; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(40,40,46,.35)' : 'rgba(235,235,240,.25)'; const r = Math.random() * 2.2 + 0.4; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
  }, 300);
  const texFoil = () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b9b9c4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '70,70,85'},${0.08 + Math.random() * 0.18})`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40); g.fill(); }
  });
  const texCells = () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c7c9d6'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const gr = g.createLinearGradient(i * s, j * s, (i + 1) * s, (j + 1) * s); gr.addColorStop(0, '#1b2350'); gr.addColorStop(1, '#0d1230'); g.fillStyle = gr; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); g.strokeStyle = 'rgba(200,205,230,.25)'; g.beginPath(); g.moveTo(i * s + s / 2, j * s + 3); g.lineTo(i * s + s / 2, j * s + s - 3); g.stroke(); }
  });

  // =====================================================================
  // GEOMETRÍAS AUXILIARES
  // =====================================================================
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...o });
  function mesh(geo, m, x = 0, y = 0, z = 0, parent) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o; }
  const box = (w, h, d, m, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);
  const cyl = (rt, rb, h, m, x, y, z, p, seg = 20) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, p);
  function roundedBox(w, h, d, r, m) {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0);
    return mesh(g, m);
  }
  function dish(r, depth, m) {
    const pts = []; for (let i = 0; i <= 12; i++) { const x = r * i / 12; pts.push(new THREE.Vector2(x, depth * (x / r) ** 2)); }
    const o = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), m); o.castShadow = true; m.side = THREE.DoubleSide; return o;
  }
  function strut(a, b, r, m, parent) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, 8); g.translate(0, len / 2, 0);
    const o = mesh(g, m, a.x, a.y, a.z, parent); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
  }

  // =====================================================================
  // ESCENA
  // =====================================================================
  function buildScene(host) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05050a);
    camera = new THREE.PerspectiveCamera(46, 1, 0.3, 20000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.49, minDistance: 3.5, maxDistance: W.SIZE * 2 });

    const sd = W.sunDir;
    sun = new THREE.DirectionalLight(0xfff6ec, 2.8);
    sun.position.set(sd.x * W.SIZE, sd.y * W.SIZE, sd.z * W.SIZE);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const SC = W.HALF * 1.5; Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 10, far: W.SIZE * 3 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target, new THREE.AmbientLight(0x8a90b8, 0.26));
    fill = new THREE.DirectionalLight(0xdfe3f0, 0.55); fill.position.set(-W.SIZE * 0.3, W.SIZE, W.SIZE * 0.2); scene.add(fill);   // luz de apoyo (no realista)

    // Terreno con textura de regolito
    const geo = new THREE.PlaneGeometry(W.SIZE, W.SIZE, W.N - 1, W.N - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      pos.setY(k, W.H[k]);
      const x = pos.getX(k), z = pos.getZ(k);
      const g = 0.6 + (Math.random() - 0.5) * 0.06;
      col[k * 3] = g; col[k * 3 + 1] = g; col[k * 3 + 2] = g * 1.02;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    terrain = mesh(geo, new THREE.MeshStandardMaterial({ map: texRegolith(), vertexColors: true, roughness: 0.98, metalness: 0 }));
    scene.add(terrain);

    // Capas sobre el terreno
    const overlay = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const iceTex = gridTex(320, (x, z) => {
      const w = W.iceWt(x, z); if (w < 0.3) return null;
      const a = Math.min(1, w / 9);
      return [Math.round(80 + 70 * a), Math.round(105 + 70 * a), 255, 0.28 + 0.55 * a];
    });
    iceMesh = new THREE.Mesh(geo, overlay(iceTex)); scene.add(iceMesh);
    psrMesh = new THREE.Mesh(geo, overlay(gridTex(320, (x, z) => W.fracAt(W.psr, x, z) > 0.5 ? [40, 44, 70, 0.45] : null))); psrMesh.visible = false; scene.add(psrMesh);
    detCanvas = document.createElement('canvas'); detCanvas.width = W.KG * 8; detCanvas.height = W.KG * 8; detCtx = detCanvas.getContext('2d');
    detTex = new THREE.CanvasTexture(detCanvas); detTex.anisotropy = 4;
    detMesh = new THREE.Mesh(geo, overlay(detTex)); detMesh.renderOrder = 2; scene.add(detMesh);

    buildCrystals(); buildBoulders(); buildSky();
    buildRover(); buildStation(); buildColony(); buildMarkers(); loadCustomModels();
    addLabel('Estación solar y planta de agua', () => new THREE.Vector3(W.station.x, W.hAt(W.station.x, W.station.z) + 10, W.station.z));
    addLabel('Zona en sombra permanente: aquí está el hielo', () => new THREE.Vector3(W.psrMain.x, W.hAt(W.psrMain.x, W.psrMain.z) + 60, W.psrMain.z), 'ov');
    addLabel('Colonia ICEWISE', () => new THREE.Vector3(W.colony.x, W.hAt(W.colony.x, W.colony.z) + 14, W.colony.z), 'mid');
    if (W.shackleton) {
      const dx = W.shackleton.x, dz = W.shackleton.z, L = Math.hypot(dx, dz), k = W.HALF * 0.93 / Math.max(Math.abs(dx), Math.abs(dz));
      const px = dx * k, pz = dz * k;
      addLabel(`→ Centro del cráter Shackleton (a ${Math.round(L / 1000)} km)`, () => new THREE.Vector3(px, W.hAt(px, pz) + 80, pz), 'ov');
    }
    addLabel('Rover', () => new THREE.Vector3(S.rover.x, W.hAt(S.rover.x, S.rover.z) + 4.2, S.rover.z), 'rover');
  }

  function gridTex(res, fn) {
    const c = document.createElement('canvas'); c.width = res; c.height = res; const g = c.getContext('2d'), img = g.createImageData(res, res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const v = fn(-W.HALF + (i + 0.5) * W.SIZE / res, -W.HALF + (j + 0.5) * W.SIZE / res); if (!v) continue;
      const k = (j * res + i) * 4; img.data[k] = v[0]; img.data[k + 1] = v[1]; img.data[k + 2] = v[2]; img.data[k + 3] = v[3] * 255;
    }
    g.putImageData(img, 0, 0); return new THREE.CanvasTexture(c);
  }

  // Cristales de hielo: visualización de dónde hay hielo bajo el suelo (densidad ∝ concentración)
  function buildCrystals() {
    const geo = new THREE.OctahedronGeometry(0.13, 0); geo.scale(1, 1.7, 1);
    const m = new THREE.MeshStandardMaterial({ color: 0xe4eaff, emissive: COBALT, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
    crystals = new THREE.InstancedMesh(geo, m, 24000);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 600000 && n < 24000; i++) {
      const x = (Math.random() - 0.5) * W.SIZE * 0.98, z = (Math.random() - 0.5) * W.SIZE * 0.98, w = W.iceWt(x, z);
      if (w < 0.8 || Math.random() > w / 11) continue;
      const k = 0.7 + Math.random() * 1.1 + w / 8;
      p.set(x, W.hAt(x, z) + 0.05 * k, z); e.set(Math.random() * 0.6, Math.random() * 6.3, Math.random() * 0.6); q.setFromEuler(e); s.setScalar(k);
      m4.compose(p, q, s); crystals.setMatrixAt(n++, m4);
    }
    crystals.count = n; crystals.castShadow = false; scene.add(crystals);
  }

  function buildBoulders() {
    const geo = new THREE.IcosahedronGeometry(1, 1), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), f = 1 + 0.28 * Math.sin(3.1 * x) * Math.cos(2.7 * y) * Math.sin(3.3 * z) + 0.12 * Math.sin(7 * x + 5 * z); pa.setXYZ(i, x * f, y * f, z * f); }
    geo.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8c8c94, roughness: 0.95, flatShading: true }), 2600);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 12000 && n < 2600; i++) {
      const x = (Math.random() - 0.5) * W.SIZE * 0.96, z = (Math.random() - 0.5) * W.SIZE * 0.96;
      if (Math.hypot(x - W.station.x, z - W.station.z) < 25 || W.slopeAt(x, z) > 26) continue;
      const k = Math.pow(Math.random(), 3) * 1.8 + 0.15;
      e.set(Math.random() * 3, Math.random() * 6.3, Math.random() * 3); q.setFromEuler(e); s.set(k * (0.8 + Math.random() * 0.5), k * 0.6, k * (0.8 + Math.random() * 0.5));
      p.set(x, W.hAt(x, z) + k * 0.15, z); m4.compose(p, q, s); rocks.setMatrixAt(n++, m4);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  }

  function buildSky() {
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(2600 * 3);
    for (let i = 0; i < 2600; i++) { const u = Math.random(), a = Math.random() * Math.PI * 2, rr = 14000, el = Math.asin(u); sp.set([rr * Math.cos(el) * Math.cos(a), rr * Math.sin(el) + 40, rr * Math.cos(el) * Math.sin(a)], i * 3); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd0dc, size: 1.3, sizeAttenuation: false })));
    const earth = mesh(new THREE.SphereGeometry(260, 48, 32), new THREE.MeshStandardMaterial({ color: 0x5f78c4, roughness: 0.65 }), 9000, 900, -6000); earth.castShadow = false;
    scene.add(earth);
  }

  // ---------- Rover ----------
  function buildRover() {
    const g = new THREE.Group();
    const hull = std(0xdedee6, { roughness: 0.4, metalness: 0.4 }), foil = std(0xffffff, { map: texFoil(), metalness: 0.75, roughness: 0.38 });
    const dark = std(0x26262f, { roughness: 0.75, metalness: 0.2 }), metal = std(0xa9aab5, { metalness: 0.9, roughness: 0.3 }), glass = std(0x0a0a12, { roughness: 0.05, metalness: 0.6 });
    const cells = std(0xffffff, { map: texCells(), metalness: 0.35, roughness: 0.3 });
    const body = roundedBox(2.1, 0.42, 1.45, 0.16, hull); body.position.y = 0.98; g.add(body);
    const top = roundedBox(1.8, 0.05, 1.22, 0.12, foil); top.position.y = 1.24; g.add(top);
    for (let i = 0; i < 7; i++) box(0.025, 0.14, 0.95, metal, -0.82 + i * 0.07, 1.33, 0.05, g);                      // radiador
    // Paneles solares verticales (laterales y trasero)
    box(1.55, 0.95, 0.04, cells, 0.05, 1.72, 0.74, g); box(0.04, 0.95, 1.25, cells, -1.07, 1.72, 0, g);
    box(1.6, 0.04, 0.05, metal, 0.05, 2.21, 0.74, g);
    // Mástil con cámaras estéreo, LiDAR y baliza
    cyl(0.045, 0.06, 1.15, metal, 0.72, 1.82, -0.42, g);
    box(0.2, 0.12, 0.2, dark, 0.72, 2.42, -0.42, g);
    const head = box(0.22, 0.17, 0.58, hull, 0.76, 2.58, -0.42, g);
    for (const z of [-0.6, -0.24]) { const l = cyl(0.055, 0.055, 0.08, glass, 0.89, 2.58, z, g, 16); l.rotation.z = Math.PI / 2; }
    cyl(0.07, 0.08, 0.1, dark, 0.76, 2.72, -0.42, g, 16);
    const beacon = mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: COBALT }), 0.76, 2.8, -0.42, g);
    // Antena de alta ganancia
    cyl(0.03, 0.03, 0.4, metal, -0.45, 1.45, -0.45, g);
    const hga = dish(0.32, 0.14, std(0xf0f0f4, { metalness: 0.5, roughness: 0.35 })); hga.position.set(-0.45, 1.66, -0.45); hga.rotation.set(-0.5, 0, 0.4); g.add(hga);
    // Barra de luces delantera
    box(0.04, 0.07, 0.9, new THREE.MeshBasicMaterial({ color: 0xf6f7ff }), 1.09, 1.08, 0, g);
    // Ruedas con garras y suspensión
    const wheels = [];
    for (const [x, z] of [[0.86, 0.94], [-0.86, 0.94], [0.86, -0.94], [-0.86, -0.94]]) {
      const holder = new THREE.Group(); holder.position.set(x, 0.4, z); g.add(holder);
      const spin = new THREE.Group(); holder.add(spin);
      const tire = cyl(0.4, 0.4, 0.3, dark, 0, 0, 0, spin, 32); tire.rotation.x = Math.PI / 2;
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; const gr = box(0.06, 0.05, 0.31, metal, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, spin); gr.rotation.z = a; }
      const hub = cyl(0.15, 0.15, 0.34, metal, 0, 0, 0, spin, 16); hub.rotation.x = Math.PI / 2;
      wheels.push(spin);
      strut(new THREE.Vector3(x * 0.55, 0.85, z * 0.72), new THREE.Vector3(x, 0.4, z * 0.82), 0.045, metal, g);
    }
    box(1.9, 0.07, 0.07, metal, 0, 0.72, 0.8, g); box(1.9, 0.07, 0.07, metal, 0, 0.72, -0.8, g);
    // Taladro: guías, carro y barrena helicoidal
    box(0.04, 1.5, 0.04, metal, 1.22, 1.05, 0.13, g); box(0.04, 1.5, 0.04, metal, 1.22, 1.05, -0.13, g); box(0.12, 0.06, 0.34, hull, 1.22, 1.8, 0, g);
    const carriage = box(0.2, 0.22, 0.24, dark, 1.22, 1.6, 0, g);
    const auger = new THREE.Group(); auger.position.set(1.22, 0.3, 0); g.add(auger);
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push(new THREE.Vector3(Math.cos(t * 28) * 0.045, t * 1.5, Math.sin(t * 28) * 0.045)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.012, 6), metal, 0, 0, 0, auger);
    cyl(0.025, 0.025, 1.5, metal, 0, 0.75, 0, auger, 8);
    mesh(new THREE.ConeGeometry(0.05, 0.1, 10), metal, 0, -0.05, 0, auger).rotation.x = Math.PI;
    // Carrusel de cartuchos de muestra
    const cart = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cart.push(cyl(0.05, 0.05, 0.2, std(0x50505c), -0.55 + Math.cos(a) * 0.14, 1.36, -0.2 + Math.sin(a) * 0.14, g, 10)); }
    // Luces
    const head2 = new THREE.SpotLight(0xf2f4ff, 5, 90, 0.6, 0.45, 1.3); head2.position.set(1.15, 1.1, 0); head2.target.position.set(12, -1, 0); g.add(head2, head2.target);
    const work = new THREE.PointLight(0xe8ecff, 1.0, 9, 1.5); work.position.set(0, 3.3, 0); g.add(work);
    scene.add(g);
    Object.assign(R3, { g, wheels, auger, carriage, head: head2, beacon, cart });
  }

  // ---------- Estación ----------
  function buildStation() {
    const st = W.station, y0 = W.hAt(st.x, st.z), g = new THREE.Group(); g.position.set(st.x, y0, st.z);
    const hull = std(0xd8d8e0, { metalness: 0.5, roughness: 0.4 }), foil = std(0xffffff, { map: texFoil(), metalness: 0.75, roughness: 0.38 });
    const metal = std(0xa9aab5, { metalness: 0.9, roughness: 0.3 }), dark = std(0x2a2a33, { roughness: 0.7 }), cells = std(0xffffff, { map: texCells(), metalness: 0.35, roughness: 0.3 });
    // Módulo de aterrizaje
    cyl(1.7, 1.7, 1.7, foil, 0, 2.4, 0, g, 8);
    cyl(1.85, 1.85, 0.12, hull, 0, 3.3, 0, g, 8);
    const bell = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.25, 0), new THREE.Vector2(0.35, -0.3), new THREE.Vector2(0.6, -0.8)], 20), std(0x55555f, { side: THREE.DoubleSide, metalness: 0.7 })); bell.position.y = 1.55; g.add(bell);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4, top = new THREE.Vector3(Math.cos(a) * 1.5, 1.7, Math.sin(a) * 1.5), foot = new THREE.Vector3(Math.cos(a) * 3.0, 0.12, Math.sin(a) * 3.0);
      strut(top, foot, 0.06, metal, g); strut(new THREE.Vector3(Math.cos(a) * 1.4, 2.8, Math.sin(a) * 1.4), foot.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.035, metal, g);
      cyl(0.32, 0.38, 0.08, hull, foot.x, 0.06, foot.z, g, 14);
    }
    // Alas solares verticales orientadas al Sol
    const az = Math.atan2(W.sunDir.z, W.sunDir.x);
    for (const off of [-5, 5]) {
      const w = new THREE.Group(); w.position.set(Math.cos(az + Math.PI / 2) * off, 3.3, Math.sin(az + Math.PI / 2) * off); w.rotation.y = -az; g.add(w);
      cyl(0.07, 0.07, 4.6, metal, 0, 2.3, 0, w, 8);
      box(0.08, 3.8, 2.8, cells, 0, 3.4, 0, w);
      strut(new THREE.Vector3(-Math.cos(az + Math.PI / 2) * off * 0.65, 3.3, -Math.sin(az + Math.PI / 2) * off * 0.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), az), new THREE.Vector3(0, 0.3, 0), 0.04, metal, w);
    }
    const ant = dish(0.55, 0.22, std(0xf0f0f4, { metalness: 0.5, roughness: 0.35 })); ant.position.set(0.6, 3.75, 0.6); ant.rotation.set(-0.7, 0, 0.5); g.add(ant);
    cyl(0.04, 0.04, 0.5, metal, 0.6, 3.5, 0.6, g, 8);
    // Planta de agua: horno → trampa fría → tanque
    const plant = new THREE.Group(); plant.position.set(3.4, 0, 2.6); g.add(plant);
    box(2.0, 1.2, 1.4, hull, 0, 0.65, 0, plant); box(2.02, 0.1, 1.42, metal, 0, 1.3, 0, plant);
    const glow = box(1.2, 0.35, 0.02, new THREE.MeshBasicMaterial({ color: COBALT, transparent: true, opacity: 0.15 }), 0, 0.75, 0.72, plant);
    const cond = new THREE.Group(); cond.position.set(2.2, 0, 0); plant.add(cond);
    box(0.9, 1.0, 0.9, metal, 0, 0.55, 0, cond);
    for (let k = 0; k < 6; k++) box(1.0, 0.03, 1.0, metal, 0, 0.18 + k * 0.16, 0, cond);
    const frost = box(0.96, 1.0, 0.96, new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0x2a3480, emissiveIntensity: 0.25, roughness: 0.9, transparent: true, opacity: 0.92 }), 0, 0.55, 0, cond); frost.scale.y = 0.001;
    const tank = new THREE.Group(); tank.position.set(6.7, 0, 0); plant.add(tank);
    const shell = cyl(0.7, 0.7, 2.0, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false }), 0, 1.05, 0, tank, 32); shell.castShadow = false;
    cyl(0.74, 0.74, 0.08, metal, 0, 0.04, 0, tank, 32); cyl(0.74, 0.74, 0.08, metal, 0, 2.08, 0, tank, 32);
    const water = cyl(0.66, 0.66, 1, new THREE.MeshStandardMaterial({ color: COBALT, emissive: 0x1a2270, roughness: 0.15, transparent: true, opacity: 0.92 }), 0, 0.1, 0, tank, 32); water.scale.y = 0.001;
    const pipe = (pts) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 30, 0.06, 8), metal, 0, 0, 0, plant);
    pipe([[1.0, 1.0, 0], [1.4, 1.5, 0], [1.9, 1.3, 0], [2.0, 1.05, 0]]);
    pipe([[2.45, 0.35, 0], [2.7, 0.3, 0], [2.95, 0.4, 0]]); pipe([[5.05, 0.5, 0], [5.5, 0.35, 0], [6.0, 0.4, 0]]);
    // Gotas de agua que recorren la planta: trampa fría → biofiltro → tanque
    const flowCurve = new THREE.CatmullRomCurve3([[2.2, 1.0, 0], [2.6, 0.35, 0], [3.95, 0.9, 0], [5.4, 0.4, 0], [6.7, 1.2, 0]].map(p => new THREE.Vector3(...p)));
    const flowDots = [];
    for (let k = 0; k < 16; k++) { const d = mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa9b6ff }), 0, 0, 0, plant); d.castShadow = false; d.visible = false; flowDots.push(d); }
    // Cámara biológica sellada
    const bio = new THREE.Group(); bio.position.set(3.95, 0, 0); plant.add(bio);
    cyl(1.3, 1.4, 0.3, hull, 0, 0.15, 0, bio, 40);
    const glassM = new THREE.MeshStandardMaterial({ color: 0xdfe3ff, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const wall = cyl(1.15, 1.15, 1.6, glassM, 0, 1.1, 0, bio, 48); wall.castShadow = false;
    const dome = mesh(new THREE.SphereGeometry(1.15, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassM, 0, 1.9, 0, bio); dome.castShadow = false;
    const ring = mesh(new THREE.TorusGeometry(1.17, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf5f6ff }), 0, 1.9, 0, bio); ring.rotation.x = Math.PI / 2;
    const lamp = new THREE.PointLight(0xffffff, 0.0, 4.5); lamp.position.y = 2.2; bio.add(lamp);
    const rock = mesh(new THREE.DodecahedronGeometry(0.42, 1), std(0x7a7a84, { roughness: 1, metalness: 0, flatShading: true }), 0.35, 0.55, 0.2, bio); rock.scale.y = 0.7;
    const mkPoints = (color, size, n) => {
      const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 1.0; p.set([Math.cos(a) * rr, 0.4 + Math.random() * 2.0, Math.sin(a) * rr], i * 3); }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setDrawRange(0, 0);
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
      bio.add(pts); return { pts, n };
    };
    const dper = mkPoints(0xf6f6fb, 0.075, 450), pext = mkPoints(0x8796f2, 0.065, 450);
    const lichen = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshStandardMaterial({ color: 0xc9ccb6, roughness: 1, side: THREE.DoubleSide }), 140);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (let i = 0; i < 140; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      v.copy(dir).multiplyScalar(0.43).multiply(new THREE.Vector3(1, 0.7, 1)).add(rock.position);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); m4.compose(v, q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.6 + Math.random())); lichen.setMatrixAt(i, m4);
    }
    lichen.count = 0; bio.add(lichen);
    scene.add(g);
    Object.assign(ST, { g, glow, frost, water, flowCurve, flowDots, tank }); Object.assign(BIO, { bio, dper, pext, lichen, lamp, ring, worldPos: () => bio.getWorldPosition(new THREE.Vector3()) });
    addLabel('Biofiltro: microorganismos que limpian el agua', () => BIO.worldPos().add(new THREE.Vector3(0, 3.4, 0)), 'near');
    addLabel('Horno → trampa fría → biofiltro → tanque', () => new THREE.Vector3(st.x, y0, st.z).add(new THREE.Vector3(3.4, 2.2, 2.6)), 'near');
  }

  // ---------- Colonia ICEWISE (borde del cráter Shackleton) ----------
  function buildColony() {
    const c = W.colony, y0 = W.hAt(c.x, c.z), g = new THREE.Group(); g.position.set(c.x, y0, c.z);
    const hull = std(0xe2e2ea, { metalness: 0.35, roughness: 0.45 }), metal = std(0xa9aab5, { metalness: 0.9, roughness: 0.3 });
    const berm = std(0x75757d, { roughness: 1, metalness: 0 }), win = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
    const cells = std(0xffffff, { map: texCells(), metalness: 0.35, roughness: 0.3 });
    // Tres módulos habitables cubiertos de regolito (blindaje contra la radiación) unidos por un nodo
    const mod = (x, z, rotY) => {
      const m = new THREE.Group(); m.position.set(x, 0, z); m.rotation.y = rotY; g.add(m);
      const body = cyl(2.4, 2.4, 10, hull, 0, 2.4, 0, m, 28); body.rotation.z = Math.PI / 2;
      const cover = cyl(2.9, 2.9, 9.4, berm, 0, 1.55, 0, m, 28); cover.rotation.z = Math.PI / 2; cover.scale.set(1, 1, 0.82);   // montículo de regolito (blindaje)
      for (const sx of [-5.1, 5.1]) { const cap = cyl(2.4, 2.4, 0.3, metal, sx, 2.4, 0, m, 28); cap.rotation.z = Math.PI / 2; }
      box(0.05, 0.5, 1.6, win, 5.27, 2.6, 0, m);
      return m;
    };
    mod(-7, 0, 0); mod(7, 0, 0); mod(0, 8, Math.PI / 2);
    cyl(3, 3, 5, hull, 0, 2.5, 0, g, 24); box(1.6, 2.4, 1.2, metal, 0, 1.2, -3.4, g);       // nodo y esclusa
    // Depósito de agua de la colonia
    const shell = cyl(1.4, 1.4, 4, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false }), -6, 2.1, -8, g, 32); shell.castShadow = false;
    cyl(1.45, 1.45, 0.12, metal, -6, 0.06, -8, g, 32); cyl(1.45, 1.45, 0.12, metal, -6, 4.12, -8, g, 32);
    const water = cyl(1.32, 1.32, 1, new THREE.MeshStandardMaterial({ color: COBALT, emissive: 0x1a2270, roughness: 0.15, transparent: true, opacity: 0.92 }), -6, 0.2, -8, g, 32); water.scale.y = 0.001;
    // Radiador y paneles de apoyo
    for (let k = 0; k < 4; k++) box(0.06, 2.4, 3.2, metal, 10 + k * 0.5, 1.4, -6, g);
    const wing = new THREE.Group(); wing.position.set(14, 0, 6); wing.rotation.y = -Math.atan2(W.sunDir.z, W.sunDir.x); g.add(wing);
    cyl(0.08, 0.08, 6, metal, 0, 3, 0, wing, 8); box(0.08, 3.2, 4.4, cells, 0, 5.2, 0, wing);
    const lamp = new THREE.PointLight(0xfff1dc, 1.4, 40, 1.6); lamp.position.set(0, 8, 0); g.add(lamp);
    scene.add(g);
    // Tubería sobre soportes: del tanque de la planta al depósito de la colonia, siguiendo el terreno
    const a = ST.tank.getWorldPosition(new THREE.Vector3()), b = new THREE.Vector3(c.x - 6, y0, c.z - 8);
    const pts = [], n = Math.max(12, Math.round(a.distanceTo(b) / 6));
    for (let k = 0; k <= n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; pts.push(new THREE.Vector3(x, W.hAt(x, z) + 1.2, z)); }
    pts[0].y = a.y + 1.6; pts[pts.length - 1].y = y0 + 2;
    const curve = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(curve, n * 4, 0.16, 8), metal, 0, 0, 0, scene);
    for (let k = 1; k < n; k += 2) { const q = pts[k]; cyl(0.06, 0.06, 1.2, metal, q.x, q.y - 0.6, q.z, scene, 6); }
    const dots = [];
    for (let k = 0; k < 40; k++) { const d = mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa9b6ff }), 0, 0, 0, scene); d.castShadow = false; d.visible = false; dots.push(d); }
    Object.assign(COL, { g, water, curve, dots });
  }

  // ---------- Modelos hechos en Blender (opcionales) ----------
  // Si assets/models/models.json lista un modelo (p. ej. ["rover", "station"]), se carga assets/models/<nombre>.glb
  // y sustituye la parte visual del modelo procedural. Las piezas animadas se conservan:
  //  · rover: objetos llamados "wheel…" giran como ruedas y "drill…"/"auger…" baja al perforar.
  //  · station / colony / biofilter: se mantienen el brillo del horno, la escarcha, el agua y las bacterias.
  // Convención: metros, origen en el suelo en el centro del objeto, frente del rover hacia +X.
  function loadCustomModels() {
    if (!THREE.GLTFLoader || location.protocol === 'file:') return;   // fetch no funciona con file://
    fetch('assets/models/models.json').then(r => r.ok ? r.json() : []).then(list => {
      const loader = new THREE.GLTFLoader();
      if (THREE.DRACOLoader) { const draco = new THREE.DRACOLoader(); draco.setDecoderPath('assets/vendor/draco/'); draco.setDecoderConfig({ type: 'wasm' }); loader.setDRACOLoader(draco); }
      const within = (o, roots) => roots.some(k => { for (let p = o; p; p = p.parent) if (p === k) return true; return false; });
      const hide = (group, keep) => group.traverse(o => { if (o.isMesh && !within(o, keep)) o.visible = false; });
      const prep = (scn) => scn.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const targets = {
        rover: (scn) => {
          const wheels = [], drills = [];
          scn.traverse(o => { if (/^wheel/i.test(o.name)) wheels.push(o); if (/^(drill|auger)/i.test(o.name)) drills.push(o); });
          hide(R3.g, drills.length ? [] : [R3.auger]); R3.g.add(scn);
          if (wheels.length) R3.wheels = wheels;
          if (drills.length) { R3.auger = drills[0]; R3.augerBase = drills[0].position.y; }
          setupRoverAnim(scn);
        },
        station: (scn) => { hide(ST.g, [ST.glow, ST.frost, ST.water, ...ST.flowDots, BIO.bio]); ST.g.add(scn); },
        colony: (scn) => { hide(COL.g, [COL.water]); COL.g.add(scn); },
        biofilter: (scn) => { hide(BIO.bio, [BIO.lichen]); BIO.bio.add(scn); }
      };
      (Array.isArray(list) ? list : []).forEach(name => {
        if (!targets[name]) return;
        loader.load(`assets/models/${name}.glb`, g => { prep(g.scene); targets[name](g.scene); console.info(`Modelo de Blender cargado: ${name}.glb`); },
          undefined, () => console.warn(`No se pudo cargar assets/models/${name}.glb; se usa el modelo procedural.`));
      });
    }).catch(() => {});
  }

  // ---------- Animación del rover de Blender ----------
  // El modelo trae pivotes (piv_*) en cada articulación. Aquí se mueven según lo que hace la simulación:
  // dirección de las ruedas al girar, mástil que busca/mide/mira el taladro, carro del taladro que baja,
  // brazo que lleva cada muestra del taladro al carrusel y carrusel que entrega los cartuchos en la estación.
  // Ángulos del brazo [base, hombro, codo, muñeca] en radianes, calculados por cinemática inversa en Blender.
  const ARM = {
    recogido: [0.2971, -1.9101, 0.671, 1.6111], sobre_taladro: [-0.7412, -0.4007, 0.5402, 0.2325], agarre: [-0.7412, 0.3021, 0.2686, -0.1987],
    transporte: [-2.5783, -1.1352, -0.0979, 1.6051], sobre_carrusel: [-2.5783, -1.159, 0.12, 1.4111], soltar: [-2.5783, -1.0987, 0.415, 1.0556]
  };
  const ARM_SEQ = [['sobre_taladro', 0.8], ['agarre', 0.6], ['agarrar', 0.3], ['sobre_taladro', 0.5], ['transporte', 1.4],
    ['sobre_carrusel', 0.5], ['soltar', 0.5], ['soltar_cartucho', 0.3], ['sobre_carrusel', 0.4], ['recogido', 1.0]];
  const AX_Y = new THREE.Vector3(0, 0, -1), AX_Z = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();   // ejes Y y Z de Blender en glTF
  const RA = { on: false };
  function setupRoverAnim(scn) {
    const get = n => scn.getObjectByName(n);
    const piv = n => { const o = get(n); if (o) { o.userData.q0 = o.quaternion.clone(); o.userData.p0 = o.position.clone(); } return o; };
    Object.assign(RA, {
      az: piv('piv_brazo_azimut'), sh: piv('piv_brazo_hombro'), el: piv('piv_brazo_codo'), wr: piv('piv_brazo_muneca'),
      pan: piv('piv_mastil_giro'), tilt: piv('piv_mastil_cabeceo'), car: piv('piv_carrusel'), head: piv('piv_taladro_carro'),
      steerF: ['FL', 'FR'].map(w => piv('piv_direccion_' + w)).filter(Boolean), steerR: ['RL', 'RR'].map(w => piv('piv_direccion_' + w)).filter(Boolean),
      held: [get('brazo_cartucho'), get('brazo_cartucho_tapa')].filter(Boolean), caps: [], leds: [], beacon: [],
      cur: ARM.recogido.slice(), seq: null, pending: 0, holes: S.totals.holes, placed: 0, carA: Math.PI * 1.25, spin: 0,
      steer: 0, panA: 0, tiltA: 0, prevH: S.rover.heading, prevT: S.t, cargo: 0
    });
    for (let k = 0; k < 8; k++) { const c = get(`cartucho_${k}_tapa`); if (c) { c.material = c.material.clone(); RA.caps[k] = c; } }
    scn.traverse(o => { if (!o.isMesh) return; const n = o.material && o.material.name;
      if (n === 'ICW_LED') RA.leds.push(o.material); if (n === 'ICW_baliza') RA.beacon.push(o.material); });
    RA.held.forEach(o => { o.visible = false; });
    RA.on = !!(RA.az && RA.sh && RA.el && RA.wr);
  }
  const rotTo = (o, axis, a) => { if (o) o.quaternion.copy(o.userData.q0).multiply(_q.setFromAxisAngle(axis, a)); };
  const ease = x => x * x * (3 - 2 * x);
  const approach = (v, target, rate, dt) => v + Math.max(-rate * dt, Math.min(rate * dt, target - v));
  function updateRoverAnim(t, dt) {
    const R = S.rover, task = R.task, alive = task !== 'dead';
    // --- muestras nuevas y descargas (detectadas en el estado de la simulación)
    if (S.totals.holes < RA.holes) { RA.holes = S.totals.holes; RA.placed = 0; RA.seq = null; RA.pending = 0; }
    if (S.totals.holes > RA.holes) { RA.pending = Math.min(2, RA.pending + S.totals.holes - RA.holes); RA.holes = S.totals.holes; }
    const cargo = R.cargoReg + R.cargoIce;
    if (cargo < RA.cargo - 1e-6 && cargo < 0.01) RA.unload = true;   // descarga en la estación
    RA.cargo = cargo;
    if (RA.unload && !RA.seq && !RA.pending) { RA.unload = false; RA.spin = 3; RA.placed = 0; }
    const fill = Math.min(8, Math.round(Math.min(1, cargo / P.cargoCap) * 8));
    // --- brazo: secuencia taladro → carrusel, o postura de espera
    if (!RA.seq && RA.pending > 0 && alive) { RA.pending--; RA.seq = { i: 0, k: 0, from: RA.cur.slice() }; }
    if (RA.seq) {
      const st = ARM_SEQ[RA.seq.i], target = ARM[st[0]] || RA.seq.from;
      RA.seq.k = Math.min(1, RA.seq.k + dt / st[1]);
      const e = ease(RA.seq.k);
      RA.cur = RA.seq.from.map((a, j) => a + (target[j] - a) * e);
      if (RA.seq.k >= 1) {
        if (st[0] === 'agarrar') RA.held.forEach(o => { o.visible = true; });
        if (st[0] === 'soltar_cartucho') { RA.held.forEach(o => { o.visible = false; }); RA.placed = Math.min(8, RA.placed + 1); }
        RA.seq.i++; RA.seq.k = 0; RA.seq.from = RA.cur.slice();
        if (RA.seq.i >= ARM_SEQ.length) RA.seq = null;
      }
    } else {
      const target = task === 'drill' ? ARM.sobre_taladro : ARM.recogido;
      RA.cur = RA.cur.map((a, j) => approach(a, target[j], 1.0, dt));
      if (!RA.pending && !RA.unload && RA.spin <= 0) RA.placed = fill;
    }
    rotTo(RA.az, AX_Z, RA.cur[0]); rotTo(RA.sh, AX_Y, RA.cur[1]); rotTo(RA.el, AX_Y, RA.cur[2]); rotTo(RA.wr, AX_Y, RA.cur[3]);
    // --- carrusel: deja el hueco libre frente al brazo; en la descarga da una vuelta entregando cartuchos
    let carT = Math.PI * 1.25 - RA.placed * Math.PI / 4;
    if (RA.spin > 0) {
      RA.spin -= dt; RA.carA += dt * 2.1;
      if (RA.spin <= 0) { let d = RA.carA - carT; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; RA.carA = carT + d; }
      else carT = RA.carA;
    }
    RA.carA = approach(RA.carA, carT, 1.5, dt); rotTo(RA.car, AX_Z, RA.carA);
    RA.caps.forEach((c, k) => { if (!c) return; const full = k < RA.placed;
      c.material.color.setHex(full ? 0xbfd4ff : 0x2a2a31); c.material.emissive.setHex(full ? 0x1d2a55 : 0x000000); });
    // --- carro del taladro: baja con la broca
    if (RA.head) { const off = task === 'drill' || R.drillDepth > 0 ? -0.28 - R.drillDepth : 0; RA.head.position.y = RA.head.userData.p0.y + Math.max(-1.1, off); }
    // --- dirección: ángulo de las ruedas de esquina según el giro real del rover
    const sdt = S.t - RA.prevT;
    if (sdt > 1e-3) {
      let dh = R.heading - RA.prevH; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      const rate = dh / sdt, v = Math.abs(R.speed);
      const want = Math.abs(rate) < 1e-4 ? 0 : -Math.max(-0.6, Math.min(0.6, Math.atan(rate / Math.max(v, 0.02) * 0.95)));
      if (Math.abs(want) > 0.02) { RA.steerT = want; RA.steerHold = 0.8; }   // a alta velocidad un giro dura un fotograma: se mantiene visible
      RA.prevH = R.heading; RA.prevT = S.t;
    } else if (sdt < 0) { RA.prevT = S.t; RA.prevH = R.heading; }
    if ((RA.steerHold = (RA.steerHold || 0) - dt) <= 0) RA.steerT = 0;
    RA.steer = approach(RA.steer, alive ? (RA.steerT || 0) : RA.steer, 1.2, dt);
    RA.steerF.forEach(o => rotTo(o, AX_Z, RA.steer)); RA.steerR.forEach(o => rotTo(o, AX_Z, -RA.steer));
    // --- mástil: busca al explorar, mira al suelo al medir, vigila el taladro al perforar
    let pan = 0, tilt = 0;
    if (task === 'explore') { pan = 0.8 * Math.sin(t * 0.6); tilt = 0.12; }
    else if (task === 'characterize') { pan = 0.35 * Math.sin(t * 0.4); tilt = 0.45; }
    else if (task === 'decide') { tilt = 0.3; }
    else if (task === 'drill') { pan = 0.5; tilt = 0.6; }
    else if (task === 'idle') { pan = 0.5 * Math.sin(t * 0.2); }
    else if (alive) { pan = RA.steer * 0.8; tilt = 0.05; }
    if (alive) { RA.panA = approach(RA.panA, pan, 0.9, dt); RA.tiltA = approach(RA.tiltA, tilt, 0.6, dt); }
    rotTo(RA.pan, AX_Z, RA.panA); rotTo(RA.tilt, AX_Y, RA.tiltA);
    // --- luces: faros según la oscuridad; baliza parpadea al moverse o perforar
    const dark = R3.head && R3.head.intensity > 1;
    RA.leds.forEach(m => { m.emissiveIntensity = alive ? (dark ? 1 : 0.4) : 0.05; });
    const busy = Math.abs(R.speed) > 0.005 || task === 'drill' || RA.seq;
    RA.beacon.forEach(m => { m.emissiveIntensity = !alive ? 0 : busy ? (Math.sin(t * 6) > 0 ? 1.2 : 0.15) : 0.6; });
  }

  function buildMarkers() {
    trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4000 * 3), 3)); trailGeo.setDrawRange(0, 0);
    trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: IVORY, transparent: true, opacity: 0.5 })); scene.add(trail);
    holesGroup = new THREE.Group(); scene.add(holesGroup);
    const ring = (r1, r2, color, op) => { const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; scene.add(m); return m; };
    wpMarker = ring(1.6, 2.0, IVORY, 0.6); candMarker = ring(3.5, 4.2, COBALT, 0.95); locator = ring(3.0, 3.6, COBALT, 0.85); pickMarker = ring(2.2, 2.8, IVORY, 0.9); pickMarker.visible = false;
  }

  function addLabel(text, posFn, cls = '') {
    const el = document.createElement('span'); el.className = 'sim-label ' + cls; el.textContent = text;
    $('#sim-labels').appendChild(el); labels.push({ el, posFn, cls });
  }

  // =====================================================================
  // ACTUALIZACIÓN VISUAL
  // =====================================================================
  const UP = new THREE.Vector3(0, 1, 0);
  function updateRover(t) {
    const R = S.rover, y = W.hAt(R.x, R.z);
    R3.g.position.set(R.x, y, R.z);
    const n = new THREE.Vector3((W.hAt(R.x - 1.2, R.z) - W.hAt(R.x + 1.2, R.z)) / 2.4, 1, (W.hAt(R.x, R.z - 1.2) - W.hAt(R.x, R.z + 1.2)) / 2.4).normalize();
    R3.g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, -R.heading)));
    R3.wheels.forEach(w => { w.rotation.z = -R.wheel; });
    const drilling = R.task === 'drill';
    R3.auger.position.y = (R3.augerBase ?? 0.3) + (drilling || R.drillDepth > 0 ? -0.28 - R.drillDepth : 0);
    R3.carriage.position.y = drilling ? 1.6 - Math.min(0.9, R.drillDepth * 0.9) : 1.6;
    if (drilling) R3.auger.rotation.y = t * 9;
    R3.head.intensity = W.envT(R.x, R.z) < 120 ? 5 : 0.8;
    R3.beacon.material.color.setHex(R.task === 'dead' ? 0x444455 : COBALT);
    const fill = Math.round(Math.min(1, (R.cargoReg + R.cargoIce) / P.cargoCap) * 6);
    R3.cart.forEach((c, k) => c.material.color.setHex(k < fill ? 0xdfe6ff : 0x50505c));
    const d = camera.position.distanceTo(R3.g.position);
    locator.visible = d > 60; locator.position.set(R.x, y + 0.6, R.z); locator.scale.setScalar(Math.max(1, d / 90));
    wpMarker.visible = !!R.wp && ['explore', 'reposition'].includes(R.task);
    if (wpMarker.visible) wpMarker.position.set(R.wp.x, W.hAt(R.wp.x, R.wp.z) + 0.4, R.wp.z);
    candMarker.visible = R.cand != null && ['goto', 'characterize', 'decide', 'drill', 'reposition'].includes(R.task);
    if (candMarker.visible) { const c = R.target || sim.cellCenter(R.cand); candMarker.position.set(c.x, W.hAt(c.x, c.z) + 0.5, c.z); candMarker.scale.setScalar(1 + 0.15 * Math.sin(t * 4)); }
  }

  function updateTrail() {
    const tr = S.trail, arr = trailGeo.attributes.position.array, n = Math.min(tr.length, 4000);
    for (let i = 0; i < n; i++) { const [x, z] = tr[tr.length - n + i]; arr[i * 3] = x; arr[i * 3 + 1] = W.hAt(x, z) + 0.25; arr[i * 3 + 2] = z; }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, n);
    if (S.holes.length < holesDrawn) { holesGroup.clear(); holesDrawn = 0; }
    while (holesDrawn < S.holes.length) {
      const hdat = S.holes[holesDrawn++], y = W.hAt(hdat.x, hdat.z);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshBasicMaterial({ color: 0x050508 })); m.rotation.x = -Math.PI / 2; m.position.set(hdat.x, y + 0.08, hdat.z); holesGroup.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 18), new THREE.MeshBasicMaterial({ color: hdat.w >= P.iceThreshold ? 0xdfe6ff : 0x70707d })); ring.rotation.x = -Math.PI / 2; ring.position.set(hdat.x, y + 0.09, hdat.z); holesGroup.add(ring);
    }
  }

  // Mapa de detección del rover: celdas medidas con contorno; rellenas si superan el umbral
  function updateDetection() {
    const g = detCtx, K = S.know, c = 8; g.clearRect(0, 0, detCanvas.width, detCanvas.height);
    for (let k = 0; k < W.KG * W.KG; k++) {
      if (!K.n[k]) continue;
      const v = K.sum[k] / K.n[k], x = (k % W.KG) * c, y = Math.floor(k / W.KG) * c;
      if (K.drilled[k]) { g.fillStyle = 'rgba(237,237,243,.75)'; g.fillRect(x, y, c, c); continue; }
      if (K.rejected[k]) { g.fillStyle = 'rgba(112,112,125,.45)'; g.fillRect(x + 1, y + 1, c - 2, c - 2); continue; }
      const hit = v >= P.iceThreshold;
      g.fillStyle = hit ? 'rgba(237,237,243,.42)' : `rgba(237,237,243,${0.04 + Math.min(0.2, v / 30)})`; g.fillRect(x, y, c, c);
      g.strokeStyle = hit ? 'rgba(255,255,255,.9)' : 'rgba(237,237,243,.28)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
    }
    detTex.needsUpdate = true;
  }

  function updateColony(t) {
    const C = S.colony, flowing = S.t - C.flowT < 600;
    COL.dots.forEach((d, k) => { d.visible = flowing; if (flowing) d.position.copy(COL.curve.getPointAt((t * 0.05 + k / COL.dots.length) % 1)); });
    const lvl = Math.min(1, C.water / 40); COL.water.scale.y = Math.max(0.001, lvl * 3.8); COL.water.position.y = 0.2 + 1.9 * lvl;
  }

  function updateStation(t) {
    const Pl = S.plant;
    const hot = Pl.state === 'calentando' || Pl.state === 'sublimando';
    ST.glow.material.opacity = hot ? 0.35 + 0.5 * Math.min(1, (Pl.T - 50) / 200) + 0.1 * Math.sin(t * 3) : 0.08;
    ST.frost.scale.y = Math.max(0.001, Math.min(1, Pl.frost / 2.2)); ST.frost.position.y = 0.05 + 0.5 * ST.frost.scale.y;
    const flowing = S.t - Pl.flowT < 5400;   // solo tras fundir la escarcha: trampa fría → biofiltro → tanque
    ST.flowDots.forEach((d, k) => { d.visible = flowing; if (flowing) d.position.copy(ST.flowCurve.getPointAt((t * 0.12 + k / ST.flowDots.length) % 1)); });
    const lvl = Math.min(1, Pl.tank / 30); ST.water.scale.y = Math.max(0.001, lvl * 1.85); ST.water.position.y = 0.1 + 0.925 * lvl;
    const B = S.bio;
    [[BIO.dper, 0], [BIO.pext, 1]].forEach(([o, i]) => {
      const n = B.N[i], frac = n <= 1 ? 0 : Math.min(1, Math.max(0, (Math.log10(n) - 2) / 7));
      const count = Math.round(frac * o.n); o.pts.geometry.setDrawRange(0, count);
      const st = B.status[i], active = st === 'Creciendo' || st === 'Estable' || st.startsWith('Estacionaria'), dying = st === 'Muriendo';
      const arr = o.pts.geometry.attributes.position.array, amp = active ? 0.012 : dying ? 0.004 : 0;
      for (let k = 0; k < count; k++) {
        const b = k * 3;
        if (amp) { arr[b] += (Math.random() - 0.5) * amp * 2; arr[b + 1] += (Math.random() - 0.5) * amp * 2 - (dying ? 0.002 : 0); arr[b + 2] += (Math.random() - 0.5) * amp * 2; }
        const rr = Math.hypot(arr[b], arr[b + 2]); if (rr > 1.05) { arr[b] *= 1.05 / rr; arr[b + 2] *= 1.05 / rr; }
        arr[b + 1] = Math.min(2.6, Math.max(0.35, arr[b + 1]));
      }
      o.pts.geometry.attributes.position.needsUpdate = true;
      o.pts.material.opacity = dying ? 0.4 : st.startsWith('Latente') ? 0.6 : 0.95;
    });
    BIO.lichen.count = Math.min(140, Math.round(B.N[2] / 100 * 140 * 4));
    BIO.lamp.intensity = P.light && P.chamber === 'inside' ? 1.0 : 0;
    BIO.ring.material.color.setHex(B.T < 0 ? 0x9fb4ff : B.T > 35 ? 0xffe2cc : 0xf5f6ff);
    crystals.material.emissiveIntensity = 0.55 + 0.25 * Math.sin(t * 2.2);
  }

  function updateCamera() {
    const R = S.rover; let target = null;
    if (camMode === 'rover') target = new THREE.Vector3(R.x, W.hAt(R.x, R.z) + 1.2, R.z);
    else if (camMode === 'station') target = BIO.worldPos().add(new THREE.Vector3(-1.0, 1.0, 0));
    else if (camMode === 'colony') target = COL.g.position.clone().add(new THREE.Vector3(0, 3, 0));
    if (target) { const delta = target.clone().sub(controls.target).multiplyScalar(camMode === 'rover' ? 1 : 0.12); controls.target.add(delta); camera.position.add(delta); }
    controls.update();
    const gh = W.hAt(camera.position.x, camera.position.z) + 2.5; if (camera.position.y < gh) camera.position.y = gh;   // la cámara no atraviesa el terreno real
  }

  function updateLabels() {
    const host = $('#sim-view'), w = host.clientWidth, h = host.clientHeight;
    labels.forEach(l => {
      const wp = l.posFn(), p = wp.clone().project(camera), dist = camera.position.distanceTo(wp);
      const hide = p.z > 1 || (l.cls === 'ov' && camMode !== 'overview') || (l.cls === 'mid' && dist > 700) || (l.cls === 'near' && dist > 45) || (l.cls === 'far' && dist < 90) || (l.cls === 'rover' && dist < 25);
      l.el.style.display = hide ? 'none' : 'block';
      if (!hide) l.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    });
  }

  // ---------- Corte del subsuelo bajo el rover ----------
  function drawCore() {
    const cv = $('#sim-core canvas'); if (!cv) return;
    const R = S.rover, wTrue = W.iceWt(R.x, R.z), dry = W.dryLayer(R.x, R.z), k = sim.ki(R.x, R.z), est = S.know.n[k] ? S.know.sum[k] / S.know.n[k] : null;
    const g = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, top = 26, bot = Hd - 34, maxD = 1.5;
    const Y = d => top + d / maxD * (bot - top);
    g.clearRect(0, 0, Wd, Hd);
    g.fillStyle = '#ededf3'; g.font = '600 11px Inter, sans-serif'; g.fillText('SUBSUELO BAJO EL ROVER', 10, 15);
    const x0 = 46, x1 = Wd - 10;
    g.fillStyle = '#3b3b47'; g.fillRect(x0, top, x1 - x0, Y(dry) - top);
    g.fillStyle = wTrue > 0.3 ? '#232846' : '#2d2d38'; g.fillRect(x0, Y(dry), x1 - x0, bot - Y(dry));
    if (wTrue > 0.3) {
      const rr = Ice.rng(Math.floor(R.x) * 31 + Math.floor(R.z)), n = Math.round(wTrue * 18);
      for (let i = 0; i < n; i++) { const x = x0 + 4 + rr() * (x1 - x0 - 8), y = Y(dry) + 4 + rr() * (bot - Y(dry) - 8), s = 2 + rr() * 2.5; g.fillStyle = 'rgba(214,224,255,.95)'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.fill(); }
    }
    g.fillStyle = '#c3c3cc'; g.font = '10px Inter, sans-serif';
    for (let d = 0; d <= maxD + 1e-6; d += 0.5) { g.fillText(`${fmt(d, 1)} m`, 6, Y(d) + 3); g.fillStyle = 'rgba(237,237,243,.12)'; g.fillRect(x0, Y(d), x1 - x0, 1); g.fillStyle = '#c3c3cc'; }
    g.fillStyle = '#ededf3'; g.fillRect(x0, top - 1, x1 - x0, 2);
    g.font = '10px Inter, sans-serif'; g.fillStyle = '#c3c3cc'; g.fillText('capa seca', x0 + 6, top + 12);
    if (R.drillDepth > 0 || R.task === 'drill') {
      const cx = (x0 + x1) / 2; g.strokeStyle = '#ededf3'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, top - 8); g.lineTo(cx, Y(R.drillDepth)); g.stroke();
      g.fillStyle = '#5266eb'; g.beginPath(); g.moveTo(cx - 5, Y(R.drillDepth)); g.lineTo(cx + 5, Y(R.drillDepth)); g.lineTo(cx, Y(R.drillDepth) + 8); g.fill();
    }
    g.setLineDash([3, 3]); g.strokeStyle = 'rgba(237,237,243,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(P.drillDepth)); g.lineTo(x1, Y(P.drillDepth)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ededf3'; g.font = '600 11px Inter, sans-serif';
    g.fillText(wTrue > 0.3 ? `Hielo real: ${fmt(wTrue, 1)} %` : 'Sin hielo aquí', 10, Hd - 19);
    g.fillStyle = '#c3c3cc'; g.font = '10px Inter, sans-serif';
    g.fillText(est != null ? `El rover estima: ${fmt(est, 1)} %` : 'El rover aún no ha medido aquí', 10, Hd - 6);
  }

  // ---------- Interacción con el terreno ----------
  function pickTerrain(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit ? hit.point : null;
  }
  function describe(x, z) {
    const w = W.iceWt(x, z), dry = W.dryLayer(x, z), T = W.envT(x, z), psr = W.fracAt(W.psr, x, z) > 0.5, slope = W.slopeAt(x, z);
    const k = sim.ki(x, z), est = S.know.n[k] ? S.know.sum[k] / S.know.n[k] : null;
    const head = w > 0.3 ? `<strong>Hielo bajo el suelo: ${fmt(w, 1)} %</strong><br>empieza a ${fmt(dry * 100, 0)} cm de profundidad` : `<strong>Sin hielo</strong><br>${psr ? 'sombra permanente, pero sin depósito aquí' : 'zona con sol: el hielo se sublimaría'}`;
    const alt = W.real ? ` · altura ${fmt(W.hAt(x, z) + W.meta.base, 0)} m` : '';
    return `${head}<br><span class="muted">${fmt(T, 0)} K (${fmt(T - 273.15, 0)} °C) · ${psr ? 'sombra permanente' : 'iluminado'} · pendiente ${fmt(slope, 0)}°${slope > 24 ? ' (demasiado inclinada)' : ''}${alt}</span><br><span class="muted">${est != null ? `El rover midió aquí ${fmt(est, 1)} %` : 'El rover aún no ha medido aquí'}</span>`;
  }
  function bindPointer() {
    const el = renderer.domElement, tip = $('#sim-tip'), pop = $('#sim-pop');
    let down = null;
    el.addEventListener('pointermove', ev => {
      const now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
      if (ev.buttons) { tip.hidden = true; return; }
      const p = pickTerrain(ev); if (!p) { tip.hidden = true; return; }
      const r = el.getBoundingClientRect();
      tip.innerHTML = describe(p.x, p.z); tip.hidden = false;
      tip.style.left = Math.min(r.width - 250, ev.clientX - r.left + 14) + 'px'; tip.style.top = Math.max(50, ev.clientY - r.top - 10) + 'px';
    });
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    el.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
    el.addEventListener('pointerup', ev => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      const p = pickTerrain(ev); if (!p) return;
      const r = el.getBoundingClientRect();
      pickMarker.visible = true; pickMarker.position.set(p.x, p.y + 0.4, p.z);
      tip.hidden = true;
      pop.innerHTML = `${describe(p.x, p.z)}<div class="row" style="margin-top:12px;gap:8px"><button class="btn btn--primary btn--sm" data-go>Enviar el rover aquí</button><button class="btn btn--sm btn--quiet" data-close>Cerrar</button></div>`;
      pop.hidden = false; pop.style.left = Math.min(r.width - 290, ev.clientX - r.left + 10) + 'px'; pop.style.top = Math.min(r.height - 190, Math.max(50, ev.clientY - r.top - 20)) + 'px';
      pop.querySelector('[data-go]').onclick = () => { sim.cmd.goTo(p.x, p.z); setModeUI('auto'); if (!S.running) toggleRun(); pop.hidden = true; hideIntro(); toast('El rover va hacia ese punto, medirá el hielo y decidirá si perforar.'); };
      pop.querySelector('[data-close]').onclick = () => { pop.hidden = true; pickMarker.visible = false; };
    });
  }

  function setCam(mode) {
    camMode = mode;
    $$('#sim-cam button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === mode)));
    const R = S.rover;
    if (mode === 'rover') {
      const t = new THREE.Vector3(R.x, W.hAt(R.x, R.z) + 1.2, R.z); controls.target.copy(t);
      const ds = Math.hypot(R.x - W.station.x, R.z - W.station.z);
      let dx = -Math.cos(R.heading), dz = -Math.sin(R.heading);
      if (ds < 40) { dx = (R.x - W.station.x) / ds; dz = (R.z - W.station.z) / ds; }
      camera.position.set(t.x + dx * 11, t.y + 5, t.z + dz * 11);
    }
    if (mode === 'station') { const t = BIO.worldPos().add(new THREE.Vector3(-1.0, 1.0, 0)); controls.target.copy(t); camera.position.set(t.x - 2, t.y + 5, t.z + 13); }
    if (mode === 'overview') { const k = W.SIZE / 600; controls.target.set(W.station.x * 0.3, 0, W.station.z * 0.3); camera.position.set(-260 * k, 330 * k, 380 * k); }
    if (mode === 'colony') { const c = COL.g.position; controls.target.set(c.x, c.y + 3, c.z); camera.position.set(c.x - 30, c.y + 22, c.z + 38); }
    $('#sim-core').hidden = mode !== 'rover';
    updateProcess(true);
  }

  // =====================================================================
  // BUCLE
  // =====================================================================
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    applyKeys();
    if (S.running) sim.step(dt * warp);
    if (!visible) return;
    const t = now / 1000;
    updateRover(t); if (RA.on) updateRoverAnim(t, dt); updateStation(t); updateColony(t); updateCamera();
    if (now - lastTex > 400) { lastTex = now; updateDetection(); updateTrail(); }
    renderer.render(scene, camera);
    updateLabels();
    if (now - lastUI > 200) { lastUI = now; updateUI(); drawCore(); updateProcess(); }
    if (now - lastChart > 1200) { lastChart = now; updateCharts(); }
  }
  function resize() { const host = $('#sim-view'); renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); }

  // =====================================================================
  // PANEL DE CONTROL
  // =====================================================================
  function clockStr(t) { const d = Math.floor(t / 86400) + 1, hh = Math.floor(t % 86400 / 3600), mm = Math.floor(t % 3600 / 60); return `Día ${d} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  const doseFromSlider = v => Math.pow(10, -5 + 7 * v / 100);
  const sliderFromDose = d => (Math.log10(d) + 5) / 7 * 100;
  function doseStr(d) { return d < 1e-3 ? `${fmt(d * 1e6, d < 1e-5 ? 1 : 0)} µGy/h` : d < 1 ? `${fmt(d * 1e3, 1)} mGy/h` : `${fmt(d, d < 10 ? 1 : 0)} Gy/h`; }
  const FMT = {
    vmax: v => `${fmt(v, 2)} m/s`, iceThreshold: v => `${fmt(v, 1)} %`, drillDepth: v => `${fmt(v, 2)} m`, cargoCap: v => `${fmt(v, 0)} kg`, reserve: v => `${fmt(v, 0)} %`, drillPower: v => `${fmt(v, 0)} W`,
    heaterW: v => `${fmt(v, 0)} W`, etaH: v => `${fmt(v * 100, 0)} %`, etaCap: v => `${fmt(v * 100, 0)} %`, solarW: v => `${fmt(v / 1000, 1)} kW`,
    Tc: v => `${fmt(v, 0)} °C`, bioPurif: v => v ? 'activado' : 'apagado', feed: v => `${fmt(v, 1)} mL/h`, nutrients: v => `${fmt(v * 100, 0)} %`, dose: v => doseStr(v), chamber: v => v === 'outside' ? 'exterior' : 'protegida'
  };

  // "Qué cambia": muestra antes → después calculado y una explicación
  let effTimer;
  function showEffect(key, before, after) {
    const ex = IceExplain.explain(key, before, after, { P, world: W, rover: sim.ROVER, species: sim.SPECIES });
    if (!ex) return;
    const box = $('#sim-effect');
    box.innerHTML = `<div class="eff-head"><span class="eyebrow">Qué cambia</span><button class="eff-x" aria-label="Cerrar">×</button></div>
      <h4>${ex.title}: ${FMT[key](before)} → <span class="hl">${FMT[key](after)}</span></h4>
      <p>${ex.text}</p>
      <table class="eff-table"><tbody>${ex.rows.map(r => `<tr><td>${r[0]}</td><td class="b">${r[1]}</td><td class="arr">→</td><td class="a">${r[2]}</td></tr>`).join('')}</tbody></table>`;
    box.hidden = false; box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    box.querySelector('.eff-x').onclick = () => { box.hidden = true; };
    const ban = $('#sim-banner'); ban.innerHTML = `<strong>${ex.title}</strong> ${FMT[key](before)} → ${FMT[key](after)}`; ban.hidden = false;
    clearTimeout(effTimer); effTimer = setTimeout(() => { ban.hidden = true; }, 4500);
  }

  function bindSliders() {
    $$('#sim-panel input[type=range][data-p]').forEach(inp => {
      const k = inp.dataset.p, out = $(`output[for="${inp.id}"]`);
      const ctl = inp.closest('.ctl');
      if (ctl && !ctl.querySelector('.help')) { const hp = document.createElement('p'); hp.className = 'help'; hp.textContent = IceExplain.help(k); ctl.appendChild(hp); }
      const val = () => k === 'dose' ? doseFromSlider(+inp.value) : +inp.value;
      const show = () => { if (out) out.textContent = FMT[k](val()); inp.style.setProperty('--fill', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); };
      inp.value = k === 'dose' ? sliderFromDose(P[k]) : P[k]; show();
      let start = null;
      inp.addEventListener('pointerdown', () => { start = P[k]; });
      inp.addEventListener('keydown', () => { if (start === null) start = P[k]; });
      inp.addEventListener('input', () => { if (start === null) start = P[k]; P[k] = val(); show(); showEffect(k, start, P[k]); });
      inp.addEventListener('change', () => { if (start !== null && start !== P[k]) S.log.push({ t: S.t, msg: `Cambiaste ${IceExplain.DEF[k].title.toLowerCase()}: ${FMT[k](start)} → ${FMT[k](P[k])}.`, kind: 'key' }); start = null; });
    });
  }
  function syncSliders() {
    $$('#sim-panel input[type=range][data-p]').forEach(inp => { const k = inp.dataset.p; inp.value = k === 'dose' ? sliderFromDose(P[k]) : P[k]; const out = $(`output[for="${inp.id}"]`); if (out) out.textContent = FMT[k](P[k]); inp.style.setProperty('--fill', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); });
    $$('#bio-mode button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === P.chamber)));
    $('#bio-inside-controls').classList.toggle('is-disabled', P.chamber === 'outside'); $('#bio-light').checked = P.light; $('#bio-purif').checked = P.bioPurif;
  }

  function openTab(id) {
    $$('#sim-tabs button').forEach(x => x.setAttribute('aria-selected', String(x.getAttribute('aria-controls') === id)));
    $$('.sim-tab').forEach(p => { p.hidden = p.id !== id; });
    const b = $(`#sim-tabs [aria-controls="${id}"]`); if (b && b.dataset.cam) setCam(b.dataset.cam);
    lastChart = 0;
  }
  function setModeUI(m) { $$('#sim-mode button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.m === m))); $('#sim-pad').hidden = m !== 'manual'; }
  function hideIntro() { const i = $('#sim-intro'); if (i) i.hidden = true; }

  const WHATIF = [
    { t: '¿Y si el rover es muy exigente?', d: 'Umbral de hielo 6 %', apply: () => { const b = P.iceThreshold; P.iceThreshold = 6; showEffect('iceThreshold', b, 6); }, tab: 'tab-rover' },
    { t: '¿Y si no guarda batería para volver?', d: 'Reserva 0 % y bodega de 100 kg', apply: () => { const b = P.reserve; P.reserve = 0; P.cargoCap = 100; showEffect('reserve', b, 0); }, tab: 'tab-rover', warp: 600 },
    { t: '¿Y si el horno pierde mucho calor?', d: 'Eficiencia de calentamiento 20 %', apply: () => { const b = P.etaH; P.etaH = 0.2; showEffect('etaH', b, 0.2); }, tab: 'tab-plant' },
    { t: '¿Y si sacamos los microbios al exterior?', d: 'Vacío, −40 °C, radiación lunar', apply: () => { const b = P.chamber; P.chamber = 'outside'; showEffect('chamber', b, 'outside'); }, tab: 'tab-bio', warp: 600 },
    { t: '¿Y si los irradiamos fuerte?', d: 'Fuente de 100 Gy/h en la cámara', apply: () => { const b = P.dose; Object.assign(P, { chamber: 'inside', Tc: 30, dose: 100 }); showEffect('dose', b, 100); }, tab: 'tab-bio' },
    { t: '¿Y si apagamos el biofiltro?', d: 'Solo filtros químicos traídos de la Tierra', apply: () => { const b = P.bioPurif; P.bioPurif = false; showEffect('bioPurif', b, false); }, tab: 'tab-bio', warp: 2400 },
    { t: '¿Y si lo conduzco yo?', d: 'W A S D o flechas · Espacio perfora', apply: () => { sim.cmd.setMode('manual'); setModeUI('manual'); setCam('rover'); $('#sim-view').focus(); }, tab: 'tab-rover' }
  ];

  function bindUI() {
    $$('#sim-tabs button').forEach(b => b.addEventListener('click', () => openTab(b.getAttribute('aria-controls'))));
    $('#sim-start').addEventListener('click', () => { toggleRun(); hideIntro(); });
    $('#sim-intro-start').addEventListener('click', () => { hideIntro(); if (!S.running) toggleRun(); });
    $('#sim-intro-skip').addEventListener('click', () => { hideIntro(); setCam('overview'); });
    $('#sim-reset').addEventListener('click', () => { sim.cmd.resetAll(); Object.assign(P, IceSim.DEFAULT_P); syncSliders(); setModeUI('auto'); setCam(camMode); lastChart = 0; updateUI(); toggleRunLabel(); toast('Simulación y valores restablecidos.'); });
    $$('#sim-warp button').forEach(b => b.addEventListener('click', () => { warp = +b.dataset.w; $$('#sim-warp button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    $$('#sim-cam button').forEach(b => b.addEventListener('click', () => setCam(b.dataset.c)));
    $$('#sim-mode button').forEach(b => b.addEventListener('click', () => {
      sim.cmd.setMode(b.dataset.m); setModeUI(b.dataset.m); hideIntro();
      if (b.dataset.m === 'manual') { if (!S.running) toggleRun(); setCam('rover'); $('#sim-view').focus(); }
    }));
    const layer = (id, meshes, legendKey) => $(id).addEventListener('change', e => { meshes.forEach(m => { m.visible = e.target.checked; }); const lg = $(`#sim-legend [data-l="${legendKey}"]`); if (lg) lg.hidden = !e.target.checked; });
    $('#ov-fill').addEventListener('change', e => { fill.visible = e.target.checked; });
    layer('#ov-ice', [iceMesh, crystals], 'ice'); layer('#ov-det', [detMesh], 'det'); layer('#ov-psr', [psrMesh], 'psr'); layer('#ov-trail', [trail, holesGroup], 'trail');
    $('#sim-drill').addEventListener('click', () => sim.cmd.drillHere());
    $('#sim-home').addEventListener('click', () => { sim.cmd.goHome(); setModeUI('auto'); });
    $$('#sim-pad [data-k]').forEach(b => {
      const on = e => { e.preventDefault(); keys[b.dataset.k] = true; }, off = () => { keys[b.dataset.k] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
    $('#sim-whatif').innerHTML = WHATIF.map((w, i) => `<button class="whatif" data-i="${i}"><span class="t">${w.t}</span><span class="d">${w.d}</span></button>`).join('');
    $$('#sim-whatif .whatif').forEach(b => b.addEventListener('click', () => {
      const w = WHATIF[+b.dataset.i]; w.apply(); syncSliders(); hideIntro();
      if (w.warp) { warp = w.warp; $$('#sim-warp button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.w === warp))); }
      if (!S.running) toggleRun();
      openTab(w.tab);
    }));
    // Biología
    $$('#bio-mode button').forEach(b => b.addEventListener('click', () => { const before = P.chamber; P.chamber = b.dataset.v; syncSliders(); showEffect('chamber', before, P.chamber); }));
    $('#bio-light').addEventListener('change', e => { P.light = e.target.checked; });
    $('#bio-purif').addEventListener('change', e => { const b = P.bioPurif; P.bioPurif = e.target.checked; showEffect('bioPurif', b, P.bioPurif); });
    $('#bio-inoc').addEventListener('click', () => { sim.cmd.inoculate(); toast('Cámara re-inoculada con las tres especies.'); });
    $('#bio-spe').addEventListener('click', () => { sim.cmd.solarEvent(); toast('Evento solar: +0,05 Gy/h durante 10 h.'); });
    // Teclado (modo manual)
    const host = $('#sim-view');
    const kmap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    window.addEventListener('keydown', e => {
      if (S.rover.mode !== 'manual' || !visible || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (kmap[e.code]) { keys[kmap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'Space' && document.activeElement === host) { sim.cmd.drillHere(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (kmap[e.code]) keys[kmap[e.code]] = false; });
    document.addEventListener('icewise:startMission', () => { hideIntro(); if (!S.running) toggleRun(); });
  }
  function applyKeys() {
    if (!S || S.rover.mode !== 'manual') return;
    S.manual.throttle = (keys.up ? 1 : 0) - (keys.down ? 0.6 : 0);
    S.manual.steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  }
  function toggleRun() { if (S.running) sim.cmd.pause(); else sim.cmd.start(); toggleRunLabel(); }
  function toggleRunLabel() {
    const b = $('#sim-start'); b.querySelector('span').textContent = S.running ? 'Pausar' : 'Iniciar';
    b.querySelector('.ic-play').style.display = S.running ? 'none' : ''; b.querySelector('.ic-pause').style.display = S.running ? '' : 'none';
  }

  function set(id, html) { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; }
  function bar(id, f) { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, f * 100)) + '%'; }

  function updateUI() {
    const R = S.rover, Pl = S.plant, B = S.bio;
    const taskTxt = (TASKS[R.task] || R.task) + (R.task === 'drill' ? ` · ${fmt(R.drillDepth, 2)} de ${fmt(P.drillDepth, 2)} m` : R.task === 'characterize' ? ` · ${Math.round(R.charT / 12)} %` : '');
    set('hud-clock', clockStr(S.t)); set('hud-task', taskTxt);
    set('hud-bat', `Batería ${fmt(R.battery / sim.ROVER.cap * 100, 0)} %`); set('hud-temp', `Exterior ${fmt(R.Tenv || 0, 0)} K · rover ${fmt(R.sysT - 273.15, 0)} °C`);
    set('hud-water', `Agua limpia ${fmt(S.totals.water, 2)} kg · en la colonia ${fmt(S.colony.water, 2)} kg${S.totals.rejected > 0 ? ` · contaminada ${fmt(S.totals.rejected, 2)} kg` : ''}`);
    const hb = $('#hud-bat'); if (hb) hb.classList.toggle('warn', R.battery / sim.ROVER.cap < P.reserve / 100 + 0.05);
    set('m-water', `${fmt(S.totals.water, 2)}<small>kg</small>`); set('m-ice', `${fmt(S.colony.water, 2)}<small>kg</small>`); set('m-ice-l', `En la colonia · ${fmt(S.colony.water / sim.COLONY.demandKgDay, 1)} días de reserva`);
    set('m-holes', `${S.totals.holes}`); set('m-dist', `${fmt(S.totals.dist / 1000, 2)}<small>km</small>`);
    set('m-spec', S.totals.water > 0 ? `${fmt(S.totals.kWhPlant / S.totals.water, 1)}<small>kWh/kg</small>` : '—');
    const known = S.know.n.reduce((a, n) => a + (n > 0 ? 1 : 0), 0); set('m-cov', `${fmt(known / (W.KG * W.KG) * 100, 0)}<small>%</small>`);
    set('r-task', taskTxt); set('r-bat', `${fmt(R.battery, 0)} / ${sim.ROVER.cap} Wh`); bar('r-bat-bar', R.battery / sim.ROVER.cap);
    set('r-pow', `gasta ${fmt(R.power, 0)} W · recibe ${fmt(R.solar + (R.charge || 0), 0)} W`);
    set('r-temp', `${fmt(R.sysT - 273.15, 0)} °C · calefacción ${fmt(R.heater, 0)} W`);
    set('r-cargo', `${fmt(R.cargoReg + R.cargoIce, 1)} / ${fmt(P.cargoCap, 0)} kg (hielo ${fmt(R.cargoIce, 2)} kg)`); bar('r-cargo-bar', (R.cargoReg + R.cargoIce) / P.cargoCap);
    set('r-sensor', R.lastReading != null ? `${fmt(R.lastReading, 1)} % de hielo equivalente` : '—');
    const stTxt = { 'vacío': 'Vacío: esperando muestras', calentando: 'Calentando las muestras', sublimando: 'El hielo se convierte en vapor', completado: 'Lote terminado' }[Pl.state] || Pl.state;
    set('p-state', stTxt + (Pl.queue.length ? ` · ${Pl.queue.length} en cola` : ''));
    set('p-T', `${fmt(Pl.T, 0)} K (${fmt(Pl.T - 273.15, 0)} °C)`); bar('p-T-bar', (Pl.T - 40) / 220);
    set('p-ice', `${fmt(Pl.ice, 2)} kg`); set('p-cap', `${fmt(Pl.captured, 2)} kg`); set('p-tank', `${fmt(Pl.tank, 2)} kg`); bar('p-tank-bar', Pl.tank / 30);
    set('p-power', `Reparto de energía solar (${fmt(P.solarW, 0)} W): horno ${fmt(Pl.heater, 0)} W · carga del rover ${fmt(R.charge || 0, 0)} W · cámara bio ${fmt(B.power, 0)} W`);
    const q = Pl.quality, act = i => sim.bioActivity(i);
    [['dper', 0], ['pext', 1]].forEach(([id, i]) => { bar(`act-${id}`, P.bioPurif ? act(i) : 0); set(`act-${id}-v`, P.bioPurif ? `${fmt(act(i) * 100, 0)} %` : 'apagado'); });
    set('act-plac-v', !P.bioPurif ? 'apagado' : Pl.lastResidual > 5 ? 'alerta: agua sucia' : Pl.quality ? 'agua limpia' : 'esperando agua');
    set('q-flow', q ? `100 → <strong>${fmt(q.after, 0)}</strong> → <strong>${fmt(q.final, 1)}</strong>` : 'Aún no se ha tratado ningún lote');
    set('q-ok', q ? (q.ok ? 'Apta para uso técnico' : 'Contaminada: se reprocesa') : '—');
    const qe = document.getElementById('q-ok'); if (qe) qe.className = 'verdict ' + (q ? (q.ok ? 'pass' : 'fail') : '');
    set('q-ads', `${fmt(Pl.adsorbent, 2)} kg restantes · ${fmt(Pl.adsSaved, 2)} kg ahorrados`); bar('q-ads-bar', Pl.adsorbent / 3);
    set('q-rem', q && q.bio ? `NH₃ ${fmt(q.rN * 100, 0)} % · azufre y orgánicos ${fmt(q.rS * 100, 0)} % · mercurio ${fmt(q.rHg * 100, 0)} %` : q ? 'Biofiltro apagado: 0 %' : '—');
    set('p-quality', q ? `Último lote: contaminantes 100 → ${fmt(q.final, 1)} · ${q.ok ? 'apta para uso técnico' : 'contaminada'} · adsorbente ${fmt(Pl.adsorbent, 2)} kg` : 'Aún no se ha tratado ningún lote');
    set('b-T', `${fmt(B.T, 1)} °C`); set('b-V', `${fmt(B.V, 1)} mL`); set('b-S', `${fmt(B.S * 100, 0)} %`);
    set('b-dose', doseStr((P.chamber === 'outside' ? 1.3e-5 : P.dose) + (B.spe > 0 ? 0.05 : 0)));
    sim.SPECIES.forEach((s, i) => {
      const n = B.N[i];
      set(`b-n-${s.id}`, s.kind === 'lichen' ? `${fmt(n, 2)} %` : n <= 0 ? '0' : `10<sup>${fmt(Math.log10(n), 1)}</sup>`);
      set(`b-st-${s.id}`, B.status[i]);
      const el = document.getElementById(`b-st-${s.id}`); if (el) el.className = 'verdict ' + (B.status[i] === 'Creciendo' ? 'pass' : B.status[i] === 'Muriendo' || B.status[i] === 'Extinto' ? 'fail' : '');
    });
    const lg = $('#sim-log'), key = S.log.length + '|' + (S.log[S.log.length - 1] || {}).t;
    if (lg && lg.dataset.n !== key) {
      lg.dataset.n = key;
      lg.innerHTML = S.log.slice(-40).map(e => `<div class="e ${e.kind}"><span class="ts">${clockStr(e.t).replace('Día ', 'D')}</span><span class="msg">${e.msg}</span></div>`).join('');
      lg.scrollTop = lg.scrollHeight;
    }
    if (R.task === 'dead' && S.running) { toggleRun(); toast('El rover se quedó sin energía. Sube la reserva de batería y pulsa Reiniciar.'); }
  }

  // Barra del proceso: perforación → … → colonia, con la etapa activa resaltada
  const STEPS = [
    { id: 'drill', t: 'Perforar', cam: 'rover' }, { id: 'carry', t: 'Transportar', cam: 'rover' }, { id: 'oven', t: 'Horno', cam: 'station' },
    { id: 'trap', t: 'Trampa fría', cam: 'station' }, { id: 'bio', t: 'Biofiltro', cam: 'station' }, { id: 'filter', t: 'Filtros + UV', cam: 'station' },
    { id: 'tank', t: 'Tanque', cam: 'station' }, { id: 'colony', t: 'Colonia', cam: 'colony' }
  ];
  function buildProcess() {
    const el = $('#sim-process'); if (!el) return;
    el.innerHTML = STEPS.map((st, i) => `<button class="pstep" data-s="${st.id}" data-cam="${st.cam}"><span class="pn">${i + 1}</span><span class="pt">${st.t}</span><span class="pv" id="pv-${st.id}">—</span></button>`).join('');
    $$('.pstep', el).forEach(b => b.addEventListener('click', () => setCam(b.dataset.cam)));
  }
  function updateProcess() {
    const el = $('#sim-process'); if (!el || !S || !el.children.length) return;
    const R = S.rover, Pl = S.plant, C = S.colony, q = Pl.quality, recent = S.t - Pl.flowT < 5400;
    const active = {
      drill: R.task === 'drill', carry: (R.task === 'return' || R.task === 'reposition') && R.cargoReg > 0,
      oven: Pl.state === 'calentando' || Pl.state === 'sublimando', trap: Pl.state === 'sublimando',
      bio: recent && P.bioPurif, filter: recent, tank: recent || Pl.tank > 0.05, colony: S.t - C.flowT < 600
    };
    const val = {
      drill: R.task === 'drill' ? `${fmt(R.drillDepth, 2)} m` : `${S.totals.holes} perf.`,
      carry: `${fmt(R.cargoReg + R.cargoIce, 1)} kg`,
      oven: Pl.state === 'vacío' ? 'en espera' : `${fmt(Pl.T, 0)} K`,
      trap: `${fmt(Pl.captured, 2)} kg hielo`,
      bio: !P.bioPurif ? 'apagado' : q ? `100 → ${fmt(q.after, 0)}` : '—',
      filter: q ? `→ ${fmt(q.final, 1)}` : '—',
      tank: `${fmt(Pl.tank, 2)} kg`,
      colony: `${fmt(C.water, 1)} kg`
    };
    STEPS.forEach(st => {
      const b = el.querySelector(`[data-s="${st.id}"]`); b.classList.toggle('is-on', !!active[st.id]);
      const v = document.getElementById('pv-' + st.id); if (v.textContent !== val[st.id]) v.textContent = val[st.id];
    });
  }

  function updateCharts() {
    const H = S.hist; if (H.t.length < 2) return;
    const sel = $('#sim-tabs button[aria-selected="true"]'), tab = sel ? sel.getAttribute('aria-controls') : '';
    if (tab === 'tab-rover') charts.sparkline($('#r-spark'), H.bat, { min: 0, max: 100, color: charts.PALETTE.cobalt, height: 48 });
    if (tab === 'tab-plant') charts.sparkline($('#p-spark'), H.tank, { min: 0, color: charts.PALETTE.cobalt, height: 48 });
    if (tab === 'tab-bio') {
      const xs = H.t.map(t => t / 3600);
      charts.lineChart($('#b-chart'), {
        series: [
          { name: 'D. peraridilitoris', color: charts.PALETTE.ivory, data: H.bio[0].map((n, i) => ({ x: xs[i], y: n > 0 ? Math.log10(n) : 0 })) },
          { name: 'P. extremorientalis', color: '#8796f2', data: H.bio[1].map((n, i) => ({ x: xs[i], y: n > 0 ? Math.log10(n) : 0 })) }
        ], xLabel: 'Horas simuladas', yLabel: 'log₁₀ células/mL', yMin: 0, yMax: 9.5, width: 380, height: 210, xFmt: v => fmt(v, 0), yFmt: v => fmt(v, 0)
      });
    }
  }

  function init() {
    const host = $('#sim-view'); if (!host) return;
    if (!window.THREE || !THREE.OrbitControls) { host.innerHTML = '<p class="sim-fallback">No se pudo cargar el motor 3D (Three.js).</p>'; return; }
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) throw 0; }
    catch (_) { host.innerHTML = '<p class="sim-fallback">Tu navegador no admite WebGL, necesario para la simulación 3D.</p>'; return; }
    sim = IceSim.createSim(); S = sim.S; P = sim.P; W = sim.world;
    buildScene(host); resize(); setCam('rover');
    buildProcess(); bindSliders(); bindUI(); bindPointer(); updateDetection(); updateUI(); drawCore(); updateProcess();
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(host);
    requestAnimationFrame(frame);
    window.IceSimView = { sim, setCam, toggleRun, openTab, get warp() { return warp; }, get roverAnim() { return { RA, ARM, AX_Y, AX_Z }; } };
  }
  window.IceSimViewInit = init;
})();
