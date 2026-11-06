#!/usr/bin/env python3
"""Crisp chibi-kid pixel sprites for the existing 200x260 / 200x300 outfit pipeline.

The renderer crops adult rows [16,256) and child rows [106,256), feet on the
last drawn row. Baked preset accessories live on a 200x300 canvas (figure
shifted down 40px, feet at row 295). Custom skin stays inside the mint hue
band pet.js recolors (h 95-185, s>=0.12, l>=0.3). Outlines are hard navy
pixels — no anti-aliasing — so image-rendering:pixelated stays crisp.

Grid is the full canvas pixel (about twice the flat color blocks of the old
preset blobs) which is the resolution this pipeline can actually show.
"""
import math, os, sys
from PIL import Image, ImageDraw
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
NAVY = (0x1d, 0x25, 0x57, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
W, H, FEET = 200, 260, 250
ACC_H, ACC_SHIFT = 300, 40

HAIRS_PRE = ['base', 'pony', 'bob', 'pigtail', 'afro']
OUTS_PRE = ['base', 'hoodie', 'stripe', 'dress', 'hanbok', 'space']
HAIRS_X = HAIRS_PRE + ['long', 'bun', 'spiky', 'curly', 'braid']
OUTS_X = OUTS_PRE + ['raincoat', 'xmas', 'sailor', 'dino', 'tux', 'chef', 'knight', 'idol', 'wizard', 'aodai', 'jersey', 'cardigan', 'bee', 'bear']
BAKED = ['crown', 'ribbon', 'flower', 'catears']
# placement matches pet.js ACC_PL: [width/head, overlap, x shift]
ACC_PL = {
    'crown': (0.50, 0.35, 0.0), 'ribbon': (0.42, 0.45, 0.28), 'flower': (0.30, 0.50, 0.30),
    'catears': (0.85, 0.50, 0.0), 'bunny': (0.60, 0.60, 0.0), 'beret': (0.80, 0.72, 0.05),
    'halo': (0.60, -0.35, 0.0), 'sprout': (0.28, 0.15, 0.0), 'partyhat': (0.38, 0.22, 0.0),
    'headphones': (1.02, 0.76, 0.0),
}

def hx(s):
    s = s.lstrip('#')
    if len(s) == 3:
        s = ''.join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def rgb_hsl(r, g, b):
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60, s, l

def hsl_rgb(h, s, l):
    def f(n):
        k = (n + h / 30) % 12
        a = s * min(l, 1 - l)
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    return tuple(max(0, min(255, int(round(f(n) * 255)))) for n in (0, 8, 4)) + (255,)

def in_band(c):
    h, s, l = rgb_hsl(*c[:3])
    return 95 <= h <= 185 and s >= 0.12 and l >= 0.3

def skin_ramp(base_hex):
    """Four shades that keep the base hue (mint stays inside the recolor band)."""
    h, s, l = rgb_hsl(*hx(base_hex)[:3])
    out = []
    for dl, ds in ((0.14, -0.08), (0.0, 0.0), (-0.10, 0.02), (-0.18, 0.04)):
        out.append(hsl_rgb(h, max(0, min(1, s + ds)), max(0, min(1, l + dl))))
    return out  # hi, base, shade, deep

SKIN = {
    'mint': skin_ramp('#9ee8c0'),
    'fair': skin_ramp('#ffd2b8'),
    'pink': skin_ramp('#ffc6b8'),
    'warm': skin_ramp('#ffc09a'),
    'tan': skin_ramp('#f0b088'),
    'peach': skin_ramp('#ffc8aa'),
}
# hard-check mint: every ramp step must recolor, and none of the peach ramps may
for c in SKIN['mint']:
    assert in_band(c), c
for name, ramp in SKIN.items():
    if name == 'mint':
        continue
    for c in ramp:
        assert not in_band(c), (name, c, rgb_hsl(*c[:3]))

HAIR = {
    'brown': (hx('#e0b07a'), hx('#a56b3c'), hx('#7a4a28'), hx('#4e2e18')),
    'grey': (hx('#f2f2f6'), hx('#b9bcc8'), hx('#8e93a3'), hx('#5c6272')),
    'pink': (hx('#ffd0e2'), hx('#ff8eb6'), hx('#f06090'), hx('#c43d6e')),
    'blond': (hx('#fff3c4'), hx('#ffe08a'), hx('#f0c04a'), hx('#d09a28')),
    'black': (hx('#6a6578'), hx('#3a3648'), hx('#241f30'), hx('#14121c')),
    'red': (hx('#ff8a78'), hx('#e23a32'), hx('#b41c24'), hx('#7a1018')),
}
BLUSH = hx('#ff9eb8')
BLUSH_D = hx('#f27898')
IRIS = hx('#2c3f9a')
IRIS_D = hx('#1c2870')
PUPIL = hx('#12162e')

# who -> look. Custom 'x' is recolored at runtime from mint.
WHO = {
    1: dict(skin='fair', hair='grey', expr='neat', prop='part', base='tidy'),
    2: dict(skin='pink', hair='pink', expr='cute', prop='ahoge', base='heart'),
    3: dict(skin='warm', hair='brown', expr='sleepy', prop='octo', base='sleepy'),
    4: dict(skin='fair', hair='blond', expr='smirk', prop='clip', base='fancy'),
    5: dict(skin='tan', hair='black', expr='sport', prop='band', base='sport'),
    6: dict(skin='warm', hair='black', expr='happy', prop='bearears', base='plain', chub=1.08),
    7: dict(skin='peach', hair='red', expr='hungry', prop='crumb', base='snack'),
    'x': dict(skin='mint', hair='brown', expr='custom', prop='none', base='basic'),
}

def new(w, h):
    im = Image.new('RGBA', (w, h), CLEAR)
    return im, ImageDraw.Draw(im)

def ell(d, cx, cy, rx, ry, fill, ow=1):
    if rx < 1 or ry < 1:
        return
    if ow:
        ell(d, cx, cy, rx + ow, ry + ow, NAVY, 0)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)

def rect(d, x0, y0, x1, y1, fill, ow=0):
    if ow:
        d.rectangle([x0 - ow, y0 - ow, x1 + ow, y1 + ow], fill=NAVY)
    d.rectangle([x0, y0, x1, y1], fill=fill)

def pill(d, cx, y0, y1, r, fill, ow=1):
    """Vertical capsule centered on cx, from y0 (top of cap) to y1 (bottom of cap)."""
    if y1 < y0:
        y0, y1 = y1, y0
    if ow:
        pill(d, cx, y0 - ow, y1 + ow, r + ow, NAVY, 0)
    d.rectangle([cx - r, y0, cx + r, y1], fill=fill)
    d.ellipse([cx - r, y0 - r, cx + r, y0 + r], fill=fill)
    d.ellipse([cx - r, y1 - r, cx + r, y1 + r], fill=fill)

def poly(d, pts, fill, stroke=True):
    if stroke:
        d.polygon(pts, fill=NAVY)
        # inset by drawing the fill after a 1px-smaller copy isn't trivial;
        # stroke the real poly, then fill on top so the outline sits on the edge.
    d.polygon(pts, fill=fill)
    if stroke:
        d.line(pts + [pts[0]], fill=NAVY, width=1)

def line(d, a, b, fill=NAVY, w=2):
    d.line([a, b], fill=fill, width=w)

def arc(d, cx, cy, rx, ry, a0, a1, fill=NAVY, w=2):
    d.arc([cx - rx, cy - ry, cx + rx, cy + ry], a0, a1, fill=fill, width=w)

def paint_where(im, cx, cy, rx, ry, color, allowed):
    a = np.array(im)
    h, w = a.shape[:2]
    y0, y1 = max(0, int(cy - ry)), min(h, int(cy + ry) + 1)
    x0, x1 = max(0, int(cx - rx)), min(w, int(cx + rx) + 1)
    if y0 >= y1 or x0 >= x1 or rx < 1 or ry < 1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mask = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    sub = a[y0:y1, x0:x1]
    ok = np.zeros(mask.shape, bool)
    for c in allowed:
        ok |= (sub[:, :, 0] == c[0]) & (sub[:, :, 1] == c[1]) & (sub[:, :, 2] == c[2]) & (sub[:, :, 3] > 0)
    sub[mask & ok] = color
    im.paste(Image.fromarray(a, 'RGBA'))

