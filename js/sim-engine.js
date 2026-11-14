/* =========================================================================
   ICEWISE — Motor de simulación (sin gráficos; se puede ejecutar en Node)
   -------------------------------------------------------------------------
   Mundo:    topografía REAL del borde del cráter Shackleton (LOLA, NASA) si está
             cargado js/dem-shackleton.js; si no, un terreno procedural de respaldo.
             Sombra permanente calculada a partir del relieve; hielo oculto (simulado).
   Colonia:  recibe por tubería el agua purificada y la consume.
   Rover:    autonomía real (explorar → detectar → caracterizar → decidir →
             perforar → regresar), batería, térmica, pendiente, sensores con ruido.
   Planta:   horno con balance de energía (cp del regolito, sublimación),
             trampa fría, purificación y tanque.
   Biología: cámara sellada con crecimiento/muerte según temperatura, agua,
             nutrientes y radiación. Los organismos NO producen agua.
   Todo es SIMULADO; los parámetros físicos vienen de model.js.
   ========================================================================= */
(function (root) {
  'use strict';
  const M = root.IceModel;
  const SIZE = 600, HALF = 300, N = 151, STEP = SIZE / (N - 1);   // malla de alturas: 4 m
  const KG = 75, KCELL = SIZE / KG;                                 // rejilla de conocimiento: 8 m
  const SUN_ELEV = 4 * Math.PI / 180;

  // ---------- utilidades ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise2(seed) {
    const r = rng(seed), P = 256, tb = new Float32Array(P * P); for (let i = 0; i < tb.length; i++) tb[i] = r();
    const at = (x, y) => tb[((y & 255) << 8) + (x & 255)], sm = t => t * t * (3 - 2 * t);
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = sm(xf), v = sm(yf);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // =====================================================================
  // MUNDO
  // =====================================================================
  function createWorld(seed = 11) {
    const r = rng(seed), n1 = noise2(seed + 1), n2 = noise2(seed + 2), n3 = noise2(seed + 3);
    const station = { x: -195, z: -212 };
    const psrMain = { x: 40, z: 70, r: 125, depth: 30 };
    const craters = [psrMain, { x: -125, z: 165, r: 58, depth: 13 }, { x: 205, z: -95, r: 46, depth: 10 }];
    for (let i = 0; i < 46; i++) {
      const rr = 4 + Math.pow(r(), 2.2) * 26, x = (r() - 0.5) * SIZE, z = (r() - 0.5) * SIZE;
      if (Math.hypot(x - station.x, z - station.z) < 40) continue;
      craters.push({ x, z, r: rr, depth: rr * 2 * (0.12 + r() * 0.06) });
    }
    const heightFn = (x, z) => {
      let h = 0, amp = 6, f = 1 / 160;
      for (let o = 0; o < 5; o++) { h += (n1(x * f + 50, z * f + 50) - 0.5) * amp; amp *= 0.5; f *= 2.1; }
      h += 22 * Math.exp(-Math.pow((z + 230 + 18 * Math.sin(x / 90)) / 75, 2));   // cresta iluminada al norte
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d > 1.8) continue;
        h += c.depth * 0.2 * Math.exp(-Math.pow((d - 1) / 0.25, 2));
        if (d < 1) h -= c.depth * (1 - d * d);
      }
      return h;
    };
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = heightFn(-HALF + i * STEP, -HALF + j * STEP);
    const hAt = (x, z) => {
      const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
      return H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + N] * (1 - u) * v + H[k + N + 1] * u * v;
    };
    // Dirección actual del Sol (hacia el Sol): noroeste, 4° de elevación
    const az0 = Math.atan2(-0.8, -0.6);
    const sunAt = (az) => ({ x: Math.cos(SUN_ELEV) * Math.cos(az), y: Math.sin(SUN_ELEV), z: Math.cos(SUN_ELEV) * Math.sin(az) });
    const sunDir = sunAt(az0);
    function shadowGrid(sd) {
      const g = new Uint8Array(N * N), dx = sd.x / Math.hypot(sd.x, sd.z), dz = sd.z / Math.hypot(sd.x, sd.z), tanE = Math.tan(SUN_ELEV);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x0 = -HALF + i * STEP, z0 = -HALF + j * STEP, h0 = H[j * N + i] + 0.5;
        for (let s = STEP; s < 700; s += STEP) {
          const x = x0 + dx * s, z = z0 + dz * s; if (x < -HALF || x > HALF || z < -HALF || z > HALF) break;
          if (hAt(x, z) > h0 + s * tanE) { g[j * N + i] = 1; break; }
        }
      }
      return g;
    }
    const shadowNow = shadowGrid(sunDir);
    // Sombra permanente: en sombra para el Sol en 8 acimuts a lo largo del día lunar
    const psr = new Uint8Array(N * N).fill(1);
    for (let a = 0; a < 8; a++) { const g = shadowGrid(sunAt(az0 + a * Math.PI / 4)); for (let k = 0; k < g.length; k++) psr[k] &= g[k]; }
    const gridAt = (g, x, z) => { const i = clamp(Math.round((x + HALF) / STEP), 0, N - 1), j = clamp(Math.round((z + HALF) / STEP), 0, N - 1); return g[j * N + i]; };
    const fracAt = (g, x, z) => { let s = 0; for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) s += gridAt(g, x + ox, z + oz); return s / 5; };

    // Hielo verdadero (oculto al rover): solo en sombra permanente, en manchas
    const iceWt = (x, z) => {
      const p = fracAt(psr, x, z); if (p <= 0) return 0;
      const patch = clamp(n2(x / 45 + 7, z / 45 + 3) * 1.25 - 0.15, 0, 1);
      return p * (0.4 + 10.5 * patch * patch);
    };
    const dryLayer = (x, z) => 0.04 + 0.38 * n3(x / 60, z / 60);
    const envT = (x, z) => fracAt(psr, x, z) > 0.6 ? 40 + 15 * (1 - fracAt(psr, x, z)) : fracAt(shadowNow, x, z) > 0.5 ? 95 : 235;
    const slopeAt = (x, z) => { const g = Math.hypot(hAt(x + 2, z) - hAt(x - 2, z), hAt(x, z + 2) - hAt(x, z - 2)) / 4; return Math.atan(g) * 180 / Math.PI; };

    // Mapa orbital previo: hielo suavizado a escala de ~60 m más ruido (como un mapa de neutrones orbital)
    const prior = new Float32Array(KG * KG);
    for (let j = 0; j < KG; j++) for (let i = 0; i < KG; i++) {
      const x = -HALF + (i + 0.5) * KCELL, z = -HALF + (j + 0.5) * KCELL; let s = 0, c = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { s += iceWt(x + a * 16, z + b * 16); c++; }
      prior[j * KG + i] = Math.max(0, s / c + gauss(r) * 0.5);
    }
    return { SIZE, HALF, N, STEP, KG, KCELL, H, hAt, sunDir, shadowNow, psr, gridAt, fracAt, iceWt, dryLayer, envT, slopeAt, prior, station, psrMain, craters,
      colony: { x: station.x + 60, z: station.z - 30 }, real: false };
  }

  // ---------- Mundo con topografía real (LOLA) ----------
  function b64(str) {
    if (typeof atob === 'function') { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  function createWorldFromDEM(D, seed = 11) {
    const r = rng(seed), n2 = noise2(seed + 2), n3 = noise2(seed + 3);
    const N = D.N, STEP = D.STEP, SIZE = D.SIZE, HALF = SIZE / 2, KG = 160, KCELL = SIZE / KG;
    const raw = b64(D.H), h16 = new Int16Array(raw.buffer, raw.byteOffset, N * N);
    const H = new Float32Array(N * N); for (let k = 0; k < N * N; k++) H[k] = h16[k] / 10;
    const psr = b64(D.psr), shadowNow = b64(D.shadow), lit = b64(D.lit);
    const hAt = (x, z) => {
      const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
      return H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + N] * (1 - u) * v + H[k + N + 1] * u * v;
    };
    const gridAt = (g, x, z) => { const i = clamp(Math.round((x + HALF) / STEP), 0, N - 1), j = clamp(Math.round((z + HALF) / STEP), 0, N - 1); return g[j * N + i]; };
    const fracAt = (g, x, z) => { let s = 0; for (const [ox, oz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) s += gridAt(g, x + ox, z + oz); return s / 5; };
    const iceWt = (x, z) => {
      const p = fracAt(psr, x, z); if (p <= 0) return 0;
      const patch = clamp(n2(x / 70 + 7, z / 70 + 3) * 1.25 - 0.12, 0, 1);
      return p * (0.5 + 10 * patch * patch);
    };
    const dryLayer = (x, z) => 0.04 + 0.38 * n3(x / 90, z / 90);
    const envT = (x, z) => { const p = fracAt(psr, x, z); return p > 0.6 ? 40 + 15 * (1 - p) : fracAt(shadowNow, x, z) > 0.5 ? 95 : 220; };
    const slopeAt = (x, z) => { const g = Math.hypot(hAt(x + 5, z) - hAt(x - 5, z), hAt(x, z + 5) - hAt(x, z - 5)) / 10; return Math.atan(g) * 180 / Math.PI; };
    const prior = new Float32Array(KG * KG);
    for (let j = 0; j < KG; j++) for (let i = 0; i < KG; i++) {
      const x = -HALF + (i + 0.5) * KCELL, z = -HALF + (j + 0.5) * KCELL; let s = 0, c = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { s += iceWt(x + a * 25, z + b * 25); c++; }
      prior[j * KG + i] = Math.max(0, s / c + gauss(r) * 0.5);
    }
    const sunDir = D.sun;
    return { SIZE, HALF, N, STEP, KG, KCELL, H, hAt, sunDir, shadowNow, psr, lit, gridAt, fracAt, iceWt, dryLayer, envT, slopeAt, prior,
      station: D.station, colony: D.colony, psrMain: { ...D.psrLabel, r: 150 }, shackleton: D.shackleton, craters: [], real: true, meta: D };
  }

  // =====================================================================
  // PARÁMETROS (controlables desde la interfaz)
  // =====================================================================
  const DEFAULT_P = {
    // Rover
    vmax: 0.2, iceThreshold: 3.0, drillDepth: 1.0, cargoCap: 40, reserve: 30, drillPower: 150, autoLoop: true,
    // Planta
    heaterW: 600, etaH: 0.5, etaCap: 0.85, solarW: 2000,
    // Biología
    chamber: 'inside', Tc: 22, feed: 1.0, dose: 0.00001, nutrients: 1.0, light: true, bioPurif: true
  };
  // Colonia (SUPUESTOS): 4 personas, ~2,5 kg de agua/persona/día y 90 % de reciclaje → ~1 kg/día de agua nueva
  const COLONY = { crew: 4, demandKgDay: 4 * 2.5 * 0.1, pumpKgH: 2 };
  const RAW = { N: 40, S: 35, Hg: 25 };   // índice ilustrativo de contaminantes del condensado
  const ADS_STOCK = 3, ADS_PER_KG = 0.25;   // kg de adsorbente en la estación; kg por kg de agua con carga 100 (supuestos)
  const ROVER = { cap: 5000, panelW: 300, base: 55, Ccap: 25000, G: 0.22, setT: 263, heaterMax: 160, area: Math.PI * 0.05 * 0.05, chargeW: 450 };

  // =====================================================================
  // ESPECIES (parámetros aproximados para demostración)
  // =====================================================================
  const SPECIES = [
    { id: 'dper', name: 'D. peraridilitoris', kind: 'bacteria', Tmin: 10, Topt: 30, Tmax: 40, mu: 0.25, D10: 6000, kdry: 0.0005, kfreeze: 0.0005, kd0: 0.002, K: 1e9, N0: 1e5, unit: 'cél/mL' },
    { id: 'pext', name: 'P. extremorientalis', kind: 'bacteria', Tmin: 4, Topt: 28, Tmax: 37, mu: 0.5, D10: 150, kdry: 0.05, kfreeze: 0.01, kd0: 0.003, K: 1e9, N0: 1e5, unit: 'cél/mL' },
    { id: 'plac', name: 'Placopsis (liquen)', kind: 'lichen', Tmin: -10, Topt: 12, Tmax: 25, mu: 0.00015, D10: 1500, kdry: 0.00002, kfreeze: 0.00001, kd0: 0.00001, K: 100, N0: 5, unit: '% cobertura', needsLight: true }
  ];
  function ctmi(T, s) { // Modelo de temperaturas cardinales (Rosso et al.)
    if (T <= s.Tmin || T >= s.Tmax) return 0;
    const a = (T - s.Tmax) * (T - s.Tmin) ** 2, b = (s.Topt - s.Tmin) * ((s.Topt - s.Tmin) * (T - s.Topt) - (s.Topt - s.Tmax) * (s.Topt + s.Tmin - 2 * T));
    return clamp(a / b, 0, 1);
  }

  // =====================================================================
  // SIMULACIÓN
  // =====================================================================
  function createSim(opts = {}) {
    const world = opts.world || (root.IceDEM && opts.dem !== false ? createWorldFromDEM(root.IceDEM, opts.seed || 11) : createWorld(opts.seed || 11));
    const KG = world.KG, KCELL = world.KCELL;
    const P = { ...DEFAULT_P, ...(opts.P || {}) };
    const r = rng(opts.seed || 2026);
    const st = world.station;
    const S = {
      t: 0, running: false, world, P,
      rover: null, plant: null, bio: null,
      know: { sum: new Float32Array(KG * KG), n: new Uint16Array(KG * KG), rejected: new Uint8Array(KG * KG), drilled: new Uint8Array(KG * KG) },
      holes: [], trail: [], log: [], hist: { t: [], bat: [], T: [], tank: [], bio: SPECIES.map(() => []) },
      manual: { throttle: 0, steer: 0 }, totals: { ice: 0, reg: 0, water: 0, kWhPlant: 0, dist: 0, holes: 0, rejected: 0 }
    };

    function resetRover() {
      S.rover = { x: st.x + 10, z: st.z + 8, heading: 0.9, speed: 0, mode: 'auto', task: 'idle', battery: ROVER.cap, sysT: 288, heater: 0, power: 0, solar: 0,
        odo: 0, cargoReg: 0, cargoIce: 0, Tenv: world.envT(st.x + 10, st.z + 8), wp: null, cand: null, timer: 0, drillDepth: 0, drilling: false, lastSense: 0, charT: 0, wheel: 0, lastWpPick: 0, stuckT: 0 };
    }
    function resetPlant() { S.plant = { reg: 0, ice: 0, T: 50, state: 'vacío', released: 0, captured: 0, tank: 0, queue: [], heater: 0, avail: P.solarW, energyJ: 0, frost: 0, adsorbent: ADS_STOCK, adsUsed: 0, adsSaved: 0, quality: null, lastResidual: 0, rejected: 0, flowT: -1e9 }; }
    function resetColony() { S.colony = { water: 0, received: 0, crew: COLONY.crew, flowT: -1e9 }; }
    function resetBio() { S.bio = { T: 20, V: 50, S: 1, N: SPECIES.map(s => s.N0), status: SPECIES.map(() => '—'), power: 0, spe: 0 }; }
    resetRover(); resetPlant(); resetBio(); resetColony();

    const log = (msg, kind = '') => { S.log.push({ t: S.t, msg, kind }); if (S.log.length > 200) S.log.shift(); };
    const ki = (x, z) => clamp(Math.floor((x + world.HALF) / KCELL), 0, KG - 1) + clamp(Math.floor((z + world.HALF) / KCELL), 0, KG - 1) * KG;
    const cellCenter = k => ({ x: -world.HALF + (k % KG + 0.5) * KCELL, z: -world.HALF + (Math.floor(k / KG) + 0.5) * KCELL });
    const est = k => S.know.n[k] ? S.know.sum[k] / S.know.n[k] : null;
    const distSt = () => Math.hypot(S.rover.x - st.x, S.rover.z - st.z);
    const returnWh = (d) => d / P.vmax / 3600 * (ROVER.base + 160 + 40) * 1.4;

    // ---------- Sensor de neutrones ----------
    function sense(sigma) {
      const R = S.rover; let s = 0;
      for (const [ox, oz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) {
        const x = R.x + ox, z = R.z + oz;
        s += world.iceWt(x, z) * Math.exp(-world.dryLayer(x, z) / 0.6);   // la capa seca atenúa la señal
      }
      const reading = Math.max(0, s / 5 + gauss(r) * sigma);
      const k = ki(R.x, R.z); S.know.sum[k] += reading; S.know.n[k] = Math.min(65000, S.know.n[k] + 1);
      R.lastReading = reading;
      return reading;
    }

    // ---------- Selección de destino de exploración ----------
    function pickWaypoint() {
      const R = S.rover; let best = null, bs = -1e9;
      for (let s = 0; s < 1500; s++) {
        const k = Math.floor(r() * KG * KG); if (S.know.n[k] > 0 || S.know.rejected[k]) continue;
        const c = cellCenter(k); if (Math.abs(c.x) > world.HALF * 0.92 || Math.abs(c.z) > world.HALF * 0.92) continue;
        if (world.slopeAt(c.x, c.z) > 18) continue;
        const d = Math.hypot(c.x - R.x, c.z - R.z);
        const score = world.prior[k] * 1.6 - d * 0.012 * 600 / world.SIZE + r() * 0.4;
        if (score > bs) { bs = score; best = c; }
      }
      return best;
    }
    function findCandidate() {
      let best = null, bv = -1;
      for (let k = 0; k < KG * KG; k++) {
        if (S.know.n[k] < 4 || S.know.rejected[k] || S.know.drilled[k] >= 3) continue;
        const v = S.know.sum[k] / S.know.n[k];
        if (v >= P.iceThreshold * 0.8 && v > bv) { bv = v; best = k; }
      }
      return best;
    }

    // ---------- Movimiento ----------
    function driveToward(tx, tz, dt) {
      const R = S.rover; const dx = tx - R.x, dz = tz - R.z, d = Math.hypot(dx, dz);
      if (d < 2) { R.speed = 0; return true; }
      const want = Math.atan2(dz, dx); let da = want - R.heading; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      R.heading += clamp(da, -0.12 * dt, 0.12 * dt);
      const ax = R.x + Math.cos(R.heading) * 3, az = R.z + Math.sin(R.heading) * 3;
      const grade = (world.hAt(ax, az) - world.hAt(R.x, R.z)) / 3;           // subida en la dirección de avance
      const target = Math.abs(da) > 0.6 ? 0.03 : P.vmax * (grade > 0.27 ? 0.5 : 1);
      if (grade > 0.45) { R.speed = 0; R.stuckT += dt; R.heading += 0.3 * dt; return 'blocked'; }   // > 24° cuesta arriba: girar
      R.speed += clamp(target - R.speed, -0.05 * dt, 0.05 * dt);
      move(dt);
      return false;
    }
    function move(dt) {
      const R = S.rover; const ds = R.speed * dt;
      const nx = clamp(R.x + Math.cos(R.heading) * ds, -world.HALF + 5, world.HALF - 5), nz = clamp(R.z + Math.sin(R.heading) * ds, -world.HALF + 5, world.HALF - 5);
      R.climb = (world.hAt(nx, nz) - world.hAt(R.x, R.z)) / Math.max(ds, 1e-6);
      R.x = nx; R.z = nz; R.odo += Math.abs(ds); R.wheel += ds / 0.35; S.totals.dist += Math.abs(ds);
      const tr = S.trail, last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - R.x, last[1] - R.z) > 2) { tr.push([R.x, R.z]); if (tr.length > 4000) tr.shift(); }
    }

    // ---------- Paso del rover ----------
    function stepRover(dt) {
      const R = S.rover;
      if (R.task === 'dead') { R.speed = 0; R.power = 0; return; }
      let drive = 0, drillW = 0, instr = 25;
      const atStation = distSt() < 16;

      if (R.mode === 'manual') {
        const m = S.manual;
        if (R.task === 'drill') { /* sigue perforando */ }
        else {
          R.task = m.throttle || m.steer ? 'manual' : (atStation ? 'idle' : 'manual');
          R.heading += m.steer * 0.25 * dt;
          const sg = Math.sign(m.throttle || 1);
          const grade = (world.hAt(R.x + Math.cos(R.heading) * 3 * sg, R.z + Math.sin(R.heading) * 3 * sg) - world.hAt(R.x, R.z)) / 3;
          const target = grade > 0.45 ? 0 : m.throttle * P.vmax;
          R.speed += clamp(target - R.speed, -0.06 * dt, 0.06 * dt);
          move(dt);
          if (S.t - R.lastSense > 2) { R.lastSense = S.t; sense(1.2); }
          if (atStation && (R.cargoReg > 0) && Math.abs(R.speed) < 0.01) unload();
        }
      }

      switch (R.task) {
        case 'idle':
          R.speed = 0;
          if (R.mode === 'auto' && S.running && R.battery >= ROVER.cap * 0.95) {
            R.task = 'explore'; R.wp = null; log('Batería cargada: inicio de exploración.', 'key');
          }
          break;
        case 'explore': {
          if (!R.wp || S.t - R.lastWpPick > 1800) { R.wp = pickWaypoint(); R.lastWpPick = S.t; if (!R.wp) { log('Zona explorada por completo. Regreso a la estación.'); R.task = 'return'; break; } }
          const res = driveToward(R.wp.x, R.wp.z, dt);
          if (res === true) R.wp = null;
          if (res === 'blocked' && R.stuckT > 60) { if (S.t - (R.lastBlockLog || -1e9) > 1800) { log('Pendiente excesiva (> 24°): cambio de ruta.', 'warn'); R.lastBlockLog = S.t; } R.wp = null; R.stuckT = 0; }
          if (S.t - R.lastSense > 2) {
            R.lastSense = S.t; sense(1.2);
            const c = findCandidate();
            if (c !== null) { R.cand = c; R.task = 'goto'; const e = est(c); log(`Señal de hidrógeno: celda con ${e.toFixed(1)} % estimado. Me acerco para caracterizar.`, 'key'); }
          }
          break;
        }
        case 'goto': {
          const c = R.target || cellCenter(R.cand);
          const res = driveToward(c.x, c.z, dt);
          if (res === 'blocked' && R.stuckT > 90) { log('No puedo llegar: la pendiente supera 24°. Sigo explorando.', 'warn'); R.target = null; R.stuckT = 0; R.task = R.mode === 'auto' ? 'explore' : 'manual'; R.wp = null; break; }
          if (res === true) { R.task = 'characterize'; R.charT = 0; R.speed = 0; R.target = null; R.cand = ki(R.x, R.z); log('Caracterización: integración de neutrones durante 20 min.'); }
          if (S.t - R.lastSense > 2) { R.lastSense = S.t; sense(1.2); }
          break;
        }
        case 'characterize':
          R.speed = 0; R.charT += dt; instr = 60;
          if (S.t - R.lastSense > 6) { R.lastSense = S.t; sense(0.35); }
          if (R.charT > 1200) R.task = 'decide';
          break;
        case 'decide': {
          const e = est(R.cand), slope = world.slopeAt(R.x, R.z);
          const needWh = P.drillPower * (P.drillDepth / drillRate(5)) * 2 + returnWh(distSt());
          const okIce = e >= P.iceThreshold, okSlope = slope <= 15, okBat = R.battery - needWh >= ROVER.cap * P.reserve / 100;
          if (okIce && okSlope && okBat) { R.task = 'drill'; R.drillDepth = 0; log(`GO: ${e.toFixed(1)} % ≥ ${P.iceThreshold} %, pendiente ${slope.toFixed(0)}°, batería suficiente. Perforando.`, 'key'); }
          else {
            const why = [!okIce && `concentración ${e.toFixed(1)} % < ${P.iceThreshold} %`, !okSlope && `pendiente ${slope.toFixed(0)}°`, !okBat && 'batería insuficiente'].filter(Boolean).join(', ');
            log(`NO-GO: ${why}.`, 'warn');
            if (!okBat) { R.task = 'return'; } else { S.know.rejected[R.cand] = 1; R.task = 'explore'; R.wp = null; }
          }
          break;
        }
        case 'drill': {
          R.speed = 0; drillW = P.drillPower;
          const w = world.iceWt(R.x, R.z), dry = world.dryLayer(R.x, R.z);
          const rate = drillRate(R.drillDepth > dry ? w : 0) / 3600;            // m/s
          R.drillDepth = Math.min(P.drillDepth, R.drillDepth + rate * dt);
          if (R.drillDepth >= P.drillDepth) {
            const dryMass = M.columnMass(0, P.drillDepth) * ROVER.area;
            const iceLayer = M.columnMass(Math.min(dry, P.drillDepth), P.drillDepth) * ROVER.area;
            const ice = iceLayer * (w / 100) / (1 - w / 100) * 0.97;
            R.cargoReg += dryMass; R.cargoIce += ice; S.totals.holes++;
            S.holes.push({ x: R.x, z: R.z, w });
            const e = est(R.cand) ?? 0;
            log(`Muestra ${S.totals.holes}: ${(dryMass + ice).toFixed(1)} kg, hielo medido ${w.toFixed(1)} % (estimado por neutrones ${e.toFixed(1)} %).`, w >= P.iceThreshold ? '' : 'warn');
            // Calibración: la medida directa corrige el mapa en esa celda
            const k = ki(R.x, R.z); S.know.sum[k] = w * 10; S.know.n[k] = 10; S.know.drilled[k]++;
            R.drillDepth = 0;
            const needBack = returnWh(distSt()) + ROVER.cap * P.reserve / 100;
            if (R.cargoReg + R.cargoIce >= P.cargoCap) { log('Bodega llena: regreso a la estación.'); R.task = 'return'; }
            else if (R.battery < needBack + P.drillPower * 2) { log('Batería en reserva: regreso.', 'warn'); R.task = 'return'; }
            else if (R.mode === 'manual') { R.task = 'manual'; }
            else if (w < P.iceThreshold * 0.5) { S.know.rejected[R.cand] = 1; R.task = 'explore'; R.wp = null; log('La perforación no confirma el hielo: celda descartada.', 'warn'); }
            else { R.task = 'reposition'; R.wp = { x: R.x + Math.cos(R.heading + 1.5) * 4, z: R.z + Math.sin(R.heading + 1.5) * 4 }; }
          }
          break;
        }
        case 'reposition':
          if (driveToward(R.wp.x, R.wp.z, dt) === true) R.task = 'drill';
          break;
        case 'return':
          if (driveToward(st.x + 10, st.z + 8, dt) === true || distSt() < 12) { R.speed = 0; unload(); R.task = 'idle'; }
          if (S.t - R.lastSense > 4) { R.lastSense = S.t; sense(1.2); }
          break;
      }

      // Seguridad energética durante la exploración
      if (R.mode === 'auto' && ['explore', 'goto', 'characterize'].includes(R.task)) {
        if (R.battery < returnWh(distSt()) + ROVER.cap * P.reserve / 100) { log(`Reserva de batería (${P.reserve} %): regreso a la estación.`, 'warn'); R.task = 'return'; }
      }

      // ---------- Energía y térmica ----------
      if (Math.abs(R.speed) > 0.001) drive = 60 + 420 * Math.abs(R.speed) * (1 + 4 * Math.max(0, R.climb || 0));
      const Tenv = world.envT(R.x, R.z);
      const G = R.sysT > 295 ? ROVER.G + 1.4 * Math.min(1, (R.sysT - 295) / 8) : ROVER.G;   // radiador con persianas
      const loss = G * (R.sysT - Tenv);
      const internal = (ROVER.base + instr + drive + drillW) * 0.55;
      const need = (R.sysT < ROVER.setT ? ROVER.heaterMax : clamp(loss - internal, 0, ROVER.heaterMax));
      R.heater = need;
      R.sysT += (internal + R.heater - loss) / ROVER.Ccap * dt;
      R.power = ROVER.base + instr + drive + drillW + R.heater;
      const lit = 1 - world.fracAt(world.shadowNow, R.x, R.z);
      R.solar = ROVER.panelW * lit;
      R.charge = atStation && Math.abs(R.speed) < 0.01 ? Math.min(ROVER.chargeW, S.plant ? S.plant.avail + ROVER.chargeW : ROVER.chargeW) : 0;
      R.battery = clamp(R.battery + (R.solar + R.charge - R.power) * dt / 3600, 0, ROVER.cap);
      R.Tenv = Tenv;
      if (R.battery <= 0 && R.task !== 'dead') { R.task = 'dead'; log('Batería agotada: el rover queda inmovilizado. Ajusta la reserva o el umbral y reinicia.', 'warn'); }
      if (R.sysT < 230 && !R.coldWarned) { R.coldWarned = true; log('Electrónica por debajo de 230 K: riesgo de daño térmico.', 'warn'); }
      if (R.sysT > 240) R.coldWarned = false;
    }
    function drillRate(w) { return 1.2 * (P.drillPower / 150) / (1 + w / 3); } // m/h — el hielo endurece el regolito

    function unload() {
      const R = S.rover;
      if (R.cargoReg <= 0) return;
      S.plant.queue.push({ reg: R.cargoReg, ice: R.cargoIce });
      S.totals.reg += R.cargoReg; S.totals.ice += R.cargoIce;
      log(`Descarga en la estación: ${R.cargoReg.toFixed(1)} kg de regolito con ${R.cargoIce.toFixed(2)} kg de hielo.`, 'key');
      R.cargoReg = 0; R.cargoIce = 0;
    }

    // ---------- Planta de procesamiento ----------
    function stepPlant(dt) {
      const Pl = S.plant, R = S.rover;
      const roverDraw = R.charge || 0, bioDraw = S.bio.power;
      Pl.avail = Math.max(0, P.solarW - roverDraw - bioDraw);
      if (Pl.state === 'vacío' && Pl.queue.length) {
        const b = Pl.queue.shift(); Pl.reg = b.reg; Pl.ice = b.ice; Pl.T = 55; Pl.released = 0; Pl.captured = 0; Pl.state = 'calentando'; Pl.batchIce = b.ice; Pl.batchE = 0;
        log(`Horno: lote de ${b.reg.toFixed(1)} kg en proceso.`);
      }
      if (Pl.state === 'vacío' || Pl.state === 'completado') { Pl.heater = 0; if (Pl.state === 'completado' && !Pl.queue.length) Pl.state = 'vacío'; else if (Pl.state === 'completado') Pl.state = 'vacío'; return; }
      Pl.heater = Math.min(P.heaterW, Pl.avail);
      const Q = Pl.heater * P.etaH * dt;
      Pl.energyJ += Pl.heater * dt; Pl.batchE += Pl.heater * dt;
      if (Pl.ice > 1e-6 && Pl.T >= 210) {
        Pl.state = 'sublimando';
        const dm = Math.min(Pl.ice, Q / M.C.L_sub);
        Pl.ice -= dm; Pl.released += dm; Pl.captured += dm * P.etaCap; Pl.frost += dm * P.etaCap;
      } else {
        const C = Pl.reg * M.regolithCp(Pl.T) + Pl.ice * (7.49 * Pl.T + 90);
        Pl.T += Q / Math.max(C, 1);
        if (Pl.ice <= 1e-6 && Pl.T >= 250) {
          log(`Trampa fría: se funde la escarcha (${Pl.captured.toFixed(2)} kg) y el agua pasa al biofiltro.`);
          purify(Pl.captured, Pl.batchE / 3.6e6); Pl.frost = 0;
          Pl.state = 'completado'; Pl.reg = 0;
        }
      }
      S.totals.kWhPlant = Pl.energyJ / 3.6e6;
    }

    // ---------- Purificación: biofiltro (microorganismos) + adsorbente + membrana/UV ----------
    // Índice ILUSTRATIVO de contaminantes del condensado (100 = agua recuperada sin tratar), repartido
    // entre los grupos que LCROSS detectó junto al agua: nitrogenados (NH₃), azufre/orgánicos (H₂S, SO₂, CH₃OH) y metales (Hg).
    function bioActivity(i) {
      const s = SPECIES[i], n = S.bio.N[i]; if (n <= 0) return 0;
      const pop = s.kind === 'lichen' ? 1 : clamp((Math.log10(n) - 3) / 5, 0, 1);
      const st = S.bio.status[i];
      const f = st === 'Creciendo' || st === 'Estable' || st === 'Estacionaria (saturada)' ? 1 : st.startsWith('Estacionaria') ? 0.75
        : st === 'Muriendo' ? 0.25 : st === 'Estrés por calor' ? 0.3 : st.startsWith('Latente') ? 0.15 : 0;
      return pop * f;
    }
    function purify(captured, kwh) {
      const Pl = S.plant, use = P.bioPurif;
      const aD = bioActivity(0), aP = bioActivity(1);
      const rN = use ? 0.9 * aP : 0, rS = use ? 0.8 * aP : 0, rHg = use ? 0.85 * aD : 0;
      const after = RAW.N * (1 - rN) + RAW.S * (1 - rS) + RAW.Hg * (1 - rHg);
      const water = captured * 0.92 * (use ? 0.97 : 1);                     // el biofiltro retiene ~3 % (biomasa)
      const need = water * ADS_PER_KG * after / 100;                         // kg de adsorbente necesarios
      const used = Math.min(need, Pl.adsorbent); Pl.adsorbent -= used; Pl.adsUsed += used;
      if (use) Pl.adsSaved += water * ADS_PER_KG * (1 - after / 100);
      const cov = need > 0 ? used / need : 1;
      const final = after * (1 - (0.96 * cov + 0.3 * (1 - cov)));            // membrana + UV retiran además los microbios
      const ok = final <= 5;
      if (use && P.chamber === 'inside') S.bio.S = Math.min(1, S.bio.S + 0.35);   // el amoníaco y el metanol del condensado alimentan a las bacterias
      Pl.quality = { after, final, rN, rS, rHg, ok, bio: use, aD, aP, water };
      Pl.lastResidual = final; Pl.flowT = S.t;
      if (ok) { Pl.tank += water; S.totals.water += water; }
      else { Pl.rejected += water; S.totals.rejected += water; }
      log(ok
        ? `Lote limpio: ${water.toFixed(2)} kg de agua apta para uso técnico (${(kwh / Math.max(water, 1e-6)).toFixed(1)} kWh/kg). Contaminantes 100 → ${after.toFixed(0)} (biofiltro) → ${final.toFixed(1)} (final).`
        : `Agua contaminada (${final.toFixed(1)} > 5): ${Pl.adsorbent <= 0 ? 'no queda adsorbente' : 'el biofiltro no limpió lo suficiente'}. ${water.toFixed(2)} kg apartados para reprocesar.`, ok ? 'key' : 'warn');
      if (!ok && Pl.adsorbent <= 0 && !Pl.adsWarned) { Pl.adsWarned = true; log('Sin adsorbente: solo el biofiltro puede alargar la vida de los filtros que vienen de la Tierra.', 'warn'); }
    }

    // ---------- Cámara biológica ----------
    function stepBio(dt) {
      const B = S.bio, h = dt / 3600;
      const outside = P.chamber === 'outside';
      const Tset = outside ? world.envT(st.x, st.z) - 273.15 : P.Tc;
      B.T += (Tset - B.T) * Math.min(1, dt / (outside ? 1800 : 900));
      B.power = outside ? 0 : Math.max(0, (B.T + 273.15) - 200) * 0.25;
      // Agua: suministro desde el tanque; en el exterior el vacío la evapora
      if (outside) B.V = Math.max(0, B.V - 50 * h * 20);
      else {
        const feed = Math.min(P.feed * h / 1000, S.plant.tank);   // kg
        S.plant.tank -= feed; B.V = Math.min(200, B.V + feed * 1000);
      }
      if (P.bioPurif && !outside && S.t - S.plant.flowT < 5400) B.V = Math.max(B.V, 40);   // el condensado pasa por el biofiltro
      const wet = B.V > 1 && B.T > -2;
      const dose = (outside ? 1.3e-5 : P.dose) + (B.spe > 0 ? 0.05 : 0);   // Gy/h (superficie lunar ≈ 13 µGy/h)
      if (B.spe > 0) B.spe -= h;
      let uptake = 0;
      SPECIES.forEach((s, i) => {
        let n = B.N[i];
        if (n <= 0) { B.status[i] = 'Extinto'; return; }
        const light = s.needsLight ? (P.light && !outside ? 1 : outside ? 0.6 : 0.05) : 1;
        const lichenWet = s.kind === 'lichen' ? (B.V > 1 && B.T > -10) : wet;
        const mu = s.mu * ctmi(B.T, s) * (outside ? 0 : s.kind === 'lichen' ? 1 : P.nutrients / (0.1 + P.nutrients) * Math.min(1, B.S * 3)) * (lichenWet ? 1 : 0) * light
          + (s.kind === 'lichen' && lichenWet && outside ? 0 : 0);
        let death = s.kd0 + (lichenWet ? 0 : s.kdry) + (B.T < 0 ? s.kfreeze : 0) + (B.T > s.Tmax + 5 ? 0.4 : 0) + Math.LN10 / s.D10 * dose;
        if (s.kind === 'lichen' && P.bioPurif) death += 0.004 * Math.max(0, S.plant.lastResidual - 2);   // biomonitor: sensible al azufre y metales
        if (outside && s.kind === 'bacteria') death += 0.01;   // vacío + ciclos térmicos
        n += (mu * n * (1 - n / s.K) - death * n) * h;
        if (s.kind === 'bacteria' && n < 1) n = 0;
        B.N[i] = Math.max(0, n);
        uptake += mu * n / s.K;
        const tf = ctmi(B.T, s);
        B.status[i] = n <= 0 ? 'Extinto' : mu > death * 1.2 ? 'Creciendo' : death > 0.02 && death > mu * 1.2 ? 'Muriendo'
          : !lichenWet ? 'Latente (sin agua líquida)' : tf === 0 ? (B.T < s.Tmin ? 'Latente (frío)' : 'Estrés por calor') : s.needsLight && light < 0.5 ? 'Latente (sin luz)'
          : B.S < 0.05 && !outside && s.kind !== 'lichen' ? 'Estacionaria (sin nutrientes)' : n > s.K * 0.9 ? 'Estacionaria (saturada)' : 'Estable';
        if (s.kind === 'lichen' && P.bioPurif && S.plant.lastResidual > 5 && n > 0) B.status[i] = 'Alerta: agua contaminada';
      });
      B.S = Math.max(0, B.S - uptake * 0.6 * h);
      if (!outside) B.V = Math.max(0, B.V - (0.05 + uptake * 2) * h);
    }

    // ---------- Colonia: bombeo desde el tanque y consumo ----------
    function stepColony(dt) {
      const C = S.colony, Pl = S.plant, h = dt / 3600;
      const move = Math.min(Pl.tank, COLONY.pumpKgH * h);
      if (move > 1e-6 && Pl.tank > 0.05) { Pl.tank -= move; C.water += move; C.received += move; C.flowT = S.t; }
      C.water = Math.max(0, C.water - COLONY.demandKgDay / 24 * h * (C.water > 0 ? 1 : 0));
    }

    function record() {
      const H = S.hist; if (H.t.length && S.t - H.t[H.t.length - 1] < 300) return;
      H.t.push(S.t); H.bat.push(S.rover.battery / ROVER.cap * 100); H.T.push(S.plant.T); H.tank.push(S.plant.tank);
      SPECIES.forEach((s, i) => H.bio[i].push(S.bio.N[i]));
      if (H.t.length > 600) { H.t.shift(); H.bat.shift(); H.T.shift(); H.tank.shift(); H.bio.forEach(a => a.shift()); }
    }

    function step(dtSim) {
      let left = dtSim;
      while (left > 0) {
        const dt = Math.min(1, left); left -= dt; S.t += dt;
        stepRover(dt); stepPlant(dt); stepBio(dt); stepColony(dt); record();
      }
    }

    // ---------- Comandos ----------
    const cmd = {
      start() { S.running = true; if (S.rover.task === 'dead') return; log('Simulación en marcha.'); },
      pause() { S.running = false; },
      setMode(m) { S.rover.mode = m; S.manual.throttle = 0; S.manual.steer = 0; if (m === 'auto') { S.rover.task = distSt() < 16 ? 'idle' : 'return'; } else { if (S.rover.task !== 'dead') S.rover.task = 'manual'; } log(m === 'auto' ? 'Modo autónomo.' : 'Modo manual: flechas ↑ ↓ avanzar, ← → girar, Espacio perforar. W A S D mueve la cámara.'); },
      drillHere() { const R = S.rover; if (R.task === 'dead' || R.task === 'drill') return; R.speed = 0; R.cand = ki(R.x, R.z); R.task = 'drill'; R.drillDepth = 0; log('Perforación manual iniciada.', 'key'); },
      goTo(x, z) {
        const R = S.rover; if (R.task === 'dead') return;
        R.mode = 'auto'; R.target = { x, z }; R.cand = ki(x, z); R.task = 'goto'; R.stuckT = 0;
        log(`Orden del operador: ir a (${x.toFixed(0)}, ${z.toFixed(0)}) y evaluar el hielo.`, 'key');
      },
      goHome() { if (S.rover.task !== 'dead') { S.rover.mode = 'auto'; S.rover.task = 'return'; log('Orden: volver a la estación.'); } },
      inoculate() { S.bio.N = SPECIES.map(s => s.N0); S.bio.S = 1; S.bio.V = Math.max(S.bio.V, 50); log('Cámara biológica re-inoculada.'); },
      solarEvent() { S.bio.spe = 10; log('Evento de partículas solares: +0,05 Gy/h durante 10 h en la cámara.', 'warn'); },
      resetAll() { resetRover(); resetPlant(); resetBio(); resetColony(); S.t = 0; S.know.sum.fill(0); S.know.n.fill(0); S.know.rejected.fill(0); S.know.drilled.fill(0); S.holes.length = 0; S.trail.length = 0; S.log.length = 0;
        S.hist = { t: [], bat: [], T: [], tank: [], bio: SPECIES.map(() => []) }; S.totals = { ice: 0, reg: 0, water: 0, kWhPlant: 0, dist: 0, holes: 0, rejected: 0 }; S.running = false; log('Simulación reiniciada.'); }
    };

    return { S, P, world, step, cmd, est, ki, cellCenter, ROVER, SPECIES, bioActivity, RAW, ADS_PER_KG, COLONY };
  }

  const api = { createWorld, createWorldFromDEM, createSim, DEFAULT_P, SPECIES, ROVER, ctmi, RAW, ADS_PER_KG };
  root.IceSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
