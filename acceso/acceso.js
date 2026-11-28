// ============================================================================
// KILLA · pantalla de acceso
// ----------------------------------------------------------------------------
// Dos formas de entrar:
//   · Rostro: la cámara saca la «huella» de la cara (128 números; la foto nunca sale del navegador),
//     comprueba que es una persona real (parpadeo y giro de cabeza, para que una foto no sirva) y
//     el servidor la compara con la de la dueña. Solo vale desde un dispositivo vinculado.
//   · PIN de 6 dígitos.
// Nadie puede registrar su cara: un dispositivo nuevo se vincula solo con el rostro de la dueña + el PIN.
// Si el servidor acepta, entrega la llave de la web y el service worker la descifra.
//
// Prueba de vida con MediaPipe Face Landmarker: mide «ojo cerrado» y el giro de la cabeza en cada imagen
// de la cámara, respecto a la propia cara de esa persona (no con umbrales fijos).
// Con ?diagnostico en la dirección se ven los valores medidos.
// ============================================================================
(() => {
'use strict';
// Script clásico (no módulo) para que la pantalla también se vea al abrir index.html con doble clic;
// las librerías del rostro se cargan solo al usarlo.
const SCRIPT = document.currentScript ? document.currentScript.src : new URL('acceso/acceso.js', document.baseURI).href;
const ARCHIVO = location.protocol === 'file:';
const PERMISO_REGISTRO = new URLSearchParams(location.search).get('registro');   // enlace de un solo uso para registrar el rostro

const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const SERVIDOR = LOCAL ? 'http://localhost:8787' : 'https://icewise-acceso.rone-robot.workers.dev';
const BASE = document.baseURI.replace(/[^/]*$/, '');
const OFICIAL = ['reevyx.github.io'];
const DIAG = new URLSearchParams(location.search).has('diagnostico');

// ---------- textos (EN por defecto, como la web) ----------
const TXT = {
  es: {
    k: 'Acceso privado', lema: 'Agua donde nunca sale el Sol.',
    intro: 'Agua del hielo del polo sur lunar para abastecer a la primera colonia en la Luna.',
    dato1: 'Toda la web va cifrada', dato2b: 'Rostro', dato2: 'Con prueba de vida', dato3: 'El PIN cambia cada día',
    entrarT: 'Iniciar sesión', entrarP: 'Elige cómo quieres entrar.',
    conRostro: 'Reconocimiento facial', conRostroP: 'Mira a la cámara un momento',
    conPin: 'PIN del día', conPinP: 'Código de 6 dígitos',
    volver: 'Volver', entrar: 'Entrar',
    pasoMira: 'Mira', pasoParpadea: 'Parpadea', pasoGira: 'Gira',
    pinLbl: 'Escribe el PIN de hoy.', pinVincular: 'Rostro reconocido. Es la primera vez en este dispositivo: escribe también el PIN de hoy para vincularlo.',
    denT: 'Rostro no reconocido', denP: 'Este rostro no tiene acceso a KILLA. El intento quedó registrado y se envió un aviso.',
    falso: '⚠ Esta no es la página oficial de KILLA. No escribas aquí tu PIN.',
    cargando: 'Preparando el reconocimiento facial…', camara: 'Permite el uso de la cámara para continuar (aviso del navegador).', sinCamara: 'No se pudo usar la cámara. Revisa los permisos del navegador o entra con el PIN.',
    mira: 'Mira a la cámara', parpadea: 'Ahora parpadea despacio', gira: 'Gira un poco la cabeza hacia un lado…', vuelve: '…y vuelve a mirar al frente',
    quieto: 'Reconociendo…', regBoton: 'Registrar mi rostro', regBotonP: 'Unos 20 segundos, con buena luz',
    regFrente: 'Mira de frente a la cámara', regIzq: 'Gira un poco la cabeza hacia un lado', regDer: 'Ahora un poco hacia el otro lado', regCerca: 'Acércate a la cámara', regLejos: 'Ahora aléjate un poco',
    regPin: 'Para guardar tu rostro, escribe el PIN de hoy.', regOk: (c) => `Rostro registrado (consistencia ${Math.round(c * 100)} %). Ya puedes entrar con tu rostro.`,
    regInconsistente: 'Las huellas no se parecen lo suficiente entre sí (poca luz o movimiento). Repite el registro con buena luz.', regPermiso: 'El enlace de registro no es válido o ya se usó.', comprobando: 'Comprobando…', unaCara: 'Solo debe haber un rostro frente a la cámara', acerca: 'Acércate un poco a la cámara',
    luz: 'No veo bien tu cara: busca más luz de frente', abre: 'Mira a la cámara con los ojos abiertos', frente: 'Mira de frente a la cámara',
    sinParpadeo: 'No noté el parpadeo. Prueba a cerrar los ojos un segundo y abrirlos.', sinGiro: 'No noté el giro. Gira la cabeza un poco más hacia un lado y vuelve.',
    tiempo: 'No pude ver tu cara a tiempo. Ponte de frente a la cámara y vuelve a intentarlo.', dudoso: 'Tu rostro no coincidió lo suficiente con el registrado. Inténtalo de nuevo mirando de frente a la cámara.',
    dispositivo: 'No se pudo comprobar este dispositivo. Entra con el PIN del día.', sinRegistro: 'El acceso con rostro no está disponible. Entra con el PIN del día.',
    pinMal: (n) => `PIN incorrecto.${n !== undefined ? ` Te quedan ${n} intentos.` : ''}`, pinBloq: 'Demasiados intentos fallidos. Inténtalo más tarde.',
    espera: 'Demasiados intentos seguidos. Espera unos minutos.', red: 'No hay conexión con el servidor de acceso.', bien: 'Acceso concedido. Abriendo KILLA…',
    navegador: 'Este navegador no puede abrir la web protegida. Usa Chrome, Edge, Safari o Firefox actualizados.',
    localP: 'Copia local: al abrir el archivo con doble clic el navegador no deja usar la cámara ni el servidor, así que aquí no se verifica. La pantalla es la misma que se publica.',
    localVer: 'Ver la web (copia local)', localNo: 'En la copia local no se puede verificar: usa «Ver la web (copia local)» o la página publicada.',
  },
  en: {
    k: 'Private access', lema: 'Water where the Sun never rises.',
    intro: 'Water from the ice at the lunar south pole to supply the first colony on the Moon.',
    dato1: 'The whole site is encrypted', dato2b: 'Face', dato2: 'With liveness check', dato3: 'The PIN changes every day',
    entrarT: 'Sign in', entrarP: 'Choose how you want to sign in.',
    conRostro: 'Face recognition', conRostroP: 'Look at the camera for a moment',
    conPin: 'Today’s PIN', conPinP: '6-digit code',
    volver: 'Back', entrar: 'Sign in',
    pasoMira: 'Look', pasoParpadea: 'Blink', pasoGira: 'Turn',
    pinLbl: 'Type today’s PIN.', pinVincular: 'Face recognised. This is the first time on this device: also type today’s PIN to link it.',
    denT: 'Face not recognised', denP: 'This face does not have access to KILLA. The attempt was recorded and an alert was sent.',
    falso: '⚠ This is not the official KILLA page. Do not type your PIN here.',
    cargando: 'Preparing face recognition…', camara: 'Allow camera access to continue (browser prompt).', sinCamara: 'The camera could not be used. Check the browser permissions or use the PIN.',
    mira: 'Look at the camera', parpadea: 'Now blink slowly', gira: 'Turn your head slightly to one side…', vuelve: '…and look straight ahead again',
    quieto: 'Recognising…', regBoton: 'Register my face', regBotonP: 'About 20 seconds, in good light',
    regFrente: 'Look straight at the camera', regIzq: 'Turn your head slightly to one side', regDer: 'Now slightly to the other side', regCerca: 'Come closer to the camera', regLejos: 'Now move back a little',
    regPin: 'To save your face, type today’s PIN.', regOk: (c) => `Face registered (consistency ${Math.round(c * 100)}%). You can now sign in with your face.`,
    regInconsistente: 'The captures are not similar enough to each other (low light or movement). Repeat the registration in good light.', regPermiso: 'The registration link is not valid or has already been used.', comprobando: 'Checking…', unaCara: 'Only one face should be in front of the camera', acerca: 'Come a little closer to the camera',
    luz: 'I can’t see your face well: find more light in front of you', abre: 'Look at the camera with your eyes open', frente: 'Face the camera straight on',
    sinParpadeo: 'I didn’t notice the blink. Try closing your eyes for a second and opening them.', sinGiro: 'I didn’t notice the turn. Turn your head a bit more to one side and back.',
    tiempo: 'I could not see your face in time. Face the camera and try again.', dudoso: 'Your face did not match the registered one closely enough. Try again looking straight at the camera.',
    dispositivo: 'This device could not be verified. Sign in with today’s PIN.', sinRegistro: 'Face sign-in is not available. Use today’s PIN.',
    pinMal: (n) => `Wrong PIN.${n !== undefined ? ` ${n} attempts left.` : ''}`, pinBloq: 'Too many failed attempts. Try again later.',
    espera: 'Too many attempts in a row. Wait a few minutes.', red: 'No connection with the access server.', bien: 'Access granted. Opening KILLA…',
    navegador: 'This browser cannot open the protected site. Use an up-to-date Chrome, Edge, Safari or Firefox.',
    localP: 'Local copy: when the file is opened with a double click the browser blocks the camera and the server, so nothing is verified here. The screen is the same one that gets published.',
    localVer: 'View the site (local copy)', localNo: 'Nothing can be verified in the local copy: use «View the site (local copy)» or the published page.',
  },
};
let lang = 'en';
try { lang = localStorage.getItem('icewise-lang') === 'es' ? 'es' : 'en'; } catch (_) {}
const t = (k, ...a) => { const v = TXT[lang][k]; return typeof v === 'function' ? v(...a) : v; };
const $ = (s) => document.querySelector(s);
let ultimaInstr = null;
function pintarTextos() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = t(e.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.tAria)); });
  document.querySelectorAll('#ac-idioma span').forEach((s) => s.classList.toggle('on', s.dataset.l === lang));
  if (ultimaInstr) instr(ultimaInstr);
}
$('#ac-idioma').addEventListener('click', () => { lang = lang === 'en' ? 'es' : 'en'; try { localStorage.setItem('icewise-lang', lang); } catch (_) {} if (flujo) pintarTextos(); else location.reload(); });
pintarTextos();
if (!LOCAL && !ARCHIVO && !OFICIAL.includes(location.hostname)) $('#ac-falso').hidden = false;      // aviso si alguien copia la página en otra dirección

