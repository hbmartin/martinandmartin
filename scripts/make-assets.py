# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.63.0", "brotli==1.2.0", "pillow==12.1.1"]
# ///
"""Regenerate the local Circle font, the social card and the favicon."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
import json
from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = PUBLIC / "assets"
UPSTREAM = "https://raw.githubusercontent.com/vercel/geist-font/7e42eff/"
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
key, url, original = font_asset("Circle")
manifest = {key: url}
for asset in ASSETS.glob("geist-pixel-*.woff2"):
    if "/assets/" + asset.name not in manifest.values():
        asset.unlink()
(ROOT / "src/font-assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
(PUBLIC / "geist-OFL.txt").write_bytes(fetch("OFL.txt"))

mask = Image.new("L", (1200, 630))
draw = ImageDraw.Draw(mask)
for word, y in zip(("Martin", "&", "Martin"), (119, 315, 511)):
    font = ImageFont.truetype(BytesIO(original), round(242 * (.9 if word == "&" else 1)))
    l, t, r, b = font.getbbox(word)
    draw.text((600 - (l + r) / 2, y - (t + b) / 2), word, fill=255,
              font=font)
card = Image.new("RGB", mask.size, "#0a0a0a")
for color, offset in zip(("#00ffff", "#ff00ff", "#ffff00"), ((-3, -1), (2, -2), (0, 3))):
    plate = Image.new("RGB", mask.size)
    plate.paste(color, (0, 0, *mask.size), ImageChops.offset(mask, *offset))
    card = ImageChops.screen(card, plate)
card.save(PUBLIC / "share.png", optimize=True)

# Extract the actual Circle outlines rather than tracing a thresholded bitmap.
# The same ink bounds, palette and offsets drive the SVG and raster fallback.
source = TTFont(BytesIO(original))
glyphs = source.getGlyphSet()
ampersand = glyphs[source.getBestCmap()[ord("&")]]
bounds = BoundsPen(glyphs)
ampersand.draw(bounds)
left, bottom, right, top = bounds.bounds
scale = 24 / max(right - left, top - bottom)
translate_x = 16 - (left + right) * scale / 2
translate_y = 16 + (bottom + top) * scale / 2
pen = SVGPathPen(glyphs, ntos=lambda n: f"{n:.3f}".rstrip("0").rstrip("."))
ampersand.draw(TransformPen(pen, (scale, 0, 0, -scale, translate_x, translate_y)))
layers = [("#00ffff", -.5, .15), ("#ff00ff", .5, -.25), ("#ffff00", .25, .5), ("#ffffff", 0, 0)]
uses = "".join(f'<use href="#ampersand" fill="{color}" transform="translate({x} {y})"/>'
               for color, x, y in layers)
(PUBLIC / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="6" fill="#0a0a0a"/>'
    f'<defs><path id="ampersand" d="{pen.getCommands()}"/></defs>{uses}</svg>\n')

# Supersampling retains smooth curves, fringes and rounded transparent corners
# in every ICO size, including browsers that display the 16-pixel fallback.
supersample = 16
size = 32 * supersample
icon = Image.new("RGBA", (size, size))
ImageDraw.Draw(icon).rounded_rectangle((0, 0, size - 1, size - 1), radius=6 * supersample, fill="#0a0a0a")
font = ImageFont.truetype(BytesIO(original), round(source["head"].unitsPerEm * scale * supersample))
l, t, r, b = font.getbbox("&", anchor="ls")
for color, x, y in layers:
    plate = Image.new("RGBA", icon.size)
    ImageDraw.Draw(plate).text((size / 2 - (l + r) / 2 + x * supersample,
                               size / 2 - (t + b) / 2 + y * supersample),
                              "&", font=font, anchor="ls", fill=color)
    icon = Image.alpha_composite(icon, plate)
icon.save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
