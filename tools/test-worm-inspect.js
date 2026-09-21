const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ИНСПЕКТОР ПЕРСОНАЖА ============
// `src/core/worm-inspect.js` — накладка поверх червя: два режима выбора,
// шесть накладок, сбор контекста для агента.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Закрытый инспектор НЕ ЛОВИТ ПАЛЬЦЫ. Накладка растянута на весь
//      экран, и стоит ей начать ловить события — игра перестаёт слушаться
//      вовсе, причём незаметно: экран выглядит обычным. Проверяется
//      честно — `elementFromPoint` в середине экрана.
//   2. Инспектор ТОЛЬКО ЧИТАЕТ. Ни узлов не прибавилось, ни модель не
//      поехала. Инструмент, меняющий предмет измерения, бесполезен.
//   3. Режим «элемент»: тык выбирает, повторный тык в то же место
//      СПУСКАЕТСЯ на слой глубже, и по кругу. Ради этого перебора кисть и
//      заведена — без него до нижних слоёв не добраться на телефоне.
//   4. Режим «проблема»: тык собирает ПОЛНЫЙ контекст, и в нём есть всё,
//      что агенту нужно: что выбрано, стопка, ракурс, ручки, состояние,
//      свет, история. Контекст без ракурса или без ручек — это та же
//      строка «выглядит плоским», только в скобках.
//   5. Ползунок ракурса ДЕЙСТВИТЕЛЬНО поворачивает голову, а «авто»
//      возвращает управление. Ползунок, который рисует число и не двигает
//      персонажа, — худший вид инструмента.
//   6. Накладки включаются и рисуют. Отдельно «силуэт»: он красит самого
//      червя, и обязан СНИМАТЬСЯ при закрытии — иначе игра остаётся чёрной.
//   7. Накладки не роняют персонажа: после всех включений узлов столько же.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-worm-inspect.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/worm-inspect-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);

  // ---------- 1. ЗАКРЫТЫЙ НЕ ЛОВИТ ПАЛЬЦЫ ----------
  say('');
  say('======== ЗАКРЫТЫЙ ИНСПЕКТОР НЕ МЕШАЕТ ИГРЕ ========');
  const idle = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      exists: typeof WormInspect !== 'undefined',
      onTop: el ? (el.id === 'wi-root' || el.id === 'wi-svg' || !!(el.closest && el.closest('#wi-root'))) : false,
      panelVisible: document.getElementById('wi-panel').classList.contains('visible'),
      nodes: document.querySelector('.worm-root').querySelectorAll('*').length
    };
  });
  check(idle.exists, 'инспектор загрузился');
  check(!idle.onTop, 'накладка НЕ перехватывает палец, пока инспектор закрыт');
  check(!idle.panelVisible, 'панели не видно вне debug-режима');

  // ---------- ОТКРЫВАЕМ ----------
  await page.evaluate(() => { DebugMode.toggle(); WormInspect.open(); WormInspect.renderPanel(); });
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => ({
    panel: document.getElementById('wi-panel').classList.contains('visible'),
    active: document.getElementById('wi-root').classList.contains('active'),
    handle: !!WormInspect.handle()
  }));
  check(opened.panel && opened.active, 'открытый инспектор показывает панель и накладку');
  check(opened.handle, 'инспектор нашёл, кого разглядывать');

  // ---------- ПАНЕЛЬ НЕ НАКРЫВАЕТ ПЕРСОНАЖА ----------
  // Проверка стоит здесь навсегда. Первая версия панели стояла внизу — там
  // же, где червь, — и тык в голову попадал в поле контекста: кисть честно
  // возвращала пустую стопку, потому что до персонажа палец не доходил.
  // Инструмент, закрывающий предмет измерения, не инструмент.
  say('');
  say('======== ПАНЕЛЬ НЕ ЗАКРЫВАЕТ ПЕРСОНАЖА ========');
  const cover = await page.evaluate(() => {
    const p = document.getElementById('wi-panel').getBoundingClientRect();
    const w = document.querySelector('.worm-root').getBoundingClientRect();
    const ox = Math.max(0, Math.min(p.right, w.right) - Math.max(p.left, w.left));
    const oy = Math.max(0, Math.min(p.bottom, w.bottom) - Math.max(p.top, w.top));
    return { overlap: +(ox * oy).toFixed(0), area: +(w.width * w.height).toFixed(0) };
  });
  say(`  перекрытие панели и червя: ${cover.overlap} из ${cover.area} точек`);
  check(cover.overlap === 0, 'панель не перекрывает персонажа ни одной точкой');

  // ---------- И ЛЕЖИТ ВНУТРИ ХОЛСТА ----------
  // Панель `position: fixed` в <body>, то есть привязана к ОКНУ. А верх окна
  // на айфоне в Telegram занят шапкой клиента и чёлкой: панель, стоявшая на
  // `top: 8px`, уезжала прямо под них, и на телефоне её было не прочесть и
  // не нажать. Холст уже стоит в безопасной области целиком (инвариант 11),
  // поэтому единственное верное место — внутри него.
  //
  // Проверка идёт и «по-айфонски» (SVINO_VIEWPORT), где масштаб холста не
  // единица и он не совпадает с окном: только там ошибка и видна.
  const inStage = await page.evaluate(() => {
    const p = document.getElementById('wi-panel').getBoundingClientRect();
    const g = document.getElementById('game-container').getBoundingClientRect();
    return {
      панель: { l: +p.left.toFixed(0), t: +p.top.toFixed(0), r: +p.right.toFixed(0), b: +p.bottom.toFixed(0) },
      холст: { l: +g.left.toFixed(0), t: +g.top.toFixed(0), r: +g.right.toFixed(0), b: +g.bottom.toFixed(0) },
      внутри: p.left >= g.left - 1 && p.top >= g.top - 1
           && p.right <= g.right + 1 && p.bottom <= g.bottom + 1
    };
  });
  say(`  панель ${JSON.stringify(inStage.панель)} в холсте ${JSON.stringify(inStage.холст)}`);
  check(inStage.внутри, 'панель целиком внутри холста — значит внутри безопасной области');

  // ---------- 3. КИСТЬ: ПЕРЕБОР СЛОЁВ ----------
  say('');
  say('======== КИСТЬ ПЕРЕБИРАЕТ СЛОИ ========');
  // Целимся в ГОЛОВУ по её настоящему габариту, а не в долю экрана: доля
  // экрана попадает то в червя, то мимо, и прогон начинает мерить удачу.
  // Точка головы берётся ЗАНОВО перед каждым тыком. Червь бродит по
  // комнате, и координата, снятая в начале прогона, через пару секунд
  // указывает в пол: прогон честно сообщал «кисть ничего не нашла», а
  // виноват был он сам. Та же ловушка, что и с грядкой, — мерить и
  // действовать надо по одному и тому же моменту.
  const headPoint = () => page.evaluate(() => {
    const el = document.querySelector('.worm-root [data-part="head"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
  });
  let headPt = await headPoint();
  await page.evaluate(() => { WormInspect.mode = 'pick'; });

  // Внутри цикла точка НЕ обновляется намеренно: «повторный тап в то же
  // место» — это и есть проверяемое поведение. Червя на время осмотра
  // останавливаем, чтобы место осталось тем же.
  await page.evaluate(() => window.MainWormHandle.setOptions({ wander: false }));
  headPt = await headPoint();
  const cycle = [];
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(headPt.x, headPt.y);
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => ({
      depth: WormInspect.depth,
      total: (WormInspect.stackAt || []).length,
      title: WormInspect.picked ? WormInspect.picked.title : null
    }));
    cycle.push(st);
  }
  say(`  стопка под пальцем: ${cycle[0].total} слоёв`);
  cycle.forEach((c, i) => say(`    тап ${i + 1}: слой ${c.depth + 1} — ${c.title}`));
  check(cycle[0].total > 0, 'кисть что-то нашла на голове');
  check(cycle[0].title !== null, 'у выбранного есть человеческое имя');
  if (cycle[0].total > 1) {
    check(cycle[1].depth === 1, 'повторный тап спустился на слой глубже');
    const names = cycle.map(c => c.title);
    check(new Set(names).size > 1, 'перебор действительно меняет выбранное: ' + [...new Set(names)].join(' · '));
    // По кругу: на (total+1)-м тапе снова верхний слой.
    const wrapped = cycle[cycle[0].total % 5];
    if (cycle[0].total < 5) check(wrapped.depth === 0, 'перебор замкнулся на верхнем слое');
  } else {
    say('  (в этой точке всего один слой — перебор проверить нечем)');
  }
  await page.screenshot({ path: out + '1-pick.png' });

  // ---------- 5. ПОЛЗУНОК РАКУРСА ДВИГАЕТ ГОЛОВУ ----------
  say('');
  say('======== ПОЛЗУНОК РАКУРСА ПОВОРАЧИВАЕТ ГОЛОВУ ========');
  const yawMoved = await page.evaluate(async () => {
    const h = WormInspect.handle();
    const sl = document.querySelector('#wi-panel [data-in="yaw"]');
    const setSlider = (v) => {
      sl.value = String(v);
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setSlider(-1);
    await new Promise(r => setTimeout(r, 300));
    const a = WormParts.at(h, 'cheek-left').x;
    setSlider(1);
    await new Promise(r => setTimeout(r, 300));
    const b = WormParts.at(h, 'cheek-left').x;
    const shown = document.querySelector('#wi-panel [data-out="yaw"]').textContent;
    return { a: +a.toFixed(1), b: +b.toFixed(1), shown, yaw: +WormParts.yaw(h).toFixed(2) };
  });
  say(`  левая скула: ${yawMoved.a} → ${yawMoved.b}, на панели «${yawMoved.shown}»`);
  check(Math.abs(yawMoved.b - yawMoved.a) > 1, 'ползунок реально повернул голову, а не только нарисовал число');
  check(yawMoved.shown === '1.00', 'панель показывает то же значение, что стоит у персонажа');

  const auto = await page.evaluate(async () => {
    document.querySelector('#wi-panel [data-act="yaw-auto"]').click();
    await new Promise(r => setTimeout(r, 200));
    const h = WormInspect.handle();
    return h.getHeadPose().target;
  });
  check(auto === null, '«авто» вернуло управление ракурсом автоматике');

  // ---------- 4. КОНТЕКСТ ДЛЯ АГЕНТА ----------
  say('');
  say('======== КОНТЕКСТ ДЛЯ АГЕНТА ========');
  await page.evaluate(() => { WormInspect.mode = 'problem'; });
  headPt = await headPoint();
  await page.mouse.click(headPt.x, headPt.y);
  await page.waitForTimeout(200);
  const ctx = await page.evaluate(() => {
    const ta = document.querySelector('#wi-panel [data-out="ctx"]');
    let parsed = null;
    try { parsed = JSON.parse(ta.value); } catch (e) { /* разберём как отсутствие */ }
    return { raw: ta.value.length, parsed };
  });
  check(ctx.raw > 0 && ctx.parsed, 'контекст собрался и это разбираемый JSON');
  if (ctx.parsed) {
    // Без любого из этих полей контекст — та же строка «выглядит плоским».
    const MUST = ['выбрано', 'сорт', 'стопкаПодПальцем', 'ракурс',
                  'ручкиНаЭтуВещь', 'состояние', 'свет', 'история', 'нельзя'];
    MUST.forEach(k => check(ctx.parsed[k] !== undefined, `в контексте есть «${k}»`));
    check(Array.isArray(ctx.parsed.стопкаПодПальцем) && ctx.parsed.стопкаПодПальцем.length > 0,
          `стопка непустая: ${(ctx.parsed.стопкаПодПальцем || []).join(' · ')}`);
    check(Object.keys(ctx.parsed.состояние || {}).length > 0,
          `состояние непустое: ${JSON.stringify(ctx.parsed.состояние)}`);
    check((ctx.parsed.история || []).length > 0,
          `история пишется: ${(ctx.parsed.история || []).length} шагов`);
    say(`  выбрано: ${ctx.parsed.выбрано} (${ctx.parsed.сорт}), ракурс ${ctx.parsed.ракурс}`);
    say(`  ручки: ${(ctx.parsed.ручкиНаЭтуВещь || []).join(', ') || '—'}`);
  }

  // ---------- 6. НАКЛАДКИ ----------
  say('');
  say('======== НАКЛАДКИ ВКЛЮЧАЮТСЯ И РИСУЮТ ========');
  const ovs = await page.evaluate(async () => {
    const res = [];
    const keys = ['light', 'yaw', 'density', 'depth', 'cost', 'silhouette'];
    for (const k of keys) {
      document.querySelector(`#wi-panel [data-ov="${k}"]`).click();
      await new Promise(r => setTimeout(r, 140));
      res.push({ k, on: !!WormInspect.overlays[k],
                 drawn: document.getElementById('wi-svg').innerHTML.length,
                 blackened: document.body.classList.contains('wi-silhouette') });
      // Снимаем сразу, чтобы каждую мерить отдельно, а не накопленной кучей.
      if (k !== 'silhouette') document.querySelector(`#wi-panel [data-ov="${k}"]`).click();
      await new Promise(r => setTimeout(r, 80));
    }
    return res;
  });
  ovs.forEach(o => {
    if (o.k === 'silhouette') {
      check(o.blackened, 'силуэт: червь залит чёрным');
    } else if (o.k === 'cost') {
      check(o.on, 'цена: накладка включилась');
    } else {
      check(o.on && o.drawn > 0, `${o.k}: включилась и что-то нарисовала (${o.drawn} симв. разметки)`);
    }
  });
  await page.screenshot({ path: out + '2-silhouette.png' });

  // ---------- ЗАКРЫТИЕ СНИМАЕТ СИЛУЭТ ----------
  await page.evaluate(() => WormInspect.close());
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => ({
    black: document.body.classList.contains('wi-silhouette'),
    active: document.getElementById('wi-root').classList.contains('active'),
    svg: document.getElementById('wi-svg').innerHTML.length,
    onTop: !!(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) || {}).closest?.('#wi-root')
  }));
  check(!closed.black, 'закрытие СНЯЛО заливку чёрным — игра не осталась чёрной');
  check(!closed.active && closed.svg === 0, 'накладка погашена и очищена');
  check(!closed.onTop, 'и снова не ловит пальцы');
  await page.screenshot({ path: out + '3-closed.png' });

  // ---------- 2 и 7. ТОЛЬКО ЧИТАЕТ ----------
  say('');
  say('======== ИНСПЕКТОР ТОЛЬКО ЧИТАЕТ ========');
  const after = await page.evaluate(() => ({
    nodes: document.querySelector('.worm-root').querySelectorAll('*').length,
    skull: JSON.stringify(WormModelAPI.loadWormModel().head.skull)
  }));
  check(after.nodes === idle.nodes,
        `узлов столько же, сколько до инспектора: ${after.nodes} (было ${idle.nodes})`);
  const skullNow = await page.evaluate(() => JSON.stringify(WormModelAPI.createDefaultWormModel().head.skull));
  check(after.skull === skullNow, 'модель не поехала: череп тот же, что по умолчанию');

  // ---------- ПАНЕЛЬ В TELEGRAM НА АЙФОНЕ ----------
  // Стоит последней: она подделывает клиент Telegram и пересобирает холст,
  // после чего мерить что-либо ещё нельзя.
  //
  // Без неё проверка «панель внутри холста» ничего не доказывает: на
  // компьютере холст начинается от самого верха окна, и панель на `top: 8px`
  // проходит её даром. Настоящая беда видна ТОЛЬКО там, где верх окна занят
  // чужим: чёлка плюс шапка клиента Telegram. Ровно туда панель и уезжала —
  // на телефоне её было не прочесть и не нажать.
  say('');
  say('======== ПАНЕЛЬ НЕ ЛЕЗЕТ ПОД ШАПКУ TELEGRAM ========');
  const tg = await page.evaluate(async () => {
    const CHROME = { notch: 60, header: 56 };
    window.Telegram = { WebApp: {
      viewportStableHeight: window.innerHeight - 180,
      safeAreaInset: { top: CHROME.notch, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: CHROME.header, bottom: 0, left: 0, right: 0 }
    } };
    Stage.apply();
    WormInspect.open();
    await new Promise(r => setTimeout(r, 400));
    const p = document.getElementById('wi-panel').getBoundingClientRect();
    const g = document.getElementById('game-container').getBoundingClientRect();
    WormInspect.close();
    return {
      занято: CHROME.notch + CHROME.header,
      холст: +g.top.toFixed(0),
      панель: +p.top.toFixed(0),
      внутри: p.top >= g.top - 1 && p.bottom <= g.bottom + 1
           && p.left >= g.left - 1 && p.right <= g.right + 1
    };
  });
  say(`  верх окна занят чужим на ${tg.занято}, холст начинается с ${tg.холст}, панель с ${tg.панель}`);
  check(tg.панель >= tg.занято, 'панель НЕ под шапкой клиента и не под чёлкой');
  check(tg.внутри, 'и по-прежнему целиком внутри холста');

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
