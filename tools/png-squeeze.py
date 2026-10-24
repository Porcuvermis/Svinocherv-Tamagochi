#!/usr/bin/env python3
"""Пережать PNG без потерь (те же пиксели, меньше байт) и проверить это.
Картинки из браузера (canvas.toDataURL) сжаты слабо: атласы монет алчности
худеют на ~20%. Сжатие с потерями (палитра, webp) для карт нормалей не
годится — шум в нормалях виден как рябь блика.
    python3 tools/png-squeeze.py src/minigames/greed/*.png
"""
import sys, io
from PIL import Image, ImageChops
for f in sys.argv[1:]:
    im = Image.open(f); im.load()
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True, compress_level=9)
    back = Image.open(io.BytesIO(b.getvalue())).convert(im.mode)
    if ImageChops.difference(im, back).getbbox() is not None:
        sys.exit(f + ': пиксели разошлись — не пишу')
    old = len(open(f, 'rb').read()); new = len(b.getvalue())
    if new < old: open(f, 'wb').write(b.getvalue())
    print(f'{f}: {old // 1024} -> {min(old, new) // 1024} КБ')