const estado = (txt, tipo) => { const e = $('#ac-estado'); e.textContent = txt || ''; e.className = 'ac-estado' + (tipo ? ' is-' + tipo : ''); };
function vista(n) {
  document.querySelectorAll('.ac-vista').forEach((v) => { v.hidden = v.dataset.vista !== n; });
  if (n !== 'rostro') pararCamara();
  if (n === 'inicio') estado('');
}
document.querySelectorAll('[data-volver]').forEach((b) => b.addEventListener('click', () => { cancelado = true; pendiente = null; vista('inicio'); }));

// ---------- service worker (descifra la web) ----------
const soportado = !ARCHIVO && 'serviceWorker' in navigator && window.crypto && crypto.subtle && window.isSecureContext;
if (ARCHIVO) {
  $('#ac-local').hidden = false;
} else if (soportado) {
  navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {});
  // si ya hay una llave válida (p. ej. primera carga antes de que el service worker controle la página), se entra directo
  navigator.serviceWorker.ready.then((r) => preguntarSW(r.active, { tipo: 'estado' })).then((r) => { if (r && r.ok && navigator.serviceWorker.controller) location.reload(); }).catch(() => {});
} else {
  estado(t('navegador'), 'mal');
  document.querySelectorAll('.ac-tarjeta button').forEach((b) => { b.disabled = true; });
}
function preguntarSW(sw, msg) {
  return new Promise((ok) => {
    if (!sw) { ok(null); return; }
    const c = new MessageChannel(); c.port1.onmessage = (e) => ok(e.data); sw.postMessage(msg, [c.port2]);
    setTimeout(() => ok(null), 4000);
  });
}
async function abrirWeb(llave) {
  estado(t('bien'), 'ok');
  const r = await navigator.serviceWorker.ready;
  const res = await preguntarSW(r.active, { tipo: 'llave', k: llave.k, v: llave.v, exp: llave.exp });
  if (!res || !res.ok) { estado(t('navegador'), 'mal'); return; }
  const u = new URL(location.href); u.searchParams.delete('salir');
  setTimeout(() => location.replace(u.href), 350);
}

