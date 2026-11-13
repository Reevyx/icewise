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
