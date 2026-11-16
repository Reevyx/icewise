/* =========================================================================
   ICEWISE — Vista 3D (Three.js r170) y panel de control de la simulación
   ========================================================================= */
(function () {
  'use strict';
  const { $, $$, fmt, toast, charts } = Ice;

  let sim, S, P, W;
  let renderer, scene, camera, controls, sun, terrain, fill, SV, sky, updNearRocks, tracks, iceL, destMode = false;
  let composer = null, bloom = null, grade = null, gtao = null, detailUpd = () => {}, earthshine = null;
  // Calidad gráfica (r170). Por defecto, la máxima. Se recuerda en este navegador.
  const QUALITY = {
    maxima: { pr: 2, msaa: 4, smaa: false, gtao: true, bloom: true, shadow: 4096, detail: true, grains: true },
    alta: { pr: 1.5, msaa: 4, smaa: false, gtao: true, bloom: true, shadow: 4096, detail: true, grains: true },
    media: { pr: 1, msaa: 0, smaa: true, gtao: false, bloom: true, shadow: 2048, detail: true, grains: false },
    baja: { pr: 0.75, msaa: 0, smaa: false, gtao: false, bloom: false, shadow: 1024, detail: false, grains: false }
  };
  const Q_ORDER = ['maxima', 'alta', 'media', 'baja'];
  // Calidad: si la persona eligió una a mano se respeta; si no (o eligió "Auto"), se estima según la tarjeta gráfica
  // al iniciar (guessQuality) y se baja un nivel sola si el equipo no llega a ~26 fps (autoQuality).
  let qName = (() => { try { const v = localStorage.getItem('icewise-calidad'); if (QUALITY[v]) return v; } catch (_) {} return 'alta'; })();
  let qAuto = !(() => { try { return QUALITY[localStorage.getItem('icewise-calidad')]; } catch (_) { return false; } })();
  let Q = QUALITY[qName];
  function guessQuality(gl) {
    let gpu = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (_) {}
    const mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
    let q;
    if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i.test(gpu)) q = 'baja';             // sin tarjeta gráfica
    else if (mobile) q = /Apple|Adreno \(TM\) (6[5-9]|7)\d|Mali-G7[1-9]|Mali-G[7-9]\d\d|Immortalis/i.test(gpu) ? 'media' : 'baja';
    else if (/NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro)|Radeon\(TM\) RX|Arc\(TM\)|Intel\(R\) Arc|Apple M\d (Pro|Max|Ultra)/i.test(gpu)) q = 'maxima';   // tarjeta dedicada
    else if (/Apple M\d|Apple GPU/i.test(gpu)) q = 'alta';
    else if (/Intel|UHD|HD Graphics|Iris|Radeon\(TM\) Graphics|Radeon Vega|Vega \d+|Mali|PowerVR|Adreno/i.test(gpu)) q = 'media';   // gráfica integrada
    else q = 'alta';                                                                                          // desconocida
    const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
    if ((cores <= 4 || mem <= 4) && Q_ORDER.indexOf(q) < 2) q = 'media';                                     // pocos núcleos o poca memoria
    console.info(`Calidad automática: ${q} (GPU: ${gpu || 'desconocida'}, ${cores} núcleos)`);
    return q;
  }
  const chase = { yaw: 0, pitch: 0.3, dist: 9, drag: false, lastDrag: 0 };   // cámara en 3ª persona
  const rcam = { yaw: 0, pitch: 0, zoom: 1, drag: false, dist: 0, aim: new THREE.Vector3() };   // cámara del mástil
  const tele = { yaw: 0, pitch: 0, fov: 6.5, drag: false };   // Vista Tierra: teleobjetivo desde la estación
  const TOUCH = { pts: new Map(), d0: 0, base: null };          // dedos sobre la vista 3D (pellizco para acercar)
  let grainsUpd = () => {}, dustUpd = () => {};
  let iceMesh, detMesh, psrMesh, crystals, detCanvas, detCtx, detTex;
  const R3 = {}, ST = {}, BIO = {}, COL = {};
  let trailGeo, trail, holesGroup, wpMarker, candMarker, locator, pickMarker;
  let warp = 120, camMode = 'rover', visible = true, lastUI = 0, lastTex = 0, lastChart = 0, lastHover = 0, holesDrawn = 0;
  const keys = {}, camKeys = {}, labels = [];
  const COBALT = 0x5266eb, IVORY = 0xededf3;
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();

  const TASKS = { idle: 'En estación · cargando batería', explore: 'Explorando: busca señal de hielo', goto: 'Va hacia una zona prometedora', characterize: 'Midiendo cuánto hielo hay',
    decide: 'Decidiendo si perforar', drill: 'Perforando', reposition: 'Se mueve unos metros para otra perforación', return: 'Vuelve a la estación', manual: 'Control manual', dead: 'Sin energía: inmovilizado' };

  // =====================================================================
  // TEXTURAS PROCEDURALES
  // =====================================================================
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 4; return t;
  }
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
    THREE.ColorManagement.enabled = false;   // los colores en hexadecimal se usan tal cual (como en la versión anterior)
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1)); IceEnv.renderer = renderer;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    renderer.shadowMap.autoUpdate = false;                                  // el mapa de sombras se recalcula solo cuando algo cambia (ver frame)                                        // estadísticas del fotograma completo (escena + sombras + efectos)
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(46, 1, 0.25, 100000);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.495, minDistance: 2.2, maxDistance: W.SIZE * 2.5, rotateSpeed: 0.8, zoomSpeed: 1.1 });
    // Pantallas táctiles: un dedo desplaza la vista sobre el terreno y dos dedos giran y acercan, como en un mapa
    if (THREE.TOUCH) { controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }; controls.screenSpacePanning = false; }

    // Luz: Sol rasante real (1,2° sobre el horizonte) con sombras que siguen a la cámara; luz cenicienta de la Tierra;
    // reflejo del terreno iluminado (mapa de entorno). La "luz de apoyo" es opcional y no es realista.
    const sd = W.sunDir;
    sun = new THREE.DirectionalLight(0xfff4e6, 3.6 * Math.PI); sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    scene.add(sun, sun.target); IceEnv.updateSun(sun, W, new THREE.Vector3(), 400);
    scene.add(new THREE.AmbientLight(0xffffff, 0.02 * Math.PI));   // casi nada: en la Luna las sombras son negras
    fill = new THREE.DirectionalLight(0xf2f2f2, 0.13 * Math.PI); fill.position.set(-sd.x * W.SIZE * 0.6, W.SIZE, -sd.z * W.SIZE * 0.6); scene.add(fill);
    SV = IceEnv.sunVisTexture(W);
    sky = IceEnv.buildSky(W, scene); sky.U.pr.value = renderer.getPixelRatio(); if (Q.pr >= 1.5) sky.loadHiRes();   // Máxima y Alta: Tierra en 8K desde el inicio
    earthshine = new THREE.DirectionalLight(0xc9d6ff, 0.045 * Math.PI); earthshine.position.copy(sky.earthDir).multiplyScalar(W.SIZE); scene.add(earthshine);
    scene.environment = IceEnv.envMap(renderer, W); scene.environmentIntensity = 0.35;   // r170 sí aplica el entorno: lo justo para los reflejos
    buildComposer();

    // Terreno: relieve real LOLA + microcráteres, guijarros y variación de albedo
    const geo = new THREE.PlaneGeometry(W.SIZE, W.SIZE, W.N - 1, W.N - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      pos.setY(k, W.H[k]);
      const x = pos.getX(k), z = pos.getZ(k), i = k % W.N, j = Math.floor(k / W.N), Hh = (a, b) => W.H[Math.min(W.N - 1, Math.max(0, b)) * W.N + Math.min(W.N - 1, Math.max(0, a))];
      const lap = (Hh(i + 1, j) + Hh(i - 1, j) + Hh(i, j + 1) + Hh(i, j - 1) - 4 * W.H[k]) / 4;   // <0 cresta, >0 hondonada
      const g = IceEnv.albedoAt(x, z, W.slopeAt(x, z)) * (1 - Math.max(-0.1, Math.min(0.1, lap * 0.08)));
      col[k * 3] = g; col[k * 3 + 1] = g; col[k * 3 + 2] = g * 1.02;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    terrain = mesh(geo, IceEnv.terrainMaterial(W, SV, false, true)); terrain.castShadow = false;
    scene.add(terrain);
    if (W.real && W.shackleton) IceEnv.buildFar(W, SV, scene, geo.attributes.normal);
    // La Tierra, en la dirección real (longitud 0 lunar) y algo por encima del horizonte (dentro del rango de libración)
    sky.placeEarth(IceEnv.farHeight || ((x, z) => W.hAt(x, z)), new THREE.Vector3(W.station.x, W.hAt(W.station.x, W.station.z) + 2, W.station.z));
    earthshine.position.copy(sky.earthDir).multiplyScalar(W.SIZE);
    detailUpd = IceEnv.detailTerrain(W, geo, SV, scene);   // terreno detallado alrededor de la cámara
    grainsUpd = IceEnv.nearGrains(W, scene, detailUpd.heightAt); dustUpd = IceEnv.wheelDust(W, scene);
    tracks = IceEnv.wheelTracks(W, scene);
    detailUpd.onRegen = (cx, cz, hp) => tracks.reproject(hp > 0 ? detailUpd.heightFaded : null, cx, cz, hp);   // huellas de las ruedas sobre el regolito   // entorno lejano aproximado del cráter

    // Capas sobre el terreno
    const overlay = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    iceL = IceEnv.iceLayer(W, geo); iceMesh = iceL.mesh; scene.add(iceMesh);   // escarcha con destellos (visualización del hielo)
    psrMesh = new THREE.Mesh(geo, overlay(gridTex(320, (x, z) => W.fracAt(W.psr, x, z) > 0.5 ? [40, 44, 70, 0.45] : null))); psrMesh.visible = false; scene.add(psrMesh);
    detCanvas = document.createElement('canvas'); detCanvas.width = W.KG * 8; detCanvas.height = W.KG * 8; detCtx = detCanvas.getContext('2d');
    detTex = new THREE.CanvasTexture(detCanvas); detTex.anisotropy = 4;
    detMesh = new THREE.Mesh(geo, overlay(detTex)); detMesh.renderOrder = 2; scene.add(detMesh);

    buildCrystals(); buildBoulders(); updNearRocks = IceEnv.nearRocks(W, scene);
    IceEnv.loadScanned(W, scene, location.protocol === 'file:');   // rocas y regolito escaneados (Poly Haven, CC0)
    buildRover(); buildStation(); buildColony(); refreshObstacles(); buildMarkers(); loadCustomModels(); buildDrillFX();
    IceEnv.patchTree(scene, SV);
    addLabel('Estación solar y planta de agua', () => new THREE.Vector3(W.station.x, W.hAt(W.station.x, W.station.z) + 10, W.station.z));
    addLabel('Zona en sombra permanente: aquí está el hielo', () => new THREE.Vector3(W.psrMain.x, W.hAt(W.psrMain.x, W.psrMain.z) + 60, W.psrMain.z), 'ov');
    addLabel('Colonia UKU PACHA', () => new THREE.Vector3(W.colony.x, W.hAt(W.colony.x, W.colony.z) + 14, W.colony.z), 'far');   // de cerca mandan las etiquetas de los sectores
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
    g.putImageData(img, 0, 0);
    const c2 = document.createElement('canvas'); c2.width = c2.height = res * 2; const g2 = c2.getContext('2d');   // bordes suaves
    g2.filter = 'blur(2px)'; g2.imageSmoothingEnabled = true; g2.drawImage(c, 0, 0, res * 2, res * 2);
    const t = new THREE.CanvasTexture(c2); t.anisotropy = 4; return t;
  }

  // Cristales de hielo: visualización de dónde hay hielo bajo el suelo (densidad ∝ concentración)
  function buildCrystals() {
    const geo = IceEnv.crystalGeometry();
    const m = new THREE.MeshStandardMaterial({ color: 0xd8e4ff, emissive: 0x2c4aa8, emissiveIntensity: 0.35, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.8, transparent: true, opacity: 0.82 });
    crystals = new THREE.InstancedMesh(geo, m, 14000);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 600000 && n < 14000; i++) {
      const x = (Math.random() - 0.5) * W.SIZE * 0.98, z = (Math.random() - 0.5) * W.SIZE * 0.98, w = W.iceWt(x, z);
      if (w < 0.8 || Math.random() > w / 16) continue;
      const k = 0.55 + Math.random() * 0.9 + w / 10;
      p.set(x, W.hAt(x, z) + 0.05 * k, z); e.set(Math.random() * 0.6, Math.random() * 6.3, Math.random() * 0.6); q.setFromEuler(e); s.setScalar(k);
      m4.compose(p, q, s); crystals.setMatrixAt(n++, m4);
    }
    crystals.count = n; crystals.castShadow = false; scene.add(crystals);
  }

  function buildBoulders() {
    const rocks = new THREE.InstancedMesh(IceEnv.rockGeometry(11, 2), IceEnv.rockMaterial(), 2600);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 12000 && n < 2600; i++) {
      const x = (Math.random() - 0.5) * W.SIZE * 0.96, z = (Math.random() - 0.5) * W.SIZE * 0.96;
      if (Math.hypot(x - W.station.x, z - W.station.z) < 25 || Math.hypot(x - W.colony.x, z - W.colony.z) < 80 || W.slopeAt(x, z) > 26) continue;
      const k = Math.pow(Math.random(), 3) * 1.8 + 0.15;
      e.set(Math.random() * 3, Math.random() * 6.3, Math.random() * 3); q.setFromEuler(e); s.set(k * (0.8 + Math.random() * 0.5), k * 0.6, k * (0.8 + Math.random() * 0.5));
      p.set(x, W.hAt(x, z) + k * 0.15, z); m4.compose(p, q, s); rocks.setMatrixAt(n++, m4);
      if (k > 0.6) BOULDER_OBS.push({ t: 'c', x, z, r: (s.x + s.z) / 2 * 0.85 });   // las más bajas (< ~30 cm) se pueden pasar por encima
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
    IceEnv.registerRocks(rocks, scene, 0.1);
  }

  // ---------- Colisiones: cada pieza visible de la estación y la colonia, las rocas grandes y la tubería ----------
  // Se ignoran las piezas a ras de suelo (< 35 cm: plataformas, cables) y las que quedan por encima del rover (> 2,9 m).
  const BOULDER_OBS = [];
  function refreshObstacles() {
    const list = BOULDER_OBS.slice(), box = new THREE.Box3();
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    for (const g of [ST.g, COL.g]) {
      if (!g) continue;
      g.updateMatrixWorld(true);
      g.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !shown(o)) return;
        box.setFromObject(o); if (box.isEmpty()) return;
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, gy = W.hAt(cx, cz);
        if (box.max.y - gy < 0.35 || box.min.y - gy > 2.9) return;
        list.push({ t: 'b', x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z });
      });
    }
    if (COL.curve) { const pts = COL.curve.getPoints(Math.max(24, Math.round(COL.curve.getLength() / 3)));
      for (let k = 1; k < pts.length; k++) list.push({ t: 's', ax: pts[k - 1].x, az: pts[k - 1].z, bx: pts[k].x, bz: pts[k].z, r: 0.2 }); }
    sim.cmd.setObstacles(list);
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
    const head2 = new THREE.SpotLight(0xf2f4ff, 820, 90, 0.6, 0.45, 2); head2.position.set(1.15, 1.1, 0); head2.target.position.set(12, -1, 0); g.add(head2, head2.target);
    const work = new THREE.PointLight(0xe8ecff, 15, 9, 2); work.position.set(0, 3.3, 0); g.add(work);
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
    const lamp = new THREE.PointLight(0xffffff, 0.0, 4.5, 2); lamp.position.y = 2.2; bio.add(lamp);
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
    Object.assign(ST, { g, glow, frost, water, flowCurve, flowDots, tank }); Object.assign(BIO, { bio, dper, pext, lichen, lamp, ring, rock, worldPos: () => bio.getWorldPosition(new THREE.Vector3()) });
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
    const lamp = new THREE.PointLight(0xfff1dc, 360, 40, 2); lamp.position.set(0, 8, 0); g.add(lamp);
    scene.add(g);
    const dots = [];
    for (let k = 0; k < 40; k++) { const d = mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa9b6ff }), 0, 0, 0, scene); d.castShadow = false; d.visible = false; dots.push(d); }
    Object.assign(COL, { g, water, dots, lamp, metal });
    buildPipe(new THREE.Vector3(c.x - 6, y0, c.z - 8), y0 + 2);
  }
  // ---------- Colonia UKU PACHA MK-I (investigación «Colonia» + maqueta uku_pacha_mk1) ----------
  // Las superficies y capacidades son parámetros conceptuales de la investigación, no un diseño certificado.
  // El modelo de Blender (assets/models/colony.glb) nombra cada pieza empezando por su sector:
  // A…G = sectores, N = energía, R = berma de regolito (R_A… cubre un módulo del sector A).
  const COLONIA = {
    A: { code: 'A', short: 'Habitacional', title: 'Complejo habitacional', type: 'Sector habitable', area: '240 m²', cap: '10 personas', capa: 'hab',
      desc: 'Alojamiento de la tripulación: dormitorios individuales, cocina, comedor, baños, zona común, almacenamiento personal y área de ejercicio. Queda junto al soporte vital para acortar recorridos y facilitar evacuaciones.',
      feat: ['Dormitorios individuales con privacidad', 'Cocina, comedor y zona común', 'Área de ejercicio', 'Iluminación circadiana y ventilación', 'Corredores presurizados aislables'] },
    B: { code: 'B', short: 'Ciencia', title: 'Centro científico', type: 'Investigación', area: '90 m²', cap: '6 investigadores', capa: 'hab',
      desc: 'Laboratorio de geología, análisis de muestras, microscopía y caracterización del regolito. Aquí se mide cuánta agua tienen las muestras que trae el rover y qué otros volátiles contienen.',
      feat: ['Análisis de regolito y hielo', 'Microscopía', 'Control de muestras sin contaminación cruzada', 'Esclusa propia'] },
    C: { code: 'C', short: 'Invernadero', title: 'Invernadero', type: 'Producción agrícola', area: '80 m²', cap: '4 operadores', capa: 'hab',
      desc: 'Laboratorio agrícola con hidroponía e iluminación LED. Complementa los alimentos traídos de la Tierra y aporta bienestar; no busca la autosuficiencia alimentaria.',
      feat: ['Cultivo hidropónico (sin suelo)', 'Iluminación LED', 'Control de humedad y nutrientes', 'Recirculación de agua'] },
    D: { code: 'D', short: 'Médico', title: 'Centro médico', type: 'Salud y emergencias', area: '25 m²', cap: '1–2 pacientes', capa: 'hab',
      desc: 'Atención primaria, diagnóstico, aislamiento médico, botiquín avanzado y telemedicina con la Tierra.',
      feat: ['Diagnóstico básico', 'Telemedicina', 'Aislamiento sanitario', 'Botiquín avanzado'] },
    E: { code: 'E', short: 'Taller', title: 'Taller industrial', type: 'Mantenimiento', area: '55 m²', cap: '4 técnicos', capa: 'hab',
      desc: 'Reparación de herramientas, mantenimiento del rover, repuestos y fabricación experimental de piezas no críticas. Está separado de las zonas habitables por el polvo.',
      feat: ['Mantenimiento de rovers', 'Impresión 3D experimental', 'Banco de pruebas', 'Almacén de repuestos críticos'] },
    F: { code: 'F', short: 'Soporte vital', title: 'Soporte vital', type: 'Sistemas críticos', area: '60 m²', cap: 'Acceso técnico', capa: 'hab', agua: true,
      desc: 'Tratamiento y almacenamiento de agua, control del aire, eliminación de CO₂, oxígeno por electrólisis y gestión de residuos. Aquí llega por tubería el agua que produce ICEWISE.',
      feat: ['Depósitos de agua de la colonia', 'Reciclaje de agua (90 %, supuesto)', 'Oxígeno por electrólisis del agua', 'Eliminación de CO₂', 'Equipos redundantes'] },
    G: { code: 'G', short: 'Logística', title: 'Zona logística', type: 'Infraestructura exterior', area: 'Exterior', cap: 'Vehículos y carga', capa: 'log',
      desc: 'Garaje de rovers, esclusa de carga, antena de comunicaciones y una zona de aterrizaje alejada del complejo para que el polvo de los motores no dañe hábitats ni paneles.',
      feat: ['Garaje de rovers', 'Antena de comunicaciones', 'Zona de aterrizaje separada', 'Rutas de servicio'] },
    N: { code: 'EN', short: 'Energía', title: 'Centro energético', type: 'Infraestructura energética', area: 'Exterior', cap: 'Red de la colonia', capa: 'ene',
      desc: 'Paneles solares verticales que siguen al Sol (en el polo está a solo 1–2° sobre el horizonte), baterías para los periodos de sombra y distribución eléctrica. La fisión de superficie se estudia como fuente continua para etapas futuras.',
      feat: ['Paneles solares verticales', 'Baterías', 'Distribución protegida', 'Ampliable por módulos'] }
  };
  const COL_ETAPAS = [[10, 'MK-I · inicial', 'Validar habitabilidad, soporte vital, energía, comunicaciones y operaciones robóticas.'],
    [24, 'Expansión 1', 'Más módulos y almacenamiento; demostrar que los sistemas críticos toleran más demanda.'],
    [36, 'Expansión 2', 'Ampliar laboratorio, taller, invernadero y generación eléctrica.'],
    [48, 'Expansión 3', 'Redundancia, producción local de recursos, reservas y capacidad médica.']];
  const sectorDeNombre = (n) => { const m = /^([A-GNR])_?([A-G])?/.exec(n || ''); if (!m) return null; return m[1] === 'R' ? (m[2] || null) : m[1]; };
  // Al cargar colony.glb: cada pieza se apoya en el relieve real, los paneles miran al Sol, los sectores
  // quedan marcados para seleccionarlos y la tubería llega al nuevo depósito de agua.
  function setupColonyModel(scn) {
    const g = COL.g, y0 = g.position.y, az = Math.atan2(W.sunDir.z, W.sunDir.x);
    COL.sectors = {}; COL.capas = { hab: [], reg: [], ene: [], log: [] }; COL.model = scn;
    COL.techos = scn.children.filter(o => /_techo$/.test(o.name));
    COL.interiores = scn.children.filter(o => /_int$/.test(o.name));
    // El complejo presurizado (módulos, nodos, pasillos, esclusas, invernadero) va entero a una sola altura
    // (como sobre una explanada nivelada): así los suelos casan y se puede caminar de una sala a otra.
    const pres = scn.children.filter(o => o.userData.presurizado);
    COL.presOff = pres.length ? pres.reduce((s, o) => s + W.hAt(g.position.x + o.position.x, g.position.z + o.position.z) - y0, 0) / pres.length : 0;
    g.updateMatrixWorld(true);
    COL.interiores.forEach(o => { o.visible = false; o.traverse(m => { if (m.isMesh) m.castShadow = false; });
      const bb = new THREE.Box3().setFromObject(o); o.userData.c = bb.getCenter(new THREE.Vector3()).sub(scn.getWorldPosition(new THREE.Vector3())); o.userData.r = bb.getSize(new THREE.Vector3()).length() / 2; });
    navLoad(scn);
    [...scn.children].forEach(o => {
      const wx = g.position.x + o.position.x, wz = g.position.z + o.position.z;
      o.position.y += o.userData.presurizado ? COL.presOff : W.hAt(wx, wz) - y0;   // cada sector sobre su suelo
      if (o.name === 'NAV') return;
      if (/^N_solar/i.test(o.name)) o.rotation.y = -az;                        // paneles de cara al Sol
      if (/^G_aterrizaje/i.test(o.name)) {                                     // la plataforma se apoya en la pendiente real
        const e = 3, nx = W.hAt(wx - e, wz) - W.hAt(wx + e, wz), nz = W.hAt(wx, wz - e) - W.hAt(wx, wz + e);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 2 * e, nz).normalize());
      }
      const key = sectorDeNombre(o.name);
      const capa = /^R/.test(o.name) ? 'reg' : key && COLONIA[key] ? COLONIA[key].capa : null;
      if (capa) COL.capas[capa].push(o);
      if (!key) return;
      (COL.sectors[key] = COL.sectors[key] || { objs: [], mats: new Map() }).objs.push(o);
      o.traverse(m => {
        m.userData.sector = key;
        if (!m.isMesh || !m.material || m.material.transparent) return;
        const sec = COL.sectors[key];                                          // material propio por sector (para resaltarlo)
        if (!sec.mats.has(m.material)) { const c = m.material.clone(); if (c.emissive) { c.userData.em0 = c.emissive.getHex(); c.userData.ei0 = c.emissiveIntensity; } sec.mats.set(m.material, c); }
        m.material = sec.mats.get(m.material);
      });
    });
    g.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    // pieza principal de cada sector: ahí van su etiqueta y el centro de la cámara (algunos sectores están repartidos)
    const PRINCIPAL = { A: 'A_hab_2', B: 'B_ciencia', C: 'C_invernadero', D: 'D_medico', E: 'E_taller', F: 'F_soporte', G: 'G_garaje', N: 'N_baterias' };
    Object.entries(COL.sectors).forEach(([key, sec]) => {
      const main = scn.getObjectByName(PRINCIPAL[key] || '');
      caja.makeEmpty();
      if (main) caja.expandByObject(main); else sec.objs.filter(o => !/^R/.test(o.name)).forEach(o => caja.expandByObject(o));
      if (caja.isEmpty()) sec.objs.forEach(o => caja.expandByObject(o));
      sec.center = caja.getCenter(new THREE.Vector3()); sec.size = caja.getSize(new THREE.Vector3());
      const top = caja.max.y + 1.5, info = COLONIA[key];
      if (info) sec.label = addLabel(`${info.code} · ${info.short}`, () => new THREE.Vector3(sec.center.x, top, sec.center.z), 'col');
    });
    // Agua de la colonia: la malla F_agua (origen en su base) sube y baja con la reserva
    const agua = scn.getObjectByName('F_agua');
    if (agua) {
      COL.water.visible = false; COL.water = agua; COL.waterModel = true; agua.userData.sy = agua.scale.y;
      const p = agua.getWorldPosition(new THREE.Vector3());
      buildPipe(new THREE.Vector3(p.x, p.y, p.z), p.y + 2.2);
    }
    if (COL.lamp) COL.lamp.position.y = 14;
    colonySelect(COL.sel || 'A', false);
    refreshObstacles();
  }
  function colonySelect(key, volar = true) {
    const info = COLONIA[key]; if (!info) return;
    COL.sel = key;
    const ver = !$('#sim-colony').hidden && !COL.corte && camMode !== 'inside';   // resaltado solo con la ventana abierta y vista exterior
    Object.entries(COL.sectors || {}).forEach(([k, sec]) => sec.mats.forEach(m => { if (m.emissive) { const on = ver && k === key, lit = (m.userData.em0 || 0) !== 0; if (on && !lit) { m.emissive.setHex(0x24316e); m.emissiveIntensity = 0.45; } else { m.emissive.setHex(m.userData.em0 || 0); m.emissiveIntensity = m.userData.ei0 ?? 1; } } }));   // las piezas que ya brillan (luces, pantallas) conservan su brillo
    $$('#col-sectores button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === key)));
    set('col-code', info.code); set('col-title', info.title); set('col-type', info.type);
    set('col-area', info.area); set('col-cap', info.cap); set('col-desc', info.desc);
    $('#col-feat').innerHTML = info.feat.map(f => `<li>${f}</li>`).join('');
    $('#col-agua-sec').hidden = !info.agua;
    colonySalas(key);
    const sec = COL.sectors && COL.sectors[key];
    if (volar && sec) {                                                        // la cámara vuela hasta el sector
      setCam('colony');
      const d = Math.max(26, sec.size.length() * 1.9);
      COL.focus = sec.center.clone();
      controls.target.copy(sec.center); camera.position.set(sec.center.x - d * 0.55, sec.center.y + d * 0.55, sec.center.z + d * 0.75);
    }
  }
  // ---------- Interior de la colonia: recorrido en primera persona ----------
  // «Ver interior»: oculta techos (*_techo) y bermas, como una maqueta en corte, y muestra los muebles (*_int).
  // «Entrar»: se camina por dentro (W A S D, arrastrar para mirar). El modelo trae una malla de navegación (objeto NAV:
  // rejilla de 10 cm con el suelo libre de paredes y muebles) para no atravesar nada, y la lista de salas.
  // WALK guarda posición y mirada: más adelante podrá llevar a un astronauta en vez de a la cámara.
  const SALAS = { A_hab_1: 'Dormitorios A1', A_hab_2: 'Dormitorios A2 y baño', A_hab_3: 'Zona común A3', B_ciencia: 'Laboratorio',
    B_esclusa: 'Esclusa B', C_invernadero: 'Invernadero', D_medico: 'Sala médica', E_taller: 'Taller', F_soporte: 'Soporte vital' };
  const WALK = { on: false, x: 0, z: 0, yaw: 0, pitch: 0, keys: {}, drag: false, px: 0, py: 0, bob: 0, room: '', roomT: 0, spawn: null, eye: 1.62 };
  window.ICE_WALK = WALK;                                                     // acceso para depurar y, más adelante, para el astronauta
  function navLoad(scn) {
    const n = scn.getObjectByName('NAV'); COL.nav = null; if (!n || !n.userData.nav_rle) return;
    const u = n.userData, w = u.nav_w, h = u.nav_h, grid = new Uint8Array(w * h);
    let k = 0, v = 0; String(u.nav_rle).split(',').forEach(t => { const r = +t; if (v) grid.fill(1, k, k + r); k += r; v ^= 1; });
    let rooms = [], spawns = {};
    try { rooms = JSON.parse(u.nav_rooms || '[]'); spawns = JSON.parse(u.nav_spawns || '{}'); } catch (e) { /* sin salas */ }
    COL.nav = { x0: u.nav_x0, y0: u.nav_y0, cell: u.nav_cell, w, h, grid, floor: u.nav_floor, rooms, spawns, img: null };
  }
  // coordenadas del modelo (Three: x, z) ↔ rejilla (Blender: x, y = −z)
  function navOk(lx, lz) {
    const N = COL.nav; if (!N) return false;
    const i = Math.floor((lx - N.x0) / N.cell), j = Math.floor((-lz - N.y0) / N.cell);
    return i >= 0 && j >= 0 && i < N.w && j < N.h && N.grid[j * N.w + i] === 1;
  }
  function navRoom(lx, lz) {
    const N = COL.nav, bx = lx, by = -lz; if (!N) return '';
    const r = N.rooms.find(q => bx >= q[1] && bx <= q[3] && by >= q[2] && by <= q[4]);
    return r ? r[0] : '';
  }
  function colonyLuz() {
    if (!COL.luz) { COL.luz = new THREE.PointLight(0xfff2e2, 0, 16, 1.6); scene.add(COL.luz); }
    if (!COL.hemi) { COL.hemi = new THREE.HemisphereLight(0xfff6ea, 0x3a3a44, 0); scene.add(COL.hemi); }
    COL.hemi.intensity = WALK.on ? 0.42 : 0;
    if (WALK.on) { COL.luz.distance = 8; COL.luz.decay = 1.5; COL.luz.intensity = 4.5; }
    else if (COL.corte) { const c = COL.g.position; COL.luz.position.set(c.x, c.y + 18, c.z); COL.luz.distance = 90; COL.luz.decay = 1.2; COL.luz.intensity = 260; }
    else COL.luz.intensity = 0;
  }
  function colonyInteriores() {
    const hab = $('#col-capas input[data-capa="hab"]');
    (COL.interiores || []).forEach(o => {
      let v = (COL.corte || WALK.on) && (!hab || hab.checked || WALK.on);
      if (v && WALK.on && o.userData.c) v = Math.hypot(o.userData.c.x - WALK.x, o.userData.c.z - WALK.z) < o.userData.r + 18;   // dentro solo se dibujan los muebles de las salas cercanas
      o.visible = v;
    });
  }
  function colonyCorte(on) {
    COL.corte = on;
    (COL.techos || []).forEach(o => { o.visible = !on || WALK.on; });
    const reg = $('#col-capas input[data-capa="reg"]');
    ((COL.capas || {}).reg || []).forEach(o => { o.visible = !on && !WALK.on && (!reg || reg.checked); });
    $('#col-corte').setAttribute('aria-pressed', String(on));
    colonyInteriores();
    colonySelect(COL.sel || 'A', false); colonyLuz();
    if (on && camMode !== 'inside' && COL.sectors && COL.sectors[COL.sel]) colonySelect(COL.sel, true);
    refreshObstacles();
  }
  // Entrar: por la esclusa A (entrada principal) o directamente a una sala
  function colonyEnter(nombre) {
    if (!COL.nav) { toast('El modelo de la colonia aún se está cargando.'); return; }
    WALK.spawn = nombre || 'A_esclusa'; setCam('inside');
  }
  function walkStart(nombre) {
    const N = COL.nav; if (!N) return;
    const sp = N.spawns[nombre] || N.spawns.A_esclusa || Object.values(N.spawns)[0]; if (!sp) return;
    WALK.on = true; WALK.x = sp[0]; WALK.z = -sp[1]; WALK.yaw = Math.atan2(-(sp[2] - sp[0]), -(-sp[3] + sp[1])); WALK.pitch = -0.05;
    WALK.keys = {}; WALK.room = ''; COL.dentro = nombre;
    controls.enabled = false;
    (COL.techos || []).forEach(o => { o.visible = true; });                    // dentro, con techo
    ((COL.capas || {}).reg || []).forEach(o => { o.visible = false; });     // las bermas atraviesan los cascos por dentro
    colonyInteriores(); colonyLuz(); colonySelect(COL.sel || 'A', false);
    $('#sim-walk').hidden = false; $('#col-dentro-fila').hidden = false; $('#sim-campad').hidden = true;
    walkMapPrep(); walkUpdate(0);
    $('#sim-view').focus({ preventScroll: true });
    toast('W A S D para caminar · arrastra para mirar · Shift para correr · Esc para salir');
  }
  function colonyInsideOff() {
    if (!WALK.on) return;
    WALK.on = false; COL.dentro = null; WALK.keys = {}; colonyLuz();
    (COL.techos || []).forEach(o => { o.visible = !COL.corte; });
    const reg = $('#col-capas input[data-capa="reg"]');
    ((COL.capas || {}).reg || []).forEach(o => { o.visible = !COL.corte && (!reg || reg.checked); });
    colonyInteriores();
    $('#sim-walk').hidden = true; $('#sim-campad').hidden = false;
    const f = $('#col-dentro-fila'); if (f) f.hidden = true;
    setTimeout(() => colonySelect(COL.sel || 'A', false), 0);
  }
  // Paso a paso: velocidad de una persona (1,4 m/s; 2,6 corriendo), en tiempo real aunque el tiempo vaya acelerado.
  // Si el paso choca, se intenta deslizar a lo largo de la pared.
  function walkUpdate(dt) {
    const k = WALK.keys, f = (k.w ? 1 : 0) - (k.s ? 1 : 0), r = (k.d ? 1 : 0) - (k.a ? 1 : 0), turn = (k.tl ? 1 : 0) - (k.tr ? 1 : 0);
    if (turn) WALK.yaw += turn * 1.8 * dt;
    const moving = !!(f || r);
    if (moving) {
      const sp = k.shift ? 2.6 : 1.4, len = Math.hypot(f, r), sy = Math.sin(WALK.yaw), cy = Math.cos(WALK.yaw);
      const dx = (-sy * f + cy * r) / len * sp * dt, dz = (-cy * f - sy * r) / len * sp * dt;
      if (navOk(WALK.x + dx, WALK.z + dz)) { WALK.x += dx; WALK.z += dz; }
      else if (navOk(WALK.x + dx, WALK.z)) WALK.x += dx;
      else if (navOk(WALK.x, WALK.z + dz)) WALK.z += dz;
      WALK.bob += dt * sp * 5.2;
    }
    const y = COL.nav.floor + COL.presOff + WALK.eye + (moving ? Math.sin(WALK.bob) * 0.022 : 0);
    const eye = COL.model.localToWorld(new THREE.Vector3(WALK.x, y, WALK.z));
    camera.position.copy(eye); camera.rotation.order = 'YXZ'; camera.rotation.set(WALK.pitch, WALK.yaw, 0);
    const fwd = new THREE.Vector3(-Math.sin(WALK.yaw) * Math.cos(WALK.pitch), Math.sin(WALK.pitch), -Math.cos(WALK.yaw) * Math.cos(WALK.pitch));
    controls.target.copy(eye).addScaledVector(fwd, 2.5);
    if (COL.luz) COL.luz.position.copy(eye).add(new THREE.Vector3(0, 0.35, 0));
    const now = performance.now();
    if (now - WALK.roomT > 180) {
      WALK.roomT = now; const room = navRoom(WALK.x, WALK.z) || WALK.room;
      if (room !== WALK.room) { WALK.room = room; set('sw-room', room); set('col-dentro', 'Dentro: ' + room); }
      walkMapDraw(); colonyInteriores();
    }
  }
  // Minimapa: la rejilla de navegación dibujada una vez; encima, la posición y hacia dónde se mira
  function walkMapPrep() {
    const N = COL.nav, cv = $('#sw-map'); if (!N || !cv) return;
    if (!N.img) {
      const off = document.createElement('canvas'); off.width = N.w; off.height = N.h;
      const g = off.getContext('2d'), id = g.createImageData(N.w, N.h);
      for (let j = 0; j < N.h; j++) for (let i = 0; i < N.w; i++) {
        if (!N.grid[j * N.w + i]) continue;
        const o = ((N.h - 1 - j) * N.w + i) * 4; id.data[o] = 205; id.data[o + 1] = 207; id.data[o + 2] = 218; id.data[o + 3] = 150;
      }
      g.putImageData(id, 0, 0); N.img = off;
    }
  }
  function walkMapDraw() {
    const N = COL.nav, cv = $('#sw-map'); if (!N || !N.img || !cv || $('#sim-walk').hidden) return;
    const g = cv.getContext('2d'), W2 = cv.width, H2 = cv.height, s = Math.min(W2 / N.w, H2 / N.h);
    const ox = (W2 - N.w * s) / 2, oy = (H2 - N.h * s) / 2;
    g.clearRect(0, 0, W2, H2); g.imageSmoothingEnabled = true; g.drawImage(N.img, ox, oy, N.w * s, N.h * s);
    g.font = '600 9px Inter, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(237,237,243,.75)';
    N.rooms.forEach(q => { if (!/·/.test(q[0])) return; const cx = ((q[1] + q[3]) / 2 - N.x0) / N.cell, cy = ((q[2] + q[4]) / 2 - N.y0) / N.cell;
      g.fillText(q[0].split(' · ')[0], ox + cx * s, oy + (N.h - cy) * s + 3); });
    const px = ox + (WALK.x - N.x0) / N.cell * s, py = oy + (N.h - (-WALK.z - N.y0) / N.cell) * s;
    const dx = -Math.sin(WALK.yaw), dy = Math.cos(WALK.yaw);                // hacia dónde se mira (Blender x, y)
    g.save(); g.translate(px, py); g.rotate(Math.atan2(dx, dy));
    g.fillStyle = 'rgba(82,102,235,.28)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 16, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.fill();
    g.fillStyle = '#5266eb'; g.strokeStyle = '#ededf3'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 4.5); g.lineTo(0, 2.5); g.lineTo(-4.5, 4.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  function colonySalas(key) {
    const box = $('#col-salas'); if (!box) return;
    const salas = Object.keys(SALAS).filter(n => n[0] === key && COL.model && COL.model.getObjectByName(n));
    box.innerHTML = salas.map(n => '<button type="button" class="btn btn--sm" data-sala="' + n + '">Ir a · ' + SALAS[n] + '</button>').join('');
    box.hidden = !salas.length;
    $$('#col-salas [data-sala]').forEach(b => b.addEventListener('click', () => colonyEnter(b.dataset.sala)));
  }
  function colonyCapa(capa, on) {
    if (capa === 'lbl') { COL.labelsOff = !on; return; }
    ((COL.capas || {})[capa] || []).forEach(o => { o.visible = on && !(capa === 'reg' && (COL.corte || WALK.on)) && !/_int$/.test(o.name); });
    colonyInteriores();
    refreshObstacles();
  }
  function bindCamPad() {
    $$('#sim-campad [data-m]').forEach(b => {
      const on = e => { e.preventDefault(); camKeys[b.dataset.m] = true; b.classList.add('is-on'); };
      const off = () => { camKeys[b.dataset.m] = false; b.classList.remove('is-on'); };
      b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, off));
    });
  }
  function bindWalk() {
    const el = renderer.domElement;
    el.addEventListener('pointerdown', ev => { if (camMode !== 'inside') return; WALK.drag = true; WALK.px = ev.clientX; WALK.py = ev.clientY; });
    window.addEventListener('pointermove', ev => {
      if (!WALK.drag || TOUCH.pts.size > 1) return;
      WALK.yaw -= (ev.clientX - WALK.px) * 0.0042; WALK.pitch = Math.max(-1.3, Math.min(1.15, WALK.pitch - (ev.clientY - WALK.py) * 0.0042));
      WALK.px = ev.clientX; WALK.py = ev.clientY;
    });
    window.addEventListener('pointerup', () => { WALK.drag = false; });
    $$('#sw-pad [data-w]').forEach(b => {
      const on = e => { e.preventDefault(); WALK.keys[b.dataset.w] = true; b.classList.add('is-on'); };
      const off = () => { WALK.keys[b.dataset.w] = false; b.classList.remove('is-on'); };
      b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, off));
    });
    $('#sw-exit').addEventListener('click', () => setCam('colony'));
  }
  function bindColony() {
    $('#col-sectores').innerHTML = Object.entries(COLONIA).map(([k, s]) => `<button type="button" data-s="${k}" aria-pressed="false"><b>${s.code}</b><span>${s.short}</span></button>`).join('');
    $$('#col-sectores button').forEach(b => b.addEventListener('click', () => colonySelect(b.dataset.s)));
    $$('#col-capas input[data-capa]').forEach(i => i.addEventListener('change', () => colonyCapa(i.dataset.capa, i.checked)));
    $('#col-corte').addEventListener('click', () => colonyCorte(!COL.corte));
    $('#col-salir').addEventListener('click', () => setCam('colony'));
    $('#col-entrar').addEventListener('click', () => colonyEnter('A_esclusa'));
    bindWalk(); bindCamPad();
    $('#col-etapas').innerHTML = COL_ETAPAS.map(([n, t, d], i) => `<li class="${i === 0 ? 'is-on' : ''}"><b>${n}</b><span><strong>${t}</strong>${d}</span></li>`).join('');
    colonySelect('A', false);
  }
  function updateColonyPanel() {
    if ($('#sim-colony').hidden) return;
    const C = S.colony, dem = sim.COLONY.demandKgDay;
    set('col-crew', `${C.crew}`); set('col-agua', `${fmt(C.water, 1)} L`); set('col-dias', `${fmt(C.water / dem, 1)} días`);
    set('col-dem', `${fmt(dem, 1)} L/día`); bar('col-agua-bar', C.water / Math.max(dem * 10, 1));
    set('col-flujo', S.t - C.flowT < 600 ? 'Llegando agua por la tubería' : 'Sin flujo ahora');
  }
  function colonyPick(ev) {
    if (!COL.model) return false;
    const r = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = ray.intersectObject(COL.model, true).find(h => h.object.visible && h.object.userData.sector);
    if (!hit) return false;
    if ($('#sim-colony').hidden) toggleTool('colonia');
    colonySelect(hit.object.userData.sector, false);
    return true;
  }
  // Tubería sobre soportes: del tanque de la planta al depósito de la colonia, siguiendo el terreno.
  // Se reconstruye cuando llega el modelo de Blender (el depósito de UKU PACHA está en otro sitio).
  function buildPipe(b, yEnd) {
    if (COL.pipe) { COL.pipe.traverse(o => { if (o.geometry) o.geometry.dispose(); }); scene.remove(COL.pipe); }
    const pipe = new THREE.Group(), a = ST.tank.getWorldPosition(new THREE.Vector3());
    const pts = [], n = Math.max(12, Math.round(a.distanceTo(b) / 6));
    for (let k = 0; k <= n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; pts.push(new THREE.Vector3(x, W.hAt(x, z) + 1.2, z)); }
    pts[0].y = a.y + 1.6; pts[pts.length - 1].y = yEnd;
    const curve = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(curve, n * 4, 0.16, 8), COL.metal, 0, 0, 0, pipe);
    for (let k = 1; k < n; k += 2) { const q = pts[k]; cyl(0.06, 0.06, 1.2, COL.metal, q.x, q.y - 0.6, q.z, pipe, 6); }
    scene.add(pipe);
    Object.assign(COL, { pipe, curve });
  }

  // ---------- Modelos hechos en Blender (opcionales) ----------
  // Si assets/models/models.json lista un modelo (p. ej. ["rover", "station"]), se carga assets/models/<nombre>.glb
  // y sustituye la parte visual del modelo procedural. Las piezas animadas se conservan:
  //  · rover: objetos llamados "wheel…" giran como ruedas y "drill…"/"auger…" baja al perforar.
  //  · station / colony / biofilter: se mantienen el brillo del horno, la escarcha, el agua y las bacterias.
  // Convención: metros, origen en el suelo en el centro del objeto, frente del rover hacia +X.
  // Con doble clic (file://) el navegador no deja leer .glb ni el decodificador: se usa assets/models/modelos-locales.js,
  // que los trae empaquetados (lo genera tools/empaquetar-modelos.py) y solo se descarga en ese caso.
  const b64ToBuf = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const loadScript = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  function loadCustomModels() {
    if (!THREE.GLTFLoader) return;
    const local = location.protocol === 'file:';
    const listP = local ? loadScript('assets/models/modelos-locales.js').then(() => Object.keys(window.ICE_EMBED || {}))
      : fetch('assets/models/models.json').then(r => r.ok ? r.json() : []);
    listP.then(list => {
      const known = (Array.isArray(list) ? list : []).filter(n => ['rover', 'station', 'colony', 'biofilter'].includes(n));
      loadSet('modelos', 0, known.length || 1); if (!known.length) loadSet('modelos', 1);
      const loader = new THREE.GLTFLoader();
      if (THREE.DRACOLoader) {
        const draco = new THREE.DRACOLoader(); draco.setDecoderPath('assets/vendor/draco170/'); draco.setDecoderConfig({ type: 'wasm' });
        if (local && window.ICE_DRACO) draco._loadLibrary = (url, type) => Promise.resolve(type === 'arraybuffer' ? b64ToBuf(window.ICE_DRACO.wasm) : window.ICE_DRACO.wrapper);
        loader.setDRACOLoader(draco);
      }
      const within = (o, roots) => roots.some(k => { for (let p = o; p; p = p.parent) if (p === k) return true; return false; });
      const hide = (group, keep) => group.traverse(o => { if (o.isMesh && !within(o, keep)) o.visible = false; });
      const prep = (scn) => scn.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
        [].concat(o.material).forEach(m => {
          if (/celda_solar/.test(m.name)) { m.metalness = 0.0; m.roughness = 0.28; m.envMapIntensity = 0.5; m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; }   // vidrio liso con antirreflejo; por delante del sustrato (la compresión los deja a ~1 mm)
          if (/vidrio/.test(m.name)) { m.envMapIntensity = 0.4; m.roughness = Math.max(m.roughness, 0.12); }
        }); });
      const targets = {
        rover: (scn) => {
          const wheels = [], drills = [];
          scn.traverse(o => { if (/^wheel/i.test(o.name)) wheels.push(o); if (/^(drill|auger)/i.test(o.name)) drills.push(o); });
          hide(R3.g, drills.length ? [] : [R3.auger]); R3.g.add(scn);
          if (wheels.length) R3.wheels = wheels;
          if (drills.length) { R3.auger = drills[0]; R3.augerBase = drills[0].position.y; }
          setupRoverAnim(scn);
        },
        station: (scn) => { hide(ST.g, [...ST.flowDots, BIO.lichen, BIO.rock]); ST.g.add(scn); setupStationAnim(scn); },   // se conservan las bacterias, el liquen y la roca del biofiltro
        colony: (scn) => { hide(COL.g, []); COL.g.add(scn); setupColonyModel(scn); },   // UKU PACHA MK-I
        biofilter: (scn) => { hide(BIO.bio, [BIO.lichen]); BIO.bio.add(scn); }
      };
      (Array.isArray(list) ? list : []).forEach(name => {
        if (!targets[name]) return;
        const onLoad = g => { prep(g.scene); targets[name](g.scene); IceEnv.patchTree(g.scene, SV); if (name !== 'rover') refreshObstacles(); loadAdd('modelos'); console.info(`Modelo de Blender cargado: ${name}.glb`); };
        const onErr = e => { loadAdd('modelos'); console.warn(`No se pudo cargar el modelo ${name}; se usa el modelo procedural.`, e || ''); };
        if (local) { try { loader.parse(b64ToBuf(window.ICE_EMBED[name]), '', onLoad, onErr); } catch (e) { onErr(e); } }
        else loader.load(`assets/models/${name}.glb`, onLoad, undefined, onErr);
      });
    }).catch(() => { loadSet('modelos', 1, 1); console.warn('Modelos de Blender no disponibles; se usan los modelos procedurales.'); });
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
    RA.scn = scn;
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
    // Luces azules: tiras de estado en el chasis, luces junto a los faros y resplandor sobre el suelo (el bloom las hace brillar)
    const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.95, 3.2), toneMapped: false });   // sin mapeo de tonos: azul saturado con halo
    const strip = (x, y, z, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blue); m.position.set(x, z, -y); R3.g.add(m); return m; };
    RA.blue = [strip(0, 0.622, 0.95, 1.25, 0.028, 0.012), strip(0, -0.622, 0.95, 1.25, 0.028, 0.012), strip(1.08, 0.6, 0.9, 0.014, 0.075, 0.04), strip(1.08, -0.6, 0.9, 0.014, 0.075, 0.04),
      strip(-1.3, 0.42, 1.0, 0.014, 0.025, 0.32), strip(-1.3, -0.42, 1.0, 0.014, 0.025, 0.32), strip(0.75, -0.32, 2.66, 0.16, 0.012, 0.16)];
    RA.glow = [new THREE.PointLight(0x5266eb, 2.4, 5, 2), new THREE.PointLight(0x5266eb, 2.4, 5, 2)];
    RA.glow[0].position.set(0, 0.35, -0.85); RA.glow[1].position.set(0, 0.35, 0.85); RA.glow.forEach(l => R3.g.add(l));
    RA.leds.forEach(m => { m.emissive = new THREE.Color(0xdfe8ff); });
    RA.beacon.forEach(m => { m.emissive = new THREE.Color(0x5266eb); });
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
    const dark = R3.head && R3.head.intensity > 300;
    RA.leds.forEach(m => { m.emissiveIntensity = alive ? (dark ? 3.2 : 1.6) : 0.05; });
    if (RA.blue) { const k = alive ? 0.8 + 0.2 * Math.sin(t * 2.4) : 0.05; RA.blue[0].material.color.setRGB(0.4 * k, 0.95 * k, 3.2 * k); RA.glow.forEach(l => { l.intensity = alive ? 2.4 * k : 0; }); }
    const busy = Math.abs(R.speed) > 0.005 || task === 'drill' || RA.seq;
    RA.beacon.forEach(m => { m.emissiveIntensity = !alive ? 0 : busy ? (Math.sin(t * 6) > 0 ? 4 : 0.3) : 1.6; });
  }

  // ---------- Animación de la estación de Blender ----------
  // Cada pieza reacciona al estado real de la planta (S.plant): al descargar el rover se abre la tolva y las muestras
  // viajan por la cinta; el tambor del horno gira y brilla según su temperatura; el vapor viaja a la trampa fría, donde
  // crece la escarcha; al fundirse, el agua pasa por el biofiltro, los filtros (adsorbente + UV) y llega al depósito.
  const AX_X = new THREE.Vector3(1, 0, 0);
  const STA = { on: false };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function setupStationAnim(scn) {
    scn.updateMatrixWorld(true);
    const get = n => scn.getObjectByName(n);
    const piv = n => { const o = get(n); if (o) { o.userData.q0 = o.quaternion.clone(); o.userData.p0 = o.position.clone(); o.userData.s0 = o.scale.clone(); } return o; };
    const pathOf = prefix => {
      const pts = [];
      for (let i = 0; i < 99; i++) { const o = get(prefix + String(i).padStart(2, '0')); if (!o) break; pts.push(o.getWorldPosition(new THREE.Vector3())); }
      return pts.length > 1 ? new THREE.CatmullRomCurve3(pts) : null;
    };
    const mats = {}; scn.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { mats[m.name] = m; }); });
    Object.assign(STA, {
      drum: piv('piv_horno_tambor'), lid: piv('piv_tolva_tapa'), pump: piv('piv_bomba'), npump: piv('piv_bomba_nutrientes'),
      valves: [['piv_valvula_vapor', 'vapor'], ['piv_valvula_agua', 'agua'], ['piv_valvula_deposito', 'agua']].map(([n, k]) => ({ o: piv(n), k, a: 0 })).filter(v => v.o),
      solar: ['piv_solar_A', 'piv_solar_B'].map(piv).filter(Boolean), ant: piv('piv_antena'),
      frost: piv('trampa_escarcha'), tankWater: piv('deposito_agua'), gauge: piv('deposito_indicador'), piston: piv('trampa_crio_piston'),
      ads: [0, 1, 2].map(k => piv('filtro_nivel_' + k)).filter(Boolean),
      mGlow: mats.EST_brillo_horno, mUV: mats.EST_uv, mLed: mats.EST_led_cultivo,
      belt: pathOf('cinta_'), vapor: pathOf('flujo_vapor_'), waterPath: pathOf('flujo_agua_'),
      drumA: 0, lidA: 0, pumpA: 0, npA: 0, ads0: Math.max(0.001, S.plant.adsorbent), reg: S.totals.reg, transfer: -1
    });
    [[STA.mGlow, 0xff6b1f], [STA.mUV, 0x8c4dff], [STA.mLed, 0xffc8f0]].forEach(([m, c]) => { if (m) { m.emissive = new THREE.Color(c); m.emissiveIntensity = 0; } });
    // cápsulas de muestra en la cinta y bocanadas de vapor
    const capM = new THREE.MeshStandardMaterial({ color: 0xc9ccd6, metalness: 0.6, roughness: 0.35 });
    STA.caps = Array.from({ length: 6 }, () => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 14), capM); c.visible = false; c.castShadow = true; scene.add(c); return c; });
    const pm = new THREE.MeshBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 0.7, depthWrite: false });
    STA.puffs = Array.from({ length: 18 }, () => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pm); s.visible = false; s.renderOrder = 6; scene.add(s); return s; });
    if (STA.waterPath) ST.flowCurve = STA.waterPath;   // las gotas de agua siguen ahora la tubería real del modelo
    // paneles solares hacia el Sol y antena hacia la Tierra
    const sd = W.sunDir; STA.solar.forEach(o => rotTo(o, AX_Z, Math.atan2(-sd.z, sd.x)));
    if (STA.ant && sky) {
      const e = sky.earthDir; STA.ant.quaternion.copy(STA.ant.userData.q0).multiply(_q.setFromAxisAngle(AX_Z, Math.atan2(-e.z, e.x)))
        .multiply(new THREE.Quaternion().setFromAxisAngle(AX_Y, -Math.asin(e.y)));
    }
    // Luces azules de la base: balizas de la plataforma, poste de carga y baliza del módulo
    STA.mLedSt = mats.ICW_LED; STA.mBeacon = mats.ICW_baliza;
    if (STA.mLedSt) STA.mLedSt.emissive = new THREE.Color(0x5266eb);
    if (STA.mBeacon) STA.mBeacon.emissive = new THREE.Color(0x5266eb);
    STA.padLight = new THREE.PointLight(0x5266eb, 14, 10, 2); STA.padLight.position.copy(scn.localToWorld(new THREE.Vector3(10, 0.6, 8))); scene.add(STA.padLight);
    // --- Ventanas al interior del proceso ---
    const B2T = (x, y, z) => scn.localToWorld(new THREE.Vector3(x, z, -y));      // coordenadas de Blender → mundo
    Object.assign(STA, {
      bed: piv('piv_horno_lecho'), dist: piv('piv_bio_distribuidor'), basin: piv('bio_agua'),
      ind: [0, 1, 2].map(k => piv('piv_indicador_' + k)).filter(Boolean), indA: [0, 0, 0],
      ovenC: B2T(4.62, -2.3, 0.95), trapC: B2T(5.6, -2.6, 0.0), bioC: B2T(7.35, -2.6, 0.0)
    });
    if (STA.basin) { STA.basin.material = STA.basin.material.clone(); STA.basinMat = STA.basin.material; }
    STA.frostCoil = get('trampa_escarcha_serpentin');
    if (STA.frostCoil) { STA.frostCoil.material = STA.frostCoil.material.clone(); STA.frostCoil.material.transparent = true; STA.frostCoil.material.depthWrite = false; }
    const dot = (color, r, op) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); m.visible = false; m.renderOrder = 6; scene.add(m); return m; };
    STA.ovenPuffs = Array.from({ length: 12 }, () => dot(0xf4f6ff, 0.045, 0.75));     // vapor saliendo del regolito caliente
    STA.trapPuffs = Array.from({ length: 24 }, () => dot(0xe6eeff, 0.055, 0.75));   // vapor que gira y se congela en el serpentín
    STA.trapDrips = Array.from({ length: 10 }, () => dot(0x8fb0ff, 0.03, 0.95));      // gotas al fundirse la escarcha
    STA.bioDrips = Array.from({ length: 24 }, () => dot(0xb08a55, 0.026, 0.9));    // agua que riega el lecho de microorganismos
    STA.bioDirt = Array.from({ length: 40 }, () => dot(0x8a6a3a, 0.02, 0.95));      // contaminantes que las bacterias van consumiendo
    const rr = Ice.rng(77); STA.dirtPos = STA.bioDirt.map(() => { const a = rr() * 6.283, r = Math.sqrt(rr()) * 0.85; return [Math.cos(a) * r, 0.42 + rr() * 0.16, Math.sin(a) * r]; });
    STA.on = true;
  }
  function updateStationAnim(t, dt) {
    const Pl = S.plant, hot = Pl.state === 'calentando' || Pl.state === 'sublimando', sub = Pl.state === 'sublimando';
    const flowing = S.t - Pl.flowT < 5400;
    // 1) Descarga del rover: se abre la tapa de la tolva y las cápsulas viajan por la cinta hasta el horno
    if (S.totals.reg < STA.reg) STA.reg = S.totals.reg;
    if (S.totals.reg > STA.reg + 1e-6) { STA.reg = S.totals.reg; STA.transfer = 0; }
    let lidOpen = false;
    if (STA.transfer >= 0) {
      const tt = (STA.transfer += dt); lidOpen = tt < 6.5;
      const k = clamp01((tt - 1.0) / 5.5);
      STA.caps.forEach((c, i) => {
        const u = k * 1.3 - i * 0.06; c.visible = !!STA.belt && u > 0 && u < 1;
        if (c.visible) { c.position.copy(STA.belt.getPointAt(u)); c.quaternion.setFromUnitVectors(UP, STA.belt.getTangentAt(u)); }
      });
      if (tt > 8) STA.transfer = -1;
    } else STA.caps.forEach(c => { c.visible = false; });
    STA.lidA = approach(STA.lidA, lidOpen ? -1.25 : 0, 1.6, dt); rotTo(STA.lid, AX_Y, STA.lidA);
    // 2) Horno: el tambor gira mientras calienta; la mirilla y la junta brillan según la temperatura real
    if (hot) STA.drumA += dt * 0.8; rotTo(STA.drum, AX_X, STA.drumA);
    if (STA.mGlow) STA.mGlow.emissiveIntensity = (hot ? clamp01((Pl.T - 60) / 190) * 2.4 : 0) * (0.92 + 0.08 * Math.sin(t * 7));
    // 3) Vapor del horno a la trampa fría (solo mientras el hielo se sublima)
    STA.puffs.forEach((s, i) => {
      s.visible = sub && !!STA.vapor;
      if (s.visible) { const u = (t * 0.35 + i / STA.puffs.length) % 1, p = STA.vapor.getPointAt(u); s.position.set(p.x + Math.sin(t * 5 + i) * 0.02, p.y, p.z + Math.cos(t * 4 + i) * 0.02); s.scale.setScalar(0.6 + 0.8 * u); }
    });
    // 4) Trampa fría: la escarcha crece con el hielo capturado; el pistón del criorrefrigerador late
    if (STA.frost) STA.frost.scale.y = Math.max(0.001, Math.min(1, Pl.frost / 2.2));
    if (STA.piston) STA.piston.position.y = STA.piston.userData.p0.y + (sub || Pl.frost > 0 ? 0.015 * Math.sin(t * 9) : 0);
    // 5) Biofiltro: luces de cultivo y bomba de nutrientes
    if (STA.mLed) STA.mLed.emissiveIntensity = BIO.lamp.intensity > 0 ? 1.8 : 0.12;
    if (S.bio.power > 0) STA.npA += dt * 2.5; rotTo(STA.npump, AX_Y, STA.npA);
    // 6) Filtros: el adsorbente baja con el uso; la lámpara UV se enciende cuando pasa agua
    const adsL = clamp01(Pl.adsorbent / STA.ads0); STA.ads.forEach(o => { o.scale.y = Math.max(0.001, adsL); });
    if (STA.mUV) STA.mUV.emissiveIntensity = flowing ? 2.6 + 0.3 * Math.sin(t * 13) : 0;
    // 7) Depósito: nivel de agua e indicador exterior; la bomba gira al enviar agua a la colonia
    const lvl = Math.min(1, Pl.tank / 30);
    if (STA.tankWater) STA.tankWater.scale.y = Math.max(0.001, lvl * 1.55);
    if (STA.gauge) STA.gauge.position.y = STA.gauge.userData.p0.y + lvl * 1.4;
    if (S.t - S.colony.flowT < 600) STA.pumpA += dt * 7; rotTo(STA.pump, AX_Y, STA.pumpA);
    // 8) Válvulas: el volante gira al abrirse
    STA.valves.forEach(v => { v.a = approach(v.a, (v.k === 'vapor' ? sub : flowing) ? 2.6 : 0, 2.0, dt); rotTo(v.o, AX_Z, v.a); });
    if (STA.mLedSt) STA.mLedSt.emissiveIntensity = 2.6 + 0.8 * Math.sin(t * 1.8);
    if (STA.mBeacon) STA.mBeacon.emissiveIntensity = Math.sin(t * 3.1) > 0.6 ? 4.5 : 0.6;
    // ===== Ventanas =====
    const up = STA.ovenC.clone().sub(STA.trapC).set(0, 1, 0);
    // Horno: el regolito se voltea con el tambor y, al sublimarse el hielo, suben hilos de vapor
    if (STA.bed) rotTo(STA.bed, AX_X, hot ? 0.12 * Math.sin(t * 1.6) : 0);
    STA.ovenPuffs.forEach((m, i) => {
      m.visible = sub; if (!sub) return;
      const u = (t * 0.5 + i / STA.ovenPuffs.length) % 1;
      m.position.set(STA.ovenC.x - 0.1 + 0.2 * ((i * 0.37) % 1) + 0.02 * Math.sin(t * 3 + i), STA.ovenC.y - 0.1 + 0.25 * u, STA.ovenC.z + 0.05 * Math.cos(i));
      m.material.opacity = 0.5 * (1 - u); m.scale.setScalar(0.6 + u);
    });
    // Trampa fría: el vapor entra girando y se congela sobre el serpentín (las bolitas encogen al volverse escarcha)
    STA.trapPuffs.forEach((m, i) => {
      m.visible = sub; if (!sub) return;
      const u = (t * 0.22 + i / STA.trapPuffs.length) % 1, a = t * 2.2 + i * 1.7, r = 0.28 - 0.12 * u;
      m.position.set(STA.trapC.x + Math.cos(a) * r, STA.trapC.y + 1.45 - 0.75 * u, STA.trapC.z + Math.sin(a) * r);
      m.scale.setScalar(1.2 - u); m.material.opacity = 0.55 * (1 - u * 0.7);
    });
    // La escarcha se forma primero sobre el serpentín frío y luego se acumula en el fondo
    if (STA.frostCoil) { const f = clamp01(Pl.frost / 1.0); STA.frostCoil.visible = f > 0.02; STA.frostCoil.material.opacity = 0.15 + 0.8 * f; }
    // Al fundirse la escarcha caen gotas hacia la salida
    const melting = flowing && S.t - Pl.flowT < 1800;
    STA.trapDrips.forEach((m, i) => {
      m.visible = melting; if (!melting) return;
      const u = (t * 0.9 + i / STA.trapDrips.length) % 1;
      m.position.set(STA.trapC.x + 0.2 * Math.cos(i * 2.4), STA.trapC.y + 1.3 - 0.75 * u, STA.trapC.z + 0.2 * Math.sin(i * 2.4) - 0.05);
    });
    // Biofiltro: el distribuidor gira y riega el lecho; el agua entra turbia y se aclara mientras trabajan los microorganismos
    if (flowing) STA.distA = (STA.distA || 0) + dt * 1.4; rotTo(STA.dist, AX_Z, STA.distA || 0);
    const since = S.t - Pl.flowT, q = Pl.quality, after = q ? q.after : 100;
    const clean = flowing ? Math.min(1, since / 3600) * (1 - after / 100) : (q ? 1 - after / 100 : 0);
    if (STA.basinMat) STA.basinMat.color.setRGB(0.45 + (0.12 - 0.45) * clean, 0.38 + (0.30 - 0.38) * clean, 0.22 + (0.75 - 0.22) * clean);
    if (STA.basin) STA.basin.scale.y = STA.basin.userData.s0.y * (0.6 + 0.9 * clamp01(S.bio.V / 200));
    STA.bioDrips.forEach((m, i) => {
      m.visible = flowing && !!STA.dist; if (!m.visible) return;
      const k = i % 12, side = k < 6 ? 1 : -1, d = side * (0.18 + (k % 6) * 0.12), u = (t * 1.6 + i * 0.37) % 1;
      const p = STA.dist.localToWorld(new THREE.Vector3(d, -0.04, 0)); p.y -= 0.8 * u; m.position.copy(p);
      m.material.color.setRGB(0.69 - 0.3 * clean, 0.54 - 0.1 * clean, 0.33 + 0.5 * clean);
    });
    STA.bioDirt.forEach((m, i) => {
      const left = flowing ? 1 - clean : 0, show = (i / STA.bioDirt.length) < left;
      m.visible = show; if (!show) return;
      const [x, y, z] = STA.dirtPos[i]; m.position.set(STA.bioC.x + x + 0.01 * Math.sin(t * 2 + i), STA.bioC.y + y, STA.bioC.z + z);
    });
    // Indicadores de flujo: la ruedita gira cuando pasa agua (el último, cuando sale hacia la colonia)
    const colonyFlow = S.t - S.colony.flowT < 600;
    STA.ind.forEach((o, k) => { if (k < 2 ? flowing : colonyFlow) STA.indA[k] += dt * 9; rotTo(o, AX_X, STA.indA[k]); });
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
    $('#sim-labels').appendChild(el); const l = { el, posFn, cls }; labels.push(l); return l;
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
    R3.head.intensity = W.envT(R.x, R.z) < 120 ? 820 : 190;
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
    if (S.holes.length < holesDrawn) { holesGroup.clear(); holesDrawn = 0; DR.rings = []; (DR.boreMeshes || []).forEach(m => scene.remove(m)); DR.boreMeshes = []; }
    while (holesDrawn < S.holes.length) {
      const hdat = S.holes[holesDrawn++], y = W.hAt(hdat.x, hdat.z);
      const bp = DR.bores[holesDrawn - 1] || hdat, by = detailUpd.heightAt ? detailUpd.heightAt(bp.x, bp.z) : W.hAt(bp.x, bp.z);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: 0x010102, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.rotation.x = -Math.PI / 2; m.position.set(bp.x, by + 0.02, bp.z); scene.add(m);   // pozo de 10 cm
      const lip = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.11, 24), new THREE.MeshBasicMaterial({ color: 0x0c0c10, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); lip.rotation.x = -Math.PI / 2; lip.position.copy(m.position); lip.position.y -= 0.002; scene.add(lip);   // borde de suelo removido
      (DR.boreMeshes = DR.boreMeshes || []).push(m, lip);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 18), new THREE.MeshBasicMaterial({ color: hdat.w >= P.iceThreshold ? 0xdfe6ff : 0x70707d })); ring.rotation.x = -Math.PI / 2; ring.position.set(hdat.x, y + 0.09, hdat.z); holesGroup.add(ring); DR.rings.push(ring);
    }
  }

  // Mapa de detección del rover: celdas medidas con contorno; rellenas si superan el umbral
  function updateDetection() {
    const g = detCtx, K = S.know, c = 8; g.clearRect(0, 0, detCanvas.width, detCanvas.height);
    for (let k = 0; k < W.KG * W.KG; k++) {
      if (!K.n[k]) continue;
      const v = K.sum[k] / K.n[k], x = (k % W.KG) * c, y = Math.floor(k / W.KG) * c;
      const cx = x + c / 2, cy = y + c / 2, hit = v >= P.iceThreshold;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, c * 0.75);                       // huella del sensor de neutrones
      gr.addColorStop(0, `rgba(237,237,243,${0.10 + Math.min(0.16, v / 40)})`); gr.addColorStop(1, 'rgba(237,237,243,0)');
      g.fillStyle = gr; g.fillRect(x - c, y - c, c * 3, c * 3);
      if (K.drilled[k]) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, c * 0.32, 0, 7); g.stroke(); continue; }
      if (K.rejected[k]) { g.fillStyle = 'rgba(112,112,125,.7)'; g.beginPath(); g.arc(cx, cy, c * 0.14, 0, 7); g.fill(); continue; }
      if (hit) { g.fillStyle = 'rgba(82,102,235,.95)'; g.beginPath(); g.arc(cx, cy, c * 0.2, 0, 7); g.fill(); g.strokeStyle = 'rgba(237,237,243,.9)'; g.lineWidth = 0.8; g.stroke(); }
    }
    detTex.needsUpdate = true;
  }

  function updateColony(t) {
    const C = S.colony, flowing = S.t - C.flowT < 600;
    COL.dots.forEach((d, k) => { d.visible = flowing; if (flowing) d.position.copy(COL.curve.getPointAt((t * 0.05 + k / COL.dots.length) % 1)); });
    const lvl = Math.min(1, C.water / 40);
    if (COL.waterModel) COL.water.scale.y = Math.max(0.001, lvl * COL.water.userData.sy);   // depósito del modelo de Blender
    else { COL.water.scale.y = Math.max(0.001, lvl * 3.8); COL.water.position.y = 0.2 + 1.9 * lvl; }
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
    BIO.lamp.intensity = P.light && P.chamber === 'inside' ? 4.7 : 0;
    BIO.ring.material.color.setHex(B.T < 0 ? 0x9fb4ff : B.T > 35 ? 0xffe2cc : 0xf5f6ff);
    crystals.material.emissiveIntensity = 0.3 + 0.08 * Math.sin(t * 1.6);
  }

  // W A S D: desplaza cámara y objetivo sobre el terreno, en la dirección en que se mira. La velocidad crece con la
  // distancia (cerca = preciso, vista general = rápido). Al moverse se deja de seguir al rover/estación.
  let lastCamT = performance.now();
  function toFreeCam() {
    if (camMode === 'free') return;
    camMode = 'free'; setCamLens('free'); $$('#sim-cam button[data-c]').forEach(b => b.setAttribute('aria-pressed', 'false')); $('#sim-core').hidden = true;
    set('sim-cam-cur', 'Cámara libre'); setToolUI();
  }
  function moveCameraWASD() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastCamT) / 1000); lastCamT = now;
    const f = (camKeys.w ? 1 : 0) - (camKeys.s ? 1 : 0), r = (camKeys.d ? 1 : 0) - (camKeys.a ? 1 : 0);
    if (!f && !r) return;
    toFreeCam();
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const dist = camera.position.distanceTo(controls.target), speed = Math.min(700, Math.max(6, dist * 0.9)) * (camKeys.shift ? 3 : 1);
    const d = fwd.multiplyScalar(f).add(right.multiplyScalar(r)).normalize().multiplyScalar(speed * dt);
    const lim = W.HALF * 1.25, old = controls.target.clone();
    controls.target.x = Math.max(-lim, Math.min(lim, controls.target.x + d.x)); controls.target.z = Math.max(-lim, Math.min(lim, controls.target.z + d.z));
    const dy = W.hAt(controls.target.x, controls.target.z) - W.hAt(old.x, old.z);   // sigue el relieve
    controls.target.y += dy; camera.position.add(new THREE.Vector3(controls.target.x - old.x, dy, controls.target.z - old.z));
  }
  function chaseWant() {
    const R = S.rover, base = new THREE.Vector3(R.x, W.hAt(R.x, R.z) + 1.1, R.z), yaw = R.heading + chase.yaw, cp = Math.cos(chase.pitch);
    const want = base.clone().add(new THREE.Vector3(-Math.cos(yaw) * cp * chase.dist, Math.sin(chase.pitch) * chase.dist, -Math.sin(yaw) * cp * chase.dist));
    const gh = W.hAt(want.x, want.z) + 1.0; if (want.y < gh) want.y = gh;
    return { want, look: base.add(new THREE.Vector3(Math.cos(R.heading) * 2.2, 0.4, Math.sin(R.heading) * 2.2)) };
  }
  function updateCamera() {
    moveCameraWASD();
    const R = S.rover, now = performance.now(), cdt = Math.min(0.1, (now - (updateCamera.t || now)) / 1000); updateCamera.t = now;
    if (camMode === 'rover') {
      // 3ª persona: detrás del rover y girando con él; arrastrar mira alrededor (vuelve detrás solo), la rueda acerca/aleja
      if (!chase.drag && now - chase.lastDrag > 1500) chase.yaw *= Math.exp(-cdt * 1.2);
      const { want, look } = chaseWant();
      camera.position.lerp(want, 1 - Math.exp(-cdt * 5));
      controls.target.lerp(look, 1 - Math.exp(-cdt * 8)); camera.lookAt(controls.target);
    } else if (camMode === 'tierra') {
      // Teleobjetivo hacia la Tierra desde la estación: la Tierra se ve grande sobre el horizonte comprimido (como en las fotos reales)
      const st = W.station, bx = st.x - 15, bz = st.z + 6, pos = new THREE.Vector3(bx, W.hAt(bx, bz) + 1.8, bz);   // a un lado de la estación, con vista despejada
      const fwd = sky.earthDir.clone().applyAxisAngle(UP, tele.yaw); const rt = new THREE.Vector3().crossVectors(fwd, UP).normalize(); fwd.applyAxisAngle(rt, tele.pitch);
      camera.position.copy(pos); controls.target.copy(pos).addScaledVector(fwd, 60); camera.lookAt(controls.target);
      if (Math.abs(camera.fov - tele.fov) > 1e-3) { camera.fov = tele.fov; camera.updateProjectionMatrix(); }
    } else if (camMode === 'rovercam') {
      // cámara del mástil: se mueve con el cabezal (busca al explorar, mira al suelo al medir, vigila el taladro)
      let pos, fwd;
      if (RA.on && RA.tilt) {
        RA.tilt.updateWorldMatrix(true, false);
        pos = RA.tilt.localToWorld(new THREE.Vector3(0.24, 0.0, 0)); fwd = RA.tilt.localToWorld(new THREE.Vector3(1.24, 0, 0)).sub(pos).normalize();
      } else { pos = new THREE.Vector3(R.x, W.hAt(R.x, R.z) + 2.5, R.z); fwd = new THREE.Vector3(Math.cos(R.heading), -0.12, Math.sin(R.heading)).normalize(); }
      // giro elegido con el ratón, encima del movimiento del cabezal
      fwd.applyAxisAngle(UP, rcam.yaw); const rt = new THREE.Vector3().crossVectors(fwd, UP).normalize(); fwd.applyAxisAngle(rt, rcam.pitch);
      // distancia al suelo en el centro de la imagen (marcha sobre el relieve)
      let dHit = 400; for (let tt = 0.3; tt < 400; tt *= 1.04) { const q = pos.clone().addScaledVector(fwd, tt), gH = detailUpd.heightAt(q.x, q.z); if (q.y < gH) { dHit = tt; break; } }
      rcam.dist = dHit; rcam.aim.copy(pos).addScaledVector(fwd, Math.min(dHit, 400));
      camera.position.copy(pos); controls.target.copy(rcam.aim); camera.lookAt(pos.clone().add(fwd));
      const fov = 58 / rcam.zoom; if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    } else if (camMode === 'inside' && WALK.on && COL.nav) {
      walkUpdate(cdt);
    } else {
      let target = null;
      if (camMode === 'station') target = BIO.worldPos().add(new THREE.Vector3(-1.0, 1.0, 0));
      else if (camMode === 'colony') target = COL.focus ? COL.focus.clone() : COL.g.position.clone().add(new THREE.Vector3(0, 3, 0));
      if (target) { const delta = target.clone().sub(controls.target).multiplyScalar(0.12); controls.target.add(delta); camera.position.add(delta); }
      controls.update();
      const gh = W.hAt(camera.position.x, camera.position.z) + 1.4; if (camera.position.y < gh) camera.position.y = gh;   // la cámara no atraviesa el terreno real
    }
    if (camMode === 'inside' && WALK.on) {
      // Dentro: la sombra del Sol queda fija sobre toda la colonia (no se recalcula a cada paso) y no hace falta
      // el detalle fino del terreno ni los granos, que quedan bajo el suelo
      if (!WALK.sunOk) { IceEnv.updateSun(sun, W, COL.g.position, 34); WALK.sunOk = true; }
      sky.update(camera, cdt, S.t);
      return;
    }
    WALK.sunOk = false;
    const focusD = camMode === 'rovercam' ? Math.min(rcam.dist, 160) : camMode === 'tierra' ? 1e9 : camera.position.distanceTo(controls.target);
    IceEnv.DETAIL.oU.value.set(Math.round(controls.target.x), Math.round(controls.target.z));   // origen cercano: precisión en el zoom
    detailUpd(controls.target, Q.detail ? focusD : 1e9);
    grainsUpd(controls.target.x, controls.target.z, Q.grains && focusD < 30);
    if (camMode === 'tierra') IceEnv.updateSun(sun, W, camera.position, 120);
    else if (camMode === 'rovercam') { const vis = 2 * rcam.dist * Math.tan(camera.fov * Math.PI / 360); IceEnv.updateSun(sun, W, controls.target, Math.max(vis * 1.6, 2.5), rcam.zoom > 3 ? 2.5 : 16); }   // con zoom: sombras concentradas en lo que se ve
    else IceEnv.updateSun(sun, W, controls.target, camera.position.distanceTo(controls.target));
    updNearRocks(controls.target.x, controls.target.z); IceEnv.updateRockLOD(camera);
    sky.update(camera, cdt, S.t);
  }

  function updateLabels() {
    const host = $('#sim-view'), w = host.clientWidth, h = host.clientHeight;
    labels.forEach(l => {
      const wp = l.posFn(), p = wp.clone().project(camera), dist = camera.position.distanceTo(wp);
      const hide = p.z > 1 || (l.cls === 'ov' && camMode !== 'overview') || (l.cls === 'mid' && dist > 700) || (l.cls === 'near' && dist > 45) || (l.cls === 'far' && dist < 90) || (l.cls === 'rover' && dist < 25) || (l.cls === 'col' && (COL.labelsOff || dist > 260)) || camMode === 'inside';
      const disp = hide ? 'none' : 'block'; if (l.disp !== disp) { l.el.style.display = disp; l.disp = disp; }
      if (!hide) { const tf = `translate(${Math.round((p.x * 0.5 + 0.5) * w)}px, ${Math.round((-p.y * 0.5 + 0.5) * h)}px) translate(-50%, -100%)`; if (l.tf !== tf) { l.el.style.transform = tf; l.tf = tf; } }
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
  // Cámara: arrastrar = girar, clic derecho = desplazar, rueda = acercar.
  // Enviar el rover solo en "modo destino": se activa con la tecla E (o el botón) y se sale con Esc.
  function setDestMode(on) {
    destMode = on;
    renderer.domElement.style.cursor = on ? 'crosshair' : '';
    $('#sim-dest').hidden = !on; $('#sim-dest-btn').setAttribute('aria-pressed', String(on));
    if (!on) { $('#sim-tip').hidden = true; $('#sim-pop').hidden = true; pickMarker.visible = false; }
  }
  function bindPointer() {
    const el = renderer.domElement, tip = $('#sim-tip'), pop = $('#sim-pop');
    let down = null;
    el.addEventListener('pointermove', ev => {
      if (!destMode || !pop.hidden) { tip.hidden = true; return; }
      const now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
      if (ev.buttons) { tip.hidden = true; return; }
      const p = pickTerrain(ev); if (!p) { tip.hidden = true; pickMarker.visible = false; return; }
      const r = el.getBoundingClientRect();
      pickMarker.visible = true; pickMarker.position.set(p.x, p.y + 0.4, p.z);
      tip.innerHTML = describe(p.x, p.z); tip.hidden = false;
      tip.style.left = Math.min(r.width - 250, ev.clientX - r.left + 14) + 'px'; tip.style.top = Math.max(50, ev.clientY - r.top - 10) + 'px';
    });
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    const tdist = () => { const [a, b] = [...TOUCH.pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    el.addEventListener('pointerdown', ev => {
      if (ev.pointerType !== 'touch') return;
      TOUCH.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (['colony', 'station', 'overview'].includes(camMode) && !destMode) toFreeCam();
      if (TOUCH.pts.size === 2) { TOUCH.d0 = tdist(); TOUCH.base = { cd: chase.dist, rz: rcam.zoom, tf: tele.fov }; }
    }, true);
    window.addEventListener('pointermove', ev => {
      if (!TOUCH.pts.has(ev.pointerId)) return;
      TOUCH.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (TOUCH.pts.size !== 2 || !TOUCH.d0) return;
      const k = tdist() / TOUCH.d0, B = TOUCH.base;
      if (camMode === 'rover') chase.dist = Math.max(4, Math.min(45, B.cd / k));
      else if (camMode === 'rovercam') { rcam.zoom = Math.max(1, Math.min(60, B.rz * k)); updateRoverHUD(); }
      else if (camMode === 'tierra') tele.fov = Math.max(2, Math.min(40, B.tf / k));
    });
    const tup = ev => { TOUCH.pts.delete(ev.pointerId); if (TOUCH.pts.size < 2) TOUCH.d0 = 0; };
    window.addEventListener('pointerup', tup); window.addEventListener('pointercancel', tup);
    el.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY };
      if (camMode === 'rover' && !destMode) { chase.drag = true; chase.px = ev.clientX; chase.py = ev.clientY; }
      if (camMode === 'rovercam' && !destMode) { rcam.drag = true; rcam.px = ev.clientX; rcam.py = ev.clientY; }
      if (camMode === 'tierra' && !destMode) { tele.drag = true; tele.px = ev.clientX; tele.py = ev.clientY; } });
    window.addEventListener('pointermove', ev => {
      if (!tele.drag || TOUCH.pts.size > 1) return; const k = 0.0045 * tele.fov / 46;
      tele.yaw -= (ev.clientX - tele.px) * k; tele.pitch = Math.max(-0.4, Math.min(0.6, tele.pitch - (ev.clientY - tele.py) * k)); tele.px = ev.clientX; tele.py = ev.clientY;
    });
    window.addEventListener('pointerup', () => { tele.drag = false; });
    window.addEventListener('pointermove', ev => {
      if (!rcam.drag || TOUCH.pts.size > 1) return;
      const k = 0.0045 / rcam.zoom;                                   // con más zoom, giro más fino
      rcam.yaw -= (ev.clientX - rcam.px) * k; rcam.pitch = Math.max(-1.35, Math.min(0.9, rcam.pitch - (ev.clientY - rcam.py) * k));
      rcam.px = ev.clientX; rcam.py = ev.clientY;
    });
    window.addEventListener('pointerup', () => { rcam.drag = false; });
    el.addEventListener('dblclick', () => { if (camMode === 'rovercam') Object.assign(rcam, { yaw: 0, pitch: 0, zoom: 1 }); if (camMode === 'tierra') Object.assign(tele, { yaw: 0, pitch: 0, fov: 6.5 }); });
    window.addEventListener('pointermove', ev => {
      if (!chase.drag || TOUCH.pts.size > 1) return;
      chase.yaw -= (ev.clientX - chase.px) * 0.006; chase.pitch = Math.max(0.05, Math.min(1.25, chase.pitch + (ev.clientY - chase.py) * 0.004));
      chase.px = ev.clientX; chase.py = ev.clientY; chase.lastDrag = performance.now();
    });
    window.addEventListener('pointerup', () => { if (chase.drag) { chase.drag = false; chase.lastDrag = performance.now(); } });
    el.addEventListener('wheel', ev => {
      if (camMode === 'tierra') { ev.preventDefault(); tele.fov = Math.max(2, Math.min(40, tele.fov * (ev.deltaY > 0 ? 1.15 : 1 / 1.15))); return; }
      if (camMode === 'rovercam') { ev.preventDefault(); rcam.zoom = Math.max(1, Math.min(60, rcam.zoom * (ev.deltaY > 0 ? 1 / 1.18 : 1.18))); updateRoverHUD(); return; }
      if (camMode !== 'rover') return; ev.preventDefault(); chase.dist = Math.max(4, Math.min(45, chase.dist * (1 + Math.sign(ev.deltaY) * 0.12)));
    }, { passive: false });
    el.addEventListener('pointerup', ev => {
      if (EXP.on && ev.button === 0 && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) <= 5) { expPick(ev); return; }
      if (camMode === 'inside') return;
      if (!destMode && !EXP.on && ev.button === 0 && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) <= 5 && colonyPick(ev)) return;
      if (!destMode || ev.button !== 0 || !down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      const p = pickTerrain(ev); if (!p) return;
      const r = el.getBoundingClientRect();
      pickMarker.visible = true; pickMarker.position.set(p.x, p.y + 0.4, p.z);
      tip.hidden = true;
      pop.innerHTML = `${describe(p.x, p.z)}<div class="row" style="margin-top:12px;gap:8px"><button class="btn btn--primary btn--sm" data-go>Enviar el rover aquí</button><button class="btn btn--sm btn--quiet" data-close>Cancelar</button></div>`;
      pop.hidden = false; pop.style.left = Math.min(r.width - 290, ev.clientX - r.left + 10) + 'px'; pop.style.top = Math.min(r.height - 190, Math.max(50, ev.clientY - r.top - 20)) + 'px';
      pop.querySelector('[data-go]').onclick = () => { sim.cmd.stopRoute(); sim.cmd.goTo(p.x, p.z); setModeUI('auto'); if (!S.running) toggleRun(); setDestMode(false); hideIntro(); toast('El rover va hacia ese punto, medirá el hielo y decidirá si perforar.'); };
      pop.querySelector('[data-close]').onclick = () => { pop.hidden = true; pickMarker.visible = false; };
    });
    $('#sim-dest-btn').addEventListener('click', () => setDestMode(!destMode));
    window.addEventListener('keydown', e => {
      if (!visible || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyE' && !e.repeat && !EXP.on && camMode !== 'inside') { setDestMode(!destMode); e.preventDefault(); }
      else if (e.code === 'Escape' && destMode) setDestMode(false);
      else if (e.code === 'Escape' && camMode === 'inside') setCam('colony');
    });
  }

  function setCamLens(mode) {
    const near = mode === 'rovercam' ? 0.08 : mode === 'inside' ? 0.05 : 0.25, fov = mode === 'rovercam' ? 58 : mode === 'inside' ? 70 : 46;
    if (camera.near !== near || camera.fov !== fov) { camera.near = near; camera.fov = fov; camera.updateProjectionMatrix(); }
    controls.minDistance = mode === 'inside' ? 0.15 : 2.2; controls.maxDistance = mode === 'inside' ? 7 : W.SIZE * 2.5;
    if (mode !== 'inside') colonyInsideOff();
    controls.enabled = !(mode === 'rover' || mode === 'rovercam' || mode === 'tierra' || mode === 'inside');
    $('#sim-rcam').hidden = mode !== 'rovercam';
  }
  function setCam(mode) {
    if (mode !== 'despiece') { if (EXP.on) { EXP.prev = null; setExplode(false); } else if (EXP.k > 0) EXP.prev = null; }   // otra cámara: se cierra el despiece sin volver a la anterior
    camMode = mode;
    $$('#sim-cam button[data-c]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === mode)));
    const cur = $(`#sim-cam button[data-c="${mode}"]`); if (cur) set('sim-cam-cur', cur.textContent);
    setCamLens(mode);
    if (mode === 'rovercam') Object.assign(rcam, { yaw: 0, pitch: 0, zoom: 1 });
    if (mode === 'tierra') Object.assign(tele, { yaw: 0, pitch: 0, fov: 6.5 });
    if (mode === 'rover') { Object.assign(chase, { yaw: 0, pitch: 0.3, dist: 9 }); const { want, look } = chaseWant(); camera.position.copy(want); controls.target.copy(look); camera.lookAt(look); }
    if (mode === 'station') { const t = BIO.worldPos().add(new THREE.Vector3(-1.0, 1.0, 0)); controls.target.copy(t); camera.position.set(t.x - 2, t.y + 5, t.z + 13); }
    if (mode === 'overview') { const k = W.SIZE / 600; controls.target.set(W.station.x * 0.3, 0, W.station.z * 0.3); camera.position.set(-260 * k, 330 * k, 380 * k); }
    if (mode === 'inside') { walkStart(WALK.spawn || 'A_esclusa'); WALK.spawn = null; }
    if (mode === 'colony') { COL.focus = null; const c = COL.g.position; controls.target.set(c.x, c.y + 3, c.z); camera.position.set(c.x - 52, c.y + 40, c.z + 64); }
    if (mode === 'despiece') {                                              // órbita alrededor del rover, vista de tres cuartos
      const R = S.rover, c = R3.g.position.clone().add(new THREE.Vector3(0, 1.0, 0)), a = R.heading + 2.3;
      controls.target.copy(c); camera.position.set(c.x + Math.cos(a) * 8.6, c.y + 3.4, c.z + Math.sin(a) * 8.6);
    }
    setToolUI();
    updateProcess(true);
  }

  // =====================================================================
  // PERFORACIÓN EN ACCIÓN: corte del subsuelo, barrena, virutas y montón de detritos
  // =====================================================================
  // Mientras el rover perfora se abre en el suelo una ventana en corte (ilustrativa) junto a la broca: se ven la capa seca,
  // la capa con hielo (espesor y % de hielo reales del modelo en ese punto), el pozo partido por la mitad y la barrena girando.
  // Técnica: la boca del corte marca el stencil; paredes, pozo, barrena y virutas internas solo se dibujan dentro de ella.
  const DR = { act: false, axis: new THREE.Vector3(), yaw: 0, gy: 0, dry: 0.2, ice: 0, vis: 0, endT: 0, holes: -1, bores: [], rings: [], ringT: 0 };
  const CUT_W = 1.0, CUT_D = 1.05, CUT_H = 1.3, BORE_R = 0.066, LUNA_G = 1.62;
  const INSIDE = { transparent: true, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
  const STRATA_VS = 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }';
  const STRATA_FS = `uniform float gy; uniform float dry; uniform float ice; uniform float dark; uniform vec2 org; varying vec3 vW; varying vec3 vN;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      float d = gy - vW.y;                                                     // profundidad bajo la superficie (m)
      vec2 L = vW.xz - org;                                                    // coordenadas locales: sin pérdida de precisión en el ruido
      vec2 p = abs(vN.y) > 0.5 ? L : vec2(dot(L, normalize(vec2(-vN.z, vN.x) + 1e-5)), -d);
      float g1 = vn(p * 55.0), g2 = vn(p * 170.0), peb = vn(p * 32.0 + 7.0);
      // capa seca: regolito suelto, gris claro, con guijarros
      vec3 dryC = vec3(0.33, 0.33, 0.335) * (0.7 + 0.42 * g1 + 0.2 * g2);
      dryC *= 1.0 - 0.5 * smoothstep(0.8, 0.84, peb);
      // capa con hielo: regolito cementado por el hielo (más oscuro) con granos y venas de hielo según el % real
      vec3 wetC = vec3(0.2, 0.205, 0.225) * (0.75 + 0.35 * g1 + 0.2 * g2);
      float grains = smoothstep(0.985 - 0.014 * ice, 1.0, vn(p * 125.0 + 3.0));
      // lentes de hielo: finas, casi horizontales y cortadas; solo en las paredes
      float vr = 1.0 - abs(vn(p * vec2(1.6, 11.0) + 11.0) * 2.0 - 1.0);
      float veins = smoothstep(1.0 - 0.0035 * ice, 1.0, vr) * smoothstep(0.5, 0.62, vn(p * vec2(3.0, 6.0) + 5.0)) * step(2.0, ice) * step(abs(vN.y), 0.5);
      float iceK = clamp(grains * 1.4 + veins, 0.0, 1.0);
      float layer = smoothstep(dry - 0.012, dry + 0.012, d);
      vec3 col = mix(dryC, mix(wetC, vec3(0.74, 0.86, 1.0), iceK), layer);
      col *= 1.0 - 0.4 * exp(-pow((d - dry) / 0.01, 2.0));                    // contacto entre las capas
      col = mix(col, vec3(0.43, 0.43, 0.44), smoothstep(0.035, 0.0, d) * 0.6); // borde superior polvoriento
      float lit = (0.5 + 0.5 * exp(-d * 1.3)) * (0.82 + 0.18 * abs(vN.x - vN.z)) * (abs(vN.y) > 0.5 ? 0.6 : 1.0); // foco de trabajo: más oscuro en lo hondo y en el fondo
      vec3 c = col * lit * dark * 0.72;
      c += vec3(0.22, 0.5, 1.0) * iceK * layer * 0.22 * dark;                  // realce del hielo para verlo en la sombra permanente
      gl_FragColor = vec4(c, 1.0);
    }`;
  function strataMat(dark, U) {
    return new THREE.ShaderMaterial(Object.assign({ uniforms: { gy: U.gy, dry: U.dry, ice: U.ice, org: U.org, dark: { value: dark } }, vertexShader: STRATA_VS, fragmentShader: STRATA_FS,
      side: THREE.BackSide, depthFunc: THREE.AlwaysDepth, depthWrite: true }, INSIDE));
  }
  function buildDrillFX() {
    const U = { gy: { value: 0 }, dry: { value: 0.2 }, ice: { value: 0 }, org: { value: new THREE.Vector2() } }; DR.U = U;
    const g = new THREE.Group(); g.visible = false; scene.add(g); DR.g = g;
    // boca del corte: invisible, solo marca el stencil donde se ve el suelo
    DR.open = new THREE.Mesh(new THREE.PlaneGeometry(CUT_W, CUT_D, 6, 4).rotateX(-Math.PI / 2).translate(0, 0, CUT_D / 2),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
    DR.open.renderOrder = 1000;
    // paredes y fondo (caja vista por dentro) y pozo partido por la mitad en la pared del fondo
    DR.box = new THREE.Mesh(new THREE.BoxGeometry(CUT_W, CUT_H, CUT_D), strataMat(1, U)); DR.box.position.set(0, -CUT_H / 2 + 0.06, CUT_D / 2); DR.box.renderOrder = 1001;
    DR.bore = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, Math.PI / 2, Math.PI), strataMat(0.62, U)); DR.bore.renderOrder = 1002;
    // virutas que suben por la hélice de la barrena (dentro del pozo)
    const NI = 70; DR.inPos = new Float32Array(NI * 3); DR.inCol = new Float32Array(NI * 3);
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(DR.inPos, 3)); ig.setAttribute('color', new THREE.BufferAttribute(DR.inCol, 3));
    DR.inPts = new THREE.Points(ig, new THREE.PointsMaterial(Object.assign({ size: 0.022, vertexColors: true, sizeAttenuation: true }, INSIDE))); DR.inPts.renderOrder = 1004; DR.inPts.frustumCulled = false;
    g.add(DR.open, DR.box, DR.bore, DR.inPts);
    // virutas despedidas desde la boca del pozo (parábolas con la gravedad lunar, sin aire que las frene)
    const NE = 220; DR.ej = Array.from({ length: NE }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), ice: false }));
    DR.ejPos = new Float32Array(NE * 3); DR.ejCol = new Float32Array(NE * 3);
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(DR.ejPos, 3)); eg.setAttribute('color', new THREE.BufferAttribute(DR.ejCol, 3));
    DR.ejPts = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, sizeAttenuation: true })); DR.ejPts.frustumCulled = false; scene.add(DR.ejPts);
    DR.emit = 0; DR.pile = null; newPile();
    const tag = document.createElement('div'); tag.className = 'cut-tag'; tag.hidden = true; $('#sim-view').appendChild(tag); DR.tag = tag;
  }
  function newPile() {                                                        // montón de detritos alrededor del pozo
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), 520);
    m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(520 * 3), 3);
    scene.add(m); IceEnv.patchTree(m, SV); DR.pile = m;
  }
  const _dq = new THREE.Quaternion(), _de = new THREE.Euler(), _ds = new THREE.Vector3(), _dm = new THREE.Matrix4(), _dc = new THREE.Color(), _dv = new THREE.Vector3();
  const groundH = (x, z) => (detailUpd.heightAt ? detailUpd.heightAt(x, z) : W.hAt(x, z));
  function placeCut() {                                                       // la pared del fondo pasa por el eje de la broca y mira a la cámara
    const dx = camera.position.x - DR.axis.x, dz = camera.position.z - DR.axis.z;
    DR.yaw = Math.atan2(dx, dz); DR.g.position.set(DR.axis.x, DR.gy, DR.axis.z); DR.g.rotation.set(0, DR.yaw, 0); DR.g.updateMatrixWorld(true);
    const pa = DR.open.geometry.attributes.position;                          // la boca se ciñe al relieve
    for (let i = 0; i < pa.count; i++) { _dv.set(pa.getX(i), 0, pa.getZ(i)).applyMatrix4(DR.g.matrixWorld); pa.setY(i, groundH(_dv.x, _dv.z) - DR.gy + 0.012); }
    pa.needsUpdate = true; DR.open.geometry.computeBoundingSphere();
  }
  function augerClone() {                                                     // copia de la barrena que se dibuja dentro del corte
    if (DR.augSrc === R3.auger) return;
    if (DR.aug) { scene.remove(DR.aug); DR.aug = null; }
    DR.augSrc = R3.auger; if (!R3.auger) return;
    const c = R3.auger.clone(true); c.matrixAutoUpdate = false;
    c.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 1003;
      o.material = [].concat(o.material).map(m => { const k = m.clone(); k.onBeforeCompile = m.onBeforeCompile; k.customProgramCacheKey = m.customProgramCacheKey; return Object.assign(k, INSIDE); });
      if (o.material.length === 1) o.material = o.material[0]; });
    scene.add(c); DR.aug = c;
  }
  function updateDrillFX(t, dt) {
    if (!DR.g) return;
    const R = S.rover, drilling = R.task === 'drill';
    augerClone();
    // perforación terminada: el montón queda en su sitio, con el pozo de 10 cm
    if (DR.holes < 0) DR.holes = S.totals.holes;
    if (S.totals.holes < DR.holes) { DR.bores = []; DR.holes = S.totals.holes; DR.pile.count = 0; (DR.piles || []).forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); DR.piles = []; }
    if (S.totals.holes > DR.holes) { DR.holes = S.totals.holes; DR.bores.push({ x: DR.axis.x, z: DR.axis.z }); DR.pile.instanceMatrix.needsUpdate = true; (DR.piles = DR.piles || []).push(DR.pile); newPile(); DR.endT = t; DR.vis = P.drillDepth; }
    if (drilling && !DR.act && R3.auger) {                                    // empieza una perforación
      R3.auger.updateWorldMatrix(true, false); R3.auger.getWorldPosition(DR.axis);
      DR.gy = groundH(DR.axis.x, DR.axis.z); DR.dry = W.dryLayer(R.x, R.z); DR.ice = W.iceWt(R.x, R.z);
      DR.U.gy.value = DR.gy; DR.U.org.value.set(DR.axis.x, DR.axis.z); DR.U.dry.value = DR.dry; DR.U.ice.value = DR.ice; DR.act = true; DR.endT = 1e9; placeCut();
    }
    if (DR.act && !drilling) {                                                // se cierra al alejarse el rover o a los 4 s
      if (DR.endT > t) DR.endT = t;
      if (t - DR.endT > 4 || Math.hypot(R.x - DR.axis.x, R.z - DR.axis.z) > 6) DR.act = false;
    }
    if (drilling) DR.vis = R.drillDepth;
    const camD = camera.position.distanceTo(DR.axis), show = DR.act && camD < 70 && !EXP.on;
    DR.g.visible = show; if (DR.aug) DR.aug.visible = show && drilling;
    if (show) {
      _dv.set(camera.position.x - DR.axis.x, 0, camera.position.z - DR.axis.z).normalize();
      if (_dv.x * Math.sin(DR.yaw) + _dv.z * Math.cos(DR.yaw) < -0.35) placeCut();   // la cámara pasó al otro lado
      const dd = Math.max(0.02, DR.vis);
      DR.bore.scale.set(BORE_R, dd + 0.06, BORE_R); DR.bore.position.set(0, 0.06 - (dd + 0.06) / 2, 0);
      if (DR.aug) { R3.auger.updateWorldMatrix(true, true); DR.aug.matrix.copy(R3.auger.matrixWorld); }
      // virutas subiendo por la hélice: su color depende de la capa de donde salen
      const n = DR.inPos.length / 3, iceF = Math.min(0.85, Math.max(0.2, DR.ice / 9));
      for (let i = 0; i < n; i++) {
        const s = ((i / n) + t * 0.45) % 1, depth = drilling ? dd * (1 - s) : -1, a = s * 26 + t * 9 + i;
        const lp = _dv.set(Math.cos(a) * 0.046, depth < 0 ? 50 : -depth, Math.sin(a) * 0.046);
        DR.inPos[i * 3] = lp.x; DR.inPos[i * 3 + 1] = lp.y; DR.inPos[i * 3 + 2] = lp.z;
        const icy = depth > DR.dry && ((i * 7919) % 100) / 100 < iceF;
        _dc.setRGB(icy ? 0.75 : 0.36, icy ? 0.86 : 0.35, icy ? 1.0 : 0.33); DR.inCol[i * 3] = _dc.r; DR.inCol[i * 3 + 1] = _dc.g; DR.inCol[i * 3 + 2] = _dc.b;
      }
      DR.inPts.geometry.attributes.position.needsUpdate = true; DR.inPts.geometry.attributes.color.needsUpdate = true;
      // etiqueta del corte
      _dv.copy(DR.axis); _dv.y = DR.gy + 0.25; _dv.project(camera);
      const host = $('#sim-view'), vis = _dv.z < 1 && camD < 40;
      DR.tag.hidden = !vis;
      if (vis) { DR.tag.style.transform = `translate(${(_dv.x * 0.5 + 0.5) * host.clientWidth}px, ${(-_dv.y * 0.5 + 0.5) * host.clientHeight}px) translate(-50%, -100%)`;
        set_(DR.tag, `Corte ilustrativo · capa seca ${fmt(DR.dry * 100, 0)} cm · hielo ${fmt(DR.ice, 1)} %${drilling ? ` · broca a ${fmt(R.drillDepth, 2)} m` : ''}`); }
    } else DR.tag.hidden = true;
    // virutas despedidas: salen mientras gira la broca y caen formando el montón
    if (drilling && S.running) DR.emit += dt * 55;
    const icyNow = drilling && R.drillDepth > DR.dry, iceF2 = Math.min(0.8, Math.max(0.15, DR.ice / 9));
    for (const e of DR.ej) {
      if (!e.on && DR.emit >= 1) {
        DR.emit -= 1; e.on = true; const a = Math.random() * 6.283, sp = 0.1 + Math.random() * 0.35;
        e.p.set(DR.axis.x + Math.cos(a) * 0.05, DR.gy + 0.03, DR.axis.z + Math.sin(a) * 0.05); e.v.set(Math.cos(a) * sp, 0.12 + Math.random() * 0.45, Math.sin(a) * sp);   // la barrena las empuja hacia fuera, a poca altura
        e.ice = icyNow && Math.random() < iceF2;
      }
      if (e.on) {
        e.v.y -= LUNA_G * dt; e.p.addScaledVector(e.v, dt);
        const gh = groundH(e.p.x, e.p.z);
        if (e.p.y <= gh) {                                                    // cae: se suma al montón
          e.on = false; const pile = DR.pile;
          if (pile.count < pile.instanceMatrix.count) {
            let ox = e.p.x - DR.axis.x, oz = e.p.z - DR.axis.z; const r = Math.hypot(ox, oz), rr = Math.min(r, 0.45) / Math.max(r, 1e-4); ox *= rr; oz *= rr;
            const sz = 0.006 + Math.random() * 0.014;
            _de.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); _dq.setFromEuler(_de); _ds.set(sz, sz * 0.7, sz);
            const x = DR.axis.x + ox, z = DR.axis.z + oz;
            _dm.compose(_dv.set(x, groundH(x, z) + sz * 0.3, z), _dq, _ds); pile.setMatrixAt(pile.count, _dm);
            pile.setColorAt(pile.count, e.ice ? _dc.setRGB(0.82, 0.9, 1.0) : _dc.setRGB(0.42, 0.42, 0.43)); pile.count++;
            pile.instanceMatrix.needsUpdate = true; pile.instanceColor.needsUpdate = true;
          }
        }
      }
    }
    for (let i = 0; i < DR.ej.length; i++) { const e = DR.ej[i];
      DR.ejPos[i * 3] = e.on ? e.p.x : 0; DR.ejPos[i * 3 + 1] = e.on ? e.p.y : -1e5; DR.ejPos[i * 3 + 2] = e.on ? e.p.z : 0;
      _dc.setRGB(e.ice ? 0.85 : 0.5, e.ice ? 0.93 : 0.49, e.ice ? 1.0 : 0.46); DR.ejCol[i * 3] = _dc.r; DR.ejCol[i * 3 + 1] = _dc.g; DR.ejCol[i * 3 + 2] = _dc.b; }
    DR.ejPts.geometry.attributes.position.needsUpdate = true; DR.ejPts.geometry.attributes.color.needsUpdate = true;
    // marcas de perforación (anillos del mapa): solo se ven de lejos, de cerca queda el pozo real
    if (t - DR.ringT > 0.5) { DR.ringT = t; DR.rings.forEach(r => { r.visible = camera.position.distanceTo(r.position) > 30; }); }
  }
  function set_(el, txt) { if (el.textContent !== txt) el.textContent = txt; }

  // =====================================================================
  // HERRAMIENTAS: despiece del rover (X), mapa con ruta y puntos de paso (M), centro de control (G)
  // =====================================================================
  // ---------- Despiece interactivo del rover de Blender ----------
  // Cada pieza de primer nivel del modelo se aparta de su sitio según su grupo. Las descripciones son del diseño propio
  // de ICEWISE; las cifras (300 W, 5 kWh, 1 m, 8 cartuchos) son las que usa el motor de la simulación.
  const EXP_GROUPS = [
    { id: 'paneles', re: /^(panel_solar|soporte_panel|soporte_trasero|DET-bisagra)/, h: 0.45, v: 1.15, name: 'Paneles solares',
      d: 'Tres alas de células solares (300 W en la simulación). Cargan la batería mientras el rover está al sol; en la sombra no producen nada.' },
    { id: 'antenas', re: /^(antena|DET-cable_antena)/, h: 0.75, v: 0.95, name: 'Comunicaciones',
      d: 'Antena orientable de alta ganancia y antena UHF. Envían los datos a la estación cuando hay línea de vista; el relieve puede bloquearla.' },
    { id: 'mastil', re: /^(mastil|piv_mastil|DET-cable_mastil|DET-sensor_solar)/, h: 0.25, v: 1.3, name: 'Mástil con cámaras',
      d: 'Cámaras de navegación en un cabezal que gira e inclina: busca al explorar, mira al suelo al medir y vigila el taladro. Es la «Cámara del rover».' },
    { id: 'brazo', re: /^arm$/, h: 1.15, v: 0.45, name: 'Brazo robótico',
      d: 'Cuatro articulaciones (base, hombro, codo y muñeca). Lleva cada muestra del taladro a un cartucho del carrusel.' },
    { id: 'taladro', re: /^(drill|piv_taladro|taladro_|DET-cremallera|DET-cadena|DET-cable_taladro)/, h: 1.05, v: -0.05, name: 'Taladro',
      d: 'Barrena de 10 cm que perfora hasta 1 m. El carro baja por una cremallera; el hielo endurece el suelo y la perforación tarda más.' },
    { id: 'carrusel', re: /^piv_carrusel/, h: 0.35, v: 0.85, name: 'Carrusel de muestras',
      d: 'Ocho cartuchos sellados. Guardan las muestras de suelo con hielo hasta la estación, donde se descargan al horno.' },
    { id: 'bateria', re: /^(bateria|DET-tornillos_bateria)/, h: 1.05, v: 0.35, name: 'Batería',
      d: '5 kWh en la simulación. Alimenta ruedas, instrumentos, calefacción y taladro. El rover vuelve antes de bajar de la reserva.' },
    { id: 'ciencia', re: /^(espectrometro|detector_He3|radar_GPR|DET-analizador)/, h: 0.95, v: -0.45, name: 'Instrumentos científicos',
      d: 'Espectrómetro de neutrones y detectores de helio-3: notan el hidrógeno del hielo bajo el suelo. Radar de penetración y analizador de muestras. En la simulación solo se usa el espectrómetro.' },
    { id: 'ruedas', re: /^(wheel|piv_direccion|balancin|bogie|horquilla|pivote_|DET-(motor_rueda|direccion|diferencial|barra_diferencial|biela|tapa_pivote|tornillos_suspension|juntas))/, lat: 0.95, v: -0.15, name: 'Ruedas y suspensión',
      d: 'Seis ruedas con motor propio y suspensión de balancines (rocker-bogie) que mantiene las seis apoyadas. Las cuatro de las esquinas giran para dirigir.' },
    { id: 'chasis', re: /./, h: 0, v: 0, name: 'Chasis y electrónica',
      d: 'Casco con aislamiento multicapa, radiador con persianas, electrónica, faros y cámaras de peligro. Mantiene el interior por encima de −10 °C.' }
  ];
  const EXP = { on: false, built: false, k: 0, target: 0, amt: 1, sel: null, objs: [], meshes: [], groups: {}, root: null, prev: null, wasRunning: false };
  function expBuild() {
    if (EXP.built) return true;
    if (!RA.on || !RA.scn) return false;
    const root = RA.scn.getObjectByName('rover') || RA.scn; EXP.root = root;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4();
    const boxLocal = o => { const b = new THREE.Box3(); o.traverse(n => { if (!n.isMesh) return; if (!n.geometry.boundingBox) n.geometry.computeBoundingBox(); m.multiplyMatrices(inv, n.matrixWorld); b.union(n.geometry.boundingBox.clone().applyMatrix4(m)); }); return b; };
    const all = boxLocal(root), c0 = all.getCenter(new THREE.Vector3());
    EXP_GROUPS.forEach(G => { EXP.groups[G.id] = { G, box: new THREE.Box3(), off: new THREE.Vector3(), n: 0 }; });
    root.children.slice().forEach(o => {
      const G = EXP_GROUPS.find(g => g.re.test(o.name)), b = boxLocal(o); if (b.isEmpty()) return;
      const c = b.getCenter(new THREE.Vector3()).sub(c0), hd = new THREE.Vector3(c.x, 0, c.z);
      if (hd.lengthSq() < 1e-4) hd.set(1, 0, 0); hd.normalize();
      const off = G.lat ? new THREE.Vector3(c.x * 0.2, G.v, Math.sign(c.z || 1) * G.lat) : hd.multiplyScalar(G.h).add(new THREE.Vector3(0, G.v, 0));
      o.userData.ep0 = o.position.clone(); o.userData.eoff = off; EXP.objs.push(o);
      const gr = EXP.groups[G.id]; gr.box.union(b); gr.off.add(off); gr.n++;
      o.traverse(n => { if (n.isMesh) { n.userData.eg = G.id; EXP.meshes.push(n); } });
    });
    Object.values(EXP.groups).forEach(gr => { if (gr.n) gr.off.divideScalar(gr.n); });
    // etiquetas: una por grupo
    const box = $('#sim-exp-labels'); box.innerHTML = '';
    Object.values(EXP.groups).filter(gr => gr.n).forEach(gr => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'exp-tag'; b.textContent = gr.G.name; b.dataset.g = gr.G.id;
      b.addEventListener('click', () => expSelect(gr.G.id)); box.appendChild(b); gr.el = b;
      gr.anchor = gr.box.getCenter(new THREE.Vector3()); gr.anchor.y = gr.box.max.y;
      if (gr.G.lat) { gr.anchor.z = gr.box.max.z; gr.off.set(0, gr.G.v, gr.G.lat); }
      else if (gr.G.v < 0) gr.anchor.y = gr.box.min.y - 0.1;                   // piezas que bajan: etiqueta por debajo
    });
    EXP.built = true; return true;
  }
  function expSelect(id) {
    EXP.sel = EXP.sel === id ? null : id;
    const gr = EXP.sel && EXP.groups[EXP.sel];
    set('se-name', gr ? gr.G.name : 'Elige una pieza');
    set('se-desc', gr ? gr.G.d : 'Toca una etiqueta o una pieza del rover para ver qué hace. Arrastra para girar alrededor y usa la rueda para acercarte.');
    Object.values(EXP.groups).forEach(g => { if (g.el) g.el.setAttribute('aria-pressed', String(g.G.id === EXP.sel)); });
    EXP.meshes.forEach(n => { [].concat(n.material).forEach(mt => { if (!mt.emissive) return; const o = mt.userData.eEm; if (!o) return;
      if (n.userData.eg === EXP.sel) mt.emissive.setRGB(0.1, 0.13, 0.42); else mt.emissive.copy(o); }); });
  }
  function setExplode(on) {
    if (on === EXP.on) return;
    if (on) {
      if (!expBuild()) { toast('El despiece necesita el modelo 3D del rover, que aún se está cargando.'); return; }
      if (destMode) setDestMode(false);
      EXP.on = true; EXP.target = 1;
      EXP.wasRunning = S.running; if (S.running) { sim.cmd.pause(); toggleRunLabel(); }
      EXP.prev = { mode: camMode, pos: camera.position.clone(), tgt: controls.target.clone() };
      // materiales propios mientras dura el despiece (para resaltar un grupo sin teñir piezas de otros grupos)
      EXP.meshes.forEach(n => { n.userData.mOrig = n.material;
        const cl = mt => { const c = mt.clone(); c.onBeforeCompile = mt.onBeforeCompile; c.customProgramCacheKey = mt.customProgramCacheKey; if (c.emissive) c.userData.eEm = c.emissive.clone(); return c; };
        n.material = Array.isArray(n.material) ? n.material.map(cl) : cl(n.material); });
      setCam('despiece'); expSelect(null);
      $('#sim-exp').hidden = false; $('#sim-exp-labels').hidden = false;
    } else {
      EXP.on = false; EXP.target = 0; EXP.sel = null;
      $('#sim-exp').hidden = true; $('#sim-exp-labels').hidden = true;
    }
    setToolUI();
  }
  function expFinish() {                                                     // al terminar de cerrar: todo vuelve a su sitio
    EXP.objs.forEach(o => o.position.copy(o.userData.ep0));
    EXP.meshes.forEach(n => { if (n.userData.mOrig) { [].concat(n.material).forEach(mt => mt.dispose()); n.material = n.userData.mOrig; n.userData.mOrig = null; } });
    const p = EXP.prev; EXP.prev = null;
    if (p) { setCam(p.mode === 'despiece' ? 'rover' : p.mode); if (!['rover', 'rovercam', 'tierra'].includes(p.mode)) { camera.position.copy(p.pos); controls.target.copy(p.tgt); } }
    if (EXP.wasRunning && !S.running) { sim.cmd.start(); toggleRunLabel(); }
  }
  function updateExplode(dt) {
    if (!EXP.built || (!EXP.on && EXP.k === 0)) return;
    EXP.k = approach(EXP.k, EXP.target, 1.6, dt);
    const e = ease(EXP.k) * EXP.amt;
    EXP.objs.forEach(o => o.position.copy(o.userData.ep0).addScaledVector(o.userData.eoff, e));
    if (!EXP.on && EXP.k === 0) { expFinish(); return; }
    // etiquetas sobre cada grupo
    const host = $('#sim-view'), w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3();
    EXP.root.updateWorldMatrix(true, false);
    const shown = [];
    Object.values(EXP.groups).forEach(gr => {
      if (!gr.el) return;
      v.copy(gr.anchor).addScaledVector(gr.off, e); v.y += 0.12; EXP.root.localToWorld(v); v.project(camera);
      const show = EXP.on && EXP.k > 0.6 && v.z < 1;
      gr.el.style.display = show ? 'block' : 'none';
      if (show) { if (!gr.lw) { gr.lw = gr.el.offsetWidth; gr.lh = gr.el.offsetHeight; } shown.push({ gr, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h }); }
    });
    // sin solapes: de arriba abajo, cada etiqueta baja lo justo para no tapar a las ya colocadas
    shown.sort((a, b) => a.y - b.y);
    shown.forEach((L, i) => {
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) { const M = shown[j];
          if (Math.abs(L.x - M.x) < (L.gr.lw + M.gr.lw) / 2 + 4 && Math.abs(L.y - M.y) < L.gr.lh + 3) { L.y = M.y + L.gr.lh + 3; moved = true; } }
        if (!moved) break;
      }
      L.gr.el.style.transform = `translate(${L.x}px, ${L.y}px) translate(-50%, -100%)`;
    });
  }
  function expPick(ev) {                                                     // clic en una pieza del rover = elegir su grupo
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(EXP.meshes, false)[0];
    if (hit && hit.object.userData.eg) expSelect(hit.object.userData.eg);
  }

  // ---------- Mapa: relieve real, rastro, perforaciones y ruta con puntos de paso ----------
  const ROUTE = { pts: [], active: false, i: 0, sent: -1, marks: [] };
  const MAP = { base: null, mode: 'ruta' };
  function mapBase() {                                                       // relieve sombreado (luz cartográfica del NO) + sombra permanente
    if (MAP.base) return MAP.base;
    const N = W.N, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data, H = W.H, s2 = 2 * W.STEP;
    const L = new THREE.Vector3(-0.55, 0.75, -0.4).normalize();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, dx = (H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)]) / s2, dz = (H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i]) / s2;
      const n = new THREE.Vector3(-dx, 1, -dz).normalize(), sh = Math.max(0, n.dot(L));
      let r = 26 + 150 * sh, gg = r, b = r + 4;
      if (W.psr && W.psr[k] > 0.5) { r = r * 0.45 + 82 * 0.35; gg = gg * 0.45 + 102 * 0.35; b = b * 0.45 + 235 * 0.4; }
      else if (W.shadowNow && W.shadowNow[k] > 0.5) { r *= 0.6; gg *= 0.6; b *= 0.62; }
      d[k * 4] = r; d[k * 4 + 1] = gg; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0); MAP.base = c; return c;
  }
  function drawMap() {
    const cv = $('#sim-map canvas'); if (!cv || $('#sim-map').hidden) return;
    const g = cv.getContext('2d'), Z = cv.width, R = S.rover, k = Z / W.SIZE;
    const X = x => (x + W.HALF) * k, Y = z => (z + W.HALF) * k;
    g.imageSmoothingEnabled = true; g.drawImage(mapBase(), 0, 0, Z, Z);
    // rastro del rover
    const tr = S.trail; if (tr.length > 1) { g.strokeStyle = 'rgba(237,237,243,.55)'; g.lineWidth = 1.5; g.beginPath(); tr.forEach(([x, z], i) => i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))); g.stroke(); }
    // perforaciones
    S.holes.forEach(hh => { g.strokeStyle = '#ededf3'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(hh.x), Y(hh.z), 3.5, 0, 6.283); g.stroke(); });
    // estación y colonia
    const st = W.station, cp = COL.g.position;
    g.fillStyle = '#ededf3'; g.fillRect(X(st.x) - 5, Y(st.z) - 5, 10, 10);
    g.beginPath(); g.arc(X(cp.x), Y(cp.z), 5.5, 0, 6.283); g.fill();
    g.font = '600 15px Inter, sans-serif'; g.fillStyle = 'rgba(237,237,243,.92)'; g.fillText('Estación', X(st.x) + 9, Y(st.z) + 5); g.fillText('Colonia', X(cp.x) + 9, Y(cp.z) + 5);
    // ruta: línea discontinua rover → puntos de paso pendientes
    const pend = ROUTE.pts.slice(ROUTE.active ? ROUTE.i : 0);
    if (pend.length) {
      g.setLineDash([7, 6]); g.strokeStyle = '#5266eb'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(R.x), Y(R.z)); pend.forEach(p => g.lineTo(X(p.x), Y(p.z))); g.stroke(); g.setLineDash([]);
    }
    ROUTE.pts.forEach((p, i) => {
      const done = ROUTE.active && i < ROUTE.i;
      g.fillStyle = done ? 'rgba(82,102,235,.35)' : '#5266eb'; g.beginPath(); g.arc(X(p.x), Y(p.z), 10, 0, 6.283); g.fill();
      g.fillStyle = '#fff'; g.font = '700 12px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), X(p.x), Y(p.z) + 4); g.textAlign = 'left';
    });
    // medición A → B
    if (MAP.mode === 'medir' && MEAS.a) {
      const pa = MEAS.a, pb = MEAS.b;
      if (pb) { g.setLineDash([]); g.strokeStyle = '#ededf3'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(pa.x), Y(pa.z)); g.lineTo(X(pb.x), Y(pb.z)); g.stroke();
        if (MEAS.res) { const mx = (X(pa.x) + X(pb.x)) / 2, my = (Y(pa.z) + Y(pb.z)) / 2, txt = fmtDist(MEAS.res.d3); g.font = '700 15px Inter, sans-serif'; const tw = g.measureText(txt).width;
          g.fillStyle = 'rgba(23,23,33,.85)'; g.fillRect(mx - tw / 2 - 6, my - 24, tw + 12, 22); g.fillStyle = '#fff'; g.fillText(txt, mx - tw / 2, my - 8); } }
      [[pa, 'A'], [pb, 'B']].forEach(([p, l]) => { if (!p) return; g.fillStyle = '#ededf3'; g.beginPath(); g.arc(X(p.x), Y(p.z), 10, 0, 6.283); g.fill();
        g.fillStyle = '#171721'; g.font = '700 12px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(l, X(p.x), Y(p.z) + 4); g.textAlign = 'left'; });
    }
    // rover: triángulo blanco con su rumbo
    g.save(); g.translate(X(R.x), Y(R.z)); g.rotate(R.heading); g.fillStyle = '#fff'; g.strokeStyle = '#171721'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(11, 0); g.lineTo(-7, 7); g.lineTo(-4, 0); g.lineTo(-7, -7); g.closePath(); g.stroke(); g.fill(); g.restore();
    // escala
    const L5 = 500 * k; g.fillStyle = 'rgba(23,23,33,.75)'; g.fillRect(Z - L5 - 28, Z - 34, L5 + 18, 24);
    g.strokeStyle = '#ededf3'; g.lineWidth = 2; g.beginPath(); g.moveTo(Z - L5 - 18, Z - 16); g.lineTo(Z - 18, Z - 16); g.stroke();
    g.fillStyle = '#ededf3'; g.font = '600 12px Inter, sans-serif'; g.fillText('500 m', Z - L5 / 2 - 34, Z - 20);
  }
  function routeMarks() {                                                    // postes azules en el terreno para cada punto de paso
    while (ROUTE.marks.length < ROUTE.pts.length) {
      const m = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.4, 2.2), toneMapped: false });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), mat); pole.position.y = 1.5;
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat); top.position.y = 3.2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.4, 1.6), toneMapped: false, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      m.add(pole, top, ring); m.userData.top = top; m.traverse(o => { o.userData.skipSunVis = true; }); scene.add(m); ROUTE.marks.push(m);
    }
    ROUTE.marks.forEach((m, i) => { const p = ROUTE.pts[i]; m.visible = !!p && !(ROUTE.active && i < ROUTE.i);
      if (p) m.position.set(p.x, W.hAt(p.x, p.z), p.z); });
  }
  // El motor lleva la ruta (R.route, R.routeI); aquí solo se refleja su avance en el mapa y en los postes
  function routeTick() {
    if (!ROUTE.active) return;
    const R = S.rover;
    if (!R.route) {
      ROUTE.active = false;
      if (R.routeDone) { ROUTE.i = ROUTE.pts.length; finishRun(); toast('Ruta completada: el rover pasó por todos los puntos.'); }
      routeMarks(); setRouteUI(); return;
    }
    if (R.routeI !== ROUTE.i) { ROUTE.i = R.routeI; routeMarks(); setRouteUI(); }
    if ((R.task === 'return' || R.task === 'idle') && !ROUTE.paused) { ROUTE.paused = true; toast('El rover vuelve a la estación (batería o bodega); al recargar seguirá la ruta.'); }
    if (R.task !== 'return' && R.task !== 'idle') ROUTE.paused = false;
  }
  function finishRun() {
    const r = ROUTE.run; if (!r || r.done) return;
    const e = S.rover.routeEnd || { t: S.t, d3: ODO.d3, holes: S.totals.holes };   // lo apuntó el motor al terminar la ruta
    Object.assign(r, { done: true, d3: e.d3 - r.d30, dt: e.t - r.t0, drills: e.holes - r.h0 });
    const sv = SAVED.list.find(x => x.id === ROUTE.savedId);
    if (sv) { sv.run = { d3: r.d3, dt: r.dt, drills: r.drills }; storeSaved(); renderSaved(); }
  }
  function setRouteUI() {
    const go = $('#sm-go'); if (go) { go.textContent = ROUTE.active ? 'Detener ruta' : (ROUTE.i > 0 && ROUTE.i < ROUTE.pts.length ? 'Seguir ruta' : 'Recorrer ruta'); go.disabled = !ROUTE.pts.length; }
    set('sm-count', ROUTE.pts.length ? `${ROUTE.pts.length} punto${ROUTE.pts.length > 1 ? 's' : ''} de paso${ROUTE.active ? ` · yendo al ${ROUTE.i + 1}` : ''}` : 'Sin puntos de paso');
    set('sm-est', routeEstimateHTML()); const sb = $('#sm-save'); if (sb) sb.disabled = !ROUTE.pts.length;
    drawMap();
  }

  // ---------- Distancias: odómetro sobre el relieve, medición A → B y estimación de recorridos ----------
  // El tiempo estimado usa el MISMO modelo de conducción que el motor (driveToward): velocidad máxima P.vmax, la mitad en
  // subidas de más de 15° (pendiente 0,27), bloqueado por encima de 24° (0,45), giro a 0,12 rad/s. Al llegar a cada punto de
  // paso mide 20 min. La energía usa la misma fórmula con la que el rover decide cuándo volver.
  // El motor suma en cada paso la distancia sobre el relieve (S.totals.dist3): exacta a cualquier velocidad del tiempo.
  const ODO = { d3: 0, trip: 0, trip0: 0, lastTask: null };
  function updateOdometry() {
    const R = S.rover, d3 = S.totals.dist3 || 0;
    if (d3 < ODO.d3 - 1e-6) ODO.trip0 = 0;                                    // «Reiniciar todo»
    if (ODO.lastTask === 'idle' && R.task !== 'idle') ODO.trip0 = d3;         // sale de la estación: empieza una salida nueva
    ODO.lastTask = R.task; ODO.d3 = d3; ODO.trip = d3 - ODO.trip0;
  }
  function estimateLeg(ax, az, bx, bz, prof) {                               // tramo recto sobre el relieve, cada ~3 m
    const d2 = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d2 / 3)), ds = d2 / n, vmax = Math.max(0.005, P.vmax);
    let d3 = 0, t = 0, up = 0, down = 0, maxG = 0, blocked = 0, h0 = W.hAt(ax, az);
    if (prof) prof.push([0, h0]);
    for (let i = 1; i <= n; i++) {
      const f = i / n, h1 = W.hAt(ax + (bx - ax) * f, az + (bz - az) * f), dh = h1 - h0, g = dh / Math.max(ds, 1e-6);
      d3 += Math.hypot(ds, dh); if (dh > 0) up += dh; else down -= dh; maxG = Math.max(maxG, Math.abs(g));
      if (g > 0.45) blocked += ds;                                           // > 24° cuesta arriba: el rover tendría que rodear
      t += ds / (g > 0.27 ? vmax * 0.5 : vmax);                              // el motor avanza en horizontal a esa velocidad
      if (prof) prof.push([d2 * f, h1]); h0 = h1;
    }
    return { d2, d3, t, up, down, maxSlope: Math.atan(maxG) * 180 / Math.PI, blocked };
  }
  const energyWh = t => t / 3600 * (sim.ROVER.base + 160 + 40) * 1.4;
  function drillHours() {                                                     // una perforación de P.drillDepth con hielo en el umbral
    const r0 = 1.2 * (P.drillPower / 150), dry = 0.2;
    return dry / r0 + Math.max(0, P.drillDepth - dry) / (r0 / (1 + P.iceThreshold / 3));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return `${sec} s`;
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  }
  const fmtDist = d => d >= 1000 ? `${fmt(d / 1000, 2)} km` : `${fmt(d, 0)} m`;
  function estimateRoute(pts, fromX, fromZ, heading) {
    let px = fromX, pz = fromZ, hd = heading;
    const E = { d2: 0, d3: 0, drive: 0, turn: 0, blocked: 0, up: 0, n: pts.length };
    pts.forEach(p => {
      let da = Math.atan2(p.z - pz, p.x - px) - hd; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      E.turn += Math.abs(da) / 0.12; hd += da;
      const L = estimateLeg(px, pz, p.x, p.z); E.d2 += L.d2; E.d3 += L.d3; E.drive += L.t; E.blocked += L.blocked; E.up += L.up;
      px = p.x; pz = p.z;
    });
    E.meas = pts.length * 1200; E.total = E.drive + E.turn + E.meas; E.wh = energyWh(E.drive + E.turn);
    return E;
  }
  // Medir A → B en el mapa
  const MEAS = { a: null, b: null, res: null, prof: [] };
  function measure() {
    MEAS.res = null; MEAS.prof = [];
    if (MEAS.a && MEAS.b) MEAS.res = estimateLeg(MEAS.a.x, MEAS.a.z, MEAS.b.x, MEAS.b.z, MEAS.prof);
    setMeasureUI();
  }
  function setMeasureUI() {
    set('sm-mcount', !MEAS.a ? 'Haz clic en el mapa para marcar el punto A' : !MEAS.b ? 'Ahora haz clic en el punto B' : 'A → B medido · otro clic empieza de nuevo');
    const M = MEAS.res, el = $('#sm-mest');
    if (el) el.innerHTML = !M ? '' :
      `<div class="sm-kv"><span>Línea recta</span><b>${fmtDist(M.d2)}</b></div>` +
      `<div class="sm-kv"><span>Sobre el terreno</span><b>${fmtDist(M.d3)}</b></div>` +
      `<div class="sm-kv"><span>Desnivel</span><b>+${fmt(M.up, 0)} m / −${fmt(M.down, 0)} m</b></div>` +
      `<div class="sm-kv"><span>Pendiente máxima</span><b>${fmt(M.maxSlope, 0)}°</b></div>` +
      `<div class="sm-kv"><span>Tiempo del rover</span><b>${fmtDur(M.t)}</b></div>` +
      `<div class="sm-kv"><span>Energía de la marcha</span><b>${fmt(energyWh(M.t), 0)} Wh</b></div>` +
      (M.blocked > 0 ? `<p class="sm-warn">${fmtDist(M.blocked)} con subidas de más de 24°: el rover no puede ir en línea recta y tendría que rodear.</p>` : '') +
      `<p class="sm-hint">${fmtDur(M.t / warp)} reales a la velocidad actual (${warp}×).</p>`;
    drawProfile(); drawMap();
  }
  function drawProfile() {
    const cv = $('#sm-prof'); if (!cv) return;
    const g = cv.getContext('2d'), Wc = cv.width, Hc = cv.height, pr = MEAS.prof; g.clearRect(0, 0, Wc, Hc);
    cv.hidden = pr.length < 2; if (pr.length < 2) return;
    let lo = Infinity, hi = -Infinity; pr.forEach(([, h]) => { lo = Math.min(lo, h); hi = Math.max(hi, h); });
    const pad = Math.max(2, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const X = d => 34 + d / pr[pr.length - 1][0] * (Wc - 44), Y = h => 10 + (1 - (h - lo) / (hi - lo)) * (Hc - 34);
    g.beginPath(); g.moveTo(X(0), Hc - 24); pr.forEach(([d, h]) => g.lineTo(X(d), Y(h))); g.lineTo(X(pr[pr.length - 1][0]), Hc - 24); g.closePath();
    g.fillStyle = 'rgba(237,237,243,.12)'; g.fill();
    g.beginPath(); pr.forEach(([d, h], i) => i ? g.lineTo(X(d), Y(h)) : g.moveTo(X(d), Y(h))); g.strokeStyle = '#ededf3'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c3c3cc'; g.font = '600 18px Inter, sans-serif';
    const base = W.meta ? W.meta.base : 0; g.fillText(`${fmt(hi - pad + base, 0)} m`, 2, 24); g.fillText(`${fmt(lo + pad + base, 0)} m`, 2, Hc - 30);
    g.fillText('A', X(0) - 4, Hc - 4); g.fillText('B', X(pr[pr.length - 1][0]) - 8, Hc - 4);
    g.fillText(`perfil · ${fmtDist(pr[pr.length - 1][0])}`, Wc / 2 - 70, Hc - 4);
  }
  // Rutas guardadas (en este navegador): estimación al guardarlas y lo medido cuando el rover las recorre
  const SAVED = { list: [] };
  function loadSaved() { try { SAVED.list = JSON.parse(localStorage.getItem('icewise-rutas') || '[]') || []; } catch (_) { SAVED.list = []; } }
  function storeSaved() { try { localStorage.setItem('icewise-rutas', JSON.stringify(SAVED.list)); } catch (_) {} }
  function renderSaved() {
    const box = $('#sm-saved'); if (!box) return;
    if (!SAVED.list.length) { box.innerHTML = '<p class="sm-hint">Aún no hay rutas guardadas.</p>'; return; }
    box.innerHTML = SAVED.list.map((r, i) => {
      const E = r.est, run = r.run;
      return `<div class="sm-route${ROUTE.savedId === r.id ? ' is-on' : ''}"><div class="sm-rt"><b>${r.name}</b><span>${r.pts.length} pts · ${fmtDist(E.d3)} · ≈ ${fmtDur(E.total)}</span>` +
        (run ? `<span class="sm-run">Medido: ${fmtDist(run.d3)} en ${fmtDur(run.dt)}${run.drills ? ` (con ${run.drills} perforaci${run.drills > 1 ? 'ones' : 'ón'})` : ''}</span>` : '') +
        `</div><span class="sm-rb"><button type="button" class="btn btn--sm" data-load="${i}">Cargar</button><button type="button" class="sm-x" data-del="${i}" aria-label="Borrar ${r.name}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div>`;
    }).join('');
    box.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => { const r = SAVED.list[+b.dataset.load];
      ROUTE.pts = r.pts.map(p => ({ x: p.x, z: p.z })); ROUTE.i = 0; ROUTE.sent = -1; ROUTE.active = false; ROUTE.savedId = r.id; routeMarks(); setRouteUI(); toast(`${r.name} cargada.`); }));
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const r = SAVED.list[+b.dataset.del];
      SAVED.list.splice(+b.dataset.del, 1); if (ROUTE.savedId === r.id) ROUTE.savedId = null; storeSaved(); renderSaved(); }));
  }
  function routeEstimateHTML() {
    if (!ROUTE.pts.length) return '';
    const R = S.rover, pend = ROUTE.pts.slice(ROUTE.active ? ROUTE.i : 0), E = estimateRoute(pend, R.x, R.z, R.heading);
    let h = `<div class="sm-kv"><span>${ROUTE.active ? 'Falta recorrer' : 'Recorrido desde el rover'}</span><b>${fmtDist(E.d3)}</b></div>` +
      `<div class="sm-kv"><span>Conducción</span><b>${fmtDur(E.drive + E.turn)}</b></div>` +
      `<div class="sm-kv"><span>Mediciones (20 min por punto)</span><b>${fmtDur(E.meas)}</b></div>` +
      `<div class="sm-kv sm-tot"><span>Duración estimada</span><b>${fmtDur(E.total)}</b></div>` +
      `<p class="sm-hint">Energía de la marcha ≈ ${fmt(E.wh, 0)} Wh. Si perfora en un punto, +${fmtDur(drillHours() * 3600)} por perforación. A ${warp}× son ${fmtDur(E.total / warp)} reales.</p>`;
    if (E.blocked > 0) h += `<p class="sm-warn">${fmtDist(E.blocked)} con subidas de más de 24°: el rover tendrá que rodear y tardará más.</p>`;
    if (ROUTE.run && ROUTE.run.done) { const r = ROUTE.run; h += `<p class="sm-run">Último recorrido medido: ${fmtDist(r.d3)} en ${fmtDur(r.dt)} (estimado ${fmtDur(r.estTotal)})${r.drills ? ` · ${r.drills} perforaci${r.drills > 1 ? 'ones' : 'ón'}` : ''}.</p>`; }
    return h;
  }

  // ---------- Centro de control: telemetría del rover (valores del modelo de la simulación) ----------
  function losStation() {                                                    // línea de vista mástil → antena de la estación sobre el relieve real
    const R = S.rover, st = W.station, ay = W.hAt(R.x, R.z) + 2.3, by = W.hAt(st.x, st.z) + 5;
    for (let i = 1; i < 80; i++) { const f = i / 80, x = R.x + (st.x - R.x) * f, z = R.z + (st.z - R.z) * f; if (W.hAt(x, z) > ay + (by - ay) * f) return false; }
    return true;
  }
  function updateControl() {
    if ($('#sim-ctrl').hidden) return;
    const R = S.rover, bat = R.battery / sim.ROVER.cap, slope = W.slopeAt(R.x, R.z), kmh = Math.abs(R.speed) * 3.6, cargo = R.cargoReg + R.cargoIce;
    const dSt = Math.hypot(R.x - W.station.x, R.z - W.station.z), los = losStation();
    set('sc-bat', `${fmt(bat * 100, 0)} %`); bar('sc-bat-bar', bat); set('sc-bat-s', `gasta ${fmt(R.power, 0)} W · recibe ${fmt(R.solar + (R.charge || 0), 0)} W`);
    set('sc-temp', `${fmt(R.sysT - 273.15, 0)} °C`); bar('sc-temp-bar', (R.sysT - 233) / 80); set('sc-temp-s', `interior · exterior ${fmt(R.Tenv || 0, 0)} K (${fmt((R.Tenv || 0) - 273.15, 0)} °C)`);
    set('sc-slope', `${fmt(slope, 0)}°`); bar('sc-slope-bar', slope / 25); set('sc-slope-s', slope > 15 ? 'más de 15°: no perfora aquí' : 'límite para perforar: 15°');
    set('sc-speed', `${fmt(kmh, 1)} km/h`); bar('sc-speed-bar', Math.abs(R.speed) / Math.max(0.01, P.vmax)); set('sc-speed-s', `máxima ${fmt(P.vmax * 3.6, 1)} km/h`);
    set('sc-drill', `${fmt(R.drillDepth, 2)} m`); bar('sc-drill-bar', R.drillDepth / Math.max(0.01, P.drillDepth)); set('sc-drill-s', `de ${fmt(P.drillDepth, 2)} m · ${S.totals.holes} perforaciones`);
    set('sc-cargo', `${fmt(cargo, 1)} kg`); bar('sc-cargo-bar', cargo / P.cargoCap); set('sc-cargo-s', `de ${fmt(P.cargoCap, 0)} kg · hielo ${fmt(R.cargoIce, 2)} kg`);
    set('sc-link', los ? 'Directa' : 'Bloqueada'); bar('sc-link-bar', los ? 1 : 0); set('sc-link-s', `${los ? 'línea de vista con la estación' : 'el relieve tapa la antena de la estación'} · ${fmt(dSt, 0)} m`);
    $('#sc-link').classList.toggle('warn', !los); $('#sc-slope').classList.toggle('warn', slope > 15); $('#sc-bat').classList.toggle('warn', bat < P.reserve / 100 + 0.05);
    set('sc-task', TASKS[R.task] || R.task);
    set('sc-odo', fmtDist(ODO.d3)); set('sc-odo-s', `esta salida ${fmtDist(ODO.trip)} · ruedas (horizontal) ${fmtDist(S.totals.dist)} · a la estación ${fmtDist(dSt)} en línea recta`);
  }
  function updateSpeedBadge() {
    const el = $('#sim-speed'); if (!el) return;
    el.hidden = camMode !== 'rover' || EXP.on || (S.rover.mode !== 'manual' && Math.abs(S.rover.speed) < 0.005);   // solo conduciendo o en marcha
    if (!el.hidden) { set('sim-speed-v', fmt(Math.abs(S.rover.speed) * 3.6, 1)); set('sim-speed-d', fmtDist(ODO.d3)); el.style.bottom = ($('#sim-dock').offsetHeight + 20) + 'px'; }   // encima de los botones de cámara
  }

  // ---------- Botones y teclas de las herramientas ----------
  // Paneles que abre cada herramienta (el despiece y la pantalla completa no son paneles)
  const TOOL_PANEL = { mapa: '#sim-map', control: '#sim-ctrl', capas: '#sim-layers', ayuda: '#sim-keys', colonia: '#sim-colony' };
  function setToolUI() {
    $$('#sim-tools button').forEach(b => { const t = b.dataset.t;
      b.setAttribute('aria-pressed', String(TOOL_PANEL[t] ? !$(TOOL_PANEL[t]).hidden : t === 'pantalla' ? !!fsElement() : EXP.on)); });
    updateCoreVis();
    $('#sim-view').classList.toggle('is-exp', EXP.on);
  }
  // El corte del subsuelo solo aparece cuando aporta: siguiendo al rover mientras caracteriza, decide o perfora
  function updateCoreVis() {
    const el = $('#sim-core'); if (!el) return;
    el.hidden = camMode !== 'rover' || EXP.on || !['characterize', 'decide', 'drill'].includes(S.rover.task);
  }
  // Pantalla completa: todo el escenario (vista 3D + barra de controles + etapas del proceso)
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function toggleFullscreen() {
    const st = $('#sim-stage');
    if (fsElement()) { const x = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (x && x.then) x.then(onFullscreen, onFullscreen); else setTimeout(onFullscreen, 300); return; }
    const req = st.requestFullscreen || st.webkitRequestFullscreen; if (!req) return;
    const r = req.call(st); if (r && r.then) r.then(onFullscreen, () => toast('El navegador no permitió la pantalla completa.')); else setTimeout(onFullscreen, 300);
  }
  function onFullscreen() {
    let t = $('#toast');                                                       // los avisos tienen que verse también en pantalla completa
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); }
    (fsElement() || document.body).appendChild(t);
    setToolUI(); resize(); if (fsElement()) $('#sim-view').focus({ preventScroll: true });
  }
  function toggleTool(t) {
    if (t === 'pantalla') { toggleFullscreen(); return; }
    if (t === 'despiece') { setExplode(!EXP.on); return; }
    const el = $(TOOL_PANEL[t]); if (!el) return; el.hidden = !el.hidden;
    if (t === 'capas' || t === 'ayuda') { const other = $(TOOL_PANEL[t === 'capas' ? 'ayuda' : 'capas']); if (!el.hidden) other.hidden = true; }   // uno a la vez en esa columna
    if (t === 'mapa') drawMap(); else if (t === 'control') updateControl();
    else if (t === 'colonia') { if (!el.hidden) { updateColonyPanel(); if (camMode !== 'colony') setCam('colony'); } colonySelect(COL.sel || 'A', false); }
    setToolUI();
  }
  // ---------- Paneles como ventanas: se arrastran por la cabecera y cambian de tamaño desde la esquina ----------
  // Al moverlos por primera vez salen de su columna y flotan sobre la vista 3D. Doble clic en la cabecera: vuelven a su sitio.
  const WIN = { z: 0, list: [] };
  function makeWindow(el, minW = 210, minH = 120) {
    const view = $('#sim-view'), head = el.querySelector('.sm-head'); if (!head) return;
    const home = { parent: el.parentNode, next: el.nextSibling };
    const grip = document.createElement('span'); grip.className = 'win-grip'; grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M11 5L5 11M11 8.5L8.5 11"/></svg>';
    el.appendChild(grip); el.classList.add('win'); head.title = 'Arrastra para mover · doble clic para devolverlo a su sitio';
    const front = () => { el.style.zIndex = String(5 + (++WIN.z % 50)); };
    const float = () => {
      if (el.classList.contains('is-float')) return;
      const vr = view.getBoundingClientRect(), r = el.getBoundingClientRect();
      view.appendChild(el); el.classList.add('is-float');
      Object.assign(el.style, { left: (r.left - vr.left) + 'px', top: (r.top - vr.top) + 'px', width: r.width + 'px' });
    };
    const drag = (target, onMove) => target.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (target === head && e.target.closest('button, input, a, select'))) return;
      e.preventDefault(); float(); front();
      const s = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      try { target.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('is-moving');
      const move = ev => onMove(ev.clientX - s.x, ev.clientY - s.y, s);
      const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); el.classList.remove('is-moving'); };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    });
    const clampPos = () => {
      if (!el.classList.contains('is-float')) return;
      el.style.left = Math.max(0, Math.min(view.clientWidth - el.offsetWidth, el.offsetLeft)) + 'px';
      el.style.top = Math.max(0, Math.min(view.clientHeight - Math.min(el.offsetHeight, 48), el.offsetTop)) + 'px';
    };
    drag(head, (dx, dy, s) => {
      el.style.left = Math.max(0, Math.min(view.clientWidth - el.offsetWidth, s.l + dx)) + 'px';
      el.style.top = Math.max(0, Math.min(view.clientHeight - 48, s.t + dy)) + 'px';
    });
    drag(grip, (dx, dy, s) => {
      el.style.width = Math.max(minW, Math.min(view.clientWidth - el.offsetLeft, s.w + dx)) + 'px';
      el.style.height = Math.max(minH, Math.min(view.clientHeight - el.offsetTop, s.h + dy)) + 'px';
      el.classList.add('is-sized'); if (el.id === 'sim-map') drawMap();
    });
    head.addEventListener('dblclick', e => {
      if (e.target.closest('button') || !el.classList.contains('is-float')) return;
      home.parent.insertBefore(el, home.next && home.next.parentNode === home.parent ? home.next : null);
      el.classList.remove('is-float', 'is-sized'); ['left', 'top', 'width', 'height', 'zIndex'].forEach(k => { el.style[k] = ''; });
    });
    el.addEventListener('pointerdown', front);
    WIN.list.push(clampPos);
  }
  function clampWindows() { WIN.list.forEach(f => f()); }
  function bindTools() {
    ['#sim-map', '#sim-ctrl', '#sim-layers', '#sim-keys'].forEach(s => makeWindow($(s)));
    makeWindow($('#sim-colony'), 260, 160); bindColony();
    makeWindow($('#sim-exp'), 240, 140);
    $$('#sim-tools button').forEach(b => b.addEventListener('click', () => toggleTool(b.dataset.t)));
    Object.entries(TOOL_PANEL).forEach(([t, sel]) => { const x = $(`${sel} [data-close]`); if (x) x.addEventListener('click', () => toggleTool(t)); });
    $('#sim-exp [data-close]').addEventListener('click', () => setExplode(false));
    $('#se-amt').addEventListener('input', e => { EXP.amt = +e.target.value; });
    // mapa: clic = añadir punto de paso, clic derecho = quitar el último
    const cv = $('#sim-map canvas');
    cv.addEventListener('click', ev => {
      const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W.SIZE - W.HALF, z = (ev.clientY - r.top) / r.height * W.SIZE - W.HALF;
      if (MAP.mode === 'medir') { if (!MEAS.a || MEAS.b) { MEAS.a = { x, z }; MEAS.b = null; } else MEAS.b = { x, z }; measure(); return; }
      if (ROUTE.pts.length >= 12) { toast('Máximo 12 puntos de paso.'); return; }
      if (ROUTE.active && ROUTE.i >= ROUTE.pts.length) { ROUTE.pts = []; ROUTE.i = 0; ROUTE.sent = -1; }
      ROUTE.pts.push({ x, z }); if (ROUTE.active && S.rover.route) S.rover.route.push({ x, z }); routeMarks(); setRouteUI();
    });
    cv.addEventListener('contextmenu', ev => { ev.preventDefault(); if (MAP.mode === 'medir') { MEAS.a = MEAS.b = null; measure(); return; } if (ROUTE.pts.length > (ROUTE.active ? ROUTE.i + 1 : 0)) { ROUTE.pts.pop(); if (ROUTE.active && S.rover.route && S.rover.route.length > S.rover.routeI + 1) S.rover.route.pop(); routeMarks(); setRouteUI(); } });
    $('#sm-go').addEventListener('click', () => {
      if (ROUTE.active) { ROUTE.active = false; sim.cmd.stopRoute(); setRouteUI(); return; }
      if (!ROUTE.pts.length) return;
      if (ROUTE.i >= ROUTE.pts.length) ROUTE.i = 0;
      if (ROUTE.i === 0) ROUTE.run = { done: false, d30: ODO.d3, odo0: S.totals.dist, t0: S.t, h0: S.totals.holes, estTotal: estimateRoute(ROUTE.pts, S.rover.x, S.rover.z, S.rover.heading).total };
      ROUTE.active = true; ROUTE.paused = false; sim.cmd.followRoute(ROUTE.pts, ROUTE.i); setModeUI('auto'); hideIntro(); if (!S.running) toggleRun();
      routeMarks(); setRouteUI(); toast('El rover recorre la ruta: en cada punto mide el hielo y decide si perforar.');
    });
    $('#sm-clear').addEventListener('click', () => { if (ROUTE.active) sim.cmd.stopRoute(); ROUTE.pts = []; ROUTE.i = 0; ROUTE.sent = -1; ROUTE.active = false; ROUTE.savedId = null; ROUTE.run = null; routeMarks(); setRouteUI(); renderSaved(); });
    // pestañas del mapa: Ruta / Medir A → B
    $$('#sm-tabs button').forEach(b => b.addEventListener('click', () => { MAP.mode = b.dataset.mm;
      $$('#sm-tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $$('#sim-map [data-pane]').forEach(p => { p.hidden = p.dataset.pane !== MAP.mode; }); drawMap(); }));
    $('#sm-mrover').addEventListener('click', () => { MEAS.a = { x: S.rover.x, z: S.rover.z }; MEAS.b = null; measure(); });
    $('#sm-mstation').addEventListener('click', () => { if (!MEAS.a) MEAS.a = { x: W.station.x, z: W.station.z }; else MEAS.b = { x: W.station.x, z: W.station.z }; measure(); });
    $('#sm-mclear').addEventListener('click', () => { MEAS.a = MEAS.b = null; measure(); });
    $('#sm-save').addEventListener('click', () => {                           // guardar: estimación desde la estación
      if (!ROUTE.pts.length) return; const st = W.station, n = SAVED.list.reduce((m, r) => Math.max(m, +((/\d+$/.exec(r.name) || [0])[0])), 0) + 1;
      const id = 'r' + Date.now().toString(36), e = estimateRoute(ROUTE.pts, st.x + 10, st.z + 8, 0.9);
      SAVED.list.push({ id, name: `Ruta ${n}`, pts: ROUTE.pts.map(p => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 })), est: { d3: e.d3, total: e.total } });
      ROUTE.savedId = id; storeSaved(); renderSaved(); toast(`Ruta ${n} guardada en este navegador.`);
    });
    loadSaved(); renderSaved(); setMeasureUI();
    window.addEventListener('keydown', e => {
      if (!visible || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === 'KeyM') { toggleTool('mapa'); e.preventDefault(); }
      else if (e.code === 'KeyG') { toggleTool('control'); e.preventDefault(); }
      else if (e.code === 'KeyX') { toggleTool('despiece'); e.preventDefault(); }
      else if (e.code === 'KeyL') { toggleTool('capas'); e.preventDefault(); }
      else if (e.code === 'KeyH') { toggleTool('ayuda'); e.preventDefault(); }
      else if (e.code === 'KeyC') { toggleTool('colonia'); e.preventDefault(); }
      else if (e.code === 'KeyF') { toggleFullscreen(); e.preventDefault(); }
      else if (e.code === 'Escape' && EXP.on) setExplode(false);
      else if (e.code === 'Escape') ['capas', 'ayuda'].forEach(t => { if (!$(TOOL_PANEL[t]).hidden) toggleTool(t); });   // Esc cierra capas y controles
    });
    const st = $('#sim-stage'); if (!(st.requestFullscreen || st.webkitRequestFullscreen)) $('#sim-tools [data-t="pantalla"]').hidden = true;   // p. ej., iPhone
    document.addEventListener('fullscreenchange', onFullscreen); document.addEventListener('webkitfullscreenchange', onFullscreen);
    setRouteUI(); setToolUI();
  }

  // =====================================================================
  // BUCLE
  // =====================================================================
  let last = performance.now();
  const FST = { calls: 0, tris: 0, n: 0 };
  const OPT = { cp: new THREE.Vector3(), cq: new THREE.Quaternion(), fov: 0, busyT: 0, lastR: 0, input: 0, shT: 0, ft: [], prT: 0, pr: 0, qT: 0, bad: 0, sx: 0, sz: 0, sh: 0 };
  ['pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(ev => window.addEventListener(ev, () => { OPT.input = performance.now(); }, { passive: true }));
  // Resolución adaptativa: si el equipo no llega a ~30 fps, baja un poco la resolución interna (nunca por debajo de la de la
  // pantalla en Máxima/Alta) y la recupera cuando sobra potencia. En un equipo capaz no cambia nada.
  function adaptResolution(now, busy) {
    if (!busy) { OPT.ft.length = 0; return; }
    OPT.ft.push(now); while (OPT.ft.length && now - OPT.ft[0] > 2000) OPT.ft.shift();
    if (OPT.ft.length < 10 || now - OPT.prT < 3000) return;
    const fps = (OPT.ft.length - 1) / ((now - OPT.ft[0]) / 1000), maxPr = Math.min(Q.pr, window.devicePixelRatio || 1), minPr = Math.min(maxPr, Q.pr >= 1.5 ? 1 : Q.pr);
    let pr = renderer.getPixelRatio();
    const qBefore = qName; autoQuality(now, fps, pr <= minPr + 0.01);
    if (qName !== qBefore) { OPT.prT = now; OPT.ft.length = 0; return; }           // acaba de bajar de nivel: medir de nuevo
    if (fps < 30 && pr > minPr + 0.01) pr = Math.max(minPr, pr * 0.85); else if (fps > 55 && pr < maxPr - 0.01) pr = Math.min(maxPr, pr / 0.85); else return;
    OPT.prT = now; renderer.setPixelRatio(pr); resize(); if (sky) sky.U.pr.value = pr; renderer.shadowMap.needsUpdate = true;
    set('sim-qres', pr < maxPr - 0.01 ? `Resolución adaptada a tu equipo: ${Math.round(pr / maxPr * 100)} %` : '');
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    applyKeys();
    if (S.running) sim.step(dt * warp);
    if (tracks) tracks.update(S.rover, S.t);
    if (visible) dustUpd(S.rover, dt, S.running && Math.abs(S.rover.speed) > 0.01);
    if (now - (frame.vis || 0) > 300) {                 // ¿se ve la simulación? (pausa el dibujo si no está en pantalla)
      frame.vis = now; const r = renderer.domElement.getBoundingClientRect();
      visible = !document.hidden && r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    }
    updateOdometry(); routeTick();
    if (!visible) return;
    const t = now / 1000;
    if (iceL) iceL.update(t, camera);
    if (!EXP.on && EXP.k === 0) { updateRover(t); if (RA.on) updateRoverAnim(t, dt); }
    updateExplode(dt); updateDrillFX(t, dt); updateStation(t); if (STA.on) updateStationAnim(t, dt); updateColony(t); updateCamera();
    if (now - lastTex > 400) { lastTex = now; updateDetection(); updateTrail(); }
    // Reposo: en pausa y con la cámara quieta la imagen no cambia → se dibuja a 20 fps (mismo aspecto, menos trabajo)
    const camMoved = !OPT.cp.equals(camera.position) || !OPT.cq.equals(camera.quaternion) || OPT.fov !== camera.fov;
    OPT.cp.copy(camera.position); OPT.cq.copy(camera.quaternion); OPT.fov = camera.fov;
    const busy = camMoved || S.running || EXP.on || EXP.k > 0 || DR.act || now - OPT.input < 1500;
    if (busy) OPT.busyT = now;
    if (now - OPT.busyT > 1500 && now - OPT.lastR < 48) return;
    OPT.lastR = now;
    // Sombras (el Sol no se mueve): se recalculan al instante si se movió la zona de sombra o el rover avanzó/giró;
    // si solo hay piezas animadas (mástil, brazo, taladro, estación) ~15 veces por segundo; si no, cada segundo
    const R = S.rover, roverMoved = Math.abs(R.x - OPT.sx) + Math.abs(R.z - OPT.sz) > 0.03 || Math.abs(R.heading - OPT.sh) > 0.005;
    const animated = DR.act || RA.on || STA.on;
    if (sun.userData.moved || roverMoved || EXP.k > 0 || animated && now - OPT.shT > 66 || now - OPT.shT > 1000) {
      renderer.shadowMap.needsUpdate = true; sun.userData.moved = false; OPT.shT = now; OPT.sx = R.x; OPT.sz = R.z; OPT.sh = R.heading;
    }
    adaptResolution(now, busy);
    renderer.info.reset();
    if (composer) { grade.uniforms.time.value = t; grade.uniforms.roverCam.value = camMode === 'rovercam' ? 1 : 0; composer.render(dt); }
    else renderer.render(scene, camera);
    FST.calls = renderer.info.render.calls; FST.tris = renderer.info.render.triangles; FST.n++;
    if (camMode === 'rovercam' && now - (frame.hud || 0) > 150) { frame.hud = now; updateRoverHUD(); }
    updateLabels();
    if (now - lastUI > 200) { lastUI = now; updateUI(); drawCore(); updateProcess(); updateControl(); updateSpeedBadge(); if (now - (frame.map || 0) > 400) { frame.map = now; drawMap(); } if (!$('#sim-map').hidden && ROUTE.pts.length && now - (frame.est || 0) > 1000) { frame.est = now; set('sm-est', routeEstimateHTML()); set('sm-count', ROUTE.pts.length ? `${ROUTE.pts.length} punto${ROUTE.pts.length > 1 ? 's' : ''} de paso${ROUTE.active ? ` · yendo al ${ROUTE.i + 1}` : ''}` : 'Sin puntos de paso'); } }
    if (now - lastChart > 1200) { lastChart = now; updateCharts(); }
  }
  // Postprocesado: escena HDR (antialiasing de 4 muestras) → oclusión ambiental (GTAO) → brillo (bloom) → acabado de cámara
  // (mapeo de tonos ACES y sRGB) → SMAA en calidad media. Se reconstruye al cambiar la calidad.
  function buildComposer() {
    if (composer) { composer.passes.forEach(p => p.dispose && p.dispose()); composer.dispose(); }
    const host = $('#sim-view'), w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight), pr = renderer.getPixelRatio();
    composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: Q.msaa, stencilBuffer: true }));
    composer.addPass(new THREE.RenderPass(scene, camera));
    gtao = null;
    if (Q.gtao) {
      gtao = new THREE.GTAOPass(scene, camera, w, h);
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85; composer.addPass(gtao);
    }
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.38, 0.42, 3.2); bloom.enabled = Q.bloom; composer.addPass(bloom);
    grade = new THREE.ShaderPass(IceEnv.GradeShader); composer.addPass(grade);
    if (Q.smaa) composer.addPass(new THREE.SMAAPass(w * pr, h * pr));
  }
  // auto = true: cambio hecho por la calidad automática (no se guarda como elección de la persona)
  function applyQuality(name, auto = false) {
    if (!QUALITY[name]) return;
    qName = name; Q = QUALITY[name]; qAuto = auto;
    try { localStorage.setItem('icewise-calidad', auto ? 'auto' : name); } catch (_) {}
    OPT.qT = performance.now(); OPT.bad = 0;
    renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
    sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } sun.userData.moved = true;
    buildComposer(); resize();
    if (sky) { sky.U.pr.value = renderer.getPixelRatio(); if (Q.pr >= 1.5) sky.loadHiRes(); }   // estrellas a escala de píxel; Máxima y Alta: Tierra en 8K desde el inicio
    qualityUI();
  }
  function qualityUI() {
    const stage = $('#sim-stage'); if (stage) stage.classList.toggle('is-lowq', qName === 'baja');   // Baja: vidrio sin desenfoque (más ligero)
    $$('#sim-quality button').forEach(b => b.setAttribute('aria-pressed', String(qAuto ? b.dataset.q === 'auto' : b.dataset.q === qName)));
    const lbl = { maxima: 'Máxima', alta: 'Alta', media: 'Media', baja: 'Baja' }[qName];
    set('sim-qauto', qAuto ? `Automática: ahora en ${lbl}. Baja sola si tu equipo va lento.` : '');
  }
  // Calidad automática: si tras bajar la resolución al mínimo del nivel sigue por debajo de ~26 fps durante dos
  // mediciones seguidas (~6 s), baja un nivel. Nunca sube sola (evita saltos de calidad); la persona puede elegir.
  function autoQuality(now, fps, prAtMin) {
    if (!qAuto || !$('#sim-loader').classList.contains('is-done') || now - (OPT.qT || 0) < 6000) return;
    if (fps >= 26 || !prAtMin) { OPT.bad = 0; return; }
    if (++OPT.bad < 2) return;
    const next = Q_ORDER[Q_ORDER.indexOf(qName) + 1]; if (!next) return;
    applyQuality(next, true);
    toast(`Calidad bajada a ${{ alta: 'Alta', media: 'Media', baja: 'Baja' }[next]} para que la simulación vaya fluida.`);
  }
  function resize() {
    const host = $('#sim-view'), w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); grade.uniforms.res.value.set(w, h); }
    clampWindows();                                                         // las ventanas movidas siguen dentro de la vista
  }
  // Visor de la cámara del mástil: rumbo, inclinación del cabezal, batería y tarea
  function updateRoverHUD() {
    const R = S.rover; let deg = Math.round((90 - R.heading * 180 / Math.PI + 360 * 4) % 360);
    $('#rc-rumbo').textContent = `RUMBO ${String(deg).padStart(3, '0')}°`;
    $('#rc-incl').textContent = `INCL. ${RA.on ? (-RA.tiltA * 180 / Math.PI).toFixed(0) : '0'}°`;
    $('#rc-bat').textContent = `BAT ${Math.round(R.battery / sim.ROVER.cap * 100)} %`;
    $('#rc-tarea').textContent = (TASKS[R.task] || R.task).toUpperCase();
    $('#rc-zv').textContent = `${rcam.zoom < 10 ? rcam.zoom.toFixed(1) : Math.round(rcam.zoom)}×`;
    $('#rc-zfill').style.height = `${Math.log(rcam.zoom) / Math.log(60) * 100}%`;
    $('#rc-dist').textContent = rcam.dist >= 400 ? 'DIST —' : `DIST ${rcam.dist < 10 ? rcam.dist.toFixed(1) : Math.round(rcam.dist)} m`;
  }

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
    box.innerHTML = `<div class="eff-head"><span class="eyebrow">Qué cambia</span><button class="eff-x" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
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
    $('#bio-inside-controls').classList.toggle('is-disabled', P.chamber === 'outside'); $('#bio-light').checked = P.light; $('#bio-purif').checked = P.bioPurif; $('#p-regen').checked = P.adsRegen;
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
    { t: '¿Y si lo conduzco yo?', d: 'W A S D para conducir · Espacio para perforar', apply: () => { sim.cmd.setMode('manual'); setModeUI('manual'); setCam('rover'); $('#sim-view').focus(); }, tab: 'tab-rover' }
  ];

  function bindUI() {
    $$('#sim-tabs button').forEach(b => b.addEventListener('click', () => openTab(b.getAttribute('aria-controls'))));
    $('#sim-start').addEventListener('click', () => { toggleRun(); hideIntro(); });
    $('#sim-intro-start').addEventListener('click', () => { hideIntro(); if (!S.running) toggleRun(); });
    $('#sim-intro-skip').addEventListener('click', () => { hideIntro(); setCam('overview'); });
    $('#sim-reset').addEventListener('click', () => { sim.cmd.resetAll(); Object.assign(P, IceSim.DEFAULT_P); syncSliders(); setModeUI('auto'); setCam(camMode); lastChart = 0; updateUI(); toggleRunLabel(); toast('Simulación y valores restablecidos.'); });
    $$('#sim-warp button').forEach(b => b.addEventListener('click', () => { warp = +b.dataset.w; $$('#sim-warp button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    // Selector de cámara: un botón muestra la vista actual y abre la lista
    const camBtn = $('#sim-cam-btn'), camMenu = $('#sim-cam');
    const camOpen = on => { camMenu.hidden = !on; camBtn.setAttribute('aria-expanded', String(on)); };
    camBtn.addEventListener('click', e => {
      camOpen(camMenu.hidden);
      if (!camMenu.hidden && e.detail === 0) (camMenu.querySelector('[aria-pressed="true"]') || camMenu.querySelector('button')).focus();   // abierto con teclado: foco en la vista actual
    });
    document.addEventListener('click', e => { if (!camMenu.hidden && !e.target.closest('.sim-camwrap')) camOpen(false); });
    camMenu.addEventListener('keydown', e => {
      const items = [...camMenu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { camOpen(false); camBtn.focus(); e.stopPropagation(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    });
    $$('#sim-cam button[data-c]').forEach(b => b.addEventListener('click', () => { setCam(b.dataset.c); camOpen(false); }));
    $$('#sim-mode button').forEach(b => b.addEventListener('click', () => {
      sim.cmd.setMode(b.dataset.m); setModeUI(b.dataset.m); hideIntro();
      if (b.dataset.m === 'manual') { if (!S.running) toggleRun(); setCam('rover'); $('#sim-view').focus(); }
    }));
    const layer = (id, meshes) => $(id).addEventListener('change', e => { meshes.forEach(m => { m.visible = e.target.checked; }); });
    $('#ov-fill').addEventListener('change', e => { fill.visible = e.target.checked; });
    $('#ov-cine').addEventListener('change', e => { sky.setCine(e.target.checked); });
    const qbtn = $('#sim-qbtn'), qpop = $('#sim-qpop');
    qbtn.addEventListener('click', () => { qpop.hidden = !qpop.hidden; qbtn.setAttribute('aria-expanded', String(!qpop.hidden)); });
    document.addEventListener('click', e => { if (!qpop.hidden && !e.target.closest('.sim-qwrap')) { qpop.hidden = true; qbtn.setAttribute('aria-expanded', 'false'); } });
    $$('#sim-quality button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.q === 'auto') { applyQuality(guessQuality(renderer.getContext()), true); toast('Calidad gráfica automática: se ajusta a tu equipo.'); }
      else { applyQuality(b.dataset.q); toast('Calidad gráfica: ' + b.textContent + '.'); }
    }));
    qualityUI();
    layer('#ov-ice', [iceMesh, crystals]); layer('#ov-det', [detMesh]); layer('#ov-psr', [psrMesh]); layer('#ov-trail', [trail, holesGroup]);
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
    $('#p-regen').addEventListener('change', e => { P.adsRegen = e.target.checked; toast(P.adsRegen ? 'El horno regenerará el filtro químico cuando esté libre (hipótesis).' : 'Sin regeneración: el filtro químico se gasta y, al acabarse, el agua sale contaminada.'); });
    $('#bio-inoc').addEventListener('click', () => { sim.cmd.inoculate(); toast('Cámara re-inoculada con las tres especies.'); });
    $('#bio-spe').addEventListener('click', () => { sim.cmd.solarEvent(); toast('Evento solar: +0,05 Gy/h durante 10 h.'); });
    // Teclado: modo manual → W A S D conduce el rover y las flechas mueven la cámara;
    // modo autónomo → W A S D (o las flechas) mueven la cámara por el mapa (Shift = rápido)
    const host = $('#sim-view');
    const kmap = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    const cmap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift' };
    const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    const wmap = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', KeyD: 'd', ArrowLeft: 'tl', ArrowRight: 'tr', ShiftLeft: 'shift', ShiftRight: 'shift' };
    window.addEventListener('keydown', e => {
      if (!visible || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (camMode === 'inside' && wmap[e.code]) { WALK.keys[wmap[e.code]] = true; if (wmap[e.code] !== 'shift') e.preventDefault(); return; }
      const manual = S.rover.mode === 'manual';
      if (manual && kmap[e.code]) { keys[kmap[e.code]] = true; e.preventDefault(); }
      else if (cmap[e.code]) { camKeys[cmap[e.code]] = true; if (cmap[e.code] !== 'shift') e.preventDefault(); }
      if (manual && e.code === 'Space' && document.activeElement === host) { sim.cmd.drillHere(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (kmap[e.code]) keys[kmap[e.code]] = false; if (cmap[e.code]) camKeys[cmap[e.code]] = false; if (wmap[e.code]) WALK.keys[wmap[e.code]] = false; });
    window.addEventListener('blur', () => { Object.keys(camKeys).forEach(k => { camKeys[k] = false; }); Object.keys(keys).forEach(k => { keys[k] = false; }); WALK.keys = {}; });
    document.addEventListener('icewise:startMission', () => { hideIntro(); if (!S.running) toggleRun(); });
  }
  function applyKeys() {
    if (!S || S.rover.mode !== 'manual') return;
    S.manual.throttle = (keys.up ? 1 : 0) - (keys.down ? 0.6 : 0);
    S.manual.steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    S.manual.turnScale = 1 / warp;                                               // el giro manual va a ritmo real con cualquier velocidad del tiempo
    $$('#sim-pad [data-k]').forEach(b => b.classList.toggle('is-on', !!keys[b.dataset.k]));   // el botón W/A/S/D se ilumina al pulsar la tecla
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
    set('hud-clock', clockStr(S.t)); set('hud-task', taskTxt); updateCoreVis(); updateColonyPanel();
    set('hud-bat', `Batería ${fmt(R.battery / sim.ROVER.cap * 100, 0)} %`); set('hud-temp', `Exterior ${fmt(R.Tenv || 0, 0)} K · rover ${fmt(R.sysT - 273.15, 0)} °C`);
    set('hud-water', `Agua limpia ${fmt(S.totals.water, 2)} L · en la colonia ${fmt(S.colony.water, 2)} L${S.totals.rejected > 0 ? ` · contaminada ${fmt(S.totals.rejected, 2)} L` : ''}`);
    const hb = $('#hud-bat'); if (hb) hb.classList.toggle('warn', R.battery / sim.ROVER.cap < P.reserve / 100 + 0.05);
    set('m-water', `${fmt(S.totals.water, 2)}<small>L</small>`); set('m-ice', `${fmt(S.colony.water, 2)}<small>L</small>`); set('m-ice-l', `En la colonia · ${fmt(S.colony.water / sim.COLONY.demandKgDay, 1)} días de reserva`);
    set('m-holes', `${S.totals.holes}`); set('m-dist', `${fmt(S.totals.dist / 1000, 2)}<small>km</small>`);
    set('m-spec', S.totals.water > 0 ? `${fmt(S.totals.kWhPlant / S.totals.water, 1)}<small>kWh/L</small>` : '—');
    const known = S.know.n.reduce((a, n) => a + (n > 0 ? 1 : 0), 0); set('m-cov', `${fmt(known / (W.KG * W.KG) * 100, 0)}<small>%</small>`);
    set('r-task', taskTxt); set('r-bat', `${fmt(R.battery, 0)} / ${sim.ROVER.cap} Wh`); bar('r-bat-bar', R.battery / sim.ROVER.cap);
    set('r-pow', `gasta ${fmt(R.power, 0)} W · recibe ${fmt(R.solar + (R.charge || 0), 0)} W`);
    set('r-temp', `${fmt(R.sysT - 273.15, 0)} °C · calefacción ${fmt(R.heater, 0)} W`);
    set('r-cargo', `${fmt(R.cargoReg + R.cargoIce, 1)} / ${fmt(P.cargoCap, 0)} kg (hielo ${fmt(R.cargoIce, 2)} kg)`); bar('r-cargo-bar', (R.cargoReg + R.cargoIce) / P.cargoCap);
    set('r-sensor', R.lastReading != null ? `${fmt(R.lastReading, 1)} % de hielo equivalente` : '—');
    const stTxt = { 'vacío': 'Vacío: esperando muestras', calentando: 'Calentando las muestras', sublimando: 'El hielo se convierte en vapor', completado: 'Lote terminado' }[Pl.state] || Pl.state;
    set('p-state', (Pl.regen ? 'Regenerando el filtro químico' : stTxt) + (Pl.queue.length ? ` · ${Pl.queue.length} en cola` : ''));
    set('p-T', `${fmt(Pl.T, 0)} K (${fmt(Pl.T - 273.15, 0)} °C)`); bar('p-T-bar', (Pl.T - 40) / 220);
    set('p-ice', `${fmt(Pl.ice, 2)} kg`); set('p-cap', `${fmt(Pl.captured, 2)} kg`); set('p-tank', `${fmt(Pl.tank, 2)} L`); bar('p-tank-bar', Pl.tank / 30);
    set('p-power', `Reparto de energía solar (${fmt(P.solarW, 0)} W): horno ${fmt(Pl.heater, 0)} W · carga del rover ${fmt(R.charge || 0, 0)} W · cámara bio ${fmt(B.power, 0)} W`);
    const q = Pl.quality, act = i => sim.bioActivity(i);
    [['dper', 0], ['pext', 1]].forEach(([id, i]) => { bar(`act-${id}`, P.bioPurif ? act(i) : 0); set(`act-${id}-v`, P.bioPurif ? `${fmt(act(i) * 100, 0)} %` : 'apagado'); });
    set('act-plac-v', !P.bioPurif ? 'apagado' : Pl.lastResidual > 5 ? 'alerta: agua sucia' : Pl.quality ? 'agua limpia' : 'esperando agua');
    set('q-flow', q ? `100 → <strong>${fmt(q.after, 0)}</strong> → <strong>${fmt(q.final, 1)}</strong>` : 'Aún no se ha tratado ningún lote');
    set('q-ok', q ? (q.ok ? 'Apta para uso técnico' : 'Contaminada: se reprocesa') : '—');
    const qe = document.getElementById('q-ok'); if (qe) qe.className = 'verdict ' + (q ? (q.ok ? 'pass' : 'fail') : '');
    set('q-ads', P.adsRegen ? `${fmt(Pl.adsorbent, 2)} kg listos · ${fmt(Pl.adsSpent, 2)} por regenerar · ${fmt(Pl.adsLost, 2)} perdidos` : `${fmt(Pl.adsorbent, 2)} kg restantes · ${fmt(Pl.adsSaved, 2)} kg ahorrados`); bar('q-ads-bar', Pl.adsorbent / 3);
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
      tank: `${fmt(Pl.tank, 2)} L`,
      colony: `${fmt(C.water, 1)} L`
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

  // ---------- Pantalla de carga: cada etapa informa de su avance; al terminar se compilan los shaders y empieza ----------
  const LOAD = {
    order: ['motor', 'relieve', 'cielo', 'modelos', 'rocas', 'luz', 'shaders'],
    label: { motor: 'Motor gráfico (Three.js r170)', relieve: 'Relieve real de Shackleton (NASA LOLA)', cielo: 'Cielo y Tierra (mapas de NASA)', modelos: 'Rover y estación (Blender)', rocas: 'Rocas y regolito escaneados', luz: 'Iluminación del relieve lejano', shaders: 'Preparando sombras y efectos' },
    done: {}, total: {}, finished: false, t0: 0
  };
  LOAD.order.forEach(k => { LOAD.done[k] = 0; LOAD.total[k] = 1; });
  function loadSet(id, done, total) {
    if (total != null) LOAD.total[id] = Math.max(1, total);
    LOAD.done[id] = Math.min(LOAD.total[id], done); renderLoader();
  }
  function loadAdd(id) { loadSet(id, LOAD.done[id] + 1); }
  function renderLoader() {
    const ul = $('#sl-steps'); if (!ul) return;
    let sum = 0, now = null;
    ul.innerHTML = LOAD.order.map(k => {
      const f = LOAD.done[k] / LOAD.total[k]; sum += f;
      const st = f >= 1 ? 'is-ok' : (!now ? (now = k, 'is-on') : '');
      return `<li class="${st}">${LOAD.label[k]}<span>${f >= 1 ? '✓' : f > 0 ? Math.round(f * 100) + ' %' : ''}</span></li>`;
    }).join('');
    const pct = Math.round(sum / LOAD.order.length * 100);
    $('#sl-fill').style.width = pct + '%'; $('#sl-pct').textContent = pct + ' %';
    $('#sl-now').textContent = now ? LOAD.label[now] + '…' : 'Listo';
  }
  function watchLoad() {
    const tick = () => {
      if (LOAD.finished) return;
      if (!W.real) loadSet('luz', 1); else loadSet('luz', IceEnv.farTime ? 1 : (IceEnv.farProgress || 0));
      const pend = LOAD.order.filter(k => k !== 'shaders' && LOAD.done[k] < LOAD.total[k]);
      const timeout = performance.now() - LOAD.t0 > 45000;                 // nunca bloquear la simulación
      if (!pend.length || timeout) {
        LOAD.finished = true; loadSet('shaders', 0.3);
        const end = () => { loadSet('shaders', 1); setTimeout(() => $('#sim-loader').classList.add('is-done'), 350); };
        warmUp().then(end, end);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  }
  // Precalentamiento (detrás de la pantalla de carga), para que no haya tirones la primera vez que aparece algo:
  //  1) se compilan los shaders de TODO, también de lo que está oculto al empezar (taladro en corte, marcadores,
  //     cartuchos, efectos), haciéndolo visible un instante; 2) se suben a la tarjeta gráfica todas las texturas;
  //  3) se dibuja un fotograma completo con sombras y posprocesado.
  async function warmUp() {
    const hidden = [], texs = new Set();
    scene.traverse(o => {
      if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; }       // las luces no: cambiaría la cuenta de luces
      [].concat(o.material || []).forEach(m => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
      });
    });
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); }
    catch (e) { console.warn('Precompilación incompleta', e); }
    finally { hidden.forEach(o => { o.visible = false; }); }
    texs.forEach(t => { try { if (t.image && !t.isRenderTargetTexture && !t.isDepthTexture) renderer.initTexture(t); } catch (_) {} });
    renderer.shadowMap.needsUpdate = true;
    if (composer) composer.render(0.016); else renderer.render(scene, camera);
  }
  function init() {
    const host = $('#sim-view'); if (!host) return;
    if (!window.THREE || !THREE.OrbitControls) { host.innerHTML = '<p class="sim-fallback">No se pudo cargar el motor 3D (Three.js).</p>'; return; }
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2'); if (!gl) throw 0;
      if (qAuto) { qName = guessQuality(gl); Q = QUALITY[qName]; }
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();   // liberar el contexto de prueba
    }
    catch (_) { host.innerHTML = '<p class="sim-fallback">Tu navegador no admite WebGL 2, necesario para la simulación 3D.</p>'; return; }
    LOAD.t0 = performance.now(); renderLoader();
    IceEnv.onAsset = cat => { if (LOAD.done[cat] != null) loadAdd(cat); };
    // se deja pintar la pantalla de carga antes del trabajo pesado
    requestAnimationFrame(() => setTimeout(() => {
      loadSet('motor', 1); loadSet('cielo', 0, 4); loadSet('rocas', 0, 3);
      sim = IceSim.createSim(); S = sim.S; P = sim.P; W = sim.world;
      buildScene(host); loadSet('relieve', 1); resize(); setCam('rover');
      buildProcess(); bindSliders(); bindUI(); bindPointer(); bindTools(); updateDetection(); updateUI(); drawCore(); updateProcess();
      new ResizeObserver(resize).observe(host);
      requestAnimationFrame(frame); watchLoad();
      exposeAPI();
    }, 30));
  }
  function exposeAPI() {
    window.IceSimView = { sim, setCam, toggleRun, openTab, applyQuality, get quality() { return qName; }, get renderInfo() { return { frame: FST.n, calls: FST.calls, tris: FST.tris, pr: renderer.getPixelRatio(), visible, composer: !!composer }; }, get loaded() { return LOAD.finished && $('#sim-loader').classList.contains('is-done'); }, get warp() { return warp; }, get roverAnim() { return { RA, ARM, AX_Y, AX_Z }; }, get view() { return { camera, controls }; }, get stationAnim() { return STA; }, get drillFX() { return DR; } };
  }
  window.IceSimViewInit = init;
})();
