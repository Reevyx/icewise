/* =========================================================================
   ASTRA en la web de ICEWISE: botón flotante que abre el chat en un panel.
   El chat vive en chatbot/index.html y se carga dentro de un iframe (así sus estilos
   no afectan al resto de la página). Se carga solo la primera vez que se abre.
   ========================================================================= */
(function () {
  const BASE = (document.currentScript && document.currentScript.src) ? new URL('.', document.currentScript.src).href : 'chatbot/';

  function build() {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'astra-fab'; btn.id = 'astra-fab';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'astra-panel');
    btn.innerHTML =
      '<svg class="ic-chat" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4" stroke-linecap="round"/></svg>' +
      '<svg class="ic-close" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '<span class="astra-fab-t">ASTRA</span>';
    btn.title = 'Abrir el asistente ASTRA'; btn.setAttribute('aria-label', 'Abrir el asistente ASTRA');

    const panel = document.createElement('div');
    panel.className = 'astra-panel'; panel.id = 'astra-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Asistente ASTRA');
    const frame = document.createElement('iframe');
    frame.title = 'Asistente ASTRA'; frame.setAttribute('allow', 'microphone; autoplay');
    panel.appendChild(frame);

    document.body.append(panel, btn);

    const open = (on) => {
      if (on && !frame.src) frame.src = BASE + 'index.html?embed=1';
      panel.hidden = !on; btn.setAttribute('aria-expanded', String(on)); btn.classList.toggle('is-open', on);
      const t = on ? 'Cerrar el asistente ASTRA' : 'Abrir el asistente ASTRA';
      btn.title = t; btn.setAttribute('aria-label', t);
      if (on) setTimeout(() => { try { frame.contentWindow.focus(); const i = frame.contentDocument && frame.contentDocument.getElementById('input-chat'); if (i) i.focus(); } catch (_) { frame.focus(); } }, 120);
    };
    btn.addEventListener('click', () => open(panel.hidden));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
    // Esc también funciona con el foco dentro del chat
    frame.addEventListener('load', () => {
      try { frame.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open(false); btn.focus(); } }); } catch (_) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
