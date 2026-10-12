# Генератор контуров стопки журналов на крышке унитаза: переписывает блок GEO в
# src/minigames/lust/bath-mag.js. Запуск: python3 tools/gen-mag-geo.py [путь]
#
# Постановка F2 (утверждена игроком, docs/plan/21-lust-bath.md, разд. 7б):
# два нижних журнала лежат вразнобой корешками к камере, верхний лежит на
# стопке косо, съехал к носику крышки и МЯГКО свисает через край обложкой к
# игроку. Числа — в координатах МОДЕЛИ унитаза (до масштаба, поворота и
# наклона), поэтому стопка едет вместе с унитазом при любой его постановке.
#
# Проекция НЕ повторяется здесь, а берётся у tools/gen-toilet-geo.py (его голова
# до якорей: камера, LAYOUT.toilet, поворот, наклон вокруг передней точки
# подошвы). Одна камера на унитаз и журналы — разъехаться они не могут.
#
# Почему генератор, а не подбор глазом: провис верхнего журнала — дуга в
# пространстве, и её проекция при наклоне и повороте унитаза глазом не
# угадывается (в наброске были шесть плоских кусков и врущие стыки граней).
# Здесь дуга считается гладко, видимость граней — по нормали к камере, порядок
# рисования — честный: снизу вверх по стопке, внутри журнала грани выпуклой
# плиты друг друга не перекрывают.
import math, json, re, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_src = open(os.path.join(ROOT, 'tools/gen-toilet-geo.py')).read()
exec(_src[:_src.index('anch = ')])          # K, P, L, W, S2 — та же камера, что у унитаза

CAM = (0.0, 4.2, 46.0)
# Свет сцены: вектор НА источник (tools/bake-3d-core.js, LIGHT) — слева, сверху,
# чуть от зрителя. По нему считаются тона граней и перелив по провису.
LIGHT = (-0.55, 0.78, 0.42)
_ln = math.sqrt(sum(c * c for c in LIGHT)); LIGHT = tuple(c / _ln for c in LIGHT)

Y = 4.45                                    # верх крышки (eggSlab крышки: 4.22 + 0.16 + 0.07)

def add(*vs): return tuple(sum(v[i] for v in vs) for i in range(3))
def mul(v, k): return tuple(c * k for c in v)
def sub(a, b): return tuple(a[i] - b[i] for i in range(3))
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(v): n = math.sqrt(dot(v, v)) or 1; return tuple(c / n for c in v)
def rot(v, deg):                            # поворот в плоскости крышки (x, z)
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c)
UP = (0.0, 1.0, 0.0)

def world_normal(p, n):
    # Нормаль из координат модели в мир: W — поворот, равный масштаб и наклон,
    # то есть ориентацию сохраняет; нормаль — разность образов двух точек.
    a, b = W(*p), W(*add(p, mul(n, 0.05)))
    return unit(sub(b, a))
def facing(p, n):
    wp, wn = W(*p), world_normal(p, n)
    return dot(wn, unit(sub(CAM, wp)))
def tone(p, n):
    return dot(world_normal(p, n), LIGHT)

def R1(pts): return [[round(x, 1), round(y, 1)] for x, y in pts]
def scr(pts3): return R1([S2(*p) for p in pts3])

# ---------- ЖУРНАЛ-ПЛИТА (нижние) ----------
# o — угол на крышке, ang — разворот в плоскости крышки, l × w — размер,
# t — толщина. Корешок — грань, что смотрит к камере (ближний длинный бок).
def slab_mag(o, ang, l, w, t):
    ex, ez, ey = rot((l, 0, 0), ang), rot((0, 0, w), ang), (0, t, 0)
    c = lambda a, b, h: add(o, mul(ex, a), mul(ez, b), mul(ey, h))
    mid = c(0.5, 0.5, 0.5)
    faces = {
        'top':   [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)],
        'near':  [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],   # +ez
        'far':   [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)],
        'left':  [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)],   # -ex
        'right': [c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)],
    }
    out = {}
    for k, q in faces.items():
        cen = tuple(sum(p[i] for p in q) / 4 for i in range(3))
        n = unit(cross(sub(q[1], q[0]), sub(q[3], q[0])))
        if dot(n, sub(cen, mid)) < 0: n = mul(n, -1)
        if facing(cen, n) <= 0: continue
        out[k] = dict(pts=scr(q), tone=round(tone(cen, n), 3))
        # Линии листов на торцах страниц — параллельно обложке, вразнобой.
        if k in ('left', 'right', 'far') or (k == 'near' and False):
            pass
    # Торцы страниц: всё, кроме корешка (near) и верха, — бумага с листами.
    lines = []
    for k in ('left', 'right', 'far'):
        if k in out:
            q = faces[k]
            for h in (0.3, 0.52, 0.74):
                a = add(q[0], mul(sub(q[3], q[0]), h)); b = add(q[1], mul(sub(q[2], q[1]), h))
                lines.append(scr([add(a, mul(sub(b, a), 0.06)), add(a, mul(sub(b, a), 0.94))]))
    out['pageLines'] = lines
    return out

