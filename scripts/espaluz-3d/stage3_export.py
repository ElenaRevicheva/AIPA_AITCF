# Stage 3: MPFB "Export copy" with Meta visemes + ARKit face units, then glTF binary - TalkingHead MPFB.md "Export as GLB".
import bpy, os, sys
OUT = r"D:\tools\blender\espaluz\out"
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "espaluz_design.blend"))
from bl_ext.blender_org.mpfb.ui.operations.exportops.exportopspanel import EXPORTOPS_PROPERTIES
scene = bpy.context.scene
for k, v in {"mask_modifiers": "BAKE", "subdiv_modifiers": "BAKE", "bake_shapekeys": True, "delete_helpers": True,
             "visemes_meta": True, "faceunits_arkit": True, "interpolate": True, "collection": True}.items():
    EXPORTOPS_PROPERTIES.set_value(k, v, entity_reference=scene)
rig = bpy.data.objects["EspaLuz.rig"]
bpy.ops.object.select_all(action="DESELECT"); rig.select_set(True); bpy.context.view_layer.objects.active = rig
print("export_copy:", bpy.ops.mpfb.export_copy())
copy_rig = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o.name != "EspaLuz.rig")
copy_rig.name = "Armature"
objs = [copy_rig] + [c for c in copy_rig.children_recursive]
bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = copy_rig
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
head = next((o for o in objs if o.type == "MESH" and o.data.shape_keys and "viseme_aa" in o.data.shape_keys.key_blocks), None)
print("shape keys on", head.name if head else None, ":", len(head.data.shape_keys.key_blocks) if head else 0,
      [k for k in ("viseme_aa","viseme_O","viseme_PP","jawOpen","eyeBlinkLeft","mouthSmileLeft") if head and k in head.data.shape_keys.key_blocks])
# TalkingHead MPFB.md "Update materials for glTF/GLB": OPAQUE for solid meshes, MASK (alpha clip) for hair/brows/lashes.
for o in objs:
    if o.type != "MESH": continue
    cut = any(k in o.name for k in ("hair", "eyebrow", "eyelash"))
    for m in o.data.materials:
        if not m or not m.use_nodes: continue
        nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf: continue
        a = bsdf.inputs["Alpha"]
        if cut and a.is_linked:
            src = a.links[0].from_socket
            gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = (0.15 if "eyebrow" in o.name or "eyelash" in o.name else 0.5)
            nt.links.new(src, gt.inputs[0]); nt.links.new(gt.outputs[0], a)
            m.blend_method = "CLIP" if hasattr(m, "blend_method") else m.blend_method
        else:
            for l in list(a.links): nt.links.remove(l)
            a.default_value = 1.0
            m.blend_method = "OPAQUE"
        try: m.surface_render_method = "DITHERED"
        except Exception: pass
        print("material", o.name[:28], "->", "MASK" if cut else "OPAQUE")
glb = os.path.join(OUT, "espaluz.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_animations=False)
print("GLB", glb, os.path.getsize(glb))
