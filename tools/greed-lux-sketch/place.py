# Расстановка трёх мотивов (веер-пятачок, полосы с завитком, радуга-кольца)
# на крое F. Три варианта, в каждом — все три мотива, декор ровно по поясам.
import sys, math, os
D = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
sys.argv = [sys.argv[0], os.path.join(D, 'sk/')]
import sketch as K
sys.argv = [sys.argv[0], os.path.join(D, 'orn/')]
import orn as O

GOLD, GOLD_HI, GOLD_LO = K.GOLD, K.GOLD_HI, K.GOLD_LO

def ch(d, w=1.4, fill='none'):
    # чеканка в масштабе поля: тень и блик тоньше, чем на плашке
    sh = f'<path d="{d}" transform="translate(0.6 0.7)" stroke="#000" stroke-opacity="0.7" stroke-width="{w+0.4}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    g = f'<path d="{d}" stroke="{GOLD}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" fill="{fill}"/>'
    hi = f'<path d="{d}" transform="translate(-0.35 -0.4)" stroke="{GOLD_HI}" stroke-width="{max(0.4, w*0.3)}" stroke-linecap="round" fill="none" opacity="0.8"/>'
    return sh + g + hi

def fan_snout(cx, cy, R, rays=15, snout=True, a0=math.pi, a1=2*math.pi, w=1.1):
    o = ''
    for k in range(rays):
        a = a0 + (a1 - a0) * (k + 0.5) / rays
        r = R if k % 2 == 0 else R * 0.75
        o += ch(O.P([(cx + math.cos(a)*R*0.3, cy + math.sin(a)*R*0.3), (cx + math.cos(a)*r, cy + math.sin(a)*r)]), w)
    for f in (0.36, 0.88):
        r = R * f
        o += ch(f'M{cx + math.cos(a0)*r:.1f} {cy + math.sin(a0)*r:.1f} A{r:.1f} {r:.1f} 0 0 1 {cx + math.cos(a1)*r:.1f} {cy + math.sin(a1)*r:.1f}', w*0.8)
    if snout:
        o += O.snout(cx, cy - R*0.06, R*0.2, R*0.14)
    return o

def curl_line(x0, x1, y, r, side=1, up=1, w=1.4):
    # полоса от x0 к x1, на конце x1 — завиток червя; side — куда смотрит конец
    sp = O.spiral(x1, y - up*r, r, 1.6, up*math.pi/2, -side*up)
    return ch(O.P([(x0, y), (x1, y)] + sp), w)

def curl_lines(x0, x1, y, side=1, up=1, n=3, gap=4.5, r0=8):
    o = ''
    for k in range(n):
        xe = x1 - side*k*10
        o += curl_line(x0 + side*k*6, xe, y + up*k*gap, r0 - k*2, side, up, 1.4 - k*0.2)
    return o

def vcurl(x, y0, y1, r, side=1, w=1.2):
    # вертикальная полоса с завитком наверху
    sp = O.spiral(x + side*r, y0, r, 1.6, math.pi if side > 0 else 0, side)
    return ch(O.P([(x, y1), (x, y0)] + sp), w)

def rainbow(cx, cy, R, n=3, step=7, w=4.5):
    o = ''
    for k in range(n):
        r = R - k*step
        pts = [(cx + math.cos(math.pi + math.pi*i/40)*r, cy + math.sin(math.pi + math.pi*i/40)*r) for i in range(41)]
        o += O.segmented(pts, w - k*0.6, 3.5)
    return o

def rainbow_e(cx, cy, rx, ry, n=3, step=6, w=4):
    # приплюснутая радуга — для низкой полосы над экраном
    o = ''
    for k in range(n):
        a, b = rx - k*step, ry - k*step*0.45
        pts = [(cx + math.cos(math.pi + math.pi*i/48)*a, cy + math.sin(math.pi + math.pi*i/48)*b) for i in range(49)]
        o += O.segmented(pts, w - k*0.6, 3.5)
    return o

