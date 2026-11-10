# Кадры аппарата (machine-shot.js) → в настоящую рамку игры (frame-cap.js):
# монеты рамки поверх, как на телефоне. GIF наклона + один кадр крупно.
#   python3 compose.py <кадры-префикс> out/frame- <выход-префикс>
import sys, glob
import numpy as np
from PIL import Image
fr, fp, out = sys.argv[1], sys.argv[2], sys.argv[3]
a = np.asarray(Image.open(fp + 'a.png').convert('RGB'), np.float32)
b = np.asarray(Image.open(fp + 'b.png').convert('RGB'), np.float32)
# подложка была пурпурной и зелёной: где кадры совпали — монеты
t = np.clip(((a[..., 0] - b[..., 0]) + (b[..., 1] - a[..., 1])) / 510, 0, 1)[..., None]   # прозрачность рамки
al = 1 - t
coin = np.where(al > 0.02, (a - np.array([255, 0, 255], np.float32) * t) / np.maximum(al, 0.02), 0)
print('монеты закрывают', round(float(al.mean()) * 100), '% кадра')
MX, MY, MW, MH = 36, 160, 708, 1369           # аппарат на снимке 2x (из frame-cap)
ims = []
for f in sorted(glob.glob(fr + '*.png')):
    m = Image.open(f).convert('RGB').resize((MW, MH), Image.LANCZOS)
    base = np.zeros_like(a); base[...] = (20, 14, 10)
    base[MY:MY + MH, MX:MX + MW] = np.asarray(m, np.float32)
    ims.append(Image.fromarray(np.clip(coin * al + base * (1 - al), 0, 255).astype(np.uint8)))
ims[0].save(out + 'still.png')
small = [im.resize((390, 844), Image.LANCZOS) for im in ims]
small[0].save(out + 'tilt.gif', save_all=True, append_images=small[1:], duration=90, loop=0)
print(len(ims), 'кадров')
