"""Empaqueta las texturas y datos de la portada y de «El reto» para abrir index.html con doble clic (file://).

Desde file:// el navegador no deja que WebGL lea imágenes sueltas ni que fetch() lea archivos,
pero sí carga archivos .js. Este script genera:

  assets/img/luna/luna-local.js  ->  window.ICE_MOON_LOCAL = { color, normal, tierra }
      (mapas LROC/LOLA de la Luna y la Tierra Blue Marble de la portada)
  assets/data/reto-local.js      ->  window.ICE_RETO_LOCAL = { mosaico, meta, bin, poloMeta, polo }
      (mosaico LROC del polo sur, relieve LOLA de Shackleton y del polo sur de «El reto»)
  (El rover, la estación y la colonia de «El reto» usan assets/models/modelos-locales.js, que genera
   tools/empaquetar-modelos.py para la simulación.)

La web solo carga estos archivos cuando se abre desde file://; en GitHub Pages o con un
servidor local usa los archivos normales.

Uso (desde la carpeta del proyecto), después de cambiar alguna de esas imágenes o datos:
    python tools/empaquetar-portada.py
"""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LUNA = ROOT / 'assets' / 'img' / 'luna'
DATA = ROOT / 'assets' / 'data'


def b64(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')


def jpg(path):
    return 'data:image/jpeg;base64,' + b64(path)


def main():
    luna = [
        '/* Texturas de la Luna incrustadas (mapas LROC y LOLA de la NASA, SVS 4720) y de la Tierra (NASA Blue Marble)',
        '   para abrir index.html con doble clic (file://), donde el navegador no deja leer imágenes sueltas desde WebGL.',
        '   Generado por tools/empaquetar-portada.py. No editar a mano. */',
        'window.ICE_MOON_LOCAL = {',
        f'  color: "{jpg(LUNA / "luna-color-2k.jpg")}",',
        f'  normal: "{jpg(LUNA / "luna-normal-2k.jpg")}",',
        f'  tierra: "{jpg(LUNA / "tierra-1k.jpg")}"',
        '};',
        '',
    ]
    (LUNA / 'luna-local.js').write_text('\n'.join(luna), encoding='utf8')

    meta = json.loads((DATA / 'shackleton.json').read_text(encoding='utf8'))
    reto = [
        '/* Datos de «El reto» incrustados para abrir index.html con doble clic (file://):',
        '   mosaico LROC WAC del polo sur (NASA/GSFC/ASU) y relieve LOLA de Shackleton (assets/data/shackleton.*).',
        '   Generado por tools/empaquetar-portada.py. No editar a mano. */',
        'window.ICE_RETO_LOCAL = {',
        f'  mosaico: "{jpg(ROOT / "assets" / "img" / "lro-south-pole.jpg")}",',
        f'  meta: {json.dumps(meta, ensure_ascii=False)},',
        f'  bin: "{b64(DATA / "shackleton.bin")}",',
        f'  poloMeta: {(DATA / "polo.json").read_text(encoding="utf8")},',
        f'  polo: "{b64(DATA / "polo.bin")}"',
        '};',
        '',
    ]
    (DATA / 'reto-local.js').write_text('\n'.join(reto), encoding='utf8')

    for p in (LUNA / 'luna-local.js', DATA / 'reto-local.js'):
        print(p.relative_to(ROOT), f'{p.stat().st_size / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
