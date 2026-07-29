#!/usr/bin/env python3
"""Build and verify the compositable Shuttergate production-scene package."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from collections.abc import Iterable
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "assets" / "game-art" / "production-scene"
SOURCES = PACKAGE / "sources"
EXPORTS = PACKAGE / "exports"
METADATA = PACKAGE / "metadata"
EVIDENCE = ROOT / "docs" / "visual-evidence" / "production-scene"
DIRECTION = ROOT / "assets" / "game-art" / "visual-direction"
FRAME = (1280, 720)

PALETTE = {
    "void": (3, 9, 18, 244),
    "stone": (38, 48, 60, 250),
    "stone_light": (73, 82, 91, 255),
    "iron": (13, 19, 27, 255),
    "copper": (156, 91, 48, 255),
    "gold": (222, 170, 88, 255),
    "red": (151, 39, 34, 255),
    "blue": (49, 123, 154, 255),
}

FONT = {
    " ": ["000", "000", "000", "000", "000", "000", "000"],
    "-": ["000", "000", "000", "111", "000", "000", "000"],
    "/": ["001", "001", "010", "010", "100", "100", "000"],
    ":": ["0", "1", "0", "0", "1", "0", "0"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["010", "110", "010", "010", "010", "010", "111"],
    "2": ["11110", "00001", "00001", "01110", "10000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["111", "010", "010", "010", "010", "010", "111"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
}


def png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True, compress_level=9)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cover_16_9(image: Image.Image) -> Image.Image:
    target_ratio = 16 / 9
    ratio = image.width / image.height
    if ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    return image.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    samples = []
    strip = max(8, min(rgb.size) // 30)
    samples.extend(rgb.crop((0, 0, rgb.width, strip)).get_flattened_data())
    samples.extend(
        rgb.crop((0, rgb.height - strip, rgb.width, rgb.height)).get_flattened_data()
    )
    samples.extend(rgb.crop((0, 0, strip, rgb.height)).get_flattened_data())
    samples.extend(
        rgb.crop((rgb.width - strip, 0, rgb.width, rgb.height)).get_flattened_data()
    )
    channels = list(zip(*samples, strict=True))
    return tuple(sorted(channel)[len(channel) // 2] for channel in channels)  # type: ignore[return-value]


def keyed_alpha(image: Image.Image, threshold: int = 10, feather: int = 30) -> Image.Image:
    rgb = image.convert("RGB")
    bg = background_color(rgb)
    alpha = Image.new("L", rgb.size)
    source = rgb.load()
    target = alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            pixel = source[x, y]
            distance = max(abs(pixel[index] - bg[index]) for index in range(3))
            target[x, y] = max(0, min(255, round((distance - threshold) * 255 / feather)))
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def trim(image: Image.Image, padding: int = 6) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("Cannot trim a fully transparent layer")
    return image.crop(
        (
            max(0, box[0] - padding),
            max(0, box[1] - padding),
            min(image.width, box[2] + padding),
            min(image.height, box[3] + padding),
        )
    )


def remove_alpha_fragments(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] <= 24 or (x, y) in visited:
                continue
            component: list[tuple[int, int]] = []
            stack = [(x, y)]
            visited.add((x, y))
            while stack:
                current = stack.pop()
                component.append(current)
                cx, cy = current
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                    (cx - 1, cy - 1),
                    (cx + 1, cy - 1),
                    (cx - 1, cy + 1),
                    (cx + 1, cy + 1),
                ):
                    if (
                        0 <= nx < alpha.width
                        and 0 <= ny < alpha.height
                        and pixels[nx, ny] > 24
                        and (nx, ny) not in visited
                    ):
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)
    largest = max((len(component) for component in components), default=0)
    keep = {
        pixel
        for component in components
        if len(component) >= max(64, round(largest * 0.015))
        for pixel in component
    }
    cleaned = alpha.copy()
    cleaned_pixels = cleaned.load()
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] > 24 and (x, y) not in keep:
                cleaned_pixels[x, y] = 0
    output = image.copy()
    output.putalpha(cleaned)
    return output


def sprite_cell(master: Image.Image, bounds: tuple[int, int]) -> Image.Image:
    left, right = bounds
    return trim(remove_alpha_fragments(keyed_alpha(master.crop((left, 0, right, master.height)))))


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def text_width(text: str, scale: int) -> int:
    return sum((len(FONT[character][0]) + 1) * scale for character in text) - scale


def pixel_text(image: Image.Image, position: tuple[int, int], text: str, scale: int = 2) -> None:
    draw = ImageDraw.Draw(image)
    x, y = position
    for character in text:
        glyph = FONT[character]
        for row, bits in enumerate(glyph):
            for column, bit in enumerate(bits):
                if bit == "1":
                    draw.rectangle(
                        (
                            x + column * scale,
                            y + row * scale,
                            x + (column + 1) * scale - 1,
                            y + (row + 1) * scale - 1,
                        ),
                        fill=PALETTE["gold"],
                    )
        x += (len(glyph[0]) + 1) * scale


def panel(image: Image.Image, box: tuple[int, int, int, int], label: str) -> None:
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=PALETTE["void"], outline=PALETTE["copper"], width=3)
    draw.rectangle((x0 + 4, y0 + 4, x1 - 4, y1 - 4), outline=PALETTE["stone_light"], width=2)
    width = text_width(label, 2)
    pixel_text(image, (x0 + (x1 - x0 - width) // 2, y0 + 13), label, 2)


def build_hud() -> tuple[Image.Image, Image.Image, dict[str, Image.Image]]:
    top = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    panel(top, (18, 10, 258, 60), "FORT 18/20")
    panel(top, (526, 10, 754, 60), "WAVE 7")
    panel(top, (1022, 10, 1262, 60), "ORE 840")

    bottom = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    panel(bottom, (18, 604, 226, 704), "WARDEN")
    panel(bottom, (238, 604, 484, 704), "HEALTH")
    panel(bottom, (496, 604, 746, 704), "TARGET NEAREST")
    panel(bottom, (758, 604, 1036, 704), "SHIELD SLAM")
    panel(bottom, (1048, 604, 1262, 704), "PAUSE")
    draw = ImageDraw.Draw(bottom)
    draw.rectangle((260, 659, 462, 681), fill=PALETTE["iron"], outline=PALETTE["stone_light"], width=2)
    draw.rectangle((265, 664, 435, 676), fill=PALETTE["red"])
    draw.rectangle((801, 649, 993, 686), fill=(24, 36, 47, 255), outline=PALETTE["blue"], width=3)
    draw.rectangle((1118, 648, 1130, 686), fill=PALETTE["gold"])
    draw.rectangle((1142, 648, 1154, 686), fill=PALETTE["gold"])

    parts = {
        "top-hud-frame": top,
        "bottom-hud-frame": bottom,
        "health-status": bottom.crop((238, 604, 484, 704)),
        "target-policy-control": bottom.crop((496, 604, 746, 704)),
        "shield-slam-control": bottom.crop((758, 604, 1036, 704)),
        "pause-control": bottom.crop((1048, 604, 1262, 704)),
    }
    return top, bottom, parts


def ring(size: tuple[int, int], color: tuple[int, int, int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((3, size[1] // 2, size[0] - 4, size[1] - 4), outline=color, width=4)
    draw.ellipse((8, size[1] // 2 + 4, size[0] - 9, size[1] - 9), outline=(color[0], color[1], color[2], 90), width=2)
    return image


def shield_impact() -> Image.Image:
    image = Image.new("RGBA", (180, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for offset, alpha in ((0, 230), (10, 150), (20, 80)):
        draw.arc((20 + offset, 8 + offset // 2, 160 - offset, 112 - offset // 2), 275, 85, fill=(98, 193, 218, alpha), width=5)
    for x, y in ((20, 50), (42, 18), (135, 28), (155, 72)):
        draw.rectangle((x, y, x + 5, y + 5), fill=(218, 170, 88, 190))
    return image


def lighting_overlay() -> Image.Image:
    image = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    light = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    draw = ImageDraw.Draw(light)
    draw.ellipse((860, 70, 1300, 390), fill=(194, 85, 23, 65))
    draw.ellipse((30, 330, 520, 760), fill=(195, 99, 32, 48))
    draw.ellipse((445, 220, 910, 650), fill=(172, 104, 43, 32))
    return light.filter(ImageFilter.GaussianBlur(42))


def architecture_mask(clean_plate: Image.Image) -> tuple[Image.Image, Image.Image]:
    mask = Image.new("L", FRAME, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(0, 500), (250, 455), (430, 575), (520, 720), (0, 720)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1))
    occluder = clean_plate.copy()
    occluder.putalpha(mask)
    return mask, occluder


def composite(clean: Image.Image, layers: Iterable[tuple[Image.Image, tuple[int, int]]]) -> Image.Image:
    output = clean.copy()
    for layer, position in layers:
        output.alpha_composite(layer, position)
    return output


def compose_recipe(
    recipe: dict[str, object], assets: dict[str, Image.Image]
) -> Image.Image:
    layers = recipe["layersBackToFront"]
    if not isinstance(layers, list) or not layers:
        raise ValueError("Reconstruction recipe must contain layers")
    first = layers[0]
    if (
        not isinstance(first, dict)
        or first.get("asset") != "shuttergate-clean-plate-1280x720"
    ):
        raise ValueError("Reconstruction must start with the clean plate")
    output = assets[first["asset"]].copy()
    for index, layer in enumerate(layers[1:], start=1):
        if not isinstance(layer, dict):
            raise ValueError(f"Reconstruction layer {index} must be an object")
        asset_id = layer["asset"]
        position = layer["position"]
        if (
            not isinstance(asset_id, str)
            or asset_id not in assets
            or not isinstance(position, list)
            or len(position) != 2
            or not all(isinstance(value, int) for value in position)
        ):
            raise ValueError(f"Invalid reconstruction layer {index}")
        output.alpha_composite(assets[asset_id], tuple(position))
    return output


def file_record(
    path: Path,
    category: str,
    alpha: str,
    regions: list[str],
    root: Path = ROOT,
) -> dict[str, object]:
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
        mode = image.mode
    return {
        "id": path.stem,
        "path": path.relative_to(root).as_posix(),
        "category": category,
        "dimensions": dimensions,
        "mode": mode,
        "alphaSemantics": alpha,
        "contributesTo": regions,
        "sha256": sha256(path),
    }


def build(output_root: Path = ROOT) -> None:
    package = output_root / PACKAGE.relative_to(ROOT)
    direction = output_root / DIRECTION.relative_to(ROOT)
    exports = package / "exports"
    evidence = output_root / EVIDENCE.relative_to(ROOT)
    metadata = package / "metadata"
    shutil.rmtree(exports, ignore_errors=True)
    shutil.rmtree(evidence, ignore_errors=True)
    clean_master = Image.open(package / "sources" / "shuttergate-clean-plate-master.png")
    clean = cover_16_9(clean_master)
    png(clean, exports / "environment" / "shuttergate-clean-plate-1280x720.png")

    warden_master = Image.open(direction / "sources" / "iron-warden-master.png")
    hostile_master = Image.open(direction / "sources" / "mine-raider-master.png")
    hostile_idle = fit_height(sprite_cell(hostile_master, (0, 353)), 128)
    hostile_attack = fit_height(sprite_cell(hostile_master, (707, 961)), 128)
    hostile_idle = ImageEnhance.Brightness(hostile_idle).enhance(1.3)
    hostile_attack = ImageEnhance.Brightness(hostile_attack).enhance(1.3)
    sprites = {
        "iron-warden-idle": fit_height(sprite_cell(warden_master, (0, 355)), 142),
        "iron-warden-shield-slam": fit_height(
            sprite_cell(warden_master, (708, 1098)), 142
        ),
        "mine-raider-idle": hostile_idle,
        "mine-raider-attack": hostile_attack,
    }
    for name, image in sprites.items():
        png(image, exports / "entities" / f"{name}.png")

    effects = {
        "warden-selection-ring": ring((128, 58), (62, 177, 215, 210)),
        "hostile-faction-ring": ring((100, 45), (203, 68, 42, 210)),
        "shield-slam-impact": shield_impact(),
    }
    for name, image in effects.items():
        png(image, exports / "effects" / f"{name}.png")
    lighting = lighting_overlay()
    png(lighting, exports / "lighting" / "warm-light-overlay.png")

    mask, occluder = architecture_mask(clean)
    png(mask, exports / "occlusion" / "architecture-mask.png")
    png(occluder, exports / "occlusion" / "foreground-occluder.png")

    top_hud, bottom_hud, hud_parts = build_hud()
    for name, image in hud_parts.items():
        png(image, exports / "hud" / f"{name}.png")

    portrait = fit_height(sprite_cell(warden_master, (0, 355)), 78)
    png(portrait, exports / "hud" / "warden-portrait.png")

    assets = {
        "shuttergate-clean-plate-1280x720": clean,
        **sprites,
        **effects,
        "foreground-occluder": occluder,
        "warm-light-overlay": lighting,
        "top-hud-frame": top_hud,
        "bottom-hud-frame": bottom_hud,
        "warden-portrait": portrait,
    }
    recipe = json.loads((metadata / "reconstruction.json").read_text(encoding="utf-8"))
    reconstruction = compose_recipe(recipe, assets)
    no_entities = composite(clean, [(occluder, (0, 0)), (lighting, (0, 0)), (top_hud, (0, 0)), (bottom_hud, (0, 0))])
    environment_only = composite(clean, [(occluder, (0, 0)), (lighting, (0, 0))])
    png(reconstruction, evidence / "reconstruction-one-warden-one-hostile.png")
    png(no_entities, evidence / "reconstruction-entities-removed.png")
    png(environment_only, evidence / "environment-and-presentation-lighting.png")
    shutil.copy2(exports / "environment" / "shuttergate-clean-plate-1280x720.png", evidence / "clean-plate.png")

    approved = Image.open(
        direction / "exports" / "shuttergate-keyframe-1280x720.png"
    ).convert("RGBA")
    comparison = Image.new("RGBA", (2560, 720), (0, 0, 0, 255))
    comparison.alpha_composite(approved, (0, 0))
    comparison.alpha_composite(reconstruction, (1280, 0))
    png(comparison, evidence / "approved-keyframe-vs-reconstruction.png")

    def isolation_board(images: list[Image.Image], scale: int) -> Image.Image:
        scaled = [
            image.resize(
                (image.width * scale, image.height * scale),
                Image.Resampling.NEAREST,
            )
            for image in images
        ]
        total_width = sum(image.width for image in scaled) + 80 * (len(scaled) - 1)
        board_width = max(1280, total_width + 160)
        board_height = max(720, max(image.height for image in scaled) + 160)
        board = Image.new("RGBA", (board_width, board_height), (7, 13, 22, 255))
        checker = ImageDraw.Draw(board)
        for y in range(0, board_height, 32):
            for x in range(0, board_width, 32):
                if (x // 32 + y // 32) % 2 == 0:
                    checker.rectangle((x, y, x + 31, y + 31), fill=(25, 35, 45, 255))
        x = (board_width - total_width) // 2
        for image in scaled:
            board.alpha_composite(image, (x, (board_height - image.height) // 2))
            x += image.width + 80
        return board

    png(
        isolation_board(
            [sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 1
        ),
        evidence / "iron-warden-alpha-states-native.png",
    )
    png(
        isolation_board(
            [sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 4
        ),
        evidence / "iron-warden-alpha-states-4x.png",
    )
    png(
        isolation_board(
            [sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 1
        ),
        evidence / "mine-raider-alpha-states-native.png",
    )
    png(
        isolation_board(
            [sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 4
        ),
        evidence / "mine-raider-alpha-states-4x.png",
    )
    png(
        isolation_board(list(effects.values()), 2),
        evidence / "selection-and-combat-effect-isolation.png",
    )

    hud_board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    hud_board.alpha_composite(top_hud)
    hud_board.alpha_composite(bottom_hud)
    hud_board.alpha_composite(portrait, (82, 622))
    png(hud_board, evidence / "hud-control-isolation.png")
    png(occluder, evidence / "foreground-occlusion-isolation.png")
    png(lighting, evidence / "lighting-alpha-isolation.png")

    tracked: list[tuple[Path, str, str, list[str]]] = []
    tracked.append(
        (
            exports / "environment" / "shuttergate-clean-plate-1280x720.png",
            "environment",
            "opaque-clean-plate",
            ["world"],
        )
    )
    for path in sorted((exports / "entities").glob("*.png")):
        tracked.append((path, "entity", "straight-alpha", ["world-entities"]))
    for path in sorted((exports / "effects").glob("*.png")):
        tracked.append((path, "effect", "straight-alpha", ["world-effects"]))
    tracked.append((exports / "lighting" / "warm-light-overlay.png", "lighting", "straight-alpha-no-entities", ["world-lighting"]))
    tracked.append((exports / "occlusion" / "architecture-mask.png", "occlusion-mask", "grayscale-mask", ["foreground-occlusion"]))
    tracked.append((exports / "occlusion" / "foreground-occluder.png", "foreground", "straight-alpha-environment-only", ["foreground-occlusion"]))
    for path in sorted((exports / "hud").glob("*.png")):
        tracked.append((path, "hud", "straight-alpha", ["screen-space-hud"]))

    manifest = {
        "schemaVersion": 1,
        "package": "dwarven-depths-issue-286-production-scene",
        "logicalFrame": [640, 360],
        "reviewFrame": list(FRAME),
        "entityLayerCounts": {"iron-warden": 1, "mine-raider": 1},
        "contractDigests": {
            name: sha256(metadata / name)
            for name in ("provenance.json", "reconstruction.json", "scene-contract.json")
        },
        "files": [
            file_record(path, category, alpha, regions, output_root)
            for path, category, alpha, regions in tracked
        ],
        "evidence": [
            file_record(path, "evidence", "review-only", ["review"], output_root)
            for path in sorted(evidence.glob("*.png"))
        ],
    }
    metadata.mkdir(parents=True, exist_ok=True)
    manifest_path = metadata / "layer-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    subprocess.run(
        ["pnpm", "exec", "biome", "format", "--write", str(manifest_path)],
        check=True,
        cwd=ROOT,
    )


def strict_keys(value: dict[str, object], expected: set[str], context: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ValueError(f"{context} keys differ: expected {sorted(expected)}, got {sorted(actual)}")


def verify(root: Path = ROOT) -> None:
    package = root / PACKAGE.relative_to(ROOT)
    manifest_path = package / "metadata" / "layer-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    strict_keys(
        manifest,
        {
            "schemaVersion",
            "package",
            "logicalFrame",
            "reviewFrame",
            "entityLayerCounts",
            "contractDigests",
            "files",
            "evidence",
        },
        "manifest",
    )
    if manifest["schemaVersion"] != 1 or manifest["reviewFrame"] != [1280, 720]:
        raise ValueError("Unsupported scene manifest contract")
    if manifest["entityLayerCounts"] != {"iron-warden": 1, "mine-raider": 1}:
        raise ValueError("Reconstruction must bind exactly one Warden and one hostile")
    expected_contract_digests = {
        name: sha256(package / "metadata" / name)
        for name in ("provenance.json", "reconstruction.json", "scene-contract.json")
    }
    if manifest["contractDigests"] != expected_contract_digests:
        raise ValueError("Scene metadata digest mismatch")
    records = [*manifest["files"], *manifest["evidence"]]
    paths: set[str] = set()
    asset_ids: set[str] = set()
    records_by_id: dict[str, dict[str, object]] = {}
    for index, record in enumerate(records):
        strict_keys(record, {"id", "path", "category", "dimensions", "mode", "alphaSemantics", "contributesTo", "sha256"}, f"file[{index}]")
        path = root / record["path"]
        if record["path"] in paths or not path.is_file():
            raise ValueError(f"Missing or duplicate manifest path: {record['path']}")
        paths.add(record["path"])
        if record["category"] != "evidence":
            if record["id"] in asset_ids:
                raise ValueError(f"Duplicate stable asset id: {record['id']}")
            asset_ids.add(record["id"])
            records_by_id[record["id"]] = record
        if sha256(path) != record["sha256"]:
            raise ValueError(f"Digest mismatch: {record['path']}")
        with Image.open(path) as image:
            if [image.width, image.height] != record["dimensions"] or image.mode != record["mode"]:
                raise ValueError(f"Image metadata mismatch: {record['path']}")
            if record["category"] in {"entity", "effect", "hud", "lighting", "foreground"}:
                if image.mode != "RGBA" or image.getchannel("A").getextrema() == (255, 255):
                    raise ValueError(f"Layer lacks usable alpha: {record['path']}")
            if record["category"] == "environment" and record["contributesTo"] != ["world"]:
                raise ValueError("Environment assets may contribute only to the world region")
    environment = root / "assets/game-art/production-scene/exports/environment/shuttergate-clean-plate-1280x720.png"
    with Image.open(environment) as image:
        if image.size != FRAME or image.mode != "RGBA" or image.getchannel("A").getextrema() != (255, 255):
            raise ValueError("Clean plate must be a complete opaque 1280x720 environment")

    scene = json.loads((package / "metadata" / "scene-contract.json").read_text(encoding="utf-8"))
    strict_keys(
        scene,
        {
            "schemaVersion",
            "package",
            "authority",
            "coordinateSpace",
            "safeAreas",
            "camera",
            "route",
            "entityAnchors",
            "occlusion",
            "hudRegions",
            "cropPolicy",
        },
        "scene-contract",
    )
    if scene["schemaVersion"] != 1 or scene["authority"] != "presentation-only":
        raise ValueError("Scene contract must remain versioned and presentation-only")
    strict_keys(
        scene["route"],
        {"polyline", "entranceAnchor", "gateAnchor", "chokepointAnchors", "railCrossingAnchor"},
        "scene-contract.route",
    )
    if len(scene["route"]["polyline"]) < 2 or len(scene["route"]["chokepointAnchors"]) != 2:
        raise ValueError("Scene route must bind entrance, gate, and two chokepoints")
    strict_keys(
        scene["coordinateSpace"],
        {"origin", "logicalFrame", "reviewFrame", "logicalTexelScale"},
        "scene-contract.coordinateSpace",
    )
    strict_keys(
        scene["safeAreas"],
        {"world", "desktopHudSafe", "entitySafe"},
        "scene-contract.safeAreas",
    )
    strict_keys(
        scene["camera"],
        {"projection", "viewDirection", "fixedReviewFrame"},
        "scene-contract.camera",
    )
    strict_keys(
        scene["entityAnchors"],
        {"ironWardenTruthScreen", "mineRaiderTruthScreen"},
        "scene-contract.entityAnchors",
    )
    for name, anchor in scene["entityAnchors"].items():
        strict_keys(
            anchor,
            {"position", "depthSortY"},
            f"scene-contract.entityAnchors.{name}",
        )
    strict_keys(
        scene["occlusion"],
        {"mask", "foreground", "depthOrder"},
        "scene-contract.occlusion",
    )
    strict_keys(
        scene["hudRegions"],
        {"top", "bottom", "portrait", "health", "targetPolicy", "shieldSlam", "pause"},
        "scene-contract.hudRegions",
    )
    strict_keys(
        scene["cropPolicy"],
        {"desktop", "laptop", "mobile", "status"},
        "scene-contract.cropPolicy",
    )
    if (
        scene["coordinateSpace"]["reviewFrame"] != [1280, 720]
        or scene["coordinateSpace"]["logicalFrame"] != [640, 360]
        or scene["safeAreas"]["world"] != [0, 0, 1280, 720]
    ):
        raise ValueError("Scene geometry must bind the declared logical and review frames")

    reconstruction = json.loads(
        (package / "metadata" / "reconstruction.json").read_text(encoding="utf-8")
    )
    strict_keys(
        reconstruction,
        {"schemaVersion", "frame", "output", "entityCounts", "layersBackToFront", "isolationProofs"},
        "reconstruction",
    )
    if reconstruction["entityCounts"] != {"iron-warden": 1, "mine-raider": 1}:
        raise ValueError("Reconstruction recipe must declare exactly one entity per faction")
    if reconstruction["schemaVersion"] != 1 or reconstruction["frame"] != [1280, 720]:
        raise ValueError("Unsupported reconstruction contract")
    strict_keys(
        reconstruction["isolationProofs"],
        {"entitiesRemoved", "environmentOnly", "hudControls", "foreground", "lighting"},
        "reconstruction.isolationProofs",
    )
    recipe_ids = []
    for index, layer in enumerate(reconstruction["layersBackToFront"]):
        strict_keys(layer, {"asset", "position", "region"}, f"reconstruction.layer[{index}]")
        if layer["asset"] not in asset_ids:
            raise ValueError(f"Reconstruction references unknown asset: {layer['asset']}")
        if (
            not isinstance(layer["position"], list)
            or len(layer["position"]) != 2
            or not all(isinstance(value, int) for value in layer["position"])
            or layer["region"] not in records_by_id[layer["asset"]]["contributesTo"]
        ):
            raise ValueError(f"Invalid position or region in reconstruction layer {index}")
        recipe_ids.append(layer["asset"])
    expected_recipe_ids = [
        "shuttergate-clean-plate-1280x720",
        "warden-selection-ring",
        "hostile-faction-ring",
        "iron-warden-shield-slam",
        "mine-raider-attack",
        "shield-slam-impact",
        "foreground-occluder",
        "warm-light-overlay",
        "top-hud-frame",
        "bottom-hud-frame",
        "warden-portrait",
    ]
    if recipe_ids != expected_recipe_ids:
        raise ValueError("Reconstruction recipe layers are not canonical")
    if reconstruction["layersBackToFront"][0]["position"] != [0, 0]:
        raise ValueError("Clean plate must cover the reconstruction origin")

    asset_images: dict[str, Image.Image] = {}
    for record in manifest["files"]:
        if record["id"] == "architecture-mask":
            continue
        asset_images[record["id"]] = Image.open(root / record["path"]).convert("RGBA")
    expected_reconstruction = compose_recipe(reconstruction, asset_images)
    output_path = root / reconstruction["output"]
    with Image.open(output_path) as actual_reconstruction:
        if (
            ImageChops.difference(
                expected_reconstruction, actual_reconstruction.convert("RGBA")
            )
            .convert("RGB")
            .getbbox()
            is not None
        ):
            raise ValueError("Reconstruction pixels do not match the declared layer recipe")

    provenance = json.loads((package / "metadata" / "provenance.json").read_text(encoding="utf-8"))
    strict_keys(
        provenance,
        {"schemaVersion", "package", "license", "cleanPlate", "derivedLayers", "conceptBoundary"},
        "provenance",
    )
    strict_keys(
        provenance["license"],
        {"identifier", "path", "copyright"},
        "provenance.license",
    )
    strict_keys(
        provenance["cleanPlate"],
        {"path", "sha256", "generator", "reference", "referenceUse"},
        "provenance.cleanPlate",
    )
    strict_keys(
        provenance["cleanPlate"]["generator"],
        {"provider", "model", "quality", "aspectRatio", "inputImageCount"},
        "provenance.cleanPlate.generator",
    )
    strict_keys(
        provenance["derivedLayers"],
        {"characterSource", "method", "effectsHudMasks", "externalAssets"},
        "provenance.derivedLayers",
    )
    strict_keys(
        provenance["conceptBoundary"],
        {"path", "productionPixelReuse", "tracing", "backgroundUse"},
        "provenance.conceptBoundary",
    )
    clean_source = root / provenance["cleanPlate"]["path"]
    if sha256(clean_source) != provenance["cleanPlate"]["sha256"]:
        raise ValueError("Clean-plate source digest does not match provenance")
    if any(
        provenance["conceptBoundary"][key]
        for key in ("productionPixelReuse", "tracing", "backgroundUse")
    ):
        raise ValueError("Concept raster may not contribute production pixels")


def reproducibility_check() -> None:
    with tempfile.TemporaryDirectory(prefix="dd-production-scene-") as directory:
        temp_root = Path(directory)
        temp_package = temp_root / PACKAGE.relative_to(ROOT)
        shutil.copytree(SOURCES, temp_package / "sources")
        temp_direction = temp_root / DIRECTION.relative_to(ROOT)
        (temp_direction / "sources").mkdir(parents=True)
        (temp_direction / "exports").mkdir(parents=True)
        for name in ("iron-warden-master.png", "mine-raider-master.png"):
            shutil.copy2(
                DIRECTION / "sources" / name, temp_direction / "sources" / name
            )
        shutil.copy2(
            DIRECTION / "exports" / "shuttergate-keyframe-1280x720.png",
            temp_direction / "exports" / "shuttergate-keyframe-1280x720.png",
        )
        (temp_package / "metadata").mkdir(parents=True)
        for name in ("scene-contract.json", "reconstruction.json", "provenance.json"):
            shutil.copy2(METADATA / name, temp_package / "metadata" / name)
        build(temp_root)
        verify(temp_root)
        expected = json.loads((METADATA / "layer-manifest.json").read_text(encoding="utf-8"))
        actual = json.loads((temp_root / METADATA.relative_to(ROOT) / "layer-manifest.json").read_text(encoding="utf-8"))
        if expected != actual:
            raise ValueError("Deterministic rebuild drifted from committed layer manifest")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--reproducible", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        build()
        verify()
    if args.reproducible:
        reproducibility_check()
    print(json.dumps({"ok": True, "verified": True, "reproducible": args.reproducible}))


if __name__ == "__main__":
    main()
