#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import shutil

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "assets/game-art/combat-animation"
EXPORTS = PACKAGE / "exports/entities"
MANIFEST = PACKAGE / "metadata/manifest.json"
WARDEN_SOURCE = ROOT / "assets/game-art/visual-direction/sources/iron-warden-master.png"
WARDEN_ATTACK_CYCLE_SOURCE = (
    PACKAGE / "sources/iron-warden-basic-attack-cycle-master.png"
)
WARDEN_SHIELD_SLAM_CYCLE_SOURCE = (
    PACKAGE / "sources/iron-warden-shield-slam-cycle-master.png"
)
HOSTILE_SOURCE = PACKAGE / "sources/shuttergate-hostile-role-atlas-master.png"
FACING_SOURCE = PACKAGE / "sources/shuttergate-hostile-facing-atlas-master.png"
HOSTILE_ATTACK_CYCLE_SOURCE = (
    PACKAGE / "sources/shuttergate-hostile-attack-cycle-master.png"
)
EXPANDED_HOSTILE_SOURCE = (
    PACKAGE / "sources/shuttergate-expanded-hostile-role-atlas-master.png"
)

SOURCE_DIGESTS = {
    "assets/game-art/combat-animation/sources/shuttergate-hostile-role-atlas-master.png": "8f27d5e80b9adcbcab6d3b05435fda8777c81326d2a1f8e590673c04d14ed660",
    "assets/game-art/combat-animation/sources/shuttergate-hostile-facing-atlas-master.png": "7e70295ef8eee65e100bbfecda451501ae1a1de041835e7570aa204cfc397953",
    "assets/game-art/combat-animation/sources/shuttergate-hostile-attack-cycle-master.png": "ad465196d3a473e904a477588d31bce835dc37ef993eed3afdcb5f904a948b52",
    "assets/game-art/combat-animation/sources/iron-warden-basic-attack-cycle-master.png": "226aa23dea6cabfc04403cc93343e8122dd297615037911245b74750d8e279a2",
    "assets/game-art/combat-animation/sources/iron-warden-shield-slam-cycle-master.png": "bbf7c4fd3090f767ca8a187befc495a46303ad9934a57cd0cf6a28bdfda2d6c4",
    "assets/game-art/visual-direction/sources/iron-warden-master.png": "2b566af41592a606a7a702d83af40b0445b665f83ff5ccc3b009ee6b132b5938",
    "assets/game-art/combat-animation/sources/shuttergate-expanded-hostile-role-atlas-master.png": "8b88de6fe432b54f8b8821a90c10948bc0d37ae85f9c3c8f2630ea8fbe9cab5d",
}

