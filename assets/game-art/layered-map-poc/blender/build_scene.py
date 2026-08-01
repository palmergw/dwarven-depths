#!/usr/bin/env python3
"""Build and render the shared-camera layered Shuttergate Blender source."""
from __future__ import annotations

import hashlib
import json
import math
import random
import re
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "outputs"
BLEND = HERE / "layered-shuttergate.blend"
MANIFEST = HERE / "render-manifest.json"
COMPOSITOR = HERE / "compose_reference.py"
REQUIREMENTS = HERE.parent / "requirements.lock"
CAMERA_ORTHO_SCALE = 50.0
RENDER_HEIGHT = 720
WARDEN_SOURCE = HERE.parent.parent / "production-scene" / "exports" / "entities" / "iron-warden-idle.png"
RAIDER_SOURCE = HERE.parent.parent / "production-scene" / "exports" / "entities" / "mine-raider-idle.png"
APPROACH_FOREGROUND_OBJECTS = {
    # The complete final hostile presentation footprint spans two adjacent wall
    # members plus authored shoulder rubble. Omitting any of these lets the
    # sprite/ring paint over a surface that is nearer in the shared 3D scene.
    "FortressSideWall_15.5",
    "FortressButtress_15.5_13",
    "ButtressCrown_15.5_13",
    "ButtressCrown_15.5_7",
    "ShoulderRubble_5",
    "ShoulderRubble_7",
}
APPROACH_REAR_OBJECTS = {"TunnelBackWall", "TunnelVoid", "TunnelGlow"}
random.seed(286)

OUTPUT_CONTRACT = {
    "environment-base.png": "opaque-environment-only",
    "entrance-shell.png": "straight-alpha-foreground-only",
    "entrance-route-foreground.png": "straight-alpha-authored-route-foreground-only",
    "entrance-route-rear.png": "straight-alpha-authored-route-rear-only",
    "route-subjects.png": "straight-alpha-diagnostic-only",
    "production-sprite-subjects.png": "straight-alpha-production-entities-only",
    "reference-plate.png": "opaque-environment-plus-foreground",
    "route-traversal.png": "opaque-diagnostic-only",
    "production-sprite-traversal.png": "opaque-production-entity-diagnostic-only",
}

RENDER_RECIPES = {
    "environment-base.png": (True, False, False, False, False),
    "entrance-shell.png": (False, True, False, False, True),
    "route-subjects.png": (False, False, True, False, True),
    "production-sprite-subjects.png": (False, False, False, True, True),
    "route-traversal.png": (True, True, True, False, False),
    "production-sprite-traversal.png": (True, True, False, True, False),
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def biome_json(data):
    """Emit deterministic JSON with short numeric arrays in Biome's canonical form."""
    text = json.dumps(data, indent=2, sort_keys=True)
    numeric_array = re.compile(r"\[\n((?:\s+-?\d+(?:\.\d+)?,?\n)+)\s+\]")

    def compact(match):
        values = re.findall(r"-?\d+(?:\.\d+)?", match.group(1))
        return "[" + ", ".join(values) + "]"

    return numeric_array.sub(compact, text) + "\n"


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
            contaminated = sum(
                1
                for index in range(0, len(pixels), 4)
                if pixels[index + 3] == 0.0
                and (pixels[index] != 0.0 or pixels[index + 1] != 0.0 or pixels[index + 2] != 0.0)
            )
            assert contaminated == 0, f"nonzero RGB beneath zero alpha: {path} ({contaminated} pixels)"
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
        contaminated = sum(
            1
            for index in range(0, len(pixels), 4)
            if pixels[index + 3] == 0.0
            and (pixels[index] != 0.0 or pixels[index + 1] != 0.0 or pixels[index + 2] != 0.0)
        )
        assert contaminated == 0, f"source sprite has nonzero transparent RGB: {path}"
    finally:
        bpy.data.images.remove(image)


def pixel_digest(path):
    from array import array

    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        return hashlib.sha256(pixels.tobytes()).hexdigest()
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
    assert set(manifest["source"]) == {"builderSha256", "blendSha256", "compositorSha256"}
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
    assert manifest["source"]["compositorSha256"] == sha256(COMPOSITOR)
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
    verify_render_reproducibility(manifest)
    print("SHARED_SCENE_VERIFY_OK", BLEND, MANIFEST)


def verify_or_exit():
    try:
        verify_existing()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)


