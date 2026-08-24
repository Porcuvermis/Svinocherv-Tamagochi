#!/usr/bin/env python3
# Генератор launch-экранов для iOS (apple-touch-startup-image).
#
#   python3 tools/make-splash.py
#
# ---------- ЗАЧЕМ ЭТО ВООБЩЕ ----------
# Между анимацией открытия иконки и первым кадром страницы iOS показывает
# свой launch-экран. Если подходящей картинки нет, он БЕЛЫЙ — отсюда вспышка
# белым на долю секунды перед чёрной пеленой загрузки. Никаким CSS её не
# убрать: в этот момент страница ещё не разобрана, и правил из неё не
# существует. Единственный способ — отдать iOS готовую картинку нужного
# размера.
#
# Картинки сплошь чёрные (#000) — ровно того же цвета, что и пелена в
# src/core/boot-screen.js. Тогда шва не видно вообще: launch-экран, первый
# кадр страницы и пелена — один и тот же чёрный.
#
# ---------- ПОЧЕМУ ФАЙЛОВ ТАК МНОГО ----------
# iOS выбирает картинку по media-запросу с ТОЧНЫМИ размерами устройства и
# плотностью пикселей. Одной картинкой на все айфоны не обойтись: размер не
# совпал — картинка не подошла, и снова белый экран. Отсюда таблица моделей.
# Файлы при этом почти ничего не весят: сплошной чёрный жмётся в пару
# килобайт независимо от разрешения.
#
# Только портрет: в manifest.webmanifest игра заперта в portrait.
#
# Новый айфон с новым разрешением — дописать строку в DEVICES, перезапустить
# скрипт и обновить <link> в index.html (скрипт печатает их готовыми).

import struct
import zlib
from pathlib import Path

OUT_DIR = Path('icons/splash')

# (ширина в CSS-пикселях, высота в CSS-пикселях, плотность, кто это)
DEVICES = [
    (320, 568, 2, 'iPhone SE 1, 5/5s/5c'),
    (375, 667, 2, 'iPhone 6/7/8, SE 2/3'),
    (414, 736, 3, 'iPhone 6/7/8 Plus'),
    (375, 812, 3, 'iPhone X/XS, 11 Pro, 12 mini, 13 mini'),
    (414, 896, 2, 'iPhone XR, 11'),
    (414, 896, 3, 'iPhone XS Max, 11 Pro Max'),
    (390, 844, 3, 'iPhone 12/12 Pro, 13/13 Pro, 14'),
    (428, 926, 3, 'iPhone 12/13 Pro Max, 14 Plus'),
    (393, 852, 3, 'iPhone 14 Pro, 15/15 Pro, 16'),
    (430, 932, 3, 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus'),
    (402, 874, 3, 'iPhone 16 Pro'),
    (440, 956, 3, 'iPhone 16 Pro Max'),
    (768, 1024, 2, 'iPad mini/Air 9.7'),
    (810, 1080, 2, 'iPad 10.2'),
    (820, 1180, 2, 'iPad Air 10.9'),
    (834, 1112, 2, 'iPad Pro 10.5'),
    (834, 1194, 2, 'iPad Pro 11'),
    (1024, 1366, 2, 'iPad Pro 12.9'),
]


def write_black_png(path, width, height):
    """Сплошной чёрный PNG. Тип цвета 0 (серый, 8 бит): один байт на пиксель,
    нулевой байт = чёрный. Ряды идут с байтом фильтра 0 в начале — то есть
    всё содержимое это нули, и zlib ужимает его до пары килобайт."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    raw = b'\x00' * ((width + 1) * height)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)
    return len(png)


if __name__ == '__main__':
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    total = 0
    links = []
    for w, h, scale, name in DEVICES:
        px_w, px_h = w * scale, h * scale
        path = OUT_DIR / f'splash-{px_w}x{px_h}.png'
        total += write_black_png(path, px_w, px_h)
        links.append(
            f'    <link rel="apple-touch-startup-image" href="{path}"\n'
            f'          media="(device-width: {w}px) and (device-height: {h}px) '
            f'and (-webkit-device-pixel-ratio: {scale}) and (orientation: portrait)">'
            f'  <!-- {name} -->'
        )

    print(f'\n{len(DEVICES)} файлов, всего {total / 1024:.1f} КБ\n')
    print('Готовые теги для <head> в index.html:\n')
    print('\n'.join(links))