def geom(stage, chub=1.0, shift=0):
    s = 0.78 if stage == 'child' else 1.0
    cx = 100
    hr = int(44 * s * chub)
    hy = int(42 * s * chub)
    if stage == 'adult':
        hcy = 88
    else:
        hcy = 164
    g = dict(stage=stage, cx=cx, shift=shift, hr=hr, hy=hy, hcy=hcy + shift,
             top=hcy - hy + shift, min_y=(20 if stage == 'adult' else 110) + shift)
    g['chin'] = g['hcy'] + hy - 4
    tw = int(26 * s * chub)
    th = int(58 * s)
    g['torso'] = (cx, g['chin'] - 6, cx, g['chin'] + th)  # pill y0,y1 via separate
    g['tw'], g['th'] = tw, th
    g['ty0'] = g['chin'] - 8
    g['ty1'] = g['chin'] + th
    g['arm_r'] = int(8 * s)
    g['arm_x'] = cx - tw - g['arm_r'] + 6
    g['arm_y0'] = g['ty0'] + 8
    g['arm_y1'] = g['ty1'] - int(4 * s)
    g['leg_r'] = int(8 * s)
    g['leg_dx'] = int(13 * s)
    g['leg_y0'] = g['ty1'] - 8
    g['leg_y1'] = FEET - int(12 * s) + shift
    g['feet'] = FEET + shift
    g['eye_y'] = g['hcy'] - int(2 * s)
    g['eye_dx'] = int(16 * s * (1.05 if chub > 1 else 1))
    g['eye_rx'] = max(6, int(9 * s))
    g['eye_ry'] = max(7, int(11 * s))
    g['mouth_y'] = g['hcy'] + int(16 * s)
    return g

