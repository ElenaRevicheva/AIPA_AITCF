import bpy, math, sys, os
glb = sys.argv[sys.argv.index("--")+1]; out = sys.argv[sys.argv.index("--")+2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in bpy.data.objects:
    if o.type=="MESH" and o.data.shape_keys:
        nz=[(k.name,round(k.value,2)) for k in o.data.shape_keys.key_blocks if k.value>0.01 and k.name!="Basis"]
        if nz: print("NONZERO", o.name, nz[:8])
    if o.type=="MESH":
        for m in o.data.materials:
            if m: print("MAT", o.name[:30], m.name[:30], getattr(m,"blend_method",None), getattr(m,"surface_render_method",None))
scene=bpy.context.scene; scene.render.engine="BLENDER_EEVEE_NEXT"; scene.render.resolution_x, scene.render.resolution_y = 600, 750
cd=bpy.data.cameras.new("c"); c=bpy.data.objects.new("c",cd); scene.collection.objects.link(c); c.location=(0,-0.95,1.37); c.rotation_euler=(math.radians(90),0,0); cd.lens=55; scene.camera=c
for loc,en in (((1,-1.4,1.9),60),((-1.2,-1,1.6),25)):
    ld=bpy.data.lights.new("l","AREA"); ld.energy=en; ld.size=1.5; lo=bpy.data.objects.new("l",ld); lo.location=loc; scene.collection.objects.link(lo); lo.rotation_euler=(math.radians(60),0,math.atan2(loc[0],-loc[1]))
scene.world=bpy.data.worlds.new("w"); scene.world.color=(0.25,0.23,0.27)
scene.render.filepath=out; bpy.ops.render.render(write_still=True); print("RENDER", out)
