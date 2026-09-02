#!/usr/bin/env python3
# Разбор снимков продуктов (tools/audit-food.js).
#
# Продукты придуманы, а не сняты с референса, поэтому «похоже ли» тут не
# спросишь. Спрашивается четыре вещи, и каждая — требование ИГРЫ к картинке,
# а не вкусовщина:
#
#   1. СИЛУЭТ на каждом из трёх фонов. Доля контура, которую от фона не
#      отличить. Продукт выбирают пальцем — невидимый контур означает
#      промах.
#   2. ОБЪЁМ. Сколько РАЗНЫХ ступеней яркости занимает тело продукта.
#      Не размах: размах врёт, потому что чернильный контур сам по себе даёт
#      двести единиц разброса на плоской наклейке. Считаются корзины по 8
#      единиц яркости, в каждой из которых лежит хотя бы 3% тела. Плоская
#      заливка в три цвета даёт три корзины, вылепленный градиентом
#      предмет — полтора десятка.
#   3. ЧЕРНИЛЬНЫЙ КОНТУР. Доля края, закрашенная ЦВЕТОМ ЧЕРНИЛ (PALETTE.ink).
#      Именно цветом, а не «просто тёмным»: тёмная ступень по краю — это и
#      есть замена обводке, она обязана там быть, и мерить «есть ли тёмное
#      на краю» значит ругать правильное решение. В новой кухне обводок нет
#      вовсе (docs/art-direction.md), и проверка сторожит ровно это.
#   4. ПОДОШВА. На какой высоте у продукта низ. Гнездо на полке — одно
#      число на все продукты сразу, поэтому и низ у них обязан быть на одной
#      линии: иначе на одной полке помидор тонет в стекле, а брикет висит
#      над ним. Ровняется полем KITCHEN_ART.FOOD_DY.
#   5. РАЗЛИЧИМОСТЬ. В игре без слов (инвариант 9) продукт опознаётся
#      цветом И формой, поэтому меряются оба: расстояние по среднему цвету и
#      несовпадение силуэтов, сведённых к сетке 32×32. Помидор и чили
#      по природе оба красные — это не брак, пока их разводит форма. Брак —
#      когда близки и цвет, и силуэт.
#
# Запуск: python3 tools/audit-food.py /tmp/food-
import sys, json, math
from PIL import Image

pref = sys.argv[1] if len(sys.argv) > 1 else '/tmp/food-'
meta = json.load(open(pref + 'meta.json'))
keys = meta['keys']
grounds = meta['grounds']

MAGENTA = (255, 0, 255)
# Цвет обводки плоской графики. Его на продуктах быть не должно вовсе.
INK = (0x23, 0x10, 0x1d)
issues = []


def load(path):
    im = Image.open(path).convert('RGB')
    return im, im.load(), im.size


def mask_of(px, W, H):
    """Пиксели самого продукта: всё, что не ядовито-розовый фон."""
    return [[sum(abs(a - b) for a, b in zip(px[x, y], MAGENTA)) > 60
             for x in range(W)] for y in range(H)]


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def dist(a, b):
    return sum(abs(p - q) for p, q in zip(a, b))


