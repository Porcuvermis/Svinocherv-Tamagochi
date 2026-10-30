# Исполнение чеканки: тот же кусок цоколя (схема разд. 4а плана 31), четыре
# способа. Игрок о первой пробе (chase.py): «просто выпирающая штука, скучно»
# — круглый валик одной толщины читается приклеенным шлангом. Здесь:
#   v      — гранёная: острое ребро, две плоские грани, линия сужается к концам;
#   flat   — плоская полированная площадка с фаской (кант ар-деко);
#   engr   — заподлицо, по середине гравированный V-рез: две светлые кромки;
#   guil   — гранёная + гильоше на пятачке и губе лотка (волнистая насечка
#            переливается при наклоне), ребристые кольца червя.
# Завитки полос — вложенные концентрично, полосы их не пересекают.
import math, sys

H0, HMAX, S = 12, 32, 3
BOX = (90, 495, 270, 640)
LAC, BUR, GOLD, GOLD_D, PIT, INK = '#1a1312', '#6e1424', '#d6ad52', '#7a5a1e', '#050303', '#1c0f06'
SHINE = {'lacquer': (0.60, 0.75, 0), 'gold': (0.90, 0.88, 1), 'satin': (0.55, 0.35, 1), 'hole': (0, 0, 0)}

def hv(h):
    v = max(0, min(255, round((h + H0) / HMAX * 255)))
    return f'rgb({v},{v},{v})'

def mv(m):
    return 'rgb(' + ','.join(str(round(x * 255)) for x in SHINE[m]) + ')'

def arcpts(cx, cy, r, a0=math.pi, a1=2 * math.pi, n=60):
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * r, cy + math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + 1)]

def taper_both(n):
    # толщина по длине: к обоим концам тоньше (0.45), в середине — полная
    return [0.72 + 0.28 * math.sin(math.pi * i / n) for i in range(n + 1)]

def curls():
    """Три полосы, концы которых заворачивают ВЛОЖЕННО вокруг общего
    центра: внешняя полоса — внешний виток, внутренняя — туже. Центр
    завитков выше полос; полосы снизу, поэтому друг друга не пересекают."""
    gap, R0 = 4.6, 13.5
    cx, cy = 248, 624 + 2 * gap - R0     # общий центр завитков
    out = []
    for k in range(3):
        y = 624 + (2 - k) * gap           # нижняя полоса — внешняя
        r = cy - y if False else (y - cy)
        x0 = 100 + k * 8
        pts = [(x0 + (cx - x0) * i / 30, y) for i in range(31)]
        # дуга от низа (угол π/2) против часовой — вверх по правой стороне
        turn = [0.7, 0.95, 1.5][k]
        n = 40
        for i in range(1, n + 1):
            t = i / n
            a = math.pi / 2 - t * turn * 2 * math.pi
            rr = r * (1 - t * [0.12, 0.3, 0.7][k])
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        wid = [0.6 + 0.4 * min(1, i / 10) for i in range(len(pts))]  # левый конец чуть тоньше
        wid = [w * (1 - 0.4 * max(0, i - (len(pts) - 12)) / 12) for i, w in enumerate(wid)]
        out.append((pts, wid, 1.6 - k * 0.15))
    return out

# ---------- геометрия детали ----------
def lines():
    """Линии орнамента: (точки, толщины по точкам, базовая ширина, высота)."""
    L = []
    for k, (r, w) in enumerate([(54, 4.4), (45, 3.8), (36, 3.2)]):
        pts = arcpts(180, 562, r)
        L.append(('arc', pts, taper_both(len(pts) - 1), w, 1.9 - k * 0.2))
    for pts, wid, w in curls():
        L.append(('curl', pts, wid, w, 1.3))
    return L

def seg_strokes(pts, wid, w, col):
    o = ''
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        o += f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="{col}" stroke-width="{w * (wid[i] + wid[i+1]) / 2:.2f}" stroke-linecap="round"/>'
    return o

def profile(pts, wid, w, h, kind, N=8):
    """Проход высот: профиль сечения линии. Стопка обводок с плавным шагом
    и лёгким размытием даёт РОВНЫЙ скат, а не ступени (шаг меньше уровня
    карты, ловушка 170)."""
    o = ''
    if kind == 'leaf':
        # роспись заподлицо: высота — та, на чём лежит (корпус или вставка)
        return seg_strokes(pts, wid, w, hv(h))
    if kind in ('v', 'guil'):
        for i in range(N):
            f = 1 - i / N
            o += seg_strokes(pts, wid, w * f, hv(h * (i + 1) / N))
    elif kind == 'flat':
        b = 0.3
        for i in range(N):
            f = 1 - b * 2 * i / N
            o += seg_strokes(pts, wid, w * f, hv(h * 0.85 * (i + 1) / N))
    elif kind == 'engr':
        o += seg_strokes(pts, wid, w, hv(0.5))
        for i in range(4):
            o += seg_strokes(pts, wid, w * (0.42 - i * 0.09), hv(0.5 - 0.35 * (i + 1)))
    return f'<g filter="url(#rb)">{o}</g>'

