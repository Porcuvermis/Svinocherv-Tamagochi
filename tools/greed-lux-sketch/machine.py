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

import os
S, X0, Y0, FW, FH = int(os.environ.get('MS', 3)), 0, -57, 360, 696
W, H = FW * S, FH * S
HR = 64.0                                    # размах карты высот, единиц
LAC, BUR, BUR_D, GOLD, INK = '#141010', '#6c1023', '#3a0812', '#d6ad52', '#0b0605'
WOOD, WOOD_L, CREAM, SCR = '#742612', '#a5472a', '#cfc19a', '#060a1a'
MAT = {'lac': 'rgb(158,0,0)', 'gold': 'rgb(230,0,255)', 'glass': 'rgb(205,255,0)', 'matte': 'rgb(0,0,0)', 'satin': 'rgb(70,0,0)', 'ball': 'rgb(255,0,0)'}
PASS = 'albedo'
import os, json
ICONS_OFF = os.environ.get('ICONS_OFF') == '1'
# Для игры (greed-lux.js): что там живёт отдельными слоями, в корпус не
# запекается. LIVE=1 — экран без значков и линии (LED-экран — свой холст),
# рычаг без шара (шар — свои карты, ball_svg, двигается по пазу), лампа
# готовности погашена (горит слоем, когда рычаг готов).
LIVE = os.environ.get('LIVE') == '1'
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
    # сетка — текущая (корпус или спрайт, part_height): начало — PX/PY[0,0]
    hh, ww = HM.shape
    ox, oy = PX[0, 0] - 0.5 / S, PY[0, 0] - 0.5 / S
    im = Image.new('L', (ww, hh), 0)
    ImageDraw.Draw(im).polygon([((x - ox) * S, (y - oy) * S) for x, y in pts], fill=255)
    HM += rise * gaussian_filter(np.asarray(im, np.float32) / 255, blur)

