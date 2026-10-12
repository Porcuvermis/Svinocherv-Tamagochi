# Генератор опорных контуров унитаза: переписывает блок GEO в
# src/minigames/lust/bath-toilet.js. Запуск: python3 tools/gen-toilet-geo.py
# Та же модель (tools/models/bath-models.js: TOILET_RINGS, eggSlab, бачок),
# та же постановка (LAYOUT.toilet) и та же камера запекания. Выход — контуры
# частей в координатах сцены. Проверка: якоря должны совпасть с bath-baked.js.
#
# Числа постановки и колец ПОВТОРЯЮТ tools/models/bath-models.js (LAYOUT.toilet,
# TOILET_RINGS, eggSlab, бачок). Поменяли там — поменять здесь и перезапустить:
# проверка в конце сверяет якоря с запечёнными и не пишет файл при расхождении.
import math, json, re, os, sys

K = 330 / math.tan(math.radians(10))
def P(X, Y, Z):
    d = 46 - Z
    return (360 + K * X / d, 760 - K * (Y - 4.2) / d)

L = dict(x=3.48, z=18, s=0.78, rotY=30, tilt=3.5)
RINGS = [(4.00, 0.000, 2.420, 1.82), (3.88, 0.000, 2.500, 1.88), (3.55, -0.010, 2.470, 1.86),
         (2.90, 0.010, 2.410, 1.80), (2.15, 0.130, 2.250, 1.62), (1.40, 0.385, 1.935, 1.30),
         (0.90, 0.690, 1.590, 1.08), (0.45, 0.855, 1.405, 1.00), (0.00, 0.895, 1.365, 1.02)]
th = math.radians(L['rotY']); C, S = math.cos(th), math.sin(th)
def W0(lx, ly, lz):
    return (L['x'] + (lx * C + lz * S) * L['s'], ly * L['s'], L['z'] + (-lx * S + lz * C) * L['s'])
def egg(cx, a, b, n=96):
    return [(cx + a * math.cos(2 * math.pi * i / n), b * math.sin(2 * math.pi * i / n) * (1 + 0.1 * math.cos(2 * math.pi * i / n))) for i in range(n)]
r = RINGS[-1]
PIV = max((W0(px, 0, pz) for px, pz in egg(r[1], r[2], r[3])), key=lambda v: v[2])
tl = math.radians(L['tilt']); tc, ts = math.cos(tl), math.sin(tl)
def W(lx, ly, lz):
    p = W0(lx, ly, lz); y, z = p[1] - PIV[1], p[2] - PIV[2]
    return (p[0], PIV[1] + y * tc - z * ts, PIV[2] + y * ts + z * tc)
def S2(lx, ly, lz): return P(*W(lx, ly, lz))

anch = {k: S2(*v) for k, v in dict(toiletFoot=(0.895, 0, 0), toiletNose=(-2.5, 0, 0),
        toiletBack=(4.13, 0, 0), toiletLid=(-1.7, 4.45, 1.80)).items()}

def hull(pts):
    pts = sorted(set((round(x, 2), round(y, 2)) for x, y in pts))
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

# ---- чаша: по высоте — крайние левая/правая точки кольца; низ — ближняя дуга подошвы
# Профиль между кольцами — монотонный кубический сплайн (Фрич — Карлсон), а
# НЕ прямые: с линейной интерполяцией контур чаши ломался на каждом кольце, и
# на крупном плане унитаз читался гранёным («полигональными кусками»). Сплайн
# гладкий и не перелетает за значения колец, так что валик кромки не раздувает.
def _pchip(xs, ys):
    n = len(xs); h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    dl = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [dl[0]] + [0.0] * (n - 2) + [dl[-1]]
    for i in range(1, n - 1):
        if dl[i - 1] * dl[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    def f(x):
        i = max(0, min(n - 2, next((k for k in range(n - 1) if x <= xs[k + 1]), n - 2)))
        t = (x - xs[i]) / h[i]; t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f
_R = sorted(RINGS)                       # по возрастанию высоты
_CX, _A, _B = (_pchip([r[0] for r in _R], [r[k] for r in _R]) for k in (1, 2, 3))
def ring_at(y):
    y = max(0.0, min(4.0, y))
    return (_CX(y), _A(y), _B(y))
left, right = [], []
ys = [4.0 - i * 0.1 for i in range(41)]
for y in ys:
    cx, a, b = ring_at(max(0.0, y))
    pts = [S2(px, max(0.0, y), pz) for px, pz in egg(cx, a, b)]
    left.append(min(pts)); right.append(max(pts))
bot = [S2(px, 0, pz) for px, pz in egg(r[1], r[2], r[3])]
lx_, rx_ = min(bot), max(bot)
def below(p, a, b):
    t = (p[0] - a[0]) / ((b[0] - a[0]) or 1); return p[1] >= a[1] + (b[1] - a[1]) * t - 0.01
front_arc = sorted([p for p in bot if below(p, lx_, rx_)])
bowl = left + front_arc + right[::-1]
# высоты-ориентиры чаши в сцене: пузо, шея, подошва — по левому краю
marks = {}
for name, y in dict(rim=3.88, belly=2.9, under=2.15, neck=0.9, sole=0.0).items():
    cx, a, b = ring_at(y)
    pts = [S2(px, y, pz) for px, pz in egg(cx, a, b)]
    marks[name] = dict(l=min(pts), r=max(pts), y=sum(p[1] for p in pts) / len(pts))

# ---- граница тени под пузом: ближняя дуга кольца на высоте 1.75
cx_, a_, b_ = ring_at(1.75)
belt = [S2(px, 1.75, pz) for px, pz in egg(cx_, a_, b_)]
bl_, br_ = min(belt), max(belt)
belt_low = sorted([p for p in belt if below(p, bl_, br_)])

# ---- сиденье и крышка: выпуклые плиты, контур = оболочка торцов и пояса
def slab(cx, a, b, y0, h, bev):
    caps = [S2(px, y0 - bev, pz) for px, pz in egg(cx, a, b)] + [S2(px, y0 + h + bev, pz) for px, pz in egg(cx, a, b)]
    belt = [S2(px, yy, pz) for yy in (y0, y0 + h) for px, pz in egg(cx, a + bev, b + bev)]
    top = [S2(px, y0 + h + bev, pz) for px, pz in egg(cx, a, b)]
    lowbelt = [S2(px, y0, pz) for px, pz in egg(cx, a + bev, b + bev)]
    return hull(caps + belt), top, lowbelt
seat, seat_top, seat_low = slab(0.05, 2.36, 1.78, 4.0, 0.14, 0.05)
lid, lid_top, lid_low = slab(0.12, 2.26, 1.72, 4.22, 0.16, 0.07)

# ---- бачок: скруглённая коробка (r 0.4 в плане), x 2.3..4.0, z ±1.85, y 4.0..7.45
def rrect(cx, hw, hd, rr, n=6):
    out = []
    for (qx, qz, a0) in [(cx + hw - rr, hd - rr, 0), (cx - hw + rr, hd - rr, 90), (cx - hw + rr, -hd + rr, 180), (cx + hw - rr, -hd + rr, 270)]:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n); out.append((qx + rr * math.cos(a), qz + rr * math.sin(a)))
    return out