def snout(pass_, kind):
    cx, cy, rx, ry = 180, 528, 30, 22
    o = ''
    if pass_ == 'height' and kind == 'leaf':
        return f'<path d="M177.5 517 H182.5 V539 H177.5 Z" fill="{hv(-6)}"/>'
    if pass_ == 'height':
        if kind == 'flat':
            o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{hv(1.6)}"/><ellipse cx="{cx}" cy="{cy}" rx="{rx-1.2}" ry="{ry-1.2}" fill="{hv(2.2)}" filter="url(#rb)"/>'
        elif kind == 'engr':
            o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{hv(0.5)}"/>'
            for i in range(3):
                o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx-3.4-i*0.25}" ry="{ry-3.4-i*0.25}" fill="none" stroke="{hv(0.5-0.3*(i+1))}" stroke-width="{1.4-i*0.4}"/>'
        else:
            # Гранёный пятак: ребро по кругу на 0.8 радиуса, к краю и к
            # середине — ровные скаты. ОДНОЙ формой — радиальным градиентом,
            # узлы toFixed(4). Было: стопка из 10 эллипсов — кольца-ступени
            # (ловушка 170).
            prof = lambda t: 0.4 + 2.6 * (t / 0.8 if t < 0.8 else 1 - (t - 0.8) / 0.2 * 0.85)
            stops = ''.join(f'<stop offset="{i/40:.4f}" stop-color="{hv(prof(i/40))}"/>' for i in range(41))
            o += f'<radialGradient id="sn" cx="0.5" cy="0.5" r="0.5">{stops}</radialGradient>'
            o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#sn)"/>'
            if kind == 'guil':
                # гильоше: волнистые концентрические бороздки
                for k in range(9):
                    pts = []
                    for i in range(73):
                        a = 2 * math.pi * i / 72
                        r = 1 - k * 0.075 + 0.018 * math.sin(a * 12)
                        pts.append((cx + math.cos(a) * rx * 0.62 * r * 1.0, cy + math.sin(a) * ry * 0.62 * r))
                    d = 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z'
                    o += f'<path d="{d}" fill="none" stroke="{hv(2.0 - 0.25)}" stroke-width="0.5"/>'
        # бордовое зеркало и щель
        o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*0.5}" ry="{ry*0.5}" fill="{hv(1.0)}"/>' if kind != 'guil' else ''
        o += f'<path d="M177.5 517 H182.5 V539 H177.5 Z" fill="{hv(-6)}"/>'
        for s in (-1, 1):
            o += f'<ellipse cx="{cx+s*13}" cy="{cy}" rx="2.2" ry="3" fill="{hv(2.6)}" filter="url(#rb)"/>'
        return o
    col = (lambda m, c: mv(m) if pass_ == 'mat' else c)
    if pass_ == 'albedo':
        o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx+0.6}" ry="{ry+0.6}" fill="{INK}"/>'
    o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{col("gold", GOLD)}"/>'
    if kind != 'guil':
        o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*0.5}" ry="{ry*0.5}" fill="{col("lacquer", BUR)}"/>'
    if kind == 'engr' and pass_ == 'albedo':
        o += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx-3.4}" ry="{ry-3.4}" fill="none" stroke="{GOLD_D}" stroke-width="0.6"/>'
    o += f'<path d="M177.5 517 H182.5 V539 H177.5 Z" fill="{col("hole", PIT)}"/>'
    for s in (-1, 1):
        o += f'<ellipse cx="{cx+s*13}" cy="{cy}" rx="2.2" ry="3" fill="{col("gold", GOLD)}"/>'
    return o

