# Весь аппарат версии 2 одним эскизом «в полную силу» (план 31): крой F,
# схема декора «полосы ведут», свет — отражения студии (machine-shot.js).
# Четыре карты поля 360×696 (Y0 −57) по 3 текселя на единицу:
#   albedo — цвет без света; mat — R глянец лака, G стекло, B золото;
#   emit — что светится само (экран, табло, лампа, жидкость, лоток);
#   height — рельеф КРУПНЫХ форм, 16 бит (R старший, G младший), считается
#            расстоянием до края формы (numpy), а не растром SVG: на лаке с
#            чёткими отражениями 8-битная карта дала бы кольца (ловушка 170).
# Роспись золотом — плоская (в рельефе её нет), грань даёт шейдер по маске.
import math, sys, random
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

S, X0, Y0, FW, FH = 3, 0, -57, 360, 696
W, H = FW * S, FH * S
HR = 64.0                                    # размах карты высот, единиц
LAC, BUR, BUR_D, GOLD, INK = '#141010', '#6c1023', '#3a0812', '#d6ad52', '#0b0605'
WOOD, WOOD_L, CREAM, SCR = '#742612', '#a5472a', '#cfc19a', '#060a1a'
MAT = {'lac': 'rgb(158,0,0)', 'gold': 'rgb(230,0,255)', 'glass': 'rgb(205,255,0)', 'matte': 'rgb(0,0,0)', 'satin': 'rgb(70,0,0)', 'ball': 'rgb(255,0,0)'}
PASS = 'albedo'
import os, json
ICONS_OFF = os.environ.get('ICONS_OFF') == '1'
ICON_AT = []

def c(alb, m='lac', e='#000'):
    return alb if PASS == 'albedo' else (MAT[m] if PASS == 'mat' else e)

# ------------------------------------------------------------ рельеф
yy, xx = np.mgrid[0:H, 0:W]
PX = X0 + (xx + 0.5) / S
PY = Y0 + (yy + 0.5) / S
HM = np.zeros((H, W), np.float32)

def sd_rrect(x0, y0, x1, y1, r):
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    r = min(r, hx, hy)
    qx, qy = np.abs(PX - cx) - (hx - r), np.abs(PY - cy) - (hy - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r

def sd_ell(cx, cy, rx, ry):
    return (np.hypot((PX - cx) / rx, (PY - cy) / ry) - 1) * min(rx, ry)

def ease(s, kind):
    s = np.clip(s, 0, 1)
    if kind == 'circ':
        return np.sqrt(1 - (1 - s) ** 2)
    return np.sin(s * math.pi / 2)

def add(sd, rise, bevel, kind='sin'):
    global HM
    HM += rise * ease(-sd / bevel, kind) * (sd < 0)

def lift(sd, top, bevel, kind='sin'):
    global HM
    HM = np.maximum(HM, top * ease(-sd / bevel, kind) * (sd < 0))

def set_sphere(cx, cy, r, base, rise):
    global HM
    d = np.hypot(PX - cx, PY - cy)
    HM = np.where(d < r, base + rise * np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1)), HM)

def add_poly(pts, rise, blur):
    global HM
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([((x - X0) * S, (y - Y0) * S) for x, y in pts], fill=255)
    HM += rise * gaussian_filter(np.asarray(im, np.float32) / 255, blur)

T1, T2, T3 = (4, -55, 356, 292, 34), (6, 296, 354, 498, 30), (6, 502, 354, 634, 30)
PIL_L, COL_R = (42, 300, 90, 604, 24), (294, 300, 338, 474, 22)
WH = (22, 118, 150)
PB = (212, -46, 334, 274, 12)
BEZ, SCRR = (85, 313, 295, 465, 17), (99, 328, 281, 450, 5)
INS = (96, 506, 256, 562, 24)
SN = (180, 516, 26, 19)
BET, BAL = (156, 542, 204, 560), (268, 507, 332, 525)
TRAY, PIG = (120, 566, 240, 614, 9), (262, 530, 338, 616, 11)
LAMP, BALL, BTN = (325, 449), (314, 299, 19), (273, 243, 12)
MET = (54, 318, 78, 598)