print('--- ОБЪЁМ И КОНТУР (на розовом) ---')
print('%-10s %7s %7s %8s  %s' % ('продукт', 'пикс', 'ступени', 'контур', ''))
bodies = {}
masks = {}
for k in keys:
    im, px, (W, H) = load('%snone-%s.png' % (pref, k))
    m = mask_of(px, W, H)
    # Край — ПОЛОСА в четыре пикселя, а не одна линия. Одна линия у обводки
    # всегда смешана с фоном сглаживанием и своего цвета не показывает:
    # проверка на чернила её попросту не увидит.
    band = [[False] * W for _ in range(H)]
    cur = [(x, y) for y in range(1, H - 1) for x in range(1, W - 1)
           if m[y][x] and not (m[y][x - 1] and m[y][x + 1]
                               and m[y - 1][x] and m[y + 1][x])]
    for px_, py_ in cur:
        band[py_][px_] = True
    for _ in range(3):
        nxt = []
        for x, y in cur:
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 < nx < W - 1 and 0 < ny < H - 1 and m[ny][nx] and not band[ny][nx]:
                    band[ny][nx] = True
                    nxt.append((nx, ny))
        cur = nxt
    inner, edge = [], []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not m[y][x]:
                continue
            (edge if band[y][x] else inner).append(px[x, y])
    if not inner:
        print('%-10s  НЕ НАРИСОВАН' % k)
        issues.append('%s: не нарисован вовсе' % k)
        continue
    ls = sorted(lum(c) for c in inner)
    # Ступени: корзины яркости по 8 единиц, занятые хотя бы 3% тела.
    hist = {}
    for v in ls:
        hist[int(v // 8)] = hist.get(int(v // 8), 0) + 1
    steps = sum(1 for n in hist.values() if n >= len(ls) * 0.03)
    mean = tuple(sum(c[i] for c in inner) / len(inner) for i in range(3))
    bodies[k] = mean
    masks[k] = m
    # Чернильный контур: край ЦВЕТА ЧЕРНИЛ. Тёмная ступень собственного
    # тона сюда не попадает — она замена обводке, а не обводка.
    inked = sum(1 for c in edge if dist(c, INK) < 30)
    ink = 100.0 * inked / len(edge) if edge else 0
    marks = []
    if steps < 6:
        marks.append('ПЛОСКИЙ (ступеней %d, надо от 6)' % steps)
    if ink > 4:
        marks.append('ЧЕРНИЛЬНЫЙ КОНТУР %.0f%%' % ink)
    print('%-10s %7d %7d %7.0f%%  %s' % (k, len(inner), steps, ink,
                                         '; '.join(marks)))
    for mk in marks:
        issues.append('%s: %s' % (k, mk))

print()
print('--- СИЛУЭТ НА ФОНАХ (доля контура, слитая с фоном) ---')
print('%-10s %8s %8s %8s' % ('продукт', 'полка', 'доска', 'бульон'))
for k in keys:
    im0, px0, (W, H) = load('%snone-%s.png' % (pref, k))
    m = mask_of(px0, W, H)
    row = []
    for g in ('shelf', 'board', 'broth'):
        _, gp, _ = load('%s%s-%s.png' % (pref, g, k))
        col = tuple(int(grounds[g][i:i + 2], 16) for i in (1, 3, 5))
        edge = dim = 0
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if not m[y][x]:
                    continue
                if m[y][x - 1] and m[y][x + 1] and m[y - 1][x] and m[y + 1][x]:
                    continue
                edge += 1
                # Сравнивается край продукта с ЧИСТЫМ цветом фона, а не с
                # соседним пикселем. Соседний пиксель — это мягкая тень, и по
                # нему выходит, что предмет сливается сам со своей тенью.
                # Тень помогает глазу, но силуэт обязан держаться и без неё.
                if dist(gp[x, y], col) < 40:
                    dim += 1
        row.append(100.0 * dim / edge if edge else 100.0)
    # Больше трети контура неотличимо от фона = предмет на этом фоне не
    # выбрать пальцем.
    marks = ['%s %.0f%%' % (n, v) for n, v in
             zip(('полка', 'доска', 'бульон'), row) if v > 35]
    print('%-10s %7.0f%% %7.0f%% %7.0f%%  %s' % (k, row[0], row[1], row[2],
          ('ПРОПАДАЕТ: ' + ', '.join(marks)) if marks else ''))
    for mk in marks:
        issues.append('%s: пропадает на фоне «%s» (%s контура)' % (k, mk.split()[0], mk.split()[1]))

print()
print('--- ПОДОШВА (низ продукта относительно его гнезда) ---')
soles = {}
for k in keys:
    m = masks[k]
    ys = [y for y, row in enumerate(m) if any(row)]
    # Окно снимка: -80..80 при увеличении 4. Переводим обратно в единицы.
    soles[k] = -80 + ys[-1] / 4.0
want = meta.get('sole')
lo, hi = min(soles.values()), max(soles.values())
for k in keys:
    off = soles[k] - (lo + hi) / 2
    print('  %-9s низ на %6.1f   отклонение %+5.1f  %s'
          % (k, soles[k], off, 'ВЫБИВАЕТСЯ' if abs(off) > 2.5 else ''))
    if abs(off) > 2.5:
        issues.append('%s: подошва выбивается из общей линии на %+.1f '
                      '(правится KITCHEN_ART.FOOD_DY)' % (k, off))
print('  разброс %.1f при допуске 5.0' % (hi - lo))

print()
print('--- РАЗЛИЧИМОСТЬ ПРОДУКТОВ ---')


def shape_sig(m):
    """Силуэт, сведённый к сетке 32×32 внутри своего габарита."""
    ys = [y for y, row in enumerate(m) if any(row)]
    xs = [x for x in range(len(m[0])) if any(r[x] for r in m)]
    if not ys or not xs:
        return [0] * 1024
    y0, y1, x0, x1 = ys[0], ys[-1], xs[0], xs[-1]
    sig = []
    for gy in range(32):
        for gx in range(32):
            sy = y0 + (y1 - y0) * gy // 31
            sx = x0 + (x1 - x0) * gx // 31
            sig.append(1 if m[sy][sx] else 0)
    return sig


sigs = {k: shape_sig(masks[k]) for k in masks}
pairs = []
ks = [k for k in keys if k in bodies]
for i in range(len(ks)):
    for j in range(i + 1, len(ks)):
        a, b = ks[i], ks[j]
        d = dist(bodies[a], bodies[b])
        same = sum(1 for p, q in zip(sigs[a], sigs[b]) if p == q) / 1024.0
        pairs.append((d + (same - 0.5) * 0, d, same, a, b))
pairs.sort(key=lambda t: t[1])
for _, d, same, a, b in pairs[:5]:
    # Брак только когда СОВПАЛО И ТО И ДРУГОЕ: близкий цвет при разной форме
    # игрок разводит с одного взгляда (помидор круглый, чили длинный).
    mark = 'ПУТАЮТСЯ' if (d < 60 and same > 0.86) else ''
    print('  %-9s ~ %-9s  цвет %3.0f  силуэт совпал на %2.0f%%  %s'
          % (a, b, d, same * 100, mark))
    if mark:
        issues.append('%s и %s не различить: цвет %.0f и силуэт совпал на %.0f%%'
                      % (a, b, d, same * 100))

print()
if issues:
    print('--- К РАЗБОРУ ГЛАЗАМИ ---')
    for s in issues:
        print('  ' + s)
    sys.exit(1)
print('чисто')
