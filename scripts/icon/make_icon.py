"""Renders the Atlas legacy launcher PNGs, splash and About logo (adaptive icons use the vectors). Geometry is in the 108-unit adaptive-icon grid and
matches the vector drawables in res/drawable/ic_launcher_*.xml."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw

RES = sys.argv[1]           # android/app/src/main/res  (run: python3 scripts/icon/make_icon.py android/app/src/main/res src/assets)
ASSETS = sys.argv[2]        # src/assets
SS = 4                      # supersampling

BG_A = (0x0B, 0x12, 0x20)   # top-left
BG_B = (0x23, 0x2E, 0x6B)   # bottom-right
LIGHT = (0xFF, 0xC8, 0x6B)  # left facet
DARK = (0xF0, 0x8A, 0x24)   # right facet
SPARK = (0xFF, 0xF4, 0xDC)

# 108-unit grid
PEAK, BL, BR, NOTCH = (54, 30), (34, 77), (74, 77), (54, 66.5)
SPARK_C, SPARK_R = (72, 35), 6


def gradient(size):
    y, x = np.mgrid[0:size, 0:size] / max(size - 1, 1)
    t = (x + y) / 2
    img = np.zeros((size, size, 4), np.uint8)
    for i in range(3):
        img[..., i] = (BG_A[i] + (BG_B[i] - BG_A[i]) * t).astype(np.uint8)
    img[..., 3] = 255
    return Image.fromarray(img, 'RGBA')


def sparkle(c, r):
    cx, cy = c
    k = r * 0.22  # waist of the 4-point star
    return [(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
            (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)]


def draw_mark(img, scale, offset=(0, 0), mono=None):
    d = ImageDraw.Draw(img)
    p = lambda pt: (offset[0] + pt[0] * scale, offset[1] + pt[1] * scale)
    d.polygon([p(PEAK), p(BL), p(NOTCH)], fill=mono or LIGHT)
    d.polygon([p(PEAK), p(BR), p(NOTCH)], fill=mono or DARK)
    d.polygon([p(q) for q in sparkle(SPARK_C, SPARK_R)], fill=mono or SPARK)


def full_icon(px, shape):
    """Legacy icon: the 108 grid's middle 72 units fill the bitmap (like the launcher's mask)."""
    big = px * SS
    scale = big / 72.0
    img = gradient(big)
    draw_mark(img, scale, offset=(-18 * scale, -18 * scale))
    mask = Image.new('L', (big, big), 0)
    md = ImageDraw.Draw(mask)
    if shape == 'circle':
        md.ellipse([0, 0, big - 1, big - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
    img.putalpha(mask)
    return img.resize((px, px), Image.LANCZOS)


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in DENSITIES.items():
    out = os.path.join(RES, f'mipmap-{name}')
    full_icon(int(48 * f), 'square').save(os.path.join(out, 'ic_launcher.png'))
    full_icon(int(48 * f), 'circle').save(os.path.join(out, 'ic_launcher_round.png'))

# Splash: the mark on the dark gradient tile, and the in-app logo (About screen).
full_icon(192, 'square').save(os.path.join(RES, 'drawable', 'splash_logo.png'))
full_icon(512, 'square').save(os.path.join(ASSETS, 'logo.png'))
print('ok')
