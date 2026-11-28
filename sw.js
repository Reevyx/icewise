// ============================================================================
// KILLA · service worker de acceso
// ----------------------------------------------------------------------------
// Toda la web real está cifrada en x/. Este service worker:
//   · sin llave → cualquier página muestra la pantalla de acceso (index.html publicado);
//   · con llave (la entrega el servidor tras reconocer tu rostro o el PIN del día) → descifra cada
//     archivo al vuelo y lo sirve como si fuera normal. Los vídeos se descifran por bloques.
// La llave vive solo en este navegador y caduca (8 h). Para salir antes: ?salir en la dirección.
// Lo descifrado nunca se guarda en disco. Lo que sí se guarda (Cache Storage) son los archivos CIFRADOS, por
// versión: así la web abre al instante en las visitas siguientes. Tras entrar, una cola los va descargando en
// segundo plano, de uno en uno y con prioridad baja (precarga.json): primero lo de la página donde está la
// persona, luego la simulación y después el resto; se detiene mientras la página está pidiendo algo.
// ============================================================================
'use strict';
const BASE = new URL('./', self.location).pathname;                     // p. ej. /icewise/
const PUBLICO = [/^acceso\//, /^sw\.js$/, /^sello\.json$/, /^x\//, /^robots\.txt$/, /^favicon\.ico$/];
const CAB = 25;
const TIPOS = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', wasm: 'application/wasm', woff2: 'font/woff2',
  woff: 'font/woff', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', gz: 'application/gzip', f32: 'application/octet-stream', csv: 'text/csv; charset=utf-8',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const PREFIJO_CACHE = 'icewise-x-';
async function cacheVersion() {                     // caché de la versión publicada; borra las de versiones anteriores
  const s = await leerSello(); if (!s) return null;
  const nombre = PREFIJO_CACHE + s.v;
  if (!cacheVersion.limpia) { cacheVersion.limpia = true; (await caches.keys()).filter((k) => k.startsWith(PREFIJO_CACHE) && k !== nombre).forEach((k) => caches.delete(k)); }
  return caches.open(nombre);
}

// ---------- llave (IndexedDB del service worker) ----------
let llave = null, llaveVer = null, llaveExp = 0, sello = null, selloT = 0;
const db = () => new Promise((ok, ko) => { const r = indexedDB.open('icewise-acceso', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
async function guardar(v) { const d = await db(); await new Promise((ok, ko) => { const t = d.transaction('k', 'readwrite'); v ? t.objectStore('k').put(v, 'llave') : t.objectStore('k').delete('llave'); t.oncomplete = ok; t.onerror = () => ko(t.error); }); }
async function leer() { const d = await db(); return new Promise((ok) => { const r = d.transaction('k').objectStore('k').get('llave'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); }
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function ponerLlave(v) {
  if (!v) { llave = null; llaveVer = null; llaveExp = 0; return; }
  llave = await crypto.subtle.importKey('raw', b64(v.k), 'AES-GCM', false, ['decrypt']);
  llaveVer = v.v; llaveExp = v.exp;
}
async function salir() { await ponerLlave(null); await guardar(null); }
async function hayLlave() {
  if (!llave) { const v = await leer(); if (v) await ponerLlave(v); }
  if (llave && Date.now() > llaveExp) { await salir(); return false; }
  if (!llave) return false;
  const s = await leerSello();
  if (!s || s.v !== llaveVer) { await salir(); return false; }          // se publicó una versión nueva: hay que volver a entrar
  return true;
}
async function leerSello() {
  if (sello && Date.now() - selloT < 60000) return sello;
  let r = null;
  try { r = await fetch(BASE + 'sello.json', { cache: 'no-cache' }); if (r.ok) { const copia = r.clone(); caches.open('icewise-sello').then((c) => c.put(BASE + 'sello.json', copia)).catch(() => {}); } } catch (_) {}
  // sin conexión (wifi que se cae): se usa la última copia guardada para no cerrar la sesión
  if (!r || !r.ok) { const c = await caches.open('icewise-sello').catch(() => null); r = c && await c.match(BASE + 'sello.json'); if (!r) return sello; }
  try { sello = await r.json(); sello.salB = b64(sello.sal); selloT = Date.now(); } catch (_) {}
  return sello;
}

self.addEventListener('message', (e) => {
  const m = e.data || {}, puerto = e.ports && e.ports[0];
  const responder = (r) => puerto && puerto.postMessage(r);
  if (m.tipo === 'llave' && typeof m.k === 'string' && typeof m.v === 'string' && m.exp > Date.now()) {
    e.waitUntil(ponerLlave({ k: m.k, v: m.v, exp: m.exp }).then(() => guardar({ k: m.k, v: m.v, exp: m.exp })).then(() => responder({ ok: true }), () => responder({ ok: false })));
  } else if (m.tipo === 'salir') e.waitUntil(salir().then(() => responder({ ok: true })));
  else if (m.tipo === 'estado') e.waitUntil(hayLlave().then((ok) => responder({ ok })));
  else if (m.tipo === 'pagina' && /^[1-9]$/.test(String(m.n))) { paginaActual = String(m.n); responder({ ok: true }); }
  else if (m.tipo === 'precargar') { if (/^[1-9]$/.test(String(m.pagina))) paginaActual = String(m.pagina); e.waitUntil(precargar().then((r) => responder({ ok: true, estado: r }), () => responder({ ok: false }))); }
});

// ---------- precarga en segundo plano ----------
// Orden: primero lo de la página donde está la persona, luego la simulación (página 6) y después el resto.
// Los archivos grandes (vídeos) se bajan en piezas de 4 MB: entre pieza y pieza, si la página pide algo,
// la precarga espera; y si la persona cambia de página, pasa a lo de la página nueva.
let activos = 0, precargando = null, paginaActual = '1';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const GRANDE = 8 * 1024 * 1024, PIEZA = 4 * 1024 * 1024;
const urlPieza = (url, i) => url + '?pieza=' + i;
async function piezaQueFalta(cache, url, tam) {                   // -1 si el archivo ya está entero en el disco
  if (await cache.match(url)) return -1;
  for (let i = 0; i * PIEZA < tam; i++) if (!(await cache.match(urlPieza(url, i)))) return i;
  return -1;
}
async function bajarPieza(cache, url, i, tam) {
  const desde = i * PIEZA, hasta = Math.min(tam, desde + PIEZA) - 1;
  const r = await fetch(url, { cache: 'no-store', priority: 'low', headers: { Range: `bytes=${desde}-${hasta}` } });
  if (r.status === 206) await cache.put(urlPieza(url, i), new Response(await r.arrayBuffer()));
  else if (r.ok) await cache.put(url, r);                            // el servidor ignoró el Range: se guarda entero
  else throw new Error('HTTP ' + r.status);
}
function precargar() {
  if (precargando) return precargando;
  precargando = (async () => {
    if (!(await hayLlave())) return 'sin-llave';
    let lista;
    try { lista = await (await servir(new Request(BASE + 'precarga.json'), 'precarga.json')).json(); } catch (_) { return 'sin-lista'; }
    if (Array.isArray(lista)) lista = { orden: lista, paginas: {}, tam: {} };
    const cache = await cacheVersion(); if (!cache) return 'sin-red';
    const inicio = Date.now(), hechos = new Set();
    const siguiente = () => [...(lista.paginas[paginaActual] || []), ...(lista.paginas['6'] || []), ...lista.orden].find((r) => !hechos.has(r));
    for (let ruta = siguiente(); ruta; ruta = siguiente()) {
      if (Date.now() - inicio > 4 * 60e3) return 'sigue';            // el navegador corta los trabajos largos: la página la vuelve a pedir
      while (activos > 0) await pausa(400);                            // la página está cargando algo: primero lo suyo
      const url = BASE + 'x/' + await nombreDe(ruta), tam = lista.tam[ruta] || 0;
      try {
        if (tam > GRANDE) {                                            // de pieza en pieza (y se vuelve a elegir qué sigue)
          const i = await piezaQueFalta(cache, url, tam);
          if (i < 0) hechos.add(ruta); else await bajarPieza(cache, url, i, tam);
        } else {
          if (!(await cache.match(url))) await descargar(url, 'low');
          if (!(await cache.match(url))) return 'sin-red';             // no se pudo bajar: se reintenta más tarde
          hechos.add(ruta);
        }
      } catch (_) { return 'sin-red'; }
      await pausa(120);
    }
    return 'completa';
  })().finally(() => { precargando = null; });
  return precargando;
}

// ---------- descifrado ----------
async function nombreDe(ruta) {
  const s = await leerSello(), r = new TextEncoder().encode(ruta), a = new Uint8Array(s.salB.length + r.length);
  a.set(s.salB, 0); a.set(r, s.salB.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', a));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
// Descarga completa de un archivo cifrado a la caché (una sola vez aunque se pida a la vez desde varios sitios)
const enCurso = new Map();
function descargar(url, prioridad) {
  if (!enCurso.has(url)) enCurso.set(url, (async () => {
    const cache = await cacheVersion(); if (!cache || await cache.match(url)) return;
    const r = await fetch(url, { cache: 'no-store', priority: prioridad || 'auto' });
    if (r.ok && r.status === 200) await cache.put(url, r);
  })().catch(() => {}).finally(() => enCurso.delete(url)));
  return enCurso.get(url);
}
// Archivo que la página lee entero (script, estilo, imagen, modelo): una sola petición. Se baja completo al disco y
// se sirve desde ahí; si resulta ser grande (vídeo, modelo de voz), se corta y se lee por trozos.
async function traerEntero(url) {
  const cache = await cacheVersion(); if (!cache) return;
  if (await cache.match(url)) return;
  if (enCurso.has(url)) { await enCurso.get(url); return; }
  const corta = new AbortController();
  const p = (async () => {
    const r = await fetch(url, { cache: 'no-store', priority: 'high', signal: corta.signal });
    if (!r.ok || r.status !== 200) return;
    if (+(r.headers.get('Content-Length') || 0) > GRANDE) { corta.abort(); return; }
    await cache.put(url, r);
  })().catch(() => {}).finally(() => enCurso.delete(url));
  enCurso.set(url, p); await p;
}
async function bajar(url, desde, hasta) {          // trozo [desde, hasta] del archivo cifrado
  const cache = await cacheVersion(), guardado = cache && await cache.match(url);
  if (guardado) {                                   // del disco: solo se lee el trozo pedido
    const b = await guardado.blob();
    return new Uint8Array(await b.slice(desde, hasta + 1).arrayBuffer());
  }
  if (cache) {                                      // ¿está en piezas (archivo grande precargado)?
    const p0 = Math.floor(desde / PIEZA), p1 = Math.floor(hasta / PIEZA), partes = [];
    for (let i = p0; i <= p1; i++) { const r = await cache.match(urlPieza(url, i)); if (!r) break; partes.push(await r.blob()); }
    if (partes.length === p1 - p0 + 1) {
      const o = desde - p0 * PIEZA;
      return new Uint8Array(await new Blob(partes).slice(o, o + hasta - desde + 1).arrayBuffer());
    }
  }
  const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta}` } });
  if (r.status === 206) return new Uint8Array(await r.arrayBuffer());
  if (r.ok) return new Uint8Array(await r.arrayBuffer()).subarray(desde, hasta + 1);   // el servidor ignoró el Range
  throw new Error('HTTP ' + r.status);
}
async function cabecera(url, entero) {
  const c = await bajar(url, 0, CAB - 1);
  if (c.length < CAB || String.fromCharCode(c[0], c[1], c[2], c[3]) !== 'ICW1') throw new Error('formato');
  const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
  const info = { bloque: v.getUint32(5), tam: Number(v.getBigUint64(9)), base: c.slice(17, 25) };
  // los archivos normales se bajan enteros una sola vez y desde ahí se leen del disco (sin bajar dos veces lo
  // mismo); los grandes se leen por trozos de la red y la precarga los guarda en piezas
  if (entero && info.tam <= GRANDE) await descargar(url, 'high');
  return info;
}
async function descifrarBloques(url, nombre, info, i0, i1) {          // bloques i0..i1 (incluidos)
  const paso = info.bloque + 16, ultimo = Math.max(0, Math.ceil(info.tam / info.bloque) - 1);
  i1 = Math.min(i1, ultimo);
  const tamEnc = (i) => (i < ultimo ? info.bloque : info.tam - ultimo * info.bloque) + 16;
  const desde = CAB + i0 * paso, hasta = CAB + i1 * paso + tamEnc(i1) - 1;
  const enc = await bajar(url, desde, hasta);
  const partes = [];
  for (let i = i0, o = 0; i <= i1; i++) {
    const n = tamEnc(i), iv = new Uint8Array(12); iv.set(info.base, 0); new DataView(iv.buffer).setUint32(8, i);
    partes.push(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(nombre + ':' + i) }, llave, enc.subarray(o, o + n))));
    o += n;
  }
  return partes;
}

async function servir(req, ruta) {
  const nombre = await nombreDe(ruta), url = BASE + 'x/' + nombre;
  let info;
  if (!req.headers.get('Range')) await traerEntero(url);
  try { info = await cabecera(url, !req.headers.get('Range')); } catch (_) { return new Response('No encontrado', { status: 404 }); }
  const ext = (ruta.split('.').pop() || '').toLowerCase(), tipo = TIPOS[ext] || 'application/octet-stream';
  const comunes = { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const rango = req.headers.get('Range');
  const m = rango && /^bytes=(\d*)-(\d*)$/.exec(rango.trim());
  if (m && info.tam > 0) {
    // Petición por trozos (vídeo, audio): se descifran solo los bloques necesarios, como mucho 4 MB por respuesta
    let a = m[1] === '' ? Math.max(0, info.tam - Number(m[2])) : Number(m[1]);
    let b = m[1] === '' ? info.tam - 1 : (m[2] === '' ? info.tam - 1 : Math.min(Number(m[2]), info.tam - 1));
    if (a >= info.tam || a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.tam}` } });
    b = Math.min(b, a + 4 * info.bloque - 1);
    const i0 = Math.floor(a / info.bloque), i1 = Math.floor(b / info.bloque);
    const partes = await descifrarBloques(url, nombre, info, i0, i1);
    const todo = new Uint8Array(partes.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of partes) { todo.set(p, o); o += p.length; }
    const trozo = todo.subarray(a - i0 * info.bloque, b - i0 * info.bloque + 1);
    return new Response(trozo, { status: 206, headers: { ...comunes, 'Content-Range': `bytes ${a}-${b}/${info.tam}`, 'Content-Length': String(trozo.length), 'Accept-Ranges': 'bytes' } });
  }
  // Archivo entero: se descifra y se entrega en streaming, de 4 en 4 bloques
  const total = Math.max(1, Math.ceil(info.tam / info.bloque));
  let i = 0;
  const flujo = new ReadableStream({
    async pull(ctrl) {
      if (i >= total) { ctrl.close(); return; }
      try { const ps = await descifrarBloques(url, nombre, info, i, i + 3); for (const p of ps) ctrl.enqueue(p); i += 4; }
      catch (e) { ctrl.error(e); }
    },
  });
  return new Response(flujo, { status: 200, headers: { ...comunes, 'Content-Length': String(info.tam), 'Accept-Ranges': 'bytes' } });
}

async function pantallaAcceso() {
  const r = await fetch(BASE + 'index.html', { cache: 'no-cache' });
  return new Response(r.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || req.method !== 'GET') return;
  let ruta = decodeURIComponent(url.pathname.slice(BASE.length));
  if (ruta === '' || ruta.endsWith('/')) ruta += 'index.html';
  if (PUBLICO.some((r) => r.test(ruta))) return;                                    // pantalla de acceso y archivos cifrados: tal cual
  const navega = req.mode === 'navigate';
  e.respondWith((async () => {
    if (navega && url.searchParams.has('salir')) { await salir(); return pantallaAcceso(); }
    if (!(await hayLlave())) return navega ? pantallaAcceso() : new Response('Acceso restringido', { status: 403 });
    activos++;
    try { return await servir(req, ruta); }
    catch (err) {
      // La llave no sirve para estos archivos (versión nueva o llave dañada): se pide entrar de nuevo
      if (err && err.name === 'OperationError') { await salir(); return navega ? pantallaAcceso() : new Response('Acceso restringido', { status: 403 }); }
      return new Response('Error', { status: 502 });
    } finally { activos--; }
  })());
});
