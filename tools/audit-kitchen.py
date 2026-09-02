#!/usr/bin/env python3
# Разбор снимков аудита (tools/audit-kitchen.js).
#
# Три вопроса, на которые здесь отвечают числом, а не глазом:
#
#   1. РАЗВАЛИЛСЯ ЛИ ПРЕДМЕТ — сколько у него несвязных кусков. По умолчанию
#      ожидается ОДИН. Предмет, у которого их законно больше (у крана вентили
#      стоят отдельно от излива), объявляет это полем `parts` — то есть
#      разваленность становится не «на глаз», а ожиданием, которое нарушается
#      заметно.
#   2. ТОРЧИТ ЛИ ЗА РАМКУ — габарит рисунка против объявленного box. Предмет,
#      вылезающий за свой box, обрежется в мастерской и уедет в сцене.
#   2а. НЕТ ЛИ ТРЕЩИН — узкой фоновой полосы ВНУТРИ предмета, зажатой его же
#      пикселями с обеих сторон. Так выглядит стык двух частей, сведённых
#      встык вместо перекрытия: венчик кастрюли и её корпус расходились на
#      три единицы, и предмет разваливался надвое. Глазом такое видно только
#      на увеличении, числом — сразу.
#
#   3. ЕСТЬ ЛИ ДЫРЫ В СЦЕНЕ — ядовито-розовый фон, просвечивающий внутри
#      собранной кухни. Розового в палитре нет, поэтому любое розовое пятно
#      это место, где просто ничего не нарисовано.
#
# Запуск: python3 tools/audit-kitchen.py /tmp/audit-
import sys, json, os
from collections import deque
from PIL import Image

pref = sys.argv[1] if len(sys.argv) > 1 else '/tmp/audit-'
meta = json.load(open(pref + 'meta.json'))
BG = (255, 0, 255)


def mask(im, tol=60):
    """Пиксели, ОТЛИЧНЫЕ от фона. Допуск нужен из-за сглаживания краёв."""
    px = im.load()
    w, h = im.size
    return [[sum(abs(a - b) for a, b in zip(px[x, y][:3], BG)) > tol
             for x in range(w)] for y in range(h)]


