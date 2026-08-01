#!/usr/bin/env python3
"""Build a clear product-owner WIP review board from canonical Blender outputs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "outputs"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

REVIEW_INDEX = """# Shuttergate tutorial map — corrected product-owner review index

Status: **Changes required / bounded WIP review only**

This map is explicitly categorized as a **tutorial map**. Its scale is not evidence that the large-map composition problem is solved. Review the corrected Blender-source evidence in this order:

1. **Clean map:** `blender/outputs/reference-plate.png`
   - No entities, diagnostics, HUD, or controls.
   - Judge the tutorial court, hooked route, entrance, and defended shutter.
   - The rejected lower-edge framing has been removed.

2. **Production sprite scale and occlusion:** `blender/outputs/production-sprite-traversal.png`
   - Approved Warden at 56 px nominal alpha height.
   - Approved raiders at 44 px nominal alpha height.
   - Raider and Warden presentation alpha is normalized so units read as solid.
   - Judge tutorial-scale readability and entrance occlusion.

3. **Native foreground isolation:** `evidence/shared-camera-foreground-isolation.png`
   - Full-frame 1280×720 checkerboard presentation of the renderer-native entrance RGBA.
   - No traced masks, chroma keying, or post-render geometry transforms.

4. **Single summary board:** `evidence/shared-camera-product-owner-review.png`
   - Clearly labels the three visual surfaces and the bounded review contract.

## Current measurable contract

- Authored floor: 40×46 world units with a broad unobstructed central court.
- Route: hooked, broad, and nonbranching.
- Orthographic camera: 50 world units.
- No decorative edge-framing foreground pass remains.
- The entrance shell is the only purposeful foreground occluder.
- Source: one editable Blender scene and one shared camera.

## Requested WIP judgment

- Is the court readable and appropriately bounded for a tutorial map?
- Does the hooked route read immediately across the unobstructed tactical floor?
- Are route, tunnel, shutter, units, and foreground occlusion readable?
- Is this a viable basis for movement toward the original painterly dwarven-fortress direction?

## Not claimed complete

