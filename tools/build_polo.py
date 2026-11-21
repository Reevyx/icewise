"""ICEWISE — Relieve 3D del polo sur para «El reto» (NASA LOLA, PDS ldem_75s_240m).

Fuente: LRO LOLA GDR polar, ldem_75s_240m.img (estereográfica polar, 240 m/px, 3812 x 3812, int16 x 0,5 m sobre
1737,4 km; polo en la muestra/línea 1905,5). Descarga:
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img

Salida (assets/data/):
  polo.bin  -> N*N int16 (altura en m sobre 1737,4 km) + N*N uint8 (sombra del Sol de la simulación: 255 = sombra)
  polo.json -> metadatos
Recorte de ±400 km alrededor del polo reducido a N = 1024 (0,78 km/px). La sombra se calcula con el mismo Sol que la
simulación (acimut 120°, 1,2° de altura) y el disco solar, con la curvatura lunar.

Uso:  python -P tools/build_polo.py <ruta a ldem_75s_240m.img>
"""
import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1])
R = 1737400.0
NS, SCALE, OFF = 3812, 240.0, 1905.5
HALF_KM, N = 400.0, 1024
SUN_AZ, SUN_EL, SUN_R = 120.0, 1.2, 0.2665            # grados (radio del disco solar)

dn = np.fromfile(SRC, dtype='<i2').reshape(NS, NS).astype(np.float32) * 0.5          # m
# recorte centrado en el polo: muestras/líneas OFF ± 400 km / 240 m
r = HALF_KM * 1000 / SCALE
i0, i1 = int(round(OFF - r)), int(round(OFF + r))
crop = dn[i0:i1, i0:i1]
km_per_px_src = SCALE / 1000
img = Image.fromarray(crop, mode='F').resize((N, N), Image.BOX)
H = np.asarray(img, dtype=np.float32)
size_km = (i1 - i0) * km_per_px_src
px_km = size_km / N
print('recorte', crop.shape, '->', H.shape, f'{size_km:.1f} km, {px_km * 1000:.0f} m/px', 'alturas', H.min(), H.max())

# sombra con el Sol de la simulación: horizonte hacia el Sol (con curvatura) frente a la altura del Sol
az = math.radians(SUN_AZ)
dx, dz = math.cos(az), math.sin(az)                    # columna (x) y fila (z) de la imagen = ejes x, z del marco F
best = np.full(H.shape, -1.0, np.float32)
jj, ii = np.mgrid[0:N, 0:N].astype(np.float32)
k, d = 1.0, 0.0
while k < N * 1.5:
    si = np.rint(ii + dx * k).astype(np.int32); sj = np.rint(jj + dz * k).astype(np.int32)
    ok = (si >= 0) & (si < N) & (sj >= 0) & (sj < N)
    if not ok.any():
        break
    dist = k * px_km * 1000
    hs = np.where(ok, H[np.clip(sj, 0, N - 1), np.clip(si, 0, N - 1)], -1e9)
    best = np.maximum(best, ((hs - H - dist * dist / (2 * R)) / dist).astype(np.float32))
    k = k + 1 if k < 40 else k * 1.03
ang = np.degrees(np.arctan(best))
luz = np.clip((SUN_EL - ang) / (2 * SUN_R) + 0.5, 0, 1)                 # fracción visible del disco solar
sombra = np.round((1 - luz) * 255).astype(np.uint8)
print('fracción en sombra', round(float((sombra > 127).mean()), 3))

out = ROOT / 'assets' / 'data'
hq = np.round(H).astype('<i2')
with open(out / 'polo.bin', 'wb') as fh:
    fh.write(hq.tobytes()); fh.write(sombra.tobytes())
meta = {'source': 'NASA LRO LOLA · PDS ldem_75s_240m (240 m/px) · recorte de ±400 km reducido por ICEWISE',
        'N': N, 'sizeKm': round(size_km, 3), 'pxKm': round(px_km, 5), 'hUnit': 'm sobre 1737,4 km',
        'sun': {'azDeg': SUN_AZ, 'elDeg': SUN_EL}}
(out / 'polo.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf8')
print('escrito', (out / 'polo.bin').stat().st_size // 1024, 'KB')
