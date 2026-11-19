# Карта канта для света канта (план 31, разд. 5в): кант — золотая жилка
# трёх поясов корпуса (machine.py: T1–T3, линия grect с отступом 5). Свет по
# жилке считает телефон (greed-lux-kant.js), а всё, что от времени не
# зависит, запекается здесь — на телефоне остаётся только бег импульса.
#
#   kant-s.png (без сглаживания): R,G — где точка вдоль жилки (16 бит,
#     (кольцо + s) / 3, s — доля круга от левого края верха по часовой),
#     B — номер кольца + 1 (0 — дальше 16 ед. от канта).
#   kant-f.png (со сглаживанием): R — расстояние до оси жилки ×15 (255 —
#     далеко); G — отражение: насколько поверхность повёрнута к жилке (рельеф
#     корпуса) × глянец × затенение; B — золото у жилки (маска золота ×
#     близость), чтобы оно пылало изнутри, ярче на скатах.
#
# Карты читаются из готового корпуса (lux/height, mat, shade), плотность та
# же. Альфы нет нарочно: браузер при декодировании PNG умножает цвет на
# альфу, и где она мала, данные теряются.
#   python3 kant.py ../../src/minigames/greed/lux/
import os, sys, json, math
import numpy as np
from PIL import Image

T1, T2, T3 = (4, -55, 356, 292, 34), (6, 296, 354, 498, 30), (6, 502, 354, 634, 30)
RINGS = [(t[0] + 5, t[1] + 5, t[2] - 5, t[3] - 5, t[4] - 5) for t in (T1, T2, T3)]
X0, Y0, FW, FH = 0, -57, 360, 696
REACH = 16.0          # дальше — света канта нет
HK = 3.0              # жилка «над» поверхностью: откуда приходит её свет на лак

def ring_len(rg):
    x0, y0, x1, y1, r = rg
    return 2 * ((x1 - x0 - 2 * r) + (y1 - y0 - 2 * r)) + 2 * math.pi * r

def nearest(rg, X, Y):
    """Ближайшая точка контура скруглённого прямоугольника: расстояние и s."""
    x0, y0, x1, y1, r = rg
    w, h = x1 - x0 - 2 * r, y1 - y0 - 2 * r
    cx, cy = np.clip(X, x0 + r, x1 - r), np.clip(Y, y0 + r, y1 - r)
    dx, dy = X - cx, Y - cy
    out = np.hypot(dx, dy) > 1e-6
    # снаружи внутреннего прямоугольника: ближайшая — на дуге/стороне по радиусу
    dist = np.where(out, np.abs(np.hypot(dx, dy) - r), 0.0)
    # внутри: до ближайшей стороны внешнего контура
    din = np.minimum.reduce([X - x0, x1 - X, Y - y0, y1 - Y])
    dist = np.where(out, dist, din)
    # точка контура
    a = np.arctan2(dy, dx)
    px = np.where(out, cx + np.cos(a) * r, X)
    py = np.where(out, cy + np.sin(a) * r, Y)
    side = np.argmin(np.stack([X - x0, x1 - X, Y - y0, y1 - Y]), axis=0)
    px = np.where(out, px, np.select([side == 0, side == 1], [x0, x1], X))
    py = np.where(out, py, np.select([side == 2, side == 3], [y0, y1], Y))
    # s: по часовой от (x0 + r, y0)
    L = ring_len(rg); q = math.pi * r / 2
    on_top = (py <= y0 + 1e-3) & (px >= x0 + r) & (px <= x1 - r)
    on_r = (px >= x1 - 1e-3) & (py >= y0 + r) & (py <= y1 - r)
    on_b = (py >= y1 - 1e-3) & (px >= x0 + r) & (px <= x1 - r)
    on_l = (px <= x0 + 1e-3) & (py >= y0 + r) & (py <= y1 - r)
    ang = lambda ccx, ccy: np.arctan2(py - ccy, px - ccx)
    s = np.zeros_like(X)
    # углы: правый верх, правый низ, левый низ, левый верх
    tr = (px > x1 - r) & (py < y0 + r); br = (px > x1 - r) & (py > y1 - r)
    bl = (px < x0 + r) & (py > y1 - r); tl = (px < x0 + r) & (py < y0 + r)
    s = np.where(tr, w + r * (ang(x1 - r, y0 + r) + math.pi / 2), s)
    s = np.where(br, w + q + h + r * ang(x1 - r, y1 - r), s)
    s = np.where(bl, 2 * w + 2 * q + h + r * (ang(x0 + r, y1 - r) - math.pi / 2), s)
    tlang = np.mod(ang(x0 + r, y0 + r), 2 * math.pi)
    s = np.where(tl, 2 * w + 2 * h + 3 * q + r * (tlang - math.pi), s)
    s = np.where(on_top, px - (x0 + r), s)
    s = np.where(on_r, w + q + (py - (y0 + r)), s)
    s = np.where(on_b, w + 2 * q + h + ((x1 - r) - px), s)
    s = np.where(on_l, 2 * w + 3 * q + h + ((y1 - r) - py), s)
    return dist, np.mod(s / L, 1.0), px, py

