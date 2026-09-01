#!/usr/bin/env python3
# Разностная картинка: снятая сцена против референса.
#
# Наложение полупрозрачностью показывает, ЧТО не совпало, но не показывает
# НА СКОЛЬКО: глаз мирится со сдвигом в десяток единиц, а он виден.
# Здесь считается модуль разности по яркости и печатается таблица промахов
# по клеткам — сразу понятно, какой предмет двигать.
#
# Запуск: python3 tools/diff-kitchen-objects.py /tmp/ko-scene.png
import sys
from PIL import Image, ImageChops, ImageOps, ImageDraw

shot = Image.open(sys.argv[1]).convert('RGB').resize((720, 1440), Image.LANCZOS)
ref = Image.open('docs/ref/kitchen.png').convert('RGB')
d = ImageChops.difference(shot, ref).convert('L')
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/ko-delta.png'

vis = ImageOps.autocontrast(d).convert('RGB')
dr = ImageDraw.Draw(vis)
cells = []
for gy in range(0, 1440, 120):
    for gx in range(0, 720, 120):
        box = d.crop((gx, gy, gx + 120, gy + 120))
        m = sum(box.getdata()) / (120 * 120)
        cells.append((m, gx, gy))
        dr.rectangle([gx, gy, gx + 120, gy + 120], outline=(255, 0, 255))
        dr.text((gx + 4, gy + 4), '%d' % m, fill=(255, 255, 0))
vis.save(out)
cells.sort(reverse=True)
print('средний промах: %.1f' % (sum(c[0] for c in cells) / len(cells)))
print('худшие клетки (промах, x, y):')
for c in cells[:10]:
    print('   %5.1f  %3d %4d' % c)