def svg(pass_, kind):
    x0, y0, x1, y1 = BOX
    col = (lambda m, c, h: mv(m) if pass_ == 'mat' else (hv(h) if pass_ == 'height' else c))
    o = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {x1-x0} {y1-y0}" width="{(x1-x0)*S}" height="{(y1-y0)*S}">'
         '<defs><filter id="rb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.3"/></filter></defs>')
    o += f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="{col("lacquer", LAC, 0)}"/>'
    ins = 'M120 504 H232 A24 24 0 0 1 256 528 V538 A24 24 0 0 1 232 562 H120 A24 24 0 0 1 96 538 V528 A24 24 0 0 1 120 504 Z'
    o += f'<path d="{ins}" fill="{col("lacquer", BUR, -1.2)}"/>'
    # кант вставки — тем же исполнением
    kp = []
    import re
    # кант как полоса по контуру: точки по скруглённому прямоугольнику
    def rrect(x0, y0, x1, y1, r, n=16):
        pts = []
        for (cx, cy, a0) in [(x1 - r, y0 + r, -math.pi / 2), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, math.pi / 2), (x0 + r, y0 + r, math.pi)]:
            pts += [(cx + math.cos(a0 + math.pi / 2 * i / n) * r, cy + math.sin(a0 + math.pi / 2 * i / n) * r) for i in range(n + 1)]
        return pts + [pts[0]]
    kant = rrect(96, 504, 256, 562, 24)
    # лоток
    o += f'<path d="M128 566 H232 A8 8 0 0 1 240 574 V610 A8 8 0 0 1 232 618 H128 A8 8 0 0 1 120 610 V574 A8 8 0 0 1 128 566 Z" fill="{col("gold", GOLD, 0 if kind == "leaf" else 1.0)}"/>'
    o += f'<path d="M130 571 H230 A5 5 0 0 1 235 576 V609 A5 5 0 0 1 230 614 H130 A5 5 0 0 1 125 609 V576 A5 5 0 0 1 130 571 Z" fill="{col("hole", PIT, -8)}"/>'
    allL = lines() + [('kant', kant, [1] * len(kant), 1.6, 1.0)]
    if pass_ == 'height':
        for name, pts, wid, w, h in allL:
            if kind == 'leaf':
                # дуги и кант — на бордовой вставке (−1.2) или корпусе (0)
                continue
            o += profile(pts, wid, w, h, kind)
            if kind == 'leaf':
                pass
            elif kind == 'guil' and name == 'arc':
                # кольца червя — рёбрышки поперёк (выше грани), не желобки
                n = len(pts) - 1
                for i in range(1, n, 2):
                    (xa, ya), (xb, yb) = pts[i - 1], pts[i + 1]
                    L = math.hypot(xb - xa, yb - ya); nx, ny = -(yb - ya) / L, (xb - xa) / L
                    x, y = pts[i]; ww = w * wid[i] * 0.5
                    o += f'<line x1="{x+nx*ww:.2f}" y1="{y+ny*ww:.2f}" x2="{x-nx*ww:.2f}" y2="{y-ny*ww:.2f}" stroke="{hv(h*0.75)}" stroke-width="0.45"/>'
            elif name == 'arc' and kind != 'guil':
                n = len(pts) - 1
                # кольца червя — желобки поперёк, шире 4 текселей нормали,
                # иначе шейдер их не видит (первая проба: сегменты пропали)
                for i in range(2, n, 2):
                    (xa, ya), (xb, yb) = pts[i - 1], pts[i + 1]
                    L = math.hypot(xb - xa, yb - ya); nx, ny = -(yb - ya) / L, (xb - xa) / L
                    x, y = pts[i]; ww = w * wid[i] * 0.42
                    o += f'<line x1="{x+nx*ww:.2f}" y1="{y+ny*ww:.2f}" x2="{x-nx*ww:.2f}" y2="{y-ny*ww:.2f}" stroke="{hv(h*0.35)}" stroke-width="0.95" stroke-linecap="round" filter="url(#rb)"/>'
    else:
        if pass_ == 'albedo':
            # тушевой контур: в игре всё обведено, золото без контура
            # читалось чужой, «компьютерной» вещью
            for name, pts, wid, w, h in allL:
                o += seg_strokes(pts, wid, w + 1.1, INK)
        for name, pts, wid, w, h in allL:
            o += seg_strokes(pts, wid, w, col('gold', GOLD, 0))
            if kind == 'engr' and pass_ == 'albedo':
                o += seg_strokes(pts, wid, w * 0.2, GOLD_D)
        if kind == 'guil' and pass_ == 'albedo':
            pass
    o += snout(pass_, kind)
    return o + '</svg>'

out = sys.argv[1]
for kind in ('v', 'flat', 'engr', 'guil', 'leaf'):
    for p in ('albedo', 'height', 'mat'):
        open(f'{out}{kind}-{p}.svg', 'w').write(svg(p, kind))
