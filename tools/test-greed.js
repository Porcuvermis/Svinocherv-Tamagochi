const { chromium } = require('playwright');

// ================= ПРОГОН: АВТОМАТ АЛЧНОСТИ =================
// Проверяет весь путь целиком, пальцем по координатам, а не селекторами:
//
//   1. игра открывается в ОБЩЕМ окне (рамка, значок греха, крестик) —
//      инвариант 8;
//   2. крутка стоит монету и списывает её из кошелька;
//   3. шкала алчности растёт на fillPerSpin от КАЖДОЙ крутки, чем бы она ни
//      кончилась, — это главное правило греха;
//   4. на золотой линии встаёт ровно то, что вернул переходник;
//   5. гарантия против тильта: шести пустых круток подряд не бывает;
//   6. автомат УБЫТОЧЕН — на длинной дистанции кошелёк тает (сток золота);
//   7. пустой кошелёк не даёт крутить и не уводит баланс в минус;
//   8. выплата не режется порогом голода: сытый червь получает её так же.
//
// Ответы переходника подсматриваются перехватом Backend.greedSpin прямо в
// странице — чтобы не заводить в самой игре полей «для тестов».
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/greed-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    // Ответы автомата запоминаются здесь: экран их только показывает, и
    // сверять надо именно с ними.
    window.__spins = [];
    const orig = Backend.greedSpin.bind(Backend);
    Backend.greedSpin = function () {
      const r = orig();
      if (r.ok) window.__spins.push(r);
      return r;
    };
    GameState.reset();
    Backend.grantCurrency('gold', 200);
    GameState.setSinValue('greed', 0);
    GameManager.handleSinAction('greed');
  });
  await page.waitForTimeout(600);

  const cfg = await page.evaluate(() => JSON.parse(JSON.stringify(ECONOMY.minigames.greed)));

  // ---------- 1. ОБЩЕЕ ОКНО ----------
  const win = await page.evaluate(() => {
    const screen = document.getElementById('slots-game');
    const title = screen.querySelector('.mg-title');
    return {
      active: screen.classList.contains('active'),
      frame: !!screen.querySelector('.mg-frame'),
      close: !!screen.querySelector('.mg-close'),
      confirm: !!screen.querySelector('.mg-confirm'),
      title: title ? title.textContent : '',
      ownModal: !!screen.querySelector('.slots-modal, .slots-close-btn, .slots-title')
    };
  });
  check(win.active, 'автомат открылся');
  check(win.frame && win.close && win.confirm, 'окно общее: рамка, крестик, вопрос при выходе');
  check(win.title === '💰', 'в шапке значок алчности');
  check(!win.ownModal, 'своей рамки, крестика и заголовка больше нет');

  // ---------- 1а. ОКНО ВО ВЕСЬ ХОЛСТ, КОМНАТА ПОД НИМ ПОГАШЕНА ----------
  // Проверка общая для всех семи игр, но живёт здесь: щель вокруг рамки и
  // рисующаяся под ней комната нашлись именно на автомате.
  const room = await page.evaluate(() => {
    const frame = document.querySelector('#slots-game .mg-frame').getBoundingClientRect();
    const cont = document.getElementById('game-container').getBoundingClientRect();
    return {
      gap: Math.max(frame.left - cont.left, frame.top - cont.top,
                    cont.right - frame.right, cont.bottom - frame.bottom),
      worm: getComputedStyle(document.getElementById('worm-stage')).visibility,
      wallet: getComputedStyle(document.getElementById('wallet')).visibility,
      debug: getComputedStyle(document.getElementById('debug-toggle-btn')).visibility
    };
  });
  check(room.gap < 1, 'рамка идёт по краю холста: щели с комнатой нет');
  check(room.worm === 'hidden' && room.wallet === 'hidden', 'комната под окном не рисуется');
  check(room.debug === 'visible', 'кнопка 🐞 остаётся поверх мини-игры');
  await page.screenshot({ path: out + 'greed-0-open.png' });

  // Точка на автомате: тап по нему и есть рывок рычага.
  const spot = await page.evaluate(() => {
    const r = document.getElementById('machine-container').getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.45 };
  });

  const state = () => page.evaluate(() => ({
    gold: GameState.currency('gold'),
    sin: Math.round(GameState.sinValue('greed'))
  }));
  const lastSpin = () => page.evaluate(() => window.__spins[window.__spins.length - 1] || null);

  // Одна крутка пальцем: тап и ожидание остановки всех трёх барабанов.
  const spin = async () => {
    await page.mouse.click(spot.x, spot.y);
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(100);
      if (!(await page.evaluate(() => GreedMinigame.isSpinning))) return true;
    }
    return false;
  };

  // ---------- 2–3. СТАВКА И ШКАЛА ----------
  const before = await state();
  const stopped = await spin();
  const after = await state();
  const res = await lastSpin();
  check(stopped, 'барабаны остановились сами');
  check(!!res, 'крутка дошла до переходника');
  check(after.gold === before.gold - cfg.spinCost + (res ? res.pay : -1),
        'кошелёк изменился ровно на ставку и выплату');
  check(after.sin === before.sin + cfg.fillPerSpin, 'шкала налилась на ' + cfg.fillPerSpin);
  await page.screenshot({ path: out + 'greed-1-spin.png' });

  // ---------- 4. НА БАРАБАНАХ ТО, ЧТО ВЕРНУЛ ПЕРЕХОДНИК ----------
  const shown = await page.evaluate(() => [0, 1, 2].map(i => {
    const cells = document.querySelectorAll('#strip-' + i + ' .reel-cell');
    return cells.length >= 3 ? cells[1].dataset.key : null;
  }));
  check(!!res && shown.join(',') === res.reels.join(','),
        'на золотой линии стоит ровно то, что вернул переходник');

  // Выплата показана цифрой, а не словом (инвариант 9).
  if (res && res.pay > 0) {
    const shownPay = await page.evaluate(() => document.getElementById('win-pay').textContent);
    check(/^\+\d+$/.test(shownPay), 'выплата показана числом: ' + shownPay);
  }

  // ---------- 5. ГАРАНТИЯ ПРОТИВ ТИЛЬТА ----------
  // Пальцем — только первые крутки: дальше проверяется по ответам, иначе
  // прогон идёт минуты ради одного числа.
  for (let i = 0; i < 5; i++) if (!(await spin())) break;
  const worst = await page.evaluate((n) => {
    let dry = 0, worstRun = 0;
    for (let i = 0; i < n; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      if (r.pay > 0) { worstRun = Math.max(worstRun, dry); dry = 0; } else dry++;
    }
    return Math.max(worstRun, dry);
  }, 3000);
  check(worst <= cfg.pity.spins - 1,
        'дольше ' + (cfg.pity.spins - 1) + ' пустых круток подряд не бывает (было ' + worst + ')');

  // ---------- 6. АВТОМАТ УБЫТОЧЕН ----------
  const drain = await page.evaluate(() => {
    Backend.grantCurrency('gold', 5000);
    const start = GameState.currency('gold');
    let paid = 0, spent = 0;
    for (let i = 0; i < 3000; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      spent += r.cost; paid += r.pay;
    }
    return { start, end: GameState.currency('gold'), rtp: paid / spent };
  });
  check(drain.end < drain.start, 'на длинной дистанции кошелёк тает: автомат — сток');
  check(drain.rtp > cfg.rtpMin && drain.rtp < cfg.rtpMax,
        'возврат в коридоре: ' + (drain.rtp * 100).toFixed(1) + '%');

  // ---------- 7. ПУСТОЙ КОШЕЛЁК ----------
  await page.evaluate(() => {
    GameState.data.currencies.gold = 0;
    GameState.save();
    GreedMinigame.open();
  });
  await page.waitForTimeout(300);
  const sinBefore = (await state()).sin;
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(200);
  const broke = await page.evaluate(() => ({
    gold: GameState.currency('gold'),
    spinning: GreedMinigame.isSpinning,
    sin: Math.round(GameState.sinValue('greed')),
    shaken: document.getElementById('machine-container').classList.contains('broke')
  }));
  check(broke.gold === 0 && !broke.spinning, 'без монет крутка не идёт и баланс не уходит в минус');
  check(broke.sin === sinBefore, 'несостоявшаяся крутка не наливает шкалу');
  check(broke.shaken, 'отказ показан самим автоматом, а не окошком со словами');
  await page.screenshot({ path: out + 'greed-2-broke.png' });

  // ---------- 8. СЫТЫЙ ЧЕРВЬ ПОЛУЧАЕТ ВЫПЛАТУ ----------
  // Порог голода режет НАГРАДЫ. Выплата автомата — не награда, а возврат
  // части своей же ставки: прогнать её через порог значит превратить
  // возврат 75% в чистый отъём монет.
  const full = await page.evaluate(() => {
    Backend.grantCurrency('gold', 3000);
    GameState.setSinValue('greed', GameState.maxValue('greed'));
    let paid = 0, spent = 0;
    for (let i = 0; i < 1500; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      spent += r.cost; paid += r.pay;
    }
    return { rtp: paid / spent, sin: GameState.sinValue('greed') };
  });
  check(full.rtp > cfg.rtpMin, 'при полной шкале автомат платит так же: ' + (full.rtp * 100).toFixed(1) + '%');

  // ---------- 9. ВОЗВРАТ В КОМНАТУ ----------
  // Гашение обязано быть обратимым и БЕЗ пересборки: сцена та же самая, а не
  // собранная заново (потому и visibility, а не display).
  // Метка на живом узле сцены: если на возврате она на месте, значит сцену не
  // пересобирали. Считать узлы нельзя — их число законно меняется само
  // (у червя от состояния шкал меняется морда).
  await page.evaluate(() => {
    const svg = document.querySelector('#worm-stage svg');
    if (svg) svg.dataset.mgMark = '1';
  });
  await page.evaluate(() => GreedMinigame.close());
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({
    worm: getComputedStyle(document.getElementById('worm-stage')).visibility,
    open: document.getElementById('game-container').classList.contains('mg-open'),
    nodes: document.querySelectorAll('#worm-stage svg *').length,
    marked: (document.querySelector('#worm-stage svg') || {}).dataset
            ? document.querySelector('#worm-stage svg').dataset.mgMark === '1' : false
  }));
  check(back.worm === 'visible' && !back.open, 'после выхода комната вернулась');
  check(back.marked && back.nodes > 100, 'сцена та же, а не собрана заново');

  console.log(errors.length ? '\nошибки страницы:\n' + errors.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nПРОВАЛЕНО: ' + fail.length : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
