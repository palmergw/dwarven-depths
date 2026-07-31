#!/usr/bin/env python3
"""Build and verify the compositable Shuttergate production-scene package."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zlib
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageStat
from PIL import __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "assets" / "game-art" / "production-scene"
SOURCES = PACKAGE / "sources"
EXPORTS = PACKAGE / "exports"
METADATA = PACKAGE / "metadata"
EVIDENCE = ROOT / "docs" / "visual-evidence" / "production-scene"
DIRECTION = ROOT / "assets" / "game-art" / "visual-direction"
FRAME = (1280, 720)

PALETTE = {
    "void": (3, 9, 18, 244),
    "stone": (38, 48, 60, 250),
    "stone_light": (73, 82, 91, 255),
    "iron": (13, 19, 27, 255),
    "copper": (156, 91, 48, 255),
    "gold": (222, 170, 88, 255),
    "red": (151, 39, 34, 255),
    "blue": (49, 123, 154, 255),
}

FONT = {
    " ": ["000", "000", "000", "000", "000", "000", "000"],
    "-": ["000", "000", "000", "111", "000", "000", "000"],
    "/": ["001", "001", "010", "010", "100", "100", "000"],
    ":": ["0", "1", "0", "0", "1", "0", "0"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["010", "110", "010", "010", "010", "010", "111"],
    "2": ["11110", "00001", "00001", "01110", "10000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["111", "010", "010", "010", "010", "010", "111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
}


def png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True, compress_level=9)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cover_16_9(image: Image.Image) -> Image.Image:
    target_ratio = 16 / 9
    ratio = image.width / image.height
    if ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    return image.resize(FRAME, Image.Resampling.LANCZOS).convert("RGBA")


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    samples = []
    strip = max(8, min(rgb.size) // 30)
    samples.extend(rgb.crop((0, 0, rgb.width, strip)).get_flattened_data())
    samples.extend(
        rgb.crop((0, rgb.height - strip, rgb.width, rgb.height)).get_flattened_data()
    )
    samples.extend(rgb.crop((0, 0, strip, rgb.height)).get_flattened_data())
    samples.extend(
        rgb.crop((rgb.width - strip, 0, rgb.width, rgb.height)).get_flattened_data()
    )
    channels = list(zip(*samples, strict=True))
    return tuple(sorted(channel)[len(channel) // 2] for channel in channels)  # type: ignore[return-value]


def keyed_alpha(image: Image.Image, threshold: int = 10, feather: int = 30) -> Image.Image:
    rgb = image.convert("RGB")
    bg = background_color(rgb)
    alpha = Image.new("L", rgb.size)
    source = rgb.load()
    target = alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            pixel = source[x, y]
            distance = max(abs(pixel[index] - bg[index]) for index in range(3))
            target[x, y] = max(0, min(255, round((distance - threshold) * 255 / feather)))
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def trim(image: Image.Image, padding: int = 6) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("Cannot trim a fully transparent layer")
    return image.crop(
        (
            max(0, box[0] - padding),
            max(0, box[1] - padding),
            min(image.width, box[2] + padding),
            min(image.height, box[3] + padding),
        )
    )


def remove_alpha_fragments(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] <= 24 or (x, y) in visited:
                continue
            component: list[tuple[int, int]] = []
            stack = [(x, y)]
            visited.add((x, y))
            while stack:
                current = stack.pop()
                component.append(current)
                cx, cy = current
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                    (cx - 1, cy - 1),
                    (cx + 1, cy - 1),
                    (cx - 1, cy + 1),
                    (cx + 1, cy + 1),
                ):
                    if (
                        0 <= nx < alpha.width
                        and 0 <= ny < alpha.height
                        and pixels[nx, ny] > 24
                        and (nx, ny) not in visited
                    ):
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)
    largest = max((len(component) for component in components), default=0)
    keep = {
        pixel
        for component in components
        if len(component) >= max(64, round(largest * 0.015))
        for pixel in component
    }
    cleaned = alpha.copy()
    cleaned_pixels = cleaned.load()
    for y in range(alpha.height):
        for x in range(alpha.width):
            if pixels[x, y] > 24 and (x, y) not in keep:
                cleaned_pixels[x, y] = 0
    output = image.copy()
    output.putalpha(cleaned)
    return output


def sprite_cell(master: Image.Image, bounds: tuple[int, int]) -> Image.Image:
    left, right = bounds
    return trim(remove_alpha_fragments(keyed_alpha(master.crop((left, 0, right, master.height)))))


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def fit_miniature_height(image: Image.Image, height: int) -> Image.Image:
    """Downsample once from an approved master and restore bounded edge clarity."""
    resized = fit_height(image, height)
    alpha = resized.getchannel("A")
    sharpened = resized.filter(ImageFilter.UnsharpMask(radius=0.6, percent=75, threshold=3))
    sharpened.putalpha(alpha)
    return sharpened


def text_width(text: str, scale: int) -> int:
    return sum((len(FONT[character][0]) + 1) * scale for character in text) - scale


def pixel_text(
    image: Image.Image,
    position: tuple[int, int],
    text: str,
    scale: int = 2,
    color: tuple[int, int, int, int] = PALETTE["gold"],
) -> None:
    draw = ImageDraw.Draw(image)
    x, y = position
    for character in text:
        glyph = FONT[character]
        for row, bits in enumerate(glyph):
            for column, bit in enumerate(bits):
                if bit == "1":
                    draw.rectangle(
                        (
                            x + column * scale,
                            y + row * scale,
                            x + (column + 1) * scale - 1,
                            y + (row + 1) * scale - 1,
                        ),
                        fill=color,
                    )
        x += (len(glyph[0]) + 1) * scale


def panel(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = box
    chamfer = 10
    outer = [
        (x0 + chamfer, y0),
        (x1 - chamfer, y0),
        (x1, y0 + chamfer),
        (x1, y1 - chamfer),
        (x1 - chamfer, y1),
        (x0 + chamfer, y1),
        (x0, y1 - chamfer),
        (x0, y0 + chamfer),
    ]
    draw.polygon(outer, fill=PALETTE["iron"], outline=PALETTE["copper"], width=3)
    draw.line(outer + [outer[0]], fill=PALETTE["gold"], width=1)
    draw.rectangle(
        (x0 + 7, y0 + 7, x1 - 7, y1 - 7),
        fill=(19, 28, 38, 242),
        outline=PALETTE["stone_light"],
        width=2,
    )
    draw.line(
        (x0 + 14, y0 + 11, x1 - 14, y0 + 11),
        fill=(111, 122, 126, 180),
        width=2,
    )
    for x, y in (
        (x0 + 11, y0 + 11),
        (x1 - 11, y0 + 11),
        (x0 + 11, y1 - 11),
        (x1 - 11, y1 - 11),
    ):
        draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=PALETTE["gold"])


def hud_label(box: tuple[int, int, int, int], label: str) -> Image.Image:
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    width = text_width(label, 2)
    pixel_text(layer, (x0 + (x1 - x0 - width) // 2, y0 + 13), label, 2)
    return layer.crop(box)


def build_hud() -> tuple[Image.Image, Image.Image, dict[str, Image.Image]]:
    top_boxes = {
        "fortress-status": (18, 10, 258, 60),
        "wave-status": (526, 10, 754, 60),
        "ore-status": (1022, 10, 1262, 60),
    }
    top = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    for box in top_boxes.values():
        panel(top, box)

    bottom_boxes = {
        "warden-nameplate": (18, 604, 226, 704),
        "health-status": (238, 604, 484, 704),
        "target-policy-control": (496, 604, 746, 704),
        "shield-slam-control": (758, 604, 1036, 704),
        "pause-control": (1048, 604, 1262, 704),
    }
    bottom = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    for box in bottom_boxes.values():
        panel(bottom, box)

    parts = {
        "top-hud-frame": top,
        "bottom-hud-frame": bottom,
        "fortress-status": hud_label(top_boxes["fortress-status"], "FORT 18/20"),
        "wave-status": hud_label(top_boxes["wave-status"], "WAVE 7"),
        "ore-status": hud_label(top_boxes["ore-status"], "ORE 840"),
        "warden-nameplate": hud_label(bottom_boxes["warden-nameplate"], "WARDEN"),
        "health-status": hud_label(bottom_boxes["health-status"], "HEALTH"),
        "target-policy-control": hud_label(
            bottom_boxes["target-policy-control"], "TARGET NEAREST"
        ),
        "shield-slam-control": hud_label(
            bottom_boxes["shield-slam-control"], "SHIELD SLAM"
        ),
        "pause-control": hud_label(bottom_boxes["pause-control"], "PAUSE"),
    }
    health = ImageDraw.Draw(parts["health-status"])
    health.polygon(
        [(20, 54), (224, 54), (232, 66), (224, 80), (20, 80), (12, 66)],
        fill=PALETTE["iron"],
        outline=PALETTE["copper"],
    )
    health.polygon(
        [(25, 60), (197, 60), (204, 66), (197, 74), (25, 74), (20, 66)],
        fill=(137, 36, 31, 255),
    )
    for x in range(32, 195, 28):
        health.line((x, 61, x - 6, 73), fill=(203, 71, 44, 170), width=2)
    ability = ImageDraw.Draw(parts["shield-slam-control"])
    ability.polygon(
        [(38, 48), (58, 39), (220, 39), (240, 48), (240, 82), (220, 91), (58, 91), (38, 82)],
        fill=(22, 38, 49, 245),
        outline=PALETTE["copper"],
        width=2,
    )
    ability.polygon(
        [(72, 76), (82, 54), (96, 48), (110, 54), (120, 76), (96, 86)],
        fill=(42, 91, 108, 255),
        outline=PALETTE["gold"],
        width=2,
    )
    ability.line((78, 66, 114, 66), fill=(107, 195, 207, 255), width=3)
    pixel_text(parts["shield-slam-control"], (132, 57), "POWER", 2, (139, 206, 209, 255))
    target = ImageDraw.Draw(parts["target-policy-control"])
    target.polygon(
        [(22, 58), (34, 46), (46, 58), (34, 70)],
        outline=PALETTE["gold"],
        width=3,
    )
    target.line((34, 48, 34, 68), fill=PALETTE["copper"], width=2)
    pause = ImageDraw.Draw(parts["pause-control"])
    pause.polygon(
        [(62, 42), (114, 42), (126, 54), (126, 84), (114, 94), (62, 94), (50, 84), (50, 54)],
        fill=(25, 37, 46, 255),
        outline=PALETTE["copper"],
        width=2,
    )
    pause.rectangle((76, 55, 84, 81), fill=PALETTE["gold"])
    pause.rectangle((94, 55, 102, 81), fill=PALETTE["gold"])
    return top, bottom, parts


def ring(size: tuple[int, int], color: tuple[int, int, int, int]) -> Image.Image:
    low_size = (size[0] // 2, size[1] // 2)
    image = Image.new("RGBA", low_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    y = low_size[1] // 2
    points = [
        (3, y),
        (12, y - 5),
        (low_size[0] // 2, y - 8),
        (low_size[0] - 13, y - 5),
        (low_size[0] - 4, y),
        (low_size[0] - 13, y + 5),
        (low_size[0] // 2, y + 8),
        (12, y + 5),
        (3, y),
    ]
    for start, end in zip(points, points[1:]):
        draw.line((start, end), fill=color, width=2)
    for x in (10, low_size[0] // 2, low_size[0] - 11):
        draw.rectangle((x - 1, y - 2, x + 1, y + 2), fill=(222, 170, 88, 210))
    return image.resize(size, Image.Resampling.NEAREST)


def shield_impact() -> Image.Image:
    image = Image.new("RGBA", (70, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(
        [(7, 24), (18, 8), (34, 3), (51, 9), (64, 24), (51, 38), (34, 45), (17, 38)],
        outline=(85, 175, 195, 235),
        width=3,
    )
    draw.polygon(
        [(17, 24), (25, 13), (34, 9), (44, 14), (52, 24), (43, 34), (34, 39), (24, 33)],
        outline=(203, 152, 76, 210),
        width=2,
    )
    draw.line((34, 10, 34, 38), fill=(139, 214, 218, 220), width=2)
    draw.line((24, 24, 45, 24), fill=(139, 214, 218, 220), width=2)
    for x, y in ((3, 23), (14, 5), (56, 7), (65, 27), (49, 42)):
        draw.rectangle((x, y, x + 2, y + 2), fill=(222, 170, 88, 210))
    return image.resize((140, 96), Image.Resampling.NEAREST)


def lighting_overlay() -> Image.Image:
    image = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    light = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    draw = ImageDraw.Draw(light)
    draw.ellipse((860, 70, 1300, 390), fill=(194, 85, 23, 65))
    draw.ellipse((30, 330, 520, 760), fill=(195, 99, 32, 48))
    draw.ellipse((445, 220, 910, 650), fill=(172, 104, 43, 32))
    draw.line(
        [(1110, 112), (936, 224), (825, 295), (701, 365), (585, 426), (457, 500), (318, 565), (181, 621)],
        fill=(212, 126, 48, 42),
        width=38,
        joint="curve",
    )
    for x, y in ((1028, 166), (825, 295), (585, 426), (318, 565)):
        draw.ellipse((x - 70, y - 42, x + 70, y + 42), fill=(223, 135, 50, 32))
    return light.filter(ImageFilter.GaussianBlur(42))


def architecture_mask(clean_plate: Image.Image) -> tuple[Image.Image, Image.Image]:
    mask = Image.new("L", FRAME, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(0, 500), (250, 455), (430, 575), (520, 720), (0, 720)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1))
    occluder = clean_plate.copy()
    occluder.putalpha(mask)
    return mask, occluder


def composite(clean: Image.Image, layers: Iterable[tuple[Image.Image, tuple[int, int]]]) -> Image.Image:
    output = clean.copy()
    for layer, position in layers:
        output.alpha_composite(layer, position)
    return output


def isolation_board(images: list[Image.Image], scale: int) -> Image.Image:
    scaled = [
        image.resize(
            (image.width * scale, image.height * scale),
            Image.Resampling.NEAREST,
        )
        for image in images
    ]
    total_width = sum(image.width for image in scaled) + 80 * (len(scaled) - 1)
    board_width = max(1280, total_width + 160)
    board_height = max(720, max(image.height for image in scaled) + 160)
    board = Image.new("RGBA", (board_width, board_height), (7, 13, 22, 255))
    checker = ImageDraw.Draw(board)
    for y in range(0, board_height, 32):
        for x in range(0, board_width, 32):
            if (x // 32 + y // 32) % 2 == 0:
                checker.rectangle((x, y, x + 31, y + 31), fill=(25, 35, 45, 255))
    x = (board_width - total_width) // 2
    for image in scaled:
        board.alpha_composite(image, (x, (board_height - image.height) // 2))
        x += image.width + 80
    return board


def occlusion_board(
    clean: Image.Image, mask: Image.Image, occluder: Image.Image
) -> Image.Image:
    board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    panel_size = (384, 216)
    positions = ((32, 252), (448, 252), (864, 252))
    checker = Image.new("RGBA", panel_size, (18, 27, 36, 255))
    checker_draw = ImageDraw.Draw(checker)
    for y in range(0, panel_size[1], 16):
        for x in range(0, panel_size[0], 16):
            if (x // 16 + y // 16) % 2 == 0:
                checker_draw.rectangle((x, y, x + 15, y + 15), fill=(48, 58, 66, 255))

    alpha_panel = checker.copy()
    alpha_panel.alpha_composite(occluder.resize(panel_size, Image.Resampling.LANCZOS))
    mask_panel = checker.copy()
    colored_mask = Image.new("RGBA", FRAME, (208, 62, 111, 0))
    colored_mask.putalpha(mask)
    mask_panel.alpha_composite(colored_mask.resize(panel_size, Image.Resampling.NEAREST))
    overlap_panel = clean.resize(panel_size, Image.Resampling.LANCZOS)
    overlap_tint = Image.new("RGBA", panel_size, (216, 59, 112, 0))
    overlap_tint.putalpha(
        mask.resize(panel_size, Image.Resampling.NEAREST).point(lambda value: value // 2)
    )
    overlap_panel.alpha_composite(overlap_tint)

    for position, label, panel_image in zip(
        positions, ("ALPHA", "AREA", "OVERLAP"), (alpha_panel, mask_panel, overlap_panel)
    ):
        x, y = position
        ImageDraw.Draw(board).rectangle(
            (x - 3, y - 3, x + panel_size[0] + 2, y + panel_size[1] + 2),
            outline=PALETTE["copper"],
            width=3,
        )
        board.alpha_composite(panel_image, position)
        pixel_text(board, (x + 8, y - 34), label, 3)
    pixel_text(board, (352, 92), "FOREGROUND OCCLUSION", 3)
    return board


def character_scale_study(
    clean: Image.Image,
    lighting: Image.Image,
    warden: Image.Image,
    hostile: Image.Image,
    warden_ring: Image.Image,
    hostile_ring: Image.Image,
) -> Image.Image:
    board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    panel_size = (400, 225)
    for index, (label, scale) in enumerate(
        zip(("SMALL", "GAME SCALE", "LARGE"), (0.8, 1.0, 1.25))
    ):
        scene = clean.copy()
        scene.alpha_composite(lighting)
        scaled_warden = warden.resize(
            (round(warden.width * scale), round(warden.height * scale)),
            Image.Resampling.LANCZOS,
        )
        scaled_hostile = hostile.resize(
            (round(hostile.width * scale), round(hostile.height * scale)),
            Image.Resampling.LANCZOS,
        )
        scaled_warden_ring = warden_ring.resize(
            (round(warden_ring.width * scale), round(warden_ring.height * scale)),
            Image.Resampling.NEAREST,
        )
        scaled_hostile_ring = hostile_ring.resize(
            (round(hostile_ring.width * scale), round(hostile_ring.height * scale)),
            Image.Resampling.NEAREST,
        )
        scene.alpha_composite(
            scaled_warden_ring, (674 - scaled_warden_ring.width // 2, 414)
        )
        scene.alpha_composite(
            scaled_hostile_ring, (802 - scaled_hostile_ring.width // 2, 380)
        )
        scene.alpha_composite(
            scaled_warden, (674 - scaled_warden.width // 2, 434 - scaled_warden.height)
        )
        scene.alpha_composite(
            scaled_hostile, (802 - scaled_hostile.width // 2, 398 - scaled_hostile.height)
        )
        x = 20 + index * 420
        y = 250
        ImageDraw.Draw(board).rectangle(
            (x - 3, y - 3, x + panel_size[0] + 2, y + panel_size[1] + 2),
            outline=PALETTE["gold"] if scale == 1.0 else PALETTE["stone_light"],
            width=3,
        )
        board.alpha_composite(scene.resize(panel_size, Image.Resampling.LANCZOS), (x, y))
        pixel_text(board, (x + 12, y - 34), label, 3)
    pixel_text(board, (397, 92), "CHARACTER SCALE", 3)
    return board


def compose_recipe(
    recipe: dict[str, object], assets: dict[str, Image.Image]
) -> Image.Image:
    layers = recipe["layersBackToFront"]
    if not isinstance(layers, list) or not layers:
        raise ValueError("Reconstruction recipe must contain layers")
    first = layers[0]
    if (
        not isinstance(first, dict)
        or first.get("asset") != "shuttergate-clean-plate-1280x720"
    ):
        raise ValueError("Reconstruction must start with the clean plate")
    output = assets[first["asset"]].copy()
    for index, layer in enumerate(layers[1:], start=1):
        if not isinstance(layer, dict):
            raise ValueError(f"Reconstruction layer {index} must be an object")
        asset_id = layer["asset"]
        position = layer["position"]
        if (
            not isinstance(asset_id, str)
            or asset_id not in assets
            or not isinstance(position, list)
            or len(position) != 2
            or not all(type(value) is int for value in position)
        ):
            raise ValueError(f"Invalid reconstruction layer {index}")
        output.alpha_composite(assets[asset_id], tuple(position))
    return output


def file_record(
    path: Path,
    category: str,
    alpha: str,
    regions: list[str],
    root: Path = ROOT,
) -> dict[str, object]:
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
        mode = image.mode
    return {
        "id": path.stem,
        "path": path.relative_to(root).as_posix(),
        "category": category,
        "dimensions": dimensions,
        "mode": mode,
        "alphaSemantics": alpha,
        "contributesTo": regions,
        "sha256": sha256(path),
    }


def build(output_root: Path = ROOT) -> None:
    package = output_root / PACKAGE.relative_to(ROOT)
    direction = output_root / DIRECTION.relative_to(ROOT)
    exports = package / "exports"
    evidence = output_root / EVIDENCE.relative_to(ROOT)
    metadata = package / "metadata"
    shutil.rmtree(exports, ignore_errors=True)
    shutil.rmtree(evidence, ignore_errors=True)
    clean_master = Image.open(package / "sources" / "shuttergate-clean-plate-master.png")
    clean = cover_16_9(clean_master)
    png(clean, exports / "environment" / "shuttergate-clean-plate-1280x720.png")

    warden_master = Image.open(direction / "sources" / "iron-warden-master.png")
    hostile_master = Image.open(direction / "sources" / "mine-raider-master.png")
    hostile_idle = fit_height(sprite_cell(hostile_master, (0, 353)), 92)
    hostile_attack = fit_height(sprite_cell(hostile_master, (707, 961)), 92)
    hostile_idle = ImageEnhance.Brightness(hostile_idle).enhance(1.3)
    hostile_attack = ImageEnhance.Brightness(hostile_attack).enhance(1.3)
    sprites = {
        "iron-warden-idle": fit_height(sprite_cell(warden_master, (0, 355)), 104),
        "iron-warden-shield-slam": fit_height(
            sprite_cell(warden_master, (708, 1098)), 104
        ),
        "mine-raider-idle": hostile_idle,
        "mine-raider-attack": hostile_attack,
    }
    for name, image in sprites.items():
        png(image, exports / "entities" / f"{name}.png")

    effects = {
        "warden-selection-ring": ring((94, 42), (84, 178, 196, 210)),
        "hostile-faction-ring": ring((78, 36), (184, 79, 47, 210)),
        "shield-slam-impact": shield_impact(),
    }
    for name, image in effects.items():
        png(image, exports / "effects" / f"{name}.png")
    lighting = lighting_overlay()
    png(lighting, exports / "lighting" / "warm-light-overlay.png")

    mask, occluder = architecture_mask(clean)
    png(mask, exports / "occlusion" / "architecture-mask.png")
    png(occluder, exports / "occlusion" / "foreground-occluder.png")

    top_hud, bottom_hud, hud_parts = build_hud()
    for name, image in hud_parts.items():
        png(image, exports / "hud" / f"{name}.png")

    portrait = fit_height(sprite_cell(warden_master, (0, 355)), 78)
    png(portrait, exports / "hud" / "warden-portrait.png")

    assets = {
        "shuttergate-clean-plate-1280x720": clean,
        **sprites,
        **effects,
        "foreground-occluder": occluder,
        "warm-light-overlay": lighting,
        **hud_parts,
        "warden-portrait": portrait,
    }
    recipe = json.loads((metadata / "reconstruction.json").read_text(encoding="utf-8"))
    reconstruction = compose_recipe(recipe, assets)
    no_entity_recipe = {
        **recipe,
        "layersBackToFront": [
            layer
            for layer in recipe["layersBackToFront"]
            if layer["region"] not in {"world-entities", "world-effects"}
            and layer["asset"] != "warden-portrait"
        ],
    }
    no_entities = compose_recipe(no_entity_recipe, assets)
    environment_only = composite(clean, [(occluder, (0, 0)), (lighting, (0, 0))])
    png(reconstruction, evidence / "reconstruction-one-warden-one-hostile.png")
    png(no_entities, evidence / "reconstruction-entities-removed.png")
    png(environment_only, evidence / "environment-and-presentation-lighting.png")
    shutil.copy2(exports / "environment" / "shuttergate-clean-plate-1280x720.png", evidence / "clean-plate.png")

    approved = Image.open(
        direction / "exports" / "shuttergate-keyframe-1280x720.png"
    ).convert("RGBA")
    comparison = Image.new("RGBA", (2560, 720), (0, 0, 0, 255))
    comparison.alpha_composite(approved, (0, 0))
    comparison.alpha_composite(reconstruction, (1280, 0))
    png(comparison, evidence / "approved-keyframe-vs-reconstruction.png")

    png(
        isolation_board(
            [sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 1
        ),
        evidence / "iron-warden-alpha-states-native.png",
    )
    png(
        isolation_board(
            [sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 4
        ),
        evidence / "iron-warden-alpha-states-4x.png",
    )
    png(
        isolation_board(
            [sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 1
        ),
        evidence / "mine-raider-alpha-states-native.png",
    )
    png(
        isolation_board(
            [sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 4
        ),
        evidence / "mine-raider-alpha-states-4x.png",
    )
    png(
        isolation_board(list(effects.values()), 2),
        evidence / "selection-and-combat-effect-isolation.png",
    )

    hud_board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    for layer in recipe["layersBackToFront"]:
        if layer["region"] == "screen-space-hud":
            hud_board.alpha_composite(assets[layer["asset"]], tuple(layer["position"]))
    png(hud_board, evidence / "hud-control-isolation.png")
    png(
        occlusion_board(clean, mask, occluder),
        evidence / "foreground-occlusion-isolation.png",
    )
    png(lighting, evidence / "lighting-alpha-isolation.png")
    png(
        character_scale_study(
            clean,
            lighting,
            sprites["iron-warden-shield-slam"],
            sprites["mine-raider-attack"],
            effects["warden-selection-ring"],
            effects["hostile-faction-ring"],
        ),
        evidence / "character-scale-study.png",
    )

    tracked: list[tuple[Path, str, str, list[str]]] = []
    tracked.append(
        (
            exports / "environment" / "shuttergate-clean-plate-1280x720.png",
            "environment",
            "opaque-clean-plate",
            ["world"],
        )
    )
    for path in sorted((exports / "entities").glob("*.png")):
        tracked.append((path, "entity", "straight-alpha", ["world-entities"]))
    for path in sorted((exports / "effects").glob("*.png")):
        tracked.append((path, "effect", "straight-alpha", ["world-effects"]))
    tracked.append((exports / "lighting" / "warm-light-overlay.png", "lighting", "straight-alpha-no-entities", ["world-lighting"]))
    tracked.append((exports / "occlusion" / "architecture-mask.png", "occlusion-mask", "grayscale-mask", ["foreground-occlusion"]))
    tracked.append((exports / "occlusion" / "foreground-occluder.png", "foreground", "straight-alpha-environment-only", ["foreground-occlusion"]))
    for path in sorted((exports / "hud").glob("*.png")):
        tracked.append((path, "hud", "straight-alpha", ["screen-space-hud"]))

    manifest = {
        "schemaVersion": 1,
        "package": "dwarven-depths-issue-286-production-scene",
        "logicalFrame": [640, 360],
        "reviewFrame": list(FRAME),
        "entityLayerCounts": {"iron-warden": 1, "mine-raider": 1},
        "contractDigests": {
            name: sha256(metadata / name)
            for name in ("provenance.json", "reconstruction.json", "scene-contract.json")
        },
        "files": [
            file_record(path, category, alpha, regions, output_root)
            for path, category, alpha, regions in tracked
        ],
        "evidence": [
            file_record(path, "evidence", "review-only", ["review"], output_root)
            for path in sorted(evidence.glob("*.png"))
        ],
    }
    metadata.mkdir(parents=True, exist_ok=True)
    manifest_path = metadata / "layer-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    subprocess.run(
        ["pnpm", "exec", "biome", "format", "--write", str(manifest_path)],
        check=True,
        cwd=ROOT,
    )


def strict_keys(value: dict[str, object], expected: set[str], context: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ValueError(f"{context} keys differ: expected {sorted(expected)}, got {sorted(actual)}")


def exact_json(actual: object, expected: object) -> bool:
    return json.dumps(actual, sort_keys=True, separators=(",", ":")) == json.dumps(
        expected, sort_keys=True, separators=(",", ":")
    )


def require_exact_json(actual: object, expected: object, context: str) -> None:
    if not exact_json(actual, expected):
        raise ValueError(f"{context} does not match the canonical contract")


def validate_point(value: object, context: str) -> tuple[int, int]:
    if (
        not isinstance(value, list)
        or len(value) != 2
        or not all(type(coordinate) is int for coordinate in value)
        or not (0 <= value[0] < FRAME[0] and 0 <= value[1] < FRAME[1])
    ):
        raise ValueError(f"{context} must be an in-frame integer point")
    return value[0], value[1]


def validate_rectangle(value: object, context: str) -> tuple[int, int, int, int]:
    if (
        not isinstance(value, list)
        or len(value) != 4
        or not all(type(coordinate) is int for coordinate in value)
        or not (0 <= value[0] < value[2] <= FRAME[0])
        or not (0 <= value[1] < value[3] <= FRAME[1])
    ):
        raise ValueError(f"{context} must be an in-frame integer rectangle")
    return value[0], value[1], value[2], value[3]


def require_same_pixels(expected: Image.Image, actual_path: Path, context: str) -> None:
    with Image.open(actual_path) as actual:
        expected_rgba = expected.convert("RGBA")
        actual_rgba = actual.convert("RGBA")
        if (
            actual_rgba.size != expected_rgba.size
            or actual_rgba.tobytes() != expected_rgba.tobytes()
        ):
            raise ValueError(f"{context} pixels do not match their declared layers")


def expected_record_semantics(path: str) -> tuple[str, str, list[str]]:
    if path.startswith("docs/visual-evidence/production-scene/"):
        return "evidence", "review-only", ["review"]
    prefix = "assets/game-art/production-scene/exports/"
    if not path.startswith(prefix):
        raise ValueError(f"Manifest path is outside the production package: {path}")
    relative = path.removeprefix(prefix)
    if relative == "environment/shuttergate-clean-plate-1280x720.png":
        return "environment", "opaque-clean-plate", ["world"]
    if relative.startswith("entities/"):
        return "entity", "straight-alpha", ["world-entities"]
    if relative.startswith("effects/"):
        return "effect", "straight-alpha", ["world-effects"]
    if relative == "lighting/warm-light-overlay.png":
        return "lighting", "straight-alpha-no-entities", ["world-lighting"]
    if relative == "occlusion/architecture-mask.png":
        return "occlusion-mask", "grayscale-mask", ["foreground-occlusion"]
    if relative == "occlusion/foreground-occluder.png":
        return "foreground", "straight-alpha-environment-only", ["foreground-occlusion"]
    if relative.startswith("hud/"):
        return "hud", "straight-alpha", ["screen-space-hud"]
    raise ValueError(f"Manifest path has no canonical asset domain: {path}")


def verify(root: Path = ROOT) -> None:
    package = root / PACKAGE.relative_to(ROOT)
    manifest_path = package / "metadata" / "layer-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    strict_keys(
        manifest,
        {
            "schemaVersion",
            "package",
            "logicalFrame",
            "reviewFrame",
            "entityLayerCounts",
            "contractDigests",
            "files",
            "evidence",
        },
        "manifest",
    )
    require_exact_json(manifest["schemaVersion"], 1, "manifest.schemaVersion")
    require_exact_json(
        manifest["package"],
        "dwarven-depths-issue-286-production-scene",
        "manifest.package",
    )
    require_exact_json(manifest["logicalFrame"], [640, 360], "manifest.logicalFrame")
    require_exact_json(manifest["reviewFrame"], [1280, 720], "manifest.reviewFrame")
    require_exact_json(
        manifest["entityLayerCounts"],
        {"iron-warden": 1, "mine-raider": 1},
        "manifest.entityLayerCounts",
    )
    expected_contract_digests = {
        name: sha256(package / "metadata" / name)
        for name in ("provenance.json", "reconstruction.json", "scene-contract.json")
    }
    if manifest["contractDigests"] != expected_contract_digests:
        raise ValueError("Scene metadata digest mismatch")
    records = [*manifest["files"], *manifest["evidence"]]
    paths: set[str] = set()
    asset_ids: set[str] = set()
    records_by_id: dict[str, dict[str, object]] = {}
    for index, record in enumerate(records):
        strict_keys(record, {"id", "path", "category", "dimensions", "mode", "alphaSemantics", "contributesTo", "sha256"}, f"file[{index}]")
        relative_path = Path(record["path"])
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"Manifest path is not canonical: {record['path']}")
        path = root / record["path"]
        if record["path"] in paths or not path.is_file():
            raise ValueError(f"Missing or duplicate manifest path: {record['path']}")
        paths.add(record["path"])
        expected_category, expected_alpha, expected_regions = expected_record_semantics(
            record["path"]
        )
        if (
            record["category"] != expected_category
            or record["alphaSemantics"] != expected_alpha
            or record["contributesTo"] != expected_regions
        ):
            raise ValueError(f"Manifest semantics are not canonical: {record['path']}")
        if record["category"] != "evidence":
            if record["id"] in asset_ids:
                raise ValueError(f"Duplicate stable asset id: {record['id']}")
            asset_ids.add(record["id"])
            records_by_id[record["id"]] = record
        if sha256(path) != record["sha256"]:
            raise ValueError(f"Digest mismatch: {record['path']}")
        with Image.open(path) as image:
            if [image.width, image.height] != record["dimensions"] or image.mode != record["mode"]:
                raise ValueError(f"Image metadata mismatch: {record['path']}")
            if record["category"] in {"entity", "effect", "hud", "lighting", "foreground"}:
                if image.mode != "RGBA":
                    raise ValueError(f"Layer lacks usable alpha: {record['path']}")
                alpha_histogram = image.getchannel("A").histogram()
                pixel_count = image.width * image.height
                transparent_fraction = alpha_histogram[0] / pixel_count
                visible_fraction = sum(alpha_histogram[1:]) / pixel_count
                if transparent_fraction < 0.1 or visible_fraction < 0.01:
                    raise ValueError(f"Layer lacks usable alpha: {record['path']}")
            if record["category"] == "occlusion-mask" and (
                image.mode != "L" or image.getextrema()[0] == image.getextrema()[1]
            ):
                raise ValueError(f"Occlusion mask is not usable grayscale: {record['path']}")
    export_prefix = "assets/game-art/production-scene/exports/"
    evidence_prefix = "docs/visual-evidence/production-scene/"
    actual_export_paths = {
        path.relative_to(root).as_posix()
        for path in (package / "exports").rglob("*")
        if path.is_file()
    }
    actual_evidence_paths = {
        path.relative_to(root).as_posix()
        for path in (root / evidence_prefix).rglob("*")
        if path.is_file()
    }
    if actual_export_paths != {path for path in paths if path.startswith(export_prefix)}:
        raise ValueError("Export directory contains missing or unmanifested assets")
    if actual_evidence_paths != {path for path in paths if path.startswith(evidence_prefix)}:
        raise ValueError("Evidence directory contains missing or unmanifested proofs")
    environment = root / "assets/game-art/production-scene/exports/environment/shuttergate-clean-plate-1280x720.png"
    with Image.open(environment) as image:
        if image.size != FRAME or image.mode != "RGBA" or image.getchannel("A").getextrema() != (255, 255):
            raise ValueError("Clean plate must be a complete opaque 1280x720 environment")

    scene = json.loads((package / "metadata" / "scene-contract.json").read_text(encoding="utf-8"))
    strict_keys(
        scene,
        {
            "schemaVersion",
            "package",
            "authority",
            "coordinateSpace",
            "safeAreas",
            "camera",
            "route",
            "entityAnchors",
            "occlusion",
            "hudRegions",
            "cropPolicy",
        },
        "scene-contract",
    )
    require_exact_json(scene["schemaVersion"], 1, "scene-contract.schemaVersion")
    require_exact_json(
        scene["package"],
        "dwarven-depths-issue-286-production-scene",
        "scene-contract.package",
    )
    require_exact_json(scene["authority"], "presentation-only", "scene-contract.authority")
    strict_keys(
        scene["route"],
        {"polyline", "entranceAnchor", "gateAnchor", "chokepointAnchors", "railCrossingAnchor"},
        "scene-contract.route",
    )
    require_exact_json(
        scene["route"],
        {
            "polyline": [
                [1110, 112],
                [1028, 166],
                [936, 224],
                [825, 295],
                [701, 365],
                [585, 426],
                [457, 500],
                [318, 565],
                [181, 621],
            ],
            "entranceAnchor": [1110, 112],
            "gateAnchor": [181, 621],
            "chokepointAnchors": [[825, 295], [585, 426]],
            "railCrossingAnchor": [701, 365],
        },
        "scene-contract.route",
    )
    if len(scene["route"]["polyline"]) < 2 or len(scene["route"]["chokepointAnchors"]) != 2:
        raise ValueError("Scene route must bind entrance, gate, and two chokepoints")
    strict_keys(
        scene["coordinateSpace"],
        {"origin", "logicalFrame", "reviewFrame", "logicalTexelScale"},
        "scene-contract.coordinateSpace",
    )
    strict_keys(
        scene["safeAreas"],
        {"world", "desktopHudSafe", "entitySafe"},
        "scene-contract.safeAreas",
    )
    strict_keys(
        scene["camera"],
        {"projection", "viewDirection", "fixedReviewFrame"},
        "scene-contract.camera",
    )
    require_exact_json(
        scene["coordinateSpace"],
        {
            "origin": "top-left",
            "logicalFrame": [640, 360],
            "reviewFrame": [1280, 720],
            "logicalTexelScale": 2,
        },
        "scene-contract.coordinateSpace",
    )
    require_exact_json(
        scene["camera"],
        {
            "projection": "elevated-orthographic-2.5d",
            "viewDirection": "upper-right-background-to-lower-left-foreground",
            "fixedReviewFrame": True,
        },
        "scene-contract.camera",
    )
    strict_keys(
        scene["entityAnchors"],
        {"ironWardenTruthScreen", "mineRaiderTruthScreen"},
        "scene-contract.entityAnchors",
    )
    for name, anchor in scene["entityAnchors"].items():
        strict_keys(
            anchor,
            {"position", "depthSortY"},
            f"scene-contract.entityAnchors.{name}",
        )
        validate_point(anchor["position"], f"scene-contract.entityAnchors.{name}.position")
        if (
            type(anchor["depthSortY"]) is not int
            or not 0 <= anchor["depthSortY"] < FRAME[1]
        ):
            raise ValueError(f"scene-contract.entityAnchors.{name}.depthSortY is invalid")
    strict_keys(
        scene["occlusion"],
        {"mask", "foreground", "depthOrder"},
        "scene-contract.occlusion",
    )
    require_exact_json(
        scene["occlusion"],
        {
            "mask": "architecture-mask",
            "foreground": "foreground-occluder",
            "depthOrder": [
                "environment",
                "rings",
                "entities",
                "combat-effects",
                "foreground-occluder",
                "lighting",
                "hud",
            ],
        },
        "scene-contract.occlusion",
    )
    strict_keys(
        scene["hudRegions"],
        {
            "top",
            "bottom",
            "fortressStatus",
            "waveStatus",
            "oreStatus",
            "wardenNameplate",
            "portrait",
            "health",
            "targetPolicy",
            "shieldSlam",
            "pause",
        },
        "scene-contract.hudRegions",
    )
    require_exact_json(
        scene["hudRegions"],
        {
            "top": [0, 0, 1280, 72],
            "bottom": [0, 590, 1280, 720],
            "fortressStatus": [18, 10, 258, 60],
            "waveStatus": [526, 10, 754, 60],
            "oreStatus": [1022, 10, 1262, 60],
            "wardenNameplate": [18, 604, 226, 704],
            "portrait": [18, 604, 226, 704],
            "health": [238, 604, 484, 704],
            "targetPolicy": [496, 604, 746, 704],
            "shieldSlam": [758, 604, 1036, 704],
            "pause": [1048, 604, 1262, 704],
        },
        "scene-contract.hudRegions",
    )
    strict_keys(
        scene["cropPolicy"],
        {"desktop", "laptop", "mobile", "status"},
        "scene-contract.cropPolicy",
    )
    require_exact_json(
        scene["cropPolicy"],
        {
            "desktop": "show-full-16:9-frame",
            "laptop": "fit-full-frame-before-cropping; preserve both HUD bands and entrance/gate anchors",
            "mobile": "later-work-may-letterbox-or-use-authored-camera-crop; never crop both entrance and gate; HUD must reflow rather than scale below legibility",
            "status": "metadata-only-for-later-responsive-work",
        },
        "scene-contract.cropPolicy",
    )
    if (
        scene["coordinateSpace"]["reviewFrame"] != [1280, 720]
        or scene["coordinateSpace"]["logicalFrame"] != [640, 360]
        or scene["safeAreas"]["world"] != [0, 0, 1280, 720]
    ):
        raise ValueError("Scene geometry must bind the declared logical and review frames")
    route_points = [
        validate_point(point, f"scene-contract.route.polyline[{index}]")
        for index, point in enumerate(scene["route"]["polyline"])
    ]
    entrance = validate_point(
        scene["route"]["entranceAnchor"], "scene-contract.route.entranceAnchor"
    )
    gate = validate_point(scene["route"]["gateAnchor"], "scene-contract.route.gateAnchor")
    chokepoints = [
        validate_point(point, f"scene-contract.route.chokepointAnchors[{index}]")
        for index, point in enumerate(scene["route"]["chokepointAnchors"])
    ]
    validate_point(
        scene["route"]["railCrossingAnchor"],
        "scene-contract.route.railCrossingAnchor",
    )
    if (
        entrance != route_points[0]
        or gate != route_points[-1]
        or any(point not in route_points for point in chokepoints)
    ):
        raise ValueError("Route anchors must bind canonical route points")
    for name, rectangle in scene["safeAreas"].items():
        validate_rectangle(rectangle, f"scene-contract.safeAreas.{name}")
    for name, rectangle in scene["hudRegions"].items():
        validate_rectangle(rectangle, f"scene-contract.hudRegions.{name}")
    entity_safe = validate_rectangle(
        scene["safeAreas"]["entitySafe"], "scene-contract.safeAreas.entitySafe"
    )
    for name, anchor in scene["entityAnchors"].items():
        x, y = validate_point(
            anchor["position"], f"scene-contract.entityAnchors.{name}.position"
        )
        if not (entity_safe[0] <= x < entity_safe[2] and entity_safe[1] <= y < entity_safe[3]):
            raise ValueError(f"scene-contract.entityAnchors.{name} is outside entitySafe")

    reconstruction = json.loads(
        (package / "metadata" / "reconstruction.json").read_text(encoding="utf-8")
    )
    strict_keys(
        reconstruction,
        {"schemaVersion", "frame", "output", "entityCounts", "layersBackToFront", "isolationProofs"},
        "reconstruction",
    )
    require_exact_json(reconstruction["schemaVersion"], 1, "reconstruction.schemaVersion")
    require_exact_json(reconstruction["frame"], [1280, 720], "reconstruction.frame")
    require_exact_json(
        reconstruction["entityCounts"],
        {"iron-warden": 1, "mine-raider": 1},
        "reconstruction.entityCounts",
    )
    strict_keys(
        reconstruction["isolationProofs"],
        {"entitiesRemoved", "environmentOnly", "hudControls", "foreground", "lighting"},
        "reconstruction.isolationProofs",
    )
    recipe_ids = []
    for index, layer in enumerate(reconstruction["layersBackToFront"]):
        strict_keys(layer, {"asset", "position", "region"}, f"reconstruction.layer[{index}]")
        if layer["asset"] not in asset_ids:
            raise ValueError(f"Reconstruction references unknown asset: {layer['asset']}")
        if (
            not isinstance(layer["position"], list)
            or len(layer["position"]) != 2
            or not all(type(value) is int for value in layer["position"])
            or layer["region"] not in records_by_id[layer["asset"]]["contributesTo"]
        ):
            raise ValueError(f"Invalid position or region in reconstruction layer {index}")
        recipe_ids.append(layer["asset"])
    expected_recipe_ids = [
        "shuttergate-clean-plate-1280x720",
        "warden-selection-ring",
        "hostile-faction-ring",
        "iron-warden-shield-slam",
        "mine-raider-attack",
        "shield-slam-impact",
        "foreground-occluder",
        "warm-light-overlay",
        "top-hud-frame",
        "fortress-status",
        "wave-status",
        "ore-status",
        "bottom-hud-frame",
        "warden-nameplate",
        "health-status",
        "target-policy-control",
        "shield-slam-control",
        "pause-control",
        "warden-portrait",
    ]
    if recipe_ids != expected_recipe_ids:
        raise ValueError("Reconstruction recipe layers are not canonical")
    expected_positions = {
        "shuttergate-clean-plate-1280x720": [0, 0],
        "warden-selection-ring": [627, 414],
        "hostile-faction-ring": [763, 380],
        "iron-warden-shield-slam": scene["entityAnchors"]["ironWardenTruthScreen"]["position"],
        "mine-raider-attack": scene["entityAnchors"]["mineRaiderTruthScreen"]["position"],
        "shield-slam-impact": [688, 322],
        "foreground-occluder": [0, 0],
        "warm-light-overlay": [0, 0],
        "top-hud-frame": [0, 0],
        "fortress-status": scene["hudRegions"]["fortressStatus"][:2],
        "wave-status": scene["hudRegions"]["waveStatus"][:2],
        "ore-status": scene["hudRegions"]["oreStatus"][:2],
        "bottom-hud-frame": [0, 0],
        "warden-nameplate": scene["hudRegions"]["wardenNameplate"][:2],
        "health-status": scene["hudRegions"]["health"][:2],
        "target-policy-control": scene["hudRegions"]["targetPolicy"][:2],
        "shield-slam-control": scene["hudRegions"]["shieldSlam"][:2],
        "pause-control": scene["hudRegions"]["pause"][:2],
        "warden-portrait": [82, 622],
    }
    if any(
        layer["position"] != expected_positions[layer["asset"]]
        for layer in reconstruction["layersBackToFront"]
    ):
        raise ValueError("Reconstruction positions do not bind canonical scene anchors")

    asset_images: dict[str, Image.Image] = {}
    for record in manifest["files"]:
        if record["id"] == "architecture-mask":
            continue
        asset_images[record["id"]] = Image.open(root / record["path"]).convert("RGBA")
    expected_proof_paths = {
        "entitiesRemoved": "docs/visual-evidence/production-scene/reconstruction-entities-removed.png",
        "environmentOnly": "docs/visual-evidence/production-scene/clean-plate.png",
        "hudControls": "docs/visual-evidence/production-scene/hud-control-isolation.png",
        "foreground": "docs/visual-evidence/production-scene/foreground-occlusion-isolation.png",
        "lighting": "docs/visual-evidence/production-scene/lighting-alpha-isolation.png",
    }
    if reconstruction["output"] != "docs/visual-evidence/production-scene/reconstruction-one-warden-one-hostile.png":
        raise ValueError("Reconstruction output path is not canonical")
    if reconstruction["isolationProofs"] != expected_proof_paths:
        raise ValueError("Isolation proof paths are not canonical")
    expected_reconstruction = compose_recipe(reconstruction, asset_images)
    output_path = root / reconstruction["output"]
    require_same_pixels(expected_reconstruction, output_path, "Reconstruction")

    no_entity_recipe = {
        **reconstruction,
        "layersBackToFront": [
            layer
            for layer in reconstruction["layersBackToFront"]
            if layer["region"] not in {"world-entities", "world-effects"}
            and layer["asset"] != "warden-portrait"
        ],
    }
    require_same_pixels(
        compose_recipe(no_entity_recipe, asset_images),
        root / expected_proof_paths["entitiesRemoved"],
        "Entity-removal proof",
    )
    require_same_pixels(
        asset_images["shuttergate-clean-plate-1280x720"],
        root / expected_proof_paths["environmentOnly"],
        "Environment-only proof",
    )
    architecture_mask_image = Image.open(
        package / "exports" / "occlusion" / "architecture-mask.png"
    ).convert("L")
    require_same_pixels(
        occlusion_board(
            asset_images["shuttergate-clean-plate-1280x720"],
            architecture_mask_image,
            asset_images["foreground-occluder"],
        ),
        root / expected_proof_paths["foreground"],
        "Foreground-isolation proof",
    )
    require_same_pixels(
        asset_images["warm-light-overlay"],
        root / expected_proof_paths["lighting"],
        "Lighting-isolation proof",
    )
    hud_isolation = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    for layer in reconstruction["layersBackToFront"]:
        if layer["region"] == "screen-space-hud":
            hud_isolation.alpha_composite(
                asset_images[layer["asset"]], tuple(layer["position"])
            )
    require_same_pixels(
        hud_isolation,
        root / expected_proof_paths["hudControls"],
        "HUD-isolation proof",
    )
    evidence_root = root / "docs/visual-evidence/production-scene"
    require_same_pixels(
        composite(
            asset_images["shuttergate-clean-plate-1280x720"],
            [
                (asset_images["foreground-occluder"], (0, 0)),
                (asset_images["warm-light-overlay"], (0, 0)),
            ],
        ),
        evidence_root / "environment-and-presentation-lighting.png",
        "Environment-and-lighting proof",
    )
    require_same_pixels(
        isolation_board(
            [
                asset_images["iron-warden-idle"],
                asset_images["iron-warden-shield-slam"],
            ],
            1,
        ),
        evidence_root / "iron-warden-alpha-states-native.png",
        "Native Warden alpha proof",
    )
    require_same_pixels(
        isolation_board(
            [
                asset_images["iron-warden-idle"],
                asset_images["iron-warden-shield-slam"],
            ],
            4,
        ),
        evidence_root / "iron-warden-alpha-states-4x.png",
        "4x Warden alpha proof",
    )
    require_same_pixels(
        isolation_board(
            [asset_images["mine-raider-idle"], asset_images["mine-raider-attack"]],
            1,
        ),
        evidence_root / "mine-raider-alpha-states-native.png",
        "Native mine-raider alpha proof",
    )
    require_same_pixels(
        isolation_board(
            [asset_images["mine-raider-idle"], asset_images["mine-raider-attack"]],
            4,
        ),
        evidence_root / "mine-raider-alpha-states-4x.png",
        "4x mine-raider alpha proof",
    )
    require_same_pixels(
        isolation_board(
            [
                asset_images["warden-selection-ring"],
                asset_images["hostile-faction-ring"],
                asset_images["shield-slam-impact"],
            ],
            2,
        ),
        evidence_root / "selection-and-combat-effect-isolation.png",
        "Effect-isolation proof",
    )
    require_same_pixels(
        character_scale_study(
            asset_images["shuttergate-clean-plate-1280x720"],
            asset_images["warm-light-overlay"],
            asset_images["iron-warden-shield-slam"],
            asset_images["mine-raider-attack"],
            asset_images["warden-selection-ring"],
            asset_images["hostile-faction-ring"],
        ),
        evidence_root / "character-scale-study.png",
        "Character-scale study",
    )
    approved = Image.open(
        root
        / "assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png"
    ).convert("RGBA")
    comparison = Image.new("RGBA", (2560, 720), (0, 0, 0, 255))
    comparison.alpha_composite(approved, (0, 0))
    comparison.alpha_composite(expected_reconstruction, (1280, 0))
    require_same_pixels(
        comparison,
        evidence_root / "approved-keyframe-vs-reconstruction.png",
        "Approved-keyframe comparison",
    )

    provenance = json.loads((package / "metadata" / "provenance.json").read_text(encoding="utf-8"))
    strict_keys(
        provenance,
        {"schemaVersion", "package", "license", "cleanPlate", "derivedLayers", "conceptBoundary"},
        "provenance",
    )
    strict_keys(
        provenance["license"],
        {"identifier", "path", "copyright"},
        "provenance.license",
    )
    strict_keys(
        provenance["cleanPlate"],
        {"path", "sha256", "generator", "reference", "referenceUse"},
        "provenance.cleanPlate",
    )
    require_exact_json(
        provenance["cleanPlate"]["path"],
        "assets/game-art/production-scene/sources/shuttergate-clean-plate-master.png",
        "provenance.cleanPlate.path",
    )
    require_exact_json(
        provenance["cleanPlate"]["sha256"],
        "724159cedd1ad5a53e8954a8990093da01b093348d247fd8cb04702f8ad88117",
        "provenance.cleanPlate.sha256",
    )
    require_exact_json(
        provenance["cleanPlate"]["reference"],
        "assets/game-art/visual-direction/sources/keyframe-master.png",
        "provenance.cleanPlate.reference",
    )
    strict_keys(
        provenance["cleanPlate"]["generator"],
        {"provider", "model", "quality", "aspectRatio", "inputImageCount"},
        "provenance.cleanPlate.generator",
    )
    strict_keys(
        provenance["derivedLayers"],
        {"characterSource", "method", "effectsHudMasks", "externalAssets"},
        "provenance.derivedLayers",
    )
    strict_keys(
        provenance["conceptBoundary"],
        {"path", "productionPixelReuse", "tracing", "backgroundUse"},
        "provenance.conceptBoundary",
    )
    require_exact_json(provenance["schemaVersion"], 1, "provenance.schemaVersion")
    require_exact_json(
        provenance["package"],
        "dwarven-depths-issue-286-production-scene",
        "provenance.package",
    )
    require_exact_json(
        provenance["license"],
        {
            "identifier": "MIT",
            "path": "LICENSE",
            "copyright": "Copyright (c) 2026 Will Palmer",
        },
        "provenance.license",
    )
    require_exact_json(
        provenance["cleanPlate"]["generator"],
        {
            "provider": "openai-codex",
            "model": "gpt-image-2-medium",
            "quality": "medium",
            "aspectRatio": "landscape",
            "inputImageCount": 1,
        },
        "provenance.cleanPlate.generator",
    )
    require_exact_json(
        provenance["conceptBoundary"],
        {
            "path": "assets/concept-art/dwarven-depths-gameplay-mockup.png",
            "productionPixelReuse": False,
            "tracing": False,
            "backgroundUse": False,
        },
        "provenance.conceptBoundary",
    )
    require_exact_json(
        provenance["derivedLayers"]["externalAssets"],
        [],
        "provenance.derivedLayers.externalAssets",
    )
    clean_source = root / provenance["cleanPlate"]["path"]
    if sha256(clean_source) != provenance["cleanPlate"]["sha256"]:
        raise ValueError("Clean-plate source digest does not match provenance")
    if any(
        provenance["conceptBoundary"][key]
        for key in ("productionPixelReuse", "tracing", "backgroundUse")
    ):
        raise ValueError("Concept raster may not contribute production pixels")


def reproducibility_check() -> None:
    with tempfile.TemporaryDirectory(prefix="dd-production-scene-") as directory:
        temp_root = Path(directory)
        temp_package = temp_root / PACKAGE.relative_to(ROOT)
        shutil.copytree(SOURCES, temp_package / "sources")
        temp_direction = temp_root / DIRECTION.relative_to(ROOT)
        (temp_direction / "sources").mkdir(parents=True)
        (temp_direction / "exports").mkdir(parents=True)
        for name in ("iron-warden-master.png", "mine-raider-master.png"):
            shutil.copy2(
                DIRECTION / "sources" / name, temp_direction / "sources" / name
            )
        shutil.copy2(
            DIRECTION / "exports" / "shuttergate-keyframe-1280x720.png",
            temp_direction / "exports" / "shuttergate-keyframe-1280x720.png",
        )
        (temp_package / "metadata").mkdir(parents=True)
        for name in ("scene-contract.json", "reconstruction.json", "provenance.json"):
            shutil.copy2(METADATA / name, temp_package / "metadata" / name)
        build(temp_root)
        verify(temp_root)
        expected = json.loads((METADATA / "layer-manifest.json").read_text(encoding="utf-8"))
        actual = json.loads((temp_root / METADATA.relative_to(ROOT) / "layer-manifest.json").read_text(encoding="utf-8"))
        if expected != actual:
            raise ValueError("Deterministic rebuild drifted from committed layer manifest")


def _pad_sprite_v2(image: Image.Image, canvas: tuple[int, int], pivot: tuple[int, int]) -> Image.Image:
    """Place a trimmed state on a shared transparent canvas at one ground pivot."""
    if image.width > canvas[0] or image.height > pivot[1]:
        raise ValueError("Entity state does not fit its declared pivot canvas")
    output = Image.new("RGBA", canvas, (0, 0, 0, 0))
    output.alpha_composite(image, (pivot[0] - image.width // 2, pivot[1] - image.height))
    return output


def _hud_state_v2(box: tuple[int, int, int, int], label: str) -> Image.Image:
    width, height = box[2] - box[0], box[3] - box[1]
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    text_scale = 2
    pixel_text(layer, ((width - text_width(label, text_scale)) // 2, 14), label, text_scale)
    return layer


def _build_hud_v2() -> dict[str, Image.Image]:
    top_boxes = {
        "fortress-value": (18, 10, 258, 60),
        "wave-value": (526, 10, 754, 60),
        "ore-value": (1022, 10, 1262, 60),
    }
    bottom_boxes = {
        "warden-name": (272, 604, 452, 704),
        "health-value": (462, 604, 652, 704),
        "target-nearest-state": (662, 604, 852, 704),
        "shield-slam-ready-state": (862, 604, 1102, 704),
        "pause-state": (1112, 604, 1262, 704),
    }
    top = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    bottom = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    for box in top_boxes.values():
        panel(top, box)
    for box in bottom_boxes.values():
        panel(bottom, box)
    parts = {
        "top-hud-frame": top,
        "bottom-hud-frame": bottom,
        "fortress-value": _hud_state_v2(top_boxes["fortress-value"], "FORT 18/20"),
        "wave-value": _hud_state_v2(top_boxes["wave-value"], "WAVE 7"),
        "ore-value": _hud_state_v2(top_boxes["ore-value"], "ORE 840"),
        "warden-name": _hud_state_v2(bottom_boxes["warden-name"], "WARDEN"),
        "health-value": _hud_state_v2(bottom_boxes["health-value"], "84/100"),
        "target-nearest-state": _hud_state_v2(bottom_boxes["target-nearest-state"], "NEAREST"),
        "target-strongest-state": _hud_state_v2(bottom_boxes["target-nearest-state"], "STRONGEST"),
        "shield-slam-ready-state": _hud_state_v2(bottom_boxes["shield-slam-ready-state"], "SLAM READY"),
        "shield-slam-cooldown-state": _hud_state_v2(bottom_boxes["shield-slam-ready-state"], "SLAM 3"),
        "pause-state": _hud_state_v2(bottom_boxes["pause-state"], "PAUSE"),
        "resume-state": _hud_state_v2(bottom_boxes["pause-state"], "RESUME"),
    }
    health = ImageDraw.Draw(parts["health-value"])
    health.rectangle((18, 55, 172, 75), fill=PALETTE["iron"], outline=PALETTE["copper"], width=2)
    health.rectangle((23, 60, 143, 70), fill=PALETTE["red"])
    for name in ("shield-slam-ready-state", "shield-slam-cooldown-state"):
        draw = ImageDraw.Draw(parts[name])
        color = PALETTE["blue"] if name.endswith("ready-state") else PALETTE["stone_light"]
        draw.polygon([(22, 58), (36, 44), (50, 58), (36, 72)], fill=color, outline=PALETTE["gold"])
    for name in ("pause-state", "resume-state"):
        draw = ImageDraw.Draw(parts[name])
        if name == "pause-state":
            draw.rectangle((56, 55, 63, 78), fill=PALETTE["gold"])
            draw.rectangle((70, 55, 77, 78), fill=PALETTE["gold"])
        else:
            draw.polygon([(58, 53), (58, 80), (80, 66)], fill=PALETTE["gold"])
    return parts


def _occlusion_v2(clean: Image.Image) -> tuple[Image.Image, Image.Image]:
    mask = Image.new("L", FRAME, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(0, 92), (112, 92), (188, 212), (142, 390), (0, 420)], fill=255)
    draw.polygon([(1108, 458), (1280, 420), (1280, 720), (1030, 720), (1060, 585)], fill=255)
    occluder = clean.copy()
    occluder.putalpha(mask)
    return mask, occluder


def _masked_clean_pixels_v4(clean: Image.Image, mask: Image.Image) -> Image.Image:
    """Extract source-identical architecture with canonical zero RGB under zero alpha."""
    output = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    output.paste(clean, (0, 0), mask)
    output.putalpha(mask)
    return output


def _portal_occlusion_v4(clean: Image.Image) -> dict[str, tuple[Image.Image, Image.Image]]:
    """Author portal-local architecture masks; these never act as one global depth mask."""
    upper = Image.new("L", FRAME, 0)
    ImageDraw.Draw(upper).polygon(
        [(900, 100), (1065, 100), (1065, 178), (1038, 178), (1032, 190),
         (1008, 202), (970, 208), (940, 202), (918, 190), (900, 190)],
        fill=255,
    )
    lower = Image.new("L", FRAME, 0)
    lower_draw = ImageDraw.Draw(lower)
    lower_draw.polygon(
        [(775, 220), (885, 220), (885, 286), (866, 291), (858, 304),
         (840, 294), (822, 284), (804, 294), (775, 302)],
        fill=255,
    )
    lower_draw.polygon([(775, 286), (817, 276), (826, 331), (810, 331), (775, 320)], fill=255)
    lower_draw.polygon([(858, 284), (885, 278), (885, 331), (858, 331)], fill=255)
    lower_draw.line([(842, 331), (835, 343), (820, 358)], fill=0, width=13, joint="curve")
    return {
        "upper": (upper, _masked_clean_pixels_v4(clean, upper)),
        "lower": (lower, _masked_clean_pixels_v4(clean, lower)),
    }


def _portal_sample_v4(
    clean: Image.Image,
    sprite: Image.Image,
    pivot: tuple[int, int],
    ground: tuple[int, int],
    occluder: Image.Image | None,
    crop: tuple[int, int, int, int],
    ring: Image.Image | None = None,
) -> Image.Image:
    scene = clean.copy()
    if ring is not None:
        scene.alpha_composite(ring, (ground[0] - ring.width // 2, ground[1] - ring.height // 2))
    scene.alpha_composite(sprite, (ground[0] - pivot[0], ground[1] - pivot[1]))
    if occluder is not None:
        scene.alpha_composite(occluder)
    return scene.crop(crop)


def _portal_coverage_v5(
    alpha: Image.Image,
    pivot: tuple[int, int],
    ground: tuple[int, int],
    mask: Image.Image,
) -> tuple[int, int]:
    hidden = 0
    total = 0
    offset = (ground[0] - pivot[0], ground[1] - pivot[1])
    for y in range(alpha.height):
        for x in range(alpha.width):
            if alpha.getpixel((x, y)) == 0:
                continue
            total += 1
            if mask.getpixel((offset[0] + x, offset[1] + y)) != 0:
                hidden += 1
    return hidden, total - hidden


def _portal_player_filmstrip_v5(
    clean: Image.Image,
    sprites: dict[str, Image.Image],
    effects: dict[str, Image.Image],
    portal: dict[str, Any],
    occluder: Image.Image,
    phases: list[tuple[str, bool]],
) -> Image.Image:
    """Unannotated, normal-scale player frames; review labels belong in diagnostics only."""
    bounds = tuple(portal["bounds"])
    crop = (
        max(0, bounds[0] - 30),
        max(0, bounds[1] - 20),
        min(FRAME[0], bounds[2] + 30),
        min(FRAME[1], bounds[3] + 20),
    )
    cell_width = crop[2] - crop[0]
    cell_height = crop[3] - crop[1]
    gap = 6
    board = Image.new(
        "RGBA",
        (len(phases) * cell_width + (len(phases) - 1) * gap, 2 * cell_height + gap),
        (7, 13, 22, 255),
    )
    rows = [
        ("iron-warden-idle", (56, 66), "warden-selection-ring"),
        ("mine-raider-idle", (40, 54), "hostile-faction-ring"),
    ]
    for row_index, (asset, pivot, ring_asset) in enumerate(rows):
        y = row_index * (cell_height + gap)
        for column, (sample_key, masked) in enumerate(phases):
            x = column * (cell_width + gap)
            ground = tuple(portal["samples"][sample_key])
            panel = _portal_sample_v4(
                clean,
                sprites[asset],
                pivot,
                ground,
                occluder if masked else None,
                crop,
                effects[ring_asset],
            )
            board.alpha_composite(panel, (x, y))
    return board


def _checker_v4(size: tuple[int, int], step: int = 12) -> Image.Image:
    checker = Image.new("RGBA", size, (24, 32, 42, 255))
    draw = ImageDraw.Draw(checker)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2 == 0:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill=(72, 80, 90, 255))
    return checker


def _portal_mask_isolation_board_v5(
    clean: Image.Image,
    portals: list[dict[str, Any]],
    portal_layers: dict[str, tuple[Image.Image, Image.Image]],
) -> Image.Image:
    board = Image.new("RGBA", (2760, 2150), (7, 13, 22, 255))
    pixel_text(board, (20, 18), "PORTAL MASK SOURCE CHECKER ALPHA CONTOUR AND ZERO DIFFERENCE", 2)
    labels = ["SOURCE 4X", "CHECKER OCCLUDER 4X", "BLACK WHITE ALPHA 4X", "ONE PIXEL CONTOUR 4X"]
    for row, (portal, key) in enumerate(zip(portals, ("upper", "lower"), strict=True)):
        crop = tuple(portal["extractionCrop"])
        mask, occluder = portal_layers[key]
        source_crop = clean.crop(crop)
        mask_crop = mask.crop(crop)
        occluder_crop = occluder.crop(crop)
        checker = _checker_v4(source_crop.size)
        checker.alpha_composite(occluder_crop)
        alpha_view = Image.merge("RGBA", (mask_crop, mask_crop, mask_crop, Image.new("L", mask_crop.size, 255)))
        no_op = source_crop.copy()
        no_op.alpha_composite(occluder_crop)
        difference = Image.new("RGBA", source_crop.size, (0, 0, 0, 255))
        changed_pixels = 0
        max_delta = 0
        for y_pixel in range(source_crop.height):
            for x_pixel in range(source_crop.width):
                before = source_crop.getpixel((x_pixel, y_pixel))
                after = no_op.getpixel((x_pixel, y_pixel))
                delta = max(abs(before[channel] - after[channel]) for channel in range(4))
                if delta:
                    changed_pixels += 1
                    max_delta = max(max_delta, delta)
                    difference.putpixel((x_pixel, y_pixel), (delta, 0, 0, 255))
        contour_alpha = ImageChops.subtract(mask_crop, mask_crop.filter(ImageFilter.MinFilter(3)))
        contour = source_crop.copy()
        contour_color = Image.new("RGBA", source_crop.size, (255, 45, 180, 0))
        contour_color.putalpha(contour_alpha)
        contour.alpha_composite(contour_color)
        panels = [source_crop, checker, alpha_view, contour]
        y = 75 + row * 1000
        pixel_text(board, (20, y), portal["id"].upper().replace(".", " "), 1)
        for column, (label, panel) in enumerate(zip(labels, panels, strict=True)):
            x = 20 + column * 680
            pixel_text(board, (x, y + 20), label, 1)
            fitted = panel.resize((panel.width * 4, panel.height * 4), Image.Resampling.NEAREST)
            board.alpha_composite(fitted, (x, y + 48))
        heatmap_x = 20
        heatmap_y = y + 680
        board.alpha_composite(
            difference.resize((difference.width * 2, difference.height * 2), Image.Resampling.NEAREST),
            (heatmap_x, heatmap_y),
        )
        pixel_text(
            board,
            (220, heatmap_y + 18),
            f"ZERO DIFFERENCE HEATMAP CHANGEDPIXELS {changed_pixels} MAXCHANNELDELTA {max_delta}",
            1,
        )
    return board


def _portal_boundary_diagnostics_v5(
    clean: Image.Image,
    sprites: dict[str, Image.Image],
    effects: dict[str, Image.Image],
    portal: dict[str, Any],
    mask: Image.Image,
    occluder: Image.Image,
    phases: list[tuple[str, bool]],
) -> Image.Image:
    panel_size = (480, 280)
    gutter = 24
    board = Image.new(
        "RGBA",
        (gutter + len(phases) * (panel_size[0] + gutter), 120 + 2 * 370),
        (7, 13, 22, 255),
    )
    pixel_text(board, (20, 18), f"{portal['id'].upper().replace('.', ' ')} BOUNDARY DIAGNOSTICS 4X", 2)
    rows = [
        ("WARDEN 56PX", "iron-warden-idle", (56, 66), "warden-selection-ring"),
        ("RAIDER 44PX", "mine-raider-idle", (40, 54), "hostile-faction-ring"),
    ]
    for row, (row_label, asset, pivot, ring_asset) in enumerate(rows):
        y = 70 + row * 370
        pixel_text(board, (20, y), row_label, 1)
        alpha = sprites[asset].getchannel("A")
        for column, (sample_key, masked) in enumerate(phases):
            ground = tuple(portal["samples"][sample_key])
            hidden, visible = _portal_coverage_v5(alpha, pivot, ground, mask) if masked else (0, sum(v != 0 for v in alpha.get_flattened_data()))
            crop = (ground[0] - 30, ground[1] - 60, ground[0] + 30, ground[1] + 10)
            before = _portal_sample_v4(clean, sprites[asset], pivot, ground, None, crop, effects[ring_asset])
            after = _portal_sample_v4(clean, sprites[asset], pivot, ground, occluder if masked else None, crop, effects[ring_asset])
            comparison = Image.new("RGBA", (120, 70), (7, 13, 22, 255))
            comparison.alpha_composite(before, (0, 0))
            comparison.alpha_composite(after, (60, 0))
            x = 20 + column * (panel_size[0] + gutter)
            pixel_text(board, (x, y + 20), sample_key.upper(), 1)
            pixel_text(board, (x, y + 42), f"HIDDEN {hidden} VISIBLE {visible}", 1)
            board.alpha_composite(comparison.resize(panel_size, Image.Resampling.NEAREST), (x, y + 70))
    return board


def _lower_mouth_exclusion_board_v5(
    clean: Image.Image,
    mask: Image.Image,
    portal: dict[str, Any],
    sprites: dict[str, Image.Image],
    effects: dict[str, Image.Image],
) -> Image.Image:
    samples = ["firstVisibleMouth", "emerged"]
    rows = [
        ("WARDEN PLUS RING", "iron-warden-idle", (56, 66), "warden-selection-ring"),
        ("RAIDER PLUS RING", "mine-raider-idle", (40, 54), "hostile-faction-ring"),
    ]
    board = Image.new("RGBA", (1460, 1200), (7, 13, 22, 255))
    pixel_text(board, (20, 18), "LOWER MOUTH FULL ALPHA AND WORLD RING FOOTPRINT EXCLUSION 4X", 2)
    for row, (label, asset, pivot, ring_asset) in enumerate(rows):
        pixel_text(board, (20, 70 + row * 540), label, 1)
        entity_alpha = sprites[asset].getchannel("A")
        ring_alpha = effects[ring_asset].getchannel("A")
        for column, sample_key in enumerate(samples):
            ground = tuple(portal["samples"][sample_key])
            entity_visible = sum(value != 0 for value in entity_alpha.get_flattened_data())
            ring_pivot = (ring_alpha.width // 2, ring_alpha.height // 2)
            ring_visible = sum(value != 0 for value in ring_alpha.get_flattened_data())
            crop = (ground[0] - 50, ground[1] - 75, ground[0] + 50, ground[1] + 25)
            panel = clean.crop(crop)
            mask_crop = mask.crop(crop)
            contour_alpha = ImageChops.subtract(mask_crop, mask_crop.filter(ImageFilter.MinFilter(3)))
            contour = Image.new("RGBA", panel.size, (255, 45, 180, 0))
            contour.putalpha(contour_alpha)
            panel.alpha_composite(contour)
            entity_tint = Image.new("RGBA", sprites[asset].size, (80, 255, 150, 0))
            entity_tint.putalpha(entity_alpha)
            panel.alpha_composite(entity_tint, (ground[0] - pivot[0] - crop[0], ground[1] - pivot[1] - crop[1]))
            ring_tint = Image.new("RGBA", effects[ring_asset].size, (255, 210, 70, 0))
            ring_tint.putalpha(ring_alpha)
            panel.alpha_composite(ring_tint, (ground[0] - ring_pivot[0] - crop[0], ground[1] - ring_pivot[1] - crop[1]))
            x = 20 + column * 710
            y = 70 + row * 540
            pixel_text(board, (x, y + 22), sample_key.upper(), 1)
            pixel_text(board, (x, y + 44), "MAGENTA RAW CONTOUR REFERENCE MASK INACTIVE", 1)
            pixel_text(board, (x, y + 66), f"EFFECTIVE ENTITY HIDDEN 0 VISIBLE {entity_visible}", 1)
            pixel_text(board, (x, y + 88), f"EFFECTIVE RING HIDDEN 0 VISIBLE {ring_visible}", 1)
            board.alpha_composite(panel.resize((400, 400), Image.Resampling.NEAREST), (x, y + 112))
    return board


def _occlusion_sample_v2(
    clean: Image.Image,
    sprite: Image.Image,
    ground: tuple[int, int],
    pivot: tuple[int, int],
    occluder: Image.Image,
) -> Image.Image:
    scene = clean.copy()
    scene.alpha_composite(sprite, (ground[0] - pivot[0], ground[1] - pivot[1]))
    scene.alpha_composite(occluder)
    return scene


def _ordered_layers_v2(recipe: dict[str, object]) -> list[dict[str, object]]:
    layers = recipe["layersBackToFront"]
    if not isinstance(layers, list) or not layers:
        raise ValueError("Reconstruction recipe must contain layers")
    typed = [layer for layer in layers if isinstance(layer, dict)]
    if len(typed) != len(layers):
        raise ValueError("Every reconstruction layer must be an object")
    return sorted(
        typed,
        key=lambda layer: (
            layer["zOrder"],
            layer.get("depthSortY", -1),
            layers.index(layer),
        ),
    )


def _compose_v2(recipe: dict[str, object], assets: dict[str, Image.Image]) -> Image.Image:
    layers = _ordered_layers_v2(recipe)
    if layers[0]["asset"] != "shuttergate-clean-plate-1280x720":
        raise ValueError("Reconstruction must start with the clean plate")
    output = assets[layers[0]["asset"]].copy()
    for layer in layers[1:]:
        output.alpha_composite(assets[layer["asset"]], tuple(layer["position"]))
    return output


def _recipe_without_v2(recipe: dict[str, object], excluded: set[str]) -> dict[str, object]:
    return {
        **recipe,
        "layersBackToFront": [
            layer for layer in recipe["layersBackToFront"] if layer["asset"] not in excluded
        ],
    }


def _labelled_grid_v2(panels: list[tuple[str, Image.Image]]) -> Image.Image:
    """Lay out four review panels with labels in gutters, never over artwork."""
    board = Image.new("RGBA", (1280, 820), (7, 13, 22, 255))
    slots = ((20, 50), (650, 50), (20, 430), (650, 430))
    for (label, image), (x, y) in zip(panels, slots):
        fitted = image.resize((610, 300), Image.Resampling.LANCZOS)
        pixel_text(board, (x, y), label, 2)
        board.alpha_composite(fitted, (x, y + 30))
    return board


def _draw_dashed_line_v3(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    *,
    fill: tuple[int, int, int, int],
    width: int = 4,
    dash: int = 12,
    gap: int = 8,
) -> None:
    """Draw one review-only hidden portal transition as a deterministic dashed line."""
    x0, y0 = start
    x1, y1 = end
    distance = max(abs(x1 - x0), abs(y1 - y0))
    if distance == 0:
        return
    cursor = 0
    while cursor < distance:
        segment_end = min(cursor + dash, distance)
        a = cursor / distance
        b = segment_end / distance
        draw.line(
            (
                (round(x0 + (x1 - x0) * a), round(y0 + (y1 - y0) * a)),
                (round(x0 + (x1 - x0) * b), round(y0 + (y1 - y0) * b)),
            ),
            fill=fill,
            width=width,
        )
        cursor += dash + gap


def _route_board_v3(clean: Image.Image, route: dict[str, Any]) -> Image.Image:
    """Render a sparse, pixel-registered route survey over the clean plate."""
    board = Image.new("RGBA", (1280, 860), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "REVIEW ONLY PIXEL REGISTERED DEFENSE ROUTE", 2)
    pixel_text(board, (24, 44), "GOLD VISIBLE FLOOR  CYAN HIDDEN GATE  GREEN VISIBLE GATE  RED OBJECTIVE", 2)
    pixel_text(board, (24, 70), "NO RAIL CROSSING REQUIREMENT  NO GLOBAL FLOOR MASK", 2)
    scene = clean.copy()
    draw = ImageDraw.Draw(scene)
    zones = route["zones"]
    for zone in zones:
        polyline = [tuple(point) for point in zone["visiblePolyline"]]
        draw.line(polyline, fill=(255, 205, 40, 235), width=4, joint="curve")
        for x, y in polyline:
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 235, 120, 255))
    for index, portal in enumerate(route["portals"], start=1):
        hidden_color = (40, 220, 255, 255)
        visible_color = (100, 255, 170, 255)
        x0, y0, x1, y1 = portal["bounds"]
        draw.rectangle((x0, y0, x1, y1), outline=hidden_color, width=2)
        visible_bounds = portal["visibleMouthBounds"]
        if visible_bounds is not None:
            vx0, vy0, vx1, vy1 = visible_bounds
            draw.rectangle((vx0, vy0, vx1, vy1), outline=visible_color, width=2)
        for segment in portal["segments"]:
            start = tuple(segment["from"])
            end = tuple(segment["to"])
            if segment["kind"] == "architecture-hidden":
                _draw_dashed_line_v3(draw, start, end, fill=hidden_color, width=4, dash=8, gap=6)
            else:
                draw.line((start, end), fill=visible_color, width=4)
                for x, y in (start, end):
                    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=visible_color)
        pixel_text(scene, (x0 + 2, max(8, y0 - 14)), f"GATE {index} HIDDEN", 1)
        if visible_bounds is not None:
            visible_x0, _, _, visible_y1 = visible_bounds
            pixel_text(scene, (visible_x0 + 2, min(700, visible_y1 + 4)), f"GATE {index} VISIBLE MOUTH", 1)
    entrance_x, entrance_y = route["entrance"]["anchor"]
    objective_x, objective_y = route["objective"]["anchor"]
    draw.ellipse((entrance_x - 7, entrance_y - 7, entrance_x + 7, entrance_y + 7), fill=(80, 220, 120, 255))
    draw.ellipse((objective_x - 9, objective_y - 9, objective_x + 9, objective_y + 9), fill=(220, 72, 62, 255))
    pixel_text(scene, (entrance_x - 48, entrance_y - 24), "ENTRANCE", 1)
    pixel_text(scene, (objective_x - 36, objective_y + 13), "BACKSTOP", 1)
    board.alpha_composite(scene, (0, 140))
    return board


def _route_registration_closeups_v3(route_board: Image.Image) -> Image.Image:
    """Expose gate/threshold registration at reviewable scale instead of relying on the full frame."""
    board = Image.new("RGBA", (1920, 680), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "PIXEL REGISTRATION CLOSEUPS FROM THE SAME ROUTE BOARD", 2)
    panels = [
        ("UPPER GATE HIDDEN SPAN", (780, 230, 1080, 390)),
        ("LOWER GATE COMPOUND TRANSITION", (650, 380, 950, 600)),
        ("SHUTTER THRESHOLD", (400, 510, 700, 730)),
    ]
    for index, (label, crop_box) in enumerate(panels):
        crop = route_board.crop(crop_box)
        scale = min(600 / crop.width, 540 / crop.height)
        resized = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.NEAREST)
        x = 20 + index * 630
        y = 100
        pixel_text(board, (x, 72), label, 1)
        board.alpha_composite(resized, (x, y))
        draw = ImageDraw.Draw(board)
        draw.rectangle((x, y, x + resized.width - 1, y + resized.height - 1), outline=(222, 170, 88, 255), width=2)
    return board


def _lighting_board_v2(
    clean: Image.Image,
    sprite: Image.Image,
    pivot: tuple[int, int],
    lighting: Image.Image,
) -> Image.Image:
    panels: list[tuple[str, Image.Image]] = []
    for anchor_name, ground in (("ENTRANCE", (1028, 190)), ("CENTRAL ROUTE", (674, 434))):
        unlit = clean.copy()
        unlit.alpha_composite(sprite, (ground[0] - pivot[0], ground[1] - pivot[1]))
        lit = unlit.copy()
        lit.alpha_composite(lighting)
        crop = (ground[0] - 180, ground[1] - 150, ground[0] + 180, ground[1] + 90)
        panels.extend(
            [
                (f"{anchor_name} UNLIT", unlit.crop(crop)),
                (f"{anchor_name} LIT NORMAL SRGB", lit.crop(crop)),
            ]
        )
    return _labelled_grid_v2(panels)


def _impact_board_v2(reconstruction: Image.Image, impact: Image.Image) -> Image.Image:
    board = Image.new("RGBA", (2560, 820), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "NEUTRAL COUNT PROOF ONE WARDEN ONE HOSTILE", 2)
    pixel_text(board, (1304, 18), "CONTACT FRAME SEPARATE IMPACT BOTH SILHOUETTES VISIBLE", 2)
    board.alpha_composite(reconstruction, (0, 100))
    contact = reconstruction.copy()
    contact.alpha_composite(impact, (690, 370))
    board.alpha_composite(contact, (1280, 100))
    return board


def _hud_mutation_board_v2(base: Image.Image, alternate: Image.Image) -> Image.Image:
    board = Image.new("RGBA", (2560, 820), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "FIXTURE READY NEAREST RUNNING", 2)
    pixel_text(board, (1304, 18), "ALTERNATE COOLDOWN STRONGEST PAUSED", 2)
    board.alpha_composite(base, (0, 100))
    board.alpha_composite(alternate, (1280, 100))
    return board


def _alignment_board_v2(sprites: dict[str, Image.Image]) -> Image.Image:
    board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    entries = [
        ("WARDEN IDLE 56PX", "iron-warden-idle", (180, 300), (56, 66)),
        ("WARDEN SLAM 56PX", "iron-warden-shield-slam", (470, 300), (56, 66)),
        ("RAIDER IDLE 44PX", "mine-raider-idle", (760, 300), (40, 54)),
        ("RAIDER ATTACK 44PX", "mine-raider-attack", (1030, 300), (40, 54)),
    ]
    draw = ImageDraw.Draw(board)
    for label, asset, ground, pivot in entries:
        image = sprites[asset]
        top_left = (ground[0] - pivot[0], ground[1] - pivot[1])
        board.alpha_composite(image, top_left)
        draw.line((ground[0] - 18, ground[1], ground[0] + 18, ground[1]), fill=(255, 70, 180, 255), width=2)
        draw.line((ground[0], ground[1] - 18, ground[0], ground[1] + 18), fill=(255, 70, 180, 255), width=2)
        pixel_text(board, (ground[0] - 90, 450), label, 2)
    pixel_text(board, (330, 92), "SHARED GROUND PIVOT ALIGNMENT", 3)
    return board


def _scale_board_v2(
    clean: Image.Image,
    reconstruction: Image.Image,
    sprites: dict[str, Image.Image],
    effects: dict[str, Image.Image],
) -> Image.Image:
    """Show the selected miniature fixture beside a clearly nonauthoritative density probe."""
    stress = clean.copy()
    placements = [(1028, 190), (930, 250), (825, 320), (720, 385), (610, 450), (500, 515), (365, 570)]
    for index, ground in enumerate(placements):
        asset = "iron-warden-idle" if index in {3, 5} else "mine-raider-idle"
        pivot = (56, 66) if "warden" in asset else (40, 54)
        if index in {2, 3, 5}:
            ring_asset = "warden-selection-ring" if "warden" in asset else "hostile-faction-ring"
            ring = effects[ring_asset]
            stress.alpha_composite(ring, (ground[0] - ring.width // 2, ground[1] - 20))
        stress.alpha_composite(sprites[asset], (ground[0] - pivot[0], ground[1] - pivot[1]))
    board = Image.new("RGBA", (2560, 820), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "PRIMARY 56PX WARDEN 44PX RAIDER FULL FRAME", 2)
    pixel_text(board, (24, 44), "DIRECT FROM APPROVED MASTERS FIXED SCREEN SPACE HIGHLIGHTS", 2)
    pixel_text(board, (1304, 18), "NONAUTHORITATIVE DENSITY READABILITY STRESS", 2)
    pixel_text(board, (1304, 44), "COUNTS AND SPACING ARE NOT SIMULATION EVIDENCE", 2)
    board.alpha_composite(reconstruction, (0, 100))
    board.alpha_composite(stress, (1280, 100))
    return board


def _composition_decision_v2(approved: Image.Image, current: Image.Image) -> Image.Image:
    board = Image.new("RGBA", (2560, 900), (7, 13, 22, 255))
    pixel_text(board, (24, 18), "LEFT APPROVED 284 ART DIRECTION", 2)
    pixel_text(board, (24, 44), "DENSER CENTRAL ENCOUNTER STAGING", 2)
    pixel_text(board, (1304, 18), "RIGHT 286 PROPOSED PRODUCTION FLOOR", 2)
    pixel_text(board, (1304, 44), "WIDER DIAGONAL ROUTE FIXED HUD REGIONS 56 44PX", 2)
    pixel_text(board, (500, 76), "DECISION REQUEST ACCEPT THIS CAMERA ROUTE ENTRANCE GATE AND HUD FLOOR FOR 287", 2)
    board.alpha_composite(approved, (0, 180))
    board.alpha_composite(current, (1280, 180))
    return board


def build(output_root: Path = ROOT) -> None:
    package = output_root / PACKAGE.relative_to(ROOT)
    direction = output_root / DIRECTION.relative_to(ROOT)
    exports = package / "exports"
    evidence = output_root / EVIDENCE.relative_to(ROOT)
    metadata = package / "metadata"
    shutil.rmtree(exports, ignore_errors=True)
    shutil.rmtree(evidence, ignore_errors=True)
    scene = json.loads((metadata / "scene-contract.json").read_text(encoding="utf-8"))
    recipe = json.loads((metadata / "reconstruction.json").read_text(encoding="utf-8"))
    clean = cover_16_9(Image.open(package / "sources" / "shuttergate-clean-plate-master.png"))
    png(clean, exports / "environment" / "shuttergate-clean-plate-1280x720.png")

    warden_master = Image.open(direction / "sources" / "iron-warden-master.png")
    raider_master = Image.open(direction / "sources" / "mine-raider-master.png")
    raw = {
        "iron-warden-idle": fit_miniature_height(sprite_cell(warden_master, (0, 355)), 56),
        "iron-warden-shield-slam": fit_miniature_height(sprite_cell(warden_master, (708, 1098)), 56),
        "mine-raider-idle": ImageEnhance.Brightness(fit_miniature_height(sprite_cell(raider_master, (0, 353)), 44)).enhance(1.3),
        "mine-raider-attack": ImageEnhance.Brightness(fit_miniature_height(sprite_cell(raider_master, (707, 961)), 44)).enhance(1.3),
    }
    sprites = {
        asset: _pad_sprite_v2(image, tuple(scene["entityStates"][asset]["canvas"]), tuple(scene["entityStates"][asset]["pivot"]))
        for asset, image in raw.items()
    }
    for name, image in sprites.items():
        png(image, exports / "entities" / f"{name}.png")

    effects = {
        "warden-selection-ring": ring((94, 42), (84, 178, 196, 210)),
        "hostile-faction-ring": ring((78, 36), (184, 79, 47, 210)),
        "shield-slam-impact": shield_impact(),
    }
    for name, image in effects.items():
        png(image, exports / "effects" / f"{name}.png")
    lighting = lighting_overlay()
    png(lighting, exports / "lighting" / "warm-light-overlay.png")
    mask, occluder = _occlusion_v2(clean)
    png(mask, exports / "occlusion" / "architecture-mask.png")
    png(occluder, exports / "occlusion" / "foreground-occluder.png")
    portal_layers = _portal_occlusion_v4(clean)
    for key, (portal_mask, portal_occluder) in portal_layers.items():
        png(portal_mask, exports / "occlusion" / f"portal-{key}-gate-mask.png")
        png(portal_occluder, exports / "occlusion" / f"portal-{key}-gate-occluder.png")
    hud = _build_hud_v2()
    for name, image in hud.items():
        png(image, exports / "hud" / f"{name}.png")
    portrait_source = fit_miniature_height(sprite_cell(warden_master, (0, 355)), 64)
    portrait = _pad_sprite_v2(portrait_source, (78, 80), (39, 74))
    png(portrait, exports / "hud" / "warden-portrait.png")

    assets = {"shuttergate-clean-plate-1280x720": clean, **sprites, **effects, "foreground-occluder": occluder, "warm-light-overlay": lighting, **hud, "warden-portrait": portrait}
    reconstruction = _compose_v2(recipe, assets)
    entity_assets = {"iron-warden-shield-slam", "mine-raider-attack"}
    ring_assets = {"warden-selection-ring", "hostile-faction-ring"}
    no_entities = _compose_v2(_recipe_without_v2(recipe, entity_assets | ring_assets), assets)
    png(reconstruction, evidence / "reconstruction-one-warden-one-hostile.png")
    png(no_entities, evidence / "reconstruction-entities-removed.png")
    png(clean, evidence / "clean-plate.png")
    png(composite(clean, [(occluder, (0, 0)), (lighting, (0, 0))]), evidence / "environment-and-presentation-lighting.png")

    warden_only = _compose_v2(_recipe_without_v2(recipe, {"mine-raider-attack", "hostile-faction-ring"}), assets)
    hostile_only = _compose_v2(_recipe_without_v2(recipe, {"iron-warden-shield-slam", "warden-selection-ring"}), assets)
    clean_digest = hashlib.sha256(clean.convert("RGB").tobytes()).hexdigest()[:12].upper()
    png(
        _labelled_grid_v2(
            [
                (f"BOTH WORLD {clean_digest}", reconstruction),
                (f"WARDEN ONLY WORLD {clean_digest}", warden_only),
                (f"HOSTILE ONLY WORLD {clean_digest}", hostile_only),
                (f"NEITHER WORLD {clean_digest}", no_entities),
            ]
        ),
        evidence / "entity-removal-grid.png",
    )

    hud_board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    for layer in _ordered_layers_v2(recipe):
        if layer["region"] == "screen-space-hud":
            hud_board.alpha_composite(assets[layer["asset"]], tuple(layer["position"]))
    png(hud_board, evidence / "hud-control-isolation.png")
    alternate_assets = {**assets, "target-nearest-state": hud["target-strongest-state"], "shield-slam-ready-state": hud["shield-slam-cooldown-state"], "pause-state": hud["resume-state"]}
    alternate = _compose_v2(recipe, alternate_assets)
    png(
        _hud_mutation_board_v2(reconstruction, alternate),
        evidence / "hud-state-mutation.png",
    )

    png(occlusion_board(clean, mask, occluder), evidence / "foreground-occlusion-isolation.png")
    upper_occlusion = _occlusion_sample_v2(
        clean, sprites["iron-warden-idle"], (140, 170), (56, 66), occluder
    )
    lower_occlusion = _occlusion_sample_v2(
        clean, sprites["mine-raider-idle"], (1080, 540), (40, 54), occluder
    )
    route_board = _route_board_v3(clean, scene["route"])
    occlusion_samples = _labelled_grid_v2(
        [
            ("UPPER COLUMN BEHIND", upper_occlusion),
            ("TRUTH ANCHORS CLEAR", reconstruction),
            ("LOWER BALUSTRADE BEHIND", lower_occlusion),
            ("PORTAL TRAVERSAL OWNED BY 273", route_board),
        ]
    )
    png(occlusion_samples, evidence / "occlusion-depth-proof.png")
    png(lighting, evidence / "lighting-alpha-isolation.png")
    unlit = _compose_v2(_recipe_without_v2(recipe, {"warm-light-overlay"}), assets)
    png(
        _lighting_board_v2(clean, sprites["iron-warden-idle"], (56, 66), lighting),
        evidence / "lighting-entity-proof.png",
    )
    png(route_board, evidence / "route-anchor-validation.png")
    png(_route_registration_closeups_v3(route_board), evidence / "route-registration-closeups.png")
    upper_portal, lower_portal = scene["route"]["portals"]
    upper_phases = [
        ("approach", False),
        ("lastVisibleLip", True),
        ("fullyHidden", True),
        ("firstVisibleLip", True),
        ("emerged", False),
    ]
    lower_phases = [
        ("approach", False),
        ("lastVisibleLip", True),
        ("partiallyOccluded", True),
        ("firstVisibleMouth", False),
        ("emerged", False),
    ]
    png(
        _portal_player_filmstrip_v5(
            clean,
            sprites,
            effects,
            upper_portal,
            portal_layers["upper"][1],
            upper_phases,
        ),
        evidence / "portal-upper-gate-transition.png",
    )
    png(
        _portal_player_filmstrip_v5(
            clean,
            sprites,
            effects,
            lower_portal,
            portal_layers["lower"][1],
            lower_phases,
        ),
        evidence / "portal-lower-gate-transition.png",
    )
    png(
        _portal_mask_isolation_board_v5(clean, [upper_portal, lower_portal], portal_layers),
        evidence / "portal-mask-isolation.png",
    )
    png(
        _portal_boundary_diagnostics_v5(
            clean,
            sprites,
            effects,
            lower_portal,
            portal_layers["lower"][0],
            portal_layers["lower"][1],
            lower_phases,
        ),
        evidence / "portal-ring-effect-depth.png",
    )
    png(
        _portal_boundary_diagnostics_v5(
            clean,
            sprites,
            effects,
            upper_portal,
            portal_layers["upper"][0],
            portal_layers["upper"][1],
            upper_phases,
        ),
        evidence / "portal-upper-boundary-diagnostics.png",
    )
    png(
        _lower_mouth_exclusion_board_v5(
            clean,
            portal_layers["lower"][0],
            lower_portal,
            sprites,
            effects,
        ),
        evidence / "portal-lower-mouth-exclusion.png",
    )
    png(_alignment_board_v2(sprites), evidence / "entity-state-alignment.png")
    png(
        _impact_board_v2(reconstruction, effects["shield-slam-impact"]),
        evidence / "shield-slam-effect-proof.png",
    )
    png(
        _scale_board_v2(clean, reconstruction, sprites, effects),
        evidence / "character-scale-study.png",
    )
    png(isolation_board([sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 1), evidence / "iron-warden-alpha-states-native.png")
    png(isolation_board([sprites["iron-warden-idle"], sprites["iron-warden-shield-slam"]], 4), evidence / "iron-warden-alpha-states-4x.png")
    png(isolation_board([sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 1), evidence / "mine-raider-alpha-states-native.png")
    png(isolation_board([sprites["mine-raider-idle"], sprites["mine-raider-attack"]], 4), evidence / "mine-raider-alpha-states-4x.png")
    png(isolation_board(list(effects.values()), 2), evidence / "selection-and-combat-effect-isolation.png")
    approved = Image.open(direction / "exports" / "shuttergate-keyframe-1280x720.png").convert("RGBA")
    comparison = Image.new("RGBA", (2560, 720), (0, 0, 0, 255))
    comparison.alpha_composite(approved, (0, 0))
    comparison.alpha_composite(reconstruction, (1280, 0))
    png(comparison, evidence / "approved-keyframe-vs-reconstruction.png")
    png(_composition_decision_v2(approved, reconstruction), evidence / "composition-decision.png")

    tracked: list[tuple[Path, str, str, list[str]]] = [
        (exports / "environment" / "shuttergate-clean-plate-1280x720.png", "environment", "opaque-clean-plate", ["world"])
    ]
    tracked.extend((path, "entity", "straight-alpha-padded-pivot", ["world-entities"]) for path in sorted((exports / "entities").glob("*.png")))
    tracked.extend((path, "effect", "straight-alpha", ["world-effects"]) for path in sorted((exports / "effects").glob("*.png")))
    tracked.append((exports / "lighting" / "warm-light-overlay.png", "lighting", "straight-alpha-normal-srgb-no-entities", ["world-lighting"]))
    tracked.append((exports / "occlusion" / "architecture-mask.png", "occlusion-mask", "grayscale-mask", ["foreground-occlusion"]))
    tracked.append((exports / "occlusion" / "foreground-occluder.png", "foreground", "straight-alpha-environment-only", ["foreground-occlusion"]))
    tracked.extend(
        (path, "portal-occlusion-mask", "grayscale-mask-portal-local", ["portal-occlusion"])
        for path in sorted((exports / "occlusion").glob("portal-*-mask.png"))
    )
    tracked.extend(
        (path, "portal-foreground", "straight-alpha-source-pixel-exact-zero-rgb", ["portal-occlusion"])
        for path in sorted((exports / "occlusion").glob("portal-*-occluder.png"))
    )
    tracked.extend((path, "hud", "straight-alpha-runtime-state-or-chrome", ["screen-space-hud"]) for path in sorted((exports / "hud").glob("*.png")))
    manifest = {
        "schemaVersion": 2,
        "package": "dwarven-depths-issue-286-production-scene",
        "logicalFrame": [640, 360],
        "reviewFrame": list(FRAME),
        "entityLayerCounts": {"iron-warden": 1, "mine-raider": 1},
        "contractDigests": {name: sha256(metadata / name) for name in ("provenance.json", "reconstruction.json", "scene-contract.json")},
        "files": [file_record(path, category, alpha, regions, output_root) for path, category, alpha, regions in tracked],
        "evidence": [file_record(path, "evidence", "review-only", ["review"], output_root) for path in sorted(evidence.glob("*.png"))],
    }
    manifest_path = metadata / "layer-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["pnpm", "exec", "biome", "format", "--write", str(manifest_path)], check=True, cwd=ROOT)


def _assert_strict_v2(value: object, keys: set[str], context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    strict_keys(value, keys, context)
    return value


def verify(root: Path = ROOT) -> None:
    package = root / PACKAGE.relative_to(ROOT)
    metadata = package / "metadata"
    scene = json.loads((metadata / "scene-contract.json").read_text(encoding="utf-8"))
    recipe = json.loads((metadata / "reconstruction.json").read_text(encoding="utf-8"))
    manifest = json.loads((metadata / "layer-manifest.json").read_text(encoding="utf-8"))
    _assert_strict_v2(scene, {"schemaVersion", "package", "authority", "coordinateSpace", "safeAreas", "camera", "route", "entityAnchors", "entityStates", "occlusion", "lighting", "hudRegions", "hudDynamicState", "cropPolicy"}, "scene-contract")
    _assert_strict_v2(recipe, {"schemaVersion", "frame", "output", "entityCounts", "layersBackToFront", "isolationProofs"}, "reconstruction")
    _assert_strict_v2(manifest, {"schemaVersion", "package", "logicalFrame", "reviewFrame", "entityLayerCounts", "contractDigests", "files", "evidence"}, "manifest")
    if scene["schemaVersion"] != 4 or recipe["schemaVersion"] != 2 or manifest["schemaVersion"] != 2:
        raise ValueError("Scene contract must use schema 4; recipe and manifest must use schema 2")
    if scene["package"] != "dwarven-depths-issue-286-production-scene" or manifest["package"] != scene["package"]:
        raise ValueError("Scene and manifest package IDs are not canonical")
    if manifest["logicalFrame"] != [640, 360] or manifest["reviewFrame"] != [1280, 720]:
        raise ValueError("Manifest coordinate frames are not canonical")
    if scene["authority"] != "presentation-only" or recipe["frame"] != list(FRAME):
        raise ValueError("Scene authority or frame drifted")
    _assert_strict_v2(scene["coordinateSpace"], {"origin", "logicalFrame", "reviewFrame", "logicalTexelScale"}, "scene.coordinateSpace")
    _assert_strict_v2(scene["safeAreas"], {"world", "unobscuredWorldBand", "entitySafe", "hudOcclusionRects"}, "scene.safeAreas")
    _assert_strict_v2(scene["camera"], {"projection", "viewDirection", "fixedReviewFrame"}, "scene.camera")
    _assert_strict_v2(scene["entityAnchors"], {"ironWardenTruthScreen", "mineRaiderTruthScreen"}, "scene.entityAnchors")
    for name, anchor in scene["entityAnchors"].items():
        _assert_strict_v2(anchor, {"groundPosition", "depthSortY"}, f"scene.entityAnchors.{name}")
    occlusion = _assert_strict_v2(scene["occlusion"], {"mask", "foreground", "scope", "routeTraversalOwner", "portalPolicy", "zones", "depthOrder"}, "scene.occlusion")
    _assert_strict_v2(
        occlusion["portalPolicy"],
        {"maskScope", "worldRingsAndEffects", "screenSpaceFocus", "lowerVisibleMouth", "fullTraversalOwnerIssue"},
        "scene.occlusion.portalPolicy",
    )
    for index, zone in enumerate(occlusion["zones"]):
        _assert_strict_v2(zone, {"id", "depthThreshold", "bounds"}, f"scene.occlusion.zones[{index}]")
    _assert_strict_v2(scene["lighting"], {"asset", "blendMode", "colorSpace", "alpha", "affects", "excludes"}, "scene.lighting")
    _assert_strict_v2(scene["hudRegions"], {"top", "bottom", "fortressStatus", "waveStatus", "oreStatus", "wardenNameplate", "portrait", "health", "targetPolicy", "shieldSlam", "pause"}, "scene.hudRegions")
    _assert_strict_v2(scene["cropPolicy"], {"desktop", "laptop", "mobile", "status"}, "scene.cropPolicy")
    canonical_sections = {
        "coordinateSpace": {"origin": "top-left", "logicalFrame": [640, 360], "reviewFrame": [1280, 720], "logicalTexelScale": 2},
        "safeAreas": {"world": [0, 0, 1280, 720], "unobscuredWorldBand": [0, 72, 1280, 590], "entitySafe": [80, 80, 1200, 590], "hudOcclusionRects": [[272, 604, 1262, 704]]},
        "camera": {"projection": "elevated-orthographic-2.5d", "viewDirection": "upper-right-background-to-lower-left-foreground", "fixedReviewFrame": True},
        "route": {
            "topology": "single-piecewise-painted-floor-route",
            "scope": "presentation-only-fixed-truth-screen",
            "entrance": {"id": "entrance.background-opening", "anchor": [1145, 100]},
            "objective": {
                "id": "objective.foreground-shutter",
                "anchor": [590, 480],
                "kind": "terminal-backstop",
                "traversable": False,
            },
            "zones": [
                {
                    "id": "route-zone.background-approach",
                    "depthOrder": 100,
                    "bounds": [1045, 80, 1165, 180],
                    "visiblePolyline": [[1145, 100], [1120, 125], [1090, 150], [1052, 170]],
                },
                {
                    "id": "route-zone.upper-causeway",
                    "depthOrder": 200,
                    "bounds": [790, 175, 925, 295],
                    "visiblePolyline": [[918, 187], [885, 195], [855, 210], [830, 230], [810, 255], [818, 271], [822, 281]],
                },
                {
                    "id": "route-zone.lower-causeway",
                    "depthOrder": 300,
                    "bounds": [580, 350, 830, 495],
                    "visiblePolyline": [[820, 358], [800, 360], [760, 390], [720, 415], [680, 440], [640, 465], [605, 485], [590, 480]],
                },
            ],
            "portals": [
                {
                    "id": "portal.upper-gate",
                    "incomingZoneId": "route-zone.background-approach",
                    "outgoingZoneId": "route-zone.upper-causeway",
                    "incomingAnchor": [1052, 170],
                    "outgoingAnchor": [918, 187],
                    "bounds": [900, 100, 1065, 240],
                    "visibleMouthBounds": None,
                    "segments": [{"kind": "architecture-hidden", "from": [1052, 170], "to": [918, 187]}],
                    "visibility": "architecture-hidden",
                    "occlusionMode": "architecture-depth-transition",
                    "maskAsset": "portal-upper-gate-mask",
                    "occluderAsset": "portal-upper-gate-occluder",
                    "extractionCrop": [900, 100, 1065, 240],
                    "applicability": "architecture-hidden-segment-only",
                    "samples": {"approach": [1080, 156], "lastVisibleLip": [1072, 160], "fullyHidden": [982, 180], "firstVisibleLip": [918, 187], "emerged": [902, 190]},
                    "traversalOwnerIssue": 273,
                },
                {
                    "id": "portal.lower-gate",
                    "incomingZoneId": "route-zone.upper-causeway",
                    "outgoingZoneId": "route-zone.lower-causeway",
                    "incomingAnchor": [822, 281],
                    "outgoingAnchor": [820, 358],
                    "bounds": [775, 220, 885, 375],
                    "visibleMouthBounds": [815, 328, 870, 365],
                    "segments": [
                        {"kind": "architecture-hidden", "from": [822, 281], "to": [842, 331]},
                        {"kind": "visible-floor-gate-mouth", "from": [842, 331], "to": [820, 358]},
                    ],
                    "visibility": "compound-hidden-visible-mouth",
                    "occlusionMode": "compound-depth-transition",
                    "maskAsset": "portal-lower-gate-mask",
                    "occluderAsset": "portal-lower-gate-occluder",
                    "extractionCrop": [775, 220, 885, 375],
                    "applicability": "hidden-segment-only-visible-mouth-excluded",
                    "samples": {"approach": [818, 271], "lastVisibleLip": [832, 307], "partiallyOccluded": [839, 323], "firstVisibleMouth": [842, 331], "mouthCenter": [835, 343], "emerged": [820, 358]},
                    "traversalOwnerIssue": 273,
                },
            ],
            "chokepointPortalIds": ["portal.upper-gate", "portal.lower-gate"],
            "validation": "pixel-surveyed-visible-segments-and-compound-registered-gate-transitions",
        },
        "entityAnchors": {"ironWardenTruthScreen": {"groundPosition": [674, 434], "depthSortY": 434}, "mineRaiderTruthScreen": {"groundPosition": [802, 398], "depthSortY": 398}},
        "entityStates": {"iron-warden-idle": {"canvas": [112, 72], "pivot": [56, 66], "facing": "upper-right", "nominalHeight": 56}, "iron-warden-shield-slam": {"canvas": [112, 72], "pivot": [56, 66], "facing": "upper-right", "nominalHeight": 56}, "mine-raider-idle": {"canvas": [80, 60], "pivot": [40, 54], "facing": "lower-left", "nominalHeight": 44}, "mine-raider-attack": {"canvas": [80, 60], "pivot": [40, 54], "facing": "lower-left", "nominalHeight": 44}},
        "occlusion": {"mask": "architecture-mask", "foreground": "foreground-occluder", "scope": "fixed-issue-287-truth-screen-anchors-only", "routeTraversalOwner": 273, "portalPolicy": {"maskScope": "portal-segment-specific-never-global", "worldRingsAndEffects": "obey-active-portal-occlusion", "screenSpaceFocus": "render-after-world-occlusion", "lowerVisibleMouth": [[842, 331], [835, 343], [820, 358]], "fullTraversalOwnerIssue": 273}, "zones": [{"id": "upper-left-column", "depthThreshold": 260, "bounds": [0, 92, 189, 421]}, {"id": "lower-right-balustrade", "depthThreshold": 520, "bounds": [1030, 421, 1280, 720]}], "depthOrder": ["environment", "rings", "entities-by-depthSortY", "portal-occluder-when-active", "foreground-occluder", "lighting-normal-srgb", "combat-effects", "screen-space-focus", "hud"]},
        "hudRegions": {"top": [0, 0, 1280, 72], "bottom": [272, 590, 1280, 720], "fortressStatus": [18, 10, 258, 60], "waveStatus": [526, 10, 754, 60], "oreStatus": [1022, 10, 1262, 60], "wardenNameplate": [272, 604, 452, 704], "portrait": [282, 614, 360, 694], "health": [462, 604, 652, 704], "targetPolicy": [662, 604, 852, 704], "shieldSlam": [862, 604, 1102, 704], "pause": [1112, 604, 1262, 704]},
        "hudDynamicState": {"font": "project-authored-5x7-pixel-uppercase", "textColor": [222, 170, 88, 255], "baselinePolicy": "regions-use-top-left-local-integer-pixel-baselines", "fixture": {"fortress": "18/20", "wave": "7", "ore": "840", "health": "84/100", "targetPolicy": "nearest", "shieldSlam": "ready", "paused": False}, "minimumVariants": {"targetPolicy": ["nearest", "strongest"], "shieldSlam": ["ready", "cooldown"], "pause": ["pause", "resume"]}},
        "cropPolicy": {"desktop": "show-full-16:9-frame", "laptop": "fit-full-frame-before-cropping; preserve both HUD bands and entrance/gate anchors", "mobile": "later-work-may-letterbox-or-use-authored-camera-crop; never crop both entrance and gate; HUD must reflow rather than scale below legibility", "status": "metadata-only-for-later-responsive-work"},
    }
    for section, expected in canonical_sections.items():
        require_exact_json(scene[section], expected, f"scene.{section}")
    if recipe["entityCounts"] != {"iron-warden": 1, "mine-raider": 1} or manifest["entityLayerCounts"] != recipe["entityCounts"]:
        raise ValueError("Declared entity counts are not canonical")
    canonical_output = "docs/visual-evidence/production-scene/reconstruction-one-warden-one-hostile.png"
    if recipe["output"] != canonical_output:
        raise ValueError("Reconstruction output path is not canonical")
    expected_digests = {name: sha256(metadata / name) for name in ("provenance.json", "reconstruction.json", "scene-contract.json")}
    if manifest["contractDigests"] != expected_digests:
        raise ValueError("Scene metadata digest mismatch")

    canonical_file_ids = [
        "shuttergate-clean-plate-1280x720",
        "iron-warden-idle",
        "iron-warden-shield-slam",
        "mine-raider-attack",
        "mine-raider-idle",
        "hostile-faction-ring",
        "shield-slam-impact",
        "warden-selection-ring",
        "warm-light-overlay",
        "architecture-mask",
        "foreground-occluder",
        "portal-lower-gate-mask",
        "portal-upper-gate-mask",
        "portal-lower-gate-occluder",
        "portal-upper-gate-occluder",
        "bottom-hud-frame",
        "fortress-value",
        "health-value",
        "ore-value",
        "pause-state",
        "resume-state",
        "shield-slam-cooldown-state",
        "shield-slam-ready-state",
        "target-nearest-state",
        "target-strongest-state",
        "top-hud-frame",
        "warden-name",
        "warden-portrait",
        "wave-value",
    ]
    canonical_evidence_ids = [
        "approved-keyframe-vs-reconstruction",
        "character-scale-study",
        "clean-plate",
        "composition-decision",
        "entity-removal-grid",
        "entity-state-alignment",
        "environment-and-presentation-lighting",
        "foreground-occlusion-isolation",
        "hud-control-isolation",
        "hud-state-mutation",
        "iron-warden-alpha-states-4x",
        "iron-warden-alpha-states-native",
        "lighting-alpha-isolation",
        "lighting-entity-proof",
        "mine-raider-alpha-states-4x",
        "mine-raider-alpha-states-native",
        "occlusion-depth-proof",
        "portal-lower-gate-transition",
        "portal-lower-mouth-exclusion",
        "portal-mask-isolation",
        "portal-ring-effect-depth",
        "portal-upper-boundary-diagnostics",
        "portal-upper-gate-transition",
        "reconstruction-entities-removed",
        "reconstruction-one-warden-one-hostile",
        "route-anchor-validation",
        "route-registration-closeups",
        "selection-and-combat-effect-isolation",
        "shield-slam-effect-proof",
    ]
    canonical_alpha_digests = {
        "iron-warden-idle": "48c9e45be4cbe6465fd3676db49b2ff1332a2d3792e0966973976b94295f0be1",
        "iron-warden-shield-slam": "30c918abd73ef39da0df2e310c6fa376af11f71baea1498ede278ab709260b3a",
        "mine-raider-attack": "a03c551fa936a4510130ee462755c9dfa7194263c81af5c136de748fdbf543f2",
        "mine-raider-idle": "0815d9d13b10833fe4e75a91ec27f17a66ebcd61b873262b9f8dc71f0203f2be",
        "hostile-faction-ring": "46f77279619c2939f7595424a3ca496c7e78d9bd5e0564e5313215b6bc1a81d6",
        "shield-slam-impact": "d5e7aa549c609af7425f5c1b6e483ae6ddb1cdec46f79ab455a37b0874387ec8",
        "warden-selection-ring": "f6fd0e80c9f66e3e4f614cf9867bf9f53c9c9998c16d641b0f036ed12a5d01da",
        "warm-light-overlay": "438f8d6eb92409b8551e427ee5c19c462a0401e87c8c50860c3dd3e1836b0152",
        "foreground-occluder": "da5723f77e92cc4c85204bba992928118f0153c0639daa1c46503aa09585ce4d",
        "bottom-hud-frame": "216ad8a8bbd32ede733c0ab0903bed79d72494e81ec6f2358704ce8af1f82139",
        "fortress-value": "a0f6d0ef5929dcff92985c4511e8956abedd64ff6de700871b3cfdb101fcd16a",
        "health-value": "a72653155460191398954e3a9396098022426e731fe953a1b9162f0989249ddf",
        "ore-value": "8b27fbaca13c3417a9f8881be152fe6c039f0fdbbeb3cfcf0b2c2a46d106c637",
        "pause-state": "9828cadb9e56803f6f160c04cba47fee7fa2f8b080201a753ece0b1fcc5b85af",
        "resume-state": "8331238fe10b74dfb04987018f96bc17d02125dba326763fdb44d0aacaef165d",
        "shield-slam-cooldown-state": "bb0f56b0e6be24b639903d81ac05b5d1781f71c7db0f80538a3f3d96c099c4f4",
        "shield-slam-ready-state": "f893ea21c05a7f302fe80200e6b16cd0869c05ce10e0b670945455406d67744f",
        "target-nearest-state": "7f395ee9f99bfd95af76d4128f518960fd4cde7e57cad5ce603dd4639e238a08",
        "target-strongest-state": "88c1f08957ac55a76c6cbba9e1e4ec1ebd0dd78181bae2ce594736eeb32b9cf5",
        "top-hud-frame": "07d4fd6d7551d30d163e9c5e189e324b7a9e4557ca4bb824693952bb12ad2c22",
        "warden-name": "25da2898d62c560c6a1de51fd708474966f2eae0ab9a46eaf5ceeb5efe647355",
        "warden-portrait": "65d47b2e488b9721977592371462a82be4f3b27da0734b9d2e5f262b38bb0247",
        "wave-value": "62e1223ea96ab22c6f7795fec653b69eeb6266bdff45642c582092c8463fc2bc",
    }
    if [record.get("id") for record in manifest["files"]] != canonical_file_ids:
        raise ValueError("Manifest runtime asset IDs are incomplete, duplicated, reordered, or noncanonical")
    if [record.get("id") for record in manifest["evidence"]] != canonical_evidence_ids:
        raise ValueError("Manifest evidence IDs are incomplete, duplicated, reordered, or noncanonical")
    records = [*manifest["files"], *manifest["evidence"]]
    ids: set[str] = set()
    assets: dict[str, Image.Image] = {}
    for index, record in enumerate(records):
        _assert_strict_v2(record, {"id", "path", "category", "dimensions", "mode", "alphaSemantics", "contributesTo", "sha256"}, f"manifest.record[{index}]")
        path = Path(record["path"])
        if path.is_absolute() or ".." in path.parts or not (root / path).is_file():
            raise ValueError(f"Manifest path is missing or unsafe: {path}")
        if sha256(root / path) != record["sha256"]:
            raise ValueError(f"Digest mismatch: {path}")
        with Image.open(root / path) as image:
            if list(image.size) != record["dimensions"] or image.mode != record["mode"]:
                raise ValueError(f"Image metadata mismatch: {path}")
            path_text = path.as_posix()
            if path_text.startswith("docs/visual-evidence/production-scene/"):
                semantics = ("evidence", "review-only", ["review"])
            elif path_text.endswith("environment/shuttergate-clean-plate-1280x720.png"):
                semantics = ("environment", "opaque-clean-plate", ["world"])
            elif "/entities/" in path_text:
                semantics = ("entity", "straight-alpha-padded-pivot", ["world-entities"])
            elif "/effects/" in path_text:
                semantics = ("effect", "straight-alpha", ["world-effects"])
            elif path_text.endswith("lighting/warm-light-overlay.png"):
                semantics = ("lighting", "straight-alpha-normal-srgb-no-entities", ["world-lighting"])
            elif path_text.endswith("occlusion/architecture-mask.png"):
                semantics = ("occlusion-mask", "grayscale-mask", ["foreground-occlusion"])
            elif path_text.endswith("occlusion/foreground-occluder.png"):
                semantics = ("foreground", "straight-alpha-environment-only", ["foreground-occlusion"])
            elif path_text.endswith("-mask.png") and "/occlusion/portal-" in path_text:
                semantics = ("portal-occlusion-mask", "grayscale-mask-portal-local", ["portal-occlusion"])
            elif path_text.endswith("-occluder.png") and "/occlusion/portal-" in path_text:
                semantics = ("portal-foreground", "straight-alpha-source-pixel-exact-zero-rgb", ["portal-occlusion"])
            elif "/hud/" in path_text:
                semantics = ("hud", "straight-alpha-runtime-state-or-chrome", ["screen-space-hud"])
            else:
                raise ValueError(f"Manifest path has no canonical semantics: {path}")
            if (record["category"], record["alphaSemantics"], record["contributesTo"]) != semantics:
                raise ValueError(f"Manifest semantics drifted: {path}")
            if record["alphaSemantics"].startswith("straight-alpha"):
                if image.mode != "RGBA":
                    raise ValueError(f"Straight-alpha asset is not RGBA: {path}")
                alpha = image.getchannel("A")
                alpha_histogram = alpha.histogram()
                nontransparent = image.width * image.height - alpha_histogram[0]
                if alpha_histogram[0] == 0 or nontransparent == 0 or nontransparent * 4 > image.width * image.height * 3:
                    raise ValueError(f"Straight-alpha asset lacks usable transparent separation: {path}")
                if record["id"] in canonical_alpha_digests and hashlib.sha256(alpha.tobytes()).hexdigest() != canonical_alpha_digests[record["id"]]:
                    raise ValueError(f"Straight-alpha pixels drifted: {record['id']}")
            canonical_directories = {
                "environment": "assets/game-art/production-scene/exports/environment",
                "entity": "assets/game-art/production-scene/exports/entities",
                "effect": "assets/game-art/production-scene/exports/effects",
                "lighting": "assets/game-art/production-scene/exports/lighting",
                "occlusion-mask": "assets/game-art/production-scene/exports/occlusion",
                "foreground": "assets/game-art/production-scene/exports/occlusion",
                "portal-occlusion-mask": "assets/game-art/production-scene/exports/occlusion",
                "portal-foreground": "assets/game-art/production-scene/exports/occlusion",
                "hud": "assets/game-art/production-scene/exports/hud",
                "evidence": "docs/visual-evidence/production-scene",
            }
            canonical_path = f"{canonical_directories[record['category']]}/{record['id']}.png"
            if path_text != canonical_path:
                raise ValueError(f"Manifest ID is not bound to its canonical path: {record['id']}")
            if record["id"] in ids:
                raise ValueError(f"Duplicate asset id: {record['id']}")
            ids.add(record["id"])
            if record["category"] not in {"evidence", "occlusion-mask"}:
                assets[record["id"]] = image.convert("RGBA")
    actual_exports = {
        path.relative_to(root).as_posix() for path in (package / "exports").rglob("*") if path.is_file()
    }
    declared_exports = {record["path"] for record in manifest["files"]}
    actual_evidence = {
        path.relative_to(root).as_posix()
        for path in (root / EVIDENCE.relative_to(ROOT)).rglob("*")
        if path.is_file()
    }
    declared_evidence = {record["path"] for record in manifest["evidence"]}
    if actual_exports != declared_exports or actual_evidence != declared_evidence:
        raise ValueError("Export or evidence directory contains stale/unmanifested files")

    route = _assert_strict_v2(
        scene["route"],
        {
            "topology",
            "scope",
            "entrance",
            "objective",
            "zones",
            "portals",
            "chokepointPortalIds",
            "validation",
        },
        "scene.route",
    )
    entrance = _assert_strict_v2(route["entrance"], {"id", "anchor"}, "scene.route.entrance")
    objective = _assert_strict_v2(
        route["objective"], {"id", "anchor", "kind", "traversable"}, "scene.route.objective"
    )
    entrance_anchor = validate_point(entrance["anchor"], "scene.route.entrance.anchor")
    objective_anchor = validate_point(objective["anchor"], "scene.route.objective.anchor")
    if objective["kind"] != "terminal-backstop" or objective["traversable"] is not False:
        raise ValueError("Foreground shutter must be a nontraversable terminal backstop")
    zones = route["zones"]
    if not isinstance(zones, list) or len(zones) != 3:
        raise ValueError("Piecewise route must declare exactly three ordered visible zones")
    zone_ids: list[str] = []
    zone_by_id: dict[str, dict[str, Any]] = {}
    previous_depth = -1
    for index, raw_zone in enumerate(zones):
        zone = _assert_strict_v2(
            raw_zone, {"id", "depthOrder", "bounds", "visiblePolyline"}, f"scene.route.zones[{index}]"
        )
        zone_id = zone["id"]
        if not isinstance(zone_id, str) or zone_id in zone_by_id:
            raise ValueError("Route zone IDs must be unique strings")
        bounds = validate_rectangle(zone["bounds"], f"scene.route.zones[{index}].bounds")
        depth_order = zone["depthOrder"]
        if type(depth_order) is not int or depth_order <= previous_depth:
            raise ValueError("Route zone depthOrder values must be strictly increasing")
        previous_depth = depth_order
        polyline = zone["visiblePolyline"]
        if not isinstance(polyline, list) or len(polyline) < 2:
            raise ValueError("Every visible route zone needs at least two points")
        for point_index, point in enumerate(polyline):
            x, y = validate_point(point, f"scene.route.zones[{index}].visiblePolyline[{point_index}]")
            x0, y0, x1, y1 = bounds
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                raise ValueError("Visible route point lies outside its declared depth-zone bounds")
        zone_ids.append(zone_id)
        zone_by_id[zone_id] = zone
    if tuple(zones[0]["visiblePolyline"][0]) != entrance_anchor:
        raise ValueError("First visible route zone must begin at the hostile entrance")
    if tuple(zones[-1]["visiblePolyline"][-1]) != objective_anchor:
        raise ValueError("Last visible route zone must terminate at the shutter backstop")
    portals = route["portals"]
    if not isinstance(portals, list) or len(portals) != len(zones) - 1:
        raise ValueError("Each adjacent visible route zone must be joined by one registered gate transition")
    portal_ids: list[str] = []
    for index, raw_portal in enumerate(portals):
        portal = _assert_strict_v2(
            raw_portal,
            {
                "id",
                "incomingZoneId",
                "outgoingZoneId",
                "incomingAnchor",
                "outgoingAnchor",
                "bounds",
                "visibleMouthBounds",
                "segments",
                "visibility",
                "occlusionMode",
                "maskAsset",
                "occluderAsset",
                "extractionCrop",
                "applicability",
                "samples",
                "traversalOwnerIssue",
            },
            f"scene.route.portals[{index}]",
        )
        expected_incoming = zone_ids[index]
        expected_outgoing = zone_ids[index + 1]
        if portal["incomingZoneId"] != expected_incoming or portal["outgoingZoneId"] != expected_outgoing:
            raise ValueError("Portal transitions must connect adjacent route zones in canonical order")
        incoming_anchor = validate_point(portal["incomingAnchor"], f"scene.route.portals[{index}].incomingAnchor")
        outgoing_anchor = validate_point(portal["outgoingAnchor"], f"scene.route.portals[{index}].outgoingAnchor")
        if tuple(zone_by_id[expected_incoming]["visiblePolyline"][-1]) != incoming_anchor:
            raise ValueError("Portal incoming anchor must end its incoming visible zone")
        if tuple(zone_by_id[expected_outgoing]["visiblePolyline"][0]) != outgoing_anchor:
            raise ValueError("Portal outgoing anchor must begin its outgoing visible zone")
        x0, y0, x1, y1 = validate_rectangle(portal["bounds"], f"scene.route.portals[{index}].bounds")
        visible_bounds_value = portal["visibleMouthBounds"]
        visible_bounds = (
            None
            if visible_bounds_value is None
            else validate_rectangle(visible_bounds_value, f"scene.route.portals[{index}].visibleMouthBounds")
        )
        validate_rectangle(portal["extractionCrop"], f"scene.route.portals[{index}].extractionCrop")
        expected_sample_keys = [
            {"approach", "lastVisibleLip", "fullyHidden", "firstVisibleLip", "emerged"},
            {"approach", "lastVisibleLip", "partiallyOccluded", "firstVisibleMouth", "mouthCenter", "emerged"},
        ][index]
        samples = _assert_strict_v2(
            portal["samples"], expected_sample_keys, f"scene.route.portals[{index}].samples"
        )
        for sample_name, sample in samples.items():
            validate_point(sample, f"scene.route.portals[{index}].samples.{sample_name}")
        if portal["maskAsset"] not in ids or portal["occluderAsset"] not in ids:
            raise ValueError("Portal mask/occluder assets are missing from the manifest")
        segments = portal["segments"]
        if not isinstance(segments, list) or not segments:
            raise ValueError("Portal transition must contain at least one registered segment")
        expected_segment_kinds = [["architecture-hidden"], ["architecture-hidden", "visible-floor-gate-mouth"]][index]
        if [segment.get("kind") if isinstance(segment, dict) else None for segment in segments] != expected_segment_kinds:
            raise ValueError("Portal segment kinds/order drifted")
        previous_end = incoming_anchor
        for segment_index, raw_segment in enumerate(segments):
            segment = _assert_strict_v2(raw_segment, {"kind", "from", "to"}, f"scene.route.portals[{index}].segments[{segment_index}]")
            segment_start = validate_point(segment["from"], f"scene.route.portals[{index}].segments[{segment_index}].from")
            segment_end = validate_point(segment["to"], f"scene.route.portals[{index}].segments[{segment_index}].to")
            if segment_start != previous_end:
                raise ValueError("Portal segments must form one continuous ordered transition")
            containing_bounds = (x0, y0, x1, y1) if segment["kind"] == "architecture-hidden" else visible_bounds
            if containing_bounds is None or not all(
                containing_bounds[0] <= x <= containing_bounds[2] and containing_bounds[1] <= y <= containing_bounds[3]
                for x, y in (segment_start, segment_end)
            ):
                raise ValueError("Portal segment points must lie inside their declared hidden/visible bounds")
            previous_end = segment_end
        if previous_end != outgoing_anchor:
            raise ValueError("Final portal segment must terminate at outgoing zone anchor")
        expected_visibility = ["architecture-hidden", "compound-hidden-visible-mouth"][index]
        expected_occlusion_mode = ["architecture-depth-transition", "compound-depth-transition"][index]
        if (
            portal["visibility"] != expected_visibility
            or portal["occlusionMode"] != expected_occlusion_mode
            or portal["traversalOwnerIssue"] != 273
        ):
            raise ValueError("Portal traversal/occlusion ownership drifted")
        portal_id = portal["id"]
        if not isinstance(portal_id, str) or portal_id in portal_ids:
            raise ValueError("Portal IDs must be unique strings")
        portal_ids.append(portal_id)
    if route["chokepointPortalIds"] != portal_ids:
        raise ValueError("The two gate portals must be the declared chokepoints")
    hud_rects = scene["safeAreas"]["hudOcclusionRects"]
    for x, y in (entrance_anchor, objective_anchor):
        if any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in hud_rects):
            raise ValueError("Route entrance or objective is hidden beneath HUD")

    foreground_path = package / "exports" / "occlusion" / "architecture-mask.png"
    with Image.open(foreground_path).convert("L") as foreground:
        foreground_alpha = assets["foreground-occluder"].getchannel("A")
        if foreground.size != foreground_alpha.size or foreground.tobytes() != foreground_alpha.tobytes():
            raise ValueError("Architecture mask does not match foreground occluder alpha")
        zone_bounds = [zone["bounds"] for zone in scene["occlusion"]["zones"]]
        zone_pixel_counts = [0 for _ in zone_bounds]
        for y in range(foreground.height):
            for x in range(foreground.width):
                if foreground.getpixel((x, y)) == 0:
                    continue
                containing_zones = [
                    index
                    for index, (x0, y0, x1, y1) in enumerate(zone_bounds)
                    if x0 <= x < x1 and y0 <= y < y1
                ]
                if len(containing_zones) != 1:
                    raise ValueError("Architecture mask pixels must belong to exactly one declared occlusion zone")
                zone_pixel_counts[containing_zones[0]] += 1
        if any(count == 0 for count in zone_pixel_counts):
            raise ValueError("Every declared occlusion zone must contain architecture mask pixels")

    clean = assets["shuttergate-clean-plate-1280x720"]
    expected_portal_layers = _portal_occlusion_v4(clean)
    portal_images: dict[str, tuple[Image.Image, Image.Image]] = {}
    for portal, key in zip(portals, ("upper", "lower"), strict=True):
        mask_path = package / "exports" / "occlusion" / f"portal-{key}-gate-mask.png"
        actual_mask = Image.open(mask_path).convert("L")
        actual_occluder = assets[f"portal-{key}-gate-occluder"]
        expected_mask, expected_occluder = expected_portal_layers[key]
        if actual_mask.tobytes() != expected_mask.tobytes():
            raise ValueError(f"Portal mask pixels drifted: {key}")
        if actual_occluder.tobytes() != expected_occluder.tobytes():
            raise ValueError(f"Portal occluder pixels drifted: {key}")
        if actual_occluder.getchannel("A").tobytes() != actual_mask.tobytes():
            raise ValueError(f"Portal occluder alpha does not byte-match its mask: {key}")
        clean_pixels = clean.load()
        occluder_pixels = actual_occluder.load()
        for y in range(FRAME[1]):
            for x in range(FRAME[0]):
                pixel = occluder_pixels[x, y]
                if pixel[3] == 0:
                    if pixel[:3] != (0, 0, 0):
                        raise ValueError(f"Portal occluder has RGB under zero alpha: {key}")
                elif pixel[:3] != clean_pixels[x, y][:3]:
                    raise ValueError(f"Portal occluder contains non-source architecture pixels: {key}")
        no_op = clean.copy()
        no_op.alpha_composite(actual_occluder)
        if no_op.tobytes() != clean.tobytes():
            raise ValueError(f"Portal occluder is not a clean-plate pixel no-op: {key}")
        portal_images[key] = (actual_mask, actual_occluder)

    def portal_coverage(asset: str, pivot: tuple[int, int], ground: tuple[int, int], mask_image: Image.Image) -> tuple[int, int]:
        alpha = assets[asset].getchannel("A")
        offset = (ground[0] - pivot[0], ground[1] - pivot[1])
        visible = 0
        covered = 0
        for y in range(alpha.height):
            for x in range(alpha.width):
                if alpha.getpixel((x, y)) == 0:
                    continue
                visible += 1
                if mask_image.getpixel((offset[0] + x, offset[1] + y)) != 0:
                    covered += 1
        return covered, visible

    upper_hidden = tuple(portals[0]["samples"]["fullyHidden"])
    upper_edges = [
        tuple(portals[0]["samples"]["lastVisibleLip"]),
        tuple(portals[0]["samples"]["firstVisibleLip"]),
    ]
    lower_edges = [
        tuple(portals[1]["samples"]["lastVisibleLip"]),
        tuple(portals[1]["samples"]["partiallyOccluded"]),
    ]
    lower_partial = tuple(portals[1]["samples"]["partiallyOccluded"])
    for asset, pivot in (("iron-warden-idle", (56, 66)), ("mine-raider-idle", (40, 54))):
        covered, visible = portal_coverage(asset, pivot, upper_hidden, portal_images["upper"][0])
        if covered != visible:
            raise ValueError(f"Upper portal midpoint must wholly hide {asset}")
        for edge in upper_edges:
            covered, total = portal_coverage(asset, pivot, edge, portal_images["upper"][0])
            if covered * 20 < total or covered * 20 > total * 19:
                raise ValueError(f"Upper portal onset/reappearance must visibly split {asset} alpha")
        covered, visible = portal_coverage(asset, pivot, lower_partial, portal_images["lower"][0])
        if covered == 0 or covered >= visible:
            raise ValueError(f"Lower lintel must partially, not wholly, hide {asset}")
        for edge in lower_edges:
            covered, total = portal_coverage(asset, pivot, edge, portal_images["lower"][0])
            if covered == 0 or covered >= total:
                raise ValueError(f"Lower portal boundary sample must preserve hidden and visible {asset} alpha")
    lower_mask = portal_images["lower"][0]
    mouth_points = [tuple(point) for point in scene["occlusion"]["portalPolicy"]["lowerVisibleMouth"]]
    for start, end in zip(mouth_points, mouth_points[1:]):
        distance = max(abs(end[0] - start[0]), abs(end[1] - start[1]))
        for step in range(distance + 1):
            x = round(start[0] + (end[0] - start[0]) * step / distance)
            y = round(start[1] + (end[1] - start[1]) * step / distance)
            if any(
                lower_mask.getpixel((px, py)) != 0
                for py in range(max(0, y - 3), min(FRAME[1], y + 4))
                for px in range(max(0, x - 5), min(FRAME[0], x + 6))
            ):
                raise ValueError("Lower visible mouth or emerged ground footprint intersects hidden-mask alpha")

    states = _assert_strict_v2(scene["entityStates"], {"iron-warden-idle", "iron-warden-shield-slam", "mine-raider-idle", "mine-raider-attack"}, "scene.entityStates")
    canonical_entity_alpha = {
        "iron-warden-idle": ([24, 10, 88, 66], 2354, 573, 1781),
        "iron-warden-shield-slam": ([14, 10, 98, 66], 3113, 800, 2313),
        "mine-raider-idle": ([14, 10, 66, 54], 1341, 108, 1233),
        "mine-raider-attack": ([27, 10, 53, 54], 705, 36, 669),
    }
    for asset, contract in states.items():
        _assert_strict_v2(contract, {"canvas", "pivot", "facing", "nominalHeight"}, f"scene.entityStates.{asset}")
        image = assets[asset]
        if list(image.size) != contract["canvas"]:
            raise ValueError(f"Entity canvas drifted: {asset}")
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        if bbox is None or bbox[3] != contract["pivot"][1]:
            raise ValueError(f"Entity ground pivot is not alpha-aligned: {asset}")
        histogram = alpha.histogram()
        profile = ([*bbox], sum(histogram[1:]), histogram[255], sum(histogram[1:255]))
        if profile != canonical_entity_alpha[asset]:
            raise ValueError(f"Entity alpha separation drifted: {asset}")
    anchors = scene["entityAnchors"]
    expected_entities = {
        "mine-raider-attack": (anchors["mineRaiderTruthScreen"], states["mine-raider-attack"]),
        "iron-warden-shield-slam": (anchors["ironWardenTruthScreen"], states["iron-warden-shield-slam"]),
    }
    layers = recipe["layersBackToFront"]
    canonical_layer_specs = [
        ("shuttergate-clean-plate-1280x720", [0, 0], "world", 0, None),
        ("warden-selection-ring", [627, 414], "world-effects", 20, None),
        ("hostile-faction-ring", [763, 380], "world-effects", 20, None),
        ("mine-raider-attack", [762, 344], "world-entities", 30, 398),
        ("iron-warden-shield-slam", [618, 368], "world-entities", 30, 434),
        ("foreground-occluder", [0, 0], "foreground-occlusion", 40, None),
        ("warm-light-overlay", [0, 0], "world-lighting", 50, None),
        ("top-hud-frame", [0, 0], "screen-space-hud", 70, None),
        ("bottom-hud-frame", [0, 0], "screen-space-hud", 70, None),
        ("fortress-value", [18, 10], "screen-space-hud", 71, None),
        ("wave-value", [526, 10], "screen-space-hud", 71, None),
        ("ore-value", [1022, 10], "screen-space-hud", 71, None),
        ("warden-name", [272, 604], "screen-space-hud", 71, None),
        ("health-value", [462, 604], "screen-space-hud", 71, None),
        ("target-nearest-state", [662, 604], "screen-space-hud", 71, None),
        ("shield-slam-ready-state", [862, 604], "screen-space-hud", 71, None),
        ("pause-state", [1112, 604], "screen-space-hud", 71, None),
        ("warden-portrait", [282, 614], "screen-space-hud", 72, None),
    ]
    canonical_layers = []
    for asset, position, region, z_order, depth_sort_y in canonical_layer_specs:
        layer = {"asset": asset, "position": position, "region": region, "zOrder": z_order}
        if depth_sort_y is not None:
            layer["depthSortY"] = depth_sort_y
        canonical_layers.append(layer)
    if layers != canonical_layers:
        raise ValueError("Reconstruction layers are incomplete, duplicated, or noncanonical")
    for index, layer in enumerate(layers):
        expected = {"asset", "position", "region", "zOrder"}
        if layer.get("region") == "world-entities":
            expected.add("depthSortY")
        _assert_strict_v2(layer, expected, f"reconstruction.layer[{index}]")
        if layer["asset"] not in assets:
            raise ValueError(f"Unknown reconstruction asset: {layer['asset']}")
        manifest_record = next(record for record in manifest["files"] if record["id"] == layer["asset"])
        if layer["region"] not in manifest_record["contributesTo"]:
            raise ValueError(f"Reconstruction region violates manifest semantics: {layer['asset']}")
    ordered_layers = _ordered_layers_v2(recipe)
    if layers != ordered_layers:
        raise ValueError("Reconstruction layers are not stored in canonical depth order")
    entity_layers = [layer for layer in layers if layer["region"] == "world-entities"]
    if [layer["asset"] for layer in entity_layers] != ["mine-raider-attack", "iron-warden-shield-slam"]:
        raise ValueError("Reconstruction must contain exactly one required Warden and hostile layer")
    ring_layers = [layer["asset"] for layer in layers if layer["region"] == "world-effects"]
    if ring_layers != ["warden-selection-ring", "hostile-faction-ring"]:
        raise ValueError("Neutral reconstruction must contain exactly the two faction rings")
    if [layer["depthSortY"] for layer in entity_layers] != sorted(layer["depthSortY"] for layer in entity_layers):
        raise ValueError("Entities are not canonically depth sorted")
    for layer in entity_layers:
        anchor, state = expected_entities[layer["asset"]]
        expected_position = [anchor["groundPosition"][0] - state["pivot"][0], anchor["groundPosition"][1] - state["pivot"][1]]
        if layer["position"] != expected_position or layer["depthSortY"] != anchor["depthSortY"]:
            raise ValueError("Entity recipe does not bind pivot/depth anchors")
    if "shield-slam-impact" in {layer["asset"] for layer in layers}:
        raise ValueError("Neutral count reconstruction may not obscure the hostile with impact art")
    expected_proofs = {
        "entitiesRemoved": "docs/visual-evidence/production-scene/reconstruction-entities-removed.png",
        "individualRemoval": "docs/visual-evidence/production-scene/entity-removal-grid.png",
        "environmentOnly": "docs/visual-evidence/production-scene/clean-plate.png",
        "hudControls": "docs/visual-evidence/production-scene/hud-control-isolation.png",
        "hudMutation": "docs/visual-evidence/production-scene/hud-state-mutation.png",
        "foreground": "docs/visual-evidence/production-scene/foreground-occlusion-isolation.png",
        "occlusionDepth": "docs/visual-evidence/production-scene/occlusion-depth-proof.png",
        "lighting": "docs/visual-evidence/production-scene/lighting-alpha-isolation.png",
        "lightingEntities": "docs/visual-evidence/production-scene/lighting-entity-proof.png",
        "route": "docs/visual-evidence/production-scene/route-anchor-validation.png",
        "portalUpperTransition": "docs/visual-evidence/production-scene/portal-upper-gate-transition.png",
        "portalLowerTransition": "docs/visual-evidence/production-scene/portal-lower-gate-transition.png",
        "portalIsolation": "docs/visual-evidence/production-scene/portal-mask-isolation.png",
        "portalDepth": "docs/visual-evidence/production-scene/portal-ring-effect-depth.png",
        "portalLowerMouth": "docs/visual-evidence/production-scene/portal-lower-mouth-exclusion.png",
        "alignment": "docs/visual-evidence/production-scene/entity-state-alignment.png",
        "impact": "docs/visual-evidence/production-scene/shield-slam-effect-proof.png",
    }
    if recipe["isolationProofs"] != expected_proofs or not all((root / path).is_file() for path in expected_proofs.values()):
        raise ValueError("Isolation proof paths are incomplete or noncanonical")
    require_same_pixels(_compose_v2(recipe, assets), root / recipe["output"], "Neutral reconstruction")
    entity_assets = {"iron-warden-shield-slam", "mine-raider-attack"}
    ring_assets = {"warden-selection-ring", "hostile-faction-ring"}
    no_entities = _compose_v2(_recipe_without_v2(recipe, entity_assets | ring_assets), assets)
    warden_only = _compose_v2(_recipe_without_v2(recipe, {"mine-raider-attack", "hostile-faction-ring"}), assets)
    hostile_only = _compose_v2(_recipe_without_v2(recipe, {"iron-warden-shield-slam", "warden-selection-ring"}), assets)
    require_same_pixels(no_entities, root / expected_proofs["entitiesRemoved"], "Entity-removal reconstruction")
    clean_digest = hashlib.sha256(assets["shuttergate-clean-plate-1280x720"].convert("RGB").tobytes()).hexdigest()[:12].upper()
    require_same_pixels(
        _labelled_grid_v2(
            [
                (f"BOTH WORLD {clean_digest}", _compose_v2(recipe, assets)),
                (f"WARDEN ONLY WORLD {clean_digest}", warden_only),
                (f"HOSTILE ONLY WORLD {clean_digest}", hostile_only),
                (f"NEITHER WORLD {clean_digest}", no_entities),
            ]
        ),
        root / expected_proofs["individualRemoval"],
        "Individual-removal grid",
    )
    require_same_pixels(assets["shuttergate-clean-plate-1280x720"], root / expected_proofs["environmentOnly"], "Clean-plate proof")
    architecture_mask_image = Image.open(package / "exports" / "occlusion" / "architecture-mask.png").convert("L")
    require_same_pixels(
        occlusion_board(
            assets["shuttergate-clean-plate-1280x720"],
            architecture_mask_image,
            assets["foreground-occluder"],
        ),
        root / expected_proofs["foreground"],
        "Foreground-isolation proof",
    )
    expected_route_board = _route_board_v3(assets["shuttergate-clean-plate-1280x720"], scene["route"])
    require_same_pixels(
        expected_route_board,
        root / expected_proofs["route"],
        "Piecewise-route proof",
    )
    require_same_pixels(
        _route_registration_closeups_v3(expected_route_board),
        root / "docs/visual-evidence/production-scene/route-registration-closeups.png",
        "Route-registration closeup proof",
    )
    entity_images = {asset: assets[asset] for asset in scene["entityStates"]}
    upper_portal, lower_portal = scene["route"]["portals"]
    upper_phases = [
        ("approach", False),
        ("lastVisibleLip", True),
        ("fullyHidden", True),
        ("firstVisibleLip", True),
        ("emerged", False),
    ]
    lower_phases = [
        ("approach", False),
        ("lastVisibleLip", True),
        ("partiallyOccluded", True),
        ("firstVisibleMouth", False),
        ("emerged", False),
    ]
    require_same_pixels(
        _portal_player_filmstrip_v5(
            clean,
            entity_images,
            {"warden-selection-ring": assets["warden-selection-ring"], "hostile-faction-ring": assets["hostile-faction-ring"]},
            upper_portal,
            portal_images["upper"][1],
            upper_phases,
        ),
        root / expected_proofs["portalUpperTransition"],
        "Upper-portal transition proof",
    )
    require_same_pixels(
        _portal_player_filmstrip_v5(
            clean,
            entity_images,
            {"warden-selection-ring": assets["warden-selection-ring"], "hostile-faction-ring": assets["hostile-faction-ring"]},
            lower_portal,
            portal_images["lower"][1],
            lower_phases,
        ),
        root / expected_proofs["portalLowerTransition"],
        "Lower-portal transition proof",
    )
    require_same_pixels(
        _portal_mask_isolation_board_v5(clean, [upper_portal, lower_portal], portal_images),
        root / expected_proofs["portalIsolation"],
        "Portal-mask isolation proof",
    )
    require_same_pixels(
        _portal_boundary_diagnostics_v5(
            clean,
            entity_images,
            {"warden-selection-ring": assets["warden-selection-ring"], "hostile-faction-ring": assets["hostile-faction-ring"]},
            lower_portal,
            portal_images["lower"][0],
            portal_images["lower"][1],
            lower_phases,
        ),
        root / expected_proofs["portalDepth"],
        "Portal ring/effect depth proof",
    )
    require_same_pixels(
        _portal_boundary_diagnostics_v5(
            clean,
            entity_images,
            {"warden-selection-ring": assets["warden-selection-ring"], "hostile-faction-ring": assets["hostile-faction-ring"]},
            upper_portal,
            portal_images["upper"][0],
            portal_images["upper"][1],
            upper_phases,
        ),
        root / "docs/visual-evidence/production-scene/portal-upper-boundary-diagnostics.png",
        "Upper portal boundary diagnostics",
    )
    require_same_pixels(
        _lower_mouth_exclusion_board_v5(
            clean,
            portal_images["lower"][0],
            lower_portal,
            entity_images,
            {"warden-selection-ring": assets["warden-selection-ring"], "hostile-faction-ring": assets["hostile-faction-ring"]},
        ),
        root / expected_proofs["portalLowerMouth"],
        "Lower visible-mouth exclusion proof",
    )
    require_same_pixels(_alignment_board_v2(entity_images), root / expected_proofs["alignment"], "Entity-alignment proof")
    require_same_pixels(assets["warm-light-overlay"], root / expected_proofs["lighting"], "Lighting-isolation proof")
    evidence_root = root / EVIDENCE.relative_to(ROOT)
    clean = assets["shuttergate-clean-plate-1280x720"]
    require_same_pixels(composite(clean, [(assets["foreground-occluder"], (0, 0)), (assets["warm-light-overlay"], (0, 0))]), evidence_root / "environment-and-presentation-lighting.png", "Environment-lighting proof")
    require_same_pixels(isolation_board([assets["iron-warden-idle"], assets["iron-warden-shield-slam"]], 1), evidence_root / "iron-warden-alpha-states-native.png", "Native Warden alpha proof")
    require_same_pixels(isolation_board([assets["iron-warden-idle"], assets["iron-warden-shield-slam"]], 4), evidence_root / "iron-warden-alpha-states-4x.png", "4x Warden alpha proof")
    require_same_pixels(isolation_board([assets["mine-raider-idle"], assets["mine-raider-attack"]], 1), evidence_root / "mine-raider-alpha-states-native.png", "Native mine-raider alpha proof")
    require_same_pixels(isolation_board([assets["mine-raider-idle"], assets["mine-raider-attack"]], 4), evidence_root / "mine-raider-alpha-states-4x.png", "4x mine-raider alpha proof")
    require_same_pixels(isolation_board([assets["warden-selection-ring"], assets["hostile-faction-ring"], assets["shield-slam-impact"]], 2), evidence_root / "selection-and-combat-effect-isolation.png", "Effect-isolation proof")
    reconstruction = _compose_v2(recipe, assets)
    require_same_pixels(
        _scale_board_v2(
            clean,
            reconstruction,
            entity_images,
            {
                "warden-selection-ring": assets["warden-selection-ring"],
                "hostile-faction-ring": assets["hostile-faction-ring"],
            },
        ),
        evidence_root / "character-scale-study.png",
        "Character-scale proof",
    )
    approved = Image.open(root / DIRECTION.relative_to(ROOT) / "exports" / "shuttergate-keyframe-1280x720.png").convert("RGBA")
    comparison = Image.new("RGBA", (2560, 720), (0, 0, 0, 255))
    comparison.alpha_composite(approved, (0, 0))
    comparison.alpha_composite(reconstruction, (1280, 0))
    require_same_pixels(comparison, evidence_root / "approved-keyframe-vs-reconstruction.png", "Approved-keyframe comparison")
    require_same_pixels(_composition_decision_v2(approved, reconstruction), evidence_root / "composition-decision.png", "Composition-decision proof")
    require_same_pixels(
        _impact_board_v2(reconstruction, assets["shield-slam-impact"]),
        root / expected_proofs["impact"],
        "Shield-Slam impact proof",
    )
    impact_alpha = assets["shield-slam-impact"].getchannel("A")
    impact_position = (690, 370)
    for layer in entity_layers:
        entity_alpha = assets[layer["asset"]].getchannel("A")
        visible = 0
        overlapped = 0
        for y in range(entity_alpha.height):
            for x in range(entity_alpha.width):
                if entity_alpha.getpixel((x, y)) == 0:
                    continue
                visible += 1
                impact_x = layer["position"][0] + x - impact_position[0]
                impact_y = layer["position"][1] + y - impact_position[1]
                if (
                    0 <= impact_x < impact_alpha.width
                    and 0 <= impact_y < impact_alpha.height
                    and impact_alpha.getpixel((impact_x, impact_y)) != 0
                ):
                    overlapped += 1
        if overlapped == 0 or overlapped * 4 >= visible:
            raise ValueError(
                f"Shield-Slam contact must touch but preserve the silhouette of {layer['asset']}"
            )

    hud = scene["hudDynamicState"]
    _assert_strict_v2(hud, {"font", "textColor", "baselinePolicy", "fixture", "minimumVariants"}, "scene.hudDynamicState")
    _assert_strict_v2(hud["fixture"], {"fortress", "wave", "ore", "health", "targetPolicy", "shieldSlam", "paused"}, "scene.hudDynamicState.fixture")
    _assert_strict_v2(hud["minimumVariants"], {"targetPolicy", "shieldSlam", "pause"}, "scene.hudDynamicState.minimumVariants")
    required_hud_assets = {"target-nearest-state", "target-strongest-state", "shield-slam-ready-state", "shield-slam-cooldown-state", "pause-state", "resume-state"}
    if not required_hud_assets.issubset(ids):
        raise ValueError("Minimum mutable HUD state assets are incomplete")
    alternate_assets = {
        **assets,
        "target-nearest-state": assets["target-strongest-state"],
        "shield-slam-ready-state": assets["shield-slam-cooldown-state"],
        "pause-state": assets["resume-state"],
    }
    base_pixels = _compose_v2(recipe, assets).convert("RGB")
    alternate_pixels = _compose_v2(recipe, alternate_assets).convert("RGB")
    mutable_regions = [
        scene["hudRegions"]["targetPolicy"],
        scene["hudRegions"]["shieldSlam"],
        scene["hudRegions"]["pause"],
    ]
    changed = 0
    for y in range(FRAME[1]):
        for x in range(FRAME[0]):
            if base_pixels.getpixel((x, y)) == alternate_pixels.getpixel((x, y)):
                continue
            changed += 1
            if not any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in mutable_regions):
                raise ValueError("HUD mutation changed environment or immutable HUD pixels")
    if changed == 0:
        raise ValueError("HUD mutation proof does not change control state pixels")
    hud_board = Image.new("RGBA", FRAME, (7, 13, 22, 255))
    for layer in layers:
        if layer["region"] == "screen-space-hud":
            hud_board.alpha_composite(assets[layer["asset"]], tuple(layer["position"]))
    require_same_pixels(hud_board, root / expected_proofs["hudControls"], "HUD-isolation proof")
    hud_mutation = _hud_mutation_board_v2(
        base_pixels.convert("RGBA"), alternate_pixels.convert("RGBA")
    )
    require_same_pixels(hud_mutation, root / expected_proofs["hudMutation"], "HUD-mutation proof")
    lighting_proof = _lighting_board_v2(
        clean,
        assets["iron-warden-idle"],
        (56, 66),
        assets["warm-light-overlay"],
    )
    require_same_pixels(lighting_proof, root / expected_proofs["lightingEntities"], "Entity-lighting proof")
    occlusion_samples = [
        ("iron-warden-idle", (140, 170), (56, 66)),
        ("mine-raider-idle", (1080, 540), (40, 54)),
    ]
    occlusion_panels = []
    for asset, ground, pivot in occlusion_samples:
        alpha = assets[asset].getchannel("A")
        visible_pixels = 0
        occluded_pixels = 0
        offset = (ground[0] - pivot[0], ground[1] - pivot[1])
        for y in range(alpha.height):
            for x in range(alpha.width):
                if alpha.getpixel((x, y)) == 0:
                    continue
                visible_pixels += 1
                if architecture_mask_image.getpixel((offset[0] + x, offset[1] + y)) != 0:
                    occluded_pixels += 1
        if occluded_pixels * 4 <= visible_pixels or occluded_pixels * 4 >= visible_pixels * 3:
            raise ValueError(f"Occlusion proof must visibly mask part, but not all, of {asset}")
        occlusion_panels.append(
            _occlusion_sample_v2(clean, assets[asset], ground, pivot, assets["foreground-occluder"])
        )
    occlusion_proof = _labelled_grid_v2(
        [
            ("UPPER COLUMN BEHIND", occlusion_panels[0]),
            ("TRUTH ANCHORS CLEAR", _compose_v2(recipe, assets)),
            ("LOWER BALUSTRADE BEHIND", occlusion_panels[1]),
            ("PORTAL TRAVERSAL OWNED BY 273", _route_board_v3(clean, scene["route"])),
        ]
    )
    require_same_pixels(occlusion_proof, root / expected_proofs["occlusionDepth"], "Occlusion-depth proof")
    if scene["lighting"] != {"asset": "warm-light-overlay", "blendMode": "normal", "colorSpace": "sRGB", "alpha": "straight", "affects": ["environment", "entities", "foreground"], "excludes": ["combat-effects", "hud"]}:
        raise ValueError("Lighting blend/order semantics drifted")

    provenance = json.loads((metadata / "provenance.json").read_text(encoding="utf-8"))
    _assert_strict_v2(provenance, {"schemaVersion", "package", "license", "toolchain", "inputs", "cleanPlate", "derivedLayers", "conceptBoundary"}, "provenance")
    if provenance["schemaVersion"] != 2 or provenance["toolchain"] != {"python": "3.13.5", "pillow": "12.3.0", "zlib": "1.3.1", "lockfile": "assets/game-art/production-scene/requirements.lock"}:
        raise ValueError("Pinned image toolchain contract drifted")
    if provenance["package"] != "dwarven-depths-issue-286-production-scene":
        raise ValueError("Provenance package ID is not canonical")
    if PILLOW_VERSION != provenance["toolchain"]["pillow"]:
        raise ValueError(f"Pillow {provenance['toolchain']['pillow']} is required, got {PILLOW_VERSION}")
    actual_python = ".".join(str(component) for component in sys.version_info[:3])
    if actual_python != provenance["toolchain"]["python"]:
        raise ValueError(
            f"Python {provenance['toolchain']['python']} is required, got {actual_python}"
        )
    if (
        zlib.ZLIB_VERSION != provenance["toolchain"]["zlib"]
        or zlib.ZLIB_RUNTIME_VERSION != provenance["toolchain"]["zlib"]
    ):
        raise ValueError(
            f"zlib {provenance['toolchain']['zlib']} is required, got "
            f"compile={zlib.ZLIB_VERSION} runtime={zlib.ZLIB_RUNTIME_VERSION}"
        )
    _assert_strict_v2(provenance["license"], {"identifier", "path", "copyright"}, "provenance.license")
    _assert_strict_v2(provenance["toolchain"], {"python", "pillow", "zlib", "lockfile"}, "provenance.toolchain")
    _assert_strict_v2(provenance["cleanPlate"], {"path", "sha256", "generator", "reference", "referenceUse"}, "provenance.cleanPlate")
    _assert_strict_v2(provenance["cleanPlate"]["generator"], {"provider", "model", "quality", "aspectRatio", "inputImageCount"}, "provenance.cleanPlate.generator")
    _assert_strict_v2(provenance["derivedLayers"], {"characterSources", "method", "effectsHudMasks", "externalAssets"}, "provenance.derivedLayers")
    _assert_strict_v2(provenance["conceptBoundary"], {"path", "productionPixelReuse", "tracing", "backgroundUse"}, "provenance.conceptBoundary")
    require_exact_json(provenance["license"], {"identifier": "MIT", "path": "LICENSE", "copyright": "Copyright (c) 2026 Will Palmer"}, "provenance.license")
    require_exact_json(provenance["cleanPlate"]["generator"], {"provider": "openai-codex", "model": "gpt-image-2-medium", "quality": "medium", "aspectRatio": "landscape", "inputImageCount": 1}, "provenance.cleanPlate.generator")
    if provenance["cleanPlate"]["path"] != "assets/game-art/production-scene/sources/shuttergate-clean-plate-master.png" or provenance["cleanPlate"]["reference"] != "assets/game-art/visual-direction/sources/keyframe-master.png":
        raise ValueError("Clean-plate source or reference path is not canonical")
    if provenance["cleanPlate"]["referenceUse"] != "Approved style, camera, route, material, lighting, and Shuttergate composition only; no reference pixels were cropped, traced, copied, or edited into the clean plate.":
        raise ValueError("Clean-plate reference-use boundary is not canonical")
    require_exact_json(provenance["derivedLayers"], {"characterSources": ["assets/game-art/visual-direction/sources/iron-warden-master.png", "assets/game-art/visual-direction/sources/mine-raider-master.png"], "method": "Pinned deterministic crop, graded-navy alpha extraction, connected-fragment rejection, direct-from-master LANCZOS downsampling, bounded unsharp filtering, shared pivot-canvas padding, and PNG export in build_scene.py", "effectsHudMasks": "Original project-authored deterministic Pillow layers using the approved palette and presentation contract; portal occluders are clean-plate source-pixel-exact extractions with segment-local masks", "externalAssets": []}, "provenance.derivedLayers")
    require_exact_json(provenance["conceptBoundary"], {"path": "assets/concept-art/dwarven-depths-gameplay-mockup.png", "productionPixelReuse": False, "tracing": False, "backgroundUse": False}, "provenance.conceptBoundary")
    required_inputs = {
        "assets/game-art/visual-direction/sources/keyframe-master.png",
        "assets/game-art/visual-direction/sources/iron-warden-master.png",
        "assets/game-art/visual-direction/sources/mine-raider-master.png",
        "assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png",
        "assets/concept-art/dwarven-depths-gameplay-mockup.png",
        "assets/game-art/production-scene/generation-log.md",
        "assets/game-art/production-scene/requirements.lock",
        "assets/game-art/production-scene/build_scene.py",
    }
    if {record.get("path") for record in provenance["inputs"] if isinstance(record, dict)} != required_inputs:
        raise ValueError("Pinned provenance input set is incomplete or noncanonical")
    expected_roles = {
        "assets/game-art/visual-direction/sources/keyframe-master.png": "approved-style-camera-route-reference",
        "assets/game-art/visual-direction/sources/iron-warden-master.png": "approved-character-master",
        "assets/game-art/visual-direction/sources/mine-raider-master.png": "approved-character-master",
        "assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png": "approved-keyframe-comparison",
        "assets/concept-art/dwarven-depths-gameplay-mockup.png": "concept-boundary-reference-only",
        "assets/game-art/production-scene/generation-log.md": "prompt-settings-generation-record",
        "assets/game-art/production-scene/requirements.lock": "pinned-image-toolchain",
        "assets/game-art/production-scene/build_scene.py": "deterministic-export-and-verification-implementation",
    }
    canonical_upstream_digests = {
        "assets/game-art/visual-direction/sources/keyframe-master.png": "a5796a58bfee230eb882cf99a2517db8ffc90f0c243c73ee110ae408d896ddae",
        "assets/game-art/visual-direction/sources/iron-warden-master.png": "2b566af41592a606a7a702d83af40b0445b665f83ff5ccc3b009ee6b132b5938",
        "assets/game-art/visual-direction/sources/mine-raider-master.png": "4c3c0a9c63a510f5bb76e6136423e87da0e6f74108a35514c08d35493229cb32",
        "assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png": "49a659a61548ac12bc546d5af5c74e990eb8a3d6bc55ac46dee153d458a991e5",
        "assets/concept-art/dwarven-depths-gameplay-mockup.png": "7b35bf139017bf833c8d0c9288fa05f702b5e6c971f48d66dd40931d1c31e9c1",
        "assets/game-art/production-scene/generation-log.md": "0312f702c92d43f3d9377e08c6c832c7a5258759458bb02a61a2d863ae80a696",
        "assets/game-art/production-scene/requirements.lock": "18101d853dbd634248566915697e60f350fbf8afc9abb57998c9e1b1cf61ecf4",
    }
    if {record["path"]: record["role"] for record in provenance["inputs"]} != expected_roles:
        raise ValueError("Provenance input roles are not canonical")
    expected_input_order = list(expected_roles.items())
    actual_input_order = [(record["path"], record["role"]) for record in provenance["inputs"]]
    if actual_input_order != expected_input_order:
        raise ValueError("Provenance inputs are duplicated, reordered, or noncanonical")
    for input_record in provenance["inputs"]:
        _assert_strict_v2(input_record, {"path", "sha256", "role"}, "provenance.input")
        if sha256(root / input_record["path"]) != input_record["sha256"]:
            raise ValueError(f"Upstream provenance digest mismatch: {input_record['path']}")
        canonical_digest = canonical_upstream_digests.get(input_record["path"])
        if canonical_digest is not None and input_record["sha256"] != canonical_digest:
            raise ValueError(f"Approved upstream source drifted: {input_record['path']}")
    clean_source = root / provenance["cleanPlate"]["path"]
    canonical_clean_digest = "724159cedd1ad5a53e8954a8990093da01b093348d247fd8cb04702f8ad88117"
    if provenance["cleanPlate"]["sha256"] != canonical_clean_digest or sha256(clean_source) != canonical_clean_digest:
        raise ValueError("Clean-plate source digest does not match canonical provenance")
    require_same_pixels(cover_16_9(Image.open(clean_source)), package / "exports" / "environment" / "shuttergate-clean-plate-1280x720.png", "Clean-plate source export")
    if any(provenance["conceptBoundary"][key] for key in ("productionPixelReuse", "tracing", "backgroundUse")):
        raise ValueError("Concept raster may not contribute production pixels")


def reproducibility_check() -> None:
    with tempfile.TemporaryDirectory(prefix="dd-production-scene-") as directory:
        temp_root = Path(directory)
        temp_package = temp_root / PACKAGE.relative_to(ROOT)
        temp_direction = temp_root / DIRECTION.relative_to(ROOT)
        shutil.copytree(SOURCES, temp_package / "sources")
        (temp_direction / "sources").mkdir(parents=True)
        (temp_direction / "exports").mkdir(parents=True)
        (temp_package / "metadata").mkdir(parents=True)
        for name in ("scene-contract.json", "reconstruction.json", "provenance.json"):
            shutil.copy2(METADATA / name, temp_package / "metadata" / name)
        provenance = json.loads((METADATA / "provenance.json").read_text(encoding="utf-8"))
        for input_record in provenance["inputs"]:
            source = ROOT / input_record["path"]
            destination = temp_root / input_record["path"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        build(temp_root)
        verify(temp_root)
        expected = json.loads((METADATA / "layer-manifest.json").read_text(encoding="utf-8"))
        actual = json.loads((temp_root / METADATA.relative_to(ROOT) / "layer-manifest.json").read_text(encoding="utf-8"))
        if expected != actual:
            raise ValueError("Pinned deterministic rebuild drifted from committed layer manifest")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--reproducible", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        build()
        verify()
    if args.reproducible:
        reproducibility_check()
    print(json.dumps({"ok": True, "verified": True, "reproducible": args.reproducible}))


if __name__ == "__main__":
    main()
