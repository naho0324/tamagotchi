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
HAIR_D = (90, 52, 38, 255)    # #5a3426
HAIR = (122, 74, 52, 255)     # #7a4a34
HAIR_L = (166, 114, 80, 255)  # #a67250
HAIR_S = (196, 152, 112, 255) # #c49870
SKIN_L = (255, 227, 208, 255) # #ffe3d0
SKIN = (255, 201, 168, 255)   # #ffc9a8
SKIN_S = (248, 176, 144, 255) # #f8b090
SKIN_D = (242, 168, 130, 255) # #f2a882
BLUSH = (255, 176, 188, 255)  # #ffb0bc
MOUTH = (224, 96, 112, 255)   # #e06070
MOUTH_D = (176, 64, 80, 255)  # #b04050
TONGUE = (255, 150, 160, 255) # #ff96a0
DRESS_L = (252, 214, 222, 255)
DRESS = (247, 180, 196, 255)  # #f7b4c4
DRESS_S = (232, 152, 172, 255)
DRESS_D = (208, 120, 148, 255)
COLLAR = (247, 241, 238, 255) # #f7f1ee low sat
SHOE = (232, 140, 164, 255)
SHOE_D = (196, 104, 128, 255)
SHOE_L = (255, 214, 222, 255)
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
    '....oooooo....',
    '...oKKKKKKKo...',
    '..oKKKWWWKKoo..',
    '.oKKWWWWWWKKKo.',
    '.oKKWWWWWWKKKo.',
    '.oKKKKWWKKKKKo.',
    '.oKKKKKKKKKKKo.',
    '.oKKKKKKKwKKKo.',
    '.oKKKKKKKKKKKo.',
    '.oKKKKLLLKKKKo.',
    '..oKKKLLLKKKo..',
    '...oKKKKKKKo...',
    '....oooooooo...',
]
EYE_SM = [
    '..oooo...',
    '.oKWWKo..',
    'oKKKKKKKo',
    'oKKKKwKKo',
    'oKKLLKKKo',
    '.oKKKKKo.',
    '..oooo...',
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
    '..oooo..',
    '.oMMMMo.',
    'oMMMMMMo',
    'oMMTTTMo',
    '.oMMMMo.',
    '..oooo..',
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


def build(H, kind):
    """One chibi kid. H is the logical height (adult 112, child 70)."""
    k = H / 112
    big = H >= 100
    W = z(100, k) + 8
    s = Spr(W, H + 8)
    ox, oy = 4, 3

    def P(x, y):
        return ox + z(x, k), oy + z(y, k)

    # legs and shoes first, dress covers the tops
    for sx in (-11, 11):
        x, y = P(48 + sx, 104)
        s.ellipse(x, y, max(3, z(5, k)), max(5, z(8, k)), SKIN, 'skin')
        x, y = P(48 + sx, 110)
        s.ellipse(x, y, max(4, z(7, k)), max(3, z(4, k)), SHOE, 'shoe')
        s.ellipse(x, y + z(2, k), max(3, z(6, k)), max(1, z(2, k)), SHOE_D, 'shoe', outline=False, over={'shoe', 'line'})
        s.plot(x - z(2, k), y - 1, SHOE_L, 'shoe')

    # round dress: short bodice, wider hem. Not a flat disc.
    dx, dtop = P(48, 82)
    s.bell(dx, dtop, z(30, k), z(16, k), z(22, k), DRESS, 'dress')

    def dress_shade(x, y, col):
        if y < dtop + z(7, k) and x < dx:
            return DRESS_L
        if y > dtop + z(20, k):
            return DRESS_D
        if y > dtop + z(14, k) or x > dx + z(12, k):
            return DRESS_S
        return DRESS

    s.shade('dress', dress_shade)

    # tiny sleeves and round hands
    for sx, side in ((-22, -1), (22, 1)):
        x, y = P(48 + sx, 88)
        s.ellipse(x, y, max(3, z(6, k)), max(3, z(4, k)), DRESS, 'dress', over={None, 'dress', 'line', 'shoe'})
        hx, hy = P(48 + sx + side * 3, 92)
        s.ellipse(hx, hy, max(2, z(4, k)), max(2, z(3, k)), SKIN, 'skin')

    # one smooth bob. Side volume comes from the ellipse, not extra lumps.
    hx, hy = P(48, 42)
    s.ellipse(hx, hy, z(46, k), z(40, k), HAIR, 'hair', fluff=0.02)

    # big round face in the lower half of the hair
    fx, fy = P(48, 54)
    frx, fry = z(30, k), z(26, k)
    s.ellipse(fx, fy, frx, fry, SKIN, 'skin')

    # bangs: one curve. No outline against the hair above it (that read as a crack).
    s.ellipse(*P(48, 34), z(30, k), z(8, k), HAIR, 'hair', outline=False, over={'skin', 'line', 'hair', None})
    for y in range(s.h - 1):
        for x in range(s.w):
            if s.r[y][x] == 'hair' and s.r[y + 1][x] == 'skin':
                s.plot(x, y, OUT, 'line')

    def hair_shade(x, y, col):
        dx, dy = x - hx, y - (hy)
        rx, ry = max(1, z(46, k)), max(1, z(40, k))
        nx, ny = dx / rx, dy / ry
        rim = nx * nx + ny * ny
        # shine follows the upper-left curve of the bob, not a rectangle
        if ny < -0.25 and nx < 0.2 and rim > 0.28:
            return HAIR_S if rim > 0.62 and nx < 0 else HAIR_L
        if ny > 0.42 or abs(nx) > 0.78:
            return HAIR_D
        return None

    s.shade('hair', hair_shade)

    def skin_shade(x, y, col):
        dy = y - fy
        dx = x - fx
        if dy < -fry * 0.45 and dx < frx * 0.15:
            return SKIN_L
        if dy > fry * 0.62:
            return SKIN_S
        return None

    s.shade('skin', skin_shade)

    blush = ['..pppp..', '.pppppp.', '..pppp..'] if big else ['.ppp.', 'ppppp', '.ppp.']
    for sx in (-20, 20):
        blit(s, *P(48 + sx, 64), blush, lambda ch: BLUSH if ch == 'p' else None, 'blush', over={'skin'})

    # collar: only the lower crescent, and never on top of the face
    cx, cy = P(48, 80)
    s.ellipse(cx, cy, z(16, k), z(7, k), COLLAR, 'collar', over={'dress', 'line', None}, y0=cy - 1)
    s.ellipse(cx, cy + z(3, k), z(6, k), z(4, k), COLLAR, 'collar', over={'dress', 'line', None}, y0=cy)

    for byi in (90, 98):
        blit(s, *P(48, byi), BTN, btn_colors, 'button', over={'dress', 'line', 'button', None})

    blit(s, *P(48, 68), MOUTH_BIG if big else MOUTH_SM, mouth_colors, 'mouth', over={'skin', 'line', 'blush', 'mouth'})

    lx, ly = P(48 - 16, 52)
    rx, ry = P(48 + 16, 52)
    draw_eyes(s, lx, ly, rx, ry, big, kind)
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
        for stage, H in (('child', 70), ('adult', 112)):
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
