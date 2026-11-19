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
    iceWt: { label: L('Concentración de hielo (% en masa)', 'Ice concentration (wt %)'), values: range(0.5, 20, 0.25) },
    dryLayer: { label: L('Capa seca superior (m)', 'Dry top layer (m)'), values: range(0, 0.6, 0.01) },
    T0: { label: L('Temperatura inicial (K)', 'Initial temperature (K)'), values: range(25, 120, 1) },
    Tp: { label: L('Temperatura de proceso (K)', 'Process temperature (K)'), values: range(180, 400, 5) },
    etaH: { label: L('Eficiencia de calentamiento (%)', 'Heating efficiency (%)'), values: range(15, 95, 1) },
    etaCap: { label: L('Eficiencia de captura (%)', 'Capture efficiency (%)'), values: range(40, 99, 1) },
    depth: { label: L('Profundidad de extracción (m)', 'Extraction depth (m)'), values: range(0.2, 2, 0.05) }
  };
  const METRICS = {
    specific: { label: L('Energía específica (kWh por litro de agua purificada)', 'Specific energy (kWh per litre of purified water)'), get: r => r.specific, fmt: v => `${fmt(v, 1)} kWh/L`, max: 40 },
    purified: { label: L('Agua purificada por lote (L)', 'Purified water per batch (L)'), get: r => r.mass.purified, fmt: v => `${fmt(v, 1)} L` },
    hours: { label: L('Tiempo de procesamiento (h)', 'Processing time (h)'), get: r => r.time.hours, fmt: v => `${fmt(v, 0)} h` }
  };

  const chartW = (el, max) => { const c = el && el.closest('.dv-chart'); const w = c ? c.clientWidth - 44 : max; return Math.round(Math.max(320, Math.min(max, w || max))); };
  function range(a, b, s) { const out = []; for (let v = a; v <= b + 1e-9; v += s) out.push(+v.toFixed(4)); return out; }

  // ---------- Controles ----------
  function buildControls() {
    const box = $('#lab-params');
    if (!box) return;
    // Las 15 variables en tres grupos plegables (Depósito abierto; los otros se abren con un toque)
    const grupos = [];
    M.PARAMS.forEach(p => { let g = grupos.find(x => x.name === p.group); if (!g) grupos.push(g = { name: p.group, items: [] }); g.items.push(p); });
    box.innerHTML = grupos.map((g, gi) => `<details class="dv-group"${gi === 0 ? ' open' : ''}>
      <summary><span class="dv-gn">${String(gi + 1).padStart(2, '0')}</span>${g.name}<span class="dv-gc">${g.items.length}</span></summary>
      <div class="dv-gbody">${g.items.map(p => `<div class="param">
        <div class="param-head"><label for="p-${p.key}">${p.label}</label><output id="o-${p.key}" for="p-${p.key}"></output></div>
        <input type="range" id="p-${p.key}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}" aria-describedby="s-${p.key}">
        <div class="param-meta"><span class="src" id="s-${p.key}">${p.src}</span>${tag(p.tag)}</div>
      </div>`).join('')}</div>
    </details>`).join('');
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
    if (note) note.textContent = activeScenario ? M.SCENARIOS[activeScenario].note : L('Parámetros personalizados.', 'Custom parameters.');
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
    const big = [[L('calentar la roca', 'heating the rock'), e.reg], [L('convertir el hielo en vapor', 'turning the ice into vapour'), e.latent], [L('calor perdido en el horno', 'heat lost in the oven'), e.heatLoss]].sort((a, b) => b[1] - a[1])[0];
    el.innerHTML = L(`Con <strong>${fmt(r.params.iceWt, 1)} %</strong> de hielo, procesar <strong>${fmt(r.mass.wet, 0)} kg</strong> de suelo da <strong>${fmt(r.mass.purified, 1)} kg de agua</strong>. `
      + `Cada kilo cuesta <strong>${fmt(r.specific, 1)} kWh</strong>, más o menos lo que gasta un horno de cocina en ${fmt(r.specific / 2, 1)} horas. `
      + `La mayor parte de la energía se va en <strong>${big[0]}</strong> (${pct(big[1])} %).`
      + (r.params.iceWt < 2 ? ' Con tan poco hielo casi toda la energía calienta roca: no compensa.' : ''),
      `With <strong>${fmt(r.params.iceWt, 1)}%</strong> ice, processing <strong>${fmt(r.mass.wet, 0)} kg</strong> of soil yields <strong>${fmt(r.mass.purified, 1)} kg of water</strong>. `
      + `Each kilo costs <strong>${fmt(r.specific, 1)} kWh</strong>, roughly what a kitchen oven uses in ${fmt(r.specific / 2, 1)} hours. `
      + `Most of the energy goes into <strong>${big[0]}</strong> (${pct(big[1])}%).`
      + (r.params.iceWt < 2 ? ' With so little ice, almost all the energy heats rock: it is not worth it.' : ''));
  }

  // Indicadores: el número se desliza con un muelle hasta su nuevo valor (se puede interrumpir moviendo otra variable)
  // y debajo se compara con el escenario medido por LCROSS. ↓ en energía o tiempo es mejor; ↑ en agua es mejor.
  const BASE = M.run(M.SCENARIOS.intermedio.values);
  function kpi(id, value, html, base, lowerIsBetter) {
    const el = $(`#k-${id}`); if (!el) return;
    Ice.springNumber(el, value, html);
    const d = $(`#d-${id}`); if (!d || base === undefined) return;
    const rel = isFinite(value) && isFinite(base) && base !== 0 ? (value - base) / Math.abs(base) : 0;
    if (Math.abs(rel) < 0.005) { d.textContent = L('igual que LCROSS', 'same as LCROSS'); d.className = 'd'; return; }
    const good = lowerIsBetter ? rel < 0 : rel > 0;
    d.textContent = `${rel > 0 ? '↑' : '↓'} ${fmt(Math.abs(rel) * 100, Math.abs(rel) < 0.1 ? 1 : 0)}${L(' %', '%')} ${L('vs. LCROSS', 'vs. LCROSS')}`;
    d.className = 'd ' + (good ? 'good' : 'bad');
  }
  function renderKPIs(r) {
    renderSummary(r);
    const unit = (u) => `<small>${u}</small>`, b = BASE;
    kpi('pur', r.mass.purified, v => `${fmtAuto(v)}${unit('L')}`, b.mass.purified, false);
    kpi('spec', r.specific, v => `${isFinite(v) ? fmt(v, 2) : '—'}${unit('kWh/L')}`, b.specific, true);
    const pk = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
    pk('#pk-pur', `${fmtAuto(r.mass.purified)} L`); pk('#pk-spec', `${isFinite(r.specific) ? fmt(r.specific, 2) : '—'} kWh/L`);
    kpi('energy', r.kWh.total, v => `${fmt(v, 1)}${unit('kWh')}`, b.kWh.total, true);
    kpi('time', r.time.hours, v => fmtDuration(v).replace(/ (\S+)$/, '<small>$1</small>'), b.time.hours, true);
    kpi('ice', r.mass.ice, v => `${fmtAuto(v)}${unit('kg')}`, b.mass.ice, false);
    kpi('recov', r.mass.recovered, v => `${fmtAuto(v)}${unit('L')}`, b.mass.recovered, false);
    kpi('rec', r.recoveryOverall * 100, v => `${fmt(v, 1)}${unit('%')}`, b.recoveryOverall * 100, false);
    kpi('mass', r.mass.wet, v => `${fmt(v, 0)}${unit('kg')}`, b.mass.wet, false);
    kpi('thermo', r.thermoMin, v => `${isFinite(v) ? fmt(v, 2) : '—'}${unit('kWh/L')}`);
  }

  function renderFlow(r) {
    const el = $('#chart-flow'); if (!el) return;
    const m = r.mass;
    charts.flowBars(el, [
      { label: L('Hielo en el suelo', 'Ice in the soil'), value: m.ice, kind: 'stock', note: L('Masa de hielo contenida en el material excavado.', 'Mass of ice contained in the excavated material.') },
      { label: L('Pérdida en transferencia', 'Transfer loss'), value: m.lossTransfer, kind: 'loss', note: L('Sublimación o derrame entre taladro y horno.', 'Sublimation or spillage between drill and oven.') },
      { label: L('Hielo no liberado', 'Ice not released'), value: m.lossResidual, kind: 'loss', note: L('Permanece en el residuo por mala conducción térmica.', 'Stays in the residue because of poor heat conduction.') },
      { label: L('Vapor no capturado', 'Vapour not captured'), value: m.lossCapture, kind: 'loss', note: L('Fugas y re-depósito en conductos.', 'Leaks and re-deposition in ducts.') },
      { label: L('Agua recuperada', 'Water recovered'), value: m.recovered, kind: 'stock', note: L('Condensado en la trampa fría. No es potable.', 'Condensed in the cold trap. Not drinkable.') },
      { label: L('Rechazo de purificación', 'Purification reject'), value: m.lossPurif, kind: 'loss', note: L('Concentrado con NH₃, H₂S, SO₂, Hg, partículas.', 'Concentrate with NH₃, H₂S, SO₂, Hg, particles.') },
      { label: L('Agua purificada', 'Purified water'), value: m.purified, kind: 'stock', highlight: true, note: L('Calidad técnica. Apta para consumo solo tras verificación analítica.', 'Technical grade. Drinkable only after laboratory verification.') }
    ], (() => { const w = chartW(el, 760); return { width: w, labelW: w < 520 ? 150 : 210 }; })());
  }

  function renderEnergy(r) {
    const el = $('#chart-energy'); if (!el) return;
    const e = r.energy, k = v => v / 3.6e6;
    charts.stackedBar(el, [
      { label: L('Calentar regolito', 'Heating regolith'), value: k(e.reg), color: P.ivory, note: L('m·∫cp(T)dT con cp de Hayne et al. 2017', 'm·∫cp(T)dT with cp from Hayne et al. 2017') },
      { label: L('Sublimar hielo', 'Subliming ice'), value: k(e.latent), color: P.cobalt, note: L('L_sub = 2,834 MJ/kg', 'L_sub = 2.834 MJ/kg') },
      { label: L('Calentar hielo y vapor', 'Heating ice and vapour'), value: k(e.iceSens + e.vapor), color: P.ash },
      { label: L('Pérdidas del calentador', 'Heater losses'), value: k(e.heatLoss), color: P.slate, note: L('(1 − η_calentamiento)', '(1 − η_heating)') },
      { label: L('Sistema en espera', 'System on standby'), value: k(e.base), color: '#4a4a5a', note: L('P_base × tiempo', 'P_base × time') },
      { label: L('Excavación', 'Excavation'), value: k(e.exc), color: '#9a9aa6' },
      { label: L('Fundir y purificar', 'Melting and purifying'), value: k(e.purif), color: '#3a3a4a' }
    ], { legend: $('#legend-energy'), valFmt: v => `${fmt(v, 2)} kWh` });
  }

  function renderSweep() {
    const el = $('#chart-sweep'); if (!el) return;
    const sw = SWEEPS[sweepKey], met = METRICS[sweepMetric];
    const series = ['desfavorable', 'intermedio', 'favorable'].map((s, i) => ({
      name: L({ desfavorable: 'Poco hielo', intermedio: 'Medido por LCROSS', favorable: 'Mucho hielo' }, { desfavorable: 'Little ice', intermedio: 'Measured by LCROSS', favorable: 'Lots of ice' })[s],
      color: [P.slate, P.ash, P.ivory][i], dash: i === 0 ? '4 4' : '', width: 1.3,
      data: M.sweep(M.SCENARIOS[s].values, sweepKey, sw.values).map(d => ({ x: d.x, y: met.get(d.r) }))
    }));
    series.push({ name: L('Parámetros actuales', 'Current parameters'), color: P.cobalt, width: 2.2,
      data: M.sweep(params, sweepKey, sw.values).map(d => ({ x: d.x, y: met.get(d.r) })) });
    const ys = series.flatMap(s => s.data.map(d => d.y)).filter(isFinite);
    const yMax = met.max ? Math.min(met.max, Math.max(...ys) * 1.05) : Math.max(...ys) * 1.08;
    charts.lineChart(el, {
      width: chartW(el, 760), height: chartW(el, 760) < 520 ? 300 : 320,
      series, xLabel: sw.label, yLabel: met.label.split('(')[0].trim(), yMin: 0, yMax,
      yFmt: v => v === 0 ? '0' : fmtAuto(v), marker: { x: params[sweepKey], label: L('actual', 'current') },
      band: sweepKey === 'iceWt' ? { x1: 2.7, x2: 8.5, label: L('Rango LCROSS (5,6 ± 2,9 %)', 'LCROSS range (5.6 ± 2.9%)') } : null,
      aria: L(`${met.label} en función de ${sw.label}`, `${met.label} as a function of ${sw.label}`)
    });
    const lg = $('#legend-sweep');
    if (lg) lg.innerHTML = series.map(s => `<span><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join('');
  }

  function renderWarnings(r) {
    const el = $('#lab-warnings'); if (!el) return;
    const okOnly = r.warnings.length === 1 && r.warnings[0].startsWith(L('Sin incoherencias', 'No physical'));
    el.innerHTML = r.warnings.map(w => `<li class="${okOnly ? 'ok' : ''}">${w}</li>`).join('');
    const pc = L(' %', '%');
    const sat = $('#k-sat'); if (sat) sat.textContent = `${fmt(r.pore.saturation * 100, 0)}${pc}`;
    const por = $('#k-por'); if (por) por.textContent = `${fmt(r.pore.porosity * 100, 0)}${pc}`;
    const flux = $('#k-flux'); if (flux) flux.textContent = `${fmt(r.flux * 1000, 2)} g/m²·s`;
  }

  function renderAudit(r) {
    const el = $('#lab-audit'); if (!el) return;
    const e = r.energy, k = v => fmt(v / 3.6e6, 2) + ' kWh';
    const rows = L([
      ['Regolito seco en la capa con hielo', `${fmt(r.mass.dry, 1)} kg`, 'sim', 'Calculado: ciclos × sección × ∫ρ(z)dz'],
      ['Sobrecarga seca excavada', `${fmt(r.mass.overburden, 1)} kg`, 'sim', 'Calculado'],
      ['Densidad media de la capa', `${fmt(r.pore.rhoAvg, 0)} kg/m³`, 'doc', 'Perfil de Hayne et al. 2017'],
      ['Energía para calentar regolito', k(e.reg), 'sim', 'Integral de cp(T) documentado'],
      ['Energía de sublimación', k(e.latent), 'sim', 'L_sub documentado × masa liberada'],
      ['Pérdidas del calentador', k(e.heatLoss), 'sup', 'Depende de η supuesta'],
      ['Energía total del lote', k(e.total), 'sim', 'Suma de términos'],
      ['Flujo máximo de sublimación (superficie libre)', `${fmt(r.flux * 1000, 2)} g/m²·s`, 'doc', 'Hertz–Knudsen con P_sat de Murphy & Koop 2005']
    ], [
      ['Dry regolith in the icy layer', `${fmt(r.mass.dry, 1)} kg`, 'sim', 'Calculated: cycles × area × ∫ρ(z)dz'],
      ['Dry overburden excavated', `${fmt(r.mass.overburden, 1)} kg`, 'sim', 'Calculated'],
      ['Mean density of the layer', `${fmt(r.pore.rhoAvg, 0)} kg/m³`, 'doc', 'Profile from Hayne et al. 2017'],
      ['Energy to heat the regolith', k(e.reg), 'sim', 'Integral of documented cp(T)'],
      ['Sublimation energy', k(e.latent), 'sim', 'Documented L_sub × mass released'],
      ['Heater losses', k(e.heatLoss), 'sup', 'Depends on the assumed η'],
      ['Total batch energy', k(e.total), 'sim', 'Sum of terms'],
      ['Maximum sublimation flux (free surface)', `${fmt(r.flux * 1000, 2)} g/m²·s`, 'doc', 'Hertz–Knudsen with P_sat from Murphy & Koop 2005']
    ]);
    el.innerHTML = rows.map(([a, b, t, c]) => `<tr><td>${a}<span class="muted caption">${c}</span></td><td class="num">${b}</td><td>${tag(t)}</td></tr>`).join('');
  }

  // ---------- Comparación de escenarios ----------
  function renderScenarioCompare() {
    const res = ['desfavorable', 'intermedio', 'favorable'].map(k => ({ k, r: M.run(M.SCENARIOS[k].values) }));
    const el = $('#chart-scen');
    if (el) charts.groupedBars(el, res.map(x => ({ label: M.SCENARIOS[x.k].label, values: [x.r.mass.ice, x.r.mass.purified] })),
      [{ name: L('Hielo en el suelo (kg)', 'Ice in the soil (kg)'), color: P.slate }, { name: L('Agua purificada (kg)', 'Purified water (kg)'), color: P.cobalt }],
      { legend: $('#legend-scen'), width: 420, height: 230, yFmt: v => fmt(v, 0), aria: L('Hielo en el suelo y agua purificada por escenario', 'Ice in the soil and purified water per scenario') });
    const el2 = $('#chart-scen-e');
    if (el2) charts.groupedBars(el2, res.map(x => ({ label: M.SCENARIOS[x.k].label, values: [x.r.specific] })),
      [{ name: L('kWh por litro de agua purificada', 'kWh per litre of purified water'), color: '#8fa0ff' }],
      { legend: $('#legend-scen-e'), width: 420, height: 230, yFmt: v => fmt(v, 1), aria: L('Energía específica por escenario', 'Specific energy per scenario') });
    const tb = $('#scen-table');
    if (tb) {
      const row = (label, f, t) => `<tr><td>${label} ${t ? tag(t) : ''}</td>${res.map(x => `<td class="num">${f(x.r)}</td>`).join('')}</tr>`;
      tb.innerHTML = [
        row('Concentración de hielo', r => `${fmt(r.params.iceWt, 1)} %`, 'sup'),
        row('Capa seca superior', r => `${fmt(r.params.dryLayer, 2)} m`, 'sup'),
        row('Material húmedo procesado', r => `${fmt(r.mass.wet, 0)} kg`, 'sim'),
        row('Hielo in situ', r => `${fmt(r.mass.ice, 1)} kg`, 'sim'),
        row('Agua recuperada', r => `${fmt(r.mass.recovered, 1)} L`, 'sim'),
        row('Agua purificada', r => `${fmt(r.mass.purified, 1)} L`, 'sim'),
        row('Recuperación global', r => `${fmt(r.recoveryOverall * 100, 0)} %`, 'sim'),
        row('Energía total del lote', r => `${fmt(r.kWh.total, 1)} kWh`, 'sim'),
        row('Energía específica', r => `${fmt(r.specific, 1)} kWh/L`, 'sim'),
        row('Tiempo de procesamiento', r => fmtDuration(r.time.hours), 'sim')
      ].join('');
    }
  }

  // ---------- Exportar ----------
  function toCSV() {
    const r = M.run(params);
    const lines = [L(['parametro', 'valor', 'unidad', 'procedencia'], ['parameter', 'value', 'unit', 'source'])];
    M.PARAMS.forEach(p => lines.push([p.label, params[p.key], p.unit, Ice.TAG_TEXT[p.tag]]));
    lines.push([]);
    lines.push(L(['resultado (SIMULADO)', 'valor', 'unidad'], ['result (SIMULATED)', 'value', 'unit']));
    L([['Hielo en el suelo', r.mass.ice, 'kg'], ['Agua recuperada', r.mass.recovered, 'kg'], ['Agua purificada', r.mass.purified, 'kg'],
     ['Energia total', r.kWh.total, 'kWh'], ['Energia especifica', r.specific, 'kWh/L'], ['Tiempo de procesamiento', r.time.hours, 'h'],
     ['Recuperacion global', r.recoveryOverall * 100, '%']],
     [['Ice in the soil', r.mass.ice, 'kg'], ['Water recovered', r.mass.recovered, 'kg'], ['Purified water', r.mass.purified, 'kg'],
     ['Total energy', r.kWh.total, 'kWh'], ['Specific energy', r.specific, 'kWh/L'], ['Processing time', r.time.hours, 'h'],
     ['Overall recovery', r.recoveryOverall * 100, '%']]).forEach(x => lines.push([x[0], x[1].toFixed(4), x[2]]));
    return lines.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function init() {
    if (!$('#lab-params')) return;
    buildControls();
    const more = $('#lab-more');
    if (more) more.addEventListener('click', () => {
      const on = $('#lab-params').classList.toggle('show-all');
      more.textContent = on ? L('Mostrar solo lo esencial', 'Show only the essentials') : L('Mostrar todos los parámetros', 'Show all parameters');
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
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = L('icewise-escenario.csv', 'icewise-scenario.csv'); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(L('CSV descargado: parámetros, procedencia y resultados simulados.', 'CSV downloaded: parameters, sources and simulated results.'));
    });
    initTabs(); initPeek();
    const pdf = $('#lab-pdf');
    if (pdf) pdf.addEventListener('click', () => window.IceReport && IceReport.generar(pdf));
    const reset = $('#lab-reset');
    if (reset) reset.addEventListener('click', () => {
      activeScenario = 'intermedio'; params = { ...M.SCENARIOS.intermedio.values };
      markScenario(); updateOutputs(); compute();
      toast(L('Variables restablecidas al escenario medido por LCROSS.', 'Variables reset to the scenario measured by LCROSS.'));
    });
    const toMission = $('#lab-to-mission');
    if (toMission) toMission.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('icewise:useParams', { detail: { ...params } }));
      toast(L('Parámetros de proceso enviados a la simulación de misión.', 'Process parameters sent to the mission simulation.'));
      document.getElementById('simulacion').scrollIntoView({ behavior: 'smooth' });
    });
    markScenario();
    compute();
    renderScenarioCompare();
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { compute(); renderScenarioCompare(); }, 200); });
  }

  // ---------- Un solo gráfico a la vista, elegido con pestañas (menos ruido; siempre junto a las variables) ----------
  const NOTES = {
    flow: L('kg por lote: de la roca al agua limpia', 'kg per batch: from rock to clean water'),
    energy: L('kWh por lote, por etapa del proceso', 'kWh per batch, by process stage'),
    sweep: L('Qué pasa si mueves solo una variable; el punto azul es tu caso', 'What happens if you move a single variable; the blue dot is your case'),
    scen: L('Los tres escenarios de referencia, lado a lado', 'The three reference scenarios, side by side')
  };
  function initTabs() {
    const tabs = $$('#dv-tabs [role=tab]'); if (!tabs.length) return;
    const show = (t, focus) => {
      tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        const pane = document.getElementById(x.getAttribute('aria-controls')); if (pane) { pane.hidden = !on; if (on) { pane.classList.remove('is-in'); void pane.offsetWidth; pane.classList.add('is-in'); } } });
      const key = t.id.replace('dvt-', ''); const n = $('#dv-chart-note'); if (n) n.textContent = NOTES[key] || '';
      if (focus) t.focus();
      try { localStorage.setItem('icewise-dv-tab', t.id); } catch (_) {}
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', e => {
        const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return;
        e.preventDefault(); show(tabs[(i + k + tabs.length) % tabs.length], true);
      });
    });
    let saved = null; try { saved = localStorage.getItem('icewise-dv-tab'); } catch (_) {}
    show(tabs.find(t => t.id === saved) || tabs[0]);
  }
  // En pantallas estrechas el resultado queda arriba; mientras mueves variables más abajo, una barra fija lo repite
  function initPeek() {
    const peek = $('#dv-peek'), kpis = $('#dv-kpis'), vars = $('.dv-vars');
    if (!peek || !kpis || !vars || !('IntersectionObserver' in window)) return;
    let kpiVisible = true, varsVisible = false;
    const upd = () => peek.classList.toggle('is-on', !kpiVisible && varsVisible && innerWidth <= 1000);
    new IntersectionObserver(es => { kpiVisible = es[0].isIntersecting; upd(); }).observe(kpis);
    new IntersectionObserver(es => { varsVisible = es[0].isIntersecting; upd(); }, { rootMargin: '-30% 0px -30% 0px' }).observe(vars);
    addEventListener('resize', upd);
  }

  window.IceLab = { init, getParams: () => ({ ...params }), getScenario: () => activeScenario };
})();