def main(lux):
    H = np.asarray(Image.open(lux + 'height.png').convert('RGB')).astype(np.float64)
    M = np.asarray(Image.open(lux + 'mat.png').convert('RGB')).astype(np.float64) / 255
    SH = np.asarray(Image.open(lux + 'shade.png').convert('L')).astype(np.float64) / 255
    hh, ww = H.shape[:2]
    S = ww / FW
    h = (H[..., 0] * 256 + H[..., 1]) / 65535 * 64          # как в шейдере корпуса
    ys, xs = np.mgrid[0:hh, 0:ww]
    X = X0 + (xs + 0.5) / S; Y = Y0 + (ys + 0.5) / S
    D = np.full(X.shape, 1e9); RING = np.full(X.shape, -1); SS = np.zeros(X.shape)
    for i, rg in enumerate(RINGS):
        d, s, px, py = nearest(rg, X, Y)
        m = d < D
        D = np.where(m, d, D); RING = np.where(m, i, RING); SS = np.where(m, s, SS)
        PXN = np.where(m, px, PXN) if i else px; PYN = np.where(m, py, PYN) if i else py
    # Видна ли жилка в ближайшей точке: там должно быть золото. Где кант
    # закрыт другой деталью (столб колбы на стыке поясов), свет не идёт:
    # иначе он ложился поверх колбы.
    goldm = (M[..., 2] > 0.5).astype(np.float64)
    gm = np.maximum.reduce([np.roll(np.roll(goldm, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    ix = np.clip(((PXN - X0) * S).astype(int), 0, ww - 1); iy = np.clip(((PYN - Y0) * S).astype(int), 0, hh - 1)
    vis = gm[iy, ix] > 0.5
    near = (D < REACH) & vis
    # нормаль корпуса (как шейдер: шаг 2 текселя)
    gy, gx = np.gradient(h, 1 / S)
    N = np.dstack([-gx, -gy, np.ones_like(h)]); N /= np.linalg.norm(N, axis=2, keepdims=True)
    # направление к жилке — против градиента расстояния
    dgy, dgx = np.gradient(D, 1 / S)
    ln = np.hypot(dgx, dgy) + 1e-9
    Lv = np.dstack([-dgx / ln * D, -dgy / ln * D, np.full(D.shape, HK)])
    Lv /= np.linalg.norm(Lv, axis=2, keepdims=True)
    facing = np.clip((N * Lv).sum(2), 0, 1)
    fall = 1 / (1 + (D / 3.5) ** 2)
    gloss = 0.25 + 0.75 * M[..., 0]                          # лак глянцевый, мат — тусклее
    gold = M[..., 2] > 0.5
    refl = np.where(near & ~gold, facing * fall * gloss * SH, 0)
    slope = 1 - N[..., 2]
    goldf = np.where(near & gold, np.exp(-D / 1.4) * (0.55 + 3.0 * slope) * (0.6 + 0.4 * SH), 0)
    # кодирование
    u = np.where(near, np.clip((RING + SS) / 3, 0, 1 - 1e-6), 0)
    u16 = (u * 65535).astype(np.uint32)
    A = np.zeros((hh, ww, 3), np.uint8)
    A[..., 0] = np.where(near, u16 >> 8, 0); A[..., 1] = np.where(near, u16 & 255, 0)
    A[..., 2] = np.where(near, RING + 1, 0)
    F = np.zeros((hh, ww, 3), np.uint8)
    F[..., 0] = np.where(near, np.clip(D * 15, 0, 254), 255)
    F[..., 1] = np.clip(refl * 255, 0, 255)
    F[..., 2] = np.clip(goldf / 2 * 255, 0, 255)
    Image.fromarray(A).save(lux + 'kant-s.png', optimize=True)
    Image.fromarray(F).save(lux + 'kant-f.png', optimize=True)
    json.dump({'rings': RINGS, 'len': [round(ring_len(r), 2) for r in RINGS], 'reach': REACH},
              open(lux + 'kant.json', 'w'))
    print('ok', ww, hh, 'S', S, 'len', [round(ring_len(r), 1) for r in RINGS])

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../../src/minigames/greed/lux/')
