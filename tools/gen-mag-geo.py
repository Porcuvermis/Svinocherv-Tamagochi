# Генератор контуров стопки журналов на крышке унитаза: переписывает блок GEO в
# src/minigames/lust/bath-mag.js. Запуск: python3 tools/gen-mag-geo.py [путь]
#
# Постановка F2 (утверждена игроком, docs/plan/21-lust-bath.md, разд. 7б):
# два нижних журнала лежат вразнобой корешками к камере, верхний лежит на
# стопке косо, съехал к носику крышки и свисает через край обложкой к игроку.
# Лежит ФИЗИЧНО: со стопки сходит S-кривой на крышку, по крышке доходит до
# кромки носика и там перегибается вниз. Висел бы в воздухе — игрок это видит
# сразу (первый чистовик висел над крышкой у носика без касания).
#
# Обложки — плоские картинки (BATH_MAG.covers), а не рисунок по проекции:
# генератор отдаёт, как натянуть плоскую обложку на поверхность — полосы по
# провису, у каждой аффинный перенос (обложка → сцена) и обрезка по полосе.
# Одна и та же обложка нужна и на стопке, и в руке, когда журнал взлетит и
# раскроется (разд. 7б), поэтому рисуется она один раз, плоско. Числа — в координатах МОДЕЛИ унитаза (до масштаба, поворота и
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

# Обложки в своих единицах (1 = 1 мм журнала): нижние 210 × 280, верхний
# 205 × 275 — в пропорции l × w модели и картинки обложки (896 × 1200).
SCW, SCH = 210.0, 280.0
CW, CH = 205.0, 275.0

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
    # Обложка: корешок — ближний бок (+ez), u от него к краю; v вдоль длины,
    # направление — то, при котором натяжка не зеркалит картинку.
    S0, Sx = c(0, 1, 1), c(0, 0, 1)
    for V0, V1 in ((c(0, 1, 1), c(1, 1, 1)), (c(1, 1, 1), c(0, 1, 1))):
        A, B, D = S2(*V0), S2(*add(V0, sub(Sx, S0))), S2(*V1)
        a, b, cc, d = (B[0]-A[0])/SCW, (B[1]-A[1])/SCW, (D[0]-A[0])/SCH, (D[1]-A[1])/SCH
        if a * d - b * cc > 0:
            out['cover'] = dict(uv=[[0, 0], [SCW, 0], [SCW, SCH], [0, SCH]], m=[round(x, 5) for x in (a, b, cc, d, A[0], A[1])])
            break
    return out

# ---------- ВЕРХНИЙ ЖУРНАЛ: УПРУГИЙ ПРОВИС ----------
# Журнал — упругая пластина, а не ткань. Профиль по ширине s (к носику)
# задаётся углом наклона θ(s), положение — интегралом, и θ ТОЛЬКО РАСТЁТ:
# на стопке 0; от края стопки (sa) до кромки носика (sc) плавно набирает θe
# — пролёт без опоры, θe подбирается так, чтобы к кромке спуститься ровно на
# высоту стопки и лечь на неё; за кромкой — вылет, который провисает под
# своим весом ещё на droop: кривизна у опоры наибольшая, к концу сходит на
# нет (как у консоли).
#
# Почему так: был профиль «S-кривая со стопки → плашмя по крышке → дуга через
# кромку → отвес». Игрок: «принимает форму лесенки, как будто журнал из
# мягкой ткани; провисать может, но не складывается лесенкой — он упругий».
# Лесенку даёт θ, который растёт и снова падает до нуля: у упругого листа на
# двух опорах так не бывает. Кромка — точка яйца крышки te, направление
# сползания — наружная нормаль кромки там же.
def lid_edge(t):
    cx, a, b = 0.12, 2.26, 1.72                     # яйцо крышки (eggSlab)
    return (cx + a * math.cos(t), b * math.sin(t) * (1 + 0.1 * math.cos(t)))