- Painterly finish.
- Final carved masonry, chains, machinery, or set dressing.
- Final entrance voussoir and defended-shutter detailing.
- Final product approval.
- Any claim that large-map scale has been solved.
"""


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def checkerboard(size=(1280, 720), cell=32):
    image = Image.new("RGBA", size, (62, 67, 74, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(103, 110, 120, 255))
    return image


def labeled_panel(image, title, subtitle, size=(1235, 695)):
    panel = Image.new("RGB", size, (10, 15, 22))
    fitted = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    panel.paste(fitted)
    draw = ImageDraw.Draw(panel, "RGBA")
    draw.rectangle((0, 0, size[0], 76), fill=(4, 8, 14, 225))
    draw.text((24, 12), title, font=font(28, True), fill=(244, 211, 142, 255))
    draw.text((24, 46), subtitle, font=font(17), fill=(220, 228, 236, 255))
    return panel


def text_panel(size=(1235, 695)):
    panel = Image.new("RGB", size, (13, 20, 29))
    draw = ImageDraw.Draw(panel)
    draw.text((36, 28), "D — REVIEW CONTRACT", font=font(30, True), fill=(244, 211, 142))
    y = 82
    sections = [
        ("Product category", [
            "Explicit category: tutorial map",
            "Scale accepted only in that bounded category",
            "Large-map composition remains a separate open problem",
        ]),
        ("Evidence facts", [
            "Authored floor: 40 × 46; one central tutorial court",
            "Hooked route: broad, readable, and nonbranching",
            "Approved Warden: 56 px; Raider: 44 px",
            "Units opacity-normalized without canvas or pivot changes",
        ]),
        ("Architecture intent", [
            "No bridge, gantry, or floor-consuming bastions",
            "Rejected lower-edge framing removed",
            "Entrance owns the only purposeful local occlusion",
        ]),
        ("Please judge in this WIP", [
            "Tutorial-scale court and hooked-route readability",
            "Opaque units and unobscured lower frame",
            "Route, gate, tunnel, sprites, and visual direction",
        ]),
        ("Not claimed complete", [
            "Painterly finish, carved detail, chains, machinery",
            "Final entrance voussoirs and shutter dressing",
        ]),
    ]
    for heading, bullets in sections:
        draw.text((40, y), heading, font=font(22, True), fill=(139, 194, 228))
        y += 31
        for item in bullets:
            draw.ellipse((48, y + 7, 57, y + 16), fill=(235, 157, 72))
            draw.text((70, y), item, font=font(18), fill=(229, 234, 240))
            y += 27
        y += 12
    return panel


def build_review_packet(evidence: Path) -> list[Path]:
    evidence.mkdir(parents=True, exist_ok=True)
    board_path = evidence / "shared-camera-product-owner-review.png"
    isolation_path = evidence / "shared-camera-foreground-isolation.png"
    index_path = evidence / "shared-camera-review-index.md"
    reference = Image.open(OUT / "reference-plate.png").convert("RGBA")
    traversal = Image.open(OUT / "production-sprite-traversal.png").convert("RGBA")
    entrance = Image.open(OUT / "entrance-shell.png").convert("RGBA")
    for name, image in (("reference", reference), ("traversal", traversal), ("entrance", entrance)):
        if image.size != (1280, 720):
            raise ValueError(f"{name} has unexpected size {image.size}")

    isolation = checkerboard()
    isolation.alpha_composite(entrance)
    draw = ImageDraw.Draw(isolation, "RGBA")
    for title, layer, color in (
        ("ENTRANCE ONLY", entrance, (68, 192, 255, 255)),
    ):
        bbox = layer.getchannel("A").getbbox()
        if not bbox:
            raise ValueError(f"{title} alpha is empty")
        draw.rectangle(bbox, outline=color, width=3)
        tx, ty = bbox[0] + 8, max(8, bbox[1] + 8)
        text_box = draw.textbbox((tx, ty), title, font=font(20, True))
        draw.rectangle((text_box[0] - 5, text_box[1] - 3, text_box[2] + 5, text_box[3] + 3), fill=(5, 9, 14, 210))
        draw.text((tx, ty), title, font=font(20, True), fill=color)
    isolation.convert("RGB").save(isolation_path, optimize=False, compress_level=9)

    board = Image.new("RGB", (2560, 1600), (7, 11, 17))
    draw = ImageDraw.Draw(board)
    draw.text((34, 22), "DWARVEN DEPTHS — SHUTTERGATE TUTORIAL MAP", font=font(36, True), fill=(245, 216, 155))
    draw.text((35, 68), "Corrected scope: tutorial scale; edge framing removed; unit opacity normalized", font=font(21), fill=(183, 199, 214))
    panels = [
        labeled_panel(reference, "A — CLEAN TUTORIAL MAP", "Rejected lower-edge framing removed; no entities, HUD, or diagnostics"),
        labeled_panel(traversal, "B — OPAQUE PRODUCTION UNITS", "Approved 56 px Warden / 44 px raiders; canvas and pivots unchanged"),
        labeled_panel(isolation, "C — PURPOSEFUL FOREGROUND ONLY", "Entrance shell is the sole full-frame shared-camera RGBA artifact"),
        text_panel(),
    ]
    positions = ((30, 112), (1295, 112), (30, 832), (1295, 832))
    for panel, position in zip(panels, positions):
        board.paste(panel, position)
    draw.text((34, 1542), "Status: tutorial-map correction review — no claim that large-map scale is solved", font=font(20, True), fill=(241, 145, 102))
    board.save(board_path, optimize=False, compress_level=9)
    index_path.write_text(REVIEW_INDEX)
    return [board_path, isolation_path, index_path]


if __name__ == "__main__":
    for path in build_review_packet(HERE.parent / "evidence"):
        print(path)
