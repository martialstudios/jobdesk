#!/usr/bin/env python3
"""Render assets/dmg/How to open JobDesk.png, the picture guide in JobDesk.dmg.

JobDesk.dmg isn't signed with an Apple Developer ID, so the first time it's
opened macOS blocks it until you click "Open Anyway" in System Settings. This
guide walks a non-technical person through that, once.

    python3 -m pip install pillow
    python3 tools/make_dmg_guide.py

Uses macOS's Helvetica Neue when present (falls back to Pillow's default font).
"""

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "dmg", "How to open JobDesk.png")
ICON = os.path.join(HERE, "..", "assets", "JobDesk.png")

W, H = 1400, 1900
NAVY = (16, 42, 84)
TEAL = (18, 112, 120)
AMBER = (255, 184, 48)
INK = (28, 32, 40)
MUTED = (96, 104, 118)
CARD = (246, 248, 251)
LINE = (220, 225, 232)
BLUE = (10, 122, 255)
WHITE = (255, 255, 255)


def font(size, bold=False):
    path = "/System/Library/Fonts/HelveticaNeue.ttc"
    if os.path.exists(path):
        # HelveticaNeue.ttc: index 0 regular, 1 bold.
        return ImageFont.truetype(path, size, index=1 if bold else 0)
    return ImageFont.load_default(size)


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split():
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def paragraph(draw, xy, text, fnt, fill, width, gap=10):
    x, y = xy
    for ln in wrap(draw, text, fnt, width):
        draw.text((x, y), ln, font=fnt, fill=fill)
        y += fnt.size + gap
    return y


def button(draw, xy, label, primary=False, size=26):
    fnt = font(size, bold=primary)
    x, y = xy
    w = draw.textlength(label, font=fnt) + 44
    h = size + 26
    draw.rounded_rectangle((x, y, x + w, y + h), radius=10,
                           fill=BLUE if primary else WHITE, outline=None if primary else LINE, width=2)
    draw.text((x + 22, y + 12), label, font=fnt, fill=WHITE if primary else INK)
    return x + w


def step(draw, img, n, top, title, body, mock):
    left = 80
    draw.rounded_rectangle((left, top, W - 80, top + 360), radius=28, fill=CARD, outline=LINE, width=2)
    cx, cy = left + 70, top + 70
    draw.ellipse((cx - 38, cy - 38, cx + 38, cy + 38), fill=TEAL)
    num = font(44, bold=True)
    draw.text((cx - draw.textlength(str(n), font=num) / 2, cy - 27), str(n), font=num, fill=WHITE)
    draw.text((left + 140, top + 40), title, font=font(40, bold=True), fill=INK)
    paragraph(draw, (left + 140, top + 104), body, font(28), MUTED, 560)
    mock(draw, img, (left + 740, top + 40, W - 120, top + 320))


def mock_drag(draw, img, box):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=18, fill=WHITE, outline=LINE, width=2)
    icon = Image.open(ICON).convert("RGBA").resize((150, 150))
    img.paste(icon, (x0 + 40, y0 + 50), icon)
    draw.text((x0 + 70, y0 + 210), "JobDesk", font=font(26), fill=INK)
    # arrow
    ay = y0 + 125
    draw.line((x0 + 215, ay, x1 - 200, ay), fill=AMBER, width=10)
    draw.polygon([(x1 - 200, ay - 26), (x1 - 160, ay), (x1 - 200, ay + 26)], fill=AMBER)
    # Applications folder
    fx = x1 - 150
    draw.rounded_rectangle((fx, y0 + 70, fx + 120, y0 + 170), radius=12, fill=(96, 170, 240))
    draw.rounded_rectangle((fx, y0 + 55, fx + 55, y0 + 80), radius=8, fill=(96, 170, 240))
    draw.text((fx - 20, y0 + 210), "Applications", font=font(26), fill=INK)


