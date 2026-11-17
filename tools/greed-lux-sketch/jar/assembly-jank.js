const { chromium } = require('playwright');
// Рывки во время сборки колеса: промежутки между кадрами (rAF) и длинные
// задачи (>50 мс) с отметкой времени от начала сборки; кто их вызвал —
// по меткам вокруг подозреваемых функций аппарата. Процессор ×SLOW.
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
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.SLOW || 4) });
  await page.evaluate(() => {
    window.__ev = [];
    const mark = (obj, names) => names.forEach(n => { const f = obj[n]; if (typeof f !== 'function') return;
      obj[n] = function (...a) { const t0 = performance.now(), r = f.apply(this, a);
        const done = () => { const d = performance.now() - t0; if (d > 8) window.__ev.push([t0, n, d]); };
        if (r && r.then) r.then(done, done); else done(); return r; }; });
    // пересборка возвращает аппарату функции из снимка — метки ставятся и туда
    mark(GreedDebug.pristine, ['prepareLever', 'draw', 'wheelDraw', 'pachDraw', 'meterStep', 'jarStep', 'coinStep', 'trayStep', 'leverStep', 'glowStep', 'liveParts', 'normalsFor', 'wheelShadow', 'image', 'init', 'wheelSprites', 'pachMountLit', 'meterMount', 'trayMount', 'leverSprites', 'leverParts', 'drawLever', 'keyCanvas', 'keyBind', 'deviceSet', 'deviceSprite', 'program', 'texture', 'leverStillShadow']);
    mark(GreedJunkLit, ['prepareLever', 'draw', 'wheelDraw', 'pachDraw', 'meterStep', 'jarStep', 'coinStep', 'trayStep', 'leverStep', 'glowStep', 'liveParts', 'normalsFor', 'wheelShadow', 'image']);
    mark(GreedAssembly, ['frame', 'paintBase', 'cut', 'discSets', 'snapshot']);
    mark(GreedJarShop, ['step']);
    const gaps = window.__gaps = []; let last = performance.now();
    const loop = (t) => { gaps.push([last, t - last]); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__ev.push([e.startTime, 'LONGTASK', e.duration]))).observe({ entryTypes: ['longtask'] });
    const S = GreedJarShop; S.state = 'open'; S.t0 = performance.now() - 3000; S.cv.style.pointerEvents = 'auto'; S.dirty = true; S.hold = { node: 'wheel', dt: 320 }; S.deposit();
  });
  await page.waitForFunction(() => GreedAssembly.t0 && GreedAssembly.parts && GreedAssembly.parts.length, null, { timeout: 90000 });
  await page.waitForTimeout(+(process.env.MS || 6000));
  const r = await page.evaluate(() => {
    const T = GreedAssembly.t0;
    const g = window.__gaps.filter(([t]) => t > T - 500).map(([t, d]) => [Math.round(t - T), Math.round(d)]).filter(([, d]) => d > 45);
    const e = window.__ev.filter(([t]) => t > T - 500).map(([t, n, d]) => [Math.round(t - T), n, Math.round(d)]);
    return { gaps: g, ev: e.filter(x => x[2] > 15).slice(0, 60) };
  });
  console.log('рывки кадров (мс от начала полёта, длина):', JSON.stringify(r.gaps));
  console.log('долгие вызовы:', JSON.stringify(r.ev));
  await b.close();
})();