def arch_sd():
    return np.minimum(sd_rrect(222, 45, 324, 212, 3), np.hypot(PX - 273, PY - 45) - 51)

random.seed(7)
PINS = [(228 + c_ * 12.6 + (6.3 if r_ % 2 else 0), 30 + r_ * 14) for r_ in range(12) for c_ in range(8)]
PINS = [(x, y) for x, y in PINS if 226 < x < 320 and math.hypot(x - 273, min(y, 45) - 45) < 46 and y < 176]
COINS = sorted([(271 + random.random() * 58, 572 + random.random() * 34 * (0.4 + 0.6 * random.random()), random.random(), random.random()) for _ in range(46)], key=lambda q: q[1])
TCOINS = [(150, 603, 0.3, 0.6), (171, 600, 0.7, 0.2), (193, 604, 0.5, 0.9), (212, 601, 0.1, 0.4), (182, 596, 0.9, 0.5)]

def build_height():
    global HM
    for t in (T1, T2, T3):
        add(sd_rrect(*t), 7, 7)
    lift(sd_rrect(*PIL_L), 10, 5)
    add(sd_rrect(*COL_R), 3, 3.5)
    # колесо: диск, обод-валик, ступица
    d = np.hypot(PX - WH[0], PY - WH[1])
    add(d - WH[2], 2.5, 2.5)
    add(np.abs(d - 156.5) - 6.5, 3.2, 6.5, 'circ')
    add(d - 22, 6, 22, 'circ')
    add_poly([(204, 105), (204, 131), (168, 118)], 4, 2.2)
    # пачинко
    add(sd_rrect(*PB), 4.5, 3.5)
    add(arch_sd(), -3, 2)
    for x, y in PINS:
        add(np.hypot(PX - x, PY - y) - 1.5, 1.4, 1.5, 'circ')
    add(sd_rrect(222, 220, 324, 266, 7), 1.2, 1.2)
    add(np.hypot(PX - BTN[0], PY - BTN[1]) - BTN[2], 6, BTN[2], 'circ')
    # экран
    add(sd_rrect(*BEZ), 2.6, 2.2)
    add(sd_rrect(93, 321, 287, 457, 11), -2.2, 1.6)
    # рычаг: паз, шток, шар
    add(sd_rrect(303, 300, 325, 404, 11), -4.5, 2.5)
    add(sd_rrect(310.5, 304, 317.5, 394, 3.5), 3, 3.5, 'circ')
    set_sphere(BALL[0], BALL[1], BALL[2], 9, 15)
    # лампа готовности
    dl = np.hypot(PX - LAMP[0], PY - LAMP[1])
    add(dl - 9.5, 2, 2)
    add(dl - 6.8, 3.2, 6.8, 'circ')
    # шкала: оправа и стеклянная трубка
    add(sd_rrect(49, 312, 83, 604, 17), 2.4, 2)
    add(sd_rrect(*MET, 12), 3.2, 12, 'circ')
    # цоколь: вставка, пятачок, табло, лоток, копилка
    add(sd_rrect(*INS), -1.6, 1.6)
    add(sd_ell(*SN), 3.2, 6)
    add(sd_ell(SN[0], SN[1], 13, 9.5), -1.6, 1.6)
    add(sd_rrect(177.5, 506, 182.5, 526, 1), -8, 0.6)
    for s in (-1, 1):
        add(np.hypot(PX - (SN[0] + s * 18.5), PY - SN[1]) - 2.2, 1.3, 2.2, 'circ')
    add(sd_rrect(BET[0] - 2, BET[1] - 2, BET[2] + 2, BET[3] + 2, 3), 1.2, 1)
    add(sd_rrect(*BET, 2), -1.8, 0.8)
    add(sd_rrect(BAL[0] - 2, BAL[1] - 2, BAL[2] + 2, BAL[3] + 2, 3), 1.2, 1)
    add(sd_rrect(*BAL, 2), -1.8, 0.8)
    add(sd_rrect(*TRAY), 2.2, 2.2)
    add(sd_rrect(125, 571, 235, 609, 6), -12, 2.5)
    add(sd_rrect(*PIG), 2.2, 2.2)
    add(sd_rrect(267, 535, 333, 611, 8), -7, 1.6)
    # монеты: у каждой свой наклон — отражают по-разному, куча искрится
    for group, rx, ry in ((COINS, 6.5, 2.7), (TCOINS, 7, 2.8)):
        for x, y, a, b in group:
            q = np.hypot((PX - x) / rx, (PY - y) / ry)
            HM += (q < 1) * (0.8 + (a - 0.5) * 1.8 * (PX - x) / rx + (b - 0.5) * 1.2 * (PY - y) / ry)
    v = np.clip((HM + 16) / HR, 0, 1) * 65535
    v = v.astype(np.uint32)
    out = np.zeros((H, W, 3), np.uint8)
    out[..., 0], out[..., 1] = v >> 8, v & 255
    return Image.fromarray(out)

