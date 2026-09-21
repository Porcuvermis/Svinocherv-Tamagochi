const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН ПОХОТИ =================
// Всё покупаемое в ванной — за флаконом на верхней полке, одним экраном
// (src/minigames/lust/lust-shop.js, замысел — docs/plan/21-lust-bath.md,
// разделы 1 и 6).
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Флакон открывает МАГАЗИН, а не берётся в руку и не включает душ. Он
//      стоит на той же полке, что мыло и мочалка, а рядом висит лейка, тап
//      по которой стартует забег: три соседних обработчика на одном экране.
//   2. Посреди забега магазина НЕТ. «Готовятся до, тратят после» — прямой
//      запрет из раздела 6 плана, и нарушить его проще всего случайно:
//      обработчик флакона легко переживает смену фазы.
//   3. После финала магазин открывается СНОВА. Мест два, а не одно, и
//      второе забывается первым.
//   4. Купленная ступень СДВИГАЕТ ЧИСЛО ИГРЫ, а не только цифру на
//      прилавке. Апгрейд, который ничего не меняет, — проданная пустота, и
//      в этом проекте это уже было дважды (лестница возврата семян в саду,
//      семь ручек пульта, которых не существовало).
//   5. Отказ ВИДЕН и ничего не списывает. Проверяется на ПУСТОМ кошельке —
//      именно в нём игрок живёт большую часть времени (docs/traps.md, п. 99).
//   6. Выкупленная до потолка полка УХОДИТ с прилавка: смотреть на то, что
//      уже своё, незачем.
//   7. Полок ровно столько, сколько объявлено в конфиге, и ни одной лишней:
//      два списка одного и того же однажды разойдутся молча.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-lust-shop.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/lust-shop-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  // Палец водится ПО КООРДИНАТАМ предмета, а не жмёт селектор: это заодно
  // проверка, что перевод «экран → сцена» не врёт (правило проекта).
  const tapFlask = async () => {
    const b = await page.locator('#bt-flask-home').boundingBox();
    if (!b) { check(false, 'флакона нет на экране'); return; }
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(400);
  };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);
  await page.evaluate(() => { GameManager.handleSinAction('lust'); });
  await page.waitForTimeout(1000);

  // ================= 1. ФЛАКОН ОТКРЫВАЕТ МАГАЗИН =================
  say('\n======== ФЛАКОН ОТКРЫВАЕТ ПРИЛАВОК, А НЕ ЗАБЕГ ========');
  await tapFlask();
  let st = await page.evaluate(() => ({
    open: LustShop.open, phase: LustMinigame.phase,
    inHand: document.getElementById('bt-fg').innerHTML.length
  }));
  check(st.open, 'прилавок открылся');
  check(st.phase === 'idle', `душ не включился (фаза ${st.phase})`);
  check(st.inHand === 0, 'флакон не уехал в руку');
  await page.screenshot({ path: out + '1-shop.png' });

  // ---------- ПОЛКИ: СТОЛЬКО, СКОЛЬКО В КОНФИГЕ ----------
  const shelves = await page.evaluate(() => ({
    rows: document.querySelectorAll('.ls-row').length,
    conf: (ECONOMY.minigames.lust.upgrades.order || []).length
  }));
  check(shelves.rows === shelves.conf,
        `полок на прилавке столько же, сколько в конфиге (${shelves.rows} из ${shelves.conf})`);

  // ================= 2. ЗАКРЫВАЕТСЯ ТАПОМ МИМО =================
  // Точка считается ОТ САМОГО ПРИЛАВКА, а не берётся числом: при масштабе
  // холста не единица (поведение айфона) угаданные координаты уезжают за
  // окно, и прогон винит игру вместо себя.
  const aside = await page.evaluate(() => {
    const sh = document.getElementById('bt-shop').getBoundingClientRect();
    const pan = document.getElementById('bt-shop-panel').getBoundingClientRect();
    return { x: sh.x + (pan.x - sh.x) / 2, y: sh.y + sh.height / 2 };
  });
  await page.mouse.click(aside.x, aside.y);
  await page.waitForTimeout(350);
  check(!(await page.evaluate(() => LustShop.open)), 'закрылся тапом мимо прилавка');

  // ================= 3. ПОСРЕДИ ЗАБЕГА МАГАЗИНА НЕТ =================
  say('\n======== ПОСРЕДИ ЗАБЕГА ПРИЛАВКА НЕТ ========');
  await page.evaluate(() => LustMinigame.startWater());
  await page.waitForTimeout(1400);
  await tapFlask();
  st = await page.evaluate(() => ({ open: LustShop.open, phase: LustMinigame.phase }));
  check(!st.open, `на этапе «${st.phase}» флакон не открывает прилавок`);

  // ================= 4. ПОКУПКА ДВИГАЕТ ЧИСЛО ИГРЫ =================
  // Меряется НЕ цифра на прилавке, а то, чем игра пользуется: ступень
  // прицела, которой стреляет финал, и радиус мазка, которым красится тело.
  say('\n======== КУПЛЕННАЯ СТУПЕНЬ ДВИГАЕТ ИГРУ ========');
  const before = await page.evaluate(() => ({
    aim: LustMinigame.aimTier(),
    soap: (LustMinigame.phase = 'soap', LustMinigame.stageRadius()),
    oil: LustMinigame.up('oil', 0)
  }));
  const buy = await page.evaluate(() => {
    Backend.grantCurrency('lust_token', 60);
    const r = {};
    ['aim', 'soap', 'oil'].forEach(k => { r[k] = Backend.buyUpgrade(k, 'lust').ok; });
    return r;
  });
  check(buy.aim && buy.soap && buy.oil, 'три покупки прошли');
  const after = await page.evaluate(() => ({
    aim: LustMinigame.aimTier(),
    soap: (LustMinigame.phase = 'soap', LustMinigame.stageRadius()),
    oil: LustMinigame.up('oil', 0)
  }));
  check(after.aim.spread < before.aim.spread && after.aim.minPower > before.aim.minPower,
        `прицел стал точнее: ±${before.aim.spread}° → ±${after.aim.spread}°, ` +
        `сила от ${before.aim.minPower} → ${after.aim.minPower}`);
  check(after.soap > before.soap,
        `мазок мылом шире: ${before.soap.toFixed(1)} → ${after.soap.toFixed(1)} точек сцены`);
  check(after.oil > before.oil,
        `хвост наливается быстрее: ${before.oil} → ${after.oil} за ход`);

  // Списание настоящее: жетоны ушли из кошелька.
  const spent = await page.evaluate(() => 60 - GameState.currency('lust_token'));
  check(spent > 0, `жетоны списаны (${spent} за три покупки)`);

  // ================= 5. ПОСЛЕ ФИНАЛА ПРИЛАВОК ОТКРЫВАЕТСЯ СНОВА =================
  say('\n======== ПОСЛЕ ФИНАЛА ПРИЛАВОК ОТКРЫВАЕТСЯ СНОВА ========');
  await page.evaluate(() => LustMinigame.done());
  await page.waitForTimeout(600);
  await tapFlask();
  st = await page.evaluate(() => ({ open: LustShop.open, phase: LustMinigame.phase }));
  check(st.open && st.phase === 'done', `на фазе «${st.phase}» прилавок открылся`);
  await page.screenshot({ path: out + '2-after.png' });

  // ================= 6. ПУСТОЙ КОШЕЛЁК: ОТКАЗ ВИДЕН =================
  say('\n======== ПУСТОЙ КОШЕЛЁК ========');
  const poor = await page.evaluate(async () => {
    GameState.data.currencies.lust_token = 0;
    GameState.save();
    LustShop.render();
    const row = document.querySelector('.ls-row');
    const dim = row && row.classList.contains('ls-poor');
    const lvlBefore = GameState.upgradeLevel('lust_aim');
    row.click();
    await new Promise(r => setTimeout(r, 120));
    const flashed = !!document.querySelector('.ls-coin.ls-no, .ls-wallet.ls-no');
    return { dim, flashed, spent: GameState.upgradeLevel('lust_aim') !== lvlBefore,
             purse: GameState.currency('lust_token') };
  });
  check(poor.dim, 'строка не по карману приглушена');
  check(poor.flashed, 'отказ ВИДЕН: вздрагивает валюта, которой не хватило');
  check(!poor.spent && poor.purse === 0, 'отказ ничего не списал и ничего не выдал');
  await page.screenshot({ path: out + '3-poor.png' });

  // ================= 7. ВЫКУПЛЕННАЯ ПОЛКА УХОДИТ =================
  say('\n======== ВЫКУПЛЕННАЯ ДО ПОТОЛКА ПОЛКА УХОДИТ ========');
  const maxed = await page.evaluate(() => {
    const u = ECONOMY.minigames.lust.upgrades;
    GameState.data.upgrades.lust_oil = u.oil.levels.length;
    GameState.save();
    LustShop.render();
    const keys = [...document.querySelectorAll('.ls-row')].map(r => r.dataset.key);
    return { keys, всего: u.order.length };
  });
  check(maxed.keys.indexOf('oil') === -1 && maxed.keys.length === maxed.всего - 1,
        `выкупленная полка ушла с прилавка (осталось ${maxed.keys.join(', ')})`);
  // И когда выкуплено ВСЁ — прилавок не пустой экран, а знак «больше нечего».
  const done = await page.evaluate(() => {
    const u = ECONOMY.minigames.lust.upgrades;
    u.order.forEach(k => { GameState.data.upgrades['lust_' + k] = u[k].levels.length; });
    GameState.save();
    LustShop.render();
    return { rows: document.querySelectorAll('.ls-row').length,
             empty: !!document.querySelector('.ls-empty') };
  });
  check(done.rows === 0 && done.empty, 'всё выкуплено — на прилавке знак, а не пустота');
  await page.screenshot({ path: out + '4-maxed.png' });

  say(errors.length ? '\nОШИБКИ:\n  ' + errors.join('\n  ') : '\nошибок в консоли нет');
  await browser.close();
  if (bad || errors.length) process.exit(1);
})();
