"""Цветовая трассировка растра (PNG/JPEG) в SVG — для образов «Зависти».

    python3 tools/trace-image.py вход.png выход.svg [цветов] [упрощение]
                                 [мин.площадь] [сглаживание] [порог контура]

Рабочие значения для мультяшных картинок с обводкой:  12 1.4 24 0.5 0.32
Мельче упрощение и больше цветов — точнее и тяжелее; крупнее — легче и грубее.

Готовый SVG кладётся строкой в src/minigames/envy/envy-art.js: игра обязана
открываться и с file://, где fetch за соседним файлом не работает.

Требуется pillow и numpy (pip install pillow numpy).

Растр режется на цветовые слои, у каждого слоя обходится граница по рёбрам
пикселей, ступенчатый контур упрощается и сглаживается в кубические кривые.
Слои пишутся от больших к малым, дырки вырезаются правилом evenodd.
"""
import sys, math
from collections import defaultdict
from PIL import Image
import numpy as np

SRC = sys.argv[1]
DST = sys.argv[2]
NCOLORS = int(sys.argv[3]) if len(sys.argv) > 3 else 14
EPS = float(sys.argv[4]) if len(sys.argv) > 4 else 1.1     # упрощение, px
MIN_AREA = int(sys.argv[5]) if len(sys.argv) > 5 else 24   # мелочь отбрасываем
SMOOTH = float(sys.argv[6]) if len(sys.argv) > 6 else 0.55  # 0 — углы, 1 — мягко
INK_L = float(sys.argv[7]) if len(sys.argv) > 7 else 0.42   # порог «это контур», 0..1

img = Image.open(SRC).convert('RGBA')
W, H = img.size
arr = np.array(img)
alpha = arr[:, :, 3]
opaque = alpha > 128

# ---------- КОНТУР ОТДЕЛЬНО ----------
# Тёмная линия — это рисованный контур, а не оттенок заливки. Если пустить её
# через общее квантование, она рассыпается на несколько близких оттенков,
# каждый кусок оказывается мелкой областью и отсекается порогом площади —
# линия рвётся. Поэтому контур вынимается по яркости и кладётся поверх всего
# одним цветом, как его и рисовали.
lum = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0
ink_mask = opaque & (lum < INK_L)
ink_color = '#%02x%02x%02x' % tuple(np.median(arr[:, :, :3][ink_mask], axis=0).astype(int)) \
    if ink_mask.any() else '#000000'

# ---------- КВАНТОВАНИЕ ОСТАЛЬНОГО ----------
rgb = Image.fromarray(arr[:, :, :3], 'RGB').quantize(colors=NCOLORS, method=Image.MEDIANCUT, dither=Image.NONE)
idx = np.array(rgb)
pal = np.array(rgb.getpalette()[:NCOLORS * 3]).reshape(-1, 3)


def components(mask):
    """Связные области маски, 4-связность, итеративный обход."""
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        cells = []
        while stack:
            y, x = stack.pop()
            cells.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(cells) >= MIN_AREA:
            out.append(cells)
    return out


def outline(cells):
    """Граница области как замкнутые контуры из рёбер пикселей."""
    inside = set(cells)
    edges = {}
    for (y, x) in cells:
        if (y - 1, x) not in inside: edges[(x, y)] = (x + 1, y)
        if (y, x + 1) not in inside: edges[(x + 1, y)] = (x + 1, y + 1)
        if (y + 1, x) not in inside: edges[(x + 1, y + 1)] = (x, y + 1)
        if (y, x - 1) not in inside: edges[(x, y + 1)] = (x, y)

    loops = []
    while edges:
        start = next(iter(edges))
        loop = [start]
        cur = edges.pop(start)
        while cur != start and cur in edges:
            loop.append(cur)
            cur = edges.pop(cur)
        if len(loop) > 7:
            loops.append(loop)
    loops.sort(key=len, reverse=True)
    # ВСЕ контуры, не только внешний: белый кант — кольцо, и без внутреннего
    # контура его дырка не вырезается, отчего он закрашивает всю машину.
    return loops


def simplify(pts, eps):
    """Дуглас — Пекер по замкнутому контуру."""
    def rec(a, b):
        if b <= a + 1:
            return []
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1.0
        best, bi = -1, a
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > best:
                best, bi = d, i
        if best <= eps:
            return []
        return rec(a, bi) + [bi] + rec(bi, b)

    if len(pts) < 4:
        return pts
    keep = [0] + rec(0, len(pts) - 1) + [len(pts) - 1]
    return [pts[i] for i in keep]


def to_path(pts, smooth):
    """Замкнутый полигон в кубические кривые (Catmull–Rom с натяжением)."""
    n = len(pts)
    if n < 3:
        return ''
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(n):
        p0 = pts[(i - 1) % n]; p1 = pts[i]; p2 = pts[(i + 1) % n]; p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * smooth / 6, p1[1] + (p2[1] - p0[1]) * smooth / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) * smooth / 6, p2[1] - (p3[1] - p1[1]) * smooth / 6)
        d += f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d + "Z"


layers = []
for ci in range(NCOLORS):
    mask = (idx == ci) & opaque & ~ink_mask
    area = int(mask.sum())
    if area < MIN_AREA:
        continue
    color = '#%02x%02x%02x' % tuple(pal[ci])
    for cells in components(mask):
        d = ''.join(to_path(simplify(loop, EPS), SMOOTH) for loop in outline(cells))
        if d:
            layers.append((len(cells), color, d))

layers.sort(key=lambda t: -t[0])          # крупное вниз, мелкое поверх

# Контур — поверх всех заливок, целиком, одним слоем.
for cells in components(ink_mask):
    d = ''.join(to_path(simplify(loop, EPS), SMOOTH) for loop in outline(cells))
    if d:
        layers.append((0, ink_color, d))
body = '\n'.join(f'<path fill="{c}" fill-rule="evenodd" d="{d}"/>' for _, c, d in layers)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">\n{body}\n</svg>')
open(DST, 'w').write(svg)
print(f'слоёв: {len(layers)}, точек: {sum(d.count("C") for _, _, d in layers)}, '
      f'размер: {len(svg) / 1024:.1f} КБ')