// ---------- servidor de acceso ----------
async function pedir(ruta, datos) {
  try {
    const r = await fetch(SERVIDOR + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), credentials: 'omit', referrerPolicy: 'no-referrer' });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  } catch (_) { return { status: 0, error: 'red' }; }
}

// ---------- dispositivo vinculado (clave que no puede salir de este navegador) ----------
const idb = () => new Promise((ok, ko) => { const r = indexedDB.open('icewise-dispositivo', 1); r.onupgradeneeded = () => r.result.createObjectStore('d'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
async function leerDisp() { try { const d = await idb(); return await new Promise((ok) => { const r = d.transaction('d').objectStore('d').get('yo'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (_) { return null; } }
async function guardarDisp(v) { const d = await idb(); await new Promise((ok, ko) => { const tx = d.transaction('d', 'readwrite'); tx.objectStore('d').put(v, 'yo'); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); }); }
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- reconocimiento facial ----------
// · MediaPipe Face Landmarker (Google): 478 puntos de la cara y medidas de cada gesto («ojo cerrado»…) en cada
//   imagen de la cámara. Comprueba que hay una sola cara, de frente, cerca y con los ojos abiertos.
// · ArcFace (MobileFaceNet de InsightFace, con ONNX Runtime): con 5 de esos puntos (ojos, nariz y comisuras) la
//   cara se alinea a 112×112 píxeles y se convierte en una huella de 512 números; el servidor la compara con la
//   de la dueña. Cada huella promedia la cara y su reflejo, como en las pruebas de referencia del modelo.
let modelos = null, marcador = null, sesionArc = null, ortLib = null, flujo = null, cancelado = false;
const video = $('#ac-video');
const lienzo112 = document.createElement('canvas'); lienzo112.width = lienzo112.height = 112;
const ctx112 = lienzo112.getContext('2d', { willReadFrequently: true });
// posición estándar de los 5 puntos en la cara alineada de ArcFace (112×112)
const PLANTILLA = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
function cargarModelos() {
  if (!modelos) {
    const ruta = BASE + 'acceso/modelos';
    const gestos = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(new URL('vendor/mediapipe/vision_bundle.mjs', SCRIPT).href);
      const archivos = await FilesetResolver.forVisionTasks(BASE + 'acceso/vendor/mediapipe');
      const opciones = (delegate) => ({
        baseOptions: { modelAssetPath: ruta + '/face_landmarker.task', delegate },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { marcador = await FaceLandmarker.createFromOptions(archivos, opciones('GPU')); }
      catch (_) { marcador = await FaceLandmarker.createFromOptions(archivos, opciones('CPU')); }
      // calentamiento: la primera imagen tarda (prepara la tarjeta gráfica); mejor antes de abrir la cámara
      const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').fillRect(0, 0, 256, 256);
      try { marcador.detectForVideo(c, 1); } catch (_) {}
    })();
    const huellas = (async () => {
      ortLib = await import(new URL('vendor/ort/ort.wasm.bundle.min.mjs', SCRIPT).href);
      ortLib.env.wasm.wasmPaths = new URL('vendor/ort/', SCRIPT).href;
      ortLib.env.wasm.numThreads = 1;                   // GitHub Pages no permite varios hilos (aislamiento entre orígenes)
      sesionArc = await ortLib.InferenceSession.create(ruta + '/arcface-mbf.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      await sesionArc.run({ [sesionArc.inputNames[0]]: new ortLib.Tensor('float32', new Float32Array(3 * 112 * 112), [1, 3, 112, 112]) });   // calentamiento
    })();
    modelos = Promise.all([gestos, huellas]);
    modelos.catch(() => { modelos = null; });
  }
  return modelos;
}
async function abrirCamara() {
  flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
  video.srcObject = flujo; await video.play();
}
function pararCamara() { if (flujo) { flujo.getTracks().forEach((k) => k.stop()); flujo = null; } video.srcObject = null; $('#ac-cam').classList.remove('is-lista'); document.body.classList.remove('ac-con-camara'); }
const progreso = (f, tipo) => { $('#ac-progreso').style.strokeDashoffset = String(301.6 * (1 - Math.max(0, Math.min(1, f)))); const c = $('#ac-cam'); c.classList.toggle('is-ok', tipo === 'ok'); c.classList.toggle('is-mal', tipo === 'mal'); };
function instr(clave) { ultimaInstr = clave; $('#ac-instr').textContent = clave ? t(clave) : ''; }
function pulso() { const c = $('#ac-cam'); c.classList.remove('is-pulso'); void c.offsetWidth; c.classList.add('is-pulso'); }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// siguiente imagen de la cámara (o del refresco de pantalla si el navegador no avisa por imagen)
const siguienteImagen = () => new Promise((r) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : requestAnimationFrame(() => r())));

// Lo que MediaPipe ve en una imagen (los puntos vienen normalizados de 0 a 1)
function gestos(res) {
  const caras = res.faceLandmarks ? res.faceLandmarks.length : 0;
  if (!caras) return { caras: 0 };
  const p = res.faceLandmarks[0], bs = {};
  ((res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) || []).forEach((c) => { bs[c.categoryName] = c.score; });
  const nariz = p[1], izq = p[234], der = p[454];                                   // punta de la nariz y bordes de la cara
  return {
    caras, puntos: p,
    ojos: Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0) * 0.5 + Math.min(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0) * 0.5,   // 0 abiertos · 1 cerrados
    giro: Math.log(Math.max(1e-3, nariz.x - izq.x) / Math.max(1e-3, der.x - nariz.x)),  // ≈ 0 de frente; ± al girar a un lado
    ancho: Math.abs(der.x - izq.x),                                                   // tamaño de la cara (0–1 del ancho)
  };
}

// Huella ArcFace (512 números, unitaria) de la cara que se ve ahora, alineada con 5 puntos
function huellaArc(puntos) {
  const W = video.videoWidth, H = video.videoHeight;
  const P = (i) => [puntos[i].x * W, puntos[i].y * H];
  const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // ojos (centro del iris; si no hay iris, el de las comisuras del ojo), punta de la nariz y comisuras de la boca, de izquierda a derecha en la imagen
  const ojoI = puntos[468] ? P(468) : medio(P(33), P(133)), ojoD = puntos[473] ? P(473) : medio(P(362), P(263));
  const src = [ojoI, ojoD, P(1), P(61), P(291)];
  // semejanza (escala + giro + traslación) que lleva los 5 puntos a la plantilla (mínimos cuadrados)
  let ms = [0, 0], md = [0, 0];
  for (let i = 0; i < 5; i++) { ms[0] += src[i][0] / 5; ms[1] += src[i][1] / 5; md[0] += PLANTILLA[i][0] / 5; md[1] += PLANTILLA[i][1] / 5; }
  let a = 0, b = 0, n = 0;
  for (let i = 0; i < 5; i++) {
    const sx = src[i][0] - ms[0], sy = src[i][1] - ms[1], dx = PLANTILLA[i][0] - md[0], dy = PLANTILLA[i][1] - md[1];
    a += sx * dx + sy * dy; b += sx * dy - sy * dx; n += sx * sx + sy * sy;
  }
  const m00 = a / n, m10 = b / n, tx = md[0] - (m00 * ms[0] - m10 * ms[1]), ty = md[1] - (m10 * ms[0] + m00 * ms[1]);
  const tensor = new Float32Array(2 * 3 * 112 * 112);   // la cara y su reflejo (el modelo las procesa de una en una)
  for (let espejo = 0; espejo < 2; espejo++) {
    ctx112.setTransform(1, 0, 0, 1, 0, 0); ctx112.fillStyle = '#000'; ctx112.fillRect(0, 0, 112, 112);
    if (espejo) ctx112.setTransform(-m00, m10, m10, m00, 112 - tx, ty);              // la misma cara reflejada
    else ctx112.setTransform(m00, m10, -m10, m00, tx, ty);
    ctx112.drawImage(video, 0, 0, W, H);
    const px = ctx112.getImageData(0, 0, 112, 112).data, off = espejo * 3 * 112 * 112;
    for (let i = 0, k = 0; i < 112 * 112; i++, k += 4) {                               // RGB, (valor − 127,5) / 127,5
      tensor[off + i] = (px[k] - 127.5) / 127.5; tensor[off + 12544 + i] = (px[k + 1] - 127.5) / 127.5; tensor[off + 25088 + i] = (px[k + 2] - 127.5) / 127.5;
    }
  }
  const una = (k) => sesionArc.run({ [sesionArc.inputNames[0]]: new ortLib.Tensor('float32', tensor.subarray(k * 37632, (k + 1) * 37632), [1, 3, 112, 112]) })
    .then((r) => r[sesionArc.outputNames[0]].data);
  return una(0).then((y0) => una(1).then((y1) => {
    const v = new Array(512);
    let norma = 0;
    for (let i = 0; i < 512; i++) { v[i] = y0[i] + y1[i]; norma += v[i] * v[i]; }
    norma = Math.sqrt(norma) || 1;
    return v.map((x) => +(x / norma).toFixed(5));
  }));
}

// Escaneo (como Face ID): mirar a la cámara un momento. Con `poses` hace el registro guiado (varias posturas).
//   poses: [{ clave, n, ok(g) }] — en cada postura junta n huellas que cumplan ok(g).
async function capturar(poses) {
  poses = poses || [{ clave: 'mira', n: 5, ok: () => true }];
  const total = poses.reduce((s, x) => s + x.n, 0), huellas = [], inicio = performance.now();
  let pose = 0, enPose = 0, sinCara = 0, marcos = 0, t0 = inicio, fps = 0, ultimoTs = 0, ultimaHuella = 0, trabajando = false;
  const limite = poses.length > 1 ? 90000 : 15000;
  while (!cancelado) {
    await siguienteImagen();
    if (cancelado || !flujo) return {};
    const ahora = performance.now();
    if (ahora - inicio > limite) return { error: 'tiempo' };
    const ts = Math.max(ultimoTs + 1, Math.round(ahora)); ultimoTs = ts;
    let g;
    try { g = gestos(marcador.detectForVideo(video, ts)); } catch (_) { continue; }
    marcos++; if (ahora - t0 > 1000) { fps = marcos; marcos = 0; t0 = ahora; }
    const actual = poses[pose];
    let aviso = null;
    if (!g.caras) aviso = ++sinCara > 30 ? 'luz' : actual.clave;
    else if (g.caras > 1) aviso = 'unaCara';
    else if (g.ancho < 0.16) aviso = 'acerca';
    else if (g.ojos > 0.5) aviso = 'abre';
    else if (!actual.ok(g)) aviso = actual.clave;
    if (g.caras) sinCara = 0;
    instr(aviso || (poses.length > 1 ? actual.clave : 'quieto'));
    if (!aviso && !trabajando && ahora - ultimaHuella > (poses.length > 1 ? 140 : 60)) {
      trabajando = true; ultimaHuella = ahora;
      huellaArc(g.puntos).then((h) => {
        if (cancelado) return;
        huellas.push(h); enPose++;
        if (enPose >= actual.n && pose < poses.length - 1) { pose++; enPose = 0; pulso(); }
      }).catch(() => {}).finally(() => { trabajando = false; });
    }
    progreso(huellas.length / total, g.caras > 1 ? 'mal' : undefined);
    if (huellas.length >= total) { progreso(1, 'ok'); return { huellas: huellas.slice(0, total) }; }
    if (DIAG) $('#ac-diag').textContent = `ojo cerrado ${g.caras ? g.ojos.toFixed(2) : '—'} · giro ${g.caras ? g.giro.toFixed(2) : '—'} · tamaño ${g.caras ? g.ancho.toFixed(2) : '—'} · huellas ${huellas.length}/${total} · ${fps} fps · ${((ahora - inicio) / 1000).toFixed(1)} s`;
  }
  return {};
}
// Posturas del registro guiado (~20 s): de frente, girando un poco a cada lado, más cerca y más lejos
const POSES_REGISTRO = [
  { clave: 'regFrente', n: 8, ok: (g) => Math.abs(g.giro) < 0.15 },
  { clave: 'regIzq', n: 5, ok: (g) => g.giro > 0.18 && g.giro < 0.5 },
  { clave: 'regDer', n: 5, ok: (g) => g.giro < -0.18 && g.giro > -0.5 },
  { clave: 'regCerca', n: 6, ok: (g) => Math.abs(g.giro) < 0.2 && g.ancho > 0.34 },
  { clave: 'regLejos', n: 6, ok: (g) => Math.abs(g.giro) < 0.2 && g.ancho < 0.26 },
];
async function prepararCamara() {
  vista('rostro'); cancelado = false; progreso(0); instr(null); estado(t('cargando'));
  $('#ac-diag').hidden = !DIAG;
  document.body.classList.add('ac-con-camara');        // la Luna deja de animarse mientras se usa la cámara
  try { await cargarModelos(); } catch (_) { estado(t('red'), 'mal'); return false; }
  if (cancelado) return false;
  estado(t('camara'));
  try { await abrirCamara(); } catch (_) { estado(t('sinCamara'), 'mal'); return false; }
  $('#ac-cam').classList.add('is-lista');
  estado('');
  return !cancelado;
}

// ---------- entrar con el rostro ----------
// En un dispositivo ya vinculado basta el rostro. En uno nuevo, el servidor pide además el PIN de hoy
// y, si el rostro es el de la dueña, vincula este dispositivo. Nadie más puede registrar su cara.
let pendiente = null, registroHuellas = null;              // huellas de un rostro reconocido que espera el PIN para vincular el dispositivo
async function enviarRostro(huellas, pin) {
  const { reto } = await pedir('/reto', {});
  if (!reto) return { error: 'red' };
  const mensaje = new TextEncoder().encode(reto + '|' + JSON.stringify(huellas));
  const disp = await leerDisp();
  if (disp) {
    const firma = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, disp.privada, mensaje));
    return pedir('/rostro', { reto, huellas, dispositivo: disp.id, firma });
  }
  if (!pin) return pedir('/rostro', { reto, huellas });
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
  const firma = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, mensaje));
  const nombre = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'dispositivo';
  const r = await pedir('/rostro', { reto, huellas, pin, firma, nombre, clavePublica: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } });
  if (r.ok && r.dispositivo) await guardarDisp({ id: r.dispositivo, privada: par.privateKey });
  return r;
}
async function entrarConRostro() {
  pendiente = null;
  if (ARCHIVO) { estado(t('localNo'), 'mal'); return; }
  if (!(await prepararCamara())) return;
  const r0 = await capturar(PERMISO_REGISTRO ? POSES_REGISTRO : null);
  if (cancelado) return;
  if (!r0.huellas) { progreso(0, 'mal'); instr(null); estado(t(r0.error || 'tiempo'), 'mal'); pararCamara(); return; }
  if (PERMISO_REGISTRO) { pararCamara(); registroHuellas = r0.huellas; abrirPin(true); $('#ac-pin-lbl').textContent = t('regPin'); return; }
  instr('comprobando');
  const r = await enviarRostro(r0.huellas);
  if (DIAG && r.puntuacion) $('#ac-diag').textContent = `similitud ${r.puntuacion.mediana} (mínima ${r.puntuacion.minima}; acepta desde ${r.puntuacion.acepta})`;
  pararCamara();
  if (r.ok && r.llave) { progreso(1, 'ok'); await abrirWeb(r.llave); return; }
  if (r.error === 'intruso') { progreso(1, 'mal'); vista('denegado'); return; }
  if (r.error === 'necesita-pin') { pendiente = r0.huellas; abrirPin(true); return; }
  progreso(1, 'mal'); instr(null);
  estado(t({ dudoso: 'dudoso', dispositivo: 'dispositivo', 'sin-registro': 'sinRegistro', espera: 'espera' }[r.error] || 'red'), 'mal');
}
$('#ac-ir-rostro').addEventListener('click', entrarConRostro);

