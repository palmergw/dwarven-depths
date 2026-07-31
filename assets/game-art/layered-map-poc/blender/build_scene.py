#!/usr/bin/env python3
"""Build and render the shared-camera layered Shuttergate Blender source."""
from __future__ import annotations

import hashlib
import json
import math
import random
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "outputs"
BLEND = HERE / "layered-shuttergate.blend"
MANIFEST = HERE / "render-manifest.json"
CAMERA_ORTHO_SCALE = 50.0
RENDER_HEIGHT = 720
WARDEN_SOURCE = HERE.parent.parent / "production-scene" / "exports" / "entities" / "iron-warden-idle.png"
RAIDER_SOURCE = HERE.parent.parent / "production-scene" / "exports" / "entities" / "mine-raider-idle.png"
random.seed(286)

OUTPUT_CONTRACT = {
    "environment-base.png": "opaque-environment-only",
    "entrance-shell.png": "straight-alpha-foreground-only",
    "gantry-shell.png": "straight-alpha-foreground-only",
    "route-subjects.png": "straight-alpha-diagnostic-only",
    "production-sprite-subjects.png": "straight-alpha-production-entities-only",
    "reference-plate.png": "opaque-environment-plus-foreground",
    "route-traversal.png": "opaque-diagnostic-only",
    "production-sprite-traversal.png": "opaque-production-entity-diagnostic-only",
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


def verify_source_sprite(path, canvas):
    from array import array

    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        assert tuple(image.size) == tuple(canvas), f"unexpected source sprite dimensions: {path}"
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        alphas = pixels[3::4]
        assert min(alphas) == 0.0 and max(alphas) == 1.0, f"invalid source sprite alpha: {path}"
    finally:
        bpy.data.images.remove(image)


def verify_existing():
    assert BLEND.is_file(), f"missing editable source: {BLEND}"
    assert MANIFEST.is_file(), f"missing render manifest: {MANIFEST}"
    manifest = json.loads(MANIFEST.read_text())
    assert set(manifest) == {"schemaVersion", "blenderVersion", "camera", "collections", "source", "sourceAssets", "outputs"}
    assert manifest["schemaVersion"] == 1
    assert manifest["blenderVersion"] == ".".join(str(part) for part in bpy.app.version)
    assert set(manifest["camera"]) == {"name", "projection", "orthoScale", "location", "rotationEuler"}
    assert set(manifest["source"]) == {"builderSha256", "blendSha256"}
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    scene = bpy.context.scene
    cameras = [obj for obj in bpy.data.objects if obj.type == "CAMERA"]
    assert len(cameras) == 1 and cameras[0].name == "CAMERA_Shuttergate_Ortho"
    assert scene.camera == cameras[0]
    assert cameras[0].data.type == "ORTHO" and cameras[0].data.ortho_scale == CAMERA_ORTHO_SCALE
    assert scene.get("layer_contract") == "issue-286-shared-camera-v1"
    expected_collections = {
        "ENVIRONMENT_BASE",
        "FOREGROUND_ENTRANCE",
        "FOREGROUND_GANTRY",
        "DIAGNOSTIC_ROUTE_SUBJECTS",
        "PRODUCTION_ROUTE_SUBJECTS",
        "SHARED_LIGHTING",
    }
    assert set(manifest["collections"]) == expected_collections
    assert expected_collections == set(bpy.data.collections.keys())
    assert manifest["camera"] == {
        "name": cameras[0].name,
        "projection": "orthographic",
        "orthoScale": cameras[0].data.ortho_scale,
        "location": [round(value, 6) for value in cameras[0].location],
        "rotationEuler": [round(value, 6) for value in cameras[0].rotation_euler],
    }
    assert manifest["source"]["builderSha256"] == sha256(Path(__file__).resolve())
    assert manifest["source"]["blendSha256"] == sha256(BLEND)
    expected_source_assets = {
        "ironWardenIdle": {
            "path": str(WARDEN_SOURCE.relative_to(HERE.parents[3])),
            "sha256": sha256(WARDEN_SOURCE),
            "canvas": [112, 72],
            "pivot": [56, 66],
            "nominalHeight": 56,
            "alphaSemantics": "straight-alpha-padded-pivot",
        },
        "mineRaiderIdle": {
            "path": str(RAIDER_SOURCE.relative_to(HERE.parents[3])),
            "sha256": sha256(RAIDER_SOURCE),
            "canvas": [80, 60],
            "pivot": [40, 54],
            "nominalHeight": 44,
            "alphaSemantics": "straight-alpha-padded-pivot",
        },
    }
    assert manifest["sourceAssets"] == expected_source_assets
    verify_source_sprite(WARDEN_SOURCE, expected_source_assets["ironWardenIdle"]["canvas"])
    verify_source_sprite(RAIDER_SOURCE, expected_source_assets["mineRaiderIdle"]["canvas"])
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


def verify_or_exit():
    try:
        verify_existing()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)


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


