/* =========================================================================
   ICEWISE — Entorno lunar de la simulación (Three.js r128)
   · Suelo detallado: texturas procedurales de regolito, microcráteres y guijarros
   · Sombras: máscara real del DEM (horizontes LOLA) + mapa de sombras que sigue a la cámara
   · Entorno lejano: modelo APROXIMADO del cráter Shackleton fuera de la ventana del DEM
   · Cielo: estrellas, disco solar, Tierra con atmósfera; mapa de entorno para los metales
   ========================================================================= */
(function () {
  'use strict';
  const R_MOON = 1737400;                                   // m
  const SHACK = { R: 10500, rFloor: 3200, depth: 4100 };    // Shackleton: radio del borde, radio del fondo, profundidad (m)

  // ---------- ruido determinista ----------
  function hash(i, j, k, s) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1440662683) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  const sm = t => t * t * (3 - 2 * t);
  function vnoise(x, z, s, per) {
    const xi = Math.floor(x), zi = Math.floor(z), u = sm(x - xi), v = sm(z - zi);
    const w = (i, j) => { if (per) { i = ((i % per) + per) % per; j = ((j % per) + per) % per; } return hash(i, j, 0, s); };
    const a = w(xi, zi), b = w(xi + 1, zi), c = w(xi, zi + 1), d = w(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function vnoise3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const L = (a, b, t) => a + (b - a) * t, H = (i, j, k) => hash(xi + i, yi + j, zi + k, s);
    return L(L(L(H(0, 0, 0), H(1, 0, 0), u), L(H(0, 1, 0), H(1, 1, 0), u), v), L(L(H(0, 0, 1), H(1, 0, 1), u), L(H(0, 1, 1), H(1, 1, 1), u), v), w);
  }
  function fbm(x, z, oct, s, per) {
    let a = 0.5, f = 1, sum = 0, n = 0;
    for (let o = 0; o < oct; o++) { sum += a * vnoise(x * f, z * f, s + o * 17, per ? per * f : 0); n += a; a *= 0.5; f *= 2; }
    return sum / n;
  }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- texturas procedurales (repetibles) ----------
  function canvasTex(n, fill, srgb) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n); fill(img.data, n); g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding; return t;
  }
  function writeNormals(d, h, n, s) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const xl = (x + n - 1) % n, xr = (x + 1) % n, yu = (y + n - 1) % n, yd = (y + 1) % n;
      const nx = -(h[y * n + xr] - h[y * n + xl]) * 0.5 * s, ny = (h[yd * n + x] - h[yu * n + x]) * 0.5 * s, L = Math.hypot(nx, ny, 1), k = (y * n + x) * 4;
      d[k] = (nx / L * 0.5 + 0.5) * 255; d[k + 1] = (ny / L * 0.5 + 0.5) * 255; d[k + 2] = (1 / L * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
  }
  // Albedo del regolito: gris ligeramente cálido, manchas suaves y granos claros/oscuros
  function regolithAlbedo(n = 512) {
    return canvasTex(n, (d) => {
      const r = rng(7);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let v = 0.52 + 0.20 * (fbm(x / n * 8, y / n * 8, 5, 3, 8) - 0.5) + 0.05 * (r() - 0.5);
        const p = r(); if (p < 0.012) v += 0.18; else if (p < 0.03) v -= 0.12;
        const k = (y * n + x) * 4; v = clamp(v, 0, 1) * 255; d[k] = v; d[k + 1] = v * 0.985; d[k + 2] = v * 0.955; d[k + 3] = 255;
      }
    }, true);
  }
  // Relieve de microcráteres (una baldosa = 64 m): ley de potencias de tamaños, bordes elevados, cráteres degradados
  function craterNormal(n = 1024) {
    const h = new Float32Array(n * n), r = rng(42);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = 6 * fbm(x / n * 16, y / n * 16, 3, 9, 16);
    for (let c = 0; c < 320; c++) {
      const cx = r() * n, cy = r() * n, rad = Math.min(120, 2.2 / Math.pow(r() + 0.004, 0.62)), fresh = 0.25 + 0.75 * r() * r(), dep = 0.24 * rad * fresh;
      const R2 = Math.ceil(rad * 1.7);
      for (let oy = -R2; oy <= R2; oy++) for (let ox = -R2; ox <= R2; ox++) {
        const rho = Math.hypot(ox + (cx % 1), oy + (cy % 1)) / rad; if (rho > 1.7) continue;
        const px = (Math.floor(cx) + ox + n) % n, py = (Math.floor(cy) + oy + n) % n;
        h[py * n + px] += dep * (rho < 1 ? rho * rho - 1 + 0.25 : 0.25 * Math.exp(-(((rho - 1) / 0.25) ** 2)));
      }
    }
    return canvasTex(n, d => writeNormals(d, h, n, 0.9), false);
  }
  // Guijarros y grano fino (una baldosa = 4 m)
  function fineNormal(n = 512) {
    const h = new Float32Array(n * n), r = rng(5);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = 5 * fbm(x / n * 32, y / n * 32, 4, 21, 32);
    for (let c = 0; c < 520; c++) {
      const cx = Math.floor(r() * n), cy = Math.floor(r() * n), rad = 1.5 + 6 * Math.pow(r(), 2.2), R2 = Math.ceil(rad);
      for (let oy = -R2; oy <= R2; oy++) for (let ox = -R2; ox <= R2; ox++) {
        const q = 1 - (ox * ox + oy * oy) / (rad * rad); if (q <= 0) continue;
        h[((cy + oy + n) % n) * n + ((cx + ox + n) % n)] += 0.8 * rad * Math.sqrt(q);
      }
    }
    return canvasTex(n, d => writeNormals(d, h, n, 0.7), false);
  }

  // ---------- visibilidad del Sol (máscara real del DEM) ----------
  function sunVisTexture(W) {
    const N = W.N, src = W.shadowNow, d = new Uint8Array(N * N * 4);
    let mx = 0; for (let k = 0; k < N * N; k++) mx = Math.max(mx, src[k]); mx = mx || 1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, c = 0;   // desenfoque gaussiano (σ ≈ 1 celda = 10 m) para bordes suaves
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const wgt = Math.exp(-(a * a + b * b) / 2); s += wgt * src[jj * N + ii] / mx; c += wgt; }
      const v = Math.round(255 * (1 - s / c)), k = (j * N + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    const a = 1 / (W.STEP * N), b = (W.HALF / W.STEP + 0.5) / N;
    return { tex: t, xf: new THREE.Vector4(a, b, a, b) };
  }

  // Parche de sombreado: la luz del Sol (luz direccional 0, la única que proyecta sombras) se multiplica por la
  // visibilidad real del Sol en ese punto. opt.attr = usar atributo por vértice (terreno lejano); opt.terrain = detalle del suelo.
  function patchMaterial(m, SV, opt = {}) {
    if (!m || m.userData.icePatched || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) return;
    m.userData.icePatched = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
      if (opt.attr) {
        sh.vertexShader = 'attribute float sunvis;\nvarying float vSunVisA;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvSunVisA = sunvis;');
        sh.fragmentShader = ('varying float vSunVisA;\nfloat iceSunVis() { return vSunVisA; }\n' + sh.fragmentShader)
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix( 0.22, 1.0, vSunVisA );');   // sombra permanente lejana: casi negra
      } else {
        sh.uniforms.sunVisMap = { value: SV.tex }; sh.uniforms.sunVisXf = { value: SV.xf };
        sh.vertexShader = 'varying vec2 vSunXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          { vec4 sw = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            sw = instanceMatrix * sw;
          #endif
            sw = modelMatrix * sw; vSunXZ = sw.xz; }`);
        sh.fragmentShader = 'uniform sampler2D sunVisMap;\nuniform vec4 sunVisXf;\nvarying vec2 vSunXZ;\n' +
          'float iceSunVis() { return smoothstep( 0.22, 0.78, texture2D( sunVisMap, vec2( vSunXZ.x * sunVisXf.x + sunVisXf.y, vSunXZ.y * sunVisXf.z + sunVisXf.w ) ).r ); }\n' + sh.fragmentShader;
      }
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );',
        'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );\n#if ( UNROLLED_LOOP_INDEX == 0 )\ndirectLight.color *= iceSunVis();\n#endif'));
      if (opt.terrain) {
        sh.uniforms.detailNormalMap = { value: opt.detail }; sh.uniforms.detailScale = { value: opt.detailScale }; sh.uniforms.detailStrength = { value: 1.1 };
        sh.fragmentShader = 'uniform sampler2D detailNormalMap;\nuniform float detailScale;\nuniform float detailStrength;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#ifdef USE_MAP
            vec4 texelColor = texture2D( map, vUv ) * 0.55 + texture2D( map, vUv * 3.71 + vec2( 0.37, 0.11 ) ) * 0.45;
            texelColor = mapTexelToLinear( texelColor );
            texelColor.rgb *= 0.62 + 0.75 * texture2D( map, vUv * 0.043 + vec2( 0.5 ) ).r;
            diffuseColor *= texelColor;
          #endif`)
          .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
            'vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;',
            `vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
             vec3 mapD = texture2D( detailNormalMap, vUv * detailScale ).xyz * 2.0 - 1.0;
             float fadeD = clamp( 1.0 - length( vViewPosition ) / 70.0, 0.0, 1.0 );
             mapN = normalize( vec3( mapN.xy + mapD.xy * detailStrength * fadeD, mapN.z * mapD.z ) );`));
      }
    };
    const key = 'icesun' + (opt.attr ? 'A' : 'T') + (opt.terrain ? 'G' : '');
    m.customProgramCacheKey = () => key;
    m.needsUpdate = true;
  }
  function patchTree(root, SV) {
    root.traverse(o => {
      if (!o.isMesh || o.userData.skipSunVis) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => patchMaterial(m, SV));
    });
  }

  // ---------- color del suelo (albedo por vértice) ----------
  const albedoAt = (x, z, slope) => 0.6 * (0.88 + 0.24 * fbm(x / 380 + 11, z / 380 + 3, 3, 5)) * (1 + 0.07 * clamp(slope / 30, 0, 1));

  // ---------- material del terreno ----------
  function terrainMaterial(W, SV, attr) {
    const TILE = 64;
    const T = terrainMaterial.tex || (terrainMaterial.tex = { alb: regolithAlbedo(), crat: craterNormal(), fine: fineNormal() });
    T.alb.repeat.set(W.SIZE / TILE, W.SIZE / TILE);
    const m = new THREE.MeshStandardMaterial({ map: T.alb, normalMap: T.crat, normalScale: new THREE.Vector2(1.15, 1.15), vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    patchMaterial(m, SV, { terrain: true, attr, detail: T.fine, detailScale: TILE / 4 });
    return m;
  }

  // ---------- relieve lejano: modelo aproximado de Shackleton unido al borde del DEM ----------
  function shackletonA(W, x, z) {
    const c = W.shackleton || { x: 10288, z: -4395 }, r = Math.hypot(x - c.x, z - c.z), { R, rFloor, depth } = SHACK;
    const crest = 120 * Math.exp(-(((r - R) / 700) ** 2));
    if (r < R) { const t = clamp((r - rFloor) / (R - rFloor), 0, 1); return -depth * Math.pow(1 - t, 1.1) + crest; }
    return -900 * (1 - Math.exp(-(r - R) / 7000)) + crest;
  }
  function makeHeight(W) {
    const HALF = W.HALF, A = (x, z) => shackletonA(W, x, z);
    const curv = (x, z) => (x * x + z * z) / (2 * R_MOON);
    return function (x, z) {
      const s = Math.max(Math.abs(x), Math.abs(z)) / HALF;
      if (s <= 1) return W.hAt(x, z) - curv(x, z);
      const px = x / s, pz = z / s, d = (s - 1) * HALF;
      const inCrater = Math.hypot(x - W.shackleton.x, z - W.shackleton.z) < SHACK.R ? 0.45 : 1;
      const hills = (fbm(x / 2600 + 50, z / 2600 + 50, 4, 77) - 0.5) * 2 * (260 * sm(clamp(d / 5000, 0, 1)) + 50 * sm(clamp(d / 700, 0, 1))) * inCrater;
      return W.hAt(px, pz) + A(x, z) - A(px, pz) + hills - curv(x, z);
    };
  }
  function buildFar(W, SV, scene, demNormals) {
    const N = W.N, HALF = W.HALF, STEP = W.STEP, H = W.H, Hf = makeHeight(W);
    const per = [], P = (i, j) => per.push([-HALF + i * STEP, -HALF + j * STEP]);
    for (let i = 0; i < N - 1; i++) P(i, 0);
    for (let j = 0; j < N - 1; j++) P(N - 1, j);
    for (let i = N - 1; i > 0; i--) P(i, N - 1);
    for (let j = N - 1; j > 0; j--) P(0, j);
    const M = per.length, offs = [0]; let st = 10;
    while (offs[offs.length - 1] < 40000) { offs.push(offs[offs.length - 1] + st); st *= 1.12; }
    const K = offs.length, nV = M * K;
    const pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), col = new Float32Array(nV * 3), vis = new Float32Array(nV);
    for (let k = 0; k < K; k++) {
      const s = 1 + offs[k] / HALF;
      for (let m = 0; m < M; m++) {
        const v = k * M + m, x = per[m][0] * s, z = per[m][1] * s, y = Hf(x, z);
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        uv[v * 2] = (x + HALF) / W.SIZE; uv[v * 2 + 1] = (HALF - z) / W.SIZE;
        vis[v] = k === 0 ? 1 - W.gridAt(W.shadowNow, x, z) : 0;
      }
    }
    // pendiente aproximada para el albedo
    for (let k = 0; k < K; k++) for (let m = 0; m < M; m++) {
      const v = k * M + m, x = pos[v * 3], z = pos[v * 3 + 2], e = Math.max(10, offs[Math.min(K - 1, k + 1)] - offs[k]);
      const sl = k === 0 ? W.slopeAt(x, z) : Math.atan(Math.hypot(Hf(x + e, z) - Hf(x - e, z), Hf(x, z + e) - Hf(x, z - e)) / (2 * e)) * 57.3;
      const a = albedoAt(x, z, sl); col[v * 3] = a; col[v * 3 + 1] = a; col[v * 3 + 2] = a * 1.02;
    }
    const idx = [];
    for (let k = 0; k < K - 1; k++) for (let m = 0; m < M; m++) {
      const a = k * M + m, b = k * M + (m + 1) % M, c = (k + 1) * M + m, d = (k + 1) * M + (m + 1) % M;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('sunvis', new THREE.BufferAttribute(vis, 1));
    g.setIndex(idx); g.computeVertexNormals();
    // orientar las caras hacia arriba
    const nrm = g.attributes.normal; if (nrm.getY(M * 2) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    // el borde con el DEM usa las normales del DEM para que no se note la costura
    if (demNormals) {
      const fn = g.attributes.normal;
      for (let m = 0; m < M; m++) {
        const i = Math.round((per[m][0] + HALF) / STEP), j = Math.round((per[m][1] + HALF) / STEP), k = j * N + i;
        fn.setXYZ(m, demNormals.getX(k), demNormals.getY(k), demNormals.getZ(k));
      }
      fn.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(g, terrainMaterial(W, SV, true)); mesh.receiveShadow = false; mesh.castShadow = false; mesh.userData.skipSunVis = true;
    scene.add(mesh);
    // visibilidad del Sol en el entorno lejano: rayo hacia el Sol sobre el relieve (con curvatura), por partes
    const sd = W.sunDir, hl = Math.hypot(sd.x, sd.z), sx = sd.x / hl, sz = sd.z / hl, tanE = sd.y / hl;
    let v = M; const tStart = performance.now();   // el anillo 0 ya tiene la máscara real
    const attr = g.attributes.sunvis;
    (function chunk() {
      const t0 = performance.now();
      while (v < nV && performance.now() - t0 < 12) {
        const x0 = pos[v * 3], y0 = pos[v * 3 + 1] + 2, z0 = pos[v * 3 + 2]; let lit = 1, t = 15;
        while (t < 42000) {
          const x = x0 + sx * t, z = z0 + sz * t;
          if (Math.max(Math.abs(x), Math.abs(z)) > HALF * (1 + 40000 / HALF)) break;
          if (Hf(x, z) > y0 + t * tanE) { lit = 0; break; }
          t *= 1.09; t += 5;
        }
        vis[v] = lit; v++;
      }
      attr.needsUpdate = true; IceEnv.farProgress = v / nV;
      if (v < nV) setTimeout(chunk, 0); else IceEnv.farTime = performance.now() - tStart;
    })();
    return mesh;
  }

  // ---------- rocas ----------
  function rockGeometry(seed, detail) {
    const g = new THREE.IcosahedronGeometry(1, detail), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      let f = 0.78 + 0.5 * vnoise3(x * 1.1 + seed, y * 1.1, z * 1.1, seed) + 0.18 * vnoise3(x * 3 + 7, y * 3, z * 3, seed + 1);
      const yy = y < -0.15 ? y * 0.45 : y;                    // base aplanada, apoyada en el suelo
      pa.setXYZ(i, x * f, yy * f * 0.85, z * f);
    }
    g.computeVertexNormals(); return g;
  }
  function rockMaterial() {
    const T = terrainMaterial.tex || (terrainMaterial.tex = { alb: regolithAlbedo(), crat: craterNormal(), fine: fineNormal() });
    return new THREE.MeshStandardMaterial({ color: 0x7a7a80, roughness: 0.96, metalness: 0, normalMap: T.fine, normalScale: new THREE.Vector2(1.6, 1.6), envMapIntensity: 0.4 });
  }
  // Rocas y guijarros densos alrededor de la cámara: se generan por celdas (siempre iguales en el mismo sitio)
  function nearRocks(W, scene) {
    const CELL = 12, RAD = 7, PER = 18, cap = (2 * RAD + 1) ** 2 * PER;
    const mesh = new THREE.InstancedMesh(rockGeometry(3, 1), rockMaterial(), cap);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let cur = null;
    return function update(cx, cz) {
      const ci = Math.floor(cx / CELL), cj = Math.floor(cz / CELL), key = ci + ',' + cj; if (key === cur) return; cur = key;
      let n = 0;
      for (let dj = -RAD; dj <= RAD; dj++) for (let di = -RAD; di <= RAD; di++) {
        const I = ci + di, J = cj + dj, r = rng((Math.imul(I, 73856093) ^ Math.imul(J, 19349663)) >>> 0);
        const dens = 0.4 + 0.9 * vnoise(I * 0.21, J * 0.21, 4);
        for (let k = 0; k < PER; k++) {
          const x = (I + r()) * CELL, z = (J + r()) * CELL, sz = 0.035 + 0.5 * Math.pow(r(), 4.2), a1 = r(), a2 = r(), a3 = r(), sx = 0.75 + 0.5 * r(), sy = 0.55 + 0.35 * r();
          if (r() > dens) continue;
          if (Math.abs(x) > W.HALF - 2 || Math.abs(z) > W.HALF - 2) continue;
          if (Math.hypot(x - W.station.x, z - W.station.z) < 20 || (W.colony && Math.hypot(x - W.colony.x, z - W.colony.z) < 42)) continue;
          e.set(a1 * 6.3, a2 * 6.3, a3 * 6.3); q.setFromEuler(e); s.set(sz * sx, sz * sy, sz);
          p.set(x, W.hAt(x, z) + sz * 0.12, z); m4.compose(p, q, s); mesh.setMatrixAt(n++, m4);
        }
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    };
  }

  // ---------- cielo: estrellas, Sol, Tierra ----------
  function radialTex(stops, n = 256) {
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function earthTexture() {
    const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = (0.5 - y / h) * Math.PI, X = x / w * 12, Y = y / h * 6;
      const land = fbm(X, Y, 6, 31, 12) + 0.1 * Math.cos(lat * 2) - 0.08;
      const cloud = fbm(X * 2.1 + 5, Y * 2.1, 5, 61, 25) ;
      let r = 14, gg = 42, b = 92;                                      // océano
      if (land > 0.52) { const t = clamp((land - 0.52) * 6, 0, 1); r = 92 + 40 * t; gg = 96 + 20 * t; b = 60 + 10 * t; if (Math.abs(lat) < 0.45 && fbm(X * 3, Y * 3, 3, 8, 36) > 0.5) { r = 70; gg = 92; b = 52; } }
      if (Math.abs(lat) > 1.2) { r = gg = b = 238; }
      const cl = clamp((cloud - 0.5) * 3.2, 0, 0.85); r = r + (245 - r) * cl; gg = gg + (247 - gg) * cl; b = b + (250 - b) * cl;
      const k = (y * w + x) * 4; d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function buildSky(W, scene) {
    const grp = new THREE.Group(), RS = 85000; grp.userData.skipSunVis = true;
    // estrellas: brillo y color variables, banda de la Vía Láctea
    const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), r = rng(99);
    const band = new THREE.Vector3(0.3, 0.55, 0.78).normalize();
    for (let i = 0; i < n; i++) {
      let v; const inBand = i > 5200;
      do { v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize(); if (inBand) { v.addScaledVector(band, -v.dot(band) * (0.85 + 0.1 * r())).normalize(); }
      pos.set([v.x * RS, v.y * RS, v.z * RS], i * 3);
      const mag = Math.pow(r(), inBand ? 5 : 3.2), temp = r();
      const c = temp < 0.15 ? [1, 0.82, 0.68] : temp < 0.4 ? [0.78, 0.86, 1] : [1, 1, 1];
      const L = (inBand ? 0.25 : 0.35) + 1.6 * mag;
      col.set([c[0] * L, c[1] * L, c[2] * L], i * 3); size[i] = (inBand ? 1.2 : 1.4) + 2.6 * mag;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const sm2 = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size; }',
      fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a, 1.0); }' });
    const stars = new THREE.Points(sg, sm2); stars.frustumCulled = false; grp.add(stars);
    // Sol: disco + resplandor (lo tapa el relieve cuando queda bajo el horizonte)
    const sd = new THREE.Vector3(W.sunDir.x, W.sunDir.y, W.sunDir.z).normalize();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,250,240,1)'], [0.06, 'rgba(255,244,225,.85)'], [0.2, 'rgba(255,225,190,.22)'], [1, 'rgba(255,210,170,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(16000); glow.position.copy(sd).multiplyScalar(RS * 0.95); grp.add(glow);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, '#ffffff'], [0.45, '#fffaf0'], [0.5, 'rgba(255,250,240,0)']]), depthWrite: false, transparent: true }));
    disc.scale.setScalar(820); disc.position.copy(sd).multiplyScalar(RS * 0.94); grp.add(disc);
    // Tierra: cerca del horizonte, como se ve desde el polo sur lunar (posición ilustrativa)
    const az = Math.atan2(sd.z, sd.x) + 1.9, el = 0.11, ed = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const ER = RS * 0.8 * Math.tan(0.95 * Math.PI / 180) * 1.0;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 64, 40), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0, envMapIntensity: 0 }));
    earth.position.copy(ed).multiplyScalar(RS * 0.8); earth.rotation.set(0.4, 1.2, 0.2); earth.userData.skipSunVis = true; grp.add(earth);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.035, 64, 40), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { sun: { value: sd } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 sun; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); float l = smoothstep(-0.25, 0.4, dot(vN, sun)); gl_FragColor = vec4(vec3(0.35,0.6,1.0) * f * l * 1.4, 1.0); }' }));
    atm.position.copy(earth.position); grp.add(atm);
    grp.traverse(o => { o.userData.skipSunVis = true; });
    scene.add(grp);
    return { group: grp, earthDir: ed, update(camera) { grp.position.copy(camera.position); } };
  }

  // ---------- mapa de entorno (reflejos de los metales y luz rebotada) ----------
  // Imagen equirectangular calculada en JS (Three la convierte en cubo con mipmaps): cielo negro, suelo iluminado
  // (más claro de espaldas al Sol, donde se ven las caras iluminadas), banda del horizonte y brillo del Sol.
  function envMap(renderer, W) {
    const w = 512, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    const sd = new THREE.Vector3(W.sunDir.x, W.sunDir.y, W.sunDir.z).normalize(), shl = Math.hypot(sd.x, sd.z);
    const enc = x => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = (0.5 - (y + 0.5) / h) * Math.PI, phi = ((x + 0.5) / w - 0.5) * 2 * Math.PI;
      const dx = Math.cos(phi) * Math.cos(lat), dy = Math.sin(lat), dz = Math.sin(phi) * Math.cos(lat);
      const hl = Math.hypot(dx, dz) || 1, facing = (dx * sd.x + dz * sd.z) / (hl * shl);
      let v = 0.002;
      const ground = 0.07 + 0.09 * (0.5 - 0.5 * facing), gw = clamp((0.02 - dy) / 0.07, 0, 1);
      v = v * (1 - gw) + ground * gw;
      v += 0.22 * Math.exp(-Math.abs(dy) * 35) * (0.55 - 0.4 * facing);
      const s = Math.max(0, dx * sd.x + dy * sd.y + dz * sd.z); v += Math.pow(s, 900) * 6 + Math.pow(s, 60) * 0.8;
      const k = (y * w + x) * 4, L = clamp(v, 0, 1);
      d[k] = enc(L); d[k + 1] = enc(L * 0.985); d[k + 2] = enc(L * 0.96 + (dy > 0 ? 0.002 : 0)); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ---------- sombra del Sol que sigue a la cámara (alta resolución donde se mira) ----------
  const _f = new THREE.Vector3();
  function updateSun(sun, W, focus, camDist) {
    const half = clamp(camDist * 1.1, 16, W.HALF * 1.6), D = half * 3 + 400, sd = W.sunDir;
    sun.position.set(focus.x + sd.x * D, focus.y + sd.y * D, focus.z + sd.z * D); sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    const c = sun.shadow.camera, vh = Math.max(half, 30);
    if (Math.abs(c.right - half) > half * 0.06 || c.far !== D * 2) {
      Object.assign(c, { left: -half, right: half, top: vh, bottom: -vh, near: 1, far: D * 2 }); c.updateProjectionMatrix();
      sun.shadow.normalBias = 0.004 + half * 0.0012; sun.shadow.bias = -0.00015;
    }
  }

  // ---------- huellas de las ruedas ----------
  // Dos franjas (izquierda y derecha) que siguen el recorrido real del rover y se pegan al relieve. Oscurecen el regolito
  // (multiplican el color del suelo, como las huellas de Apolo) con las garras en V de las 3 ruedas de cada lado, bordes
  // irregulares y salpicaduras. Con el tiempo se cubren de polvo por zonas hasta desaparecer.
  // Nota de honestidad: en la Luna real las huellas duran muchísimo (las de Apolo siguen ahí); aquí se borran poco a poco
  // para que el mapa no se sature. Búfer circular: últimos ~10 km.
  const TRK = { TILE: 1.92, WIDTH: 0.56, CORE: 0.15, PITCH: 1.92 / 19 };   // baldosa 1,92 m; franja 0,56 m; huella ±0,15 m; garra cada 10 cm
  function trackTexture() {
    const w = 128, h = 1024, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, r = rng(13);
    const n = (v, K, s, x = 0.5) => vnoise(v * K, x, s, K);                 // ruido periódico a lo largo de la huella
    const WHEELS = [[0, 0, 1], [0.016, 0.37, 0.7], [-0.011, 0.71, 0.55]];   // 3 ruedas: desplazamiento lateral, fase, fuerza
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h, vm = v * TRK.TILE;
      const halfW = TRK.CORE + 0.012 * (n(v, 12, 3) - 0.5) * 2 + 0.006 * (n(v, 48, 4) - 0.5) * 2;
      const wob = 0.008 * (n(v, 6, 5) - 0.5) * 2;                            // la huella no es perfectamente recta
      for (let x = 0; x < w; x++) {
        const uc = ((x + 0.5) / w - 0.5) * TRK.WIDTH - wob, au = Math.abs(uc);
        const inside = sm(clamp((halfW + 0.004 - au) / 0.012, 0, 1));
        let chev = 0;
        for (const [ow, ph0, st] of WHEELS) {
          const ph = (((vm + ph0 * TRK.PITCH + Math.abs(uc - ow) * 0.5) / TRK.PITCH) % 1 + 1) % 1;
          const broken = 0.35 + 0.65 * n(v, 38, 11 + Math.round(st * 7), (x / w) * 3);   // garras rotas o más débiles
          chev = Math.max(chev, Math.exp(-(((ph - 0.5) / 0.13) ** 2)) * st * broken);
        }
        const compact = 0.74 + 0.07 * (n(v, 9, 21, x / w * 2) - 0.5) * 2;       // regolito compactado con manchas
        let val = 1 - inside * (1 - (compact - 0.25 * chev));
        const out = au - halfW;                                              // fuera de la huella: bordillo y salpicaduras
        if (out > 0) {
          val *= 1 - 0.10 * Math.exp(-(((out - 0.012) / 0.01) ** 2)) * (0.4 + 0.6 * n(v, 30, 31));
          if (r() < 0.05 * Math.exp(-out / 0.03)) val *= 0.62 + 0.25 * r();
        } else if (r() < 0.012) val *= 0.8;                                  // granos removidos
        f[y * w + x] = val;
      }
    }
    for (let k = 0; k < w * h; k++) { const v = clamp(f[k], 0, 1) * 255; d[k * 4] = v; d[k * 4 + 1] = v; d[k * 4 + 2] = v * 0.99; d[k * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }
  function wheelTracks(W, scene, life = 30 * 3600) {
    const MAXQ = 52000, STEP = 0.4, HALF = TRK.WIDTH / 2, OFFSET = 1.0;      // ruedas a ±1,0 m del eje del rover
    const pos = new Float32Array(MAXQ * 6 * 3), uv = new Float32Array(MAXQ * 6 * 2), born = new Float32Array(MAXQ * 6);
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), ua = new THREE.BufferAttribute(uv, 2), ba = new THREE.BufferAttribute(born, 1);
    [pa, ua, ba].forEach(a => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('position', pa); g.setAttribute('uv', ua); g.setAttribute('nace', ba); g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: trackTexture() }, ahora: { value: 0 }, vida: { value: life } },
      vertexShader: `attribute float nace; varying vec2 vUv; varying float vNace; varying vec2 vW;
        void main(){ vUv = uv; vNace = nace; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform float ahora; uniform float vida; varying vec2 vUv; varying float vNace; varying vec2 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          vec3 c = texture2D(map, vUv).rgb;
          float age = clamp((ahora - vNace) / vida, 0.0, 1.2);
          float n = 0.55 * vn(vW * 0.35) + 0.3 * vn(vW * 1.7) + 0.15 * vn(vW * 7.0);   // el polvo cubre por zonas
          float keep = smoothstep(age - 0.12, age + 0.12, n * 0.9 + 0.08) * (1.0 - smoothstep(0.85, 1.15, age));
          gl_FragColor = vec4(mix(vec3(1.0), c, keep), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.userData.skipSunVis = true; scene.add(mesh);
    let q = 0, filled = 0, last = null, lastT = -1, dist = [0, 0], prev = [null, null], dirtyFrom = -1, now = 0;
    // Altura exacta de la malla del terreno (dos triángulos por celda, como PlaneGeometry), no la bilineal:
    // así la huella queda pegada al suelo y no se esconde bajo él.
    const N = W.N, H = W.H, STP = W.STEP, HF = W.HALF;
    const y = (x, z) => {
      const fx = clamp((x + HF) / STP, 0, N - 1.001), fz = clamp((z + HF) / STP, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const ha = H[j * N + i], hd = H[j * N + i + 1], hb = H[(j + 1) * N + i], hc = H[(j + 1) * N + i + 1];
      return (u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v)) + 0.02;
    };
    function clear() { q = 0; filled = 0; last = null; prev = [null, null]; dist = [0, 0]; g.setDrawRange(0, 0); }
    function quad(a, b, s) {
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L < 1e-4) return;
      const nx = -dz / L * HALF, nz = dx / L * HALF, v0 = dist[s] / TRK.TILE, v1 = (dist[s] + L) / TRK.TILE; dist[s] += L;
      const P = [[a.x - nx, a.z - nz, 0, v0], [a.x + nx, a.z + nz, 1, v0], [b.x + nx, b.z + nz, 1, v1], [b.x - nx, b.z - nz, 0, v1]];
      const o = q * 6;
      [0, 1, 2, 0, 2, 3].forEach((i, k) => { const p = P[i]; pos.set([p[0], y(p[0], p[1]), p[1]], (o + k) * 3); uv.set([p[2], p[3]], (o + k) * 2); born[o + k] = now; });
      if (dirtyFrom < 0) dirtyFrom = q;
      q++; filled = Math.max(filled, q);
      if (q >= MAXQ) { flush(); q = 0; dirtyFrom = -1; }
    }
    function flush() {
      if (dirtyFrom < 0) return;
      const n = q - dirtyFrom;
      pa.updateRange.offset = dirtyFrom * 18; pa.updateRange.count = n * 18; pa.needsUpdate = true;
      ua.updateRange.offset = dirtyFrom * 12; ua.updateRange.count = n * 12; ua.needsUpdate = true;
      ba.updateRange.offset = dirtyFrom * 6; ba.updateRange.count = n * 6; ba.needsUpdate = true;
      g.setDrawRange(0, filled * 6); dirtyFrom = -1;
    }
    function update(R, t) {
      if (t < lastT) clear(); lastT = t; now = t; mat.uniforms.ahora.value = t;
      const p = { x: R.x, z: R.z, h: R.heading };
      if (!last) { last = p; return; }
      const d = Math.hypot(p.x - last.x, p.z - last.z);
      if (d > 80) { last = p; prev = [null, null]; return; }            // salto (reinicio): no unir
      if (d < STEP) return;
      const n = Math.ceil(d / STEP); let dh = p.h - last.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      for (let i = 1; i <= n; i++) {
        const f = i / n, x = last.x + (p.x - last.x) * f, z = last.z + (p.z - last.z) * f, h = last.h + dh * f;
        const lx = -Math.sin(h), lz = Math.cos(h);                      // perpendicular a la marcha
        for (let s = 0; s < 2; s++) {
          const wob = 0.03 * (vnoise(dist[s] / 3.1, s * 7.3, 91) - 0.5) * 2;   // la rueda no sigue una línea perfecta
          const sg = s ? 1 : -1, c = { x: x + lx * (OFFSET * sg + wob), z: z + lz * (OFFSET * sg + wob) };
          if (prev[s]) quad(prev[s], c, s);
          prev[s] = c;
        }
      }
      last = p; flush();
    }
    return { update, clear, mesh, setLife(s) { mat.uniforms.vida.value = s; } };
  }

  window.IceEnv = { sunVisTexture, patchMaterial, patchTree, terrainMaterial, albedoAt, buildFar, rockGeometry, rockMaterial, nearRocks, buildSky, envMap, updateSun, wheelTracks, SHACK };
})();
