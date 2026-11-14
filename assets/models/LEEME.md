# Modelos 3D de Blender

Exporta desde Blender en **glTF binario (.glb)** y guarda aquí con estos nombres:

| Archivo | Sustituye a |
|---|---|
| `rover.glb` | el rover (editable en `rover.blend`) |
| `station.glb` | la estación completa: módulo, torres solares, tolva, cinta, horno, trampa fría, biofiltro, filtros, depósito (editable en `station.blend`) |
| `colony.glb` | la colonia |
| `biofilter.glb` | la cúpula del biofiltro |

Después añade el nombre a `models.json`, por ejemplo: `["rover", "colony"]`.

Convenciones:
- Unidades en metros. Origen en el suelo, en el centro del objeto.
- Rover: frente hacia +X. Las ruedas se llaman `wheel_…` (giran solas) y el taladro `drill` (baja al perforar).
- Opciones de exportación: *Include → Selected Objects* o toda la escena, *+Y Up* activado (por defecto).
- Para que pese menos, activa *Compression* (Draco). La web trae el decodificador en `assets/vendor/draco/`.
- `rover.blend` es el archivo editable del rover (texturas incluidas). Para ver los materiales en Blender usa la vista *Material Preview*.

La carga funciona en GitHub Pages o con un servidor local (`python -m http.server`). Si el archivo no existe, la web usa el modelo actual.

## Animación del rover

La simulación mueve el rover según lo que está haciendo. Para eso usa estos objetos de `rover.blend`; **no cambies sus nombres**:

| Objeto (vacío) | Qué mueve | Cuándo |
|---|---|---|
| `wheel_FL` … `wheel_RR` | giro de cada rueda | al avanzar |
| `piv_direccion_FL/FR/RL/RR` | dirección de las ruedas de esquina | al girar |
| `piv_mastil_giro`, `piv_mastil_cabeceo` | cabezal de cámaras | busca al explorar, mira al suelo al medir, vigila el taladro |
| `piv_taladro_carro` y `drill` | carro con motor y broca | bajan al perforar |
| `piv_brazo_azimut/hombro/codo/muneca` | brazo robótico | lleva cada muestra del taladro al carrusel |
| `piv_carrusel` | carrusel de 8 cartuchos | gira al guardar y al descargar en la estación |
| `cartucho_0_tapa` … `cartucho_7_tapa` | color de la tapa | azul hielo = cartucho lleno |

Si mueves una articulación del brazo en Blender, hay que recalcular los ángulos de `ARM` en `js/sim-view.js`.

## Animación de la estación (`station.blend` → `station.glb`)

La planta se mueve con el estado real de la simulación. **No cambies estos nombres**:

| Objeto | Qué hace | Cuándo |
|---|---|---|
| `piv_tolva_tapa` | tapa de la tolva | se abre cuando el rover descarga |
| `cinta_00` … `cinta_07` | recorrido de la cinta | las cápsulas de muestra viajan hasta el horno |
| `piv_horno_tambor` | tambor del horno | gira mientras calienta |
| material `EST_brillo_horno` | mirilla y junta | brillan según la temperatura del horno |
| `flujo_vapor_00…` | tubería de vapor | bocanadas de vapor mientras el hielo se sublima |
| `trampa_escarcha` | escarcha dentro de la trampa fría | crece con el hielo capturado |
| `trampa_crio_piston` | criorrefrigerador | late mientras enfría |
| `flujo_agua_00…` | tubería de agua | gotas: trampa → biofiltro → filtros → depósito |
| material `EST_led_cultivo`, `piv_bomba_nutrientes` | biofiltro | luces de cultivo y bomba de nutrientes |
| `filtro_nivel_0/1/2`, material `EST_uv` | filtros | baja el adsorbente; la lámpara UV se enciende al pasar agua |
| `deposito_agua`, `deposito_indicador` | depósito | nivel del agua |
| `piv_bomba` | bomba | gira al enviar agua a la colonia |
| `piv_valvula_*` | volantes de las válvulas | giran al abrirse |
| `piv_horno_lecho`, ventana del cabezal | lecho de regolito dentro del horno | se voltea al calentar; sale vapor visible por la ventana |
| `tubo_vapor_vidrio` | tramo de vidrio de la tubería de vapor | se ve viajar el vapor |
| `trampa_escarcha_serpentin` | escarcha sobre el serpentín | se vuelve opaca al capturar hielo; el vapor entra girando |
| `piv_bio_distribuidor`, `bio_agua`, `bio_soportes` | lecho biológico del biofiltro | el distribuidor riega; el agua pasa de turbia a clara mientras trabajan los microorganismos |
| `piv_indicador_0/1/2` | indicadores de flujo con ventana | la ruedita gira cuando pasa agua (el último, hacia la colonia) |
| `piv_solar_A/B`, `piv_antena` | paneles y antena | apuntan al Sol y a la Tierra |

## Abrir la web con doble clic (sin servidor)

Al abrir `index.html` directamente (`file://`), el navegador no deja leer los `.glb`. Por eso existe
`assets/models/modelos-locales.js`, que lleva los modelos y el decodificador Draco empaquetados; la web solo lo
descarga en ese caso. **Cada vez que exportes un `.glb` nuevo desde Blender**, vuelve a generarlo:

```
python tools/empaquetar-modelos.py
```
