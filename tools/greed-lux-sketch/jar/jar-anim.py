# Сборка анимации банки-магазина: кадр игры без банки → затемнение
# аппарата (пока банка в полёте и в упор) → банка (jar-anim-shot.js) →
# рамка из монет ПОВЕРХ всего (она всегда спереди) → след пальца на тапах.
#   python3 jar-anim.py <кадры-банки-префикс> <игра-без-банки-2x.png> ../out/frame- <выход-префикс>
import sys, glob, json
import numpy as np
from PIL import Image, ImageDraw
pre, game, fp, out = sys.argv[1:5]
FPS = 15
EV = {'tap': 0.6, 'hop': 0.8, 'fly': 1.95, 'taps': [2.5, 3.0, 3.5], 'hold': [4.2, 6.0], 'out': 6.6, 'back': 7.75}
a = np.asarray(Image.open(fp + 'a.png').convert('RGB'), np.float32)
b = np.asarray(Image.open(fp + 'b.png').convert('RGB'), np.float32)
t_ = np.clip(((a[..., 0] - b[..., 0]) + (b[..., 1] - a[..., 1])) / 510, 0, 1)[..., None]
al = 1 - t_
coin = np.where(al > 0.02, (a - np.array([255, 0, 255], np.float32) * t_) / np.maximum(al, 0.02), 0)
G = np.asarray(Image.open(game).convert('RGB'), np.float32)
def dim(t):
    if t < EV['hop']: return 0
    if t < EV['fly']: return 0.72 * (t - EV['hop']) / (EV['fly'] - EV['hop'])
    if t < EV['out']: return 0.72
    if t < EV['back']: return 0.72 * (1 - (t - EV['out']) / (EV['back'] - EV['out']))
    return 0
# где палец: тап по банке, тапы по колесу, удержание пачинко, тап вне скотча
def finger(t):
    if EV['tap'] - 0.05 <= t < EV['tap'] + 0.2: return (313, 690)
    for tt in EV['taps']:
        if tt - 0.05 <= t < tt + 0.15: return (90, 395)
    if EV['hold'][0] <= t < EV['hold'][1]: return (292, 395)
    if EV['out'] - 0.05 <= t < EV['out'] + 0.2: return (195, 130)
    return None
frames = []
for i, f in enumerate(sorted(glob.glob(pre + '*.png'))):
    t = i / FPS
    J = np.asarray(Image.open(f).convert('RGBA'), np.float32)
    ja = J[..., 3:4] / 255
    base = G * (1 - dim(t))
    img = base * (1 - ja) + J[..., :3] * ja
    img = coin * al + img * (1 - al)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((390, 844), Image.LANCZOS)
    p = finger(t)
    if p:
        d = ImageDraw.Draw(im, 'RGBA')
        d.ellipse([p[0] - 22, p[1] - 22, p[0] + 22, p[1] + 22], outline=(255, 255, 255, 220), width=3)
        d.ellipse([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9], fill=(255, 255, 255, 120))
    frames.append(im)
import os, subprocess
os.makedirs(out + 'mp4', exist_ok=True)
for k, im in enumerate(frames): im.save(f'{out}mp4/{k:03d}.png')
# видео вместо GIF: GIF такой длины весит ~15 МБ
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{out}mp4/%03d.png', '-vf', 'scale=780:1688:flags=lanczos',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out + 'jar-shop.mp4'], check=True)
for k, ft in enumerate([0.3, 1.3, 2.3, 3.05, 5.2, 7.2]):
    frames[min(len(frames) - 1, int(ft * FPS))].save(f'{out}js-{k}.png')
print(len(frames), 'кадров')
