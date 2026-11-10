/* =========================================================================
   ICEWISE — Utilidades comunes, estado compartido y gráficos SVG ligeros
   (sin dependencias externas: la página funciona sin conexión)
   ========================================================================= */
(function (root) {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const nf = (d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtCache = {};
  function fmt(x, d = 1) {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    if (!isFinite(x)) return '∞';
    return (fmtCache[d] || (fmtCache[d] = nf(d))).format(x);
  }
  function fmtAuto(x) {
    const a = Math.abs(x);
    if (a >= 100) return fmt(x, 0);
    if (a >= 10) return fmt(x, 1);
    if (a >= 1) return fmt(x, 2);
    return fmt(x, 3);
  }
  function fmtDuration(hours) {
    if (!isFinite(hours)) return '—';
    if (hours < 1) return `${fmt(hours * 60, 0)} min`;
    if (hours < 48) return `${fmt(hours, 1)} h`;
    return `${fmt(hours / 24, 1)} días`;
  }

  /** Generador pseudoaleatorio con semilla (mulberry32) — simulaciones reproducibles. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Almacén de estado mínimo con suscripción (comparte estado misión ↔ dashboard). */
  function createStore(initial) {
    let state = { ...initial };
    const subs = new Set();
    return {
      get: () => state,
      set(patch) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; subs.forEach(fn => fn(state)); },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
    };
  }

  const TAG_TEXT = { med: 'Medido', doc: 'Documentado', sup: 'Supuesto', sim: 'Simulado', ice: 'Propuesta ICEWISE', exist: 'Existente', dev: 'En desarrollo / adaptación' };
  const tag = (kind, text) => `<span class="tag tag--${kind}">${text || TAG_TEXT[kind] || kind}</span>`;
  const cite = (...ids) => `<sup class="cite">[${ids.map(i => `<a href="#ref-${i}" aria-label="Referencia ${i}">${i}</a>`).join(',')}]</sup>`;

  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
  }

  // ---------------------------------------------------------------------
  // Gráficos SVG
  // ---------------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = { ivory: '#ededf3', ash: '#c3c3cc', slate: '#70707d', dim: '#4a4a5a', obsidian: '#272735', cobalt: '#5266eb' };

  function svgEl(tagName, attrs = {}, parent) {
    const el = document.createElementNS(NS, tagName);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  let tipEl;
  function tip(html, evt) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    if (!html) { tipEl.classList.remove('is-on'); return; }
    tipEl.innerHTML = html; tipEl.classList.add('is-on');
    const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }

  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  /**
   * Gráfico de líneas.
   * opts: { series:[{name, color, data:[{x,y}], dash, width}], xLabel, yLabel, xFmt, yFmt, marker:{x, label}, yMin, yMax, logY, height }
   */
  function lineChart(container, opts) {
    const W = opts.width || 640, H = opts.height || 300, m = { t: 16, r: 18, b: 42, l: opts.width && opts.width < 500 ? 40 : 56 };
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || opts.yLabel || 'Gráfico' }, container);
    const all = opts.series.flatMap(s => s.data).filter(d => isFinite(d.y));
    const xMin = opts.xMin ?? Math.min(...all.map(d => d.x)), xMax = opts.xMax ?? Math.max(...all.map(d => d.x));
    let yMin = opts.yMin ?? Math.min(0, ...all.map(d => d.y)), yMax = opts.yMax ?? Math.max(...all.map(d => d.y)) * 1.08;
    const log = !!opts.logY;
    if (log) { yMin = opts.yMin ?? Math.max(1e-3, Math.min(...all.map(d => d.y))); yMax = opts.yMax ?? Math.max(...all.map(d => d.y)) * 1.5; }
    const X = (x) => m.l + (x - xMin) / (xMax - xMin) * (W - m.l - m.r);
    const Y = (y) => {
      if (log) { const ly = Math.log10(clamp(y, yMin, yMax)); return H - m.b - (ly - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * (H - m.t - m.b); }
      return H - m.b - (clamp(y, yMin, yMax) - yMin) / (yMax - yMin) * (H - m.t - m.b);
    };
    const xf = opts.xFmt || (v => fmtAuto(v)), yf = opts.yFmt || (v => fmtAuto(v));
    const g = svgEl('g', { class: 'grid' }, svg);
    const yTicks = log ? (() => { const t = []; for (let e = Math.floor(Math.log10(yMin)); e <= Math.ceil(Math.log10(yMax)); e++) { const v = Math.pow(10, e); if (v >= yMin && v <= yMax) t.push(v); } return t; })() : niceTicks(yMin, yMax, 5);
    yTicks.forEach(v => {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, g);
      const t = svgEl('text', { x: m.l - 10, y: Y(v) + 4, 'text-anchor': 'end' }, svg); t.textContent = yf(v);
    });
    niceTicks(xMin, xMax, 6).forEach(v => {
      const t = svgEl('text', { x: X(v), y: H - m.b + 18, 'text-anchor': 'middle' }, svg); t.textContent = xf(v);
    });
    svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'rgba(226,227,237,0.22)' }, svg);
    if (opts.xLabel) { const t = svgEl('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, svg); t.textContent = opts.xLabel; }
    if (opts.yLabel) { const t = svgEl('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, svg); t.textContent = opts.yLabel; }
    if (opts.band) {
      const b = opts.band; svgEl('rect', { x: X(b.x1), y: m.t, width: Math.max(0, X(b.x2) - X(b.x1)), height: H - m.t - m.b, fill: 'rgba(237,237,243,0.05)' }, svg);
      if (b.label) { const t = svgEl('text', { x: X(b.x1) + 6, y: H - m.b - 8 }, svg); t.textContent = b.label; }
    }
    opts.series.forEach(s => {
      const pts = s.data.filter(d => isFinite(d.y));
      if (!pts.length) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
      svgEl('path', { d, fill: 'none', stroke: s.color || PALETTE.ivory, 'stroke-width': s.width || 1.6, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round' }, svg);
    });
    if (opts.marker && isFinite(opts.marker.x)) {
      const mx = X(clamp(opts.marker.x, xMin, xMax));
      svgEl('line', { x1: mx, x2: mx, y1: m.t, y2: H - m.b, stroke: PALETTE.cobalt, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, svg);
      opts.series.forEach(s => {
        const pts = s.data; let best = pts[0];
        pts.forEach(p => { if (Math.abs(p.x - opts.marker.x) < Math.abs(best.x - opts.marker.x)) best = p; });
        if (best && isFinite(best.y)) svgEl('circle', { cx: X(best.x), cy: Y(best.y), r: 4, fill: PALETTE.cobalt }, svg);
      });
      if (opts.marker.label) { const t = svgEl('text', { x: mx + 6, y: m.t + 12, class: 'lbl-strong' }, svg); t.textContent = opts.marker.label; }
    }
    // Capa de interacción
    const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    const guide = svgEl('line', { y1: m.t, y2: H - m.b, stroke: 'rgba(237,237,243,0.35)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W;
      const xv = xMin + (px - m.l) / (W - m.l - m.r) * (xMax - xMin);
      guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.setAttribute('visibility', 'visible');
      const rows = opts.series.map(s => {
        let best = s.data[0]; s.data.forEach(p => { if (Math.abs(p.x - xv) < Math.abs(best.x - xv)) best = p; });
        return `<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color || PALETTE.ivory};margin-right:6px"></span>${s.name}: <strong>${yf(best.y)}</strong></div>`;
      }).join('');
      tip(`<div style="color:#c3c3cc;margin-bottom:4px">${opts.xLabel || 'x'}: ${xf(xv)}</div>${rows}`, e);
    });
    hit.addEventListener('mouseleave', () => { guide.setAttribute('visibility', 'hidden'); tip(null); });
    return svg;
  }

  /** Barra horizontal apilada. segments: [{label, value, color, note}] */
  function stackedBar(container, segments, opts = {}) {
    const W = 420, H = opts.height || 56;
    container.innerHTML = '';
    const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || 'Desglose' }, container);
    let x = 0;
    segments.forEach(s => {
      const w = Math.max(0, s.value) / total * W;
      if (w <= 0) return;
      const r = svgEl('rect', { x: x, y: 8, width: Math.max(w - 2, 0.5), height: H - 30, fill: s.color, rx: 2 }, svg);
      r.addEventListener('mousemove', e => tip(`<strong>${s.label}</strong><br>${opts.valFmt ? opts.valFmt(s.value) : fmtAuto(s.value)} · ${fmt(100 * s.value / total, 1)} %${s.note ? `<br><span style="color:#c3c3cc">${s.note}</span>` : ''}`, e));
      r.addEventListener('mouseleave', () => tip(null));
      if (w > 30) { const t = svgEl('text', { x: x + 4, y: H - 6 }, svg); t.textContent = `${fmt(100 * s.value / total, 0)} %`; }
      x += w;
    });
    if (opts.legend) {
      opts.legend.innerHTML = segments.filter(s => s.value > 0).map(s => `<span><span class="sw" style="background:${s.color}"></span>${s.label}</span>`).join('');
    }
    return svg;
  }

  /** Barras de flujo de masa (cascada de pérdidas). steps: [{label, value, kind:'stock'|'loss'}] */
  function flowBars(container, steps, opts = {}) {
    const rowH = 32, W = 420, labelW = 150, H = steps.length * rowH + 8;
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Flujo de masa de agua' }, container);
    const max = Math.max(...steps.map(s => s.value), 1e-9);
    steps.forEach((s, i) => {
      const y = i * rowH + 4;
      const t = svgEl('text', { x: 0, y: y + 18 }, svg); t.textContent = s.label; if (s.kind === 'stock') t.setAttribute('class', 'lbl-strong');
      const w = (W - labelW - 64) * s.value / max;
      const color = s.highlight ? PALETTE.cobalt : s.kind === 'loss' ? 'transparent' : PALETTE.ivory;
      const r = svgEl('rect', { x: labelW, y: y + 6, width: Math.max(w, s.value > 0 ? 1 : 0), height: rowH - 14, fill: color, rx: 2,
        stroke: s.kind === 'loss' ? PALETTE.slate : 'none', 'stroke-dasharray': s.kind === 'loss' ? '3 3' : '' }, svg);
      r.addEventListener('mousemove', e => tip(`<strong>${s.label}</strong><br>${fmtAuto(s.value)} kg${s.note ? `<br><span style="color:#c3c3cc">${s.note}</span>` : ''}`, e));
      r.addEventListener('mouseleave', () => tip(null));
      const v = svgEl('text', { x: labelW + w + 8, y: y + 18, class: s.kind === 'stock' ? 'lbl-strong' : '' }, svg);
      v.textContent = `${s.kind === 'loss' ? '−' : ''}${fmtAuto(s.value)} kg`;
    });
    return svg;
  }

  /** Barras agrupadas para comparar escenarios. groups: [{label, values:[...]}], series:[{name,color}] */
  function groupedBars(container, groups, series, opts = {}) {
    const W = 640, H = opts.height || 260, m = { t: 14, r: 10, b: 40, l: 56 };
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || 'Comparación' }, container);
    const max = Math.max(...groups.flatMap(g => g.values).filter(isFinite), 1e-9) * 1.1;
    const Y = v => H - m.b - v / max * (H - m.t - m.b);
    niceTicks(0, max, 4).forEach(v => {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: 'rgba(226,227,237,0.10)' }, svg);
      const t = svgEl('text', { x: m.l - 10, y: Y(v) + 4, 'text-anchor': 'end' }, svg); t.textContent = (opts.yFmt || fmtAuto)(v);
    });
    const gw = (W - m.l - m.r) / groups.length, bw = Math.min(36, (gw - 24) / series.length);
    groups.forEach((g, gi) => {
      const x0 = m.l + gi * gw + (gw - bw * series.length) / 2;
      g.values.forEach((v, si) => {
        const h = Math.max(0, H - m.b - Y(isFinite(v) ? v : 0));
        const r = svgEl('rect', { x: x0 + si * bw + 2, y: H - m.b - h, width: bw - 4, height: h, fill: series[si].color, rx: 2 }, svg);
        r.addEventListener('mousemove', e => tip(`<strong>${g.label}</strong><br>${series[si].name}: ${(opts.yFmt || fmtAuto)(v)}`, e));
        r.addEventListener('mouseleave', () => tip(null));
      });
      const t = svgEl('text', { x: m.l + gi * gw + gw / 2, y: H - m.b + 20, 'text-anchor': 'middle', class: 'lbl-strong' }, svg); t.textContent = g.label;
    });
    svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'rgba(226,227,237,0.22)' }, svg);
    if (opts.legend) opts.legend.innerHTML = series.map(s => `<span><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join('');
    return svg;
  }

  /** Sparkline sencilla en canvas o SVG. */
  function sparkline(container, data, opts = {}) {
    const W = 300, H = opts.height || 56;
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, container);
    if (data.length < 2) return svg;
    const min = opts.min ?? Math.min(...data), max = opts.max ?? Math.max(...data);
    const X = i => i / (data.length - 1) * W, Y = v => H - 3 - (v - min) / ((max - min) || 1) * (H - 6);
    const d = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    svgEl('path', { d: d + `L${W},${H}L0,${H}Z`, fill: 'rgba(237,237,243,0.05)' }, svg);
    svgEl('path', { d, fill: 'none', stroke: opts.color || PALETTE.ivory, 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }, svg);
    return svg;
  }

  root.Ice = { $, $$, clamp, lerp, ease, fmt, fmtAuto, fmtDuration, rng, createStore, tag, cite, toast, TAG_TEXT,
    charts: { lineChart, stackedBar, flowBars, groupedBars, sparkline, tip, PALETTE, svgEl } };
})(window);