# ---------- основа F без мотивов ----------
def base(sockets=False):
    o = K.rr(0, -57, 360, 640, 0, K.LAC_LO)
    o += K.rr(4, -55, 356, 292, 34, 'url(#lac)', K.LAC_HI, 1.4)
    o += K.rr(6, 296, 354, 498, 30, 'url(#lac)', K.LAC_HI, 1.4)
    for x0, x1, y1 in [(42, 90, 492), (294, 338, 474)]:
        o += K.rr(x0, 300, x1, y1, (x1-x0)/2, 'url(#lacH)', GOLD, 1.2)
    for k, c in enumerate([GOLD_LO, GOLD]):
        d = (1-k)*5
        o += K.rr(90 - d, 318 - d, 290 + d, 460 + d, 12 + d, 'none', c, 1.2)
    o += K.rr(6, 502, 354, 634, 30, 'url(#lac)', K.LAC_HI, 1.4)
    return o

def parts(sockets=False, slot='snout'):
    return (K.wheel(sockets) + K.pachinko(sockets) + K.screen() + K.lever() + K.ready_lamp() + K.meter(54, 78, 318, 598)
            + K.coin_slot(slot) + K.dots(104, 520, 146, 546, '1×') + K.tray() + K.piggy() + K.dots(270, 492, 332, 514, '200'))

def clip(id, x0, y0, x1, y1, r, inner):
    return f'<clipPath id="{id}"><rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="{r}"/></clipPath><g clip-path="url(#{id})">{inner}</g>'

def P1(sockets=False):
    """Солнце под экраном. Веер-пятачок — главный знак между экраном и
    щелью; радуга-кольца обнимают колесо в верхнем ярусе; полосы с
    завитком — на стыках ярусов и на колоннах."""
    o = base(sockets)
    o += clip('p1a', 4, -55, 204, 292, 34, rainbow(22, 118, 196, 3, 9, 5))
    o += vcurl(201, 10, 266, 6, 1)
    o += curl_lines(30, 320, 281, 1, 1, 2, 4.5, 7)
    o += clip('p1b', 96, 462, 264, 494, 0, fan_snout(180, 489, 42, 13))
    o += curl_lines(330, 40, 622, -1, -1, 2, 4.5, 7)
    for x in (66, 316):
        o += ch(O.P([(x-12, 306 if x == 66 else 306), (x+12, 306)]), 1)
    return o + parts(sockets)

def P2(sockets=False):
    """Пятак — это щель. Веер расходится от щели-пятачка по бордовой вставке
    цоколя; радуга-кольца над экраном, как маркиза; полосы с завитком — в
    верхнем ярусе (стык колеса и пачинко, корона)."""
    o = base(sockets)
    o += curl_lines(206, 340, -46, 1, 1, 2, 4.2, 6)
    o += vcurl(201, 30, 266, 7, 1)
    o += clip('p2a', 60, 293, 300, 314, 0, rainbow_e(190, 316, 104, 20, 3, 6, 3.8))
    o += K.rr(6, 286, 354, 292, 2, 'url(#gold)')
    o += K.rr(96, 504, 256, 562, 24, 'url(#bur)', GOLD, 1.2)
    o += clip('p2b', 96, 504, 256, 562, 24, fan_snout(180, 548, 74, 17, snout=False, w=1))
    o += curl_lines(40, 330, 624, 1, -1, 2, 4.5, 7)
    return o + parts(sockets)

def P3(sockets=False):
    """Полосы ведут. Полосы с завитком — длинные, по всем трём стыкам, концы
    закручены к рычагу и шкале; радуга-кольца — вокруг щели (ворота), веер-
    пятачок — корона над пачинко и малый под экраном не нужен."""
    o = base(sockets)
    o += clip('p3a', 204, -55, 356, -38, 0, fan_snout(273, -38, 58, 13, snout=True, w=1))
    o += clip('p3c', 4, -55, 204, 292, 34, fan_snout(22, 118, 240, 21, snout=False, a0=-math.pi/2, a1=math.pi/2, w=0.9))
    o += curl_lines(24, 286, 281, 1, 1, 3, 4.2, 8)
    o += curl_lines(330, 100, 474, -1, 1, 2, 4.5, 7)
    o += K.rr(96, 504, 256, 562, 24, 'url(#bur)', GOLD, 1.2)
    o += clip('p3b', 96, 504, 256, 562, 24, rainbow(180, 562, 54, 3, 9, 4.5))
    o += curl_lines(30, 300, 624, 1, -1, 3, 4, 7)
    return o + parts(sockets)

for k, f in {'P1': P1, 'P2': P2, 'P3': P3}.items():
    open(f'{out}{k}.svg', 'w').write(K.svg(f()))
