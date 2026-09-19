const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН ЛЕНИ =================
// У сада нет экрана магазина: покупки висят на тех же предметах, которыми
// работают (docs/plan/19-sloth-garden.md, раздел 6). Ценники над полкой
// покупают ступени инструментов, ячейки мешка — семена и новые виды.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Ценник покупает ступень, а НЕ берёт инструмент в руку. Два дела на
//      одном предмете — главный риск этой затеи: промахнись цель, и вместо
//      покупки игрок получает лопату в руке.
//   2. Купленная ступень СДВИГАЕТ ЧИСЛО игры — миллисекунды полива, минуты
//      прополки, циклы копания, шанс возврата семечки. Апгрейд, который
//      ничего не меняет, — проданная пустота, и в саду это уже было:
//      лестница возврата семян существовала, а `seed` забыли прочитать, и
//      все её ступени давали одно и то же.
//   3. Ячейка мешка покупает по СВОЕМУ состоянию: закрытый вид открывается
//      жетоном и сразу даёт семечку, пустая ячейка докупается сеном.
//      Открытый вид с пустой ячейкой — покупка, после которой ничего не
//      произошло, и выглядит она как сбой.
//   4. Мешок остаётся ОТКРЫТЫМ после покупки: купил одну — видно остальные.
//      Закрывается он только тогда, когда семечку вынули.
//   5. Отказ ВИДЕН и ничего не списывает. Проверяется на ПУСТОМ кошельке —
//      именно в нём игрок живёт большую часть времени (docs/traps.md, п. 99),
//      а проверка на богатом состоянии этого не ловит вовсе.
//   6. Цена грядки РАСТЁТ с каждой открытой: плоская означала бы, что шестая
//      достаётся так же легко, как третья.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-garden-shop.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/garden-shop-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };
  const tapMid = async (sel) => {
    const b = await page.locator(sel).boundingBox();
    if (!b) { check(false, 'нет узла ' + sel); return false; }
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(350);
    return true;
  };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => {
    Backend.grantCurrency('sloth_token', 60);
    Backend.grantCurrency('hay', 40);
    GameManager.handleSinAction('sloth');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '1-shelf.png' });

  // ---------- 1–2. ЦЕННИК ПОКУПАЕТ СТУПЕНЬ И ДВИГАЕТ ЧИСЛО ----------
  // Что читать у каждой лестницы. Не «уровень вырос», а САМО ЧИСЛО игры:
  // уровень может расти, пока его никто не читает, — так уже было с возвратом
  // семечки, у которого все ступени давали одно и то же.
  const NUMBERS = { can: true, rake: true, spade: true, seed: false };  // true = должно УМЕНЬШИТЬСЯ

  for (const tool of Object.keys(NUMBERS)) {
    const was = await page.evaluate((t) => ({
      lvl: Backend.gardenTools()[t],
      tok: GameState.currency('sloth_token'),
      n: t === 'can' ? Backend.gardenPourMs()
        : t === 'rake' ? GARDEN.RAKE_TIERS[Backend.gardenTools().rake].minutes
        : t === 'spade' ? Backend.gardenWorkNeed('dig')
        : Backend.gardenSeedReturn()
    }), tool);
    if (!await tapMid(`.gd-tag-wrap[data-tool="${tool}"]`)) continue;
    const now = await page.evaluate((t) => ({
      lvl: Backend.gardenTools()[t],
      tok: GameState.currency('sloth_token'),
      n: t === 'can' ? Backend.gardenPourMs()
        : t === 'rake' ? GARDEN.RAKE_TIERS[Backend.gardenTools().rake].minutes
        : t === 'spade' ? Backend.gardenWorkNeed('dig')
        : Backend.gardenSeedReturn(),
      inHand: !!document.querySelector('.gd-dragging')
    }), tool);
    check(now.lvl === was.lvl + 1, `${tool}: ступень выросла (${was.lvl} → ${now.lvl})`);
    check(now.tok < was.tok, `${tool}: жетоны списаны (${was.tok} → ${now.tok})`);
    const moved = NUMBERS[tool] ? now.n < was.n : now.n > was.n;
    check(moved, `${tool}: число игры сдвинулось (${was.n} → ${now.n})`);
    check(!now.inHand, `${tool}: тап по ценнику НЕ взял инструмент в руку`);
  }

  // ---------- ВЫКУПЛЕННАЯ ЛЕСТНИЦА: ГАЛОЧКА ВМЕСТО ЦЕННИКА ----------
  await page.evaluate(() => {
    const t = GameState.data.garden.tools;
    t.can = GARDEN.CAN_TIERS.length - 1;
    SlothMinigame.render();
  });
  await page.waitForTimeout(300);
  const done = await page.evaluate(() =>
    document.querySelector('.gd-tag-wrap[data-tool="can"]').classList.contains('gd-done'));
  check(done, 'выкупленная лестница показывает галочку, а не пустое место');
  const tokBefore = await page.evaluate(() => GameState.currency('sloth_token'));
  await tapMid('.gd-tag-wrap[data-tool="can"]');
  check(await page.evaluate(() => GameState.currency('sloth_token')) === tokBefore,
        'и тап по галочке ничего не списывает');

  // ---------- 3–4. МЕШОК: ОТКРЫТЬ ВИД И ДОКУПИТЬ СЕМЕЧКУ ----------
  await page.evaluate(() => SlothMinigame.openSack());
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '2-sack.png' });

  const locked = await page.evaluate(() => {
    const el = document.querySelector('.gd-sack-cell[data-state="locked"]');
    return el ? el.dataset.key : null;
  });
  check(!!locked, 'в мешке есть ячейка закрытого вида: ' + locked);
  if (locked) {
    const was = await page.evaluate(() => GameState.currency('sloth_token'));
    await tapMid(`.gd-sack-cell[data-key="${locked}"]`);
    const now = await page.evaluate((k) => ({
      seeds: Backend.gardenSeedCount(k),
      tok: GameState.currency('sloth_token'),
      open: SlothMinigame.sackOpen,
      state: document.querySelector(`.gd-sack-cell[data-key="${k}"]`).dataset.state
    }), locked);
    check(now.seeds === 1, `${locked}: вид открыт и первая семечка выдана`);
    check(now.tok < was, `${locked}: жетоны списаны (${was} → ${now.tok})`);
    check(now.open, 'мешок остался открытым: видно, что ещё можно купить');
    check(now.state === 'have', 'ячейка перестала быть закрытой');
  }

  // Пустая ячейка докупается СЕНОМ. Опустошаем вид, который точно открыт.
  await page.evaluate(() => {
    GameState.data.garden.seeds.potato = 0;
    SlothMinigame.openSack();
  });
  await page.waitForTimeout(300);
  const hayWas = await page.evaluate(() => GameState.currency('hay'));
  check(await page.evaluate(() =>
        document.querySelector('.gd-sack-cell[data-key="potato"]').dataset.state === 'empty'),
        'кончившийся вид остаётся в мешке пустой ячейкой с ценой');
  await tapMid('.gd-sack-cell[data-key="potato"]');
  const seedNow = await page.evaluate(() => ({
    n: Backend.gardenSeedCount('potato'), hay: GameState.currency('hay')
  }));
  check(seedNow.n === 1, 'семечка докуплена');
  check(seedNow.hay < hayWas, `сено списано (${hayWas} → ${seedNow.hay})`);

  // ---------- 5. ОТКАЗ НА ПУСТОМ КОШЕЛЬКЕ ----------
  // Проверка стоит здесь навсегда: жест, проверенный только на полном
  // кошельке, у игрока выглядит выключенным (docs/traps.md, п. 99).
  await page.evaluate(() => {
    GameState.addCurrency('hay', -GameState.currency('hay'));
    GameState.data.garden.seeds.potato = 0;
    SlothMinigame.openSack();
  });
  await page.waitForTimeout(300);
  await tapMid('.gd-sack-cell[data-key="potato"]');
  check(await page.evaluate(() =>
        !!document.querySelector('.gd-coin[data-cur="hay"].gd-no')),
        'не хватило сена — вздрогнул кошелёк, а не ячейка под пальцем');
  check(await page.evaluate(() => Backend.gardenSeedCount('potato')) === 0,
        'и семечка не выдана');
  await page.screenshot({ path: out + '3-lack.png' });

  await page.evaluate(() => {
    SlothMinigame.closeSack();
    GameState.addCurrency('sloth_token', -GameState.currency('sloth_token'));
    SlothMinigame.render();
  });
  await page.waitForTimeout(300);
  const lvlWas = await page.evaluate(() => Backend.gardenTools().rake);
  await tapMid('.gd-tag-wrap[data-tool="rake"]');
  check(await page.evaluate(() =>
        !!document.querySelector('.gd-coin[data-cur="sloth_token"].gd-no')),
        'не хватило жетонов — вздрогнул кошелёк');
  check(await page.evaluate(() => Backend.gardenTools().rake) === lvlWas,
        'и ступень не выдана');

  // ---------- 6. ЦЕНА ГРЯДКИ РАСТЁТ ----------
  const costs = await page.evaluate(() => {
    const beds = GameState.data.garden.beds;
    const out = [];
    for (let open = GARDEN.BEDS_OPEN; open < GARDEN.BEDS_TOTAL; open++) {
      beds.forEach((b, i) => { b.stage = i < open ? 'empty' : 'locked'; });
      out.push(Backend.gardenBedCost().amount);
    }
    return out;
  });
  check(costs.every((c, i) => i === 0 || c > costs[i - 1]),
        'цена следующей грядки растёт: ' + costs.join(' → '));

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
