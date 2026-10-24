// Кучка монет на весь экран 390×844 (в 2× разрешении — 780×1688): черновик
// раскладки шкурки алчности, docs/plan/27-greed-skin.md, шаг 3.
//     NODE_PATH=/opt/node22/lib/node_modules node tools/coin-pile.js /tmp/pile-
// Пишет <префикс>gold.png, <префикс>euro.png, <префикс>mix.png.
const { chromium } = require('playwright');
const path = require('path');
const pre = process.argv[2] || '/tmp/pile-';

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto('file://' + path.resolve(__dirname, 'coin-bake.html'));
    const urls = await p.evaluate(() => {
        const D = Math.PI / 180, N = 64, RAD = 29, SC = 2;
        // Позы: плашмя (4 поворота) и наклоны 14/26/36° по 8 сторонам.
        // Рандомный поворот вокруг своей оси даёт каждой монете свою цифру и свой блик.
        const poses = [];
        for (let r = 0; r < 4; r++) poses.push([0, 0, r * 90]);
        [14, 26, 36].forEach(m => { for (let a = 0; a < 8; a++) for (let r = 0; r < 2; r++) poses.push([m, a * 45, (a * 37 + r * 180 + m * 5) % 360]); });
        const sprites = {};
        ['gold', 'euro'].forEach(kind => {
            sprites[kind] = poses.map(p => {
                const res = COIN.render(kind, p[0] * D, p[1] * D, p[2] * D, N, RAD, 2);
                const c = document.createElement('canvas'); c.width = c.height = N;
                c.getContext('2d').putImageData(res.base, 0, 0);
                return c;
            });
        });
        let seed = 4242;
        const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const W = 390 * SC, H = 844 * SC;
        function pile(mode) {
            seed = 4242;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d');
            g.fillStyle = PALETTE.greedCoin.gold.deep; g.fillRect(0, 0, W, H);
            const pick = () => mode === 'mix' ? (rng() < 0.5 ? 'gold' : 'euro') : mode;
            // слой: точки с минимальным расстоянием, скале s, затемнение dark
            function layer(s, gap, dark, tries) {
                const pts = [], cell = 40 * s, gw = Math.ceil(W / cell), grid = {};
                const minD = 2 * RAD * s * gap;
                for (let t = 0; t < tries; t++) {
                    const x = rng() * (W + 40) - 20, y = rng() * (H + 40) - 20;
                    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
                    let ok = true;
                    for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2 && ok; j++) {
                        const q = grid[(gy + j) * 1000 + gx + i];
                        if (q) for (const o of q) if (Math.hypot(o[0] - x, o[1] - y) < minD) { ok = false; break; }
                    }
                    if (!ok) continue;
                    (grid[gy * 1000 + gx] = grid[gy * 1000 + gx] || []).push([x, y]);
                    pts.push([x, y]);
                }
                // верхние края рисуем раньше: нижние монеты чуть перекрывают верхние
                pts.sort((a, b) => a[1] - b[1]);
                pts.forEach(([x, y]) => {
                    const kind = pick(), sp = sprites[kind][Math.floor(rng() * poses.length)];
                    g.save();
                    g.shadowColor = 'rgba(20,10,0,0.55)'; g.shadowBlur = 6 * s; g.shadowOffsetY = 3 * s;
                    g.drawImage(sp, x - N / 2 * s, y - N / 2 * s, N * s, N * s);
                    g.restore();
                    if (dark > 0) { // глубокий слой темнее: тот же спрайт, затемнённый поверх по силуэту
                        const t = document.createElement('canvas'); t.width = t.height = N;
                        const tg = t.getContext('2d'); tg.drawImage(sp, 0, 0);
                        tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = 'rgba(40,20,0,' + dark + ')'; tg.fillRect(0, 0, N, N);
                        g.drawImage(t, x - N / 2 * s, y - N / 2 * s, N * s, N * s);
                    }
                });
            }
            layer(0.82, 0.8, 0.5, 30000);   // глубокий слой: мельче и темнее
            layer(1.0, 0.72, 0.18, 30000);  // средний
            layer(1.0, 0.95, 0, 30000);     // верхний: реже, чистый
            return cv.toDataURL('image/png');
        }
        return ['gold', 'euro', 'mix'].map(pile);
    });
    ['gold', 'euro', 'mix'].forEach((k, i) => require('fs').writeFileSync(pre + k + '.png', Buffer.from(urls[i].split(',')[1], 'base64')));
    console.log(pre + '{gold,euro,mix}.png');
    await b.close();
})();
