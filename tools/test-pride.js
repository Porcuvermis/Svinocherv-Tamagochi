const { chromium } = require('playwright');

// ================= ПРОВЕРКА: ВЫХОД ПО КОВРОВОЙ ДОРОЖКЕ =================
// Открывает тщеславие и играет за игрока с заданной точностью: тапает в
// центр той зоны, которой осталось жить меньше всех, а с вероятностью
// (1 − точность) намеренно мажет мимо всех зон.
//
// Проверяется ЧЕТЫРЕ вещи, и каждая ловилась глазами плохо:
//   • выход кончается сам и ровно за 20 секунд — дорожка и есть шкала;
//   • поцелуи растут с ажиотажем, а не по одному за зону;
//   • начисление доехало до кошелька через конфиг наград, а не из игры;
//   • покупка на поцелуи меняет числа СЛЕДУЮЩЕГО выхода.
//
// Тапает по координатам сцены, переведённым в экранные, — заодно проверка,
// что перевод «экран → сцена» не врёт.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-pride.js 1.0     # безошибочная игра
//     node tools/test-pride.js 0.85    # нормальный игрок
(async () => {
  const accuracy = parseFloat(process.argv[2] || '0.85');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => GameManager.handleSinAction('pride'));
  await page.waitForTimeout(1000);

  const params = await page.evaluate(() => PrideMinigame.params);
  const wardrobe = await page.evaluate(() => ({
    фаза: PrideMinigame.phase,
    слотов: document.querySelectorAll('#pr-ui .pr-slot').length,
    старт: !!document.querySelector('#pr-start-btn'),
    магазин: !!document.querySelector('#pr-shop-btn')
  }));
  console.log(`костюмерная: ${wardrobe.фаза}, слотов ${wardrobe.слотов}, ` +
              `кнопка старта ${wardrobe.старт ? 'есть' : 'НЕТ'}, ` +
              `магазин ${wardrobe.магазин ? 'есть' : 'НЕТ'}`);
  console.log(`выход: ${params.runMs / 1000} с   зона каждые ${params.spawnMs} мс   ` +
              `радиус ${params.radius}   потолок ×${params.multCap}`);

  // Точка сцены → экран: тем же преобразованием, которым игра переводит тап
  // обратно. Если оно врёт, тест мажет мимо всех зон и это сразу видно.
  const toScreen = (p) => page.evaluate(([x, y]) => {
    const m = PrideMinigame.svgEl.getScreenCTM();
    const pt = PrideMinigame.svgEl.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(m);
    return { x: s.x, y: s.y };
  }, [p.x, p.y]);

  // Старт — кнопка под червём в костюмерной. Дальше смена декораций и
  // отсчёт: до первой зоны игра доходит сама, тест только ждёт.
  const btn = await page.evaluate(() => {
    const b = document.querySelector('#pr-start-btn').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(btn.x, btn.y);
  await page.waitForFunction(() => PrideMinigame.phase === 'run', null, { timeout: 8000 });
  const started = Date.now();

  // Главная проверка новых правил, и её нельзя заменить чтением кода:
  // поцелуйная зона НЕ ИМЕЕТ ПРАВА висеть на экране, пока стрик нулевой.
  // Считаем кадры, где это правило нарушено, — их обязано быть ноль.
  let taps = 0, maxOnScreen = 0, closedWithKiss = 0, kissSeen = 0, maxStreak = 0;
  while (Date.now() - started < 40000) {
    const shot = await page.evaluate(() => ({
      phase: PrideMinigame.phase,
      kisses: PrideMinigame.kisses,
      streak: PrideMinigame.streak,
      targets: PrideMinigame.targets.slice()
        .sort((a, b) => a.diesAt - b.diesAt)
        .map(t => ({ x: t.x, y: t.y, kiss: t.kiss }))
    }));
    if (shot.phase !== 'run') break;
    maxOnScreen = Math.max(maxOnScreen, shot.targets.length);
    maxStreak = Math.max(maxStreak, shot.streak);
    const kissesUp = shot.targets.filter(t => t.kiss).length;
    kissSeen += kissesUp;
    if (!shot.streak && kissesUp) closedWithKiss++;
    if (shot.targets.length) {
      const t = shot.targets[0];
      // Промах моделируем честно: тапаем туда, куда не дотягивается ни одна
      // живая зона, — так же, как мажет живой палец. Точка ИЩЕТСЯ, а не
      // берётся из угла: угол кадра при обрезке холста может оказаться за
      // пределами видимой области, и тогда тап уходит мимо игры вовсе —
      // «промахов: 0» при точности 85% ловится только так.
      const miss = Math.random() >= accuracy;
      let aim = t;
      if (miss) {
        const cands = [{ x: 60, y: 300 }, { x: 330, y: 300 }, { x: 195, y: 780 },
                       { x: 60, y: 760 }, { x: 330, y: 760 }];
        aim = cands.map(c => ({
          c, d: Math.min(...shot.targets.map(z => Math.hypot(z.x - c.x, z.y - c.y)))
        })).sort((a, b) => b.d - a.d)[0].c;
      }
      const pt = await toScreen(aim);
      await page.mouse.click(pt.x, pt.y);
      taps++;
    }
    await page.waitForTimeout(70);
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);

  await page.waitForTimeout(600);
  const res = await page.evaluate(() => ({
    phase: PrideMinigame.phase,
    hits: PrideMinigame.hits, misses: PrideMinigame.misses,
    awarded: PrideMinigame.awardedKisses,
    sin: Math.round(GameState.sinValue('pride')),
    kiss: GameState.currency('pride_kiss'),
    gold: GameState.currency('gold')
  }));

  console.log(`тапов: ${taps}   попаданий: ${res.hits}   промахов: ${res.misses}   ` +
              `зон на экране разом: ${maxOnScreen}`);
  console.log(`выход занял ${sec} с   собрано поцелуев: ${res.awarded}`);
  // ---------- РАЗРЫВ ОБЯЗАН ЧИСТИТЬ ЭКРАН ----------
  // Пока он гасил только розовые, мисклик не стоил ничего: игрок тыкал в
  // пустоту при живой белой зоне, тут же добивал её и возвращал стрик. Ловится
  // это только так — тапом в пустоту при заведомо живой зоне.
  const wipe = await page.evaluate(async () => {
    const was = PrideMinigame.phase;
    PrideMinigame.phase = 'run';
    PrideMinigame.streak = 0;
    PrideMinigame.clearTargets();
    PrideMinigame.spawnTarget();
    const before = PrideMinigame.targets.length;
    PrideMinigame.registerMissclick();
    const after = PrideMinigame.targets.length;
    PrideMinigame.clearTargets();
    PrideMinigame.phase = was;
    return { before, after };
  });
  console.log(`разрыв: зон до ${wipe.before}, после ${wipe.after}   ` +
              (wipe.before && !wipe.after ? 'экран чистится'
                                          : '✗ ЗОНЫ ПЕРЕЖИЛИ РАЗРЫВ'));

  console.log(`стрик доходил до ${maxStreak}   поцелуйных зон замечено ${kissSeen}   ` +
              (closedWithKiss ? `✗ ПОЦЕЛУЙ ПРИ НУЛЕВОМ СТРИКЕ: ${closedWithKiss} кадров`
                              : 'при нулевом стрике поцелуев не было — правило держится'));
  console.log(`начислено: шкала греха ${res.sin}   поцелуи ${res.kiss}   золото ${res.gold}`);

  // ---------- ПОРОГ ГОЛОДА ----------
  // Главное правило антифарма, и проверять его надо в обе стороны: сытому
  // червю не платят И не спавнят поцелуйных зон, голодному — платят целиком,
  // без всяких долей.
  const gate = await page.evaluate(() => {
    const out = {};
    const was = PrideMinigame.phase;
    ['сыт', 'голоден'].forEach((label, i) => {
      GameState.setSinValue('pride', i ? 20 : 100);
      PrideMinigame.params = Backend.prideRun();
      PrideMinigame.phase = 'run';
      PrideMinigame.streak = 5;
      PrideMinigame.clearTargets();
      // Сорок попыток: доля поцелуйных зон 1 из 4, и ни одной при сытом черве
      // быть не должно ни разу.
      for (let n = 0; n < 40; n++) PrideMinigame.spawnTarget();
      out[label] = {
        платят: PrideMinigame.params.pays,
        поцелуйных: PrideMinigame.targets.filter(t => t.kiss).length
      };
      PrideMinigame.clearTargets();
    });
    PrideMinigame.phase = was;
    return out;
  });
  const gateOk = !gate['сыт'].платят && !gate['сыт'].поцелуйных &&
                 gate['голоден'].платят && gate['голоден'].поцелуйных > 0;
  console.log(`порог: сыт — платят ${gate['сыт'].платят}, поцелуйных зон ${gate['сыт'].поцелуйных};  ` +
              `голоден — платят ${gate['голоден'].платят}, поцелуйных ${gate['голоден'].поцелуйных}   ` +
              (gateOk ? 'правило держится' : '✗ ПОРОГ НЕ РАБОТАЕТ'));

  // Начисление при сытом черве: шкала закрывается, кошелёк не трогается.
  const fed = await page.evaluate(async () => {
    GameState.setSinValue('pride', 100);
    const before = GameState.currency('pride_kiss');
    await Backend.minigameResult({ sin: 'pride', mode: 'parade', outcome: 'win',
                                   meta: { kisses: 14, hits: 20, misses: 0 } });
    return { before, after: GameState.currency('pride_kiss'),
             шкала: Math.round(GameState.sinValue('pride')) };
  });
  console.log(`сытый выход: собрал 14, кошелёк ${fed.before} → ${fed.after}, шкала ${fed.шкала}   ` +
              (fed.before === fed.after && fed.шкала === 100
                ? 'не заплатили, но шкалу закрыли' : '✗ НЕ ТО'));

  // ---------- ПОКУПКА ----------
  // Проверяем не «списались ли деньги», а то, ради чего покупка существует:
  // числа следующего выхода обязаны стать другими.
  const buy = await page.evaluate(() => {
    Backend.grantCurrency('pride_kiss', 300);
    const before = Backend.prideRun();
    const a = Backend.buyUpgrade('crowd', 'pride');
    const b = Backend.buyUpgrade('car', 'pride');
    const c = Backend.buyUpgrade('carpet', 'pride');
    PrideMinigame.resetRun();
    const after = Backend.prideRun();
    return { ok: a.ok && b.ok && c.ok, before, after, wallet: GameState.currency('pride_kiss') };
  });
  console.log(`покупка: интервал ${buy.before.spawnMs} → ${buy.after.spawnMs} мс   ` +
              `потолок ×${buy.before.multCap} → ×${buy.after.multCap}   ` +
              `радиус ${buy.before.radius} → ${buy.after.radius}   осталось 💋 ${buy.wallet}`);

  // ---------- НАРЯД ----------
  // Проверяется не «списались ли поцелуи», а то, ради чего наряд есть:
  // купленное надевается и оказывается НА ТЕЛЕ — в самой мини-игре и в
  // комнате, то есть везде.
  const dress = await page.evaluate(() => {
    Backend.grantCurrency('pride_kiss', 3000);
    const buy = Backend.buyWardrobe('top-hat');
    PrideMinigame.refreshWorm();
    return { ok: buy.ok, надето: GameState.data.cosmetics.head };
  });
  await page.waitForTimeout(600);
  const onBody = await page.evaluate(() => ({
    вИгре: document.querySelectorAll('#pr-worm [data-cosmetic]').length,
    вКомнате: document.querySelectorAll('#worm-stage [data-cosmetic]').length
  }));
  console.log(`наряд: куплен ${dress.ok}, надет «${dress.надето}», ` +
              `на червe в игре ${onBody.вИгре}, в комнате ${onBody.вКомнате}`);

  // ---------- ВИТРИНА ПО СЛОТАМ И ИНВЕНТАРЬ СЛОТА ----------
  // Проверяется не «нарисовалось ли», а два правила раскладки: на полке
  // лежат предметы ТОЛЬКО своего слота, а в инвентаре последняя строка —
  // всегда «ничего», сколько бы вещей ни было куплено.
  const shop = await page.evaluate(() => {
    PrideMinigame.openSlot = null;
    PrideMinigame.storeOpen = true;
    const out = { полки: {} };
    const owned = GameState.data.wardrobe || {};
    PRIDE_WARDROBE.slots.forEach(sl => {
      PrideMinigame.storeTab = sl.key;
      PrideMinigame.renderStore();
      const ids = [...document.querySelectorAll('.pr-item')].map(e => e.dataset.item);
      const ждём = PRIDE_WARDROBE.items
        .filter(i => i.slot === sl.key && !owned[i.id]).map(i => i.id);
      // Полка обязана показывать РОВНО некупленное своего слота: ни чужого
      // слота, ни того, за что уже заплачено (иначе витрина работает второй
      // раздевалкой — тап по своей же шляпе её надевает).
      out.полки[sl.key] = ids.join() === ждём.join();
    });
    PrideMinigame.storeTab = 'boost';
    PrideMinigame.renderStore();
    out.прокачка = document.querySelectorAll('.pr-boost').length;
    PrideMinigame.storeOpen = false;
    return out;
  });
  const shelvesOk = Object.values(shop.полки).every(Boolean) && shop.прокачка === 3;
  console.log(`витрина: полок ${Object.keys(shop.полки).length}, на каждой ровно некупленное ` +
              `своего слота ${Object.values(shop.полки).every(Boolean)}, ` +
              `линий прокачки ${shop.прокачка}   ` +
              (shelvesOk ? 'ок' : '✗ ПОЛКИ НЕ ТЕ'));

  // Полка, раскупленная целиком, обязана быть ПУСТОЙ — и не сломанной:
  // вместо карточек там галочка.
  const sold = await page.evaluate(() => {
    PRIDE_WARDROBE.items.filter(i => i.slot === 'head')
      .forEach(i => { GameState.data.wardrobe[i.id] = true; });
    PrideMinigame.storeOpen = true;
    PrideMinigame.storeTab = 'head';
    PrideMinigame.renderStore();
    const out = { карточек: document.querySelectorAll('.pr-item').length,
                  галочка: PrideMinigame.storeEl.innerHTML.includes('✓') };
    PrideMinigame.storeOpen = false;
    PrideMinigame.renderStore();
    return out;
  });
  console.log(`раскупленная полка: карточек ${sold.карточек}, галочка ${sold.галочка}   ` +
              (!sold.карточек && sold.галочка ? 'ок' : '✗ НЕ ТО'));

  const inv = await page.evaluate(() => {
    // Пустой шкаф: в слоте, где ничего не куплено, строка должна быть одна.
    const empty = (() => {
      PrideMinigame.openSlot = 'tail';
      PrideMinigame.renderStore();
      return [...document.querySelectorAll('.pr-slot-item')].map(e => e.dataset.slotItem);
    })();
    // Полный: две шляпы + «ничего», и «ничего» — последняя строка.
    Backend.buyWardrobe('shades');
    PrideMinigame.openSlot = 'head';
    PrideMinigame.renderStore();
    const rows = [...document.querySelectorAll('.pr-slot-item')].map(e => e.dataset.slotItem);
    // Выбор пустой строки = снять.
    PrideMinigame.pickSlotItem('');
    const afterNude = GameState.data.cosmetics.head || null;
    PrideMinigame.openSlot = null;
    PrideMinigame.renderStore();
    return { empty, rows, afterNude };
  });
  const invOk = inv.empty.length === 1 && inv.empty[0] === '' &&
                inv.rows.length === 3 && inv.rows[inv.rows.length - 1] === '' &&
                inv.afterNude === null;
  console.log(`инвентарь слота: пустой шкаф — строк ${inv.empty.length}; ` +
              `две шляпы — строки [${inv.rows.join(', ')}]; пустая строка снимает ${inv.afterNude === null}   ` +
              (invOk ? 'ок' : '✗ НЕ ТО'));

  const bad = [];
  if (!dress.ok || dress.надето !== 'top-hat') bad.push('наряд не купился или не надет');
  if (!onBody.вИгре) bad.push('купленный наряд не появился на червe в игре');
  if (!onBody.вКомнате) bad.push('купленный наряд не появился на червe в комнате');
  if (res.phase !== 'done' && res.phase !== 'wardrobe') bad.push('выход не завершился сам');
  if (wardrobe.фаза !== 'wardrobe') bad.push('игра открылась не костюмерной');
  if (wardrobe.слотов !== 4) bad.push(`слотов наряда ${wardrobe.слотов} вместо четырёх`);
  if (!wardrobe.старт || !wardrobe.магазин) bad.push('нет кнопки старта или магазина');
  if (Math.abs(sec - params.runMs / 1000) > 4) bad.push(`длина выхода ${sec} с вместо ${params.runMs / 1000}`);
  if (res.sin !== 100) bad.push('шкала греха не закрылась');
  if (!buy.ok) bad.push('покупка не прошла');
  if (buy.after.spawnMs >= buy.before.spawnMs) bad.push('массовка не участила зоны');
  if (buy.after.multCap <= buy.before.multCap) bad.push('машина не подняла потолок');
  if (buy.after.radius <= buy.before.radius) bad.push('дорожка не расширила зоны');
  if (accuracy > 0.9 && res.awarded < 8) bad.push('безошибочная игра принесла подозрительно мало');

  console.log(bad.length ? 'ПРОВАЛ:\n  ' + bad.join('\n  ') : 'ВСЁ СОШЛОСЬ');
  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }

  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})();
