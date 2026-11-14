"""Extrae ~60 000 estrellas reales de NASA/Goddard SVS Deep Star Maps 2020 para dibujarlas como puntos nítidos.

    blender -b --factory-startup --python tools/preparar-estrellas-blender.py -- <carpeta_exr> <salida estrellas.js>

- Brillantes: máximos locales de hiptyc_2020_8k.exr (Hipparcos y Tycho-2).
- Débiles: máximos locales de milkyway_2020_8k.exr (Gaia DR2) que destacan sobre el brillo difuso de alrededor.
  Se concentran en la Vía Láctea, así que la banda se ve como un río de estrellas reales, no como una mancha.
Formato: Uint16 × 6 por estrella (AR, Dec, brillo en escala logarítmica, R, G, B), en base64, ordenadas de más a menos brillante.
Se usa Blender solo porque lee EXR sin instalar nada más.
"""
import bpy, sys, os, base64
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
N_HIP, N_GAIA = 26000, 36000


def load(name):
    img = bpy.data.images.load(os.path.join(SRC, name))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[:, :, :3].copy(), w, h          # fila 0 = abajo (Dec −90°)


def local_max(Y, H, W):
    pad = np.pad(Y, 1, mode='edge'); m = np.ones_like(Y, dtype=bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy: m &= Y >= pad[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
    return m


def box(Y, r):                                                  # media en una ventana (2r+1)², con vuelta horizontal
    P = np.pad(Y, ((r, r), (0, 0)), mode='edge'); P = np.concatenate([P[:, -r:], P, P[:, :r]], 1)
    c = np.cumsum(np.cumsum(np.pad(P, ((1, 0), (1, 0))), 0), 1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


lum = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
st, W, H = load('hiptyc_2020_8k.exr')
Y = st @ lum
POLE = np.zeros((H, 1), dtype=bool); POLE[4:H - 4] = True              # sin las filas del polo (píxeles estirados: estrellas falsas)
ys, xs = np.nonzero(local_max(Y, H, W) & (Y > np.percentile(Y, 99.3)) & POLE)
rgb = np.zeros((len(xs), 3))
for dy in range(-3, 4):
    for dx in range(-3, 4):
        rgb += st[np.clip(ys + dy, 0, H - 1), (xs + dx) % W]
flux = rgb @ lum
o = np.argsort(-flux)[:N_HIP]
hip = dict(x=xs[o], y=ys[o], rgb=rgb[o], flux=flux[o])
del st, Y
print('Hipparcos/Tycho:', len(o))

mw, _, _ = load('milkyway_2020_8k.exr')
Y = mw @ lum
bg = box(Y, 5)
c = Y - bg
cand = local_max(Y, H, W) & (c > 0) & (c > 2.5 * np.median(np.abs(c))) & POLE
ys, xs = np.nonzero(cand)
taken = np.zeros((H, W), dtype=bool)                            # no repetir estrellas ya tomadas de Hipparcos/Tycho
for dy in range(-2, 3):
    for dx in range(-2, 3):
        taken[np.clip(hip['y'] + dy, 0, H - 1), (hip['x'] + dx) % W] = True
keep = ~taken[ys, xs]; ys, xs = ys[keep], xs[keep]
cf = c[ys, xs]
o = np.argsort(-cf)[:N_GAIA]
ys, xs, cf = ys[o], xs[o], cf[o]
grgb = np.maximum(mw[ys, xs] - bg[ys, xs, None] * 0.9, 1e-6)
print('Gaia (débiles):', len(o))

# brillo relativo común: las débiles quedan por debajo de la última brillante, con su escala propia
f_h = hip['flux'] / hip['flux'][0]
f_g = cf / cf[0] * f_h[-1] * 0.9
X = np.concatenate([hip['x'], xs]); Yy = np.concatenate([hip['y'], ys])
rel = np.concatenate([f_h, f_g]); col = np.concatenate([hip['rgb'], grgb])
col = col / np.maximum(col.max(axis=1, keepdims=True), 1e-9)
ra = ((0.5 - (X + 0.5) / W) * 360.0) % 360.0
dec = -90.0 + (Yy + 0.5) / H * 180.0
u16 = lambda v: np.clip(np.round(v * 65535), 0, 65535).astype(np.uint16)
data = np.stack([u16(ra / 360.0), u16((dec + 90.0) / 180.0), u16(np.clip((np.log10(np.maximum(rel, 1e-9)) + 7) / 7, 0, 1)),
                 u16(col[:, 0]), u16(col[:, 1]), u16(col[:, 2])], axis=1)
with open(OUT, 'w', encoding='utf8') as f:
    f.write('/* %d estrellas reales extraídas de NASA/Goddard SVS Deep Star Maps 2020 (Hipparcos/Tycho-2 y Gaia DR2; ESA). '
            'Uint16 × 6 por estrella: AR, Dec, brillo (log10 relativo + 7) / 7, R, G, B. Generado por tools/preparar-estrellas-blender.py */\n' % len(data))
    f.write('window.ICE_STARS = { n: %d, fmt: "u16", data: "%s" };\n' % (len(data), base64.b64encode(data.tobytes()).decode('ascii')))
print('guardado', OUT, os.path.getsize(OUT) // 1024, 'KB')
