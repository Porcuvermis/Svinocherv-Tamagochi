// Монета плашмя в высоком разрешении — для крупного плана поворота
// (greed-coins-flip.js). Две клетки 256×256 рядом: gold, euro.
//     NODE_PATH=/opt/node22/lib/node_modules node tools/coin-flat.js
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
        const N = 256, RAD = 116, mk = () => { const c = document.createElement('canvas'); c.width = 2 * N; c.height = N; return c; };
        const a = mk(), n = mk();
        ['gold', 'euro'].forEach((kind, i) => {
            const r = COIN.render(kind, 0, 0, 0, N, RAD, 2);
            a.getContext('2d').putImageData(r.albedo, i * N, 0); n.getContext('2d').putImageData(r.normal, i * N, 0);
        });
        return [a.toDataURL('image/png'), n.toDataURL('image/png')];
    });
    ['albedo', 'normal'].forEach((k, i) => fs.writeFileSync(path.join(outDir, 'coin-flat-' + k + '.png'), Buffer.from(res[i].split(',')[1], 'base64')));
    await b.close();
})();
