const { chromium } = require('playwright');

// ============ ПРОВЕРКА: САД ЛЕНИ И ЕГО СТЫК С КУХНЕЙ ============
// Сад и кухня — это ОДИН круг, а не две мини-игры:
//
//     сад растит продукт → продукт лежит в кладовой → кухня варит из него
//     блюдо → червь какает → какашка удобряет сад
//
// Каждое звено здесь проверяется отдельно, потому что рвётся круг тихо:
// продукт кладётся не в ту кладовую, потолок склада не работает, удобрение
// списывается, а час не снимается — всё это видно только числами.
//
// Отдельно проверяется главное требование инварианта 1: НИ ОДИН этап не
// «тикает». Время двигается отмоткой меток, как в самой игре, — тем же
// механизмом, что работает у шкал.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-garden.js
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);

  // Отмотка меток грядки назад — ровно то же, что делает машина времени в
  // debug-панели: двигаются метки в состоянии, а не системные часы.
  const rewind = (hours) => page.evaluate((h) => {
    GameState.data.garden.beds.forEach(b => { if (b.at) b.at -= h * 3600000; });
    GameState.save();
  }, hours);

  const bed = () => page.evaluate(() => JSON.stringify(GameState.data.garden.beds[0]));
  const act = (i, a, o) => page.evaluate(([i, a, o]) => JSON.stringify(Backend.gardenAct(i, a, o)), [i, a, o || null]);

  say('грядок на участке: ' + await page.evaluate(() => GameState.data.garden.beds.length) +
      ', открыто: ' + await page.evaluate(() => GameState.data.garden.beds.filter(b => b.stage !== 'locked').length) +
      ', семян: ' + await page.evaluate(() => GameState.data.garden.seeds.join(',')));

  // ---------- ЦИКЛ ГРЯДКИ ----------
  say('\n--- цикл грядки ---');
  say('посев:  ' + await act(0, 'sow', { species: 'potato' }));
  say('полив:  ' + await act(0, 'water'));
  say('состояние: ' + await bed());
  say('часов ждать: ' + await page.evaluate(() =>
      (Backend.gardenLeft(GameState.data.garden.beds[0]) / 3600000).toFixed(2)));

  // Прополоть раньше срока нельзя: этап 1 идёт оффлайн и часами.
  say('прополка раньше срока: ' + await act(0, 'weed'));

  await rewind(3);
  await page.evaluate(() => Backend.gardenSettle());
  say('после отмотки 3 ч: ' + await bed());

  say('прополка: ' + await act(0, 'weed'));
  say('минут ждать: ' + await page.evaluate(() =>
      (Backend.gardenLeft(GameState.data.garden.beds[0]) / 60000).toFixed(1)));
  say('сбор раньше срока: ' + await act(0, 'harvest'));

  await rewind(1);
  await page.evaluate(() => Backend.gardenSettle());
  const before = await page.evaluate(() => GameState.data.pantry.potato || 0);
  say('сбор: ' + await act(0, 'harvest'));
  const after = await page.evaluate(() => GameState.data.pantry.potato || 0);
  say('картошки в кладовой: ' + before + ' → ' + after + (after === before + 1 ? '  ✓' : '  ✗ ПЛОД НЕ ДОЕХАЛ'));

  // ---------- УДОБРЕНИЕ ----------
  say('\n--- удобрение: какашка снимает час ---');
  await page.evaluate(() => { GameState.addCurrency('dung', 5); GameState.save(); });
  await act(0, 'sow', { species: 'herb' });
  await act(0, 'water');
  const h0 = await page.evaluate(() => Backend.gardenLeft(GameState.data.garden.beds[0]) / 3600000);
  const dung0 = await page.evaluate(() => GameState.currency('dung'));
  await act(0, 'fertilize');
  const h1 = await page.evaluate(() => Backend.gardenLeft(GameState.data.garden.beds[0]) / 3600000);
  const dung1 = await page.evaluate(() => GameState.currency('dung'));
  say('ждать было ' + h0.toFixed(2) + ' ч, стало ' + h1.toFixed(2) + ' ч' +
      (Math.abs((h0 - h1) - 1) < 0.01 ? '  ✓ час снят' : '  ✗ ЧАС НЕ СНЯЛСЯ'));
  say('какашек ' + dung0 + ' → ' + dung1 + (dung1 === dung0 - 1 ? '  ✓ списана' : '  ✗ НЕ СПИСАЛАСЬ'));

  // Скипнуть можно хоть весь этап.
  await act(0, 'fertilize');
  await act(0, 'fertilize');
  say('после трёх удобрений: ' + await bed());

  // ---------- ПОТОЛОК СКЛАДА ----------
  say('\n--- потолок склада ---');
  const cap = await page.evaluate(() => Backend.pantryCap());
  await page.evaluate((c) => { GameState.data.pantry.potato = c; GameState.save(); }, cap);
  const put = await page.evaluate(() => Backend.gardenStore('potato', 1));
  say('потолок ' + cap + ', кладём ещё один → влезло ' + put +
      (put === 0 ? '  ✓ склад не резиновый' : '  ✗ ПОТОЛОК НЕ РАБОТАЕТ'));

  // ---------- ШКАЛА ЛЕНИ ОТ ДЕЙСТВИЙ ----------
  say('\n--- шкала лени растёт за действия, а не за присутствие ---');
  await page.evaluate(() => { GameState.setSinValue('sloth', 0); GameState.save(); });
  const s0 = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  await page.waitForTimeout(1200);      // просто постоять в саду
  const s1 = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  await act(1, 'sow', { species: 'potato' });
  const s2 = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  say('простояли секунду: ' + s0 + ' → ' + s1 + (s1 <= s0 ? '  ✓ ничего не накапало' : '  ✗ ШКАЛА ТИКАЕТ'));
  say('одно действие:     ' + s1 + ' → ' + s2 + (s2 > s1 ? '  ✓ выросла' : '  ✗ ДЕЙСТВИЕ НЕ СЧИТАЕТСЯ'));

  // ---------- ЗАМКНУТЫЙ КРУГ ----------
  say('\n--- круг: сад → кухня → какашка → сад ---');
  const loop = await page.evaluate(() => {
    // Готовим блюдо из трёх типов ровно так, как это делает кухня: сообщаем
    // результат, а награду считает конфиг (инвариант 2).
    const meta = { types: ['meat', 'veg', 'spice'], richLiquid: true,
                   items: ['pork', 'potato', 'herb'], liquid: 'broth' };
    const dish = Backend.dishQuality(meta);
    const dungBefore = GameState.currency('dung');
    Backend.minigameResult({ sin: 'gluttony', mode: 'feast', outcome: 'win', meta });
    const poopSize = GameState.data.digestion.poop_size;
    // Час спустя червь какает. Отматываем метку кормёжки — тем же способом,
    // что и машина времени в debug: цикл пищеварения длиннее часа, и ждать
    // его вживую ради проверки бессмысленно.
    GameState.data.digestion.fed_at -= 6 * 3600000;
    const poop = Backend.settleDigestion() || { id: null };
    const got = poop.id ? Backend.removePoop(poop.id) : { dung: 0 };
    return JSON.stringify({ dish, poopSize, dungBefore, gained: got.dung,
                            dungAfter: GameState.currency('dung') });
  });
  say(loop);

  say('\n' + (errors.length ? 'ОШИБКИ:\n  ' + errors.join('\n  ') : 'ошибок нет'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
