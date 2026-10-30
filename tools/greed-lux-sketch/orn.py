# Плашки орнамента версии 2: ар-деко + черви + свиньи. Плоско, чеканка —
# нарисованной тенью (вниз-вправо) и бликом (вверх-влево).
import math, sys

LAC, LAC_HI, LAC_LO = '#17110f', '#3b2b2c', '#070505'
BUR, BUR_LO = '#6e1424', '#3a0912'
GOLD, GOLD_HI, GOLD_LO = '#c9a24a', '#f4dc94', '#6e4f18'
W, H = 240, 150

def chased(d, w=2.4, fill='none'):
    # чеканка: тёмная тень снизу-справа, золото, светлая кромка сверху-слева
    f = f' fill="{fill}"' if fill != 'none' else ' fill="none"'
    sh = f'<path d="{d}" transform="translate(0.9 1.1)" stroke="#000" stroke-opacity="0.75" stroke-width="{w+0.6}" stroke-linecap="round" stroke-linejoin="round"{f if fill=="none" else " fill=\"#000\" fill-opacity=\"0.6\""}/>'
    g = f'<path d="{d}" stroke="{GOLD}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"{f}/>'
    hi = f'<path d="{d}" transform="translate(-0.5 -0.6)" stroke="{GOLD_HI}" stroke-width="{max(0.5, w*0.3)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/>'
    return sh + g + hi

def P(pts):
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)

def spiral(cx, cy, r0, turns, a0=0, sign=1, n=60):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = a0 + sign * t * turns * 2 * math.pi
        r = r0 * (1 - t * 0.85)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts

def segmented(pts, w=7, step=5):
    # тело червя: толстая полоса и кольца-сегменты поперёк
    d = P(pts)
    o = chased(d, w)
    acc = 0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1-x0, y1-y0)
        if L == 0: continue
        nx, ny = -(y1-y0)/L, (x1-x0)/L
        t = step - acc
        while t < L:
            x, y = x0 + (x1-x0)*t/L, y0 + (y1-y0)*t/L
            o += f'<line x1="{x+nx*w*0.45:.1f}" y1="{y+ny*w*0.45:.1f}" x2="{x-nx*w*0.45:.1f}" y2="{y-ny*w*0.45:.1f}" stroke="{GOLD_LO}" stroke-width="0.9"/>'
            t += step
        acc = (acc + L) % step
    return o

def dense(pts, k=6):
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for i in range(k):
            out.append((x0 + (x1-x0)*i/k, y0 + (y1-y0)*i/k))
    out.append(pts[-1]); return out

def snout(cx, cy, rx=22, ry=15):
    o = f'<ellipse cx="{cx+1}" cy="{cy+1.2}" rx="{rx}" ry="{ry}" fill="#000" opacity="0.6"/>'
    o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{GOLD}"/>'
    o += f'<ellipse cx="{cx-2}" cy="{cy-2}" rx="{rx*0.8}" ry="{ry*0.6}" fill="{GOLD_HI}" opacity="0.35"/>'
    for s in (-1, 1):
        o += f'<ellipse cx="{cx+s*rx*0.38}" cy="{cy+1}" rx="{rx*0.16}" ry="{ry*0.36}" fill="{GOLD_LO}"/>'
        o += f'<ellipse cx="{cx+s*rx*0.38+0.5}" cy="{cy+1.8}" rx="{rx*0.1}" ry="{ry*0.25}" fill="#1a1006"/>'
    return o

# ---------- плашки ----------
def p1():
    """Веер-пятачок: солнце ар-деко, в центре пятак."""
    cx, cy = 120, 132
    o = ''
    for k in range(17):
        a = math.pi + math.pi * (k + 0.5) / 17
        R = 112 if k % 2 == 0 else 84
        o += chased(P([(cx + math.cos(a)*30, cy + math.sin(a)*30), (cx + math.cos(a)*R, cy + math.sin(a)*R)]), 1.8)
    for r in (40, 98):
        o += chased(f'M{cx-r} {cy} A{r} {r} 0 0 1 {cx+r} {cy}', 1.4)
    o += chased(P([(20, 138), (220, 138)]), 2.2) + chased(P([(40, 144), (200, 144)]), 1.4)
    return o + snout(cx, cy - 10)

def p2():
    """Червь-меандр: ступенчатый ключ ар-деко, сложенный из тела червя."""
    pts = [(14, 104)]
    x = 14
    for k in range(4):
        pts += [(x, 50), (x+38, 50), (x+38, 86), (x+20, 86), (x+20, 68)]
        if k < 3: pts += [(x+20, 68), (x+20, 104), (x+52, 104)]
        x += 52
    o = segmented(dense(pts, 8), 8, 4.5)
    o += f'<circle cx="{pts[-1][0]}" cy="{pts[-1][1]}" r="4.6" fill="{GOLD}"/><circle cx="{pts[-1][0]-1}" cy="{pts[-1][1]-1.2}" r="1.4" fill="{GOLD_HI}"/>'
    o += chased(P([(10, 30), (230, 30)]), 1.4) + chased(P([(10, 124), (230, 124)]), 1.4)
    return o

def p3():
    """Шевроны из сегментов: три вложенных угла, кольца червя."""
    o = ''
    for k in range(3):
        h = 34 + k * 26
        pts = dense([(120 - h*1.5, 118), (120, 118 - h), (120 + h*1.5, 118)], 10)
        o += segmented(pts, 7 - k, 4.5)
    o += chased(P([(14, 130), (226, 130)]), 2)
    return o

