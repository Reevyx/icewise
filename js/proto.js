/* =========================================================================
   ICEWISE — Conexión con el prototipo físico (Web Serial, Chrome/Edge)
   El firmware envía una línea JSON por segundo a 115200 baudios.
   ========================================================================= */
(function () {
  'use strict';
  const { $, fmt, toast } = Ice;
  let port = null, reader = null, active = false;

  const MAP = { state: ['Estado', '', null], bat: ['Batería', '%', 0], v: ['Tensión', 'V', 2], i: ['Corriente', 'mA', 0], t: ['Temperatura muestra', '°C', 1],
    dist: ['Distancia a obstáculo', 'cm', 0], moist: ['Humedad del lecho', '%', 0], drill: ['Avance del taladro', 'mm', 0], mass: ['Masa recolectada', 'g', 1], tilt: ['Inclinación', '°', 1], wh: ['Energía usada', 'Wh', 3] };

  function status(msg, on) {
    $('#proto-status').innerHTML = `<span class="status-dot ${on ? 'live' : 'off'}"></span>${msg}`;
    $('#serial-connect').textContent = on ? 'Desconectar prototipo' : 'Conectar prototipo (USB)';
  }
  function render(j) {
    if (j.decision) { toast(`Prototipo: decisión ${j.decision} (humedad ${j.moistMean} ± ${j.moistSd} %)`); return; }
    if (j.report) { toast(`Prototipo: muestra ${j.sample_g} g · agua evaporada ${j.water_out_g} g · ${j.energy_wh} Wh`); return; }
    if (!j.state) return;
    $('#proto-values').innerHTML = Object.entries(j).filter(([k]) => MAP[k]).map(([k, v]) => {
      const [l, u, d] = MAP[k];
      return `<div class="meter-row"><span class="k">${l}</span><span class="v">${d === null ? v : fmt(+v, d)} ${u}</span></div>`;
    }).join('') + '<p class="caption">Datos reales del prototipo (sensores en arena, no en la Luna).</p>';
  }
  async function connect() {
    if (active) { active = false; try { await reader.cancel(); } catch (_) {} try { await port.close(); } catch (_) {} status('Desconectado', false); return; }
    if (!('serial' in navigator)) { toast('Este navegador no admite Web Serial. Usa Chrome o Edge de escritorio.'); status('No disponible en este navegador', false); return; }
    try {
      port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 });
      active = true; status('Conectado · recibiendo datos', true);
      const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable).catch(() => {}); reader = dec.readable.getReader();
      let buf = '';
      while (active) {
        const { value, done } = await reader.read(); if (done) break; buf += value; let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('{')) { try { render(JSON.parse(line)); } catch (_) {} } }
      }
    } catch (e) { if (e && e.name !== 'NotFoundError') toast('No se pudo abrir el puerto: ' + (e.message || e)); active = false; status('Desconectado', false); }
  }
  window.IceProto = { init() { const b = $('#serial-connect'); if (b) b.addEventListener('click', connect); } };
})();
