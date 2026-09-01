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
  // делает игрок: приносит инструмент, а потом РАБОТАЕТ им — дёргает лопату,
  // приминает землю, водит граблями. Именно тут ломается тихо: подсчёт
  // движений, зоны захвата и таблица «что чем» живут отдельно от правил и
  // разъезжаются молча.
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

  const shelf = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#gd-fg-tools .gd-tool')).map(g => g.dataset.kind).join(','));
  // Какашка на полке появляется, только если она есть, поэтому сверяется не
  // точный список, а ПОРЯДОК: лопата → семена → лейка → какашка → грабли.
  const ORDER = ['spade', 'seed', 'can', 'dung', 'rake'];
  const idx = shelf.split(',').map(k => ORDER.indexOf(k));
  const sorted = idx.every((v, n) => n === 0 || v >= idx[n - 1]);
  say('полка: ' + shelf + (sorted ? '  ✓ по порядку применения' : '  ✗ ПОРЯДОК НЕ ТОТ'));

  // Куда целиться пальцем: землю грядки берём из координат сцены, а не из
  // габаритов группы — значок над кустом уводит её центр в небо.
  const bedPoint = (i, dy) => page.evaluate(([i, dy]) => {
    const svg = document.getElementById('gd-svg');
    const p = svg.createSVGPoint();
    p.x = GARDEN_ART.bedX(i); p.y = GARDEN_ART.SOIL_Y - 12;
    const q = p.matrixTransform(document.getElementById('gd-cam').getScreenCTM());
    return { x: q.x, y: q.y + (dy || 0) };
  }, [i, dy || 0]);
  const toolPoint = (kind) => page.evaluate((kind) => {
    const g = document.querySelector(`#gd-fg-tools .gd-tool[data-kind="${kind}"]`);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, kind);
  const stageOf = (i) => page.evaluate((i) => GameState.data.garden.beds[i].stage, i);
  const workOf = () => page.evaluate(() => SlothMinigame.work
    ? SlothMinigame.work.action + ' ' + SlothMinigame.work.done + '/' + SlothMinigame.work.need : 'нет');
  // Камера — обязательный шаг: грядки со второй стоят за краем экрана, и клик
  // по ним уходит мимо окна. Один раз это уже выглядело как «код не работает».
  const lookAt = async (i) => {
    await page.evaluate((i) => SlothMinigame.setCam(Math.max(0, GARDEN_ART.bedX(i) - 195)), i);
    await page.waitForTimeout(200);
  };

  // Принести инструмент — это ТОЛЬКО начало работы: он встаёт в рабочее
  // положение, грядка при этом не меняется.
  const bring = async (kind, bed) => {
    const a = await toolPoint(kind), b = await bedPoint(bed);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  // Сама работа: движения по нужной оси. Считается разворот с достаточным
  // размахом — мелкое дрожание работой не считается.
  const strokes = async (bed, n, axis, len) => {
    const p = await bedPoint(bed, -60);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let k = 0; k < n; k++) {
      const s = k % 2 === 0 ? 1 : -1;
      if (axis === 'y') await page.mouse.move(p.x, p.y + s * len, { steps: 4 });
      else await page.mouse.move(p.x + s * len, p.y, { steps: 4 });
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    await page.waitForTimeout(650);
  };

  // ---------- ЗАВАЛ СТОИТ ЖЕТОНА ----------
  await lookAt(0);
  const p0 = await bedPoint(0);
  await page.mouse.click(p0.x, p0.y);
  await page.waitForTimeout(300);
  say('завал без жетона:  работа «' + await workOf() + '», грядка ' + await stageOf(0) +
      (await workOf() === 'нет' ? '  ✓ не начали' : '  ✗ РАЗГРЕБАЕМ БЕСПЛАТНО'));
  await page.evaluate(() => { Backend.award({ currencies: {} }, 'sloth_token', 1, 'test'); GameState.save(); });
  await page.mouse.click(p0.x, p0.y);
  await page.waitForTimeout(250);
  say('завал с жетоном:   работа «' + await workOf() + '»' +
      (await workOf() !== 'нет' ? '  ✓ начали' : '  ✗ НЕ НАЧАЛИ'));
  await strokes(0, 6, 'x', 46);
  const token = await page.evaluate(() => GameState.currency('sloth_token'));
  say('после разбора:     ' + await stageOf(0) + ', жетонов ' + token +
      (await stageOf(0) === 'empty' && token === 0 ? '  ✓ разобрано, жетон списан' : '  ✗ НЕ ТАК'));

  // ---------- ЛУНКА ДЁРГАНЬЕМ ЛОПАТЫ ----------
  await bring('spade', 0);
  say('лопата донесена:   работа «' + await workOf() + '», грядка ' + await stageOf(0) +
      (await stageOf(0) === 'empty' ? '  ✓ встала в работу, но не сработала' : '  ✗ СРАБОТАЛА САМА'));
  await strokes(0, 2, 'y', 40);
  const midway = await workOf();
  await strokes(0, 6, 'y', 40);
  say('дёргаем лопату:    ' + midway + ' → ' + await stageOf(0) +
      (await stageOf(0) === 'dug' ? '  ✓ лунка' : '  ✗ ЛУНКА НЕ ВЫКОПАНА'));

  // Мелкое дрожание работой не считается: иначе действие делается само.
  await bring('seed', 0);
  await strokes(0, 8, 'x', 6);
  say('дрожание пальцем:  работа «' + await workOf() + '»' +
      ((await workOf()).endsWith('0/4') ? '  ✓ не засчитано' : '  ✗ ЗАСЧИТАНО'));
  await strokes(0, 5, 'x', 46);
  say('приминаем землю:   ' + await stageOf(0) +
      (await stageOf(0) === 'sown' ? '  ✓ посеяно' : '  ✗ НЕ ПОСЕЯНО'));

  // ---------- ПОЛИВ УДЕРЖАНИЕМ ----------
  // Лейка не «срабатывает», её ДЕРЖАТ, пока льётся вода. Поднёс и отпустил —
  // не полито; подержал сколько нужно — полито, а лейка вернулась на полку.
  const hold = async (bed, ms) => {
    const a = await toolPoint('can'), b = await bedPoint(bed);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    // Зона полива — во всю высоту НАД грядкой: лейку держат сверху, иначе она
    // закрывает собой ровно то, что поливает.
    await page.mouse.move(b.x, b.y - 240, { steps: 6 });
    await page.waitForTimeout(ms);
    const st = await page.evaluate((i) => ({
      stage: GameState.data.garden.beds[i].stage,
      live: SlothMinigame.stream.live
    }), bed);
    await page.mouse.up();
    await page.waitForTimeout(700);
    return st;
  };

  const need = await page.evaluate(() => Backend.gardenPourMs());
  const early = await hold(0, Math.round(need * 0.35));
  say('держим треть срока:' + early.stage + ', струя из ' + early.live + ' шариков' +
      (early.stage === 'sown' && early.live > 0 ? '  ✓ льётся, но не полито' : '  ✗ ПОЛИВ НЕ ТАК'));
  const full = await hold(0, need + 500);
  say('держим полный срок:' + full.stage + (full.stage === 'growing' ? '  ✓ полито' : '  ✗ НЕ ПОЛИТО'));
  const cleaned = await page.evaluate(() => ({
    ghost: document.querySelectorAll('#gd-fg .gd-dragging').length,
    live: SlothMinigame.stream.live
  }));
  say('после долива:      лейка на полке: ' + (cleaned.ghost === 0) + ', струя: ' + cleaned.live +
      (cleaned.ghost === 0 && cleaned.live === 0 ? '  ✓ прибрано' : '  ✗ ОСТАЛСЯ МУСОР'));

  // Ступени лейки: ранние сокращают полив, поздние — часы роста.
  const tiers = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < GARDEN.CAN_TIERS.length; i++) {
      GameState.data.garden.tools.can = i;
      out.push(Backend.gardenPourMs() + 'мс/' + Backend.canTier().hours + 'ч');
    }
    GameState.data.garden.tools.can = 0;
    return out;
  });
  say('ступени лейки:     ' + tiers.join('  '));

  // ---------- ПРОПОЛКА И СБОР ----------
  await page.evaluate(() => {
    const b = GameState.data.garden.beds[0];
    b.at -= 4 * 3600000; GameState.save(); Backend.gardenSettle(); SlothMinigame.render();
  });
  await page.waitForTimeout(250);
  await bring('rake', 0);
  await strokes(0, 5, 'x', 50);
  say('водим граблями:    ' + await stageOf(0) +
      (await stageOf(0) === 'ripening' ? '  ✓ прополото' : '  ✗ НЕ ПРОПОЛОТО'));

  await page.evaluate(() => {
    const b = GameState.data.garden.beds[0];
    b.at -= 60 * 60000; GameState.save(); Backend.gardenSettle(); SlothMinigame.render();
  });
  await page.waitForTimeout(250);
  // Сбор — рывок ВВЕРХ, а не тап: короткого движения мало.
  const rp = await bedPoint(0, -40);
  await page.mouse.move(rp.x, rp.y); await page.mouse.down();
  await page.mouse.move(rp.x, rp.y - 20, { steps: 3 });
  const shortPull = await stageOf(0);
  await page.mouse.move(rp.x, rp.y - 140, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  say('короткий рывок:    ' + shortPull + (shortPull === 'ripe' ? '  ✓ мало' : '  ✗ СОРВАЛОСЬ САМО'));
  say('полный рывок:      ' + await stageOf(0) +
      (await stageOf(0) === 'empty' ? '  ✓ собрано' : '  ✗ НЕ СОБРАНО'));
  const sh = await page.evaluate(() => GameState.currency('sloth_shard'));
  say('осколков за урожай: ' + sh + (sh >= 1 ? '  ✓ капнул' : '  ✗ НЕ КАПНУЛ'));

  // Три осколка складываются в жетон сами — как у гнева и кухни.
  const made = await page.evaluate(() => {
    GameState.data.currencies.sloth_shard = 0;
    GameState.data.currencies.sloth_token = 0;
    Backend.award({ currencies: {} }, 'sloth_shard', 3, 'test');
    Backend.settleExchange(null, null);
    return GameState.currency('sloth_token') + 'ж/' + GameState.currency('sloth_shard') + 'о';
  });
  say('три осколка:       ' + made + (made === '1ж/0о' ? '  ✓ сложились в жетон' : '  ✗ РАЗМЕН НЕ РАБОТАЕТ'));

  // ---------- УДОБРЕНИЕ ТОЖЕ РУКАМИ ----------
  // Какашку не кладут на грядку, её РАСТИРАЮТ: то же правило, что и у
  // остальных действий, — предмет донесли, дальше работает игрок.
  await page.evaluate(() => {
    const b = GameState.data.garden.beds[0];
    Object.assign(b, { stage: 'growing', species: 'potato', seed: 5, at: GameTime.now(), skipped: 0 });
    GameState.addCurrency('dung', 3);
    GameState.save(); SlothMinigame.render();
  });
  await page.waitForTimeout(250);
  await bring('dung', 0);
  const fertWork = await workOf();
  await strokes(0, 4, 'x', 44);
  const skipped = await page.evaluate(() => GameState.data.garden.beds[0].skipped);
  say('растираем какашку: «' + fertWork + '» → снято часов ' + skipped +
      (fertWork.startsWith('fertilize') && skipped === 1 ? '  ✓ руками' : '  ✗ НЕ ТАК'));

  // Находка всплывает над грядкой и живёт свою анимацию целиком: пока она
  // лежала внутри грядки, её сносила секундная перерисовка на полпути.
  const findAlive = await page.evaluate(async () => {
    SlothMinigame.showFind(0, { what: 'gold', amount: 2 });
    await new Promise(r => setTimeout(r, 900));
    const n = document.querySelector('#gd-finds .gd-find-fly .gd-find');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), y: Math.round(r.y) };
  });
  say('находка через 0.9 с: ' + JSON.stringify(findAlive) +
      (findAlive && findAlive.w > 0 ? '  ✓ долетела' : '  ✗ ПРОПАЛА НА ПОЛПУТИ'));

  // Грядка не должна прыгать по экрану, когда по ней работают: анимация,
  // правящая transform, однажды уже стирала её позицию в сцене.
  const bx0 = await page.evaluate(() => document.getElementById('gd-bed-0').getBoundingClientRect().x);
  await page.evaluate(() => SlothMinigame.act(0, 'dig'));
  await page.waitForTimeout(150);
  const bx1 = await page.evaluate(() => document.getElementById('gd-bed-0').getBoundingClientRect().x);
  say('грядка при работе: ' + bx0.toFixed(0) + ' → ' + bx1.toFixed(0) +
      (Math.abs(bx0 - bx1) < 3 ? '  ✓ стоит на месте' : '  ✗ ПРЫГАЕТ ПО ЭКРАНУ'));

  // Время в кольце — цифрами, иначе «два часа» и «двадцать минут» на глаз
  // неразличимы.
  await page.evaluate(() => {
    const b = GameState.data.garden.beds[1];
    Object.assign(b, { stage: 'growing', species: 'potato', seed: 7, at: GameTime.now(), skipped: 0 });
    GameState.save(); SlothMinigame.render();
  });
  await page.waitForTimeout(200);
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
