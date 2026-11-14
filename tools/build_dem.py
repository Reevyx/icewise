"""
ICEWISE — Preprocesado del DEM real de LOLA (NASA PGDA, Site04: Shackleton rim, 5 m/pix)
1. Reduce a 20 m/pix y calcula horizontes por acimut (con curvatura lunar).
2. Sombra permanente (PSR): en sombra incluso con el Sol a su máxima elevación (1,54°) en todos los acimuts.
3. Fracción iluminada: acimuts en los que el horizonte queda bajo 0,9° (Sol típico).
4. Elige una ventana de 3,2 km con: sitio iluminado y plano (estación + colonia), PSR transitable y borde del cráter.
5. Exporta js/dem-shackleton.js (10 m/pix) e imagen de relieve para la propuesta.
"""
import sys, json, base64, math, os
import numpy as np, tifffile
from PIL import Image, ImageDraw

SRC, OUT_JS, OUT_IMG = sys.argv[1], sys.argv[2], sys.argv[3]
R = 1737400.0
a = tifffile.imread(SRC).astype(np.float32)           # 3200 x 3200, 5 m
X0, Y0 = -9000.0, 1000.0                                 # esquina superior izquierda (m, estereográfica polar)

def down(arr, f):
    h, w = arr.shape; return arr[:h // f * f, :w // f * f].reshape(h // f, f, w // f, f).mean(axis=(1, 3))

H20 = down(a, 4)                                         # 800 x 800, 20 m
n = H20.shape[0]; dpx = 20.0
gy, gx = np.gradient(H20, dpx); slope20 = np.degrees(np.arctan(np.hypot(gx, gy)))

def horizon(az_deg, max_dist=6000.0):
    """Ángulo máximo del horizonte (rad) en la dirección az (0 = +X, 90 = +Z hacia abajo en la imagen)."""
    az = math.radians(az_deg); dx, dz = math.cos(az), math.sin(az)
    best = np.full(H20.shape, -1.0, np.float32)
    jj, ii = np.mgrid[0:n, 0:n]
    for k in range(1, int(max_dist / dpx)):
        d = k * dpx
        si = np.rint(ii + dx * k).astype(int); sj = np.rint(jj + dz * k).astype(int)
        ok = (si >= 0) & (si < n) & (sj >= 0) & (sj < n)
        hs = np.where(ok, H20[np.clip(sj, 0, n - 1), np.clip(si, 0, n - 1)], -1e9)
        ang = (hs - H20 - d * d / (2 * R)) / d                # tan aproximada (ángulos pequeños)
        best = np.maximum(best, ang.astype(np.float32))
    return np.arctan(best)

AZ = list(range(0, 360, 15))
cache = os.path.join(os.path.dirname(SRC), 'hz_cache.npy')
if os.path.exists(cache): hz = np.load(cache)
else: hz = np.stack([horizon(az) for az in AZ]); np.save(cache, hz)
print('litfrac percentiles', np.percentile((hz < math.radians(0.9)).mean(axis=0), [50, 90, 99, 99.9]))
psr = (hz > math.radians(1.54)).all(axis=0)
litfrac = (hz < math.radians(0.9)).mean(axis=0)
SUN_AZ = float(os.environ.get('SUN_AZ', '300'))          # acimut del Sol "actual" de la simulación
SUN_EL = 1.2
k_now = AZ.index(int(SUN_AZ))
shadow_now = hz[k_now] > math.radians(SUN_EL)
print('PSR fraction of tile:', psr.mean().round(3), ' lit>0.8:', (litfrac > 0.8).mean().round(3))

LIT_MIN = float(np.percentile(litfrac, 97))
print('LIT_MIN', LIT_MIN)
# Ventana de 3,2 km (160 px a 20 m)
W = 160; best = None
for j0 in range(0, n - W, 10):
    for i0 in range(0, n - W, 10):
        P = psr[j0:j0 + W, i0:i0 + W]; S = slope20[j0:j0 + W, i0:i0 + W]; L = litfrac[j0:j0 + W, i0:i0 + W]; Hh = H20[j0:j0 + W, i0:i0 + W]
        reach = (P & (S < 18)).mean()
        site = (L > LIT_MIN) & (S < 8)
        if reach < 0.04 or site.sum() < 150: continue
        relief = Hh.max() - Hh.min()
        score = min(reach, 0.12) * 4 + min(site.mean(), 0.08) * 4 + min(relief, 1500) / 1500
        if best is None or score > best[0]: best = (score, j0, i0, reach, site.mean(), relief)
print('best window', best)
_, j0, i0, reach, sitef, relief = best

# Sitio de la estación: punto con más iluminación y pendiente baja, cerca (0,7–1,8 km) de PSR transitable
P = psr[j0:j0 + W, i0:i0 + W]; S = slope20[j0:j0 + W, i0:i0 + W]; L = litfrac[j0:j0 + W, i0:i0 + W]
pj, pi = np.nonzero(P & (S < 18)); cand = []
for j in range(8, W - 8):
    for i in range(8, W - 8):
        if L[j, i] < LIT_MIN or S[j - 2:j + 3, i - 2:i + 3].max() > 9: continue
        d = np.hypot(pj - j, pi - i).min() * dpx
        if 300 < d < 1600: cand.append((L[j, i] - abs(d - 800) / 3000, j, i))
cand.sort(reverse=True)
_, sj, si = cand[0]
# Colonia: a ~150–300 m de la estación, también iluminada y plana
col = None; bestc = -1
for j in range(6, W - 6):
    for i in range(6, W - 6):
        d = math.hypot(j - sj, i - si) * dpx
        if not (140 < d < 420) or S[j - 2:j + 3, i - 2:i + 3].max() > 10 or P[j, i]: continue
        sc = L[j, i] - abs(d - 250) / 2000
        if sc > bestc: bestc = sc; col = (j, i)
print('station', sj, si, 'colony', col, 'lit', L[sj, si])

# Centroide de la mayor zona de PSR transitable (para la etiqueta)
lab = (int(pj.mean()), int(pi.mean()))

# Exportar a 10 m/pix: 321 x 321 vértices (3,2 km)
f = 2; H10 = down(a, f)
J0, I0 = j0 * 2, i0 * 2
N = W * 2 + 1
Hw = H10[J0:J0 + N, I0:I0 + N]
if Hw.shape != (N, N):
    raise SystemExit('ventana fuera de rango')
base = float(Hw.min())
Hdm = np.round((Hw - base) * 10).astype(np.int16)
up = lambda m: np.repeat(np.repeat(m, 2, 0), 2, 1)
psr10 = up(psr[j0:j0 + W + 1, i0:i0 + W + 1])[:N, :N].astype(np.uint8)
sh10 = up(shadow_now[j0:j0 + W + 1, i0:i0 + W + 1])[:N, :N].astype(np.uint8)
lit10 = np.round(up(litfrac[j0:j0 + W + 1, i0:i0 + W + 1])[:N, :N] * 100).astype(np.uint8)
STEP = 10.0; SIZE = (N - 1) * STEP; HALF = SIZE / 2
to_sim = lambda j20, i20: {'x': round((i20 - i0) * dpx - HALF, 1), 'z': round((j20 - j0) * dpx - HALF, 1)}
st = to_sim(j0 + sj, i0 + si); co = to_sim(j0 + col[0], i0 + col[1]); lb = to_sim(j0 + lab[0], i0 + lab[1])
Xc = X0 + (I0 + N / 2) * 10; Yc = Y0 - (J0 + N / 2) * 10
rho = math.hypot(Xc, Yc); lat = -90 + math.degrees(2 * math.atan(rho / (2 * R))); lon = math.degrees(math.atan2(Xc, Yc)) % 360
# Centro de Shackleton (89,67°S, 129,8°E) en coordenadas de la simulación
rs = 2 * R * math.tan(math.radians(0.33) / 2); Xs, Ys = rs * math.sin(math.radians(129.8)), rs * math.cos(math.radians(129.8))
shack = {'x': round(Xs - (X0 + I0 * 10) - HALF, 0), 'z': round((Y0 - J0 * 10) - Ys - HALF, 0)}
sun_az = math.radians(SUN_AZ); sun = {'x': math.cos(math.radians(SUN_EL)) * math.cos(sun_az), 'y': math.sin(math.radians(SUN_EL)), 'z': math.cos(math.radians(SUN_EL)) * math.sin(sun_az)}
b64 = lambda arr: base64.b64encode(arr.tobytes()).decode()
data = {'source': 'NASA GSFC PGDA · LOLA 5 m/pix · Site04 Shackleton rim (Barker et al. 2021)', 'N': N, 'STEP': STEP, 'SIZE': SIZE, 'base': round(base, 1),
        'H': b64(Hdm), 'psr': b64(psr10), 'shadow': b64(sh10), 'lit': b64(lit10), 'sun': sun, 'sunElevDeg': SUN_EL,
        'station': st, 'colony': co, 'psrLabel': lb, 'shackleton': shack, 'center': {'lat': round(lat, 3), 'lon': round(lon, 2)},
        'reliefM': round(float(Hw.max() - Hw.min()), 0), 'psrFrac': round(float(psr10.mean()), 3)}
with open(OUT_JS, 'w', encoding='utf8') as fh:
    fh.write('/* Topografía REAL del borde del cráter Shackleton (polo sur lunar).\n   Fuente: NASA GSFC PGDA, LOLA 5 m/pix, Site04 "Shackleton rim" (Barker et al. 2021, PSS 203:105119),\n   reducida a 10 m/pix. Sombra permanente e iluminación calculadas a partir del relieve (horizontes en 24 acimuts,\n   con curvatura lunar). El hielo de la simulación se coloca solo en esas sombras, pero su cantidad es SIMULADA. */\n')
    fh.write('window.IceDEM = ' + json.dumps(data) + ';\n')
print('js size KB', os.path.getsize(OUT_JS) // 1024, 'center', lat, lon, 'shackleton', shack, 'relief', data['reliefM'], 'psrFrac', data['psrFrac'])

# Imagen de relieve (16 km) con la ventana, la estación y la colonia
ls = np.array([-0.6, -0.8, 0.6]); ls /= np.linalg.norm(ls)
nx, ny = -gx, -gy; nz = np.ones_like(nx); nn = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
shade = np.clip((nx * ls[0] + ny * ls[1] + nz * ls[2]) / nn, 0, 1)
img = (40 + 190 * shade).astype(np.uint8)
rgb = np.stack([img, img, (img * 1.02).clip(0, 255).astype(np.uint8)], -1)
rgb[psr] = (rgb[psr] * np.array([0.35, 0.4, 0.75])).astype(np.uint8) + np.array([20, 26, 70], np.uint8)
im = Image.fromarray(rgb).resize((1200, 1200), Image.LANCZOS); d = ImageDraw.Draw(im); s = 1200 / n
d.rectangle([i0 * s, j0 * s, (i0 + W) * s, (j0 + W) * s], outline=(237, 237, 243), width=3)
for (jj, ii), c, r in [((j0 + sj, i0 + si), (82, 102, 235), 10), ((j0 + col[0], i0 + col[1]), (255, 255, 255), 8)]:
    d.ellipse([ii * s - r, jj * s - r, ii * s + r, jj * s + r], fill=c, outline=(23, 23, 33), width=2)
im.save(OUT_IMG, quality=90)
print('image saved')
