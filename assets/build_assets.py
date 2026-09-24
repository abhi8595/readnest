#!/usr/bin/env python3
"""ReadNest asset pipeline — regenerates every production asset from the master icon.

Input : assets/icon-master.png (AI-crafted master, any square size >= 1024)
Output: icon.png (1024) · adaptive-icon.png (1024, mask-safe) ·
        splash.png + splash-dark.png (1284x2778) · favicon.png (48)

Run:  python3 assets/build_assets.py
Requires: Pillow (pip install pillow)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import os

A = os.path.dirname(os.path.abspath(__file__))
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BRASS = (201, 164, 92)


def vgrad(w, h, top, bottom):
    small = Image.new('RGB', (1, h))
    px = small.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return small.resize((w, h))


def radial_glow(size, color, strength=0.35):
    s = 256
    m = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(m)
    for r in range(s // 2, 0, -1):
        t = (r / (s // 2)) ** 2
        d.ellipse([s // 2 - r, s // 2 - r, s // 2 + r, s // 2 + r], fill=int(255 * (1 - t)))
    m = m.filter(ImageFilter.GaussianBlur(6))
    m = m.point(lambda v: int(v * strength))
    spot = Image.new('RGB', (s, s), color)
    return spot.resize((size, size), Image.BICUBIC), m.resize((size, size), Image.BICUBIC)


def draw_spaced(draw, cx, y, text, font, fill, ls):
    widths = [draw.textlength(ch, font=font) for ch in text]
    x = cx - (sum(widths) + ls * (len(text) - 1)) / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + ls
    asc, desc = font.getmetrics()
    return y + asc + desc


def main():
    master = Image.open(os.path.join(A, 'icon-master.png')).convert('RGB')
    assert master.size[0] == master.size[1] and master.size[0] >= 1024, 'master must be square >= 1024'

    # ── 1. launcher icon 1024 ──
    icon1024 = master.resize((1024, 1024), Image.LANCZOS)
    icon1024.save(os.path.join(A, 'icon.png'))

    # ── 2. adaptive icon: regenerated radial bg + feathered 84% paste ──
    W = master.size[0]
    edge = master.getpixel((12, 12))
    glow = master.getpixel((W // 2, int(W * 0.14)))
    bg = Image.new('RGB', (128, 128), edge)
    d = ImageDraw.Draw(bg)
    maxr = 95
    for r in range(maxr, 0, -1):
        t = (r / maxr) ** 1.7
        col = tuple(int(glow[i] + (edge[i] - glow[i]) * t) for i in range(3))
        d.ellipse([64 - r, 64 - r, 64 + r, 64 + r], fill=col)
    bg = bg.resize((1024, 1024), Image.BICUBIC)
    fg = master.resize((860, 860), Image.LANCZOS)
    m = Image.new('L', (860, 860), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 859, 859], radius=140, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(30))
    bg.paste(fg, (82, 82), m)
    bg.save(os.path.join(A, 'adaptive-icon.png'))

    # ── 3. splash screens ──
    def splash(path, bg_top, bg_bottom, ink, muted, glow_color):
        W2, H2 = 1284, 2778
        canvas = vgrad(W2, H2, bg_top, bg_bottom)
        spot, sm = radial_glow(1000, glow_color, 0.5 if sum(bg_top) < 382 else 0.35)
        canvas.paste(spot, (W2 // 2 - 500, 1150 - 500), sm)
        # icon with soft shadow
        ISZ, IR = 480, 118
        im = master.resize((ISZ, ISZ), Image.LANCZOS)
        mk = Image.new('L', (ISZ, ISZ), 0)
        ImageDraw.Draw(mk).rounded_rectangle([0, 0, ISZ - 1, ISZ - 1], radius=IR, fill=255)
        icon = Image.new('RGBA', (ISZ, ISZ), (0, 0, 0, 0))
        icon.paste(im, (0, 0), mk)
        sh = Image.new('RGBA', (ISZ + 160, ISZ + 200), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([80, 90, 80 + ISZ, 90 + ISZ], radius=IR, fill=(0, 0, 0, 100))
        sh = sh.filter(ImageFilter.GaussianBlur(42))
        rgba = canvas.convert('RGBA')
        rgba.alpha_composite(sh, (W2 // 2 - ISZ // 2 - 80, 1150 - ISZ // 2 - 80))
        rgba.alpha_composite(icon, (W2 // 2 - ISZ // 2, 1150 - ISZ // 2))
        canvas = rgba.convert('RGB')
        d2 = ImageDraw.Draw(canvas)
        y = draw_spaced(d2, W2 // 2, 1150 + ISZ // 2 + 66, 'ReadNest',
                        ImageFont.truetype(SERIF, 118), ink, 2)
        y += 46
        d2.line([W2 // 2 - 72, y, W2 // 2 + 72, y], fill=BRASS, width=4)
        draw_spaced(d2, W2 // 2, y + 36, 'A QUIET HOME FOR BOOKS',
                    ImageFont.truetype(SANS, 35), muted, 15)
        canvas.save(path, quality=95)

    splash(os.path.join(A, 'splash.png'),
           bg_top=(251, 247, 240), bg_bottom=(238, 229, 214),
           ink=(30, 27, 22), muted=(138, 129, 117), glow_color=(255, 252, 244))
    splash(os.path.join(A, 'splash-dark.png'),
           bg_top=(28, 26, 23), bg_bottom=(14, 12, 10),
           ink=(243, 237, 226), muted=(154, 144, 129), glow_color=(120, 70, 25))

    # ── 4. favicon 48 ──
    fav = master.resize((48, 48), Image.LANCZOS)
    fav = ImageEnhance.Sharpness(fav).enhance(1.5)
    fav.save(os.path.join(A, 'favicon.png'))

    print('assets built:')
    for f in ['icon.png', 'adaptive-icon.png', 'splash.png', 'splash-dark.png', 'favicon.png']:
        p = os.path.join(A, f)
        im = Image.open(p)
        print(f'  {f}: {im.size[0]}x{im.size[1]} ({os.path.getsize(p)//1024} KB)')


if __name__ == '__main__':
    main()
