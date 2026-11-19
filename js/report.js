/* =========================================================================
   ICEWISE — Informe de viabilidad en PDF (desde el dashboard)
   -------------------------------------------------------------------------
   Genera un PDF A4 en el propio navegador (jsPDF 2.5.2, MIT, en assets/vendor; se carga solo al pulsar
   el botón y funciona sin internet). Recoge el escenario, las 15 variables con su procedencia, los
   resultados, tres gráficos del tablero y los avisos del modelo. Todo lo calculado se marca como simulado.
   ========================================================================= */
(function () {
  'use strict';
  const M = window.IceModel;
  const { fmt, fmtAuto, fmtDuration } = Ice;
  const SRC = (document.currentScript && document.currentScript.src) ? new URL('../assets/vendor/jspdf-2.5.2.umd.min.js', document.currentScript.src).href : 'assets/vendor/jspdf-2.5.2.umd.min.js';

  // Las fuentes estándar del PDF solo tienen el juego de caracteres occidental: se sustituyen los símbolos que faltan
  const MAP = { '−': '-', '≈': '~', '≤': '<=', '≥': '>=', '→': '->', '↑': '+', '↓': '-', '∫': 'int ', 'ρ': 'rho', 'η': 'eta', 'σ': 'sigma', 'Δ': 'D',
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '⁻': '-', '·': '·', '…': '...', '’': "'", '‘': "'", ' ': ' ', ' ': ' ' };
  const clean = (s) => String(s).replace(/[^\x00-\xff–—“”€•]/g, (c) => MAP[c] !== undefined ? MAP[c] : '');

  function loadLib() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    return new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = SRC; s.onload = () => window.jspdf ? ok(window.jspdf) : ko(new Error('jsPDF'));
      s.onerror = () => ko(new Error('jsPDF')); document.head.appendChild(s);
    });
  }

  // Gráfico SVG del tablero → imagen PNG con fondo oscuro (copia los estilos calculados, porque el SVG suelto no ve la hoja CSS)
  const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'visibility'];
  function svgToPng(svg, widthPx) {
    return new Promise((ok) => {
      if (!svg) { ok(null); return; }
      const vb = (svg.getAttribute('viewBox') || '0 0 600 300').split(/\s+/).map(Number), w = vb[2], h = vb[3];
      const clone = svg.cloneNode(true), src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
      src.forEach((el, i) => {
        const cs = getComputedStyle(el), d = dst[i];
        PROPS.forEach(p => { const v = cs.getPropertyValue(p); if (v && !(p === 'visibility' && v === 'visible')) d.style.setProperty(p, v); });
        if (d.tagName === 'text') d.style.setProperty('font-family', 'Helvetica, Arial, sans-serif');
      });
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w); clone.setAttribute('height', h);
      const img = new Image(), scale = widthPx / w;
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const g = c.getContext('2d'); g.fillStyle = '#1e1e2a'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        try { ok({ url: c.toDataURL('image/png'), ratio: h / w }); } catch (_) { ok(null); }
      };
      img.onerror = () => ok(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
  }

  async function generar(btn) {
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = L('Preparando el informe…', 'Preparing the report…'); }
    try {
      const { jsPDF } = await loadLib();
      const params = IceLab.getParams(), r = M.run(params), base = M.run(M.SCENARIOS.intermedio.values);
      const scen = IceLab.getScenario ? IceLab.getScenario() : null;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const PW = 210, PH = 297, MX = 16, CW = PW - MX * 2;
      const C = { onyx: [23, 23, 33], card: [30, 30, 42], ivory: [237, 237, 243], ash: [112, 112, 125], ink: [30, 30, 42], cobalt: [82, 102, 235], line: [222, 223, 232], wash: [242, 243, 252] };
      const txt = (s, x, y, o) => doc.text(clean(s), x, y, o);
      const wrap = (s, w) => doc.splitTextToSize(clean(s), w);
      const fecha = new Intl.DateTimeFormat(L('es-ES', 'en-GB'), { dateStyle: 'long' }).format(new Date());
      let y = 0, page = 1;

      const footer = () => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.ash);
        txt(L('ICEWISE · propuesta escolar de ingeniería. Resultados simulados con el modelo de la web; no son mediciones reales.',
          'ICEWISE · school engineering proposal. Results simulated with the website model; they are not real measurements.'), MX, PH - 9);
        txt(`${page}`, PW - MX, PH - 9, { align: 'right' });
      };
      const need = (h) => { if (y + h > PH - 18) { footer(); doc.addPage(); page++; y = 18; } };
      const heading = (s) => { need(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.ink); txt(s, MX, y); doc.setDrawColor(...C.cobalt); doc.setLineWidth(0.6); doc.line(MX, y + 2.2, MX + 14, y + 2.2); y += 8; };

      // ---- Portada del informe ----
      doc.setFillColor(...C.onyx); doc.rect(0, 0, PW, 58, 'F');
      doc.setFillColor(...C.cobalt); doc.rect(0, 58, PW, 1.2, 'F');
      doc.setTextColor(...C.ivory); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt('ICEWISE', MX, 18);
      doc.setFontSize(22); txt(L('Informe de viabilidad', 'Feasibility report'), MX, 33);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(195, 195, 204);
      txt(L('Extracción de agua del hielo lunar · borde del cráter Shackleton', 'Water extraction from lunar ice · rim of Shackleton crater'), MX, 41);
      txt(`${fecha} · ${scen ? L('Escenario: ', 'Scenario: ') + M.SCENARIOS[scen].label : L('Parámetros personalizados', 'Custom parameters')}`, MX, 48);
      y = 72;

      // ---- Resultados clave ----
      const tiles = [
        [L('Agua purificada por lote', 'Purified water per batch'), `${fmtAuto(r.mass.purified)} L`],
        [L('Energía por litro', 'Energy per litre'), `${fmt(r.specific, 2)} kWh/L`],
        [L('Energía total del lote', 'Total batch energy'), `${fmt(r.kWh.total, 1)} kWh`],
        [L('Tiempo de horno', 'Oven time'), fmtDuration(r.time.hours)]
      ];
      const tw = (CW - 3 * 4) / 4;
      tiles.forEach(([l, v], i) => {
        const x = MX + i * (tw + 4);
        if (i === 0) doc.setFillColor(...C.cobalt); else doc.setFillColor(...C.wash);
        doc.roundedRect(x, y, tw, 24, 2.5, 2.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...(i === 0 ? [226, 230, 255] : C.ash));
        doc.text(wrap(l, tw - 8), x + 4, y + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...(i === 0 ? [255, 255, 255] : C.ink));
        txt(v, x + 4, y + 19);
      });
      y += 32;
      const resumen = (document.getElementById('lab-summary') || {}).textContent || '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.ink);
      const rl = wrap(resumen.trim(), CW); doc.text(rl, MX, y); y += rl.length * 4.6 + 6;

      // ---- Gráficos ----
      const charts = [
        ['#chart-flow svg', L('¿Adónde va el hielo? (kg por lote)', 'Where does the ice go? (kg per batch)')],
        ['#chart-energy svg', L('¿En qué se gasta la energía?', 'Where does the energy go?')],
        ['#chart-sweep svg', L('Energía por litro según la variable elegida en «Si cambia…»', 'Energy per litre against the variable chosen in "If this changes…"')]
      ];
      for (const [sel, title] of charts) {
        const im = await svgToPng(document.querySelector(sel), 1400);
        if (!im) continue;
        let iw = CW - 8, ih = iw * im.ratio;
        if (ih > 88) { ih = 88; iw = ih / im.ratio; }                       // gráficos altos: se encogen y se centran
        need(ih + 16);
        heading(title);
        doc.setFillColor(...C.card); doc.roundedRect(MX, y - 2, CW, ih + 6, 2.5, 2.5, 'F');
        doc.addImage(im.url, 'PNG', MX + (CW - iw) / 2, y + 1, iw, ih, undefined, 'FAST');
        y += ih + 10;
        if (sel === '#chart-energy svg') {
          const e = r.energy, k = v => v / 3.6e6, tot = e.total / 3.6e6 || 1;
          const parts = [[L('Calentar regolito', 'Heating regolith'), k(e.reg)], [L('Sublimar hielo', 'Subliming ice'), k(e.latent)], [L('Calentar hielo y vapor', 'Heating ice and vapour'), k(e.iceSens + e.vapor)],
            [L('Pérdidas del calentador', 'Heater losses'), k(e.heatLoss)], [L('Sistema en espera', 'System on standby'), k(e.base)], [L('Excavación', 'Excavation'), k(e.exc)], [L('Fundir y purificar', 'Melting and purifying'), k(e.purif)]];
          doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.ink);
          const line = parts.filter(p => p[1] > 0).map(p => `${p[0]}: ${fmt(p[1], 2)} kWh (${fmt(p[1] / tot * 100, 0)}${L(' %', '%')})`).join('   ·   ');
          const ll = wrap(line, CW); need(ll.length * 4 + 4); doc.text(ll, MX, y); y += ll.length * 4 + 6;
        }
      }

      // ---- Tablas ----
      const table = (cols, rows, widths) => {
        const rowH = 7;
        need(rowH * 2);
        doc.setFillColor(...C.onyx); doc.rect(MX, y, CW, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.ivory);
        let x = MX + 3; cols.forEach((c, i) => { txt(c, x, y + 4.8); x += widths[i]; });
        y += rowH;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.ink);
        rows.forEach((row, ri) => {
          const lines = row.map((c, i) => wrap(c, widths[i] - 5)), h = Math.max(...lines.map(l => l.length)) * 3.8 + 3.4;
          if (y + h > PH - 18) { footer(); doc.addPage(); page++; y = 18; }
          if (ri % 2) { doc.setFillColor(...C.wash); doc.rect(MX, y, CW, h, 'F'); }
          let xx = MX + 3; lines.forEach((l, i) => { doc.text(l, xx, y + 4.6); xx += widths[i]; });
          doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(MX, y + h, MX + CW, y + h);
          y += h;
        });
        y += 8;
      };
      const unitFmt = (p, v) => { const d = p.step < 0.01 ? 3 : p.step < 0.1 ? 2 : p.step < 1 ? 1 : 0; return `${fmt(v, d)}${p.unit ? ' ' + p.unit : ''}`; };
      heading(L('Las 15 variables usadas', 'The 15 variables used'));
      table([L('Grupo', 'Group'), L('Variable', 'Variable'), L('Valor', 'Value'), L('Procedencia', 'Source')],
        M.PARAMS.map(p => [p.group, p.label, unitFmt(p, params[p.key]), Ice.TAG_TEXT[p.tag] || p.tag]), [30, 74, 36, 38]);

      const pc = L(' %', '%'), vs = (v, b) => !isFinite(v) || !isFinite(b) || b === 0 ? '—' : Math.abs((v - b) / b) < 0.005 ? L('igual', 'same') : `${v > b ? '+' : '-'}${fmt(Math.abs((v - b) / b) * 100, 0)}${pc}`;
      heading(L('Resultados (simulados)', 'Results (simulated)'));
      table([L('Resultado', 'Result'), L('Valor', 'Value'), L('Frente a LCROSS', 'Vs. LCROSS')], [
        [L('Agua purificada por lote', 'Purified water per batch'), `${fmtAuto(r.mass.purified)} L`, vs(r.mass.purified, base.mass.purified)],
        [L('Agua en la trampa fría', 'Water in the cold trap'), `${fmtAuto(r.mass.recovered)} L`, vs(r.mass.recovered, base.mass.recovered)],
        [L('Hielo en el suelo extraído', 'Ice in the extracted soil'), `${fmtAuto(r.mass.ice)} kg`, vs(r.mass.ice, base.mass.ice)],
        [L('Suelo procesado', 'Soil processed'), `${fmt(r.mass.wet, 0)} kg`, vs(r.mass.wet, base.mass.wet)],
        [L('Recuperación del hielo', 'Ice recovery'), `${fmt(r.recoveryOverall * 100, 1)}${pc}`, vs(r.recoveryOverall, base.recoveryOverall)],
        [L('Energía por litro', 'Energy per litre'), `${fmt(r.specific, 2)} kWh/L`, vs(r.specific, base.specific)],
        [L('Energía total del lote', 'Total batch energy'), `${fmt(r.kWh.total, 1)} kWh`, vs(r.kWh.total, base.kWh.total)],
        [L('Tiempo de horno', 'Oven time'), fmtDuration(r.time.hours), vs(r.time.hours, base.time.hours)],
        [L('Mínimo físico por litro (solo calentar y sublimar)', 'Physical minimum per litre (heating and subliming only)'), `${fmt(r.thermoMin, 2)} kWh/L`, vs(r.thermoMin, base.thermoMin)]
      ], [92, 44, 42]);

      heading(L('Avisos del modelo', 'Model warnings'));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.ink);
      r.warnings.forEach(w => { const l = wrap('•  ' + w, CW - 4); need(l.length * 4.2 + 2); doc.text(l, MX + 2, y); y += l.length * 4.2 + 2.5; });
      y += 4;
      need(22);
      doc.setFillColor(...C.wash); doc.roundedRect(MX, y, CW, 18, 2.5, 2.5, 'F');
      doc.setFontSize(8.5); doc.setTextColor(...C.ash);
      doc.text(wrap(L('Cómo leer este informe: los resultados salen del modelo de balance de masa y energía de ICEWISE con propiedades térmicas documentadas del regolito (Hayne et al. 2017) y datos medidos por LCROSS. Las variables marcadas como «Supuesto» son decisiones de diseño. El agua es de uso técnico: para beberla haría falta un análisis de laboratorio real.',
        'How to read this report: the results come from the ICEWISE mass and energy balance model, using documented regolith thermal properties (Hayne et al. 2017) and data measured by LCROSS. Variables marked "Assumption" are design choices. The water is for technical use: drinking it would require a real laboratory analysis.'), CW - 8), MX + 4, y + 5.5);
      footer();

      const dia = new Date().toISOString().slice(0, 10);
      doc.save(L(`icewise-informe-viabilidad-${dia}.pdf`, `icewise-feasibility-report-${dia}.pdf`));
      Ice.toast(L('Informe PDF descargado.', 'PDF report downloaded.'));
    } catch (e) {
      console.warn(e);
      Ice.toast(L('No se pudo crear el PDF. Recarga la página e inténtalo de nuevo.', 'The PDF could not be created. Reload the page and try again.'));
    } finally {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; }
    }
  }

  window.IceReport = { generar };
})();
