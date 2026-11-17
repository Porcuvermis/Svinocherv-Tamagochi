const { chromium } = require('playwright');
// Банка-магазин: подмена скотча на обороте и цена кадра полёта.
// Процессор замедлен вчетверо (как телефон). Печатает: на каком угле
// поворота скотч сменился, худший и средний кадр отрисовки банки.
//   NODE_PATH=... node jar-prof.js
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.SLOW || 4) });
  const r = await page.evaluate(async () => {
    const S = GreedJarShop, st = S.step, times = [], swaps = [];
    let last = null;
    S.step = function (now, coins) { const t0 = performance.now(); st.call(this, now, coins);
      if (this.state !== 'rest') times.push(performance.now() - t0);
      const P = this.pose_; if (P && last !== null && last !== P.shop) swaps.push({ yaw: Math.round(P.yaw), k: Math.round(P.k), shop: P.shop }); if (P) last = P.shop; };
    S.state = 'opening'; S.t0 = performance.now(); S.dirty = true; S.cv.style.pointerEvents = 'auto';
    await new Promise(r => setTimeout(r, 2200));
    S.close();
    await new Promise(r => setTimeout(r, 1800));
    times.sort((a, b) => a - b);
    return { n: times.length, mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], swaps };
  });
  console.log('кадров', r.n, 'средний', r.mean.toFixed(1), 'мс, 95%', r.p95.toFixed(1), 'мс, худший', r.max.toFixed(1), 'мс');
  console.log('подмена скотча:', JSON.stringify(r.swaps));
  await b.close();
})();
