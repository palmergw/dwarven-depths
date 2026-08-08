#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/visual-evidence/release-closeout/wip-02/comparisons"
CONCEPT = ROOT / "assets/concept-art/dwarven-depths-gameplay-mockup.png"
PREVIOUS = ROOT / "docs/visual-evidence/combat-hud/wip-01/wip-default-active.png"
CURRENT = (
    ROOT
    / "docs/visual-evidence/release-closeout/wip-02/combat/wip-default-active.png"
)
CURRENT_SIDECAR = (
    ROOT
    / "docs/visual-evidence/release-closeout/wip-02/combat/wip-default-active.json"
)
PREVIOUS_MANIFEST = ROOT / "docs/visual-evidence/combat-hud/wip-01/manifest.json"
PANEL_SIZE = (1240, 700)
BOARD_SIZE = (2600, 820)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contain(image: Image.Image) -> Image.Image:
    result = Image.new("RGB", PANEL_SIZE, "#080604")
    fitted = image.convert("RGB")
    fitted.thumbnail(PANEL_SIZE, Image.Resampling.LANCZOS)
    offset = (
        (PANEL_SIZE[0] - fitted.width) // 2,
        (PANEL_SIZE[1] - fitted.height) // 2,
    )
    result.paste(fitted, offset)
    return result


def board(left: Path, right: Path, left_label: str, right_label: str) -> Image.Image:
    result = Image.new("RGB", BOARD_SIZE, "#080604")
    result.paste(contain(Image.open(left)), (40, 80))
    result.paste(contain(Image.open(right)), (1320, 80))
    draw = ImageDraw.Draw(result)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, 24)
    draw.text((40, 28), left_label, fill="#f0bd67", font=font)
    draw.text((1320, 28), right_label, fill="#f0bd67", font=font)
    return result


def pixel_difference(left: Path, right: Path) -> dict[str, int | str]:
    left_image = Image.open(left).convert("RGBA")
    right_image = Image.open(right).convert("RGBA")
    if left_image.size != right_image.size:
        raise ValueError("previous and current screenshots must have equal dimensions")
    difference = ImageChops.difference(left_image, right_image)
    difference_pixels = list(difference.get_flattened_data())
    changed_pixels = sum(
        1 for pixel in difference_pixels if any(channel != 0 for channel in pixel)
    )
    maximum_channel_delta = max(
        channel for pixel in difference_pixels for channel in pixel
    )
    return {
        "method": "RGBA pixel comparison at 1440x900",
        "changedPixels": changed_pixels,
        "maximumChannelDelta": maximum_channel_delta,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    current_sidecar = json.loads(CURRENT_SIDECAR.read_text())
    previous_manifest = json.loads(PREVIOUS_MANIFEST.read_text())

    concept_board = OUTPUT / "concept-vs-current.png"
    previous_board = OUTPUT / "previous-approved-vs-current.png"
    board(
        CONCEPT,
        CURRENT,
        "FIXED CONCEPT TARGET · WHOLE IMAGE",
        "#277 CURRENT RUNNING CLIENT · 1440×900",
    ).save(concept_board, optimize=True)
    board(
        PREVIOUS,
        CURRENT,
        "PREVIOUS APPROVED #275 · 1440×900",
        "#277 CURRENT RUNNING CLIENT · 1440×900",
    ).save(previous_board, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "sourceHead": source_head,
        "currentEvidenceHead": current_sidecar["sourceHead"],
        "previousApprovedEvidenceHead": previous_manifest["sourceHead"],
        "inputs": {
            "concept": {"path": str(CONCEPT.relative_to(ROOT)), "sha256": sha256(CONCEPT)},
            "previousApproved": {
                "path": str(PREVIOUS.relative_to(ROOT)),
                "sha256": sha256(PREVIOUS),
            },
            "current": {
                "path": str(CURRENT.relative_to(ROOT)),
                "sha256": sha256(CURRENT),
            },
        },
        "comparisons": [
            {"path": str(concept_board.relative_to(ROOT)), "sha256": sha256(concept_board)},
            {"path": str(previous_board.relative_to(ROOT)), "sha256": sha256(previous_board)},
        ],
        "previousToCurrentPixelDifference": pixel_difference(PREVIOUS, CURRENT),
        "compositionMethod": "whole-image contain; no crop, trace, or runtime reuse",
    }
    (OUTPUT / "manifest.json").write_text(f"{json.dumps(manifest, indent=2)}\n")
    print(json.dumps({"ok": True, **manifest}))


if __name__ == "__main__":
    main()
