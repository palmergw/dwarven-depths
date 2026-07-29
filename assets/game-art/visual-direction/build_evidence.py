#!/usr/bin/env python3
"""Build deterministic review exports from the Issue #282 raster masters."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "assets" / "game-art" / "visual-direction"
SOURCES = PACKAGE / "sources"
EXPORTS = PACKAGE / "exports"
EVIDENCE = ROOT / "docs" / "visual-evidence" / "concept-faithful-art"
CONCEPT = ROOT / "assets" / "concept-art" / "dwarven-depths-gameplay-mockup.png"

ENVIRONMENT_BOXES = {
    "background-receding-passage": (30, 41, 526, 482),
    "floor-winding-path": (545, 41, 1021, 482),
    "walls-arch-doorway": (1040, 41, 1641, 482),
    "props-foreground": (30, 507, 819, 893),
    "lighting-effects": (841, 507, 1641, 893),
}

HUD_BOXES = {
    "hud-frame": (45, 38, 1104, 483),
    "warden-portrait-frame": (1177, 39, 1497, 345),
    "health-bar": (1147, 379, 1629, 496),
    "ability-hammer": (220, 686, 432, 892),
    "ability-shield-slam": (503, 686, 716, 892),
    "ability-guard": (784, 686, 994, 892),
    "status-treatments": (46, 529, 1629, 644),
    "pause-control": (1148, 705, 1317, 872),
    "settings-control": (1370, 705, 1545, 872),
}


def open_rgb(path: Path) -> Image.Image:
    image = Image.open(path)
    image.load()
    return image.convert("RGB")


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def scaled_sheet(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def labeled_montage(images: list[tuple[str, Image.Image]], path: Path) -> None:
    width = 1280
    margin = 24
    label_height = 28
    cell_width = (width - margin * 4) // 3
    rows: list[list[tuple[str, Image.Image]]] = [images[:3], images[3:]]
    row_heights = []
    prepared: list[list[tuple[str, Image.Image]]] = []
    for row in rows:
        rendered = []
        max_height = 0
        for label, image in row:
            scale = min(cell_width / image.width, 320 / image.height)
            resized = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
            rendered.append((label, resized))
            max_height = max(max_height, resized.height)
        prepared.append(rendered)
        row_heights.append(label_height + max_height)

    canvas = Image.new("RGB", (width, margin * 3 + sum(row_heights)), "#0b101a")
    draw = ImageDraw.Draw(canvas)
    y = margin
    for rendered, row_height in zip(prepared, row_heights, strict=True):
        x = margin
        for label, image in rendered:
            draw.text((x, y), label, fill="#e8c27a")
            canvas.paste(image, (x, y + label_height))
            x += cell_width + margin
        y += row_height + margin
    save_png(canvas, path)


def file_record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
        mode = image.mode
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "dimensions": dimensions,
        "mode": mode,
    }


def main() -> None:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    concept = open_rgb(CONCEPT)
    keyframe_master = open_rgb(SOURCES / "keyframe-master.png")
    warden_master = open_rgb(SOURCES / "iron-warden-master.png")
    hostile_master = open_rgb(SOURCES / "mine-raider-master.png")
    environment_master = open_rgb(SOURCES / "environment-board-master.png")
    hud_master = open_rgb(SOURCES / "hud-board-master.png")

    if concept.size != (1672, 941) or keyframe_master.size != (1672, 941):
        raise ValueError("Concept and keyframe masters must retain their natural review scale")
    if hashlib.sha256(CONCEPT.read_bytes()).digest() == hashlib.sha256(
        (SOURCES / "keyframe-master.png").read_bytes()
    ).digest():
        raise ValueError("Original keyframe must not reuse the concept raster")

    keyframe = keyframe_master.resize((1280, 720), Image.Resampling.LANCZOS)
    save_png(keyframe, EXPORTS / "shuttergate-keyframe-1280x720.png")

    comparison = Image.new("RGB", (3344, 941), "black")
    comparison.paste(concept, (0, 0))
    comparison.paste(keyframe_master, (1672, 0))
    save_png(comparison, EVIDENCE / "concept-keyframe-side-by-side.png")

    camera_path_crop = keyframe_master.crop((72, 70, 1600, 850))
    save_png(camera_path_crop, EVIDENCE / "camera-path-environment-crop.png")

    warden_native = scaled_sheet(warden_master, 128)
    hostile_native = scaled_sheet(hostile_master, 128)
    save_png(warden_native, EXPORTS / "iron-warden-actions-native.png")
    save_png(hostile_native, EXPORTS / "mine-raider-actions-native.png")
    save_png(
        warden_native.resize(
            (warden_native.width * 4, warden_native.height * 4),
            Image.Resampling.NEAREST,
        ),
        EVIDENCE / "iron-warden-actions-4x.png",
    )
    save_png(
        hostile_native.resize(
            (hostile_native.width * 4, hostile_native.height * 4),
            Image.Resampling.NEAREST,
        ),
        EVIDENCE / "mine-raider-actions-4x.png",
    )

    environment_layers = []
    for name, box in ENVIRONMENT_BOXES.items():
        image = environment_master.crop(box)
        save_png(image, EXPORTS / "environment" / f"{name}.png")
        environment_layers.append((name.replace("-", " ").title(), image))
    labeled_montage(environment_layers, EVIDENCE / "environment-layer-breakdown.png")

    for name, box in HUD_BOXES.items():
        save_png(hud_master.crop(box), EXPORTS / "hud" / f"{name}.png")
    save_png(hud_master, EVIDENCE / "hud-production-sheet.png")

    scale_proof = Image.new("RGB", (1280, 900), "#080d15")
    scale_proof.paste(keyframe, (0, 0))
    draw = ImageDraw.Draw(scale_proof)
    draw.text((24, 742), "NATIVE GAMEPLAY SCALE — WARDEN", fill="#e8c27a")
    scale_proof.paste(warden_native, (24, 764))
    hostile_x = 1280 - hostile_native.width - 24
    draw.text((hostile_x, 742), "MINE RAIDER", fill="#e8c27a")
    scale_proof.paste(hostile_native, (hostile_x, 764))
    save_png(scale_proof, EVIDENCE / "character-battlefield-scale-proof.png")

    tracked_images = sorted(
        [*SOURCES.glob("*.png"), *EXPORTS.rglob("*.png"), *EVIDENCE.glob("*.png")]
    )
    manifest = {
        "schemaVersion": 1,
        "package": "dwarven-depths-issue-282-visual-direction",
        "logicalFrame": [640, 360],
        "reviewFrame": [1280, 720],
        "logicalTexelScale": 2,
        "characterNativeHeight": 128,
        "nearestNeighborReviewScale": 4,
        "files": [file_record(path) for path in tracked_images],
    }
    (PACKAGE / "metadata" / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"ok": True, "images": len(tracked_images)}))


if __name__ == "__main__":
    main()
