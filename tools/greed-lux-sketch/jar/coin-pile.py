# Куча монет в трёхлитровой банке — симуляция насыпания, запекается в
# src/minigames/greed/greed-jar3-coins.js (GreedJar3.COINS).
#
# Игрок (17.11): монеты в 2D-банке разного размера, и размер не сходится с
# перспективой — передние меньше задних. Поэтому монеты теперь — настоящие
# диски в объёме банки: одного размера, у каждой своё место и наклон, а на
# экран их проецирует отрисовка (greed-jar3.js) — перспектива верная сама.
#
# Насыпание — по карте высот: монета падает в случайную точку, ложится на
# то, что под ней (на самую высокую точку опоры), наклоняется по уклону
# опоры с небольшой случайностью, карта высот поднимается под ней. Несколько
# прогонов с разным зерном — берётся тот, где спереди меньше всего щелей.
# В файл — только видимые монеты: оболочка у стекла и верх кучи.
#
#   python3 coin-pile.py ../../../src/minigames/greed/greed-jar3-coins.js
import sys, math, json
import numpy as np

H_JAR = 1.0                 # координаты банки: y — вверх от дна (доли высоты)
R_IN = 0.33 * 0.995 - 0.016 # внутренний радиус бочонка
CR, TH = 0.05, 0.008        # радиус и толщина монеты (3-литровая банка ~24 см, монета ~2,5 см)
TOP = 0.42                  # верх кучи (ниже верха скотча)
BOTTOM = 0.035              # толстое дно
G = 0.005                   # шаг карты высот

def simulate(seed):
    rng = np.random.default_rng(seed)
    n = int(2 * 0.36 / G)
    xs = (np.arange(n) - n / 2 + 0.5) * G
    X, Z = np.meshgrid(xs, xs, indexing='ij')
    inside = np.hypot(X, Z) < R_IN
    Hm = np.where(inside, BOTTOM, 9.0)
    ang = np.linspace(0, 2 * np.pi, 16, endpoint=False)
    coins = []
    while True:
        mean = Hm[np.hypot(X, Z) < R_IN * 0.7].mean()
        if mean >= TOP:
            break
        # монета скатывается в ямку: из нескольких мест рядом — самое низкое
        rr = (R_IN - CR * 0.9) * math.sqrt(rng.random())
        a = rng.random() * 2 * math.pi
        best = None
        for _ in range(8):
            cx = rr * math.cos(a) + rng.normal(0, 0.035); cz = rr * math.sin(a) + rng.normal(0, 0.035)
            if math.hypot(cx, cz) > R_IN - CR * 0.9: continue
            px, pz = cx + np.cos(ang) * CR, cz + np.sin(ang) * CR
            ix = np.clip(((px / G) + n / 2).astype(int), 0, n - 1); iz = np.clip(((pz / G) + n / 2).astype(int), 0, n - 1)
            h = Hm[ix, iz]
            h = np.where(h > 5, h.min(), h)           # стенка — опора не по высоте
            dx, dz = px - cx, pz - cz
            A = np.stack([dx, dz, np.ones_like(dx)], 1)
            gx, gz, _ = np.linalg.lstsq(A, h, rcond=None)[0]
            # уклон опоры + немного случайности: монеты ложатся вразнобой
            gx += rng.normal(0, 0.18); gz += rng.normal(0, 0.18)
            s = math.hypot(gx, gz); lim = math.tan(math.radians(40))
            if s > lim: gx, gz = gx * lim / s, gz * lim / s
            cy = float(np.max(h - (gx * dx + gz * dz))) + TH / 2
            if best is None or cy < best[0]: best = (cy, cx, cz, gx, gz)
        if best is None: continue
        cy, cx, cz, gx, gz = best
        nrm = np.array([-gx, 1.0, -gz]); nrm /= np.linalg.norm(nrm)
        coins.append((cx, cy, cz, *nrm))
        m = np.hypot(X - cx, Z - cz) < CR
        Hm[m] = np.maximum(Hm[m], cy + gx * (X[m] - cx) + gz * (Z[m] - cz) + TH / 2)
    return coins, Hm, X, Z

def visible(coins, Hm, X, Z):
    n = Hm.shape[0]
    out = []
    for c in coins:
        x, y, z = c[:3]
        ix, iz = int(x / G + n / 2), int(z / G + n / 2)
        top = Hm[np.clip(ix, 0, n - 1), np.clip(iz, 0, n - 1)]
        if math.hypot(x, z) > R_IN - 2.3 * CR or y > top - 2.5 * TH - 0.02:
            out.append(c)
    return out

def coverage(coins):
    # спереди, без поворота: доля точек бока кучи, закрытых монетами
    W, Hh = 240, 200
    img = np.zeros((Hh, W), bool)
    yy, xx = np.mgrid[0:Hh, 0:W]
    fx = (xx / W * 2 - 1) * R_IN; fy = BOTTOM + yy / Hh * (TOP - BOTTOM - 0.03)
    for c in coins:
        x, y, z, nx, ny, nz = c
        if z < 0: continue
        d = (fx - x) ** 2 + (fy - y) ** 2
        img |= d < (CR * 0.8) ** 2
    return img.mean()

best = None
for seed in range(1, 7):
    coins, Hm, X, Z = simulate(seed)
    vis = visible(coins, Hm, X, Z)
    cov = coverage(vis)
    print(f'зерно {seed}: монет {len(coins)}, видимых {len(vis)}, закрыто спереди {cov:.3f}')
    if best is None or cov > best[0]:
        best = (cov, seed, vis)
cov, seed, vis = best
print('взято зерно', seed)
flat = [round(v, 4) for c in vis for v in c]
out = sys.argv[1]
open(out, 'w').write(
    '// Куча монет в трёхлитровой банке — ЗАПЕЧЕНО tools/greed-lux-sketch/jar/coin-pile.py\n'
    f'// (насыпание по карте высот, зерно {seed}). Не править руками.\n'
    '// По 6 чисел на монету: x, y, z (y — вверх от дна, доли высоты банки; z — к\n'
    '// игроку при повороте 0) и нормаль nx, ny, nz. Радиус и толщина — GreedJar3.COIN.\n'
    f'GreedJar3.COIN = {{ r: {CR}, th: {TH} }};\n'
    'GreedJar3.COINS = ' + json.dumps(flat, separators=(',', ':')) + ';\n')
print(out, len(vis), 'монет')
