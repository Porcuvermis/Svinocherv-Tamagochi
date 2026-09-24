const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН ПОХОТИ =================
// Всё покупаемое в ванной — одним экраном за кнопкой в углу (временный
// вход, потом переедет в предмет сцены). Код — src/minigames/lust/lust-shop.js,
// замысел — docs/plan/21-lust-bath.md, разделы 6 и 7.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Кнопка открывает МАГАЗИН и не включает душ: тап по ней не должен
//      провалиться в сцену под ней.
//   2. Посреди забега кнопки НЕТ. «Готовятся до, тратят после» — прямой
//      запрет из раздела 6 плана. Кнопка не глохнет, а уходит с экрана.
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

  // Палец водится ПО КООРДИНАТАМ кнопки, а не жмёт селектор: проверяется
  // заодно, что кнопка ВИДНА и её ничто не накрывает.
  const tapButton = async () => {
    const b = await page.evaluate(() => {
      const el = document.getElementById('bt-shop-btn');
      const r = el.getBoundingClientRect();
      const on = getComputedStyle(el).visibility === 'visible';
      return on && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (b) await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(400);
    return !!b;
  };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);
  await page.evaluate(() => { GameManager.handleSinAction('lust'); });
  await page.waitForTimeout(1000);

  // ================= 1. ФЛАКОН ОТКРЫВАЕТ МАГАЗИН =================
  say('\n======== КНОПКА ОТКРЫВАЕТ ПРИЛАВОК, А НЕ ЗАБЕГ ========');
  check(await tapButton(), 'до забега кнопка на экране');
  let st = await page.evaluate(() => ({ open: LustShop.open, phase: LustMinigame.phase }));
  check(st.open, 'прилавок открылся');
  check(st.phase === 'idle', `душ не включился (фаза ${st.phase})`);
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
  const shown = await tapButton();
  st = await page.evaluate(() => ({ open: LustShop.open, phase: LustMinigame.phase }));
  check(!shown && !st.open, `на этапе «${st.phase}» кнопки нет и прилавок не открыт`);

  // ================= 4. ПОКУПКА ДВИГАЕТ ЧИСЛО ИГРЫ =================
  // Меряется НЕ цифра на прилавке, а то, чем игра пользуется: ступень
  // прицела, которой стреляет финал, и радиус мазка, которым красится тело.
  say('\n======== КУПЛЕННАЯ СТУПЕНЬ ДВИГАЕТ ИГРУ ========');
  const read = () => page.evaluate(() => ({
    drain: GameState.drainHours('lust'),
    cooldown: GameState.rewardCooldownHours('lust'),
    sin: GameState.sinValue('lust'),
    tail: LustMinigame.tailTier(),
    shotMs: LustMinigame.shotMs(),
    soap: (LustMinigame.phase = 'soap', LustMinigame.stageRadius()),
    cloth: (LustMinigame.phase = 'cloth', LustMinigame.stageRadius())
  }));
  // Шкала просела пять часов назад: иначе прыжок от смены скорости не с чего
  // увидеть — он растёт вместе с прошедшим временем.
  await page.evaluate(() => { GameState.data.sins.lust.updated_at -= 5 * 3600 * 1000; });
  const before = await read();
  const buy = await page.evaluate(() => {
    Backend.grantCurrency('lust_token', 60);
    const r = {};
    ['tail', 'soap', 'cloth'].forEach(k => { r[k] = Backend.buyUpgrade(k, 'lust').ok; });
    return r;
  });
  check(buy.tail && buy.soap && buy.cloth, 'три покупки прошли');
  const after = await read();
  check(after.tail.shots === before.tail.shots + 1,
        `толчков стало больше: ${before.tail.shots} → ${after.tail.shots}`);
  check(after.shotMs < before.shotMs,
        `пауза между толчками короче, финал той же длины: ${Math.round(before.shotMs)} → ${Math.round(after.shotMs)} мс`);
  check(after.tail.spread < before.tail.spread && after.tail.gain > before.tail.gain
        && after.tail.relax < before.tail.relax,
        `разброс уже (±${before.tail.spread}° → ±${after.tail.spread}°), свайп даёт больше ` +
        `(${before.tail.gain} → ${after.tail.gain}), хвост выпрямляется медленнее ` +
        `(${before.tail.relax} → ${after.tail.relax})`);
  check(after.soap > before.soap,
        `мазок мылом шире: ${before.soap.toFixed(1)} → ${after.soap.toFixed(1)} точек сцены`);
  check(after.cloth > before.cloth,
        `тёрка мочалкой шире: ${before.cloth.toFixed(1)} → ${after.cloth.toFixed(1)} точек сцены`);
  // Вторая половина мыла и мочалки — таймеры, и они разведены: мыло
  // замедляет потребность, мочалка ускоряет награду.
  check(after.drain > before.drain,
        `шкала похоти пустеет медленнее: за ${before.drain} → ${after.drain} ч`);
  check(after.cooldown < before.cooldown,
        `награда снова доступна раньше: через ${before.cooldown} → ${after.cooldown} ч`);
  // Покупка мыла меняет СКОРОСТЬ шкалы, а значение считается формулой от
  // метки: без фиксации на момент покупки шкала прыгнула бы задним числом.
  check(Math.abs(after.sin - before.sin) < 0.5,
        `шкала не прыгнула в момент покупки: ${before.sin.toFixed(1)} → ${after.sin.toFixed(1)}`);
  await page.evaluate(() => { LustMinigame.phase = 'soap'; });

  // Списание настоящее: жетоны ушли из кошелька.
  const spent = await page.evaluate(() => 60 - GameState.currency('lust_token'));
  check(spent > 0, `жетоны списаны (${spent} за три покупки)`);

  // ================= 5. ПОСЛЕ ФИНАЛА ПРИЛАВОК ОТКРЫВАЕТСЯ СНОВА =================
  say('\n======== ПОСЛЕ ФИНАЛА ПРИЛАВОК ОТКРЫВАЕТСЯ СНОВА ========');
  await page.evaluate(() => LustMinigame.done());
  await page.waitForTimeout(600);
  await tapButton();
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
    const lvlBefore = GameState.upgradeLevel('lust_tail');
    row.click();
    await new Promise(r => setTimeout(r, 120));
    const flashed = !!document.querySelector('.ls-coin.ls-no, .ls-wallet.ls-no');
    return { dim, flashed, spent: GameState.upgradeLevel('lust_tail') !== lvlBefore,
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
    GameState.data.upgrades.lust_cloth = u.cloth.levels.length;
    GameState.save();
    LustShop.render();
    const keys = [...document.querySelectorAll('.ls-row')].map(r => r.dataset.key);
    return { keys, всего: u.order.length };
  });
  check(maxed.keys.indexOf('cloth') === -1 && maxed.keys.length === maxed.всего - 1,
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

  // ================= 8. DEBUG-ПАНЕЛЬ ПОХОТИ =================
  // Инструмент автора: ступени хвоста, мыла и мочалки кнопками, жетоны, и
  // сразу в финал — чтобы сравнить хвост на нуле и на максимуме рукой.
  // Проверяется, что кнопки НАЖИМАЮТСЯ (панель инспектора висит поверх всего
  // и однажды уже перехватывала её первую строку) и что делают своё.
  say('\n======== DEBUG-ПАНЕЛЬ ПОХОТИ ========');
  await page.evaluate(() => {
    const u = ECONOMY.minigames.lust.upgrades;
    u.order.forEach(k => { GameState.data.upgrades['lust_' + k] = 0; });
    GameState.data.currencies.lust_token = 0;
    LustMinigame.close(); LustMinigame.open();
    if (!DebugMode.enabled) DebugMode.toggle();
  });
  await page.waitForTimeout(800);
  const press = async (act) => {
    const b = await page.evaluate((a) => {
      const el = document.querySelector(`#lu-debug [data-act="${a}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, mine: top === el };
    }, act);
    if (!b) { check(false, 'нет кнопки ' + act); return false; }
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(250);
    return b.mine;
  };
  const reachable = await press('tok:10');
  check(reachable, 'первую строку панели ничто не накрывает');
  const dbg1 = await page.evaluate(() => GameState.currency('lust_token'));
  check(dbg1 === 10, `жетоны выдаются кнопкой (${dbg1})`);
  await press('allmax');
  await press('finale');
  await page.waitForTimeout(900);
  const dbg2 = await page.evaluate(() => ({
    tail: GameState.upgradeLevel('lust_tail'), top: ECONOMY.minigames.lust.upgrades.tail.levels.length,
    phase: LustMinigame.phase,
    shots: LustMinigame.shotsLeft, gain: LustMinigame.tailTier().gain }));
  check(dbg2.tail === dbg2.top,
        `«всё макс» ставит верхнюю ступень хвоста (${dbg2.tail})`);
  check(dbg2.phase === 'aim' && dbg2.shots >= 18,
        `«сразу в финал» ведёт в финал на купленной ступени (${dbg2.phase}, толчков осталось ${dbg2.shots})`);
  await press('allmin');
  const dbg3 = await page.evaluate(() => LustMinigame.tailTier().gain);
  check(dbg3 < dbg2.gain, `«всё 0» возвращает тугой хвост прямо в финале (отдача ${dbg2.gain} → ${dbg3})`);
  await page.screenshot({ path: out + '5-debug.png' });
  await page.evaluate(() => { if (DebugMode.enabled) DebugMode.toggle(); });

  say(errors.length ? '\nОШИБКИ:\n  ' + errors.join('\n  ') : '\nошибок в консоли нет');
  await browser.close();
  if (bad || errors.length) process.exit(1);
})();
