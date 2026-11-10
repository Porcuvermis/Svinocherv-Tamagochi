# Живость экранчиков колеса (план 31): раз в 6–10 с один видимый значок
# сбоит как дисплей — цифровой сбой, рассыпание на пиксели, построчная
# перерисовка; выпавший при выигрыше — сбой с яркой вспышкой.
# Значки не перерисовываются: эффект двигает клетки той же сетки 16×16
# (sprite() из machine.py); экран — весь клин сектора, пиксели разлетаются
# по нему и обрезаются его краем.
# Эскиз: подложка — кадр аппарата без значков (ICONS_OFF=1), значки и
# эффекты светятся поверх. Паузы в эскизе укорочены, чтобы видеть всё.
#   python3 wheel-fx.py <кадр.png> out/mach-icons.json <выход-префикс>
import sys, json, math, random
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
sys.argv, args = sys.argv[:1], sys.argv[1:]
from machine import sprite, S, Y0

base_png, icons_json, out = args
FPS, Q, PIX = 25, 1.9, 5.0             # шаг светодиода (ед.), размер точки (тексели)
icons = json.load(open(icons_json))
base = np.asarray(Image.open(base_png).convert('RGB'), np.float32) / 255
CX0, CY0, CX1, CY1 = 21, -57, 215, 292  # участок поля: колесо в видимой зоне
crop = base[(CY0 - Y0) * S:(CY1 - Y0) * S, CX0 * S:CX1 * S]

def rgb(h): return np.array([int(h[k:k + 2], 16) for k in (1, 3, 5)], np.float32) / 255

SPR = {k: sprite(k) for k in set(i[2] for i in icons)}

def cells(kind):
    g = SPR[kind]
    return [(x, y, rgb(g[y][x])) for y in range(16) for x in range(16) if g[y][x]]

WH = (22, 118, 150)

def in_wedge(x, y, ix, iy):
    # клин сектора, на котором стоит значок: экран — весь клин, не квадрат
    a0 = math.atan2(iy - WH[1], ix - WH[0])
    a = math.atan2(y - WH[1], x - WH[0])
    d = math.hypot(x - WH[0], y - WH[1])
    da = (a - a0 + math.pi) % (2 * math.pi) - math.pi
    return abs(da) < math.pi / 16 - 0.012 and 24 < d < WH[2] - 2

def draw(E, ix, iy, pts):
    # pts: (клетка x, клетка y в сетке 24×24, цвет 3, яркость) — квантовано
    for gx, gy, col, br in pts:
        if br <= 0:
            continue
        fx, fy = ix + (gx - 12) * Q, iy + (gy - 12) * Q
        if not in_wedge(fx + Q / 2, fy + Q / 2, ix, iy):
            continue
        px = (fx - CX0) * S
        py = (fy - CY0) * S
        x0, y0 = int(round(px)), int(round(py))
        E[y0:y0 + int(PIX), x0:x0 + int(PIX)] += col * br

