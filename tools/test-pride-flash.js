// ================= ТЩЕСЛАВИЕ: ПЕРЕХОД ВСПЫШКАМИ — ПРОГОН =================
// docs/plan/32-pride-cameras.md, задачи 4–5.
//   А. Безопасность (без отрисовки, подменённые часы): белизна экрана W по шагам 16 мс
//      на всех ходах. За шаг W меняется не больше чем на 0,2; вспышек (пар
//      противоположных смен яркости с размахом > 10 %) — не больше трёх в секунду; вход кончается сплошным белым, раскрытие — нулём.
//   Б. Живая игра с покровом (SVINO_VEIL=1): вход доходит до конца, пока игра
//      дозревает, покров сплошь белый; выход одним нажатием закрывает игру; три
//      нажатия в забеге закрывают игру; одно нажатие без продолжения уходит само.
// Запуск: NODE_PATH=/opt/node22/lib/node_modules node tools/test-pride-flash.js
const { chromium } = require('playwright');
const { viewport } = require('./harness');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage(viewport({ deviceScaleFactor: 1 }));
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(() => { window.SVINO_VEIL = 1; });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  let fails = 0;
  const check = (ok, msg) => { console.log((ok ? '  ok  ' : ' FAIL ') + msg); if (!ok) fails++; };

  console.log('--- А. безопасность: белизна экрана по шагам ---');
  const sims = await page.evaluate(() => {
    const F = PrideFlash; let T = 0; F.clock = () => T;
    const run = (steps) => {
      F.reset(); F.seed = 7; const W = [];
      let si = 0;
      for (T = 0; T <= 3200; T += 16) {
        while (si < steps.length && steps[si][0] <= T) { F.start(steps[si][1], steps[si][2]); si++; }
        W.push(F.whiteAt(T));
      }
      return W;
    };
    const out = {
      'вход (cover → reveal)': run([[0, 'cover'], [1250, 'reveal']]),
      'нажатие 1': run([[0, 'burst', 1]]),
      'нажатия 1 и 2': run([[0, 'burst', 1], [400, 'burst', 2]]),
      'нажатия 1, 2, 3': run([[0, 'burst', 1], [400, 'burst', 2], [800, 'finish'], [1800, 'clear']])
    };
    F.clock = null; F.reset();
    return out;
  });
  for (const [name, W] of Object.entries(sims)) {
    let dmax = 0; for (let i = 1; i < W.length; i++) dmax = Math.max(dmax, Math.abs(W[i] - W[i - 1]));
    // смены направления с размахом > 0,1 в любом окне 1 с
    const ext = []; let dir = 0, lastExt = W[0];
    for (let i = 1; i < W.length; i++) {
      const d = W[i] - W[i - 1]; if (Math.abs(d) < 1e-4) continue;
      const nd = Math.sign(d);
      if (dir && nd !== dir) { if (Math.abs(W[i - 1] - lastExt) > 0.1) ext.push(i * 16); lastExt = W[i - 1]; }
      dir = nd;
    }
    let worst = 0; ext.forEach(t => { worst = Math.max(worst, ext.filter(u => u >= t && u < t + 1000).length); });
    check(dmax <= 0.2, `${name}: скачок белизны за кадр ${dmax.toFixed(3)} (≤ 0,2)`);
    // Вспышка в смысле правила — ПАРА противоположных смен яркости; норма — не
    // больше трёх вспышек в секунду, то есть не больше шести смен.
    check(worst / 2 <= 3, `${name}: вспышек (пар смен яркости > 10 %) в секунду — ${worst / 2} (≤ 3)`);
    const peak = Math.max(...W);
    console.log(`       пик ${peak.toFixed(2)}, в конце ${W[W.length - 1].toFixed(3)}`);
  }
  check(Math.max(...sims['вход (cover → reveal)'].slice(55, 75)) >= 0.999, 'вход доводит экран до сплошного белого');
  check(sims['вход (cover → reveal)'].slice(-1)[0] < 0.01, 'после раскрытия белизны нет');
  check(Math.max(...sims['нажатие 1']) < Math.max(...sims['нажатия 1 и 2']), 'второе нажатие белит сильнее первого');
  check(Math.max(...sims['нажатие 1']) < 0.5, 'первое нажатие — слегка белесый экран');

  console.log('--- А2. ритм толпы: поток неровный, но плотный ---');
  // Дисперсия / среднее числа вспышек по окнам 25 мс: ровная сетка ≈ 0,1–0,3,
  // пуассоновский поток ≈ 1; толпа с сериями и порывами — 1,5–5, и хотя бы одно пустое окно — затишье (задача 4а).
  const rh = await page.evaluate(() => {
    const F = PrideFlash; F.clock = () => 0; const out = {};
    for (const [m, n, a, b] of [['cover', 0, 150, 950], ['burst', 2, 0, 600], ['reveal', 0, 0, 700]]) {
      F.reset(); F.seed = 7; F.start(m, n);
      const ts = F.st.fl.map(f => f.t0), bins = new Array(Math.floor((b - a) / 25)).fill(0);
      ts.forEach(t => { if (t >= a && t < b) bins[Math.floor((t - a) / 25)]++; });
      const mean = bins.reduce((x, y) => x + y, 0) / bins.length;
      const vmr = bins.reduce((x, y) => x + (y - mean) ** 2, 0) / bins.length / (mean || 1);
      out[m] = { n: ts.length, vmr, empty: bins.filter(x => !x).length, max: Math.max(...bins) };
    }
    F.clock = null; F.reset(); return out;
  });
  for (const [m, r] of Object.entries(rh)) {
    check(r.vmr >= 1.5 && r.vmr <= 5 && r.empty >= 1, `${m}: неровность потока ${r.vmr.toFixed(2)} (1,5–5), есть затишья, вспышек ${r.n}, пустых окон ${r.empty}, в пике ${r.max} за 25 мс`);
  }

  console.log('--- Б. живая игра с покровом ---');
  const enter = await page.evaluate(() => new Promise(res => {
    const M = PrideMinigame;
    let held = null;
    M.veilReady = () => new Promise(r => setTimeout(() => {
      const cv = document.querySelector('#mg-veil canvas'), g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let bad = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] < 250 || d[i] < 250) bad++;
      held = bad; r();
    }, 50));
    MgVeil.enter(M).then(() => setTimeout(() => res({ held, busy: MgVeil.busy, open: M.screenElement.classList.contains('active'),
      shown: document.getElementById('mg-veil').style.display !== 'none' }), 100));
  }));
  check(enter.held === 0, `пока игра дозревает, покров сплошь белый (непрозрачных не-белых точек ${enter.held})`);
  check(enter.open && !enter.busy && !enter.shown, `вход дошёл до конца: игра открыта ${enter.open}, покров убран ${!enter.shown}`);

  const leave = await page.evaluate(() => new Promise(res => {
    const M = PrideMinigame;
    MgVeil.leave(M.win, () => M.close()).then(() => setTimeout(() => res({ open: M.screenElement.classList.contains('active'), busy: MgVeil.busy }), 100));
  }));
  check(!leave.open && !leave.busy, 'выход одним нажатием закрыл игру');

  const knock3 = await page.evaluate(async () => {
    const M = PrideMinigame, wait = ms => new Promise(r => setTimeout(r, ms));
    M.open(); await wait(400);
    const leave = () => M.close();
    MgVeil.knock(M.win, leave); await wait(350);
    MgVeil.knock(M.win, leave); await wait(350);
    MgVeil.knock(M.win, leave); await wait(3200);
    return { open: M.screenElement.classList.contains('active'), busy: MgVeil.busy };
  });
  check(!knock3.open && !knock3.busy, 'три нажатия в забеге закрыли игру');

  const knock1 = await page.evaluate(async () => {
    const M = PrideMinigame, wait = ms => new Promise(r => setTimeout(r, ms));
    M.open(); await wait(400);
    MgVeil.knock(M.win, () => M.close()); await wait(2600);
    return { open: M.screenElement.classList.contains('active'), shown: document.getElementById('mg-veil').style.display !== 'none', knocks: MgVeil.knocks };
  });
  check(knock1.open && !knock1.shown && knock1.knocks === 0, 'одно нажатие без продолжения ушло само, игра идёт');

  check(!errors.length, 'ошибок страницы нет' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nВСЁ СОШЛОСЬ');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