def draw_eyes(d, g, kind, skin):
    y = g['eye_y']
    dx = g['eye_dx']
    rx, ry = g['eye_rx'], g['eye_ry']
    hi, base, shade, deep = skin
    def one(cx, style):
        if style == 'dot':
            ell(d, cx, y + 2, max(2, rx // 3), max(2, rx // 3), PUPIL, 1)
            d.point((cx - 1, y + 1), fill=WHITE)
            return
        if style == 'caret':
            arc(d, cx, y + 1, rx, int(ry * 0.75), 200, 340, NAVY, w=3)
            return
        if style == 'sleepy':
            ell(d, cx, y + 2, rx, max(3, ry // 3), WHITE, 1)
            ell(d, cx, y + 3, max(3, rx // 2), max(2, ry // 4), IRIS, 0)
            d.ellipse([cx - 2, y + 2, cx + 1, y + 4], fill=PUPIL)
            line(d, (cx - rx, y), (cx + rx, y - 1), NAVY, 2)
            return
        if style == 'neat':
            ell(d, cx, y, rx, max(5, ry - 3), WHITE, 1)
            ell(d, cx, y + 1, max(3, rx - 3), max(3, ry - 5), IRIS, 0)
            ell(d, cx, y + 2, max(2, rx // 3), max(2, ry // 4), PUPIL, 0)
            d.rectangle([cx - rx + 3, y - max(5, ry - 3) + 3, cx - rx + 5, y - max(5, ry - 3) + 5], fill=WHITE)
            line(d, (cx - rx + 1, y - max(5, ry - 3) + 1), (cx + rx - 1, y - max(5, ry - 3) + 2), NAVY, 2)
            return
        # round (cute / happy / sport / hungry / custom x1 / smirk uses smaller)
        rxs, rys = rx, ry
        if style == 'smirk':
            rxs, rys = rx - 1, ry - 3
        if style == 'hungry':
            rys = max(6, ry - 2)
        ell(d, cx, y, rxs, rys, WHITE, 1)
        ell(d, cx, y + 1, max(3, rxs - 3), max(3, rys - 3), IRIS, 0)
        ell(d, cx + 1, y + 2, max(2, rxs // 3), max(2, rys // 3), PUPIL, 0)
        d.rectangle([cx - rxs + 3, y - rys + 3, cx - rxs + 5, y - rys + 6], fill=WHITE)
        if style == 'hungry':
            line(d, (cx - rxs + 1, y - rys + 1), (cx + rxs - 1, y - rys + 3), NAVY, 2)
    if kind == 'x2':
        one(g['cx'] - dx, 'caret'); one(g['cx'] + dx, 'caret')
    elif kind == 'x3':
        one(g['cx'] - dx, 'dot'); one(g['cx'] + dx, 'dot')
    elif kind == 'sleepy':
        one(g['cx'] - dx, 'sleepy'); one(g['cx'] + dx, 'sleepy')
    elif kind == 'neat':
        one(g['cx'] - dx, 'neat'); one(g['cx'] + dx, 'neat')
    elif kind == 'smirk':
        one(g['cx'] - dx, 'smirk'); one(g['cx'] + dx, 'smirk')
    elif kind == 'hungry':
        one(g['cx'] - dx, 'hungry'); one(g['cx'] + dx, 'hungry')
    else:
        one(g['cx'] - dx, 'round'); one(g['cx'] + dx, 'round')

def draw_brows(d, g, expr):
    y = g['eye_y'] - g['eye_ry'] - 3
    dx = g['eye_dx']
    w = g['eye_rx'] + 2
    def br(cx, dy_outer):
        line(d, (cx - w, y), (cx + w, y + dy_outer), NAVY, 2)
    if expr in ('hungry',):
        br(g['cx'] - dx, 3); br(g['cx'] + dx, -3)  # \ /
        # wait left brow outer is left side. left: outer-high inner-low means left point higher (smaller y)
        # I drew left from (cx-w, y) to (cx+w, y+3): inner goes down. That's angry \ for the left? 
        # left brow x increases toward nose. y+3 at the nose = inner down. Angry is inner DOWN which is \ / 
        # left brow: outer high, inner low = as x increases, y increases. Yes dy positive on the right end.
        # right brow: outer high, inner low = as x increases, y decreases. dy_outer negative if we pass outer dy... 
        # I called br(right, -3) drawing (cx-w, y) to (cx+w, y-3). cx-w is the INNER side for the right eye.
        # inner y stays y, outer y is y-3 (higher). That's inner lower than outer? inner y=y, outer y=y-3, outer is higher. Yes angry.
    elif expr == 'sleepy':
        br(g['cx'] - dx, 1); br(g['cx'] + dx, -1)
    elif expr == 'neat':
        line(d, (g['cx'] - dx - w, y), (g['cx'] - dx + w, y + 1), NAVY, 2)
        line(d, (g['cx'] + dx - w, y + 1), (g['cx'] + dx + w, y), NAVY, 2)
    elif expr == 'cute':
        arc(d, g['cx'] - dx, y + 2, w, 4, 200, 340, NAVY, 2)
        arc(d, g['cx'] + dx, y + 2, w, 4, 200, 340, NAVY, 2)
    else:
        br(g['cx'] - dx, -1); br(g['cx'] + dx, 1)

def draw_mouth(d, g, expr, skin):
    cx, y = g['cx'], g['mouth_y']
    s = 0.8 if g['stage'] == 'child' else 1
    if expr in ('x2', 'cute', 'happy', 'sport'):
        arc(d, cx, y - 2, int(8 * s), int(5 * s), 20, 160, NAVY, 2)
        if expr in ('cute', 'happy'):
            arc(d, cx, y - 1, int(5 * s), int(3 * s), 30, 150, hx('#e07088'), 2)
    elif expr in ('x3', 'neat'):
        line(d, (cx - int(5 * s), y), (cx + int(5 * s), y), NAVY, 2)
    elif expr == 'sleepy':
        ell(d, cx, y, int(3 * s) + 1, int(3 * s), hx('#e07088'), 1)
    elif expr == 'smirk':
        arc(d, cx + 2, y - 1, int(7 * s), int(4 * s), 10, 150, NAVY, 2)
    elif expr == 'hungry':
        ell(d, cx, y + 1, int(4 * s), int(3 * s), hx('#c44858'), 1)
        d.rectangle([cx - int(3 * s), y - int(2 * s), cx + int(3 * s), y], fill=WHITE)
    else:  # x1 and default smile
        arc(d, cx, y - 2, int(7 * s), int(4 * s), 25, 155, NAVY, 2)

def hair_back(d, g, style, pal):
    cx, hcy, hr, hy = g['cx'], g['hcy'], g['hr'], g['hy']
    hi, base, shade, deep = pal
    if style == 'long':
        end = min(g['ty1'] + 8, g['feet'] - 18)
        pill(d, cx - hr - 6, hcy - 4, end, 8, shade)
        pill(d, cx + hr + 6, hcy - 4, end + 6, 8, base)
        ell(d, cx, hcy - 6, hr + 8, hy + 4, base)
    elif style == 'braid':
        y = hcy + hy - 10
        x = cx - hr + 2
        for i in range(7 if g['stage'] == 'adult' else 5):
            ell(d, x + (5 if i % 2 == 0 else -5), y, 8, 6, shade if i % 2 else base, 1)
            y += 8
        ell(d, x, y, 4, 3, hx('#f06090'), 1)  # tie
    elif style == 'pony':
        # tail falls to one side, behind the shoulder
        pill(d, cx + hr + 4, hcy - hy + 18, hcy + hy + 8, 8, base)
        ell(d, cx + hr + 2, hcy - hy + 14, 8, 7, deep, 1)  # tie

def hair_front(d, g, style, pal, who):
    cx, hcy, hr, hy = g['cx'], g['hcy'], g['hr'], g['hy']
    hi, base, shade, deep = pal
    top = hcy - hy
    if style == 'afro':
        extra = 8 if g['stage'] == 'child' else 16
        ell(d, cx, hcy - 2, hr + extra, hy + extra // 2, base)
        ell(d, cx - 8, top + 12, 12, 8, hi, 0)
        return
    if style == 'bun':
        ell(d, cx, max(g['min_y'] + 10, top + 4), 13, 10, base)  # top knot
        ell(d, cx, max(g['min_y'] + 6, top), 5, 3, hi, 0)
        ell(d, cx, hcy - 4, hr + 2, hy - 2, base)
    elif style == 'spiky':
        ell(d, cx, hcy - 2, hr + 1, hy - 4, base)
        lift = 8 if g['stage'] == 'child' else 16
        for i, xx in enumerate(range(cx - hr + 4, cx + hr, max(8, hr // 3))):
            tip = max(g['min_y'] + 1, top - (lift if i % 2 == 0 else lift - 4))
            poly(d, [(xx - 6, top + 12), (xx + 6, top + 12), (xx, tip)], base)
    elif style == 'curly':
        ell(d, cx, hcy - 6, hr + 4, hy, base)
        for i, xx in enumerate(range(cx - hr - 2, cx + hr + 4, 12)):
            ell(d, xx, top + 8 + (i % 2) * 4, 8, 8, base if i % 2 == 0 else shade, 1)
        ell(d, cx - hr - 2, hcy + 6, 8, 12, base)
        ell(d, cx + hr + 2, hcy + 8, 8, 12, shade)
    elif style == 'bob':
        ell(d, cx, hcy - 2, hr + 7, hy + 4, base)
        rect(d, cx - hr - 7, hcy, cx + hr + 7, hcy + hy - 2, base, 1)
        ell(d, cx - 8, top + 8, 16, 8, hi, 0)
    elif style == 'pigtail':
        ell(d, cx, hcy - 4, hr + 2, hy - 2, base)
        for sgn in (-1, 1):
            ell(d, cx + sgn * (hr + 2), hcy - 6, 8, 8, base)
            pill(d, cx + sgn * (hr + 6), hcy, hcy + hy + 10, 7, shade)
            ell(d, cx + sgn * (hr + 4), hcy - 2, 4, 3, hx('#f06090'), 0)
    else:
        # base / pony / long / braid share a cap; pony has a puff, long already has back locks
        ell(d, cx, hcy - 12, hr + 8, hy + 4, base)
        if style == 'pony':
            ell(d, cx + 8, max(g['min_y'] + 12, top + 2), 11, 10, base)
            ell(d, cx + 8, max(g['min_y'] + 8, top - 2), 4, 3, hi, 0)
        if style == 'base' and who == 7:
            for xx, tip in ((cx - 16, top - 8), (cx, top - 14), (cx + 14, top - 6)):
                poly(d, [(xx - 5, top + 8), (xx + 5, top + 8), (xx, tip)], base, stroke=True)
        if style == 'base' and who == 3:
            # soft shoulder-length sides
            pill(d, cx - hr + 2, hcy, hcy + hy - 4, 7, shade)
            pill(d, cx + hr - 2, hcy, hcy + hy - 2, 7, base)
def draw_bangs(d, g, style, pal):
    """A few short fringe tufts. The hairline itself comes from the cap sitting above the face."""
    if style in ('afro', 'spiky'):
        return
    cx, hcy, hy = g['cx'], g['hcy'], g['hy']
    base, hi = pal[1], pal[0]
    y0 = hcy - hy + 10
    for xx in (cx - 14, cx, cx + 14):
        ell(d, xx, y0, 8, 4, base, 1)

def face_and_features(d, im, g, skin, expr, prop, style):
    cx, hcy, hr, hy = g['cx'], g['hcy'], g['hr'], g['hy']
    hi, base, shade, deep = skin
    # ears peek beside short hair
    if style in ('base', 'spiky', 'bun', 'curly'):
        ell(d, cx - hr - 1, hcy + 2, 5, 7, base)
        ell(d, cx + hr + 1, hcy + 2, 5, 7, base)
        ell(d, cx - hr - 1, hcy + 2, 2, 4, shade, 0)
        ell(d, cx + hr + 1, hcy + 2, 2, 4, shade, 0)
    # face sits a little low so the hair cap reads as a fringe, not a bald ring
    ell(d, cx, hcy + 4, hr - 1, hy - 3, base)
    # blush
    ell(d, cx - hr + 10, hcy + 8, 7, 4, BLUSH, 0)
    ell(d, cx + hr - 10, hcy + 8, 7, 4, BLUSH, 0)
    kind = expr
    draw_brows(d, g, 'cute' if expr in ('x1', 'x2', 'happy', 'sport') else 'neat' if expr == 'x3' else expr)
    draw_eyes(d, g, kind if expr not in ('happy', 'sport', 'cute') else 'round', skin)
    if expr == 'cute':
        draw_eyes(d, g, 'round', skin)
    draw_mouth(d, g, expr, skin)
    # tiny nose
    d.point((cx, g['eye_y'] + g['eye_ry'] + 2), fill=shade)
    d.point((cx + 1, g['eye_y'] + g['eye_ry'] + 2), fill=shade)

def props(d, g, prop, style, outfit):
    cx, top = g['cx'], g['hcy'] - g['hy']
    if prop == 'octo':
        oy = top + 2
        ell(d, cx, oy + 2, 12, 9, hx('#c4a4ee'))
        ell(d, cx - 4, oy + 1, 2, 2, NAVY, 0)
        ell(d, cx + 4, oy + 1, 2, 2, NAVY, 0)
        arc(d, cx, oy + 4, 4, 2, 20, 160, NAVY, 2)
        ell(d, cx - 8, oy + 10, 3, 3, hx('#b48ae0'), 0)
        ell(d, cx + 8, oy + 10, 3, 3, hx('#b48ae0'), 0)
    elif prop == 'bearears' and outfit != 'bear':
        for sgn in (-1, 1):
            ell(d, cx + sgn * 16, top + 6, 8, 8, hx('#4a372c'))
            ell(d, cx + sgn * 16, top + 7, 4, 4, hx('#f0b0c0'), 0)
    elif prop == 'band':
        y = g['eye_y'] - g['eye_ry'] - 8
        rect(d, cx - g['hr'] + 6, y, cx + g['hr'] - 6, y + 5, hx('#e85a4c'), 1)
        rect(d, cx - g['hr'] + 8, y + 2, cx + g['hr'] - 8, y + 3, WHITE, 0)
    elif prop == 'clip':
        ell(d, cx + g['hr'] - 8, top + 18, 4, 4, hx('#ffd23f'))
        d.point((cx + g['hr'] - 9, top + 17), fill=WHITE)
    elif prop == 'crumb':
        d.rectangle([cx + 12, g['mouth_y'] - 2, cx + 15, g['mouth_y'] + 1], fill=hx('#c48a4a'))
    elif prop == 'ahoge':
        arc(d, cx + 4, top - 2, 6, 8, 200, 330, HAIR['pink'][1], 2)
    elif prop == 'part':
        line(d, (cx - 1, top + 2), (cx + 4, top + 14), HAIR['grey'][0], 2)

def clothes(d, g, outfit, who, skin):
    cx = g['cx']
    ty0, ty1, tw = g['ty0'], g['ty1'], g['tw']
    ax, ay0, ay1, ar = g['arm_x'], g['arm_y0'], g['arm_y1'], g['arm_r']
    lx0, ly0, ly1, lr = g['leg_dx'], g['leg_y0'], g['leg_y1'], g['leg_r']
    feet = g['feet']
    hi_s, base_s, shade_s, deep_s = skin
    def arms(col, r=None):
        r = ar if r is None else r
        pill(d, cx - (tw + r - 5), ay0, ay1, r, col)
        pill(d, cx + (tw + r - 5), ay0, ay1, r, col)
    def hands():
        r = max(3, ar - 3)
        for sgn in (-1, 1):
            ell(d, cx + sgn * (tw + ar - 5), ay1 + 2, r, r, base_s)
    def legs(col):
        pill(d, cx - lx0, ly0, ly1, lr, col)
        pill(d, cx + lx0, ly0, ly1, lr, col)
    def legs_skin():
        legs(base_s)
    def shoes(col=hx('#f7f7fb'), sole=hx('#2a3358'), accent=hx('#e85d7a')):
        for sgn in (-1, 1):
            x = cx + sgn * lx0
            ell(d, x, feet - 7, lr + 4, 7, col)
            rect(d, x - lr - 3, feet - 5, x + lr + 3, feet, sole, 0)
            d.rectangle([x - 2, feet - 10, x + 2, feet - 7], fill=accent)
    def torso(col):
        # rounded shirt
        rect(d, cx - tw, ty0 + 6, cx + tw, ty1, col, 1)
        d.ellipse([cx - tw, ty0, cx + tw, ty0 + 18], fill=col)
        d.arc([cx - tw, ty0, cx + tw, ty0 + 18], 180, 360, fill=NAVY, width=1)
    def skirt(col, hem, flare):
        poly(d, [(cx - tw + 2, ty0 + 16), (cx + tw - 2, ty0 + 16), (cx + flare, hem), (cx - flare, hem)], col)
        line(d, (cx - flare, hem), (cx + flare, hem), NAVY, 2)
    # neck
    rect(d, cx - 7, g['chin'] - 16, cx + 7, g['chin'] - 2, base_s, 0)

    bare_hands = True
    if outfit == 'base':
        kind = WHO[who]['base'] if who != 'x' else 'basic'
        if kind == 'tidy':
            torso(hx('#f4f6fb')); arms(hx('#f4f6fb')); legs_skin()
            rect(d, cx - 8, ty0 + 4, cx + 8, ty1 - 4, hx('#2a3358'), 0)  # vest panel
            shoes(hx('#f7f7fb'), hx('#1d2557'))
        elif kind == 'heart':
            torso(hx('#ffd0e2')); arms(hx('#ffd0e2'))
            ell(d, cx - 3, ty0 + 14, 3, 3, hx('#f06090'), 0)
            ell(d, cx + 3, ty0 + 14, 3, 3, hx('#f06090'), 0)
            poly(d, [(cx - 6, ty0 + 15), (cx + 6, ty0 + 15), (cx, ty0 + 22)], hx('#f06090'), stroke=False)
            skirt(hx('#fff0f6'), ly1 - 2, tw + 10)
            shoes(hx('#fff'), hx('#f06090'))
        elif kind == 'sleepy':
            torso(hx('#9bb6d6')); arms(hx('#9bb6d6')); legs(hx('#6e82a8')); shoes(hx('#dfe6f2'), hx('#3a4668'))
        elif kind == 'fancy':
            torso(hx('#fff6e4')); arms(hx('#fff6e4')); legs_skin()
            ell(d, cx, ty0 + 16, 3, 3, hx('#ffd23f'))
            shoes(hx('#3a2a22'), hx('#1a120e'), hx('#ffd23f'))
        elif kind == 'sport':
            torso(hx('#f7f7fb')); arms(base_s)  # sleeveless: skin arms
            rect(d, cx - tw, ty0 + 10, cx + tw, ty0 + 16, hx('#e85a4c'), 0)
            legs(hx('#e85a4c')); shoes(hx('#f7f7fb'), hx('#1d2557'), hx('#e85a4c'))
            bare_hands = False
            hands()
        elif kind == 'snack':
            torso(hx('#ffb0a0')); arms(hx('#ffb0a0')); legs_skin(); shoes()
        elif kind == 'plain':
            torso(WHITE); arms(WHITE); legs(hx('#2a3358')); shoes()
        else:  # basic custom
            torso(hx('#f4f7ff')); arms(hx('#f4f7ff')); legs(hx('#2c3a68')); shoes()
    elif outfit == 'hoodie':
        # hood behind neck
        ell(d, cx, g['chin'] - 6, tw + 6, 16, hx('#8ea0c0'))
        torso(hx('#a8b6d4')); arms(hx('#8ea0c0'))
        poly(d, [(cx - 8, ty0 + 14), (cx + 8, ty0 + 14), (cx + 10, ty1 - 6), (cx - 10, ty1 - 6)], hx('#7e90b4'), stroke=True)
        legs(hx('#2c3348')); shoes(hx('#e8e8f0'), hx('#1d2557'))
    elif outfit == 'stripe':
        torso(WHITE); arms(WHITE)
        for i, yy in enumerate(range(ty0 + 12, ty1 - 2, 6)):
            rect(d, cx - tw + 1, yy, cx + tw - 1, yy + 3, hx('#2c3f9a') if i % 2 == 0 else hx('#e85d7a'), 0)
        legs(hx('#3a6fbf')); shoes()
    elif outfit == 'dress':
        torso(hx('#ffd0e4')); arms(hx('#ffd0e4'))
        skirt(hx('#f7a0c4'), feet - 14, tw + 16)
        rect(d, cx - 6, ty0 + 6, cx + 6, ty0 + 12, WHITE, 0)
        legs_skin(); shoes(hx('#fff'), hx('#f06090'))
    elif outfit == 'hanbok':
        torso(hx('#f7a0b4')); arms(hx('#f7a0b4'))
        # dongjeong white collar
        poly(d, [(cx, ty0 + 4), (cx - 10, ty0 + 16), (cx + 10, ty0 + 16)], WHITE, stroke=True)
        skirt(hx('#3a62c0'), feet - 6, tw + 20)
        rect(d, cx - 4, ty0 + 14, cx + 4, feet - 20, hx('#f06080'), 0)  # goreum ribbon
        ell(d, cx + 8, ty1, 4, 3, hx('#f06080'), 0)
        shoes(hx('#f4f4f8'), hx('#1d2557'))
    elif outfit == 'space':
        torso(hx('#e8eefc')); arms(hx('#d5def2'))
        legs(hx('#e8eefc'))
        ell(d, cx, ty0 + 8, tw + 2, 8, hx('#c5d4f5'), 0)  # collar ring
        rect(d, cx - 8, ty0 + 18, cx + 8, ty0 + 28, hx('#8eb4e8'), 1)
        for sgn in (-1, 1):
            ell(d, cx + sgn * lx0, feet - 8, lr + 3, 8, hx('#8ea0c0'))
        bare_hands = False
        for sgn in (-1, 1):
            ell(d, cx + sgn * (tw + ar - 5), ay1 + 2, ar, ar, hx('#d5def2'))
    elif outfit == 'raincoat':
        ell(d, cx, g['chin'], tw + 8, 14, hx('#f0d24a'))  # hood down
        torso(hx('#ffe56a')); arms(hx('#ffe56a'))
        rect(d, cx - 3, ty0 + 12, cx + 3, ty1, hx('#f0c020'), 0)
        for yy in (ty0 + 16, ty0 + 26, ty0 + 36):
            ell(d, cx, yy, 2, 2, hx('#c89810'), 0)
        legs(hx('#3a6ea5')); shoes(hx('#f0d24a'), hx('#8a6a10'))
    elif outfit == 'xmas':
        torso(hx('#d23a3a')); arms(hx('#d23a3a'))
        rect(d, cx - tw + 2, ty0 + 14, cx + tw - 2, ty0 + 20, hx('#2f8a4a'), 0)
        ell(d, cx, ty0 + 28, 4, 4, hx('#ffd23f'), 0)
        legs(hx('#2c3348')); shoes(hx('#d23a3a'), hx('#1d2557'), hx('#fff'))
    elif outfit == 'sailor':
        torso(WHITE); arms(WHITE)
        poly(d, [(cx - tw, ty0 + 6), (cx - 4, ty1 - 8), (cx - tw + 4, ty1 - 2)], hx('#2c3f9a'), stroke=True)
        poly(d, [(cx + tw, ty0 + 6), (cx + 4, ty1 - 8), (cx + tw - 4, ty1 - 2)], hx('#2c3f9a'), stroke=True)
        poly(d, [(cx - 4, ty0 + 8), (cx + 4, ty0 + 8), (cx, ty0 + 22)], hx('#e85d7a'), stroke=True)
        skirt(hx('#2c3f9a'), ly1, tw + 12); shoes(WHITE, hx('#2c3f9a'))
    elif outfit == 'dino':
        # lime kept OUT of the mint recolor band (hue < 95)
        col, belly, spike = hx('#8ec63a'), hx('#d6ee8a'), hx('#6aa028')
        assert not in_band(col) and not in_band(belly) and not in_band(spike)
        ell(d, cx, g['chin'] - 2, tw + 4, 12, col)  # hood rim
        torso(col); arms(col); legs(col)
        ell(d, cx, ty0 + g['th'] // 2, tw - 8, g['th'] // 3, belly, 0)
        for yy in (ty0 + 8, ty0 + 20, ty1 - 4):
            poly(d, [(cx + tw - 2, yy), (cx + tw + 10, yy + 4), (cx + tw - 2, yy + 8)], spike)
        bare_hands = False
        for sgn in (-1, 1):
            ell(d, cx + sgn * (tw + ar - 5), ay1 + 2, ar, ar, col)
            ell(d, cx + sgn * lx0, feet - 6, lr + 2, 6, col)
    elif outfit == 'tux':
        torso(hx('#1c2030')); arms(hx('#1c2030'))
        poly(d, [(cx - 8, ty0 + 6), (cx + 8, ty0 + 6), (cx, ty1 - 4)], WHITE, stroke=True)
        ell(d, cx, ty0 + 12, 4, 3, hx('#1c2030'), 0)
        d.rectangle([cx - 3, ty0 + 9, cx + 3, ty0 + 12], fill=hx('#e85d7a'))
        legs(hx('#1c2030')); shoes(hx('#111218'), hx('#000'), hx('#e85d7a'))
    elif outfit == 'chef':
        torso(WHITE); arms(WHITE)
        rect(d, cx - tw + 4, ty0 + 8, cx - tw + 8, ty1 - 2, hx('#d8dde8'), 0)
        for yy in (ty0 + 16, ty0 + 26, ty0 + 36):
            ell(d, cx - tw + 6, yy, 2, 2, hx('#c8d0dc'), 0)
        poly(d, [(cx - 6, ty0 + 6), (cx + 6, ty0 + 6), (cx, ty0 + 16)], hx('#e85d7a'), stroke=True)
        legs(hx('#3a4258')); shoes(WHITE, hx('#2a3358'))
    elif outfit == 'knight':
        torso(hx('#d5dbe8')); arms(hx('#c5ccd8'))
        poly(d, [(cx - tw - 2, ty0 + 4), (cx - tw - 14, ty1 + 10), (cx - tw + 2, ty1)], hx('#3a62c0'), stroke=True)  # cape
        rect(d, cx - 10, ty0 + 14, cx + 10, ty0 + 28, hx('#ffd23f'), 1)
        legs(hx('#b7c0d0'))
        for sgn in (-1, 1):
            ell(d, cx + sgn * lx0, feet - 7, lr + 3, 7, hx('#8e98aa'))
        bare_hands = False
        hands()
    elif outfit == 'idol':
        torso(hx('#ffd6ea')); arms(hx('#ffd6ea'))
        skirt(hx('#f7a0d0'), ly1 + 2, tw + 14)
        ell(d, cx, ty0 + 16, 4, 4, hx('#ffd23f'), 0)
        for sgn in (-1, 1):
            d.regular_polygon((cx + sgn * 14, ty0 + 22, 3), 4, rotation=0, fill=hx('#fff'))
        legs_skin(); shoes(hx('#ffd6ea'), hx('#f06090'), hx('#ffd23f'))
    elif outfit == 'wizard':
        # hat tip behind/above hair — drawn here so it follows the body pass (hair already in front).
        # A slim moon-robe reads as wizard without swallowing the hairstyle.
        torso(hx('#6a4ab0')); arms(hx('#6a4ab0'))
        skirt(hx('#5a3c9a'), feet - 8, tw + 14)
        ell(d, cx, ty0 + 14, 5, 5, hx('#ffd23f'), 0)
        d.regular_polygon((cx, ty0 + 14, 3), 5, rotation=0, fill=hx('#fff6c4'))
        shoes(hx('#3a2870'), hx('#1a1030'), hx('#ffd23f'))
    elif outfit == 'aodai':
        torso(hx('#f7f4ff')); arms(hx('#f7f4ff'))
        rect(d, cx - 3, ty0 + 8, cx + 3, feet - 16, hx('#f0b4c8'), 0)
        legs(hx('#f0e6f6'))
        skirt(hx('#f7f4ff'), feet - 12, tw + 6)
        shoes(hx('#fff'), hx('#e8a0b8'))
    elif outfit == 'jersey':
        torso(hx('#3a7de0')); arms(hx('#3a7de0'))
        # number 7
        line(d, (cx - 4, ty0 + 16), (cx + 6, ty0 + 16), WHITE, 2)
        line(d, (cx + 4, ty0 + 16), (cx - 2, ty0 + 34), WHITE, 2)
        legs(hx('#f4f6fb')); shoes(hx('#3a7de0'), hx('#1d2557'), WHITE)
    elif outfit == 'cardigan':
        torso(hx('#f2c2a0')); arms(hx('#e8b090'))
        rect(d, cx - 2, ty0 + 10, cx + 2, ty1, hx('#fff6ee'), 0)
        ell(d, cx, ty0 + 18, 2, 2, hx('#c47a62'), 0)
        legs(hx('#6a5348')); shoes()
    elif outfit == 'bee':
        torso(hx('#ffd23f')); arms(hx('#ffd23f'))
        for yy in (ty0 + 14, ty0 + 24, ty0 + 34):
            rect(d, cx - tw + 1, yy, cx + tw - 1, yy + 4, hx('#1c2030'), 0)
        legs(hx('#1c2030'))
        # wings
        ell(d, cx - tw - 6, ty0 + 14, 8, 12, hx('#e7f6ff'))
        ell(d, cx + tw + 6, ty0 + 16, 8, 12, hx('#e7f6ff'))
        ay = max(g['min_y'] + 4, g['hcy'] - g['hy'] - (6 if g['stage'] == 'child' else 12))
        line(d, (cx - 3, g['hcy'] - g['hy'] + 2), (cx - 8, ay), NAVY, 2)
        line(d, (cx + 3, g['hcy'] - g['hy'] + 2), (cx + 8, ay), NAVY, 2)
        ell(d, cx - 8, ay, 2, 2, hx('#1c2030'), 0)
        ell(d, cx + 8, ay, 2, 2, hx('#1c2030'), 0)
        shoes(hx('#ffd23f'), hx('#1c2030'))
    elif outfit == 'bear':
        col = hx('#c49060')
        ell(d, cx, g['chin'] - 4, tw + 8, 18, col)
        for sgn in (-1, 1):
            ell(d, cx + sgn * (g['hr'] - 4), g['hcy'] - g['hy'] + 4, 9, 9, col)
            ell(d, cx + sgn * (g['hr'] - 4), g['hcy'] - g['hy'] + 5, 4, 4, hx('#f0b0c0'), 0)
        torso(col); arms(col); legs(col)
        ell(d, cx, ty0 + g['th'] // 2, tw - 10, g['th'] // 3, hx('#f0d2b4'), 0)
        bare_hands = False
        for sgn in (-1, 1):
            ell(d, cx + sgn * (tw + ar - 5), ay1 + 2, ar, ar, col)
            ell(d, cx + sgn * lx0, feet - 6, lr + 2, 6, col)
    else:
        torso(hx('#f4f7ff')); arms(hx('#f4f7ff')); legs(hx('#2c3a68')); shoes()
    if bare_hands and outfit not in ('space', 'dino', 'bear'):
        hands()

def render_kid(stage, who, hair, outfit, eye='x1', shift=0):
    meta = WHO[who]
    im, d = new(W, H if shift == 0 else ACC_H)
    chub = meta.get('chub', 1.0)
    g = geom(stage, chub, shift)
    skin = SKIN[meta['skin']]
    pal = HAIR[meta['hair']]
    expr = eye if who == 'x' else meta['expr']
    # map custom eye ids onto expression names draw_* already understand
    if who == 'x':
        expr = {'x1': 'x1', 'x2': 'x2', 'x3': 'x3'}[eye]
    hair_back(d, g, hair, pal)
    clothes(d, g, outfit, who, skin)
    hair_front(d, g, hair, pal, who)
    face_and_features(d, im, g, skin, expr, meta['prop'], hair)
    draw_bangs(d, g, hair, pal)
    # redraw bangs-level props on top of the face
    props(d, g, meta['prop'], hair, outfit)
    # bee antennae and spikes can be covered by the face; clothes() drew them before the face.
    # wizard hat tip is behind. octopus/ears/band are in props() after the face. Good.
    return im

def silhouette(im):
    a = np.array(im)
    alpha = a[:, :, 3] > 0
    # 4-neighbour dilate
    dil = alpha.copy()
    dil[1:] |= alpha[:-1]
    dil[:-1] |= alpha[1:]
    dil[:, 1:] |= alpha[:, :-1]
    dil[:, :-1] |= alpha[:, 1:]
    edge = dil & ~alpha
    a[edge] = NAVY
    return Image.fromarray(a, 'RGBA')

def head_anchor(im):
    """Port of pet.js headAnchor, in image pixels."""
    a = np.array(im)
    h, w = a.shape[:2]
    alpha = a[:, :, 3] > 8
    def row(y):
        xs = np.where(alpha[y])[0]
        if len(xs) == 0:
            return None
        return int(xs[0]), int(xs[-1])
    y0 = 0
    while y0 < h and row(y0) is None:
        y0 += 1
    y1 = h - 1
    while y1 > y0 and row(y1) is None:
        y1 -= 1
    fh = y1 - y0
    band = []
    for y in range(y0, y0 + int(fh * 0.38)):
        r = row(y)
        band.append((0, -1, -1) if r is None else (r[1] - r[0] + 1, r[0], r[1]))
    if not band:
        return None
    mx = max(r[0] for r in band)
    i = next(i for i, r in enumerate(band) if r[0] >= 0.55 * mx)
    mxw = min(mx, 0.56 * fh)
    return dict(y=y0 + i, cx=(band[i][1] + band[i][2]) / 2, hw=mxw)

# ---------- accessories (tight, crisp, transparent) ----------
def acc_image(key):
    if key == 'crown':
        im, d = new(64, 48)
        poly(d, [(4, 44), (60, 44), (56, 28), (48, 40), (40, 14), (32, 36), (24, 10), (16, 36), (8, 28)], hx('#ffd23f'))
        ell(d, 24, 12, 3, 3, hx('#fff'))
        ell(d, 40, 16, 3, 3, hx('#fff'))
        ell(d, 32, 34, 5, 6, hx('#e23a4a'))
        d.rectangle([30, 30, 33, 34], fill=WHITE)
        return im
    if key == 'ribbon':
        im, d = new(48, 40)
        ell(d, 14, 16, 12, 10, hx('#f06090'))
        ell(d, 34, 16, 12, 10, hx('#f06090'))
        ell(d, 24, 18, 6, 6, hx('#ffd0e2'))
        poly(d, [(20, 22), (28, 22), (32, 38), (24, 30)], hx('#e04878'))
        poly(d, [(20, 22), (12, 38), (20, 30)], hx('#c43868'))
        return im
    if key == 'flower':
        im, d = new(40, 40)
        for ang in range(0, 360, 72):
            a = math.radians(ang - 90)
            ell(d, 20 + math.cos(a) * 9, 20 + math.sin(a) * 9, 7, 7, hx('#ff8eb6'))
        ell(d, 20, 20, 5, 5, hx('#ffd23f'))
        return im
    if key == 'catears':
        im, d = new(72, 48)
        poly(d, [(6, 44), (28, 44), (16, 6)], hx('#3a3648'))
        poly(d, [(44, 44), (66, 44), (56, 6)], hx('#3a3648'))
        poly(d, [(12, 40), (24, 40), (17, 16)], hx('#ffb0c8'), stroke=False)
        poly(d, [(48, 40), (60, 40), (55, 16)], hx('#ffb0c8'), stroke=False)
        return im
    if key == 'bunny':
        im, d = new(56, 72)
        ell(d, 16, 40, 8, 26, hx('#f4f4f8'))
        ell(d, 40, 40, 8, 26, hx('#f4f4f8'))
        ell(d, 16, 42, 3, 16, hx('#ffb0c8'), 0)
        ell(d, 40, 42, 3, 16, hx('#ffb0c8'), 0)
        return im
    if key == 'beret':
        im, d = new(64, 36)
        ell(d, 34, 20, 26, 12, hx('#c23a4a'))
        ell(d, 24, 16, 10, 6, hx('#e06070'), 0)
        ell(d, 42, 14, 3, 3, hx('#3a3648'), 0)
        return im
    if key == 'halo':
        im, d = new(64, 24)
        ell(d, 32, 12, 26, 8, hx('#ffe9a0'))
        ell(d, 32, 12, 16, 4, CLEAR, 0)
        # punch the hole: draw transparent by pasting is hard with fill CLEAR not replacing.
        a = np.array(im)
        yy, xx = np.mgrid[0:24, 0:64]
        hole = ((xx - 32) / 16) ** 2 + ((yy - 12) / 4) ** 2 <= 1
        a[hole] = (0, 0, 0, 0)
        return Image.fromarray(a, 'RGBA')
    if key == 'sprout':
        im, d = new(28, 36)
        line(d, (14, 32), (14, 16), hx('#3a8a40'), 3)
        ell(d, 10, 14, 8, 5, hx('#6ec45a'))
        ell(d, 18, 12, 7, 4, hx('#8ed86e'))
        return im
    if key == 'partyhat':
        im, d = new(40, 52)
        poly(d, [(4, 48), (36, 48), (20, 4)], hx('#ff8eb6'))
        line(d, (10, 36), (30, 28), hx('#ffd23f'), 3)
        line(d, (12, 24), (28, 18), hx('#7ec8f0'), 3)
        ell(d, 20, 6, 4, 4, hx('#ffd23f'))
        return im
    if key == 'headphones':
        im, d = new(80, 56)
        arc(d, 40, 36, 30, 26, 200, 340, hx('#5fd0c8'), 6)
        ell(d, 12, 36, 10, 14, hx('#1d2557'))
        ell(d, 68, 36, 10, 14, hx('#1d2557'))
        ell(d, 12, 36, 6, 9, hx('#8ee8df'), 0)
        ell(d, 68, 36, 6, 9, hx('#8ee8df'), 0)
        return im
    raise KeyError(key)

def crop_tight(im, pad=0):
    bb = im.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))

ACC_CACHE = {}
def get_acc(key):
    if key not in ACC_CACHE:
        ACC_CACHE[key] = crop_tight(silhouette(acc_image(key)))
    return ACC_CACHE[key]

def paste_acc(im, key, anchor):
    if anchor is None:
        return im
    spr = get_acc(key)
    f, dn, dx = ACC_PL[key]
    aw = max(4, anchor['hw'] * f)
    ah = spr.height * aw / spr.width
    scaled = spr.resize((max(1, int(round(aw))), max(1, int(round(ah)))), Image.NEAREST)
    ax = anchor['cx'] - scaled.width / 2 + anchor['hw'] * dx
    ay = anchor['y'] - scaled.height + scaled.height * dn
    out = im.copy()
    out.alpha_composite(scaled, (int(round(ax)), int(round(ay))))
    return out

def bbox_of(im):
    return im.getbbox()

def check_sprite(im, stage, baked=False):
    bb = im.getbbox()
    assert bb, 'empty sprite'
    top = 16 if stage == 'adult' else 106
    if baked:
        # figure is shifted; accessory may use the headroom but must stay on canvas
        assert bb[1] >= 1, bb
        assert bb[3] <= ACC_H - 1
        assert bb[3] >= 290  # feet near the baseline
    else:
        assert bb[1] >= top, (stage, bb)
        assert 248 <= bb[3] <= 256, bb
    assert bb[0] >= 1 and bb[2] <= W - 1, bb
    return bb

def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)

def build(preview=False, limit=None):
    n = 0
    sheets = []
    def keep(label, im):
        nonlocal n
        n += 1
        if preview and len(sheets) < 80:
            sheets.append((label, im))
        return n

    # pets: egg, baby, child, adult for 1-7 and x1-x3
    for who in [1, 2, 3, 4, 5, 6, 7, 'x']:
        eyes = ['x1', 'x2', 'x3'] if who == 'x' else [None]
        for eye in eyes:
            folder = eye if who == 'x' else str(who)
            egg = draw_egg(who, eye)
            baby = draw_baby(who, eye or 'x1')
            # child/adult base look, tight crop so creator buttons stay readable
            child = crop_tight(finish(render_kid('child', who, 'base', 'base', eye or 'x1')), 2)
            adult = crop_tight(finish(render_kid('adult', who, 'base', 'base', eye or 'x1')), 2)
            if not preview:
                base = os.path.join(ROOT, 'pets', folder)
                save(egg, f'{base}/egg.png')
                save(baby, f'{base}/baby.png')
                save(child, f'{base}/child.png')
                save(adult, f'{base}/adult.png')
            keep(f'pet {folder} baby', baby)
            keep(f'pet {folder} egg', egg)

    # accessories
    if not preview:
        for k in ACC_PL:
            save(get_acc(k), os.path.join(ROOT, 'acc', f'{k}.png'))
    for k in ACC_PL:
        keep('acc ' + k, get_acc(k))

    def outfits_for(who):
        if who == 'x':
            return HAIRS_X, OUTS_X
        return HAIRS_PRE, OUTS_PRE

    targets = []
    for who in [1, 2, 3, 4, 5, 6, 7, 'x']:
        hairs, outs = outfits_for(who)
        eyes = ['x1', 'x2', 'x3'] if who == 'x' else [None]
        for eye in eyes:
            for stage in ('child', 'adult'):
                for hair in hairs:
                    for outfit in outs:
                        targets.append((who, eye, stage, hair, outfit))
    if limit:
        targets = targets[:limit]
    for (who, eye, stage, hair, outfit) in targets:
        im = finish(render_kid(stage, who, hair, outfit, eye or 'x1'))
        check_sprite(im, stage, False)
        folder = (eye or str(who))
        if not preview:
            save(im, os.path.join(ROOT, 'outfits', folder, stage, f'{hair}_{outfit}.png'))
        if (who in (1, 'x') and hair in ('base', 'pony', 'pigtail', 'afro', 'spiky') and outfit in ('base', 'hoodie', 'hanbok', 'dino', 'dress', 'space')) or (who == 2 and hair == 'base' and outfit == 'base'):
            keep(f'{folder} {stage} {hair} {outfit}', im)
        # baked head accessories (presets are what the renderer shows; custom copies stay in sync)
        if hair in HAIRS_PRE and outfit in OUTS_PRE:
            anchor = head_anchor(im)
            shifted = finish(render_kid(stage, who, hair, outfit, eye or 'x1', shift=ACC_SHIFT))
            # anchor y shifts with the figure
            anc = None if anchor is None else dict(anchor, y=anchor['y'] + ACC_SHIFT)
            for acc in BAKED:
                baked = paste_acc(shifted, acc, anc)
                check_sprite(baked, stage, True)
                if not preview:
                    save(baked, os.path.join(ROOT, 'outfits', folder, stage, f'{hair}_{outfit}_{acc}.png'))
            if who == 1 and hair == 'pony' and outfit == 'hoodie':
                keep('baked crown', paste_acc(shifted, 'crown', anc))
        if n and n % 400 == 0:
            print('...', n, file=sys.stderr)
    print('sprites', n, 'preview', len(sheets))
    if preview:
        make_sheet(sheets, '/tmp/kids_preview.png')
    return n

def finish(im):
    return silhouette(im)

def draw_egg(who, eye):
    im, d = new(180, 210)
    meta = WHO[who]
    skin = SKIN[meta['skin']]
    shell = hx('#fff6d8')
    ell(d, 90, 108, 70, 84, shell)
    # spots: theme color + friends. Mint spots on the custom egg recolor with skin.
    spots = {
        1: [((60, 70), hx('#cfd4e0')), ((120, 90), hx('#aeb6c8')), ((80, 140), hx('#e8eaf2'))],
        2: [((58, 78), hx('#ffb0cc')), ((124, 96), hx('#ff8eb6')), ((78, 146), hx('#ffd0e2'))],
        3: [((62, 74), hx('#c8b0ea')), ((120, 100), hx('#a890d8')), ((84, 148), hx('#e0d4f6'))],
        4: [((60, 72), hx('#ffe08a')), ((122, 98), hx('#ffd23f')), ((80, 146), hx('#fff3c4'))],
        5: [((64, 76), hx('#e85a4c')), ((118, 100), hx('#3a7de0')), ((82, 148), hx('#f7f7fb'))],
        6: [((60, 74), hx('#c49060')), ((122, 96), hx('#8a623e')), ((80, 146), hx('#f0d2b4'))],
        7: [((62, 78), hx('#e23a32')), ((120, 100), hx('#ffb0a0')), ((78, 146), hx('#ffd23f'))],
        'x': [((60, 74), skin[1]), ((124, 96), hx('#ffb0cc')), ((78, 150), hx('#ffe08a')), ((108, 140), skin[0])],
    }[who]
    for (x, y), col in spots:
        ell(d, x, y, 16, 14, col, 0)
    # crack
    line(d, (108, 36), (100, 52), hx('#c4a574'), 2)
    line(d, (100, 52), (112, 64), hx('#c4a574'), 2)
    return crop_tight(silhouette(im), 1)

def draw_baby(who, eye):
    """Big-headed baby. Custom eyes differ; body outline matches across x1-x3."""
    im, d = new(160, 170)
    meta = WHO[who]
    skin = SKIN[meta['skin']]
    pal = HAIR[meta['hair']]
    hi, base, shade, deep = skin
    g = dict(stage='baby', cx=80, hcy=78, hr=40, hy=36, eye_y=76, eye_dx=15, eye_rx=9, eye_ry=11,
             mouth_y=96, chin=112, shift=0, feet=150, tw=18, ty0=108, ty1=132, arm_r=6,
             arm_x=0, arm_y0=112, arm_y1=140, leg_r=6, leg_dx=10, leg_y0=128, leg_y1=148)
    # hair cap
    ell(d, 80, 70, 44, 40, pal[1])
    if meta['prop'] == 'octo':
        ell(d, 80, 40, 10, 7, hx('#b794e0'))
    if meta['prop'] == 'bearears':
        ell(d, 62, 48, 8, 8, hx('#4a372c'))
        ell(d, 98, 48, 8, 8, hx('#4a372c'))
    # body
    pill(d, 80, 112, 136, 16, pal[1] if who == 7 else hx('#f4f7ff'))
    ell(d, 80, 78, 40, 36, base)  # face
    ell(d, 62, 88, 6, 4, BLUSH, 0)
    ell(d, 98, 88, 6, 4, BLUSH, 0)
    expr = eye if who == 'x' else meta['expr']
    draw_brows(d, g, 'cute' if expr in ('x1', 'happy', 'sport', 'cute') else 'neat' if expr == 'x3' else expr)
    draw_eyes(d, g, expr if expr not in ('happy', 'sport', 'cute') else 'round', skin)
    draw_mouth(d, g, expr, skin)
    # tiny feet
    ell(d, 68, 148, 8, 5, hx('#f7f7fb'))
    ell(d, 92, 148, 8, 5, hx('#f7f7fb'))
    if meta['prop'] == 'band':
        rect(d, 58, 58, 102, 64, hx('#e85a4c'), 1)
    return crop_tight(silhouette(im), 1)

def make_sheet(items, path):
    cell_w, cell_h = 200, 280
    cols = 8
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h), (255, 236, 230))
    dr = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(items):
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        thumb = im.copy()
        # fit
        scale = min((cell_w - 16) / thumb.width, (cell_h - 28) / thumb.height, 2)
        thumb = thumb.resize((max(1, int(thumb.width * scale)), max(1, int(thumb.height * scale))), Image.NEAREST)
        bg = Image.new('RGBA', thumb.size, (255, 236, 230, 255))
        bg.alpha_composite(thumb)
        sheet.paste(bg.convert('RGB'), (x + (cell_w - thumb.width) // 2, y + 8))
        dr.text((x + 4, y + cell_h - 16), label[:28], fill=(29, 37, 87))
    sheet.save(path)
    print('sheet', path, sheet.size)

# --- round custom base body (peach). Only base_base + pet stages; other hairs/tops stay. ---
PEACH = {
    'hi': (255, 236, 224, 255),
    'base': (255, 201, 168, 255),  # #ffc9a8, matches pet.js SKIN.peach / SKIN_BASE
    'shade': (245, 170, 140, 255),
    'deep': (232, 150, 124, 255),
}
HAIR_ROUND = {
    'hi': hsl_rgb(28, 0.42, 0.55),
    'base': (168, 106, 70, 255),
    'shade': (128, 76, 50, 255),
    'deep': (96, 56, 40, 255),
}
BLUSH_SOFT = (255, 170, 186, 255)
EYE_DARK = (58, 42, 56, 255)  # warm dark, not a blue iris ring
SHIRT = (255, 252, 250, 255)
SHOE = (255, 255, 255, 255)
SOLE = (90, 102, 140, 255)

def peach_band(c):
    h, s, l = rgb_hsl(*c[:3])
    chroma = max(c[:3]) - min(c[:3])
    return 8 <= h <= 40 and s >= 0.22 and l >= 0.64 and chroma >= 24

for _c in PEACH.values():
    assert peach_band(_c), (_c, rgb_hsl(*_c[:3]))
for _c in list(HAIR_ROUND.values()) + [BLUSH_SOFT, EYE_DARK, SHIRT, SHOE, SOLE, NAVY]:
    assert not peach_band(_c), (_c, rgb_hsl(*_c[:3]))

def paint_tone(im, cx, cy, rx, ry, color, allowed):
    a = np.array(im)
    h, w = a.shape[:2]
    y0, y1 = max(0, int(cy - ry)), min(h, int(cy + ry) + 1)
    x0, x1 = max(0, int(cx - rx)), min(w, int(cx + rx) + 1)
    if y0 >= y1 or x0 >= x1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mask = ((xx - cx) / max(rx, 1)) ** 2 + ((yy - cy) / max(ry, 1)) ** 2 <= 1
    sub = a[y0:y1, x0:x1]
    ok = np.zeros(mask.shape, bool)
    for c in allowed:
        ok |= (sub[:, :, 0] == c[0]) & (sub[:, :, 1] == c[1]) & (sub[:, :, 2] == c[2]) & (sub[:, :, 3] > 0)
    sub[mask & ok] = color
    im.paste(Image.fromarray(a, 'RGBA'))

def smile_arch(d, cx, cy, rx, ry, color, step=1):
    """Happy closed eye: middle sits higher than the ends. Discs, not PIL arc (no filled wedge)."""
    x = cx - rx
    while x <= cx + rx:
        t = (x - cx) / rx
        y = cy + ry * (t * t)
        d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=color)
        x += step

def tiny_smile(d, cx, cy):
    """Small ∪ smile: the middle sits lower than the corners."""
    x = cx - 4
    while x <= cx + 4:
        t = (x - cx) / 4.0
        y = cy + int(round(3 * (1 - t * t)))
        d.point((x, y), fill=NAVY)
        d.point((x, y + 1), fill=NAVY)
        x += 1

def draw_eyes_round(d, g, eye):
    y, dx = g['eye_y'], g['eye_dx']
    rx, ry = g['eye_rx'], g['eye_ry']
    def sparkle(cx):
        ell(d, cx, y, rx, ry, EYE_DARK, 1)
        ell(d, cx - max(3, rx // 3), y - max(3, ry // 3), max(3, rx // 3), max(3, ry // 3), WHITE, 0)
        ell(d, cx + rx // 4, y + ry // 5, 2, 2, (255, 236, 244, 255), 0)
    def wink(cx):
        smile_arch(d, cx, y - 1, rx, max(4, ry // 2), NAVY)
    def dot(cx):
        ell(d, cx, y + 1, max(3, rx // 3), max(3, rx // 3), EYE_DARK, 1)
        d.ellipse([cx - 3, y - 1, cx - 1, y + 1], fill=WHITE)
    fn = {'x1': sparkle, 'x2': wink, 'x3': dot}[eye]
    fn(g['cx'] - dx)
    fn(g['cx'] + dx)

def round_layout(stage):
    """~2 heads tall: big circle head, mochi body, stubby limbs. Feet land on row 252."""
    if stage == 'adult':
        return dict(cx=100, hcy=110, hr=50, hy=48,
                    body=(100, 174, 34, 24), arm_dx=48, arm_y=174, arm_r=13,
                    leg_dx=16, leg_y=226, leg_rx=11, leg_ry=16,
                    shoe_y=240, shoe_rx=13, shoe_ry=10,
                    eye_y=106, eye_dx=20, eye_rx=14, eye_ry=16, mouth_y=132, blush_y=122)
    return dict(cx=100, hcy=168, hr=42, hy=40,
                body=(100, 214, 28, 18), arm_dx=40, arm_y=214, arm_r=11,
                leg_dx=13, leg_y=232, leg_rx=9, leg_ry=9,
                shoe_y=244, shoe_rx=11, shoe_ry=6,
                eye_y=164, eye_dx=16, eye_rx=12, eye_ry=13, mouth_y=186, blush_y=176)

def draw_round_body(d, im, g, eye):
    cx = g['cx']
    hcy, hr, hy = g['hcy'], g['hr'], g['hy']
    hair, hi, shade = HAIR_ROUND['base'], HAIR_ROUND['hi'], HAIR_ROUND['shade']
    # fluffy hair behind the face: higher and wider, so the face cuts a soft crescent not a helmet
    ell(d, cx, hcy - 12, hr + 8, hy + 4, hair)
    # volume at the upper sides, tucked into the cap so it reads as fluff not earmuffs
    ell(d, cx - hr + 10, hcy - hy + 22, 18, 14, shade)
    ell(d, cx + hr - 8, hcy - hy + 24, 18, 14, hair)
    ell(d, cx - 18, hcy - hy + 10, 12, 8, hi, 0)
    # squishy body, stubby arms, short legs, round shoes
    bcx, bcy, brx, bry = g['body']
    ell(d, bcx, bcy, brx, bry, SHIRT)
    ell(d, cx - g['arm_dx'], g['arm_y'], g['arm_r'], g['arm_r'] - 1, PEACH['base'])
    ell(d, cx + g['arm_dx'], g['arm_y'], g['arm_r'], g['arm_r'] - 1, PEACH['base'])
    for sgn in (-1, 1):
        ell(d, cx + sgn * g['leg_dx'], g['leg_y'], g['leg_rx'], g['leg_ry'], PEACH['base'])
        ell(d, cx + sgn * g['leg_dx'], g['shoe_y'], g['shoe_rx'], g['shoe_ry'], SHOE)
        d.ellipse([cx + sgn * g['leg_dx'] - g['shoe_rx'] + 2, g['shoe_y'] + 2,
                   cx + sgn * g['leg_dx'] + g['shoe_rx'] - 2, g['shoe_y'] + g['shoe_ry']], fill=SOLE)
    # face window, a little low so hair reads as a round fringe
    ell(d, cx, hcy + 4, hr - 2, hy - 4, PEACH['base'])
    # a little warmth under the cheek, not a blotch across the forehead
    paint_tone(im, cx + 18, g['blush_y'] + 6, 10, 7, PEACH['shade'], list(PEACH.values()))
    ell(d, cx - 22, g['blush_y'], 9, 5, BLUSH_SOFT, 0)
    ell(d, cx + 22, g['blush_y'], 9, 5, BLUSH_SOFT, 0)
    draw_eyes_round(d, g, eye)
    tiny_smile(d, cx, g['mouth_y'])

def round_base(stage, eye):
    im, d = new(W, H)
    draw_round_body(d, im, round_layout(stage), eye)
    im = silhouette(im)
    bb = im.getbbox()
    limit = 16 if stage == 'adult' else 106
    assert bb and bb[1] >= limit and bb[3] <= 256 and bb[0] >= 1 and bb[2] <= 199, (stage, eye, bb)
    # skin pixels in the recolor band; hair/blush/eyes/clothes are not
    a = np.array(im)
    skin_n = other_n = 0
    for y in range(bb[1], bb[3]):
        for x in range(bb[0], bb[2]):
            p = tuple(int(v) for v in a[y, x])
            if p[3] < 200:
                continue
            if peach_band(p):
                skin_n += 1
            elif p[:3] not in (NAVY[:3],):
                other_n += 1
    assert skin_n > 400, (stage, eye, skin_n)
    return im

def round_baby(eye):
    im, d = new(150, 150)
    hair = HAIR_ROUND['base']
    ell(d, 75, 58, 50, 46, hair)
    ell(d, 75, 96, 18, 14, SHIRT)
    ell(d, 54, 96, 9, 8, PEACH['base'])
    ell(d, 96, 96, 9, 8, PEACH['base'])
    ell(d, 64, 116, 9, 6, SHOE)
    ell(d, 86, 116, 9, 6, SHOE)
    ell(d, 75, 66, 40, 36, PEACH['base'])
    ell(d, 56, 76, 7, 4, BLUSH_SOFT, 0)
    ell(d, 94, 74, 7, 4, BLUSH_SOFT, 0)
    g = dict(cx=75, eye_y=64, eye_dx=15, eye_rx=11, eye_ry=12, mouth_y=84, blush_y=76)
    draw_eyes_round(d, g, eye)
    tiny_smile(d, 75, 84)
    return crop_tight(silhouette(im), 2)

def round_egg():
    im, d = new(170, 200)
    ell(d, 85, 102, 64, 78, (255, 246, 230, 255))
    ell(d, 58, 78, 14, 12, (255, 196, 176, 255), 0)
    ell(d, 112, 96, 12, 11, (255, 214, 170, 255), 0)
    ell(d, 74, 132, 13, 11, (255, 186, 200, 255), 0)
    line(d, (104, 36), (96, 52), (196, 150, 110, 255), 2)
    line(d, (96, 52), (108, 64), (196, 150, 110, 255), 2)
    return crop_tight(silhouette(im), 1)

def recolor_peach(im, hex_color):
    """Same band and lightness shift as pet.js recolorCanvas."""
    T = rgb_hsl(*hx(hex_color)[:3])
    B = rgb_hsl(255, 201, 168)
    a = np.array(im)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            p = a[y, x]
            if p[3] < 8:
                continue
            h, s, l = rgb_hsl(int(p[0]), int(p[1]), int(p[2]))
            if not (8 <= h <= 40 and s >= 0.22 and l >= 0.64 and max(int(p[0]), int(p[1]), int(p[2])) - min(int(p[0]), int(p[1]), int(p[2])) >= 24):
                continue
            ns = max(0, min(1, T[1] * s / B[1]))
            nl = max(0, min(1, T[2] + (l - B[2])))
            a[y, x] = hsl_rgb(T[0], ns, nl)
    return Image.fromarray(a, 'RGBA')

def build_base_only():
    n = 0
    for eye in ('x1', 'x2', 'x3'):
        egg = round_egg()
        baby = round_baby(eye)
        child = round_base('child', eye)
        adult = round_base('adult', eye)
        pet = os.path.join(ROOT, 'pets', eye)
        save(egg, f'{pet}/egg.png')
        save(baby, f'{pet}/baby.png')
        save(crop_tight(child, 2), f'{pet}/child.png')
        save(crop_tight(adult, 2), f'{pet}/adult.png')
        for stage, im in (('child', child), ('adult', adult)):
            save(im, os.path.join(ROOT, 'outfits', eye, stage, 'base_base.png'))
        n += 6
    print('base body', n, 'files')

def export_base_artifacts():
    os.makedirs('/opt/cursor/artifacts', exist_ok=True)
    child = round_base('child', 'x1')
    bb = child.getbbox()
    # a little padding so the outline isn't flush to the crop
    crop = child.crop((max(0, bb[0] - 6), max(0, bb[1] - 6), min(W, bb[2] + 6), min(H, bb[3] + 6)))
    big = crop.resize((crop.width * 4, crop.height * 4), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (255, 244, 238, 255))
    bg.alpha_composite(big)
    bg.convert('RGB').save('/opt/cursor/artifacts/base-closeup.png')
    colors = [('복숭아', None), ('분홍', '#ffb8d6'), ('하늘', '#a8d8ff'), ('코코아', '#c89a78')]
    thumbs = []
    for name, hex_color in colors:
        im = child if hex_color is None else recolor_peach(child, hex_color)
        c = im.crop((max(0, bb[0] - 4), max(0, bb[1] - 4), min(W, bb[2] + 4), min(H, bb[3] + 4)))
        c = c.resize((c.width * 3, c.height * 3), Image.NEAREST)
        plate = Image.new('RGBA', c.size, (255, 244, 238, 255))
        plate.alpha_composite(c)
        thumbs.append((name, plate.convert('RGB')))
    from PIL import ImageFont
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', 28)
    gap = 16
    w = sum(t.width for _, t in thumbs) + gap * (len(thumbs) + 1)
    h = max(t.height for _, t in thumbs) + 52
    sheet = Image.new('RGB', (w, h), (255, 244, 238))
    dr = ImageDraw.Draw(sheet)
    x = gap
    for name, t in thumbs:
        sheet.paste(t, (x, 8))
        dr.text((x + 12, h - 40), name, fill=(29, 37, 87), font=font)
        x += t.width + gap
    sheet.save('/opt/cursor/artifacts/base-skins.png')
    print('artifacts', big.size, sheet.size)

if __name__ == '__main__':
    if '--base-only' in sys.argv:
        build_base_only()
        if '--artifacts' in sys.argv:
            export_base_artifacts()
    else:
        preview = '--preview' in sys.argv
        limit = None
        if '--limit' in sys.argv:
            limit = int(sys.argv[sys.argv.index('--limit') + 1])
        build(preview=preview, limit=limit)
