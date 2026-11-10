# ICEWISE — Plataforma web

Presentación interactiva del proyecto ICEWISE (exploración y aprovechamiento de hielo lunar).
Sitio estático sin dependencias ni proceso de compilación.

## Cómo abrirlo

- **Opción simple:** doble clic en `index.html`. Todo funciona, excepto la vista previa del firmware.
- **Recomendado (presentación):** servirlo localmente, por ejemplo `python -m http.server 8000` en esta carpeta, y abrir `http://localhost:8000`.
- La conexión con el prototipo (Web Serial) requiere Chrome o Edge de escritorio, y `localhost` o HTTPS.

Las tipografías (Inter, Archivo) se cargan desde Google Fonts. Sin conexión, la página usa la fuente del sistema.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | 7 secciones: inicio, reto, cómo funciona, simulación 3D, viabilidad, prototipo, fuentes |
| `css/styles.css`, `css/sim.css` | Sistema visual Mercury y estilos de la simulación |
| `js/sim-engine.js` | Motor de simulación (mundo, rover autónomo, planta, cámara biológica). Se ejecuta también en Node |
| `js/sim-view.js` | Vista 3D con Three.js y panel de control |
| `js/model.js` | Modelo físico de balance de masa y energía |
| `js/viability.js` | Calculadora de viabilidad |
| `js/proto.js` | Conexión USB con el prototipo (Web Serial) |
| `assets/vendor/` | Three.js r128 y OrbitControls (locales, funcionan sin internet) |
| `firmware/icewise_esp32/` | Firmware de referencia del ESP32 |

## Probar el motor sin navegador

```bash
node -e "global.window=globalThis;require('./js/model.js');const I=require('./js/sim-engine.js');const s=I.createSim();s.cmd.start();for(let h=0;h<48;h++)s.step(3600);console.log(s.S.totals)"
```

## Comprobar el modelo desde la terminal

```bash
node -e "const M=require('./js/model.js'); console.log(M.run(M.SCENARIOS.intermedio.values).mass)"
```

## Honestidad de los datos

Cada valor se etiqueta como **Medido**, **Documentado**, **Supuesto** o **Simulado**. Los datos del
centro de control, la simulación y el laboratorio son simulaciones. Ninguna cifra de agua implica potabilidad.
