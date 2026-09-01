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
// Проверяются гнев (первый переведённый грех) и чревоугодие (собрано сразу
// без слов). По мере перевода остальных сюда добавляются их экраны.
(async () => {
  // Без аргумента снимки идут во временную папку, а НЕ в корень проекта:
  // из-за `undefined` в пути тринадцать png однажды уехали прямо в репозиторий.
  const out = process.argv[2] || '/tmp/no-words-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
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

  const found = {};
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

  await page.evaluate(() => {
    if (typeof SlothMinigame !== 'undefined' && SlothMinigame.close) SlothMinigame.close();
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