WARDEN_CROPS = {
    "iron-warden-idle": (0, 355),
    "iron-warden-basic-attack": (355, 708),
    "iron-warden-shield-slam": (708, 1098),
    "iron-warden-hit": (1098, 1435),
    "iron-warden-guard": (1435, 1785),
    "iron-warden-downed": (1785, 2172),
}
HOSTILE_ROLES = (
    "goblin-cutter",
    "goblin-slinger",
    "goblin-bulwark",
    "gatebreaker-captain",
)
HOSTILE_ACTION_ROWS = (("attack", 1), ("downed", 2))
HOSTILE_FACINGS = ("n", "e", "s", "w")
HOSTILE_ATTACK_PHASES = (
    "windup",
    "committed",
    "impact",
    "recoil",
    "recovery",
)
EXPANDED_HOSTILE_ROLES = (
    "goblin-skirmisher",
    "goblin-sapper",
    "goblin-hexer",
    "goblin-banner-bearer",
    "goblin-warden-hunter",
)
HOSTILE_COLUMN_BOUNDS = (
    (0, 350),
    (350, 730),
    (720, 1080),
    (1070, 1536),
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    strip = max(8, min(rgb.size) // 30)
    samples = []
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


def keyed_alpha(
    image: Image.Image, threshold: int = 10, feather: int = 30
) -> Image.Image:
    rgb = image.convert("RGB")
    background = background_color(rgb)
    alpha = Image.new("L", rgb.size)
    source = rgb.load()
    target = alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            pixel = source[x, y]
            distance = max(
                abs(pixel[index] - background[index]) for index in range(3)
            )
            target[x, y] = max(
                0, min(255, round((distance - threshold) * 255 / feather))
            )
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


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
        if len(component) >= max(128, round(largest * 0.08))
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


def trim(image: Image.Image, padding: int = 6) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("cannot trim a fully transparent sprite")
    return image.crop(
        (
            max(0, bounds[0] - padding),
            max(0, bounds[1] - padding),
            min(image.width, bounds[2] + padding),
            min(image.height, bounds[3] + padding),
        )
    )


def miniature(
    image: Image.Image,
    canvas: tuple[int, int],
    pivot: tuple[int, int],
    maximum_size: tuple[int, int],
) -> Image.Image:
    scale = min(maximum_size[0] / image.width, maximum_size[1] / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    resized = image.resize(size, Image.Resampling.LANCZOS)
    alpha = resized.getchannel("A")
    sharpened = resized.filter(
        ImageFilter.UnsharpMask(radius=0.6, percent=75, threshold=3)
    )
    sharpened.putalpha(alpha)
    output = Image.new("RGBA", canvas, (0, 0, 0, 0))
    output.alpha_composite(
        sharpened, (pivot[0] - sharpened.width // 2, pivot[1] - sharpened.height)
    )
    return output


def encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def build_outputs() -> dict[str, bytes]:
    if {path: sha256_file(ROOT / path) for path in SOURCE_DIGESTS} != SOURCE_DIGESTS:
        raise ValueError("combat animation source digest drift")
    outputs: dict[str, bytes] = {}
    with Image.open(WARDEN_SOURCE) as master:
        for name, (left, right) in WARDEN_CROPS.items():
            cell = trim(
                remove_alpha_fragments(
                    keyed_alpha(master.crop((left, 0, right, master.height)))
                )
            )
            outputs[f"{name}.png"] = encode_png(
                miniature(cell, (112, 72), (56, 66), (104, 56))
            )
    with Image.open(WARDEN_ATTACK_CYCLE_SOURCE) as master:
        column_edges = [round(index * master.width / 5) for index in range(6)]
        for column, phase in enumerate(HOSTILE_ATTACK_PHASES):
            cell = trim(
                remove_alpha_fragments(
                    keyed_alpha(
                        master.crop(
                            (
                                column_edges[column],
                                0,
                                column_edges[column + 1],
                                master.height,
                            )
                        )
                    )
                )
            )
            outputs[f"iron-warden-basic-attack-{phase}.png"] = encode_png(
                miniature(cell, (112, 72), (56, 66), (104, 56))
            )
    with Image.open(WARDEN_SHIELD_SLAM_CYCLE_SOURCE) as master:
        column_edges = [round(index * master.width / 5) for index in range(6)]
        for column, phase in enumerate(HOSTILE_ATTACK_PHASES):
            cell = trim(
                remove_alpha_fragments(
                    keyed_alpha(
                        master.crop(
                            (
                                column_edges[column],
                                0,
                                column_edges[column + 1],
                                master.height,
                            )
                        )
                    )
                )
            )
            outputs[f"iron-warden-shield-slam-{phase}.png"] = encode_png(
                miniature(cell, (112, 72), (56, 66), (104, 56))
            )
    with Image.open(HOSTILE_SOURCE) as master:
        row_edges = [round(index * master.height / 3) for index in range(4)]
        for column, role in enumerate(HOSTILE_ROLES):
            for action, row in HOSTILE_ACTION_ROWS:
                left, right = HOSTILE_COLUMN_BOUNDS[column]
                cell = trim(
                    remove_alpha_fragments(
                        keyed_alpha(
                            master.crop(
                                (
                                    left,
                                    row_edges[row],
                                    right,
                                    row_edges[row + 1],
                                )
                            )
                        )
                    )
                )
                outputs[f"{role}-{action}.png"] = encode_png(
                    miniature(cell, (80, 60), (40, 54), (72, 44))
                )
    with Image.open(FACING_SOURCE) as master:
        column_edges = [round(index * master.width / 4) for index in range(5)]
        row_edges = [round(index * master.height / 4) for index in range(5)]
        for row, role in enumerate(HOSTILE_ROLES):
            for column, facing in enumerate(HOSTILE_FACINGS):
                cell = trim(
                    remove_alpha_fragments(
                        keyed_alpha(
                            master.crop(
                                (
                                    column_edges[column],
                                    row_edges[row],
                                    column_edges[column + 1],
                                    row_edges[row + 1],
                                )
                            )
                        )
                    )
                )
                outputs[f"{role}-idle-{facing}.png"] = encode_png(
                    miniature(cell, (80, 60), (40, 54), (72, 44))
                )
    with Image.open(HOSTILE_ATTACK_CYCLE_SOURCE) as master:
        column_edges = [round(index * master.width / 4) for index in range(5)]
        row_edges = [round(index * master.height / 5) for index in range(6)]
        for column, role in enumerate(HOSTILE_ROLES):
            for row, phase in enumerate(HOSTILE_ATTACK_PHASES):
                cell = trim(
                    remove_alpha_fragments(
                        keyed_alpha(
                            master.crop(
                                (
                                    column_edges[column],
                                    row_edges[row],
                                    column_edges[column + 1],
                                    row_edges[row + 1],
                                )
                            )
                        )
                    )
                )
                outputs[f"{role}-attack-{phase}.png"] = encode_png(
                    miniature(cell, (80, 60), (40, 54), (72, 44))
                )
    with Image.open(EXPANDED_HOSTILE_SOURCE) as master:
        column_edges = [round(index * master.width / 5) for index in range(6)]
        row_edges = [round(index * master.height / 3) for index in range(4)]
        for column, role in enumerate(EXPANDED_HOSTILE_ROLES):
            cells = []
            for row in range(3):
                cells.append(
                    trim(
                        remove_alpha_fragments(
                            keyed_alpha(
                                master.crop(
                                    (
                                        column_edges[column],
                                        row_edges[row],
                                        column_edges[column + 1],
                                        row_edges[row + 1],
                                    )
                                )
                            )
                        )
                    )
                )
            idle = encode_png(miniature(cells[0], (80, 60), (40, 54), (72, 44)))
            attack = encode_png(miniature(cells[1], (80, 60), (40, 54), (72, 44)))
            downed = encode_png(miniature(cells[2], (80, 60), (40, 54), (72, 44)))
            for facing in HOSTILE_FACINGS:
                outputs[f"{role}-idle-{facing}.png"] = idle
            outputs[f"{role}-attack.png"] = attack
            outputs[f"{role}-downed.png"] = downed
            for phase in HOSTILE_ATTACK_PHASES:
                outputs[f"{role}-attack-{phase}.png"] = attack
    return dict(sorted(outputs.items()))


def expected_manifest(outputs: dict[str, bytes]) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "id": "manifest.shuttergate.combat-animation",
        "license": "MIT",
        "licensePath": "LICENSE",
        "sources": SOURCE_DIGESTS,
        "files": [
            {
                "id": filename.removesuffix(".png"),
                "path": f"assets/game-art/combat-animation/exports/entities/{filename}",
                "dimensions": [112, 72]
                if filename.startswith("iron-warden-")
                else [80, 60],
                "mode": "RGBA",
                "alphaSemantics": "straight-alpha-padded-pivot",
                "sha256": sha256_bytes(content),
            }
            for filename, content in outputs.items()
        ],
    }


def verify() -> None:
    outputs = build_outputs()
    expected_files = set(outputs)
    actual_files = (
        {path.name for path in EXPORTS.iterdir() if path.is_file()}
        if EXPORTS.exists()
        else set()
    )
    if actual_files != expected_files:
        raise ValueError("combat animation export file set drift")
    for filename, expected in outputs.items():
        if (EXPORTS / filename).read_bytes() != expected:
            raise ValueError(f"combat animation export drift: {filename}")
    if json.loads(MANIFEST.read_text(encoding="utf-8")) != expected_manifest(outputs):
        raise ValueError("combat animation manifest drift")


def write() -> None:
    outputs = build_outputs()
    shutil.rmtree(EXPORTS.parent, ignore_errors=True)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    for filename, content in outputs.items():
        (EXPORTS / filename).write_bytes(content)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    manifest_text = json.dumps(expected_manifest(outputs), indent=2, ensure_ascii=False)
    manifest_text = re.sub(
        r'"dimensions": \[\n\s+(\d+),\n\s+(\d+)\n\s+\]',
        r'"dimensions": [\1, \2]',
        manifest_text,
    )
    MANIFEST.write_text(manifest_text + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    arguments = parser.parse_args()
    if arguments.verify:
        verify()
    else:
        write()
        verify()


if __name__ == "__main__":
    main()