def sanitize_transparent_rgb(path):
    from array import array

    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        changed = False
        for index in range(0, len(pixels), 4):
            if pixels[index + 3] == 0.0 and (
                pixels[index] != 0.0 or pixels[index + 1] != 0.0 or pixels[index + 2] != 0.0
            ):
                pixels[index] = pixels[index + 1] = pixels[index + 2] = 0.0
                changed = True
        if changed:
            image.pixels.foreach_set(pixels)
            image.filepath_raw = str(path)
            image.file_format = "PNG"
            image.save()
    finally:
        bpy.data.images.remove(image)


def compose_reference(output_root):
    result = subprocess.run(
        [
            "uv",
            "run",
            "--with-requirements",
            str(REQUIREMENTS),
            "python3",
            str(COMPOSITOR),
            "--root",
            str(output_root),
        ],
        cwd=HERE.parents[3],
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout)[-500:])


def verify_render_reproducibility(manifest):
    scene = bpy.context.scene
    collections = {
        "env": bpy.data.collections["ENVIRONMENT_BASE"],
        "entrance": bpy.data.collections["FOREGROUND_ENTRANCE"],
        "subjects": bpy.data.collections["DIAGNOSTIC_ROUTE_SUBJECTS"],
        "production": bpy.data.collections["PRODUCTION_ROUTE_SUBJECTS"],
    }
    with tempfile.TemporaryDirectory() as directory:
        output_root = Path(directory)
        for name, recipe in RENDER_RECIPES.items():
            env, entrance, subjects, production, transparent = recipe
            collections["env"].hide_render = not env
            collections["entrance"].hide_render = not entrance
            collections["subjects"].hide_render = not subjects
            collections["production"].hide_render = not production
            output = output_root / name
            scene.render.film_transparent = transparent
            scene.render.filepath = str(output)
            bpy.ops.render.render(write_still=True)
            if transparent:
                sanitize_transparent_rgb(output)
            committed = OUT / name
            assert pixel_digest(output) == pixel_digest(committed), f"stale render pixels: {name}"
        indexed_output = output_root / "entrance-route-foreground.png"
        render_indexed_foreground(indexed_output, APPROACH_FOREGROUND_OBJECTS)
        assert pixel_digest(indexed_output) == pixel_digest(
            OUT / "entrance-route-foreground.png"
        ), "stale indexed foreground pixels"
        indexed_rear_output = output_root / "entrance-route-rear.png"
        render_indexed_foreground(indexed_rear_output, APPROACH_REAR_OBJECTS)
        assert pixel_digest(indexed_rear_output) == pixel_digest(
            OUT / "entrance-route-rear.png"
        ), "stale indexed rear pixels"
        compose_reference(output_root)
        assert pixel_digest(output_root / "reference-plate.png") == pixel_digest(
            OUT / "reference-plate.png"
        ), "stale composited reference pixels"


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


