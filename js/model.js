/* =========================================================================
   ICEWISE — Modelo cuantitativo de extracción térmica de hielo lunar
   -------------------------------------------------------------------------
   Modelo de balance de masa y energía por lotes (batch). Todas las
   constantes indican su procedencia:
     MED  = medido por una misión
     DOC  = documentado en literatura revisada por pares / datos de referencia
     SUP  = supuesto explícito de ICEWISE (modificable en la interfaz)
   Este archivo no depende del DOM: se puede ejecutar en Node para pruebas.
   ========================================================================= */
(function (root) {
  'use strict';

  // ---------- Constantes físicas y de material ----------
  const C = {
    // Perfil de densidad del regolito seco: rho(z) = rho_d - (rho_d - rho_s)·exp(-z/H)
    rho_s: 1100,        // kg/m³ en superficie            [DOC] Hayne et al. 2017 (ref 12)
    rho_d: 1800,        // kg/m³ en profundidad (~1 m)     [DOC] Hayne et al. 2017
    H: 0.06,            // m, escala de altura promedio    [DOC] Hayne et al. 2017 (Tabla A1)
    rho_grain: 3100,    // kg/m³ densidad de grano         [DOC] Carrier et al. 1991, Lunar Sourcebook (ref 13)
    rho_ice: 917,       // kg/m³ hielo Ih                  [DOC]

    // Capacidad calorífica del regolito cp(T) = c0 + c1T + c2T² + c3T³ + c4T⁴  (J/kg·K)
    cpReg: [-3.6125, 2.7431, 2.3616e-3, -1.2340e-5, 8.9093e-9], // [DOC] Hayne et al. 2017 (Hemingway 1981; Ledlow 1992)

    // Hielo Ih: aproximación lineal c = a·T + b (J/kg·K)
    iceA: 7.49, iceB: 90, // [SUP] ajuste lineal a calorimetría de Giauque & Stout 1936 (ref 15); error <5 % entre 100 y 273 K, sobrestima ~25 % a 40 K
    L_sub: 2.834e6,     // J/kg, entalpía de sublimación ≈ 51.06 kJ/mol a 273 K   [DOC] Murphy & Koop 2005 (ref 14)
    L_fus: 3.3355e5,    // J/kg, fusión a 273.15 K          [DOC]
    cp_vap: 1.87e3,     // J/kg·K, vapor de agua (baja presión) [DOC]
    T_melt: 273.15,

    M_w: 0.018015,      // kg/mol
    R: 8.314462,        // J/mol·K
    T_condenser: 200    // K, temperatura del hielo recogido en la trampa fría [SUP]
  };

  // ---------- Funciones auxiliares ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /** Integral analítica de cp_regolito entre T1 y T2 (J/kg). */
  function regolithEnthalpy(T1, T2) {
    const c = C.cpReg;
    const F = (T) => c[0] * T + c[1] * T * T / 2 + c[2] * T ** 3 / 3 + c[3] * T ** 4 / 4 + c[4] * T ** 5 / 5;
    return F(T2) - F(T1);
  }
  function regolithCp(T) { const c = C.cpReg; return c[0] + c[1] * T + c[2] * T * T + c[3] * T ** 3 + c[4] * T ** 4; }

  /** Integral de cp_hielo (lineal) entre T1 y T2 (J/kg). */
  function iceEnthalpy(T1, T2) {
    if (T2 <= T1) return 0;
    const F = (T) => C.iceA * T * T / 2 + C.iceB * T;
    return F(T2) - F(T1);
  }

  /** Presión de vapor sobre hielo (Pa). Murphy & Koop 2005, ec. 7 (válida T > 110 K). */
  function iceVaporPressure(T) {
    return Math.exp(9.550426 - 5723.265 / T + 3.53068 * Math.log(T) - 0.00728332 * T);
  }

  /** Flujo máximo de sublimación de Hertz–Knudsen sobre superficie libre (kg/m²·s), α = 1. */
  function hertzKnudsenFlux(T, alpha = 1) {
    return alpha * iceVaporPressure(T) * Math.sqrt(C.M_w / (2 * Math.PI * C.R * T));
  }

  /** ∫ rho(z) dz entre z1 y z2 (kg/m²) para el perfil exponencial de Hayne. */
  function columnMass(z1, z2) {
    if (z2 <= z1) return 0;
    const { rho_s, rho_d, H } = C;
    return rho_d * (z2 - z1) - (rho_d - rho_s) * H * (Math.exp(-z1 / H) - Math.exp(-z2 / H));
  }

  // ---------- Parámetros por defecto y metadatos ----------
  // tag: 'doc' | 'med' | 'sup'.  src: texto corto de procedencia mostrado en la UI.
  const PARAMS = [
    { group: 'Depósito', key: 'iceWt', label: 'Concentración de hielo', unit: '% en masa', min: 0.2, max: 30, step: 0.1, def: 5.6, tag: 'med',
      src: 'LCROSS: 5,6 ± 2,9 % en la pluma de Cabeus [3]. Promedios orbitales ~1–2 % [2]; superficie expuesta hasta ~30 % en algunos píxeles [6].' },
    { group: 'Depósito', key: 'dryLayer', label: 'Capa seca superior', unit: 'm', min: 0, max: 0.6, step: 0.01, def: 0.10, tag: 'sup',
      src: 'Espesor incierto (cm a decenas de cm). Supuesto modificable.' },
    { group: 'Depósito', key: 'depth', label: 'Profundidad de extracción', unit: 'm', min: 0.2, max: 2.0, step: 0.05, def: 1.0, tag: 'doc',
      src: 'Clase de 1 m de taladros de vuelo: TRIDENT (PRIME-1/VIPER) y ProSEED (PROSPECT) [21][22].' },
    { group: 'Depósito', key: 'T0', label: 'Temperatura inicial', unit: 'K', min: 25, max: 120, step: 1, def: 40, tag: 'med',
      src: 'Diviner: ~38 K subsuperficial estimado en el sitio LCROSS; mínimos locales de 29 K [4].' },

    { group: 'Excavación', key: 'area', label: 'Sección excavada por ciclo', unit: 'm²', min: 0.005, max: 0.25, step: 0.005, def: 0.05, tag: 'sup',
      src: 'Supuesto de diseño: barrena/cuchara de ~25 cm de diámetro equivalente.' },
    { group: 'Excavación', key: 'cycles', label: 'Ciclos por lote', unit: '', min: 1, max: 40, step: 1, def: 5, tag: 'sup',
      src: 'Supuesto de operación.' },
    { group: 'Excavación', key: 'eExc', label: 'Energía específica de excavación', unit: 'Wh/kg', min: 0.5, max: 20, step: 0.5, def: 3, tag: 'sup',
      src: 'Alta incertidumbre: el regolito cementado por hielo puede ser mucho más resistente que el seco. Sin datos de vuelo.' },
    { group: 'Excavación', key: 'etaTr', label: 'Retención en transferencia', unit: '%', min: 70, max: 100, step: 1, def: 97, tag: 'sup',
      src: 'Fracción de material y hielo que llega al horno (sublimación/derrame en tránsito).' },

    { group: 'Procesamiento', key: 'Tp', label: 'Temperatura de proceso', unit: 'K', min: 180, max: 400, step: 5, def: 250, tag: 'sup',
      src: 'Por encima de ~200 K la sublimación en vacío es rápida (Hertz–Knudsen).' },
    { group: 'Procesamiento', key: 'Pheat', label: 'Potencia del calentador', unit: 'W', min: 50, max: 3000, step: 50, def: 500, tag: 'sup',
      src: 'Dentro de un PSR no hay luz solar: requiere baterías, cable desde el borde iluminado o fuente nuclear.' },
    { group: 'Procesamiento', key: 'Pbase', label: 'Potencia de base del sistema', unit: 'W', min: 0, max: 400, step: 10, def: 80, tag: 'sup',
      src: 'Aviónica, control térmico y comunicaciones durante el procesamiento.' },
    { group: 'Procesamiento', key: 'etaH', label: 'Eficiencia de calentamiento', unit: '%', min: 15, max: 95, step: 1, def: 50, tag: 'sup',
      src: 'Fracción de energía eléctrica que llega al material (pérdidas radiativas y conductivas).' },
    { group: 'Procesamiento', key: 'etaRel', label: 'Fracción de hielo liberada', unit: '%', min: 40, max: 100, step: 1, def: 90, tag: 'sup',
      src: 'El regolito es mal conductor (~10⁻³ W/m·K) [12]: el núcleo del lote puede no alcanzar Tp.' },
    { group: 'Procesamiento', key: 'etaCap', label: 'Eficiencia de captura de vapor', unit: '%', min: 40, max: 99, step: 1, def: 85, tag: 'sup',
      src: 'Vapor condensado en la trampa fría frente a fugas y re-depósito en conductos.' },
    { group: 'Procesamiento', key: 'etaPur', label: 'Rendimiento de purificación', unit: '%', min: 60, max: 99, step: 1, def: 92, tag: 'sup',
      src: 'Rechazo de salmuera/concentrado al eliminar NH₃, H₂S, SO₂, CH₃OH y Hg detectados por LCROSS [3][5].' }
  ];

  const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p.key, p.def]));

  const SCENARIOS = {
    desfavorable: {
      label: 'Desfavorable', note: 'Concentración baja, hielo bajo una capa seca gruesa, proceso con más pérdidas.',
      values: { iceWt: 1.0, dryLayer: 0.30, depth: 1.0, T0: 40, area: 0.05, cycles: 5, eExc: 6, etaTr: 92, Tp: 250, Pheat: 500, Pbase: 80, etaH: 35, etaRel: 75, etaCap: 70, etaPur: 88 }
    },
    intermedio: {
      label: 'Intermedio', note: 'Concentración medida por LCROSS en Cabeus, supuestos de proceso moderados.',
      values: { ...DEFAULTS }
    },
    favorable: {
      label: 'Favorable', note: 'Depósito rico y somero, proceso optimizado. Optimista pero físicamente posible.',
      values: { iceWt: 10.0, dryLayer: 0.05, depth: 1.0, T0: 60, area: 0.05, cycles: 5, eExc: 2, etaTr: 98, Tp: 250, Pheat: 500, Pbase: 80, etaH: 65, etaRel: 95, etaCap: 92, etaPur: 95 }
    }
  };

  // ---------- Modelo ----------
  /**
   * Ejecuta el balance de masa y energía de un lote.
   * @param {object} input  parámetros (ver PARAMS); porcentajes en %.
   * @returns {object} resultados con desglose de masas (kg), energías (J), tiempo (s).
   */
  function run(input) {
    const p = { ...DEFAULTS, ...input };
    const w = clamp(p.iceWt / 100, 0, 0.95);
    const etaTr = p.etaTr / 100, etaH = p.etaH / 100, etaRel = p.etaRel / 100, etaCap = p.etaCap / 100, etaPur = p.etaPur / 100;
    const d0 = Math.min(p.dryLayer, p.depth);
    const D = p.depth;

    // 1) Masa excavada (perfil de densidad de Hayne)
    const colOver = columnMass(0, d0);          // kg/m² de sobrecarga seca
    const colIce = columnMass(d0, D);           // kg/m² de capa con hielo (fracción seca)
    const mOverburden = p.cycles * p.area * colOver;
    const mDry = p.cycles * p.area * colIce;    // regolito seco en la capa con hielo
    const mIce = w >= 1 ? 0 : mDry * w / (1 - w); // w definido sobre la masa total húmeda
    const mWet = mDry + mIce;

    // Saturación de poros: hielo máximo que cabe en la porosidad del regolito
    const vol = p.cycles * p.area * Math.max(D - d0, 1e-9);
    const rhoAvg = mDry / vol;
    const porosity = clamp(1 - rhoAvg / C.rho_grain, 0, 1);
    const poreIceMax = porosity * vol * C.rho_ice;
    const poreSaturation = poreIceMax > 0 ? mIce / poreIceMax : 0;

    // 2) Transferencia al horno
    const mDryDel = mDry * etaTr;
    const mIceDel = mIce * etaTr;
    const lossTransfer = mIce - mIceDel;

    // 3) Liberación, captura, purificación
    const mReleased = mIceDel * etaRel;
    const lossResidual = mIceDel - mReleased;
    const mRecovered = mReleased * etaCap;
    const lossCapture = mReleased - mRecovered;
    const mPurified = mRecovered * etaPur;
    const lossPurif = mRecovered - mPurified;

    // 4) Energía térmica
    const T0 = p.T0, Tp = Math.max(p.Tp, T0);
    const eRegSpec = regolithEnthalpy(T0, Tp);                       // J/kg
    const E_reg = mDryDel * eRegSpec;
    const E_iceSens = mIceDel * iceEnthalpy(T0, Math.min(Tp, C.T_melt));
    const E_latent = mReleased * C.L_sub;
    const E_vapor = mReleased * C.cp_vap * Math.max(0, Tp - C.T_melt);
    const E_thermal = E_reg + E_iceSens + E_latent + E_vapor;
    const E_heatElec = E_thermal / etaH;
    const E_heatLoss = E_heatElec - E_thermal;

    // 5) Tiempo y energía de base
    const tProc = E_heatElec / Math.max(p.Pheat, 1);                 // s
    const E_base = p.Pbase * tProc;

    // 6) Excavación (sobrecarga + capa útil, hielo incluido)
    const E_exc = p.eExc * 3600 * (mOverburden + mWet);

    // 7) Purificación: fundir el hielo de la trampa fría (desde T_condenser) — suministrado con la misma eficiencia
    const E_purif = mRecovered * (iceEnthalpy(C.T_condenser, C.T_melt) + C.L_fus) / etaH;

    const E_total = E_heatElec + E_base + E_exc + E_purif;
    const kWh = (J) => J / 3.6e6;
    const specific = mPurified > 1e-9 ? kWh(E_total) / mPurified : Infinity;     // kWh/kg agua purificada
    const thermoMin = mReleased > 1e-9 ? kWh(E_thermal) / mReleased : Infinity;  // kWh/kg mínimo termodinámico del proceso

    const flux = hertzKnudsenFlux(Math.min(Tp, 273));

    // 8) Advertencias de coherencia física
    const warnings = [];
    if (poreSaturation > 1) warnings.push(`El hielo supera la porosidad disponible (${(poreSaturation * 100).toFixed(0)} % de saturación): implica hielo en exceso de poros (segregado o masivo), un escenario no confirmado en la Luna.`);
    if (p.dryLayer >= p.depth) warnings.push('La capa seca es igual o mayor que la profundidad de extracción: no se recolecta material con hielo.');
    if (Tp < 180) warnings.push('Temperatura de proceso muy baja: la sublimación sería extremadamente lenta.');
    if (tProc > 14 * 86400) warnings.push(`El procesamiento tardaría ${(tProc / 86400).toFixed(1)} días con la potencia elegida; supera la autonomía típica de una batería de rover.`);
    if (E_reg > E_latent && mReleased > 0) warnings.push('Calentar el regolito consume más energía que sublimar el hielo: concentraciones bajas penalizan fuertemente la eficiencia energética.');
    if (p.T0 < 60) warnings.push('A T < 100 K el ajuste lineal de cp del hielo sobrestima el calor sensible (efecto < 2 % sobre la energía total).');
    if (warnings.length === 0) warnings.push('Sin incoherencias físicas detectadas para estos parámetros.');

    return {
      params: p,
      mass: { overburden: mOverburden, dry: mDry, ice: mIce, wet: mWet, dryDelivered: mDryDel, iceDelivered: mIceDel,
              released: mReleased, recovered: mRecovered, purified: mPurified,
              lossTransfer, lossResidual, lossCapture, lossPurif },
      pore: { porosity, saturation: poreSaturation, rhoAvg },
      energy: { reg: E_reg, iceSens: E_iceSens, latent: E_latent, vapor: E_vapor, thermal: E_thermal,
                heatLoss: E_heatLoss, heatElec: E_heatElec, base: E_base, exc: E_exc, purif: E_purif, total: E_total },
      kWh: { total: kWh(E_total), thermal: kWh(E_thermal) },
      specific, thermoMin,
      time: { proc: tProc, hours: tProc / 3600 },
      flux,
      recoveryOverall: mIce > 0 ? mPurified / mIce : 0,
      warnings
    };
  }

  /** Barrido de un parámetro manteniendo el resto fijo. */
  function sweep(base, key, values) {
    return values.map(v => ({ x: v, r: run({ ...base, [key]: v }) }));
  }

  /** Puntuación de decisión GO/NO-GO para un depósito caracterizado (usada por la simulación y el dashboard). */
  function decide(dep, opts = {}) {
    const th = { pIce: 0.6, wt: 2.0, depthToIce: 0.6, slope: 15, energyMargin: 0.25, specific: 6, ...opts };
    const criteria = [
      { k: 'Probabilidad de hielo (fusión de sensores)', v: `${Math.round(dep.pIce * 100)} %`, ok: dep.pIce >= th.pIce, req: `≥ ${Math.round(th.pIce * 100)} %` },
      { k: 'Concentración estimada', v: `${dep.wt.toFixed(1)} ± ${dep.wtSigma.toFixed(1)} %`, ok: dep.wt - dep.wtSigma >= th.wt * 0.5 && dep.wt >= th.wt, req: `≥ ${th.wt} %` },
      { k: 'Profundidad hasta el hielo', v: `${dep.depthToIce.toFixed(2)} m`, ok: dep.depthToIce <= th.depthToIce, req: `≤ ${th.depthToIce} m` },
      { k: 'Pendiente del terreno', v: `${dep.slope.toFixed(0)}°`, ok: dep.slope <= th.slope, req: `≤ ${th.slope}°` },
      { k: 'Margen energético tras el lote', v: `${Math.round(dep.energyMargin * 100)} %`, ok: dep.energyMargin >= th.energyMargin, req: `≥ ${Math.round(th.energyMargin * 100)} %` },
      { k: 'Energía específica estimada', v: isFinite(dep.specific) ? `${dep.specific.toFixed(1)} kWh/kg` : '—', ok: dep.specific <= th.specific, req: `≤ ${th.specific} kWh/kg` }
    ];
    const passed = criteria.filter(c => c.ok).length;
    return { criteria, passed, total: criteria.length, go: passed === criteria.length };
  }

  const api = { C, PARAMS, DEFAULTS, SCENARIOS, run, sweep, decide, regolithEnthalpy, regolithCp, iceEnthalpy, iceVaporPressure, hertzKnudsenFlux, columnMass };
  root.IceModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
