#!/usr/bin/env python3
"""Build and render the shared-camera layered Shuttergate Blender source."""
from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "outputs"
BLEND = HERE / "layered-shuttergate.blend"
MANIFEST = HERE / "render-manifest.json"
random.seed(286)

OUTPUT_CONTRACT = {
    "environment-base.png": "opaque-environment-only",
    "entrance-shell.png": "straight-alpha-foreground-only",
    "gantry-shell.png": "straight-alpha-foreground-only",
    "route-subjects.png": "straight-alpha-diagnostic-only",
    "reference-plate.png": "opaque-environment-plus-foreground",
    "route-traversal.png": "opaque-diagnostic-only",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_image(path, alpha_semantics):
    from array import array

    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        assert tuple(image.size) == (1280, 720), f"unexpected dimensions: {path}"
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        alphas = pixels[3::4]
        minimum = min(alphas)
        maximum = max(alphas)
        if alpha_semantics.startswith("straight-alpha"):
            assert minimum == 0.0 and maximum == 1.0, f"invalid alpha isolation: {path}"
        else:
            assert minimum == 1.0 and maximum == 1.0, f"unexpected transparency: {path}"
    finally:
        bpy.data.images.remove(image)


def verify_existing():
    assert BLEND.is_file(), f"missing editable source: {BLEND}"
    assert MANIFEST.is_file(), f"missing render manifest: {MANIFEST}"
    manifest = json.loads(MANIFEST.read_text())
    assert set(manifest) == {"schemaVersion", "blenderVersion", "camera", "collections", "source", "outputs"}
    assert manifest["schemaVersion"] == 1
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    scene = bpy.context.scene
    cameras = [obj for obj in bpy.data.objects if obj.type == "CAMERA"]
    assert len(cameras) == 1 and cameras[0].name == "CAMERA_Shuttergate_Ortho"
    assert scene.camera == cameras[0]
    assert cameras[0].data.type == "ORTHO" and cameras[0].data.ortho_scale == 36.0
    assert scene.get("layer_contract") == "issue-286-shared-camera-v1"
    expected_collections = {
        "ENVIRONMENT_BASE",
        "FOREGROUND_ENTRANCE",
        "FOREGROUND_GANTRY",
        "DIAGNOSTIC_ROUTE_SUBJECTS",
        "SHARED_LIGHTING",
    }
    assert set(manifest["collections"]) == expected_collections
    assert expected_collections <= set(bpy.data.collections.keys())
    assert manifest["source"]["builderSha256"] == sha256(Path(__file__).resolve())
    assert manifest["source"]["blendSha256"] == sha256(BLEND)
    assert set(manifest["outputs"]) == set(OUTPUT_CONTRACT)
    for name, alpha_semantics in OUTPUT_CONTRACT.items():
        path = OUT / name
        record = manifest["outputs"][name]
        assert set(record) == {"width", "height", "alphaSemantics", "sha256"}
        assert record == {
            "width": 1280,
            "height": 720,
            "alphaSemantics": alpha_semantics,
            "sha256": sha256(path),
        }
        verify_image(path, alpha_semantics)
    print("SHARED_SCENE_VERIFY_OK", BLEND, MANIFEST)


def mat(name, color, metallic=0.0, roughness=0.75, emission=None, strength=0.0, texture_scale=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if texture_scale:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = texture_scale
        noise.inputs["Detail"].default_value = 5.0
        noise.inputs["Roughness"].default_value = 0.72
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*tuple(max(0.0, c * 0.45) for c in color), 1.0)
        ramp.color_ramp.elements[1].color = (*tuple(min(1.0, c * 1.65 + 0.025) for c in color), 1.0)
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.28
        bump.inputs["Distance"].default_value = 0.18
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def move_to(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def box(name, loc, scale, material, coll, bevel=0.08, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("worn_edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    o.data.materials.append(material)
    move_to(o, coll)
    return o


def cylinder(name, loc, radius, depth, material, coll, vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    mod = o.modifiers.new("worn_edges", "BEVEL")
    mod.width = 0.08
    mod.segments = 2
    move_to(o, coll)
    return o


def area_light(name, loc, energy, color, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    o = bpy.context.object
    o.name = name
    o.data.energy = energy
    o.data.color = color
    o.data.shape = "DISK"
    o.data.size = size
    o.rotation_euler = ((Vector((0, 0, 1.5)) - o.location).to_track_quat("-Z", "Y")).to_euler()
    move_to(o, LIGHTS)


def camera():
    bpy.ops.object.camera_add(location=(22.0, -28.0, 23.0))
    o = bpy.context.object
    o.name = "CAMERA_Shuttergate_Ortho"
    target = Vector((0, 0, 1.8))
    o.rotation_euler = ((target - o.location).to_track_quat("-Z", "Y")).to_euler()
    o.data.type = "ORTHO"
    o.data.ortho_scale = 36.0
    bpy.context.scene.camera = o
    return o


def render(name, env, entrance, gantry, subjects, transparent):
    ENV.hide_render = not env
    ENTRANCE.hide_render = not entrance
    GANTRY.hide_render = not gantry
    SUBJECTS.hide_render = not subjects
    scene = bpy.context.scene
    scene.render.film_transparent = transparent
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


verify_requested = "--" in sys.argv and "--verify" in sys.argv[sys.argv.index("--") + 1 :]
if verify_requested:
    verify_existing()
    raise SystemExit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
OUT.mkdir(parents=True, exist_ok=True)
ENV = collection("ENVIRONMENT_BASE")
ENTRANCE = collection("FOREGROUND_ENTRANCE")
GANTRY = collection("FOREGROUND_GANTRY")
SUBJECTS = collection("DIAGNOSTIC_ROUTE_SUBJECTS")
LIGHTS = collection("SHARED_LIGHTING")

stone = mat("Basalt", (0.06, 0.085, 0.11), roughness=0.9, texture_scale=3.5)
stone2 = mat("CarvedStone", (0.12, 0.15, 0.17), roughness=0.85, texture_scale=5.0)
roadmat = mat("RoadStone", (0.18, 0.20, 0.19), roughness=0.95, texture_scale=7.0)
timber = mat("Ironwood", (0.15, 0.065, 0.028), roughness=0.8, texture_scale=4.0)
iron = mat("BlackIron", (0.055, 0.065, 0.072), metallic=0.7, roughness=0.42)
ember = mat("Ember", (0.35, 0.08, 0.015), roughness=0.5, emission=(1.0, 0.16, 0.025), strength=6.0)
black = mat("TunnelVoid", (0.004, 0.006, 0.009), roughness=1.0)
route_blue = mat("RouteSubjectBlue", (0.02, 0.22, 0.42), metallic=0.35, roughness=0.35, emission=(0.02, 0.25, 0.8), strength=1.5)
route_gold = mat("RouteRingGold", (0.55, 0.23, 0.015), metallic=0.55, roughness=0.3, emission=(1.0, 0.24, 0.01), strength=2.0)

# Foundation and cavern floor.
box("CavernFloor", (0, 0, -0.6), (16.0, 17.0, 0.5), stone, ENV, bevel=0.15)
for x in (-12.2, 12.2):
    box(f"SideWall_{x}", (x, 0.2, 1.3), (2.2, 16.2, 1.8), stone, ENV, bevel=0.22)
    for y in range(-14, 15, 4):
        box(f"Buttress_{x}_{y}", (x - math.copysign(1.15, x), y, 2.4), (0.45, 0.7, 2.8), stone2, ENV, bevel=0.12)

# Broad non-branching road, with camera-consistent masonry slabs.
for i, y in enumerate(range(-15, 16, 2)):
    tone = roadmat if i % 2 == 0 else stone2
    box(f"RoadSlab_{i}", (0, y, 0.05), (4.2, 0.94, 0.18), tone, ENV, bevel=0.06)
    for x in (-4.65, 4.65):
        box(f"RoadKerb_{i}_{x}", (x, y, 0.28), (0.35, 0.94, 0.45), stone2, ENV, bevel=0.08)
    for x in (-3.35, 3.35):
        box(f"RoadRail_{i}_{x}", (x, y, 0.29), (0.09, 0.91, 0.07), iron, ENV, bevel=0.025)

# Painterly silhouette breakup: rubble stays on the shoulders, outside the tactical road.
for index in range(34):
    side = -1 if index % 2 == 0 else 1
    x = side * random.uniform(6.0, 9.2)
    y = random.uniform(-12.5, 12.5)
    size = random.uniform(0.18, 0.52)
    box(
        f"ShoulderRubble_{index}",
        (x, y, size * 0.45),
        (size, size * random.uniform(0.55, 1.15), size * random.uniform(0.35, 0.8)),
        stone2 if index % 3 else stone,
        ENV,
        bevel=0.05,
        rot=(random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), random.uniform(0, math.pi)),
    )

# Lower defended shutter and warm gate recess.
box("GateWall", (0, -15.2, 3.0), (11.8, 0.9, 3.4), stone, ENV, bevel=0.18)
box("GateRecess", (0, -16.12, 2.1), (3.5, 0.18, 2.2), black, ENV, bevel=0.03)
for x in (-2.2, -1.1, 0, 1.1, 2.2):
    box(f"ShutterBar_{x}", (x, -16.34, 2.0), (0.18, 0.20, 2.0), iron, ENV, bevel=0.04)
for x in (-4.4, 4.4):
    cylinder(f"GateTower_{x}", (x, -14.5, 3.0), 1.45, 6.0, stone2, ENV, vertices=10)
box("GateEmber", (0, -16.38, 0.35), (3.1, 0.16, 0.12), ember, ENV, bevel=0.02)

# Upper tunnel void and wall are base; the complete arch ring is a foreground collection.
box("TunnelBackWall", (0, 15.0, 3.5), (11.8, 0.9, 4.0), stone, ENV, bevel=0.2)
box("TunnelVoid", (0, 14.04, 2.45), (3.3, 0.16, 2.45), black, ENV, bevel=0.08)
box("TunnelGlow", (0, 13.96, 0.45), (3.0, 0.12, 0.16), ember, ENV, bevel=0.02)
for side in (-1, 1):
    x = side * 4.05
    for z in (0.65, 1.85, 3.05):
        box(f"ArchJamb_{side}_{z}", (x, 13.78, z), (0.70, 0.66, 0.58), stone2, ENTRANCE, bevel=0.11)
for n, theta in enumerate([15, 37, 59, 81, 99, 121, 143, 165]):
    rad = math.radians(theta)
    x = 4.05 * math.cos(rad)
    z = 3.15 + 1.85 * math.sin(rad)
    box(f"ArchVoussoir_{n}", (x, 13.78, z), (0.74, 0.66, 0.52), stone2, ENTRANCE, bevel=0.12, rot=(0, rad - math.pi/2, 0))

# Gantry foundations belong to the environment; supports/deck are canonical foreground.
for x in (-6.2, 6.2):
    box(f"GantryPlinth_{x}", (x, 1.2, 0.35), (1.05, 1.15, 0.45), stone2, ENV, bevel=0.14)
    box(f"GantryPost_{x}", (x, 1.2, 3.0), (0.48, 0.58, 2.7), timber, GANTRY, bevel=0.10)
    box(f"GantryIronFoot_{x}", (x, 1.2, 0.92), (0.68, 0.72, 0.18), iron, GANTRY, bevel=0.04)
box("GantryMainBeam", (0, 1.2, 5.6), (7.2, 0.72, 0.50), timber, GANTRY, bevel=0.12)
box("GantryIronBand", (0, 1.2, 5.62), (7.12, 0.70, 0.12), iron, GANTRY, bevel=0.04)
for x in (-4.0, 0, 4.0):
    box(f"GantryBrace_{x}", (x, 1.2, 4.75), (0.16, 0.56, 1.05), iron, GANTRY, bevel=0.04, rot=(0, 0.45 if x <= 0 else -0.45, 0))

# Review-only route subjects prove the same-camera lane and overhead occlusion.
for index, y in enumerate((12.5, 8.5, 4.5, 1.2, -3.0, -7.0, -11.0, -14.0)):
    cylinder(f"RouteRing_{index}", (0, y, 0.34), 0.72, 0.08, route_gold, SUBJECTS, vertices=24)
    cylinder(f"RouteSubject_{index}", (0, y, 1.02), 0.42, 1.35, route_blue, SUBJECTS, vertices=12)
    cylinder(f"RouteHead_{index}", (0, y, 1.88), 0.34, 0.42, route_blue, SUBJECTS, vertices=12)

shared_camera = camera()
shared_camera.data.ortho_scale = 36.0
area_light("TunnelWarm", (0, 12.0, 6.0), 1200, (1.0, 0.25, 0.06), 5.0)
area_light("GateWarm", (0, -12.5, 4.5), 900, (1.0, 0.20, 0.04), 4.0)
area_light("CoolFill", (-5, -1, 15), 1800, (0.18, 0.36, 0.58), 10.0)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.view_layers[0].cycles.use_denoising = False
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world = bpy.data.worlds.new("CavernWorld")
scene.world.color = (0.008, 0.012, 0.020)
scene["layer_contract"] = "issue-286-shared-camera-v1"
scene["presentation_only"] = True

# Save the editable source with all collections visible, then emit same-camera passes.
ENV.hide_render = ENTRANCE.hide_render = GANTRY.hide_render = False
SUBJECTS.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
render("environment-base", True, False, False, False, False)
render("entrance-shell", False, True, False, False, True)
render("gantry-shell", False, False, True, False, True)
render("route-subjects", False, False, False, True, True)
render("reference-plate", True, True, True, False, False)
render("route-traversal", True, True, True, True, False)

manifest = {
    "schemaVersion": 1,
    "blenderVersion": ".".join(str(part) for part in bpy.app.version),
    "camera": {
        "name": shared_camera.name,
        "projection": "orthographic",
        "orthoScale": shared_camera.data.ortho_scale,
        "location": [round(value, 6) for value in shared_camera.location],
        "rotationEuler": [round(value, 6) for value in shared_camera.rotation_euler],
    },
    "collections": sorted((ENV.name, ENTRANCE.name, GANTRY.name, SUBJECTS.name, LIGHTS.name)),
    "source": {
        "builderSha256": sha256(Path(__file__).resolve()),
        "blendSha256": sha256(BLEND),
    },
    "outputs": {
        name: {
            "width": 1280,
            "height": 720,
            "alphaSemantics": semantics,
            "sha256": sha256(OUT / name),
        }
        for name, semantics in OUTPUT_CONTRACT.items()
    },
}
MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
verify_existing()
print("SHARED_SCENE_RENDER_OK", BLEND, OUT)
