const { chromium } = require('playwright');
// Кадры сборки колеса ровно по времени (свои часы, 30 к/с) — для видео без
// рывков записи. Сборка запускается как в игре; как только детали вырезаны,
// её собственные часы останавливаются и кадры рисуются вручную.
//   NODE_PATH=... node assembly-frames.js /tmp/af/
(async () => {
  const dir = process.argv[2] || '/tmp/af/';
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 4);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 0; u.greed_pachinko = 0; GameState.data.greed.jar = { wheel: 5, pachinko: 0, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); }); await page.waitForTimeout(2500);
  // магазин открыт сразу, банка опущена; последний жетон — в колесо
  await page.evaluate(() => { const S = GreedJarShop; S.state = 'open'; S.t0 = performance.now() - 3000; S.cv.style.pointerEvents = 'auto'; S.dirty = true;
    const cut = GreedAssembly.cut; GreedAssembly.cut = function (d) { const r = cut.call(this, d); this.stop = true; window.__cut = true; const B = this.base, F = this.fly; window.__bf = [B, F]; B.remove = F.remove = () => {}; const J = GreedJarShop; J.low = { from: J.LOW, to: J.LOW, t0: 0, ms: 1 }; J.lowTo = () => new Promise(() => {}); return r; };
    S.hold = { node: 'wheel', dt: 320 }; S.deposit(); });
  await page.waitForFunction(() => window.__cut, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const n = +(process.env.N || 165);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => { const A = GreedAssembly; [A.base, A.fly] = window.__bf; A.base.style.opacity = A.fly.style.opacity = 1; A.frame(A.t0 + t * 1000); GreedJarShop.dirty = true; GreedJarShop.step(performance.now(), 200); }, i / 30);
    await page.screenshot({ path: `${dir}a${String(i).padStart(3, '0')}.png` });
  }
  await b.close();
})();
