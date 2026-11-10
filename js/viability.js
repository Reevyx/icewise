/* =========================================================================
   ICEWISE — Laboratorio de viabilidad (UI del modelo cuantitativo)
   ========================================================================= */
(function () {
  'use strict';
  const { $, $$, fmt, fmtAuto, fmtDuration, tag, toast, charts } = Ice;
  const M = IceModel;
  const P = charts.PALETTE;

  let params = { ...M.SCENARIOS.intermedio.values };
  let sweepKey = 'iceWt';
  let sweepMetric = 'specific';
  let activeScenario = 'intermedio';

  const SWEEPS = {
    iceWt: { label: 'Concentración de hielo (% en masa)', values: range(0.5, 20, 0.25) },
    dryLayer: { label: 'Capa seca superior (m)', values: range(0, 0.6, 0.01) },
    T0: { label: 'Temperatura inicial (K)', values: range(25, 120, 1) },
    Tp: { label: 'Temperatura de proceso (K)', values: range(180, 400, 5) },
    etaH: { label: 'Eficiencia de calentamiento (%)', values: range(15, 95, 1) },
    etaCap: { label: 'Eficiencia de captura (%)', values: range(40, 99, 1) },
    depth: { label: 'Profundidad de extracción (m)', values: range(0.2, 2, 0.05) }
  };
  const METRICS = {
    specific: { label: 'Energía específica (kWh/kg agua purificada)', get: r => r.specific, fmt: v => `${fmt(v, 1)} kWh/kg`, max: 40 },
    purified: { label: 'Agua purificada por lote (kg)', get: r => r.mass.purified, fmt: v => `${fmt(v, 1)} kg` },
    hours: { label: 'Tiempo de procesamiento (h)', get: r => r.time.hours, fmt: v => `${fmt(v, 0)} h` }
  };

  function range(a, b, s) { const out = []; for (let v = a; v <= b + 1e-9; v += s) out.push(+v.toFixed(4)); return out; }

  // ---------- Controles ----------
  function buildControls() {
    const box = $('#lab-params');
    if (!box) return;
    let html = '', group = '';
    const BASIC = ['iceWt', 'dryLayer', 'Pheat', 'etaH', 'etaCap'];
    M.PARAMS.forEach(p => {
      const adv = !BASIC.includes(p.key);
      if (p.group !== group) { group = p.group; html += `<div class="param-group-title${adv && !['Depósito', 'Procesamiento'].includes(group) ? ' param--adv' : ''}">${group}</div>`; }
      html += `<div class="param${adv ? ' param--adv' : ''}">
        <div class="param-head"><label for="p-${p.key}">${p.label}</label><output id="o-${p.key}" for="p-${p.key}"></output></div>
        <input type="range" id="p-${p.key}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}" aria-describedby="s-${p.key}">
        <div class="param-meta"><span class="src" id="s-${p.key}">${p.src}</span>${tag(p.tag)}</div>
      </div>`;
    });
    box.innerHTML = html;
    $$('input[type=range]', box).forEach(inp => {
      inp.addEventListener('input', () => {
        params[inp.dataset.key] = parseFloat(inp.value);
        activeScenario = null; markScenario();
        updateOutputs(); compute();
      });
    });
    updateOutputs();
  }

  function unitFmt(p, v) {
    const d = p.step < 0.01 ? 3 : p.step < 0.1 ? 2 : p.step < 1 ? 1 : 0;
    return `${fmt(v, d)}${p.unit ? ' ' + p.unit : ''}`;
  }
  function updateOutputs() {
    M.PARAMS.forEach(p => {
      const inp = $(`#p-${p.key}`), out = $(`#o-${p.key}`);
      if (!inp) return;
      inp.value = params[p.key];
      out.textContent = unitFmt(p, params[p.key]);
      const f = (params[p.key] - p.min) / (p.max - p.min) * 100;
      inp.style.setProperty('--fill', f + '%');
    });
  }

  function markScenario() {
    $$('#lab-scenarios button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === activeScenario)));
    const note = $('#lab-scenario-note');
    if (note) note.textContent = activeScenario ? M.SCENARIOS[activeScenario].note : 'Parámetros personalizados.';
  }

  // ---------- Cálculo y render ----------
  function compute() {
    const r = M.run(params);
    renderKPIs(r);
    renderFlow(r);
    renderEnergy(r);
    renderSweep();
    renderWarnings(r);
    renderAudit(r);
    document.dispatchEvent(new CustomEvent('icewise:model', { detail: r }));
    return r;
  }

  function renderSummary(r) {
    const el = $('#lab-summary'); if (!el) return;
    const e = r.energy, pct = v => fmt(v / e.total * 100, 0);
    const big = [['calentar la roca', e.reg], ['convertir el hielo en vapor', e.latent], ['calor perdido en el horno', e.heatLoss]].sort((a, b) => b[1] - a[1])[0];
    el.innerHTML = `Con <strong>${fmt(r.params.iceWt, 1)} %</strong> de hielo, procesar <strong>${fmt(r.mass.wet, 0)} kg</strong> de suelo da <strong>${fmt(r.mass.purified, 1)} kg de agua</strong>. `
      + `Cada kilo cuesta <strong>${fmt(r.specific, 1)} kWh</strong>, más o menos lo que gasta un horno de cocina en ${fmt(r.specific / 2, 1)} horas. `
      + `La mayor parte de la energía se va en <strong>${big[0]}</strong> (${pct(big[1])} %).`
      + (r.params.iceWt < 2 ? ' Con tan poco hielo casi toda la energía calienta roca: no compensa.' : '');
  }

  function renderKPIs(r) {
    renderSummary(r);
    const set = (id, v) => { const el = $(id); if (el) el.innerHTML = v; };
    set('#k-ice', `${fmtAuto(r.mass.ice)}<small>kg</small>`);
    set('#k-pur', `${fmtAuto(r.mass.purified)}<small>kg</small>`);
    set('#k-energy', `${fmt(r.kWh.total, 1)}<small>kWh</small>`);
    set('#k-spec', `${isFinite(r.specific) ? fmt(r.specific, 2) : '—'}<small>kWh/kg</small>`);
    set('#k-time', fmtDuration(r.time.hours).replace(/ (\S+)$/, '<small>$1</small>'));
    set('#k-rec', `${fmt(r.recoveryOverall * 100, 1)}<small>%</small>`);
    set('#k-mass', `${fmt(r.mass.wet, 0)}<small>kg</small>`);
    set('#k-thermo', `${isFinite(r.thermoMin) ? fmt(r.thermoMin, 2) : '—'}<small>kWh/kg</small>`);
  }

  function renderFlow(r) {
    const el = $('#chart-flow'); if (!el) return;
    const m = r.mass;
    charts.flowBars(el, [
      { label: 'Hielo in situ', value: m.ice, kind: 'stock', note: 'Masa de hielo contenida en el material excavado.' },
      { label: 'Pérdida en transferencia', value: m.lossTransfer, kind: 'loss', note: 'Sublimación o derrame entre taladro y horno.' },
      { label: 'Hielo no liberado', value: m.lossResidual, kind: 'loss', note: 'Permanece en el residuo por mala conducción térmica.' },
      { label: 'Vapor no capturado', value: m.lossCapture, kind: 'loss', note: 'Fugas y re-depósito en conductos.' },
      { label: 'Agua recuperada', value: m.recovered, kind: 'stock', note: 'Condensado en la trampa fría. No es potable.' },
      { label: 'Rechazo de purificación', value: m.lossPurif, kind: 'loss', note: 'Concentrado con NH₃, H₂S, SO₂, Hg, partículas.' },
      { label: 'Agua purificada', value: m.purified, kind: 'stock', highlight: true, note: 'Calidad técnica. Apta para consumo solo tras verificación analítica.' }
    ]);
  }

  function renderEnergy(r) {
    const el = $('#chart-energy'); if (!el) return;
    const e = r.energy, k = v => v / 3.6e6;
    charts.stackedBar(el, [
      { label: 'Calentar regolito', value: k(e.reg), color: P.ivory, note: 'm·∫cp(T)dT con cp de Hayne et al. 2017' },
      { label: 'Sublimar hielo', value: k(e.latent), color: P.cobalt, note: 'L_sub = 2,834 MJ/kg' },
      { label: 'Calentar hielo y vapor', value: k(e.iceSens + e.vapor), color: P.ash },
      { label: 'Pérdidas del calentador', value: k(e.heatLoss), color: P.slate, note: '(1 − η_calentamiento)' },
      { label: 'Sistema en espera', value: k(e.base), color: '#4a4a5a', note: 'P_base × tiempo' },
      { label: 'Excavación', value: k(e.exc), color: '#9a9aa6' },
      { label: 'Fundir y purificar', value: k(e.purif), color: '#3a3a4a' }
    ], { legend: $('#legend-energy'), valFmt: v => `${fmt(v, 2)} kWh` });
  }

  function renderSweep() {
    const el = $('#chart-sweep'); if (!el) return;
    const sw = SWEEPS[sweepKey], met = METRICS[sweepMetric];
    const series = ['desfavorable', 'intermedio', 'favorable'].map((s, i) => ({
      name: { desfavorable: 'Poco hielo', intermedio: 'Medido por LCROSS', favorable: 'Mucho hielo' }[s],
      color: [P.slate, P.ash, P.ivory][i], dash: i === 0 ? '4 4' : '', width: 1.3,
      data: M.sweep(M.SCENARIOS[s].values, sweepKey, sw.values).map(d => ({ x: d.x, y: met.get(d.r) }))
    }));
    series.push({ name: 'Parámetros actuales', color: P.cobalt, width: 2.2,
      data: M.sweep(params, sweepKey, sw.values).map(d => ({ x: d.x, y: met.get(d.r) })) });
    const ys = series.flatMap(s => s.data.map(d => d.y)).filter(isFinite);
    const yMax = met.max ? Math.min(met.max, Math.max(...ys) * 1.05) : Math.max(...ys) * 1.08;
    charts.lineChart(el, {
      series, xLabel: sw.label, yLabel: met.label.split('(')[0].trim(), yMin: 0, yMax,
      yFmt: v => fmtAuto(v), marker: { x: params[sweepKey], label: 'actual' },
      band: sweepKey === 'iceWt' ? { x1: 2.7, x2: 8.5, label: 'Rango LCROSS (5,6 ± 2,9 %)' } : null,
      aria: `${met.label} en función de ${sw.label}`
    });
    const lg = $('#legend-sweep');
    if (lg) lg.innerHTML = series.map(s => `<span><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join('');
  }

  function renderWarnings(r) {
    const el = $('#lab-warnings'); if (!el) return;
    const okOnly = r.warnings.length === 1 && r.warnings[0].startsWith('Sin incoherencias');
    el.innerHTML = r.warnings.map(w => `<li class="${okOnly ? 'ok' : ''}">${w}</li>`).join('');
    const sat = $('#k-sat'); if (sat) sat.textContent = `${fmt(r.pore.saturation * 100, 0)} %`;
    const por = $('#k-por'); if (por) por.textContent = `${fmt(r.pore.porosity * 100, 0)} %`;
    const flux = $('#k-flux'); if (flux) flux.textContent = `${fmt(r.flux * 1000, 2)} g/m²·s`;
  }

  function renderAudit(r) {
    const el = $('#lab-audit'); if (!el) return;
    const e = r.energy, k = v => fmt(v / 3.6e6, 2) + ' kWh';
    const rows = [
      ['Regolito seco en la capa con hielo', `${fmt(r.mass.dry, 1)} kg`, 'sim', 'Calculado: ciclos × sección × ∫ρ(z)dz'],
      ['Sobrecarga seca excavada', `${fmt(r.mass.overburden, 1)} kg`, 'sim', 'Calculado'],
      ['Densidad media de la capa', `${fmt(r.pore.rhoAvg, 0)} kg/m³`, 'doc', 'Perfil de Hayne et al. 2017'],
      ['Energía para calentar regolito', k(e.reg), 'sim', 'Integral de cp(T) documentado'],
      ['Energía de sublimación', k(e.latent), 'sim', 'L_sub documentado × masa liberada'],
      ['Pérdidas del calentador', k(e.heatLoss), 'sup', 'Depende de η supuesta'],
      ['Energía total del lote', k(e.total), 'sim', 'Suma de términos'],
      ['Flujo máximo de sublimación (superficie libre)', `${fmt(r.flux * 1000, 2)} g/m²·s`, 'doc', 'Hertz–Knudsen con P_sat de Murphy & Koop 2005']
    ];
    el.innerHTML = rows.map(([a, b, t, c]) => `<tr><td>${a}<span class="muted caption">${c}</span></td><td class="num">${b}</td><td>${tag(t)}</td></tr>`).join('');
  }

  // ---------- Comparación de escenarios ----------
  function renderScenarioCompare() {
    const res = ['desfavorable', 'intermedio', 'favorable'].map(k => ({ k, r: M.run(M.SCENARIOS[k].values) }));
    const el = $('#chart-scen');
    if (el) charts.groupedBars(el, res.map(x => ({ label: M.SCENARIOS[x.k].label, values: [x.r.mass.ice, x.r.mass.purified] })),
      [{ name: 'Hielo in situ (kg)', color: P.slate }, { name: 'Agua purificada (kg)', color: P.ivory }],
      { legend: $('#legend-scen'), yFmt: v => fmt(v, 0), aria: 'Hielo in situ y agua purificada por escenario' });
    const el2 = $('#chart-scen-e');
    if (el2) charts.groupedBars(el2, res.map(x => ({ label: M.SCENARIOS[x.k].label, values: [x.r.specific] })),
      [{ name: 'kWh por kg de agua purificada', color: P.cobalt }],
      { legend: $('#legend-scen-e'), yFmt: v => fmt(v, 1), aria: 'Energía específica por escenario' });
    const tb = $('#scen-table');
    if (tb) {
      const row = (label, f, t) => `<tr><td>${label} ${t ? tag(t) : ''}</td>${res.map(x => `<td class="num">${f(x.r)}</td>`).join('')}</tr>`;
      tb.innerHTML = [
        row('Concentración de hielo', r => `${fmt(r.params.iceWt, 1)} %`, 'sup'),
        row('Capa seca superior', r => `${fmt(r.params.dryLayer, 2)} m`, 'sup'),
        row('Material húmedo procesado', r => `${fmt(r.mass.wet, 0)} kg`, 'sim'),
        row('Hielo in situ', r => `${fmt(r.mass.ice, 1)} kg`, 'sim'),
        row('Agua recuperada', r => `${fmt(r.mass.recovered, 1)} kg`, 'sim'),
        row('Agua purificada', r => `${fmt(r.mass.purified, 1)} kg`, 'sim'),
        row('Recuperación global', r => `${fmt(r.recoveryOverall * 100, 0)} %`, 'sim'),
        row('Energía total del lote', r => `${fmt(r.kWh.total, 1)} kWh`, 'sim'),
        row('Energía específica', r => `${fmt(r.specific, 1)} kWh/kg`, 'sim'),
        row('Tiempo de procesamiento', r => fmtDuration(r.time.hours), 'sim')
      ].join('');
    }
  }

  // ---------- Exportar ----------
  function toCSV() {
    const r = M.run(params);
    const lines = [['parametro', 'valor', 'unidad', 'procedencia']];
    M.PARAMS.forEach(p => lines.push([p.label, params[p.key], p.unit, Ice.TAG_TEXT[p.tag]]));
    lines.push([]);
    lines.push(['resultado (SIMULADO)', 'valor', 'unidad']);
    [['Hielo in situ', r.mass.ice, 'kg'], ['Agua recuperada', r.mass.recovered, 'kg'], ['Agua purificada', r.mass.purified, 'kg'],
     ['Energia total', r.kWh.total, 'kWh'], ['Energia especifica', r.specific, 'kWh/kg'], ['Tiempo de procesamiento', r.time.hours, 'h'],
     ['Recuperacion global', r.recoveryOverall * 100, '%']].forEach(x => lines.push([x[0], x[1].toFixed(4), x[2]]));
    return lines.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function init() {
    if (!$('#lab-params')) return;
    buildControls();
    const more = $('#lab-more');
    if (more) more.addEventListener('click', () => {
      const on = $('#lab-params').classList.toggle('show-all');
      more.textContent = on ? 'Mostrar solo lo esencial' : 'Mostrar todos los parámetros';
    });
    $$('#lab-scenarios button').forEach(b => b.addEventListener('click', () => {
      activeScenario = b.dataset.s; params = { ...M.SCENARIOS[activeScenario].values };
      markScenario(); updateOutputs(); compute();
    }));
    $$('#sweep-var button').forEach(b => b.addEventListener('click', () => {
      sweepKey = b.dataset.k; $$('#sweep-var button').forEach(x => x.setAttribute('aria-selected', String(x === b))); renderSweep();
    }));
    $$('#sweep-metric button').forEach(b => b.addEventListener('click', () => {
      sweepMetric = b.dataset.m; $$('#sweep-metric button').forEach(x => x.setAttribute('aria-selected', String(x === b))); renderSweep();
    }));
    const dl = $('#lab-export');
    if (dl) dl.addEventListener('click', () => {
      const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'icewise-escenario.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('CSV descargado: parámetros, procedencia y resultados simulados.');
    });
    const toMission = $('#lab-to-mission');
    if (toMission) toMission.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('icewise:useParams', { detail: { ...params } }));
      toast('Parámetros de proceso enviados a la simulación de misión.');
      document.getElementById('simulacion').scrollIntoView({ behavior: 'smooth' });
    });
    markScenario();
    compute();
    renderScenarioCompare();
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { compute(); renderScenarioCompare(); }, 200); });
  }

  window.IceLab = { init, getParams: () => ({ ...params }) };
})();
