# Stage 2: build EspaLuz with MPFB, following TalkingHead/blender/MPFB/MPFB.md ("Create A New Avatar" + "Export as GLB").
# Run: blender.exe -b --python stage2_build.py -- <out_dir>
import bpy, os, sys, math

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else r"D:\tools\blender\espaluz\out"
os.makedirs(OUT, exist_ok=True)
DATA = os.path.join(os.environ.get("APPDATA", r"C:\Users\kirav\AppData\Roaming"),
                    r"Blender Foundation\Blender\4.5\extensions\.user\blender_org\mpfb\data")

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.ui.operations.exportops.exportopspanel import EXPORTOPS_PROPERTIES

# Look of record (Elena 5 Nov 2026): the EspaLuz on the website - woman ~30, light ash-blonde shoulder-length waves
# with a little grey, brown eyes, warm light skin, teal top. Hair tint sampled from hero-web-poster.jpg (~215,192,171).
HAIR = "elvs_daisy_hair"
SKIN = "toigo_light_skin_with_natural_makeup"
TOP = "toigo_fisherman_sweater"
HAIR_RGB = (0.98, 0.84, 0.64)
TOP_RGB = (0.36, 0.72, 0.68)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 0.0, "age": 0.53, "muscle": 0.45, "weight": 0.45, "height": 0.45, "proportions": 0.7})
basemesh = HumanService.create_human(macro_detail_dict=macro)
basemesh.name = "EspaLuz"
bpy.context.view_layer.objects.active = basemesh
print("human created")

rig = HumanService.add_custom_rig(basemesh, "custom.talkinghead")
print("rig:", rig.name if rig else None)

mt = "GAMEENGINE"
HumanService.set_character_skin(os.path.join(DATA, "skins", SKIN, SKIN + ".mhmat"), basemesh, skin_type=mt, material_instances=False)
def add(kind, name, folder=None):
    folder = folder or kind.lower()
    path = os.path.join(DATA, folder, name, name + ".mhclo")
    obj = HumanService.add_mhclo_asset(path, basemesh, asset_type=kind, subdiv_levels=0, material_type=mt)
    print("added", kind, name)
    return obj
eyes = add("Eyes", "low-poly")
add("Eyebrows", "eyebrow001")
add("Eyelashes", "eyelashes01")
add("Teeth", "teeth_base")
add("Tongue", "tongue01")
hair = add("Hair", HAIR)
top = add("Clothes", TOP, "clothes")

def tint(obj, rgb, desaturate=False, gain=1.15):
    """Bake the colour INTO the texture (glTF export drops shader tint nodes)."""
    import numpy as np
    if obj is None: return
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or not bsdf.inputs["Base Color"].is_linked: continue
        tex = bsdf.inputs["Base Color"].links[0].from_node
        if tex.type != "TEX_IMAGE" or tex.image is None: continue
        img = tex.image; w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
        if desaturate:
            L = (px[:, 0] * 0.299 + px[:, 1] * 0.587 + px[:, 2] * 0.114) * gain
            px[:, 0], px[:, 1], px[:, 2] = L * rgb[0], L * rgb[1], L * rgb[2]
        np.clip(px[:, :3], 0, 1, out=px[:, :3])
        new = bpy.data.images.new(img.name + "_espaluz", w, h, alpha=True)
        new.pixels.foreach_set(px.ravel()); new.pack()
        tex.image = new
        print("baked tint", obj.name, img.name, w, h)
# Hide every body vertex the top actually covers (ray from the skin outward hits the top within 6 cm), added to the
# top's own MPFB delete group - the sweater's shipped delete group misses a few chest vertices that poke through.
def hide_covered_body(body, cloth, max_dist=0.06):
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(cloth, dg)
    mw, cmw_inv = body.matrix_world, cloth.matrix_world.inverted()
    gname = next((g.name for g in body.vertex_groups if g.name.startswith("Delete.") and TOP in g.name), None)
    vg = body.vertex_groups[gname] if gname else body.vertex_groups.new(name="Delete." + TOP)
    hits = []
    for v in body.data.vertices:
        co = cmw_inv @ (mw @ v.co); n = (cmw_inv.to_3x3() @ (mw.to_3x3() @ v.normal)).normalized()
        loc, _, _, d = tree.ray_cast(co, n, max_dist)
        if loc is None:  # a vertex poking THROUGH the top has the top behind it
            loc, _, _, d = tree.ray_cast(co, -n, 0.04)
        if loc is not None: hits.append(v.index)
    vg.add(hits, 1.0, "REPLACE")
    if not any(m.type == "MASK" and m.vertex_group == vg.name for m in body.modifiers):
        mm = body.modifiers.new(name=vg.name, type="MASK"); mm.vertex_group = vg.name; mm.invert_vertex_group = True
    print("hidden under top:", len(hits), "vertices in", vg.name, "| body modifiers:", [m.type + ":" + (m.vertex_group or "") for m in body.modifiers if m.type == "MASK"])
hide_covered_body(basemesh, top)
tint(hair, HAIR_RGB, desaturate=True)
tint(top, TOP_RGB, desaturate=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "espaluz_design.blend"))
if os.environ.get("HIDE_BODY"): basemesh.hide_render = True

# Preview render of the head (EEVEE), before export
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 720, 900
head_z = max(v.co.z for v in basemesh.data.vertices) * basemesh.matrix_world.to_scale().z
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam)
cam.location = (0, -0.95, head_z - 0.30); cam.rotation_euler = (math.radians(90), 0, 0); cam_data.lens = 55
scene.camera = cam
for loc, en in (((1.0, -1.4, head_z + 0.3), 60), ((-1.2, -1.0, head_z), 25)):
    ld = bpy.data.lights.new("l", "AREA"); ld.energy = en; ld.size = 1.5
    lo = bpy.data.objects.new("l", ld); lo.location = loc; scene.collection.objects.link(lo)
    lo.rotation_euler = (math.radians(60), 0, math.atan2(loc[0], -loc[1]))
scene.world = scene.world or bpy.data.worlds.new("w"); scene.world.color = (0.25, 0.23, 0.27)
scene.view_settings.view_transform = "AgX"
scene.render.filepath = os.path.join(OUT, "preview.png")
bpy.ops.render.render(write_still=True)
print("PREVIEW", scene.render.filepath, "head_z", head_z)
