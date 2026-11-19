// Extrae los textos españoles de index.html y simulacion.html (los mismos bloques que traduce js/i18n.js) a es-index.json
// y actualiza en-index.json conservando las traducciones que ya existían (se emparejan por el texto español).
// Los textos nuevos quedan con "" en en-index.json: hay que traducirlos y luego ejecutar `node construir.js`.
// Uso: node extraer.js   (necesita jsdom: npm i jsdom, o JSDOM_PATH=ruta/a/jsdom)
const fs = require('fs'), path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const raiz = path.join(__dirname, '..', '..');
const vistos = new Set(), lista = [];
for (const pagina of ['index.html', 'simulacion.html']) {
  const dom = new JSDOM(fs.readFileSync(path.join(raiz, pagina), 'utf8'));
  const w = dom.window; w.__I18N_EXTRAER = true;
  new Function('window', 'globalThis', fs.readFileSync(path.join(raiz, 'js', 'i18n.js'), 'utf8'))(w, w);
  const I = w.IceI18n, doc = w.document;
  const add = (s) => { s = I.norm(s); if (s && !vistos.has(s)) { vistos.add(s); lista.push(s); } };
  add(doc.title); const meta = doc.querySelector('meta[name="description"]'); if (meta) add(meta.content);
  I.bloques(doc.body).forEach((el) => add(el.innerHTML));
  I.atributos(doc.body).forEach(([, , v]) => add(v));
}

// Traducciones anteriores (español → inglés)
const leer = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); } catch (_) { return {}; } };
const esViejo = leer('es-index.json'), enViejo = leer('en-index.json'), previas = {};
for (const k in esViejo) if (enViejo[k]) previas[esViejo[k]] = enViejo[k];

const es = {}, en = {}; let nuevos = 0;
lista.forEach((s, i) => { const k = String(i + 1); es[k] = s; en[k] = previas[s] || ''; if (!previas[s]) nuevos++; });
fs.writeFileSync(path.join(__dirname, 'es-index.json'), JSON.stringify(es, null, 1));
fs.writeFileSync(path.join(__dirname, 'en-index.json'), JSON.stringify(en, null, 1));
console.log(`${lista.length} textos · ${nuevos} sin traducir`);
for (const k in en) if (!en[k]) console.log(`  ${k}: ${es[k].slice(0, 110)}`);