def profile(w, sa, sc, droop, drop, ds=0.002):
    def theta(s, the):
        if s < sa: return 0.0
        if s < sc: return the * (1 - math.cos(math.pi * (s - sa) / (sc - sa))) / 2
        y = (s - sc) / (w - sc)
        return the + droop * (1 - (1 - y) ** 3)
    def run(the):
        hx, hy, s, out = 0.0, 0.0, 0.0, [(0.0, 0.0, 0.0, 0.0)]
        while s < w - 1e-9:
            st = min(ds, w - s); tm = theta(s + st / 2, the)
            hx += math.cos(tm) * st; hy -= math.sin(tm) * st; s += st
            out.append((s, hx, hy, theta(s, the)))
        return out
    def drop_at_sc(the):
        return -min((p for p in run(the) if p[0] <= sc + 1e-6), key=lambda p: abs(p[0] - sc))[2]
    lo, hi = 0.0, 1.4
    for _ in range(50):
        m = (lo + hi) / 2
        if drop_at_sc(m) < drop: lo = m
        else: hi = m
    return run((lo + hi) / 2)

def top_mag(te, l, w, t, sa, sc, droop, Ytop, dr=0.0):
    prof = profile(w, sa, sc, math.radians(droop), Ytop - Y)
    def at(s):
        return prof[min(len(prof) - 1, max(0, int(round(s / w * (len(prof) - 1)))))]
    E, E2 = lid_edge(te), lid_edge(te + 1e-4)
    eu = unit((E2[1] - E[1], 0, -(E2[0] - E[0])))
    if eu[0] > 0: eu = mul(eu, -1)                  # наружу — к носику (−x)
    er = unit(cross(UP, eu))
    o = add((E[0], Ytop, E[1]), mul(eu, -at(sc)[1]), mul(er, dr - l / 2))
    def frame(s):
        _, hx, hy, th = at(s)
        return add(o, mul(eu, hx), mul(UP, hy)), add(mul(UP, math.cos(th)), mul(eu, math.sin(th)))
    def pt(s, r, h):
        p, n = frame(s); return add(p, mul(er, r), mul(n, h))
    ss = sorted(set([0.0, sa * 0.5, sa] + [sa + (sc - sa) * k / 14 for k in range(15)]
                    + [sc + (w - sc) * k / 12 for k in range(13)]))
    ss = [round(s, 6) for s in ss if s <= w + 1e-9]
    out = {'cover': scr([pt(s, 0, t) for s in ss] + [pt(s, l, t) for s in ss[::-1]])}
    # Бока: у r = l — торец страниц, у r = 0 — корешок (u = 0 обложки).
    for k, f, n in (('near', lambda s, h: pt(s, l, h), er), ('far', lambda s, h: pt(s, 0, h), mul(er, -1))):
        cen = f(w * 0.5, t / 2)
        if facing(cen, n) > 0:
            out[k] = scr([f(s, t) for s in ss] + [f(s, 0) for s in ss[::-1]])
            out[k + 'Lines'] = [scr([f(s, t * h) for s in ss[1:-1]]) for h in (0.3, 0.55, 0.8)]
            out[k + 'Tone'] = round(tone(cen, n), 3)
    pe, ne = frame(w); th = at(w)[3]
    te_ = unit(add(mul(eu, math.cos(th)), mul(UP, -math.sin(th))))
    if facing(add(pe, mul(er, l / 2)), te_) > 0:
        out['end'] = scr([pt(w, 0, 0), pt(w, l, 0), pt(w, l, t), pt(w, 0, t)])
    # Натяжка обложки: на каждый отрезок ss — ДВА треугольника, у каждого свой
    # аффинный перенос (обложка → сцена), точный во всех трёх его вершинах. С
    # одним переносом на полосу четвёртый угол на изгибе съезжал, и рисунок на
    # стыках полос рвался — на краях форм обложки читалось лесенкой. У
    # треугольников общие рёбра отображаются одинаково с обеих сторон, и
    # картинка непрерывна. u = r / l · CW (корешок у r = 0: при этом знаке
    # картинка не зеркалится), v = s / w · CH (верх обложки — дальний, низ
    # свисает к игроку). Обрезка треугольника раздута наружу на OV ПИКСЕЛЕЙ
    # экрана честным отступом каждого ребра (а не от центра: у длинных тонких
    # треугольников отступ от центра уходит вдоль, а поперёк остаётся щель), —
    # иначе на стыках светятся волоски фона. Нахлёст в единицах модели не
    # годится: на плоской части ракурс сжимает его до сотых пикселя.
    OV = 0.6
    def solve(P3, U3):
        # x = a·u + c·v + e, y = b·u + d·v + f по трём парам точек
        (u0, v0), (u1, v1), (u2, v2) = U3
        det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)
        def coef(k):
            q0, q1, q2 = P3[0][k], P3[1][k], P3[2][k]
            A = ((q1 - q0) * (v2 - v0) - (q2 - q0) * (v1 - v0)) / det
            C = ((u1 - u0) * (q2 - q0) - (u2 - u0) * (q1 - q0)) / det
            return A, C, q0 - A * u0 - C * v0
        a, c, e = coef(0); b, d, f = coef(1)
        return a, b, c, d, e, f
    def grow(P3):
        # отступ рёбер наружу на OV; острый угол срезается фаской (не дальше 3·OV)
        n = len(P3); area = sum(P3[i][0] * P3[(i + 1) % n][1] - P3[(i + 1) % n][0] * P3[i][1] for i in range(n))
        sg = 1 if area > 0 else -1
        def off(i):
            p, q = P3[i], P3[(i + 1) % n]; dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy) or 1
            nx, ny = dy / L * sg, -dx / L * sg
            return (p[0] + nx * OV, p[1] + ny * OV), (dx, dy), (nx, ny)
        res = []
        for i in range(n):
            (p1, d1, n1), (p2, d2, n2) = off(i - 1), off(i)
            cr = d1[0] * d2[1] - d1[1] * d2[0]
            v = P3[i]
            if abs(cr) > 1e-9:
                t_ = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / cr
                X = (p1[0] + d1[0] * t_, p1[1] + d1[1] * t_)
                if math.hypot(X[0] - v[0], X[1] - v[1]) <= 3 * OV:
                    res.append(X); continue
            res.append((v[0] + n1[0] * OV, v[1] + n1[1] * OV)); res.append((v[0] + n2[0] * OV, v[1] + n2[1] * OV))
        return res
    strips = []
    for s0, s1 in zip(ss, ss[1:]):
        A, B = S2(*pt(s0, 0, t)), S2(*pt(s0, l, t))
        C, D = S2(*pt(s1, l, t)), S2(*pt(s1, 0, t))
        v0, v1 = s0 / w * CH, s1 / w * CH
        sm = (s0 + s1) / 2; pm, nm = frame(sm)
        tn = round(tone(add(pm, mul(er, l / 2)), nm), 3)
        for P3, U3 in (((A, B, C), ((0, v0), (CW, v0), (CW, v1))), ((A, C, D), ((0, v0), (CW, v1), (0, v1)))):
            m = solve(P3, U3)
            if m[0] * m[3] - m[1] * m[2] <= 0: sys.exit('натяжка обложки зеркалит картинку')
            # Обрезка — в координатах ОБЛОЖКИ: кусок рисуется фигурой с
            # переносом m и заливкой-узором обложки (см. bath-mag.js), так что
            # раздутый на экране треугольник переводится обратно в (u, v).
            a_, b_, c_, d_, e_, f_ = m; dt = a_ * d_ - b_ * c_
            inv = lambda X: (((X[0] - e_) * d_ - (X[1] - f_) * c_) / dt, ((X[1] - f_) * a_ - (X[0] - e_) * b_) / dt)
            strips.append(dict(uv=[[round(q[0], 2), round(q[1], 2)] for q in map(inv, grow(P3))],
                               m=[round(x, 5) for x in m], tone=tn))
    out['strips'] = strips
    # Где журнал касается крышки (под ним — тень касания) и где сходит со
    # стопки (ступенька — тень на нижнем журнале).
    # Опора на кромку — узкая полоса у sc: журнал лежит на ребре, а не плашмя.
    out['lidContact'] = scr([pt(sc - 0.12, 0, 0), pt(sc - 0.12, l, 0), pt(sc + 0.04, l, 0), pt(sc + 0.04, 0, 0)])
    out['stackStep'] = scr([pt(sa, 0, 0), pt(sa, l, 0)])
    out['hangEdge'] = scr([pt(w, 0, 0), pt(w, l, 0)])
    out['pivot'] = R1([S2(*pt(sc, l / 2, t))])[0]
    out['center'] = R1([S2(*pt((sc + w) / 2, l / 2, t))])[0]
    out['size'] = [CW, CH]
    out['flap'] = flap_frames(pt, frame, l, w, t, solve, grow)
    # Взлёт (lust-mag.js): журнал в ПРОСТРАНСТВЕ, в единицах мира и той же
    # камерой, что и картинка. В css-3d камера запекания повторяется точно:
    # перспектива K, начало перспективы — точка (360, 760) сцены, точка мира
    # (X, Y, Z) ставится в (X, −(Y − 4.2), K − (46 − Z)).
    # Летит ТА ЖЕ толстая модель, что лежит (docs/traps.md, п. 163): базис у
    # корешка в начале (p0, e1 — вдоль ширины, e2 — касательная), профиль
    # обложки узлами [v, y, z] (доли длины w: v — по картинке обложки, y и z
    # — точка верха журнала в базисе), толщина в долях w и тон граней. Две
    # хорды вместо профиля летели тонким листом с одним переломом — игрок
    # видел подмену модели в момент тапа.
    def css3(q):
        X_, Y_, Z_ = W(*q)
        return [X_, -(Y_ - 4.2), K - (46 - Z_)]
    c0 = css3(pt(0.0, 0, t))
    e1 = [a_ - b_ for a_, b_ in zip(css3(pt(0.0, l, t)), c0)]
    e2 = [a_ - b_ for a_, b_ in zip(css3(add(pt(0.0, 0, t), mul(eu, 0.01))), c0)]
    sig = math.sqrt(dot(e1, e1)) / l                  # css-единиц на единицу модели
    ux = unit(e1); uy = unit(sub(e2, mul(ux, dot(e2, ux)))); uz = cross(ux, uy)
    nodes = [0.0, sa] + [sa + (sc - sa) * k / 8 for k in range(1, 9)] + [sc + (w - sc) * k / 6 for k in range(1, 7)]
    fprof = []
    for s_ in nodes:
        d = sub(css3(pt(s_, 0, t)), c0)
        fprof.append([round(s_ / w, 5), round(dot(d, uy) / (sig * w), 5), round(dot(d, uz) / (sig * w), 5)])
    seg_tone = []
    for s0, s1 in zip(nodes, nodes[1:]):
        pm, nm = frame((s0 + s1) / 2)
        seg_tone.append(round(tone(add(pm, mul(er, l / 2)), nm), 3))
    pe, _ = frame(w)
    out['fly'] = dict(K=round(K, 4), origin=[360, 760], p0=[round(v, 5) for v in c0],
                      e1=[round(v, 5) for v in e1], e2=[round(v, 5) for v in e2],
                      prof=fprof, thick=round(t / w, 5), tone=dict(
                          cover=seg_tone,
                          near=round(tone(pt(w * 0.5, l, t / 2), er), 3),
                          far=round(tone(pt(w * 0.5, 0, t / 2), mul(er, -1)), 3),
                          end=round(tone(add(pe, mul(er, l / 2)), te_), 3)))
    top_mag.pt = pt                                  # для постановки стопки под ним
    return out

