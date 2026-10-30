const { chromium } = require('playwright');
const fs = require('fs');

// Пробная плашка чеканкой (chase.py) шейдером прибора аппарата
// (greed-junk-lit-device.js) под наклонами телефона. Карта света пока
// версии 1 — у версии 2 своя будет на шаге света.
//   python3 chase.py out/ && NODE_PATH=... node chase-shot.js out/ /tmp/ch-
const dir = process.argv[2], out = process.argv[3] || '/tmp/ch-';
const BOX = { x: 90, y: 495, w: 180, h: 145 };
const TILTS = [['rest', 0, 0], ['left', -0.7, 0], ['right', 0.7, 0], ['near', 0, -0.7], ['far', 0, 0.7], ['corner', 0.5, 0.5]];

(async () => {
    const browser = await chromium.launch({ executablePath: require('../chrome-path') });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.log('ERR', e.message));
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`);
    await page.waitForTimeout(2500);
    await page.evaluate(() => { GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
    await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 25000 }).catch(() => {});
    const maps = ['albedo', 'height', 'mat'].map(p => 'data:image/svg+xml;base64,' + fs.readFileSync(`${dir}chase-${p}.svg`).toString('base64'));
    await page.evaluate(async ([maps, B]) => {
        const L = GreedJunkLit, S = L.SCALE;
        const imgs = await Promise.all(maps.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; })));
        const cv = document.createElement('canvas'); cv.width = B.w * S; cv.height = B.h * S;
        cv.style.cssText = `position:fixed;left:0;top:0;width:${B.w * 2}px;height:${B.h * 2}px;z-index:99999;background:#000`;
        document.body.appendChild(cv);
        const Q = L.deviceGL(cv); L.deviceKey(Q, B);
        const set = L.deviceSet(Q, imgs);
        window.__chase = (x, y) => { L.deviceBegin(Q, L.lightFor({ x, y })); L.deviceDraw(Q, B, set, B.x + B.w / 2, B.y + B.h / 2, B.w / 2, B.h / 2); };
    }, [maps, BOX]);
    for (const [n, x, y] of TILTS) {
        await page.evaluate(([x, y]) => window.__chase(x, y), [x, y]);
        await page.waitForTimeout(100);
        await page.screenshot({ path: `${out}${n}.png`, clip: { x: 0, y: 0, width: BOX.w * 2, height: BOX.h * 2 } });
    }
    await browser.close();
})();
