const { chromium } = require('playwright');

// ============ ПРОГОН: ХОЛСТ, МАСШТАБ КОТОРОГО НЕ РАВЕН ЕДИНИЦЕ ============
// Ловит целый класс ошибок, который на айфоне не всплывал ГОДАМИ по чистой
// случайности: логический экран айфона — ровно 390×844, то есть масштаб
// холста был РОВНО ЕДИНИЦА. Всё, что перепутало «пиксели экрана» и «единицы
// сцены», работало правильно по совпадению. Внутри Telegram видимая высота
// меньше, масштаб стал 0.85–0.9 — и в ванной червь оказался больше самой
// ванны, а в саду лопата повисла в стороне от пальца.
//
// Здесь окно НЕ 390×844 (масштаб 0.83), и вдобавок подделан getScreenCTM:
// он возвращает матрицу БЕЗ трансформации предка — так ведёт себя WebKit, а
// в Chromium, где гоняются прогоны, трансформация учитывается. То есть
// проверяется ровно то, что нельзя проверить на этой машине: поведение
// айфона.
//
// Правда берётся у браузера, а не у нашей математики: в сцену кладётся
// прямоугольник с ИЗВЕСТНЫМИ координатами, у него спрашивается
// getBoundingClientRect (это не CTM и врать не умеет), и в перевод
// подставляется середина этого прямоугольника. Мини-игра обязана вернуть те
// самые координаты.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-scaled-canvas.js
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  // ---------- ПОДДЕЛКА CTM ПОД ПОВЕДЕНИЕ WEBKIT ----------
  // Матрица теряет масштаб холста, начало координат остаётся на месте.
  await page.addInitScript(() => {
    const orig = SVGGraphicsElement.prototype.getScreenCTM;
    SVGGraphicsElement.prototype.getScreenCTM = function () {
      const m = orig.call(this);
      const box = document.getElementById('game-container');
      if (!m || !box) return m;
      const r = box.getBoundingClientRect();
      const k = (r.width / (box.clientWidth || r.width)) || 1;
      if (Math.abs(k - 1) < 0.0001) return m;
      // Матрица строится методами САМОГО svg: SVGPoint.matrixTransform не
      // принимает DOMMatrix, ему нужен SVGMatrix.
      const root = this.ownerSVGElement || this;
      return root.createSVGMatrix()
        .translate(r.left, r.top).scale(1 / k).translate(-r.left, -r.top)
        .multiply(m);
    };
  });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  const scale = await page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--stage-scale')));
  check(Math.abs(scale - 1) > 0.05, 'масштаб холста не единица (' + scale.toFixed(3) + ')');

  // Проверка самой подделки: перевод ЧЕРЕЗ CTM обязан промахнуться. Если он
  // вдруг сходится, значит подделка не работает и весь прогон ничего не
  // проверяет.
  const ctmMiss = await page.evaluate(() => {
    const svg = document.getElementById('gd-svg') || document.querySelector('svg');
    const m = svg.getScreenCTM();
    const r = svg.getBoundingClientRect();
    const pt = svg.createSVGPoint();
    pt.x = r.left + r.width / 2; pt.y = r.top + r.height / 2;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  });
  check(Math.abs(ctmMiss.x - 195) > 5 || Math.abs(ctmMiss.y - 422) > 5,
        'подделка CTM работает: перевод через матрицу промахивается');

  // ---------- ОБЩАЯ ПРОВЕРКА ОДНОЙ ИГРЫ ----------
  // В указанный слой кладётся прямоугольник с известными координатами, и
  // мини-игру просят перевести его середину обратно.
  const probe = (name, opts) => page.evaluate(({ game, layer, method, x, y }) => {
    // Мини-игры объявлены через const и в window НЕ попадают (см. main.js),
    // а по имени в глобальной области видимости находятся.
    const g = window[game] || eval(game);
    const host = g[layer];
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', 20); rect.setAttribute('height', 20);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('pointer-events', 'none');
    host.appendChild(rect);
    const r = rect.getBoundingClientRect();
    const got = g[method]({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    rect.remove();
    return { got, want: { x: x + 10, y: y + 10 }, wide: r.width };
  }, Object.assign({ game: name }, opts));

  const near = (a, b) => Math.abs(a.got.x - a.want.x) < 1.5 && Math.abs(a.got.y - a.want.y) < 1.5;

  // ---------- ЛЕНЬ: САД ----------
  await page.evaluate(() => GameManager.handleSinAction('sloth'));
  await page.waitForTimeout(900);
  const gdStage = await probe('SlothMinigame', { layer: 'svgEl', method: 'toStage', x: 120, y: 300 });
  const gdScene = await probe('SlothMinigame', { layer: 'camEl', method: 'toScene', x: 140, y: 320 });
  check(near(gdStage), 'сад: палец → холст (' + gdStage.got.x.toFixed(1) + ',' + gdStage.got.y.toFixed(1) + ')');
  check(near(gdScene), 'сад: палец → сцена (' + gdScene.got.x.toFixed(1) + ',' + gdScene.got.y.toFixed(1) + ')');
  await page.evaluate(() => SlothMinigame.close());

  // ---------- ПОХОТЬ: ВАННАЯ ----------
  await page.evaluate(() => GameManager.handleSinAction('lust'));
  await page.waitForTimeout(900);
  const btStage = await probe('LustMinigame', { layer: 'svgEl', method: 'toStage', x: 100, y: 400 });
  const btScene = await probe('LustMinigame', { layer: 'camEl', method: 'toScene', x: 150, y: 420 });
  check(near(btStage), 'ванная: палец → холст (' + btStage.got.x.toFixed(1) + ',' + btStage.got.y.toFixed(1) + ')');
  check(near(btScene), 'ванная: палец → сцена (' + btScene.got.x.toFixed(1) + ',' + btScene.got.y.toFixed(1) + ')');

  // Червь обязан быть размером со сцену, а не больше: именно это и уехало
  // в Telegram. Меряется отношение ширины червя к ширине ванны — оно от
  // масштаба холста не зависит вовсе.
  const wormFit = await page.evaluate(() => {
    const worm = document.querySelector('#bt-worm .worm-root');
    const bath = document.querySelector('#bt-svg');
    if (!worm || !bath) return null;
    const w = worm.getBoundingClientRect(), b = bath.getBoundingClientRect();
    return w.width / b.width;
  });
  // Три четверти ширины сцены — нормальная пропорция этой сцены (столько же
  // выходит при масштабе единица). Важно не само число, а что оно НЕ РАСТЁТ
  // вместе с масштабом холста: именно так червь и оказался больше ванны.
  check(wormFit !== null && wormFit > 0.55 && wormFit < 0.85,
        'ванная: червь по размеру сцены, а не больше неё (' + (wormFit || 0).toFixed(2) + ' ширины)');
  await page.evaluate(() => LustMinigame.close());

  // ---------- ЧРЕВОУГОДИЕ: КУХНЯ ----------
  await page.evaluate(() => GameManager.handleSinAction('gluttony'));
  await page.waitForTimeout(900);
  const ktStage = await probe('GluttonyMinigame', { layer: 'svgEl', method: 'toStage', x: 100, y: 300 });
  const ktScene = await probe('GluttonyMinigame', { layer: 'camEl', method: 'toScene', x: 200, y: 500 });
  check(near(ktStage), 'кухня: палец → холст (' + ktStage.got.x.toFixed(1) + ',' + ktStage.got.y.toFixed(1) + ')');
  check(near(ktScene), 'кухня: палец → сцена (' + ktScene.got.x.toFixed(1) + ',' + ktScene.got.y.toFixed(1) + ')');
  await page.evaluate(() => GluttonyMinigame.close());

  // ---------- ТЩЕСЛАВИЕ: ДОРОЖКА ----------
  await page.evaluate(() => GameManager.handleSinAction('pride'));
  await page.waitForTimeout(1200);
  const prScene = await page.evaluate(() => {
    const g = PrideMinigame;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 100); rect.setAttribute('y', 300);
    rect.setAttribute('width', 20); rect.setAttribute('height', 20);
    rect.setAttribute('fill', 'none');
    g.svgEl.appendChild(rect);
    const r = rect.getBoundingClientRect();
    const got = g.fromScreen(r.left + r.width / 2, r.top + r.height / 2);
    rect.remove();
    return { got, want: { x: 110, y: 310 } };
  });
  check(near(prScene), 'дорожка: палец → сцена (' + prScene.got.x.toFixed(1) + ',' + prScene.got.y.toFixed(1) + ')');

  console.log(errors.length ? '\nошибки страницы:\n' + errors.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nПРОВАЛЕНО: ' + fail.length : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
