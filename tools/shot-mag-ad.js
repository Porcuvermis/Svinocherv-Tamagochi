// Снимки рекламного листа со стенда tools/mag-ad.html.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/shot-mag-ad.js <вариант a|b|c> <папка> [buy|poor|max] [окно]
// Отдаёт два файла: лист целиком (×3, как экран телефона) и лупу —
// окно крупно (×6, по умолчанию мыло), где видно, ровно ли сошлись линии.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const v = process.argv[2] || 'a';
    const out = process.argv[3] || '/tmp';
    const state = process.argv[4] || 'buy';
    const win = process.argv[5] || 'soap';
    const zoom = { tail: [12, 12, 306, 180], cloth: [12, 202, 148, 228], soap: [170, 202, 148, 228] }[win];
    const browser = await chromium.launch();
    for (const [scale, name, clip] of [[3, 'page', null], [6, 'zoom', zoom]]) {
        const page = await browser.newPage({ viewport: { width: 330, height: 442 }, deviceScaleFactor: scale });
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(`http://localhost:8777/tools/mag-ad.html?var=${v}&state=${state}`);
        await page.waitForFunction(() => document.title === 'ready');
        if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
        const file = path.join(out, `ad-${v}-${state}-${name === 'zoom' ? win : 'page'}.png`);
        await page.screenshot({ path: file, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
        console.log(file);
        await page.close();
    }
    await browser.close();
})();
