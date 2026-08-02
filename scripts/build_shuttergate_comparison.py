#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs/visual-evidence/production-scene/approved-keyframe-vs-reconstruction.png"
CURRENT = ROOT / "docs/visual-evidence/running-client/shuttergate-truth-screen.png"
OUTPUT = ROOT / "docs/visual-evidence/running-client/approved-keyframe-vs-running-client.png"

reference_board = Image.open(REFERENCE).convert("RGB")
current_capture = Image.open(CURRENT).convert("RGB")
if reference_board.size != (2560, 720):
    raise SystemExit(f"unexpected reference board size: {reference_board.size}")
if current_capture.size != (1440, 900):
    raise SystemExit(f"unexpected running-client capture size: {current_capture.size}")

approved_keyframe = reference_board.crop((0, 0, 1280, 720)).resize(
    (640, 360), Image.Resampling.LANCZOS
)
running_frame = current_capture.crop((80, 90, 1360, 810)).resize(
    (640, 360), Image.Resampling.LANCZOS
)

board = Image.new("RGB", (1440, 470), "#080b0d")
board.paste(approved_keyframe, (40, 72))
board.paste(running_frame, (760, 72))
draw = ImageDraw.Draw(board)
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
font = ImageFont.truetype(font_path, 24)
small = ImageFont.truetype(font_path, 17)
draw.text((40, 22), "ISSUE #284 APPROVED KEYFRAME", fill="#f0bd67", font=font)
draw.text((760, 22), "#287 RUNNING CLIENT · 1280×720", fill="#f0bd67", font=font)
draw.text((40, 440), "Composition reference", fill="#aeb6bd", font=small)
draw.text((760, 440), "Authoritative tick 1 · one Warden · one hostile", fill="#aeb6bd", font=small)
board.save(OUTPUT, optimize=True)
print(OUTPUT)
