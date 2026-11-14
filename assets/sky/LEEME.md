# Cielo y Tierra de la simulación

| Archivo | Qué es | Fuente |
|---|---|---|
| `estrellas.js` | 62 000 estrellas reales como puntos nítidos (AR, Dec, brillo, color): 26 000 brillantes de Hipparcos/Tycho-2 y 36 000 débiles de Gaia DR2. La Vía Láctea se ve por la densidad de estrellas | NASA/Goddard SVS, *Deep Star Maps 2020* (https://svs.gsfc.nasa.gov/4851). Gaia DR2: ESA/Gaia/DPAC. Se extraen con `tools/preparar-estrellas-blender.py` |
| `tierra_dia_4k.jpg`, `tierra_dia_8k.jpg` | Tierra de día con nubes | NASA/Goddard SVS, Blue Marble (https://svs.gsfc.nasa.gov/3615) |
| `tierra_noche_4k.jpg` | Luces de las ciudades | NASA Earth Observatory, Black Marble 2016 (https://svs.gsfc.nasa.gov/30876) |
| `tierra_oceano_2k.png` | Máscara de océanos (brillo del Sol en el mar) | Derivada de la Tierra sin nubes de SVS 3615 |
| `cielo_fondo_1k.png` | Brillo difuso de la Vía Láctea, desenfocado ~3°: el velo azul muy suave del fondo | Derivado del mapa de SVS 4851 |
| `cielo-local.js` | Texturas de la Tierra (2K) y del brillo difuso para abrir `index.html` con doble clic | Las anteriores |
| `../terrain/rocas_lunares.glb`, `../terrain/regolito_*.jpg` | Rocas lunares escaneadas y regolito (fotogrametría) | Poly Haven, «moon_rock_01…07» y «moon_01», licencia CC0 (https://polyhaven.com) |

**Cómo se regeneran:** descarga `milkyway_2020_8k.exr` y `hiptyc_2020_8k.exr` de SVS 4851 y ejecuta:

```
blender -b --factory-startup --python tools/preparar-estrellas-blender.py -- <carpeta_exr> assets/sky/estrellas.js
blender -b --factory-startup --python tools/preparar-cielo-blender.py -- <carpeta_exr> <carpeta_salida>   # mapa completo, del que sale cielo_fondo_1k.png (desenfoque de ~3°)
```

**Honestidad:**
- La orientación del cielo es la real desde el polo sur lunar: el cenit apunta cerca del polo sur de la eclíptica, junto a la Gran Nube de Magallanes, y la eclíptica (el Sol y la Tierra) va pegada al horizonte.
- La fecha elegida (junio) solo gira el cielo.
- La Tierra está en la dirección real (longitud 0 lunar), con su tamaño real (1,9°) y con la fase que le corresponde con el Sol de la simulación: gibosa (93 % iluminada), a 150° del Sol. El Sol está en el acimut 120° y las sombras del relieve se recalcularon con él a partir del DEM de LOLA (`tools/build_dem.py`, variable `SUN_AZ`).
- Su altura sobre el horizonte se elige dentro del rango de libración (±6,7°) para que se vea por encima del relieve.
- No se usa la imagen detallada de la Vía Láctea (al ampliar se pixelaba): el cielo son las estrellas reales dibujadas como puntos y un velo azul muy tenue que sigue el brillo difuso real de la banda. Ese tono azulado es estético. «Cielo de larga exposición» muestra muchas estrellas, como una foto de exposición larga; a simple vista, con el suelo iluminado, casi no se verían.
