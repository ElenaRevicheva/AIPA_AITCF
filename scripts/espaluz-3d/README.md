# EspaLuz 3D talking head — rebuild from code (5 Nov 2026)

Free pipeline, every piece reused (no bicycles): Blender 4.5 LTS (portable, `D:\tools\blender`) + MPFB 2.0.18 +
MakeHuman asset packs (CC0/CC-BY) + the TalkingHead project's MPFB rig/weights, following
`met4citizen/TalkingHead/blender/MPFB/MPFB.md`. Output plays in TalkingHead (MIT) with the free Edge voice.

```bash
B=/d/tools/blender/blender-4.5.15-windows-x64/blender.exe
$B -b --python stage1_setup.py                    # once: install packs, register "talkinghead" rig
$B -b --python stage2_build.py -- D:\tools\blender\espaluz\out   # build EspaLuz + preview.png
$B -b --python stage3_export.py                   # export copy: 15 Meta visemes + 52 ARKit, OPAQUE/MASK materials -> espaluz.glb
npx @gltf-transform/cli@4 optimize espaluz.glb espaluz-small.glb --compress meshopt --texture-compress webp --texture-size 1024
```

Look of record (Elena): light ash-blonde waves (hair `elvs_daisy_hair`, tint baked into texture), brown eyes
(`low-poly` eyes — high-poly cornea turns white when opaque), teal top (`toigo_fisherman_sweater`, tint baked), skin
`toigo_light_skin_with_natural_makeup`. Fixes learned: MPFB materials are all BLEND -> must be OPAQUE/MASK for the web;
shader tint nodes are dropped by glTF -> bake into the image; body poking through clothes -> ray test both directions
into the clothes' delete group + inverted MASK modifier.

Model + .blend + renders: `ascent-saas-builder/creatives/avatar-3d-20261105/v1` and OneDrive `AIdeazz-avatar-3d-20261105` (MD5SUMS).
Private demo: https://claude.ai/artifact/W7PXbDA1zwb5TbbEK1wWFE
