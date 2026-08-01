#!/usr/bin/env python3
"""Compose the canonical no-entity reference from same-camera Blender passes."""
from __future__ import annotations

import argparse
from pathlib import Path

import PIL
from PIL import Image

FRAME = (1280, 720)
LAYERS = ("environment-base.png", "entrance-shell.png")


def load(root: Path, name: str) -> Image.Image:
    path = root / name
    with Image.open(path) as source:
        if source.format != "PNG" or source.mode != "RGBA" or source.size != FRAME:
            raise ValueError(f"invalid same-camera pass: {path}")
        return source.copy()


def compose(root: Path) -> Path:
    if PIL.__version__ != "12.3.0":
        raise ValueError(f"Pillow 12.3.0 required, got {PIL.__version__}")
    reference = load(root, LAYERS[0])
    for name in LAYERS[1:]:
        reference.alpha_composite(load(root, name))
    output = root / "reference-plate.png"
    reference.save(output, optimize=False, compress_level=9)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    print(compose(args.root.resolve()))


if __name__ == "__main__":
    main()