def mock_blocked(draw, img, box):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=18, fill=WHITE, outline=LINE, width=2)
    draw.text((x0 + 30, y0 + 28), "“JobDesk” Not Opened", font=font(28, bold=True), fill=INK)
    paragraph(draw, (x0 + 30, y0 + 74), "Apple could not verify “JobDesk” is free of malware…",
              font(22), MUTED, x1 - x0 - 60, gap=6)
    bx = button(draw, (x0 + 30, y1 - 80), "Move to Trash")
    button(draw, (bx + 20, y1 - 80), "Done", primary=True)
    draw.text((x0 + 30, y1 - 130), "Click Done (not Move to Trash)", font=font(22, bold=True), fill=TEAL)


def mock_settings(draw, img, box):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=18, fill=WHITE, outline=LINE, width=2)
    draw.text((x0 + 30, y0 + 26), "Privacy & Security", font=font(28, bold=True), fill=INK)
    draw.line((x0 + 30, y0 + 72, x1 - 30, y0 + 72), fill=LINE, width=2)
    draw.text((x0 + 30, y0 + 90), "Security", font=font(22, bold=True), fill=MUTED)
    paragraph(draw, (x0 + 30, y0 + 128), "“JobDesk” was blocked to protect your Mac.",
              font(24), INK, x1 - x0 - 60, gap=6)
    bx0 = x1 - 250
    button(draw, (bx0, y1 - 84), "Open Anyway", primary=True)
    draw.rounded_rectangle((bx0 - 10, y1 - 94, bx0 + 222, y1 - 18), radius=16, outline=AMBER, width=5)


def mock_ready(draw, img, box):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=18, fill=WHITE, outline=LINE, width=2)
    draw.text((x0 + 30, y0 + 28), "Setting up JobDesk…", font=font(28, bold=True), fill=INK)
    draw.rounded_rectangle((x0 + 30, y0 + 90, x1 - 30, y0 + 112), radius=11, fill=LINE)
    draw.rounded_rectangle((x0 + 30, y0 + 90, x0 + 30 + (x1 - x0 - 60) * 0.7, y0 + 112), radius=11, fill=BLUE)
    draw.text((x0 + 30, y0 + 130), "Only the first time. About a minute.", font=font(22), fill=MUTED)
    draw.text((x0 + 30, y0 + 190), "Then JobDesk opens in", font=font(24), fill=INK)
    draw.text((x0 + 30, y0 + 222), "your web browser.", font=font(24), fill=INK)


def main():
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    # header
    draw.rectangle((0, 0, W, 200), fill=NAVY)
    icon = Image.open(ICON).convert("RGBA").resize((130, 130))
    img.paste(icon, (80, 35), icon)
    draw.text((240, 50), "How to open JobDesk", font=font(60, bold=True), fill=WHITE)
    draw.text((242, 125), "The first time only. After that it opens like any other app.",
              font=font(30), fill=(200, 214, 235))

    top = 250
    step(draw, img, 1, top, "Move it to Applications",
         "In the JobDesk window, drag the JobDesk icon onto the Applications folder.", mock_drag)
    top += 400
    step(draw, img, 2, top, "Open it once",
         "Open JobDesk from Applications. macOS says it can't check the app, because it isn't from the "
         "App Store. Click Done.", mock_blocked)
    top += 400
    step(draw, img, 3, top, "Allow it",
         "Click the Apple menu (top left), then System Settings, then Privacy & Security. Scroll down, "
         "click Open Anyway, enter your Mac's password, and click Open Anyway again.", mock_settings)
    top += 400
    step(draw, img, 4, top, "You're in",
         "JobDesk sets itself up and opens in your browser. On the Home page, click “Set me up with the "
         "assistant” and tell it about the jobs you want.", mock_ready)

    foot = font(24)
    paragraph(draw, (80, H - 90), "JobDesk works with career-ops (github.com/career-ops-hq/career-ops). It isn't "
              "made by or affiliated with the career-ops project.", foot, MUTED, W - 160, gap=6)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
