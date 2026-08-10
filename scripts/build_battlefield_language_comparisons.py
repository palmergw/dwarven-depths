#!/usr/bin/env python3
from hashlib import sha256
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/visual-evidence/battlefield-language/current"
CURRENT = OUTPUT / "dense-wave-reduced-motion.png"
SOURCES = (
    (
        ROOT / "assets/concept-art/dwarven-depths-gameplay-mockup.png",
        "FIXED CONCEPT TARGET",
        OUTPUT / "concept-target-vs-current-dense.png",
    ),
    (
        ROOT / "docs/visual-evidence/running-client/shuttergate-truth-screen.png",
        "PREVIOUS APPROVED STATIC BASELINE",
        OUTPUT / "previous-approved-vs-current-dense.png",
    ),
)


def fit(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = source.convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    panel = Image.new("RGB", size, "#080604")
    panel.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return panel


def build(source_path: Path, source_label: str, output_path: Path) -> None:
    board = Image.new("RGB", (1600, 650), "#080604")
    with Image.open(source_path) as source, Image.open(CURRENT) as current:
        board.paste(fit(source, (770, 482)), (20, 103))
        board.paste(fit(current, (770, 482)), (810, 103))
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10
    )
    draw.text((30, 20), source_label, fill="#f0bd67", font=font)
    draw.text(
        (815, 20), "CURRENT EXACT-HEAD DENSE COMBAT", fill="#f0bd67", font=font
    )
    board.save(output_path, optimize=True)
    print(f"{output_path.relative_to(ROOT)} {sha256(output_path.read_bytes()).hexdigest()}")


for source_path, source_label, output_path in SOURCES:
    build(source_path, source_label, output_path)
