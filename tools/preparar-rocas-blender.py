"""Optimiza las rocas lunares escaneadas de Poly Haven (moon_rock_01…07, licencia CC0) para la web.

    blender -b --factory-startup --python tools/preparar-rocas-blender.py -- <carpeta_polyhaven> <salida.glb>

Cada roca se centra con la base en el suelo, se normaliza a 1 m de ancho, se reduce a ~2500 triángulos y se exporta
en un único GLB con compresión Draco y texturas JPEG de 1024 px. La web las usa como rocas instanciadas.
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
names = []
for i in range(1, 8):
    n = 'moon_rock_0%d' % i
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, n, n + '.gltf'))
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tris0 = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris0 > 2600:
        m = o.modifiers.new('Reducir', 'DECIMATE'); m.ratio = 2500 / tris0
        bpy.ops.object.modifier_apply(modifier=m.name)
    # centrar en XY (Blender Z arriba), base en z = 0, ancho máximo 1 m
    import mathutils
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    mn = mathutils.Vector([min(v[k] for v in bb) for k in range(3)]); mx = mathutils.Vector([max(v[k] for v in bb) for k in range(3)])
    s = 1.0 / max(mx.x - mn.x, mx.y - mn.y)
    o.data.transform(mathutils.Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    o.data.transform(mathutils.Matrix.Scale(s, 4))
    o.location = (i * 2.0, 0, 0); o.name = n; o.data.name = n
    tris1 = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(n, 'triángulos', tris0, '→', tris1, 'alto/ancho', round((mx.z - mn.z) * s, 2))
    names.append(n)
# texturas a 1024 px
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=85,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_apply=True)
print('guardado', OUT, os.path.getsize(OUT) // 1024, 'KB')
