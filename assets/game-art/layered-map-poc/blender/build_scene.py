#!/usr/bin/env python3
"""Build and render the shared-camera layered Shuttergate Blender source."""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "outputs"
BLEND = HERE / "layered-shuttergate.blend"
random.seed(286)


def mat(name, color, metallic=0.0, roughness=0.75, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
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
    bpy.ops.object.camera_add(location=(16.5, -19.5, 17.0))
    o = bpy.context.object
    o.name = "CAMERA_Shuttergate_Ortho"
    target = Vector((0, 0, 1.8))
    o.rotation_euler = ((target - o.location).to_track_quat("-Z", "Y")).to_euler()
    o.data.type = "ORTHO"
    o.data.ortho_scale = 24.0
    bpy.context.scene.camera = o
    return o


def render(name, env, entrance, gantry, transparent):
    ENV.hide_render = not env
    ENTRANCE.hide_render = not entrance
    GANTRY.hide_render = not gantry
    scene = bpy.context.scene
    scene.render.film_transparent = transparent
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
OUT.mkdir(parents=True, exist_ok=True)
ENV = collection("ENVIRONMENT_BASE")
ENTRANCE = collection("FOREGROUND_ENTRANCE")
GANTRY = collection("FOREGROUND_GANTRY")
LIGHTS = collection("SHARED_LIGHTING")

stone = mat("Basalt", (0.075, 0.10, 0.13), roughness=0.9)
stone2 = mat("CarvedStone", (0.13, 0.16, 0.18), roughness=0.85)
roadmat = mat("RoadStone", (0.19, 0.21, 0.21), roughness=0.95)
timber = mat("Ironwood", (0.16, 0.075, 0.035), roughness=0.8)
iron = mat("BlackIron", (0.055, 0.065, 0.072), metallic=0.7, roughness=0.42)
ember = mat("Ember", (0.35, 0.08, 0.015), roughness=0.5, emission=(1.0, 0.16, 0.025), strength=6.0)
black = mat("TunnelVoid", (0.004, 0.006, 0.009), roughness=1.0)

# Foundation and cavern floor.
box("CavernFloor", (0, 0, -0.6), (11.5, 12.0, 0.5), stone, ENV, bevel=0.15)
for x in (-8.4, 8.4):
    box(f"SideWall_{x}", (x, 0.2, 1.3), (2.0, 11.3, 1.8), stone, ENV, bevel=0.22)
    for y in range(-9, 10, 3):
        box(f"Buttress_{x}_{y}", (x - math.copysign(1.15, x), y, 2.4), (0.45, 0.7, 2.8), stone2, ENV, bevel=0.12)

# Broad non-branching road, with camera-consistent masonry slabs.
for i, y in enumerate(range(-10, 11, 2)):
    tone = roadmat if i % 2 == 0 else stone2
    box(f"RoadSlab_{i}", (0, y, 0.05), (3.4, 0.94, 0.18), tone, ENV, bevel=0.06)
    for x in (-3.8, 3.8):
        box(f"RoadKerb_{i}_{x}", (x, y, 0.28), (0.35, 0.94, 0.45), stone2, ENV, bevel=0.08)

# Lower defended shutter and warm gate recess.
box("GateWall", (0, -10.2, 3.0), (8.3, 0.9, 3.4), stone, ENV, bevel=0.18)
box("GateRecess", (0, -9.25, 2.1), (3.0, 0.18, 2.2), black, ENV, bevel=0.03)
for x in (-2.2, -1.1, 0, 1.1, 2.2):
    box(f"ShutterBar_{x}", (x, -9.02, 2.0), (0.18, 0.20, 2.0), iron, ENV, bevel=0.04)
for x in (-3.8, 3.8):
    cylinder(f"GateTower_{x}", (x, -9.5, 3.0), 1.25, 6.0, stone2, ENV, vertices=10)
box("GateEmber", (0, -9.0, 0.35), (2.6, 0.16, 0.12), ember, ENV, bevel=0.02)

# Upper tunnel void and wall are base; the complete arch ring is a foreground collection.
box("TunnelBackWall", (0, 10.0, 3.5), (8.2, 0.9, 4.0), stone, ENV, bevel=0.2)
box("TunnelVoid", (0, 9.04, 2.35), (2.7, 0.16, 2.35), black, ENV, bevel=0.08)
box("TunnelGlow", (0, 8.96, 0.45), (2.45, 0.12, 0.16), ember, ENV, bevel=0.02)
for side in (-1, 1):
    x = side * 3.35
    for z in (0.65, 1.85, 3.05):
        box(f"ArchJamb_{side}_{z}", (x, 8.78, z), (0.62, 0.66, 0.58), stone2, ENTRANCE, bevel=0.11)
for n, theta in enumerate([15, 37, 59, 81, 99, 121, 143, 165]):
    rad = math.radians(theta)
    x = 3.35 * math.cos(rad)
    z = 3.15 + 1.65 * math.sin(rad)
    box(f"ArchVoussoir_{n}", (x, 8.78, z), (0.65, 0.66, 0.5), stone2, ENTRANCE, bevel=0.12, rot=(0, rad - math.pi/2, 0))

# Gantry foundations belong to the environment; supports/deck are canonical foreground.
for x in (-5.3, 5.3):
    box(f"GantryPlinth_{x}", (x, 1.2, 0.35), (1.05, 1.15, 0.45), stone2, ENV, bevel=0.14)
    box(f"GantryPost_{x}", (x, 1.2, 3.0), (0.48, 0.58, 2.7), timber, GANTRY, bevel=0.10)
    box(f"GantryIronFoot_{x}", (x, 1.2, 0.92), (0.68, 0.72, 0.18), iron, GANTRY, bevel=0.04)
box("GantryMainBeam", (0, 1.2, 5.6), (6.2, 0.72, 0.50), timber, GANTRY, bevel=0.12)
box("GantryIronBand", (0, 1.2, 5.62), (6.35, 0.78, 0.12), iron, GANTRY, bevel=0.04)
for x in (-3.5, 0, 3.5):
    box(f"GantryBrace_{x}", (x, 1.2, 4.75), (0.16, 0.66, 1.05), iron, GANTRY, bevel=0.04, rot=(0, 0.45 if x <= 0 else -0.45, 0))

camera()
area_light("TunnelWarm", (0, 7.0, 5.5), 900, (1.0, 0.25, 0.06), 4.0)
area_light("GateWarm", (0, -7.5, 4.0), 700, (1.0, 0.20, 0.04), 3.0)
area_light("CoolFill", (-4, -1, 12), 1300, (0.18, 0.36, 0.58), 8.0)

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

# Save the editable source with all collections visible, then emit same-camera passes.
ENV.hide_render = ENTRANCE.hide_render = GANTRY.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
render("environment-base", True, False, False, False)
render("entrance-shell", False, True, False, True)
render("gantry-shell", False, False, True, True)
render("reference-plate", True, True, True, False)
print("SHARED_SCENE_RENDER_OK", BLEND, OUT)
