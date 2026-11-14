"""Prepara el cielo de la simulación a partir de los mapas de NASA SVS "Deep Star Maps 2020" (ID 4851).

Se ejecuta con Blender en segundo plano (Blender trae numpy y lee EXR):
    blender -b --factory-startup --python tools/preparar-cielo-blender.py -- <carpeta_con_exr> <carpeta_salida>

Entradas (descargadas de https://svs.gsfc.nasa.gov/4851):
    milkyway_2020_8k.exr  · Vía Láctea y estrellas débiles (Gaia DR2)
    hiptyc_2020_8k.exr    · estrellas brillantes (Hipparcos y Tycho-2)
Salidas:
    cielo_8k.jpg, cielo_4k.jpg, cielo_2k.jpg · fondo (todas las estrellas + Vía Láctea), en sRGB, blanco = BLANCO
    estrellas.js · las estrellas más brillantes como puntos (AR, Dec, brillo relativo, color) para dibujarlas nítidas
Proyección: placa carrée, AR/Dec J2000, centro en AR 0 h, la AR aumenta hacia la izquierda (convención de SVS).
"""
import bpy, sys, os, json, base64
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)


def load(name):
    img = bpy.data.images.load(os.path.join(SRC, name))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[:, :, :3].copy(), w, h   # fila 0 = abajo (Dec −90°)


mw, W, H = load('milkyway_2020_8k.exr')
st, _, _ = load('hiptyc_2020_8k.exr')
print('tamaño', W, H)

# --- estrellas brillantes: máximos locales de luminancia
Y = st @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
pad = np.pad(Y, 1, mode='edge')
is_max = np.ones_like(Y, dtype=bool)
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        if dx or dy:
            is_max &= Y >= pad[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
thr = np.percentile(Y, 99.5)
ys, xs = np.nonzero(is_max & (Y > thr))
rgb = np.zeros((len(xs), 3), dtype=np.float64)
for dy in range(-3, 4):                       # las estrellas brillantes son discos de varios píxeles
    for dx in range(-3, 4):
        rgb += st[np.clip(ys + dy, 0, H - 1), (xs + dx) % W]
flux = rgb @ np.array([0.2126, 0.7152, 0.0722])
order = np.argsort(-flux)[:12000]
xs, ys, rgb, flux = xs[order], ys[order], rgb[order], flux[order]
ra = ((0.5 - (xs + 0.5) / W) * 360.0) % 360.0
dec = -90.0 + (ys + 0.5) / H * 180.0
col = rgb / np.maximum(rgb.max(axis=1, keepdims=True), 1e-9)
rel = flux / flux[0]
print('estrella más brillante: AR %.2f° Dec %.2f° (Sirio: 101,29° −16,72°)' % (ra[0], dec[0]))
data = np.stack([ra, dec, rel, col[:, 0], col[:, 1], col[:, 2]], axis=1).astype(np.float32)
with open(os.path.join(OUT, 'estrellas.js'), 'w', encoding='utf8') as f:
    f.write('/* Estrellas brillantes extraídas de NASA/Goddard SVS Deep Star Maps 2020 (Hipparcos/Tycho-2; ESA). '
            'Por estrella: AR (°), Dec (°), brillo relativo, color R, G, B. Generado por tools/preparar-cielo-blender.py */\n')
    f.write('window.ICE_STARS = { n: %d, data: "%s" };\n' % (len(data), base64.b64encode(data.tobytes()).decode('ascii')))

# --- fondo: Vía Láctea + todas las estrellas, codificado en sRGB
sky = mw + st
L = sky @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BLANCO = float(np.percentile(L, 99.97))
print('percentiles de luminancia 50/99/99.97:', np.percentile(L, 50), np.percentile(L, 99), BLANCO)
x = np.clip(sky / BLANCO, 0, 1)
srgb = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055).astype(np.float32)
LMC = (int((0.5 - 80.9 / 360) * W), int((90 - 69.75) / 180 * H))
print('brillo medio en la Gran Nube de Magallanes vs. alrededor:', float(L[LMC[1]-20:LMC[1]+20, LMC[0]-20:LMC[0]+20].mean()), float(np.median(L)))

sc = bpy.context.scene
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 90
for size in (8192, 4096, 2048):
    k = W // size
    a = srgb if k == 1 else srgb.reshape(H // k, k, W // k, k, 3).mean(axis=(1, 3))
    h, w = a.shape[:2]
    img = bpy.data.images.new('cielo_%d' % size, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.dstack([a, np.ones((h, w), np.float32)]).ravel())
    path = os.path.join(OUT, 'cielo_%dk.jpg' % (size // 1024))
    img.filepath_raw = path
    img.file_format = 'JPEG'
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)
    print('guardado', path, os.path.getsize(path) // 1024, 'KB')
json.dump({'blanco': BLANCO, 'n_estrellas': int(len(data))}, open(os.path.join(OUT, 'cielo.json'), 'w'))
