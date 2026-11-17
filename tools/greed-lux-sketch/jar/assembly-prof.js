const { chromium } = require('playwright');
// Цена кадра сборки колеса при процессоре ×4 медленнее (как телефон):
// кадр сборки (frame) + кадр банки (step) — то, что работает во время сборки.
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 4);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 0; u.greed_pachinko = 0; GameState.data.greed.jar = { wheel: 5, pachinko: 0, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const A = GreedAssembly, f = A.frame, S = GreedJarShop, st = S.step; window.__t = [];
    A.frame = function (now) { const t0 = performance.now(); f.call(this, now); window.__t.push(['a', performance.now() - t0]); };
    S.step = function (now, c) { const t0 = performance.now(); st.call(this, now, c); if (A.fly) window.__t.push(['j', performance.now() - t0]); };
    S.state = 'open'; S.t0 = performance.now() - 3000; S.cv.style.pointerEvents = 'auto'; S.dirty = true; S.hold = { node: 'wheel', dt: 320 }; S.deposit(); });
  await page.waitForFunction(() => GreedAssembly.parts && GreedAssembly.parts.length && GreedAssembly.t0, null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { window.__t = []; });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => { const g = (k) => window.__t.filter(x => x[0] === k).map(x => x[1]).sort((a, b) => a - b);
    const s = (a) => a.length ? `${a.length} кадров, средний ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} мс, 95% ${a[Math.floor(a.length * 0.95)].toFixed(1)} мс` : 'нет'; return 'сборка: ' + s(g('a')) + ' | банка: ' + s(g('j')); });
  console.log(r);
  await b.close();
})();
