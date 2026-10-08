// ================= ЗАМЕР КАДРОВ ВАННОЙ ПО ЭТАПАМ =================
// Один замер — одна строка JSON: кадров в секунду на одном этапе забега
// под замедлением процессора (по умолчанию 4×), плотность 2.
//
// Зачем отдельный замер, а не audit-frames.js: у ванной кадр зависит от
// ЭТАПА и от СТУПЕНЕЙ мыла и мочалки (волшебный флакон и облако живые,
// блеск пены растёт с ней), а техосмотр смотрит только на открытую ванную.
//
// Сцены — `этап-ступень` (ступень одна на мыло и мочалку; SOAP=… и
// CLOTH=… задают их порознь):
//   shelf-L   ванная открыта, вода не пущена (полка стоит)
//   float-L   мыло поднялось и парит
//   soap-L    трут мылом (палец 60 Гц туда-обратно по телу; первая секунда —
//             разогрев, мерится следующее окно)
//   cloth-L   трут мочалкой (то же)
//   pop-L     горка пены над хвостом, тап по ней в начале окна
//   wipe-L    «только помыть»: награда не готова, тап по пене на теле
//   finale-L  финал (debug «сразу в финал»)
//
// РАЗБРОС БОЛЬШОЙ (±4 кадра на одной сцене), поэтому «до/после» мерят
// ПОПЕРЕМЕННО и по нескольку раз: старое дерево отдают вторым сервером,
//   git archive HEAD | tar -x -C /tmp/base && (cd /tmp/base && python3 -m http.server 8778)
// и чередуют порты 8778 и 8777 в цикле.
//
// Переменные окружения:
//   SOAP, CLOTH   ступени по отдельности
//   EVAL          выражение в странице перед окном замера (разбор цены:
//                 'BATH_SOAP.frozen=true' — флакон стоит, и т. п.)
//   HIDE          css-селектор, который прячется перед окном
//   NOTRACE=1     без трассировки (кадры чище; с ней печатается разбор
//                 по статьям — Paint, Style, Layerize, JS)
//   PROFILE=1     профиль скрипта за окно: собственное и полное время
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//   NODE_PATH=/opt/node22/lib/node_modules node tools/bench-bath.js 8777 cloth-8
const { chromium } = require('playwright');
const [, , PORT = '8777', SCENE = 'shelf-0', SLOW_ = '4', MS_ = '2500'] = process.argv;
const SLOW = +SLOW_, MS = +MS_;
const [KIND, LV] = SCENE.split('-'), L = +LV;
const env = process.env;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForTimeout(2600);
  const wait = (ms) => page.waitForTimeout(ms);
  const until = async (fn) => { for (let i = 0; i < 60; i++) { if (await page.evaluate(fn)) return true; await wait(200); } return false; };

  await page.evaluate(([washOnly, SL, CL]) => {
    GameState.setSinValue('lust', 0);
    // «Только помыть» — награда ещё не готова.
    GameState.data.sins.lust.paid_at = washOnly ? GameTime.now() : null;
    LustMinigame.open();
    LustDebug.setLevel('soap', SL); LustDebug.setLevel('cloth', CL);
    BATH_SOAP.refresh(); BATH_CLOTH.refresh();
  }, [KIND === 'wipe', env.SOAP != null ? +env.SOAP : L, env.CLOTH != null ? +env.CLOTH : L]);
  await wait(800);

  // Точка тела (доли коробки покрытия) → экран: через SvgSpace, как прогоны.
  const bodyC = (u, v) => page.evaluate(([u, v]) => { const L = LustMinigame, b = L.coverBox(), c = L.cam;
    return SvgSpace.toClient(L.svgEl, c.tx + c.s * (b.x + b.w * u), c.ty + c.s * (b.y + b.h * v)); }, [u, v]);
  // Трение: палец 60 раз в секунду туда-обратно по телу — как живая рука, а
  // не очередью событий без пауз (такая очередь сама съедала кадры).
  const rubbing = async () => {
    const at = await page.evaluate(() => { const L = LustMinigame, o = L.loose; return SvgSpace.toClient(L.svgEl, o.pos.x, o.pos.y); });
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    const a = await bodyC(0.3, 0.35), b = await bodyC(0.6, 0.5);
    await page.mouse.move(a.x, a.y, { steps: 6 });
    const act = async (end) => {
      let i = 0;
      while (Date.now() < end) {
        const t = (i++ % 24) / 12, k = t <= 1 ? t : 2 - t, tn = Date.now();
        await page.mouse.move(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
        const w = 16 - (Date.now() - tn); if (w > 0) await new Promise(r => setTimeout(r, w));
      }
    };
    await act(Date.now() + 1000);
    return act;
  };

  let action = null;
  if (KIND !== 'shelf') {
    await page.evaluate(() => LustMinigame.startWater());
    await until(() => LustMinigame.phase === 'soap' && LustMinigame.loose && !LustMinigame.liftRaf);
    await wait(500);
  }
  if (KIND === 'soap') action = await rubbing();
  if (KIND === 'cloth' || KIND === 'pop' || KIND === 'wipe') {
    await page.evaluate(() => { const L = LustMinigame; L.rub = 1; L.growTo('soap', 1); L.finishStage('soap'); });
    await until(() => LustMinigame.phase === 'cloth' && LustMinigame.loose && !LustMinigame.liftRaf);
    await wait(400);
  }
  if (KIND === 'cloth') action = await rubbing();
  if (KIND === 'pop' || KIND === 'wipe') {
    await page.evaluate(() => { const L = LustMinigame; L.rub = 1; L.growTo('cloth', 1); L.finishStage('cloth'); });
    await until(() => ['pop', 'wipe'].includes(LustMinigame.phase));
    await wait(1800);
    // Куда тапнуть — считается ДО окна: чтение картинки в замер не идёт.
    const spot = await page.evaluate(() => {
      const L = LustMinigame, c2 = L.cam, scr = (p) => SvgSpace.toClient(L.svgEl, c2.tx + c2.s * p.x, c2.ty + c2.s * p.y);
      if (L.phase === 'pop') {
        const H = L.pile, c = document.getElementById('bt-pile');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, W = c.width, rows = [];
        for (let y = 0; y < c.height; y += 3) { const xs = []; for (let x = 0; x < W; x += 3) if (d[(y * W + x) * 4 + 3] > 120) xs.push(x); if (xs.length > 4) rows.push({ y, xs }); }
        const vis = rows.filter(r => H.pb.y + r.y / H.R < L.visibleLine() - 12), R = vis[Math.floor(vis.length * 0.4)] || rows[0];
        return R ? scr({ x: H.pb.x + R.xs[Math.floor(R.xs.length / 2)] / H.R, y: H.pb.y + R.y / H.R }) : null;
      }
      const c = document.getElementById('bt-wash');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, A = L.maskAlpha, W = c.width, pts = [];
      for (let y = 0; y < c.height; y += 9) for (let x = 0; x < W; x += 9) if (d[(y * W + x) * 4 + 3] > 120 && A[y * W + x]) pts.push({ x, y });
      if (!pts.length) return null;
      const q = pts[Math.floor(0.618 * pts.length)], box = L.wormBoxScene(), s = L.WORM_BASE.w / box.w * L.MASK_SCALE;
      return scr({ x: box.x + q.x / s, y: box.y + q.y / s });
    });
    action = async () => { if (spot) await page.mouse.click(spot.x, spot.y); };
  }
  if (KIND === 'finale') {
    await page.evaluate(() => LustDebug.jumpToFinale());
    await until(() => LustMinigame.phase === 'aim');
    await wait(1200);
  }

  if (env.HIDE) await page.evaluate((sel) => { const st = document.createElement('style'); st.textContent = sel + '{display:none !important}'; document.head.appendChild(st); }, env.HIDE);
  if (env.EVAL) await page.evaluate(env.EVAL);
  await wait(300);

  // ---- окно замера ----
  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
  await page.evaluate(() => {
    window.__f = 0; window.__dts = []; let last = performance.now();
    const st = (t) => { window.__f++; window.__dts.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(st); };
    requestAnimationFrame(st);
  });
  if (env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const TR = !env.NOTRACE;
  if (TR) await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  const start = Date.now();
  if (action) await action(start + MS);
  if (start + MS > Date.now()) await wait(start + MS - Date.now());
  const prof = env.PROFILE ? (await cdp.send('Profiler.stop')).profile : null;
  const r = await page.evaluate(() => { window.__stop = 1; const d = window.__dts.slice(1).sort((a, b) => b - a); return { f: window.__f, worst: d[0] || 0 }; });
  const real = Date.now() - start;
  if (TR) { const done = new Promise(res => cdp.once('Tracing.tracingComplete', res)); await cdp.send('Tracing.end'); await done; }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const sum = {};
  for (const e of events) if (e.ph === 'X' && e.dur) sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
  const ms = (n) => Math.round(sum[n] || 0);
  const info = await page.evaluate(() => ({ phase: LustMinigame.phase, rub: +(LustMinigame.rub || 0).toFixed(2) }));
  console.log(JSON.stringify({ port: PORT, scene: SCENE, fps: +(r.f / (real / 1000)).toFixed(1), worst: Math.round(r.worst),
    ...(TR ? { js: ms('FunctionCall') + ms('FireAnimationFrame') + ms('EventDispatch') + ms('TimerFire'), paint: ms('Paint'),
               style: ms('UpdateLayoutTree'), layerize: ms('Layerize') } : {}),
    ...info, errs: errs.slice(0, 2) }));
  if (prof) {
    const dt = {}, parent = new Map(), byId = new Map(prof.nodes.map(n => [n.id, n]));
    prof.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (prof.timeDeltas[i] || 0); });
    for (const n of prof.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
    const name = (n) => (n.callFrame.functionName || '(anon)') + ' ' + n.callFrame.url.split('/').pop().split('?')[0] + ':' + (n.callFrame.lineNumber + 1);
    const self = {}, incl = {};
    for (const n of prof.nodes) {
      const own = (dt[n.id] || 0) / 1000; if (!own) continue;
      self[name(n)] = (self[name(n)] || 0) + own;
      const seen = new Set();
      for (let cur = n.id; cur != null; cur = parent.get(cur)) { const k = name(byId.get(cur)); if (!seen.has(k)) { incl[k] = (incl[k] || 0) + own; seen.add(k); } }
    }
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)}  ${k}`).join('\n');
    console.log('СВОЁ ВРЕМЯ\n' + top(self, 20) + '\nПОЛНОЕ ВРЕМЯ\n' + top(incl, 30));
  }
  await browser.close();
})().catch(e => { console.log(JSON.stringify({ port: PORT, scene: SCENE, error: String(e).slice(0, 300) })); process.exit(1); });
