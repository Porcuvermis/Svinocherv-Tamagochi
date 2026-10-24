// Печёт атласы монет для игры: src/minigames/greed/coins-albedo.png (цвет без
// света) и coins-normal.png (нормаль в виде, xyz → rgb).
// Позы и раскладка клеток — из GreedCoins (greed-coins.js), чтобы игра и
// запекатель не разошлись.
//     NODE_PATH=/opt/node22/lib/node_modules node tools/coin-atlas.js
// затем без потерь пережать: python3 tools/png-squeeze.py src/minigames/greed/*.png
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const outDir = path.resolve(__dirname, '../src/minigames/greed');

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto('file://' + path.resolve(__dirname, 'coin-bake.html'));
    const res = await p.evaluate(() => {
        const G = GreedCoins, D = Math.PI / 180, N = G.CELL, poses = G.poses();
        const cells = G.KINDS.length * poses.length, rows = Math.ceil(cells / G.COLS);
        const mk = () => { const c = document.createElement('canvas'); c.width = G.COLS * N; c.height = rows * N; return c; };
        const base = mk(), shine = mk(), bg = base.getContext('2d'), sg = shine.getContext('2d');
        // base ← albedo, shine ← normal (имена холстов остались от первой версии)
        G.KINDS.forEach(kind => poses.forEach((p, i) => {
            const r = COIN.render(kind, p.m * D, p.az * D, p.roll * D, N, G.RAD, 2), { sx, sy } = G.cell(kind, i);
            bg.putImageData(r.albedo, sx, sy); sg.putImageData(r.normal, sx, sy);
        }));
        return [base.toDataURL('image/png'), shine.toDataURL('image/png'), poses.length];
    });
    ['albedo', 'normal'].forEach((k, i) => fs.writeFileSync(path.join(outDir, 'coins-' + k + '.png'), Buffer.from(res[i].split(',')[1], 'base64')));
    console.log('поз:', res[2]);
    await b.close();
})();
