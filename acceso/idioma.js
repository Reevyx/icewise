// Idioma de la pantalla de acceso para la Luna 3D de la portada (js/hero-moon.js usa window.L(es, en))
(function () {
  var en = true;
  try { en = localStorage.getItem('icewise-lang') !== 'es'; } catch (_) {}
  window.L = function (es, eng) { return en ? eng : es; };
})();
