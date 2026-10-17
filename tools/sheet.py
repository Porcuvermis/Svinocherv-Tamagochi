#!/usr/bin/env python3
"""Склейка снимков в один лист для оценки игроком.

    python3 tools/sheet.py out.png a.png b.png c.png [--h 1100]

Картинки встают в ряд, приводятся к одной высоте (--h, по умолчанию
высота самой высокой) и разделяются тёмной полосой. Подписей нет: лист
показывается в чате, и что где — говорится словами там же.
"""
import sys
from PIL import Image

def main(argv):
    args, h = [], None
    i = 0
    while i < len(argv):
        if argv[i] == '--h':
            h = int(argv[i + 1]); i += 2; continue
        args.append(argv[i]); i += 1
    out, files = args[0], args[1:]
    ims = [Image.open(f).convert('RGB') for f in files]
    h = h or max(im.height for im in ims)
    ims = [im.resize((round(im.width * h / im.height), h), Image.LANCZOS) for im in ims]
    gap = 24
    W = sum(im.width for im in ims) + gap * (len(ims) + 1)
    sheet = Image.new('RGB', (W, h + 2 * gap), (24, 20, 22))
    x = gap
    for im in ims:
        sheet.paste(im, (x, gap)); x += im.width + gap
    sheet.save(out)
    print(out, sheet.size)

if __name__ == '__main__':
    main(sys.argv[1:])
