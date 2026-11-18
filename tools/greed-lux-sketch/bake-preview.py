# Эскиз версии 2 → картинки для просмотра на телефоне (🐞 → «Аппарат» →
# «Эскиз v2», greed-lux-preview.js). Что от наклона не зависит, запекается
# здесь, чтобы телефону оставить только отражения: ореол свечения (в emit),
# тень от главного света и затенение впадин (в shade). Значков колеса на
# картах нет — их рисует просмотр живыми (экранчики с эффектами).
#   MS=2 ICONS_OFF=1 LIVE=1 python3 machine.py out/ && node bake-svg.js out/*.svg
#   (LIVE=1 — для игры: экран, шар рычага и лампа — живыми слоями, greed-lux-play.js)
#   python3 bake-preview.py out/ ../../src/minigames/greed/lux/
import sys, json, shutil
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, shift
src, dst = sys.argv[1], sys.argv[2]
emit = np.asarray(Image.open(src + 'mach-emit.png').convert('RGB'), np.float32) / 255
hp = np.asarray(Image.open(src + 'mach-height.png').convert('RGB'), np.float32)
h = (hp[..., 0] * 256 + hp[..., 1]) / 65535 * 64
S = emit.shape[1] / 360
# ореол: три размера, как в machine-shot.js
bloom = sum(gaussian_filter(emit, (r * S / 3, r * S / 3, 0)) * w for r, w in ((5, 0.5), (13, 0.32), (28, 0.18)))
e = np.clip(emit * 1.15 + bloom * 0.6, 0, 1)
Image.fromarray((e * 255).astype(np.uint8)).save(dst + 'emit.png', optimize=True)
# тень главного света (сверху-слева) по рельефу + затенение впадин;
# S — текселей на единицу
def shade_of(h, S):
    occ = np.zeros_like(h)
    d = np.array([-0.42, -0.5]); d /= np.linalg.norm(d)
    for i in range(1, 13):
        t = i * 3.0 * S / 3
        hs = shift(h, (-d[1] * t, -d[0] * t), order=1, mode='nearest')
        occ = np.maximum(occ, np.clip((hs - h - t / S * 0.75) * 0.5, 0, 1))
    ha = gaussian_filter(h, 9 * S / 3 / 1.5)
    ao = np.clip(1 - np.maximum(0, ha - h) * 0.22, 0.35, 1)
    return np.clip((1 - 0.55 * occ) * ao, 0, 1)
shade = shade_of(h, S)
Image.fromarray((shade * 255).astype(np.uint8)).save(dst + 'shade.png', optimize=True)
for f in ('albedo', 'mat'):
    Image.open(src + f'mach-{f}.png').convert('RGB').save(dst + f + '.png', optimize=True)
shutil.copy(src + 'mach-height.png', dst + 'height.png')
meta = {'icons': json.load(open(src + 'mach-icons.json')), 'sprites': json.load(open(src + 'mach-sprites.json')),
        'size': [emit.shape[1], emit.shape[0]]}
# LIVE=1 (для игры): шар рычага — своими картами, тени и затенения у него
# нет (он двигается — тень рисует игра), свечения тоже
import os
if os.path.exists(src + 'mach-live.json'):
    meta['live'] = json.load(open(src + 'mach-live.json'))
    # спрайты: шар рычага, диск колеса, указатель. Свечение диска (экраны
    # секторов) — с ореолом, как у корпуса, но в своём квадрате
    # Поле пачинко (pach) — плотнее корпуса и непрозрачное: свечение,
    # тень и затенение впадин — как у корпуса, по своему рельефу и в своём
    # масштабе (PS текселей на единицу)
    if 'pach' in meta['live']:
        PSc = meta['live']['pachS']
        pe = np.asarray(Image.open(src + 'pach-emit.png').convert('RGB'), np.float32) / 255
        pb = sum(gaussian_filter(pe, (r * PSc / 3, r * PSc / 3, 0)) * w for r, w in ((5, 0.5), (13, 0.32), (28, 0.18)))
        Image.fromarray((np.clip(pe * 1.15 + pb * 0.6, 0, 1) * 255).astype(np.uint8)).save(dst + 'pach-emit.png', optimize=True)
        php = np.asarray(Image.open(src + 'pach-height.png').convert('RGB'), np.float32)
        Image.fromarray((shade_of((php[..., 0] * 256 + php[..., 1]) / 65535 * 64, PSc) * 255).astype(np.uint8)).save(dst + 'pach-shade.png', optimize=True)
        for f in ('albedo', 'mat'):
            Image.open(src + f'pach-{f}.png').convert('RGBA').save(dst + f'pach-{f}.png', optimize=True)
        shutil.copy(src + 'pach-height.png', dst + 'pach-height.png')
    for part in ('ball', 'disc', 'ptr', 'plunger', 'pball', 'liquid'):
        for f in ('albedo', 'mat'):
            Image.open(src + f'{part}-{f}.png').convert('RGBA').save(dst + f'{part}-{f}.png', optimize=True)
        pe = np.asarray(Image.open(src + f'{part}-emit.png').convert('RGB'), np.float32) / 255
        pb = sum(gaussian_filter(pe, (r * S / 3, r * S / 3, 0)) * w for r, w in ((5, 0.5), (13, 0.32)))
        Image.fromarray((np.clip(pe * 1.15 + pb * 0.4, 0, 1) * 255).astype(np.uint8)).save(dst + f'{part}-emit.png', optimize=True)
        shutil.copy(src + f'{part}-height.png', dst + f'{part}-height.png')
        a = Image.open(src + f'{part}-albedo.png')
        Image.new('L', a.size, 255).save(dst + f'{part}-shade.png', optimize=True)
json.dump(meta, open(dst + 'lux.json', 'w'))
print('ok', emit.shape)
