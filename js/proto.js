/* =========================================================================
   ICEWISE — Conexión con el prototipo físico (Web Serial, Chrome/Edge)
   El firmware envía una línea JSON por segundo a 115200 baudios.
   ========================================================================= */
(function () {
  'use strict';
  const { $, fmt, toast } = Ice;
  let port = null, reader = null, active = false;

  const MAP = { state: [L('Estado', 'State'), '', null], bat: [L('Batería', 'Battery'), '%', 0], v: [L('Tensión', 'Voltage'), 'V', 2], i: [L('Corriente', 'Current'), 'mA', 0], t: [L('Temperatura muestra', 'Sample temperature'), '°C', 1],
    dist: [L('Distancia a obstáculo', 'Distance to obstacle'), 'cm', 0], moist: [L('Humedad del lecho', 'Bed moisture'), '%', 0], drill: [L('Avance del taladro', 'Drill progress'), 'mm', 0], mass: [L('Masa recolectada', 'Collected mass'), 'g', 1], tilt: [L('Inclinación', 'Tilt'), '°', 1], wh: [L('Energía usada', 'Energy used'), 'Wh', 3] };

  function status(msg, on) {
    $('#proto-status').innerHTML = `<span class="status-dot ${on ? 'live' : 'off'}"></span>${msg}`;
    $('#serial-connect').textContent = on ? L('Desconectar prototipo', 'Disconnect prototype') : L('Conectar prototipo (USB)', 'Connect prototype (USB)');
  }
  function render(j) {
    if (j.decision) { toast(L(`Prototipo: decisión ${j.decision} (humedad ${j.moistMean} ± ${j.moistSd} %)`, `Prototype: decision ${j.decision} (moisture ${j.moistMean} ± ${j.moistSd}%)`)); return; }
    if (j.report) { toast(L(`Prototipo: muestra ${j.sample_g} g · agua evaporada ${j.water_out_g} g · ${j.energy_wh} Wh`, `Prototype: sample ${j.sample_g} g · water evaporated ${j.water_out_g} g · ${j.energy_wh} Wh`)); return; }
    if (!j.state) return;
    $('#proto-values').innerHTML = Object.entries(j).filter(([k]) => MAP[k]).map(([k, v]) => {
      const [l, u, d] = MAP[k];
      return `<div class="meter-row"><span class="k">${l}</span><span class="v">${d === null ? v : fmt(+v, d)} ${u}</span></div>`;
    }).join('') + `<p class="caption">${L('Datos reales del prototipo (sensores en arena, no en la Luna).', 'Real prototype data (sensors in sand, not on the Moon).')}</p>`;
  }
  async function connect() {
    if (active) { active = false; try { await reader.cancel(); } catch (_) {} try { await port.close(); } catch (_) {} status(L('Desconectado', 'Disconnected'), false); return; }
    if (!('serial' in navigator)) { toast(L('Este navegador no admite Web Serial. Usa Chrome o Edge de escritorio.', 'This browser does not support Web Serial. Use desktop Chrome or Edge.')); status(L('No disponible en este navegador', 'Not available in this browser'), false); return; }
    try {
      port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 });
      active = true; status(L('Conectado · recibiendo datos', 'Connected · receiving data'), true);
      const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable).catch(() => {}); reader = dec.readable.getReader();
      let buf = '';
      while (active) {
        const { value, done } = await reader.read(); if (done) break; buf += value; let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('{')) { try { render(JSON.parse(line)); } catch (_) {} } }
      }
    } catch (e) { if (e && e.name !== 'NotFoundError') toast(L('No se pudo abrir el puerto: ', 'Could not open the port: ') + (e.message || e)); active = false; status(L('Desconectado', 'Disconnected'), false); }
  }
  window.IceProto = { init() { const b = $('#serial-connect'); if (b) b.addEventListener('click', connect); } };
})();
