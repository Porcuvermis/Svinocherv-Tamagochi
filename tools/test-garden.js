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
  // Порядок жёсткий: сначала лунка лопатой, только потом семя. Проверяется
  // именно отказ — «посеял в нетронутую землю» должен быть невозможен, иначе
  // лопата снова окажется декорацией.
  say('\n--- цикл грядки ---');
  say('посев без лунки: ' + await act(0, 'sow', { species: 'potato' }) + '  (ok:false — верно)');
  say('лунка: ' + await act(0, 'dig'));
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
  await act(0, 'dig');
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

  // ---------- ШКАЛА ЛЕНИ ----------
  // Лень — единственный грех, который наполняется и САМИМ ПРЕБЫВАНИЕМ на
  // экране: минута безделья закрывает шкалу целиком. Проверяется, что
  // пребывание считается ФОРМУЛОЙ от метки (инвариант 1), а не тикает: метку
  // отматываем на полминуты и ждём ровно половину шкалы.
  say('\n--- шкала лени: пребывание и действия ---');
  await page.evaluate(() => { GameState.setSinValue('sloth', 0); GameState.save(); });
  const half = await page.evaluate(() => {
    const r = Backend.slothWatch(GameTime.now() - 30000);   // «полминуты в саду»
    return Math.round(r.fill);
  });
  say('полминуты пребывания: +' + half + (Math.abs(half - 50) <= 2 ? '  ✓ половина шкалы' : '  ✗ НЕ ТА СКОРОСТЬ'));

  await page.evaluate(() => { GameState.setSinValue('sloth', 0); GameState.save(); });
  const s1 = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  await act(1, 'dig');
  const s2 = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  say('одно действие:        ' + s1 + ' → ' + s2 + (s2 - s1 === 20 ? '  ✓ пятая часть шкалы' : '  ✗ ДЕЙСТВИЕ НЕ СЧИТАЕТСЯ'));

  // Живьём: открытый сад сам наполняет шкалу, закрытый — нет.
  await page.evaluate(() => { GameState.setSinValue('sloth', 0); GameState.save(); GameManager.handleSinAction('sloth'); });
  await page.waitForTimeout(2400);
  const live = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  await page.evaluate(() => SlothMinigame.close());
  const afterClose = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  await page.waitForTimeout(1500);
  const idle = await page.evaluate(() => Math.round(GameState.sinValue('sloth')));
  say('две секунды в саду:   0 → ' + live + (live >= 2 ? '  ✓ капает' : '  ✗ ПРЕБЫВАНИЕ НЕ СЧИТАЕТСЯ'));
  say('полторы вне сада:     ' + afterClose + ' → ' + idle + (idle <= afterClose ? '  ✓ вне сада не капает' : '  ✗ КАПАЕТ ЗАКРЫТЫМ'));

  // ---------- ПАЛЬЦЕМ ПО ЭКРАНУ ----------
  // Всё, что выше, дёргает Backend напрямую. Здесь проверяется ровно то, что
  // делает игрок: тап рукой по завалу, перетаскивание инструмента на грядку и
  // порядок вещей на полке. Именно тут ломается тихо — таблица «что чем» и
  // зоны захвата живут отдельно от правил, и разъезжаются они молча.
  say('\n--- пальцем по экрану ---');
  await page.evaluate(() => {
    GameState.data.garden.beds.forEach((b, i) => Object.assign(b, {
      stage: i === 0 ? 'locked' : 'empty', species: null, seed: 0, at: null, skipped: 0
    }));
    GameState.data.garden.seeds = ['potato'];
    GameState.save();
    GameManager.handleSinAction('sloth');
  });
  await page.waitForTimeout(700);

  // Полка выложена по порядку применения: лопата → семена → лейка → грабли.
  const shelf = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#gd-fg .gd-tool')).map(g => g.dataset.kind).join(','));
  // Какашка на полке появляется, только если она есть, поэтому сверяется не
  // точный список, а ПОРЯДОК: лопата → семена → лейка → какашка → грабли.
  const ORDER = ['spade', 'seed', 'can', 'dung', 'rake'];
  const idx = shelf.split(',').map(k => ORDER.indexOf(k));
  const sorted = idx.every((v, n) => n === 0 || v >= idx[n - 1]);
  say('полка: ' + shelf + (sorted ? '  ✓ по порядку применения' : '  ✗ ПОРЯДОК НЕ ТОТ'));

  // Куда целиться пальцем: землю грядки берём из координат сцены, а не из
  // габаритов группы — значок над кустом уводит её центр в небо.
  const bedPoint = (i) => page.evaluate((i) => {
    const svg = document.getElementById('gd-svg');
    const p = svg.createSVGPoint();
    p.x = GARDEN_ART.bedX(i); p.y = GARDEN_ART.SOIL_Y - 12;
    const q = p.matrixTransform(document.getElementById('gd-cam').getScreenCTM());
    return { x: q.x, y: q.y };
  }, i);
  const toolPoint = (kind) => page.evaluate((kind) => {
    const g = document.querySelector(`#gd-fg .gd-tool[data-kind="${kind}"]`);
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, kind);
  const stageOf = (i) => page.evaluate((i) => GameState.data.garden.beds[i].stage, i);
  const drag = async (kind, bed) => {
    const a = await toolPoint(kind), b = await bedPoint(bed);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  // Завал разбирают РУКОЙ: лопата по нему не работает.
  await drag('spade', 0);
  say('лопата по завалу:  ' + await stageOf(0) + (await stageOf(0) === 'locked' ? '  ✓ не берёт' : '  ✗ ЛОПАТА ЧИСТИТ ЗАВАЛ'));
  const p0 = await bedPoint(0);
  await page.mouse.click(p0.x, p0.y);
  await page.waitForTimeout(700);
  say('тап рукой:         ' + await stageOf(0) + (await stageOf(0) === 'empty' ? '  ✓ завал разобран' : '  ✗ РУКА НЕ РАБОТАЕТ'));

  // Семя в нетронутую землю не ложится — сначала лунка.
  await drag('seed', 1);
  say('семя без лунки:    ' + await stageOf(1) + (await stageOf(1) === 'empty' ? '  ✓ не ложится' : '  ✗ СЕЯТЬ МОЖНО БЕЗ ЛУНКИ'));
  await drag('spade', 1);
  say('лопата:            ' + await stageOf(1) + (await stageOf(1) === 'dug' ? '  ✓ лунка' : '  ✗ ЛУНКА НЕ ВЫКОПАНА'));
  await drag('seed', 1);
  say('семя:              ' + await stageOf(1) + (await stageOf(1) === 'sown' ? '  ✓ посеяно' : '  ✗ НЕ ПОСЕЯНО'));
  await drag('can', 1);
  say('лейка:             ' + await stageOf(1) + (await stageOf(1) === 'growing' ? '  ✓ полито' : '  ✗ НЕ ПОЛИТО'));

  // Грядка не должна прыгать по экрану, когда по ней работают: анимация,
  // правящая transform, однажды уже стирала её позицию в сцене.
  const bx0 = await page.evaluate(() => document.getElementById('gd-bed-1').getBoundingClientRect().x);
  await page.evaluate(() => SlothMinigame.act(1, 'fertilize'));
  await page.waitForTimeout(150);
  const bx1 = await page.evaluate(() => document.getElementById('gd-bed-1').getBoundingClientRect().x);
  say('грядка при работе: ' + bx0.toFixed(0) + ' → ' + bx1.toFixed(0) +
      (Math.abs(bx0 - bx1) < 3 ? '  ✓ стоит на месте' : '  ✗ ПРЫГАЕТ ПО ЭКРАНУ'));

  // Время в кольце — цифрами, иначе «два часа» и «двадцать минут» на глаз
  // неразличимы.
  const clock = await page.evaluate(() => {
    const t = document.querySelector('.gd-clock');
    return t ? t.textContent.trim() : '';
  });
  say('в кольце: «' + clock + '»' + (/^\d+:\d\d$/.test(clock) ? '  ✓ цифры на месте' : '  ✗ ЧАСОВ НЕ ВИДНО'));
  await page.evaluate(() => SlothMinigame.close());

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
