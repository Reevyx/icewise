// Extrae los textos españoles de index.html (los mismos bloques que traduce js/i18n.js) a es-index.json.
// Uso: node extraer.js   (necesita jsdom: npm i jsdom). Después se traduce en-index.json con las mismas claves.
const fs = require('fs'), path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const raiz = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const dom = new JSDOM(html);
const w = dom.window; w.__I18N_EXTRAER = true;
new Function('window', 'globalThis', fs.readFileSync(path.join(raiz, 'js', 'i18n.js'), 'utf8'))(w, w);
const I = w.IceI18n, doc = w.document, vistos = new Set(), lista = [];
const add = (s) => { s = I.norm(s); if (s && !vistos.has(s)) { vistos.add(s); lista.push(s); } };
add(doc.title); add(doc.querySelector('meta[name="description"]').content);
I.bloques(doc.body).forEach((el) => add(el.innerHTML));
I.atributos(doc.body).forEach(([, , v]) => add(v));
const obj = {}; lista.forEach((s, i) => { obj[String(i + 1)] = s; });
fs.writeFileSync(path.join(__dirname, 'es-index.json'), JSON.stringify(obj, null, 1));
console.log(lista.length + ' textos');
