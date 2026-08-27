const { chromium } = require('playwright');

// ============ ПРОВЕРКА: ВКЛАДКИ, СИЛУЭТЫ, ШЕСТОЕ ЧУВСТВО ============
// Что проверяется числом:
//
//   • пустые слоты рисуют силуэты, а не значки;
//   • вкладки прилавка считают «куплено из всего» и переключаются;
//   • меню прокачки разделено на числа и способности;
//   • купленная пассивка уходит из меню и появляется в панели лобби;
//   • ГЛАВНОЕ: за тридцать раундов помеченная зона ни разу не совпадает с
//     зоной удара противника, и отметка в разметке стоит на нужной зоне.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-passive-sense.js /tmp/shots-
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => { Backend.grantCurrency('wrath_token', 9); GameManager.handleSinAction('wrath'); });
  await page.waitForTimeout(900);

  const lobby = await page.evaluate(() => ({
    shapes: document.querySelectorAll('#wrath-lobby .gear-slot .slot-shape').length,
    slots: document.querySelectorAll('#wrath-lobby .gear-slot').length
  }));
  await page.screenshot({ path: out + 's-1-lobby.png' });

  await page.evaluate(() => WrathMinigame.startMode('shop'));
  await page.waitForTimeout(400);
  const shop = await page.evaluate(() => ({
    tabs: Array.prototype.map.call(document.querySelectorAll('.shop-tab'),
      el => el.dataset.tab + ':' + el.querySelector('.shop-tab-count').textContent + (el.classList.contains('on') ? '*' : '')),
    rows: document.querySelectorAll('.shop-item').length
  }));
  await page.screenshot({ path: out + 's-2-shop.png' });
  // переключение вкладки
  const switched = await page.evaluate(() => {
    document.querySelector('.shop-tab[data-tab="shield"]').click();
    return { tab: WrathShop.tab, rows: document.querySelectorAll('.shop-item').length };
  });
  await page.screenshot({ path: out + 's-3-shop-shield.png' });

  await page.evaluate(() => { WrathMinigame.showLobby(); WrathMinigame.startMode('boost'); });
  await page.waitForTimeout(400);
  const boostStat = await page.evaluate(() => ({
    tabs: document.querySelectorAll('#boost-tabs .shop-tab').length,
    rows: document.querySelectorAll('.boost-item').length
  }));
  await page.screenshot({ path: out + 's-4-boost.png' });

  const boostPassive = await page.evaluate(() => {
    document.querySelector('#boost-tabs .shop-tab[data-tab="passive"]').click();
    return {
      rows: document.querySelectorAll('.boost-item').length,
      poor: document.querySelectorAll('.boost-item.poor').length
    };
  });
  await page.screenshot({ path: out + 's-5-passives.png' });

  // покупаем шестое чувство
  const bought = await page.evaluate(() => {
    document.querySelector('.boost-item[data-key="sixth_sense"]').click();
    return {
      level: GameState.upgradeLevel('sixth_sense'),
      rowsLeft: document.querySelectorAll('.boost-item').length,
      tokens: GameState.currency('wrath_token')
    };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + 's-6-bought.png' });

  const panel = await page.evaluate(() => {
    WrathMinigame.showLobby();
    return document.querySelector('.panel-passives') ? document.querySelector('.panel-passives').textContent.trim() : null;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + 's-7-lobby-passive.png' });

  // бой: план заранее, помеченная зона не совпадает с атакой врага
  await page.evaluate(() => WrathMinigame.startMode('duel'));
  await page.waitForTimeout(1600);
  const fight = await page.evaluate(() => {
    const rounds = [];
    for (let i = 0; i < 30; i++) {
      const safe = WrathDuel.safeZone;
      const attack = WrathDuel.enemyPlan && WrathDuel.enemyPlan.attack;
      const marked = document.querySelector('.player-zone.safe');
      rounds.push({
        safe, attack, ok: safe !== attack,
        markedMatches: marked ? marked.dataset.zone === safe : false
      });
      // новый план на следующий раунд
      WrathDuel.planEnemyRound();
    }
    return {
      allSafe: rounds.every(r => r.ok),
      allMarked: rounds.every(r => r.markedMatches),
      sample: rounds.slice(0, 3)
    };
  });
  await page.screenshot({ path: out + 's-8-duel.png' });

  console.log(JSON.stringify({ lobby, shop, switched, boostStat, boostPassive, bought, panel, fight, errors }, null, 1));
  await browser.close();
})();
