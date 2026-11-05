# Stage 1 (run once): install MPFB asset packs + register the TalkingHead custom rig, following
# TalkingHead/blender/MPFB/MPFB.md ("Install the TalkingHead Blender add-on and assets") step by step.
# Run: blender.exe -b --online-mode --python stage1_setup.py
import bpy, os, sys, glob, zipfile

ASSETS = r"D:\tools\blender\assets"
TH = os.path.join(ASSETS, "th")

from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.services.assetservice import AssetService
from bl_ext.blender_org.mpfb.ui.create_assets.makerig import MakeRigProperties

data_dir = LocationService.get_user_data()
print("MPFB user data:", data_dir)

# 1) asset packs (same as Apply assets > Library Settings > Load pack from zip file, with FIX check)
done_file = os.path.join(ASSETS, "_installed.txt")
installed = set(open(done_file).read().split()) if os.path.exists(done_file) else set()
for z in sorted(glob.glob(os.path.join(ASSETS, "*.zip"))):
    if os.path.basename(z) in installed:
        continue
    if not zipfile.is_zipfile(z):
        print("PACK not complete yet, skipped:", os.path.basename(z)); continue
    open(done_file, "a").write(os.path.basename(z) + "\n")
    check = AssetService.check_asset_pack_zip(z)
    if check is None:
        with zipfile.ZipFile(z) as zf:
            zf.extractall(data_dir)
        print("PACK installed:", os.path.basename(z))
    else:
        res = AssetService.fix_and_extract_asset_pack_zip(z, data_dir)
        print("PACK fixed+installed:" if res is None else "PACK FAILED:", os.path.basename(z), res or "")
AssetService.update_all_asset_lists()

# 2) TalkingHead custom rig: dummy human -> load rig -> load weights -> save rig to library "talkinghead"
bpy.ops.mpfb.create_human()
basemesh = bpy.context.active_object
print("dummy human:", basemesh.name)
bpy.ops.mpfb.load_rig(filepath=os.path.join(TH, "talkinghead.mpfbskel"))
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
bpy.ops.object.select_all(action="DESELECT")
basemesh.select_set(True); bpy.context.view_layer.objects.active = basemesh
bpy.ops.mpfb.load_weights(filepath=os.path.join(TH, "talkinghead.mhw"))
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True); bpy.context.view_layer.objects.active = arm
scene = bpy.context.scene
MakeRigProperties.set_value("library_rig_name", "talkinghead", entity_reference=scene)
MakeRigProperties.set_value("library_identifying_bones", "LeftToe_End", entity_reference=scene)
try:
    MakeRigProperties.set_value("library_also_save_weights", True, entity_reference=scene)
except Exception as e:
    print("no also_save_weights prop:", e)
print(bpy.ops.mpfb.save_rig_to_library())
AssetService.invalidate_custom_rig_cache()
print("CUSTOM RIGS:", [r["name"] for r in AssetService.get_custom_rigs(use_cache=False)])
