# Modelos 3D de Blender

Exporta desde Blender en **glTF binario (.glb)** y guarda aquí con estos nombres:

| Archivo | Sustituye a |
|---|---|
| `rover.glb` | el rover |
| `station.glb` | la estación (módulo, paneles, horno, trampa fría, tanque) |
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
