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
    Backend.greedSpin = function (bet) {
      const r = orig(bet);
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

  // Аппарат собирается шейдером (секунды) — ждём, пока нарисован.
  await page.evaluate(() => GreedMinigame.veilReady());
  const mounted = await page.evaluate(() => !!document.querySelector('#gj-stage canvas'));
  check(mounted, 'аппарат стоит в окне алчности');

  // Где рукоять рычага на экране: поле аппарата → экран.
  const knob = await page.evaluate(() => {
    const r = GreedJunkLit.wrapEl.getBoundingClientRect(), G = GreedJunk, K = G.leverGeom(0).K;
    return { x: r.x + K.x / G.W * r.width, y: r.y + (K.y - (G.Y0 || 0)) / G.H * r.height, unit: r.height / G.H };
  });

  const state = () => page.evaluate(() => ({
    gold: GameState.currency('gold'),
    sin: Math.round(GameState.sinValue('greed'))
  }));
  const lastSpin = () => page.evaluate(() => window.__spins[window.__spins.length - 1] || null);
  // Крутка и выплата закончились, лампа готовности снова зелёная.
  const settled = async () => {
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(100);
      if (await page.evaluate(() => !GreedMinigame.busy() && GreedJunkLit.ready && !GreedJunkLit.spinning())) return true;
    }
    return false;
  };
  // Одна крутка пальцем: тап по рукояти — рывок целиком.
  const spin = async () => {
    await page.mouse.click(knob.x, knob.y);
    return settled();
  };

  // ---------- 2–3. СТАВКА И ШКАЛА ----------
  const before = await state();
  const stopped = await spin();
  const after = await state();
  const res = await lastSpin();
  check(stopped, 'барабаны остановились, готовность вернулась');
  check(!!res, 'крутка дошла до переходника');
  check(after.gold === before.gold - cfg.spinCost + (res ? res.pay : -1),
        'кошелёк изменился ровно на ставку и выплату');
  check(after.sin === before.sin + cfg.fillPerSpin, 'шкала налилась на ' + cfg.fillPerSpin);
  await page.screenshot({ path: out + 'greed-1-spin.png' });

  // ---------- 4. НА БАРАБАНАХ ТО, ЧТО ВЕРНУЛ ПЕРЕХОДНИК ----------
  const shown = await page.evaluate(() => GreedJunkLit.reelKeys());
  check(!!res && shown.join(',') === res.reels.join(','),
        'под ниткой стоит ровно то, что вернул переходник (' + shown.join(',') + ')');

  // ---------- 4а. РЫЧАГ ТЯНЕТСЯ ПАЛЬЦЕМ ----------
  // Автомат с рычагом, который нельзя дёрнуть, — это картинка рычага.
  // Проверяется ровно так, как делает палец: нажали на ручку, потянули
  // вниз — храповик, срыв, крутка.
  // Отдача в палец: считаем не «завибрировало ли» (в браузере это не
  // проверить), а что игра её ЗАПРОСИЛА — храповик по ходу и удар на срыве.
  await page.evaluate(() => {
    window.__haptics = [];
    const tick = Haptics.tick.bind(Haptics);
    const impact = Haptics.impact.bind(Haptics);
    Haptics.tick = () => { window.__haptics.push('tick'); tick(); };
    Haptics.impact = (kind, force) => { window.__haptics.push('impact:' + (kind || '')); impact(kind, force); };
    // очередь ударов (зубцы, срыв): вне Telegram она идёт жужжанием, а не
    // impact, — пишется сама очередь
    const burst = Haptics.burst.bind(Haptics);
    Haptics.burst = (kind, n, gap, then) => { window.__haptics.push('burst:' + kind); burst(kind, n, gap, then); };
  });
  const spinsBefore = await page.evaluate(() => window.__spins.length);
  const travel = await page.evaluate(() => GreedJunkLit.LEVER.travel);
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(knob.x, knob.y + travel * knob.unit * 1.15 * i / 12);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const feel = await page.evaluate(() => window.__haptics.slice());
  check(feel.filter(x => x === 'tick').length >= 3,
        'храповик щёлкает по ходу (' + feel.filter(x => x === 'tick').length + ' щелчков)');
  check(feel.includes('burst:rigid'), 'зубцы проскакивают с отдачей');
  check(feel.includes('burst:heavy'), 'срыв рычага бьёт в палец');
  const spinsAfter = await page.evaluate(() => window.__spins.length);
  check(spinsAfter === spinsBefore + 1, 'дотянутый рычаг запускает крутку');
  await settled();

  // Недотянутый рычаг возвращается сам и ничего не запускает.
  const shortBefore = await page.evaluate(() => window.__spins.length);
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(knob.x, knob.y + travel * knob.unit * 0.3);
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const shortAfter = await page.evaluate(() => window.__spins.length);
  check(shortAfter === shortBefore, 'недотянутый рычаг крутку не запускает');

  // ---------- 5. ГАРАНТИЯ ПРОТИВ ТИЛЬТА ----------
  // Пальцем — только первые крутки: дальше проверяется по ответам, иначе
  // прогон идёт минуты ради одного числа.
  for (let i = 0; i < 5; i++) if (!(await spin())) break;
  const worst = await page.evaluate((n) => {
    let dry = 0, worstRun = 0;
    for (let i = 0; i < n; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      // Выигрыш — не только монеты: жетонная тройка платит жетоном вместо
      // них (docs/plan/28-greed-machine.md, разд. 5) и гарантию сбрасывает.
      const won = r.pay > 0 || Object.keys(r.currencies || {}).length > 0;
      if (won) { worstRun = Math.max(worstRun, dry); dry = 0; } else dry++;
    }
    return Math.max(worstRun, dry);
  }, 3000);
  check(worst <= cfg.pity.spins - 1,
        'дольше ' + (cfg.pity.spins - 1) + ' пустых круток подряд не бывает (было ' + worst + ')');

  // ---------- 6. АВТОМАТ УБЫТОЧЕН ----------
  // Круток здесь ДЕСЯТКИ ТЫСЯЧ, а не три тысячи, и это не запас прочности.
  // Возврат автомата держится на редких крупных выплатах, поэтому разброс
  // выборки огромен: на трёх тысячах он гулял от 73% до 84% при коридоре
  // 60–80%, и проверка падала на ровном месте примерно каждый пятый прогон.
  // Тридцать тысяч сжимают разброс втрое и делают отказ настоящим.
  const drain = await page.evaluate(() => {
    Backend.grantCurrency('gold', 60000);
    const start = GameState.currency('gold');
    let paid = 0, spent = 0;
    for (let i = 0; i < 30000; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      spent += r.cost; paid += r.pay;
    }
    return { start, end: GameState.currency('gold'), rtp: paid / spent };
  });
  check(drain.end < drain.start, 'на длинной дистанции кошелёк тает: автомат — сток');
  check(drain.rtp > cfg.rtpMin && drain.rtp < cfg.rtpMax,
        'возврат в коридоре: ' + (drain.rtp * 100).toFixed(1) + '%');

  // ---------- 6а. АППАРАТ: ЖЕТОНЫ, СТАВКИ, КОЛЕСО, ПАЧИНКО ----------
  // Числа здесь не проверяются — их держит sim-slots.js. Здесь проверяется
  // устройство: замки, множитель ставки, полный склад.
  const machine = await page.evaluate(() => {
    const o = {};
    Backend.grantCurrency('gold', 200000);
    o.bet3Locked = Backend.greedSpin(3).error === 'bet_locked';
    o.wheelLocked = Backend.greedPlay('wheel').error === 'locked';
    const t0 = GameState.currency('greed_token') * 3 + GameState.currency('greed_shard');
    let alt = 0;
    for (let i = 0; i < 6000; i++) {
      const r = Backend.greedSpin();
      // жетон и осколок теперь символы барабана: считается только их тройка
      const tri = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
      if (tri && (r.reels[0] === 'token' || r.reels[0] === 'shard')) { alt++; if (r.pay !== 0) o.altPaidGold = true; }
    }
    o.alt = alt;
    o.shardsGrew = GameState.currency('greed_token') * 3 + GameState.currency('greed_shard') > t0;
    ['greed', 'wrath', 'glut', 'sloth', 'lust', 'envy', 'pride'].forEach(k => Backend.grantCurrency(k + '_token', 100));
    o.wheelBought = Backend.buyUpgrade('wheel', 'greed').ok;
    o.slots2 = Backend.buyUpgrade('slots', 'greed').ok;
    const r100 = Backend.greedSpin(100);
    o.bet100 = r100.ok && r100.cost === 100;
    GameState.data.pantry.rib = Backend.pantryCap();
    let full = 0, fullGold = 0;
    for (let i = 0; i < 3000; i++) {
      const r = Backend.greedPlay('wheel');
      if (r.items && r.items.rest > 0) { full++; fullGold += r.currencies.gold || 0; }
    }
    o.full = full; o.fullGold = fullGold;
    o.pachBought = Backend.buyUpgrade('pachinko', 'greed').ok;
    const before = GameState.currency('envy_token') + GameState.currency('pride_token');
    for (let i = 0; i < 3000; i++) Backend.greedPlay('pachinko');
    o.foreign = GameState.currency('envy_token') + GameState.currency('pride_token') > before;
    return o;
  });
  check(machine.bet3Locked, 'до апгрейда большие ставки закрыты');
  check(machine.wheelLocked, 'колесо закрыто до покупки');
  check(machine.alt > 0 && !machine.altPaidGold, 'жетонная тройка выпадает и монет при ней нет');
  check(machine.shardsGrew, 'жетоны алчности копятся');
  check(machine.wheelBought && machine.slots2, 'открытие и апгрейд покупаются жетонами всех грехов');
  check(machine.bet100, 'после апгрейда ставка 100 работает и стоит 100');
  check(machine.full > 0 && machine.fullGold >= machine.full,
        'мясо в полную кладовую платится монетами (' + machine.full + ' раз)');
  check(machine.pachBought && machine.foreign, 'пачинко платит жетонами чужих грехов');

  // ---------- 7. ПУСТОЙ КОШЕЛЁК ----------
  await page.evaluate(() => {
    GameState.data.currencies.gold = 0;
    GameState.save();
    GreedMinigame.open();
  });
  await page.evaluate(() => GreedMinigame.veilReady());
  await settled();
  const sinBefore = (await state()).sin;
  await page.mouse.click(knob.x, knob.y);
  await page.waitForTimeout(300);
  const broke = await page.evaluate(() => ({
    gold: GameState.currency('gold'),
    spinning: GreedJunkLit.spinning(),
    sin: Math.round(GameState.sinValue('greed')),
    // денег нет — банка пуста: монета не летит, на скотче ноль
    flying: (GreedJunkLit._coins || []).length,
    jar: GreedJunkLit._jar && GreedJunkLit._jar.to
  }));
  check(broke.gold === 0 && !broke.spinning, 'без монет крутка не идёт и баланс не уходит в минус');
  check(broke.sin === sinBefore, 'несостоявшаяся крутка не наливает шкалу');
  check(broke.flying === 0 && broke.jar === 0, 'отказ показан самим автоматом: банка пуста, монете взяться неоткуда');
  await page.screenshot({ path: out + 'greed-2-broke.png' });

  // ---------- 8. СЫТЫЙ ЧЕРВЬ ПОЛУЧАЕТ ВЫПЛАТУ ----------
  // Порог голода режет НАГРАДЫ. Выплата автомата — не награда, а возврат
  // части своей же ставки: прогнать её через порог значит превратить
  // возврат 75% в чистый отъём монет.
  const full = await page.evaluate(() => {
    Backend.grantCurrency('gold', 3000);
    GameState.setSinValue('greed', GameState.maxValue('greed'));
    // Выплата — золото и жетоны по курсу из конфига: часть троек платит
    // жетоном вместо монет (docs/plan/28-greed-machine.md), и одно золото на
    // 1500 крутках иногда случайно проседало ниже коридора.
    const V = ECONOMY.minigames.greed.tokenValue || {};
    let paid = 0, spent = 0;
    for (let i = 0; i < 1500; i++) {
      const r = Backend.greedSpin();
      if (!r.ok) break;
      spent += r.cost; paid += r.pay;
      Object.keys(r.currencies || {}).forEach(k => { if (k !== 'gold') paid += (V[k] || 0) * r.currencies[k]; });
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

  // ---------- 10. УЗЕЛ АЛЧНОСТИ В КОЛЕСЕ ГРЕХОВ ----------
  // У автомата к общему правилу добавлено второе условие: монета в кошельке.
  // Горящий узел при пустом кошельке звал бы туда, где крутка не состоится.
  const node = await page.evaluate(() => {
    GameState.setSinValue('greed', 10);
    Backend.grantCurrency('gold', 50);
    const rich = SinsMenu.read('greed');
    GameState.data.currencies.gold = 0;
    const poor = SinsMenu.read('greed');
    GameState.setSinValue('greed', GameState.maxValue('greed'));
    Backend.grantCurrency('gold', 50);
    const full = SinsMenu.read('greed');
    return { rich, poor, full };
  });
  check(node.rich.ready, 'просевшая шкала и монеты в кошельке — узел горит');
  check(!node.poor.ready, 'без монет узел погашен: крутка бы не состоялась');
  check(!node.full.ready, 'полная шкала — узел погашен, как у всех грехов');
  check(node.rich.fill > node.full.fill, 'луч налит нехваткой греха');

  console.log(errors.length ? '\nошибки страницы:\n' + errors.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nПРОВАЛЕНО: ' + fail.length : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
