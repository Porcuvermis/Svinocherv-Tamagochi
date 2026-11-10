# Болванка копилки в кадре игры: левый нижний угол, передний план — поверх
# цоколя и монет рамки, ниже конца шкалы (план 31, разд. 00). Тень под
# ногами — чтобы читалась глубина «стоит перед аппаратом».
#   python3 pig-place.py <кадр-игры-2x.png> <свинья.png> <выход.png> [x y h]
import sys
import numpy as np
from PIL import Image, ImageFilter
frame, pig, out = sys.argv[1:4]
X, Y, HGT = (float(v) for v in (sys.argv[4:7] if len(sys.argv) > 6 else (6, 728, 104)))   # точки экрана (1x): левый край, верх, высота
F = Image.open(frame).convert('RGBA')
k = F.width / 390
P = Image.open(pig).convert('RGBA')
P = P.crop(P.getbbox())
s = HGT * k / P.height
P = P.resize((int(P.width * s), int(P.height * s)), Image.LANCZOS)
x0, y0 = int(X * k), int(Y * k)
# контактная тень: размытый эллипс под нижней четвертью силуэта
sh = Image.new('L', F.size, 0)
a = np.asarray(P.split()[3])
from PIL import ImageDraw
d = ImageDraw.Draw(sh)
w = P.width
d.ellipse([x0 + w * 0.08, y0 + P.height * 0.86, x0 + w * 0.95, y0 + P.height * 1.04], fill=150)
sh = sh.filter(ImageFilter.GaussianBlur(8 * k))
dark = Image.new('RGBA', F.size, (8, 4, 2, 255)); dark.putalpha(sh)
F = Image.alpha_composite(F, dark)
F.alpha_composite(P, (x0, y0))
F.convert('RGB').save(out)
