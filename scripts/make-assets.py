# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.63.0", "brotli==1.2.0", "pillow==12.1.1"]
# ///
"""Regenerate the five local fonts, the social card and the favicon."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
import json
from fontTools import subset
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = PUBLIC / "assets"
UPSTREAM = "https://raw.githubusercontent.com/vercel/geist-font/7e42eff/"
SHAPES = ["Square", "Circle", "Grid", "Triangle", "Line"]
COPY = "Martin & Coming soon to a supply chain near you."

def fetch(path):
    with urlopen(UPSTREAM + path, timeout=30) as response:
        return response.read()

def font_asset(shape):
    original = fetch(f"fonts/GeistPixel/ttf/GeistPixel-{shape}.ttf")
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    font = TTFont(BytesIO(original), recalcTimestamp=False)
    sub = subset.Subsetter(options=options)
    sub.populate(text=COPY)
    sub.subset(font)
    font.flavor = "woff2"
    out = BytesIO()
    font.save(out)
    data = out.getvalue()
    name = f"geist-pixel-{shape.lower()}-{sha256(data).hexdigest()[:12]}.woff2"
    (ASSETS / name).write_bytes(data)
    return shape.lower(), "/assets/" + name, original

ASSETS.mkdir(exist_ok=True, parents=True)
with ThreadPoolExecutor() as pool:
    fonts = list(pool.map(font_asset, SHAPES))
manifest = {key: url for key, url, _ in fonts}
for asset in ASSETS.glob("geist-pixel-*.woff2"):
    if "/assets/" + asset.name not in manifest.values():
        asset.unlink()
(ROOT / "src/font-assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
(PUBLIC / "geist-OFL.txt").write_bytes(fetch("OFL.txt"))

original = fonts[0][2]
font = ImageFont.truetype(BytesIO(original), 242)
mask = Image.new("L", (1200, 630))
draw = ImageDraw.Draw(mask)
for word, y in zip(("Martin", "&", "Martin"), (119, 315, 511)):
    l, t, r, b = font.getbbox(word)
    draw.text((600 - (l + r) / 2, y - (t + b) / 2), word, fill=255,
              font=font)
card = Image.new("RGB", mask.size, "#0a0a0a")
for color, offset in zip(("#00ffff", "#ff00ff", "#ffff00"), ((-3, -1), (2, -2), (0, 3))):
    plate = Image.new("RGB", mask.size)
    plate.paste(color, (0, 0, *mask.size), ImageChops.offset(mask, *offset))
    card = ImageChops.screen(card, plate)
card.save(PUBLIC / "share.png", optimize=True)

icon = Image.new("L", (32, 32))
font = ImageFont.truetype(BytesIO(original), 35)
l, t, r, b = font.getbbox("&")
ImageDraw.Draw(icon).text((16 - (l + r) / 2, 16 - (t + b) / 2), "&", font=font, fill=255)
path = "".join(f"M{x} {y}h1v1h-1z" for y in range(32) for x in range(32)
               if icon.getpixel((x, y)) >= 128)
(PUBLIC / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<path fill="#0a0a0a" d="M0 0h32v32H0z"/>'
    f'<path fill="#fff" d="{path}"/></svg>\n')
