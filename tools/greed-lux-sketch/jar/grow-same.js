const { chromium } = require('playwright');
// Игра, вросшая в аппарат при покупке (greed-junk-lit-grow.js), — тот же
// аппарат, что собранный с нуля? Покупка в банке → снимок аппарата →
// пересборка с нуля (GreedDebug.rebuild) → снимок → разница по точкам.
// GAME=wheel|pachinko|both (both — колесо, потом пачинко).
//   NODE_PATH=... node grow-same.js /tmp/gs-
(async () => {
  const out = process.argv[2] || '/tmp/gs-', GAME = process.env.GAME || 'wheel';
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 12);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 0; u.greed_pachinko = 0; GameState.data.greed.jar = { wheel: 5, pachinko: 5, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => typeof GreedJunkLit !== 'undefined' && GreedJunkLit.lever, null, { timeout: 60000, polling: 300 });
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); }); await page.waitForTimeout(2500);
  const buy = async (node) => {
    await page.evaluate((node) => { const S = GreedJarShop; S.state = 'open'; S.t0 = performance.now() - 3000; S.cv.style.pointerEvents = 'auto'; S.dirty = true; S.hold = { node, dt: 200 }; S.deposit(); }, node);
    await page.waitForFunction(() => GreedJarShop.busy, null, { timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => !GreedJarShop.busy, null, { timeout: 90000, polling: 300 });
  };
  for (const g of GAME === 'both' ? ['wheel', 'pachinko'] : [GAME]) await buy(g);
  await page.waitForTimeout(800);
  // банку — из кадра, колесо — в покой на тот же угол
  const prep = () => page.evaluate(() => { GreedJarShop.cv.style.visibility = 'hidden'; const L = GreedJunkLit; if (L._wheel) { L._wheel.rot = 0; L._wheel.flap = 0; L._wheel.shown = null; } });
  const shot = async (n) => { await prep(); await page.waitForTimeout(600); const r = await page.evaluate(() => { const w = GreedJunkLit.wrapEl.getBoundingClientRect(); return { x: w.left, y: w.top, width: w.width, height: Math.min(w.height, 520) }; }); await page.screenshot({ path: out + n + '.png', clip: r }); };
  await shot('grown');
  const keys = await page.evaluate(() => GreedJunk.wheelNow && GreedJunk.wheelNow.slice());
  await page.evaluate(async () => { await GreedDebug.rebuild(); });
  await page.waitForFunction(() => GreedJunkLit.lever && (!GreedJunk.wheelShown() || GreedJunkLit._wgl), null, { timeout: 60000, polling: 300 });
  await page.waitForTimeout(1500);
  await shot('fresh');
  console.log('раскладка колеса после пересборки та же:', JSON.stringify(keys) === JSON.stringify(await page.evaluate(() => GreedJunk.wheelNow && GreedJunk.wheelNow.slice())));
  console.log(errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  await b.close();
})();