# ---------- ВЕРХНИЙ ЖУРНАЛ С ПРОВИСОМ ----------
# Лежит плашмя до доли v0 ширины, дальше гладкой дугой (постоянный радиус,
# длина дуги = остаток ширины) перегибается вниз на deg. s — вдоль ширины (в
# сторону носика крышки), r — вдоль длины, h — по толщине (0 низ, t обложка).
def top_mag(o, ang, l, w, t, v0, deg):
    eu = unit(rot((0, 0, 1), ang)); er = unit(rot((1, 0, 0), ang))
    s0 = w * v0; th = math.radians(deg); R = (w - s0) / th
    def frame(s):
        if s <= s0: return add(o, mul(eu, s)), UP
        a = (s - s0) / R
        pos = add(o, mul(eu, s0 + R * math.sin(a)), mul(UP, -R * (1 - math.cos(a))))
        return pos, add(mul(UP, math.cos(a)), mul(eu, math.sin(a)))
    def pt(s, r, h):
        pos, n = frame(s)
        return add(pos, mul(er, r), mul(n, h))
    ss = [s0 * k / 4 for k in range(4)] + [s0 + (w - s0) * k / 20 for k in range(21)]
    cover = [pt(s, 0, t) for s in ss] + [pt(s, l, t) for s in ss[::-1]]
    out = {'cover': scr(cover)}
    # Какие бока видны — по нормали в середине.
    sides = {
        'near': (lambda s, h: pt(s, l, h), er),     # бок вдоль ширины у r = l
        'far':  (lambda s, h: pt(s, 0, h), mul(er, -1)),
    }
    for k, (f, n) in sides.items():
        cen = f(w * 0.5, t / 2)
        if facing(cen, n) > 0:
            out[k] = scr([f(s, t) for s in ss] + [f(s, 0) for s in ss[::-1]])
            out[k + 'Lines'] = [scr([f(s, t * h) for s in ss[1:-1]]) for h in (0.3, 0.55, 0.8)]
            out[k + 'Tone'] = round(tone(cen, n), 3)
    # Свободный край (s = w) и дальний (s = 0).
    pe, ne = frame(w); te = unit(add(mul(eu, math.cos(th)), mul(UP, -math.sin(th))))
    if facing(add(pe, mul(er, l / 2)), te) > 0:
        out['end'] = scr([pt(w, 0, 0), pt(w, l, 0), pt(w, l, t), pt(w, 0, t)])
    # Перелив света по провису: тон обложки по s — для градиента.
    out['coverTone'] = [[round(s / w, 3), round(tone(frame(s)[0], frame(s)[1]), 3)] for s in (0, s0, s0 + (w - s0) * 0.33, s0 + (w - s0) * 0.66, w)]
    out['coverGrad'] = R1([S2(*pt(0, l / 2, t)), S2(*pt(w, l / 2, t))])
    # Блик глянца — полоса поперёк журнала там, где обложка, перегибаясь,
    # смотрит прямо на свет (максимум тона по провису — треть дуги).
    sg = s0 + (w - s0) * 0.3
    out['gloss'] = scr([pt(sg - 0.03, l * 0.05, t + 0.004), pt(sg - 0.03, l * 0.95, t + 0.004),
                        pt(sg + 0.03, l * 0.95, t + 0.004), pt(sg + 0.03, l * 0.05, t + 0.004)])
    # ---- обложка без слов: плашка, пин-ап-силуэт червя, звезда-всплеск с цифрой.
    # Всё лежит на висящей части (её видно лучше всего) и рисуется в
    # координатах обложки (s, r), а потом проецируется — гнётся вместе с ней.
    arc0, arc1 = s0, w
    def on(s, r): return pt(s, r, t + 0.006)
    A = lambda k: arc0 + (arc1 - arc0) * k
    # Плашка — светлая полоса у нижнего края висящей обложки: там обложка
    # уходит в тень, и светлое на тёмном читается издали.
    out['plate'] = scr([on(A(0.84), l * 0.05), on(A(0.84), l * 0.95), on(A(0.95), l * 0.95), on(A(0.95), l * 0.05)])
    # Червь лежит вдоль обложки в позе пин-ап: тело — вытянутая капля, голова
    # с ушами у правого края, хвостик-завиток у левого. Контур — точками.
    body = []
    for k in range(25):
        a = 2 * math.pi * k / 24
        rr = l * (0.40 + 0.22 * math.cos(a)); ss_ = A(0.62 + 0.14 * math.sin(a) * (1 - 0.35 * math.cos(a)))
        body.append(on(ss_, rr))
    out['worm'] = scr(body)
    # Хвостик пин-ап — завиток вверх у левого конца тела: поза, а не «косточка».
    out['wormTail'] = scr([on(A(0.62 - 0.02 * k), l * (0.18 - 0.035 * k) ) if k < 3 else on(A(0.56 - 0.07 * (k - 2)), l * (0.08 + 0.02 * (k - 2))) for k in range(6)])
    hc = (A(0.5), l * 0.66)
    out['wormHead'] = scr([on(hc[0] + 0.13 * math.sin(2 * math.pi * k / 16), hc[1] + 0.15 * math.cos(2 * math.pi * k / 16)) for k in range(16)])
    out['wormEar'] = scr([on(hc[0] - 0.10, hc[1] + 0.02), on(hc[0] - 0.24, hc[1] + 0.10), on(hc[0] - 0.08, hc[1] + 0.14)])
    sc, rc, R0, R1_ = A(0.6), l * 0.86, 0.17, 0.09
    burst = []
    for k in range(20):
        rad = R0 if k % 2 == 0 else R1_
        a = 2 * math.pi * k / 20
        burst.append(on(sc + rad * math.sin(a), rc + rad * math.cos(a)))
    out['burst'] = scr(burst)
    # Цифра — не слово (инвариант 9): «9» — кружок с хвостиком, штрихом.
    out['digit'] = scr([on(sc - 0.03, rc + 0.03), on(sc - 0.06, rc), on(sc - 0.03, rc - 0.03), on(sc, rc),
                        on(sc - 0.03, rc + 0.03), on(sc + 0.06, rc + 0.02)])
    out['pivot'] = R1([S2(*pt(s0, l / 2, t))])[0]
    out['center'] = R1([S2(*pt(A(0.5), l / 2, t))])[0]
    return out