# ------------------------------------------------------------ рисунок
def rr(x0, y0, x1, y1, r, fill, stroke=None, sw=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="{r}" fill="{fill}"{s}/>'

def ink_rr(x0, y0, x1, y1, r, alb, m='lac', e='#000'):
    o = rr(x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5, r + 0.5, c(INK, m if PASS != 'albedo' else 'lac', e)) if PASS == 'albedo' else ''
    return o + rr(x0, y0, x1, y1, r, c(alb, m, e))

def gline(pts, wid, w, alb=GOLD):
    # золотая линия росписи: тушевой контур + золото, толщина по точкам
    o = ''
    for layer, extra, col in (('ink', 1.0, c(INK, 'lac')), ('gold', 0, c(alb, 'gold'))):
        if layer == 'ink' and PASS != 'albedo':
            continue
        for i in range(len(pts) - 1):
            (xa, ya), (xb, yb) = pts[i], pts[i + 1]
            o += f'<line x1="{xa:.2f}" y1="{ya:.2f}" x2="{xb:.2f}" y2="{yb:.2f}" stroke="{col}" stroke-width="{w * (wid[i] + wid[i+1]) / 2 + extra:.2f}" stroke-linecap="round"/>'
    return o

def grect(x0, y0, x1, y1, r, w=1.3):
    o = rr(x0, y0, x1, y1, r, 'none', c(INK), w + 0.9) if PASS == 'albedo' else ''
    return o + rr(x0, y0, x1, y1, r, 'none', c(GOLD, 'gold'), w)

def curls(cx, cyc, y_sign, dirx, x_far, n=3, gap=4.6, R0=13.5, w=1.6):
    """Полосы с вложенными завитками: общий центр, внешняя полоса — внешний
    виток, полосы завитков не пересекают (решение игрока)."""
    o = ''
    for k in range(n):
        r = R0 - k * gap
        y = cyc + y_sign * r
        pts = [(x_far + (cx - x_far) * i / 30, y) for i in range(31)]
        turn, shr = [0.7, 0.95, 1.5][k], [0.12, 0.3, 0.7][k]
        for i in range(1, 41):
            t = i / 40
            a = y_sign * math.pi / 2 - y_sign * dirx * t * turn * 2 * math.pi
            pts.append((cx + math.cos(a) * r * (1 - t * shr), cyc + math.sin(a) * r * (1 - t * shr)))
        wid = [0.5 + 0.5 * min(1, i / 10) for i in range(len(pts))]
        wid = [q * (1 - 0.45 * max(0, i - (len(pts) - 12)) / 12) for i, q in enumerate(wid)]
        o += gline(pts, wid, w - k * 0.15)
    return o

def fan(cx, cy, r0, r1, a0, a1, n, w=1.3, short=0.78):
    o = ''
    for k in range(n):
        a = a0 + (a1 - a0) * (k + 0.5) / n
        re = r1 if k % 2 == 0 else r0 + (r1 - r0) * short
        pts = [(cx + math.cos(a) * (r0 + (re - r0) * i / 12), cy + math.sin(a) * (r0 + (re - r0) * i / 12)) for i in range(13)]
        o += gline(pts, [1 - 0.7 * i / 12 for i in range(13)], w)
    return o

def arcs(cx, cy, radii, a0=math.pi, a1=2 * math.pi):
    o = ''
    for r, w in radii:
        pts = [(cx + math.cos(a0 + (a1 - a0) * i / 60) * r, cy + math.sin(a0 + (a1 - a0) * i / 60) * r) for i in range(61)]
        o += gline(pts, [0.7 + 0.3 * math.sin(math.pi * i / 60) for i in range(61)], w)
    return o

# ---- пиксельные значки 16×16 для экрана ----
def sprite(kind):
    g = [[None] * 16 for _ in range(16)]
    def disc(cx, cy, r, col, cond=lambda x, y: True):
        for y in range(16):
            for x in range(16):
                if math.hypot(x - cx, y - cy) <= r and cond(x, y):
                    g[y][x] = col
    def box(x0, y0, x1, y1, col):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < 16 and 0 <= y < 16:
                    g[y][x] = col
    def line(xa, ya, xb, yb, th, col):
        for i in range(41):
            disc(xa + (xb - xa) * i / 40, ya + (yb - ya) * i / 40, th, col)
    if kind == 'coin':
        disc(7.5, 7.5, 7.3, '#a8700f'); disc(7.5, 7.5, 6.0, '#f4c542'); disc(7.5, 7.5, 6.0, '#ffe98a', lambda x, y: x + y < 9)
        box(7, 4, 8, 11, '#8a5408'); box(6, 5, 6, 5, '#8a5408'); box(6, 11, 9, 11, '#8a5408')
    elif kind == 'bone':
        line(4.5, 10.5, 10.5, 4.5, 1.3, '#f2ead6')
        for x, y in ((3, 9.6), (5.4, 12), (9.6, 3), (12, 5.4)):
            disc(x, y, 2.0, '#f2ead6')
        line(5.5, 11.5, 11.5, 5.5, 0.5, '#b8aa88')
    elif kind == 'meat':
        line(5.5, 10.5, 2.5, 13.5, 1.0, '#f2ead6'); disc(1.8, 12.6, 1.5, '#f2ead6'); disc(3.4, 14.2, 1.5, '#f2ead6')
        disc(9.5, 6.2, 5.6, '#7a2416'); disc(9.5, 6.2, 4.6, '#c04a30'); disc(8.2, 4.9, 2.4, '#ee8a62')
    elif kind == 'skull':
        disc(7.5, 6.3, 6.2, '#ece6d4'); box(4, 10, 11, 13, '#ece6d4'); disc(7.5, 6.3, 6.2, '#c9c0a6', lambda x, y: x > 10)
        disc(4.9, 7.0, 1.8, '#1a1020'); disc(10.1, 7.0, 1.8, '#1a1020'); box(7, 9, 8, 10, '#1a1020')
        for x in (5, 7, 9):
            box(x, 12, x, 13, '#6a6250')
    elif kind == 'shard':
        for y in range(16):
            for x in range(16):
                hw = (y - 0.5) * 0.95 if y < 6 else (15.5 - y) * 0.55
                if abs(x - 7.5) <= hw:
                    g[y][x] = '#8ff0d8' if x < 7.5 - hw * 0.25 else ('#35b8a0' if x < 9.5 else '#1c7a6a')
        line(7.5, 1, 7.5, 14, 0.3, '#d8fff4')
    elif kind == 'token':
        for y in range(16):
            for x in range(16):
                if abs(x - 7.5) + abs(y - 7.5) * 0.62 <= 7.2 and abs(y - 7.5) <= 6.6:
                    g[y][x] = '#8a1436'
        disc(7.5, 7.5, 4.6, '#e03a66'); disc(7.5, 7.5, 2.4, '#ffd24a'); disc(6.4, 6.2, 1.0, '#ff9ab4')
    return g

DOT = {'0': ['111', '101', '101', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '010', '010', '111'],
       '2': ['111', '001', '001', '111', '100', '100', '111'], 'x': ['000', '000', '101', '010', '101', '000', '000']}

def dots(x0, y0, x1, y1, text):
    o = rr(x0, y0, x1, y1, 2, c('#050202', 'glass', '#120303'))
    p = (y1 - y0 - 4) / 7
    tw = len(text) * 4 * p - p
    x = (x0 + x1) / 2 - tw / 2
    for ch in text:
        for j, row in enumerate(DOT[ch]):
            for i, b in enumerate(row):
                on = b == '1'
                o += f'<circle cx="{x + i * p + p / 2:.2f}" cy="{y0 + 2 + j * p + p / 2:.2f}" r="{p * 0.4:.2f}" fill="{c("#ff4a35" if on else "#2a0706", "glass", "#ff4630" if on else "#1a0303")}"/>'
        x += 4 * p
    return o

def screen():
    x0, y0, x1, y1, r = SCRR
    o = rr(93, 321, 287, 457, 11, c('#050506', 'lac'))
    o += rr(x0, y0, x1, y1, r, c(SCR, 'glass', '#03060f'))
    px = 2.25
    rows = [['bone', 'skull', 'meat'], ['coin', 'coin', 'coin'], ['shard', 'meat', 'token']]
    for ci in range(3):
        cx = x0 + 31 + ci * 60
        o += rr(cx - 27, y0 + 3, cx + 27, y1 - 3, 2, c('#080d20', 'glass', '#060b1c'))
        for ri in range(3):
            cy = y0 + 21.5 + ri * 39.5
            if ri == 1:
                o += rr(cx - 23, cy - 21, cx + 23, cy + 21, 2, c('#181206', 'glass', '#2a1c04'))
            g = sprite(rows[ri][ci])
            dim = 1.0 if ri == 1 else 0.62
            for y in range(16):
                for x in range(16):
                    col = g[y][x]
                    if col:
                        e = '#' + ''.join(f'{min(255, int(int(col[k:k+2], 16) * dim)):02x}' for k in (1, 3, 5))
                        o += f'<rect x="{cx - 18 + x * px:.2f}" y="{cy - 18 + y * px:.2f}" width="{px + 0.05:.2f}" height="{px + 0.05:.2f}" fill="{c(SCR, "glass", e)}"/>'
    my = y0 + 21.5 + 39.5
    if PASS == 'emit':
        o += f'<rect x="{x0 + 2}" y="{my - 1.1}" width="{x1 - x0 - 4}" height="2.25" fill="#ff2a1c"/>'
        # сетка пикселей: тёмные промежутки между светодиодами
        o += (f'<pattern id="led" width="{px}" height="{px}" patternUnits="userSpaceOnUse"><path d="M0 0 H{px} M0 0 V{px}" stroke="#000" stroke-width="0.5" opacity="0.55"/></pattern>'
              f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="url(#led)"/>')
    return o

def wheel():
    cx, cy, R = WH
    o = f'<circle cx="{cx}" cy="{cy}" r="163.6" fill="{c(INK)}"/><circle cx="{cx}" cy="{cy}" r="163" fill="{c(GOLD, "gold")}"/>'
    o += f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{c(INK)}"/>'
    n = 16
    P = lambda a, r: f'{cx + math.cos(a) * r:.2f} {cy + math.sin(a) * r:.2f}'
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        o += f'<path d="M{P(a0, 0)} L{P(a0, R - 0.6)} A{R} {R} 0 0 1 {P(a1, R - 0.6)} Z" fill="{c(BUR if i % 2 else "#191212")}"/>'
    for i in range(n):
        a = 2 * math.pi * i / n
        pts = [(cx + math.cos(a) * (22 + (R - 23) * k / 10), cy + math.sin(a) * (22 + (R - 23) * k / 10)) for k in range(11)]
        o += gline(pts, [0.75 + 0.25 * k / 10 for k in range(11)], 2.2)
        o += f'<circle cx="{cx + math.cos(a) * 156.5:.2f}" cy="{cy + math.sin(a) * 156.5:.2f}" r="2.1" fill="{c("#8a5a10", "gold")}"/>'
    # значки секторов — те же пиксельные, что на экране, крупнее
    icons = ['coin', None, 'meat', None, 'coin', None, 'shard', None, 'coin', None, 'token', None, 'coin', None, 'bone', None]
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        if math.cos(a) < 0.1 or not icons[i]:
            continue
        ix, iy = cx + math.cos(a) * R * 0.74, cy + math.sin(a) * R * 0.74
        # Сектор — экранчик: тёмное стекло в золотой нитке, значок светится
        # сам (как экран барабанов). Без значков (ICONS_OFF) — подложка для
        # анимации эффектов дисплея (wheel-fx.py).
        o += rr(ix - 18.6, iy - 18.6, ix + 18.6, iy + 18.6, 3.6, c(INK)) + rr(ix - 18, iy - 18, ix + 18, iy + 18, 3.2, c(GOLD, 'gold'))
        o += rr(ix - 17, iy - 17, ix + 17, iy + 17, 2.6, c('#04060d', 'glass', '#03050c'))
        ICON_AT.append((round(ix, 2), round(iy, 2), icons[i]))
        if ICONS_OFF:
            continue
        g = sprite(icons[i]); q = 1.9
        for y in range(16):
            for x in range(16):
                if g[y][x]:
                    col = g[y][x]
                    o += f'<rect x="{ix - 15.2 + x * q:.2f}" y="{iy - 15.2 + y * q:.2f}" width="{q - 0.25}" height="{q - 0.25}" fill="{c("#05070e", "glass", col)}"/>'
    o += f'<circle cx="{cx}" cy="{cy}" r="22.6" fill="{c(INK)}"/><circle cx="{cx}" cy="{cy}" r="22" fill="{c(GOLD, "gold")}"/><circle cx="{cx}" cy="{cy}" r="8" fill="{c("#191212")}"/>'
    o += f'<path d="M204.6 104 L204.6 132 L166.5 118 Z" fill="{c(INK)}"/><path d="M204 105 L204 131 L168 118 Z" fill="{c(GOLD, "gold")}"/>'
    return o

def pachinko():
    x0, y0, x1, y1, r = PB
    o = ink_rr(x0, y0, x1, y1, r, LAC) + grect(x0 + 3.5, y0 + 3.5, x1 - 3.5, y1 - 3.5, r - 3, 1.3)
    o += fan(273, -8, 7, 27, math.pi * 1.08, math.pi * 1.92, 11, 1.2)
    arch = 'M222 212 V45 A51 51 0 0 1 324 45 V212 Z'
    o += f'<path d="{arch}" fill="none" stroke="{c(INK)}" stroke-width="4.6"/><path d="{arch}" fill="none" stroke="{c(GOLD, "gold")}" stroke-width="3.4"/>'
    o += f'<path d="{arch}" fill="{c(CREAM, "glass", "#2e281a")}"/>'
    for x, y in PINS:
        o += f'<circle cx="{x:.1f}" cy="{y + 0.7:.1f}" r="1.9" fill="{c("#b9a77e", "glass", "#4a4230")}"/><circle cx="{x:.1f}" cy="{y:.1f}" r="1.5" fill="{c(GOLD, "gold")}"/>'
    for k, col in enumerate(['#c0392b', '#2f6fb8', '#3f9a4a', '#8a4ac8']):
        bx = 230 + k * 23
        o += rr(bx, 186, bx + 17, 204, 3, c(INK, 'glass')) + rr(bx + 1, 187, bx + 16, 203, 2.4, c(col, 'glass', '#000'))
        o += rr(bx + 3, 189, bx + 14, 195, 2, c('#120c0a', 'glass'))
    o += ink_rr(222, 220, 324, 266, 7, GOLD, 'gold')
    o += f'<circle cx="{BTN[0]}" cy="{BTN[1]}" r="14.2" fill="{c("#191212")}"/><circle cx="{BTN[0]}" cy="{BTN[1]}" r="{BTN[2]}" fill="{c("#b01410", "glass", "#3a0402")}"/>'
    return o

def lever():
    o = ink_rr(*COL_R, BUR) + grect(COL_R[0] + 3, COL_R[1] + 3, COL_R[2] - 3, COL_R[3] - 3, 19, 1.2)
    o += ink_rr(303, 300, 325, 404, 11, '#050404', 'matte')
    o += rr(310.5, 304, 317.5, 394, 3.5, c(GOLD, 'gold'))
    bx, by, br = BALL
    o += f'<circle cx="{bx}" cy="{by}" r="{br + 0.7}" fill="{c(INK)}"/><circle cx="{bx}" cy="{by}" r="{br}" fill="{c("#1c1516", "ball")}"/>'
    # инкрустация красным деревом: пояс по экватору шара, золотые нити по краям
    band = f'M{bx - br} {by - 2} Q{bx} {by + 5} {bx + br} {by - 2} L{bx + br - 0.6} {by + 5} Q{bx} {by + 12.5} {bx - br + 0.6} {by + 5} Z'
    o += f'<clipPath id="ballc"><circle cx="{bx}" cy="{by}" r="{br}"/></clipPath><g clip-path="url(#ballc)"><path d="{band}" fill="{c(WOOD, "ball")}"/>'
    if PASS == 'albedo':
        for k in range(7):
            o += f'<path d="M{bx - br} {by - 1 + k} Q{bx} {by + 6 + k * 1.05} {bx + br} {by - 1 + k}" fill="none" stroke="{WOOD_L if k % 2 else "#4e1608"}" stroke-width="0.45" opacity="0.8"/>'
    for dy in (-2, 5):
        o += f'<path d="M{bx - br} {by + dy} Q{bx} {by + dy + 7.3} {bx + br} {by + dy}" fill="none" stroke="{c(GOLD, "gold")}" stroke-width="1.1"/>'
    o += '</g>'
    lx, ly = LAMP
    o += f'<circle cx="{lx}" cy="{ly}" r="10.1" fill="{c(INK)}"/><circle cx="{lx}" cy="{ly}" r="9.5" fill="{c(GOLD, "gold")}"/><circle cx="{lx}" cy="{ly}" r="6.8" fill="{c("#c01810", "glass", "#7a0a04")}"/>'
    return o

def meter():
    o = ink_rr(*PIL_L, BUR) + grect(PIL_L[0] + 3, PIL_L[1] + 3, PIL_L[2] - 3, PIL_L[3] - 3, 21, 1.2)
    o += ink_rr(49, 312, 83, 604, 17, GOLD, 'gold')
    x0, y0, x1, y1 = MET
    o += rr(x0, y0, x1, y1, 12, c('#0c0a0a', 'glass'))
    lv = y1 - (y1 - y0) * 0.46
    o += f'<clipPath id="metc"><rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="12"/></clipPath><g clip-path="url(#metc)">'
    o += rr(x0, lv, x1, y1, 0, c('#c07a12', 'glass', '#3a2002'))
    o += rr(x0, lv, x1, lv + 2.2, 0, c('#f6cf6a', 'glass', '#6a4a10'))
    for bx_, by_, br_ in ((61, 560, 1.6), (70, 520, 1.2), (66, 585, 2.0), (72, 470, 1.0), (60, 500, 1.3)):
        o += f'<circle cx="{bx_}" cy="{by_}" r="{br_}" fill="{c("#ffe9a8", "glass", "#5a4410")}"/>'
    o += '</g>'
    for k in range(1, 10):
        y = y0 + (y1 - y0) * k / 10
        o += f'<line x1="85.5" y1="{y:.1f}" x2="{89 if k % 5 else 91}" y2="{y:.1f}" stroke="{c(GOLD, "gold")}" stroke-width="1"/>'
    return o

def plinth():
    o = ink_rr(*INS, BUR) + grect(INS[0], INS[1], INS[2], INS[3], INS[4], 1.5)
    o += f'<clipPath id="insc"><rect x="{INS[0]}" y="{INS[1]}" width="{INS[2]-INS[0]}" height="{INS[3]-INS[1]}" rx="{INS[4]}"/></clipPath>'
    o += f'<g clip-path="url(#insc)">{arcs(180, 563, [(57, 4.4), (48, 3.8), (39, 3.2)])}</g>'
    cx, cy, rx, ry = SN
    o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx + 0.7}" ry="{ry + 0.7}" fill="{c(INK)}"/><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{c(GOLD, "gold")}"/>'
    o += f'<ellipse cx="{cx}" cy="{cy}" rx="13" ry="9.5" fill="{c(BUR_D)}"/>' + rr(177.5, 506, 182.5, 526, 1, c('#000', 'matte'))
    for s in (-1, 1):
        o += f'<circle cx="{cx + s * 18.5}" cy="{cy}" r="2.2" fill="{c("#9a6a14", "gold")}"/>'
    for b, t in ((BET, '1x'), (BAL, '200')):
        o += ink_rr(b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2, 3, GOLD, 'gold') + dots(*b, t)
    o += ink_rr(*TRAY, GOLD, 'gold') + rr(125, 571, 235, 609, 6, c('#070303', 'matte'))
    if PASS == 'emit':
        o += ('<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000"/><stop offset="1" stop-color="#8a1008"/></linearGradient>'
              '<rect x="125" y="571" width="110" height="38" rx="6" fill="url(#tg)"/>')
    for x, y, a, b in TCOINS:
        o += f'<ellipse cx="{x}" cy="{y}" rx="7.5" ry="3.3" fill="{c(INK, "matte")}"/><ellipse cx="{x}" cy="{y}" rx="7" ry="2.8" fill="{c(GOLD, "gold")}"/>'
    o += ink_rr(*PIG, GOLD, 'gold') + rr(267, 535, 333, 611, 8, c('#160708', 'glass'))
    o += '<clipPath id="pigc"><rect x="267" y="535" width="66" height="76" rx="8"/></clipPath><g clip-path="url(#pigc)">'
    for x, y, a, b in COINS:
        o += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="7" ry="3.2" fill="{c(INK, "glass")}"/><ellipse cx="{x:.1f}" cy="{y:.1f}" rx="6.5" ry="2.7" fill="{c(GOLD, "gold")}"/>'
    o += '</g>'
    return o

def svg(pass_):
    global PASS
    PASS = pass_
    o = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0} {Y0} {FW} {FH}" width="{W}" height="{H}">'
    o += rr(X0, Y0, X0 + FW, Y0 + FH, 0, c('#050404', 'matte'))
    for t in (T1, T2, T3):
        o += ink_rr(*t, LAC) + grect(t[0] + 5, t[1] + 5, t[2] - 5, t[3] - 5, t[4] - 5, 1.1)
    # верхний ярус: лучи из-за колеса, полосы с завитком в стык
    o += f'<clipPath id="t1c"><rect x="4" y="-55" width="203" height="347" rx="34"/></clipPath>'
    o += f'<g clip-path="url(#t1c)">{fan(WH[0], WH[1], 166, 262, -math.pi / 2, math.pi / 2, 23, 1.5)}</g>'
    o += curls(197, 288 - 13.5, 1, 1, 26)
    o += wheel() + pachinko()
    # средний ярус
    o += meter() + lever()
    o += ink_rr(*BEZ, GOLD, 'gold') + screen()
    o += curls(106, 470 + 13.5, -1, -1, 290)
    # цоколь
    o += plinth()
    o += curls(104, 630 - 13.5, 1, -1, 254)
    return o + '</svg>'

if __name__ == '__main__':
  out = sys.argv[1]
  for p in ('albedo', 'mat', 'emit'):
    open(f'{out}mach-{p}.svg', 'w').write(svg(p))
  build_height().save(f'{out}mach-height.png')
  json.dump(ICON_AT[:len(ICON_AT) // 3], open(f'{out}mach-icons.json', 'w'))
  print('ok', W, H)
