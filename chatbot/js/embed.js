// Dentro de la web de ICEWISE el chat se carga en un panel (iframe): modo "incrustado", ocupa todo el panel.
if (window.self !== window.top || /[?&]embed=1/.test(location.search)) document.documentElement.classList.add('embed');
