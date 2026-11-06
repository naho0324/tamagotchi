#!/usr/bin/env python3
"""Author the custom base body (hair=base, outfit=base) for x1/x2/x3.

x2 and x3 are the same pixels as x1 with only the eyes repainted.
Skin is natural peach. Other outfit sprites stay mint and still recolor.
"""
import math
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')

# Palette. Peach skin sits in a tight band (h 12-36, s>=0.50, l 0.68-0.96)
# so hair, blush, pink clothes, white collar and outlines are never recolored.
OUT = (58, 34, 28, 255)       # #3a221c
HAIR_D = (74, 42, 32, 255)     # #4a2a20 strand / shadow
HAIR = (122, 74, 52, 255)     # #7a4a34
HAIR_L = (176, 122, 84, 255)  # #b07a54
HAIR_S = (206, 164, 120, 255) # #cea478 crown shine
SKIN_L = (255, 227, 208, 255) # #ffe3d0
SKIN = (255, 201, 168, 255)   # #ffc9a8
SKIN_S = (248, 176, 144, 255) # #f8b090
SKIN_D = (242, 168, 130, 255) # #f2a882
BLUSH = (255, 176, 188, 255)  # #ffb0bc
MOUTH = (224, 96, 112, 255)   # #e06070
MOUTH_D = (176, 64, 80, 255)  # #b04050
TONGUE = (255, 150, 160, 255) # #ff96a0
# Neutral clothes: butter shirt, lilac shorts, cream collar, chunky sneakers.
# Hues stay outside the peach and mint skin bands.
SHIRT_L = (252, 232, 176, 255)
SHIRT = (243, 212, 138, 255)
SHIRT_S = (224, 184, 96, 255)
SHORTS_L = (196, 176, 214, 255)
SHORTS = (168, 146, 190, 255)
SHORTS_D = (140, 118, 164, 255)
COLLAR = (244, 239, 232, 255)
SHOE = (255, 255, 255, 255)
SHOE_D = (92, 70, 56, 255)
SHOE_L = (232, 160, 176, 255)
WHITE = (255, 255, 255, 255)
EYE = (54, 32, 26, 255)       # #36201a
EYE_L = (122, 72, 52, 255)    # #7a4834 iris glow, too dark/dull to be skin
PINK_O = (176, 72, 88, 255)

SKIN_COLORS = {SKIN, SKIN_L, SKIN_S, SKIN_D}


def rgb_hsl(r, g, b):
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0, 0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60, s, l


def is_peach_band(c):
    h, s, l = rgb_hsl(c[0], c[1], c[2])
    return 14 <= h <= 30 and s >= 0.78 and 0.70 <= l < 0.955