# ---------- F2 ----------
blue = slab_mag((-1.5, Y, -0.75), 0, 2.8, 2.1, 0.16)
yel = slab_mag((-1.4, Y + 0.16, -0.70), 12, 2.75, 2.05, 0.16)
top = top_mag((0.45, Y + 0.32, -1.1), 78, 1.9, 2.75, 0.14, 0.76, 70)

out = dict(stack=[blue, yel], top=top)
# Финал (FOCUS tail/finish: x 145…455 сцены, y 179…850) журнал задевать не
# должен: всё, что выше низа кадра финала, — правее его края с запасом.
def all_pts(o):
    if isinstance(o, dict): return [p for k, v in o.items() if k != 'coverTone' for p in all_pts(v)]
    if isinstance(o, list) and o and isinstance(o[0], (int, float)): return [o]
    if isinstance(o, list): return [p for v in o for p in all_pts(v)]
    return []
pts = [p for p in all_pts(out) if len(p) == 2]
hit = [p for p in pts if p[0] < 455 + 8 and p[1] < 850]
if hit: sys.exit('журнал лезет в кадр финала: %s' % hit[:3])
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'src/minigames/lust/bath-mag.js')
src = open(dst).read()
blk = 'GEO: ' + json.dumps(out, separators=(',', ':')) + ','
new, n = re.subn(r'GEO: \{.*?\},\n', lambda _: blk + '\n', src, count=1, flags=re.S)
if n != 1: sys.exit('блок GEO в %s не найден' % dst)
open(dst, 'w').write(new)
xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
print('GEO обновлён: габарит x %.0f…%.0f, y %.0f…%.0f' % (min(xs), max(xs), min(ys), max(ys)),
      '| видимые грани:', [sorted(k for k in m if k != 'pageLines') for m in out['stack']],
      '| верхний:', sorted(k for k in top if isinstance(top[k], list) and k not in ('coverTone',)))
