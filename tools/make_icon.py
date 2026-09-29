#!/usr/bin/env python3
"""Render the JobDesk app icon (assets/JobDesk.png + assets/JobDesk.icns).

Pure Pillow, no macOS tools, so the icon can be regenerated anywhere:

    python3 -m pip install pillow
    python3 tools/make_icon.py

Layout follows the macOS icon grid: an 824x824 rounded body centred on a
1024x1024 canvas, leaving room for the system's drop shadow.
"""

import io
import os
import struct

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")

S = 1024  # master canvas
BODY = (100, 100, 924, 924)
RADIUS = 186

TOP = (16, 42, 84)  # deep navy
BOTTOM = (18, 112, 120)  # teal
INK = (255, 255, 255)
SPARK = (255, 184, 48)  # amber


def gradient(size, top, bottom):
    img = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / (size[1] - 1)
        img.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img.resize(size)


def body_mask():
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(BODY, RADIUS, fill=255)
    return mask


def spark(draw, cx, cy, r, fill):
    # Four-point sparkle: two thin diamonds crossed.
    w = r * 0.28
    draw.polygon([(cx, cy - r), (cx + w, cy), (cx, cy + r), (cx - w, cy)], fill=fill)
    draw.polygon([(cx - r, cy), (cx, cy - w), (cx + r, cy), (cx, cy + w)], fill=fill)


def render():
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Soft shadow under the body.
    shadow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((100, 118, 924, 942), RADIUS, fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.paste((0, 0, 0, 255), (0, 0), shadow)

    # Gradient body.
    canvas.paste(gradient((S, S), TOP, BOTTOM), (0, 0), body_mask())

    # Subtle top highlight for depth: a soft fade, clipped to the body.
    fade = Image.new("L", (1, S), 0)
    for y in range(S):
        fade.putpixel((0, y), max(0, round(34 * (1 - (y - 100) / 420))) if y >= 100 else 0)
    fade = fade.resize((S, S))
    hl = Image.composite(fade, Image.new("L", (S, S), 0), body_mask())
    canvas.paste((255, 255, 255, 255), (0, 0), hl)

    d = ImageDraw.Draw(canvas)

    # Briefcase: handle, body, clasp band.
    cx = S // 2
    case = (cx - 250, 430, cx + 250, 760)
    handle_outer = (cx - 105, 330, cx + 105, 470)
    handle_inner = (cx - 62, 372, cx + 62, 470)
    d.rounded_rectangle(handle_outer, 44, fill=INK)
    d.rounded_rectangle(handle_inner, 22, fill=(0, 0, 0, 0))
    # Re-fill the inner cut-out with the body gradient so it reads as a hole.
    hole = Image.new("L", (S, S), 0)
    ImageDraw.Draw(hole).rounded_rectangle(handle_inner, 22, fill=255)
    canvas.paste(gradient((S, S), TOP, BOTTOM), (0, 0), hole)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle(case, 54, fill=INK)
    band_y = 560
    d.rectangle((case[0], band_y - 9, case[2], band_y + 9), fill=(34, 86, 112))
    d.rounded_rectangle((cx - 44, band_y - 34, cx + 44, band_y + 34), 16, fill=(34, 86, 112))
    d.rounded_rectangle((cx - 26, band_y - 17, cx + 26, band_y + 17), 9, fill=INK)

    # AI sparkle, top right.
    spark(d, 742, 300, 92, SPARK)
    spark(d, 820, 408, 38, SPARK)

    return canvas


def icns(master):
    # (type, pixel size). PNG payloads are valid for every type listed here on
    # macOS 10.7+, so no legacy RLE/mask chunks are needed.
    entries = [
        (b"icp4", 16), (b"icp5", 32), (b"icp6", 64),
        (b"ic07", 128), (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024),
        (b"ic11", 32), (b"ic12", 64), (b"ic13", 256), (b"ic14", 512),
    ]
    chunks = []
    for kind, px in entries:
        buf = io.BytesIO()
        master.resize((px, px), Image.LANCZOS).save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        chunks.append(kind + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(chunks)
    return b"icns" + struct.pack(">I", len(body) + 8) + body


def main():
    os.makedirs(ASSETS, exist_ok=True)
    master = render()
    master.save(os.path.join(ASSETS, "JobDesk.png"), optimize=True)
    with open(os.path.join(ASSETS, "JobDesk.icns"), "wb") as fh:
        fh.write(icns(master))
    print("wrote assets/JobDesk.png and assets/JobDesk.icns")


if __name__ == "__main__":
    main()