# ---------- ЗОВ: УГОЛОК ОБЛОЖКИ ПОРЫВАЕТСЯ ОТКРЫТЬСЯ ----------
# Замысел игрока: «уголок верхней страницы чуть левитирует — взмывает и
# задерживается, будто страничка вот-вот сама откроется; коснись — и
# откроется». Уголок — у свободного края висящей части со стороны страниц
# (s = w, r = l): он смотрит на игрока и в кадре. Лоскут — треугольник с
# катетами FA по ширине и FB по длине; линия сгиба — его гипотенуза.
# Лоскут поворачивается вокруг сгиба КАК ЖЁСТКИЙ (форма провиса сохраняется)
# на угол φ наружу, от страниц. Кадры считаются здесь той же камерой; в игре
# они только переключаются — ни одной формулы на кадре.
FA, FB, FN, FPHI, FFR = 0.72, 0.92, 3, 78.0, 12
def flap_frames(pt, frame, l, w, t, solve, grow):
    C, P1, P2 = (w, l), (w - FA, l), (w, l - FB)       # (s, r): угол и концы сгиба
    def sr(i, j):                                       # узлы треугольной сетки лоскута
        a, b = i / FN, j / FN
        return (C[0] + a * (P1[0] - C[0]) + b * (P2[0] - C[0]), C[1] + a * (P1[1] - C[1]) + b * (P2[1] - C[1]))
    tris = []
    for i in range(FN):
        for j in range(FN - i):
            tris.append(((i, j), (i + 1, j), (i, j + 1)))
            if i + j + 1 < FN: tris.append(((i + 1, j), (i + 1, j + 1), (i, j + 1)))
    A3, B3 = pt(P1[0], P1[1], t), pt(P2[0], P2[1], t)
    ax = unit(sub(B3, A3))
    def rotp(X, phi):                                   # Родриг вокруг сгиба A3→B3
        v = sub(X, A3); c, s_ = math.cos(phi), math.sin(phi)
        return add(A3, mul(v, c), mul(cross(ax, v), s_), mul(ax, dot(ax, v) * (1 - c)))
    # Знак — наружу: угол лоскута уходит по нормали обложки, от страниц.
    nC = frame(C[0])[1]; Cp = pt(C[0], C[1], t)
    sgn = 1 if dot(sub(rotp(Cp, 0.2), Cp), nC) > 0 else -1
    def uv(q): return (q[1] / l * CW, q[0] / w * CH)
    # Открывшаяся страница — тот же треугольник чуть ниже обложки: под
    # лоскутом бумага, а не дыра.
    page = [S2(*pt(*sr(i, 0), t * 0.85)) for i in range(FN + 1)] + \
           [S2(*pt(*sr(FN - j, j), t * 0.85)) for j in range(1, FN + 1)] + \
           [S2(*pt(*sr(0, FN - j), t * 0.85)) for j in range(1, FN)]
    frames = []
    for k in range(FFR + 1):
        phi = sgn * math.radians(FPHI) * k / FFR
        P = {}
        for i in range(FN + 1):
            for j in range(FN + 1 - i):
                P[(i, j)] = rotp(pt(*sr(i, j), t), phi)
        fr = []
        for tri in tris:
            X = [P[q] for q in tri]
            n_ = unit(cross(sub(X[1], X[0]), sub(X[2], X[0])))
            cen = mul(add(X[0], X[1], X[2]), 1 / 3)
            # Лицо треугольника смотрит туда же, куда обложка в его месте
            # (сетка обходит треугольник в одну сторону): знак — по исходной
            # нормали, повёрнутой вместе с лоскутом.
            n0 = frame(sr(*tri[0])[0])[1]
            n_rot = sub(rotp(add(pt(*sr(*tri[0]), t), n0), phi), rotp(pt(*sr(*tri[0]), t), phi))
            vis = dot(unit(n_rot), unit(sub(CAM, W(*cen))))
            S3 = [S2(*q) for q in X]
            if vis > 0:
                m = solve(S3, [uv(sr(*q)) for q in tri])
                a_, b_, c_, d_, e_, f_ = m; dt = a_ * d_ - b_ * c_
                if abs(dt) < 1e-9: continue
                inv = lambda Q: (((Q[0] - e_) * d_ - (Q[1] - f_) * c_) / dt, ((Q[1] - f_) * a_ - (Q[0] - e_) * b_) / dt)
                fr.append(dict(f=1, uv=[[round(q[0], 1), round(q[1], 1)] for q in map(inv, grow(S3))],
                               m=[round(x, 5) for x in m]))
            else:
                fr.append(dict(f=0, p=R1(grow(S3)), tone=round(tone(cen, mul(n_rot, -1)), 2)))
        edge = [P[(i, 0)] for i in range(FN + 1)] + [P[(FN - j, j)] for j in range(1, FN + 1)] + [P[(0, FN - j)] for j in range(1, FN)]
        frames.append(dict(tris=fr, edge=R1([S2(*q) for q in edge])))
    # Строки на открывшейся странице (без букв — полосы набора) и тень от
    # лоскута у сгиба: без них страница и изнанка обложки сливались в одно
    # светлое пятно, и подъём читался загнутым внутрь уголком.
    rows = []
    for k in (0.3, 0.5, 0.7):
        a_, b_ = sr(0, 0), sr(0, FN)                       # от угла к концам: строки параллельны сгибу
        q0 = (C[0] + (P1[0] - C[0]) * k * 0.9, C[1] + (P1[1] - C[1]) * k * 0.9)
        q1 = (C[0] + (P2[0] - C[0]) * k * 0.9, C[1] + (P2[1] - C[1]) * k * 0.9)
        rows.append(R1([S2(*pt(*q0, t * 0.85)), S2(*pt(*q1, t * 0.85))]))
    sh = lambda k: [(P1[0] + (C[0] - P1[0]) * k, P1[1] + (C[1] - P1[1]) * k), (P2[0] + (C[0] - P2[0]) * k, P2[1] + (C[1] - P2[1]) * k)]
    a0, b0 = sh(0.0); a1, b1 = sh(0.35)
    shadow = R1([S2(*pt(*a0, t * 0.85)), S2(*pt(*b0, t * 0.85)), S2(*pt(*b1, t * 0.85)), S2(*pt(*a1, t * 0.85))])
    return dict(page=R1(page), fold=R1([S2(*A3), S2(*B3)]), corner=R1([S2(*Cp)])[0], frames=frames, phi=FPHI,
                rows=rows, shadow=shadow)

