// Снимки рекламного листа со стенда tools/mag-ad.html.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/shot-mag-ad.js <шаг> <папка>
// Отдаёт два файла: лист целиком (×3, как экран телефона) и лупу —
// окно шага крупно (×6), где видно, ровно ли сошлись линии.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const step = process.argv[2] || 'frames';
    const out = process.argv[3] || '/tmp';
    const zoom = { tail: [12, 12, 306, 180], cloth: [12, 202, 148, 228], soap: [170, 202, 148, 228], frames: [0, 0, 165, 221] }[step];
    const browser = await chromium.launch();
    for (const [scale, name, clip] of [[3, 'page', null], [6, 'zoom', zoom]]) {
        if (!clip && name === 'zoom') continue;
        const page = await browser.newPage({ viewport: { width: 330, height: 442 }, deviceScaleFactor: scale });
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        await page.goto('http://localhost:8777/tools/mag-ad.html?step=' + step);
        await page.waitForFunction(() => document.title === 'ready');
        if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
        const file = path.join(out, `ad-${step}-${name}.png`);
        await page.screenshot({ path: file, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
        console.log(file);
        await page.close();
    }
    await browser.close();
})();
