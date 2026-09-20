"""Réduit des photos de recettes en place : largeur max 960 px, JPEG qualité 82.

Usage : python tools/resize_image.py images/xxx.jpg [images/yyy.jpg ...]
Sans argument, traite toutes les images de images/ plus larges que 960 px.
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

MAX_WIDTH = 960
QUALITY = 82


def resize(path: Path) -> None:
    before = path.stat().st_size
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if im.width > MAX_WIDTH:
            im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
        im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        size = im.size
    print(f"{path.name}: {size[0]}x{size[1]}, {before // 1024} Ko -> {path.stat().st_size // 1024} Ko")


def main() -> None:
    args = [Path(a) for a in sys.argv[1:]]
    if not args:
        for p in sorted(Path("images").glob("*.jpg")):
            with Image.open(p) as im:
                if im.width > MAX_WIDTH:
                    args.append(p)
    for p in args:
        resize(p)


if __name__ == "__main__":
    main()