# ---------- F2 ----------
# Верхний: кромка носика в точке te (параметр яйца крышки); на стопке до sa,
# пролётом до кромки sc, за ней провисает ещё на droop градусов.
top = top_mag(math.radians(172), 2.05, 2.75, 0.12, 0.75, 2.1, 28, Y + 0.26, dr=0.3)
# Стопка — под ним до sa: её левый край ровно там, где верхний с неё сходит
# (иначе он либо висит в воздухе, либо лежит на пустоте), корешки на четверть
# журнала ближе к камере, чем его торец страниц.
_pt = top_mag.pt
_edge = _pt(0.75, 2.05 / 2, 0)                       # sa, середина длины
_near = max(_pt(s_, 2.05, 0)[2] for s_ in (0.0, 0.4, 0.75))
# Поворот и длина подобраны перебором: все углы на крышке (крышка — яйцо,
# к бачку сужается, и длинный ровный журнал свисал там почти целиком), корешки
# впереди бока верхнего.
blue = slab_mag((_edge[0] + 0.02, Y, _near + 0.25 - 2.1 - 0.6), 15, 2.6, 2.1, 0.13)
yel = slab_mag((_edge[0] + 0.1, Y + 0.13, _near + 0.3 - 2.05 - 0.5), 6, 2.45, 2.05, 0.13)

out = dict(stack=[blue, yel], top=top)
# Финал (FOCUS tail/finish: x 145…455 сцены, y 179…850) журнал задевать не
# должен: всё, что выше низа кадра финала, — правее его края. Кадр точный
# (холст постоянного размера, по бокам не срезается) — запас 3 единицы.
def all_pts(o):
    if isinstance(o, dict): return [p for k, v in o.items() if k not in ('size', 'm', 'uv', 'flap', 'fly') for p in all_pts(v)]
    if isinstance(o, list) and o and isinstance(o[0], (int, float)): return [o]
    if isinstance(o, list): return [p for v in o for p in all_pts(v)]
    return []
pts = [p for p in all_pts(out) if len(p) == 2] + [list(p) for st in top['strips'] for p in [(st['m'][0]*u + st['m'][2]*v + st['m'][4], st['m'][1]*u + st['m'][3]*v + st['m'][5]) for u, v in st['uv']]]
hit = [p for p in pts if p[0] < 455 + 3 and p[1] < 850]
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
      '| верхний:', sorted(k for k in top if isinstance(top[k], list)), '| полос натяжки:', len(top['strips']))
