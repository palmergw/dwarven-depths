from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/visual-evidence/running-client"
SCREENSHOT = EVIDENCE / "shuttergate-truth-screen.png"
SIDECAR = EVIDENCE / "shuttergate-truth-screen.json"
OUTPUT = EVIDENCE / "shuttergate-depth-resolution.png"
BASE = ROOT / "assets/game-art/layered-map-poc/blender/outputs/environment-base.png"
FOREGROUND = ROOT / "assets/game-art/layered-map-poc/blender/outputs/entrance-shell.png"
HOSTILE = ROOT / "assets/game-art/production-scene/exports/entities/mine-raider-idle.png"
PROBE_ANCHOR = (1060, 200)
PIVOT = (40, 54)
WORLD_CROP = (900, 100, 1280, 420)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


def overlap(subject: Image.Image, foreground: Image.Image, anchor: tuple[int, int]) -> int:
    subject_alpha = subject.getchannel("A")
    foreground_alpha = foreground.getchannel("A")
    left = anchor[0] - PIVOT[0]
    top = anchor[1] - PIVOT[1]
    total = 0
    for y in range(subject.height):
        for x in range(subject.width):
            if subject_alpha.getpixel((x, y)) and foreground_alpha.getpixel((left + x, top + y)):
                total += 1
    return total


def composite_at(base: Image.Image, subject: Image.Image, foreground: Image.Image, anchor: tuple[int, int]) -> Image.Image:
    result = base.copy()
    result.alpha_composite(subject, (anchor[0] - PIVOT[0], anchor[1] - PIVOT[1]))
    result.alpha_composite(foreground)
    return result


def checker(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (32, 35, 40, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(56, 59, 64, 255))
    return image


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (10, 13, 18, 255))
    canvas.alpha_composite(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return canvas


def main() -> None:
    sidecar = json.loads(SIDECAR.read_text())
    hostile_registry = next(entity for entity in sidecar["truth"]["registry"]["entities"] if entity["faction"] == "enemy")
    actual_anchor = (hostile_registry["x"], hostile_registry["y"])

    screenshot = Image.open(SCREENSHOT).convert("RGBA")
    base = Image.open(BASE).convert("RGBA")
    foreground = Image.open(FOREGROUND).convert("RGBA")
    hostile = Image.open(HOSTILE).convert("RGBA")

    actual_overlap = overlap(hostile, foreground, actual_anchor)
    probe_overlap = overlap(hostile, foreground, PROBE_ANCHOR)
    if actual_overlap != 0 or probe_overlap <= 0:
        raise SystemExit(f"depth resolution contract failed: actual={actual_overlap}, probe={probe_overlap}")

    probe_world = composite_at(base, hostile, foreground, PROBE_ANCHOR)
    stage = screenshot.crop((80, 90, 1360, 810))
    actual_zoom = stage.crop(WORLD_CROP)
    probe_zoom = probe_world.crop(WORLD_CROP)

    isolated = checker((WORLD_CROP[2] - WORLD_CROP[0], WORLD_CROP[3] - WORLD_CROP[1]))
    isolated.alpha_composite(foreground.crop(WORLD_CROP))

    board = Image.new("RGBA", (1600, 980), (8, 11, 16, 255))
    draw = ImageDraw.Draw(board)
    draw.text((42, 26), "SHUTTERGATE DEPTH RESOLUTION", font=font(30, True), fill=(236, 190, 102, 255))
    draw.text((42, 68), "Final player frame plus an independent overlap probe using the same hostile and authored foreground pixels", font=font(18), fill=(190, 197, 205, 255))

    board.alpha_composite(fit(stage, (740, 416)), (42, 112))
    board.alpha_composite(fit(probe_world, (740, 416)), (818, 112))
    draw.text((42, 540), f"A  FINAL RUNNING CLIENT — anchor {actual_anchor}; foreground overlap {actual_overlap} / {hostile_registry['nonzeroAlphaPixels']}", font=font(16, True), fill=(134, 225, 167, 255))
    draw.text((818, 540), f"B  DEPTH PROBE — anchor {PROBE_ANCHOR}; foreground overlap {probe_overlap} / {hostile_registry['nonzeroAlphaPixels']}", font=font(16, True), fill=(236, 190, 102, 255))

    board.alpha_composite(fit(actual_zoom, (480, 360)), (42, 590))
    board.alpha_composite(fit(probe_zoom, (480, 360)), (560, 590))
    board.alpha_composite(fit(isolated, (480, 360)), (1078, 590))
    draw.text((42, 930), "Final crop — clear of shell and foreground posts", font=font(14, True), fill=(220, 225, 231, 255))
    draw.text((560, 930), "Probe crop — same sprite occluded by authored shell", font=font(14, True), fill=(220, 225, 231, 255))
    draw.text((1078, 930), "Native authored entrance-shell RGBA", font=font(14, True), fill=(220, 225, 231, 255))

    board.convert("RGB").save(OUTPUT, optimize=True)
    print(json.dumps({"ok": True, "output": str(OUTPUT), "actualAnchor": actual_anchor, "actualOverlap": actual_overlap, "probeAnchor": PROBE_ANCHOR, "probeOverlap": probe_overlap}))


if __name__ == "__main__":
    main()
