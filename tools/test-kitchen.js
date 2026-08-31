const { chromium } = require('playwright');

// ================= ПРОВЕРКА: КУХНЯ ЧРЕВОУГОДИЯ =================
// Проходит полный цикл готовки в браузере и смотрит, что начислилось.
// Ловит ровно то, что глазами ловится последним: не сломалась ли передача
// «что сварили» в конфиг наград и списываются ли продукты.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-kitchen.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/kitchen-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const say = (s) => console.log(s);

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);

  const before = await page.evaluate(() => ({
    pantry: Object.assign({}, GameState.data.pantry),
    shards: GameState.currency('glut_shard')
  }));
  say('кладовая до: ' + JSON.stringify(before.pantry));

  await page.evaluate(() => GameManager.handleSinAction('gluttony'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + '1-overview.png' });

  // Холодильник
  await page.click('#kt-fridge');
  await page.waitForTimeout(900);
  const items = await page.$$eval('#kt-shelves .kt-item', els => els.map(e => e.dataset.key));
  say('в холодильнике: ' + items.join(', '));
  await page.screenshot({ path: out + '2-fridge.png' });

  // Берём по одному из каждого типа — это блюдо на три типа.
  const pick = await page.evaluate(() => {
    const seen = {};
    const keys = [];
    document.querySelectorAll('#kt-shelves .kt-item').forEach(el => {
      const t = KITCHEN.ingredients[el.dataset.key].type;
      if (t === 'block' || seen[t]) return;
      seen[t] = true; keys.push(el.dataset.key);
      el.click();
    });
    return keys;
  });
  say('выбрано: ' + pick.join(', '));
  await page.click('#kt-confirm');
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + '3-board.png' });

  // Нарезка: качели пальцем над доской, пока очередь не кончится.
  const swing = async (sel) => {
    const box = await page.$eval(sel, el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height };
    });
    await page.mouse.move(box.x, box.y - box.h * 0.3);
    await page.mouse.down();
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(box.x, box.y + (i % 2 ? -1 : 1) * box.h * 0.3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  };
  for (let round = 0; round < 6; round++) {
    if (await page.evaluate(() => GluttonyMinigame.phase !== 'board')) break;
    await swing('#kt-board');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(700);
  say('фаза после нарезки: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '4-stove.png' });

  // Жидкость крепче воды, если есть.
  await page.evaluate(() => {
    const rich = Array.from(document.querySelectorAll('#kt-bottle, .kt-bottle'))
      .find(el => !el.classList.contains('empty') && !KITCHEN.liquids[el.dataset.key].plain);
    (rich || document.querySelector('.kt-bottle')).click();
  });
  await page.waitForTimeout(700);

  // Закладка кучек в кастрюлю.
  for (let i = 0; i < 5; i++) {
    const has = await page.$('.kt-pile');
    if (!has) break;
    const from = await page.$eval('.kt-pile', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const to = await page.$eval('#kt-pot', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  say('в кастрюле: ' + await page.evaluate(() => GluttonyMinigame.inPot));
  await page.screenshot({ path: out + '5-pot.png' });

  // Помешивание.
  for (let round = 0; round < 4; round++) {
    if (await page.evaluate(() => GluttonyMinigame.phase !== 'stove')) break;
    await swing('#kt-stir');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(900);
  say('фаза после помешивания: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '6-feed.png' });

  // Кормёжка: наклонить кастрюлю и держать.
  const pot = await page.$eval('#glut-tilt-bucket', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(pot.x, pot.y);
  await page.mouse.down();
  await page.mouse.move(pot.x, pot.y + 120, { steps: 8 });
  await page.waitForTimeout(9000);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '7-result.png' });

  const after = await page.evaluate(() => ({
    finished: GluttonyMinigame.feedFinished,
    pantry: Object.assign({}, GameState.data.pantry),
    shards: GameState.currency('glut_shard'),
    tokens: GameState.currency('glut_token'),
    sin: Math.round(GameState.sinValue('gluttony')),
    poopSize: GameState.data.digestion.poop_size,
    fed: !!GameState.data.digestion.fed_at
  }));
  say('\nнакормлен: ' + after.finished + '   шкала греха: ' + after.sin);
  say('кладовая после: ' + JSON.stringify(after.pantry));
  say('осколки: ' + after.shards + '   жетоны: ' + after.tokens);
  say('кучка будет размером: ' + after.poopSize + '   пищеварение идёт: ' + after.fed);

  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