def route_ribbon(name, points, half_width, elevation, thickness, material, coll):
    """Build one continuous nonbranching floor ribbon with averaged bend normals."""
    vertices = []
    for index, (x, y) in enumerate(points):
        previous = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = (following - previous).normalized()
        normal = Vector((-tangent.y, tangent.x))
        vertices.extend(
            [
                (x + normal.x * half_width, y + normal.y * half_width, elevation),
                (x - normal.x * half_width, y - normal.y * half_width, elevation),
            ]
        )
    faces = [(index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2) for index in range(len(points) - 1)]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    coll.objects.link(obj)
    solidify = obj.modifiers.new("route_depth", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = -1.0
    bevel = obj.modifiers.new("worn_route_edges", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 2
    return obj


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
    alpha_gain = nodes.new("ShaderNodeMath")
    alpha_gain.operation = "MULTIPLY"
    alpha_gain.inputs[1].default_value = 4.0
    alpha_gain.use_clamp = True
    texture.image = image
    texture.interpolation = "Closest"
    emission.inputs["Strength"].default_value = 1.0
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(texture.outputs["Alpha"], alpha_gain.inputs[0])
    links.new(alpha_gain.outputs[0], mix.inputs["Fac"])
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
    # Keep the whole hooked route and broad central tactical floor in one shared frame.
    target = Vector((-0.5, -2.0, 1.5))
    o.rotation_euler = ((target - o.location).to_track_quat("-Z", "Y")).to_euler()
    o.data.type = "ORTHO"
    o.data.ortho_scale = CAMERA_ORTHO_SCALE
    bpy.context.scene.camera = o
    return o


def render(name, env, entrance, subjects, production_subjects, transparent):
    ENV.hide_render = not env
    ENTRANCE.hide_render = not entrance
    SUBJECTS.hide_render = not subjects
    PRODUCTION_SUBJECTS.hide_render = not production_subjects
    scene = bpy.context.scene
    scene.render.film_transparent = transparent
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    if transparent:
        sanitize_transparent_rgb(OUT / f"{name}.png")


def render_indexed_foreground(output, object_names):
    """Export selected visible scene pixels through Blender's object-index pass."""
    scene = bpy.context.scene
    env = bpy.data.collections["ENVIRONMENT_BASE"]
    entrance = bpy.data.collections["FOREGROUND_ENTRANCE"]
    subjects = bpy.data.collections["DIAGNOSTIC_ROUTE_SUBJECTS"]
    production = bpy.data.collections["PRODUCTION_ROUTE_SUBJECTS"]
    env.hide_render = entrance.hide_render = False
    subjects.hide_render = production.hide_render = True
    for obj in bpy.data.objects:
        obj.pass_index = 1 if obj.name in object_names else 0
    view_layer = scene.view_layers[0]
    view_layer.use_pass_object_index = True
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    links = scene.node_tree.links
    nodes.clear()
    render_layers = nodes.new("CompositorNodeRLayers")
    id_mask = nodes.new("CompositorNodeIDMask")
    id_mask.index = 1
    id_mask.use_antialiasing = True
    set_alpha = nodes.new("CompositorNodeSetAlpha")
    composite = nodes.new("CompositorNodeComposite")
    links.new(render_layers.outputs["Image"], set_alpha.inputs["Image"])
    links.new(render_layers.outputs["IndexOB"], id_mask.inputs["ID value"])
    links.new(id_mask.outputs["Alpha"], set_alpha.inputs["Alpha"])
    links.new(set_alpha.outputs["Image"], composite.inputs["Image"])
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    scene.use_nodes = False
    for obj in bpy.data.objects:
        obj.pass_index = 0
    sanitize_transparent_rgb(output)


verify_requested = "--" in sys.argv and "--verify" in sys.argv[sys.argv.index("--") + 1 :]
if verify_requested:
    verify_or_exit()
    raise SystemExit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
OUT.mkdir(parents=True, exist_ok=True)
ENV = collection("ENVIRONMENT_BASE")
ENTRANCE = collection("FOREGROUND_ENTRANCE")
SUBJECTS = collection("DIAGNOSTIC_ROUTE_SUBJECTS")
PRODUCTION_SUBJECTS = collection("PRODUCTION_ROUTE_SUBJECTS")
LIGHTS = collection("SHARED_LIGHTING")

stone = mat("Basalt", (0.06, 0.085, 0.11), roughness=0.9, texture_scale=3.5)
stone2 = mat("CarvedStone", (0.12, 0.15, 0.17), roughness=0.85, texture_scale=5.0)
roadmat = mat("RoadStone", (0.18, 0.20, 0.19), roughness=0.95, texture_scale=7.0)
floor_dark = mat("FloorSlate", (0.085, 0.105, 0.12), roughness=0.94, texture_scale=8.0)
floor_warm = mat("WornFloorStone", (0.14, 0.135, 0.12), roughness=0.96, texture_scale=9.0)
timber = mat("Ironwood", (0.15, 0.065, 0.028), roughness=0.8, texture_scale=4.0)
iron = mat("BlackIron", (0.055, 0.065, 0.072), metallic=0.7, roughness=0.42)
bronze = mat("DwarvenBronze", (0.24, 0.095, 0.025), metallic=0.62, roughness=0.38)
gold = mat("WornGold", (0.38, 0.19, 0.035), metallic=0.72, roughness=0.34, texture_scale=5.0)
banner_blue = mat("WardenBannerBlue", (0.025, 0.075, 0.13), roughness=0.88, texture_scale=4.0)
banner_red = mat("ForgeBannerRed", (0.16, 0.035, 0.022), roughness=0.88, texture_scale=4.0)
ember = mat("Ember", (0.35, 0.08, 0.015), roughness=0.5, emission=(1.0, 0.16, 0.025), strength=6.0)
black = mat("TunnelVoid", (0.004, 0.006, 0.009), roughness=1.0)
route_blue = mat("RouteSubjectBlue", (0.02, 0.22, 0.42), metallic=0.35, roughness=0.35, emission=(0.02, 0.25, 0.8), strength=1.5)
route_gold = mat("RouteRingGold", (0.55, 0.23, 0.015), metallic=0.55, roughness=0.3, emission=(1.0, 0.24, 0.01), strength=2.0)

# Tutorial fortress court: back and side architecture define the bounded lesson
# space without building a near-camera box around the playable floor.
box("CavernFloor", (0, 0, -0.6), (20.0, 23.0, 0.5), stone, ENV, bevel=0.18)
for x in (-15.5, 15.5):
    box(f"FortressSideWall_{x}", (x, 7.0, 2.0), (2.6, 14.0, 2.5), stone, ENV, bevel=0.28)
    for y in (-5, 1, 7, 13, 19):
        inner_x = x - math.copysign(1.75, x)
        box(f"FortressButtress_{x}_{y}", (inner_x, y, 3.2), (0.65, 1.0, 3.4), stone2, ENV, bevel=0.18)
        box(f"ButtressCrown_{x}_{y}", (inner_x, y, 6.35), (1.0, 1.35, 0.28), iron, ENV, bevel=0.08)

# Carved rear-wall mass and heraldry restore the fortress-hall silhouette while
# leaving the route mouth and entire tactical court open. These details sit behind
# play, unlike the rejected bridge and bastions that occupied the floor.
box("RearFortressWall", (-5.5, 21.0, 3.0), (4.2, 1.0, 3.5), stone, ENV, bevel=0.24)
for x, material, suffix in ((-8.5, banner_blue, "Warden"), (-3.0, banner_red, "Forge")):
    box(f"BannerRail_{suffix}", (x, 19.88, 5.45), (1.35, 0.10, 0.12), gold, ENV, bevel=0.05)
    box(f"BannerCloth_{suffix}", (x, 19.72, 3.70), (1.05, 0.08, 1.55), material, ENV, bevel=0.06)
    box(f"BannerRuneStem_{suffix}", (x, 19.60, 3.75), (0.10, 0.05, 0.92), gold, ENV, bevel=0.025)
    box(f"BannerRuneCross_{suffix}", (x, 19.59, 4.05), (0.48, 0.05, 0.10), gold, ENV, bevel=0.025)

# A broad paver court provides formation room. Small deterministic variations break
# up the blockout grid while keeping the entire center free of architecture.
box("CentralDefenseFloor", (-0.5, -2.5, -0.20), (11.2, 11.5, 0.16), floor_dark, ENV, bevel=0.22)
for row, y in enumerate(range(-12, 9, 2)):
    for column, x in enumerate(range(-10, 11, 2)):
        jitter_x = 0.08 * math.sin(row * 2.3 + column)
        jitter_y = 0.07 * math.cos(column * 1.7 - row)
        slab = floor_warm if (row + column) % 5 == 0 else stone2
        box(
            f"CourtPaver_{row}_{column}",
            (x + jitter_x, y + jitter_y, 0.02 + 0.012 * ((row + column) % 3)),
            (0.92, 0.92, 0.08),
            slab,
            ENV,
            bevel=0.06,
            rot=(0, 0, 0.018 * math.sin(row + column * 1.4)),
        )

# One readable nonbranching defense road enters at upper right, crosses the court,
# hooks through the center, and terminates at a side-wall shutter. Nothing spans it.
ROUTE_POINTS = ((8.0, 20.0), (8.0, 14.0), (5.0, 10.0), (0.0, 7.0), (-4.0, 3.0), (-3.0, -3.0), (-6.0, -8.0), (-11.5, -8.0))
route_ribbon("DefenseRouteOuterKerb", ROUTE_POINTS, 4.15, 0.18, 0.30, iron, ENV)
route_ribbon("DefenseRouteBorder", ROUTE_POINTS, 3.92, 0.24, 0.28, stone, ENV)
route_ribbon("DefenseRouteFloor", ROUTE_POINTS, 3.52, 0.32, 0.24, roadmat, ENV)
# Flat route medallions make the turn sequence legible without becoming barriers.
for index, (x, y) in enumerate((ROUTE_POINTS[2], ROUTE_POINTS[4], ROUTE_POINTS[6])):
    cylinder(f"RouteMedallion_{index}", (x, y, 0.455), 0.72, 0.035, gold, ENV, vertices=12)
    cylinder(f"RouteRune_{index}", (x, y, 0.478), 0.30, 0.020, ember, ENV, vertices=8)
for x, y, suffix in ((-9.0, 8.5, "West"), (9.5, -10.5, "East")):
    cylinder(f"EdgeDais_{suffix}", (x, y, 0.36), 1.30, 0.10, stone2, ENV, vertices=16)
    cylinder(f"EdgeEmber_{suffix}", (x, y, 0.48), 0.26, 0.10, ember, ENV, vertices=12)

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

# The defended shutter is embedded in the left wall. It reads as the route's
# destination without becoming a near-camera wall across the battlefield.
box("GateWall", (-16.3, -8.0, 4.2), (1.0, 7.0, 4.7), stone, ENV, bevel=0.24)
box("GateRecess", (-15.26, -8.0, 3.0), (0.18, 4.2, 3.1), black, ENV, bevel=0.04)
for y in (-11.2, -10.1, -9.05, -8.0, -6.95, -5.9, -4.8):
    box(f"ShutterBar_{y}", (-15.04, y, 2.9), (0.20, 0.20, 2.9), iron, ENV, bevel=0.04)
for y in (-13.2, -2.8):
    cylinder(f"GateTower_{y}", (-15.4, y, 4.2), 1.65, 8.4, stone2, ENV, vertices=10)
    box(f"GateWinch_{y}", (-13.85, y, 5.2), (0.45, 0.85, 0.85), bronze, ENV, bevel=0.12)
box("GateEmber", (-14.82, -8.0, 0.42), (0.16, 3.8, 0.14), ember, ENV, bevel=0.02)
# Readable shutter machinery remains embedded in the wall rather than projecting
# into the playable court.
for y in (-11.8, -4.2):
    cylinder(f"GateGearOuter_{y}", (-14.72, y, 4.5), 0.92, 0.28, iron, ENV, vertices=12, rot=(0, math.pi / 2, 0))
    cylinder(f"GateGearHub_{y}", (-14.54, y, 4.5), 0.34, 0.34, bronze, ENV, vertices=12, rot=(0, math.pi / 2, 0))
    for offset in (-0.48, 0.48):
        box(f"GateChain_{y}_{offset}", (-14.48, y + offset, 2.65), (0.08, 0.08, 1.65), iron, ENV, bevel=0.025)

# Upper hostile approach. The arch shell remains the exact foreground artifact.
box("TunnelBackWall", (7.0, 21.0, 4.2), (8.0, 1.0, 4.7), stone, ENV, bevel=0.24)
box("TunnelVoid", (7.0, 19.94, 3.0), (4.0, 0.16, 3.0), black, ENV, bevel=0.10)
box("TunnelGlow", (7.0, 19.86, 0.48), (3.6, 0.12, 0.18), ember, ENV, bevel=0.02)
for side in (-1, 1):
    x = 7.0 + side * 4.75
    for z in (0.75, 2.15, 3.55):
        box(f"ArchJamb_{side}_{z}", (x, 19.68, z), (0.78, 0.72, 0.66), stone2, ENTRANCE, bevel=0.13)
for n, theta in enumerate([12, 31, 50, 69, 88, 107, 126, 145, 164]):
    rad = math.radians(theta)
    x = 7.0 + 4.75 * math.cos(rad)
    z = 3.75 + 2.15 * math.sin(rad)
    box(f"ArchVoussoir_{n}", (x, 19.68, z), (0.78, 0.72, 0.58), stone2, ENTRANCE, bevel=0.13, rot=(0, rad - math.pi/2, 0))
box("ArchKeystone", (7.0, 19.52, 5.98), (0.58, 0.82, 0.72), gold, ENTRANCE, bevel=0.14)

# One raised defender position recalls the approved keyframe's stairs and elevation.
# It is keyed into the upper-left wall with a generous gap to the hostile route.
box("WardenTerrace", (-9.7, 8.0, 0.55), (2.9, 3.3, 0.55), stone2, ENV, bevel=0.16)
for step in range(4):
    box(
        f"WardenTerraceStep_{step}",
        (-6.45 - step * 0.52, 8.0, 0.12 + step * 0.13),
        (0.58, 1.55, 0.12 + step * 0.13),
        floor_warm,
        ENV,
        bevel=0.05,
    )
box("WardenTerraceBack", (-12.35, 8.0, 2.25), (0.42, 3.25, 2.2), stone, ENV, bevel=0.16)
cylinder("WardenTerraceBrazier", (-10.0, 8.0, 1.30), 0.52, 0.35, bronze, ENV, vertices=12)
cylinder("WardenTerraceFlame", (-10.0, 8.0, 1.62), 0.24, 0.28, ember, ENV, vertices=10)


# Review-only subjects expose the complete hooked route and broad central floor.
for index, (x, y) in enumerate(((8, 17.5), (7.5, 13.5), (5, 10), (1, 7.5), (-3, 4), (-3.8, 0), (-4, -4), (-7, -8), (-11, -8))):
    cylinder(f"RouteRing_{index}", (x, y, 0.34), 0.72, 0.08, route_gold, SUBJECTS, vertices=24)
    cylinder(f"RouteSubject_{index}", (x, y, 1.02), 0.42, 1.35, route_blue, SUBJECTS, vertices=12)
    cylinder(f"RouteHead_{index}", (x, y, 1.88), 0.34, 0.42, route_blue, SUBJECTS, vertices=12)


shared_camera = camera()
warden_material = sprite_material("ApprovedIronWardenIdle", WARDEN_SOURCE)
raider_material = sprite_material("ApprovedMineRaiderIdle", RAIDER_SOURCE)
billboard_sprite(
    "ApprovedIronWarden_56px",
    (-4.2, -4.5, 0.39),
    (112, 72),
    (56, 66),
    warden_material,
    PRODUCTION_SUBJECTS,
    shared_camera,
)
for index, (x, y) in enumerate(((8.0, 17.0), (7.5, 13.5), (4.7, 10.0), (0.8, 7.4), (-2.8, 4.0))):
    billboard_sprite(
        f"ApprovedMineRaider_{index}_44px",
        (x, y, 0.39),
        (80, 60),
        (40, 54),
        raider_material,
        PRODUCTION_SUBJECTS,
        shared_camera,
    )
area_light("TunnelWarm", (7.0, 17.5, 7.0), 1600, (1.0, 0.25, 0.06), 6.0)
area_light("GateWarm", (-13.0, -8.0, 6.0), 1500, (1.0, 0.20, 0.04), 5.0)
area_light("CourtWarm", (8.5, -9.5, 9.5), 650, (1.0, 0.28, 0.08), 5.0)
area_light("TerraceWarm", (-10.0, 8.0, 7.0), 800, (1.0, 0.30, 0.09), 4.0)
area_light("CoolFill", (-7, -1, 20), 2400, (0.18, 0.36, 0.58), 13.0)
point_light("GateFaceGlow", (-18.0, -8.0, 5.0), 4200, (1.0, 0.16, 0.035), 4.5)
point_light("TunnelMouthGlow", (7.0, 18.2, 3.5), 850, (1.0, 0.22, 0.05), 2.0)

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
ENV.hide_render = ENTRANCE.hide_render = False
SUBJECTS.hide_render = PRODUCTION_SUBJECTS.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
render("environment-base", True, False, False, False, False)
render("entrance-shell", False, True, False, False, True)
render_indexed_foreground(OUT / "entrance-route-foreground.png", APPROACH_FOREGROUND_OBJECTS)
render_indexed_foreground(OUT / "entrance-route-rear.png", APPROACH_REAR_OBJECTS)
render("route-subjects", False, False, True, False, True)
render("production-sprite-subjects", False, False, False, True, True)
compose_reference(OUT)
render("route-traversal", True, True, True, False, False)
render("production-sprite-traversal", True, True, False, True, False)

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
        (ENV.name, ENTRANCE.name, SUBJECTS.name, PRODUCTION_SUBJECTS.name, LIGHTS.name)
    ),
    "source": {
        "builderSha256": sha256(Path(__file__).resolve()),
        "blendSha256": sha256(BLEND),
        "compositorSha256": sha256(COMPOSITOR),
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
MANIFEST.write_text(biome_json(manifest))
verify_or_exit()
print("SHARED_SCENE_RENDER_OK", BLEND, OUT)