// ---------- PIN del día ----------
const casillas = [...document.querySelectorAll('#ac-pin input')];
casillas.forEach((c, i) => {
  c.addEventListener('input', () => {
    c.value = c.value.replace(/\D/g, '').slice(-1);
    if (c.value && i < 5) casillas[i + 1].focus();
    if (casillas.every((x) => x.value)) $('#ac-form-pin').requestSubmit();
  });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !c.value && i > 0) { casillas[i - 1].focus(); casillas[i - 1].value = ''; }
    else if (e.key === 'ArrowLeft' && i > 0) casillas[i - 1].focus();
    else if (e.key === 'ArrowRight' && i < 5) casillas[i + 1].focus();
  });
  c.addEventListener('paste', (e) => {
    const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!d) return; e.preventDefault();
    d.split('').forEach((n, k) => { if (casillas[k]) casillas[k].value = n; });
    (casillas[Math.min(d.length, 5)]).focus();
    if (d.length === 6) $('#ac-form-pin').requestSubmit();
  });
});
function abrirPin(conRostro) {
  vista('pin');
  $('#ac-pin-lbl').textContent = t(conRostro ? 'pinVincular' : 'pinLbl');
  $('#ac-pin-lbl').classList.toggle('is-ok', !!conRostro);
  casillas.forEach((c) => { c.value = ''; }); casillas[0].focus();
  estado('');
}
$('#ac-ir-pin').addEventListener('click', () => { pendiente = null; abrirPin(false); });
let enviando = false;
$('#ac-form-pin').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;
  const pin = casillas.map((c) => c.value).join('');
  if (!/^\d{6}$/.test(pin)) return;
  if (ARCHIVO) { estado(t('localNo'), 'mal'); return; }
  enviando = true; $('#ac-entrar-pin').disabled = true; estado(t('comprobando'));
  const r = registroHuellas ? await pedir('/registro-rostro', { permiso: PERMISO_REGISTRO, pin, huellas: registroHuellas })
    : pendiente ? await enviarRostro(pendiente, pin) : await pedir('/pin', { pin });
  if (registroHuellas && r.ok) {
    registroHuellas = null; enviando = false; $('#ac-entrar-pin').disabled = false;
    const u = new URL(location.href); u.searchParams.delete('registro'); history.replaceState(null, '', u.href);
    vista('inicio'); $('#ac-ir-rostro b').textContent = t('conRostro'); $('#ac-ir-rostro small').textContent = t('conRostroP');
    estado(t('regOk', r.consistencia), 'ok'); return;
  }
  if (registroHuellas && (r.error === 'inconsistente' || r.error === 'permiso')) { registroHuellas = null; enviando = false; $('#ac-entrar-pin').disabled = false; vista('inicio'); estado(t(r.error === 'permiso' ? 'regPermiso' : 'regInconsistente'), 'mal'); return; }
  enviando = false; $('#ac-entrar-pin').disabled = false;
  if (r.ok && r.llave) { pendiente = null; await abrirWeb(r.llave); return; }
  const p = $('#ac-pin'); p.classList.remove('is-mal'); void p.offsetWidth; p.classList.add('is-mal');
  casillas.forEach((c) => { c.value = ''; }); casillas[0].focus();
  estado(r.error === 'pin' ? t('pinMal', r.quedan) : r.error === 'pin-bloqueado' ? t('pinBloq') : r.error === 'espera' ? t('espera') : r.error === 'dudoso' ? t('dudoso') : t('red'), 'mal');
});

if (!ARCHIVO && soportado) leerDisp().then((d) => {
  if (!d) return;
  const precargar = () => cargarModelos().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(precargar, { timeout: 2500 }); else setTimeout(precargar, 1200);
});
if (PERMISO_REGISTRO) { $('#ac-ir-rostro b').textContent = t('regBoton'); $('#ac-ir-rostro small').textContent = t('regBotonP'); }
vista('inicio');
})();