T1, T2, T3 = (4, -55, 356, 292, 34), (6, 296, 354, 498, 30), (6, 502, 354, 634, 30)
# колонна рычага, паз, шар и лампа готовности — на одной оси x 314
# (игрок: лампа под рычагом съехала — была на 325 при рычаге на 314)
PIL_L, COL_R = (42, 300, 90, 604, 24), (292, 300, 336, 474, 22)
WH = (22, 118, 150)
PB = (212, -46, 334, 274, 12)
BEZ, SCRR = (85, 313, 295, 465, 17), (99, 328, 281, 450, 5)
INS = (96, 506, 256, 562, 24)
SN = (180, 516, 26, 19)
BET, BAL = (156, 542, 204, 560), (268, 507, 332, 525)
TRAY, PIG = (120, 566, 240, 614, 9), (262, 530, 338, 616, 11)
LAMP, BALL, BTN = (314, 440), (314, 299, 19), (273, 243, 12)   # лампа — посередине между низом паза (404) и низом колонны (474)
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
    if not LIVE:
        d = np.hypot(PX - WH[0], PY - WH[1])
        add(d - WH[2], 2.5, 2.5)
        add(np.abs(d - 156.5) - 6.5, 3.2, 6.5, 'circ')
        add(d - 22, 6, 22, 'circ')
        add_poly([(204, 105), (204, 131), (168, 118)], 4, 2.2)
    # пачинко: эскиз — или поле игры (LIVE)
    if LIVE:
        pach_build_live()
    else:
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
    if not LIVE:
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
    elif kind == 'coins3':
        # три монеты горкой — приз колеса «три монеты»
        for cx, cy in ((4.3, 10.6), (11.2, 10.6), (7.75, 4.9)):
            disc(cx, cy, 4.1, '#a8700f'); disc(cx, cy, 3.1, '#f4c542'); disc(cx, cy, 3.1, '#ffe98a', lambda x, y, cx=cx, cy=cy: (x - cx) + (y - cy) < -1.2)
            box(int(round(cx)), int(round(cy)) - 1, int(round(cx)), int(round(cy)) + 1, '#8a5408')
    elif kind == 'potato':
        # картофелина — приз колеса «семечка в сад»
        for y in range(16):
            for x in range(16):
                u, v = (x - 7.5) * 0.94 + (y - 8) * 0.34, -(x - 7.5) * 0.34 + (y - 8) * 0.94
                if (u / 7.0) ** 2 + (v / 5.2) ** 2 <= 1:
                    g[y][x] = '#7a4a1e' if (u / 7.0) ** 2 + (v / 5.2) ** 2 > 0.72 else ('#e6b46a' if u + v * 1.6 < -4 else '#c48a44')
        for x, y in ((5, 7), (9, 10), (10, 6), (6, 11)):
            g[y][x] = '#6a3e16'
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
            if LIVE:
                continue
            g = sprite(rows[ri][ci])
            dim = 1.0 if ri == 1 else 0.62
            for y in range(16):
                for x in range(16):
                    col = g[y][x]
                    if col:
                        e = '#' + ''.join(f'{min(255, int(int(col[k:k+2], 16) * dim)):02x}' for k in (1, 3, 5))
                        o += f'<rect x="{cx - 18 + x * px:.2f}" y="{cy - 18 + y * px:.2f}" width="{px + 0.05:.2f}" height="{px + 0.05:.2f}" fill="{c(SCR, "glass", e)}"/>'
    my = y0 + 21.5 + 39.5
    if PASS == 'emit' and not LIVE:
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
        # Сектор целиком — дисплей клином (решение игрока: лопасти колеса и
        # есть экраны, они же подсвечивают колесо). Фон — светом экрана:
        # бордовые и чёрные клинья по очереди, спицы — рамки между экранами.
        o += f'<path d="M{P(a0, 0)} L{P(a0, R - 0.6)} A{R} {R} 0 0 1 {P(a1, R - 0.6)} Z" fill="{c("#140508" if i % 2 else "#06060a", "glass", "#4a0816" if i % 2 else "#07070e")}"/>'
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
        # Значок горит на экране сектора. Без значков (ICONS_OFF) — подложка
        # для анимации эффектов дисплея (wheel-fx.py).
        ICON_AT.append((round(ix, 2), round(iy, 2), icons[i]))
        if ICONS_OFF:
            continue
        g = sprite(icons[i]); q = 1.9
        for y in range(16):
            for x in range(16):
                if g[y][x]:
                    col = g[y][x]
                    o += f'<rect x="{ix - 15.2 + x * q:.2f}" y="{iy - 15.2 + y * q:.2f}" width="{q - 0.25}" height="{q - 0.25}" fill="{c("#05070e", "glass", col)}"/>'
    if PASS == 'emit':
        o += (f'<pattern id="wled" width="1.9" height="1.9" patternUnits="userSpaceOnUse" x="{cx}" y="{cy}"><path d="M0 0 H1.9 M0 0 V1.9" stroke="#000" stroke-width="0.55" opacity="0.7"/></pattern>'
              f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#wled)"/>')
        for i in range(n):
            a = 2 * math.pi * i / n
            o += f'<line x1="{cx}" y1="{cy}" x2="{cx + math.cos(a) * R:.2f}" y2="{cy + math.sin(a) * R:.2f}" stroke="#000" stroke-width="3.4"/>'
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
    if not LIVE:
        o += ball()
    lx, ly = LAMP
    lamp_e = '#000' if LIVE else '#7a0a04'
    o += f'<circle cx="{lx}" cy="{ly}" r="10.1" fill="{c(INK)}"/><circle cx="{lx}" cy="{ly}" r="9.5" fill="{c(GOLD, "gold")}"/><circle cx="{lx}" cy="{ly}" r="6.8" fill="{c("#c01810", "glass", lamp_e)}"/>'
    return o

# Шар рычага: чёрный лак с поясом красного дерева и золотыми нитями.
def ball():
    bx, by, br = BALL
    o = f'<circle cx="{bx}" cy="{by}" r="{br + 0.7}" fill="{c(INK)}"/><circle cx="{bx}" cy="{by}" r="{br}" fill="{c("#1c1516", "ball")}"/>'
    # инкрустация красным деревом: пояс по экватору шара, золотые нити по краям
    band = f'M{bx - br} {by - 2} Q{bx} {by + 5} {bx + br} {by - 2} L{bx + br - 0.6} {by + 5} Q{bx} {by + 12.5} {bx - br + 0.6} {by + 5} Z'
    o += f'<clipPath id="ballc"><circle cx="{bx}" cy="{by}" r="{br}"/></clipPath><g clip-path="url(#ballc)"><path d="{band}" fill="{c(WOOD, "ball")}"/>'
    if PASS == 'albedo':
        for k in range(7):
            o += f'<path d="M{bx - br} {by - 1 + k} Q{bx} {by + 6 + k * 1.05} {bx + br} {by - 1 + k}" fill="none" stroke="{WOOD_L if k % 2 else "#4e1608"}" stroke-width="0.45" opacity="0.8"/>'
    for dy in (-2, 5):
        o += f'<path d="M{bx - br} {by + dy} Q{bx} {by + dy + 7.3} {bx + br} {by + dy}" fill="none" stroke="{c(GOLD, "gold")}" stroke-width="1.1"/>'
    o += '</g>'
    return o

# Диск колеса отдельно (LIVE) — с ободом и штырями, повёрнут как в игре:
# сектор i серединой на угле i/16·2π − π/2 (сектор 0 — вверху), границы
# секторов (спицы, штыри) — на ±½ сектора (greed-junk-lit-wheel.js, тот же
# счёт броска и штырей). Значков нет — их рисует игра живыми.
DISC_R = 165.0
def disc():
    cx, cy, R = WH
    n = 16
    o = f'<circle cx="{cx}" cy="{cy}" r="163.6" fill="{c(INK)}"/><circle cx="{cx}" cy="{cy}" r="163" fill="{c(GOLD, "gold")}"/>'
    o += f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{c(INK)}"/>'
    P = lambda a, r: f'{cx + math.cos(a) * r:.2f} {cy + math.sin(a) * r:.2f}'
    edge = lambda i: (i - 0.5) / n * 2 * math.pi - math.pi / 2
    for i in range(n):
        a0, a1 = edge(i), edge(i + 1)
        o += f'<path d="M{P(a0, 0)} L{P(a0, R - 0.6)} A{R} {R} 0 0 1 {P(a1, R - 0.6)} Z" fill="{c("#140508" if i % 2 else "#06060a", "glass", "#4a0816" if i % 2 else "#07070e")}"/>'
    for i in range(n):
        a = edge(i)
        pts = [(cx + math.cos(a) * (22 + (R - 23) * k / 10), cy + math.sin(a) * (22 + (R - 23) * k / 10)) for k in range(11)]
        o += gline(pts, [0.75 + 0.25 * k / 10 for k in range(11)], 2.2)
        o += f'<circle cx="{cx + math.cos(a) * 156.5:.2f}" cy="{cy + math.sin(a) * 156.5:.2f}" r="2.1" fill="{c("#8a5a10", "gold")}"/>'
    if PASS == 'emit':
        o += (f'<pattern id="wled" width="1.9" height="1.9" patternUnits="userSpaceOnUse" x="{cx}" y="{cy}"><path d="M0 0 H1.9 M0 0 V1.9" stroke="#000" stroke-width="0.55" opacity="0.7"/></pattern>'
              f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#wled)"/>')
        for i in range(n):
            a = edge(i)
            o += f'<line x1="{cx}" y1="{cy}" x2="{cx + math.cos(a) * R:.2f}" y2="{cy + math.sin(a) * R:.2f}" stroke="#000" stroke-width="3.4"/>'
    o += f'<circle cx="{cx}" cy="{cy}" r="22.6" fill="{c(INK)}"/><circle cx="{cx}" cy="{cy}" r="22" fill="{c(GOLD, "gold")}"/><circle cx="{cx}" cy="{cy}" r="8" fill="{c("#191212")}"/>'
    return o
def disc_box():
    return WH[0] - DISC_R, WH[1] - DISC_R, 2 * DISC_R, 2 * DISC_R
def ptr():
    return f'<path d="M204.6 104 L204.6 132 L166.5 118 Z" fill="{c(INK)}"/><path d="M204 105 L204 131 L168 118 Z" fill="{c(GOLD, "gold")}"/>'
def ptr_box():
    return 164.0, 101.0, 43.0, 34.0

# Спрайт: SVG части в своём квадрате (вне рисунка — прозрачно) и рельеф по
# расстоянию до края на своей сетке — тем же счётом, что у корпуса.
def part_svg(pass_, box, draw):
    global PASS
    PASS = pass_
    x, y, w, h = box
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{int(round(w * S))}" height="{int(round(h * S))}">' + draw() + '</svg>'
def part_height(box, build):
    global PX, PY, HM
    keep = (PX, PY, HM)
    x, y, w, h = box
    nw, nh = int(round(w * S)), int(round(h * S))
    gy, gx = np.mgrid[0:nh, 0:nw]
    PX, PY = x + (gx + 0.5) / S, y + (gy + 0.5) / S
    HM = np.zeros((nh, nw), np.float32)
    build()
    v = (np.clip((HM + 16) / HR, 0, 1) * 65535).astype(np.uint32)
    PX, PY, HM = keep
    out = np.zeros((nh, nw, 3), np.uint8)
    out[..., 0], out[..., 1] = v >> 8, v & 255
    return Image.fromarray(out)
def disc_build():
    d = np.hypot(PX - WH[0], PY - WH[1])
    add(d - WH[2], 2.5, 2.5)
    add(np.abs(d - 156.5) - 6.5, 3.2, 6.5, 'circ')
    for i in range(16):
        a = (i - 0.5) / 16 * 2 * math.pi - math.pi / 2
        add(np.hypot(PX - (WH[0] + math.cos(a) * 156.5), PY - (WH[1] + math.sin(a) * 156.5)) - 2.1, 1.6, 2.1, 'circ')
    add(d - 22, 6, 22, 'circ')
def ptr_build():
    add_poly([(204, 105), (204, 131), (168, 118)], 4, 2.2)

# ---------------------------------------------------------------- ПАЧИНКО (LIVE)
# Поле — ТО ЖЕ, что в игре (pach-geom.json, выгрузка pach-geom.js): гвозди,
# лунки, дуга, дорожка, сток, кнопка — физика шарика и запас запусков не
# меняются. Рисуется в своих координатах короба, на аппарат — подобием
# PACH_AT (как в игре). Шарик, лунки, гвозди — физические; электроника —
# табло на лунках (значок приза светодиодами), подсветка поля.
PG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pach-geom.json')))
PP, PAT = PG['PACH'], PG['AT']
def pf(x, y):
    return PAT['x'] + (x - PAT['ax']) * PAT['s'], PAT['y'] + (y - PAT['ay']) * PAT['s']
def pg(inner):
    s_ = PAT['s']
    return f'<g transform="translate({PAT["x"] - PAT["ax"] * s_:.3f} {PAT["y"] - PAT["ay"] * s_:.3f}) scale({s_})">{inner}</g>'
# Лунки — эмаль приглушённых тонов в лад чёрному, красному и золоту (игрок,
# 18.11: цвета для узнавания, не акцентные); второй цвет — светодиоды табло.
CUP_COL = {'wrath': ('#5a1a1f', '#ff6a5a'), 'glut': ('#6b3e22', '#ffaa62'), 'lust': ('#6b3346', '#ff92b4'),
           'sloth': ('#2b3c54', '#92baff'), 'greed': ('#6b5320', '#ffd96a'), 'envy': ('#1f4a42', '#7fe8c8'),
           'pride': ('#3f284d', '#c99cff'), 'gold1': ('#a88f55', '#ffe08a')}
CUP_ICON = {'gold1': 'coin', 'envy': 'token', 'pride': 'token'}
def led_icon(key):
    g = sprite(CUP_ICON.get(key, 'shard'))
    if key == 'gold1':
        return g
    led = CUP_COL[key][1]
    lr, lg, lb = (int(led[i:i + 2], 16) for i in (1, 3, 5))
    out = [[None] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            col = g[y][x]
            if col:
                v = max(int(col[i:i + 2], 16) for i in (1, 3, 5)) / 255
                v = 0.35 + 0.65 * v
                out[y][x] = '#%02x%02x%02x' % (int(lr * v), int(lg * v), int(lb * v))
    return out
# Варианты вида поля (концепты 18.11 после «1 из 10»: перекраска гаражного
# — не дизайн). PV=A «ночь под стеклом», B «бордо», C «решётка». Физика та же:
# места гвоздей, лунок, дуги, дорожки, стока, кнопки — из игры.
# PV — две буквы: поле и лунки (игрок, 18.11: поле B «бордо», лунки C
# «зиккураты»); одна буква — то и другое из одного варианта.
PV = os.environ.get('PV', 'BC')
PVF, PVC = PV[0], PV[-1]
def pach_live():
    P, A = PP, PP['arc']
    fx0, fx1, fy0, fy1 = P['x0'] + P['wall'], P['x1'] - P['wall'], P['y0'] + P['top'], P['y1'] - P['panel']
    cx, cy, r, sep, drain = A['cx'], A['cy'], A['r'], P['sep'], P['drain']
    o = ink_rr(P['x0'], P['y0'], P['x1'], P['y1'], 8, LAC) + grect(P['x0'] + 2.6, P['y0'] + 2.6, P['x1'] - 2.6, P['y1'] - 2.6, 6, 1.0)
    # колодец поля: всё под дымчатым стеклом (материал стекла — отражения студии)
    o += rr(fx0 - 1, fy0 - 1, fx1 + 1, fy1 + 1, 4, c('#050404', 'glass', '#000'))
    inner = f'M{cx - r} {cy} A{r} {r} 0 0 1 {cx + r} {cy} L{sep} {cy} L{sep} {drain} L{fx0} {drain} L{fx0} {cy} Z'
    field = {'A': '#0d0a09', 'B': '#3a0a14', 'C': '#0a0909'}[PVF]
    edge = {'A': '#050403', 'B': '#1c040a', 'C': '#040303'}[PVF]
    glow = {'A': '#2a1a08', 'B': '#3a0c10', 'C': '#1e1408'}[PVF]
    if PASS == 'albedo':
        o += (f'<radialGradient id="pfg" cx="{cx}" cy="{cy - 10}" r="190" gradientUnits="userSpaceOnUse">'
              f'<stop offset="0" stop-color="{field}"/><stop offset="1" stop-color="{edge}"/></radialGradient>')
        o += f'<path d="{inner}" fill="url(#pfg)"/>'
    elif PASS == 'emit':
        o += (f'<radialGradient id="pfe" cx="{cx}" cy="{cy - 30}" r="150" gradientUnits="userSpaceOnUse">'
              f'<stop offset="0" stop-color="{glow}"/><stop offset="1" stop-color="#000"/></radialGradient>')
        o += f'<path d="{inner}" fill="url(#pfe)"/>'
    else:
        o += f'<path d="{inner}" fill="{c("#000", "glass")}"/>'
    o += f'<clipPath id="pfc"><path d="{inner}"/></clipPath><g clip-path="url(#pfc)">'
    if PVF in ('A', 'B'):
        # лучи веером от верха арки — тонкая позолота, тихо
        for k in range(23):
            a = math.pi * (0.03 + 0.94 * k / 22)
            x1_, y1_ = cx + math.cos(a) * 260, cy - r + math.sin(a) * 260
            o += f'<line x1="{cx}" y1="{cy - r}" x2="{x1_:.1f}" y2="{y1_:.1f}" stroke="{c(GOLD, "gold")}" stroke-width="{0.35 if PVF == "A" else 0.45}" opacity="{0.45 if PASS == "albedo" else 1}"/>'
    if PVF == 'C':
        # ромбическая решётка и солнце за серединой поля
        step = 12.6
        for k in range(-20, 21):
            x = fx0 + k * step
            for sgn in (1, -1):
                o += f'<line x1="{x}" y1="{fy0}" x2="{x + sgn * 260}" y2="{fy0 + 260}" stroke="{c(GOLD, "gold")}" stroke-width="0.3" opacity="{0.35 if PASS == "albedo" else 1}"/>'
        for k in range(17):
            a = 2 * math.pi * k / 17
            o += f'<line x1="{cx}" y1="122" x2="{cx + math.cos(a) * 40:.1f}" y2="{122 + math.sin(a) * 40:.1f}" stroke="{c(GOLD, "gold")}" stroke-width="0.5" opacity="{0.4 if PASS == "albedo" else 1}"/>'
    o += '</g>'
    # дорожка: канал с золотыми кромками
    o += rr(sep + 2, cy - 4, fx1, fy1, 1.5, c('#070505', 'lac'))
    # дуга — двойной золотой пруток
    arc = f'M{cx - r} {cy + 8} L{cx - r} {cy} A{r} {r} 0 0 1 {cx + r} {cy} L{cx + r} {cy + 4}'
    o += f'<path d="{arc}" fill="none" stroke="{c(INK)}" stroke-width="4.2" stroke-linejoin="round"/><path d="{arc}" fill="none" stroke="{c(GOLD, "gold")}" stroke-width="3.2" stroke-linejoin="round"/>'
    o += f'<path d="{arc}" fill="none" stroke="{c(INK)}" stroke-width="0.6" stroke-linejoin="round"/>'
    sd_ = f'M{sep + 1} {cy + 12} L{sep + 1} {drain}'
    o += f'<path d="{sd_}" stroke="{c(INK)}" stroke-width="3.2" stroke-linecap="round"/><path d="{sd_}" stroke="{c(GOLD, "gold")}" stroke-width="2.2" stroke-linecap="round"/>'
    vy, vx0, vx1 = cy + 12 - 2.4, sep + 1, cx + r - 1
    o += f'<path d="M{vx0} {vy + 1.6} L{vx1} {vy - 0.6} L{vx1} {vy + 1.2} L{vx0} {vy + 3} Z" fill="{c(GOLD, "gold")}"/>'
    # веер-пятачок над аркой
    o += fan(cx, cy - r - 1.5, 3, 12, math.pi * 1.08, math.pi * 1.92, 11, 0.9)
    # сток — золотая решётка ар-деко над тёмной щелью
    o += rr(fx0, drain - 1, sep, fy1, 0.6, c('#030202', 'matte'))
    for x in range(int(fx0) + 2, int(sep) - 1, 3):
        o += rr(x - 0.55, drain - 0.8, x + 0.55, fy1 - 0.5, 0.4, c(GOLD, 'gold'))
    o += rr(fx0, drain - 1.6, sep, drain - 0.2, 0.5, c(GOLD, 'gold'))
    # гвозди — золотые штыри в чёрном пояске
    for x, y in PG['nails']:
        o += f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.45" fill="{c(INK)}"/><circle cx="{x:.2f}" cy="{y:.2f}" r="2.05" fill="{c("#1a120c", "lac")}"/><circle cx="{x:.2f}" cy="{y:.2f}" r="1.45" fill="{c(GOLD, "gold")}"/>'
    cw, ch = P['cup']['w'], P['cup']['h']
    for cu in PG['CUPS']:
        x, y, key = cu['x'] - cw / 2, cu['y'], cu['key']
        enamel, led = CUP_COL[key]
        if PVC == 'A':
            # золотой тюльпан: трапеция расширяется вверх, внутри — эмаль
            body = f'M{x - 0.6} {y} L{x + cw + 0.6} {y} L{x + cw - 2.6} {y + ch} L{x + 2.6} {y + ch} Z'
            ins = f'M{x + 1.4} {y + 1.6} L{x + cw - 1.4} {y + 1.6} L{x + cw - 3.6} {y + ch - 1.4} L{x + 3.6} {y + ch - 1.4} Z'
            o += f'<path d="{body}" fill="{c(INK)}" stroke="{c(INK)}" stroke-width="1"/><path d="{body}" fill="{c(GOLD, "gold")}"/><path d="{ins}" fill="{c(enamel, "lac")}"/>'
            o += f'<circle cx="{x + cw / 2}" cy="{y + ch / 2 + 0.6}" r="3.9" fill="{c("#050406", "glass", "#04040a")}"/>'
            icx, icy, q = x + cw / 2, y + ch / 2 + 0.6, 0.4
        elif PVC == 'B':
            body = f'M{x} {y} L{x} {y + ch - 4} Q{x} {y + ch} {x + 4} {y + ch} L{x + cw - 4} {y + ch} Q{x + cw} {y + ch} {x + cw} {y + ch - 4} L{x + cw} {y} Z'
            o += f'<path d="{body}" fill="{c(INK)}" stroke="{c(GOLD, "gold")}" stroke-width="1.3"/><path d="{body}" fill="{c("#0c0809", "lac")}"/>'
            o += rr(x + 0.8, y + 1.6, x + cw - 0.8, y + 3.6, 0.4, c(enamel, 'lac'))
            o += rr(x + 3.4, y + 4.4, x + cw - 3.4, y + ch - 1.4, 1.1, c('#040406', 'glass', '#04040a'))
            icx, icy, q = x + cw / 2, y + 4.4 + (ch - 5.8) / 2, 0.42
        else:
            # зиккурат: ступени из золота, цветная вставка посередине
            body = f'M{x} {y} L{x + cw} {y} L{x + cw} {y + 4} L{x + cw - 2} {y + 4} L{x + cw - 2} {y + 8.5} L{x + cw - 4} {y + 8.5} L{x + cw - 4} {y + ch} L{x + 4} {y + ch} L{x + 4} {y + 8.5} L{x + 2} {y + 8.5} L{x + 2} {y + 4} L{x} {y + 4} Z'
            o += f'<path d="{body}" fill="{c(INK)}" stroke="{c(INK)}" stroke-width="1"/><path d="{body}" fill="{c(GOLD, "gold")}"/>'
            o += rr(x + 4.8, y + 2.0, x + cw - 4.8, y + ch - 1.0, 1.0, c(enamel, 'lac'))
            o += rr(x + 5.6, y + 3.0, x + cw - 5.6, y + ch - 2.0, 0.8, c('#040406', 'glass', '#04040a'))
            icx, icy, q = x + cw / 2, y + 2.5 + (ch - 3.5) / 2, 0.38
        g = led_icon(key)
        for yy in range(16):
            for xx in range(16):
                col = g[yy][xx]
                if col:
                    o += f'<rect x="{icx - 8 * q + xx * q:.2f}" y="{icy - 8 * q + yy * q:.2f}" width="{q - 0.05:.2f}" height="{q - 0.05:.2f}" fill="{c("#05060c", "glass", col)}"/>'
        # кромка-горловина: золотая губа и тёмный вход
        o += rr(x - 1.2, y - 1.0, x + cw + 1.2, y + 1.4, 0.9, c(GOLD, 'gold'))
        o += rr(x + 1.2, y - 0.4, x + cw - 1.2, y + 0.6, 0.4, c('#060303', 'matte'))
    # низ: чёрная плита, золотые дуги вокруг рубиновой кнопки (как у щели монет)
    o += ink_rr(fx0 + 1, fy1 + 3, fx1 - 1, P['y1'] - 4, 4, LAC) + grect(fx0 + 2.5, fy1 + 4.5, fx1 - 2.5, P['y1'] - 5.5, 3, 0.8)
    bx, by, br = P['button']['x'], P['button']['y'], P['button']['r']
    o += f'<clipPath id="pbc"><rect x="{fx0 + 3}" y="{fy1 + 5}" width="{fx1 - fx0 - 6}" height="{P["y1"] - 9 - fy1 - 5}"/></clipPath><g clip-path="url(#pbc)">'
    for rr_ in (br + 6.5, br + 10.5, br + 14.5):
        o += f'<circle cx="{bx}" cy="{by}" r="{rr_}" fill="none" stroke="{c(INK)}" stroke-width="1.9"/><circle cx="{bx}" cy="{by}" r="{rr_}" fill="none" stroke="{c(GOLD, "gold")}" stroke-width="1.1"/>'
    o += '</g>'
    o += f'<circle cx="{bx}" cy="{by}" r="{br + 2.8}" fill="{c(INK)}"/><circle cx="{bx}" cy="{by}" r="{br + 2.2}" fill="{c(GOLD, "gold")}"/><circle cx="{bx}" cy="{by}" r="{br}" fill="{c("#9a0e14", "glass", "#3a0204")}"/>'
    return pg(o)
def pach_build_live():
    s_ = PAT['s']
    BX, BY = PAT['ax'] + (PX - PAT['x']) / s_, PAT['ay'] + (PY - PAT['y']) / s_
    P, A = PP, PP['arc']
    fx0, fx1, fy0, fy1 = P['x0'] + P['wall'], P['x1'] - P['wall'], P['y0'] + P['top'], P['y1'] - P['panel']
    def rrect(x0, y0, x1, y1, r):
        cx_, cy_, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        r = min(r, hx, hy)
        qx, qy = np.abs(BX - cx_) - (hx - r), np.abs(BY - cy_) - (hy - r)
        return (np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r) * s_
    def seg(x, y0, y1, hw):
        return (np.hypot(BX - x, np.maximum(np.maximum(y0 - BY, BY - y1), 0)) - hw) * s_
    add(rrect(P['x0'], P['y0'], P['x1'], P['y1'], 8), 4.5, 3.5)
    add(rrect(fx0 - 1, fy0 - 1, fx1 + 1, fy1 + 1, 4), -3.5, 2)
    cx, cy, r = A['cx'], A['cy'], A['r']
    d = np.hypot(BX - cx, BY - cy)
    rail = np.where(BY <= cy, (np.abs(d - r) - 1.6) * s_, 99.0)
    rail = np.minimum(rail, seg(cx - r, cy, cy + 8, 1.6)); rail = np.minimum(rail, seg(cx + r, cy, cy + 4, 1.6))
    add(rail, 2.4, 1.6 * s_, 'circ')
    add(seg(P['sep'] + 1, cy + 12, P['drain'], 1.1), 2.2, 1.1 * s_, 'circ')
    add(rrect(fx0, P['drain'] - 1, P['sep'], fy1, 0.6), -6, 0.8)
    for x in range(int(fx0) + 2, int(P['sep']) - 1, 3):
        add(rrect(x - 0.55, P['drain'] - 0.8, x + 0.55, fy1 - 0.5, 0.4), 6.5, 0.4, 'circ')
    add(rrect(fx0, P['drain'] - 1.6, P['sep'], P['drain'] - 0.2, 0.5), 1.2, 0.5)
    for x, y in PG['nails']:
        dn = np.hypot(BX - x, BY - y) * s_
        add(dn - 2.05 * s_, 0.9, 0.7)
        add(dn - 1.45 * s_, 1.9, 1.45 * s_, 'circ')
    cw, ch = P['cup']['w'], P['cup']['h']
    for cu in PG['CUPS']:
        x, y = cu['x'] - cw / 2, cu['y']
        add(rrect(x, y, x + cw, y + ch, 2.5), 3.0, 1.6, 'circ')
        add(rrect(x + 3.5, y + 2.5, x + cw - 3.5, y + ch - 1.2, 1.5), -1.0, 0.6)
        add(rrect(x - 1.2, y - 1.0, x + cw + 1.2, y + 1.4, 0.9), 1.0, 0.8)
        add(rrect(x + 1.2, y - 0.4, x + cw - 1.2, y + 0.6, 0.4), -5, 0.6)
    add(rrect(fx0 + 1, fy1 + 3, fx1 - 1, P['y1'] - 4, 4), 1.4, 1.0)
    bx, by, br = P['button']['x'], P['button']['y'], P['button']['r']
    db = np.hypot(BX - bx, BY - by) * s_
    inpanel = (BY > fy1 + 5) & (BY < P['y1'] - 9)
    for rr_ in (br + 6.5, br + 10.5, br + 14.5):
        add(np.where(inpanel, np.abs(db - rr_ * s_) - 0.55 * s_, 99.0), 0.9, 0.55 * s_, 'circ')
    add(db - (br + 2.8) * s_, 1.8, 1.4)
    add(db - br * s_, 5, br * s_, 'circ')
# Толкатель дорожки — золотой поршень (спрайт: едет вниз на взводе) и
# шарик — зеркальная сталь (спрайт).
def plunger():
    B, P = PG['spring'], PP
    lx, fy1 = B['x'] + B['w'] / 2, P['y1'] - P['panel']
    sy0 = fy1 - 12
    o = rr(lx - 1.1, sy0, lx + 1.1, fy1 + 6, 0.5, c(INK)) + rr(lx - 0.7, sy0, lx + 0.7, fy1 + 6, 0.4, c(GOLD, 'gold'))
    o += ink_rr(lx - 4.4, sy0 - 2.2, lx + 4.4, sy0 + 0.4, 0.9, GOLD, 'gold')
    return pg(o)
def plunger_box():
    B, P = PG['spring'], PP
    x0, y0 = pf(B['x'] - 1, B['y'] - 4)
    x1, y1 = pf(B['x'] + B['w'] + 1, P['y1'] - P['panel'] + 7)
    return x0, y0, x1 - x0, y1 - y0
def plunger_build():
    s_ = PAT['s']
    BX, BY = PAT['ax'] + (PX - PAT['x']) / s_, PAT['ay'] + (PY - PAT['y']) / s_
    B, P = PG['spring'], PP
    lx, sy0 = B['x'] + B['w'] / 2, P['y1'] - P['panel'] - 12
    d = np.hypot(np.maximum(np.abs(BX - lx) - 3.6, 0), np.maximum(np.abs(BY - (sy0 - 0.9)) - 0.5, 0)) * s_ - 0.8 * s_
    add(d, 1.6, 0.9, 'circ')
    rod = (np.hypot(np.maximum(np.abs(BX - lx) - 0.2, 0), np.maximum(np.maximum(sy0 - BY, BY - (sy0 + 20)), 0)) - 0.6) * s_
    add(rod, 1.2, 0.7, 'circ')
def pball():
    r = PG['phys']['r'] * PAT['s']
    return f'<circle cx="0" cy="0" r="{r + 0.3}" fill="{c(INK)}"/><circle cx="0" cy="0" r="{r}" fill="{c("#c9ced3", "lac")}"/>'
def pball_box():
    r = PG['phys']['r'] * PAT['s'] + 1.2
    return -r, -r, 2 * r, 2 * r
def pball_build():
    r = PG['phys']['r'] * PAT['s']
    d = np.hypot(PX, PY)
    global HM
    HM = np.where(d < r, 6 + 6 * np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1)), HM)

# Карты шара отдельно (LIVE): квадрат вокруг шара, вне его — прозрачно.
BALL_PAD = 3
def ball_box():
    bx, by, br = BALL
    r = br + BALL_PAD
    return bx - r, by - r, 2 * r
def ball_svg(pass_):
    global PASS
    PASS = pass_
    x, y, w = ball_box()
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {w}" width="{int(w * S)}" height="{int(w * S)}">' + ball() + '</svg>'
def ball_height():
    x, y, w = ball_box()
    n = int(w * S)
    gy, gx = np.mgrid[0:n, 0:n]
    px, py = x + (gx + 0.5) / S, y + (gy + 0.5) / S
    bx, by, br = BALL
    d = np.hypot(px - bx, py - by)
    hm = np.where(d < br, 9 + 15 * np.sqrt(np.clip(1 - (d / br) ** 2, 0, 1)), 0)
    v = (np.clip((hm + 16) / HR, 0, 1) * 65535).astype(np.uint32)
    out = np.zeros((n, n, 3), np.uint8)
    out[..., 0], out[..., 1] = v >> 8, v & 255
    return Image.fromarray(out)

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
    # LIVE: колесо (диск с ободом и штырями) и указатель — свои карты
    # (disc_svg, ptr_svg): диск вращается, указатель — поверх него
    o += (wheel() + pachinko()) if not LIVE else pach_live()
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
  # пиксельные значки — для живых экранчиков колеса в игре (greed-lux-preview.js)
  json.dump({k: sprite(k) for k in ('coin', 'bone', 'meat', 'skull', 'shard', 'token', 'coins3', 'potato')}, open(f'{out}mach-sprites.json', 'w'))
  if LIVE:
    for p in ('albedo', 'mat', 'emit'):
      open(f'{out}ball-{p}.svg', 'w').write(ball_svg(p))
    ball_height().save(f'{out}ball-height.png')
    for name, box, draw, build in (('disc', disc_box(), disc, disc_build), ('ptr', ptr_box(), ptr, ptr_build),
                                   ('plunger', plunger_box(), plunger, plunger_build), ('pball', pball_box(), pball, pball_build)):
      for p in ('albedo', 'mat', 'emit'):
        open(f'{out}{name}-{p}.svg', 'w').write(part_svg(p, box, draw))
      part_height(box, build).save(f'{out}{name}-height.png')
    x, y, w = ball_box()
    json.dump({'ball': [x, y, w], 'ballAt': list(BALL), 'lamp': list(LAMP), 'screen': list(SCRR), 'slot': [303, 300, 325, 404],
               'disc': list(disc_box()), 'ptr': list(ptr_box()), 'wheel': list(WH),
               'plunger': list(plunger_box()), 'pball': list(pball_box())}, open(f'{out}mach-live.json', 'w'))
  print('ok', W, H)