def cylinder(name, loc, radius, depth, material, coll, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    mod = o.modifiers.new("worn_edges", "BEVEL")
    mod.width = 0.08
    mod.segments = 2
    move_to(o, coll)
    return o


def sprite_material(name, path):
    image = bpy.data.images.load(str(path), check_existing=True)
    image.alpha_mode = "STRAIGHT"
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    emission.inputs["Strength"].default_value = 1.0
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(texture.outputs["Alpha"], mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def billboard_sprite(name, ground, canvas, pivot, material, coll, camera_obj):
    """Place a pixel-exact camera-facing canvas with its declared pivot on the floor."""
    world_per_pixel = CAMERA_ORTHO_SCALE / RENDER_HEIGHT
    width, height = canvas
    pivot_x, pivot_y = pivot
    left = -pivot_x * world_per_pixel
    right = (width - pivot_x) * world_per_pixel
    bottom = (pivot_y - height) * world_per_pixel
    top = pivot_y * world_per_pixel
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(
        [(left, bottom, 0), (right, bottom, 0), (right, top, 0), (left, top, 0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.uv_layers.new(name="UVMap")
    for loop, uv in zip(mesh.uv_layers.active.data, ((0, 0), (1, 0), (1, 1), (0, 1)), strict=True):
        loop.uv = uv
    obj = bpy.data.objects.new(name, mesh)
    obj.location = ground
    obj.rotation_euler = camera_obj.rotation_euler
    obj.data.materials.append(material)
    coll.objects.link(obj)
    return obj


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


def point_light(name, loc, energy, color, radius):
    bpy.ops.object.light_add(type="POINT", location=loc)
    o = bpy.context.object
    o.name = name
    o.data.energy = energy
    o.data.color = color
    o.data.shadow_soft_size = radius
    move_to(o, LIGHTS)


def camera():
    bpy.ops.object.camera_add(location=(30.0, -41.5, 32.0))
    o = bpy.context.object
    o.name = "CAMERA_Shuttergate_Ortho"
    # Bias the shared frame toward the defended shutter without losing the entrance.
    target = Vector((0, -4.0, 1.8))
    o.rotation_euler = ((target - o.location).to_track_quat("-Z", "Y")).to_euler()
    o.data.type = "ORTHO"
    o.data.ortho_scale = CAMERA_ORTHO_SCALE
    bpy.context.scene.camera = o
    return o


def render(name, env, entrance, gantry, subjects, production_subjects, transparent):
    ENV.hide_render = not env
    ENTRANCE.hide_render = not entrance
    GANTRY.hide_render = not gantry
    SUBJECTS.hide_render = not subjects
    PRODUCTION_SUBJECTS.hide_render = not production_subjects
    scene = bpy.context.scene
    scene.render.film_transparent = transparent
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


verify_requested = "--" in sys.argv and "--verify" in sys.argv[sys.argv.index("--") + 1 :]
if verify_requested:
    verify_or_exit()
    raise SystemExit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
OUT.mkdir(parents=True, exist_ok=True)
ENV = collection("ENVIRONMENT_BASE")
ENTRANCE = collection("FOREGROUND_ENTRANCE")
GANTRY = collection("FOREGROUND_GANTRY")
SUBJECTS = collection("DIAGNOSTIC_ROUTE_SUBJECTS")
PRODUCTION_SUBJECTS = collection("PRODUCTION_ROUTE_SUBJECTS")
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

# Monumental fortress hall: a larger authored world, not a camera-only zoom.
box("CavernFloor", (0, 0, -0.6), (20.0, 23.0, 0.5), stone, ENV, bevel=0.18)
for x in (-15.5, 15.5):
    box(f"FortressSideWall_{x}", (x, 0.0, 2.0), (2.6, 22.0, 2.5), stone, ENV, bevel=0.28)
    for y in range(-18, 19, 6):
        inner_x = x - math.copysign(1.75, x)
        box(f"MonumentalButtress_{x}_{y}", (inner_x, y, 4.0), (0.9, 1.35, 4.4), stone2, ENV, bevel=0.18)
        box(f"ButtressCrown_{x}_{y}", (inner_x, y, 8.15), (1.35, 1.75, 0.35), iron, ENV, bevel=0.08)

# Broad 42-unit non-branching defense road and open tactical shoulders.
for i, y in enumerate(range(-21, 22, 2)):
    tone = roadmat if i % 2 == 0 else stone2
    box(f"RoadSlab_{i}", (0, y, 0.05), (4.6, 0.94, 0.18), tone, ENV, bevel=0.06)
    for x in (-5.05, 5.05):
        box(f"RoadKerb_{i}_{x}", (x, y, 0.28), (0.35, 0.94, 0.45), stone2, ENV, bevel=0.08)
    for x in (-3.75, 3.75):
        box(f"RoadRail_{i}_{x}", (x, y, 0.29), (0.09, 0.91, 0.07), iron, ENV, bevel=0.025)

# Two broad off-route defense courts create visible formation space without
# branching the hostile lane. Their thresholds connect directly to the road.
for court_x, court_y, suffix in ((-9.0, -10.5, "LowerLeft"), (9.0, 10.5, "UpperRight")):
    box(f"DefenseCourt_{suffix}", (court_x, court_y, 0.0), (4.35, 5.0, 0.30), roadmat, ENV, bevel=0.14)
    box(
        f"CourtThreshold_{suffix}",
        (math.copysign(5.7, court_x), court_y, 0.12),
        (1.35, 2.8, 0.26),
        stone2,
        ENV,
        bevel=0.10,
    )
    cylinder(f"CourtDais_{suffix}", (court_x, court_y, 0.36), 1.75, 0.08, stone2, ENV, vertices=16)
    cylinder(f"CourtEmber_{suffix}", (court_x, court_y, 0.43), 0.34, 0.08, ember, ENV, vertices=12)
    for corner_y in (-4.15, 4.15):
        box(
            f"CourtMachinery_{suffix}_{corner_y}",
            (court_x + math.copysign(3.45, court_x), court_y + corner_y, 0.75),
            (0.55, 0.55, 0.75),
            stone2,
            ENV,
            bevel=0.14,
        )

# Irregular shoulder dressing stays well outside the active route.
for index in range(56):
    side = -1 if index % 2 == 0 else 1
    x = side * random.uniform(6.4, 12.0)
    y = random.choice((random.uniform(-18.5, -15.0), random.uniform(-5.0, 5.0), random.uniform(15.0, 18.5)))
    size = random.uniform(0.20, 0.65)
    box(
        f"ShoulderRubble_{index}",
        (x, y, size * 0.45),
        (size, size * random.uniform(0.55, 1.25), size * random.uniform(0.35, 0.85)),
        stone2 if index % 3 else stone,
        ENV,
        bevel=0.05,
        rot=(random.uniform(-0.18, 0.18), random.uniform(-0.18, 0.18), random.uniform(0, math.pi)),
    )

# Lower defended shutter: a destination-scale fortress machine rather than a small doorway.
box("GateWall", (0, -21.4, 4.2), (15.0, 1.0, 4.7), stone, ENV, bevel=0.24)
box("GateRecess", (0, -22.42, 3.0), (4.2, 0.18, 3.1), black, ENV, bevel=0.04)
for x in (-3.2, -2.1, -1.05, 0, 1.05, 2.1, 3.2):
    box(f"ShutterBar_{x}", (x, -22.64, 2.9), (0.20, 0.20, 2.9), iron, ENV, bevel=0.04)
for x in (-5.5, 5.5):
    cylinder(f"GateTower_{x}", (x, -20.5, 4.2), 1.8, 8.4, stone2, ENV, vertices=10)
    box(f"GateWinch_{x}", (x, -22.05, 5.2), (0.85, 0.45, 0.85), iron, ENV, bevel=0.12)
box("GateEmber", (0, -22.68, 0.42), (3.8, 0.16, 0.14), ember, ENV, bevel=0.02)

# Upper hostile approach. The arch shell remains the exact foreground artifact.
box("TunnelBackWall", (0, 21.0, 4.2), (15.0, 1.0, 4.7), stone, ENV, bevel=0.24)
box("TunnelVoid", (0, 19.94, 3.0), (4.0, 0.16, 3.0), black, ENV, bevel=0.10)
box("TunnelGlow", (0, 19.86, 0.48), (3.6, 0.12, 0.18), ember, ENV, bevel=0.02)
for side in (-1, 1):
    x = side * 4.75
    for z in (0.75, 2.15, 3.55):
        box(f"ArchJamb_{side}_{z}", (x, 19.68, z), (0.78, 0.72, 0.66), stone2, ENTRANCE, bevel=0.13)
for n, theta in enumerate([12, 31, 50, 69, 88, 107, 126, 145, 164]):
    rad = math.radians(theta)
    x = 4.75 * math.cos(rad)
    z = 3.75 + 2.15 * math.sin(rad)
    box(f"ArchVoussoir_{n}", (x, 19.68, z), (0.78, 0.72, 0.58), stone2, ENTRANCE, bevel=0.13, rot=(0, rad - math.pi/2, 0))

# Purposeful gantry: a high service bridge connecting two fortress bastions.
# The masonry bastions and approach platforms belong to the environment; there are
# no arbitrary floor posts. Units pass below the bridge between the two strongholds.
for x in (-9.0, 9.0):
    box(f"BridgeBastion_{x}", (x, 0.5, 4.0), (2.65, 3.2, 4.2), stone2, ENV, bevel=0.22)
    box(f"BridgeBastionPlinth_{x}", (x, 0.5, 0.45), (3.15, 3.65, 0.52), stone, ENV, bevel=0.16)
    box(f"BridgeApproach_{x}", (x + math.copysign(4.0, x), 0.5, 7.1), (2.1, 3.0, 0.48), stone2, ENV, bevel=0.14)
    cylinder(
        f"BridgeWinch_{x}",
        (x, 0.5, 7.65),
        0.72,
        1.1,
        iron,
        ENV,
        vertices=12,
        rot=(math.pi / 2, 0, 0),
    )
    box(f"BridgeWinchAxle_{x}", (x, 0.5, 7.65), (0.12, 0.85, 0.12), iron, ENV, bevel=0.03)

# Native foreground bridge/deck, keyed directly into the side bastions.
box("GantryDeck", (0, 0.5, 7.2), (9.0, 2.0, 0.50), timber, GANTRY, bevel=0.14)
box("GantryUnderbeam", (0, 0.5, 6.55), (9.15, 0.34, 0.32), iron, GANTRY, bevel=0.07)
for y in (-1.35, 2.35):
    box(f"GantryParapet_{y}", (0, y, 8.0), (9.0, 0.18, 0.22), iron, GANTRY, bevel=0.06)
    for x in (-8, -6, -4, -2, 0, 2, 4, 6, 8):
        box(f"GantryRailPost_{y}_{x}", (x, y, 7.65), (0.11, 0.16, 0.62), iron, GANTRY, bevel=0.035)
for x in (-7.5, -4.5, -1.5, 1.5, 4.5, 7.5):
    box(f"GantryDeckTie_{x}", (x, 0.5, 6.95), (0.16, 2.1, 0.22), iron, GANTRY, bevel=0.04)

# Review-only subjects show the long route and the bridge's purposeful overhead scale.
for index, y in enumerate((17.5, 13.0, 8.5, 4.0, 1.4, 0.5, -0.4, -4.0, -8.5, -13.0, -17.5)):
    cylinder(f"RouteRing_{index}", (0, y, 0.34), 0.72, 0.08, route_gold, SUBJECTS, vertices=24)
    cylinder(f"RouteSubject_{index}", (0, y, 1.02), 0.42, 1.35, route_blue, SUBJECTS, vertices=12)
    cylinder(f"RouteHead_{index}", (0, y, 1.88), 0.34, 0.42, route_blue, SUBJECTS, vertices=12)


shared_camera = camera()
warden_material = sprite_material("ApprovedIronWardenIdle", WARDEN_SOURCE)
raider_material = sprite_material("ApprovedMineRaiderIdle", RAIDER_SOURCE)
billboard_sprite(
    "ApprovedIronWarden_56px",
    (1.8, -8.5, 0.39),
    (112, 72),
    (56, 66),
    warden_material,
    PRODUCTION_SUBJECTS,
    shared_camera,
)
for index, (x, y) in enumerate(((0.5, 15.8), (-1.5, 12.3), (1.5, 8.8), (-1.5, 5.1), (-1.3, -3.4))):
    billboard_sprite(
        f"ApprovedMineRaider_{index}_44px",
        (x, y, 0.39),
        (80, 60),
        (40, 54),
        raider_material,
        PRODUCTION_SUBJECTS,
        shared_camera,
    )
area_light("TunnelWarm", (0, 17.5, 7.0), 1600, (1.0, 0.25, 0.06), 6.0)
area_light("GateWarm", (0, -18.0, 6.0), 1300, (1.0, 0.20, 0.04), 5.0)
area_light("BridgeWarm", (7.0, 0.5, 10.5), 900, (1.0, 0.28, 0.08), 4.0)
area_light("CoolFill", (-7, -1, 20), 2400, (0.18, 0.36, 0.58), 13.0)
point_light("GateFaceGlow", (0, -24.0, 5.0), 4200, (1.0, 0.16, 0.035), 4.5)
point_light("TunnelMouthGlow", (0, 18.2, 3.5), 850, (1.0, 0.22, 0.05), 2.0)

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
SUBJECTS.hide_render = PRODUCTION_SUBJECTS.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
render("environment-base", True, False, False, False, False, False)
render("entrance-shell", False, True, False, False, False, True)
render("gantry-shell", False, False, True, False, False, True)
render("route-subjects", False, False, False, True, False, True)
render("production-sprite-subjects", False, False, False, False, True, True)
render("reference-plate", True, True, True, False, False, False)
render("route-traversal", True, True, True, True, False, False)
render("production-sprite-traversal", True, True, True, False, True, False)

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
    "collections": sorted(
        (ENV.name, ENTRANCE.name, GANTRY.name, SUBJECTS.name, PRODUCTION_SUBJECTS.name, LIGHTS.name)
    ),
    "source": {
        "builderSha256": sha256(Path(__file__).resolve()),
        "blendSha256": sha256(BLEND),
    },
    "sourceAssets": {
        "ironWardenIdle": {
            "path": str(WARDEN_SOURCE.relative_to(HERE.parents[3])),
            "sha256": sha256(WARDEN_SOURCE),
            "canvas": [112, 72],
            "pivot": [56, 66],
            "nominalHeight": 56,
            "alphaSemantics": "straight-alpha-padded-pivot",
        },
        "mineRaiderIdle": {
            "path": str(RAIDER_SOURCE.relative_to(HERE.parents[3])),
            "sha256": sha256(RAIDER_SOURCE),
            "canvas": [80, 60],
            "pivot": [40, 54],
            "nominalHeight": 44,
            "alphaSemantics": "straight-alpha-padded-pivot",
        },
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
verify_or_exit()
print("SHARED_SCENE_RENDER_OK", BLEND, OUT)
