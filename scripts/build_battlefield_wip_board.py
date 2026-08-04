from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "visual-evidence" / "battlefield-language" / "wip-01"
SOURCE = EVIDENCE / "shuttergate-truth-screen.png"
OUTPUT = EVIDENCE / "battlefield-language-wip-01.png"

screenshot = Image.open(SOURCE).convert("RGB")
if screenshot.size != (1440, 900):
    raise ValueError(f"expected 1440x900 running-client screenshot, got {screenshot.size}")

board = Image.new("RGB", (1440, 980), "#090705")
board.paste(screenshot, (0, 80))
draw = ImageDraw.Draw(board)
font = ImageFont.load_default(size=24)
label = "WIP 01 - AUTHORED COMBAT POSES + LIGHTING - NOT AN APPROVAL CANDIDATE"
draw.text((720, 40), label, fill="#f0c66f", font=font, anchor="mm")
board.save(OUTPUT, optimize=True)
print(OUTPUT)
