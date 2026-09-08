const { chromium } = require('playwright');

// ================= ПРОГОН: МЕНЮ ГРЕХОВ =================
// Проверяет весь путь целиком, пальцем по координатам, а не селекторами:
//
//   1. в комнате нет ни HUD, ни списка полосок;
//   2. короткий тап по червю меню НЕ открывает (это «повозиться»);
//   3. удержание 0.5 с на червя открывает меню;
//   4. луч налит нехваткой греха, а узел горит ровно тогда, когда шкала
//      опустилась до порога голода (ECONOMY.sins.<грех>.payAt);
//   5. тап по узлу открывает мини-игру этого греха;
//   6. удержание на логотипе меню закрывает, а короткий тап — нет, и
//      отпущенный палец обрывает отсчёт НАСОВСЕМ.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-sins-menu.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/sins-menu-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  // ---------- 1. комната пуста от интерфейса ----------
  const leftovers = await page.evaluate(() => ({
    hud: !!document.getElementById('mini-hud'),
    menu: !!document.getElementById('full-menu'),
    wheel: !!document.getElementById('sins-menu')
  }));
  check(!leftovers.hud && !leftovers.menu, 'старый HUD и список полосок сняты');
  check(leftovers.wheel, 'колесо грехов собрано');

  // Точка НА ТЕЛЕ, а не в середине его габаритов: червь изогнут, и его
  // прямоугольник наполовину состоит из пустоты — палец там попадает в пол.
  // Заодно останавливаем прогулку: за 0.7 с удержания червь успевает уйти
  // из-под пальца, и прогон становится случайным.
  await page.evaluate(() => MainWormHandle.setOptions({ wander: false }));
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => {
    const r = document.querySelector('.worm-char-layer').getBoundingClientRect();
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        const x = r.x + r.width * i / 10, y = r.y + r.height * j / 10;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.worm-char-layer')) return { x, y };
      }
    }
    return null;
  });
  check(!!spot, 'на теле червя нашлась точка для удержания');
  if (!spot) { await browser.close(); process.exit(1); }

  const open = async () => {
    const st = await page.evaluate(() => SinsMenu.opened);
    return st;
  };

  // ---------- 2. короткий тап ----------
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.up();
  // Ждать надо ДОЛЬШЕ полного удержания. Первая версия проверяла через
  // 200 мс — то есть раньше, чем сработал бы отсчёт, — и потому не заметила,
  // что отпускание пальца его вообще не отменяет.
  await page.waitForTimeout(700);
  check(!(await open()), 'короткий тап по червю меню не открывает');

  // ---------- 3. удержание ----------
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(280);
  await page.screenshot({ path: out + 'sm-1-hold.png' });     // кольцо удержания
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(400);
  check(await open(), 'удержание 0.5 с открывает меню');
  await page.screenshot({ path: out + 'sm-2-menu.png' });

  // ---------- 4. что показано ----------
  // Роняем две шкалы машиной времени: одну ниже порога, другую нет.
  const shown = await page.evaluate(() => {
    GameState.setSinValue('wrath', GameState.maxValue('wrath') * 0.2);
    GameState.setSinValue('sloth', GameState.maxValue('sloth'));
    SinsMenu.update(true);
    const read = (key) => {
      const g = document.querySelector(`.sm-sin[data-sin="${key}"]`);
      return {
        ready: g.classList.contains('ready'),
        fill: parseFloat(g.querySelector('.sm-ray-flow').getAttribute('stroke-dasharray'))
      };
    };
    return { wrath: read('wrath'), sloth: read('sloth') };
  });
  check(shown.wrath.ready && shown.wrath.fill > 75, 'просевший грех: луч налит, узел горит');
  check(!shown.sloth.ready && shown.sloth.fill < 2, 'полный грех: луч пуст, узел погашен');
  await page.screenshot({ path: out + 'sm-3-ready.png' });

  // ---------- 5. тап по узлу открывает мини-игру ----------
  const node = await page.evaluate(() => {
    const r = document.querySelector('.sm-sin[data-sin="gluttony"] .sm-hit').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(node.x, node.y);
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() => ({
    game: !!document.querySelector('#gluttony-game.active'),
    menu: SinsMenu.opened
  }));
  check(opened.game, 'тап по узлу открывает мини-игру греха');
  check(!opened.menu, 'меню закрылось под мини-игрой');
  await page.screenshot({ path: out + 'sm-4-minigame.png' });

  await page.evaluate(() => GluttonyMinigame.close && GluttonyMinigame.close());
  await page.waitForTimeout(600);

  // ---------- 6. закрытие удержанием на логотипе ----------
  await page.evaluate(() => SinsMenu.open());
  await page.waitForTimeout(300);
  const core = await page.evaluate(() => {
    const r = document.querySelector('.sm-core-hit').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(core.x, core.y);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + 'sm-5-close-hold.png' });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(400);
  check(!(await open()), 'удержание на логотипе закрывает меню');

  // Короткое нажатие на логотип не должно закрывать.
  await page.evaluate(() => SinsMenu.open());
  await page.waitForTimeout(250);
  await page.mouse.move(core.x, core.y);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(900);   // заведомо дольше удержания: отсчёт обязан быть снят
  check(await open(), 'короткое нажатие на логотип не закрывает даже спустя секунду');

  // Отпускание МИМО меню тоже обязано обрывать отсчёт: палец уехал с
  // логотипа и поднялся где-то ещё.
  await page.mouse.move(core.x, core.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(core.x + 120, core.y + 200);
  await page.mouse.up();
  await page.waitForTimeout(900);
  check(await open(), 'уехавший и отпущенный палец меню не закрывает');

  // И подменяемое чтение греха: колесо не обязано знать, откуда взялись
  // «налито» и «горит».
  const custom = await page.evaluate(() => {
    SinsMenu.readers.envy = () => ({ fill: 42, ready: true });
    SinsMenu.update(true);
    const g = document.querySelector('.sm-sin[data-sin="envy"]');
    const out = { fill: parseFloat(g.querySelector('.sm-ray-flow').getAttribute('stroke-dasharray')),
                  ready: g.classList.contains('ready') };
    delete SinsMenu.readers.envy;
    SinsMenu.update(true);
    return out;
  });
  check(custom.fill === 42 && custom.ready, 'грех может читаться своей читалкой, а не общим правилом');

  // ---------- 7. награда только за просевший грех ----------
  const paid = await page.evaluate(async () => {
    GameState.setSinValue('pride', GameState.maxValue('pride'));
    const sated = await Backend.minigameResult({ sin: 'pride', mode: 'parade', outcome: 'win' });
    GameState.setSinValue('pride', GameState.maxValue('pride') * 0.1);
    const hungry = await Backend.minigameResult({ sin: 'pride', mode: 'parade', outcome: 'win' });
    return {
      sated: sated.awarded.currencies.gold || 0,
      hungry: hungry.awarded.currencies.gold || 0,
      filled: GameState.sinValue('pride') >= GameState.maxValue('pride') - 0.5
    };
  });
  check(paid.sated === 0, 'сытый грех не платит');
  check(paid.hungry > 0, 'просевший грех платит');
  check(paid.filled, 'шкала заливается в обоих случаях');

  if (errors.length) { console.log('\nОШИБКИ СТРАНИЦЫ:'); errors.forEach(e => console.log('  ' + e)); }
  console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЁ ЗЕЛЁНОЕ');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