tank_plan = rrect(3.15, 0.85, 1.85, 0.4)
tank = hull([S2(px, y, pz) for y in (4.0, 7.45) for px, pz in tank_plan])
# грань к чаше (локальный -x) и грань к нам (+z): их общее ребро — угол (2.3, +1.85)
def face(pts3): return [S2(*p) for p in pts3]
tank_front = face([(2.3, 4.0, -1.45), (2.3, 4.0, 1.45), (2.3, 7.45, 1.45), (2.3, 7.45, -1.45)])
tank_side = face([(2.7, 4.0, 1.85), (3.6, 4.0, 1.85), (3.6, 7.45, 1.85), (2.7, 7.45, 1.85)])
tank_edge = face([(2.3 + 0.4 - 0.4 * math.cos(math.radians(45)), 4.0, 1.85 - 0.4 + 0.4 * math.sin(math.radians(45))),
                  (2.3 + 0.4 - 0.4 * math.cos(math.radians(45)), 7.45, 1.85 - 0.4 + 0.4 * math.sin(math.radians(45)))])
tlid_plan = rrect(3.15, 0.975, 1.975, 0.3)
tank_lid = hull([S2(px, y, pz) for y in (7.39, 7.73) for px, pz in tlid_plan])
tank_lid_low = [S2(px, 7.45, pz) for px, pz in tlid_plan]

def R1(pts, step=1):
    return [[round(p[0], 1), round(p[1], 1)] for p in pts[::step]]
out = dict(anchors={k: [round(v[0], 1), round(v[1], 1)] for k, v in anch.items()},
           bowl=R1(bowl), seat=R1(seat), seatLow=R1(seat_low, 2), lid=R1(lid), lidTop=R1(lid_top, 2), lidLow=R1(lid_low, 2),
           tank=R1(tank), tankFront=R1(tank_front), tankSide=R1(tank_side), tankEdge=R1(tank_edge),
           tankLid=R1(tank_lid), beltLow=R1(belt_low, 2), tankLidLow=R1(tank_lid_low, 2),
           marks={k: dict(l=[round(v['l'][0], 1), round(v['l'][1], 1)], r=[round(v['r'][0], 1), round(v['r'][1], 1)], y=round(v['y'], 1)) for k, v in marks.items()})

# ---- сверка с запеканием: якоря обязаны совпасть, иначе цифры здесь устарели
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
baked = open(os.path.join(ROOT, 'src/minigames/lust/bath-baked.js')).read()
bad = []
for k, v in out['anchors'].items():
    m = re.search(r'"?%s"?\s*:\s*\{\s*"?x"?\s*:\s*([-\d.]+)\s*,\s*"?y"?\s*:\s*([-\d.]+)' % k, baked)
    if not m: bad.append(f'{k}: нет в bath-baked.js'); continue
    bx, by = float(m.group(1)), float(m.group(2))
    if abs(bx - v[0]) > 0.6 or abs(by - v[1]) > 0.6: bad.append(f'{k}: здесь {v}, в запекании {[bx, by]}')
if bad:
    sys.exit('якоря разошлись с bath-baked.js — числа постановки устарели:\n  ' + '\n  '.join(bad))

# ---- прорежение: хватит точек на гладкую кривую, лишние — вес
out['bowl'] = out['bowl'][::2]
def dedup(pts):
    res = []
    for p in pts:
        if not res or abs(p[0] - res[-1][0]) + abs(p[1] - res[-1][1]) > 3.5: res.append(p)
    return res
for k in ('seat', 'lid', 'tank', 'tankLid'):
    out[k] = dedup(out[k])
lines = ['GEO: {']
for k, v in out.items():
    lines.append(f'        {k}: {json.dumps(v, separators=(",", ":"))},')
lines.append('    },')
dst = os.path.join(ROOT, 'src/minigames/lust/bath-toilet.js')
src = open(dst).read()
new, n = re.subn(r'GEO: \{\n.*?\n    \},', lambda _: '\n'.join(lines), src, count=1, flags=re.S)
if n != 1: sys.exit('блок GEO в bath-toilet.js не найден')
open(dst, 'w').write(new)
print('GEO обновлён', {k: len(v) for k, v in out.items() if isinstance(v, list)})
