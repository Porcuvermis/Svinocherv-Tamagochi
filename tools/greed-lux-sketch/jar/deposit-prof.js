const { chromium } = require('playwright');
// Последний жетон в копилку → сборка: где стоит главный поток. Процессор ×N
// (SLOW, по умолчанию 4 — как телефон). Печатает долгие задачи от вкидывания
// до полёта досок, промежутки между кадрами банки, этапы сборки по времени
// и сколько холстов и пикселей на них живёт (память).
//   GAME=wheel|pachinko SLOW=4 NODE_PATH=... node deposit-prof.js
(async () => {
  const GAME = process.env.GAME || 'wheel', SLOW = +(process.env.SLOW || 4);
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0');
    // счёт контекстов WebGL: сколько создано и сколько потеряно (loseContext)
    window.__gl = { made: 0, lost: 0 };
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { const had = this.__ctx; const c = gc.call(this, t, o);
      if (/webgl/.test(t) && c && !had) { window.__gl.made++; this.__ctx = 1;
        const ext = c.getExtension('WEBGL_lose_context'); if (ext) { const l = ext.loseContext.bind(ext); ext.loseContext = () => { window.__gl.lost++; l(); }; } }
      return c; };
    // текстуры: сколько пикселей выдано видеокарте (texImage2D), сколько удалено
    const P = WebGLRenderingContext.prototype, ti = P.texImage2D, dt = P.deleteTexture;
    window.__tex = { px: 0 };
    P.texImage2D = function () { const a = arguments; let w = 0, h = 0;
      if (a.length >= 9) { w = a[3]; h = a[4]; } else { const s = a[5]; w = s.width || s.videoWidth || 0; h = s.height || s.videoHeight || 0; }
      window.__tex.px += w * h; return ti.apply(this, a); };
  });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate((GAME) => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 4);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = GAME === 'pachinko' ? 1 : 0; u.greed_pachinko = 0;
    GameState.data.greed.jar = { wheel: GAME === 'pachinko' ? 6 : 5, pachinko: 5, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); }, GAME);
  await page.waitForFunction(() => typeof GreedJunkLit !== 'undefined' && GreedJunkLit.lever, null, { timeout: 60000, polling: 300 });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
  await page.waitForTimeout(500);
  // PREP=1 — как в игре: магазин открыт, заготовка успела до последнего жетона
  if (process.env.PREP) {
    const ms = await page.evaluate(async (GAME) => { const t0 = performance.now(); await GreedJunkLit.growPrep(GAME); return Math.round(performance.now() - t0); }, GAME);
    console.log('заготовка заранее: ' + ms + ' мс');
  }
  if (process.env.FN) await page.evaluate(() => { window.__fnOn = true; });
  // PROF=1 — профиль процессора на время покупки: собственное время по функциям
  // TRACE=1 — трасса браузера: самые долгие события главного потока
  const events = [];
  if (process.env.TRACE) {
    cdp.on('Tracing.dataCollected', d => events.push(...d.value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,blink,gpu,cc', transferMode: 'ReportEvents' });
  }
  if (process.env.PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  await page.evaluate((GAME) => {
    const A = GreedAssembly, S = GreedJarShop, t0 = performance.now(), M = window.__m = { long: [], frames: [], marks: [] };
    const mark = (m) => M.marks.push([Math.round(performance.now() - t0), m]);
    new PerformanceObserver(l => l.getEntries().forEach(e => M.long.push([Math.round(e.startTime - t0), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] });
    const loop = () => { M.frames.push(performance.now() - t0); if (!M.stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    const wrap = (o, k, name) => { const f = o[k]; o[k] = function () { mark(name + ' →'); const r = f.apply(this, arguments);
      if (r && r.then) return r.then(v => { mark(name + ' ✓'); return v; }); mark(name + ' ✓'); return r; }; };
    wrap(A, 'snapshot', 'стоп-кадр'); wrap(GreedDebug, 'rebuild', 'пересборка'); wrap(A, GAME === 'wheel' ? 'discSets' : 'pachSets', 'виды');
    wrap(A, GAME === 'wheel' ? 'cut' : 'cutPach', 'вырезка'); wrap(A, 'loop', 'полёт');
    // FN=1 — синхронные вызовы дольше 30 мс по функциям аппарата и сборки
    if (window.__fnOn) {
      M.fn = [];
      const spy = (o, name) => Object.keys(o).forEach(k => { const f = o[k]; if (typeof f !== 'function' || (/^(frame|loop|run)$/.test(k)) || (k === 'step' && o !== GreedJarShop)) return;
        o[k] = function () { const a = performance.now(), r = f.apply(this, arguments), d = performance.now() - a; if (d > 30) M.fn.push([Math.round(a - t0), Math.round(d), name + '.' + k]); return r; }; });
      spy(GreedJunkLit, 'L'); spy(A, 'A'); spy(GreedJarShop, 'S'); spy(GreedJar3, 'J'); if (window.GreedJunk) spy(GreedJunk, 'G');
    }
    S.state = 'open'; S.t0 = performance.now() - 3000; S.cv.style.pointerEvents = 'auto'; S.dirty = true; S.hold = { node: GAME, dt: 320 };
    window.__gl0 = Object.assign({}, window.__gl); window.__tex0 = window.__tex.px;
    console.timeStamp('вкинут'); mark('вкинут'); S.deposit();
  }, GAME);
  await page.waitForFunction(() => GreedAssembly.t0 && performance.now() - GreedAssembly.t0 > 1500, null, { timeout: 120000, polling: 200 });
  if (process.env.TRACE) {
    const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end'); await done;
    const main = events.filter(e => e.ph === 'X' && e.dur > 40000);
    const agg = {}; main.forEach(e => { const k = e.name + (e.args && e.args.data && e.args.data.url ? ' ' + e.args.data.url.split('/').pop() : ''); agg[k] = agg[k] || { n: 0, ms: 0, max: 0 }; agg[k].n++; agg[k].ms += e.dur / 1000; agg[k].max = Math.max(agg[k].max, e.dur / 1000); });
    const ts0 = (events.find(e => e.name === 'TimeStamp' && e.args && e.args.data && e.args.data.message === 'вкинут') || {}).ts;
    if (ts0 && process.env.WIN) {
      const [a, b] = process.env.WIN.split(',').map(Number);
      console.log(`события в окне ${a}–${b} мс (начало, длина, имя):`);
      events.filter(e => e.ph === 'X' && e.dur > 20000 && (e.ts - ts0) / 1000 >= a && (e.ts - ts0) / 1000 <= b)
        .sort((x, y) => x.ts - y.ts).slice(0, 60).forEach(e => console.log('  ' + Math.round((e.ts - ts0) / 1000) + '  ' + Math.round(e.dur / 1000) + '  ' + e.name + (e.args && e.args.data && e.args.data.functionName ? ' ' + e.args.data.functionName : '') + ' tid' + e.tid));
    }
    console.log('события > 40 мс (сумма, число, наибольшее):');
    Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 25).forEach(([k, v]) => console.log('  ' + String(Math.round(v.ms)).padStart(6) + '  ×' + v.n + '  max ' + Math.round(v.max) + '  ' + k));
  }
  if (process.env.PROF) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = {}, byId = {}; profile.nodes.forEach(n => { byId[n.id] = n; });
    const dt = profile.timeDeltas; let i = 0;
    profile.samples.forEach((id, k) => { const n = byId[id], f = n.callFrame, key = (f.functionName || '(анон)') + ' ' + (f.url || '').split('/').pop() + ':' + f.lineNumber; self[key] = (self[key] || 0) + (dt[k] || 0) / 1000; });
    console.log('собственное время, мс:'); Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log('  ' + String(Math.round(v)).padStart(6) + '  ' + k));
  }
  const R = await page.evaluate(() => { const M = window.__m; M.stop = true;
    const gaps = []; for (let i = 1; i < M.frames.length; i++) { const g = M.frames[i] - M.frames[i - 1]; if (g > 50) gaps.push([Math.round(M.frames[i - 1]), Math.round(g)]); }
    const cvs = [...document.querySelectorAll('canvas')]; const px = cvs.reduce((s, c) => s + c.width * c.height, 0);
    return { fn: M.fn, gl0: window.__gl0, gl: window.__gl, tex: Math.round((window.__tex.px - window.__tex0) / 1e6), marks: M.marks, long: M.long, gaps, canvases: cvs.length, mpx: (px / 1e6).toFixed(1), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }; });
  if (R.fn) { console.log('вызовы > 30 мс (начало, длина, кто):'); R.fn.forEach(x => console.log('  ' + x.join('  '))); }
  console.log('этапы (мс от вкидывания):'); R.marks.forEach(m => console.log('  ' + String(m[0]).padStart(6) + '  ' + m[1]));
  console.log('долгие задачи (начало, длина):', R.long.map(x => x.join('+')).join('  '));
  console.log('кадров нет дольше 50 мс (начало, промежуток):', R.gaps.map(x => x.join('+')).join('  '));
  console.log(`контекстов WebGL: до покупки создано ${R.gl0.made}, потеряно ${R.gl0.lost}; после — создано ${R.gl.made}, потеряно ${R.gl.lost}; текстур за покупку выдано ${R.tex} млн пикселей (×4 байта)`);
  console.log(`холстов ${R.canvases}, пикселей на них ${R.mpx} млн, куча JS ${R.heap} МБ`);
  await b.close();
})();
