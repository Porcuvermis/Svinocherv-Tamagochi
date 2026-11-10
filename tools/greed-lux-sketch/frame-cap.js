const { chromium } = require('playwright');
// Монетная рамка алчности с прозрачностью: аппарат подменяется сплошной
// заливкой двух цветов, и где кадр не изменился — монеты (непрозрачно).
// Нужна, чтобы показывать эскизы версии 2 так, как их увидит игрок.
//   NODE_PATH=... node frame-cap.js out/frame-
const out = process.argv[2] || '/tmp/frame-';
(async () => {
    const b = await chromium.launch({ executablePath: require('../chrome-path') });
    const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`);
    await page.waitForTimeout(2500);
    await page.evaluate(() => { GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
    await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 25000 }).catch(() => {});
    await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const e = GreedJunkLit.wrapEl.getBoundingClientRect(); return [e.left, e.top, e.width, e.height]; });
    console.log('machine', r.join(' '));
    for (const [n, c] of [['a', '#ff00ff'], ['b', '#00ff00']]) {
        await page.evaluate((c) => { const w = GreedJunkLit.wrapEl; [...w.children].forEach(ch => ch.style.visibility = 'hidden'); w.style.background = c;
            const s = document.getElementById('gj-stage') || w.parentElement; }, c);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}${n}.png` });
    }
    await b.close();
})();
