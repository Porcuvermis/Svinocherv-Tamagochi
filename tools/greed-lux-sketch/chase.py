# Пробная плашка чеканкой для шейдера аппарата: кусок цоколя версии 2 по
# принятой схеме (разд. 4а плана 31) — бордовая вставка, дуги-ворота из
# колец червя вокруг щели-пятачка, край лотка, полосы с завитком.
# Три карты, как у деталей аппарата (docs/materials.md): цвет без своего
# света, высоты (h → (h + H0) / HMAX), материал (блеск, острота, металл).
# Рельеф чеканки — размытой обводкой (валик), не стопкой слоёв (ловушка 170).
import math, sys

H0, HMAX, S = 12, 32, 3
BOX = (90, 495, 270, 640)          # участок поля
LAC, BUR, GOLD, PIT = '#1a1312', '#6e1424', '#c9a24a', '#050303'
SHINE = {'lacquer': (0.55, 0.70, 0), 'gold': (0.62, 0.62, 1), 'hole': (0, 0, 0)}

def hv(h):
    v = max(0, min(255, round((h + H0) / HMAX * 255)))
    return f'rgb({v},{v},{v})'

def mv(m):
    return 'rgb(' + ','.join(str(round(x * 255)) for x in SHINE[m]) + ')'

def spiral(cx, cy, r0, turns, a0, sign, n=50):
    return [(cx + math.cos(a0 + sign * t / n * turns * 2 * math.pi) * r0 * (1 - t / n * 0.85),
             cy + math.sin(a0 + sign * t / n * turns * 2 * math.pi) * r0 * (1 - t / n * 0.85)) for t in range(n + 1)]

def P(pts):
    return 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts)

def arc(cx, cy, r, n=48):
    return [(cx + math.cos(math.pi + math.pi * i / n) * r, cy + math.sin(math.pi + math.pi * i / n) * r) for i in range(n + 1)]

# Детали: (вид, геометрия, материал, высота, цвет, ширина обводки)
# вид: 'fill' — площадка; 'rod' — валик чеканки (выпуклый, по центру выше);
# 'dome' — купол (эллипс); 'groove' — желобок (ниже соседей).
def parts():
    L = []
    L.append(('fill', f'M{BOX[0]} {BOX[1]} H{BOX[2]} V{BOX[3]} H{BOX[0]} Z', 'lacquer', 0, LAC, 0))
    # бордовая вставка утоплена, по краю — золотой кант
    ins = 'M120 504 H232 A24 24 0 0 1 256 528 V538 A24 24 0 0 1 232 562 H120 A24 24 0 0 1 96 538 V528 A24 24 0 0 1 120 504 Z'
    L.append(('fill', ins, 'lacquer', -1.2, BUR, 0))
    L.append(('rod', ins, 'gold', 1.0, GOLD, 1.6))
    # дуги-ворота: тело червя, кольца — желобками поперёк
    for k, (r, w) in enumerate([(54, 4.6), (45, 4.0), (36, 3.4)]):
        pts = arc(180, 562, r)
        L.append(('rod', P(pts), 'gold', 1.8 - k * 0.2, GOLD, w))
        for i in range(2, 48, 2 if k else 2):
            a = math.pi + math.pi * i / 48
            x0, y0 = 180 + math.cos(a) * (r - w * 0.5), 562 + math.sin(a) * (r - w * 0.5)
            x1, y1 = 180 + math.cos(a) * (r + w * 0.5), 562 + math.sin(a) * (r + w * 0.5)
            L.append(('groove', f'M{x0:.2f} {y0:.2f} L{x1:.2f} {y1:.2f}', 'gold', 1.0 - k * 0.2, '#8a6a28', 0.55))
    # лоток: золотая губа, дыра
    tray = 'M128 566 H232 A8 8 0 0 1 240 574 V610 A8 8 0 0 1 232 618 H128 A8 8 0 0 1 120 610 V574 A8 8 0 0 1 128 566 Z'
    L.append(('fill', tray, 'gold', 1.4, GOLD, 0))
    L.append(('fill', 'M130 571 H230 A5 5 0 0 1 235 576 V609 A5 5 0 0 1 230 614 H130 A5 5 0 0 1 125 609 V576 A5 5 0 0 1 130 571 Z', 'hole', -8, PIT, 0))
    # щель-пятачок: золотой купол, бордовое зеркало, щель, «ноздри»
    L.append(('dome', (180, 528, 30, 22), 'gold', 2.6, GOLD, 0))
    L.append(('dome', (180, 528, 24.5, 17), 'lacquer', 1.2, BUR, 0))
    L.append(('fill', 'M177.5 517 H182.5 V539 H177.5 Z', 'hole', -6, PIT, 0))
    for s in (-1, 1):
        L.append(('dome', (180 + s * 13, 528, 2.4, 3.2), 'gold', 2.2, GOLD, 0))
    # полосы с завитком внизу цоколя
    for k in range(3):
        y, x1, r = 624 + k * 4.5, 262 - k * 10, 7 - k * 2
        L.append(('rod', P([(98 + k * 6, y), (x1, y)] + spiral(x1, y - r, r, 1.6, math.pi / 2, -1)), 'gold', 1.1, GOLD, 1.5 - k * 0.2))
    return L

def svg(pass_):
    x0, y0, x1, y1 = BOX
    o = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {x1-x0} {y1-y0}" width="{(x1-x0)*S}" height="{(y1-y0)*S}">'
         '<defs><filter id="rb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.45"/></filter></defs>')
    for kind, g, m, h, col, w in parts():
        if pass_ == 'albedo':
            c = col
        elif pass_ == 'mat':
            c = mv(m)
        else:
            c = hv(h)
        if kind == 'fill':
            o += f'<path d="{g}" fill="{c}"/>'
        elif kind == 'dome':
            cx, cy, rx, ry = g
            if pass_ == 'height':
                # купол — радиальным градиентом одной формой; узлы — toFixed(4)
                gid = f'd{cx}{cy}{rx}'.replace('.', '_')
                o += (f'<radialGradient id="{gid}" cx="0.5" cy="0.5" r="0.5">' +
                      ''.join(f'<stop offset="{t:.4f}" stop-color="{hv(h - 1.6 * (1 - math.sqrt(max(0, 1 - t * t))))}"/>' for t in [i / 12 for i in range(13)]) +
                      '</radialGradient>')
                o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#{gid})"/>'
            else:
                o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{c}"/>'
        elif kind == 'rod':
            if pass_ == 'height':
                # валик: широкая обводка на полвысоты и узкая на всю, размыто
                o += f'<path d="{g}" fill="none" stroke="{hv(h * 0.55)}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
                o += f'<path d="{g}" fill="none" stroke="{hv(h)}" stroke-width="{w * 0.55}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rb)"/>'
            else:
                o += f'<path d="{g}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
        elif kind == 'groove':
            o += f'<path d="{g}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>'
    return o + '</svg>'

out = sys.argv[1]
for p in ('albedo', 'height', 'mat'):
    open(f'{out}chase-{p}.svg', 'w').write(svg(p))