class Spr:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.c = [[None] * w for _ in range(h)]
        self.r = [[None] * w for _ in range(h)]

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def plot(self, x, y, color, region):
        x, y = int(x), int(y)
        if self.inside(x, y):
            self.c[y][x] = color
            self.r[y][x] = region

    def stamp(self, pts, color, region, outline=True, over=None):
        """over: set of regions this paint may replace. None means anything."""
        pts = {(int(x), int(y)) for x, y in pts if self.inside(x, y)}
        if over is not None:
            pts = {(x, y) for x, y in pts if self.r[y][x] in over}
        if outline:
            border = []
            for x, y in pts:
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if self.inside(nx, ny) and (nx, ny) not in pts:
                        border.append((nx, ny))
            for x, y in border:
                if over is None or self.r[y][x] in over:
                    self.plot(x, y, OUT, 'line')
        for x, y in pts:
            self.plot(x, y, color, region)

    def ellipse(self, cx, cy, rx, ry, color, region, outline=True, fluff=0, over=None, y0=None):
        if rx < 1 or ry < 1:
            return
        pts = []
        for y in range(int(cy - ry - 3), int(cy + ry + 4)):
            for x in range(int(cx - rx - 3), int(cx + rx + 4)):
                if y0 is not None and y < y0:
                    continue
                dx, dy = x - cx, y - cy
                ang = math.atan2(dy, dx if dx or dy else 1)
                bump = 1 + fluff * math.sin(ang * 6 + 0.4)
                if (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= bump * bump:
                    pts.append((x, y))
        self.stamp(pts, color, region, outline, over)

    def bell(self, cx, top, height, top_rx, bot_rx, color, region):
        pts = []
        for i in range(height):
            t = i / max(1, height - 1)
            curve = t * t * (3 - 2 * t)
            rx = top_rx + (bot_rx - top_rx) * curve
            y = top + i
            inset = 0
            if i < 3:
                inset = 3 - i
            if i > height - 4:
                inset = max(inset, i - (height - 4))
            for x in range(int(cx - rx + inset), int(cx + rx - inset) + 1):
                pts.append((x, y))
        self.stamp(pts, color, region, True)

    def shade(self, region, fn):
        for y in range(self.h):
            for x in range(self.w):
                if self.r[y][x] == region and self.c[y][x] != OUT:
                    col = fn(x, y, self.c[y][x])
                    if col:
                        self.c[y][x] = col

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        px = im.load()
        for y in range(self.h):
            for x in range(self.w):
                if self.c[y][x]:
                    px[x, y] = self.c[y][x]
        return im


def z(v, k):
    return int(round(v * k))


def blit(s, cx, cy, rows, color_of, region, over=None):
    """Center a small pixel pattern. '.' is skipped."""
    h, w = len(rows), max(len(r) for r in rows)
    y0 = int(round(cy - (h - 1) / 2))
    x0 = int(round(cx - (w - 1) / 2))
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            col = color_of(ch)
            if col:
                x, y = x0 + i, y0 + j
                if s.inside(x, y) and (over is None or s.r[y][x] in over):
                    s.plot(x, y, col, region)


# Equal-width rows so the pattern stays centered. o outline, K iris, W highlight, L lower glow.
EYE_BIG = [
    '....ooooooo....',
    '...oKKKKKKKKo...',
    '..oKKWWWWKKKKo..',
    '.oKKWWWWWWKKKKo.',
    '.oKKWWWWWWKKKKo.',
    '.oKKKWWWWKKKKKo.',
    '.oKKKKKKKKKKKKo.',
    '.oKKKKKKKwwKKKo.',
    '.oKKKKKKKKKKKKo.',
    '.oKKKKLLLKKKKKo.',
    '..oKKKLLLKKKKo..',
    '...oKKKKKKKKo...',
    '....ooooooooo...',
]
EYE_SM = [
    '..oooooo..',
    '.oKWWWKKo.',
    'oKKWWWWKKo',
    'oKKKKKKKKo',
    'oKKKKwwKKo',
    'oKKLLLKKKo',
    '.oKKKKKKo.',
    '..oooooo..',
]
# 웃는눈: thick happy arch, peak in the middle
SMILE_BIG = [
    'oo........oo',
    'ooo......ooo',
    '.ooo....ooo.',
    '..oooooooo..',
    '...oooooo...',
]
SMILE_SM = [
    'o......o',
    'oo....oo',
    '.oooooo.',
    '..oooo..',
]
DOT_BIG = [
    '..oooo..',
    '.oKWWKo.',
    'oKKKKKKo',
    'oKKKKKKo',
    '.oKKKKo.',
    '..oooo..',
]
DOT_SM = [
    '.ooo.',
    'oKWKo',
    'oKKKo',
    '.ooo.',
]
MOUTH_BIG = [
    '...oooo...',
    '..oMMMMo..',
    '.oMMMMMMo.',
    '.oMMTTTMo.',
    '..oMMMMo..',
    '...oooo...',
]
MOUTH_SM = [
    '.ooo.',
    'oMMMo',
    'oMTMo',
    '.ooo.',
]
BTN = [
    '.oo.',
    'oWWo',
    'oWWo',
    '.oo.',
]


def eye_colors(ch):
    return {'o': OUT, 'K': EYE, 'W': WHITE, 'w': WHITE, 'L': EYE_L}.get(ch)


def mouth_colors(ch):
    return {'o': MOUTH_D, 'M': MOUTH, 'T': TONGUE}.get(ch)


def btn_colors(ch):
    return {'o': OUT, 'W': WHITE}.get(ch)


def draw_eyes(s, lx, ly, rx, ry, big, kind):
    pat = {
        'x1': EYE_BIG if big else EYE_SM,
        'x2': SMILE_BIG if big else SMILE_SM,
        'x3': DOT_BIG if big else DOT_SM,
    }[kind]
    blit(s, lx, ly, pat, eye_colors, 'eye', over={'skin', 'blush', 'line', 'eye', None})
    blit(s, rx, ry, pat, eye_colors, 'eye', over={'skin', 'blush', 'line', 'eye', None})


def ellipse_pts(cx, cy, rx, ry):
    rx, ry = max(1, rx), max(1, ry)
    pts = []
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx, dy = x - cx, y - cy
            if (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1:
                pts.append((x, y))
    return pts


def stroke(s, pts, color):
    for a, b in zip(pts, pts[1:]):
        x0, y0 = a
        x1, y1 = b
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x = int(round(x0 + (x1 - x0) * i / n))
            y = int(round(y0 + (y1 - y0) * i / n))
            if s.inside(x, y) and s.r[y][x] == 'hair' and s.c[y][x] != OUT:
                s.plot(x, y, color, 'hair')


def shade_hair_columns(s, cx):
    """Light on the upper left of each lock, dark along the underside. Follows the silhouette."""
    cols = {}
    for y in range(s.h):
        for x in range(s.w):
            if s.r[y][x] == 'hair' and s.c[y][x] != OUT:
                cols.setdefault(x, []).append(y)
    for x, ys in cols.items():
        y0, y1 = min(ys), max(ys)
        span = max(1, y1 - y0)
        for y in ys:
            t = (y - y0) / span
        # light across the top of every lock, extra shine on the left; dark only on the underside
        if t < 0.20:
            s.c[y][x] = HAIR_S if t < 0.08 and x < cx else HAIR_L
        elif t > 0.76:
            s.c[y][x] = HAIR_D


def build(H, kind):
    """Shared neutral base. Design space is 116 tall; adult uses that, child is the same proportions smaller."""
    k = H / 116
    big = H >= 100
    s = Spr(z(108, k) + 8, H + 8)
    ox, oy = 4, 2

    def P(x, y):
        return ox + z(x, k), oy + z(y, k)

    def ep(x, y, rx, ry):
        return ellipse_pts(*P(x, y), max(1, z(rx, k)), max(1, z(ry, k)))

    # chunky sneakers, then a short bit of leg, then shorts and a simple collared shirt
    for sx in (-12, 12):
        x, y = P(50 + sx, 108)
        s.ellipse(x, y, max(4, z(8, k)), max(3, z(5, k)), SHOE, 'shoe')
        s.ellipse(x, y + z(2, k), max(3, z(7, k)), max(1, z(2, k)), SHOE_D, 'shoe', outline=False, over={'shoe', 'line'})
        s.ellipse(x - z(2, k), y - z(1, k), max(2, z(3, k)), max(1, z(2, k)), SHOE_L, 'shoe', outline=False, over={'shoe'})
        s.plot(x - z(3, k), y - z(1, k), WHITE, 'shoe')
    for sx in (-12, 12):
        x, y = P(50 + sx, 102)
        s.ellipse(x, y, max(2, z(4, k)), max(3, z(5, k)), SKIN, 'skin')

    dtop_x, dtop = P(50, 92)
    s.bell(dtop_x, dtop, max(8, z(16, k)), max(8, z(15, k)), max(9, z(17, k)), SHORTS, 'shorts')
    s.shade('shorts', lambda x, y, col: SHORTS_D if y > dtop + z(10, k) else (SHORTS_L if x < dtop_x - z(4, k) and y < dtop + z(6, k) else None))

    stop_x, stop = P(50, 70)
    s.bell(stop_x, stop, max(12, z(26, k)), max(10, z(16, k)), max(12, z(19, k)), SHIRT, 'shirt')
    s.shade('shirt', lambda x, y, col: SHIRT_L if y < stop + z(8, k) and x < stop_x else (SHIRT_S if y > stop + z(18, k) else None))

    for sx, side in ((-18, -1), (18, 1)):
        x, y = P(50 + sx, 78)
        s.ellipse(x, y, max(3, z(6, k)), max(3, z(4, k)), SHIRT, 'shirt', over={None, 'shirt', 'shorts', 'line', 'shoe'})
        hx, hy = P(50 + sx + side * 4, 82)
        s.ellipse(hx, hy, max(3, z(4, k)), max(3, z(4, k)), SKIN, 'skin')

    cx, cy = P(50, 72)
    s.ellipse(cx, cy, z(13, k), z(6, k), COLLAR, 'collar', over={'shirt', 'line', None}, y0=cy - 1)
    for byi in (82, 90):
        blit(s, *P(50, byi), BTN, btn_colors, 'button', over={'shirt', 'line', 'button'})

    # fluffy basic hair: one mass with side volume, not a smooth circle and not pigtails
    hair = []
    hair += ep(50, 34, 34, 28)
    hair += ep(24, 40, 13, 15)
    hair += ep(76, 40, 13, 15)
    hair += ep(30, 48, 10, 12)
    hair += ep(70, 48, 10, 12)
    hair += ep(36, 16, 12, 9)
    hair += ep(50, 12, 14, 8)
    hair += ep(64, 16, 12, 9)
    s.stamp(hair, HAIR, 'hair', outline=True)
    shade_hair_columns(s, P(50, 0)[0])
    # a few dark strands so the hair reads as locks
    for strand in (
        [(28, 20), (24, 32), (22, 44)],
        [(42, 16), (38, 28), (36, 38)],
        [(58, 16), (62, 28), (64, 38)],
        [(74, 20), (78, 32), (80, 44)],
    ):
        stroke(s, [P(x, y) for x, y in strand], HAIR_D)

    fx, fy = P(50, 46)
    frx, fry = z(24, k), z(22, k)
    s.ellipse(fx, fy, frx, fry, SKIN, 'skin')
    s.shade('skin', lambda x, y, col: SKIN_L if (y - fy) < -fry * 0.4 and (x - fx) < 0 else (SKIN_S if (y - fy) > fry * 0.62 else None))

    # eyebrow-level bangs: separate short tufts, not a solid bar
    for bx, by, brx, bry in ((32, 33, 5, 6), (41, 34, 5, 7), (50, 33, 6, 6), (59, 34, 5, 7), (68, 33, 5, 6)):
        s.ellipse(*P(bx, by), max(2, z(brx, k)), max(3, z(bry, k)), HAIR, 'hair', outline=False, over={'skin', 'line', 'hair', None})
    for y in range(s.h - 1):
        for x in range(s.w):
            if s.r[y][x] == 'hair' and s.r[y + 1][x] == 'skin':
                s.plot(x, y, OUT, 'line')
            # side of the face: hair touching skin sideways also gets a line
            if s.r[y][x] == 'hair' and s.inside(x + 1, y) and s.r[y][x + 1] == 'skin':
                s.plot(x, y, OUT, 'line')
            if s.r[y][x] == 'hair' and s.inside(x - 1, y) and s.r[y][x - 1] == 'skin':
                s.plot(x, y, OUT, 'line')

    blush = ['..ppppp..', '.ppppppp.', '..ppppp..'] if big else ['.pppp.', 'pppppp', '.pppp.']
    for sx in (-18, 18):
        blit(s, *P(50 + sx, 56), blush, lambda ch: BLUSH if ch == 'p' else None, 'blush', over={'skin'})

    blit(s, *P(50, 62), MOUTH_BIG if big else MOUTH_SM, mouth_colors, 'mouth', over={'skin', 'line', 'blush', 'mouth'})
    draw_eyes(s, *P(50 - 13, 46), *P(50 + 13, 46), big, kind)
    return s


def assert_bands(im, label):
    bad_skin = set()
    stolen = set()
    for y in range(im.height):
        for x in range(im.width):
            c = im.getpixel((x, y))
            if c[3] < 200:
                continue
            band = is_peach_band(c)
            if c in SKIN_COLORS and not band:
                bad_skin.add(c[:3])
            if band and c not in SKIN_COLORS:
                stolen.add(c[:3])
    if bad_skin or stolen:
        raise SystemExit(f'{label} recolor band mismatch skin-miss={bad_skin} stolen={stolen}')


def scaled(fig):
    big = fig.resize((fig.width * 2, fig.height * 2), Image.NEAREST)
    return big.crop(big.getbbox())


def place(fig, stage):
    """Fit the figure into the 200x260 outfit canvas, feet at y=256."""
    big = scaled(fig)
    band_top = 16 if stage == 'adult' else 106
    band_h = 256 - band_top
    if big.height > band_h or big.width > 196:
        raise SystemExit(f'{stage} sprite {big.size} does not fit band {band_h}')
    canvas = Image.new('RGBA', (200, 260), (0, 0, 0, 0))
    x = (200 - big.width) // 2
    y = 256 - big.height
    canvas.paste(big, (x, y), big)
    return canvas


def tight(fig):
    return scaled(fig)


def main():
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))
    for kind in ('x1', 'x2', 'x3'):
        for stage, H in (('child', 74), ('adult', 116)):
            spr = build(H, kind)
            logical = spr.image()
            assert_bands(logical, f'{kind}/{stage}')
            scaled(logical).resize((scaled(logical).width * 3, scaled(logical).height * 3), Image.NEAREST).save(f'/tmp/base_{kind}_{stage}.png')
            outfit = place(logical, stage)
            # feet check
            bbox = outfit.getbbox()
            if bbox[3] > 256 or bbox[3] < 250:
                raise SystemExit(f'{kind}/{stage} feet at {bbox[3]}, want ~256, bbox={bbox}')
            if stage == 'child' and bbox[1] < 106:
                raise SystemExit(f'{kind}/{stage} starts at y={bbox[1]}, child band is y>=106')
            if stage == 'adult' and bbox[1] < 8:
                raise SystemExit(f'{kind}/{stage} starts at y={bbox[1]}')
            out_path = f'public/assets/outfits/{kind}/{stage}/base_base.png'
            outfit.save(out_path)
            pet = tight(logical)
            pet_path = f'public/assets/pets/{kind}/{stage}.png'
            pet.save(pet_path)
            print(kind, stage, 'outfit', outfit.size, 'bbox', bbox, 'pet', pet.size)
    print('base body written')


if __name__ == '__main__':
    main()