def components(m, min_px):
    """Несвязные куски крупнее min_px, по 8 соседям."""
    h, w = len(m), len(m[0])
    seen = [[False] * w for _ in range(h)]
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if not m[y0][x0] or seen[y0][x0]:
                continue
            q, cells = deque([(x0, y0)]), []
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and m[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            if len(cells) >= min_px:
                xs = [c[0] for c in cells]
                ys = [c[1] for c in cells]
                out.append({'n': len(cells), 'x0': min(xs), 'x1': max(xs),
                            'y0': min(ys), 'y1': max(ys)})
    out.sort(key=lambda c: -c['n'])
    return out


print('--- ПРЕДМЕТЫ ПО ОДНОМУ ---')
print('%-20s %6s %5s  %s' % ('предмет', 'кусков', 'мелких', 'габарит против box'))
issues = []
for o in meta['objects']:
    path = '%sobj-%s.png' % (pref, o['name'])
    if not os.path.exists(path):
        continue
    im = Image.open(path).convert('RGB')
    m = mask(im)
    comps = components(m, 24)
    if not comps:
        issues.append('%s: не нарисовалось ничего' % o['name'])
        continue
    big = comps[0]['n']
    small = [c for c in comps[1:] if c['n'] > big * 0.004]

    # Габарит рисунка обратно в единицы сцены.
    s, box, pad = o['scale'], o['box'], o['pad']
    gx0 = min(c['x0'] for c in comps) / s + box['x']
    gx1 = max(c['x1'] for c in comps) / s + box['x']
    gy0 = min(c['y0'] for c in comps) / s + box['y']
    gy1 = max(c['y1'] for c in comps) / s + box['y']
    d = o['declared']
    over = max(d['x'] - gx0, gx1 - (d['x'] + d['w']),
               d['y'] - gy0, gy1 - (d['y'] + d['h']))
    # Трещины: в каждой строке ищем фоновые прогалы, зажатые предметом.
    # Широкий прогал — это законная дыра (арка гусака, щель между камерами
    # холодильника), поэтому считаются только узкие.
    crackpx = int(round(8 * s))
    cracks, worst, spots = 0, 0, []
    h_, w_ = len(m), len(m[0])
    for y in range(h_):
        row, x = m[y], 0
        while x < w_:
            if row[x]:
                x += 1
                continue
            x0 = x
            while x < w_ and not row[x]:
                x += 1
            if x0 > 0 and x < w_ and 1 < (x - x0) <= crackpx:
                cracks += 1
                worst = max(worst, x - x0)
                spots.append((x0, x, y))
    # Предмет, у которого дыра ЕСТЬ ПО ЗАМЫСЛУ — петля ручки, просветы между
    # ветками, пролёт между ножками стола, размывка тени, — объявляет это
    # полем `holes`. Иначе проверка на трещины ловит его насквозь и заодно
    # прячет настоящие расхождения швов за постоянным шумом.
    crack = '' if (cracks < 12 or o.get('holes')) else (
        'ТРЕЩИНА %d строк, ширина до %.0f' % (cracks, worst / s))

    fit = 'ok' if over <= 2 else 'ВЫЛЕЗ на %.0f' % over
    want = o.get('parts', 1)
    print('%-20s %6d %6d  %-22s %s' % (o['name'], len(comps), len(small), fit, crack))
    if crack:
        issues.append('%s: %s' % (o['name'], crack))
        # Карта трещин: зелёным по снимку — иначе «52 строки» ничего не
        # говорит о том, ГДЕ шов разошёлся.
        vis = im.copy(); vp = vis.load()
        for x0, x1, y in spots:
            for x in range(x0, x1):
                vp[x, y] = (0, 255, 0)
        vis.save('%scrack-%s.png' % (pref, o['name']))
    if len(comps) != want:
        issues.append('%s: кусков %d, ожидалось %d (%s)' % (
            o['name'], len(comps), want,
            ', '.join('%dpx' % c['n'] for c in comps[:5])))
    if over > 2:
        issues.append('%s: рисунок %.0f..%.0f / %.0f..%.0f, а box '
                      '%.0f..%.0f / %.0f..%.0f' % (
            o['name'], gx0, gx1, gy0, gy1,
            d['x'], d['x'] + d['w'], d['y'], d['y'] + d['h']))

print('\n--- СИЛУЭТЫ В СЦЕНЕ ---')
# Силуэт предмета — то, что от него осталось видно после перекрытий.
# Проверяются две вещи:
#   • сколько от предмета вообще видно (нулевой силуэт = предмет рисуется
#     зря, его целиком перекрыли);
#   • какая доля его КОНТУРА проваливается в фон — то есть где по обе
#     стороны границы почти один и тот же цвет. Такой контур глаз не видит,
#     и предмет сливается с тем, что за ним.
stack_p = pref + 'stack.png'
if os.path.exists(stack_p):
    full = Image.open(stack_p).convert('RGB')
    W, H = full.size
    fp = full.load()
    print('%-18s %8s %8s  %s' % ('предмет', 'видно', 'контур', 'слился с фоном'))
    for name in meta['order']:
        pl = '%sless-%s.png' % (pref, name)
        if not os.path.exists(pl):
            continue
        less = Image.open(pl).convert('RGB')
        lp = less.load()
        # Маска — где предмет ЗАМЕТНО меняет пиксель. Порог высокий
        # намеренно: у собственной мягкой тени предмета край размыт, и с
        # низким порогом мерился бы контур ТЕНИ, а не силуэт.
        vis = [[sum(abs(a - b) for a, b in zip(fp[x, y], lp[x, y])) > 45
                for x in range(W)] for y in range(H)]
        area = sum(sum(1 for v in row if v) for row in vis)
        if area == 0:
            print('%-18s %8d %8s  ПРЕДМЕТ НЕ ВИДЕН ВОВСЕ' % (name, 0, '-'))
            issues.append('%s: в сцене не видно вовсе' % name)
            continue
        # Контраст меряется ПОПЕРЁК границы: цвет внутри силуэта против цвета
        # снаружи В СОБРАННОЙ СЦЕНЕ. Так и смотрит глаз — ему всё равно, что
        # там было бы без предмета.
        edge = 0
        dim = 0
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if not vis[y][x]:
                    continue
                out = None
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    if not vis[y + dy][x + dx]:
                        out = (x + dx, y + dy)
                        break
                if out is None:
                    continue
                edge += 1
                if sum(abs(a - b) for a, b in zip(fp[x, y], fp[out])) < 40:
                    dim += 1
        share = 100.0 * dim / edge if edge else 0
        # Порог свой у каждого предмета: у тени и блика сливаться с фоном —
        # работа, а не брак, и объявляется это полем `merge`.
        want = meta.get('merge', {}).get(name, 25)
        mark = '' if share < want else ('СЛИВАЕТСЯ %.0f%% при пороге %d' % (share, want))
        print('%-18s %8d %8d  %s' % (name, area, edge, mark or '%.0f%%' % share))
        if mark:
            issues.append('%s: %.0f%% контура сливается с тем, что за ним '
                          '(порог %d)' % (name, share, want))
            # Карта: красным те места контура, где предмет не отличить от фона.
            vis_im = full.copy(); vpx = vis_im.load()
            for y in range(1, H - 1):
                for x in range(1, W - 1):
                    if not vis[y][x]:
                        continue
                    if vis[y][x-1] and vis[y][x+1] and vis[y-1][x] and vis[y+1][x]:
                        continue
                    out = None
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        if not vis[y + dy][x + dx]:
                            out = (x + dx, y + dy)
                            break
                    if out and sum(abs(a - b) for a, b in zip(fp[x, y], fp[out])) < 40:
                        vpx[x, y] = (255, 0, 0)
            vis_im.save('%smerge-%s.png' % (pref, name))

print('\n--- ДЫРЫ В СОБРАННОЙ СЦЕНЕ ---')
scene = Image.open(pref + 'scene.png').convert('RGB')
w, h = scene.size
px = scene.load()
holes = [[sum(abs(a - b) for a, b in zip(px[x, y][:3], BG)) <= 60
          for x in range(w)] for y in range(h)]
hc = components(holes, 40)
if not hc:
    print('  дыр нет')
else:
    vis = scene.copy()
    vp = vis.load()
    for c in hc[:40]:
        print('  дыра %5d px  x %d..%d  y %d..%d (сцена y %d..%d)'
              % (c['n'], c['x0'], c['x1'], c['y0'], c['y1'],
                 c['y0'] - 60, c['y1'] - 60))
        for x in range(max(0, c['x0'] - 2), min(w, c['x1'] + 3)):
            for y in (c['y0'] - 2, c['y1'] + 2):
                if 0 <= y < h:
                    vp[x, y] = (0, 255, 0)
    vis.save(pref + 'holes.png')
    print('  карта: ' + pref + 'holes.png')

print('\n--- К РАЗБОРУ ГЛАЗАМИ ---')
if issues:
    for i in issues:
        print('  ' + i)
else:
    print('  чисто')
