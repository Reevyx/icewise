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
  // Suelo: el color (albedo) y el relieve de microcráteres salen del MISMO campo de alturas (una baldosa = 64 m),
  // así coinciden: fondo de cráter algo más oscuro, borde más claro y halo de material expulsado en los cráteres jóvenes.
  function groundTextures(n = 1024) {
    const h = new Float32Array(n * n), a = new Float32Array(n * n), r = rng(42), rg = rng(7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x;
      h[k] = 6 * fbm(x / n * 16, y / n * 16, 3, 9, 16);
      a[k] = 0.5 + 0.16 * (fbm(x / n * 8, y / n * 8, 5, 3, 8) - 0.5) + 0.07 * (fbm(x / n * 48, y / n * 48, 3, 17, 48) - 0.5);
    }
    for (let c = 0; c < 340; c++) {
      const cx = r() * n, cy = r() * n, rad = Math.min(120, 2.2 / Math.pow(r() + 0.004, 0.62)), fresh = 0.25 + 0.75 * r() * r(), dep = 0.24 * rad * fresh;
      const young = fresh > 0.72, R2 = Math.ceil(rad * (young ? 3.2 : 1.7)), ray0 = r() * 6.28;
      for (let oy = -R2; oy <= R2; oy++) for (let ox = -R2; ox <= R2; ox++) {
        const dx = ox + (cx % 1), dy = oy + (cy % 1), rho = Math.hypot(dx, dy) / rad;
        if (rho > (young ? 3.2 : 1.7)) continue;
        const px = (Math.floor(cx) + ox + n) % n, py = (Math.floor(cy) + oy + n) % n, k = py * n + px;
        if (rho <= 1.7) h[k] += dep * (rho < 1 ? rho * rho - 1 + 0.25 : 0.25 * Math.exp(-(((rho - 1) / 0.25) ** 2)));
        if (rho < 1) a[k] -= 0.05 * fresh * (1 - rho * rho);                                  // interior: sombra y polvo fino
        a[k] += 0.07 * fresh * Math.exp(-(((rho - 1) / 0.18) ** 2));                           // borde: material fresco
        if (young && rho > 0.9) {                                                               // halo y rayos de eyecta
          const ang = Math.atan2(dy, dx), rays = 0.5 + 0.5 * Math.cos(ang * 7 + ray0) * Math.cos(ang * 3 - ray0);
          a[k] += 0.09 * Math.exp(-(rho - 1) / 0.7) * (0.45 + 0.55 * rays);
        }
      }
    }
    for (let k = 0; k < n * n; k++) { const p = rg(); if (p < 0.01) a[k] += 0.16; else if (p < 0.025) a[k] -= 0.1; }
    const alb = canvasTex(n, d => { for (let k = 0; k < n * n; k++) { const v = clamp(a[k], 0, 1) * 255; d[k * 4] = v; d[k * 4 + 1] = v * 0.985; d[k * 4 + 2] = v * 0.955; d[k * 4 + 3] = 255; } }, true);
    const crat = canvasTex(n, d => writeNormals(d, h, n, 0.9), false);
    return { alb, crat };
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
  const groundTex = () => groundTex.t || (groundTex.t = Object.assign(groundTextures(), { fine: fineNormal() }));

  // ---------- depósitos de hielo ----------
  // Escarcha azul blanquecina con bordes ramificados, más densa donde hay más hielo, y destellos de cristales que cambian
  // según desde dónde se mire. Es una VISUALIZACIÓN: el hielo real está unos centímetros bajo el suelo (capa seca).
  function iceLayer(W, geo) {
    const res = 640, d = new Uint8Array(res * res * 4), raw = new Float32Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const x = -W.HALF + (i + 0.5) * W.SIZE / res, z = -W.HALF + (j + 0.5) * W.SIZE / res;
      raw[j * res + i] = clamp(W.iceWt(x, z) / 10, 0, 1);
    }
    for (let pass = 0; pass < 2; pass++) for (const horiz of [true, false]) {          // desenfoque gaussiano separable (~12 m)
      const tmp = new Float32Array(res * res), K = [0.06, 0.12, 0.18, 0.28, 0.18, 0.12, 0.06];
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        let sum = 0; for (let t = -3; t <= 3; t++) { const ii = horiz ? clamp(i + t, 0, res - 1) : i, jj = horiz ? j : clamp(j + t, 0, res - 1); sum += K[t + 3] * raw[jj * res + ii]; }
        tmp[j * res + i] = sum;
      }
      raw.set(tmp);
    }
    for (let k = 0; k < res * res; k++) { const v = Math.round(255 * raw[k]); d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v; d[k * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(d, res, res, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: { iceMap: { value: tex }, halfSize: { value: W.HALF }, size: { value: W.SIZE }, time: { value: 0 }, camPos: { value: new THREE.Vector3() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D iceMap; uniform float halfSize; uniform float size; uniform float time; uniform vec3 camPos; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1.0,0.0)), f.x), mix(h2(i+vec2(0.0,1.0)), h2(i+vec2(1.0,1.0)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          float d = texture2D(iceMap, (vW.xz + halfSize) / size).r;
          if (d < 0.015) discard;
          vec2 p = vW.xz;
          float n1 = fbm(p * 0.07), n2 = fbm(p * 0.55);
          float veins = 1.0 - abs(2.0 * fbm(p * 1.4 + n1 * 3.0) - 1.0);              // dendritas de escarcha
          float th = 0.78 - 0.42 * clamp(d * 1.6, 0.0, 1.0);
          float cover = smoothstep(th, th + 0.14, n1 * 0.5 + n2 * 0.32 + veins * 0.32);
          float a = cover * (0.08 + 0.2 * clamp(d * 1.6, 0.0, 1.0)) + 0.05 * smoothstep(0.03, 0.3, d);   // velo azulado + parches tenues
          vec3 col = mix(vec3(0.3, 0.4, 0.72), vec3(0.62, 0.72, 0.95), clamp(veins * 0.7 + n2 * 0.4, 0.0, 1.0)) * 0.75;   // en sombra permanente: apagado
          // destellos: cristales que brillan según el punto de vista
          float dist = distance(camPos, vW);
          vec2 g = floor(p * 14.0), f = fract(p * 14.0) - 0.5; float hh = h2(g);
          vec3 vdir = normalize(camPos - vW);
          float tw = 0.5 + 0.5 * sin(hh * 80.0 + dot(vdir, vec3(19.0, 7.0, 11.0)) * 6.0 + time * 0.6);
          float spark = step(0.982 - 0.02 * d, hh) * smoothstep(0.16, 0.0, length(f)) * tw * smoothstep(140.0, 25.0, dist) * cover;
          col += vec3(1.6) * spark; a = max(a, spark);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; mesh.userData.skipSunVis = true;
    return { mesh, update(t, camera) { mat.uniforms.time.value = t; mat.uniforms.camPos.value.copy(camera.position); } };
  }
  // Cristales de hielo: grupos de 3 agujas transparentes que reflejan el entorno (visualización de dónde hay hielo)
  function crystalGeometry() {
    const parts = [[0, 0, 0, 1, 0], [0.06, 0.02, 0.5, 0.75, 0.6], [-0.05, -0.03, -0.6, 0.6, -0.5]].map(([x, z, tx, s, tz]) => {
      const g = new THREE.OctahedronGeometry(0.1, 0); g.scale(0.6, 2.2, 0.6); g.rotateX(tz * 0.6); g.rotateZ(tx * 0.6); g.scale(s, s, s); g.translate(x, 0.12 * s, z); return g.index ? g.toNonIndexed() : g;
    });
    const pos = [], nor = [];
    parts.forEach(g => { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
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
        // Coordenadas relativas a un origen cercano a la cámara (terOrigin): con zoom extremo, las coordenadas absolutas
        // y las derivadas entre píxeles se quedan sin decimales y producen ruido. El relieve se orienta con los ejes del mundo.
        sh.uniforms.terOrigin = DETAIL.oU;
        sh.vertexShader = 'uniform vec2 terOrigin;\nvarying vec2 vTerXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvTerXZ = (modelMatrix * vec4(transformed, 1.0)).xz - terOrigin;');
        sh.fragmentShader = 'uniform vec2 terOrigin;\nvarying vec2 vTerXZ;\nuniform sampler2D detailNormalMap;\nuniform float detailScale;\nuniform float detailStrength;\n' +
          'vec2 terUV(float tile, vec2 off) { return vTerXZ / tile + fract(terOrigin / tile) + off; }\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#ifdef USE_MAP
            vec4 texelColor = texture2D( map, vUv ) * 0.55 + texture2D( map, vUv * 3.71 + vec2( 0.37, 0.11 ) ) * 0.45;
            texelColor = mapTexelToLinear( texelColor );
            texelColor.rgb *= 0.62 + 0.75 * texture2D( map, vUv * 0.043 + vec2( 0.5 ) ).r;
            float dV = length( vViewPosition );
            float microA = texture2D( map, terUV( 0.27, vec2( 0.13, 0.71 ) ) ).r, microB = texture2D( map, terUV( 1.05, vec2( 0.5, 0.2 ) ) ).r;
            texelColor.rgb *= mix( 1.0, 0.7 + 0.6 * microA, clamp( 1.0 - dV / 7.0, 0.0, 1.0 ) ) * mix( 1.0, 0.7 + 0.6 * microB, clamp( 1.0 - dV / 25.0, 0.0, 1.0 ) );
            diffuseColor *= texelColor;
          #endif`)
          .replace('#include <normal_fragment_maps>', `{
             vec3 Nv = normal;
             vec3 Tv = ( viewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz; Tv = normalize( Tv - Nv * dot( Nv, Tv ) );
             vec3 Bv = ( viewMatrix * vec4( 0.0, 0.0, -1.0, 0.0 ) ).xyz; Bv = normalize( Bv - Nv * dot( Nv, Bv ) - Tv * dot( Tv, Bv ) );
             vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0; mapN.xy *= normalScale;
             vec3 mapD = texture2D( detailNormalMap, vUv * detailScale ).xyz * 2.0 - 1.0;
             float fadeD = clamp( 1.0 - length( vViewPosition ) / 70.0, 0.0, 1.0 );
             vec3 mapE = texture2D( detailNormalMap, terUV( 0.36, vec2( 0.31, 0.77 ) ) ).xyz * 2.0 - 1.0;
             float fadeE = clamp( 1.0 - length( vViewPosition ) / 6.0, 0.0, 1.0 );
             vec3 nT = vec3( mapN.xy + mapD.xy * detailStrength * fadeD + mapE.xy * 1.4 * fadeE, mapN.z * mapD.z );
             normal = normalize( Tv * nT.x + Bv * nT.y + Nv * nT.z );
           }`)
          // Bordes de cráteres en sombra con un tenue tono azulado (reflejo frío del cielo y del hielo): solo en las
          // caras rasantes y en la penumbra, así las sombras siguen siendo negras.
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
             { float shK = 1.0 - iceSunVis(); float vD = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
               vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
               float wall = smoothstep( 0.12, 0.45, 1.0 - dot( normalize( normal ), upV ) );          // solo paredes y bordes de cráter
               float far = smoothstep( 40.0, 250.0, length( vViewPosition ) );                        // y a distancia
               float rim = pow( 1.0 - vD, 3.0 ) * shK * wall * far, pen = shK * ( 1.0 - shK ) * 4.0 * wall * far;
               totalEmissiveRadiance += vec3( 0.06, 0.16, 0.5 ) * ( rim * 0.22 + pen * 0.035 ); }`);
      }
    };
    if (opt.holes) {                                                            // hueco donde está el terreno de detalle
      const prev2 = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { prev2(sh, r);
        sh.uniforms.detailC = { value: DETAIL.c }; sh.uniforms.detailH = DETAIL.h;
        sh.fragmentShader = 'uniform vec2 detailC;\nuniform float detailH;\n' + sh.fragmentShader.replace('void main() {',
          'void main() {\n  if (detailH > 0.0 && abs(vSunXZ.x - detailC.x) < detailH && abs(vSunXZ.y - detailC.y) < detailH) discard;');
      };
    }
    const key = 'icesun' + (opt.attr ? 'A' : 'T') + (opt.terrain ? 'G' : '') + (opt.holes ? 'H' : '');
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
  function terrainMaterial(W, SV, attr, holes) {
    const TILE = 64;
    const T = groundTex();
    T.alb.repeat.set(W.SIZE / TILE, W.SIZE / TILE);
    const m = new THREE.MeshStandardMaterial({ map: T.alb, normalMap: T.crat, normalScale: new THREE.Vector2(1.15, 1.15), vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    patchMaterial(m, SV, { terrain: true, attr, holes, detail: T.fine, detailScale: TILE / 4 });
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
    const HALF = W.HALF, A = (x, z) => shackletonA(W, x, z), N = W.N, STEP = W.STEP;
    const curv = (x, z) => (x * x + z * z) / (2 * R_MOON);
    // Borde del DEM suavizado (media móvil de ~1 km): lejos del borde no se arrastran sus irregularidades en línea recta
    const P = 4 * (N - 1), raw = new Float32Array(P), smE = new Float32Array(P), Wn = 50;
    for (let m = 0; m < P; m++) {
      const s = Math.floor(m / (N - 1)), o = m % (N - 1);
      const [i, j] = s === 0 ? [o, 0] : s === 1 ? [N - 1, o] : s === 2 ? [N - 1 - o, N - 1] : [0, N - 1 - o];
      raw[m] = W.H[j * N + i];
    }
    for (let m = 0; m < P; m++) { let a = 0; for (let t = -Wn; t <= Wn; t++) a += raw[(m + t + P) % P]; smE[m] = a / (2 * Wn + 1); }
    const edgeSm = (px, pz) => {
      let f; const e = 1e-3;
      if (Math.abs(pz + HALF) < e) f = (px + HALF) / STEP;
      else if (Math.abs(px - HALF) < e) f = (N - 1) + (pz + HALF) / STEP;
      else if (Math.abs(pz - HALF) < e) f = 2 * (N - 1) + (HALF - px) / STEP;
      else f = 3 * (N - 1) + (HALF - pz) / STEP;
      const i0 = Math.floor(f) % P, i1 = (i0 + 1) % P, u = f - Math.floor(f); return smE[i0] * (1 - u) + smE[i1] * u;
    };
    return function (x, z) {
      const s = Math.max(Math.abs(x), Math.abs(z)) / HALF;
      if (s <= 1) return W.hAt(x, z) - curv(x, z);
      const px = x / s, pz = z / s, d = (s - 1) * HALF;
      const inCrater = Math.hypot(x - W.shackleton.x, z - W.shackleton.z) < SHACK.R ? 0.45 : 1;
      const hills = (fbm(x / 2600 + 50, z / 2600 + 50, 4, 77) - 0.5) * 2 * (260 * sm(clamp(d / 5000, 0, 1)) + 50 * sm(clamp(d / 700, 0, 1))) * inCrater;
      const ph = W.hAt(px, pz), base = ph + (edgeSm(px, pz) - ph) * sm(clamp(d / 1200, 0, 1));
      return base + A(x, z) - A(px, pz) + hills - curv(x, z);
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
    while (offs[offs.length - 1] < 40000) { offs.push(offs[offs.length - 1] + st); st = Math.min(650, st * 1.085); }   // anillos más juntos: sin dientes de sierra
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
        const x0 = pos[v * 3], y0 = pos[v * 3 + 1] + 2, z0 = pos[v * 3 + 2]; let m = 1e9, t = 15;
        while (t < 42000) {
          const x = x0 + sx * t, z = z0 + sz * t;
          if (Math.max(Math.abs(x), Math.abs(z)) > HALF * (1 + 40000 / HALF)) break;
          m = Math.min(m, (y0 + t * tanE - Hf(x, z)) / (8 + t * 0.012));   // margen sobre el horizonte (penumbra del disco solar)
          if (m < -1) break;
          t *= 1.09; t += 5;
        }
        vis[v] = clamp(0.5 + 0.5 * m, 0, 1); v++;
      }
      attr.needsUpdate = true; IceEnv.farProgress = v / nV;
      if (v < nV) setTimeout(chunk, 0);
      else {                                                                     // suavizado final entre vértices vecinos
        const out = new Float32Array(vis);
        for (let k = 1; k < K - 1; k++) for (let mm = 0; mm < M; mm++) {
          const i = k * M + mm; out[i] = (vis[i] * 2 + vis[k * M + (mm + 1) % M] + vis[k * M + (mm + M - 1) % M] + vis[i - M] + vis[i + M]) / 6;
        }
        vis.set(out); attr.needsUpdate = true; IceEnv.farTime = performance.now() - tStart;
      }
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
    // unir vértices repetidos para que las normales se promedien (superficie suave, sin facetas)
    const map = new Map(), idx = [], pos = [];
    for (let i = 0; i < pa.count; i++) {
      const key = Math.round(pa.getX(i) * 1e4) + ',' + Math.round(pa.getY(i) * 1e4) + ',' + Math.round(pa.getZ(i) * 1e4);
      let k = map.get(key); if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); }
      idx.push(k);
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx);
    out.computeVertexNormals(); return out;
  }
  function rockMaterial() {
    const T = groundTex();
    return new THREE.MeshStandardMaterial({ color: 0x343438, roughness: 0.97, metalness: 0, normalMap: T.fine, normalScale: new THREE.Vector2(1.6, 1.6), envMapIntensity: 0.4 });
  }
  // Rocas y guijarros densos alrededor de la cámara: se generan por celdas (siempre iguales en el mismo sitio)
  function nearRocks(W, scene) {
    const CELL = 12, RAD = 7, PER = 18, cap = (2 * RAD + 1) ** 2 * PER;
    const mesh = new THREE.InstancedMesh(rockGeometry(3, 2), rockMaterial(), cap);
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

  // ---------- cielo: Vía Láctea, estrellas, Sol, Tierra ----------
  // Sin atmósfera las estrellas no titilan; brillan fijas. La Vía Láctea, los destellos de lente y el halo del Sol
  // son efectos de cámara para que la escena se aprecie (como en una foto de larga exposición).
  function radialTex(stops, n = 256) {
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function raysTex(n = 512) {                                                   // corona con rayos para el Sol
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = rng(3);
    g.translate(n / 2, n / 2); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, L = n * (0.12 + 0.38 * Math.pow(r(), 2)), w = 0.6 + r() * 1.8;
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); gr.addColorStop(0, 'rgba(255,245,225,0.35)'); gr.addColorStop(1, 'rgba(255,235,200,0)');
      g.strokeStyle = gr; g.lineWidth = w; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * L, Math.sin(a) * L); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function earthTextures() {
    const w = 1024, h = 512, mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cd = mk(), cn = mk(), cc = mk(), gd = cd.getContext('2d'), gn = cn.getContext('2d'), gc = cc.getContext('2d');
    const day = gd.createImageData(w, h), night = gn.createImageData(w, h), cloud = gc.createImageData(w, h), r = rng(21);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = (0.5 - y / h) * Math.PI, X = x / w * 12, Y = y / h * 6, k = (y * w + x) * 4;
      const landF = fbm(X, Y, 6, 31, 12) + 0.1 * Math.cos(lat * 2) - 0.08, land = landF > 0.52, ice = Math.abs(lat) > 1.18;
      let R = 10, G = 38, B = 86;
      if (land) { const t = clamp((landF - 0.52) * 6, 0, 1), dry = fbm(X * 2, Y * 2, 3, 77, 24); R = 70 + 90 * dry * t + 20 * t; G = 88 + 30 * (1 - dry); B = 48 + 14 * t; if (Math.abs(lat) < 0.35 && dry < 0.45) { R = 46; G = 82; B = 44; } }
      if (ice) { R = G = B = 236; }
      day.data.set([R, G, B, land || ice ? 0 : 255], k);                       // alfa = océano (para el reflejo del Sol)
      const city = land && !ice && Math.abs(lat) < 1.0 && fbm(X * 6, Y * 6, 3, 99, 72) > 0.6 && r() < 0.35;
      const li = city ? 160 + 95 * r() : 0; night.data.set([li, li * 0.78, li * 0.45, 255], k);
      const cl = clamp((fbm(X * 2.1 + 5, Y * 2.1, 5, 61, 25) - 0.48) * 3.0, 0, 1) * (Math.abs(lat) > 1.25 ? 0.4 : 1);
      cloud.data.set([255, 255, 255, cl * 235], k);
    }
    gd.putImageData(day, 0, 0); gn.putImageData(night, 0, 0); gc.putImageData(cloud, 0, 0);
    const T = c => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
    return { day: T(cd), night: T(cn), cloud: T(cc) };
  }
  const NOISE3 = `float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
    float f3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n3(p); p *= 2.02; a *= 0.5; } return s; }`;
  function buildSky(W, scene) {
    const grp = new THREE.Group(), RS = 85000;
    const sd = new THREE.Vector3(W.sunDir.x, W.sunDir.y, W.sunDir.z).normalize();
    const band = new THREE.Vector3(0.3, 0.55, 0.78).normalize();               // normal del plano galáctico (ilustrativa)
    const gcen = new THREE.Vector3(1, 0, 0).sub(band.clone().multiplyScalar(band.x)).normalize().applyAxisAngle(band, 2.2);
    // 1) Bóveda: Vía Láctea con nubes, núcleo cálido, franjas de polvo y nebulosas; luz zodiacal cerca del Sol
    const dome = new THREE.Mesh(new THREE.SphereGeometry(RS * 1.03, 64, 32), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      uniforms: { band: { value: band }, gcen: { value: gcen }, sun: { value: sd } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 band; uniform vec3 gcen; uniform vec3 sun; varying vec3 vD; ${NOISE3}
        void main(){
          vec3 d = normalize(vD); float b = dot(d, band);
          float plane = exp(-b * b / 0.018), wide = exp(-b * b / 0.09);
          float core = exp(-pow(acos(clamp(dot(d, gcen), -1.0, 1.0)), 2.0) / 0.35);
          float cl = f3(d * 5.0), fine = f3(d * 22.0);
          float dust = smoothstep(0.45, 0.75, f3(d * 9.0 + 3.1)) * exp(-b * b / 0.004);   // franjas oscuras de polvo
          vec3 warm = vec3(1.0, 0.86, 0.7), cool = vec3(0.82, 0.84, 0.9);
          vec3 col = mix(cool, warm, core) * (plane * (0.5 + 0.9 * cl) * (0.6 + 0.6 * fine) + 0.25 * wide * cl) * (1.0 - 0.85 * dust);
          col *= 0.085 + 0.12 * core;
          float neb = smoothstep(0.66, 0.82, f3(d * 7.0 + 9.0)) * plane;            // nebulosas rojizas y azuladas
          col += neb * mix(vec3(0.5, 0.12, 0.2), vec3(0.15, 0.25, 0.55), step(0.5, n3(d * 3.0))) * 0.06;
          float sa = acos(clamp(dot(d, sun), -1.0, 1.0));                          // luz zodiacal
          col += vec3(1.0, 0.9, 0.75) * 0.05 * exp(-sa * sa / 0.08) * smoothstep(-0.05, 0.25, d.y + 0.05);
          gl_FragColor = vec4(col, 1.0);
        }` }));
    dome.renderOrder = -10; dome.frustumCulled = false; grp.add(dome);
    // 2) Estrellas: color según temperatura, las brillantes con halo y destellos en cruz
    const n = 11000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), brt = new Float32Array(n), r = rng(99);
    for (let i = 0; i < n; i++) {
      let v; const inBand = i > 6000;
      do { v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize(); if (inBand) v.addScaledVector(band, -v.dot(band) * (0.8 + 0.18 * r())).normalize();
      pos.set([v.x * RS, v.y * RS, v.z * RS], i * 3);
      const mag = Math.pow(r(), inBand ? 6 : 3.4), t = r();
      const c = t < 0.12 ? [1, 0.72, 0.52] : t < 0.3 ? [1, 0.9, 0.78] : t < 0.55 ? [0.75, 0.84, 1] : [1, 1, 1];
      const L = (inBand ? 0.22 : 0.3) + 1.9 * mag; col.set([c[0] * L, c[1] * L, c[2] * L], i * 3);
      const big = mag > 0.82 && !inBand; size[i] = big ? 16 + 14 * mag : (inBand ? 1.4 : 1.6) + 2.8 * mag; brt[i] = big ? 1 : 0;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(size, 1)); sg.setAttribute('bright', new THREE.BufferAttribute(brt, 1));
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float size; attribute float bright; varying vec3 vC; varying float vB; void main(){ vC = color; vB = bright; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size; }',
      fragmentShader: `varying vec3 vC; varying float vB;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
          float core = vB > 0.5 ? exp(-d * d * 260.0) + 0.25 * exp(-d * d * 30.0) : smoothstep(0.5, 0.0, d);
          float spikes = vB * (exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 5.5) + exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 5.5)) * 0.8;
          float a = vB > 0.5 ? core + spikes : core * core;
          gl_FragColor = vec4(vC * a, 1.0); }` }));
    stars.frustumCulled = false; grp.add(stars);
    // 3) Sol: disco, resplandor y corona de rayos (los tapa el relieve cuando queda bajo el horizonte)
    const spr = (map, s, d, add = true) => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, transparent: true })); o.scale.setScalar(s); o.position.copy(sd).multiplyScalar(RS * d); grp.add(o); return o; };
    spr(radialTex([[0, 'rgba(255,250,240,1)'], [0.05, 'rgba(255,244,225,.85)'], [0.2, 'rgba(255,225,190,.2)'], [1, 'rgba(255,210,170,0)']]), 17000, 0.95);
    spr(raysTex(), 26000, 0.955);
    spr(radialTex([[0, '#ffffff'], [0.45, '#fffaf0'], [0.5, 'rgba(255,250,240,0)']]), 820, 0.94, false);
    // 4) Tierra: día, luces de ciudades en el lado nocturno, reflejo del Sol en el océano, nubes y atmósfera
    const az = Math.atan2(sd.z, sd.x) + 1.9, el = 0.11, ed = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const ER = RS * 0.8 * Math.tan(0.95 * Math.PI / 180), ET = earthTextures();
    const earthMat = new THREE.ShaderMaterial({ uniforms: { day: { value: ET.day }, night: { value: ET.night }, sun: { value: sd } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vec4 dt = texture2D(day, vUv); vec3 n = normalize(vN); float ndl = dot(n, sun);
          float lit = smoothstep(-0.08, 0.25, ndl);
          vec3 c = pow(dt.rgb, vec3(2.2)) * (0.05 + 1.25 * max(ndl, 0.0));
          c *= mix(vec3(1.0, 0.55, 0.35), vec3(1.0), smoothstep(0.0, 0.3, ndl)) ;                       // terminador anaranjado
          float spec = pow(max(dot(reflect(-sun, n), normalize(vV)), 0.0), 60.0) * dt.a * lit;
          c += vec3(1.0, 0.95, 0.85) * spec * 1.2;
          c += pow(texture2D(night, vUv).rgb, vec3(2.2)) * (1.0 - lit) * 1.4;                              // ciudades
          gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }` });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 64, 40), earthMat);
    earth.position.copy(ed).multiplyScalar(RS * 0.8); earth.rotation.set(0.41, 1.2, 0.2); grp.add(earth);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.012, 64, 40), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { map: { value: ET.cloud }, sun: { value: sd } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; void main(){ float a = texture2D(map, vUv).a; float l = smoothstep(-0.1, 0.3, dot(normalize(vN), sun)); gl_FragColor = vec4(vec3(0.95) * (0.04 + l), a * (0.25 + 0.75 * l)); }' }));
    clouds.position.copy(earth.position); clouds.rotation.copy(earth.rotation); grp.add(clouds);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.05, 64, 40), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      uniforms: { sun: { value: sd }, c: { value: earth.position } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 sun; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float l = smoothstep(-0.35, 0.45, dot(vN, sun)); vec3 c = mix(vec3(1.0, 0.45, 0.25), vec3(0.35, 0.62, 1.0), smoothstep(-0.1, 0.4, dot(vN, sun))); gl_FragColor = vec4(c * f * l * 1.6, 1.0); }' }));
    atm.position.copy(earth.position); grp.add(atm);
    grp.traverse(o => { o.userData.skipSunVis = true; });
    scene.add(grp);
    // 5) Destellos de lente: fantasmas a lo largo de la línea Sol–centro de la imagen, solo si el Sol se ve
    const ghostTex = radialTex([[0, 'rgba(255,255,255,0.0)'], [0.55, 'rgba(255,255,255,0.12)'], [0.75, 'rgba(255,255,255,0.35)'], [0.85, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
    const ghostDef = [[-0.35, 0.05, 0x8fd0ff], [-0.7, 0.09, 0xffc890], [0.25, 0.03, 0xb8a8ff], [-1.15, 0.15, 0x9fffd8], [-1.5, 0.06, 0xffe0b0]];
    const ghosts = ghostDef.map(([f, s, c]) => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, color: c, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.0 })); o.userData = { f, s }; o.renderOrder = 20; o.frustumCulled = false; scene.add(o); return o; });
    const tmp = new THREE.Vector3(), shl = Math.hypot(sd.x, sd.z), tanE = sd.y / shl;
    let flare = 0, spin = 0;
    return { group: grp, earthDir: ed, update(camera, dt = 0.016) {
      grp.position.copy(camera.position);
      spin += dt * 0.004; earth.rotation.y = 1.2 + spin; clouds.rotation.y = 1.2 + spin * 1.6;
      // ¿se ve el Sol? (delante, en pantalla y por encima del relieve hacia el Sol)
      tmp.copy(camera.position).addScaledVector(sd, 1000).project(camera);
      let vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      if (vis) for (const t of [15, 40, 90, 200, 450, 1000, 2200]) { const x = camera.position.x + sd.x / shl * t, z = camera.position.z + sd.z / shl * t; if (W.hAt(x, z) > camera.position.y + tanE * t) { vis = false; break; } }
      flare += ((vis ? 1 : 0) - flare) * Math.min(1, dt * 6);
      const sx = tmp.x, sy = tmp.y, fov = Math.tan(camera.fov * Math.PI / 360) * 2 * 10;
      ghosts.forEach(o => { const p = new THREE.Vector3(sx * o.userData.f, sy * o.userData.f, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(10).add(camera.position);
        o.position.copy(p); o.scale.setScalar(o.userData.s * fov); o.material.opacity = 0.55 * flare; o.visible = flare > 0.02; });
    } };
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
  function updateSun(sun, W, focus, camDist, minHalf = 16) {
    const half = clamp(camDist * 1.1, minHalf, W.HALF * 1.6), D = half * 3 + 400, sd = W.sunDir;
    sun.position.set(focus.x + sd.x * D, focus.y + sd.y * D, focus.z + sd.z * D); sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    const c = sun.shadow.camera, vh = Math.max(half, 30);
    if (Math.abs(c.right - half) > half * 0.06 || c.far !== D * 2) {
      Object.assign(c, { left: -half, right: half, top: vh, bottom: -vh, near: 1, far: D * 2 }); c.updateProjectionMatrix();
      sun.shadow.normalBias = 0.03 + half * 0.002; sun.shadow.bias = -0.0004;   // Sol rasante (1,2°): más margen contra el autosombreado
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
    const baseY = new Float32Array(MAXQ * 6); let region = null, moved = [];
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
      [0, 1, 2, 0, 2, 3].forEach((i, k) => { const p = P[i], yb = y(p[0], p[1]); baseY[o + k] = yb; let yy = yb;
        if (region && Math.abs(p[0] - region.cx) < region.hp && Math.abs(p[1] - region.cz) < region.hp) { yy = region.fn(p[0], p[1]) + 0.035; moved.push(o + k); }
        pos.set([p[0], yy, p[1]], (o + k) * 3); uv.set([p[2], p[3]], (o + k) * 2); born[o + k] = now; });
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
    // Pegar las huellas al terreno de detalle (microcráteres) mientras está activo alrededor de la cámara
    function reproject(fn, cx, cz, hp) {
      moved.forEach(v => { pos[v * 3 + 1] = baseY[v]; }); moved = [];
      region = fn && hp > 0 ? { fn, cx, cz, hp } : null;
      if (region) for (let v = 0, n = filled * 6; v < n; v++) {
        const x = pos[v * 3], z = pos[v * 3 + 2];
        if (Math.abs(x - cx) < hp && Math.abs(z - cz) < hp) { pos[v * 3 + 1] = fn(x, z) + 0.035; moved.push(v); }
      }
      pa.updateRange.offset = 0; pa.updateRange.count = filled * 18; pa.needsUpdate = true;
    }
    return { update, clear, reproject, mesh, setLife(s) { mat.uniforms.vida.value = s; } };
  }

  // ---------- acabado de cámara (último pase del postprocesado) ----------
  // Aberración cromática suave, gradación (sombras hacia azul frío), viñeta, visor de la cámara del rover,
  // conversión lineal → sRGB y grano fino. El brillo (bloom) va en el pase anterior.
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, roverCam: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float roverCam; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5; float r2 = dot(c, c);
        float ab = (0.004 + 0.006 * roverCam) * r2;
        vec3 col = vec3(texture2D(tDiffuse, vUv + c * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ab).b);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col += vec3(0.012, 0.006, -0.008) * smoothstep(0.5, 1.0, l);                 // luces apenas cálidas
        col = mix(vec3(l), col, 1.06);
        col = max(col - 0.004, 0.0) * 1.004;                                          // negros profundos
        col *= 1.0 - (0.32 + 0.28 * roverCam) * smoothstep(0.12, 0.7, r2 * 1.6);     // viñeta
        if (roverCam > 0.5) {                                                         // visor de la cámara del mástil
          col *= 0.985 + 0.015 * sin(vUv.y * res.y * 1.0 + time * 4.0);
          col = mix(col, col * vec3(0.95, 0.99, 1.04), 0.4);
        }
        col = max(col, vec3(0.0));
        vec3 s = mix(pow(col, vec3(0.41666)) * 1.055 - 0.055, col * 12.92, vec3(lessThanEqual(col, vec3(0.0031308))));
        s += (h(vUv * res + fract(time) * 91.7) - 0.5) * (0.016 + 0.02 * roverCam);   // grano
        gl_FragColor = vec4(s, 1.0);
      }`
  };

  // ---------- terreno de detalle que sigue a la cámara ----------
  // Alrededor de donde se mira se genera una malla de 120 × 120 m con celdas de 0,5 m: la base es el relieve real (misma
  // altura que la malla del DEM, así no hay costura) y encima microcráteres y ondulaciones en 3D que proyectan sombras.
  // El terreno base se oculta en ese cuadrado. Se regenera al avanzar la cámara (como el "streaming" de un videojuego).
  // Los microcráteres son ilustrativos: el DEM real tiene 10 m de resolución.
  const DETAIL = { c: new THREE.Vector2(1e9, 1e9), h: { value: 0 }, oU: { value: new THREE.Vector2() } };
  function detailTerrain(W, baseGeo, SV, scene) {
    const SZ = 120, SEG = 240, HP = SZ / 2, N = W.N, H = W.H, STP = W.STEP, HF = W.HALF, BC = baseGeo.attributes.color.array;
    const tri = (arr, stride, ch, x, z) => {                                         // interpolación igual que la malla base
      const fx = clamp((x + HF) / STP, 0, N - 1.001), fz = clamp((z + HF) / STP, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const A = arr[(j * N + i) * stride + ch], D = arr[(j * N + i + 1) * stride + ch], B = arr[((j + 1) * N + i) * stride + ch], C = arr[((j + 1) * N + i + 1) * stride + ch];
      return u + v <= 1 ? A + (D - A) * u + (B - A) * v : C + (B - C) * (1 - u) + (D - C) * (1 - v);
    };
    const micro = (x, z) => {                                                         // microcráteres por celdas de 4 m
      let h = -Math.abs(fbm(x / 6 + 30, z / 6 + 30, 3, 51) - 0.5) * 0.09 - Math.abs(vnoise(x * 0.9, z * 0.9, 52) - 0.5) * 0.02, dark = 0;
      const ci = Math.floor(x / 4), cj = Math.floor(z / 4);
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const I = ci + a, J = cj + b; if (hash(I, J, 3, 7) > 0.22) continue;
        const cx = (I + hash(I, J, 1, 7)) * 4, cz = (J + hash(I, J, 2, 7)) * 4, rad = 0.35 + 1.5 * Math.pow(hash(I, J, 4, 7), 2.2);
        const rho = Math.hypot(x - cx, z - cz) / rad; if (rho > 1.6) continue;
        const dep = 0.2 * rad * (0.5 + 0.5 * hash(I, J, 5, 7));
        h += rho < 1 ? dep * (rho * rho - 1) : 0.05 * rad * Math.exp(-(((rho - 1) / 0.25) ** 2)) - 0.0;
        if (rho < 1) dark = Math.max(dark, 0.12 * (1 - rho * rho));
      }
      return [Math.min(h, 0.012), dark];
    };
    const g = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, nV = pos.count, local = Float32Array.from(pos.array);
    const col = new Float32Array(nV * 3), uv = g.attributes.uv; g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, terrainMaterial(W, SV, false)); mesh.receiveShadow = true; mesh.castShadow = false; mesh.visible = false; mesh.userData.skipSunVis = true;
    mesh.frustumCulled = false; scene.add(mesh);
    let cur = null, lastRegen = 0;
    function regen(cx, cz) {
      for (let k = 0; k < nV; k++) {
        const x = cx + local[k * 3], z = cz + local[k * 3 + 2], e = Math.max(Math.abs(local[k * 3]), Math.abs(local[k * 3 + 2]));
        const fade = sm(clamp((HP - e) / 14, 0, 1)), [m, dark] = micro(x, z);
        pos.setXYZ(k, x, tri(H, 1, 0, x, z) + m * fade, z);
        const dk = 1 - dark * fade;
        col[k * 3] = tri(BC, 3, 0, x, z) * dk; col[k * 3 + 1] = tri(BC, 3, 1, x, z) * dk; col[k * 3 + 2] = tri(BC, 3, 2, x, z) * dk;
        uv.setXY(k, (x + HF) / W.SIZE, (HF - z) / W.SIZE);
      }
      pos.needsUpdate = true; uv.needsUpdate = true; g.attributes.color.needsUpdate = true; g.computeVertexNormals();
      fn.cx = cx; fn.cz = cz; if (fn.onRegen) fn.onRegen(cx, cz, HP);
    }
    const fn = function update(target, camDist) {
      if (camDist > 170 || Math.abs(target.x) > HF - HP - 5 || Math.abs(target.z) > HF - HP - 5) { if (cur && fn.onRegen) fn.onRegen(0, 0, 0); mesh.visible = false; DETAIL.h.value = 0; cur = null; return; }
      const cx = Math.round(target.x / 10) * 10, cz = Math.round(target.z / 10) * 10, key = cx + ',' + cz, now = performance.now();
      if (key !== cur && now - lastRegen > 120) { regen(cx, cz); cur = key; lastRegen = now; DETAIL.c.set(cx, cz); }
      if (cur) { mesh.visible = true; DETAIL.h.value = HP - 0.02; }
    };
    fn.heightAt = (x, z) => tri(H, 1, 0, x, z) + (mesh.visible ? micro(x, z)[0] : 0);
    fn.heightFaded = (x, z) => { const e = Math.max(Math.abs(x - fn.cx), Math.abs(z - fn.cz)); return tri(H, 1, 0, x, z) + micro(x, z)[0] * sm(clamp((HP - e) / 14, 0, 1)); };
    return fn;
  }

  // ---------- granos y guijarros milimétricos alrededor del punto que se mira (para el zoom) ----------
  function nearGrains(W, scene, heightAt) {
    const CELL = 0.6, RAD = 4, PER = 70, cap = (2 * RAD + 1) ** 2 * PER;
    const mesh = new THREE.InstancedMesh(rockGeometry(9, 2), new THREE.MeshStandardMaterial({ color: 0x2c2c2f, roughness: 1, metalness: 0, envMapIntensity: 0.1 }), cap);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);   // demasiado pequeños para el mapa de sombras
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let cur = null;
    return function update(cx, cz, show) {
      mesh.visible = show; if (!show) return;
      const ci = Math.floor(cx / CELL), cj = Math.floor(cz / CELL), key = ci + ',' + cj; if (key === cur) return; cur = key;
      let n = 0;
      for (let dj = -RAD; dj <= RAD; dj++) for (let di = -RAD; di <= RAD; di++) {
        const I = ci + di, J = cj + dj, r = rng((Math.imul(I, 2654435761) ^ Math.imul(J, 40503)) >>> 0);
        for (let k = 0; k < PER; k++) {
          const x = (I + r()) * CELL, z = (J + r()) * CELL, sz = 0.002 + 0.03 * Math.pow(r(), 3.5), a1 = r(), a2 = r(), a3 = r(), sx = 0.7 + 0.6 * r(), sy = 0.45 + 0.4 * r();
          e.set(a1 * 6.3, a2 * 6.3, a3 * 6.3); q.setFromEuler(e); sc.set(sz * sx, sz * sy, sz);
          p.set(x, heightAt(x, z) + sz * 0.25, z); m4.compose(p, q, sc); mesh.setMatrixAt(n++, m4);
        }
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    };
  }

  // ---------- polvo que levantan las ruedas ----------
  // Sin aire, el regolito no forma nubes: cada grano sigue una parábola limpia con la gravedad lunar (1,62 m/s²) y cae.
  function wheelDust(W, scene) {
    const N = 500, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, N);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a9890, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -1e5;
    let head = 0, acc = 0;
    return function update(R, dt, moving) {
      if (moving) acc += dt * 160;
      while (acc >= 1) {
        acc--; const i = head; head = (head + 1) % N;
        const side = Math.random() < 0.5 ? -1 : 1, back = -0.95 + (Math.random() - 0.5) * 1.9 * 0.9;
        const ch = Math.cos(R.heading), shh = Math.sin(R.heading);
        const x = R.x + ch * back - shh * side * 1.0, z = R.z + shh * back + ch * side * 1.0;
        pos[i * 3] = x; pos[i * 3 + 1] = W.hAt(x, z) + 0.05; pos[i * 3 + 2] = z;
        const sp = 0.4 + Math.random() * 0.9, up = 0.4 + Math.random() * 1.1;
        vel[i * 3] = -ch * sp + (Math.random() - 0.5) * 0.5; vel[i * 3 + 1] = up; vel[i * 3 + 2] = -shh * sp + (Math.random() - 0.5) * 0.5;
        life[i] = 1;
      }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        vel[i * 3 + 1] -= 1.62 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < W.hAt(pos[i * 3], pos[i * 3 + 2])) { life[i] = 0; pos[i * 3 + 1] = -1e5; }
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  window.IceEnv = { DETAIL, nearGrains, wheelDust, GradeShader, detailTerrain, iceLayer, crystalGeometry, sunVisTexture, patchMaterial, patchTree, terrainMaterial, albedoAt, buildFar, rockGeometry, rockMaterial, nearRocks, buildSky, envMap, updateSun, wheelTracks, SHACK };
})();
