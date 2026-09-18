const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН КУХНИ =================
// Телефон в углу общего вида и приложение доставки в нём
// (src/minigames/gluttony/kitchen-shop.js).
//
// Водит пальцем по координатам, а не жмёт селекторы: телефон живёт в
// ПЕРЕДНЕМ ПЛАНЕ, в экранных единицах, и промах перевода «экран → передний
// план» здесь ловится тем же прогоном, что и сама покупка.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Телефон открывает магазин, а НЕ холодильник. На общем виде тап по
//      чему угодно открывает холодильник, и телефон обязан перехватить свой.
//   2. Телефона нет в других фазах — и он там НЕ ЛОВИТ ПАЛЬЦЫ. Это не
//      придирка: его зона захвата накрывает ручку доски, и пока он ловил
//      сквозь невидимость, доску нельзя было отодвинуть вовсе. Спрятать в
//      svg оказалось нельзя ни через pointer-events (значение ребёнка
//      перебивает родительское), ни через visibility (её игнорируют
//      значения painted/fill/stroke/all) — разбор в GluttonyMinigame.showPhone.
//   3. Покупка продукта: золото ушло, в кладовой прибавилось.
//   4. Покупка утвари: жетон ушёл, число готовки СДВИНУЛОСЬ. Апгрейд,
//      который ничего не меняет, — это проданная пустота.
//   5. Оба отказа ВИДНЫ и ничего не списывают: пустой кошелёк и полная
//      кладовая. Отказ, который ничего не показывает, выглядит как сломанная
//      игра (docs/traps.md, п. 91 и 99), а проверка на богатом состоянии
//      этого не ловит.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-kitchen-shop.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/kitchen-shop-';
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
  await page.waitForTimeout(2300);

  // Экранные координаты точки ПЕРЕДНЕГО ПЛАНА. Через SvgSpace, а не через
  // getScreenCTM: прогон, считающий матрицей, промахнётся вместе с ней
  // (tools/harness.js).
  const atStage = (x, y) => page.evaluate(([sx, sy]) =>
    SvgSpace.toClient(document.getElementById('kt-svg'), sx, sy), [x, y]);

  await page.evaluate(() => {
    GameState.setSinValue('gluttony', 0);
    GameManager.handleSinAction('gluttony');
  });
  await page.waitForTimeout(900);

  // ---------- 1. ТЕЛЕФОН ОТКРЫВАЕТ МАГАЗИН, А НЕ ХОЛОДИЛЬНИК ----------
  await page.evaluate(() => {
    Backend.grantCurrency('gold', 300);
    Backend.grantCurrency('glut_token', 9);
  });
  const phone = await page.evaluate(() => KITCHEN_ART.FG.phone);
  // Целимся в ВИДИМУЮ часть корпуса, а не в центр: центр телефона за краем
  // кадра, и тап туда игрок физически сделать не может.
  const spot = await atStage(phone.x - 26, phone.y - 54);
  await page.screenshot({ path: out + '1-overview.png' });
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(600);

  let st = await page.evaluate(() => ({ open: KitchenShop.open, phase: GluttonyMinigame.phase }));
  check(st.open, 'тап по телефону открыл приложение');
  check(st.phase === 'overview', 'холодильник при этом НЕ открылся (фаза ' + st.phase + ')');
  await page.screenshot({ path: out + '2-gear.png' });

  // ---------- 4. УТВАРЬ: ЖЕТОН УШЁЛ, ЧИСЛО СДВИНУЛОСЬ ----------
  const before = await page.evaluate(() => ({
    tokens: GameState.currency('glut_token'),
    chops: GluttonyMinigame.CHOPS_TOTAL,
    level: GameState.upgradeLevel(Backend.upgradeKey('gluttony', 'knife'))
  }));
  await page.evaluate(() => { KitchenShop.tab = 'gear'; KitchenShop.render(); });
  await page.waitForTimeout(200);
  let card = await page.locator('#bf-list .bf-card[data-key="knife"]').boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(400);
  const afterGear = await page.evaluate(() => ({
    tokens: GameState.currency('glut_token'),
    level: GameState.upgradeLevel(Backend.upgradeKey('gluttony', 'knife'))
  }));
  check(afterGear.tokens < before.tokens,
        `жетоны списаны: ${before.tokens} → ${afterGear.tokens}`);
  check(afterGear.level === before.level + 1, 'ступень ножа выросла на одну');

  // Число готовки обязано сдвинуться, и не «когда-нибудь», а к закрытию
  // магазина: игрок покупает нож ровно затем, чтобы резать этой готовкой.
  await page.evaluate(() => KitchenShop.close());
  await page.waitForTimeout(400);
  const chopsNow = await page.evaluate(() => GluttonyMinigame.CHOPS_TOTAL);
  check(chopsNow < before.chops,
        `взмахов на нарезку стало меньше: ${before.chops} → ${chopsNow}`);
  check(await page.evaluate(() => !KitchenShop.open), 'приложение закрылось');

  // ---------- 2. ТЕЛЕФОН НЕ ЛОВИТ ПАЛЬЦЫ В ЧУЖОЙ ФАЗЕ ----------
  // Самая дорогая ошибка этой правки: зона захвата телефона накрывает ручку
  // доски, и, пока она отвечала сквозь невидимость, доску нельзя было
  // отодвинуть. Проверяется тем, что видит игра, — что лежит под пальцем.
  await page.evaluate(() => GluttonyMinigame.openFridge());
  await page.waitForTimeout(1500);
  const grip = await page.evaluate(() => {
    const b = KITCHEN_ART.FG.board.fridge;
    const p = SvgSpace.toClient(document.getElementById('kt-svg'), b.x + 150, b.y);
    const el = document.elementFromPoint(p.x, p.y);
    return { onPhone: !!(el && el.closest && el.closest('#kt-phone')),
             tag: el ? (el.id || el.tagName) : 'ничего' };
  });
  check(!grip.onPhone, 'под ручкой доски не телефон, а ' + grip.tag);
  await page.evaluate(() => GluttonyMinigame.closeFridge());
  await page.waitForTimeout(900);

  // ---------- 3. ПРОДУКТ: ЗОЛОТО УШЛО, В КЛАДОВОЙ ПРИБАВИЛОСЬ ----------
  await page.evaluate(() => KitchenShop.show());
  await page.waitForTimeout(400);
  await page.evaluate(() => { KitchenShop.tab = 'food'; KitchenShop.render(); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + '3-food.png' });

  const was = await page.evaluate(() => ({
    gold: GameState.currency('gold'), herb: Backend.pantryCount('herb')
  }));
  card = await page.locator('#bf-list .bf-card[data-key="herb"]').boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(400);
  const now = await page.evaluate(() => ({
    gold: GameState.currency('gold'), herb: Backend.pantryCount('herb')
  }));
  check(now.herb === was.herb + 1, `зелени прибавилось: ${was.herb} → ${now.herb}`);
  check(now.gold < was.gold, `золото списано: ${was.gold} → ${now.gold}`);

  // ---------- 5а. ПУСТОЙ КОШЕЛЁК: ОТКАЗ ВИДЕН, НИЧЕГО НЕ СПИСАНО ----------
  // Проверка на БЕДНОМ состоянии стоит здесь навсегда: жест, проверенный
  // только на полном кошельке, у игрока выглядит выключенным (ловушка №99).
  await page.evaluate(() => {
    GameState.addCurrency('gold', -GameState.currency('gold'));
    KitchenShop.render();
  });
  await page.waitForTimeout(200);
  const poorBefore = await page.evaluate(() => Backend.pantryCount('herb'));
  card = await page.locator('#bf-list .bf-card[data-key="herb"]').boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(150);
  const refused = await page.evaluate(() => ({
    flash: document.getElementById('bf-wallet').classList.contains('lack'),
    herb: Backend.pantryCount('herb')
  }));
  check(refused.flash, 'не хватило золота — вздрогнул кошелёк, а не строка под пальцем');
  check(refused.herb === poorBefore, 'и ничего не выдано');
  await page.screenshot({ path: out + '4-lack.png' });

  // ---------- 5б. ПОЛНАЯ КЛАДОВАЯ: ОТКАЗ ВИДЕН НА ОСТАТКЕ ----------
  // Недостающее здесь не деньги, а МЕСТО, поэтому и ответ рисуется на
  // остатке, а не в кошельке.
  await page.evaluate(() => {
    Backend.grantCurrency('gold', 300);
    GameState.data.pantry.herb = Backend.pantryCap();
    KitchenShop.render();
  });
  await page.waitForTimeout(200);
  const capBefore = await page.evaluate(() => GameState.currency('gold'));
  card = await page.locator('#bf-list .bf-card[data-key="herb"]').boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(150);
  const full = await page.evaluate(() => ({
    flash: !!document.querySelector('#bf-list .bf-card[data-key="herb"] .bf-have.lack'),
    gold: GameState.currency('gold')
  }));
  check(full.flash, 'кладовая полна — вздрогнул остаток на карточке');
  check(full.gold === capBefore, 'и золото осталось на месте');

  // ---------- ЗАКРЫТИЕ ТАПОМ МИМО ----------
  // Мимо — это ВНУТРИ затемнения, но вне телефона: слева от корпуса, на его
  // же высоте. Точка выше телефона попадает уже в шапку окна мини-игры и
  // проверяет не то.
  const box = await page.locator('#kt-shop-phone').boundingBox();
  await page.mouse.click(box.x / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  check(await page.evaluate(() => !KitchenShop.open), 'тап мимо телефона закрыл приложение');
  check(await page.evaluate(() =>
        getComputedStyle(document.getElementById('kt-phone')).display !== 'none'),
        'телефон вернулся в угол');
  await page.screenshot({ path: out + '5-closed.png' });

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
