from pathlib import Path
import struct

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.bin"
OUTPUT = ROOT / "assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.png"
MAGIC = b"DDDEPTH\0"
EXPECTED_HEADER = (1, 1280, 720, 0)


def main() -> None:
    source = SOURCE.read_bytes()
    if source[:8] != MAGIC:
        raise ValueError("invalid static depth magic")
    header = struct.unpack_from("<HHHH", source, 8)
    if header != EXPECTED_HEADER:
        raise ValueError(f"unsupported static depth header: {header!r}")
    _, width, height, _ = header
    codes = memoryview(source)[16:]
    if len(codes) != width * height * 2:
        raise ValueError("invalid static depth payload length")

    rgba = bytearray(width * height * 4)
    rgba[0::4] = codes[0::2]
    rgba[1::4] = codes[1::2]
    rgba[3::4] = b"\xff" * (width * height)
    image = Image.frombytes("RGBA", (width, height), bytes(rgba))
    image.save(OUTPUT, optimize=True, compress_level=9)


if __name__ == "__main__":
    main()
