const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН ЛЕНИ =================
// Всё покупаемое в саду — за корзиной на полке, одним экраном
// (src/minigames/sloth/sloth-shop.js, замысел — docs/plan/19-sloth-garden.md,
// раздел 6а).
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Корзина открывает магазин, а НЕ берётся в руку. Она стоит в одном
//      ряду с инструментами, и общий обработчик полки норовит утащить её
//      в руку вместо открытия.
//   2. Купленная ступень СДВИГАЕТ ЧИСЛО игры — миллисекунды полива, минуты
//      прополки, циклы копания, шанс возврата семечки. Апгрейд, который
//      ничего не меняет, — проданная пустота, и в саду это уже было:
//      лестница возврата семян существовала, а `seed` забыли прочитать, и
//      все её ступени давали одно и то же.
//   3. Семена: открытый вид докупается СЕНОМ, закрытый открывается ЖЕТОНОМ
//      и сразу даёт первую семечку. Открытый вид с пустой ячейкой — покупка,
//      после которой ничего не произошло, и выглядит она как сбой.
//   4. Купленное видно в САДУ, а не только в магазине: семечка ложится в
//      мешок, ступень меняет работу инструмента.
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
    Backend.grantCurrency('sloth_token', 80);
    Backend.grantCurrency('hay', 40);
    GameManager.handleSinAction('sloth');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '1-shelf.png' });

  // ---------- 1. КОРЗИНА ОТКРЫВАЕТ МАГАЗИН, А НЕ БЕРЁТСЯ В РУКУ ----------
  // Она стоит в одном ряду с инструментами, и общий обработчик полки норовит
  // утащить её в руку вместо открытия.
  await tapMid('.gd-tool[data-kind="shop"]');
  const opened = await page.evaluate(() => ({
    open: SlothShop.open, inHand: !!document.querySelector('.gd-dragging')
  }));
  check(opened.open, 'тап по корзине открыл магазин');
  check(!opened.inHand, 'и НЕ взял её в руку');
  await page.screenshot({ path: out + '2-tools.png' });

  // ---------- 2. СТУПЕНЬ ДВИГАЕТ ЧИСЛО ИГРЫ ----------
  // Не «уровень вырос», а САМО ЧИСЛО: уровень может расти, пока его никто не
  // читает, — так уже было с возвратом семечки, у которого все ступени
  // давали одно и то же.
  const readNum = (t) => page.evaluate((k) => (
    k === 'can' ? Backend.gardenPourMs()
    : k === 'rake' ? GARDEN.RAKE_TIERS[Backend.gardenTools().rake].minutes
    : k === 'spade' ? Backend.gardenWorkNeed('dig')
    : Backend.gardenSeedReturn()), t);
  const SMALLER = { can: true, rake: true, spade: true, seed: false };

  for (const tool of Object.keys(SMALLER)) {
    const wasN = await readNum(tool);
    const wasT = await page.evaluate((t) => ({
      lvl: Backend.gardenTools()[t], tok: GameState.currency('sloth_token')
    }), tool);
    if (!await tapMid(`.gs-row[data-key="${tool}"]`)) continue;
    const nowN = await readNum(tool);
    const nowT = await page.evaluate((t) => ({
      lvl: Backend.gardenTools()[t], tok: GameState.currency('sloth_token')
    }), tool);
    check(nowT.lvl === wasT.lvl + 1, `${tool}: ступень выросла (${wasT.lvl} → ${nowT.lvl})`);
    check(nowT.tok < wasT.tok, `${tool}: жетоны списаны (${wasT.tok} → ${nowT.tok})`);
    check(SMALLER[tool] ? nowN < wasN : nowN > wasN,
          `${tool}: число игры сдвинулось (${wasN} → ${nowN})`);
  }

  // Выкупленная до потолка ветка УХОДИТ с прилавка: смотреть на то, что уже
  // своё, незачем.
  await page.evaluate(() => {
    GameState.data.garden.tools.can = GARDEN.CAN_TIERS.length - 1;
    SlothShop.render();
  });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !document.querySelector('.gs-row[data-key="can"]')),
        'выкупленная лестница ушла с прилавка');

  // ---------- 3. СЕМЕНА: ВИД ЗА ЖЕТОН, СЕМЕЧКА ЗА СЕНО ----------
  await page.evaluate(() => { SlothShop.tab = 'seeds'; SlothShop.render(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '3-seeds.png' });

  const locked = await page.evaluate(() => {
    const el = document.querySelector('.gs-row.gs-locked');
    return el ? el.dataset.key : null;
  });
  check(!!locked, 'на прилавке есть закрытый вид: ' + locked);
  if (locked) {
    const was = await page.evaluate(() => GameState.currency('sloth_token'));
    await tapMid(`.gs-row[data-key="${locked}"]`);
    const now = await page.evaluate((k) => ({
      seeds: Backend.gardenSeedCount(k), tok: GameState.currency('sloth_token'),
      known: Backend.gardenSeedKeys().indexOf(k) !== -1
    }), locked);
    check(now.known && now.seeds === 1, `${locked}: вид открыт и первая семечка выдана`);
    check(now.tok < was, `${locked}: жетоны списаны (${was} → ${now.tok})`);
  }

  // Открытый вид докупается СЕНОМ.
  const hayWas = await page.evaluate(() => GameState.currency('hay'));
  const seedWas = await page.evaluate(() => Backend.gardenSeedCount('potato'));
  await tapMid('.gs-row[data-key="potato"]');
  const seedNow = await page.evaluate(() => ({
    n: Backend.gardenSeedCount('potato'), hay: GameState.currency('hay')
  }));
  check(seedNow.n === seedWas + 1, `семечка докуплена (${seedWas} → ${seedNow.n})`);
  check(seedNow.hay < hayWas, `сено списано (${hayWas} → ${seedNow.hay})`);

  // ---------- 4. КУПЛЕННОЕ ВИДНО В САДУ ----------
  // Магазин, из которого покупка не доходит до грядки, — это красивый экран
  // и ничего больше.
  await page.evaluate(() => SlothShop.close());
  await page.waitForTimeout(400);
  check(await page.evaluate(() => !SlothShop.open), 'магазин закрылся');
  await page.evaluate(() => SlothMinigame.openSack());
  await page.waitForTimeout(400);
  const inSack = await page.evaluate((k) =>
    !!document.querySelector(`.gd-sack-cell[data-key="${k}"]`), locked || 'potato');
  check(inSack, 'купленный вид появился в мешке');
  await page.evaluate(() => SlothMinigame.closeSack());
  await page.waitForTimeout(300);

  // ---------- 5. ОТКАЗ НА ПУСТОМ КОШЕЛЬКЕ ----------
  // Проверка стоит здесь навсегда: покупка, проверенная только на полном
  // кошельке, у игрока выглядит выключенной (docs/traps.md, п. 99).
  await page.evaluate(() => {
    GameState.addCurrency('hay', -GameState.currency('hay'));
    GameState.addCurrency('sloth_token', -GameState.currency('sloth_token'));
    SlothShop.show();
    SlothShop.tab = 'seeds';
    SlothShop.render();
  });
  await page.waitForTimeout(400);
  const potWas = await page.evaluate(() => Backend.gardenSeedCount('potato'));
  await tapMid('.gs-row[data-key="potato"]');
  check(await page.evaluate(() =>
        !!document.querySelector('.gs-coin[data-cur="hay"].gs-no')),
        'не хватило сена — вздрогнул кошелёк, а не строка под пальцем');
  check(await page.evaluate(() => Backend.gardenSeedCount('potato')) === potWas,
        'и семечка не выдана');
  await page.screenshot({ path: out + '4-lack.png' });

  await page.evaluate(() => { SlothShop.tab = 'tools'; SlothShop.render(); });
  await page.waitForTimeout(300);
  const rakeWas = await page.evaluate(() => Backend.gardenTools().rake);
  await tapMid('.gs-row[data-key="rake"]');
  check(await page.evaluate(() =>
        !!document.querySelector('.gs-coin[data-cur="sloth_token"].gs-no')),
        'не хватило жетонов — вздрогнул кошелёк');
  check(await page.evaluate(() => Backend.gardenTools().rake) === rakeWas,
        'и ступень не выдана');

  // ---------- ЗАКРЫТИЕ ТАПОМ МИМО ----------
  // Мимо — это ВПРИТЫК слева от прилавка, а не «где-то в левой половине
  // окна»: на узком экране холст стоит в «письме», и половина ширины окна
  // оказывается ЗА сценой — тап туда не доходит до затемнения вовсе. Прогон
  // на этом и споткнулся, промахнувшись сам.
  const panel = await page.locator('#gd-shop-panel').boundingBox();
  await page.mouse.click(panel.x - 12, panel.y + panel.height / 2);
  await page.waitForTimeout(400);
  check(await page.evaluate(() => !SlothShop.open), 'тап мимо прилавка закрыл магазин');

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
