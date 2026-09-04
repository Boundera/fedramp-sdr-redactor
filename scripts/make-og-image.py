#!/usr/bin/env python3
"""Draw web/public/og-image.png, the preview card shown when the page is shared.

Run by hand when the design changes; the result is committed, so nothing in
CI depends on Python:

    pip install pillow fonttools brotli
    python3 scripts/make-og-image.py

Type is set in the repository's own Inter (SIL Open Font License 1.1), the
same face the page uses, converted from the vendored woff2 in memory.
"""
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
WOFF2 = ROOT / "web" / "src" / "fonts" / "inter-latin-wght-normal.woff2"
OUT = ROOT / "web" / "public" / "og-image.png"

W, H = 1200, 630
BACKGROUND = (245, 247, 251)
INK = (20, 33, 61)
NAVY = (26, 68, 128)
MUTED = (94, 105, 130)
TEAL = (0, 188, 212)


def inter(weight: int, size: int) -> ImageFont.FreeTypeFont:
    """The variable font at one weight, as a Pillow font."""
    face = TTFont(WOFF2)
    buffer = io.BytesIO()
    face.flavor = None  # decompress woff2 to plain TrueType
    face.save(buffer)
    buffer.seek(0)
    font = ImageFont.truetype(buffer, size)
    font.set_variation_by_axes([weight])
    return font


def main() -> None:
    image = Image.new("RGB", (W, H), BACKGROUND)
    draw = ImageDraw.Draw(image)

    # A teal hairline across the top, the page's accent.
    draw.rectangle([0, 0, W, 8], fill=TEAL)

    eyebrow = inter(600, 26)
    headline = inter(600, 82)
    body = inter(400, 32)
    mono = inter(500, 26)

    draw.text((80, 96), "FREE TOOL  ·  FEDRAMP 20x", font=eyebrow, fill=NAVY)

    # The headline, with the second sentence underlined as it is on the page.
    first, second = "Keep the claim.", "Redact the specifics."
    draw.text((80, 168), first, font=headline, fill=INK)
    y2 = 168 + 100
    draw.text((80, y2), second, font=headline, fill=INK)
    width = draw.textlength(second, font=headline)
    bar = y2 + 92
    draw.rectangle([80, bar, 80 + width, bar + 10], fill=TEAL)

    draw.text(
        (80, 420),
        "Redact a Security Decision Record so you can share it.",
        font=body,
        fill=MUTED,
    )
    draw.text(
        (80, 466),
        "Runs in your browser. Nothing leaves your machine.",
        font=body,
        fill=MUTED,
    )

    draw.text((80, 552), "tools.boundera.io/sdr-redactor", font=mono, fill=NAVY)

    # The wordmark, bottom right, so a shared card carries its source.
    wordmark = inter(700, 34)
    mark = "Boundera"
    draw.text(
        (W - 80 - draw.textlength(mark, font=wordmark), 544),
        mark,
        font=wordmark,
        fill=NAVY,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
