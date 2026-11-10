# Раскадровка подлёта банки на кадре игры: покой → подскок → полёт с
# поднятой крышкой (аппарат темнеет) → банка крупно посреди экрана, крышка
# откинута, видно горло. Положения — точки экрана 390×844 (1x).
#   python3 jar-board.py <кадр-игры-2x.png> <снимки-префикс> <выход.png>
import sys
from PIL import Image, ImageDraw, ImageFont
frame, pre, out = sys.argv[1:4]
F0 = Image.open(frame).convert('RGBA').resize((390, 844), Image.LANCZOS)
# (кадр банки, x, верх, высота, затемнение аппарата, подпись)
STEPS = [(0, 277, 642, 98, 0, '1. покой'), (1, 277, 626, 98, 0, '2. тап: подскок'),
         (2, 196, 400, 190, 0.55, '3. полёт, крышка'), (3, 70, 250, 330, 0.78, '4. банка крупно')]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
tiles = []
for i, x, y, h, dim, cap in STEPS:
    F = F0.copy()
    if dim:
        F = Image.alpha_composite(F, Image.new('RGBA', F.size, (8, 4, 2, int(255 * dim))))
    J = Image.open(f'{pre}{i}.png').convert('RGBA'); J = J.crop(J.getbbox())
    s = h / J.height; J = J.resize((int(J.width * s), h), Image.LANCZOS)
    if i == 0:
        # на месте старой банки — закрыть её фоном, чтобы не двоилось
        pass
    F.alpha_composite(J, (int(x), int(y)))
    d = ImageDraw.Draw(F); d.rectangle([0, 0, 390, 30], fill=(0, 0, 0, 200)); d.text((8, 5), cap, fill=(244, 220, 148), font=font)
    tiles.append(F.convert('RGB'))
sh = Image.new('RGB', (4 * 395, 844), '#111')
for k, t in enumerate(tiles): sh.paste(t, (k * 395, 0))
sh.save(out)