def p4():
    """Зиккурат с ушками: ступени ар-деко, верхние углы — свиные уши."""
    o = ''
    steps = [(40, 132, 200), (64, 104, 176), (88, 76, 152)]
    for x0, y, x1 in steps:
        o += chased(P([(x0, y), (x0, y - 28), (x1, y - 28), (x1, y)]), 2)
    for s in (-1, 1):
        bx = 120 + s * 32
        # свиное ухо: широкое у основания, кончик загнут вперёд-вниз
        ear = (f'M{bx - s*4} 48 C{bx - s*2} 28 {bx + s*10} 16 {bx + s*26} 12 '
               f'C{bx + s*38} 10 {bx + s*44} 18 {bx + s*40} 30 '
               f'C{bx + s*36} 26 {bx + s*30} 26 {bx + s*28} 32 '
               f'C{bx + s*24} 40 {bx + s*22} 46 {bx + s*20} 48 Z')
        o += chased(ear, 1.4, GOLD)
        o += f'<path d="M{bx + s*2} 44 C{bx + s*6} 30 {bx + s*14} 22 {bx + s*26} 18" stroke="{GOLD_LO}" stroke-width="1.1" fill="none"/>'
        o += f'<path d="M{bx + s*40} 30 C{bx + s*36} 26 {bx + s*30} 26 {bx + s*28} 32" stroke="{GOLD_LO}" stroke-width="1.1" fill="none"/>'
    for x in range(98, 146, 8):
        o += chased(P([(x, 54), (x, 72)]), 1.2)
    o += chased(P([(16, 136), (224, 136)]), 2.2)
    return o

def p5():
    """Скоростные полосы, кончающиеся завитком червя (обтекаемость)."""
    o = ''
    for k, (y, r) in enumerate([(46, 20), (78, 14), (104, 9)]):
        x1 = 196 - k*18
        o += chased(P([(18 + k*14, y), (x1, y)]), 2.6 - k*0.4)
        sp = spiral(x1, y - r, r, 1.6, math.pi/2, -1)
        o += chased(P(sp), 2.6 - k*0.4)
    o += chased(P([(18, 128), (222, 128)]), 1.4)
    return o

def p6():
    """Решётка копыт: ромбы ар-деко, в каждом — раздвоенное копытце."""
    o = ''
    for i in range(-1, 7):
        for j in range(-1, 4):
            cx, cy = 20 + i*40 + (20 if j % 2 else 0), 25 + j*40
            o += chased(P([(cx, cy-20), (cx+20, cy), (cx, cy+20), (cx-20, cy), (cx, cy-20)]), 1.1)
            if 0 <= cx <= W and 0 <= cy <= H:
                for s in (-1, 1):
                    o += chased(f'M{cx+s*1.2} {cy-6} Q{cx+s*7} {cy-4} {cx+s*6} {cy+5} Q{cx+s*3} {cy+7} {cx+s*1.2} {cy+5} Z', 0.8, GOLD)
    return o

def p7():
    """Хвостики-завитки: пара поросячьих хвостов зеркально, фонтан линий."""
    o = ''
    for s in (-1, 1):
        cx = 120 + s * 58
        sp = spiral(cx, 66, 26, 2.2, math.pi if s > 0 else 0, s)
        o += chased(P([(120 + s*8, 126), (120 + s*20, 98), (cx - s*8, 92)] + sp), 2.2)
    for k in range(-2, 3):
        o += chased(P([(120 + k*6, 130), (120 + k*6, 40 + abs(k)*12)]), 1.2)
    o += chased(P([(100, 34), (120, 22), (140, 34)]), 1.8)
    o += chased(P([(16, 136), (224, 136)]), 2.2)
    return o

def p8():
    """Радуга-кольца: дуги ар-деко, каждая — тело червя с сегментами."""
    o = ''
    for k, r in enumerate([96, 74, 52, 30]):
        pts = [(120 + math.cos(math.pi + math.pi*i/40)*r, 132 + math.sin(math.pi + math.pi*i/40)*r) for i in range(41)]
        o += segmented(pts, 8 - k, 5)
    o += chased(P([(10, 136), (230, 136)]), 2.2)
    return o

PLATES = [('1. Веер-пятачок', p1), ('2. Червь-меандр', p2), ('3. Шевроны-сегменты', p3), ('4. Зиккурат с ушками', p4),
          ('5. Полосы с завитком', p5), ('6. Решётка копыт', p6), ('7. Хвостики-завитки', p7), ('8. Радуга-кольца', p8)]

def plate(fn, bg):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*3}" height="{H*3}">'
            f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{LAC_HI if bg=="lac" else "#8a2234"}"/>'
            f'<stop offset="0.4" stop-color="{LAC if bg=="lac" else BUR}"/><stop offset="1" stop-color="{LAC_LO if bg=="lac" else BUR_LO}"/></linearGradient>'
            f'<clipPath id="c"><rect x="4" y="4" width="{W-8}" height="{H-8}" rx="6"/></clipPath></defs>'
            f'<rect width="{W}" height="{H}" rx="8" fill="{GOLD}"/><rect x="2" y="2" width="{W-4}" height="{H-4}" rx="7" fill="#000"/>'
            f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="6" fill="url(#bg)"/><g clip-path="url(#c)">{fn()}</g></svg>')

out = sys.argv[1]
for i, (name, fn) in enumerate(PLATES):
    open(f'{out}o{i+1}.svg', 'w').write(plate(fn, 'lac' if i % 2 == 0 else 'bur'))
