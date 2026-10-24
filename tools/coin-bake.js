// Запекание монеты алчности. Лист для глаз:
//     NODE_PATH=/opt/node22/lib/node_modules node tools/coin-bake.js /tmp/coin-lab.png
// Ряды: gold база / gold блик / euro база / euro блик. Первая клетка каждого
// ряда — для сравнения круг радиуса 12 (самый крупный пузырь пены похоти).
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/coin-lab.png';

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto('file://' + path.resolve(__dirname, 'coin-bake.html'));
    const url = await p.evaluate(() => {
        const D = Math.PI / 180;
        const poses = [[0, 0, 0], [22, 0, 0], [22, 45, 40], [22, 90, 80], [22, 135, 120], [22, 180, 160], [22, 225, 200],
                       [22, 270, 240], [22, 315, 280], [38, 20, 0], [38, 150, 90], [38, 260, 200]];
        const N = 64, RAD = 29, SC = 2, rows = ['gold', 'euro'];
        const cv = document.getElementById('c');
        cv.width = (poses.length + 1) * N * SC; cv.height = rows.length * 2 * N * SC;
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        g.fillStyle = '#3a2a26'; g.fillRect(0, 0, cv.width, cv.height);
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = N;
        const tg = tmp.getContext('2d');
        rows.forEach((kind, r) => {
            for (let s = 0; s < 2; s++) {
                const y0 = (r * 2 + s) * N * SC;
                // эталон: пузырь пены, радиус 12 игровых единиц = 24 px при 2×
                g.fillStyle = PALETTE.bathScene.foam[500]; g.beginPath();
                g.arc(N * SC / 2, y0 + N * SC / 2, 12 * 2 * SC, 0, 7); g.fill();
            }
            poses.forEach((p, i) => {
                const res = COIN.render(kind, p[0] * D, p[1] * D, p[2] * D, N, RAD, 2);
                // ряд 1 — база; ряд 2 — база + блик «монета поймала луч» (режим lighter)
                tg.clearRect(0, 0, N, N); tg.putImageData(res.base, 0, 0);
                g.drawImage(tmp, (i + 1) * N * SC, r * 2 * N * SC, N * SC, N * SC);
                g.drawImage(tmp, (i + 1) * N * SC, (r * 2 + 1) * N * SC, N * SC, N * SC);
                const sh = document.createElement('canvas'); sh.width = sh.height = N;
                const sg = sh.getContext('2d'); sg.putImageData(res.shine, 0, 0);
                sg.globalCompositeOperation = 'destination-in'; sg.drawImage(tmp, 0, 0);
                g.save(); g.globalCompositeOperation = 'lighter';
                g.drawImage(sh, (i + 1) * N * SC, (r * 2 + 1) * N * SC, N * SC, N * SC); g.restore();
            });
        });
        return cv.toDataURL('image/png');
    });
    require('fs').writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log(out);
    await b.close();
})();
