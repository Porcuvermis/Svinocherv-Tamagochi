const { chromium } = require('playwright');

// ================= ПРОВЕРКА: ЛОББИ, ПРИЛАВОК, ПРОКАЧКА =================
// Что здесь проверяется числом, а не глазами:
//
//   • панель бойца обновляет полосу и число здоровья, не перестраиваясь;
//   • тап по запертому бою вздрагивает панелью (драться нечем);
//   • купленный предмет УХОДИТ с прилавка;
//   • недоступный по деньгам виден, но не выглядит кнопкой, и тап по нему
//     всё равно вздрагивает валютой, которой не хватило;
//   • заготовка разблокировки: предмет с невыполненным условием исчезает
//     из магазина совсем (Backend.isUnlocked).
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-lobby-shop.js /tmp/shots-

(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => {
    Backend.grantCurrency('wrath_token', 4);
    ['rusty-blade','pot-helmet','hide-armor','work-gloves'].forEach(id => Backend.grantItem(id));
    Backend.equip('weapon','rusty-blade'); Backend.equip('helmet','pot-helmet');
    Backend.equip('gloves','work-gloves'); Backend.equip('armor','hide-armor');
    Backend.buyUpgrade('damage'); Backend.buyUpgrade('hp');
    GameManager.handleSinAction('wrath');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + 'lb-1-lobby.png' });

  // побитый червь: полоса и запертый бой
  await page.evaluate(() => { Backend.setFighterHp(2); WrathLobby.refreshHealth(); });
  await page.waitForTimeout(300);
  const hurt = await page.evaluate(() => ({
    num: document.getElementById('wrath-hp-num').textContent,
    width: document.getElementById('wrath-hp-fill').style.width,
    duelLocked: document.querySelector('.mode-btn[data-mode="duel"]').className
  }));
  await page.evaluate(() => { Backend.setFighterHp(0); WrathLobby.refreshHealth();
                              document.querySelector('.mode-btn[data-mode="duel"]').click(); });
  await page.waitForTimeout(150);
  const flash = await page.evaluate(() => document.getElementById('wrath-panel').className);
  await page.screenshot({ path: out + 'lb-2-hurt.png' });

  await page.evaluate(() => { Backend.setFighterHp(99); WrathMinigame.startMode('shop'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + 'lb-3-shop.png' });
  const shop = await page.evaluate(() => ({
    rows: document.querySelectorAll('.shop-item').length,
    poor: document.querySelectorAll('.shop-item.poor').length,
    hasBought: !!document.querySelector('[data-item="rusty-blade"]')
  }));
  // тап по недоступному: должен вспыхнуть кошелёк
  await page.evaluate(() => { const el = document.querySelector('.shop-item.poor'); if (el) el.click(); });
  await page.waitForTimeout(150);
  const lack = await page.evaluate(() => !!document.querySelector('.wallet-item.lack'));
  await page.screenshot({ path: out + 'lb-4-shop-lack.png' });

  await page.evaluate(() => { WrathMinigame.showLobby(); WrathMinigame.startMode('boost'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + 'lb-5-boost.png' });
  const boost = await page.evaluate(() => ({
    rows: document.querySelectorAll('.boost-item').length,
    poor: document.querySelectorAll('.boost-item.poor').length
  }));

  // заготовка разблокировки: ставим условие и проверяем, что предмет исчез
  const unlock = await page.evaluate(() => {
    const before = document.querySelectorAll('.shop-item').length;
    WRATH_GEAR.items['bone-shiv'].unlock = { counter: 'wrath.duel.fights', at: 99 };
    WrathMinigame.showLobby(); WrathMinigame.startMode('shop');
    const after = document.querySelectorAll('.shop-item').length;
    delete WRATH_GEAR.items['bone-shiv'].unlock;
    return { before, after };
  });

  console.log(JSON.stringify({ hurt, flash, shop, lack, boost, unlock, errors }, null, 1));
  await browser.close();
})();