def state(kind, t, cl, rng):
    """Клетки значка в миг t (0..1) эффекта kind."""
    base_pts = [(x + 4, y + 4, c, 1.0) for x, y, c in cl]
    if kind == 'idle':
        return base_pts
    if kind == 'glitch' or kind == 'win':
        tt = t if kind == 'glitch' else min(1, t / 0.35)
        if kind == 'win' and t > 0.35:
            # вспышка: два импульса пересвета
            k = (t - 0.35) / 0.65
            br = 1 + 1.4 * max(0, math.sin(k * math.pi * 2)) * (1 - k * 0.4)
            return [(x, y, c, br) for x, y, c, _ in base_pts]
        f = int(tt * 9)
        if f in (3,):
            return []                                    # кадр гаснет
        bright = 1.7 if f == 5 else 1.0
        r2 = random.Random(f * 31 + 7)
        bands = [(r2.randrange(16), r2.randrange(2, 5), r2.choice([-3, -2, -1, 1, 2, 3])) for _ in range(2 + r2.randrange(2))]
        res = []
        for x, y, c, _ in base_pts:
            sh = sum(s for y0, h, s in bands if y0 <= y - 4 < y0 + h) if tt < 0.9 else 0
            if tt < 0.9 and f % 2 == 0:
                # расслоение каналов: красный вправо, синий влево
                res += [(x + sh + 1, y, c * np.array([1, 0, 0], np.float32), bright),
                        (x + sh, y, c * np.array([0, 1, 0], np.float32), bright),
                        (x + sh - 1, y, c * np.array([0, 0, 1], np.float32), bright)]
            else:
                res.append((x + sh, y, c, bright))
        return res
    if kind == 'scatter':
        s = math.sin(math.pi * t) ** 1.4
        res = []
        for x, y, c, _ in base_pts:
            r2 = random.Random(x * 97 + y * 13)
            vx, vy = (x - 12) * (0.5 + r2.random()) + (r2.random() - 0.5) * 6, (y - 12) * (0.5 + r2.random()) + (r2.random() - 0.5) * 6
            res.append((int(round(x + vx * s * 0.9)), int(round(y + vy * s * 0.9)), c, 1 - 0.55 * s))
        return res
    if kind == 'redraw':
        if t < 0.12:
            return []
        row = (t - 0.12) / 0.8 * 16
        res = []
        for x, y, c, _ in base_pts:
            r = y - 4
            if r < row - 1:
                res.append((x, y, c, 1.0))
            elif r < row:
                res.append((x, y, np.array([1, 1, 1], np.float32), 1.3))   # строка развёртки
        return res

DUR = {'glitch': 0.32, 'scatter': 0.75, 'redraw': 0.45, 'win': 1.1}
# эскиз: паузы ~1 с вместо 6–10, все виды по разу, выигрыш — последним
plan = [(0.8, 1, 'glitch'), (2.2, 3, 'scatter'), (4.0, 2, 'redraw'), (5.6, 1, 'glitch'), (7.0, 0, 'win')]
total = 8.6
frames = []
for fi in range(int(total * FPS)):
    t = fi / FPS
    E = np.zeros_like(crop)
    for k, (ix, iy, kind) in enumerate(icons):
        st, tt = 'idle', 0
        for t0, idx, ev in plan:
            if idx == k and t0 <= t < t0 + DUR[ev]:
                st, tt = ev, (t - t0) / DUR[ev]
        draw(E, ix, iy, state(st, tt, cells(kind), None))
        if st == 'win' and tt > 0.35:
            k = (tt - 0.35) / 0.65
            pulse = max(0, math.sin(k * math.pi * 2)) * (1 - k * 0.4)
            ys, xs = np.mgrid[0:E.shape[0], 0:E.shape[1]]
            fx, fy = CX0 + (xs + 0.5) / S, CY0 + (ys + 0.5) / S
            a0 = math.atan2(iy - WH[1], ix - WH[0])
            da = (np.arctan2(fy - WH[1], fx - WH[0]) - a0 + math.pi) % (2 * math.pi) - math.pi
            d = np.hypot(fx - WH[0], fy - WH[1])
            wedge = (np.abs(da) < math.pi / 16 - 0.012) & (d > 24) & (d < WH[2] - 2)
            E[wedge] += np.array([0.55, 0.32, 0.06], np.float32) * pulse
    glow = gaussian_filter(E, (5, 5, 0)) * 0.75 + gaussian_filter(E, (14, 14, 0)) * 0.45
    img = np.clip(crop + E * 0.95 + glow, 0, 1)
    frames.append(Image.fromarray((img * 255).astype(np.uint8)).resize((388, 698), Image.LANCZOS))
frames[0].save(out + 'wheel-fx.gif', save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0)
for i, ft in enumerate([0.3, 0.88, 2.55, 4.22, 7.6]):
    frames[int(ft * FPS)].save(f'{out}wfx-{i}.png')
print(len(frames), 'кадров')
