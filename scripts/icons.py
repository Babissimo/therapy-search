# /// script
# requires-python = ">=3.10"
# dependencies = ["cairosvg", "pillow"]
# ///
"""Draws the site's icon into public/ in the light theme's colours from src/index.css (see the README).

The mark is lucide's map-pin in the background colour on a primary tile, its centre in the highlight.
"""

import io
import math
import pathlib
import re

import cairosvg
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
PIN = "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"


def token(css: str, name: str) -> str:
    """A colour token's first, light-theme value, as hex. The dark theme's come later in the file."""
    match = re.search(rf"^\s*--{name}:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)", css, re.MULTILINE)
    if not match:
        raise SystemExit(f"--{name} is not an oklch() colour in src/index.css")
    return hex_of(*map(float, match.groups()))


def hex_of(lightness: float, chroma: float, hue: float) -> str:
    """OKLCH to sRGB hex, by Björn Ottosson's matrices."""
    a, b = chroma * math.cos(math.radians(hue)), chroma * math.sin(math.radians(hue))
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    linear = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    encode = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return "#" + "".join(f"{round(max(0.0, min(1.0, encode(c))) * 255):02x}" for c in linear)


def svg(colours: dict[str, str], height: float, corner: float) -> str:
    """The pin `height` units tall, centred in a 32 unit tile. It spans x 4..20 and y 2..22 of lucide's 24 unit box."""
    scale = height / 20
    shift = 16 - 12 * scale
    rx = f' rx="{corner:g}"' if corner else ""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<rect width="32" height="32"{rx} fill="{colours["primary"]}"/>'
        f'<g transform="translate({shift:g} {shift:g}) scale({scale:g})">'
        f'<path d="{PIN}" fill="{colours["background"]}"/><circle cx="12" cy="10" r="3" fill="{colours["highlight"]}"/>'
        "</g></svg>\n"
    )


def png(source: str, size: int) -> Image.Image:
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=source.encode(), output_width=size, output_height=size)))


def main() -> None:
    css = (ROOT / "src/index.css").read_text()
    colours = {name: token(css, name) for name in ("primary", "background", "highlight")}
    tab = svg(colours, height=24, corner=6)
    (PUBLIC / "icon.svg").write_text(tab)
    png(tab, 32).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32)], append_images=[png(tab, 16)])
    # Square, with room around the pin, since iOS rounds the corners itself.
    png(svg(colours, height=18, corner=0), 180).save(PUBLIC / "apple-touch-icon.png", optimize=True)


if __name__ == "__main__":
    main()
