#!/usr/bin/env python3
"""Prepare the approved Issue #282 raster package for the web renderer."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "game-art" / "visual-direction" / "exports"
DESTINATION = ROOT / "apps" / "web" / "src" / "assets" / "shuttergate"
ENVIRONMENT_SOURCE = SOURCE / "environment"
FRAME_SIZE = (1280, 720)
ENVIRONMENT_EXCLUSIONS = [
    "characters",
    "creatures",
    "combat-effects",
    "state-text",
    "controls",
    "hud",
]


def remove_backing(source: Path, destination: Path, backing: tuple[int, int, int]) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = []
    for red, green, blue, _alpha in image.getdata():
        distance = ((red - backing[0]) ** 2 + (green - backing[1]) ** 2 + (blue - backing[2]) ** 2) ** 0.5
        if distance <= 11:
            alpha = 0
        elif distance < 24:
            alpha = round(255 * (distance - 11) / 13)
        else:
            alpha = 255
        pixels.append((red, green, blue, alpha))
    image.putdata(pixels)
    image.save(destination, format="PNG", optimize=True)


def feathered_mask(size: tuple[int, int], inset: int) -> Image.Image:
    mask = Image.new("L", size)
    inner = Image.new("L", (size[0] - inset * 2, size[1] - inset * 2), 255)
    mask.paste(inner, (inset, inset))
    return mask.filter(ImageFilter.GaussianBlur(inset))


def place_layer(
    source: Path,
    destination: Path,
    box: tuple[int, int, int, int],
    *,
    opacity: int = 255,
) -> None:
    width = box[2] - box[0]
    height = box[3] - box[1]
    image = ImageOps.fit(
        Image.open(source).convert("RGB"),
        (width, height),
        method=Image.Resampling.LANCZOS,
    ).convert("RGBA")
    mask = feathered_mask((width, height), max(12, min(width, height) // 14))
    if opacity != 255:
        mask = mask.point(lambda alpha: round(alpha * opacity / 255))
    image.putalpha(mask)
    canvas = Image.new("RGBA", FRAME_SIZE)
    canvas.alpha_composite(image, (box[0], box[1]))
    canvas.save(destination, format="PNG", optimize=True)


def record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "dimensions": dimensions,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def prepare_environment() -> list[dict[str, object]]:
    background_source = ENVIRONMENT_SOURCE / "background-receding-passage.png"
    background_path = DESTINATION / "environment-background.png"
    background = ImageOps.fit(
        Image.open(background_source).convert("RGB"),
        FRAME_SIZE,
        method=Image.Resampling.LANCZOS,
    )
    background.save(background_path, format="PNG", optimize=True)

    records = [
        {
            **record(background_path),
            "role": "environment",
            "sourcePath": background_source.relative_to(ROOT).as_posix(),
            "excludes": ENVIRONMENT_EXCLUSIONS,
        }
    ]
    layer_specs = [
        ("environment-floor-path.png", "floor-winding-path.png", (115, 120, 1175, 700), 245),
        ("environment-architecture.png", "walls-arch-doorway.png", (155, 10, 1250, 560), 235),
        ("environment-foreground.png", "props-foreground.png", (0, 390, 1280, 720), 235),
        ("environment-lighting.png", "lighting-effects.png", (0, 0, 1280, 720), 145),
    ]
    for destination_name, source_name, box, opacity in layer_specs:
        destination = DESTINATION / destination_name
        source = ENVIRONMENT_SOURCE / source_name
        place_layer(source, destination, box, opacity=opacity)
        records.append(
            {
                **record(destination),
                "role": "environment",
                "sourcePath": source.relative_to(ROOT).as_posix(),
                "excludes": ENVIRONMENT_EXCLUSIONS,
            }
        )
    return records


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for stale_export in DESTINATION.glob("*.png"):
        stale_export.unlink()
    environment_records = prepare_environment()
    remove_backing(
        SOURCE / "iron-warden-actions-native.png",
        DESTINATION / "iron-warden-actions.png",
        (4, 21, 45),
    )
    remove_backing(
        SOURCE / "mine-raider-actions-native.png",
        DESTINATION / "mine-raider-actions.png",
        (1, 17, 31),
    )
    for name in ("ability-shield-slam", "pause-control", "hud-frame"):
        Image.open(SOURCE / "hud" / f"{name}.png").save(
            DESTINATION / f"{name}.png", format="PNG", optimize=True
        )

    files = sorted(DESTINATION.glob("*.png"))
    environment_by_path = {entry["path"]: entry for entry in environment_records}
    manifest = {
        "schemaVersion": 2,
        "sourcePackage": "dwarven-depths-issue-282-visual-direction",
        "license": "original-project-asset",
        "environmentPolicy": {
            "sourceDirectory": ENVIRONMENT_SOURCE.relative_to(ROOT).as_posix(),
            "excludes": ENVIRONMENT_EXCLUSIONS,
        },
        "files": [
            environment_by_path.get(path_record["path"], path_record)
            for path in files
            for path_record in [record(path)]
        ],
    }
    (DESTINATION / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    subprocess.run(
        [
            "pnpm",
            "exec",
            "biome",
            "format",
            "--write",
            str(DESTINATION / "manifest.json"),
        ],
        check=True,
        cwd=ROOT,
    )
    print(json.dumps({"ok": True, "files": len(files)}))


if __name__ == "__main__":
    main()
