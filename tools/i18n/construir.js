// Une es-index.json y en-index.json en js/i18n-en.js ({ "texto español": "English text" }).
// Comprueba que cada traducción conserve las mismas etiquetas HTML (ids, clases…) que el original.
const fs = require('fs'), path = require('path');
const es = require('./es-index.json'), en = require('./en-index.json');
const etiquetas = (s) => (s.match(/<[^>]+>/g) || []).join('');
const dic = {}; let errores = 0;
for (const k of Object.keys(es)) {
  if (!(k in en)) { console.log('Falta la traducción', k, es[k].slice(0, 60)); errores++; continue; }
  if (etiquetas(es[k]) !== etiquetas(en[k])) { console.log('Etiquetas distintas en', k, '\n  es:', es[k].slice(0, 90), '\n  en:', en[k].slice(0, 90)); errores++; }
  if (es[k] !== en[k]) dic[es[k]] = en[k];
}
for (const k of Object.keys(en)) if (!(k in es)) { console.log('Sobra la traducción', k); errores++; }
if (errores) { console.log(errores + ' errores: no se genera el archivo'); process.exit(1); }
const salida = '/* Generado por tools/i18n/construir.js — no editar a mano: edita tools/i18n/en-index.json */\nwindow.ICEWISE_EN = ' + JSON.stringify(dic, null, 0).replace(/","/g, '",\n"') + ';\n';
fs.writeFileSync(path.join(__dirname, '..', '..', 'js', 'i18n-en.js'), salida);
console.log(Object.keys(dic).length + ' traducciones → js/i18n-en.js');
