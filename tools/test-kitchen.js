const { chromium } = require('playwright');

// ================= ПРОВЕРКА: КУХНЯ ЧРЕВОУГОДИЯ =================
// Проходит полный цикл готовки в браузере: открыть холодильник, взять
// продукты, перетащить на доску, нарезать, налить основу, заложить в
// кастрюлю, размешать, покормить.
//
// Интерфейс кухни диегетический — ни одной кнопки и ни одного меню, — поэтому
// и тест работает так же: он не жмёт селекторы, а таскает предметы мышью по
// координатам сцены. Заодно это проверка на то, что перевод «экран → сцена»
// не врёт: если бы врал, ничего бы не попадало.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-kitchen.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/kitchen-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  const KT_BASKET = await page.evaluate(() => KITCHEN_ART.SLOTS.basket);

  const before = await page.evaluate(() => Object.assign({}, GameState.data.pantry));
  say('кладовая до: ' + JSON.stringify(before));

  // Координаты сцены → экранные. Тест смотрит на кухню так же, как игрок.
  const at = (x, y) => page.evaluate(([sx, sy]) => {
    const svg = document.getElementById('kt-svg');
    const m = document.getElementById('kt-cam').getScreenCTM();
    const p = svg.createSVGPoint(); p.x = sx; p.y = sy;
    const r = p.matrixTransform(m);
    return { x: r.x, y: r.y };
  }, [x, y]);

  const tap = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };

  // Дождаться, пока камера ДОЕДЕТ. Сон на глазок здесь не работает: пока
  // наезд идёт, координаты сцены под пальцем меняются каждый кадр, и тест
  // хватал предмет по устаревшей точке — то попадал, то нет. Ждём, пока
  // матрица перестанет меняться.
  const waitCamera = async () => {
    let prev = '';
    for (let i = 0; i < 60; i++) {
      const now = await page.evaluate(() => document.getElementById('kt-cam').getAttribute('transform'));
      const settled = now === prev;
      prev = now;
      await page.waitForTimeout(60);
      if (settled && i > 2) return;
    }
  };
  const drag = async (from, to) => {
    const a = await at(from[0], from[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const b = await at(from[0] + (to[0] - from[0]) * i / 12, from[1] + (to[1] - from[1]) * i / 12);
      await page.mouse.move(b.x, b.y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  };
  // Качели: водим пальцем вверх-вниз в координатах сцены.
  const swing = async (x, y, times) => {
    const start = await at(x, y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 0; i < times * 2 + 2; i++) {
      const p = await at(x, y + (i % 2 ? 110 : -110));
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
  };

  await page.evaluate(() => GameManager.handleSinAction('gluttony'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + '1-overview.png' });

  // Холодильник: тап по нему, потом по продуктам на полках.
  await tap(140, 800);
  await waitCamera();
  await page.waitForTimeout(400);   // дверцы открываются, продукты выкладываются
  await page.screenshot({ path: out + '2-fridge.png' });
  const shelf = await page.evaluate(() => Array.from(document.querySelectorAll('#kt-loose .kt-item'))
    .filter(g => g.dataset.where === 'fridge')
    .map(g => ({ key: g.dataset.key, home: JSON.parse(g.dataset.home) })));
  say('на полках: ' + shelf.map(s => s.key).join(', '));

  // По одному из каждого типа — это блюдо на три типа.
  const seen = {};
  for (const s of shelf) {
    const t = await page.evaluate(k => KITCHEN.ingredients[k].type, s.key);
    if (t === 'block' || seen[t]) continue;
    seen[t] = true;
    await tap(s.home.x, s.home.y);
    await page.waitForTimeout(450);
  }
  say('взято: ' + Object.keys(seen).join(', '));
  // Из холодильника выходят тапом по КОРЗИНЕ — «понёс к столу». Тапа в
  // пустоту больше нет: игрок его не находил.
  await tap(KT_BASKET.x, KT_BASKET.y);
  await waitCamera();
  await page.screenshot({ path: out + '3-table.png' });

  // Нарезка: тащим со стола на доску и водим ножом.
  for (let n = 0; n < 4; n++) {
    const item = await page.evaluate(() => {
      const g = document.querySelector('#kt-loose .kt-item[data-where="table"]');
      if (!g) return null;
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'));
      return { key: g.dataset.key, x: +m[1], y: +m[2], chops: KITCHEN.ingredients[g.dataset.key].chops };
    });
    if (!item) break;
    await drag([item.x, item.y], [545, 1400]);
    await page.waitForTimeout(600);
    await swing(545, 1330, item.chops + 2);
    await page.waitForTimeout(900);
  }
  say('фаза после нарезки: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await waitCamera();
  await page.screenshot({ path: out + '4-stove.png' });

  // Основа: тащим бутыль к кастрюле.
  const bottle = await page.evaluate(() => {
    const g = document.querySelector('#kt-bottles .kt-bottle:not([data-empty])');
    if (!g) return null;
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'));
    return { key: g.dataset.key, x: +m[1], y: +m[2] };
  });
  if (bottle) { await drag([bottle.x, bottle.y], [366, 580]); await page.waitForTimeout(800); }
  else { await drag([706, 568], [366, 580]); await page.waitForTimeout(700); }
  say('основа: ' + await page.evaluate(() => GluttonyMinigame.liquid));

  say('кучек у плиты: ' + await page.evaluate(() =>
    document.querySelectorAll('#kt-loose .kt-item[data-where="pile"]').length +
    ' / состояние ' + GluttonyMinigame.piles.length +
    ' / первая ' + (document.querySelector('#kt-loose .kt-item[data-where="pile"]') || {getAttribute:()=>'нет'}).getAttribute('transform')));

  // Закладка кучек.
  for (let i = 0; i < 5; i++) {
    const pile = await page.evaluate(() => {
      const g = document.querySelector('#kt-loose .kt-item[data-where="pile"]');
      if (!g) return null;
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'));
      return { x: +m[1], y: +m[2] };
    });
    if (!pile) break;
    await drag([pile.x, pile.y], [366, 580]);
    await page.waitForTimeout(700);
  }
  say('в кастрюле: ' + await page.evaluate(() => GluttonyMinigame.inPot.join(', ')));
  await page.screenshot({ path: out + '5-pot.png' });

  // Помешивание.
  await swing(366, 520, 7);
  await page.waitForTimeout(1200);
  say('фаза после помешивания: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '6-feed.png' });

  // Кормёжка. Ждём именно СМЕНЫ ФАЗЫ, а не «сколько-то миллисекунд»: между
  // последним движением ложки и переездом к червю стоит пауза, и на неё
  // нельзя закладываться сном.
  for (let i = 0; i < 40 && await page.evaluate(() => GluttonyMinigame.phase !== 'feed'); i++) {
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
  say('фаза перед кормёжкой: ' + await page.evaluate(() => GluttonyMinigame.phase) +
      '   ложка: ' + await page.evaluate(() => document.getElementById('kt-spoon').getAttribute('opacity')) +
      '   кучек: ' + await page.evaluate(() => GluttonyMinigame.piles.length) +
      '   качелей ложкой: ' + await page.evaluate(() => GluttonyMinigame.stirSwings));
  const pot = await page.$('#glut-tilt-bucket');
  if (pot) {
    const b = await pot.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 120, { steps: 8 });
    await page.waitForTimeout(9000);
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: out + '7-result.png' });

  const after = await page.evaluate(() => ({
    finished: GluttonyMinigame.feedFinished,
    pantry: Object.assign({}, GameState.data.pantry),
    shards: GameState.currency('glut_shard'),
    tokens: GameState.currency('glut_token'),
    sin: Math.round(GameState.sinValue('gluttony')),
    poopSize: GameState.data.digestion.poop_size
  }));
  say('\nнакормлен: ' + after.finished + '   шкала греха: ' + after.sin);
  say('кладовая после: ' + JSON.stringify(after.pantry));
  say('осколки: ' + after.shards + '   жетоны: ' + after.tokens + '   кучка: ' + after.poopSize);

  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
