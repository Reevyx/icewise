"""Empaqueta los modelos 3D para poder abrir index.html con doble clic (file://).

Los navegadores no dejan leer archivos .glb ni el decodificador Draco desde file://,
pero sí cargan archivos .js. Este script mete los modelos listados en
assets/models/models.json y el decodificador Draco en assets/models/modelos-locales.js.

La web solo carga ese archivo cuando se abre desde file://; en GitHub Pages o con un
servidor local usa los .glb normales.

Uso (desde la carpeta del proyecto), después de exportar un modelo nuevo desde Blender:
    python tools/empaquetar-modelos.py
"""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODELS = ROOT / 'assets' / 'models'
DRACO = ROOT / 'assets' / 'vendor' / 'draco170'

def b64(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')

def main():
    names = json.loads((MODELS / 'models.json').read_text(encoding='utf8'))
    parts = [
        '/* Generado por tools/empaquetar-modelos.py: modelos y decodificador Draco para abrir la web con doble clic (file://). No editar a mano. */',
        'window.ICE_DRACO = {',
        f'  wrapper: {json.dumps((DRACO / "draco_wasm_wrapper.js").read_text(encoding="utf8"))},',
        f'  wasm: "{b64(DRACO / "draco_decoder.wasm")}"',
        '};',
        'window.ICE_EMBED = {',
    ]
    for name in names:
        glb = MODELS / f'{name}.glb'
        if glb.exists():
            parts.append(f'  {json.dumps(name)}: "{b64(glb)}",')
            print(f'  {glb.name}: {glb.stat().st_size / 1024:.0f} KB')
    parts.append('};')
    out = MODELS / 'modelos-locales.js'
    out.write_text('\n'.join(parts) + '\n', encoding='utf8')
    print(f'Escrito {out.relative_to(ROOT)} ({out.stat().st_size / 1024 / 1024:.1f} MB)')

if __name__ == '__main__':
    main()
