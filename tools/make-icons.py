#!/usr/bin/env python3
# Генератор иконок приложения (home screen / PWA).
#
# Иконки — единственные бинарники в репозитории, поэтому они не рисуются
# руками в редакторе, а собираются из палитры проекта: поменялась палитра —
# перезапустил скрипт, иконка поехала следом.
#
#   python3 tools/make-icons.py
#
# Пишет icons/icon-180.png (apple-touch-icon), icon-192.png, icon-512.png.
# Зависимостей нет: PNG собирается вручную через zlib из стандартной библиотеки.

import math
import struct
import zlib
from pathlib import Path

# ---------- ЦВЕТ (см. src/core/palette.js) ----------
BG_TOP    = (0x25, 0x2d, 0x2a)   # scene.700 — ближний план
BG_BOTTOM = (0x14, 0x18, 0x17)   # чуть глубже scene.900 — дальний фон
INK       = (0x23, 0x10, 0x1d)   # контур: не чёрный
FLESH = {
    900: (0x3d, 0x1f, 0x35),
    700: (0x60, 0x34, 0x44),
    500: (0xa7, 0x58, 0x63),
    300: (0xcb, 0x8f, 0x86),
    100: (0xeb, 0xd1, 0xbc),
}
ACID = (0xa9, 0xe8, 0x17)        # акцент, скупо

MASTER = 768                     # мастер-холст, из него сводятся все размеры
STEPS = 400                      # выборок вдоль позвоночника

Y0, Y1 = 0.18, 0.84              # тело всегда в этой полосе по вертикали


def lerp(a, b, t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return (round(a[0] + (b[0] - a[0]) * t),
            round(a[1] + (b[1] - a[1]) * t),
            round(a[2] + (b[2] - a[2]) * t))


def spine(t):
    """Позвоночник червя: S-образная кривая сверху вниз. t = 0 — голова."""
    return (0.50 + 0.19 * math.sin(t * math.pi * 1.8 + 0.35),
            Y0 + (Y1 - Y0) * t)


def thickness(t):
    """Толщина тела: голова крупная, хвост сходит на нет."""
    return 0.145 * (0.80 + 0.40 * math.sin(math.pi * min(1.0, t * 1.10)) - 0.42 * t)


def render_master():
    n = MASTER
    pts = []
    for i in range(STEPS + 1):
        t = i / STEPS
        (cx, cy), r = spine(t), thickness(t)
        pts.append((cx, cy, r))

    px = bytearray(n * n * 3)
    span = Y1 - Y0
    for py in range(n):
        v = py / (n - 1)
        row_bg = lerp(BG_TOP, BG_BOTTOM, v)
        # Кривая монотонна по вертикали, поэтому кандидаты — узкое окно
        # вокруг t, отвечающего этой строке. Без окна рендер 768x768
        # означал бы 400 замеров расстояния на каждый пиксель.
        tc = (v - Y0) / span
        lo = max(0, int((tc - 0.18) * STEPS))
        hi = min(STEPS, int((tc + 0.18) * STEPS))
        if hi <= lo:
            for pxi in range(n):
                o = (py * n + pxi) * 3
                px[o], px[o + 1], px[o + 2] = row_bg
            continue
        window = pts[lo:hi + 1]
        coarse = window[::6]
        for pxi in range(n):
            u = pxi / (n - 1)
            # Грубый проход: если тело далеко — это фон, уточнять нечего.
            best = 9.9
            for cx, cy, r in coarse:
                d = ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5 / r
                if d < best:
                    best = d
            if best > 1.6:
                o = (py * n + pxi) * 3
                px[o], px[o + 1], px[o + 2] = row_bg
                continue
            bx = by = 0.0
            best = 9.9
            for cx, cy, r in window:
                d = ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5 / r
                if d < best:
                    best, bx, by = d, cx, cy
            if best > 1.0:
                o = (py * n + pxi) * 3
                px[o], px[o + 1], px[o + 2] = row_bg
                continue
            # Свет сверху-слева (единый источник света проекта): тон едет
            # по рампе мяса, мешать к белому/чёрному запрещено.
            light = 0.5 - ((u - bx) + (v - by)) * 3.0
            if light < 0.5:
                color = lerp(FLESH[700], FLESH[500], light * 2)
            else:
                color = lerp(FLESH[500], FLESH[300], (light - 0.5) * 2)
            if best > 0.80:                                  # контур
                color = lerp(color, INK, (best - 0.80) / 0.20)
            if best > 0.96:                                  # мягкий край
                color = lerp(color, row_bg, (best - 0.96) / 0.04)
            o = (py * n + pxi) * 3
            px[o], px[o + 1], px[o + 2] = color

    def dot(cu, cv, rad, color, alpha=1.0):
        for py in range(max(0, int((cv - rad) * n)), min(n, int((cv + rad) * n) + 1)):
            for pxi in range(max(0, int((cu - rad) * n)), min(n, int((cu + rad) * n) + 1)):
                d = math.hypot(pxi / (n - 1) - cu, py / (n - 1) - cv) / rad
                if d <= 1.0:
                    a = alpha * min(1.0, (1.0 - d) * 6)
                    o = (py * n + pxi) * 3
                    cur = (px[o], px[o + 1], px[o + 2])
                    px[o], px[o + 1], px[o + 2] = lerp(cur, color, a)

    hx, hy = spine(0.0)
    dot(hx - 0.010, hy + 0.014, 0.050, FLESH[300])       # пятак
    dot(hx - 0.028, hy + 0.010, 0.013, INK)              # ноздря
    dot(hx + 0.010, hy + 0.022, 0.013, INK)              # ноздря
    dot(hx + 0.040, hy - 0.050, 0.028, FLESH[100])       # глаз
    dot(hx + 0.046, hy - 0.047, 0.013, INK)              # зрачок
    dot(hx - 0.026, hy - 0.072, 0.019, ACID, 0.90)       # ирокез: акцент
    dot(hx + 0.006, hy - 0.090, 0.013, ACID, 0.75)
    return px


def downsample(master, size):
    """Площадное усреднение мастера в нужный размер — это и есть сглаживание."""
    n = MASTER
    k = n / size
    out = bytearray()
    for y in range(size):
        out.append(0)  # PNG filter: None
        y0, y1 = int(y * k), max(int(y * k) + 1, int((y + 1) * k))
        for x in range(size):
            x0, x1 = int(x * k), max(int(x * k) + 1, int((x + 1) * k))
            r = g = b = cnt = 0
            for sy in range(y0, min(y1, n)):
                base = sy * n
                for sx in range(x0, min(x1, n)):
                    o = (base + sx) * 3
                    r += master[o]; g += master[o + 1]; b += master[o + 2]
                    cnt += 1
            out += bytes((r // cnt, g // cnt, b // cnt))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    Path(path).write_bytes(png)
    print(f'{path}: {len(png)} байт')


if __name__ == '__main__':
    Path('icons').mkdir(exist_ok=True)
    master = render_master()
    for size in (512, 192, 180):
        write_png(f'icons/icon-{size}.png', size, downsample(master, size))
