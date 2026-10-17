#!/usr/bin/env python3
"""Склеить скриншоты по префиксу в один уменьшенный лист (JPEG).
Зачем: каждая отдельная картинка остаётся в контексте модели навсегда.
Один лист из N кадров стоит как один кадр.
  python3 tools/sheet.py /tmp/shot-            -> /tmp/shot-sheet.jpg
  python3 tools/sheet.py /tmp/shot- 4 260      колонок 4, ширина кадра 260
"""
import sys, glob
from PIL import Image
pre = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 4
w = int(sys.argv[3]) if len(sys.argv) > 3 else 240
out = pre + 'sheet.jpg'
files = [f for f in sorted(glob.glob(pre + '*.png'))]
if not files:
    sys.exit('нет файлов ' + pre + '*.png')
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    ims.append(im.resize((w, max(1, int(im.height * w / im.width)))))
rows = (len(ims) + cols - 1) // cols
rh = [max(i.height for i in ims[r*cols:(r+1)*cols]) for r in range(rows)]
sheet = Image.new('RGB', (cols * w, sum(rh)), (30, 30, 30))
y = 0
for r in range(rows):
    for c, im in enumerate(ims[r*cols:(r+1)*cols]):
        sheet.paste(im, (c * w, y))
    y += rh[r]
sheet.save(out, quality=70)
print(out, len(files), 'кадров')
for k, f in enumerate(files):
    print(k // cols + 1, k % cols + 1, f.split('/')[-1])
