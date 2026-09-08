const { chromium } = require('playwright');

// ================= ПРОВЕРКА: НИ ОДНОГО СЛОВА =================
// Инвариант 9 (CLAUDE.md): в игре нет букв — интерфейс говорит значками,
// цветом, движением и числами. Здесь это проверяется машиной, а не глазами.
//
// ---------- ПОЧЕМУ ЖИВОЙ DOM, А НЕ ИСХОДНИКИ ----------
// Слово может приехать откуда угодно: из конфига, из шаблона, из каталога
// предметов. Grep по файлам ловит и комментарии (они по-русски и остаются
// такими), и строки, которые на экран не попадают. Поэтому сценарий обходит
// экраны и смотрит текстовые узлы там, где они реально видны.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-no-words.js /tmp/shots-
//
// Проверяются все переведённые экраны: гнев, кухня, сад, ванная, дорожка
// тщеславия и автомат алчности. Новый экран добавляется сюда сразу.
(async () => {
  // Без аргумента снимки идут во временную папку, а НЕ в корень проекта:
  // из-за `undefined` в пути тринадцать png однажды уехали прямо в репозиторий.
  const out = process.argv[2] || '/tmp/no-words-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  const found = {};
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const scan = (rootId) => page.evaluate((id) => {
    const bad = [];
    const root = document.getElementById(id || 'wrath-game');
    if (!root) return ['нет экрана ' + id];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.nodeValue || '').trim();
      if (!t || !/[A-Za-zА-Яа-яЁё]/.test(t)) continue;
      const el = node.parentElement;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      bad.push(`${el.className || el.id || el.tagName}: «${t.slice(0, 40)}»`);
    }
    return bad;
  });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);

  // ---------- КОМНАТА И МЕНЮ ГРЕХОВ ----------
  // Меню — экран, который игрок открывает чаще любой мини-игры, и оно
  // целиком построено на значках, цвете и свечении. Проверяется первым.
  found.room = await scan('game-container');
  await page.evaluate(() => SinsMenu.open());
  await page.waitForTimeout(400);
  found.sinsMenu = await scan('sins-menu');
  await page.screenshot({ path: out + 'nw-0-sins-menu.png' });
  await page.evaluate(() => SinsMenu.closeInstant());

  await page.evaluate(() => {
    Backend.grantCurrency('wrath_token', 6);
    Backend.grantCurrency('wrath_shard', 2);
    Backend.grantItem('rusty-blade');
    Backend.grantItem('bone-shiv');
    Backend.equip('weapon', 'rusty-blade');
    Backend.buyUpgrade('damage');
    GameManager.handleSinAction('wrath');
  });
  await page.waitForTimeout(900);

  found.lobby = await scan();
  await page.screenshot({ path: out + 'nw-1-lobby.png' });

  // карточка слота
  await page.evaluate(() => document.querySelector('.gear-slot[data-slot="weapon"]').click());
  await page.waitForTimeout(200);
  found.slotCard = await scan();
  await page.screenshot({ path: out + 'nw-2-slot.png' });
  await page.evaluate(() => document.querySelector('.gear-slot[data-slot="weapon"]').click());

  await page.evaluate(() => WrathMinigame.startMode('shop'));
  await page.waitForTimeout(300);
  found.shop = await scan();
  await page.screenshot({ path: out + 'nw-3-shop.png' });
  // отказ: покупаем самое дорогое
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.shop-item.poor .shop-buy');
    if (btns.length) btns[btns.length - 1].click();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + 'nw-4-shop-lack.png' });
  found.shopLack = await scan();

  await page.evaluate(() => { WrathMinigame.showLobby(); WrathMinigame.startMode('boost'); });
  await page.waitForTimeout(300);
  found.boost = await scan();
  await page.screenshot({ path: out + 'nw-5-boost.png' });

  await page.evaluate(() => { WrathMinigame.showLobby(); WrathMinigame.startMode('rogue'); });
  await page.waitForTimeout(300);
  found.rogueStart = await scan();
  await page.screenshot({ path: out + 'nw-6-rogue-intro.png' });

  await page.evaluate(() => document.getElementById('rogue-action').click());
  await page.waitForTimeout(300);
  found.rogueMap = await scan();
  await page.screenshot({ path: out + 'nw-7-rogue-map.png' });

  // бой внутри забега + вопрос при выходе
  await page.evaluate(() => document.querySelector('.rogue-node.current').click());
  await page.waitForTimeout(1100);
  found.duel = await scan();
  await page.screenshot({ path: out + 'nw-8-duel.png' });

  await page.evaluate(() => document.querySelector('#wrath-game .mg-close').click());
  await page.waitForTimeout(300);
  found.confirm = await scan();
  await page.screenshot({ path: out + 'nw-9-confirm.png' });
  await page.evaluate(() => document.querySelector('#wrath-game .mg-confirm-btn.stay').click());

  // добиваем бой, смотрим итог
  for (let r = 0; r < 20; r++) {
    if (await page.evaluate(() => WrathDuel.fightOver)) break;
    await page.evaluate(() => { const d = document.getElementById('dagger-btn'); d.click(); d.click(); d.click(); });
    await page.waitForTimeout(240);
  }
  await page.waitForTimeout(1400);
  found.duelResult = await scan();

  // ---------- ЧРЕВОУГОДИЕ: КУХНЯ ----------
  // Собиралась сразу без слов, поэтому проверяется с первого дня, а не после
  // отдельного перевода.
  await page.evaluate(() => {
    if (typeof WrathMinigame !== 'undefined' && WrathMinigame.close) WrathMinigame.close();
    GameManager.handleSinAction('gluttony');
  });
  await page.waitForTimeout(900);
  found.kitchen = await scan('gluttony-game');
  await page.screenshot({ path: out + 'nw-k1-kitchen.png' });

  // Холодильник открывается тапом по себе — кнопки нет и не должно быть.
  await page.evaluate(() => GluttonyMinigame.openFridge());
  await page.waitForTimeout(1400);
  found.fridge = await scan('gluttony-game');
  await page.screenshot({ path: out + 'nw-k2-fridge.png' });
  // ---------- ЛЕНЬ: САД ----------
  // Сад собирался сразу без слов: у прежней мини-игры внизу висела строка
  // «ПЕРЕТАЩИ ЛЕЙКУ НА ГОРШОК», и она же была единственным объяснением
  // происходящего. Раз объяснять теперь нечем, проверка обязана стоять с
  // первого дня.
  await page.evaluate(() => {
    if (typeof GluttonyMinigame !== 'undefined' && GluttonyMinigame.close) GluttonyMinigame.close();
    GameManager.handleSinAction('sloth');
  });
  await page.waitForTimeout(900);
  found.garden = await scan('sloth-game');
  await page.screenshot({ path: out + 'nw-s1-garden.png' });

  // Грядка со всем, что на ней может вырасти: сорняки, плод, отказ.
  await page.evaluate(() => {
    const b = GameState.data.garden.beds[0];
    b.stage = 'ripe'; b.species = 'tomato'; b.seed = 42; b.at = null;
    GameState.save();
    SlothMinigame.render();
  });
  await page.waitForTimeout(500);
  found.gardenRipe = await scan('sloth-game');
  await page.screenshot({ path: out + 'nw-s2-ripe.png' });

  // ---------- ПОХОТЬ: ВАННАЯ ----------
  // У прежней ванной на экране висели «ПОХОТЬ», «СВАЙПАЙ ХВОСТ ВВЕРХ-ВНИЗ»
  // и «Нагрешил!» — три слова там, где хватает движения. Новая собрана без
  // них, и проверка стоит здесь, чтобы они не вернулись.
  await page.evaluate(() => {
    if (typeof SlothMinigame !== 'undefined' && SlothMinigame.close) SlothMinigame.close();
    GameManager.handleSinAction('lust');
  });
  await page.waitForTimeout(900);
  found.bath = await scan('lust-game');
  await page.screenshot({ path: out + 'nw-l1-bath.png' });

  // Ванна с водой: этап мытья со всем, что на нём появляется.
  await page.evaluate(() => LustMinigame.startWater());
  await page.waitForTimeout(2800);
  found.bathWash = await scan('lust-game');
  await page.screenshot({ path: out + 'nw-l2-wash.png' });

  // ---------- ТЩЕСЛАВИЕ: КОВРОВАЯ ДОРОЖКА ----------
  // У прежней мини-игры на экране висели «ТЩЕСЛАВИЕ», «ВЕЛИКОЛЕПНО!» и «Все
  // тобой восхищаются!». Дорожка собрана без них: счёт и ценники — цифры,
  // старт — лужа света, прогресс — сама дорожка. Проверяются ОБА состояния:
  // стойка у машины с ценниками и сам выход со счётом.
  await page.evaluate(() => {
    if (typeof LustMinigame !== 'undefined' && LustMinigame.close) LustMinigame.close();
    Backend.grantCurrency('pride_kiss', 60);
    GameManager.handleSinAction('pride');
  });
  await page.waitForTimeout(1200);
  found.wardrobe = await scan('pride-game');
  await page.screenshot({ path: out + 'nw-p1-wardrobe.png' });

  // Витрина: восемь предметов с ценами и три линии прокачки. Место, где
  // соблазн подписать «купить» и «не хватает» сильнее всего.
  await page.evaluate(() => { PrideMinigame.storeOpen = true; PrideMinigame.renderStore(); });
  await page.waitForTimeout(300);
  found.storeWear = await scan('pride-game');
  await page.screenshot({ path: out + 'nw-p2-store.png' });
  await page.evaluate(() => { PrideMinigame.storeTab = 'boost'; PrideMinigame.renderStore(); });
  await page.waitForTimeout(300);
  found.storeBoost = await scan('pride-game');
  await page.evaluate(() => { PrideMinigame.storeOpen = false; PrideMinigame.renderStore(); });

  // Отсчёт перед выходом — единственное место, где на экране крупные цифры.
  await page.evaluate(() => PrideMinigame.startShow());
  await page.waitForTimeout(1000);
  found.count = await scan('pride-game');
  await page.screenshot({ path: out + 'nw-p3-count.png' });
  await page.waitForTimeout(2000);
  found.carpetRun = await scan('pride-game');
  await page.screenshot({ path: out + 'nw-p2-run.png' });

  // ---------- АЛЧНОСТЬ: АВТОМАТ ----------
  // У прежнего автомата на экране висели «АЛЧНОСТЬ», «FORTUNA» и
  // «Нагрешил!». Новый собран без них: за что платят — три значка и число,
  // сколько заплатили — число, сколько монет в кошельке — число. Цифра не
  // слово (инвариант 9), а вот буквы в маркизе и на табличке были словами.
  await page.evaluate(() => {
    if (typeof PrideMinigame !== 'undefined' && PrideMinigame.close) PrideMinigame.close();
    Backend.grantCurrency('gold', 50);
    GameManager.handleSinAction('greed');
  });
  await page.waitForTimeout(800);
  found.slots = await scan('slots-game');
  await page.screenshot({ path: out + 'nw-g1-slots.png' });

  // Крутка с выплатой: дождь монет и число выплаты — второе состояние
  // экрана, и слов там тоже быть не должно.
  await page.evaluate(() => {
    GreedMinigame.showWin({ pay: 13, jackpot: false }, GreedMinigame.spinGeneration);
  });
  await page.waitForTimeout(400);
  found.slotsWin = await scan('slots-game');
  await page.screenshot({ path: out + 'nw-g2-slots-win.png' });

  await page.evaluate(() => {
    if (typeof GreedMinigame !== 'undefined' && GreedMinigame.close) GreedMinigame.close();
    GameManager.handleSinAction('wrath');
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: out + 'nw-10-result.png' });
  await page.evaluate(() => document.getElementById('wrath-ok-btn').click());
  await page.waitForTimeout(400);
  found.afterFight = await scan();
  await page.screenshot({ path: out + 'nw-11-after.png' });

  console.log(JSON.stringify({ found, errors }, null, 1));
  await browser.close();
})();
