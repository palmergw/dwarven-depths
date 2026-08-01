from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/visual-evidence/running-client"
SCREENSHOT = EVIDENCE / "shuttergate-truth-screen.png"
SIDECAR = EVIDENCE / "shuttergate-truth-screen.json"
PROBE_SCREENSHOT = EVIDENCE / "shuttergate-depth-probe.png"
PROBE_SIDECAR = EVIDENCE / "shuttergate-depth-probe.json"
OUTPUT = EVIDENCE / "shuttergate-depth-resolution.png"
FOREGROUND = ROOT / "assets/game-art/layered-map-poc/blender/outputs/entrance-shell.png"
WORLD_CROP = (900, 100, 1280, 420)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


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
    final_sidecar = json.loads(SIDECAR.read_text())
    probe_sidecar = json.loads(PROBE_SIDECAR.read_text())
    hostile = next(entity for entity in final_sidecar["truth"]["registry"]["entities"] if entity["faction"] == "enemy")
    actual_anchor = (hostile["x"], hostile["y"])
    actual_overlap = final_sidecar["visualAssetAudit"]["depthResolution"]["actualPixelsBehindArtifact"]
    probe_anchor = tuple(probe_sidecar["probeAnchor"])
    probe_overlap = probe_sidecar["foregroundOverlapPixels"]
    full_ratio = probe_sidecar["hostilePresentation"]["fullAlphaRatio"]
    if actual_overlap != 0 or probe_overlap <= 0 or full_ratio < 0.8:
        raise SystemExit(
            f"depth resolution contract failed: actual={actual_overlap}, probe={probe_overlap}, fullAlphaRatio={full_ratio}"
        )

    screenshot = Image.open(SCREENSHOT).convert("RGBA")
    probe_screenshot = Image.open(PROBE_SCREENSHOT).convert("RGBA")
    foreground = Image.open(FOREGROUND).convert("RGBA")
    stage = screenshot.crop((80, 90, 1360, 810))
    probe_stage = probe_screenshot.crop((80, 90, 1360, 810))
    actual_zoom = stage.crop(WORLD_CROP)
    probe_zoom = probe_stage.crop(WORLD_CROP)

    isolated = checker((WORLD_CROP[2] - WORLD_CROP[0], WORLD_CROP[3] - WORLD_CROP[1]))
    isolated.alpha_composite(foreground.crop(WORLD_CROP))

    board = Image.new("RGBA", (1600, 980), (8, 11, 16, 255))
    draw = ImageDraw.Draw(board)
    draw.text((42, 26), "SHUTTERGATE DEPTH RESOLUTION", font=font(30, True), fill=(236, 190, 102, 255))
    draw.text(
        (42, 68),
        "Two actual running-client captures using the same fixture, sprite texture, foreground layer, and renderer",
        font=font(18),
        fill=(190, 197, 205, 255),
    )

    board.alpha_composite(fit(stage, (740, 416)), (42, 112))
    board.alpha_composite(fit(probe_stage, (740, 416)), (818, 112))
    draw.text(
        (42, 540),
        f"A  FINAL PLAYER FRAME — anchor {actual_anchor}; overlap {actual_overlap} / {hostile['nonzeroAlphaPixels']}",
        font=font(16, True),
        fill=(134, 225, 167, 255),
    )
    draw.text(
        (818, 540),
        f"B  RUNNING-CLIENT PROBE — anchor {probe_anchor}; overlap {probe_overlap} / {hostile['nonzeroAlphaPixels']}",
        font=font(16, True),
        fill=(236, 190, 102, 255),
    )

    board.alpha_composite(fit(actual_zoom, (480, 360)), (42, 590))
    board.alpha_composite(fit(probe_zoom, (480, 360)), (560, 590))
    board.alpha_composite(fit(isolated, (480, 360)), (1078, 590))
    draw.text((42, 930), "Final running-client crop", font=font(14, True), fill=(220, 225, 231, 255))
    draw.text((560, 930), "Actual renderer probe crop", font=font(14, True), fill=(220, 225, 231, 255))
    draw.text((1078, 930), "Native authored entrance-shell RGBA", font=font(14, True), fill=(220, 225, 231, 255))

    board.convert("RGB").save(OUTPUT, optimize=True)
    print(
        json.dumps(
            {
                "ok": True,
                "output": str(OUTPUT),
                "actualAnchor": actual_anchor,
                "actualOverlap": actual_overlap,
                "probeAnchor": probe_anchor,
                "probeOverlap": probe_overlap,
                "probeFullAlphaRatio": full_ratio,
            }
        )
    )


if __name__ == "__main__":
    main()
