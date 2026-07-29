#!/usr/bin/env python3
"""Prepare the approved Issue #282 raster package for the web renderer."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "game-art" / "visual-direction" / "exports"
DESTINATION = ROOT / "apps" / "web" / "src" / "assets" / "shuttergate"


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


def record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "dimensions": dimensions,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for stale_export in DESTINATION.glob("*.png"):
        stale_export.unlink()
    shutil.copyfile(
        SOURCE / "shuttergate-keyframe-1280x720.png",
        DESTINATION / "shuttergate-keyframe-1280x720.png",
    )
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
    for name in ("ability-shield-slam",):
        shutil.copyfile(SOURCE / "hud" / f"{name}.png", DESTINATION / f"{name}.png")

    files = sorted(DESTINATION.glob("*.png"))
    manifest = {
        "schemaVersion": 1,
        "sourcePackage": "dwarven-depths-issue-282-visual-direction",
        "license": "original-project-asset",
        "files": [record(path) for path in files],
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
